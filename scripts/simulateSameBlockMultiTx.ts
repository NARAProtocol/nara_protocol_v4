/**
 * Standalone Local Simulator: Same-Block Multi-Transaction Buys & Dynamic Fees
 *
 * Models and verifies the exact piecewise integral math implemented in
 * NARALiquidityGrowthHook.sol for any combination of same-block transactions.
 *
 * Run locally:
 *   npx tsx scripts/simulateSameBlockMultiTx.ts
 */

const BPS = 10_000n;

export type FeeCurve = readonly [
  mediumPressureBps: bigint,
  highPressureBps: bigint,
  extremePressureBps: bigint,
  baseFeeBps: bigint,
  mediumFeeBps: bigint,
  highFeeBps: bigint,
  extremeFeeBps: bigint,
  maxFeeBps: bigint
];

// Live Base Mainnet Seller-Weighted Policy Curves
export const LIVE_BUY_CURVE: FeeCurve = [
  500n,   // medium threshold: 5% of depth (15 USDC at 300 USDC depth)
  1_500n, // high threshold: 15% of depth (45 USDC at 300 USDC depth)
  3_000n, // extreme threshold: 30% of depth (90 USDC at 300 USDC depth)
  300n,   // base tier: 3.00% (300 BPS)
  500n,   // medium tier: 5.00% (500 BPS)
  800n,   // high tier: 8.00% (800 BPS)
  1_200n, // extreme tier: 12.00% (1,200 BPS)
  1_200n, // max cap: 12.00% (1,200 BPS)
];

export const LIVE_SELL_CURVE: FeeCurve = [
  500n,
  1_500n,
  3_000n,
  500n,
  700n,
  1_000n,
  1_500n,
  2_000n,
];

export const LIVE_USDC_DEPTH = 300n * 10n ** 6n; // 300 USDC
export const LIVE_NARA_DEPTH = 25_000n * 10n ** 18n; // 25,000 NARA

/**
 * Replicates NARALiquidityGrowthHook._cumulativeFee exactly.
 */
export function cumulativeFee(
  curve: FeeCurve,
  amountIn: bigint,
  depth: bigint
): bigint {
  if (amountIn === 0n) return 0n;
  const [
    mediumPressure,
    highPressure,
    extremePressure,
    baseFee,
    mediumFee,
    highFee,
    extremeFee,
    maxFee,
  ] = curve;

  if (depth === 0n) {
    const cappedExtreme = extremeFee > maxFee ? maxFee : extremeFee;
    return (amountIn * cappedExtreme) / BPS;
  }

  const mediumAt = (depth * mediumPressure) / BPS;
  const highAt = (depth * highPressure) / BPS;
  const extremeAt = (depth * extremePressure) / BPS;

  let end = amountIn < mediumAt ? amountIn : mediumAt;
  let fee = (end * baseFee) / BPS;
  if (amountIn <= mediumAt) return fee;

  end = amountIn < highAt ? amountIn : highAt;
  fee += ((end - mediumAt) * mediumFee) / BPS;
  if (amountIn <= highAt) return fee;

  end = amountIn < extremeAt ? amountIn : extremeAt;
  fee += ((end - highAt) * highFee) / BPS;
  if (amountIn <= extremeAt) return fee;

  const cappedExtreme = extremeFee > maxFee ? maxFee : extremeFee;
  return fee + ((amountIn - extremeAt) * cappedExtreme) / BPS;
}

/**
 * Replicates NARALiquidityGrowthHook._feeBps (terminal tier reported).
 */
export function terminalFeeBps(
  curve: FeeCurve,
  amountIn: bigint,
  depth: bigint
): bigint {
  const [
    mediumPressure,
    highPressure,
    extremePressure,
    baseFee,
    mediumFee,
    highFee,
    extremeFee,
    maxFee,
  ] = curve;

  if (depth === 0n) return extremeFee > maxFee ? maxFee : extremeFee;

  const mediumAt = (depth * mediumPressure) / BPS;
  const highAt = (depth * highPressure) / BPS;
  const extremeAt = (depth * extremePressure) / BPS;

  let bps = baseFee;
  if (amountIn >= extremeAt) bps = extremeFee;
  else if (amountIn >= highAt) bps = highFee;
  else if (amountIn >= mediumAt) bps = mediumFee;

  return bps > maxFee ? maxFee : bps;
}

export interface SimulatedTransaction {
  readonly id: string;
  readonly caller: string;
  readonly amountInUsdc: number;
}

export interface SimulationResult {
  readonly sequence: number;
  readonly id: string;
  readonly caller: string;
  readonly amountInUsdc: number;
  readonly priorFlowUsdc: number;
  readonly cumulativeFlowUsdc: number;
  readonly feeUsdc: number;
  readonly effectiveFeeBps: number;
  readonly effectiveFeePercent: string;
  readonly terminalFeeBps: number;
  readonly staggeredFeeUsdc: number;
  readonly surgePremiumUsdc: number;
}

/**
 * Simulates sequential transactions in one block and computes exact marginal fee slices.
 */
export function simulateOneBlockTransactions(
  transactions: readonly SimulatedTransaction[],
  curve: FeeCurve = LIVE_BUY_CURVE,
  depth: bigint = LIVE_USDC_DEPTH
): {
  results: SimulationResult[];
  totalInputUsdc: number;
  totalFeeUsdc: number;
  totalStaggeredFeeUsdc: number;
  netSurgePremiumUsdc: number;
  blendedEffectiveFeeBps: number;
} {
  let priorFlow = 0n;
  let priorFeeCharged = 0n;
  let totalInput = 0n;
  let totalFee = 0n;
  let totalStaggeredFee = 0n;

  const results: SimulationResult[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const amountInWei = BigInt(Math.round(tx.amountInUsdc * 1e6));
    const cumulativeFlow = priorFlow + amountInWei;

    const totalFeeDue = cumulativeFee(curve, cumulativeFlow, depth);
    const feeWei = totalFeeDue - priorFeeCharged;
    const termBps = Number(terminalFeeBps(curve, cumulativeFlow, depth));

    // Staggered calculation (isolated buy starting from 0 flow)
    const isolatedFeeWei = cumulativeFee(curve, amountInWei, depth);

    const feeUsdc = Number(feeWei) / 1e6;
    const staggeredFeeUsdc = Number(isolatedFeeWei) / 1e6;
    const effBps = tx.amountInUsdc > 0 ? Math.round((feeUsdc / tx.amountInUsdc) * 10_000) : 0;

    results.push({
      sequence: i + 1,
      id: tx.id,
      caller: tx.caller,
      amountInUsdc: tx.amountInUsdc,
      priorFlowUsdc: Number(priorFlow) / 1e6,
      cumulativeFlowUsdc: Number(cumulativeFlow) / 1e6,
      feeUsdc,
      effectiveFeeBps: effBps,
      effectiveFeePercent: (effBps / 100).toFixed(2) + "%",
      terminalFeeBps: termBps,
      staggeredFeeUsdc,
      surgePremiumUsdc: feeUsdc - staggeredFeeUsdc,
    });

    priorFlow = cumulativeFlow;
    priorFeeCharged = totalFeeDue;
    totalInput += amountInWei;
    totalFee += feeWei;
    totalStaggeredFee += isolatedFeeWei;
  }

  const totalInputUsdc = Number(totalInput) / 1e6;
  const totalFeeUsdc = Number(totalFee) / 1e6;
  const totalStaggeredFeeUsdc = Number(totalStaggeredFee) / 1e6;

  return {
    results,
    totalInputUsdc,
    totalFeeUsdc,
    totalStaggeredFeeUsdc,
    netSurgePremiumUsdc: totalFeeUsdc - totalStaggeredFeeUsdc,
    blendedEffectiveFeeBps:
      totalInputUsdc > 0 ? Math.round((totalFeeUsdc / totalInputUsdc) * 10_000) : 0,
  };
}

function runDemo() {
  console.log("=======================================================================");
  console.log(" NARA v4 Hook — Same-Block Multi-Transaction Dynamic Fee Simulator");
  console.log("=======================================================================\n");

  console.log(`Configured Protocol Depth : $${Number(LIVE_USDC_DEPTH) / 1e6} USDC`);
  console.log("Active Live Buy Curve     : Thresholds [15, 45, 90] USDC | Tiers [3%, 5%, 8%, 12%]\n");

  // Scenario: 4 distinct transactions in the same block
  const scenario: SimulatedTransaction[] = [
    { id: "Tx1_Alice", caller: "Alice (Early Buyer)", amountInUsdc: 10.0 },
    { id: "Tx2_Bob", caller: "Bob (Crosses Tier 1)", amountInUsdc: 20.0 },
    { id: "Tx3_Charlie", caller: "Charlie (Crosses Tier 2)", amountInUsdc: 30.0 },
    { id: "Tx4_MEV_Sniper", caller: "MEV Sniper (Extreme Tier)", amountInUsdc: 50.0 },
  ];

  console.log("Simulating 4 concurrent transactions mined in Block B:\n");
  const sim = simulateOneBlockTransactions(scenario);

  console.table(
    sim.results.map((r) => ({
      "#": r.sequence,
      Caller: r.caller,
      "In (USDC)": `$${r.amountInUsdc.toFixed(2)}`,
      "Flow Range": `$${r.priorFlowUsdc.toFixed(2)} -> $${r.cumulativeFlowUsdc.toFixed(2)}`,
      "Fee (USDC)": `$${r.feeUsdc.toFixed(4)}`,
      "Eff Fee %": r.effectiveFeePercent,
      "Term Tier": `${r.terminalFeeBps} bps`,
      "Staggered Fee": `$${r.staggeredFeeUsdc.toFixed(4)}`,
      "Surge Premium": `+$${r.surgePremiumUsdc.toFixed(4)}`,
    }))
  );

  console.log("\n--- Block Totals & Comparison ---");
  console.log(`Total USDC Injected        : $${sim.totalInputUsdc.toFixed(2)} USDC`);
  console.log(`Total Hook Fees Skimmed   : $${sim.totalFeeUsdc.toFixed(4)} USDC to Vault`);
  console.log(`Staggered Baseline Fees   : $${sim.totalStaggeredFeeUsdc.toFixed(4)} USDC`);
  console.log(`Net Surge Premium Extracted: +$${sim.netSurgePremiumUsdc.toFixed(4)} USDC (+${((sim.netSurgePremiumUsdc / sim.totalStaggeredFeeUsdc) * 100).toFixed(1)}% vs staggered)`);
  console.log(`Blended Effective Fee Rate : ${(sim.blendedEffectiveFeeBps / 100).toFixed(2)}%`);
  console.log("=======================================================================\n");
}

if (process.argv[1]?.includes("simulateSameBlockMultiTx")) {
  runDemo();
}
