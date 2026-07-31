/**
 * Permissionless NARA v4 epoch maintenance.
 *
 * The default mode is read-only. Pass --execute to submit bounded
 * advanceEpochs() transactions from a dedicated, gas-funded keeper key.
 * This script never needs an admin, treasury, or Safe signer.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env"), quiet: true });

const BASE_CHAIN_ID = 8453n;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_BATCHES = 10;
const DEFAULT_CONFIRMATIONS = 1;
const MAX_BATCH_SIZE = 150;
const MAX_BATCHES = 20;

export const ENGINE_ABI = [
  "function NARA() view returns (address)",
  "function currentEpoch() view returns (uint64)",
  "function epochState() view returns (tuple(uint64 epoch,uint64 timestamp,uint256 circulatingSupply,uint256 totalLocked,uint256 activeTotalWeight,uint256 weightedLockShareWad,uint256 stressWad,uint256 betaWad,uint256 horizon,uint256 retentionWad,uint256 baseEmission,uint256 emission,uint256 admittedSupply,uint256 distributedNara,uint256 distributedEth,uint256 treasuryAmount,uint256 warmupFactorWad,uint256 bootstrapWeight,uint256 heartbeat))",
  "function emissionReserve() view returns (uint256)",
  "function rewardReserveAvailable() view returns (uint256)",
  "function trackedEmissionReserve() view returns (uint256)",
  "function totalLocked() view returns (uint256)",
  "function totalPendingNaraRewards() view returns (uint256)",
  "function nextPositionId() view returns (uint256)",
  "function syncEmissionReserve()",
  "function advanceEpochs(uint256 maxSteps) returns (uint256 stepsAdvanced, tuple(uint64 epoch,uint64 timestamp,uint256 circulatingSupply,uint256 totalLocked,uint256 activeTotalWeight,uint256 weightedLockShareWad,uint256 stressWad,uint256 betaWad,uint256 horizon,uint256 retentionWad,uint256 baseEmission,uint256 emission,uint256 admittedSupply,uint256 distributedNara,uint256 distributedEth,uint256 treasuryAmount,uint256 warmupFactorWad,uint256 bootstrapWeight,uint256 heartbeat) lastSnapshot)",
];
export const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"];

export type EpochHealth = {
  currentEpoch: bigint;
  settledEpoch: bigint;
  backlog: bigint;
  localEmissionReserve: bigint;
  externalRewardReserve: bigint;
  trackedEmissionReserve: bigint;
  untrackedDirectReserve: bigint;
  totalLocked: bigint;
  nextPositionId: bigint;
};

export type MaintainerOptions = {
  execute: boolean;
  batchSize: number;
  maxBatches: number;
  confirmations: number;
};

export function positiveInteger(
  raw: string | undefined,
  label: string,
  fallback: number,
  maximum: number,
): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

export function parseMaintainerArgs(args: readonly string[]): MaintainerOptions {
  const valueAfter = (name: string): string | undefined => {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    return value;
  };

  return {
    execute: args.includes("--execute"),
    batchSize: positiveInteger(valueAfter("--batch-size"), "--batch-size", DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE),
    maxBatches: positiveInteger(valueAfter("--max-batches"), "--max-batches", DEFAULT_MAX_BATCHES, MAX_BATCHES),
    confirmations: positiveInteger(valueAfter("--confirmations"), "--confirmations", DEFAULT_CONFIRMATIONS, 20),
  };
}

export function untrackedDirectReserve(
  engineBalance: bigint,
  totalLocked: bigint,
  totalPendingNaraRewards: bigint,
  trackedEmissionReserve: bigint,
): bigint {
  const reserved = totalLocked + totalPendingNaraRewards + trackedEmissionReserve;
  return engineBalance > reserved ? engineBalance - reserved : 0n;
}

export function planEpochBatches(backlog: bigint, batchSize: number, maxBatches: number): bigint[] {
  if (backlog < 0n) throw new Error("Epoch backlog cannot be negative");
  const batches: bigint[] = [];
  let remaining = backlog;
  const size = BigInt(batchSize);
  while (remaining > 0n && batches.length < maxBatches) {
    const next = remaining < size ? remaining : size;
    batches.push(next);
    remaining -= next;
  }
  return batches;
}

export function epochHealthStatus(backlog: bigint): "current" | "jit-recoverable" | "writes-blocked" {
  if (backlog === 0n) return "current";
  if (backlog <= 8n) return "jit-recoverable";
  return "writes-blocked";
}

function formatHealth(health: EpochHealth) {
  return {
    status: epochHealthStatus(health.backlog),
    currentEpoch: health.currentEpoch.toString(),
    settledEpoch: health.settledEpoch.toString(),
    backlog: health.backlog.toString(),
    localEmissionReserveNara: ethers.formatUnits(health.localEmissionReserve, 18),
    externalRewardReserveNara: ethers.formatUnits(health.externalRewardReserve, 18),
    trackedEmissionReserveNara: ethers.formatUnits(health.trackedEmissionReserve, 18),
    untrackedDirectReserveNara: ethers.formatUnits(health.untrackedDirectReserve, 18),
    totalLockedNara: ethers.formatUnits(health.totalLocked, 18),
    nextPositionId: health.nextPositionId.toString(),
  };
}

export async function readHealth(
  engine: ethers.Contract,
  nara: ethers.Contract,
  engineAddress: string,
): Promise<EpochHealth> {
  const [currentEpoch, state, localEmissionReserve, externalRewardReserve, trackedEmissionReserve,
    totalLocked, totalPendingNaraRewards, nextPositionId, engineBalance] = await Promise.all([
    engine.currentEpoch() as Promise<bigint>,
    engine.epochState() as Promise<{ epoch: bigint }>,
    engine.emissionReserve() as Promise<bigint>,
    engine.rewardReserveAvailable() as Promise<bigint>,
    engine.trackedEmissionReserve() as Promise<bigint>,
    engine.totalLocked() as Promise<bigint>,
    engine.totalPendingNaraRewards() as Promise<bigint>,
    engine.nextPositionId() as Promise<bigint>,
    nara.balanceOf(engineAddress) as Promise<bigint>,
  ]);
  const settledEpoch = state.epoch;
  if (settledEpoch > currentEpoch) throw new Error("Engine settled epoch is ahead of its clock");
  return {
    currentEpoch,
    settledEpoch,
    backlog: currentEpoch - settledEpoch,
    localEmissionReserve,
    externalRewardReserve,
    trackedEmissionReserve,
    untrackedDirectReserve: untrackedDirectReserve(
      engineBalance,
      totalLocked,
      totalPendingNaraRewards,
      trackedEmissionReserve,
    ),
    totalLocked,
    nextPositionId,
  };
}

async function postAlert(payload: Record<string, unknown>): Promise<void> {
  const webhookUrl = process.env.V4_EPOCH_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "nara-v4-epoch-maintainer", ...payload }),
    });
    if (!response.ok) console.error(`Epoch alert webhook returned HTTP ${response.status}`);
  } catch (error) {
    console.error(`Epoch alert webhook failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

async function postHeartbeat(health: EpochHealth): Promise<void> {
  const heartbeatUrl = process.env.V4_EPOCH_HEARTBEAT_URL?.trim();
  if (!heartbeatUrl) return;
  const response = await fetch(heartbeatUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "nara-v4-epoch-maintainer",
      status: epochHealthStatus(health.backlog),
      currentEpoch: health.currentEpoch.toString(),
      settledEpoch: health.settledEpoch.toString(),
      backlog: health.backlog.toString(),
    }),
  });
  if (!response.ok) throw new Error(`Epoch heartbeat returned HTTP ${response.status}`);
}

async function sendWithMargin(
  label: string,
  estimate: () => Promise<bigint>,
  send: (gasLimit: bigint) => Promise<ethers.ContractTransactionResponse>,
  confirmations: number,
): Promise<string> {
  const estimatedGas = await estimate();
  const transaction = await send((estimatedGas * 120n) / 100n);
  console.log(`${label}: ${transaction.hash}`);
  const receipt = await transaction.wait(confirmations);
  if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed`);
  return transaction.hash;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseMaintainerArgs(args);
  const engineAddress = ethers.getAddress(requiredEnv("V4_ENGINE"));
  const expectedNara = ethers.getAddress(requiredEnv("V4_NARA_TOKEN"));
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, Number(BASE_CHAIN_ID), {
    staticNetwork: true,
    batchMaxCount: 1,
  });

  try {
    const network = await provider.getNetwork();
    if (network.chainId !== BASE_CHAIN_ID) {
      throw new Error(`Expected Base mainnet chainId ${BASE_CHAIN_ID}, got ${network.chainId}`);
    }
    if ((await provider.getCode(engineAddress)) === "0x") throw new Error("V4_ENGINE has no runtime code");

    const readEngine = new ethers.Contract(engineAddress, ENGINE_ABI, provider);
    const actualNara = ethers.getAddress(await readEngine.NARA() as string);
    if (actualNara !== expectedNara) {
      throw new Error(`Engine NARA mismatch: expected ${expectedNara}, got ${actualNara}`);
    }
    const nara = new ethers.Contract(expectedNara, ERC20_ABI, provider);
    let health = await readHealth(readEngine, nara, engineAddress);

    console.log(`NARA v4 epoch maintainer (${options.execute ? "execute" : "read-only"})`);
    console.log(JSON.stringify(formatHealth(health), null, 2));
    if (!options.execute) {
      const batches = planEpochBatches(health.backlog, options.batchSize, options.maxBatches);
      console.log(`Planned advanceEpochs batches: ${batches.map(String).join(", ") || "none"}`);
      if (batches.reduce((sum, value) => sum + value, 0n) < health.backlog) {
        throw new Error("Configured batch limit cannot clear the observed backlog");
      }
      return;
    }

    const operationsKey = process.env.V4_OPERATIONS_KEEPER_PRIVATE_KEY?.trim();
    const signer = new ethers.Wallet(
      operationsKey || requiredEnv("V4_EPOCH_KEEPER_PRIVATE_KEY"),
      provider,
    );
    const engine = readEngine.connect(signer) as ethers.Contract;
    const txHashes: string[] = [];
    let batchesUsed = 0;

    if (health.untrackedDirectReserve > 0n) {
      txHashes.push(await sendWithMargin(
        "syncEmissionReserve",
        () => engine.syncEmissionReserve.estimateGas(),
        (gasLimit) => engine.syncEmissionReserve({ gasLimit }),
        options.confirmations,
      ));
      health = await readHealth(readEngine, nara, engineAddress);
      if (health.untrackedDirectReserve !== 0n) {
        throw new Error("Direct engine reserve remains untracked after syncEmissionReserve");
      }
    }

    while (health.backlog > 0n && batchesUsed < options.maxBatches) {
      const steps = health.backlog < BigInt(options.batchSize)
        ? health.backlog
        : BigInt(options.batchSize);
      txHashes.push(await sendWithMargin(
        `advanceEpochs(${steps})`,
        () => engine.advanceEpochs.estimateGas(steps),
        (gasLimit) => engine.advanceEpochs(steps, { gasLimit }),
        options.confirmations,
      ));
      batchesUsed += 1;
      const before = health.settledEpoch;
      health = await readHealth(readEngine, nara, engineAddress);
      if (health.settledEpoch <= before) throw new Error("advanceEpochs did not move the settled epoch");
    }

    console.log("Final engine health");
    console.log(JSON.stringify(formatHealth(health), null, 2));
    if (health.backlog !== 0n) {
      await postAlert({ ...formatHealth(health), status: "stale", engine: engineAddress });
      throw new Error(`Epoch backlog remains ${health.backlog} after ${batchesUsed} batches`);
    }
    await postHeartbeat(health);
    if (txHashes.length > 0 && process.env.V4_EPOCH_NOTIFY_RECOVERY === "true") {
      await postAlert({ status: "recovered", engine: engineAddress, transactions: txHashes.length });
    }
  } catch (error) {
    await postAlert({
      status: "failed",
      engine: engineAddress,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  } finally {
    provider.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
