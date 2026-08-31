/**
 * Deterministic optimizer for exact-fork treasury range results.
 *
 * Candidate generation is exact bigint math. A deployment candidate is never
 * selected without complete exact-fork measurements for the required scenario
 * matrix. Funding is reported separately and can block construction even when
 * a strategy is analytically selected.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import hre from "hardhat";
import {
  BPS,
  NARA_UNIT,
  TREASURY_RANGE_CANARY_CANDIDATE_ID,
  TREASURY_RANGE_CANARY_EXPOSED_USDC,
  TREASURY_RANGE_CANARY_NARA_BUDGET,
  TREASURY_RANGE_CANARY_PROTECTED_USDC,
  TREASURY_RANGE_MINIMUM_PROTECTED_USDC_BPS,
  TREASURY_RANGE_NOMINAL_USDC_BUDGET,
  USDC_UNIT,
  rescaleStrategyProfile,
  serializePlannedRange,
  type PlannedStrategyProfile,
  type StrategyProfileName,
} from "./lib/v4TreasuryRangePlanner.js";
import { readV4TreasuryRangeState } from "./lib/v4TreasuryRangeState.js";
import {
  buildTreasuryRangeScenarioPlan,
  currentRepositoryHead,
  finalizeTreasuryRangeProfile,
} from "./simulateV4TreasuryRanges.js";
import {
  assertTreasuryRangeCandidateEvidence,
  REQUIRED_TREASURY_BUY_SIZES_USDC,
  type TreasuryRangeEvidenceBinding,
} from "./lib/v4TreasuryRangeEvidence.js";

export const REQUIRED_NARA_BUDGETS = [15_000n, 25_000n, 35_000n, 45_000n, 60_000n, 75_000n, 100_000n] as const;
export const REQUIRED_STRATEGY_PROFILE_NAMES = ["CONSERVATIVE", "AGGRESSIVE", "ADVERSARIAL"] as const satisfies readonly StrategyProfileName[];
export const REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT =
  REQUIRED_STRATEGY_PROFILE_NAMES.length * REQUIRED_NARA_BUDGETS.length;

export type ExactForkCandidateMetrics = Readonly<{
  candidateId: string;
  exactForkValidated: boolean;
  exactInputOnly: boolean;
  scenarioCoverage: readonly string[];
  buySizeCoverageUsdc: readonly string[];
  independentSellSizeCoverageNara: readonly string[];
  acquiredSellFractionCoverageBps: readonly string[];
  matrixHash: string;
  matrix: readonly Readonly<Record<string, unknown>>[];
  normalBuyExecution: Readonly<Record<string, boolean>>;
  crystallizedUsdc: bigint;
  treasuryNaraAccumulated: bigint;
  nearMarketNaraSold: bigint;
  nextTransactionRoundTripLossUsdc: bigint;
  maximumObservedSlippageBps: bigint;
  quoteFailures: bigint;
}>;

export type OptimizerCandidate = Readonly<{
  candidateId: string;
  profile: PlannedStrategyProfile;
  manifest: unknown;
  naraBudget: bigint;
  metrics?: ExactForkCandidateMetrics;
  hardGates: Readonly<{
    approvedCanaryCandidate: boolean;
    exactApprovedCanaryAllocation: boolean;
    exactCanaryUsdcBudget: boolean;
    majorityUsdcProtected: boolean;
    routeContinuity: boolean;
    oneSidedTwentyPercent: boolean;
    exactInputOnly: boolean;
    exactForkScenarioCoverage: boolean;
  }>;
  hardGatePass: boolean;
  safeFunding: Readonly<{
    safeExposedUsdcShortfall: bigint;
    safeUsdcShortfall: bigint;
    safeNaraShortfall: bigint;
    treasuryUsdcShortfall: bigint;
    treasuryNaraShortfall: bigint;
    buildRefusedUntilSafeFunded: boolean;
  }>;
  paretoOptimal: boolean;
}>;

export type OptimizerResult = Readonly<{
  candidates: readonly OptimizerCandidate[];
  pareto: readonly OptimizerCandidate[];
  selectedCandidateId: string | null;
  selectionStatus: "SELECTED_EXECUTION_BLOCKED" | "SELECTED_BUILDABLE" | "BLOCKED_EXACT_FORK_RESULTS_REQUIRED";
  selectionRule: string;
}>;

function shortfall(required: bigint, available: bigint): bigint {
  return required > available ? required - available : 0n;
}

function candidateId(profile: StrategyProfileName, naraBudget: bigint): string {
  return `${profile}-${naraBudget / NARA_UNIT}-NARA`;
}

function requiredCandidateIds(baseProfiles: readonly PlannedStrategyProfile[]): ReadonlySet<string> {
  const suppliedNames = baseProfiles.map((profile) => profile.name);
  const suppliedNameSet = new Set(suppliedNames);
  if (suppliedNames.length !== REQUIRED_STRATEGY_PROFILE_NAMES.length
      || suppliedNameSet.size !== REQUIRED_STRATEGY_PROFILE_NAMES.length
      || !REQUIRED_STRATEGY_PROFILE_NAMES.every((name) => suppliedNameSet.has(name))) {
    throw new Error(`Optimizer requires exactly the canonical profiles: ${REQUIRED_STRATEGY_PROFILE_NAMES.join(", ")}`);
  }
  const ids = new Set<string>();
  for (const profile of baseProfiles) {
    for (const rawBudget of REQUIRED_NARA_BUDGETS) {
      const id = candidateId(profile.name, rawBudget * NARA_UNIT);
      if (ids.has(id)) throw new Error(`Duplicate canonical optimizer candidate ${id}`);
      ids.add(id);
    }
  }
  if (ids.size !== REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT) {
    throw new Error(`Optimizer requires exactly ${REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT} canonical candidates`);
  }
  return ids;
}

function hasExactCandidateMetrics(
  expectedIds: ReadonlySet<string>,
  metrics: ReadonlyMap<string, ExactForkCandidateMetrics>,
): boolean {
  if (metrics.size !== expectedIds.size) return false;
  for (const id of expectedIds) {
    if (metrics.get(id)?.candidateId !== id) return false;
  }
  for (const id of metrics.keys()) {
    if (!expectedIds.has(id)) return false;
  }
  return true;
}

function routeContinuity(metrics: ExactForkCandidateMetrics | undefined): boolean {
  if (!metrics) return false;
  return REQUIRED_TREASURY_BUY_SIZES_USDC
    .filter((size) => size <= 250n)
    .every((size) => metrics.normalBuyExecution[size.toString()] === true);
}

function dominates(a: OptimizerCandidate, b: OptimizerCandidate): boolean {
  if (!a.metrics || !b.metrics) return false;
  const noWorse = a.metrics.crystallizedUsdc >= b.metrics.crystallizedUsdc
    && a.metrics.treasuryNaraAccumulated >= b.metrics.treasuryNaraAccumulated
    && a.metrics.nextTransactionRoundTripLossUsdc >= b.metrics.nextTransactionRoundTripLossUsdc
    && a.metrics.nearMarketNaraSold <= b.metrics.nearMarketNaraSold
    && a.metrics.maximumObservedSlippageBps <= b.metrics.maximumObservedSlippageBps
    && a.profile.exposedUsdcInput <= b.profile.exposedUsdcInput;
  const strictlyBetter = a.metrics.crystallizedUsdc > b.metrics.crystallizedUsdc
    || a.metrics.treasuryNaraAccumulated > b.metrics.treasuryNaraAccumulated
    || a.metrics.nextTransactionRoundTripLossUsdc > b.metrics.nextTransactionRoundTripLossUsdc
    || a.metrics.nearMarketNaraSold < b.metrics.nearMarketNaraSold
    || a.metrics.maximumObservedSlippageBps < b.metrics.maximumObservedSlippageBps
    || a.profile.exposedUsdcInput < b.profile.exposedUsdcInput;
  return noWorse && strictlyBetter;
}

function deterministicSelectionOrder(a: OptimizerCandidate, b: OptimizerCandidate): number {
  const metricsA = a.metrics!;
  const metricsB = b.metrics!;
  const comparisons: readonly [bigint, bigint, "higher" | "lower"][] = [
    [metricsA.maximumObservedSlippageBps, metricsB.maximumObservedSlippageBps, "lower"],
    [metricsA.nextTransactionRoundTripLossUsdc, metricsB.nextTransactionRoundTripLossUsdc, "higher"],
    [metricsA.crystallizedUsdc, metricsB.crystallizedUsdc, "higher"],
    [metricsA.nearMarketNaraSold, metricsB.nearMarketNaraSold, "lower"],
    [a.profile.protectedUsdc, b.profile.protectedUsdc, "higher"],
    [metricsA.treasuryNaraAccumulated, metricsB.treasuryNaraAccumulated, "higher"],
    [a.naraBudget, b.naraBudget, "lower"],
  ];
  for (const [left, right, preference] of comparisons) {
    if (left === right) continue;
    if (preference === "higher") return left > right ? -1 : 1;
    return left < right ? -1 : 1;
  }
  return a.candidateId.localeCompare(b.candidateId);
}

export function optimizeTreasuryRanges(params: {
  baseProfiles: readonly PlannedStrategyProfile[];
  metrics: ReadonlyMap<string, ExactForkCandidateMetrics>;
  evidenceBinding: Omit<TreasuryRangeEvidenceBinding, "candidateId">;
  safeBalances: Readonly<{ nara: bigint; usdc: bigint }>;
  treasuryBalances: Readonly<{ nara: bigint; usdc: bigint }>;
  finalizeProfile: (
    profile: PlannedStrategyProfile,
    metrics: ExactForkCandidateMetrics | undefined,
  ) => Readonly<{ profile: PlannedStrategyProfile; manifest: unknown }>;
}): OptimizerResult {
  const expectedCandidateIds = requiredCandidateIds(params.baseProfiles);
  const candidateMetricsComplete = hasExactCandidateMetrics(expectedCandidateIds, params.metrics);
  const candidateEvidenceComplete = candidateMetricsComplete && [...expectedCandidateIds].every((id) => {
    const metrics = params.metrics.get(id);
    if (!metrics) return false;
    try {
      assertTreasuryRangeCandidateEvidence(metrics, { ...params.evidenceBinding, candidateId: id });
      return true;
    } catch {
      return false;
    }
  });
  const draft: OptimizerCandidate[] = [];
  for (const baseProfile of params.baseProfiles) {
    for (const rawBudget of REQUIRED_NARA_BUDGETS) {
      const naraBudget = rawBudget * NARA_UNIT;
      const draftProfile = rescaleStrategyProfile(baseProfile, naraBudget);
      const id = candidateId(draftProfile.name, naraBudget);
      const metrics = candidateEvidenceComplete ? params.metrics.get(id) : undefined;
      const { profile, manifest } = params.finalizeProfile(draftProfile, metrics);
      const candidateTotalUsdc = profile.exposedUsdcInput + profile.protectedUsdc;
      const hardGates = {
        approvedCanaryCandidate: id === TREASURY_RANGE_CANARY_CANDIDATE_ID,
        exactApprovedCanaryAllocation: profile.name === "CONSERVATIVE"
          && naraBudget === TREASURY_RANGE_CANARY_NARA_BUDGET
          && profile.totalNaraInput === TREASURY_RANGE_CANARY_NARA_BUDGET
          && profile.exposedUsdcInput === TREASURY_RANGE_CANARY_EXPOSED_USDC
          && profile.protectedUsdc === TREASURY_RANGE_CANARY_PROTECTED_USDC,
        exactCanaryUsdcBudget: candidateTotalUsdc === TREASURY_RANGE_NOMINAL_USDC_BUDGET,
        majorityUsdcProtected: profile.protectedUsdc * BPS
          >= candidateTotalUsdc * TREASURY_RANGE_MINIMUM_PROTECTED_USDC_BPS,
        routeContinuity: routeContinuity(metrics),
        oneSidedTwentyPercent: profile.twentyPercentBandCompatible,
        exactInputOnly: metrics?.exactInputOnly === true,
        exactForkScenarioCoverage: metrics !== undefined,
      };
      const safeExposedUsdcShortfall = shortfall(profile.exposedUsdcInput, params.safeBalances.usdc);
      const safeUsdcShortfall = shortfall(candidateTotalUsdc, params.safeBalances.usdc);
      const safeNaraShortfall = shortfall(naraBudget, params.safeBalances.nara);
      draft.push({
        candidateId: id,
        profile,
        manifest,
        naraBudget,
        metrics,
        hardGates,
        hardGatePass: Object.values(hardGates).every(Boolean),
        safeFunding: {
          safeExposedUsdcShortfall,
          safeUsdcShortfall,
          safeNaraShortfall,
          treasuryUsdcShortfall: shortfall(candidateTotalUsdc, params.treasuryBalances.usdc),
          treasuryNaraShortfall: shortfall(naraBudget, params.treasuryBalances.nara),
          buildRefusedUntilSafeFunded: safeUsdcShortfall > 0n || safeNaraShortfall > 0n,
        },
        paretoOptimal: false,
      });
    }
  }
  const gated = candidateEvidenceComplete ? draft.filter((candidate) => candidate.hardGatePass) : [];
  const paretoIds = new Set(gated
    .filter((candidate) => !gated.some((other) => other !== candidate && dominates(other, candidate)))
    .map((candidate) => candidate.candidateId));
  const candidates = draft.map((candidate) => ({ ...candidate, paretoOptimal: paretoIds.has(candidate.candidateId) }));
  const pareto = candidates.filter((candidate) => candidate.paretoOptimal).sort(deterministicSelectionOrder);
  const selected = pareto[0];
  if (!selected) {
    return {
      candidates,
      pareto,
      selectedCandidateId: null,
      selectionStatus: "BLOCKED_EXACT_FORK_RESULTS_REQUIRED",
      selectionRule: `No selection until metrics contain exactly the ${REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT} canonical candidate IDs and the approved ${TREASURY_RANGE_CANARY_CANDIDATE_ID} passes every hard gate.`,
    };
  }
  return {
    candidates,
    pareto,
    selectedCandidateId: selected.candidateId,
    selectionStatus: selected.safeFunding.buildRefusedUntilSafeFunded
      ? "SELECTED_EXECUTION_BLOCKED"
      : "SELECTED_BUILDABLE",
    selectionRule: `Human-approved ${TREASURY_RANGE_CANARY_CANDIDATE_ID} only, after complete 21-candidate evidence and every hard gate.`,
  };
}

export function parseExactForkCandidateMetrics(raw: unknown): ReadonlyMap<string, ExactForkCandidateMetrics> {
  if (!Array.isArray(raw)) throw new Error("Metrics JSON must be an array");
  const parsed = new Map<string, ExactForkCandidateMetrics>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid metrics entry");
    const value = item as Record<string, unknown>;
    const text = (key: string) => {
      if (typeof value[key] !== "string") throw new Error(`Metrics ${key} must be a string`);
      return value[key] as string;
    };
    const unsigned = (key: string) => {
      const rawValue = text(key);
      if (!/^\d+$/.test(rawValue)) throw new Error(`Metrics ${key} must be an unsigned integer string`);
      return BigInt(rawValue);
    };
    const boolean = (key: string) => {
      if (typeof value[key] !== "boolean") throw new Error(`Metrics ${key} must be boolean`);
      return value[key] as boolean;
    };
    const strings = (key: string) => {
      if (!Array.isArray(value[key]) || !(value[key] as unknown[]).every((entry) => typeof entry === "string")) {
        throw new Error(`Metrics ${key} must be a string array`);
      }
      return value[key] as string[];
    };
    const normalBuyExecution = value.normalBuyExecution;
    if (!normalBuyExecution || typeof normalBuyExecution !== "object" || Array.isArray(normalBuyExecution)) {
      throw new Error("Metrics normalBuyExecution must be an object");
    }
    const normal: Record<string, boolean> = {};
    for (const [size, success] of Object.entries(normalBuyExecution)) {
      if (!/^\d+$/.test(size) || typeof success !== "boolean") throw new Error("Invalid normal-buy result");
      normal[size] = success;
    }
    const entry: ExactForkCandidateMetrics = {
      candidateId: text("candidateId"),
      exactForkValidated: boolean("exactForkValidated"),
      exactInputOnly: boolean("exactInputOnly"),
      scenarioCoverage: strings("scenarioCoverage"),
      buySizeCoverageUsdc: strings("buySizeCoverageUsdc"),
      independentSellSizeCoverageNara: strings("independentSellSizeCoverageNara"),
      acquiredSellFractionCoverageBps: strings("acquiredSellFractionCoverageBps"),
      matrixHash: (() => {
        const parsed = text("matrixHash").toLowerCase();
        if (!ethers.isHexString(parsed, 32)) throw new Error("Metrics matrixHash must be bytes32");
        return parsed;
      })(),
      matrix: (() => {
        if (!Array.isArray(value.matrix)
            || !value.matrix.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
          throw new Error("Metrics matrix must be an object array");
        }
        return value.matrix as Readonly<Record<string, unknown>>[];
      })(),
      normalBuyExecution: normal,
      crystallizedUsdc: unsigned("crystallizedUsdc"),
      treasuryNaraAccumulated: unsigned("treasuryNaraAccumulated"),
      nearMarketNaraSold: unsigned("nearMarketNaraSold"),
      nextTransactionRoundTripLossUsdc: unsigned("nextTransactionRoundTripLossUsdc"),
      maximumObservedSlippageBps: unsigned("maximumObservedSlippageBps"),
      quoteFailures: unsigned("quoteFailures"),
    };
    if (parsed.has(entry.candidateId)) throw new Error(`Duplicate metrics for ${entry.candidateId}`);
    parsed.set(entry.candidateId, entry);
  }
  return parsed;
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

async function main(): Promise<void> {
  const pinnedRaw = process.env.V4_TREASURY_FORK_BLOCK?.trim();
  if (!pinnedRaw || !/^\d+$/.test(pinnedRaw)) throw new Error("V4_TREASURY_FORK_BLOCK is required");
  const pinnedBlock = BigInt(pinnedRaw);
  const connection = await hre.network.connect("baseFork") as unknown as {
    ethers: { provider: ethers.JsonRpcApiProvider };
    networkName: string;
  };
  if (connection.networkName !== "baseFork") throw new Error("Optimizer state must come from baseFork");
  const latest = await connection.ethers.provider.getBlock("latest");
  if (!latest || BigInt(latest.number) !== pinnedBlock) throw new Error("baseFork does not match the required pin");
  const state = await readV4TreasuryRangeState(connection.ethers.provider, { blockNumber: pinnedBlock });
  const repositoryHead = currentRepositoryHead();
  const plan = buildTreasuryRangeScenarioPlan(state, BigInt(latest.timestamp) + 3_600n, repositoryHead);
  const metricsPath = argument("--metrics");
  const metrics = metricsPath ? parseExactForkCandidateMetrics(JSON.parse(readFileSync(metricsPath, "utf8"))) : new Map();
  const result = optimizeTreasuryRanges({
    baseProfiles: plan.profiles,
    metrics,
    evidenceBinding: {
      repositoryHead,
      chainId: state.chainId,
      blockNumber: state.blockNumber,
      blockHash: state.blockHash,
      currentSqrtPriceX96: state.sqrtPriceX96,
      currentTick: state.tick,
      hookConfigurationHash: plan.hookConfigurationHash,
      humanUsdcPerNara: state.humanUsdcPerNaraRational,
    },
    safeBalances: state.safeBalances,
    treasuryBalances: state.treasuryBalances,
    finalizeProfile: (profile, evidence) => finalizeTreasuryRangeProfile({
      state,
      profile,
      hookConfiguration: plan.hookConfiguration,
      hookConfigurationHash: plan.hookConfigurationHash,
      repositoryHead,
      simulationEvidence: evidence,
    }),
  });
  console.log(JSON.stringify(jsonSafe({
    pinnedBlock: state.blockNumber,
    blockHash: state.blockHash,
    hookConfiguration: plan.hookConfiguration,
    hookConfigurationHash: plan.hookConfigurationHash,
    nominalUsdcBudget: TREASURY_RANGE_NOMINAL_USDC_BUDGET.toString(),
    custody: {
      safe: state.safeBalances,
      treasury: state.treasuryBalances,
      neverSubstituteTreasuryForSafe: true,
    },
    selectionStatus: result.selectionStatus,
    selectedCandidateId: result.selectedCandidateId,
    selectionRule: result.selectionRule,
    pareto: result.pareto.map((candidate) => ({
      candidateId: candidate.candidateId,
      profile: candidate.profile.name,
      naraBudget: candidate.naraBudget,
      protectedUsdc: candidate.profile.protectedUsdc,
      exposedUsdc: candidate.profile.exposedUsdcInput,
      metrics: candidate.metrics,
      safeFunding: candidate.safeFunding,
    })),
    candidates: result.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      profile: candidate.profile.name,
      strategyHash: candidate.profile.strategyHash,
      naraBudget: candidate.naraBudget,
      protectedUsdc: candidate.profile.protectedUsdc,
      exposedUsdc: candidate.profile.exposedUsdcInput,
      hardGates: candidate.hardGates,
      hardGatePass: candidate.hardGatePass,
      paretoOptimal: candidate.paretoOptimal,
      safeFunding: candidate.safeFunding,
      metrics: candidate.metrics,
      manifest: candidate.manifest,
      orders: candidate.profile.orders.map(serializePlannedRange),
    })),
  }), null, 2));
}

const invoked = process.argv[1]?.replace(/\\/g, "/").endsWith("/optimizeV4TreasuryRanges.ts");
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
