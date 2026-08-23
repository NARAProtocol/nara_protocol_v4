// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title NARAArtCorePlateV4
/// @notice Master luxury Swiss chronometer & aerospace generative art engine.
/// @dev 100% Pure On-Chain SVG rendering with Granular 1.00X-10.00X Multi-Vector Power Metrics & Battery HUD.
contract NARAArtCorePlateV4 {
    using Strings for uint256;

    uint256 public constant CORE_PLATE_VERSION = 17;
    uint64 public constant EPOCHS_PER_DAY = 96;
    uint64 public constant EPOCHS_PER_YEAR = 35040;
    uint256 internal constant WAD = 1e18;
    uint256 public constant MAX_POWER_MULTIPLIER_WAD = 10 * 1e18; // 10.00X WAD

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
        uint256 baseMultiplierWad;      // Base Lock Multiplier: 1.00e18 to 4.00e18
        uint256 totalPowerMultiplierWad;// Comprehensive Multi-Vector Power Multiplier: 1.00e18 to 10.00e18
        string multiplierLabel;         // e.g. "4.00X"
        string totalPowerLabel;         // e.g. "8.50X"
        uint8 chargedCells;             // 1 to 10 Battery HUD cells
        uint8 amountTier;               // 1 (<25) to 5 (1000+)
        uint16 rotationAngle;
        uint8 coreShape;                // 0 = Octagon, 1 = Hexagon, 2 = Dodecagon, 3 = Star
    }

    /// @notice Calculates the base continuous quadratic lock multiplier matching NARAEngineModelLib
    function calculateMultiplierWad(uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (uint256) {
        if (isEternal) return 4 * WAD;
        if (unlockEpoch <= createdEpoch) return WAD;
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration > EPOCHS_PER_YEAR) duration = EPOCHS_PER_YEAR;

        uint256 r = Math.mulDiv(uint256(duration), WAD, uint256(EPOCHS_PER_YEAR));
        uint256 r2 = Math.mulDiv(r, r, WAD);
        return WAD + Math.mulDiv(0.5e18, r, WAD) + Math.mulDiv(2.5e18, r2, WAD); // 1.00e18 to 4.00e18
    }

    /// @notice Calculates comprehensive 1.00X to 10.00X multi-vector power metrics across Time, Staking Longevity, and Fleet Synergy
    function calculateComprehensivePowerWad(
        uint256 baseMultiplierWad,
        uint256 ageInEpochs,
        uint32 extendCount,
        uint256 walletActiveSlots,
        bool isEternal
    ) public pure returns (uint256) {
        if (isEternal) return MAX_POWER_MULTIPLIER_WAD;

        uint256 powerWad = baseMultiplierWad;

        // Vector 2: Aging & Extension Loyalty Boost (up to +3.00X)
        if (ageInEpochs >= (EPOCHS_PER_YEAR * 3) || extendCount >= 4) {
            powerWad += 3.0e18; // Ascension II Sovereign Boost
        } else if (ageInEpochs >= (EPOCHS_PER_YEAR * 2) || extendCount >= 2) {
            powerWad += 2.0e18; // Ascension I Supernova Boost
        } else if (ageInEpochs >= 23360) {
            powerWad += 1.5e18; // Tachyon Warp
        } else if (ageInEpochs >= 11520) {
            powerWad += 1.0e18; // Orbital Gyro
        } else if (ageInEpochs >= 2880) {
            powerWad += 0.5e18; // Circuit Ignition
        }

        // Vector 3: Fleet Grid Formation Synergy Boost (up to +3.00X)
        if (walletActiveSlots >= 64) {
            powerWad += 3.0e18; // Sovereign Master Grid
        } else if (walletActiveSlots >= 32) {
            powerWad += 2.0e18; // Galactic Cluster
        } else if (walletActiveSlots >= 16) {
            powerWad += 1.5e18; // Armada Fleet
        } else if (walletActiveSlots >= 6) {
            powerWad += 1.0e18; // Hexa Armada
        } else if (walletActiveSlots >= 4) {
            powerWad += 0.6e18; // Quad Squadron
        } else if (walletActiveSlots >= 2) {
            powerWad += 0.2e18; // Dual Strike
        }

        if (powerWad > MAX_POWER_MULTIPLIER_WAD) {
            return MAX_POWER_MULTIPLIER_WAD;
        }
        return powerWad;
    }

    function formatMultiplier(uint256 mWad) public pure returns (string memory) {
        uint256 whole = mWad / WAD;
        uint256 frac = (mWad % WAD) / 1e16; // 2 decimal places
        string memory fracStr = frac < 10 ? string.concat("0", frac.toString()) : frac.toString();
        return string.concat(whole.toString(), ".", fracStr, "X");
    }

    function computeLuckBonus(uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (uint256) {
        if (isEternal) return 350;
        if (unlockEpoch <= createdEpoch) return 0;
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration > EPOCHS_PER_YEAR) duration = EPOCHS_PER_YEAR;
        return (uint256(duration) * 350) / EPOCHS_PER_YEAR;
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
        p.ageInEpochs = currentEpoch > createdEpoch ? uint256(currentEpoch - createdEpoch) : 0;
        p.baseMultiplierWad = calculateMultiplierWad(createdEpoch, unlockEpoch, isEternal);
        p.totalPowerMultiplierWad = calculateComprehensivePowerWad(p.baseMultiplierWad, p.ageInEpochs, extendCount, walletActiveSlots, isEternal);
        
        p.multiplierLabel = formatMultiplier(p.baseMultiplierWad);
        p.totalPowerLabel = formatMultiplier(p.totalPowerMultiplierWad);

        // 1. Continuous Battery HUD mapping: 1.00X - 10.00X mapped across 10 cells (1 cell per 1.00X)
        uint256 cellProgress = Math.mulDiv(p.totalPowerMultiplierWad - WAD, 9, 9 * WAD);
        p.chargedCells = uint8(1 + cellProgress);
        if (p.chargedCells > 10 || isEternal || p.totalPowerMultiplierWad >= MAX_POWER_MULTIPLIER_WAD) {
            p.chargedCells = 10;
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
        } else if (p.baseMultiplierWad == 4 * WAD) {
            p.rank = 10;
            p.rankTitle = "1-YEAR HORIZON";
        } else if (p.ageInEpochs >= 23360 || p.baseMultiplierWad >= 2.75e18) {
            p.rank = 7;
            p.rankTitle = "TACHYON WARP";
        } else if (p.ageInEpochs >= 11520 || p.baseMultiplierWad >= 1.85e18) {
            p.rank = 5;
            p.rankTitle = "ORBITAL GYRO";
        } else if (p.ageInEpochs >= 2880 || p.baseMultiplierWad >= 1.25e18) {
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

        // 6. Fleet Grid Synergy Title
        if (walletActiveSlots >= 64) {
            p.fleetTitle = "FLEET 64/64: SOVEREIGN MASTER";
        } else if (walletActiveSlots >= 32) {
            p.fleetTitle = "FLEET 32/64: GALACTIC CLUSTER";
        } else if (walletActiveSlots >= 16) {
            p.fleetTitle = "FLEET 16/64: ARMADA FLEET";
        } else if (walletActiveSlots >= 6) {
            p.fleetTitle = "FLEET: HEXA ARMADA (+25%)";
        } else if (walletActiveSlots == 5) {
            p.fleetTitle = "FLEET: PENTA FORMATION (+20%)";
        } else if (walletActiveSlots == 4) {
            p.fleetTitle = "FLEET: QUAD SQUADRON (+15%)";
        } else if (walletActiveSlots == 3) {
            p.fleetTitle = "FLEET: TRI-VANGUARD (+10%)";
        } else if (walletActiveSlots == 2) {
            p.fleetTitle = "FLEET: DUAL STRIKE (+5%)";
        } else {
            p.fleetTitle = "FLEET: SOLO VANGUARD";
        }
    }

    function getTheme(
        uint256 seed,
        bool isEternal,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch
    ) public pure returns (ChassisTheme memory t) {
        uint256 rawRoll = seed % 1000;
        uint256 luck = computeLuckBonus(createdEpoch, unlockEpoch, isEternal);
        uint256 roll = rawRoll > luck ? rawRoll - luck : 0;
        uint256 naraWhole = uint256(amount) / 1e18;

        uint256 damascusThreshold = (naraWhole >= 100) ? 40 : 20;
        uint256 goldThreshold = (naraWhole >= 100) ? 130 : 65;

        if (isEternal || roll < damascusThreshold) {
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

    function _renderYieldConduit(uint256 totalPowerWad, string memory glowColor) internal pure returns (string memory) {
        string memory busbar = '<g transform="translate(472, 175)">';
        uint256 activeSegments = Math.mulDiv(totalPowerWad - WAD, 8, 9 * WAD) + 1;
        if (activeSegments > 8) activeSegments = 8;

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
        ChassisTheme memory t = getTheme(seed, isEternal, amount, createdEpoch, unlockEpoch);
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

            // Background Hex Lattice Pattern
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
            '<rect x="340" y="36" width="118" height="22" rx="6" fill="', t.badgeBg, '" stroke="', t.accentColor, '" stroke-width="1"/>',
            '<circle cx="350" cy="47" r="3" fill="', t.accentColor, '" filter="url(#glow)"/>',
            '<text x="358" y="51" fill="', t.accentColor, '" font-size="7.5" font-weight="bold">', p.fleetTitle, '</text>',

            // 4. Alloy Header with Comprehensive Multi-Vector Multiplier Badge
            '<g transform="translate(36, 74)">',
            '<rect x="0" y="0" width="428" height="34" rx="8" fill="#0D1117" stroke="#21262D" stroke-width="1"/>',
            '<rect x="8" y="7" width="180" height="20" rx="4" fill="', t.badgeBg, '" stroke="', t.badgeText, '" stroke-width="1"/>',
            '<text x="14" y="21" fill="', t.badgeText, '" font-size="10" font-weight="bold">ALLOY: ', t.name, '</text>',
            // Multi-Vector Power Badge (1.00X - 10.00X)
            '<rect x="200" y="7" width="105" height="20" rx="4" fill="', (p.totalPowerMultiplierWad >= 4.0e18 ? t.glowColor : "#161B22"), '" stroke="', t.accentColor, '" stroke-width="1"/>',
            '<text x="252" y="21" fill="', (p.totalPowerMultiplierWad >= 4.0e18 ? "#FFFFFF" : t.accentColor), '" font-size="9" font-weight="bold" text-anchor="middle">', p.totalPowerLabel, ' POWER</text>',
            '<text x="418" y="21" fill="#8B949E" font-size="9" font-weight="bold" text-anchor="end">', p.rankTitle, '</text>',
            '</g>',

            // 5. Dynamic Swiss Chronometer Quantum Reactor
            _renderDynamicReactor(t, p),

            // 6. Side Conduits
            _renderLeftArmor(p.amountTier, extendCount, t.accentColor),
            _renderYieldConduit(p.totalPowerMultiplierWad, t.glowColor),

            // 7. Financial Instrument Panel
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
            corePoly = '<polygon points="0,-48 34,-34 48,0 34,34 0,48 -34,34 -48,0 -34,-34" fill="none" stroke="';
        } else if (p.coreShape == 1) {
            corePoly = '<polygon points="0,-46 40,-23 40,23 0,46 -40,23 -40,-23" fill="none" stroke="';
        } else if (p.coreShape == 2) {
            corePoly = '<polygon points="0,-48 24,-42 42,-24 48,0 42,24 24,42 0,48 -24,42 -42,24 -48,0 -42,-24 -24,-42" fill="none" stroke="';
        } else {
            corePoly = '<polygon points="0,-50 14,-20 45,-20 22,-4 35,28 0,12 -35,28 -22,-4 -45,-20 -14,-20" fill="none" stroke="';
        }

        uint256 coreR = 6 + (uint256(p.amountTier) * 5);
        uint256 glowR = coreR * 2;

        return string.concat(
            '<g transform="translate(250, 285)">',
            '<g transform="rotate(', uint256(p.rotationAngle).toString(), ')">',
            (p.totalPowerMultiplierWad >= 4.0e18 || p.amountTier >= 4)
                ? '<circle cx="0" cy="0" r="132" fill="none" stroke="#161B22" stroke-width="4" stroke-dasharray="6 11"/>'
                : '',
            '<circle cx="0" cy="0" r="126" fill="none" stroke="', t.pinStripe, '" stroke-width="1" opacity="0.85"/>',
            '</g>',

            '<circle cx="0" cy="0" r="118" fill="none" stroke="#21262D" stroke-width="1" stroke-dasharray="2 4"/>',
            '<text x="0" y="-120" fill="#8B949E" font-size="8" font-weight="bold" text-anchor="middle">', unicode"000°", '</text>',
            '<text x="88" y="-88" fill="#484F58" font-size="7" text-anchor="middle">', unicode"045°", '</text>',
            '<text x="122" y="3" fill="#8B949E" font-size="8" font-weight="bold" text-anchor="start">', unicode"090°", '</text>',
            '<text x="88" y="92" fill="#484F58" font-size="7" text-anchor="middle">', unicode"135°", '</text>',
            '<text x="0" y="125" fill="#8B949E" font-size="8" font-weight="bold" text-anchor="middle">', unicode"180°", '</text>',
            '<text x="-88" y="92" fill="#484F58" font-size="7" text-anchor="middle">', unicode"225°", '</text>',
            '<text x="-122" y="3" fill="#8B949E" font-size="8" font-weight="bold" text-anchor="end">', unicode"270°", '</text>',
            '<text x="-88" y="-88" fill="#484F58" font-size="7" text-anchor="middle">', unicode"315°", '</text>',

            '<g transform="rotate(', uint256(p.rotationAngle).toString(), ')">',
            (p.totalPowerMultiplierWad >= 6.0e18)
                ? string.concat('<path d="M 0 -115 L 0 -85 M 0 115 L 0 85 M -115 0 L -85 0 M 115 0 L 85 0 M -81 -81 L -60 -60 M 81 81 L 60 60 M -81 81 L -60 60 M 81 -81 L 60 -60" stroke="', t.bracket, '" stroke-width="2.5"/>')
                : (p.totalPowerMultiplierWad >= 3.0e18
                    ? string.concat('<path d="M 0 -110 L 0 -80 M 0 110 L 0 80 M -110 0 L -80 0 M 110 0 L 80 0" stroke="', t.bracket, '" stroke-width="2"/>')
                    : '<path d="M 0 -95 L 0 -75 M 0 95 L 0 75" stroke="#21262D" stroke-width="1.5"/>'),
            '</g>',

            '<circle cx="0" cy="0" r="85" fill="#060910" stroke="', t.glowColor, '" stroke-width="2" filter="url(#glow)" opacity="0.9"/>',
            '<circle cx="0" cy="0" r="68" fill="none" stroke="', t.pinStripe, '" stroke-width="1.5" stroke-dasharray="14 8"/>',
            '<circle cx="0" cy="0" r="50" fill="#0A0E17" stroke="', t.bracket, '" stroke-width="2"/>',

            corePoly, t.pinStripe, '" stroke-width="2.5" filter="url(#glow)"/>',

            '<circle cx="0" cy="0" r="', glowR.toString(), '" fill="', t.glowColor, '" opacity="0.45" filter="url(#glow)"/>',
            '<circle cx="0" cy="0" r="', coreR.toString(), '" fill="#FFFFFF" filter="url(#glow)"/>',
            '<circle cx="0" cy="0" r="', (coreR / 2).toString(), '" fill="', t.sigilColor, '"/>',
            '</g>'
        );
    }
}
