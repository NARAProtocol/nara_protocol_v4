// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

interface INARAEngineCoreV5 {
    struct EngineConfig {
        uint64 epochOrigin;
        uint64 epochLength;
        uint64 minLockDuration;
        uint64 maxLockDuration;
        uint32 maxAdvancePerCall;
        uint256 minWeightMultiplierWad;
        uint256 maxWeightMultiplierWad;
        uint256 emissionPerEpoch;
        uint256 emissionBootstrapWeight;
        uint256 minimumRewardWeight;
    }

    struct RewardAccounting {
        uint256 indexRay;
        uint256 unallocatedScaled;
        uint256 indexedOutstandingScaled;
        uint256 settledOutstandingScaled;
        uint256 totalReceived;
        uint256 totalClaimed;
        uint256 backingBalance;
        bool conserved;
    }

    function NARA() external view returns (address);
    function token() external view returns (address);
    function feeBase() external view returns (address);
    function rewardReserve() external view returns (address);
    function positionController() external view returns (address);
    function configurationSealed() external view returns (bool);
    function configurationHash() external view returns (bytes32);
    function rewardAccounting(address rewardToken) external view returns (RewardAccounting memory);
}
