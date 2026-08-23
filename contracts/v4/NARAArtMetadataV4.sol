// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtMetadataV4
/// @notice Compliance-grade, institutional on-chain metadata engine for NARA Position NFTs.
/// @dev Emits 100% realized on-chain telemetry attributes with zero speculative framing.
contract NARAArtMetadataV4 {
    using Strings for uint256;

    uint256 public constant METADATA_VERSION = 8;
    uint64 public constant EPOCHS_PER_DAY = 96;
    uint64 public constant EPOCHS_PER_YEAR = 35040;

    function tierTitle(uint256 ageInEpochs, bool isEternal) public pure returns (string memory) {
        if (isEternal || ageInEpochs >= EPOCHS_PER_YEAR) return "Rank 10 (Apex Veteran)";
        if (ageInEpochs >= 32120) return "Rank 9 (Dimensional Corona)";
        if (ageInEpochs >= 29200) return "Rank 8 (Plasma Super-Ring)";
        if (ageInEpochs >= 23360) return "Rank 7 (Tachyon Starburst)";
        if (ageInEpochs >= 17520) return "Rank 6 (Gravitational Warp)";
        if (ageInEpochs >= 11520) return "Rank 5 (Orbital Gyroscope)";
        if (ageInEpochs >= 8640) return "Rank 4 (Stator Turbine)";
        if (ageInEpochs >= 5760) return "Rank 3 (Double Conduit)";
        if (ageInEpochs >= 2880) return "Rank 2 (Circuit Ignition)";
        if (ageInEpochs >= 672) return "Rank 1 (Sensor Active)";
        return "Rank 0 (Dormant Node)";
    }

    function alloyName(uint256 seed, bool isEternal) public pure returns (string memory) {
        if (isEternal) return "24K Gilded Gold (Sovereign Anchor)";
        uint256 roll = seed % 1000;
        if (roll < 15) return "Forged Damascus Meteorite (Apex Grail)";
        if (roll < 55) return "24K Gilded Gold (Legendary)";
        if (roll < 200) return "Obsidian Stealth (Rare)";
        if (roll < 550) return "Cybernetic Emerald (Uncommon)";
        return "Titanium Slate (Common)";
    }

    function ascensionTitle(uint256 ageInEpochs, uint32 extendCount, bool isEternal) public pure returns (string memory) {
        if (isEternal || ageInEpochs >= (EPOCHS_PER_YEAR * 3) || extendCount >= 4) {
            return "Ascension II (Immortal Quantum Sovereign)";
        }
        if (ageInEpochs >= (EPOCHS_PER_YEAR * 2) || extendCount >= 2) {
            return "Ascension I (Supernova Transcendent)";
        }
        return "Standard Era (Mortal)";
    }

    function fleetTitle(uint256 walletActiveSlots) public pure returns (string memory) {
        if (walletActiveSlots >= 64) return "Sovereign Grid Master (64/64 Slots)";
        if (walletActiveSlots >= 32) return "Galactic Cluster (32+ Slots)";
        if (walletActiveSlots >= 16) return "Armada Fleet (16+ Slots)";
        if (walletActiveSlots >= 8) return "Battalion Grid (8+ Slots)";
        if (walletActiveSlots >= 4) return "Squadron Node (4+ Slots)";
        return "Solo Vanguard (1 Slot)";
    }

    function attributes(
        uint64 currentEpoch,
        uint256 seed,
        uint256 tokenId,
        uint256 positionId,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        bool isEternal,
        uint32 claimCount,
        uint32 extendCount,
        uint256 walletActiveSlots,
        uint256 /* lifetimeEthWei */
    ) external pure returns (string memory) {
        uint256 ageInEpochs = currentEpoch > createdEpoch ? (currentEpoch - createdEpoch) : 0;
        uint256 lockDays = unlockEpoch > createdEpoch ? ((unlockEpoch - createdEpoch) / EPOCHS_PER_DAY) : 0;
        if (isEternal) lockDays = 9999;

        string memory boostStr = "1.0X Trial";
        if (isEternal || lockDays >= 365) {
            boostStr = "4.0X Max Boost";
        } else if (lockDays >= 180) {
            boostStr = "2.5X Boost";
        } else if (lockDays >= 90) {
            boostStr = "1.75X Boost";
        } else if (lockDays >= 30) {
            boostStr = "1.25X Boost";
        }

        uint256 naraWhole = uint256(amount) / 1e18;

        return string.concat(
            '[',
            '{"trait_type":"Chassis Alloy","value":"', alloyName(seed, isEternal), '"},',
            '{"trait_type":"Staking Era","value":"', ascensionTitle(ageInEpochs, extendCount, isEternal), '"},',
            '{"trait_type":"Conviction Multiplier","value":"', boostStr, '"},',
            '{"trait_type":"Progression Rank","value":"', tierTitle(ageInEpochs, isEternal), '"},',
            '{"trait_type":"Fleet Grid","value":"', fleetTitle(walletActiveSlots), '"},',
            '{"trait_type":"Time Commitment","value":"', lockDays.toString(), ' Days"},',
            '{"trait_type":"Age in Epochs","value":"', ageInEpochs.toString(), ' Epochs"},',
            '{"trait_type":"Locked Principal (NARA)","value":', naraWhole.toString(), '},',
            '{"trait_type":"Extension Loyalty Streak","value":', uint256(extendCount).toString(), '},',
            '{"trait_type":"Realized Reward Claims","value":', uint256(claimCount).toString(), '},',
            '{"trait_type":"Position ID","value":', positionId.toString(), '},',
            '{"trait_type":"Token ID","value":', tokenId.toString(), '}',
            ']'
        );
    }
}
