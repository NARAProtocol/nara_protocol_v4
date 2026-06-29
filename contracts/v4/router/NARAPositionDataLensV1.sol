// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {EpochSnapshot, Position} from "../NARAEngineTypes.sol";

interface INARAPositionDataEngineV1 {
    function currentEpoch() external view returns (uint64);
    function epochStateView() external view returns (EpochSnapshot memory);
    function claimableRewards(uint256 positionId) external view returns (uint256 naraAmount, uint256 ethAmount);
    function claimableTokenRewards(uint256 positionId, address token) external view returns (uint256 amount);
    function activeTotalWeight() external view returns (uint256);
    function EPOCH_LENGTH() external view returns (uint64);
}

interface INARAPositionDataNFTV1 {
    function engine() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function accountOf(uint256 tokenId) external view returns (address);
    function closedRewardOwnerOfPosition(uint256 positionId) external view returns (address);
    function closedAccountOfPosition(uint256 positionId) external view returns (address);
    function genesisRewardDistributor() external view returns (address);
    function positionIdOf(uint256 tokenId) external view returns (uint256);
    function positionInfo(uint256 tokenId) external view returns (Position memory);
    function lifetimeNaraClaimed(uint256 tokenId) external view returns (uint256);
    function lifetimeEthClaimed(uint256 tokenId) external view returns (uint256);
    function genesisMetadataOf(uint256 tokenId)
        external
        view
        returns (
            bool isGenesis,
            bool isEternal,
            uint16 roundId,
            uint16 tierId,
            uint32 rewardMultiplierBps,
            uint64 mintedAt,
            uint256 rewardWeight
        );
    function genesisRewardShareWad(uint256 tokenId) external view returns (uint256);
    function claimableGenesisEth(uint256 tokenId) external view returns (uint256);
    function claimableGenesisToken(uint256 tokenId) external view returns (uint256);
}

interface INARAClosedGenesisDataV1 {
    function closedOwnerOf(uint256 tokenId) external view returns (address);
    function claimableEth(uint256 tokenId) external view returns (uint256);
    function claimableToken(uint256 tokenId) external view returns (uint256);
}

error NARAPositionDataLensV1__ZeroAddress();
error NARAPositionDataLensV1__NotAContract();
error NARAPositionDataLensV1__PairingMismatch();
error NARAPositionDataLensV1__TooManyTokenIds();

/// @title NARAPositionDataLensV1
/// @notice Typed live position data for dashboards, integrations, and future NARA projects.
/// @dev Stateless and admin-free. Marketplace metadata intentionally omits these changing values.
contract NARAPositionDataLensV1 {
    uint256 public constant DATA_VERSION = 1;
    uint256 public constant MAX_BATCH = 100;

    INARAPositionDataEngineV1 public immutable ENGINE;
    INARAPositionDataNFTV1 public immutable POSITION_NFT;

    struct PositionData {
        uint256 dataVersion;
        uint256 tokenId;
        uint256 positionId;
        address owner;
        address account;
        address enginePositionOwner;
        uint64 liveEpoch;
        uint64 settledEpoch;
        uint64 createdEpoch;
        uint64 activationEpoch;
        uint64 unlockEpoch;
        uint128 amount;
        uint128 weight;
        // Live engagement + realized-performance stats (facts, not projections).
        uint256 weightShareWad;        // position weight / live active total weight (1e18 = 100%)
        uint64  ageEpochs;             // epochs elapsed since creation
        uint64  epochsToUnlock;        // epochs remaining until unlock (0 if matured/pending-unknown)
        uint256 secondsToUnlock;       // epochsToUnlock * EPOCH_LENGTH
        uint256 lifetimeNaraEarned;    // NARA delivered to holders over the position's life
        uint256 lifetimeEthEarned;     // ETH delivered to holders over the position's life
        uint256 realizedNaraReturnBps; // lifetimeNaraEarned vs principal, to date (bps, unit-consistent)
        uint256 claimableNara;
        uint256 claimableEth;
        uint256 claimableGenesisEth;
        uint256 claimableGenesisToken;
        uint256 genesisRewardShareWad;
        uint16 genesisRoundId;
        uint16 genesisTierId;
        uint32 genesisRewardMultiplierBps;
        uint64 genesisMintedAt;
        uint256 genesisRewardWeight;
        bool pending;
        bool active;
        bool matured;
        bool isGenesis;
        bool isEternal;
        bool exists;
    }

    struct ClosedPositionTokenData {
        uint256 positionId;
        address rewardOwner;
        address account;
        address token;
        uint256 claimableAmount;
    }

    struct ClosedGenesisData {
        uint256 tokenId;
        address rewardOwner;
        uint256 claimableEth;
        uint256 claimableToken;
    }

    constructor(address engine_, address positionNft_) {
        if (engine_ == address(0) || positionNft_ == address(0)) {
            revert NARAPositionDataLensV1__ZeroAddress();
        }
        if (engine_.code.length == 0 || positionNft_.code.length == 0) {
            revert NARAPositionDataLensV1__NotAContract();
        }
        if (INARAPositionDataNFTV1(positionNft_).engine() != engine_) {
            revert NARAPositionDataLensV1__PairingMismatch();
        }
        ENGINE = INARAPositionDataEngineV1(engine_);
        POSITION_NFT = INARAPositionDataNFTV1(positionNft_);
    }

    function getPositionData(uint256 tokenId) public view returns (PositionData memory data) {
        uint256 positionId = POSITION_NFT.positionIdOf(tokenId);
        Position memory p = POSITION_NFT.positionInfo(tokenId);
        EpochSnapshot memory settled = ENGINE.epochStateView();
        uint64 live = ENGINE.currentEpoch();

        data.dataVersion = DATA_VERSION;
        data.exists = true;
        data.tokenId = tokenId;
        data.positionId = positionId;
        data.owner = POSITION_NFT.ownerOf(tokenId);
        data.account = POSITION_NFT.accountOf(tokenId);
        data.enginePositionOwner = p.owner;
        data.liveEpoch = live;
        data.settledEpoch = settled.epoch;
        data.createdEpoch = p.createdEpoch;
        data.activationEpoch = p.activationEpoch;
        data.unlockEpoch = p.unlockEpoch;
        data.amount = p.amount;
        data.weight = p.weight;
        data.pending = settled.epoch < p.activationEpoch;
        data.active = settled.epoch >= p.activationEpoch && settled.epoch < p.unlockEpoch;
        data.matured = p.unlockEpoch != 0 && settled.epoch >= p.unlockEpoch;

        // Engagement: share of live active weight, age, and time-to-unlock.
        uint256 totalWeight = ENGINE.activeTotalWeight();
        if (totalWeight != 0) {
            data.weightShareWad = (uint256(p.weight) * 1e18) / totalWeight;
        }
        if (live >= p.createdEpoch) data.ageEpochs = live - p.createdEpoch;
        if (p.unlockEpoch > live) {
            data.epochsToUnlock = p.unlockEpoch - live;
            data.secondsToUnlock = uint256(data.epochsToUnlock) * ENGINE.EPOCH_LENGTH();
        }

        // Realized performance (historical facts). NARA-vs-NARA stays unit-consistent.
        data.lifetimeNaraEarned = POSITION_NFT.lifetimeNaraClaimed(tokenId);
        data.lifetimeEthEarned = POSITION_NFT.lifetimeEthClaimed(tokenId);
        if (p.amount != 0) {
            data.realizedNaraReturnBps = (data.lifetimeNaraEarned * 10_000) / uint256(p.amount);
        }

        try ENGINE.claimableRewards(positionId) returns (uint256 naraAmount, uint256 ethAmount) {
            data.claimableNara = naraAmount;
            data.claimableEth = ethAmount;
        } catch {}

        (
            data.isGenesis,
            data.isEternal,
            data.genesisRoundId,
            data.genesisTierId,
            data.genesisRewardMultiplierBps,
            data.genesisMintedAt,
            data.genesisRewardWeight
        ) = POSITION_NFT.genesisMetadataOf(tokenId);

        if (data.isGenesis) {
            try POSITION_NFT.claimableGenesisEth(tokenId) returns (uint256 amount) {
                data.claimableGenesisEth = amount;
            } catch {}
            try POSITION_NFT.claimableGenesisToken(tokenId) returns (uint256 amount) {
                data.claimableGenesisToken = amount;
            } catch {}
            try POSITION_NFT.genesisRewardShareWad(tokenId) returns (uint256 share) {
                data.genesisRewardShareWad = share;
            } catch {}
        }
    }

    function getPositionDataBatch(uint256[] calldata tokenIds)
        external
        view
        returns (PositionData[] memory data)
    {
        uint256 length = tokenIds.length;
        if (length > MAX_BATCH) revert NARAPositionDataLensV1__TooManyTokenIds();
        data = new PositionData[](length);
        for (uint256 i; i < length; ) {
            try this.getPositionData(tokenIds[i]) returns (PositionData memory item) {
                data[i] = item;
            } catch {
                data[i].dataVersion = DATA_VERSION;
                data[i].tokenId = tokenIds[i];
            }
            unchecked {
                ++i;
            }
        }
    }

    function claimableTokenReward(uint256 tokenId, address token) external view returns (uint256 amount) {
        return ENGINE.claimableTokenRewards(POSITION_NFT.positionIdOf(tokenId), token);
    }

    function getClosedPositionTokenData(uint256 positionId, address token)
        external
        view
        returns (ClosedPositionTokenData memory data)
    {
        data.positionId = positionId;
        data.rewardOwner = POSITION_NFT.closedRewardOwnerOfPosition(positionId);
        data.account = POSITION_NFT.closedAccountOfPosition(positionId);
        data.token = token;
        if (data.rewardOwner != address(0)) {
            data.claimableAmount = ENGINE.claimableTokenRewards(positionId, token);
        }
    }

    function getClosedGenesisData(uint256 tokenId) external view returns (ClosedGenesisData memory data) {
        data.tokenId = tokenId;
        address distributor = POSITION_NFT.genesisRewardDistributor();
        if (distributor == address(0)) return data;
        INARAClosedGenesisDataV1 rewards = INARAClosedGenesisDataV1(distributor);
        data.rewardOwner = rewards.closedOwnerOf(tokenId);
        if (data.rewardOwner != address(0)) {
            data.claimableEth = rewards.claimableEth(tokenId);
            data.claimableToken = rewards.claimableToken(tokenId);
        }
    }
}
