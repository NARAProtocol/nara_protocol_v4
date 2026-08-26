const BPS = 10_000n;

export type StabilizerExpectedValueVerdict =
  | "POSITIVE_EV"
  | "NON_POSITIVE_EV"
  | "BLOCKED";

export interface StabilizerExpectedValueScenario {
  /** Integer probability weight. All scenario weights must sum to 10_000. */
  probabilityBps: bigint;
  /** Executable exit proceeds, in atomic USDC. Null means unavailable. */
  exitProceedsUsdcAtomic: bigint | null;
  /** Conservatively realizable residual inventory, in atomic USDC. */
  residualValueUsdcAtomic: bigint | null;
  /** Informational only. A favorable mark is never included in EV. */
  recoveryMarkUsdcAtomic?: bigint | null;
  /** False when this scenario lacks complete, block-pinned evidence. */
  evidenceComplete: boolean;
}

export interface StabilizerExpectedValueInput {
  scenarios: readonly StabilizerExpectedValueScenario[];
  entryCostUsdcAtomic: bigint | null;
  entryGasUsdcAtomic: bigint | null;
  exitGasUsdcAtomic: bigint | null;
  otherCostsUsdcAtomic: bigint | null;
  /** False when the evidence set has any unresolved integrity issue. */
  evidenceComplete: boolean;
  minExpectedEdgeBps: bigint;
  minExpectedNetUsdcAtomic: bigint;
}

export interface StabilizerExpectedValueResult {
  probabilityBps: bigint;
  expectedGrossUsdcAtomic: bigint | null;
  totalCostsUsdcAtomic: bigint | null;
  expectedNetUsdcAtomic: bigint | null;
  expectedEdgeBps: bigint | null;
  evidenceComplete: boolean;
  evidenceIssues: string[];
  verdict: StabilizerExpectedValueVerdict;
}

function requireBigInt(name: string, value: unknown): asserts value is bigint {
  if (typeof value !== "bigint") throw new Error(`${name} must be a bigint`);
}

function requireNonNegative(name: string, value: bigint): void {
  if (value < 0n) throw new Error(`${name} must be non-negative`);
}

function validateOptionalAtomic(name: string, value: bigint | null): void {
  if (value === null) return;
  requireBigInt(name, value);
  requireNonNegative(name, value);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  if (numerator === 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

/** Positive ratios round down; negative ratios round away from zero. */
function conservativeSignedRatio(
  numerator: bigint,
  denominator: bigint
): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  return numerator >= 0n
    ? numerator / denominator
    : -ceilDiv(-numerator, denominator);
}

function addIssue(issues: string[], issue: string): void {
  if (!issues.includes(issue)) issues.push(issue);
}

/**
 * Computes scenario-weighted expected value using only integer arithmetic.
 * Weighted proceeds round down before costs are subtracted. Expected edge is
 * measured against total committed cost and rounds conservatively for either
 * sign. Recovery marks are validated for diagnostics but never counted.
 */
export function calculateStabilizerExpectedValue({
  scenarios,
  entryCostUsdcAtomic,
  entryGasUsdcAtomic,
  exitGasUsdcAtomic,
  otherCostsUsdcAtomic,
  evidenceComplete: inputEvidenceComplete,
  minExpectedEdgeBps,
  minExpectedNetUsdcAtomic,
}: StabilizerExpectedValueInput): StabilizerExpectedValueResult {
  if (scenarios.length === 0) throw new Error("scenarios must not be empty");
  requireBigInt("minExpectedEdgeBps", minExpectedEdgeBps);
  requireBigInt("minExpectedNetUsdcAtomic", minExpectedNetUsdcAtomic);
  requireNonNegative("minExpectedEdgeBps", minExpectedEdgeBps);
  requireNonNegative("minExpectedNetUsdcAtomic", minExpectedNetUsdcAtomic);

  validateOptionalAtomic("entryCostUsdcAtomic", entryCostUsdcAtomic);
  validateOptionalAtomic("entryGasUsdcAtomic", entryGasUsdcAtomic);
  validateOptionalAtomic("exitGasUsdcAtomic", exitGasUsdcAtomic);
  validateOptionalAtomic("otherCostsUsdcAtomic", otherCostsUsdcAtomic);

  const issues: string[] = [];
  if (!inputEvidenceComplete) addIssue(issues, "evidence_set_incomplete");
  if (entryCostUsdcAtomic === null) addIssue(issues, "missing_entry_cost");
  if (entryGasUsdcAtomic === null) addIssue(issues, "missing_entry_gas");
  if (exitGasUsdcAtomic === null) addIssue(issues, "missing_exit_gas");
  if (otherCostsUsdcAtomic === null) addIssue(issues, "missing_other_costs");

  let probabilityBps = 0n;
  let weightedGrossNumerator = 0n;
  let grossEvidenceComplete = true;

  scenarios.forEach((scenario, index) => {
    requireBigInt(
      `scenarios[${index}].probabilityBps`,
      scenario.probabilityBps
    );
    requireNonNegative(
      `scenarios[${index}].probabilityBps`,
      scenario.probabilityBps
    );
    probabilityBps += scenario.probabilityBps;

    validateOptionalAtomic(
      `scenarios[${index}].exitProceedsUsdcAtomic`,
      scenario.exitProceedsUsdcAtomic
    );
    validateOptionalAtomic(
      `scenarios[${index}].residualValueUsdcAtomic`,
      scenario.residualValueUsdcAtomic
    );
    if (scenario.recoveryMarkUsdcAtomic !== undefined)
      validateOptionalAtomic(
        `scenarios[${index}].recoveryMarkUsdcAtomic`,
        scenario.recoveryMarkUsdcAtomic
      );

    if (!scenario.evidenceComplete)
      addIssue(issues, `scenario_${index}_evidence_incomplete`);
    if (scenario.exitProceedsUsdcAtomic === null) {
      grossEvidenceComplete = false;
      addIssue(issues, `scenario_${index}_missing_exit_proceeds`);
    }
    if (scenario.residualValueUsdcAtomic === null) {
      grossEvidenceComplete = false;
      addIssue(issues, `scenario_${index}_missing_residual_value`);
    }
    if (
      scenario.exitProceedsUsdcAtomic !== null &&
      scenario.residualValueUsdcAtomic !== null
    ) {
      weightedGrossNumerator +=
        scenario.probabilityBps *
        (scenario.exitProceedsUsdcAtomic + scenario.residualValueUsdcAtomic);
    }
  });

  if (probabilityBps !== BPS) {
    throw new Error(
      `scenario probabilityBps must sum exactly to 10000; got ${probabilityBps}`
    );
  }

  const expectedGrossUsdcAtomic = grossEvidenceComplete
    ? weightedGrossNumerator / BPS
    : null;
  const costsComplete =
    entryCostUsdcAtomic !== null &&
    entryGasUsdcAtomic !== null &&
    exitGasUsdcAtomic !== null &&
    otherCostsUsdcAtomic !== null;
  const totalCostsUsdcAtomic = costsComplete
    ? entryCostUsdcAtomic +
      entryGasUsdcAtomic +
      exitGasUsdcAtomic +
      otherCostsUsdcAtomic
    : null;
  const expectedNetUsdcAtomic =
    expectedGrossUsdcAtomic !== null && totalCostsUsdcAtomic !== null
      ? expectedGrossUsdcAtomic - totalCostsUsdcAtomic
      : null;
  const expectedEdgeBps =
    expectedNetUsdcAtomic !== null &&
    totalCostsUsdcAtomic !== null &&
    totalCostsUsdcAtomic > 0n
      ? conservativeSignedRatio(
          expectedNetUsdcAtomic * BPS,
          totalCostsUsdcAtomic
        )
      : null;
  if (totalCostsUsdcAtomic === 0n) addIssue(issues, "zero_total_cost");

  const completeEvidence =
    inputEvidenceComplete &&
    scenarios.every((scenario) => scenario.evidenceComplete) &&
    grossEvidenceComplete &&
    costsComplete &&
    totalCostsUsdcAtomic !== 0n;
  const verdict: StabilizerExpectedValueVerdict = !completeEvidence
    ? "BLOCKED"
    : expectedNetUsdcAtomic !== null &&
      expectedEdgeBps !== null &&
      expectedNetUsdcAtomic >= minExpectedNetUsdcAtomic &&
      expectedEdgeBps >= minExpectedEdgeBps
    ? "POSITIVE_EV"
    : "NON_POSITIVE_EV";

  return {
    probabilityBps,
    expectedGrossUsdcAtomic,
    totalCostsUsdcAtomic,
    expectedNetUsdcAtomic,
    expectedEdgeBps,
    evidenceComplete: completeEvidence,
    evidenceIssues: issues,
    verdict,
  };
}
