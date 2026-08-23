// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {EpochSnapshot, Position} from "./NARAEngineTypes.sol";

interface INARAEngineDeckLens {
    function currentEpoch() external view returns (uint64);
    function epochState() external view returns (EpochSnapshot memory);
    function positionOf(uint256 positionId) external view returns (Position memory);
    function claimableRewards(uint256 positionId) external view returns (uint256 naraAmount, uint256 ethAmount);
    function claimableTokenRewards(uint256 positionId, address token) external view returns (uint256 amount);
}

interface INARAPositionNFTDeckLens {
    function engine() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
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
    function claimableGenesisEth(uint256 tokenId) external view returns (uint256);
    function claimableGenesisToken(uint256 tokenId) external view returns (uint256);
}

error NARAFleetDeckLensV1__ZeroAddress();
error NARAFleetDeckLensV1__NotAContract();
error NARAFleetDeckLensV1__PairingMismatch();
error NARAFleetDeckLensV1__DeckCapacityExceeded(uint256 provided, uint256 maxAllowed);

/// @title NARAFleetDeckLensV1
/// @notice Pure read-only periphery view contract aggregating wallet tactical fleet decks (max 6 active positions).
/// @dev 100% Stateless, admin-free, reentrancy-immune. Leaves NARAEngine and NARAPositionNFTV4 untouched.
contract NARAFleetDeckLensV1 {
    using Strings for uint256;

    uint256 public constant LENS_VERSION = 1;
    uint256 public constant MAX_DECK_SLOTS = 6;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    INARAEngineDeckLens public immutable ENGINE;
    INARAPositionNFTDeckLens public immutable POSITION_NFT;

    struct DeckPositionSummary {
        uint256 tokenId;
        uint256 positionId;
        uint128 amount;
        uint128 weight;
        uint256 multiplierWad;      // 1.00e18 - 3.00e18
        uint16 multiplierBps;       // 10,000 - 30,000
        string formattedMultiplier; // e.g. "2.45X"
        uint64 createdEpoch;
        uint64 activationEpoch;
        uint64 unlockEpoch;
        uint256 claimableNara;
        uint256 claimableEth;
        uint256 claimableGenesisEth;
        uint256 claimableGenesisToken;
        bool isGenesis;
        bool isEternal;
        bool isActive;
    }

    struct DeckSynergyReport {
        uint8 synergyTier;              // 0 to 5
        string synergyTierName;         // e.g. "Hexa Armada Sovereign"
        uint16 synergyBonusBps;         // e.g. 2500 (25.00%)
        bool hasGenesisAura;            // True if >= 1 Genesis position present
        uint256 activeSlotsCount;       // 0 to 6
    }

    struct FleetDeckSummary {
        address user;
        uint256 totalLockedNara;
        uint256 totalWeight;
        uint256 weightedAverageMultiplierWad;
        uint16 weightedAverageMultiplierBps;
        string formattedWeightedMultiplier;
        DeckSynergyReport synergy;
        uint256 aggregateClaimableNara;
        uint256 aggregateClaimableEth;
        uint256 aggregateClaimableGenesisEth;
        uint256 aggregateClaimableGenesisToken;
        DeckPositionSummary[] positions;
    }

    constructor(address engine_, address positionNft_) {
        if (engine_ == address(0) || positionNft_ == address(0)) revert NARAFleetDeckLensV1__ZeroAddress();
        if (engine_.code.length == 0 || positionNft_.code.length == 0) revert NARAFleetDeckLensV1__NotAContract();
        if (INARAPositionNFTDeckLens(positionNft_).engine() != engine_) revert NARAFleetDeckLensV1__PairingMismatch();

        ENGINE = INARAEngineDeckLens(engine_);
        POSITION_NFT = INARAPositionNFTDeckLens(positionNft_);
    }

    function getFleetDeckSummary(address user, uint256[] calldata tokenIds)
        external
        view
        returns (FleetDeckSummary memory deck)
    {
        if (tokenIds.length > MAX_DECK_SLOTS) {
            revert NARAFleetDeckLensV1__DeckCapacityExceeded(tokenIds.length, MAX_DECK_SLOTS);
        }

        deck.user = user;
        uint64 currentEpoch = ENGINE.currentEpoch();
        deck.positions = new DeckPositionSummary[](tokenIds.length);

        uint256 activeCount = 0;
        bool genesisFound = false;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tid = tokenIds[i];
            DeckPositionSummary memory posSummary;
            posSummary.tokenId = tid;

            // Validate token ownership
            address tokenOwner = address(0);
            try POSITION_NFT.ownerOf(tid) returns (address o) {
                tokenOwner = o;
            } catch {}

            if (tokenOwner == user && tokenOwner != address(0)) {
                posSummary.positionId = POSITION_NFT.positionIdOf(tid);
                Position memory p = POSITION_NFT.positionInfo(tid);

                posSummary.amount = p.amount;
                posSummary.weight = p.weight;
                posSummary.createdEpoch = p.createdEpoch;
                posSummary.activationEpoch = p.activationEpoch;
                posSummary.unlockEpoch = p.unlockEpoch;

                // Multiplier calculation
                if (p.amount > 0) {
                    posSummary.multiplierWad = Math.mulDiv(uint256(p.weight), WAD, uint256(p.amount));
                    posSummary.multiplierBps = uint16(Math.mulDiv(uint256(p.weight), BPS, uint256(p.amount)));
                } else {
                    posSummary.multiplierWad = WAD;
                    posSummary.multiplierBps = uint16(BPS);
                }
                posSummary.formattedMultiplier = _formatMultiplier(posSummary.multiplierWad);

                // Genesis metadata
                try POSITION_NFT.genesisMetadataOf(tid) returns (
                    bool isGen, bool isEt, uint16, uint16, uint32, uint64, uint256
                ) {
                    posSummary.isGenesis = isGen;
                    posSummary.isEternal = isEt;
                    if (isGen) genesisFound = true;
                } catch {}

                // Active lifecycle check
                if (currentEpoch >= p.activationEpoch && (posSummary.isEternal || currentEpoch < p.unlockEpoch)) {
                    posSummary.isActive = true;
                    activeCount++;
                    deck.totalLockedNara += p.amount;
                    deck.totalWeight += p.weight;
                }

                // Claimable rewards aggregation
                try ENGINE.claimableRewards(posSummary.positionId) returns (uint256 nara, uint256 eth) {
                    posSummary.claimableNara = nara;
                    posSummary.claimableEth = eth;
                    deck.aggregateClaimableNara += nara;
                    deck.aggregateClaimableEth += eth;
                } catch {}

                if (posSummary.isGenesis) {
                    try POSITION_NFT.claimableGenesisEth(tid) returns (uint256 gEth) {
                        posSummary.claimableGenesisEth = gEth;
                        deck.aggregateClaimableGenesisEth += gEth;
                    } catch {}
                    try POSITION_NFT.claimableGenesisToken(tid) returns (uint256 gToken) {
                        posSummary.claimableGenesisToken = gToken;
                        deck.aggregateClaimableGenesisToken += gToken;
                    } catch {}
                }
            }

            deck.positions[i] = posSummary;
        }

        // Weighted Average Deck Multiplier
        if (deck.totalLockedNara > 0) {
            deck.weightedAverageMultiplierWad = Math.mulDiv(deck.totalWeight, WAD, deck.totalLockedNara);
            deck.weightedAverageMultiplierBps = uint16(Math.mulDiv(deck.totalWeight, BPS, deck.totalLockedNara));
        } else {
            deck.weightedAverageMultiplierWad = WAD;
            deck.weightedAverageMultiplierBps = uint16(BPS);
        }
        deck.formattedWeightedMultiplier = _formatMultiplier(deck.weightedAverageMultiplierWad);

        // Deck Synergy Evaluation
        deck.synergy = _evaluateSynergy(activeCount, genesisFound);
    }

    function _evaluateSynergy(uint256 activeSlots, bool hasGenesis)
        internal
        pure
        returns (DeckSynergyReport memory syn)
    {
        syn.activeSlotsCount = activeSlots;
        syn.hasGenesisAura = hasGenesis;

        if (activeSlots == 6) {
            syn.synergyTier = 5;
            syn.synergyTierName = "Hexa Armada Sovereign";
            syn.synergyBonusBps = 2500; // +25.00%
        } else if (activeSlots == 5) {
            syn.synergyTier = 4;
            syn.synergyTierName = "Penta Formation";
            syn.synergyBonusBps = 2000; // +20.00%
        } else if (activeSlots == 4) {
            syn.synergyTier = 3;
            syn.synergyTierName = "Quad Squadron";
            syn.synergyBonusBps = 1500; // +15.00%
        } else if (activeSlots == 3) {
            syn.synergyTier = 2;
            syn.synergyTierName = "Tri-Vanguard";
            syn.synergyBonusBps = 1000; // +10.00%
        } else if (activeSlots == 2) {
            syn.synergyTier = 1;
            syn.synergyTierName = "Dual Strike";
            syn.synergyBonusBps = 500;  // +5.00%
        } else {
            syn.synergyTier = 0;
            syn.synergyTierName = "Solo Scout";
            syn.synergyBonusBps = 0;
        }
    }

    function _formatMultiplier(uint256 mWad) internal pure returns (string memory) {
        uint256 whole = mWad / WAD;
        uint256 frac = (mWad % WAD) / 1e16;
        string memory fracStr = frac < 10 ? string.concat("0", frac.toString()) : frac.toString();
        return string.concat(whole.toString(), ".", fracStr, "X");
    }
}
