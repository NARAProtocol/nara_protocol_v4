/**
 * NARA Protocol — Authoritative Single Source of Truth
 * Fixed v4 Production Stack on Base Mainnet (Chain ID: 8453)
 */

export const PROTOCOL_CONSTANTS = {
  name: "NARA",
  symbol: "NARA",
  displayTicker: "$NARA",
  chain: "Base",
  chainId: 8453,
  
  // Authoritative Core Contracts
  tokenContract: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
  engineContract: "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC",
  hookContract: "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088",
  hookBitmask: "0x2088",
  vaultContract: "0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D",
  compounderContract: "0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF",
  poolId: "0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464",
  rangeManagerContract: "0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C",
  treasurySafe: "0x5050BC6dc3E07313D52D05cecD53f727D6CDa245",
  custodySafe: "0xd65c0e390Dc187A22c52c03816591CC736C0D755",
  
  // Economics & Constraints
  totalSupply: 1_000_000,
  decimals: 18,
  epochDurationMinutes: 15,
  epochsPerDay: 96,
  maxLockEpochs: 35040, // ~1 year
};

export const SOCIAL_LINKS = {
  website: "https://naraprotocol.pro",
  swapApp: "https://swap.naraprotocol.pro",
  telegram: "https://t.me/NARAProtocol",
  twitter: "https://x.com/NARA_protocol",
  farcaster: "https://warpcast.com/naraprotocol",
  github: "https://github.com/NARAProtocol/nara_protocol",
  publicDocs: "https://github.com/NARAProtocol/nara_protocol_public",
  noobGuide: "https://github.com/NARAProtocol/nara_protocol_public/blob/main/docs/User_Guide.md",
  basescanToken: `https://basescan.org/token/${PROTOCOL_CONSTANTS.tokenContract}`,
  basescanEngine: `https://basescan.org/address/${PROTOCOL_CONSTANTS.engineContract}`,
  uniswapHooklistPr: "https://github.com/Uniswap/hooklist/pull/1643",
  defillamaPr: "https://github.com/DefiLlama/DefiLlama-Adapters/pull/20841",
  dexscreener: `https://dexscreener.com/base/${PROTOCOL_CONSTANTS.tokenContract}`,
};

/**
 * Permanent NARA Official Master Emblem SVG & Brand Assets
 * Mandatory per AGENTS.md Brand Standard:
 * - Solid Black (#000000) canvas
 * - Dual concentric radar rings
 * - 15-notch epoch precision dial
 * - Monolithic architectural N
 */
export const NARA_MASTER_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" fill="none"><rect width="1000" height="1000" fill="#000000"/><circle cx="500" cy="500" r="410" stroke="#FFFFFF" stroke-width="18"/><circle cx="500" cy="500" r="350" stroke="#FFFFFF" stroke-width="18"/><g><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(0 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(24 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(48 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(72 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(96 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(120 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(144 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(168 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(192 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(216 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(240 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(264 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(288 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(312 500 500)"/><line x1="500" y1="65" x2="500" y2="175" stroke="#FFFFFF" stroke-width="22" stroke-linecap="square" transform="rotate(336 500 500)"/></g><g fill="#FFFFFF"><polygon points="330,345 375,300 420,300 420,700 330,700"/><polygon points="580,300 625,300 670,345 670,700 580,700"/><polygon points="375,300 445,300 545,465 475,465"/><polygon points="525,535 595,535 625,700 555,700"/><polygon points="410,340 435,340 590,660 565,660"/></g></svg>`;

export const BRAND_ASSETS = {
  masterSvg: NARA_MASTER_LOGO_SVG,
  masterSolidBlackPng: "/nara-logo-white.png",
  masterTransparentPng: "/nara-logo-transparent.png",
  masterCirclePng: "/nara-circle-1024.png",
  circle512: "/nara-circle-512.png",
  circle256: "/nara-circle-256.png",
  circle192: "/nara-circle-192.png",
  circle128: "/nara-circle-128.png",
  token128: "/nara_token_128.png",
  token200: "/nara_token_200.png",
  token256: "/nara_token_256.png",
  token512: "/nara_token_512.png",
  appleTouchIcon: "/apple-touch-icon.png",
  faviconIco: "/favicon.ico",
  faviconSvg: "/favicon.svg",
};


// Layman-accessible 4 core pillars for the reticle HUD
export const TELEMETRY_NODES = [
  {
    id: "scarcity",
    label: "01 // FIXED SCARCITY",
    headline: "1,000,000 Cap Forever",
    spec: "Non-Mintable · Zero Inflation",
    contract: PROTOCOL_CONSTANTS.tokenContract,
    desc: "Most tokens print endless supply to dump on you. NARA is mathematically capped at 1,000,000 tokens forever. There is no mint button.",
  },
  {
    id: "epochs",
    label: "02 // 15-MIN REWARDS",
    headline: "96 Payouts Every Day",
    spec: "Every 900 Seconds · Time-Weighted",
    contract: PROTOCOL_CONSTANTS.engineContract,
    desc: "Time is money. The network calculates and streams real rewards directly to committed participants every 15 minutes around the clock.",
  },
  {
    id: "moat",
    label: "03 // THE SACRIFICIAL LAW",
    headline: "Panic Sellers Feed You",
    spec: "Permanent Position Burn · Dynamic Yield",
    contract: PROTOCOL_CONSTANTS.engineContract,
    desc: "When impatient holders panic and exit, their positions are permanently burned from the chain. Their future reward streams automatically transfer directly to you.",
  },
  {
    id: "vault",
    label: "04 // VOLATILITY VAULT",
    headline: "Trading Fees Backed",
    spec: "Uniswap v4 Hook · Protocol Reserves",
    contract: PROTOCOL_CONSTANTS.hookContract,
    desc: "Every time traders or arbitrage bots trade NARA, the automated Uniswap v4 hook captures fees and banks them directly into the protocol treasury.",
  },
];
