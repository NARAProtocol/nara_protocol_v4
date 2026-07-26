// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {EpochSnapshot} from "../NARAEngineTypes.sol";

interface INARAProtocolStatsEngineV1 {
    function currentEpoch() external view returns (uint64);
    function epochState() external view returns (EpochSnapshot memory);
    function EPOCH_LENGTH() external view returns (uint64);
    function GENESIS_TIMESTAMP() external view returns (uint64);
    function treasury() external view returns (address);
    function totalLocked() external view returns (uint256);
    function activeTotalWeight() external view returns (uint256);
    function pendingEthForNextEpoch() external view returns (uint256);
    function nextPositionId() external view returns (uint256);
    function totalNaraDripPaid() external view returns (uint256);
    function totalNaraDripClaimed() external view returns (uint256);
    function totalEthRewardsReceived() external view returns (uint256);
    function totalEthRewardsClaimed() external view returns (uint256);
    function totalEthSweptToTreasury() external view returns (uint256);
    function emissionReserve() external view returns (uint256);
    function rewardReserveAvailable() external view returns (uint256);
}

error NARAProtocolStatsLensV1__ZeroAddress();
error NARAProtocolStatsLensV1__NotAContract();

/// @title NARAProtocolStatsLensV1
/// @notice One-call, read-only headline statistics for the whole NARA v4 protocol.
/// @dev Stateless and admin-free. Built for homepages, analytics dashboards, and
///      data aggregators that need protocol-wide numbers without 15 fan-out calls.
///      Every value is a realized, on-chain fact — no projections, no rankings,
///      no expected-return language. "Distributed/claimed" reflect cumulative
///      amounts that have actually flowed through the engine since genesis.
contract NARAProtocolStatsLensV1 {
    uint256 public constant STATS_VERSION = 1;

    INARAProtocolStatsEngineV1 public immutable ENGINE;

    struct ProtocolStats {
        uint256 statsVersion;

        // ---- Clock ----
        uint64 currentEpoch;        // live epoch by wall-clock
        uint64 settledEpoch;        // last on-chain settled epoch
        uint64 epochLength;         // seconds per epoch
        uint64 genesisTimestamp;    // protocol start

        // ---- Participation ----
        uint256 totalLocked;            // NARA principal currently locked
        uint256 activeTotalWeight;      // sum of active position weight
        uint256 totalPositionsCreated;  // positions ever opened (live + closed)
        uint256 circulatingSupply;      // last-settled circulating-supply snapshot

        // ---- Real yield (cumulative facts since genesis) ----
        uint256 ethDistributedToLockersAllTime; // ETH routed to lockers, all-time
        uint256 ethClaimedByLockersAllTime;     // ETH actually withdrawn by lockers
        uint256 ethToTreasuryAllTime;           // ETH swept to treasury, all-time
        uint256 naraEmittedAllTime;             // NARA emission paid into the pool
        uint256 naraClaimedAllTime;             // NARA emission withdrawn by lockers
        uint256 pendingEthNextEpoch;            // ETH queued for the next settle

        // ---- Emission / runway ----
        uint256 emissionReserveAvailable;  // engine-local reserve
        uint256 rewardReserveAvailable;    // external reserve still pullable
        uint256 currentEpochEmission;      // NARA emitted in the current epoch
        uint256 emissionRunwayEpochs;      // (local + external reserve) / current emission

        // ---- Addresses ----
        address treasury;
    }

    constructor(address engine_) {
        if (engine_ == address(0)) revert NARAProtocolStatsLensV1__ZeroAddress();
        if (engine_.code.length == 0) revert NARAProtocolStatsLensV1__NotAContract();
        ENGINE = INARAProtocolStatsEngineV1(engine_);
    }

    /// @notice Returns the full set of protocol headline statistics in one call.
    function getProtocolStats() external view returns (ProtocolStats memory s) {
        EpochSnapshot memory snap = ENGINE.epochState();

        s.statsVersion = STATS_VERSION;

        s.currentEpoch = ENGINE.currentEpoch();
        s.settledEpoch = snap.epoch;
        s.epochLength = ENGINE.EPOCH_LENGTH();
        s.genesisTimestamp = ENGINE.GENESIS_TIMESTAMP();

        s.totalLocked = ENGINE.totalLocked();
        s.activeTotalWeight = ENGINE.activeTotalWeight();
        uint256 nextId = ENGINE.nextPositionId();
        s.totalPositionsCreated = nextId > 0 ? nextId - 1 : 0; // id 0 reserved as "none"
        s.circulatingSupply = snap.circulatingSupply;

        s.ethDistributedToLockersAllTime = ENGINE.totalEthRewardsReceived();
        s.ethClaimedByLockersAllTime = ENGINE.totalEthRewardsClaimed();
        s.ethToTreasuryAllTime = ENGINE.totalEthSweptToTreasury();
        s.naraEmittedAllTime = ENGINE.totalNaraDripPaid();
        s.naraClaimedAllTime = ENGINE.totalNaraDripClaimed();
        s.pendingEthNextEpoch = ENGINE.pendingEthForNextEpoch();

        s.emissionReserveAvailable = ENGINE.emissionReserve();
        s.rewardReserveAvailable = ENGINE.rewardReserveAvailable();
        s.currentEpochEmission = snap.emission;
        if (snap.emission != 0) {
            s.emissionRunwayEpochs =
                (s.emissionReserveAvailable + s.rewardReserveAvailable) / snap.emission;
        }

        s.treasury = ENGINE.treasury();
    }
}
