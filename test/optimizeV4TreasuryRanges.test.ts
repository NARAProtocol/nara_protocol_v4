import { expect } from "chai";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ethers } from "ethers";
import {
  NARA_UNIT,
  TREASURY_RANGE_CANARY_CANDIDATE_ID,
  TREASURY_RANGE_CANARY_EXPOSED_USDC,
  TREASURY_RANGE_CANARY_NARA_BUDGET,
  TREASURY_RANGE_CANARY_PROTECTED_USDC,
  TREASURY_RANGE_NOMINAL_USDC_BUDGET,
  buildDeterministicStrategyProfiles,
  rescaleStrategyProfile,
  serializePlannedRange,
  stampStrategyHash,
} from "../scripts/lib/v4TreasuryRangePlanner.js";
import {
  humanUsdcPerNaraToSqrtPriceX96,
  parseDecimalRational,
} from "../scripts/lib/v4TreasuryRangeMath.js";
import {
  assertTreasuryRangeQuoteEvidence,
  bindTreasuryRangeMatrixRows,
  REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS,
  REQUIRED_TREASURY_BUY_SIZES_USDC,
  REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA,
  TREASURY_RANGE_MATRIX_QUOTE_POLICY,
  TREASURY_RANGE_MATRIX_ROUTE_KIND,
  TREASURY_RANGE_MATRIX_ROW_SCHEMA,
  type TreasuryRangeEvidenceBinding,
  type TreasuryRangeQuoteEvidence,
  type TreasuryRangeUnquotedAdversarialReason,
} from "../scripts/lib/v4TreasuryRangeEvidence.js";
import {
  REQUIRED_NARA_BUDGETS,
  REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT,
  loadTrackedPostDeploymentManagerEvidence,
  optimizeTreasuryRanges,
  parseExactForkCandidateMetrics,
  postDeploymentStateOptions,
  writeSelectedPostDeploymentStrategy,
  type ExactForkCandidateMetrics,
  type OptimizerResult,
  type PostDeploymentManagerBinding,
} from "../scripts/optimizeV4TreasuryRanges.js";
import {
  sha256Hex,
  treasuryRangeHookConfigurationHash,
  treasuryRangeStrategyHash,
} from "../scripts/lib/v4TreasuryRangeManifest.js";
import { canonicalProductionV4Deployment } from "../scripts/lib/v4LiveConfig.js";
import { canonicalTreasuryRangeAuthorities } from "../scripts/lib/v4TreasuryRangeConfig.js";
import {
  BASE_MULTICALL3,
  CIRCLE_FIAT_TOKEN_ADMIN_SLOT,
  CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA,
  CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT,
  CIRCLE_FIAT_TOKEN_PROXY_MECHANISM,
  treasuryRangeUsdcMonitoredAccounts,
} from "../scripts/lib/v4UsdcDependency.js";

const POST_DEPLOYMENT_MANAGER = "0x1000000000000000000000000000000000000001";
const POST_DEPLOYMENT_EXECUTOR_SAFE = "0x2000000000000000000000000000000000000002";
const POST_DEPLOYMENT_TREASURY_SAFE = "0x3000000000000000000000000000000000000003";
const POST_DEPLOYMENT_CREATE2_DEPLOYER = "0x4000000000000000000000000000000000000004";
const POST_DEPLOYMENT_RUNTIME_HASH = `0x${"41".repeat(32)}`;
const POST_DEPLOYMENT_BLOCK_HASH = `0x${"42".repeat(32)}`;

function deploymentEvidenceFixture(originCommit: string): Record<string, unknown> {
  return {
    schemaVersion: "nara.v4.treasury-range-manager-deployment.v3",
    status: "deployed_verified",
    originCommit,
    deploymentTransactionHash: `0x${"43".repeat(32)}`,
    deploymentBlock: 123,
    deploymentBlockHash: POST_DEPLOYMENT_BLOCK_HASH,
    predictedAddress: POST_DEPLOYMENT_MANAGER,
    deployedAddress: POST_DEPLOYMENT_MANAGER,
    runtimeCodeHash: POST_DEPLOYMENT_RUNTIME_HASH,
    deploymentExecutorSafeExecution: {
      safe: POST_DEPLOYMENT_EXECUTOR_SAFE,
      transactionHash: `0x${"43".repeat(32)}`,
      safeTransactionHash: `0x${"44".repeat(32)}`,
      nonce: "7",
      executionSuccessLogIndex: 1,
      safeTransaction: {
        to: POST_DEPLOYMENT_CREATE2_DEPLOYER,
        value: "0",
        data: "0x1234",
        operation: 1,
        safeTxGas: "0",
        baseGas: "0",
        gasPrice: "0",
        gasToken: ethers.ZeroAddress,
        refundReceiver: ethers.ZeroAddress,
        nonce: "7",
      },
      packedTransactionsHash: `0x${"45".repeat(32)}`,
      multiSendCallOnly: "0x5000000000000000000000000000000000000005",
      multiSendCallOnlyCodeHash: `0x${"46".repeat(32)}`,
      innerCalls: [{
        to: POST_DEPLOYMENT_CREATE2_DEPLOYER,
        value: "0",
        data: "0x1234",
      }],
    },
    treasuryRangeSafePolicy: {
      address: POST_DEPLOYMENT_TREASURY_SAFE,
      runtimeCodeHash: `0x${"47".repeat(32)}`,
      version: "1.4.1",
      threshold: "1",
      ownerCount: 1,
      ownerSetHash: `0x${"48".repeat(32)}`,
    },
    create2Deployment: {
      deployer: POST_DEPLOYMENT_CREATE2_DEPLOYER,
      deployedAddress: POST_DEPLOYMENT_MANAGER,
      salt: `0x${"49".repeat(32)}`,
      initCodeHash: `0x${"4a".repeat(32)}`,
      deployedLogIndex: 0,
    },
    constructorBindings: {
      treasurySafe: POST_DEPLOYMENT_TREASURY_SAFE,
      nara: "0x6000000000000000000000000000000000000006",
      usdc: "0x7000000000000000000000000000000000000007",
      liquidityVault: "0x8000000000000000000000000000000000000008",
      poolManager: "0x9000000000000000000000000000000000000009",
      positionManager: "0xA00000000000000000000000000000000000000A",
      permit2: "0xB00000000000000000000000000000000000000B",
      hook: "0xC00000000000000000000000000000000000000C",
      poolFee: 3_000,
      tickSpacing: 60,
      poolId: `0x${"4b".repeat(32)}`,
      deploymentDeadline: "2000000000",
    },
  };
}

function gitAt(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function trackedEvidenceRepository(): Readonly<{
  repositoryRoot: string;
  evidencePath: string;
  raw: string;
}> {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "nara-range-post-deployment-"));
  gitAt(repositoryRoot, ["init", "--quiet"]);
  gitAt(repositoryRoot, ["config", "core.autocrlf", "false"]);
  writeFileSync(join(repositoryRoot, "seed.txt"), "seed\n", "utf8");
  gitAt(repositoryRoot, ["add", "seed.txt"]);
  gitAt(repositoryRoot, [
    "-c", "user.name=NARA Test", "-c", "user.email=nara-test@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "seed",
  ]);
  const originCommit = gitAt(repositoryRoot, ["rev-parse", "HEAD"]);
  const evidencePath = "deployments/manager-deployment.json";
  mkdirSync(join(repositoryRoot, "deployments"));
  const raw = `${JSON.stringify(deploymentEvidenceFixture(originCommit), null, 2)}\n`.replace(/\n/g, "\r\n");
  writeFileSync(join(repositoryRoot, evidencePath), raw, "utf8");
  gitAt(repositoryRoot, ["add", evidencePath]);
  gitAt(repositoryRoot, [
    "-c", "user.name=NARA Test", "-c", "user.email=nara-test@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "deployment evidence",
  ]);
  return { repositoryRoot, evidencePath, raw };
}

function buildablePostDeploymentResult(binding: PostDeploymentManagerBinding): OptimizerResult {
  const deployment = canonicalProductionV4Deployment();
  const authorities = canonicalTreasuryRangeAuthorities(deployment);
  const hookConfiguration = {
    readChecks: [{ label: "hook.fixture", expected: ["1", "2", false] }],
  };
  const hookConfigurationHash = treasuryRangeHookConfigurationHash(hookConfiguration.readChecks);
  const sqrtPriceX96 = humanUsdcPerNaraToSqrtPriceX96(parseDecimalRational("0.0847"));
  const base = buildDeterministicStrategyProfiles({
    currentSqrtPriceX96: sqrtPriceX96,
    creationDeadline: 2_000_000_000n,
    hookConfigurationHash,
    tickSpacing: BigInt(deployment.tickSpacing),
  }).find((profile) => profile.name === "CONSERVATIVE")!;
  const canary = rescaleStrategyProfile(
    base,
    TREASURY_RANGE_CANARY_NARA_BUDGET,
    BigInt(deployment.tickSpacing),
  );
  const proposedOrders = canary.orders.map((order) => {
    const serialized = serializePlannedRange(order);
    return {
      side: order.side,
      humanPriceLower: serialized.requestedLowerUsdcPerNara,
      humanPriceUpper: serialized.requestedUpperUsdcPerNara,
      tickLower: Number(order.tickLower),
      tickUpper: Number(order.tickUpper),
      inputAmountRaw: order.inputAmount.toString(),
      expectedOutputAmountRaw: order.expectedPrincipalOutput.toString(),
      minimumOutputAmountRaw: order.minimumOutputAmount.toString(),
      expectedLiquidity: order.expectedLiquidity.toString(),
      expectedDustNaraRaw: (order.side === "SELL_NARA" ? order.expectedRoundingDust : 0n).toString(),
      expectedDustUsdcRaw: (order.side === "BUY_NARA" ? order.expectedRoundingDust : 0n).toString(),
      toleranceBps: Number(order.toleranceBps),
      enabled: true,
    };
  });
  const monitoredAccounts = treasuryRangeUsdcMonitoredAccounts({
    treasuryRangeSafe: authorities.treasuryRangeSafe,
    poolManager: deployment.poolManager,
    positionManager: deployment.positionManager,
    permit2: deployment.permit2,
    liquidityVault: deployment.vault,
    liquidityCompounder: deployment.compounder,
    rangeManager: binding.evidence.deployedAddress,
  });
  const usdcRuntimeHash = `0x${"51".repeat(32)}`;
  const body = {
    schemaVersion: "nara.v4.treasury-range-strategy.v3",
    status: "candidate_no_broadcast",
    changeId: "NARA-20260831-v4-treasury-range-500-usdc-canary-conservative-100000-nara",
    repositoryHead: "52".repeat(20),
    custodyPolicy: {
      changeId: authorities.custodyPolicyChangeId,
      manifestPath: "deployments/v4-treasury-range-custody-policy-2026-08-31.json",
      manifestSha256: `0x${authorities.custodyPolicySha256}`,
    },
    pinnedState: {
      chainId: "8453",
      blockNumber: 500,
      blockHash: `0x${"53".repeat(32)}`,
      timestamp: 2_000_000_000,
    },
    addresses: {
      deploymentExecutorSafe: authorities.deploymentExecutorSafe,
      treasuryRangeSafe: authorities.treasuryRangeSafe,
      nara: deployment.token,
      usdc: deployment.base,
      hook: deployment.hook,
      poolManager: deployment.poolManager,
      positionManager: deployment.positionManager,
      permit2: deployment.permit2,
      liquidityVault: deployment.vault,
      liquidityCompounder: deployment.compounder,
      universalRouter: deployment.universalRouter,
      officialV4Quoter: "0x1230000000000000000000000000000000000123",
      create2HookDeployer: deployment.create2HookDeployer,
      stateView: "0x1240000000000000000000000000000000000124",
      treasury: deployment.treasury,
      treasuryRangeManager: binding.evidence.deployedAddress,
    },
    runtimeCodeHashes: {
      deploymentExecutorSafe: authorities.deploymentExecutorSafeRuntimeCodeHash,
      treasuryRangeSafe: authorities.treasuryRangeSafeRuntimeCodeHash,
      nara: `0x${"54".repeat(32)}`,
      usdc: usdcRuntimeHash,
      hook: `0x${"55".repeat(32)}`,
      poolManager: `0x${"56".repeat(32)}`,
      positionManager: `0x${"57".repeat(32)}`,
      permit2: `0x${"58".repeat(32)}`,
      liquidityVault: `0x${"59".repeat(32)}`,
      liquidityCompounder: `0x${"5a".repeat(32)}`,
      universalRouter: `0x${"5b".repeat(32)}`,
      officialV4Quoter: `0x${"5c".repeat(32)}`,
      create2HookDeployer: `0x${"5d".repeat(32)}`,
      stateView: `0x${"5e".repeat(32)}`,
      rangeManager: binding.evidence.runtimeCodeHash,
    },
    externalDependencies: {
      usdc: {
        schemaVersion: CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA,
        mechanism: CIRCLE_FIAT_TOKEN_PROXY_MECHANISM,
        proxyAddress: deployment.base,
        implementationSlot: CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT,
        adminSlot: CIRCLE_FIAT_TOKEN_ADMIN_SLOT,
        readerAddress: BASE_MULTICALL3,
        readerRuntimeCodeHash: `0x${"61".repeat(32)}`,
        proxyRuntimeCodeHash: usdcRuntimeHash,
        implementationAddress: "0x1250000000000000000000000000000000000125",
        implementationRuntimeCodeHash: `0x${"62".repeat(32)}`,
        admin: "0x1260000000000000000000000000000000000126",
        owner: "0x1270000000000000000000000000000000000127",
        pauser: "0x1280000000000000000000000000000000000128",
        blacklister: "0x1290000000000000000000000000000000000129",
        paused: false,
        monitoredAccounts: Object.fromEntries(Object.entries(monitoredAccounts).map(([label, address]) => [
          label,
          { address, isBlacklisted: false },
        ])),
      },
    },
    poolId: deployment.poolId,
    poolKey: {
      currency0: deployment.base,
      currency1: deployment.token,
      fee: deployment.poolFee,
      tickSpacing: deployment.tickSpacing,
      hooks: deployment.hook,
    },
    currentSlot0: { sqrtPriceX96: sqrtPriceX96.toString(), tick: 0, protocolFee: 0, lpFee: 0 },
    hookConfiguration,
    hookConfigurationHash,
    pendingHookConfiguration: null,
    existingPositions: [],
    proposedOrders,
    budget: {
      totalNaraAllocatedRaw: TREASURY_RANGE_CANARY_NARA_BUDGET.toString(),
      totalUsdcBudgetRaw: TREASURY_RANGE_NOMINAL_USDC_BUDGET.toString(),
      exposedUsdcRaw: TREASURY_RANGE_CANARY_EXPOSED_USDC.toString(),
      protectedUsdcReserveRaw: TREASURY_RANGE_CANARY_PROTECTED_USDC.toString(),
    },
    simulationMatrix: [],
    managerDeployment: binding.reference,
    noBroadcast: true,
  } as const;
  const strategyHash = treasuryRangeStrategyHash(body as any);
  const manifest = { ...body, strategyHash };
  const profile = stampStrategyHash(canary, strategyHash);
  const candidate = {
    candidateId: TREASURY_RANGE_CANARY_CANDIDATE_ID,
    profile,
    manifest,
    naraBudget: TREASURY_RANGE_CANARY_NARA_BUDGET,
    hardGates: {
      approvedCanaryCandidate: true,
      exactApprovedCanaryAllocation: true,
      exactCanaryUsdcBudget: true,
      majorityUsdcProtected: true,
      routeContinuity: true,
      oneSidedTwentyPercent: true,
      exactInputOnly: true,
      exactForkScenarioCoverage: true,
    },
    hardGatePass: true,
    treasuryRangeSafeFunding: {
      treasuryRangeSafeExposedUsdcShortfall: 0n,
      treasuryRangeSafeUsdcShortfall: 0n,
      treasuryRangeSafeNaraShortfall: 0n,
      treasuryUsdcShortfall: 0n,
      treasuryNaraShortfall: 0n,
      buildRefusedUntilTreasuryRangeSafeFunded: false,
    },
    paretoOptimal: true,
  };
  return {
    candidates: [candidate],
    pareto: [candidate],
    selectedCandidateId: TREASURY_RANGE_CANARY_CANDIDATE_ID,
    selectionStatus: "SELECTED_BUILDABLE",
    selectionRule: "fixture",
  };
}

describe("v4 treasury range optimizer", function () {
  const evidenceBinding: Omit<TreasuryRangeEvidenceBinding, "candidateId"> = {
    repositoryHead: "11".repeat(20),
    chainId: 8453n,
    blockNumber: 50_537_172n,
    blockHash: `0x${"22".repeat(32)}`,
    currentSqrtPriceX96: humanUsdcPerNaraToSqrtPriceX96(parseDecimalRational("1")),
    currentTick: 0n,
    hookConfigurationHash: `0x${"44".repeat(32)}`,
    humanUsdcPerNara: { numerator: 1n, denominator: 1n },
  };
  const transactionHash = (seed: number) => `0x${seed.toString(16).padStart(64, "0")}`;
  const availableQuoteEvidence = (quotedOutputRaw = "1"): TreasuryRangeQuoteEvidence => ({
    status: "available",
    quotedOutputRaw,
  });
  const prefundQuoteEvidence = (): TreasuryRangeQuoteEvidence => ({
    status: "pool_manager_prefund_required",
    quotedOutputRaw: "0",
    errorFingerprint: `0x${"77".repeat(32)}`,
    poolManagerBalanceRaw: "9",
    requiredHookFeeRaw: "10",
  });
  const unquotedQuoteEvidence = (
    reason: TreasuryRangeUnquotedAdversarialReason,
  ): TreasuryRangeQuoteEvidence => ({
    status: "unquoted_adversarial_execution",
    quotedOutputRaw: "0",
    reason,
  });
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
      quoteEvidence: kind === "independent_sell" && size === 50_000n
        ? prefundQuoteEvidence()
        : availableQuoteEvidence(),
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
        executionQuoteEvidence: [
          unquotedQuoteEvidence("same_block_transactions"),
          unquotedQuoteEvidence("same_block_transactions"),
        ],
      },
      {
        scenario: "C", kind: "same_transaction_actions", sizeEachUsdc: "10000", status: "executed",
        transactionHash: transactionHash(seed++),
        transactionBlockNumber: "201", hookFeesRaw: ["1", "2"], gasUsed: "100000",
        executionQuoteEvidence: [
          unquotedQuoteEvidence("same_transaction_actions"),
          unquotedQuoteEvidence("same_transaction_actions"),
        ],
      },
      {
        scenario: "D", kind: "cross_block_pressure_reset",
        transactionStatuses: ["executed", "executed"],
        transactionHashes: [transactionHash(seed++), transactionHash(seed++)],
        transactionBlockNumbers: ["202", "203"], hookFeesRaw: ["1", "1"], blocks: ["202", "203"],
        quoteEvidence: [availableQuoteEvidence(), availableQuoteEvidence()],
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
        buyQuoteEvidence: availableQuoteEvidence(), sellQuoteEvidence: prefundQuoteEvidence(),
      },
      {
        scenario: "F", kind: "atomic_buy_reverse_no_settlement_window", status: "executed",
        transactionHash: transactionHash(seed++),
        transactionBlockNumber: "207", swapCount: 2, limitationObserved: true, gasUsed: "200000",
        sizingQuoteEvidence: availableQuoteEvidence(),
        executionQuoteEvidence: [
          unquotedQuoteEvidence("atomic_buy_reverse"),
          unquotedQuoteEvidence("atomic_buy_reverse"),
        ],
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
        buyQuoteEvidence: availableQuoteEvidence(), sellQuoteEvidence: prefundQuoteEvidence(),
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
        buyQuoteEvidence: availableQuoteEvidence(), sellQuoteEvidence: prefundQuoteEvidence(),
      },
      ...REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS.map((fraction) => ({
        scenario: "G", kind: "acquired_inventory_sell_fraction", fractionBps: fraction.toString(),
        buyStatus: "executed", sellStatus: "executed",
        buyTransactionHash: transactionHash(seed++), buyBlockNumber: String(220 + seed),
        sellTransactionHash: transactionHash(seed++), sellBlockNumber: String(230 + seed),
        acquiredNaraRaw: (10_000n * NARA_UNIT).toString(),
        soldNaraRaw: (10_000n * NARA_UNIT * fraction / 10_000n).toString(), usdcOutputRaw: "1",
        buyQuoteEvidence: availableQuoteEvidence(), sellQuoteEvidence: prefundQuoteEvidence(),
      })),
      {
        scenario: "H", kind: "bid_settlement_after_independent_sell", settledOrderIds: ["2"],
        sellStatus: "executed", settlementStatus: "executed",
        sellTransactionHash: transactionHash(seed++), sellBlockNumber: "240",
        settlementTransactionHash: transactionHash(seed++), settlementBlockNumber: "241",
        treasuryNaraAccumulatedRaw: (5_000n * NARA_UNIT).toString(),
        sellQuoteEvidence: prefundQuoteEvidence(),
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
    treasuryRangeSafeBalances: { nara: 2_070_480n, usdc: 0n },
    treasuryBalances: { nara: 231_654n * NARA_UNIT, usdc: 4_398_903_041n },
    finalizeProfile,
  });

  it("validates exact available, PoolManager-prefund, and unquoted-adversarial evidence", function () {
    expect(assertTreasuryRangeQuoteEvidence(availableQuoteEvidence("123"))).to.deep.equal({
      status: "available",
      quotedOutputRaw: "123",
    });
    expect(assertTreasuryRangeQuoteEvidence(prefundQuoteEvidence())).to.deep.equal(prefundQuoteEvidence());
    expect(assertTreasuryRangeQuoteEvidence(unquotedQuoteEvidence("atomic_buy_reverse")))
      .to.deep.equal(unquotedQuoteEvidence("atomic_buy_reverse"));

    for (const invalid of [
      { status: "available", quotedOutputRaw: "0" },
      { status: "available", quotedOutputRaw: "1", ignored: true },
      { ...prefundQuoteEvidence(), quotedOutputRaw: "1" },
      { ...prefundQuoteEvidence(), errorFingerprint: "0x1234" },
      { ...prefundQuoteEvidence(), poolManagerBalanceRaw: "10" },
      { ...prefundQuoteEvidence(), requiredHookFeeRaw: "0" },
      { ...prefundQuoteEvidence(), status: "rpc_error" },
      { ...unquotedQuoteEvidence("same_block_transactions"), quotedOutputRaw: "1" },
      { ...unquotedQuoteEvidence("same_block_transactions"), reason: "generic_unquoted" },
      { ...unquotedQuoteEvidence("same_block_transactions"), ignored: true },
    ]) {
      expect(() => assertTreasuryRangeQuoteEvidence(invalid)).to.throw();
    }
  });

  it("hash-binds the v4 prefunded route and per-swap quote policy into every matrix row", function () {
    const bound = bindTreasuryRangeMatrixRows({
      ...evidenceBinding,
      candidateId: TREASURY_RANGE_CANARY_CANDIDATE_ID,
    }, rawMatrixRows());
    expect(bound.rows.every((row) => row.schemaVersion === TREASURY_RANGE_MATRIX_ROW_SCHEMA
      && row.routeKind === TREASURY_RANGE_MATRIX_ROUTE_KIND
      && row.quotePolicy === TREASURY_RANGE_MATRIX_QUOTE_POLICY)).to.equal(true);
    expect(() => bindTreasuryRangeMatrixRows({
      ...evidenceBinding,
      candidateId: TREASURY_RANGE_CANARY_CANDIDATE_ID,
    }, [{ ...rawMatrixRows()[0], routeKind: TREASURY_RANGE_MATRIX_ROUTE_KIND }])).to.throw("reserved routeKind");
  });

  it("refuses to choose without complete exact-fork metrics", function () {
    const result = optimizeTreasuryRanges({
      baseProfiles: profiles,
      metrics: new Map(),
      evidenceBinding,
      treasuryRangeSafeBalances: { nara: 0n, usdc: 0n },
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
    const missingBidSettlement = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "H" && row.kind === "bid_settlement_after_independent_sell",
      (row) => {
        const { settlementTransactionHash: _hash, settlementBlockNumber: _block, ...rest } = row;
        return {
          ...rest,
          settlementStatus: "not_applicable",
          settledOrderIds: [],
          treasuryNaraAccumulatedRaw: "0",
        };
      },
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
    const missingSwapQuoteEvidence = metricFixture(candidate, mutateRow(
      (row) => row.kind === "single_buy" && row.sizeUsdc === "500",
      (row) => {
        const { quoteEvidence: _removed, ...rest } = row;
        return rest;
      },
    ));
    const zeroAvailableQuote = metricFixture(candidate, mutateRow(
      (row) => row.kind === "single_buy" && row.sizeUsdc === "500",
      (row) => ({ ...row, quoteEvidence: { status: "available", quotedOutputRaw: "0" } }),
    ));
    const unprovenPrefundQuote = metricFixture(candidate, mutateRow(
      (row) => row.kind === "independent_sell" && row.sizeNara === "50000",
      (row) => ({
        ...row,
        quoteEvidence: { ...prefundQuoteEvidence(), poolManagerBalanceRaw: "10" },
      }),
    ));
    const incompleteCrossBlockQuotes = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "D",
      (row) => ({ ...row, quoteEvidence: [availableQuoteEvidence()] }),
    ));
    const unquotedNormalSwap = metricFixture(candidate, mutateRow(
      (row) => row.kind === "single_buy" && row.sizeUsdc === "500",
      (row) => ({ ...row, quoteEvidence: unquotedQuoteEvidence("same_block_transactions") }),
    ));
    const unquotedCrossBlockSwap = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "D",
      (row) => ({
        ...row,
        quoteEvidence: [unquotedQuoteEvidence("same_block_transactions"), availableQuoteEvidence()],
      }),
    ));
    const incompleteSameBlockExecutionQuotes = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "B",
      (row) => ({ ...row, executionQuoteEvidence: [unquotedQuoteEvidence("same_block_transactions")] }),
    ));
    const wrongSameBlockExecutionReason = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "B",
      (row) => ({
        ...row,
        executionQuoteEvidence: [
          unquotedQuoteEvidence("same_transaction_actions"),
          unquotedQuoteEvidence("same_transaction_actions"),
        ],
      }),
    ));
    const quotedSameTransactionExecution = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "C",
      (row) => ({ ...row, executionQuoteEvidence: [availableQuoteEvidence(), availableQuoteEvidence()] }),
    ));
    const wrongAtomicExecutionReason = metricFixture(candidate, mutateRow(
      (row) => row.scenario === "F",
      (row) => ({
        ...row,
        executionQuoteEvidence: [
          unquotedQuoteEvidence("same_transaction_actions"),
          unquotedQuoteEvidence("same_transaction_actions"),
        ],
      }),
    ));
    const wrongCandidateRows = valid.matrix.map((row, index) => index === 0
      ? { ...row, candidateId: "AGGRESSIVE-15000-NARA" }
      : row);
    const wrongRouteRows = valid.matrix.map((row, index) => index === 0
      ? { ...row, routeKind: "stock-post-settled-route" }
      : row);
    const wrongQuotePolicyRows = valid.matrix.map((row, index) => index === 0
      ? { ...row, quotePolicy: "any-quoter-error-falls-back" }
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
      missingBidSettlement,
      revertedSameBlockComponent,
      ignoredExtraStatusForbidden,
      missingSuccessEvidence,
      missingSwapQuoteEvidence,
      zeroAvailableQuote,
      unprovenPrefundQuote,
      incompleteCrossBlockQuotes,
      unquotedNormalSwap,
      unquotedCrossBlockSwap,
      incompleteSameBlockExecutionQuotes,
      wrongSameBlockExecutionReason,
      quotedSameTransactionExecution,
      wrongAtomicExecutionReason,
      { ...valid, matrix: wrongCandidateRows },
      { ...valid, matrix: wrongRouteRows },
      { ...valid, matrix: wrongQuotePolicyRows },
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, repositoryHead: "33".repeat(20) }),
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, blockNumber: evidenceBinding.blockNumber + 1n }),
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, blockHash: `0x${"44".repeat(32)}` }),
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, currentSqrtPriceX96: evidenceBinding.currentSqrtPriceX96 + 1n }),
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, currentTick: evidenceBinding.currentTick + 1n }),
      metricFixture(candidate, rawMatrixRows(), { ...evidenceBinding, hookConfigurationHash: `0x${"55".repeat(32)}` }),
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
    expect(result.selectedCandidateId).to.equal(TREASURY_RANGE_CANARY_CANDIDATE_ID);
    expect(result.selectionStatus).to.equal("SELECTED_EXECUTION_BLOCKED");
    expect(result.pareto).not.to.be.empty;
    expect(result.pareto[0].treasuryRangeSafeFunding.treasuryRangeSafeUsdcShortfall)
      .to.equal(TREASURY_RANGE_NOMINAL_USDC_BUDGET);
    expect(result.pareto[0].treasuryRangeSafeFunding.treasuryRangeSafeNaraShortfall > 0n).to.equal(true);
  });

  it("is buildable with full Safe custody of exactly 500 USDC and 100,000 NARA", function () {
    const result = optimizeTreasuryRanges({
      baseProfiles: profiles,
      metrics: completeMetrics(),
      evidenceBinding,
      treasuryRangeSafeBalances: { nara: 100_000n * NARA_UNIT, usdc: TREASURY_RANGE_NOMINAL_USDC_BUDGET },
      treasuryBalances: { nara: 0n, usdc: 0n },
      finalizeProfile,
    });
    expect(result.selectionStatus).to.equal("SELECTED_BUILDABLE");
    expect(result.selectedCandidateId).to.equal(TREASURY_RANGE_CANARY_CANDIDATE_ID);
    expect(result.pareto[0].treasuryRangeSafeFunding.treasuryRangeSafeUsdcShortfall).to.equal(0n);
    expect(result.pareto[0].treasuryRangeSafeFunding.treasuryRangeSafeNaraShortfall).to.equal(0n);
  });

  it("hard-blocks a stale 5,000 USDC profile even when its matrix evidence is complete", function () {
    const staleProfiles = [
      { ...profiles[0], protectedUsdc: 4_800n * 10n ** 6n },
      profiles[1],
      profiles[2],
    ];
    const result = optimizeTreasuryRanges({
      baseProfiles: staleProfiles,
      metrics: completeMetrics(),
      evidenceBinding,
      treasuryRangeSafeBalances: { nara: 100_000n * NARA_UNIT, usdc: 5_000n * 10n ** 6n },
      treasuryBalances: { nara: 0n, usdc: 0n },
      finalizeProfile,
    });
    const staleCandidates = result.candidates.filter((candidate) => candidate.profile.name === "CONSERVATIVE");
    expect(staleCandidates).to.have.length(REQUIRED_NARA_BUDGETS.length);
    expect(staleCandidates.every((candidate) => !candidate.hardGates.exactCanaryUsdcBudget
      && !candidate.hardGatePass)).to.equal(true);
  });

  it("hard-blocks a noncanonical 201/299 USDC split", function () {
    const wrongSplitProfiles = [
      {
        ...profiles[0],
        exposedUsdcInput: 201n * 10n ** 6n,
        protectedUsdc: 299n * 10n ** 6n,
      },
      profiles[1],
      profiles[2],
    ];
    const result = optimizeTreasuryRanges({
      baseProfiles: wrongSplitProfiles,
      metrics: completeMetrics(),
      evidenceBinding,
      treasuryRangeSafeBalances: { nara: 100_000n * NARA_UNIT, usdc: TREASURY_RANGE_NOMINAL_USDC_BUDGET },
      treasuryBalances: { nara: 0n, usdc: 0n },
      finalizeProfile,
    });
    const approved = result.candidates.find((candidate) => candidate.candidateId === TREASURY_RANGE_CANARY_CANDIDATE_ID);
    expect(approved?.hardGates.exactCanaryUsdcBudget).to.equal(true);
    expect(approved?.hardGates.exactApprovedCanaryAllocation).to.equal(false);
    expect(result.selectedCandidateId).to.equal(null);
  });

  it("never selects a non-approved profile or NARA budget", function () {
    const result = optimize(completeMetrics());
    const rejected = result.candidates.filter((candidate) => candidate.candidateId !== TREASURY_RANGE_CANARY_CANDIDATE_ID);
    expect(rejected).to.have.length(REQUIRED_TREASURY_RANGE_CANDIDATE_COUNT - 1);
    expect(rejected.every((candidate) => !candidate.hardGates.approvedCanaryCandidate
      && !candidate.hardGatePass)).to.equal(true);
  });

  it("loads only clean tracked v3 deployment evidence and hashes normalized raw bytes", function () {
    const fixture = trackedEvidenceRepository();
    try {
      const binding = loadTrackedPostDeploymentManagerEvidence(fixture.repositoryRoot, fixture.evidencePath);
      expect(binding.evidence.schemaVersion).to.equal("nara.v4.treasury-range-manager-deployment.v3");
      expect(binding.evidence.status).to.equal("deployed_verified");
      expect(binding.evidence.deployedAddress).to.equal(POST_DEPLOYMENT_MANAGER);
      expect(binding.evidence.runtimeCodeHash).to.equal(POST_DEPLOYMENT_RUNTIME_HASH);
      expect(binding.reference).to.deep.equal({
        manifestPath: "deployments/manager-deployment.json",
        manifestSha256: sha256Hex(fixture.raw.replace(/\r\n/g, "\n")),
      });
      expect(postDeploymentStateOptions(500n, binding)).to.deep.equal({
        blockNumber: 500n,
        managerAddress: POST_DEPLOYMENT_MANAGER,
        managerRuntimeCodeHash: POST_DEPLOYMENT_RUNTIME_HASH,
      });

      const untrackedPath = join(fixture.repositoryRoot, "deployments", "untracked.json");
      writeFileSync(untrackedPath, JSON.stringify(deploymentEvidenceFixture("11".repeat(20))), "utf8");
      expect(() => loadTrackedPostDeploymentManagerEvidence(fixture.repositoryRoot, untrackedPath))
        .to.throw("must be tracked by Git");

      const invalidPath = "deployments/invalid-schema.json";
      const invalid = { ...deploymentEvidenceFixture("11".repeat(20)), schemaVersion: "nara.v4.treasury-range-manager-deployment.v2" };
      writeFileSync(join(fixture.repositoryRoot, invalidPath), JSON.stringify(invalid), "utf8");
      gitAt(fixture.repositoryRoot, ["add", invalidPath]);
      gitAt(fixture.repositoryRoot, [
        "-c", "user.name=NARA Test", "-c", "user.email=nara-test@example.invalid",
        "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "invalid evidence fixture",
      ]);
      expect(() => loadTrackedPostDeploymentManagerEvidence(fixture.repositoryRoot, invalidPath))
        .to.throw("exact deployed_verified v3 schema");

      writeFileSync(join(fixture.repositoryRoot, fixture.evidencePath), `${fixture.raw} `, "utf8");
      expect(() => loadTrackedPostDeploymentManagerEvidence(fixture.repositoryRoot, fixture.evidencePath))
        .to.throw("must exactly match repository HEAD");
    } finally {
      rmSync(fixture.repositoryRoot, { recursive: true, force: true });
    }
  });

  it("writes exactly one receipt-bound approved buildable canary without overwrite", function () {
    const fixture = trackedEvidenceRepository();
    try {
      const binding = loadTrackedPostDeploymentManagerEvidence(fixture.repositoryRoot, fixture.evidencePath);
      const result = buildablePostDeploymentResult(binding);
      mkdirSync(join(fixture.repositoryRoot, "generated"));
      const outputPath = "generated/selected-canary.json";
      const written = writeSelectedPostDeploymentStrategy({
        repositoryRoot: fixture.repositoryRoot,
        outputPath,
        result,
        managerBinding: binding,
      });
      expect(written.outputPath).to.equal(outputPath);
      const manifest = JSON.parse(readFileSync(join(fixture.repositoryRoot, outputPath), "utf8"));
      expect(manifest.changeId).to.equal(
        "NARA-20260831-v4-treasury-range-500-usdc-canary-conservative-100000-nara",
      );
      expect(manifest.managerDeployment).to.deep.equal(binding.reference);
      expect(manifest.addresses.treasuryRangeManager).to.equal(binding.evidence.deployedAddress);
      expect(manifest.runtimeCodeHashes.rangeManager).to.equal(binding.evidence.runtimeCodeHash);

      expect(() => writeSelectedPostDeploymentStrategy({
        repositoryRoot: fixture.repositoryRoot,
        outputPath,
        result,
        managerBinding: binding,
      })).to.throw("refusing to overwrite");

      const blocked = { ...result, selectionStatus: "SELECTED_EXECUTION_BLOCKED" as const };
      expect(() => writeSelectedPostDeploymentStrategy({
        repositoryRoot: fixture.repositoryRoot,
        outputPath: "generated/blocked.json",
        result: blocked,
        managerBinding: binding,
      })).to.throw("requires selectionStatus SELECTED_BUILDABLE");
      expect(existsSync(join(fixture.repositoryRoot, "generated", "blocked.json"))).to.equal(false);

      expect(() => writeSelectedPostDeploymentStrategy({
        repositoryRoot: fixture.repositoryRoot,
        outputPath: "../outside.json",
        result,
        managerBinding: binding,
      })).to.throw("must remain inside the authoritative repository");
    } finally {
      rmSync(fixture.repositoryRoot, { recursive: true, force: true });
    }
  });
});
