// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {INARALiquidityFeeEngineV5} from "../interfaces/INARALiquidityFeeEngineV5.sol";
import {INARALiquidityGrowthVaultV5} from "../interfaces/INARALiquidityGrowthVaultV5.sol";
import {INARALiquidityVaultRoutingV5} from "../interfaces/liquidity/INARALiquidityVaultRoutingV5.sol";
import {INARAEngineCoreV5} from "../interfaces/core/INARAEngineCoreV5.sol";
import {INARARewardReserveV5} from "../interfaces/core/INARARewardReserveV5.sol";
import {INARAPositionControllerV5} from "../interfaces/modules/INARAPositionControllerV5.sol";
import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";
import {NARARewardAccountingV5} from "../libraries/NARARewardAccountingV5.sol";

/// @title NARA Engine V5
/// @notice Constructor-bounded time-preference positions with exact multi-asset
///         reward accounting and a one-shot sealed companion configuration.
/// @dev This is fresh V5 source. It deliberately omits V4's generic token notifier,
///      mutable economic setters, flash-fee surplus sync, and constructor cycle.
contract NARAEngineV5 is
    INARALiquidityFeeEngineV5,
    INARAPositionEngineV5,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using NARARewardAccountingV5 for NARARewardAccountingV5.RewardState;
    using NARARewardAccountingV5 for NARARewardAccountingV5.PositionReward;

    uint256 public constant WAD = 1e18;
    uint256 public constant RAY = 1e27;
    uint64 public constant MIN_EPOCH_LENGTH = 60;
    uint64 public constant MAX_EPOCH_LENGTH = 30 days;
    uint64 public constant MAX_EPOCH_ORIGIN_DELAY = 30 days;
    uint64 public constant MAX_LOCK_DURATION_HARD_CAP = 20 * 365 days;
    uint32 public constant MAX_ADVANCE_PER_CALL_HARD_CAP = 512;
    uint256 public constant MAX_WEIGHT_MULTIPLIER_WAD = 100e18;
    uint256 public constant MAX_TOTAL_WEIGHT = type(uint192).max;

    address public immutable override NARA;
    address public immutable override feeBase;
    address public immutable rewardReserve;
    address public immutable configurationAuthority;
    address public immutable inactiveRewardRecipient;

    uint64 public immutable epochOrigin;
    uint64 public immutable epochLength;
    uint64 public immutable minLockDuration;
    uint64 public immutable maxLockDuration;
    uint32 public immutable maxAdvancePerCall;
    uint256 public immutable minWeightMultiplierWad;
    uint256 public immutable maxWeightMultiplierWad;
    uint256 public immutable emissionPerEpoch;
    uint256 public immutable emissionBootstrapWeight;
    uint256 public immutable minimumRewardWeight;
    bytes32 public immutable configurationParametersHash;

    address public positionController;
    address public override liquidityFeeVault;
    bool public configurationSealed;
    bytes32 public configurationHash;

    uint256 public override positionCount;
    uint256 public override totalLocked;
    uint256 private _totalActiveWeight;
    uint64 private _processedEpoch;

    uint256 public override totalLiquidityNaraFeesReceived;
    uint256 public override totalLiquidityBaseFeesReceived;
    uint256 public totalNativeRewardsReceived;
    uint256 public totalReserveRewardsReceived;
    uint256 public totalInactiveNaraFeesRouted;
    uint256 public totalInactiveBaseFeesRouted;
    uint256 public totalActiveNaraFeesAccounted;
    uint256 public totalActiveBaseFeesAccounted;
    uint256 public totalInactiveNaraFeesAccounted;
    uint256 public totalInactiveBaseFeesAccounted;
    uint256 public totalActiveNaraFeesFunded;
    uint256 public totalActiveBaseFeesFunded;
    uint256 public override pendingActiveNaraFeeFunding;
    uint256 public override pendingActiveBaseFeeFunding;
    uint256 public override pendingInactiveNaraFeeFunding;
    uint256 public override pendingInactiveBaseFeeFunding;

    struct StoredPosition {
        address owner;
        uint256 principal;
        uint256 weight;
        uint64 openedAt;
        uint64 openedEpoch;
        uint64 unlockAt;
        uint64 unlockEpoch;
        bool exists;
        bool withdrawn;
        bool rewardsClosed;
    }

    mapping(uint256 positionId => StoredPosition position) private _positions;
    mapping(uint64 epoch => uint256 weight) public scheduledWeightExpiry;
    mapping(address rewardToken => NARARewardAccountingV5.RewardState state)
        private _rewardStates;
    mapping(
        uint256 positionId =>
            mapping(address rewardToken => NARARewardAccountingV5.PositionReward reward)
    ) private _positionRewards;
    mapping(address rewardToken => mapping(uint64 epoch => uint256 indexRay))
        public rewardIndexAtEpoch;

    error InvalidAddress();
    error InvalidConfig();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidPosition();
    error PositionMatured();
    error PositionNotMatured();
    error PositionWithdrawn();
    error PositionNotWithdrawn();
    error PositionRewardsAlreadyClosed();
    error Unauthorized();
    error AlreadyBound();
    error AlreadySealed();
    error ConfigurationNotSealed();
    error InvalidBinding();
    error UnsupportedRewardToken();
    error DuplicateRewardToken();
    error UnsupportedTokenBehavior();
    error WeightLimitExceeded();
    error EpochNotReady();
    error EpochBacklog(uint64 current, uint64 target);
    error NativeTransferFailed();
    error EtherNotAccepted();
    error InsufficientRewardWeight(uint256 current, uint256 required);
    error LiquidityFeeBackingMismatch(
        uint256 expectedNara, uint256 actualNara, uint256 expectedBase, uint256 actualBase
    );

    event PositionControllerBound(address indexed controller);
    event LiquidityFeeVaultBound(address indexed vault);
    event ConfigurationSealed(bytes32 indexed configurationHash);
    event PositionOpened(
        uint256 indexed positionId,
        address indexed owner,
        uint256 principal,
        uint256 weight,
        uint64 unlockAt,
        uint64 unlockEpoch
    );
    event PositionExtended(
        uint256 indexed positionId,
        uint64 oldUnlockAt,
        uint64 newUnlockAt,
        uint256 oldWeight,
        uint256 newWeight
    );
    event PositionRewardsClaimed(
        uint256 indexed positionId,
        address indexed rewardToken,
        address indexed recipient,
        uint256 amount
    );
    event PositionUnlocked(
        uint256 indexed positionId,
        address indexed recipient,
        uint256 principalReturned
    );
    event PositionRewardsClosed(uint256 indexed positionId);
    event RewardReceived(
        address indexed rewardToken,
        address indexed source,
        uint256 amount,
        uint256 indexedScaled,
        uint256 queuedScaled
    );
    event FractionRecycled(
        uint256 indexed positionId,
        address indexed rewardToken,
        uint256 scaledAmount
    );
    event EpochAdvanced(
        uint64 indexed epoch,
        uint256 activeWeightAfterExpiry,
        uint256 reserveRewardReceived
    );
    event ReserveReleaseSkipped(uint64 indexed epoch);
    event InactiveLiquidityFeesRouted(
        address indexed recipient,
        uint256 naraAmount,
        uint256 baseAmount
    );
    event LiquidityFeesAccounted(
        bool indexed rewardsActive,
        bool indexed epochFresh,
        uint256 naraAmount,
        uint256 baseAmount,
        uint256 activeWeight,
        uint64 processedEpoch,
        uint64 targetEpoch
    );
    event LiquidityFeesFunded(
        uint256 activeNaraAmount,
        uint256 activeBaseAmount,
        uint256 inactiveNaraAmount,
        uint256 inactiveBaseAmount
    );

    modifier onlyConfigurationAuthority() {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        _;
    }

    modifier onlySealed() {
        if (!configurationSealed) revert ConfigurationNotSealed();
        _;
    }

    constructor(
        address configurationAuthority_,
        address nara_,
        address feeBase_,
        address rewardReserve_,
        address inactiveRewardRecipient_,
        INARAEngineCoreV5.EngineConfig memory config_
    ) {
        if (
            configurationAuthority_ == address(0) ||
            nara_ == address(0) ||
            feeBase_ == address(0) ||
            rewardReserve_ == address(0) ||
            inactiveRewardRecipient_ == address(0)
        ) revert InvalidAddress();
        if (
            nara_.code.length == 0 ||
            feeBase_.code.length == 0 ||
            rewardReserve_.code.length == 0 ||
            nara_ == feeBase_
        ) revert InvalidAddress();
        if (INARARewardReserveV5(rewardReserve_).token() != nara_) {
            revert InvalidBinding();
        }
        _validateConfig(
            config_,
            INARARewardReserveV5(rewardReserve_).rewardAllocation(),
            IERC20(nara_).totalSupply()
        );

        configurationAuthority = configurationAuthority_;
        NARA = nara_;
        feeBase = feeBase_;
        rewardReserve = rewardReserve_;
        inactiveRewardRecipient = inactiveRewardRecipient_;
        epochOrigin = config_.epochOrigin;
        epochLength = config_.epochLength;
        minLockDuration = config_.minLockDuration;
        maxLockDuration = config_.maxLockDuration;
        maxAdvancePerCall = config_.maxAdvancePerCall;
        minWeightMultiplierWad = config_.minWeightMultiplierWad;
        maxWeightMultiplierWad = config_.maxWeightMultiplierWad;
        emissionPerEpoch = config_.emissionPerEpoch;
        emissionBootstrapWeight = config_.emissionBootstrapWeight;
        minimumRewardWeight = config_.minimumRewardWeight;

        configurationParametersHash = keccak256(
            abi.encode(
                keccak256("NARA_ENGINE_V5_PARAMETERS"),
                block.chainid,
                nara_,
                feeBase_,
                rewardReserve_,
                inactiveRewardRecipient_,
                config_
            )
        );
    }

    function token() external view override returns (address) {
        return NARA;
    }

    /// @notice One-shot canonical position-controller binding.
    /// @dev Worst case for a compromised configuration authority before sealing:
    ///      it can propose a wrong contract, but reciprocal Engine/token checks fail
    ///      closed. No replacement is possible after a successful bind.
    function bindPositionController(address controller)
        external
        onlyConfigurationAuthority
    {
        if (configurationSealed) revert AlreadySealed();
        if (positionController != address(0)) revert AlreadyBound();
        if (controller == address(0) || controller.code.length == 0) {
            revert InvalidBinding();
        }

        bool valid;
        try INARAPositionControllerV5(controller).engine() returns (address engine_) {
            if (engine_ == address(this)) {
                try INARAPositionControllerV5(controller).token() returns (address token_) {
                    valid = token_ == NARA;
                } catch {}
            }
        } catch {}
        if (!valid) revert InvalidBinding();

        positionController = controller;
        emit PositionControllerBound(controller);
    }

    /// @notice One-shot fee-vault binding for the two explicit liquidity assets.
    /// @dev Worst case for a compromised configuration authority before sealing:
    ///      it can propose a wrong contract, but reciprocal token/base checks fail
    ///      closed. The Hook/Vault side must independently seal its Engine route.
    function bindLiquidityFeeVault(address vault)
        external
        onlyConfigurationAuthority
    {
        if (configurationSealed) revert AlreadySealed();
        if (liquidityFeeVault != address(0)) revert AlreadyBound();
        if (vault == address(0) || vault.code.length == 0) revert InvalidBinding();

        bool valid;
        try INARALiquidityGrowthVaultV5(vault).token() returns (address token_) {
            if (token_ == NARA) {
                try INARALiquidityGrowthVaultV5(vault).base() returns (address base_) {
                    valid = base_ == feeBase;
                } catch {}
            }
        } catch {}
        if (!valid) revert InvalidBinding();

        liquidityFeeVault = vault;
        emit LiquidityFeeVaultBound(vault);
    }

    /// @notice Irreversibly seals reciprocal companions and every economic input.
    /// @dev Worst case for a compromised configuration authority is an early seal;
    ///      all three companions must already pass their explicit binding checks.
    function sealConfiguration() external onlyConfigurationAuthority {
        if (configurationSealed) revert AlreadySealed();
        if (positionController == address(0) || liquidityFeeVault == address(0)) {
            revert InvalidBinding();
        }
        if (!INARARewardReserveV5(rewardReserve).isValidFor(NARA, address(this))) {
            revert InvalidBinding();
        }

        configurationHash = keccak256(
            abi.encode(
                keccak256("NARA_ENGINE_V5_CONFIGURATION"),
                block.chainid,
                address(this),
                configurationParametersHash,
                positionController,
                liquidityFeeVault
            )
        );
        configurationSealed = true;
        emit ConfigurationSealed(configurationHash);
    }

    function liquidityFeeRoutingReady() external view override returns (bool) {
        return configurationSealed && liquidityFeeVault != address(0);
    }

    function openPosition(
        address positionOwner,
        uint256 amount,
        uint64 lockDurationSeconds
    ) external override nonReentrant onlySealed returns (uint256 positionId) {
        _requireCanonical(positionOwner);
        if (amount == 0) revert InvalidAmount();
        if (
            lockDurationSeconds < minLockDuration ||
            lockDurationSeconds > maxLockDuration
        ) revert InvalidDuration();
        _syncIfBounded();
        if (block.timestamp < epochOrigin) revert EpochNotReady();

        uint64 openedAt_ = uint64(block.timestamp);
        (uint64 unlockEpoch_, uint64 unlockAt_) =
            _alignedUnlock(openedAt_, lockDurationSeconds);
        uint256 multiplier = _multiplierForDuration(unlockAt_ - openedAt_);
        uint256 weight = Math.mulDiv(amount, multiplier, WAD);
        if (weight == 0) revert InvalidAmount();
        _checkAddedWeight(weight);

        _pullExact(NARA, positionOwner, amount);

        positionId = ++positionCount;
        StoredPosition storage position = _positions[positionId];
        position.owner = positionOwner;
        position.principal = amount;
        position.weight = weight;
        position.openedAt = openedAt_;
        position.openedEpoch = _processedEpoch;
        position.unlockAt = unlockAt_;
        position.unlockEpoch = unlockEpoch_;
        position.exists = true;

        _snapshotPosition(positionId);
        uint256 previousWeight = _totalActiveWeight;
        _totalActiveWeight = previousWeight + weight;
        scheduledWeightExpiry[unlockEpoch_] += weight;
        totalLocked += amount;
        if (
            previousWeight < minimumRewardWeight &&
            _totalActiveWeight >= minimumRewardWeight
        ) _flushAllRewards(positionOwner);

        emit PositionOpened(
            positionId, positionOwner, amount, weight, unlockAt_, unlockEpoch_
        );
    }

    function extendPosition(uint256 positionId, uint64 extensionSeconds)
        external
        override
        nonReentrant
        onlySealed
        returns (uint64 newUnlockAt, uint256 newWeight)
    {
        if (extensionSeconds == 0) revert InvalidDuration();
        _syncIfBounded();
        StoredPosition storage position = _activeOwnedPosition(positionId);
        _settleAll(positionId, position);

        uint256 candidate = uint256(position.unlockAt) + extensionSeconds;
        uint256 elapsedFromOpen = candidate - position.openedAt;
        if (elapsedFromOpen > maxLockDuration) revert InvalidDuration();
        (uint64 newUnlockEpoch, uint64 alignedUnlockAt) =
            _alignedUnlock(position.unlockAt, extensionSeconds);
        uint256 effectiveDuration = alignedUnlockAt - position.openedAt;
        if (effectiveDuration > uint256(maxLockDuration) + epochLength - 1) {
            revert InvalidDuration();
        }

        uint256 newMultiplier = _multiplierForDuration(effectiveDuration);
        newWeight = Math.mulDiv(position.principal, newMultiplier, WAD);
        uint256 oldWeight = position.weight;
        uint64 oldUnlockAt = position.unlockAt;

        scheduledWeightExpiry[position.unlockEpoch] -= oldWeight;
        if (newWeight >= oldWeight) {
            _checkAddedWeight(newWeight - oldWeight);
            _totalActiveWeight += newWeight - oldWeight;
        } else {
            _totalActiveWeight -= oldWeight - newWeight;
        }
        scheduledWeightExpiry[newUnlockEpoch] += newWeight;

        position.weight = newWeight;
        position.unlockEpoch = newUnlockEpoch;
        position.unlockAt = alignedUnlockAt;
        newUnlockAt = alignedUnlockAt;

        emit PositionExtended(
            positionId, oldUnlockAt, newUnlockAt, oldWeight, newWeight
        );
    }

    function claimPosition(
        uint256 positionId,
        address recipient,
        address[] calldata rewardTokens
    )
        external
        override
        nonReentrant
        onlySealed
        returns (uint256 nativeAmount, uint256[] memory tokenAmounts)
    {
        if (recipient == address(0)) revert InvalidAddress();
        _syncLiquidityFeeBacking();
        _syncIfBounded();
        StoredPosition storage position = _ownedPosition(positionId);
        tokenAmounts = new uint256[](rewardTokens.length);

        _settleOne(positionId, position, address(0));
        nativeAmount = _debitAndPay(positionId, address(0), recipient);

        for (uint256 i; i < rewardTokens.length; ++i) {
            address rewardToken = rewardTokens[i];
            _requireSupportedTokenReward(rewardToken);
            for (uint256 j; j < i; ++j) {
                if (rewardTokens[j] == rewardToken) revert DuplicateRewardToken();
            }
            _settleOne(positionId, position, rewardToken);
            tokenAmounts[i] = _debitAndPay(positionId, rewardToken, recipient);
        }
    }

    function unlockPosition(uint256 positionId, address recipient)
        external
        override
        nonReentrant
        onlySealed
        returns (uint256 principalReturned)
    {
        if (recipient == address(0)) revert InvalidAddress();
        _syncIfBounded();
        StoredPosition storage position = _ownedPosition(positionId);
        if (position.withdrawn) revert PositionWithdrawn();
        if (_processedEpoch < position.unlockEpoch) revert PositionNotMatured();

        _settleAll(positionId, position);

        principalReturned = position.principal;
        position.principal = 0;
        position.weight = 0;
        position.withdrawn = true;
        totalLocked -= principalReturned;

        IERC20(NARA).safeTransfer(recipient, principalReturned);
        emit PositionUnlocked(positionId, recipient, principalReturned);
    }

    /// @notice Irreversibly closes a principal-withdrawn reward receipt without
    ///         calling any external reward token. Any unclaimed scaled value is
    ///         returned to the global reward queue for future eligible positions.
    function closePosition(uint256 positionId)
        external
        override
        nonReentrant
        onlySealed
    {
        StoredPosition storage position = _ownedPosition(positionId);
        if (!position.withdrawn) revert PositionNotWithdrawn();
        _recycleAllFractions(positionId);
        position.rewardsClosed = true;
        emit PositionRewardsClosed(positionId);
    }

    /// @notice Pins the active/inactive disposition at Hook-fee accrual time.
    /// @dev No token or epoch state moves here. Active amounts enter the reward
    ///      index only when the explicitly processed epoch is current and its
    ///      eligible weight meets the floor. A stale Engine irrevocably marks the
    ///      share inactive instead of reverting or crediting expired weight.
    function accrueLiquidityFees(uint256 naraAmount, uint256 baseAmount)
        external
        override
        nonReentrant
        onlySealed
        returns (bool rewardsActive)
    {
        if (msg.sender != liquidityFeeVault) revert Unauthorized();
        if (naraAmount == 0 && baseAmount == 0) revert InvalidAmount();
        uint64 processed = _processedEpoch;
        uint64 target = targetEpoch();
        bool epochFresh = target == processed;
        uint256 activeWeight = _totalActiveWeight;
        rewardsActive = epochFresh && activeWeight >= minimumRewardWeight;

        if (rewardsActive) {
            if (naraAmount != 0) {
                totalActiveNaraFeesAccounted += naraAmount;
                pendingActiveNaraFeeFunding += naraAmount;
                _recordReward(NARA, msg.sender, naraAmount);
            }
            if (baseAmount != 0) {
                totalActiveBaseFeesAccounted += baseAmount;
                pendingActiveBaseFeeFunding += baseAmount;
                _recordReward(feeBase, msg.sender, baseAmount);
            }
        } else {
            totalInactiveNaraFeesAccounted += naraAmount;
            totalInactiveBaseFeesAccounted += baseAmount;
            pendingInactiveNaraFeeFunding += naraAmount;
            pendingInactiveBaseFeeFunding += baseAmount;
        }
        emit LiquidityFeesAccounted(
            rewardsActive,
            epochFresh,
            naraAmount,
            baseAmount,
            activeWeight,
            processed,
            target
        );
    }

    /// @notice Permissionlessly backs every pending liquidity-fee accrual in one
    ///         exact pull from the bound Vault. Funding never resamples weight.
    function syncLiquidityFeeBacking()
        external
        override
        nonReentrant
        onlySealed
        returns (uint256 naraFunded, uint256 baseFunded)
    {
        return _syncLiquidityFeeBacking();
    }

    /// @notice Explicit permissionless native-reward donation surface.
    function depositNativeRewards() external payable nonReentrant onlySealed {
        if (msg.value == 0) revert InvalidAmount();
        _syncIfBounded();
        _requireRewardWeight();
        _recordReward(address(0), msg.sender, msg.value);
        totalNativeRewardsReceived += msg.value;
    }

    function advanceEpochs(uint32 maxEpochs)
        external
        override
        nonReentrant
        onlySealed
        returns (uint64 fromEpoch, uint64 toEpoch, uint64 target, bool complete)
    {
        if (maxEpochs == 0) revert InvalidAmount();
        fromEpoch = _processedEpoch;
        target = targetEpoch();
        if (target <= fromEpoch) revert EpochNotReady();

        uint256 steps = target - fromEpoch;
        uint256 limit = maxEpochs;
        if (limit > maxAdvancePerCall) limit = maxAdvancePerCall;
        if (steps > limit) steps = limit;
        _advance(uint32(steps));
        toEpoch = _processedEpoch;
        complete = toEpoch == target;
    }

    function currentEpoch() external view override returns (uint64) {
        return _processedEpoch;
    }

    function targetEpoch() public view override returns (uint64) {
        if (block.timestamp <= epochOrigin) return 0;
        return uint64((block.timestamp - epochOrigin) / epochLength);
    }

    function totalActiveWeight() external view override returns (uint256) {
        return _totalActiveWeight;
    }

    function positionState(uint256 positionId)
        external
        view
        override
        returns (INARAPositionEngineV5.PositionState memory state)
    {
        StoredPosition storage position = _positions[positionId];
        if (!position.exists) revert InvalidPosition();
        state = INARAPositionEngineV5.PositionState({
            owner: position.owner,
            principal: position.principal,
            weight: position.weight,
            openedAt: position.openedAt,
            unlockAt: position.unlockAt,
            active: !position.withdrawn && _processedEpoch < position.unlockEpoch
        });
    }

    function claimableNative(uint256 positionId) external view override returns (uint256) {
        return _claimable(positionId, address(0));
    }

    function claimableToken(uint256 positionId, address rewardToken)
        external
        view
        override
        returns (uint256)
    {
        _requireSupportedTokenReward(rewardToken);
        return _claimable(positionId, rewardToken);
    }

    function rewardAccounting(address rewardToken)
        external
        view
        returns (INARAEngineCoreV5.RewardAccounting memory accounting)
    {
        _requireSupportedReward(rewardToken);
        NARARewardAccountingV5.RewardState storage state = _rewardStates[rewardToken];
        uint256 balance;
        if (rewardToken == address(0)) {
            balance = address(this).balance;
        } else {
            balance = IERC20(rewardToken).balanceOf(address(this));
            if (rewardToken == NARA) {
                balance = balance >= totalLocked ? balance - totalLocked : 0;
            }
        }
        accounting = INARAEngineCoreV5.RewardAccounting({
            indexRay: state.indexRay,
            unallocatedScaled: state.unallocatedScaled,
            indexedOutstandingScaled: state.indexedOutstandingScaled,
            settledOutstandingScaled: state.settledOutstandingScaled,
            totalReceived: state.totalReceived,
            totalClaimed: state.totalClaimed,
            backingBalance: balance,
            conserved: state.conserved()
        });
    }

    function positionRewardScaled(uint256 positionId, address rewardToken)
        external
        view
        returns (uint256 indexRay, uint256 accruedScaled)
    {
        _requireSupportedReward(rewardToken);
        NARARewardAccountingV5.PositionReward storage reward =
            _positionRewards[positionId][rewardToken];
        return (reward.indexRay, reward.accruedScaled);
    }

    function _validateConfig(
        INARAEngineCoreV5.EngineConfig memory config_,
        uint256 reserveAllocation,
        uint256 tokenSupply
    ) internal view {
        if (
            config_.epochOrigin < block.timestamp ||
            config_.epochOrigin > block.timestamp + MAX_EPOCH_ORIGIN_DELAY ||
            config_.epochLength < MIN_EPOCH_LENGTH ||
            config_.epochLength > MAX_EPOCH_LENGTH ||
            config_.minLockDuration < config_.epochLength ||
            config_.maxLockDuration < config_.minLockDuration ||
            config_.maxLockDuration > MAX_LOCK_DURATION_HARD_CAP ||
            config_.maxAdvancePerCall == 0 ||
            config_.maxAdvancePerCall > MAX_ADVANCE_PER_CALL_HARD_CAP ||
            config_.minWeightMultiplierWad < WAD ||
            config_.maxWeightMultiplierWad < config_.minWeightMultiplierWad ||
            config_.maxWeightMultiplierWad > MAX_WEIGHT_MULTIPLIER_WAD ||
            config_.emissionPerEpoch == 0 ||
            config_.emissionPerEpoch > reserveAllocation ||
            config_.emissionBootstrapWeight == 0 ||
            config_.emissionBootstrapWeight > MAX_TOTAL_WEIGHT ||
            config_.minimumRewardWeight == 0 ||
            config_.minimumRewardWeight > MAX_TOTAL_WEIGHT
        ) revert InvalidConfig();

        uint256 maximumAchievableWeight =
            Math.mulDiv(tokenSupply, config_.maxWeightMultiplierWad, WAD);
        if (
            config_.minimumRewardWeight > maximumAchievableWeight ||
            Math.mulDiv(
                config_.emissionPerEpoch,
                config_.minimumRewardWeight,
                config_.minimumRewardWeight + config_.emissionBootstrapWeight
            ) == 0
        ) revert InvalidConfig();
    }

    function _alignedUnlock(uint64 start, uint64 duration)
        internal
        view
        returns (uint64 unlockEpoch_, uint64 unlockAt_)
    {
        uint256 candidate = uint256(start) + duration;
        if (candidate <= epochOrigin) revert InvalidDuration();
        uint256 elapsed = candidate - epochOrigin;
        uint256 epoch = (elapsed + epochLength - 1) / epochLength;
        uint256 timestamp = uint256(epochOrigin) + epoch * epochLength;
        if (epoch > type(uint64).max || timestamp > type(uint64).max) {
            revert InvalidDuration();
        }
        unlockEpoch_ = uint64(epoch);
        unlockAt_ = uint64(timestamp);
    }

    function _multiplierForDuration(uint256 effectiveDuration)
        internal
        view
        returns (uint256)
    {
        if (effectiveDuration <= minLockDuration) return minWeightMultiplierWad;
        if (effectiveDuration >= maxLockDuration) return maxWeightMultiplierWad;
        uint256 span = maxLockDuration - minLockDuration;
        uint256 elapsed = effectiveDuration - minLockDuration;
        return minWeightMultiplierWad +
            Math.mulDiv(
                maxWeightMultiplierWad - minWeightMultiplierWad,
                elapsed,
                span
            );
    }

    function _syncIfBounded() internal {
        uint64 target = targetEpoch();
        uint64 current = _processedEpoch;
        if (target <= current) return;
        uint64 missing = target - current;
        if (missing > maxAdvancePerCall) revert EpochBacklog(current, target);
        _advance(uint32(missing));
    }

    function _advance(uint32 steps) internal {
        for (uint32 i; i < steps; ++i) {
            uint64 epoch = _processedEpoch + 1;
            uint256 received = _pullEpochEmission(epoch);

            rewardIndexAtEpoch[address(0)][epoch] = _rewardStates[address(0)].indexRay;
            rewardIndexAtEpoch[NARA][epoch] = _rewardStates[NARA].indexRay;
            rewardIndexAtEpoch[feeBase][epoch] = _rewardStates[feeBase].indexRay;

            uint256 expiring = scheduledWeightExpiry[epoch];
            if (expiring > _totalActiveWeight) revert WeightLimitExceeded();
            _totalActiveWeight -= expiring;
            _processedEpoch = epoch;
            emit EpochAdvanced(epoch, _totalActiveWeight, received);
        }
    }

    function _pullEpochEmission(uint64 epoch) internal returns (uint256 received) {
        uint256 activeWeight = _totalActiveWeight;
        if (activeWeight < minimumRewardWeight) return 0;
        INARARewardReserveV5 reserve = INARARewardReserveV5(rewardReserve);

        uint256 available;
        try reserve.availableRewards() returns (uint256 amount) {
            available = amount;
        } catch {
            emit ReserveReleaseSkipped(epoch);
            return 0;
        }
        if (available == 0) return 0;

        uint256 dilutedEmission = Math.mulDiv(
            emissionPerEpoch,
            activeWeight,
            activeWeight + emissionBootstrapWeight
        );
        if (dilutedEmission == 0) return 0;
        uint256 requested = dilutedEmission < available ? dilutedEmission : available;
        uint256 beforeBalance = IERC20(NARA).balanceOf(address(this));
        try reserve.releaseToEngine(requested) returns (uint256) {
            uint256 afterBalance = IERC20(NARA).balanceOf(address(this));
            received = afterBalance - beforeBalance;
            if (received != 0) {
                _recordReward(NARA, rewardReserve, received);
                totalReserveRewardsReceived += received;
            }
        } catch {
            emit ReserveReleaseSkipped(epoch);
        }
    }

    function _recordReward(address rewardToken, address source, uint256 amount) internal {
        (uint256 indexedScaled, uint256 queuedScaled) =
            _rewardStates[rewardToken].record(amount, _totalActiveWeight);
        emit RewardReceived(
            rewardToken, source, amount, indexedScaled, queuedScaled
        );
    }

    function _flushAllRewards(address source) internal {
        _flushReward(address(0), source);
        _flushReward(NARA, source);
        _flushReward(feeBase, source);
    }

    function _flushReward(address rewardToken, address source) internal {
        NARARewardAccountingV5.RewardState storage state = _rewardStates[rewardToken];
        uint256 beforeQueued = state.unallocatedScaled;
        (uint256 indexedScaled, uint256 queuedScaled) = state.flush(_totalActiveWeight);
        if (indexedScaled != 0) {
            emit RewardReceived(rewardToken, source, 0, indexedScaled, queuedScaled);
        } else if (beforeQueued != queuedScaled) {
            revert InvalidConfig();
        }
    }

    function _snapshotPosition(uint256 positionId) internal {
        _positionRewards[positionId][address(0)].indexRay =
            _rewardStates[address(0)].indexRay;
        _positionRewards[positionId][NARA].indexRay = _rewardStates[NARA].indexRay;
        _positionRewards[positionId][feeBase].indexRay =
            _rewardStates[feeBase].indexRay;
    }

    function _settleAll(uint256 positionId, StoredPosition storage position) internal {
        _settleOne(positionId, position, address(0));
        _settleOne(positionId, position, NARA);
        _settleOne(positionId, position, feeBase);
    }

    function _settleOne(
        uint256 positionId,
        StoredPosition storage position,
        address rewardToken
    ) internal {
        uint256 effectiveIndex = _effectiveIndex(position, rewardToken);
        _rewardStates[rewardToken].settle(
            _positionRewards[positionId][rewardToken],
            position.weight,
            effectiveIndex
        );
    }

    function _effectiveIndex(StoredPosition storage position, address rewardToken)
        internal
        view
        returns (uint256)
    {
        if (_processedEpoch >= position.unlockEpoch) {
            return rewardIndexAtEpoch[rewardToken][position.unlockEpoch];
        }
        return _rewardStates[rewardToken].indexRay;
    }

    function _claimable(uint256 positionId, address rewardToken)
        internal
        view
        returns (uint256)
    {
        StoredPosition storage position = _positions[positionId];
        if (!position.exists || position.rewardsClosed) return 0;
        return NARARewardAccountingV5.claimable(
            _positionRewards[positionId][rewardToken],
            position.weight,
            _effectiveIndex(position, rewardToken)
        );
    }

    function _debitAndPay(
        uint256 positionId,
        address rewardToken,
        address recipient
    ) internal returns (uint256 amount) {
        amount = _rewardStates[rewardToken].debitClaim(
            _positionRewards[positionId][rewardToken]
        );
        if (amount == 0) return 0;

        if (rewardToken == address(0)) {
            (bool ok,) = payable(recipient).call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(rewardToken).safeTransfer(recipient, amount);
        }
        emit PositionRewardsClaimed(positionId, rewardToken, recipient, amount);
    }

    function _syncLiquidityFeeBacking()
        internal
        returns (uint256 naraFunded, uint256 baseFunded)
    {
        uint256 activeNaraAmount = pendingActiveNaraFeeFunding;
        uint256 activeBaseAmount = pendingActiveBaseFeeFunding;
        uint256 inactiveNaraAmount = pendingInactiveNaraFeeFunding;
        uint256 inactiveBaseAmount = pendingInactiveBaseFeeFunding;
        naraFunded = activeNaraAmount + inactiveNaraAmount;
        baseFunded = activeBaseAmount + inactiveBaseAmount;
        if (naraFunded == 0 && baseFunded == 0) return (0, 0);

        uint256 naraBefore = IERC20(NARA).balanceOf(address(this));
        uint256 baseBefore = IERC20(feeBase).balanceOf(address(this));
        (uint256 naraReleased, uint256 baseReleased) =
            INARALiquidityVaultRoutingV5(liquidityFeeVault).releaseAllEngineClaimsToEngine();
        uint256 naraAfter = IERC20(NARA).balanceOf(address(this));
        uint256 baseAfter = IERC20(feeBase).balanceOf(address(this));
        uint256 actualNara = naraAfter >= naraBefore ? naraAfter - naraBefore : 0;
        uint256 actualBase = baseAfter >= baseBefore ? baseAfter - baseBefore : 0;
        if (
            naraReleased != naraFunded || baseReleased != baseFunded
                || actualNara != naraFunded || actualBase != baseFunded
        ) {
            revert LiquidityFeeBackingMismatch(
                naraFunded,
                actualNara,
                baseFunded,
                actualBase
            );
        }

        pendingActiveNaraFeeFunding = 0;
        pendingActiveBaseFeeFunding = 0;
        pendingInactiveNaraFeeFunding = 0;
        pendingInactiveBaseFeeFunding = 0;
        totalLiquidityNaraFeesReceived += naraFunded;
        totalLiquidityBaseFeesReceived += baseFunded;
        totalActiveNaraFeesFunded += activeNaraAmount;
        totalActiveBaseFeesFunded += activeBaseAmount;

        if (inactiveNaraAmount != 0) {
            totalInactiveNaraFeesRouted += inactiveNaraAmount;
            IERC20(NARA).safeTransfer(inactiveRewardRecipient, inactiveNaraAmount);
        }
        if (inactiveBaseAmount != 0) {
            totalInactiveBaseFeesRouted += inactiveBaseAmount;
            IERC20(feeBase).safeTransfer(inactiveRewardRecipient, inactiveBaseAmount);
        }
        if (inactiveNaraAmount != 0 || inactiveBaseAmount != 0) {
            emit InactiveLiquidityFeesRouted(
                inactiveRewardRecipient,
                inactiveNaraAmount,
                inactiveBaseAmount
            );
        }
        emit LiquidityFeesFunded(
            activeNaraAmount,
            activeBaseAmount,
            inactiveNaraAmount,
            inactiveBaseAmount
        );
    }

    function _recycleAllFractions(uint256 positionId) internal {
        _recycleFraction(positionId, address(0));
        _recycleFraction(positionId, NARA);
        _recycleFraction(positionId, feeBase);
    }

    function _recycleFraction(uint256 positionId, address rewardToken) internal {
        uint256 recycled = _rewardStates[rewardToken].recycleFraction(
            _positionRewards[positionId][rewardToken]
        );
        if (recycled != 0) {
            emit FractionRecycled(positionId, rewardToken, recycled);
        }
    }

    function _pullExact(address assetAddress, address from, uint256 amount) internal {
        IERC20 asset = IERC20(assetAddress);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(from, address(this), amount);
        if (asset.balanceOf(address(this)) - beforeBalance != amount) {
            revert UnsupportedTokenBehavior();
        }
    }

    function _checkAddedWeight(uint256 addedWeight) internal view {
        if (addedWeight > MAX_TOTAL_WEIGHT - _totalActiveWeight) {
            revert WeightLimitExceeded();
        }
    }

    function _requireRewardWeight() internal view {
        uint256 current = _totalActiveWeight;
        if (current < minimumRewardWeight) {
            revert InsufficientRewardWeight(current, minimumRewardWeight);
        }
    }

    function _requireCanonical(address expectedOwner) internal view {
        if (msg.sender != expectedOwner) revert Unauthorized();
        bool canonical;
        try INARAPositionControllerV5(positionController).isCanonicalAccount(msg.sender)
            returns (bool registered)
        {
            canonical = registered;
        } catch {}
        if (!canonical) revert Unauthorized();
    }

    function _ownedPosition(uint256 positionId)
        internal
        view
        returns (StoredPosition storage position)
    {
        position = _positions[positionId];
        if (!position.exists) revert InvalidPosition();
        if (position.rewardsClosed) revert PositionRewardsAlreadyClosed();
        _requireCanonical(position.owner);
    }

    function _activeOwnedPosition(uint256 positionId)
        internal
        view
        returns (StoredPosition storage position)
    {
        position = _ownedPosition(positionId);
        if (position.withdrawn) revert PositionWithdrawn();
        if (_processedEpoch >= position.unlockEpoch) revert PositionMatured();
    }

    function _requireSupportedTokenReward(address rewardToken) internal view {
        if (rewardToken != NARA && rewardToken != feeBase) {
            revert UnsupportedRewardToken();
        }
    }

    function _requireSupportedReward(address rewardToken) internal view {
        if (
            rewardToken != address(0) &&
            rewardToken != NARA &&
            rewardToken != feeBase
        ) revert UnsupportedRewardToken();
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
