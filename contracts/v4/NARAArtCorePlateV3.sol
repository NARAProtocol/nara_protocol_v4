// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtCorePlateV3
/// @notice Top 1% luxury generative art plate with 5 legendary chassis materials, holographic foils, and Lock-Duration Luck Multiplier.
contract NARAArtCorePlateV3 {
    using Strings for uint256;

    uint256 public constant CORE_PLATE_VERSION = 3;
    uint64 public constant MAX_LOCK_EPOCHS = 35040; // 1 Year (35,040 * 15m)

    struct ChassisTheme {
        string name;
        string frameOuter;
        string frameInner;
        string pinStripe;
        string bracket;
        string glowColor;
        string sigilColor;
        string accentColor;
        string badgeBg;
        string badgeText;
        bool isHolo;
    }

    function computeLuckBonus(uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (uint256) {
        if (isEternal) return 350;
        if (unlockEpoch <= createdEpoch) return 0;
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration > MAX_LOCK_EPOCHS) duration = MAX_LOCK_EPOCHS;
        return (uint256(duration) * 350) / MAX_LOCK_EPOCHS;
    }

    function getTheme(uint256 seed, uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (ChassisTheme memory t) {
        uint256 rawRoll = seed % 1000;
        uint256 luckBonus = computeLuckBonus(createdEpoch, unlockEpoch, isEternal);
        uint256 roll = rawRoll > luckBonus ? (rawRoll - luckBonus) : 0;

        if (roll < 50) {
            // 5.0% Base (up to 40% with 1-Year Max Lock): Prismatic Holographic Foil
            return ChassisTheme({
                name: "Prismatic Holo Foil",
                frameOuter: "url(#holoFrame)",
                frameInner: "#080B10",
                pinStripe: "url(#holoPin)",
                bracket: "#00F0FF",
                glowColor: "#00F0FF",
                sigilColor: "#FFFFFF",
                accentColor: "#FF00E5",
                badgeBg: "url(#holoBadge)",
                badgeText: "#000000",
                isHolo: true
            });
        } else if (roll < 150) {
            // 10.0% Base (up to 45% with 1-Year Max Lock): 24K Gilded Gold
            return ChassisTheme({
                name: "24K Gilded Gold",
                frameOuter: "url(#goldFrame)",
                frameInner: "#141008",
                pinStripe: "#FFD700",
                bracket: "#FFD700",
                glowColor: "#FFB700",
                sigilColor: "#FFD700",
                accentColor: "#FFA000",
                badgeBg: "#2A200A",
                badgeText: "#FFD700",
                isHolo: false
            });
        } else if (roll < 350) {
            // 20.0% Base: Obsidian Stealth
            return ChassisTheme({
                name: "Obsidian Stealth",
                frameOuter: "#181A20",
                frameInner: "#07080A",
                pinStripe: "#FF1E44",
                bracket: "#FF1E44",
                glowColor: "#FF1E44",
                sigilColor: "#FF2A4B",
                accentColor: "#FF1E44",
                badgeBg: "#240A0E",
                badgeText: "#FF2A4B",
                isHolo: false
            });
        } else if (roll < 600) {
            // 25.0% Base: Cybernetic Emerald
            return ChassisTheme({
                name: "Cybernetic Emerald",
                frameOuter: "#11261E",
                frameInner: "#06120E",
                pinStripe: "#00FF88",
                bracket: "#00FF88",
                glowColor: "#00FF88",
                sigilColor: "#00FF88",
                accentColor: "#00E599",
                badgeBg: "#062419",
                badgeText: "#00FF88",
                isHolo: false
            });
        } else {
            // 40.0% Base (<1% with 1-Year Max Lock): Titanium Slate
            return ChassisTheme({
                name: "Titanium Slate",
                frameOuter: "#2B323D",
                frameInner: "#0E1116",
                pinStripe: "#0052FF",
                bracket: "#F4EFE6",
                glowColor: "#0052FF",
                sigilColor: "#F4EFE6",
                accentColor: "#0052FF",
                badgeBg: "#0A1428",
                badgeText: "#4589FF",
                isHolo: false
            });
        }
    }

    function svg(
        uint8 tier,
        uint256 seed,
        uint8 moduleIdx,
        uint256 tokenId,
        uint256 positionId,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        bool isEternal,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory) {
        moduleIdx;
        claimCount;
        extendCount;
        ChassisTheme memory t = getTheme(seed, createdEpoch, unlockEpoch, isEternal);

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" style="background:#000;">',
            _defs(t),
            _chassis(t),
            _header(tier, t, createdEpoch),
            _energyCore(tier, seed, t),
            _identityBand(tokenId, positionId, t),
            "</svg>"
        );
    }

    function _defs(ChassisTheme memory t) internal pure returns (string memory) {
        return string.concat(
            '<defs>',
            '<radialGradient id="coronaglow" cx="50%" cy="48%" r="48%"><stop offset="0%" stop-color="', t.glowColor, '" stop-opacity="0.28"/><stop offset="100%" stop-color="#07090C" stop-opacity="0"/></radialGradient>',
            '<linearGradient id="goldFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE072"/><stop offset="25%" stop-color="#C59B27"/><stop offset="50%" stop-color="#FFF0A0"/><stop offset="75%" stop-color="#9E7A1A"/><stop offset="100%" stop-color="#FFE072"/></linearGradient>',
            '<linearGradient id="holoFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF0080"/><stop offset="20%" stop-color="#7928CA"/><stop offset="40%" stop-color="#0070F3"/><stop offset="60%" stop-color="#00DFD8"/><stop offset="80%" stop-color="#79FFE1"/><stop offset="100%" stop-color="#FF0080"/></linearGradient>',
            '<linearGradient id="holoPin" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00DFD8"/><stop offset="50%" stop-color="#FF0080"/><stop offset="100%" stop-color="#79FFE1"/></linearGradient>',
            '<linearGradient id="holoBadge" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#79FFE1"/><stop offset="100%" stop-color="#FF0080"/></linearGradient>',
            '</defs>'
        );
    }

    function _chassis(ChassisTheme memory t) internal pure returns (string memory) {
        return string.concat(
            '<rect width="1000" height="1000" fill="#07090C"/>',
            '<rect width="1000" height="1000" fill="url(#coronaglow)"/>',
            '<rect x="24" y="24" width="952" height="952" rx="28" fill="none" stroke="', t.frameOuter, '" stroke-width="48"/>',
            '<rect x="48" y="48" width="904" height="904" rx="16" fill="none" stroke="', t.frameInner, '" stroke-width="6"/>',
            '<rect x="54" y="54" width="892" height="892" rx="12" fill="none" stroke="', t.pinStripe, '" stroke-width="2" opacity="0.65"/>',
            '<path d="M58 140 V58 H140" fill="none" stroke="', t.bracket, '" stroke-width="8" stroke-linecap="round"/>',
            '<path d="M942 140 V58 H860" fill="none" stroke="', t.bracket, '" stroke-width="8" stroke-linecap="round"/>',
            '<path d="M58 860 V942 H140" fill="none" stroke="', t.bracket, '" stroke-width="8" stroke-linecap="round"/>',
            '<path d="M942 860 V942 H860" fill="none" stroke="', t.bracket, '" stroke-width="8" stroke-linecap="round"/>',
            '<circle cx="72" cy="72" r="6" fill="', t.bracket, '"/>',
            '<circle cx="928" cy="72" r="6" fill="', t.bracket, '"/>',
            '<circle cx="72" cy="928" r="6" fill="', t.bracket, '"/>',
            '<circle cx="928" cy="928" r="6" fill="', t.bracket, '"/>'
        );
    }

    function _header(uint8 tier, ChassisTheme memory t, uint64 createdEpoch) internal pure returns (string memory) {
        string memory tierLabel;
        if (tier == 4) tierLabel = unicode"● APEX RADIANT";
        else if (tier == 3) tierLabel = unicode"● CALIBRATED";
        else if (tier == 2) tierLabel = unicode"● REWARDED";
        else if (tier == 1) tierLabel = unicode"● ACTIVATED";
        else tierLabel = string.concat(unicode"● ", t.name);

        return string.concat(
            '<g transform="translate(80, 114)">',
            '<rect x="-8" y="-24" width="380" height="42" rx="8" fill="', t.badgeBg, '" opacity="0.85"/>',
            '<circle cx="12" cy="-3" r="8" fill="', t.sigilColor, '"/>',
            '<text x="28" y="5" fill="', t.badgeText, '" font-family="\'IBM Plex Mono\', monospace" font-size="22" font-weight="900" letter-spacing="2">',
            tierLabel,
            '</text></g>',
            '<text x="920" y="121" fill="#F4EFE6" font-family="\'IBM Plex Mono\', monospace" font-size="28" font-weight="800" letter-spacing="2" text-anchor="end">EPOCH #',
            uint256(createdEpoch).toString(),
            '</text>',
            '<line x1="80" y1="150" x2="920" y2="150" stroke="', t.accentColor, '" stroke-width="2" opacity="0.45"/>'
        );
    }

    function _energyCore(uint8 tier, uint256 seed, ChassisTheme memory t) internal pure returns (string memory) {
        uint256 sigilVariant = (seed / 1000) % 5;
        string memory rings = "";

        if (sigilVariant == 0) {
            // Solar Flare Matrix
            rings = string.concat(
                '<circle cx="0" cy="0" r="270" fill="none" stroke="', t.accentColor, '" stroke-width="2" opacity="0.35" stroke-dasharray="12 12"/>',
                '<circle cx="0" cy="0" r="220" fill="none" stroke="', t.sigilColor, '" stroke-width="3" opacity="0.8" stroke-dasharray="24 8"/>'
            );
        } else if (sigilVariant == 1) {
            // Dual Orbital Gyroscope
            rings = string.concat(
                '<ellipse cx="0" cy="0" rx="270" ry="120" fill="none" stroke="', t.accentColor, '" stroke-width="3" opacity="0.6" transform="rotate(-30)"/>',
                '<ellipse cx="0" cy="0" rx="270" ry="120" fill="none" stroke="', t.sigilColor, '" stroke-width="3" opacity="0.8" transform="rotate(30)"/>'
            );
        } else if (sigilVariant == 2) {
            // Tachyon Starburst Array
            rings = string.concat(
                '<circle cx="0" cy="0" r="250" fill="none" stroke="', t.accentColor, '" stroke-width="2" opacity="0.4"/>',
                '<polygon points="0,-270 70,-70 270,0 70,70 0,270 -70,70 -270,0 -70,-70" fill="none" stroke="', t.sigilColor, '" stroke-width="2.5" opacity="0.7"/>'
            );
        } else {
            // Concentric Telemetry Radar
            rings = string.concat(
                '<circle cx="0" cy="0" r="280" fill="none" stroke="', t.accentColor, '" stroke-width="2" opacity="0.3" stroke-dasharray="6 8"/>',
                '<circle cx="0" cy="0" r="210" fill="none" stroke="', t.sigilColor, '" stroke-width="3" opacity="0.75" stroke-dasharray="16 6"/>'
            );
        }

        string memory tierRadiance = "";
        if (tier >= 2) {
            tierRadiance = string.concat(
                '<circle cx="0" cy="0" r="175" fill="none" stroke="', t.sigilColor, '" stroke-width="4" opacity="0.9"/>'
            );
        }

        return string.concat(
            '<g transform="translate(500, 475)">',
            rings,
            tierRadiance,
            '<circle cx="0" cy="0" r="140" fill="#0B0E14" stroke="', t.sigilColor, '" stroke-width="6"/>',
            '<line x1="-290" y1="0" x2="-210" y2="0" stroke="', t.sigilColor, '" stroke-width="3" opacity="0.85"/>',
            '<line x1="210" y1="0" x2="290" y2="0" stroke="', t.sigilColor, '" stroke-width="3" opacity="0.85"/>',
            '<line x1="0" y1="-290" x2="0" y2="-210" stroke="', t.sigilColor, '" stroke-width="3" opacity="0.85"/>',
            '<line x1="0" y1="210" x2="0" y2="290" stroke="', t.sigilColor, '" stroke-width="3" opacity="0.85"/>',
            '<g stroke="', t.sigilColor, '" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none">',
            '<path d="M-38 56 L-38 -56"/>',
            '<path d="M38 56 L38 -56"/>',
            '<path d="M-38 -56 L38 56"/>',
            '</g>',
            '<circle cx="0" cy="0" r="10" fill="', t.accentColor, '"/>',
            '</g>'
        );
    }

    function _identityBand(uint256 tokenId, uint256 positionId, ChassisTheme memory t) internal pure returns (string memory) {
        return string.concat(
            '<line x1="80" y1="784" x2="920" y2="784" stroke="', t.accentColor, '" stroke-width="2" opacity="0.45"/>',
            '<text x="80" y="874" fill="#FFFFFF" font-family="\'Satoshi\', \'Inter\', sans-serif" font-size="88" font-weight="900" letter-spacing="4">NARA</text>',
            '<text x="84" y="918" fill="', t.sigilColor, '" font-family="\'IBM Plex Mono\', monospace" font-size="22" font-weight="800" letter-spacing="3">',
            t.name,
            '</text>',
            '<text x="920" y="856" fill="', t.sigilColor, '" font-family="\'IBM Plex Mono\', monospace" font-size="34" font-weight="900" letter-spacing="3" text-anchor="end">POS #',
            _pad6(positionId),
            '</text>',
            '<text x="920" y="896" fill="#F4EFE6" font-family="\'IBM Plex Mono\', monospace" font-size="24" font-weight="800" letter-spacing="2" text-anchor="end">TOKEN #',
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
