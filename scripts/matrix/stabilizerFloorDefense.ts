const BPS = 10_000n;
const NARA_WEI_PER_NARA = 10n ** 18n;
const USDC_ATOMIC_PER_USDC = 10n ** 6n;
const USDC_PRICE_WAD = 10n ** 18n;
const NARA_PRICE_TO_USDC_ATOMIC_DIVISOR =
  (NARA_WEI_PER_NARA * USDC_PRICE_WAD) / USDC_ATOMIC_PER_USDC;

export type FloorDefenseVerdict = "GO" | "NO_GO";

export interface FloorDefenseBudgetInput {
  availableUsdc: bigint | null;
  reserveFloorUsdc: bigint;
  defenseCapUsdc: bigint;
}

export interface FloorDefenseBudgetPlan {
  deployableUsdc: bigint;
  budgetUsdc: bigint;
}

export interface FloorRecoveryEdgeInput {
  budgetUsdc: bigint;
  quotedNaraOut: bigint;
  recoveryTargetUsdcPerNaraWad: bigint;
  minEdgeBps: bigint;
}

export interface FloorRecoveryEdge {
  entryNetUsdcPerNaraWad: bigint | null;
  recoveryValueUsdc: bigint;
  profitIfRecoveryUsdc: bigint;
  edgeBps: bigint;
  verdict: FloorDefenseVerdict;
}

function requireNonNegative(name: string, value: bigint): void {
  if (value < 0n) throw new Error(`${name} must be non-negative`);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  if (numerator === 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

function conservativeSignedRatio(
  numerator: bigint,
  denominator: bigint
): bigint {
  if (denominator <= 0n) return 0n;
  if (numerator >= 0n) return numerator / denominator;
  return -ceilDiv(-numerator, denominator);
}

/**
 * Values a raw NARA amount in raw USDC units at a WAD-scaled USDC/NARA mid.
 * The result rounds down, so a sub-micro-USDC amount cannot cross a trigger.
 */
export function calculateDumpUsdcValue(
  naraAmountWei: bigint,
  referenceMidUsdcPerNaraWad: bigint
): bigint {
  requireNonNegative("naraAmountWei", naraAmountWei);
  requireNonNegative("referenceMidUsdcPerNaraWad", referenceMidUsdcPerNaraWad);
  return (
    (naraAmountWei * referenceMidUsdcPerNaraWad) /
    NARA_PRICE_TO_USDC_ATOMIC_DIVISOR
  );
}

/**
 * Preserves the configured reserve and limits a single shadow intervention.
 * A null balance means no watched wallet is configured, so Phase 1 simulates
 * only the configured cap rather than inventing a wallet balance.
 */
export function planFloorDefenseBudget({
  availableUsdc,
  reserveFloorUsdc,
  defenseCapUsdc,
}: FloorDefenseBudgetInput): FloorDefenseBudgetPlan {
  requireNonNegative("reserveFloorUsdc", reserveFloorUsdc);
  requireNonNegative("defenseCapUsdc", defenseCapUsdc);
  if (availableUsdc !== null)
    requireNonNegative("availableUsdc", availableUsdc);

  const deployableUsdc =
    availableUsdc === null
      ? defenseCapUsdc
      : availableUsdc > reserveFloorUsdc
      ? availableUsdc - reserveFloorUsdc
      : 0n;
  const budgetUsdc =
    deployableUsdc < defenseCapUsdc ? deployableUsdc : defenseCapUsdc;

  return { deployableUsdc, budgetUsdc };
}

export function classifyFloorDefenseVerdict(
  budgetUsdc: bigint,
  quotedNaraOut: bigint,
  edgeBps: bigint,
  minEdgeBps: bigint
): FloorDefenseVerdict {
  requireNonNegative("budgetUsdc", budgetUsdc);
  requireNonNegative("quotedNaraOut", quotedNaraOut);
  requireNonNegative("minEdgeBps", minEdgeBps);
  return budgetUsdc > 0n && quotedNaraOut > 0n && edgeBps >= minEdgeBps
    ? "GO"
    : "NO_GO";
}

/**
 * Computes floor-defense economics entirely in integer token units. Entry
 * price rounds up and recovery value rounds down, keeping the shadow verdict
 * conservative at precision boundaries.
 */
export function calculateFloorRecoveryEdge({
  budgetUsdc,
  quotedNaraOut,
  recoveryTargetUsdcPerNaraWad,
  minEdgeBps,
}: FloorRecoveryEdgeInput): FloorRecoveryEdge {
  requireNonNegative("budgetUsdc", budgetUsdc);
  requireNonNegative("quotedNaraOut", quotedNaraOut);
  requireNonNegative(
    "recoveryTargetUsdcPerNaraWad",
    recoveryTargetUsdcPerNaraWad
  );
  requireNonNegative("minEdgeBps", minEdgeBps);

  const entryNetUsdcPerNaraWad =
    quotedNaraOut === 0n
      ? null
      : ceilDiv(budgetUsdc * NARA_PRICE_TO_USDC_ATOMIC_DIVISOR, quotedNaraOut);
  const recoveryValueUsdc = calculateDumpUsdcValue(
    quotedNaraOut,
    recoveryTargetUsdcPerNaraWad
  );
  const profitIfRecoveryUsdc = recoveryValueUsdc - budgetUsdc;
  const edgeBps = conservativeSignedRatio(
    profitIfRecoveryUsdc * BPS,
    budgetUsdc
  );
  const verdict = classifyFloorDefenseVerdict(
    budgetUsdc,
    quotedNaraOut,
    edgeBps,
    minEdgeBps
  );

  return {
    entryNetUsdcPerNaraWad,
    recoveryValueUsdc,
    profitIfRecoveryUsdc,
    edgeBps,
    verdict,
  };
}
