/**
 * Atomic 15-Swap Burst Sell Engine (NARA v4)
 *
 * Micro-Burst Sell Engine:
 *   - 10 NARA per micro-swap
 *   - 15 atomic swaps bundled inside ONE single on-chain transaction
 *   - 150 NARA total volume per transaction / block
 *   - Produces 15 distinct Uniswap v4 Swap events in a single block
 *   - Automatically executes across batches to fulfill the target sell volume (e.g. 10,000 NARA)
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

export function buildAtomicBatchSellCall(
  config: typeof PINNED,
  swapCount: number,
  amountPerSwapNaraWei: bigint,
  totalNaraWei: bigint
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
        tokenIsCurrency0,
        amountPerSwapNaraWei,
        0n,
        "0x",
      ],
    ]
  );

  const settleParams = abi.encode(["address", "uint256"], [config.token, totalNaraWei]);
  const takeParams = abi.encode(["address", "uint256"], [config.base, 0n]);

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
  const targetTotalNara = parseArg("--target-sell", 10_000);
  const sizePerSwapNara = parseArg("--size", 10); // 10 NARA per micro-swap
  const swapsPerBatch = parseArg("--swaps-per-tx", 15); // 15 swaps in 1 block/tx
  const batchNara = sizePerSwapNara * swapsPerBatch; // 150 NARA per tx
  const totalBatches = Math.ceil(targetTotalNara / batchNara);

  console.log("\n==========================================================================================");
  console.log("             NARA v4 ATOMIC 15-SWAP BURST SELL ENGINE (10 NARA SWAPS)");
  console.log("==========================================================================================");
  console.log(`Target Total Sell    : ${targetTotalNara.toLocaleString()} NARA`);
  console.log(`Swaps Per Transaction: ${swapsPerBatch} atomic swaps in 1 block/transaction`);
  console.log(`Size Per Micro-Swap  : ${sizePerSwapNara.toFixed(2)} NARA (~$${(sizePerSwapNara * 0.123).toFixed(2)} USD each)`);
  console.log(`Batch Volume Per Tx  : ${batchNara.toFixed(2)} NARA per transaction (~$${(batchNara * 0.123).toFixed(2)} USD per block)`);
  console.log(`Total Transactions   : ${totalBatches} transactions (= ${totalBatches * swapsPerBatch} total DEX swaps)`);
  console.log("==========================================================================================\n");

  if (isDryRun) {
    console.log("--- Batch Execution Plan (Simulation) ---");
    const sampleTable = [];
    for (let b = 1; b <= Math.min(totalBatches, 10); b++) {
      sampleTable.push({
        "Tx #": `Batch ${b}`,
        "Swaps in Tx": `${swapsPerBatch} atomic swaps`,
        "Size Each": `${sizePerSwapNara.toFixed(2)} NARA`,
        "NARA Sold": `${batchNara.toFixed(2)} NARA`,
        "Est. USDC Gained": `~$${(batchNara * 0.123).toFixed(2)} USDC`,
        "Gas Estimated": "~0.00008 ETH (~$0.20)",
      });
    }
    console.table(sampleTable);
    if (totalBatches > 10) {
      console.log(`... and ${totalBatches - 10} more batch transactions to complete ${targetTotalNara.toLocaleString()} NARA.\n`);
    }

    console.log("Dry-run simulation complete.");
    console.log("To execute live on Base Mainnet, set confirmation and run with --execute:");
    console.log("  $env:V4_BURST_SELL_CONFIRMATION='EXECUTE_BURST_SELLS'");
    console.log(`  npx tsx scripts/runSingleWalletBurstSells.ts --execute --target-sell ${targetTotalNara} --size ${sizePerSwapNara} --swaps-per-tx ${swapsPerBatch}\n`);
    return;
  }

  // Live Execution Guard
  const REQUIRED_CONFIRMATION = "EXECUTE_BURST_SELLS";
  if (process.env.V4_BURST_SELL_CONFIRMATION?.trim() !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Execution requires setting V4_BURST_SELL_CONFIRMATION=${REQUIRED_CONFIRMATION}`
    );
  }

  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment");

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`Connecting to Base via: ${rpcUrl}`);
  console.log(`Deployer Wallet: ${wallet.address}\n`);

  const nara = new ethers.Contract(PINNED.token, ERC20_ABI, wallet);
  const usdc = new ethers.Contract(PINNED.base, ERC20_ABI, wallet);
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

  const [blockNumber, ethBalance, naraBalance, usdcBalance, vaultBaseBefore, vaultTokenBefore] =
    await Promise.all([
      withRetry(() => provider.getBlockNumber()),
      withRetry(() => provider.getBalance(wallet.address)),
      withRetry(() => nara.balanceOf(wallet.address)),
      withRetry(() => usdc.balanceOf(wallet.address)),
      withRetry(() => vault.totalBaseFeeRecorded()),
      withRetry(() => vault.totalTokenFeeRecorded()),
    ]);

  const availableNara = Number(ethers.formatUnits(naraBalance, 18));
  console.log(`Preflight Block  : ${blockNumber}`);
  console.log(`ETH Balance      : ${ethers.formatEther(ethBalance)} ETH`);
  console.log(`NARA Balance     : ${availableNara.toFixed(2)} NARA`);
  console.log(`USDC Balance     : ${ethers.formatUnits(usdcBalance, 6)} USDC`);
  console.log(`Vault Base Fees  : ${ethers.formatUnits(vaultBaseBefore, 6)} USDC`);
  console.log(`Vault NARA Fees  : ${ethers.formatUnits(vaultTokenBefore, 18)} NARA\n`);

  const actualTargetNara = Math.min(targetTotalNara, availableNara);
  const actualBatches = Math.ceil(actualTargetNara / batchNara);

  if (availableNara < batchNara) {
    throw new Error(`Insufficient NARA balance for even 1 batch. Have ${availableNara.toFixed(2)} NARA, need ${batchNara}`);
  }

  if (ethBalance < ethers.parseEther("0.001")) {
    throw new Error("Insufficient ETH for gas (< 0.001 ETH)");
  }

  console.log("Setting Permit2 approvals for Universal Router...");
  const maxAllowance = (1n << 160n) - 1n;
  const maxExpiration = (1n << 48n) - 1n;

  const currentNaraAllowance = await withRetry(() => nara.allowance(wallet.address, PINNED.permit2));
  const totalPlannedWei = ethers.parseUnits(actualTargetNara.toFixed(18), 18);

  if (currentNaraAllowance < totalPlannedWei) {
    const tx = await nara.approve(PINNED.permit2, ethers.MaxUint256);
    await withRetry(() => tx.wait(1));
    console.log(`NARA approved to Permit2: ${tx.hash}`);
    await sleep(400);
  }

  const txPermitNara = await permit2.approve(
    PINNED.token,
    PINNED.universalRouter,
    maxAllowance,
    maxExpiration
  );
  await withRetry(() => txPermitNara.wait(1));
  console.log("Permit2 approvals confirmed. Starting 15-Swap Atomic Burst Sells (10 NARA per swap)...\n");
  await sleep(500);

  let executedBatches = 0;
  let totalNaraSoldWei = 0n;
  let remainingNara = actualTargetNara;

  try {
    for (let b = 1; b <= actualBatches; b++) {
      const currentBatchTarget = Math.min(batchNara, remainingNara);
      const swapCount = Math.max(1, Math.round(currentBatchTarget / sizePerSwapNara));
      const amountPerSwap = Number((currentBatchTarget / swapCount).toFixed(4));

      const amountPerSwapWei = ethers.parseUnits(amountPerSwap.toFixed(18), 18);
      const totalBatchWei = amountPerSwapWei * BigInt(swapCount);

      const currentBlock = await withRetry(() => provider.getBlock("latest"));
      const deadline = BigInt(currentBlock!.timestamp + 3600);

      const call = buildAtomicBatchSellCall(PINNED, swapCount, amountPerSwapWei, totalBatchWei);

      console.log(
        `[Batch Tx #${b}/${actualBatches}] Broadcasting 1 Transaction with ${swapCount} ATOMIC SWAPS of ~${amountPerSwap.toFixed(2)} NARA (${(amountPerSwap * swapCount).toFixed(2)} NARA total in 1 block)...`
      );

      const tx = await router.execute(call.commands, call.inputs, deadline, {
        gasLimit: 2_500_000n,
      });

      const receipt = await withRetry(() => tx.wait(1));
      console.log(
        `  -> Confirmed! Block: ${receipt.blockNumber} | Tx: ${receipt.hash} | ${swapCount} Swaps Executed in 1 Tx! 🎉\n`
      );

      executedBatches++;
      totalNaraSoldWei += totalBatchWei;
      remainingNara -= Number(ethers.formatUnits(totalBatchWei, 18));

      if (b < actualBatches) {
        await sleep(3000);
      }
    }
  } finally {
    console.log("Cleaning up and revoking Permit2 allowances...");
    try {
      const txRevokeNara = await permit2.approve(PINNED.token, PINNED.universalRouter, 0n, 0n);
      await withRetry(() => txRevokeNara.wait(1));
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
  console.log("                    ATOMIC BURST SELL BATCH SEQUENCE COMPLETE");
  console.log("==========================================================================================");
  console.log(`Total Batch Txns Mined  : ${executedBatches} transactions`);
  console.log(`Total Atomic Swaps      : ${executedBatches * swapsPerBatch} separate swaps`);
  console.log(`Total NARA Sold         : ${ethers.formatUnits(totalNaraSoldWei, 18)} NARA`);
  console.log(`USDC Balance Gained     : +$${ethers.formatUnits(usdcBalanceAfter - usdcBalance, 6)} USDC`);
  console.log(`Vault NARA Fees Gained  : +${ethers.formatUnits(vaultTokenAfter - vaultTokenBefore, 18)} NARA`);
  console.log(`Final Wallet NARA       : ${ethers.formatUnits(naraBalanceAfter, 18)} NARA`);
  console.log(`Final Wallet USDC       : ${ethers.formatUnits(usdcBalanceAfter, 6)} USDC`);
  console.log("==========================================================================================\n");
}

main().catch(console.error);
