// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {EngineConfig, Position} from "../NARAEngineTypes.sol";

/// @dev Minimal mock covering all functions NARARouter and NARADashboardLens call.
/// Mirrors MockNARAEngineV4's `lock`/`lockFor` pattern for token pull.
contract MockEngineForRouter {
    using SafeERC20 for IERC20;

    // EpochSnapshot layout must match NARAEngine's exactly (19 fields).
    struct EpochSnapshot {
        uint64  epoch;
        uint64  timestamp;
        uint256 circulatingSupply;
        uint256 totalLocked;
        uint256 activeTotalWeight;
        uint256 weightedLockShareWad;
        uint256 stressWad;
        uint256 betaWad;
        uint256 horizon;
        uint256 retentionWad;
        uint256 baseEmission;
        uint256 emission;
        uint256 admittedSupply;
        uint256 distributedNara;
        uint256 distributedEth;
        uint256 treasuryAmount;
        uint256 warmupFactorWad;
        uint256 bootstrapWeight;
        uint256 heartbeat;
    }

    // --- mutable state ---
    IERC20  public naraToken;

    uint64  public settledEpoch;
    uint64  public liveEpoch;

    uint256 public advanceEpochsCalls;

    uint256 public _nextPositionId = 1;
    uint256 public _activeTotalWeight;
    uint256 public _totalLocked;
    uint256 public _emissionReserve;
    uint256 public _rewardReserve;

    uint16  public _lockFeeBps;
    uint16  public _claimFeeBps;
    uint96  public _lockFeeWei;
    uint96  public _unlockFeeWei;
    uint64  public _activationDelayEpochs = 3;
    uint64  public _maxLockEpochs = 35040;

    mapping(uint256 => Position) private _positions;
    mapping(uint256 => uint256) public  claimableNara;
    mapping(uint256 => uint256) public  claimableEth;

    // --- test control setters ---
    function setNara(address t)              external { naraToken = IERC20(t); }
    function setLiveEpoch(uint64 v)          external { liveEpoch = v; }
    function setSettledEpoch(uint64 v)       external { settledEpoch = v; }
    function setLockFeeBps(uint16 v)         external { _lockFeeBps = v; }
    function setClaimFeeBps(uint16 v)        external { _claimFeeBps = v; }
    function setLockFeeWei(uint96 v)         external { _lockFeeWei = v; }
    function setUnlockFeeWei(uint96 v)       external { _unlockFeeWei = v; }
    function setActiveTotalWeight(uint256 v) external { _activeTotalWeight = v; }
    function setTotalLocked(uint256 v)       external { _totalLocked = v; }
    function setEmissionReserve(uint256 v)   external { _emissionReserve = v; }
    function setRewardReserve(uint256 v)     external { _rewardReserve = v; }

    function setClaimable(uint256 id, uint256 nara_, uint256 eth_) external {
        claimableNara[id] = nara_;
        claimableEth[id]  = eth_;
    }

    /// @dev Directly inject a position without touching tokens — useful for lens tests.
    function injectPosition(uint256 id, Position calldata p) external {
        _positions[id] = p;
        if (id >= _nextPositionId) _nextPositionId = id + 1;
    }

    // --- NARARouter interface ---

    function NARA() external view returns (address) { return address(naraToken); }

    function currentEpoch() external view returns (uint64) { return liveEpoch; }

    function epochStateView() external view returns (EpochSnapshot memory snap) {
        snap.epoch            = settledEpoch;
        snap.totalLocked      = _totalLocked;
        snap.activeTotalWeight = _activeTotalWeight;
    }

    function advanceEpochs(uint256 maxSteps)
        external
        returns (uint256 stepsAdvanced, EpochSnapshot memory snap)
    {
        if (liveEpoch <= settledEpoch) {
            snap.epoch = settledEpoch;
            return (0, snap);
        }
        uint256 backlog = uint256(liveEpoch - settledEpoch);
        uint256 steps   = maxSteps < backlog ? maxSteps : backlog;
        settledEpoch += uint64(steps);
        advanceEpochsCalls++;
        stepsAdvanced = steps;
        snap.epoch    = settledEpoch;
    }

    function lockFor(address owner, uint256 amount, uint64 durationEpochs, uint256)
        external payable returns (uint256 id)
    {
        naraToken.safeTransferFrom(msg.sender, address(this), amount);
        id = _nextPositionId++;
        _positions[id] = Position({
            owner:            owner,
            createdEpoch:     settledEpoch,
            flags:            0,
            amount:           uint128(amount),
            weight:           uint128(amount * uint256(durationEpochs)),
            activationEpoch:  settledEpoch + _activationDelayEpochs + 1,
            unlockEpoch:      settledEpoch + durationEpochs + 1,
            _reserved0:       0,
            naraDebtRay:      0,
            ethDebtRay:       0
        });
        _totalLocked += amount;
    }

    // --- NARADashboardLens interface ---

    function nextPositionId() external view returns (uint256) { return _nextPositionId; }

    function positionOf(uint256 id) external view returns (Position memory) {
        return _positions[id];
    }

    function claimableRewards(uint256 id)
        external view returns (uint256 naraAmount, uint256 ethAmount)
    {
        return (claimableNara[id], claimableEth[id]);
    }

    function config() external view returns (EngineConfig memory cfg) {
        cfg.activationDelayEpochs = _activationDelayEpochs;
        cfg.maxLockEpochs         = _maxLockEpochs;
    }

    function lockFeeBps()  external view returns (uint16)  { return _lockFeeBps; }
    function claimFeeBps() external view returns (uint16)  { return _claimFeeBps; }
    function lockFeeWei()  external view returns (uint96)  { return _lockFeeWei; }
    function unlockFeeWei() external view returns (uint96) { return _unlockFeeWei; }

    function activeTotalWeight()      external view returns (uint256) { return _activeTotalWeight; }
    function totalLocked()            external view returns (uint256) { return _totalLocked; }
    function emissionReserve()        external view returns (uint256) { return _emissionReserve; }
    function rewardReserveAvailable() external view returns (uint256) { return _rewardReserve; }

    function previewWeight(uint256 amount, uint64 durationEpochs)
        external pure returns (uint256)
    {
        return amount * uint256(durationEpochs);
    }

    receive() external payable {}
}
