/**
 * Main Base deployment script for NARA v4 with a NARA/USDC Uniswap v4 pool.
 *
 * This script intentionally uses Base native USDC, not ETH and not WETH.
 * It deploys/wires the protocol but deliberately leaves the v4 pool
 * unregistered and uninitialized. The final Safe must register, initialize,
 * and mint the first LP position in one atomic batch built by
 * scripts/buildAtomicV4PoolLaunch.ts.
 *
 * Required for live Base:
 *   PRIVATE_KEY
 *   BASE_RPC_URL
 *   V4_ADMIN_ADDRESS         final owner/role holder, ideally a Safe
 *   V4_TREASURY_ADDRESS      receives the 1,000,000 NARA supply
 *   V4_TOKEN_NAME            ERC-20 name for the fresh deploy
 *   V4_TOKEN_SYMBOL          ERC-20 symbol for the fresh deploy
 *   V4_INITIAL_NARA_AMOUNT   human NARA amount used for initial pool price/depth
 *   V4_INITIAL_USDC_AMOUNT   human USDC amount used for initial pool price/depth
 *   V4_RELEASE_COMMIT        reviewed full 40-character commit; must equal HEAD
 *                            and already be contained in origin/main
 *
 * Recommended:
 *   V4_COMPOUNDER_ADDRESS    production v4 compounder adapter; wired but left
 *                            unfrozen until a separate live validation succeeds
 *   V4_COMPOUND_KEEPER_ADDRESS authorized keeper for compound/split routes
 *   TREASURY_PRIVATE_KEY     optional, only for EOA test deployments that auto-fund the sealed reward reserve
 *
 * Usage:
 *   npx hardhat run scripts/deployV4BaseUsdc.ts --network base
 */

import hre from "hardhat";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE_PERMIT2, BASE_POSITION_MANAGER, BASE_UNIVERSAL_ROUTER } from "./lib/v4LiveConfig.js";

const BASE_CHAIN_ID = 8453n;
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_UNISWAP_V4_POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
const BASE_SAFE_141_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const BASE_SAFE_141_SINGLETON_CODEHASH = "0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff";
const BASE_SAFE_141_PROXY_CODEHASH = "0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c";
const REQUIRED_HOOK_FLAGS = 0x2088n;
const HOOK_FLAG_MASK = 0x3fffn;
const MIN_BASE_DEPLOYER_BALANCE_WEI = 50_000_000_000_000_000n;
const DEPLOYMENT_DIR = "deployments";
const ACTIVE_BASE_CHECKPOINT = join(DEPLOYMENT_DIR, "v4-base-usdc-in-progress.json");

const ENGINE_CONFIG_TYPE =
  "tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64)";

type HardhatEthers = any;

interface EngineConfig {
  eMax: bigint;
  beta0Wad: bigint;
  mWad: bigint;
  aWad: bigint;
  bWad: bigint;
  cWad: bigint;
  dWad: bigint;
  dripSplitWad: bigint;
  durationLinearWad: bigint;
  durationQuadraticWad: bigint;
  growthFactorWad: bigint;
  minBaseEmission: bigint;
  maxBaseEmission: bigint;
  warmupRateWad: bigint;
  bootstrapInitialWeight: bigint;
  bootstrapDecayWad: bigint;
  activationDelayEpochs: bigint;
  maxLockEpochs: bigint;
}

interface PoolKeyForScript {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

interface ReleaseSourceEvidence {
  releaseCommit: string;
  headCommit: string;
  originMainCommit: string;
  originRemote: string;
  cleanWorkingTree: true;
  containedInOriginMain: true;
}

interface ReceiptEvidence {
  transactionHash: string;
  blockNumber: number;
  blockHash: string | null;
  status: number;
  gasUsed: string;
  contractAddress: string | null;
}

interface JournalStep {
  index: number;
  label: string;
  kind: "deployment" | "call";
  state: "prepared" | "submitted" | "confirmed" | "failed";
  preparedAt: string;
  transactionHash?: string;
  submittedAt?: string;
  receipt?: ReceiptEvidence;
  confirmedAt?: string;
  failedAt?: string;
  expectedContractAddress?: string;
}

interface DeploymentJournalPayload {
  schemaVersion: 1;
  status: "in_progress" | "transactions_complete" | "completed" | "failed_no_resume";
  retryPolicy: string;
  startedAt: string;
  updatedAt: string;
  network: string;
  chainId: string;
  release: ReleaseSourceEvidence | null;
  deployer: string;
  finalAdmin: string;
  treasury: string;
  steps: JournalStep[];
  manifest?: string;
  failure?: {
    at: string;
    step: string | null;
    reason: string;
  };
}

function jsonStringify(payload: unknown): string {
  return JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
}

function durableWrite(path: string, contents: string, append = false): void {
  const fd = openSync(path, append ? "a" : "w");
  try {
    writeFileSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
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

function requireReviewedBaseReleaseSource(): ReleaseSourceEvidence {
  const requested = env("V4_RELEASE_COMMIT").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(requested)) {
    throw new Error("V4_RELEASE_COMMIT must be an explicit full 40-character commit hash");
  }

  const headCommit = gitOutput(["rev-parse", "HEAD"]).toLowerCase();
  if (headCommit !== requested) {
    throw new Error("V4_RELEASE_COMMIT must exactly match the checked-out HEAD");
  }

  const dirty = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (dirty !== "") {
    const entries = dirty.split(/\r?\n/).length;
    throw new Error(`Refusing Base deployment from a dirty working tree (${entries} changed paths)`);
  }

  const configuredOriginRemote = gitOutput(["remote", "get-url", "origin"]);
  if (!/github\.com[/:]NARAProtocol\/nara_protocol_v4(?:\.git)?$/i.test(configuredOriginRemote)) {
    throw new Error("origin is not the authoritative NARAProtocol/nara_protocol_v4 repository");
  }

  const originMainCommit = gitOutput(["rev-parse", "--verify", "origin/main"]).toLowerCase();
  const remoteMainLine = gitOutput(["ls-remote", "origin", "refs/heads/main"]);
  const remoteMainCommit = remoteMainLine.split(/\s+/)[0]?.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(remoteMainCommit ?? "") || remoteMainCommit !== originMainCommit) {
    throw new Error("Local origin/main is not synchronized with the authoritative remote; fetch before release verification");
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", requested, "origin/main"], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
  } catch {
    throw new Error("V4_RELEASE_COMMIT is not contained in the locally fetched origin/main; fetch and verify the protected merge first");
  }

  return {
    releaseCommit: requested,
    headCommit,
    originMainCommit,
    originRemote: "NARAProtocol/nara_protocol_v4",
    cleanWorkingTree: true,
    containedInOriginMain: true,
  };
}

function refuseBlindBaseRetry(): void {
  if (!existsSync(ACTIVE_BASE_CHECKPOINT)) return;
  let priorStatus = "unreadable";
  try {
    const parsed = JSON.parse(readFileSync(ACTIVE_BASE_CHECKPOINT, "utf8")) as { status?: unknown };
    if (typeof parsed.status === "string") priorStatus = parsed.status;
  } catch {
    // An unreadable checkpoint is itself a stop condition.
  }
  throw new Error(
    `Existing Base deployment checkpoint has status ${priorStatus}. ` +
    "A true automatic resume is unsupported: reconcile every recorded hash and onchain address, archive the checkpoint, and obtain a fresh human decision before any retry.",
  );
}

class DeploymentReceiptJournal {
  readonly journalPath: string;
  readonly checkpointPath: string;
  private readonly payload: DeploymentJournalPayload;

  constructor(input: Omit<DeploymentJournalPayload, "schemaVersion" | "status" | "retryPolicy" | "startedAt" | "updatedAt" | "steps">) {
    if (!existsSync(DEPLOYMENT_DIR)) mkdirSync(DEPLOYMENT_DIR, { recursive: true });
    const startedAt = new Date().toISOString();
    const stamp = startedAt.replace(/[:.]/g, "-");
    this.journalPath = join(DEPLOYMENT_DIR, `v4-base-usdc-receipt-journal-${stamp}.jsonl`);
    this.checkpointPath = input.chainId === BASE_CHAIN_ID.toString()
      ? ACTIVE_BASE_CHECKPOINT
      : join(DEPLOYMENT_DIR, `v4-base-usdc-${input.chainId}-in-progress.json`);
    this.payload = {
      schemaVersion: 1,
      status: "in_progress",
      retryPolicy: "NO_BLIND_RETRY: reconcile this journal and all recorded hashes before any fresh deployment attempt.",
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

  prepare(label: string, kind: JournalStep["kind"], expectedContractAddress?: string): JournalStep {
    const step: JournalStep = {
      index: this.payload.steps.length,
      label,
      kind,
      state: "prepared",
      preparedAt: new Date().toISOString(),
      ...(expectedContractAddress ? { expectedContractAddress } : {}),
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

  receipt(label: string): ReceiptEvidence {
    const step = this.payload.steps.find((candidate) => candidate.label === label && candidate.receipt !== undefined);
    if (!step?.receipt) throw new Error(`Missing recorded receipt for ${label}`);
    return step.receipt;
  }

  manifestEvidence(): Record<string, unknown> {
    return {
      status: this.payload.status,
      retryPolicy: this.payload.retryPolicy,
      journalPath: this.journalPath,
      checkpointPath: this.checkpointPath,
      transactions: this.payload.steps.map((step) => ({
        index: step.index,
        label: step.label,
        kind: step.kind,
        transactionHash: step.transactionHash ?? null,
        receipt: step.receipt ?? null,
        expectedContractAddress: step.expectedContractAddress ?? null,
      })),
    };
  }
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value.trim() === "") throw new Error(`Missing env: ${name}`);
  return value.trim();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim();
}

function envFlag(name: string): boolean {
  const value = optionalEnv(name);
  if (value === undefined) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function requireNotDeployerOnBase(
  label: string,
  address_: string,
  deployer: string,
  chainId: bigint,
  bypassFlag: string,
) {
  if (
    chainId === BASE_CHAIN_ID &&
    address_.toLowerCase() === deployer.toLowerCase() &&
    !envFlag(bypassFlag)
  ) {
    throw new Error(`${label} must not be the deployer EOA on Base. Set ${bypassFlag}=1 only for intentional test deployments.`);
  }
}

function envNumber(name: string, fallback: string): number {
  const value = Number(env(name, fallback));
  if (!Number.isInteger(value)) throw new Error(`Invalid integer env: ${name}`);
  return value;
}

function envBigInt(name: string, fallback: string): bigint {
  return BigInt(env(name, fallback));
}

function sortAddresses(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("isqrt only accepts unsigned integers");
  if (value < 2n) return value;
  let x0 = value;
  let x1 = (x0 + value / x0) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> 1n;
  }
  return x0;
}

function sqrtPriceX96FromRawAmounts(amount0: bigint, amount1: bigint): bigint {
  if (amount0 <= 0n || amount1 <= 0n) throw new Error("Initial pool amounts must be positive");
  return isqrt((amount1 * (1n << 192n)) / amount0);
}

function configAsTuple(cfg: EngineConfig): unknown[] {
  return [
    cfg.eMax,
    cfg.beta0Wad,
    cfg.mWad,
    cfg.aWad,
    cfg.bWad,
    cfg.cWad,
    cfg.dWad,
    cfg.dripSplitWad,
    cfg.durationLinearWad,
    cfg.durationQuadraticWad,
    cfg.growthFactorWad,
    cfg.minBaseEmission,
    cfg.maxBaseEmission,
    cfg.warmupRateWad,
    cfg.bootstrapInitialWeight,
    cfg.bootstrapDecayWad,
    cfg.activationDelayEpochs,
    cfg.maxLockEpochs,
  ];
}

function buildEngineConfig(ethers: HardhatEthers): EngineConfig {
  return {
    eMax: ethers.parseUnits(env("CORE_EMAX", "1000000"), 18),
    beta0Wad: ethers.parseUnits(env("CORE_BETA0", "0.008"), 18),
    mWad: ethers.parseUnits(env("CORE_M", "0.25"), 18),
    aWad: ethers.parseUnits(env("CORE_A", "1.25"), 18),
    bWad: ethers.parseUnits(env("CORE_B", "0.90"), 18),
    cWad: ethers.parseUnits(env("CORE_C", "0.50"), 18),
    dWad: ethers.parseUnits(env("CORE_D", "0.50"), 18),
    dripSplitWad: ethers.parseUnits(env("CORE_DRIP_SPLIT", "0.85"), 18),
    durationLinearWad: ethers.parseUnits(env("CORE_DURATION_LINEAR", "0.5"), 18),
    durationQuadraticWad: ethers.parseUnits(env("CORE_DURATION_QUADRATIC", "2.5"), 18),
    growthFactorWad: ethers.parseUnits(env("CORE_GROWTH_FACTOR", "1.000104"), 18),
    minBaseEmission: ethers.parseUnits(env("CORE_MIN_BASE_EMISSION", "0.2"), 18),
    maxBaseEmission: ethers.parseUnits(env("CORE_MAX_BASE_EMISSION", "5"), 18),
    warmupRateWad: ethers.parseUnits(env("CORE_WARMUP_RATE", "0.00133"), 18),
    bootstrapInitialWeight: ethers.parseUnits(env("CORE_BOOTSTRAP_WEIGHT", "10000000"), 18),
    bootstrapDecayWad: ethers.parseUnits(env("CORE_BOOTSTRAP_DECAY", "0.9991"), 18),
    activationDelayEpochs: BigInt(envNumber("CORE_ACTIVATION_DELAY_EPOCHS", "8")),
    maxLockEpochs: BigInt(envNumber("CORE_MAX_LOCK_EPOCHS", "35040")),
  };
}

async function buildEngineCreationCode(
  ethers: HardhatEthers,
  admin: string,
  epochLengthSeconds: bigint,
  configChangeDelaySeconds: bigint,
  initialBaseEmission: bigint,
  cfg: EngineConfig,
): Promise<string> {
  const artifact = await hre.artifacts.readArtifact("contracts/v4/NARAEngine.sol:NARAEngine");
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint64", "uint64", "uint256", ENGINE_CONFIG_TYPE],
    [admin, epochLengthSeconds, configChangeDelaySeconds, initialBaseEmission, configAsTuple(cfg)],
  );
  return artifact.bytecode + encoded.slice(2);
}

function mineHookSalt(
  ethers: HardhatEthers,
  create2Deployer: string,
  initCode: string,
  seedLabel: string,
  maxIterations: number,
): { salt: string; address: string; iterations: number } {
  const initCodeHash = ethers.keccak256(initCode);
  const seedHash = ethers.keccak256(ethers.toUtf8Bytes(seedLabel));

  for (let i = 0; i < maxIterations; i += 1) {
    const salt = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "uint256"], [seedHash, BigInt(i)]),
    );
    const candidate = ethers.getCreate2Address(create2Deployer, salt, initCodeHash);
    if ((BigInt(candidate) & HOOK_FLAG_MASK) === REQUIRED_HOOK_FLAGS) {
      return { salt, address: candidate, iterations: i + 1 };
    }
  }

  throw new Error(`No hook salt found after ${maxIterations} attempts`);
}

function poolId(ethers: HardhatEthers, key: PoolKeyForScript): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address,address,uint24,int24,address)"],
      [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]],
    ),
  );
}

function receiptEvidence(txHash: string, receipt: any): ReceiptEvidence {
  return {
    transactionHash: txHash,
    blockNumber: Number(receipt.blockNumber),
    blockHash: typeof receipt.blockHash === "string" ? receipt.blockHash : null,
    status: Number(receipt.status),
    gasUsed: receipt.gasUsed?.toString?.() ?? "0",
    contractAddress: typeof receipt.contractAddress === "string" ? receipt.contractAddress : null,
  };
}

async function waitTx(
  journal: DeploymentReceiptJournal,
  label: string,
  txFactory: () => Promise<any>,
  confirmations = 1,
  expectedContractAddress?: string,
): Promise<ReceiptEvidence> {
  const step = journal.prepare(label, "call", expectedContractAddress);
  let tx: any;
  try {
    tx = await txFactory();
    journal.submitted(step, tx.hash);
  } catch (error) {
    journal.failedStep(step);
    throw error;
  }
  console.log(`${label}: ${tx.hash}`);
  const networkName = hre.globalOptions.network ?? "default";
  const effectiveConfirmations = networkName === "base" || networkName === "baseSepolia" ? confirmations : 1;
  try {
    const receipt = await tx.wait(effectiveConfirmations);
    if (receipt?.status !== 1) throw new Error(`${label} reverted`);
    const evidence = receiptEvidence(tx.hash, receipt);
    if (expectedContractAddress) evidence.contractAddress = expectedContractAddress;
    journal.confirmed(step, evidence);
    return evidence;
  } catch (error) {
    journal.failedStep(step);
    throw error;
  }
}

async function deployContractRecorded(
  journal: DeploymentReceiptJournal,
  label: string,
  deployFactory: () => Promise<any>,
  confirmations = 1,
): Promise<{ contract: any; receipt: ReceiptEvidence }> {
  const step = journal.prepare(label, "deployment");
  let contract: any;
  let transaction: any;
  try {
    contract = await deployFactory();
    transaction = contract.deploymentTransaction();
    if (!transaction?.hash) throw new Error(`${label} did not expose a deployment transaction`);
    journal.submitted(step, transaction.hash);
  } catch (error) {
    journal.failedStep(step);
    throw error;
  }

  console.log(`${label}: ${transaction.hash}`);
  const networkName = hre.globalOptions.network ?? "default";
  const effectiveConfirmations = networkName === "base" || networkName === "baseSepolia" ? confirmations : 1;
  try {
    const rawReceipt = await transaction.wait(effectiveConfirmations);
    if (rawReceipt?.status !== 1) throw new Error(`${label} reverted`);
    const address = await contract.getAddress();
    const evidence = receiptEvidence(transaction.hash, rawReceipt);
    evidence.contractAddress = address;
    step.expectedContractAddress = address;
    journal.confirmed(step, evidence);
    return { contract, receipt: evidence };
  } catch (error) {
    journal.failedStep(step);
    throw error;
  }
}

async function runtimeCodeEvidence(
  ethers: HardhatEthers,
  entries: Record<string, string | null>,
  verificationBlock: number,
): Promise<Record<string, { address: string; codeHash: string; codeSizeBytes: number; verifiedAtBlock: number } | null>> {
  const evidence: Record<string, {
    address: string;
    codeHash: string;
    codeSizeBytes: number;
    verifiedAtBlock: number;
  } | null> = {};
  for (const [label, address] of Object.entries(entries)) {
    if (address === null) {
      evidence[label] = null;
      continue;
    }
    const code = await ethers.provider.getCode(address, verificationBlock);
    if (code === "0x") throw new Error(`${label} has no runtime code while building deployment evidence`);
    evidence[label] = {
      address,
      codeHash: ethers.keccak256(code),
      codeSizeBytes: (code.length - 2) / 2,
      verifiedAtBlock: verificationBlock,
    };
  }
  return evidence;
}

function writeDeploymentLog(payload: Record<string, unknown>): string {
  if (!existsSync(DEPLOYMENT_DIR)) mkdirSync(DEPLOYMENT_DIR, { recursive: true });
  const file = join(DEPLOYMENT_DIR, `v4-base-usdc-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  durableWrite(file, `${jsonStringify(payload)}\n`);
  console.log(`Deployment log written: ${file}`);
  return file;
}

function writeCanonicalDeploymentPointers(payload: Record<string, unknown>) {
  if (!existsSync(DEPLOYMENT_DIR)) mkdirSync(DEPLOYMENT_DIR, { recursive: true });
  const latestFile = join(DEPLOYMENT_DIR, "v4-base-usdc-latest.json");
  durableWrite(latestFile, `${jsonStringify(payload)}\n`);
  console.log(`Canonical latest deployment log written: ${latestFile}`);
}

let activeJournal: DeploymentReceiptJournal | undefined;

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection as any;
  const networkName = hre.globalOptions.network ?? "default";
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  if (chainId !== BASE_CHAIN_ID && !envFlag("V4_ALLOW_NON_BASE")) {
    throw new Error(`Refusing non-Base deployment. Connected chainId=${chainId}.`);
  }

  let releaseSource: ReleaseSourceEvidence | null = null;
  if (chainId === BASE_CHAIN_ID) {
    for (const forbiddenFlag of [
      "V4_ALLOW_LEGACY_ADDRESS_FALLBACKS",
      "V4_ALLOW_DEPLOYER_ADMIN",
      "V4_ALLOW_DEPLOYER_TREASURY",
    ]) {
      if (envFlag(forbiddenFlag)) throw new Error(`${forbiddenFlag} is forbidden on Base`);
    }
    releaseSource = requireReviewedBaseReleaseSource();
    refuseBlindBaseRetry();
    if (envFlag("V4_SKIP_DEPLOYMENT_LOG")) {
      throw new Error("V4_SKIP_DEPLOYMENT_LOG is forbidden on Base; durable receipt evidence is mandatory");
    }
    if (optionalEnv("V4_EXISTING_LAUNCHER") !== undefined) {
      throw new Error(
        "V4_EXISTING_LAUNCHER resume is forbidden on Base. Reconcile the prior receipt journal; do not blindly retry a partial deployment.",
      );
    }
  }

  const poolManagerAddress = ethers.getAddress(env("V4_POOL_MANAGER_BASE", BASE_UNISWAP_V4_POOL_MANAGER));
  const usdcAddress = ethers.getAddress(env("V4_BASE_USDC_ADDRESS", BASE_USDC));
  if (usdcAddress !== BASE_USDC) {
    throw new Error("V4_BASE_USDC_ADDRESS must be Base native USDC. This script is USDC-only.");
  }

  const requireExplicitV4Addresses = chainId === BASE_CHAIN_ID && !envFlag("V4_ALLOW_LEGACY_ADDRESS_FALLBACKS");
  const finalAdmin = ethers.getAddress(
    requireExplicitV4Addresses
      ? env("V4_ADMIN_ADDRESS")
      : env("V4_ADMIN_ADDRESS", optionalEnv("ROLE_HOLDER_ADDRESS") ?? deployer.address),
  );
  const treasury = ethers.getAddress(
    requireExplicitV4Addresses
      ? env("V4_TREASURY_ADDRESS")
      : env("V4_TREASURY_ADDRESS", optionalEnv("TREASURY_ADDRESS") ?? deployer.address),
  );
  requireNotDeployerOnBase("V4_ADMIN_ADDRESS", finalAdmin, deployer.address, chainId, "V4_ALLOW_DEPLOYER_ADMIN");
  requireNotDeployerOnBase("V4_TREASURY_ADDRESS", treasury, deployer.address, chainId, "V4_ALLOW_DEPLOYER_TREASURY");

  let treasurySigner: any = null;
  const treasuryKey = optionalEnv("TREASURY_PRIVATE_KEY");
  if (treasuryKey !== undefined) {
    try {
      treasurySigner = new ethers.Wallet(treasuryKey, ethers.provider);
    } catch {
      throw new Error("TREASURY_PRIVATE_KEY is invalid");
    }
    if (treasurySigner.address.toLowerCase() !== treasury.toLowerCase()) {
      throw new Error("TREASURY_PRIVATE_KEY does not match V4_TREASURY_ADDRESS");
    }
  }
  if (chainId === BASE_CHAIN_ID && poolManagerAddress !== ethers.getAddress(BASE_UNISWAP_V4_POOL_MANAGER)) {
    throw new Error("V4_POOL_MANAGER_BASE must be the canonical Base Uniswap v4 PoolManager");
  }

  const poolFee = envNumber("V4_POOL_FEE", "3000");
  const tickSpacing = envNumber("V4_TICK_SPACING", "60");
  const epochLengthSeconds = BigInt(envNumber("EPOCH_LENGTH_SECONDS", "900"));
  const configChangeDelaySeconds = BigInt(envNumber("CONFIG_CHANGE_DELAY_SECONDS", "86400"));
  const initialBaseEmission = envBigInt("INITIAL_BASE_EMISSION", "500000000000000000");
  const canonicalTokenName = "NARA";
  const canonicalTokenSymbol = "NARA";
  const tokenName = env("V4_TOKEN_NAME", canonicalTokenName);
  const tokenSymbol = env("V4_TOKEN_SYMBOL", canonicalTokenSymbol);
  const initialNaraAmount = ethers.parseUnits(env("V4_INITIAL_NARA_AMOUNT"), 18);
  const initialUsdcAmount = ethers.parseUnits(env("V4_INITIAL_USDC_AMOUNT"), 6);
  const emissionReserveAmount = ethers.parseUnits(env("V4_EMISSION_RESERVE_NARA", "650000"), 18);
  const hookSaltLabel = env("V4_HOOK_SALT_LABEL", "NARA-V4-BASE-USDC-HOOK-1");
  const engineSalt = ethers.keccak256(ethers.toUtf8Bytes(env("V4_ENGINE_SALT_LABEL", "NARA-V4-BASE-USDC-ENGINE-1")));
  const maxHookSaltIterations = envNumber("V4_HOOK_SALT_MAX_ITERATIONS", "2000000");
  const compounder = optionalEnv("V4_COMPOUNDER_ADDRESS");
  const compoundKeeper = optionalEnv("V4_COMPOUND_KEEPER_ADDRESS");
  const skipCompounder = envFlag("V4_SKIP_COMPOUNDER");

  if (compounder === undefined && !skipCompounder) {
    throw new Error("Missing V4_COMPOUNDER_ADDRESS. Set it, or set V4_SKIP_COMPOUNDER=1 to deploy with pool-fee accumulation only.");
  }
  if (poolFee <= 0 || poolFee >= 1_000_000) throw new Error("V4_POOL_FEE must be between 1 and 999999");
  if (tickSpacing <= 0 || tickSpacing > 32767) throw new Error("V4_TICK_SPACING must be between 1 and 32767");
  if (chainId === BASE_CHAIN_ID && (poolFee !== 3_000 || tickSpacing !== 60)) {
    throw new Error("Base launch requires canonical pool fee 3000 and tick spacing 60");
  }
  if (initialNaraAmount <= 0n || initialUsdcAmount <= 0n) {
    throw new Error("V4_INITIAL_NARA_AMOUNT and V4_INITIAL_USDC_AMOUNT must be positive");
  }
  if (tokenName !== canonicalTokenName || tokenSymbol !== canonicalTokenSymbol) {
    throw new Error(
      `Token identity is frozen as ${canonicalTokenName} (${canonicalTokenSymbol}); ` +
      "V4_TOKEN_NAME and V4_TOKEN_SYMBOL must match the canonical values.",
    );
  }

  console.log("NARA v4 Base USDC deployment");
  console.log("Network:      ", networkName, chainId.toString());
  console.log("Deployer:     ", deployer.address);
  console.log("Final admin:  ", finalAdmin);
  console.log("Treasury:     ", treasury);
  console.log("PoolManager:  ", poolManagerAddress);
  console.log("USDC:         ", usdcAddress);
  console.log("Token name:   ", tokenName);
  console.log("Token symbol: ", tokenSymbol);
  console.log("Pool fee:     ", poolFee);
  console.log("Tick spacing: ", tickSpacing);
  console.log("Initial NARA: ", ethers.formatUnits(initialNaraAmount, 18));
  console.log("Initial USDC: ", ethers.formatUnits(initialUsdcAmount, 6));
  console.log("");

  if (chainId === BASE_CHAIN_ID) {
    for (const [label, address] of [
      ["PoolManager", poolManagerAddress],
      ["USDC", usdcAddress],
      ["final admin Safe", finalAdmin],
      ["Safe 1.4.1 singleton", BASE_SAFE_141_SINGLETON],
    ] as const) {
      const code = await ethers.provider.getCode(address);
      if (code === "0x") throw new Error(`${label} has no code at ${address}`);
    }
    const safeInterface = new ethers.Interface([
      "function masterCopy() view returns (address)",
      "function VERSION() view returns (string)",
      "function getThreshold() view returns (uint256)",
      "function getOwners() view returns (address[])",
    ]);
    const safeContract = new ethers.Contract(finalAdmin, safeInterface, ethers.provider);
    const [safeProxyCode, safeSingletonCode, safeMasterCopy, safeVersion, safeThreshold, safeOwners] = await Promise.all([
      ethers.provider.getCode(finalAdmin),
      ethers.provider.getCode(BASE_SAFE_141_SINGLETON),
      safeContract.masterCopy() as Promise<string>,
      safeContract.VERSION() as Promise<string>,
      safeContract.getThreshold() as Promise<bigint>,
      safeContract.getOwners() as Promise<string[]>,
    ]);
    if (ethers.keccak256(safeProxyCode).toLowerCase() !== BASE_SAFE_141_PROXY_CODEHASH) {
      throw new Error("Final admin Safe proxy runtime hash is not the approved Safe 1.4.1 proxy hash");
    }
    if (
      ethers.getAddress(safeMasterCopy) !== ethers.getAddress(BASE_SAFE_141_SINGLETON) ||
      ethers.keccak256(safeSingletonCode).toLowerCase() !== BASE_SAFE_141_SINGLETON_CODEHASH
    ) {
      throw new Error("Final admin Safe is not bound to the approved Base Safe 1.4.1 singleton");
    }
    if (safeVersion !== "1.4.1" || safeThreshold !== 2n || safeOwners.length !== 3) {
      throw new Error("Final admin custody must be the approved Safe v1.4.1 2-of-3 configuration");
    }
    const deployerBalance = await ethers.provider.getBalance(deployer.address);
    if (deployerBalance < MIN_BASE_DEPLOYER_BALANCE_WEI) {
      throw new Error("Base deployer must hold at least 0.05 ETH before the first deployment transaction");
    }
  }

  const cfg = buildEngineConfig(ethers);
  activeJournal = new DeploymentReceiptJournal({
    network: networkName,
    chainId: chainId.toString(),
    release: releaseSource,
    deployer: deployer.address,
    finalAdmin,
    treasury,
  });
  const journal = activeJournal;

  const existingLauncher = optionalEnv("V4_EXISTING_LAUNCHER");
  console.log(existingLauncher ? "Step 1: resume with existing launcher" : "Step 1: deploy launcher");
  let launcherDeploymentReceipt: ReceiptEvidence | null = null;
  let launcher: any;
  if (existingLauncher) {
    launcher = await ethers.getContractAt(
        "contracts/v4/NARALauncher.sol:NARALauncher",
        ethers.getAddress(existingLauncher),
        deployer,
      );
    if ((await ethers.provider.getCode(await launcher.getAddress())) === "0x") {
      throw new Error(`V4_EXISTING_LAUNCHER has no code: ${existingLauncher}`);
    }
  } else {
    const deployed = await deployContractRecorded(
      journal,
      "deploy.NARALauncher",
      () => ethers.deployContract(
        "contracts/v4/NARALauncher.sol:NARALauncher",
        [deployer.address],
        deployer,
      ),
      2,
    );
    launcher = deployed.contract;
    launcherDeploymentReceipt = deployed.receipt;
  }
  const launcherAddress = await launcher.getAddress();
  const launcherAdmin = await launcher.launcherAdmin();
  if (launcherAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`NARALauncher admin mismatch: expected ${deployer.address}, got ${launcherAdmin}`);
  }
  console.log("NARALauncher: ", launcherAddress);
  console.log("Launcher admin:", launcherAdmin);

  console.log("Step 2: launch token and engine");
  const engineCreationCode = await buildEngineCreationCode(
    ethers,
    deployer.address,
    epochLengthSeconds,
    configChangeDelaySeconds,
    initialBaseEmission,
    cfg,
  );
  const launchReceipt = await waitTx(
    journal,
    "launcher.launch",
    () => launcher.launch(treasury, engineCreationCode, engineSalt, tokenName, tokenSymbol),
    2,
  );

  const tokenAddress = await launcher.deployedToken();
  const engineAddress = await launcher.deployedEngine();
  const token = await ethers.getContractAt("contracts/v4/NARAToken.sol:NARAToken", tokenAddress, deployer);
  const engine = await ethers.getContractAt("contracts/v4/NARAEngine.sol:NARAEngine", engineAddress, deployer);
  console.log("NARAToken:     ", tokenAddress);
  console.log("NARAEngine:    ", engineAddress);

  const engineCode = await ethers.provider.getCode(engineAddress);
  if (engineCode === "0x") throw new Error(`Launched engine has no code at ${engineAddress}`);
  if ((await token.FLASH_FEE_SINK()).toLowerCase() !== engineAddress.toLowerCase()) {
    throw new Error("NARAToken FLASH_FEE_SINK does not match launched engine");
  }
  if ((await engine.NARA()).toLowerCase() !== tokenAddress.toLowerCase()) {
    throw new Error("NARAEngine NARA token binding does not match launched token");
  }

  console.log("Step 3: deploy and wire sealed reward reserve");
  let rewardReserveAddress: string | null = null;
  let rewardReserveDeploymentReceipt: ReceiptEvidence | null = null;

  if (emissionReserveAmount > 0n) {
    const deployed = await deployContractRecorded(
      journal,
      "deploy.NARARewardReserve",
      () => ethers.deployContract(
        "NARARewardReserve",
        [deployer.address, emissionReserveAmount],
        deployer,
      ),
      2,
    );
    const rewardReserve = deployed.contract;
    rewardReserveDeploymentReceipt = deployed.receipt;
    rewardReserveAddress = await rewardReserve.getAddress();
    console.log("NARARewardReserve:", rewardReserveAddress);

    await waitTx(journal, "rewardReserve.setNara", () => rewardReserve.setNara(tokenAddress));
    await waitTx(journal, "rewardReserve.setEngine", () => rewardReserve.setEngine(engineAddress));
    await waitTx(journal, "engine.setRewardReserve", () => engine.setRewardReserve(rewardReserveAddress));

    const deployerTokenBalance = await token.balanceOf(deployer.address);
    if (deployerTokenBalance >= emissionReserveAmount) {
      await waitTx(journal, "token.transfer(rewardReserve)", () => token.transfer(rewardReserveAddress, emissionReserveAmount));
    } else {
      if (treasurySigner !== null) {
        const treasuryBalance = await token.balanceOf(treasurySigner.address);
        if (treasuryBalance >= emissionReserveAmount) {
          console.log("Deployer has no NARA — using TREASURY_PRIVATE_KEY for reward deposit.");
          const tokenAsTreasury = token.connect(treasurySigner);
          await waitTx(
            journal,
            "token.transfer(rewardReserve) [treasury]",
            () => tokenAsTreasury.transfer(rewardReserveAddress, emissionReserveAmount),
          );
        } else {
          console.log(`Skipping reward deposit: treasury also has insufficient NARA (${ethers.formatUnits(treasuryBalance, 18)}).`);
          if (envFlag("V4_REQUIRE_REWARD_DEPOSIT")) throw new Error("Required reward deposit was not funded");
        }
      } else {
        const fundingCalldata = token.interface.encodeFunctionData("transfer", [rewardReserveAddress, emissionReserveAmount]);
        console.log(
          `Skipping reward deposit: deployer has ${ethers.formatUnits(deployerTokenBalance, 18)} NARA, ` +
          `needs ${ethers.formatUnits(emissionReserveAmount, 18)} NARA. Fund the sealed reserve from treasury multisig.`,
        );
        console.log(
          `Treasury Safe action required: NARAToken.transfer(${rewardReserveAddress}, ` +
          `${emissionReserveAmount.toString()}) calldata=${fundingCalldata}`,
        );
        if (envFlag("V4_REQUIRE_REWARD_DEPOSIT")) throw new Error("Required reward deposit was not funded");
      }
    }
  } else {
    console.log("Sealed reward reserve skipped because V4_EMISSION_RESERVE_NARA=0.");
  }

  console.log("Step 4: set engine treasury");
  await waitTx(journal, "engine.setTreasury", () => engine.setTreasury(treasury));

  console.log("Step 5: deploy Liquidity Growth vault");
  const vaultDeployment = await deployContractRecorded(
    journal,
    "deploy.NARALiquidityGrowthVault",
    () => ethers.deployContract(
      "contracts/v4/NARALiquidityGrowthVault.sol:NARALiquidityGrowthVault",
      [deployer.address, tokenAddress, usdcAddress],
      deployer,
    ),
    2,
  );
  const vault = vaultDeployment.contract;
  const vaultAddress = await vault.getAddress();
  console.log("NARALiquidityGrowthVault:", vaultAddress);

  console.log("Step 6: deploy CREATE2 hook deployer");
  const create2Deployment = await deployContractRecorded(
    journal,
    "deploy.Create2HookDeployer",
    () => ethers.deployContract(
      "contracts/v4/utils/Create2HookDeployer.sol:Create2HookDeployer",
      [deployer.address],
      deployer,
    ),
    2,
  );
  const create2Deployer = create2Deployment.contract;
  const create2DeployerAddress = await create2Deployer.getAddress();
  console.log("Create2HookDeployer:", create2DeployerAddress);

  console.log("Step 7: mine and deploy production hook");
  const HookFactory = await ethers.getContractFactory(
    "contracts/v4/NARALiquidityGrowthHook.sol:NARALiquidityGrowthHook",
    deployer,
  );
  const hookDeployTx = await HookFactory.getDeployTransaction(
    poolManagerAddress,
    deployer.address,
    tokenAddress,
    usdcAddress,
    vaultAddress,
  );
  const hookInitCode = hookDeployTx.data;
  if (typeof hookInitCode !== "string") throw new Error("Hook init code missing");

  const mined = mineHookSalt(ethers, create2DeployerAddress, hookInitCode, hookSaltLabel, maxHookSaltIterations);
  console.log("Hook salt:     ", mined.salt);
  console.log("Hook address:  ", mined.address);
  console.log("Salt attempts: ", mined.iterations);

  const hookDeploymentReceipt = await waitTx(
    journal,
    "create2.deploy(hook)",
    () => create2Deployer.deploy(mined.salt, hookInitCode, { gasLimit: 7_000_000n }),
    2,
    mined.address,
  );
  let hookCode = await ethers.provider.getCode(mined.address);
  if (hookCode === "0x") {
    await new Promise(resolve => setTimeout(resolve, 4000));
    hookCode = await ethers.provider.getCode(mined.address);
  }
  if (hookCode === "0x") throw new Error("Hook deployment produced no code");

  const hook = await ethers.getContractAt(
    "contracts/v4/NARALiquidityGrowthHook.sol:NARALiquidityGrowthHook",
    mined.address,
    deployer,
  );

  console.log("Step 8: bind vault and hook");
  await waitTx(journal, "vault.setHook", () => vault.setHook(mined.address));
  await waitTx(journal, "vault.setEngine", () => vault.setEngine(engineAddress));
  console.log(
    "REWARD_NOTIFIER_ROLE intentionally not granted: deployed-engine token rewards remain disabled.",
  );
  if (compounder !== undefined) {
    await waitTx(journal, "vault.setCompounder", () => vault.setCompounder(ethers.getAddress(compounder)));
    console.log(
      "Compounder wired but intentionally left unfrozen. Build and execute the separate live validation, " +
      "verify its receipt, then build the one-way freeze transaction.",
    );
  } else {
    console.log("Compounder intentionally left unset. Pool fees will accumulate in the vault.");
  }

  if (compoundKeeper !== undefined) {
    await waitTx(
      journal,
      "vault.setCompoundKeeper",
      () => vault.setCompoundKeeper(ethers.getAddress(compoundKeeper), true),
    );
  }

  const keeperBountyBps = envNumber("V4_KEEPER_BOUNTY_BPS", "0");
  const minCompoundBase = ethers.parseUnits(env("V4_MIN_COMPOUND_BASE_USDC", "0"), 6);
  if (keeperBountyBps !== 0 || minCompoundBase !== 0n) {
    await waitTx(journal, "vault.setKeeperBounty", () => vault.setKeeperBounty(keeperBountyBps, minCompoundBase));
  }

  console.log("Step 9: configure NARA/USDC pool for the later atomic Safe launch");
  const [poolCurrency0, poolCurrency1] = sortAddresses(tokenAddress, usdcAddress);
  const tokenIsCurrency0 = poolCurrency0.toLowerCase() === tokenAddress.toLowerCase();
  const amount0 = tokenIsCurrency0 ? initialNaraAmount : initialUsdcAmount;
  const amount1 = tokenIsCurrency0 ? initialUsdcAmount : initialNaraAmount;
  const sqrtPriceX96 = sqrtPriceX96FromRawAmounts(amount0, amount1);
  const key: PoolKeyForScript = {
    currency0: poolCurrency0,
    currency1: poolCurrency1,
    fee: poolFee,
    tickSpacing,
    hooks: mined.address,
  };
  const id = poolId(ethers, key);

  await waitTx(journal, "hook.setProtocolDepth(USDC)", () => hook.setProtocolDepth(usdcAddress, initialUsdcAmount));
  await waitTx(journal, "hook.setProtocolDepth(NARA)", () => hook.setProtocolDepth(tokenAddress, initialNaraAmount));
  console.log("Pool registration and initialization intentionally deferred to one atomic Safe batch.");

  console.log("Step 10: transfer final admin/owner controls");
  const rewardNotifierRole = ethers.id("REWARD_NOTIFIER_ROLE");
  if (finalAdmin.toLowerCase() !== deployer.address.toLowerCase()) {
    const defaultAdminRole = ethers.ZeroHash;
    const paramRole = ethers.id("PARAM_ROLE");
    const treasuryRole = ethers.id("TREASURY_ROLE");
    for (const role of [defaultAdminRole, paramRole, treasuryRole]) {
      await waitTx(journal, `engine.grantRole(${role})`, () => engine.grantRole(role, finalAdmin));
    }
    for (const role of [paramRole, treasuryRole, rewardNotifierRole, defaultAdminRole]) {
      await waitTx(journal, `engine.renounceRole(${role})`, () => engine.renounceRole(role, deployer.address));
    }
    if (rewardReserveAddress !== null) {
      const rewardReserve = await ethers.getContractAt("NARARewardReserve", rewardReserveAddress, deployer);
      const reserveRoles = [ethers.ZeroHash, ethers.id("ADMIN_ROLE"), ethers.id("ENGINE_SETTER_ROLE")];
      for (const role of reserveRoles) {
        await waitTx(journal, `rewardReserve.grantRole(${role})`, () => rewardReserve.grantRole(role, finalAdmin));
      }
      for (const role of reserveRoles) {
        await waitTx(
          journal,
          `rewardReserve.renounceRole(${role})`,
          () => rewardReserve.renounceRole(role, deployer.address),
        );
      }
    }
    await waitTx(journal, "hook.transferOwnership", () => hook.transferOwnership(finalAdmin));
    await waitTx(journal, "vault.transferOwnership", () => vault.transferOwnership(finalAdmin));
    await waitTx(
      journal,
      "create2Deployer.transferOwnership",
      () => create2Deployer.transferOwnership(finalAdmin),
    );
    const hookPendingOwner = ethers.getAddress(await hook.pendingOwner());
    const vaultPendingOwner = ethers.getAddress(await vault.pendingOwner());
    if (hookPendingOwner !== finalAdmin || vaultPendingOwner !== finalAdmin) {
      throw new Error("Hook/Vault Ownable2Step pending owner mismatch");
    }
    console.log("SAFE ACTION REQUIRED: acceptOwnership() on Hook and Vault before pool registration.");
  } else {
    if (await engine.hasRole(rewardNotifierRole, deployer.address)) {
      await waitTx(
        journal,
        "engine.renounceRole(REWARD_NOTIFIER_ROLE)",
        () => engine.renounceRole(rewardNotifierRole, deployer.address),
      );
    }
    console.log("Final admin is deployer; ownership remains on deployer and token rewards stay disabled.");
  }

  const engineCreationCodeHash = ethers.keccak256(engineCreationCode);
  const hookInitCodeHash = ethers.keccak256(hookInitCode);
  const runtimeEntries: Record<string, string | null> = {
    launcher: launcherAddress,
    token: tokenAddress,
    engine: engineAddress,
    rewardReserve: rewardReserveAddress,
    vault: vaultAddress,
    create2HookDeployer: create2DeployerAddress,
    hook: mined.address,
    compounder: compounder === undefined ? null : ethers.getAddress(compounder),
  };
  if (chainId === BASE_CHAIN_ID) {
    Object.assign(runtimeEntries, {
      safe: finalAdmin,
      poolManager: poolManagerAddress,
      usdc: usdcAddress,
      permit2: BASE_PERMIT2,
      positionManager: BASE_POSITION_MANAGER,
      universalRouter: BASE_UNIVERSAL_ROUTER,
    });
  }
  const verificationBlock = await ethers.provider.getBlockNumber();
  const runtimeCodeHashes = await runtimeCodeEvidence(ethers, runtimeEntries, verificationBlock);
  const safeCodeHash = runtimeCodeHashes.safe?.codeHash ?? null;
  if (chainId === BASE_CHAIN_ID && safeCodeHash === null) {
    throw new Error("Final admin Safe runtime code hash is missing from deployment evidence");
  }
  journal.transactionsComplete();

  const deploymentReceipts = {
    launcher: launcherDeploymentReceipt,
    token: { ...launchReceipt, contractAddress: tokenAddress },
    engine: { ...launchReceipt, contractAddress: engineAddress },
    rewardReserve: rewardReserveDeploymentReceipt,
    vault: vaultDeployment.receipt,
    create2HookDeployer: create2Deployment.receipt,
    hook: hookDeploymentReceipt,
  };
  const deploymentBlocks = {
    launcher: launcherDeploymentReceipt?.blockNumber ?? null,
    token: launchReceipt.blockNumber,
    engine: launchReceipt.blockNumber,
    rewardReserve: rewardReserveDeploymentReceipt?.blockNumber ?? null,
    vault: vaultDeployment.receipt.blockNumber,
    create2HookDeployer: create2Deployment.receipt.blockNumber,
    hook: hookDeploymentReceipt.blockNumber,
  };
  const constructorAndInputEvidence = {
    launcher: {
      constructor: { admin: deployer.address },
    },
    token: {
      deployment: "NARALauncher.launch",
      constructor: { treasury, flashFeeSink: engineAddress, tokenName, tokenSymbol },
    },
    engine: {
      deployment: "NARALauncher.launch CREATE2",
      constructor: {
        admin: deployer.address,
        epochLengthSeconds: epochLengthSeconds.toString(),
        configChangeDelaySeconds: configChangeDelaySeconds.toString(),
        initialBaseEmission: initialBaseEmission.toString(),
        config: configAsTuple(cfg),
      },
      salt: engineSalt,
      creationCodeHash: engineCreationCodeHash,
    },
    rewardReserve: rewardReserveAddress === null ? null : {
      constructor: { admin: deployer.address, rewardAllocation: emissionReserveAmount.toString() },
    },
    vault: {
      constructor: { owner: deployer.address, token: tokenAddress, base: usdcAddress },
    },
    create2HookDeployer: {
      constructor: { owner: deployer.address },
    },
    hook: {
      constructor: {
        poolManager: poolManagerAddress,
        owner: deployer.address,
        token: tokenAddress,
        base: usdcAddress,
        vault: vaultAddress,
      },
      salt: mined.salt,
      initCodeHash: hookInitCodeHash,
      requiredAddressFlags: "0x2088",
    },
    reviewedPoolInputs: {
      poolFee,
      tickSpacing,
      initialNaraAmount: initialNaraAmount.toString(),
      initialUsdcAmount: initialUsdcAmount.toString(),
      sqrtPriceX96: sqrtPriceX96.toString(),
      poolKey: key,
      poolId: id,
    },
    treasurySignerSuppliedAndMatched: treasurySigner !== null,
    minimumBaseDeployerBalanceWei: MIN_BASE_DEPLOYER_BALANCE_WEI.toString(),
  };

  const log: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    network: networkName,
    chainId: chainId.toString(),
    originCommit: releaseSource?.releaseCommit ?? null,
    releaseSource,
    deployer: deployer.address,
    finalAdmin,
    safeCodeHash,
    treasury,
    universalRouter: BASE_UNIVERSAL_ROUTER,
    permit2: BASE_PERMIT2,
    poolManager: poolManagerAddress,
    positionManager: BASE_POSITION_MANAGER,
    usdc: usdcAddress,
    launcher: launcherAddress,
    token: tokenAddress,
    tokenName,
    tokenSymbol,
    engine: engineAddress,
    engineDeploymentTransactionHash: launchReceipt.transactionHash,
    engineDeploymentBlock: launchReceipt.blockNumber,
    rewardNotifierHistory: {
      role: rewardNotifierRole,
      engineDeploymentTransactionHash: launchReceipt.transactionHash,
      engineDeploymentBlock: launchReceipt.blockNumber,
      scanFromBlock: launchReceipt.blockNumber,
    },
    verificationBlock,
    rewardReserve: rewardReserveAddress,
    vault: vaultAddress,
    create2HookDeployer: create2DeployerAddress,
    hook: mined.address,
    hookSalt: mined.salt,
    hookRequiredFlags: "0x2088",
    hookSaltLabel,
    poolKey: key,
    poolId: id,
    poolFee,
    tickSpacing,
    sqrtPriceX96: sqrtPriceX96.toString(),
    poolRegistered: false,
    poolInitialized: false,
    liquiditySeeded: false,
    initialNaraAmount: initialNaraAmount.toString(),
    initialUsdcAmount: initialUsdcAmount.toString(),
    emissionReserveAmount: emissionReserveAmount.toString(),
    engineConfig: configAsTuple(cfg),
    epochLengthSeconds: epochLengthSeconds.toString(),
    configChangeDelaySeconds: configChangeDelaySeconds.toString(),
    initialBaseEmission: initialBaseEmission.toString(),
    deploymentBlocks,
    deploymentReceipts,
    runtimeCodeHashes,
    constructorAndInputEvidence,
    receiptJournal: journal.manifestEvidence(),
    verifierCommands: {
      preflight: "npm run verify:v4:preflight",
      allocations: "npm run verify:v4:allocations",
    },
    nextSteps: [
      "Run npm run verify:v4:preseed",
      "Fund the final admin Safe with the exact approved NARA and USDC seed amounts",
      "Run npm run build:v4:atomic-pool-launch and execute the output as one Safe batch",
      "Run the v4 smoke test before public launch",
    ],
    compounder: compounder ?? null,
    compoundKeeper: compoundKeeper ?? null,
  };
  if (envFlag("V4_SKIP_DEPLOYMENT_LOG")) {
    console.log("Deployment log skipped by V4_SKIP_DEPLOYMENT_LOG=1");
    journal.complete("skipped outside Base");
  } else {
    const manifestPath = writeDeploymentLog(log);
    writeCanonicalDeploymentPointers(log);
    journal.complete(manifestPath);
    log.receiptJournal = journal.manifestEvidence();
    durableWrite(manifestPath, `${jsonStringify(log)}\n`);
    writeCanonicalDeploymentPointers(log);
  }

  console.log("");
  console.log("Deployment complete");
  console.log("NARAToken=", tokenAddress);
  console.log("NARAEngine=", engineAddress);
  console.log("NARALiquidityGrowthVault=", vaultAddress);
  console.log("NARALiquidityGrowthHook=", mined.address);
  console.log("NARA_USDC_POOL_ID=", id);
}

main().catch((error) => {
  try {
    activeJournal?.fail(error);
  } catch {
    // Preserve the original failure. The append-only journal may still contain
    // all events written before a checkpoint write failure.
  }
  console.error(`Deployment failed safely: ${safeErrorMessage(error)}`);
  console.error("Do not blindly retry. Reconcile the receipt journal and onchain state first.");
  process.exitCode = 1;
});
