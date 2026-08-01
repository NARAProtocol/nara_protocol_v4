// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

import {INARALiquidityPositionAdapterV5} from "../interfaces/liquidity/INARALiquidityPositionAdapterV5.sol";
import {INARAPositionManagerStateV5} from "../interfaces/liquidity/INARAPositionManagerStateV5.sol";

interface INARAPermit2AllowanceV5 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface INARAPositionManagerBindingsV5 {
    function poolManager() external view returns (address);
    function permit2() external view returns (address);
}

interface INARACompounderUsagePolicyV5 {
    function configuredMinimumNaraUsed() external view returns (uint256);
    function configuredMinimumBaseUsed() external view returns (uint256);
}

/// @title NARA Uniswap v4 position adapter V5
/// @notice Exact, no-swap PositionManager/Permit2 boundary for one sealed pool
///         and one named Compounder-owned LP NFT.
/// @dev The adapter temporarily pulls only caller-capped amounts, grants exact
///      expiring allowances, adds live-price liquidity, revokes both allowance
///      layers, and returns every unused unit in the same transaction.
contract NARAUniswapV4PositionAdapterV5 is INARALiquidityPositionAdapterV5, ReentrancyGuard {
    using CurrencyLibrary for Currency;
    using PoolIdLibrary for PoolKey;
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;

    address public immutable override token;
    address public immutable override base;
    address public immutable override poolManager;
    address public immutable override positionManager;
    address public immutable permit2;
    address public immutable override compounder;
    PoolId public immutable override poolId;
    int24 public immutable override tickLower;
    int24 public immutable override tickUpper;
    uint256 public immutable override configuredMinimumNaraUsed;
    uint256 public immutable override configuredMinimumBaseUsed;
    bytes32 public immutable override configurationHash;
    bool public immutable tokenIsCurrency0;

    Currency private immutable _currency0;
    Currency private immutable _currency1;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;
    address public immutable hooks;

    error ZeroAddress();
    error NotAContract();
    error Unauthorized();
    error InvalidConfiguration();
    error Expired();
    error AmountTooLarge();
    error MinimumUsageBelowConfiguration();
    error InsufficientNaraUsed(uint256 minimum, uint256 actual);
    error InsufficientBaseUsed(uint256 minimum, uint256 actual);
    error InsufficientLiquidity(uint128 minimum, uint128 actual);
    error TokenAccountingMismatch();
    error PositionAccountingMismatch();
    error EtherNotAccepted();

    event LiquidityAdded(
        uint256 indexed positionTokenId,
        uint128 liquidityAdded,
        uint256 naraUsed,
        uint256 baseUsed,
        uint256 naraLpFeesHarvested,
        uint256 baseLpFeesHarvested,
        bool newlyMinted
    );

    constructor(
        address token_,
        address base_,
        address poolManager_,
        address positionManager_,
        address permit2_,
        address compounder_,
        PoolKey memory poolKey_,
        int24 tickLower_,
        int24 tickUpper_
    ) {
        if (
            token_ == address(0) || base_ == address(0) || poolManager_ == address(0)
                || positionManager_ == address(0) || permit2_ == address(0) || compounder_ == address(0)
        ) revert ZeroAddress();
        if (
            token_.code.length == 0 || base_.code.length == 0 || poolManager_.code.length == 0
                || positionManager_.code.length == 0 || permit2_.code.length == 0
                || compounder_.code.length == 0
        ) revert NotAContract();
        if (token_ == base_ || poolKey_.tickSpacing <= 0 || tickLower_ >= tickUpper_) {
            revert InvalidConfiguration();
        }
        if (
            tickLower_ < TickMath.MIN_TICK || tickUpper_ > TickMath.MAX_TICK
                || tickLower_ % poolKey_.tickSpacing != 0 || tickUpper_ % poolKey_.tickSpacing != 0
        ) revert InvalidConfiguration();

        bool tokenIs0 = uint160(token_) < uint160(base_);
        (address expected0, address expected1) = tokenIs0 ? (token_, base_) : (base_, token_);
        if (
            Currency.unwrap(poolKey_.currency0) != expected0
                || Currency.unwrap(poolKey_.currency1) != expected1
        ) revert InvalidConfiguration();
        address hookAddress = address(poolKey_.hooks);
        if (hookAddress != address(0) && hookAddress.code.length == 0) revert NotAContract();
        if (
            INARAPositionManagerBindingsV5(positionManager_).poolManager() != poolManager_
                || INARAPositionManagerBindingsV5(positionManager_).permit2() != permit2_
        ) revert InvalidConfiguration();
        uint256 minimumNaraUsedFloor =
            INARACompounderUsagePolicyV5(compounder_).configuredMinimumNaraUsed();
        uint256 minimumBaseUsedFloor =
            INARACompounderUsagePolicyV5(compounder_).configuredMinimumBaseUsed();
        if (minimumNaraUsedFloor == 0 || minimumBaseUsedFloor == 0) revert InvalidConfiguration();

        token = token_;
        base = base_;
        poolManager = poolManager_;
        positionManager = positionManager_;
        permit2 = permit2_;
        compounder = compounder_;
        tokenIsCurrency0 = tokenIs0;
        _currency0 = poolKey_.currency0;
        _currency1 = poolKey_.currency1;
        poolFee = poolKey_.fee;
        tickSpacing = poolKey_.tickSpacing;
        hooks = hookAddress;
        poolId = poolKey_.toId();
        tickLower = tickLower_;
        tickUpper = tickUpper_;
        configuredMinimumNaraUsed = minimumNaraUsedFloor;
        configuredMinimumBaseUsed = minimumBaseUsedFloor;
        configurationHash = keccak256(
            abi.encode(
                keccak256("NARA_UNISWAP_V4_POSITION_ADAPTER_V5"),
                block.chainid,
                token_,
                token_.codehash,
                base_,
                base_.codehash,
                poolManager_,
                poolManager_.codehash,
                positionManager_,
                positionManager_.codehash,
                permit2_,
                permit2_.codehash,
                compounder_,
                PoolId.unwrap(poolId),
                tickLower_,
                tickUpper_,
                minimumNaraUsedFloor,
                minimumBaseUsedFloor
            )
        );
    }

    function poolKey() external view returns (PoolKey memory key) {
        key = _poolKey();
    }

    function addLiquidity(
        uint256 currentPositionTokenId,
        uint256 maximumNara,
        uint256 maximumBase,
        uint256 minimumNaraUsed,
        uint256 minimumBaseUsed,
        uint128 minimumLiquidity,
        uint64 deadline
    )
        external
        override
        nonReentrant
        returns (
            uint256 positionTokenId,
            uint128 liquidityAdded,
            uint256 naraUsed,
            uint256 baseUsed,
            uint256 naraLpFeesHarvested,
            uint256 baseLpFeesHarvested
        )
    {
        if (msg.sender != compounder) revert Unauthorized();
        if (block.timestamp > deadline || deadline > type(uint48).max) revert Expired();
        if (
            maximumNara == 0 || maximumBase == 0 || minimumLiquidity == 0
                || minimumNaraUsed > maximumNara || minimumBaseUsed > maximumBase
                || maximumNara > type(uint128).max || maximumBase > type(uint128).max
        ) revert AmountTooLarge();
        if (
            minimumNaraUsed < configuredMinimumNaraUsed
                || minimumBaseUsed < configuredMinimumBaseUsed
        ) revert MinimumUsageBelowConfiguration();

        uint256 naraStartingBalance = IERC20(token).balanceOf(address(this));
        uint256 baseStartingBalance = IERC20(base).balanceOf(address(this));
        uint128 liquidityBefore;
        bool newlyMinted = currentPositionTokenId == 0;
        if (!newlyMinted) {
            positionTokenId = currentPositionTokenId;
            if (INARAPositionManagerStateV5(positionManager).ownerOf(positionTokenId) != compounder) {
                revert PositionAccountingMismatch();
            }
            liquidityBefore = INARAPositionManagerStateV5(positionManager).getPositionLiquidity(positionTokenId);

            // Realize and take all previously accrued LP fees before funding the
            // new principal. This isolates fee credits from the later add, whose
            // SETTLE_PAIR is then guaranteed to see debt-only deltas.
            _harvestPositionFees(positionTokenId, deadline);
            uint256 naraAfterHarvest = IERC20(token).balanceOf(address(this));
            uint256 baseAfterHarvest = IERC20(base).balanceOf(address(this));
            if (naraAfterHarvest < naraStartingBalance || baseAfterHarvest < baseStartingBalance) {
                revert TokenAccountingMismatch();
            }
            naraLpFeesHarvested = naraAfterHarvest - naraStartingBalance;
            baseLpFeesHarvested = baseAfterHarvest - baseStartingBalance;
        }

        uint256 naraBeforePull = IERC20(token).balanceOf(address(this));
        uint256 baseBeforePull = IERC20(base).balanceOf(address(this));
        _pullExact(token, maximumNara, naraBeforePull);
        _pullExact(base, maximumBase, baseBeforePull);

        (uint256 amount0Maximum, uint256 amount1Maximum) = tokenIsCurrency0
            ? (maximumNara, maximumBase)
            : (maximumBase, maximumNara);
        (uint160 sqrtPriceX96,,,) = IPoolManager(poolManager).getSlot0(poolId);
        if (sqrtPriceX96 == 0) revert InvalidConfiguration();
        uint128 requestedLiquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0Maximum,
            amount1Maximum
        );
        if (requestedLiquidity < minimumLiquidity) {
            revert InsufficientLiquidity(minimumLiquidity, requestedLiquidity);
        }

        _approvePositionManager(token, maximumNara, uint48(deadline));
        _approvePositionManager(base, maximumBase, uint48(deadline));
        if (newlyMinted) {
            positionTokenId = INARAPositionManagerStateV5(positionManager).nextTokenId();
            _mintPosition(positionTokenId, requestedLiquidity, uint128(amount0Maximum), uint128(amount1Maximum), deadline);
        } else {
            _increasePosition(positionTokenId, requestedLiquidity, uint128(amount0Maximum), uint128(amount1Maximum), deadline);
        }
        _revokePositionManager(token);
        _revokePositionManager(base);

        if (INARAPositionManagerStateV5(positionManager).ownerOf(positionTokenId) != compounder) {
            revert PositionAccountingMismatch();
        }
        uint128 liquidityAfter =
            INARAPositionManagerStateV5(positionManager).getPositionLiquidity(positionTokenId);
        if (liquidityAfter <= liquidityBefore) revert PositionAccountingMismatch();
        liquidityAdded = liquidityAfter - liquidityBefore;
        if (liquidityAdded < minimumLiquidity) {
            revert InsufficientLiquidity(minimumLiquidity, liquidityAdded);
        }

        uint256 naraAfterPosition = IERC20(token).balanceOf(address(this));
        uint256 baseAfterPosition = IERC20(base).balanceOf(address(this));
        uint256 naraPulledBalance = naraBeforePull + maximumNara;
        uint256 basePulledBalance = baseBeforePull + maximumBase;
        if (naraAfterPosition > naraPulledBalance || baseAfterPosition > basePulledBalance) {
            revert TokenAccountingMismatch();
        }
        naraUsed = naraPulledBalance - naraAfterPosition;
        baseUsed = basePulledBalance - baseAfterPosition;
        if (naraUsed == 0 || baseUsed == 0) revert TokenAccountingMismatch();
        if (naraUsed < minimumNaraUsed) revert InsufficientNaraUsed(minimumNaraUsed, naraUsed);
        if (baseUsed < minimumBaseUsed) revert InsufficientBaseUsed(minimumBaseUsed, baseUsed);

        uint256 naraReturn = naraAfterPosition - naraStartingBalance;
        uint256 baseReturn = baseAfterPosition - baseStartingBalance;
        if (naraReturn != 0) IERC20(token).safeTransfer(compounder, naraReturn);
        if (baseReturn != 0) IERC20(base).safeTransfer(compounder, baseReturn);
        if (
            IERC20(token).balanceOf(address(this)) != naraStartingBalance
                || IERC20(base).balanceOf(address(this)) != baseStartingBalance
        ) revert TokenAccountingMismatch();

        emit LiquidityAdded(
            positionTokenId,
            liquidityAdded,
            naraUsed,
            baseUsed,
            naraLpFeesHarvested,
            baseLpFeesHarvested,
            newlyMinted
        );
    }

    function _mintPosition(
        uint256 expectedTokenId,
        uint128 liquidity,
        uint128 amount0Max,
        uint128 amount1Max,
        uint64 deadline
    ) private {
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            _poolKey(),
            tickLower,
            tickUpper,
            uint256(liquidity),
            amount0Max,
            amount1Max,
            compounder,
            bytes("")
        );
        params[1] = abi.encode(_currency0, _currency1);
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        INARAPositionManagerStateV5(positionManager).modifyLiquidities(
            abi.encode(actions, params), deadline
        );
        if (INARAPositionManagerStateV5(positionManager).ownerOf(expectedTokenId) != compounder) {
            revert PositionAccountingMismatch();
        }
    }

    function _increasePosition(
        uint256 positionTokenId,
        uint128 liquidity,
        uint128 amount0Max,
        uint128 amount1Max,
        uint64 deadline
    ) private {
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            positionTokenId,
            uint256(liquidity),
            amount0Max,
            amount1Max,
            bytes("")
        );
        params[1] = abi.encode(_currency0, _currency1);
        bytes memory actions = abi.encodePacked(uint8(Actions.INCREASE_LIQUIDITY), uint8(Actions.SETTLE_PAIR));
        INARAPositionManagerStateV5(positionManager).modifyLiquidities(
            abi.encode(actions, params), deadline
        );
    }

    function _harvestPositionFees(uint256 positionTokenId, uint64 deadline) private {
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(positionTokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(_currency0, _currency1, address(this));
        bytes memory actions =
            abi.encodePacked(uint8(Actions.INCREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));
        INARAPositionManagerStateV5(positionManager).modifyLiquidities(
            abi.encode(actions, params), deadline
        );
    }

    function _approvePositionManager(address asset, uint256 amount, uint48 expiration) private {
        IERC20(asset).forceApprove(permit2, amount);
        INARAPermit2AllowanceV5(permit2).approve(asset, positionManager, uint160(amount), expiration);
    }

    function _revokePositionManager(address asset) private {
        INARAPermit2AllowanceV5(permit2).approve(asset, positionManager, 0, 0);
        IERC20(asset).forceApprove(permit2, 0);
    }

    function _pullExact(address asset, uint256 amount, uint256 beforeBalance) private {
        IERC20(asset).safeTransferFrom(compounder, address(this), amount);
        if (IERC20(asset).balanceOf(address(this)) - beforeBalance != amount) {
            revert TokenAccountingMismatch();
        }
    }

    function _poolKey() private view returns (PoolKey memory key) {
        key = PoolKey({
            currency0: _currency0,
            currency1: _currency1,
            fee: poolFee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hooks)
        });
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
