// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title NARAArtCorePlateV3
/// @notice Top 1% luxury generative art plate with 5 legendary chassis materials, 10-Rank Multi-Vector Evolution, and High-Stakes Grail Gate.
contract NARAArtCorePlateV3 {
    using Strings for uint256;

    uint256 public constant CORE_PLATE_VERSION = 5;
    uint64 public constant MIN_GRAIL_DURATION_EPOCHS = 17520; // 6 Months
    uint64 public constant MAX_LOCK_EPOCHS = 35040; // 1 Year
    uint128 public constant MIN_GRAIL_AMOUNT = 10 ether; // 10 NARA min for Gold/Holo

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
        if (isEternal) return 30;
        if (unlockEpoch <= createdEpoch) return 0;
        uint64 duration = unlockEpoch - createdEpoch;
        if (duration > MAX_LOCK_EPOCHS) duration = MAX_LOCK_EPOCHS;
        if (duration < MIN_GRAIL_DURATION_EPOCHS) {
            return (uint256(duration) * 10) / MIN_GRAIL_DURATION_EPOCHS;
        }
        uint64 extraDuration = duration - MIN_GRAIL_DURATION_EPOCHS;
        uint64 maxExtra = MAX_LOCK_EPOCHS - MIN_GRAIL_DURATION_EPOCHS;
        return 10 + (uint256(extraDuration) * 20) / maxExtra;
    }

    function isGrailEligible(uint128 amount, uint64 createdEpoch, uint64 unlockEpoch, bool isEternal) public pure returns (bool) {
        if (isEternal) return true;
        if (amount < MIN_GRAIL_AMOUNT) return false;
        if (unlockEpoch <= createdEpoch) return false;
        return (unlockEpoch - createdEpoch) >= MIN_GRAIL_DURATION_EPOCHS;
    }

    function rankOf(uint256 lifetimeEthWei) public pure returns (uint8) {
        if (lifetimeEthWei >= 10 ether) return 10;
        if (lifetimeEthWei >= 5 ether) return 9;
        if (lifetimeEthWei >= 2.5 ether) return 8;
        if (lifetimeEthWei >= 1 ether) return 7;
        if (lifetimeEthWei >= 0.5 ether) return 6;
        if (lifetimeEthWei >= 0.25 ether) return 5;
        if (lifetimeEthWei >= 0.1 ether) return 4;
        if (lifetimeEthWei >= 0.05 ether) return 3;
        if (lifetimeEthWei >= 0.02 ether) return 2;
        if (lifetimeEthWei >= 0.005 ether) return 1;
        return 0;
    }

    function rankName(uint8 rank) public pure returns (string memory) {
        if (rank == 10) return "APEX SUPERNOVA";
        if (rank == 9) return "DIMENSIONAL CORONA";
        if (rank == 8) return "PLASMA SUPER-RING";
        if (rank == 7) return "TACHYON STARBURST";
        if (rank == 6) return "GRAVITATIONAL WARP";
        if (rank == 5) return "ORBITAL GYROSCOPE";
        if (rank == 4) return "STATOR TURBINE";
        if (rank == 3) return "DOUBLE CONDUIT";
        if (rank == 2) return "CIRCUIT IGNITION";
        if (rank == 1) return "SENSOR ACTIVE";
        return "DORMANT CHASSIS";
    }

    function getTheme(
        uint256 seed,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        bool isEternal
    ) public pure returns (ChassisTheme memory t) {
        uint256 rawRoll = seed % 1000;
        uint256 luckBonus = computeLuckBonus(createdEpoch, unlockEpoch, isEternal);
        uint256 roll = rawRoll > luckBonus ? (rawRoll - luckBonus) : 0;
        bool eligible = isGrailEligible(amount, createdEpoch, unlockEpoch, isEternal);

        if (eligible && roll < 5) {
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
        } else if (eligible && roll < 55) {
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
        } else if (roll < 200) {
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
        } else if (roll < 500) {
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
        uint256 lifetimeEthWei,
        uint256 seed,
        uint8 moduleIdx,
        uint256 tokenId,
        uint256 positionId,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        bool isEternal,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory) {
        moduleIdx;
        uint8 rank = rankOf(lifetimeEthWei);
        ChassisTheme memory t = getTheme(seed, amount, createdEpoch, unlockEpoch, isEternal);

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" style="background:#07090C;">',
            _defs(t, rank),
            _chassis(t, rank, extendCount),
            _claimNotches(t, claimCount),
            _header(rank, t, createdEpoch),
            _capacitorHUD(t, rank),
            _energyCore(rank, seed, t),
            _identityBand(tokenId, positionId, t, rank),
            "</svg>"
        );
    }

    function _defs(ChassisTheme memory t, uint8 rank) internal pure returns (string memory) {
        string memory opacity = rank >= 8 ? "0.45" : (rank >= 4 ? "0.32" : "0.20");
        return string.concat(
            '<defs>',
            '<radialGradient id="coronaglow" cx="50%" cy="49%" r="49%"><stop offset="0%" stop-color="', t.glowColor, '" stop-opacity="', opacity, '"/><stop offset="100%" stop-color="#07090C" stop-opacity="0"/></radialGradient>',
            '<linearGradient id="goldFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE072"/><stop offset="25%" stop-color="#C59B27"/><stop offset="50%" stop-color="#FFF0A0"/><stop offset="75%" stop-color="#9E7A1A"/><stop offset="100%" stop-color="#FFE072"/></linearGradient>',
            '<linearGradient id="holoFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF0080"/><stop offset="20%" stop-color="#7928CA"/><stop offset="40%" stop-color="#0070F3"/><stop offset="60%" stop-color="#00DFD8"/><stop offset="80%" stop-color="#79FFE1"/><stop offset="100%" stop-color="#FF0080"/></linearGradient>',
            '<linearGradient id="holoPin" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00DFD8"/><stop offset="50%" stop-color="#FF0080"/><stop offset="100%" stop-color="#79FFE1"/></linearGradient>',
            '<linearGradient id="holoBadge" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#79FFE1"/><stop offset="100%" stop-color="#FF0080"/></linearGradient>',
            '</defs>'
        );
    }

    function _chassis(ChassisTheme memory t, uint8 rank, uint32 extendCount) internal pure returns (string memory) {
        uint256 strokeW = 48 + (extendCount > 10 ? 10 : extendCount);
        string memory armorFins = "";
        if (rank >= 4) {
            armorFins = string.concat(
                '<polygon points="58,58 160,58 120,120 58,160" fill="', t.bracket, '" opacity="0.75"/>',
                '<polygon points="942,58 840,58 880,120 942,160" fill="', t.bracket, '" opacity="0.75"/>',
                '<polygon points="58,942 160,942 120,880 58,840" fill="', t.bracket, '" opacity="0.75"/>',
                '<polygon points="942,942 840,942 880,880 942,840" fill="', t.bracket, '" opacity="0.75"/>'
            );
        }

        return string.concat(
            '<rect width="1000" height="1000" fill="#07090C"/>',
            '<rect width="1000" height="1000" fill="url(#coronaglow)"/>',
            '<rect x="24" y="24" width="952" height="952" rx="28" fill="none" stroke="', t.frameOuter, '" stroke-width="', strokeW.toString(), '"/>',
            '<rect x="48" y="48" width="904" height="904" rx="16" fill="none" stroke="', t.frameInner, '" stroke-width="6"/>',
            '<rect x="54" y="54" width="892" height="892" rx="12" fill="none" stroke="', t.pinStripe, '" stroke-width="2" opacity="0.75"/>',
            armorFins,
            '<path d="M58 150 V58 H150" fill="none" stroke="', t.bracket, '" stroke-width="10" stroke-linecap="round"/>',
            '<path d="M942 150 V58 H850" fill="none" stroke="', t.bracket, '" stroke-width="10" stroke-linecap="round"/>',
            '<path d="M58 850 V942 H150" fill="none" stroke="', t.bracket, '" stroke-width="10" stroke-linecap="round"/>',
            '<path d="M942 850 V942 H850" fill="none" stroke="', t.bracket, '" stroke-width="10" stroke-linecap="round"/>',
            '<circle cx="72" cy="72" r="7" fill="', t.bracket, '"/>',
            '<circle cx="928" cy="72" r="7" fill="', t.bracket, '"/>',
            '<circle cx="72" cy="928" r="7" fill="', t.bracket, '"/>',
            '<circle cx="928" cy="928" r="7" fill="', t.bracket, '"/>'
        );
    }

    function _claimNotches(ChassisTheme memory t, uint32 claimCount) internal pure returns (string memory) {
        if (claimCount == 0) return "";
        uint32 notches = claimCount > 10 ? 10 : claimCount;
        string memory leftRails = "";
        string memory rightRails = "";

        for (uint32 i = 0; i < notches; i++) {
            uint32 y = 280 + i * 40;
            leftRails = string.concat(leftRails, '<line x1="50" y1="', uint256(y).toString(), '" x2="60" y2="', uint256(y).toString(), '" stroke="', t.sigilColor, '" stroke-width="3"/>');
            rightRails = string.concat(rightRails, '<line x1="940" y1="', uint256(y).toString(), '" x2="950" y2="', uint256(y).toString(), '" stroke="', t.sigilColor, '" stroke-width="3"/>');
        }
        return string.concat(leftRails, rightRails);
    }

    function _header(uint8 rank, ChassisTheme memory t, uint64 createdEpoch) internal pure returns (string memory) {
        string memory rName = rankName(rank);
        return string.concat(
            '<g transform="translate(80, 114)">',
            '<rect x="-8" y="-24" width="370" height="42" rx="8" fill="', t.badgeBg, '" opacity="0.9"/>',
            '<circle cx="12" cy="-3" r="7" fill="', t.sigilColor, '"/>',
            '<text x="28" y="5" fill="', t.badgeText, '" font-family="\'IBM Plex Mono\', monospace" font-size="18" font-weight="900" letter-spacing="2">',
            unicode"● RANK ", uint256(rank).toString(), " // ", rName,
            '</text></g>',
            '<text x="920" y="121" fill="#F4EFE6" font-family="\'IBM Plex Mono\', monospace" font-size="26" font-weight="800" letter-spacing="2" text-anchor="end">EPOCH #',
            uint256(createdEpoch).toString(),
            '</text>',
            '<line x1="80" y1="150" x2="920" y2="150" stroke="', t.accentColor, '" stroke-width="2" opacity="0.45"/>'
        );
    }

    function _capacitorHUD(ChassisTheme memory t, uint8 rank) internal pure returns (string memory) {
        string memory cells = "";
        for (uint8 i = 0; i < 10; i++) {
            uint256 x = 660 + uint256(i) * 26;
            string memory fillCol = (i < rank) ? t.sigilColor : "#1E2430";
            cells = string.concat(cells, '<rect x="', x.toString(), '" y="162" width="20" height="12" rx="2" fill="', fillCol, '"/>');
        }
        return string.concat(
            '<text x="645" y="173" fill="', t.sigilColor, '" font-family="\'IBM Plex Mono\', monospace" font-size="13" font-weight="800" text-anchor="end">CAPACITOR</text>',
            cells
        );
    }

    function _energyCore(uint8 rank, uint256 seed, ChassisTheme memory t) internal pure returns (string memory) {
        seed;
        string memory rings = "";


        if (rank >= 7) {
            // Tachyon Starburst Spikes (Rank 7+)
            rings = string.concat(
                '<polygon points="0,-320 40,-70 320,0 40,70 0,320 -40,70 -320,0 -40,-70" fill="none" stroke="', t.sigilColor, '" stroke-width="2.5" opacity="0.75"/>',
                '<circle cx="0" cy="0" r="280" fill="none" stroke="', t.accentColor, '" stroke-width="3" stroke-dasharray="16 8"/>'
            );
        } else if (rank >= 5) {
            // Dual Orbital Gyroscope (Rank 5-6)
            rings = string.concat(
                '<ellipse cx="0" cy="0" rx="270" ry="110" fill="none" stroke="', t.accentColor, '" stroke-width="3" transform="rotate(-35)"/>',
                '<ellipse cx="0" cy="0" rx="270" ry="110" fill="none" stroke="', t.sigilColor, '" stroke-width="3" transform="rotate(35)"/>'
            );
        } else if (rank >= 3) {
            // High-voltage double conduit (Rank 3-4)
            rings = string.concat(
                '<circle cx="0" cy="0" r="260" fill="none" stroke="', t.accentColor, '" stroke-width="2" stroke-dasharray="24 12"/>',
                '<circle cx="0" cy="0" r="220" fill="none" stroke="', t.sigilColor, '" stroke-width="3" stroke-dasharray="8 8"/>'
            );
        } else {
            // Standard Radar (Rank 0-2)
            rings = string.concat(
                '<circle cx="0" cy="0" r="240" fill="none" stroke="', t.accentColor, '" stroke-width="2" opacity="0.4" stroke-dasharray="6 8"/>',
                '<circle cx="0" cy="0" r="200" fill="none" stroke="', t.sigilColor, '" stroke-width="2.5" opacity="0.6"/>'
            );
        }

        uint256 coreR = 140 + uint256(rank) * 3;
        return string.concat(
            '<g transform="translate(500, 480)">',
            rings,
            '<circle cx="0" cy="0" r="', coreR.toString(), '" fill="#0B0E14" stroke="', t.sigilColor, '" stroke-width="6"/>',
            '<line x1="-290" y1="0" x2="-200" y2="0" stroke="', t.sigilColor, '" stroke-width="3"/>',
            '<line x1="200" y1="0" x2="290" y2="0" stroke="', t.sigilColor, '" stroke-width="3"/>',
            '<line x1="0" y1="-290" x2="0" y2="-200" stroke="', t.sigilColor, '" stroke-width="3"/>',
            '<line x1="0" y1="200" x2="0" y2="290" stroke="', t.sigilColor, '" stroke-width="3"/>',
            '<g stroke="', t.sigilColor, '" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none">',
            '<path d="M-38 56 L-38 -56"/>',
            '<path d="M38 56 L38 -56"/>',
            '<path d="M-38 -56 L38 56"/>',
            '</g>',
            '<circle cx="0" cy="0" r="10" fill="', t.accentColor, '"/>',
            '</g>'
        );
    }

    function _identityBand(uint256 tokenId, uint256 positionId, ChassisTheme memory t, uint8 rank) internal pure returns (string memory) {
        return string.concat(
            '<line x1="80" y1="784" x2="920" y2="784" stroke="', t.accentColor, '" stroke-width="2" opacity="0.45"/>',
            '<text x="80" y="874" fill="#FFFFFF" font-family="\'Satoshi\', sans-serif" font-size="88" font-weight="900" letter-spacing="4">NARA</text>',
            '<text x="84" y="918" fill="', t.sigilColor, '" font-family="\'IBM Plex Mono\', monospace" font-size="20" font-weight="800" letter-spacing="2">',
            t.name, " // RANK ", uint256(rank).toString(),
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
