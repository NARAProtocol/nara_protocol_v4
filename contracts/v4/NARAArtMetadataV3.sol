// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {NARAArtCorePlateV3} from "./NARAArtCorePlateV3.sol";

/// @title NARAArtMetadataV3
/// @notice Generates rich OpenSea metadata with 10-Rank Multi-Vector Evolution traits.
contract NARAArtMetadataV3 {
    using Strings for uint256;

    uint256 public constant METADATA_VERSION = 5;
    NARAArtCorePlateV3 public immutable corePlate;

    constructor(address corePlate_) {
        corePlate = NARAArtCorePlateV3(corePlate_);
    }

    function tierIndex(uint256 lifetimeEthWei) external pure returns (uint8) {
        if (lifetimeEthWei >= 10 ether) return 4;
        if (lifetimeEthWei >= 1 ether) return 3;
        if (lifetimeEthWei >= 0.1 ether) return 2;
        if (lifetimeEthWei > 0) return 1;
        return 0;
    }

    function name(uint8 tier, bool isGenesis, bool isEternal, uint256 tokenId) external pure returns (string memory) {
        tier;
        isGenesis;
        if (isEternal) {
            return string.concat("NARA Eternal Position #", _pad6(tokenId));
        }
        return string.concat("NARA Position #", _pad6(tokenId));
    }

    function collectionJSON(string calldata image) external pure returns (string memory) {
        return string.concat(
            '{"name":"NARA Position NFTs",',
            '"description":"Top-tier sovereign on-chain financial hardware terminals securing locked NARA principal on Base.",',
            '"image":"', image, '",',
            '"external_link":"https://naraprotocol.io"} '
        );
    }

    function attributes(
        uint256 lifetimeEthWei,
        uint256 seed,
        uint8 moduleIdx,
        uint256 tokenId,
        uint256 positionId,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        bool isEternal,
        uint32 claimCount,
        uint32 extendCount
    ) public view returns (string memory) {
        moduleIdx;
        tokenId;

        uint8 rank = corePlate.rankOf(lifetimeEthWei);
        string memory rName = corePlate.rankName(rank);

        string memory themeName = "Titanium Slate";
        string memory themeRarity = "Common (45%)";
        string memory boostLabel = "Standard Tier";

        if (isEternal) {
            themeName = "24K Gilded Gold";
            themeRarity = "Legendary Anchor";
            boostLabel = "God-Tier Eternal (Max Multiplier)";
        } else {
            NARAArtCorePlateV3.ChassisTheme memory t = corePlate.getTheme(
                seed,
                amount,
                createdEpoch,
                unlockEpoch,
                isEternal
            );
            themeName = t.name;

            if (t.isHolo) {
                themeRarity = "Holy Grail (3.5% Gated)";
            } else if (keccak256(bytes(t.name)) == keccak256(bytes("24K Gilded Gold"))) {
                themeRarity = "Ultra-Rare (8.5% Gated)";
            } else if (keccak256(bytes(t.name)) == keccak256(bytes("Obsidian Stealth"))) {
                themeRarity = "Rare (25%)";
            } else if (keccak256(bytes(t.name)) == keccak256(bytes("Cybernetic Emerald"))) {
                themeRarity = "Uncommon (35%)";
            } else {
                themeRarity = "Common (45%)";
            }

            uint64 duration = unlockEpoch > createdEpoch ? (unlockEpoch - createdEpoch) : 0;
            bool eligible = corePlate.isGrailEligible(amount, createdEpoch, unlockEpoch, isEternal);

            if (eligible) {
                if (duration >= 35040) {
                    boostLabel = "4.0x Max 1-Yr Lock (+30 Luck | Grail Unlocked)";
                } else {
                    boostLabel = "3.0x 6-Mo Lock (+10 Luck | Grail Unlocked)";
                }
            } else {
                if (amount < 10 ether && duration >= 17520) {
                    boostLabel = "Standard Tier (Principal < 10 NARA: Grail Locked)";
                } else if (duration < 17520) {
                    boostLabel = "Standard Tier (Duration < 6 Mo: Grail Locked)";
                } else {
                    boostLabel = "Standard Tier (Grail Locked)";
                }
            }
        }

        uint256 sigilVariant = (seed / 1000) % 5;
        string memory sigilName;
        if (sigilVariant == 0) sigilName = "Solar Flare Matrix (Rare)";
        else if (sigilVariant == 1) sigilName = "Dual Orbital Gyroscope (Uncommon)";
        else if (sigilVariant == 2) sigilName = "Tachyon Starburst Array (Rare)";
        else if (sigilVariant == 3) sigilName = "Singularity Accretion (Ultra-Rare)";
        else sigilName = "Concentric Telemetry Radar (Standard)";

        return string.concat(
            '[',
            '{"trait_type":"Chassis Finish","value":"', themeName, '"},',
            '{"trait_type":"Finish Rarity","value":"', themeRarity, '"},',
            '{"trait_type":"Evolution Rank","value":"Rank ', uint256(rank).toString(), ' // ', rName, '"},',
            '{"trait_type":"Capacitor Charge","value":"', uint256(rank).toString(), '/10 Cells"},',
            '{"trait_type":"Lock Duration Boost","value":"', boostLabel, '"},',
            '{"trait_type":"Core Sigil Array","value":"', sigilName, '"},',
            '{"trait_type":"Claim Scars (Provenance)","value":"', uint256(claimCount).toString(), ' Claims"},',
            '{"trait_type":"Armor Reinforcements","value":"', uint256(extendCount).toString(), ' Extensions"},',
            '{"trait_type":"Position ID","value":', positionId.toString(), '},',
            '{"trait_type":"Created Epoch","value":', uint256(createdEpoch).toString(), '},',
            '{"trait_type":"Storage Engine","value":"Fully On-Chain SVG (No IPFS)"}',
            ']'
        );
    }

    function _pad6(uint256 v) internal pure returns (string memory) {
        bytes memory b = bytes(v.toString());
        if (b.length >= 6) return string(b);
        bytes memory out = new bytes(6);
        uint256 pad = 6 - b.length;
        for (uint256 i = 0; i < pad; i++) {
            out[i] = "0";
        }
        for (uint256 i = 0; i < b.length; i++) {
            out[pad + i] = b[i];
        }
        return string(out);
    }
}
