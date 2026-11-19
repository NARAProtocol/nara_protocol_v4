// 365D Anchor Seats (NARAPositionSaleV5) Blueprint Matrix & Hardened Purchase Controller
//
// Reads live Treasury multisig listings on NARAPositionSaleV5 (0x04Ac83045d26259D46400Ce6beb9bBd0641df225)
// via Multicall3 on Base Mainnet (Chain ID 8453). Enforces full BuyerBounds parity with
// NARAPositionSaleV5._checkAcquisition (all 3 reward assets [NARA, ETH, USDC], nextCheckpoint,
// rarityTier, seller identity, sellerNonce, receiptTransferNonce, expectedPriceWei, L2 clock-skew
// deadline, dual-RPC cross-verification, and fail-closed eth_call simulation).

import { BASE_BUILDER_CODE, BASE_CHAIN_ID_HEX, CANONICAL_URL, isTelegramWebView, resolveCryptoSlipCommitUrl } from "./config.js";
import { appendErc8021DataSuffix, trySendCallsWithErc8021 } from "./erc8021.js";
import {
  V4_SWAP_CONSTANTS,
  strip0x,
  isValidAddress,
  abiWordU256,
  abiWordAddr,
  abiWordBool,
  abiRightPadBytes,
  formatUnits,
  formatDisplayNara,
  encodeSlot0ExtsloadCall,
  decodeSlot0UsdPerNara,
} from "./v4SwapEngine.js";
import {
  connectWalletDirect,
  getConnectedWalletProvider,
  getConnectedAccount,
  getConnectedWalletName,
  getDiscoveredWallets,
  onWalletStateChange,
} from "./buyModal.js";

export const ANCHOR_SEAT_CONSTANTS = Object.freeze({
  chainId: 8453,
  treasurySafe: "0xe320C281c86079eA85f2Bc67864E873A61D551E3",
  epochEngine: "0xd93FbEbFb33FAc9288125074625D4750573B1a53",
  positionSale: "0x04Ac83045d26259D46400Ce6beb9bBd0641df225",
  positionReceipt: "0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA",
  principalLedger: "0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2",
  rewardLedger: "0xC72671D9438388638547444524F6542b650C9264",
  rewardLens: "0x26b481f1545D9912D39693D7F8E589F82835e03d",
  rewardIngress: "0x44130CC47b886D8488041F5eaE271477D1aFA909",
  chainlinkEthUsd: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
  multicall3: V4_SWAP_CONSTANTS.multicall3,
  cohort1UnlockTimestamp: 1794765600,
  cohort1FirstTokenId: 16,
  cohort1LastTokenId: 44,
  waveNumber: 1,
  nextWaveStepPct: 15,
  saleFeeBps: 500n,
  bpsDenominator: 10_000n,
  epochsPerMonth: 2880n, // 30 days * 96 (900s pulses/day)
});

export const WAVE_1_TIERS = Object.freeze([
  { key: "sprint",  count: 6, label: "SPRINT 90D",   shortBtn: "1.61 ETH", nara: "1.00", durationDays: 90,  epochs: 8640,  weight: "1.2753", askEth: "1.61", nextWaveEth: "1.85" },
  { key: "starter", count: 6, label: "STARTER 180D", shortBtn: "1.84 ETH", nara: "1.20", durationDays: 180, epochs: 17280, weight: "2.2255", askEth: "1.84", nextWaveEth: "2.12" },
  { key: "core",    count: 6, label: "CORE 365D",    shortBtn: "2.18 ETH", nara: "1.50", durationDays: 365, epochs: 35040, weight: "6.00",   askEth: "2.18", nextWaveEth: "2.51" },
  { key: "plus",    count: 5, label: "PLUS 365D",    shortBtn: "2.78 ETH", nara: "2.00", durationDays: 365, epochs: 35040, weight: "8.00",   askEth: "2.78", nextWaveEth: "3.20" },
  { key: "builder", count: 4, label: "BUILDER 365D", shortBtn: "4.05 ETH", nara: "3.00", durationDays: 365, epochs: 35040, weight: "12.00",  askEth: "4.05", nextWaveEth: "4.66" },
  { key: "prime",   count: 2, label: "PRIME 365D",   shortBtn: "5.90 ETH", nara: "4.50", durationDays: 365, epochs: 35040, weight: "18.00",  askEth: "5.90", nextWaveEth: "6.79" },
]);

// Wave 1 29-Receipt 6-Tier Hardened Monotonic Schedule (#16..#44 = 53.20 NARA / 75.68 ETH; live listings always enforce exact on-chain priceWei)
export const COHORT_1_REFERENCE_SEATS = Object.freeze(
  (() => {
    const out = [];
    let seat = 1;
    let tokenId = ANCHOR_SEAT_CONSTANTS.cohort1FirstTokenId;
    for (const t of WAVE_1_TIERS) {
      for (let i = 0; i < t.count; i++) {
        out.push(
          Object.freeze({
            seat: seat++,
            tokenId: tokenId++,
            tierKey: t.key,
            tierCode: t.label,
            nara: t.nara,
            durationDays: t.durationDays,
            epochs: t.epochs,
            weight: t.weight,
            askEth: t.askEth,
            nextWaveEth: t.nextWaveEth,
            tierLabel: `WAVE 1 · ${t.askEth}Ξ`,
          })
        );
      }
    }
    return out;
  })()
);

const PUBLIC_BASE_RPCS = [
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
];

const SEAT_GAS_BUFFER_WEI = 80_000_000_000_000n; // 0.00008 ETH Base L2 gas buffer
const PURCHASE_DEADLINE_WINDOW_SEC = 1200n; // 20-minute execution window

// --- Pure Zero-Dependency ABI Encoders & Decoders ---

export function encodeMintedCountCall() {
  return "0xcf721b15";
}

export function encodeSellerNonceCall(seller) {
  return "0x5022e6ea" + abiWordAddr(seller);
}

export function encodeListingCall(tokenId) {
  return "0x84a184de" + abiWordU256(tokenId);
}

export function encodeOwnerOfCall(tokenId) {
  return "0x6352211e" + abiWordU256(tokenId);
}

export function encodeGetApprovedCall(tokenId) {
  return "0x081812fc" + abiWordU256(tokenId);
}

export function encodeIsApprovedForAllCall(owner, operator) {
  return "0xe985e9c5" + abiWordAddr(owner) + abiWordAddr(operator);
}

export function encodeReceiptTransferNonceCall(tokenId) {
  return "0xc30a656d" + abiWordU256(tokenId);
}

export function encodePositionHeadCall(positionId) {
  return "0x9c82fd33" + abiWordU256(positionId);
}

export function encodeRarityTierCall(positionId, generation) {
  return "0xda6871c8" + abiWordU256(positionId) + abiWordU256(generation);
}

export function encodeRewardStateCall() {
  return "0x582c7928";
}

export function encodeChainlinkLatestRoundCall() {
  return "0xfeaf968c";
}

export function decodeChainlinkUsdPrice(hex, maxStalenessSec = 7200n, nowSec = null) {
  const clean = strip0x(hex);
  if (clean.length < 320) return null;
  const roundId = readWord(clean, 0);
  const answer = readWord(clean, 32);
  const updatedAt = readWord(clean, 96);
  const answeredInRound = readWord(clean, 128);
  if (roundId === 0n || answeredInRound < roundId) return null;
  // Reject negative int256 (two's complement sign bit) or zero
  if (answer === 0n || answer >= 1n << 255n || updatedAt === 0n) return null;
  if (nowSec != null && nowSec > updatedAt && nowSec - updatedAt > maxStalenessSec) return null;
  const usd = Number(answer) / 1e8;
  return Number.isFinite(usd) && usd > 50 && usd < 1_000_000 ? usd : null;
}

export function encodeRewardCreditCall(rewardsAddr, positionId, generation, assetIndex) {
  return (
    "0xa320bd2d" +
    abiWordAddr(rewardsAddr) +
    abiWordU256(positionId) +
    abiWordU256(generation) +
    abiWordU256(assetIndex)
  );
}

export function encodePurchaseCall(tokenId, bounds) {
  const minClaimable = bounds.minClaimable || [0n, 0n, 0n];
  return (
    "0xccfe2a51" +
    abiWordU256(tokenId) +
    abiWordU256(bounds.expectedListingId) +
    abiWordU256(bounds.minPrincipal) +
    abiWordU256(minClaimable[0] ?? 0n) +
    abiWordU256(minClaimable[1] ?? 0n) +
    abiWordU256(minClaimable[2] ?? 0n) +
    abiWordU256(bounds.minRewardCheckpoint ?? 0n) +
    abiWordU256(bounds.deadline) +
    abiWordU256(bounds.minRarityTier ?? 0n)
  );
}

export function encodeMulticall3Aggregate3(calls) {
  const encodedStructs = calls.map((c) => {
    const head =
      abiWordAddr(c.target) +
      abiWordBool(Boolean(c.allowFailure)) +
      abiWordU256(96n);
    const tail = abiRightPadBytes(c.callData);
    return head + tail;
  });
  const count = encodedStructs.length;
  let relOffset = count * 32;
  const elemOffsets = [];
  for (const s of encodedStructs) {
    elemOffsets.push(abiWordU256(relOffset));
    relOffset += s.length / 2;
  }
  return (
    "0x82ad56cb" +
    abiWordU256(32n) +
    abiWordU256(count) +
    elemOffsets.join("") +
    encodedStructs.join("")
  );
}

function readWord(cleanHex, byteOffset) {
  const start = byteOffset * 2;
  const slice = cleanHex.slice(start, start + 64);
  if (slice.length < 64) throw new Error("ABI word out of bounds");
  return BigInt("0x" + slice);
}

function readAddrWord(cleanHex, byteOffset) {
  const start = byteOffset * 2;
  const slice = cleanHex.slice(start, start + 64);
  if (slice.length < 64) throw new Error("ABI address word out of bounds");
  return "0x" + slice.slice(24);
}

export function decodeMulticall3Aggregate3(hex) {
  const clean = strip0x(hex);
  if (clean.length < 128) return [];
  const arrOffset = Number(readWord(clean, 0));
  const count = Number(readWord(clean, arrOffset));
  const elemTableBase = arrOffset + 32;
  const results = [];
  for (let i = 0; i < count; i++) {
    const elemRel = Number(readWord(clean, elemTableBase + i * 32));
    const elemBase = elemTableBase + elemRel;
    const success = readWord(clean, elemBase) !== 0n;
    const bytesRel = Number(readWord(clean, elemBase + 32));
    const bytesBase = elemBase + bytesRel;
    const byteLen = Number(readWord(clean, bytesBase));
    const dataStartHex = (bytesBase + 32) * 2;
    const returnData = "0x" + clean.slice(dataStartHex, dataStartHex + byteLen * 2);
    results.push({ success, returnData });
  }
  return results;
}

export function decodeListingResult(hex) {
  const clean = strip0x(hex);
  if (clean.length < 640) return null;
  return {
    listingId: readWord(clean, 0),
    seller: readAddrWord(clean, 32),
    tokenId: readWord(clean, 64),
    transferNonce: readWord(clean, 96),
    positionId: readWord(clean, 128),
    generation: readWord(clean, 160),
    termsHash: "0x" + clean.slice(192 * 2, 224 * 2),
    price: readWord(clean, 224),
    expiry: readWord(clean, 256),
    sellerNonce: readWord(clean, 288),
  };
}

export function decodePositionHeadResult(hex) {
  const clean = strip0x(hex);
  if (clean.length < 1024) return null;
  return {
    generationOwner: readAddrWord(clean, 0),
    generation: readWord(clean, 32),
    createdEpoch: readWord(clean, 64),
    activation: readWord(clean, 96),
    maturity: readWord(clean, 128),
    effectiveEnd: readWord(clean, 160),
    duration: Number(readWord(clean, 192)),
    principal: readWord(clean, 224),
    modelWeight: readWord(clean, 256),
    rewardWeight: readWord(clean, 288),
    earlyExitEnabled: readWord(clean, 320) !== 0n,
    earlyExitBps: Number(readWord(clean, 352)),
    penalty: readWord(clean, 384),
    penaltyCapacityReserved: readWord(clean, 416),
    withdrawn: readWord(clean, 448) !== 0n,
    termsHash: "0x" + clean.slice(480 * 2, 512 * 2),
  };
}

export function decodeRewardCreditClaimable(hex) {
  const clean = strip0x(hex);
  if (clean.length < 704) return 0n;
  // RewardCredit word [4] (offset 128 bytes) is uint256 claimable in native asset units
  return readWord(clean, 128);
}

export function decodeRewardCreditFull(hex) {
  const clean = strip0x(hex);
  if (clean.length < 704) return null;
  const pendingFrom = readWord(clean, 256);
  const pendingThrough = readWord(clean, 288);
  return {
    accruedThrough: readWord(clean, 64),
    claimable: readWord(clean, 128),
    cumulativePaid: readWord(clean, 192),
    hasUnsettledEpochs: readWord(clean, 224) !== 0n,
    pendingFrom,
    pendingThrough,
    unsettledEpochs: pendingThrough > pendingFrom ? pendingThrough - pendingFrom : 0n,
    openEpochEligible: readWord(clean, 320) !== 0n,
  };
}

export function encodeEngineClockCall() {
  return "0x91ddadf4";
}

export function decodeEngineClockResult(hex) {
  const clean = strip0x(hex);
  if (clean.length < 384) return null;
  return {
    started: readWord(clean, 0) !== 0n,
    genesisTimestamp: readWord(clean, 32),
    currentWallEpoch: readWord(clean, 64),
    nextEpochToClose: readWord(clean, 96),
    backlog: readWord(clean, 128),
    nextBoundaryTimestamp: readWord(clean, 160),
  };
}

export function decodeRewardStateNextCheckpoint(hex) {
  const clean = strip0x(hex);
  if (clean.length < 448) return 0n;
  // RewardLedgerStateV5 word [2] (offset 64 bytes) is uint64 nextCheckpoint
  return readWord(clean, 64);
}

export function decodeRarityTierResult(hex) {
  const clean = strip0x(hex);
  if (clean.length < 64) return 0n;
  return readWord(clean, 0) & 0xffn;
}

export function encodePrincipalAccountingCall() {
  return "0xccad7a2f";
}

export function decodePrincipalAccountingResult(hex) {
  const clean = strip0x(hex);
  if (clean.length < 512) return null;
  return {
    initialized: readWord(clean, 0) !== 0n,
    openedEpoch: readWord(clean, 32),
    principalInventory: readWord(clean, 64),
    principalSnapshot: readWord(clean, 96),
    activeModelWeight: readWord(clean, 128),
    activeRewardWeight: readWord(clean, 160),
    positionCount: readWord(clean, 224),
  };
}

export function encodeEmissionConfigCall() {
  return "0xec017bd2";
}

export function decodeEmissionConfigResult(hex) {
  const clean = strip0x(hex);
  if (clean.length < 832) return null;
  return {
    eMax: readWord(clean, 0),
    beta0Wad: readWord(clean, 32),
    mWad: readWord(clean, 64),
    aWad: readWord(clean, 96),
    bWad: readWord(clean, 128),
    cWad: readWord(clean, 160),
    dWad: readWord(clean, 192),
    dripSplitWad: readWord(clean, 224),
    growthFactorWad: readWord(clean, 256),
    minBaseEmission: readWord(clean, 288),
    maxBaseEmission: readWord(clean, 320),
    warmupRateWad: readWord(clean, 352),
    bootstrapDecayWad: readWord(clean, 384),
  };
}

export function encodeEmissionStateCall() {
  return "0xdc32980c";
}

export function decodeEmissionStateResult(hex) {
  const clean = strip0x(hex);
  if (clean.length < 256) return null;
  return {
    baseEmission: readWord(clean, 0),
    warmupFactorWad: readWord(clean, 32),
    stressWad: readWord(clean, 64),
    bootstrapWeight: readWord(clean, 96),
  };
}

export function encodeFundingStateCall() {
  return "0xb25cdccf";
}

export function decodeFundingStateEligibleReserve(hex) {
  const clean = strip0x(hex);
  if (clean.length < 512) return null;
  return readWord(clean, 32);
}

export function decodeRewardStateFull(hex) {
  const clean = strip0x(hex);
  if (clean.length < 448) return null;
  return {
    initialized: readWord(clean, 0) !== 0n,
    openedEpoch: readWord(clean, 32),
    nextCheckpoint: readWord(clean, 64),
    protectedNaraSnapshot: readWord(clean, 96),
    naraAdmissionHeadroom: readWord(clean, 160),
  };
}

const WAD = 1_000_000_000_000_000_000n;
const FIXED_SUPPLY_WEI = 1_000_000n * WAD;
const RELEASE_HORIZON_EPOCHS = 140_160n;
const MIN_SAFE_EXPIRY_BUFFER_SEC = 30n;

/**
 * Exact 0-wei BigInt port of NARAPrincipalPreviewV5 V4Quadratic multiplier:
 * D(d) = 1e18 + floor(0.5e18 * r / 1e18) + floor(2.5e18 * floor(r^2 / 1e18) / 1e18), r = floor(d * 1e18 / 35040)
 */
export function computeV4QuadraticMultiplierWei(durationEpochs) {
  const d = BigInt(durationEpochs);
  const ratio = (d * WAD) / 35_040n;
  return WAD + ((WAD / 2n) * ratio) / WAD + (((5n * WAD) / 2n) * ((ratio * ratio) / WAD)) / WAD;
}

export function computeV4QuadraticWeightWei(principalWei, durationEpochs) {
  return (BigInt(principalWei) * computeV4QuadraticMultiplierWei(durationEpochs)) / WAD;
}

/**
 * Classifies any on-chain receipt into its canonical Wave 1 tier by (principalWei, durationEpochs),
 * protecting /vault against tokenId shifts if an external user mints before/between Safe batches.
 */
export function classifyWave1Tier(principalWei, durationEpochs) {
  const p = BigInt(principalWei ?? 0n);
  const d = Number(durationEpochs ?? 0);
  for (const t of WAVE_1_TIERS) {
    const tWei = parseDecimalToWei18(t.nara);
    if (p === tWei && d === t.epochs) {
      return {
        matchedWaveTier: true,
        tierKey: t.key,
        tierCode: t.label,
        askEth: t.askEth,
        nextWaveEth: t.nextWaveEth,
      };
    }
  }
  if (d > 0 && d <= 10_000) {
    return { matchedWaveTier: false, tierKey: "sprint", tierCode: "SPRINT 90D", askEth: "1.61", nextWaveEth: "1.85" };
  }
  if (d > 10_000 && d <= 22_000) {
    return { matchedWaveTier: false, tierKey: "starter", tierCode: "STARTER 180D", askEth: "1.84", nextWaveEth: "2.12" };
  }
  if (p >= 4n * WAD) {
    return { matchedWaveTier: false, tierKey: "prime", tierCode: "PRIME 365D", askEth: "5.90", nextWaveEth: "6.79" };
  }
  if (p >= 2_500_000_000_000_000_000n) {
    return { matchedWaveTier: false, tierKey: "builder", tierCode: "BUILDER 365D", askEth: "4.05", nextWaveEth: "4.66" };
  }
  if (p >= 1_800_000_000_000_000_000n) {
    return { matchedWaveTier: false, tierKey: "plus", tierCode: "PLUS 365D", askEth: "2.78", nextWaveEth: "3.20" };
  }
  return { matchedWaveTier: false, tierKey: "core", tierCode: "CORE 365D", askEth: "2.18", nextWaveEth: "2.51" };
}

function boundBigInt(val, lo, hi) {
  if (val < lo) return lo;
  if (val > hi) return hi;
  return val;
}

/**
 * Exact BigInt port of NARAEmissionModelV5.calculateNext + NARAEpochEngineV5._closeEpoch reserve cap.
 * Returns exact NARA delivered per 900s pulse in wei.
 */
export function computeLiveNaraPerEpochWei({
  config,
  emissionState,
  principalSnapshot,
  protectedNaraSnapshot,
  eligibleReserve,
  naraAdmissionHeadroom,
  activeModelWeight,
  activeRewardWeight,
}) {
  if (!config || !emissionState || activeRewardWeight <= 0n || activeModelWeight <= 0n) return 0n;
  const used = principalSnapshot + protectedNaraSnapshot + eligibleReserve;
  const modelFloat = FIXED_SUPPLY_WEI > used ? FIXED_SUPPLY_WEI - used : 0n;

  const warmup =
    emissionState.warmupFactorWad +
    (config.warmupRateWad * (WAD - emissionState.warmupFactorWad)) / WAD;
  const bootstrap = (emissionState.bootstrapWeight * config.bootstrapDecayWad) / WAD;
  const denom = modelFloat + activeModelWeight + bootstrap;
  const weightedLockShare = denom === 0n ? 0n : (activeModelWeight * WAD) / denom;

  let baseEmission =
    emissionState.baseEmission === 0n
      ? config.minBaseEmission
      : (emissionState.baseEmission * config.growthFactorWad) / WAD;
  baseEmission = boundBigInt(baseEmission, config.minBaseEmission, config.maxBaseEmission);

  const incentive = WAD + (config.aWad * weightedLockShare) / WAD;
  const penalty = (config.bWad * emissionState.stressWad) / WAD;
  const emissionFactor = incentive > penalty ? incentive - penalty : 0n;
  const emission = boundBigInt((baseEmission * emissionFactor) / WAD, 0n, config.maxBaseEmission);

  const beta = config.beta0Wad + (config.mWad * emissionState.stressWad) / WAD;
  const horizon = beta === 0n ? 0n : (config.eMax * WAD) / beta;

  let retention = 0n;
  if (horizon > 0n && modelFloat < horizon) {
    retention = WAD - (modelFloat * WAD) / horizon;
  }

  const admitted = (emission * retention) / WAD;
  let dripTarget = (admitted * config.dripSplitWad) / WAD;
  dripTarget = (dripTarget * warmup) / WAD;

  const target = (dripTarget * activeModelWeight) / (activeModelWeight + bootstrap);
  const referenceRelease =
    RELEASE_HORIZON_EPOCHS * ((config.maxBaseEmission * config.dripSplitWad) / WAD);
  let scaled =
    referenceRelease > 0n && eligibleReserve < referenceRelease
      ? (target * eligibleReserve) / referenceRelease
      : target;
  const tail = eligibleReserve / RELEASE_HORIZON_EPOCHS;
  if (scaled > tail) scaled = tail;
  const maximum = naraAdmissionHeadroom < eligibleReserve ? naraAdmissionHeadroom : eligibleReserve;
  return scaled < maximum ? scaled : maximum;
}

/**
 * Computes current 30-day (2,880 pulses) NARA flow in wei for a position of `cardWeightWei`.
 * When `alreadyActiveOnGrid` is false (staged Wave 1 card), includes `cardWeightWei` in the denominator.
 */
export function computeLiveMonthlyNaraWei(
  cardWeightWei,
  naraPerEpochWei,
  activeModelWeightWei,
  alreadyActiveOnGrid = false
) {
  if (!cardWeightWei || cardWeightWei <= 0n || !naraPerEpochWei || naraPerEpochWei <= 0n) return 0n;
  const denom = alreadyActiveOnGrid
    ? activeModelWeightWei
    : activeModelWeightWei + cardWeightWei;
  if (!denom || denom <= 0n) return 0n;
  return (naraPerEpochWei * ANCHOR_SEAT_CONSTANTS.epochsPerMonth * cardWeightWei) / denom;
}

/**
 * Pure verification & atomic BuyerBounds builder matching NARAPositionSaleV5._checkAcquisition.
 * Fails closed on any seller-identity, price, nonce, approval, backing, or expiry mismatch.
 */
export function verifyAndBuildSeatBounds({
  tokenId,
  expectedPriceWei = null,
  freshOffer,
  quorumOffer = null,
  ownerAddr = "",
  receiptTransferNonce = null,
  currentSafeSellerNonce = 0n,
  isApproved = false,
  pos = null,
  rarityTier = 0n,
  claimableTriplet = [0n, 0n, 0n],
  nextCheckpoint = 0n,
  wallNowSec = 0n,
  chainNowSec = 0n,
  buyer = "",
}) {
  const safeLower = ANCHOR_SEAT_CONSTANTS.treasurySafe.toLowerCase();

  if (!freshOffer || freshOffer.listingId === 0n) {
    throw new Error(`Seat #${tokenId} was just claimed or is no longer active.`);
  }
  if (freshOffer.seller.toLowerCase() !== safeLower) {
    throw new Error(
      `Security guard blocked Seat #${tokenId}: listing seller does not match canonical Treasury multisig.`
    );
  }
  if (!ownerAddr || ownerAddr.toLowerCase() !== safeLower) {
    throw new Error(`Seat #${tokenId} is no longer held by canonical Treasury multisig.`);
  }
  if (quorumOffer) {
    if (
      quorumOffer.listingId !== freshOffer.listingId ||
      quorumOffer.seller.toLowerCase() !== safeLower ||
      quorumOffer.price !== freshOffer.price
    ) {
      throw new Error(
        `Cross-RPC verification mismatch on Seat #${tokenId} — refreshed live state before signing.`
      );
    }
  }
  if (freshOffer.sellerNonce !== currentSafeSellerNonce) {
    throw new Error(`Seat #${tokenId} listing was invalidated by sellerNonce update.`);
  }
  if (receiptTransferNonce != null && receiptTransferNonce !== freshOffer.transferNonce) {
    throw new Error(`Seat #${tokenId} transferNonce changed since listing.`);
  }
  if (!isApproved) {
    throw new Error(`Seat #${tokenId} sale approval is currently paused.`);
  }
  if (expectedPriceWei != null && freshOffer.price !== expectedPriceWei) {
    throw new Error(
      `Seat #${tokenId} price changed from ${formatEthExact(expectedPriceWei)} ETH to ${formatEthExact(freshOffer.price)} ETH. Review updated terms before signing.`
    );
  }
  if (buyer && buyer.toLowerCase() === safeLower) {
    throw new Error("Seller wallet cannot self-purchase its own Anchor Seat listing.");
  }
  if (
    !pos ||
    pos.withdrawn ||
    pos.principal === 0n ||
    pos.effectiveEnd !== pos.maturity ||
    pos.generation !== freshOffer.generation ||
    pos.generationOwner.toLowerCase() !== safeLower ||
    pos.termsHash.toLowerCase() !== freshOffer.termsHash.toLowerCase()
  ) {
    throw new Error(`Seat #${tokenId} principal backing is no longer active.`);
  }

  const effectiveNowSec = wallNowSec > chainNowSec ? wallNowSec : chainNowSec;
  if (freshOffer.expiry <= effectiveNowSec) {
    throw new Error(`Seat #${tokenId} listing has expired on Base.`);
  }
  if (freshOffer.expiry <= effectiveNowSec + MIN_SAFE_EXPIRY_BUFFER_SEC) {
    throw new Error(`Seat #${tokenId} listing expires in under 30 seconds — too close to expiry cliff to sign safely.`);
  }

  const c0 = BigInt(claimableTriplet[0] ?? 0n);
  const c1 = BigInt(claimableTriplet[1] ?? 0n);
  const c2 = BigInt(claimableTriplet[2] ?? 0n);
  const rawDeadline = effectiveNowSec + PURCHASE_DEADLINE_WINDOW_SEC;
  const clampedDeadline = freshOffer.expiry < rawDeadline ? freshOffer.expiry : rawDeadline;

  return {
    expectedListingId: freshOffer.listingId,
    minPrincipal: pos.principal,
    minClaimable: [c0, c1, c2],
    minRewardCheckpoint: BigInt(nextCheckpoint ?? 0n),
    deadline: clampedDeadline,
    minRarityTier: BigInt(rarityTier ?? 0n),
  };
}

/**
 * Fail-closed eth_call simulation: verifies via wallet provider and falls back to independent
 * public Base RPC only on non-revert transport errors (or 1-block wallet lag on InvalidBacking 0x184bc66f).
 */
export async function simulateSeatPurchaseFailClosed(provider, txCall, fallbackRpcCall = publicBaseRpcRequest) {
  let primaryErr = null;
  try {
    await provider.request({
      method: "eth_call",
      params: [txCall, "latest"],
    });
    return true;
  } catch (err) {
    primaryErr = err;
    const msg = String(err?.shortMessage || err?.message || "");
    const dataHex = String(err?.data?.data || err?.data || "");
    const isInvalidBackingLagCandidate = /^0x184bc66f/i.test(dataHex) || /InvalidBacking/i.test(msg);
    if (isInvalidBackingLagCandidate) {
      // If keeper Engine.advance() just landed 1 block ahead on public RPC while wallet RPC lags 1 block,
      // verify public RPC passes cleanly AND retry wallet eth_call once after 1.2s.
      try {
        await fallbackRpcCall("eth_call", [txCall, "latest"]);
        await new Promise((r) => setTimeout(r, 1200));
        await provider.request({ method: "eth_call", params: [txCall, "latest"] });
        return true;
      } catch {
        // Fall through to hard revert block below
      }
    }
    const isRevert =
      err?.code === 3 ||
      /^0x[0-9a-fA-F]{8,}/.test(dataHex) ||
      /revert|InvalidListing|Expired|InvalidBacking|InvalidPayment|SelfPurchase|PaymentFailed|InvalidAcquisition|insufficient/i.test(
        msg
      );
    if (isRevert) {
      throw new Error(`Safety simulation blocked reverting seat purchase: ${(msg || dataHex).slice(0, 120)}`);
    }
  }

  // Wallet RPC failed with a non-revert transport error -> require clean pass on independent Base RPC
  try {
    await fallbackRpcCall("eth_call", [txCall, "latest"]);
    return true;
  } catch (fallbackErr) {
    const msg = String(fallbackErr?.message || primaryErr?.message || "eth_call simulation failed");
    throw new Error(`Safety simulation blocked unverified seat purchase: ${msg.slice(0, 120)}`);
  }
}

// --- RPC Transport ---

async function publicBaseRpcRequest(method, params) {
  let lastErr = null;
  for (const url of PUBLIC_BASE_RPCS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.error) {
        const rpcErr = new Error(String(json.error.message || "RPC error"));
        rpcErr.code = json.error.code;
        rpcErr.data = json.error.data;
        throw rpcErr;
      }
      return json?.result;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error("Base RPC unavailable");
}

async function baseRpcRequest(method, params) {
  const walletProvider = getConnectedWalletProvider();
  if (walletProvider) {
    try {
      const chainHex = await walletProvider.request({ method: "eth_chainId" });
      if (parseInt(String(chainHex), 16) === ANCHOR_SEAT_CONSTANTS.chainId) {
        const res = await walletProvider.request({ method, params });
        if (res != null) return res;
      }
    } catch {
      // Fall back to public Base RPC endpoints
    }
  }
  return publicBaseRpcRequest(method, params);
}

async function multicallRead(calls, forcePublic = false) {
  const data = encodeMulticall3Aggregate3(calls);
  const rpcFn = forcePublic ? publicBaseRpcRequest : baseRpcRequest;
  const hex = await rpcFn("eth_call", [
    { to: ANCHOR_SEAT_CONSTANTS.multicall3, data },
    "latest",
  ]);
  if (typeof hex !== "string" || !hex.startsWith("0x") || hex.length < 130) {
    return [];
  }
  return decodeMulticall3Aggregate3(hex);
}

// --- Live State & UI Controller ---

let liveOffersByTokenId = new Map();
let bakingReceiptsByTokenId = new Map();
let expiredReceiptsByTokenId = new Map();
let soldReceiptsByTokenId = new Map();
let soldCohortTokenIds = new Set();
let strangerMintedTokenIds = new Set();
let liveDexOutNaraByEth = new Map();
let lastDexQuoteFetchMs = 0;
let liveEthUsd = null;
let liveSpotUsdPerNara = null;
let liveNaraPerEpochWei = 0n;
let liveActiveModelWeightWei = 0n;
let liveOpenedEpoch = null;
let liveEngineClock = null;
let selectedReviewTokenId = null;
let expandedHelpTokenId = null;
let pendingAutoSelectSeatId = null;
let activeAnchorTierFilter = "featured"; // "featured" | "all" | "sprint" | "starter" | "core" | "plus" | "builder" | "prime"
let isBuyingSeat = false;
let activeBuyingTokenId = null;
let currentSeatStatus = { kind: "idle", message: "", txHash: "" };
let countdownTimer = null;
let bindActionsFn = () => {};
let playClickFn = () => {};
let playSuccessFn = () => {};
let modalVisibilityChangeFn = () => {};

/**
 * Pure helper returning 1-tap mobile wallet deep-links that open the exact Vault Receipt
 * inside MetaMask, Coinbase / Base Wallet, Phantom, or Trust Wallet on Base (8453).
 */
export function buildMobileSeatWalletLinks(tokenId) {
  const cleanId = Number(tokenId);
  const baseOrigin = String(CANONICAL_URL || "https://naraprotocol.io").replace(/\/$/, "");
  const hostPath = baseOrigin.replace(/^https?:\/\//i, "");
  const suffix = Number.isInteger(cleanId) && cleanId > 0 ? `/vault?seat=${cleanId}` : "/vault";
  const directUrl = `${baseOrigin}${suffix}`;
  const encodedUrl = encodeURIComponent(directUrl);
  const encodedRef = encodeURIComponent(baseOrigin);
  return {
    directUrl,
    metamaskUrl: `https://link.metamask.io/dapp/${hostPath}${suffix}`,
    coinbaseUrl: `https://go.cb-w.com/dapp?cb_url=${encodedUrl}`,
    phantomUrl: `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`,
    trustUrl: `https://link.trustwallet.com/open_url?coin_id=8453&url=${encodedUrl}`,
  };
}

function parseDecimalToWei18(str) {
  const raw = String(str ?? "0").trim();
  const m = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return 0n;
  const whole = BigInt(m[1]);
  const frac = (m[2] || "").padEnd(18, "0").slice(0, 18);
  return whole * WAD + BigInt(frac || "0");
}

function formatMonthlyFlow(weightWei, alreadyOnGrid = false) {
  const monthlyNaraWei = computeLiveMonthlyNaraWei(
    weightWei,
    liveNaraPerEpochWei,
    liveActiveModelWeightWei,
    alreadyOnGrid
  );
  if (monthlyNaraWei <= 0n) return null;
  const naraNum = Number(formatUnits(monthlyNaraWei, 18));
  if (!Number.isFinite(naraNum) || naraNum <= 0) return null;
  const naraFormatted = naraNum.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  const usdNum = liveSpotUsdPerNara && liveSpotUsdPerNara > 0 ? naraNum * liveSpotUsdPerNara : null;
  if (usdNum && usdNum >= 1) {
    return {
      primary: `Est. ~${formatUsdClean(usdNum)} / mo`,
      secondary: `+${naraFormatted} $NARA/mo`,
    };
  }
  return {
    primary: `Est. +${naraFormatted} $NARA / mo`,
    secondary: "",
  };
}

function formatEthExact(wei) {
  const str = formatUnits(wei, 18);
  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) return "0";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: num < 0.01 ? 6 : 4,
  });
}

function formatEthClean(num) {
  if (!Number.isFinite(num) || num <= 0) return "—";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatUsdClean(num) {
  if (!Number.isFinite(num) || num <= 0) return "";
  return "$" + Math.round(num).toLocaleString("en-US");
}

function formatUsdcExact(units6) {
  const str = formatUnits(units6, 6);
  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) return "0";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatExpiryShort(expirySec) {
  const diff = Math.max(0, Number(expirySec) - Math.floor(Date.now() / 1000));
  if (diff <= 0) return "EXPIRED";
  const days = Math.floor(diff / 86400);
  const hrs = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days >= 1) return `RELISTS ${days}D ${hrs}H`;
  if (hrs >= 1) return `RELISTS ${hrs}H ${mins}M`;
  return `RELISTS ${mins}M`;
}

function formatTierTitle(tierCode) {
  const raw = String(tierCode || "").toUpperCase();
  if (raw.startsWith("SPRINT")) return "Sprint · 90d";
  if (raw.startsWith("STARTER")) return "Starter · 180d";
  if (raw.startsWith("CORE")) return "Core · 365d";
  if (raw.startsWith("PLUS")) return "Plus · 365d";
  if (raw.startsWith("BUILDER")) return "Builder · 365d";
  if (raw.startsWith("PRIME")) return "Prime · 365d";
  return "Vault Receipt";
}

function populateStatusElement(box, kind, message, txHash, compact = false) {
  if (!box) return;
  if (!message || kind === "idle") {
    box.className = "hidden";
    box.textContent = "";
    return;
  }
  const palette = {
    info: "bg-sky-500/10 border-sky-400/35 text-sky-200",
    warn: "bg-amber-500/10 border-amber-400/35 text-amber-200",
    error: "bg-red-500/15 border-red-500/45 text-red-200",
    success: "bg-emerald-500/15 border-emerald-400/50 text-emerald-300",
  };
  box.className = compact
    ? `p-3 rounded-xl border text-xs font-sans leading-relaxed flex flex-wrap items-center justify-between gap-2 ${palette[kind] || palette.info}`
    : `mx-4 sm:mx-6 my-3 p-3.5 rounded-xl border text-xs font-sans leading-relaxed flex flex-wrap items-center justify-between gap-2.5 ${palette[kind] || palette.info}`;
  box.textContent = "";

  const msgSpan = document.createElement("span");
  msgSpan.textContent = message;
  box.appendChild(msgSpan);

  if (txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    const linksWrap = document.createElement("span");
    linksWrap.className = "flex flex-wrap items-center gap-2 shrink-0";

    const txLink = document.createElement("a");
    txLink.href = `https://basescan.org/tx/${txHash}`;
    txLink.target = "_blank";
    txLink.rel = "noopener noreferrer";
    txLink.className =
      "px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-white text-xs font-semibold no-underline transition-colors";
    txLink.textContent = "BaseScan Tx ↗";

    const appLink = document.createElement("a");
    appLink.href = resolveCryptoSlipCommitUrl();
    appLink.target = "_blank";
    appLink.rel = "noopener noreferrer";
    appLink.className =
      "px-3 py-1.5 rounded-lg bg-naraGreen hover:bg-[#52ff33] text-slate-950 text-xs font-bold no-underline transition-colors";
    appLink.textContent = "View Position in CryptoSLIP ↗";

    linksWrap.appendChild(txLink);
    linksWrap.appendChild(appLink);
    box.appendChild(linksWrap);
  }
}

function setSeatStatus(kind, message, txHash = "") {
  currentSeatStatus = {
    kind: !message ? "idle" : kind,
    message: message || "",
    txHash: txHash || "",
  };
  if (typeof document === "undefined") return;
  populateStatusElement(document.getElementById("anchorSeatsStatusBox"), currentSeatStatus.kind, currentSeatStatus.message, currentSeatStatus.txHash, false);
  populateStatusElement(document.getElementById("anchorReviewInlineStatus"), currentSeatStatus.kind, currentSeatStatus.message, currentSeatStatus.txHash, true);
}

function formatCountdown(targetSec) {
  const diff = Math.max(0, targetSec - Math.floor(Date.now() / 1000));
  if (diff <= 0) return "Awaiting Multisig Listing";
  const hrs = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;
  return `Opens in ${String(hrs).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
}

function updateHeaderBadge() {
  const badge = document.getElementById("anchorSeatsLiveBadge");
  const homeBadge = document.getElementById("homeVaultLiveBadge");
  const homeMarketLine = document.getElementById("homeVaultMarketLine");
  const footerNote = document.getElementById("anchorSeatsFooterNote");
  const marketStrip = document.getElementById("anchorMarketStrip");
  const waveText = document.getElementById("anchorWaveProgressText");
  const waveBar = document.getElementById("anchorWaveProgressBar");
  const statEthUsd = document.getElementById("vaultStatEthUsd");
  const statSpotUsd = document.getElementById("vaultStatSpotUsd");
  const statClaimed = document.getElementById("vaultStatClaimed");

  const activeCount = liveOffersByTokenId.size;
  const bakingCount = bakingReceiptsByTokenId.size;
  const expiredCount = expiredReceiptsByTokenId.size;
  const totalWaveSeats = COHORT_1_REFERENCE_SEATS.length;
  const claimedCount = Math.min(totalWaveSeats, soldCohortTokenIds.size);
  const claimedPct = Math.min(100, Math.round((claimedCount / totalWaveSeats) * 100));

  let minStagedEth = WAVE_1_TIERS[0].askEth;
  if (claimedCount > 0 && claimedCount < totalWaveSeats) {
    // Compute lowest remaining tier askEth when earlier batch tiers have sold out
    let soldCursor = claimedCount;
    for (const t of WAVE_1_TIERS) {
      if (soldCursor < t.count) {
        minStagedEth = t.askEth;
        break;
      }
      soldCursor -= t.count;
    }
  }

  let badgeText = "";
  let badgeClass = "";
  if (activeCount > 0) {
    badgeClass =
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 font-mono font-semibold text-xs tabular-nums";
    badgeText = `${activeCount} Open`;
  } else if (claimedCount >= totalWaveSeats) {
    badgeClass =
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-mono text-xs tabular-nums";
    badgeText = `Sold Out`;
  } else if (expiredCount > 0 && bakingCount === 0) {
    badgeClass =
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-mono text-xs tabular-nums";
    badgeText = `Wave 1 Ended`;
  } else {
    badgeClass =
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-mono text-xs tabular-nums";
    badgeText = `From ${minStagedEth} ETH`;
  }

  if (badge) {
    badge.className = badgeClass;
    badge.textContent = badgeText;
  }
  if (homeBadge) {
    homeBadge.className = badgeClass;
    homeBadge.textContent = badgeText;
  }

  if (waveText) {
    waveText.textContent = `${claimedCount} / ${totalWaveSeats} claimed`;
  }
  if (waveBar) {
    waveBar.style.width = `${Math.max(claimedCount > 0 ? 6 : 0, claimedPct)}%`;
  }
  if (statClaimed) {
    statClaimed.textContent = `${claimedCount} / ${totalWaveSeats}`;
  }
  if (statEthUsd) {
    statEthUsd.textContent = liveEthUsd
      ? `$${liveEthUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : "—";
  }
  if (statSpotUsd) {
    if (liveSpotUsdPerNara) {
      statSpotUsd.textContent = `Spot ~$${liveSpotUsdPerNara.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    } else {
      statSpotUsd.textContent = "Base 8453";
    }
  }

  const filterModes = ["featured", "all", "sprint", "starter", "core", "plus", "builder", "prime"];
  for (const m of filterModes) {
    const btn = document.getElementById(`anchorTierBtn-${m}`);
    if (!btn) continue;
    const isAct = activeAnchorTierFilter === m;
    btn.setAttribute("aria-pressed", isAct ? "true" : "false");
    btn.className = isAct
      ? "px-3 py-1.5 min-h-[34px] rounded-lg bg-naraGreen text-slate-950 text-xs font-sans font-bold cursor-pointer whitespace-nowrap transition-colors"
      : "px-3 py-1.5 min-h-[34px] rounded-lg bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-slate-300 hover:text-white text-xs font-sans font-medium cursor-pointer whitespace-nowrap transition-colors";
  }

  if (marketStrip) marketStrip.textContent = "";
  if (homeMarketLine) homeMarketLine.textContent = "";
  if (footerNote) footerNote.textContent = "";
}

function renderReviewDrawer(forceRebuild = false) {
  const drawer = document.getElementById("anchorSeatReviewDrawer");
  if (!drawer) return;

  if (selectedReviewTokenId == null || !liveOffersByTokenId.has(selectedReviewTokenId)) {
    const wasOpen = !drawer.classList.contains("hidden");
    drawer.className = "hidden";
    drawer.removeAttribute("data-rendered-sig");
    drawer.textContent = "";
    if (wasOpen) modalVisibilityChangeFn();
    return;
  }

  const offer = liveOffersByTokenId.get(selectedReviewTokenId);
  const busy = isBuyingSeat && activeBuyingTokenId === selectedReviewTokenId;
  const wallets = getDiscoveredWallets();
  const acct = getConnectedAccount();
  const sig = `${selectedReviewTokenId}|${offer.priceWei.toString()}|${busy ? 1 : 0}|${acct}|${wallets.map((w) => w.id).join(",")}`;

  // Avoid destroying touch-target buttons during background 25s refreshes when nothing structural changed
  if (!forceRebuild && drawer.getAttribute("data-rendered-sig") === sig && !drawer.classList.contains("hidden")) {
    const expEl = document.getElementById("anchorReviewExpiryText");
    if (expEl) expEl.textContent = formatExpiryShort(offer.expiry);
    populateStatusElement(
      document.getElementById("anchorReviewInlineStatus"),
      currentSeatStatus.kind,
      currentSeatStatus.message,
      currentSeatStatus.txHash,
      true
    );
    return;
  }

  const cls = classifyWave1Tier(offer.principalWei, offer.durationEpochs);
  const durationDays = Math.max(1, Math.round(offer.durationEpochs / 96));
  const priceEthNum = Number(formatUnits(offer.priceWei, 18));
  const priceUsdStr = liveEthUsd && priceEthNum > 0 ? `~${formatUsdClean(priceEthNum * liveEthUsd)}` : "0% slippage";
  const monthly = formatMonthlyFlow(offer.rewardWeightWei, true);

  const chestParts = [];
  if (offer.claimableNaraWei > 0n) chestParts.push(`+${formatDisplayNara(offer.claimableNaraWei)} $NARA`);
  if (offer.claimableEthWei > 0n) chestParts.push(`+${formatEthExact(offer.claimableEthWei)} ETH`);
  if (offer.claimableUsdcUnits > 0n) chestParts.push(`+$${formatUsdcExact(offer.claimableUsdcUnits)}`);
  const chestMain = chestParts.length > 0 ? chestParts[0] : "0.000 $NARA";
  const chestSub = chestParts.length > 1 ? chestParts.slice(1).join(" · ") : "100% yours on buy";

  drawer.className =
    "fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-label", `Vault Receipt #${selectedReviewTokenId} checkout`);
  drawer.setAttribute("data-rendered-sig", sig);
  drawer.textContent = "";

  const panel = document.createElement("div");
  panel.setAttribute("data-seat-review-box", String(selectedReviewTokenId));
  panel.className =
    "w-full sm:max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl bg-[#0D131F] border-t sm:border border-emerald-400/35 shadow-[0_24px_80px_rgba(2,6,23,0.96)] pb-[env(safe-area-inset-bottom,0px)] tabular-nums font-sans";

  // Header
  const header = document.createElement("div");
  header.className = "px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-3";

  const headLeft = document.createElement("div");
  headLeft.className = "min-w-0";
  const titleEl = document.createElement("div");
  titleEl.className = "text-base font-bold text-white tracking-tight";
  titleEl.textContent = `Vault Receipt #${selectedReviewTokenId}`;

  const subEl = document.createElement("div");
  subEl.className = "text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5";
  subEl.appendChild(
    document.createTextNode(`${formatTierTitle(cls.tierCode)} · ${formatDisplayNara(offer.rewardWeightWei)}x share · `)
  );
  const expSpan = document.createElement("span");
  expSpan.id = "anchorReviewExpiryText";
  expSpan.className = "font-mono text-emerald-300/90";
  expSpan.textContent = formatExpiryShort(offer.expiry);
  subEl.appendChild(expSpan);

  headLeft.appendChild(titleEl);
  headLeft.appendChild(subEl);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.disabled = busy;
  closeBtn.setAttribute("data-on-click", "cancelSeatReview");
  closeBtn.setAttribute("aria-label", "Close checkout");
  closeBtn.className =
    "w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 text-slate-400 hover:text-white text-sm flex items-center justify-center cursor-pointer transition-colors shrink-0";
  closeBtn.textContent = "✕";

  header.appendChild(headLeft);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "p-5 space-y-4";

  // 2x2 Summary Tiles (fits cleanly on 390px phone screen without scrolling)
  const grid = document.createElement("div");
  grid.className = "grid grid-cols-2 gap-2.5";

  const tiles = [
    {
      label: "Sealed Principal",
      main: `${formatDisplayNara(offer.principalWei)} $NARA`,
      sub: `${durationDays}d · 0% maturity fee`,
      accent: false,
    },
    {
      label: "Total Payment",
      main: `${formatEthExact(offer.priceWei)} ETH`,
      sub: `${priceUsdStr} · 0% slippage`,
      accent: true,
    },
    {
      label: "Monthly Pulses",
      main: monthly ? monthly.primary.replace(/^Est\.\s*/, "") : "Every 15m",
      sub: monthly?.secondary || "Claim & sell anytime",
      accent: false,
    },
    {
      label: "In Chest Now",
      main: chestMain,
      sub: chestSub,
      accent: false,
    },
  ];

  for (const t of tiles) {
    const cell = document.createElement("div");
    cell.className = t.accent
      ? "p-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-400/30"
      : "p-3 rounded-xl bg-[#080C14] border border-white/[0.08]";
    const k = document.createElement("div");
    k.className = t.accent ? "text-[11px] font-semibold text-emerald-300" : "text-[11px] font-medium text-slate-400";
    k.textContent = t.label;
    const v = document.createElement("div");
    v.className = "text-sm sm:text-base font-mono font-bold text-white mt-0.5 truncate";
    v.textContent = t.main;
    const s = document.createElement("div");
    s.className = "text-[11px] font-mono text-slate-400 mt-0.5 truncate";
    s.textContent = t.sub;
    cell.appendChild(k);
    cell.appendChild(v);
    cell.appendChild(s);
    grid.appendChild(cell);
  }
  body.appendChild(grid);

  // Inline Status Banner (visible right inside checkout on mobile & desktop)
  const inlineStatus = document.createElement("div");
  inlineStatus.id = "anchorReviewInlineStatus";
  populateStatusElement(
    inlineStatus,
    currentSeatStatus.kind,
    currentSeatStatus.message,
    currentSeatStatus.txHash,
    true
  );
  body.appendChild(inlineStatus);

  // Smart Wallet Action Section
  const actionWrap = document.createElement("div");
  actionWrap.className = "space-y-2.5";

  const usdInline = liveEthUsd && priceEthNum > 0 ? ` (~${formatUsdClean(priceEthNum * liveEthUsd)})` : "";

  if (acct && isValidAddress(acct)) {
    const connectedBar = document.createElement("div");
    connectedBar.className =
      "px-3 py-2 rounded-xl bg-[#080C14] border border-white/10 flex items-center justify-between gap-2 text-xs font-mono";
    const leftSpan = document.createElement("span");
    leftSpan.className = "text-emerald-300 font-semibold truncate";
    leftSpan.textContent = `${getConnectedWalletName()} · ${acct.slice(0, 6)}…${acct.slice(-4)}`;
    const rightSpan = document.createElement("span");
    rightSpan.className = "text-slate-400 shrink-0";
    rightSpan.textContent = "Base 8453";
    connectedBar.appendChild(leftSpan);
    connectedBar.appendChild(rightSpan);
    actionWrap.appendChild(connectedBar);

    const confirmBtn = document.createElement("button");
    confirmBtn.id = "anchorReviewConfirmBtn";
    confirmBtn.type = "button";
    confirmBtn.disabled = isBuyingSeat;
    confirmBtn.setAttribute("data-on-click", `buyAnchorSeat:${selectedReviewTokenId}`);
    confirmBtn.className = busy
      ? "w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-500/25 border border-emerald-400 text-white text-sm font-semibold cursor-wait font-mono tabular-nums"
      : "w-full min-h-[48px] px-5 py-3 rounded-xl bg-naraGreen hover:bg-[#52ff33] active:bg-emerald-400 text-slate-950 text-sm font-bold cursor-pointer nara-press font-mono tabular-nums";
    confirmBtn.textContent = busy
      ? "Simulating & Signing…"
      : `Confirm & Sign · ${formatEthExact(offer.priceWei)} ETH${usdInline}`;
    actionWrap.appendChild(confirmBtn);
  } else if (wallets.length === 1) {
    const confirmBtn = document.createElement("button");
    confirmBtn.id = "anchorReviewConfirmBtn";
    confirmBtn.type = "button";
    confirmBtn.disabled = isBuyingSeat;
    confirmBtn.setAttribute("data-on-click", `buyAnchorSeat:${selectedReviewTokenId}|${wallets[0].id}`);
    confirmBtn.className = busy
      ? "w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-500/25 border border-emerald-400 text-white text-sm font-semibold cursor-wait font-mono tabular-nums"
      : "w-full min-h-[48px] px-5 py-3 rounded-xl bg-naraGreen hover:bg-[#52ff33] active:bg-emerald-400 text-slate-950 text-sm font-bold cursor-pointer nara-press font-mono tabular-nums";
    confirmBtn.textContent = busy
      ? "Connecting & Simulating…"
      : `Connect ${wallets[0].name} & Buy · ${formatEthExact(offer.priceWei)} ETH`;
    actionWrap.appendChild(confirmBtn);
  } else if (wallets.length > 1) {
    const pickTitle = document.createElement("div");
    pickTitle.className = "text-xs font-medium text-slate-300";
    pickTitle.textContent = "Choose wallet to sign on Base:";
    actionWrap.appendChild(pickTitle);

    const list = document.createElement("div");
    list.className = "space-y-2";
    for (const w of wallets) {
      const wBtn = document.createElement("button");
      wBtn.type = "button";
      wBtn.disabled = isBuyingSeat;
      wBtn.setAttribute("data-on-click", `buyAnchorSeat:${selectedReviewTokenId}|${w.id}`);
      wBtn.className =
        "w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-naraGreen hover:bg-[#52ff33] text-slate-950 text-xs font-bold flex items-center justify-between cursor-pointer nara-press";
      const l = document.createElement("span");
      l.textContent = `Buy with ${w.name}`;
      const r = document.createElement("span");
      r.className = "font-mono";
      r.textContent = `${formatEthExact(offer.priceWei)} ETH →`;
      wBtn.appendChild(l);
      wBtn.appendChild(r);
      list.appendChild(wBtn);
    }
    actionWrap.appendChild(list);
  } else {
    // Mobile Safari / Chrome / Telegram / X (no window.ethereum injected):
    // Give 1-tap Universal Links that open THIS exact receipt (#ID) directly inside the user's mobile wallet!
    const links = buildMobileSeatWalletLinks(selectedReviewTokenId);

    const mobileHint = document.createElement("div");
    mobileHint.className = "text-xs text-slate-300 leading-snug";
    mobileHint.textContent = `Open Receipt #${selectedReviewTokenId} directly in your Base wallet app:`;
    actionWrap.appendChild(mobileHint);

    const deepGrid = document.createElement("div");
    deepGrid.className = "grid grid-cols-2 gap-2";

    const walletLinks = [
      { id: "seatOpenMetaMask", label: "MetaMask ↗", href: links.metamaskUrl, primary: true },
      { id: "seatOpenCoinbase", label: "Coinbase / Base ↗", href: links.coinbaseUrl, primary: true },
      { id: "seatOpenPhantom", label: "Phantom ↗", href: links.phantomUrl, primary: false },
      { id: "seatOpenTrust", label: "Trust Wallet ↗", href: links.trustUrl, primary: false },
    ];

    for (const item of walletLinks) {
      const a = document.createElement("a");
      a.id = item.id;
      a.href = item.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = item.primary
        ? "min-h-[46px] px-3 py-2.5 rounded-xl bg-naraGreen hover:bg-[#52ff33] text-slate-950 text-xs font-bold flex items-center justify-center text-center no-underline nara-press"
        : "min-h-[44px] px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-white text-xs font-semibold flex items-center justify-center text-center no-underline transition-colors";
      a.textContent = item.label;
      a.addEventListener("click", (ev) => {
        playClickFn();
        if (typeof window !== "undefined" && isTelegramWebView() && window.Telegram?.WebApp?.openLink) {
          ev.preventDefault();
          try {
            window.Telegram.WebApp.openLink(item.href);
          } catch {
            window.open(item.href, "_blank", "noopener,noreferrer");
          }
        }
      });
      deepGrid.appendChild(a);
    }
    actionWrap.appendChild(deepGrid);

    const copyLinkBtn = document.createElement("button");
    copyLinkBtn.id = "copySeatLinkBtn";
    copyLinkBtn.type = "button";
    copyLinkBtn.setAttribute("data-on-click", `copySeatLink:${selectedReviewTokenId}`);
    copyLinkBtn.className =
      "w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/12 text-slate-200 hover:text-white text-xs font-medium cursor-pointer transition-colors";
    copyLinkBtn.textContent = `Copy Link for Other Wallets (Rabby / Rainbow / Safe)`;
    actionWrap.appendChild(copyLinkBtn);

    const detectBtn = document.createElement("button");
    detectBtn.type = "button";
    detectBtn.setAttribute("data-on-click", `buyAnchorSeat:${selectedReviewTokenId}`);
    detectBtn.className =
      "w-full py-1 text-[11px] text-slate-400 hover:text-emerald-300 bg-transparent border-0 cursor-pointer underline";
    detectBtn.textContent = "Already inside a wallet browser? Tap to connect";
    actionWrap.appendChild(detectBtn);
  }

  body.appendChild(actionWrap);

  const footNote = document.createElement("div");
  footNote.className = "pt-2 border-t border-white/[0.06] text-[11px] text-slate-500 leading-snug space-y-1";
  const footBounds = document.createElement("div");
  footBounds.textContent =
    "Atomic BuyerBounds pin listing ID, principal, all 3 chest balances, and exact ETH price on Base (0x04Ac…f225).";
  const footLegal = document.createElement("div");
  footLegal.appendChild(document.createTextNode("18+ · Non-sanctioned · Variable non-guaranteed pulses · "));
  const termsA = document.createElement("a");
  termsA.href = "/terms";
  termsA.className = "text-slate-400 hover:text-white underline";
  termsA.textContent = "Terms";
  const privA = document.createElement("a");
  privA.href = "/privacy";
  privA.className = "text-slate-400 hover:text-white underline";
  privA.textContent = "Privacy";
  footLegal.appendChild(termsA);
  footLegal.appendChild(document.createTextNode(" & "));
  footLegal.appendChild(privA);
  footNote.appendChild(footBounds);
  footNote.appendChild(footLegal);
  body.appendChild(footNote);

  panel.appendChild(body);
  drawer.appendChild(panel);
  bindActionsFn(drawer);
  modalVisibilityChangeFn();
}

function renderSeatsGrid() {
  updateHeaderBadge();
  const grid = document.getElementById("anchorSeatsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const liveEntries = [...liveOffersByTokenId.values()].sort((a, b) =>
    a.priceWei < b.priceWei ? -1 : a.priceWei > b.priceWei ? 1 : Number(a.tokenId - b.tokenId)
  );

  // Build tier-grouped pools of on-chain Wave 1 items so even if an external user mints #16 (shifting Safe IDs to #17..#45),
  // every card binds to its exact (principalWei, durationEpochs) tier without mislabeling or hiding Prime seats.
  const tierBuckets = new Map(WAVE_1_TIERS.map((t) => [t.key, []]));
  const extraLiveItems = [];

  for (const live of liveEntries) {
    const tid = Number(live.tokenId);
    const cls = classifyWave1Tier(live.principalWei, live.durationEpochs);
    if (cls.matchedWaveTier && tierBuckets.has(cls.tierKey)) {
      tierBuckets.get(cls.tierKey).push({ kind: "live", tid, data: live, cls });
    } else {
      extraLiveItems.push({ tid, data: live, cls });
    }
  }
  for (const [tid, baking] of bakingReceiptsByTokenId.entries()) {
    const cls = classifyWave1Tier(baking.principalWei, baking.durationEpochs);
    if (cls.matchedWaveTier && tierBuckets.has(cls.tierKey)) {
      tierBuckets.get(cls.tierKey).push({ kind: "baking", tid, data: baking, cls });
    }
  }
  for (const [tid, exp] of expiredReceiptsByTokenId.entries()) {
    const cls = classifyWave1Tier(exp.principalWei, exp.durationEpochs);
    if (cls.matchedWaveTier && tierBuckets.has(cls.tierKey)) {
      tierBuckets.get(cls.tierKey).push({ kind: "expired", tid, data: exp, cls });
    }
  }
  for (const [tid, sold] of soldReceiptsByTokenId.entries()) {
    const cls = classifyWave1Tier(sold.principalWei, sold.durationEpochs);
    if (cls.matchedWaveTier && tierBuckets.has(cls.tierKey)) {
      tierBuckets.get(cls.tierKey).push({ kind: "sold", tid, data: sold, cls });
    }
  }

  for (const list of tierBuckets.values()) {
    const order = { live: 0, baking: 1, expired: 2, sold: 3 };
    list.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.tid - b.tid);
  }

  const bucketCursor = new Map(WAVE_1_TIERS.map((t) => [t.key, 0]));
  const allCards = [];
  const usedTokenIds = new Set();

  for (const ref of COHORT_1_REFERENCE_SEATS) {
    const bucket = tierBuckets.get(ref.tierKey) || [];
    const cursor = bucketCursor.get(ref.tierKey) || 0;
    const matched = cursor < bucket.length ? bucket[cursor] : null;
    if (matched) {
      bucketCursor.set(ref.tierKey, cursor + 1);
      usedTokenIds.add(matched.tid);
    }

    const state = matched ? matched.kind : "staged";
    const src = matched ? matched.data : null;
    // If unminted staged card collides numerically with a stranger-minted ID, shift staged preview ID cleanly
    const displayTokenId = matched
      ? matched.tid
      : strangerMintedTokenIds.has(ref.tokenId)
        ? ref.tokenId + strangerMintedTokenIds.size
        : ref.tokenId;

    const principalWei = src ? src.principalWei : parseDecimalToWei18(ref.nara);
    const durationEpochs = src ? src.durationEpochs : ref.epochs;
    const priceWei = state === "live" && src?.priceWei ? src.priceWei : parseDecimalToWei18(ref.askEth);

    const naraNum = Number(formatUnits(principalWei, 18));
    const durationDays = Math.max(1, Math.round(Number(durationEpochs) / 96));
    const askEthNum = Number(formatUnits(priceWei, 18));
    const ethDisplay = state === "live" ? `${formatEthExact(priceWei)} ETH` : `${ref.askEth} ETH`;
    const askUsdNum = liveEthUsd && askEthNum > 0 ? askEthNum * liveEthUsd : null;
    const usdDisplay = askUsdNum
      ? `~${formatUsdClean(askUsdNum)}`
      : state === "live"
        ? "FIXED ETH"
        : `WAVE 2 → ${ref.nextWaveEth}Ξ`;

    const spotInsideUsd = liveSpotUsdPerNara && naraNum > 0 ? naraNum * liveSpotUsdPerNara : null;
    const spotDiscountPct =
      spotInsideUsd && askUsdNum && spotInsideUsd > askUsdNum
        ? Math.round((1 - askUsdNum / spotInsideUsd) * 100)
        : null;

    // Live DEX execution comparison: how much NARA does spending `askEth` on DEX swap actually yield?
    const dexSwapOutNara = liveDexOutNaraByEth.get(ref.askEth) ?? null;
    const dexSavingsPct =
      dexSwapOutNara && dexSwapOutNara > 0 && naraNum > dexSwapOutNara
        ? Math.round((1 - dexSwapOutNara / naraNum) * 100)
        : null;

    let equityLabel = `0% Slippage · Wave 2 → ${ref.nextWaveEth} ETH`;
    if (spotInsideUsd && spotDiscountPct != null && spotDiscountPct >= 3) {
      equityLabel = `Spot val ~${formatUsdClean(spotInsideUsd)} (-${spotDiscountPct}% Wave 1)`;
    } else if (spotInsideUsd) {
      equityLabel = `Spot val ~${formatUsdClean(spotInsideUsd)} · 0% Slippage`;
    }

    const weightWei = src?.rewardWeightWei
      ? src.rewardWeightWei
      : computeV4QuadraticWeightWei(principalWei, durationEpochs);
    const alreadyInActiveWeight = Boolean(
      src &&
        liveOpenedEpoch != null &&
        src.activationEpoch != null &&
        liveOpenedEpoch >= src.activationEpoch &&
        liveOpenedEpoch < src.maturityEpoch
    );

    allCards.push({
      tierKey: ref.tierKey,
      tierCode: ref.tierCode,
      tokenId: displayTokenId,
      durationDays,
      naraNum,
      askEthNum,
      priceWei,
      askUsdNum,
      spotInsideUsd,
      spotDiscountPct,
      dexSwapOutNara,
      dexSavingsPct,
      naraDisplay: formatDisplayNara(principalWei),
      weightDisplay: formatDisplayNara(weightWei),
      weightWei,
      alreadyOnGrid: alreadyInActiveWeight,
      isMintedOnChain: Boolean(src),
      ethPriceDisplay: ethDisplay,
      usdPriceDisplay: usdDisplay,
      equityLabel,
      nextWaveEth: ref.nextWaveEth,
      tierLabel: ref.tierLabel,
      expiryLabel: state === "live" && src?.expiry ? formatExpiryShort(src.expiry) : "72H WAVE 1",
      claimableNaraWei: src?.claimableNaraWei ?? 0n,
      claimableEthWei: src?.claimableEthWei ?? 0n,
      claimableUsdcUnits: src?.claimableUsdcUnits ?? 0n,
      unsettledEpochs: src?.unsettledEpochs ?? 0n,
      activationEpoch: src?.activationEpoch ?? null,
      maturityEpoch: src?.maturityEpoch ?? null,
      state,
    });
  }

  for (const extraWrap of extraLiveItems) {
    const extra = extraWrap.data;
    const tid = extraWrap.tid;
    if (usedTokenIds.has(tid)) continue;
    const cls = extraWrap.cls;
    const ethVal = Number(formatUnits(extra.priceWei, 18));
    const naraNum = Number(formatUnits(extra.principalWei, 18));
    const askUsdNum = liveEthUsd && ethVal > 0 ? ethVal * liveEthUsd : null;
    const spotInsideUsd = liveSpotUsdPerNara && naraNum > 0 ? naraNum * liveSpotUsdPerNara : null;
    const spotDiscountPct =
      spotInsideUsd && askUsdNum && spotInsideUsd > askUsdNum
        ? Math.round((1 - askUsdNum / spotInsideUsd) * 100)
        : null;
    let equityLabel = "0% Slippage · Direct Settlement";
    if (spotInsideUsd && spotDiscountPct != null && spotDiscountPct >= 3) {
      equityLabel = `Spot val ~${formatUsdClean(spotInsideUsd)} (-${spotDiscountPct}% vs Spot)`;
    }
    const alreadyInActiveWeight = Boolean(
      liveOpenedEpoch != null &&
        extra.activationEpoch != null &&
        liveOpenedEpoch >= extra.activationEpoch &&
        liveOpenedEpoch < extra.maturityEpoch
    );
    allCards.push({
      tierKey: cls.tierKey,
      tierCode: cls.tierCode,
      tokenId: tid,
      durationDays: Math.max(1, Math.round(extra.durationEpochs / 96)),
      naraNum,
      askEthNum: ethVal,
      priceWei: extra.priceWei,
      askUsdNum,
      spotInsideUsd,
      spotDiscountPct,
      dexSwapOutNara: null,
      dexSavingsPct: null,
      naraDisplay: formatDisplayNara(extra.principalWei),
      weightDisplay: formatDisplayNara(extra.rewardWeightWei),
      weightWei: extra.rewardWeightWei,
      alreadyOnGrid: alreadyInActiveWeight,
      isMintedOnChain: true,
      ethPriceDisplay: `${formatEthExact(extra.priceWei)} ETH`,
      usdPriceDisplay: askUsdNum ? `~${formatUsdClean(askUsdNum)}` : "FIXED ETH",
      equityLabel,
      nextWaveEth: cls.nextWaveEth,
      tierLabel: "OPEN",
      expiryLabel: formatExpiryShort(extra.expiry),
      claimableNaraWei: extra.claimableNaraWei,
      claimableEthWei: extra.claimableEthWei,
      claimableUsdcUnits: extra.claimableUsdcUnits,
      unsettledEpochs: extra.unsettledEpochs ?? 0n,
      activationEpoch: extra.activationEpoch ?? null,
      maturityEpoch: extra.maturityEpoch ?? null,
      state: "live",
    });
  }

  if (selectedReviewTokenId != null && !liveOffersByTokenId.has(selectedReviewTokenId)) {
    selectedReviewTokenId = null;
  }

  // Filter cards according to activeAnchorTierFilter ("featured" = 2 best per tier = 12 cards across 6 tiers)
  const stateRank = { live: 0, baking: 1, staged: 2, expired: 3, sold: 4 };
  let cards = allCards;
  if (activeAnchorTierFilter === "featured") {
    const featured = [];
    for (const tier of WAVE_1_TIERS) {
      const group = allCards
        .filter((c) => c.tierKey === tier.key)
        .sort((a, b) => (stateRank[a.state] ?? 9) - (stateRank[b.state] ?? 9) || a.tokenId - b.tokenId);
      featured.push(...group.slice(0, 2));
    }
    // Always preserve selected live receipt in view if picked from "all" earlier
    if (selectedReviewTokenId != null && !featured.some((c) => c.tokenId === selectedReviewTokenId)) {
      const sel = allCards.find((c) => c.tokenId === selectedReviewTokenId);
      if (sel) featured.unshift(sel);
    }
    cards = featured;
  } else if (activeAnchorTierFilter !== "all") {
    cards = allCards.filter((c) => c.tierKey === activeAnchorTierFilter);
  }

  for (const card of cards) {
    const isSelected = card.state === "live" && selectedReviewTokenId === card.tokenId;
    const isHelpOpen = expandedHelpTokenId === card.tokenId;
    const el = document.createElement("div");

    const cellSurface =
      card.state === "live"
        ? isSelected
          ? "bg-[#101E1B] border-emerald-400 ring-1 ring-emerald-400/35"
          : "bg-[#0D131F] border-emerald-400/30 hover:border-emerald-400/60"
        : card.state === "sold"
          ? "bg-[#0B101B] border-white/[0.05] opacity-55"
          : "bg-[#0D131F] border-white/[0.08] hover:border-white/[0.16]";

    el.className = `p-5 sm:p-6 rounded-2xl border ${cellSurface} flex flex-col justify-between gap-3.5 tabular-nums min-w-0 transition-colors`;

    // Row 1: Quiet Identity + Spot Discount Badge + (#ID + Subtle ? Bubble)
    const topRow = document.createElement("div");
    topRow.className = "flex items-center justify-between gap-2 text-xs";

    const topLeft = document.createElement("div");
    topLeft.className = "flex items-center gap-2 min-w-0";

    const seatTag = document.createElement("span");
    seatTag.className = "text-slate-400 font-sans font-medium truncate";
    seatTag.textContent = formatTierTitle(card.tierCode);
    topLeft.appendChild(seatTag);

    if (card.spotDiscountPct != null && card.spotDiscountPct >= 3) {
      const discBadge = document.createElement("span");
      discBadge.className =
        "px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-300 font-mono text-[11px] font-semibold whitespace-nowrap shrink-0";
      discBadge.textContent = `-${card.spotDiscountPct}% vs Spot`;
      topLeft.appendChild(discBadge);
    } else if (card.dexSavingsPct != null && card.dexSavingsPct >= 10) {
      // Griefing-resistant fallback: if a tiny swap pokes slot0 down while real DEX buy execution still costs 2x+, show real DEX savings
      const discBadge = document.createElement("span");
      discBadge.className =
        "px-1.5 py-0.5 rounded bg-emerald-500/12 text-emerald-300 font-mono text-[11px] font-semibold whitespace-nowrap shrink-0";
      discBadge.textContent = `-${card.dexSavingsPct}% vs DEX`;
      topLeft.appendChild(discBadge);
    }

    const topRight = document.createElement("div");
    topRight.className = "flex items-center gap-1.5 shrink-0";

    const idTag = document.createElement("span");
    idTag.className = "text-slate-500 font-mono";
    idTag.textContent = `#${card.tokenId}`;

    const helpBtn = document.createElement("button");
    helpBtn.type = "button";
    helpBtn.setAttribute("data-card-help-btn", String(card.tokenId));
    helpBtn.setAttribute("data-on-click", `toggleCardHelp:${card.tokenId}`);
    helpBtn.setAttribute("aria-expanded", isHelpOpen ? "true" : "false");
    helpBtn.setAttribute("aria-label", `Vault Receipt #${card.tokenId} benefits and live chest monitor`);
    helpBtn.title = "What you get & ecosystem impact";
    helpBtn.className = isHelpOpen
      ? "w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-[11px] font-sans font-bold flex items-center justify-center cursor-pointer transition-colors"
      : "w-5 h-5 rounded-full bg-white/[0.06] hover:bg-emerald-500/15 border border-white/15 hover:border-emerald-400/50 text-slate-300 hover:text-emerald-300 text-[11px] font-sans font-bold flex items-center justify-center cursor-pointer transition-colors";
    helpBtn.textContent = "?";

    topRight.appendChild(idTag);
    topRight.appendChild(helpBtn);

    topRow.appendChild(topLeft);
    topRow.appendChild(topRight);

    // Row 2: Clean Focal Principal + Market Spot + Live Monthly Earnings (Zero Text Clutter)
    const midBox = document.createElement("div");
    midBox.className = "space-y-1.5 min-w-0";

    const principalRow = document.createElement("div");
    principalRow.className = "flex items-baseline justify-between gap-2";

    const naraStrong = document.createElement("span");
    naraStrong.className = "font-sans text-2xl font-bold text-white tracking-tight whitespace-nowrap";
    naraStrong.textContent = `${card.naraDisplay} $NARA`;
    principalRow.appendChild(naraStrong);

    if (card.spotInsideUsd && card.spotInsideUsd > 0) {
      const spotTag = document.createElement("span");
      spotTag.className = "text-xs font-mono text-slate-400 whitespace-nowrap shrink-0";
      spotTag.textContent = `Spot ~${formatUsdClean(card.spotInsideUsd)}`;
      principalRow.appendChild(spotTag);
    } else {
      const weightPill = document.createElement("span");
      weightPill.className =
        "px-2 py-0.5 rounded-md bg-white/[0.05] text-xs font-mono text-slate-300 font-medium whitespace-nowrap shrink-0";
      weightPill.textContent = `${card.weightDisplay}x`;
      principalRow.appendChild(weightPill);
    }

    const monthly = formatMonthlyFlow(card.weightWei, card.alreadyOnGrid);
    const monthlyRow = document.createElement("div");
    monthlyRow.className = "flex items-baseline justify-between gap-2 pt-0.5 min-w-0";
    if (monthly) {
      const mPrimary = document.createElement("span");
      mPrimary.className = "text-xs font-mono font-semibold text-emerald-300 whitespace-nowrap";
      mPrimary.textContent = monthly.primary;
      monthlyRow.appendChild(mPrimary);
      if (monthly.secondary) {
        const mSec = document.createElement("span");
        mSec.className = "text-[11px] font-mono text-slate-400 whitespace-nowrap";
        mSec.textContent = monthly.secondary;
        monthlyRow.appendChild(mSec);
      }
    } else {
      const mPending = document.createElement("span");
      mPending.className = "text-xs font-sans text-slate-500 truncate";
      mPending.textContent = "Est. monthly pulses loading…";
      monthlyRow.appendChild(mPending);
    }

    midBox.appendChild(principalRow);
    midBox.appendChild(monthlyRow);

    // Live On-Chain Chest Row (Visible on card face when > 0 accrued; otherwise inside ? modal)
    const pendingNaraWei =
      card.unsettledEpochs > 0n && liveNaraPerEpochWei > 0n && liveActiveModelWeightWei > 0n
        ? (card.unsettledEpochs * liveNaraPerEpochWei * card.weightWei) / liveActiveModelWeightWei
        : 0n;
    const totalLiveNaraWei = card.claimableNaraWei + pendingNaraWei;
    const hasLiveAccrued =
      totalLiveNaraWei > 0n || card.claimableEthWei > 0n || card.claimableUsdcUnits > 0n;

    const chestLine = document.createElement("div");
    if (hasLiveAccrued) {
      chestLine.className = "flex items-baseline justify-between gap-2 text-[11px] font-mono min-w-0";
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = "INSIDE RECEIPT CHEST · ";
      chestLine.appendChild(sr);

      const parts = [`+${formatDisplayNara(totalLiveNaraWei)} $NARA`];
      if (card.claimableEthWei > 0n) parts.push(`+${formatEthExact(card.claimableEthWei)} ETH`);
      if (card.claimableUsdcUnits > 0n) parts.push(`+$${formatUsdcExact(card.claimableUsdcUnits)}`);
      const cLeft = document.createElement("span");
      cLeft.className = "text-emerald-300/90 truncate";
      cLeft.textContent = `In chest: ${parts.join(" · ")}`;
      chestLine.appendChild(cLeft);
    } else {
      chestLine.className = "sr-only";
      chestLine.textContent = "INSIDE RECEIPT CHEST · NARA + ETH + USDC";
    }
    midBox.appendChild(chestLine);

    // Row 3: Crisp White ETH Price + Single Action on One Clean Line
    const bottomRow = document.createElement("div");
    bottomRow.className = "pt-3.5 border-t border-white/[0.07] flex items-center justify-between gap-3";

    const priceWrap = document.createElement("div");
    priceWrap.className = "flex items-baseline gap-2 min-w-0";

    const ethStrong = document.createElement("span");
    ethStrong.className = "text-lg font-mono font-bold text-white whitespace-nowrap";
    ethStrong.textContent = card.ethPriceDisplay;
    priceWrap.appendChild(ethStrong);

    if (card.usdPriceDisplay && card.usdPriceDisplay.startsWith("~")) {
      const usdSpan = document.createElement("span");
      usdSpan.className = "text-xs font-mono text-slate-400 whitespace-nowrap";
      usdSpan.textContent = card.usdPriceDisplay;
      priceWrap.appendChild(usdSpan);
    }

    bottomRow.appendChild(priceWrap);

    if (card.state === "live") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.disabled = isBuyingSeat;
      btn.setAttribute("data-seat-select-btn", String(card.tokenId));
      btn.setAttribute("data-on-click", `selectAnchorSeat:${card.tokenId}`);
      btn.className = isSelected
        ? "min-h-[38px] px-4 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-xs font-sans font-semibold cursor-pointer nara-press shrink-0"
        : "min-h-[38px] px-4 py-1.5 rounded-lg bg-naraGreen hover:bg-[#52ff33] text-slate-950 text-xs font-sans font-bold cursor-pointer nara-press shrink-0";
      btn.textContent = isSelected ? "Selected ✓" : "Select";
      bottomRow.appendChild(btn);
    } else {
      const statePill = document.createElement("span");
      statePill.className =
        "px-2.5 py-1 rounded-lg bg-white/[0.04] text-[11px] font-sans font-medium text-slate-400 shrink-0";
      statePill.textContent =
        card.state === "sold"
          ? "Sold"
          : card.state === "expired"
            ? "Wave 1 Ended"
            : "Wave 1";
      bottomRow.appendChild(statePill);
    }

    el.appendChild(topRow);
    el.appendChild(midBox);
    el.appendChild(bottomRow);
    grid.appendChild(el);
  }

  bindActionsFn(grid);
  renderReviewDrawer();
  renderCardHelpModal(allCards);
}

function renderCardHelpModal(allCards) {
  const modal = document.getElementById("anchorCardHelpModal");
  if (!modal) return;

  const card =
    expandedHelpTokenId != null ? allCards.find((c) => c.tokenId === expandedHelpTokenId) : null;
  if (!card) {
    modal.className = "hidden";
    modal.textContent = "";
    return;
  }

  modal.className =
    "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", `Vault Receipt #${card.tokenId} breakdown`);
  modal.textContent = "";

  const panel = document.createElement("div");
  panel.setAttribute("data-card-help-box", String(card.tokenId));
  panel.className =
    "w-full max-w-md rounded-2xl bg-[#0D131F] border border-white/[0.12] shadow-[0_24px_70px_rgba(2,6,23,0.92)] overflow-hidden tabular-nums font-sans";

  // 1. Clean Modal Header
  const header = document.createElement("div");
  header.className = "px-5 py-4 border-b border-white/[0.07] flex items-center justify-between gap-3";

  const headLeft = document.createElement("div");
  const title = document.createElement("div");
  title.className = "text-base font-bold text-white tracking-tight";
  title.textContent = `Vault Receipt #${card.tokenId}`;

  const subtitle = document.createElement("div");
  subtitle.className = "text-xs text-slate-400 mt-0.5";
  subtitle.textContent = `${formatTierTitle(card.tierCode)} · ${card.weightDisplay}x reward share`;

  headLeft.appendChild(title);
  headLeft.appendChild(subtitle);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("data-on-click", `toggleCardHelp:${card.tokenId}`);
  closeBtn.setAttribute("aria-label", "Close modal");
  closeBtn.className =
    "w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 text-slate-400 hover:text-white text-xs flex items-center justify-center cursor-pointer transition-colors shrink-0";
  closeBtn.textContent = "✕";

  header.appendChild(headLeft);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // 2. Modal Body
  const body = document.createElement("div");
  body.className = "p-5 space-y-5";

  // 2A. Side-by-Side Price Comparison (Market Spot vs. You Pay)
  const compareGrid = document.createElement("div");
  compareGrid.className = "grid grid-cols-2 gap-3";

  const spotBox = document.createElement("div");
  spotBox.className = "p-3.5 rounded-xl bg-[#080C14] border border-white/[0.07]";
  const spotLabel = document.createElement("div");
  spotLabel.className = "text-xs font-medium text-slate-400";
  spotLabel.textContent = "Market Spot";
  const spotVal = document.createElement("div");
  spotVal.className = "text-xl font-mono font-semibold text-slate-300 mt-1";
  spotVal.textContent = card.spotInsideUsd ? `~${formatUsdClean(card.spotInsideUsd)}` : `${card.naraDisplay} $NARA`;
  const spotSub = document.createElement("div");
  spotSub.className = "text-[11px] text-slate-500 mt-0.5";
  spotSub.textContent =
    card.dexSwapOutNara && card.dexSwapOutNara > 0
      ? `${card.naraDisplay} $NARA (${card.dexSwapOutNara.toFixed(2)} via swap)`
      : `${card.naraDisplay} $NARA on DEX`;
  spotBox.appendChild(spotLabel);
  spotBox.appendChild(spotVal);
  spotBox.appendChild(spotSub);

  const payBox = document.createElement("div");
  payBox.className = "p-3.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-400/30";
  const payTop = document.createElement("div");
  payTop.className = "flex items-center justify-between gap-1.5";
  const payLabel = document.createElement("span");
  payLabel.className = "text-xs font-semibold text-emerald-300";
  payLabel.textContent = "You Pay";
  payTop.appendChild(payLabel);
  if (card.spotDiscountPct != null && card.spotDiscountPct >= 3) {
    const dPill = document.createElement("span");
    dPill.className =
      "px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-bold";
    dPill.textContent = `-${card.spotDiscountPct}%`;
    payTop.appendChild(dPill);
  } else if (card.dexSavingsPct != null && card.dexSavingsPct >= 10) {
    const dPill = document.createElement("span");
    dPill.className =
      "px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-bold";
    dPill.textContent = `-${card.dexSavingsPct}% DEX`;
    payTop.appendChild(dPill);
  }
  const payVal = document.createElement("div");
  payVal.className = "text-xl font-mono font-bold text-white mt-1";
  payVal.textContent = card.askUsdNum ? `~${formatUsdClean(card.askUsdNum)}` : card.ethPriceDisplay;
  const paySub = document.createElement("div");
  paySub.className = "text-[11px] font-mono text-emerald-300/85 mt-0.5";
  paySub.textContent = `${card.ethPriceDisplay} · 0% slippage`;
  payBox.appendChild(payTop);
  payBox.appendChild(payVal);
  payBox.appendChild(paySub);

  compareGrid.appendChild(spotBox);
  compareGrid.appendChild(payBox);
  body.appendChild(compareGrid);

  // 2B. Clean Left-Label / Right-Value Financial Rows
  const monthly = formatMonthlyFlow(card.weightWei, card.alreadyOnGrid);
  const pendingNaraWei =
    card.unsettledEpochs > 0n && liveNaraPerEpochWei > 0n && liveActiveModelWeightWei > 0n
      ? (card.unsettledEpochs * liveNaraPerEpochWei * card.weightWei) / liveActiveModelWeightWei
      : 0n;
  const totalLiveNaraWei = card.claimableNaraWei + pendingNaraWei;
  const epochLabel = liveEngineClock ? `Epoch #${liveEngineClock.currentWallEpoch.toString()}` : "Base 8453";

  let chestRightMain = "0.000 $NARA";
  let chestRightSub = !card.isMintedOnChain
    ? "Starts on mint"
    : liveEngineClock && card.activationEpoch != null && liveEngineClock.currentWallEpoch < card.activationEpoch
      ? `Activates Epoch #${card.activationEpoch.toString()}`
      : epochLabel;
  if (totalLiveNaraWei > 0n || card.claimableEthWei > 0n || card.claimableUsdcUnits > 0n) {
    chestRightMain = `+${formatDisplayNara(totalLiveNaraWei)} $NARA`;
    const extras = [];
    if (card.claimableEthWei > 0n) extras.push(`+${formatEthExact(card.claimableEthWei)} ETH`);
    if (card.claimableUsdcUnits > 0n) extras.push(`+$${formatUsdcExact(card.claimableUsdcUnits)}`);
    chestRightSub = extras.length > 0 ? extras.join(" · ") : `${epochLabel} · 100% yours`;
  }

  const rowsWrap = document.createElement("div");
  rowsWrap.className = "divide-y divide-white/[0.06] border-y border-white/[0.06]";

  const addKvRow = (leftTitle, leftSub, rightMain, rightSub, highlightRight = false) => {
    const row = document.createElement("div");
    row.className = "py-3 flex items-center justify-between gap-4";

    const lWrap = document.createElement("div");
    lWrap.className = "min-w-0";
    const lt = document.createElement("div");
    lt.className = "text-sm font-medium text-white";
    lt.textContent = leftTitle;
    const ls = document.createElement("div");
    ls.className = "text-xs text-slate-400 mt-0.5";
    ls.textContent = leftSub;
    lWrap.appendChild(lt);
    lWrap.appendChild(ls);

    const rWrap = document.createElement("div");
    rWrap.className = "text-right shrink-0";
    const rm = document.createElement("div");
    rm.className = highlightRight
      ? "text-sm font-mono font-bold text-emerald-300"
      : "text-sm font-mono font-semibold text-white";
    rm.textContent = rightMain;
    const rs = document.createElement("div");
    rs.className = "text-xs font-mono text-slate-400 mt-0.5";
    rs.textContent = rightSub;
    rWrap.appendChild(rm);
    rWrap.appendChild(rs);

    row.appendChild(lWrap);
    row.appendChild(rWrap);
    rowsWrap.appendChild(row);
  };

  addKvRow(
    "Monthly Pulses",
    "Paid every 15m · sell anytime",
    monthly ? monthly.primary.replace(/^Est\.\s*/, "") : "Loading…",
    monthly?.secondary || `${card.weightDisplay}x share`,
    true
  );
  addKvRow(
    "In Chest Now",
    "Transfers 100% to buyer",
    chestRightMain,
    chestRightSub,
    totalLiveNaraWei > 0n
  );
  addKvRow(
    "Exit Options",
    "Or resell receipt anytime",
    `100% after ${card.durationDays}d`,
    "0% maturity fee",
    false
  );

  body.appendChild(rowsWrap);

  // 2C. Visual 95% / 5% Ecosystem Split Bar
  const splitWrap = document.createElement("div");
  splitWrap.className = "space-y-2.5";

  const splitTitle = document.createElement("div");
  splitTitle.className = "text-xs font-medium text-slate-400";
  splitTitle.textContent = `Where your ${card.ethPriceDisplay} goes`;

  const barTrack = document.createElement("div");
  barTrack.className = "h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-0.5";
  const bar95 = document.createElement("div");
  bar95.className = "w-[95%] bg-emerald-400 rounded-l-full";
  const bar5 = document.createElement("div");
  bar5.className = "w-[5%] bg-sky-400 rounded-r-full";
  barTrack.appendChild(bar95);
  barTrack.appendChild(bar5);

  const totalPriceWei = card.priceWei ? BigInt(card.priceWei) : parseDecimalToWei18(String(card.askEthNum || 0));
  const holderFeeWei =
    (totalPriceWei * ANCHOR_SEAT_CONSTANTS.saleFeeBps) / ANCHOR_SEAT_CONSTANTS.bpsDenominator;
  const treasuryNetWei = totalPriceWei - holderFeeWei;
  const treasuryEth = formatEthExact(treasuryNetWei);
  const holderEth = formatEthExact(holderFeeWei);

  const legend = document.createElement("div");
  legend.className = "space-y-1.5 text-xs";

  const makeLegendRow = (dotColor, label, val) => {
    const r = document.createElement("div");
    r.className = "flex items-center justify-between gap-2";
    const l = document.createElement("span");
    l.className = "flex items-center gap-2 text-slate-300";
    const d = document.createElement("span");
    d.className = `w-2 h-2 rounded-full ${dotColor} shrink-0`;
    l.appendChild(d);
    l.appendChild(document.createTextNode(label));
    const v = document.createElement("span");
    v.className = "font-mono font-semibold text-white";
    v.textContent = val;
    r.appendChild(l);
    r.appendChild(v);
    return r;
  };

  legend.appendChild(makeLegendRow("bg-emerald-400", "Base Pool Liquidity", `95% · ${treasuryEth} ETH`));
  legend.appendChild(makeLegendRow("bg-sky-400", "Active Holders", `5% · ${holderEth} ETH`));

  splitWrap.appendChild(splitTitle);
  splitWrap.appendChild(barTrack);
  splitWrap.appendChild(legend);
  body.appendChild(splitWrap);

  if (card.state === "live") {
    const modalSelectBtn = document.createElement("button");
    modalSelectBtn.type = "button";
    modalSelectBtn.setAttribute("data-seat-select-btn", String(card.tokenId));
    modalSelectBtn.setAttribute("data-on-click", `selectAnchorSeat:${card.tokenId}`);
    modalSelectBtn.className =
      "w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-naraGreen hover:bg-[#52ff33] text-slate-950 text-sm font-bold cursor-pointer nara-press font-mono";
    modalSelectBtn.textContent = `Select Receipt #${card.tokenId} · ${card.ethPriceDisplay}`;
    body.appendChild(modalSelectBtn);
  }

  panel.appendChild(body);
  modal.appendChild(panel);
  bindActionsFn(modal);
  modalVisibilityChangeFn();
}

export function toggleCardHelp(e, tokenIdStr) {
  if (e && typeof e.stopPropagation === "function") e.stopPropagation();
  playClickFn();
  const tokenIdNum = Number(tokenIdStr);
  if (!Number.isInteger(tokenIdNum) || tokenIdNum <= 0) return;
  expandedHelpTokenId = expandedHelpTokenId === tokenIdNum ? null : tokenIdNum;
  renderSeatsGrid();
  modalVisibilityChangeFn();
}

export function setAnchorTierFilter(_e, modeStr) {
  playClickFn();
  const allowed = new Set(["featured", "all", "sprint", "starter", "core", "plus", "builder", "prime"]);
  const next = String(modeStr || "").toLowerCase();
  if (!allowed.has(next)) return;
  activeAnchorTierFilter = next;
  expandedHelpTokenId = null;
  renderSeatsGrid();
}

export function selectAnchorSeat(e, tokenIdStr) {
  if (e && typeof e.stopPropagation === "function") e.stopPropagation();
  playClickFn();
  const tokenIdNum = Number(tokenIdStr);
  if (!Number.isInteger(tokenIdNum) || !liveOffersByTokenId.has(tokenIdNum)) return;
  selectedReviewTokenId = tokenIdNum;
  expandedHelpTokenId = null;
  if (currentSeatStatus.kind === "error" || currentSeatStatus.kind === "warn") {
    setSeatStatus("idle", "");
  }
  renderSeatsGrid();
  renderReviewDrawer(true);
}

export function cancelSeatReview(e) {
  if (e && typeof e.stopPropagation === "function") e.stopPropagation();
  if (isBuyingSeat) return;
  playClickFn();
  selectedReviewTokenId = null;
  renderSeatsGrid();
}

export function copySeatLink(e, tokenIdStr) {
  if (e && typeof e.stopPropagation === "function") e.stopPropagation();
  playClickFn();
  const tokenIdNum = Number(tokenIdStr);
  const { directUrl } = buildMobileSeatWalletLinks(tokenIdNum);
  const fallbackCopy = (txt) => {
    if (typeof document === "undefined") return;
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      // Ignore fallback error
    }
    document.body.removeChild(ta);
  };
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(directUrl).catch(() => fallbackCopy(directUrl));
  } else {
    fallbackCopy(directUrl);
  }
  if (typeof document !== "undefined") {
    const btn = document.getElementById("copySeatLinkBtn");
    if (btn) {
      btn.textContent = `✓ Receipt #${tokenIdNum} Link Copied — Paste in Wallet Browser`;
      btn.classList.add("text-emerald-300", "border-emerald-400/40");
      setTimeout(() => {
        if (btn.isConnected) {
          btn.textContent = "Copy Link for Other Wallets (Rabby / Rainbow / Safe)";
          btn.classList.remove("text-emerald-300", "border-emerald-400/40");
        }
      }, 2800);
    }
  }
}

export function toggleAnchorSpecs(e) {
  if (e && typeof e.stopPropagation === "function") e.stopPropagation();
  playClickFn();
  const drawer = document.getElementById("anchorSpecsDrawer");
  const btn = document.getElementById("toggleAnchorSpecsBtn");
  if (!drawer) return;
  const willShow = drawer.classList.contains("hidden");
  drawer.classList.toggle("hidden", !willShow);
  if (btn) btn.setAttribute("aria-expanded", willShow ? "true" : "false");
}

export async function refreshAnchorSeats(showFeedback = false) {
  if (showFeedback) playClickFn();
  try {
    const safeLower = ANCHOR_SEAT_CONSTANTS.treasurySafe.toLowerCase();
    const saleLower = ANCHOR_SEAT_CONSTANTS.positionSale.toLowerCase();

    const headCalls = [
      { target: ANCHOR_SEAT_CONSTANTS.positionReceipt, allowFailure: true, callData: encodeMintedCountCall() },
      { target: ANCHOR_SEAT_CONSTANTS.positionSale, allowFailure: true, callData: encodeSellerNonceCall(ANCHOR_SEAT_CONSTANTS.treasurySafe) },
      { target: ANCHOR_SEAT_CONSTANTS.positionReceipt, allowFailure: true, callData: encodeIsApprovedForAllCall(ANCHOR_SEAT_CONSTANTS.treasurySafe, ANCHOR_SEAT_CONSTANTS.positionSale) },
      { target: ANCHOR_SEAT_CONSTANTS.rewardLedger, allowFailure: true, callData: encodeRewardStateCall() },
      { target: ANCHOR_SEAT_CONSTANTS.chainlinkEthUsd, allowFailure: true, callData: encodeChainlinkLatestRoundCall() },
      { target: V4_SWAP_CONSTANTS.poolManager, allowFailure: true, callData: encodeSlot0ExtsloadCall() },
      { target: ANCHOR_SEAT_CONSTANTS.principalLedger, allowFailure: true, callData: encodePrincipalAccountingCall() },
      { target: ANCHOR_SEAT_CONSTANTS.epochEngine, allowFailure: true, callData: encodeEmissionConfigCall() },
      { target: ANCHOR_SEAT_CONSTANTS.epochEngine, allowFailure: true, callData: encodeEmissionStateCall() },
      { target: ANCHOR_SEAT_CONSTANTS.epochEngine, allowFailure: true, callData: encodeFundingStateCall() },
      { target: ANCHOR_SEAT_CONSTANTS.epochEngine, allowFailure: true, callData: encodeEngineClockCall() },
    ];
    const headRes = await multicallRead(headCalls);
    if (headRes.length < 4 || !headRes[0].success || headRes[0].returnData.length < 66) {
      renderSeatsGrid();
      return;
    }

    const wallNowSec = BigInt(Math.floor(Date.now() / 1000));
    if (headRes[4]?.success) {
      const parsedEth = decodeChainlinkUsdPrice(headRes[4].returnData, 7200n, wallNowSec);
      if (parsedEth) liveEthUsd = parsedEth;
    }
    if (headRes[5]?.success) {
      const parsedSpot = decodeSlot0UsdPerNara(headRes[5].returnData);
      if (parsedSpot) liveSpotUsdPerNara = parsedSpot;
    }
    if (headRes[10]?.success) {
      const parsedClk = decodeEngineClockResult(headRes[10].returnData);
      if (parsedClk) liveEngineClock = parsedClk;
    }

    const rewardStateFull = headRes[3]?.success ? decodeRewardStateFull(headRes[3].returnData) : null;
    const pAcc = headRes[6]?.success ? decodePrincipalAccountingResult(headRes[6].returnData) : null;
    const emCfg = headRes[7]?.success ? decodeEmissionConfigResult(headRes[7].returnData) : null;
    const emSt = headRes[8]?.success ? decodeEmissionStateResult(headRes[8].returnData) : null;
    const eligRes = headRes[9]?.success ? decodeFundingStateEligibleReserve(headRes[9].returnData) : null;

    if (pAcc) {
      liveOpenedEpoch = pAcc.openedEpoch;
    }
    if (rewardStateFull && pAcc && emCfg && emSt && eligRes !== null) {
      liveActiveModelWeightWei = pAcc.activeModelWeight;
      liveNaraPerEpochWei = computeLiveNaraPerEpochWei({
        config: emCfg,
        emissionState: emSt,
        principalSnapshot: pAcc.principalSnapshot,
        protectedNaraSnapshot: rewardStateFull.protectedNaraSnapshot,
        eligibleReserve: eligRes,
        naraAdmissionHeadroom: rewardStateFull.naraAdmissionHeadroom,
        activeModelWeight: pAcc.activeModelWeight,
        activeRewardWeight: pAcc.activeRewardWeight,
      });
    }

    // Background-refresh real Uniswap V4 Hook execution quotes once per 60s ONLY when #anchorSeatsGrid is mounted (/vault)
    const hasGrid = typeof document !== "undefined" && Boolean(document.getElementById("anchorSeatsGrid"));
    if (hasGrid && typeof window !== "undefined" && Date.now() - lastDexQuoteFetchMs > 60_000) {
      lastDexQuoteFetchMs = Date.now();
      Promise.all(
        WAVE_1_TIERS.map(async (t) => {
          try {
            const res = await fetch(`/api/quote?direction=buy&asset=ETH&amount=${encodeURIComponent(t.askEth)}`);
            if (!res.ok) return null;
            const j = await res.json();
            const out = Number(j?.expectedOut);
            return Number.isFinite(out) && out > 0 ? [t.askEth, out] : null;
          } catch {
            return null;
          }
        })
      ).then((entries) => {
        let updated = false;
        for (const pair of entries) {
          if (pair) {
            liveDexOutNaraByEth.set(pair[0], pair[1]);
            updated = true;
          }
        }
        if (updated) renderSeatsGrid();
      });
    }

    const mintedCount = Number(BigInt(headRes[0].returnData));
    const currentSafeSellerNonce =
      headRes[1].success && headRes[1].returnData.length >= 66 ? BigInt(headRes[1].returnData) : 0n;
    const isOperatorApproved =
      headRes[2].success && headRes[2].returnData.length >= 66 ? BigInt(headRes[2].returnData) !== 0n : false;
    const nextCheckpoint = rewardStateFull ? rewardStateFull.nextCheckpoint : 0n;

    const maxScan = Math.min(mintedCount, 256);
    if (maxScan <= 0) {
      renderSeatsGrid();
      return;
    }

    const scanCalls = [];
    for (let tid = 1; tid <= maxScan; tid++) {
      scanCalls.push({
        target: ANCHOR_SEAT_CONSTANTS.positionSale,
        allowFailure: true,
        callData: encodeListingCall(tid),
      });
      scanCalls.push({
        target: ANCHOR_SEAT_CONSTANTS.positionReceipt,
        allowFailure: true,
        callData: encodeOwnerOfCall(tid),
      });
      scanCalls.push({
        target: ANCHOR_SEAT_CONSTANTS.positionReceipt,
        allowFailure: true,
        callData: encodeGetApprovedCall(tid),
      });
      scanCalls.push({
        target: ANCHOR_SEAT_CONSTANTS.positionReceipt,
        allowFailure: true,
        callData: encodeReceiptTransferNonceCall(tid),
      });
    }

    const scanRes = await multicallRead(scanCalls);
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const candidates = [];
    const bakingTokenIds = [];
    const expiredTokenIds = [];
    const soldCandidateIds = [];
    const nextStrangerSet = new Set();

    for (let tid = 1; tid <= maxScan; tid++) {
      const baseIdx = (tid - 1) * 4;
      const listR = scanRes[baseIdx];
      const ownerR = scanRes[baseIdx + 1];
      const apprR = scanRes[baseIdx + 2];
      const xferR = scanRes[baseIdx + 3];

      const ownerAddr =
        ownerR?.success && ownerR.returnData.length >= 66
          ? "0x" + strip0x(ownerR.returnData).slice(24)
          : "";
      const tNonce =
        xferR?.success && xferR.returnData.length >= 66 ? BigInt(xferR.returnData) : 0n;

      const isWaveRange = tid >= ANCHOR_SEAT_CONSTANTS.cohort1FirstTokenId;

      const offer = listR?.success ? decodeListingResult(listR.returnData) : null;
      const approvedAddr =
        apprR?.success && apprR.returnData.length >= 66
          ? "0x" + strip0x(apprR.returnData).slice(24)
          : "";
      const isApproved = isOperatorApproved || approvedAddr.toLowerCase() === saleLower;

      const isLiveOffer =
        offer &&
        offer.listingId !== 0n &&
        offer.seller.toLowerCase() === safeLower &&
        offer.sellerNonce === currentSafeSellerNonce &&
        offer.expiry > nowSec &&
        ownerAddr.toLowerCase() === safeLower &&
        isApproved;

      if (isLiveOffer) {
        candidates.push(offer);
      } else if (isWaveRange && ownerAddr && ownerAddr.toLowerCase() === safeLower) {
        if (offer && offer.listingId !== 0n && offer.seller.toLowerCase() === safeLower && offer.expiry <= nowSec) {
          expiredTokenIds.push(tid);
        } else {
          bakingTokenIds.push(tid);
        }
      } else if (isWaveRange && ownerAddr && ownerAddr.toLowerCase() !== safeLower) {
        if (tNonce === 0n) {
          // Minted directly to a non-Safe wallet (tNonce == 0) => organic user commitment, never a Treasury Wave seat
          nextStrangerSet.add(tid);
        } else {
          soldCandidateIds.push(tid);
        }
      }
    }

    const nextLiveMap = new Map();
    if (candidates.length > 0) {
      const detailCalls = [];
      for (const offer of candidates) {
        detailCalls.push({
          target: ANCHOR_SEAT_CONSTANTS.principalLedger,
          allowFailure: true,
          callData: encodePositionHeadCall(offer.positionId),
        });
        detailCalls.push({
          target: ANCHOR_SEAT_CONSTANTS.principalLedger,
          allowFailure: true,
          callData: encodeRarityTierCall(offer.positionId, offer.generation),
        });
        for (let assetIdx = 0; assetIdx < 3; assetIdx++) {
          detailCalls.push({
            target: ANCHOR_SEAT_CONSTANTS.rewardLens,
            allowFailure: true,
            callData: encodeRewardCreditCall(
              ANCHOR_SEAT_CONSTANTS.rewardLedger,
              offer.positionId,
              offer.generation,
              assetIdx
            ),
          });
        }
      }
      const detailRes = await multicallRead(detailCalls);
      for (let i = 0; i < candidates.length; i++) {
        const offer = candidates[i];
        const base = i * 5;
        const posR = detailRes[base];
        const tierR = detailRes[base + 1];
        const credNaraR = detailRes[base + 2];
        const credEthR = detailRes[base + 3];
        const credUsdcR = detailRes[base + 4];

        const pos = posR?.success ? decodePositionHeadResult(posR.returnData) : null;
        if (!pos || pos.withdrawn || pos.principal === 0n || pos.effectiveEnd !== pos.maturity) continue;

        const rarityTier = tierR?.success ? decodeRarityTierResult(tierR.returnData) : 0n;
        const credNaraFull = credNaraR?.success ? decodeRewardCreditFull(credNaraR.returnData) : null;
        const claimableNaraWei = credNaraFull ? credNaraFull.claimable : 0n;
        const claimableEthWei = credEthR?.success ? decodeRewardCreditClaimable(credEthR.returnData) : 0n;
        const claimableUsdcUnits = credUsdcR?.success ? decodeRewardCreditClaimable(credUsdcR.returnData) : 0n;

        nextLiveMap.set(Number(offer.tokenId), {
          tokenId: offer.tokenId,
          listingId: offer.listingId,
          positionId: offer.positionId,
          generation: offer.generation,
          priceWei: offer.price,
          expiry: offer.expiry,
          principalWei: pos.principal,
          rewardWeightWei: pos.rewardWeight,
          durationEpochs: pos.duration,
          activationEpoch: pos.activation,
          maturityEpoch: pos.maturity,
          rarityTier,
          nextCheckpoint,
          claimableNaraWei,
          claimableEthWei,
          claimableUsdcUnits,
          unsettledEpochs: credNaraFull ? credNaraFull.unsettledEpochs : 0n,
        });
      }
    }

    const nextBakingMap = new Map();
    const nextExpiredMap = new Map();
    const nextSoldMap = new Map();
    const nextSoldSet = new Set();

    const inspectIds = [
      ...bakingTokenIds.map((tid) => ({ tid, kind: "baking" })),
      ...expiredTokenIds.map((tid) => ({ tid, kind: "expired" })),
      ...soldCandidateIds.map((tid) => ({ tid, kind: "sold" })),
    ];
    if (inspectIds.length > 0) {
      const inspectCalls = inspectIds.map(({ tid }) => ({
        target: ANCHOR_SEAT_CONSTANTS.principalLedger,
        allowFailure: true,
        callData: encodePositionHeadCall(tid),
      }));
      const inspectPosRes = await multicallRead(inspectCalls);
      const validInspect = [];
      for (let i = 0; i < inspectIds.length; i++) {
        const pos = inspectPosRes[i]?.success ? decodePositionHeadResult(inspectPosRes[i].returnData) : null;
        if (!pos || pos.principal === 0n) continue;
        const cls = classifyWave1Tier(pos.principal, pos.duration);
        // Ignore Safe working reserves (#45..#47: 300+ NARA @ 3d/6d/10d) and non-Wave stranger positions
        if (!cls.matchedWaveTier) {
          if (inspectIds[i].kind === "sold") nextStrangerSet.add(inspectIds[i].tid);
          continue;
        }
        if (inspectIds[i].kind !== "sold" && pos.withdrawn) continue;
        validInspect.push({ ...inspectIds[i], pos });
      }
      if (validInspect.length > 0) {
        const creditCalls = [];
        for (const item of validInspect) {
          for (let assetIdx = 0; assetIdx < 3; assetIdx++) {
            creditCalls.push({
              target: ANCHOR_SEAT_CONSTANTS.rewardLens,
              allowFailure: true,
              callData: encodeRewardCreditCall(
                ANCHOR_SEAT_CONSTANTS.rewardLedger,
                item.tid,
                item.pos.generation,
                assetIdx
              ),
            });
          }
        }
        const creditRes = await multicallRead(creditCalls);
        for (let i = 0; i < validInspect.length; i++) {
          const { tid, kind, pos } = validInspect[i];
          const b = i * 3;
          const credNaraFull = creditRes[b]?.success ? decodeRewardCreditFull(creditRes[b].returnData) : null;
          const record = {
            tokenId: BigInt(tid),
            principalWei: pos.principal,
            rewardWeightWei: pos.rewardWeight,
            durationEpochs: pos.duration,
            activationEpoch: pos.activation,
            maturityEpoch: pos.maturity,
            claimableNaraWei: credNaraFull ? credNaraFull.claimable : 0n,
            claimableEthWei: creditRes[b + 1]?.success ? decodeRewardCreditClaimable(creditRes[b + 1].returnData) : 0n,
            claimableUsdcUnits: creditRes[b + 2]?.success ? decodeRewardCreditClaimable(creditRes[b + 2].returnData) : 0n,
            unsettledEpochs: credNaraFull ? credNaraFull.unsettledEpochs : 0n,
          };
          if (kind === "baking") nextBakingMap.set(tid, record);
          else if (kind === "expired") nextExpiredMap.set(tid, record);
          else if (kind === "sold") {
            nextSoldMap.set(tid, record);
            nextSoldSet.add(tid);
          }
        }
      }
    }

    liveOffersByTokenId = nextLiveMap;
    bakingReceiptsByTokenId = nextBakingMap;
    expiredReceiptsByTokenId = nextExpiredMap;
    soldReceiptsByTokenId = nextSoldMap;
    soldCohortTokenIds = nextSoldSet;
    strangerMintedTokenIds = nextStrangerSet;

    // Auto-open ?seat=<id> deep-link when arriving inside a mobile wallet browser
    if (pendingAutoSelectSeatId != null && nextLiveMap.size > 0) {
      const requestedId = pendingAutoSelectSeatId;
      pendingAutoSelectSeatId = null;
      if (nextLiveMap.has(requestedId)) {
        selectedReviewTokenId = requestedId;
      } else {
        const refMatch = COHORT_1_REFERENCE_SEATS.find((r) => r.tokenId === requestedId);
        let fallbackId = null;
        if (refMatch) {
          for (const [tid, off] of nextLiveMap.entries()) {
            const c = classifyWave1Tier(off.principalWei, off.durationEpochs);
            if (c.tierKey === refMatch.tierKey) {
              fallbackId = tid;
              break;
            }
          }
        }
        if (fallbackId == null) {
          fallbackId = [...nextLiveMap.keys()].sort((a, b) => a - b)[0] ?? null;
        }
        if (fallbackId != null) {
          selectedReviewTokenId = fallbackId;
          setSeatStatus("info", `Receipt #${requestedId} was already claimed — opened next available Receipt #${fallbackId}.`);
        }
      }
    }

    renderSeatsGrid();
  } catch {
    renderSeatsGrid();
  }
}

async function ensureWalletOnBase(provider) {
  const hex = await provider.request({ method: "eth_chainId" });
  if (parseInt(String(hex), 16) === ANCHOR_SEAT_CONSTANTS.chainId) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_CHAIN_ID_HEX,
            chainName: "Base",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

async function readChainTimestampSec(provider) {
  try {
    const blk = await provider.request({ method: "eth_getBlockByNumber", params: ["latest", false] });
    if (blk?.timestamp) return BigInt(blk.timestamp);
  } catch {
    // Fall back to public RPC block read
  }
  try {
    const blk = await publicBaseRpcRequest("eth_getBlockByNumber", ["latest", false]);
    if (blk?.timestamp) return BigInt(blk.timestamp);
  } catch {
    // Non-fatal fallback to wall clock
  }
  return 0n;
}

async function waitForTxReceipt(provider, txHash, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = await provider
      .request({ method: "eth_getTransactionReceipt", params: [txHash] })
      .catch(() => baseRpcRequest("eth_getTransactionReceipt", [txHash]).catch(() => null));
    if (receipt && receipt.status != null) {
      if (receipt.status === "0x1" || receipt.status === 1 || receipt.status === "1") return receipt;
      throw new Error("Seat purchase transaction reverted on Base.");
    }
    await new Promise((r) => setTimeout(r, 1400));
  }
  throw new Error("Transaction submitted — awaiting Base block confirmation.");
}

export async function buyAnchorSeat(_e, rawArg) {
  if (isBuyingSeat) return;
  playClickFn();

  const [tokenIdStr, preferredWalletId = ""] = String(rawArg ?? "").split("|");
  const tokenIdNum = Number(tokenIdStr);
  if (!Number.isInteger(tokenIdNum) || tokenIdNum <= 0) return;

  let provider = getConnectedWalletProvider();
  let buyer = getConnectedAccount();
  if (!provider || !isValidAddress(buyer) || preferredWalletId) {
    try {
      setSeatStatus("info", `Connecting Base wallet for Receipt #${tokenIdNum}…`);
      const connected = await connectWalletDirect(preferredWalletId);
      if (!connected || !connected.provider || !isValidAddress(connected.account)) {
        setSeatStatus(
          "info",
          `No injected browser wallet detected in this app — tap MetaMask, Coinbase / Base, Phantom, or Trust Wallet above to open Receipt #${tokenIdNum} directly in your wallet.`
        );
        renderReviewDrawer(true);
        return;
      }
      provider = connected.provider;
      buyer = connected.account;
      renderReviewDrawer(true);
    } catch (connErr) {
      const code = connErr?.code ?? connErr?.data?.originalError?.code;
      const msg = String(connErr?.shortMessage || connErr?.message || "Wallet connection cancelled.");
      if (code === 4001 || /user rejected|user denied|cancelled/i.test(msg)) {
        setSeatStatus("warn", "Wallet connection cancelled.");
      } else {
        setSeatStatus("error", msg.slice(0, 180));
      }
      renderReviewDrawer(true);
      return;
    }
  }

  if (buyer.toLowerCase() === ANCHOR_SEAT_CONSTANTS.treasurySafe.toLowerCase()) {
    setSeatStatus("error", "Seller wallet cannot self-purchase its own Anchor Seat listing.");
    return;
  }

  const cachedPreview = liveOffersByTokenId.get(tokenIdNum) || null;
  const expectedPriceWei = cachedPreview ? cachedPreview.priceWei : null;

  isBuyingSeat = true;
  activeBuyingTokenId = tokenIdNum;
  renderSeatsGrid();

  try {
    setSeatStatus("info", `Switching wallet to Base Mainnet and cross-verifying Receipt #${tokenIdNum}…`);
    await ensureWalletOnBase(provider);

    // Step 1: Single atomic 12-call Multicall3 pre-sign read (prevents block-split race across keeper advance())
    const guessPosId = cachedPreview?.positionId ?? BigInt(tokenIdNum);
    const guessGen = cachedPreview?.generation ?? 1n;
    const [preSignRes, quorumRes, chainNowSec] = await Promise.all([
      multicallRead([
        { target: ANCHOR_SEAT_CONSTANTS.positionSale, allowFailure: true, callData: encodeListingCall(tokenIdNum) },
        { target: ANCHOR_SEAT_CONSTANTS.positionReceipt, allowFailure: true, callData: encodeOwnerOfCall(tokenIdNum) },
        { target: ANCHOR_SEAT_CONSTANTS.positionReceipt, allowFailure: true, callData: encodeReceiptTransferNonceCall(tokenIdNum) },
        { target: ANCHOR_SEAT_CONSTANTS.positionSale, allowFailure: true, callData: encodeSellerNonceCall(ANCHOR_SEAT_CONSTANTS.treasurySafe) },
        { target: ANCHOR_SEAT_CONSTANTS.positionReceipt, allowFailure: true, callData: encodeIsApprovedForAllCall(ANCHOR_SEAT_CONSTANTS.treasurySafe, ANCHOR_SEAT_CONSTANTS.positionSale) },
        { target: ANCHOR_SEAT_CONSTANTS.positionReceipt, allowFailure: true, callData: encodeGetApprovedCall(tokenIdNum) },
        { target: ANCHOR_SEAT_CONSTANTS.rewardLedger, allowFailure: true, callData: encodeRewardStateCall() },
        { target: ANCHOR_SEAT_CONSTANTS.principalLedger, allowFailure: true, callData: encodePositionHeadCall(guessPosId) },
        { target: ANCHOR_SEAT_CONSTANTS.principalLedger, allowFailure: true, callData: encodeRarityTierCall(guessPosId, guessGen) },
        { target: ANCHOR_SEAT_CONSTANTS.rewardLens, allowFailure: true, callData: encodeRewardCreditCall(ANCHOR_SEAT_CONSTANTS.rewardLedger, guessPosId, guessGen, 0) },
        { target: ANCHOR_SEAT_CONSTANTS.rewardLens, allowFailure: true, callData: encodeRewardCreditCall(ANCHOR_SEAT_CONSTANTS.rewardLedger, guessPosId, guessGen, 1) },
        { target: ANCHOR_SEAT_CONSTANTS.rewardLens, allowFailure: true, callData: encodeRewardCreditCall(ANCHOR_SEAT_CONSTANTS.rewardLedger, guessPosId, guessGen, 2) },
      ]),
      multicallRead(
        [{ target: ANCHOR_SEAT_CONSTANTS.positionSale, allowFailure: true, callData: encodeListingCall(tokenIdNum) }],
        true
      ).catch(() => []),
      readChainTimestampSec(provider),
    ]);

    const freshOffer = preSignRes[0]?.success ? decodeListingResult(preSignRes[0].returnData) : null;
    if (!freshOffer || freshOffer.listingId === 0n) {
      await refreshAnchorSeats(false);
      throw new Error(`Seat #${tokenIdNum} was just claimed or is no longer active.`);
    }

    const quorumOffer = quorumRes[0]?.success ? decodeListingResult(quorumRes[0].returnData) : null;
    const ownerAddr =
      preSignRes[1]?.success && preSignRes[1].returnData.length >= 66
        ? "0x" + strip0x(preSignRes[1].returnData).slice(24)
        : "";
    const receiptTransferNonce =
      preSignRes[2]?.success && preSignRes[2].returnData.length >= 66 ? BigInt(preSignRes[2].returnData) : null;
    const currentSafeSellerNonce =
      preSignRes[3]?.success && preSignRes[3].returnData.length >= 66 ? BigInt(preSignRes[3].returnData) : 0n;
    const isOperatorApproved =
      preSignRes[4]?.success && preSignRes[4].returnData.length >= 66 ? BigInt(preSignRes[4].returnData) !== 0n : false;
    const approvedAddr =
      preSignRes[5]?.success && preSignRes[5].returnData.length >= 66
        ? "0x" + strip0x(preSignRes[5].returnData).slice(24)
        : "";
    const isApproved =
      isOperatorApproved || approvedAddr.toLowerCase() === ANCHOR_SEAT_CONSTANTS.positionSale.toLowerCase();
    let nextCheckpoint = preSignRes[6]?.success ? decodeRewardStateNextCheckpoint(preSignRes[6].returnData) : 0n;

    let backingSlice = preSignRes.slice(7, 12);
    if (freshOffer.positionId !== guessPosId || freshOffer.generation !== guessGen) {
      const fallbackRes = await multicallRead([
        { target: ANCHOR_SEAT_CONSTANTS.rewardLedger, allowFailure: true, callData: encodeRewardStateCall() },
        { target: ANCHOR_SEAT_CONSTANTS.principalLedger, allowFailure: true, callData: encodePositionHeadCall(freshOffer.positionId) },
        { target: ANCHOR_SEAT_CONSTANTS.principalLedger, allowFailure: true, callData: encodeRarityTierCall(freshOffer.positionId, freshOffer.generation) },
        { target: ANCHOR_SEAT_CONSTANTS.rewardLens, allowFailure: true, callData: encodeRewardCreditCall(ANCHOR_SEAT_CONSTANTS.rewardLedger, freshOffer.positionId, freshOffer.generation, 0) },
        { target: ANCHOR_SEAT_CONSTANTS.rewardLens, allowFailure: true, callData: encodeRewardCreditCall(ANCHOR_SEAT_CONSTANTS.rewardLedger, freshOffer.positionId, freshOffer.generation, 1) },
        { target: ANCHOR_SEAT_CONSTANTS.rewardLens, allowFailure: true, callData: encodeRewardCreditCall(ANCHOR_SEAT_CONSTANTS.rewardLedger, freshOffer.positionId, freshOffer.generation, 2) },
      ]);
      if (fallbackRes[0]?.success) nextCheckpoint = decodeRewardStateNextCheckpoint(fallbackRes[0].returnData);
      backingSlice = fallbackRes.slice(1, 6);
    }

    const pos = backingSlice[0]?.success ? decodePositionHeadResult(backingSlice[0].returnData) : null;
    const rarityTier = backingSlice[1]?.success ? decodeRarityTierResult(backingSlice[1].returnData) : 0n;
    const claimableTriplet = [
      backingSlice[2]?.success ? decodeRewardCreditClaimable(backingSlice[2].returnData) : 0n,
      backingSlice[3]?.success ? decodeRewardCreditClaimable(backingSlice[3].returnData) : 0n,
      backingSlice[4]?.success ? decodeRewardCreditClaimable(backingSlice[4].returnData) : 0n,
    ];

    const bounds = verifyAndBuildSeatBounds({
      tokenId: tokenIdNum,
      expectedPriceWei,
      freshOffer,
      quorumOffer,
      ownerAddr,
      receiptTransferNonce,
      currentSafeSellerNonce,
      isApproved,
      pos,
      rarityTier,
      claimableTriplet,
      nextCheckpoint,
      wallNowSec: BigInt(Math.floor(Date.now() / 1000)),
      chainNowSec,
      buyer,
    });

    const balHex = await provider
      .request({ method: "eth_getBalance", params: [buyer, "latest"] })
      .catch(() => baseRpcRequest("eth_getBalance", [buyer, "latest"]));
    const ethBalWei = typeof balHex === "string" && balHex.startsWith("0x") ? BigInt(balHex) : 0n;
    if (ethBalWei < freshOffer.price + SEAT_GAS_BUFFER_WEI) {
      throw new Error(
        `Insufficient Base ETH: need ${formatEthExact(freshOffer.price)} ETH + ~0.0001 ETH gas (wallet has ${formatEthExact(ethBalWei)} ETH).`
      );
    }

    const calldata = encodePurchaseCall(BigInt(tokenIdNum), bounds);
    const valueHex = "0x" + freshOffer.price.toString(16);

    const txReq = {
      chainId: BASE_CHAIN_ID_HEX,
      from: buyer,
      to: ANCHOR_SEAT_CONSTANTS.positionSale,
      data: calldata,
      value: valueHex,
    };

    const txReqWithAttribution = {
      ...txReq,
      data: appendErc8021DataSuffix(txReq.data, BASE_BUILDER_CODE),
    };

    // Step 3: Strict fail-closed eth_call simulation before any wallet prompt
    setSeatStatus("info", `Simulating Receipt #${tokenIdNum} acquisition with full 3-asset BuyerBounds…`);
    await simulateSeatPurchaseFailClosed(provider, {
      from: buyer,
      to: txReqWithAttribution.to,
      data: txReqWithAttribution.data,
      value: txReqWithAttribution.value,
    });

    setSeatStatus(
      "info",
      `Simulation passed ✓ Confirm ${formatEthExact(freshOffer.price)} ETH acquisition of Receipt #${tokenIdNum} in your wallet.`
    );
    const sendCallsRes = await trySendCallsWithErc8021({
      provider,
      chainIdHex: BASE_CHAIN_ID_HEX,
      from: buyer,
      calls: [{ to: txReq.to, value: txReq.value, data: txReq.data }],
      codesInput: BASE_BUILDER_CODE,
      onSubmitted: () => {
        setSeatStatus("info", `Broadcasted Receipt #${tokenIdNum} — confirming on Base…`);
      },
    });
    let txHash = sendCallsRes.usedSendCalls ? sendCallsRes.txHash : null;
    if (!txHash) {
      txHash = await provider.request({
        method: "eth_sendTransaction",
        params: [txReqWithAttribution],
      });

      setSeatStatus("info", `Broadcasted ${txHash.slice(0, 10)}… Confirming Receipt #${tokenIdNum} on Base…`, txHash);
      await waitForTxReceipt(provider, txHash);
    }

    playSuccessFn();
    selectedReviewTokenId = null;
    const confirmedDays = pos ? Math.max(1, Math.round(pos.duration / 96)) : 365;
    const confirmedWeight = pos ? formatDisplayNara(pos.rewardWeight) : "4.00";
    setSeatStatus(
      "success",
      `✓ Vault Receipt #${tokenIdNum} (${formatDisplayNara(bounds.minPrincipal)} $NARA · ${confirmedDays}D · ${confirmedWeight}x share) confirmed in your wallet.`,
      txHash
    );
    await refreshAnchorSeats(false);
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    const raw = String(err?.shortMessage || err?.message || "Purchase failed");
    if (code === 4001 || /user rejected|user denied|cancelled/i.test(raw)) {
      setSeatStatus("warn", "Signature cancelled in wallet.");
    } else {
      await refreshAnchorSeats(false).catch(() => {});
      setSeatStatus("error", raw.slice(0, 200));
    }
  } finally {
    isBuyingSeat = false;
    activeBuyingTokenId = null;
    renderSeatsGrid();
  }
}

export function getAnchorShowcaseSummary() {
  const activeCount = liveOffersByTokenId.size;
  let totalAccruedNaraWei = 0n;
  let minPriceWei = null;
  let bestEthPerNara = null;
  for (const offer of liveOffersByTokenId.values()) {
    totalAccruedNaraWei += offer.claimableNaraWei || 0n;
    if (minPriceWei === null || offer.priceWei < minPriceWei) {
      minPriceWei = offer.priceWei;
    }
    const pNum = Number(formatUnits(offer.principalWei, 18));
    const eNum = Number(formatUnits(offer.priceWei, 18));
    if (pNum > 0 && eNum > 0) {
      const ratio = eNum / pNum;
      if (bestEthPerNara === null || ratio < bestEthPerNara) bestEthPerNara = ratio;
    }
  }
  if (bestEthPerNara === null) {
    const primeTier = WAVE_1_TIERS[WAVE_1_TIERS.length - 1];
    bestEthPerNara = Number(primeTier.askEth) / Number(primeTier.nara);
  }
  for (const b of bakingReceiptsByTokenId.values()) {
    totalAccruedNaraWei += b.claimableNaraWei || 0n;
  }
  const spotEthPerNara =
    liveEthUsd && liveSpotUsdPerNara && liveEthUsd > 0 ? liveSpotUsdPerNara / liveEthUsd : null;
  const maxDiscountPct =
    liveEthUsd && liveSpotUsdPerNara && liveSpotUsdPerNara > 0
      ? Math.max(0, Math.round((1 - (bestEthPerNara * liveEthUsd) / liveSpotUsdPerNara) * 100))
      : null;
  return {
    activeCount,
    claimedCount: Math.min(COHORT_1_REFERENCE_SEATS.length, soldCohortTokenIds.size),
    totalWaveSeats: COHORT_1_REFERENCE_SEATS.length,
    ethUsd: liveEthUsd,
    spotUsdPerNara: liveSpotUsdPerNara,
    spotEthPerNara,
    maxDiscountPct,
    minEthDisplay: minPriceWei !== null ? formatEthExact(minPriceWei) : WAVE_1_TIERS[0].askEth,
    totalAccruedNaraDisplay: totalAccruedNaraWei > 0n ? formatDisplayNara(totalAccruedNaraWei) : null,
  };
}

export function jumpToAnchorSeats() {
  playClickFn();
  const el = document.getElementById("anchorSeatsSection");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

let outsideListenersBound = false;

export function initAnchorSeats({ bindActions, playClick, playSuccess, onModalVisibilityChange } = {}) {
  if (typeof bindActions === "function") bindActionsFn = bindActions;
  if (typeof playClick === "function") playClickFn = playClick;
  if (typeof playSuccess === "function") playSuccessFn = playSuccess;
  if (typeof onModalVisibilityChange === "function") modalVisibilityChangeFn = onModalVisibilityChange;

  // Capture ?seat=<id> deep-link from mobile wallet handoff (e.g. /vault?seat=16)
  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      const rawSeat = url.searchParams.get("seat");
      if (rawSeat && /^\d+$/.test(rawSeat)) {
        const parsedSeat = Number(rawSeat);
        if (parsedSeat > 0 && parsedSeat <= 10_000) {
          pendingAutoSelectSeatId = parsedSeat;
        }
        url.searchParams.delete("seat");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch {
      // Ignore malformed URL
    }
  }

  onWalletStateChange(() => {
    if (selectedReviewTokenId !== null && !isBuyingSeat) {
      renderReviewDrawer(true);
    }
  });

  if (!outsideListenersBound && typeof document !== "undefined") {
    outsideListenersBound = true;
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (
        expandedHelpTokenId !== null &&
        (!target || typeof target.closest !== "function" || !target.closest("[data-card-help-box], [data-card-help-btn]"))
      ) {
        expandedHelpTokenId = null;
        renderSeatsGrid();
        modalVisibilityChangeFn();
      }
      if (
        selectedReviewTokenId !== null &&
        !isBuyingSeat &&
        (!target || typeof target.closest !== "function" || !target.closest("[data-seat-review-box], [data-seat-select-btn]"))
      ) {
        selectedReviewTokenId = null;
        renderSeatsGrid();
        modalVisibilityChangeFn();
      }
      const specsDrawer = document.getElementById("anchorSpecsDrawer");
      if (
        specsDrawer &&
        !specsDrawer.classList.contains("hidden") &&
        (!target || typeof target.closest !== "function" || !target.closest("#anchorSpecsDrawer, #toggleAnchorSpecsBtn"))
      ) {
        specsDrawer.classList.add("hidden");
        const specsBtn = document.getElementById("toggleAnchorSpecsBtn");
        if (specsBtn) specsBtn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (expandedHelpTokenId !== null) {
        expandedHelpTokenId = null;
        renderSeatsGrid();
        modalVisibilityChangeFn();
      }
      if (selectedReviewTokenId !== null && !isBuyingSeat) {
        selectedReviewTokenId = null;
        renderSeatsGrid();
        modalVisibilityChangeFn();
      }
      const specsDrawer = document.getElementById("anchorSpecsDrawer");
      if (specsDrawer && !specsDrawer.classList.contains("hidden")) {
        specsDrawer.classList.add("hidden");
        const specsBtn = document.getElementById("toggleAnchorSpecsBtn");
        if (specsBtn) specsBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  const hasGrid = typeof document !== "undefined" && Boolean(document.getElementById("anchorSeatsGrid"));
  renderSeatsGrid();
  refreshAnchorSeats(false);

  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (hasGrid) {
    countdownTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (selectedReviewTokenId != null) {
        const selOffer = liveOffersByTokenId.get(selectedReviewTokenId);
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        if (!selOffer || selOffer.expiry <= nowSec) {
          liveOffersByTokenId.delete(selectedReviewTokenId);
          selectedReviewTokenId = null;
          renderSeatsGrid();
          return;
        }
        // Update ONLY the expiry text node in place — NEVER recreate button DOM under mobile touch taps!
        const expEl = typeof document !== "undefined" ? document.getElementById("anchorReviewExpiryText") : null;
        if (expEl) expEl.textContent = formatExpiryShort(selOffer.expiry);
      }
      updateHeaderBadge();
    }, 1000);
  }

  setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    refreshAnchorSeats(false);
  }, hasGrid ? 25000 : 120000);
}
