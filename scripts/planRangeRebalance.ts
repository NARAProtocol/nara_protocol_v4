import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TICK_SPACING = 60;
const RANGE_MANAGER_ADDRESS = "0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C";
const TREASURY_SAFE_ADDRESS = "0x5050BC6dc3E07313D52D05cecD53f727D6CDa245";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const NARA_ADDRESS = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";

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
];

function tickToPriceUsdc(tick: number): number {
  const rawP = Math.pow(1.0001, tick);
  return (1 / rawP) * 1e12;
}

function priceToTick(priceUsdc: number, tickSpacing = TICK_SPACING): number {
  if (priceUsdc <= 0) throw new Error("Price must be > 0");
  const exactTick = Math.log(1e12 / priceUsdc) / Math.log(1.0001);
  return Math.floor(exactTick / tickSpacing) * tickSpacing;
}

export async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const trancheUsdcIdx = process.argv.indexOf("--tranche-usdc");
  const trancheUsdc = trancheUsdcIdx !== -1 ? Number(process.argv[trancheUsdcIdx + 1]) : 600;

  const trancheNaraIdx = process.argv.indexOf("--tranche-nara");
  // Default to 20,000 NARA for tactical sell resistance ladder if not specified
  const trancheNara = trancheNaraIdx !== -1 ? Number(process.argv[trancheNaraIdx + 1]) : 20000;

  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://base-mainnet.public.blastapi.io";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true });

  console.log("================================================================================");
  console.log("?? NARA RANGE RANGER: ATOMIC ALL-IN-ONE OVERHAUL PLANNER");
  console.log("================================================================================");
  console.log(`Action:              RECALL STALE ORDERS + DEPLOY FRESH 2-SIDED LADDER`);
  console.log(`USDC Buy Tranche:    $${trancheUsdc} USDC`);
  console.log(`NARA Sell Tranche:   ${trancheNara.toLocaleString()} NARA`);
  console.log(`Execution Mode:      ${isDryRun ? "?? DRY RUN (Preview only)" : "?? ATOMIC BATCH GENERATION"}`);
  console.log("================================================================================\n");

  const rm = new ethers.Contract(RANGE_MANAGER_ADDRESS, RANGE_MANAGER_ABI, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  const nara = new ethers.Contract(NARA_ADDRESS, ERC20_ABI, provider);

  // 1. Live pool state & treasury balances
  const poolState = await rm.currentPoolState();
  const spotPrice = tickToPriceUsdc(Number(poolState.tick));
  const spotTick = Number(poolState.tick);
  const safeUsdcBal = await usdc.balanceOf(TREASURY_SAFE_ADDRESS);
  const safeNaraBal = await nara.balanceOf(TREASURY_SAFE_ADDRESS);

  console.log(`Spot Price:          $${spotPrice.toFixed(4)} USDC (Tick: ${spotTick})`);
  console.log(`Treasury Safe USDC:  $${(Number(safeUsdcBal) / 1e6).toFixed(2)} USDC`);
  console.log(`Treasury Safe NARA:  ${Number(ethers.formatUnits(safeNaraBal, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} NARA\n`);

  // 2. Identify Stale / Distant Active Orders to Cancel
  const [activeIds] = await rm.getActiveOrderIds(0, 50);
  const staleOrders: any[] = [];
  let totalNaraToRecall = 0n;

  console.log("?? Scanning active orders for stale/off-market positions...");
  for (const id of activeIds) {
    const o = await rm.getOrder(id);
    const pLow = tickToPriceUsdc(Number(o.tickUpper));
    const pHigh = tickToPriceUsdc(Number(o.tickLower));

    // Stale criteria: order range is more than 50% away from current spot
    const isStale = (pLow > spotPrice * 1.5) || (pHigh < spotPrice * 0.5);

    if (isStale) {
      staleOrders.push({
        orderId: id,
        side: o.side,
        inputAmount: o.inputAmount,
        pRange: `$${pLow.toFixed(4)} – $${pHigh.toFixed(4)}`,
        ticks: `[${o.tickLower}, ${o.tickUpper}]`,
      });
      if (Number(o.side) === 0) { // SellNara order holds NARA
        totalNaraToRecall += o.inputAmount;
      }
    }
  }

  console.log(`Found ${staleOrders.length} stale orders to cancel atomically:`);
  for (const s of staleOrders) {
    console.log(`  • Cancel Order #${s.orderId} (Price: ${s.pRange} | Input: ${ethers.formatUnits(s.inputAmount, s.side === 0 ? 18 : 6)} ${s.side === 0 ? "NARA" : "USDC"})`);
  }
  console.log(`?? Total NARA to be reclaimed into Safe: ${ethers.formatUnits(totalNaraToRecall, 18)} NARA\n`);

  // 3. Synthesize Fresh Buy Ladder (Catch Dips below spot)
  const buyRatios = [0.40, 0.30, 0.20, 0.10];
  const buyDisplacements = [
    { fromPct: 0.05, toPct: 0.09 },
    { fromPct: 0.09, toPct: 0.14 },
    { fromPct: 0.14, toPct: 0.21 },
    { fromPct: 0.21, toPct: 0.30 },
  ];

  const buyBands: any[] = [];
  let totalUsdcRequired = 0n;

  console.log("?? PROPOSED FRESH BUY LADDER (Floor Defense):");
  console.log("BAND | TARGET RANGE       | TICKS [LOW, UP] | ALLOCATION | MIN NARA OUTPUT");
  console.log("-----+--------------------+-----------------+------------+------------------");

  for (let i = 0; i < buyDisplacements.length; i++) {
    const disp = buyDisplacements[i];
    const highPrice = spotPrice * (1 - disp.fromPct);
    const lowPrice = spotPrice * (1 - disp.toPct);
    let tickLower = Math.min(priceToTick(highPrice), priceToTick(lowPrice));
    let tickUpper = Math.max(priceToTick(highPrice), priceToTick(lowPrice));

    // Ensure buy ticks sit strictly below spot (tickLower > spotTick)
    if (tickLower <= spotTick) tickLower = Math.floor(spotTick / TICK_SPACING) * TICK_SPACING + TICK_SPACING;
    if (tickUpper <= tickLower) tickUpper = tickLower + TICK_SPACING * 4;

    const budgetUsdc = Math.floor(trancheUsdc * buyRatios[i]);
    const maxUsdcInput = BigInt(budgetUsdc) * 10n ** 6n;
    totalUsdcRequired += maxUsdcInput;

    const minNaraRaw = ((maxUsdcInput * 10n ** 18n) / (BigInt(Math.floor(highPrice * 1e6)) + 1n) * 98n) / 100n;

    buyBands.push({
      bandIndex: i + 1,
      targetRange: `$${lowPrice.toFixed(4)} – $${highPrice.toFixed(4)}`,
      tickLower,
      tickUpper,
      budgetUsdc,
      maxUsdcInput,
      minNaraRaw,
    });

    console.log(
      `  #${i + 1} | $${lowPrice.toFixed(4)} – $${highPrice.toFixed(4)} | [${tickLower}, ${tickUpper}]   | $${budgetUsdc.toString().padEnd(3, " ")} USDC  | ${ethers.formatUnits(minNaraRaw, 18).slice(0, 10)} NARA`
    );
  }
  console.log("-----+--------------------+-----------------+------------+------------------");
  console.log(`TOTAL BUY TRANCHE: $${ethers.formatUnits(totalUsdcRequired, 6)} USDC\n`);

  // 4. Synthesize Fresh Sell Ladder (Scale out profits above spot)
  const sellBands: any[] = [];
  let totalNaraRequired = 0n;

  if (trancheNara > 0) {
    const sellRatios = [0.25, 0.25, 0.25, 0.25];
    const sellDisplacements = [
      { fromPct: 0.15, toPct: 0.35 }, // +15% to +35%
      { fromPct: 0.35, toPct: 0.65 }, // +35% to +65%
      { fromPct: 0.65, toPct: 1.10 }, // +65% to +110%
      { fromPct: 1.10, toPct: 1.80 }, // +110% to +180%
    ];

    console.log("?? PROPOSED FRESH SELL LADDER (Profit-Taking Resistance):");
    console.log("BAND | TARGET RANGE       | TICKS [LOW, UP] | ALLOCATION   | MIN USDC OUTPUT");
    console.log("-----+--------------------+-----------------+--------------+------------------");

    for (let i = 0; i < sellDisplacements.length; i++) {
      const disp = sellDisplacements[i];
      const lowPrice = spotPrice * (1 + disp.fromPct);
      const highPrice = spotPrice * (1 + disp.toPct);
      let tickLower = Math.min(priceToTick(highPrice), priceToTick(lowPrice));
      let tickUpper = Math.max(priceToTick(highPrice), priceToTick(lowPrice));

      // Ensure sell ticks sit strictly above spot (tickUpper < spotTick)
      if (tickUpper >= spotTick) tickUpper = Math.floor(spotTick / TICK_SPACING) * TICK_SPACING - TICK_SPACING;
      if (tickLower >= tickUpper) tickLower = tickUpper - TICK_SPACING * 4;

      const budgetNara = Math.floor(trancheNara * sellRatios[i]);
      const maxNaraInput = BigInt(budgetNara) * 10n ** 18n;
      totalNaraRequired += maxNaraInput;

      const minUsdcRaw = ((maxNaraInput * BigInt(Math.floor(lowPrice * 1e6))) / 10n ** 18n * 98n) / 100n;

      sellBands.push({
        bandIndex: i + 1,
        targetRange: `$${lowPrice.toFixed(4)} – $${highPrice.toFixed(4)}`,
        tickLower,
        tickUpper,
        budgetNara,
        maxNaraInput,
        minUsdcRaw,
      });

      console.log(
        `  #${i + 1} | $${lowPrice.toFixed(4)} – $${highPrice.toFixed(4)} | [${tickLower}, ${tickUpper}]   | ${budgetNara.toString().padStart(6, " ")} NARA | $${ethers.formatUnits(minUsdcRaw, 6)} USDC`
      );
    }
    console.log("-----+--------------------+-----------------+--------------+------------------");
    console.log(`TOTAL SELL TRANCHE: ${ethers.formatUnits(totalNaraRequired, 18)} NARA\n`);
  }

  if (isDryRun) {
    console.log("Dry run finished. Run without --dry-run to generate the atomic Safe batch JSON.");
    return;
  }

  // 5. Construct Single Atomic Safe Transaction Batch
  const ifaceRm = new ethers.Interface(RANGE_MANAGER_ABI);
  const ifaceErc20 = new ethers.Interface(ERC20_ABI);
  const strategyHash = ethers.keccak256(ethers.toUtf8Bytes(`NARA-ATOMIC-OVERHAUL-${Date.now()}`));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400 * 7);

  const transactions: any[] = [];

  // Step A: Cancel all stale orders (Assets immediately flow back to Safe)
  for (const s of staleOrders) {
    transactions.push({
      to: RANGE_MANAGER_ADDRESS,
      value: "0",
      data: ifaceRm.encodeFunctionData("cancel", [s.orderId, 0n, 0n, deadline]),
      contractMethod: null,
      contractInputsValues: null,
    });
  }

  // Step B: Approve exact required USDC
  if (totalUsdcRequired > 0n) {
    transactions.push({
      to: USDC_ADDRESS,
      value: "0",
      data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, totalUsdcRequired]),
      contractMethod: null,
      contractInputsValues: null,
    });
  }

  // Step C: Approve exact required NARA (if deploying sell bands)
  if (totalNaraRequired > 0n) {
    transactions.push({
      to: NARA_ADDRESS,
      value: "0",
      data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, totalNaraRequired]),
      contractMethod: null,
      contractInputsValues: null,
    });
  }

  // Step D: Create fresh Buy Bands
  for (const b of buyBands) {
    transactions.push({
      to: RANGE_MANAGER_ADDRESS,
      value: "0",
      data: ifaceRm.encodeFunctionData("createBuyNaraOrder", [
        b.tickLower,
        b.tickUpper,
        b.maxUsdcInput,
        b.minNaraRaw,
        strategyHash,
        deadline,
      ]),
      contractMethod: null,
      contractInputsValues: null,
    });
  }

  // Step E: Create fresh Sell Bands
  for (const s of sellBands) {
    transactions.push({
      to: RANGE_MANAGER_ADDRESS,
      value: "0",
      data: ifaceRm.encodeFunctionData("createSellNaraOrder", [
        s.tickLower,
        s.tickUpper,
        s.maxNaraInput,
        s.minUsdcRaw,
        strategyHash,
        deadline,
      ]),
      contractMethod: null,
      contractInputsValues: null,
    });
  }

  // Step F: Zero out allowances to guarantee clean operational state
  transactions.push({
    to: USDC_ADDRESS,
    value: "0",
    data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, 0n]),
    contractMethod: null,
    contractInputsValues: null,
  });

  transactions.push({
    to: NARA_ADDRESS,
    value: "0",
    data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, 0n]),
    contractMethod: null,
    contractInputsValues: null,
  });

  // Step G: Final Invariant Assertion
  transactions.push({
    to: RANGE_MANAGER_ADDRESS,
    value: "0",
    data: ifaceRm.encodeFunctionData("assertOperationalClean", []),
    contractMethod: null,
    contractInputsValues: null,
  });

  const batchPayload = {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name: "NARA Elite Atomic Overhaul & Rebalance Batch",
      description: `Atomic overhaul: Cancels ${staleOrders.length} stale orders (reclaiming ${ethers.formatUnits(totalNaraToRecall, 18)} NARA) + Deploys 4 Buy Bands ($${ethers.formatUnits(totalUsdcRequired, 6)} USDC) + Deploys 4 Sell Bands (${ethers.formatUnits(totalNaraRequired, 18)} NARA).`,
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: TREASURY_SAFE_ADDRESS,
    },
    transactions,
  };

  const deploymentsDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const batchFilename = `UNEXECUTED-atomic-overhaul-${Date.now()}.json`;
  const batchPath = path.join(deploymentsDir, batchFilename);
  fs.writeFileSync(batchPath, JSON.stringify(batchPayload, null, 2));

  console.log("================================================================================");
  console.log(`? ELITE ATOMIC OVERHAUL BATCH GENERATED!`);
  console.log(`?? File: ${batchPath}`);
  console.log(`?? Total Operations Batched: ${transactions.length} calls in 1 single transaction`);
  console.log("================================================================================");
  console.log("?? Summary of Actions inside this single transaction:");
  console.log(`   1. Cancel Orders #${staleOrders.map(s => s.orderId).join(", #")} -> Returning ${ethers.formatUnits(totalNaraToRecall, 18)} NARA to Safe`);
  console.log(`   2. Approve & Deploy 4 Buy Bands beneath spot -> Allocating $${ethers.formatUnits(totalUsdcRequired, 6)} USDC`);
  if (totalNaraRequired > 0n) {
    console.log(`   3. Approve & Deploy 4 Sell Bands above spot -> Allocating ${ethers.formatUnits(totalNaraRequired, 18)} NARA`);
  }
  console.log(`   4. Clear Residual Allowances & Verify assertOperationalClean()`);
  console.log("================================================================================\n");
}

main().catch(console.error);
