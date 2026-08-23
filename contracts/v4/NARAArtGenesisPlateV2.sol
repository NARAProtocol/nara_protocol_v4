// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtGenesisPlateV2
/// @notice Ultra-luxury architectural high-contrast SVG plate for Genesis & Eternal NARA Position NFTs.
contract NARAArtGenesisPlateV2 {
    using Strings for uint256;

    string internal constant BG_DARK = "#07090C";
    string internal constant FRAME_OUTER = "#2F3642";
    string internal constant FRAME_INNER = "#12151A";
    string internal constant IVORY = "#F4EFE6";
    string internal constant PURE_WHITE = "#FFFFFF";
    string internal constant GOLD_BRIGHT = "#FFD700";
    string internal constant GOLD_ACCENT = "#E5B83B";
    string internal constant MUTED = "#8E95A5";

    uint256 public constant GENESIS_PLATE_VERSION = 2;

    function svg(
        uint8 tier,
        uint256 seed,
        bool isEternal,
        uint256 tokenId,
        uint256 positionId,
        uint16 roundId,
        uint16 tierId,
        uint64 mintedAt,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory) {
        tier;
        seed;
        mintedAt;
        claimCount;
        extendCount;
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" style="background:#000;">',
            _chassis(isEternal),
            _header(isEternal, roundId),
            _coreSigil(isEternal),
            _identityBand(tokenId, positionId, tierId, isEternal),
            "</svg>"
        );
    }

    function _chassis(bool isEternal) internal pure returns (string memory) {
        string memory accentColor = isEternal ? GOLD_BRIGHT : IVORY;
        return string.concat(
            '<defs><radialGradient id="coronaglow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="',
            isEternal ? "#FFD700" : "#0052FF",
            '" stop-opacity="0.22"/><stop offset="100%" stop-color="#07090C" stop-opacity="0"/></radialGradient></defs>',
            '<rect width="1000" height="1000" fill="', BG_DARK, '"/>',
            '<rect width="1000" height="1000" fill="url(#coronaglow)"/>',
            // 48px Sleek Titanium Bezel
            '<rect x="24" y="24" width="952" height="952" rx="28" fill="none" stroke="', FRAME_OUTER, '" stroke-width="48"/>',
            '<rect x="48" y="48" width="904" height="904" rx="16" fill="none" stroke="', FRAME_INNER, '" stroke-width="6"/>',
            // Gold Inlay Pin-Stripe
            '<rect x="54" y="54" width="892" height="892" rx="12" fill="none" stroke="', accentColor, '" stroke-width="1.5" opacity="0.4"/>',
            // High-Contrast Corner Brackets
            '<path d="M58 140 V58 H140" fill="none" stroke="', accentColor, '" stroke-width="8" stroke-linecap="round"/>',
            '<path d="M942 140 V58 H860" fill="none" stroke="', accentColor, '" stroke-width="8" stroke-linecap="round"/>',
            '<path d="M58 860 V942 H140" fill="none" stroke="', accentColor, '" stroke-width="8" stroke-linecap="round"/>',
            '<path d="M942 860 V942 H860" fill="none" stroke="', accentColor, '" stroke-width="8" stroke-linecap="round"/>',
            // Corner Rivets
            '<circle cx="72" cy="72" r="6" fill="', accentColor, '"/>',
            '<circle cx="928" cy="72" r="6" fill="', accentColor, '"/>',
            '<circle cx="72" cy="928" r="6" fill="', accentColor, '"/>',
            '<circle cx="928" cy="928" r="6" fill="', accentColor, '"/>'
        );
    }

    function _header(bool isEternal, uint16 roundId) internal pure returns (string memory) {
        string memory leftTitle = isEternal ? unicode"● ETERNAL GENESIS" : unicode"● GENESIS ARCHIVE";
        string memory rightTag = isEternal ? unicode"5.0X BOOST // R-01" : string.concat("ROUND #0", uint256(roundId).toString());

        string memory tagColor = isEternal ? GOLD_BRIGHT : IVORY;

        return string.concat(
            '<g transform="translate(80, 114)"><circle cx="0" cy="0" r="10" fill="', GOLD_BRIGHT, '"/>',
            '<circle cx="0" cy="0" r="16" fill="none" stroke="', GOLD_BRIGHT, '" stroke-width="2" opacity="0.6"/>',
            '<text x="26" y="9" fill="', tagColor, '" font-family="\'IBM Plex Mono\', monospace" font-size="30" font-weight="900" letter-spacing="2">',
            leftTitle,
            '</text></g>',
            '<text x="920" y="123" fill="', GOLD_BRIGHT, '" font-family="\'IBM Plex Mono\', monospace" font-size="28" font-weight="800" letter-spacing="2" text-anchor="end">',
            rightTag,
            '</text>',
            '<line x1="80" y1="154" x2="920" y2="154" stroke="', isEternal ? GOLD_ACCENT : FRAME_OUTER, '" stroke-width="2" opacity="0.5"/>'
        );
    }

    function _coreSigil(bool isEternal) internal pure returns (string memory) {
        string memory sigilColor = isEternal ? GOLD_BRIGHT : IVORY;
        return string.concat(
            '<g transform="translate(500, 480)">',
            '<circle cx="0" cy="0" r="280" fill="none" stroke="#252C38" stroke-width="2" opacity="0.4" stroke-dasharray="8 12"/>',
            '<circle cx="0" cy="0" r="220" fill="none" stroke="', GOLD_ACCENT, '" stroke-width="2.5" opacity="0.75" stroke-dasharray="14 8"/>',
            '<circle cx="0" cy="0" r="150" fill="#0B0D11" stroke="', GOLD_BRIGHT, '" stroke-width="5"/>',
            // Precision Crosshairs
            '<line x1="-300" y1="0" x2="-230" y2="0" stroke="', GOLD_BRIGHT, '" stroke-width="2.5" opacity="0.8"/>',
            '<line x1="230" y1="0" x2="300" y2="0" stroke="', GOLD_BRIGHT, '" stroke-width="2.5" opacity="0.8"/>',
            '<line x1="0" y1="-300" x2="0" y2="-230" stroke="', GOLD_BRIGHT, '" stroke-width="2.5" opacity="0.8"/>',
            '<line x1="0" y1="230" x2="0" y2="300" stroke="', GOLD_BRIGHT, '" stroke-width="2.5" opacity="0.8"/>',
            // N Sigil
            '<g stroke="', sigilColor, '" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" fill="none">',
            '<path d="M-40 60 L-40 -60"/>',
            '<path d="M40 60 L40 -60"/>',
            '<path d="M-40 -60 L40 60"/>',
            '</g>',
            '<circle cx="0" cy="0" r="10" fill="', GOLD_BRIGHT, '"/>',
            '</g>'
        );
    }

    function _identityBand(uint256 tokenId, uint256 positionId, uint16 tierId, bool isEternal) internal pure returns (string memory) {
        tierId;
        return string.concat(
            '<line x1="80" y1="784" x2="920" y2="784" stroke="', isEternal ? GOLD_ACCENT : FRAME_OUTER, '" stroke-width="2" opacity="0.5"/>',
            '<text x="80" y="874" fill="', PURE_WHITE, '" font-family="\'Satoshi\', \'Inter\', sans-serif" font-size="88" font-weight="900" letter-spacing="4">NARA</text>',
            '<text x="84" y="918" fill="', isEternal ? GOLD_BRIGHT : MUTED, '" font-family="\'IBM Plex Mono\', monospace" font-size="22" font-weight="800" letter-spacing="3">SOVEREIGN ETERNAL ANCHOR</text>',
            '<text x="920" y="856" fill="', GOLD_BRIGHT, '" font-family="\'IBM Plex Mono\', monospace" font-size="34" font-weight="900" letter-spacing="3" text-anchor="end">POS #',
            _pad6(positionId),
            '</text>',
            '<text x="920" y="896" fill="', IVORY, '" font-family="\'IBM Plex Mono\', monospace" font-size="24" font-weight="800" letter-spacing="2" text-anchor="end">TOKEN #',
            _pad6(tokenId),
            '</text>'
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
