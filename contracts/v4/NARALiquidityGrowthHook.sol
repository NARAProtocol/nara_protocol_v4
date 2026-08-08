// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-periphery/lib/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-periphery/lib/v4-core/src/types/BeforeSwapDelta.sol";

interface INARALiquidityGrowthVault {
    function token() external view returns (address);
    function base() external view returns (address);
    function hook() external view returns (address);
    function recordPoolFee(address currency, uint256 amount, uint16 feeBps, address sender, bool isBuy) external;
}

/// @title NARA Liquidity Growth Hook
/// @notice Uniswap v4 exact-input swap hook that skims a configurable pool fee into
///         a vault. Fee pressure uses the configured protocolDepth captured on the
///         first same-currency flow in each block. Live pool depth is exposed for
///         monitoring, but momentary liquidity and price changes cannot reduce fees.
contract NARALiquidityGrowthHook is BaseHook, Ownable2Step {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_POOL_FEE_BPS = 5_000;
    uint24 public constant CANONICAL_POOL_FEE = 3_000;
    int24 public constant CANONICAL_TICK_SPACING = 60;
    uint48 public constant FEE_UPDATE_DELAY = 7 days;
    uint256 public constant MIN_PROTOCOL_DEPTH = 1_000_000;
    uint256 internal constant Q96 = 2 ** 96;

    struct FeeCurve {
        uint32 mediumPressureBps;
        uint32 highPressureBps;
        uint32 extremePressureBps;
        uint16 baseFeeBps;
        uint16 mediumFeeBps;
        uint16 highFeeBps;
        uint16 extremeFeeBps;
        uint16 maxFeeBps;
    }

    struct PendingFeeCurve {
        FeeCurve curve;
        uint48 eta;
        bool exists;
    }

    struct PendingProtocolDepth {
        uint256 depth;
        uint48 eta;
        bool exists;
    }

    address public immutable token;
    address public immutable base;
    INARALiquidityGrowthVault public immutable vault;

    PoolId public registeredPoolId;
    bool public poolRegistered;
    bool public tokenIsCurrency0;
    uint160 public expectedSqrtPriceX96;
    FeeCurve public buyCurve;
    FeeCurve public sellCurve;
    PendingFeeCurve public pendingBuyCurve;
    PendingFeeCurve public pendingSellCurve;
    mapping(address currency => uint256 depth) public protocolDepth;
    mapping(address currency => PendingProtocolDepth pending) public pendingProtocolDepth;
    mapping(address currency => uint256 blockNumber) public flowBlock;
    mapping(address currency => uint256 amount) public flowAmountInBlock;
    mapping(address currency => uint256 amount) public flowFeeChargedInBlock;
    mapping(address currency => uint256 depth) public flowDepthInBlock;
    mapping(address currency => FeeCurve curve) private _flowCurveInBlock;

    event PoolRegistered(PoolId indexed poolId, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing);
    event InitializationPriceBound(PoolId indexed poolId, uint160 expectedSqrtPriceX96);
    event FeeCurveSet(bool indexed isBuyCurve, FeeCurve curve);
    event FeeCurveProposed(bool indexed isBuyCurve, FeeCurve curve, uint48 eta);
    event FeeCurveCancelled(bool indexed isBuyCurve);
    event ProtocolDepthSet(address indexed currency, uint256 depth);
    event ProtocolDepthProposed(address indexed currency, uint256 depth, uint48 eta);
    event ProtocolDepthCancelled(address indexed currency);
    event PoolFeeTaken(
        PoolId indexed poolId,
        address indexed sender,
        address indexed currency,
        uint256 amountIn,
        uint256 feeAmount,
        uint16 feeBps,
        bool isBuy
    );
    error ZeroAddress();
    error InvalidTokenPair();
    error InvalidPoolConfig();
    error PoolAlreadyRegistered();
    error PoolNotRegistered();
    error UnauthorizedPool();
    error ExactOutputUnsupported();
    error AmountTooLarge();
    error InvalidCurve();
    error DepthTooSmall();
    error NoPendingUpdate();
    error UpdateNotReady();
    error ActiveFlowBlock();
    error ZeroInitializationPrice();
    error InvalidInitializationPrice(uint160 expected, uint160 actual);
    error VaultBindingMismatch();

    constructor(
        IPoolManager manager_,
        address owner_,
        address token_,
        address base_,
        INARALiquidityGrowthVault vault_
    ) BaseHook(manager_) Ownable(owner_) {
        if (token_ == address(0) || base_ == address(0) || token_ == base_) revert InvalidTokenPair();
        if (address(vault_) == address(0)) revert ZeroAddress();
        if (vault_.token() != token_ || vault_.base() != base_) revert InvalidTokenPair();

        token = token_;
        base = base_;
        vault = vault_;

        buyCurve = _defaultBuyCurve();
        sellCurve = _defaultSellCurve();
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory permissions) {
        permissions.beforeInitialize = true;
        permissions.beforeSwap = true;
        permissions.beforeSwapReturnDelta = true;
    }

    /// @notice Permanently binds the only supported pool and its opening price.
    /// @dev Worst case for a compromised owner is choosing a bad price before
    ///      registration. The value is immutable after this one-shot call and
    ///      every initializer, including PositionManager, must use it exactly.
    function registerPool(PoolKey calldata key, uint160 expectedSqrtPriceX96_) external onlyOwner {
        if (poolRegistered) revert PoolAlreadyRegistered();
        if (expectedSqrtPriceX96_ == 0) revert ZeroInitializationPrice();
        // Pool activation is impossible until the reciprocal Vault binding is
        // complete. This makes fee custody and Vault accounting atomic from the
        // first public swap rather than relying on an off-chain launch check.
        if (vault.hook() != address(this)) revert VaultBindingMismatch();
        _validatePoolKey(key);

        PoolKey memory keyMem = key;
        PoolId id = keyMem.toId();
        registeredPoolId = id;
        poolRegistered = true;
        tokenIsCurrency0 = Currency.unwrap(key.currency0) == token;
        expectedSqrtPriceX96 = expectedSqrtPriceX96_;

        emit PoolRegistered(id, Currency.unwrap(key.currency0), Currency.unwrap(key.currency1), key.fee, key.tickSpacing);
        emit InitializationPriceBound(id, expectedSqrtPriceX96_);
    }

    function setFeeCurve(bool isBuyCurve, FeeCurve calldata curve) external onlyOwner {
        _validateCurve(curve);

        if (!poolRegistered) {
            _setFeeCurve(isBuyCurve, curve);
            return;
        }

        uint48 eta = uint48(block.timestamp + FEE_UPDATE_DELAY);
        _stageFeeCurve(isBuyCurve, curve, eta);
    }

    function executeFeeCurve(bool isBuyCurve) external onlyOwner {
        if (isBuyCurve) {
            _executeFeeCurve(true, pendingBuyCurve);
        } else {
            _executeFeeCurve(false, pendingSellCurve);
        }
    }

    /// @notice Cancels a queued curve update without changing the active curve.
    /// @dev A compromised owner can only discard its own pending update; the
    ///      active curve and the seven-day delay for replacements are unchanged.
    function cancelFeeCurve(bool isBuyCurve) external onlyOwner {
        if (isBuyCurve) {
            if (!pendingBuyCurve.exists) revert NoPendingUpdate();
            delete pendingBuyCurve;
        } else {
            if (!pendingSellCurve.exists) revert NoPendingUpdate();
            delete pendingSellCurve;
        }
        emit FeeCurveCancelled(isBuyCurve);
    }

    function setProtocolDepth(address currency, uint256 depth) external onlyOwner {
        _validateProtocolDepth(currency, depth);

        if (!poolRegistered) {
            protocolDepth[currency] = depth;
            emit ProtocolDepthSet(currency, depth);
            return;
        }

        uint48 eta = uint48(block.timestamp + FEE_UPDATE_DELAY);
        pendingProtocolDepth[currency] = PendingProtocolDepth({depth: depth, eta: eta, exists: true});
        emit ProtocolDepthProposed(currency, depth, eta);
    }

    function executeProtocolDepth(address currency) external onlyOwner {
        if (currency != token && currency != base) revert InvalidTokenPair();
        PendingProtocolDepth storage pending = pendingProtocolDepth[currency];
        if (!pending.exists) revert NoPendingUpdate();
        if (block.timestamp < pending.eta) revert UpdateNotReady();

        uint256 depth = pending.depth;
        delete pendingProtocolDepth[currency];
        protocolDepth[currency] = depth;
        emit ProtocolDepthSet(currency, depth);
    }

    /// @notice Cancels a queued depth update without changing active depth.
    /// @dev A compromised owner can only discard its own pending update; the
    ///      active depth and the seven-day delay for replacements are unchanged.
    function cancelProtocolDepth(address currency) external onlyOwner {
        if (currency != token && currency != base) revert InvalidTokenPair();
        if (!pendingProtocolDepth[currency].exists) revert NoPendingUpdate();
        delete pendingProtocolDepth[currency];
        emit ProtocolDepthCancelled(currency);
    }

    /// @notice Quotes the next incremental fee using the active block's flow.
    /// @dev `marginalFeeBps` is the terminal pressure tier, while `feeAmount`
    ///      is the authoritative piecewise-integrated charge for this input.
    function quotePoolFee(bool isBuy, uint256 amountIn)
        external
        view
        returns (uint16 marginalFeeBps, uint256 feeAmount)
    {
        (marginalFeeBps, feeAmount) = _quotePoolFee(isBuy, amountIn);
    }

    /// @notice Quotes marginal and effective rates separately for integrations.
    function quotePoolFeeDetailed(bool isBuy, uint256 amountIn)
        external
        view
        returns (uint16 marginalFeeBps, uint16 effectiveFeeBps, uint256 feeAmount)
    {
        (marginalFeeBps, feeAmount) = _quotePoolFee(isBuy, amountIn);
        if (amountIn != 0) {
            uint256 effective = Math.mulDiv(feeAmount, BPS, amountIn);
            effectiveFeeBps = uint16(effective > type(uint16).max ? type(uint16).max : effective);
        }
    }

    function _quotePoolFee(bool isBuy, uint256 amountIn)
        internal
        view
        returns (uint16 marginalFeeBps, uint256 feeAmount)
    {
        address inputCurrency = isBuy ? base : token;
        bool activeFlow = flowBlock[inputCurrency] == block.number;
        uint256 depth = activeFlow ? flowDepthInBlock[inputCurrency] : protocolDepth[inputCurrency];
        FeeCurve memory curve = activeFlow ? _flowCurveInBlock[inputCurrency] : (isBuy ? buyCurve : sellCurve);
        uint256 accumulated = activeFlow ? flowAmountInBlock[inputCurrency] : 0;
        uint256 prevFeeCharged = activeFlow ? flowFeeChargedInBlock[inputCurrency] : 0;
        uint256 pressureAmountIn = accumulated + amountIn;

        marginalFeeBps = _feeBps(curve, pressureAmountIn, depth);
        uint256 totalFeeDue = _cumulativeFee(curve, pressureAmountIn, depth);
        feeAmount = totalFeeDue > prevFeeCharged ? totalFeeDue - prevFeeCharged : 0;
    }

    function _beforeInitialize(address, PoolKey calldata key, uint160 sqrtPriceX96)
        internal
        view
        override
        returns (bytes4)
    {
        _requireRegisteredPool(key);
        uint160 expected = expectedSqrtPriceX96;
        if (sqrtPriceX96 != expected) {
            revert InvalidInitializationPrice(expected, sqrtPriceX96);
        }
        return IHooks.beforeInitialize.selector;
    }

    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId id = _requireRegisteredPool(key);
        if (params.amountSpecified >= 0) revert ExactOutputUnsupported();
        if (params.amountSpecified == type(int256).min) revert AmountTooLarge();

        Currency specified = params.zeroForOne ? key.currency0 : key.currency1;
        address inputCurrency = Currency.unwrap(specified);
        bool isBuy;
        if (inputCurrency == base) {
            isBuy = true;
        } else if (inputCurrency == token) {
            isBuy = false;
        } else {
            revert InvalidTokenPair();
        }

        uint256 amountIn = uint256(-params.amountSpecified);
        (uint256 pressureAmountIn, uint256 previousFeeCharged, uint256 depth, FeeCurve memory curve) =
            _recordBlockFlow(inputCurrency, amountIn, isBuy);
        uint16 feeBps = _feeBps(curve, pressureAmountIn, depth);
        uint256 totalFeeDue = _cumulativeFee(curve, pressureAmountIn, depth);
        uint256 feeAmount = totalFeeDue > previousFeeCharged ? totalFeeDue - previousFeeCharged : 0;
        flowFeeChargedInBlock[inputCurrency] = previousFeeCharged + feeAmount;
        if (feeAmount == 0) return (IHooks.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        if (feeAmount > uint256(uint128(type(int128).max))) revert AmountTooLarge();

        poolManager.take(specified, address(vault), feeAmount);
        // Fail closed. If accounting cannot be recorded, the complete PoolManager
        // callback (including `take`) reverts, so custody and lifetime counters
        // can never diverge silently.
        vault.recordPoolFee(inputCurrency, feeAmount, feeBps, sender, isBuy);

        emit PoolFeeTaken(id, sender, inputCurrency, amountIn, feeAmount, feeBps, isBuy);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(uint128(feeAmount)), 0), 0);
    }

    function probeLiveDepth(address inputCurrency) external view returns (uint256) {
        if (inputCurrency != token && inputCurrency != base) revert InvalidTokenPair();
        if (!poolRegistered || PoolId.unwrap(registeredPoolId) == bytes32(0)) {
            return 0;
        }
        return _probeLiveDepth(registeredPoolId, inputCurrency);
    }

    function _recordBlockFlow(address inputCurrency, uint256 amountIn, bool isBuy)
        internal
        returns (
            uint256 cumulativeAmountIn,
            uint256 previousFeeCharged,
            uint256 depth,
            FeeCurve memory curve
        )
    {
        if (flowBlock[inputCurrency] != block.number) {
            depth = protocolDepth[inputCurrency];
            curve = isBuy ? buyCurve : sellCurve;
            flowBlock[inputCurrency] = block.number;
            flowAmountInBlock[inputCurrency] = amountIn;
            flowFeeChargedInBlock[inputCurrency] = 0;
            flowDepthInBlock[inputCurrency] = depth;
            _flowCurveInBlock[inputCurrency] = curve;
            return (amountIn, 0, depth, curve);
        }
        depth = flowDepthInBlock[inputCurrency];
        curve = _flowCurveInBlock[inputCurrency];
        previousFeeCharged = flowFeeChargedInBlock[inputCurrency];
        cumulativeAmountIn = flowAmountInBlock[inputCurrency] + amountIn;
        flowAmountInBlock[inputCurrency] = cumulativeAmountIn;
    }

    function _probeLiveDepth(PoolId poolId, address inputCurrency) internal view returns (uint256) {
        uint128 liquidity = poolManager.getLiquidity(poolId);
        if (liquidity == 0) {
            return 0;
        }

        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        if (sqrtPriceX96 == 0) {
            return 0;
        }

        bool inputIsCurrency0 = inputCurrency == token ? tokenIsCurrency0 : !tokenIsCurrency0;

        if (inputIsCurrency0) {
            return Math.mulDiv(uint256(liquidity), Q96, uint256(sqrtPriceX96));
        }
        return Math.mulDiv(uint256(liquidity), uint256(sqrtPriceX96), Q96);
    }

    function _requireRegisteredPool(PoolKey calldata key) internal view returns (PoolId id) {
        if (!poolRegistered) revert PoolNotRegistered();
        _validatePoolKey(key);

        PoolKey memory keyMem = key;
        id = keyMem.toId();
        if (PoolId.unwrap(id) != PoolId.unwrap(registeredPoolId)) revert UnauthorizedPool();
    }

    function _validatePoolKey(PoolKey calldata key) internal view {
        if (address(key.hooks) != address(this)) revert UnauthorizedPool();
        if (key.fee != CANONICAL_POOL_FEE || key.tickSpacing != CANONICAL_TICK_SPACING) {
            revert InvalidPoolConfig();
        }

        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (uint160(c0) >= uint160(c1)) revert InvalidTokenPair();
        bool pairMatches = (c0 == token && c1 == base) || (c0 == base && c1 == token);
        if (!pairMatches) revert InvalidTokenPair();
    }

    /// @dev Aligned floor rounding matching `_cumulativeFee` thresholds exactly.
    function _feeBps(FeeCurve memory curve, uint256 amountIn, uint256 depth) internal pure returns (uint16) {
        if (depth == 0) return curve.extremeFeeBps > curve.maxFeeBps ? curve.maxFeeBps : curve.extremeFeeBps;

        uint256 mediumAt = Math.mulDiv(depth, uint256(curve.mediumPressureBps), BPS);
        uint256 highAt = Math.mulDiv(depth, uint256(curve.highPressureBps), BPS);
        uint256 extremeAt = Math.mulDiv(depth, uint256(curve.extremePressureBps), BPS);

        uint16 bps = curve.baseFeeBps;
        if (amountIn >= extremeAt) {
            bps = curve.extremeFeeBps;
        } else if (amountIn >= highAt) {
            bps = curve.highFeeBps;
        } else if (amountIn >= mediumAt) {
            bps = curve.mediumFeeBps;
        }

        return bps > curve.maxFeeBps ? curve.maxFeeBps : bps;
    }

    /// @dev Piecewise cumulative fee integral using aligned threshold floor calculation.
    function _cumulativeFee(FeeCurve memory curve, uint256 amountIn, uint256 depth)
        internal
        pure
        returns (uint256 fee)
    {
        if (amountIn == 0) return 0;
        if (depth == 0) return Math.mulDiv(amountIn, _feeBps(curve, amountIn, 0), BPS);

        uint256 mediumAt = Math.mulDiv(depth, uint256(curve.mediumPressureBps), BPS);
        uint256 highAt = Math.mulDiv(depth, uint256(curve.highPressureBps), BPS);
        uint256 extremeAt = Math.mulDiv(depth, uint256(curve.extremePressureBps), BPS);

        uint256 end = amountIn < mediumAt ? amountIn : mediumAt;
        fee = Math.mulDiv(end, curve.baseFeeBps, BPS);
        if (amountIn <= mediumAt) return fee;

        end = amountIn < highAt ? amountIn : highAt;
        fee += Math.mulDiv(end - mediumAt, curve.mediumFeeBps, BPS);
        if (amountIn <= highAt) return fee;

        end = amountIn < extremeAt ? amountIn : extremeAt;
        fee += Math.mulDiv(end - highAt, curve.highFeeBps, BPS);
        if (amountIn <= extremeAt) return fee;

        fee += Math.mulDiv(amountIn - extremeAt, curve.extremeFeeBps, BPS);
    }

    function _validateCurve(FeeCurve memory curve) internal pure {
        if (
            curve.mediumPressureBps == 0 ||
            curve.mediumPressureBps >= curve.highPressureBps ||
            curve.highPressureBps >= curve.extremePressureBps ||
            curve.maxFeeBps > MAX_POOL_FEE_BPS ||
            curve.baseFeeBps > curve.maxFeeBps ||
            curve.mediumFeeBps > curve.maxFeeBps ||
            curve.highFeeBps > curve.maxFeeBps ||
            curve.extremeFeeBps > curve.maxFeeBps
        ) revert InvalidCurve();
    }

    function _validateProtocolDepth(address currency, uint256 depth) internal view {
        if (currency != token && currency != base) revert InvalidTokenPair();
        if (depth != 0 && depth < MIN_PROTOCOL_DEPTH) revert DepthTooSmall();
    }

    function _setFeeCurve(bool isBuyCurve, FeeCurve memory curve) internal {
        if (isBuyCurve) {
            buyCurve = curve;
        } else {
            sellCurve = curve;
        }

        emit FeeCurveSet(isBuyCurve, curve);
    }

    function _stageFeeCurve(bool isBuyCurve, FeeCurve memory curve, uint48 eta) internal {
        if (isBuyCurve) {
            pendingBuyCurve = PendingFeeCurve({curve: curve, eta: eta, exists: true});
        } else {
            pendingSellCurve = PendingFeeCurve({curve: curve, eta: eta, exists: true});
        }

        emit FeeCurveProposed(isBuyCurve, curve, eta);
    }

    function _executeFeeCurve(bool isBuyCurve, PendingFeeCurve storage pending) internal {
        if (!pending.exists) revert NoPendingUpdate();
        if (block.timestamp < pending.eta) revert UpdateNotReady();

        FeeCurve memory curve = pending.curve;
        if (isBuyCurve) {
            delete pendingBuyCurve;
        } else {
            delete pendingSellCurve;
        }

        _setFeeCurve(isBuyCurve, curve);
    }

    function _defaultBuyCurve() internal pure returns (FeeCurve memory curve) {
        curve = FeeCurve({
            mediumPressureBps: 500,
            highPressureBps: 1_500,
            extremePressureBps: 3_000,
            baseFeeBps: 500,
            mediumFeeBps: 800,
            highFeeBps: 1_200,
            extremeFeeBps: 2_000,
            maxFeeBps: 2_000
        });
    }

    function _defaultSellCurve() internal pure returns (FeeCurve memory curve) {
        curve = FeeCurve({
            mediumPressureBps: 500,
            highPressureBps: 1_500,
            extremePressureBps: 3_000,
            baseFeeBps: 500,
            mediumFeeBps: 700,
            highFeeBps: 1_000,
            extremeFeeBps: 1_500,
            maxFeeBps: 2_000
        });
    }
}
