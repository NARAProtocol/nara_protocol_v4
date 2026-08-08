/**
 * Read-only reconciliation of a completed v4 deployment receipt journal
 * against canonical Base mainnet RPC receipts.
 *
 * This script never sends a transaction and never modifies the source journal.
 * It exists to supplement journal receipts whose blockHash was recorded as the
 * all-zero placeholder by the deployment runtime.
 *
 * Usage:
 *   npx tsx scripts/reconcileV4DeploymentReceipts.ts \
 *     --journal deployments/v4-base-usdc-receipt-journal-<timestamp>.jsonl \
 *     --manifest deployments/v4-base-usdc-<timestamp>.json \
 *     --output deployments/v4-base-usdc-receipt-reconciliation-<date>.json
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const deploymentsDir = resolve(repoRoot, "deployments");
const ZERO_HASH = ethers.ZeroHash.toLowerCase();
const BASE_CHAIN_ID = 8453n;

dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

type JournalReceipt = {
  transactionHash: string;
  blockNumber: number;
  blockHash: string | null;
  status: number | null;
  gasUsed: string;
  contractAddress: string | null;
};

type JournalStep = {
  index: number;
  label: string;
  kind: string;
  state: string;
  transactionHash: string;
  expectedContractAddress?: string;
  receipt: JournalReceipt;
};

type JournalSnapshot = {
  status: string;
  network: string;
  chainId: string;
  startedAt: string;
  updatedAt: string;
  release: {
    releaseCommit: string;
    originMainCommit: string;
    originRemote: string;
  };
  steps: JournalStep[];
  manifest?: string;
};

type JournalEvent = {
  event: string;
  at: string;
  snapshot: JournalSnapshot;
};

function sha256(contents: Buffer): string {
  return `0x${createHash("sha256").update(contents).digest("hex")}`;
}

function evidencePath(path: string): string {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function requiredArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a path`);
  }
  return value;
}

function resolveJournalPath(): string {
  const configured = requiredArgument("--journal");
  if (configured) return resolve(repoRoot, configured);

  const candidates = readdirSync(deploymentsDir)
    .filter((name) => /^v4-base-usdc-receipt-journal-.*\.jsonl$/u.test(name))
    .map((name) => resolve(deploymentsDir, name));
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one deployment receipt journal, found ${candidates.length}. Pass --journal explicitly.`,
    );
  }
  return candidates[0];
}

function parseJournal(contents: Buffer): { finalEvent: JournalEvent; lineCount: number } {
  const lines = contents.toString("utf8").split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error("Receipt journal is empty");

  const events = lines.map((line, index) => {
    try {
      return JSON.parse(line) as JournalEvent;
    } catch (error) {
      throw new Error(`Invalid JSON on journal line ${index + 1}: ${String(error)}`);
    }
  });
  const finalEvent = events.at(-1);
  if (!finalEvent?.snapshot) throw new Error("Final journal event has no deployment snapshot");
  return { finalEvent, lineCount: lines.length };
}

function requiredBaseRpcUrl(): string {
  const value = process.env.BASE_MAINNET_RPC_URL?.trim() || process.env.BASE_RPC_URL?.trim();
  if (!value) throw new Error("BASE_MAINNET_RPC_URL or BASE_RPC_URL is required");
  return value;
}

function sameOptionalAddress(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return left.toLowerCase() === right.toLowerCase();
}

function sameHash(left: string | null, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

async function main(): Promise<void> {
  const journalPath = resolveJournalPath();
  const manifestPath = resolve(
    repoRoot,
    requiredArgument("--manifest") ?? "deployments/v4-base-usdc-latest.json",
  );
  const outputPath = resolve(
    repoRoot,
    requiredArgument("--output") ?? "deployments/v4-base-usdc-receipt-reconciliation.json",
  );

  for (const [label, path] of [["journal", journalPath], ["manifest", manifestPath]] as const) {
    if (!existsSync(path)) throw new Error(`${label} file does not exist: ${evidencePath(path)}`);
  }
  if (outputPath === journalPath || outputPath === manifestPath) {
    throw new Error("Output path must not overwrite the source journal or deployment manifest");
  }

  const journalContentsBefore = readFileSync(journalPath);
  const manifestContents = readFileSync(manifestPath);
  const journalSha256Before = sha256(journalContentsBefore);
  const manifestSha256 = sha256(manifestContents);
  const { finalEvent, lineCount } = parseJournal(journalContentsBefore);
  const snapshot = finalEvent.snapshot;

  if (snapshot.status !== "completed") {
    throw new Error(`Final deployment journal status is ${snapshot.status}, expected completed`);
  }
  if (snapshot.steps.length !== 31) {
    throw new Error(`Expected 31 deployment steps, found ${snapshot.steps.length}`);
  }
  for (const [position, step] of snapshot.steps.entries()) {
    if (step.index !== position) {
      throw new Error(`Journal step index mismatch at position ${position}: recorded ${step.index}`);
    }
    if (step.state !== "confirmed" || !step.transactionHash || !step.receipt) {
      throw new Error(`Journal step ${position} (${step.label}) is not a confirmed receipt`);
    }
  }

  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl(), Number(BASE_CHAIN_ID), {
    staticNetwork: true,
    batchMaxCount: 1,
  });
  const network = await provider.getNetwork();
  if (network.chainId !== BASE_CHAIN_ID) {
    throw new Error(`Expected Base mainnet chainId ${BASE_CHAIN_ID}, got ${network.chainId}`);
  }
  if (BigInt(snapshot.chainId) !== BASE_CHAIN_ID || snapshot.network !== "base") {
    throw new Error(
      `Journal network mismatch: network=${snapshot.network} chainId=${snapshot.chainId}`,
    );
  }

  const queriedAt = new Date().toISOString();
  const queriedAtBlock = await provider.getBlockNumber();
  const receipts = [];

  for (const step of snapshot.steps) {
    const canonical = await provider.getTransactionReceipt(step.transactionHash);
    if (!canonical) {
      throw new Error(`Canonical receipt not found for step ${step.index}: ${step.transactionHash}`);
    }

    const journalBlockHashWasZero = step.receipt.blockHash?.toLowerCase() === ZERO_HASH;
    const journalContractAddressMatchesExpected = step.expectedContractAddress
      ? sameOptionalAddress(step.receipt.contractAddress, step.expectedContractAddress)
      : sameOptionalAddress(step.receipt.contractAddress, canonical.contractAddress);
    const canonicalContractAddressMatchesTransactionKind = step.kind === "deployment"
      ? sameOptionalAddress(step.receipt.contractAddress, canonical.contractAddress)
      : canonical.contractAddress === null;
    const comparison = {
      stepTransactionHashMatchesReceipt:
        step.transactionHash.toLowerCase() === step.receipt.transactionHash.toLowerCase(),
      canonicalTransactionHashMatches:
        step.transactionHash.toLowerCase() === canonical.hash.toLowerCase(),
      blockNumberMatches: step.receipt.blockNumber === canonical.blockNumber,
      journalBlockHashWasZero,
      journalBlockHashMatchesCanonical: sameHash(step.receipt.blockHash, canonical.blockHash),
      statusMatches: step.receipt.status === canonical.status,
      gasUsedMatches: step.receipt.gasUsed === canonical.gasUsed.toString(),
      journalContractAddressMatchesExpected,
      canonicalContractAddressMatchesTransactionKind,
      contractAddressEvidenceMatches:
        journalContractAddressMatchesExpected && canonicalContractAddressMatchesTransactionKind,
    };
    const recordedFieldsMatch =
      comparison.stepTransactionHashMatchesReceipt &&
      comparison.canonicalTransactionHashMatches &&
      comparison.blockNumberMatches &&
      comparison.statusMatches &&
      comparison.gasUsedMatches &&
      comparison.contractAddressEvidenceMatches;
    const reconciled =
      recordedFieldsMatch &&
      (comparison.journalBlockHashWasZero || comparison.journalBlockHashMatchesCanonical) &&
      canonical.status === 1;

    receipts.push({
      index: step.index,
      label: step.label,
      kind: step.kind,
      transactionHash: step.transactionHash,
      journal: {
        transactionHash: step.receipt.transactionHash,
        blockNumber: step.receipt.blockNumber,
        blockHash: step.receipt.blockHash,
        status: step.receipt.status,
        gasUsed: step.receipt.gasUsed,
        contractAddress: step.receipt.contractAddress,
        expectedContractAddress: step.expectedContractAddress ?? null,
      },
      canonical: {
        transactionHash: canonical.hash,
        blockNumber: canonical.blockNumber,
        blockHash: canonical.blockHash,
        transactionIndex: canonical.index,
        status: canonical.status,
        gasUsed: canonical.gasUsed.toString(),
        contractAddress: canonical.contractAddress,
        confirmationsAtQuery: queriedAtBlock - canonical.blockNumber + 1,
      },
      comparison: {
        ...comparison,
        recordedFieldsMatch,
        canonicalBlockHashSupplementsZeroPlaceholder: journalBlockHashWasZero,
        reconciled,
      },
    });
  }

  const journalContentsAfterRpcQueries = readFileSync(journalPath);
  const journalSha256AfterRpcQueries = sha256(journalContentsAfterRpcQueries);
  if (journalSha256Before !== journalSha256AfterRpcQueries) {
    throw new Error("Source journal changed during reconciliation; refusing to emit evidence");
  }

  const journalZeroBlockHashes = receipts.filter(
    (receipt) => receipt.comparison.journalBlockHashWasZero,
  ).length;
  const nonZeroBlockHashMismatches = receipts.filter(
    (receipt) =>
      !receipt.comparison.journalBlockHashWasZero &&
      !receipt.comparison.journalBlockHashMatchesCanonical,
  ).length;
  const otherFieldMismatches = receipts.filter(
    (receipt) => !receipt.comparison.recordedFieldsMatch,
  ).length;
  const failedCanonicalReceipts = receipts.filter(
    (receipt) => receipt.canonical.status !== 1,
  ).length;
  const reconciledReceipts = receipts.filter((receipt) => receipt.comparison.reconciled).length;

  const evidence = {
    schemaVersion: 1,
    evidenceType: "nara-v4-base-core-deployment-receipt-reconciliation",
    statement:
      "Read-only supplemental evidence. The source deployment journal was not modified. Canonical Base receipts supply real block hashes where the journal stored an all-zero placeholder.",
    generatedAt: queriedAt,
    chain: {
      network: "base",
      chainId: BASE_CHAIN_ID.toString(),
      queriedAtBlock,
    },
    release: {
      originRemote: snapshot.release.originRemote,
      releaseCommit: snapshot.release.releaseCommit,
      originMainCommit: snapshot.release.originMainCommit,
    },
    deployment: {
      startedAt: snapshot.startedAt,
      completedAt: snapshot.updatedAt,
      journalFinalEvent: finalEvent.event,
      journalFinalEventAt: finalEvent.at,
    },
    inputs: {
      journal: {
        path: evidencePath(journalPath),
        lineCount,
        sha256Before: journalSha256Before,
        sha256AfterRpcQueries: journalSha256AfterRpcQueries,
        preservationVerified: journalSha256Before === journalSha256AfterRpcQueries,
      },
      manifest: {
        path: evidencePath(manifestPath),
        sha256: manifestSha256,
      },
    },
    summary: {
      expectedReceipts: 31,
      canonicalReceiptsFound: receipts.length,
      successfulCanonicalReceipts: receipts.length - failedCanonicalReceipts,
      journalZeroBlockHashes,
      supplementedZeroBlockHashes: journalZeroBlockHashes,
      journalNonZeroBlockHashes: receipts.length - journalZeroBlockHashes,
      matchingNonZeroBlockHashes:
        receipts.length - journalZeroBlockHashes - nonZeroBlockHashMismatches,
      nonZeroBlockHashMismatches,
      otherFieldMismatches,
      reconciledReceipts,
      unreconciledReceipts: receipts.length - reconciledReceipts,
      result:
        reconciledReceipts === 31 &&
        nonZeroBlockHashMismatches === 0 &&
        otherFieldMismatches === 0 &&
        failedCanonicalReceipts === 0
          ? "PASS"
          : "FAIL",
    },
    receipts,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "w" });

  console.log("NARA v4 deployment receipt reconciliation");
  console.log(`Chain: Base (${BASE_CHAIN_ID}) at block ${queriedAtBlock}`);
  console.log(`Release: ${snapshot.release.releaseCommit}`);
  console.log(`Receipts: ${reconciledReceipts}/${receipts.length} reconciled`);
  console.log(`Zero journal block hashes supplemented: ${journalZeroBlockHashes}`);
  console.log(`Non-zero block hash mismatches: ${nonZeroBlockHashMismatches}`);
  console.log(`Other field mismatches: ${otherFieldMismatches}`);
  console.log(`Source journal preserved: ${journalSha256Before === journalSha256AfterRpcQueries}`);
  console.log(`Result: ${evidence.summary.result}`);
  console.log(`Evidence: ${evidencePath(outputPath)}`);

  if (evidence.summary.result !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
