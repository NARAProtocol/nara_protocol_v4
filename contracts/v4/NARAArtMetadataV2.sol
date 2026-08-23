// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtMetadataV2
/// @notice Institutional sovereign-grade metadata vocabulary for NARA Position NFTs on OpenSea & marketplaces.
contract NARAArtMetadataV2 {
    using Strings for uint256;

    uint256 public constant METADATA_VERSION = 2;

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
        uint16 roundId,
        uint16 tierId,
        uint32 mult,
        uint64 mintedAt,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory) {
        seed;
        moduleIdx;
        return string.concat(
            '[{"trait_type":"Instrument Type","value":"Proof-of-Position Bearer Bond"',
            '},{"display_type":"number","trait_type":"Position ID","value":', positionId.toString(),
            '},{"trait_type":"Network","value":"Base Mainnet (8453)"',
            '},{"trait_type":"Account Architecture","value":"ERC-6551 Token-Bound"',
            '},{"trait_type":"Yield Status","value":"', tierName(tier),
            '"},{"display_type":"number","trait_type":"Created Epoch","value":', uint256(createdEpoch).toString(),
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
            '"description":"Sovereign on-chain financial instruments securing locked NARA principal and streaming protocol dividends on Base. Ownership and reward streams are governed via immutable ERC-6551 Token-Bound Accounts.",',
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
