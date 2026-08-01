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
import {PositionInfo, PositionInfoLibrary} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

import {INARANamedPOLProviderV5} from "../interfaces/liquidity/INARANamedPOLProviderV5.sol";
import {INARAPositionManagerStateV5} from "../interfaces/liquidity/INARAPositionManagerStateV5.sol";

interface INARASeedPermit2AllowanceV5 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface INARASeedPositionManagerBindingsV5 {
    function poolManager() external view returns (address);
    function permit2() external view returns (address);
}

interface INARASeedHookBindingsV5 {
    function token() external view returns (address);
    function base() external view returns (address);
    function poolManager() external view returns (address);
    function poolId() external view returns (PoolId);
    function expectedSqrtPriceX96() external view returns (uint160);
}

/// @title NARA Seed Position Initializer V5
/// @notice One-shot, no-swap initializer that mints the exact canonical seed
///         PositionManager NFT directly into the sealed-designated custody.
/// @dev It has no repeat, increase, decrease, transfer, or arbitrary-call
///      surface. ERC-20 and Permit2 allowances exist only inside `initialize`,
///      all unused input is refunded, and the initializer ends with zero token
///      balances. The custody configuration authority separately registers the
///      verified NFT before sealing the wider companion graph.
contract NARASeedPositionInitializerV5 is ReentrancyGuard {
    using CurrencyLibrary for Currency;
    using PoolIdLibrary for PoolKey;
    using PositionInfoLibrary for PositionInfo;
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;

    address public immutable initializerAuthority;
    address public immutable token;
    address public immutable base;
    address public immutable poolManager;
    address public immutable positionManager;
    address public immutable permit2;
    address public immutable seedCustody;
    uint256 public immutable configuredMinimumNaraUsed;
    uint256 public immutable configuredMinimumBaseUsed;
    PoolId public immutable poolId;
    uint160 public immutable expectedSqrtPriceX96;
    int24 public immutable tickLower;
    int24 public immutable tickUpper;
    bytes32 public immutable configurationHash;
    bool public immutable tokenIsCurrency0;

    Currency private immutable _currency0;
    Currency private immutable _currency1;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;
    address public immutable hooks;

    bool public initialized;
    uint256 public positionTokenId;
    uint128 public liquidityAdded;
    uint256 public naraUsed;
    uint256 public baseUsed;

    event SeedPositionInitialized(
        uint256 indexed positionTokenId,
        address indexed seedCustody,
        uint128 liquidityAdded,
        uint256 naraUsed,
        uint256 baseUsed
    );

    error ZeroAddress();
    error NotAContract();
    error Unauthorized();
    error AlreadyInitialized();
    error InvalidConfiguration();
    error Expired();
    error AmountTooLarge();
    error MinimumUsageBelowConfiguration();
    error InsufficientLiquidity(uint128 minimum, uint128 actual);
    error InsufficientNaraUsed(uint256 minimum, uint256 actual);
    error InsufficientBaseUsed(uint256 minimum, uint256 actual);
    error TokenAccountingMismatch();
    error PositionAccountingMismatch();
    error EtherNotAccepted();

    constructor(
        address initializerAuthority_,
        address token_,
        address base_,
        address poolManager_,
        address positionManager_,
        address permit2_,
        address seedCustody_,
        uint256 configuredMinimumNaraUsed_,
        uint256 configuredMinimumBaseUsed_,
        PoolKey memory poolKey_,
        int24 tickLower_,
        int24 tickUpper_
    ) {
        if (
            initializerAuthority_ == address(0) || token_ == address(0) || base_ == address(0)
                || poolManager_ == address(0) || positionManager_ == address(0)
                || permit2_ == address(0) || seedCustody_ == address(0)
        ) revert ZeroAddress();
        if (
            token_.code.length == 0 || base_.code.length == 0 || poolManager_.code.length == 0
                || positionManager_.code.length == 0 || permit2_.code.length == 0
                || seedCustody_.code.length == 0
        ) revert NotAContract();
        if (token_ == base_ || poolKey_.tickSpacing <= 0 || tickLower_ >= tickUpper_) {
            revert InvalidConfiguration();
        }
        if (
            configuredMinimumNaraUsed_ == 0 || configuredMinimumBaseUsed_ == 0
                || configuredMinimumNaraUsed_ > type(uint128).max
                || configuredMinimumBaseUsed_ > type(uint128).max
        ) revert InvalidConfiguration();
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
        if (hookAddress == address(0)) revert InvalidConfiguration();
        if (hookAddress.code.length == 0) revert NotAContract();
        if (
            INARASeedPositionManagerBindingsV5(positionManager_).poolManager() != poolManager_
                || INARASeedPositionManagerBindingsV5(positionManager_).permit2() != permit2_
        ) revert InvalidConfiguration();

        PoolId configuredPoolId = poolKey_.toId();
        INARASeedHookBindingsV5 hookBinding = INARASeedHookBindingsV5(hookAddress);
        if (
            hookBinding.token() != token_ || hookBinding.base() != base_
                || hookBinding.poolManager() != poolManager_
                || PoolId.unwrap(hookBinding.poolId()) != PoolId.unwrap(configuredPoolId)
        ) revert InvalidConfiguration();
        uint160 configuredSqrtPriceX96 = hookBinding.expectedSqrtPriceX96();
        if (configuredSqrtPriceX96 == 0) revert InvalidConfiguration();
        INARANamedPOLProviderV5 custody = INARANamedPOLProviderV5(seedCustody_);
        if (
            custody.positionManager() != positionManager_
                || PoolId.unwrap(custody.poolId()) != PoolId.unwrap(configuredPoolId)
                || custody.tickLower() != tickLower_ || custody.tickUpper() != tickUpper_
                || custody.positionTokenId() != 0 || custody.configurationSealed() || custody.retired()
        ) revert InvalidConfiguration();

        initializerAuthority = initializerAuthority_;
        token = token_;
        base = base_;
        poolManager = poolManager_;
        positionManager = positionManager_;
        permit2 = permit2_;
        seedCustody = seedCustody_;
        configuredMinimumNaraUsed = configuredMinimumNaraUsed_;
        configuredMinimumBaseUsed = configuredMinimumBaseUsed_;
        tokenIsCurrency0 = tokenIs0;
        _currency0 = poolKey_.currency0;
        _currency1 = poolKey_.currency1;
        poolFee = poolKey_.fee;
        tickSpacing = poolKey_.tickSpacing;
        hooks = hookAddress;
        poolId = configuredPoolId;
        expectedSqrtPriceX96 = configuredSqrtPriceX96;
        tickLower = tickLower_;
        tickUpper = tickUpper_;
        configurationHash = keccak256(
            abi.encode(
                keccak256("NARA_SEED_POSITION_INITIALIZER_V5"),
                block.chainid,
                address(this),
                initializerAuthority_,
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
                seedCustody_,
                seedCustody_.codehash,
                configuredMinimumNaraUsed_,
                configuredMinimumBaseUsed_,
                hookAddress,
                hookAddress.codehash,
                PoolId.unwrap(configuredPoolId),
                configuredSqrtPriceX96,
                tickLower_,
                tickUpper_
            )
        );
    }

    function initialize(
        uint256 maximumNara,
        uint256 maximumBase,
        uint256 minimumNaraUsed,
        uint256 minimumBaseUsed,
        uint128 minimumLiquidity,
        uint64 deadline
    )
        external
        nonReentrant
        returns (uint256 mintedTokenId, uint128 mintedLiquidity, uint256 actualNaraUsed, uint256 actualBaseUsed)
    {
        if (msg.sender != initializerAuthority) revert Unauthorized();
        if (initialized) revert AlreadyInitialized();
        if (block.timestamp > deadline || deadline > type(uint48).max) revert Expired();
        if (
            maximumNara == 0 || maximumBase == 0 || minimumLiquidity == 0
                || minimumNaraUsed == 0 || minimumBaseUsed == 0
                || minimumNaraUsed > maximumNara || minimumBaseUsed > maximumBase
                || maximumNara > type(uint128).max || maximumBase > type(uint128).max
        ) revert AmountTooLarge();
        if (
            minimumNaraUsed < configuredMinimumNaraUsed
                || minimumBaseUsed < configuredMinimumBaseUsed
        ) revert MinimumUsageBelowConfiguration();

        INARANamedPOLProviderV5 custody = INARANamedPOLProviderV5(seedCustody);
        if (custody.positionTokenId() != 0 || custody.configurationSealed() || custody.retired()) {
            revert InvalidConfiguration();
        }
        initialized = true;

        _clearDonation(token);
        _clearDonation(base);
        _pullExact(token, maximumNara);
        _pullExact(base, maximumBase);

        (uint256 amount0Maximum, uint256 amount1Maximum) = tokenIsCurrency0
            ? (maximumNara, maximumBase)
            : (maximumBase, maximumNara);
        (uint160 sqrtPriceX96,,,) = IPoolManager(poolManager).getSlot0(poolId);
        if (sqrtPriceX96 != expectedSqrtPriceX96) revert InvalidConfiguration();
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
        mintedTokenId = INARAPositionManagerStateV5(positionManager).nextTokenId();
        _mintPosition(mintedTokenId, requestedLiquidity, uint128(amount0Maximum), uint128(amount1Maximum), deadline);
        _revokePositionManager(token);
        _revokePositionManager(base);

        mintedLiquidity = _validatePosition(mintedTokenId);
        if (mintedLiquidity != requestedLiquidity || mintedLiquidity < minimumLiquidity) {
            revert PositionAccountingMismatch();
        }

        uint256 naraRemainder = IERC20(token).balanceOf(address(this));
        uint256 baseRemainder = IERC20(base).balanceOf(address(this));
        if (naraRemainder > maximumNara || baseRemainder > maximumBase) {
            revert TokenAccountingMismatch();
        }
        actualNaraUsed = maximumNara - naraRemainder;
        actualBaseUsed = maximumBase - baseRemainder;
        if (actualNaraUsed == 0 || actualBaseUsed == 0) revert TokenAccountingMismatch();
        if (actualNaraUsed < minimumNaraUsed) {
            revert InsufficientNaraUsed(minimumNaraUsed, actualNaraUsed);
        }
        if (actualBaseUsed < minimumBaseUsed) {
            revert InsufficientBaseUsed(minimumBaseUsed, actualBaseUsed);
        }
        if (naraRemainder != 0) IERC20(token).safeTransfer(initializerAuthority, naraRemainder);
        if (baseRemainder != 0) IERC20(base).safeTransfer(initializerAuthority, baseRemainder);
        if (IERC20(token).balanceOf(address(this)) != 0 || IERC20(base).balanceOf(address(this)) != 0) {
            revert TokenAccountingMismatch();
        }

        positionTokenId = mintedTokenId;
        liquidityAdded = mintedLiquidity;
        naraUsed = actualNaraUsed;
        baseUsed = actualBaseUsed;
        emit SeedPositionInitialized(
            mintedTokenId,
            seedCustody,
            mintedLiquidity,
            actualNaraUsed,
            actualBaseUsed
        );
    }

    function poolKey() external view returns (PoolKey memory key) {
        key = _poolKey();
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
            seedCustody,
            bytes("")
        );
        params[1] = abi.encode(_currency0, _currency1);
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        INARAPositionManagerStateV5(positionManager).modifyLiquidities(abi.encode(actions, params), deadline);
        if (INARAPositionManagerStateV5(positionManager).ownerOf(expectedTokenId) != seedCustody) {
            revert PositionAccountingMismatch();
        }
    }

    function _validatePosition(uint256 tokenId_) private view returns (uint128 liquidity) {
        INARAPositionManagerStateV5 manager = INARAPositionManagerStateV5(positionManager);
        if (manager.ownerOf(tokenId_) != seedCustody) revert PositionAccountingMismatch();
        (PoolKey memory key, PositionInfo info) = manager.getPoolAndPositionInfo(tokenId_);
        if (
            PoolId.unwrap(key.toId()) != PoolId.unwrap(poolId) || info.tickLower() != tickLower
                || info.tickUpper() != tickUpper
        ) revert PositionAccountingMismatch();
        liquidity = manager.getPositionLiquidity(tokenId_);
    }

    function _approvePositionManager(address asset, uint256 amount, uint48 expiration) private {
        IERC20(asset).forceApprove(permit2, amount);
        INARASeedPermit2AllowanceV5(permit2).approve(asset, positionManager, uint160(amount), expiration);
    }

    function _revokePositionManager(address asset) private {
        INARASeedPermit2AllowanceV5(permit2).approve(asset, positionManager, 0, 0);
        IERC20(asset).forceApprove(permit2, 0);
    }

    function _pullExact(address asset, uint256 amount) private {
        uint256 beforeBalance = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransferFrom(initializerAuthority, address(this), amount);
        if (IERC20(asset).balanceOf(address(this)) - beforeBalance != amount) {
            revert TokenAccountingMismatch();
        }
    }

    function _clearDonation(address asset) private {
        uint256 donated = IERC20(asset).balanceOf(address(this));
        if (donated != 0) IERC20(asset).safeTransfer(initializerAuthority, donated);
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
