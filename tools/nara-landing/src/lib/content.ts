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
  twitter: "https://x.com/NARA_protocol",
  farcaster: "https://warpcast.com/naraprotocol",
  github: "https://github.com/NARAProtocol/nara_protocol_v4",
  publicDocs: "https://github.com/NARAProtocol/nara_protocol_public",
  noobGuide: "https://github.com/NARAProtocol/nara_protocol_public/blob/main/docs/User_Guide.md",
  basescanToken: `https://basescan.org/token/${PROTOCOL_CONSTANTS.tokenContract}`,
  basescanEngine: `https://basescan.org/address/${PROTOCOL_CONSTANTS.engineContract}`,
  uniswapHooklistPr: "https://github.com/Uniswap/hooklist/pull/1643",
  defillamaPr: "https://github.com/DefiLlama/DefiLlama-Adapters/pull/20841",
  dexscreener: `https://dexscreener.com/base/${PROTOCOL_CONSTANTS.tokenContract}`,
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
