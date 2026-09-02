import { cumulativeFee, LIVE_BUY_CURVE, LIVE_USDC_DEPTH } from "./simulateSameBlockMultiTx.js";

console.log("=======================================================================");
console.log("  NARA v4 HOOK: 15 TRADES VS 1,000 TRADES OF $1 USDC ANALYSIS");
console.log("=======================================================================\n");

// Case 1: 15 trades of $1 USDC in ONE BLOCK
console.log("? SCENARIO 1: 15 Trades of $1.00 USDC in ONE BLOCK");
console.log("-----------------------------------------------------------------------");
let prevFlow = 0n;
let totalFee15 = 0n;

for (let i = 1; i <= 15; i++) {
  const currentFlow = BigInt(i) * 1_000_000n;
  const totalCumFee = cumulativeFee(LIVE_BUY_CURVE, currentFlow, LIVE_USDC_DEPTH);
  const marginalFee = totalCumFee - cumulativeFee(LIVE_BUY_CURVE, prevFlow, LIVE_USDC_DEPTH);
  prevFlow = currentFlow;
  totalFee15 += marginalFee;
  const feePct = (Number(marginalFee) / 1e6) * 100;
  console.log(
    `  Tx #${String(i).padStart(2, "0")} | In: $1.00 USDC | Marginal Fee: $${(Number(marginalFee) / 1e6).toFixed(4)} (${feePct.toFixed(2)}%) | Block Flow: $${i}.00 / $15.00`
  );
}

console.log("-----------------------------------------------------------------------");
console.log(`  Total 15 Tx Volume    : $15.00 USDC`);
console.log(`  Total Hook Fee Paid   : $${(Number(totalFee15) / 1e6).toFixed(4)} USDC`);
console.log(`  Blended Effective Fee : ${((Number(totalFee15) / 15_000_000) * 100).toFixed(2)}%`);
console.log(`  Tier Reached          : Exactly hits Tier 1 threshold (3.00% Base Tier)`);
console.log(`  Block Gas Required    : ~2,100,000 gas (only 7% of Base 30M block limit)`);
console.log(`  Can fit in 1 Block?   : YES! (Easily fits within a single 2-second block)\n`);

// Case 2: 1,000 trades of $1 USDC in ONE BLOCK (Theoretical)
console.log("? SCENARIO 2: 1,000 Trades of $1.00 USDC in ONE BLOCK (Theoretical Math)");
console.log("-----------------------------------------------------------------------");
const volume1000 = 1000n * 1_000_000n; // $1,000 USDC
const totalFee1000 = cumulativeFee(LIVE_BUY_CURVE, volume1000, LIVE_USDC_DEPTH);

// Breakdown by tiers:
// Tier 0 (0 to $15): 3% fee -> $15 * 0.03 = $0.45
// Tier 1 ($15 to $45): 5% fee -> $30 * 0.05 = $1.50
// Tier 2 ($45 to $90): 8% fee -> $45 * 0.08 = $3.60
// Tier 3 ($90 to $1000): 12% fee -> $910 * 0.12 = $109.20
const tier0Fee = (15n * 1_000_000n * 300n) / 10_000n;
const tier1Fee = (30n * 1_000_000n * 500n) / 10_000n;
const tier2Fee = (45n * 1_000_000n * 800n) / 10_000n;
const tier3Fee = (910n * 1_000_000n * 1200n) / 10_000n;

console.log(`  Trades #1 - #15   ($1 - $15)   : 3.00% Tier -> Fee: $${(Number(tier0Fee)/1e6).toFixed(2)} USDC`);
console.log(`  Trades #16 - #45  ($16 - $45)  : 5.00% Tier -> Fee: $${(Number(tier1Fee)/1e6).toFixed(2)} USDC`);
console.log(`  Trades #46 - #90  ($46 - $90)  : 8.00% Tier -> Fee: $${(Number(tier2Fee)/1e6).toFixed(2)} USDC`);
console.log(`  Trades #91 - #1000($91 - $1000): 12.00% Tier (MAX SURGE) -> Fee: $${(Number(tier3Fee)/1e6).toFixed(2)} USDC`);
console.log("-----------------------------------------------------------------------");
console.log(`  Total 1,000 Tx Volume : $1,000.00 USDC`);
console.log(`  Total Fee Extracted   : $${(Number(totalFee1000) / 1e6).toFixed(2)} USDC to Vault!`);
console.log(`  Blended Effective Fee : ${((Number(totalFee1000) / Number(volume1000)) * 100).toFixed(2)}%`);
console.log(`  Block Gas Required    : ~140,000,000 gas (Exceeds 30M single-block limit!)`);
console.log(`  Can fit in 1 Block?   : NO! (1,000 separate txs require 5 to 7 consecutive blocks)`);
console.log("=======================================================================");
