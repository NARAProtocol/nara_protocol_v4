// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {TransientSlot} from "@openzeppelin/contracts/utils/TransientSlot.sol";

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

import {INARALiquidityGrowthVaultV5} from "./interfaces/INARALiquidityGrowthVaultV5.sol";
import {INARALiquidityPhaseControllerV5} from "./interfaces/INARALiquidityPhaseControllerV5.sol";

/// @title NARA Liquidity Growth Hook V5
/// @notice Canonical-pool, exact-input hook with flat phase fees on both the
///         actual input and actual output assets. Bootstrap is fixed at 15%
///         per leg. Every later phase is constructor-frozen and strictly lower.
/// @dev The callback `swapCaller` is normally a router, not the end user. It is
///      emitted for receipt reconciliation and is never used for fee identity.
contract NARALiquidityGrowthHookV5 is BaseHook, Ownable {
    using BalanceDeltaLibrary for BalanceDelta;
    using CurrencyLibrary for Currency;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using TransientSlot for bytes32;
    using TransientSlot for TransientSlot.BooleanSlot;
    using TransientSlot for TransientSlot.Bytes32Slot;
    using TransientSlot for TransientSlot.Uint256Slot;

    struct SwapProtection {
        uint8 version;
        uint8 minimumAcceptedPhase;
        uint16 maximumPerLegFeeBps;
        uint16 maximumNominalCombinedHookFeeBps;
        uint64 deadline;
        bytes32 expectedPhaseScheduleHash;
        uint256 minimumNetOutput;
    }

    uint16 public constant BPS = 10_000;
    uint16 public constant BOOTSTRAP_FEE_BPS = 1_500;
    uint16 public constant PHASE_STEP_FEE_BPS = 250;
    uint16 public constant MIN_LEG_FEE_BPS = 500;
    uint16 public constant MAX_LEG_FEE_BPS = 1_500;
    uint16 public constant MAX_COMBINED_EFFECTIVE_FEE_BPS = 2_775;
    uint8 public constant FIXED_PHASE_COUNT = 5;
    uint8 public constant SWAP_PROTECTION_VERSION = 1;
    uint256 public constant SWAP_PROTECTION_ENCODED_LENGTH = 224;
    uint256 public constant MINIMUM_AMOUNT_FOR_ONE_BPS_ROUNDING_BOUND = 10_000;
    uint256 public constant MAX_ROUNDING_SURCHARGE_RAW_PER_LEG = 1;
    uint24 public constant CANONICAL_POOL_FEE = 3_000;
    int24 public constant CANONICAL_TICK_SPACING = 60;

    bytes32 private constant _CTX_ACTIVE_SLOT = keccak256("nara.v5.hook.swap.active");
    bytes32 private constant _CTX_HASH_SLOT = keccak256("nara.v5.hook.swap.hash");
    bytes32 private constant _CTX_GROSS_INPUT_SLOT = keccak256("nara.v5.hook.swap.gross-input");
    bytes32 private constant _CTX_INPUT_FEE_SLOT = keccak256("nara.v5.hook.swap.input-fee");
    bytes32 private constant _CTX_PHASE_DATA_SLOT = keccak256("nara.v5.hook.swap.phase-data");
    bytes32 private constant _CTX_INPUT_CLAIM_BALANCE_SLOT = keccak256("nara.v5.hook.swap.input-claim-balance");
    bytes32 private constant _CTX_MINIMUM_NET_OUTPUT_SLOT = keccak256("nara.v5.hook.swap.minimum-net-output");

    address public immutable token;
    address public immutable base;
    INARALiquidityGrowthVaultV5 public immutable vault;
    INARALiquidityPhaseControllerV5 public phaseController;
    PoolId public immutable poolId;
    uint160 public immutable expectedSqrtPriceX96;
    int24 public immutable expectedOpeningTick;
    uint256 public immutable minimumBootstrapLiquidity;
    uint256 public immutable minimumTokenAmount;
    uint256 public immutable minimumBaseAmount;
    bytes32 public immutable phaseScheduleHash;
    bytes32 public immutable vaultCodeHash;
    bytes32 public phaseControllerCodeHash;
    bool public immutable tokenIsCurrency0;

    bool public poolActive;
    bool public poolRetired;
    bytes32 public vaultConfigurationHash;
    bytes32 public phaseControllerConfigurationHash;
    uint8 public currentPhase;
    uint16[] private _phaseFeeBps;
    uint128[] private _phaseMinimumActiveLiquidity;

    event CanonicalPoolBound(
        PoolId indexed poolId,
        address indexed currency0,
        address indexed currency1,
        uint24 fee,
        int24 tickSpacing,
        uint160 expectedSqrtPriceX96
    );
    event PhaseControllerBound(address indexed phaseController, bytes32 indexed codeHash);
    event PoolActivated(
        PoolId indexed poolId,
        uint256 activeProtocolLiquidity,
        bytes32 phaseScheduleHash,
        int24 openingTick,
        uint24 protocolFee,
        uint24 lpFee
    );
    event CompanionConfigurationsPinned(bytes32 indexed vaultConfigurationHash, bytes32 indexed controllerConfigurationHash);
    event PhaseAdvanced(
        uint8 indexed previousPhase,
        uint8 indexed newPhase,
        uint16 feeBps,
        uint256 minimumActiveLiquidity,
        uint256 verifiedActiveLiquidity
    );
    event PoolRetired(PoolId indexed poolId, uint8 indexed finalPhase);
    event SwapFeeClaimsAccrued(
        PoolId indexed poolId,
        address indexed swapCaller,
        uint8 indexed phase,
        address inputCurrency,
        address outputCurrency,
        uint256 grossInput,
        uint256 inputFee,
        uint256 ammInput,
        uint256 grossOutput,
        uint256 outputFee,
        uint256 netOutput,
        uint16 feeBps,
        bool isBuy
    );

    error ZeroAddress();
    error NotAContract();
    error InvalidTokenPair();
    error InvalidPoolConfig();
    error UnauthorizedPool();
    error ZeroInitializationPrice();
    error InvalidInitializationPrice(uint160 expected, uint160 actual);
    error InvalidPhaseSchedule();
    error InvalidLiquiditySchedule();
    error InvalidMinimumTradeAmount();
    error FeeCapExceeded();
    error PoolInactive();
    error PoolAlreadyActive();
    error PoolPermanentlyRetired();
    error VaultBindingMismatch();
    error PhaseControllerBindingMismatch();
    error PhaseControllerAlreadyBound();
    error PhaseControllerActivationBlocked();
    error CompanionCodeHashMismatch();
    error CompanionConfigurationUnsealed();
    error CompanionConfigurationMismatch();
    error InsufficientBootstrapLiquidity(uint256 required, uint256 actual);
    error InsufficientPhaseLiquidity(uint8 phase, uint256 required, uint256 actual);
    error ProtocolLiquidityExceedsPoolLiquidity(uint256 protocolLiquidity, uint256 poolLiquidity);
    error ExactOutputUnsupported();
    error ZeroAmount();
    error AmountTooLarge();
    error TradeTooSmall();
    error TradeAmountBelowMinimum(uint256 minimum, uint256 actual);
    error InvalidSwapDelta();
    error PartialFillUnsupported(uint256 expectedAmmInput, uint256 actualAmmInput);
    error FeeClaimMintMismatch(address currency, uint256 expected, uint256 actual);
    error NestedSwapUnsupported();
    error MissingSwapContext();
    error SwapContextMismatch();
    error InvalidHookData();
    error UnsupportedSwapProtectionVersion(uint8 supplied);
    error SwapProtectionExpired(uint64 deadline, uint256 currentTimestamp);
    error PhaseBelowMinimumAccepted(uint8 minimumAccepted, uint8 actual);
    error UnexpectedPhaseSchedule(bytes32 expected, bytes32 actual);
    error PerLegFeeLimitExceeded(uint16 currentFeeBps, uint16 maximumFeeBps);
    error NominalCombinedFeeLimitExceeded(uint16 currentFeeBps, uint16 maximumFeeBps);
    error MinimumNetOutputNotMet(uint256 minimum, uint256 actual);
    error UnauthorizedPhaseController();
    error InvalidPhaseAdvance();

    constructor(
        IPoolManager manager_,
        address owner_,
        address token_,
        address base_,
        INARALiquidityGrowthVaultV5 vault_,
        uint160 expectedSqrtPriceX96_,
        uint256 minimumBootstrapLiquidity_,
        uint256 minimumTokenAmount_,
        uint256 minimumBaseAmount_,
        uint16[] memory laterPhaseFeeBps_,
        uint128[] memory laterPhaseMinimumActiveLiquidity_
    ) BaseHook(manager_) Ownable(owner_) {
        if (token_ == address(0) || base_ == address(0) || token_ == base_) revert InvalidTokenPair();
        if (address(vault_) == address(0)) revert ZeroAddress();
        if (
            address(manager_).code.length == 0 || token_.code.length == 0 || base_.code.length == 0
                || address(vault_).code.length == 0
        ) revert NotAContract();
        if (expectedSqrtPriceX96_ == 0) revert ZeroInitializationPrice();
        int24 expectedOpeningTick_ = TickMath.getTickAtSqrtPrice(expectedSqrtPriceX96_);
        if (minimumBootstrapLiquidity_ == 0 || minimumBootstrapLiquidity_ > type(uint128).max) {
            revert InvalidPoolConfig();
        }
        if (
            minimumTokenAmount_ < MINIMUM_AMOUNT_FOR_ONE_BPS_ROUNDING_BOUND
                || minimumBaseAmount_ < MINIMUM_AMOUNT_FOR_ONE_BPS_ROUNDING_BOUND
                || minimumTokenAmount_ > uint256(uint128(type(int128).max))
                || minimumBaseAmount_ > uint256(uint128(type(int128).max))
        ) revert InvalidMinimumTradeAmount();
        if (vault_.token() != token_ || vault_.base() != base_ || vault_.poolManager() != address(manager_)) {
            revert VaultBindingMismatch();
        }

        bytes32 scheduleHash = _initializePhaseSchedules(
            minimumBootstrapLiquidity_, laterPhaseFeeBps_, laterPhaseMinimumActiveLiquidity_
        );

        token = token_;
        base = base_;
        vault = vault_;
        expectedSqrtPriceX96 = expectedSqrtPriceX96_;
        expectedOpeningTick = expectedOpeningTick_;
        minimumBootstrapLiquidity = minimumBootstrapLiquidity_;
        minimumTokenAmount = minimumTokenAmount_;
        minimumBaseAmount = minimumBaseAmount_;
        phaseScheduleHash = scheduleHash;
        vaultCodeHash = address(vault_).codehash;

        (address currency0, address currency1) =
            uint160(token_) < uint160(base_) ? (token_, base_) : (base_, token_);
        tokenIsCurrency0 = currency0 == token_;
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(currency0),
            currency1: Currency.wrap(currency1),
            fee: CANONICAL_POOL_FEE,
            tickSpacing: CANONICAL_TICK_SPACING,
            hooks: IHooks(address(this))
        });
        PoolId id = key.toId();
        poolId = id;

        emit CanonicalPoolBound(
            id,
            currency0,
            currency1,
            CANONICAL_POOL_FEE,
            CANONICAL_TICK_SPACING,
            expectedSqrtPriceX96_
        );
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory permissions) {
        permissions.beforeInitialize = true;
        permissions.beforeSwap = true;
        permissions.afterSwap = true;
        permissions.beforeSwapReturnDelta = true;
        permissions.afterSwapReturnDelta = true;
    }

    function canonicalPoolKey() public view returns (PoolKey memory key) {
        (address currency0, address currency1) =
            tokenIsCurrency0 ? (token, base) : (base, token);
        key = PoolKey({
            currency0: Currency.wrap(currency0),
            currency1: Currency.wrap(currency1),
            fee: CANONICAL_POOL_FEE,
            tickSpacing: CANONICAL_TICK_SPACING,
            hooks: IHooks(address(this))
        });
    }

    function phaseCount() external view returns (uint256) {
        return _phaseFeeBps.length;
    }

    function phaseFeeBps(uint256 phase) public view returns (uint16) {
        if (phase >= _phaseFeeBps.length) revert InvalidPhaseSchedule();
        return _phaseFeeBps[phase];
    }

    function phaseMinimumActiveLiquidity(uint256 phase) public view returns (uint128) {
        if (phase >= _phaseMinimumActiveLiquidity.length) revert InvalidLiquiditySchedule();
        return _phaseMinimumActiveLiquidity[phase];
    }

    function currentFeeBps() public view returns (uint16) {
        return _phaseFeeBps[currentPhase];
    }

    function combinedEffectiveFeeBps(uint16 legFeeBps) public pure returns (uint16) {
        if (legFeeBps > BPS) revert FeeCapExceeded();
        uint256 retained = Math.mulDiv(BPS - legFeeBps, BPS - legFeeBps, BPS);
        return uint16(BPS - retained);
    }

    function feeFor(uint256 amount, uint16 feeBps) public pure returns (uint256) {
        if (amount == 0 || feeBps == 0) return 0;
        return Math.mulDiv(amount, feeBps, BPS, Math.Rounding.Ceil);
    }

    function minimumFeeableAmount(address currency) public view returns (uint256) {
        if (currency == token) return minimumTokenAmount;
        if (currency == base) return minimumBaseAmount;
        revert InvalidTokenPair();
    }

    /// @notice Irreversibly binds the direct phase controller after this
    ///         CREATE2-mined Hook has exposed the canonical pool id.
    /// @dev This one-shot pre-activation step breaks the otherwise circular
    ///      deployment dependency: Controller construction needs `poolId`, but
    ///      `poolId` includes this Hook's address. Static controller bindings
    ///      and the runtime code hash are pinned here; reciprocal configuration
    ///      is still required and pinned by `activatePool`.
    function bindPhaseController(INARALiquidityPhaseControllerV5 phaseController_) external onlyOwner {
        _requireNoActiveSwap();
        if (poolActive || poolRetired) revert PoolAlreadyActive();
        if (address(phaseController) != address(0)) revert PhaseControllerAlreadyBound();
        address controllerAddress = address(phaseController_);
        if (controllerAddress == address(0)) revert ZeroAddress();
        if (controllerAddress.code.length == 0) revert NotAContract();
        if (
            phaseController_.hook() != address(0) || phaseController_.configurationSealed()
                || phaseController_.configurationHash() != bytes32(0)
                || PoolId.unwrap(phaseController_.poolId()) != PoolId.unwrap(poolId)
                || phaseController_.phaseScheduleHash() != phaseScheduleHash
        ) revert PhaseControllerBindingMismatch();

        bytes32 codeHash = controllerAddress.codehash;
        phaseController = phaseController_;
        phaseControllerCodeHash = codeHash;
        emit PhaseControllerBound(controllerAddress, codeHash);
    }

    /// @notice Calculates hook fees when a caller independently knows the
    ///         pre-output-fee gross AMM output.
    /// @dev This is not an AMM quote and does not estimate price impact or LP
    ///      fees. V4Quoter exact-input `amountOut` already reflects this Hook's
    ///      `afterSwap` output fee, so it is NET output and must not be passed as
    ///      `grossOutput` here or charged an output fee a second time.
    function quoteFeesForGrossAmounts(bool isBuy, uint256 grossInput, uint256 grossOutput)
        external
        view
        returns (
            uint8 phase,
            uint16 feeBps,
            uint256 inputFee,
            uint256 ammInput,
            uint256 outputFee,
            uint256 netOutput
        )
    {
        if (grossInput == 0 || grossOutput == 0) revert ZeroAmount();
        uint256 minimumInput = isBuy ? minimumBaseAmount : minimumTokenAmount;
        uint256 minimumOutput = isBuy ? minimumTokenAmount : minimumBaseAmount;
        if (grossInput < minimumInput) {
            revert TradeAmountBelowMinimum(minimumInput, grossInput);
        }
        if (grossOutput < minimumOutput) {
            revert TradeAmountBelowMinimum(minimumOutput, grossOutput);
        }
        phase = currentPhase;
        feeBps = _phaseFeeBps[phase];
        inputFee = feeFor(grossInput, feeBps);
        outputFee = feeFor(grossOutput, feeBps);
        if ((inputFee != 0 && inputFee >= grossInput) || (outputFee != 0 && outputFee >= grossOutput)) {
            revert TradeTooSmall();
        }
        ammInput = grossInput - inputFee;
        netOutput = grossOutput - outputFee;
    }

    /// @notice One-way activation after the exact-price pool and named Bootstrap
    ///         POL exist and both companion contracts are reciprocally bound.
    /// @dev Worst case for a compromised owner is premature activation. The
    ///      immutable expected price, pool key, minimum POL and bindings cap it.
    function activatePool() external onlyOwner {
        _requireNoActiveSwap();
        if (poolActive) revert PoolAlreadyActive();
        if (poolRetired) revert PoolPermanentlyRetired();
        _validateCompanionBindings();

        (uint160 sqrtPriceX96, int24 openingTick, uint24 protocolFee, uint24 lpFee) =
            poolManager.getSlot0(poolId);
        if (sqrtPriceX96 != expectedSqrtPriceX96) {
            revert InvalidInitializationPrice(expectedSqrtPriceX96, sqrtPriceX96);
        }
        if (openingTick != expectedOpeningTick || lpFee != CANONICAL_POOL_FEE) revert InvalidPoolConfig();
        if (!phaseController.activationAllowed()) revert PhaseControllerActivationBlocked();
        (uint256 activeLiquidity,) = _validatePhaseLiquidity(0);

        bytes32 nextVaultConfigurationHash = vault.configurationHash();
        bytes32 nextControllerConfigurationHash = phaseController.configurationHash();
        if (nextVaultConfigurationHash == bytes32(0) || nextControllerConfigurationHash == bytes32(0)) {
            revert CompanionConfigurationUnsealed();
        }
        vaultConfigurationHash = nextVaultConfigurationHash;
        phaseControllerConfigurationHash = nextControllerConfigurationHash;
        poolActive = true;
        emit CompanionConfigurationsPinned(nextVaultConfigurationHash, nextControllerConfigurationHash);
        emit PoolActivated(poolId, activeLiquidity, phaseScheduleHash, openingTick, protocolFee, lpFee);
    }

    /// @notice Advances exactly one constructor-frozen phase.
    /// @dev Only the immutable controller can call this after proving the
    ///      approved active-POL milestone and observation/recovery conditions.
    function advancePhase(uint8 expectedCurrentPhase) external {
        _requireNoActiveSwap();
        if (msg.sender != address(phaseController)) revert UnauthorizedPhaseController();
        _validateCompanionBindings();
        if (
            !poolActive || poolRetired || expectedCurrentPhase != currentPhase
                || currentPhase + 1 >= _phaseFeeBps.length
        ) {
            revert InvalidPhaseAdvance();
        }
        uint8 previous = currentPhase;
        uint8 nextPhase = previous + 1;
        (uint256 activeLiquidity, uint256 requiredLiquidity) = _validatePhaseLiquidity(nextPhase);
        unchecked {
            currentPhase = nextPhase;
        }
        emit PhaseAdvanced(previous, nextPhase, _phaseFeeBps[nextPhase], requiredLiquidity, activeLiquidity);
    }

    /// @notice Irreversibly disables canonical-pool swaps during reviewed V5 wind-down.
    /// @dev The immutable controller must enforce the production recovery delay,
    ///      custody and POL-removal conditions before calling this function.
    function retirePool() external {
        _requireNoActiveSwap();
        if (msg.sender != address(phaseController)) revert UnauthorizedPhaseController();
        _validatePhaseControllerBinding();
        if (!poolActive || poolRetired) revert PoolPermanentlyRetired();
        poolActive = false;
        poolRetired = true;
        emit PoolRetired(poolId, currentPhase);
    }

    function _beforeInitialize(address, PoolKey calldata key, uint160 sqrtPriceX96)
        internal
        view
        override
        returns (bytes4)
    {
        _requireCanonicalPool(key);
        if (sqrtPriceX96 != expectedSqrtPriceX96) {
            revert InvalidInitializationPrice(expectedSqrtPriceX96, sqrtPriceX96);
        }
        return IHooks.beforeInitialize.selector;
    }

    function _beforeSwap(
        address swapCaller,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        _requireCanonicalPool(key);
        if (poolRetired) revert PoolPermanentlyRetired();
        if (!poolActive) revert PoolInactive();
        _validateCompanionBindings();
        if (_CTX_ACTIVE_SLOT.asBoolean().tload()) revert NestedSwapUnsupported();
        if (params.amountSpecified == 0) revert ZeroAmount();
        if (params.amountSpecified > 0) revert ExactOutputUnsupported();
        if (params.amountSpecified == type(int256).min) revert AmountTooLarge();

        uint256 grossInput = uint256(-params.amountSpecified);
        if (grossInput > uint256(uint128(type(int128).max))) revert AmountTooLarge();
        Currency inputCurrency = params.zeroForOne ? key.currency0 : key.currency1;
        uint256 minimumInput = minimumFeeableAmount(Currency.unwrap(inputCurrency));
        if (grossInput < minimumInput) {
            revert TradeAmountBelowMinimum(minimumInput, grossInput);
        }
        uint8 phase = currentPhase;
        _validatePhaseLiquidity(phase);
        uint16 feeBps = _phaseFeeBps[phase];
        uint256 minimumNetOutput = _validateSwapProtection(hookData, phase, feeBps);
        uint256 inputFee = feeFor(grossInput, feeBps);
        if (inputFee >= grossInput || inputFee > uint256(uint128(type(int128).max))) revert TradeTooSmall();

        bytes32 contextHash = _contextHash(swapCaller, poolId, params, hookData);
        _CTX_ACTIVE_SLOT.asBoolean().tstore(true);
        _CTX_HASH_SLOT.asBytes32().tstore(contextHash);
        _CTX_GROSS_INPUT_SLOT.asUint256().tstore(grossInput);
        _CTX_INPUT_FEE_SLOT.asUint256().tstore(inputFee);
        _CTX_PHASE_DATA_SLOT.asUint256().tstore(uint256(phase) | (uint256(feeBps) << 8));
        _CTX_MINIMUM_NET_OUTPUT_SLOT.asUint256().tstore(minimumNetOutput);

        uint256 expectedInputClaimBalance = _mintExactClaim(inputCurrency, inputFee);
        _CTX_INPUT_CLAIM_BALANCE_SLOT.asUint256().tstore(expectedInputClaimBalance);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(uint128(inputFee)), 0), 0);
    }

    function _afterSwap(
        address swapCaller,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        _requireCanonicalPool(key);
        if (!_CTX_ACTIVE_SLOT.asBoolean().tload()) revert MissingSwapContext();
        if (_CTX_HASH_SLOT.asBytes32().tload() != _contextHash(swapCaller, poolId, params, hookData)) {
            revert SwapContextMismatch();
        }

        uint256 grossInput = _CTX_GROSS_INPUT_SLOT.asUint256().tload();
        uint256 inputFee = _CTX_INPUT_FEE_SLOT.asUint256().tload();
        uint256 phaseData = _CTX_PHASE_DATA_SLOT.asUint256().tload();
        uint8 phase = uint8(phaseData);
        uint16 feeBps = uint16(phaseData >> 8);
        uint256 ammInput = grossInput - inputFee;

        bool specifiedIsCurrency0 = params.zeroForOne;
        int128 specifiedDelta = specifiedIsCurrency0 ? delta.amount0() : delta.amount1();
        int128 unspecifiedDelta = specifiedIsCurrency0 ? delta.amount1() : delta.amount0();
        if (specifiedDelta >= 0 || unspecifiedDelta <= 0) revert InvalidSwapDelta();
        uint256 actualAmmInput = uint256(-int256(specifiedDelta));
        if (actualAmmInput != ammInput) revert PartialFillUnsupported(ammInput, actualAmmInput);

        Currency inputCurrency = specifiedIsCurrency0 ? key.currency0 : key.currency1;
        Currency outputCurrency = specifiedIsCurrency0 ? key.currency1 : key.currency0;
        address inputAddress = Currency.unwrap(inputCurrency);
        address outputAddress = Currency.unwrap(outputCurrency);
        uint256 grossOutput = uint256(uint128(unspecifiedDelta));
        uint256 minimumOutput = minimumFeeableAmount(outputAddress);
        if (grossOutput < minimumOutput) {
            revert TradeAmountBelowMinimum(minimumOutput, grossOutput);
        }
        uint256 outputFee = feeFor(grossOutput, feeBps);
        if (outputFee >= grossOutput || outputFee > uint256(uint128(type(int128).max))) revert TradeTooSmall();
        uint256 netOutput = grossOutput - outputFee;
        uint256 minimumNetOutput = _CTX_MINIMUM_NET_OUTPUT_SLOT.asUint256().tload();
        if (netOutput < minimumNetOutput) revert MinimumNetOutputNotMet(minimumNetOutput, netOutput);

        uint256 expectedOutputClaimBalance = _mintExactClaim(outputCurrency, outputFee);

        bool isBuy = inputAddress == base;
        vault.recordSwapFees(
            INARALiquidityGrowthVaultV5.SwapFeeRecord({
                poolId: poolId,
                swapCaller: swapCaller,
                inputCurrency: inputAddress,
                outputCurrency: outputAddress,
                grossInput: grossInput,
                inputFee: inputFee,
                grossOutput: grossOutput,
                outputFee: outputFee,
                feeBps: feeBps,
                phase: phase,
                isBuy: isBuy
            })
        );
        // Recheck the sealed static configuration after the only external
        // accounting call in this callback. This catches persistent in-call
        // drift atomically; production companions must still be direct,
        // non-upgradeable contracts with irreversible configuration seals.
        _validateCompanionBindings();
        _requireExactClaimBalance(inputCurrency, _CTX_INPUT_CLAIM_BALANCE_SLOT.asUint256().tload());
        _requireExactClaimBalance(outputCurrency, expectedOutputClaimBalance);

        emit SwapFeeClaimsAccrued(
            poolId,
            swapCaller,
            phase,
            inputAddress,
            outputAddress,
            grossInput,
            inputFee,
            ammInput,
            grossOutput,
            outputFee,
            netOutput,
            feeBps,
            isBuy
        );

        _clearSwapContext();
        return (IHooks.afterSwap.selector, int128(uint128(outputFee)));
    }

    function _mintExactClaim(Currency currency, uint256 amount) internal returns (uint256 afterBalance) {
        address currencyAddress = Currency.unwrap(currency);
        uint256 currencyId = currency.toId();
        uint256 beforeBalance = poolManager.balanceOf(address(vault), currencyId);
        poolManager.mint(address(vault), currencyId, amount);
        afterBalance = poolManager.balanceOf(address(vault), currencyId);
        uint256 received = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (received != amount) revert FeeClaimMintMismatch(currencyAddress, amount, received);
    }

    function _requireExactClaimBalance(Currency currency, uint256 expected) internal view {
        uint256 actual = poolManager.balanceOf(address(vault), currency.toId());
        if (actual != expected) revert FeeClaimMintMismatch(Currency.unwrap(currency), expected, actual);
    }

    function _validateSwapProtection(bytes calldata hookData, uint8 phase, uint16 feeBps)
        internal
        view
        returns (uint256 minimumNetOutput)
    {
        if (hookData.length == 0) return 0;
        if (hookData.length != SWAP_PROTECTION_ENCODED_LENGTH) revert InvalidHookData();
        SwapProtection memory protection = abi.decode(hookData, (SwapProtection));
        if (protection.version != SWAP_PROTECTION_VERSION) {
            revert UnsupportedSwapProtectionVersion(protection.version);
        }
        if (block.timestamp > protection.deadline) {
            revert SwapProtectionExpired(protection.deadline, block.timestamp);
        }
        if (phase < protection.minimumAcceptedPhase) {
            revert PhaseBelowMinimumAccepted(protection.minimumAcceptedPhase, phase);
        }
        if (protection.expectedPhaseScheduleHash != phaseScheduleHash) {
            revert UnexpectedPhaseSchedule(protection.expectedPhaseScheduleHash, phaseScheduleHash);
        }
        if (feeBps > protection.maximumPerLegFeeBps) {
            revert PerLegFeeLimitExceeded(feeBps, protection.maximumPerLegFeeBps);
        }
        uint16 combinedFeeBps = combinedEffectiveFeeBps(feeBps);
        if (combinedFeeBps > protection.maximumNominalCombinedHookFeeBps) {
            revert NominalCombinedFeeLimitExceeded(
                combinedFeeBps, protection.maximumNominalCombinedHookFeeBps
            );
        }
        minimumNetOutput = protection.minimumNetOutput;
    }

    function _contextHash(address swapCaller, PoolId id, SwapParams calldata params, bytes calldata hookData)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                swapCaller,
                PoolId.unwrap(id),
                params.zeroForOne,
                params.amountSpecified,
                params.sqrtPriceLimitX96,
                keccak256(hookData)
            )
        );
    }

    function _clearSwapContext() internal {
        _CTX_ACTIVE_SLOT.asBoolean().tstore(false);
        _CTX_HASH_SLOT.asBytes32().tstore(bytes32(0));
        _CTX_GROSS_INPUT_SLOT.asUint256().tstore(0);
        _CTX_INPUT_FEE_SLOT.asUint256().tstore(0);
        _CTX_PHASE_DATA_SLOT.asUint256().tstore(0);
        _CTX_INPUT_CLAIM_BALANCE_SLOT.asUint256().tstore(0);
        _CTX_MINIMUM_NET_OUTPUT_SLOT.asUint256().tstore(0);
    }

    function _requireNoActiveSwap() internal view {
        if (_CTX_ACTIVE_SLOT.asBoolean().tload()) revert NestedSwapUnsupported();
    }

    function _validateCompanionBindings() internal view {
        _validateCompanionCodeHashes();
        if (
            vault.token() != token || vault.base() != base || vault.poolManager() != address(poolManager)
                || vault.hook() != address(this) || PoolId.unwrap(vault.poolId()) != PoolId.unwrap(poolId)
        ) revert VaultBindingMismatch();
        if (!vault.configurationSealed()) revert CompanionConfigurationUnsealed();
        bytes32 liveVaultConfigurationHash = vault.configurationHash();
        if (liveVaultConfigurationHash == bytes32(0)) revert CompanionConfigurationUnsealed();
        if (poolActive && liveVaultConfigurationHash != vaultConfigurationHash) {
            revert CompanionConfigurationMismatch();
        }
        _validatePhaseControllerBinding();
    }

    function _validatePhaseControllerBinding() internal view {
        _validateCompanionCodeHashes();
        INARALiquidityPhaseControllerV5 controller = phaseController;
        if (address(controller) == address(0)) revert PhaseControllerBindingMismatch();
        if (
            controller.hook() != address(this)
                || PoolId.unwrap(controller.poolId()) != PoolId.unwrap(poolId)
                || controller.phaseScheduleHash() != phaseScheduleHash
        ) revert PhaseControllerBindingMismatch();
        if (!controller.configurationSealed()) revert CompanionConfigurationUnsealed();
        bytes32 liveControllerConfigurationHash = controller.configurationHash();
        if (liveControllerConfigurationHash == bytes32(0)) revert CompanionConfigurationUnsealed();
        if (poolActive && liveControllerConfigurationHash != phaseControllerConfigurationHash) {
            revert CompanionConfigurationMismatch();
        }
    }

    function _validatePhaseLiquidity(uint8 phase)
        internal
        view
        returns (uint256 activeLiquidity, uint256 requiredLiquidity)
    {
        if (phase >= _phaseMinimumActiveLiquidity.length) revert InvalidLiquiditySchedule();
        requiredLiquidity = _phaseMinimumActiveLiquidity[phase];
        activeLiquidity = phaseController.activeProtocolLiquidity();
        if (activeLiquidity < requiredLiquidity) {
            if (phase == 0) revert InsufficientBootstrapLiquidity(requiredLiquidity, activeLiquidity);
            revert InsufficientPhaseLiquidity(phase, requiredLiquidity, activeLiquidity);
        }
        uint256 livePoolLiquidity = poolManager.getLiquidity(poolId);
        if (activeLiquidity > livePoolLiquidity) {
            revert ProtocolLiquidityExceedsPoolLiquidity(activeLiquidity, livePoolLiquidity);
        }
    }

    function _validateCompanionCodeHashes() internal view {
        address controllerAddress = address(phaseController);
        if (
            address(vault).codehash != vaultCodeHash
                || controllerAddress == address(0) || controllerAddress.codehash != phaseControllerCodeHash
        ) revert CompanionCodeHashMismatch();
    }

    function _requireCanonicalPool(PoolKey calldata key) internal view {
        if (address(key.hooks) != address(this)) revert UnauthorizedPool();
        if (key.fee != CANONICAL_POOL_FEE || key.tickSpacing != CANONICAL_TICK_SPACING) {
            revert InvalidPoolConfig();
        }
        address expected0 = tokenIsCurrency0 ? token : base;
        address expected1 = tokenIsCurrency0 ? base : token;
        if (Currency.unwrap(key.currency0) != expected0 || Currency.unwrap(key.currency1) != expected1) {
            revert InvalidTokenPair();
        }
        PoolKey memory keyMemory = key;
        if (PoolId.unwrap(keyMemory.toId()) != PoolId.unwrap(poolId)) revert UnauthorizedPool();
    }

    function _initializePhaseSchedules(
        uint256 minimumBootstrapLiquidity_,
        uint16[] memory laterPhaseFeeBps_,
        uint128[] memory laterPhaseMinimumActiveLiquidity_
    ) internal returns (bytes32 scheduleHash) {
        uint256 totalPhases = laterPhaseFeeBps_.length + 1;
        if (totalPhases != FIXED_PHASE_COUNT) revert InvalidPhaseSchedule();
        if (laterPhaseMinimumActiveLiquidity_.length + 1 != totalPhases) {
            revert InvalidLiquiditySchedule();
        }

        uint16[] memory schedule = new uint16[](totalPhases);
        uint128[] memory liquiditySchedule = new uint128[](totalPhases);
        schedule[0] = BOOTSTRAP_FEE_BPS;
        liquiditySchedule[0] = uint128(minimumBootstrapLiquidity_);
        _phaseFeeBps.push(BOOTSTRAP_FEE_BPS);
        _phaseMinimumActiveLiquidity.push(uint128(minimumBootstrapLiquidity_));
        uint16 previous = BOOTSTRAP_FEE_BPS;
        uint128 previousLiquidity = uint128(minimumBootstrapLiquidity_);
        for (uint256 i; i < laterPhaseFeeBps_.length; ) {
            uint16 next = laterPhaseFeeBps_[i];
            if (next != previous - PHASE_STEP_FEE_BPS || next < MIN_LEG_FEE_BPS) {
                revert InvalidPhaseSchedule();
            }
            _validateFeeCap(next);
            schedule[i + 1] = next;
            _phaseFeeBps.push(next);
            previous = next;

            uint128 nextLiquidity = laterPhaseMinimumActiveLiquidity_[i];
            if (nextLiquidity <= previousLiquidity) revert InvalidLiquiditySchedule();
            liquiditySchedule[i + 1] = nextLiquidity;
            _phaseMinimumActiveLiquidity.push(nextLiquidity);
            previousLiquidity = nextLiquidity;
            unchecked {
                ++i;
            }
        }
        if (previous != MIN_LEG_FEE_BPS) revert InvalidPhaseSchedule();
        scheduleHash = keccak256(abi.encode(schedule, liquiditySchedule));
    }

    function _validateFeeCap(uint16 feeBps) internal pure {
        if (feeBps > MAX_LEG_FEE_BPS || combinedEffectiveFeeBps(feeBps) > MAX_COMBINED_EFFECTIVE_FEE_BPS) {
            revert FeeCapExceeded();
        }
    }
}
