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
  const trancheIdx = process.argv.indexOf("--tranche-usdc");
  const trancheUsdc = trancheIdx !== -1 ? Number(process.argv[trancheIdx + 1]) : 600;

  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true });

  console.log("================================================================================");
  console.log("?? NARA RANGE RANGER: TACTICAL REBALANCE BATCH PLANNER");
  console.log("================================================================================");
  console.log(`Target USDC Tranche: $${trancheUsdc} USDC`);
  console.log(`Mode:                ${isDryRun ? "?? DRY RUN (Preview only)" : "?? BATCH FILE GENERATION"}`);
  console.log("================================================================================\n");

  const rm = new ethers.Contract(RANGE_MANAGER_ADDRESS, RANGE_MANAGER_ABI, provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  const nara = new ethers.Contract(NARA_ADDRESS, ERC20_ABI, provider);

  // 1. Live queries
  const poolState = await rm.currentPoolState();
  const spotPrice = tickToPriceUsdc(Number(poolState.tick));
  const [activeIds] = await rm.getActiveOrderIds(0, 50);
  const safeUsdcBal = await usdc.balanceOf(TREASURY_SAFE_ADDRESS);
  const safeNaraBal = await nara.balanceOf(TREASURY_SAFE_ADDRESS);

  console.log(`Current Spot Price:    $${spotPrice.toFixed(4)} USDC (Tick: ${poolState.tick})`);
  console.log(`Treasury Safe USDC:    $${(Number(safeUsdcBal) / 1e6).toFixed(2)} USDC`);
  console.log(`Treasury Safe NARA:     ${ethers.formatUnits(safeNaraBal, 18)} NARA`);
  console.log(`Active Range Orders:   ${activeIds.length} orders on-chain\n`);

  // 2. Synthesize 4 front-heavy buy bands
  const bandRatios = [0.40, 0.30, 0.20, 0.10];
  const bandDisplacements = [
    { fromPct: 0.05, toPct: 0.09 },
    { fromPct: 0.09, toPct: 0.14 },
    { fromPct: 0.14, toPct: 0.21 },
    { fromPct: 0.21, toPct: 0.30 },
  ];

  const bands: any[] = [];
  const ifaceRm = new ethers.Interface(RANGE_MANAGER_ABI);
  const ifaceErc20 = new ethers.Interface(ERC20_ABI);
  const strategyHash = ethers.keccak256(ethers.toUtf8Bytes(`NARA-RANGE-RANGER-${Date.now()}`));
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400 * 7);

  console.log("BAND | TARGET RANGE       | TICKS [LOW, UP] | ALLOCATION | MIN NARA OUTPUT");
  console.log("-----+--------------------+-----------------+------------+------------------");

  let totalUsdcRequired = 0n;

  for (let i = 0; i < bandDisplacements.length; i++) {
    const disp = bandDisplacements[i];
    const highPrice = spotPrice * (1 - disp.fromPct);
    const lowPrice = spotPrice * (1 - disp.toPct);
    const tickLower = Math.min(priceToTick(highPrice), priceToTick(lowPrice));
    const tickUpper = Math.max(priceToTick(highPrice), priceToTick(lowPrice));

    const budgetUsdc = Math.floor(trancheUsdc * bandRatios[i]);
    const maxUsdcInput = BigInt(budgetUsdc) * 10n ** 6n;
    totalUsdcRequired += maxUsdcInput;

    const minNaraRaw = ((maxUsdcInput * 10n ** 18n) / (BigInt(Math.floor(highPrice * 1e6)) + 1n) * 98n) / 100n;

    bands.push({
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
  console.log(`TOTAL PROPOSED TRANCHE: $${ethers.formatUnits(totalUsdcRequired, 6)} USDC\n`);

  if (isDryRun) {
    console.log("Dry run finished. Run without --dry-run to generate the Safe Transaction Batch JSON file.");
    return;
  }

  // 3. Construct Safe Transaction Batch JSON
  const transactions: any[] = [];

  // Tx 0: USDC Approval
  transactions.push({
    to: USDC_ADDRESS,
    value: "0",
    data: ifaceErc20.encodeFunctionData("approve", [RANGE_MANAGER_ADDRESS, totalUsdcRequired]),
    contractMethod: null,
    contractInputsValues: null,
  });

  // Txs 1-4: createBuyNaraOrder
  for (const b of bands) {
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

  // Tx 5: assertOperationalClean
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
      name: "Range Ranger Tactical Rebalance Batch",
      description: `Tactical 4-band buy bracket securing ${bands[0].targetRange.split("–")[1]?.trim()} floor. Total: $${ethers.formatUnits(totalUsdcRequired, 6)} USDC.`,
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: TREASURY_SAFE_ADDRESS,
    },
    transactions,
  };

  const deploymentsDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  const batchFilename = `UNEXECUTED-range-rebalance-${Date.now()}.json`;
  const batchPath = path.join(deploymentsDir, batchFilename);
  fs.writeFileSync(batchPath, JSON.stringify(batchPayload, null, 2));

  console.log("================================================================================");
  console.log(`? Safe Batch Successfully Generated!`);
  console.log(`?? File: ${batchPath}`);
  console.log("================================================================================");
  console.log("?? Next Steps for Safe Signing:");
  console.log("   1. Open your Safe Web App: https://app.safe.global/home?safe=base:0x5050BC6dc3E07313D52D05cecD53f727D6CDa245");
  console.log("   2. Go to 'Apps' -> 'Transaction Builder'");
  console.log("   3. Drag & drop this JSON file into the builder.");
  console.log("   4. Review the 6 batched transactions and click 'Create Batch' to sign!");
}

main().catch(console.error);
