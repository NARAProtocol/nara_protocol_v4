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

/// @title NARAArtCorePlateV1
/// @notice Modular security-printing SVG plate for standard NARA position NFTs.
contract NARAArtCorePlateV1 {
    using Strings for uint256;

    string internal constant BG = "#07090A";
    string internal constant LINE = "#26241F";
    string internal constant IVORY = "#D8D1BD";
    string internal constant MUTED = "#6F6B63";
    string internal constant IRON = "#8C8A82";
    string internal constant COPPER = "#397C68";
    string internal constant BRASS = "#A88745";
    string internal constant AMBER = "#C2772E";
    string internal constant SCAR = "#6E2924";

    uint256 public constant CORE_PLATE_VERSION = 1;
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
            "<title>NARA Position #", tokenId.toString(),
            "</title><desc>On-chain NARA proof-of-position instrument. Visual marks reflect realized delivered rewards and holder actions.</desc>",
            _defs(tier, col),
            _basePlate(),
            SECURITY_PRINT.securityLayer(tier, seed, tokenId, positionId, createdEpoch, col),
            _quietReserve(),
            _coreField(tier, seed, moduleIdx, col),
            _historyMarks(seed, claimCount, extendCount, col),
            _statusMarker(tier, col),
            _identityBand(tokenId, positionId, tier, seed, col),
            _actionLedger(claimCount, extendCount, col),
            "</svg>"
        );
    }

    function _defs(uint8 tier, string memory col) internal pure returns (string memory) {
        string memory inner = tier >= 4 ? "0.36" : tier >= 3 ? "0.28" : tier >= 2 ? "0.2" : tier >= 1 ? "0.13" : "0.06";
        string memory mid = tier >= 4 ? "0.12" : tier >= 3 ? "0.09" : tier >= 2 ? "0.06" : tier >= 1 ? "0.04" : "0.02";
        return string.concat(
            '<defs><radialGradient id="cg" cx="50%" cy="50%" r="50%">',
            '<stop offset="0%" stop-color="', col, '" stop-opacity="', inner, '"/>',
            '<stop offset="55%" stop-color="', col, '" stop-opacity="', mid, '"/>',
            '<stop offset="100%" stop-color="', col, '" stop-opacity="0"/></radialGradient>',
            '<radialGradient id="vg" cx="50%" cy="40%" r="80%">',
            '<stop offset="50%" stop-color="#0E0F12" stop-opacity="0.1"/>',
            '<stop offset="100%" stop-color="#050608" stop-opacity="0.8"/></radialGradient>',
            '<pattern id="grid" width="58" height="58" patternUnits="userSpaceOnUse">',
            '<path d="M58 0H0V58" fill="none" stroke="', LINE, '" stroke-width="1.2"/></pattern>',
            '<linearGradient id="disc" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#1B1D20"/><stop offset="100%" stop-color="#060708"/></linearGradient>',
            '<filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>',
            "</defs>"
        );
    }

    function _basePlate() internal pure returns (string memory) {
        return string.concat(
            '<rect width="1000" height="1000" fill="', BG, '"/>',
            '<rect x="328" y="86" width="592" height="642" fill="url(#grid)" opacity="0.2"/>',
            '<rect width="1000" height="1000" fill="url(#vg)"/>',
            '<rect x="24" y="24" width="952" height="952" rx="16" fill="none" stroke="', LINE, '" stroke-width="2"/>'
        );
    }

    function _coreField(uint8 tier, uint256 seed, uint8 moduleIdx, string memory col)
        internal
        view
        returns (string memory)
    {
        uint256 glowR = tier >= 4 ? 352 : tier >= 3 ? 330 : tier >= 2 ? 296 : tier >= 1 ? 260 : 224;
        return string.concat(
            '<circle cx="500" cy="430" r="', glowR.toString(), '" fill="url(#cg)" filter="url(#b)"/>',
            _scar(tier, seed),
            _axis(tier, col),
            SECURITY_PRINT.moduleOverlay(moduleIdx, tier, col),
            '<circle cx="500" cy="430" r="104" fill="url(#disc)"/>',
            '<circle cx="500" cy="430" r="104" fill="none" stroke="', col, '" stroke-width="3.5"/>',
            '<circle cx="500" cy="430" r="70" fill="none" stroke="', col, '" stroke-width="1.5" opacity="0.38"/>',
            _sigil(col, tier, seed)
        );
    }

    function _quietReserve() internal pure returns (string memory) {
        return string.concat(
            '<rect data-nara="quiet-reserve" x="72" y="162" width="236" height="456" fill="', BG, '"/>'
        );
    }

    function _scar(uint8 tier, uint256 seed) internal pure returns (string memory) {
        if (seed % 1000 == 123) return _voidScar(tier, seed);
        string memory scarCol = (seed % 100 < 5) ? BRASS : (seed % 100 >= 5 && seed % 100 < 10) ? COPPER : SCAR;
        string memory a = ((seed >> 8) % 360).toString();
        string memory ew = tier >= 4 ? "4.5" : tier >= 2 ? "3.0" : "1.8";
        uint256 r = tier == 4 ? 350 : tier == 3 ? 310 : tier == 2 ? 270 : tier == 1 ? 220 : 160;
        uint256 halfW = tier == 4 ? 108 : tier == 3 ? 88 : tier == 2 ? 68 : tier == 1 ? 48 : 28;
        string memory x1 = (500 - halfW).toString();
        string memory x2 = (500 + halfW).toString();
        string memory y = (430 - r).toString();
        string memory rStr = r.toString();
        string memory body = string.concat(
            '<g data-nara="scar" transform="rotate(', a, ' 500 430)">',
            '<path d="M500 430 L', x1, ' ', y, ' A', rStr, ' ', rStr, ' 0 0 1 ', x2, ' ', y, ' Z" fill="', BG, '"/>',
            '<path d="M500 430 L', x1, ' ', y, ' M500 430 L', x2, ' ', y, '" stroke="', scarCol, '" stroke-width="', ew, '" opacity="0.88"/>',
            '<path d="M', x1, ' ', y, ' A', rStr, ' ', rStr, ' 0 0 1 ', x2, ' ', y, '" fill="none" stroke="', scarCol, '" stroke-width="', ew, '" opacity="0.55"/>'
        );
        return string.concat(body, "</g>");
    }

    function _voidScar(uint8 tier, uint256 seed) internal pure returns (string memory) {
        string memory a = ((seed >> 8) % 360).toString();
        uint256 r = tier == 4 ? 350 : tier == 3 ? 310 : tier == 2 ? 270 : tier == 1 ? 220 : 160;
        uint256 halfW = tier == 4 ? 108 : tier == 3 ? 88 : tier == 2 ? 68 : tier == 1 ? 48 : 28;
        string memory x1 = (500 - halfW).toString();
        string memory x2 = (500 + halfW).toString();
        string memory y = (430 - r).toString();
        string memory rStr = r.toString();
        return string.concat(
            '<g data-nara="scar void-incision" transform="rotate(', a, ' 500 430)">',
            '<path d="M500 430 L', x1, ' ', y, ' A', rStr, ' ', rStr,
            ' 0 0 1 ', x2, ' ', y, ' Z" fill="none" stroke="', IVORY,
            '" stroke-width="2.2" stroke-dasharray="8 12" opacity="0.36"/>',
            '<path d="M500 430 L', x1, ' ', y, ' M500 430 L', x2, ' ', y,
            '" stroke="', MUTED, '" stroke-width="1.4" opacity="0.46"/></g>'
        );
    }

    function _axis(uint8 tier, string memory col) internal pure returns (string memory) {
        string memory axis = string.concat('<path d="M500 170V690 M246 430H754" stroke="', col, '" stroke-width="2" opacity="0.32"/>');
        if (tier >= 3) {
            axis = string.concat(axis, '<circle cx="500" cy="430" r="330" fill="none" stroke="', col, '" stroke-width="7" stroke-dasharray="3 30" opacity="0.34"/>');
        }
        return axis;
    }

    function _sigil(string memory col, uint8 tier, uint256 seed) internal pure returns (string memory) {
        bool isGoldSigil = (seed % 100000 == 7777);
        string memory pulse = tier >= 3
            ? '<animate attributeName="stroke-opacity" values="0.68;0.92;0.68" dur="18s" repeatCount="indefinite"/>'
            : "";
        if (isGoldSigil) {
            return _goldSigil(pulse);
        }
        return string.concat(
            '<g stroke="', col, '" stroke-width="7" stroke-linecap="round" fill="none">', pulse,
            '<path d="M476 478V382"/><path d="M524 478V382"/><path d="M476 382L524 478"/></g>',
            '<circle cx="500" cy="431" r="6.5" fill="', col, '" opacity="0.9"/>'
        );
    }

    function _goldSigil(string memory pulse) internal pure returns (string memory) {
        string memory gold = "#E5B25D";
        return string.concat(
            '<g data-nara="golden-sigil">',
            '<circle cx="500" cy="430" r="142" fill="', gold, '" opacity="0.10" filter="url(#b)"/>',
            '<circle cx="500" cy="430" r="119" fill="none" stroke="', gold,
            '" stroke-width="2.4" stroke-dasharray="5 13" opacity="0.46"/>',
            '<circle cx="500" cy="430" r="84" fill="none" stroke="', gold,
            '" stroke-width="1.8" opacity="0.52"/>',
            '<g stroke="', gold, '" stroke-width="17" stroke-linecap="round" fill="none">', pulse,
            '<path d="M462 494V366"/><path d="M538 494V366"/><path d="M462 366L538 494"/></g>',
            '<g stroke="#7A4B19" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.58">',
            '<path d="M466 492V370"/><path d="M542 492V370"/><path d="M466 370L542 492"/></g>',
            '<g stroke="', IVORY, '" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.92">',
            '<path d="M456 486V360"/><path d="M532 486V360"/><path d="M456 360L532 486"/></g>',
            '<circle cx="500" cy="431" r="13" fill="', gold, '"/>',
            '<circle cx="495" cy="426" r="5.5" fill="', IVORY, '"/>',
            "</g>"
        );
    }

    function _historyMarks(uint256 seed, uint32 claimCount, uint32 extendCount, string memory col)
        internal
        pure
        returns (string memory)
    {
        return string.concat(_claimPhyllotaxis(seed, claimCount, col), _extensionSediment(extendCount, col));
    }

    function _claimPhyllotaxis(uint256 seed, uint32 claimCount, string memory col)
        internal
        pure
        returns (string memory)
    {
        uint256 nodes = claimCount > 34 ? 34 : claimCount;
        if (nodes == 0) return "";
        uint256 offset = seed % 37;
        string memory out = '<g data-nara="claim-phyllotaxis">';
        for (uint256 i; i < nodes; ++i) {
            uint256 radius = 132 + i * 5;
            uint256 angle = 24 + ((offset + i * 137) % 190);
            out = string.concat(
                out,
                '<circle cx="500" cy="', (430 - radius).toString(), '" r="',
                (i + 1 == nodes ? "4" : "3"), '" fill="', col, '" opacity="',
                _actionOpacity(i, nodes), '" transform="rotate(', angle.toString(), ' 500 430)"/>'
            );
        }
        return string.concat(out, "</g>");
    }

    function _extensionSediment(uint32 extendCount, string memory col)
        internal
        pure
        returns (string memory)
    {
        uint256 marks = extendCount > 22 ? 22 : extendCount;
        if (marks == 0) return "";
        string memory out = "";
        for (uint256 i; i < marks; ++i) {
            out = string.concat(
                out,
                '<path d="M', (792 + (i % 3) * 22).toString(), " ", (642 + i * 7).toString(),
                "h", (52 + ((i * 11) % 34)).toString(), '" stroke="', col,
                '" stroke-width="2" opacity="', _actionOpacity(i, marks), '"/>'
            );
        }
        return string.concat('<g data-nara="extension-sediment">', out, "</g>");
    }

    function _actionLedger(uint32 claimCount, uint32 extendCount, string memory col)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '<text data-nara="action-ledger" x="940" y="790" fill="', col,
            '" font-family="\'IBM Plex Mono\',monospace" font-size="12" letter-spacing="1" text-anchor="end" opacity="0.62">CLAIMS: ',
            uint256(claimCount).toString(), " | EXTENDS: ", uint256(extendCount).toString(), "</text>",
            '<text data-nara="compact-action-counter" x="940" y="760" fill="', col,
            '" font-family="\'IBM Plex Mono\',monospace" font-size="24" font-weight="700" letter-spacing="2" text-anchor="end" opacity="0.78">C ',
            uint256(claimCount).toString(), " / E ", uint256(extendCount).toString(), "</text>"
        );
    }

    function _actionOpacity(uint256 i, uint256 total) internal pure returns (string memory) {
        if (total <= 4) return "0.24";
        if (i + 4 >= total) return "0.14";
        if (i < 8) return "0.26";
        if (i < 18) return "0.2";
        return "0.16";
    }

    function _statusMarker(uint8 tier, string memory col) internal pure returns (string memory) {
        return string.concat(
            '<circle cx="76" cy="86" r="10" fill="', col, '" opacity="0.82"', tier >= 2 ? ' filter="url(#b)"' : "", "/>",
            '<text x="102" y="95" fill="', IVORY, '" font-family="\'Satoshi\',sans-serif" font-size="28" font-weight="700" letter-spacing="2">',
            _upper(_tierName(tier)), "</text>",
            '<text x="102" y="124" fill="', MUTED, '" font-family="\'IBM Plex Mono\',monospace" font-size="14" letter-spacing="3">CORE / ',
            _upper(_coreClass(tier)), "</text>"
        );
    }

    function _identityBand(uint256 tokenId, uint256 positionId, uint8 tier, uint256 seed, string memory col)
        internal
        pure
        returns (string memory)
    {
        bool isDoubleStrike = (seed % 10000 == 777);
        string memory left = string.concat(
            '<path d="M40 812H960" stroke="', col, '" stroke-width="1" opacity="0.38"/>',
            '<path d="M96 832H300" stroke="', col, '" stroke-width="2" opacity="0.28"/>',
            isDoubleStrike
                ? string.concat(
                    '<g data-nara="double-strike" font-family="\'Satoshi\', \'Inter\', system-ui, -apple-system, sans-serif" font-size="104" font-weight="bold" letter-spacing="6">',
                    '<text x="42" y="910" fill="', COPPER, '" opacity="0.58">NARA</text>',
                    '<text x="52" y="918" fill="', BRASS, '" opacity="0.68">NARA</text>',
                    '<text x="58" y="922" fill="', IVORY, '">NARA</text>',
                    '</g><path d="M52 934H350" stroke="', BRASS,
                    '" stroke-width="2" stroke-dasharray="6 8" opacity="0.70"/>'
                )
                : string.concat(
                    '<text x="58" y="922" fill="', IVORY, '" font-family="\'Satoshi\', \'Inter\', system-ui, -apple-system, sans-serif" font-size="104" font-weight="bold" letter-spacing="6">NARA</text>'
                ),
            '<text x="60" y="958" fill="', MUTED, '" font-family="\'IBM Plex Mono\',monospace" font-size="14" letter-spacing="4">ON-CHAIN / RENDERER V5 / MANUAL</text>'
        );

        string memory right = string.concat(
            '<text x="940" y="856" fill="', IVORY, '" font-family="\'IBM Plex Mono\',monospace" font-size="22" letter-spacing="2" text-anchor="end">POSITION ', _pad6(positionId), "</text>",
            '<text x="940" y="892" fill="', IVORY, '" font-family="\'IBM Plex Mono\',monospace" font-size="20" letter-spacing="2" text-anchor="end">TOKEN ', _pad6(tokenId), "</text>",
            '<text x="940" y="928" fill="', col, '" font-family="\'IBM Plex Mono\',monospace" font-size="18" letter-spacing="2" text-anchor="end">STATE ', _upper(_tierName(tier)), "</text>"
        );

        return string.concat(left, right);
    }

    function _tierName(uint8 tier) internal pure returns (string memory) {
        if (tier == 4) return "Apex";
        if (tier == 3) return "One ETH Mark";
        if (tier == 2) return "Rewarded";
        if (tier == 1) return "Activated";
        return "New";
    }

    function _coreClass(uint8 tier) internal pure returns (string memory) {
        if (tier == 4) return "Radiant";
        if (tier == 3) return "Calibrated";
        if (tier == 2) return "Marked";
        if (tier == 1) return "Active";
        return "Dormant";
    }

    function _tierColor(uint8 tier) internal pure returns (string memory) {
        if (tier == 4) return AMBER;
        if (tier == 3) return BRASS;
        if (tier == 2) return COPPER;
        if (tier == 1) return IRON;
        return MUTED;
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
