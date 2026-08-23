// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtCorePlateV4
/// @notice Master luxury generative art plate with 5 forged aerospace alloys, 3-Vector Staking Progression, Multi-Year Ascensions, and 64-Slot Fleet Grid.
/// @dev 100% Pure On-Chain SVG rendering with zero external dependencies.
contract NARAArtCorePlateV4 {
    using Strings for uint256;

    uint256 public constant CORE_PLATE_VERSION = 8;
    uint64 public constant EPOCHS_PER_DAY = 96;
    uint64 public constant EPOCHS_PER_MONTH = 2880;
    uint64 public constant EPOCHS_PER_YEAR = 35040;

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

    struct ProgressionState {
        uint8 rank;
        string rankTitle;
        uint8 ascensionTier; // 0 = Standard, 1 = Ascension I (Supernova), 2 = Ascension II (Immortal)
        string ascensionLabel;
        string fleetTitle;
        uint256 ageInEpochs;
    }

    function calculateProgression(
        uint64 currentEpoch,
        uint64 createdEpoch,
        uint32 extendCount,
        uint256 walletActiveSlots,
        bool isEternal
    ) public pure returns (ProgressionState memory p) {
        if (currentEpoch > createdEpoch) {
            p.ageInEpochs = uint256(currentEpoch - createdEpoch);
        } else {
            p.ageInEpochs = 0;
        }

        // Rank by Time/Longevity (or Eternal Genesis anchor)
        if (isEternal || p.ageInEpochs >= EPOCHS_PER_YEAR) {
            p.rank = 10;
            p.rankTitle = "APEX VETERAN";
        } else if (p.ageInEpochs >= 32120) {
            p.rank = 9;
            p.rankTitle = "DIMENSIONAL CORONA";
        } else if (p.ageInEpochs >= 29200) {
            p.rank = 8;
            p.rankTitle = "PLASMA SUPER-RING";
        } else if (p.ageInEpochs >= 23360) {
            p.rank = 7;
            p.rankTitle = "TACHYON STARBURST";
        } else if (p.ageInEpochs >= 17520) {
            p.rank = 6;
            p.rankTitle = "GRAVITATIONAL WARP";
        } else if (p.ageInEpochs >= 11520) {
            p.rank = 5;
            p.rankTitle = "ORBITAL GYROSCOPE";
        } else if (p.ageInEpochs >= 8640) {
            p.rank = 4;
            p.rankTitle = "STATOR TURBINE";
        } else if (p.ageInEpochs >= 5760) {
            p.rank = 3;
            p.rankTitle = "DOUBLE CONDUIT";
        } else if (p.ageInEpochs >= 2880) {
            p.rank = 2;
            p.rankTitle = "CIRCUIT IGNITION";
        } else if (p.ageInEpochs >= 672) {
            p.rank = 1;
            p.rankTitle = "SENSOR ACTIVE";
        } else {
            p.rank = 0;
            p.rankTitle = "DORMANT NODE";
        }

        // Multi-Year Ascension Eras
        if (isEternal || p.ageInEpochs >= (EPOCHS_PER_YEAR * 3) || extendCount >= 4) {
            p.ascensionTier = 2;
            p.ascensionLabel = "ASCENSION II: IMMORTAL QUANTUM";
        } else if (p.ageInEpochs >= (EPOCHS_PER_YEAR * 2) || extendCount >= 2) {
            p.ascensionTier = 1;
            p.ascensionLabel = "ASCENSION I: SUPERNOVA";
        } else {
            p.ascensionTier = 0;
            p.ascensionLabel = "STANDARD ERA";
        }

        // Fleet Grid Rank (1 to 64 active slots)
        if (walletActiveSlots >= 64) {
            p.fleetTitle = "FLEET 64/64: SOVEREIGN MASTER";
        } else if (walletActiveSlots >= 32) {
            p.fleetTitle = "FLEET: GALACTIC CLUSTER";
        } else if (walletActiveSlots >= 16) {
            p.fleetTitle = "FLEET: ARMADA";
        } else if (walletActiveSlots >= 8) {
            p.fleetTitle = "FLEET: BATTALION";
        } else if (walletActiveSlots >= 4) {
            p.fleetTitle = "FLEET: SQUADRON";
        } else {
            p.fleetTitle = "FLEET: SOLO VANGUARD";
        }
    }

    function getTheme(uint256 seed, bool isEternal) public pure returns (ChassisTheme memory t) {
        uint256 roll = seed % 1000;

        if (isEternal || roll < 15) {
            // Prismatic Holo Foil (1.5% Ultra-Grail)
            return ChassisTheme({
                name: "Prismatic Holo Foil",
                frameOuter: "url(#holoFrame)",
                frameInner: "#060911",
                pinStripe: "url(#holoPin)",
                bracket: "#00F5FF",
                glowColor: "#00F5FF",
                sigilColor: "#FFFFFF",
                accentColor: "#FF00E5",
                badgeBg: "rgba(0,245,255,0.15)",
                badgeText: "#00F5FF",
                isHolo: true
            });
        }
        if (roll < 55) {
            // 24K Gilded Gold (4.0% Legendary)
            return ChassisTheme({
                name: "24K Gilded Gold",
                frameOuter: "url(#goldFrame)",
                frameInner: "#0C0A04",
                pinStripe: "#FFD700",
                bracket: "#FFD700",
                glowColor: "#FFA500",
                sigilColor: "#FFF2A3",
                accentColor: "#FFD700",
                badgeBg: "rgba(255,215,0,0.18)",
                badgeText: "#FFD700",
                isHolo: false
            });
        }
        if (roll < 200) {
            // Obsidian Stealth (14.5% Rare)
            return ChassisTheme({
                name: "Obsidian Stealth",
                frameOuter: "#101216",
                frameInner: "#040507",
                pinStripe: "#FF2A55",
                bracket: "#FF2A55",
                glowColor: "#FF1744",
                sigilColor: "#FFA0B0",
                accentColor: "#FF2A55",
                badgeBg: "rgba(255,42,85,0.15)",
                badgeText: "#FF456A",
                isHolo: false
            });
        }
        if (roll < 550) {
            // Cybernetic Emerald (35.0% Uncommon)
            return ChassisTheme({
                name: "Cybernetic Emerald",
                frameOuter: "#0D1815",
                frameInner: "#030A07",
                pinStripe: "#00FF88",
                bracket: "#00FF88",
                glowColor: "#00FF88",
                sigilColor: "#A3FFD1",
                accentColor: "#00FF88",
                badgeBg: "rgba(0,255,136,0.15)",
                badgeText: "#00FF88",
                isHolo: false
            });
        }
        // Titanium Slate (45.0% Common Baseline)
        return ChassisTheme({
            name: "Titanium Slate",
            frameOuter: "#1A1F2C",
            frameInner: "#080B10",
            pinStripe: "#388BFF",
            bracket: "#388BFF",
            glowColor: "#0052FF",
            sigilColor: "#C9DFFF",
            accentColor: "#388BFF",
            badgeBg: "rgba(56,139,255,0.15)",
            badgeText: "#58A6FF",
            isHolo: false
        });
    }

    function _renderBatteryHUD(uint8 rank, string memory glowColor) internal pure returns (string memory) {
        string memory cells = "";
        for (uint8 i = 1; i <= 10; i++) {
            uint256 x = 160 + (uint256(i - 1) * 18);
            if (i <= rank) {
                cells = string.concat(
                    cells,
                    '<rect x="', x.toString(), '" y="42" width="14" height="12" rx="2" fill="', glowColor, '" filter="url(#glow)"/>'
                );
            } else {
                cells = string.concat(
                    cells,
                    '<rect x="', x.toString(), '" y="42" width="14" height="12" rx="2" fill="#161B22" stroke="#30363D" stroke-width="1"/>'
                );
            }
        }
        return cells;
    }

    function _renderExtensionNotches(uint32 extendCount, string memory accentColor) internal pure returns (string memory) {
        string memory notches = "";
        uint32 displayCount = extendCount > 8 ? 8 : extendCount;
        for (uint32 i = 0; i < displayCount; i++) {
            uint256 y = 180 + (uint256(i) * 28);
            notches = string.concat(
                notches,
                '<rect x="18" y="', y.toString(), '" width="12" height="6" rx="2" fill="', accentColor, '" filter="url(#glow)"/>',
                '<circle cx="24" cy="', (y + 3).toString(), '" r="1.5" fill="#FFFFFF"/>'
            );
        }
        return notches;
    }

    function _renderCornerBolts(uint32 extendCount, string memory bracketColor) internal pure returns (string memory) {
        uint256 boltRadius = extendCount > 2 ? 4 : 3;
        string memory rStr = boltRadius.toString();
        return string.concat(
            // Top Left & Right Bolts
            '<circle cx="38" cy="38" r="', rStr, '" fill="', bracketColor, '"/>',
            '<circle cx="462" cy="38" r="', rStr, '" fill="', bracketColor, '"/>',
            // Bottom Left & Right Bolts
            '<circle cx="38" cy="662" r="', rStr, '" fill="', bracketColor, '"/>',
            '<circle cx="462" cy="662" r="', rStr, '" fill="', bracketColor, '"/>'
        );
    }

    function svg(
        uint64 currentEpoch,
        uint256 seed,
        uint256 tokenId,
        uint256 positionId,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        bool isEternal,
        uint32 claimCount,
        uint32 extendCount,
        uint256 walletActiveSlots
    ) external pure returns (string memory) {
        ChassisTheme memory t = getTheme(seed, isEternal);
        ProgressionState memory p = calculateProgression(currentEpoch, createdEpoch, extendCount, walletActiveSlots, isEternal);

        uint256 naraWhole = uint256(amount) / 1e18;
        uint256 lockDays = (unlockEpoch > createdEpoch) ? (uint256(unlockEpoch - createdEpoch) / EPOCHS_PER_DAY) : 0;
        if (isEternal) lockDays = 9999;

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700" width="100%" height="100%" style="background:#06080F;font-family:\'IBM Plex Mono\',monospace;">',
            '<defs>',
            '<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '<linearGradient id="holoFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF007A"/><stop offset="33%" stop-color="#7928CA"/><stop offset="66%" stop-color="#00DFD8"/><stop offset="100%" stop-color="#FF007A"/></linearGradient>',
            '<linearGradient id="holoPin" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#00F5FF"/><stop offset="50%" stop-color="#FF00E5"/><stop offset="100%" stop-color="#00FF88"/></linearGradient>',
            '<linearGradient id="goldFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE066"/><stop offset="50%" stop-color="#FFB800"/><stop offset="100%" stop-color="#B37400"/></linearGradient>',
            '</defs>',

            // 1. Double-Bezel Solid Outer Chassis
            '<rect x="10" y="10" width="480" height="680" rx="24" fill="', t.frameOuter, '" stroke="#30363D" stroke-width="1.5"/>',
            '<rect x="22" y="22" width="456" height="656" rx="16" fill="', t.frameInner, '" stroke="', t.pinStripe, '" stroke-width="1"/>',

            // 2. Corner Reinforcement Brackets & Titanium Bolting
            '<path d="M 22 56 L 56 22 M 444 22 L 478 56 M 22 644 L 56 678 M 444 678 L 478 644" stroke="', t.bracket, '" stroke-width="2.5"/>',
            _renderCornerBolts(extendCount, t.bracket),

            // 3. Top Header: NARA Medallion + 10-Cell Battery HUD + Fleet Badge
            '<circle cx="50" cy="48" r="16" fill="rgba(0,82,255,0.2)" stroke="#0052FF" stroke-width="1.5"/>',
            '<text x="50" y="53" fill="#FFFFFF" font-size="12" font-weight="bold" text-anchor="middle">N</text>',
            _renderBatteryHUD(p.rank, t.glowColor),
            '<text x="450" y="52" fill="', t.accentColor, '" font-size="10" font-weight="bold" text-anchor="end">', p.fleetTitle, '</text>',

            // 4. Alloy & Era Banner
            '<rect x="40" y="80" width="420" height="30" rx="6" fill="', t.badgeBg, '" stroke="', t.badgeText, '" stroke-width="1"/>',
            '<text x="52" y="100" fill="', t.badgeText, '" font-size="11" font-weight="bold">ALLOY: ', t.name, '</text>',
            '<text x="448" y="100" fill="#8B949E" font-size="10" text-anchor="end">RANK ', uint256(p.rank).toString(), ' // ', p.rankTitle, '</text>',

            // 5. Dedicated Center Stage Reactor (Y: 120-460 | Isolated Zero-Collision Arena)
            _renderCenterStage(t, p),

            // 6. Left & Right Frame Telemetry (Extension Notches & Yield Conduits)
            _renderExtensionNotches(extendCount, t.accentColor),
            '<line x1="476" y1="180" x2="476" y2="440" stroke="', t.glowColor, '" stroke-width="3" stroke-linecap="round" filter="url(#glow)"/>',

            // 7. Primary Financial Telemetry Bar (Y: 470 to 550)
            '<rect x="40" y="470" width="420" height="75" rx="8" fill="#0D1117" stroke="#30363D" stroke-width="1"/>',
            '<text x="56" y="495" fill="#8B949E" font-size="10">LOCKED PRINCIPAL</text>',
            '<text x="56" y="525" fill="#F0F6FC" font-size="18" font-weight="bold">', naraWhole.toString(), ' NARA</text>',
            '<text x="270" y="495" fill="#8B949E" font-size="10">TIME COMMITMENT</text>',
            '<text x="270" y="525" fill="', t.accentColor, '" font-size="18" font-weight="bold">', lockDays.toString(), ' DAYS</text>',

            // 8. Ascension Seal & Provenance (Y: 560 to 660)
            '<rect x="40" y="560" width="420" height="42" rx="6" fill="rgba(0,0,0,0.4)" stroke="', t.pinStripe, '" stroke-width="1"/>',
            '<text x="250" y="586" fill="', t.sigilColor, '" font-size="12" font-weight="bold" text-anchor="middle">', unicode"★ ", p.ascensionLabel, unicode" ★", '</text>',
            '<text x="250" y="630" fill="#484F58" font-size="9" text-anchor="middle">TOKEN #', tokenId.toString(), ' | POS #', positionId.toString(), ' | EXTENDS: ', uint256(extendCount).toString(), ' | CLAIMS: ', uint256(claimCount).toString(), '</text>',
            '<text x="250" y="648" fill="#30363D" font-size="8" text-anchor="middle">BASE MAINNET // IMMUTABLE PURE ON-CHAIN PROVENANCE</text>',
            '</svg>'
        );
    }

    function _renderCenterStage(ChassisTheme memory t, ProgressionState memory p) internal pure returns (string memory) {
        // Dedicated Center at CX=250, CY=285 with outer radius 110 (Y bounds: 175 to 395)
        return string.concat(
            '<g transform="translate(250, 285)">',
            // Swiss Chronometer Micro-Degree Rings
            '<circle cx="0" cy="0" r="110" fill="none" stroke="#21262D" stroke-width="1" stroke-dasharray="2 6"/>',
            '<circle cx="0" cy="0" r="95" fill="none" stroke="', t.pinStripe, '" stroke-width="1.5" opacity="0.6"/>',
            '<text x="0" y="-100" fill="#484F58" font-size="7" text-anchor="middle">', unicode"000°", '</text>',
            '<text x="104" y="3" fill="#484F58" font-size="7" text-anchor="start">', unicode"090°", '</text>',
            '<text x="0" y="106" fill="#484F58" font-size="7" text-anchor="middle">', unicode"180°", '</text>',
            '<text x="-104" y="3" fill="#484F58" font-size="7" text-anchor="end">', unicode"270°", '</text>',

            // Core Gyroscope & Stator Rings
            '<circle cx="0" cy="0" r="75" fill="none" stroke="', t.glowColor, '" stroke-width="2" filter="url(#glow)" opacity="0.8"/>',
            '<circle cx="0" cy="0" r="55" fill="#060911" stroke="', t.bracket, '" stroke-width="1.5"/>',

            // Center Ascension Sigil
            (p.ascensionTier >= 1) 
                ? '<polygon points="0,-40 28,-28 40,0 28,28 0,40 -28,28 -40,0 -28,-28" fill="none" stroke="url(#holoFrame)" stroke-width="2.5" filter="url(#glow)"/>'
                : '<polygon points="0,-35 25,-15 25,20 0,35 -25,20 -25,-15" fill="none" stroke="' , t.sigilColor, '" stroke-width="1.5"/>',

            '<circle cx="0" cy="0" r="22" fill="', t.glowColor, '" opacity="0.25" filter="url(#glow)"/>',
            '<circle cx="0" cy="0" r="8" fill="', t.sigilColor, '"/>',
            '</g>'
        );
    }
}
