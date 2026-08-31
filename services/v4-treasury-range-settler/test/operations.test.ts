import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ethers } from "ethers";
import { canonicalProductionV4Deployment } from "../../../scripts/lib/v4LiveConfig.js";
import { canonicalTreasuryRangeAuthorities } from "../../../scripts/lib/v4TreasuryRangeConfig.js";
import { humanUsdcPerNaraToSqrtPriceX96, parseDecimalRational } from "../../../scripts/lib/v4TreasuryRangeMath.js";
import { treasuryRangeHookConfigurationHash } from "../../../scripts/lib/v4TreasuryRangeManifest.js";
import {
  CIRCLE_FIAT_TOKEN_ADMIN_SLOT,
  CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA,
  CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT,
  CIRCLE_FIAT_TOKEN_PROXY_MECHANISM,
  BASE_MULTICALL3,
  assertCircleFiatTokenDependencyExact,
  assertCircleFiatTokenDependencyHealthy,
  parseCircleFiatTokenDependencyEvidence,
  readCircleFiatTokenDependency,
  treasuryRangeUsdcMonitoredAccounts,
} from "../../../scripts/lib/v4UsdcDependency.js";
import {
  CREATE2_DEPLOYER_ABI,
  ERC20_APPROVAL_ABI,
  TREASURY_RANGE_MANAGER_ABI,
  assertTreasuryRangePacketCallShape,
  assertTreasuryRangeManagerAllowanceSafety,
  assertTreasuryRangeRepositoryEvidence,
  assertTreasuryRangeStrategyRelease,
  assertTreasuryRangeUsdcDependency,
  assertTreasuryRangeViewChecks,
  forceRebuildTreasuryRangeManagerArtifact,
  isTreasuryRangeOneSided,
  parseTreasuryRangeManagerDeploymentEvidence,
  readTreasuryRangeProtectedReleaseEvidence,
  recomputeAndAssertTreasuryRangeOrder,
  refuseStalePackets,
  sqrtPriceX96AtTick,
  treasuryRangeExternalDependencyReview,
  treasuryRangeSafeMarkdownReview,
  type TreasuryRangeBuildContext,
  type TreasuryRangeSafeReview,
} from "../../../scripts/lib/v4TreasuryRangeSafeBuilder.js";
import { readSettlerConfig } from "../src/config.js";
import { RANGE_MANAGER_ABI, decodeOrder } from "../src/contracts.js";
import { SettlementExecutor, classifyPendingAge } from "../src/executor.js";
import { redactLogValue, safeErrorCode } from "../src/logging.js";
import {
  PENDING_SETTLEMENT_SCHEMA,
  RECONCILED_SETTLEMENT_SCHEMA,
  PendingSettlementStore,
  SettlementReconciliationStore,
  type ReconciledSettlementRecord,
} from "../src/pending.js";
import {
  Reconciler,
  commonConfirmedPoint,
  hasIndependentBurnOwnershipProof,
  terminalOutcomeFromStatuses,
  type TerminalOutcome,
} from "../src/reconciliation.js";
import { FatalRuntimeError, FatalRuntimeGate, RpcDeadlineSet, type RuntimeFault } from "../src/runtime.js";
import { SweepCoordinator } from "../src/sweepCoordinator.js";

const TEST_KEY = `0x${"11".repeat(32)}`;
const MANAGER = "0x1111111111111111111111111111111111111111";
const DEPLOYMENT_EXECUTOR_SAFE = "0x7000000000000000000000000000000000000007";
const TREASURY_RANGE_SAFE = "0x8000000000000000000000000000000000000008";
const HASH = `0x${"22".repeat(32)}`;

const MOCK_CIRCLE_INTERFACE = new ethers.Interface([
  "function owner() view returns(address)",
  "function pauser() view returns(address)",
  "function blacklister() view returns(address)",
  "function paused() view returns(bool)",
  "function isBlacklisted(address account) view returns(bool)",
]);
const MOCK_MULTICALL_INTERFACE = new ethers.Interface([
  "function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns(tuple(bool success,bytes returnData)[] returnData)",
]);

const MOCK_HOOK_INTERFACE = new ethers.Interface([
  "function buyCurve() view returns(uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function sellCurve() view returns(uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function protocolDepth(address) view returns(uint256)",
  "function pendingBuyCurve() view returns(tuple(uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps) curve,uint48 eta,bool exists)",
  "function pendingSellCurve() view returns(tuple(uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps) curve,uint48 eta,bool exists)",
  "function pendingProtocolDepth(address) view returns(uint256,uint48,bool)",
  "function registeredPoolId() view returns(bytes32)",
  "function poolRegistered() view returns(bool)",
]);

class MockHookProvider extends ethers.AbstractProvider {
  constructor(readonly hook: string, readonly pendingExists: boolean) {
    super(ethers.Network.from(8453));
  }

  async _detectNetwork(): Promise<ethers.Network> {
    return ethers.Network.from(8453);
  }

  async _perform(request: any): Promise<any> {
    if (request.method !== "call") throw new Error(`UNSUPPORTED_HOOK_PROVIDER_${String(request.method)}`);
    const transaction = request.transaction as { to: string; data: string };
    if (ethers.getAddress(transaction.to) !== ethers.getAddress(this.hook)) throw new Error("UNEXPECTED_HOOK_TARGET");
    const parsed = MOCK_HOOK_INTERFACE.parseTransaction({ data: transaction.data });
    if (!parsed) throw new Error("UNEXPECTED_HOOK_CALL");
    const curve = [100n, 200n, 300n, 10n, 20n, 30n, 40n, 50n];
    if (parsed.name === "buyCurve" || parsed.name === "sellCurve") {
      return MOCK_HOOK_INTERFACE.encodeFunctionResult(parsed.name, curve);
    }
    if (parsed.name === "protocolDepth") return MOCK_HOOK_INTERFACE.encodeFunctionResult(parsed.name, [1_000n]);
    if (parsed.name === "pendingBuyCurve" || parsed.name === "pendingSellCurve") {
      return MOCK_HOOK_INTERFACE.encodeFunctionResult(parsed.name, [curve, 999n, this.pendingExists]);
    }
    if (parsed.name === "pendingProtocolDepth") {
      return MOCK_HOOK_INTERFACE.encodeFunctionResult(parsed.name, [2_000n, 999n, this.pendingExists]);
    }
    if (parsed.name === "registeredPoolId") return MOCK_HOOK_INTERFACE.encodeFunctionResult(parsed.name, [HASH]);
    if (parsed.name === "poolRegistered") return MOCK_HOOK_INTERFACE.encodeFunctionResult(parsed.name, [true]);
    throw new Error("UNEXPECTED_HOOK_METHOD");
  }
}

interface MockCircleState {
  proxy: string;
  proxyCode: string;
  implementationAddress: string;
  codeByAddress: Record<string, string>;
  admin: string;
  owner: string;
  pauser: string;
  blacklister: string;
  paused: boolean;
  blacklisted: Set<string>;
}

class MockCircleProvider extends ethers.AbstractProvider {
  broadcastCalls = 0;

  constructor(readonly state: MockCircleState) {
    super(ethers.Network.from(8453));
  }

  async _detectNetwork(): Promise<ethers.Network> {
    return ethers.Network.from(8453);
  }

  async _perform(request: any): Promise<any> {
    if (request.method === "getStorage") {
      const slot = ethers.toBeHex(request.position, 32).toLowerCase();
      if (slot === CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT) return ethers.zeroPadValue(this.state.implementationAddress, 32);
      if (slot === CIRCLE_FIAT_TOKEN_ADMIN_SLOT) return ethers.zeroPadValue(this.state.admin, 32);
      return ethers.ZeroHash;
    }
    if (request.method === "getCode") {
      const target = ethers.getAddress(request.address);
      if (target === ethers.getAddress(this.state.proxy)) return this.state.proxyCode;
      if (target === BASE_MULTICALL3) return this.state.codeByAddress[BASE_MULTICALL3.toLowerCase()] ?? "0x";
      return this.state.codeByAddress[target.toLowerCase()] ?? "0x";
    }
    if (request.method === "call") {
      const transaction = request.transaction as { to: string; data: string };
      if (ethers.getAddress(transaction.to) !== BASE_MULTICALL3) throw new Error("UNEXPECTED_MOCK_CALL_TARGET");
      const calls = MOCK_MULTICALL_INTERFACE.decodeFunctionData("aggregate3", transaction.data)[0] as ethers.Result;
      const results = calls.map((call: ethers.Result) => {
        if (ethers.getAddress(String(call.target)) !== ethers.getAddress(this.state.proxy)) throw new Error("UNEXPECTED_MOCK_TOKEN_TARGET");
        const parsed = MOCK_CIRCLE_INTERFACE.parseTransaction({ data: String(call.callData) });
        if (!parsed) throw new Error("UNEXPECTED_MOCK_TOKEN_CALL");
        let value: string | boolean;
        if (parsed.name === "owner") value = this.state.owner;
        else if (parsed.name === "pauser") value = this.state.pauser;
        else if (parsed.name === "blacklister") value = this.state.blacklister;
        else if (parsed.name === "paused") value = this.state.paused;
        else if (parsed.name === "isBlacklisted") value = this.state.blacklisted.has(ethers.getAddress(parsed.args[0]).toLowerCase());
        else throw new Error("UNEXPECTED_MOCK_TOKEN_METHOD");
        return { success: true, returnData: MOCK_CIRCLE_INTERFACE.encodeFunctionResult(parsed.name, [value]) };
      });
      return MOCK_MULTICALL_INTERFACE.encodeFunctionResult("aggregate3", [results]);
    }
    if (request.method === "broadcastTransaction") {
      this.broadcastCalls += 1;
      throw new Error("BROADCAST_MUST_NOT_RUN");
    }
    throw new Error(`UNSUPPORTED_MOCK_PROVIDER_${String(request.method)}`);
  }
}

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    PRIMARY_BASE_WS_RPC: "wss://primary.example/ws",
    SECONDARY_BASE_WS_RPC: "wss://secondary.example/ws",
    FALLBACK_BASE_HTTP_RPC: "https://fallback.example/rpc",
    RANGE_MANAGER_ADDRESS: MANAGER,
    RANGE_MANAGER_RUNTIME_CODE_HASH: HASH,
    HOOK_CONFIGURATION_HASH: HASH,
    USDC_RUNTIME_CODE_HASH: HASH,
    USDC_READER_RUNTIME_CODE_HASH: HASH,
    USDC_IMPLEMENTATION_ADDRESS: MANAGER,
    USDC_IMPLEMENTATION_RUNTIME_CODE_HASH: HASH,
    USDC_PROXY_ADMIN: MANAGER,
    USDC_OWNER: MANAGER,
    USDC_PAUSER: MANAGER,
    USDC_BLACKLISTER: MANAGER,
    POOL_MANAGER_RUNTIME_CODE_HASH: HASH,
    POSITION_MANAGER_RUNTIME_CODE_HASH: HASH,
    PERMIT2_RUNTIME_CODE_HASH: HASH,
    RANGE_MANAGER_DEPLOYMENT_BLOCK: "1",
    SETTLER_PRIVATE_KEY: TEST_KEY,
    SETTLER_INSTANCE_ID: "test-a",
    HEARTBEAT_URL: "https://heartbeat.example/status",
    ALERT_WEBHOOK_URL: "https://alert.example/status",
    MIN_GAS_BALANCE_WEI: "1",
    CONFIRMATIONS: "3",
    ...overrides,
  };
}

function usdcDependencyEvidence() {
  return parseCircleFiatTokenDependencyEvidence({
    schemaVersion: CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA,
    mechanism: CIRCLE_FIAT_TOKEN_PROXY_MECHANISM,
    proxyAddress: "0x1000000000000000000000000000000000000001",
    implementationSlot: CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT,
    adminSlot: CIRCLE_FIAT_TOKEN_ADMIN_SLOT,
    readerAddress: BASE_MULTICALL3,
    readerRuntimeCodeHash: `0x${"11".repeat(32)}`,
    proxyRuntimeCodeHash: HASH,
    implementationAddress: "0x2000000000000000000000000000000000000002",
    implementationRuntimeCodeHash: `0x${"33".repeat(32)}`,
    admin: "0x3000000000000000000000000000000000000003",
    owner: "0x4000000000000000000000000000000000000004",
    pauser: "0x5000000000000000000000000000000000000005",
    blacklister: "0x6000000000000000000000000000000000000006",
    paused: false,
    monitoredAccounts: {
      treasuryRangeSafe: { address: TREASURY_RANGE_SAFE, isBlacklisted: false },
      rangeManager: { address: MANAGER, isBlacklisted: false },
    },
  });
}

test("implementation-aware USDC evidence rejects drift even when proxy runtime is unchanged", () => {
  const expected = usdcDependencyEvidence();
  const changed = parseCircleFiatTokenDependencyEvidence({
    ...expected,
    implementationAddress: "0x9000000000000000000000000000000000000009",
    implementationRuntimeCodeHash: `0x${"44".repeat(32)}`,
  });
  assert.equal(changed.proxyRuntimeCodeHash, expected.proxyRuntimeCodeHash);
  assert.throws(() => assertCircleFiatTokenDependencyExact(expected, changed), /USDC_DEPENDENCY_EVIDENCE_CHANGED/);
});

test("proxy-compatible implementation upgrade is read through Multicall3 and blocks builders and settler signing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-usdc-upgrade-"));
  const proxy = "0x1000000000000000000000000000000000000001";
  const initialImplementation = "0x2000000000000000000000000000000000000002";
  const upgradedImplementation = "0x9000000000000000000000000000000000000009";
  const monitoredAccounts = {
    treasuryRangeSafe: TREASURY_RANGE_SAFE,
    rangeManager: MANAGER,
  };
  const state: MockCircleState = {
    proxy,
    proxyCode: "0x6001600055",
    implementationAddress: initialImplementation,
    codeByAddress: {
      [initialImplementation.toLowerCase()]: "0x6002600055",
      [upgradedImplementation.toLowerCase()]: "0x6003600055",
      [BASE_MULTICALL3.toLowerCase()]: "0x6004600055",
    },
    admin: "0x3000000000000000000000000000000000000003",
    owner: "0x4000000000000000000000000000000000000004",
    pauser: "0x5000000000000000000000000000000000000005",
    blacklister: "0x6000000000000000000000000000000000000006",
    paused: false,
    blacklisted: new Set(),
  };
  const provider = new MockCircleProvider(state);
  try {
    const baseline = await readCircleFiatTokenDependency(provider, proxy, monitoredAccounts, 100);
    state.implementationAddress = upgradedImplementation;
    const upgraded = await readCircleFiatTokenDependency(provider, proxy, monitoredAccounts, 101);
    assert.equal(upgraded.proxyAddress, baseline.proxyAddress);
    assert.equal(upgraded.proxyRuntimeCodeHash, baseline.proxyRuntimeCodeHash);
    assert.notEqual(upgraded.implementationAddress, baseline.implementationAddress);
    assert.notEqual(upgraded.implementationRuntimeCodeHash, baseline.implementationRuntimeCodeHash);
    assert.throws(() => assertCircleFiatTokenDependencyExact(baseline, upgraded), /USDC_DEPENDENCY_EVIDENCE_CHANGED/);

    const context = {
      provider,
      strategy: {
        addresses: { usdc: proxy },
        externalDependencies: { usdc: baseline },
      },
      block: { number: 101 },
      usdcDependency: baseline,
      usdcDependencyEnforcement: "exact",
    } as unknown as TreasuryRangeBuildContext;
    await assert.rejects(assertTreasuryRangeUsdcDependency(context), /USDC_DEPENDENCY_EVIDENCE_CHANGED/);

    const config = readSettlerConfig(environment({
      SETTLER_PENDING_STATE_PATH: join(directory, "pending.json"),
      SETTLER_RECONCILIATION_DIRECTORY: join(directory, "reconciled"),
    }));
    let nextNonceCalls = 0;
    const runtimeGate = new FatalRuntimeGate();
    const reconciler = {
      runtimeGate,
      commonConfirmedPoint: async () => ({ number: 101, hash: HASH, timestamp: 123 }),
      sweep: async () => {
        const actual = await readCircleFiatTokenDependency(provider, proxy, monitoredAccounts, 101);
        assertCircleFiatTokenDependencyExact(baseline, actual);
        throw new Error("UNREACHABLE_AFTER_USDC_GATE");
      },
      nextWriteNonce: async () => { nextNonceCalls += 1; return 7; },
    } as unknown as Reconciler;
    const pendingStore = new PendingSettlementStore(config.pendingStatePath);
    const executor = new SettlementExecutor(
      config,
      reconciler,
      provider,
      pendingStore,
      new SettlementReconciliationStore(config.reconciliationDirectory),
    );
    await assert.rejects(executor.execute([1n]), /USDC_DEPENDENCY_EVIDENCE_CHANGED/);
    assert.equal(nextNonceCalls, 0);
    assert.equal(provider.broadcastCalls, 0);
    assert.equal(pendingStore.load(), undefined);
  } finally {
    provider.destroy();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("manager-augmented dependency evidence is serialized and cancellation review labels its bypass", () => {
  const evidence = usdcDependencyEvidence();
  const exact = treasuryRangeExternalDependencyReview({
    usdcDependency: evidence,
    usdcDependencyEnforcement: "exact",
  });
  assert.equal(exact.usdc.enforcement, "exact");
  assert.deepEqual(exact.usdc.evidence.monitoredAccounts.rangeManager, evidence.monitoredAccounts.rangeManager);

  const review = {
    purpose: "NARA v4 Treasury Range order cancellation",
    changeId: "test",
    repositoryHead: "1".repeat(40),
    strategyHash: HASH,
    blockNumber: 100,
    blockHash: HASH,
    signingSafeRole: "treasury_custody",
    signingSafe: { address: TREASURY_RANGE_SAFE, nonce: "1" },
    safeRoles: {
      deploymentExecutorSafe: DEPLOYMENT_EXECUTOR_SAFE,
      treasuryRangeSafe: TREASURY_RANGE_SAFE,
    },
    validUntil: 200,
    simulation: { safeTxHash: HASH, simulation: "success" },
    calls: [],
    externalDependencies: treasuryRangeExternalDependencyReview({
      usdcDependency: evidence,
      usdcDependencyEnforcement: "emergency_exit_bypass",
    }),
    checks: ["Acknowledge emergency_exit_bypass and strategy snapshot evidence."],
    details: {},
  } as unknown as TreasuryRangeSafeReview;
  const markdown = treasuryRangeSafeMarkdownReview(review);
  assert.match(markdown, /USDC enforcement: `emergency_exit_bypass`/);
  assert.match(markdown, /strategy snapshot only, not a current health assertion/);
  assert.match(markdown, /Acknowledge emergency_exit_bypass/);
  assert.match(markdown, /Signing Safe role: `treasury_custody`/);
  assert.equal(markdown.includes(`Deployment executor Safe: \`${DEPLOYMENT_EXECUTOR_SAFE}\``), true);
  assert.equal(markdown.includes(`Treasury custody Safe: \`${TREASURY_RANGE_SAFE}\``), true);
});

test("USDC monitoring targets treasury custody and excludes the non-token deployment executor", () => {
  const monitored = treasuryRangeUsdcMonitoredAccounts({
    treasuryRangeSafe: TREASURY_RANGE_SAFE,
    poolManager: "0x3000000000000000000000000000000000000003",
    positionManager: "0x4000000000000000000000000000000000000004",
    permit2: "0x5000000000000000000000000000000000000005",
    liquidityVault: "0x6000000000000000000000000000000000000006",
    liquidityCompounder: "0x9000000000000000000000000000000000000009",
    rangeManager: MANAGER,
  });
  assert.equal(monitored.treasuryRangeSafe, TREASURY_RANGE_SAFE);
  assert.equal(Object.hasOwn(monitored, "deploymentExecutorSafe"), false);
  assert.equal(Object.hasOwn(monitored, "safe"), false);
});

test("packet helper binds every call argument, call order, and Safe role to reviewed intent", () => {
  const production = canonicalProductionV4Deployment();
  const authorities = canonicalTreasuryRangeAuthorities(production);
  const deadline = 123;
  const strategyOrder = {
    side: "SELL_NARA",
    humanPriceLower: "0.14",
    humanPriceUpper: "0.21",
    tickLower: 60,
    tickUpper: 120,
    inputAmountRaw: "10",
    expectedOutputAmountRaw: "2",
    minimumOutputAmountRaw: "1",
    expectedLiquidity: "1",
    expectedDustNaraRaw: "0",
    expectedDustUsdcRaw: "0",
    toleranceBps: 100,
    enabled: true,
  } as const;
  const context = {
    strategy: {
      addresses: { treasuryRangeManager: MANAGER, nara: production.token, usdc: production.base },
      proposedOrders: [strategyOrder],
      strategyHash: HASH,
    },
    deploymentExecutorSafeEvidence: { address: authorities.deploymentExecutorSafe },
    treasuryRangeSafeEvidence: { address: authorities.treasuryRangeSafe },
  } as unknown as TreasuryRangeBuildContext;
  const safeRoles = {
    deploymentExecutorSafe: authorities.deploymentExecutorSafe,
    treasuryRangeSafe: authorities.treasuryRangeSafe,
  };
  const create2 = new ethers.Interface(CREATE2_DEPLOYER_ABI);
  const manager = new ethers.Interface(TREASURY_RANGE_MANAGER_ABI);
  const token = new ethers.Interface(ERC20_APPROVAL_ABI);
  const initCode = "0x1234";
  const initCodeHash = ethers.keccak256(initCode);
  const predictedManager = ethers.getCreate2Address(production.create2HookDeployer, HASH, initCodeHash);
  const deploymentCall = {
    to: production.create2HookDeployer,
    value: "0",
    data: create2.encodeFunctionData("deploy", [HASH, initCode]),
  };
  const deploymentDetails = {
    deployer: production.create2HookDeployer,
    predictedManager,
    salt: HASH,
    initCodeHash,
    deploymentDeadline: String(deadline),
    safeRoles,
  };
  assert.doesNotThrow(() => assertTreasuryRangePacketCallShape(
    "deployment", context, [deploymentCall], deploymentDetails, deadline,
  ));
  assert.throws(() => assertTreasuryRangePacketCallShape("deployment", context, [{
    ...deploymentCall,
    to: MANAGER,
  }], deploymentDetails, deadline), /canonical CREATE2 deployer/);
  assert.throws(() => assertTreasuryRangePacketCallShape(
    "deployment", context, [deploymentCall], { ...deploymentDetails, predictedManager: MANAGER }, deadline,
  ), /reviewed CREATE2 intent/);

  const cancelCall = {
    to: MANAGER,
    value: "0",
    data: manager.encodeFunctionData("cancel", [1n, 1n, 1n, BigInt(deadline)]),
  };
  const cancellationDetails = {
    managerAddress: MANAGER,
    deadline: String(deadline),
    cancellations: [{ orderId: "1", minNaraOut: "1", minUsdcOut: "1", strategyHash: HASH }],
    safeRoles,
  };
  assert.doesNotThrow(() => assertTreasuryRangePacketCallShape(
    "cancellation", context, [cancelCall], cancellationDetails, deadline,
  ));
  assert.throws(() => assertTreasuryRangePacketCallShape("cancellation", context, [{
    ...cancelCall,
    to: production.create2HookDeployer,
  }], cancellationDetails, deadline), /exact approved intent/);
  assert.throws(() => assertTreasuryRangePacketCallShape(
    "cancellation", context, [cancelCall], {
      ...cancellationDetails,
      cancellations: [{ orderId: "1", minNaraOut: "2", minUsdcOut: "1", strategyHash: HASH }],
    }, deadline,
  ), /exact approved intent/);

  const orderCalls = [
    { to: production.token, value: "0", data: token.encodeFunctionData("approve", [MANAGER, 10n]) },
    {
      to: MANAGER,
      value: "0",
      data: manager.encodeFunctionData("createSellNaraOrder", [60, 120, 10n, 1n, HASH, 123n]),
    },
    { to: production.token, value: "0", data: token.encodeFunctionData("approve", [MANAGER, 0n]) },
    { to: MANAGER, value: "0", data: manager.encodeFunctionData("assertOperationalClean") },
  ];
  const orderDetails = {
    managerAddress: MANAGER,
    deadline: String(deadline),
    orders: [strategyOrder],
    exactNaraApprovalRaw: "10",
    exactUsdcApprovalRaw: "0",
    finalAssertion: "assertOperationalClean()",
    safeRoles,
  };
  assert.doesNotThrow(() => assertTreasuryRangePacketCallShape("orders", context, orderCalls, orderDetails, deadline));
  assert.throws(() => assertTreasuryRangePacketCallShape(
    "orders", context, orderCalls.slice(0, -1), orderDetails, deadline,
  ), /call count/);
  const wrongTickCalls = [...orderCalls];
  wrongTickCalls[1] = {
    ...wrongTickCalls[1],
    data: manager.encodeFunctionData("createSellNaraOrder", [61, 120, 10n, 1n, HASH, 123n]),
  };
  assert.throws(() => assertTreasuryRangePacketCallShape(
    "orders", context, wrongTickCalls, orderDetails, deadline,
  ), /call 1 differs/);
  const wrongApprovalCalls = [...orderCalls];
  wrongApprovalCalls[0] = {
    ...wrongApprovalCalls[0],
    data: token.encodeFunctionData("approve", [MANAGER, 11n]),
  };
  assert.throws(() => assertTreasuryRangePacketCallShape(
    "orders", context, wrongApprovalCalls, orderDetails, deadline,
  ), /call 0 differs/);
  assert.throws(() => assertTreasuryRangePacketCallShape(
    "orders", { ...context, treasuryRangeSafeEvidence: { address: authorities.deploymentExecutorSafe } } as TreasuryRangeBuildContext,
    orderCalls, orderDetails, deadline,
  ), /role-swapped/);
});

test("pending Hook governance blocks creation but remains review-visible for emergency cancellation", async () => {
  const production = canonicalProductionV4Deployment();
  const curve = ["100", "200", "300", "10", "20", "30", "40", "50"];
  const checks = [
    { label: "hook.buyCurve", target: production.hook, method: "buyCurve", args: [], expected: curve },
    { label: "hook.sellCurve", target: production.hook, method: "sellCurve", args: [], expected: curve },
    { label: "hook.protocolDepth.usdc", target: production.hook, method: "protocolDepth", args: [production.base], expected: "1000" },
    { label: "hook.protocolDepth.nara", target: production.hook, method: "protocolDepth", args: [production.token], expected: "1000" },
    { label: "hook.pendingBuyCurve", target: production.hook, method: "pendingBuyCurve", args: [], expected: [curve, "999", false] },
    { label: "hook.pendingSellCurve", target: production.hook, method: "pendingSellCurve", args: [], expected: [curve, "999", false] },
    { label: "hook.pendingProtocolDepth.usdc", target: production.hook, method: "pendingProtocolDepth", args: [production.base], expected: ["2000", "999", false] },
    { label: "hook.pendingProtocolDepth.nara", target: production.hook, method: "pendingProtocolDepth", args: [production.token], expected: ["2000", "999", false] },
    { label: "hook.registeredPoolId", target: production.hook, method: "registeredPoolId", args: [], expected: HASH },
    { label: "hook.poolRegistered", target: production.hook, method: "poolRegistered", args: [], expected: true },
  ];
  const provider = new MockHookProvider(production.hook, true);
  const context = {
    provider,
    block: { number: 123 },
    strategy: {
      addresses: { hook: production.hook, usdc: production.base, nara: production.token },
      hookConfigurationHash: treasuryRangeHookConfigurationHash(checks),
    },
  } as unknown as TreasuryRangeBuildContext;
  try {
    await assert.rejects(
      assertTreasuryRangeViewChecks(context, checks, "hookConfiguration.readChecks"),
      /differs from the strategy manifest|pending Hook change/,
    );
    const snapshot = await assertTreasuryRangeViewChecks(
      context, checks, "hookConfiguration.readChecks", { emergencyExit: true },
    );
    assert.equal((snapshot["hook.pendingBuyCurve"] as unknown[]).at(-1), true);
    assert.equal((snapshot["hook.pendingProtocolDepth.usdc"] as unknown[]).at(-1), true);
    assert.equal(snapshot["hook.registeredPoolId"], HASH);
    assert.equal(snapshot["hook.poolRegistered"], true);
  } finally {
    provider.destroy();
  }
});

test("USDC health evidence rejects pause and monitored-account blacklist state", () => {
  const expected = usdcDependencyEvidence();
  assert.throws(() => assertCircleFiatTokenDependencyHealthy({ ...expected, paused: true }), /USDC_IS_PAUSED/);
  assert.throws(() => assertCircleFiatTokenDependencyHealthy({
    ...expected,
    monitoredAccounts: {
      ...expected.monitoredAccounts,
      treasuryRangeSafe: { ...expected.monitoredAccounts.treasuryRangeSafe, isBlacklisted: true },
    },
  }), /USDC_MONITORED_ACCOUNT_BLACKLISTED_TREASURYRANGESAFE/);
});

test("configuration rejects batches above the contract's 16-order cap", () => {
  assert.throws(() => readSettlerConfig(environment({ SETTLER_MAX_SETTLEMENT_BATCH: "17" })), /between 1 and 16/);
  assert.equal(readSettlerConfig(environment({ SETTLER_MAX_SETTLEMENT_BATCH: "16" })).maxSettlementBatch, 16);
});

test("configuration requires three distinct RPC origins", () => {
  assert.throws(() => readSettlerConfig(environment({ FALLBACK_BASE_HTTP_RPC: "https://primary.example/rpc" })), /distinct URL origins/);
});

test("configuration requires a bounded pending-transaction alert/drop window", () => {
  assert.throws(() => readSettlerConfig(environment({
    SETTLER_PENDING_ALERT_AFTER_MS: "120000",
    SETTLER_PENDING_DROP_AFTER_MS: "120000",
  })), /must exceed/);
  const config = readSettlerConfig(environment({
    SETTLER_PENDING_ALERT_AFTER_MS: "60000",
    SETTLER_PENDING_DROP_AFTER_MS: "300000",
  }));
  assert.equal(config.pendingAlertAfterMs, 60_000);
  assert.equal(config.pendingDropAfterMs, 300_000);
});

test("allowlisted logging preserves evidence hashes while redacting URLs", () => {
  assert.equal(redactLogValue(HASH), HASH);
  assert.equal(redactLogValue("failure at https://secret.example/key"), "failure at <redacted-url>");
});

test("uppercase operational errors survive reason-code extraction", () => {
  assert.equal(safeErrorCode(new Error("HOOK_CONFIGURATION_CHANGED")), "HOOK_CONFIGURATION_CHANGED");
});

test("Hook configuration hash is deterministic and label ordered", () => {
  const left = [
    { label: "hook.sellCurve", expected: ["2", "3"] },
    { label: "hook.buyCurve", expected: ["1"] },
  ];
  assert.equal(treasuryRangeHookConfigurationHash(left), treasuryRangeHookConfigurationHash([...left].reverse()));
  assert.notEqual(
    treasuryRangeHookConfigurationHash(left),
    treasuryRangeHookConfigurationHash([{ label: "hook.buyCurve", expected: ["9"] }, left[0]]),
  );
});

test("frozen OrderCreated ABI uses maximum/input/refund/minimum field order", () => {
  const iface = new ethers.Interface(RANGE_MANAGER_ABI);
  const event = iface.getEvent("OrderCreated");
  assert.ok(event);
  assert.deepEqual(event.inputs.slice(7, 11).map((input) => input.name), [
    "maximumInputAmount", "inputAmount", "inputRefund", "minimumOutputAmount",
  ]);
});

test("historical order liquidity is preserved by the decoder", () => {
  const order = decodeOrder(1n, [2n, 3n, 4n, HASH, 5n, -120, -60, 6n, 7n, 8n, 0, 2]);
  assert.equal(order.status, 2);
  assert.equal(order.liquidity, 5n);
  assert.equal(order.terminalBlock, 8n);
});

test("TickMath and one-sided orientation use exact sqrt-price boundaries", () => {
  assert.equal(sqrtPriceX96AtTick(0), 1n << 96n);
  assert.equal(sqrtPriceX96AtTick(-887272), 4295128739n);
  assert.equal(sqrtPriceX96AtTick(887272), 1461446703485210103287273052203988822378723970342n);
  const spot = sqrtPriceX96AtTick(0);
  assert.equal(isTreasuryRangeOneSided("SELL_NARA", spot, -120, -60), true);
  assert.equal(isTreasuryRangeOneSided("SELL_NARA", sqrtPriceX96AtTick(-61), -120, -60), false);
  assert.equal(isTreasuryRangeOneSided("BUY_NARA", spot, 60, 120), true);
  assert.equal(isTreasuryRangeOneSided("BUY_NARA", sqrtPriceX96AtTick(61), 60, 120), false);
});

test("order builder cross-checks every manifested economic field with shared exact math", () => {
  const strategyHash = `0x${"33".repeat(32)}`;
  const order = {
    side: "SELL_NARA" as const,
    humanPriceLower: "0.14",
    humanPriceUpper: "0.21",
    tickLower: 291_960,
    tickUpper: 295_980,
    inputAmountRaw: "1000000000000000000000",
    expectedOutputAmountRaw: "171270837",
    minimumOutputAmountRaw: "169558128",
    expectedLiquidity: "2055590516044273",
    expectedDustNaraRaw: "455124",
    expectedDustUsdcRaw: "0",
    toleranceBps: 100,
    enabled: true,
  };
  const result = recomputeAndAssertTreasuryRangeOrder(
    order,
    strategyHash,
    2_000_000_000n,
    60n,
    humanUsdcPerNaraToSqrtPriceX96(parseDecimalRational("0.0847")),
    "order[0]",
  );
  assert.equal(result.expectedInputUsedRaw, "999999999999999544876");
  assert.throws(() => recomputeAndAssertTreasuryRangeOrder(
    { ...order, minimumOutputAmountRaw: "169558129" },
    strategyHash,
    2_000_000_000n,
    60n,
    humanUsdcPerNaraToSqrtPriceX96(parseDecimalRational("0.0847")),
    "order[0]",
  ), /minimumOutputAmountRaw differs/);
});

test("forced manager token dust is report-only while allowances remain blocking", () => {
  const cleanAllowances = {
    treasuryRangeSafeNaraAllowance: "0",
    treasuryRangeSafeUsdcAllowance: "0",
    managerNaraPermit2Allowance: "0",
    managerUsdcPermit2Allowance: "0",
    permit2NaraPositionManagerAllowance: "0",
    permit2UsdcPositionManagerAllowance: "0",
    managerNaraBalance: "999999999999999999999999",
    managerUsdcBalance: "999999999999",
  };
  assert.doesNotThrow(() => assertTreasuryRangeManagerAllowanceSafety(cleanAllowances));
  assert.throws(() => assertTreasuryRangeManagerAllowanceSafety({
    ...cleanAllowances,
    managerNaraPermit2Allowance: "1",
  }), /allowance layers are not clean/);
});

test("burn ownership proof requires independent CALL_EXCEPTION results", () => {
  const callException = { status: "rejected", reason: { code: "CALL_EXCEPTION" } } as const;
  assert.equal(hasIndependentBurnOwnershipProof([callException, callException]), false);
  assert.equal(hasIndependentBurnOwnershipProof([callException, callException, callException]), true);
  assert.equal(hasIndependentBurnOwnershipProof([callException, callException, { status: "rejected", reason: { code: "NETWORK_ERROR" } }]), false);
  assert.equal(hasIndependentBurnOwnershipProof([callException, callException, { status: "fulfilled", value: MANAGER }]), false);
});

test("settled and cancelled races are terminal but remain distinguishable", () => {
  assert.equal(terminalOutcomeFromStatuses([2, 2]), "settled");
  assert.equal(terminalOutcomeFromStatuses([3, 3]), "cancelled");
  assert.equal(terminalOutcomeFromStatuses([2, 3]), "mixed_terminal");
  assert.equal(terminalOutcomeFromStatuses([1, 2]), "active");
  assert.equal(terminalOutcomeFromStatuses([]), "active");
});

test("pending transaction age is bounded without implying replacement", () => {
  assert.equal(classifyPendingAge(59_999, 60_000, 300_000), "fresh");
  assert.equal(classifyPendingAge(60_000, 60_000, 300_000), "alert");
  assert.equal(classifyPendingAge(300_000, 60_000, 300_000), "drop_check");
});

test("signed pending transaction state is durable before broadcast, intent-bound, and hash-cleared", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-pending-"));
  const path = join(directory, "pending.json");
  const store = new PendingSettlementStore(path);
  const wallet = new ethers.Wallet(TEST_KEY);
  const rawTransaction = await wallet.signTransaction({
    to: MANAGER,
    data: new ethers.Interface(RANGE_MANAGER_ABI).encodeFunctionData("settleMany", [[1n, 2n]]),
    value: 0n,
    chainId: 8453n,
    type: 2,
    nonce: 7,
    gasLimit: 500_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 100_000_000n,
  });
  const pending = {
    schemaVersion: PENDING_SETTLEMENT_SCHEMA,
    manager: MANAGER,
    wallet: wallet.address,
    transactionHash: ethers.keccak256(rawTransaction),
    rawTransaction,
    nonce: 7,
    orderIds: ["1", "2"],
    preparedAtMs: 1,
  };
  try {
    store.save(pending);
    assert.deepEqual(store.load(), pending);
    assert.throws(() => store.save(pending));
    assert.throws(() => store.clearAfterConfirmedReceipt(`0x${"33".repeat(32)}`), /PENDING_STATE_HASH_MISMATCH/);
    assert.throws(() => store.save({ ...pending, orderIds: ["1", "3"] }), /PENDING_STATE_MALFORMED/);
    store.clearAfterConfirmedReceipt(pending.transactionHash);
    assert.equal(store.load(), undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("configuration requires RPC deadlines below the whole-sweep watchdog", () => {
  assert.throws(() => readSettlerConfig(environment({
    SETTLER_RPC_REQUEST_TIMEOUT_MS: "10000",
    SETTLER_SWEEP_TIMEOUT_MS: "10000",
  })), /must be below/);
  const config = readSettlerConfig(environment({
    SETTLER_RPC_REQUEST_TIMEOUT_MS: "5000",
    SETTLER_SWEEP_TIMEOUT_MS: "45000",
  }));
  assert.equal(config.rpcRequestTimeoutMs, 5_000);
  assert.equal(config.sweepTimeoutMs, 45_000);
});

test("one silent RPC poisons three-provider consensus within a source-labelled deadline", async () => {
  const faults: RuntimeFault[] = [];
  const gate = new FatalRuntimeGate((fault) => faults.push(fault));
  const rpc = new RpcDeadlineSet(gate, 25);
  const never = new Promise<number>(() => undefined);
  const providers = {
    primary: { getBlockNumber: async () => 100 },
    secondary: { getBlockNumber: async () => 100 },
    fallback: { getBlockNumber: async () => never },
  } as unknown as { primary: ethers.Provider; secondary: ethers.Provider; fallback: ethers.Provider };
  const startedAt = Date.now();
  await assert.rejects(
    commonConfirmedPoint(providers, 1, rpc),
    (error: unknown) => error instanceof FatalRuntimeError &&
      error.fault.rpcSource === "fallback" && error.fault.operation === "getBlockNumber",
  );
  assert.ok(Date.now() - startedAt < 500);
  assert.equal(faults.length, 1);
  assert.throws(() => gate.assertHealthy(), /RPC_REQUEST_TIMEOUT/);

  const restartedGate = new FatalRuntimeGate();
  const restartedRpc = new RpcDeadlineSet(restartedGate, 25);
  const block = { hash: HASH, timestamp: 123 };
  const healthyProviders = {
    primary: { getBlockNumber: async () => 100, getBlock: async () => block },
    secondary: { getBlockNumber: async () => 100, getBlock: async () => block },
    fallback: { getBlockNumber: async () => 100, getBlock: async () => block },
  } as unknown as { primary: ethers.Provider; secondary: ethers.Provider; fallback: ethers.Provider };
  assert.deepEqual(await commonConfirmedPoint(healthyProviders, 1, restartedRpc), {
    number: 100,
    hash: HASH,
    timestamp: 123,
  });
});

test("whole-sweep timeout poisons queued work and a fresh coordinator recovers", async () => {
  const faults: RuntimeFault[] = [];
  const gate = new FatalRuntimeGate((fault) => faults.push(fault));
  let passes = 0;
  const coordinator = new SweepCoordinator(gate, 25, async () => {
    passes += 1;
    await new Promise<void>(() => undefined);
  });
  const first = coordinator.trigger("startup");
  await coordinator.trigger("primary_swap");
  await assert.rejects(first, (error: unknown) =>
    error instanceof FatalRuntimeError && error.fault.code === "SWEEP_TIMEOUT" && error.fault.operation === "startup"
  );
  assert.equal(passes, 1);
  assert.equal(faults.length, 1);
  await assert.rejects(coordinator.trigger("poll"), /SWEEP_TIMEOUT/);

  const restartedGate = new FatalRuntimeGate();
  let recovered = 0;
  const restarted = new SweepCoordinator(restartedGate, 25, async () => { recovered += 1; });
  await restarted.trigger("startup");
  assert.equal(recovered, 1);
});

test("fewer than three RPC responses cannot reach signing, persistence, or broadcast", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-rpc-timeout-"));
  const config = {
    ...readSettlerConfig(environment({
      SETTLER_PENDING_STATE_PATH: join(directory, "pending.json"),
      SETTLER_RECONCILIATION_DIRECTORY: join(directory, "reconciled"),
    })),
    rpcRequestTimeoutMs: 25,
    sweepTimeoutMs: 250,
  };
  let fatalTrips = 0;
  let broadcastCalls = 0;
  const gate = new FatalRuntimeGate(() => { fatalTrips += 1; });
  const never = new Promise<number>(() => undefined);
  const primary = {
    getBlockNumber: async () => 100,
    broadcastTransaction: async () => { broadcastCalls += 1; throw new Error("BROADCAST_MUST_NOT_RUN"); },
  } as unknown as ethers.Provider;
  const providers = {
    primary,
    secondary: { getBlockNumber: async () => 100 } as unknown as ethers.Provider,
    fallback: { getBlockNumber: async () => never } as unknown as ethers.Provider,
  };
  const pendingStore = new PendingSettlementStore(config.pendingStatePath);
  const executor = new SettlementExecutor(
    config,
    new Reconciler(providers, config, undefined, gate),
    primary,
    pendingStore,
    new SettlementReconciliationStore(config.reconciliationDirectory),
  );
  try {
    await assert.rejects(executor.execute([1n]), /RPC_REQUEST_TIMEOUT/);
    assert.equal(fatalTrips, 1);
    assert.equal(broadcastCalls, 0);
    assert.equal(pendingStore.load(), undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a hung broadcast poisons the runtime while preserving the exact signed intent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-broadcast-timeout-"));
  const config = {
    ...readSettlerConfig(environment({
      SETTLER_PENDING_STATE_PATH: join(directory, "pending.json"),
      SETTLER_RECONCILIATION_DIRECTORY: join(directory, "reconciled"),
    })),
    rpcRequestTimeoutMs: 25,
    sweepTimeoutMs: 250,
  };
  const gate = new FatalRuntimeGate();
  const rpc = new RpcDeadlineSet(gate, config.rpcRequestTimeoutMs);
  let broadcastCalls = 0;
  const neverBroadcast = new Promise<ethers.TransactionResponse>(() => undefined);
  const managerInterface = new ethers.Interface(RANGE_MANAGER_ABI);
  const provider = {
    getBalance: async () => 1_000_000_000_000_000_000n,
    call: async () => managerInterface.encodeFunctionResult("settleMany", [0n, 0n]),
    getFeeData: async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
    estimateGas: async () => 100_000n,
    broadcastTransaction: async () => { broadcastCalls += 1; return neverBroadcast; },
  } as unknown as ethers.Provider;
  const reconciler = {
    runtimeGate: gate,
    rpc,
    providers: { primary: provider, secondary: provider, fallback: provider },
    commonConfirmedPoint: async () => ({ number: 100, hash: HASH, timestamp: 123 }),
    sweep: async () => ({
      point: { number: 100, hash: HASH, timestamp: 123 },
      activeOrders: [],
      settleableOrderIds: [1n],
      treasuryRangeSafeNaraBalance: 0n,
      treasuryRangeSafeUsdcBalance: 0n,
      unknownPositionCount: 0n,
      allowanceClean: true as const,
      managerNaraBalance: 0n,
      managerUsdcBalance: 0n,
    }),
    nextWriteNonce: async () => 7,
  } as unknown as Reconciler;
  const pendingStore = new PendingSettlementStore(config.pendingStatePath);
  const executor = new SettlementExecutor(
    config,
    reconciler,
    provider,
    pendingStore,
    new SettlementReconciliationStore(config.reconciliationDirectory),
  );
  try {
    await assert.rejects(
      executor.execute([1n]),
      (error: unknown) => error instanceof FatalRuntimeError &&
        error.fault.rpcSource === "primary" && error.fault.operation === "broadcastTransaction.initial",
    );
    const persisted = pendingStore.load();
    assert.equal(broadcastCalls, 1);
    assert.deepEqual(persisted?.orderIds, ["1"]);
    assert.equal(persisted?.nonce, 7);
    assert.ok(persisted?.rawTransaction.startsWith("0x"));
    await assert.rejects(executor.execute([2n]), /RPC_REQUEST_TIMEOUT/);
    assert.deepEqual(new PendingSettlementStore(config.pendingStatePath).load(), persisted);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("exact rebroadcast rechecks dependency bindings and all-provider simulation before broadcast", async () => {
  const wallet = new ethers.Wallet(TEST_KEY);
  const rawTransaction = await wallet.signTransaction({
    to: MANAGER,
    data: new ethers.Interface(RANGE_MANAGER_ABI).encodeFunctionData("settleMany", [[1n]]),
    value: 0n,
    chainId: 8453n,
    type: 2,
    nonce: 7,
    gasLimit: 500_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 100_000_000n,
  });
  for (const failureStage of ["binding", "simulation"] as const) {
    const directory = mkdtempSync(join(tmpdir(), `nara-range-rebroadcast-${failureStage}-`));
    const config = readSettlerConfig(environment({
      SETTLER_PENDING_STATE_PATH: join(directory, "pending.json"),
      SETTLER_RECONCILIATION_DIRECTORY: join(directory, "reconciled"),
      SETTLER_PENDING_ALERT_AFTER_MS: "60000",
      SETTLER_PENDING_DROP_AFTER_MS: "300000",
    }));
    const pending = {
      schemaVersion: PENDING_SETTLEMENT_SCHEMA,
      manager: MANAGER,
      wallet: wallet.address,
      transactionHash: ethers.keccak256(rawTransaction),
      rawTransaction,
      nonce: 7,
      orderIds: ["1"],
      preparedAtMs: Date.now(),
    };
    const store = new PendingSettlementStore(config.pendingStatePath);
    store.save(pending);
    let bindingCalls = 0;
    let simulationCalls = 0;
    let broadcastCalls = 0;
    const point = { number: 100, hash: HASH, timestamp: 123 };
    const runtimeGate = new FatalRuntimeGate();
    const reconciler = {
      runtimeGate,
      receiptConsensus: async () => ({ state: "absent" as const }),
      terminalOutcome: async () => "active" as const,
      absentTransactionDisposition: async () => "dropped" as const,
      commonConfirmedPoint: async () => point,
      assertBindings: async () => {
        bindingCalls += 1;
        if (failureStage === "binding") throw new Error("USDC_DEPENDENCY_EVIDENCE_CHANGED");
      },
      assertExactSettlementSimulation: async (actualRaw: string, actualPoint: typeof point) => {
        simulationCalls += 1;
        assert.equal(actualRaw, rawTransaction);
        assert.deepEqual(actualPoint, point);
        if (failureStage === "simulation") throw new Error("PENDING_EXACT_SIMULATION_FAILED");
      },
    } as unknown as Reconciler;
    const provider = {
      broadcastTransaction: async () => {
        broadcastCalls += 1;
        throw new Error("BROADCAST_MUST_NOT_RUN");
      },
    } as unknown as ethers.Provider;
    const executor = new SettlementExecutor(
      config,
      reconciler,
      provider,
      store,
      new SettlementReconciliationStore(config.reconciliationDirectory),
    );
    try {
      await assert.rejects(
        executor.execute([99n]),
        failureStage === "binding" ? /USDC_DEPENDENCY_EVIDENCE_CHANGED/ : /PENDING_EXACT_SIMULATION_FAILED/,
      );
      assert.equal(bindingCalls, 1);
      assert.equal(simulationCalls, failureStage === "binding" ? 0 : 1);
      assert.equal(broadcastCalls, 0);
      assert.deepEqual(store.load(), pending);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("unconsumed signed nonce lineage survives terminal races and provider-local drops", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-lineage-"));
  const pendingPath = join(directory, "pending.json");
  const reconciledDirectory = join(directory, "reconciled");
  const config = readSettlerConfig(environment({
    SETTLER_PENDING_STATE_PATH: pendingPath,
    SETTLER_RECONCILIATION_DIRECTORY: reconciledDirectory,
    SETTLER_PENDING_ALERT_AFTER_MS: "60000",
    SETTLER_PENDING_DROP_AFTER_MS: "300000",
  }));
  const wallet = new ethers.Wallet(TEST_KEY);
  const rawTransaction = await wallet.signTransaction({
    to: MANAGER,
    data: new ethers.Interface(RANGE_MANAGER_ABI).encodeFunctionData("settleMany", [[1n, 2n]]),
    value: 0n,
    chainId: 8453n,
    type: 2,
    nonce: 7,
    gasLimit: 500_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 100_000_000n,
  });
  const pending = {
    schemaVersion: PENDING_SETTLEMENT_SCHEMA,
    manager: MANAGER,
    wallet: wallet.address,
    transactionHash: ethers.keccak256(rawTransaction),
    rawTransaction,
    nonce: 7,
    orderIds: ["1", "2"],
    preparedAtMs: Date.now() - 300_001,
  };
  const store = new PendingSettlementStore(pendingPath);
  store.save(pending);
  let terminal: TerminalOutcome = "cancelled";
  let canonicalReceipt = false;
  let nextNonceCalls = 0;
  const runtimeGate = new FatalRuntimeGate();
  const receipt = {
    hash: pending.transactionHash,
    status: 0,
    blockNumber: 321,
  } as ethers.TransactionReceipt;
  const reconciler = {
    runtimeGate,
    receiptConsensus: async () => canonicalReceipt
      ? { state: "agreed" as const, receipt }
      : { state: "absent" as const },
    receiptConfirmed: async () => true,
    assertSettlementTransaction: async () => undefined,
    terminalOutcome: async () => terminal,
    absentTransactionDisposition: async () => "dropped" as const,
    nextWriteNonce: async () => { nextNonceCalls += 1; return 7; },
  } as unknown as Reconciler;
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:1", 8453, { staticNetwork: true });
  const executor = new SettlementExecutor(
    config,
    reconciler,
    provider,
    store,
    new SettlementReconciliationStore(reconciledDirectory),
  );
  try {
    const terminalResult = await executor.execute([99n]);
    assert.equal(terminalResult.disposition, "nonce_lineage_blocked");
    assert.deepEqual(terminalResult.orderIds, [1n, 2n]);
    assert.deepEqual(store.load(), pending);

    terminal = "active";
    const restartedExecutor = new SettlementExecutor(
      config,
      reconciler,
      provider,
      new PendingSettlementStore(pendingPath),
      new SettlementReconciliationStore(reconciledDirectory),
    );
    const droppedResult = await restartedExecutor.execute([99n]);
    assert.equal(droppedResult.disposition, "dropped");
    assert.deepEqual(droppedResult.orderIds, [1n, 2n]);
    assert.deepEqual(store.load(), pending);

    const differentIntent = await restartedExecutor.execute([777n]);
    assert.equal(differentIntent.disposition, "dropped");
    assert.deepEqual(differentIntent.orderIds, [1n, 2n]);
    assert.equal(nextNonceCalls, 0);
    assert.deepEqual(store.load(), pending);

    canonicalReceipt = true;
    terminal = "cancelled";
    const consumed = await restartedExecutor.execute([777n]);
    assert.equal(consumed.disposition, "race_lost");
    assert.equal(store.load(), undefined);
  } finally {
    provider.destroy();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("full settlement accounting is durably recorded before pending state can clear", () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-reconciled-"));
  const store = new SettlementReconciliationStore(directory);
  const record: ReconciledSettlementRecord = {
    schemaVersion: RECONCILED_SETTLEMENT_SCHEMA,
    manager: MANAGER,
    wallet: new ethers.Wallet(TEST_KEY).address,
    transactionHash: HASH,
    nonce: 7,
    orderIds: ["1", "2"],
    receiptBlockNumber: 123,
    receiptBlockHash: `0x${"44".repeat(32)}`,
    naraOut: "10",
    usdcOut: "20",
    recordedAtMs: 123_000,
  };
  try {
    store.record(record);
    store.record(record);
    const persisted = JSON.parse(readFileSync(join(directory, `${HASH.slice(2)}.json`), "utf8"));
    assert.equal(persisted.usdcOut, "20");
    assert.throws(() => store.record({ ...record, usdcOut: "21" }), /RECONCILED_STATE_CONFLICT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("repository evidence permits only the exact untracked strategy manifest", () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-repository-"));
  const runGit = (args: string[]): string => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  const strategyPath = join(directory, "deployments", "strategy.json");
  try {
    runGit(["init", "--quiet"]);
    runGit(["config", "user.email", "range-test@example.invalid"]);
    runGit(["config", "user.name", "Range Test"]);
    writeFileSync(join(directory, ".gitignore"), "deployments/*\n");
    writeFileSync(join(directory, "tracked.txt"), "clean\n");
    runGit(["add", ".gitignore", "tracked.txt"]);
    runGit(["commit", "--quiet", "-m", "test: seed"]);
    mkdirSync(join(directory, "deployments"));
    writeFileSync(strategyPath, "{}\n");
    assert.doesNotThrow(() => assertTreasuryRangeRepositoryEvidence(directory, strategyPath));
    writeFileSync(join(directory, "deployments", "unexpected.json"), "unexpected\n");
    assert.throws(() => assertTreasuryRangeRepositoryEvidence(directory, strategyPath), /Only the exact resolved strategy manifest/);
    rmSync(join(directory, "deployments", "unexpected.json"));
    writeFileSync(join(directory, "tracked.txt"), "dirty\n");
    assert.throws(() => assertTreasuryRangeRepositoryEvidence(directory, strategyPath), /every tracked file to be clean/);
    runGit(["checkout", "--", "tracked.txt"]);
    runGit(["add", "-f", "deployments/strategy.json"]);
    runGit(["commit", "--quiet", "-m", "test: tracked strategy"]);
    assert.throws(() => assertTreasuryRangeRepositoryEvidence(directory, strategyPath), /must remain untracked/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("deployment artifact rebuild cleans tampered ignored bytes before a forced contract-only build", async () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-artifact-"));
  const artifact = join(directory, "artifacts", "manager.json");
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  try {
    mkdirSync(join(directory, "artifacts"));
    writeFileSync(artifact, "tampered ignored artifact\n");
    await forceRebuildTreasuryRangeManagerArtifact({
      getTask: (name) => ({
        run: async (args) => {
          calls.push({ name, args });
          if (name === "clean") rmSync(join(directory, "artifacts"), { recursive: true, force: true });
          if (name === "build") {
            assert.equal(existsSync(artifact), false);
            mkdirSync(join(directory, "artifacts"));
            writeFileSync(artifact, "fresh forced build\n");
          }
        },
      }),
    });
    assert.equal(readFileSync(artifact, "utf8"), "fresh forced build\n");
    assert.deepEqual(calls, [
      { name: "clean", args: {} },
      { name: "build", args: { force: true, noTests: true } },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("protected release evidence requires the exact pinned upstream protected-ref tip", () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-release-"));
  const remoteDirectory = join(directory, "remote.git");
  const runGit = (args: string[]): string => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  try {
    runGit(["init", "--quiet"]);
    execFileSync("git", ["init", "--bare", "--quiet", remoteDirectory]);
    runGit(["config", "user.email", "range-test@example.invalid"]);
    runGit(["config", "user.name", "Range Test"]);
    writeFileSync(join(directory, "tracked.txt"), "clean\n");
    runGit(["add", "tracked.txt"]);
    runGit(["commit", "--quiet", "-m", "test: seed"]);
    const head = runGit(["rev-parse", "HEAD"]);
    runGit(["remote", "add", "origin", remoteDirectory]);
    runGit(["push", "--quiet", "origin", `${head}:refs/heads/main`]);
    runGit(["update-ref", "refs/remotes/origin/main", head]);
    const testPolicy = { expectedUpstreamUrl: remoteDirectory, protectedRef: "refs/remotes/origin/main" };
    const evidence = readTreasuryRangeProtectedReleaseEvidence(directory, head, {
      V4_TREASURY_RANGE_RELEASE_COMMIT: head,
      V4_TREASURY_RANGE_EXPECTED_UPSTREAM_URL: "https://attacker.invalid/fork.git",
      V4_TREASURY_RANGE_PROTECTED_REF: "origin/attacker",
    }, testPolicy);
    assert.equal(evidence.expectedUpstreamUrl, remoteDirectory);
    assert.equal(evidence.protectedRef, "refs/remotes/origin/main");
    assert.throws(() => readTreasuryRangeProtectedReleaseEvidence(directory, head, {
      V4_TREASURY_RANGE_RELEASE_COMMIT: head,
    }, { ...testPolicy, protectedRef: "HEAD" }), /origin remote-tracking/);
    writeFileSync(join(directory, "tracked.txt"), "new remote commit\n");
    runGit(["add", "tracked.txt"]);
    runGit(["commit", "--quiet", "-m", "test: remote advanced"]);
    const advanced = runGit(["rev-parse", "HEAD"]);
    assert.doesNotThrow(() => assertTreasuryRangeStrategyRelease(directory, head, advanced, {
      emergencyExit: true,
    }));
    assert.throws(() => assertTreasuryRangeStrategyRelease(directory, head, advanced), /current committed HEAD/);
    assert.throws(() => assertTreasuryRangeStrategyRelease(directory, advanced, head, {
      emergencyExit: true,
    }), /not an ancestor/);
    runGit(["push", "--quiet", "origin", `${advanced}:refs/heads/main`]);
    runGit(["update-ref", "refs/remotes/origin/main", head]);
    assert.throws(() => readTreasuryRangeProtectedReleaseEvidence(directory, head, {
      V4_TREASURY_RANGE_RELEASE_COMMIT: head,
    }, testPolicy), /live remote protected-ref attestation/);
    runGit(["update-ref", "refs/remotes/origin/main", advanced]);
    assert.throws(() => readTreasuryRangeProtectedReleaseEvidence(directory, head, {
      V4_TREASURY_RANGE_RELEASE_COMMIT: head,
    }, testPolicy), /live remote protected-ref attestation/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("manager deployment evidence v3 keeps deployment execution and treasury custody distinct", () => {
  const infrastructureAddress = "0x2222222222222222222222222222222222222222";
  const evidence = {
    schemaVersion: "nara.v4.treasury-range-manager-deployment.v3",
    status: "deployed_verified",
    originCommit: "ab".repeat(20),
    deploymentTransactionHash: HASH,
    deploymentBlock: 123,
    deploymentBlockHash: `0x${"33".repeat(32)}`,
    predictedAddress: MANAGER,
    deployedAddress: MANAGER,
    runtimeCodeHash: `0x${"44".repeat(32)}`,
    deploymentExecutorSafeExecution: {
      safe: DEPLOYMENT_EXECUTOR_SAFE,
      transactionHash: HASH,
      safeTransactionHash: `0x${"55".repeat(32)}`,
      nonce: "7",
      executionSuccessLogIndex: 2,
      safeTransaction: {
        to: infrastructureAddress, value: "0", data: "0x1234", operation: 1,
        safeTxGas: "0", baseGas: "0", gasPrice: "0",
        gasToken: ethers.ZeroAddress, refundReceiver: ethers.ZeroAddress, nonce: "7",
      },
      packedTransactionsHash: `0x${"66".repeat(32)}`,
      multiSendCallOnly: infrastructureAddress,
      multiSendCallOnlyCodeHash: `0x${"77".repeat(32)}`,
      innerCalls: [{ to: infrastructureAddress, value: "0", data: "0x5678" }],
    },
    treasuryRangeSafePolicy: {
      address: TREASURY_RANGE_SAFE,
      runtimeCodeHash: `0x${"ab".repeat(32)}`,
      version: "1.4.1",
      threshold: "1",
      ownerCount: 1,
      ownerSetHash: `0x${"bc".repeat(32)}`,
    },
    create2Deployment: {
      deployer: infrastructureAddress,
      deployedAddress: MANAGER,
      salt: `0x${"88".repeat(32)}`,
      initCodeHash: `0x${"99".repeat(32)}`,
      deployedLogIndex: 4,
    },
    constructorBindings: {
      treasurySafe: TREASURY_RANGE_SAFE,
      nara: infrastructureAddress,
      usdc: infrastructureAddress,
      liquidityVault: infrastructureAddress,
      poolManager: infrastructureAddress,
      positionManager: infrastructureAddress,
      permit2: infrastructureAddress,
      hook: infrastructureAddress,
      poolFee: 3000, tickSpacing: 60, poolId: `0x${"aa".repeat(32)}`, deploymentDeadline: "123456",
    },
  };
  const parsed = parseTreasuryRangeManagerDeploymentEvidence(evidence);
  assert.equal(parsed.deploymentExecutorSafeExecution.nonce, "7");
  assert.equal(parsed.deploymentExecutorSafeExecution.safe, DEPLOYMENT_EXECUTOR_SAFE);
  assert.equal(parsed.treasuryRangeSafePolicy.address, TREASURY_RANGE_SAFE);
  assert.equal(parsed.constructorBindings.treasurySafe, TREASURY_RANGE_SAFE);
  assert.notEqual(parsed.deploymentExecutorSafeExecution.safe, parsed.treasuryRangeSafePolicy.address);
  assert.throws(() => parseTreasuryRangeManagerDeploymentEvidence({
    ...evidence,
    schemaVersion: "nara.v4.treasury-range-manager-deployment.v2",
  }), /exact deployed_verified v3 schema/);
  assert.throws(() => parseTreasuryRangeManagerDeploymentEvidence({
    ...evidence,
    deploymentExecutorSafeExecution: { ...evidence.deploymentExecutorSafeExecution, nonce: "8" },
  }), /exactly match/);
  assert.throws(() => parseTreasuryRangeManagerDeploymentEvidence({
    ...evidence,
    treasuryRangeSafePolicy: { ...evidence.treasuryRangeSafePolicy, threshold: "2" },
  }), /exact approved 1-of-1 topology/);
  assert.throws(() => parseTreasuryRangeManagerDeploymentEvidence({
    ...evidence,
    treasuryRangeSafePolicy: { ...evidence.treasuryRangeSafePolicy, address: DEPLOYMENT_EXECUTOR_SAFE },
  }), /deployment executor and Treasury custody Safe must be distinct/);
  assert.throws(() => parseTreasuryRangeManagerDeploymentEvidence({
    ...evidence,
    constructorBindings: { ...evidence.constructorBindings, treasurySafe: DEPLOYMENT_EXECUTOR_SAFE },
  }), /constructor Treasury Safe must match the receipt-bound custody policy/);
});

test("staged crash leftovers are rejected before JIT packet construction", () => {
  const directory = mkdtempSync(join(tmpdir(), "nara-range-packet-"));
  try {
    writeFileSync(join(directory, "PENDING-UNEXECUTED-v4-treasury-range-orders-123-nonce-4-DO-NOT-IMPORT.json"), "{}");
    assert.throws(() => refuseStalePackets(directory, "orders"), /Stale treasury-range packets/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
