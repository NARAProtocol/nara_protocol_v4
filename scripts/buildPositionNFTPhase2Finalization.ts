/**
 * Build a read-only, just-in-time Safe signing packet for the NARA v4 Position NFT
 * Phase-2 fixed-royalty / zero-claim-fee finalization.
 *
 * This script deliberately has no signer and never signs, sends, or executes a
 * transaction. It pins one latest Base block, verifies all relevant state at that
 * block, and uses Safe.simulateAndRevert through eth_call for the atomic batch.
 * The resulting packet is nonce-bound evidence for human Safe review and signing.
 */

import hre from "hardhat";
import { createHash } from "node:crypto";
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
import { fileURLToPath } from "node:url";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
  type ProductionV4Deployment,
} from "./lib/v4LiveConfig.js";
import { buildAndSimulateSafeBatch } from "./lib/v4SafeBatch.js";
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
} from "./lib/v4PositionNftPhase2.js";
import {
  assertPositionNftSourceVerificationEvidence,
  queryBaseScanSourceProof,
} from "./lib/v4PositionNftSourceVerification.js";
import { canonicalPositionNftPhase2SigningPacket } from "./lib/v4PositionNftSigningPacket.js";

type JsonObject = Record<string, any>;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const PENDING_MANIFEST_RELATIVE_PATH = "deployments/v4-position-nft-phase2-2026-08-21.json";
const PENDING_MANIFEST_PATH = resolve(REPOSITORY_ROOT, PENDING_MANIFEST_RELATIVE_PATH);
const SOURCE_EVIDENCE_RELATIVE_PATH =
  "deployments/v4-position-nft-phase2-source-verification-2026-08-21.json";
const SOURCE_EVIDENCE_PATH = resolve(REPOSITORY_ROOT, SOURCE_EVIDENCE_RELATIVE_PATH);
const PRODUCTION_CORE_MANIFEST_RELATIVE_PATH = "deployments/v4-production-activation-2026-08-09.json";
const POSITION_NFT_FQN = "contracts/v4/NARAPositionNFTV4.sol:NARAPositionNFTV4";
const EVENT_LOG_BLOCK_CHUNK = 2_000;
const JIT_ARTIFACT_PATTERN =
  /^(?:UNEXECUTED|PENDING-PACKET-LINK-DO-NOT-IMPORT)-v4-position-nft-phase2-/;

function refuseStaleJitArtifacts(): void {
  const deploymentDir = dirname(PENDING_MANIFEST_PATH);
  const stale = existsSync(deploymentDir)
    ? readdirSync(deploymentDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && JIT_ARTIFACT_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort()
    : [];
  if (stale.length !== 0) {
    throw new Error(
      "Stale or partial Position NFT JIT artifacts exist; reconcile them and run " +
      `npm run quarantine:v4:position-nft-incomplete-artifacts before rebuilding: ${stale.join(", ")}`,
    );
  }
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function requireString(object: JsonObject, key: string, label = key): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Manifest field ${label} is missing`);
  }
  return value;
}

function requireSafeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || String(parsed) !== String(value)) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function exactKeys(object: JsonObject, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(object).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} keys differ from the exact Position NFT Phase-2 contract set`);
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

function sameAddress(ethers: any, label: string, actual: string, expected: string): void {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

function repositoryRelativePath(absolutePath: string, label: string): string {
  const normalized = resolve(absolutePath);
  const repositoryRelative = relative(REPOSITORY_ROOT, normalized);
  if (
    repositoryRelative.length === 0 ||
    repositoryRelative === ".." ||
    repositoryRelative.startsWith(`..${sep}`) ||
    isAbsolute(repositoryRelative)
  ) {
    throw new Error(`${label} must remain inside the authoritative repository`);
  }
  return repositoryRelative.split(sep).join("/");
}

function resolveRepositoryPath(path: string, label: string): string {
  const absolutePath = isAbsolute(path) ? resolve(path) : resolve(REPOSITORY_ROOT, path);
  repositoryRelativePath(absolutePath, label);
  return absolutePath;
}

function durableWriteNew(path: string, contents: string): void {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  const descriptor = openSync(path, "wx");
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Position NFT signing-packet build failed";
  return message.replace(/https?:\/\/[^\s"']+/gi, "<redacted-url>");
}

async function canonicalBlock(provider: any, blockNumber: number, expectedHash: string, label: string): Promise<any> {
  const block = await provider.getBlock(blockNumber);
  if (
    !block?.hash ||
    /^0x0{64}$/i.test(block.hash) ||
    block.hash.toLowerCase() !== expectedHash.toLowerCase()
  ) {
    throw new Error(`${label} block/hash does not match canonical Base state`);
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
  const evidence: Record<string, { address: string; codeHash: string }> = {};
  for (const [index, [label, address]] of targets.entries()) {
    const code = codes[index];
    if (code === "0x") throw new Error(`Production ${label} has no runtime code at the pinned signing block`);
    const codeHash = ethers.keccak256(code).toLowerCase();
    if (codeHash !== production.runtimeCodeHashes[label].toLowerCase()) {
      throw new Error(`Production ${label} runtime hash differs from the canonical manifest at the signing block`);
    }
    evidence[label] = { address: ethers.getAddress(address), codeHash };
  }
  return evidence;
}

async function getEventLogsInChunks(
  provider: any,
  address: string,
  topic: string,
  fromBlock: number,
  toBlock: number,
): Promise<any[]> {
  const logs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += EVENT_LOG_BLOCK_CHUNK) {
    const end = Math.min(start + EVENT_LOG_BLOCK_CHUNK - 1, toBlock);
    logs.push(...await provider.getLogs({ address, fromBlock: start, toBlock: end, topics: [topic] }));
  }
  return logs;
}

async function main(): Promise<void> {
  refuseStaleJitArtifacts();
  if (!existsSync(PENDING_MANIFEST_PATH)) {
    throw new Error(`Canonical pending Position NFT manifest is missing: ${PENDING_MANIFEST_RELATIVE_PATH}`);
  }
  const pendingManifestBytes = readFileSync(PENDING_MANIFEST_PATH);
  const pendingManifestSha256 = sha256(pendingManifestBytes.toString("utf8").replace(/\r\n/g, "\n"));
  const manifest = requireObject(JSON.parse(pendingManifestBytes.toString("utf8")), "pending manifest");

  if (manifest.schemaVersion !== 1 || manifest.changeId !== POSITION_NFT_PHASE2_CHANGE_ID) {
    throw new Error("Unexpected Position NFT pending-manifest schema/change ID");
  }
  if (
    String(manifest.chainId) !== POSITION_NFT_PHASE2_CHAIN_ID.toString() ||
    manifest.mode !== "execute" ||
    manifest.network !== "base"
  ) {
    throw new Error("Signing-packet construction accepts only the production Base chain-8453 manifest");
  }
  if (
    manifest.evidenceState !== "deployed_pending_safe_finalization" ||
    manifest.integrationReady !== false ||
    manifest.onchainMinting !== "permissionless_from_position_nft_deployment"
  ) {
    throw new Error("Pending manifest is not in the exact fail-closed pre-finalization state");
  }
  if (Object.prototype.hasOwnProperty.call(manifest, "finalization")) {
    throw new Error("Pending manifest unexpectedly contains finalization evidence");
  }

  const release = requireObject(manifest.release, "release");
  const releaseCommit = requireString(release, "releaseCommit", "release.releaseCommit").toLowerCase();
  const sourceCommit = requireString(release, "sourceCommit", "release.sourceCommit").toLowerCase();
  const evidenceCommit = requireString(release, "evidenceCommit", "release.evidenceCommit").toLowerCase();
  if (
    !/^[0-9a-f]{40}$/.test(releaseCommit) ||
    !/^[0-9a-f]{40}$/.test(sourceCommit) ||
    evidenceCommit !== releaseCommit ||
    requireString(release, "headCommit").toLowerCase() !== releaseCommit ||
    requireString(release, "originMainCommit").toLowerCase() !== releaseCommit ||
    release.originRemote !== "NARAProtocol/nara_protocol_v4" ||
    release.cleanWorkingTree !== true ||
    release.exactProtectedMain !== true
  ) {
    throw new Error("Pending manifest is not bound to one exact clean protected-main release commit");
  }

  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const networkName = hre.globalOptions.network ?? "default";
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== POSITION_NFT_PHASE2_CHAIN_ID || networkName !== "base") {
    throw new Error("Signing-packet builder must run with --network base on chain 8453");
  }

  const production = await assertProductionV4Runtime(ethers.provider, currentV4Config());
  console.log(`Production runtime guard: ${productionV4RuntimeBanner(production)}`);
  const canonicalPolicy = canonicalPositionNftPhase2Policy(production.safe, production.treasury);

  const gateAttestation = assertPositionNftPhase2GateAttestation(
    release.gateAttestation,
    releaseCommit,
    production.safe,
    production.treasury,
  );
  if (
    gateAttestation.sourceCommit.toLowerCase() !== sourceCommit ||
    sha256(JSON.stringify(gateAttestation)) !== requireString(release, "gateAttestationSha256")
  ) {
    throw new Error("Embedded release-gate attestation differs from the pending manifest provenance");
  }

  const core = requireObject(manifest.coreDependency, "coreDependency");
  if (
    core.changeId !== production.changeId ||
    core.originCommit !== production.originCommit ||
    core.manifestPath !== PRODUCTION_CORE_MANIFEST_RELATIVE_PATH ||
    resolveRepositoryPath(core.manifestPath, "coreDependency.manifestPath") !== resolve(production.manifestPath) ||
    core.manifestSha256 !== production.manifestSha256
  ) {
    throw new Error("Position NFT core dependency differs from the canonical production manifest");
  }
  sameAddress(ethers, "core Engine", requireString(core, "engine"), production.engine);
  sameAddress(ethers, "core NARA", requireString(core, "token"), production.token);
  sameAddress(ethers, "owner Safe", requireString(manifest, "ownerSafe"), production.safe);

  const contracts = requireObject(manifest.contracts, "contracts");
  const runtime = requireObject(manifest.runtimeCode, "runtimeCode");
  const sourceArtifacts = requireObject(manifest.sourceArtifacts, "sourceArtifacts");
  exactKeys(contracts, POSITION_NFT_PHASE2_CONTRACTS, "contracts");
  exactKeys(runtime, POSITION_NFT_PHASE2_CONTRACTS, "runtimeCode");
  exactKeys(sourceArtifacts, POSITION_NFT_PHASE2_CONTRACTS, "sourceArtifacts");
  if (!existsSync(SOURCE_EVIDENCE_PATH)) {
    throw new Error(`Canonical seven-contract source evidence is missing: ${SOURCE_EVIDENCE_RELATIVE_PATH}`);
  }
  const sourceEvidenceBytes = readFileSync(SOURCE_EVIDENCE_PATH);
  const sourceEvidenceSha256 = sha256(sourceEvidenceBytes.toString("utf8").replace(/\r\n/g, "\n"));
  const sourceVerification = requireObject(
    JSON.parse(sourceEvidenceBytes.toString("utf8")),
    "source-verification evidence",
  );
  const validatedSourceVerification = await assertPositionNftSourceVerificationEvidence(sourceVerification, {
    sourceCommit,
    evidenceCommit,
    pendingManifestPath: PENDING_MANIFEST_RELATIVE_PATH,
    pendingManifestSha256,
    contracts,
    sourceArtifacts,
    artifacts: hre.artifacts,
  });
  const baseScanApiKey = process.env.BASESCAN_API_KEY?.trim() ?? "";
  if (baseScanApiKey === "") {
    throw new Error("BASESCAN_API_KEY is required before building an irreversible Safe finalization packet");
  }
  for (const name of POSITION_NFT_PHASE2_CONTRACTS) {
    const recorded = validatedSourceVerification.contracts[name];
    const live = await queryBaseScanSourceProof(baseScanApiKey, recorded.address);
    for (const [key, value] of Object.entries(live)) {
      if (canonicalJson(recorded[key as keyof typeof recorded]) !== canonicalJson(value)) {
        throw new Error(`${name} live BaseScan proof differs from the canonical source evidence`);
      }
    }
  }
  const nftEntry = requireObject(contracts.NARAPositionNFTV4, "contracts.NARAPositionNFTV4");
  const nftAddress = ethers.getAddress(requireString(nftEntry, "address", "contracts.NARAPositionNFTV4.address"));
  const nftReceipt = requireObject(nftEntry.receipt, "contracts.NARAPositionNFTV4.receipt");
  const nftStartBlock = requireSafeInteger(manifest.positionNftStartBlock, "positionNftStartBlock");
  if (nftStartBlock !== requireSafeInteger(nftReceipt.blockNumber, "NARAPositionNFTV4 receipt blockNumber")) {
    throw new Error("Position NFT event-history start block differs from its deployment receipt block");
  }

  const nftRuntime = requireObject(runtime.NARAPositionNFTV4, "runtimeCode.NARAPositionNFTV4");
  sameAddress(ethers, "Position NFT runtime", requireString(nftRuntime, "address"), nftAddress);
  const expectedNftRuntimeHash = requireString(nftRuntime, "codeHash").toLowerCase();

  const initialVerificationBlock = requireSafeInteger(manifest.verificationBlock, "verificationBlock");
  const initialVerificationBlockHash = requireString(manifest, "verificationBlockHash");
  const initialBlock = await canonicalBlock(
    ethers.provider,
    initialVerificationBlock,
    initialVerificationBlockHash,
    "pending-manifest verification",
  );
  if (nftStartBlock > initialVerificationBlock) {
    throw new Error("Position NFT start block is later than the pending-manifest verification block");
  }

  const safeFinalization = requireObject(manifest.safeFinalization, "safeFinalization");
  if (safeFinalization.status !== "unexecuted") {
    throw new Error("Pending manifest no longer marks the Safe finalization as unexecuted");
  }
  const rebuiltBatch = buildPositionNftPhase2FinalizationBatch(
    production.safe,
    nftAddress,
    production.treasury,
    {
      deploymentMode: manifest.mode,
      verificationBlock: initialVerificationBlock,
      verificationBlockHash: initialVerificationBlockHash,
      releaseCommit,
    },
    Number(initialBlock.timestamp) * 1_000,
  );
  const rebuiltBatchSha256 = sha256(prettyJson(rebuiltBatch));
  if (
    canonicalJson(rebuiltBatch) !== canonicalJson(safeFinalization.batch) ||
    canonicalJson(safeFinalization.calls) !== canonicalJson(POSITION_NFT_PHASE2_FINALIZATION_CALLS) ||
    rebuiltBatchSha256 !== requireString(safeFinalization, "batchSha256")
  ) {
    throw new Error("Pending Safe batch/hash/call order differs from the exact canonical five-call plan");
  }
  const deploymentSafeSnapshot = await readCanonicalNaraSafeEvidence(
    ethers.provider,
    production.safe,
    production.safeCodeHash,
    initialVerificationBlock,
  );
  if (canonicalJson(deploymentSafeSnapshot) !== canonicalJson(safeFinalization.safeSnapshot)) {
    throw new Error("Pending manifest Safe snapshot does not reproduce at the deployment verification block");
  }
  const recordedCoreContainment = requireObject(manifest.coreContainment, "coreContainment");
  const replayedCoreContainment = await readRewardNotifierContainmentEvidence(
    ethers.provider,
    production,
    requireSafeInteger(recordedCoreContainment.verifiedAtBlock, "coreContainment.verifiedAtBlock"),
  );
  if (canonicalJson(replayedCoreContainment) !== canonicalJson(recordedCoreContainment)) {
    throw new Error("Pending manifest Engine reward-notifier containment evidence does not reproduce");
  }
  const pendingBatchArtifact = requireObject(safeFinalization.batchArtifact, "safeFinalization.batchArtifact");
  if (
    canonicalJson(pendingBatchArtifact) !== canonicalJson(POSITION_NFT_PHASE2_PENDING_BATCH_ARTIFACT) ||
    Object.prototype.hasOwnProperty.call(safeFinalization, "batchPath")
  ) {
    throw new Error("Pending production batch was exposed as a standalone Safe import before source verification");
  }

  const latestBlock = await ethers.provider.getBlock("latest");
  if (
    !latestBlock?.hash ||
    /^0x0{64}$/i.test(latestBlock.hash) ||
    !Number.isSafeInteger(latestBlock.number) ||
    latestBlock.number < initialVerificationBlock
  ) {
    throw new Error("Could not pin a canonical latest Base block after the pending deployment evidence");
  }
  const signingBlockNumber = latestBlock.number;
  const signingBlockHash = latestBlock.hash;
  const productionRuntime = await pinnedProductionRuntimeEvidence(ethers, production, signingBlockNumber);

  const [safeSnapshot, coreContainment] = await Promise.all([
    readCanonicalNaraSafeEvidence(
      ethers.provider,
      production.safe,
      production.safeCodeHash,
      signingBlockNumber,
    ),
    readRewardNotifierContainmentEvidence(ethers.provider, production, signingBlockNumber),
  ]);
  assertRewardNotifierHistoryUnchanged(
    replayedCoreContainment,
    coreContainment,
    "Just-in-time signing snapshot",
  );
  if (
    safeSnapshot.verifiedAtBlock !== signingBlockNumber ||
    safeSnapshot.verifiedAtBlockHash.toLowerCase() !== signingBlockHash.toLowerCase()
  ) {
    throw new Error("Canonical Safe evidence is not bound to the pinned latest block");
  }
  if (safeSnapshot.nonce !== deploymentSafeSnapshot.nonce) {
    throw new Error(
      "Production Safe nonce changed after NFT deployment; review every intervening Safe execution before rebuilding",
    );
  }

  const phase2RuntimeEntries = await Promise.all(POSITION_NFT_PHASE2_CONTRACTS.map(async (name) => {
    const contractEntry = requireObject(contracts[name], `contracts.${name}`);
    const runtimeEntry = requireObject(runtime[name], `runtimeCode.${name}`);
    const address = ethers.getAddress(requireString(contractEntry, "address", `contracts.${name}.address`));
    sameAddress(ethers, `${name} runtime`, requireString(runtimeEntry, "address"), address);
    if (requireSafeInteger(runtimeEntry.verifiedAtBlock, `${name} runtime verifiedAtBlock`) !== initialVerificationBlock) {
      throw new Error(`${name} runtime evidence is not pinned to the pending-manifest verification block`);
    }
    const code = await ethers.provider.getCode(address, signingBlockNumber);
    if (code === "0x") throw new Error(`${name} has no runtime code at the signing block`);
    const codeHash = ethers.keccak256(code).toLowerCase();
    if (
      codeHash !== requireString(runtimeEntry, "codeHash", `runtimeCode.${name}.codeHash`).toLowerCase() ||
      (code.length - 2) / 2 !== requireSafeInteger(runtimeEntry.codeSizeBytes, `${name} runtime codeSizeBytes`)
    ) {
      throw new Error(`${name} current runtime differs from the pending manifest`);
    }
    return [name, { address, codeHash, codeSizeBytes: (code.length - 2) / 2 }] as const;
  }));
  const phase2Runtime = Object.fromEntries(phase2RuntimeEntries);
  const nftCodeHash = phase2Runtime.NARAPositionNFTV4.codeHash;
  if (nftCodeHash !== expectedNftRuntimeHash) {
    throw new Error("Position NFT runtime differs from the pending manifest at the signing block");
  }

  const nftArtifact = await hre.artifacts.readArtifact(POSITION_NFT_FQN);
  const nft = new ethers.Contract(nftAddress, nftArtifact.abi, ethers.provider);
  const atSigningBlock = { blockTag: signingBlockNumber };
  const [
    engine,
    nara,
    accountImplementation,
    renderer,
    owner,
    pendingOwner,
    royaltyFrozen,
    royaltyInfo,
    naraClaimFeeBps,
    tokenClaimFeeBps,
    claimFeeRecipient,
    claimFeesFrozen,
    genesisRewardDistributor,
    genesisMintersFrozen,
    nextTokenId,
  ] = await Promise.all([
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

  sameAddress(ethers, "NFT Engine", engine, production.engine);
  sameAddress(ethers, "NFT NARA", nara, production.token);
  sameAddress(
    ethers,
    "NFT account implementation",
    accountImplementation,
    requireString(requireObject(contracts.NARAPositionAccountV4, "contracts.NARAPositionAccountV4"), "address"),
  );
  sameAddress(
    ethers,
    "NFT renderer",
    renderer,
    requireString(requireObject(contracts.NARAPositionRendererV5, "contracts.NARAPositionRendererV5"), "address"),
  );
  sameAddress(ethers, "NFT owner", owner, production.safe);
  sameAddress(ethers, "NFT pending owner", pendingOwner, ethers.ZeroAddress);
  sameAddress(ethers, "royalty receiver", royaltyInfo[0], production.treasury);
  sameAddress(ethers, "claim fee recipient", claimFeeRecipient, ethers.ZeroAddress);
  sameAddress(ethers, "Genesis reward distributor", genesisRewardDistributor, ethers.ZeroAddress);
  if (
    royaltyFrozen !== false ||
    royaltyInfo[1] !== BigInt(canonicalPolicy.royaltyBps) ||
    naraClaimFeeBps !== 0n ||
    tokenClaimFeeBps !== 0n ||
    claimFeesFrozen !== false ||
    genesisMintersFrozen !== false
  ) {
    throw new Error(
      "Position NFT is not in the exact 10%-treasury royalty / zero-claim-fee, unfrozen Phase-2 state",
    );
  }

  const genesisMinterEvent = nft.interface.getEvent("GenesisMinterSet");
  const positionMintedEvent = nft.interface.getEvent("PositionMinted");
  if (!genesisMinterEvent || !positionMintedEvent) {
    throw new Error("GenesisMinterSet or PositionMinted is absent from the reviewed Position NFT ABI");
  }
  const [genesisMinterLogs, unsortedPositionMintedLogs] = await Promise.all([
    getEventLogsInChunks(
      ethers.provider,
      nftAddress,
      genesisMinterEvent.topicHash,
      nftStartBlock,
      signingBlockNumber,
    ),
    getEventLogsInChunks(
      ethers.provider,
      nftAddress,
      positionMintedEvent.topicHash,
      nftStartBlock,
      signingBlockNumber,
    ),
  ]);
  if (genesisMinterLogs.length !== 0) {
    throw new Error("GenesisMinterSet history is non-zero; Phase-2 Safe finalization is no longer valid");
  }
  const positionMintedLogs = [...unsortedPositionMintedLogs].sort(
    (left, right) => left.blockNumber - right.blockNumber || left.index - right.index,
  );
  const observedPublicMints = positionMintedLogs.map((log, index) => {
    const parsed = nft.interface.parseLog(log);
    if (
      log.removed === true ||
      !parsed ||
      parsed.name !== "PositionMinted" ||
      BigInt(parsed.args.tokenId) !== BigInt(index + 1)
    ) {
      throw new Error("PositionMinted history is removed, undecodable, duplicated, or non-sequential");
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
    throw new Error("nextTokenId does not reconcile with complete PositionMinted history at the signing block");
  }

  const safeBatchPlan = await buildAndSimulateSafeBatch(
    ethers.provider,
    production.safe,
    BigInt(safeSnapshot.nonce),
    rebuiltBatch.transactions,
    signingBlockNumber,
  );
  if (
    safeBatchPlan.simulatedAtBlock !== signingBlockNumber ||
    safeBatchPlan.safeTransaction.nonce !== safeSnapshot.nonce
  ) {
    throw new Error("Atomic Safe simulation is not bound to the pinned Safe nonce and signing block");
  }

  await canonicalBlock(ethers.provider, signingBlockNumber, signingBlockHash, "signing-packet");
  const freshnessBlock = await ethers.provider.getBlock("latest");
  if (!freshnessBlock?.hash || /^0x0{64}$/i.test(freshnessBlock.hash)) {
    throw new Error("Could not obtain a canonical Base block for the pre-write Safe nonce freshness check");
  }
  const freshnessSnapshot = await readCanonicalNaraSafeEvidence(
    ethers.provider,
    production.safe,
    production.safeCodeHash,
    Number(freshnessBlock.number),
  );
  if (freshnessSnapshot.nonce !== safeSnapshot.nonce) {
    throw new Error("Production Safe nonce changed during packet construction; discard and rebuild from a fresh block");
  }

  const signingPacketRelativePath =
    `deployments/UNEXECUTED-v4-position-nft-phase2-signing-packet-${signingBlockNumber}` +
    `-nonce-${safeSnapshot.nonce}.json`;
  const signingPacketPath = resolveRepositoryPath(signingPacketRelativePath, "signing packet output");
  const signingBatchRelativePath =
    `deployments/UNEXECUTED-v4-position-nft-phase2-safe-batch-${signingBlockNumber}` +
    `-nonce-${safeSnapshot.nonce}.json`;
  const signingBatchPath = resolveRepositoryPath(signingBatchRelativePath, "signing batch output");
  const stagedSigningBatchRelativePath = signingBatchRelativePath.replace(
    "deployments/UNEXECUTED-v4-position-nft-phase2-safe-batch-",
    "deployments/PENDING-PACKET-LINK-DO-NOT-IMPORT-v4-position-nft-phase2-safe-batch-",
  );
  const stagedSigningBatchPath = resolveRepositoryPath(stagedSigningBatchRelativePath, "staged signing batch output");
  const blockTimestamp = Number(latestBlock.timestamp);
  if (!Number.isSafeInteger(blockTimestamp) || blockTimestamp <= 0) {
    throw new Error("Pinned signing block has an invalid timestamp");
  }

  const packetProductionRuntime = {
      changeId: production.changeId,
      manifestPath: PRODUCTION_CORE_MANIFEST_RELATIVE_PATH,
      manifestSha256: production.manifestSha256,
      originCommit: production.originCommit,
      verifiedAtBlock: signingBlockNumber,
      verifiedAtBlockHash: signingBlockHash,
      contracts: productionRuntime,
    };
  const packetPhase2Runtime = {
      verifiedAtBlock: signingBlockNumber,
      verifiedAtBlockHash: signingBlockHash,
      contracts: phase2Runtime,
    };
  const packetPositionNft = {
      address: nftAddress,
      startBlock: nftStartBlock,
      runtimeCodeHash: nftCodeHash,
      verifiedAtBlock: signingBlockNumber,
      verifiedAtBlockHash: signingBlockHash,
      engine: ethers.getAddress(engine),
      nara: ethers.getAddress(nara),
      accountImplementation: ethers.getAddress(accountImplementation),
      renderer: ethers.getAddress(renderer),
      owner: ethers.getAddress(owner),
      pendingOwner: ethers.getAddress(pendingOwner),
      royaltyReceiver: ethers.getAddress(royaltyInfo[0]),
      royaltyAmountForTenThousand: royaltyInfo[1].toString(),
      royaltiesFrozen: royaltyFrozen,
      naraClaimFeeBps: naraClaimFeeBps.toString(),
      tokenClaimFeeBps: tokenClaimFeeBps.toString(),
      claimFeeRecipient: ethers.getAddress(claimFeeRecipient),
      claimFeesFrozen,
      genesisRewardDistributor: ethers.getAddress(genesisRewardDistributor),
      genesisMintersFrozen,
      genesisMinterEventCount: genesisMinterLogs.length,
      positionMintedEventCount: observedPublicMints.length,
      positionMintedHistorySha256: sha256(canonicalJson(observedPublicMints)),
      positionMints: observedPublicMints,
      nextTokenId: nextTokenId.toString(),
    };
  const packetFreshnessCheck = {
      verifiedAtBlock: freshnessSnapshot.verifiedAtBlock,
      verifiedAtBlockHash: freshnessSnapshot.verifiedAtBlockHash,
      safeNonce: freshnessSnapshot.nonce,
      matchesSigningNonce: true,
    };
  const signingPacket = canonicalPositionNftPhase2SigningPacket({
    createdAt: new Date(blockTimestamp * 1_000).toISOString(),
    packetPath: signingPacketRelativePath,
    pendingManifestPath: PENDING_MANIFEST_RELATIVE_PATH,
    pendingManifestSha256,
    sourceCommit,
    evidenceCommit,
    releaseCommit,
    sourceVerification: validatedSourceVerification,
    sourceVerificationArtifact: {
      path: SOURCE_EVIDENCE_RELATIVE_PATH,
      sha256: sourceEvidenceSha256,
    },
    signingBlockNumber,
    signingBlockHash,
    signingBlockTimestamp: blockTimestamp,
    productionRuntime: packetProductionRuntime,
    coreContainment,
    positionNftPhase2Runtime: packetPhase2Runtime,
    safeSnapshot,
    positionNft: packetPositionNft,
    batch: rebuiltBatch,
    batchSha256: rebuiltBatchSha256,
    signingBatchPath: signingBatchRelativePath,
    safeTxHash: safeBatchPlan.safeTxHash,
    safeBatchPlan,
    freshnessCheck: packetFreshnessCheck,
  });

  if (existsSync(signingBatchPath) || existsSync(signingPacketPath) || existsSync(stagedSigningBatchPath)) {
    throw new Error(
      "Refusing to overwrite an existing or partial JIT artifact; quarantine and reconcile it before rebuilding",
    );
  }
  const signingBatchJson = prettyJson(rebuiltBatch);
  const signingPacketJson = prettyJson(signingPacket);
  durableWriteNew(signingPacketPath, signingPacketJson);
  const writtenBytes = readFileSync(signingPacketPath);
  if (writtenBytes.toString("utf8") !== signingPacketJson) {
    throw new Error("Signing packet did not reproduce after durable write");
  }
  durableWriteNew(stagedSigningBatchPath, signingBatchJson);
  const stagedBatchBytes = readFileSync(stagedSigningBatchPath);
  if (
    stagedBatchBytes.toString("utf8") !== signingBatchJson ||
    sha256(stagedBatchBytes) !== rebuiltBatchSha256
  ) {
    throw new Error("Non-importable staged Safe batch did not reproduce before publication");
  }
  renameSync(stagedSigningBatchPath, signingBatchPath);
  const writtenBatchBytes = readFileSync(signingBatchPath);
  if (
    existsSync(stagedSigningBatchPath) ||
    writtenBatchBytes.toString("utf8") !== signingBatchJson ||
    sha256(writtenBatchBytes) !== rebuiltBatchSha256
  ) {
    throw new Error("Safe Tx Builder import was not atomically published with exact reviewed bytes");
  }

  console.log(JSON.stringify({
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    packet: signingPacketRelativePath,
    packetSha256: sha256(writtenBytes),
    safeTxBuilderBatch: signingBatchRelativePath,
    safeTxBuilderBatchSha256: sha256(writtenBatchBytes),
    supersedes: {
      pendingManifestPath: PENDING_MANIFEST_RELATIVE_PATH,
      pendingManifestSha256,
    },
    verifiedAtBlock: signingBlockNumber,
    verifiedAtBlockHash: signingBlockHash,
    positionNft: nftAddress,
    safeNonce: safeSnapshot.nonce,
    safeTxHash: safeBatchPlan.safeTxHash,
    executionStatus: "UNEXECUTED",
  }, null, 2));
}

main().catch((error) => {
  console.error(safeErrorMessage(error));
  console.error("No transaction was signed, sent, or executed. Rebuild from a fresh pinned Base block after reconciliation.");
  process.exitCode = 1;
});
