/**
 * Atomic 25-Swap Burst Buy Engine (NARA v4)
 *
 * Micro-Burst Buy Engine:
 *   - Bundles 25 atomic buys inside ONE single on-chain transaction (or across multiple 25-swap batches)
 *   - Allocates $1,740 USDC across 25 simultaneous Uniswap v4 swaps in the exact same block
 *   - Settle & Take executed once at the router level for maximum gas efficiency
 *   - Automatically deposits dynamic hook fees into NARALiquidityGrowthVault
 *   - Full Permit2 integration with automatic approval revocation to 0 upon completion
 *
 * Usage:
 *   # Dry-run simulation (1 transaction containing 25 atomic swaps of $69.60 USDC = $1,740 USDC total):
 *   npx tsx scripts/runSingleWalletBurstBuys.ts --dry-run --target-spend 1740 --swaps-per-tx 25
 *
 *   # Live execution on Base Mainnet:
 *   $env:V4_BURST_BUY_CONFIRMATION='EXECUTE_BURST_BUYS'
 *   npx tsx scripts/runSingleWalletBurstBuys.ts --execute --target-spend 1740 --swaps-per-tx 25
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const PINNED = {
  token: "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  hook: "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088",
  vault: "0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D",
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  fee: 3_000,
  tickSpacing: 60,
} as const;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
];
const PERMIT2_ABI = [
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function allowance(address user,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
];
const ROUTER_ABI = ["function execute(bytes commands,bytes[] inputs,uint256 deadline) payable"];

const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

export function buildAtomicBatchBuyCall(
  config: typeof PINNED,
  swapCount: number,
  amountPerSwapUsdcWei: bigint,
  totalBatchUsdcWei: bigint
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
        !tokenIsCurrency0, // zeroForOne is false for buying NARA with USDC
        amountPerSwapUsdcWei,
        0n,
        "0x",
      ],
    ]
  );

  const settleParams = abi.encode(["address", "uint256"], [config.base, totalBatchUsdcWei]);
  const takeParams = abi.encode(["address", "uint256"], [config.token, 0n]);

  const actions = ethers.hexlify(
    new Uint8Array([
      ...Array.from({ length: swapCount }, () => SWAP_EXACT_IN_SINGLE),
      SETTLE_ALL,
      TAKE_ALL,
    ])
  );
  const actionParams = [
    ...Array.from({ length: swapCount }, () => swapParams),
    settleParams,
    takeParams,
  ];
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, actionParams]);

  return {
    commands: ethers.hexlify(new Uint8Array([V4_SWAP])),
    inputs: [v4Input],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, baseDelay = 600): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt > maxRetries) throw err;
      const isRateLimit =
        err?.message?.includes("over rate limit") ||
        err?.code === -32016 ||
        err?.code === 429 ||
        err?.message?.includes("rate limit") ||
        err?.shortMessage?.includes("missing revert data");
      const isTimeout = err?.code === "TIMEOUT" || err?.message?.includes("timeout");

      if (isRateLimit || isTimeout) {
        const delay = baseDelay * Math.pow(1.8, attempt - 1) + Math.random() * 300;
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

function parseArg(flag: string, fallback: number): number {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    const val = parseFloat(process.argv[idx + 1]);
    if (!isNaN(val) && val > 0) return val;
  }
  return fallback;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run") || !process.argv.includes("--execute");
  const targetTotalUsdc = parseArg("--target-spend", 1740);
  const swapsPerTx = parseArg("--swaps-per-tx", 25);
  const batchSpendUsdc = parseArg("--batch-spend", targetTotalUsdc); // default all in 1 mega batch or split
  const totalBatches = Math.ceil(targetTotalUsdc / batchSpendUsdc);

  const amountPerSwap = Number((batchSpendUsdc / swapsPerTx).toFixed(4));

  console.log("\n==========================================================================================");
  console.log("             NARA v4 ATOMIC 25-SWAP BURST BUY ENGINE (SAME-TX BATCHING)");
  console.log("==========================================================================================");
  console.log(`Target Total Spend   : $${targetTotalUsdc.toLocaleString()} USDC`);
  console.log(`Swaps Per Transaction: ${swapsPerTx} atomic buys in 1 single on-chain transaction / block`);
  console.log(`Size Per Micro-Buy   : $${amountPerSwap.toFixed(2)} USDC per swap`);
  console.log(`Volume Per Tx/Block  : $${batchSpendUsdc.toFixed(2)} USDC per transaction`);
  console.log(`Total Transactions   : ${totalBatches} transaction(s) (= ${totalBatches * swapsPerTx} total DEX buys)`);
  console.log("==========================================================================================\n");

  if (isDryRun) {
    console.log("--- Batch Execution Plan (Simulation) ---");
    const sampleTable = [];
    for (let b = 1; b <= totalBatches; b++) {
      sampleTable.push({
        "Tx #": `Batch ${b}`,
        "Swaps in Tx": `${swapsPerTx} atomic buys`,
        "Size Each": `$${amountPerSwap.toFixed(2)} USDC`,
        "Total Spend": `$${batchSpendUsdc.toFixed(2)} USDC`,
        "Est. NARA Acquired": `~${(batchSpendUsdc / 0.123).toFixed(2)} NARA`,
        "Gas Estimated": "~0.00010 ETH (~$0.25)",
      });
    }
    console.table(sampleTable);

    console.log("\nDry-run simulation complete.");
    console.log("To execute live on Base Mainnet, set confirmation and run with --execute:");
    console.log("  $env:V4_BURST_BUY_CONFIRMATION='EXECUTE_BURST_BUYS'");
    console.log(`  npx tsx scripts/runSingleWalletBurstBuys.ts --execute --target-spend ${targetTotalUsdc} --swaps-per-tx ${swapsPerTx}\n`);
    return;
  }

  // Live Execution Guard
  const REQUIRED_CONFIRMATION = "EXECUTE_BURST_BUYS";
  if (process.env.V4_BURST_BUY_CONFIRMATION?.trim() !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Execution requires setting V4_BURST_BUY_CONFIRMATION=${REQUIRED_CONFIRMATION}`
    );
  }

  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment");

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Connecting to Base via: ${rpcUrl}`);
  console.log(`Deployer Wallet: ${wallet.address}\n`);

  const usdc = new ethers.Contract(PINNED.base, ERC20_ABI, wallet);
  const nara = new ethers.Contract(PINNED.token, ERC20_ABI, wallet);
  const permit2 = new ethers.Contract(PINNED.permit2, PERMIT2_ABI, wallet);
  const router = new ethers.Contract(PINNED.universalRouter, ROUTER_ABI, wallet);
  const vault = new ethers.Contract(
    PINNED.vault,
    [
      "function totalBaseFeeRecorded() view returns (uint256)",
      "function totalTokenFeeRecorded() view returns (uint256)",
    ],
    wallet
  );

  const [blockNumber, ethBalance, usdcBalance, naraBalance, vaultBaseBefore, vaultTokenBefore] =
    await Promise.all([
      withRetry(() => provider.getBlockNumber()),
      withRetry(() => provider.getBalance(wallet.address)),
      withRetry(() => usdc.balanceOf(wallet.address)),
      withRetry(() => nara.balanceOf(wallet.address)),
      withRetry(() => vault.totalBaseFeeRecorded()),
      withRetry(() => vault.totalTokenFeeRecorded()),
    ]);

  const availableUsdc = Number(ethers.formatUnits(usdcBalance, 6));
  console.log(`Preflight Block  : ${blockNumber}`);
  console.log(`ETH Balance      : ${ethers.formatEther(ethBalance)} ETH`);
  console.log(`USDC Balance     : $${availableUsdc.toFixed(2)} USDC`);
  console.log(`NARA Balance     : ${ethers.formatUnits(naraBalance, 18)} NARA`);
  console.log(`Vault Base Fees  : ${ethers.formatUnits(vaultBaseBefore, 6)} USDC`);
  console.log(`Vault NARA Fees  : ${ethers.formatUnits(vaultTokenBefore, 18)} NARA\n`);

  const actualTargetUsdc = Math.min(targetTotalUsdc, Math.floor(availableUsdc * 100) / 100);

  if (availableUsdc < 10) {
    throw new Error(`Insufficient USDC balance. Have $${availableUsdc.toFixed(2)} USDC`);
  }

  if (ethBalance < ethers.parseEther("0.001")) {
    throw new Error("Insufficient ETH for gas (< 0.001 ETH)");
  }

  // Permit2 Approvals
  console.log("Setting Permit2 approvals for Universal Router...");
  const maxAllowance = (1n << 160n) - 1n;
  const maxExpiration = (1n << 48n) - 1n;

  const currentUsdcAllowance = await withRetry(() => usdc.allowance(wallet.address, PINNED.permit2));
  const totalPlannedWei = ethers.parseUnits(actualTargetUsdc.toFixed(6), 6);

  if (currentUsdcAllowance < totalPlannedWei) {
    const tx = await usdc.approve(PINNED.permit2, ethers.MaxUint256);
    await withRetry(() => tx.wait(1));
    console.log(`USDC approved to Permit2: ${tx.hash}`);
    await sleep(400);
  }

  const txPermitUsdc = await permit2.approve(
    PINNED.base,
    PINNED.universalRouter,
    maxAllowance,
    maxExpiration
  );
  await withRetry(() => txPermitUsdc.wait(1));
  console.log("Permit2 approvals confirmed. Starting 25-Swap Atomic Burst Buys...\n");
  await sleep(500);

  let executedBatches = 0;
  let totalUsdcSpentWei = 0n;
  let remainingUsdc = actualTargetUsdc;

  try {
    for (let b = 1; b <= totalBatches; b++) {
      const currentBatchTarget = Math.min(batchSpendUsdc, remainingUsdc);
      const amountPerSwap = Number((currentBatchTarget / swapsPerTx).toFixed(6));

      const amountPerSwapWei = ethers.parseUnits(amountPerSwap.toFixed(6), 6);
      const totalBatchWei = amountPerSwapWei * BigInt(swapsPerTx);

      const currentBlock = await withRetry(() => provider.getBlock("latest"));
      const deadline = BigInt(currentBlock!.timestamp + 3600);

      const call = buildAtomicBatchBuyCall(PINNED, swapsPerTx, amountPerSwapWei, totalBatchWei);

      console.log(
        `[Batch Tx #${b}/${totalBatches}] Broadcasting 1 Transaction with ${swapsPerTx} ATOMIC BUYS of $${amountPerSwap.toFixed(2)} USDC ($${(amountPerSwap * swapsPerTx).toFixed(2)} USDC total in 1 block)...`
      );

      const tx = await router.execute(call.commands, call.inputs, deadline, {
        gasLimit: 3_500_000n,
      });

      const receipt = await withRetry(() => tx.wait(1));
      console.log(
        `  -> Confirmed! Block: ${receipt.blockNumber} | Tx: ${receipt.hash} | ${swapsPerTx} Buys Executed in 1 Tx! 🎉\n`
      );

      executedBatches++;
      totalUsdcSpentWei += totalBatchWei;
      remainingUsdc -= Number(ethers.formatUnits(totalBatchWei, 6));

      if (b < totalBatches) {
        await sleep(3000);
      }
    }
  } finally {
    console.log("Cleaning up and revoking Permit2 allowances...");
    try {
      const txRevokeUsdc = await permit2.approve(PINNED.base, PINNED.universalRouter, 0n, 0n);
      await withRetry(() => txRevokeUsdc.wait(1));
      console.log("Permit2 allowances revoked to zero.\n");
    } catch (cleanupErr) {
      console.error("Warning: Cleanup revocation failed:", cleanupErr);
    }
  }

  const [usdcBalanceAfter, naraBalanceAfter, vaultBaseAfter, vaultTokenAfter] = await Promise.all([
    withRetry(() => usdc.balanceOf(wallet.address)),
    withRetry(() => nara.balanceOf(wallet.address)),
    withRetry(() => vault.totalBaseFeeRecorded()),
    withRetry(() => vault.totalTokenFeeRecorded()),
  ]);

  console.log("==========================================================================================");
  console.log("                    ATOMIC BURST BUY BATCH COMPLETE");
  console.log("==========================================================================================");
  console.log(`Total Batch Txns Mined  : ${executedBatches} transaction(s)`);
  console.log(`Total Atomic Buys       : ${executedBatches * swapsPerTx} separate buys`);
  console.log(`Total USDC Spent        : $${ethers.formatUnits(totalUsdcSpentWei, 6)} USDC`);
  console.log(`NARA Balance Gained     : +${ethers.formatUnits(naraBalanceAfter - naraBalance, 18)} NARA`);
  console.log(`Vault Base Fees Gained  : +$${ethers.formatUnits(vaultBaseAfter - vaultBaseBefore, 6)} USDC`);
  console.log(`Final Wallet USDC       : $${ethers.formatUnits(usdcBalanceAfter, 6)} USDC`);
  console.log(`Final Wallet NARA       : ${ethers.formatUnits(naraBalanceAfter, 18)} NARA`);
  console.log("==========================================================================================\n");
}

main().catch(console.error);
