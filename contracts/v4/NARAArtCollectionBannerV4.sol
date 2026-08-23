// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title NARAArtCollectionBannerV4
/// @notice Pure on-chain SVG generator for the official NARA Collection Banner & OpenSea header.
contract NARAArtCollectionBannerV4 {
    function bannerSVG() external pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500" width="100%" height="100%" style="background:#030509;font-family:\'IBM Plex Mono\',monospace;">',
            '<defs>',
            '<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '<filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.9"/></filter>',

            '<linearGradient id="damascusFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F8FAFC"/><stop offset="25%" stop-color="#94A3B8"/><stop offset="50%" stop-color="#38BDF8"/><stop offset="75%" stop-color="#334155"/><stop offset="100%" stop-color="#0F172A"/></linearGradient>',
            '<linearGradient id="goldFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE066"/><stop offset="35%" stop-color="#FFB800"/><stop offset="70%" stop-color="#D48800"/><stop offset="100%" stop-color="#553300"/></linearGradient>',
            '<linearGradient id="obsidianFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#252A36"/><stop offset="50%" stop-color="#12151C"/><stop offset="100%" stop-color="#07090C"/></linearGradient>',
            '<linearGradient id="emeraldFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00FF88"/><stop offset="35%" stop-color="#083321"/><stop offset="100%" stop-color="#020D08"/></linearGradient>',
            '<linearGradient id="titaniumFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3A4659"/><stop offset="50%" stop-color="#181F2C"/><stop offset="100%" stop-color="#0B0E14"/></linearGradient>',

            '<pattern id="hexGrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 12 0 L 24 6.9 L 24 20.7 L 12 27.6 L 0 20.7 L 0 6.9 Z" fill="none" stroke="rgba(56,189,248,0.04)" stroke-width="0.75"/></pattern>',
            '</defs>',

            '<rect width="1500" height="500" fill="#030509"/>',
            '<rect width="1500" height="500" fill="url(#hexGrid)"/>',
            '<line x1="40" y1="35" x2="1460" y2="35" stroke="#161B22" stroke-width="1"/>',
            '<line x1="40" y1="465" x2="1460" y2="465" stroke="#161B22" stroke-width="1"/>',
            '<text x="50" y="25" fill="#484F58" font-size="9" font-weight="bold" letter-spacing="2">NARA PROTOCOL // ON-CHAIN GENERATIVE HOROLOGY // BASE MAINNET 8453</text>',
            '<text x="1450" y="25" fill="#484F58" font-size="9" font-weight="bold" text-anchor="end" letter-spacing="2">SPECIFICATION: V8 PRODUCTION // ZERO-SLOP CAD</text>',
            '<text x="50" y="485" fill="#30363D" font-size="9" letter-spacing="1">CANONICAL POSITION NFT: 0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b</text>',
            '<text x="1450" y="485" fill="#30363D" font-size="9" text-anchor="end" letter-spacing="1">100% PURE ON-CHAIN BYTECODE // ZERO IPFS</text>',

            '<g transform="translate(60, 55)">',
            _renderTitaniumCard(),
            _renderEmeraldCard(),
            _renderGoldCard(),
            _renderDamascusCard(),
            _renderObsidianCard(),
            '</g></svg>'
        );
    }

    function _renderTitaniumCard() internal pure returns (string memory) {
        return string.concat(
            '<g transform="translate(0, 0)" filter="url(#cardShadow)">',
            '<rect width="260" height="380" rx="14" fill="url(#titaniumFrame)" stroke="#388BFF" stroke-width="1"/>',
            '<rect x="6" y="6" width="248" height="368" rx="10" fill="#070A10" stroke="#388BFF" stroke-width="0.8"/>',
            '<circle cx="16" cy="16" r="3.5" fill="#0D1117" stroke="#388BFF" stroke-width="1"/><circle cx="244" cy="16" r="3.5" fill="#0D1117" stroke="#388BFF" stroke-width="1"/>',
            '<circle cx="16" cy="364" r="3.5" fill="#0D1117" stroke="#388BFF" stroke-width="1"/><circle cx="244" cy="364" r="3.5" fill="#0D1117" stroke="#388BFF" stroke-width="1"/>',
            '<rect x="18" y="25" width="224" height="24" rx="4" fill="#0D1117" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="26" y="41" fill="#58A6FF" font-size="7.5" font-weight="bold">ALLOY: Titanium Slate</text>',
            '<text x="234" y="41" fill="#8B949E" font-size="7" font-weight="bold" text-anchor="end">1.0X TRIAL</text>',
            '<g transform="translate(130, 160)">',
            '<circle cx="0" cy="0" r="68" fill="none" stroke="#388BFF" stroke-width="0.8" opacity="0.6"/>',
            '<circle cx="0" cy="0" r="44" fill="#060910" stroke="#0052FF" stroke-width="1.2"/>',
            '<circle cx="0" cy="0" r="26" fill="#0A0E17" stroke="#388BFF" stroke-width="1"/>',
            '<polygon points="0,-18 13,-9 13,9 0,18 -13,9 -13,-9" fill="none" stroke="#C9DFFF" stroke-width="1.2"/>',
            '<circle cx="0" cy="0" r="6" fill="#0052FF" opacity="0.5" filter="url(#glow)"/><circle cx="0" cy="0" r="2" fill="#FFFFFF"/>',
            '</g>',
            '<rect x="18" y="260" width="224" height="50" rx="6" fill="#090D14" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="28" y="278" fill="#8B949E" font-size="6.5" font-weight="bold">LOCKED PRINCIPAL</text><text x="28" y="296" fill="#F0F6FC" font-size="11" font-weight="bold">100 NARA</text>',
            '<text x="140" y="278" fill="#8B949E" font-size="6.5" font-weight="bold">HORIZON</text><text x="140" y="296" fill="#58A6FF" font-size="11" font-weight="bold">1 DAYS</text>',
            '<rect x="18" y="320" width="224" height="26" rx="4" fill="rgba(56,139,255,0.12)" stroke="#388BFF" stroke-width="0.8"/>',
            '<text x="130" y="337" fill="#C9DFFF" font-size="8" font-weight="bold" text-anchor="middle">', unicode"★ STANDARD ERA ★", '</text>',
            '</g>'
        );
    }

    function _renderEmeraldCard() internal pure returns (string memory) {
        return string.concat(
            '<g transform="translate(280, 0)" filter="url(#cardShadow)">',
            '<rect width="260" height="380" rx="14" fill="url(#emeraldFrame)" stroke="#00FF88" stroke-width="1"/>',
            '<rect x="6" y="6" width="248" height="368" rx="10" fill="#030A07" stroke="#00FF88" stroke-width="0.8"/>',
            '<circle cx="16" cy="16" r="3.5" fill="#0D1117" stroke="#00FF88" stroke-width="1"/><circle cx="244" cy="16" r="3.5" fill="#0D1117" stroke="#00FF88" stroke-width="1"/>',
            '<circle cx="16" cy="364" r="3.5" fill="#0D1117" stroke="#00FF88" stroke-width="1"/><circle cx="244" cy="364" r="3.5" fill="#0D1117" stroke="#00FF88" stroke-width="1"/>',
            '<rect x="18" y="25" width="224" height="24" rx="4" fill="#0D1117" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="26" y="41" fill="#00FF88" font-size="7.5" font-weight="bold">ALLOY: Cyber Emerald</text>',
            '<rect x="150" y="29" width="82" height="16" rx="3" fill="#00FF88"/>',
            '<text x="191" y="40" fill="#030A07" font-size="7" font-weight="bold" text-anchor="middle">4.0X MAX BOOST</text>',
            '<g transform="translate(130, 160)">',
            '<circle cx="0" cy="0" r="68" fill="none" stroke="#00FF88" stroke-width="0.8" opacity="0.85"/>',
            '<path d="M 0 -62 L 0 -45 M 0 62 L 0 45 M -62 0 L -45 0 M 62 0 L 45 0 M -44 -44 L -32 -32 M 44 44 L 32 32 M -44 44 L -32 32 M 44 -44 L 32 -32" stroke="#00FF88" stroke-width="1.5"/>',
            '<circle cx="0" cy="0" r="46" fill="#060910" stroke="#00FF88" stroke-width="1.5" filter="url(#glow)"/>',
            '<polygon points="0,-24 20,-12 20,12 0,24 -20,12 -20,-12" fill="none" stroke="#A3FFD1" stroke-width="1.5"/>',
            '<circle cx="0" cy="0" r="12" fill="#00FF88" opacity="0.45" filter="url(#glow)"/><circle cx="0" cy="0" r="4" fill="#FFFFFF"/>',
            '</g>',
            '<rect x="18" y="260" width="224" height="50" rx="6" fill="#090D14" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="28" y="278" fill="#8B949E" font-size="6.5" font-weight="bold">LOCKED PRINCIPAL</text><text x="28" y="296" fill="#F0F6FC" font-size="11" font-weight="bold">5,000 NARA</text>',
            '<text x="140" y="278" fill="#8B949E" font-size="6.5" font-weight="bold">HORIZON</text><text x="140" y="296" fill="#00FF88" font-size="11" font-weight="bold">365 DAYS</text>',
            '<rect x="18" y="320" width="224" height="26" rx="4" fill="rgba(0,255,136,0.12)" stroke="#00FF88" stroke-width="0.8"/>',
            '<text x="130" y="337" fill="#A3FFD1" font-size="8" font-weight="bold" text-anchor="middle">', unicode"★ 1-YEAR HORIZON ★", '</text>',
            '</g>'
        );
    }

    function _renderGoldCard() internal pure returns (string memory) {
        return string.concat(
            '<g transform="translate(560, -10)" filter="url(#cardShadow)">',
            '<rect width="270" height="400" rx="16" fill="url(#goldFrame)" stroke="#FFD700" stroke-width="1.5"/>',
            '<rect x="7" y="7" width="256" height="386" rx="12" fill="#0C0A04" stroke="#FFD700" stroke-width="1"/>',
            '<circle cx="18" cy="18" r="4" fill="#0D1117" stroke="#FFD700" stroke-width="1.2"/><circle cx="252" cy="18" r="4" fill="#0D1117" stroke="#FFD700" stroke-width="1.2"/>',
            '<circle cx="18" cy="382" r="4" fill="#0D1117" stroke="#FFD700" stroke-width="1.2"/><circle cx="252" cy="382" r="4" fill="#0D1117" stroke="#FFD700" stroke-width="1.2"/>',
            '<rect x="20" y="38" width="230" height="26" rx="5" fill="#0D1117" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="28" y="55" fill="#FFD700" font-size="8.5" font-weight="bold">', unicode"👑 24K Gilded Gold", '</text>',
            '<rect x="150" y="42" width="90" height="18" rx="3" fill="#FFD700"/>',
            '<text x="195" y="54" fill="#0C0A04" font-size="7.5" font-weight="bold" text-anchor="middle">SOVEREIGN 5.0X</text>',
            '<g transform="translate(135, 175)">',
            '<circle cx="0" cy="0" r="74" fill="none" stroke="#FFD700" stroke-width="1"/>',
            '<path d="M 0 -68 L 0 -50 M 0 68 L 0 50 M -68 0 L -50 0 M 68 0 L 50 0 M -48 -48 L -35 -35 M 48 48 L 35 35 M -48 48 L -35 35 M 48 -48 L 35 -35" stroke="#FFD700" stroke-width="2"/>',
            '<circle cx="0" cy="0" r="50" fill="#060910" stroke="#FFA500" stroke-width="2" filter="url(#glow)"/>',
            '<polygon points="0,-32 22,-22 32,0 22,22 0,32 -22,22 -32,0 -22,-22" fill="none" stroke="#FFD700" stroke-width="2" filter="url(#glow)"/>',
            '<circle cx="0" cy="0" r="18" fill="#FFA500" opacity="0.5" filter="url(#glow)"/><circle cx="0" cy="0" r="8" fill="#FFFFFF" filter="url(#glow)"/><circle cx="0" cy="0" r="4" fill="#FFF2A3"/>',
            '</g>',
            '<rect x="20" y="275" width="230" height="52" rx="6" fill="#090D14" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="30" y="294" fill="#8B949E" font-size="7" font-weight="bold">LOCKED PRINCIPAL</text><text x="30" y="313" fill="#F0F6FC" font-size="12" font-weight="bold">100,000 NARA</text>',
            '<text x="145" y="294" fill="#8B949E" font-size="7" font-weight="bold">HORIZON</text><text x="145" y="313" fill="#FFD700" font-size="12" font-weight="bold">PERPETUAL</text>',
            '<rect x="20" y="337" width="230" height="30" rx="5" fill="rgba(255,215,0,0.16)" stroke="#FFD700" stroke-width="1"/>',
            '<text x="135" y="356" fill="#FFF2A3" font-size="9" font-weight="bold" text-anchor="middle">', unicode"👑 ASCENSION II: IMMORTAL 👑", '</text>',
            '</g>'
        );
    }

    function _renderDamascusCard() internal pure returns (string memory) {
        return string.concat(
            '<g transform="translate(850, 0)" filter="url(#cardShadow)">',
            '<rect width="260" height="380" rx="14" fill="url(#damascusFrame)" stroke="#38BDF8" stroke-width="1"/>',
            '<rect x="6" y="6" width="248" height="368" rx="10" fill="#060A14" stroke="#38BDF8" stroke-width="0.8"/>',
            '<circle cx="16" cy="16" r="3.5" fill="#0D1117" stroke="#38BDF8" stroke-width="1"/><circle cx="244" cy="16" r="3.5" fill="#0D1117" stroke="#388BFF" stroke-width="1"/>',
            '<circle cx="16" cy="364" r="3.5" fill="#0D1117" stroke="#38BDF8" stroke-width="1"/><circle cx="244" cy="364" r="3.5" fill="#0D1117" stroke="#388BFF" stroke-width="1"/>',
            '<rect x="18" y="25" width="224" height="24" rx="4" fill="#0D1117" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="26" y="41" fill="#38BDF8" font-size="7.5" font-weight="bold">ALLOY: Damascus Meteor</text>',
            '<rect x="150" y="29" width="82" height="16" rx="3" fill="#38BDF8"/>',
            '<text x="191" y="40" fill="#060A14" font-size="7" font-weight="bold" text-anchor="middle">APEX GRAIL 1.5%</text>',
            '<g transform="translate(130, 160)">',
            '<circle cx="0" cy="0" r="68" fill="none" stroke="#38BDF8" stroke-width="0.8"/>',
            '<path d="M 0 -62 L 0 -45 M 0 62 L 0 45 M -62 0 L -45 0 M 62 0 L 45 0 M -44 -44 L -32 -32 M 44 44 L 32 32 M -44 44 L -32 32 M 44 -44 L 32 -32" stroke="#38BDF8" stroke-width="1.5"/>',
            '<circle cx="0" cy="0" r="46" fill="#060910" stroke="#0284C7" stroke-width="1.5" filter="url(#glow)"/>',
            '<polygon points="0,-28 8,-11 25,-11 12,-2 19,15 0,7 -19,15 -12,-2 -25,-11 -8,-11" fill="none" stroke="#F8FAFC" stroke-width="1.5" filter="url(#glow)"/>',
            '<circle cx="0" cy="0" r="14" fill="#0284C7" opacity="0.45" filter="url(#glow)"/><circle cx="0" cy="0" r="5" fill="#FFFFFF"/>',
            '</g>',
            '<rect x="18" y="260" width="224" height="50" rx="6" fill="#090D14" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="28" y="278" fill="#8B949E" font-size="6.5" font-weight="bold">LOCKED PRINCIPAL</text><text x="28" y="296" fill="#F0F6FC" font-size="11" font-weight="bold">25,000 NARA</text>',
            '<text x="140" y="278" fill="#8B949E" font-size="6.5" font-weight="bold">HORIZON</text><text x="140" y="296" fill="#38BDF8" font-size="11" font-weight="bold">365 DAYS</text>',
            '<rect x="18" y="320" width="224" height="26" rx="4" fill="rgba(56,189,248,0.14)" stroke="#38BDF8" stroke-width="0.8"/>',
            '<text x="130" y="337" fill="#F8FAFC" font-size="8" font-weight="bold" text-anchor="middle">', unicode"★ ASCENSION I: SUPERNOVA ★", '</text>',
            '</g>'
        );
    }

    function _renderObsidianCard() internal pure returns (string memory) {
        return string.concat(
            '<g transform="translate(1130, 0)" filter="url(#cardShadow)">',
            '<rect width="260" height="380" rx="14" fill="url(#obsidianFrame)" stroke="#FF2A55" stroke-width="1"/>',
            '<rect x="6" y="6" width="248" height="368" rx="10" fill="#040507" stroke="#FF2A55" stroke-width="0.8"/>',
            '<circle cx="16" cy="16" r="3.5" fill="#0D1117" stroke="#FF2A55" stroke-width="1"/><circle cx="244" cy="16" r="3.5" fill="#0D1117" stroke="#FF2A55" stroke-width="1"/>',
            '<circle cx="16" cy="364" r="3.5" fill="#0D1117" stroke="#FF2A55" stroke-width="1"/><circle cx="244" cy="364" r="3.5" fill="#0D1117" stroke="#FF2A55" stroke-width="1"/>',
            '<rect x="18" y="25" width="224" height="24" rx="4" fill="#0D1117" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="26" y="41" fill="#FF456A" font-size="7.5" font-weight="bold">ALLOY: Obsidian Stealth</text>',
            '<rect x="150" y="29" width="82" height="16" rx="3" fill="#FF2A55"/>',
            '<text x="191" y="40" fill="#040507" font-size="7" font-weight="bold" text-anchor="middle">2.5X BOOST</text>',
            '<g transform="translate(130, 160)">',
            '<circle cx="0" cy="0" r="68" fill="none" stroke="#FF2A55" stroke-width="0.8" opacity="0.85"/>',
            '<path d="M 0 -62 L 0 -45 M 0 62 L 0 45 M -62 0 L -45 0 M 62 0 L 45 0" stroke="#FF2A55" stroke-width="1.5"/>',
            '<circle cx="0" cy="0" r="44" fill="#060910" stroke="#FF1744" stroke-width="1.2"/>',
            '<polygon points="0,-20 14,-10 14,10 0,20 -14,10 -14,-10" fill="none" stroke="#FFA0B0" stroke-width="1.5"/>',
            '<circle cx="0" cy="0" r="10" fill="#FF1744" opacity="0.45" filter="url(#glow)"/><circle cx="0" cy="0" r="3" fill="#FFFFFF"/>',
            '</g>',
            '<rect x="18" y="260" width="224" height="50" rx="6" fill="#090D14" stroke="#21262D" stroke-width="0.8"/>',
            '<text x="28" y="278" fill="#8B949E" font-size="6.5" font-weight="bold">LOCKED PRINCIPAL</text><text x="28" y="296" fill="#F0F6FC" font-size="11" font-weight="bold">1,000 NARA</text>',
            '<text x="140" y="278" fill="#8B949E" font-size="6.5" font-weight="bold">HORIZON</text><text x="140" y="296" fill="#FF456A" font-size="11" font-weight="bold">180 DAYS</text>',
            '<rect x="18" y="320" width="224" height="26" rx="4" fill="rgba(255,42,85,0.12)" stroke="#FF2A55" stroke-width="0.8"/>',
            '<text x="130" y="337" fill="#FFA0B0" font-size="8" font-weight="bold" text-anchor="middle">', unicode"★ TACHYON WARP ★", '</text>',
            '</g>'
        );
    }
}
