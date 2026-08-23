import { ethers } from "ethers";

const BASE_RPC_URL = "https://mainnet.base.org";
const POOL_MANAGER_ADDR = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const POSITION_MANAGER_ADDR = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
const POOL_ID = "0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464";

const POOL_MANAGER_ABI = [
  "function extsload(bytes32 slot) view returns (bytes32)"
];

const POSITION_MANAGER_ABI = [
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)"
];

const Q96 = 1n << 96n;
const Q192 = 1n << 192n;
const USDC_PER_NARA_WAD_SCALE = 10n ** 30n;

async function main() {
  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const poolManager = new ethers.Contract(POOL_MANAGER_ADDR, POOL_MANAGER_ABI, provider);
  const positionManager = new ethers.Contract(POSITION_MANAGER_ADDR, POSITION_MANAGER_ABI, provider);

  // Read Slot0
  const poolStateSlot = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [POOL_ID, ethers.zeroPadValue("0x06", 32)]
    )
  );
  const rawSlot0 = await poolManager.extsload(poolStateSlot);
  const sqrtPriceX96 = BigInt(rawSlot0) & ((1n << 160n) - 1n);

  // Read active liquidity from the two live full-range positions (Seed #2898124 + POL #2898486)
  const [liqSeed, liqPOL] = await Promise.all([
    positionManager.getPositionLiquidity(2898124),
    positionManager.getPositionLiquidity(2898486)
  ]);
  const totalL = BigInt(liqSeed.toString()) + BigInt(liqPOL.toString());

  const currentUsdcPerNaraWad = Q192 * USDC_PER_NARA_WAD_SCALE / (sqrtPriceX96 * sqrtPriceX96);
  const currentSpotPrice = Number(currentUsdcPerNaraWad) / 1e18;

  console.log("=== LIVE BASE MAINNET UNISWAP V4 METRICS ===");
  console.log(`Current Block Read:    Base Mainnet Live`);
  console.log(`sqrtPriceX96:          ${sqrtPriceX96.toString()}`);
  console.log(`Seed LP Liquidity:     ${liqSeed.toString()}`);
  console.log(`POL LP Liquidity:      ${liqPOL.toString()}`);
  console.log(`Total Active L:        ${totalL.toString()}`);
  console.log(`Current Spot Price:    $${currentSpotPrice.toFixed(6)} USD / NARA`);
  console.log(`Current Rate:          ${(1 / currentSpotPrice).toFixed(4)} NARA per $1.00 USDC\n`);

  const targets = [0.05, 0.10, 0.25, 0.50, 1.00, 2.00, 5.00, 10.00, 50.00, 100.00];

  console.log("=========================================================================================");
  console.log("TARGET PRICE | NET USDC IN     | GROSS USDC (w/ fees) | NARA BOUGHT        | AVG EXEC PRICE");
  console.log("=========================================================================================");

  for (const target of targets) {
    if (target <= currentSpotPrice) continue;

    // Target spot price: target USD / NARA
    // targetUsdcPerNaraWad = target * 1e18
    // priceX192_target = Q192 * 10^30 / targetUsdcPerNaraWad
    // sqrtPriceX96_target = sqrt(priceX192_target)
    const targetWad = BigInt(Math.round(target * 1e6)) * 10n ** 12n;
    const priceX192Target = Q192 * USDC_PER_NARA_WAD_SCALE / targetWad;

    // Integer sqrt
    let s = sqrtPriceX96;
    // float approximation for sqrt
    const sqrtPriceTargetNum = Math.sqrt(Number(priceX192Target));
    const sqrtPriceX96Target = BigInt(Math.round(sqrtPriceTargetNum));

    // When buying NARA with USDC (currency0 in):
    // amountIn (raw USDC) = L * Q96 * (sqrtPriceX96 - sqrtPriceX96Target) / (sqrtPriceX96 * sqrtPriceX96Target)
    const num = totalL * Q96 * (sqrtPriceX96 - sqrtPriceX96Target);
    const den = sqrtPriceX96 * sqrtPriceX96Target;
    const rawUsdcIn = num / den;
    const netUsdc = Number(rawUsdcIn) / 1e6;

    // amountOut (raw NARA) = L * (sqrtPriceX96 - sqrtPriceX96Target) / Q96
    const rawNaraOut = totalL * (sqrtPriceX96 - sqrtPriceX96Target) / Q96;
    const naraBought = Number(rawNaraOut) / 1e18;

    const avgPrice = netUsdc / naraBought;

    // Dynamic fee estimation:
    // With 3% base buy curve up to 12% max, blended fee for large sweep is ~4.5% - 6%
    const feePct = target >= 1.0 ? 0.05 : 0.035;
    const grossUsdc = netUsdc / (1 - feePct);

    const pStr = `$${target.toFixed(2)}`.padEnd(12);
    const netStr = `$${netUsdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.padEnd(15);
    const grossStr = `$${grossUsdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.padEnd(22);
    const naraStr = `${naraBought.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} NARA`.padEnd(19);
    const avgStr = `$${avgPrice.toFixed(4)}`;

    console.log(`${pStr} | ${netStr} | ${grossStr} | ${naraStr} | ${avgStr}`);
  }
  console.log("=========================================================================================");
}

main().catch(console.error);
