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
error NARAFleetDeckLensV1__DuplicateTokenId(uint256 tokenId);

/// @title NARAFleetDeckLensV1
/// @notice Pure read-only periphery view contract aggregating wallet tactical fleet decks (max 6 active positions).
/// @dev 100% Stateless, admin-free, reentrancy-immune with strict duplicate token ID prevention and fail-closed try/catch safety.
contract NARAFleetDeckLensV1 {
    using Strings for uint256;

    uint256 public constant LENS_VERSION = 3;
    uint256 public constant MAX_DECK_SLOTS = 6;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 public constant MAX_EFFECTIVE_MULTIPLIER_WAD = 10 * 1e18; // 10.00X WAD Hard Cap
    uint16 public constant GENESIS_AURA_BONUS_BPS = 500;              // +5.00% Genesis Aura Bonus

    INARAEngineDeckLens public immutable ENGINE;
    INARAPositionNFTDeckLens public immutable POSITION_NFT;

    struct DeckPositionSummary {
        uint256 tokenId;
        uint256 positionId;
        uint128 amount;
        uint128 weight;
        uint256 multiplierWad;      // Individual base multiplier: 1.00e18 - 4.00e18
        uint16 multiplierBps;       // 10,000 - 40,000
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
        uint8 synergyTier;                  // 0 to 5
        string synergyTierName;             // e.g. "Hexa Armada Sovereign"
        uint16 formationBonusBps;           // 0 to 2500 BPS (0.00% to +25.00%)
        uint16 genesisAuraBonusBps;         // 0 or 500 BPS (+5.00%)
        uint16 synergyBonusBps;             // Alias for totalSynergyBonusBps
        uint16 totalSynergyBonusBps;        // formationBonusBps + genesisAuraBonusBps (up to 3000 BPS = +30.00%)
        uint256 synergyMultiplierWad;       // 1.00e18 to 1.30e18
        string formattedSynergyMultiplier;  // e.g. "1.30X"
        bool hasGenesisAura;                // True if >= 1 Genesis active position present
        uint256 activeSlotsCount;           // 0 to 6
    }

    struct FleetDeckSummary {
        address user;
        uint256 totalLockedNara;
        uint256 totalWeight;
        uint256 weightedAverageMultiplierWad;   // Base weighted average multiplier across deck positions
        uint16 weightedAverageMultiplierBps;
        string formattedWeightedMultiplier;
        uint256 deckSynergyMultiplierWad;       // Aggregated deck synergy multiplier
        uint16 deckSynergyMultiplierBps;
        string formattedDeckSynergyMultiplier;
        uint256 totalEffectiveMultiplierWad;    // Capped at 10.00X WAD (10 * 1e18)
        uint32 totalEffectiveMultiplierBps;     // up to 100,000 BPS
        string formattedTotalEffectiveMultiplier;// e.g. "5.20X" or "10.00X"
        uint256 effectiveTotalWeight;           // totalLockedNara * totalEffectiveMultiplierWad / WAD
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
        if (user == address(0)) revert NARAFleetDeckLensV1__ZeroAddress();
        uint256 len = tokenIds.length;
        if (len > MAX_DECK_SLOTS) {
            revert NARAFleetDeckLensV1__DeckCapacityExceeded(len, MAX_DECK_SLOTS);
        }

        deck.user = user;
        uint64 currentEpoch = ENGINE.currentEpoch();
        deck.positions = new DeckPositionSummary[](len);

        uint256 activeCount = 0;
        bool genesisFound = false;

        for (uint256 i = 0; i < len; i++) {
            uint256 tid = tokenIds[i];

            // 1. Strict Anti-Sybil Duplicate Token ID Prevention
            for (uint256 j = 0; j < i; j++) {
                if (tokenIds[j] == tid) {
                    revert NARAFleetDeckLensV1__DuplicateTokenId(tid);
                }
            }

            DeckPositionSummary memory posSummary;
            posSummary.tokenId = tid;

            // 2. Validate token ownership safely (fail-closed)
            address tokenOwner = address(0);
            try POSITION_NFT.ownerOf(tid) returns (address o) {
                tokenOwner = o;
            } catch {}

            if (tokenOwner == user && tokenOwner != address(0)) {
                // 3. Protected Position Info Resolution
                try POSITION_NFT.positionIdOf(tid) returns (uint256 pid) {
                    posSummary.positionId = pid;
                } catch {}

                try POSITION_NFT.positionInfo(tid) returns (Position memory p) {
                    posSummary.amount = p.amount;
                    posSummary.weight = p.weight;
                    posSummary.createdEpoch = p.createdEpoch;
                    posSummary.activationEpoch = p.activationEpoch;
                    posSummary.unlockEpoch = p.unlockEpoch;

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
                    } catch {}

                    // Active lifecycle check (Genesis aura only active if position is active)
                    if (currentEpoch >= p.activationEpoch && (posSummary.isEternal || currentEpoch < p.unlockEpoch)) {
                        posSummary.isActive = true;
                        activeCount++;
                        deck.totalLockedNara += p.amount;
                        deck.totalWeight += p.weight;
                        if (posSummary.isGenesis) {
                            genesisFound = true;
                        }
                    }

                    // Claimable rewards aggregation
                    if (posSummary.positionId != 0) {
                        try ENGINE.claimableRewards(posSummary.positionId) returns (uint256 nara, uint256 eth) {
                            posSummary.claimableNara = nara;
                            posSummary.claimableEth = eth;
                            deck.aggregateClaimableNara += nara;
                            deck.aggregateClaimableEth += eth;
                        } catch {}
                    }

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
                } catch {}
            }

            deck.positions[i] = posSummary;
        }

        // 4. Weighted Average Multiplier Calculation
        if (deck.totalLockedNara > 0) {
            deck.weightedAverageMultiplierWad = Math.mulDiv(deck.totalWeight, WAD, deck.totalLockedNara);
            deck.weightedAverageMultiplierBps = uint16(Math.mulDiv(deck.totalWeight, BPS, deck.totalLockedNara));
        } else {
            deck.weightedAverageMultiplierWad = WAD;
            deck.weightedAverageMultiplierBps = uint16(BPS);
        }
        deck.formattedWeightedMultiplier = _formatMultiplier(deck.weightedAverageMultiplierWad);

        // 5. Pro-Community Deck Synergy Evaluation
        deck.synergy = _evaluateSynergy(activeCount, genesisFound);
        deck.deckSynergyMultiplierWad = deck.synergy.synergyMultiplierWad;
        deck.deckSynergyMultiplierBps = uint16(Math.mulDiv(deck.deckSynergyMultiplierWad, BPS, WAD));
        deck.formattedDeckSynergyMultiplier = deck.synergy.formattedSynergyMultiplier;

        // 6. Total Effective Multiplier (Capped at 10.00X WAD)
        uint256 rawEffectiveMultiplierWad = Math.mulDiv(deck.weightedAverageMultiplierWad, deck.deckSynergyMultiplierWad, WAD);
        if (rawEffectiveMultiplierWad > MAX_EFFECTIVE_MULTIPLIER_WAD) {
            deck.totalEffectiveMultiplierWad = MAX_EFFECTIVE_MULTIPLIER_WAD;
        } else {
            deck.totalEffectiveMultiplierWad = rawEffectiveMultiplierWad;
        }
        deck.totalEffectiveMultiplierBps = uint32(Math.mulDiv(deck.totalEffectiveMultiplierWad, BPS, WAD));
        deck.formattedTotalEffectiveMultiplier = _formatMultiplier(deck.totalEffectiveMultiplierWad);

        // 7. Effective Total Deck Weight
        deck.effectiveTotalWeight = Math.mulDiv(deck.totalLockedNara, deck.totalEffectiveMultiplierWad, WAD);
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
            syn.formationBonusBps = 2500; // +25.00%
        } else if (activeSlots == 5) {
            syn.synergyTier = 4;
            syn.synergyTierName = "Penta Formation";
            syn.formationBonusBps = 2000; // +20.00%
        } else if (activeSlots == 4) {
            syn.synergyTier = 3;
            syn.synergyTierName = "Quad Squadron";
            syn.formationBonusBps = 1500; // +15.00%
        } else if (activeSlots == 3) {
            syn.synergyTier = 2;
            syn.synergyTierName = "Tri-Vanguard";
            syn.formationBonusBps = 1000; // +10.00%
        } else if (activeSlots == 2) {
            syn.synergyTier = 1;
            syn.synergyTierName = "Dual Strike";
            syn.formationBonusBps = 500;  // +5.00%
        } else {
            syn.synergyTier = 0;
            syn.synergyTierName = "Solo Scout";
            syn.formationBonusBps = 0;
        }

        // Genesis Aura Amplification
        if (hasGenesis && activeSlots > 0) {
            syn.genesisAuraBonusBps = GENESIS_AURA_BONUS_BPS; // +5.00%
        } else {
            syn.genesisAuraBonusBps = 0;
        }

        syn.totalSynergyBonusBps = syn.formationBonusBps + syn.genesisAuraBonusBps;
        syn.synergyBonusBps = syn.totalSynergyBonusBps;
        syn.synergyMultiplierWad = WAD + Math.mulDiv(uint256(syn.totalSynergyBonusBps), WAD, BPS);
        syn.formattedSynergyMultiplier = _formatMultiplier(syn.synergyMultiplierWad);
    }

    function _formatMultiplier(uint256 mWad) internal pure returns (string memory) {
        uint256 whole = mWad / WAD;
        uint256 frac = (mWad % WAD) / 1e16;
        string memory fracStr = frac < 10 ? string.concat("0", frac.toString()) : frac.toString();
        return string.concat(whole.toString(), ".", fracStr, "X");
    }
}
