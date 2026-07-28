// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtSecurityPrintV1
/// @notice Stateless security-printing motifs for NARA position cards.
contract NARAArtSecurityPrintV1 {
    using Strings for uint256;

    string internal constant BG = "#07090A";
    string internal constant LINE = "#26241F";
    string internal constant IVORY = "#D8D1BD";
    string internal constant MUTED = "#6F6B63";
    string internal constant AMBER = "#C2772E";
    string internal constant SCAR = "#6E2924";

    uint256 public constant SECURITY_PRINT_VERSION = 1;

    function securityLayer(
        uint8 tier,
        uint256 seed,
        uint256 tokenId,
        uint256 positionId,
        uint64 createdEpoch,
        string calldata col
    ) external pure returns (string memory) {
        tier = _clampTier(tier);
        return string.concat(
            _microBorder(tokenId, positionId, createdEpoch, col),
            _rosettes(tier, seed, col),
            _registrationMarks(seed, col)
        );
    }

    function moduleOverlay(uint8 moduleIdx, uint8 tier, string calldata col)
        external
        pure
        returns (string memory)
    {
        tier = _clampTier(tier);
        if (moduleIdx == 0) {
            return string.concat(
                '<path d="M342 430 C392 318 608 318 658 430" fill="none" stroke="',
                col,
                '" stroke-width="3" stroke-linecap="round" opacity="0.44"/>'
            );
        }
        if (moduleIdx == 1) {
            string memory bars = "";
            for (uint256 i; i < 7; ++i) {
                uint256 h = 10 + ((uint256(tier) + i) % 4) * 12;
                bars = string.concat(
                    bars,
                    '<rect x="', (404 + i * 32).toString(), '" y="', (700 - h).toString(),
                    '" width="8" height="', h.toString(), '" fill="', col, '" opacity="0.34"/>'
                );
            }
            return bars;
        }
        if (moduleIdx == 2) {
            return string.concat(
                '<circle cx="660" cy="430" r="5" fill="', col, '" opacity="0.46"/>',
                '<circle cx="340" cy="430" r="5" fill="', col, '" opacity="0.46"/>',
                '<circle cx="500" cy="270" r="5" fill="', col, '" opacity="0.46"/>'
            );
        }
        if (moduleIdx == 3) {
            return string.concat(
                '<path d="M430 690H560" stroke="', col,
                '" stroke-width="2" opacity="0.36"/>',
                '<rect x="412" y="686" width="8" height="44" fill="', col, '" opacity="0.25"/>'
            );
        }
        if (moduleIdx == 4) {
            return string.concat(
                '<circle cx="500" cy="430" r="150" fill="none" stroke="', col,
                '" stroke-width="4" stroke-linecap="round" stroke-dasharray="10 34" transform="rotate(-90 500 430)" opacity="0.42"/>'
            );
        }
        return string.concat(
            '<path d="M250 470 Q500 410 750 470 M250 506 Q500 446 750 506" fill="none" stroke="',
            col,
            '" stroke-width="1.5" opacity="0.32"/>'
        );
    }

    function collectionSVG() external pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="', BG,
            '"/><g opacity="0.72">',
            _collectionRose(1190, 450, 0),
            _collectionRose(1190, 450, 36),
            _collectionRose(1190, 450, 72),
            '</g><circle cx="1190" cy="450" r="58" fill="', AMBER, '"/>',
            '<path d="M1190 450 L1118 228 A232 232 0 0 1 1262 228 Z" fill="', BG, '"/>',
            '<path d="M1190 450 L1118 228 M1190 450 L1262 228" stroke="', SCAR, '" stroke-width="3" opacity="0.85"/>',
            '<text x="120" y="432" fill="', IVORY, '" font-family="\'Satoshi\',sans-serif" font-size="160" font-weight="700">NARA</text>',
            '<text x="128" y="520" fill="', AMBER, '" font-family="\'IBM Plex Mono\',monospace" font-size="38" letter-spacing="6">PROOF OF POSITION</text>',
            '<text x="128" y="575" fill="', MUTED, '" font-family="\'IBM Plex Mono\',monospace" font-size="20" letter-spacing="4">MODULAR SECURITY PRINT RENDERER V5</text></svg>'
        );
    }

    function _microBorder(uint256 tokenId, uint256 positionId, uint64 createdEpoch, string calldata col)
        internal
        pure
        returns (string memory)
    {
        string memory serial = string.concat(
            "NARA POSITION ",
            positionId.toString(),
            " TOKEN ",
            tokenId.toString(),
            " EPOCH ",
            uint256(createdEpoch).toString()
        );
        return string.concat(
            '<text x="54" y="62" fill="', col, '" font-family="\'IBM Plex Mono\',monospace" font-size="8" letter-spacing="2" opacity="0.3">',
            serial, " / ", serial, "</text>",
            '<text x="54" y="948" fill="', col, '" font-family="\'IBM Plex Mono\',monospace" font-size="8" letter-spacing="2" opacity="0.26">',
            serial, " / ", serial, "</text>",
            '<text x="62" y="90" fill="', MUTED, '" font-family="\'IBM Plex Mono\',monospace" font-size="7" letter-spacing="2" opacity="0.22" transform="rotate(90 62 90)">',
            serial, "</text>",
            '<text x="938" y="90" fill="', MUTED, '" font-family="\'IBM Plex Mono\',monospace" font-size="7" letter-spacing="2" opacity="0.22" transform="rotate(90 938 90)">',
            serial, "</text>"
        );
    }

    function _rosettes(uint8 tier, uint256 seed, string calldata col) internal pure returns (string memory) {
        if (tier == 0) {
            // Single ultra-faint ghost ellipse to make it look clean and lawful, not a muddy smudge
            return string.concat(
                '<ellipse cx="500" cy="430" rx="146" ry="46" fill="none" stroke="', col,
                '" stroke-width="0.8" opacity="0.07" transform="rotate(', (seed % 180).toString(), ' 500 430)"/>'
            );
        }

        uint256 count = 5 + uint256(tier) + (seed % 2);
        string memory out = "";
        for (uint256 i; i < count; ++i) {
            uint256 a = ((seed >> (i * 4)) + i * 23) % 180;
            uint256 rx = 112 + ((seed >> (i * 5)) % 78) + uint256(tier) * 18;
            uint256 ry = 26 + ((seed >> (i * 3)) % 18) + uint256(tier) * 4;
            out = string.concat(
                out,
                '<ellipse cx="500" cy="430" rx="', rx.toString(), '" ry="', ry.toString(),
                '" fill="none" stroke="', col, '" stroke-width="0.95" opacity="0.24" transform="rotate(',
                a.toString(), ' 500 430)"/>'
            );
        }
        if (tier >= 3) {
            out = string.concat(out, _roseBand(seed >> 32, col, 238, "0.16"));
        }
        if (tier >= 4) {
            out = string.concat(out, _roseBand(seed >> 64, AMBER, 296, "0.13"));
        }
        return string.concat('<g opacity="0.86">', out, "</g>");
    }

    function _roseBand(uint256 seed, string memory col, uint256 baseR, string memory op)
        internal
        pure
        returns (string memory)
    {
        string memory out = "";
        for (uint256 i; i < 10; ++i) {
            uint256 a = (seed + i * 18) % 180;
            out = string.concat(
                out,
                '<ellipse cx="500" cy="430" rx="', (baseR + i * 3).toString(),
                '" ry="', (46 + (i % 3) * 9).toString(), '" fill="none" stroke="', col,
                '" stroke-width="0.9" opacity="', op, '" transform="rotate(', a.toString(), ' 500 430)"/>'
            );
        }
        return out;
    }

    function _registrationMarks(uint256 seed, string calldata col) internal pure returns (string memory) {
        string memory x = (82 + (seed % 18)).toString();
        string memory y = (708 + ((seed >> 8) % 18)).toString();
        return string.concat(
            '<g data-nara="registration-marks" stroke="', col,
            '" stroke-width="1.2" opacity="0.28" stroke-linecap="square">',
            '<path d="M', x, ' ', y, 'h26 M', (82 + (seed % 18) + 13).toString(), ' ', (708 + ((seed >> 8) % 18) - 13).toString(), 'v26"/>',
            '<path d="M904 706h24 M916 694v24" opacity="0.72"/>',
            "</g>"
        );
    }

    function _collectionRose(uint256 cx, uint256 cy, uint256 baseAngle) internal pure returns (string memory) {
        string memory out = "";
        for (uint256 i; i < 8; ++i) {
            out = string.concat(
                out,
                '<ellipse cx="', cx.toString(), '" cy="', cy.toString(), '" rx="', (210 + i * 8).toString(),
                '" ry="', (48 + (i % 3) * 18).toString(), '" fill="none" stroke="', IVORY,
                '" stroke-width="1.5" opacity="0.35" transform="rotate(', (baseAngle + i * 19).toString(),
                " ", cx.toString(), " ", cy.toString(), ')"/>'
            );
        }
        return out;
    }

    function _clampTier(uint8 tier) internal pure returns (uint8) {
        return tier > 4 ? 4 : tier;
    }
}
