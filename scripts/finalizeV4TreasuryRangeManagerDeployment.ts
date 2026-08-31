/**
 * Finalize receipt-bound NARA v4 Treasury Range Manager deployment evidence.
 *
 * This script never creates a signer and never sends a transaction. It accepts
 * only the exact unsigned deployment packet produced by the canonical builder,
 * verifies the executed protocol-Safe/CREATE2 transaction and both Safe roles,
 * then creates one append-only v3 evidence file.
 */

import hre from "hardhat";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ethers } from "ethers";
import {
  buildAndSimulateSafeBatch,
  decodeAndVerifySafeExecution,
  type SafeBatchCall,
  type SafeBatchSimulationEvidence,
} from "./lib/v4SafeBatch.js";
import {
  BASE_MULTISEND_CALL_ONLY,
  BASE_MULTISEND_CALL_ONLY_CODEHASH,
  readCanonicalNaraSafeEvidence,
  readTreasuryRangeSafeEvidence,
  type CanonicalSafeEvidence,
  type TreasuryRangeSafeEvidence,
} from "./lib/v4SafeEvidence.js";
import { canonicalProductionV4Deployment, requiredBaseRpcUrl } from "./lib/v4LiveConfig.js";
import {
  assertTreasuryRangeCanaryLaunchManifest,
  assertTreasuryRangeManifestExactEvidence,
  assertTreasuryRangePredeploymentManifest,
  loadTreasuryRangeStrategyManifest,
  prettyTreasuryRangeJson,
  type TreasuryRangeStrategyManifest,
} from "./lib/v4TreasuryRangeManifest.js";
import {
  CREATE2_DEPLOYER_ABI,
  TREASURY_RANGE_DEPLOYMENT_REVIEW_CHECKS,
  TREASURY_RANGE_MANAGER_ABI,
  TREASURY_RANGE_MAX_DEADLINE_SECONDS,
  createTreasuryRangeProvider,
  forceRebuildTreasuryRangeManagerArtifact,
  parseTreasuryRangeManagerDeploymentEvidence,
  readTreasuryRangeProtectedReleaseEvidence,
  safeTreasuryRangeError,
  treasuryRangeSafeMarkdownReview,
  type TreasuryRangeManagerDeploymentEvidence,
  type TreasuryRangeProtectedReleaseEvidence,
  type TreasuryRangeSafeReview,
} from "./lib/v4TreasuryRangeSafeBuilder.js";
import {
  canonicalTreasuryRangeAuthorities,
  type TreasuryRangeAuthorities,
} from "./lib/v4TreasuryRangeConfig.js";
import {
  assertCircleFiatTokenDependencyExact,
  readCircleFiatTokenDependency,
} from "./lib/v4UsdcDependency.js";

type JsonObject = Record<string, unknown>;

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOYMENTS_DIRECTORY = resolve(REPOSITORY_ROOT, "deployments");
const MANAGER_FQN = "contracts/v4/NARATreasuryRangeManagerV1.sol:NARATreasuryRangeManagerV1";
const DEPLOYMENT_PURPOSE = "NARA v4 Treasury Range Manager deployment";
const EXECUTION_SUCCESS_ABI = ["event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)"] as const;
const UINT64_MAX = (1n << 64n) - 1n;

export const TREASURY_RANGE_DEPLOYMENT_PACKET_ENV = "V4_TREASURY_RANGE_DEPLOYMENT_PACKET" as const;
export const TREASURY_RANGE_DEPLOYMENT_TX_ENV = "V4_TREASURY_RANGE_DEPLOYMENT_TX" as const;
export const TREASURY_RANGE_DEPLOYMENT_CONFIRMATIONS_ENV = "V4_TREASURY_RANGE_DEPLOYMENT_CONFIRMATIONS" as const;
export const TREASURY_RANGE_DEFAULT_DEPLOYMENT_CONFIRMATIONS = 3;

export interface TreasuryRangeArtifactFileOperations {
  exists(path: string): boolean;
  rename(source: string, destination: string): void;
}

export interface TreasuryRangeRetiredDeploymentArtifacts {
  packetPath: string;
  reviewPath: string;
}

export interface TreasuryRangeFinalizationPersistenceSnapshot {
  repositoryHead: string;
  deploymentReceipt: string;
  deploymentBlock: Readonly<{ number: number; hash: string }>;
  readbackBlock: Readonly<{ number: number; hash: string }>;
}

const NATIVE_ARTIFACT_FILE_OPERATIONS: TreasuryRangeArtifactFileOperations = {
  exists: existsSync,
  rename: renameSync,
};

interface ParsedDeploymentDetails {
  strategyPath: string;
  deployer: string;
  predictedManager: string;
  salt: string;
  initCodeHash: string;
  initCodeBytes: number;
  runtimeCodeHash: string;
  runtimeBytes: number;
  deploymentDeadline: string;
  constructorArguments: {
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
  };
  safeRoles: {
    deploymentExecutorSafe: string;
    treasuryRangeSafe: string;
  };
}

export interface ParsedTreasuryRangeDeploymentPacket {
  review: TreasuryRangeSafeReview;
  calls: readonly [SafeBatchCall];
  simulation: SafeBatchSimulationEvidence;
  details: ParsedDeploymentDetails;
  salt: string;
  initCode: string;
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${label} must be a safe integer >= ${minimum}`);
  return Number(value);
}

function unsigned(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!/^\d+$/.test(parsed)) throw new Error(`${label} must be an unsigned integer string`);
  return parsed;
}

function bytes(value: unknown, label: string, length?: number): string {
  const parsed = text(value, label);
  if (!ethers.isHexString(parsed, length)) throw new Error(`${label} must be${length ? ` ${length}-byte` : ""} hex data`);
  return parsed.toLowerCase();
}

function address(value: unknown, label: string): string {
  try {
    return ethers.getAddress(text(value, label));
  } catch {
    throw new Error(`${label} must be an EVM address`);
  }
}

function exactKeys(value: JsonObject, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) throw new Error(`${label} has missing or extra fields`);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function same(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(`${label} differs from canonical evidence`);
}

function parseCall(value: unknown, label: string): SafeBatchCall {
  const root = object(value, label);
  exactKeys(root, ["to", "value", "data"], label);
  return {
    to: address(root.to, `${label}.to`),
    value: unsigned(root.value, `${label}.value`),
    data: bytes(root.data, `${label}.data`),
  };
}

function parseSimulation(value: unknown): SafeBatchSimulationEvidence {
  const root = object(value, "naraEvidence.simulation");
  exactKeys(root, [
    "safeTransaction", "safeTxHash", "packedTransactionsHash", "multiSendCallOnly",
    "multiSendCallOnlyCodeHash", "simulatedAtBlock", "simulation",
  ], "naraEvidence.simulation");
  const transaction = object(root.safeTransaction, "naraEvidence.simulation.safeTransaction");
  exactKeys(transaction, [
    "to", "value", "data", "operation", "safeTxGas", "baseGas", "gasPrice", "gasToken",
    "refundReceiver", "nonce",
  ], "naraEvidence.simulation.safeTransaction");
  const parsed = {
    safeTransaction: {
      to: address(transaction.to, "naraEvidence.simulation.safeTransaction.to"),
      value: unsigned(transaction.value, "naraEvidence.simulation.safeTransaction.value"),
      data: bytes(transaction.data, "naraEvidence.simulation.safeTransaction.data"),
      operation: integer(transaction.operation, "naraEvidence.simulation.safeTransaction.operation"),
      safeTxGas: unsigned(transaction.safeTxGas, "naraEvidence.simulation.safeTransaction.safeTxGas"),
      baseGas: unsigned(transaction.baseGas, "naraEvidence.simulation.safeTransaction.baseGas"),
      gasPrice: unsigned(transaction.gasPrice, "naraEvidence.simulation.safeTransaction.gasPrice"),
      gasToken: address(transaction.gasToken, "naraEvidence.simulation.safeTransaction.gasToken"),
      refundReceiver: address(transaction.refundReceiver, "naraEvidence.simulation.safeTransaction.refundReceiver"),
      nonce: unsigned(transaction.nonce, "naraEvidence.simulation.safeTransaction.nonce"),
    },
    safeTxHash: bytes(root.safeTxHash, "naraEvidence.simulation.safeTxHash", 32),
    packedTransactionsHash: bytes(root.packedTransactionsHash, "naraEvidence.simulation.packedTransactionsHash", 32),
    multiSendCallOnly: address(root.multiSendCallOnly, "naraEvidence.simulation.multiSendCallOnly"),
    multiSendCallOnlyCodeHash: bytes(
      root.multiSendCallOnlyCodeHash,
      "naraEvidence.simulation.multiSendCallOnlyCodeHash",
      32,
    ),
    simulatedAtBlock: integer(root.simulatedAtBlock, "naraEvidence.simulation.simulatedAtBlock", 1),
    simulation: text(root.simulation, "naraEvidence.simulation.simulation"),
  };
  if (parsed.safeTransaction.to !== ethers.getAddress(BASE_MULTISEND_CALL_ONLY)
      || parsed.safeTransaction.value !== "0" || parsed.safeTransaction.operation !== 1
      || parsed.safeTransaction.safeTxGas !== "0" || parsed.safeTransaction.baseGas !== "0"
      || parsed.safeTransaction.gasPrice !== "0" || parsed.safeTransaction.gasToken !== ethers.ZeroAddress
      || parsed.safeTransaction.refundReceiver !== ethers.ZeroAddress
      || parsed.multiSendCallOnly !== ethers.getAddress(BASE_MULTISEND_CALL_ONLY)
      || parsed.multiSendCallOnlyCodeHash !== BASE_MULTISEND_CALL_ONLY_CODEHASH
      || parsed.simulation !== "PASS: Safe.simulateAndRevert -> canonical MultiSendCallOnly.multiSend") {
    throw new Error("Deployment packet Safe simulation is not the exact zero-reimbursement MultiSendCallOnly plan");
  }
  return parsed as SafeBatchSimulationEvidence;
}

function parseConstructorArguments(value: unknown): ParsedDeploymentDetails["constructorArguments"] {
  const root = object(value, "naraEvidence.details.constructorArguments");
  exactKeys(root, [
    "treasurySafe", "nara", "usdc", "liquidityVault", "poolManager", "positionManager", "permit2",
    "hook", "poolFee", "tickSpacing", "poolId",
  ], "naraEvidence.details.constructorArguments");
  const poolFee = integer(root.poolFee, "naraEvidence.details.constructorArguments.poolFee");
  const tickSpacing = integer(root.tickSpacing, "naraEvidence.details.constructorArguments.tickSpacing", -0x800000);
  if (poolFee > 0xffffff || tickSpacing > 0x7fffff) throw new Error("Deployment packet PoolKey numeric binding is out of range");
  return {
    treasurySafe: address(root.treasurySafe, "naraEvidence.details.constructorArguments.treasurySafe"),
    nara: address(root.nara, "naraEvidence.details.constructorArguments.nara"),
    usdc: address(root.usdc, "naraEvidence.details.constructorArguments.usdc"),
    liquidityVault: address(root.liquidityVault, "naraEvidence.details.constructorArguments.liquidityVault"),
    poolManager: address(root.poolManager, "naraEvidence.details.constructorArguments.poolManager"),
    positionManager: address(root.positionManager, "naraEvidence.details.constructorArguments.positionManager"),
    permit2: address(root.permit2, "naraEvidence.details.constructorArguments.permit2"),
    hook: address(root.hook, "naraEvidence.details.constructorArguments.hook"),
    poolFee,
    tickSpacing,
    poolId: bytes(root.poolId, "naraEvidence.details.constructorArguments.poolId", 32),
  };
}

function parseDetails(value: unknown): ParsedDeploymentDetails {
  const root = object(value, "naraEvidence.details");
  exactKeys(root, [
    "strategyPath", "deployer", "predictedManager", "salt", "initCodeHash", "initCodeBytes",
    "runtimeCodeHash", "runtimeBytes", "deploymentDeadline", "constructorArguments", "safeRoles",
  ], "naraEvidence.details");
  const roles = object(root.safeRoles, "naraEvidence.details.safeRoles");
  exactKeys(roles, ["deploymentExecutorSafe", "treasuryRangeSafe"], "naraEvidence.details.safeRoles");
  const deadline = unsigned(root.deploymentDeadline, "naraEvidence.details.deploymentDeadline");
  if (BigInt(deadline) > UINT64_MAX) throw new Error("Deployment packet deadline exceeds uint64");
  const initCodeBytes = integer(root.initCodeBytes, "naraEvidence.details.initCodeBytes", 1);
  const runtimeBytes = integer(root.runtimeBytes, "naraEvidence.details.runtimeBytes", 1);
  if (initCodeBytes > 49_152 || runtimeBytes > 24_576) throw new Error("Deployment packet bytecode exceeds EVM size limits");
  return {
    strategyPath: text(root.strategyPath, "naraEvidence.details.strategyPath"),
    deployer: address(root.deployer, "naraEvidence.details.deployer"),
    predictedManager: address(root.predictedManager, "naraEvidence.details.predictedManager"),
    salt: bytes(root.salt, "naraEvidence.details.salt", 32),
    initCodeHash: bytes(root.initCodeHash, "naraEvidence.details.initCodeHash", 32),
    initCodeBytes,
    runtimeCodeHash: bytes(root.runtimeCodeHash, "naraEvidence.details.runtimeCodeHash", 32),
    runtimeBytes,
    deploymentDeadline: deadline,
    constructorArguments: parseConstructorArguments(root.constructorArguments),
    safeRoles: {
      deploymentExecutorSafe: address(roles.deploymentExecutorSafe, "naraEvidence.details.safeRoles.deploymentExecutorSafe"),
      treasuryRangeSafe: address(roles.treasuryRangeSafe, "naraEvidence.details.safeRoles.treasuryRangeSafe"),
    },
  };
}

export function parseTreasuryRangeDeploymentPacket(
  value: unknown,
  expected: Readonly<{
    deploymentExecutorSafe: string;
    treasuryRangeSafe: string;
    create2Deployer: string;
  }>,
): ParsedTreasuryRangeDeploymentPacket {
  const root = object(value, "deployment packet");
  exactKeys(root, ["version", "chainId", "createdAt", "meta", "transactions", "naraEvidence"], "deployment packet");
  if (root.version !== "1.0" || root.chainId !== "8453") throw new Error("Deployment packet identity is not Base Safe Tx Builder v1");
  const meta = object(root.meta, "deployment packet meta");
  exactKeys(meta, ["name", "description", "txBuilderVersion", "createdFromSafeAddress", "checksum"], "deployment packet meta");
  const review = object(root.naraEvidence, "naraEvidence");
  exactKeys(review, [
    "changeId", "purpose", "noBroadcast", "humanApprovalRequired", "repositoryHead", "strategyHash",
    "chainId", "blockNumber", "blockHash", "blockTimestamp", "validUntil", "signingSafeRole", "signingSafe",
    "safeRoles", "calls", "simulation", "runtime", "externalDependencies", "protectedRelease", "checks", "details",
  ], "naraEvidence");
  const repositoryHead = text(review.repositoryHead, "naraEvidence.repositoryHead").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(repositoryHead)) throw new Error("Deployment packet repositoryHead must be a full commit");
  const strategyHash = bytes(review.strategyHash, "naraEvidence.strategyHash", 32);
  const blockNumber = integer(review.blockNumber, "naraEvidence.blockNumber", 1);
  const blockHash = bytes(review.blockHash, "naraEvidence.blockHash", 32);
  const blockTimestamp = integer(review.blockTimestamp, "naraEvidence.blockTimestamp", 1);
  const validUntil = integer(review.validUntil, "naraEvidence.validUntil", 1);
  const validity = validUntil - blockTimestamp;
  if (validity < 60 || validity > TREASURY_RANGE_MAX_DEADLINE_SECONDS) {
    throw new Error("Deployment packet validity window is outside the allowed JIT range");
  }
  const signingSafe = object(review.signingSafe, "naraEvidence.signingSafe");
  const signingSafeAddress = address(signingSafe.address, "naraEvidence.signingSafe.address");
  const safeRoles = object(review.safeRoles, "naraEvidence.safeRoles");
  exactKeys(safeRoles, ["deploymentExecutorSafe", "treasuryRangeSafe"], "naraEvidence.safeRoles");
  const deploymentExecutorSafe = address(safeRoles.deploymentExecutorSafe, "naraEvidence.safeRoles.deploymentExecutorSafe");
  const treasuryRangeSafe = address(safeRoles.treasuryRangeSafe, "naraEvidence.safeRoles.treasuryRangeSafe");
  if (review.purpose !== DEPLOYMENT_PURPOSE || review.noBroadcast !== true || review.humanApprovalRequired !== true
      || review.chainId !== "8453" || review.signingSafeRole !== "deployment_executor"
      || signingSafeAddress !== ethers.getAddress(expected.deploymentExecutorSafe)
      || deploymentExecutorSafe !== ethers.getAddress(expected.deploymentExecutorSafe)
      || treasuryRangeSafe !== ethers.getAddress(expected.treasuryRangeSafe)
      || deploymentExecutorSafe === treasuryRangeSafe) {
    throw new Error("Deployment packet Safe roles or no-broadcast identity are invalid");
  }
  if (!Array.isArray(review.calls) || review.calls.length !== 1) throw new Error("Deployment packet must contain exactly one reviewed call");
  const call = parseCall(review.calls[0], "naraEvidence.calls[0]");
  if (call.to !== ethers.getAddress(expected.create2Deployer) || call.value !== "0") {
    throw new Error("Deployment packet call is not zero-value canonical CREATE2 deployment");
  }
  const create2Interface = new ethers.Interface(CREATE2_DEPLOYER_ABI);
  const decoded = create2Interface.parseTransaction({ data: call.data, value: 0n });
  if (!decoded || decoded.name !== "deploy") throw new Error("Deployment packet calldata is not deploy(bytes32,bytes)");
  const salt = bytes(decoded.args.salt, "decoded deploy salt", 32);
  const initCode = bytes(decoded.args.initCode, "decoded manager initcode");
  const simulation = parseSimulation(review.simulation);
  const details = parseDetails(review.details);
  if (simulation.simulatedAtBlock !== blockNumber || simulation.safeTransaction.nonce !== unsigned(signingSafe.nonce, "naraEvidence.signingSafe.nonce")
      || details.deployer !== ethers.getAddress(expected.create2Deployer)
      || details.safeRoles.deploymentExecutorSafe !== deploymentExecutorSafe
      || details.safeRoles.treasuryRangeSafe !== treasuryRangeSafe
      || details.constructorArguments.treasurySafe !== treasuryRangeSafe
      || details.salt !== salt || details.initCodeHash !== ethers.keccak256(initCode).toLowerCase()
      || details.initCodeBytes !== ethers.getBytes(initCode).length
      || details.deploymentDeadline !== String(validUntil)
      || details.predictedManager !== ethers.getCreate2Address(details.deployer, salt, details.initCodeHash)) {
    throw new Error("Deployment packet details do not reproduce the exact Safe/CREATE2 plan");
  }
  if (!Array.isArray(review.checks) || canonicalJson(review.checks) !== canonicalJson(TREASURY_RANGE_DEPLOYMENT_REVIEW_CHECKS)) {
    throw new Error("Deployment packet human review checks differ from the canonical builder");
  }
  if (!Array.isArray(root.transactions) || root.transactions.length !== 1) throw new Error("Deployment packet must contain one Safe Tx Builder transaction");
  const transaction = object(root.transactions[0], "deployment packet transactions[0]");
  exactKeys(transaction, ["to", "value", "data", "contractMethod", "contractInputsValues"], "deployment packet transactions[0]");
  if (transaction.contractMethod !== null || transaction.contractInputsValues !== null
      || address(transaction.to, "deployment packet transactions[0].to") !== call.to
      || unsigned(transaction.value, "deployment packet transactions[0].value") !== call.value
      || bytes(transaction.data, "deployment packet transactions[0].data") !== call.data) {
    throw new Error("Safe Tx Builder transaction differs from naraEvidence.calls");
  }
  const expectedMeta = {
    name: `UNEXECUTED ${DEPLOYMENT_PURPOSE}`,
    description: `Human-review-only packet; strategy ${strategyHash}; nonce ${simulation.safeTransaction.nonce}; expires ${validUntil}`,
    txBuilderVersion: "1.18.0",
    createdFromSafeAddress: deploymentExecutorSafe,
    checksum: simulation.safeTxHash,
  };
  if (integer(root.createdAt, "deployment packet createdAt", 1) !== blockTimestamp * 1_000
      || canonicalJson(meta) !== canonicalJson(expectedMeta)) {
    throw new Error("Deployment packet metadata does not reproduce the exact reviewed snapshot");
  }
  return {
    review: {
      ...review,
      repositoryHead,
      strategyHash,
      blockNumber,
      blockHash,
      blockTimestamp,
      validUntil,
      signingSafe: signingSafe as unknown as CanonicalSafeEvidence,
      safeRoles: { deploymentExecutorSafe, treasuryRangeSafe },
      calls: [call],
      simulation,
      details,
    } as unknown as TreasuryRangeSafeReview,
    calls: [call],
    simulation,
    details,
    salt,
    initCode,
  };
}

export function treasuryRangeDeploymentEvidencePath(deploymentBlock: number): string {
  const block = integer(deploymentBlock, "deploymentBlock", 1);
  return resolve(DEPLOYMENTS_DIRECTORY, `v4-treasury-range-manager-deployment-${block}.json`);
}

export function treasuryRangeExecutedArtifactPath(sourcePath: string): string {
  const absolute = resolve(sourcePath);
  const sourceName = basename(absolute);
  const match = /^UNEXECUTED-(v4-treasury-range-deployment-\d+-nonce-\d+\.(?:json|md))$/.exec(sourceName);
  if (!match) throw new Error("Treasury Range deployment artifact is not a canonical UNEXECUTED JSON/Markdown path");
  return resolve(dirname(absolute), `EXECUTED-DO-NOT-IMPORT-${match[1]}`);
}

function treasuryRangeDeploymentRetirementPlan(
  packetPath: string,
  reviewPath: string,
): Readonly<{
  sourcePacketPath: string;
  sourceReviewPath: string;
  retiredPacketPath: string;
  retiredReviewPath: string;
}> {
  const sourcePacketPath = resolve(packetPath);
  const sourceReviewPath = resolve(reviewPath);
  if (dirname(sourcePacketPath) !== dirname(sourceReviewPath)
      || !sourcePacketPath.endsWith(".json")
      || sourcePacketPath.slice(0, -5) !== sourceReviewPath.slice(0, -3)) {
    throw new Error("Treasury Range deployment JSON and Markdown must be the exact same-directory artifact pair");
  }
  return {
    sourcePacketPath,
    sourceReviewPath,
    retiredPacketPath: treasuryRangeExecutedArtifactPath(sourcePacketPath),
    retiredReviewPath: treasuryRangeExecutedArtifactPath(sourceReviewPath),
  };
}

function assertTreasuryRangeRetirementReady(
  plan: ReturnType<typeof treasuryRangeDeploymentRetirementPlan>,
  operations: TreasuryRangeArtifactFileOperations,
): void {
  if (!operations.exists(plan.sourcePacketPath) || !operations.exists(plan.sourceReviewPath)) {
    throw new Error("Treasury Range deployment artifact pair is missing before retirement");
  }
  if (operations.exists(plan.retiredPacketPath) || operations.exists(plan.retiredReviewPath)) {
    throw new Error("Refusing to overwrite an existing EXECUTED-DO-NOT-IMPORT deployment artifact");
  }
}

export function retireTreasuryRangeDeploymentArtifacts(
  packetPath: string,
  reviewPath: string,
  operations: TreasuryRangeArtifactFileOperations = NATIVE_ARTIFACT_FILE_OPERATIONS,
): TreasuryRangeRetiredDeploymentArtifacts {
  const plan = treasuryRangeDeploymentRetirementPlan(packetPath, reviewPath);
  assertTreasuryRangeRetirementReady(plan, operations);
  try {
    operations.rename(plan.sourcePacketPath, plan.retiredPacketPath);
    operations.rename(plan.sourceReviewPath, plan.retiredReviewPath);
  } catch (error) {
    const rollbackFailures: string[] = [];
    for (const [destination, source, label] of [
      [plan.retiredReviewPath, plan.sourceReviewPath, "Markdown"],
      [plan.retiredPacketPath, plan.sourcePacketPath, "JSON"],
    ] as const) {
      if (!operations.exists(destination)) continue;
      if (operations.exists(source)) {
        rollbackFailures.push(`${label} source and retired paths both exist`);
        continue;
      }
      try {
        operations.rename(destination, source);
      } catch (rollbackError) {
        rollbackFailures.push(`${label}: ${safeTreasuryRangeError(rollbackError)}`);
      }
    }
    const failure = safeTreasuryRangeError(error);
    if (rollbackFailures.length > 0) {
      throw new Error(`Treasury Range artifact retirement failed (${failure}); rollback failed: ${rollbackFailures.join("; ")}`);
    }
    throw new Error(`Treasury Range artifact retirement failed and was rolled back: ${failure}`);
  }
  return { packetPath: plan.retiredPacketPath, reviewPath: plan.retiredReviewPath };
}

export function assertTreasuryRangeFinalizationPersistenceSnapshot(
  expected: TreasuryRangeFinalizationPersistenceSnapshot,
  actual: TreasuryRangeFinalizationPersistenceSnapshot,
): void {
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    throw new Error("Repository or canonical Base deployment evidence changed immediately before persistence");
  }
}

export function buildTreasuryRangeManagerDeploymentEvidence(
  value: TreasuryRangeManagerDeploymentEvidence,
): TreasuryRangeManagerDeploymentEvidence {
  const parsed = parseTreasuryRangeManagerDeploymentEvidence(value);
  const serialized = JSON.stringify(parsed);
  if (/"owners"\s*:/.test(serialized)) throw new Error("Final deployment evidence must not contain raw Safe owners");
  return parsed;
}

function repositoryRelativePath(requestedPath: string, label: string): string {
  const absolute = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(REPOSITORY_ROOT, requestedPath);
  const local = relative(REPOSITORY_ROOT, absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`${label} must remain inside the authoritative repository`);
  }
  return local.replaceAll("\\", "/");
}

function durableWriteNew(path: string, contents: string): void {
  const descriptor = openSync(path, "wx");
  try {
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function repositoryHead(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim().toLowerCase();
}

function deploymentReceiptFingerprint(receipt: ethers.TransactionReceipt): string {
  return canonicalJson(JSON.parse(JSON.stringify(receipt.toJSON())));
}

async function readFinalizationPersistenceSnapshot(
  provider: ethers.Provider,
  transactionHash: string,
  deploymentBlockNumber: number,
  readbackBlockNumber: number,
): Promise<TreasuryRangeFinalizationPersistenceSnapshot> {
  const [receipt, deploymentBlock, readbackBlock] = await Promise.all([
    provider.getTransactionReceipt(transactionHash),
    provider.getBlock(deploymentBlockNumber),
    provider.getBlock(readbackBlockNumber),
  ]);
  if (!receipt || !deploymentBlock?.hash || !readbackBlock?.hash
      || /^0x0{64}$/i.test(deploymentBlock.hash) || /^0x0{64}$/i.test(readbackBlock.hash)) {
    throw new Error("Canonical deployment receipt or pinned block disappeared immediately before persistence");
  }
  return {
    repositoryHead: repositoryHead(),
    deploymentReceipt: deploymentReceiptFingerprint(receipt),
    deploymentBlock: { number: deploymentBlock.number, hash: deploymentBlock.hash.toLowerCase() },
    readbackBlock: { number: readbackBlock.number, hash: readbackBlock.hash.toLowerCase() },
  };
}

function gitOutput(args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: REPOSITORY_ROOT, encoding: "utf8" });
}

function assertFinalizationRepositoryEvidence(packetPath: string, strategyPath: string): void {
  if (gitOutput(["diff", "--name-only", "--"]).trim()
      || gitOutput(["diff", "--cached", "--name-only", "--"]).trim()) {
    throw new Error("Deployment finalization requires every tracked file to be clean");
  }
  const reviewPath = packetPath.replace(/\.json$/, ".md");
  if (reviewPath === packetPath || !existsSync(resolve(REPOSITORY_ROOT, reviewPath))) {
    throw new Error("Deployment packet Markdown review is missing");
  }
  const allowed = new Set([packetPath, reviewPath, strategyPath]);
  const visible = gitOutput(["ls-files", "--others", "--exclude-standard", "-z"]);
  const ignored = gitOutput([
    "ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--",
    "contracts", "deployments", "docs", "scripts", "services", "test",
  ]);
  const untracked = [...new Set(`${visible}${ignored}`.split("\0").filter(Boolean)
    .map((item) => item.replaceAll("\\", "/")))];
  if (untracked.length !== allowed.size || untracked.some((item) => !allowed.has(item))) {
    throw new Error("Deployment finalization permits only the exact strategy and deployment packet/review artifacts");
  }
}

function requiredConfirmations(environment: NodeJS.ProcessEnv = process.env): number {
  const raw = environment[TREASURY_RANGE_DEPLOYMENT_CONFIRMATIONS_ENV]?.trim();
  if (!raw) return TREASURY_RANGE_DEFAULT_DEPLOYMENT_CONFIRMATIONS;
  if (!/^\d+$/.test(raw)) throw new Error(`${TREASURY_RANGE_DEPLOYMENT_CONFIRMATIONS_ENV} must be an integer`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 3 || parsed > 64) {
    throw new Error(`${TREASURY_RANGE_DEPLOYMENT_CONFIRMATIONS_ENV} must be between 3 and 64`);
  }
  return parsed;
}

async function canonicalBlock(
  provider: ethers.Provider,
  blockNumber: number,
  expectedHash: string,
  label: string,
): Promise<ethers.Block> {
  const block = await provider.getBlock(blockNumber);
  if (!block?.hash || /^0x0{64}$/i.test(block.hash) || block.hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(`${label} block/hash is not canonical Base evidence`);
  }
  return block;
}

function treasurySafePolicy(authorities: TreasuryRangeAuthorities) {
  return {
    address: authorities.treasuryRangeSafe,
    safeRuntimeCodeHash: authorities.treasuryRangeSafeRuntimeCodeHash,
    version: authorities.treasuryRangeSafeVersion,
    threshold: authorities.treasuryRangeSafeThreshold,
    ownerCount: authorities.treasuryRangeSafeOwnerCount,
    ownerSetHash: authorities.treasuryRangeSafeOwnerSetHash,
  } as const;
}

function canonicalTreasuryPolicyEvidence(evidence: TreasuryRangeSafeEvidence) {
  if (evidence.threshold !== "1" || evidence.ownerCount !== 1) {
    throw new Error("Treasury Safe evidence is not the approved 1-of-1 policy");
  }
  return {
    address: evidence.address,
    runtimeCodeHash: evidence.safeRuntimeCodeHash,
    version: evidence.version,
    threshold: "1" as const,
    ownerCount: 1 as const,
    ownerSetHash: evidence.ownerSetHash,
  } as const;
}

async function readPinnedRuntime(
  provider: ethers.Provider,
  strategy: TreasuryRangeStrategyManifest,
  authorities: TreasuryRangeAuthorities,
  blockNumber: number,
): Promise<Record<string, { address: string; codeHash: string }>> {
  const targets: ReadonlyArray<[string, string, string]> = [
    ["nara", strategy.addresses.nara, strategy.runtimeCodeHashes.nara],
    ["hook", strategy.addresses.hook, strategy.runtimeCodeHashes.hook],
    ["deploymentExecutorSafe", authorities.deploymentExecutorSafe, authorities.deploymentExecutorSafeRuntimeCodeHash],
    ["treasuryRangeSafe", authorities.treasuryRangeSafe, authorities.treasuryRangeSafeRuntimeCodeHash],
    ...(["usdc", "liquidityVault", "liquidityCompounder", "poolManager", "positionManager", "permit2",
      "universalRouter", "officialV4Quoter", "create2HookDeployer"] as const).map((label) => [
      label,
      strategy.addresses[label],
      strategy.runtimeCodeHashes[label],
    ] as [string, string, string]),
  ];
  const runtime: Record<string, { address: string; codeHash: string }> = {};
  for (const [label, target, expectedHash] of targets) {
    if (!expectedHash || !ethers.isHexString(expectedHash, 32)) throw new Error(`Strategy runtimeCodeHashes.${label} is missing`);
    const code = await provider.getCode(target, blockNumber);
    const codeHash = code === "0x" ? "0x" : ethers.keccak256(code).toLowerCase();
    if (codeHash !== expectedHash.toLowerCase()) throw new Error(`${label} runtime differs at the packet block`);
    runtime[label] = { address: ethers.getAddress(target), codeHash };
  }
  return runtime;
}

function assertProductionBindings(details: ParsedDeploymentDetails, authorities: TreasuryRangeAuthorities): void {
  const production = canonicalProductionV4Deployment();
  const expected: ParsedDeploymentDetails["constructorArguments"] = {
    treasurySafe: authorities.treasuryRangeSafe,
    nara: production.token,
    usdc: production.base,
    liquidityVault: production.vault,
    poolManager: production.poolManager,
    positionManager: production.positionManager,
    permit2: production.permit2,
    hook: production.hook,
    poolFee: production.poolFee,
    tickSpacing: production.tickSpacing,
    poolId: production.poolId.toLowerCase(),
  };
  same(details.constructorArguments, expected, "Deployment packet constructor arguments");
  if (details.deployer !== production.create2HookDeployer) throw new Error("Deployment packet CREATE2 deployer differs from production");
}

async function assertManagerGetters(
  provider: ethers.Provider,
  managerAddress: string,
  details: ParsedDeploymentDetails,
  blockNumbers: readonly number[],
): Promise<void> {
  const manager = new ethers.Contract(managerAddress, TREASURY_RANGE_MANAGER_ABI, provider);
  const expected: ReadonlyArray<[string, string | number]> = [
    ["TREASURY_SAFE", details.constructorArguments.treasurySafe],
    ["NARA", details.constructorArguments.nara],
    ["USDC", details.constructorArguments.usdc],
    ["LIQUIDITY_VAULT", details.constructorArguments.liquidityVault],
    ["POOL_MANAGER", details.constructorArguments.poolManager],
    ["POSITION_MANAGER", details.constructorArguments.positionManager],
    ["PERMIT2", details.constructorArguments.permit2],
    ["HOOK", details.constructorArguments.hook],
    ["POOL_FEE", details.constructorArguments.poolFee],
    ["TICK_SPACING", details.constructorArguments.tickSpacing],
    ["POOL_ID", details.constructorArguments.poolId],
    ["DEPLOYMENT_DEADLINE", details.deploymentDeadline],
    ["MAX_SETTLE_BATCH", 16],
  ];
  for (const blockNumber of [...new Set(blockNumbers)]) {
    for (const [method, wanted] of expected) {
      const actual = await manager.getFunction(method)({ blockTag: blockNumber });
      let matches: boolean;
      if (typeof wanted === "string" && /^0x[0-9a-fA-F]{40}$/.test(wanted)) {
        matches = ethers.getAddress(actual) === ethers.getAddress(wanted);
      } else if (typeof wanted === "string" && wanted.startsWith("0x")) {
        matches = String(actual).toLowerCase() === wanted.toLowerCase();
      } else {
        matches = BigInt(actual) === BigInt(wanted);
      }
      if (!matches) throw new Error(`Manager ${method} differs at block ${blockNumber}`);
    }
    const [activeOrderCount, operationalClean] = await Promise.all([
      manager.activeOrderCount({ blockTag: blockNumber }) as Promise<bigint>,
      manager.assertOperationalClean({ blockTag: blockNumber }) as Promise<boolean>,
    ]);
    if (BigInt(activeOrderCount) !== 0n || operationalClean !== true) {
      throw new Error(`Manager is not an empty, allowance-clean deployment at block ${blockNumber}`);
    }
  }
}

function executionSuccessLogIndex(receipt: ethers.TransactionReceipt, safe: string): number {
  const safeInterface = new ethers.Interface(EXECUTION_SUCCESS_ABI);
  const event = safeInterface.getEvent("ExecutionSuccess");
  if (!event) throw new Error("Safe ExecutionSuccess ABI is unavailable");
  const logs = receipt.logs.filter((log) => ethers.getAddress(log.address) === ethers.getAddress(safe)
    && log.topics[0]?.toLowerCase() === event.topicHash.toLowerCase());
  if (logs.length !== 1) throw new Error("Safe receipt does not contain exactly one ExecutionSuccess event");
  const parsed = safeInterface.parseLog(logs[0]);
  if (!parsed || BigInt(parsed.args.payment) !== 0n) throw new Error("Safe execution log is malformed or reimbursed");
  return logs[0].index;
}

function create2DeploymentLog(
  receipt: ethers.TransactionReceipt,
  deployer: string,
  expected: Readonly<{ deployed: string; salt: string; initCodeHash: string }>,
): number {
  const create2Interface = new ethers.Interface(CREATE2_DEPLOYER_ABI);
  const event = create2Interface.getEvent("Deployed");
  if (!event) throw new Error("CREATE2 Deployed ABI is unavailable");
  const logs = receipt.logs.filter((log) => ethers.getAddress(log.address) === ethers.getAddress(deployer)
    && log.topics[0]?.toLowerCase() === event.topicHash.toLowerCase());
  if (logs.length !== 1) throw new Error("Safe receipt does not contain exactly one CREATE2 Deployed event");
  const parsed = create2Interface.parseLog(logs[0]);
  if (!parsed || ethers.getAddress(parsed.args.deployed) !== ethers.getAddress(expected.deployed)
      || String(parsed.args.salt).toLowerCase() !== expected.salt.toLowerCase()
      || String(parsed.args.initCodeHash).toLowerCase() !== expected.initCodeHash.toLowerCase()) {
    throw new Error("CREATE2 Deployed event differs from the exact unsigned packet");
  }
  return logs[0].index;
}

function assertProtectedRelease(
  packet: TreasuryRangeSafeReview,
  current: TreasuryRangeProtectedReleaseEvidence,
): void {
  same(packet.protectedRelease, current, "Deployment packet protected release");
}

export async function finalizeV4TreasuryRangeManagerDeployment(): Promise<void> {
  if (hre.globalOptions.network !== "base") throw new Error("Treasury Range deployment evidence must run with --network base");
  const packetInput = process.env[TREASURY_RANGE_DEPLOYMENT_PACKET_ENV]?.trim() ?? "";
  const transactionHash = process.env[TREASURY_RANGE_DEPLOYMENT_TX_ENV]?.trim() ?? "";
  if (packetInput === "" || !ethers.isHexString(transactionHash, 32)) {
    throw new Error(`Set ${TREASURY_RANGE_DEPLOYMENT_PACKET_ENV} and a 32-byte ${TREASURY_RANGE_DEPLOYMENT_TX_ENV}`);
  }
  const packetPath = repositoryRelativePath(packetInput, "Deployment packet");
  if (!/^deployments\/UNEXECUTED-v4-treasury-range-deployment-\d+-nonce-\d+\.json$/.test(packetPath)) {
    throw new Error("Deployment packet path is not the canonical UNEXECUTED Treasury Range deployment pattern");
  }
  const absolutePacketPath = resolve(REPOSITORY_ROOT, packetPath);
  if (!existsSync(absolutePacketPath) || basename(absolutePacketPath).startsWith("PENDING-")) {
    throw new Error("Exact published unsigned deployment packet is missing");
  }

  const production = canonicalProductionV4Deployment();
  const authorities = canonicalTreasuryRangeAuthorities(production);
  const packet = parseTreasuryRangeDeploymentPacket(JSON.parse(readFileSync(absolutePacketPath, "utf8")), {
    deploymentExecutorSafe: authorities.deploymentExecutorSafe,
    treasuryRangeSafe: authorities.treasuryRangeSafe,
    create2Deployer: production.create2HookDeployer,
  });
  const head = repositoryHead();
  if (packet.review.repositoryHead !== head) throw new Error("Deployment packet repositoryHead is not the exact current committed HEAD");
  const protectedRelease = readTreasuryRangeProtectedReleaseEvidence(REPOSITORY_ROOT, head);
  assertProtectedRelease(packet.review, protectedRelease);

  const strategyRelative = repositoryRelativePath(packet.details.strategyPath, "Deployment strategy");
  assertFinalizationRepositoryEvidence(packetPath, strategyRelative);
  const packetReviewPath = resolve(REPOSITORY_ROOT, packetPath.replace(/\.json$/, ".md"));
  if (readFileSync(packetReviewPath, "utf8") !== treasuryRangeSafeMarkdownReview(packet.review)) {
    throw new Error("Deployment packet Markdown review differs from the exact JSON evidence");
  }
  const strategy = loadTreasuryRangeStrategyManifest(resolve(REPOSITORY_ROOT, strategyRelative));
  assertTreasuryRangeManifestExactEvidence(strategy);
  assertTreasuryRangeCanaryLaunchManifest(strategy);
  assertTreasuryRangePredeploymentManifest(strategy);
  if (strategy.repositoryHead !== head || strategy.changeId !== packet.review.changeId
      || strategy.strategyHash !== packet.review.strategyHash) {
    throw new Error("Deployment packet does not bind the exact predeployment strategy and committed HEAD");
  }
  assertProductionBindings(packet.details, authorities);
  const expectedSalt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "bytes32", "bytes20", "bytes32"],
    [strategy.changeId, strategy.strategyHash, `0x${strategy.repositoryHead}`, packet.details.initCodeHash],
  ));
  if (packet.salt !== expectedSalt.toLowerCase()) {
    throw new Error("Deployment packet CREATE2 salt does not reproduce the strategy/change/commit binding");
  }

  const provider = createTreasuryRangeProvider(requiredBaseRpcUrl());
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== 8453n) throw new Error("Treasury Range finalizer RPC is not Base chain 8453");
    const signingBlock = await canonicalBlock(provider, packet.review.blockNumber, packet.review.blockHash, "Packet");
    if (signingBlock.timestamp !== packet.review.blockTimestamp) throw new Error("Packet block timestamp differs from canonical Base");
    const signingRuntime = await readPinnedRuntime(provider, strategy, authorities, packet.review.blockNumber);
    same(packet.review.runtime, signingRuntime, "Deployment packet runtime");
    const deploymentUsdcEvidence = {
      ...strategy.externalDependencies.usdc,
      monitoredAccounts: {
        ...strategy.externalDependencies.usdc.monitoredAccounts,
        rangeManager: {
          address: packet.details.predictedManager,
          isBlacklisted: false,
        },
      },
    };
    same(packet.review.externalDependencies, {
      usdc: { enforcement: "exact", evidence: deploymentUsdcEvidence },
    }, "Deployment packet USDC dependency");

    const signingProtocolSafe = await readCanonicalNaraSafeEvidence(
      provider,
      authorities.deploymentExecutorSafe,
      authorities.deploymentExecutorSafeRuntimeCodeHash,
      packet.review.blockNumber,
    );
    same(packet.review.signingSafe, signingProtocolSafe, "Deployment packet protocol Safe snapshot");
    const signingTreasurySafe = await readTreasuryRangeSafeEvidence(
      provider,
      treasurySafePolicy(authorities),
      packet.review.blockNumber,
    );
    const create2 = new ethers.Contract(production.create2HookDeployer, CREATE2_DEPLOYER_ABI, provider);
    const [signingCreate2Owner, signingPredicted, signingManagerCode] = await Promise.all([
      create2.owner({ blockTag: packet.review.blockNumber }),
      create2.computeAddress(packet.salt, packet.details.initCodeHash, { blockTag: packet.review.blockNumber }),
      provider.getCode(packet.details.predictedManager, packet.review.blockNumber),
    ]);
    if (ethers.getAddress(signingCreate2Owner) !== authorities.deploymentExecutorSafe) {
      throw new Error("CREATE2 deployer was not owned by the protocol Safe at packet construction");
    }
    if (ethers.getAddress(signingPredicted) !== packet.details.predictedManager || signingManagerCode !== "0x") {
      throw new Error("CREATE2 manager prediction was occupied or did not reproduce at packet construction");
    }
    const reproducedSimulation = await buildAndSimulateSafeBatch(
      provider,
      authorities.deploymentExecutorSafe,
      BigInt(signingProtocolSafe.nonce),
      packet.calls,
      packet.review.blockNumber,
    );
    same(packet.simulation, reproducedSimulation, "Deployment packet Safe simulation");
    const signingUsdc = await readCircleFiatTokenDependency(
      provider,
      production.base,
      Object.fromEntries(Object.entries(deploymentUsdcEvidence.monitoredAccounts).map(
        ([label, account]) => [label, account.address],
      )),
      packet.review.blockNumber,
    );
    assertCircleFiatTokenDependencyExact(
      packet.review.externalDependencies.usdc.evidence,
      signingUsdc,
    );

    await forceRebuildTreasuryRangeManagerArtifact(hre.tasks);
    const artifact = await hre.artifacts.readArtifact(MANAGER_FQN);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
    const args = packet.details.constructorArguments;
    const reproduced = await factory.getDeployTransaction(
      args.treasurySafe,
      args.nara,
      args.usdc,
      args.liquidityVault,
      args.poolManager,
      args.positionManager,
      args.permit2,
      args.hook,
      args.poolFee,
      args.tickSpacing,
      args.poolId,
      BigInt(packet.details.deploymentDeadline),
    );
    if (!reproduced.data || ethers.hexlify(reproduced.data).toLowerCase() !== packet.initCode) {
      throw new Error("Freshly rebuilt manager initcode differs from the exact unsigned deployment packet");
    }
    const simulatedRuntime = await provider.send("eth_call", [
      { from: authorities.deploymentExecutorSafe, data: packet.initCode },
      ethers.toQuantity(packet.review.blockNumber),
    ]);
    if (typeof simulatedRuntime !== "string" || simulatedRuntime === "0x"
        || ethers.getBytes(simulatedRuntime).length !== packet.details.runtimeBytes
        || ethers.keccak256(simulatedRuntime).toLowerCase() !== packet.details.runtimeCodeHash) {
      throw new Error("Historical constructor simulation differs from the exact unsigned packet runtime evidence");
    }

    const safeExecution = await decodeAndVerifySafeExecution(
      provider,
      authorities.deploymentExecutorSafe,
      transactionHash,
      packet.calls,
      packet.simulation,
    );
    const receipt = await provider.getTransactionReceipt(transactionHash);
    if (!receipt || receipt.status !== 1 || receipt.blockNumber !== safeExecution.transactionReceipt.blockNumber
        || receipt.blockHash.toLowerCase() !== safeExecution.transactionReceipt.blockHash.toLowerCase()) {
      throw new Error("Canonical Safe execution receipt disappeared or changed");
    }
    const deploymentBlock = await canonicalBlock(provider, receipt.blockNumber, receipt.blockHash, "Deployment");
    if (receipt.blockNumber <= packet.review.blockNumber || deploymentBlock.timestamp > packet.review.validUntil) {
      throw new Error("Safe deployment was not mined after the packet snapshot and before its exact deadline");
    }
    const outputPath = treasuryRangeDeploymentEvidencePath(receipt.blockNumber);
    if (existsSync(outputPath)) throw new Error(`Refusing to overwrite finalized deployment evidence: ${relative(REPOSITORY_ROOT, outputPath)}`);
    const retirementPlan = treasuryRangeDeploymentRetirementPlan(absolutePacketPath, packetReviewPath);
    assertTreasuryRangeRetirementReady(retirementPlan, NATIVE_ARTIFACT_FILE_OPERATIONS);

    const create2LogIndex = create2DeploymentLog(receipt, production.create2HookDeployer, {
      deployed: packet.details.predictedManager,
      salt: packet.salt,
      initCodeHash: packet.details.initCodeHash,
    });
    const safeLogIndex = executionSuccessLogIndex(receipt, authorities.deploymentExecutorSafe);
    const onchainPredicted = await create2.computeAddress(packet.salt, packet.details.initCodeHash, { blockTag: receipt.blockNumber });
    if (ethers.getAddress(onchainPredicted) !== packet.details.predictedManager) {
      throw new Error("CREATE2 deployer does not reproduce the packet manager address at deployment");
    }

    const latest = await provider.getBlock("latest");
    if (!latest?.hash || latest.number < receipt.blockNumber || /^0x0{64}$/i.test(latest.hash)) {
      throw new Error("Could not pin a canonical final readback block after deployment");
    }
    const confirmations = latest.number - receipt.blockNumber + 1;
    const minimumConfirmations = requiredConfirmations();
    if (confirmations < minimumConfirmations) {
      throw new Error(`Manager deployment has ${confirmations}/${minimumConfirmations} required confirmations`);
    }
    const [receiptCode, currentCode] = await Promise.all([
      provider.getCode(packet.details.predictedManager, receipt.blockNumber),
      provider.getCode(packet.details.predictedManager, latest.number),
    ]);
    if (receiptCode === "0x" || currentCode === "0x"
        || ethers.getBytes(receiptCode).length !== packet.details.runtimeBytes
        || ethers.keccak256(receiptCode).toLowerCase() !== packet.details.runtimeCodeHash
        || ethers.keccak256(currentCode).toLowerCase() !== packet.details.runtimeCodeHash) {
      throw new Error("Manager receipt/current runtime does not match the constructor-simulated packet hash");
    }
    await assertManagerGetters(provider, packet.details.predictedManager, packet.details, [receipt.blockNumber, latest.number]);

    await readCanonicalNaraSafeEvidence(
      provider,
      authorities.deploymentExecutorSafe,
      authorities.deploymentExecutorSafeRuntimeCodeHash,
      receipt.blockNumber,
    );
    await readCanonicalNaraSafeEvidence(
      provider,
      authorities.deploymentExecutorSafe,
      authorities.deploymentExecutorSafeRuntimeCodeHash,
      latest.number,
    );
    const deploymentTreasurySafe = await readTreasuryRangeSafeEvidence(
      provider,
      treasurySafePolicy(authorities),
      receipt.blockNumber,
    );
    const currentTreasurySafe = await readTreasuryRangeSafeEvidence(
      provider,
      treasurySafePolicy(authorities),
      latest.number,
    );
    same(canonicalTreasuryPolicyEvidence(signingTreasurySafe), canonicalTreasuryPolicyEvidence(deploymentTreasurySafe), "Treasury Safe deployment policy");
    same(canonicalTreasuryPolicyEvidence(signingTreasurySafe), canonicalTreasuryPolicyEvidence(currentTreasurySafe), "Treasury Safe current policy");
    const currentCreate2Owner = await create2.owner({ blockTag: latest.number });
    if (ethers.getAddress(currentCreate2Owner) !== authorities.deploymentExecutorSafe) {
      throw new Error("CREATE2 deployer owner changed after manager deployment");
    }
    const usdcActors = Object.fromEntries(Object.entries(deploymentUsdcEvidence.monitoredAccounts).map(
      ([label, account]) => [label, account.address],
    ));
    const [deploymentUsdc, currentUsdc] = await Promise.all([
      readCircleFiatTokenDependency(provider, production.base, usdcActors, receipt.blockNumber),
      readCircleFiatTokenDependency(provider, production.base, usdcActors, latest.number),
    ]);
    assertCircleFiatTokenDependencyExact(signingUsdc, deploymentUsdc);
    assertCircleFiatTokenDependencyExact(signingUsdc, currentUsdc);

    const manifest = buildTreasuryRangeManagerDeploymentEvidence({
      schemaVersion: "nara.v4.treasury-range-manager-deployment.v3",
      status: "deployed_verified",
      originCommit: packet.review.repositoryHead,
      deploymentTransactionHash: transactionHash.toLowerCase(),
      deploymentBlock: receipt.blockNumber,
      deploymentBlockHash: receipt.blockHash.toLowerCase(),
      predictedAddress: packet.details.predictedManager,
      deployedAddress: packet.details.predictedManager,
      runtimeCodeHash: packet.details.runtimeCodeHash,
      deploymentExecutorSafeExecution: {
        safe: authorities.deploymentExecutorSafe,
        transactionHash: transactionHash.toLowerCase(),
        safeTransactionHash: safeExecution.safeTransactionHash.toLowerCase(),
        nonce: safeExecution.safeNonce,
        executionSuccessLogIndex: safeLogIndex,
        safeTransaction: packet.simulation.safeTransaction,
        packedTransactionsHash: packet.simulation.packedTransactionsHash,
        multiSendCallOnly: packet.simulation.multiSendCallOnly,
        multiSendCallOnlyCodeHash: packet.simulation.multiSendCallOnlyCodeHash,
        innerCalls: packet.calls,
      },
      treasuryRangeSafePolicy: canonicalTreasuryPolicyEvidence(currentTreasurySafe),
      create2Deployment: {
        deployer: production.create2HookDeployer,
        deployedAddress: packet.details.predictedManager,
        salt: packet.salt,
        initCodeHash: packet.details.initCodeHash,
        deployedLogIndex: create2LogIndex,
      },
      constructorBindings: {
        ...packet.details.constructorArguments,
        deploymentDeadline: packet.details.deploymentDeadline,
      },
    });
    const output = prettyTreasuryRangeJson(manifest);
    const expectedPersistenceSnapshot: TreasuryRangeFinalizationPersistenceSnapshot = {
      repositoryHead: head,
      deploymentReceipt: deploymentReceiptFingerprint(receipt),
      deploymentBlock: { number: deploymentBlock.number, hash: deploymentBlock.hash!.toLowerCase() },
      readbackBlock: { number: latest.number, hash: latest.hash.toLowerCase() },
    };
    const currentPersistenceSnapshot = await readFinalizationPersistenceSnapshot(
      provider,
      transactionHash,
      receipt.blockNumber,
      latest.number,
    );
    assertTreasuryRangeFinalizationPersistenceSnapshot(expectedPersistenceSnapshot, currentPersistenceSnapshot);
    durableWriteNew(outputPath, output);
    if (readFileSync(outputPath, "utf8") !== output) throw new Error("Final deployment evidence did not reproduce after write");
    const retiredArtifacts = retireTreasuryRangeDeploymentArtifacts(absolutePacketPath, packetReviewPath);
    process.stdout.write(`${JSON.stringify({
      schemaVersion: manifest.schemaVersion,
      status: manifest.status,
      evidencePath: relative(REPOSITORY_ROOT, outputPath).replaceAll("\\", "/"),
      deploymentTransactionHash: manifest.deploymentTransactionHash,
      deploymentBlock: manifest.deploymentBlock,
      manager: manifest.deployedAddress,
      deploymentExecutorSafe: manifest.deploymentExecutorSafeExecution.safe,
      treasuryRangeSafe: manifest.treasuryRangeSafePolicy.address,
      treasuryRangeSafeThreshold: manifest.treasuryRangeSafePolicy.threshold,
      treasuryRangeSafeOwnerCount: manifest.treasuryRangeSafePolicy.ownerCount,
      treasuryRangeSafeOwnerSetHash: manifest.treasuryRangeSafePolicy.ownerSetHash,
      readbackBlock: latest.number,
      readbackBlockHash: latest.hash.toLowerCase(),
      confirmations,
      retiredPacketPath: relative(REPOSITORY_ROOT, retiredArtifacts.packetPath).replaceAll("\\", "/"),
      retiredReviewPath: relative(REPOSITORY_ROOT, retiredArtifacts.reviewPath).replaceAll("\\", "/"),
      noTransactionSignedOrSent: true,
    }, null, 2)}\n`);
  } finally {
    provider.destroy();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  void finalizeV4TreasuryRangeManagerDeployment().catch((error) => {
    process.stderr.write(`${safeTreasuryRangeError(error)}\n`);
    process.stderr.write("No transaction was signed or sent. Finalization did not complete; inspect local evidence and artifact state.\n");
    process.exitCode = 1;
  });
}
