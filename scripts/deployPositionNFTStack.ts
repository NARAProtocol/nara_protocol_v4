/**
 * Deploy only the seven-contract NARA v4 Position NFT Phase-2 stack.
 *
 * Modes:
 *   plan      Read-only Base preflight. This is the default.
 *   rehearse  Sends transactions only to the ephemeral Hardhat `baseFork` network.
 *   execute   Sends Base-mainnet deployment transactions after every release gate passes.
 *
 * Production execution requires:
 *   V4_POSITION_NFT_MODE=execute
 *   V4_POSITION_NFT_EXECUTION_CONFIRM=NARA-20260821-v4-position-nft-phase2
 *   V4_POSITION_NFT_RELEASE_COMMIT=<full reviewed commit already merged to origin/main>
 *   V4_POSITION_NFT_GATE_ATTESTATION=<final-commit CI/audit/art/policy approval JSON>
 *
 * This phase deliberately excludes Genesis distribution, bonds, the ops vault,
 * and the data lens. The NFT owner is the production Safe from construction.
 * The script never submits Safe transactions. It embeds the canonical five calls
 * in pending evidence; only the post-source-verification JIT builder emits a Safe import.
 */

import hre from "hardhat";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
} from "./lib/v4LiveConfig.js";
import { canonicalReceiptEvidence, type ReceiptEvidence } from "./lib/v4ReceiptEvidence.js";
import {
  assertRewardNotifierHistoryUnchanged,
  readRewardNotifierContainmentEvidence,
} from "./lib/v4RewardNotifierContainment.js";
import { buildAndSimulateSafeBatch } from "./lib/v4SafeBatch.js";
import { readCanonicalNaraSafeEvidence } from "./lib/v4SafeEvidence.js";
import {
  POSITION_NFT_PHASE2_CHANGE_ID,
  POSITION_NFT_PHASE2_CHAIN_ID,
  POSITION_NFT_PHASE2_CONTRACTS,
  POSITION_NFT_PHASE2_FINALIZATION_CALLS,
  POSITION_NFT_PHASE2_FQNS,
  POSITION_NFT_PHASE2_PENDING_BATCH_ARTIFACT,
  assertPositionNftPhase2GateAttestation,
  assertCanonicalPositionNftPhase2Policy,
  buildPositionNftPhase2FinalizationBatch,
  canonicalPositionNftPhase2Policy,
  canonicalPositionNftPhase2RehearsalBatchArtifact,
  collectPositionNftPhase2ArtifactEvidence,
  verifyPositionNftPhase2ReleaseControl,
  type PositionNftPhase2GateAttestation,
} from "./lib/v4PositionNftPhase2.js";

type HardhatEthers = any;
type DeploymentMode = "plan" | "rehearse" | "execute";

interface ReleaseSourceEvidence {
  releaseCommit: string;
  sourceCommit: string;
  evidenceCommit: string;
  headCommit: string;
  originMainCommit: string;
  originRemote: "NARAProtocol/nara_protocol_v4";
  cleanWorkingTree: true;
  exactProtectedMain: true;
  gateAttestationSha256: string;
  gateAttestation: PositionNftPhase2GateAttestation;
}

interface JournalStep {
  index: number;
  label: string;
  state: "prepared" | "submitted" | "confirmed" | "failed";
  expectedContractAddress: string;
  preparedAt: string;
  transactionHash?: string;
  submittedAt?: string;
  receipt?: ReceiptEvidence;
  confirmedAt?: string;
  failedAt?: string;
}

interface JournalPayload {
  schemaVersion: 1;
  status: "in_progress" | "transactions_complete" | "completed" | "failed_no_resume";
  retryPolicy: string;
  changeId: string;
  mode: Exclude<DeploymentMode, "plan">;
  network: string;
  chainId: string;
  startedAt: string;
  updatedAt: string;
  release: ReleaseSourceEvidence | null;
  coreOriginCommit: string;
  deployer: string;
  ownerSafe: string;
  steps: JournalStep[];
  manifest?: string;
  failure?: { at: string; step: string | null; reason: string };
}

interface RuntimeCodeEvidence {
  address: string;
  codeHash: string;
  codeSizeBytes: number;
  verifiedAtBlock: number;
}

const DEPLOYMENT_DIR = "deployments";
const PRODUCTION_CORE_MANIFEST = "deployments/v4-production-activation-2026-08-09.json";
const PRODUCTION_MANIFEST = join(DEPLOYMENT_DIR, "v4-position-nft-phase2-2026-08-21.json");
const PRODUCTION_CHECKPOINT = join(DEPLOYMENT_DIR, "v4-position-nft-phase2-in-progress.json");
const RELEASE_EVIDENCE_PREFIX = "release-evidence/NARA-20260821-v4-position-nft-phase2/";
const GATE_ATTESTATION_PATH = "deployments/v4-position-nft-phase2-gate-attestation.json";
const MIN_BASE_DEPLOYER_BALANCE_WEI = 1_000_000_000_000_000n;
const FEE_SAFETY_MULTIPLIER = 2n;

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim();
}

function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (value === undefined) throw new Error(`Missing env: ${name}`);
  return value;
}

function jsonStringify(payload: unknown): string {
  return JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
}

function decodeJsonDataUri(label: string, value: string): Record<string, unknown> {
  const prefix = "data:application/json;base64,";
  if (!value.startsWith(prefix)) throw new Error(`${label} is not a base64 JSON data URI`);
  const decoded = Buffer.from(value.slice(prefix.length), "base64").toString("utf8");
  const parsed = JSON.parse(decoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} does not decode to a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function durableWrite(path: string, contents: string, append = false): void {
  const descriptor = openSync(path, append ? "a" : "w");
  try {
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function durableWriteNew(path: string, contents: string): void {
  if (existsSync(path)) throw new Error(`Refusing to overwrite release evidence: ${path}`);
  const descriptor = openSync(path, "wx");
  try {
    writeFileSync(descriptor, contents);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown deployment failure";
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/(?:0x)?[0-9a-fA-F]{64,}/g, "[redacted-hex]")
    .slice(0, 500);
}

function gitOutput(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(`Release source check failed: git ${args.join(" ")} did not succeed`);
  }
}

function normalizedTextSha256(path: string): string {
  const contents = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(contents).digest("hex");
}

function requireTrackedEvidenceFile(path: string, expectedSha256: string): void {
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized !== path ||
    !normalized.startsWith(RELEASE_EVIDENCE_PREFIX) ||
    normalized.split("/").includes("..") ||
    !/\.(?:json|md|txt)$/i.test(normalized)
  ) {
    throw new Error(`Release evidence path is outside the Phase-2 evidence directory: ${path}`);
  }
  gitOutput(["ls-files", "--error-unmatch", "--", path]);
  if (normalizedTextSha256(path) !== expectedSha256.toLowerCase()) {
    throw new Error(`Release evidence hash mismatch: ${path}`);
  }
}

async function requireReviewedBaseReleaseSource(
  expectedSafe: string,
  expectedTreasury: string,
  provider: any,
  expectedDeployer: string,
  expectedStartNonce: number,
  expectedAddresses: Record<string, string>,
): Promise<ReleaseSourceEvidence> {
  const requested = requiredEnv("V4_POSITION_NFT_RELEASE_COMMIT").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(requested)) {
    throw new Error("V4_POSITION_NFT_RELEASE_COMMIT must be a full 40-character commit hash");
  }

  const headCommit = gitOutput(["rev-parse", "HEAD"]).toLowerCase();
  if (headCommit !== requested) {
    throw new Error("V4_POSITION_NFT_RELEASE_COMMIT must exactly match checked-out HEAD");
  }

  const dirty = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty !== "") {
    throw new Error(`Refusing Base deployment from a dirty working tree (${dirty.split(/\r?\n/).length} changed paths)`);
  }

  const remote = gitOutput(["remote", "get-url", "origin"]);
  if (!/^(?:https:\/\/github\.com\/NARAProtocol\/nara_protocol_v4(?:\.git)?|git@github\.com:NARAProtocol\/nara_protocol_v4(?:\.git)?|ssh:\/\/git@github\.com\/NARAProtocol\/nara_protocol_v4(?:\.git)?)$/i.test(remote)) {
    throw new Error("origin is not the authoritative NARAProtocol/nara_protocol_v4 repository");
  }

  const originMainCommit = gitOutput(["rev-parse", "--verify", "origin/main"]).toLowerCase();
  const remoteMainCommit = gitOutput(["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0]?.toLowerCase();
  if (originMainCommit !== remoteMainCommit) {
    throw new Error("Local origin/main is not synchronized with the authoritative remote");
  }
  if (requested !== originMainCommit) {
    throw new Error("Position NFT execution requires the exact current protected origin/main commit");
  }

  const gateAttestationPath = requiredEnv("V4_POSITION_NFT_GATE_ATTESTATION").replace(/\\/g, "/");
  if (gateAttestationPath !== GATE_ATTESTATION_PATH) {
    throw new Error(`V4_POSITION_NFT_GATE_ATTESTATION must equal ${GATE_ATTESTATION_PATH}`);
  }
  if (gitOutput(["ls-files", "--", gateAttestationPath]) !== "") {
    throw new Error("Gate attestation must remain external/ignored to avoid a Git commit self-reference");
  }
  if (gitOutput(["check-ignore", "--", gateAttestationPath]) !== gateAttestationPath) {
    throw new Error("Gate attestation path must remain ignored and external to the evidence commit");
  }
  const gateAttestationRaw = readFileSync(gateAttestationPath, "utf8");
  const gateAttestation = assertPositionNftPhase2GateAttestation(
    JSON.parse(gateAttestationRaw),
    requested,
    expectedSafe,
    expectedTreasury,
  );
  await verifyPositionNftPhase2ReleaseControl(gateAttestation);
  const sourceCommit = gateAttestation.sourceCommit.toLowerCase();
  gitOutput(["merge-base", "--is-ancestor", sourceCommit, requested]);
  const evidenceDiff = gitOutput(["diff", "--name-only", `${sourceCommit}..${requested}`]);
  const evidencePaths = evidenceDiff === "" ? [] : evidenceDiff.split(/\r?\n/);
  if (evidencePaths.length === 0 || evidencePaths.some((path) => !path.startsWith(RELEASE_EVIDENCE_PREFIX))) {
    throw new Error(
      "Evidence commit must differ from the audited source commit only under the Phase-2 release-evidence directory",
    );
  }
  const gateAttestationSha256 = createHash("sha256")
    .update(JSON.stringify(gateAttestation))
    .digest("hex");

  const evidenceFiles = [
    [gateAttestation.staticAnalysis.slitherReportPath, gateAttestation.staticAnalysis.slitherReportSha256],
    [gateAttestation.staticAnalysis.aderynReportPath, gateAttestation.staticAnalysis.aderynReportSha256],
    [gateAttestation.staticAnalysis.echidnaReportPath, gateAttestation.staticAnalysis.echidnaReportSha256],
    [gateAttestation.artifactBuild.evidencePath, gateAttestation.artifactBuild.evidenceSha256],
    [gateAttestation.independentAudit.reportPath, gateAttestation.independentAudit.reportSha256],
    [gateAttestation.artQa.evidencePath, gateAttestation.artQa.evidenceSha256],
    [gateAttestation.roadmapGate.evidencePath, gateAttestation.roadmapGate.evidenceSha256],
    [gateAttestation.deploymentPlan.evidencePath, gateAttestation.deploymentPlan.evidenceSha256],
  ] as const;
  for (const [path, hash] of evidenceFiles) requireTrackedEvidenceFile(path, hash);

  const roadmapBlock = await provider.getBlock(gateAttestation.roadmapGate.observedAtBlock);
  if (
    !roadmapBlock?.hash ||
    roadmapBlock.hash.toLowerCase() !== gateAttestation.roadmapGate.observedAtBlockHash.toLowerCase()
  ) {
    throw new Error("Roadmap-gate observation block/hash does not match Base");
  }

  const deploymentPlan = gateAttestation.deploymentPlan;
  const reviewedDeploymentPlan = JSON.parse(readFileSync(deploymentPlan.evidencePath, "utf8")) as Record<string, any>;
  if (
    reviewedDeploymentPlan.schemaVersion !== 1 ||
    reviewedDeploymentPlan.changeId !== POSITION_NFT_PHASE2_CHANGE_ID ||
    String(reviewedDeploymentPlan.sourceCommit).toLowerCase() !== sourceCommit ||
    ethersAddress(String(reviewedDeploymentPlan.deployer)) !== ethersAddress(deploymentPlan.deployer) ||
    reviewedDeploymentPlan.expectedStartNonce !== deploymentPlan.expectedStartNonce ||
    JSON.stringify(reviewedDeploymentPlan.predictedAddresses) !== JSON.stringify(deploymentPlan.predictedAddresses) ||
    reviewedDeploymentPlan.observedAtBlock !== deploymentPlan.observedAtBlock ||
    String(reviewedDeploymentPlan.observedAtBlockHash).toLowerCase() !==
      deploymentPlan.observedAtBlockHash.toLowerCase() ||
    reviewedDeploymentPlan.validUntilBlock !== deploymentPlan.validUntilBlock
  ) {
    throw new Error("Deployment-plan attestation differs from the hashed canonical plan evidence");
  }
  if (
    ethersAddress(deploymentPlan.deployer) !== ethersAddress(expectedDeployer) ||
    deploymentPlan.expectedStartNonce !== expectedStartNonce
  ) {
    throw new Error("Deployment signer or starting nonce differs from the approved one-attempt plan");
  }
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    if (ethersAddress(deploymentPlan.predictedAddresses[name]) !== ethersAddress(expectedAddresses[name])) {
      throw new Error(`Predicted ${name} address differs from the approved one-attempt plan`);
    }
  }
  const [deploymentPlanBlock, currentBlock] = await Promise.all([
    provider.getBlock(deploymentPlan.observedAtBlock),
    provider.getBlock("latest"),
  ]);
  if (
    !deploymentPlanBlock?.hash ||
    !currentBlock?.hash ||
    deploymentPlanBlock.hash.toLowerCase() !== deploymentPlan.observedAtBlockHash.toLowerCase() ||
    Number(currentBlock.number) > deploymentPlan.validUntilBlock
  ) {
    throw new Error("Deployment plan observation is missing, hash-mismatched, or past its approved validity window");
  }
  const approvedAt = Date.parse(gateAttestation.humanApproval.approvedAt);
  if (
    approvedAt < Number(deploymentPlanBlock.timestamp) * 1_000 ||
    approvedAt > Number(currentBlock.timestamp) * 1_000
  ) {
    throw new Error("Human production approval is outside the pinned plan-observation/current-block window");
  }

  return {
    releaseCommit: requested,
    sourceCommit,
    evidenceCommit: requested,
    headCommit,
    originMainCommit,
    originRemote: "NARAProtocol/nara_protocol_v4",
    cleanWorkingTree: true,
    exactProtectedMain: true,
    gateAttestationSha256,
    gateAttestation,
  };
}

function deploymentMode(): DeploymentMode {
  const value = optionalEnv("V4_POSITION_NFT_MODE") ?? "plan";
  if (value !== "plan" && value !== "rehearse" && value !== "execute") {
    throw new Error("V4_POSITION_NFT_MODE must be plan, rehearse, or execute");
  }
  return value;
}

function refusePriorProductionAttempt(): void {
  for (const path of [PRODUCTION_MANIFEST, PRODUCTION_CHECKPOINT]) {
    if (!existsSync(path)) continue;
    let status = "unreadable";
    try {
      const payload = JSON.parse(readFileSync(path, "utf8")) as { status?: unknown; evidenceState?: unknown };
      status = String(payload.status ?? payload.evidenceState ?? "present");
    } catch {
      // An unreadable deployment record is itself a stop condition.
    }
    throw new Error(
      `Existing Position NFT deployment record ${path} has status ${status}. ` +
      "Reconcile it against Base before any retry; never create duplicate Phase-2 deployments blindly.",
    );
  }
  const staleSafeArtifacts = existsSync(DEPLOYMENT_DIR)
    ? readdirSync(DEPLOYMENT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() &&
        /^(?:UNEXECUTED|PENDING-PACKET-LINK-DO-NOT-IMPORT)-v4-position-nft-phase2-/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
    : [];
  if (staleSafeArtifacts.length !== 0) {
    throw new Error(
      `Refusing a new production attempt while stale or partial Safe artifacts exist: ${staleSafeArtifacts.join(", ")}`,
    );
  }
}

class DeploymentJournal {
  readonly journalPath: string;
  readonly checkpointPath: string;
  private readonly payload: JournalPayload;

  constructor(input: Omit<JournalPayload, "schemaVersion" | "status" | "retryPolicy" | "startedAt" | "updatedAt" | "steps">) {
    if (!existsSync(DEPLOYMENT_DIR)) mkdirSync(DEPLOYMENT_DIR, { recursive: true });
    const startedAt = new Date().toISOString();
    const stamp = startedAt.replace(/[:.]/g, "-");
    this.journalPath = join(DEPLOYMENT_DIR, `v4-position-nft-phase2-${input.mode}-journal-${stamp}.jsonl`);
    this.checkpointPath = input.mode === "execute"
      ? PRODUCTION_CHECKPOINT
      : join(DEPLOYMENT_DIR, `v4-position-nft-phase2-rehearsal-${stamp}.json`);
    this.payload = {
      schemaVersion: 1,
      status: "in_progress",
      retryPolicy: "NO_BLIND_RETRY: reconcile every recorded transaction and address before another attempt.",
      startedAt,
      updatedAt: startedAt,
      ...input,
      steps: [],
    };
    this.persist("journal_started");
  }

  private persist(event: string): void {
    this.payload.updatedAt = new Date().toISOString();
    durableWrite(this.journalPath, `${JSON.stringify({ event, at: this.payload.updatedAt, snapshot: this.payload })}\n`, true);
    durableWrite(this.checkpointPath, `${jsonStringify(this.payload)}\n`);
  }

  prepare(label: string, expectedContractAddress: string): JournalStep {
    const step: JournalStep = {
      index: this.payload.steps.length,
      label,
      state: "prepared",
      expectedContractAddress,
      preparedAt: new Date().toISOString(),
    };
    this.payload.steps.push(step);
    this.persist("transaction_prepared");
    return step;
  }

  submitted(step: JournalStep, transactionHash: string): void {
    step.state = "submitted";
    step.transactionHash = transactionHash;
    step.submittedAt = new Date().toISOString();
    this.persist("transaction_submitted");
  }

  confirmed(step: JournalStep, receipt: ReceiptEvidence): void {
    step.state = "confirmed";
    step.receipt = receipt;
    step.confirmedAt = new Date().toISOString();
    this.persist("transaction_confirmed");
  }

  failedStep(step: JournalStep): void {
    step.state = "failed";
    step.failedAt = new Date().toISOString();
    this.persist("transaction_failed");
  }

  transactionsComplete(): void {
    this.payload.status = "transactions_complete";
    this.persist("transactions_complete");
  }

  complete(manifest: string): void {
    this.payload.status = "completed";
    this.payload.manifest = manifest;
    this.persist("manifest_completed");
  }

  fail(error: unknown): void {
    if (this.payload.status === "completed") return;
    const current = [...this.payload.steps].reverse().find((step) => step.state !== "confirmed");
    this.payload.status = "failed_no_resume";
    this.payload.failure = {
      at: new Date().toISOString(),
      step: current?.label ?? null,
      reason: safeErrorMessage(error),
    };
    this.persist("deployment_failed_no_resume");
  }

  evidence(): Record<string, unknown> {
    return {
      status: this.payload.status,
      retryPolicy: this.payload.retryPolicy,
      journalPath: this.journalPath,
      checkpointPath: this.checkpointPath,
      transactions: this.payload.steps.map((step) => ({
        index: step.index,
        label: step.label,
        expectedContractAddress: step.expectedContractAddress,
        transactionHash: step.transactionHash ?? null,
        receipt: step.receipt ?? null,
      })),
    };
  }
}

async function estimateDeploymentGas(
  ethers: HardhatEthers,
  deployer: any,
  engine: string,
  token: string,
  safe: string,
  treasury: string,
): Promise<{ estimates: Record<string, bigint>; gasBudget: bigint; sampledFeePerGas: bigint; requiredBalance: bigint }> {
  const factories = {
    NARAArtMetadataV1: await ethers.getContractFactory("contracts/v4/NARAArtMetadataV1.sol:NARAArtMetadataV1", deployer),
    NARAArtSecurityPrintV1: await ethers.getContractFactory("contracts/v4/NARAArtSecurityPrintV1.sol:NARAArtSecurityPrintV1", deployer),
    NARAArtCorePlateV1: await ethers.getContractFactory("contracts/v4/NARAArtCorePlateV1.sol:NARAArtCorePlateV1", deployer),
    NARAArtGenesisPlateV1: await ethers.getContractFactory("contracts/v4/NARAArtGenesisPlateV1.sol:NARAArtGenesisPlateV1", deployer),
    NARAPositionRendererV5: await ethers.getContractFactory("contracts/v4/NARAPositionRendererV5.sol:NARAPositionRendererV5", deployer),
    NARAPositionAccountV4: await ethers.getContractFactory("contracts/v4/NARAPositionAccountV4.sol:NARAPositionAccountV4", deployer),
    NARAPositionNFTV4: await ethers.getContractFactory("contracts/v4/NARAPositionNFTV4.sol:NARAPositionNFTV4", deployer),
  };
  const placeholder = token;
  const transactions = {
    NARAArtMetadataV1: await factories.NARAArtMetadataV1.getDeployTransaction(),
    NARAArtSecurityPrintV1: await factories.NARAArtSecurityPrintV1.getDeployTransaction(),
    NARAArtCorePlateV1: await factories.NARAArtCorePlateV1.getDeployTransaction(placeholder),
    NARAArtGenesisPlateV1: await factories.NARAArtGenesisPlateV1.getDeployTransaction(),
    NARAPositionRendererV5: await factories.NARAPositionRendererV5.getDeployTransaction(
      placeholder,
      placeholder,
      placeholder,
      placeholder,
    ),
    NARAPositionAccountV4: await factories.NARAPositionAccountV4.getDeployTransaction(),
    NARAPositionNFTV4: await factories.NARAPositionNFTV4.getDeployTransaction(
      engine,
      token,
      placeholder,
      placeholder,
      safe,
      treasury,
      1_000,
    ),
  };

  const estimates: Record<string, bigint> = {};
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    estimates[name] = await ethers.provider.estimateGas({ ...transactions[name], from: deployer.address });
  }
  const raw = Object.values(estimates).reduce((sum, value) => sum + value, 0n);
  const gasBudget = (raw * 125n) / 100n + 500_000n;
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = BigInt(feeData.gasPrice ?? 0n);
  const maxFeePerGas = BigInt(feeData.maxFeePerGas ?? 0n);
  const sampledFeePerGas = gasPrice > maxFeePerGas ? gasPrice : maxFeePerGas;
  if (sampledFeePerGas <= 0n) throw new Error("Base RPC did not return a positive gas price");
  const feeBased = gasBudget * sampledFeePerGas * FEE_SAFETY_MULTIPLIER;
  const requiredBalance = feeBased > MIN_BASE_DEPLOYER_BALANCE_WEI ? feeBased : MIN_BASE_DEPLOYER_BALANCE_WEI;
  return { estimates, gasBudget, sampledFeePerGas, requiredBalance };
}

async function deployRecorded(
  journal: DeploymentJournal,
  label: string,
  expectedAddress: string,
  expectedNonce: number,
  confirmations: number,
  provider: any,
  deployerAddress: string,
  preSendGuard: () => Promise<void>,
  deploy: () => Promise<any>,
): Promise<{ contract: any; receipt: ReceiptEvidence }> {
  const step = journal.prepare(label, expectedAddress);
  let contract: any;
  let transaction: any;
  try {
    await preSendGuard();
    const [latestNonce, pendingNonce, existingCode] = await Promise.all([
      provider.getTransactionCount(deployerAddress, "latest"),
      provider.getTransactionCount(deployerAddress, "pending"),
      provider.getCode(expectedAddress),
    ]);
    if (latestNonce !== expectedNonce || pendingNonce !== expectedNonce) {
      throw new Error(
        `${label} expected dedicated deployment signer nonce ${expectedNonce}; ` +
        `latest=${latestNonce}, pending=${pendingNonce}`,
      );
    }
    if (existingCode !== "0x") {
      throw new Error(`${label} predicted address ${expectedAddress} already contains code`);
    }
    contract = await deploy();
    transaction = contract.deploymentTransaction();
    if (!transaction?.hash) throw new Error(`${label} did not expose a deployment transaction`);
    if (transaction.nonce !== expectedNonce) {
      throw new Error(`${label} was submitted with nonce ${transaction.nonce}, expected ${expectedNonce}`);
    }
    journal.submitted(step, transaction.hash);
  } catch (error) {
    journal.failedStep(step);
    throw error;
  }

  console.log(`${label}: ${transaction.hash}`);
  try {
    const waited = await transaction.wait(confirmations);
    if (waited?.status !== 1) throw new Error(`${label} reverted`);
    const address = ethersAddress(await contract.getAddress());
    if (address !== ethersAddress(expectedAddress)) {
      throw new Error(`${label} deployed at ${address}, expected ${expectedAddress}`);
    }
    const evidence = await canonicalReceiptEvidence(transaction.provider, transaction.hash, waited);
    evidence.contractAddress = address;
    journal.confirmed(step, evidence);
    return { contract, receipt: evidence };
  } catch (error) {
    journal.failedStep(step);
    throw error;
  }
}

function ethersAddress(value: string): string {
  return value.toLowerCase();
}

async function runtimeCodeEvidence(
  ethers: HardhatEthers,
  entries: Record<string, string>,
  blockNumber: number,
): Promise<Record<string, RuntimeCodeEvidence>> {
  const result: Record<string, RuntimeCodeEvidence> = {};
  for (const [label, address] of Object.entries(entries)) {
    const code = await ethers.provider.getCode(address, blockNumber);
    if (code === "0x") throw new Error(`${label} has no runtime code at verification block ${blockNumber}`);
    result[label] = {
      address,
      codeHash: ethers.keccak256(code),
      codeSizeBytes: (code.length - 2) / 2,
      verifiedAtBlock: blockNumber,
    };
  }
  return result;
}

let activeJournal: DeploymentJournal | null = null;

async function main(): Promise<void> {
  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const networkName = hre.globalOptions.network ?? "default";
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  const mode = deploymentMode();
  if (mode === "rehearse") {
    (globalThis as any).__NARA_POSITION_NFT_REHEARSAL_CONNECTION__ = connection;
  }
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment signer is configured");

  if (mode === "rehearse") {
    await ethers.provider.send("hardhat_setBalance", [
      deployer.address,
      "0x8ac7230489e80000",
    ]);
  }

  if (chainId !== POSITION_NFT_PHASE2_CHAIN_ID) {
    throw new Error(`Position NFT Phase-2 targets Base chain 8453 only; connected chainId=${chainId}`);
  }
  if (mode === "execute" && networkName !== "base") {
    throw new Error("Execution mode is allowed only with --network base");
  }
  if (mode === "rehearse" && networkName !== "baseFork") {
    throw new Error("Rehearsal mode is allowed only with --network baseFork");
  }
  if (mode === "plan" && networkName !== "base" && networkName !== "baseFork") {
    throw new Error("Plan mode must use --network base or --network baseFork");
  }

  const production = await assertProductionV4Runtime(ethers.provider, currentV4Config());
  console.log(`Production runtime guard: ${productionV4RuntimeBanner(production)}`);
  if (ethers.getAddress(production.admin) !== ethers.getAddress(production.safe)) {
    throw new Error("Canonical production admin is not the canonical production Safe");
  }

  const tokenAddress = ethers.getAddress(production.token);
  const engineAddress = ethers.getAddress(production.engine);
  const ownerSafe = ethers.getAddress(production.safe);
  const royaltyTreasury = ethers.getAddress(production.treasury);
  const policy = canonicalPositionNftPhase2Policy(ownerSafe, royaltyTreasury);
  assertCanonicalPositionNftPhase2Policy(policy, ownerSafe, royaltyTreasury);

  const engine = new ethers.Contract(engineAddress, ["function NARA() view returns (address)"], ethers.provider);
  if (ethers.getAddress(await engine.NARA()) !== tokenAddress) {
    throw new Error("Production Engine NARA binding does not match the pinned production token");
  }

  const safeSnapshotBlock = await ethers.provider.getBlock("latest");
  if (!safeSnapshotBlock?.hash) throw new Error("Could not pin the production Safe preflight block");
  const [safePreflight, coreContainment] = await Promise.all([
    readCanonicalNaraSafeEvidence(
      ethers.provider,
      ownerSafe,
      production.safeCodeHash,
      Number(safeSnapshotBlock.number),
    ),
    readRewardNotifierContainmentEvidence(
      ethers.provider,
      production,
      Number(safeSnapshotBlock.number),
    ),
  ]);
  if (ethers.getAddress(deployer.address) === ownerSafe) {
    throw new Error("Deployment signer must remain separate from the production Safe");
  }

  for (const alias of ["V4_POSITION_NFT", "POSITION_NFT_V4"]) {
    const configuredNft = optionalEnv(alias);
    if (configuredNft === undefined) continue;
    const configuredAddress = ethers.getAddress(configuredNft);
    const configuredCode = await ethers.provider.getCode(configuredAddress);
    throw new Error(
      configuredCode === "0x"
        ? `${alias} points at zero-code address ${configuredAddress}; remove the stale value before deployment`
        : `${alias} already points at code-bearing address ${configuredAddress}; reconcile it before deployment`,
    );
  }

  const latestNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
  const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  if (latestNonce !== pendingNonce) {
    throw new Error("Deployment signer has pending transactions; wait and recompute the Phase-2 address plan");
  }
  const predicted: Record<string, string> = {};
  POSITION_NFT_PHASE2_CONTRACTS.forEach((name, index) => {
    predicted[name] = ethers.getCreateAddress({ from: deployer.address, nonce: latestNonce + index });
  });

  const artifactEvidence = await collectPositionNftPhase2ArtifactEvidence(hre.artifacts);
  const deploymentFactories = {} as Record<(typeof POSITION_NFT_PHASE2_CONTRACTS)[number], any>;
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    const factory = await ethers.getContractFactory(POSITION_NFT_PHASE2_FQNS[name], deployer);
    if (ethers.keccak256(factory.bytecode).toLowerCase() !== artifactEvidence[name].creationBytecodeHash.toLowerCase()) {
      throw new Error(`${name} in-memory deployment factory differs from the reviewed creation bytecode`);
    }
    deploymentFactories[name] = factory;
  }
  const gas = await estimateDeploymentGas(
    ethers,
    deployer,
    engineAddress,
    tokenAddress,
    ownerSafe,
    royaltyTreasury,
  );
  const deployerBalance = await ethers.provider.getBalance(deployer.address);
  if (deployerBalance < gas.requiredBalance) {
    throw new Error(
      `Deployment signer requires at least ${ethers.formatEther(gas.requiredBalance)} ETH at the sampled Base fee; ` +
      `observed ${ethers.formatEther(deployerBalance)} ETH`,
    );
  }

  console.log("NARA v4 Position NFT Phase-2 preflight");
  console.log("Change ID:       ", POSITION_NFT_PHASE2_CHANGE_ID);
  console.log("Mode:            ", mode);
  console.log("Network:         ", networkName, chainId.toString());
  console.log("Core origin:     ", production.originCommit);
  console.log("Engine:          ", engineAddress);
  console.log("NARA:            ", tokenAddress);
  console.log("Owner Safe:      ", ownerSafe);
  console.log("Safe nonce:      ", safePreflight.nonce, `at block ${safePreflight.verifiedAtBlock}`);
  console.log("Royalty policy:  1000 bps to pinned production treasury, Safe freeze pending");
  console.log("Royalty treasury:", royaltyTreasury);
  console.log("Claim-fee policy: 0 bps, no recipient, Safe freeze pending");
  console.log("Genesis phase:   deferred; minters remain Safe-configurable");
  console.log("Gas budget:      ", gas.gasBudget.toString());
  console.log("Required ETH:    ", ethers.formatEther(gas.requiredBalance));
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    console.log(`Predicted ${name}:`, predicted[name]);
  }

  if (mode === "plan") {
    if (optionalEnv("V4_POSITION_NFT_WRITE_PLAN_EVIDENCE") === "1") {
      if (networkName !== "base") throw new Error("Production plan evidence can be generated only against Base");
      const dirty = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]);
      if (dirty !== "") throw new Error("Production plan evidence requires a clean audited source checkout");
      const sourceCommit = gitOutput(["rev-parse", "HEAD"]).toLowerCase();
      if (gitOutput(["rev-parse", "origin/main"]).toLowerCase() !== sourceCommit) {
        throw new Error("Production plan evidence must be generated from the exact audited origin/main source commit");
      }
      const planBlock = await ethers.provider.getBlock("latest");
      if (!planBlock?.hash || /^0x0{64}$/i.test(planBlock.hash)) {
        throw new Error("Could not pin the production deployment-plan observation block");
      }
      const [nonceAtBlock, pendingNonceNow, predictedCode] = await Promise.all([
        ethers.provider.getTransactionCount(deployer.address, planBlock.number),
        ethers.provider.getTransactionCount(deployer.address, "pending"),
        Promise.all(POSITION_NFT_PHASE2_CONTRACTS.map((name) => ethers.provider.getCode(predicted[name], planBlock.number))),
      ]);
      if (nonceAtBlock !== latestNonce || pendingNonceNow !== latestNonce || predictedCode.some((code) => code !== "0x")) {
        throw new Error("Deployment signer nonce/code state changed while building the one-attempt plan evidence");
      }
      const evidenceDirectory = RELEASE_EVIDENCE_PREFIX.slice(0, -1);
      if (!existsSync(evidenceDirectory)) mkdirSync(evidenceDirectory, { recursive: true });
      const planEvidencePath = `${RELEASE_EVIDENCE_PREFIX}deployment-plan.json`;
      const artifactEvidencePath = `${RELEASE_EVIDENCE_PREFIX}artifact-build.json`;
      const blockTimestamp = Number(planBlock.timestamp);
      const planEvidence = {
        schemaVersion: 1,
        changeId: POSITION_NFT_PHASE2_CHANGE_ID,
        sourceCommit,
        chainId: POSITION_NFT_PHASE2_CHAIN_ID.toString(),
        network: "base",
        createdAt: new Date(blockTimestamp * 1_000).toISOString(),
        deployer: ethers.getAddress(deployer.address),
        expectedStartNonce: latestNonce,
        predictedAddresses: predicted,
        observedAtBlock: Number(planBlock.number),
        observedAtBlockHash: planBlock.hash,
        validUntilBlock: Number(planBlock.number) + 43_200,
        observedChecks: {
          latestNonceEqualsPendingNonce: true,
          allSevenPredictedAddressesHaveNoCode: true,
          deploymentSignerDiffersFromOwnerSafe: true,
        },
        humanAttestationsRequired: [
          "dedicatedIdleSigner",
          "noPriorPhase2Attempt",
          "explicitProductionApprovalAfterObservation",
        ],
      };
      const artifactBuildEvidence = {
        schemaVersion: 1,
        changeId: POSITION_NFT_PHASE2_CHANGE_ID,
        sourceCommit,
        artifacts: artifactEvidence,
      };
      durableWriteNew(planEvidencePath, `${jsonStringify(planEvidence)}\n`);
      durableWriteNew(artifactEvidencePath, `${jsonStringify(artifactBuildEvidence)}\n`);
      console.log(JSON.stringify({
        deploymentPlan: { path: planEvidencePath, sha256: normalizedTextSha256(planEvidencePath) },
        artifactBuild: { path: artifactEvidencePath, sha256: normalizedTextSha256(artifactEvidencePath) },
      }, null, 2));
    } else {
      console.log("Plan complete. No files were written and no transactions were sent.");
      console.log("Set V4_POSITION_NFT_WRITE_PLAN_EVIDENCE=1 only on the clean audited source commit to emit canonical evidence.");
    }
    return;
  }

  let release: ReleaseSourceEvidence | null = null;
  if (mode === "execute") {
    if (requiredEnv("V4_POSITION_NFT_EXECUTION_CONFIRM") !== POSITION_NFT_PHASE2_CHANGE_ID) {
      throw new Error(`V4_POSITION_NFT_EXECUTION_CONFIRM must equal ${POSITION_NFT_PHASE2_CHANGE_ID}`);
    }
    release = await requireReviewedBaseReleaseSource(
      ownerSafe,
      royaltyTreasury,
      ethers.provider,
      deployer.address,
      latestNonce,
      predicted,
    );
    const reviewedArtifactBuild = JSON.parse(
      readFileSync(release.gateAttestation.artifactBuild.evidencePath, "utf8"),
    ) as Record<string, unknown>;
    if (
      reviewedArtifactBuild.schemaVersion !== 1 ||
      reviewedArtifactBuild.changeId !== POSITION_NFT_PHASE2_CHANGE_ID ||
      String(reviewedArtifactBuild.sourceCommit).toLowerCase() !== release.sourceCommit ||
      JSON.stringify(reviewedArtifactBuild.artifacts) !== JSON.stringify(artifactEvidence)
    ) {
      throw new Error("Local deployment artifacts differ from the clean-build evidence for the audited source commit");
    }
    refusePriorProductionAttempt();
  }

  const preCreationGuard = async (): Promise<void> => {
    const liveNetwork = await ethers.provider.getNetwork();
    if (liveNetwork.chainId !== POSITION_NFT_PHASE2_CHAIN_ID) {
      throw new Error("Connected chain changed before a Position NFT creation transaction");
    }
    if (mode !== "execute") return;
    if (!release) throw new Error("Production release evidence disappeared before a creation transaction");
    const currentBlockNumber = await ethers.provider.getBlockNumber();
    if (currentBlockNumber > release.gateAttestation.deploymentPlan.validUntilBlock) {
      throw new Error("Approved one-attempt deployment plan expired before a creation transaction");
    }
    await assertProductionV4Runtime(ethers.provider, currentV4Config());
  };

  activeJournal = new DeploymentJournal({
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    mode,
    network: networkName,
    chainId: chainId.toString(),
    release,
    coreOriginCommit: production.originCommit,
    deployer: deployer.address,
    ownerSafe,
  });

  const confirmations = mode === "execute" ? 2 : 1;
  const receipts: Record<string, ReceiptEvidence> = {};

  const artMetadataDeployment = await deployRecorded(
    activeJournal,
    "NARAArtMetadataV1",
    predicted.NARAArtMetadataV1,
    latestNonce,
    confirmations,
    ethers.provider,
    deployer.address,
    preCreationGuard,
    () => deploymentFactories.NARAArtMetadataV1.deploy({ nonce: latestNonce }),
  );
  receipts.NARAArtMetadataV1 = artMetadataDeployment.receipt;
  const artMetadataAddress = ethers.getAddress(await artMetadataDeployment.contract.getAddress());

  const securityPrintDeployment = await deployRecorded(
    activeJournal,
    "NARAArtSecurityPrintV1",
    predicted.NARAArtSecurityPrintV1,
    latestNonce + 1,
    confirmations,
    ethers.provider,
    deployer.address,
    preCreationGuard,
    () => deploymentFactories.NARAArtSecurityPrintV1.deploy({ nonce: latestNonce + 1 }),
  );
  receipts.NARAArtSecurityPrintV1 = securityPrintDeployment.receipt;
  const securityPrintAddress = ethers.getAddress(await securityPrintDeployment.contract.getAddress());

  const corePlateDeployment = await deployRecorded(
    activeJournal,
    "NARAArtCorePlateV1",
    predicted.NARAArtCorePlateV1,
    latestNonce + 2,
    confirmations,
    ethers.provider,
    deployer.address,
    preCreationGuard,
    () => deploymentFactories.NARAArtCorePlateV1.deploy(
      securityPrintAddress,
      { nonce: latestNonce + 2 },
    ),
  );
  receipts.NARAArtCorePlateV1 = corePlateDeployment.receipt;
  const corePlateAddress = ethers.getAddress(await corePlateDeployment.contract.getAddress());

  const genesisPlateDeployment = await deployRecorded(
    activeJournal,
    "NARAArtGenesisPlateV1",
    predicted.NARAArtGenesisPlateV1,
    latestNonce + 3,
    confirmations,
    ethers.provider,
    deployer.address,
    preCreationGuard,
    () => deploymentFactories.NARAArtGenesisPlateV1.deploy({ nonce: latestNonce + 3 }),
  );
  receipts.NARAArtGenesisPlateV1 = genesisPlateDeployment.receipt;
  const genesisPlateAddress = ethers.getAddress(await genesisPlateDeployment.contract.getAddress());

  const rendererDeployment = await deployRecorded(
    activeJournal,
    "NARAPositionRendererV5",
    predicted.NARAPositionRendererV5,
    latestNonce + 4,
    confirmations,
    ethers.provider,
    deployer.address,
    preCreationGuard,
    () => deploymentFactories.NARAPositionRendererV5.deploy(
      artMetadataAddress,
      corePlateAddress,
      genesisPlateAddress,
      securityPrintAddress,
      { nonce: latestNonce + 4 },
    ),
  );
  receipts.NARAPositionRendererV5 = rendererDeployment.receipt;
  const rendererAddress = ethers.getAddress(await rendererDeployment.contract.getAddress());

  const accountDeployment = await deployRecorded(
    activeJournal,
    "NARAPositionAccountV4",
    predicted.NARAPositionAccountV4,
    latestNonce + 5,
    confirmations,
    ethers.provider,
    deployer.address,
    preCreationGuard,
    () => deploymentFactories.NARAPositionAccountV4.deploy({ nonce: latestNonce + 5 }),
  );
  receipts.NARAPositionAccountV4 = accountDeployment.receipt;
  const accountAddress = ethers.getAddress(await accountDeployment.contract.getAddress());

  const nftDeployment = await deployRecorded(
    activeJournal,
    "NARAPositionNFTV4",
    predicted.NARAPositionNFTV4,
    latestNonce + 6,
    confirmations,
    ethers.provider,
    deployer.address,
    async () => {
      await preCreationGuard();
      const preNftContainment = await readRewardNotifierContainmentEvidence(
        ethers.provider,
        production,
        await ethers.provider.getBlockNumber(),
      );
      assertRewardNotifierHistoryUnchanged(
        coreContainment,
        preNftContainment,
        "Pre-NARAPositionNFTV4 creation",
      );
    },
    () => deploymentFactories.NARAPositionNFTV4.deploy(
      engineAddress,
      tokenAddress,
      accountAddress,
      rendererAddress,
      ownerSafe,
      royaltyTreasury,
      policy.royaltyBps,
      { nonce: latestNonce + 6 },
    ),
  );
  receipts.NARAPositionNFTV4 = nftDeployment.receipt;
  const positionNft = nftDeployment.contract;
  const positionNftAddress = ethers.getAddress(await positionNft.getAddress());

  const renderer = rendererDeployment.contract;
  const account = accountDeployment.contract;
  const artMetadata = artMetadataDeployment.contract;
  const securityPrint = securityPrintDeployment.contract;
  const corePlate = corePlateDeployment.contract;
  const genesisPlate = genesisPlateDeployment.contract;
  const verificationBlock = await ethers.provider.getBlock("latest");
  if (!verificationBlock?.hash || /^0x0{64}$/i.test(verificationBlock.hash)) {
    throw new Error("Verification block does not have a canonical non-zero block hash");
  }
  const verificationBlockNumber = Number(verificationBlock.number);
  const readAtVerificationBlock = { blockTag: verificationBlockNumber };
  const [
    nftEngine,
    nftNara,
    nftAccount,
    nftRenderer,
    nftOwner,
    nftPendingOwner,
    royaltyFrozen,
    genesisDistributor,
    genesisMintersFrozen,
    naraClaimFeeBps,
    tokenClaimFeeBps,
    claimFeeRecipient,
    claimFeesFrozen,
    nextTokenId,
    name,
    symbol,
    supportsErc721,
    supportsErc2981,
    supportsErc4906,
    contractUri,
    royaltyInfo,
    rendererVersion,
    rendererMetadata,
    rendererCore,
    rendererGenesis,
    rendererCollection,
    implementationInitialized,
    rendererCollectionUri,
    metadataVersion,
    securityPrintVersion,
    corePlateVersion,
    genesisPlateVersion,
    coreSecurityPrint,
  ] = await Promise.all([
    positionNft.engine(readAtVerificationBlock),
    positionNft.nara(readAtVerificationBlock),
    positionNft.accountImplementation(readAtVerificationBlock),
    positionNft.renderer(readAtVerificationBlock),
    positionNft.owner(readAtVerificationBlock),
    positionNft.pendingOwner(readAtVerificationBlock),
    positionNft.royaltyFrozen(readAtVerificationBlock),
    positionNft.genesisRewardDistributor(readAtVerificationBlock),
    positionNft.genesisMintersFrozen(readAtVerificationBlock),
    positionNft.naraClaimFeeBps(readAtVerificationBlock),
    positionNft.tokenClaimFeeBps(readAtVerificationBlock),
    positionNft.claimFeeRecipient(readAtVerificationBlock),
    positionNft.claimFeesFrozen(readAtVerificationBlock),
    positionNft.nextTokenId(readAtVerificationBlock),
    positionNft.name(readAtVerificationBlock),
    positionNft.symbol(readAtVerificationBlock),
    positionNft.supportsInterface("0x80ac58cd", readAtVerificationBlock),
    positionNft.supportsInterface("0x2a55205a", readAtVerificationBlock),
    positionNft.supportsInterface("0x49064906", readAtVerificationBlock),
    positionNft.contractURI(readAtVerificationBlock),
    positionNft.royaltyInfo(1, 10_000, readAtVerificationBlock),
    renderer.RENDERER_VERSION(readAtVerificationBlock),
    renderer.METADATA(readAtVerificationBlock),
    renderer.CORE_PLATE(readAtVerificationBlock),
    renderer.GENESIS_PLATE(readAtVerificationBlock),
    renderer.COLLECTION_ART(readAtVerificationBlock),
    account.initialized(readAtVerificationBlock),
    renderer.collectionURI(positionNftAddress, readAtVerificationBlock),
    artMetadata.METADATA_VERSION(readAtVerificationBlock),
    securityPrint.SECURITY_PRINT_VERSION(readAtVerificationBlock),
    corePlate.CORE_PLATE_VERSION(readAtVerificationBlock),
    genesisPlate.GENESIS_PLATE_VERSION(readAtVerificationBlock),
    corePlate.SECURITY_PRINT(readAtVerificationBlock),
  ]);

  const requireAddress = (label: string, actual: string, expected: string) => {
    if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
      throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
    }
  };
  requireAddress("Position NFT Engine", nftEngine, engineAddress);
  requireAddress("Position NFT NARA", nftNara, tokenAddress);
  requireAddress("Position NFT account implementation", nftAccount, accountAddress);
  requireAddress("Position NFT renderer", nftRenderer, rendererAddress);
  requireAddress("Position NFT owner", nftOwner, ownerSafe);
  requireAddress("Position NFT pending owner", nftPendingOwner, ethers.ZeroAddress);
  requireAddress("Position NFT Genesis distributor", genesisDistributor, ethers.ZeroAddress);
  requireAddress("Position NFT claim fee recipient", claimFeeRecipient, ethers.ZeroAddress);
  requireAddress("Renderer metadata", rendererMetadata, artMetadataAddress);
  requireAddress("Renderer core", rendererCore, corePlateAddress);
  requireAddress("Renderer Genesis", rendererGenesis, genesisPlateAddress);
  requireAddress("Renderer collection", rendererCollection, securityPrintAddress);
  requireAddress("Core plate security print", coreSecurityPrint, securityPrintAddress);
  const collectionMetadata = decodeJsonDataUri("direct renderer collectionURI", String(rendererCollectionUri));
  const collectionImage = String(collectionMetadata.image ?? "");
  if (
    String(contractUri) !== String(rendererCollectionUri) ||
    collectionMetadata.name !== "NARA Positions" ||
    !collectionImage.startsWith("data:image/svg+xml;base64,") ||
    !Buffer.from(collectionImage.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8").includes("<svg")
  ) {
    throw new Error("Direct renderer collection metadata/image validation failed or NFT returned its fallback URI");
  }
  if (
    royaltyFrozen ||
    genesisMintersFrozen ||
    claimFeesFrozen ||
    naraClaimFeeBps !== 0n ||
    tokenClaimFeeBps !== 0n ||
    name !== "NARA Position" ||
    symbol !== "NARAPOS" ||
    !supportsErc721 ||
    !supportsErc2981 ||
    !supportsErc4906 ||
    !implementationInitialized ||
    rendererVersion !== 5n ||
    metadataVersion !== 1n ||
    securityPrintVersion !== 1n ||
    corePlateVersion !== 1n ||
    genesisPlateVersion !== 1n ||
    ethers.getAddress(royaltyInfo[0]) !== royaltyTreasury ||
    royaltyInfo[1] !== BigInt(policy.royaltyBps) ||
    !String(contractUri).startsWith("data:application/json;base64,")
  ) {
    throw new Error("Position NFT Phase-2 post-deployment readback did not match the reviewed pre-finalization state");
  }

  const genesisMinterTopic = positionNft.interface.getEvent("GenesisMinterSet").topicHash;
  const genesisMinterLogs = await ethers.provider.getLogs({
    address: positionNftAddress,
    fromBlock: receipts.NARAPositionNFTV4.blockNumber,
    toBlock: verificationBlockNumber,
    topics: [genesisMinterTopic],
  });
  if (genesisMinterLogs.length !== 0) {
    throw new Error("Unexpected GenesisMinterSet event occurred during the isolated Phase-2 deployment");
  }
  const positionMintedTopic = positionNft.interface.getEvent("PositionMinted").topicHash;
  const positionMintedLogs = await ethers.provider.getLogs({
    address: positionNftAddress,
    fromBlock: receipts.NARAPositionNFTV4.blockNumber,
    toBlock: verificationBlockNumber,
    topics: [positionMintedTopic],
  });
  const observedPublicMints = positionMintedLogs.map((log: any, index: number) => {
    const parsed = positionNft.interface.parseLog(log);
    if (!parsed || BigInt(parsed.args.tokenId) !== BigInt(index + 1)) {
      throw new Error("PositionMinted history is missing or non-sequential from the deployment block");
    }
    return {
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      logIndex: log.index,
      minter: ethers.getAddress(parsed.args.minter),
      owner: ethers.getAddress(parsed.args.owner),
      tokenId: parsed.args.tokenId.toString(),
      account: ethers.getAddress(parsed.args.account),
      positionId: parsed.args.positionId.toString(),
      amount: parsed.args.amount.toString(),
      durationEpochs: parsed.args.durationEpochs.toString(),
    };
  });
  if (nextTokenId !== BigInt(observedPublicMints.length + 1)) {
    throw new Error("nextTokenId does not reconcile with PositionMinted history at the verification block");
  }

  const addresses = {
    NARAArtMetadataV1: artMetadataAddress,
    NARAArtSecurityPrintV1: securityPrintAddress,
    NARAArtCorePlateV1: corePlateAddress,
    NARAArtGenesisPlateV1: genesisPlateAddress,
    NARAPositionRendererV5: rendererAddress,
    NARAPositionAccountV4: accountAddress,
    NARAPositionNFTV4: positionNftAddress,
  };
  const runtimeCode = await runtimeCodeEvidence(ethers, addresses, verificationBlockNumber);
  activeJournal.transactionsComplete();

  const finalizationBatch = buildPositionNftPhase2FinalizationBatch(
    ownerSafe,
    positionNftAddress,
    royaltyTreasury,
    {
    deploymentMode: mode,
    verificationBlock: verificationBlockNumber,
    verificationBlockHash: verificationBlock.hash,
    releaseCommit: release?.releaseCommit ?? null,
    },
    Number(verificationBlock.timestamp) * 1_000,
  );
  const finalizationSafeSnapshot = await readCanonicalNaraSafeEvidence(
    ethers.provider,
    ownerSafe,
    production.safeCodeHash,
    verificationBlockNumber,
  );
  if (BigInt(finalizationSafeSnapshot.nonce) !== BigInt(safePreflight.nonce)) {
    throw new Error("Production Safe nonce changed during the seven-contract deployment window");
  }
  const safeBatchPlan = await buildAndSimulateSafeBatch(
    ethers.provider,
    ownerSafe,
    BigInt(finalizationSafeSnapshot.nonce),
    finalizationBatch.transactions,
    verificationBlockNumber,
  );
  const batchJson = `${jsonStringify(finalizationBatch)}\n`;
  const batchHash = createHash("sha256").update(batchJson).digest("hex");
  const rehearsalArtifactId = mode === "rehearse"
    ? `${verificationBlockNumber}-${Date.now()}`
    : null;
  const rehearsalBatchPath = mode === "rehearse"
    ? `deployments/REHEARSAL-DO-NOT-IMPORT-v4-position-nft-phase2-finalization-${rehearsalArtifactId}.json`
    : null;
  if (rehearsalBatchPath !== null) durableWriteNew(rehearsalBatchPath, batchJson);

  const startBlock = Math.min(...Object.values(receipts).map((receipt) => receipt.blockNumber));
  const manifest = {
    schemaVersion: 1,
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    evidenceState: "deployed_pending_safe_finalization",
    integrationReady: false,
    onchainMinting: "permissionless_from_position_nft_deployment",
    createdAt: new Date().toISOString(),
    mode,
    network: networkName,
    chainId: chainId.toString(),
    release,
    coreDependency: {
      changeId: production.changeId,
      originCommit: production.originCommit,
      manifestPath: PRODUCTION_CORE_MANIFEST,
      manifestSha256: production.manifestSha256,
      engine: engineAddress,
      token: tokenAddress,
    },
    ownerSafe,
    safePreflight,
    coreContainment,
    deployer: deployer.address,
    startBlock,
    positionNftStartBlock: receipts.NARAPositionNFTV4.blockNumber,
    verificationBlock: verificationBlockNumber,
    verificationBlockHash: verificationBlock.hash,
    deploymentOrder: POSITION_NFT_PHASE2_CONTRACTS,
    contracts: {
      NARAArtMetadataV1: { address: artMetadataAddress, constructorArguments: [], receipt: receipts.NARAArtMetadataV1 },
      NARAArtSecurityPrintV1: { address: securityPrintAddress, constructorArguments: [], receipt: receipts.NARAArtSecurityPrintV1 },
      NARAArtCorePlateV1: {
        address: corePlateAddress,
        constructorArguments: [securityPrintAddress],
        receipt: receipts.NARAArtCorePlateV1,
      },
      NARAArtGenesisPlateV1: { address: genesisPlateAddress, constructorArguments: [], receipt: receipts.NARAArtGenesisPlateV1 },
      NARAPositionRendererV5: {
        address: rendererAddress,
        constructorArguments: [artMetadataAddress, corePlateAddress, genesisPlateAddress, securityPrintAddress],
        receipt: receipts.NARAPositionRendererV5,
      },
      NARAPositionAccountV4: { address: accountAddress, constructorArguments: [], receipt: receipts.NARAPositionAccountV4 },
      NARAPositionNFTV4: {
        address: positionNftAddress,
        constructorArguments: [
          engineAddress,
          tokenAddress,
          accountAddress,
          rendererAddress,
          ownerSafe,
          royaltyTreasury,
          policy.royaltyBps,
        ],
        receipt: receipts.NARAPositionNFTV4,
      },
    },
    sourceArtifacts: artifactEvidence,
    runtimeCode,
    policy: {
      ...policy,
      royaltiesFrozen: false,
      claimFeesFrozen: false,
      finalizationRequired: true,
      genesisRewardDistributor: ethers.ZeroAddress,
      genesisMintersFrozen: false,
    },
    readback: {
      name,
      symbol,
      nextTokenId: nextTokenId.toString(),
      rendererVersion: rendererVersion.toString(),
      supportsErc721,
      supportsErc2981,
      supportsErc4906,
      collectionMetadataOnchain: true,
      collectionName: collectionMetadata.name,
      collectionImageSha256: createHash("sha256").update(collectionImage).digest("hex"),
      accountImplementationInitialized: implementationInitialized,
      genesisMinterEventCount: genesisMinterLogs.length,
    },
    publicMintSurface: {
      permissionlessFromBlock: receipts.NARAPositionNFTV4.blockNumber,
      observedThroughBlock: verificationBlockNumber,
      observedMintCount: observedPublicMints.length,
      nextTokenId: nextTokenId.toString(),
      mints: observedPublicMints,
    },
    safeFinalization: {
      status: "unexecuted",
      batchArtifact: mode === "execute"
        ? POSITION_NFT_PHASE2_PENDING_BATCH_ARTIFACT // status: embedded_only_pending_source_verification
        : canonicalPositionNftPhase2RehearsalBatchArtifact(rehearsalBatchPath as string),
      batchSha256: batchHash,
      batch: finalizationBatch,
      safeSnapshot: finalizationSafeSnapshot,
      safeBatchPlan,
      simulatedFromSafeAtBlock: verificationBlockNumber,
      calls: POSITION_NFT_PHASE2_FINALIZATION_CALLS,
      requiredPostState: {
        owner: ownerSafe,
        pendingOwner: ethers.ZeroAddress,
        royaltyReceiver: royaltyTreasury,
        royaltyBps: policy.royaltyBps,
        royaltiesFrozen: true,
        naraClaimFeeBps: 0,
        tokenClaimFeeBps: 0,
        claimFeeRecipient: ethers.ZeroAddress,
        claimFeesFrozen: true,
        genesisMintersFrozen: false,
      },
    },
    sourceVerification: {
      status: "pending",
      requiredContracts: POSITION_NFT_PHASE2_CONTRACTS,
    },
    smokeEvidence: {
      liveMintTransferClaimUnlock: "not_performed",
      reason: "Value-bearing smoke transactions require a separate reviewed user action after Safe finalization.",
    },
    receiptJournal: activeJournal.evidence(),
  };

  const manifestPath = mode === "execute"
    ? PRODUCTION_MANIFEST
    : join(DEPLOYMENT_DIR, `v4-position-nft-phase2-rehearsal-${rehearsalArtifactId}.json`);
  durableWriteNew(manifestPath, `${jsonStringify(manifest)}\n`);
  if (mode === "rehearse") {
    (globalThis as any).__NARA_POSITION_NFT_REHEARSAL_MANIFEST__ = manifestPath;
  }
  activeJournal.complete(manifestPath);
  console.log("Position NFT Phase-2 deployment transactions confirmed.");
  console.log("Manifest:", manifestPath);
  if (rehearsalBatchPath !== null) {
    console.log("REHEARSAL DO NOT IMPORT Safe batch:", rehearsalBatchPath);
  } else {
    console.log("No standalone Safe import was written; the canonical batch remains embedded pending source verification.");
  }
  console.log("Do not publish or configure consumers until Safe finalization, source verification, and final readback pass.");
}

await main().catch((error) => {
  try {
    activeJournal?.fail(error);
  } catch {
    // Preserve the original failure; a partially written journal remains a stop condition.
  }
  console.error(error);
  if (activeJournal) {
    console.error("No blind retry. Reconcile the receipt journal and onchain state first.");
  } else {
    console.error("Pre-transaction planning/preflight stopped; no deployment transaction or receipt journal exists.");
  }
  process.exitCode = 1;
});
