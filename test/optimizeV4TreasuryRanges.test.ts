import { expect } from "chai";
import {
  NARA_UNIT,
  buildDeterministicStrategyProfiles,
  stampStrategyHash,
} from "../scripts/lib/v4TreasuryRangePlanner.js";
import {
  humanUsdcPerNaraToSqrtPriceX96,
  parseDecimalRational,
} from "../scripts/lib/v4TreasuryRangeMath.js";
import {
  bindTreasuryRangeMatrixRows,
  REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS,
  REQUIRED_TREASURY_BUY_SIZES_USDC,
  REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA,
  type TreasuryRangeEvidenceBinding,
} from "../scripts/lib/v4TreasuryRangeEvidence.js";
import {
  REQUIRED_NARA_BUDGETS,
  REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT,
  optimizeTreasuryRanges,
  parseExactForkCandidateMetrics,
  type ExactForkCandidateMetrics,
} from "../scripts/optimizeV4TreasuryRanges.js";

describe("v4 treasury range optimizer", function () {
  const evidenceBinding: Omit<TreasuryRangeEvidenceBinding, "candidateId"> = {
    repositoryHead: "11".repeat(20),
    chainId: 8453n,
    blockNumber: 50_537_172n,
    blockHash: `0x${"22".repeat(32)}`,
    humanUsdcPerNara: { numerator: 1n, denominator: 1n },
  };
  const transactionHash = (seed: number) => `0x${seed.toString(16).padStart(64, "0")}`;
  const finalizeProfile = (profile: Parameters<typeof stampStrategyHash>[0]) => ({
    profile: stampStrategyHash(profile, `0x${"88".repeat(32)}`),
    manifest: { fixture: true },
  });
  const profiles = buildDeterministicStrategyProfiles({
    currentSqrtPriceX96: humanUsdcPerNaraToSqrtPriceX96(parseDecimalRational("0.0847")),
    creationDeadline: 2_000_000_000n,
    hookConfigurationHash: `0x${"44".repeat(32)}`,
  });
  const rawMatrixRows = (): Array<Record<string, unknown>> => {
    let seed = 1;
    const swapRow = (scenario: string, kind: string, sizeKey: string, size: bigint, unit: bigint) => ({
      scenario, kind, [sizeKey]: size.toString(), status: "executed",
      transactionHash: transactionHash(seed++), transactionBlockNumber: String(100 + seed),
      grossInputRaw: (size * unit).toString(),
      outputRaw: (size * unit * (unit === 10n ** 6n ? 10n ** 12n : 1n)).toString(),
      hookVaultFeeRaw: "1", lpFeeRaw: "1", gasUsed: "100000", startTick: "0", endTick: "1",
    });
    const rows: Array<Record<string, unknown>> = [
      { scenario: "SENSITIVITY", kind: "one_sided_price_band", movementBps: "-2000", spotNumerator: "4", spotDenominator: "5", orders: [{ oneSidedAcrossFullBand: true }] },
      { scenario: "SENSITIVITY", kind: "one_sided_price_band", movementBps: "+2000", spotNumerator: "6", spotDenominator: "5", orders: [{ oneSidedAcrossFullBand: true }] },
      ...REQUIRED_TREASURY_BUY_SIZES_USDC.map((size) => swapRow("A", "single_buy", "sizeUsdc", size, 10n ** 6n)),
      ...REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA.map((size) => swapRow("A", "independent_sell", "sizeNara", size, NARA_UNIT)),
      {
        scenario: "B", kind: "same_block_transactions",
        sizeEachUsdc: "10000", transactionStatuses: ["executed", "executed"],
        transactionHashes: [transactionHash(seed++), transactionHash(seed++)],
        transactionBlockNumbers: ["200", "200"], hookFeesRaw: ["1", "2"], gasUsed: ["100000", "100001"],
      },
      {
        scenario: "C", kind: "same_transaction_actions", sizeEachUsdc: "10000", status: "executed",
        transactionHash: transactionHash(seed++),
        transactionBlockNumber: "201", hookFeesRaw: ["1", "2"], gasUsed: "100000",
      },
      {
        scenario: "D", kind: "cross_block_pressure_reset",
        transactionStatuses: ["executed", "executed"],
        transactionHashes: [transactionHash(seed++), transactionHash(seed++)],
        transactionBlockNumbers: ["202", "203"], hookFeesRaw: ["1", "1"], blocks: ["202", "203"],
      },
      {
        scenario: "E", kind: "buy_settle_sell", settledOrderIds: ["1"],
        buyStatus: "executed", settlementStatus: "executed", sellStatus: "executed",
        buyTransactionHash: transactionHash(seed++), buyBlockNumber: "204",
        settlementTransactionHash: transactionHash(seed++), settlementBlockNumber: "205",
        sellTransactionHash: transactionHash(seed++), sellBlockNumber: "206",
        safeUsdcDeltaRaw: (1_000n * 10n ** 6n).toString(),
        rangePrincipalUsdcRaw: (900n * 10n ** 6n).toString(),
        rangeLpFeesUsdcRaw: (100n * 10n ** 6n).toString(),
        nearMarketNaraSoldRaw: (1_000n * NARA_UNIT).toString(), permanentPolUnchanged: true,
        hookVaultUsdcFeeRaw: "1", buyHookFeeRaw: "1", buyLpFeeRaw: "1",
        sellHookFeeRaw: "1", sellLpFeeRaw: "1", safeNaraDeltaRaw: "0",
        fullSafeUsdcDeltaRaw: (1_000n * 10n ** 6n).toString(), vaultNaraDeltaRaw: "0",
        vaultUsdcDeltaRaw: "0", unsettledInventory: [], buyGasUsed: "100000",
        settleGasUsed: "100000", sellGasUsed: "100000",
      },
      {
        scenario: "F", kind: "atomic_buy_reverse_no_settlement_window", status: "executed",
        transactionHash: transactionHash(seed++),
        transactionBlockNumber: "207", swapCount: 2, limitationObserved: true, gasUsed: "200000",
      },
      {
        scenario: "G", kind: "buy_reverse_without_settlement",
        buyStatus: "executed", sellStatus: "executed",
        buyTransactionHash: transactionHash(seed++), buyBlockNumber: "208",
        sellTransactionHash: transactionHash(seed++), sellBlockNumber: "209",
        roundTripLossUsdcRaw: (50n * 10n ** 6n).toString(), unsettledOrderCount: 1,
        buyHookFeeRaw: "1", buyLpFeeRaw: "1", sellHookFeeRaw: "1", sellLpFeeRaw: "1",
        safeNaraDeltaRaw: "0", safeUsdcDeltaRaw: "0", vaultNaraDeltaRaw: "0",
        vaultUsdcDeltaRaw: "0", unsettledInventory: [],
      },
      {
        scenario: "H", kind: "buy_settle_reverse", settledOrderIds: ["1"],
        buyStatus: "executed", settlementStatus: "executed", sellStatus: "executed",
        buyTransactionHash: transactionHash(seed++), buyBlockNumber: "210",
        settlementTransactionHash: transactionHash(seed++), settlementBlockNumber: "211",
        sellTransactionHash: transactionHash(seed++), sellBlockNumber: "212",
        roundTripLossUsdcRaw: (100n * 10n ** 6n).toString(), permanentPolUnchanged: true,
        buyHookFeeRaw: "1", buyLpFeeRaw: "1", sellHookFeeRaw: "1", sellLpFeeRaw: "1",
        safeNaraDeltaRaw: "0", safeUsdcDeltaRaw: "0", vaultNaraDeltaRaw: "0",
        vaultUsdcDeltaRaw: "0", unsettledInventory: [],
      },
      ...REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS.map((fraction) => ({
        scenario: "G", kind: "acquired_inventory_sell_fraction", fractionBps: fraction.toString(),
        buyStatus: "executed", sellStatus: "executed",
        buyTransactionHash: transactionHash(seed++), buyBlockNumber: String(220 + seed),
        sellTransactionHash: transactionHash(seed++), sellBlockNumber: String(230 + seed),
        acquiredNaraRaw: (10_000n * NARA_UNIT).toString(),
        soldNaraRaw: (10_000n * NARA_UNIT * fraction / 10_000n).toString(), usdcOutputRaw: "1",
      })),
      {
        scenario: "H", kind: "bid_settlement_after_independent_sell", settledOrderIds: ["2"],
        sellStatus: "executed", settlementStatus: "executed",
        sellTransactionHash: transactionHash(seed++), sellBlockNumber: "240",
        settlementTransactionHash: transactionHash(seed++), settlementBlockNumber: "241",
        treasuryNaraAccumulatedRaw: (5_000n * NARA_UNIT).toString(),
      },
    ];
    return rows;
  };
  const metricFixture = (
    candidateId: string,
    rows: readonly Readonly<Record<string, unknown>>[] = rawMatrixRows(),
    binding = evidenceBinding,
  ): ExactForkCandidateMetrics => {
    const bound = bindTreasuryRangeMatrixRows({ ...binding, candidateId }, rows);
    return {
      candidateId,
      exactForkValidated: true,
      exactInputOnly: true,
      scenarioCoverage: ["A", "B", "C", "D", "E", "F", "G", "H"],
      buySizeCoverageUsdc: REQUIRED_TREASURY_BUY_SIZES_USDC.map(String),
      independentSellSizeCoverageNara: REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA.map(String),
      acquiredSellFractionCoverageBps: REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS.map(String),
      matrixHash: bound.matrixHash,
      matrix: bound.rows,
      normalBuyExecution: Object.fromEntries(REQUIRED_TREASURY_BUY_SIZES_USDC.map((size) => [size.toString(), true])),
      crystallizedUsdc: 1_000n * 10n ** 6n,
      treasuryNaraAccumulated: 5_000n * NARA_UNIT,
      nearMarketNaraSold: 1_000n * NARA_UNIT,
      nextTransactionRoundTripLossUsdc: 100n * 10n ** 6n,
      maximumObservedSlippageBps: 0n,
      quoteFailures: 0n,
    };
  };
  const completeMetrics = () => {
    const metrics = new Map<string, ExactForkCandidateMetrics>();
    for (const profile of profiles) {
      for (const budget of REQUIRED_NARA_BUDGETS) {
        const id = `${profile.name}-${budget}-NARA`;
        metrics.set(id, metricFixture(id));
      }
    }
    expect(metrics.size).to.equal(REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT);
    return metrics;
  };
  const optimize = (metrics: ReadonlyMap<string, ExactForkCandidateMetrics>) => optimizeTreasuryRanges({
    baseProfiles: profiles,
    metrics,
    evidenceBinding,
    safeBalances: { nara: 2_070_480n, usdc: 0n },
    treasuryBalances: { nara: 231_654n * NARA_UNIT, usdc: 4_398_903_041n },
    finalizeProfile,
  });

  it("refuses to choose without complete exact-fork metrics", function () {
    const result = optimizeTreasuryRanges({
      baseProfiles: profiles,
      metrics: new Map(),
      evidenceBinding,
      safeBalances: { nara: 0n, usdc: 0n },
      treasuryBalances: { nara: 231_000n * NARA_UNIT, usdc: 4_398_903_041n },
      finalizeProfile,
    });
    expect(result.selectedCandidateId).to.equal(null);
    expect(result.selectionStatus).to.equal("BLOCKED_EXACT_FORK_RESULTS_REQUIRED");
    expect(result.candidates).to.have.length(21);
  });

  it("blocks selection for incomplete, extra, or mismatched candidate sets", function () {
    const complete = completeMetrics();
    const ids = [...complete.keys()];
    const one = new Map([[ids[0], complete.get(ids[0])!]]);
    const missing = new Map(ids.slice(0, -1).map((id) => [id, complete.get(id)!] as const));
    const extra = new Map(complete);
    extra.set("CONSERVATIVE-125000-NARA", metricFixture("CONSERVATIVE-125000-NARA"));
    const wrongProfile = new Map(complete);
    wrongProfile.delete(ids[0]);
    wrongProfile.set("UNKNOWN-15000-NARA", { ...metricFixture(ids[0]), candidateId: "UNKNOWN-15000-NARA" });
    const wrongBudget = new Map(complete);
    wrongBudget.delete(ids[0]);
    wrongBudget.set("CONSERVATIVE-15001-NARA", metricFixture("CONSERVATIVE-15001-NARA"));
    const mismatchedValue = new Map(complete);
    mismatchedValue.set(ids[0], metricFixture(ids[1]));

    for (const metrics of [one, missing, extra, wrongProfile, wrongBudget, mismatchedValue]) {
      const result = optimize(metrics);
      expect(result.selectedCandidateId).to.equal(null);
      expect(result.selectionStatus).to.equal("BLOCKED_EXACT_FORK_RESULTS_REQUIRED");
      expect(result.pareto).to.be.empty;
      expect(result.candidates).to.have.length(REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT);
      expect(result.candidates.every((candidate) => candidate.metrics === undefined)).to.equal(true);
    }
  });

  it("blocks all 21 candidates when any row evidence or derived aggregate is invalid", function () {
    const complete = completeMetrics();
    const candidate = [...complete.keys()][0];
    const valid = complete.get(candidate)!;
    const replace = (invalid: ExactForkCandidateMetrics) => {
      const metrics = new Map(complete);
      metrics.set(candidate, invalid);
      return metrics;
    };
    const mutateRow = (
      predicate: (row: Readonly<Record<string, unknown>>) => boolean,
      mutation: (row: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>,
    ) => rawMatrixRows().map((row) => predicate(row) ? mutation(row) : row);
    const revertedBuy = metricFixture(candidate, mutateRow(
      (row) => row.kind === "single_buy" && row.sizeUsdc === "500",
      (row) => ({ ...row, status: "reverted" }),
    ));
    const revertedSell = metricFixture(candidate, mutateRow(
      (row) => row.kind === "independent_sell" && row.sizeNara === "5000",
      (row) => ({ ...row, status: "reverted" }),
    ));
    const revertedScenarioC = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "C",
      (row) => ({ ...row, status: "reverted" }),
    ));
    const revertedScenarioESettlement = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "E",
      (row) => ({ ...row, settlementStatus: "reverted" }),
    ));
    const revertedSameBlockComponent = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "B",
      (row) => ({ ...row, transactionStatuses: ["executed", "reverted"] }),
    ));
    const ignoredExtraStatusForbidden = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "E",
      (row) => ({ ...row, status: "reverted" }),
    ));
    const missingSuccessEvidence = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "C",
      (row) => {
        const { transactionHash: _removed, ...rest } = row;
        return rest;
      },
    ));
    const wrongCandidateRows = valid.matrix.map((row, index) => index === 0
      ? { ...row, candidateId: "AGGRESSIVE-15000-NARA" }
      : row);
    const invalidVariants: ExactForkCandidateMetrics[] = [
      { ...valid, matrix: [], matrixHash: `0x${"00".repeat(32)}` },
      metricFixture(candidate, rawMatrixRows().slice(0, -1)),
      metricFixture(candidate, [...rawMatrixRows(), rawMatrixRows()[0]]),
      metricFixture(candidate, [...rawMatrixRows(), { scenario: "Z", kind: "extra" }]),
      revertedBuy,
      revertedSell,
      revertedScenarioC,
      revertedScenarioESettlement,
      revertedSameBlockComponent,
      ignoredExtraStatusForbidden,
      missingSuccessEvidence,
      { ...valid, matrix: wrongCandidateRows },
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, repositoryHead: "33".repeat(20) }),
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, blockNumber: evidenceBinding.blockNumber + 1n }),
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, blockHash: `0x${"44".repeat(32)}` }),
      { ...valid, scenarioCoverage: ["A", "B", "C", "D", "E", "F", "G", "H", "H"] },
      { ...valid, quoteFailures: 1n },
      { ...valid, crystallizedUsdc: valid.crystallizedUsdc + 1n },
      { ...valid, treasuryNaraAccumulated: valid.treasuryNaraAccumulated + 1n },
      { ...valid, nearMarketNaraSold: valid.nearMarketNaraSold + 1n },
      { ...valid, nextTransactionRoundTripLossUsdc: valid.nextTransactionRoundTripLossUsdc + 1n },
      { ...valid, maximumObservedSlippageBps: 1n },
    ];
    for (const invalid of invalidVariants) {
      const result = optimize(replace(invalid));
      expect(result.selectedCandidateId).to.equal(null);
      expect(result.selectionStatus).to.equal("BLOCKED_EXACT_FORK_RESULTS_REQUIRED");
      expect(result.pareto).to.be.empty;
      expect(result.candidates.every((entry) => entry.metrics === undefined)).to.equal(true);
    }
  });

  it("rejects duplicate candidate IDs while parsing metric evidence", function () {
    const values = [...completeMetrics().values()].slice(0, 2);
    const raw = JSON.parse(JSON.stringify(values, (_key, value) => typeof value === "bigint" ? value.toString() : value));
    raw[1].candidateId = raw[0].candidateId;
    expect(() => parseExactForkCandidateMetrics(raw)).to.throw(`Duplicate metrics for ${raw[0].candidateId}`);
  });

  it("selects only after all 21 canonical candidate IDs are present", function () {
    const result = optimize(completeMetrics());
    expect(result.selectedCandidateId).not.to.equal(null);
    expect(result.selectionStatus).to.equal("SELECTED_EXECUTION_BLOCKED");
    expect(result.pareto).not.to.be.empty;
    expect(result.pareto[0].safeFunding.safeUsdcShortfall).to.equal(5_000n * 10n ** 6n);
    expect(result.pareto[0].safeFunding.safeNaraShortfall > 0n).to.equal(true);
  });
});
