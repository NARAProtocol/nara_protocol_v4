/**
 * NARA Two-Sided Stabilizer — PHASE 1 SHADOW MODE
 * ================================================
 *
 * Watches both sides of the canonical v4 NARA/USDC pool through the hook's
 * PoolFeeTaken stream and SIMULATES defensive interventions without sending
 * any transactions:
 *
 *   Pump side  — external buy >= V4_PUMP_TRIGGER_USDC:
 *       would sell the hedge bucket into the pump (same economics as tonight's
 *       proven big-buy hedge), reporting projected proceeds vs basis cost.
 *
 *   Floor side — external sell >= V4_DUMP_TRIGGER_USDC equivalent:
 *       would spend up to V4_DEFENSE_USDC_CAP buying into the dump, reporting
 *       entry net of fees and profit-if-recovery at the pre-dump mid.
 *
 * Every simulation is appended to deployments/stabilizer-shadow.jsonl and
 * summarized on shutdown. This runner NEVER trades in Phase 1: --live exits
 * with instructions until Phase 2 wiring lands.
 *
 * Community guarantees encoded here:
 *   - Threshold gates: small holders' trades are never reacted to.
 *   - The stabilizer pays the same tiered hook fees as everyone else.
 *   - All activity is public onchain + this ledger, fully auditable.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { canonicalProductionV4Deployment } from "../lib/v4LiveConfig.js";
import {
  planPumpHedgeAmount,
  planStabilizerScan,
} from "./stabilizerScanRange.js";
import {
  calculateDumpUsdcValue,
  calculateFloorRecoveryEdge,
  planFloorDefenseBudget,
} from "./stabilizerFloorDefense.js";
import {
  shouldRecordTriggerSkip,
  type StabilizerTriggerSide,
} from "./stabilizerFloorTriggerDedup.js";
import {
  aggregateStabilizerTransactionFlows,
  aggregateStabilizerTriggers,
  type StabilizerTriggerAction,
  type StabilizerTransactionFlow,
} from "./v4StabilizerTriggerAggregation.js";
import {
  BASE_V4_QUOTER,
  midUsdcPerNaraFromSqrtPriceX96,
  productionV4ReadOnlyConfig,
  readPoolStateAt,
  stabilizerConfigFingerprint,
  verifyProductionV4ReadOnlyRuntime,
} from "./v4ReadOnlyPool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");

// ---------------------------------------------------------------- flags/env
const LIVE_FLAG = process.argv.includes("--live");
function safeIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const text = process.env[name]?.trim() || String(fallback);
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be an integer`);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function decimalUsdcEnv(name: string, fallback: string): bigint {
  const text = process.env[name]?.trim() || fallback;
  let value: bigint;
  try {
    value = ethers.parseUnits(text, 6);
  } catch {
    throw new Error(`${name} must be an exact non-negative USDC amount`);
  }
  if (value < 0n) throw new Error(`${name} cannot be negative`);
  return value;
}

const POLL_MS = safeIntegerEnv("V4_STABILIZER_POLL_MS", 250, 100, 60_000);
const MAX_SECONDS = safeIntegerEnv(
  "V4_STABILIZER_MAX_SECONDS",
  0,
  0,
  31_536_000
); // 0 = run forever
const PUMP_TRIGGER = decimalUsdcEnv("V4_PUMP_TRIGGER_USDC", "100");
const DUMP_TRIGGER = decimalUsdcEnv("V4_DUMP_TRIGGER_USDC", "100");
const DEFENSE_CAP_USDC = decimalUsdcEnv("V4_DEFENSE_USDC_CAP", "150");
const RESERVE_FLOOR_USDC = decimalUsdcEnv("V4_RESERVE_FLOOR_USDC", "200");
const MIN_EDGE_BPS = BigInt(safeIntegerEnv("V4_MIN_EDGE_BPS", 300, 0, 100_000));
const HEDGE_RATIO_BPS = BigInt(
  safeIntegerEnv("V4_HEDGE_SELL_RATIO_BPS", 9_000, 1, 10_000)
);
const BPS = 10_000n;
const POSITIVE_EV_EVIDENCE_GAPS = [
  "exact_source_swap_flow",
  "next_block_defense_quote",
  "executable_exit_scenarios",
  "entry_and_exit_gas_in_usdc",
  "calibrated_scenario_probabilities",
  "path_dependent_fifo_portfolio",
] as const;
const BUCKET_NARA = (() => {
  const text =
    process.env.V4_HEDGE_BUCKET_NARA?.trim() || "25000000000000000000000";
  if (!/^\d+$/.test(text)) {
    throw new Error("V4_HEDGE_BUCKET_NARA must be base-unit digits");
  }
  return BigInt(text);
})(); // 25k
// Replay/backtest: point the watcher at a historical window so recorded
// events flow through the same simulation path. Shadow-only.
const REPLAY_FROM_BLOCK = safeIntegerEnv(
  "V4_REPLAY_FROM_BLOCK",
  0,
  0,
  Number.MAX_SAFE_INTEGER
);
const REPLAY_TO_BLOCK = safeIntegerEnv(
  "V4_REPLAY_TO_BLOCK",
  0,
  0,
  Number.MAX_SAFE_INTEGER
);
const MAX_BLOCK_RANGE = safeIntegerEnv(
  "V4_STABILIZER_MAX_BLOCK_RANGE",
  2_000,
  1,
  10_000
);
const FINALITY_CONFIRMATIONS = safeIntegerEnv(
  "V4_STABILIZER_FINALITY_CONFIRMATIONS",
  20,
  1,
  10_000
);
if (HEDGE_RATIO_BPS < 1n || HEDGE_RATIO_BPS > BPS) {
  throw new Error("V4_HEDGE_SELL_RATIO_BPS must be between 1 and 10000");
}

if (LIVE_FLAG) {
  console.error(
    [
      "",
      "PHASE 2 NOT ENABLED.",
      "",
      "The live defense executor ships only after the shadow ledger has",
      "accumulated enough simulated events to calibrate persistence and edge.",
      "Run shadow mode now:",
      "  powershell -File scripts/matrix/start-two-sided-stabilizer.ps1",
      "",
    ].join("\n")
  );
  process.exit(2);
}

// ------------------------------------------------------------- ABIs/topics
const POOL_FEE_TAKEN_ABI = [
  "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const EXT_SLOAD_ABI = ["function extsload(bytes32) view returns (bytes32)"];
const QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
];

// ------------------------------------------------------------------- setup
const deployment = canonicalProductionV4Deployment();
const config = productionV4ReadOnlyConfig(deployment);
const rpcUrls = [
  process.env.V4_STABILIZER_RPC_URL,
  process.env.BASE_MAINNET_RPC_URL,
  process.env.BASE_RPC_URL,
]
  .map((u) => (u ?? "").trim())
  .filter((u) => u !== "");
if (rpcUrls.length === 0) throw new Error("No BASE RPC URL configured");
let providerIndex = 0;
let provider: ethers.JsonRpcProvider | null = null;
function getProvider(): ethers.JsonRpcProvider {
  if (!provider || provider.destroyed) {
    provider = new ethers.JsonRpcProvider(
      rpcUrls[providerIndex % rpcUrls.length],
      8453,
      {
        staticNetwork: true,
      }
    );
  }
  return provider;
}
async function resilient<T>(
  fn: (p: ethers.JsonRpcProvider) => Promise<T>,
  tries = 3
): Promise<T> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn(getProvider());
    } catch (e) {
      err = e;
      if (provider && !provider.destroyed) provider.destroy();
      provider = null;
      providerIndex++;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw err;
}

// Shadow mode receives only a public RPC and policy values. It never loads a
// general-purpose .env file, signing key, or signer. An optional public address
// can be observed for historical inventory/budget constraints.
const walletAddressInput = (process.env.V4_STABILIZER_WALLET ?? "").trim();
const walletAddress =
  walletAddressInput === "" ? null : ethers.getAddress(walletAddressInput);
const configFingerprint = stabilizerConfigFingerprint(deployment, {
  pumpTriggerUsdc: PUMP_TRIGGER.toString(),
  dumpTriggerUsdc: DUMP_TRIGGER.toString(),
  defenseCapUsdc: DEFENSE_CAP_USDC.toString(),
  reserveFloorUsdc: RESERVE_FLOOR_USDC.toString(),
  minEdgeBps: MIN_EDGE_BPS.toString(),
  hedgeRatioBps: HEDGE_RATIO_BPS.toString(),
  bucketNara: BUCKET_NARA.toString(),
  finalityConfirmations: FINALITY_CONFIRMATIONS,
  wallet: walletAddress?.toLowerCase() ?? null,
});

const hook = new ethers.Contract(
  config.hook,
  POOL_FEE_TAKEN_ABI,
  getProvider()
);
const pm = new ethers.Contract(
  config.poolManager,
  EXT_SLOAD_ABI,
  getProvider()
);

const T_FEE = new ethers.Interface(POOL_FEE_TAKEN_ABI).getEvent(
  "PoolFeeTaken"
)!.topicHash;
// zeroForOne per canonical ordering (USDC sorts below NARA):
//   buy (USDC->NARA): zeroForOne = !tokenIsCurrency0
//   sell(NARA->USDC): zeroForOne =  tokenIsCurrency0
const BUY_ZERO_FOR_ONE = !config.canonicalPoolKey.tokenIsCurrency0;
const SELL_ZERO_FOR_ONE = config.canonicalPoolKey.tokenIsCurrency0;
const poolKeyStruct = {
  currency0: config.canonicalPoolKey.currency0,
  currency1: config.canonicalPoolKey.currency1,
  fee: config.fee,
  tickSpacing: config.tickSpacing,
  hooks: config.hook,
};

async function midUsdcPerNara(blockTag?: number): Promise<number> {
  const st = await resilient(async (p) =>
    readPoolStateAt(
      pm.connect(p) as unknown as ethers.Contract,
      config.poolId,
      blockTag ?? (await p.getBlockNumber())
    )
  );
  // raw ratio = currency1/currency0 in RAW units; NARA(18dp)/USDC(6dp) needs
  // a 10^(18-6) correction to reach human NARA-per-USDC.
  return midUsdcPerNaraFromSqrtPriceX96(
    st.sqrtPriceX96,
    config.canonicalPoolKey.tokenIsCurrency0
  );
}
async function quote(
  zeroForOne: boolean,
  exactAmount: bigint,
  blockTag?: number
) {
  const p = getProvider();
  const q = new ethers.Contract(BASE_V4_QUOTER, QUOTER_ABI, p);
  const out = (await q.quoteExactInputSingle.staticCall(
    [{ ...poolKeyStruct }, zeroForOne, exactAmount, "0x"],
    blockTag !== undefined ? { blockTag } : {}
  )) as [bigint, bigint];
  return { amountOut: out[0], gasEstimate: out[1] };
}
const fmtUsdc = (v: bigint) => ethers.formatUnits(v, 6);
const fmtNara = (v: bigint) => ethers.formatUnits(v, 18);

// ------------------------------------------------------------------ ledger
const ledgerPath = resolve(repoRoot, "deployments", "stabilizer-shadow.jsonl");
const sessionId = `stabilizer-${new Date().toISOString()}`;
mkdirSync(dirname(ledgerPath), { recursive: true });
function record(entry: Record<string, unknown>): void {
  const line = JSON.stringify({
    schemaVersion: 2,
    sessionId,
    ts: new Date().toISOString(),
    ...entry,
  });
  appendFileSync(ledgerPath, line + "\n");
  console.log(line.length > 240 ? line.slice(0, 237) + "..." : line);
}

// -------------------------------------------------------------- main loop
type Counts = { pumpsSeen: number; dumpsSeen: number; simsRun: number };
const counts: Counts = { pumpsSeen: 0, dumpsSeen: 0, simsRun: 0 };
let lastBlock = 0;
let stop = false;
let activeScanRange: { fromBlock: number; toBlock: number } | null = null;

async function scanOnce(): Promise<void> {
  const observedChainHead = await resilient(async (p) => p.getBlockNumber());
  const chainHead = Math.max(0, observedChainHead - FINALITY_CONFIRMATIONS);
  const plan = planStabilizerScan({
    lastBlock,
    chainHead,
    replayFromBlock: REPLAY_FROM_BLOCK,
    replayToBlock: REPLAY_TO_BLOCK,
    maxBlockRange: MAX_BLOCK_RANGE,
  });

  if (plan.baselineBlock !== undefined) {
    const baselineMid = await midUsdcPerNara(plan.baselineBlock);
    lastBlock = plan.baselineBlock;
    console.log(
      JSON.stringify({
        baseline: true,
        mode: plan.mode,
        block: plan.baselineBlock,
        midUsdcPerNara: baselineMid.toFixed(8),
      })
    );
    return;
  }
  if (plan.complete) {
    requestExit("replay_complete", 0);
    return;
  }
  if (plan.fromBlock === undefined || plan.toBlock === undefined) return;

  if (plan.skippedFromBlock !== undefined) {
    record({
      kind: "scanGap",
      reason: "live_range_cap_exceeded",
      skippedFromBlock: plan.skippedFromBlock,
      skippedToBlock: plan.skippedToBlock,
    });
  }

  activeScanRange = { fromBlock: plan.fromBlock, toBlock: plan.toBlock };
  const logs = await resilient(async (p) =>
    p.getLogs({
      address: config.hook,
      topics: [T_FEE],
      fromBlock: plan.fromBlock,
      toBlock: plan.toBlock,
    })
  );

  const midCache = new Map<number, number>();
  const originCache = new Map<string, string | null>();
  const skippedTriggerKeys = new Set<string>();
  const recordTriggerSkip = (
    side: StabilizerTriggerSide,
    reason: string,
    triggerBlock: number,
    txHash: string,
    actionCount: number
  ): void => {
    if (!shouldRecordTriggerSkip(skippedTriggerKeys, side, txHash)) return;
    record({
      kind: "triggerSkipped",
      reason,
      side,
      triggerBlock,
      txHash,
      transactionHashes: [txHash.toLowerCase()],
      transactionCount: 1,
      actionCount,
    });
  };
  const referenceMidAt = async (blockNumber: number): Promise<number> => {
    const referenceBlock = Math.max(0, blockNumber - 1);
    const cached = midCache.get(referenceBlock);
    if (cached !== undefined) return cached;
    const mid = await midUsdcPerNara(referenceBlock);
    midCache.set(referenceBlock, mid);
    return mid;
  };
  const transactionOrigin = async (txHash: string): Promise<string | null> => {
    const cached = originCache.get(txHash);
    if (cached !== undefined) return cached;
    let origin: string | null = null;
    try {
      const tx = await resilient(async (p) => p.getTransaction(txHash));
      origin = tx?.from ? ethers.getAddress(tx.from) : null;
    } catch {
      // Unknown origin is handled conservatively by the trigger classifier.
    }
    originCache.set(txHash, origin);
    return origin;
  };

  const canonicalActions: StabilizerTriggerAction[] = [];
  for (const lg of logs) {
    let ev;
    try {
      ev = hook.interface.decodeEventLog("PoolFeeTaken", lg.data, lg.topics);
    } catch {
      continue;
    }
    if ((ev.poolId as string).toLowerCase() !== config.poolId.toLowerCase()) {
      continue;
    }
    const currency: string = ev.currency.toLowerCase();
    const isBuy: boolean = ev.isBuy === true;
    const side =
      isBuy && currency === config.base.toLowerCase()
        ? "pump"
        : !isBuy && currency === config.token.toLowerCase()
        ? "floor"
        : null;
    if (side === null) continue;
    canonicalActions.push({
      side,
      transactionHash: lg.transactionHash,
      blockNumber: lg.blockNumber,
      blockHash: lg.blockHash,
      logIndex: lg.index,
      amountIn: ev.amountIn as bigint,
      feeBps: Number(ev.feeBps),
    });
  }

  const transactionFlows =
    aggregateStabilizerTransactionFlows(canonicalActions);
  const qualifyingExternalFlows: StabilizerTransactionFlow[] = [];
  for (const flow of transactionFlows) {
    if (walletAddress) {
      const origin = await transactionOrigin(flow.transactionHash);
      const reason =
        origin === null
          ? "transaction_origin_unavailable"
          : origin === walletAddress
          ? "watched_wallet_transaction"
          : null;
      if (reason !== null) {
        recordTriggerSkip(
          flow.side,
          reason,
          flow.blockNumber,
          flow.transactionHash,
          flow.actionCount
        );
        continue;
      }
    }

    if (flow.side === "pump") {
      if (flow.amountIn >= PUMP_TRIGGER) qualifyingExternalFlows.push(flow);
      continue;
    }
    let referenceMid: number;
    try {
      referenceMid = await referenceMidAt(flow.blockNumber);
    } catch {
      recordTriggerSkip(
        "floor",
        "reference_mid_unavailable",
        flow.blockNumber,
        flow.transactionHash,
        flow.actionCount
      );
      continue;
    }
    const referenceMidWad = ethers.parseUnits(referenceMid.toFixed(18), 18);
    const transactionUsdcValue = calculateDumpUsdcValue(
      flow.amountIn,
      referenceMidWad
    );
    if (transactionUsdcValue >= DUMP_TRIGGER) {
      qualifyingExternalFlows.push(flow);
    }
  }

  const aggregatedTriggers = aggregateStabilizerTriggers(
    qualifyingExternalFlows
  );
  for (const trigger of aggregatedTriggers) {
    const {
      side,
      blockNumber: eventBlock,
      blockHash: triggerBlockHash,
      amountIn,
      feeBps: eventFeeBps,
      transactionHashes,
      transactionCount,
      actionCount,
      observationIds,
    } = trigger;

    const canonicalTriggerBlock = await resilient(async (p) =>
      p.getBlock(eventBlock)
    );
    if (
      !canonicalTriggerBlock?.hash ||
      canonicalTriggerBlock.hash.toLowerCase() !==
        triggerBlockHash.toLowerCase()
    ) {
      record({
        kind: "triggerSkipped",
        reason: "trigger_block_hash_mismatch",
        side,
        triggerBlock: eventBlock,
        triggerBlockHash,
        transactionHashes,
        transactionCount,
        actionCount,
        observationIds,
      });
      continue;
    }

    if (side === "pump") {
      let referenceMid: number;
      try {
        referenceMid = await referenceMidAt(eventBlock);
      } catch {
        record({
          kind: "triggerSkipped",
          reason: "reference_mid_unavailable",
          side: "pump",
          triggerBlock: eventBlock,
          triggerBlockHash,
          transactionHashes,
          transactionCount,
          actionCount,
          observationIds,
        });
        continue;
      }
      counts.pumpsSeen++;
      await simulatePumpDefense(
        amountIn,
        eventFeeBps,
        eventBlock,
        triggerBlockHash,
        referenceMid,
        walletAddress
          ? "external_to_watched_wallet"
          : "unclassified_no_watched_wallet",
        transactionHashes,
        transactionCount,
        actionCount,
        observationIds
      );
    } else if (side === "floor") {
      let referenceMid: number;
      try {
        referenceMid = await referenceMidAt(eventBlock);
      } catch {
        record({
          kind: "triggerSkipped",
          reason: "reference_mid_unavailable",
          side: "floor",
          triggerBlock: eventBlock,
          triggerBlockHash,
          transactionHashes,
          transactionCount,
          actionCount,
          observationIds,
        });
        continue;
      }
      const referenceMidWad = ethers.parseUnits(referenceMid.toFixed(18), 18);
      const usdcValue = calculateDumpUsdcValue(amountIn, referenceMidWad);
      if (usdcValue >= DUMP_TRIGGER) {
        counts.dumpsSeen++;
        await simulateFloorDefense(
          amountIn,
          eventFeeBps,
          usdcValue,
          eventBlock,
          triggerBlockHash,
          referenceMidWad,
          walletAddress
            ? "external_to_watched_wallet"
            : "unclassified_no_watched_wallet",
          transactionHashes,
          transactionCount,
          actionCount,
          observationIds
        );
      }
    }
  }

  const [fromBlock, toBlock] = await Promise.all([
    resilient(async (p) => p.getBlock(plan.fromBlock!)),
    resilient(async (p) => p.getBlock(plan.toBlock!)),
  ]);
  if (!fromBlock?.hash || !toBlock?.hash) {
    throw new Error("scan checkpoint block hash unavailable");
  }
  record({
    kind: "scanCheckpoint",
    fromBlock: plan.fromBlock,
    fromBlockHash: fromBlock.hash.toLowerCase(),
    toBlock: plan.toBlock,
    toBlockHash: toBlock.hash.toLowerCase(),
  });
  lastBlock = plan.toBlock;
  activeScanRange = null;
  if (plan.completeAfterRange) requestExit("replay_complete", 0);
}

async function simulatePumpDefense(
  whaleUsdcIn: bigint,
  whaleFeeBps: number,
  blockTag: number,
  triggerBlockHash: string,
  referenceMid: number,
  originClassification: string,
  transactionHashes: string[],
  transactionCount: number,
  actionCount: number,
  observationIds: string[]
): Promise<void> {
  const triggerTx = transactionCount === 1 ? transactionHashes[0] : null;
  let whaleEquivalentQuote: { amountOut: bigint; gasEstimate: bigint };
  try {
    whaleEquivalentQuote = await resilient(() =>
      quote(BUY_ZERO_FOR_ONE, whaleUsdcIn, blockTag)
    );
  } catch {
    record({
      kind: "pumpSimSkipped",
      reason: "whale_equivalent_quote_unavailable_at_trigger_block",
      triggerBlock: blockTag,
      triggerBlockHash,
      triggerTx,
      transactionHashes,
      transactionCount,
      actionCount,
      observationIds,
    });
    return;
  }
  const whaleEquivalentNara = whaleEquivalentQuote.amountOut;
  let balNara = BUCKET_NARA;
  let inventorySource = "configured_bucket";
  if (walletAddress) {
    try {
      balNara = (await resilient(async (p) =>
        new ethers.Contract(config.token, ERC20_ABI, p).balanceOf(
          walletAddress!,
          { blockTag }
        )
      )) as bigint;
      inventorySource = "watched_wallet_at_trigger_block";
    } catch {
      record({
        kind: "pumpSimSkipped",
        reason: "watched_wallet_inventory_unavailable_at_trigger_block",
        triggerBlock: blockTag,
        triggerBlockHash,
        triggerTx,
        transactionHashes,
        transactionCount,
        actionCount,
        observationIds,
      });
      return;
    }
  }
  const plannedSell = planPumpHedgeAmount({
    whaleEquivalentNara,
    hedgeRatioBps: HEDGE_RATIO_BPS,
    configuredCapNara: BUCKET_NARA,
    availableNara: balNara,
  });
  if (plannedSell === 0n) {
    record({
      kind: "pumpSimSkipped",
      reason: "no_inventory",
      triggerBlock: blockTag,
      triggerBlockHash,
      triggerTx,
      transactionHashes,
      transactionCount,
      actionCount,
      observationIds,
    });
    return;
  }
  let q: { amountOut: bigint; gasEstimate: bigint };
  try {
    q = await resilient(() => quote(SELL_ZERO_FOR_ONE, plannedSell, blockTag));
  } catch {
    record({
      kind: "pumpSimSkipped",
      reason: "quote_unavailable_at_trigger_block",
      triggerBlock: blockTag,
      triggerBlockHash,
      triggerTx,
      transactionHashes,
      transactionCount,
      actionCount,
      observationIds,
    });
    return;
  }
  const proceeds = q.amountOut;
  // Phase 1 approximates basis at the pre-trigger mid. Phase 2 must replace
  // this with FIFO basis from the matrix ledger before any execution decision.
  const estBasisCost = Number(fmtNara(plannedSell)) * referenceMid;
  const proceedsNum = Number(fmtUsdc(proceeds));
  const edgeUsdc = proceedsNum - estBasisCost;
  const edgeBps =
    estBasisCost > 0 ? Math.round((edgeUsdc / estBasisCost) * 10_000) : 0;
  const diagnosticVerdict = edgeBps >= Number(MIN_EDGE_BPS) ? "GO" : "NO_GO";
  counts.simsRun++;
  record({
    kind: "pumpDefenseSimulated",
    mode: "SHADOW",
    triggerTx,
    transactionHashes,
    transactionCount,
    triggerBlock: blockTag,
    triggerBlockHash,
    actionCount,
    observationIds,
    referenceBlock: Math.max(0, blockTag - 1),
    originClassification,
    whaleUsdcIn: fmtUsdc(whaleUsdcIn),
    whaleTierBps: whaleFeeBps,
    whaleEquivalentNara: fmtNara(whaleEquivalentNara),
    hedgeRatioBps: Number(HEDGE_RATIO_BPS),
    configuredBucketCapNara: fmtNara(BUCKET_NARA),
    plannedSellNara: fmtNara(plannedSell),
    inventorySource,
    quotedProceedsUsdc: fmtUsdc(proceeds),
    refMidUsdcPerNara: referenceMid.toFixed(8),
    estBasisCostUsdc: estBasisCost.toFixed(4),
    edgeUsdc: edgeUsdc.toFixed(4),
    edgeBps,
    verdict: diagnosticVerdict,
    verdictScope: "DIAGNOSTIC_MARK_ONLY",
    diagnosticVerdict,
    positiveEvVerdict: "BLOCKED",
    positiveEvEvidenceComplete: false,
    positiveEvEvidenceGaps: POSITIVE_EV_EVIDENCE_GAPS,
    activationVerdict: "BLOCKED",
    activationEligible: false,
    minEdgeBps: Number(MIN_EDGE_BPS),
    quoteBlock: blockTag,
    quoteSemantics: "historical_end_of_trigger_block_mark",
    policyStateMode: "independent_candidate_no_virtual_inventory_path",
    note: "Diagnostic mark only: not the observed buyer output or a next-block executable counterfactual.",
  });
}

async function simulateFloorDefense(
  naraSold: bigint,
  dumperFeeBps: number,
  usdcValueSold: bigint,
  blockTag: number,
  triggerBlockHash: string,
  referenceMidWad: bigint,
  originClassification: string,
  transactionHashes: string[],
  transactionCount: number,
  actionCount: number,
  observationIds: string[]
): Promise<void> {
  const triggerTx = transactionCount === 1 ? transactionHashes[0] : null;
  let usdcBal: bigint | null = null;
  let budgetSource = "configured_shadow_cap";
  if (walletAddress) {
    try {
      usdcBal = (await resilient(async (p) =>
        new ethers.Contract(config.base, ERC20_ABI, p).balanceOf(
          walletAddress!,
          { blockTag }
        )
      )) as bigint;
      budgetSource = "watched_wallet_at_trigger_block";
    } catch {
      record({
        kind: "floorSimSkipped",
        reason: "watched_wallet_balance_unavailable_at_trigger_block",
        triggerBlock: blockTag,
        triggerBlockHash,
        triggerTx,
        transactionHashes,
        transactionCount,
        actionCount,
        observationIds,
      });
      return;
    }
  }
  const { budgetUsdc: budget } = planFloorDefenseBudget({
    availableUsdc: usdcBal,
    reserveFloorUsdc: RESERVE_FLOOR_USDC,
    defenseCapUsdc: DEFENSE_CAP_USDC,
  });
  if (budget === 0n) {
    record({
      kind: "floorSimSkipped",
      reason: "reserve_floor_or_no_balance",
      reserveFloorUsdc: fmtUsdc(RESERVE_FLOOR_USDC),
      triggerBlock: blockTag,
      triggerBlockHash,
      triggerTx,
      transactionHashes,
      transactionCount,
      actionCount,
      observationIds,
    });
    return;
  }
  let q: { amountOut: bigint; gasEstimate: bigint };
  try {
    q = await resilient(() => quote(BUY_ZERO_FOR_ONE, budget, blockTag));
  } catch {
    record({
      kind: "floorSimSkipped",
      reason: "quote_unavailable_at_trigger_block",
      triggerBlock: blockTag,
      triggerBlockHash,
      triggerTx,
      transactionHashes,
      transactionCount,
      actionCount,
      observationIds,
    });
    return;
  }
  const naraOut = q.amountOut;
  const edge = calculateFloorRecoveryEdge({
    budgetUsdc: budget,
    quotedNaraOut: naraOut,
    recoveryTargetUsdcPerNaraWad: referenceMidWad,
    minEdgeBps: MIN_EDGE_BPS,
  });
  counts.simsRun++;
  record({
    kind: "floorDefenseSimulated",
    mode: "SHADOW",
    triggerTx,
    transactionHashes,
    transactionCount,
    triggerBlock: blockTag,
    triggerBlockHash,
    actionCount,
    observationIds,
    referenceBlock: Math.max(0, blockTag - 1),
    originClassification,
    dumperNaraSold: fmtNara(naraSold),
    dumperUsdcValue: Number(fmtUsdc(usdcValueSold)).toFixed(2),
    dumperTierBps: dumperFeeBps,
    budgetUsdc: fmtUsdc(budget),
    budgetSource,
    quotedNaraOut: fmtNara(naraOut),
    entryNetUsdcPerNara:
      edge.entryNetUsdcPerNaraWad === null
        ? null
        : Number(ethers.formatUnits(edge.entryNetUsdcPerNaraWad, 18)).toFixed(
            8
          ),
    recoveryTargetMid: Number(ethers.formatUnits(referenceMidWad, 18)).toFixed(
      8
    ),
    profitIfRecoveryUsdc: Number(fmtUsdc(edge.profitIfRecoveryUsdc)).toFixed(4),
    unrealizedRecoveryMarkUsdc: Number(
      fmtUsdc(edge.profitIfRecoveryUsdc)
    ).toFixed(4),
    edgeBps: Number(edge.edgeBps),
    verdict: edge.verdict,
    verdictScope: "DIAGNOSTIC_MARK_ONLY",
    diagnosticVerdict: edge.verdict,
    positiveEvVerdict: "BLOCKED",
    positiveEvEvidenceComplete: false,
    positiveEvEvidenceGaps: POSITIVE_EV_EVIDENCE_GAPS,
    activationVerdict: "BLOCKED",
    activationEligible: false,
    minEdgeBps: Number(MIN_EDGE_BPS),
    quoteBlock: blockTag,
    quoteSemantics: "historical_end_of_trigger_block_mark",
    policyStateMode: "independent_candidate_no_virtual_inventory_path",
    note: "Unrealized recovery mark only; exit fees, impact, gas, timing, and probability are not modeled.",
  });
}

// ------------------------------------------------------------------ runner
let pollTimer: NodeJS.Timeout | null = null;
let deadlineTimer: NodeJS.Timeout | null = null;
let running = false;
let finalized = false;
let sessionHasStarted = false;
let pendingExit: { reason: string; code: number } | null = null;

function finalizeSession(): void {
  if (finalized || !pendingExit || running) return;
  finalized = true;
  if (pollTimer) clearTimeout(pollTimer);
  if (deadlineTimer) clearTimeout(deadlineTimer);
  if (!sessionHasStarted) {
    if (provider && !provider.destroyed) provider.destroy();
    process.exitCode = pendingExit.code;
    return;
  }
  record({
    kind: "sessionSummary",
    pumpsSeen: counts.pumpsSeen,
    dumpsSeen: counts.dumpsSeen,
    simulationsRun: counts.simsRun,
    lastBlock,
    exitReason: pendingExit.reason,
    activeScanRange,
  });
  if (provider && !provider.destroyed) provider.destroy();
  process.exitCode = pendingExit.code;
}

function requestExit(reason: string, code: number): void {
  stop = true;
  pendingExit ??= { reason, code };
  if (pollTimer) clearTimeout(pollTimer);
  finalizeSession();
}

async function tick(): Promise<void> {
  if (running || stop) return;
  running = true;
  try {
    await scanOnce();
  } catch (e) {
    const errorName = e instanceof Error ? e.name : "UnknownError";
    record({
      kind: "watcherError",
      errorName,
      activeScanRange,
      checkpointPreservedAtBlock: lastBlock,
    });
    if (REPLAY_FROM_BLOCK > 0) requestExit("watcher_error", 1);
  } finally {
    running = false;
  }
  if (stop) {
    finalizeSession();
  } else {
    pollTimer = setTimeout(tick, POLL_MS);
  }
}

async function bootstrap(): Promise<void> {
  await resilient(async (p) => verifyProductionV4ReadOnlyRuntime(p));
  if (stop) {
    finalizeSession();
    return;
  }
  console.log("=== NARA Two-Sided Stabilizer — SHADOW MODE (no trades) ===");
  console.log(
    JSON.stringify({
      poolId: config.poolId,
      hook: config.hook,
      configFingerprint,
      pumpTriggerUsdc: fmtUsdc(PUMP_TRIGGER),
      dumpTriggerUsdcEquiv: fmtUsdc(DUMP_TRIGGER),
      defenseCapUsdc: fmtUsdc(DEFENSE_CAP_USDC),
      reserveFloorUsdc: fmtUsdc(RESERVE_FLOOR_USDC),
      minEdgeBps: Number(MIN_EDGE_BPS),
      walletWatched: walletAddress
        ? "(configured public address)"
        : "(unset — configured shadow budgets used)",
      replayFromBlock: REPLAY_FROM_BLOCK || null,
      replayToBlock: REPLAY_TO_BLOCK || null,
      maxBlockRange: MAX_BLOCK_RANGE,
      finalityConfirmations: FINALITY_CONFIRMATIONS,
      ledger: ledgerPath,
    })
  );
  record({
    kind: "sessionStarted",
    mode: REPLAY_FROM_BLOCK > 0 ? "REPLAY_SHADOW" : "LIVE_SHADOW",
    chainId: Number(deployment.chainId),
    poolId: deployment.poolId,
    hook: deployment.hook,
    manifestSha256: deployment.manifestSha256,
    originCommit: deployment.originCommit,
    configFingerprint,
    replayFromBlock: REPLAY_FROM_BLOCK || null,
    replayToBlock: REPLAY_TO_BLOCK || null,
    finalityConfirmations: FINALITY_CONFIRMATIONS,
    watchedWallet: walletAddress?.toLowerCase() ?? null,
    pumpTriggerUsdc: fmtUsdc(PUMP_TRIGGER),
    dumpTriggerUsdc: fmtUsdc(DUMP_TRIGGER),
    defenseCapUsdc: fmtUsdc(DEFENSE_CAP_USDC),
    reserveFloorUsdc: fmtUsdc(RESERVE_FLOOR_USDC),
    hedgeRatioBps: Number(HEDGE_RATIO_BPS),
    minEdgeBps: Number(MIN_EDGE_BPS),
    quoteSemantics: "historical_end_of_trigger_block_mark",
    activationEligible: false,
  });
  sessionHasStarted = true;
  if (MAX_SECONDS > 0) {
    deadlineTimer = setTimeout(
      () => requestExit("max_seconds_elapsed", 0),
      MAX_SECONDS * 1000
    );
  }
  await tick();
}

process.on("SIGINT", () => requestExit("sigint", 0));
void bootstrap().catch((error) => {
  const reason = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(
    `${JSON.stringify({ schemaVersion: 2, status: "startup_error", reason })}\n`
  );
  if (provider && !provider.destroyed) provider.destroy();
  process.exitCode = 1;
});
