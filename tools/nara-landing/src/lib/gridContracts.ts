/**
 * Single-source live Base pins for the Sovereign Grid landing.
 * Founder pin set — never use legacy 0xE444 / 0x6225; never rebind NFT to 0xCcBD.
 */
import { ethers } from "ethers";

export const BASE_CHAIN_ID = 8453 as const;

export const DEFAULT_BASE_RPC = "https://mainnet.base.org";

export const BASE_RPC_URLS: string[] = [
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
];

/** Live Base contract pins (authoritative for this landing). */
export const GRID_ADDRESSES = {
  naraToken: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
  engine: "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC",
  positionNft: "0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b",
  fleetDeckLens: "0x4B097067106623185aE32Cd9c2463Bb4143Fb516",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
} as const;

export type DurationHorizon = {
  label: string;
  epochs: number;
  /** Participation weight multiplier label — surface only via (i) disclosure. */
  multiplier: string;
  title?: string;
};

/** Five equal-weight duration horizons (15-minute epochs). */
export const DURATION_HORIZONS: DurationHorizon[] = [
  { label: "1 Day", epochs: 96, multiplier: "1.00X", title: "96 Epochs" },
  { label: "30 Days", epochs: 2880, multiplier: "1.06X", title: "2,880 Epochs" },
  { label: "90 Days", epochs: 8640, multiplier: "1.28X", title: "8,640 Epochs" },
  { label: "180 Days", epochs: 17280, multiplier: "1.85X", title: "17,280 Epochs" },
  { label: "365 Days", epochs: 35040, multiplier: "4.00X", title: "35,040 Epochs" },
];

export type PositionNftItem = {
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
  claimableUsdc: ethers.BigNumber;
  tokenUri: string;
  name: string;
  description: string;
  imageSvg: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
  isSample?: boolean;
};

export type FleetDeckSummary = {
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
};

export type AlloyInfo = {
  tier: "gold" | "damascus" | "obsidian" | "emerald" | "slate";
  name: string;
  badgeLabel: string;
  icon: string;
  accentColorHex: string;
  bgClass: string;
  borderClass: string;
  colorClass: string;
  glowClass: string;
};

export type PullOdds = {
  luckBonus: number;
  isWhale: boolean;
  gold: number;
  damascus: number;
  obsidian: number;
  emerald: number;
  slate: number;
};

const EPOCHS_PER_YEAR = 35040;
const WHALE_THRESHOLD = 5000;

/**
 * Approximate chassis-alloy pull odds for UI preview.
 * Documented endpoints: baseline Gold 1.0%; Apex (365d + whale) Gold 6.5% / Damascus 14.5%.
 */
export function calculatePullOdds(epochs: number, amountWhole: number): PullOdds {
  const clampedEpochs = Math.max(0, Math.min(EPOCHS_PER_YEAR, Math.floor(epochs || 0)));
  const luckBonus = Math.round((clampedEpochs / EPOCHS_PER_YEAR) * 350);
  const luckFactor = luckBonus / 350;
  const isWhale = (amountWhole || 0) >= WHALE_THRESHOLD;

  let gold = 1.0 + luckFactor * 3.5;
  let damascus = 4.0 + luckFactor * 6.5;
  let obsidian = 12.0 + luckFactor * 10.0;
  let emerald = 25.0 + luckFactor * 8.0;

  if (isWhale) {
    gold += 2.0;
    damascus += 4.0;
  }

  gold = Math.min(gold, 6.5);
  damascus = Math.min(damascus, 14.5);

  let slate = 100 - gold - damascus - obsidian - emerald;
  if (slate < 0) {
    const overflow = -slate;
    emerald = Math.max(0, emerald - overflow);
    slate = Math.max(0, 100 - gold - damascus - obsidian - emerald);
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    luckBonus,
    isWhale,
    gold: round1(gold),
    damascus: round1(damascus),
    obsidian: round1(obsidian),
    emerald: round1(emerald),
    slate: round1(slate),
  };
}

const ALLOY_TABLE: Record<AlloyInfo["tier"], Omit<AlloyInfo, "tier">> = {
  gold: {
    name: "24K Gilded Gold",
    badgeLabel: "Apex",
    icon: "👑",
    accentColorHex: "#F59E0B",
    bgClass: "bg-amber-950/50",
    borderClass: "border-amber-400/40",
    colorClass: "text-amber-300",
    glowClass: "shadow-[0_0_10px_rgba(245,158,11,0.25)]",
  },
  damascus: {
    name: "Forged Damascus Meteorite",
    badgeLabel: "Legendary",
    icon: "🌌",
    accentColorHex: "#22D3EE",
    bgClass: "bg-cyan-950/50",
    borderClass: "border-cyan-400/40",
    colorClass: "text-cyan-300",
    glowClass: "shadow-[0_0_10px_rgba(34,211,238,0.2)]",
  },
  obsidian: {
    name: "Obsidian Void",
    badgeLabel: "Rare",
    icon: "🔮",
    accentColorHex: "#A855F7",
    bgClass: "bg-purple-950/40",
    borderClass: "border-purple-500/30",
    colorClass: "text-purple-300",
    glowClass: "",
  },
  emerald: {
    name: "Cybernetic Emerald",
    badgeLabel: "Uncommon",
    icon: "🟢",
    accentColorHex: "#10B981",
    bgClass: "bg-emerald-950/40",
    borderClass: "border-emerald-500/30",
    colorClass: "text-emerald-300",
    glowClass: "",
  },
  slate: {
    name: "Titanium Slate",
    badgeLabel: "Common",
    icon: "🪙",
    accentColorHex: "#94A3B8",
    bgClass: "bg-slate-900/70",
    borderClass: "border-white/10",
    colorClass: "text-slate-300",
    glowClass: "",
  },
};

function detectAlloyTier(raw: string): AlloyInfo["tier"] {
  const s = raw.toLowerCase();
  if (s.includes("gold") || s.includes("24k") || s.includes("gilded")) return "gold";
  if (s.includes("damascus") || s.includes("meteor")) return "damascus";
  if (s.includes("obsidian") || s.includes("amethyst") || s.includes("void")) return "obsidian";
  if (s.includes("emerald") || s.includes("cyber")) return "emerald";
  return "slate";
}

export function extractAlloyFromItem(item: {
  name?: string;
  description?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
}): AlloyInfo {
  const fromAttr = item.attributes?.find((a) => {
    const t = (a.trait_type || "").toLowerCase();
    return t.includes("alloy") || t.includes("chassis") || t.includes("plate");
  });
  const raw =
    (fromAttr?.value != null ? String(fromAttr.value) : "") ||
    item.name ||
    item.description ||
    "";
  const tier = detectAlloyTier(raw);
  return { tier, ...ALLOY_TABLE[tier] };
}


function decodeBase64(payload: string): string {
  if (typeof atob === "function") return atob(payload);
  // Fallback for non-DOM environments during typecheck
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (globalThis as any).Buffer;
    if (B) return B.from(payload, "base64").toString("utf8");
  } catch {}
  return payload;
}

export function parseTokenUri(uri: string): {
  name?: string;
  description?: string;
  imageSvg?: string;
  attributes?: Array<{ trait_type: string; value: string | number }>;
} {
  if (!uri) return {};
  try {
    let jsonStr = uri;
    if (uri.startsWith("data:application/json")) {
      const comma = uri.indexOf(",");
      const payload = comma >= 0 ? uri.slice(comma + 1) : uri;
      if (uri.includes(";base64,")) {
        jsonStr = decodeBase64(payload);
      } else {
        jsonStr = decodeURIComponent(payload);
      }
    }
    const meta = JSON.parse(jsonStr);
    let imageSvg = "";
    const image: string = meta.image || meta.image_data || "";
    if (typeof image === "string") {
      if (image.startsWith("data:image/svg+xml")) {
        const comma = image.indexOf(",");
        const payload = comma >= 0 ? image.slice(comma + 1) : image;
        imageSvg = image.includes(";base64,")
          ? decodeBase64(payload)
          : decodeURIComponent(payload);
      } else if (image.includes("<svg")) {
        imageSvg = image;
      }
    }
    return {
      name: meta.name,
      description: meta.description,
      imageSvg,
      attributes: Array.isArray(meta.attributes) ? meta.attributes : [],
    };
  } catch {
    return {};
  }
}

export const SAMPLE_POSITIONS: PositionNftItem[] = [
  {
    tokenId: ethers.BigNumber.from(101),
    positionId: ethers.BigNumber.from(101),
    owner: ethers.constants.AddressZero,
    account: ethers.constants.AddressZero,
    amount: ethers.utils.parseEther("2500"),
    createdEpoch: 3000,
    unlockEpoch: 3000 + 8640,
    weight: ethers.utils.parseEther("3200"),
    claimableEth: ethers.utils.parseEther("0.0042"),
    claimableNara: ethers.utils.parseEther("12.5"),
    claimableUsdc: ethers.BigNumber.from(0),
    tokenUri: "",
    name: "Demo Position #101",
    description: "Simulator preview — connect wallet for live cells",
    imageSvg: "",
    attributes: [{ trait_type: "Chassis Alloy", value: "Cybernetic Emerald" }],
    isSample: true,
  },
  {
    tokenId: ethers.BigNumber.from(102),
    positionId: ethers.BigNumber.from(102),
    owner: ethers.constants.AddressZero,
    account: ethers.constants.AddressZero,
    amount: ethers.utils.parseEther("750"),
    createdEpoch: 3050,
    unlockEpoch: 3050 + 2880,
    weight: ethers.utils.parseEther("795"),
    claimableEth: ethers.utils.parseEther("0.0011"),
    claimableNara: ethers.utils.parseEther("3.2"),
    claimableUsdc: ethers.BigNumber.from(0),
    tokenUri: "",
    name: "Demo Position #102",
    description: "Simulator preview — connect wallet for live cells",
    imageSvg: "",
    attributes: [{ trait_type: "Chassis Alloy", value: "Titanium Slate" }],
    isSample: true,
  },
];

export const engineAbi = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "positionId",
        "type": "uint256"
      }
    ],
    "name": "claimableRewards",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "naraAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "ethAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentEpoch",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lockFeeWei",
    "outputs": [
      {
        "internalType": "uint96",
        "name": "",
        "type": "uint96"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unlockFeeWei",
    "outputs": [
      {
        "internalType": "uint96",
        "name": "",
        "type": "uint96"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "type": "function",
    "name": "epochState",
    "inputs": [],
    "stateMutability": "view",
    "outputs": [
      {
        "type": "tuple",
        "name": "",
        "components": [
          {
            "name": "epoch",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "timestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "circulatingSupply",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "totalLocked",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "activeTotalWeight",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "weightedLockShareWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "stressWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "betaWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "horizon",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "retentionWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "baseEmission",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "emission",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "admittedSupply",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "distributedNara",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "distributedEth",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "treasuryAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "warmupFactorWad",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "bootstrapWeight",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "heartbeat",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ]
  }
] as const;

export const erc20Abi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const positionNftAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "minter",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "positionId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "durationEpochs",
        "type": "uint64"
      }
    ],
    "name": "PositionMinted",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "claimRewards",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "naraAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "ethAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint64",
        "name": "durationEpochs",
        "type": "uint64"
      },
      {
        "internalType": "uint256",
        "name": "minWeight",
        "type": "uint256"
      }
    ],
    "name": "mintAndLockFor",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "positionId",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextTokenId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ownerOf",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "positionIdOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "positionInfo",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "owner",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "createdEpoch",
            "type": "uint64"
          },
          {
            "internalType": "uint32",
            "name": "flags",
            "type": "uint32"
          },
          {
            "internalType": "uint128",
            "name": "amount",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "weight",
            "type": "uint128"
          },
          {
            "internalType": "uint64",
            "name": "activationEpoch",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "unlockEpoch",
            "type": "uint64"
          },
          {
            "internalType": "uint128",
            "name": "tokenWeight",
            "type": "uint128"
          },
          {
            "internalType": "uint256",
            "name": "naraDebtRay",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "ethDebtRay",
            "type": "uint256"
          }
        ],
        "internalType": "struct Position",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "tokenURI",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "unlock",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "unlockTo",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ]
  }
] as const;

export const fleetDeckLensAbi = [
  {
    "type": "function",
    "name": "getFleetDeckSummary",
    "stateMutability": "view",
    "inputs": [
      {
        "name": "user",
        "type": "address"
      },
      {
        "name": "tokenIds",
        "type": "uint256[]"
      }
    ],
    "outputs": [
      {
        "name": "deck",
        "type": "tuple",
        "components": [
          {
            "name": "user",
            "type": "address"
          },
          {
            "name": "totalLockedNara",
            "type": "uint256"
          },
          {
            "name": "totalWeight",
            "type": "uint256"
          },
          {
            "name": "weightedAverageMultiplierWad",
            "type": "uint256"
          },
          {
            "name": "weightedAverageMultiplierBps",
            "type": "uint16"
          },
          {
            "name": "formattedWeightedMultiplier",
            "type": "string"
          },
          {
            "name": "deckSynergyMultiplierWad",
            "type": "uint256"
          },
          {
            "name": "deckSynergyMultiplierBps",
            "type": "uint16"
          },
          {
            "name": "formattedDeckSynergyMultiplier",
            "type": "string"
          },
          {
            "name": "totalEffectiveMultiplierWad",
            "type": "uint256"
          },
          {
            "name": "totalEffectiveMultiplierBps",
            "type": "uint32"
          },
          {
            "name": "formattedTotalEffectiveMultiplier",
            "type": "string"
          },
          {
            "name": "effectiveTotalWeight",
            "type": "uint256"
          },
          {
            "name": "synergy",
            "type": "tuple",
            "components": [
              {
                "name": "synergyTier",
                "type": "uint8"
              },
              {
                "name": "synergyTierName",
                "type": "string"
              },
              {
                "name": "formationBonusBps",
                "type": "uint16"
              },
              {
                "name": "genesisAuraBonusBps",
                "type": "uint16"
              },
              {
                "name": "synergyBonusBps",
                "type": "uint16"
              },
              {
                "name": "totalSynergyBonusBps",
                "type": "uint16"
              },
              {
                "name": "synergyMultiplierWad",
                "type": "uint256"
              },
              {
                "name": "formattedSynergyMultiplier",
                "type": "string"
              },
              {
                "name": "hasGenesisAura",
                "type": "bool"
              },
              {
                "name": "activeSlotsCount",
                "type": "uint256"
              }
            ]
          },
          {
            "name": "aggregateClaimableNara",
            "type": "uint256"
          },
          {
            "name": "aggregateClaimableEth",
            "type": "uint256"
          },
          {
            "name": "aggregateClaimableGenesisEth",
            "type": "uint256"
          },
          {
            "name": "aggregateClaimableGenesisToken",
            "type": "uint256"
          },
          {
            "name": "positions",
            "type": "tuple[]",
            "components": [
              {
                "name": "tokenId",
                "type": "uint256"
              },
              {
                "name": "positionId",
                "type": "uint256"
              },
              {
                "name": "amount",
                "type": "uint128"
              },
              {
                "name": "weight",
                "type": "uint128"
              },
              {
                "name": "multiplierWad",
                "type": "uint256"
              },
              {
                "name": "multiplierBps",
                "type": "uint16"
              },
              {
                "name": "formattedMultiplier",
                "type": "string"
              },
              {
                "name": "createdEpoch",
                "type": "uint64"
              },
              {
                "name": "activationEpoch",
                "type": "uint64"
              },
              {
                "name": "unlockEpoch",
                "type": "uint64"
              },
              {
                "name": "claimableNara",
                "type": "uint256"
              },
              {
                "name": "claimableEth",
                "type": "uint256"
              },
              {
                "name": "claimableGenesisEth",
                "type": "uint256"
              },
              {
                "name": "claimableGenesisToken",
                "type": "uint256"
              },
              {
                "name": "isGenesis",
                "type": "bool"
              },
              {
                "name": "isEternal",
                "type": "bool"
              },
              {
                "name": "isActive",
                "type": "bool"
              }
            ]
          }
        ]
      }
    ]
  }
] as const;

export const multicall3Abi = [
  {
    "type": "function",
    "name": "aggregate3",
    "stateMutability": "payable",
    "inputs": [
      {
        "name": "calls",
        "type": "tuple[]",
        "components": [
          {
            "name": "target",
            "type": "address"
          },
          {
            "name": "allowFailure",
            "type": "bool"
          },
          {
            "name": "callData",
            "type": "bytes"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "returnData",
        "type": "tuple[]",
        "components": [
          {
            "name": "success",
            "type": "bool"
          },
          {
            "name": "returnData",
            "type": "bytes"
          }
        ]
      }
    ]
  }
] as const;
