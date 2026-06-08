// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {Position} from "./NARAEngineTypes.sol";
import {INARAPositionRendererV4} from "./interfaces/INARAPositionRendererV4.sol";

interface INARAPositionNFTV4Render {
    function positionIdOf(uint256 tokenId) external view returns (uint256);
    function positionInfo(uint256 tokenId) external view returns (Position memory);
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
}

/// @title NARAPositionRendererV4
/// @notice Fully onchain, immutable art and stable marketplace metadata for NARA positions.
/// @dev Financial values that change without a token-specific transaction intentionally live in
///      NARAPositionDataLensV1 instead of marketplace metadata.
contract NARAPositionRendererV4 is INARAPositionRendererV4 {
    using Strings for uint256;

    uint8 public constant ARTWORK_COUNT = 8;
    uint256 public constant RENDERER_VERSION = 1;

    function tokenURI(address positionNft, uint256 tokenId) external view returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(_tokenJSON(positionNft, tokenId))));
    }

    function tokenJSON(address positionNft, uint256 tokenId) external view returns (string memory) {
        return _tokenJSON(positionNft, tokenId);
    }

    function tokenSVG(address positionNft, uint256 tokenId) external view returns (string memory) {
        return _tokenSVG(positionNft, tokenId);
    }

    function collectionURI(address) external pure returns (string memory) {
        string memory image = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(_collectionSVG()))
        );
        string memory json = string.concat(
            '{"name":"NARA Positions","symbol":"NARAPOS",',
            '"description":"Bearer NFTs for NARA Protocol v4 lock positions. Artwork is fully onchain and does not encode rarity, expected returns, or investment preference.",',
            '"image":"',
            image,
            '","banner_image":"',
            image,
            '","featured_image":"',
            image,
            '","external_link":"https://www.naraprotocol.io/"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function artworkIndex(uint256 tokenId) public pure returns (uint8) {
        if (tokenId == 0) return 0;
        return uint8((tokenId - 1) % ARTWORK_COUNT);
    }

    function artworkName(uint8 index) public pure returns (string memory) {
        if (index == 0) return "Axis";
        if (index == 1) return "Archive";
        if (index == 2) return "Field";
        if (index == 3) return "Interval";
        if (index == 4) return "Orbit";
        if (index == 5) return "Relay";
        if (index == 6) return "Signal";
        return "Vault";
    }

    function _tokenJSON(address positionNft, uint256 tokenId) internal view returns (string memory) {
        uint256 positionId = INARAPositionNFTV4Render(positionNft).positionIdOf(tokenId);
        Position memory p = INARAPositionNFTV4Render(positionNft).positionInfo(tokenId);
        (
            bool isGenesis,
            bool isEternal,
            uint16 roundId,
            uint16 tierId,
            uint32 rewardMultiplierBps,
            uint64 mintedAt,

        ) = INARAPositionNFTV4Render(positionNft).genesisMetadataOf(tokenId);
        uint8 artIndex = artworkIndex(tokenId);
        string memory origin = isGenesis ? "Genesis Bond" : "Manual";
        string memory image = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(_tokenSVG(positionNft, tokenId)))
        );

        return string.concat(
            '{"name":"NARA Position #',
            tokenId.toString(),
            '","description":"A tradable NARA Protocol v4 lock position. Artwork assignment is deterministic and equal-status. Live position and reward data is available from NARAPositionDataLensV1.",',
            '"image":"',
            image,
            '","external_url":"https://www.naraprotocol.io/",',
            '"background_color":"',
            _backgroundColor(artIndex),
            '","attributes":[',
            '{"trait_type":"Artwork","value":"',
            artworkName(artIndex),
            '"},{"display_type":"number","trait_type":"Artwork Index","value":',
            uint256(artIndex).toString(),
            '},{"display_type":"number","trait_type":"Position ID","value":',
            positionId.toString(),
            '},{"trait_type":"Origin","value":"',
            origin,
            '"},{"display_type":"number","trait_type":"Created Epoch","value":',
            uint256(p.createdEpoch).toString(),
            "}",
            _genesisAttributes(isGenesis, isEternal, roundId, tierId, rewardMultiplierBps, mintedAt),
            "]}"
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
            ',{"display_type":"number","trait_type":"Genesis Round","value":',
            uint256(roundId).toString(),
            '},{"display_type":"number","trait_type":"Genesis Tier","value":',
            uint256(tierId).toString(),
            '},{"display_type":"number","trait_type":"Genesis Reward Multiplier Bps","value":',
            uint256(rewardMultiplierBps).toString(),
            '},{"display_type":"date","trait_type":"Genesis Minted At","value":',
            uint256(mintedAt).toString(),
            '},{"trait_type":"Eternal","value":"',
            isEternal ? "true" : "false",
            '"}'
        );
    }

    function _tokenSVG(address positionNft, uint256 tokenId) internal view returns (string memory) {
        uint256 positionId = INARAPositionNFTV4Render(positionNft).positionIdOf(tokenId);
        (bool isGenesis,,,,,,) = INARAPositionNFTV4Render(positionNft).genesisMetadataOf(tokenId);
        uint8 index = artworkIndex(tokenId);
        (string memory background, string memory accent, string memory secondary) = _palette(index);
        string memory origin = isGenesis ? "GENESIS PROVENANCE" : "MANUAL ORIGIN";

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img">',
            "<title>NARA Position #",
            tokenId.toString(),
            "</title><desc>Equal-status fully onchain NARA position artwork: ",
            artworkName(index),
            "</desc>",
            '<rect width="1200" height="1200" fill="',
            background,
            '"/>',
            _pattern(index, accent, secondary),
            '<rect x="54" y="54" width="1092" height="1092" fill="none" stroke="',
            accent,
            '" stroke-width="4"/>',
            '<path d="M54 980H1146" stroke="',
            accent,
            '" stroke-width="2" opacity=".55"/>',
            '<text x="86" y="1050" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="86" font-weight="700">NARA</text>',
            '<text x="1114" y="1048" fill="#ffffff" font-family="monospace" font-size="28" text-anchor="end">POSITION ',
            positionId.toString(),
            "</text>",
            '<text x="86" y="1104" fill="',
            secondary,
            '" font-family="monospace" font-size="24">',
            artworkName(index),
            " / ",
            origin,
            "</text>",
            '<text x="1114" y="1104" fill="',
            secondary,
            '" font-family="monospace" font-size="24" text-anchor="end">TOKEN ',
            tokenId.toString(),
            "</text></svg>"
        );
    }

    function _palette(uint8 index)
        internal
        pure
        returns (string memory background, string memory accent, string memory secondary)
    {
        if (index == 0) return ("#080b12", "#0000ff", "#f2c14e");
        if (index == 1) return ("#11100d", "#0000ff", "#e8e1d3");
        if (index == 2) return ("#06110d", "#0000ff", "#56d6a9");
        if (index == 3) return ("#101015", "#0000ff", "#ff6b6b");
        if (index == 4) return ("#080d16", "#0000ff", "#8cc8ff");
        if (index == 5) return ("#120b10", "#0000ff", "#f29ad8");
        if (index == 6) return ("#071012", "#0000ff", "#72e0e0");
        return ("#0c0c0e", "#0000ff", "#d8d8de");
    }

    function _backgroundColor(uint8 index) internal pure returns (string memory) {
        if (index == 0) return "080B12";
        if (index == 1) return "11100D";
        if (index == 2) return "06110D";
        if (index == 3) return "101015";
        if (index == 4) return "080D16";
        if (index == 5) return "120B10";
        if (index == 6) return "071012";
        return "0C0C0E";
    }

    function _pattern(uint8 index, string memory accent, string memory secondary)
        internal
        pure
        returns (string memory)
    {
        if (index == 0) {
            return string.concat(
                '<circle cx="600" cy="510" r="330" fill="none" stroke="', accent, '" stroke-width="44"/>',
                '<path d="M600 130V890M220 510H980" stroke="', secondary, '" stroke-width="12"/>',
                '<circle cx="600" cy="510" r="96" fill="', secondary, '"/>'
            );
        }
        if (index == 1) {
            return string.concat(
                '<path d="M180 190H1020V820H180Z" fill="none" stroke="', secondary, '" stroke-width="18"/>',
                '<path d="M250 270H950M250 360H950M250 450H950M250 540H950M250 630H950M250 720H950" stroke="', accent, '" stroke-width="20"/>',
                '<path d="M390 190V820M600 190V820M810 190V820" stroke="', secondary, '" stroke-width="6" opacity=".7"/>'
            );
        }
        if (index == 2) {
            return string.concat(
                '<path d="M120 760C300 170 900 170 1080 760" fill="none" stroke="', accent, '" stroke-width="52"/>',
                '<path d="M190 760C340 300 860 300 1010 760M270 760C390 420 810 420 930 760" fill="none" stroke="', secondary, '" stroke-width="14"/>',
                '<circle cx="600" cy="510" r="54" fill="', secondary, '"/>'
            );
        }
        if (index == 3) {
            return string.concat(
                '<rect x="150" y="170" width="240" height="650" fill="', accent, '"/>',
                '<rect x="480" y="270" width="240" height="550" fill="', secondary, '"/>',
                '<rect x="810" y="370" width="240" height="450" fill="', accent, '"/>',
                '<path d="M150 870H1050" stroke="#ffffff" stroke-width="8"/>'
            );
        }
        if (index == 4) {
            return string.concat(
                '<ellipse cx="600" cy="510" rx="430" ry="180" fill="none" stroke="', secondary, '" stroke-width="14" transform="rotate(-18 600 510)"/>',
                '<ellipse cx="600" cy="510" rx="320" ry="320" fill="none" stroke="', accent, '" stroke-width="46"/>',
                '<circle cx="600" cy="510" r="116" fill="', secondary, '"/>',
                '<circle cx="990" cy="360" r="38" fill="#ffffff"/>'
            );
        }
        if (index == 5) {
            return string.concat(
                '<path d="M150 700L390 270L600 700L810 270L1050 700" fill="none" stroke="', accent, '" stroke-width="54" stroke-linejoin="round"/>',
                '<circle cx="390" cy="270" r="54" fill="', secondary, '"/>',
                '<circle cx="810" cy="270" r="54" fill="', secondary, '"/>',
                '<path d="M150 820H1050" stroke="', secondary, '" stroke-width="12"/>'
            );
        }
        if (index == 6) {
            return string.concat(
                '<path d="M150 760V260L330 640L510 330L690 680L870 290L1050 760" fill="none" stroke="', secondary, '" stroke-width="20"/>',
                '<path d="M150 810H1050" stroke="', accent, '" stroke-width="46"/>',
                '<circle cx="510" cy="330" r="46" fill="', accent, '"/>',
                '<circle cx="870" cy="290" r="46" fill="', accent, '"/>'
            );
        }
        return string.concat(
            '<rect x="190" y="170" width="820" height="650" fill="none" stroke="', secondary, '" stroke-width="18"/>',
            '<rect x="290" y="270" width="620" height="450" fill="', accent, '"/>',
            '<rect x="420" y="370" width="360" height="250" fill="#0c0c0e" stroke="#ffffff" stroke-width="8"/>',
            '<circle cx="600" cy="495" r="58" fill="', secondary, '"/>'
        );
    }

    function _collectionSVG() internal pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">',
            '<rect width="1600" height="900" fill="#080b12"/>',
            '<circle cx="1210" cy="450" r="310" fill="none" stroke="#0000ff" stroke-width="72"/>',
            '<path d="M1210 95V805M855 450H1565" stroke="#f2c14e" stroke-width="12"/>',
            '<circle cx="1210" cy="450" r="92" fill="#f2c14e"/>',
            '<text x="100" y="390" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="150" font-weight="700">NARA</text>',
            '<text x="110" y="500" fill="#f2c14e" font-family="monospace" font-size="58">POSITIONS</text>',
            '<text x="110" y="590" fill="#ffffff" font-family="monospace" font-size="28">ONCHAIN ART / ONCHAIN UTILITY</text>',
            "</svg>"
        );
    }
}
