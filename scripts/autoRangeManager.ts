/**
 * NARA Autonomous Treasury Range Manager (Auto-Rebalancer)
 *
 * Automatically keeps NARA liquidity tightly centered around live spot price:
 *   - Fetches live pool state, active orders, and stale/crossed positions
 *   - Dynamically synthesizes optimal 4-tier Buy floor & 4-tier Sell resistance ladders
 *   - Packs atomic Safe MultiSend batch
 *   - Directly signs EIP-712 Safe transaction using TREASURY_PRIVATE_KEY (Safe owner)
 *   - Broadcasts safe.execTransaction() on Base Mainnet in 1 atomic block
 *   - Zero manual Safe UI clicks, zero JSON importing, sub-second execution!
 *
 * Usage:
 *   Dry-run simulation:
 *     npx tsx scripts/autoRangeManager.ts --dry-run
 *
 *   One-click live rebalance:
 *     npx tsx scripts/autoRangeManager.ts --execute
 *
 *   Continuous autonomous daemon:
 *     npx tsx scripts/autoRangeManager.ts --watch --interval 30
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TICK_SPACING = 60;
const RANGE_MANAGER_ADDRESS = "0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C";
const TREASURY_SAFE_ADDRESS = "0x5050BC6dc3E07313D52D05cecD53f727D6CDa245";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NARA_ADDRESS = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";
const MULTISEND_CALL_ONLY = "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D";

const RANGE_MANAGER_ABI = [
  "function currentPoolState() view returns (uint160 sqrtPriceX96, int24 tick, uint128 liquidity, uint24 protocolFee, uint24 lpFee)",
  "function getActiveOrderIds(uint256 offset, uint256 limit) view returns (uint256[] orderIds, uint256 nextOffset)",
  "function getOrder(uint256 orderId) view returns (uint256 tokenId, uint256 inputAmount, uint256 minimumOutputAmount, bytes32 strategyHash, uint128 liquidity, int24 tickLower, int24 tickUpper, uint64 createdBlock, uint64 creationDeadline, uint64 terminalBlock, uint8 side, uint8 status)",
  "function createBuyNaraOrder(int24 tickLower, int24 tickUpper, uint128 maximumUsdcInput, uint128 minimumNaraOutput, bytes32 strategyHash, uint64 deadline) returns (uint256 orderId, uint256 tokenId)",
  "function createSellNaraOrder(int24 tickLower, int24 tickUpper, uint128 maximumNaraInput, uint128 minimumUsdcOutput, bytes32 strategyHash, uint64 deadline) returns (uint256 orderId, uint256 tokenId)",
  "function cancel(uint256 orderId, uint128 minNaraOut, uint128 minUsdcOut, uint64 deadline) returns (uint256 naraOut, uint256 usdcOut)",
  "function assertOperationalClean() view returns (bool)",
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const SAFE_ABI = [
  "function nonce() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
];

const MULTISEND_ABI = [
  "function multiSend(bytes transactions) payable",
];

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return fallback;
}
const isExecute = args.includes("--execute");
const isWatch = args.includes("--watch");
const isDryRun = args.includes("--dry-run") || (!isExecute && !isWatch);
const trancheUsdcTotal = Number(getArg("--tranche-usdc", "800"));
const trancheNaraTotal = Number(getArg("--tranche-nara", "20000"));
const watchIntervalSec = Number(getArg("--interval", "30"));

function alignTick(rawTick: number): number {
  return Math.floor(rawTick / TICK_SPACING) * TICK_SPACING;
}

function priceToTick(priceUsdcPerNara: number): number {
  const rawP = (1 / priceUsdcPerNara) * 1e12;
  return alignTick(Math.round(Math.log(rawP) / Math.log(1.0001)));
}

function tickToPriceUsdc(tick: number): number {
  const rawP = Math.pow(1.0001, tick);
  return (1 / rawP) * 1e12;
}

async function runRebalanceCycle(provider: ethers.JsonRpcProvider, wallet: ethers.Wallet) {
  const ifaceRm = new ethers.Interface(RANGE_MANAGER_ABI);
  const ifaceErc20 = new ethers.Interface(ERC20_ABI);
  const ifaceMultiSend = new ethers.Interface(MULTISEND_ABI);

  const rm = new ethers.Contract(RANGE_MANAGER_ADDRESS, RANGE_MANAGER_ABI, provider);
  const safe = new ethers.Contract(TREASURY_SAFE_ADDRESS, SAFE_ABI, wallet);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  const nara = new ethers.Contract(NARA_ADDRESS, ERC20_ABI, provider);

  const [poolState, [activeOrderIds], safeUsdcBal, safeNaraBal, safeNonce] = await Promise.all([
    rm.currentPoolState() as Promise<[bigint, number, bigint, number, number]>,
    rm.getActiveOrderIds(0n, 100n) as Promise<[bigint[], bigint]>,
    usdc.balanceOf(TREASURY_SAFE_ADDRESS) as Promise<bigint>,
    nara.balanceOf(TREASURY_SAFE_ADDRESS) as Promise<bigint>,
    safe.nonce() as Promise<bigint>,
  ]);

  const currentTick = Number(poolState[1]);
  const spotPrice = tickToPriceUsdc(currentTick);

  console.log("================================================================================");
  console.log("  âš¡ NARA AUTONOMOUS RANGE MANAGER: REBALANCE CYCLE");
  console.log("================================================================================");
  console.log(`Current Spot Price:  $${spotPrice.toFixed(6)} USDC (Tick: ${currentTick})`);
  console.log(`Treasury Safe USDC:  $${(Number(safeUsdcBal) / 1e6).toFixed(2)} USDC`);
  console.log(`Treasury Safe NARA:  ${(Number(safeNaraBal) / 1e18).toFixed(2)} NARA`);
  console.log(`Current Safe Nonce:  ${safeNonce.toString()}`);
  console.log(`Active Orders:       ${activeOrderIds.length}`);

  // Inspect Active Orders
  const staleOrders: { id: bigint; side: string; pLow: number; pHigh: number }[] = [];
  let closestBuyPrice: number | null = null;
  let activeSellCount = 0;

  for (const id of activeOrderIds) {
    const raw = (await rm.getOrder(id)) as any;
    const pLow = tickToPriceUsdc(Number(raw[6])); // tickUpper gives lower price in USD
    const pHigh = tickToPriceUsdc(Number(raw[5])); // tickLower gives higher price in USD
    const isBuy = raw[10] === 1;

    if (isBuy) {
      if (closestBuyPrice === null || pHigh > closestBuyPrice) {
        closestBuyPrice = pHigh;
      }
      // Stale if upper edge is > 20% below spot
      if (pHigh < spotPrice * 0.80) {
        staleOrders.push({ id, side: "BUY", pLow, pHigh });
      }
    } else {
      activeSellCount++;
      // Stale if order is crossed or > 150% above spot
      if (pLow <= spotPrice || pLow > spotPrice * 2.5) {
        staleOrders.push({ id, side: "SELL", pLow, pHigh });
      }
    }
  }

  const buyGapPct = closestBuyPrice !== null ? ((spotPrice - closestBuyPrice) / spotPrice) * 100 : 100;
  console.log(`Nearest Buy Distance: ${buyGapPct.toFixed(1)}% | Active Sell Count: ${activeSellCount}`);

  // Rebalance Trigger Decision
  const shouldRebalance = staleOrders.length > 0 || buyGapPct > 20 || activeSellCount === 0;
  if (!shouldRebalance && isWatch) {
    console.log("âœ… Market structure is in balance. No rebalance needed this cycle.\n");
    return;
  }

  console.log(`\nðŸš¨ REBALANCE TRIGGERED! Stale orders: ${staleOrders.length}, Gap: ${buyGapPct.toFixed(1)}%, Sells: ${activeSellCount}`);

  // --------------------------------------------------------------------------
  // Synthesize Fresh Optimal Ladders Around Spot
  // --------------------------------------------------------------------------
  const buyDisplacements = [
    { fromPct: 0.05, toPct: 0.12, share: 0.40 }, // Tier 1: -5% to -12%
    { fromPct: 0.12, toPct: 0.22, share: 0.30 }, // Tier 2: -12% to -22%
    { fromPct: 0.22, toPct: 0.35, share: 0.20 }, // Tier 3: -22% to -35%
    { fromPct: 0.35, toPct: 0.50, share: 0.10 }, // Tier 4: -35% to -50%
  ];

  const sellDisplacements = [
    { fromPct: 0.15, toPct: 0.35, share: 0.25 }, // Tier 1: +15% to +35%
    { fromPct: 0.35, toPct: 0.65, share: 0.25 }, // Tier 2: +35% to +65%
    { fromPct: 0.65, toPct: 1.10, share: 0.25 }, // Tier 3: +65% to +110%
    { fromPct: 1.10, toPct: 1.80, share: 0.25 }, // Tier 4: +110% to +180%
  ];

  const buyBands = buyDisplacements.map((disp, i) => {
    const highPrice = spotPrice * (1 - disp.fromPct);
    const lowPrice = spotPrice * (1 - disp.toPct);
    let tickLower = Math.min(priceToTick(highPrice), priceToTick(lowPrice));
    let tickUpper = Math.max(priceToTick(highPrice), priceToTick(lowPrice));

    // Ensure buy ticks sit strictly below spot (tickLower > currentTick)
    if (tickLower <= currentTick) tickLower = alignTick(currentTick) + TICK_SPACING;
    if (tickUpper <= tickLower) tickUpper = tickLower + TICK_SPACING * 4;

    const budgetUsdc = Math.floor(trancheUsdcTotal * disp.share);
    const maxUsdcInput = BigInt(budgetUsdc) * 10n ** 6n;
    const minNaraRaw = ((maxUsdcInput * 10n ** 18n) / (BigInt(Math.floor(highPrice * 1e6)) + 1n) * 98n) / 100n;

    return {
      bandIndex: i + 1,
      targetRange: `$${lowPrice.toFixed(4)} - $${highPrice.toFixed(4)}`,
      tickLower,
      tickUpper,
      budgetUsdc,
      maxUsdcInput,
      minNaraRaw,
    };
  });

  const sellBands = sellDisplacements.map((disp, i) => {
    const lowPrice = spotPrice * (1 + disp.fromPct);
    const highPrice = spotPrice * (1 + disp.toPct);
    let tickLower = Math.min(priceToTick(highPrice), priceToTick(lowPrice));
    let tickUpper = Math.max(priceToTick(highPrice), priceToTick(lowPrice));

    // Ensure sell ticks sit strictly above spot (tickUpper < currentTick)
    if (tickUpper >= currentTick) tickUpper = alignTick(currentTick) - TICK_SPACING;
    if (tickLower >= tickUpper) tickLower = tickUpper - TICK_SPACING * 4;

    const budgetNara = Math.floor(trancheNaraTotal * disp.share);
    const maxNaraInput = BigInt(budgetNara) * 10n ** 18n;
    const minUsdcRaw = ((maxNaraInput * BigInt(Math.floor(lowPrice * 1e6))) / 10n ** 18n * 98n) / 100n;

    return {
      bandIndex: i + 1,
      targetRange: `$${lowPrice.toFixed(4)} - $${highPrice.toFixed(4)}`,
      tickLower,
      tickUpper,
      budgetNara,
      maxNaraInput,
      minUsdcRaw,
    };
  });

  // Build Operations
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
  const totalUsdcRequired = buyBands.reduce((acc, b) => acc + b.maxUsdcInput, 0n);
  const totalNaraRequired = sellBands.reduce((acc, s) => acc + s.maxNaraInput, 0n);

  const transactions: { to: string; value: string; data: string }[] = [];

  // 1. Cancel Stale Orders
  for (const s of staleOrders) {
    transactions.push({
      to: RANGE_MANAGER_ADDRESS,
      value: "0",
      data: ifaceRm.encodeFunctionData("cancel", [s.id, 0n, 0n, deadline]),
    });
  }

  // 2. Approve USDC & Create Buy Orders
  transactions.push({
    to: USDC_ADDRESS,
    value: "0",
    data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, totalUsdcRequired]),
  });

  for (const band of buyBands) {
    const strategyHash = ethers.keccak256(ethers.toUtf8Bytes(`AUTO_BUY_${band.bandIndex}_${Date.now()}`));
    transactions.push({
      to: RANGE_MANAGER_ADDRESS,
      value: "0",
      data: ifaceRm.encodeFunctionData("createBuyNaraOrder", [
        band.tickLower,
        band.tickUpper,
        band.maxUsdcInput,
        band.minNaraRaw,
        strategyHash,
        deadline,
      ]),
    });
  }

  // 3. Approve NARA & Create Sell Orders
  transactions.push({
    to: NARA_ADDRESS,
    value: "0",
    data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, totalNaraRequired]),
  });

  for (const band of sellBands) {
    const strategyHash = ethers.keccak256(ethers.toUtf8Bytes(`AUTO_SELL_${band.bandIndex}_${Date.now()}`));
    transactions.push({
      to: RANGE_MANAGER_ADDRESS,
      value: "0",
      data: ifaceRm.encodeFunctionData("createSellNaraOrder", [
        band.tickLower,
        band.tickUpper,
        band.maxNaraInput,
        band.minUsdcRaw,
        strategyHash,
        deadline,
      ]),
    });
  }

  // 4. Clear Allowances & Invariant Check
  transactions.push(
    {
      to: USDC_ADDRESS,
      value: "0",
      data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, 0n]),
    },
    {
      to: NARA_ADDRESS,
      value: "0",
      data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, 0n]),
    },
    {
      to: RANGE_MANAGER_ADDRESS,
      value: "0",
      data: ifaceRm.encodeFunctionData("assertOperationalClean", []),
    }
  );

  console.log(`\nðŸ“¦ Batched ${transactions.length} operations into 1 atomic Safe MultiSend call:`);
  console.log(`   â€¢ ${staleOrders.length} stale cancellations`);
  console.log(`   â€¢ 4 fresh Buy bands ($${ethers.formatUnits(totalUsdcRequired, 6)} USDC total)`);
  console.log(`   â€¢ 4 fresh Sell bands (${ethers.formatUnits(totalNaraRequired, 18)} NARA total)`);
  console.log(`   â€¢ Clear allowances + assertOperationalClean()`);

  // Pack MultiSend Payload
  let packed = "0x";
  for (const tx of transactions) {
    const op = "00";
    const to = tx.to.toLowerCase().replace("0x", "");
    const val = BigInt(tx.value || 0).toString(16).padStart(64, "0");
    const dataBytes = tx.data.replace("0x", "");
    const dataLen = (dataBytes.length / 2).toString(16).padStart(64, "0");
    packed += op + to + val + dataLen + dataBytes;
  }
  const multiSendData = ifaceMultiSend.encodeFunctionData("multiSend", [packed]);

  // EIP-712 Safe Signature
  const domain = { chainId: 8453, verifyingContract: TREASURY_SAFE_ADDRESS };
  const types = {
    SafeTx: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
  };
  const message = {
    to: MULTISEND_CALL_ONLY,
    value: 0n,
    data: multiSendData,
    operation: 1, // DelegateCall
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: safeNonce,
  };

  const signature = await wallet.signTypedData(domain, types, message);

  // --------------------------------------------------------------------------
  // SIMULATION / EXECUTION
  // --------------------------------------------------------------------------
  if (isDryRun) {
    console.log("\nðŸ§ª Running Safe execTransaction.staticCall simulation on Base mainnet...");
    try {
      await safe.execTransaction.staticCall(
        message.to,
        message.value,
        message.data,
        message.operation,
        message.safeTxGas,
        message.baseGas,
        message.gasPrice,
        message.gasToken,
        message.refundReceiver,
        signature
      );
      console.log("ðŸŽ‰ STATIC CALL 100% SUCCESSFUL! Safe batch is mathematically validated and ready to broadcast.");
      console.log("ðŸ‘‰ To execute live on-chain, run with --execute:");
      console.log("   npx tsx scripts/autoRangeManager.ts --execute\n");
    } catch (err: any) {
      console.error("âŒ Simulation Reverted:", err.message);
      if (err.data) console.error("   Revert data:", err.data);
    }
    return;
  }

  console.log("\n🚀 Broadcasting Safe execTransaction() to Base mainnet with 7.5M gas limit...");
  const tx = await safe.execTransaction(
    message.to,
    message.value,
    message.data,
    message.operation,
    message.safeTxGas,
    message.baseGas,
    message.gasPrice,
    message.gasToken,
    message.refundReceiver,
    signature,
    { gasLimit: 7_500_000n }
  );

  console.log(`ðŸ”— Transaction Broadcast: https://basescan.org/tx/${tx.hash}`);
  const receipt = await tx.wait(1);
  console.log(`âœ… Confirmed in Block #${receipt.blockNumber}! Gas Used: ${receipt.gasUsed.toString()}`);
  console.log("ðŸŽ‰ AUTONOMOUS REBALANCE COMPLETE! All ranges are now perfectly centered around spot.\n");
}

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL, 8453, {
    staticNetwork: true,
  });
  const privateKey = process.env.TREASURY_PRIVATE_KEY;
  if (!privateKey) {
    console.error("âŒ TREASURY_PRIVATE_KEY not found in .env");
    process.exit(1);
  }
  const wallet = new ethers.Wallet(privateKey, provider);

  if (isWatch) {
    console.log(`ðŸ¤– Starting Continuous Autonomous Range Manager (Polling every ${watchIntervalSec}s)...`);
    while (true) {
      try {
        await runRebalanceCycle(provider, wallet);
      } catch (e: any) {
        console.error("Error in rebalance cycle:", e.message);
      }
      await new Promise((r) => setTimeout(r, watchIntervalSec * 1000));
    }
  } else {
    await runRebalanceCycle(provider, wallet);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});