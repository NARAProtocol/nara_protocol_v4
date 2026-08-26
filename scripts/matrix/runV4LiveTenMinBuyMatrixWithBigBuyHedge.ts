/**
 * Ten-minute live buy-tax matrix WITH external big-buy hedging.
 *
 * Identical evidence discipline to runV4LiveTenMinBuyMatrix.ts (100 x 11 USDC,
 * one buy per distinct later block, absolute 6 s schedule, per-trade marginal
 * fee reconstruction, vault reconciliation), PLUS an optional reactive hedge:
 *
 *   - While the run executes, freshly mined Hook `PoolFeeTaken` BUY events with
 *     USDC input >= trigger (default 100 USDC) from OTHER wallets are watched.
 *   - Each qualifying external buy contributes its whale-equivalent NARA output
 *     (quoted through the official V4Quoter at that whale's own block) to a
 *     pending bucket, so a whale splitting into 10 or 20 buys across adjacent
 *     blocks aggregates into ONE hedge on the TOTAL.
 *   - Once the burst goes quiet (no new whale flow for QUIET blocks), the run
 *     sells 90% of the accumulated bucket back into the pool in a single
 *     Universal Router swap, in a strictly later block, with the same
 *     protection and verification standards as every other matrix leg:
 *     quote-floored slippage, simulate-before-send with one re-pin retry,
 *     marginal sell-curve fee reconstruction including third-party same-block
 *     flow, Vault totalTokenFeeRecorded reconciliation, and allowance cleanup.
 *   - The buy sequence ALWAYS continues afterward; hedges never replace or
 *     delay the approved matrix schedule beyond normal verification time.
 *
 * Gates:
 *   - Default mode is READ-ONLY. Buys additionally always require
 *     --execute + V4_LIVE_TEN_MIN_BUY_CONFIRMATION=BUY_NARA_100_X_11_USDC_TEN_MIN.
 *   - Hedging is armed ONLY by passing --hedge. Armed hedging in execute mode
 *     ALSO requires V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION=HEDGE_SELL_ON_BIG_EXTERNAL_BUY.
 *   - Read-only + --hedge performs DRY-RUN hedge accounting (no key needed, no sends).
 *
 * Knobs (env):
 *   V4_TEN_MIN_BUY_COUNT        buys in this run (resume support), default 100
 *   V4_HEDGE_TRIGGER_USDC       external-buy trigger size, default 100
 *   V4_HEDGE_SELL_RATIO_BPS     share of bucket sold per hedge, default 9000 (90%)
 *   V4_HEDGE_MAX_SELLS          hard cap of hedge swaps per run, default 25
 *   V4_HEDGE_MIN_SELL_USDC      skip dust hedges below this quoted USDC out, default 5
 *   V4_HEDGE_QUIET_BLOCKS       quiet blocks that close a burst, default 2
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SAME_BLOCK_EXPECTED,
  SAME_BLOCK_EXPECTED_CODE_HASHES,
  assertExact,
  canonicalReceipt,
  cumulativeFee,
  parsedLog,
  readPoolStateAt,
  sendWithMargin,
  terminalFeeBps,
  type FeeCurve,
} from "./runV4LiveSameBlockBuyTaxMatrix.js";
import {
  currentV4Config,
  requiredBaseRpcUrl,
  requiredEnv,
} from "../lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const EXECUTION_CONFIRMATION = "BUY_NARA_100_X_11_USDC_TEN_MIN";
const HEDGE_CONFIRMATION = "HEDGE_SELL_ON_BIG_EXTERNAL_BUY";
const BASE_CHAIN_ID = 8453n;

const parsedCount = Number(process.env.V4_TEN_MIN_BUY_COUNT ?? 100);
if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 1_000) {
  throw new Error("V4_TEN_MIN_BUY_COUNT must be an integer between 1 and 1000");
}
const BUY_COUNT = parsedCount;
const BUY_USDC = 11n * 10n ** 6n;
const BUY_TOTAL_USDC = BigInt(BUY_COUNT) * BUY_USDC;
export const EXPECTED_PER_BUY_FEE_USDC = 330_000n;
const DELAY_SECONDS = 6;
const OUTPUT_TOLERANCE_BPS = 1_000n;
const BPS = 10_000n;
const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;
const FOLLOW_FINALIZED_LAG = 2;
const WINDOW_POLL_MS = 1_000;

function positiveIntEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return parsed;
}

const HEDGE_TRIGGER_RAW =
  process.env.V4_HEDGE_TRIGGER_USDC !== undefined &&
  process.env.V4_HEDGE_TRIGGER_USDC.trim() !== ""
    ? ethers.parseUnits(process.env.V4_HEDGE_TRIGGER_USDC.trim(), 6)
    : 100n * 10n ** 6n;
if (HEDGE_TRIGGER_RAW <= 0n)
  throw new Error("V4_HEDGE_TRIGGER_USDC must be positive");

const RATIO_RAW = process.env.V4_HEDGE_SELL_RATIO_BPS?.trim();
const HEDGE_RATIO_BPS =
  RATIO_RAW !== undefined && RATIO_RAW !== "" ? BigInt(RATIO_RAW) : 9_000n;
if (HEDGE_RATIO_BPS < 1n || HEDGE_RATIO_BPS > BPS) {
  throw new Error("V4_HEDGE_SELL_RATIO_BPS must be between 1 and 10000");
}

const MAX_HEDGE_SELLS = positiveIntEnv("V4_HEDGE_MAX_SELLS", 25, 200);
const MIN_HEDGE_USDC_OUT =
  process.env.V4_HEDGE_MIN_SELL_USDC !== undefined &&
  process.env.V4_HEDGE_MIN_SELL_USDC.trim() !== ""
    ? ethers.parseUnits(process.env.V4_HEDGE_MIN_SELL_USDC.trim(), 6)
    : 5n * 10n ** 6n;
if (MIN_HEDGE_USDC_OUT <= 0n)
  throw new Error("V4_HEDGE_MIN_SELL_USDC must be positive");
const HEDGE_QUIET_BLOCKS = positiveIntEnv("V4_HEDGE_QUIET_BLOCKS", 2, 100);

// Live executed seller-weighted BUY policy: thresholds 500/1500/3000 bps,
// tiers 300/500/800/1200 bps, max 1200 (verified against the live hook).
const EXPECTED_BUY_CURVE = [
  500n,
  1_500n,
  3_000n,
  300n,
  500n,
  800n,
  1_200n,
  1_200n,
];
// Live SELL policy (read onchain + documented in nara_protocol_public
// PROJECT_KNOWLEDGE_BASE.md section 4.2): thresholds 500/1500/3000 bps,
// tiers 500/800/1200/2000 bps, max 2000. The activation-day values
// (500/700/1000/1500) were superseded by the executed fee-policy update.
const EXPECTED_SELL_CURVE = [
  500n,
  1_500n,
  3_000n,
  500n,
  800n,
  1_200n,
  2_000n,
  2_000n,
];
const EXPECTED_USDC_DEPTH = 300n * 10n ** 6n;
const EXPECTED_NARA_DEPTH = 60_000n * 10n ** 18n;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];
const PERMIT2_ABI = [
  "function approve(address,address,uint160,uint48)",
  "function allowance(address,address,address) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
];
const ROUTER_ABI = ["function execute(bytes,bytes[],uint256) payable"];
const V4_QUOTER_ABI = [
  "function poolManager() view returns (address)",
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
];
const HOOK_ABI = [
  "function poolRegistered() view returns (bool)",
  "function registeredPoolId() view returns (bytes32)",
  "function protocolDepth(address) view returns (uint256)",
  "function buyCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function sellCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
];
const VAULT_ABI = [
  "function totalBaseFeeRecorded() view returns (uint256)",
  "function totalTokenFeeRecorded() view returns (uint256)",
  "event PoolFeeRecorded(address indexed currency,address indexed sender,uint256 amount,uint16 feeBps,bool isBuy)",
];
const POOL_MANAGER_ABI = ["function extsload(bytes32) view returns (bytes32)"];
const TRANSFER = new ethers.Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

type TradeEvidence = {
  sequence: number;
  usdcIn: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  secondsSincePrevious: number | null;
  hookFeeUsdc: string;
  terminalFeeBps: string;
  priorSameBlockFlowUsdc: string;
  reconstructedFeeUsdc: string;
  matchedBaseline: boolean;
  naraReceived: string;
  minimumNaraOut: string;
};

type WhaleObservation = {
  transactionHash: string;
  blockNumber: number;
  buyer: string;
  usdcIn: bigint;
  naraEquivalent: bigint;
};

type HedgeEvidence = {
  sequence: number;
  phase: string;
  triggerCount: number;
  triggerTransactions: string[];
  whaleUsdcTotal: string;
  whaleNaraEquivalentTotal: string;
  naraSold: string;
  usdcReceived: string;
  protectedMinimumUsdc: string;
  hookFeeNara: string;
  terminalFeeBps: string;
  effectiveFeeBps: string;
  priorSameBlockSellFlowNara: string;
  reconstructedFeeNara: string;
  vaultDeltaNara: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
};

type RunReport = {
  status: string;
  startedAt: string;
  finishedAt?: string;
  preflight: Record<string, unknown>;
  approvalTransactions: string[];
  buys: TradeEvidence[];
  whaleObservations: Array<Record<string, string>>;
  hedges: HedgeEvidence[];
  totals?: Record<string, unknown>;
  error?: string;
  cleanup?: Record<string, string>;
  finalAllowances?: Record<string, string>;
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function fetchHookLogsAdaptive(
  provider: ethers.JsonRpcProvider,
  address: string,
  topics: string[],
  fromBlock: number,
  toBlock: number
): Promise<ethers.Log[]> {
  let chunk = 5_000;
  const minChunk = 250;
  let cursor = fromBlock;
  const collected: ethers.Log[] = [];
  while (cursor <= toBlock) {
    const upper = Math.min(cursor + chunk - 1, toBlock);
    try {
      const logs = await provider.getLogs({
        address,
        fromBlock: cursor,
        toBlock: upper,
        topics,
      });
      collected.push(...logs);
      cursor = upper + 1;
      if (chunk < 5_000) chunk = Math.min(chunk * 2, 5_000);
      await delay(150);
    } catch (error) {
      if (chunk <= minChunk) throw error;
      chunk = Math.max(minChunk, Math.floor(chunk / 2));
      console.log(
        `getLogs reduced chunk to ${chunk} at blocks ${cursor}-${upper}`
      );
    }
  }
  return collected;
}

async function ensureGasHeadroom(
  provider: ethers.JsonRpcProvider,
  walletAddress: string,
  estimate: bigint
): Promise<void> {
  const feeData = await provider.getFeeData();
  const feeCap = feeData.maxFeePerGas ?? feeData.gasPrice;
  const liveEthBalance = await provider.getBalance(walletAddress);
  if (!feeCap || liveEthBalance < estimate * feeCap) {
    throw new Error("Wallet ETH balance is below the transaction fee cap");
  }
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const hedgeRequested = process.argv.includes("--hedge");
  if (
    execute &&
    process.env.V4_LIVE_TEN_MIN_BUY_CONFIRMATION?.trim() !==
      EXECUTION_CONFIRMATION
  ) {
    throw new Error(
      `Execution requires V4_LIVE_TEN_MIN_BUY_CONFIRMATION=${EXECUTION_CONFIRMATION}`
    );
  }
  if (execute && hedgeRequested) {
    if (
      process.env.V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION?.trim() !==
      HEDGE_CONFIRMATION
    ) {
      throw new Error(
        `Armed hedging additionally requires V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION=${HEDGE_CONFIRMATION}`
      );
    }
  }
  const hedgeMode: "OFF" | "DRY_RUN" | "ARMED" = !hedgeRequested
    ? "OFF"
    : execute
    ? "ARMED"
    : "DRY_RUN";

  // --instant: speed-optimized hedging (execute+armed only). ~250 ms background
  // watcher with WebSocket push when BASE_WS_RPC_URL is set, quiet-gate bypass,
  // and a standing Permit2 NARA approval so hedges need zero approval txs.
  const instantFlagged = process.argv.includes("--instant");
  const INSTANT_HEDGE = instantFlagged && execute && hedgeMode === "ARMED";
  if (instantFlagged && !INSTANT_HEDGE) {
    console.log(
      "note: --instant requires --execute + --hedge; running standard mode"
    );
  }
  let instantWatcherActive = false;
  let instantWatcherBusy = false;

  let provider: ethers.Provider;
  const config = currentV4Config();

  // RPC resilience: fail over per-request across every configured Base
  // endpoint (primary then fallback) so a single flaky public endpoint can
  // no longer abort a live run mid-sequence (2026-08-25 lesson).
  const rpcCandidates: string[] = [
    process.env.BASE_MAINNET_RPC_URL,
    process.env.BASE_RPC_URL,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value !== "" && value.startsWith("http"));
  if (rpcCandidates.length === 0) rpcCandidates.push(requiredBaseRpcUrl());
  const uniqueRpcCandidates = [...new Set(rpcCandidates)];
  if (uniqueRpcCandidates.length === 1) {
    const request = new ethers.FetchRequest(uniqueRpcCandidates[0]);
    request.timeout = 30_000;
    const providerSingle = new ethers.JsonRpcProvider(
      request,
      Number(BASE_CHAIN_ID),
      { staticNetwork: true, batchMaxCount: 1 }
    );
    provider = providerSingle;
  } else {
    provider = new ethers.FallbackProvider(
      uniqueRpcCandidates.map((url, index) => ({
        provider: (() => {
          const req = new ethers.FetchRequest(url);
          req.timeout = 20_000;
          return new ethers.JsonRpcProvider(req, Number(BASE_CHAIN_ID), {
            staticNetwork: true,
            batchMaxCount: 1,
          });
        })(),
        priority: index + 1,
        weight: 1,
        stallTimeout: index === 0 ? 2_500 : 4_000,
      })),
      Number(BASE_CHAIN_ID),
      { quorum: 1 }
    );
  }
  const expectedWallet = ethers.getAddress(requiredEnv("V4_DEPLOYER"));
  const wallet = execute
    ? new ethers.Wallet(requiredEnv("PRIVATE_KEY"), provider)
    : new ethers.VoidSigner(expectedWallet, provider);
  if (wallet.address.toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new Error(
      `PRIVATE_KEY signer ${wallet.address} does not match V4_DEPLOYER ${expectedWallet}`
    );
  }

  assertExact("V4_DEPLOYER", expectedWallet, SAME_BLOCK_EXPECTED.wallet);
  assertExact("V4_NARA_TOKEN", config.token, SAME_BLOCK_EXPECTED.token);
  assertExact("V4_BASE_TOKEN", config.base, SAME_BLOCK_EXPECTED.base);
  assertExact("V4_HOOK", config.hook, SAME_BLOCK_EXPECTED.hook);
  assertExact("V4_VAULT", config.vault, SAME_BLOCK_EXPECTED.vault);
  assertExact("V4_ENGINE", config.engine, SAME_BLOCK_EXPECTED.engine);
  assertExact(
    "V4_POOL_MANAGER",
    config.poolManager,
    SAME_BLOCK_EXPECTED.poolManager
  );
  assertExact("V4_PERMIT2", config.permit2, SAME_BLOCK_EXPECTED.permit2);
  assertExact(
    "V4_UNIVERSAL_ROUTER",
    config.universalRouter,
    SAME_BLOCK_EXPECTED.universalRouter
  );
  assertExact("V4_POOL_ID", config.poolId, SAME_BLOCK_EXPECTED.poolId);
  if (
    config.fee !== SAME_BLOCK_EXPECTED.fee ||
    config.tickSpacing !== SAME_BLOCK_EXPECTED.tickSpacing ||
    config.lpTokenId !== SAME_BLOCK_EXPECTED.lpTokenId
  ) {
    throw new Error(
      "Pool parameters or LP token ID differ from activation evidence"
    );
  }

  const usdc = new ethers.Contract(config.base, ERC20_ABI, wallet);
  const nara = new ethers.Contract(config.token, ERC20_ABI, wallet);
  const permit2 = new ethers.Contract(config.permit2, PERMIT2_ABI, wallet);
  const router = new ethers.Contract(
    config.universalRouter,
    ROUTER_ABI,
    wallet
  );
  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  const vault = new ethers.Contract(config.vault, VAULT_ABI, provider);
  const poolManager = new ethers.Contract(
    config.poolManager,
    POOL_MANAGER_ABI,
    provider
  );
  const quoter = new ethers.Contract(
    SAME_BLOCK_EXPECTED.v4Quoter,
    V4_QUOTER_ABI,
    provider
  );

  const network = await provider.getNetwork();
  if (network.chainId !== BASE_CHAIN_ID) {
    throw new Error(`Expected Base chain 8453, got ${network.chainId}`);
  }
  const preflightBlock = await provider.getBlock("latest");
  if (!preflightBlock || !preflightBlock.hash) {
    throw new Error("Could not pin the Base preflight block");
  }

  const codeEntries = [
    ["token", config.token],
    ["vault", config.vault],
    ["hook", config.hook],
    ["poolManager", config.poolManager],
    ["base", config.base],
    ["permit2", config.permit2],
    ["universalRouter", config.universalRouter],
    ["v4Quoter", SAME_BLOCK_EXPECTED.v4Quoter],
  ] as const;
  const codes = await Promise.all(
    codeEntries.map(([, address]) =>
      provider.getCode(address, preflightBlock.number)
    )
  );
  for (let index = 0; index < codeEntries.length; index += 1) {
    const [label] = codeEntries[index];
    const code = codes[index];
    if (code === "0x") {
      throw new Error(
        `${label} has no runtime code at the pinned preflight block`
      );
    }
    const expectedHash = SAME_BLOCK_EXPECTED_CODE_HASHES[label];
    if (
      !expectedHash ||
      ethers.keccak256(code).toLowerCase() !== expectedHash.toLowerCase()
    ) {
      throw new Error(
        `${label} runtime code hash does not match immutable evidence`
      );
    }
  }
  const quoterPoolManager = (await quoter.poolManager({
    blockTag: preflightBlock.number,
  })) as string;
  assertExact(
    "V4Quoter.poolManager",
    quoterPoolManager,
    SAME_BLOCK_EXPECTED.poolManager
  );

  const poolState = await readPoolStateAt(
    poolManager,
    config.poolId,
    preflightBlock.number
  );
  const [
    registered,
    registeredPoolId,
    usdcDepth,
    naraDepthResult,
    buyCurveResult,
    sellCurveResult,
    usdcBalance,
    naraBalance,
    ethBalance,
    usdcErc20Allowance,
    usdcPermit2Allowance,
    naraErc20Allowance,
    naraPermit2Allowance,
    baseFeeRecorded,
    tokenFeeRecorded,
  ] = await Promise.all([
    hook.poolRegistered({
      blockTag: preflightBlock.number,
    }) as Promise<boolean>,
    hook.registeredPoolId({
      blockTag: preflightBlock.number,
    }) as Promise<string>,
    hook.protocolDepth(config.base, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    hook.protocolDepth(config.token, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    hook.buyCurve({ blockTag: preflightBlock.number }) as Promise<
      readonly bigint[]
    >,
    hook.sellCurve({ blockTag: preflightBlock.number }) as Promise<
      readonly bigint[]
    >,
    usdc.balanceOf(wallet.address, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    nara.balanceOf(wallet.address, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    provider.getBalance(wallet.address, preflightBlock.number),
    usdc.allowance(wallet.address, config.permit2, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    permit2.allowance(wallet.address, config.base, config.universalRouter, {
      blockTag: preflightBlock.number,
    }) as Promise<[bigint, bigint, bigint]>,
    nara.allowance(wallet.address, config.permit2, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    permit2.allowance(wallet.address, config.token, config.universalRouter, {
      blockTag: preflightBlock.number,
    }) as Promise<[bigint, bigint, bigint]>,
    vault.totalBaseFeeRecorded({
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    vault.totalTokenFeeRecorded({
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
  ]);
  const buyCurve = buyCurveResult
    .slice(0, 8)
    .map(BigInt) as unknown as FeeCurve;
  const sellCurve = sellCurveResult
    .slice(0, 8)
    .map(BigInt) as unknown as FeeCurve;
  if (!registered || registeredPoolId.toLowerCase() !== config.poolId) {
    throw new Error("Fresh pool is not registered");
  }
  if (poolState.sqrtPriceX96 === 0n || poolState.liquidity === 0n) {
    throw new Error("Fresh pool is uninitialized or has zero active liquidity");
  }
  if (usdcDepth !== EXPECTED_USDC_DEPTH) {
    throw new Error(`Unexpected configured USDC depth: ${usdcDepth}`);
  }
  if (naraDepthResult !== EXPECTED_NARA_DEPTH) {
    throw new Error(`Unexpected configured NARA depth: ${naraDepthResult}`);
  }
  if (buyCurve.some((value, index) => value !== EXPECTED_BUY_CURVE[index])) {
    throw new Error(
      "Active buy curve differs from the executed seller-weighted policy curve"
    );
  }
  if (sellCurve.some((value, index) => value !== EXPECTED_SELL_CURVE[index])) {
    throw new Error(
      "Active sell curve differs from the approved activation curve"
    );
  }
  const baselinePerBuy = cumulativeFee(buyCurve, BUY_USDC, EXPECTED_USDC_DEPTH);
  if (baselinePerBuy !== EXPECTED_PER_BUY_FEE_USDC) {
    throw new Error(
      `Expected 0.33 USDC per-isolated-buy fee, got ${baselinePerBuy}`
    );
  }
  if (usdcBalance < BUY_TOTAL_USDC) {
    throw new Error(
      `Wallet has less than the approved ${ethers.formatUnits(
        BUY_TOTAL_USDC,
        6
      )} USDC budget`
    );
  }
  if (ethBalance < ethers.parseEther("0.001")) {
    throw new Error("Wallet has less than the 0.001 ETH gas floor");
  }
  if (usdcErc20Allowance !== 0n || usdcPermit2Allowance[0] !== 0n) {
    throw new Error("Expected clean zero USDC allowances before the run");
  }
  // Pre-existing NARA approvals are PRESERVED, never clobbered or revoked:
  // the wallet may carry intentional standing grants from other workflows.
  // Exact per-hedge approvals are issued only when starting from zero.
  const preserveNaraErc20Approval = naraErc20Allowance !== 0n;
  const preserveNaraPermit2Approval = naraPermit2Allowance[0] !== 0n;

  const quoteParams = (exactAmount: bigint, isBuy: boolean) => ({
    poolKey: {
      currency0: config.canonicalPoolKey.currency0,
      currency1: config.canonicalPoolKey.currency1,
      fee: config.fee,
      tickSpacing: config.tickSpacing,
      hooks: config.hook,
    },
    zeroForOne: isBuy
      ? !config.canonicalPoolKey.tokenIsCurrency0
      : config.canonicalPoolKey.tokenIsCurrency0,
    exactAmount,
    hookData: "0x",
  });
  const sanityQuote = (await quoter.quoteExactInputSingle.staticCall(
    quoteParams(BUY_USDC, true),
    { blockTag: preflightBlock.number }
  )) as [bigint, bigint];
  if (sanityQuote[0] === 0n) {
    throw new Error(
      "Official V4Quoter returned a zero NARA output during preflight"
    );
  }

  const preflight = {
    mode: execute ? "EXECUTE" : "READ_ONLY",
    hedge: {
      mode: hedgeMode,
      triggerUsdc: ethers.formatUnits(HEDGE_TRIGGER_RAW, 6),
      sellRatioBps: HEDGE_RATIO_BPS.toString(),
      maxHedgeSells: String(MAX_HEDGE_SELLS),
      minSellUsdcOut: ethers.formatUnits(MIN_HEDGE_USDC_OUT, 6),
      burstQuietBlocks: String(HEDGE_QUIET_BLOCKS),
      instant: INSTANT_HEDGE,
      detectionPollMs: INSTANT_HEDGE ? 250 : null,
      instantNote:
        "Instant bypasses the quiet gate (split whales may hedge per event); standing NARA Permit2 cap via V4_STANDING_NARA_CAP (default 25000).",
      note:
        "Whale-equivalent NARA is quoted at each whale trade's own block; bursts " +
        "aggregate into one hedge of 90% of the total once quiet.",
    },
    chainId: network.chainId.toString(),
    wallet: wallet.address,
    privateKey: "loaded locally; never displayed",
    buyCount: BUY_COUNT,
    amountPerBuyUsdc: ethers.formatUnits(BUY_USDC, 6),
    totalBuyBudgetUsdc: ethers.formatUnits(BUY_TOTAL_USDC, 6),
    delaySeconds: DELAY_SECONDS,
    usdcBalance: ethers.formatUnits(usdcBalance, 6),
    naraBalance: ethers.formatUnits(naraBalance, 18),
    ethBalance: ethers.formatEther(ethBalance),
    preflightBlock: preflightBlock.number,
    preflightBlockHash: preflightBlock.hash,
    poolId: config.poolId,
    sqrtPriceX96: poolState.sqrtPriceX96.toString(),
    activeLiquidity: poolState.liquidity.toString(),
    allowancesClean: true,
    naraAllowancesObserved: {
      erc20ToPermit2:
        naraErc20Allowance === (1n << 256n) - 1n
          ? "max uint256 (infinite; pre-existing, preserved)"
          : ethers.formatUnits(naraErc20Allowance, 18),
      permit2ToRouterAmount: naraPermit2Allowance[0].toString(),
      preservedErc20: preserveNaraErc20Approval,
      preservedPermit2: preserveNaraPermit2Approval,
      note:
        "Pre-existing NARA grants are never clobbered or revoked by this runner. " +
        "USDC allowances must start at zero and are revoked after the run.",
    },
    vaultBaseFeeRecordedBeforeUsdc: ethers.formatUnits(baseFeeRecorded, 6),
    vaultTokenFeeRecordedBeforeNara: ethers.formatUnits(tokenFeeRecorded, 18),
  };
  console.log(JSON.stringify(preflight, null, 2));
  if (!execute) return;

  const report: RunReport = {
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    preflight,
    approvalTransactions: [],
    buys: [],
    whaleObservations: [],
    hedges: [],
  };
  const outputDir = resolve(repoRoot, "deployments");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(
    outputDir,
    "v4-live-buy-tax-tenmin-100x11-bigbuy-hedge-latest.json"
  );
  const persist = () =>
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  persist();

  const ourTxHashes = new Set<string>();
  const hookInterface = new ethers.Interface(HOOK_ABI);
  const vaultInterface = new ethers.Interface(VAULT_ABI);
  const hookTopic = hookInterface.getEvent("PoolFeeTaken")?.topicHash;
  const vaultTopic = vaultInterface.getEvent("PoolFeeRecorded")?.topicHash;
  const transferTopic = TRANSFER.getEvent("Transfer")?.topicHash;
  if (!hookTopic || !vaultTopic || !transferTopic) {
    throw new Error("Required event topic is missing");
  }

  // ---- Hedge state -------------------------------------------------------
  const whaleQueue: WhaleObservation[] = [];
  let whaleScanCursor = preflightBlock.number;
  let lastWhaleBlock = -1;
  let hedgeSequence = 0;
  let hedgeFailures = 0;
  let previousLegBlock = 0;
  let whaleQuietStreakBlocks = 0;
  let lastObservedBlock = whaleScanCursor;

  const scanForWhales = async (): Promise<void> => {
    try {
      const latest = await provider.getBlock("latest");
      if (!latest) return;
      const target = latest.number - FOLLOW_FINALIZED_LAG;
      if (target <= whaleScanCursor) return;
      const logs = await fetchHookLogsAdaptive(
        provider as ethers.JsonRpcProvider,
        config.hook,
        [hookTopic, config.poolId],
        whaleScanCursor + 1,
        target
      );
      const sorted = logs.sort((a, b) =>
        a.blockNumber === b.blockNumber
          ? a.index - b.index
          : a.blockNumber - b.blockNumber
      );
      for (const log of sorted) {
        if (log.blockNumber > lastObservedBlock) {
          lastObservedBlock = log.blockNumber;
          whaleQuietStreakBlocks += 1;
        }
        const txHash = (log.transactionHash ?? "").toLowerCase();
        if (ourTxHashes.has(txHash)) continue;
        const parsed = parsedLog(hookInterface, log);
        if (parsed.args.currency.toLowerCase() !== config.base.toLowerCase())
          continue;
        if (parsed.args.isBuy !== true) continue;
        const amountIn = parsed.args.amountIn as bigint;
        if (amountIn < HEDGE_TRIGGER_RAW) continue;
        const receipt = await provider.getTransactionReceipt(txHash);
        if (
          !receipt ||
          receipt.status !== 1 ||
          receipt.blockNumber !== log.blockNumber
        ) {
          throw new Error(
            `Whale trigger receipt unavailable or non-canonical: ${txHash}`
          );
        }
        const [naraEquivalent] = (await quoter.quoteExactInputSingle.staticCall(
          quoteParams(amountIn, true),
          { blockTag: log.blockNumber }
        )) as [bigint, bigint];
        if (naraEquivalent === 0n) {
          throw new Error(
            `Quoter returned zero whale-equivalent NARA for ${txHash}`
          );
        }
        whaleQueue.push({
          transactionHash: txHash,
          blockNumber: log.blockNumber,
          buyer: ethers.getAddress(receipt.from),
          usdcIn: amountIn,
          naraEquivalent,
        });
        lastWhaleBlock = Math.max(lastWhaleBlock, log.blockNumber);
        whaleQuietStreakBlocks = 0;
        const observation = {
          transactionHash: txHash,
          blockNumber: String(log.blockNumber),
          buyer: ethers.getAddress(receipt.from),
          routerSender: ethers.getAddress(parsed.args.sender as string),
          usdcIn: ethers.formatUnits(amountIn, 6),
          naraEquivalent: ethers.formatUnits(naraEquivalent, 18),
        };
        report.whaleObservations.push(observation);
        persist();
        console.log(
          JSON.stringify({
            whaleObserved: report.whaleObservations.length,
            ...observation,
          })
        );
      }
      whaleScanCursor = target;
    } catch (error) {
      // Scanner failures are auxiliary: never abort the approved buy matrix.
      console.log(
        `whale scan skipped this cycle: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const executeHedge = async (phase: string): Promise<void> => {
    if (hedgeMode === "OFF" || whaleQueue.length === 0) return;
    if (hedgeSequence >= MAX_HEDGE_SELLS) {
      console.log(`hedge skipped: per-run cap ${MAX_HEDGE_SELLS} reached`);
      return;
    }
    const latest = await provider.getBlock("latest");
    if (!latest) return;
    if (
      !INSTANT_HEDGE &&
      lastWhaleBlock >= 0 &&
      latest.number - lastWhaleBlock < HEDGE_QUIET_BLOCKS
    ) {
      return; // burst may still be running; wait for quiet before pricing the total
    }
    const bucketNara = whaleQueue.reduce(
      (sum, whale) => sum + whale.naraEquivalent,
      0n
    );
    let hedgeAmount = (bucketNara * HEDGE_RATIO_BPS) / BPS;
    const [liveNaraBalance, liveNaraErc20Allowance] = await Promise.all([
      nara.balanceOf(wallet.address) as Promise<bigint>,
      preserveNaraErc20Approval
        ? (nara.allowance(wallet.address, config.permit2) as Promise<bigint>)
        : Promise.resolve(0n),
    ]);
    if (hedgeAmount > liveNaraBalance) hedgeAmount = liveNaraBalance;
    if (
      preserveNaraErc20Approval &&
      liveNaraErc20Allowance !== (1n << 256n) - 1n &&
      liveNaraErc20Allowance < hedgeAmount
    ) {
      console.log(
        "hedge skipped: preserved standing NARA approval cannot cover the bucket"
      );
      return;
    }
    if (hedgeAmount === 0n) {
      console.log("hedge skipped: bucket rounds to zero NARA");
      whaleQueue.length = 0;
      return;
    }

    // ---- Quote and dust guard -------------------------------------------
    let activeBlock = latest;
    let quote = 0n;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const [candidateQuote] = (await quoter.quoteExactInputSingle.staticCall(
        quoteParams(hedgeAmount, false),
        { blockTag: activeBlock.number }
      )) as [bigint, bigint];
      quote = candidateQuote;
      if (attempt === 1 && quote < MIN_HEDGE_USDC_OUT) {
        console.log(
          `hedge skipped: quoted ${ethers.formatUnits(
            quote,
            6
          )} USDC below dust floor`
        );
        return;
      }
      break;
    }
    if (quote === 0n)
      throw new Error("Official V4Quoter returned zero USDC for the hedge");

    if (hedgeMode === "DRY_RUN") {
      console.log(
        JSON.stringify({
          wouldHedge: true,
          phase,
          naraToSell: ethers.formatUnits(hedgeAmount, 18),
          quotedUsdcOut: ethers.formatUnits(quote, 6),
          triggers: whaleQueue.map((whale) => whale.transactionHash),
        })
      );
      whaleQueue.length = 0;
      return;
    }

    const ensureHedgeApprovals = async (): Promise<void> => {
      if (!preserveNaraErc20Approval) {
        const approval = await sendWithMargin(
          provider,
          "NARA exact approval to Permit2 (hedge)",
          () => nara.approve.estimateGas(config.permit2, hedgeAmount),
          (gasLimit) => nara.approve(config.permit2, hedgeAmount, { gasLimit })
        );
        report.approvalTransactions.push(approval.hash);
      }
      const approvalBlock = await provider.getBlock("latest");
      if (!approvalBlock)
        throw new Error("Could not read Permit2 approval timestamp");
      const expiration = BigInt(approvalBlock.timestamp + 3_600);
      if (!preserveNaraPermit2Approval) {
        const liveNaraPermit = await permit2.allowance(
          wallet.address,
          config.token,
          config.universalRouter
        );
        if (liveNaraPermit[0] < hedgeAmount) {
          const permitApproval = await sendWithMargin(
            provider,
            "Permit2 exact NARA approval to Universal Router (hedge)",
            () =>
              permit2.approve.estimateGas(
                config.token,
                config.universalRouter,
                hedgeAmount,
                expiration
              ),
            (gasLimit) =>
              permit2.approve(
                config.token,
                config.universalRouter,
                hedgeAmount,
                expiration,
                { gasLimit }
              )
          );
          report.approvalTransactions.push(permitApproval.hash);
        }
      }
      persist();
    };

    // ---- Real hedge execution -------------------------------------------
    hedgeSequence += 1;
    const triggerTransactions = whaleQueue.map(
      (whale) => whale.transactionHash
    );
    const whaleUsdcTotal = whaleQueue.reduce(
      (sum, whale) => sum + whale.usdcIn,
      0n
    );
    const whaleNaraTotal = bucketNara;
    // Consume the whole queue: this hedge prices the FULL burst total.
    whaleQueue.length = 0;

    // Approvals MUST precede simulation: the hedge settles NARA via Permit2,
    // so an unset/expired Permit2 allowance makes every simulation revert
    // regardless of market conditions (root cause of the 2026-08-25 abort).
    await ensureHedgeApprovals();

    let stateBlock = activeBlock;
    let amountOutMinimum = 0n;
    let deadline = 0n;
    let commands = "";
    let v4Input = "";
    const buildCalldata = (minimum: bigint, blockTimestamp: number): void => {
      const abi = ethers.AbiCoder.defaultAbiCoder();
      const swapParams = abi.encode(
        [
          "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
        ],
        [
          [
            [
              config.canonicalPoolKey.currency0,
              config.canonicalPoolKey.currency1,
              config.fee,
              config.tickSpacing,
              config.hook,
            ],
            config.canonicalPoolKey.tokenIsCurrency0,
            hedgeAmount,
            minimum,
            "0x",
          ],
        ]
      );
      const settleParams = abi.encode(
        ["address", "uint256"],
        [config.token, hedgeAmount]
      );
      const takeParams = abi.encode(
        ["address", "uint256"],
        [config.base, minimum]
      );
      const actions = ethers.hexlify(
        new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL])
      );
      const encoded = abi.encode(
        ["bytes", "bytes[]"],
        [actions, [swapParams, settleParams, takeParams]]
      );
      commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
      v4Input = encoded;
      deadline = BigInt(blockTimestamp + 600);
      amountOutMinimum = minimum;
    };

    const approveAndSend = async (): Promise<ethers.TransactionReceipt> => {
      const [naraBefore, usdcBefore, tokenFeeBefore] = await Promise.all([
        nara.balanceOf(wallet.address, {
          blockTag: stateBlock.number,
        }) as Promise<bigint>,
        usdc.balanceOf(wallet.address, {
          blockTag: stateBlock.number,
        }) as Promise<bigint>,
        vault.totalTokenFeeRecorded({
          blockTag: stateBlock.number,
        }) as Promise<bigint>,
      ]);
      const estimatedGas = await router.execute.estimateGas(
        commands,
        [v4Input],
        deadline
      );
      const gasLimit = (estimatedGas * 120n + 99n) / 100n;
      await ensureGasHeadroom(
        provider as ethers.JsonRpcProvider,
        wallet.address,
        gasLimit
      );

      const transaction = await router.execute(commands, [v4Input], deadline, {
        gasLimit,
      });
      const receipt = await canonicalReceipt(provider, transaction);
      if (receipt.blockNumber <= previousLegBlock) {
        throw new Error(
          `Hedge ${hedgeSequence} was not mined in a distinct later block`
        );
      }
      previousLegBlock = receipt.blockNumber;
      ourTxHashes.add(receipt.hash.toLowerCase());
      report.approvalTransactions.push(transaction.hash);

      // ---- Verification --------------------------------------------------
      const [naraAfter, usdcAfter, tokenFeeAfter, poolAfter] =
        await Promise.all([
          nara.balanceOf(wallet.address, {
            blockTag: receipt.blockNumber,
          }) as Promise<bigint>,
          usdc.balanceOf(wallet.address, {
            blockTag: receipt.blockNumber,
          }) as Promise<bigint>,
          vault.totalTokenFeeRecorded({
            blockTag: receipt.blockNumber,
          }) as Promise<bigint>,
          readPoolStateAt(poolManager, config.poolId, receipt.blockNumber),
        ]);
      const usdcReceived = usdcAfter - usdcBefore;
      if (naraBefore - naraAfter !== hedgeAmount) {
        throw new Error(
          `Hedge ${hedgeSequence} did not spend exactly the planned NARA`
        );
      }
      if (usdcReceived < amountOutMinimum) {
        throw new Error(
          `Hedge ${hedgeSequence} USDC output is below its protected minimum`
        );
      }

      const allBlockHookLogs = await provider.getLogs({
        address: config.hook,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        topics: [hookTopic, config.poolId],
      });
      let ourSellEvent: ethers.LogDescription | null = null;
      let priorSellFlow = 0n;
      for (const log of allBlockHookLogs.sort((a, b) => a.index - b.index)) {
        const parsed = parsedLog(hookInterface, log);
        if (parsed.args.currency.toLowerCase() !== config.token.toLowerCase())
          continue;
        if (parsed.args.isBuy === true) continue;
        if (
          (log.transactionHash ?? "").toLowerCase() ===
          receipt.hash.toLowerCase()
        ) {
          if (ourSellEvent === null) ourSellEvent = parsed;
          continue;
        }
        priorSellFlow += parsed.args.amountIn as bigint;
      }
      if (!ourSellEvent)
        throw new Error(`Hedge ${hedgeSequence} Hook sell event missing`);
      const feeAmount = ourSellEvent.args.feeAmount as bigint;
      const feeBps = ourSellEvent.args.feeBps as bigint;
      if (
        (ourSellEvent.args.sender as string).toLowerCase() !==
        config.universalRouter.toLowerCase()
      ) {
        throw new Error(
          `Hedge ${hedgeSequence} sender is not the Universal Router`
        );
      }
      if ((ourSellEvent.args.amountIn as bigint) !== hedgeAmount) {
        throw new Error(`Hedge ${hedgeSequence} Hook amountIn mismatch`);
      }
      const reconstructedDue =
        cumulativeFee(
          sellCurve,
          priorSellFlow + hedgeAmount,
          EXPECTED_NARA_DEPTH
        ) - cumulativeFee(sellCurve, priorSellFlow, EXPECTED_NARA_DEPTH);
      const reconstructedTier = terminalFeeBps(
        sellCurve,
        priorSellFlow + hedgeAmount,
        EXPECTED_NARA_DEPTH
      );
      if (feeAmount !== reconstructedDue || feeBps !== reconstructedTier) {
        throw new Error(
          `Hedge ${hedgeSequence} tax mismatch: event=${feeAmount}/${feeBps} reconstructed=${reconstructedDue}/${reconstructedTier}`
        );
      }

      const vaultEvents = receipt.logs
        .filter(
          (log) =>
            log.address.toLowerCase() === config.vault.toLowerCase() &&
            log.topics[0] === vaultTopic
        )
        .map((log) => parsedLog(vaultInterface, log))
        .filter(
          (parsed) =>
            parsed.args.currency.toLowerCase() === config.token.toLowerCase() &&
            parsed.args.isBuy === false
        );
      if (vaultEvents.length !== 1) {
        throw new Error(
          `Hedge ${hedgeSequence}: expected one matching Vault fee event`
        );
      }
      if (
        (vaultEvents[0].args.amount as bigint) !== feeAmount ||
        (vaultEvents[0].args.feeBps as bigint) !== feeBps
      ) {
        throw new Error(
          `Hedge ${hedgeSequence} Vault accounting does not match the Hook event`
        );
      }
      const feeTransfers = receipt.logs
        .filter(
          (log) =>
            log.address.toLowerCase() === config.token.toLowerCase() &&
            log.topics[0] === transferTopic
        )
        .map((log) => parsedLog(TRANSFER, log))
        .filter(
          (parsed) =>
            parsed.args.from.toLowerCase() ===
              config.poolManager.toLowerCase() &&
            parsed.args.to.toLowerCase() === config.vault.toLowerCase()
        )
        .reduce((sum, parsed) => sum + (parsed.args.value as bigint), 0n);
      if (feeTransfers !== feeAmount) {
        throw new Error(
          `Hedge ${hedgeSequence} PoolManager-to-Vault NARA fee transfer does not reconcile`
        );
      }
      if (tokenFeeAfter - tokenFeeBefore !== feeAmount) {
        throw new Error(
          `Hedge ${hedgeSequence} Vault lifetime NARA fee did not increase exactly`
        );
      }

      const evidence: HedgeEvidence = {
        sequence: hedgeSequence,
        phase,
        triggerCount: triggerTransactions.length,
        triggerTransactions,
        whaleUsdcTotal: ethers.formatUnits(whaleUsdcTotal, 6),
        whaleNaraEquivalentTotal: ethers.formatUnits(whaleNaraTotal, 18),
        naraSold: ethers.formatUnits(hedgeAmount, 18),
        usdcReceived: ethers.formatUnits(usdcReceived, 6),
        protectedMinimumUsdc: ethers.formatUnits(amountOutMinimum, 6),
        hookFeeNara: ethers.formatUnits(feeAmount, 18),
        terminalFeeBps: feeBps.toString(),
        effectiveFeeBps: ((feeAmount * BPS) / hedgeAmount).toString(),
        priorSameBlockSellFlowNara: ethers.formatUnits(priorSellFlow, 18),
        reconstructedFeeNara: ethers.formatUnits(reconstructedDue, 18),
        vaultDeltaNara: ethers.formatUnits(tokenFeeAfter - tokenFeeBefore, 18),
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
      };
      report.hedges.push(evidence);
      persist();
      console.log(
        JSON.stringify({
          hedgeExecuted: `${hedgeSequence}/${MAX_HEDGE_SELLS}`,
          ...evidence,
        })
      );

      const sqrtAfterString = poolAfter.sqrtPriceX96.toString();
      void sqrtAfterString;
      void naraAfter;
      return receipt;
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const [freshQuote] = (await quoter.quoteExactInputSingle.staticCall(
        quoteParams(hedgeAmount, false),
        { blockTag: stateBlock.number }
      )) as [bigint, bigint];
      quote = freshQuote;
      buildCalldata(
        (quote * (BPS - OUTPUT_TOLERANCE_BPS)) / BPS,
        stateBlock.timestamp
      );
      try {
        await router.execute.staticCall(commands, [v4Input], deadline);
        await approveAndSend();
        break;
      } catch (simError) {
        if (attempt === 2) throw simError;
        console.log(
          `Hedge ${hedgeSequence}: simulation reverted; re-pinning state and retrying once`
        );
        await delay(1_000);
        let fresher = await provider.getBlock("latest");
        while (!fresher || fresher.number <= stateBlock.number) {
          await delay(1_000);
          fresher = await provider.getBlock("latest");
        }
        if (!fresher.hash)
          throw new Error(
            `Hedge ${hedgeSequence} could not re-pin its block hash`
          );
        stateBlock = fresher;
      }
    }
  };

  const guardedHedge = async (phase: string): Promise<void> => {
    if (hedgeFailures >= 3) return;
    try {
      await executeHedge(phase);
    } catch (error) {
      hedgeFailures += 1;
      console.log(
        JSON.stringify({
          hedgeFailed: phase,
          failureCount: hedgeFailures,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  };

  try {
    const approval = await sendWithMargin(
      provider,
      "USDC exact approval to Permit2",
      () => usdc.approve.estimateGas(config.permit2, BUY_TOTAL_USDC),
      (gasLimit) => usdc.approve(config.permit2, BUY_TOTAL_USDC, { gasLimit })
    );
    report.approvalTransactions.push(approval.hash);
    const latestForExpiry = await provider.getBlock("latest");
    if (!latestForExpiry)
      throw new Error("Could not read Base timestamp for Permit2 expiration");
    const expiration = BigInt(latestForExpiry.timestamp + 3_600);
    const permitApproval = await sendWithMargin(
      provider,
      "Permit2 exact approval to Universal Router",
      () =>
        permit2.approve.estimateGas(
          config.base,
          config.universalRouter,
          BUY_TOTAL_USDC,
          expiration
        ),
      (gasLimit) =>
        permit2.approve(
          config.base,
          config.universalRouter,
          BUY_TOTAL_USDC,
          expiration,
          { gasLimit }
        )
    );
    report.approvalTransactions.push(permitApproval.hash);
    persist();

    // ---- Instant-mode hot-path prep (execute+armed only) ------------------
    if (INSTANT_HEDGE) {
      // Standing Permit2 NARA allowance: hedges need zero approval txs.
      const capRaw = process.env.V4_STANDING_NARA_CAP?.trim();
      let cap =
        capRaw !== undefined && capRaw !== ""
          ? BigInt(capRaw)
          : 25_000n * 10n ** 18n;
      const liveBalance = (await nara.balanceOf(wallet.address)) as bigint;
      if (cap > liveBalance) cap = liveBalance;
      if (cap > 0n) {
        const capBlock = await provider.getBlock("latest");
        if (!capBlock)
          throw new Error("Could not read block for standing approval expiry");
        const expiry = BigInt(capBlock.timestamp + 7_200);
        const current = await permit2.allowance(
          wallet.address,
          config.token,
          config.universalRouter
        );
        if (current[0] < cap) {
          const feeData = await provider.getFeeData();
          const gasLimit =
            ((await permit2.approve.estimateGas(
              config.token,
              config.universalRouter,
              cap,
              expiry
            )) *
              120n +
              99n) /
            100n;
          const tx = await permit2.approve(
            config.token,
            config.universalRouter,
            cap,
            expiry,
            {
              gasLimit,
              maxFeePerGas: ((feeData.maxFeePerGas ?? 0n) * 120n) / 100n,
              maxPriorityFeePerGas:
                ((feeData.maxPriorityFeePerGas ?? 0n) * 120n) / 100n,
            }
          );
          const receipt = await tx.wait();
          if (!receipt || receipt.status !== 1)
            throw new Error("Standing NARA approval failed");
          report.approvalTransactions.push(receipt.hash);
          console.log(
            "Standing NARA Permit2 approval (" +
              ethers.formatUnits(cap, 18) +
              "): " +
              receipt.hash
          );
        }
      }

      // Background watcher: continuous ~250 ms scanning independent of the
      // buy schedule's own windows.
      instantWatcherActive = true;
      void (async (): Promise<void> => {
        while (instantWatcherActive) {
          if (!instantWatcherBusy) {
            instantWatcherBusy = true;
            try {
              await scanForWhales();
            } catch (error) {
              console.log(
                JSON.stringify({
                  watcherError:
                    error instanceof Error ? error.message : String(error),
                })
              );
            }
            instantWatcherBusy = false;
          }
          await delay(250);
        }
      })();

      // WebSocket push: matching hook events trigger an immediate scan
      // (~100-300 ms detection). Poll loop stays as fallback.
      let transport = "poll";
      const wsUrlRaw = (
        process.env.BASE_WS_RPC_URL ??
        process.env.V4_WS_RPC_URL ??
        ""
      ).trim();
      if (wsUrlRaw !== "") {
        try {
          const wsp = new ethers.WebSocketProvider(
            wsUrlRaw,
            Number(BASE_CHAIN_ID)
          );
          const hookEvent = new ethers.Interface(HOOK_ABI).getEvent(
            "PoolFeeTaken"
          );
          if (!hookEvent)
            throw new Error("PoolFeeTaken event missing from HOOK_ABI");
          wsp.on(
            {
              address: config.hook,
              topics: [
                hookEvent.topicHash,
                null,
                null,
                ethers.zeroPadValue(config.base, 32),
              ],
            },
            () => {
              void (async (): Promise<void> => {
                if (!instantWatcherBusy) {
                  instantWatcherBusy = true;
                  try {
                    await scanForWhales();
                  } catch {
                    /* poll loop reports its own errors */
                  }
                  instantWatcherBusy = false;
                }
              })();
            }
          );
          transport = "websocket";
        } catch (error) {
          console.log(
            JSON.stringify({
              wsInitFallbackToPoll:
                error instanceof Error ? error.message : String(error),
            })
          );
        }
      }
      console.log(
        JSON.stringify({ instantWatcher: "active", transport: transport })
      );
    }

    const intervalMs = DELAY_SECONDS * 1_000;
    const runStartedAtMs = Date.now();

    for (let sequence = 1; sequence <= BUY_COUNT; sequence += 1) {
      if (sequence > 1) {
        const targetMs = runStartedAtMs + (sequence - 1) * intervalMs;
        while (Date.now() < targetMs) {
          await scanForWhales();
          await guardedHedge("schedule-window");
          await delay(INSTANT_HEDGE ? 200 : WINDOW_POLL_MS);
        }
      } else {
        await scanForWhales();
        await guardedHedge("pre-run");
      }
      const startedAtMs = Date.now();
      let latestBlock = await provider.getBlock("latest");
      while (!latestBlock || latestBlock.number <= previousLegBlock) {
        await delay(1_000);
        latestBlock = await provider.getBlock("latest");
      }
      if (!latestBlock.hash) {
        throw new Error(
          `Buy ${sequence} could not pin its pre-trade block hash`
        );
      }

      const amountIn = BUY_USDC;
      const poolStateBefore = await readPoolStateAt(
        poolManager,
        config.poolId,
        latestBlock.number
      );
      if (
        poolStateBefore.sqrtPriceX96 === 0n ||
        poolStateBefore.liquidity === 0n
      ) {
        throw new Error("Pool is uninitialized or has zero active liquidity");
      }
      const [currency0, currency1] = config.canonicalPoolKey.tokenIsCurrency0
        ? [config.token, config.base]
        : [config.base, config.token];

      let activeBlock = latestBlock;
      let canonicalQuote = 0n;
      let amountOutMinimum = 0n;
      let deadline = 0n;
      let commands = "";
      let v4Input = "";
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const [quote] = (await quoter.quoteExactInputSingle.staticCall(
          quoteParams(amountIn, true),
          { blockTag: activeBlock.number }
        )) as [bigint, bigint];
        canonicalQuote = quote;
        if (canonicalQuote === 0n)
          throw new Error("Official V4Quoter returned zero NARA output");
        amountOutMinimum =
          (canonicalQuote * (BPS - OUTPUT_TOLERANCE_BPS)) / BPS;
        if (amountOutMinimum === 0n)
          throw new Error("Protected minimum NARA output is zero");
        deadline = BigInt(activeBlock.timestamp + 600);
        const abi = ethers.AbiCoder.defaultAbiCoder();
        const swapParams = abi.encode(
          [
            "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
          ],
          [
            [
              [
                currency0,
                currency1,
                config.fee,
                config.tickSpacing,
                config.hook,
              ],
              !config.canonicalPoolKey.tokenIsCurrency0,
              amountIn,
              amountOutMinimum,
              "0x",
            ],
          ]
        );
        const settleParams = abi.encode(
          ["address", "uint256"],
          [config.base, amountIn]
        );
        const takeParams = abi.encode(
          ["address", "uint256"],
          [config.token, 0n]
        );
        const actions = ethers.hexlify(
          new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL])
        );
        v4Input = abi.encode(
          ["bytes", "bytes[]"],
          [actions, [swapParams, settleParams, takeParams]]
        );
        commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
        try {
          await router.execute.staticCall(commands, [v4Input], deadline);
          break;
        } catch (simError) {
          if (attempt === 2) throw simError;
          console.log(
            `Buy ${sequence}: simulation reverted; re-pinning state and retrying once`
          );
          await delay(1_000);
          let fresher = await provider.getBlock("latest");
          while (!fresher || fresher.number <= activeBlock.number) {
            await delay(1_000);
            fresher = await provider.getBlock("latest");
          }
          if (!fresher.hash)
            throw new Error(`Buy ${sequence} could not re-pin its block hash`);
          activeBlock = fresher;
        }
      }
      latestBlock = activeBlock;
      const [usdcBefore, naraBefore, recordedBefore] = await Promise.all([
        usdc.balanceOf(wallet.address, {
          blockTag: latestBlock.number,
        }) as Promise<bigint>,
        nara.balanceOf(wallet.address, {
          blockTag: latestBlock.number,
        }) as Promise<bigint>,
        vault.totalBaseFeeRecorded({
          blockTag: latestBlock.number,
        }) as Promise<bigint>,
      ]);
      const receipt = await sendWithMargin(
        provider,
        `Buy ${sequence}/${BUY_COUNT} (${ethers.formatUnits(
          amountIn,
          6
        )} USDC)`,
        () => router.execute.estimateGas(commands, [v4Input], deadline),
        (gasLimit) =>
          router.execute(commands, [v4Input], deadline, { gasLimit })
      );
      if (receipt.blockNumber <= previousLegBlock) {
        throw new Error(
          `Buy ${sequence} was not mined in a distinct later block`
        );
      }
      previousLegBlock = receipt.blockNumber;
      ourTxHashes.add(receipt.hash.toLowerCase());
      const secondsSincePrevious =
        sequence === 1
          ? null
          : Math.round(
              (startedAtMs - (runStartedAtMs + (sequence - 2) * intervalMs)) /
                1_000
            );

      const receiptBlock = await provider.getBlock(receipt.blockNumber);
      if (!receiptBlock || receiptBlock.hash !== receipt.blockHash) {
        throw new Error(`Buy ${sequence} receipt block is no longer canonical`);
      }

      const allBlockHookLogs = await provider.getLogs({
        address: config.hook,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        topics: [hookTopic, config.poolId],
      });
      let ourEvent: ethers.LogDescription | null = null;
      let priorFlow = 0n;
      for (const log of allBlockHookLogs.sort((a, b) => a.index - b.index)) {
        const parsed = parsedLog(hookInterface, log);
        if (parsed.args.currency.toLowerCase() !== config.base.toLowerCase())
          continue;
        if (parsed.args.isBuy !== true) continue;
        if (
          (log.transactionHash ?? "").toLowerCase() ===
          receipt.hash.toLowerCase()
        ) {
          if (ourEvent === null) ourEvent = parsed;
          break;
        }
        priorFlow += parsed.args.amountIn as bigint;
      }
      if (!ourEvent) throw new Error(`Buy ${sequence} Hook fee event missing`);
      const feeAmount = ourEvent.args.feeAmount as bigint;
      const feeBps = ourEvent.args.feeBps as bigint;
      if (
        (ourEvent.args.sender as string).toLowerCase() !==
        config.universalRouter.toLowerCase()
      ) {
        throw new Error(
          `Buy ${sequence} Hook sender is not the Universal Router`
        );
      }
      if ((ourEvent.args.amountIn as bigint) !== amountIn) {
        throw new Error(`Buy ${sequence} Hook amountIn mismatch`);
      }
      const reconstructedDue =
        cumulativeFee(buyCurve, priorFlow + amountIn, EXPECTED_USDC_DEPTH) -
        cumulativeFee(buyCurve, priorFlow, EXPECTED_USDC_DEPTH);
      const reconstructedTier = terminalFeeBps(
        buyCurve,
        priorFlow + amountIn,
        EXPECTED_USDC_DEPTH
      );
      if (feeAmount !== reconstructedDue || feeBps !== reconstructedTier) {
        throw new Error(
          `Buy ${sequence} tax math mismatch: event=${feeAmount}/${feeBps} reconstructed=${reconstructedDue}/${reconstructedTier}`
        );
      }

      const vaultEvents = receipt.logs
        .filter(
          (log) =>
            log.address.toLowerCase() === config.vault.toLowerCase() &&
            log.topics[0] === vaultTopic
        )
        .map((log) => parsedLog(vaultInterface, log))
        .filter(
          (parsed) =>
            parsed.args.currency.toLowerCase() === config.base.toLowerCase() &&
            parsed.args.isBuy === true
        );
      if (vaultEvents.length !== 1) {
        throw new Error(
          `Buy ${sequence}: expected one matching Vault fee event`
        );
      }
      if (
        (vaultEvents[0].args.amount as bigint) !== feeAmount ||
        (vaultEvents[0].args.feeBps as bigint) !== feeBps
      ) {
        throw new Error(
          `Buy ${sequence} Vault accounting does not match Hook event`
        );
      }
      const poolToVaultFee = receipt.logs
        .filter(
          (log) =>
            log.address.toLowerCase() === config.base.toLowerCase() &&
            log.topics[0] === transferTopic
        )
        .map((log) => parsedLog(TRANSFER, log))
        .some(
          (parsed) =>
            parsed.args.from.toLowerCase() ===
              config.poolManager.toLowerCase() &&
            parsed.args.to.toLowerCase() === config.vault.toLowerCase() &&
            (parsed.args.value as bigint) === feeAmount
        );
      if (!poolToVaultFee) {
        throw new Error(
          `Buy ${sequence} lacks the exact PoolManager-to-Vault fee transfer`
        );
      }

      const [usdcAfter, naraAfter, recordedAfter] = await Promise.all([
        usdc.balanceOf(wallet.address, {
          blockTag: receipt.blockNumber,
        }) as Promise<bigint>,
        nara.balanceOf(wallet.address, {
          blockTag: receipt.blockNumber,
        }) as Promise<bigint>,
        vault.totalBaseFeeRecorded({
          blockTag: receipt.blockNumber,
        }) as Promise<bigint>,
      ]);
      if (usdcBefore - usdcAfter !== amountIn) {
        throw new Error(`Buy ${sequence} did not spend exact USDC input`);
      }
      const naraReceived = naraAfter - naraBefore;
      if (naraReceived < amountOutMinimum) {
        throw new Error(
          `Buy ${sequence} output is below its protected minimum`
        );
      }
      if (recordedAfter < recordedBefore + feeAmount) {
        throw new Error(
          `Buy ${sequence} Vault lifetime fee did not increase correctly`
        );
      }

      const evidence: TradeEvidence = {
        sequence,
        usdcIn: ethers.formatUnits(amountIn, 6),
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        secondsSincePrevious,
        hookFeeUsdc: ethers.formatUnits(feeAmount, 6),
        terminalFeeBps: feeBps.toString(),
        priorSameBlockFlowUsdc: ethers.formatUnits(priorFlow, 6),
        reconstructedFeeUsdc: ethers.formatUnits(reconstructedDue, 6),
        matchedBaseline:
          priorFlow === 0n && feeAmount === EXPECTED_PER_BUY_FEE_USDC,
        naraReceived: ethers.formatUnits(naraReceived, 18),
        minimumNaraOut: ethers.formatUnits(amountOutMinimum, 18),
      };
      report.buys.push(evidence);
      persist();
      console.log(
        JSON.stringify({ verifiedTax: `${sequence}/${BUY_COUNT}`, ...evidence })
      );

      await scanForWhales();
      await guardedHedge("post-buy");
    }

    // Final drain: give the last burst one quiet period, then hedge the total.
    await delay(HEDGE_QUIET_BLOCKS * 2_000);
    await scanForWhales();
    await guardedHedge("final-drain");

    const totalBuyFees = report.buys.reduce(
      (sum, trade) => sum + ethers.parseUnits(trade.hookFeeUsdc, 6),
      0n
    );
    const baseFeeRecordedAfterAll =
      (await vault.totalBaseFeeRecorded()) as bigint;
    if (baseFeeRecordedAfterAll - baseFeeRecorded !== totalBuyFees) {
      throw new Error(
        "Run-level Vault buy-fee delta does not equal summed event fees"
      );
    }
    const totalHedgeFeesNara = report.hedges.reduce(
      (sum, hedge) => sum + ethers.parseUnits(hedge.hookFeeNara, 18),
      0n
    );
    const totalUsdcFromHedges = report.hedges.reduce(
      (sum, hedge) => sum + ethers.parseUnits(hedge.usdcReceived, 6),
      0n
    );
    const pendingBucketNara = whaleQueue.reduce(
      (sum, whale) => sum + whale.naraEquivalent,
      0n
    );
    report.totals = {
      completedBuys: report.buys.length.toString(),
      usdcSpentOnBuys: ethers.formatUnits(BUY_TOTAL_USDC, 6),
      naraReceivedFromBuys: ethers.formatUnits(
        report.buys.reduce(
          (sum, trade) => sum + ethers.parseUnits(trade.naraReceived, 18),
          0n
        ),
        18
      ),
      totalBuyHookFeesUsdc: ethers.formatUnits(totalBuyFees, 6),
      baselineMatchedBuys: report.buys
        .filter((trade) => trade.matchedBaseline)
        .length.toString(),
      whaleObservations: report.whaleObservations.length.toString(),
      hedgeSwapsExecuted: report.hedges.length.toString(),
      naraSoldInHedges: ethers.formatUnits(
        report.hedges.reduce(
          (sum, hedge) => sum + ethers.parseUnits(hedge.naraSold, 18),
          0n
        ),
        18
      ),
      usdcReceivedFromHedges: ethers.formatUnits(totalUsdcFromHedges, 6),
      hookFeesPaidOnHedgesNara: ethers.formatUnits(totalHedgeFeesNara, 18),
      unhedgedPendingWhaleNara: ethers.formatUnits(pendingBucketNara, 18),
      netUsdcDelta: ethers.formatUnits(totalUsdcFromHedges - BUY_TOTAL_USDC, 6),
    };
  } catch (error) {
    report.status = "FAILED_STOPPED";
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    const cleanup: Record<string, string> = {};
    const [
      usdcPermitRemaining,
      usdcErc20Remaining,
      naraPermitRemaining,
      naraErc20Remaining,
    ] = await Promise.all([
      permit2.allowance(
        wallet.address,
        config.base,
        config.universalRouter
      ) as Promise<[bigint, bigint, bigint]>,
      usdc.allowance(wallet.address, config.permit2) as Promise<bigint>,
      permit2.allowance(
        wallet.address,
        config.token,
        config.universalRouter
      ) as Promise<[bigint, bigint, bigint]>,
      nara.allowance(wallet.address, config.permit2) as Promise<bigint>,
    ]);
    if (usdcPermitRemaining[0] !== 0n) {
      const receipt = await sendWithMargin(
        provider,
        "Cleanup Permit2 USDC allowance",
        () =>
          permit2.approve.estimateGas(
            config.base,
            config.universalRouter,
            0n,
            0n
          ),
        (gasLimit) =>
          permit2.approve(config.base, config.universalRouter, 0n, 0n, {
            gasLimit,
          })
      );
      cleanup.permit2Usdc = receipt.hash;
    }
    if (usdcErc20Remaining !== 0n) {
      const receipt = await sendWithMargin(
        provider,
        "Cleanup USDC allowance to Permit2",
        () => usdc.approve.estimateGas(config.permit2, 0n),
        (gasLimit) => usdc.approve(config.permit2, 0n, { gasLimit })
      );
      cleanup.erc20Usdc = receipt.hash;
    }
    // Pre-existing standing NARA grants are never revoked by this runner.
    if (!preserveNaraPermit2Approval && naraPermitRemaining[0] !== 0n) {
      const receipt = await sendWithMargin(
        provider,
        "Cleanup Permit2 NARA allowance",
        () =>
          permit2.approve.estimateGas(
            config.token,
            config.universalRouter,
            0n,
            0n
          ),
        (gasLimit) =>
          permit2.approve(config.token, config.universalRouter, 0n, 0n, {
            gasLimit,
          })
      );
      cleanup.permit2Nara = receipt.hash;
    }
    if (!preserveNaraErc20Approval && naraErc20Remaining !== 0n) {
      const receipt = await sendWithMargin(
        provider,
        "Cleanup NARA allowance to Permit2",
        () => nara.approve.estimateGas(config.permit2, 0n),
        (gasLimit) => nara.approve(config.permit2, 0n, { gasLimit })
      );
      cleanup.erc20Nara = receipt.hash;
    } else if (preserveNaraErc20Approval && naraErc20Remaining !== 0n) {
      cleanup.preservedStandingNaraApproval =
        naraErc20Remaining === (1n << 256n) - 1n
          ? "max uint256"
          : naraErc20Remaining.toString();
    }
    instantWatcherActive = false;
    report.cleanup = cleanup;
    const [usdcPermitAfter, usdcErc20After, naraPermitAfter, naraErc20After] =
      await Promise.all([
        permit2.allowance(
          wallet.address,
          config.base,
          config.universalRouter
        ) as Promise<[bigint, bigint, bigint]>,
        usdc.allowance(wallet.address, config.permit2) as Promise<bigint>,
        permit2.allowance(
          wallet.address,
          config.token,
          config.universalRouter
        ) as Promise<[bigint, bigint, bigint]>,
        nara.allowance(wallet.address, config.permit2) as Promise<bigint>,
      ]);
    if (usdcPermitAfter[0] !== 0n || usdcErc20After !== 0n) {
      throw new Error("Final USDC allowances are not zero after cleanup");
    }
    if (!preserveNaraPermit2Approval && naraPermitAfter[0] !== 0n) {
      throw new Error("Final Permit2 NARA allowance is not zero after cleanup");
    }
    if (!preserveNaraErc20Approval && naraErc20After !== 0n) {
      throw new Error("Final ERC20 NARA allowance is not zero after cleanup");
    }
    report.finalAllowances = {
      usdcErc20: usdcErc20After.toString(),
      usdcPermit2: usdcPermitAfter[0].toString(),
      naraErc20: naraErc20After.toString(),
      naraPermit2: naraPermitAfter[0].toString(),
    };
  }

  report.finishedAt = new Date().toISOString();
  if (report.status === "RUNNING" && report.buys.length === BUY_COUNT) {
    report.status = "PASS";
  }
  persist();
  console.log(JSON.stringify({ status: report.status, outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
