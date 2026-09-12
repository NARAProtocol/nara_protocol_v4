// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface INARAArtDefsPlateV5 {
    function renderDefs(
        string memory gradC0,
        string memory gradC1,
        string memory gradC2,
        string memory hexGridColor,
        bool isApex
    ) external pure returns (string memory);

    function renderApexDecorations() external pure returns (string memory);
}

/// @title NARAArtCorePlateV5
/// @notice Master luxury Swiss chronometer & aerospace generative art engine.
/// @dev 100% Pure On-Chain SVG rendering with 360-Degree Symmetrical Bullion Gold Apex, Grandfathered Gen-0, & Calibrated Odds.
contract NARAArtCorePlateV5 {
    using Strings for uint256;

    uint256 public constant CORE_PLATE_VERSION = 19;
    uint64 public constant EPOCHS_PER_DAY = 96;
    uint64 public constant EPOCHS_PER_YEAR = 35040;
    uint256 internal constant WAD = 1e18;
    uint256 public constant MAX_POWER_MULTIPLIER_WAD = 10 * 1e18; // 10.00X WAD

    INARAArtDefsPlateV5 public immutable DEFS;

    constructor(address defsPlate_) {
        require(defsPlate_ != address(0), "Defs zero");
        DEFS = INARAArtDefsPlateV5(defsPlate_);
    }

    struct ChassisTheme {
        string name;
        string seal;
        string gradC0;
        string gradC1;
        string gradC2;
        string frameInner;
        string pinStripe;
        string bracket;
        string glowColor;
        string sigilColor;
        string accentColor;
        string badgeBg;
        string badgeText;
        string hexGridColor;
        bool isApex;
    }

    struct ProgressionState {
        string rankTitle;
        string fleetTitle;
        uint256 ageInEpochs;
        uint256 totalPowerMultiplierWad;
        string totalPowerLabel;
        uint8 chargedCells;
        uint8 amountTier;
        uint16 rotationAngle;
        uint8 coreShape;
    }

    function calculateMultiplierWad(uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (uint256) {
        if (isEternal) return 4 * WAD;
        if (unlockEpoch <= createdEpoch) return WAD;
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration > EPOCHS_PER_YEAR) duration = EPOCHS_PER_YEAR;

        uint256 r = Math.mulDiv(uint256(duration), WAD, uint256(EPOCHS_PER_YEAR));
        uint256 r2 = Math.mulDiv(r, r, WAD);
        return WAD + Math.mulDiv(0.5e18, r, WAD) + Math.mulDiv(2.5e18, r2, WAD);
    }

    function calculateComprehensivePowerWad(
        uint256 baseMultiplierWad,
        uint256 ageInEpochs,
        uint32 extendCount,
        uint256 walletActiveSlots,
        bool isEternal
    ) public pure returns (uint256) {
        if (isEternal) return MAX_POWER_MULTIPLIER_WAD;

        uint256 powerWad = baseMultiplierWad;

        if (ageInEpochs >= (EPOCHS_PER_YEAR * 3) || extendCount >= 4) {
            powerWad += 3.0e18;
        } else if (ageInEpochs >= (EPOCHS_PER_YEAR * 2) || extendCount >= 2) {
            powerWad += 2.0e18;
        } else if (ageInEpochs >= 23360) {
            powerWad += 1.5e18;
        } else if (ageInEpochs >= 11520) {
            powerWad += 1.0e18;
        } else if (ageInEpochs >= 2880) {
            powerWad += 0.5e18;
        }

        if (walletActiveSlots >= 64) {
            powerWad += 3.0e18;
        } else if (walletActiveSlots >= 32) {
            powerWad += 2.0e18;
        } else if (walletActiveSlots >= 16) {
            powerWad += 1.5e18;
        } else if (walletActiveSlots >= 6) {
            powerWad += 1.0e18;
        } else if (walletActiveSlots >= 4) {
            powerWad += 0.6e18;
        } else if (walletActiveSlots >= 2) {
            powerWad += 0.2e18;
        }

        if (powerWad > MAX_POWER_MULTIPLIER_WAD) {
            return MAX_POWER_MULTIPLIER_WAD;
        }
        return powerWad;
    }

    function formatMultiplier(uint256 mWad) public pure returns (string memory) {
        uint256 whole = mWad / WAD;
        uint256 frac = (mWad % WAD) / 1e16;
        return string.concat(whole.toString(), ".", frac < 10 ? "0" : "", frac.toString(), "X");
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
        uint256 baseMultiplierWad = calculateMultiplierWad(createdEpoch, unlockEpoch, isEternal);
        p.totalPowerMultiplierWad = calculateComprehensivePowerWad(baseMultiplierWad, p.ageInEpochs, extendCount, walletActiveSlots, isEternal);
        
        p.totalPowerLabel = formatMultiplier(p.totalPowerMultiplierWad);

        uint256 cellProgress = Math.mulDiv(p.totalPowerMultiplierWad - WAD, 9, 9 * WAD);
        p.chargedCells = uint8(1 + cellProgress);
        if (p.chargedCells > 10 || isEternal || p.totalPowerMultiplierWad >= MAX_POWER_MULTIPLIER_WAD) {
            p.chargedCells = 10;
        }

        uint256 naraWhole = uint256(amount) / 1e18;
        if (naraWhole >= 1000) {
            p.amountTier = 5;
        } else if (naraWhole >= 500) {
            p.amountTier = 4;
        } else if (naraWhole >= 100) {
            p.amountTier = 3;
        } else if (naraWhole >= 25) {
            p.amountTier = 2;
        } else {
            p.amountTier = 1;
        }

        p.rotationAngle = uint16((seed % 12) * 30);
        p.coreShape = uint8(seed % 4);

        if (isEternal || p.ageInEpochs >= EPOCHS_PER_YEAR) {
            p.rankTitle = "APEX VETERAN";
        } else if (baseMultiplierWad == 4 * WAD) {
            p.rankTitle = "1-YEAR HORIZON";
        } else if (p.ageInEpochs >= 23360 || baseMultiplierWad >= 2.75e18) {
            p.rankTitle = "TACHYON WARP";
        } else if (p.ageInEpochs >= 11520 || baseMultiplierWad >= 1.85e18) {
            p.rankTitle = "ORBITAL GYRO";
        } else if (p.ageInEpochs >= 2880 || baseMultiplierWad >= 1.25e18) {
            p.rankTitle = "CIRCUIT IGNITION";
        } else {
            p.rankTitle = "DORMANT NODE";
        }

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

    function determineTier(
        uint256 tokenId,
        uint256 seed,
        bool isEternal,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch
    ) public pure returns (uint8) {
        if (tokenId <= 47 && tokenId > 0) {
            uint256 rawRoll = seed % 1000;
            uint256 luck = computeLuckBonus(createdEpoch, unlockEpoch, isEternal);
            uint256 roll = rawRoll > luck ? rawRoll - luck : 0;
            uint256 naraWhole = uint256(amount) / 1e18;

            uint256 damascusThreshold = (naraWhole >= 100) ? 40 : 20;
            uint256 goldThreshold = (naraWhole >= 100) ? 130 : 65;

            if (isEternal || roll < damascusThreshold) return 1; // Damascus
            if (roll < goldThreshold) return 0; // Gold
            if (roll < 260) return 2; // Obsidian Void
            if (roll < 580) return 3; // Emerald
            return 4; // Slate
        }

        uint256 pRoll = seed % 1000;
        uint256 duration = (unlockEpoch > createdEpoch) ? (unlockEpoch - createdEpoch) : 0;
        if (duration > EPOCHS_PER_YEAR) duration = EPOCHS_PER_YEAR;
        uint256 luckBps = isEternal ? 1000 : (duration * 1000) / EPOCHS_PER_YEAR;
        bool isWhale = (uint256(amount) / 1e18) >= 5000;

        uint256 goldWidth = 10 + (luckBps * 35) / 1000 + (isWhale ? 20 : 0);
        uint256 damascusWidth = 40 + (luckBps * 65) / 1000 + (isWhale ? 40 : 0);
        uint256 obsidianWidth = 150 + (luckBps * 70) / 1000;
        uint256 emeraldWidth = 300 + (luckBps * 50) / 1000 - (isWhale ? 20 : 0);

        if (pRoll < goldWidth) return 0; // Gold
        if (pRoll < goldWidth + damascusWidth) return 1; // Damascus
        if (pRoll < goldWidth + damascusWidth + obsidianWidth) return 2; // Obsidian Void
        if (pRoll < goldWidth + damascusWidth + obsidianWidth + emeraldWidth) return 3; // Emerald
        return 4; // Slate
    }

    function getThemeByTier(uint8 tier) public pure returns (ChassisTheme memory) {
        if (tier == 0) {
            return ChassisTheme({
                name: "24K Gilded Gold",
                seal: unicode"👑 #1 APEX GRAIL · 24K Gilded Gold 👑",
                gradC0: "#FFE082",
                gradC1: "#FFB300",
                gradC2: "#FFC837",
                frameInner: "#080602",
                pinStripe: "#FFE57F",
                bracket: "#FFC837",
                glowColor: "#FFAB00",
                sigilColor: "#FFFDF0",
                accentColor: "#FFD54F",
                badgeBg: "rgba(255,193,7,.22)",
                badgeText: "#FFF8E1",
                hexGridColor: "rgba(255,215,64,.09)",
                isApex: true
            });
        }
        if (tier == 1) {
            return ChassisTheme({
                name: "Forged Damascus Meteorite",
                seal: unicode"👑 #2 LEGENDARY · Forged Damascus Meteorite 👑",
                gradC0: "#38BDF8",
                gradC1: "#0284C7",
                gradC2: "#0369A1",
                frameInner: "#02050E",
                pinStripe: "#67E8F9",
                bracket: "#0284C7",
                glowColor: "#0090C8",
                sigilColor: "#F0F9FF",
                accentColor: "#38BDF8",
                badgeBg: "rgba(2,132,199,.16)",
                badgeText: "#7DD3FC",
                hexGridColor: "rgba(56,189,248,.05)",
                isApex: false
            });
        }
        if (tier == 2) {
            return ChassisTheme({
                name: "Obsidian Void",
                seal: unicode"👑 #3 RARE · Obsidian Void 👑",
                gradC0: "#C084FC",
                gradC1: "#9333EA",
                gradC2: "#7E22CE",
                frameInner: "#06020A",
                pinStripe: "#C084FC",
                bracket: "#9333EA",
                glowColor: "#7E22CE",
                sigilColor: "#FAF5FF",
                accentColor: "#C084FC",
                badgeBg: "rgba(168,85,247,.16)",
                badgeText: "#E9D5FF",
                hexGridColor: "rgba(168,85,247,.05)",
                isApex: false
            });
        }
        if (tier == 3) {
            return ChassisTheme({
                name: "Cybernetic Emerald",
                seal: unicode"👑 #4 UNCOMMON · Cybernetic Emerald 👑",
                gradC0: "#34D399",
                gradC1: "#059669",
                gradC2: "#047857",
                frameInner: "#020B06",
                pinStripe: "#34D399",
                bracket: "#059669",
                glowColor: "#059669",
                sigilColor: "#ECFDF5",
                accentColor: "#34D399",
                badgeBg: "rgba(16,185,129,.15)",
                badgeText: "#6EE7B7",
                hexGridColor: "rgba(16,185,129,.05)",
                isApex: false
            });
        }
        return ChassisTheme({
            name: "Titanium Slate",
            seal: unicode"👑 #5 COMMON · Titanium Slate 👑",
            gradC0: "#94A3B8",
            gradC1: "#64748B",
            gradC2: "#475569",
            frameInner: "#070A12",
            pinStripe: "#60A5FA",
            bracket: "#64748B",
            glowColor: "#2563EB",
            sigilColor: "#E2E8F0",
            accentColor: "#60A5FA",
            badgeBg: "rgba(96,165,250,.12)",
            badgeText: "#93C5FD",
            hexGridColor: "rgba(96,165,250,.04)",
            isApex: false
        });
    }

    function getTheme(
        uint256 tokenId,
        uint256 seed,
        bool isEternal,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch
    ) public pure returns (ChassisTheme memory) {
        uint8 tier = determineTier(tokenId, seed, isEternal, amount, createdEpoch, unlockEpoch);
        return getThemeByTier(tier);
    }

    function _renderHexBolts(string memory bracketColor, bool isApex) internal pure returns (string memory) {
        string memory bolt = string.concat(
            '<circle r="8" fill="#0D1117" stroke="', bracketColor, '" stroke-width="', (isApex ? "2" : "1.5"), '"/>',
            '<polygon points="0,-4 3.5,-2 3.5,2 0,4 -3.5,2 -3.5,-2" fill="', (isApex ? "#FFF9C4" : bracketColor), '"/>'
        );
        return string.concat(
            '<g transform="translate(38,38)">', bolt, '</g><g transform="translate(462,38)">', bolt, '</g><g transform="translate(38,662)">', bolt, '</g><g transform="translate(462,662)">', bolt, '</g>'
        );
    }

    function _renderBatteryHUD(uint8 chargedCells, string memory glowColor) internal pure returns (string memory) {
        string memory cells = '<g transform="translate(145,36)"><rect width="200" height="22" rx="6" fill="#0A0E17" stroke="#21262D"/>';
        for (uint8 i = 1; i <= 10; i++) {
            string memory xStr = (6 + (uint256(i - 1) * 19)).toString();
            if (i <= chargedCells) {
                cells = string.concat(cells, '<rect x="', xStr, '" y="4" width="15" height="14" rx="2" fill="', glowColor, '" filter="url(#glow)"/>');
            } else {
                cells = string.concat(cells, '<rect x="', xStr, '" y="4" width="15" height="14" rx="2" fill="#161B22" stroke="#21262D"/>');
            }
        }
        return string.concat(cells, '</g>');
    }

    function _renderYieldConduit(uint256 totalPowerWad, string memory glowColor) internal pure returns (string memory) {
        string memory busbar = '<g transform="translate(472,175)"><line x1="7" y1="16" x2="7" y2="256" stroke="#21262D" stroke-width="1.5"/>';
        uint256 activeSegments = Math.mulDiv(totalPowerWad - WAD, 8, 9 * WAD) + 1;
        if (activeSegments > 8) activeSegments = 8;

        for (uint256 i = 0; i < 8; i++) {
            string memory yStr = (i * 32).toString();
            if (i < activeSegments) {
                busbar = string.concat(busbar, '<rect y="', yStr, '" width="14" height="16" rx="3" fill="', glowColor, '" opacity=".85" filter="url(#glow)"/>');
            } else {
                busbar = string.concat(busbar, '<rect y="', yStr, '" width="14" height="16" rx="3" fill="#0D121C" stroke="#21262D"/>');
            }
        }
        return string.concat(busbar, '</g>');
    }

    function _renderLeftArmor(uint8 amountTier, uint32 extendCount, string memory accentColor) internal pure returns (string memory) {
        string memory notches = "";
        uint256 activeCount = (amountTier >= 4) ? 8 : (amountTier * 2);
        if (extendCount > 0) activeCount += extendCount;
        if (activeCount > 8) activeCount = 8;

        for (uint256 i = 0; i < 8; i++) {
            uint256 y = 175 + (i * 32);
            string memory yStr = y.toString();
            if (i < activeCount) {
                notches = string.concat(notches, '<rect x="14" y="', yStr, '" width="14" height="10" rx="2" fill="', accentColor, '" filter="url(#glow)"/><circle cx="21" cy="', (y + 5).toString(), '" r="2" fill="#FFF"/>');
            } else {
                notches = string.concat(notches, '<rect x="14" y="', yStr, '" width="14" height="10" rx="2" fill="#0F141C" stroke="#21262D"/>');
            }
        }
        return notches;
    }

    function _renderCore(ChassisTheme memory t, ProgressionState memory p) internal pure returns (string memory) {
        if (t.isApex) {
            return string.concat(
                '<circle r="38" fill="#FF8F00" opacity=".5" filter="url(#glow)"/>',
                '<circle r="26" fill="#FFC107" opacity=".85" filter="url(#glow)"/>',
                '<polygon points="0,-22 6,-6 22,0 6,6 0,22 -6,6 -22,0 -6,-6" fill="#FFF" filter="url(#glow)"/>',
                '<circle r="10" fill="#FFF"/>'
            );
        }
        string memory pts;
        if (p.coreShape == 0) pts = "0,-48 34,-34 48,0 34,34 0,48 -34,34 -48,0 -34,-34";
        else if (p.coreShape == 1) pts = "0,-46 40,-23 40,23 0,46 -40,23 -40,-23";
        else if (p.coreShape == 2) pts = "0,-48 24,-42 42,-24 48,0 42,24 24,42 0,48 -24,42 -42,24 -48,0 -42,-24 -24,-42";
        else pts = "0,-50 14,-20 45,-20 22,-4 35,28 0,12 -35,28 -22,-4 -45,-20 -14,-20";

        uint256 coreR = 6 + (uint256(p.amountTier) * 5);
        return string.concat(
            '<polygon points="', pts, '" fill="none" stroke="', t.pinStripe, '" stroke-width="2.5" filter="url(#glow)"/>',
            '<circle r="', (coreR * 2).toString(), '" fill="', t.glowColor, '" opacity=".45" filter="url(#glow)"/>',
            '<circle r="', coreR.toString(), '" fill="#FFF" filter="url(#glow)"/>',
            '<circle r="', (coreR / 2).toString(), '" fill="', t.sigilColor, '"/>'
        );
    }

    function _renderDynamicReactor(ChassisTheme memory t, ProgressionState memory p) internal pure returns (string memory) {
        string memory part1 = string.concat(
            '<g transform="translate(250,285)">',
            '<g transform="rotate(', uint256(p.rotationAngle).toString(), ')">',
            (p.totalPowerMultiplierWad >= 4.0e18 || p.amountTier >= 4)
                ? '<circle cx="0" cy="0" r="132" fill="none" stroke="#161B22" stroke-width="4" stroke-dasharray="6 11"/>'
                : '',
            '<circle cx="0" cy="0" r="126" fill="none" stroke="', t.pinStripe, '" stroke-width="', (t.isApex ? "1.8" : "1"), '" opacity="0.85"/>',
            '</g>',
            '<circle cx="0" cy="0" r="118" fill="none" stroke="', (t.isApex ? "#F59E0B" : "#21262D"), '" stroke-width="1" stroke-dasharray="2 4"/>',
            '<g font-size="8" font-weight="bold" text-anchor="middle" fill="#8B949E"><text x="0" y="-120">000\xC2\xB0</text><text x="88" y="-88" font-size="7" fill="#484F58">045\xC2\xB0</text><text x="122" y="3" text-anchor="start">090\xC2\xB0</text><text x="88" y="92" font-size="7" fill="#484F58">135\xC2\xB0</text><text x="0" y="125">180\xC2\xB0</text><text x="-88" y="92" font-size="7" fill="#484F58">225\xC2\xB0</text><text x="-122" y="3" text-anchor="end">270\xC2\xB0</text><text x="-88" y="-88" font-size="7" fill="#484F58">315\xC2\xB0</text></g>'
        );

        string memory bracketPath = (p.totalPowerMultiplierWad >= 6.0e18)
            ? string.concat('<path d="M0 -115V-85M0 115V85M-115 0H-85M115 0H85M-81 -81L-60 -60M81 81L60 60M-81 81L-60 60M81 -81L60 -60" stroke="', t.bracket, '" stroke-width="', (t.isApex ? "3.5" : "2.5"), '"/>')
            : (p.totalPowerMultiplierWad >= 3.0e18
                ? string.concat('<path d="M0 -110V-80M0 110V80M-110 0H-80M110 0H80" stroke="', t.bracket, '" stroke-width="2"/>')
                : '<path d="M0 -95V-75M0 95V75" stroke="#21262D" stroke-width="1.5"/>');

        string memory part2 = string.concat(
            '<g transform="rotate(', uint256(p.rotationAngle).toString(), ')">', bracketPath, '</g>',
            '<circle cx="0" cy="0" r="', (t.isApex ? "92" : "85"), '" fill="#060910" stroke="', t.glowColor, '" stroke-width="', (t.isApex ? "3" : "2"), '" filter="url(#glow)" opacity="0.95"/>',
            '<circle cx="0" cy="0" r="', (t.isApex ? "74" : "68"), '" fill="none" stroke="', t.pinStripe, '" stroke-width="', (t.isApex ? "2" : "1.5"), '" stroke-dasharray="14 8"/>',
            '<circle cx="0" cy="0" r="50" fill="#0A0E17" stroke="', t.bracket, '" stroke-width="', (t.isApex ? "2.5" : "2"), '"/>',
            _renderCore(t, p),
            '</g>'
        );

        return string.concat(part1, part2);
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
    ) external view returns (string memory) {
        ChassisTheme memory t = getTheme(tokenId, seed, isEternal, amount, createdEpoch, unlockEpoch);
        ProgressionState memory p = calculateProgression(currentEpoch, createdEpoch, unlockEpoch, amount, seed, extendCount, walletActiveSlots, isEternal);

        uint256 naraWhole = uint256(amount) / 1e18;
        uint256 lockDays = (unlockEpoch > createdEpoch) ? (uint256(unlockEpoch - createdEpoch) / EPOCHS_PER_DAY) : 0;
        if (isEternal) lockDays = 9999;

        string memory cardStyle = t.isApex
            ? "background:#030509;box-shadow:0 0 50px rgba(255,193,7,.55),0 0 100px rgba(255,152,0,.35),0 0 160px rgba(255,111,0,.2);"
            : "background:#030509;";

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700" width="100%" height="100%" font-family="\'IBM Plex Mono\',monospace" style="', cardStyle, '">',
            DEFS.renderDefs(t.gradC0, t.gradC1, t.gradC2, t.hexGridColor, t.isApex),
            '<rect x="8" y="8" width="484" height="684" rx="26" fill="url(#frameGrad)" filter="url(#shadow)"/>',
            '<rect x="18" y="18" width="464" height="664" rx="20" fill="', t.frameInner, '" stroke="', t.pinStripe, '" stroke-width="', (t.isApex ? "1.8" : "1.3"), '"/>',
            '<rect x="20" y="20" width="460" height="660" rx="18" fill="url(#hexGrid)"/>',
            t.isApex ? DEFS.renderApexDecorations() : '',
            '<path d="M 18 64 L 64 18 M 436 18 L 482 64 M 18 636 L 64 682 M 436 682 L 482 636" stroke="', t.bracket, '" stroke-width="', (t.isApex ? "4" : "3"), '"/>',
            _renderHexBolts(t.bracket, t.isApex),
            '<g transform="translate(42,34)"><circle cx="14" cy="13" r="14" fill="#0D1117" stroke="', t.bracket, '" stroke-width="1.8"/><circle cx="14" cy="13" r="10" fill="', t.badgeBg, '" stroke="', t.glowColor, '" stroke-width="1.2"/><text x="14" y="17" fill="', t.sigilColor, '" font-size="11" font-weight="bold" text-anchor="middle">', (t.isApex ? unicode"👑" : "N"), '</text></g>',
            _renderBatteryHUD(p.chargedCells, t.glowColor),
            '<rect x="330" y="36" width="128" height="22" rx="6" fill="', t.badgeBg, '" stroke="', t.accentColor, '" stroke-width="', (t.isApex ? "1.5" : "1"), '"/><circle cx="340" cy="47" r="3" fill="', t.accentColor, '" filter="url(#glow)"/><text x="348" y="51" fill="', t.badgeText, '" font-size="7.5" font-weight="bold">', p.fleetTitle, '</text>',
            '<g transform="translate(36,74)"><rect width="428" height="34" rx="8" fill="#0D1117" stroke="', (t.isApex ? "#FFE082" : t.bracket), '" stroke-width="', (t.isApex ? "1.6" : "1.2"), '"/><rect x="8" y="7" width="180" height="20" rx="4" fill="', t.badgeBg, '" stroke="', t.badgeText, '" stroke-width="', (t.isApex ? "1.5" : "1"), '"/><text x="14" y="21" fill="', t.badgeText, '" font-size="9" font-weight="bold">', t.name, '</text><rect x="200" y="7" width="95" height="20" rx="4" fill="', t.glowColor, '" stroke="', t.accentColor, '" stroke-width="1.2"/><text x="247" y="21" fill="#FFF" font-size="9" font-weight="bold" text-anchor="middle">', p.totalPowerLabel, ' POWER</text><text x="418" y="21" fill="', (t.isApex ? "#FDE047" : "#8B949E"), '" font-size="8.5" font-weight="bold" text-anchor="end">', p.rankTitle, '</text></g>',
            _renderDynamicReactor(t, p),
            _renderLeftArmor(p.amountTier, extendCount, t.accentColor),
            _renderYieldConduit(p.totalPowerMultiplierWad, t.glowColor),
            '<g transform="translate(36,462)"><rect width="428" height="78" rx="10" fill="#090D14" stroke="', (t.isApex ? "#FFB300" : "#21262D"), '" stroke-width="', (t.isApex ? "1.5" : "1"), '"/><rect x="10" y="10" width="198" height="58" rx="6" fill="#0D121C" stroke="', (t.isApex ? "#78350F" : "#161B22"), '"/>'
            '<text x="24" y="30" fill="', (t.isApex ? "#FDE047" : "#8B949E"), '" font-size="9" font-weight="bold">LOCKED PRINCIPAL</text><text x="24" y="56" fill="#FFF" font-size="18" font-weight="bold">', naraWhole.toString(), ' NARA</text><rect x="220" y="10" width="198" height="58" rx="6" fill="#0D121C" stroke="', (t.isApex ? "#78350F" : "#161B22"), '"/>'
            '<text x="234" y="30" fill="', (t.isApex ? "#FDE047" : "#8B949E"), '" font-size="9" font-weight="bold">TIME COMMITMENT</text><text x="234" y="56" fill="', t.accentColor, '" font-size="18" font-weight="bold">', lockDays.toString(), ' DAYS</text></g>',
            '<g transform="translate(36,550)"><rect width="428" height="42" rx="8" fill="', t.badgeBg, '" stroke="', t.pinStripe, '" stroke-width="', (t.isApex ? "1.8" : "1.2"), '"/><text x="214" y="26" fill="', t.sigilColor, '" font-size="11.5" font-weight="bold" text-anchor="middle">', t.seal, '</text></g>',
            '<text x="250" y="625" fill="', (t.isApex ? "#FFE082" : "#586069"), '" font-size="9" font-weight="bold" text-anchor="middle">TOKEN #', tokenId.toString(), ' | POS #', positionId.toString(), ' | EXTENDS: ', uint256(extendCount).toString(), ' | CLAIMS: ', uint256(claimCount).toString(), '</text>',
            '<text x="250" y="642" fill="', (t.isApex ? "#F59E0B" : "#30363D"), '" font-size="8" text-anchor="middle">BASE MAINNET // ', (t.isApex ? "24K APEX BULLION" : "IMMUTABLE PURE ON-CHAIN"), ' PROVENANCE</text>',
            '</svg>'
        );
    }
}
