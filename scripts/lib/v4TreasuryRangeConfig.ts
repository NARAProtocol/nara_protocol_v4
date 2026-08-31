import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import {
  canonicalProductionV4Deployment,
  type ProductionV4Deployment,
} from "./v4LiveConfig.js";
import {
  BASE_SAFE_141_SINGLETON,
  BASE_SAFE_141_SINGLETON_CODEHASH,
  NARA_SAFE_FALLBACK_HANDLER,
  NARA_SAFE_FALLBACK_HANDLER_CODEHASH,
} from "./v4SafeEvidence.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const TREASURY_RANGE_CUSTODY_POLICY_REPOSITORY_PATH =
  "deployments/v4-treasury-range-custody-policy-2026-08-31.json" as const;
export const TREASURY_RANGE_CUSTODY_POLICY_PATH = resolve(
  repoRoot,
  TREASURY_RANGE_CUSTODY_POLICY_REPOSITORY_PATH,
);
export const TREASURY_RANGE_CUSTODY_POLICY_SHA256 =
  "1ce6a886bca14b390209fd9e4df4f55a32cef3261ae1408c7581024e5c4a8008" as const;
export const TREASURY_RANGE_CUSTODY_POLICY_SCHEMA =
  "nara.v4.treasury-range-custody-policy.v1" as const;
export const TREASURY_RANGE_CUSTODY_POLICY_CHANGE_ID =
  "NARA-20260831-v4-treasury-range-dedicated-safe" as const;
export const TREASURY_RANGE_SINGLE_SIGNER_RISK_ACCEPTANCE_ENV =
  "V4_TREASURY_RANGE_ACCEPT_SINGLE_SIGNER_SAFE" as const;

export interface TreasuryRangeAuthorities {
  custodyPolicyChangeId: typeof TREASURY_RANGE_CUSTODY_POLICY_CHANGE_ID;
  custodyPolicyPath: string;
  custodyPolicySha256: string;
  deploymentExecutorSafe: string;
  deploymentExecutorSafeRuntimeCodeHash: string;
  treasuryRangeSafe: string;
  treasuryRangeSafeRuntimeCodeHash: string;
  treasuryRangeSafeVersion: "1.4.1";
  treasuryRangeSafeThreshold: bigint;
  treasuryRangeSafeOwnerCount: number;
  treasuryRangeSafeOwnerSetHash: string;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function address(value: unknown, label: string): string {
  try {
    return ethers.getAddress(text(value, label));
  } catch {
    throw new Error(`${label} must be an EVM address`);
  }
}

function hash(value: unknown, label: string): string {
  const parsed = text(value, label).toLowerCase();
  if (!ethers.isHexString(parsed, 32)) throw new Error(`${label} must be bytes32`);
  return parsed;
}

function normalizedSha256(raw: string): string {
  return createHash("sha256").update(raw.replace(/\r\n/g, "\n")).digest("hex");
}

export function canonicalTreasuryRangeAuthorities(
  deployment: ProductionV4Deployment = canonicalProductionV4Deployment(),
  policyPath = TREASURY_RANGE_CUSTODY_POLICY_PATH,
): TreasuryRangeAuthorities {
  const raw = readFileSync(policyPath, "utf8");
  const policySha256 = normalizedSha256(raw);
  if (policySha256 !== TREASURY_RANGE_CUSTODY_POLICY_SHA256) {
    throw new Error(
      `Treasury Range custody policy hash mismatch: expected ${TREASURY_RANGE_CUSTODY_POLICY_SHA256}, received ${policySha256}`,
    );
  }
  const policy = object(JSON.parse(raw), "Treasury Range custody policy");
  if (policy.schemaVersion !== TREASURY_RANGE_CUSTODY_POLICY_SCHEMA
      || policy.changeId !== TREASURY_RANGE_CUSTODY_POLICY_CHANGE_ID
      || policy.status !== "candidate_requires_single_signer_risk_acceptance"
      || policy.chainId !== "8453") {
    throw new Error("Treasury Range custody policy identity or status is invalid");
  }
  const executor = object(policy.deploymentExecutorSafe, "deploymentExecutorSafe");
  const treasury = object(policy.treasuryRangeSafe, "treasuryRangeSafe");
  const risk = object(policy.singleSignerRisk, "singleSignerRisk");
  const deploymentExecutorSafe = address(executor.address, "deploymentExecutorSafe.address");
  const deploymentExecutorSafeRuntimeCodeHash = hash(
    executor.runtimeCodeHash,
    "deploymentExecutorSafe.runtimeCodeHash",
  );
  const treasuryRangeSafe = address(treasury.address, "treasuryRangeSafe.address");
  const treasuryRangeSafeRuntimeCodeHash = hash(treasury.runtimeCodeHash, "treasuryRangeSafe.runtimeCodeHash");
  const ownerSetHash = hash(treasury.ownerSetHash, "treasuryRangeSafe.ownerSetHash");
  const threshold = BigInt(text(treasury.threshold, "treasuryRangeSafe.threshold"));
  const ownerCount = treasury.ownerCount;

  if (deploymentExecutorSafe !== ethers.getAddress(deployment.safe)
      || deploymentExecutorSafeRuntimeCodeHash !== deployment.safeCodeHash.toLowerCase()) {
    throw new Error("Treasury Range deployment executor differs from the hash-pinned production Safe");
  }
  if (treasuryRangeSafe === deploymentExecutorSafe) {
    throw new Error("Treasury Range deployment executor and custody Safe must be different addresses");
  }
  if (treasuryRangeSafeRuntimeCodeHash !== deployment.safeCodeHash.toLowerCase()
      || treasury.version !== "1.4.1" || threshold !== 1n || ownerCount !== 1
      || treasury.ownerSetHashEncoding !== "keccak256(abi.encode(address[] numericallySortedOwners))") {
    throw new Error("Treasury Range Safe runtime, version, threshold, owner count, or owner-hash encoding is invalid");
  }
  if (address(treasury.singleton, "treasuryRangeSafe.singleton") !== ethers.getAddress(BASE_SAFE_141_SINGLETON)
      || hash(treasury.singletonRuntimeCodeHash, "treasuryRangeSafe.singletonRuntimeCodeHash") !== BASE_SAFE_141_SINGLETON_CODEHASH
      || address(treasury.fallbackHandler, "treasuryRangeSafe.fallbackHandler") !== ethers.getAddress(NARA_SAFE_FALLBACK_HANDLER)
      || hash(treasury.fallbackHandlerRuntimeCodeHash, "treasuryRangeSafe.fallbackHandlerRuntimeCodeHash") !== NARA_SAFE_FALLBACK_HANDLER_CODEHASH
      || address(treasury.guard, "treasuryRangeSafe.guard") !== ethers.ZeroAddress
      || !Array.isArray(treasury.modules) || treasury.modules.length !== 0) {
    throw new Error("Treasury Range Safe singleton, fallback handler, guard, or modules policy is invalid");
  }
  if (risk.present !== true
      || risk.explicitAcceptanceRequiredBeforeDeploymentOrOrderCreation !== true
      || risk.capitalMustNotExceedApprovedCanary !== true) {
    throw new Error("Treasury Range single-signer risk gates are incomplete");
  }

  return {
    custodyPolicyChangeId: TREASURY_RANGE_CUSTODY_POLICY_CHANGE_ID,
    custodyPolicyPath: policyPath,
    custodyPolicySha256: policySha256,
    deploymentExecutorSafe,
    deploymentExecutorSafeRuntimeCodeHash,
    treasuryRangeSafe,
    treasuryRangeSafeRuntimeCodeHash,
    treasuryRangeSafeVersion: "1.4.1",
    treasuryRangeSafeThreshold: threshold,
    treasuryRangeSafeOwnerCount: ownerCount as number,
    treasuryRangeSafeOwnerSetHash: ownerSetHash,
  };
}

export function assertTreasuryRangeSingleSignerRiskAccepted(
  environment: NodeJS.ProcessEnv = process.env,
  authorities: TreasuryRangeAuthorities = canonicalTreasuryRangeAuthorities(),
): void {
  if (authorities.treasuryRangeSafeThreshold !== 1n) return;
  const acknowledgement = environment[TREASURY_RANGE_SINGLE_SIGNER_RISK_ACCEPTANCE_ENV]?.trim();
  let acknowledgedSafe: string | undefined;
  try {
    acknowledgedSafe = acknowledgement ? ethers.getAddress(acknowledgement) : undefined;
  } catch {
    acknowledgedSafe = undefined;
  }
  if (acknowledgedSafe !== authorities.treasuryRangeSafe) {
    throw new Error(
      `${TREASURY_RANGE_SINGLE_SIGNER_RISK_ACCEPTANCE_ENV} must equal the dedicated Treasury Safe `
      + "before building a deployment or order-creation packet for a 1-of-1 custody configuration",
    );
  }
}
