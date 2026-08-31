/**
 * Deterministic optimizer for exact-fork treasury range results.
 *
 * Candidate generation is exact bigint math. A deployment candidate is never
 * selected without complete exact-fork measurements for the required scenario
 * matrix. Funding is reported separately and can block construction even when
 * a strategy is analytically selected.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
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
import {
  readV4TreasuryRangeState,
  type V4TreasuryRangeStateOptions,
} from "./lib/v4TreasuryRangeState.js";
import {
  buildTreasuryRangeScenarioPlan,
  finalizeTreasuryRangeProfile,
} from "./simulateV4TreasuryRanges.js";
import {
  assertTreasuryRangeCandidateEvidence,
  REQUIRED_TREASURY_BUY_SIZES_USDC,
  type TreasuryRangeEvidenceBinding,
} from "./lib/v4TreasuryRangeEvidence.js";
import {
  assertTreasuryRangeCanaryLaunchManifest,
  parseTreasuryRangeStrategyManifest,
  prettyTreasuryRangeJson,
  sha256Hex,
} from "./lib/v4TreasuryRangeManifest.js";
import {
  parseTreasuryRangeManagerDeploymentEvidence,
  type TreasuryRangeManagerDeploymentEvidence,
} from "./lib/v4TreasuryRangeSafeBuilder.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  treasuryRangeSafeFunding: Readonly<{
    treasuryRangeSafeExposedUsdcShortfall: bigint;
    treasuryRangeSafeUsdcShortfall: bigint;
    treasuryRangeSafeNaraShortfall: bigint;
    treasuryUsdcShortfall: bigint;
    treasuryNaraShortfall: bigint;
    buildRefusedUntilTreasuryRangeSafeFunded: boolean;
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

export type PostDeploymentManagerBinding = Readonly<{
  evidence: TreasuryRangeManagerDeploymentEvidence;
  reference: Readonly<{
    manifestPath: string;
    manifestSha256: string;
  }>;
}>;

function repositoryPath(
  repositoryRoot: string,
  requestedPath: string,
  label: string,
): Readonly<{ absolute: string; relative: string }> {
  if (requestedPath.trim() === "") throw new Error(`${label} path must be explicit`);
  const absolute = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(repositoryRoot, requestedPath);
  const local = relative(repositoryRoot, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`${label} must remain inside the authoritative repository`);
  }
  return { absolute, relative: local.split(sep).join("/") };
}

function git(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function readRepositoryHead(repositoryRoot: string): string {
  const head = git(repositoryRoot, ["rev-parse", "HEAD"]).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("Repository HEAD is not a full 40-character Git commit");
  return head;
}

export function loadTrackedPostDeploymentManagerEvidence(
  repositoryRoot: string,
  requestedPath: string,
): PostDeploymentManagerBinding {
  const path = repositoryPath(repositoryRoot, requestedPath, "Manager deployment evidence");
  try {
    git(repositoryRoot, ["ls-files", "--error-unmatch", "--", path.relative]);
  } catch {
    throw new Error("Manager deployment evidence must be tracked by Git");
  }
  try {
    execFileSync("git", ["diff", "--quiet", "--", path.relative], { cwd: repositoryRoot, stdio: "ignore" });
    execFileSync("git", ["diff", "--cached", "--quiet", "--", path.relative], { cwd: repositoryRoot, stdio: "ignore" });
  } catch {
    throw new Error("Tracked manager deployment evidence must exactly match repository HEAD");
  }
  const raw = readFileSync(path.absolute, "utf8");
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("Manager deployment evidence is not valid JSON");
  }
  const evidence = parseTreasuryRangeManagerDeploymentEvidence(decoded);
  if (evidence.predictedAddress !== evidence.deployedAddress
      || evidence.create2Deployment.deployedAddress !== evidence.deployedAddress
      || evidence.deploymentExecutorSafeExecution.transactionHash !== evidence.deploymentTransactionHash) {
    throw new Error("Manager deployment evidence is not internally receipt-bound to one deployed address/transaction");
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", evidence.originCommit, readRepositoryHead(repositoryRoot)], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } catch {
    throw new Error("Manager deployment origin commit is not an ancestor of repository HEAD");
  }
  return {
    evidence,
    reference: {
      manifestPath: path.relative,
      manifestSha256: sha256Hex(raw.replace(/\r\n/g, "\n")),
    },
  };
}

export function postDeploymentStateOptions(
  blockNumber: bigint,
  managerBinding?: PostDeploymentManagerBinding,
): V4TreasuryRangeStateOptions {
  return {
    blockNumber,
    ...(managerBinding === undefined ? {} : {
      managerAddress: managerBinding.evidence.deployedAddress,
      managerRuntimeCodeHash: managerBinding.evidence.runtimeCodeHash,
    }),
  };
}

export function writeSelectedPostDeploymentStrategy(params: {
  repositoryRoot: string;
  outputPath: string;
  result: OptimizerResult;
  managerBinding: PostDeploymentManagerBinding;
}): Readonly<{ outputPath: string; strategyHash: string }> {
  if (params.result.selectionStatus !== "SELECTED_BUILDABLE") {
    throw new Error("Post-deployment strategy output requires selectionStatus SELECTED_BUILDABLE");
  }
  if (params.result.selectedCandidateId !== TREASURY_RANGE_CANARY_CANDIDATE_ID) {
    throw new Error(`Post-deployment strategy output is restricted to ${TREASURY_RANGE_CANARY_CANDIDATE_ID}`);
  }
  const matches = params.result.candidates.filter(
    (candidate) => candidate.candidateId === TREASURY_RANGE_CANARY_CANDIDATE_ID,
  );
  if (matches.length !== 1 || !matches[0].hardGatePass
      || !Object.values(matches[0].hardGates).every(Boolean)) {
    throw new Error("Optimizer result must contain exactly one hard-gate-passing approved canary");
  }
  const selected = matches[0];
  if (selected.profile.name !== "CONSERVATIVE"
      || selected.naraBudget !== TREASURY_RANGE_CANARY_NARA_BUDGET
      || selected.profile.totalNaraInput !== TREASURY_RANGE_CANARY_NARA_BUDGET
      || selected.profile.exposedUsdcInput !== TREASURY_RANGE_CANARY_EXPOSED_USDC
      || selected.profile.protectedUsdc !== TREASURY_RANGE_CANARY_PROTECTED_USDC) {
    throw new Error("Selected optimizer candidate does not preserve the canonical approved canary allocation");
  }
  const manifest = parseTreasuryRangeStrategyManifest(selected.manifest);
  assertTreasuryRangeCanaryLaunchManifest(manifest);
  if (selected.profile.strategyHash !== manifest.strategyHash
      || selected.profile.orders.some((order) => order.strategyHash !== manifest.strategyHash)) {
    throw new Error("Selected optimizer profile is not stamped with the emitted strategy manifest hash");
  }
  if (manifest.managerDeployment?.manifestPath !== params.managerBinding.reference.manifestPath
      || manifest.managerDeployment.manifestSha256 !== params.managerBinding.reference.manifestSha256) {
    throw new Error("Selected strategy does not hash-pin the consumed manager deployment evidence");
  }
  if (manifest.addresses.treasuryRangeManager !== params.managerBinding.evidence.deployedAddress
      || manifest.runtimeCodeHashes.rangeManager !== params.managerBinding.evidence.runtimeCodeHash) {
    throw new Error("Selected strategy manager address/runtime does not match deployment evidence");
  }
  const output = repositoryPath(params.repositoryRoot, params.outputPath, "Post-deployment strategy output");
  try {
    writeFileSync(output.absolute, prettyTreasuryRangeJson(manifest), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Post-deployment strategy output already exists; refusing to overwrite it");
    }
    throw error;
  }
  return { outputPath: output.relative, strategyHash: manifest.strategyHash };
}

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
  treasuryRangeSafeBalances: Readonly<{ nara: bigint; usdc: bigint }>;
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
      const treasuryRangeSafeExposedUsdcShortfall = shortfall(
        profile.exposedUsdcInput,
        params.treasuryRangeSafeBalances.usdc,
      );
      const treasuryRangeSafeUsdcShortfall = shortfall(
        candidateTotalUsdc,
        params.treasuryRangeSafeBalances.usdc,
      );
      const treasuryRangeSafeNaraShortfall = shortfall(naraBudget, params.treasuryRangeSafeBalances.nara);
      draft.push({
        candidateId: id,
        profile,
        manifest,
        naraBudget,
        metrics,
        hardGates,
        hardGatePass: Object.values(hardGates).every(Boolean),
        treasuryRangeSafeFunding: {
          treasuryRangeSafeExposedUsdcShortfall,
          treasuryRangeSafeUsdcShortfall,
          treasuryRangeSafeNaraShortfall,
          treasuryUsdcShortfall: shortfall(candidateTotalUsdc, params.treasuryBalances.usdc),
          treasuryNaraShortfall: shortfall(naraBudget, params.treasuryBalances.nara),
          buildRefusedUntilTreasuryRangeSafeFunded:
            treasuryRangeSafeUsdcShortfall > 0n || treasuryRangeSafeNaraShortfall > 0n,
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
    selectionStatus: selected.treasuryRangeSafeFunding.buildRefusedUntilTreasuryRangeSafeFunded
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
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length > 1) throw new Error(`${name} may be supplied only once`);
  if (indexes.length === 0) return undefined;
  const value = process.argv[indexes[0] + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires an explicit value`);
  return value;
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

async function main(): Promise<void> {
  const postDeployment = process.argv.includes("--post-deployment");
  const metricsPath = argument("--metrics");
  const deploymentEvidencePath = argument("--deployment-evidence");
  const outputPath = argument("--output");
  if (postDeployment && (!metricsPath || !deploymentEvidencePath || !outputPath)) {
    throw new Error("Post-deployment mode requires explicit --metrics, --deployment-evidence, and --output paths");
  }
  if (!postDeployment && (deploymentEvidencePath || outputPath)) {
    throw new Error("--deployment-evidence and --output require --post-deployment mode");
  }
  const managerBinding = postDeployment
    ? loadTrackedPostDeploymentManagerEvidence(REPOSITORY_ROOT, deploymentEvidencePath!)
    : undefined;
  const pinnedRaw = process.env.V4_TREASURY_FORK_BLOCK?.trim();
  if (!pinnedRaw || !/^\d+$/.test(pinnedRaw)) throw new Error("V4_TREASURY_FORK_BLOCK is required");
  const pinnedBlock = BigInt(pinnedRaw);
  if (managerBinding && BigInt(managerBinding.evidence.deploymentBlock) > pinnedBlock) {
    throw new Error("Pinned optimizer block predates the receipt-bound manager deployment");
  }
  const connection = await hre.network.connect("baseFork") as unknown as {
    ethers: { provider: ethers.JsonRpcApiProvider };
    networkName: string;
  };
  if (connection.networkName !== "baseFork") throw new Error("Optimizer state must come from baseFork");
  const latest = await connection.ethers.provider.getBlock("latest");
  if (!latest || BigInt(latest.number) !== pinnedBlock) throw new Error("baseFork does not match the required pin");
  const state = await readV4TreasuryRangeState(
    connection.ethers.provider,
    postDeploymentStateOptions(pinnedBlock, managerBinding),
  );
  const repositoryHead = readRepositoryHead(REPOSITORY_ROOT);
  const plan = buildTreasuryRangeScenarioPlan(
    state,
    BigInt(latest.timestamp) + 3_600n,
    repositoryHead,
    managerBinding?.reference,
  );
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
    treasuryRangeSafeBalances: state.treasuryRangeSafeBalances,
    treasuryBalances: state.treasuryBalances,
    finalizeProfile: (profile, evidence) => finalizeTreasuryRangeProfile({
      state,
      profile,
      hookConfiguration: plan.hookConfiguration,
      hookConfigurationHash: plan.hookConfigurationHash,
      repositoryHead,
      managerDeployment: managerBinding?.reference,
      simulationEvidence: evidence,
    }),
  });
  if (postDeployment) {
    const written = writeSelectedPostDeploymentStrategy({
      repositoryRoot: REPOSITORY_ROOT,
      outputPath: outputPath!,
      result,
      managerBinding: managerBinding!,
    });
    console.log(JSON.stringify({
      selectionStatus: result.selectionStatus,
      selectedCandidateId: result.selectedCandidateId,
      deploymentEvidence: managerBinding!.reference,
      outputPath: written.outputPath,
      strategyHash: written.strategyHash,
      noBroadcast: true,
    }, null, 2));
    return;
  }
  console.log(JSON.stringify(jsonSafe({
    pinnedBlock: state.blockNumber,
    blockHash: state.blockHash,
    hookConfiguration: plan.hookConfiguration,
    hookConfigurationHash: plan.hookConfigurationHash,
    nominalUsdcBudget: TREASURY_RANGE_NOMINAL_USDC_BUDGET.toString(),
    custody: {
      treasuryRangeSafe: state.treasuryRangeSafeBalances,
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
      treasuryRangeSafeFunding: candidate.treasuryRangeSafeFunding,
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
      treasuryRangeSafeFunding: candidate.treasuryRangeSafeFunding,
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
