// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtMetadataV1
/// @notice Stateless metadata vocabulary for the modular NARA position renderer.
/// @dev Deliberately avoids yield/income/return framing in permanent marketplace traits.
contract NARAArtMetadataV1 {
    using Strings for uint256;

    uint256 public constant METADATA_VERSION = 1;

    function tierIndex(uint256 lifetimeEthWei) external pure returns (uint8) {
        if (lifetimeEthWei >= 10 ether) return 4;
        if (lifetimeEthWei >= 1 ether) return 3;
        if (lifetimeEthWei >= 0.1 ether) return 2;
        if (lifetimeEthWei > 0) return 1;
        return 0;
    }

    function tierName(uint8 tier) public pure returns (string memory) {
        tier = _clampTier(tier);
        if (tier == 4) return "Apex";
        if (tier == 3) return "One ETH Mark";
        if (tier == 2) return "Rewarded";
        if (tier == 1) return "Activated";
        return "New";
    }

    function coreClass(uint8 tier) public pure returns (string memory) {
        tier = _clampTier(tier);
        if (tier == 4) return "Radiant";
        if (tier == 3) return "Calibrated";
        if (tier == 2) return "Marked";
        if (tier == 1) return "Active";
        return "Dormant";
    }

    function moduleName(uint8 index) public pure returns (string memory) {
        if (index == 0) return "Archive Arc";
        if (index == 1) return "Pressure Scar";
        if (index == 2) return "Orbit Field";
        if (index == 3) return "Ledger Fragment";
        if (index == 4) return "Crown Trace";
        return "Signal Trace";
    }

    function name(uint8 tier, bool isGenesis, bool isEternal, uint256 tokenId)
        external
        pure
        returns (string memory)
    {
        if (isEternal) return string.concat("NARA Eternal Ledger #", _pad6(tokenId));
        if (isGenesis) return string.concat("NARA Genesis Archive #", _pad6(tokenId));
        return string.concat("NARA Position #", _pad6(tokenId), " / ", tierName(tier));
    }

    function attributes(
        uint256 seed,
        uint8 tier,
        uint8 moduleIdx,
        bool isGenesis,
        bool isEternal,
        uint256 positionId,
        uint64 createdEpoch,
        uint16 roundId,
        uint16 tierId,
        uint32 mult,
        uint64 mintedAt,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory) {
        // 1 in 10,000 chance for a Double Strike Plate Press Error
        bool isDoubleStrike = (seed % 10000 == 777);
        // 1 in 100,000 chance for a Golden Sigil
        bool isGoldSigil = (seed % 100000 == 7777);

        string memory incision;
        if (seed % 1000 == 123) {
            incision = "Void";
        } else if (seed % 100 < 5) {
            incision = "Gilded";
        } else if (seed % 100 >= 5 && seed % 100 < 10) {
            incision = "Copper";
        } else {
            incision = "Iron Oxide";
        }

        return string.concat(
            '[{"display_type":"number","trait_type":"Position ID","value":', positionId.toString(),
            '},{"trait_type":"Realized Tier","value":"', tierName(tier),
            '"},{"trait_type":"Core","value":"', coreClass(tier),
            '"},{"trait_type":"Module","value":"', moduleName(moduleIdx),
            '"},{"trait_type":"Provenance","value":"', isGenesis ? "Genesis" : "Manual",
            '"},{"trait_type":"Storage","value":"Fully On Chain"',
            '},{"trait_type":"Renderer","value":"V5 Modular"}',
            isDoubleStrike ? ',{"trait_type":"Plate Spec","value":"Double Strike"}' : "",
            isGoldSigil ? ',{"trait_type":"Plate Spec","value":"Golden Sigil"}' : "",
            ',{"trait_type":"Incision Register","value":"', incision, '"',
            '},{"display_type":"number","trait_type":"Created Epoch","value":', uint256(createdEpoch).toString(),
            '},{"display_type":"number","trait_type":"Claim Count","value":', uint256(claimCount).toString(),
            '},{"display_type":"number","trait_type":"Extension Count","value":', uint256(extendCount).toString(),
            "}",
            _genesisAttributes(isGenesis, isEternal, roundId, tierId, mult, mintedAt),
            "]"
        );
    }

    function collectionJSON(string calldata image) external pure returns (string memory) {
        return string.concat(
            '{"name":"NARA Positions","symbol":"NARAPOS",',
            '"description":"Fully on-chain NARA proof-of-position instruments. Visuals encode realized delivered rewards and mint provenance, not expected outcomes.",',
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
            '},{"trait_type":"Eternal","value":"', isEternal ? "true" : "false", '"}'
        );
    }

    function _pad6(uint256 v) internal pure returns (string memory) {
        bytes memory b = bytes(v.toString());
        if (b.length >= 6) return string(b);
        bytes memory out = new bytes(6);
        uint256 pad = 6 - b.length;
        for (uint256 i; i < 6; ++i) out[i] = i < pad ? bytes1("0") : b[i - pad];
        return string(out);
    }

    function _clampTier(uint8 tier) internal pure returns (uint8) {
        return tier > 4 ? 4 : tier;
    }
}
