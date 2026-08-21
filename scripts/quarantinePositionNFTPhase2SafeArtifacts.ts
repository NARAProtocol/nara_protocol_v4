/**
 * Quarantine the exact Safe artifacts after verified Position NFT Phase-2 execution.
 * Files are renamed, never deleted, so their bytes and hashes remain recoverable evidence.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync } from "node:fs";

type JsonObject = Record<string, any>;

const FINAL_MANIFEST = "deployments/v4-position-nft-phase2-finalized-2026-08-21.json";

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2)}\n`;
}

function quarantinedPath(path: string): string {
  return path.replace(
    "deployments/UNEXECUTED-v4-position-nft-phase2-",
    "deployments/EXECUTED-DO-NOT-IMPORT-v4-position-nft-phase2-",
  );
}

function quarantineOne(source: string, expectedSha256: string, label: string): string {
  const target = quarantinedPath(source);
  const sourceExists = existsSync(source);
  const targetExists = existsSync(target);
  if (sourceExists === targetExists) {
    throw new Error(`${label} must exist at exactly one of its UNEXECUTED or quarantined paths`);
  }
  const current = sourceExists ? source : target;
  if (sha256(current) !== expectedSha256.toLowerCase()) {
    throw new Error(`${label} bytes do not match finalized evidence`);
  }
  if (sourceExists) renameSync(source, target);
  if (existsSync(source) || !existsSync(target) || sha256(target) !== expectedSha256.toLowerCase()) {
    throw new Error(`${label} did not preserve exact bytes under its quarantined name`);
  }
  return target;
}

function main(): void {
  if (!existsSync(FINAL_MANIFEST)) throw new Error(`Final manifest is missing: ${FINAL_MANIFEST}`);
  const manifest = object(JSON.parse(readFileSync(FINAL_MANIFEST, "utf8")), "final manifest");
  if (
    manifest.schemaVersion !== 1 ||
    manifest.evidenceState !== "configured_source_verified" ||
    manifest.integrationReady !== false ||
    manifest.safeFinalization?.status !== "executed_verified"
  ) {
    throw new Error("Safe artifacts may be quarantined only after finalized verified execution evidence exists");
  }
  const finalization = object(manifest.finalization, "finalization");
  const signingPacket = object(finalization.signingPacket, "finalization.signingPacket");
  const safeExecution = object(finalization.safeExecution, "finalization.safeExecution");
  if (
    safeExecution.transactionReceipt?.status !== 1 ||
    signingPacket.execution?.status !== "UNEXECUTED"
  ) {
    throw new Error("Final manifest does not prove one successful execution of the exact unexecuted signing packet");
  }

  const packetPath = string(finalization.signingPacketPath, "finalization.signingPacketPath");
  const packetSha256 = string(finalization.signingPacketSha256, "finalization.signingPacketSha256").toLowerCase();
  const importEvidence = object(signingPacket.safeTxBuilderImport, "signingPacket.safeTxBuilderImport");
  const batchPath = string(importEvidence.artifactPath, "signingPacket.safeTxBuilderImport.artifactPath");
  const batchSha256 = string(importEvidence.artifactSha256, "signingPacket.safeTxBuilderImport.artifactSha256")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(packetSha256) || !/^[0-9a-f]{64}$/.test(batchSha256)) {
    throw new Error("Final manifest contains an invalid Safe artifact SHA-256");
  }
  if (
    !/^deployments\/UNEXECUTED-v4-position-nft-phase2-signing-packet-\d+-nonce-\d+\.json$/.test(packetPath) ||
    !/^deployments\/UNEXECUTED-v4-position-nft-phase2-safe-batch-\d+-nonce-\d+\.json$/.test(batchPath) ||
    signingPacket.packetPath !== packetPath ||
    importEvidence.artifactPath !== batchPath ||
    importEvidence.artifactSha256 !== batchSha256 ||
    signingPacket.batchSha256 !== batchSha256 ||
    createHash("sha256").update(prettyJson(signingPacket)).digest("hex") !== packetSha256
  ) {
    throw new Error("Final manifest Safe artifact paths/hashes are not the exact canonical packet and batch");
  }

  const quarantinedPacket = quarantineOne(packetPath, packetSha256, "Safe signing packet");
  const quarantinedBatch = quarantineOne(batchPath, batchSha256, "Safe Tx Builder batch");
  console.log(JSON.stringify({
    status: "EXECUTED_DO_NOT_IMPORT",
    finalManifest: FINAL_MANIFEST,
    signingPacket: quarantinedPacket,
    safeTxBuilderBatch: quarantinedBatch,
    recoverable: true,
  }, null, 2));
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Safe artifact quarantine failed";
  console.error(message.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 600));
  process.exitCode = 1;
}
