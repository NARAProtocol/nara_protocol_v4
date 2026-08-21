/** Submit and independently confirm BaseScan source verification for the exact seven-contract Phase-2 stack. */

import hre from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from "node:fs";
import {
  POSITION_NFT_PHASE2_CHAIN_ID,
  POSITION_NFT_PHASE2_CHANGE_ID,
  POSITION_NFT_PHASE2_CONTRACTS,
  POSITION_NFT_PHASE2_FQNS,
} from "./lib/v4PositionNftPhase2.js";
import {
  assertPositionNftSourceVerificationEvidence,
  expectedConstructorArgumentsHex,
  queryBaseScanSourceProof,
  type PositionNftSourceVerificationEntry,
} from "./lib/v4PositionNftSourceVerification.js";
import { assertProductionV4Runtime, currentV4Config, productionV4RuntimeBanner } from "./lib/v4LiveConfig.js";

type JsonObject = Record<string, any>;

const PENDING_MANIFEST = "deployments/v4-position-nft-phase2-2026-08-21.json";
const OUTPUT_PATH = "deployments/v4-position-nft-phase2-source-verification-2026-08-21.json";

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedFileSha256(path: string): string {
  return sha256(readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2)}\n`;
}

function durableWrite(path: string, contents: string): void {
  const descriptor = openSync(path, "wx");
  try {
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function sanitizedError(error: unknown, secret: string): string {
  const message = error instanceof Error ? error.message : "unknown verification failure";
  const withoutSecret = secret === "" ? message : message.split(secret).join("[redacted-api-key]");
  return withoutSecret
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .slice(0, 500);
}

async function waitForBaseScanProof(apiKey: string, address: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      return await queryBaseScanSourceProof(apiKey, address);
    } catch (error) {
      lastError = error;
      if (attempt < 23) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error(
    `BaseScan did not expose verified source evidence after submission: ` +
      (lastError instanceof Error ? lastError.message : "unknown lookup failure"),
  );
}

async function main(): Promise<void> {
  if (hre.globalOptions.network !== "base") throw new Error("Source verification must run with --network base");
  if (!existsSync(PENDING_MANIFEST)) throw new Error(`Pending manifest not found: ${PENDING_MANIFEST}`);
  if (existsSync(OUTPUT_PATH)) {
    throw new Error(`Refusing to overwrite source-verification evidence: ${OUTPUT_PATH}`);
  }
  const manifest = object(JSON.parse(readFileSync(PENDING_MANIFEST, "utf8")), "pending manifest");
  if (
    manifest.schemaVersion !== 1 ||
    manifest.changeId !== POSITION_NFT_PHASE2_CHANGE_ID ||
    manifest.mode !== "execute" ||
    manifest.network !== "base" ||
    String(manifest.chainId) !== POSITION_NFT_PHASE2_CHAIN_ID.toString() ||
    manifest.evidenceState !== "deployed_pending_safe_finalization"
  ) {
    throw new Error("Source verification accepts only the canonical pending Base deployment manifest");
  }
  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== POSITION_NFT_PHASE2_CHAIN_ID) throw new Error("Connected chain is not Base 8453");
  const production = await assertProductionV4Runtime(ethers.provider, currentV4Config());
  console.log(`Production runtime guard: ${productionV4RuntimeBanner(production)}`);

  const release = object(manifest.release, "release");
  const sourceCommit = String(release.sourceCommit ?? "").toLowerCase();
  const evidenceCommit = String(release.evidenceCommit ?? "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit) || !/^[0-9a-f]{40}$/.test(evidenceCommit)) {
    throw new Error("Pending manifest lacks the audited source/evidence commit pair");
  }
  const contracts = object(manifest.contracts, "contracts");
  const sourceArtifacts = object(manifest.sourceArtifacts, "sourceArtifacts");
  if (
    Object.keys(contracts).sort().join(",") !== [...POSITION_NFT_PHASE2_CONTRACTS].sort().join(",") ||
    Object.keys(sourceArtifacts).sort().join(",") !== [...POSITION_NFT_PHASE2_CONTRACTS].sort().join(",")
  ) {
    throw new Error("Pending manifest contract/artifact set is not the exact seven-contract Phase-2 suite");
  }
  const apiKey = process.env.BASESCAN_API_KEY?.trim() ?? "";
  if (apiKey === "") throw new Error("BASESCAN_API_KEY is required; it is never written to evidence");

  const entries = {} as Record<string, PositionNftSourceVerificationEntry>;
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    const contract = object(contracts[name], `contracts.${name}`);
    const sourceArtifact = object(sourceArtifacts[name], `sourceArtifacts.${name}`);
    const address = ethers.getAddress(String(contract.address));
    const constructorArguments = contract.constructorArguments;
    if (!Array.isArray(constructorArguments)) throw new Error(`${name} constructorArguments must be an array`);
    const code = await ethers.provider.getCode(address);
    if (code === "0x" || ethers.keccak256(code) !== manifest.runtimeCode[name].codeHash) {
      throw new Error(`${name} live runtime differs from the pending manifest`);
    }
    try {
      await verifyContract({
        address,
        constructorArgs: constructorArguments,
        contract: POSITION_NFT_PHASE2_FQNS[name],
        provider: "etherscan",
      }, hre);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown verification failure";
      if (!/already verified/i.test(message)) {
        throw new Error(`${name} source verification failed: ${sanitizedError(error, apiKey)}`);
      }
    }
    const [proof, artifact] = await Promise.all([
      waitForBaseScanProof(apiKey, address),
      hre.artifacts.readArtifact(POSITION_NFT_PHASE2_FQNS[name]),
    ]);
    const expectedArgumentsHex = await expectedConstructorArgumentsHex(artifact, constructorArguments);
    if (
      proof.contractName !== name ||
      proof.compilerVersion !== `v${sourceArtifact.solcLongVersion}` ||
      proof.optimizationUsed !== "1" ||
      proof.runs !== "1" ||
      proof.evmVersion.toLowerCase() !== "cancun" ||
      proof.abiSha256 !== sourceArtifact.abiSha256 ||
      proof.compilerSourcesSha256 !== sourceArtifact.compilerSourcesSha256 ||
      proof.constructorArgumentsHexSha256 !== sha256(expectedArgumentsHex)
    ) {
      throw new Error(`${name} BaseScan proof differs from the exact reviewed artifact/compiler/constructor`);
    }
    entries[name] = {
      status: "verified",
      address,
      fullyQualifiedName: POSITION_NFT_PHASE2_FQNS[name],
      constructorArguments,
      constructorArgumentsSha256: sha256(canonicalJson(constructorArguments)),
      expectedConstructorArgumentsHexSha256: sha256(expectedArgumentsHex),
      artifactSha256: sourceArtifact.artifactSha256,
      sourceSha256: sourceArtifact.sourceSha256,
      compilerInputSha256: sourceArtifact.compilerInputSha256,
      verifiedAt: new Date().toISOString(),
      ...proof,
    };
    console.log(`Verified ${name}: ${address}`);
  }

  const evidence = {
    schemaVersion: 1,
    chainId: POSITION_NFT_PHASE2_CHAIN_ID.toString(),
    status: "verified",
    sourceCommit,
    evidenceCommit,
    pendingManifest: { path: PENDING_MANIFEST, sha256: normalizedFileSha256(PENDING_MANIFEST) },
    contracts: entries,
  };
  await assertPositionNftSourceVerificationEvidence(evidence, {
    sourceCommit,
    evidenceCommit,
    pendingManifestPath: PENDING_MANIFEST,
    pendingManifestSha256: normalizedFileSha256(PENDING_MANIFEST),
    contracts,
    sourceArtifacts,
    artifacts: hre.artifacts,
  });
  durableWrite(OUTPUT_PATH, prettyJson(evidence));
  console.log(`Source verification evidence: ${OUTPUT_PATH}`);
  console.log(`SHA-256: ${normalizedFileSha256(OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error(sanitizedError(error, process.env.BASESCAN_API_KEY?.trim() ?? ""));
  process.exitCode = 1;
});
