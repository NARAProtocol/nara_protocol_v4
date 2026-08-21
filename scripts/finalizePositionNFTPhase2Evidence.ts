/**
 * Assemble the append-only finalized Position NFT Phase-2 manifest from verified Base evidence.
 * This script is read-only onchain: it never signs or sends a transaction.
 */

import hre from "hardhat";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { buildAndSimulateSafeBatch, decodeAndVerifySafeExecution } from "./lib/v4SafeBatch.js";
import { readCanonicalNaraSafeEvidence } from "./lib/v4SafeEvidence.js";
import {
  assertRewardNotifierHistoryUnchanged,
  readRewardNotifierContainmentEvidence,
} from "./lib/v4RewardNotifierContainment.js";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
  type ProductionV4Deployment,
} from "./lib/v4LiveConfig.js";
import {
  POSITION_NFT_PHASE2_CHAIN_ID,
  POSITION_NFT_PHASE2_CHANGE_ID,
  POSITION_NFT_PHASE2_CONTRACTS,
  POSITION_NFT_PHASE2_FINALIZATION_CALLS,
  POSITION_NFT_PHASE2_PENDING_BATCH_ARTIFACT,
  buildPositionNftPhase2FinalizationBatch,
  canonicalPositionNftPhase2Policy,
} from "./lib/v4PositionNftPhase2.js";
import {
  assertPositionNftSourceVerificationEvidence,
  queryBaseScanSourceProof,
} from "./lib/v4PositionNftSourceVerification.js";
import { canonicalPositionNftPhase2SigningPacket } from "./lib/v4PositionNftSigningPacket.js";

type JsonObject = Record<string, any>;

const PENDING_MANIFEST = "deployments/v4-position-nft-phase2-2026-08-21.json";
const SOURCE_EVIDENCE = "deployments/v4-position-nft-phase2-source-verification-2026-08-21.json";
const FINAL_MANIFEST = "deployments/v4-position-nft-phase2-finalized-2026-08-21.json";
const PRODUCTION_CORE_MANIFEST = "deployments/v4-production-activation-2026-08-09.json";
const EVENT_LOG_BLOCK_CHUNK = 2_000;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function string(objectValue: JsonObject, key: string, label = key): string {
  const value = objectValue[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function integer(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || String(parsed) !== String(value)) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedTextSha256(value: Buffer | string): string {
  const text = typeof value === "string" ? value : value.toString("utf8");
  return sha256(text.replace(/\r\n/g, "\n"));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2)}\n`;
}

function sameAddress(ethers: any, label: string, actual: unknown, expected: unknown): void {
  if (ethers.getAddress(String(actual)) !== ethers.getAddress(String(expected))) {
    throw new Error(`${label} address mismatch`);
  }
}

function repositoryRelativePath(path: string, label: string): string {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(path);
  const local = relative(process.cwd(), absolute);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`${label} must remain inside the authoritative repository`);
  }
  return local.split(sep).join("/");
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

function sanitizedError(error: unknown): string {
  const secret = process.env.BASESCAN_API_KEY?.trim() ?? "";
  const original = error instanceof Error ? error.message : "Position NFT evidence finalization failed";
  const withoutSecret = secret === "" ? original : original.split(secret).join("[redacted-api-key]");
  return withoutSecret.replace(/https?:\/\/\S+/gi, "[redacted-url]").slice(0, 600);
}

async function canonicalBlock(provider: any, blockNumber: number, expectedHash: string, label: string): Promise<any> {
  const block = await provider.getBlock(blockNumber);
  if (!block?.hash || /^0x0{64}$/i.test(block.hash) || block.hash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(`${label} block/hash is not canonical Base evidence`);
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
  for (let start = fromBlock; start <= toBlock; start += EVENT_LOG_BLOCK_CHUNK) {
    const end = Math.min(start + EVENT_LOG_BLOCK_CHUNK - 1, toBlock);
    logs.push(...await provider.getLogs({ address, topics: [topic], fromBlock: start, toBlock: end }));
  }
  return logs.sort((left, right) => left.blockNumber - right.blockNumber || left.index - right.index);
}

async function main(): Promise<void> {
  if (hre.globalOptions.network !== "base") throw new Error("Final evidence assembly must run with --network base");
  if (!existsSync(PENDING_MANIFEST)) throw new Error(`Pending manifest is missing: ${PENDING_MANIFEST}`);
  if (!existsSync(SOURCE_EVIDENCE)) throw new Error(`Source evidence is missing: ${SOURCE_EVIDENCE}`);
  if (existsSync(FINAL_MANIFEST)) throw new Error(`Refusing to overwrite finalized evidence: ${FINAL_MANIFEST}`);
  const signingPacketInput = process.env.V4_POSITION_NFT_SIGNING_PACKET?.trim() ?? "";
  const safeExecutionTransactionHash = process.env.V4_POSITION_NFT_SAFE_EXECUTION_TX?.trim() ?? "";
  if (signingPacketInput === "" || !/^0x[0-9a-f]{64}$/i.test(safeExecutionTransactionHash)) {
    throw new Error("Set V4_POSITION_NFT_SIGNING_PACKET and a 32-byte V4_POSITION_NFT_SAFE_EXECUTION_TX");
  }
  const signingPacketPath = repositoryRelativePath(signingPacketInput, "signing packet");
  if (!/^deployments\/UNEXECUTED-v4-position-nft-phase2-signing-packet-\d+-nonce-\d+\.json$/.test(signingPacketPath)) {
    throw new Error("Signing packet path is not the canonical UNEXECUTED Position NFT packet pattern");
  }
  if (!existsSync(signingPacketPath)) throw new Error(`Signing packet is missing: ${signingPacketPath}`);

  const pendingBytes = readFileSync(PENDING_MANIFEST);
  const pendingSha256 = normalizedTextSha256(pendingBytes);
  const pending = object(JSON.parse(pendingBytes.toString("utf8")), "pending manifest");
  if (
    pending.schemaVersion !== 1 ||
    pending.changeId !== POSITION_NFT_PHASE2_CHANGE_ID ||
    pending.mode !== "execute" ||
    pending.network !== "base" ||
    String(pending.chainId) !== POSITION_NFT_PHASE2_CHAIN_ID.toString() ||
    pending.evidenceState !== "deployed_pending_safe_finalization" ||
    pending.integrationReady !== false
  ) {
    throw new Error("Finalizer accepts only the canonical fail-closed pending Base manifest");
  }
  const release = object(pending.release, "release");
  const sourceCommit = string(release, "sourceCommit").toLowerCase();
  const evidenceCommit = string(release, "evidenceCommit").toLowerCase();
  const releaseCommit = string(release, "releaseCommit").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit) || !/^[0-9a-f]{40}$/.test(evidenceCommit)) {
    throw new Error("Pending manifest lacks a valid audited source/evidence commit pair");
  }
  if (releaseCommit !== evidenceCommit) throw new Error("Pending manifest release commit is not the evidence commit");

  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== POSITION_NFT_PHASE2_CHAIN_ID) throw new Error("Connected chain is not Base 8453");
  const production = await assertProductionV4Runtime(ethers.provider, currentV4Config());
  console.log(`Production runtime guard: ${productionV4RuntimeBanner(production)}`);
  const canonicalPolicy = canonicalPositionNftPhase2Policy(production.safe, production.treasury);
  sameAddress(ethers, "owner Safe", pending.ownerSafe, production.safe);

  const contracts = object(pending.contracts, "contracts");
  const sourceArtifacts = object(pending.sourceArtifacts, "sourceArtifacts");
  const pendingRuntime = object(pending.runtimeCode, "runtimeCode");
  if (
    Object.keys(contracts).sort().join(",") !== [...POSITION_NFT_PHASE2_CONTRACTS].sort().join(",") ||
    Object.keys(sourceArtifacts).sort().join(",") !== [...POSITION_NFT_PHASE2_CONTRACTS].sort().join(",")
  ) {
    throw new Error("Pending manifest does not contain the exact seven-contract suite");
  }
  const nftAddress = ethers.getAddress(string(object(contracts.NARAPositionNFTV4, "NFT entry"), "address"));
  const nftStartBlock = integer(pending.positionNftStartBlock, "positionNftStartBlock");
  const initialVerificationBlock = integer(pending.verificationBlock, "verificationBlock");
  const initialVerificationHash = string(pending, "verificationBlockHash");
  const initialBlock = await canonicalBlock(
    ethers.provider,
    initialVerificationBlock,
    initialVerificationHash,
    "initial verification",
  );
  const pendingSafeFinalization = object(pending.safeFinalization, "safeFinalization");
  if (pendingSafeFinalization.status !== "unexecuted") throw new Error("Pending Safe batch is not marked unexecuted");
  if (
    canonicalJson(pendingSafeFinalization.batchArtifact) !==
      canonicalJson(POSITION_NFT_PHASE2_PENDING_BATCH_ARTIFACT) ||
    Object.prototype.hasOwnProperty.call(pendingSafeFinalization, "batchPath")
  ) {
    throw new Error("Pending production batch was exposed as a standalone Safe import before source verification");
  }
  const canonicalBatch = buildPositionNftPhase2FinalizationBatch(
    production.safe,
    nftAddress,
    production.treasury,
    {
      deploymentMode: pending.mode,
      verificationBlock: initialVerificationBlock,
      verificationBlockHash: initialVerificationHash,
      releaseCommit: evidenceCommit,
    },
    Number(initialBlock.timestamp) * 1_000,
  );
  if (
    canonicalJson(canonicalBatch) !== canonicalJson(pendingSafeFinalization.batch) ||
    canonicalJson(pendingSafeFinalization.calls) !== canonicalJson(POSITION_NFT_PHASE2_FINALIZATION_CALLS) ||
    sha256(prettyJson(canonicalBatch)) !== string(pendingSafeFinalization, "batchSha256")
  ) {
    throw new Error("Pending manifest Safe batch is not the canonical five-call reset/freeze batch");
  }
  const [deploymentSafeSnapshot, deploymentCoreContainment] = await Promise.all([
    readCanonicalNaraSafeEvidence(
      ethers.provider,
      production.safe,
      production.safeCodeHash,
      initialVerificationBlock,
    ),
    readRewardNotifierContainmentEvidence(ethers.provider, production, initialVerificationBlock),
  ]);
  if (canonicalJson(deploymentSafeSnapshot) !== canonicalJson(pendingSafeFinalization.safeSnapshot)) {
    throw new Error("Deployment Safe snapshot does not reproduce at the initial verification block");
  }
  if (canonicalJson(deploymentCoreContainment) !== canonicalJson(pending.coreContainment)) {
    throw new Error("Deployment reward-notifier containment evidence does not reproduce");
  }

  const signingPacketBytes = readFileSync(signingPacketPath);
  const signingPacketSha256 = sha256(signingPacketBytes);
  const signingPacket = object(JSON.parse(signingPacketBytes.toString("utf8")), "signing packet");
  if (
    signingPacket.schemaVersion !== 1 ||
    signingPacket.packetType !== "nara_v4_position_nft_phase2_safe_signing_packet" ||
    signingPacket.changeId !== POSITION_NFT_PHASE2_CHANGE_ID ||
    signingPacket.evidenceState !== "unexecuted_safe_signing_packet" ||
    signingPacket.execution?.status !== "UNEXECUTED" ||
    signingPacket.packetPath !== signingPacketPath ||
    signingPacket.supersedes?.pendingManifestPath !== PENDING_MANIFEST ||
    String(signingPacket.supersedes?.pendingManifestSha256).toLowerCase() !== pendingSha256 ||
    String(signingPacket.release?.sourceCommit).toLowerCase() !== sourceCommit ||
    String(signingPacket.release?.evidenceCommit).toLowerCase() !== evidenceCommit ||
    canonicalJson(signingPacket.exactCalls) !== canonicalJson(POSITION_NFT_PHASE2_FINALIZATION_CALLS) ||
    canonicalJson(signingPacket.batch) !== canonicalJson(canonicalBatch) ||
    signingPacket.batchSha256 !== pendingSafeFinalization.batchSha256
  ) {
    throw new Error("Signing packet does not exactly supersede the pending deployment/batch evidence");
  }
  const signingBlock = integer(signingPacket.verifiedAtBlock, "signing packet block");
  const signingBlockHash = string(signingPacket, "verifiedAtBlockHash");
  if (signingBlock < initialVerificationBlock) {
    throw new Error("Signing packet predates the deployment verification block");
  }
  const signingBlockEvidence = await canonicalBlock(
    ethers.provider,
    signingBlock,
    signingBlockHash,
    "signing packet",
  );
  const phase2RuntimeEntries = await Promise.all(POSITION_NFT_PHASE2_CONTRACTS.map(async (name) => {
    const contractEntry = object(contracts[name], `contracts.${name}`);
    const runtimeEntry = object(pendingRuntime[name], `runtimeCode.${name}`);
    const address = ethers.getAddress(string(contractEntry, "address", `contracts.${name}.address`));
    sameAddress(ethers, `${name} runtime`, runtimeEntry.address, address);
    const code = await ethers.provider.getCode(address, signingBlock);
    if (code === "0x") throw new Error(`${name} has no code at the signing block`);
    const codeHash = ethers.keccak256(code).toLowerCase();
    const codeSizeBytes = (code.length - 2) / 2;
    if (
      codeHash !== string(runtimeEntry, "codeHash", `runtimeCode.${name}.codeHash`).toLowerCase() ||
      codeSizeBytes !== integer(runtimeEntry.codeSizeBytes, `runtimeCode.${name}.codeSizeBytes`)
    ) {
      throw new Error(`${name} runtime differs from pending deployment evidence at the signing block`);
    }
    return [name, { address, codeHash, codeSizeBytes }] as const;
  }));
  const phase2Runtime = Object.fromEntries(phase2RuntimeEntries);
  const productionRuntime = await pinnedProductionRuntimeEvidence(ethers, production, signingBlock);
  const [signingSafeSnapshot, signingCoreContainment] = await Promise.all([
    readCanonicalNaraSafeEvidence(
      ethers.provider,
      production.safe,
      production.safeCodeHash,
      signingBlock,
    ),
    readRewardNotifierContainmentEvidence(ethers.provider, production, signingBlock),
  ]);
  if (
    canonicalJson(signingSafeSnapshot) !== canonicalJson(signingPacket.safeSnapshot) ||
    canonicalJson(signingCoreContainment) !== canonicalJson(signingPacket.coreContainment) ||
    signingSafeSnapshot.nonce !== deploymentSafeSnapshot.nonce
  ) {
    throw new Error("Safe changed between deployment and the just-in-time signing snapshot");
  }
  assertRewardNotifierHistoryUnchanged(
    deploymentCoreContainment,
    signingCoreContainment,
    "Just-in-time signing snapshot",
  );
  const signingPlan = await buildAndSimulateSafeBatch(
    ethers.provider,
    production.safe,
    BigInt(signingSafeSnapshot.nonce),
    canonicalBatch.transactions,
    signingBlock,
  );
  if (
    canonicalJson(signingPlan) !== canonicalJson(signingPacket.safeBatchPlan) ||
    signingPlan.safeTxHash.toLowerCase() !== String(signingPacket.safeTxHash).toLowerCase()
  ) {
    throw new Error("Signing packet Safe hash/nonce/atomic simulation does not reproduce");
  }

  const nft = await ethers.getContractAt("contracts/v4/NARAPositionNFTV4.sol:NARAPositionNFTV4", nftAddress);
  const atSigningBlock = { blockTag: signingBlock };
  const [signingCode, signingEngine, signingNara, signingAccountImplementation, signingRenderer,
    signingOwner, signingPendingOwner, signingRoyaltyFrozen, signingRoyaltyInfo, signingNaraFee,
    signingTokenFee, signingRecipient, signingClaimFrozen, signingGenesisDistributor,
    signingGenesisFrozen, signingNextTokenId] = await Promise.all([
    ethers.provider.getCode(nftAddress, signingBlock),
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
    ethers.keccak256(signingCode).toLowerCase() !== String(pending.runtimeCode.NARAPositionNFTV4.codeHash).toLowerCase() ||
    ethers.getAddress(signingEngine) !== ethers.getAddress(production.engine) ||
    ethers.getAddress(signingNara) !== ethers.getAddress(production.token) ||
    ethers.getAddress(signingAccountImplementation) !==
      ethers.getAddress(string(object(contracts.NARAPositionAccountV4, "account entry"), "address")) ||
    ethers.getAddress(signingRenderer) !==
      ethers.getAddress(string(object(contracts.NARAPositionRendererV5, "renderer entry"), "address")) ||
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
    throw new Error("NFT was not in the exact 10%-treasury royalty / zero-claim-fee pre-finalization state");
  }
  const signingGenesisEvent = nft.interface.getEvent("GenesisMinterSet");
  const signingMintedEvent = nft.interface.getEvent("PositionMinted");
  if (!signingGenesisEvent || !signingMintedEvent) throw new Error("Required NFT events are absent from the ABI");
  const [signingGenesisLogs, signingMintedLogs] = await Promise.all([
    logsInChunks(ethers.provider, nftAddress, signingGenesisEvent.topicHash, nftStartBlock, signingBlock),
    logsInChunks(ethers.provider, nftAddress, signingMintedEvent.topicHash, nftStartBlock, signingBlock),
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
    safeExecutionTransactionHash,
    canonicalBatch.transactions,
    signingPlan,
  );
  const executionBlock = safeExecution.transactionReceipt.blockNumber;
  if (executionBlock <= signingBlock) {
    throw new Error("Safe execution did not occur after the signing evidence block");
  }
  const safeAfterExecution = await readCanonicalNaraSafeEvidence(
    ethers.provider,
    production.safe,
    production.safeCodeHash,
    executionBlock,
  );
  if (BigInt(safeAfterExecution.nonce) !== BigInt(signingSafeSnapshot.nonce) + 1n) {
    throw new Error("Safe nonce did not advance exactly once for the finalization execution");
  }
  const receipt = await ethers.provider.getTransactionReceipt(safeExecutionTransactionHash);
  if (!receipt) throw new Error("Safe execution receipt disappeared");
  const eventNames = ["ClaimFeesSet", "ClaimFeeRecipientSet", "RoyaltiesFrozen", "ClaimFeesFrozen"] as const;
  const finalizationEvents: Record<string, any> = {};
  for (const eventName of eventNames) {
    const fragment = nft.interface.getEvent(eventName);
    if (!fragment) throw new Error(`${eventName} is absent from the reviewed NFT ABI`);
    const logs = receipt.logs.filter(
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
  if (
    BigInt(finalizationEvents.ClaimFeesSet.args.naraClaimFeeBps) !== 0n ||
    BigInt(finalizationEvents.ClaimFeesSet.args.tokenClaimFeeBps) !== 0n ||
    ethers.getAddress(finalizationEvents.ClaimFeeRecipientSet.args.recipient) !== ethers.ZeroAddress
  ) {
    throw new Error("Safe receipt did not reset both claim fees and their recipient to zero before freezing");
  }

  const finalBlock = await ethers.provider.getBlock("latest");
  if (!finalBlock?.hash || /^0x0{64}$/i.test(finalBlock.hash) || finalBlock.number < executionBlock) {
    throw new Error("Could not pin a canonical final readback block after Safe execution");
  }
  const finalBlockNumber = Number(finalBlock.number);
  const finalCoreContainment = await readRewardNotifierContainmentEvidence(
    ethers.provider,
    production,
    finalBlockNumber,
  );
  assertRewardNotifierHistoryUnchanged(
    deploymentCoreContainment,
    finalCoreContainment,
    "Finalized readback",
  );
  const atFinalBlock = { blockTag: finalBlockNumber };
  const [owner, pendingOwner, royaltyFrozen, royaltyInfo, naraFee, tokenFee, recipient, claimFrozen,
    genesisDistributor, genesisFrozen, nextTokenId, name, symbol] = await Promise.all([
    nft.owner(atFinalBlock),
    nft.pendingOwner(atFinalBlock),
    nft.royaltyFrozen(atFinalBlock),
    nft.royaltyInfo(1, 10_000, atFinalBlock),
    nft.naraClaimFeeBps(atFinalBlock),
    nft.tokenClaimFeeBps(atFinalBlock),
    nft.claimFeeRecipient(atFinalBlock),
    nft.claimFeesFrozen(atFinalBlock),
    nft.genesisRewardDistributor(atFinalBlock),
    nft.genesisMintersFrozen(atFinalBlock),
    nft.nextTokenId(atFinalBlock),
    nft.name(atFinalBlock),
    nft.symbol(atFinalBlock),
  ]);
  if (
    ethers.getAddress(owner) !== ethers.getAddress(production.safe) ||
    ethers.getAddress(pendingOwner) !== ethers.ZeroAddress ||
    !royaltyFrozen ||
    ethers.getAddress(royaltyInfo[0]) !== ethers.getAddress(production.treasury) ||
    royaltyInfo[1] !== BigInt(canonicalPolicy.royaltyBps) ||
    naraFee !== 0n ||
    tokenFee !== 0n ||
    ethers.getAddress(recipient) !== ethers.ZeroAddress ||
    !claimFrozen ||
    ethers.getAddress(genesisDistributor) !== ethers.ZeroAddress ||
    genesisFrozen ||
    name !== "NARA Position" ||
    symbol !== "NARAPOS"
  ) {
    throw new Error("Final pinned NFT state differs from the fixed-royalty / zero-claim-fee Phase-2 policy");
  }
  const genesisEvent = nft.interface.getEvent("GenesisMinterSet");
  const mintedEvent = nft.interface.getEvent("PositionMinted");
  if (!genesisEvent || !mintedEvent) throw new Error("Required NFT events are absent from the reviewed ABI");
  const [genesisLogs, mintedLogs] = await Promise.all([
    logsInChunks(ethers.provider, nftAddress, genesisEvent.topicHash, nftStartBlock, finalBlockNumber),
    logsInChunks(ethers.provider, nftAddress, mintedEvent.topicHash, nftStartBlock, finalBlockNumber),
  ]);
  if (genesisLogs.length !== 0) throw new Error("GenesisMinterSet history is non-zero during isolated Phase 2");
  const positionMints = mintedLogs.map((log, index) => {
    const parsed = nft.interface.parseLog(log);
    if (!parsed || BigInt(parsed.args.tokenId) !== BigInt(index + 1)) {
      throw new Error("PositionMinted history is missing, duplicated, or non-sequential");
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
  if (nextTokenId !== BigInt(positionMints.length + 1)) {
    throw new Error("Final nextTokenId does not reconcile with complete PositionMinted history");
  }

  const sourceEvidenceBytes = readFileSync(SOURCE_EVIDENCE);
  const sourceEvidenceSha256 = normalizedTextSha256(sourceEvidenceBytes);
  const sourceVerification = object(JSON.parse(sourceEvidenceBytes.toString("utf8")), "source verification");
  const validatedSourceVerification = await assertPositionNftSourceVerificationEvidence(sourceVerification, {
    sourceCommit,
    evidenceCommit,
    pendingManifestPath: PENDING_MANIFEST,
    pendingManifestSha256: pendingSha256,
    contracts,
    sourceArtifacts,
    artifacts: hre.artifacts,
  });
  if (
    canonicalJson(signingPacket.sourceVerification) !== canonicalJson(validatedSourceVerification) ||
    signingPacket.sourceVerificationArtifact?.path !== SOURCE_EVIDENCE ||
    signingPacket.sourceVerificationArtifact?.sha256 !== sourceEvidenceSha256
  ) {
    throw new Error("Safe signing packet is not bound to the exact seven-contract source-verification evidence");
  }
  const baseScanApiKey = process.env.BASESCAN_API_KEY?.trim() ?? "";
  if (baseScanApiKey === "") throw new Error("BASESCAN_API_KEY is required for live source-proof finalization");
  for (const contractName of POSITION_NFT_PHASE2_CONTRACTS) {
    const recorded = validatedSourceVerification.contracts[contractName];
    const live = await queryBaseScanSourceProof(baseScanApiKey, recorded.address);
    for (const [key, value] of Object.entries(live)) {
      if (canonicalJson(recorded[key as keyof typeof recorded]) !== canonicalJson(value)) {
        throw new Error(`${contractName} live BaseScan source proof differs from the evidence file`);
      }
    }
  }

  const freshnessClaim = object(signingPacket.freshnessCheck, "signingPacket.freshnessCheck");
  const freshnessBlockNumber = integer(
    freshnessClaim.verifiedAtBlock,
    "signingPacket.freshnessCheck.verifiedAtBlock",
  );
  const freshnessBlockHash = string(
    freshnessClaim,
    "verifiedAtBlockHash",
    "signingPacket.freshnessCheck.verifiedAtBlockHash",
  );
  if (freshnessBlockNumber < signingBlock || freshnessBlockNumber >= executionBlock) {
    throw new Error("Signing-packet freshness block is outside the signing-to-execution window");
  }
  await canonicalBlock(ethers.provider, freshnessBlockNumber, freshnessBlockHash, "signing-packet freshness");
  const freshnessSafeSnapshot = await readCanonicalNaraSafeEvidence(
    ethers.provider,
    production.safe,
    production.safeCodeHash,
    freshnessBlockNumber,
  );
  if (freshnessSafeSnapshot.nonce !== signingSafeSnapshot.nonce) {
    throw new Error("Safe nonce changed between the signing snapshot and packet freshness check");
  }
  const expectedFreshnessCheck = {
    verifiedAtBlock: freshnessSafeSnapshot.verifiedAtBlock,
    verifiedAtBlockHash: freshnessSafeSnapshot.verifiedAtBlockHash,
    safeNonce: freshnessSafeSnapshot.nonce,
    matchesSigningNonce: true,
  };
  const expectedSigningBatchPath =
    `deployments/UNEXECUTED-v4-position-nft-phase2-safe-batch-${signingBlock}` +
    `-nonce-${signingSafeSnapshot.nonce}.json`;
  if (!existsSync(expectedSigningBatchPath)) {
    throw new Error(`Exact Safe Tx Builder import is missing: ${expectedSigningBatchPath}`);
  }
  if (sha256(readFileSync(expectedSigningBatchPath)) !== pendingSafeFinalization.batchSha256) {
    throw new Error("Exact Safe Tx Builder import bytes differ from the embedded canonical batch");
  }
  const signingBlockTimestamp = Number(signingBlockEvidence.timestamp);
  if (!Number.isSafeInteger(signingBlockTimestamp) || signingBlockTimestamp <= 0) {
    throw new Error("Signing block timestamp is invalid");
  }
  const expectedSigningPacket = canonicalPositionNftPhase2SigningPacket({
    createdAt: new Date(signingBlockTimestamp * 1_000).toISOString(),
    packetPath: signingPacketPath,
    pendingManifestPath: PENDING_MANIFEST,
    pendingManifestSha256: pendingSha256,
    sourceCommit,
    evidenceCommit,
    releaseCommit,
    sourceVerification: validatedSourceVerification,
    sourceVerificationArtifact: { path: SOURCE_EVIDENCE, sha256: sourceEvidenceSha256 },
    signingBlockNumber: signingBlock,
    signingBlockHash,
    signingBlockTimestamp,
    productionRuntime: {
      changeId: production.changeId,
      manifestPath: PRODUCTION_CORE_MANIFEST,
      manifestSha256: production.manifestSha256,
      originCommit: production.originCommit,
      verifiedAtBlock: signingBlock,
      verifiedAtBlockHash: signingBlockHash,
      contracts: productionRuntime,
    },
    coreContainment: signingCoreContainment,
    positionNftPhase2Runtime: {
      verifiedAtBlock: signingBlock,
      verifiedAtBlockHash: signingBlockHash,
      contracts: phase2Runtime,
    },
    safeSnapshot: signingSafeSnapshot,
    positionNft: {
      address: nftAddress,
      startBlock: nftStartBlock,
      runtimeCodeHash: phase2Runtime.NARAPositionNFTV4.codeHash,
      verifiedAtBlock: signingBlock,
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
    batch: canonicalBatch,
    batchSha256: pendingSafeFinalization.batchSha256,
    signingBatchPath: expectedSigningBatchPath,
    safeTxHash: signingPlan.safeTxHash,
    safeBatchPlan: signingPlan,
    freshnessCheck: expectedFreshnessCheck,
  });
  if (canonicalJson(signingPacket) !== canonicalJson(expectedSigningPacket)) {
    throw new Error("Signing packet contains missing, extra, or non-reproducible evidence fields");
  }

  const finalManifest = {
    ...pending,
    evidenceState: "configured_source_verified",
    finalizedAt: new Date(Number(finalBlock.timestamp) * 1_000).toISOString(),
    supersedes: { path: PENDING_MANIFEST, sha256: pendingSha256 },
    policy: {
      ...pending.policy,
      royaltiesFrozen: true,
      claimFeesFrozen: true,
      finalizationRequired: false,
    },
    readback: {
      ...pending.readback,
      name,
      symbol,
      nextTokenId: nextTokenId.toString(),
      genesisMinterEventCount: genesisLogs.length,
      finalReadbackBlock: finalBlockNumber,
      finalReadbackBlockHash: finalBlock.hash,
    },
    publicMintSurface: {
      permissionlessFromBlock: nftStartBlock,
      observedThroughBlock: finalBlockNumber,
      observedMintCount: positionMints.length,
      nextTokenId: nextTokenId.toString(),
      mints: positionMints,
    },
    safeFinalization: {
      ...pendingSafeFinalization,
      status: "executed_verified",
      signingPacketPath,
      signingPacketSha256,
      safeExecutionTransactionHash,
      safeExecution,
    },
    sourceVerification,
    sourceVerificationArtifact: { path: SOURCE_EVIDENCE, sha256: sourceEvidenceSha256 },
    finalization: {
      signingPacketPath,
      signingPacketSha256,
      signingPacket,
      safeExecutionTransactionHash,
      safeExecution,
      safeAfterExecution,
      finalizationEvents,
      readbackBlockNumber: finalBlockNumber,
      readbackBlockHash: finalBlock.hash,
      coreContainment: finalCoreContainment,
      postState: {
        owner: ethers.getAddress(owner),
        pendingOwner: ethers.getAddress(pendingOwner),
        royaltyReceiver: ethers.getAddress(royaltyInfo[0]),
        royaltyAmountForTenThousand: royaltyInfo[1].toString(),
        royaltiesFrozen: royaltyFrozen,
        naraClaimFeeBps: naraFee.toString(),
        tokenClaimFeeBps: tokenFee.toString(),
        claimFeeRecipient: ethers.getAddress(recipient),
        claimFeesFrozen: claimFrozen,
        genesisRewardDistributor: ethers.getAddress(genesisDistributor),
        genesisMintersFrozen: genesisFrozen,
        genesisMinterEventCount: genesisLogs.length,
        positionMintedEventCount: positionMints.length,
        nextTokenId: nextTokenId.toString(),
      },
    },
  };
  const output = prettyJson(finalManifest);
  durableWriteNew(FINAL_MANIFEST, output);
  if (readFileSync(FINAL_MANIFEST, "utf8") !== output) throw new Error("Final manifest did not reproduce after write");
  console.log(JSON.stringify({
    changeId: POSITION_NFT_PHASE2_CHANGE_ID,
    finalManifest: FINAL_MANIFEST,
    finalManifestSha256: sha256(output),
    positionNft: nftAddress,
    safeExecutionTransactionHash,
    readbackBlock: finalBlockNumber,
    sourceVerification: "verified",
    integrationReady: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(sanitizedError(error));
  console.error("No transaction was signed or sent. Final evidence was not authorized for downstream use.");
  process.exitCode = 1;
});
