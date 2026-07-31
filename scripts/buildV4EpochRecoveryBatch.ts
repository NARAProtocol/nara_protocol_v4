/**
 * Builds, simulates, and writes one Safe Transaction Builder batch containing
 * every bounded call needed to recover the current deployed-engine backlog.
 * It never signs or submits a transaction.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";
import {
  ENGINE_ABI,
  ERC20_ABI,
  planEpochBatches,
  readHealth,
} from "./maintainV4Epochs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const BASE_CHAIN_ID = 8453n;
const BATCH_SIZE = 100;
const MAX_BATCHES = 10;
const SAFE_SINGLE_TX_STEPS = 200;

export type RecoveryCall = { functionName: "syncEmissionReserve" | "advanceEpochs"; args: bigint[] };

export function recoveryCallPlan(
  backlog: bigint,
  includeReserveSync: boolean,
  batchSize = BATCH_SIZE,
  maxBatches = MAX_BATCHES,
): RecoveryCall[] {
  const batches = planEpochBatches(backlog, batchSize, maxBatches);
  if (batches.reduce((sum, value) => sum + value, 0n) < backlog) {
    throw new Error("Configured Safe batch cannot clear the observed backlog");
  }
  return [
    ...(includeReserveSync ? [{ functionName: "syncEmissionReserve" as const, args: [] }] : []),
    // A call safely stops early when the engine becomes current. Give the Safe
    // signing window one full batch of capacity per call instead of encoding an
    // exact final remainder that becomes stale after the next 15-minute epoch.
    ...batches.map(() => ({ functionName: "advanceEpochs" as const, args: [BigInt(batchSize)] })),
  ];
}

export function recoverySingleTransactionPlan(
  backlog: bigint,
  includeReserveSync: boolean,
  stepsPerTransaction = SAFE_SINGLE_TX_STEPS,
  maxTransactions = MAX_BATCHES,
): RecoveryCall[] {
  const batches = planEpochBatches(backlog, stepsPerTransaction, maxTransactions);
  if (batches.reduce((sum, value) => sum + value, 0n) < backlog) {
    throw new Error("Configured Safe transaction parts cannot clear the observed backlog");
  }
  return [
    ...(includeReserveSync ? [{ functionName: "syncEmissionReserve" as const, args: [] }] : []),
    ...batches.map(() => ({
      functionName: "advanceEpochs" as const,
      args: [BigInt(stepsPerTransaction)],
    })),
  ];
}

async function main(): Promise<void> {
  const engineAddress = ethers.getAddress(requiredEnv("V4_ENGINE"));
  const naraAddress = ethers.getAddress(requiredEnv("V4_NARA_TOKEN"));
  const safe = ethers.getAddress(requiredEnv("V4_SAFE"));
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, Number(BASE_CHAIN_ID), {
    staticNetwork: true,
    batchMaxCount: 1,
  });

  try {
    const [network, engineCode, safeCode, latestBlock] = await Promise.all([
      provider.getNetwork(),
      provider.getCode(engineAddress),
      provider.getCode(safe),
      provider.getBlock("latest"),
    ]);
    if (network.chainId !== BASE_CHAIN_ID) throw new Error(`Expected Base chain ID ${BASE_CHAIN_ID}`);
    if (engineCode === "0x") throw new Error("V4_ENGINE has no runtime code");
    if (safeCode === "0x") throw new Error("V4_SAFE has no runtime code");
    if (!latestBlock) throw new Error("Latest Base block is unavailable");

    const engine = new ethers.Contract(engineAddress, ENGINE_ABI, provider);
    const actualNara = ethers.getAddress(await engine.NARA() as string);
    if (actualNara !== naraAddress) throw new Error("Engine NARA binding does not match V4_NARA_TOKEN");
    const nara = new ethers.Contract(naraAddress, ERC20_ABI, provider);
    const health = await readHealth(engine, nara, engineAddress);
    if (health.backlog === 0n && health.untrackedDirectReserve === 0n) {
      throw new Error("Engine is already current and has no direct reserve to synchronize");
    }

    const calls = recoveryCallPlan(health.backlog, health.untrackedDirectReserve > 0n);
    const transactions = [];
    let snapshotEstimatedGas = 0n;
    for (const call of calls) {
      const data = engine.interface.encodeFunctionData(call.functionName, call.args);
      await provider.call({ from: safe, to: engineAddress, data });
      const gas = await provider.estimateGas({ from: safe, to: engineAddress, data });
      snapshotEstimatedGas += gas;
      transactions.push({
        to: engineAddress,
        value: "0",
        data,
        contractMethod: null,
        contractInputsValues: null,
      });
    }

    const output = {
      version: "1.0",
      chainId: BASE_CHAIN_ID.toString(),
      createdAt: Date.now(),
      meta: {
        name: "Recover NARA v4 engine epochs",
        description: "Permissionless bounded epoch recovery. Regenerate immediately before Safe execution.",
        txBuilderVersion: "1.18.0",
        createdFromSafeAddress: safe,
        createdFromOwnerAddress: "",
      },
      transactions,
      naraEvidence: {
        changeId: "NARA-20260731-epoch-recovery",
        generatedAtBlock: latestBlock.number,
        generatedAtTimestamp: latestBlock.timestamp,
        engine: engineAddress,
        safe,
        currentEpoch: health.currentEpoch.toString(),
        settledEpoch: health.settledEpoch.toString(),
        observedBacklog: health.backlog.toString(),
        advanceBatches: calls
          .filter(({ functionName }) => functionName === "advanceEpochs")
          .map(({ args }) => args[0].toString()),
        recoveryCapacity: calls
          .filter(({ functionName }) => functionName === "advanceEpochs")
          .reduce((sum, { args }) => sum + args[0], 0n)
          .toString(),
        includesReserveSync: health.untrackedDirectReserve > 0n,
        externalRewardReserve: health.externalRewardReserve.toString(),
        untrackedDirectReserve: health.untrackedDirectReserve.toString(),
        snapshotEstimatedGas: snapshotEstimatedGas.toString(),
        simulation: "Each call succeeded independently from the Safe at the evidence block; sequential behavior is covered by the Base-fork recovery test.",
        operatorRule: "Import, review, sign, and execute before the observed backlog exceeds recoveryCapacity.",
      },
    };

    const outputDir = resolve(repoRoot, "deployments");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const outputPath = resolve(outputDir, "v4-epoch-recovery-safe-batch.json");
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

    // Safe's estimator can reject one large MultiSend even when every inner
    // call is valid. Also write single-call files that avoid MultiSend entirely.
    const singleCalls = recoverySingleTransactionPlan(
      health.backlog,
      health.untrackedDirectReserve > 0n,
    );
    const importDir = resolve(outputDir, "SAFE-IMPORT-SMALL");
    if (!existsSync(importDir)) mkdirSync(importDir, { recursive: true });
    for (let index = 0; index < singleCalls.length; index += 1) {
      const call = singleCalls[index];
      const data = engine.interface.encodeFunctionData(call.functionName, call.args);
      await provider.call({ from: safe, to: engineAddress, data });
      const gas = await provider.estimateGas({ from: safe, to: engineAddress, data });
      const part = {
        version: "1.0",
        chainId: BASE_CHAIN_ID.toString(),
        createdAt: Date.now(),
        meta: {
          name: `Recover NARA v4 epochs - part ${index + 1} of ${singleCalls.length}`,
          description: "One direct engine call; avoids Safe MultiSend gas-estimation failures.",
          txBuilderVersion: "1.18.0",
          createdFromSafeAddress: safe,
          createdFromOwnerAddress: "",
        },
        transactions: [{
          to: engineAddress,
          value: "0",
          data,
          contractMethod: null,
          contractInputsValues: null,
        }],
        naraEvidence: {
          changeId: "NARA-20260731-epoch-recovery",
          generatedAtBlock: latestBlock.number,
          observedBacklog: health.backlog.toString(),
          part: index + 1,
          partCount: singleCalls.length,
          functionName: call.functionName,
          maxSteps: call.args[0]?.toString() ?? null,
          estimatedGasAtSnapshot: gas.toString(),
          executeInNumericOrder: true,
        },
      };
      const letter = String.fromCharCode(65 + index);
      const partPath = resolve(importDir, `01${letter}-RECOVER-EPOCHS-2of3.json`);
      writeFileSync(partPath, `${JSON.stringify(part, null, 2)}\n`);
    }
    console.log(`Safe recovery batch written: ${outputPath}`);
    console.log(`Single-call Safe parts written: ${importDir}`);
    console.log(`Observed backlog: ${health.backlog}`);
    console.log(`Calls: ${calls.map(({ functionName, args }) => `${functionName}(${args.join(",")})`).join(", ")}`);
    console.log("No transaction was signed or submitted.");
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
