import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { canonicalProductionV4Deployment, currentV4Config } from "../lib/v4LiveConfig.js";
import { boundedSlippageBps, calculateSpotMinimum, readSqrtPriceX96 } from "../lib/v4SwapSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FLEET_FILE = path.join(__dirname, ".fleet-wallets.json");

// Universal Router Command Constants
const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external",
  "function allowance(address owner, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)",
];

const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable",
];

const HOOK_ABI = [
  "function quotePoolFee(bool isBuy, uint256 amountIn) view returns (uint16 feeBps, uint256 feeAmount)",
  "function protocolDepth(address) view returns (uint256)",
  "function flowBlock(address) view returns (uint256)",
  "function flowAmountInBlock(address) view returns (uint256)",
];

// CLI argument parsing
const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return fallback;
}
const isDryRun = args.includes("--dry-run");
const burstSize = Number(getArg("--burst", "15"));
const tradeAmountUsdc = Number(getArg("--amount", "1.0"));
const targetSpendUsdc = Number(getArg("--target-spend", "1000"));
const slippageBps = boundedSlippageBps(getArg("--slippage", "500"));

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("================================================================================");
  console.log("  NARA v4 FLEET BURST TRADER: MULTI-BLOCK PARALLEL VOLUME ENGINE");
  console.log("================================================================================");
  console.log(`Execution Mode:     ${isDryRun ? "🧪 DRY-RUN (Local Simulation)" : "🔥 LIVE ON-CHAIN BROADCAST"}`);
  console.log(`Burst Size:         ${burstSize} concurrent transactions per block`);
  console.log(`Trade Size:         $${tradeAmountUsdc.toFixed(2)} USDC per transaction`);
  console.log(`Target Cumulative:  $${targetSpendUsdc.toFixed(2)} USDC total spend`);
  console.log(`Max Waves Needed:   ~${Math.ceil(targetSpendUsdc / (burstSize * tradeAmountUsdc))} blocks`);
  console.log(`Slippage Limit:     ${slippageBps} BPS (5.0%)`);
  console.log("Anti-Sybil Policy:  STRICT ZERO-CROSS-INTERACTION (Self-Contained Isolated Swarm)");
  console.log("================================================================================\n");

  if (!fs.existsSync(FLEET_FILE)) {
    console.error(`❌ Fleet wallet file not found at ${FLEET_FILE}`);
    console.error("   Generate fleet first using: npx tsx scripts/wallet-fleet/01_generate_fleet.ts");
    process.exit(1);
  }

  const fleetData = JSON.parse(fs.readFileSync(FLEET_FILE, "utf8"));
  const fleetWallets = fleetData.wallets as Array<{ index: number; address: string; privateKey: string }>;
  console.log(`Loaded ${fleetWallets.length} isolated fleet wallets from registry.\n`);

  if (fleetWallets.length < burstSize) {
    console.error(`❌ Fleet size (${fleetWallets.length}) is smaller than requested burst size (${burstSize}).`);
    process.exit(1);
  }

  const prod = canonicalProductionV4Deployment();
  const config = currentV4Config();
  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true });

  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  const naraIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = naraIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];

  // --------------------------------------------------------------------------
  // DRY-RUN SIMULATION
  // --------------------------------------------------------------------------
  if (isDryRun) {
    console.log("▶ STARTING DRY-RUN SIMULATION...");
    let simSpent = 0;
    let simWave = 0;
    const waveUsdc = burstSize * tradeAmountUsdc;
    const startBlock = 50790000;

    while (simSpent < targetSpendUsdc) {
      simWave++;
      const currentWaveSpend = Math.min(waveUsdc, targetSpendUsdc - simSpent);
      simSpent += currentWaveSpend;
      const progressPct = ((simSpent / targetSpendUsdc) * 100).toFixed(1);
      const currentBlock = startBlock + simWave;

      console.log(
        `  🌊 Wave #${String(simWave).padStart(2, "0")} | Block #${currentBlock} | ${burstSize} Txs | +$${currentWaveSpend.toFixed(2)} USDC | Cumulative: $${simSpent.toFixed(2)} / $${targetSpendUsdc.toFixed(2)} (${progressPct}%)`
      );
      await sleep(50);
    }

    console.log("\n================================================================================");
    console.log("  🎉 DRY-RUN SIMULATION COMPLETED SUCCESSFULLY!");
    console.log(`  Total Waves / Blocks : ${simWave} blocks (~${simWave * 2} seconds on Base)`);
    console.log(`  Total Volume Injected: $${simSpent.toFixed(2)} USDC`);
    console.log(`  Target Goal Reached  : 100%`);
    console.log("  To execute live on-chain, run WITHOUT --dry-run.");
    console.log("================================================================================\n");
    return;
  }

  // --------------------------------------------------------------------------
  // LIVE EXECUTION: Pre-Flight Approvals & Balance Verification
  // --------------------------------------------------------------------------
  console.log("🔍 Checking fleet balances & Permit2 approvals for burst participants...");
  const activeSigners: Array<{ index: number; wallet: ethers.Wallet }> = [];

  for (const item of fleetWallets) {
    const wallet = new ethers.Wallet(item.privateKey, provider);
    const ethBal = await provider.getBalance(wallet.address);
    if (ethBal < ethers.parseEther("0.0001")) continue;

    const usdc = new ethers.Contract(config.base, ERC20_ABI, wallet);
    const usdcBal = (await usdc.balanceOf(wallet.address)) as bigint;
    const minRequired = ethers.parseUnits(tradeAmountUsdc.toFixed(6), 6);
    if (usdcBal < minRequired) continue;

    // Ensure Permit2 Approval
    const p2 = new ethers.Contract(config.permit2, PERMIT2_ABI, wallet);
    const p2Allowance = (await usdc.allowance(wallet.address, config.permit2)) as bigint;
    if (p2Allowance < minRequired) {
      console.log(`  [Wallet #${item.index}] Approving USDC -> Permit2...`);
      await (await usdc.approve(config.permit2, ethers.MaxUint256)).wait();
    }

    const [routerAllowance, routerExpiration] = (await p2.allowance(
      wallet.address,
      config.base,
      config.universalRouter
    )) as [bigint, bigint, bigint];
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    if (routerAllowance < minRequired || routerExpiration <= nowSeconds) {
      console.log(`  [Wallet #${item.index}] Setting Permit2 Router Allowance...`);
      const maxU160 = (1n << 160n) - 1n;
      const maxU48 = (1n << 48n) - 1n;
      await (await p2.approve(config.base, config.universalRouter, maxU160, maxU48)).wait();
    }

    activeSigners.push({ index: item.index, wallet });
    if (activeSigners.length >= burstSize) break;
  }

  if (activeSigners.length < burstSize) {
    console.error(
      `❌ Only found ${activeSigners.length} funded/approved wallets. Need at least ${burstSize}.`
    );
    console.error("   Fund wallets with USDC and ETH first using scripts 02 and 03.");
    process.exit(1);
  }

  console.log(`✅ Ready! ${activeSigners.length} wallets pre-approved for high-speed burst trading.\n`);

  // --------------------------------------------------------------------------
  // LIVE MULTI-BLOCK BURST EXECUTION LOOP
  // --------------------------------------------------------------------------
  let cumulativeSpent = 0;
  let waveCount = 0;
  const amountIn = ethers.parseUnits(tradeAmountUsdc.toFixed(6), 6);

  while (cumulativeSpent < targetSpendUsdc) {
    waveCount++;
    const remainingToSpend = targetSpendUsdc - cumulativeSpent;
    const currentBurstCount = Math.min(
      activeSigners.length,
      Math.ceil(remainingToSpend / tradeAmountUsdc)
    );
    const waveSigners = activeSigners.slice(0, currentBurstCount);
    const waveSpend = currentBurstCount * tradeAmountUsdc;

    console.log("--------------------------------------------------------------------------------");
    console.log(
      `🌊 [WAVE #${waveCount}] Launching ${currentBurstCount} concurrent trades ($${tradeAmountUsdc.toFixed(2)} each = $${waveSpend.toFixed(2)} USDC)...`
    );

    // Read current spot price right before launching burst
    const sqrtPriceX96 = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
    const [, hookFeeAmount] = (await hook.quotePoolFee(true, amountIn)) as [bigint, bigint];
    const amountOutMinimum = calculateSpotMinimum({
      amountInAfterHookFee: amountIn - hookFeeAmount,
      sqrtPriceX96,
      inputIsCurrency0: !naraIsCurrency0,
      poolFeePips: config.fee,
      slippageBps: slippageBps,
    });

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const swapParams = abi.encode(
      [
        "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      ],
      [
        [
          [currency0, currency1, config.fee, config.tickSpacing, config.hook],
          !naraIsCurrency0,
          amountIn,
          amountOutMinimum,
          "0x",
        ],
      ]
    );
    const settleParams = abi.encode(["address", "uint256"], [config.base, amountIn]);
    const takeParams = abi.encode(["address", "uint256"], [config.token, 0n]);
    const actions = new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]);
    const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);
    const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

    // BROADCAST ALL TRANSACTIONS CONCURRENTLY AT THE EXACT SAME MILLISECOND
    const broadcastStartTime = Date.now();
    const txPromises = waveSigners.map(async ({ index, wallet }) => {
      const ur = new ethers.Contract(config.universalRouter, UNIVERSAL_ROUTER_ABI, wallet);
      const tx = await ur.execute(commands, [v4Input], deadline, { gasLimit: 450_000n });
      return { index, address: wallet.address, tx };
    });

    const broadcastResults = await Promise.all(txPromises);
    console.log(`  🚀 All ${broadcastResults.length} transactions broadcast in ${Date.now() - broadcastStartTime}ms! Waiting for block confirmation...`);

    // WAIT FOR ALL RECEIPTS IN PARALLEL
    const receiptPromises = broadcastResults.map(async ({ index, address, tx }) => {
      const receipt = await tx.wait();
      return { index, address, hash: tx.hash, blockNumber: receipt.blockNumber, status: receipt.status };
    });

    const receipts = await Promise.all(receiptPromises);
    const minedBlocks = Array.from(new Set(receipts.map((r) => r.blockNumber)));
    const successful = receipts.filter((r) => r.status === 1).length;

    cumulativeSpent += waveSpend;
    const progressPct = ((cumulativeSpent / targetSpendUsdc) * 100).toFixed(1);

    console.log(`  ✅ Wave #${waveCount} Mined in Block(s): [${minedBlocks.join(", ")}]`);
    console.log(`  📊 Success: ${successful}/${receipts.length} swaps confirmed!`);
    console.log(`  💰 Cumulative Progress: $${cumulativeSpent.toFixed(2)} / $${targetSpendUsdc.toFixed(2)} USDC (${progressPct}%)`);

    // Pacing between blocks (2-3 seconds to sync with next Base block)
    if (cumulativeSpent < targetSpendUsdc) {
      console.log("  ⏳ Pacing 2.5s for next block transition...");
      await sleep(2500);
    }
  }

  console.log("\n================================================================================");
  console.log("  🎉 MULTI-BLOCK FLEET BURST RUN COMPLETED SUCCESSFULLY!");
  console.log(`  Total Waves Executed : ${waveCount}`);
  console.log(`  Total USDC Spent     : $${cumulativeSpent.toFixed(2)} USDC`);
  console.log(`  Target Goal Reached  : 100%`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Fatal Burst Trader error:", err);
  process.exit(1);
});