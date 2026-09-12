import { ethers } from "ethers";

export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_ID_HEX = "0x2105";
export const DEFAULT_BASE_RPC = "https://mainnet.base.org";
export const BASE_RPC_URLS = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
  "https://1rpc.io/base",
];

export const GRID_ADDRESSES = {
  naraToken: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  engine: "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC",
  positionNft: "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b",
  fleetDeckLens: "0x4B097067106623185aE32Cd9c2463Bb4143Fb516",
  poolId: "0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
} as const;

export const DURATION_HORIZONS = [
  { label: "1 Day", epochs: 96, multiplier: "1.00X", title: "96 Epochs", days: 1 },
  { label: "30 Days", epochs: 2880, multiplier: "1.06X", title: "2,880 Epochs", days: 30 },
  { label: "90 Days", epochs: 8760, multiplier: "1.28X", title: "8,760 Epochs", days: 90 },
  { label: "180 Days", epochs: 17520, multiplier: "1.85X", title: "17,520 Epochs", days: 180 },
  { label: "365 Days", epochs: 35040, multiplier: "4.00X", title: "35,040 Epochs", days: 365 },
] as const;

export const erc20Abi = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export const positionNftAbi = [
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function positionIdOf(uint256 tokenId) view returns (uint256)",
  "function accountOf(uint256 tokenId) view returns (address)",
  "function positionInfo(uint256 tokenId) view returns (tuple(address owner, uint64 createdEpoch, uint32 flags, uint128 amount, uint128 weight, uint64 activationEpoch, uint64 unlockEpoch, uint128 tokenWeight, uint256 naraDebtRay, uint256 ethDebtRay))",
  "function genesisMetadataOf(uint256 tokenId) view returns (tuple(bool isGenesis, bool isEternal, uint16 genesisMultiplierBps, uint16 permanentMultiplierBps, uint32 totalMultiplierBps, uint64 createdEpoch, uint256 rewardWeight))",
  "function mintAndLockFor(address recipient, uint256 amount, uint64 durationEpochs, uint256 minWeight) payable returns (uint256 tokenId, uint256 positionId)",
  "function claimRewards(uint256 tokenId, address to) returns (uint256 naraAmount, uint256 ethAmount)",
  "function claimTokenRewards(uint256 tokenId, address token, address to) returns (uint256 amount)",
  "function unlock(uint256 tokenId) payable",
  "function unlockTo(uint256 tokenId, address to) payable",
  "event PositionMinted(address indexed caller, address indexed recipient, uint256 indexed tokenId, address account, uint256 positionId, uint256 amount, uint64 durationEpochs)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

export const engineAbi = [
  "function currentEpoch() view returns (uint64)",
  "function lockFeeWei() view returns (uint96)",
  "function unlockFeeWei() view returns (uint96)",
  "function claimableRewards(uint256 positionId) view returns (uint256 naraAmount, uint256 ethAmount)",
  "function claimableTokenRewards(uint256 positionId, address token) view returns (uint256)",
  "function epochState() view returns (tuple(uint64 epoch, uint64 timestamp, uint256 circulatingSupply, uint256 totalLocked, uint256 activeTotalWeight, uint256 weightedLockShareWad, uint256 stressWad, uint256 betaWad, uint256 horizon, uint256 retentionWad, uint256 baseEmission, uint256 emission, uint256 admittedSupply, uint256 distributedNara, uint256 distributedEth, uint256 treasuryAmount, uint256 warmupFactorWad, uint256 bootstrapWeight, uint256 heartbeat))",
];

export const multicall3Abi = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
];

export const fleetDeckLensAbi = [
  {
    type: "function",
    name: "getFleetDeckSummary",
    inputs: [
      { name: "user", type: "address" },
      { name: "tokenIds", type: "uint256[]" },
    ],
    outputs: [
      {
        name: "deck",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "totalLockedNara", type: "uint256" },
          { name: "totalWeight", type: "uint256" },
          { name: "weightedAverageMultiplierWad", type: "uint256" },
          { name: "weightedAverageMultiplierBps", type: "uint16" },
          { name: "formattedWeightedMultiplier", type: "string" },
          { name: "deckSynergyMultiplierWad", type: "uint256" },
          { name: "deckSynergyMultiplierBps", type: "uint16" },
          { name: "formattedDeckSynergyMultiplier", type: "string" },
          { name: "totalEffectiveMultiplierWad", type: "uint256" },
          { name: "totalEffectiveMultiplierBps", type: "uint32" },
          { name: "formattedTotalEffectiveMultiplier", type: "string" },
          { name: "effectiveTotalWeight", type: "uint256" },
          {
            name: "synergy",
            type: "tuple",
            components: [
              { name: "synergyTier", type: "uint8" },
              { name: "synergyTierName", type: "string" },
              { name: "formationBonusBps", type: "uint16" },
              { name: "genesisAuraBonusBps", type: "uint16" },
              { name: "synergyBonusBps", type: "uint16" },
              { name: "totalSynergyBonusBps", type: "uint16" },
              { name: "synergyMultiplierWad", type: "uint256" },
              { name: "formattedSynergyMultiplier", type: "string" },
              { name: "hasGenesisAura", type: "bool" },
              { name: "activeSlotsCount", type: "uint256" },
            ],
          },
          { name: "aggregateClaimableNara", type: "uint256" },
          { name: "aggregateClaimableEth", type: "uint256" },
          { name: "aggregateClaimableGenesisEth", type: "uint256" },
          { name: "aggregateClaimableGenesisToken", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
];

export interface PositionNftItem {
  tokenId: ethers.BigNumber;
  positionId: ethers.BigNumber;
  owner: string;
  account: string;
  amount: ethers.BigNumber;
  createdEpoch: number;
  unlockEpoch: number;
  weight: ethers.BigNumber;
  claimableEth: ethers.BigNumber;
  claimableNara: ethers.BigNumber;
  claimableUsdc?: ethers.BigNumber;
  tokenUri: string;
  name: string;
  description: string;
  imageSvg: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  isGenesis?: boolean;
  isEternal?: boolean;
  isSample?: boolean;
}

export interface FleetDeckSummary {
  user: string;
  totalLockedNara: ethers.BigNumber;
  totalWeight: ethers.BigNumber;
  formattedWeightedMultiplier: string;
  formattedDeckSynergyMultiplier: string;
  formattedTotalEffectiveMultiplier: string;
  effectiveTotalWeight: ethers.BigNumber;
  synergyTierName: string;
  synergyBonusBps: number;
  activeSlotsCount: number;
  hasGenesisAura: boolean;
  aggregateClaimableNara: ethers.BigNumber;
  aggregateClaimableEth: ethers.BigNumber;
  aggregateClaimableUsdc?: ethers.BigNumber;
}

/**
 * Parses and decodes on-chain data:application/json;base64 metadata URIs
 */
export function parseTokenUri(uri: string): {
  name: string;
  description: string;
  imageSvg: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
} {
  try {
    let jsonStr = "";
    if (uri.startsWith("data:application/json;base64,")) {
      jsonStr = atob(uri.replace("data:application/json;base64,", ""));
    } else if (uri.startsWith("data:application/json,")) {
      jsonStr = decodeURIComponent(uri.replace("data:application/json,", ""));
    } else if (uri.startsWith("{")) {
      jsonStr = uri;
    }
    if (!jsonStr) return { name: "NARA Position", description: "", imageSvg: "", attributes: [] };

    const parsed = JSON.parse(jsonStr);
    let imageSvg = parsed.image || parsed.image_data || "";
    if (typeof imageSvg === "string") {
      if (imageSvg.startsWith("data:image/svg+xml;base64,")) {
        try {
          const decoded = atob(imageSvg.replace("data:image/svg+xml;base64,", ""));
          if (decoded.includes("<svg")) {
            imageSvg = decoded;
          }
        } catch {}
      } else if (imageSvg.startsWith("data:image/svg+xml;utf8,")) {
        try {
          const decoded = decodeURIComponent(imageSvg.replace(/data:image\/svg\+xml;(utf8,)?/, ""));
          if (decoded.includes("<svg")) {
            imageSvg = decoded;
          }
        } catch {}
      }
    }

    return {
      name: parsed.name || "NARA Position",
      description: parsed.description || "",
      imageSvg,
      attributes: parsed.attributes || [],
    };
  } catch (err) {
    return { name: "NARA Position", description: "", imageSvg: "", attributes: [] };
  }
}

/**
 * Built-in sample positions for interactive Simulator / Preview mode
 */
export const SAMPLE_POSITIONS: PositionNftItem[] = [
  {
    tokenId: ethers.BigNumber.from(1),
    positionId: ethers.BigNumber.from(1),
    owner: "0x0000000000000000000000000000000000000000",
    account: "0x0000000000000000000000000000000000000000",
    amount: ethers.utils.parseEther("1200"),
    createdEpoch: 35000,
    unlockEpoch: 35096,
    weight: ethers.utils.parseEther("1200"),
    claimableEth: ethers.utils.parseEther("0.0245"),
    claimableNara: ethers.utils.parseEther("14.20"),
    tokenUri: "",
    name: "Position #000001 / Standard",
    description: "1,200 NARA Committed for 96 Epochs (Dormant Core)",
    imageSvg: "",
    attributes: [
      { trait_type: "Core", value: "Dormant" },
      { trait_type: "Realized Tier", value: "New" },
      { trait_type: "Module", value: "Signal Trace" },
    ],
    isSample: true,
  },
  {
    tokenId: ethers.BigNumber.from(2),
    positionId: ethers.BigNumber.from(2),
    owner: "0x0000000000000000000000000000000000000000",
    account: "0x0000000000000000000000000000000000000000",
    amount: ethers.utils.parseEther("5000"),
    createdEpoch: 34000,
    unlockEpoch: 36880,
    weight: ethers.utils.parseEther("5300"),
    claimableEth: ethers.utils.parseEther("0.0812"),
    claimableNara: ethers.utils.parseEther("48.50"),
    tokenUri: "",
    name: "Position #000002 / Genesis Aura",
    description: "5,000 NARA Genesis Position (Medium Bloom)",
    imageSvg: "",
    attributes: [
      { trait_type: "Core", value: "Genesis" },
      { trait_type: "Plate Spec", value: "Genesis Aura" },
      { trait_type: "Realized Tier", value: "Rewarded" },
    ],
    isGenesis: true,
    isSample: true,
  },
  {
    tokenId: ethers.BigNumber.from(3),
    positionId: ethers.BigNumber.from(3),
    owner: "0x0000000000000000000000000000000000000000",
    account: "0x0000000000000000000000000000000000000000",
    amount: ethers.utils.parseEther("10000"),
    createdEpoch: 33000,
    unlockEpoch: 68040,
    weight: ethers.utils.parseEther("40000"),
    claimableEth: ethers.utils.parseEther("0.2450"),
    claimableNara: ethers.utils.parseEther("145.00"),
    tokenUri: "",
    name: "Position #000003 / Apex Monolith",
    description: "10,000 NARA 365-Day Lock (Full Luminous Bloom)",
    imageSvg: "",
    attributes: [
      { trait_type: "Core", value: "Apex" },
      { trait_type: "Plate Spec", value: "Golden Sigil" },
      { trait_type: "Realized Tier", value: "Apex Bloom" },
    ],
    isEternal: true,
    isSample: true,
  },
];

export interface AlloyInfo {
  name: string;
  tier: "damascus" | "gold" | "obsidian" | "emerald" | "slate";
  badgeLabel: string;
  colorClass: string;
  borderClass: string;
  bgClass: string;
  glowClass: string;
  accentColorHex: string;
  icon: string;
}

export function getAlloyInfo(alloyNameStr?: string): AlloyInfo {
  const str = (alloyNameStr || "").toLowerCase();
  if (str.includes("gold") || str.includes("24k") || str.includes("gilded")) {
    return {
      name: "24K Gilded Gold",
      tier: "gold",
      badgeLabel: "👑 #1 APEX GRAIL",
      colorClass: "text-amber-300",
      borderClass: "border-amber-400/60",
      bgClass: "bg-amber-950/70",
      glowClass: "shadow-[0_0_30px_rgba(245,158,11,0.5)]",
      accentColorHex: "#FFD54F",
      icon: "👑",
    };
  }
  if (str.includes("damascus") || str.includes("meteorite")) {
    return {
      name: "Forged Damascus Meteorite",
      tier: "damascus",
      badgeLabel: "🌌 #2 LEGENDARY",
      colorClass: "text-cyan-300",
      borderClass: "border-cyan-400/60",
      bgClass: "bg-cyan-950/70",
      glowClass: "shadow-[0_0_20px_rgba(56,189,248,0.4)]",
      accentColorHex: "#38BDF8",
      icon: "🌌",
    };
  }
  if (str.includes("obsidian") || str.includes("void") || str.includes("stealth") || str.includes("amethyst") || str.includes("purple")) {
    return {
      name: "Obsidian Void",
      tier: "obsidian",
      badgeLabel: "🔮 #3 RARE",
      colorClass: "text-purple-300",
      borderClass: "border-purple-400/60",
      bgClass: "bg-purple-950/70",
      glowClass: "shadow-[0_0_20px_rgba(168,85,247,0.4)]",
      accentColorHex: "#C084FC",
      icon: "🔮",
    };
  }
  if (str.includes("emerald") || str.includes("cybernetic")) {
    return {
      name: "Cybernetic Emerald",
      tier: "emerald",
      badgeLabel: "🟢 #4 UNCOMMON",
      colorClass: "text-emerald-300",
      borderClass: "border-emerald-500/50",
      bgClass: "bg-emerald-950/70",
      glowClass: "shadow-[0_0_15px_rgba(16,185,129,0.3)]",
      accentColorHex: "#34D399",
      icon: "🟢",
    };
  }
  return {
    name: "Titanium Slate",
    tier: "slate",
    badgeLabel: "🪙 #5 COMMON",
    colorClass: "text-slate-300",
    borderClass: "border-slate-500/40",
    bgClass: "bg-slate-900/70",
    glowClass: "shadow-none",
    accentColorHex: "#94A3B8",
    icon: "🪙",
  };
}

export function extractAlloyFromItem(item: PositionNftItem): AlloyInfo {
  const alloyAttr = item.attributes?.find(
    (a) => a.trait_type === "Chassis Alloy"
  );
  return getAlloyInfo(alloyAttr ? String(alloyAttr.value) : "");
}

export interface PullOdds {
  gold: number;     // percentage, e.g. 4.5 (Apex #1)
  damascus: number; // percentage, e.g. 10.5 (Legendary #2)
  obsidian: number; // percentage, e.g. 22.0 (Rare #3)
  emerald: number;  // percentage, e.g. 35.0 (Uncommon #4)
  slate: number;    // percentage, e.g. 28.0 (Common #5)
  luckBonus: number; // 0 to 350
  isWhale: boolean; // >= 5000 NARA
}

export function calculatePullOdds(durationEpochs: number, amountNaraWhole: number): PullOdds {
  const EPOCHS_PER_YEAR = 35040;
  const luck = Math.floor((Math.min(durationEpochs, EPOCHS_PER_YEAR) * 350) / EPOCHS_PER_YEAR);
  const luckRatio = luck / 350;
  const isWhale = amountNaraWhole >= 5000;

  // Calibrated odds pyramid ensuring natural distribution (Tokens #48+):
  // 24K Gilded Gold (Apex Grail): 1.0% base, +3.5% from max luck, +2.0% from whale (max 6.5%)
  const gold = Number((1.0 + (luckRatio * 3.5) + (isWhale ? 2.0 : 0)).toFixed(1));

  // Forged Damascus Meteorite (Legendary): 4.0% base, +6.5% from max luck, +4.0% from whale (max 14.5%)
  const damascus = Number((4.0 + (luckRatio * 6.5) + (isWhale ? 4.0 : 0)).toFixed(1));

  // Obsidian Void (Rare): 15.0% base, +7.0% from max luck (max 22.0%)
  const obsidian = Number((15.0 + (luckRatio * 7.0)).toFixed(1));

  // Cybernetic Emerald (Uncommon): 30.0% base, +5.0% from max luck (whale base 28.0%, max 33.0%)
  const emeraldBase = isWhale ? 28.0 : 30.0;
  const emerald = Number((emeraldBase + (luckRatio * 5.0)).toFixed(1));

  // Titanium Slate (Common): absorbs remainder, scaling down from 50.0% to 24.0% - 28.0%
  const slate = Number((100.0 - (gold + damascus + obsidian + emerald)).toFixed(1));

  return {
    gold,
    damascus,
    obsidian,
    emerald,
    slate,
    luckBonus: luck,
    isWhale,
  };
}
