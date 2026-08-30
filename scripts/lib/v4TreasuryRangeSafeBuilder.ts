import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { ethers } from "ethers";
import { canonicalProductionV4Deployment, requiredBaseRpcUrl } from "./v4LiveConfig.js";
import { parseDecimalRational } from "./v4TreasuryRangeMath.js";
import {
  buildAndSimulateSafeBatch,
  decodeAndVerifySafeExecution,
  decodeMultiSendCalls,
  type SafeBatchCall,
  type SafeBatchSimulationEvidence,
} from "./v4SafeBatch.js";
import { readCanonicalNaraSafeEvidence, type CanonicalSafeEvidence } from "./v4SafeEvidence.js";
import {
  prettyTreasuryRangeJson,
  sha256Hex,
  treasuryRangeHookConfigurationHash,
  type TreasuryRangeStrategyManifest,
  type TreasuryRangeStrategyOrder,
} from "./v4TreasuryRangeManifest.js";
import { assertOneSidedAtCreation, planTreasuryRange } from "./v4TreasuryRangePlanner.js";
import {
  assertCircleFiatTokenDependencyExact,
  readCircleFiatTokenDependency,
  type CircleFiatTokenDependencyEvidence,
} from "./v4UsdcDependency.js";

export const TREASURY_RANGE_CHAIN_ID = 8453n;
export const TREASURY_RANGE_MAX_SNAPSHOT_AGE_SECONDS = 15 * 60;
export const TREASURY_RANGE_DEFAULT_DEADLINE_SECONDS = 15 * 60;
export const TREASURY_RANGE_MAX_DEADLINE_SECONDS = 30 * 60;

export function createTreasuryRangeProvider(rpcUrl: string): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(
    rpcUrl,
    { chainId: Number(TREASURY_RANGE_CHAIN_ID), name: "base" },
    { staticNetwork: true, batchMaxCount: 1 },
  );
}

export const TREASURY_RANGE_MANAGER_ABI = [
  "function NARA() view returns(address)",
  "function USDC() view returns(address)",
  "function TREASURY_SAFE() view returns(address)",
  "function LIQUIDITY_VAULT() view returns(address)",
  "function POOL_MANAGER() view returns(address)",
  "function POSITION_MANAGER() view returns(address)",
  "function PERMIT2() view returns(address)",
  "function HOOK() view returns(address)",
  "function POOL_FEE() view returns(uint24)",
  "function TICK_SPACING() view returns(int24)",
  "function POOL_ID() view returns(bytes32)",
  "function DEPLOYMENT_DEADLINE() view returns(uint64)",
  "function MAX_SETTLE_BATCH() view returns(uint256)",
  "function activeOrderCount() view returns(uint256)",
  "function getActiveOrderIds(uint256 offset,uint256 limit) view returns(uint256[] orderIds,uint256 nextOffset)",
  "function getOrder(uint256 orderId) view returns(uint256 tokenId,uint256 inputAmount,uint256 minimumOutputAmount,bytes32 strategyHash,uint128 liquidity,int24 tickLower,int24 tickUpper,uint64 createdBlock,uint64 creationDeadline,uint64 terminalBlock,uint8 side,uint8 status)",
  "function currentPoolState() view returns(uint160,int24,uint128,uint24,uint24)",
  "function createSellNaraOrder(int24 tickLower,int24 tickUpper,uint128 inputAmount,uint128 minimumOutputAmount,bytes32 strategyHash,uint64 deadline) returns(uint256 orderId,uint256 tokenId)",
  "function createBuyNaraOrder(int24 tickLower,int24 tickUpper,uint128 inputAmount,uint128 minimumOutputAmount,bytes32 strategyHash,uint64 deadline) returns(uint256 orderId,uint256 tokenId)",
  "function cancel(uint256 orderId,uint128 minNaraOut,uint128 minUsdcOut,uint64 deadline) returns(uint256 naraOut,uint256 usdcOut)",
  "function assertOperationalClean() view returns(bool)",
] as const;

export const CREATE2_DEPLOYER_ABI = [
  "function owner() view returns(address)",
  "function deploy(bytes32 salt,bytes initCode) returns(address)",
  "function computeAddress(bytes32 salt,bytes32 initCodeHash) view returns(address)",
  "event Deployed(address indexed deployed,bytes32 indexed salt,bytes32 indexed initCodeHash)",
] as const;

export const ERC20_APPROVAL_ABI = [
  "function balanceOf(address account) view returns(uint256)",
  "function allowance(address owner,address spender) view returns(uint256)",
  "function approve(address spender,uint256 amount) returns(bool)",
] as const;

export const PERMIT2_APPROVAL_ABI = [
  "function allowance(address owner,address token,address spender) view returns(uint160 amount,uint48 expiration,uint48 nonce)",
] as const;

export interface TreasuryRangeProtectedReleaseEvidence {
  expectedUpstreamUrl: string;
  protectedRef: string;
  releaseCommit: string;
}

export interface TreasuryRangeBuildContext {
  provider: ethers.JsonRpcProvider;
  strategy: TreasuryRangeStrategyManifest;
  block: ethers.Block;
  safeEvidence: CanonicalSafeEvidence;
  productionRuntime: Record<string, { address: string; codeHash: string }>;
  usdcDependency: CircleFiatTokenDependencyEvidence;
  usdcDependencyEnforcement: "exact" | "emergency_exit_bypass";
  protectedRelease: TreasuryRangeProtectedReleaseEvidence;
}

export interface TreasuryRangeSafeReview {
  changeId: string;
  purpose: string;
  noBroadcast: true;
  humanApprovalRequired: true;
  repositoryHead: string;
  strategyHash: string;
  chainId: "8453";
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
  validUntil: number;
  safe: CanonicalSafeEvidence;
  calls: readonly SafeBatchCall[];
  simulation: SafeBatchSimulationEvidence;
  runtime: Record<string, { address: string; codeHash: string }>;
  externalDependencies: {
    usdc: {
      enforcement: TreasuryRangeBuildContext["usdcDependencyEnforcement"];
      evidence: CircleFiatTokenDependencyEvidence;
    };
  };
  protectedRelease: TreasuryRangeProtectedReleaseEvidence;
  checks: readonly string[];
  details: Record<string, unknown>;
}

export interface TreasuryRangeViewCheck {
  label: string;
  target: string;
  method: string;
  args: readonly unknown[];
  expected: unknown;
}

export interface TreasuryRangeManagerSafetyState {
  safeNaraAllowance: string;
  safeUsdcAllowance: string;
  managerNaraPermit2Allowance: string;
  managerUsdcPermit2Allowance: string;
  permit2NaraPositionManagerAllowance: string;
  permit2UsdcPositionManagerAllowance: string;
  managerNaraBalance: string;
  managerUsdcBalance: string;
}

export interface TreasuryRangeEconomicRecomputation {
  side: TreasuryRangeStrategyOrder["side"];
  tickLower: string;
  tickUpper: string;
  inputAmountRaw: string;
  expectedInputUsedRaw: string;
  expectedOutputAmountRaw: string;
  minimumOutputAmountRaw: string;
  expectedLiquidity: string;
  expectedDustNaraRaw: string;
  expectedDustUsdcRaw: string;
  toleranceBps: string;
  alignedLowerUsdcPerNara: { numerator: string; denominator: string };
  alignedUpperUsdcPerNara: { numerator: string; denominator: string };
  geometricExecutionReferenceWad: string;
}

export interface TreasuryRangeHardhatTasks {
  getTask(name: "clean" | "build"): { run(args: Record<string, unknown>): Promise<unknown> };
}

export async function forceRebuildTreasuryRangeManagerArtifact(tasks: TreasuryRangeHardhatTasks): Promise<void> {
  await tasks.getTask("clean").run({});
  await tasks.getTask("build").run({ force: true, noTests: true });
}

export interface TreasuryRangeManagerDeploymentEvidence {
  schemaVersion: "nara.v4.treasury-range-manager-deployment.v2";
  status: "deployed_verified";
  originCommit: string;
  deploymentTransactionHash: string;
  deploymentBlock: number;
  deploymentBlockHash: string;
  predictedAddress: string;
  deployedAddress: string;
  runtimeCodeHash: string;
  safeExecution: {
    safe: string;
    transactionHash: string;
    safeTransactionHash: string;
    nonce: string;
    executionSuccessLogIndex: number;
    safeTransaction: SafeBatchSimulationEvidence["safeTransaction"];
    packedTransactionsHash: string;
    multiSendCallOnly: string;
    multiSendCallOnlyCodeHash: string;
    innerCalls: readonly SafeBatchCall[];
  };
  create2Deployment: {
    deployer: string;
    deployedAddress: string;
    salt: string;
    initCodeHash: string;
    deployedLogIndex: number;
  };
  constructorBindings: {
    treasurySafe: string;
    nara: string;
    usdc: string;
    liquidityVault: string;
    poolManager: string;
    positionManager: string;
    permit2: string;
    hook: string;
    poolFee: number;
    tickSpacing: number;
    poolId: string;
    deploymentDeadline: string;
  };
}

function redact(value: string): string {
  return value.replace(/(?:https?|wss?):\/\/[^\s"']+/gi, "<redacted-url>");
}

export function safeTreasuryRangeError(error: unknown): string {
  return redact(error instanceof Error ? error.message : "Treasury range Safe packet build failed");
}

function repositoryHead(repositoryRoot: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim().toLowerCase();
}

function gitOutput(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: repositoryRoot, encoding: "utf8" });
}

function repositoryRelativePath(repositoryRoot: string, requestedPath: string, label: string): string {
  const absolute = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(repositoryRoot, requestedPath);
  const local = relative(repositoryRoot, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`${label} must remain inside the authoritative repository`);
  }
  return local.replaceAll("\\", "/");
}

export function assertTreasuryRangeRepositoryEvidence(repositoryRoot: string, strategyPath: string): void {
  const trackedWorktree = gitOutput(repositoryRoot, ["diff", "--name-only", "--"] ).trim();
  const trackedIndex = gitOutput(repositoryRoot, ["diff", "--cached", "--name-only", "--"]).trim();
  if (trackedWorktree || trackedIndex) {
    throw new Error("Safe packet generation requires every tracked file to be clean");
  }
  const strategyRelative = repositoryRelativePath(repositoryRoot, strategyPath, "Strategy manifest");
  if (!existsSync(resolve(repositoryRoot, strategyRelative))) {
    throw new Error("The generated strategy manifest does not exist");
  }
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", strategyRelative], { cwd: repositoryRoot, stdio: "ignore" });
    throw new Error("The generated strategy manifest must remain untracked to preserve committed-HEAD binding");
  } catch (error) {
    if (error instanceof Error && error.message.includes("must remain untracked")) throw error;
  }
  const visibleUntracked = gitOutput(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const ignoredSourceArtifacts = gitOutput(repositoryRoot, [
    "ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--",
    "contracts", "deployments", "docs", "scripts", "services", "test",
  ]);
  const untracked = [...new Set(`${visibleUntracked}${ignoredSourceArtifacts}`
    .split("\0")
    .filter(Boolean)
    .map((item) => item.replaceAll("\\", "/")))];
  if (untracked.length !== 1 || untracked[0] !== strategyRelative) {
    throw new Error("Only the exact resolved strategy manifest may be untracked during packet generation");
  }
}

function normalizeGitRemote(value: string): string {
  return value.trim().replace(/\.git$/i, "").replace(/^git@([^:]+):/, "ssh://git@$1/").replace(/\/$/, "").toLowerCase();
}

function assertRemoteHasNoEmbeddedHttpCredentials(value: string): void {
  if (!/^https?:\/\//i.test(value)) return;
  const url = new URL(value);
  if (url.username || url.password) throw new Error("Protected upstream URL must not embed credentials");
}

export function readTreasuryRangeProtectedReleaseEvidence(
  repositoryRoot: string,
  head: string,
  environment: NodeJS.ProcessEnv = process.env,
): TreasuryRangeProtectedReleaseEvidence {
  const expectedUpstreamUrl = environment.V4_TREASURY_RANGE_EXPECTED_UPSTREAM_URL?.trim();
  const protectedRef = environment.V4_TREASURY_RANGE_PROTECTED_REF?.trim();
  const releaseCommit = environment.V4_TREASURY_RANGE_RELEASE_COMMIT?.trim().toLowerCase();
  if (!expectedUpstreamUrl || !protectedRef || !releaseCommit) {
    throw new Error("Explicit protected release evidence is required: expected upstream URL, protected ref, and release commit");
  }
  assertRemoteHasNoEmbeddedHttpCredentials(expectedUpstreamUrl);
  if (!/^[0-9a-f]{40}$/.test(releaseCommit) || releaseCommit !== head) {
    throw new Error("V4_TREASURY_RANGE_RELEASE_COMMIT must equal the exact committed HEAD");
  }
  const normalizedProtectedRef = protectedRef.startsWith("refs/remotes/")
    ? protectedRef
    : `refs/remotes/${protectedRef}`;
  if (!/^refs\/remotes\/origin\/[A-Za-z0-9._\/-]+$/.test(normalizedProtectedRef) || normalizedProtectedRef.includes("..")) {
    throw new Error("V4_TREASURY_RANGE_PROTECTED_REF must name an origin remote-tracking protected ref");
  }
  const actualUpstream = gitOutput(repositoryRoot, ["remote", "get-url", "origin"]).trim();
  assertRemoteHasNoEmbeddedHttpCredentials(actualUpstream);
  if (normalizeGitRemote(actualUpstream) !== normalizeGitRemote(expectedUpstreamUrl)) {
    throw new Error("Repository origin does not match the explicitly approved upstream URL");
  }
  let protectedCommit: string;
  let remoteCommit: string;
  try {
    protectedCommit = gitOutput(repositoryRoot, ["rev-parse", "--verify", `${normalizedProtectedRef}^{commit}`]).trim().toLowerCase();
    const branch = normalizedProtectedRef.slice("refs/remotes/origin/".length);
    const remoteRef = `refs/heads/${branch}`;
    const remoteLines = execFileSync("git", ["ls-remote", "--exit-code", "--refs", expectedUpstreamUrl, remoteRef], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().split(/\r?\n/).filter(Boolean);
    if (remoteLines.length !== 1) throw new Error("Remote protected ref is missing or ambiguous");
    const [remoteSha, reportedRef, ...extra] = remoteLines[0].split(/\s+/);
    if (extra.length !== 0 || reportedRef !== remoteRef || !/^[0-9a-fA-F]{40}$/.test(remoteSha)) {
      throw new Error("Remote protected ref attestation is malformed");
    }
    remoteCommit = remoteSha.toLowerCase();
    if (protectedCommit !== remoteCommit) throw new Error("Local origin ref does not match the remote protected ref");
    execFileSync("git", ["merge-base", "--is-ancestor", releaseCommit, remoteCommit], { cwd: repositoryRoot, stdio: "ignore" });
  } catch {
    throw new Error("Release commit lacks matching live remote protected-ref attestation");
  }
  return { expectedUpstreamUrl, protectedRef: normalizedProtectedRef, releaseCommit };
}

function envInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe integer`);
  return parsed;
}

export function jitDeadline(blockTimestamp: number): number {
  const lifetime = envInteger("V4_TREASURY_RANGE_DEADLINE_SECONDS", TREASURY_RANGE_DEFAULT_DEADLINE_SECONDS);
  if (lifetime < 60 || lifetime > TREASURY_RANGE_MAX_DEADLINE_SECONDS) {
    throw new Error(`V4_TREASURY_RANGE_DEADLINE_SECONDS must be between 60 and ${TREASURY_RANGE_MAX_DEADLINE_SECONDS}`);
  }
  return blockTimestamp + lifetime;
}

export async function readTreasuryRangeBuildContext(
  repositoryRoot: string,
  strategyPath: string,
  strategy: TreasuryRangeStrategyManifest,
  options: Readonly<{ enforceUsdcDependency?: boolean }> = {},
): Promise<TreasuryRangeBuildContext> {
  assertTreasuryRangeRepositoryEvidence(repositoryRoot, strategyPath);
  const head = repositoryHead(repositoryRoot);
  if (head !== strategy.repositoryHead) throw new Error("Strategy repositoryHead is not the current committed HEAD");
  const protectedRelease = readTreasuryRangeProtectedReleaseEvidence(repositoryRoot, head);
  const provider = createTreasuryRangeProvider(requiredBaseRpcUrl());
  const network = await provider.getNetwork();
  if (network.chainId !== TREASURY_RANGE_CHAIN_ID) throw new Error("RPC is not Base chain 8453");
  const latest = await provider.getBlock("latest");
  if (!latest?.hash || /^0x0{64}$/i.test(latest.hash)) throw new Error("RPC latest block is missing a canonical hash");
  if (strategy.pinnedState.timestamp > latest.timestamp || latest.timestamp - strategy.pinnedState.timestamp > TREASURY_RANGE_MAX_SNAPSHOT_AGE_SECONDS) {
    throw new Error("Strategy snapshot is stale; regenerate exact fork/state evidence before building a packet");
  }
  const pinned = await provider.getBlock(strategy.pinnedState.blockNumber);
  if (!pinned?.hash || pinned.hash.toLowerCase() !== strategy.pinnedState.blockHash) {
    throw new Error("Strategy block hash is no longer canonical");
  }

  const production = canonicalProductionV4Deployment();
  const coreManifest = JSON.parse(readFileSync(production.manifestPath, "utf8")) as {
    infrastructure: { officialV4Quoter: string };
  };
  const exactAddresses: ReadonlyArray<[string, string, string]> = [
    ["safe", strategy.addresses.safe, production.safe],
    ["nara", strategy.addresses.nara, production.token],
    ["usdc", strategy.addresses.usdc, production.base],
    ["hook", strategy.addresses.hook, production.hook],
    ["poolManager", strategy.addresses.poolManager, production.poolManager],
    ["positionManager", strategy.addresses.positionManager, production.positionManager],
    ["permit2", strategy.addresses.permit2, production.permit2],
    ["liquidityVault", strategy.addresses.liquidityVault, production.vault],
    ["liquidityCompounder", strategy.addresses.liquidityCompounder, production.compounder],
    ["universalRouter", strategy.addresses.universalRouter, production.universalRouter],
    ["officialV4Quoter", strategy.addresses.officialV4Quoter, coreManifest.infrastructure.officialV4Quoter],
    ["create2HookDeployer", strategy.addresses.create2HookDeployer, production.create2HookDeployer],
  ];
  for (const [label, actual, expected] of exactAddresses) {
    if (ethers.getAddress(actual) !== ethers.getAddress(expected)) throw new Error(`Strategy ${label} differs from the hash-pinned production manifest`);
  }
  if (strategy.poolId !== production.poolId || strategy.poolKey.currency0 !== production.base || strategy.poolKey.currency1 !== production.token ||
      strategy.poolKey.hooks !== production.hook) {
    throw new Error("Strategy PoolId or currency orientation differs from production");
  }
  if (strategy.poolKey.fee !== production.poolFee || strategy.poolKey.tickSpacing !== production.tickSpacing) {
    throw new Error("Strategy fee or tick spacing differs from production");
  }

  const expectedCore: ReadonlyArray<[string, string, string]> = [
    ["nara", production.token, production.runtimeCodeHashes.token],
    ["hook", production.hook, production.runtimeCodeHashes.hook],
    ["safe", production.safe, production.runtimeCodeHashes.safe],
  ];
  const productionRuntime: Record<string, { address: string; codeHash: string }> = {};
  for (const [label, target, expectedHash] of expectedCore) {
    const code = await provider.getCode(target, latest.number);
    const codeHash = code === "0x" ? "0x" : ethers.keccak256(code).toLowerCase();
    if (codeHash !== expectedHash.toLowerCase() || strategy.runtimeCodeHashes[label]?.toLowerCase() !== codeHash) {
      throw new Error(`${label} runtime differs from both strategy and production evidence`);
    }
    productionRuntime[label] = { address: ethers.getAddress(target), codeHash };
  }
  for (const label of [
    "usdc", "liquidityVault", "liquidityCompounder", "poolManager", "positionManager", "permit2",
    "universalRouter", "officialV4Quoter", "create2HookDeployer",
  ] as const) {
    if (label === "usdc" && options.enforceUsdcDependency === false) continue;
    const target = strategy.addresses[label];
    const expected = strategy.runtimeCodeHashes[label]?.toLowerCase();
    if (!expected) throw new Error(`Strategy is missing runtimeCodeHashes.${label}`);
    const code = await provider.getCode(target, latest.number);
    const codeHash = code === "0x" ? "0x" : ethers.keccak256(code).toLowerCase();
    if (codeHash !== expected) throw new Error(`${label} runtime differs from strategy evidence`);
    productionRuntime[label] = { address: target, codeHash };
  }
  const positionManager = new ethers.Contract(strategy.addresses.positionManager, [
    "function poolManager() view returns(address)",
    "function permit2() view returns(address)",
  ], provider);
  const hook = new ethers.Contract(strategy.addresses.hook, [
    "function token() view returns(address)",
    "function base() view returns(address)",
    "function vault() view returns(address)",
    "function poolManager() view returns(address)",
    "function registeredPoolId() view returns(bytes32)",
    "function poolRegistered() view returns(bool)",
  ], provider);
  const vault = new ethers.Contract(strategy.addresses.liquidityVault, [
    "function token() view returns(address)", "function base() view returns(address)",
    "function hook() view returns(address)", "function compounder() view returns(address)",
  ], provider);
  const compounder = new ethers.Contract(strategy.addresses.liquidityCompounder, [
    "function nara() view returns(address)", "function usdc() view returns(address)",
    "function poolManager() view returns(address)", "function positionManager() view returns(address)",
    "function permit2() view returns(address)", "function vault() view returns(address)",
    "function hooks() view returns(address)", "function poolFee() view returns(uint24)",
    "function tickSpacing() view returns(int24)", "function poolId() view returns(bytes32)",
  ], provider);
  const create2 = new ethers.Contract(strategy.addresses.create2HookDeployer, CREATE2_DEPLOYER_ABI, provider);
  const [
    pmPoolManager, pmPermit2, hookToken, hookBase, hookVault, hookPoolManager, hookPoolId, hookRegistered,
    vaultToken, vaultBase, vaultHook, vaultCompounder, compounderNara, compounderUsdc, compounderPoolManager,
    compounderPositionManager, compounderPermit2, compounderVault, compounderHook, compounderFee,
    compounderSpacing, compounderPoolId, create2Owner,
  ] = await Promise.all([
    positionManager.poolManager({ blockTag: latest.number }),
    positionManager.permit2({ blockTag: latest.number }),
    hook.token({ blockTag: latest.number }),
    hook.base({ blockTag: latest.number }),
    hook.vault({ blockTag: latest.number }),
    hook.poolManager({ blockTag: latest.number }),
    hook.registeredPoolId({ blockTag: latest.number }),
    hook.poolRegistered({ blockTag: latest.number }),
    vault.token({ blockTag: latest.number }), vault.base({ blockTag: latest.number }),
    vault.hook({ blockTag: latest.number }), vault.compounder({ blockTag: latest.number }),
    compounder.nara({ blockTag: latest.number }), compounder.usdc({ blockTag: latest.number }),
    compounder.poolManager({ blockTag: latest.number }), compounder.positionManager({ blockTag: latest.number }),
    compounder.permit2({ blockTag: latest.number }), compounder.vault({ blockTag: latest.number }),
    compounder.hooks({ blockTag: latest.number }), compounder.poolFee({ blockTag: latest.number }),
    compounder.tickSpacing({ blockTag: latest.number }), compounder.poolId({ blockTag: latest.number }),
    create2.owner({ blockTag: latest.number }),
  ]);
  const reciprocal: ReadonlyArray<[string, string, string]> = [
    ["PositionManager.poolManager", pmPoolManager, production.poolManager],
    ["PositionManager.permit2", pmPermit2, production.permit2],
    ["Hook.token", hookToken, production.token],
    ["Hook.base", hookBase, production.base],
    ["Hook.vault", hookVault, production.vault],
    ["Hook.poolManager", hookPoolManager, production.poolManager],
    ["Vault.token", vaultToken, production.token],
    ["Vault.base", vaultBase, production.base],
    ["Vault.hook", vaultHook, production.hook],
    ["Vault.compounder", vaultCompounder, production.compounder],
    ["Compounder.nara", compounderNara, production.token],
    ["Compounder.usdc", compounderUsdc, production.base],
    ["Compounder.poolManager", compounderPoolManager, production.poolManager],
    ["Compounder.positionManager", compounderPositionManager, production.positionManager],
    ["Compounder.permit2", compounderPermit2, production.permit2],
    ["Compounder.vault", compounderVault, production.vault],
    ["Compounder.hooks", compounderHook, production.hook],
    ["CREATE2 owner", create2Owner, production.safe],
  ];
  for (const [label, actual, expected] of reciprocal) {
    if (ethers.getAddress(actual) !== ethers.getAddress(expected)) throw new Error(`${label} reciprocal binding mismatch`);
  }
  if (String(hookPoolId).toLowerCase() !== production.poolId || hookRegistered !== true) throw new Error("Hook pool registration differs from production");
  if (BigInt(compounderFee) !== BigInt(production.poolFee) || BigInt(compounderSpacing) !== BigInt(production.tickSpacing) ||
      String(compounderPoolId).toLowerCase() !== production.poolId) throw new Error("Compounder PoolKey binding differs from production");
  const safeEvidence = await readCanonicalNaraSafeEvidence(provider, production.safe, production.safeCodeHash, latest.number);
  const preliminaryContext: TreasuryRangeBuildContext = {
    provider,
    strategy,
    block: latest,
    safeEvidence,
    productionRuntime,
    protectedRelease,
    usdcDependency: strategy.externalDependencies.usdc,
    usdcDependencyEnforcement: options.enforceUsdcDependency === false ? "emergency_exit_bypass" : "exact",
  };
  const usdcDependency = options.enforceUsdcDependency === false
    ? strategy.externalDependencies.usdc
    : await assertTreasuryRangeUsdcDependency(preliminaryContext);
  return { ...preliminaryContext, usdcDependency };
}

export async function assertTreasuryRangeUsdcDependency(
  context: TreasuryRangeBuildContext,
  additionalAccounts: Readonly<Record<string, string>> = {},
): Promise<CircleFiatTokenDependencyEvidence> {
  const expected = context.strategy.externalDependencies.usdc;
  for (const [label, account] of Object.entries(additionalAccounts)) {
    const existing = expected.monitoredAccounts[label];
    if (existing && ethers.getAddress(existing.address) !== ethers.getAddress(account)) {
      throw new Error(`USDC monitored account ${label} cannot override strategy evidence`);
    }
  }
  const monitoredAccounts = {
    ...Object.fromEntries(Object.entries(expected.monitoredAccounts).map(([label, account]) => [label, account.address])),
    ...additionalAccounts,
  };
  const expectedWithAdditional = {
    ...expected,
    monitoredAccounts: {
      ...expected.monitoredAccounts,
      ...Object.fromEntries(Object.entries(additionalAccounts).map(([label, account]) => [label, {
        address: ethers.getAddress(account),
        isBlacklisted: false,
      }])),
    },
  };
  const actual = await readCircleFiatTokenDependency(
    context.provider,
    context.strategy.addresses.usdc,
    monitoredAccounts,
    context.block.number,
  );
  assertCircleFiatTokenDependencyExact(expectedWithAdditional, actual);
  return actual;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

export async function assertTreasuryRangeViewChecks(
  context: TreasuryRangeBuildContext,
  values: unknown,
  label: string,
): Promise<void> {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} must contain live Hook view checks`);
  const curveOutputs = "uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps";
  const required = new Map<string, { method: string; args: readonly string[]; abi: string; pending?: boolean }>([
    ["hook.buyCurve", { method: "buyCurve", args: [], abi: `function buyCurve() view returns(${curveOutputs})` }],
    ["hook.sellCurve", { method: "sellCurve", args: [], abi: `function sellCurve() view returns(${curveOutputs})` }],
    ["hook.protocolDepth.usdc", { method: "protocolDepth", args: [context.strategy.addresses.usdc], abi: "function protocolDepth(address) view returns(uint256)" }],
    ["hook.protocolDepth.nara", { method: "protocolDepth", args: [context.strategy.addresses.nara], abi: "function protocolDepth(address) view returns(uint256)" }],
    ["hook.pendingBuyCurve", { method: "pendingBuyCurve", args: [], abi: `function pendingBuyCurve() view returns(tuple(${curveOutputs}) curve,uint48 eta,bool exists)`, pending: true }],
    ["hook.pendingSellCurve", { method: "pendingSellCurve", args: [], abi: `function pendingSellCurve() view returns(tuple(${curveOutputs}) curve,uint48 eta,bool exists)`, pending: true }],
    ["hook.pendingProtocolDepth.usdc", { method: "pendingProtocolDepth", args: [context.strategy.addresses.usdc], abi: "function pendingProtocolDepth(address) view returns(uint256 depth,uint48 eta,bool exists)", pending: true }],
    ["hook.pendingProtocolDepth.nara", { method: "pendingProtocolDepth", args: [context.strategy.addresses.nara], abi: "function pendingProtocolDepth(address) view returns(uint256 depth,uint48 eta,bool exists)", pending: true }],
    ["hook.registeredPoolId", { method: "registeredPoolId", args: [], abi: "function registeredPoolId() view returns(bytes32)" }],
    ["hook.poolRegistered", { method: "poolRegistered", args: [], abi: "function poolRegistered() view returns(bool)" }],
  ]);
  const seen = new Set<string>();
  for (const [index, raw] of values.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label}[${index}] must be an object`);
    const check = raw as Partial<TreasuryRangeViewCheck>;
    if (typeof check.label !== "string" || typeof check.method !== "string" || !Array.isArray(check.args)) {
      throw new Error(`${label}[${index}] is malformed`);
    }
    const target = ethers.getAddress(String(check.target));
    const requiredCheck = required.get(check.label);
    if (!requiredCheck) throw new Error(`${label}[${index}] has an unapproved check label`);
    if (target !== context.strategy.addresses.hook || check.method !== requiredCheck.method || stable(check.args) !== stable(requiredCheck.args)) {
      throw new Error(`${check.label} target/method/arguments differ from the mandatory Hook check`);
    }
    if (seen.has(check.label)) throw new Error(`${label} contains duplicate ${check.label}`);
    seen.add(check.label);
    const contract = new ethers.Contract(target, [requiredCheck.abi], context.provider);
    const actual = await contract.getFunction(check.method)(...check.args, { blockTag: context.block.number });
    const normalizedActual = JSON.parse(stable(actual));
    if (stable(normalizedActual) !== stable(check.expected)) throw new Error(`${check.label} differs from the strategy manifest at the JIT block`);
    if (requiredCheck.pending && (!Array.isArray(normalizedActual) || normalizedActual.at(-1) !== false)) {
      throw new Error(`${check.label} reports a pending Hook change`);
    }
  }
  if (values.length !== required.size) throw new Error(`${label} must contain exactly the canonical Hook check set`);
  for (const requiredLabel of required.keys()) if (!seen.has(requiredLabel)) throw new Error(`${label} is missing ${requiredLabel}`);
  if (treasuryRangeHookConfigurationHash(values as Array<{ label: string; expected: unknown }>) !== context.strategy.hookConfigurationHash) {
    throw new Error("Live canonical Hook checks differ from hookConfigurationHash");
  }
}

export function recomputeAndAssertTreasuryRangeOrder(
  order: TreasuryRangeStrategyOrder,
  strategyHash: string,
  creationDeadline: bigint,
  tickSpacing: bigint,
  currentSqrtPriceX96: bigint,
  label: string,
): TreasuryRangeEconomicRecomputation {
  const plan = planTreasuryRange({
    side: order.side,
    lowerUsdcPerNara: parseDecimalRational(order.humanPriceLower),
    upperUsdcPerNara: parseDecimalRational(order.humanPriceUpper),
    inputAmount: BigInt(order.inputAmountRaw),
    toleranceBps: BigInt(order.toleranceBps),
    strategyHash,
    creationDeadline,
  }, tickSpacing);
  assertOneSidedAtCreation(plan, currentSqrtPriceX96);
  const expectedDustNara = order.side === "SELL_NARA" ? plan.expectedRoundingDust : 0n;
  const expectedDustUsdc = order.side === "BUY_NARA" ? plan.expectedRoundingDust : 0n;
  const exactFields: ReadonlyArray<[string, bigint, bigint]> = [
    ["tickLower", plan.tickLower, BigInt(order.tickLower)],
    ["tickUpper", plan.tickUpper, BigInt(order.tickUpper)],
    ["inputAmountRaw", plan.inputAmount, BigInt(order.inputAmountRaw)],
    ["expectedOutputAmountRaw", plan.expectedPrincipalOutput, BigInt(order.expectedOutputAmountRaw)],
    ["minimumOutputAmountRaw", plan.minimumOutputAmount, BigInt(order.minimumOutputAmountRaw)],
    ["expectedLiquidity", plan.expectedLiquidity, BigInt(order.expectedLiquidity)],
    ["expectedDustNaraRaw", expectedDustNara, BigInt(order.expectedDustNaraRaw)],
    ["expectedDustUsdcRaw", expectedDustUsdc, BigInt(order.expectedDustUsdcRaw)],
    ["toleranceBps", plan.toleranceBps, BigInt(order.toleranceBps)],
  ];
  for (const [field, recomputed, manifested] of exactFields) {
    if (recomputed !== manifested) throw new Error(`${label}.${field} differs from shared exact planner recomputation`);
  }
  if (plan.strategyHash !== strategyHash.toLowerCase() || plan.creationDeadline !== creationDeadline) {
    throw new Error(`${label} strategy hash/deadline binding differs from encoded order intent`);
  }
  return {
    side: plan.side,
    tickLower: plan.tickLower.toString(),
    tickUpper: plan.tickUpper.toString(),
    inputAmountRaw: plan.inputAmount.toString(),
    expectedInputUsedRaw: plan.expectedInputUsed.toString(),
    expectedOutputAmountRaw: plan.expectedPrincipalOutput.toString(),
    minimumOutputAmountRaw: plan.minimumOutputAmount.toString(),
    expectedLiquidity: plan.expectedLiquidity.toString(),
    expectedDustNaraRaw: expectedDustNara.toString(),
    expectedDustUsdcRaw: expectedDustUsdc.toString(),
    toleranceBps: plan.toleranceBps.toString(),
    alignedLowerUsdcPerNara: {
      numerator: plan.alignedLowerUsdcPerNara.numerator.toString(),
      denominator: plan.alignedLowerUsdcPerNara.denominator.toString(),
    },
    alignedUpperUsdcPerNara: {
      numerator: plan.alignedUpperUsdcPerNara.numerator.toString(),
      denominator: plan.alignedUpperUsdcPerNara.denominator.toString(),
    },
    geometricExecutionReferenceWad: plan.geometricExecutionReferenceWad.toString(),
  };
}

export function assertTreasuryRangeManagerAllowanceSafety(state: TreasuryRangeManagerSafetyState): void {
  const allowanceEntries = Object.entries(state).filter(([label]) => label.includes("Allowance"));
  if (allowanceEntries.some(([, value]) => BigInt(value) !== 0n)) {
    throw new Error("Range Manager allowance layers are not clean");
  }
}

export async function readTreasuryRangeManagerSafetyState(
  context: TreasuryRangeBuildContext,
  managerAddress: string,
): Promise<TreasuryRangeManagerSafetyState> {
  const production = canonicalProductionV4Deployment();
  const manager = ethers.getAddress(managerAddress);
  const nara = new ethers.Contract(production.token, ERC20_APPROVAL_ABI, context.provider);
  const usdc = new ethers.Contract(production.base, ERC20_APPROVAL_ABI, context.provider);
  const permit2 = new ethers.Contract(production.permit2, PERMIT2_APPROVAL_ABI, context.provider);
  const blockTag = context.block.number;
  const [
    safeNaraAllowance,
    safeUsdcAllowance,
    managerNaraPermit2Allowance,
    managerUsdcPermit2Allowance,
    permit2Nara,
    permit2Usdc,
    managerNaraBalance,
    managerUsdcBalance,
  ] = await Promise.all([
    nara.allowance(production.safe, manager, { blockTag }) as Promise<bigint>,
    usdc.allowance(production.safe, manager, { blockTag }) as Promise<bigint>,
    nara.allowance(manager, production.permit2, { blockTag }) as Promise<bigint>,
    usdc.allowance(manager, production.permit2, { blockTag }) as Promise<bigint>,
    permit2.allowance(manager, production.token, production.positionManager, { blockTag }) as Promise<ethers.Result>,
    permit2.allowance(manager, production.base, production.positionManager, { blockTag }) as Promise<ethers.Result>,
    nara.balanceOf(manager, { blockTag }) as Promise<bigint>,
    usdc.balanceOf(manager, { blockTag }) as Promise<bigint>,
  ]);
  const state: TreasuryRangeManagerSafetyState = {
    safeNaraAllowance: BigInt(safeNaraAllowance).toString(),
    safeUsdcAllowance: BigInt(safeUsdcAllowance).toString(),
    managerNaraPermit2Allowance: BigInt(managerNaraPermit2Allowance).toString(),
    managerUsdcPermit2Allowance: BigInt(managerUsdcPermit2Allowance).toString(),
    permit2NaraPositionManagerAllowance: BigInt(permit2Nara[0]).toString(),
    permit2UsdcPositionManagerAllowance: BigInt(permit2Usdc[0]).toString(),
    managerNaraBalance: BigInt(managerNaraBalance).toString(),
    managerUsdcBalance: BigInt(managerUsdcBalance).toString(),
  };
  assertTreasuryRangeManagerAllowanceSafety(state);
  return state;
}

function insideRepository(repositoryRoot: string, requestedPath: string): string {
  const absolute = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(repositoryRoot, requestedPath);
  const local = relative(repositoryRoot, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error("Manager deployment manifest must remain inside the authoritative repository");
  }
  return absolute;
}

function requireDeploymentObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function deploymentInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return parsed;
}

function deploymentBytes(value: unknown, label: string, length?: number): string {
  const parsed = String(value).toLowerCase();
  if (!ethers.isHexString(parsed, length)) throw new Error(`${label} is malformed`);
  return parsed;
}

function deploymentCall(value: unknown, label: string): SafeBatchCall {
  const call = requireDeploymentObject(value, label);
  const rawValue = String(call.value);
  if (!/^\d+$/.test(rawValue)) throw new Error(`${label}.value must be an unsigned integer string`);
  return {
    to: ethers.getAddress(String(call.to)),
    value: BigInt(rawValue).toString(),
    data: deploymentBytes(call.data, `${label}.data`),
  };
}

export function parseTreasuryRangeManagerDeploymentEvidence(value: unknown): TreasuryRangeManagerDeploymentEvidence {
  const root = requireDeploymentObject(value, "manager deployment manifest");
  if (root.schemaVersion !== "nara.v4.treasury-range-manager-deployment.v2" || root.status !== "deployed_verified") {
    throw new Error("Manager deployment evidence must use the exact deployed_verified v2 schema");
  }
  const originCommit = String(root.originCommit).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(originCommit)) throw new Error("manager deployment originCommit is malformed");
  const bindings = requireDeploymentObject(root.constructorBindings, "manager deployment constructorBindings");
  const safeRoot = requireDeploymentObject(root.safeExecution, "manager deployment safeExecution");
  const safeTransactionRoot = requireDeploymentObject(safeRoot.safeTransaction, "manager deployment safeTransaction");
  const create2Root = requireDeploymentObject(root.create2Deployment, "manager deployment create2Deployment");
  if (!Array.isArray(safeRoot.innerCalls) || safeRoot.innerCalls.length !== 1) {
    throw new Error("Manager deployment evidence must contain exactly one Safe inner deploy call");
  }
  const safeTransaction = {
    to: ethers.getAddress(String(safeTransactionRoot.to)),
    value: String(safeTransactionRoot.value),
    data: deploymentBytes(safeTransactionRoot.data, "safeExecution.safeTransaction.data"),
    operation: deploymentInteger(safeTransactionRoot.operation, "safeExecution.safeTransaction.operation"),
    safeTxGas: String(safeTransactionRoot.safeTxGas),
    baseGas: String(safeTransactionRoot.baseGas),
    gasPrice: String(safeTransactionRoot.gasPrice),
    gasToken: ethers.getAddress(String(safeTransactionRoot.gasToken)),
    refundReceiver: ethers.getAddress(String(safeTransactionRoot.refundReceiver)),
    nonce: String(safeTransactionRoot.nonce),
  } as SafeBatchSimulationEvidence["safeTransaction"];
  for (const [label, candidate] of [
    ["value", safeTransaction.value], ["safeTxGas", safeTransaction.safeTxGas], ["baseGas", safeTransaction.baseGas],
    ["gasPrice", safeTransaction.gasPrice], ["nonce", safeTransaction.nonce],
  ] as const) {
    if (!/^\d+$/.test(candidate)) throw new Error(`safeExecution.safeTransaction.${label} must be an unsigned integer string`);
  }
  const safeNonce = String(safeRoot.nonce);
  if (!/^\d+$/.test(safeNonce) || safeNonce !== safeTransaction.nonce) {
    throw new Error("safeExecution.nonce must exactly match the Safe transaction nonce");
  }
  const poolFee = deploymentInteger(bindings.poolFee, "constructorBindings.poolFee");
  const tickSpacing = Number(bindings.tickSpacing);
  const deploymentDeadline = String(bindings.deploymentDeadline);
  if (poolFee > 0xffffff || !Number.isSafeInteger(tickSpacing) || tickSpacing < -0x800000 || tickSpacing > 0x7fffff ||
      !/^\d+$/.test(deploymentDeadline) || BigInt(deploymentDeadline) > ((1n << 64n) - 1n)) {
    throw new Error("Manager deployment constructor numeric bindings are malformed");
  }
  return {
    schemaVersion: "nara.v4.treasury-range-manager-deployment.v2",
    status: "deployed_verified",
    originCommit,
    deploymentTransactionHash: deploymentBytes(root.deploymentTransactionHash, "deploymentTransactionHash", 32),
    deploymentBlock: deploymentInteger(root.deploymentBlock, "deploymentBlock"),
    deploymentBlockHash: deploymentBytes(root.deploymentBlockHash, "deploymentBlockHash", 32),
    predictedAddress: ethers.getAddress(String(root.predictedAddress)),
    deployedAddress: ethers.getAddress(String(root.deployedAddress)),
    runtimeCodeHash: deploymentBytes(root.runtimeCodeHash, "runtimeCodeHash", 32),
    safeExecution: {
      safe: ethers.getAddress(String(safeRoot.safe)),
      transactionHash: deploymentBytes(safeRoot.transactionHash, "safeExecution.transactionHash", 32),
      safeTransactionHash: deploymentBytes(safeRoot.safeTransactionHash, "safeExecution.safeTransactionHash", 32),
      nonce: safeNonce,
      executionSuccessLogIndex: deploymentInteger(safeRoot.executionSuccessLogIndex, "safeExecution.executionSuccessLogIndex"),
      safeTransaction,
      packedTransactionsHash: deploymentBytes(safeRoot.packedTransactionsHash, "safeExecution.packedTransactionsHash", 32),
      multiSendCallOnly: ethers.getAddress(String(safeRoot.multiSendCallOnly)),
      multiSendCallOnlyCodeHash: deploymentBytes(safeRoot.multiSendCallOnlyCodeHash, "safeExecution.multiSendCallOnlyCodeHash", 32),
      innerCalls: safeRoot.innerCalls.map((call, index) => deploymentCall(call, `safeExecution.innerCalls[${index}]`)),
    },
    create2Deployment: {
      deployer: ethers.getAddress(String(create2Root.deployer)),
      deployedAddress: ethers.getAddress(String(create2Root.deployedAddress)),
      salt: deploymentBytes(create2Root.salt, "create2Deployment.salt", 32),
      initCodeHash: deploymentBytes(create2Root.initCodeHash, "create2Deployment.initCodeHash", 32),
      deployedLogIndex: deploymentInteger(create2Root.deployedLogIndex, "create2Deployment.deployedLogIndex"),
    },
    constructorBindings: {
      treasurySafe: ethers.getAddress(String(bindings.treasurySafe)),
      nara: ethers.getAddress(String(bindings.nara)),
      usdc: ethers.getAddress(String(bindings.usdc)),
      liquidityVault: ethers.getAddress(String(bindings.liquidityVault)),
      poolManager: ethers.getAddress(String(bindings.poolManager)),
      positionManager: ethers.getAddress(String(bindings.positionManager)),
      permit2: ethers.getAddress(String(bindings.permit2)),
      hook: ethers.getAddress(String(bindings.hook)),
      poolFee,
      tickSpacing,
      poolId: deploymentBytes(bindings.poolId, "constructorBindings.poolId", 32),
      deploymentDeadline,
    },
  };
}

export async function readVerifiedTreasuryRangeManagerDeployment(
  repositoryRoot: string,
  context: TreasuryRangeBuildContext,
  expectedManager: string,
): Promise<TreasuryRangeManagerDeploymentEvidence> {
  const reference = context.strategy.managerDeployment;
  if (!reference) throw new Error("Strategy must hash-pin receipt-bound managerDeployment evidence");
  const path = insideRepository(repositoryRoot, reference.manifestPath);
  const raw = readFileSync(path, "utf8");
  if (sha256Hex(raw.replace(/\r\n/g, "\n")) !== reference.manifestSha256) {
    throw new Error("Manager deployment manifest SHA-256 differs from the strategy reference");
  }
  const evidence = parseTreasuryRangeManagerDeploymentEvidence(JSON.parse(raw));
  if (evidence.schemaVersion !== "nara.v4.treasury-range-manager-deployment.v2" || evidence.status !== "deployed_verified") {
    throw new Error("Manager deployment evidence is not an exact-provenance deployed_verified v2 record");
  }
  if (!/^\d+$/.test(evidence.constructorBindings.deploymentDeadline) || BigInt(evidence.constructorBindings.deploymentDeadline) > ((1n << 64n) - 1n)) {
    throw new Error("Manager deployment deadline evidence is invalid");
  }
  if (!/^[0-9a-f]{40}$/.test(evidence.originCommit) || !ethers.isHexString(evidence.deploymentTransactionHash, 32) ||
      !ethers.isHexString(evidence.deploymentBlockHash, 32) || !ethers.isHexString(evidence.runtimeCodeHash, 32) ||
      !Number.isSafeInteger(evidence.deploymentBlock) || evidence.deploymentBlock < 1) {
    throw new Error("Manager deployment evidence contains malformed provenance");
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", evidence.originCommit, context.strategy.repositoryHead], {
      cwd: repositoryRoot,
      stdio: "ignore",
    });
  } catch {
    throw new Error("Manager deployment origin commit is not an ancestor of the protected strategy release");
  }
  if (evidence.predictedAddress !== evidence.deployedAddress || evidence.deployedAddress !== ethers.getAddress(expectedManager)) {
    throw new Error("Manager predicted/deployed/configured addresses differ");
  }
  const production = canonicalProductionV4Deployment();
  const expectedBindings: ReadonlyArray<[string, string | number, string | number]> = [
    ["treasurySafe", evidence.constructorBindings.treasurySafe, production.safe],
    ["nara", evidence.constructorBindings.nara, production.token],
    ["usdc", evidence.constructorBindings.usdc, production.base],
    ["liquidityVault", evidence.constructorBindings.liquidityVault, production.vault],
    ["poolManager", evidence.constructorBindings.poolManager, production.poolManager],
    ["positionManager", evidence.constructorBindings.positionManager, production.positionManager],
    ["permit2", evidence.constructorBindings.permit2, production.permit2],
    ["hook", evidence.constructorBindings.hook, production.hook],
    ["poolFee", evidence.constructorBindings.poolFee, production.poolFee],
    ["tickSpacing", evidence.constructorBindings.tickSpacing, production.tickSpacing],
    ["poolId", evidence.constructorBindings.poolId, production.poolId],
  ];
  for (const [label, actual, expected] of expectedBindings) {
    const matches = typeof expected === "string" && ethers.isAddress(String(expected))
      ? ethers.getAddress(String(actual)) === ethers.getAddress(expected)
      : typeof expected === "string" ? String(actual).toLowerCase() === String(expected).toLowerCase() : BigInt(actual) === BigInt(expected);
    if (!matches) throw new Error(`Manager deployment constructor ${label} differs from production`);
  }
  if (evidence.safeExecution.safe !== production.safe || evidence.safeExecution.transactionHash !== evidence.deploymentTransactionHash ||
      evidence.safeExecution.nonce !== evidence.safeExecution.safeTransaction.nonce ||
      evidence.create2Deployment.deployer !== production.create2HookDeployer ||
      evidence.create2Deployment.deployedAddress !== evidence.deployedAddress) {
    throw new Error("Manager deployment Safe/Create2 provenance fields disagree");
  }
  const create2Interface = new ethers.Interface(CREATE2_DEPLOYER_ABI);
  const deployCall = evidence.safeExecution.innerCalls[0];
  if (deployCall.to !== production.create2HookDeployer || BigInt(deployCall.value) !== 0n) {
    throw new Error("Manager deployment inner call is not a zero-value call to the canonical CREATE2 deployer");
  }
  const parsedDeploy = create2Interface.parseTransaction({ data: deployCall.data, value: 0n });
  if (!parsedDeploy || parsedDeploy.name !== "deploy") throw new Error("Manager deployment inner calldata is not deploy(bytes32,bytes)");
  const [decodedSalt, initCode] = parsedDeploy.args;
  if (String(decodedSalt).toLowerCase() !== evidence.create2Deployment.salt ||
      ethers.keccak256(initCode).toLowerCase() !== evidence.create2Deployment.initCodeHash) {
    throw new Error("Manager deployment inner calldata differs from the recorded salt/initcode hash");
  }
  const multiSend = new ethers.Interface(["function multiSend(bytes transactions)"]).parseTransaction({
    data: evidence.safeExecution.safeTransaction.data,
  });
  if (!multiSend || multiSend.name !== "multiSend") throw new Error("Manager deployment Safe payload is not MultiSendCallOnly.multiSend");
  if (ethers.keccak256(multiSend.args[0]).toLowerCase() !== evidence.safeExecution.packedTransactionsHash ||
      stable(decodeMultiSendCalls(multiSend.args[0])) !== stable(evidence.safeExecution.innerCalls)) {
    throw new Error("Manager deployment packed Safe calls do not reproduce the exact inner deploy call");
  }
  const executionPlan: SafeBatchSimulationEvidence = {
    safeTransaction: evidence.safeExecution.safeTransaction,
    safeTxHash: evidence.safeExecution.safeTransactionHash,
    packedTransactionsHash: evidence.safeExecution.packedTransactionsHash,
    multiSendCallOnly: evidence.safeExecution.multiSendCallOnly,
    multiSendCallOnlyCodeHash: evidence.safeExecution.multiSendCallOnlyCodeHash,
    simulatedAtBlock: evidence.deploymentBlock,
    simulation: "PASS: Safe.simulateAndRevert -> canonical MultiSendCallOnly.multiSend",
  };
  const verifiedExecution = await decodeAndVerifySafeExecution(
    context.provider,
    production.safe,
    evidence.deploymentTransactionHash,
    evidence.safeExecution.innerCalls,
    executionPlan,
  );
  const [receipt, block] = await Promise.all([
    context.provider.getTransactionReceipt(evidence.deploymentTransactionHash),
    context.provider.getBlock(evidence.deploymentBlock),
  ]);
  if (!receipt || receipt.status !== 1 || receipt.blockNumber !== evidence.deploymentBlock || receipt.blockHash.toLowerCase() !== evidence.deploymentBlockHash ||
      !block?.hash || block.hash.toLowerCase() !== evidence.deploymentBlockHash ||
      verifiedExecution.safeTransactionHash.toLowerCase() !== evidence.safeExecution.safeTransactionHash) {
    throw new Error("Manager deployment receipt/block/Safe execution evidence is not canonical");
  }
  const safeExecutionEvent = new ethers.Interface(["event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)"]).getEvent("ExecutionSuccess");
  if (!safeExecutionEvent) throw new Error("Safe ExecutionSuccess ABI is unavailable");
  const safeLogs = receipt.logs.filter((log) => ethers.getAddress(log.address) === production.safe && log.topics[0]?.toLowerCase() === safeExecutionEvent.topicHash.toLowerCase());
  if (safeLogs.length !== 1 || safeLogs[0].index !== evidence.safeExecution.executionSuccessLogIndex) {
    throw new Error("Manager deployment evidence does not bind the exact Safe ExecutionSuccess log");
  }
  const deployedEvent = create2Interface.getEvent("Deployed");
  if (!deployedEvent) throw new Error("CREATE2 Deployed ABI is unavailable");
  const deployedLogs = receipt.logs.filter((log) => ethers.getAddress(log.address) === production.create2HookDeployer && log.topics[0]?.toLowerCase() === deployedEvent.topicHash.toLowerCase());
  if (deployedLogs.length !== 1 || deployedLogs[0].index !== evidence.create2Deployment.deployedLogIndex) {
    throw new Error("Manager deployment receipt lacks the exact CREATE2 Deployed event");
  }
  const deployed = create2Interface.parseLog(deployedLogs[0]);
  if (!deployed || ethers.getAddress(deployed.args.deployed) !== evidence.deployedAddress ||
      String(deployed.args.salt).toLowerCase() !== evidence.create2Deployment.salt ||
      String(deployed.args.initCodeHash).toLowerCase() !== evidence.create2Deployment.initCodeHash) {
    throw new Error("CREATE2 Deployed event arguments differ from deployment evidence");
  }
  const create2 = new ethers.Contract(production.create2HookDeployer, CREATE2_DEPLOYER_ABI, context.provider);
  const recomputedAddress = await create2.computeAddress(evidence.create2Deployment.salt, evidence.create2Deployment.initCodeHash, {
    blockTag: evidence.deploymentBlock,
  });
  if (ethers.getAddress(recomputedAddress) !== evidence.predictedAddress) throw new Error("CREATE2 evidence does not reproduce the predicted manager address");
  const receiptCode = await context.provider.getCode(evidence.deployedAddress, evidence.deploymentBlock);
  const currentCode = await context.provider.getCode(evidence.deployedAddress, context.block.number);
  if (receiptCode === "0x" || currentCode === "0x" || ethers.keccak256(receiptCode).toLowerCase() !== evidence.runtimeCodeHash ||
      ethers.keccak256(currentCode).toLowerCase() !== evidence.runtimeCodeHash ||
      context.strategy.runtimeCodeHashes.rangeManager?.toLowerCase() !== evidence.runtimeCodeHash) {
    throw new Error("Manager receipt/current/strategy runtime hashes differ");
  }
  const manager = new ethers.Contract(evidence.deployedAddress, TREASURY_RANGE_MANAGER_ABI, context.provider);
  const getterBindings: ReadonlyArray<[string, string | number]> = [
    ["TREASURY_SAFE", evidence.constructorBindings.treasurySafe],
    ["NARA", evidence.constructorBindings.nara],
    ["USDC", evidence.constructorBindings.usdc],
    ["LIQUIDITY_VAULT", evidence.constructorBindings.liquidityVault],
    ["POOL_MANAGER", evidence.constructorBindings.poolManager],
    ["POSITION_MANAGER", evidence.constructorBindings.positionManager],
    ["PERMIT2", evidence.constructorBindings.permit2],
    ["HOOK", evidence.constructorBindings.hook],
    ["POOL_FEE", evidence.constructorBindings.poolFee],
    ["TICK_SPACING", evidence.constructorBindings.tickSpacing],
    ["POOL_ID", evidence.constructorBindings.poolId],
    ["DEPLOYMENT_DEADLINE", evidence.constructorBindings.deploymentDeadline],
    ["MAX_SETTLE_BATCH", 16],
  ];
  for (const blockTag of [evidence.deploymentBlock, context.block.number]) {
    for (const [method, expected] of getterBindings) {
      const actual = await manager.getFunction(method)({ blockTag });
      let matches: boolean;
      if (typeof expected === "string" && /^0x[0-9a-fA-F]{40}$/.test(expected)) {
        matches = ethers.getAddress(actual) === ethers.getAddress(expected);
      } else if (typeof expected === "string" && expected.startsWith("0x")) {
        matches = String(actual).toLowerCase() === String(expected).toLowerCase();
      } else {
        matches = BigInt(actual) === BigInt(expected);
      }
      if (!matches) throw new Error(`Manager deployment ${method} getter differs from receipt evidence`);
    }
  }
  return evidence;
}

export function sqrtPriceX96AtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < -887272 || tick > 887272) throw new Error("Tick is outside TickMath bounds");
  let absolute = BigInt(tick < 0 ? -tick : tick);
  let ratio = (absolute & 0x1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  const factors: ReadonlyArray<[bigint, bigint]> = [
    [0x2n, 0xfff97272373d413259a46990580e213an], [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n], [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20n, 0xff973b41fa98c081472e6896dfb254c0n], [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n], [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200n, 0xf987a7253ac413176f2b074cf7815e54n], [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n], [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n], [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000n, 0x31be135f97d08fd981231505542fcfa6n], [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000n, 0x5d6af8dedb81196699c329225ee604n], [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000n, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [mask, factor] of factors) if ((absolute & mask) !== 0n) ratio = (ratio * factor) >> 128n;
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  const remainderMask = (1n << 32n) - 1n;
  return (ratio >> 32n) + ((ratio & remainderMask) === 0n ? 0n : 1n);
}

export function isTreasuryRangeOneSided(
  side: "SELL_NARA" | "BUY_NARA",
  currentSqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
): boolean {
  if (tickLower >= tickUpper) return false;
  return side === "SELL_NARA"
    ? currentSqrtPriceX96 >= sqrtPriceX96AtTick(tickUpper)
    : currentSqrtPriceX96 <= sqrtPriceX96AtTick(tickLower);
}

export function refuseStalePackets(outputDirectory: string, slug: string): void {
  if (!existsSync(outputDirectory)) return;
  const prefix = new RegExp(`^(?:UNEXECUTED|PENDING-UNEXECUTED)-v4-treasury-range-${slug}-`);
  const stale = readdirSync(outputDirectory).filter((name) => prefix.test(name));
  if (stale.length !== 0) throw new Error(`Stale treasury-range packets exist and must be quarantined before rebuilding: ${stale.sort().join(", ")}`);
}

function durableWriteNew(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx");
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function treasuryRangeExternalDependencyReview(
  context: Pick<TreasuryRangeBuildContext, "usdcDependency" | "usdcDependencyEnforcement">,
): TreasuryRangeSafeReview["externalDependencies"] {
  return {
    usdc: {
      enforcement: context.usdcDependencyEnforcement,
      evidence: context.usdcDependency,
    },
  };
}

export function treasuryRangeSafeMarkdownReview(review: TreasuryRangeSafeReview): string {
  const calls = review.calls.map((call, index) => `| ${index + 1} | \`${call.to}\` | \`${call.value}\` | \`${call.data}\` |`).join("\n");
  const usdc = review.externalDependencies.usdc;
  const bypassWarning = usdc.enforcement === "emergency_exit_bypass"
    ? "> **WARNING:** Emergency cancellation bypasses the JIT USDC exact/healthy gate. The attached USDC evidence is the strategy snapshot only, not a current health assertion.\n\n"
    : "";
  return `# ${review.purpose}\n\n` +
    `Status: **UNEXECUTED / HUMAN REVIEW REQUIRED / DO NOT IMPORT AFTER DEADLINE**\n\n` +
    `- Change ID: \`${review.changeId}\`\n- Repository HEAD: \`${review.repositoryHead}\`\n` +
    `- Strategy hash: \`${review.strategyHash}\`\n- Base block/hash: \`${review.blockNumber}\` / \`${review.blockHash}\`\n` +
    `- Safe nonce: \`${review.safe.nonce}\`\n- Deadline: \`${review.validUntil}\`\n` +
    `- Safe transaction hash: \`${review.simulation.safeTxHash}\`\n- Simulation: ${review.simulation.simulation}\n\n` +
    `## External dependency gate\n\n` +
    `- USDC enforcement: \`${usdc.enforcement}\`\n` +
    `- Evidence source: ${usdc.enforcement === "exact" ? "JIT read at the packet block" : "strategy snapshot only"}\n` +
    `- Proxy / implementation: \`${usdc.evidence.proxyAddress}\` / \`${usdc.evidence.implementationAddress}\`\n` +
    `- Proxy / implementation runtime hashes: \`${usdc.evidence.proxyRuntimeCodeHash}\` / \`${usdc.evidence.implementationRuntimeCodeHash}\`\n` +
    `- Dependency reader / runtime hash: \`${usdc.evidence.readerAddress}\` / \`${usdc.evidence.readerRuntimeCodeHash}\`\n\n` +
    bypassWarning +
    `## Calls\n\n| # | Target | Value | Calldata |\n|---:|---|---:|---|\n${calls}\n\n` +
    `## Required human checks\n\n${review.checks.map((check) => `- [ ] ${check}`).join("\n")}\n\n` +
    `## Machine review details\n\n\`\`\`json\n${JSON.stringify(review.details, null, 2)}\n\`\`\`\n`;
}

export async function buildAndWriteTreasuryRangePacket(options: {
  repositoryRoot: string;
  outputDirectory: string;
  slug: "deployment" | "orders" | "cancellation";
  purpose: string;
  context: TreasuryRangeBuildContext;
  calls: readonly SafeBatchCall[];
  details: Record<string, unknown>;
  checks: readonly string[];
  validUntil: number;
}): Promise<{ jsonPath: string; markdownPath: string; review: TreasuryRangeSafeReview }> {
  const { context } = options;
  refuseStalePackets(options.outputDirectory, options.slug);
  if (options.calls.length === 0) throw new Error("Safe packet must contain at least one call");
  const safeNonce = BigInt(context.safeEvidence.nonce);
  const simulation = await buildAndSimulateSafeBatch(
    context.provider,
    context.safeEvidence.address,
    safeNonce,
    options.calls,
    context.block.number,
  );
  const currentNonce = await new ethers.Contract(context.safeEvidence.address, ["function nonce() view returns(uint256)"], context.provider).nonce();
  if (BigInt(currentNonce) !== safeNonce) throw new Error("Safe nonce changed during packet construction");
  const currentBlock = await context.provider.getBlock(context.block.number);
  if (!currentBlock?.hash || currentBlock.hash.toLowerCase() !== context.block.hash?.toLowerCase()) {
    throw new Error("Pinned packet block was reorganized during construction");
  }
  const deadline = jitDeadline(context.block.timestamp);
  if (options.validUntil !== deadline) throw new Error("Encoded call deadline differs from the JIT review deadline");
  const review: TreasuryRangeSafeReview = {
    changeId: context.strategy.changeId,
    purpose: options.purpose,
    noBroadcast: true,
    humanApprovalRequired: true,
    repositoryHead: context.strategy.repositoryHead,
    strategyHash: context.strategy.strategyHash,
    chainId: "8453",
    blockNumber: context.block.number,
    blockHash: context.block.hash!,
    blockTimestamp: context.block.timestamp,
    validUntil: deadline,
    safe: context.safeEvidence,
    calls: options.calls,
    simulation,
    runtime: context.productionRuntime,
    externalDependencies: treasuryRangeExternalDependencyReview(context),
    protectedRelease: context.protectedRelease,
    checks: options.checks,
    details: options.details,
  };
  const transactionBuilder = {
    version: "1.0",
    chainId: "8453",
    createdAt: context.block.timestamp * 1_000,
    meta: {
      name: `UNEXECUTED ${options.purpose}`,
      description: `Human-review-only packet; strategy ${context.strategy.strategyHash}; nonce ${safeNonce}; expires ${deadline}`,
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: context.safeEvidence.address,
      checksum: simulation.safeTxHash,
    },
    transactions: options.calls.map((call) => ({ to: call.to, value: call.value, data: call.data, contractMethod: null, contractInputsValues: null })),
    naraEvidence: review,
  };
  const stem = `UNEXECUTED-v4-treasury-range-${options.slug}-${context.block.number}-nonce-${safeNonce}`;
  const pendingJson = resolve(options.outputDirectory, `PENDING-${stem}-DO-NOT-IMPORT.json`);
  const pendingMarkdown = resolve(options.outputDirectory, `PENDING-${stem}-DO-NOT-IMPORT.md`);
  const jsonPath = resolve(options.outputDirectory, `${stem}.json`);
  const markdownPath = resolve(options.outputDirectory, `${stem}.md`);
  durableWriteNew(pendingJson, prettyTreasuryRangeJson(transactionBuilder));
  durableWriteNew(pendingMarkdown, treasuryRangeSafeMarkdownReview(review));
  const nonceBeforePublish = await new ethers.Contract(context.safeEvidence.address, ["function nonce() view returns(uint256)"], context.provider).nonce();
  if (BigInt(nonceBeforePublish) !== safeNonce) throw new Error("Safe nonce changed before atomic packet publication; pending files remain non-importable");
  renameSync(pendingMarkdown, markdownPath);
  renameSync(pendingJson, jsonPath);
  return { jsonPath, markdownPath, review };
}
