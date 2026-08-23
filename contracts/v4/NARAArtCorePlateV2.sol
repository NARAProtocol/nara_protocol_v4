// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface INARAArtSecurityPrintV1 {
    function securityLayer(
        uint8 tier,
        uint256 seed,
        uint256 tokenId,
        uint256 positionId,
        uint64 createdEpoch,
        string calldata col
    ) external pure returns (string memory);

    function moduleOverlay(uint8 moduleIdx, uint8 tier, string calldata col) external pure returns (string memory);
}

/// @title NARAArtCorePlateV2
/// @notice Architectural luxury fat frame and high-contrast vector plate for NARA Position NFTs.
contract NARAArtCorePlateV2 {
    using Strings for uint256;

    string internal constant IVORY = "#F4EFE6";
    string internal constant PURE_WHITE = "#FFFFFF";
    string internal constant FRAME_BG = "#0B0D10";
    string internal constant GRID_LINE = "#202630";
    string internal constant MUTED_TEXT = "#8E95A5";
    string internal constant COBALT = "#0052FF";
    string internal constant EMERALD = "#00E599";
    string internal constant GOLD = "#F5B041";
    string internal constant APEX_AMBER = "#FF6B00";

    uint256 public constant CORE_PLATE_VERSION = 2;
    INARAArtSecurityPrintV1 public immutable SECURITY_PRINT;

    constructor(address securityPrint_) {
        if (securityPrint_ == address(0) || securityPrint_.code.length == 0) revert("SECURITY_PRINT");
        SECURITY_PRINT = INARAArtSecurityPrintV1(securityPrint_);
    }

    function svg(
        uint8 tier,
        uint256 seed,
        uint8 moduleIdx,
        uint256 tokenId,
        uint256 positionId,
        uint64 createdEpoch,
        uint32 claimCount,
        uint32 extendCount
    ) external view returns (string memory) {
        tier = _clampTier(tier);
        string memory col = _tierColor(tier);
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img">',
            "<title>NARA Position #", tokenId.toString(), "</title>",
            "<desc>On-chain NARA proof-of-position instrument. Architectural luxury fat frame.</desc>",
            _defs(tier, col),
            _fatFrame(),
            '<rect x="54" y="54" width="892" height="892" rx="12" fill="url(#tech-grid)"/>',
            '<rect x="54" y="54" width="892" height="892" rx="12" fill="url(#core-glow)"/>',
            SECURITY_PRINT.securityLayer(tier, seed, tokenId, positionId, createdEpoch, col),
            _header(tier, col, createdEpoch),
            _coreField(tier, seed, moduleIdx, col),
            _historyMarks(seed, claimCount, extendCount, col),
            _identityBand(tokenId, positionId, tier, seed, col, claimCount, extendCount),
            "</svg>"
        );
    }

    function _defs(uint8 tier, string memory col) internal pure returns (string memory) {
        string memory glowInner = tier >= 4 ? "0.48" : tier >= 3 ? "0.40" : tier >= 2 ? "0.32" : tier >= 1 ? "0.26" : "0.20";
        string memory glowMid = tier >= 4 ? "0.18" : tier >= 3 ? "0.14" : tier >= 2 ? "0.10" : tier >= 1 ? "0.08" : "0.05";
        return string.concat(
            "<defs>",
            '<radialGradient id="core-glow" cx="50%" cy="44%" r="50%">',
            '<stop offset="0%" stop-color="', col, '" stop-opacity="', glowInner, '"/>',
            '<stop offset="50%" stop-color="', col, '" stop-opacity="', glowMid, '"/>',
            '<stop offset="100%" stop-color="', col, '" stop-opacity="0"/></radialGradient>',
            '<linearGradient id="frame-bevel" x1="0%" y1="0%" x2="100%" y2="100%">',
            '<stop offset="0%" stop-color="#363D4A"/>',
            '<stop offset="50%" stop-color="#181C22"/>',
            '<stop offset="100%" stop-color="#0D0F13"/></linearGradient>',
            '<linearGradient id="plate-grad" x1="0%" y1="0%" x2="0%" y2="100%">',
            '<stop offset="0%" stop-color="#13171F"/>',
            '<stop offset="100%" stop-color="#0A0C10"/></linearGradient>',
            '<pattern id="tech-grid" width="40" height="40" patternUnits="userSpaceOnUse">',
            '<path d="M 40 0 L 0 0 0 40" fill="none" stroke="', GRID_LINE, '" stroke-width="1.2" stroke-opacity="0.75"/>',
            '<circle cx="40" cy="40" r="1" fill="', GRID_LINE, '" opacity="0.9"/></pattern>',
            '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">',
            '<feGaussianBlur stdDeviation="8" result="blur"/>',
            '<feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>',
            "</defs>"
        );
    }

    function _fatFrame() internal pure returns (string memory) {
        return string.concat(
            '<rect x="0" y="0" width="1000" height="1000" rx="36" fill="url(#frame-bevel)"/>',
            '<rect x="8" y="8" width="984" height="984" rx="30" fill="', FRAME_BG, '" stroke="#2D3440" stroke-width="2"/>',
            '<rect x="44" y="44" width="912" height="912" rx="18" fill="url(#plate-grad)" stroke="#2A303C" stroke-width="3"/>',
            _cornerHardware(),
            _scaleTicks()
        );
    }

    function _cornerHardware() internal pure returns (string memory) {
        return string.concat(
            '<path d="M20 54 L54 20 M20 20 L20 44 M20 20 L44 20" stroke="', IVORY, '" stroke-width="3" stroke-linecap="round" opacity="0.8"/>',
            '<circle cx="32" cy="32" r="3.5" fill="', IVORY, '" opacity="0.9"/>',
            '<line x1="24" y1="76" x2="24" y2="120" stroke="#404958" stroke-width="1.5"/>',
            '<path d="M980 54 L946 20 M980 20 L980 44 M980 20 L956 20" stroke="', IVORY, '" stroke-width="3" stroke-linecap="round" opacity="0.8"/>',
            '<circle cx="968" cy="32" r="3.5" fill="', IVORY, '" opacity="0.9"/>',
            '<line x1="976" y1="76" x2="976" y2="120" stroke="#404958" stroke-width="1.5"/>',
            '<path d="M20 946 L54 980 M20 980 L20 956 M20 980 L44 980" stroke="', IVORY, '" stroke-width="3" stroke-linecap="round" opacity="0.8"/>',
            '<circle cx="32" cy="968" r="3.5" fill="', IVORY, '" opacity="0.9"/>',
            '<line x1="24" y1="924" x2="24" y2="880" stroke="#404958" stroke-width="1.5"/>',
            '<path d="M980 946 L946 980 M980 980 L980 956 M980 980 L956 980" stroke="', IVORY, '" stroke-width="3" stroke-linecap="round" opacity="0.8"/>',
            '<circle cx="968" cy="968" r="3.5" fill="', IVORY, '" opacity="0.9"/>',
            '<line x1="976" y1="924" x2="976" y2="880" stroke="#404958" stroke-width="1.5"/>'
        );
    }

    function _scaleTicks() internal pure returns (string memory) {
        return string.concat(
            '<g stroke="#3D4656" stroke-width="1" opacity="0.7">',
            '<line x1="200" y1="24" x2="200" y2="32"/><line x1="300" y1="24" x2="300" y2="32"/><line x1="400" y1="24" x2="400" y2="32"/>',
            '<line x1="500" y1="20" x2="500" y2="36" stroke="', IVORY, '" stroke-width="1.5" opacity="0.9"/>',
            '<line x1="600" y1="24" x2="600" y2="32"/><line x1="700" y1="24" x2="700" y2="32"/><line x1="800" y1="24" x2="800" y2="32"/></g>'
        );
    }

    function _header(uint8 tier, string memory col, uint64 createdEpoch) internal pure returns (string memory) {
        return string.concat(
            '<g transform="translate(80, 100)">',
            '<circle cx="8" cy="8" r="7" fill="', col, '" filter="url(#glow)"/>',
            '<circle cx="8" cy="8" r="3.5" fill="', PURE_WHITE, '"/>',
            '<text x="28" y="16" fill="', IVORY, '" font-family="\'Satoshi\', \'Inter\', sans-serif" font-size="22" font-weight="800" letter-spacing="3">', _upper(_tierName(tier)), "</text>",
            '<text x="840" y="16" fill="', IVORY, '" font-family="\'IBM Plex Mono\', monospace" font-size="18" font-weight="700" text-anchor="end" letter-spacing="2">EPOCH #', uint256(createdEpoch).toString(), "</text></g>"
        );
    }

    function _coreField(uint8 tier, uint256 seed, uint8 moduleIdx, string memory col)
        internal
        view
        returns (string memory)
    {
        return string.concat(
            '<g transform="translate(500, 460)">',
            '<circle cx="0" cy="0" r="260" fill="none" stroke="#232830" stroke-width="1.5" stroke-dasharray="6 8"/>',
            '<circle cx="0" cy="0" r="210" fill="none" stroke="', GRID_LINE, '" stroke-width="2"/>',
            '<circle cx="0" cy="0" r="160" fill="none" stroke="', col, '" stroke-width="2.5" opacity="0.9" stroke-dasharray="12 6"/>',
            '<line x1="-280" y1="0" x2="280" y2="0" stroke="#3D4656" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 6"/>',
            '<line x1="0" y1="-280" x2="0" y2="280" stroke="#3D4656" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 6"/>',
            '<path d="M-160 -10 L-160 10 M160 -10 L160 10 M-10 -160 L10 -160 M-10 160 L10 160" stroke="', IVORY, '" stroke-width="2.5"/>',
            SECURITY_PRINT.moduleOverlay(moduleIdx, tier, col),
            '<circle cx="0" cy="0" r="112" fill="#0A0C10" stroke="', col, '" stroke-width="4.5" filter="url(#glow)"/>',
            '<circle cx="0" cy="0" r="100" fill="none" stroke="#262D38" stroke-width="2"/>',
            '<circle cx="0" cy="0" r="88" fill="none" stroke="', IVORY, '" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"/>',
            _sigil(col, seed),
            "</g>"
        );
    }

    function _sigil(string memory col, uint256 seed) internal pure returns (string memory) {
        seed;
        return string.concat(
            '<g stroke="', IVORY, '" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round" fill="none">',
            '<path d="M-30 44 L-30 -44"/>',
            '<path d="M30 44 L30 -44"/>',
            '<path d="M-30 -44 L30 44"/></g>',
            '<circle cx="0" cy="0" r="6.5" fill="', col, '"/>'
        );
    }

    function _historyMarks(uint256 seed, uint32 claimCount, uint32 extendCount, string memory col)
        internal
        pure
        returns (string memory)
    {
        seed;
        claimCount;
        extendCount;
        col;
        return "";
    }

    function _identityBand(
        uint256 tokenId,
        uint256 positionId,
        uint8 /* tier */,
        uint256 seed,
        string memory col,
        uint32 claimCount,
        uint32 extendCount
    ) internal pure returns (string memory) {
        tokenId;
        seed;
        claimCount;
        extendCount;
        return string.concat(
            '<g transform="translate(80, 810)">',
            '<line x1="0" y1="0" x2="840" y2="0" stroke="#323A48" stroke-width="2"/>',
            '<line x1="0" y1="0" x2="160" y2="0" stroke="', col, '" stroke-width="3.5"/>',
            '<text x="0" y="58" fill="', PURE_WHITE, '" font-family="\'Satoshi\', \'Inter\', sans-serif" font-size="64" font-weight="900" letter-spacing="6">NARA</text>',
            '<text x="840" y="54" fill="', IVORY, '" font-family="\'IBM Plex Mono\', monospace" font-size="24" font-weight="800" text-anchor="end" letter-spacing="2">POSITION #', _pad6(positionId), "</text>",
            "</g>"
        );
    }


    function _tierName(uint8 tier) internal pure returns (string memory) {
        if (tier == 4) return "Apex Radiant";
        if (tier == 3) return "Calibrated";
        if (tier == 2) return "Rewarded";
        if (tier == 1) return "Activated";
        return "Dormant // New";
    }

    function _tierColor(uint8 tier) internal pure returns (string memory) {
        if (tier == 4) return APEX_AMBER;
        if (tier == 3) return GOLD;
        if (tier == 2) return EMERALD;
        if (tier == 1) return COBALT;
        return COBALT;
    }

    function _pad6(uint256 v) internal pure returns (string memory) {
        bytes memory b = bytes(v.toString());
        if (b.length >= 6) return string(b);
        bytes memory out = new bytes(6);
        uint256 pad = 6 - b.length;
        for (uint256 i; i < 6; ++i) out[i] = i < pad ? bytes1("0") : b[i - pad];
        return string(out);
    }

    function _upper(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i; i < b.length; ++i) {
            if (b[i] >= 0x61 && b[i] <= 0x7A) b[i] = bytes1(uint8(b[i]) - 32);
        }
        return string(b);
    }

    function _clampTier(uint8 tier) internal pure returns (uint8) {
        return tier > 4 ? 4 : tier;
    }
}
