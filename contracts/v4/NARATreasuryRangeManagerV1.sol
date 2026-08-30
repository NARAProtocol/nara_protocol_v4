// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/StateLibrary.sol";
import {SqrtPriceMath} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/SqrtPriceMath.sol";
import {TickMath} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/TickMath.sol";
import {Currency} from "@uniswap/v4-periphery/lib/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolKey.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

interface INARATreasuryPositionManager {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function nextTokenId() external view returns (uint256);
    function poolManager() external view returns (IPoolManager);
    function permit2() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128 liquidity);
}

interface INARATreasuryPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
    function allowance(address owner, address token, address spender)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce);
}

interface INARATreasuryHookBinding {
    function token() external view returns (address);
    function base() external view returns (address);
    function vault() external view returns (address);
    function poolManager() external view returns (IPoolManager);
    function CANONICAL_POOL_FEE() external view returns (uint24);
    function CANONICAL_TICK_SPACING() external view returns (int24);
    function poolRegistered() external view returns (bool);
    function registeredPoolId() external view returns (PoolId);
    function tokenIsCurrency0() external view returns (bool);
    function getHookPermissions() external view returns (Hooks.Permissions memory permissions);
}

interface INARATreasuryVaultBinding {
    function token() external view returns (address);
    function base() external view returns (address);
    function hook() external view returns (address);
}

/// @title NARA Treasury Range Manager V1
/// @notice Safe-controlled one-sided NARA/USDC Uniswap v4 positions with permissionless terminal settlement.
/// @dev This periphery is intentionally bound to one immutable pool and one immutable Safe. It does not modify,
///      rebalance, or share custody with the permanent POL Compounder. V1 settlement is a separate transaction:
///      only a position that has actually been burned is protected from a later price reversal.
contract NARATreasuryRangeManagerV1 is ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    uint256 public constant MAX_SETTLE_BATCH = 16;
    uint256 public constant MAX_ACTIVE_PAGE_SIZE = 100;

    enum OrderSide {
        SellNara,
        BuyNara
    }

    enum OrderStatus {
        None,
        Active,
        Settled,
        Cancelled
    }

    struct RangeOrder {
        uint256 tokenId;
        uint256 inputAmount;
        uint256 minimumOutputAmount;
        bytes32 strategyHash;
        uint128 liquidity;
        int24 tickLower;
        int24 tickUpper;
        uint64 createdBlock;
        uint64 creationDeadline;
        uint64 terminalBlock;
        OrderSide side;
        OrderStatus status;
    }

    error ZeroAddress();
    error NotAContract(address target);
    error UnauthorizedSafe(address caller);
    error WrongCurrencyOrder();
    error InvalidPeripheryBinding();
    error InvalidHookPermissions();
    error PoolNotInitialized();
    error WrongPoolId(bytes32 derived, bytes32 expected);
    error ZeroValue();
    error ZeroStrategyHash();
    error DeadlineExpired(uint256 deadline, uint256 timestamp);
    error InvalidTickSpacing();
    error TickOutOfBounds();
    error InvalidTickRange();
    error RangeInMarket();
    error RangeAlreadyFilled();
    error ZeroLiquidity();
    error DeadlineTooLarge(uint256 deadline);
    error MinimumOutputTooHigh(uint256 minimum, uint256 expected);
    error UnexpectedInputAmount(uint256 expected, uint256 received);
    error UnexpectedTokenSpend(uint256 maximum, uint256 actual);
    error PositionRegistrationMismatch(uint256 tokenId);
    error PositionOwnershipMismatch(uint256 tokenId);
    error PositionLiquidityMismatch(uint256 tokenId, uint128 expected, uint128 actual);
    error PositionNotBurned(uint256 tokenId);
    error OrderNotFound(uint256 orderId);
    error OrderAlreadySettled(uint256 orderId);
    error OrderAlreadyCancelled(uint256 orderId);
    error OrderNotSettleable(uint256 orderId);
    error OrderCreationIsPaused();
    error OrderCreationAlreadyPaused();
    error OrderCreationNotPaused();
    error InvalidBatchSize(uint256 size);
    error OutputBelowMinimum(address token, uint256 minimum, uint256 actual);
    error UnexpectedPositionNft(address operator, address from, uint256 tokenId);
    error RegisteredPositionCannotBeQuarantined(uint256 tokenId);
    error UnregisteredPositionNotOwned(uint256 tokenId);
    error ResidualPoolTokenBalance(uint256 naraBalance, uint256 usdcBalance);
    error ResidualAllowance(address token, uint256 erc20Allowance, uint256 permit2Allowance);
    error ResidualSafeAllowance(address token, uint256 allowance);
    error BlockNumberOverflow();

    IERC20 public immutable NARA;
    IERC20 public immutable USDC;
    address public immutable TREASURY_SAFE;
    address public immutable LIQUIDITY_VAULT;
    IPoolManager public immutable POOL_MANAGER;
    INARATreasuryPositionManager public immutable POSITION_MANAGER;
    INARATreasuryPermit2 public immutable PERMIT2;
    IHooks public immutable HOOK;
    uint24 public immutable POOL_FEE;
    int24 public immutable TICK_SPACING;
    PoolId public immutable POOL_ID;
    uint64 public immutable DEPLOYMENT_DEADLINE;

    Currency internal immutable _currency0;
    Currency internal immutable _currency1;

    uint256 public orderCount;
    bool public orderCreationPaused;

    mapping(uint256 orderId => RangeOrder order) private _orders;
    mapping(uint256 tokenId => uint256 orderId) public tokenIdToOrderId;
    uint256[] private _activeOrderIds;
    mapping(uint256 orderId => uint256 indexPlusOne) private _activeIndexPlusOne;

    // PositionManager 1.0.3 uses _mint rather than _safeMint. This guard still rejects unsolicited
    // safe transfers and permits a callback only if a future compatible PositionManager invokes one
    // for the exact token id synchronously reserved by this contract.
    uint256 private _expectedMintTokenId;

    event OrderCreated(
        uint256 indexed orderId,
        uint256 indexed tokenId,
        bytes32 indexed strategyHash,
        OrderSide side,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 maximumInputAmount,
        uint256 inputAmount,
        uint256 inputRefund,
        uint256 minimumOutputAmount,
        uint160 creationSqrtPriceX96,
        int24 creationTick,
        uint64 deadline
    );
    event OrderSettled(
        uint256 indexed orderId,
        uint256 indexed tokenId,
        bytes32 indexed strategyHash,
        uint256 naraOut,
        uint256 usdcOut,
        uint160 settlementSqrtPriceX96,
        int24 settlementTick,
        uint64 settlementBlock
    );
    event OrderCancelled(
        uint256 indexed orderId,
        uint256 indexed tokenId,
        bytes32 indexed strategyHash,
        uint256 naraOut,
        uint256 usdcOut,
        uint64 cancellationBlock
    );
    event OrderCreationPaused();
    event OrderCreationUnpaused();
    event UnregisteredPositionQuarantined(uint256 indexed tokenId, address indexed recipient);
    event PoolTokenDustForwarded(uint256 naraAmount, uint256 usdcAmount);

    constructor(
        address treasurySafe_,
        address nara_,
        address usdc_,
        address liquidityVault_,
        address poolManager_,
        address positionManager_,
        address permit2_,
        address hook_,
        uint24 poolFee_,
        int24 tickSpacing_,
        bytes32 expectedPoolId_,
        uint64 deploymentDeadline_
    ) {
        if (
            treasurySafe_ == address(0) || nara_ == address(0) || usdc_ == address(0)
                || liquidityVault_ == address(0) || poolManager_ == address(0)
                || positionManager_ == address(0) || permit2_ == address(0) || hook_ == address(0)
        ) revert ZeroAddress();
        if (deploymentDeadline_ < block.timestamp) {
            revert DeadlineExpired(deploymentDeadline_, block.timestamp);
        }
        _requireContract(treasurySafe_);
        _requireContract(nara_);
        _requireContract(usdc_);
        _requireContract(liquidityVault_);
        _requireContract(poolManager_);
        _requireContract(positionManager_);
        _requireContract(permit2_);
        _requireContract(hook_);
        if (uint160(usdc_) >= uint160(nara_)) revert WrongCurrencyOrder();
        if (tickSpacing_ <= 0) revert InvalidTickSpacing();

        TREASURY_SAFE = treasurySafe_;
        NARA = IERC20(nara_);
        USDC = IERC20(usdc_);
        LIQUIDITY_VAULT = liquidityVault_;
        POOL_MANAGER = IPoolManager(poolManager_);
        POSITION_MANAGER = INARATreasuryPositionManager(positionManager_);
        PERMIT2 = INARATreasuryPermit2(permit2_);
        HOOK = IHooks(hook_);
        POOL_FEE = poolFee_;
        TICK_SPACING = tickSpacing_;
        DEPLOYMENT_DEADLINE = deploymentDeadline_;
        _currency0 = Currency.wrap(usdc_);
        _currency1 = Currency.wrap(nara_);

        PoolKey memory key = _poolKey();
        PoolId derivedPoolId = key.toId();
        if (PoolId.unwrap(derivedPoolId) != expectedPoolId_) {
            revert WrongPoolId(PoolId.unwrap(derivedPoolId), expectedPoolId_);
        }
        POOL_ID = derivedPoolId;

        _assertImmutableBindings();
        (uint160 sqrtPriceX96,,,) = POOL_MANAGER.getSlot0(derivedPoolId);
        if (sqrtPriceX96 == 0) revert PoolNotInitialized();
    }

    modifier onlyTreasurySafe() {
        if (msg.sender != TREASURY_SAFE) revert UnauthorizedSafe(msg.sender);
        _;
    }

    /// @notice Creates an above-market NARA-only range. Worst case for compromised Safe signers is
    ///         committing the explicitly approved NARA at poor ticks; recipient and pool cannot change.
    function createSellNaraOrder(
        int24 tickLower,
        int24 tickUpper,
        uint128 maximumNaraInput,
        uint128 minimumUsdcOutput,
        bytes32 strategyHash,
        uint64 deadline
    ) external onlyTreasurySafe nonReentrant returns (uint256 orderId, uint256 tokenId) {
        return _createOrder(
            OrderSide.SellNara,
            tickLower,
            tickUpper,
            maximumNaraInput,
            minimumUsdcOutput,
            strategyHash,
            deadline
        );
    }

    /// @notice Creates a below-market USDC-only range. Worst case for compromised Safe signers is
    ///         committing the explicitly approved USDC at poor ticks; recipient and pool cannot change.
    function createBuyNaraOrder(
        int24 tickLower,
        int24 tickUpper,
        uint128 maximumUsdcInput,
        uint128 minimumNaraOutput,
        bytes32 strategyHash,
        uint64 deadline
    ) external onlyTreasurySafe nonReentrant returns (uint256 orderId, uint256 tokenId) {
        return _createOrder(
            OrderSide.BuyNara,
            tickLower,
            tickUpper,
            maximumUsdcInput,
            minimumNaraOutput,
            strategyHash,
            deadline
        );
    }

    /// @notice Burns a fully crossed position and directs all principal and fees to the immutable Safe.
    ///         Any account may call; the caller cannot change order parameters or either recipient.
    function settle(uint256 orderId) external nonReentrant returns (uint256 naraOut, uint256 usdcOut) {
        return _settle(orderId);
    }

    /// @notice Bounded, atomic batch settlement. A stale or invalid member reverts the entire batch.
    function settleMany(uint256[] calldata orderIds)
        external
        nonReentrant
        returns (uint256 totalNaraOut, uint256 totalUsdcOut)
    {
        uint256 length = orderIds.length;
        if (length == 0 || length > MAX_SETTLE_BATCH) revert InvalidBatchSize(length);
        for (uint256 i; i < length; ++i) {
            (uint256 naraOut, uint256 usdcOut) = _settle(orderIds[i]);
            totalNaraOut += naraOut;
            totalUsdcOut += usdcOut;
        }
    }

    /// @notice Safe-only exit for an Active order. Worst case for compromised Safe signers is accepting
    ///         the explicitly supplied minimums at the current composition; assets still reach only the Safe.
    function cancel(
        uint256 orderId,
        uint128 minNaraOut,
        uint128 minUsdcOut,
        uint64 deadline
    ) external onlyTreasurySafe nonReentrant returns (uint256 naraOut, uint256 usdcOut) {
        _checkDeadline(deadline);
        RangeOrder storage order = _activeOrder(orderId);
        _assertManagedPosition(orderId, order);

        uint256 tokenId = order.tokenId;
        order.status = OrderStatus.Cancelled;
        order.terminalBlock = _blockNumber64();
        _removeActiveOrder(orderId);

        uint256 naraBefore = NARA.balanceOf(TREASURY_SAFE);
        uint256 usdcBefore = USDC.balanceOf(TREASURY_SAFE);
        _burnAndTake(tokenId, minNaraOut, minUsdcOut, deadline);
        naraOut = NARA.balanceOf(TREASURY_SAFE) - naraBefore;
        usdcOut = USDC.balanceOf(TREASURY_SAFE) - usdcBefore;
        if (naraOut < minNaraOut) revert OutputBelowMinimum(address(NARA), minNaraOut, naraOut);
        if (usdcOut < minUsdcOut) revert OutputBelowMinimum(address(USDC), minUsdcOut, usdcOut);
        _assertBurned(tokenId);

        emit OrderCancelled(
            orderId, tokenId, order.strategyHash, naraOut, usdcOut, order.terminalBlock
        );
    }

    /// @notice Pauses only new treasury commitments. Worst case is delayed order creation; settlement
    ///         and Safe cancellation intentionally remain available.
    function pauseOrderCreation() external onlyTreasurySafe {
        if (orderCreationPaused) revert OrderCreationAlreadyPaused();
        orderCreationPaused = true;
        emit OrderCreationPaused();
    }

    /// @notice Re-enables Safe-only creation. Worst case is again limited to explicit Safe-approved orders.
    function unpauseOrderCreation() external onlyTreasurySafe {
        if (!orderCreationPaused) revert OrderCreationNotPaused();
        orderCreationPaused = false;
        emit OrderCreationUnpaused();
    }

    /// @notice Moves an unsolicited PositionManager NFT to the immutable Safe without registering it.
    /// @dev PositionManager mints and non-safe transfers bypass IERC721Receiver, so unsolicited ownership
    ///      cannot be prevented. Registered token IDs are permanently excluded from this quarantine path.
    function quarantineUnregisteredPosition(uint256 tokenId) external onlyTreasurySafe nonReentrant {
        if (tokenIdToOrderId[tokenId] != 0) revert RegisteredPositionCannotBeQuarantined(tokenId);
        try POSITION_MANAGER.ownerOf(tokenId) returns (address currentOwner) {
            if (currentOwner != address(this)) revert UnregisteredPositionNotOwned(tokenId);
        } catch {
            revert UnregisteredPositionNotOwned(tokenId);
        }
        IERC721(address(POSITION_MANAGER)).transferFrom(address(this), TREASURY_SAFE, tokenId);
        emit UnregisteredPositionQuarantined(tokenId, TREASURY_SAFE);
    }

    function getOrder(uint256 orderId) external view returns (RangeOrder memory order) {
        order = _orders[orderId];
        if (order.status == OrderStatus.None) revert OrderNotFound(orderId);
    }

    function activeOrderCount() external view returns (uint256) {
        return _activeOrderIds.length;
    }

    function getActiveOrderIds(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory orderIds, uint256 nextOffset)
    {
        if (limit > MAX_ACTIVE_PAGE_SIZE) revert InvalidBatchSize(limit);
        uint256 length = _activeOrderIds.length;
        if (offset >= length || limit == 0) return (new uint256[](0), length);
        uint256 end = offset + limit;
        if (end > length) end = length;
        orderIds = new uint256[](end - offset);
        for (uint256 i; i < orderIds.length; ++i) orderIds[i] = _activeOrderIds[offset + i];
        nextOffset = end;
    }

    function isSettleable(uint256 orderId) public view returns (bool) {
        RangeOrder storage order = _orders[orderId];
        if (order.status != OrderStatus.Active || tokenIdToOrderId[order.tokenId] != orderId) return false;
        try POSITION_MANAGER.ownerOf(order.tokenId) returns (address currentOwner) {
            if (currentOwner != address(this)) return false;
        } catch {
            return false;
        }
        try POSITION_MANAGER.getPositionLiquidity(order.tokenId) returns (uint128 liquidity) {
            if (liquidity == 0 || liquidity != order.liquidity) return false;
        } catch {
            return false;
        }
        (uint160 sqrtPriceX96,,,) = POOL_MANAGER.getSlot0(POOL_ID);
        return _terminalAt(order.side, order.tickLower, order.tickUpper, sqrtPriceX96);
    }

    /// @notice Returns current principal composition excluding uncollected LP fees.
    function previewSettlement(uint256 orderId)
        external
        view
        returns (
            bool settleable,
            uint256 principalNara,
            uint256 principalUsdc,
            uint256 minimumOutputAmount
        )
    {
        RangeOrder storage order = _orders[orderId];
        if (order.status == OrderStatus.None) revert OrderNotFound(orderId);
        (uint160 sqrtPriceX96,,,) = POOL_MANAGER.getSlot0(POOL_ID);
        (principalUsdc, principalNara) =
            _principalAtPrice(order.liquidity, order.tickLower, order.tickUpper, sqrtPriceX96);
        settleable = isSettleable(orderId);
        minimumOutputAmount = order.minimumOutputAmount;
    }

    function currentPoolState()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint128 activeLiquidity,
            uint24 protocolFee,
            uint24 lpFee
        )
    {
        (sqrtPriceX96, tick, protocolFee, lpFee) = POOL_MANAGER.getSlot0(POOL_ID);
        activeLiquidity = POOL_MANAGER.getLiquidity(POOL_ID);
    }

    function canonicalPoolKey() external view returns (PoolKey memory) {
        return _poolKey();
    }

    /// @notice Fail-closed read used before/after Safe and settler operations.
    /// @dev It deliberately avoids iterating over historical or active orders.
    function assertOperationalClean() external view returns (bool) {
        _assertImmutableBindings();
        uint256 naraBalance = NARA.balanceOf(address(this));
        uint256 usdcBalance = USDC.balanceOf(address(this));
        if (naraBalance != 0 || usdcBalance != 0) {
            revert ResidualPoolTokenBalance(naraBalance, usdcBalance);
        }
        _assertAllowanceClean(NARA);
        _assertAllowanceClean(USDC);
        return true;
    }

    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata)
        external
        view
        override
        returns (bytes4)
    {
        if (
            msg.sender != address(POSITION_MANAGER) || from != address(0)
                || tokenId == 0 || tokenId != _expectedMintTokenId
        ) revert UnexpectedPositionNft(operator, from, tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    function _createOrder(
        OrderSide side,
        int24 tickLower,
        int24 tickUpper,
        uint128 maximumInputAmount,
        uint128 minimumOutputAmount,
        bytes32 strategyHash,
        uint64 deadline
    ) internal returns (uint256 orderId, uint256 tokenId) {
        if (orderCreationPaused) revert OrderCreationIsPaused();
        if (maximumInputAmount == 0 || minimumOutputAmount == 0) revert ZeroValue();
        if (strategyHash == bytes32(0)) revert ZeroStrategyHash();
        _checkDeadline(deadline);
        _validateTicks(tickLower, tickUpper);

        (uint160 sqrtPriceX96, int24 currentTick,,) = POOL_MANAGER.getSlot0(POOL_ID);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        _validateCreationSide(side, sqrtPriceX96, sqrtLower, sqrtUpper);

        uint128 liquidity = side == OrderSide.SellNara
            ? LiquidityAmounts.getLiquidityForAmount1(sqrtLower, sqrtUpper, maximumInputAmount)
            : LiquidityAmounts.getLiquidityForAmount0(sqrtLower, sqrtUpper, maximumInputAmount);
        if (liquidity == 0) revert ZeroLiquidity();
        uint256 expectedOutput = side == OrderSide.SellNara
            ? SqrtPriceMath.getAmount0Delta(sqrtLower, sqrtUpper, liquidity, false)
            : SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtUpper, liquidity, false);
        if (minimumOutputAmount > expectedOutput) {
            revert MinimumOutputTooHigh(minimumOutputAmount, expectedOutput);
        }

        IERC20 inputToken = side == OrderSide.SellNara ? NARA : USDC;
        uint256 balanceBefore = inputToken.balanceOf(address(this));
        inputToken.safeTransferFrom(TREASURY_SAFE, address(this), maximumInputAmount);
        uint256 balanceAfterPull = inputToken.balanceOf(address(this));
        uint256 received = balanceAfterPull - balanceBefore;
        if (received != maximumInputAmount) revert UnexpectedInputAmount(maximumInputAmount, received);

        _approvePositionManager(inputToken, maximumInputAmount, deadline);
        tokenId = POSITION_MANAGER.nextTokenId();
        _expectedMintTokenId = tokenId;
        _mintPosition(side, tickLower, tickUpper, liquidity, maximumInputAmount, deadline);
        _expectedMintTokenId = 0;
        _clearPositionManagerApproval(inputToken);

        uint256 balanceAfterMint = inputToken.balanceOf(address(this));
        if (balanceAfterMint > balanceAfterPull) revert UnexpectedTokenSpend(maximumInputAmount, 0);
        uint256 inputAmount = balanceAfterPull - balanceAfterMint;
        if (inputAmount == 0 || inputAmount > maximumInputAmount) {
            revert UnexpectedTokenSpend(maximumInputAmount, inputAmount);
        }
        uint256 inputRefund = maximumInputAmount - inputAmount;

        if (POSITION_MANAGER.ownerOf(tokenId) != address(this)) revert PositionOwnershipMismatch(tokenId);
        uint128 actualLiquidity = POSITION_MANAGER.getPositionLiquidity(tokenId);
        if (actualLiquidity == 0 || actualLiquidity != liquidity) {
            revert PositionLiquidityMismatch(tokenId, liquidity, actualLiquidity);
        }

        orderId = ++orderCount;
        if (tokenIdToOrderId[tokenId] != 0) revert PositionRegistrationMismatch(tokenId);
        RangeOrder storage order = _orders[orderId];
        order.tokenId = tokenId;
        order.inputAmount = inputAmount;
        order.minimumOutputAmount = minimumOutputAmount;
        order.strategyHash = strategyHash;
        order.liquidity = liquidity;
        order.tickLower = tickLower;
        order.tickUpper = tickUpper;
        order.createdBlock = _blockNumber64();
        order.creationDeadline = deadline;
        order.side = side;
        order.status = OrderStatus.Active;
        tokenIdToOrderId[tokenId] = orderId;
        _addActiveOrder(orderId);

        _forwardPoolTokenDust();

        emit OrderCreated(
            orderId,
            tokenId,
            strategyHash,
            side,
            tickLower,
            tickUpper,
            liquidity,
            maximumInputAmount,
            inputAmount,
            inputRefund,
            minimumOutputAmount,
            sqrtPriceX96,
            currentTick,
            deadline
        );
    }

    function _settle(uint256 orderId) internal returns (uint256 naraOut, uint256 usdcOut) {
        RangeOrder storage order = _activeOrder(orderId);
        (uint160 sqrtPriceX96, int24 currentTick,,) = POOL_MANAGER.getSlot0(POOL_ID);
        if (!_terminalAt(order.side, order.tickLower, order.tickUpper, sqrtPriceX96)) {
            revert OrderNotSettleable(orderId);
        }
        _assertManagedPosition(orderId, order);

        uint256 tokenId = order.tokenId;
        uint128 minNaraOut = order.side == OrderSide.BuyNara ? uint128(order.minimumOutputAmount) : 0;
        uint128 minUsdcOut = order.side == OrderSide.SellNara ? uint128(order.minimumOutputAmount) : 0;
        order.status = OrderStatus.Settled;
        order.terminalBlock = _blockNumber64();
        _removeActiveOrder(orderId);

        uint256 naraBefore = NARA.balanceOf(TREASURY_SAFE);
        uint256 usdcBefore = USDC.balanceOf(TREASURY_SAFE);
        _burnAndTake(tokenId, minNaraOut, minUsdcOut, uint64(block.timestamp));
        naraOut = NARA.balanceOf(TREASURY_SAFE) - naraBefore;
        usdcOut = USDC.balanceOf(TREASURY_SAFE) - usdcBefore;
        if (naraOut < minNaraOut) revert OutputBelowMinimum(address(NARA), minNaraOut, naraOut);
        if (usdcOut < minUsdcOut) revert OutputBelowMinimum(address(USDC), minUsdcOut, usdcOut);
        _assertBurned(tokenId);

        emit OrderSettled(
            orderId,
            tokenId,
            order.strategyHash,
            naraOut,
            usdcOut,
            sqrtPriceX96,
            currentTick,
            order.terminalBlock
        );
    }

    function _mintPosition(
        OrderSide side,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint128 maximumInputAmount,
        uint64 deadline
    ) internal {
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        uint128 amount0Max = side == OrderSide.BuyNara ? maximumInputAmount : 0;
        uint128 amount1Max = side == OrderSide.SellNara ? maximumInputAmount : 0;
        params[0] = abi.encode(
            _poolKey(),
            tickLower,
            tickUpper,
            uint256(liquidity),
            amount0Max,
            amount1Max,
            address(this),
            bytes("")
        );
        params[1] = abi.encode(_currency0, _currency1);
        POSITION_MANAGER.modifyLiquidities(abi.encode(actions, params), deadline);
    }

    function _burnAndTake(uint256 tokenId, uint128 minNaraOut, uint128 minUsdcOut, uint64 deadline)
        internal
    {
        bytes memory actions = abi.encodePacked(uint8(Actions.BURN_POSITION), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, minUsdcOut, minNaraOut, bytes(""));
        params[1] = abi.encode(_currency0, _currency1, TREASURY_SAFE);
        POSITION_MANAGER.modifyLiquidities(abi.encode(actions, params), deadline);
    }

    function _approvePositionManager(IERC20 token, uint128 amount, uint64 deadline) internal {
        if (deadline > type(uint48).max) revert DeadlineTooLarge(deadline);
        token.forceApprove(address(PERMIT2), amount);
        PERMIT2.approve(address(token), address(POSITION_MANAGER), uint160(amount), uint48(deadline));
    }

    function _clearPositionManagerApproval(IERC20 token) internal {
        PERMIT2.approve(address(token), address(POSITION_MANAGER), 0, 0);
        token.forceApprove(address(PERMIT2), 0);
    }

    function _forwardPoolTokenDust() internal {
        uint256 naraAmount = NARA.balanceOf(address(this));
        uint256 usdcAmount = USDC.balanceOf(address(this));
        if (naraAmount != 0) NARA.safeTransfer(TREASURY_SAFE, naraAmount);
        if (usdcAmount != 0) USDC.safeTransfer(TREASURY_SAFE, usdcAmount);
        if (naraAmount != 0 || usdcAmount != 0) emit PoolTokenDustForwarded(naraAmount, usdcAmount);
    }

    function _activeOrder(uint256 orderId) internal view returns (RangeOrder storage order) {
        order = _orders[orderId];
        if (order.status == OrderStatus.None) revert OrderNotFound(orderId);
        if (order.status == OrderStatus.Settled) revert OrderAlreadySettled(orderId);
        if (order.status == OrderStatus.Cancelled) revert OrderAlreadyCancelled(orderId);
    }

    function _assertManagedPosition(uint256 orderId, RangeOrder storage order) internal view {
        uint256 tokenId = order.tokenId;
        if (tokenIdToOrderId[tokenId] != orderId) revert PositionRegistrationMismatch(tokenId);
        try POSITION_MANAGER.ownerOf(tokenId) returns (address currentOwner) {
            if (currentOwner != address(this)) revert PositionOwnershipMismatch(tokenId);
        } catch {
            revert PositionOwnershipMismatch(tokenId);
        }
        uint128 actualLiquidity = POSITION_MANAGER.getPositionLiquidity(tokenId);
        if (actualLiquidity == 0 || actualLiquidity != order.liquidity) {
            revert PositionLiquidityMismatch(tokenId, order.liquidity, actualLiquidity);
        }
    }

    function _assertBurned(uint256 tokenId) internal view {
        uint128 remainingLiquidity = POSITION_MANAGER.getPositionLiquidity(tokenId);
        if (remainingLiquidity != 0) revert PositionNotBurned(tokenId);
        try POSITION_MANAGER.ownerOf(tokenId) returns (address) {
            revert PositionNotBurned(tokenId);
        } catch {}
    }

    function _validateTicks(int24 tickLower, int24 tickUpper) internal view {
        if (tickLower < TickMath.MIN_TICK || tickUpper > TickMath.MAX_TICK) revert TickOutOfBounds();
        if (tickLower >= tickUpper) revert InvalidTickRange();
        if (tickLower % TICK_SPACING != 0 || tickUpper % TICK_SPACING != 0) {
            revert InvalidTickSpacing();
        }
    }

    function _validateCreationSide(
        OrderSide side,
        uint160 sqrtPriceX96,
        uint160 sqrtLower,
        uint160 sqrtUpper
    ) internal pure {
        if (side == OrderSide.SellNara) {
            if (sqrtPriceX96 <= sqrtLower) revert RangeAlreadyFilled();
            if (sqrtPriceX96 < sqrtUpper) revert RangeInMarket();
        } else {
            if (sqrtPriceX96 >= sqrtUpper) revert RangeAlreadyFilled();
            if (sqrtPriceX96 > sqrtLower) revert RangeInMarket();
        }
    }

    function _terminalAt(OrderSide side, int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96)
        internal
        pure
        returns (bool)
    {
        return side == OrderSide.SellNara
            ? sqrtPriceX96 <= TickMath.getSqrtPriceAtTick(tickLower)
            : sqrtPriceX96 >= TickMath.getSqrtPriceAtTick(tickUpper);
    }

    function _principalAtPrice(uint128 liquidity, int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96)
        internal
        pure
        returns (uint256 amount0, uint256 amount1)
    {
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(tickUpper);
        if (sqrtPriceX96 <= sqrtLower) {
            amount0 = SqrtPriceMath.getAmount0Delta(sqrtLower, sqrtUpper, liquidity, false);
        } else if (sqrtPriceX96 < sqrtUpper) {
            amount0 = SqrtPriceMath.getAmount0Delta(sqrtPriceX96, sqrtUpper, liquidity, false);
            amount1 = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtPriceX96, liquidity, false);
        } else {
            amount1 = SqrtPriceMath.getAmount1Delta(sqrtLower, sqrtUpper, liquidity, false);
        }
    }

    function _poolKey() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: _currency0,
            currency1: _currency1,
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: HOOK
        });
    }

    function _assertImmutableBindings() internal view {
        INARATreasuryHookBinding hookBinding = INARATreasuryHookBinding(address(HOOK));
        INARATreasuryVaultBinding vaultBinding = INARATreasuryVaultBinding(LIQUIDITY_VAULT);
        if (
            address(POSITION_MANAGER.poolManager()) != address(POOL_MANAGER)
                || POSITION_MANAGER.permit2() != address(PERMIT2)
                || hookBinding.token() != address(NARA)
                || hookBinding.base() != address(USDC)
                || hookBinding.vault() != LIQUIDITY_VAULT
                || address(hookBinding.poolManager()) != address(POOL_MANAGER)
                || hookBinding.CANONICAL_POOL_FEE() != POOL_FEE
                || hookBinding.CANONICAL_TICK_SPACING() != TICK_SPACING
                || !hookBinding.poolRegistered()
                || PoolId.unwrap(hookBinding.registeredPoolId()) != PoolId.unwrap(POOL_ID)
                || hookBinding.tokenIsCurrency0()
                || vaultBinding.token() != address(NARA)
                || vaultBinding.base() != address(USDC)
                || vaultBinding.hook() != address(HOOK)
        ) revert InvalidPeripheryBinding();
        _assertHookPermissions(hookBinding.getHookPermissions());
    }

    function _assertHookPermissions(Hooks.Permissions memory permissions) internal pure {
        if (
            !permissions.beforeInitialize || permissions.afterInitialize
                || permissions.beforeAddLiquidity || permissions.afterAddLiquidity
                || permissions.beforeRemoveLiquidity || permissions.afterRemoveLiquidity
                || !permissions.beforeSwap || permissions.afterSwap || permissions.beforeDonate
                || permissions.afterDonate || !permissions.beforeSwapReturnDelta
                || permissions.afterSwapReturnDelta || permissions.afterAddLiquidityReturnDelta
                || permissions.afterRemoveLiquidityReturnDelta
        ) revert InvalidHookPermissions();
    }

    function _assertAllowanceClean(IERC20 token) internal view {
        uint256 safeAllowance = token.allowance(TREASURY_SAFE, address(this));
        if (safeAllowance != 0) revert ResidualSafeAllowance(address(token), safeAllowance);
        uint256 erc20Allowance = token.allowance(address(this), address(PERMIT2));
        (uint160 permit2Allowance,,) =
            PERMIT2.allowance(address(this), address(token), address(POSITION_MANAGER));
        if (erc20Allowance != 0 || permit2Allowance != 0) {
            revert ResidualAllowance(address(token), erc20Allowance, permit2Allowance);
        }
    }

    function _addActiveOrder(uint256 orderId) internal {
        _activeOrderIds.push(orderId);
        _activeIndexPlusOne[orderId] = _activeOrderIds.length;
    }

    function _removeActiveOrder(uint256 orderId) internal {
        uint256 indexPlusOne = _activeIndexPlusOne[orderId];
        if (indexPlusOne == 0) revert OrderNotFound(orderId);
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _activeOrderIds.length - 1;
        if (index != lastIndex) {
            uint256 lastOrderId = _activeOrderIds[lastIndex];
            _activeOrderIds[index] = lastOrderId;
            _activeIndexPlusOne[lastOrderId] = indexPlusOne;
        }
        _activeOrderIds.pop();
        delete _activeIndexPlusOne[orderId];
    }

    function _checkDeadline(uint64 deadline) internal view {
        if (deadline < block.timestamp) revert DeadlineExpired(deadline, block.timestamp);
    }

    function _blockNumber64() internal view returns (uint64 value) {
        if (block.number > type(uint64).max) revert BlockNumberOverflow();
        value = uint64(block.number);
    }

    function _requireContract(address target) internal view {
        if (target.code.length == 0) revert NotAContract(target);
    }
}
