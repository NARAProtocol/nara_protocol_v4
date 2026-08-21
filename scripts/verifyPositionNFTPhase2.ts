/** Strict read-only verification for the staged NARA v4 Position NFT Phase-2 release. */

import hre from "hardhat";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
  type ProductionV4Deployment,
} from "./lib/v4LiveConfig.js";
import { buildAndSimulateSafeBatch, decodeAndVerifySafeExecution } from "./lib/v4SafeBatch.js";
import {
  assertPositionNftSourceVerificationEvidence,
  queryBaseScanSourceProof,
} from "./lib/v4PositionNftSourceVerification.js";
import { readCanonicalNaraSafeEvidence } from "./lib/v4SafeEvidence.js";
import {
  assertRewardNotifierHistoryUnchanged,
  readRewardNotifierContainmentEvidence,
} from "./lib/v4RewardNotifierContainment.js";
import {
  POSITION_NFT_PHASE2_CHAIN_ID,
  POSITION_NFT_PHASE2_CHANGE_ID,
  POSITION_NFT_PHASE2_CONTRACTS,
  POSITION_NFT_PHASE2_FINALIZATION_CALLS,
  POSITION_NFT_PHASE2_PENDING_BATCH_ARTIFACT,
  assertPositionNftPhase2GateAttestation,
  buildPositionNftPhase2FinalizationBatch,
  canonicalPositionNftPhase2Policy,
  canonicalPositionNftPhase2RehearsalBatchArtifact,
  collectPositionNftPhase2ArtifactEvidence,
  verifyPositionNftPhase2ReleaseControl,
  type PositionNftPhase2GateAttestation,
} from "./lib/v4PositionNftPhase2.js";
import { canonicalPositionNftPhase2SigningPacket } from "./lib/v4PositionNftSigningPacket.js";

type JsonObject = Record<string, any>;

const PENDING_MANIFEST = "deployments/v4-position-nft-phase2-2026-08-21.json";
const FINAL_MANIFEST = "deployments/v4-position-nft-phase2-finalized-2026-08-21.json";
const PRODUCTION_CORE_MANIFEST = "deployments/v4-production-activation-2026-08-09.json";

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function requireString(object: JsonObject, key: string, label = key): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Manifest field ${label} is missing`);
  return value;
}

function requireInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || String(parsed) !== String(value)) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function exactKeys(object: JsonObject, expected: readonly string[], label: string): void {
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys differ from the exact Phase-2 contract set`);
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2)}\n`;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedTextFileSha256(path: string): string {
  return sha256(readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
}

function sanitizedError(error: unknown): string {
  const secret = process.env.BASESCAN_API_KEY?.trim() ?? "";
  const original = error instanceof Error ? error.message : "Position NFT verification failed";
  const withoutSecret = secret === "" ? original : original.split(secret).join("[redacted-api-key]");
  return withoutSecret.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 600);
}

function sameAddress(ethers: any, label: string, actual: string, expected: string): void {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

function decodeJsonDataUri(label: string, value: string): JsonObject {
  const prefix = "data:application/json;base64,";
  if (!value.startsWith(prefix)) throw new Error(`${label} is not a base64 JSON data URI`);
  const parsed = JSON.parse(Buffer.from(value.slice(prefix.length), "base64").toString("utf8"));
  return requireObject(parsed, label);
}

async function canonicalBlock(provider: any, number: number, expectedHash: string, label: string): Promise<any> {
  const block = await provider.getBlock(number);
  if (!block?.hash || block.hash.toLowerCase() !== expectedHash.toLowerCase() || /^0x0{64}$/i.test(block.hash)) {
    throw new Error(`${label} block/hash does not match Base`);
  }
  return block;
}

async function pinnedProductionRuntimeEvidence(
  ethers: any,
  production: ProductionV4Deployment,
  blockNumber: number,
): Promise<Record<string, { address: string; codeHash: string }>> {
  const targets = [
    ["token", production.token],
    ["engine", production.engine],
    ["hook", production.hook],
    ["vault", production.vault],
    ["compounder", production.compounder],
    ["safe", production.safe],
  ] as const;
  const codes = await Promise.all(targets.map(([, address]) => ethers.provider.getCode(address, blockNumber)));
  return Object.fromEntries(targets.map(([label, address], index) => {
    const code = codes[index];
    if (code === "0x") throw new Error(`Production ${label} has no code at the signing block`);
    const codeHash = ethers.keccak256(code).toLowerCase();
    if (codeHash !== production.runtimeCodeHashes[label].toLowerCase()) {
      throw new Error(`Production ${label} runtime differs from the canonical manifest at the signing block`);
    }
    return [label, { address: ethers.getAddress(address), codeHash }];
  }));
}

async function logsInChunks(
  provider: any,
  address: string,
  topic: string,
  fromBlock: number,
  toBlock: number,
): Promise<any[]> {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += 2_000) {
    const end = Math.min(start + 1_999, toBlock);
    logs.push(...await provider.getLogs({ address, topics: [topic], fromBlock: start, toBlock: end }));
  }
  return logs.sort((left, right) => left.blockNumber - right.blockNumber || left.index - right.index);
}

async function main(): Promise<void> {
  const allowPending = envFlag("V4_POSITION_NFT_ALLOW_PENDING");
  const allowRehearsal = envFlag("V4_POSITION_NFT_ALLOW_REHEARSAL");
  const finalized = !allowPending;
  const defaultManifest = finalized ? FINAL_MANIFEST : PENDING_MANIFEST;
  const manifestPath = resolve(process.env.V4_POSITION_NFT_MANIFEST?.trim() || defaultManifest);
  if (!existsSync(manifestPath)) throw new Error(`Position NFT manifest not found: ${manifestPath}`);
  const manifest = requireObject(JSON.parse(readFileSync(manifestPath, "utf8")), "manifest");
  let pendingManifest: JsonObject | null = null;
  let pendingManifestSha256: string | null = null;

  if (manifest.schemaVersion !== 1 || manifest.changeId !== POSITION_NFT_PHASE2_CHANGE_ID) {
    throw new Error("Unexpected Position NFT manifest schema/change ID");
  }
  if (String(manifest.chainId) !== POSITION_NFT_PHASE2_CHAIN_ID.toString()) {
    throw new Error("Manifest is not for Base chain 8453");
  }
  if (allowRehearsal) {
    if (manifest.mode !== "rehearse" || manifest.network !== "baseFork" || manifest.release !== null) {
      throw new Error("Rehearsal verification requires a baseFork rehearsal manifest with no release claim");
    }
  } else if (manifest.mode !== "execute" || manifest.network !== "base") {
    throw new Error("Production verification accepts only an execute/base manifest");
  }
  if (finalized) {
    if (manifest.evidenceState !== "configured_source_verified" || manifest.integrationReady !== false) {
      throw new Error("Final manifest evidence state is not configured_source_verified/integrationReady=false");
    }
    const supersedes = requireObject(manifest.supersedes, "supersedes");
    if (supersedes.path !== PENDING_MANIFEST || !existsSync(PENDING_MANIFEST)) {
      throw new Error("Final manifest does not supersede the canonical pending deployment manifest");
    }
    pendingManifestSha256 = normalizedTextFileSha256(PENDING_MANIFEST);
    if (String(supersedes.sha256).toLowerCase() !== pendingManifestSha256) {
      throw new Error("Final manifest pending-manifest SHA-256 link is invalid");
    }
    pendingManifest = requireObject(JSON.parse(readFileSync(PENDING_MANIFEST, "utf8")), "pending manifest");
    if (
      pendingManifest.evidenceState !== "deployed_pending_safe_finalization" ||
      pendingManifest.integrationReady !== false ||
      pendingManifest.safeFinalization?.status !== "unexecuted" ||
      pendingManifest.sourceVerification?.status !== "pending"
    ) {
      throw new Error("Superseded deployment manifest is not the canonical pending evidence state");
    }
    const mutableFinalKeys = [
      "evidenceState",
      "safeFinalization",
      "sourceVerification",
      "sourceVerificationArtifact",
      "policy",
      "readback",
      "publicMintSurface",
      "finalization",
      "supersedes",
      "finalizedAt",
    ];
    const pendingImmutable = JSON.parse(JSON.stringify(pendingManifest));
    const finalImmutable = JSON.parse(JSON.stringify(manifest));
    for (const key of mutableFinalKeys) {
      delete pendingImmutable[key];
      delete finalImmutable[key];
    }
    if (canonicalJson(pendingImmutable) !== canonicalJson(finalImmutable)) {
      throw new Error("Final manifest changed immutable deployment evidence instead of append-only supersession");
    }
  } else if (
    manifest.evidenceState !== "deployed_pending_safe_finalization" ||
    manifest.integrationReady !== false
  ) {
    throw new Error("Pending manifest evidence state is not fail-closed");
  }
  if (manifest.onchainMinting !== "permissionless_from_position_nft_deployment") {
    throw new Error("Manifest does not acknowledge permissionless minting from the NFT deployment block");
  }

  const rehearsalConnection = (globalThis as any).__NARA_POSITION_NFT_REHEARSAL_CONNECTION__;
  const connection = rehearsalConnection ?? await hre.network.connect();
  const { ethers } = connection as any;
  const networkName = hre.globalOptions.network ?? "default";
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== POSITION_NFT_PHASE2_CHAIN_ID) throw new Error("Verifier must run against Base chain 8453");
  if (allowRehearsal ? networkName !== "baseFork" : networkName !== "base") {
    throw new Error("Verifier network name does not match the manifest class");
  }
  const production = await assertProductionV4Runtime(ethers.provider, currentV4Config());
  console.log(`Production runtime guard: ${productionV4RuntimeBanner(production)}`);
  const canonicalPolicy = canonicalPositionNftPhase2Policy(production.safe, production.treasury);
  const recordedCoreContainment = requireObject(manifest.coreContainment, "coreContainment");
  const replayedCoreContainment = await readRewardNotifierContainmentEvidence(
    ethers.provider,
    production,
    requireInteger(recordedCoreContainment.verifiedAtBlock, "coreContainment.verifiedAtBlock"),
  );
  if (canonicalJson(replayedCoreContainment) !== canonicalJson(recordedCoreContainment)) {
    throw new Error("Recorded Engine reward-notifier containment evidence does not reproduce");
  }

  let releaseCommit: string | null = null;
  let sourceCommit: string | null = null;
  let releaseGateAttestation: PositionNftPhase2GateAttestation | null = null;
  if (!allowRehearsal) {
    const release = requireObject(manifest.release, "release");
    releaseCommit = requireString(release, "releaseCommit", "release.releaseCommit").toLowerCase();
    if (
      !/^[0-9a-f]{40}$/.test(releaseCommit) ||
      requireString(release, "headCommit").toLowerCase() !== releaseCommit ||
      requireString(release, "originMainCommit").toLowerCase() !== releaseCommit ||
      release.originRemote !== "NARAProtocol/nara_protocol_v4" ||
      release.cleanWorkingTree !== true ||
      release.exactProtectedMain !== true
    ) {
      throw new Error("Release source evidence is not an exact clean protected-main commit");
    }
    const gateAttestation = assertPositionNftPhase2GateAttestation(
      release.gateAttestation,
      releaseCommit,
      production.safe,
      production.treasury,
    );
    releaseGateAttestation = gateAttestation;
    await verifyPositionNftPhase2ReleaseControl(gateAttestation);
    sourceCommit = gateAttestation.sourceCommit.toLowerCase();
    if (
      requireString(release, "sourceCommit").toLowerCase() !== sourceCommit ||
      requireString(release, "evidenceCommit").toLowerCase() !== releaseCommit
    ) {
      throw new Error("Release source/evidence commit pair differs from the embedded gate attestation");
    }
    if (sha256(JSON.stringify(gateAttestation)) !== requireString(release, "gateAttestationSha256")) {
      throw new Error("Embedded external gate-attestation hash mismatch");
    }
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
    for (const [path, hash] of evidenceFiles) {
      if (!existsSync(path) || normalizedTextFileSha256(path) !== hash.toLowerCase()) {
        throw new Error(`Release evidence is absent or hash-mismatched: ${path}`);
      }
    }
    await canonicalBlock(
      ethers.provider,
      gateAttestation.roadmapGate.observedAtBlock,
      gateAttestation.roadmapGate.observedAtBlockHash,
      "roadmap gate observation",
    );
  } else if (manifest.release !== null) {
    throw new Error("Rehearsal manifest must not claim production release evidence");
  }

  const core = requireObject(manifest.coreDependency, "coreDependency");
  if (
    core.changeId !== production.changeId ||
    core.originCommit !== production.originCommit ||
    core.manifestPath !== PRODUCTION_CORE_MANIFEST ||
    resolve(core.manifestPath) !== resolve(production.manifestPath) ||
    core.manifestSha256 !== production.manifestSha256
  ) {
    throw new Error("Position NFT core dependency differs from the pinned production manifest");
  }
  sameAddress(ethers, "core Engine", core.engine, production.engine);
  sameAddress(ethers, "core NARA", core.token, production.token);
  sameAddress(ethers, "owner Safe", manifest.ownerSafe, production.safe);

  if (canonicalJson(manifest.deploymentOrder) !== canonicalJson(POSITION_NFT_PHASE2_CONTRACTS)) {
    throw new Error("Deployment order differs from the exact seven-contract Phase-2 order");
  }
  const contracts = requireObject(manifest.contracts, "contracts");
  const runtime = requireObject(manifest.runtimeCode, "runtimeCode");
  const sourceArtifacts = requireObject(manifest.sourceArtifacts, "sourceArtifacts");
  exactKeys(contracts, POSITION_NFT_PHASE2_CONTRACTS, "contracts");
  exactKeys(runtime, POSITION_NFT_PHASE2_CONTRACTS, "runtimeCode");
  exactKeys(sourceArtifacts, POSITION_NFT_PHASE2_CONTRACTS, "sourceArtifacts");
  const localArtifacts = await collectPositionNftPhase2ArtifactEvidence(hre.artifacts);
  if (canonicalJson(localArtifacts) !== canonicalJson(sourceArtifacts)) {
    throw new Error("Manifest source/artifact/compiler evidence differs from the checked-out build");
  }
  if (!allowRehearsal) {
    if (!releaseGateAttestation) throw new Error("Release gate attestation is unavailable");
    const reviewedArtifactBuild = requireObject(
      JSON.parse(readFileSync(releaseGateAttestation.artifactBuild.evidencePath, "utf8")),
      "artifact build evidence",
    );
    if (
      reviewedArtifactBuild.schemaVersion !== 1 ||
      reviewedArtifactBuild.changeId !== POSITION_NFT_PHASE2_CHANGE_ID ||
      String(reviewedArtifactBuild.sourceCommit).toLowerCase() !== sourceCommit ||
      canonicalJson(reviewedArtifactBuild.artifacts) !== canonicalJson(sourceArtifacts)
    ) {
      throw new Error("Manifest artifacts differ from the reviewed clean-build evidence");
    }
  }

  const initialVerificationBlock = requireInteger(manifest.verificationBlock, "verificationBlock");
  const initialVerificationHash = requireString(manifest, "verificationBlockHash");
  const initialBlock = await canonicalBlock(
    ethers.provider,
    initialVerificationBlock,
    initialVerificationHash,
    "initial verification",
  );
  const finalization = finalized ? requireObject(manifest.finalization, "finalization") : null;
  const stateBlockNumber = finalized
    ? requireInteger(finalization?.readbackBlockNumber, "finalization.readbackBlockNumber")
    : initialVerificationBlock;
  const stateBlockHash = finalized
    ? requireString(finalization as JsonObject, "readbackBlockHash", "finalization.readbackBlockHash")
    : initialVerificationHash;
  await canonicalBlock(ethers.provider, stateBlockNumber, stateBlockHash, "state readback");
  const stateCoreContainment = allowRehearsal
    ? replayedCoreContainment
    : await readRewardNotifierContainmentEvidence(ethers.provider, production, stateBlockNumber);
  if (!allowRehearsal) {
    assertRewardNotifierHistoryUnchanged(
      replayedCoreContainment,
      stateCoreContainment,
      "Pinned Position NFT state",
    );
  }

  let firstDeploymentNonce: number | null = null;
  const addresses: Record<string, string> = {};
  for (const [index, name] of POSITION_NFT_PHASE2_CONTRACTS.entries()) {
    const entry = requireObject(contracts[name], `contracts.${name}`);
    const address = ethers.getAddress(requireString(entry, "address"));
    addresses[name] = address;
    const receiptEvidence = requireObject(entry.receipt, `contracts.${name}.receipt`);
    const transactionHash = requireString(receiptEvidence, "transactionHash");
    const [receipt, transaction] = await Promise.all([
      ethers.provider.getTransactionReceipt(transactionHash),
      ethers.provider.getTransaction(transactionHash),
    ]);
    if (
      !receipt ||
      !transaction ||
      receipt.status !== 1 ||
      receipt.hash.toLowerCase() !== transactionHash.toLowerCase() ||
      Number(receipt.blockNumber) !== requireInteger(receiptEvidence.blockNumber, `${name} receipt blockNumber`) ||
      receipt.blockHash.toLowerCase() !== requireString(receiptEvidence, "blockHash").toLowerCase() ||
      receipt.gasUsed.toString() !== requireString(receiptEvidence, "gasUsed") ||
      requireInteger(receiptEvidence.status, `${name} receipt status`) !== 1 ||
      ethers.getAddress(String(receiptEvidence.contractAddress ?? ethers.ZeroAddress)) !== address ||
      ethers.getAddress(receipt.contractAddress ?? ethers.ZeroAddress) !== address ||
      transaction.to !== null ||
      ethers.getAddress(transaction.from) !== ethers.getAddress(manifest.deployer) ||
      transaction.chainId !== POSITION_NFT_PHASE2_CHAIN_ID
    ) {
      throw new Error(`${name} creation transaction/receipt evidence does not match Base`);
    }
    const transactionNonce = Number(transaction.nonce);
    if (!Number.isSafeInteger(transactionNonce) || transactionNonce < 0) {
      throw new Error(`${name} creation transaction nonce is invalid`);
    }
    if (firstDeploymentNonce === null) firstDeploymentNonce = transactionNonce;
    const deploymentNonceBase = firstDeploymentNonce;
    if (deploymentNonceBase === null || transactionNonce !== deploymentNonceBase + index) {
      throw new Error("Deployment signer nonces are not consecutive");
    }
    if (ethers.getCreateAddress({ from: transaction.from, nonce: transactionNonce }) !== address) {
      throw new Error(`${name} CREATE address does not match signer/nonce`);
    }
    const artifact = await hre.artifacts.readArtifact(sourceArtifacts[name].fullyQualifiedName);
    const constructorArguments = entry.constructorArguments;
    if (!Array.isArray(constructorArguments)) throw new Error(`${name} constructorArguments must be an array`);
    const expectedDeployment = await new ethers.ContractFactory(artifact.abi, artifact.bytecode)
      .getDeployTransaction(...constructorArguments);
    if (!expectedDeployment.data || ethers.keccak256(transaction.data) !== ethers.keccak256(expectedDeployment.data)) {
      throw new Error(`${name} creation calldata differs from the reviewed artifact/constructor arguments`);
    }

    const runtimeEntry = requireObject(runtime[name], `runtimeCode.${name}`);
    sameAddress(ethers, `${name} runtime address`, requireString(runtimeEntry, "address"), address);
    if (requireInteger(runtimeEntry.verifiedAtBlock, `${name} runtime verifiedAtBlock`) !== initialVerificationBlock) {
      throw new Error(`${name} runtime was not recorded at the canonical initial verification block`);
    }
    const [historicalCode, currentCode] = await Promise.all([
      ethers.provider.getCode(address, initialVerificationBlock),
      ethers.provider.getCode(address),
    ]);
    const expectedRuntimeHash = requireString(runtimeEntry, "codeHash").toLowerCase();
    if (
      historicalCode === "0x" ||
      currentCode === "0x" ||
      ethers.keccak256(historicalCode).toLowerCase() !== expectedRuntimeHash ||
      ethers.keccak256(currentCode).toLowerCase() !== expectedRuntimeHash ||
      (historicalCode.length - 2) / 2 !== requireInteger(runtimeEntry.codeSizeBytes, `${name} codeSizeBytes`)
    ) {
      throw new Error(`${name} runtime evidence differs from Base`);
    }
  }

  if (!allowRehearsal) {
    if (!releaseGateAttestation || firstDeploymentNonce === null) {
      throw new Error("Production deployment plan evidence is unavailable");
    }
    const approvedPlan = releaseGateAttestation.deploymentPlan;
    sameAddress(ethers, "approved deployment signer", approvedPlan.deployer, manifest.deployer);
    if (approvedPlan.expectedStartNonce !== firstDeploymentNonce) {
      throw new Error("Actual deployment nonce does not match the approved one-attempt plan");
    }
    for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
      sameAddress(
        ethers,
        `approved ${name} predicted address`,
        approvedPlan.predictedAddresses[name],
        addresses[name],
      );
    }
    await canonicalBlock(
      ethers.provider,
      approvedPlan.observedAtBlock,
      approvedPlan.observedAtBlockHash,
      "deployment-plan observation",
    );
  }

  if (
    requireInteger(manifest.positionNftStartBlock, "positionNftStartBlock") !==
    requireInteger(contracts.NARAPositionNFTV4.receipt.blockNumber, "NFT receipt blockNumber")
  ) {
    throw new Error("NFT consumer start block is not the NARAPositionNFTV4 creation block");
  }
  const receiptBlocks = POSITION_NFT_PHASE2_CONTRACTS.map((name) =>
    requireInteger(contracts[name].receipt.blockNumber, `${name} receipt blockNumber`),
  );
  if (!allowRehearsal) {
    if (!releaseGateAttestation) throw new Error("Production deployment temporal evidence is unavailable");
    const approvedPlan = releaseGateAttestation.deploymentPlan;
    const firstReceiptBlockNumber = Math.min(...receiptBlocks);
    const lastReceiptBlockNumber = Math.max(...receiptBlocks);
    const [observationBlock, firstReceiptBlock] = await Promise.all([
      canonicalBlock(
        ethers.provider,
        approvedPlan.observedAtBlock,
        approvedPlan.observedAtBlockHash,
        "deployment-plan observation",
      ),
      ethers.provider.getBlock(firstReceiptBlockNumber),
    ]);
    const approvedAt = Date.parse(releaseGateAttestation.humanApproval.approvedAt);
    if (
      !firstReceiptBlock?.hash ||
      firstReceiptBlockNumber <= approvedPlan.observedAtBlock ||
      lastReceiptBlockNumber > approvedPlan.validUntilBlock ||
      approvedAt < Number(observationBlock.timestamp) * 1_000 ||
      approvedAt > Number(firstReceiptBlock.timestamp) * 1_000
    ) {
      throw new Error("Deployment receipts fall outside the approved plan/approval time window");
    }
  }
  if (requireInteger(manifest.startBlock, "startBlock") !== Math.min(...receiptBlocks)) {
    throw new Error("Manifest startBlock is not the earliest of the seven deployment receipts");
  }
  const receiptJournal = requireObject(manifest.receiptJournal, "receiptJournal");
  const journalTransactions = receiptJournal.transactions;
  if (
    receiptJournal.status !== "transactions_complete" ||
    receiptJournal.retryPolicy !== "NO_BLIND_RETRY: reconcile every recorded transaction and address before another attempt." ||
    !Array.isArray(journalTransactions) ||
    journalTransactions.length !== POSITION_NFT_PHASE2_CONTRACTS.length
  ) {
    throw new Error("Receipt journal is missing, incomplete, or does not preserve the no-blind-retry rule");
  }
  for (const [index, name] of POSITION_NFT_PHASE2_CONTRACTS.entries()) {
    const journalEntry = requireObject(journalTransactions[index], `receiptJournal.transactions.${index}`);
    if (
      requireInteger(journalEntry.index, `receiptJournal ${name} index`) !== index ||
      journalEntry.label !== name ||
      ethers.getAddress(journalEntry.expectedContractAddress) !== addresses[name] ||
      String(journalEntry.transactionHash).toLowerCase() !==
        String(contracts[name].receipt.transactionHash).toLowerCase() ||
      canonicalJson(journalEntry.receipt) !== canonicalJson(contracts[name].receipt)
    ) {
      throw new Error(`${name} receipt journal entry differs from the canonical deployment evidence`);
    }
  }

  const recordedSafePreflight = requireObject(manifest.safePreflight, "safePreflight");
  const replayedSafePreflight = await readCanonicalNaraSafeEvidence(
    ethers.provider,
    production.safe,
    production.safeCodeHash,
    requireInteger(recordedSafePreflight.verifiedAtBlock, "safePreflight.verifiedAtBlock"),
  );
  if (canonicalJson(replayedSafePreflight) !== canonicalJson(recordedSafePreflight)) {
    throw new Error("Recorded Safe preflight does not reproduce at its pinned block");
  }
  await readCanonicalNaraSafeEvidence(
    ethers.provider,
    production.safe,
    production.safeCodeHash,
    stateBlockNumber,
  );

  const nftAddress = addresses.NARAPositionNFTV4;
  const nft = await ethers.getContractAt("contracts/v4/NARAPositionNFTV4.sol:NARAPositionNFTV4", nftAddress);
  const renderer = await ethers.getContractAt(
    "contracts/v4/NARAPositionRendererV5.sol:NARAPositionRendererV5",
    addresses.NARAPositionRendererV5,
  );
  const account = await ethers.getContractAt(
    "contracts/v4/NARAPositionAccountV4.sol:NARAPositionAccountV4",
    addresses.NARAPositionAccountV4,
  );
  const metadata = await ethers.getContractAt(
    "contracts/v4/NARAArtMetadataV1.sol:NARAArtMetadataV1",
    addresses.NARAArtMetadataV1,
  );
  const securityPrint = await ethers.getContractAt(
    "contracts/v4/NARAArtSecurityPrintV1.sol:NARAArtSecurityPrintV1",
    addresses.NARAArtSecurityPrintV1,
  );
  const corePlate = await ethers.getContractAt(
    "contracts/v4/NARAArtCorePlateV1.sol:NARAArtCorePlateV1",
    addresses.NARAArtCorePlateV1,
  );
  const genesisPlate = await ethers.getContractAt(
    "contracts/v4/NARAArtGenesisPlateV1.sol:NARAArtGenesisPlateV1",
    addresses.NARAArtGenesisPlateV1,
  );
  const atState = { blockTag: stateBlockNumber };
  const [
    engine,
    nara,
    accountImplementation,
    rendererBinding,
    owner,
    pendingOwner,
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
    rendererCollectionUri,
    implementationInitialized,
    metadataVersion,
    securityPrintVersion,
    corePlateVersion,
    genesisPlateVersion,
    coreSecurityPrint,
  ] = await Promise.all([
    nft.engine(atState),
    nft.nara(atState),
    nft.accountImplementation(atState),
    nft.renderer(atState),
    nft.owner(atState),
    nft.pendingOwner(atState),
    nft.royaltyFrozen(atState),
    nft.genesisRewardDistributor(atState),
    nft.genesisMintersFrozen(atState),
    nft.naraClaimFeeBps(atState),
    nft.tokenClaimFeeBps(atState),
    nft.claimFeeRecipient(atState),
    nft.claimFeesFrozen(atState),
    nft.nextTokenId(atState),
    nft.name(atState),
    nft.symbol(atState),
    nft.supportsInterface("0x80ac58cd", atState),
    nft.supportsInterface("0x2a55205a", atState),
    nft.supportsInterface("0x49064906", atState),
    nft.contractURI(atState),
    nft.royaltyInfo(1, 10_000, atState),
    renderer.RENDERER_VERSION(atState),
    renderer.METADATA(atState),
    renderer.CORE_PLATE(atState),
    renderer.GENESIS_PLATE(atState),
    renderer.COLLECTION_ART(atState),
    renderer.collectionURI(nftAddress, atState),
    account.initialized(atState),
    metadata.METADATA_VERSION(atState),
    securityPrint.SECURITY_PRINT_VERSION(atState),
    corePlate.CORE_PLATE_VERSION(atState),
    genesisPlate.GENESIS_PLATE_VERSION(atState),
    corePlate.SECURITY_PRINT(atState),
  ]);

  sameAddress(ethers, "NFT Engine", engine, production.engine);
  sameAddress(ethers, "NFT NARA", nara, production.token);
  sameAddress(ethers, "NFT account", accountImplementation, addresses.NARAPositionAccountV4);
  sameAddress(ethers, "NFT renderer", rendererBinding, addresses.NARAPositionRendererV5);
  sameAddress(ethers, "NFT owner", owner, production.safe);
  sameAddress(ethers, "NFT pending owner", pendingOwner, ethers.ZeroAddress);
  sameAddress(ethers, "Genesis distributor", genesisDistributor, ethers.ZeroAddress);
  sameAddress(ethers, "claim fee recipient", claimFeeRecipient, ethers.ZeroAddress);
  sameAddress(ethers, "renderer metadata", rendererMetadata, addresses.NARAArtMetadataV1);
  sameAddress(ethers, "renderer core", rendererCore, addresses.NARAArtCorePlateV1);
  sameAddress(ethers, "renderer Genesis", rendererGenesis, addresses.NARAArtGenesisPlateV1);
  sameAddress(ethers, "renderer collection", rendererCollection, addresses.NARAArtSecurityPrintV1);
  sameAddress(ethers, "core security print", coreSecurityPrint, addresses.NARAArtSecurityPrintV1);
  const collection = decodeJsonDataUri("direct renderer collectionURI", String(rendererCollectionUri));
  const collectionImage = String(collection.image ?? "");
  if (
    String(contractUri) !== String(rendererCollectionUri) ||
    collection.name !== "NARA Positions" ||
    !collectionImage.startsWith("data:image/svg+xml;base64,") ||
    !Buffer.from(collectionImage.slice("data:image/svg+xml;base64,".length), "base64").toString("utf8").includes("<svg") ||
    genesisMintersFrozen ||
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
    ethers.getAddress(royaltyInfo[0]) !== ethers.getAddress(production.treasury) ||
    royaltyInfo[1] !== BigInt(canonicalPolicy.royaltyBps)
  ) {
    throw new Error("Pinned Position NFT/module/collection state differs from the Phase-2 policy");
  }
  if (finalized ? (!royaltyFrozen || !claimFeesFrozen) : (royaltyFrozen || claimFeesFrozen)) {
    throw new Error(finalized ? "Safe fee finalization is incomplete" : "Pending manifest no longer has the expected unfinalized state");
  }

  const nftReceiptBlock = requireInteger(contracts.NARAPositionNFTV4.receipt.blockNumber, "NFT receipt block");
  const genesisMinterEvent = nft.interface.getEvent("GenesisMinterSet");
  const positionMintedEvent = nft.interface.getEvent("PositionMinted");
  if (!genesisMinterEvent || !positionMintedEvent) throw new Error("Required NFT event is absent from the reviewed ABI");
  const [genesisMinterLogs, positionMintedLogs] = await Promise.all([
    logsInChunks(ethers.provider, nftAddress, genesisMinterEvent.topicHash, nftReceiptBlock, stateBlockNumber),
    logsInChunks(ethers.provider, nftAddress, positionMintedEvent.topicHash, nftReceiptBlock, stateBlockNumber),
  ]);
  if (genesisMinterLogs.length !== 0) throw new Error("GenesisMinterSet history is non-zero during Phase 2");
  const observedPositionMints = positionMintedLogs.map((log, index) => {
    const parsed = nft.interface.parseLog(log);
    if (!parsed || BigInt(parsed.args.tokenId) !== BigInt(index + 1)) {
      throw new Error("PositionMinted history is missing or non-sequential");
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
  if (nextTokenId !== BigInt(positionMintedLogs.length + 1)) {
    throw new Error("nextTokenId does not reconcile with all PositionMinted events");
  }

  const expectedPolicy = {
    ...canonicalPolicy,
    royaltiesFrozen: finalized,
    claimFeesFrozen: finalized,
    finalizationRequired: !finalized,
    genesisRewardDistributor: ethers.ZeroAddress,
    genesisMintersFrozen: false,
  };
  if (canonicalJson(manifest.policy) !== canonicalJson(expectedPolicy)) {
    throw new Error("Manifest policy claims differ from the reconstructed Phase-2 policy/state");
  }
  const expectedReadback: JsonObject = {
    name,
    symbol,
    nextTokenId: nextTokenId.toString(),
    rendererVersion: rendererVersion.toString(),
    supportsErc721,
    supportsErc2981,
    supportsErc4906,
    collectionMetadataOnchain: true,
    collectionName: collection.name,
    collectionImageSha256: sha256(collectionImage),
    accountImplementationInitialized: implementationInitialized,
    genesisMinterEventCount: genesisMinterLogs.length,
  };
  if (finalized) {
    expectedReadback.finalReadbackBlock = stateBlockNumber;
    expectedReadback.finalReadbackBlockHash = stateBlockHash;
  }
  if (canonicalJson(manifest.readback) !== canonicalJson(expectedReadback)) {
    throw new Error("Manifest readback claims differ from the pinned reconstructed NFT/module state");
  }
  const expectedPublicMintSurface = {
    permissionlessFromBlock: nftReceiptBlock,
    observedThroughBlock: stateBlockNumber,
    observedMintCount: observedPositionMints.length,
    nextTokenId: nextTokenId.toString(),
    mints: observedPositionMints,
  };
  if (canonicalJson(manifest.publicMintSurface) !== canonicalJson(expectedPublicMintSurface)) {
    throw new Error("Manifest public-mint surface/history differs from canonical PositionMinted logs");
  }

  const safeFinalization = requireObject(manifest.safeFinalization, "safeFinalization");
  const rebuiltBatch = buildPositionNftPhase2FinalizationBatch(
    production.safe,
    nftAddress,
    production.treasury,
    {
      deploymentMode: manifest.mode,
      verificationBlock: initialVerificationBlock,
      verificationBlockHash: initialVerificationHash,
      releaseCommit,
    },
    Number(initialBlock.timestamp) * 1_000,
  );
  if (
    canonicalJson(rebuiltBatch) !== canonicalJson(safeFinalization.batch) ||
    canonicalJson(safeFinalization.calls) !== canonicalJson(POSITION_NFT_PHASE2_FINALIZATION_CALLS) ||
    sha256(prettyJson(rebuiltBatch)) !== requireString(safeFinalization, "batchSha256")
  ) {
    throw new Error("Embedded Safe finalization batch/hash/call order differs from the canonical five-call reset+freeze plan");
  }
  const expectedRequiredPostState = {
    owner: ethers.getAddress(production.safe),
    pendingOwner: ethers.ZeroAddress,
    royaltyReceiver: ethers.getAddress(production.treasury),
    royaltyBps: canonicalPolicy.royaltyBps,
    royaltiesFrozen: true,
    naraClaimFeeBps: 0,
    tokenClaimFeeBps: 0,
    claimFeeRecipient: ethers.ZeroAddress,
    claimFeesFrozen: true,
    genesisMintersFrozen: false,
  };
  if (canonicalJson(safeFinalization.requiredPostState) !== canonicalJson(expectedRequiredPostState)) {
    throw new Error("Safe finalization required post-state claim differs from canonical royalty/claim-fee policy");
  }
  const deploymentWindowSafeSnapshot = await readCanonicalNaraSafeEvidence(
    ethers.provider,
    production.safe,
    production.safeCodeHash,
    initialVerificationBlock,
  );
  if (
    canonicalJson(deploymentWindowSafeSnapshot) !== canonicalJson(safeFinalization.safeSnapshot) ||
    BigInt(deploymentWindowSafeSnapshot.nonce) !== BigInt(replayedSafePreflight.nonce)
  ) {
    throw new Error("Safe snapshot/nonce changed during the seven-contract deployment window");
  }
  if (!finalized) {
    if (
      safeFinalization.status !== "unexecuted" ||
      canonicalJson(manifest.sourceVerification) !== canonicalJson({
        status: "pending",
        requiredContracts: POSITION_NFT_PHASE2_CONTRACTS,
      })
    ) {
      throw new Error("Pending Safe/source verification state is not fail-closed");
    }
    const batchArtifact = requireObject(safeFinalization.batchArtifact, "safeFinalization.batchArtifact");
    const expectedRehearsalBatchPath = new RegExp(
      `^deployments/REHEARSAL-DO-NOT-IMPORT-v4-position-nft-phase2-finalization-${initialVerificationBlock}-\\d{13}\\.json$`,
    );
    if (allowRehearsal) {
      const batchRelativePath = requireString(batchArtifact, "path", "safeFinalization.batchArtifact.path")
        .replace(/\\/g, "/");
      if (!expectedRehearsalBatchPath.test(batchRelativePath)) {
        throw new Error("Rehearsal Safe batch is not the exact REHEARSAL-DO-NOT-IMPORT artifact");
      }
      if (
        canonicalJson(batchArtifact) !==
          canonicalJson(canonicalPositionNftPhase2RehearsalBatchArtifact(batchRelativePath))
      ) {
        throw new Error("Rehearsal Safe batch artifact metadata is not canonical");
      }
      const batchPath = resolve(batchRelativePath);
      if (!existsSync(batchPath)) throw new Error("Same-process rehearsal Safe batch evidence is missing");
      if (sha256(readFileSync(batchPath)) !== safeFinalization.batchSha256) {
        throw new Error("Rehearsal Safe batch file is hash-mismatched");
      }
    } else if (
      canonicalJson(batchArtifact) !== canonicalJson(POSITION_NFT_PHASE2_PENDING_BATCH_ARTIFACT) ||
      Object.prototype.hasOwnProperty.call(safeFinalization, "batchPath")
    ) {
      throw new Error("Pending production batch must remain embedded-only until all-seven source verification passes");
    }
    const simulatedPlan = await buildAndSimulateSafeBatch(
      ethers.provider,
      production.safe,
      BigInt(deploymentWindowSafeSnapshot.nonce),
      rebuiltBatch.transactions,
      initialVerificationBlock,
    );
    if (canonicalJson(simulatedPlan) !== canonicalJson(safeFinalization.safeBatchPlan)) {
      throw new Error("Safe atomic MultiSend simulation/transaction hash does not reproduce");
    }
  } else {
    if (safeFinalization.status !== "executed_verified") {
      throw new Error("Final manifest does not mark the Safe batch executed and verified");
    }
    const signingPacket = requireObject(finalization?.signingPacket, "finalization.signingPacket");
    const signingPacketPath = requireString(finalization as JsonObject, "signingPacketPath");
    const signingPacketSha256 = requireString(finalization as JsonObject, "signingPacketSha256");
    if (
      !/^deployments\/UNEXECUTED-v4-position-nft-phase2-signing-packet-\d+-nonce-\d+\.json$/.test(signingPacketPath) ||
      signingPacket.packetPath !== signingPacketPath ||
      sha256(prettyJson(signingPacket)) !== signingPacketSha256 ||
      signingPacket.packetType !== "nara_v4_position_nft_phase2_safe_signing_packet" ||
      signingPacket.evidenceState !== "unexecuted_safe_signing_packet" ||
      signingPacket.execution?.status !== "UNEXECUTED" ||
      signingPacket.supersedes?.pendingManifestPath !== PENDING_MANIFEST ||
      String(signingPacket.supersedes?.pendingManifestSha256).toLowerCase() !== pendingManifestSha256 ||
      String(signingPacket.release?.sourceCommit).toLowerCase() !== sourceCommit ||
      String(signingPacket.release?.evidenceCommit).toLowerCase() !== releaseCommit ||
      canonicalJson(signingPacket.exactCalls) !== canonicalJson(POSITION_NFT_PHASE2_FINALIZATION_CALLS) ||
      canonicalJson(signingPacket.batch) !== canonicalJson(rebuiltBatch) ||
      signingPacket.batchSha256 !== safeFinalization.batchSha256
    ) {
      throw new Error("Embedded signing packet/path/hash/release/batch evidence is inconsistent");
    }
    if (existsSync(signingPacketPath) && sha256(readFileSync(signingPacketPath)) !== signingPacketSha256) {
      throw new Error("Present signing-packet artifact differs from the embedded immutable packet");
    }
    const signingBlockNumber = requireInteger(signingPacket.verifiedAtBlock, "signingPacket.verifiedAtBlock");
    if (signingBlockNumber < initialVerificationBlock) {
      throw new Error("Signing packet predates deployment verification evidence");
    }
    const signingBlockHash = requireString(signingPacket, "verifiedAtBlockHash", "signingPacket.verifiedAtBlockHash");
    const signingBlockEvidence = await canonicalBlock(
      ethers.provider,
      signingBlockNumber,
      signingBlockHash,
      "signing packet",
    );
    const phase2RuntimeEntries = await Promise.all(POSITION_NFT_PHASE2_CONTRACTS.map(async (name) => {
      const address = ethers.getAddress(requireString(contracts[name], "address", `contracts.${name}.address`));
      const runtimeEntry = requireObject(runtime[name], `runtimeCode.${name}`);
      sameAddress(ethers, `${name} runtime address`, requireString(runtimeEntry, "address"), address);
      const code = await ethers.provider.getCode(address, signingBlockNumber);
      if (code === "0x") throw new Error(`${name} has no runtime code at the signing block`);
      const codeHash = ethers.keccak256(code).toLowerCase();
      const codeSizeBytes = (code.length - 2) / 2;
      if (
        codeHash !== requireString(runtimeEntry, "codeHash").toLowerCase() ||
        codeSizeBytes !== requireInteger(runtimeEntry.codeSizeBytes, `${name} runtime size`)
      ) {
        throw new Error(`${name} signing-block runtime differs from the pending manifest`);
      }
      return [name, { address, codeHash, codeSizeBytes }] as const;
    }));
    const signingPhase2Runtime = Object.fromEntries(phase2RuntimeEntries);
    const signingProductionRuntime = await pinnedProductionRuntimeEvidence(ethers, production, signingBlockNumber);
    const [signingSnapshot, signingCoreContainment] = await Promise.all([
      readCanonicalNaraSafeEvidence(
        ethers.provider,
        production.safe,
        production.safeCodeHash,
        signingBlockNumber,
      ),
      readRewardNotifierContainmentEvidence(ethers.provider, production, signingBlockNumber),
    ]);
    if (canonicalJson(signingSnapshot) !== canonicalJson(signingPacket.safeSnapshot)) {
      throw new Error("Just-in-time Safe signing snapshot does not reproduce");
    }
    if (canonicalJson(signingCoreContainment) !== canonicalJson(signingPacket.coreContainment)) {
      throw new Error("Just-in-time reward-notifier containment snapshot does not reproduce");
    }
    assertRewardNotifierHistoryUnchanged(
      replayedCoreContainment,
      signingCoreContainment,
      "Just-in-time signing snapshot",
    );
    if (signingSnapshot.nonce !== String(safeFinalization.safeSnapshot?.nonce)) {
      throw new Error("Safe nonce changed between deployment and just-in-time finalization planning");
    }
    const signingPlan = await buildAndSimulateSafeBatch(
      ethers.provider,
      production.safe,
      BigInt(signingSnapshot.nonce),
      rebuiltBatch.transactions,
      signingSnapshot.verifiedAtBlock,
    );
    if (canonicalJson(signingPlan) !== canonicalJson(signingPacket.safeBatchPlan)) {
      throw new Error("Just-in-time Safe batch plan/simulation does not reproduce");
    }
    if (
      signingPlan.safeTxHash.toLowerCase() !== String(signingPacket.safeTxHash).toLowerCase() ||
      signingPlan.safeTransaction.nonce !== signingSnapshot.nonce
    ) {
      throw new Error("Signing packet Safe transaction hash/nonce is inconsistent");
    }
    const atSigningBlock = { blockTag: signingBlockNumber };
    const [signingCode, signingEngine, signingNara, signingAccountImplementation, signingRenderer,
      signingOwner, signingPendingOwner, signingRoyaltyFrozen, signingRoyaltyInfo, signingNaraFee,
      signingTokenFee, signingRecipient, signingClaimFrozen, signingGenesisDistributor,
      signingGenesisFrozen, signingNextTokenId] = await Promise.all([
      ethers.provider.getCode(nftAddress, signingBlockNumber),
      nft.engine(atSigningBlock),
      nft.nara(atSigningBlock),
      nft.accountImplementation(atSigningBlock),
      nft.renderer(atSigningBlock),
      nft.owner(atSigningBlock),
      nft.pendingOwner(atSigningBlock),
      nft.royaltyFrozen(atSigningBlock),
      nft.royaltyInfo(1, 10_000, atSigningBlock),
      nft.naraClaimFeeBps(atSigningBlock),
      nft.tokenClaimFeeBps(atSigningBlock),
      nft.claimFeeRecipient(atSigningBlock),
      nft.claimFeesFrozen(atSigningBlock),
      nft.genesisRewardDistributor(atSigningBlock),
      nft.genesisMintersFrozen(atSigningBlock),
      nft.nextTokenId(atSigningBlock),
    ]);
    if (
      signingCode === "0x" ||
      ethers.keccak256(signingCode).toLowerCase() !== runtime.NARAPositionNFTV4.codeHash.toLowerCase() ||
      ethers.getAddress(signingEngine) !== ethers.getAddress(production.engine) ||
      ethers.getAddress(signingNara) !== ethers.getAddress(production.token) ||
      ethers.getAddress(signingAccountImplementation) !==
        ethers.getAddress(requireString(contracts.NARAPositionAccountV4, "address")) ||
      ethers.getAddress(signingRenderer) !==
        ethers.getAddress(requireString(contracts.NARAPositionRendererV5, "address")) ||
      ethers.getAddress(signingOwner) !== ethers.getAddress(production.safe) ||
      ethers.getAddress(signingPendingOwner) !== ethers.ZeroAddress ||
      signingRoyaltyFrozen ||
      ethers.getAddress(signingRoyaltyInfo[0]) !== ethers.getAddress(production.treasury) ||
      signingRoyaltyInfo[1] !== BigInt(canonicalPolicy.royaltyBps) ||
      signingNaraFee !== 0n ||
      signingTokenFee !== 0n ||
      ethers.getAddress(signingRecipient) !== ethers.ZeroAddress ||
      signingClaimFrozen ||
      ethers.getAddress(signingGenesisDistributor) !== ethers.ZeroAddress ||
      signingGenesisFrozen
    ) {
      throw new Error("NFT was not in the exact 10%-treasury royalty / zero-claim-fee state at the signing block");
    }
    const [signingGenesisLogs, signingMintedLogs] = await Promise.all([
      logsInChunks(
        ethers.provider,
        nftAddress,
        genesisMinterEvent.topicHash,
        nftReceiptBlock,
        signingBlockNumber,
      ),
      logsInChunks(
        ethers.provider,
        nftAddress,
        positionMintedEvent.topicHash,
        nftReceiptBlock,
        signingBlockNumber,
      ),
    ]);
    if (signingGenesisLogs.length !== 0) throw new Error("GenesisMinterSet history was non-zero at signing");
    const signingPositionMints = signingMintedLogs.map((log, index) => {
      const parsed = nft.interface.parseLog(log);
      if (!parsed || BigInt(parsed.args.tokenId) !== BigInt(index + 1)) {
        throw new Error("Signing-block PositionMinted history is missing, duplicated, or non-sequential");
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
    if (signingNextTokenId !== BigInt(signingPositionMints.length + 1)) {
      throw new Error("Signing-block nextTokenId does not reconcile with complete mint history");
    }
    const safeExecution = await decodeAndVerifySafeExecution(
      ethers.provider,
      production.safe,
      requireString(finalization as JsonObject, "safeExecutionTransactionHash"),
      rebuiltBatch.transactions,
      signingPlan,
    );
    if (canonicalJson(safeExecution) !== canonicalJson(finalization?.safeExecution)) {
      throw new Error("Final Safe execution evidence does not reproduce from Base");
    }
    const executionBlockNumber = safeExecution.transactionReceipt.blockNumber;
    if (
      executionBlockNumber <= signingBlockNumber ||
      stateBlockNumber < executionBlockNumber
    ) {
      throw new Error("Deployment/signing/execution/readback block order is invalid");
    }
    const safeAfterExecution = await readCanonicalNaraSafeEvidence(
      ethers.provider,
      production.safe,
      production.safeCodeHash,
      executionBlockNumber,
    );
    if (
      canonicalJson(safeAfterExecution) !== canonicalJson(finalization?.safeAfterExecution) ||
      BigInt(safeAfterExecution.nonce) !== BigInt(signingSnapshot.nonce) + 1n
    ) {
      throw new Error("Safe configuration/nonce after finalization does not reproduce");
    }
    if (
      safeFinalization.signingPacketPath !== signingPacketPath ||
      safeFinalization.signingPacketSha256 !== signingPacketSha256 ||
      safeFinalization.safeExecutionTransactionHash?.toLowerCase() !==
        safeExecution.transactionReceipt.transactionHash.toLowerCase() ||
      canonicalJson(safeFinalization.safeExecution) !== canonicalJson(safeExecution)
    ) {
      throw new Error("Safe finalization summary differs from the canonical signing/execution evidence");
    }
    const finalizationReceipt = await ethers.provider.getTransactionReceipt(safeExecution.transactionReceipt.transactionHash);
    if (!finalizationReceipt) throw new Error("Safe finalization receipt disappeared");
    const finalizationEvents: Record<string, unknown> = {};
    for (const eventName of ["ClaimFeesSet", "ClaimFeeRecipientSet", "RoyaltiesFrozen", "ClaimFeesFrozen"]) {
      const fragment = nft.interface.getEvent(eventName);
      if (!fragment) throw new Error(`${eventName} is absent from the reviewed NFT ABI`);
      const logs = finalizationReceipt.logs.filter(
        (log: any) => ethers.getAddress(log.address) === nftAddress &&
          log.topics[0]?.toLowerCase() === fragment.topicHash.toLowerCase(),
      );
      if (logs.length !== 1) throw new Error(`Safe receipt lacks exactly one ${eventName} event`);
      const parsed = nft.interface.parseLog(logs[0]);
      if (!parsed) throw new Error(`Could not decode ${eventName}`);
      finalizationEvents[eventName] = {
        transactionHash: logs[0].transactionHash,
        blockNumber: logs[0].blockNumber,
        blockHash: logs[0].blockHash,
        logIndex: logs[0].index,
        args: parsed.args.toObject(),
      };
    }
    const claimFeesSet = requireObject((finalizationEvents.ClaimFeesSet as JsonObject).args, "ClaimFeesSet args");
    const claimRecipientSet = requireObject(
      (finalizationEvents.ClaimFeeRecipientSet as JsonObject).args,
      "ClaimFeeRecipientSet args",
    );
    if (
      BigInt(claimFeesSet.naraClaimFeeBps) !== 0n ||
      BigInt(claimFeesSet.tokenClaimFeeBps) !== 0n ||
      ethers.getAddress(claimRecipientSet.recipient) !== ethers.ZeroAddress ||
      canonicalJson(finalizationEvents) !== canonicalJson(finalization?.finalizationEvents)
    ) {
      throw new Error("Safe receipt claim-fee reset/freeze events differ from the canonical finalization evidence");
    }
    const expectedFinalPostState = {
      owner: ethers.getAddress(owner),
      pendingOwner: ethers.getAddress(pendingOwner),
      royaltyReceiver: ethers.getAddress(royaltyInfo[0]),
      royaltyAmountForTenThousand: royaltyInfo[1].toString(),
      royaltiesFrozen: royaltyFrozen,
      naraClaimFeeBps: naraClaimFeeBps.toString(),
      tokenClaimFeeBps: tokenClaimFeeBps.toString(),
      claimFeeRecipient: ethers.getAddress(claimFeeRecipient),
      claimFeesFrozen,
      genesisRewardDistributor: ethers.getAddress(genesisDistributor),
      genesisMintersFrozen,
      genesisMinterEventCount: genesisMinterLogs.length,
      positionMintedEventCount: observedPositionMints.length,
      nextTokenId: nextTokenId.toString(),
    };
    if (canonicalJson(finalization?.postState) !== canonicalJson(expectedFinalPostState)) {
      throw new Error("Finalization post-state evidence differs from the pinned reconstructed state");
    }
    if (canonicalJson(finalization?.coreContainment) !== canonicalJson(stateCoreContainment)) {
      throw new Error("Finalization reward-notifier containment evidence differs from the pinned state");
    }
    if (!pendingManifest || !pendingManifestSha256 || !sourceCommit || !releaseCommit) {
      throw new Error("Final source verification lacks pending/release provenance");
    }
    const sourceVerification = requireObject(manifest.sourceVerification, "sourceVerification");
    const sourceVerificationArtifact = requireObject(
      manifest.sourceVerificationArtifact,
      "sourceVerificationArtifact",
    );
    const sourceVerificationPath = requireString(sourceVerificationArtifact, "path");
    if (
      sourceVerificationPath !== "deployments/v4-position-nft-phase2-source-verification-2026-08-21.json" ||
      !existsSync(sourceVerificationPath) ||
      normalizedTextFileSha256(sourceVerificationPath) !== requireString(sourceVerificationArtifact, "sha256") ||
      canonicalJson(JSON.parse(readFileSync(sourceVerificationPath, "utf8"))) !== canonicalJson(sourceVerification)
    ) {
      throw new Error("Standalone source-verification evidence is missing, hash-mismatched, or differs from the final manifest");
    }
    const validatedSourceVerification = await assertPositionNftSourceVerificationEvidence(sourceVerification, {
      sourceCommit,
      evidenceCommit: releaseCommit,
      pendingManifestPath: PENDING_MANIFEST,
      pendingManifestSha256,
      contracts,
      sourceArtifacts,
      artifacts: hre.artifacts,
    });
    if (
      canonicalJson(signingPacket.sourceVerification) !== canonicalJson(validatedSourceVerification) ||
      signingPacket.sourceVerificationArtifact?.path !== sourceVerificationPath ||
      signingPacket.sourceVerificationArtifact?.sha256 !== requireString(sourceVerificationArtifact, "sha256")
    ) {
      throw new Error("Safe signing packet is not bound to the exact finalized source-verification evidence");
    }
    const baseScanApiKey = process.env.BASESCAN_API_KEY?.trim() ?? "";
    if (baseScanApiKey === "") throw new Error("BASESCAN_API_KEY is required to re-confirm final source verification");
    for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
      const recorded = validatedSourceVerification.contracts[name];
      const live = await queryBaseScanSourceProof(baseScanApiKey, recorded.address);
      for (const [key, value] of Object.entries(live)) {
        if (canonicalJson(recorded[key as keyof typeof recorded]) !== canonicalJson(value)) {
          throw new Error(`${name} live BaseScan proof differs from the finalized source-verification evidence`);
        }
      }
    }
    const freshnessClaim = requireObject(signingPacket.freshnessCheck, "signingPacket.freshnessCheck");
    const freshnessBlockNumber = requireInteger(
      freshnessClaim.verifiedAtBlock,
      "signingPacket.freshnessCheck.verifiedAtBlock",
    );
    const freshnessBlockHash = requireString(
      freshnessClaim,
      "verifiedAtBlockHash",
      "signingPacket.freshnessCheck.verifiedAtBlockHash",
    );
    if (freshnessBlockNumber < signingBlockNumber || freshnessBlockNumber >= executionBlockNumber) {
      throw new Error("Signing-packet freshness block is outside the signing-to-execution window");
    }
    await canonicalBlock(ethers.provider, freshnessBlockNumber, freshnessBlockHash, "signing-packet freshness");
    const freshnessSafeSnapshot = await readCanonicalNaraSafeEvidence(
      ethers.provider,
      production.safe,
      production.safeCodeHash,
      freshnessBlockNumber,
    );
    if (freshnessSafeSnapshot.nonce !== signingSnapshot.nonce) {
      throw new Error("Safe nonce changed between signing snapshot and packet freshness evidence");
    }
    const signingTimestamp = Number(signingBlockEvidence.timestamp);
    if (!Number.isSafeInteger(signingTimestamp) || signingTimestamp <= 0) {
      throw new Error("Signing block timestamp is invalid");
    }
    const expectedSigningBatchPath =
      `deployments/UNEXECUTED-v4-position-nft-phase2-safe-batch-${signingBlockNumber}` +
      `-nonce-${signingSnapshot.nonce}.json`;
    const expectedSigningPacket = canonicalPositionNftPhase2SigningPacket({
      createdAt: new Date(signingTimestamp * 1_000).toISOString(),
      packetPath: signingPacketPath,
      pendingManifestPath: PENDING_MANIFEST,
      pendingManifestSha256,
      sourceCommit,
      evidenceCommit: releaseCommit,
      releaseCommit,
      sourceVerification: validatedSourceVerification,
      sourceVerificationArtifact: {
        path: sourceVerificationPath,
        sha256: requireString(sourceVerificationArtifact, "sha256"),
      },
      signingBlockNumber,
      signingBlockHash,
      signingBlockTimestamp: signingTimestamp,
      productionRuntime: {
        changeId: production.changeId,
        manifestPath: PRODUCTION_CORE_MANIFEST,
        manifestSha256: production.manifestSha256,
        originCommit: production.originCommit,
        verifiedAtBlock: signingBlockNumber,
        verifiedAtBlockHash: signingBlockHash,
        contracts: signingProductionRuntime,
      },
      coreContainment: signingCoreContainment,
      positionNftPhase2Runtime: {
        verifiedAtBlock: signingBlockNumber,
        verifiedAtBlockHash: signingBlockHash,
        contracts: signingPhase2Runtime,
      },
      safeSnapshot: signingSnapshot,
      positionNft: {
        address: nftAddress,
        startBlock: nftReceiptBlock,
        runtimeCodeHash: signingPhase2Runtime.NARAPositionNFTV4.codeHash,
        verifiedAtBlock: signingBlockNumber,
        verifiedAtBlockHash: signingBlockHash,
        engine: ethers.getAddress(signingEngine),
        nara: ethers.getAddress(signingNara),
        accountImplementation: ethers.getAddress(signingAccountImplementation),
        renderer: ethers.getAddress(signingRenderer),
        owner: ethers.getAddress(signingOwner),
        pendingOwner: ethers.getAddress(signingPendingOwner),
        royaltyReceiver: ethers.getAddress(signingRoyaltyInfo[0]),
        royaltyAmountForTenThousand: signingRoyaltyInfo[1].toString(),
        royaltiesFrozen: signingRoyaltyFrozen,
        naraClaimFeeBps: signingNaraFee.toString(),
        tokenClaimFeeBps: signingTokenFee.toString(),
        claimFeeRecipient: ethers.getAddress(signingRecipient),
        claimFeesFrozen: signingClaimFrozen,
        genesisRewardDistributor: ethers.getAddress(signingGenesisDistributor),
        genesisMintersFrozen: signingGenesisFrozen,
        genesisMinterEventCount: signingGenesisLogs.length,
        positionMintedEventCount: signingPositionMints.length,
        positionMintedHistorySha256: sha256(canonicalJson(signingPositionMints)),
        positionMints: signingPositionMints,
        nextTokenId: signingNextTokenId.toString(),
      },
      batch: rebuiltBatch,
      batchSha256: safeFinalization.batchSha256,
      signingBatchPath: expectedSigningBatchPath,
      safeTxHash: signingPlan.safeTxHash,
      safeBatchPlan: signingPlan,
      freshnessCheck: {
        verifiedAtBlock: freshnessSafeSnapshot.verifiedAtBlock,
        verifiedAtBlockHash: freshnessSafeSnapshot.verifiedAtBlockHash,
        safeNonce: freshnessSafeSnapshot.nonce,
        matchesSigningNonce: true,
      },
    });
    if (canonicalJson(signingPacket) !== canonicalJson(expectedSigningPacket)) {
      throw new Error("Signing packet contains missing, extra, or non-reproducible evidence fields");
    }
    const currentBlock = await ethers.provider.getBlock("latest");
    if (!currentBlock?.hash || /^0x0{64}$/i.test(currentBlock.hash) || currentBlock.number < stateBlockNumber) {
      throw new Error("Could not pin current Base state after the finalized readback");
    }
    const currentBlockNumber = Number(currentBlock.number);
    await readCanonicalNaraSafeEvidence(
      ethers.provider,
      production.safe,
      production.safeCodeHash,
      currentBlockNumber,
    );
    const currentCoreContainment = await readRewardNotifierContainmentEvidence(
      ethers.provider,
      production,
      currentBlockNumber,
    );
    assertRewardNotifierHistoryUnchanged(
      replayedCoreContainment,
      currentCoreContainment,
      "Current finalized state",
    );
    const atCurrentBlock = { blockTag: currentBlockNumber };
    const [currentCode, currentOwner, currentPendingOwner, currentRoyaltyFrozen, currentRoyaltyInfo,
      currentNaraFee, currentTokenFee, currentRecipient, currentClaimFrozen, currentGenesisDistributor,
      currentGenesisFrozen] = await Promise.all([
      ethers.provider.getCode(nftAddress, currentBlockNumber),
      nft.owner(atCurrentBlock),
      nft.pendingOwner(atCurrentBlock),
      nft.royaltyFrozen(atCurrentBlock),
      nft.royaltyInfo(1, 10_000, atCurrentBlock),
      nft.naraClaimFeeBps(atCurrentBlock),
      nft.tokenClaimFeeBps(atCurrentBlock),
      nft.claimFeeRecipient(atCurrentBlock),
      nft.claimFeesFrozen(atCurrentBlock),
      nft.genesisRewardDistributor(atCurrentBlock),
      nft.genesisMintersFrozen(atCurrentBlock),
    ]);
    if (
      currentCode === "0x" ||
      ethers.keccak256(currentCode).toLowerCase() !== runtime.NARAPositionNFTV4.codeHash.toLowerCase() ||
      ethers.getAddress(currentOwner) !== ethers.getAddress(production.safe) ||
      ethers.getAddress(currentPendingOwner) !== ethers.ZeroAddress ||
      !currentRoyaltyFrozen ||
      ethers.getAddress(currentRoyaltyInfo[0]) !== ethers.getAddress(production.treasury) ||
      currentRoyaltyInfo[1] !== BigInt(canonicalPolicy.royaltyBps) ||
      currentNaraFee !== 0n ||
      currentTokenFee !== 0n ||
      ethers.getAddress(currentRecipient) !== ethers.ZeroAddress ||
      !currentClaimFrozen ||
      ethers.getAddress(currentGenesisDistributor) !== ethers.ZeroAddress ||
      currentGenesisFrozen
    ) {
      throw new Error("Current NFT/Safe state has drifted from the finalized Phase-2 policy");
    }
    if (currentBlockNumber > stateBlockNumber) {
      const postFinalGenesisLogs = await logsInChunks(
        ethers.provider,
        nftAddress,
        genesisMinterEvent.topicHash,
        stateBlockNumber + 1,
        currentBlockNumber,
      );
      if (postFinalGenesisLogs.length !== 0) {
        throw new Error("GenesisMinterSet occurred after the finalized readback");
      }
    }
  }

  if (canonicalJson(manifest.smokeEvidence) !== canonicalJson({
    liveMintTransferClaimUnlock: "not_performed",
    reason: "Value-bearing smoke transactions require a separate reviewed user action after Safe finalization.",
  })) {
    throw new Error("Manifest smoke-evidence state must remain explicit and fail-closed");
  }

  console.log(JSON.stringify({
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    manifest: manifestPath,
    mode: manifest.mode,
    evidenceState: manifest.evidenceState,
    positionNft: nftAddress,
    positionNftStartBlock: nftReceiptBlock,
    verifiedStateBlock: stateBlockNumber,
    owner: ethers.getAddress(owner),
    royaltiesFrozen: royaltyFrozen,
    claimFeesFrozen,
    genesisMinterEvents: genesisMinterLogs.length,
    publicMintsObserved: positionMintedLogs.length,
    nextTokenId: nextTokenId.toString(),
    sourceVerification: manifest.sourceVerification?.status ?? "pending",
    rewardNotifierHolders: stateCoreContainment.onchainActiveHolders.length,
    integrationReady: false,
  }, null, 2));
}

await main().catch((error) => {
  console.error(sanitizedError(error));
  process.exitCode = 1;
});
