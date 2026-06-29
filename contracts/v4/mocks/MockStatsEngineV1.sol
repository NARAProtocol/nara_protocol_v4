// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {EpochSnapshot} from "../NARAEngineTypes.sol";

/// @dev Minimal settable engine surface for NARAProtocolStatsLensV1 tests.
contract MockStatsEngineV1 {
    uint64 public currentEpoch;
    uint64 public EPOCH_LENGTH = 900;
    uint64 public GENESIS_TIMESTAMP = 1_700_000_000;
    address public treasury;
    uint256 public totalLocked;
    uint256 public activeTotalWeight;
    uint256 public pendingEthForNextEpoch;
    uint256 public nextPositionId = 1;
    uint256 public totalNaraDripPaid;
    uint256 public totalNaraDripClaimed;
    uint256 public totalEthRewardsReceived;
    uint256 public totalEthRewardsClaimed;
    uint256 public totalEthSweptToTreasury;
    uint256 public emissionReserve;
    uint256 public rewardReserveAvailable;

    uint64 public settledEpoch;
    uint256 public circulatingSupply;
    uint256 public epochEmission;

    function epochStateView() external view returns (EpochSnapshot memory s) {
        s.epoch = settledEpoch;
        s.circulatingSupply = circulatingSupply;
        s.emission = epochEmission;
    }

    function set(
        uint64 currentEpoch_,
        uint64 settledEpoch_,
        address treasury_,
        uint256 totalLocked_,
        uint256 activeTotalWeight_,
        uint256 nextPositionId_,
        uint256 circulatingSupply_,
        uint256 epochEmission_
    ) external {
        currentEpoch = currentEpoch_;
        settledEpoch = settledEpoch_;
        treasury = treasury_;
        totalLocked = totalLocked_;
        activeTotalWeight = activeTotalWeight_;
        nextPositionId = nextPositionId_;
        circulatingSupply = circulatingSupply_;
        epochEmission = epochEmission_;
    }

    function setTotals(
        uint256 ethReceived_,
        uint256 ethClaimed_,
        uint256 ethToTreasury_,
        uint256 naraPaid_,
        uint256 naraClaimed_,
        uint256 pendingEth_
    ) external {
        totalEthRewardsReceived = ethReceived_;
        totalEthRewardsClaimed = ethClaimed_;
        totalEthSweptToTreasury = ethToTreasury_;
        totalNaraDripPaid = naraPaid_;
        totalNaraDripClaimed = naraClaimed_;
        pendingEthForNextEpoch = pendingEth_;
    }

    function setReserves(uint256 emissionReserve_, uint256 rewardReserveAvailable_) external {
        emissionReserve = emissionReserve_;
        rewardReserveAvailable = rewardReserveAvailable_;
    }
}
