// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title NARAArtMetadataV4
/// @notice Compliance-grade, institutional on-chain metadata engine for NARA Position NFTs.
/// @dev Emits 100% realized on-chain telemetry attributes with 1.00X-10.00X multi-vector power metrics.
contract NARAArtMetadataV4 {
    using Strings for uint256;

    uint256 public constant METADATA_VERSION = 12;
    uint64 public constant EPOCHS_PER_DAY = 96;
    uint64 public constant EPOCHS_PER_YEAR = 35040;
    uint256 internal constant WAD = 1e18;
    uint256 public constant MAX_POWER_MULTIPLIER_WAD = 10 * 1e18;

    function tierTitle(uint256 ageInEpochs, uint256 mWad, bool isEternal) public pure returns (string memory) {
        if (isEternal || ageInEpochs >= EPOCHS_PER_YEAR) return "Rank 10 (Apex Veteran)";
        if (mWad == 4 * WAD) return "Rank 10 (1-Year Horizon)";
        if (ageInEpochs >= 23360 || mWad >= 2.75e18) return "Rank 7 (Tachyon Warp)";
        if (ageInEpochs >= 11520 || mWad >= 1.85e18) return "Rank 5 (Orbital Gyro)";
        if (ageInEpochs >= 2880 || mWad >= 1.25e18) return "Rank 3 (Circuit Ignition)";
        return "Rank 0 (Dormant Node)";
    }

    function calculateMultiplierWad(uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (uint256) {
        if (isEternal) return 4 * WAD;
        if (unlockEpoch <= createdEpoch) return WAD;
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration > EPOCHS_PER_YEAR) duration = EPOCHS_PER_YEAR;

        uint256 r = Math.mulDiv(uint256(duration), WAD, uint256(EPOCHS_PER_YEAR));
        uint256 r2 = Math.mulDiv(r, r, WAD);
        return WAD + Math.mulDiv(0.5e18, r, WAD) + Math.mulDiv(2.5e18, r2, WAD);
    }

    function calculateComprehensivePowerWad(
        uint256 baseMultiplierWad,
        uint256 ageInEpochs,
        uint32 extendCount,
        uint256 walletActiveSlots,
        bool isEternal
    ) public pure returns (uint256) {
        if (isEternal) return MAX_POWER_MULTIPLIER_WAD;

        uint256 powerWad = baseMultiplierWad;

        // Vector 2: Aging & Extension Loyalty Boost
        if (ageInEpochs >= (EPOCHS_PER_YEAR * 3) || extendCount >= 4) {
            powerWad += 3.0e18;
        } else if (ageInEpochs >= (EPOCHS_PER_YEAR * 2) || extendCount >= 2) {
            powerWad += 2.0e18;
        } else if (ageInEpochs >= 23360) {
            powerWad += 1.5e18;
        } else if (ageInEpochs >= 11520) {
            powerWad += 1.0e18;
        } else if (ageInEpochs >= 2880) {
            powerWad += 0.5e18;
        }

        // Vector 3: Fleet Grid Formation Synergy Boost
        if (walletActiveSlots >= 64) {
            powerWad += 3.0e18;
        } else if (walletActiveSlots >= 32) {
            powerWad += 2.0e18;
        } else if (walletActiveSlots >= 16) {
            powerWad += 1.5e18;
        } else if (walletActiveSlots >= 6) {
            powerWad += 1.0e18;
        } else if (walletActiveSlots >= 4) {
            powerWad += 0.6e18;
        } else if (walletActiveSlots >= 2) {
            powerWad += 0.2e18;
        }

        if (powerWad > MAX_POWER_MULTIPLIER_WAD) {
            return MAX_POWER_MULTIPLIER_WAD;
        }
        return powerWad;
    }

    function formatMultiplier(uint256 mWad) public pure returns (string memory) {
        uint256 whole = mWad / WAD;
        uint256 frac = (mWad % WAD) / 1e16;
        string memory fracStr = frac < 10 ? string.concat("0", frac.toString()) : frac.toString();
        return string.concat(whole.toString(), ".", fracStr, "X");
    }

    function computeLuckBonus(uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (uint256) {
        if (isEternal) return 350;
        if (unlockEpoch <= createdEpoch) return 0;
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration > EPOCHS_PER_YEAR) duration = EPOCHS_PER_YEAR;
        return (uint256(duration) * 350) / EPOCHS_PER_YEAR;
    }

    function alloyName(
        uint256 seed,
        bool isEternal,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch
    ) public pure returns (string memory) {
        uint256 rawRoll = seed % 1000;
        uint256 luck = computeLuckBonus(createdEpoch, unlockEpoch, isEternal);
        uint256 roll = rawRoll > luck ? rawRoll - luck : 0;
        uint256 naraWhole = uint256(amount) / 1e18;

        uint256 damascusThreshold = (naraWhole >= 100) ? 40 : 20;
        uint256 goldThreshold = (naraWhole >= 100) ? 130 : 65;

        if (isEternal || roll < damascusThreshold) return "Forged Damascus Meteorite (Apex Grail)";
        if (roll < goldThreshold) return "24K Gilded Gold (Legendary)";
        if (roll < 260) return "Obsidian Stealth (Rare)";
        if (roll < 580) return "Cybernetic Emerald (Uncommon)";
        return "Titanium Slate (Common)";
    }

    function ascensionTitle(uint256 ageInEpochs, uint32 extendCount, bool isEternal) public pure returns (string memory) {
        if (isEternal || ageInEpochs >= (EPOCHS_PER_YEAR * 3) || extendCount >= 4) return "Ascension II: Immortal Quantum Sovereign";
        if (ageInEpochs >= (EPOCHS_PER_YEAR * 2) || extendCount >= 2) return "Ascension I: Supernova Transcendent";
        return "Standard Staking Era";
    }

    function fleetTitle(uint256 walletActiveSlots) public pure returns (string memory) {
        if (walletActiveSlots >= 64) return "Fleet 64/64: Sovereign Master";
        if (walletActiveSlots >= 32) return "Fleet 32/64: Galactic Cluster";
        if (walletActiveSlots >= 16) return "Fleet 16/64: Armada Fleet";
        if (walletActiveSlots >= 6) return "Hexa Armada (+25% Synergy)";
        if (walletActiveSlots == 5) return "Penta Formation (+20% Synergy)";
        if (walletActiveSlots == 4) return "Quad Squadron (+15% Synergy)";
        if (walletActiveSlots == 3) return "Tri-Vanguard (+10% Synergy)";
        if (walletActiveSlots == 2) return "Dual Strike (+5% Synergy)";
        return "Solo Vanguard";
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

        uint256 baseWad = calculateMultiplierWad(createdEpoch, unlockEpoch, isEternal);
        uint256 totalPowerWad = calculateComprehensivePowerWad(baseWad, ageInEpochs, extendCount, walletActiveSlots, isEternal);
        
        string memory baseBoostStr = formatMultiplier(baseWad);
        string memory totalPowerStr = formatMultiplier(totalPowerWad);

        uint256 naraWhole = uint256(amount) / 1e18;

        return string.concat(
            '[',
            '{"trait_type":"Chassis Alloy","value":"', alloyName(seed, isEternal, amount, createdEpoch, unlockEpoch), '"},',
            '{"trait_type":"Effective Staking Power","value":"', totalPowerStr, '"},',
            '{"trait_type":"Base Lock Multiplier","value":"', baseBoostStr, '"},',
            '{"trait_type":"Staking Era","value":"', ascensionTitle(ageInEpochs, extendCount, isEternal), '"},',
            '{"trait_type":"Progression Rank","value":"', tierTitle(ageInEpochs, baseWad, isEternal), '"},',
            '{"trait_type":"Fleet Deck Formation","value":"', fleetTitle(walletActiveSlots), '"},',
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
