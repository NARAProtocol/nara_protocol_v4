import fs from 'node:fs';

function generateFatFrameSVG(tier = 0, tokenId = 1, positionId = 1, amount = '9.9 NARA', epochs = '96') {
  const IVORY = '#F4EFE6';
  const PURE_WHITE = '#FFFFFF';
  const FRAME_BG = '#0B0D10';
  const PLATE_BG = '#101318';
  const FRAME_BORDER = '#232830';
  const GRID_LINE = '#202630';
  const MUTED_TEXT = '#8E95A5';
  const COBALT = '#0052FF';
  const CYAN = '#00D8FF';
  const EMERALD = '#00E599';
  const GOLD = '#F5B041';
  const APEX_AMBER = '#FF6B00';

  const tierColors = [COBALT, COBALT, EMERALD, GOLD, APEX_AMBER];
  const tierNames = ['DORMANT // NEW', 'ACTIVATED', 'REWARDED', 'CALIBRATED', 'APEX RADIANT'];
  const accent = tierColors[tier] || COBALT;
  const status = tierNames[tier] || tierNames[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  <defs>
    <!-- Radial Core Glow -->
    <radialGradient id="core-glow" cx="50%" cy="44%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="${tier === 0 ? '0.25' : '0.45'}"/>
      <stop offset="50%" stop-color="${accent}" stop-opacity="${tier === 0 ? '0.08' : '0.15'}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    
    <!-- Heavy Frame Metallic Bevel -->
    <linearGradient id="frame-bevel" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#363D4A"/>
      <stop offset="50%" stop-color="#181C22"/>
      <stop offset="100%" stop-color="#0D0F13"/>
    </linearGradient>

    <linearGradient id="plate-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#13171F"/>
      <stop offset="100%" stop-color="#0A0C10"/>
    </linearGradient>

    <!-- Blueprint Grid -->
    <pattern id="tech-grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${GRID_LINE}" stroke-width="1.2" stroke-opacity="0.75"/>
      <circle cx="40" cy="40" r="1" fill="${GRID_LINE}" opacity="0.9"/>
    </pattern>

    <!-- Blur Filter for Glow -->
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- 1. LUXURY ARCHITECTURAL FAT FRAME (Heavy Outer Bezel: 48px wide) -->
  <rect x="0" y="0" width="1000" height="1000" rx="36" fill="url(#frame-bevel)"/>
  <rect x="8" y="8" width="984" height="984" rx="30" fill="${FRAME_BG}" stroke="#2D3440" stroke-width="2"/>
  <rect x="44" y="44" width="912" height="912" rx="18" fill="url(#plate-gradient)" stroke="#2A303C" stroke-width="3"/>
  
  <!-- Frame Corner Hardware Reinforcements / Industrial Rivets -->
  <!-- Top Left -->
  <path d="M20 54 L54 20 M20 20 L20 44 M20 20 L44 20" stroke="${IVORY}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <circle cx="32" cy="32" r="3.5" fill="${IVORY}" opacity="0.9"/>
  <line x1="24" y1="76" x2="24" y2="120" stroke="#404958" stroke-width="1.5"/>
  <!-- Top Right -->
  <path d="M980 54 L946 20 M980 20 L980 44 M980 20 L956 20" stroke="${IVORY}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <circle cx="968" cy="32" r="3.5" fill="${IVORY}" opacity="0.9"/>
  <line x1="976" y1="76" x2="976" y2="120" stroke="#404958" stroke-width="1.5"/>
  <!-- Bottom Left -->
  <path d="M20 946 L54 980 M20 980 L20 956 M20 980 L44 980" stroke="${IVORY}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <circle cx="32" cy="968" r="3.5" fill="${IVORY}" opacity="0.9"/>
  <line x1="24" y1="924" x2="24" y2="880" stroke="#404958" stroke-width="1.5"/>
  <!-- Bottom Right -->
  <path d="M980 946 L946 980 M980 980 L980 956 M980 980 L956 980" stroke="${IVORY}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <circle cx="968" cy="968" r="3.5" fill="${IVORY}" opacity="0.9"/>
  <line x1="976" y1="924" x2="976" y2="880" stroke="#404958" stroke-width="1.5"/>

  <!-- Frame Scale Tick Marks (Top and Bottom Rulers) -->
  <g stroke="#3D4656" stroke-width="1" opacity="0.7">
    <line x1="200" y1="24" x2="200" y2="32"/><line x1="300" y1="24" x2="300" y2="32"/><line x1="400" y1="24" x2="400" y2="32"/>
    <line x1="500" y1="20" x2="500" y2="36" stroke="${IVORY}" stroke-width="1.5" opacity="0.9"/>
    <line x1="600" y1="24" x2="600" y2="32"/><line x1="700" y1="24" x2="700" y2="32"/><line x1="800" y1="24" x2="800" y2="32"/>
  </g>

  <!-- 2. INNER SECURITY PLATE BACKGROUND GRID -->
  <rect x="54" y="54" width="892" height="892" rx="12" fill="url(#tech-grid)"/>
  <rect x="54" y="54" width="892" height="892" rx="12" fill="url(#core-glow)"/>

  <!-- 3. TOP SPECIFICATION HEADER -->
  <g transform="translate(80, 96)">
    <circle cx="8" cy="8" r="7" fill="${accent}" filter="url(#glow)"/>
    <circle cx="8" cy="8" r="3.5" fill="${PURE_WHITE}"/>
    <text x="28" y="14" fill="${IVORY}" font-family="'Satoshi', 'Inter', system-ui, sans-serif" font-size="20" font-weight="800" letter-spacing="3">${status}</text>
    <text x="28" y="34" fill="${MUTED_TEXT}" font-family="'IBM Plex Mono', monospace" font-size="12" letter-spacing="2">PROOF-OF-POSITION // ON-CHAIN ERC-721</text>
    
    <!-- Top Right Spec -->
    <text x="840" y="14" fill="${IVORY}" font-family="'IBM Plex Mono', monospace" font-size="14" font-weight="700" text-anchor="end" letter-spacing="1.5">EPOCH #${epochs}</text>
    <text x="840" y="34" fill="${MUTED_TEXT}" font-family="'IBM Plex Mono', monospace" font-size="11" text-anchor="end" letter-spacing="1">BASE MAINNET [8453]</text>
  </g>

  <!-- 4. HIGH-CONTRAST CENTRAL GEOMETRIC RADAR AND SEAL -->
  <g transform="translate(500, 450)">
    <!-- Outer Precision Rings -->
    <circle cx="0" cy="0" r="260" fill="none" stroke="${FRAME_BORDER}" stroke-width="1.5" stroke-dasharray="6 8"/>
    <circle cx="0" cy="0" r="210" fill="none" stroke="${GRID_LINE}" stroke-width="2"/>
    <circle cx="0" cy="0" r="160" fill="none" stroke="${accent}" stroke-width="2" opacity="0.85" stroke-dasharray="12 6"/>

    <!-- Crosshair Cardinal Marks -->
    <line x1="-280" y1="0" x2="280" y2="0" stroke="#3D4656" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 6"/>
    <line x1="0" y1="-280" x2="0" y2="280" stroke="#3D4656" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 6"/>
    
    <!-- Cardinal Compass Brackets -->
    <path d="M-160 -10 L-160 10 M160 -10 L160 10 M-10 -160 L10 -160 M-10 160 L10 160" stroke="${IVORY}" stroke-width="2.5"/>

    <!-- Center Heavy Medallion Disc -->
    <circle cx="0" cy="0" r="108" fill="#0A0C10" stroke="${accent}" stroke-width="4.5" filter="url(#glow)"/>
    <circle cx="0" cy="0" r="96" fill="none" stroke="#262D38" stroke-width="2"/>
    <circle cx="0" cy="0" r="84" fill="none" stroke="${IVORY}" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"/>

    <!-- ICONIC NARA 'N' SIGIL (Crisp, High-Contrast Ivory and Cobalt) -->
    <g stroke="${IVORY}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M-28 42 L-28 -42"/>
      <path d="M28 42 L28 -42"/>
      <path d="M-28 -42 L28 42"/>
    </g>
    <!-- Center Jewel Dot -->
    <circle cx="0" cy="0" r="6" fill="${accent}"/>
  </g>

  <!-- 5. BOTTOM MASTER IDENTITY AND FACT LEDGER -->
  <g transform="translate(80, 780)">
    <!-- Divider Line -->
    <line x1="0" y1="0" x2="840" y2="0" stroke="#323A48" stroke-width="2"/>
    <line x1="0" y1="0" x2="140" y2="0" stroke="${accent}" stroke-width="3"/>

    <!-- Left Brand Stack -->
    <text x="0" y="58" fill="${PURE_WHITE}" font-family="'Satoshi', 'Inter', system-ui, sans-serif" font-size="64" font-weight="900" letter-spacing="6">NARA</text>
    <text x="4" y="92" fill="${MUTED_TEXT}" font-family="'IBM Plex Mono', monospace" font-size="12" font-weight="500" letter-spacing="3">SECURE TOKEN-BOUND INSTRUMENT</text>

    <!-- Right Technical Metadata Block -->
    <g transform="translate(840, 30)" text-anchor="end" font-family="'IBM Plex Mono', monospace">
      <text x="0" y="0" fill="${MUTED_TEXT}" font-size="12" letter-spacing="1.5">POSITION ID</text>
      <text x="0" y="20" fill="${IVORY}" font-size="18" font-weight="700" letter-spacing="2">#${String(positionId).padStart(6, '0')}</text>
      
      <text x="0" y="46" fill="${MUTED_TEXT}" font-size="12" letter-spacing="1.5">TOKEN ID</text>
      <text x="0" y="66" fill="${IVORY}" font-size="18" font-weight="700" letter-spacing="2">#${String(tokenId).padStart(6, '0')}</text>

      <text x="0" y="92" fill="${accent}" font-size="13" font-weight="700" letter-spacing="2">PRINCIPAL: ${amount}</text>
    </g>
  </g>

</svg>`;
}

const sample0 = generateFatFrameSVG(0, 1, 11, '9.9 NARA', '1396');
const sample1 = generateFatFrameSVG(1, 2, 12, '99 NARA', '4180');
const sample3 = generateFatFrameSVG(3, 3, 13, '500 NARA', '8760');
const sample4 = generateFatFrameSVG(4, 4, 14, '10,000 NARA', '35040');

fs.writeFileSync('scripts/scratch-nft-tier0.svg', sample0, 'utf8');
fs.writeFileSync('scripts/scratch-nft-tier1.svg', sample1, 'utf8');
fs.writeFileSync('scripts/scratch-nft-tier3.svg', sample3, 'utf8');
fs.writeFileSync('scripts/scratch-nft-tier4.svg', sample4, 'utf8');
console.log('Sample luxury fat frame SVGs written successfully!');
