// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAPositionArtV1
/// @notice Fully on-chain art + metadata builder for NARA position NFTs, deployed as a separate
///         linked library so the renderer contract stays small. Pure/stateless. All drivers are
///         realized facts (earnings tier) or mint-fixed (Genesis/Eternal) — never live values —
///         so cached images stay valid and the art encodes facts/provenance, not expected return.
/// @dev `public` entry points (svg/name/attributes/collectionSVG/moduleName) deploy in this library
///      and are reached from the renderer via DELEGATECALL (linked at deploy). Internal helpers are
///      inlined within the library's own bytecode.
library NARAPositionArtV1 {
    using Strings for uint256;

    // ---- Artifact palette: mineral, aged, anti-neon. Color is earned by state. ----
    string internal constant BG = "#07090A";     // NARA black (charcoal)
    string internal constant PLATE = "#111417";   // smoked graphite panel
    string internal constant LINE = "#26241F";    // warm etched structural line
    string internal constant IVORY = "#D8D1BD";    // bone ivory (lines + text)
    string internal constant MUTED = "#6F6B63";    // warm ash graphite — dormant, no blue
    string internal constant IRON = "#8C8A82";     // lit smoked steel — activated, neutral (no blue)
    string internal constant COPPER = "#397C68";   // oxidized copper green (productive)
    string internal constant BRASS = "#A88745";    // old brass (recognized rare)
    string internal constant AMBER = "#C2772E";    // peat / burned amber (apex + signature)
    string internal constant PAPER = "#C7B98D";    // aged paper ivory (Genesis archive)
    string internal constant SCAR = "#6E2924";     // dark blood oxide (the scar mark)

    uint8 internal constant MODULE_COUNT = 6;

    // ======================================================================
    // Public entry points (called by the renderer)
    // ======================================================================
    function svg(
        uint8 tier,
        uint256 seed,
        uint8 moduleIdx,
        bool isGenesis,
        bool isEternal,
        uint256 tokenId,
        uint256 positionId
    ) public pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img">',
            "<title>NARA Position #", tokenId.toString(),
            "</title><desc>On-chain NARA proof-of-position instrument. Identity fixed at mint; structure escalates with realized rewards.</desc>",
            _defs(tier),
            _basePlate(),
            _lattice(seed),
            isGenesis ? _genesisField(isEternal, seed) : _coreField(tier, seed, moduleIdx),
            _glyphs(seed, tier),
            _statusMarker(tier),
            _seal(isGenesis, isEternal),
            _identityBand(tokenId, positionId, tier, isGenesis),
            "</svg>"
        );
    }

    function name(uint8 tier, bool isGenesis, bool isEternal, uint256 tokenId)
        public pure returns (string memory)
    {
        if (isEternal) return string.concat("NARA Eternal Ledger #", _pad6(tokenId));
        if (isGenesis) return string.concat("NARA Genesis Archive #", _pad6(tokenId));
        return string.concat("NARA Position #", _pad6(tokenId), " \\u00B7 ", _tierName(tier));
    }

    function attributes(
        uint8 tier,
        uint8 moduleIdx,
        bool isGenesis,
        bool isEternal,
        uint256 positionId,
        uint64 createdEpoch,
        uint16 roundId,
        uint16 tierId,
        uint32 mult,
        uint64 mintedAt
    ) public pure returns (string memory) {
        return string.concat(
            '{"display_type":"number","trait_type":"Position ID","value":', positionId.toString(),
            '},{"trait_type":"Yield Tier","value":"', _tierName(tier),
            '"},{"trait_type":"Core","value":"', _coreClass(tier),
            '"},{"trait_type":"Module","value":"', moduleName(moduleIdx),
            '"},{"trait_type":"Provenance","value":"', isGenesis ? "Genesis" : "Manual",
            '"},{"trait_type":"Storage","value":"Fully On Chain"',
            '},{"trait_type":"Renderer","value":"V4"',
            '},{"display_type":"number","trait_type":"Created Epoch","value":', uint256(createdEpoch).toString(),
            "}",
            _genesisAttributes(isGenesis, isEternal, roundId, tierId, mult, mintedAt),
            "]"
        );
    }

    function moduleName(uint8 index) public pure returns (string memory) {
        if (index == 0) return "Yield Arc";
        if (index == 1) return "Pressure Scar";
        if (index == 2) return "Orbit Field";
        if (index == 3) return "Ledger Fragment";
        if (index == 4) return "Streak Crown";
        return "Demand Trace";
    }

    function collectionSVG() public pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="', BG,
            '"/><circle cx="1190" cy="450" r="230" fill="none" stroke="', IVORY, '" stroke-width="2" opacity="0.4"/>',
            '<circle cx="1190" cy="450" r="58" fill="', AMBER, '"/>',
            '<path d="M1190 450 L1118 228 A232 232 0 0 1 1262 228 Z" fill="', BG, '"/>',
            '<path d="M1190 450 L1118 228 M1190 450 L1262 228" stroke="', SCAR, '" stroke-width="3" opacity="0.85"/>',
            '<text x="120" y="432" fill="', IVORY, '" font-family="Arial,Helvetica,sans-serif" font-size="160" font-weight="700">NARA</text>',
            '<text x="128" y="520" fill="', AMBER, '" font-family="monospace" font-size="38" letter-spacing="6">PROOF OF POSITION</text></svg>'
        );
    }

    // ======================================================================
    // Labels
    // ======================================================================
    function _tierName(uint8 tier) internal pure returns (string memory) {
        if (tier == 4) return "Apex";
        if (tier == 3) return "One ETH Club";
        if (tier == 2) return "Productive";
        if (tier == 1) return "Earning";
        return "New";
    }

    function _coreClass(uint8 tier) internal pure returns (string memory) {
        if (tier == 4) return "Radiant";
        if (tier == 3) return "Calibrated";
        if (tier == 2) return "Productive";
        if (tier == 1) return "Active";
        return "Dormant";
    }

    /// @dev Each tier is a material state, not a neon color: ash → cold iron → oxidized copper →
    ///      old brass → peat amber. Low tiers are nearly monochrome bone/graphite.
    function _tierColor(uint8 tier) internal pure returns (string memory) {
        if (tier == 4) return AMBER;
        if (tier == 3) return BRASS;
        if (tier == 2) return COPPER;
        if (tier == 1) return IRON;
        return MUTED;
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

    function _upper(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i; i < b.length; ++i) {
            if (b[i] >= 0x61 && b[i] <= 0x7A) b[i] = bytes1(uint8(b[i]) - 32);
        }
        return string(b);
    }

    // ======================================================================
    // SVG building blocks
    // ======================================================================
    function _ring(uint256 r, string memory col, string memory sw, string memory op)
        internal pure returns (string memory)
    {
        return string.concat('<circle cx="500" cy="430" r="', r.toString(),
            '" fill="none" stroke="', col, '" stroke-width="', sw, '" opacity="', op, '"/>');
    }

    function _ringDash(uint256 r, string memory col, string memory sw, string memory dash, string memory op)
        internal pure returns (string memory)
    {
        return string.concat('<circle cx="500" cy="430" r="', r.toString(),
            '" fill="none" stroke="', col, '" stroke-width="', sw, '" stroke-dasharray="', dash, '" opacity="', op, '"/>');
    }

    function _defs(uint8 tier) internal pure returns (string memory) {
        string memory col = _tierColor(tier);
        // Restrained, burned glow — material radiation, not screen bloom.
        string memory inner = tier >= 4 ? "0.6" : tier >= 3 ? "0.46" : tier >= 2 ? "0.36" : tier >= 1 ? "0.24" : "0.12";
        string memory mid = tier >= 4 ? "0.3" : tier >= 3 ? "0.22" : tier >= 2 ? "0.16" : tier >= 1 ? "0.1" : "0.05";
        return string.concat(
            '<defs><radialGradient id="cg" cx="50%" cy="50%" r="50%">',
            '<stop offset="0%" stop-color="', col, '" stop-opacity="', inner, '"/>',
            '<stop offset="55%" stop-color="', col, '" stop-opacity="', mid, '"/>',
            '<stop offset="100%" stop-color="', col, '" stop-opacity="0"/></radialGradient>',
            '<radialGradient id="vg" cx="50%" cy="40%" r="80%">',
            '<stop offset="50%" stop-color="#000000" stop-opacity="0"/>',
            '<stop offset="100%" stop-color="#000000" stop-opacity="0.6"/></radialGradient>',
            '<pattern id="grid" width="58" height="58" patternUnits="userSpaceOnUse">',
            '<path d="M58 0H0V58" fill="none" stroke="', LINE, '" stroke-width="1.5"/></pattern>',
            '<linearGradient id="disc" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#1B1D20"/><stop offset="100%" stop-color="#060708"/></linearGradient>',
            '<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.035"/>',
            '<stop offset="100%" stop-color="#000000" stop-opacity="0.32"/></linearGradient>',
            '<filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10"/></filter>',
            // dusty grain — desaturated fractal noise, for found-artifact material feel
            '<filter id="gr"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/><feColorMatrix in="n" type="saturate" values="0"/></filter>',
            "</defs>"
        );
    }

    function _basePlate() internal pure returns (string memory) {
        return string.concat(
            '<rect width="1000" height="1000" fill="', BG, '"/>',
            '<rect x="44" y="44" width="912" height="744" fill="url(#grid)" opacity="0.34"/>',
            '<rect width="1000" height="1000" fill="url(#vg)"/><rect width="1000" height="1000" fill="url(#glass)"/>',
            '<rect width="1000" height="1000" filter="url(#gr)" opacity="0.05"/>',
            '<rect x="22" y="22" width="956" height="956" rx="20" fill="none" stroke="', LINE, '" stroke-width="3"/>',
            '<path d="M40 956V40H960" fill="none" stroke="#FFFFFF" stroke-opacity="0.045" stroke-width="1.5"/>',
            '<rect x="40" y="40" width="920" height="920" rx="14" fill="none" stroke="', LINE, '" stroke-width="1"/>'
        );
    }

    function _coreField(uint8 tier, uint256 seed, uint8 moduleIdx) internal pure returns (string memory) {
        string memory col = _tierColor(tier);
        uint256 tilt = 14 + (seed % 28);
        string memory glowR = tier >= 4 ? "384" : tier >= 3 ? "348" : tier >= 2 ? "306" : tier >= 1 ? "270" : "234";
        string memory pulse = tier >= 2
            ? '<animate attributeName="opacity" values="0.8;1;0.8" dur="6s" repeatCount="indefinite"/>'
            : "";
        return string.concat(
            '<circle cx="500" cy="430" r="', glowR, '" fill="url(#cg)" filter="url(#b)">', pulse, "</circle>",
            _orbits(tier, col, tilt),
            _rings(tier, col),
            _scar(tier, seed),
            _axis(tier, col),
            _energy(tier),
            _module(moduleIdx, tier, col),
            '<circle cx="500" cy="430" r="104" fill="url(#disc)"/>',
            '<circle cx="500" cy="430" r="104" fill="none" stroke="', col, '" stroke-width="4.5"/>',
            '<circle cx="500" cy="430" r="70" fill="none" stroke="', col, '" stroke-width="2" opacity="0.5"/>',
            _sigil(col, tier)
        );
    }

    function _scar(uint8 tier, uint256 seed) internal pure returns (string memory) {
        // The blood-oxide cut is NARA's signature mark — present on every card, always in dried
        // blood (SCAR), never neon. Width grows with tier; Apex adds an amber radiation spine.
        string memory a = ((seed >> 8) % 360).toString();
        string memory ew = tier >= 4 ? "5" : tier >= 2 ? "3.5" : "2.5";
        string memory body = string.concat(
            '<g transform="rotate(', a, ' 500 430)">',
            '<path d="M500 430 L392 97 A350 350 0 0 1 608 97 Z" fill="', BG, '"/>',
            '<path d="M500 430 L392 97 M500 430 L608 97" stroke="', SCAR, '" stroke-width="', ew, '" opacity="0.95"/>',
            '<path d="M392 97 A350 350 0 0 1 608 97" fill="none" stroke="', SCAR, '" stroke-width="', ew, '" opacity="0.7"/>'
        );
        if (tier >= 4) body = string.concat(body, '<path d="M500 430 L500 84" stroke="', AMBER, '" stroke-width="2.5" opacity="0.7"/>');
        return string.concat(body, "</g>");
    }

    function _sigil(string memory col, uint8 tier) internal pure returns (string memory) {
        string memory pulse = tier >= 3
            ? '<animate attributeName="stroke-opacity" values="0.75;1;0.75" dur="5s" repeatCount="indefinite"/>'
            : "";
        return string.concat(
            '<g stroke="', col, '" stroke-width="7" stroke-linecap="round" fill="none">', pulse,
            '<path d="M476 478V382"/><path d="M524 478V382"/><path d="M476 382L524 478"/></g>',
            '<circle cx="500" cy="431" r="6.5" fill="', col, '"/>'
        );
    }

    function _rings(uint8 tier, string memory col) internal pure returns (string memory) {
        string memory r = _ring(160, col, "8", "0.95");
        if (tier >= 2) r = string.concat(r, _ring(214, col, "5.5", "0.78"));
        if (tier >= 3) r = string.concat(r, _ring(264, col, "4.5", "0.62"));
        if (tier >= 4) r = string.concat(r, _ring(312, col, "4", "0.5"), _ring(340, col, "2", "0.3"));
        string memory dash = tier >= 4 ? "2 14" : tier >= 3 ? "2 22" : tier >= 2 ? "2 32" : "2 46";
        return string.concat(r, _ringDash(188, col, "12", dash, tier >= 1 ? "0.5" : "0.3"));
    }

    function _orbits(uint8 tier, string memory col, uint256 tilt) internal pure returns (string memory) {
        if (tier < 2) return "";
        string memory t = tilt.toString();
        string memory spin = tier >= 3
            ? string.concat('<animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 500 430" to="360 500 430" dur="', tier >= 4 ? "70s" : "100s", '" repeatCount="indefinite"/>')
            : "";
        string memory body = string.concat(
            '<ellipse cx="500" cy="430" rx="300" ry="128" fill="none" stroke="', col, '" stroke-width="3" opacity="0.66" transform="rotate(', t, ' 500 430)"/>'
        );
        if (tier >= 3) body = string.concat(body, '<ellipse cx="500" cy="430" rx="356" ry="150" fill="none" stroke="', col, '" stroke-width="2.5" opacity="0.52" transform="rotate(-', t, ' 500 430)"/>');
        if (tier >= 4) body = string.concat(body, '<ellipse cx="500" cy="430" rx="408" ry="172" fill="none" stroke="', col, '" stroke-width="2.5" opacity="0.44" transform="rotate(', t, ' 500 430)"/>');
        return string.concat('<g>', spin, body, "</g>");
    }

    function _axis(uint8 tier, string memory col) internal pure returns (string memory) {
        string memory axis = string.concat('<path d="M500 170V690 M246 430H754" stroke="', col, '" stroke-width="2.5" opacity="0.6"/>');
        if (tier >= 3) axis = string.concat(axis, _ringDash(330, BRASS, "18", "3 30", "0.85"));
        return axis;
    }

    function _energy(uint8 tier) internal pure returns (string memory) {
        if (tier == 2) {
            return '<circle cx="500" cy="430" r="200" fill="none" stroke="#397C68" stroke-width="10" stroke-linecap="round" stroke-dasharray="230 980" transform="rotate(-50 500 430)" opacity="0.95"/>';
        }
        if (tier == 4) {
            return string.concat(
                '<circle cx="500" cy="430" r="312" fill="none" stroke="#A85F22" stroke-width="3" opacity="0.4">',
                '<animate attributeName="opacity" values="0.22;0.5;0.22" dur="8s" repeatCount="indefinite"/></circle>'
            );
        }
        return "";
    }

    function _lattice(uint256 seed) internal pure returns (string memory) {
        string memory nodes;
        for (uint256 i; i < 5; ++i) {
            uint256 a = (seed >> (i * 5)) % 360;
            uint256 r = 150 + ((seed >> (i * 7)) % 190);
            nodes = string.concat(nodes,
                '<g transform="rotate(', a.toString(), ' 500 430)"><circle cx="500" cy="',
                (430 - r).toString(), '" r="3.5" fill="', IVORY, '" opacity="0.22"/></g>');
        }
        return string.concat(_ring(332, LINE, "1", "0.55"), _ring(300, LINE, "1", "0.4"), nodes);
    }

    function _glyphs(uint256 seed, uint8 tier) internal pure returns (string memory) {
        // Fingerprint density grows with tier (8 -> 16) and shifts with tier (evolves on claim).
        uint256 count = 8 + uint256(tier) * 2;
        string memory g;
        for (uint256 i; i < count; ++i) {
            uint256 bits = ((seed >> (i * 3)) + tier) % 4;
            uint256 y = 176 + i * 34;
            if (bits == 0) g = string.concat(g, '<rect x="906" y="', y.toString(), '" width="16" height="3" fill="', MUTED, '" opacity="0.7"/>');
            else if (bits == 1) g = string.concat(g, '<rect x="912" y="', y.toString(), '" width="3" height="16" fill="', MUTED, '" opacity="0.7"/>');
            else if (bits == 2) g = string.concat(g, '<circle cx="913" cy="', (y + 7).toString(), '" r="3.5" fill="', MUTED, '" opacity="0.7"/>');
            else g = string.concat(g, '<rect x="905" y="', y.toString(), '" width="12" height="12" fill="none" stroke="', MUTED, '" stroke-width="1.5" opacity="0.6"/>');
        }
        return g;
    }

    /// @dev One distinct readout per deterministic NARA module, all in the same grammar.
    function _module(uint8 moduleIdx, uint8 tier, string memory col) internal pure returns (string memory) {
        if (moduleIdx == 0) {
            // Yield Arc — output arc band over the core
            return string.concat('<circle cx="500" cy="430" r="156" fill="none" stroke="', col, '" stroke-width="4" stroke-linecap="round" stroke-dasharray="120 800" transform="rotate(40 500 430)" opacity="0.8"/>');
        }
        if (moduleIdx == 1) {
            // Pressure Scar — calibrated pressure ticks beneath the core
            string memory bars;
            for (uint256 i; i < 7; ++i) {
                uint256 h = 10 + ((uint256(tier) + i) % 4) * 12;
                bars = string.concat(bars, '<rect x="', (404 + i * 32).toString(), '" y="', (700 - h).toString(), '" width="10" height="', h.toString(), '" fill="', col, '" opacity="0.7"/>');
            }
            return bars;
        }
        if (moduleIdx == 2) {
            // Orbit Field — coordinate nodes on the position ring
            return string.concat(
                '<circle cx="660" cy="430" r="7" fill="', col, '" opacity="0.85"/>',
                '<circle cx="340" cy="430" r="7" fill="', col, '" opacity="0.85"/>',
                '<circle cx="500" cy="270" r="7" fill="', col, '" opacity="0.85"/>'
            );
        }
        if (moduleIdx == 3) {
            // Ledger Fragment — three mini archive marks (provenance echo) under the core
            return string.concat(
                '<path d="M430 690H560 M430 708H540 M430 726H570" stroke="', col, '" stroke-width="2.5" opacity="0.6"/>',
                '<rect x="412" y="686" width="10" height="44" fill="', col, '" opacity="0.5"/>'
            );
        }
        if (moduleIdx == 4) {
            // Streak Crown — abstract crown of ring segments above the core
            return string.concat('<circle cx="500" cy="430" r="150" fill="none" stroke="', col, '" stroke-width="6" stroke-linecap="round" stroke-dasharray="14 26" transform="rotate(-90 500 430)" opacity="0.8"/>');
        }
        // Demand Trace — twin signal flow lines through the field
        return string.concat('<path d="M250 470 Q500 410 750 470 M250 506 Q500 446 750 506" fill="none" stroke="', col, '" stroke-width="2" opacity="0.5"/>');
    }

    // ======================================================================
    // Genesis / Eternal — museum archive plate
    // ======================================================================
    function _genesisField(bool isEternal, uint256 seed) internal pure returns (string memory) {
        string memory seal = isEternal ? BRASS : PAPER; // calmer archival gold
        string memory ledger;
        for (uint256 i; i < 8; ++i) {
            string memory y = (216 + i * 56).toString();
            ledger = string.concat(
                ledger,
                '<path d="M120 ', y, "H470\" stroke=\"", IVORY, '" stroke-width="1.5" opacity="0.28"/>',
                '<rect x="120" y="', (212 + i * 56).toString(), '" width="16" height="8" fill="', IVORY, '" opacity="0.6"/>',
                // hash-fragment: deterministic provenance line length encoded from the art seed
                '<path d="M156 ', y, "H", (250 + ((seed >> (i * 6)) % 210)).toString(),
                "\" stroke=\"", seal, '" stroke-width="3" opacity="0.62"/>'
            );
        }
        return string.concat(
            ledger,
            // central provenance seal
            '<circle cx="742" cy="430" r="180" fill="none" stroke="', IVORY, '" stroke-width="2" opacity="0.4"/>',
            '<circle cx="742" cy="430" r="146" fill="none" stroke="', seal, '" stroke-width="3" opacity="0.8"/>',
            '<circle cx="742" cy="430" r="108" fill="none" stroke="', IVORY, '" stroke-width="1.5" opacity="0.32"/>',
            _ringDash(124, seal, "8", "2 18", "0.5"),
            // the blood-oxide scar — NARA signature mark, cut across the archive seal too
            '<path d="M742 250 L742 610" stroke="', SCAR, '" stroke-width="2.5" opacity="0.5"/>',
            isEternal
                ? string.concat('<circle cx="710" cy="430" r="34" fill="none" stroke="', BRASS, '" stroke-width="5"/><circle cx="774" cy="430" r="34" fill="none" stroke="', BRASS, '" stroke-width="5"/>')
                : string.concat('<circle cx="742" cy="430" r="26" fill="', IVORY, '" opacity="0.9"/>'),
            // provenance stamp box
            '<rect x="636" y="636" width="212" height="44" rx="6" fill="none" stroke="', seal, '" stroke-width="1.5" opacity="0.7"/>',
            '<text x="742" y="666" fill="', seal, '" font-family="Georgia,\'Times New Roman\',serif" font-size="26" letter-spacing="6" text-anchor="middle">',
            isEternal ? "ETERNAL LEDGER" : "GENESIS ARCHIVE", "</text>"
        );
    }

    function _statusMarker(uint8 tier) internal pure returns (string memory) {
        string memory col = _tierColor(tier);
        return string.concat(
            '<circle cx="76" cy="86" r="12" fill="', col, '"', tier >= 2 ? ' filter="url(#b)"' : "", "/>",
            '<text x="102" y="95" fill="', IVORY, '" font-family="monospace" font-size="30" font-weight="700" letter-spacing="2">',
            _upper(_tierName(tier)), "</text>",
            '<text x="102" y="124" fill="', MUTED, '" font-family="monospace" font-size="18" letter-spacing="3">CORE / ',
            _upper(_coreClass(tier)), "</text>"
        );
    }

    function _seal(bool isGenesis, bool isEternal) internal pure returns (string memory) {
        if (!isGenesis && !isEternal) return "";
        return string.concat(
            '<rect x="780" y="60" width="176" height="54" rx="8" fill="none" stroke="', isEternal ? BRASS : IVORY, '" stroke-width="1.5" opacity="0.8"/>',
            '<text x="868" y="94" fill="', isEternal ? BRASS : IVORY, '" font-family="monospace" font-size="22" letter-spacing="4" text-anchor="middle">',
            isEternal ? "ETERNAL" : "GENESIS", "</text>"
        );
    }

    function _identityBand(uint256 tokenId, uint256 positionId, uint8 tier, bool isGenesis)
        internal pure returns (string memory)
    {
        string memory col = _tierColor(tier);
        return string.concat(
            '<path d="M40 812H960" stroke="', col, '" stroke-width="1" opacity="0.55"/>',
            // custom wordmark lockup: peat-amber angular protocol cut + rule = the brand signature,
            // present on every card regardless of tier. Wordmark itself stays bone ivory.
            '<path d="M60 846 L84 822 L84 846 Z" fill="', AMBER, '"/>',
            '<path d="M96 832H300" stroke="', AMBER, '" stroke-width="2" opacity="0.5"/>',
            '<text x="58" y="922" fill="', IVORY, '" font-family="Arial,Helvetica,sans-serif" font-size="110" font-weight="700" letter-spacing="6">NARA</text>',
            '<text x="940" y="856" fill="', IVORY, '" font-family="monospace" font-size="27" letter-spacing="2" text-anchor="end">POSITION ', _pad6(positionId), "</text>",
            '<text x="940" y="892" fill="', IVORY, '" font-family="monospace" font-size="24" letter-spacing="2" text-anchor="end">TOKEN ', _pad6(tokenId), "</text>",
            '<text x="940" y="928" fill="', col, '" font-family="monospace" font-size="24" letter-spacing="2" text-anchor="end">STATE ', _upper(_tierName(tier)), "</text>",
            '<text x="60" y="958" fill="', MUTED, '" font-family="monospace" font-size="18" letter-spacing="4">ON-CHAIN / RENDERER V4 / ',
            isGenesis ? "GENESIS" : "MANUAL", "</text>"
        );
    }
}
