// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../NARAEngineTypes.sol";

/// @title INARAEngine v4
/// @notice Clean v4 interface. Positions are globally indexed by `uint256 positionId`.
/// Wrappers (NFT clones) register as `Position.owner` and drive per-position actions.
interface INARAEngine {
    // -------------------------------------------------------------
    // Events
    // -------------------------------------------------------------
    event Locked(
        address indexed owner,
        uint256 indexed positionId,
        uint256 amount,
        uint64 activationEpoch,
        uint64 unlockEpoch,
        uint256 weight
    );
    event Extended(
        uint256 indexed positionId,
        uint64 oldUnlockEpoch,
        uint64 newUnlockEpoch,
        uint256 oldWeight,
        uint256 newWeight
    );
    event Unlocked(address indexed owner, uint256 indexed positionId, uint256 amount, uint256 weight);
    event RewardsClaimed(uint256 indexed positionId, address indexed to, uint256 naraAmount, uint256 ethAmount);
    event TokenRewardsClaimed(uint256 indexed positionId, address indexed token, address indexed to, uint256 amount);
    event EthRewardsQueued(address indexed from, uint256 amount);
    event TokenRewardsNotified(address indexed token, address indexed from, uint256 amount, uint256 indexRayDelta);
    event AddressParameterSet(bytes32 indexed parameter, address indexed value);
    event UintParameterSet(bytes32 indexed parameter, uint256 value);
    event EpochAdvanced(
        uint64 indexed epoch,
        uint256 emission,
        uint256 distributedNara,
        uint256 distributedEth,
        uint256 weightedLockShareWad,
        uint256 stressWad
    );

    // -------------------------------------------------------------
    // Views
    // -------------------------------------------------------------
    function NARA() external view returns (address);
    function nextPositionId() external view returns (uint256);
    function positionOf(uint256 positionId) external view returns (Position memory);
    function activeTotalWeight() external view returns (uint256);
    function totalLocked() external view returns (uint256);
    function currentEpoch() external view returns (uint64);
    function claimableRewards(uint256 positionId) external view returns (uint256 naraAmount, uint256 ethAmount);
    function claimableTokenRewards(uint256 positionId, address token) external view returns (uint256 amount);

    // -------------------------------------------------------------
    // Core mutations
    // -------------------------------------------------------------
    function lock(uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external
        payable
        returns (uint256 positionId);
    function lockFor(address owner, uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external
        payable
        returns (uint256 positionId);
    function lockWithPermit(
        uint256 amount,
        uint64 durationEpochs,
        uint256 minWeight,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external payable returns (uint256 positionId);

    function extend(uint256 positionId, uint64 additionalEpochs) external;
    function unlock(uint256 positionId) external payable;
    function unlockTo(uint256 positionId, address to) external payable;
    function unlockBatch(uint256[] calldata positionIds) external payable;

    function claimRewards(uint256 positionId, address to)
        external
        returns (uint256 naraAmount, uint256 ethAmount);
    function claimBatch(uint256[] calldata positionIds, address to)
        external
        returns (uint256 naraAmount, uint256 ethAmount);
    function claimTokenRewards(uint256 positionId, address token, address to)
        external
        returns (uint256 amount);

    // -------------------------------------------------------------
    // Distribution routing
    // -------------------------------------------------------------
    function notifyEthRewards() external payable;
    function notifyTokenRewards(address token, uint256 amount) external;

    // -------------------------------------------------------------
    // Epoch engine
    // -------------------------------------------------------------
    function advanceEpochs(uint256 maxSteps) external returns (uint256 stepsAdvanced, EpochSnapshot memory lastSnapshot);
    function poke() external returns (uint256 stepsAdvanced);
}
