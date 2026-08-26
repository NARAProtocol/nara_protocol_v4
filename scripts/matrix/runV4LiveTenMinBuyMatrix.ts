/**
 * Executes the approved live Base buy-tax matrix:
 * 100 separate NARA buys of exactly 11 USDC each (1,100 USDC gross total),
 * one transaction per DISTINCT later block, with at least DELAY_SECONDS
 * between actual submission attempts. The evidenced default is six seconds;
 * an explicitly confirmed three-second minimum is also supported. Canonical
 * confirmation and verification work may make actual spacing longer.
 *
 * Unlike the same-block matrix, per-block flow pressure resets between buys,
 * so each isolated 11-USDC buy is expected to land in the BASE tier
 * (3% at depth 300 USDC -> 0.33 USDC Hook fee per buy, 33.00 USDC baseline
 * total under the executed seller-weighted policy). Concurrent third-party
 * buys inside one of our blocks would raise that block's marginal fee; the
 * per-trade verifier reconstructs the exact due fee from block logs instead
 * of assuming isolation, and the vault delta must equal the sum of event fees.
 * If per-trade verification exceeds the minimum gap, the next buy proceeds
 * without an additional delay; elapsed time is never recovered by catch-up.
 *
 * Default mode is read-only. Production execution requires both --execute and
 * the schedule-specific V4_LIVE_TEN_MIN_BUY_CONFIRMATION printed on failure.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  currentV4Config,
  requiredBaseRpcUrl,
  requiredEnv,
} from "../lib/v4LiveConfig.js";
import { resolveLiveBuyMatrixSchedule } from "./liveBuyMatrixSchedule.js";
import {
  calculateLiveBuyMatrixGasBudget,
  LIVE_BUY_GAS_ASSUMPTIONS,
} from "./liveBuyMatrixGasBudget.js";
import {
  atomicWriteJson,
  ConfirmedNonceCursor,
  createLiveBuyMatrixEvidencePaths,
  latestPointerForTerminalRun,
  minimumSubmissionWaitMs,
  requireIdleNonceState,
  resolveLiveBuyMatrixTerminalOutcome,
  secondsBetweenSubmissions,
} from "./liveBuyMatrixRuntime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const BASE_CHAIN_ID = 8453n;
const schedule = resolveLiveBuyMatrixSchedule({
  count: process.env.V4_TEN_MIN_BUY_COUNT,
  delaySeconds: process.env.V4_BUY_MATRIX_DELAY_SECONDS,
});
const EXECUTION_CONFIRMATION = schedule.executionConfirmation;
const STAGGERED_BUY_COUNT = schedule.count;
const STAGGERED_BUY_USDC = 11n * 10n ** 6n;
const STAGGERED_BUY_TOTAL_USDC =
  BigInt(STAGGERED_BUY_COUNT) * STAGGERED_BUY_USDC;
// Baseline assumes each buy is the only flow in its block (pressure resets
// across blocks). Verified against the live seller-weighted curve at depth 300.
export const STAGGERED_EXPECTED_PER_BUY_FEE_USDC = 330_000n;
export const STAGGERED_EXPECTED_BASELINE_TOTAL_USDC =
  BigInt(STAGGERED_BUY_COUNT) * STAGGERED_EXPECTED_PER_BUY_FEE_USDC;
const DELAY_SECONDS = schedule.delaySeconds;
const OUTPUT_TOLERANCE_BPS = 1_000n;
const BPS = 10_000n;
const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

const EXPECTED = {
  wallet: "0xAE9D1667B45558232BeD9d45DcCA53940F892aB5",
  token: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  hook: "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088",
  vault: "0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D",
  engine: "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC",
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
  v4Quoter: "0x0d5e0F971ED27FBfF6c2837bf31316121532048D",
  poolId: "0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464",
  lpTokenId: 2_898_124n,
  fee: 3_000,
  tickSpacing: 60,
} as const;

// Live executed seller-weighted policy: thresholds 500/1500/3000 bps,
// tiers 300/500/800/1200 bps, max 1200.
const EXPECTED_CURVE = [500n, 1_500n, 3_000n, 300n, 500n, 800n, 1_200n, 1_200n];
const EXPECTED_DEPTH_USDC = 300n * 10n ** 6n;

const EXPECTED_CODE_HASHES: Readonly<Record<string, string>> = {
  token: "0x62ef7f0bc66a248bd2f3ceb829b785ab8a02029b38ed1645dbac19dfd404d5fd",
  vault: "0x9f99df87819234a0a71b34bc961bb0aec70bb8f9bd1c906cc904c98b6d93fc27",
  hook: "0x951a143030ac1137db00219600e3249fc9b6a37f92202a3d0807453d9e63d885",
  poolManager:
    "0x83b2af6e9f3158defc2811cbcb0db71ecf8b2ba2abea39c39e370ac5c6f43eb6",
  base: "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab",
  permit2: "0xa67739abc3ede9dbdc0491636c67d6a14ac07fab9030c3f509b1eb7b11dff8ed",
  universalRouter:
    "0x27713951fb0660a1422b710122022d90723d883dc7b72949be79cb2957d234e0",
  v4Quoter:
    "0x9a5c0cdd56325bef0e48cdab071a4b6a7f877e1271c2e08510998d724a038bb3",
};

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
  "function quotePoolFee(bool isBuy,uint256 amountIn) view returns (uint16 feeBps,uint256 feeAmount)",
  "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
];
const VAULT_ABI = [
  "function totalBaseFeeRecorded() view returns (uint256)",
  "event PoolFeeRecorded(address indexed currency,address indexed sender,uint256 amount,uint16 feeBps,bool isBuy)",
];
const POOL_MANAGER_ABI = ["function extsload(bytes32) view returns (bytes32)"];
const TRANSFER = new ethers.Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

type FeeCurve = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
];

type TradeEvidence = {
  sequence: number;
  usdcIn: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  submittedAt: string;
  receiptBlockTimestamp: number;
  secondsSincePreviousSubmission: number | null;
  receiptBlockDelta: number | null;
  hookFeeUsdc: string;
  terminalFeeBps: string;
  priorSameBlockFlowUsdc: string;
  reconstructedFeeUsdc: string;
  matchedBaseline: boolean;
  naraReceived: string;
  minimumNaraOut: string;
  canonicalQuoteNaraOut: string;
  quoteGasEstimate: string;
  stateBlockBefore: number;
  sqrtPriceX96After: string;
  usdcBalanceAfter: string;
  naraBalanceAfter: string;
};

function cumulativeFee(
  curve: FeeCurve,
  amountIn: bigint,
  depth: bigint
): bigint {
  if (amountIn === 0n) return 0n;
  const [
    mediumPressure,
    highPressure,
    extremePressure,
    baseFee,
    mediumFee,
    highFee,
    extremeFee,
  ] = curve;
  if (depth === 0n) return (amountIn * extremeFee) / BPS;
  const mediumAt = (depth * mediumPressure) / BPS;
  const highAt = (depth * highPressure) / BPS;
  const extremeAt = (depth * extremePressure) / BPS;
  let end = amountIn < mediumAt ? amountIn : mediumAt;
  let fee = (end * baseFee) / BPS;
  if (amountIn <= mediumAt) return fee;
  end = amountIn < highAt ? amountIn : highAt;
  fee += ((end - mediumAt) * mediumFee) / BPS;
  if (amountIn <= highAt) return fee;
  end = amountIn < extremeAt ? amountIn : extremeAt;
  fee += ((end - highAt) * highFee) / BPS;
  if (amountIn <= extremeAt) return fee;
  return fee + ((amountIn - extremeAt) * extremeFee) / BPS;
}

function terminalFeeBps(
  curve: FeeCurve,
  amountIn: bigint,
  depth: bigint
): bigint {
  const [
    mediumPressure,
    highPressure,
    extremePressure,
    baseFee,
    mediumFee,
    highFee,
    extremeFee,
    maximum,
  ] = curve;
  if (depth === 0n) return extremeFee < maximum ? extremeFee : maximum;
  const mediumAt = (depth * mediumPressure) / BPS;
  const highAt = (depth * highPressure) / BPS;
  const extremeAt = (depth * extremePressure) / BPS;
  let fee = baseFee;
  if (amountIn >= extremeAt) fee = extremeFee;
  else if (amountIn >= highAt) fee = highFee;
  else if (amountIn >= mediumAt) fee = mediumFee;
  return fee < maximum ? fee : maximum;
}

function poolLiquiditySlot(poolId: string): string {
  const stateSlot = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [poolId, ethers.zeroPadValue("0x06", 32)]
    )
  );
  return ethers.toBeHex(BigInt(stateSlot) + 3n, 32);
}

function poolStateSlot(poolId: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [poolId, ethers.zeroPadValue("0x06", 32)]
    )
  );
}

async function readPoolStateAt(
  poolManager: ethers.Contract,
  poolId: string,
  blockTag: number
): Promise<{ sqrtPriceX96: bigint; liquidity: bigint }> {
  const [rawSlot0, rawLiquidity] = await Promise.all([
    poolManager.extsload(poolStateSlot(poolId), {
      blockTag,
    }) as Promise<string>,
    poolManager.extsload(poolLiquiditySlot(poolId), {
      blockTag,
    }) as Promise<string>,
  ]);
  return {
    sqrtPriceX96: BigInt(rawSlot0) & ((1n << 160n) - 1n),
    liquidity: BigInt(rawLiquidity) & ((1n << 128n) - 1n),
  };
}

function assertExact(label: string, actual: string, expected: string): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `${label} is not the hard-pinned fresh-v4 value: ${actual}`
    );
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function parsedLog(
  contractInterface: ethers.Interface,
  log: ethers.Log | ethers.EventLog
): ethers.LogDescription {
  const parsed = contractInterface.parseLog(log);
  if (!parsed)
    throw new Error(`Could not decode expected log from ${log.address}`);
  return parsed;
}

async function canonicalReceipt(
  provider: ethers.Provider,
  transaction: ethers.ContractTransactionResponse,
  onConfirmedMined: () => void
): Promise<ethers.TransactionReceipt> {
  const mined = await transaction.wait(2);
  if (!mined || mined.status !== 1 || mined.blockHash === ethers.ZeroHash) {
    throw new Error(
      `Confirmed receipt validation failed for ${transaction.hash}`
    );
  }
  // The nonce is conclusively consumed once a successful confirmed receipt is
  // returned. Release it before later canonical-provider verification so safe
  // cleanup remains possible if that independent verification fails.
  onConfirmedMined();
  const receipt = await provider.getTransactionReceipt(transaction.hash);
  if (
    !receipt ||
    receipt.status !== 1 ||
    receipt.blockHash === ethers.ZeroHash
  ) {
    throw new Error(
      `Canonical receipt validation failed for ${transaction.hash}`
    );
  }
  if (
    receipt.blockNumber !== mined.blockNumber ||
    receipt.blockHash !== mined.blockHash
  ) {
    throw new Error(
      `Receipt changed after confirmation for ${transaction.hash}`
    );
  }
  return receipt;
}

async function sendWithMargin(
  provider: ethers.Provider,
  label: string,
  estimate: () => Promise<bigint>,
  send: (
    gasLimit: bigint,
    nonce: number
  ) => Promise<ethers.ContractTransactionResponse>,
  nonceCursor: ConfirmedNonceCursor,
  submission?: {
    before?: () => Promise<void>;
    recorded?: (submittedAtMs: number) => void;
    sent?: (evidence: {
      actionId: string;
      reservedNonce: number;
      transactionHash: string;
      submittedAt: string;
    }) => void;
    actionId?: string;
  }
): Promise<ethers.TransactionReceipt> {
  const gas = await estimate();
  if (submission?.before) await submission.before();
  const nonce = nonceCursor.reserve();
  const submittedAtMs = Date.now();
  const transaction = await send((gas * 120n + 99n) / 100n, nonce);
  submission?.recorded?.(submittedAtMs);
  submission?.sent?.({
    actionId: submission.actionId ?? label,
    reservedNonce: nonce,
    transactionHash: transaction.hash,
    submittedAt: new Date(submittedAtMs).toISOString(),
  });
  if (transaction.nonce !== nonce) {
    throw new Error(
      `${label} returned nonce ${transaction.nonce}, expected reserved nonce ${nonce}`
    );
  }
  console.log(`${label}: ${transaction.hash}`);
  const receipt = await canonicalReceipt(provider, transaction, () =>
    nonceCursor.confirm(transaction.nonce)
  );
  return receipt;
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  if (
    execute &&
    process.env.V4_LIVE_TEN_MIN_BUY_CONFIRMATION?.trim() !==
      EXECUTION_CONFIRMATION
  ) {
    throw new Error(
      `Execution requires V4_LIVE_TEN_MIN_BUY_CONFIRMATION=${EXECUTION_CONFIRMATION}`
    );
  }
  const config = currentV4Config();
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, Number(BASE_CHAIN_ID), {
    staticNetwork: true,
    batchMaxCount: 1,
  });
  const expectedWallet = ethers.getAddress(requiredEnv("V4_DEPLOYER"));
  const wallet = execute
    ? new ethers.Wallet(requiredEnv("PRIVATE_KEY"), provider)
    : null;
  if (wallet && wallet.address.toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new Error(
      `PRIVATE_KEY signer ${wallet.address} does not match V4_DEPLOYER ${expectedWallet}`
    );
  }

  assertExact("V4_DEPLOYER", expectedWallet, EXPECTED.wallet);
  assertExact("V4_NARA_TOKEN", config.token, EXPECTED.token);
  assertExact("V4_BASE_TOKEN", config.base, EXPECTED.base);
  assertExact("V4_HOOK", config.hook, EXPECTED.hook);
  assertExact("V4_VAULT", config.vault, EXPECTED.vault);
  assertExact("V4_ENGINE", config.engine, EXPECTED.engine);
  assertExact("V4_POOL_MANAGER", config.poolManager, EXPECTED.poolManager);
  assertExact("V4_PERMIT2", config.permit2, EXPECTED.permit2);
  assertExact(
    "V4_UNIVERSAL_ROUTER",
    config.universalRouter,
    EXPECTED.universalRouter
  );
  assertExact("V4_POOL_ID", config.poolId, EXPECTED.poolId);
  if (
    config.fee !== EXPECTED.fee ||
    config.tickSpacing !== EXPECTED.tickSpacing
  ) {
    throw new Error(
      "Pool fee or tick spacing is not the hard-pinned fresh-v4 value"
    );
  }

  const contractRunner = wallet ?? provider;
  const usdc = new ethers.Contract(config.base, ERC20_ABI, contractRunner);
  const nara = new ethers.Contract(config.token, ERC20_ABI, contractRunner);
  const permit2 = new ethers.Contract(
    config.permit2,
    PERMIT2_ABI,
    contractRunner
  );
  const router = new ethers.Contract(
    config.universalRouter,
    ROUTER_ABI,
    contractRunner
  );
  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  const vault = new ethers.Contract(config.vault, VAULT_ABI, provider);
  const poolManager = new ethers.Contract(
    config.poolManager,
    POOL_MANAGER_ABI,
    provider
  );
  const quoter = new ethers.Contract(
    EXPECTED.v4Quoter,
    V4_QUOTER_ABI,
    provider
  );

  const network = await provider.getNetwork();
  if (network.chainId !== BASE_CHAIN_ID)
    throw new Error(`Expected Base chain 8453, got ${network.chainId}`);

  const preflightBlock = await provider.getBlock("latest");
  if (!preflightBlock || !preflightBlock.hash)
    throw new Error("Could not pin the Base preflight block");

  const codeEntries = [
    ["token", config.token],
    ["vault", config.vault],
    ["hook", config.hook],
    ["poolManager", config.poolManager],
    ["base", config.base],
    ["permit2", config.permit2],
    ["universalRouter", config.universalRouter],
  ] as const;
  const codes = await Promise.all(
    codeEntries.map(([, address]) =>
      provider.getCode(address, preflightBlock.number)
    )
  );
  for (let index = 0; index < codeEntries.length; index += 1) {
    const [label] = codeEntries[index];
    const code = codes[index];
    if (code === "0x")
      throw new Error(
        `${label} has no runtime code at the pinned preflight block`
      );
    const expectedHash = EXPECTED_CODE_HASHES[label];
    if (
      !expectedHash ||
      ethers.keccak256(code).toLowerCase() !== expectedHash.toLowerCase()
    ) {
      throw new Error(
        `${label} runtime code hash does not match immutable evidence`
      );
    }
  }
  const quoterCode = await provider.getCode(
    EXPECTED.v4Quoter,
    preflightBlock.number
  );
  if (quoterCode === "0x")
    throw new Error("Official Base V4Quoter has no runtime code");
  if (
    ethers.keccak256(quoterCode).toLowerCase() !==
    EXPECTED_CODE_HASHES.v4Quoter.toLowerCase()
  ) {
    throw new Error("Official Base V4Quoter runtime code hash changed");
  }
  const quoterPoolManager = (await quoter.poolManager({
    blockTag: preflightBlock.number,
  })) as string;
  assertExact("V4Quoter.poolManager", quoterPoolManager, EXPECTED.poolManager);

  const poolStateBeforeAll = await readPoolStateAt(
    poolManager,
    config.poolId,
    preflightBlock.number
  );
  if (
    poolStateBeforeAll.sqrtPriceX96 === 0n ||
    poolStateBeforeAll.liquidity === 0n
  ) {
    throw new Error("Fresh pool is uninitialized or has zero active liquidity");
  }

  const [
    registered,
    registeredPoolId,
    depthResult,
    curveResult,
    usdcBeforeAll,
    naraBeforeAll,
    ethBalance,
    erc20AllowanceBefore,
    permit2AllowanceBefore,
    feeRecordedBeforeAll,
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
    hook.buyCurve({ blockTag: preflightBlock.number }) as Promise<
      readonly bigint[]
    >,
    usdc.balanceOf(expectedWallet, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    nara.balanceOf(expectedWallet, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    provider.getBalance(expectedWallet, preflightBlock.number),
    usdc.allowance(expectedWallet, config.permit2, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    permit2.allowance(expectedWallet, config.base, config.universalRouter, {
      blockTag: preflightBlock.number,
    }) as Promise<[bigint, bigint, bigint]>,
    vault.totalBaseFeeRecorded({
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
  ]);
  const curve = curveResult.slice(0, 8).map(BigInt) as unknown as FeeCurve;
  if (!registered || registeredPoolId.toLowerCase() !== config.poolId)
    throw new Error("Fresh pool is not registered");
  if (depthResult !== EXPECTED_DEPTH_USDC)
    throw new Error(`Unexpected configured USDC depth: ${depthResult}`);
  if (curve.some((value, index) => value !== EXPECTED_CURVE[index]))
    throw new Error(
      "Active buy curve differs from the executed seller-weighted policy curve"
    );
  const baselinePerBuy = cumulativeFee(
    curve,
    STAGGERED_BUY_USDC,
    EXPECTED_DEPTH_USDC
  );
  const baselineTerminalBps = terminalFeeBps(
    curve,
    STAGGERED_BUY_USDC,
    EXPECTED_DEPTH_USDC
  );
  if (baselinePerBuy !== STAGGERED_EXPECTED_PER_BUY_FEE_USDC)
    throw new Error(
      `Expected 0.33 USDC per-isolated-buy fee, got ${baselinePerBuy}`
    );
  if (usdcBeforeAll < STAGGERED_BUY_TOTAL_USDC)
    throw new Error(
      `Wallet has less than the approved ${ethers.formatUnits(
        STAGGERED_BUY_TOTAL_USDC,
        6
      )} USDC ten-minute budget`
    );
  const gasBudget = calculateLiveBuyMatrixGasBudget(
    preflightBlock.baseFeePerGas,
    STAGGERED_BUY_COUNT
  );
  if (ethBalance < gasBudget.requiredEthWei) {
    throw new Error(
      `Insufficient ETH for modeled full Matrix gas budget: available=${ethers.formatEther(
        ethBalance
      )} required=${ethers.formatEther(
        gasBudget.requiredEthWei
      )} ETH assumptions=${JSON.stringify({
        approvals: gasBudget.approvalTransactionCount,
        trades: gasBudget.tradeTransactionCount,
        cleanup: gasBudget.cleanupTransactionCount,
        observedBaseFeePerGasWei: gasBudget.observedBaseFeePerGasWei.toString(),
        baseFeeFloorWei: gasBudget.baseFeeFloorWei.toString(),
        gasPriceMultiplierBps:
          LIVE_BUY_GAS_ASSUMPTIONS.gasPriceMultiplierBps.toString(),
        bufferedGasUnits: gasBudget.bufferedGasUnits.toString(),
        modeledGasPriceWei: gasBudget.modeledGasPriceWei.toString(),
        l1EthBufferPerTransactionWei:
          gasBudget.l1EthBufferPerTransactionWei.toString(),
      })}`
    );
  }
  if (erc20AllowanceBefore !== 0n || permit2AllowanceBefore[0] !== 0n) {
    throw new Error(
      "Expected clean zero USDC allowances before the staggered matrix"
    );
  }

  const quoteParams = (exactAmount: bigint) => ({
    poolKey: {
      currency0: config.canonicalPoolKey.currency0,
      currency1: config.canonicalPoolKey.currency1,
      fee: config.fee,
      tickSpacing: config.tickSpacing,
      hooks: config.hook,
    },
    zeroForOne: !config.canonicalPoolKey.tokenIsCurrency0,
    exactAmount,
    hookData: "0x",
  });
  const oneQuote = (await quoter.quoteExactInputSingle.staticCall(
    quoteParams(STAGGERED_BUY_USDC),
    { blockTag: preflightBlock.number }
  )) as [bigint, bigint];
  if (oneQuote[0] === 0n)
    throw new Error(
      "Official V4Quoter returned a zero NARA output during preflight"
    );

  const preflight = {
    mode: execute ? "EXECUTE" : "READ_ONLY",
    chainId: network.chainId.toString(),
    wallet: expectedWallet,
    signer: execute
      ? "loaded locally and matched to V4_DEPLOYER; never displayed"
      : "not loaded in read-only mode",
    transactionCount: STAGGERED_BUY_COUNT,
    amountPerBuyUsdc: ethers.formatUnits(STAGGERED_BUY_USDC, 6),
    totalUsdc: ethers.formatUnits(STAGGERED_BUY_TOTAL_USDC, 6),
    delaySeconds: DELAY_SECONDS,
    approximateSpanMinutes: (
      (DELAY_SECONDS * (STAGGERED_BUY_COUNT - 1)) /
      60
    ).toFixed(1),
    expectedPerBuyFeeUsdc: ethers.formatUnits(
      STAGGERED_EXPECTED_PER_BUY_FEE_USDC,
      6
    ),
    expectedBaselineTotalUsdc: ethers.formatUnits(
      STAGGERED_EXPECTED_BASELINE_TOTAL_USDC,
      6
    ),
    baselineTerminalFeeBps: baselineTerminalBps.toString(),
    usdcBalance: ethers.formatUnits(usdcBeforeAll, 6),
    naraBalance: ethers.formatUnits(naraBeforeAll, 18),
    ethBalance: ethers.formatEther(ethBalance),
    requiredEthForModeledGas: ethers.formatEther(gasBudget.requiredEthWei),
    gasBudgetAssumptions: {
      approvalTransactions: gasBudget.approvalTransactionCount,
      tradeTransactions: gasBudget.tradeTransactionCount,
      cleanupTransactions: gasBudget.cleanupTransactionCount,
      totalTransactions: gasBudget.totalTransactionCount,
      observedBaseFeePerGasWei: gasBudget.observedBaseFeePerGasWei.toString(),
      baseFeeFloorWei: gasBudget.baseFeeFloorWei.toString(),
      gasPriceMultiplierBps:
        LIVE_BUY_GAS_ASSUMPTIONS.gasPriceMultiplierBps.toString(),
      modeledGasPriceWei: gasBudget.modeledGasPriceWei.toString(),
      approvalGasUnitsPerTransaction:
        LIVE_BUY_GAS_ASSUMPTIONS.approvalGasUnitsPerTransaction.toString(),
      tradeGasUnitsPerTransaction:
        LIVE_BUY_GAS_ASSUMPTIONS.tradeGasUnitsPerTransaction.toString(),
      cleanupGasUnitsPerTransaction:
        LIVE_BUY_GAS_ASSUMPTIONS.cleanupGasUnitsPerTransaction.toString(),
      gasUnitsBufferBps: gasBudget.gasUnitsBufferBps.toString(),
      unbufferedGasUnits: gasBudget.unbufferedGasUnits.toString(),
      bufferedGasUnits: gasBudget.bufferedGasUnits.toString(),
      executionGasWei: gasBudget.executionGasWei.toString(),
      l1EthBufferPerTransactionWei:
        gasBudget.l1EthBufferPerTransactionWei.toString(),
      totalL1EthBufferWei: gasBudget.totalL1EthBufferWei.toString(),
    },
    preflightBlock: preflightBlock.number,
    preflightBlockHash: preflightBlock.hash,
    poolId: config.poolId,
    verifiedLpTokenId: EXPECTED.lpTokenId.toString(),
    sqrtPriceX96: poolStateBeforeAll.sqrtPriceX96.toString(),
    activeLiquidity: poolStateBeforeAll.liquidity.toString(),
    officialV4Quoter: EXPECTED.v4Quoter,
    perBuyQuotedNara: ethers.formatUnits(oneQuote[0], 18),
    allowancesClean: true,
    vaultFeeRecordedBeforeUsdc: ethers.formatUnits(feeRecordedBeforeAll, 6),
  };
  console.log(JSON.stringify(preflight, null, 2));
  if (!execute) return;
  if (!wallet) throw new Error("Execute mode signer was not initialized");
  const [latestNonce, pendingNonce] = await Promise.all([
    provider.getTransactionCount(wallet.address, "latest"),
    provider.getTransactionCount(wallet.address, "pending"),
  ]);
  const startNonce = requireIdleNonceState(latestNonce, pendingNonce);
  const nonceCursor = new ConfirmedNonceCursor(startNonce);

  const report: {
    runId: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    preflight: typeof preflight;
    approvalTransactions: string[];
    noncePreflight: {
      latest: number;
      pending: number;
      start: number;
    };
    submittedActions: Array<{
      actionId: string;
      reservedNonce: number;
      transactionHash: string;
      submittedAt: string;
    }>;
    trades: TradeEvidence[];
    error?: string;
    cleanup?: {
      transactions: Record<string, string>;
      errors: string[];
      completed: boolean;
      disposition: "COMPLETED" | "FAILED" | "DEFERRED_NONCE_UNCERTAIN";
    };
    latestPointerError?: string;
    totals?: Record<string, unknown>;
  } = {
    runId: "",
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    preflight,
    approvalTransactions: [],
    noncePreflight: {
      latest: latestNonce,
      pending: pendingNonce,
      start: startNonce,
    },
    submittedActions: [],
    trades: [],
  };
  const outputDir = resolve(repoRoot, "deployments");
  const evidencePaths = createLiveBuyMatrixEvidencePaths(
    outputDir,
    schedule.evidenceLabel,
    new Date(report.startedAt)
  );
  if (existsSync(evidencePaths.runPath)) {
    throw new Error("Unique Matrix evidence path already exists");
  }
  report.runId = evidencePaths.runId;
  const outputPath = evidencePaths.runPath;
  const persist = () => atomicWriteJson(outputPath, report);
  const persistSubmittedAction = (action: {
    actionId: string;
    reservedNonce: number;
    transactionHash: string;
    submittedAt: string;
  }) => {
    report.submittedActions.push(action);
    persist();
  };
  persist();

  let sequenceError: unknown;
  let sequenceFailed = false;
  try {
    const approval = await sendWithMargin(
      provider,
      "USDC exact approval to Permit2",
      () => usdc.approve.estimateGas(config.permit2, STAGGERED_BUY_TOTAL_USDC),
      (gasLimit, nonce) =>
        usdc.approve(config.permit2, STAGGERED_BUY_TOTAL_USDC, {
          gasLimit,
          nonce,
        }),
      nonceCursor,
      { actionId: "approval-erc20", sent: persistSubmittedAction }
    );
    report.approvalTransactions.push(approval.hash);
    const latest = await provider.getBlock("latest");
    if (!latest)
      throw new Error("Could not read Base timestamp for Permit2 expiration");
    const expiration = BigInt(latest.timestamp + 3_600);
    const permitApproval = await sendWithMargin(
      provider,
      "Permit2 exact approval to Universal Router",
      () =>
        permit2.approve.estimateGas(
          config.base,
          config.universalRouter,
          STAGGERED_BUY_TOTAL_USDC,
          expiration
        ),
      (gasLimit, nonce) =>
        permit2.approve(
          config.base,
          config.universalRouter,
          STAGGERED_BUY_TOTAL_USDC,
          expiration,
          { gasLimit, nonce }
        ),
      nonceCursor,
      { actionId: "approval-permit2", sent: persistSubmittedAction }
    );
    report.approvalTransactions.push(permitApproval.hash);
    persist();

    let previousTradeBlock = 0;
    let previousSubmittedAtMs: number | null = null;
    const hookInterface = new ethers.Interface(HOOK_ABI);
    const vaultInterface = new ethers.Interface(VAULT_ABI);
    const hookTopic = hookInterface.getEvent("PoolFeeTaken")?.topicHash;
    const vaultTopic = vaultInterface.getEvent("PoolFeeRecorded")?.topicHash;
    const transferTopic = TRANSFER.getEvent("Transfer")?.topicHash;
    if (!hookTopic || !vaultTopic || !transferTopic)
      throw new Error("Required event topic is missing");

    for (let sequence = 1; sequence <= STAGGERED_BUY_COUNT; sequence += 1) {
      // Pace from the previous actual submission, never from an absolute
      // schedule. Slow confirmation/verification therefore cannot create a
      // catch-up burst.
      const initialWaitMs = minimumSubmissionWaitMs(
        previousSubmittedAtMs,
        Date.now(),
        DELAY_SECONDS
      );
      if (initialWaitMs > 0) await delay(initialWaitMs);
      let latestBlock = await provider.getBlock("latest");
      while (!latestBlock || latestBlock.number <= previousTradeBlock) {
        await delay(1_000);
        latestBlock = await provider.getBlock("latest");
      }
      if (!latestBlock.hash)
        throw new Error(
          `Buy ${sequence} could not pin its pre-trade block hash`
        );

      const amountIn = STAGGERED_BUY_USDC;
      const poolStateBefore = await readPoolStateAt(
        poolManager,
        config.poolId,
        latestBlock.number
      );
      if (
        poolStateBefore.sqrtPriceX96 === 0n ||
        poolStateBefore.liquidity === 0n
      )
        throw new Error("Pool is uninitialized or has zero active liquidity");
      const naraIsCurrency0 = BigInt(config.token) < BigInt(config.base);
      const [currency0, currency1] = naraIsCurrency0
        ? [config.token, config.base]
        : [config.base, config.token];

      // Build calldata from the freshest pinned state. If the pre-send
      // simulation reverts (e.g. an adverse third-party move between the
      // quote and execution), re-pin a FRESHER block, re-quote, rebuild the
      // protected minimum, and retry ONCE before failing this buy.
      let activeBlock = latestBlock;
      let canonicalQuote = 0n;
      let quoteGasEstimate = 0n;
      let amountOutMinimum = 0n;
      let deadline = 0n;
      let commands = "";
      let v4Input = "";
      let transactionGasEstimate = 0n;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const [quote, gasEstimate] =
          (await quoter.quoteExactInputSingle.staticCall(
            quoteParams(amountIn),
            {
              blockTag: activeBlock.number,
            }
          )) as [bigint, bigint];
        if (quote === 0n)
          throw new Error("Official V4Quoter returned zero NARA output");
        canonicalQuote = quote;
        quoteGasEstimate = gasEstimate;
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
              !naraIsCurrency0,
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
          // Estimate against the same freshly rebuilt calldata before reserving
          // a nonce. A block may move after staticCall; treat an estimate-time
          // revert exactly like the bounded pre-send simulation race.
          transactionGasEstimate = await router.execute.estimateGas(
            commands,
            [v4Input],
            deadline
          );
          if (transactionGasEstimate <= 0n) {
            throw new Error(
              "Router returned a non-positive transaction gas estimate"
            );
          }
          break;
        } catch (preSendError) {
          if (attempt === 2) throw preSendError;
          console.log(
            `Buy ${sequence}: pre-send simulation/estimate reverted; re-pinning state and retrying once`
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
      const priorSubmittedAtMs = previousSubmittedAtMs;
      let submittedAtMs: number | null = null;
      let secondsSincePreviousSubmission: number | null = null;
      const receipt = await sendWithMargin(
        provider,
        `Buy ${sequence}/${STAGGERED_BUY_COUNT} (${ethers.formatUnits(
          amountIn,
          6
        )} USDC)`,
        async () => transactionGasEstimate,
        (gasLimit, nonce) =>
          router.execute(commands, [v4Input], deadline, { gasLimit, nonce }),
        nonceCursor,
        {
          before: async () => {
            const waitMs = minimumSubmissionWaitMs(
              priorSubmittedAtMs,
              Date.now(),
              DELAY_SECONDS
            );
            if (waitMs > 0) await delay(waitMs);
          },
          recorded: (actualSubmittedAtMs) => {
            submittedAtMs = actualSubmittedAtMs;
            secondsSincePreviousSubmission = secondsBetweenSubmissions(
              priorSubmittedAtMs,
              actualSubmittedAtMs
            );
            previousSubmittedAtMs = actualSubmittedAtMs;
          },
          actionId: `buy-${sequence}`,
          sent: persistSubmittedAction,
        }
      );
      if (submittedAtMs === null) {
        throw new Error(
          `Buy ${sequence} submission timestamp was not recorded`
        );
      }
      if (
        secondsSincePreviousSubmission !== null &&
        secondsSincePreviousSubmission < DELAY_SECONDS
      ) {
        throw new Error(
          `Buy ${sequence} was submitted before the minimum delay elapsed`
        );
      }
      if (receipt.blockNumber <= previousTradeBlock)
        throw new Error(
          `Buy ${sequence} was not mined in a distinct later block`
        );
      const receiptBlockDelta =
        previousTradeBlock === 0
          ? null
          : receipt.blockNumber - previousTradeBlock;

      const receiptBlock = await provider.getBlock(receipt.blockNumber);
      if (!receiptBlock || receiptBlock.hash !== receipt.blockHash)
        throw new Error(`Buy ${sequence} receipt block is no longer canonical`);
      previousTradeBlock = receipt.blockNumber;

      // Exact fee reconstruction from this block's full buy-flow log set.
      const allBlockHookLogs = await provider.getLogs({
        address: config.hook,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        topics: [hookTopic, config.poolId],
      });
      let ourEvent: {
        log: ethers.Log | ethers.EventLog;
        parsed: ethers.LogDescription;
      } | null = null;
      let priorFlow = 0n;
      for (const log of allBlockHookLogs.sort((a, b) => a.index - b.index)) {
        const parsed = parsedLog(hookInterface, log);
        if (parsed.args.currency.toLowerCase() !== config.base.toLowerCase())
          continue;
        if (parsed.args.isBuy !== true) continue;
        const isOurs =
          log.transactionHash?.toLowerCase() === receipt.hash.toLowerCase();
        if (isOurs && ourEvent === null) {
          ourEvent = { log, parsed };
          break;
        }
        if (!isOurs) priorFlow += parsed.args.amountIn as bigint;
      }
      if (!ourEvent) throw new Error(`Buy ${sequence} Hook fee event missing`);
      const feeAmount = ourEvent.parsed.args.feeAmount as bigint;
      const feeBps = ourEvent.parsed.args.feeBps as bigint;
      if (
        (ourEvent.parsed.args.sender as string).toLowerCase() !==
        config.universalRouter.toLowerCase()
      )
        throw new Error(
          `Buy ${sequence} Hook sender is not the Universal Router`
        );
      if ((ourEvent.parsed.args.amountIn as bigint) !== amountIn)
        throw new Error(`Buy ${sequence} Hook amountIn mismatch`);
      const reconstructedDue =
        cumulativeFee(curve, priorFlow + amountIn, EXPECTED_DEPTH_USDC) -
        cumulativeFee(curve, priorFlow, EXPECTED_DEPTH_USDC);
      const reconstructedTier = terminalFeeBps(
        curve,
        priorFlow + amountIn,
        EXPECTED_DEPTH_USDC
      );
      if (feeAmount !== reconstructedDue || feeBps !== reconstructedTier)
        throw new Error(
          `Buy ${sequence} tax math mismatch: event=${feeAmount}/${feeBps} reconstructed=${reconstructedDue}/${reconstructedTier}`
        );

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
      if (vaultEvents.length !== 1)
        throw new Error(
          `Buy ${sequence}: expected one matching Vault fee event`
        );
      if (
        (vaultEvents[0].args.amount as bigint) !== feeAmount ||
        (vaultEvents[0].args.feeBps as bigint) !== feeBps
      )
        throw new Error(
          `Buy ${sequence} Vault accounting does not match Hook event`
        );

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
      if (!poolToVaultFee)
        throw new Error(
          `Buy ${sequence} lacks the exact PoolManager-to-Vault fee transfer`
        );

      const [usdcAfter, naraAfter, recordedAfter, sqrtAfter] =
        await Promise.all([
          usdc.balanceOf(wallet.address, {
            blockTag: receipt.blockNumber,
          }) as Promise<bigint>,
          nara.balanceOf(wallet.address, {
            blockTag: receipt.blockNumber,
          }) as Promise<bigint>,
          vault.totalBaseFeeRecorded({
            blockTag: receipt.blockNumber,
          }) as Promise<bigint>,
          readPoolStateAt(poolManager, config.poolId, receipt.blockNumber),
        ]);
      if (usdcBefore - usdcAfter !== amountIn)
        throw new Error(`Buy ${sequence} did not spend exact USDC input`);
      const naraReceived = naraAfter - naraBefore;
      if (naraReceived < amountOutMinimum)
        throw new Error(
          `Buy ${sequence} output is below its protected minimum`
        );
      if (recordedAfter < recordedBefore + feeAmount)
        throw new Error(
          `Buy ${sequence} Vault lifetime fee did not increase correctly`
        );

      const evidence: TradeEvidence = {
        sequence,
        usdcIn: ethers.formatUnits(amountIn, 6),
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        submittedAt: new Date(submittedAtMs).toISOString(),
        receiptBlockTimestamp: receiptBlock.timestamp,
        secondsSincePreviousSubmission,
        receiptBlockDelta,
        hookFeeUsdc: ethers.formatUnits(feeAmount, 6),
        terminalFeeBps: feeBps.toString(),
        priorSameBlockFlowUsdc: ethers.formatUnits(priorFlow, 6),
        reconstructedFeeUsdc: ethers.formatUnits(reconstructedDue, 6),
        matchedBaseline:
          priorFlow === 0n && feeAmount === STAGGERED_EXPECTED_PER_BUY_FEE_USDC,
        naraReceived: ethers.formatUnits(naraReceived, 18),
        minimumNaraOut: ethers.formatUnits(amountOutMinimum, 18),
        canonicalQuoteNaraOut: ethers.formatUnits(canonicalQuote, 18),
        quoteGasEstimate: quoteGasEstimate.toString(),
        stateBlockBefore: latestBlock.number,
        sqrtPriceX96After: sqrtAfter.sqrtPriceX96.toString(),
        usdcBalanceAfter: ethers.formatUnits(usdcAfter, 6),
        naraBalanceAfter: ethers.formatUnits(naraAfter, 18),
      };
      report.trades.push(evidence);
      persist();
      console.log(
        JSON.stringify({
          verifiedTax: `${sequence}/${STAGGERED_BUY_COUNT}`,
          ...evidence,
        })
      );
    }

    const totalEventFees = report.trades.reduce(
      (sum, trade) => sum + ethers.parseUnits(trade.hookFeeUsdc, 6),
      0n
    );
    const feeRecordedAfterAll = (await vault.totalBaseFeeRecorded()) as bigint;
    if (feeRecordedAfterAll - feeRecordedBeforeAll !== totalEventFees)
      throw new Error(
        "Run-level Vault fee delta does not equal summed event fees"
      );
    report.totals = {
      completedTrades: report.trades.length.toString(),
      usdcSpent: ethers.formatUnits(STAGGERED_BUY_TOTAL_USDC, 6),
      naraReceived: ethers.formatUnits(
        report.trades.reduce(
          (sum, trade) => sum + ethers.parseUnits(trade.naraReceived, 18),
          0n
        ),
        18
      ),
      totalHookFeesUsdc: ethers.formatUnits(totalEventFees, 6),
      baselineTotalHookFeesUsdc: ethers.formatUnits(
        STAGGERED_EXPECTED_BASELINE_TOTAL_USDC,
        6
      ),
      baselineMatchedTrades: report.trades
        .filter((t) => t.matchedBaseline)
        .length.toString(),
      vaultUsdcFeesAdded: ethers.formatUnits(
        feeRecordedAfterAll - feeRecordedBeforeAll,
        6
      ),
    };
  } catch (error) {
    sequenceFailed = true;
    sequenceError = error;
    report.status = "FAILED_STOPPED";
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    const cleanupTransactions: Record<string, string> = {};
    const cleanupErrors: string[] = [];
    let permitRemaining: bigint | null = null;
    let erc20Remaining: bigint | null = null;
    try {
      const allowance = (await permit2.allowance(
        wallet.address,
        config.base,
        config.universalRouter
      )) as [bigint, bigint, bigint];
      permitRemaining = allowance[0];
    } catch (error) {
      cleanupErrors.push(
        `Permit2 allowance read failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    try {
      erc20Remaining = (await usdc.allowance(
        wallet.address,
        config.permit2
      )) as bigint;
    } catch (error) {
      cleanupErrors.push(
        `ERC20 allowance read failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    if (nonceCursor.locked) {
      cleanupErrors.push(
        `DEFERRED_NONCE_UNCERTAIN: reserved nonce ${String(
          nonceCursor.reservedNonce
        )}; no cleanup transactions submitted`
      );
    }
    if (
      !nonceCursor.locked &&
      permitRemaining !== null &&
      permitRemaining !== 0n
    ) {
      try {
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
          (gasLimit, nonce) =>
            permit2.approve(config.base, config.universalRouter, 0n, 0n, {
              gasLimit,
              nonce,
            }),
          nonceCursor,
          { actionId: "cleanup-permit2", sent: persistSubmittedAction }
        );
        cleanupTransactions.permit2 = receipt.hash;
      } catch (error) {
        cleanupErrors.push(
          `Permit2 cleanup failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    if (
      !nonceCursor.locked &&
      erc20Remaining !== null &&
      erc20Remaining !== 0n
    ) {
      try {
        const receipt = await sendWithMargin(
          provider,
          "Cleanup USDC allowance to Permit2",
          () => usdc.approve.estimateGas(config.permit2, 0n),
          (gasLimit, nonce) =>
            usdc.approve(config.permit2, 0n, { gasLimit, nonce }),
          nonceCursor,
          { actionId: "cleanup-erc20", sent: persistSubmittedAction }
        );
        cleanupTransactions.erc20 = receipt.hash;
      } catch (error) {
        cleanupErrors.push(
          `ERC20 cleanup failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    report.cleanup = {
      transactions: cleanupTransactions,
      errors: cleanupErrors,
      completed: cleanupErrors.length === 0,
      disposition: nonceCursor.locked
        ? "DEFERRED_NONCE_UNCERTAIN"
        : cleanupErrors.length === 0
        ? "COMPLETED"
        : "FAILED",
    };
  }

  report.finishedAt = new Date().toISOString();
  const terminalOutcome = resolveLiveBuyMatrixTerminalOutcome({
    primaryError: sequenceFailed ? report.error ?? String(sequenceError) : null,
    cleanupErrors: report.cleanup?.errors ?? [],
    completedTrades: report.trades.length,
    expectedTrades: STAGGERED_BUY_COUNT,
  });
  report.status = terminalOutcome.status;
  if (terminalOutcome.error !== null) report.error = terminalOutcome.error;
  const terminalError = sequenceFailed
    ? sequenceError
    : terminalOutcome.error === null
    ? null
    : new Error(terminalOutcome.error);
  persist();
  let latestPointerError: unknown;
  try {
    atomicWriteJson(
      evidencePaths.latestPointerPath,
      latestPointerForTerminalRun({
        runId: report.runId,
        runPath: outputPath,
        status: report.status,
        finishedAt: report.finishedAt,
      })
    );
  } catch (error) {
    latestPointerError = error;
    report.latestPointerError =
      error instanceof Error ? error.message : String(error);
    persist();
  }
  console.log(
    JSON.stringify(
      {
        status: report.status,
        outputPath,
        latestPointerPath: evidencePaths.latestPointerPath,
      },
      null,
      2
    )
  );
  if (sequenceFailed || terminalError) throw terminalError;
  if (latestPointerError) throw latestPointerError;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
