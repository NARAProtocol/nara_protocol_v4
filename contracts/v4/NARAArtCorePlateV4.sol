// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtCorePlateV4
/// @notice Master luxury Swiss chronometer & aerospace generative art engine.
/// @dev 100% Pure On-Chain SVG rendering with Multi-Dimensional Staking Scaling (Time, Amount, Seed, Ascensions).
contract NARAArtCorePlateV4 {
    using Strings for uint256;

    uint256 public constant CORE_PLATE_VERSION = 12;
    uint64 public constant EPOCHS_PER_DAY = 96;
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
        string hexGridColor;
    }

    struct ProgressionState {
        uint8 rank;
        string rankTitle;
        uint8 ascensionTier;
        string ascensionLabel;
        string fleetTitle;
        uint256 ageInEpochs;
        uint8 lockTier;
        string lockBoostLabel;
        uint8 chargedCells;
        uint8 amountTier; // 1 = <25, 2 = 25-99, 3 = 100-499, 4 = 500-999, 5 = 1000+ NARA
        uint16 rotationAngle;
        uint8 coreShape; // 0 = Octagon, 1 = Hexagon, 2 = Dodecagon, 3 = Sacred Star
    }

    function calculateProgression(
        uint64 currentEpoch,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        uint128 amount,
        uint256 seed,
        uint32 extendCount,
        uint256 walletActiveSlots,
        bool isEternal
    ) public pure returns (ProgressionState memory p) {
        if (currentEpoch > createdEpoch) {
            p.ageInEpochs = uint256(currentEpoch - createdEpoch);
        } else {
            p.ageInEpochs = 0;
        }

        uint256 lockDays = (unlockEpoch > createdEpoch) ? (uint256(unlockEpoch - createdEpoch) / EPOCHS_PER_DAY) : 0;
        if (isEternal) lockDays = 9999;

        // 1. Lock Commitment Horizon Tier & Boost
        if (isEternal || lockDays >= 365) {
            p.lockTier = 5;
            p.lockBoostLabel = "4.0X MAX BOOST";
            p.chargedCells = 10;
        } else if (lockDays >= 180) {
            p.lockTier = 4;
            p.lockBoostLabel = "2.5X BOOST";
            p.chargedCells = 7;
        } else if (lockDays >= 90) {
            p.lockTier = 3;
            p.lockBoostLabel = "1.75X BOOST";
            p.chargedCells = 5;
        } else if (lockDays >= 30) {
            p.lockTier = 2;
            p.lockBoostLabel = "1.25X BOOST";
            p.chargedCells = 3;
        } else {
            p.lockTier = 1;
            p.lockBoostLabel = "1.0X TRIAL";
            p.chargedCells = 1;
        }

        // Aging adds bonus charge
        uint8 ageBonus = uint8((p.ageInEpochs * 10) / EPOCHS_PER_YEAR);
        if (p.chargedCells + ageBonus > 10 || isEternal) {
            p.chargedCells = 10;
        } else {
            p.chargedCells += ageBonus;
        }

        // 2. Realistic Calibrated Amount / Capital Depth Tier
        uint256 naraWhole = uint256(amount) / 1e18;
        if (naraWhole >= 1000) {
            p.amountTier = 5; // Apex Whale Sovereign (1,000+ NARA)
        } else if (naraWhole >= 500) {
            p.amountTier = 4; // Heavy Believer (500-999 NARA)
        } else if (naraWhole >= 100) {
            p.amountTier = 3; // High Conviction & Lucky Mint (100-499 NARA)
        } else if (naraWhole >= 25) {
            p.amountTier = 2; // Builder Staker (25-99 NARA)
        } else {
            p.amountTier = 1; // Micro / Trial (<25 NARA)
        }

        // 3. Unique Procedural Fingerprint (Seed)
        p.rotationAngle = uint16((seed % 12) * 30);
        p.coreShape = uint8(seed % 4);

        // 4. Aging Titles
        if (isEternal || p.ageInEpochs >= EPOCHS_PER_YEAR) {
            p.rank = 10;
            p.rankTitle = "APEX VETERAN";
        } else if (p.lockTier == 5) {
            p.rank = 10;
            p.rankTitle = "1-YEAR HORIZON";
        } else if (p.ageInEpochs >= 23360 || p.lockTier == 4) {
            p.rank = 7;
            p.rankTitle = "TACHYON WARP";
        } else if (p.ageInEpochs >= 11520 || p.lockTier == 3) {
            p.rank = 5;
            p.rankTitle = "ORBITAL GYRO";
        } else if (p.ageInEpochs >= 2880 || p.lockTier == 2) {
            p.rank = 3;
            p.rankTitle = "CIRCUIT IGNITION";
        } else {
            p.rank = 0;
            p.rankTitle = "DORMANT NODE";
        }

        // 5. Multi-Year Ascensions
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

        // 6. Fleet Grids
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

    function getTheme(uint256 seed, bool isEternal, uint128 amount) public pure returns (ChassisTheme memory t) {
        uint256 roll = seed % 1000;
        uint256 naraWhole = uint256(amount) / 1e18;

        // 100+ NARA Lucky Mint Bonus: 2X probability boost for 24K Gold and Damascus Meteorite
        uint256 damascusThreshold = (naraWhole >= 100) ? 40 : 20;
        uint256 goldThreshold = (naraWhole >= 100) ? 130 : 65;

        if (isEternal || roll < damascusThreshold) {
            // Forged Damascus Meteorite (Apex Grail)
            return ChassisTheme({
                name: "Forged Damascus Meteorite",
                frameOuter: "url(#damascusFrame)",
                frameInner: "#060A14",
                pinStripe: "url(#damascusPin)",
                bracket: "#38BDF8",
                glowColor: "#0284C7",
                sigilColor: "#F8FAFC",
                accentColor: "#38BDF8",
                badgeBg: "rgba(56,189,248,0.18)",
                badgeText: "#38BDF8",
                hexGridColor: "rgba(56,189,248,0.06)"
            });
        }
        if (roll < goldThreshold) {
            // 24K Gilded Gold (Legendary)
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
                hexGridColor: "rgba(255,215,0,0.05)"
            });
        }
        if (roll < 260) {
            // Obsidian Stealth (Rare)
            return ChassisTheme({
                name: "Obsidian Stealth",
                frameOuter: "url(#obsidianFrame)",
                frameInner: "#040507",
                pinStripe: "#FF2A55",
                bracket: "#FF2A55",
                glowColor: "#FF1744",
                sigilColor: "#FFA0B0",
                accentColor: "#FF2A55",
                badgeBg: "rgba(255,42,85,0.16)",
                badgeText: "#FF456A",
                hexGridColor: "rgba(255,42,85,0.05)"
            });
        }
        if (roll < 580) {
            // Cybernetic Emerald (Uncommon)
            return ChassisTheme({
                name: "Cybernetic Emerald",
                frameOuter: "url(#emeraldFrame)",
                frameInner: "#030A07",
                pinStripe: "#00FF88",
                bracket: "#00FF88",
                glowColor: "#00FF88",
                sigilColor: "#A3FFD1",
                accentColor: "#00FF88",
                badgeBg: "rgba(0,255,136,0.16)",
                badgeText: "#00FF88",
                hexGridColor: "rgba(0,255,136,0.05)"
            });
        }
        // Titanium Slate (Common Baseline)
        return ChassisTheme({
            name: "Titanium Slate",
            frameOuter: "url(#titaniumFrame)",
            frameInner: "#070A10",
            pinStripe: "#388BFF",
            bracket: "#388BFF",
            glowColor: "#0052FF",
            sigilColor: "#C9DFFF",
            accentColor: "#388BFF",
            badgeBg: "rgba(56,139,255,0.16)",
            badgeText: "#58A6FF",
            hexGridColor: "rgba(56,139,255,0.05)"
        });
    }

    function _renderHexBolts(string memory bracketColor) internal pure returns (string memory) {
        return string.concat(
            '<g transform="translate(38, 38)"><circle cx="0" cy="0" r="7" fill="#0D1117" stroke="', bracketColor, '" stroke-width="1.5"/><polygon points="0,-4 3.5,-2 3.5,2 0,4 -3.5,2 -3.5,-2" fill="', bracketColor, '"/></g>',
            '<g transform="translate(462, 38)"><circle cx="0" cy="0" r="7" fill="#0D1117" stroke="', bracketColor, '" stroke-width="1.5"/><polygon points="0,-4 3.5,-2 3.5,2 0,4 -3.5,2 -3.5,-2" fill="', bracketColor, '"/></g>',
            '<g transform="translate(38, 662)"><circle cx="0" cy="0" r="7" fill="#0D1117" stroke="', bracketColor, '" stroke-width="1.5"/><polygon points="0,-4 3.5,-2 3.5,2 0,4 -3.5,2 -3.5,-2" fill="', bracketColor, '"/></g>',
            '<g transform="translate(462, 662)"><circle cx="0" cy="0" r="7" fill="#0D1117" stroke="', bracketColor, '" stroke-width="1.5"/><polygon points="0,-4 3.5,-2 3.5,2 0,4 -3.5,2 -3.5,-2" fill="', bracketColor, '"/></g>'
        );
    }

    function _renderBatteryHUD(uint8 chargedCells, string memory glowColor) internal pure returns (string memory) {
        string memory cells = '<g transform="translate(145, 36)">';
        cells = string.concat(
            cells,
            '<rect x="0" y="0" width="200" height="22" rx="6" fill="#0A0E17" stroke="#21262D" stroke-width="1"/>'
        );
        for (uint8 i = 1; i <= 10; i++) {
            uint256 x = 6 + (uint256(i - 1) * 19);
            if (i <= chargedCells) {
                cells = string.concat(
                    cells,
                    '<rect x="', x.toString(), '" y="4" width="15" height="14" rx="2" fill="', glowColor, '" filter="url(#glow)"/>'
                );
            } else {
                cells = string.concat(
                    cells,
                    '<rect x="', x.toString(), '" y="4" width="15" height="14" rx="2" fill="#161B22" stroke="#21262D" stroke-width="1"/>'
                );
            }
        }
        cells = string.concat(cells, '</g>');
        return cells;
    }

    function _renderYieldConduit(uint8 lockTier, string memory glowColor) internal pure returns (string memory) {
        string memory busbar = '<g transform="translate(472, 175)">';
        uint256 activeSegments = (lockTier >= 5) ? 8 : (lockTier * 2);
        for (uint256 i = 0; i < 8; i++) {
            uint256 y = i * 32;
            if (i < activeSegments) {
                busbar = string.concat(
                    busbar,
                    '<rect x="0" y="', y.toString(), '" width="14" height="16" rx="3" fill="', glowColor, '" opacity="0.85" filter="url(#glow)"/>'
                );
            } else {
                busbar = string.concat(
                    busbar,
                    '<rect x="0" y="', y.toString(), '" width="14" height="16" rx="3" fill="#0D121C" stroke="#21262D" stroke-width="1"/>'
                );
            }
            busbar = string.concat(
                busbar,
                '<line x1="7" y1="', (y + 16).toString(), '" x2="7" y2="', (y + 32).toString(), '" stroke="#21262D" stroke-width="1.5"/>'
            );
        }
        busbar = string.concat(busbar, '</g>');
        return busbar;
    }

    function _renderLeftArmor(uint8 amountTier, uint32 extendCount, string memory accentColor) internal pure returns (string memory) {
        string memory notches = "";
        uint256 activeCount = (amountTier >= 4) ? 8 : (amountTier * 2);
        if (extendCount > 0) activeCount += extendCount;
        if (activeCount > 8) activeCount = 8;

        for (uint256 i = 0; i < 8; i++) {
            uint256 y = 175 + (i * 32);
            if (i < activeCount) {
                notches = string.concat(
                    notches,
                    '<rect x="14" y="', y.toString(), '" width="14" height="10" rx="2" fill="', accentColor, '" filter="url(#glow)"/>',
                    '<circle cx="21" cy="', (y + 5).toString(), '" r="2" fill="#FFFFFF"/>'
                );
            } else {
                notches = string.concat(
                    notches,
                    '<rect x="14" y="', y.toString(), '" width="14" height="10" rx="2" fill="#0F141C" stroke="#21262D" stroke-width="1"/>'
                );
            }
        }
        return notches;
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
        ChassisTheme memory t = getTheme(seed, isEternal, amount);
        ProgressionState memory p = calculateProgression(currentEpoch, createdEpoch, unlockEpoch, amount, seed, extendCount, walletActiveSlots, isEternal);

        uint256 naraWhole = uint256(amount) / 1e18;
        uint256 lockDays = (unlockEpoch > createdEpoch) ? (uint256(unlockEpoch - createdEpoch) / EPOCHS_PER_DAY) : 0;
        if (isEternal) lockDays = 9999;

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700" width="100%" height="100%" style="background:#030509;font-family:\'IBM Plex Mono\',monospace;">',
            '<defs>',
            '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '<filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.9"/></filter>',

            // Alloy Gradients
            '<linearGradient id="damascusFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F8FAFC"/><stop offset="25%" stop-color="#94A3B8"/><stop offset="50%" stop-color="#38BDF8"/><stop offset="75%" stop-color="#334155"/><stop offset="100%" stop-color="#0F172A"/></linearGradient>',
            '<linearGradient id="damascusPin" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#38BDF8"/><stop offset="50%" stop-color="#F8FAFC"/><stop offset="100%" stop-color="#0284C7"/></linearGradient>',
            '<linearGradient id="goldFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE066"/><stop offset="35%" stop-color="#FFB800"/><stop offset="70%" stop-color="#D48800"/><stop offset="100%" stop-color="#553300"/></linearGradient>',
            '<linearGradient id="obsidianFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#252A36"/><stop offset="50%" stop-color="#12151C"/><stop offset="100%" stop-color="#07090C"/></linearGradient>',
            '<linearGradient id="emeraldFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00FF88"/><stop offset="35%" stop-color="#083321"/><stop offset="100%" stop-color="#020D08"/></linearGradient>',
            '<linearGradient id="titaniumFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3A4659"/><stop offset="50%" stop-color="#181F2C"/><stop offset="100%" stop-color="#0B0E14"/></linearGradient>',

            // Background Guilloche Hex Lattice Pattern
            '<pattern id="hexGrid" width="24" height="24" patternUnits="userSpaceOnUse">',
            '<path d="M 12 0 L 24 6.9 L 24 20.7 L 12 27.6 L 0 20.7 L 0 6.9 Z" fill="none" stroke="', t.hexGridColor, '" stroke-width="0.75"/>',
            '</pattern>',
            '</defs>',

            // 1. Outer Heavy Chassis Plate
            '<rect x="8" y="8" width="484" height="684" rx="26" fill="', t.frameOuter, '" filter="url(#shadow)"/>',
            '<rect x="18" y="18" width="464" height="664" rx="20" fill="', t.frameInner, '" stroke="', t.pinStripe, '" stroke-width="1.2"/>',
            '<rect x="20" y="20" width="460" height="660" rx="18" fill="url(#hexGrid)"/>',

            // 2. Heavy Corner Reinforcement Plates & 3D Hex-Bolts
            '<path d="M 18 64 L 64 18 M 436 18 L 482 64 M 18 636 L 64 682 M 436 682 L 482 636" stroke="', t.bracket, '" stroke-width="3"/>',
            _renderHexBolts(t.bracket),

            // 3. Top Status Header
            '<g transform="translate(42, 34)">',
            '<circle cx="14" cy="13" r="14" fill="#0D1117" stroke="', t.bracket, '" stroke-width="1.5"/>',
            '<circle cx="14" cy="13" r="10" fill="', t.badgeBg, '" stroke="', t.glowColor, '" stroke-width="1"/>',
            '<text x="14" y="17" fill="', t.sigilColor, '" font-size="11" font-weight="bold" text-anchor="middle">N</text>',
            '</g>',
            _renderBatteryHUD(p.chargedCells, t.glowColor),
            '<rect x="360" y="36" width="98" height="22" rx="6" fill="', t.badgeBg, '" stroke="', t.accentColor, '" stroke-width="1"/>',
            '<circle cx="370" cy="47" r="3" fill="', t.accentColor, '" filter="url(#glow)"/>',
            '<text x="378" y="51" fill="', t.accentColor, '" font-size="8" font-weight="bold">', p.fleetTitle, '</text>',

            // 4. Alloy Header with 4.0X Lock Boost Badge
            '<g transform="translate(36, 74)">',
            '<rect x="0" y="0" width="428" height="34" rx="8" fill="#0D1117" stroke="#21262D" stroke-width="1"/>',
            '<rect x="8" y="7" width="180" height="20" rx="4" fill="', t.badgeBg, '" stroke="', t.badgeText, '" stroke-width="1"/>',
            '<text x="14" y="21" fill="', t.badgeText, '" font-size="10" font-weight="bold">ALLOY: ', t.name, '</text>',
            // Multiplier Badge
            '<rect x="200" y="7" width="95" height="20" rx="4" fill="', (p.lockTier >= 5 ? t.glowColor : "#161B22"), '" stroke="', t.accentColor, '" stroke-width="1"/>',
            '<text x="247" y="21" fill="', (p.lockTier >= 5 ? "#FFFFFF" : t.accentColor), '" font-size="9" font-weight="bold" text-anchor="middle">', p.lockBoostLabel, '</text>',
            '<text x="418" y="21" fill="#8B949E" font-size="9" font-weight="bold" text-anchor="end">', p.rankTitle, '</text>',
            '</g>',

            // 5. Dynamic Swiss Chronometer Quantum Reactor (Scaled by Amount, Lock Tier, Seed, and Ascensions)
            _renderDynamicReactor(t, p),

            // 6. Side Conduits (Left Armor Clamps + Right Yield Busbars)
            _renderLeftArmor(p.amountTier, extendCount, t.accentColor),
            _renderYieldConduit(p.lockTier, t.glowColor),

            // 7. Luxury Financial Instrument Panel
            '<g transform="translate(36, 462)">',
            '<rect x="0" y="0" width="428" height="78" rx="10" fill="#090D14" stroke="#21262D" stroke-width="1"/>',
            // Pod 1: Locked Principal
            '<rect x="10" y="10" width="198" height="58" rx="6" fill="#0D121C" stroke="#161B22" stroke-width="1"/>',
            '<text x="24" y="30" fill="#8B949E" font-size="9" font-weight="bold">LOCKED PRINCIPAL</text>',
            '<text x="24" y="56" fill="#F0F6FC" font-size="18" font-weight="bold">', naraWhole.toString(), ' NARA</text>',
            // Pod 2: Time Commitment
            '<rect x="220" y="10" width="198" height="58" rx="6" fill="#0D121C" stroke="#161B22" stroke-width="1"/>',
            '<text x="234" y="30" fill="#8B949E" font-size="9" font-weight="bold">TIME COMMITMENT</text>',
            '<text x="234" y="56" fill="', t.accentColor, '" font-size="18" font-weight="bold">', lockDays.toString(), ' DAYS</text>',
            '</g>',

            // 8. Ascension Seal
            '<g transform="translate(36, 550)">',
            '<rect x="0" y="0" width="428" height="42" rx="8" fill="', t.badgeBg, '" stroke="', t.pinStripe, '" stroke-width="1.2"/>',
            '<text x="214" y="26" fill="', t.sigilColor, '" font-size="12" font-weight="bold" text-anchor="middle">', unicode"★ ", p.ascensionLabel, unicode" ★", '</text>',
            '</g>',

            // Blockchain Telemetry Footer
            '<text x="250" y="625" fill="#586069" font-size="9" font-weight="bold" text-anchor="middle">TOKEN #', tokenId.toString(), ' | POS #', positionId.toString(), ' | EXTENDS: ', uint256(extendCount).toString(), ' | CLAIMS: ', uint256(claimCount).toString(), '</text>',
            '<text x="250" y="642" fill="#30363D" font-size="8" text-anchor="middle">BASE MAINNET // IMMUTABLE PURE ON-CHAIN PROVENANCE</text>',
            '</svg>'
        );
    }

    function _renderDynamicReactor(ChassisTheme memory t, ProgressionState memory p) internal pure returns (string memory) {
        string memory corePoly = "";
        if (p.coreShape == 0) {
            // Octagon
            corePoly = '<polygon points="0,-48 34,-34 48,0 34,34 0,48 -34,34 -48,0 -34,-34" fill="none" stroke="';
        } else if (p.coreShape == 1) {
            // Hexagon
            corePoly = '<polygon points="0,-46 40,-23 40,23 0,46 -40,23 -40,-23" fill="none" stroke="';
        } else if (p.coreShape == 2) {
            // Dodecagon
            corePoly = '<polygon points="0,-48 24,-42 42,-24 48,0 42,24 24,42 0,48 -24,42 -42,24 -48,0 -42,-24 -24,-42" fill="none" stroke="';
        } else {
            // 8-Point Star
            corePoly = '<polygon points="0,-50 14,-20 45,-20 22,-4 35,28 0,12 -35,28 -22,-4 -45,-20 -14,-20" fill="none" stroke="';
        }

        // Plasma Core Radius scales with Amount Tier (6 to 34 px)
        uint256 coreR = 6 + (uint256(p.amountTier) * 5);
        uint256 glowR = coreR * 2;

        return string.concat(
            '<g transform="translate(250, 285)">',
            // Outer Gear-Teeth Ring (Rotated uniquely by seed!)
            '<g transform="rotate(', uint256(p.rotationAngle).toString(), ')">',
            (p.lockTier >= 4 || p.amountTier >= 4)
                ? '<circle cx="0" cy="0" r="132" fill="none" stroke="#161B22" stroke-width="4" stroke-dasharray="6 11"/>'
                : '',
            '<circle cx="0" cy="0" r="126" fill="none" stroke="', t.pinStripe, '" stroke-width="1" opacity="0.85"/>',
            '</g>',

            // Swiss Tachymeter Degree Markings
            '<circle cx="0" cy="0" r="118" fill="none" stroke="#21262D" stroke-width="1" stroke-dasharray="2 4"/>',
            '<text x="0" y="-120" fill="#8B949E" font-size="8" font-weight="bold" text-anchor="middle">', unicode"000°", '</text>',
            '<text x="88" y="-88" fill="#484F58" font-size="7" text-anchor="middle">', unicode"045°", '</text>',
            '<text x="122" y="3" fill="#8B949E" font-size="8" font-weight="bold" text-anchor="start">', unicode"090°", '</text>',
            '<text x="88" y="92" fill="#484F58" font-size="7" text-anchor="middle">', unicode"135°", '</text>',
            '<text x="0" y="125" fill="#8B949E" font-size="8" font-weight="bold" text-anchor="middle">', unicode"180°", '</text>',
            '<text x="-88" y="92" fill="#484F58" font-size="7" text-anchor="middle">', unicode"225°", '</text>',
            '<text x="-122" y="3" fill="#8B949E" font-size="8" font-weight="bold" text-anchor="end">', unicode"270°", '</text>',
            '<text x="-88" y="-88" fill="#484F58" font-size="7" text-anchor="middle">', unicode"315°", '</text>',

            // Stator Turbine Fins (Scaled by Lock Tier & Rotated by seed!)
            '<g transform="rotate(', uint256(p.rotationAngle).toString(), ')">',
            (p.lockTier >= 5)
                ? string.concat('<path d="M 0 -115 L 0 -85 M 0 115 L 0 85 M -115 0 L -85 0 M 115 0 L 85 0 M -81 -81 L -60 -60 M 81 81 L 60 60 M -81 81 L -60 60 M 81 -81 L 60 -60" stroke="', t.bracket, '" stroke-width="2.5"/>')
                : (p.lockTier >= 3
                    ? string.concat('<path d="M 0 -110 L 0 -80 M 0 110 L 0 80 M -110 0 L -80 0 M 110 0 L 80 0" stroke="', t.bracket, '" stroke-width="2"/>')
                    : '<path d="M 0 -95 L 0 -75 M 0 95 L 0 75" stroke="#21262D" stroke-width="1.5"/>'),
            '</g>',

            // Concentric Gyroscope Inner Rings
            '<circle cx="0" cy="0" r="85" fill="#060910" stroke="', t.glowColor, '" stroke-width="2" filter="url(#glow)" opacity="0.9"/>',
            '<circle cx="0" cy="0" r="68" fill="none" stroke="', t.pinStripe, '" stroke-width="1.5" stroke-dasharray="14 8"/>',
            '<circle cx="0" cy="0" r="50" fill="#0A0E17" stroke="', t.bracket, '" stroke-width="2"/>',

            // Procedural Core Polygon
            corePoly, t.pinStripe, '" stroke-width="2.5" filter="url(#glow)"/>',

            // Amount-Scaled Plasma Core Output
            '<circle cx="0" cy="0" r="', glowR.toString(), '" fill="', t.glowColor, '" opacity="0.45" filter="url(#glow)"/>',
            '<circle cx="0" cy="0" r="', coreR.toString(), '" fill="#FFFFFF" filter="url(#glow)"/>',
            '<circle cx="0" cy="0" r="', (coreR / 2).toString(), '" fill="', t.sigilColor, '"/>',
            '</g>'
        );
    }
}
