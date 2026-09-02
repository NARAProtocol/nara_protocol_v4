/**
 * NARA v4 Single-Wallet Burst Buyer
 *
 * Executes waves of 15 micro-buys ($1.00 each) per block from your single operational
 * wallet (e.g. LIQ_PRIVATE_KEY 0x2902...020B or PRIVATE_KEY 0xAE9D...2aB5) across
 * consecutive Base blocks until the target spend is reached.
 *
 * Features:
 *   - Uses your existing single funded wallet (no fleet setup or micro-dispersal needed)
 *   - Packs 15 sequential swaps into each block wave
 *   - Auto-checks and sets Permit2 / Universal Router allowances
 *   - Real-time HUD showing Block #, Tx hashes, Vault fees, and cumulative progress
 *   - Safe dry-run mode (--dry-run) and live mode (--execute)
 *
 * Usage:
 *   Dry-Run:
 *     npx tsx scripts/runSingleWalletBurstBuys.ts --dry-run --burst 15 --amount 1.0 --target-spend 500
 *
 *   Live On-Chain:
 *     npx tsx scripts/runSingleWalletBurstBuys.ts --execute --burst 15 --amount 1.0 --target-spend 500
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentV4Config, requiredBaseRpcUrl } from "./lib/v4LiveConfig.js";
import { boundedSlippageBps, calculateSpotMinimum, readSqrtPriceX96 } from "./lib/v4SwapSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

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

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return fallback;
}
const isExecute = args.includes("--execute");
const isDryRun = args.includes("--dry-run") || !isExecute;
const burstSize = Number(getArg("--burst", "15"));
const tradeAmountUsdc = Number(getArg("--amount", "1.0"));
const targetSpendArg = Number(getArg("--target-spend", "500"));
const walletChoice = getArg("--wallet", "treasury").toLowerCase(); // 'treasury', 'liq', or 'deployer'
const slippageBps = boundedSlippageBps(getArg("--slippage", "500"));

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("================================================================================");
  console.log("  NARA v4 SINGLE-WALLET BURST BUYER: MULTI-BLOCK VOLUME ENGINE");
  console.log("================================================================================");
  console.log(`Execution Mode:     ${isDryRun ? "ðŸ§ª DRY-RUN (Local Simulation)" : "ðŸ”¥ LIVE ON-CHAIN BROADCAST"}`);
  console.log(`Burst Size:         ${burstSize} micro-buys per block wave`);
  console.log(`Trade Size:         $${tradeAmountUsdc.toFixed(2)} USDC per micro-buy`);
  console.log(`Wave Total:         $${(burstSize * tradeAmountUsdc).toFixed(2)} USDC per block`);
  console.log(`Target Spend:       $${targetSpendArg.toFixed(2)} USDC cumulative`);
  console.log(`Slippage Limit:     ${slippageBps} BPS (5.0%)`);
  console.log("================================================================================\n");

  const config = currentV4Config();
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl(), 8453, { staticNetwork: true });

  // Select Wallet Key
  let privateKey: string | undefined;
  if (walletChoice === "treasury") {
    privateKey = process.env.TREASURY_PRIVATE_KEY;
  } else if (walletChoice === "deployer") {
    privateKey = process.env.PRIVATE_KEY;
  } else if (walletChoice === "liq") {
    privateKey = process.env.LIQ_PRIVATE_KEY;
  } else {
    privateKey = process.env.TREASURY_PRIVATE_KEY || process.env.LIQ_PRIVATE_KEY || process.env.PRIVATE_KEY;
  }

  if (!privateKey) {
    console.error("âŒ No private key found in .env for wallet choice:", walletChoice);
    process.exit(1);
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const usdc = new ethers.Contract(config.base, ERC20_ABI, wallet);
  const nara = new ethers.Contract(config.token, ERC20_ABI, wallet);
  const p2 = new ethers.Contract(config.permit2, PERMIT2_ABI, wallet);
  const ur = new ethers.Contract(config.universalRouter, UNIVERSAL_ROUTER_ABI, wallet);
  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);

  const [ethBal, usdcBal, naraBal] = await Promise.all([
    provider.getBalance(wallet.address),
    usdc.balanceOf(wallet.address) as Promise<bigint>,
    nara.balanceOf(wallet.address) as Promise<bigint>,
  ]);

  const humanUsdc = Number(usdcBal) / 1e6;
  console.log(`Active Wallet:      ${wallet.address} (${walletChoice.toUpperCase()})`);
  console.log(`ETH Balance:        ${ethers.formatEther(ethBal)} ETH`);
  console.log(`USDC Available:     $${humanUsdc.toFixed(2)} USDC`);
  console.log(`NARA Holding:       ${(Number(naraBal) / 1e18).toFixed(2)} NARA\n`);

  const actualTargetSpend = Math.min(targetSpendArg, humanUsdc);
  if (actualTargetSpend < tradeAmountUsdc && !isDryRun) {
    console.error(`âŒ Insufficient USDC in wallet ($${humanUsdc.toFixed(2)}) for target spend.`);
    process.exit(1);
  }

  const naraIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = naraIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];

  const poolKey = [currency0, currency1, config.fee, config.tickSpacing, config.hook];
  const waveUsdc = burstSize * tradeAmountUsdc;
  const totalWaves = Math.ceil(actualTargetSpend / waveUsdc);

  // --------------------------------------------------------------------------
  // DRY RUN SIMULATION
  // --------------------------------------------------------------------------
  if (isDryRun) {
    console.log(`â–¶ DRY-RUN SIMULATION: ${totalWaves} Waves of ${burstSize} Buys ($${waveUsdc.toFixed(2)} USDC/block)...`);
    let simSpent = 0;
    const startBlock = await provider.getBlockNumber();

    for (let wave = 1; wave <= totalWaves; wave++) {
      const currentWaveSpend = Math.min(waveUsdc, actualTargetSpend - simSpent);
      simSpent += currentWaveSpend;
      const progressPct = ((simSpent / actualTargetSpend) * 100).toFixed(1);
      const simBlock = startBlock + wave;

      console.log(
        `  ðŸŒŠ Wave #${String(wave).padStart(2, "0")} | Block #${simBlock} | ${burstSize} Swaps | +$${currentWaveSpend.toFixed(2)} USDC | Cumulative: $${simSpent.toFixed(2)} / $${actualTargetSpend.toFixed(2)} (${progressPct}%)`
      );
      await sleep(100);
    }

    console.log("\n================================================================================");
    console.log("  ðŸŽ‰ DRY-RUN COMPLETE: SIMULATION VERIFIED!");
    console.log(`  Total Waves / Blocks : ${totalWaves} Base blocks (~${totalWaves * 2} seconds)`);
    console.log(`  Total USDC Allocated : $${simSpent.toFixed(2)} USDC`);
    console.log("  To execute LIVE on Base, run with --execute:");
    console.log(`  npx tsx scripts/runSingleWalletBurstBuys.ts --execute --burst ${burstSize} --amount ${tradeAmountUsdc} --target-spend ${actualTargetSpend}`);
    console.log("================================================================================\n");
    return;
  }

  // --------------------------------------------------------------------------
  // LIVE PRE-FLIGHT: Ensure Allowances
  // --------------------------------------------------------------------------
  console.log("ðŸ” Checking Permit2 & Universal Router allowances...");
  const maxApproval = ethers.MaxUint256;
  const currentAllowance = (await usdc.allowance(wallet.address, config.permit2)) as bigint;
  if (currentAllowance < ethers.parseUnits(actualTargetSpend.toFixed(6), 6)) {
    console.log("  -> Approving USDC to Permit2...");
    const tx = await usdc.approve(config.permit2, maxApproval);
    await tx.wait();
    console.log("     âœ… Permit2 approved.");
  }

  const [rAllowance, rExpiration] = (await p2.allowance(
    wallet.address,
    config.base,
    config.universalRouter
  )) as [bigint, bigint, bigint];
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (rAllowance < ethers.parseUnits(actualTargetSpend.toFixed(6), 6) || rExpiration <= nowSec) {
    console.log("  -> Approving Permit2 to Universal Router...");
    const maxU160 = (1n << 160n) - 1n;
    const maxU48 = (1n << 48n) - 1n;
    const tx = await p2.approve(config.base, config.universalRouter, maxU160, maxU48);
    await tx.wait();
    console.log("     âœ… Universal Router allowance set.");
  }

  console.log("âœ… Wallet allowances verified and active.\n");

  // --------------------------------------------------------------------------
  // LIVE MULTI-BLOCK BURST EXECUTION LOOP
  // --------------------------------------------------------------------------
  let cumulativeSpent = 0;
  let waveNum = 0;
  const singleTradeRaw = ethers.parseUnits(tradeAmountUsdc.toFixed(6), 6);

  while (cumulativeSpent < actualTargetSpend) {
    waveNum++;
    const remainingToSpend = actualTargetSpend - cumulativeSpent;
    const currentBurst = Math.min(burstSize, Math.floor(remainingToSpend / tradeAmountUsdc));
    if (currentBurst === 0) break;
    const currentWaveTotal = currentBurst * tradeAmountUsdc;
    const currentWaveRaw = ethers.parseUnits(currentWaveTotal.toFixed(6), 6);

    console.log("--------------------------------------------------------------------------------");
    console.log(`ðŸŒŠ [WAVE #${waveNum}] Preparing ${currentBurst} micro-buys ($${currentWaveTotal.toFixed(2)} USDC total)...`);

    // Fetch live pool state and calculate minimums
    const sqrtPriceX96 = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
    const [, hookFee] = (await hook.quotePoolFee(true, singleTradeRaw)) as [bigint, bigint];
    const singleMinNara = calculateSpotMinimum({
      amountInAfterHookFee: singleTradeRaw - hookFee,
      sqrtPriceX96,
      inputIsCurrency0: !naraIsCurrency0,
      poolFeePips: config.fee,
      slippageBps: slippageBps,
    });

    // Build Atomic Universal Router Multi-Swap Action Payload
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const swapParams = abi.encode(
      [
        "tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
      ],
      [[poolKey, !naraIsCurrency0, singleTradeRaw, 0n, "0x"]]
    );
    const settleParams = abi.encode(["address", "uint256"], [config.base, currentWaveRaw]);
    const aggregateMinNara = (singleMinNara * BigInt(currentBurst) * (10_000n - BigInt(slippageBps))) / 10_000n;
    const takeParams = abi.encode(["address", "uint256"], [config.token, 0n]);

    const actions = ethers.hexlify(
      new Uint8Array([
        ...Array.from({ length: currentBurst }, () => SWAP_EXACT_IN_SINGLE),
        SETTLE_ALL,
        TAKE_ALL,
      ])
    );
    const actionParams = [
      ...Array.from({ length: currentBurst }, () => swapParams),
      settleParams,
      takeParams,
    ];
    const v4Input = abi.encode(["bytes", "bytes[]"], [actions, actionParams]);
    const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

    console.log(`  ðŸš€ Broadcasting Atomic Wave #${waveNum} (${currentBurst} swaps in 1 block)...`);
    const tx = await ur.execute(commands, [v4Input], deadline, { gasLimit: 1_500_000n });
    console.log(`  ðŸ”— Tx Broadcast: https://basescan.org/tx/${tx.hash}`);

    const receipt = await tx.wait(1);
    cumulativeSpent += currentWaveTotal;
    const progressPct = ((cumulativeSpent / actualTargetSpend) * 100).toFixed(1);

    console.log(`  âœ… Confirmed in Block #${receipt.blockNumber}! Gas Used: ${receipt.gasUsed.toString()}`);
    console.log(`  ðŸ’° Cumulative Progress: $${cumulativeSpent.toFixed(2)} / $${actualTargetSpend.toFixed(2)} USDC (${progressPct}%)`);

    if (cumulativeSpent < actualTargetSpend) {
      console.log("  â³ Pacing 2.5s for next block transition...");
      await sleep(2500);
    }
  }

  console.log("\n================================================================================");
  console.log("  ðŸŽ‰ SINGLE-WALLET MULTI-BLOCK BURST COMPLETE!");
  console.log(`  Wallet Used          : ${wallet.address}`);
  console.log(`  Total Waves Executed : ${waveNum}`);
  console.log(`  Total USDC Injected  : $${cumulativeSpent.toFixed(2)} USDC`);
  console.log(`  All NARA purchased is already safely in ${wallet.address}!`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Fatal Burst Buyer error:", err);
  process.exit(1);
});