import fs from "node:fs";

function generateTier1() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" style="background:#07090C;">
  <defs>
    <radialGradient id="t1bg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#141820" stop-opacity="0.6"/><stop offset="100%" stop-color="#07090C" stop-opacity="1"/></radialGradient>
    <linearGradient id="ironPlate" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2D333F"/><stop offset="50%" stop-color="#1C2028"/><stop offset="100%" stop-color="#11141A"/></linearGradient>
  </defs>

  <!-- Background & Base Chassis -->
  <rect width="1000" height="1000" fill="#07090C"/>
  <rect width="1000" height="1000" fill="url(#t1bg)"/>
  <rect x="24" y="24" width="952" height="952" rx="24" fill="none" stroke="#222834" stroke-width="48"/>
  <rect x="48" y="48" width="904" height="904" rx="14" fill="none" stroke="#0E1218" stroke-width="6"/>

  <!-- Industrial Blast Shield Panels -->
  <line x1="48" y1="260" x2="952" y2="260" stroke="#161B24" stroke-width="4"/>
  <line x1="48" y1="740" x2="952" y2="740" stroke="#161B24" stroke-width="4"/>
  <path d="M48 260 L200 48 M800 48 L952 260 M48 740 L200 952 M800 952 L952 740" stroke="#161B24" stroke-width="3" opacity="0.4"/>

  <!-- Industrial Rivet Bolts -->
  <circle cx="72" cy="72" r="8" fill="#3A4354" stroke="#1A1F29" stroke-width="3"/>
  <circle cx="928" cy="72" r="8" fill="#3A4354" stroke="#1A1F29" stroke-width="3"/>
  <circle cx="72" cy="928" r="8" fill="#3A4354" stroke="#1A1F29" stroke-width="3"/>
  <circle cx="928" cy="928" r="8" fill="#3A4354" stroke="#1A1F29" stroke-width="3"/>
  <circle cx="500" cy="58" r="6" fill="#3A4354"/>
  <circle cx="500" cy="942" r="6" fill="#3A4354"/>

  <!-- Header & Status HUD -->
  <g transform="translate(80, 114)">
    <rect x="-8" y="-24" width="340" height="42" rx="6" fill="#12161E"/>
    <circle cx="12" cy="-3" r="6" fill="#667085"/>
    <text x="28" y="5" fill="#8E9AA8" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="800" letter-spacing="2">● TIER 1 // DORMANT</text>
  </g>

  <!-- Capacitor Gauge (1/5 Cells) -->
  <g transform="translate(680, 95)">
    <text x="0" y="20" fill="#667085" font-family="'IBM Plex Mono', monospace" font-size="16" font-weight="700">YIELD GAUGE</text>
    <rect x="130" y="5" width="20" height="20" rx="3" fill="#0052FF" opacity="0.9"/>
    <rect x="156" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
    <rect x="182" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
    <rect x="208" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
    <rect x="234" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
  </g>
  <line x1="80" y1="150" x2="920" y2="150" stroke="#1E2430" stroke-width="2"/>

  <!-- Central Dormant Reactor Core -->
  <g transform="translate(500, 490)">
    <!-- Outer Heavy Restraint Ring -->
    <circle cx="0" cy="0" r="240" fill="none" stroke="#1E2430" stroke-width="6"/>
    <circle cx="0" cy="0" r="220" fill="none" stroke="#2D3545" stroke-width="2" stroke-dasharray="8 12"/>
    <!-- Iron Plate Core -->
    <circle cx="0" cy="0" r="150" fill="url(#ironPlate)" stroke="#3A4354" stroke-width="8"/>
    <!-- Shutter Locks -->
    <path d="M-150 0 L150 0" stroke="#11141A" stroke-width="4"/>
    <path d="M0 -150 L0 150" stroke="#11141A" stroke-width="4"/>
    <!-- N Sigil Flat Matte -->
    <g stroke="#8E9AA8" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M-40 56 L-40 -56"/>
      <path d="M40 56 L40 -56"/>
      <path d="M-40 -56 L40 56"/>
    </g>
    <circle cx="0" cy="0" r="8" fill="#0052FF" opacity="0.6"/>
  </g>

  <!-- Identity Footer -->
  <line x1="80" y1="784" x2="920" y2="784" stroke="#1E2430" stroke-width="2"/>
  <text x="80" y="874" fill="#FFFFFF" font-family="'Satoshi', sans-serif" font-size="88" font-weight="900" letter-spacing="4">NARA</text>
  <text x="84" y="918" fill="#8E9AA8" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="700" letter-spacing="2">TITANIUM SLATE // STAGE 1</text>
  <text x="920" y="856" fill="#8E9AA8" font-family="'IBM Plex Mono', monospace" font-size="32" font-weight="900" text-anchor="end">POS #000015</text>
  <text x="920" y="896" fill="#4B5565" font-family="'IBM Plex Mono', monospace" font-size="22" font-weight="700" text-anchor="end">YIELD: 0.000 ETH</text>
</svg>`;
}

function generateTier2() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" style="background:#07090C;">
  <defs>
    <radialGradient id="t2glow" cx="50%" cy="49%" r="48%"><stop offset="0%" stop-color="#0052FF" stop-opacity="0.25"/><stop offset="100%" stop-color="#07090C" stop-opacity="0"/></radialGradient>
    <linearGradient id="neonBusbar" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#0052FF"/><stop offset="50%" stop-color="#00D2FF"/><stop offset="100%" stop-color="#0052FF"/></linearGradient>
  </defs>

  <rect width="1000" height="1000" fill="#07090C"/>
  <rect width="1000" height="1000" fill="url(#t2glow)"/>
  <rect x="24" y="24" width="952" height="952" rx="24" fill="none" stroke="#1E2A4A" stroke-width="48"/>
  <rect x="48" y="48" width="904" height="904" rx="14" fill="none" stroke="#0E1628" stroke-width="6"/>
  <rect x="54" y="54" width="892" height="892" rx="10" fill="none" stroke="#0052FF" stroke-width="2" opacity="0.6"/>

  <!-- Hydraulic Corner Emitter Clamps -->
  <path d="M58 140 V58 H140" fill="none" stroke="#00D2FF" stroke-width="8" stroke-linecap="round"/>
  <path d="M942 140 V58 H860" fill="none" stroke="#00D2FF" stroke-width="8" stroke-linecap="round"/>
  <path d="M58 860 V942 H140" fill="none" stroke="#00D2FF" stroke-width="8" stroke-linecap="round"/>
  <path d="M942 860 V942 H860" fill="none" stroke="#00D2FF" stroke-width="8" stroke-linecap="round"/>
  <circle cx="72" cy="72" r="7" fill="#00D2FF"/>
  <circle cx="928" cy="72" r="7" fill="#00D2FF"/>
  <circle cx="72" cy="928" r="7" fill="#00D2FF"/>
  <circle cx="928" cy="928" r="7" fill="#00D2FF"/>

  <!-- Header & Status HUD -->
  <g transform="translate(80, 114)">
    <rect x="-8" y="-24" width="370" height="42" rx="6" fill="#0A1835" stroke="#0052FF" stroke-width="1.5"/>
    <circle cx="12" cy="-3" r="7" fill="#00D2FF"/>
    <text x="28" y="5" fill="#00D2FF" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="900" letter-spacing="2">● TIER 2 // IGNITION</text>
  </g>

  <!-- Capacitor Gauge (2/5 Cells Illuminated) -->
  <g transform="translate(680, 95)">
    <text x="0" y="20" fill="#00D2FF" font-family="'IBM Plex Mono', monospace" font-size="16" font-weight="700">YIELD GAUGE</text>
    <rect x="130" y="5" width="20" height="20" rx="3" fill="#0052FF"/>
    <rect x="156" y="5" width="20" height="20" rx="3" fill="#00D2FF"/>
    <rect x="182" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
    <rect x="208" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
    <rect x="234" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
  </g>
  <line x1="80" y1="150" x2="920" y2="150" stroke="#0052FF" stroke-width="2" opacity="0.6"/>

  <!-- Central Ignition Core -->
  <g transform="translate(500, 490)">
    <!-- Circuit Busbars -->
    <circle cx="0" cy="0" r="260" fill="none" stroke="#0052FF" stroke-width="2" stroke-dasharray="16 8" opacity="0.5"/>
    <circle cx="0" cy="0" r="220" fill="none" stroke="#00D2FF" stroke-width="3" opacity="0.8"/>
    <!-- Reticles -->
    <circle cx="0" cy="0" r="160" fill="#0A1222" stroke="#00D2FF" stroke-width="6"/>
    <!-- Laser Cardinal Crosshairs -->
    <line x1="-280" y1="0" x2="-180" y2="0" stroke="#00D2FF" stroke-width="4"/>
    <line x1="180" y1="0" x2="280" y2="0" stroke="#00D2FF" stroke-width="4"/>
    <line x1="0" y1="-280" x2="0" y2="-180" stroke="#00D2FF" stroke-width="4"/>
    <line x1="0" y1="180" x2="0" y2="280" stroke="#00D2FF" stroke-width="4"/>
    <!-- N Sigil Luminous Cyan -->
    <g stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M-40 56 L-40 -56"/>
      <path d="M40 56 L40 -56"/>
      <path d="M-40 -56 L40 56"/>
    </g>
    <circle cx="0" cy="0" r="10" fill="#00D2FF"/>
  </g>

  <!-- Identity Footer -->
  <line x1="80" y1="784" x2="920" y2="784" stroke="#0052FF" stroke-width="2" opacity="0.6"/>
  <text x="80" y="874" fill="#FFFFFF" font-family="'Satoshi', sans-serif" font-size="88" font-weight="900" letter-spacing="4">NARA</text>
  <text x="84" y="918" fill="#00D2FF" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="800" letter-spacing="2">IGNITED REACTOR // +0.01 ETH</text>
  <text x="920" y="856" fill="#00D2FF" font-family="'IBM Plex Mono', monospace" font-size="32" font-weight="900" text-anchor="end">POS #000015</text>
  <text x="920" y="896" fill="#8ECCFF" font-family="'IBM Plex Mono', monospace" font-size="22" font-weight="700" text-anchor="end">YIELD: +0.015 ETH</text>
</svg>`;
}

function generateTier3() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" style="background:#07090C;">
  <defs>
    <radialGradient id="t3glow" cx="50%" cy="49%" r="48%"><stop offset="0%" stop-color="#7928CA" stop-opacity="0.35"/><stop offset="50%" stop-color="#00DFD8" stop-opacity="0.15"/><stop offset="100%" stop-color="#07090C" stop-opacity="0"/></radialGradient>
    <linearGradient id="plasmaGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF0080"/><stop offset="50%" stop-color="#7928CA"/><stop offset="100%" stop-color="#00DFD8"/></linearGradient>
  </defs>

  <rect width="1000" height="1000" fill="#07090C"/>
  <rect width="1000" height="1000" fill="url(#t3glow)"/>
  <rect x="24" y="24" width="952" height="952" rx="24" fill="none" stroke="#2A1B44" stroke-width="48"/>
  <rect x="48" y="48" width="904" height="904" rx="14" fill="none" stroke="#150C24" stroke-width="6"/>
  <rect x="54" y="54" width="892" height="892" rx="10" fill="none" stroke="url(#plasmaGrad)" stroke-width="2.5" opacity="0.85"/>

  <!-- Electromagnetic Stator Fins -->
  <polygon points="58,58 160,58 120,120 58,160" fill="#7928CA" opacity="0.8"/>
  <polygon points="942,58 840,58 880,120 942,160" fill="#7928CA" opacity="0.8"/>
  <polygon points="58,942 160,942 120,880 58,840" fill="#7928CA" opacity="0.8"/>
  <polygon points="942,942 840,942 880,880 942,840" fill="#7928CA" opacity="0.8"/>
  <circle cx="72" cy="72" r="8" fill="#00DFD8"/>
  <circle cx="928" cy="72" r="8" fill="#00DFD8"/>
  <circle cx="72" cy="928" r="8" fill="#00DFD8"/>
  <circle cx="928" cy="928" r="8" fill="#00DFD8"/>

  <!-- Header & Status HUD -->
  <g transform="translate(80, 114)">
    <rect x="-8" y="-24" width="410" height="42" rx="6" fill="#1C0F32" stroke="#7928CA" stroke-width="2"/>
    <circle cx="12" cy="-3" r="7" fill="#00DFD8"/>
    <text x="28" y="5" fill="#00DFD8" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="900" letter-spacing="2">● TIER 3 // QUANTUM TURBINE</text>
  </g>

  <!-- Capacitor Gauge (3/5 Cells Illuminated) -->
  <g transform="translate(680, 95)">
    <text x="0" y="20" fill="#00DFD8" font-family="'IBM Plex Mono', monospace" font-size="16" font-weight="700">YIELD GAUGE</text>
    <rect x="130" y="5" width="20" height="20" rx="3" fill="#7928CA"/>
    <rect x="156" y="5" width="20" height="20" rx="3" fill="#7928CA"/>
    <rect x="182" y="5" width="20" height="20" rx="3" fill="#00DFD8"/>
    <rect x="208" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
    <rect x="234" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
  </g>
  <line x1="80" y1="150" x2="920" y2="150" stroke="url(#plasmaGrad)" stroke-width="2"/>

  <!-- Quantum Turbine Core -->
  <g transform="translate(500, 490)">
    <!-- Plasma Field Arcs -->
    <circle cx="0" cy="0" r="280" fill="none" stroke="#7928CA" stroke-width="2" stroke-dasharray="32 8" opacity="0.6"/>
    <circle cx="0" cy="0" r="240" fill="none" stroke="#00DFD8" stroke-width="3" stroke-dasharray="8 8"/>
    <!-- Gyro Orbital Rings -->
    <ellipse cx="0" cy="0" rx="270" ry="110" fill="none" stroke="#FF0080" stroke-width="2.5" transform="rotate(-30)" opacity="0.85"/>
    <ellipse cx="0" cy="0" rx="270" ry="110" fill="none" stroke="#00DFD8" stroke-width="2.5" transform="rotate(30)" opacity="0.85"/>
    <!-- Inner Chamber -->
    <circle cx="0" cy="0" r="160" fill="#120A24" stroke="#00DFD8" stroke-width="6"/>
    <circle cx="0" cy="0" r="130" fill="none" stroke="#FF0080" stroke-width="2" stroke-dasharray="12 6"/>
    <!-- N Sigil Plasma Cyan -->
    <g stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M-40 56 L-40 -56"/>
      <path d="M40 56 L40 -56"/>
      <path d="M-40 -56 L40 56"/>
    </g>
    <circle cx="0" cy="0" r="10" fill="#FF0080"/>
  </g>

  <!-- Identity Footer -->
  <line x1="80" y1="784" x2="920" y2="784" stroke="url(#plasmaGrad)" stroke-width="2"/>
  <text x="80" y="874" fill="#FFFFFF" font-family="'Satoshi', sans-serif" font-size="88" font-weight="900" letter-spacing="4">NARA</text>
  <text x="84" y="918" fill="#00DFD8" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="800" letter-spacing="2">QUANTUM TURBINE // +0.10 ETH</text>
  <text x="920" y="856" fill="#00DFD8" font-family="'IBM Plex Mono', monospace" font-size="32" font-weight="900" text-anchor="end">POS #000015</text>
  <text x="920" y="896" fill="#E2A8FF" font-family="'IBM Plex Mono', monospace" font-size="22" font-weight="700" text-anchor="end">YIELD: +0.285 ETH</text>
</svg>`;
}

function generateTier4() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" style="background:#07090C;">
  <defs>
    <radialGradient id="t4glow" cx="50%" cy="49%" r="48%"><stop offset="0%" stop-color="#FF1E44" stop-opacity="0.4"/><stop offset="60%" stop-color="#FFB700" stop-opacity="0.15"/><stop offset="100%" stop-color="#07090C" stop-opacity="0"/></radialGradient>
    <linearGradient id="crimsonGold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FF1E44"/><stop offset="50%" stop-color="#FF9900"/><stop offset="100%" stop-color="#FFD700"/></linearGradient>
  </defs>

  <rect width="1000" height="1000" fill="#07090C"/>
  <rect width="1000" height="1000" fill="url(#t4glow)"/>
  <rect x="24" y="24" width="952" height="952" rx="24" fill="none" stroke="#2B0D14" stroke-width="48"/>
  <rect x="48" y="48" width="904" height="904" rx="14" fill="none" stroke="#14060A" stroke-width="6"/>
  <rect x="54" y="54" width="892" height="892" rx="10" fill="none" stroke="url(#crimsonGold)" stroke-width="3" opacity="0.9"/>

  <!-- Warped Spacetime Coordinate Grid -->
  <path d="M100 500 Q500 400 900 500 M100 500 Q500 600 900 500 M500 100 Q400 500 500 900 M500 100 Q600 500 500 900" fill="none" stroke="#FF1E44" stroke-width="1.5" opacity="0.3"/>

  <!-- Hyper-Reinforced Corner Mounts -->
  <path d="M58 160 V58 H160" fill="none" stroke="#FFD700" stroke-width="10" stroke-linecap="round"/>
  <path d="M942 160 V58 H840" fill="none" stroke="#FFD700" stroke-width="10" stroke-linecap="round"/>
  <path d="M58 840 V942 H160" fill="none" stroke="#FFD700" stroke-width="10" stroke-linecap="round"/>
  <path d="M942 840 V942 H840" fill="none" stroke="#FFD700" stroke-width="10" stroke-linecap="round"/>
  <circle cx="72" cy="72" r="9" fill="#FF1E44" stroke="#FFD700" stroke-width="3"/>
  <circle cx="928" cy="72" r="9" fill="#FF1E44" stroke="#FFD700" stroke-width="3"/>
  <circle cx="72" cy="928" r="9" fill="#FF1E44" stroke="#FFD700" stroke-width="3"/>
  <circle cx="928" cy="928" r="9" fill="#FF1E44" stroke="#FFD700" stroke-width="3"/>

  <!-- Header & Status HUD -->
  <g transform="translate(80, 114)">
    <rect x="-8" y="-24" width="440" height="42" rx="6" fill="#24070D" stroke="#FF1E44" stroke-width="2"/>
    <circle cx="12" cy="-3" r="7" fill="#FFD700"/>
    <text x="28" y="5" fill="#FFD700" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="900" letter-spacing="2">● TIER 4 // GRAVITATIONAL CORE</text>
  </g>

  <!-- Capacitor Gauge (4/5 Cells Illuminated) -->
  <g transform="translate(680, 95)">
    <text x="0" y="20" fill="#FFD700" font-family="'IBM Plex Mono', monospace" font-size="16" font-weight="700">YIELD GAUGE</text>
    <rect x="130" y="5" width="20" height="20" rx="3" fill="#FF1E44"/>
    <rect x="156" y="5" width="20" height="20" rx="3" fill="#FF1E44"/>
    <rect x="182" y="5" width="20" height="20" rx="3" fill="#FF9900"/>
    <rect x="208" y="5" width="20" height="20" rx="3" fill="#FFD700"/>
    <rect x="234" y="5" width="20" height="20" rx="3" fill="#1E2430"/>
  </g>
  <line x1="80" y1="150" x2="920" y2="150" stroke="url(#crimsonGold)" stroke-width="2.5"/>

  <!-- 3D Levitating Singularity Core -->
  <g transform="translate(500, 490)">
    <!-- Concentric Gyro Rings -->
    <circle cx="0" cy="0" r="290" fill="none" stroke="#FF1E44" stroke-width="3" opacity="0.6"/>
    <ellipse cx="0" cy="0" rx="280" ry="100" fill="none" stroke="#FFD700" stroke-width="3" transform="rotate(-45)"/>
    <ellipse cx="0" cy="0" rx="280" ry="100" fill="none" stroke="#FF1E44" stroke-width="3" transform="rotate(45)"/>
    <ellipse cx="0" cy="0" rx="280" ry="90" fill="none" stroke="#FFAA00" stroke-width="2" transform="rotate(90)"/>
    <!-- Tachyon Starburst -->
    <polygon points="0,-290 60,-60 290,0 60,60 0,290 -60,60 -290,0 -60,-60" fill="none" stroke="#FFD700" stroke-width="2.5" opacity="0.8"/>
    <!-- Central Black-Hole Chamber -->
    <circle cx="0" cy="0" r="160" fill="#120306" stroke="#FFD700" stroke-width="8"/>
    <circle cx="0" cy="0" r="140" fill="none" stroke="#FF1E44" stroke-width="4" stroke-dasharray="16 8"/>
    <!-- 3D Diamond-Cut N Sigil -->
    <g stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M-40 56 L-40 -56"/>
      <path d="M40 56 L40 -56"/>
      <path d="M-40 -56 L40 56"/>
    </g>
    <circle cx="0" cy="0" r="12" fill="#FF1E44"/>
  </g>

  <!-- Identity Footer -->
  <line x1="80" y1="784" x2="920" y2="784" stroke="url(#crimsonGold)" stroke-width="2.5"/>
  <text x="80" y="874" fill="#FFFFFF" font-family="'Satoshi', sans-serif" font-size="88" font-weight="900" letter-spacing="4">NARA</text>
  <text x="84" y="918" fill="#FFD700" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="800" letter-spacing="2">GRAVITATIONAL CORE // +1.0 ETH</text>
  <text x="920" y="856" fill="#FFD700" font-family="'IBM Plex Mono', monospace" font-size="32" font-weight="900" text-anchor="end">POS #000015</text>
  <text x="920" y="896" fill="#FFAA88" font-family="'IBM Plex Mono', monospace" font-size="22" font-weight="700" text-anchor="end">YIELD: +1.840 ETH</text>
</svg>`;
}

function generateTier5() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" style="background:#040508;">
  <defs>
    <radialGradient id="t5sun" cx="50%" cy="49%" r="49%"><stop offset="0%" stop-color="#FFF0A0" stop-opacity="0.6"/><stop offset="30%" stop-color="#FFB700" stop-opacity="0.35"/><stop offset="65%" stop-color="#FF0080" stop-opacity="0.2"/><stop offset="100%" stop-color="#040508" stop-opacity="0"/></radialGradient>
    <linearGradient id="godFrame" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE072"/><stop offset="25%" stop-color="#FF0080"/><stop offset="50%" stop-color="#00DFD8"/><stop offset="75%" stop-color="#79FFE1"/><stop offset="100%" stop-color="#FFE072"/></linearGradient>
    <linearGradient id="pureGold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFE072"/><stop offset="50%" stop-color="#D4AF37"/><stop offset="100%" stop-color="#FFF5B8"/></linearGradient>
  </defs>

  <!-- Background Void & Blinding Supernova Corona -->
  <rect width="1000" height="1000" fill="#040508"/>
  <rect width="1000" height="1000" fill="url(#t5sun)"/>

  <!-- Celestial God-Rays Cutting Through the Frame -->
  <line x1="0" y1="0" x2="1000" y2="1000" stroke="#FFF0A0" stroke-width="1.5" opacity="0.4"/>
  <line x1="1000" y1="0" x2="0" y2="1000" stroke="#FFF0A0" stroke-width="1.5" opacity="0.4"/>
  <line x1="500" y1="0" x2="500" y2="1000" stroke="#FFF0A0" stroke-width="2" opacity="0.5"/>
  <line x1="0" y1="490" x2="1000" y2="490" stroke="#FFF0A0" stroke-width="2" opacity="0.5"/>

  <!-- Sovereign Prismatic Gold Frame -->
  <rect x="24" y="24" width="952" height="952" rx="28" fill="none" stroke="url(#godFrame)" stroke-width="48"/>
  <rect x="48" y="48" width="904" height="904" rx="16" fill="none" stroke="#161006" stroke-width="6"/>
  <rect x="54" y="54" width="892" height="892" rx="12" fill="none" stroke="#FFD700" stroke-width="3" opacity="0.95"/>

  <!-- Sovereign Lion-Crested Crown Corner Hardware -->
  <path d="M58 180 V58 H180" fill="none" stroke="#FFE072" stroke-width="12" stroke-linecap="round"/>
  <path d="M942 180 V58 H820" fill="none" stroke="#FFE072" stroke-width="12" stroke-linecap="round"/>
  <path d="M58 820 V942 H180" fill="none" stroke="#FFE072" stroke-width="12" stroke-linecap="round"/>
  <path d="M942 820 V942 H820" fill="none" stroke="#FFE072" stroke-width="12" stroke-linecap="round"/>
  <polygon points="72,58 84,82 60,82" fill="#FFE072"/>
  <polygon points="928,58 940,82 916,82" fill="#FFE072"/>
  <polygon points="72,942 84,918 60,918" fill="#FFE072"/>
  <polygon points="928,942 940,918 916,918" fill="#FFE072"/>

  <!-- Header & Status HUD -->
  <g transform="translate(80, 114)">
    <rect x="-8" y="-24" width="460" height="42" rx="8" fill="url(#godFrame)"/>
    <circle cx="12" cy="-3" r="8" fill="#000000"/>
    <text x="28" y="5" fill="#000000" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="900" letter-spacing="2">★ TIER 5 // APEX SUPERNOVA</text>
  </g>

  <!-- Capacitor Gauge (5/5 Fully Overcharged Cells) -->
  <g transform="translate(680, 95)">
    <text x="0" y="20" fill="#FFE072" font-family="'IBM Plex Mono', monospace" font-size="16" font-weight="700">YIELD GAUGE</text>
    <rect x="130" y="5" width="20" height="20" rx="3" fill="#FFD700"/>
    <rect x="156" y="5" width="20" height="20" rx="3" fill="#FFD700"/>
    <rect x="182" y="5" width="20" height="20" rx="3" fill="#FF0080"/>
    <rect x="208" y="5" width="20" height="20" rx="3" fill="#00DFD8"/>
    <rect x="234" y="5" width="20" height="20" rx="3" fill="#79FFE1"/>
  </g>
  <line x1="80" y1="150" x2="920" y2="150" stroke="url(#godFrame)" stroke-width="3"/>

  <!-- Blinding Cosmic Fusion Core -->
  <g transform="translate(500, 490)">
    <!-- 8-Point Diffraction Star Spikes -->
    <polygon points="0,-380 30,-80 380,0 30,80 0,380 -30,80 -380,0 -30,-80" fill="url(#godFrame)" opacity="0.5"/>
    <polygon points="-240,-240 0,-60 240,-240 60,0 240,240 0,60 -240,240 -60,0" fill="#FFE072" opacity="0.3"/>
    <!-- Radiant Rings -->
    <circle cx="0" cy="0" r="300" fill="none" stroke="#FFE072" stroke-width="4" stroke-dasharray="24 12"/>
    <circle cx="0" cy="0" r="260" fill="none" stroke="#FF0080" stroke-width="3"/>
    <circle cx="0" cy="0" r="220" fill="none" stroke="#00DFD8" stroke-width="4" stroke-dasharray="16 6"/>
    <!-- Sovereign Sun Chamber -->
    <circle cx="0" cy="0" r="160" fill="#1C1405" stroke="url(#pureGold)" stroke-width="10"/>
    <circle cx="0" cy="0" r="135" fill="none" stroke="#FFE072" stroke-width="3" stroke-dasharray="12 4"/>
    <!-- 3D Sovereign Diamond N -->
    <g stroke="#FFFFFF" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M-42 60 L-42 -60"/>
      <path d="M42 60 L42 -60"/>
      <path d="M-42 -60 L42 60"/>
    </g>
    <circle cx="0" cy="0" r="14" fill="#FFE072"/>
  </g>

  <!-- Identity Footer -->
  <line x1="80" y1="784" x2="920" y2="784" stroke="url(#godFrame)" stroke-width="3"/>
  <text x="80" y="874" fill="#FFFFFF" font-family="'Satoshi', sans-serif" font-size="88" font-weight="900" letter-spacing="4">NARA</text>
  <text x="84" y="918" fill="#FFE072" font-family="'IBM Plex Mono', monospace" font-size="20" font-weight="800" letter-spacing="2">APEX SUPERNOVA // +10 ETH GOD-TIER</text>
  <text x="920" y="856" fill="#FFE072" font-family="'IBM Plex Mono', monospace" font-size="32" font-weight="900" text-anchor="end">POS #000015</text>
  <text x="920" y="896" fill="#FFF0A0" font-family="'IBM Plex Mono', monospace" font-size="22" font-weight="700" text-anchor="end">YIELD: +14.250 ETH</text>
</svg>`;
}

fs.writeFileSync("evolution_tier1_dormant.svg", generateTier1());
fs.writeFileSync("evolution_tier2_ignition.svg", generateTier2());
fs.writeFileSync("evolution_tier3_turbine.svg", generateTier3());
fs.writeFileSync("evolution_tier4_singularity.svg", generateTier4());
fs.writeFileSync("evolution_tier5_supernova.svg", generateTier5());

console.log("✅ All 5 Evolution Stage SVGs generated successfully!");
