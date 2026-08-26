/**
 * Reverses the exact NARA output of the approved 20 x 3 USDC same-block buy.
 * One atomic Universal Router transaction executes 20 NARA sell actions in one
 * Base block. Default mode is read-only.
 *
 * Production execution requires both --execute and
 * V4_LIVE_SAME_BLOCK_SELL_CONFIRMATION=SELL_FAST_BUY_NARA_20_ACTIONS_SAME_BLOCK.
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

const EXECUTION_CONFIRMATION = "SELL_FAST_BUY_NARA_20_ACTIONS_SAME_BLOCK";
const SOURCE_BUY_TRANSACTION =
  "0x8b305a8c3e441dbf68fcf5a1e14fab021be0eeef3c98bd659cb0433b3a78d106";
const BASE_CHAIN_ID = 8453n;
export const REVERSAL_SELL_COUNT = 20;
export const REVERSAL_NARA_TOTAL = ethers.parseUnits(
  "5476.535036293903312662",
  18
);
const REVERSAL_NARA_PIECE = REVERSAL_NARA_TOTAL / BigInt(REVERSAL_SELL_COUNT);
export const REVERSAL_NARA_AMOUNTS = Array.from(
  { length: REVERSAL_SELL_COUNT },
  (_, index) =>
    index === REVERSAL_SELL_COUNT - 1
      ? REVERSAL_NARA_TOTAL -
        REVERSAL_NARA_PIECE * BigInt(REVERSAL_SELL_COUNT - 1)
      : REVERSAL_NARA_PIECE
);
const OUTPUT_TOLERANCE_BPS = 1_000n;
const BPS = 10_000n;
const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

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
  "function sellCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function flowBlock(address) view returns (uint256)",
  "function flowAmountInBlock(address) view returns (uint256)",
  "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
];
const VAULT_ABI = [
  "function totalTokenFeeRecorded() view returns (uint256)",
  "event PoolFeeRecorded(address indexed currency,address indexed sender,uint256 amount,uint16 feeBps,bool isBuy)",
];
const POOL_MANAGER_ABI = ["function extsload(bytes32) view returns (bytes32)"];
const TRANSFER = new ethers.Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

type SellCallConfig = {
  token: string;
  base: string;
  hook: string;
  fee: number;
  tickSpacing: number;
};

export function buildSameBlockSellCall(
  config: SellCallConfig,
  aggregateMinimumUsdc: bigint,
  deadline: bigint
): { commands: string; inputs: string[] } {
  const tokenIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = tokenIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const swapParams = REVERSAL_NARA_AMOUNTS.map((amountIn) =>
    abi.encode(
      [
        "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      ],
      [
        [
          [currency0, currency1, config.fee, config.tickSpacing, config.hook],
          tokenIsCurrency0,
          amountIn,
          0n,
          "0x",
        ],
      ]
    )
  );
  const settleParams = abi.encode(
    ["address", "uint256"],
    [config.token, REVERSAL_NARA_TOTAL]
  );
  const takeParams = abi.encode(
    ["address", "uint256"],
    [config.base, aggregateMinimumUsdc]
  );
  const actions = ethers.hexlify(
    new Uint8Array([
      ...Array.from(
        { length: REVERSAL_SELL_COUNT },
        () => SWAP_EXACT_IN_SINGLE
      ),
      SETTLE_ALL,
      TAKE_ALL,
    ])
  );
  const v4Input = abi.encode(
    ["bytes", "bytes[]"],
    [actions, [...swapParams, settleParams, takeParams]]
  );
  return {
    commands: ethers.hexlify(new Uint8Array([V4_SWAP])),
    inputs: [v4Input],
  };
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  if (
    execute &&
    process.env.V4_LIVE_SAME_BLOCK_SELL_CONFIRMATION?.trim() !==
      EXECUTION_CONFIRMATION
  ) {
    throw new Error(
      `Execution requires V4_LIVE_SAME_BLOCK_SELL_CONFIRMATION=${EXECUTION_CONFIRMATION}`
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

  const nara = new ethers.Contract(config.token, ERC20_ABI, wallet);
  const usdc = new ethers.Contract(config.base, ERC20_ABI, wallet);
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

  const sourceReceipt = await provider.getTransactionReceipt(
    SOURCE_BUY_TRANSACTION
  );
  if (!sourceReceipt || sourceReceipt.status !== 1) {
    throw new Error("Source same-block buy receipt is unavailable or failed");
  }
  const transferTopic = TRANSFER.getEvent("Transfer")?.topicHash;
  if (!transferTopic) throw new Error("Transfer topic unavailable");
  const sourceNaraReceived = sourceReceipt.logs
    .filter(
      (log) =>
        log.address.toLowerCase() === config.token.toLowerCase() &&
        log.topics[0] === transferTopic
    )
    .map((log) => parsedLog(TRANSFER, log))
    .filter(
      (parsed) => parsed.args.to.toLowerCase() === wallet.address.toLowerCase()
    )
    .reduce((sum, parsed) => sum + (parsed.args.value as bigint), 0n);
  if (sourceNaraReceived !== REVERSAL_NARA_TOTAL) {
    throw new Error(
      "Exact reversal amount does not match the source buy receipt"
    );
  }

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
    naraBalance,
    usdcBalance,
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
    hook.protocolDepth(config.token, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    hook.sellCurve({ blockTag: preflightBlock.number }) as Promise<
      readonly bigint[]
    >,
    nara.balanceOf(wallet.address, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    usdc.balanceOf(wallet.address, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    provider.getBalance(wallet.address, preflightBlock.number),
    nara.allowance(wallet.address, config.permit2, {
      blockTag: preflightBlock.number,
    }) as Promise<bigint>,
    permit2.allowance(wallet.address, config.token, config.universalRouter, {
      blockTag: preflightBlock.number,
    }) as Promise<[bigint, bigint, bigint]>,
    vault.totalTokenFeeRecorded({
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
  if (depth !== 60_000n * 10n ** 18n) {
    throw new Error(`Unexpected configured NARA depth: ${depth}`);
  }
  const expectedCurve = [
    500n,
    1_500n,
    3_000n,
    500n,
    700n,
    1_000n,
    1_500n,
    2_000n,
  ];
  if (curve.some((value, index) => value !== expectedCurve[index])) {
    throw new Error(
      "Active sell curve differs from the approved activation curve"
    );
  }
  const expectedFee = cumulativeFee(curve, REVERSAL_NARA_TOTAL, depth);
  if (naraBalance < REVERSAL_NARA_TOTAL) {
    throw new Error("Wallet does not hold the exact source-buy NARA output");
  }
  if (ethBalance < ethers.parseEther("0.001")) {
    throw new Error("Wallet has less than the 0.001 ETH gas floor");
  }
  if (erc20Allowance !== 0n || permit2Allowance[0] !== 0n) {
    throw new Error("Expected clean zero NARA allowances before reversal");
  }

  const quoteParams = {
    poolKey: {
      currency0: config.canonicalPoolKey.currency0,
      currency1: config.canonicalPoolKey.currency1,
      fee: config.fee,
      tickSpacing: config.tickSpacing,
      hooks: config.hook,
    },
    zeroForOne: config.canonicalPoolKey.tokenIsCurrency0,
    exactAmount: REVERSAL_NARA_TOTAL,
    hookData: "0x",
  };
  const [aggregateQuote, quoteGasEstimate] =
    (await quoter.quoteExactInputSingle.staticCall(quoteParams, {
      blockTag: preflightBlock.number,
    })) as [bigint, bigint];
  if (aggregateQuote === 0n)
    throw new Error("V4Quoter returned zero USDC output");
  const preflightMinimum =
    (aggregateQuote * (BPS - OUTPUT_TOLERANCE_BPS)) / BPS;

  const preflight = {
    mode: execute ? "EXECUTE" : "READ_ONLY",
    chainId: network.chainId.toString(),
    wallet: wallet.address,
    privateKey: "loaded locally; never displayed",
    sourceBuyTransaction: SOURCE_BUY_TRANSACTION,
    sourceBuyBlock: sourceReceipt.blockNumber,
    transactionCount: 1,
    sellActions: REVERSAL_SELL_COUNT,
    totalNara: ethers.formatUnits(REVERSAL_NARA_TOTAL, 18),
    baseActionNara: ethers.formatUnits(REVERSAL_NARA_PIECE, 18),
    finalActionNara: ethers.formatUnits(REVERSAL_NARA_AMOUNTS.at(-1)!, 18),
    expectedHookFeeNara: ethers.formatUnits(expectedFee, 18),
    expectedEffectiveFeeBps: (
      (expectedFee * BPS) /
      REVERSAL_NARA_TOTAL
    ).toString(),
    terminalFeeBps: terminalFeeBps(
      curve,
      REVERSAL_NARA_TOTAL,
      depth
    ).toString(),
    preflightBlock: preflightBlock.number,
    preflightBlockHash: preflightBlock.hash,
    poolId: config.poolId,
    sqrtPriceX96: poolState.sqrtPriceX96.toString(),
    activeLiquidity: poolState.liquidity.toString(),
    naraBalance: ethers.formatUnits(naraBalance, 18),
    usdcBalance: ethers.formatUnits(usdcBalance, 6),
    ethBalance: ethers.formatEther(ethBalance),
    aggregateQuotedUsdc: ethers.formatUnits(aggregateQuote, 6),
    protectedMinimumUsdc: ethers.formatUnits(preflightMinimum, 6),
    quoteGasEstimate: quoteGasEstimate.toString(),
    allowancesClean: true,
    vaultFeeRecordedBeforeNara: ethers.formatUnits(feeRecorded, 18),
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
    "v4-live-sell-reversal-same-block-20-actions-latest.json"
  );
  const persist = () =>
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  persist();

  let executionError: unknown;
  try {
    const approval = await sendWithMargin(
      provider,
      "NARA exact approval to Permit2",
      () => nara.approve.estimateGas(config.permit2, REVERSAL_NARA_TOTAL),
      (gasLimit) =>
        nara.approve(config.permit2, REVERSAL_NARA_TOTAL, { gasLimit })
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
          config.token,
          config.universalRouter,
          REVERSAL_NARA_TOTAL,
          expiration
        ),
      (gasLimit) =>
        permit2.approve(
          config.token,
          config.universalRouter,
          REVERSAL_NARA_TOTAL,
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
    const atomicCall = buildSameBlockSellCall(
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
    const [naraBefore, usdcBefore, vaultBefore] = await Promise.all([
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
      aggregateQuotedUsdc: ethers.formatUnits(executionQuote, 6),
      protectedMinimumUsdc: ethers.formatUnits(amountOutMinimum, 6),
      estimatedGas: estimatedGas.toString(),
      gasLimit: gasLimit.toString(),
    };
    persist();
    console.log(`Atomic 20-action NARA reversal: ${transaction.hash}`);
    const receipt = await canonicalReceipt(provider, transaction);

    const [naraAfter, usdcAfter, vaultAfter, poolAfter] = await Promise.all([
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
    if (naraBefore - naraAfter !== REVERSAL_NARA_TOTAL) {
      throw new Error(
        "Atomic reversal did not spend the exact source-buy NARA"
      );
    }
    if (usdcReceived < amountOutMinimum) {
      throw new Error(
        "Atomic reversal USDC output is below the protected minimum"
      );
    }
    if (vaultAfter - vaultBefore !== expectedFee) {
      throw new Error(
        "Vault NARA fee delta does not match the integrated sell fee"
      );
    }

    const hookInterface = new ethers.Interface(HOOK_ABI);
    const vaultInterface = new ethers.Interface(VAULT_ABI);
    const hookTopic = hookInterface.getEvent("PoolFeeTaken")?.topicHash;
    const vaultTopic = vaultInterface.getEvent("PoolFeeRecorded")?.topicHash;
    if (!hookTopic || !vaultTopic)
      throw new Error("Required event topic missing");
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
          parsed.args.currency.toLowerCase() === config.token.toLowerCase() &&
          parsed.args.isBuy === false
      );
    if (hookEvents.length !== REVERSAL_SELL_COUNT) {
      throw new Error(
        `Expected 20 Hook sell events, found ${hookEvents.length}`
      );
    }
    const allBlockHookLogs = await provider.getLogs({
      address: config.hook,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      topics: [hookTopic, config.poolId],
    });
    const allBlockSells = allBlockHookLogs
      .map((log) => ({ log, parsed: parsedLog(hookInterface, log) }))
      .filter(
        ({ parsed }) =>
          parsed.args.currency.toLowerCase() === config.token.toLowerCase() &&
          parsed.args.isBuy === false
      );
    if (
      allBlockSells.length !== REVERSAL_SELL_COUNT ||
      allBlockSells.some(({ log }) => log.transactionHash !== receipt.hash)
    ) {
      throw new Error(
        "Receipt block contains an unexpected external NARA sell"
      );
    }

    let cumulativeAmount = 0n;
    let previousCumulativeFee = 0n;
    let totalEventFee = 0n;
    const actionEvidence = hookEvents.map(({ log, parsed }, index) => {
      cumulativeAmount += REVERSAL_NARA_AMOUNTS[index];
      const cumulativeDue = cumulativeFee(curve, cumulativeAmount, depth);
      const expectedIncrement = cumulativeDue - previousCumulativeFee;
      const expectedTier = terminalFeeBps(curve, cumulativeAmount, depth);
      previousCumulativeFee = cumulativeDue;
      const amountIn = parsed.args.amountIn as bigint;
      const feeAmount = parsed.args.feeAmount as bigint;
      const feeBps = parsed.args.feeBps as bigint;
      if (
        amountIn !== REVERSAL_NARA_AMOUNTS[index] ||
        feeAmount !== expectedIncrement ||
        feeBps !== expectedTier ||
        parsed.args.sender.toLowerCase() !==
          config.universalRouter.toLowerCase()
      ) {
        throw new Error(`Hook fee mismatch at sell action ${index + 1}`);
      }
      totalEventFee += feeAmount;
      return {
        sequence: index + 1,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        logIndex: log.index,
        naraIn: ethers.formatUnits(amountIn, 18),
        cumulativeNaraIn: ethers.formatUnits(cumulativeAmount, 18),
        hookFeeNara: ethers.formatUnits(feeAmount, 18),
        terminalFeeBps: feeBps.toString(),
      };
    });
    if (totalEventFee !== expectedFee) {
      throw new Error("Hook sell events do not total the integrated fee");
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
    if (vaultEvents.length !== REVERSAL_SELL_COUNT) {
      throw new Error(
        `Expected 20 Vault sell-fee events, found ${vaultEvents.length}`
      );
    }
    for (let index = 0; index < vaultEvents.length; index += 1) {
      if (
        vaultEvents[index].args.amount !==
          hookEvents[index].parsed.args.feeAmount ||
        vaultEvents[index].args.feeBps !== hookEvents[index].parsed.args.feeBps
      ) {
        throw new Error(`Vault event mismatch at sell action ${index + 1}`);
      }
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
          parsed.args.from.toLowerCase() === config.poolManager.toLowerCase() &&
          parsed.args.to.toLowerCase() === config.vault.toLowerCase()
      );
    if (
      feeTransfers.length !== REVERSAL_SELL_COUNT ||
      feeTransfers.reduce(
        (sum, parsed) => sum + (parsed.args.value as bigint),
        0n
      ) !== expectedFee
    ) {
      throw new Error("PoolManager-to-Vault NARA transfers do not reconcile");
    }
    const usdcTransfers = receipt.logs
      .filter(
        (log) =>
          log.address.toLowerCase() === config.base.toLowerCase() &&
          log.topics[0] === transferTopic
      )
      .map((log) => parsedLog(TRANSFER, log))
      .filter(
        (parsed) =>
          parsed.args.to.toLowerCase() === wallet.address.toLowerCase()
      )
      .reduce((sum, parsed) => sum + (parsed.args.value as bigint), 0n);
    if (usdcTransfers !== usdcReceived) {
      throw new Error("USDC receipt transfers do not match the balance delta");
    }
    const [recordedFlowBlock, recordedFlowAmount] = await Promise.all([
      hook.flowBlock(config.token, {
        blockTag: receipt.blockNumber,
      }) as Promise<bigint>,
      hook.flowAmountInBlock(config.token, {
        blockTag: receipt.blockNumber,
      }) as Promise<bigint>,
    ]);
    if (
      recordedFlowBlock !== BigInt(receipt.blockNumber) ||
      recordedFlowAmount !== REVERSAL_NARA_TOTAL
    ) {
      throw new Error(
        "Hook per-block NARA flow is not the exact reversal amount"
      );
    }

    report.result = {
      status: "PASS",
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      sellActions: REVERSAL_SELL_COUNT,
      uniqueTransactionHashes: 1,
      naraSpent: ethers.formatUnits(naraBefore - naraAfter, 18),
      usdcReceived: ethers.formatUnits(usdcReceived, 6),
      protectedMinimumUsdc: ethers.formatUnits(amountOutMinimum, 6),
      hookFeeNara: ethers.formatUnits(totalEventFee, 18),
      vaultFeeAddedNara: ethers.formatUnits(vaultAfter - vaultBefore, 18),
      effectiveHookFeeBps: (
        (totalEventFee * BPS) /
        REVERSAL_NARA_TOTAL
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
        config.token,
        config.universalRouter
      ) as Promise<[bigint, bigint, bigint]>,
      nara.allowance(wallet.address, config.permit2) as Promise<bigint>,
    ]);
    const cleanup: Record<string, string> = {};
    if (permitRemaining[0] !== 0n) {
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
      cleanup.permit2 = receipt.hash;
    }
    if (erc20Remaining !== 0n) {
      const receipt = await sendWithMargin(
        provider,
        "Cleanup NARA allowance to Permit2",
        () => nara.approve.estimateGas(config.permit2, 0n),
        (gasLimit) => nara.approve(config.permit2, 0n, { gasLimit })
      );
      cleanup.erc20 = receipt.hash;
    }
    const [permitAfter, erc20After] = await Promise.all([
      permit2.allowance(
        wallet.address,
        config.token,
        config.universalRouter
      ) as Promise<[bigint, bigint, bigint]>,
      nara.allowance(wallet.address, config.permit2) as Promise<bigint>,
    ]);
    if (permitAfter[0] !== 0n || erc20After !== 0n) {
      throw new Error("Final NARA allowances are not zero after cleanup");
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
