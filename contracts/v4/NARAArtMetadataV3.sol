// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtMetadataV3
/// @notice Top 1% luxury metadata vocabulary with collector chassis finishes, sigil architectures, and Lock-Duration Luck Boosts.
contract NARAArtMetadataV3 {
    using Strings for uint256;

    uint256 public constant METADATA_VERSION = 3;
    uint64 public constant MAX_LOCK_EPOCHS = 35040; // 1 Year (35,040 * 15m)

    function tierIndex(uint256 lifetimeEthWei) external pure returns (uint8) {
        if (lifetimeEthWei >= 10 ether) return 4;
        if (lifetimeEthWei >= 1 ether) return 3;
        if (lifetimeEthWei >= 0.1 ether) return 2;
        if (lifetimeEthWei > 0) return 1;
        return 0;
    }

    function tierName(uint8 tier) public pure returns (string memory) {
        tier = _clampTier(tier);
        if (tier == 4) return "Apex Radiant";
        if (tier == 3) return "Calibrated (1+ ETH)";
        if (tier == 2) return "Rewarded (0.1+ ETH)";
        if (tier == 1) return "Activated";
        return "New Position";
    }

    function computeLuckBonus(uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (uint256) {
        if (isEternal) return 350;
        if (unlockEpoch <= createdEpoch) return 0;
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration > MAX_LOCK_EPOCHS) duration = MAX_LOCK_EPOCHS;
        return (uint256(duration) * 350) / MAX_LOCK_EPOCHS;
    }

    function lockBoostLabel(uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (string memory) {
        if (isEternal) return "God-Tier Eternal (Max +350 Luck)";
        if (unlockEpoch <= createdEpoch) return "1.0x Base Luck";
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration >= 35040) return "4.0x Max 1-Yr Lock (+350 Luck)";
        if (duration >= 17520) return "3.0x 6-Mo Lock (+175 Luck)";
        if (duration >= 2880) return "1.5x 1-Mo Lock (+28 Luck)";
        if (duration >= 672) return "1.2x 1-Wk Lock (+6 Luck)";
        return "1.0x Base Luck";
    }

    function chassisName(uint256 seed, uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (string memory) {
        uint256 rawRoll = seed % 1000;
        uint256 luckBonus = computeLuckBonus(createdEpoch, unlockEpoch, isEternal);
        uint256 roll = rawRoll > luckBonus ? (rawRoll - luckBonus) : 0;

        if (roll < 50) return "Prismatic Holo Foil (5.0% Base / 40.0% Max Boost)";
        if (roll < 150) return "24K Gilded Gold (10.0% Base / 45.0% Max Boost)";
        if (roll < 350) return "Obsidian Stealth (20.0% Rare)";
        if (roll < 600) return "Cybernetic Emerald (25.0% Uncommon)";
        return "Titanium Slate (40.0% Common)";
    }

    function sigilArchitecture(uint256 seed) public pure returns (string memory) {
        uint256 v = (seed / 1000) % 5;
        if (v == 0) return "Solar Flare Matrix (Rare)";
        if (v == 1) return "Dual Orbital Gyroscope (Uncommon)";
        if (v == 2) return "Tachyon Starburst (Rare)";
        if (v == 3) return "Singularity Accretion (Ultra-Rare)";
        return "Concentric Telemetry Radar (Standard)";
    }

    function name(uint8 tier, bool isGenesis, bool isEternal, uint256 tokenId)
        external
        pure
        returns (string memory)
    {
        tier;
        if (isEternal) return string.concat("NARA Eternal Position #", _pad6(tokenId));
        if (isGenesis) return string.concat("NARA Genesis Position #", _pad6(tokenId));
        return string.concat("NARA Position #", _pad6(tokenId));
    }

    function attributes(
        uint256 seed,
        uint8 tier,
        uint8 moduleIdx,
        bool isGenesis,
        bool isEternal,
        uint256 positionId,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        uint16 roundId,
        uint16 tierId,
        uint32 mult,
        uint64 mintedAt,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory) {
        moduleIdx;
        return string.concat(
            '[{"trait_type":"Instrument Type","value":"Proof-of-Position Bearer Bond"',
            '},{"trait_type":"Chassis Finish","value":"', chassisName(seed, createdEpoch, unlockEpoch, isEternal),
            '"},{"trait_type":"Lock Duration Boost","value":"', lockBoostLabel(createdEpoch, unlockEpoch, isEternal),
            '"},{"trait_type":"Core Sigil Array","value":"', sigilArchitecture(seed),
            '"},{"display_type":"number","trait_type":"Position ID","value":', positionId.toString(),
            '},{"trait_type":"Network","value":"Base Mainnet (8453)"',
            '},{"trait_type":"Account Architecture","value":"ERC-6551 Token-Bound"',
            '},{"trait_type":"Yield Status","value":"', tierName(tier),
            '"},{"display_type":"number","trait_type":"Created Epoch","value":', uint256(createdEpoch).toString(),
            '},{"display_type":"number","trait_type":"Unlock Epoch","value":', uint256(unlockEpoch).toString(),
            '},{"display_type":"number","trait_type":"Lifetime Claims","value":', uint256(claimCount).toString(),
            '},{"display_type":"number","trait_type":"Lock Extensions","value":', uint256(extendCount).toString(),
            '},{"trait_type":"Storage","value":"100% Fully On-Chain"',
            '},{"trait_type":"Royalty Standard","value":"10.00% Immutable (ERC-2981)"',
            "}",
            _genesisAttributes(isGenesis, isEternal, roundId, tierId, mult, mintedAt),
            "]"
        );
    }

    function collectionJSON(string calldata image) external pure returns (string memory) {
        return string.concat(
            '{"name":"NARA Positions","symbol":"NARAPOS",',
            '"description":"Top-tier sovereign on-chain financial instruments securing locked NARA principal and streaming protocol dividends on Base. Features generative luxury materials, holographic foils, Lock-Duration Luck Boosts, and ERC-6551 Token-Bound Accounts.",',
            '"image":"', image, '","banner_image":"', image, '","featured_image":"', image,
            '","external_link":"https://www.naraprotocol.io/"}'
        );
    }

    function _genesisAttributes(
        bool isGenesis,
        bool isEternal,
        uint16 roundId,
        uint16 tierId,
        uint32 rewardMultiplierBps,
        uint64 mintedAt
    ) internal pure returns (string memory) {
        if (!isGenesis) return "";
        return string.concat(
            ',{"display_type":"number","trait_type":"Genesis Round","value":', uint256(roundId).toString(),
            '},{"display_type":"number","trait_type":"Genesis Tier","value":', uint256(tierId).toString(),
            '},{"display_type":"number","trait_type":"Genesis Reward Multiplier Bps","value":', uint256(rewardMultiplierBps).toString(),
            '},{"display_type":"date","trait_type":"Genesis Minted At","value":', uint256(mintedAt).toString(),
            '},{"trait_type":"Eternal Lock","value":"', isEternal ? "True" : "False", '"}'
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

    function _clampTier(uint8 tier) internal pure returns (uint8) {
        return tier > 4 ? 4 : tier;
    }
}
