// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtGenesisPlateV1
/// @notice Stateless SVG plate for Genesis and Eternal NARA position NFTs.
contract NARAArtGenesisPlateV1 {
    using Strings for uint256;

    string internal constant BG = "#07090A";
    string internal constant LINE = "#26241F";
    string internal constant IVORY = "#D8D1BD";
    string internal constant MUTED = "#6F6B63";
    string internal constant COPPER = "#397C68";
    string internal constant BRASS = "#A88745";
    string internal constant PAPER = "#C7B98D";
    string internal constant SCAR = "#6E2924";

    uint256 public constant GENESIS_PLATE_VERSION = 1;

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
        tier = _clampTier(tier);
        string memory seal = isEternal ? BRASS : PAPER;
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img">',
            "<title>", isEternal ? "NARA Eternal Ledger #" : "NARA Genesis Archive #", _pad6(tokenId),
            "</title><desc>On-chain NARA Genesis proof-of-position archive plate.</desc>",
            _defs(),
            _basePlate(seal),
            _ledger(seed, seal),
            _archiveAccretion(seed, claimCount, extendCount, seal),
            _sealField(isEternal, tier, seed, seal),
            _metadataBand(tokenId, positionId, roundId, tierId, seed, isEternal, mintedAt, claimCount, extendCount, seal),
            "</svg>"
        );
    }

    function _defs() internal pure returns (string memory) {
        return string.concat(
            '<defs><radialGradient id="ag" cx="50%" cy="50%" r="75%">',
            '<stop offset="0%" stop-color="#32291E" stop-opacity="0.85"/>',
            '<stop offset="100%" stop-color="#08080A"/></radialGradient></defs>'
        );
    }

    function _basePlate(string memory seal) internal pure returns (string memory) {
        return string.concat(
            '<rect width="1000" height="1000" fill="url(#ag)"/>',
            '<rect x="24" y="24" width="952" height="952" rx="16" fill="none" stroke="', LINE, '" stroke-width="2"/>',
            '<rect x="32" y="32" width="936" height="732" rx="12" fill="none" stroke="', seal,
            '" stroke-width="1.0" opacity="0.22"/>',
            '<path d="M48 792H952" stroke="', seal, '" stroke-width="1.0" opacity="0.30"/>',
            '<text x="64" y="76" fill="', seal,
            '" font-family="\'Satoshi\',sans-serif" font-size="32" font-weight="700" letter-spacing="8">GENESIS ARCHIVE</text>',
            '<text x="66" y="108" fill="', MUTED,
            '" font-family="\'IBM Plex Mono\',monospace" font-size="12" letter-spacing="3">FULLY ON-CHAIN POSITION RECORD</text>'
        );
    }

    function _ledger(uint256 seed, string memory seal) internal pure returns (string memory) {
        string memory out = "";
        for (uint256 i; i < 7; ++i) {
            uint256 y = 206 + i * 52;
            uint256 seedSeg = (seed >> (i * 12)) & 0xFFF;
            out = string.concat(out, _ledgerRow(y, 92 + (seedSeg % 180), seal));
        }
        return out;
    }

    function _ledgerRow(uint256 y, uint256 width, string memory seal) internal pure returns (string memory) {
        return string.concat(_ledgerGuide(y), _ledgerInk(y, width, seal));
    }

    function _ledgerGuide(uint256 y) internal pure returns (string memory) {
        string memory yy = y.toString();
        string memory y2 = (y - 2).toString();
        string memory y4 = (y - 4).toString();
        return string.concat(
            '<path d="M120 ', yy, 'H484" stroke="', IVORY,
            '" stroke-width="0.8" stroke-dasharray="1 3" opacity="0.25"/>',
            '<path d="M120 ', y2, 'H484" stroke="', IVORY,
            '" stroke-width="2.0" stroke-dasharray="1 7" opacity="0.18"/>',
            '<path d="M484 ', y4, 'v8" stroke="', IVORY, '" stroke-width="1.0" opacity="0.3"/>',
            '<rect x="120" y="', y4, '" width="14" height="7" fill="', IVORY, '" opacity="0.34"/>'
        );
    }

    function _ledgerInk(uint256 y, uint256 width, string memory seal) internal pure returns (string memory) {
        string memory yy = y.toString();
        string memory x2 = (156 + width).toString();
        return string.concat(
            '<path d="M156 ', yy, "H", x2, '" stroke="', seal, '" stroke-width="1.6" opacity="0.5"/>',
            '<path d="M156 ', yy, "H", x2,
            '" stroke="', seal, '" stroke-width="2.6" stroke-dasharray="2 3" opacity="0.42"/>'
        );
    }

    function _archiveAccretion(uint256 seed, uint32 claimCount, uint32 extendCount, string memory seal)
        internal
        pure
        returns (string memory)
    {
        uint256 marks = claimCount + extendCount;
        if (marks == 0) return "";
        if (marks > 18) marks = 18;

        string memory out = "";
        for (uint256 i; i < marks; ++i) {
            out = string.concat(out, _accretionMark(146 + ((seed >> (i % 8)) % 22), 230 + (i * 22), seal));
        }
        return string.concat('<g data-nara="archive-accretion" opacity="0.45">', out, "</g>");
    }

    function _accretionMark(uint256 x, uint256 y, string memory seal) internal pure returns (string memory) {
        return string.concat(
            '<circle cx="', x.toString(), '" cy="', y.toString(), '" r="2" fill="', seal, '"/>'
        );
    }

    function _sealField(bool isEternal, uint8 tier, uint256 seed, string memory seal) internal pure returns (string memory) {
        return string.concat(
            _stratifiedRose(742, 430, tier, isEternal, seal),
            '<circle cx="742" cy="430" r="124" fill="none" stroke="', seal,
            '" stroke-width="4" stroke-dasharray="2 18" opacity="0.34"/>',
            _archiveScar(seed),
            _goldArchiveSigil(seed),
            isEternal
                ? string.concat(
                    '<circle cx="742" cy="430" r="20" fill="none" stroke="', BRASS,
                    '" stroke-width="4.5" opacity="0.84"/>',
                    '<circle cx="742" cy="430" r="42" fill="none" stroke="', BRASS,
                    '" stroke-width="3.5" opacity="0.62"/>',
                    '<circle cx="742" cy="430" r="64" fill="none" stroke="', BRASS,
                    '" stroke-width="2" opacity="0.36"/>'
                )
                : string.concat('<circle cx="742" cy="430" r="26" fill="', IVORY, '" opacity="0.9"/>'),
            '<rect x="622" y="636" width="240" height="44" rx="6" fill="none" stroke="', seal,
            '" stroke-width="1.5" opacity="0.7"/>',
            '<text x="742" y="665" fill="', seal,
            '" font-family="\'Satoshi\',sans-serif" font-size="20" font-weight="700" letter-spacing="5" text-anchor="middle">',
            isEternal ? "ETERNAL LEDGER" : "GENESIS ARCHIVE", "</text>"
        );
    }

    function _archiveScar(uint256 seed) internal pure returns (string memory) {
        if (seed % 1000 == 123) return _voidArchiveScar(seed);

        string memory angle = (24 + ((seed >> 8) % 34)).toString();
        string memory scarCol = (seed % 100 < 5) ? BRASS : (seed % 100 >= 5 && seed % 100 < 10) ? COPPER : SCAR;
        return string.concat(
            '<g data-nara="archive-scar" transform="rotate(', angle, ' 742 430)">',
            '<path d="M742 430 L672 230 A210 210 0 0 1 812 230 Z" fill="url(#ag)"/>',
            '<path d="M742 430 L672 230 M742 430 L812 230" stroke="', scarCol,
            '" stroke-width="2.4" opacity="0.64"/>',
            '<path d="M672 230 A210 210 0 0 1 812 230" fill="none" stroke="', scarCol,
            '" stroke-width="2.4" opacity="0.46"/></g>'
        );
    }

    function _voidArchiveScar(uint256 seed) internal pure returns (string memory) {
        string memory angle = (24 + ((seed >> 8) % 34)).toString();
        return string.concat(
            '<g data-nara="archive-scar void-incision" transform="rotate(', angle, ' 742 430)">',
            '<path d="M742 430 L672 230 A210 210 0 0 1 812 230 Z" fill="none" stroke="',
            IVORY, '" stroke-width="2.0" stroke-dasharray="8 12" opacity="0.34"/>',
            '<path d="M742 430 L672 230 M742 430 L812 230" stroke="', MUTED,
            '" stroke-width="1.2" opacity="0.44"/></g>'
        );
    }

    function _goldArchiveSigil(uint256 seed) internal pure returns (string memory) {
        if (seed % 100000 != 7777) return "";
        return string.concat(
            '<g data-nara="golden-sigil">',
            '<circle cx="742" cy="430" r="78" fill="#E5B25D" opacity="0.08"/>',
            '<circle cx="742" cy="430" r="66" fill="none" stroke="#E5B25D" stroke-width="2.2" stroke-dasharray="5 11" opacity="0.56"/>',
            '<circle cx="742" cy="430" r="44" fill="none" stroke="#E5B25D" stroke-width="2" opacity="0.62"/>',
            '<path d="M724 466V394 M760 466V394 M724 394L760 466" stroke="#E5B25D" stroke-width="8" stroke-linecap="round" fill="none"/>',
            '<path d="M721 462V390 M757 462V390 M721 390L757 462" stroke="', IVORY,
            '" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.88"/>',
            "</g>"
        );
    }

    function _stratifiedRose(
        uint256 cx,
        uint256 cy,
        uint8 tier,
        bool isEternal,
        string memory seal
    ) internal pure returns (string memory) {
        if (tier == 0) return "";

        uint256 baseRx = 100 + uint256(tier) * 20;
        uint256 baseRy = (baseRx * 50) / 100;
        uint256 brassRx = (baseRx * 55) / 100;
        uint256 brassRy = (baseRx * 55 * 50) / 10000;
        uint256 sealRx = (baseRx * 80) / 100;
        uint256 sealRy = (baseRx * 80 * 50) / 10000;
        uint256 steps = 6 + uint256(tier) * 4;

        return string.concat(
            _rose(cx, cy, brassRx, brassRy, steps, BRASS, "0.18"),
            _rose(cx, cy, sealRx, sealRy, steps, seal, "0.36"),
            _rose(cx, cy, baseRx, baseRy, steps, IVORY, isEternal ? "0.45" : "0.28")
        );
    }

    function _rose(
        uint256 cx,
        uint256 cy,
        uint256 rx,
        uint256 ry,
        uint256 steps,
        string memory col,
        string memory op
    ) internal pure returns (string memory) {
        string memory out = "";
        for (uint256 i; i < steps; ++i) {
            out = string.concat(out, _ellipse(cx, cy, rx, ry, (i * 180) / steps, col, op));
        }
        return out;
    }

    function _ellipse(
        uint256 cx,
        uint256 cy,
        uint256 rx,
        uint256 ry,
        uint256 rot,
        string memory col,
        string memory op
    ) internal pure returns (string memory) {
        string memory cxs = cx.toString();
        string memory cys = cy.toString();
        return string.concat(
            '<ellipse cx="', cxs, '" cy="', cys, '" rx="', rx.toString(), '" ry="', ry.toString(),
            '" fill="none" stroke="', col, '" stroke-width="0.8" opacity="', op,
            '" transform="rotate(', rot.toString(), " ", cxs, " ", cys, ')"/>'
        );
    }

    function _metadataBand(
        uint256 tokenId,
        uint256 positionId,
        uint16 roundId,
        uint16 tierId,
        uint256 seed,
        bool isEternal,
        uint64 mintedAt,
        uint32 claimCount,
        uint32 extendCount,
        string memory seal
    ) internal pure returns (string memory) {
        bool isDoubleStrike = (seed % 10000 == 777);
        return string.concat(
            _metadataLeft(seal, isDoubleStrike, isEternal, mintedAt),
            _actionLedger(claimCount, extendCount, seal),
            _identityRows(tokenId, positionId, roundId, tierId, seal)
        );
    }

    function _metadataLeft(string memory seal, bool isDoubleStrike, bool isEternal, uint64 mintedAt)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '<path d="M96 832H300" stroke="', seal, '" stroke-width="2" opacity="0.28"/>',
            _naraWordmark(isDoubleStrike),
            '<text x="60" y="958" fill="', MUTED,
            '" font-family="\'IBM Plex Mono\',monospace" font-size="14" letter-spacing="4">ON-CHAIN / RENDERER V5 / ',
            isEternal ? "ETERNAL" : "GENESIS", " / ", uint256(mintedAt).toString(), "</text>"
        );
    }

    function _naraWordmark(bool isDoubleStrike) internal pure returns (string memory) {
        string memory mark = string.concat(
            '<text x="58" y="922" fill="', IVORY,
            '" font-family="\'Satoshi\',sans-serif" font-size="110" font-weight="700" letter-spacing="6">NARA</text>'
        );
        if (!isDoubleStrike) return mark;
        return string.concat(
            '<g data-nara="double-strike">',
            '<text x="42" y="910" fill="', COPPER,
            '" font-family="\'Satoshi\',sans-serif" font-size="110" font-weight="700" letter-spacing="6" opacity="0.58">NARA</text>',
            '<text x="52" y="918" fill="', BRASS,
            '" font-family="\'Satoshi\',sans-serif" font-size="110" font-weight="700" letter-spacing="6" opacity="0.68">NARA</text>',
            mark,
            '</g><path d="M52 934H350" stroke="', BRASS,
            '" stroke-width="2" stroke-dasharray="6 8" opacity="0.70"/>'
        );
    }

    function _actionLedger(uint32 claimCount, uint32 extendCount, string memory seal) internal pure returns (string memory) {
        return string.concat(
            '<text data-nara="action-ledger" x="940" y="808" fill="', seal,
            '" font-family="\'IBM Plex Mono\',monospace" font-size="12" letter-spacing="1" text-anchor="end" opacity="0.62">CLAIMS: ',
            uint256(claimCount).toString(), " | EXTENDS: ", uint256(extendCount).toString(), "</text>",
            '<text data-nara="compact-action-counter" x="940" y="780" fill="', seal,
            '" font-family="\'IBM Plex Mono\',monospace" font-size="22" font-weight="700" letter-spacing="2" text-anchor="end" opacity="0.78">C ',
            uint256(claimCount).toString(), " / E ", uint256(extendCount).toString(), "</text>"
        );
    }

    function _identityRows(uint256 tokenId, uint256 positionId, uint16 roundId, uint16 tierId, string memory seal)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            _identityRow("850", "20", "POSITION ", _pad6(positionId), IVORY),
            _identityRow("884", "18", "TOKEN ", _pad6(tokenId), IVORY),
            _identityRow("918", "16", "ROUND ", _roundTier(roundId, tierId), seal)
        );
    }

    function _identityRow(
        string memory y,
        string memory size,
        string memory label,
        string memory value,
        string memory col
    ) internal pure returns (string memory) {
        return string.concat(
            '<text x="940" y="', y, '" fill="', col,
            '" font-family="\'IBM Plex Mono\',monospace" font-size="', size,
            '" letter-spacing="2" text-anchor="end">', label, value, "</text>"
        );
    }

    function _roundTier(uint16 roundId, uint16 tierId) internal pure returns (string memory) {
        return string.concat(uint256(roundId).toString(), " / TIER ", uint256(tierId).toString());
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
