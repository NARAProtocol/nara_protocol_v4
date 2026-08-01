// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {INARALiquidityFeeEngineV5} from "../interfaces/INARALiquidityFeeEngineV5.sol";
import {INARALiquidityGrowthVaultV5} from "../interfaces/INARALiquidityGrowthVaultV5.sol";
import {INARALiquidityHookLifecycleV5} from "../interfaces/liquidity/INARALiquidityHookLifecycleV5.sol";
import {INARALiquidityVaultRoutingV5} from "../interfaces/liquidity/INARALiquidityVaultRoutingV5.sol";

interface INARACompounderVaultBindingV5 {
    function token() external view returns (address);
    function base() external view returns (address);
    function poolManager() external view returns (address);
    function vault() external view returns (address);
    function poolId() external view returns (PoolId);
    function configurationSealed() external view returns (bool);
}

/// @title NARA Liquidity Growth Vault V5
/// @notice Direct, sealed dual-currency claim ledger for Hook V5.
/// @dev `recordSwapFees` performs one bounded call to the sealed Engine so the
///      active/inactive reward disposition is fixed at swap time. Claim-token
///      redemption and backing transfer still happen later through receipt-keyed
///      operations which are atomic with PoolManager settlement.
contract NARALiquidityGrowthVaultV5 is
    INARALiquidityGrowthVaultV5,
    INARALiquidityVaultRoutingV5,
    IUnlockCallback,
    ReentrancyGuardTransient
{
    using CurrencyLibrary for Currency;
    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_ENGINE_SHARE_BPS = 5_000;
    uint8 public constant LIQUIDITY_RECEIPT_ROUTE = 1;
    uint8 public constant RETIREMENT_RECEIPT_ROUTE = 3;
    bytes32 public constant RECEIPT_DOMAIN = keccak256("NARA_LIQUIDITY_GROWTH_VAULT_V5_RECEIPT");

    address public immutable configurationAuthority;
    address public immutable recoveryRecipient;
    address public immutable override(INARALiquidityGrowthVaultV5, INARALiquidityVaultRoutingV5) token;
    address public immutable override(INARALiquidityGrowthVaultV5, INARALiquidityVaultRoutingV5) base;
    address public immutable override(INARALiquidityGrowthVaultV5, INARALiquidityVaultRoutingV5) poolManager;
    uint16 public immutable engineShareBps;

    address public override(INARALiquidityGrowthVaultV5, INARALiquidityVaultRoutingV5) hook;
    address public override controller;
    address public override compounder;
    address public override engine;
    PoolId public override(INARALiquidityGrowthVaultV5, INARALiquidityVaultRoutingV5) poolId;
    RoutingState public override routingState;
    bool public override(INARALiquidityGrowthVaultV5, INARALiquidityVaultRoutingV5) configurationSealed;
    bytes32 public override(INARALiquidityGrowthVaultV5, INARALiquidityVaultRoutingV5) configurationHash;

    bytes32 public hookCodeHash;
    bytes32 public controllerCodeHash;
    bytes32 public compounderCodeHash;
    bytes32 public engineCodeHash;

    uint256 public totalTokenFeeRecorded;
    uint256 public totalBaseFeeRecorded;
    uint256 public bootstrapTokenLiquidityClassified;
    uint256 public bootstrapBaseLiquidityClassified;
    uint256 public sharedTokenAccrued;
    uint256 public sharedBaseAccrued;
    uint256 public sharedTokenLiquidityClassified;
    uint256 public sharedBaseLiquidityClassified;
    uint256 public sharedTokenEngineClassified;
    uint256 public sharedBaseEngineClassified;
    uint256 public sharedTokenEngineActiveAccounted;
    uint256 public sharedBaseEngineActiveAccounted;
    uint256 public sharedTokenEngineInactiveAccounted;
    uint256 public sharedBaseEngineInactiveAccounted;
    uint256 public tokenLiquidityClaimsReleased;
    uint256 public baseLiquidityClaimsReleased;
    uint256 public tokenEngineClaimsReleased;
    uint256 public baseEngineClaimsReleased;

    /// @notice Route stored under `receiptReplayKey(receiptId, route)`.
    /// @dev Route-domain separation lets the same externally observable receipt
    ///      id identify related operations without one route consuming another.
    mapping(bytes32 replayKey => uint8 route) public processedReceiptRoute;

    bool private _redemptionActive;
    bytes32 private _redemptionContextHash;

    event ConfigurationSealed(
        address indexed hook,
        address indexed controller,
        address indexed compounder,
        address engine,
        PoolId poolId,
        bytes32 configurationHash
    );
    event RoutingStateAdvanced(RoutingState indexed previousState, RoutingState indexed nextState);
    event SwapFeesClassified(
        PoolId indexed poolId,
        uint8 indexed phase,
        bool indexed isBuy,
        uint256 tokenFee,
        uint256 baseFee,
        uint256 tokenToLiquidity,
        uint256 baseToLiquidity,
        uint256 tokenToEngine,
        uint256 baseToEngine
    );
    event LiquidityClaimsReleased(
        bytes32 indexed receiptId, address indexed compounder, uint256 tokenAmount, uint256 baseAmount
    );
    event EngineClaimsReleased(address indexed engine, uint256 tokenAmount, uint256 baseAmount);
    event EngineFeesAccounted(
        bool indexed rewardsActive, uint256 tokenAmount, uint256 baseAmount
    );
    event RetirementClaimsSettled(
        bytes32 indexed receiptId,
        address indexed recoveryRecipient,
        uint256 tokenToRecovery,
        uint256 baseToRecovery,
        uint256 tokenToEngine,
        uint256 baseToEngine
    );

    error ZeroAddress();
    error NotAContract();
    error Unauthorized();
    error AlreadySealed();
    error ConfigurationNotSealed();
    error InvalidConfiguration();
    error InvalidState();
    error InvalidRecord();
    error InvalidAmount();
    error InvalidReceipt();
    error ReceiptAlreadyProcessed();
    error InsufficientClassifiedClaims();
    error InsufficientClaimBalance();
    error InvalidUnlockCallback();
    error ReceiptMismatch();
    error DownstreamAccountingMismatch();
    error EngineClaimsPending();

    constructor(
        address configurationAuthority_,
        address recoveryRecipient_,
        address token_,
        address base_,
        address poolManager_,
        uint16 engineShareBps_
    ) {
        if (
            configurationAuthority_ == address(0) || recoveryRecipient_ == address(0)
                || token_ == address(0) || base_ == address(0) || poolManager_ == address(0)
        ) revert ZeroAddress();
        if (token_ == base_ || engineShareBps_ == 0 || engineShareBps_ > MAX_ENGINE_SHARE_BPS) {
            revert InvalidConfiguration();
        }
        if (token_.code.length == 0 || base_.code.length == 0 || poolManager_.code.length == 0) {
            revert NotAContract();
        }
        configurationAuthority = configurationAuthority_;
        recoveryRecipient = recoveryRecipient_;
        token = token_;
        base = base_;
        poolManager = poolManager_;
        engineShareBps = engineShareBps_;
    }

    /// @notice Irreversibly binds every downstream destination and opens the
    ///         BootstrapLiquidity ledger.
    /// @dev Worst case for a compromised configuration authority is binding the
    ///      wrong reviewed companion before activation. Reciprocal checks and
    ///      Hook activation fail closed; there is no post-seal setter.
    function sealConfiguration(address hook_, address controller_, address compounder_, address engine_) external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (configurationSealed) revert AlreadySealed();
        if (
            hook_ == address(0) || controller_ == address(0) || compounder_ == address(0)
                || engine_ == address(0)
        ) revert ZeroAddress();
        if (
            hook_.code.length == 0 || controller_.code.length == 0 || compounder_.code.length == 0
                || engine_.code.length == 0
        ) revert NotAContract();

        INARALiquidityHookLifecycleV5 hookBinding = INARALiquidityHookLifecycleV5(hook_);
        if (
            hookBinding.token() != token || hookBinding.base() != base
                || hookBinding.poolManager() != poolManager || hookBinding.vault() != address(this)
        ) revert InvalidConfiguration();
        PoolId configuredPoolId = hookBinding.poolId();

        INARACompounderVaultBindingV5 compounderBinding = INARACompounderVaultBindingV5(compounder_);
        if (
            compounderBinding.token() != token || compounderBinding.base() != base
                || compounderBinding.poolManager() != poolManager
                || compounderBinding.vault() != address(this)
                || PoolId.unwrap(compounderBinding.poolId()) != PoolId.unwrap(configuredPoolId)
                || !compounderBinding.configurationSealed()
        ) revert InvalidConfiguration();

        INARALiquidityFeeEngineV5 engineBinding = INARALiquidityFeeEngineV5(engine_);
        if (
            engineBinding.NARA() != token || engineBinding.feeBase() != base
                || engineBinding.liquidityFeeVault() != address(this)
                || !engineBinding.liquidityFeeRoutingReady()
        ) revert InvalidConfiguration();

        hook = hook_;
        controller = controller_;
        compounder = compounder_;
        engine = engine_;
        poolId = configuredPoolId;
        hookCodeHash = hook_.codehash;
        controllerCodeHash = controller_.codehash;
        compounderCodeHash = compounder_.codehash;
        engineCodeHash = engine_.codehash;
        configurationHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                token,
                base,
                poolManager,
                hook_,
                controller_,
                compounder_,
                engine_,
                PoolId.unwrap(configuredPoolId),
                engineShareBps,
                recoveryRecipient,
                hookCodeHash,
                controllerCodeHash,
                compounderCodeHash,
                engineCodeHash
            )
        );
        configurationSealed = true;
        routingState = RoutingState.BootstrapLiquidity;
        emit ConfigurationSealed(hook_, controller_, compounder_, engine_, configuredPoolId, configurationHash);
        emit RoutingStateAdvanced(RoutingState.Unbound, RoutingState.BootstrapLiquidity);
    }

    /// @inheritdoc INARALiquidityGrowthVaultV5
    function recordSwapFees(SwapFeeRecord calldata record) external override {
        if (msg.sender != hook) revert Unauthorized();
        RoutingState state = routingState;
        if (!configurationSealed || (state != RoutingState.BootstrapLiquidity && state != RoutingState.Shared)) {
            revert InvalidState();
        }
        if (
            PoolId.unwrap(record.poolId) != PoolId.unwrap(poolId)
                || record.inputCurrency == record.outputCurrency || record.inputFee == 0 || record.outputFee == 0
                || record.inputFee >= record.grossInput || record.outputFee >= record.grossOutput
                || record.feeBps < 500 || record.feeBps > 1_500 || record.phase > 4
        ) revert InvalidRecord();
        bool validBuy = record.isBuy && record.inputCurrency == base && record.outputCurrency == token;
        bool validSell = !record.isBuy && record.inputCurrency == token && record.outputCurrency == base;
        if (!validBuy && !validSell) revert InvalidRecord();

        uint256 tokenFee = record.inputCurrency == token ? record.inputFee : record.outputFee;
        uint256 baseFee = record.inputCurrency == base ? record.inputFee : record.outputFee;
        totalTokenFeeRecorded += tokenFee;
        totalBaseFeeRecorded += baseFee;

        (uint256 tokenToLiquidity, uint256 tokenToEngine) = _classify(token, tokenFee, state);
        (uint256 baseToLiquidity, uint256 baseToEngine) = _classify(base, baseFee, state);

        if (tokenToEngine != 0 || baseToEngine != 0) {
            if (engine.codehash != engineCodeHash) revert InvalidConfiguration();
            bool rewardsActive = INARALiquidityFeeEngineV5(engine).accrueLiquidityFees(
                tokenToEngine, baseToEngine
            );
            if (rewardsActive) {
                sharedTokenEngineActiveAccounted += tokenToEngine;
                sharedBaseEngineActiveAccounted += baseToEngine;
            } else {
                sharedTokenEngineInactiveAccounted += tokenToEngine;
                sharedBaseEngineInactiveAccounted += baseToEngine;
            }
            emit EngineFeesAccounted(rewardsActive, tokenToEngine, baseToEngine);
        }

        if (_claimBalance(token) < totalTokenFeeRecorded - tokenLiquidityClaimsReleased - tokenEngineClaimsReleased) {
            revert InsufficientClaimBalance();
        }
        if (_claimBalance(base) < totalBaseFeeRecorded - baseLiquidityClaimsReleased - baseEngineClaimsReleased) {
            revert InsufficientClaimBalance();
        }
        emit SwapFeesClassified(
            record.poolId,
            record.phase,
            record.isBuy,
            tokenFee,
            baseFee,
            tokenToLiquidity,
            baseToLiquidity,
            tokenToEngine,
            baseToEngine
        );
    }

    /// @inheritdoc INARALiquidityVaultRoutingV5
    function enterShared() external override {
        if (msg.sender != controller) revert Unauthorized();
        if (routingState != RoutingState.BootstrapLiquidity) revert InvalidState();
        routingState = RoutingState.Shared;
        emit RoutingStateAdvanced(RoutingState.BootstrapLiquidity, RoutingState.Shared);
    }

    /// @inheritdoc INARALiquidityVaultRoutingV5
    function retire() external override {
        if (msg.sender != controller) revert Unauthorized();
        RoutingState previous = routingState;
        if (previous != RoutingState.BootstrapLiquidity && previous != RoutingState.Shared) revert InvalidState();
        routingState = RoutingState.Retired;
        emit RoutingStateAdvanced(previous, RoutingState.Retired);
    }

    /// @inheritdoc INARALiquidityVaultRoutingV5
    function releaseLiquidityClaims(bytes32 receiptId, uint256 naraAmount, uint256 baseAmount)
        external
        override
        nonReentrant
    {
        if (msg.sender != compounder) revert Unauthorized();
        if (routingState == RoutingState.Unbound || routingState == RoutingState.Retired) revert InvalidState();
        _consumeReceipt(receiptId, LIQUIDITY_RECEIPT_ROUTE);
        _reserveLiquidityRelease(naraAmount, baseAmount);
        _redeemClaims(compounder, naraAmount, baseAmount);
        emit LiquidityClaimsReleased(receiptId, compounder, naraAmount, baseAmount);
    }

    /// @inheritdoc INARALiquidityVaultRoutingV5
    function releaseAllEngineClaimsToEngine()
        external
        override
        nonReentrant
        returns (uint256 naraAmount, uint256 baseAmount)
    {
        if (msg.sender != engine) revert Unauthorized();
        if (engine.codehash != engineCodeHash) revert InvalidConfiguration();
        if (routingState != RoutingState.Shared && routingState != RoutingState.Retired) revert InvalidState();
        (naraAmount, baseAmount) = engineClaimsOutstanding();
        if (naraAmount == 0 && baseAmount == 0) return (0, 0);
        _reserveEngineRelease(naraAmount, baseAmount);
        _redeemClaims(engine, naraAmount, baseAmount);
        emit EngineClaimsReleased(engine, naraAmount, baseAmount);
    }

    /// @inheritdoc INARALiquidityVaultRoutingV5
    function settleRetirementClaims(bytes32 receiptId) external override nonReentrant {
        if (msg.sender != controller) revert Unauthorized();
        if (routingState != RoutingState.Retired) revert InvalidState();
        _consumeReceipt(receiptId, RETIREMENT_RECEIPT_ROUTE);

        (uint256 tokenLiquidity, uint256 baseLiquidity) = liquidityClaimsOutstanding();
        (uint256 tokenEngine, uint256 baseEngine) = engineClaimsOutstanding();
        if (tokenEngine != 0 || baseEngine != 0) revert EngineClaimsPending();
        if (tokenLiquidity != 0 || baseLiquidity != 0) {
            _reserveLiquidityRelease(tokenLiquidity, baseLiquidity);
            _redeemClaims(recoveryRecipient, tokenLiquidity, baseLiquidity);
        }
        emit RetirementClaimsSettled(
            receiptId,
            recoveryRecipient,
            tokenLiquidity,
            baseLiquidity,
            tokenEngine,
            baseEngine
        );
    }

    function liquidityClaimsOutstanding() public view returns (uint256 naraAmount, uint256 baseAmount) {
        naraAmount = bootstrapTokenLiquidityClassified + sharedTokenLiquidityClassified
            - tokenLiquidityClaimsReleased;
        baseAmount = bootstrapBaseLiquidityClassified + sharedBaseLiquidityClassified
            - baseLiquidityClaimsReleased;
    }

    function engineClaimsOutstanding() public view returns (uint256 naraAmount, uint256 baseAmount) {
        naraAmount = sharedTokenEngineClassified - tokenEngineClaimsReleased;
        baseAmount = sharedBaseEngineClassified - baseEngineClaimsReleased;
    }

    /// @inheritdoc INARALiquidityVaultRoutingV5
    function allClassifiedClaimsProcessed() external view override returns (bool) {
        (uint256 tokenLiquidity, uint256 baseLiquidity) = liquidityClaimsOutstanding();
        (uint256 tokenEngine, uint256 baseEngine) = engineClaimsOutstanding();
        return tokenLiquidity == 0 && baseLiquidity == 0 && tokenEngine == 0 && baseEngine == 0;
    }

    /// @notice Deterministic public lookup key for one receipt id in one route.
    function receiptReplayKey(bytes32 receiptId, uint8 route) public pure returns (bytes32) {
        return keccak256(abi.encode(RECEIPT_DOMAIN, route, receiptId));
    }

    /// @notice Direct observability for callers that track receipt ids by route.
    function receiptProcessed(bytes32 receiptId, uint8 route) external view returns (bool) {
        return processedReceiptRoute[receiptReplayKey(receiptId, route)] == route;
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external override returns (bytes memory result) {
        if (msg.sender != poolManager || !_redemptionActive || keccak256(data) != _redemptionContextHash) {
            revert InvalidUnlockCallback();
        }
        (address recipient, uint256 naraAmount, uint256 baseAmount) =
            abi.decode(data, (address, uint256, uint256));
        if (naraAmount != 0) {
            IPoolManager(poolManager).burn(address(this), Currency.wrap(token).toId(), naraAmount);
            IPoolManager(poolManager).take(Currency.wrap(token), recipient, naraAmount);
        }
        if (baseAmount != 0) {
            IPoolManager(poolManager).burn(address(this), Currency.wrap(base).toId(), baseAmount);
            IPoolManager(poolManager).take(Currency.wrap(base), recipient, baseAmount);
        }
        bytes32 contextHash = _redemptionContextHash;
        _redemptionActive = false;
        _redemptionContextHash = bytes32(0);
        result = abi.encode(contextHash);
    }

    function _classify(address currency, uint256 amount, RoutingState state)
        private
        returns (uint256 toLiquidity, uint256 toEngine)
    {
        if (state == RoutingState.BootstrapLiquidity) {
            toLiquidity = amount;
            if (currency == token) bootstrapTokenLiquidityClassified += amount;
            else bootstrapBaseLiquidityClassified += amount;
            return (toLiquidity, 0);
        }

        if (currency == token) {
            sharedTokenAccrued += amount;
            uint256 targetEngine = Math.mulDiv(sharedTokenAccrued, engineShareBps, BPS);
            toEngine = targetEngine - sharedTokenEngineClassified;
            toLiquidity = amount - toEngine;
            sharedTokenEngineClassified = targetEngine;
            sharedTokenLiquidityClassified += toLiquidity;
        } else {
            sharedBaseAccrued += amount;
            uint256 targetEngine = Math.mulDiv(sharedBaseAccrued, engineShareBps, BPS);
            toEngine = targetEngine - sharedBaseEngineClassified;
            toLiquidity = amount - toEngine;
            sharedBaseEngineClassified = targetEngine;
            sharedBaseLiquidityClassified += toLiquidity;
        }
    }

    function _reserveLiquidityRelease(uint256 naraAmount, uint256 baseAmount) private {
        if (naraAmount == 0 && baseAmount == 0) revert InvalidAmount();
        (uint256 tokenOutstanding, uint256 baseOutstanding) = liquidityClaimsOutstanding();
        if (naraAmount > tokenOutstanding || baseAmount > baseOutstanding) {
            revert InsufficientClassifiedClaims();
        }
        tokenLiquidityClaimsReleased += naraAmount;
        baseLiquidityClaimsReleased += baseAmount;
    }

    function _reserveEngineRelease(uint256 naraAmount, uint256 baseAmount) private {
        if (naraAmount == 0 && baseAmount == 0) revert InvalidAmount();
        (uint256 tokenOutstanding, uint256 baseOutstanding) = engineClaimsOutstanding();
        if (naraAmount > tokenOutstanding || baseAmount > baseOutstanding) {
            revert InsufficientClassifiedClaims();
        }
        tokenEngineClaimsReleased += naraAmount;
        baseEngineClaimsReleased += baseAmount;
    }

    function _redeemClaims(address recipient, uint256 naraAmount, uint256 baseAmount) private {
        if (recipient == address(0) || (naraAmount == 0 && baseAmount == 0)) revert InvalidAmount();
        if (_redemptionActive) revert InvalidUnlockCallback();
        if (_claimBalance(token) < naraAmount || _claimBalance(base) < baseAmount) {
            revert InsufficientClaimBalance();
        }

        uint256 tokenBefore = IERC20(token).balanceOf(recipient);
        uint256 baseBefore = IERC20(base).balanceOf(recipient);
        bytes memory data = abi.encode(recipient, naraAmount, baseAmount);
        bytes32 contextHash = keccak256(data);
        _redemptionActive = true;
        _redemptionContextHash = contextHash;
        bytes memory result = IPoolManager(poolManager).unlock(data);
        if (_redemptionActive || _redemptionContextHash != bytes32(0) || abi.decode(result, (bytes32)) != contextHash) {
            revert ReceiptMismatch();
        }
        if (
            IERC20(token).balanceOf(recipient) - tokenBefore != naraAmount
                || IERC20(base).balanceOf(recipient) - baseBefore != baseAmount
        ) revert DownstreamAccountingMismatch();
    }

    function _consumeReceipt(bytes32 receiptId, uint8 route) private {
        if (receiptId == bytes32(0)) revert InvalidReceipt();
        bytes32 replayKey = receiptReplayKey(receiptId, route);
        if (processedReceiptRoute[replayKey] != 0) revert ReceiptAlreadyProcessed();
        processedReceiptRoute[replayKey] = route;
    }

    function _claimBalance(address currency) private view returns (uint256) {
        return IPoolManager(poolManager).balanceOf(address(this), uint256(uint160(currency)));
    }
}
