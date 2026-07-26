// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "./NARAEngineTypes.sol";
import {INARAEngine} from "./interfaces/INARAEngine.sol";
import {NARAEngineModelLib} from "./libraries/NARAEngineModelLib.sol";
import {NARAEngineAccountingLib} from "./libraries/NARAEngineAccountingLib.sol";

interface ILauncherView {
    function pendingToken() external view returns (address);
}

interface INaraRewardReserve {
    function availableRewards() external view returns (uint256);
    function releaseToEngine(uint256 amount) external;
    function isValidFor(address nara, address engine) external view returns (bool);
}

interface INaraBondVaultView {
    function nara() external view returns (address);
    function excludedMarketBalance() external view returns (uint256);
}

/// @title NARA Allocation Engine
/// @notice Position-based allocation engine with global position identifiers,
/// multi-asset distribution indexes, ERC-2612 permit support, ERC-1363 transfer
/// callback support, and bounded epoch checkpointing.
/// @dev
/// NARA is resolved once at construction through the launcher pending token reference.
/// The engine tracks time-locked positions, participation weight, scheduled activation,
/// scheduled deactivation, and reserve-bounded allocation accounting.
///
/// Direct ETH transfers are rejected. ETH intended for distribution must be routed
/// through notifyEthRewards().
///
/// The engine contains no general rescue function, no pause mechanism, and no
/// arbitrary foreign-token sweep. Treasury, reserve, and vault wiring are set
/// through the defined role-gated configuration paths.
///
/// Terminology note:
/// "Rewards" in function and event names refers to rule-based claimable allocations
/// calculated by the contract. It does not imply guaranteed return, income, profit,
/// interest, dividend, or revenue share.
contract NARAEngine is
    AccessControl,
    ReentrancyGuardTransient,
    INARAEngine
{
    using SafeERC20 for IERC20;

    struct TokenIndexCheckpoint {
        uint64 epoch;
        uint256 indexRay;
    }

    // ============================================================
    // Constants
    // ============================================================
    uint256 internal constant WAD = 1e18;
    uint256 internal constant RAY = 1e27;
    uint256 internal constant DEBT_UNINITIALISED = type(uint256).max;

    /// @notice Max open positions per owner address (owners are typically NFT wrapper clones).
    uint256 internal constant MAX_LOCK_POSITIONS_PER_ACCOUNT = 64;
    uint32 internal constant POSITION_FLAG_COUNTS_OWNER_CAP = 1;
    /// @notice Max positions in a single batch call.
    uint256 internal constant MAX_BATCH_POSITIONS = 64;
    /// @notice Max fee bps for lock/claim fee setters (hard cap — 10%).
    uint16 internal constant MAX_FEE_BPS = 1000;
    /// @notice Max flat ETH fee the owner can set for lock/unlock. Prevents griefing.
    uint96 internal constant MAX_FLAT_ETH_FEE = 0.01 ether;
    /// @notice Bounded checkpoint advance cap — any user-facing call advances at most this many checkpoints.
    uint64 internal constant MAX_JIT_ADVANCE = 8;
    uint256 internal constant MAX_NARA_SUPPLY = 1_000_000 ether;

    bytes32 public constant PARAM_ROLE = keccak256("PARAM_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 internal constant REWARD_NOTIFIER_ROLE = keccak256("REWARD_NOTIFIER_ROLE");

    // ============================================================
    // Immutable deploy-time state
    // ============================================================
    IERC20 internal immutable NARA_TOKEN;
    uint64 public immutable GENESIS_TIMESTAMP;
    uint64 public immutable EPOCH_LENGTH;
    uint64 public immutable CONFIG_CHANGE_DELAY;
    address public immutable LAUNCHER;

    // ============================================================
    // Post-deploy settable (one-shot) state
    // ============================================================
    address public treasury;
    INaraRewardReserve public rewardReserve;
    address public bondVault;
    bool internal _rewardReserveSet;
    bool internal _bondVaultSet;

    // ============================================================
    // Core engine state
    // ============================================================
    EngineConfig public config;
    EpochSnapshot public epochState;

    uint256 public totalLocked;
    uint256 public activeTotalWeight;

    uint256 public pendingEthForNextEpoch;
    uint256 public totalPendingNaraRewards;
    uint256 public trackedEmissionReserve;

    uint256 public totalNaraDripPaid;
    uint256 public totalNaraDripClaimed;
    uint256 public totalEthRewardsReceived;
    uint256 public totalEthRewardsClaimed;
    uint256 public totalEthSweptToTreasury;

    uint16 public lockFeeBps;
    uint16 public claimFeeBps;
    uint96 public lockFeeWei;
    uint96 public unlockFeeWei;
    uint256 public accumulatedTreasuryEthFees;

    uint256 public naraIndexRay;
    uint256 public ethIndexRay;

    mapping(uint64 => uint256) public naraIndexAtEpoch;
    mapping(uint64 => uint256) public ethIndexAtEpoch;
    mapping(uint64 => uint256) public scheduledActivationWeight;
    mapping(uint64 => uint256) public scheduledDeactivationWeight;

    // Config timelock
    EngineConfig internal _pendingConfig;
    EngineConfig internal _stagedConfig;
    uint64 public pendingConfigTimestamp;
    uint64 public stagedConfigEpoch;

    // ============================================================
    // Position storage (global-ID model)
    // ============================================================
    uint256 public nextPositionId = 1; // positionId 0 reserved as "none"
    mapping(uint256 => Position) internal _positions;
    mapping(address => uint256) internal _ownerPositionCount;

    // ============================================================
    // Multi-asset distribution state
    // ============================================================
    mapping(address => uint256) public tokenIndexRay;
    mapping(address => mapping(uint256 => uint256)) internal _positionTokenDebtRay;
    mapping(address => TokenIndexCheckpoint[]) internal _tokenIndexCheckpoints;
    bool internal _tokenRewardsNotified;

    // ============================================================
    // Construction — reads NARA from launcher's pendingToken()
    // ============================================================
    constructor(
        address admin_,
        uint64 epochLengthSeconds_,
        uint64 configChangeDelaySeconds_,
        uint256 initialBaseEmission_,
        EngineConfig memory cfg_
    ) {
        if (admin_ == address(0)) revert ZeroAddress();
        if (epochLengthSeconds_ == 0 || configChangeDelaySeconds_ == 0) revert InvalidConfig();

        address published = ILauncherView(msg.sender).pendingToken();
        if (published == address(0)) revert TokenNotLaunched();

        NARA_TOKEN = IERC20(published);
        LAUNCHER = msg.sender;
        EPOCH_LENGTH = epochLengthSeconds_;
        CONFIG_CHANGE_DELAY = configChangeDelaySeconds_;
        GENESIS_TIMESTAMP = uint64(block.timestamp);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PARAM_ROLE, admin_);
        _grantRole(TREASURY_ROLE, admin_);
        _grantRole(REWARD_NOTIFIER_ROLE, admin_);

        NARAEngineModelLib.validateConfig(cfg_);
        config = cfg_;

        if (initialBaseEmission_ > cfg_.maxBaseEmission) revert InvalidConfig();
        if (initialBaseEmission_ != 0 && initialBaseEmission_ < cfg_.minBaseEmission) revert InvalidConfig();

        epochState = EpochSnapshot({
            epoch: 0,
            timestamp: uint64(block.timestamp),
            circulatingSupply: 0,
            totalLocked: 0,
            activeTotalWeight: 0,
            weightedLockShareWad: 0,
            stressWad: 0,
            betaWad: cfg_.beta0Wad,
            horizon: NARAEngineModelLib.computeHorizon(cfg_.eMax, cfg_.beta0Wad),
            retentionWad: WAD,
            baseEmission: initialBaseEmission_,
            emission: 0,
            admittedSupply: 0,
            distributedNara: 0,
            distributedEth: 0,
            treasuryAmount: 0,
            warmupFactorWad: 0,
            bootstrapWeight: cfg_.bootstrapInitialWeight,
            heartbeat: type(uint256).max
        });
    }

    /// @notice Reject direct ETH transfers. ETH intended for distribution must use notifyEthRewards().
    receive() external payable {
        revert DirectEthTransferForbidden();
    }

    // ============================================================
    // Views
    // ============================================================
    function NARA() external view returns (address) { return address(NARA_TOKEN); }

    function currentEpoch() public view returns (uint64) {
        return uint64((block.timestamp - GENESIS_TIMESTAMP) / EPOCH_LENGTH);
    }

    function positionOf(uint256 positionId) external view returns (Position memory) {
        return _positions[positionId];
    }

    function emissionReserve() public view returns (uint256) {
        uint256 bal = NARA_TOKEN.balanceOf(address(this));
        uint256 ded = totalLocked + totalPendingNaraRewards;
        uint256 rawAvailable = ded >= bal ? 0 : bal - ded;
        return rawAvailable < trackedEmissionReserve ? rawAvailable : trackedEmissionReserve;
    }

    function rewardReserveAvailable() public view returns (uint256) {
        if (address(rewardReserve) == address(0)) return 0;
        // Fail-open: a misbehaving reserve must not be able to brick epoch advancement (M-04).
        try rewardReserve.availableRewards() returns (uint256 a) {
            return a;
        } catch {
            return 0;
        }
    }

    function claimableRewards(uint256 positionId) external view returns (uint256 naraAmount, uint256 ethAmount) {
        Position storage p = _positions[positionId];
        if (p.amount == 0) return (0, 0);
        (naraAmount, ethAmount) = NARAEngineAccountingLib.previewPositionAccrual(
            naraIndexAtEpoch, ethIndexAtEpoch, epochState.epoch, p
        );
        uint256 feeBps = claimFeeBps;
        if (ethAmount != 0 && feeBps != 0) ethAmount -= (ethAmount * feeBps) / 10_000;
    }

    function claimableTokenRewards(uint256 positionId, address token) external view returns (uint256) {
        Position storage p = _positions[positionId];
        if (p.weight == 0 || epochState.epoch < p.activationEpoch) return 0;
        return NARAEngineAccountingLib.previewTokenAccrual(
            _positionTokenDebtRay[token],
            positionId,
            uint256(p.tokenWeight),
            _tokenRewardEndIndex(p, token),
            _tokenIndexAtOrBefore(token, p.activationEpoch - 1)
        );
    }

    // ============================================================
    // One-shot admin setters (post-deploy wiring)
    // ============================================================
    function setTreasury(address newTreasury) external onlyRole(TREASURY_ROLE) {
        if (newTreasury == address(0) || newTreasury == address(this)) revert InvalidReceiver();
        treasury = newTreasury;
        emit AddressParameterSet(keccak256("treasury"), newTreasury);
    }

    function setRewardReserve(address reserve_) external onlyRole(TREASURY_ROLE) {
        if (_rewardReserveSet) revert AlreadySet();
        if (reserve_.code.length == 0) revert InvalidConfig();
        INaraRewardReserve reserve = INaraRewardReserve(reserve_);
        try reserve.isValidFor(address(NARA_TOKEN), address(this)) returns (bool ok) {
            if (!ok) revert InvalidConfig();
        } catch {
            revert InvalidConfig();
        }
        rewardReserve = reserve;
        _rewardReserveSet = true;
        emit AddressParameterSet(keccak256("rewardReserve"), reserve_);
    }

    function setBondVault(address vault_) external onlyRole(TREASURY_ROLE) {
        if (_bondVaultSet) revert AlreadySet();
        if (vault_ == address(0)) revert ZeroAddress();
        if (vault_.code.length == 0) revert InvalidConfig();
        try INaraBondVaultView(vault_).nara() returns (address nara_) {
            if (nara_ != address(NARA_TOKEN)) revert InvalidConfig();
        } catch {
            revert InvalidConfig();
        }
        bondVault = vault_;
        _bondVaultSet = true;
        emit AddressParameterSet(keccak256("bondVault"), vault_);
    }

    function setLockFee(uint16 feeBps) external onlyRole(PARAM_ROLE) {
        if (feeBps > MAX_FEE_BPS) revert InvalidConfig();
        lockFeeBps = feeBps;
        emit UintParameterSet(keccak256("lockFeeBps"), feeBps);
    }

    function setClaimFee(uint16 feeBps) external onlyRole(PARAM_ROLE) {
        if (feeBps > MAX_FEE_BPS) revert InvalidConfig();
        claimFeeBps = feeBps;
        emit UintParameterSet(keccak256("claimFeeBps"), feeBps);
    }

    function setLockEthFee(uint96 feeWei) external onlyRole(PARAM_ROLE) {
        if (feeWei > MAX_FLAT_ETH_FEE) revert InvalidConfig();
        lockFeeWei = feeWei;
        emit UintParameterSet(keccak256("lockFeeWei"), feeWei);
    }

    function setUnlockEthFee(uint96 feeWei) external onlyRole(PARAM_ROLE) {
        if (feeWei > MAX_FLAT_ETH_FEE) revert InvalidConfig();
        unlockFeeWei = feeWei;
        emit UintParameterSet(keccak256("unlockFeeWei"), feeWei);
    }

    function proposeConfig(EngineConfig calldata cfg_) external onlyRole(PARAM_ROLE) {
        if (pendingConfigTimestamp != 0 || stagedConfigEpoch != 0) revert ConfigExists();
        NARAEngineModelLib.validateConfig(cfg_);
        _pendingConfig = cfg_;
        pendingConfigTimestamp = uint64(block.timestamp) + CONFIG_CHANGE_DELAY;
    }

    function executeConfig() external onlyRole(PARAM_ROLE) nonReentrant {
        if (pendingConfigTimestamp == 0) revert NoPendingConfig();
        if (block.timestamp < pendingConfigTimestamp) revert ConfigTimelockNotElapsed();
        _jitAdvanceFresh();
        _stagedConfig = _pendingConfig;
        delete _pendingConfig;
        pendingConfigTimestamp = 0;
        stagedConfigEpoch = epochState.epoch + 1;
    }

    function cancelConfig() external onlyRole(PARAM_ROLE) {
        if (pendingConfigTimestamp == 0 && stagedConfigEpoch == 0) revert NoPendingConfig();
        pendingConfigTimestamp = 0;
        stagedConfigEpoch = 0;
        delete _pendingConfig;
        delete _stagedConfig;
    }

    function withdrawTreasuryEthFees(address to) external onlyRole(TREASURY_ROLE) nonReentrant {
        if (to == address(0) || to == address(this)) revert InvalidReceiver();
        uint256 amount = accumulatedTreasuryEthFees;
        if (amount == 0) revert ZeroValue();
        accumulatedTreasuryEthFees = 0;
        totalEthSweptToTreasury += amount;
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    /// @notice Pull NARA from the allocation reserve into the engine's tracked distribution bucket.
    /// @dev Anyone may call. The allocation reserve itself enforces its own pace/caps.
    function syncEmissionReserve() external nonReentrant {
        _topUpEmissionReserveIfNeeded(0);
    }

    // ============================================================
    // Locking
    // ============================================================
    function lock(uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external
        payable
        nonReentrant
        returns (uint256 positionId)
    {
        _collectFlatEthFee(lockFeeWei);
        _jitAdvanceFresh();
        positionId = _createPosition(msg.sender, msg.sender, amount, durationEpochs, minWeight, true);
    }

    function lockFor(address owner, uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external
        payable
        nonReentrant
        returns (uint256 positionId)
    {
        if (owner == address(0)) revert ZeroAddress();
        _collectFlatEthFee(lockFeeWei);
        _jitAdvanceFresh();
        positionId = _createPosition(msg.sender, owner, amount, durationEpochs, minWeight, true);
    }

    function lockWithPermit(
        uint256 amount,
        uint64 durationEpochs,
        uint256 minWeight,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant returns (uint256 positionId) {
        _collectFlatEthFee(lockFeeWei);
        // Permit is best-effort: a prior lock by the same user may have already
        // consumed the allowance. Don't revert if permit fails — the subsequent
        // transferFrom will, and the user gets a clearer error.
        try IERC20Permit(address(NARA_TOKEN)).permit(msg.sender, address(this), amount, deadline, v, r, s) {}
        catch {}
        _jitAdvanceFresh();
        positionId = _createPosition(msg.sender, msg.sender, amount, durationEpochs, minWeight, true);
    }

    /// @notice ERC-1363 entry point. NARA has already been transferred to the
    /// engine by the token before this callback. Flat ETH fee cannot apply here
    /// (no msg.value on transferAndCall).
    /// @dev data encoding: `abi.encode(uint64 durationEpochs, uint256 minWeight, address positionOwner)`.
    /// If `positionOwner` is zero, it defaults to `from`.
    function onTransferReceived(
        address /*operator*/,
        address from,
        uint256 value,
        bytes calldata data
    ) external nonReentrant returns (bytes4) {
        if (msg.sender != address(NARA_TOKEN)) revert InvalidCaller();
        if (lockFeeWei != 0) revert InsufficientFee();
        (uint64 durationEpochs, uint256 minWeight, address posOwner) =
            abi.decode(data, (uint64, uint256, address));
        if (posOwner == address(0)) posOwner = from;
        if (epochState.epoch != currentEpoch()) revert EpochStale();
        // pullNara = false since NARA already sits in engine balance.
        _createPosition(from, posOwner, value, durationEpochs, minWeight, false);
        return this.onTransferReceived.selector;
    }

    function _createPosition(
        address payer,
        address posOwner,
        uint256 amount,
        uint64 durationEpochs,
        uint256 minWeight,
        bool pullNara
    ) internal returns (uint256 positionId) {
        if (amount == 0) revert ZeroValue();
        EngineConfig memory c = config;
        if (durationEpochs <= c.activationDelayEpochs) revert LockTooShort();
        if (durationEpochs > c.maxLockEpochs) revert LockTooLong();
        uint32 positionFlags;
        if (payer == posOwner) {
            if (_ownerPositionCount[posOwner] >= MAX_LOCK_POSITIONS_PER_ACCOUNT) {
                revert TooManyPositions();
            }
            positionFlags = POSITION_FLAG_COUNTS_OWNER_CAP;
        }

        uint256 feeAmount = (amount * lockFeeBps) / 10_000;
        uint256 netAmount = amount - feeAmount;
        if (netAmount == 0) revert ZeroValue();

        uint256 weight = NARAEngineModelLib.computeWeight(c, netAmount, durationEpochs);
        if (weight == 0) revert ZeroWeight();
        if (minWeight != 0 && weight < minWeight) revert SlippageExceeded();

        uint64 ep = epochState.epoch;
        uint64 activationEpoch = ep + c.activationDelayEpochs + 1;
        uint64 unlockEpoch = ep + durationEpochs + 1;

        positionId = nextPositionId++;
        _positions[positionId] = Position({
            owner: posOwner,
            createdEpoch: ep,
            flags: positionFlags,
            amount: _toUint128(netAmount),
            weight: _toUint128(weight),
            activationEpoch: activationEpoch,
            unlockEpoch: unlockEpoch,
            tokenWeight: _toUint128(weight),
            naraDebtRay: DEBT_UNINITIALISED,
            ethDebtRay: DEBT_UNINITIALISED
        });
        if (positionFlags != 0) {
            unchecked { _ownerPositionCount[posOwner] += 1; }
        }

        totalLocked += netAmount;
        scheduledActivationWeight[activationEpoch] += weight;
        scheduledDeactivationWeight[unlockEpoch] += weight;

        if (pullNara) {
            NARA_TOKEN.safeTransferFrom(payer, address(this), amount);
        } else {
            // On the ERC-1363 path the token already moved `amount` to us. If
            // lockFeeBps is set, fee is owed back to treasury from that pool.
        }
        if (feeAmount > 0) {
            address t = treasury;
            if (t == address(0)) revert InvalidReceiver();
            NARA_TOKEN.safeTransfer(t, feeAmount);
        }

        emit Locked(posOwner, positionId, netAmount, activationEpoch, unlockEpoch, weight);
    }

    // ============================================================
    // Extend
    // ============================================================
    function extend(uint256 positionId, uint64 additionalEpochs) external nonReentrant {
        Position storage p = _positions[positionId];
        if (p.amount == 0) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        _jitAdvanceFresh();
        uint64 ep = epochState.epoch;
        if (ep >= p.unlockEpoch) revert PositionMatured();

        EngineConfig memory c = config;
        bool inactive = ep < p.activationEpoch;
        uint256 oldWeight = uint256(p.weight);

        if (!inactive) {
            (uint256 n, uint256 e) = NARAEngineAccountingLib.settleAndRebase(
                naraIndexAtEpoch,
                ethIndexAtEpoch,
                naraIndexRay,
                ethIndexRay,
                ep,
                p,
                oldWeight,
                oldWeight
            );
            if (n != 0) _deliverNara(p.owner, n);
            if (e != 0) _deliverEth(p.owner, e, true);
        }

        uint64 oldDurationEpochs = p.unlockEpoch - p.createdEpoch - 1;
        uint64 newDurationEpochs = oldDurationEpochs + additionalEpochs;
        if (newDurationEpochs > c.maxLockEpochs) revert LockTooLong();

        uint64 oldUnlockEpoch = p.unlockEpoch;
        uint64 newUnlockEpoch = oldUnlockEpoch + additionalEpochs;

        uint256 refOldWeight = NARAEngineModelLib.computeWeight(c, uint256(p.amount), oldDurationEpochs);
        uint256 newWeight = NARAEngineModelLib.computeWeight(c, uint256(p.amount), newDurationEpochs);
        if (newWeight <= refOldWeight) revert InvalidExtension();

        if (inactive) {
            if (newWeight >= oldWeight) {
                scheduledActivationWeight[p.activationEpoch] += newWeight - oldWeight;
            } else {
                _saturatingSub(scheduledActivationWeight, p.activationEpoch, oldWeight - newWeight);
            }
            // Not yet accruing token rewards (accrual starts at activationEpoch): safe to track new weight.
            p.tokenWeight = _toUint128(newWeight);
        } else {
            if (newWeight >= oldWeight) {
                activeTotalWeight += newWeight - oldWeight;
            } else {
                if (_tokenRewardsNotified) revert InvalidExtension();
                activeTotalWeight -= oldWeight - newWeight;
            }
            p.naraDebtRay = Math.mulDiv(newWeight, naraIndexRay, RAY);
            p.ethDebtRay = Math.mulDiv(newWeight, ethIndexRay, RAY);
            // Token-reward weight is frozen once any token reward is live, so the larger
            // post-extend weight cannot retroactively over-credit instant-distribution rewards.
            if (!_tokenRewardsNotified) p.tokenWeight = _toUint128(newWeight);
        }

        _saturatingSub(scheduledDeactivationWeight, oldUnlockEpoch, oldWeight);
        scheduledDeactivationWeight[newUnlockEpoch] += newWeight;

        p.weight = _toUint128(newWeight);
        p.unlockEpoch = newUnlockEpoch;

        if (inactive) {
            p.naraDebtRay = DEBT_UNINITIALISED;
            p.ethDebtRay = DEBT_UNINITIALISED;
        }

        emit Extended(positionId, oldUnlockEpoch, newUnlockEpoch, oldWeight, newWeight);
    }

    // ============================================================
    // Unlock
    // ============================================================
    function unlock(uint256 positionId) external payable nonReentrant {
        _collectFlatEthFee(unlockFeeWei);
        _jitAdvanceFresh();
        _unlockOne(positionId, msg.sender);
    }

    function unlockTo(uint256 positionId, address to) external payable nonReentrant {
        _validateRewardReceiver(to);
        _collectFlatEthFee(unlockFeeWei);
        _jitAdvanceFresh();
        _unlockOne(positionId, to);
    }

    function unlockBatch(uint256[] calldata positionIds) external payable nonReentrant {
        uint256 len = positionIds.length;
        if (len == 0) revert ZeroValue();
        if (len > MAX_BATCH_POSITIONS) revert BatchTooLarge();
        _collectFlatEthFee(uint256(unlockFeeWei) * len);
        _jitAdvanceFresh();
        for (uint256 i; i < len; ) {
            _unlockOne(positionIds[i], msg.sender);
            unchecked { ++i; }
        }
    }

    function _unlockOne(uint256 positionId, address to) internal {
        Position storage p = _positions[positionId];
        if (p.amount == 0) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (epochState.epoch < p.unlockEpoch) revert PositionNotMatured();

        (uint256 n, uint256 e) = NARAEngineAccountingLib.positionAccrual(
            naraIndexAtEpoch, ethIndexAtEpoch, epochState.epoch, p
        );
        uint256 amount = uint256(p.amount);
        uint256 weight = uint256(p.weight);
        address posOwner = p.owner;

        totalLocked -= amount;
        if ((p.flags & POSITION_FLAG_COUNTS_OWNER_CAP) != 0) {
            unchecked { _ownerPositionCount[posOwner] -= 1; }
        }
        p.amount = 0;

        if (n != 0) _deliverNara(to, n);
        if (e != 0) _deliverEth(to, e, true);
        NARA_TOKEN.safeTransfer(to, amount);

        emit Unlocked(posOwner, positionId, amount, weight);
    }

    // ============================================================
    // Claiming
    // ============================================================
    function claimRewards(uint256 positionId, address to)
        external
        nonReentrant
        returns (uint256 naraAmount, uint256 ethAmount)
    {
        _validateRewardReceiver(to);
        _jitAdvanceFresh();
        (naraAmount, ethAmount) = _claimOne(positionId, to);
    }

    function claimBatch(uint256[] calldata positionIds, address to)
        external
        nonReentrant
        returns (uint256 naraAmount, uint256 ethAmount)
    {
        _validateRewardReceiver(to);
        uint256 len = positionIds.length;
        if (len == 0) revert ZeroValue();
        if (len > MAX_BATCH_POSITIONS) revert BatchTooLarge();
        _jitAdvanceFresh();
        for (uint256 i; i < len; ) {
            (uint256 n, uint256 e) = _claimOne(positionIds[i], to);
            naraAmount += n;
            ethAmount += e;
            unchecked { ++i; }
        }
    }

    /// @dev Returns gross NARA allocation and net ETH distribution sent to `to`.
    /// Emits one event per position.
    function _claimOne(uint256 positionId, address to)
        internal
        returns (uint256 naraAmount, uint256 ethAmount)
    {
        Position storage p = _positions[positionId];
        if (p.amount == 0) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        (uint256 n, uint256 e) = NARAEngineAccountingLib.positionAccrual(
            naraIndexAtEpoch, ethIndexAtEpoch, epochState.epoch, p
        );
        if (n == 0 && e == 0) revert NothingToClaim();

        if (n > 0) {
            naraAmount = n;
            _deliverNara(to, n);
        }
        if (e > 0) {
            ethAmount = _deliverEth(to, e, true);
        }
        emit RewardsClaimed(positionId, to, naraAmount, ethAmount);
    }

    function claimTokenRewards(uint256 positionId, address token, address to)
        external
        nonReentrant
        returns (uint256 amount)
    {
        if (token == address(NARA_TOKEN) || token == address(0)) revert InvalidToken();
        _validateRewardReceiver(to);
        _jitAdvanceFresh();
        Position storage p = _positions[positionId];
        if (p.weight == 0) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (epochState.epoch < p.activationEpoch) revert PositionNotMatured();

        amount = NARAEngineAccountingLib.tokenAccrual(
            _positionTokenDebtRay[token],
            positionId,
            uint256(p.tokenWeight),
            _tokenRewardEndIndex(p, token),
            _tokenIndexAtOrBefore(token, p.activationEpoch - 1)
        );
        if (amount == 0) revert NothingToClaim();

        IERC20(token).safeTransfer(to, amount);
        emit TokenRewardsClaimed(positionId, token, to, amount);
    }

    // ============================================================
    // Distribution routing
    // ============================================================
    function notifyEthRewards() external payable nonReentrant {
        _jitAdvanceFresh();
        if (activeTotalWeight == 0) revert NoActiveWeight();
        _queueEthRewards(msg.sender, msg.value);
    }

    function notifyTokenRewards(address token, uint256 amount) external nonReentrant onlyRole(REWARD_NOTIFIER_ROLE) {
        if (token == address(NARA_TOKEN) || token == address(0)) revert RewardTokenNotAllowed();
        if (amount == 0) revert ZeroValue();
        _jitAdvanceFresh();
        uint256 w = activeTotalWeight;
        if (w == 0) revert NoActiveWeight();

        uint256 before_ = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before_;
        if (received == 0) revert ZeroValue();

        uint256 delta = Math.mulDiv(received, RAY, w);
        tokenIndexRay[token] += delta;
        _tokenRewardsNotified = true;
        _writeTokenIndexCheckpoint(token, epochState.epoch, tokenIndexRay[token]);
        emit TokenRewardsNotified(token, msg.sender, received, delta);
    }

    /// @notice Pull-based NARA distribution funding. Caller approval is consumed and
    /// the amount becomes part of the tracked allocation reserve.
    function depositRewards(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroValue();
        NARA_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        trackedEmissionReserve += amount;
    }

    // ============================================================
    // Epoch advance
    // ============================================================
    function advanceEpochs(uint256 maxSteps)
        external
        nonReentrant
        returns (uint256 stepsAdvanced, EpochSnapshot memory lastSnapshot)
    {
        if (maxSteps == 0) revert ZeroValue();
        uint64 liveEpoch = currentEpoch();
        while (stepsAdvanced < maxSteps && liveEpoch >= epochState.epoch + 1) {
            lastSnapshot = _advanceOneEpoch();
            unchecked { ++stepsAdvanced; }
        }
        if (stepsAdvanced == 0) revert EpochNotReady();
    }

    function poke() external nonReentrant returns (uint256 stepsAdvanced) {
        stepsAdvanced = _jitAdvance();
    }

    /// @dev Bounded automatic checkpoint advance. Capped at MAX_JIT_ADVANCE per user-facing call.
    /// If checkpoint backlog exceeds the cap, additional checkpoint calls may be required.
    function _jitAdvance() internal returns (uint64 stepsAdvanced) {
        uint64 liveEpoch = currentEpoch();
        while (stepsAdvanced < MAX_JIT_ADVANCE && liveEpoch >= epochState.epoch + 1) {
            _advanceOneEpoch();
            unchecked { ++stepsAdvanced; }
        }
    }

    function _jitAdvanceFresh() internal {
        _jitAdvance();
        if (epochState.epoch != currentEpoch()) revert EpochStale();
    }

    function _advanceOneEpoch() internal returns (EpochSnapshot memory nextSnapshot) {
        uint64 nextEpoch = epochState.epoch + 1;
        if (currentEpoch() < nextEpoch) revert EpochNotReady();
        _topUpEmissionReserveIfNeeded(0);

        if (stagedConfigEpoch != 0 && stagedConfigEpoch == nextEpoch) {
            config = _stagedConfig;
            delete _stagedConfig;
            stagedConfigEpoch = 0;
        }

        uint64 boundaryTimestamp = GENESIS_TIMESTAMP + nextEpoch * EPOCH_LENGTH;
        _applyScheduledActiveWeightChanges(nextEpoch);

        nextSnapshot = NARAEngineModelLib.computeNextEpochSnapshot(
            epochState,
            config,
            _circulatingSupply(),
            totalLocked,
            activeTotalWeight,
            pendingEthForNextEpoch,
            boundaryTimestamp
        );
        nextSnapshot.treasuryAmount = 0;

        if (nextSnapshot.distributedNara > 0) {
            uint256 local = emissionReserve();
            uint256 external_ = rewardReserveAvailable();
            uint256 totalFunds = local + external_;
            if (nextSnapshot.distributedNara > totalFunds) {
                nextSnapshot.distributedNara = totalFunds;
            }
            if (nextSnapshot.distributedNara > local) {
                uint256 shortfall = nextSnapshot.distributedNara - local;
                // Fail-open: if the reserve reverts, distribute only locally-held funds this
                // epoch rather than letting a bad reserve freeze the whole engine (M-04).
                try rewardReserve.releaseToEngine(shortfall) {
                    uint256 received =
                        NARA_TOKEN.balanceOf(address(this)) - totalLocked - totalPendingNaraRewards - local;
                    if (received > shortfall) received = shortfall;
                    trackedEmissionReserve += received;
                    nextSnapshot.distributedNara = local + received;
                } catch {
                    nextSnapshot.distributedNara = local;
                }
            }
            trackedEmissionReserve -= nextSnapshot.distributedNara;
        }

        uint256 naraAccRay;
        uint256 ethAccRay;
        if (activeTotalWeight > 0) {
            if (nextSnapshot.distributedNara > 0) {
                totalPendingNaraRewards += nextSnapshot.distributedNara;
                totalNaraDripPaid += nextSnapshot.distributedNara;
                naraAccRay = Math.mulDiv(nextSnapshot.distributedNara, RAY, activeTotalWeight);
                naraIndexRay += naraAccRay;
            }
            if (nextSnapshot.distributedEth > 0) {
                pendingEthForNextEpoch -= nextSnapshot.distributedEth;
                ethAccRay = Math.mulDiv(nextSnapshot.distributedEth, RAY, activeTotalWeight);
                ethIndexRay += ethAccRay;
            }
        } else {
            // No active weight: bank distributed ETH for next epoch; don't burn it.
            nextSnapshot.distributedEth = 0;
        }

        naraIndexAtEpoch[nextEpoch] = naraIndexRay;
        ethIndexAtEpoch[nextEpoch] = ethIndexRay;

        nextSnapshot.timestamp = boundaryTimestamp;
        nextSnapshot.circulatingSupply = _circulatingSupply();
        nextSnapshot.totalLocked = totalLocked;
        nextSnapshot.activeTotalWeight = activeTotalWeight;
        epochState = nextSnapshot;

        emit EpochAdvanced(
            nextSnapshot.epoch,
            nextSnapshot.emission,
            nextSnapshot.distributedNara,
            nextSnapshot.distributedEth,
            nextSnapshot.weightedLockShareWad,
            nextSnapshot.stressWad
        );
    }

    // ============================================================
    // Internals
    // ============================================================
    function _collectFlatEthFee(uint256 required) internal {
        if (msg.value != required) revert InsufficientFee();
        if (required > 0) accumulatedTreasuryEthFees += required;
    }

    function _validateRewardReceiver(address to) internal view {
        if (to == address(0) || to == address(this)) revert InvalidReceiver();
    }

    function _queueEthRewards(address from, uint256 amount) internal {
        if (amount == 0) revert ZeroValue();
        pendingEthForNextEpoch += amount;
        totalEthRewardsReceived += amount;
        emit EthRewardsQueued(from, amount);
    }

    function _deliverNara(address to, uint256 amount) internal {
        uint256 pending = totalPendingNaraRewards;
        totalPendingNaraRewards = pending >= amount ? pending - amount : 0;
        totalNaraDripClaimed += amount;
        NARA_TOKEN.safeTransfer(to, amount);
    }

    function _deliverEth(address to, uint256 e, bool chargeClaimFee) internal returns (uint256 net) {
        uint256 ethFee = chargeClaimFee ? (e * claimFeeBps) / 10_000 : 0;
        net = e - ethFee;
        if (ethFee > 0) accumulatedTreasuryEthFees += ethFee;
        totalEthRewardsClaimed += net;
        if (net > 0) {
            (bool ok, ) = payable(to).call{value: net}("");
            if (!ok) revert EthTransferFailed();
        }
    }

    function _applyScheduledActiveWeightChanges(uint64 epoch) internal {
        uint256 act = scheduledActivationWeight[epoch];
        uint256 deact = scheduledDeactivationWeight[epoch];
        if (act == 0 && deact == 0) return;
        uint256 next = activeTotalWeight + act;
        next = next >= deact ? next - deact : 0;
        activeTotalWeight = next;
        delete scheduledActivationWeight[epoch];
        delete scheduledDeactivationWeight[epoch];
    }

    function _circulatingSupply() internal view returns (uint256) {
        uint256 total = NARA_TOKEN.totalSupply();
        if (total > MAX_NARA_SUPPLY) total = MAX_NARA_SUPPLY;
        uint256 excluded = NARA_TOKEN.balanceOf(address(this));
        address r = address(rewardReserve);
        if (r != address(0)) excluded += NARA_TOKEN.balanceOf(r);
        address v = bondVault;
        if (v != address(0)) {
            excluded += NARA_TOKEN.balanceOf(v);
            if (v.code.length != 0) {
                try INaraBondVaultView(v).excludedMarketBalance() returns (uint256 x) {
                    excluded += x;
                } catch {}
            }
        }
        return excluded >= total ? 0 : total - excluded;
    }

    function _topUpEmissionReserveIfNeeded(uint256 /*hint*/) internal {
        uint256 balance = NARA_TOKEN.balanceOf(address(this));
        uint256 reserved = totalLocked + totalPendingNaraRewards + trackedEmissionReserve;
        if (balance > reserved) {
            trackedEmissionReserve += balance - reserved;
        }
    }

    function _writeTokenIndexCheckpoint(address token, uint64 epoch, uint256 indexRay) internal {
        TokenIndexCheckpoint[] storage checkpoints = _tokenIndexCheckpoints[token];
        uint256 len = checkpoints.length;
        if (len != 0 && checkpoints[len - 1].epoch == epoch) {
            checkpoints[len - 1].indexRay = indexRay;
            return;
        }
        checkpoints.push(TokenIndexCheckpoint({epoch: epoch, indexRay: indexRay}));
    }

    function _tokenIndexAtOrBefore(address token, uint64 epoch) internal view returns (uint256) {
        TokenIndexCheckpoint[] storage checkpoints = _tokenIndexCheckpoints[token];
        uint256 len = checkpoints.length;
        if (len == 0) return 0;
        if (epoch < checkpoints[0].epoch) return 0;

        uint256 lo;
        uint256 hi = len - 1;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            if (checkpoints[mid].epoch <= epoch) lo = mid;
            else hi = mid - 1;
        }
        return checkpoints[lo].indexRay;
    }

    function _tokenRewardEndIndex(Position storage p, address token) internal view returns (uint256) {
        if (epochState.epoch >= p.unlockEpoch) {
            return _tokenIndexAtOrBefore(token, p.unlockEpoch - 1);
        }
        return tokenIndexRay[token];
    }

    function _toUint128(uint256 x) internal pure returns (uint128) {
        if (x > type(uint128).max) revert Uint128Overflow();
        return uint128(x);
    }

    function _saturatingSub(mapping(uint64 => uint256) storage map, uint64 key, uint256 amount) internal {
        uint256 v = map[key];
        map[key] = v >= amount ? v - amount : 0;
    }
}
