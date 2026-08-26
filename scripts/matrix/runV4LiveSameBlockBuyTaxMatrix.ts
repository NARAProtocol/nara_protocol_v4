/**
 * Executes the explicitly approved live Base same-block buy-tax matrix:
 * one atomic Universal Router transaction containing 20 separate 3 USDC
 * NARA swap actions (60 USDC gross total).
 *
 * Default mode is read-only. Production execution requires both --execute and
 * V4_LIVE_SAME_BLOCK_BUY_CONFIRMATION=BUY_NARA_20_X_3_USDC_SAME_BLOCK.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  currentV4Config,
  requiredBaseRpcUrl,
  requiredEnv,
} from "../lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const EXECUTION_CONFIRMATION = "BUY_NARA_20_X_3_USDC_SAME_BLOCK";
const BASE_CHAIN_ID = 8453n;
export const SAME_BLOCK_BUY_COUNT = 20;
export const SAME_BLOCK_BUY_USDC = 3n * 10n ** 6n;
export const SAME_BLOCK_BUY_TOTAL_USDC =
  BigInt(SAME_BLOCK_BUY_COUNT) * SAME_BLOCK_BUY_USDC;
// Bound to the EXECUTED seller-weighted fee policy (Safe-proposed, 7-day
// timelock, finalized on Base). Live buy curve verified on-chain:
// thresholds 500/1500/3000 bps, tiers 300/500/800/1200 bps, max 1200.
// Aggregate 20 x 3 USDC Hook fee at depth 300 USDC = exactly 3.15 USDC.
export const SAME_BLOCK_EXPECTED_FEE_USDC = 3_150_000n;
const OUTPUT_TOLERANCE_BPS = 1_000n;
const BPS = 10_000n;
const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

export const SAME_BLOCK_EXPECTED = {
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

export const SAME_BLOCK_EXPECTED_CODE_HASHES: Readonly<Record<string, string>> =
  {
    token: "0x62ef7f0bc66a248bd2f3ceb829b785ab8a02029b38ed1645dbac19dfd404d5fd",
    vault: "0x9f99df87819234a0a71b34bc961bb0aec70bb8f9bd1c906cc904c98b6d93fc27",
    hook: "0x951a143030ac1137db00219600e3249fc9b6a37f92202a3d0807453d9e63d885",
    poolManager:
      "0x83b2af6e9f3158defc2811cbcb0db71ecf8b2ba2abea39c39e370ac5c6f43eb6",
    base: "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab",
    permit2:
      "0xa67739abc3ede9dbdc0491636c67d6a14ac07fab9030c3f509b1eb7b11dff8ed",
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
  "function flowBlock(address) view returns (uint256)",
  "function flowAmountInBlock(address) view returns (uint256)",
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

export type FeeCurve = readonly [
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
];

type AtomicBuyConfig = {
  token: string;
  base: string;
  hook: string;
  fee: number;
  tickSpacing: number;
};

export function buildSameBlockBuyCall(
  config: AtomicBuyConfig,
  aggregateMinimumNara: bigint,
  deadline: bigint
): { commands: string; inputs: string[] } {
  const tokenIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = tokenIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const swapParams = abi.encode(
    [
      "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
    ],
    [
      [
        [currency0, currency1, config.fee, config.tickSpacing, config.hook],
        !tokenIsCurrency0,
        SAME_BLOCK_BUY_USDC,
        0n,
        "0x",
      ],
    ]
  );
  const settleParams = abi.encode(
    ["address", "uint256"],
    [config.base, SAME_BLOCK_BUY_TOTAL_USDC]
  );
  const takeParams = abi.encode(
    ["address", "uint256"],
    [config.token, aggregateMinimumNara]
  );
  const actions = ethers.hexlify(
    new Uint8Array([
      ...Array.from(
        { length: SAME_BLOCK_BUY_COUNT },
        () => SWAP_EXACT_IN_SINGLE
      ),
      SETTLE_ALL,
      TAKE_ALL,
    ])
  );
  const actionParams = [
    ...Array.from({ length: SAME_BLOCK_BUY_COUNT }, () => swapParams),
    settleParams,
    takeParams,
  ];
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, actionParams]);
  return {
    commands: ethers.hexlify(new Uint8Array([V4_SWAP])),
    inputs: [v4Input],
  };
}

export function cumulativeFee(
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

export function terminalFeeBps(
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

function poolStateSlot(poolId: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [poolId, ethers.zeroPadValue("0x06", 32)]
    )
  );
}

function poolLiquiditySlot(poolId: string): string {
  return ethers.toBeHex(BigInt(poolStateSlot(poolId)) + 3n, 32);
}

export async function readPoolStateAt(
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

export function assertExact(
  label: string,
  actual: string,
  expected: string
): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `${label} is not the hard-pinned fresh-v4 value: ${actual}`
    );
  }
}

export function parsedLog(
  contractInterface: ethers.Interface,
  log: ethers.Log | ethers.EventLog
): ethers.LogDescription {
  const parsed = contractInterface.parseLog(log);
  if (!parsed)
    throw new Error(`Could not decode expected log from ${log.address}`);
  return parsed;
}

export async function canonicalReceipt(
  provider: ethers.Provider,
  transaction: ethers.ContractTransactionResponse
): Promise<ethers.TransactionReceipt> {
  const mined = await transaction.wait(2);
  const receipt = await provider.getTransactionReceipt(transaction.hash);
  if (
    !mined ||
    !receipt ||
    receipt.status !== 1 ||
    receipt.blockHash === ethers.ZeroHash ||
    mined.blockHash !== receipt.blockHash
  ) {
    throw new Error(
      `Canonical receipt validation failed for ${transaction.hash}`
    );
  }
  const block = await provider.getBlock(receipt.blockNumber);
  if (!block || block.hash !== receipt.blockHash) {
    throw new Error(`Receipt block is not canonical for ${transaction.hash}`);
  }
  return receipt;
}

export async function sendWithMargin(
  provider: ethers.Provider,
  label: string,
  estimate: () => Promise<bigint>,
  send: (gasLimit: bigint) => Promise<ethers.ContractTransactionResponse>
): Promise<ethers.TransactionReceipt> {
  const gas = await estimate();
  const transaction = await send((gas * 120n + 99n) / 100n);
  console.log(`${label}: ${transaction.hash}`);
  return canonicalReceipt(provider, transaction);
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  if (
    execute &&
    process.env.V4_LIVE_SAME_BLOCK_BUY_CONFIRMATION?.trim() !==
      EXECUTION_CONFIRMATION
  ) {
    throw new Error(
      `Execution requires V4_LIVE_SAME_BLOCK_BUY_CONFIRMATION=${EXECUTION_CONFIRMATION}`
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
    : new ethers.VoidSigner(expectedWallet, provider);
  if (wallet.address.toLowerCase() !== expectedWallet.toLowerCase()) {
    throw new Error("PRIVATE_KEY signer does not match V4_DEPLOYER");
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
  if (!preflightBlock?.hash)
    throw new Error("Could not pin the preflight block");

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
    if (
      code === "0x" ||
      ethers.keccak256(code).toLowerCase() !==
        SAME_BLOCK_EXPECTED_CODE_HASHES[label].toLowerCase()
    ) {
      throw new Error(
        `${label} runtime code hash does not match activation evidence`
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
    depth,
    curveResult,
    usdcBalance,
    naraBalance,
    ethBalance,
    erc20Allowance,
    permit2Allowance,
    feeRecorded,
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
    vault.totalBaseFeeRecorded({
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
  ]);
  const curve = curveResult.slice(0, 8).map(BigInt) as unknown as FeeCurve;
  if (
    !registered ||
    registeredPoolId.toLowerCase() !== config.poolId ||
    poolState.sqrtPriceX96 === 0n ||
    poolState.liquidity === 0n
  ) {
    throw new Error("Fresh pool is not registered, initialized, and liquid");
  }
  if (depth !== 300n * 10n ** 6n) {
    throw new Error(`Unexpected configured USDC depth: ${depth}`);
  }
  const expectedCurve = [
    500n,
    1_500n,
    3_000n,
    300n,
    500n,
    800n,
    1_200n,
    1_200n,
  ];
  if (curve.some((value, index) => value !== expectedCurve[index])) {
    throw new Error(
      "Active buy curve differs from the executed seller-weighted policy curve"
    );
  }
  const reconstructedFee = cumulativeFee(
    curve,
    SAME_BLOCK_BUY_TOTAL_USDC,
    depth
  );
  if (reconstructedFee !== SAME_BLOCK_EXPECTED_FEE_USDC) {
    throw new Error(
      `Expected 3.15 USDC aggregate Hook fee, got ${reconstructedFee}`
    );
  }
  if (usdcBalance < SAME_BLOCK_BUY_TOTAL_USDC) {
    throw new Error("Wallet has less than the approved 60 USDC test budget");
  }
  if (ethBalance < ethers.parseEther("0.001")) {
    throw new Error("Wallet has less than the 0.001 ETH gas floor");
  }
  if (erc20Allowance !== 0n || permit2Allowance[0] !== 0n) {
    throw new Error(
      "Expected clean zero USDC allowances before the fast matrix"
    );
  }

  const quoteParams = {
    poolKey: {
      currency0: config.canonicalPoolKey.currency0,
      currency1: config.canonicalPoolKey.currency1,
      fee: config.fee,
      tickSpacing: config.tickSpacing,
      hooks: config.hook,
    },
    zeroForOne: !config.canonicalPoolKey.tokenIsCurrency0,
    exactAmount: SAME_BLOCK_BUY_TOTAL_USDC,
    hookData: "0x",
  };
  const [aggregateQuote, quoteGasEstimate] =
    (await quoter.quoteExactInputSingle.staticCall(quoteParams, {
      blockTag: preflightBlock.number,
    })) as [bigint, bigint];
  if (aggregateQuote === 0n)
    throw new Error("V4Quoter returned zero NARA output");
  const preflightMinimum =
    (aggregateQuote * (BPS - OUTPUT_TOLERANCE_BPS)) / BPS;

  const preflight = {
    mode: execute ? "EXECUTE" : "READ_ONLY",
    chainId: network.chainId.toString(),
    wallet: wallet.address,
    privateKey: "loaded locally; never displayed",
    transactionCount: 1,
    swapActions: SAME_BLOCK_BUY_COUNT,
    amountPerActionUsdc: ethers.formatUnits(SAME_BLOCK_BUY_USDC, 6),
    totalUsdc: ethers.formatUnits(SAME_BLOCK_BUY_TOTAL_USDC, 6),
    expectedHookFeeUsdc: ethers.formatUnits(SAME_BLOCK_EXPECTED_FEE_USDC, 6),
    expectedEffectiveFeeBps: (
      (SAME_BLOCK_EXPECTED_FEE_USDC * BPS) /
      SAME_BLOCK_BUY_TOTAL_USDC
    ).toString(),
    terminalFeeBps: terminalFeeBps(
      curve,
      SAME_BLOCK_BUY_TOTAL_USDC,
      depth
    ).toString(),
    preflightBlock: preflightBlock.number,
    preflightBlockHash: preflightBlock.hash,
    poolId: config.poolId,
    sqrtPriceX96: poolState.sqrtPriceX96.toString(),
    activeLiquidity: poolState.liquidity.toString(),
    usdcBalance: ethers.formatUnits(usdcBalance, 6),
    naraBalance: ethers.formatUnits(naraBalance, 18),
    ethBalance: ethers.formatEther(ethBalance),
    aggregateQuotedNara: ethers.formatUnits(aggregateQuote, 18),
    protectedMinimumNara: ethers.formatUnits(preflightMinimum, 18),
    quoteGasEstimate: quoteGasEstimate.toString(),
    allowancesClean: true,
    vaultFeeRecordedBeforeUsdc: ethers.formatUnits(feeRecorded, 6),
  };
  console.log(JSON.stringify(preflight, null, 2));
  if (!execute) return;

  const report: Record<string, unknown> = {
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    preflight,
    approvalTransactions: [],
  };
  const outputDir = resolve(repoRoot, "deployments");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(
    outputDir,
    "v4-live-buy-tax-same-block-20x3-latest.json"
  );
  const persist = () =>
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  persist();

  let executionError: unknown;
  try {
    const approval = await sendWithMargin(
      provider,
      "USDC exact approval to Permit2",
      () => usdc.approve.estimateGas(config.permit2, SAME_BLOCK_BUY_TOTAL_USDC),
      (gasLimit) =>
        usdc.approve(config.permit2, SAME_BLOCK_BUY_TOTAL_USDC, { gasLimit })
    );
    (report.approvalTransactions as string[]).push(approval.hash);
    const approvalBlock = await provider.getBlock("latest");
    if (!approvalBlock)
      throw new Error("Could not read Permit2 approval timestamp");
    const expiration = BigInt(approvalBlock.timestamp + 3_600);
    const permitApproval = await sendWithMargin(
      provider,
      "Permit2 exact approval to Universal Router",
      () =>
        permit2.approve.estimateGas(
          config.base,
          config.universalRouter,
          SAME_BLOCK_BUY_TOTAL_USDC,
          expiration
        ),
      (gasLimit) =>
        permit2.approve(
          config.base,
          config.universalRouter,
          SAME_BLOCK_BUY_TOTAL_USDC,
          expiration,
          { gasLimit }
        )
    );
    (report.approvalTransactions as string[]).push(permitApproval.hash);
    persist();

    const stateBlock = await provider.getBlock("latest");
    if (!stateBlock?.hash)
      throw new Error("Could not pin the execution state block");
    const executionPoolState = await readPoolStateAt(
      poolManager,
      config.poolId,
      stateBlock.number
    );
    if (executionPoolState.liquidity === 0n) {
      throw new Error("Pool liquidity became zero after approvals");
    }
    const [executionQuote] = (await quoter.quoteExactInputSingle.staticCall(
      quoteParams,
      {
        blockTag: stateBlock.number,
      }
    )) as [bigint, bigint];
    const amountOutMinimum =
      (executionQuote * (BPS - OUTPUT_TOLERANCE_BPS)) / BPS;
    const deadline = BigInt(stateBlock.timestamp + 600);
    const atomicCall = buildSameBlockBuyCall(
      config,
      amountOutMinimum,
      deadline
    );
    await router.execute.staticCall(
      atomicCall.commands,
      atomicCall.inputs,
      deadline
    );
    const estimatedGas = await router.execute.estimateGas(
      atomicCall.commands,
      atomicCall.inputs,
      deadline
    );
    const gasLimit = (estimatedGas * 120n + 99n) / 100n;
    const feeData = await provider.getFeeData();
    const feeCap = feeData.maxFeePerGas ?? feeData.gasPrice;
    const liveEthBalance = await provider.getBalance(wallet.address);
    if (!feeCap || liveEthBalance < gasLimit * feeCap) {
      throw new Error(
        "Wallet ETH balance is below the atomic transaction fee cap"
      );
    }
    const [usdcBefore, naraBefore, vaultBefore] = await Promise.all([
      usdc.balanceOf(wallet.address, {
        blockTag: stateBlock.number,
      }) as Promise<bigint>,
      nara.balanceOf(wallet.address, {
        blockTag: stateBlock.number,
      }) as Promise<bigint>,
      vault.totalBaseFeeRecorded({
        blockTag: stateBlock.number,
      }) as Promise<bigint>,
    ]);
    if (usdcBefore < SAME_BLOCK_BUY_TOTAL_USDC) {
      throw new Error("Wallet balance fell below 60 USDC before execution");
    }

    const transaction = await router.execute(
      atomicCall.commands,
      atomicCall.inputs,
      deadline,
      { gasLimit }
    );
    report.atomicTransaction = transaction.hash;
    report.executionState = {
      blockNumber: stateBlock.number,
      blockHash: stateBlock.hash,
      sqrtPriceX96: executionPoolState.sqrtPriceX96.toString(),
      activeLiquidity: executionPoolState.liquidity.toString(),
      aggregateQuotedNara: ethers.formatUnits(executionQuote, 18),
      protectedMinimumNara: ethers.formatUnits(amountOutMinimum, 18),
      estimatedGas: estimatedGas.toString(),
      gasLimit: gasLimit.toString(),
    };
    persist();
    console.log(`Atomic 20 x 3 USDC transaction: ${transaction.hash}`);
    const receipt = await canonicalReceipt(provider, transaction);

    const [usdcAfter, naraAfter, vaultAfter, poolAfter] = await Promise.all([
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
    const naraReceived = naraAfter - naraBefore;
    if (usdcBefore - usdcAfter !== SAME_BLOCK_BUY_TOTAL_USDC) {
      throw new Error("Atomic matrix did not spend exactly 60 USDC");
    }
    if (naraReceived < amountOutMinimum) {
      throw new Error(
        "Atomic matrix NARA output is below the protected minimum"
      );
    }
    if (vaultAfter - vaultBefore !== SAME_BLOCK_EXPECTED_FEE_USDC) {
      throw new Error("Vault fee delta is not exactly 3.15 USDC");
    }

    const hookInterface = new ethers.Interface(HOOK_ABI);
    const vaultInterface = new ethers.Interface(VAULT_ABI);
    const hookTopic = hookInterface.getEvent("PoolFeeTaken")?.topicHash;
    const vaultTopic = vaultInterface.getEvent("PoolFeeRecorded")?.topicHash;
    const transferTopic = TRANSFER.getEvent("Transfer")?.topicHash;
    if (!hookTopic || !vaultTopic || !transferTopic) {
      throw new Error("Required event topic is missing");
    }
    const hookEvents = receipt.logs
      .filter(
        (log) =>
          log.address.toLowerCase() === config.hook.toLowerCase() &&
          log.topics[0] === hookTopic
      )
      .map((log) => ({ log, parsed: parsedLog(hookInterface, log) }))
      .filter(
        ({ parsed }) =>
          parsed.args.poolId.toLowerCase() === config.poolId &&
          parsed.args.currency.toLowerCase() === config.base.toLowerCase() &&
          parsed.args.isBuy === true
      );
    if (hookEvents.length !== SAME_BLOCK_BUY_COUNT) {
      throw new Error(
        `Expected 20 Hook buy events, found ${hookEvents.length}`
      );
    }
    const allBlockHookLogs = await provider.getLogs({
      address: config.hook,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      topics: [hookTopic, config.poolId],
    });
    const allBlockBuys = allBlockHookLogs
      .map((log) => ({ log, parsed: parsedLog(hookInterface, log) }))
      .filter(
        ({ parsed }) =>
          parsed.args.currency.toLowerCase() === config.base.toLowerCase() &&
          parsed.args.isBuy === true
      );
    if (
      allBlockBuys.length !== SAME_BLOCK_BUY_COUNT ||
      allBlockBuys.some(({ log }) => log.transactionHash !== receipt.hash)
    ) {
      throw new Error("Receipt block contains an unexpected external NARA buy");
    }

    let previousCumulativeFee = 0n;
    let totalEventFee = 0n;
    const actionEvidence = hookEvents.map(({ log, parsed }, index) => {
      const cumulative = BigInt(index + 1) * SAME_BLOCK_BUY_USDC;
      const cumulativeDue = cumulativeFee(curve, cumulative, depth);
      const expectedIncrement = cumulativeDue - previousCumulativeFee;
      const expectedTier = terminalFeeBps(curve, cumulative, depth);
      previousCumulativeFee = cumulativeDue;
      const amountIn = parsed.args.amountIn as bigint;
      const feeAmount = parsed.args.feeAmount as bigint;
      const feeBps = parsed.args.feeBps as bigint;
      if (
        amountIn !== SAME_BLOCK_BUY_USDC ||
        feeAmount !== expectedIncrement ||
        feeBps !== expectedTier ||
        parsed.args.sender.toLowerCase() !==
          config.universalRouter.toLowerCase()
      ) {
        throw new Error(`Hook fee mismatch at buy action ${index + 1}`);
      }
      totalEventFee += feeAmount;
      return {
        sequence: index + 1,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        logIndex: log.index,
        usdcIn: ethers.formatUnits(amountIn, 6),
        cumulativeUsdcIn: ethers.formatUnits(cumulative, 6),
        hookFeeUsdc: ethers.formatUnits(feeAmount, 6),
        terminalFeeBps: feeBps.toString(),
      };
    });
    if (totalEventFee !== SAME_BLOCK_EXPECTED_FEE_USDC) {
      throw new Error("Hook events do not total exactly 3.15 USDC");
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
    if (vaultEvents.length !== SAME_BLOCK_BUY_COUNT) {
      throw new Error(
        `Expected 20 Vault fee events, found ${vaultEvents.length}`
      );
    }
    for (let index = 0; index < vaultEvents.length; index += 1) {
      const hookEvent = hookEvents[index].parsed;
      const vaultEvent = vaultEvents[index];
      if (
        vaultEvent.args.amount !== hookEvent.args.feeAmount ||
        vaultEvent.args.feeBps !== hookEvent.args.feeBps ||
        vaultEvent.args.sender.toLowerCase() !==
          hookEvent.args.sender.toLowerCase()
      ) {
        throw new Error(`Vault event mismatch at buy action ${index + 1}`);
      }
    }
    const feeTransfers = receipt.logs
      .filter(
        (log) =>
          log.address.toLowerCase() === config.base.toLowerCase() &&
          log.topics[0] === transferTopic
      )
      .map((log) => parsedLog(TRANSFER, log))
      .filter(
        (parsed) =>
          parsed.args.from.toLowerCase() === config.poolManager.toLowerCase() &&
          parsed.args.to.toLowerCase() === config.vault.toLowerCase()
      );
    if (
      feeTransfers.length !== SAME_BLOCK_BUY_COUNT ||
      feeTransfers.reduce(
        (sum, parsed) => sum + (parsed.args.value as bigint),
        0n
      ) !== SAME_BLOCK_EXPECTED_FEE_USDC
    ) {
      throw new Error(
        "PoolManager-to-Vault transfers do not reconcile to 3.15 USDC"
      );
    }
    const naraTransfers = receipt.logs
      .filter(
        (log) =>
          log.address.toLowerCase() === config.token.toLowerCase() &&
          log.topics[0] === transferTopic
      )
      .map((log) => parsedLog(TRANSFER, log))
      .filter(
        (parsed) =>
          parsed.args.to.toLowerCase() === wallet.address.toLowerCase()
      )
      .reduce((sum, parsed) => sum + (parsed.args.value as bigint), 0n);
    if (naraTransfers !== naraReceived) {
      throw new Error(
        "NARA receipt transfers do not match the wallet balance delta"
      );
    }
    const [recordedFlowBlock, recordedFlowAmount] = await Promise.all([
      hook.flowBlock(config.base, {
        blockTag: receipt.blockNumber,
      }) as Promise<bigint>,
      hook.flowAmountInBlock(config.base, {
        blockTag: receipt.blockNumber,
      }) as Promise<bigint>,
    ]);
    if (
      recordedFlowBlock !== BigInt(receipt.blockNumber) ||
      recordedFlowAmount !== SAME_BLOCK_BUY_TOTAL_USDC
    ) {
      throw new Error("Hook per-block flow state is not exactly 60 USDC");
    }

    report.result = {
      status: "PASS",
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      swapActions: SAME_BLOCK_BUY_COUNT,
      uniqueTransactionHashes: 1,
      usdcSpent: ethers.formatUnits(usdcBefore - usdcAfter, 6),
      naraReceived: ethers.formatUnits(naraReceived, 18),
      protectedMinimumNara: ethers.formatUnits(amountOutMinimum, 18),
      hookFeeUsdc: ethers.formatUnits(totalEventFee, 6),
      vaultFeeAddedUsdc: ethers.formatUnits(vaultAfter - vaultBefore, 6),
      effectiveHookFeeBps: (
        (totalEventFee * BPS) /
        SAME_BLOCK_BUY_TOTAL_USDC
      ).toString(),
      finalTerminalFeeBps: actionEvidence.at(-1)?.terminalFeeBps,
      sqrtPriceX96Before: executionPoolState.sqrtPriceX96.toString(),
      sqrtPriceX96After: poolAfter.sqrtPriceX96.toString(),
      activeLiquidityAfter: poolAfter.liquidity.toString(),
      actions: actionEvidence,
    };
    report.status = "PASS";
  } catch (error) {
    executionError = error;
    report.status = "FAILED_STOPPED";
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    const [permitRemaining, erc20Remaining] = await Promise.all([
      permit2.allowance(
        wallet.address,
        config.base,
        config.universalRouter
      ) as Promise<[bigint, bigint, bigint]>,
      usdc.allowance(wallet.address, config.permit2) as Promise<bigint>,
    ]);
    const cleanup: Record<string, string> = {};
    if (permitRemaining[0] !== 0n) {
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
      cleanup.permit2 = receipt.hash;
    }
    if (erc20Remaining !== 0n) {
      const receipt = await sendWithMargin(
        provider,
        "Cleanup USDC allowance to Permit2",
        () => usdc.approve.estimateGas(config.permit2, 0n),
        (gasLimit) => usdc.approve(config.permit2, 0n, { gasLimit })
      );
      cleanup.erc20 = receipt.hash;
    }
    const [permitAfter, erc20After] = await Promise.all([
      permit2.allowance(
        wallet.address,
        config.base,
        config.universalRouter
      ) as Promise<[bigint, bigint, bigint]>,
      usdc.allowance(wallet.address, config.permit2) as Promise<bigint>,
    ]);
    if (permitAfter[0] !== 0n || erc20After !== 0n) {
      throw new Error("Final USDC allowances are not zero after cleanup");
    }
    report.cleanup = cleanup;
    report.finalAllowances = {
      erc20: erc20After.toString(),
      permit2: permitAfter[0].toString(),
    };
    report.finishedAt = new Date().toISOString();
    persist();
  }

  console.log(JSON.stringify({ status: report.status, outputPath }, null, 2));
  if (executionError) throw executionError;
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
