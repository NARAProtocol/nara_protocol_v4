/** Build, simulate, and write one Safe batch enabling minimal, measurable Engine fees. */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertProductionV4Runtime,
  currentV4Config,
  productionV4RuntimeBanner,
  requiredBaseRpcUrl,
  requiredEnv,
} from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

const ENGINE_ABI = [
  "function treasury() view returns (address)",
  "function PARAM_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role,address account) view returns (bool)",
  "function lockFeeBps() view returns (uint16)",
  "function claimFeeBps() view returns (uint16)",
  "function lockFeeWei() view returns (uint96)",
  "function unlockFeeWei() view returns (uint96)",
  "function setLockFee(uint16 feeBps)",
  "function setClaimFee(uint16 feeBps)",
  "function setLockEthFee(uint96 feeWei)",
  "function setUnlockEthFee(uint96 feeWei)",
];

export type EngineFeeState = {
  lockFeeBps: bigint;
  claimFeeBps: bigint;
  lockFeeWei: bigint;
  unlockFeeWei: bigint;
};

export type EngineFeeCall = {
  functionName: "setLockFee" | "setClaimFee" | "setLockEthFee" | "setUnlockEthFee";
  args: [bigint];
};

export const ZERO_ENGINE_FEES: EngineFeeState = {
  lockFeeBps: 0n,
  claimFeeBps: 0n,
  lockFeeWei: 0n,
  unlockFeeWei: 0n,
};

// Deliberately small but visible in a 10 NARA lifecycle test.
export const TEST_ENGINE_FEES: EngineFeeState = {
  lockFeeBps: 100n, // 1% of newly locked NARA
  claimFeeBps: 100n, // 1% of Engine ETH allocations only
  lockFeeWei: ethers.parseEther("0.000001"),
  unlockFeeWei: ethers.parseEther("0.000001"),
};

export function assertEngineFeeState(actual: EngineFeeState, expected: EngineFeeState): void {
  for (const key of Object.keys(expected) as (keyof EngineFeeState)[]) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `Engine ${key} changed: expected ${expected[key].toString()}, received ${actual[key].toString()}`,
      );
    }
  }
}

export function engineFeeCallPlan(fees: EngineFeeState): EngineFeeCall[] {
  if (fees.lockFeeBps > 1_000n || fees.claimFeeBps > 1_000n) {
    throw new Error("Engine percentage fee exceeds the contract's 10% cap");
  }
  const maxFlatFee = ethers.parseEther("0.01");
  if (fees.lockFeeWei > maxFlatFee || fees.unlockFeeWei > maxFlatFee) {
    throw new Error("Engine flat ETH fee exceeds the contract's 0.01 ETH cap");
  }
  return [
    { functionName: "setLockFee", args: [fees.lockFeeBps] },
    { functionName: "setClaimFee", args: [fees.claimFeeBps] },
    { functionName: "setLockEthFee", args: [fees.lockFeeWei] },
    { functionName: "setUnlockEthFee", args: [fees.unlockFeeWei] },
  ];
}

async function main(): Promise<void> {
  const config = currentV4Config();
  const safe = ethers.getAddress(requiredEnv("V4_SAFE"));
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, 8453, { staticNetwork: true, batchMaxCount: 1 });

  try {
    const deployment = await assertProductionV4Runtime(provider, config);
    if (safe !== deployment.safe) {
      throw new Error(`V4_SAFE ${safe} does not match the immutable production manifest Safe ${deployment.safe}`);
    }

    const engine = new ethers.Contract(config.engine, ENGINE_ABI, provider);
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("Latest Base block is unavailable");

    const [treasury, paramRole, lockFeeBps, claimFeeBps, lockFeeWei, unlockFeeWei] = await Promise.all([
      engine.treasury() as Promise<string>,
      engine.PARAM_ROLE() as Promise<string>,
      engine.lockFeeBps() as Promise<bigint>,
      engine.claimFeeBps() as Promise<bigint>,
      engine.lockFeeWei() as Promise<bigint>,
      engine.unlockFeeWei() as Promise<bigint>,
    ]);
    const safeHasParamRole = await engine.hasRole(paramRole, safe) as boolean;
    if (!safeHasParamRole) throw new Error("Production Safe does not hold Engine PARAM_ROLE");
    if (ethers.getAddress(treasury) !== deployment.treasury) {
      throw new Error(`Engine treasury ${treasury} does not match production treasury ${deployment.treasury}`);
    }

    const currentFees = { lockFeeBps, claimFeeBps, lockFeeWei, unlockFeeWei };
    assertEngineFeeState(currentFees, ZERO_ENGINE_FEES);

    const plan = engineFeeCallPlan(TEST_ENGINE_FEES);
    const transactions = [];
    for (const call of plan) {
      const method = engine.getFunction(call.functionName);
      await method.staticCall(...call.args, { from: safe });
      transactions.push({
        to: config.engine,
        value: "0",
        data: engine.interface.encodeFunctionData(call.functionName, call.args),
        contractMethod: null,
        contractInputsValues: null,
      });
    }

    const output = {
      version: "1.0",
      chainId: "8453",
      createdAt: Date.now(),
      meta: {
        name: "Enable minimal NARA v4 Engine test fees",
        description: "Four immediate Engine fee setters in one reviewed Safe batch. Hook fees are unchanged.",
        txBuilderVersion: "1.18.0",
        createdFromSafeAddress: safe,
        createdFromOwnerAddress: "",
      },
      transactions,
      naraEvidence: {
        changeId: "NARA-20260815-v4-engine-fee-test",
        blockNumber: block.number,
        blockTimestamp: block.timestamp,
        engine: config.engine,
        safe,
        treasury,
        productionRuntime: productionV4RuntimeBanner(deployment),
        safeHasParamRole,
        preState: Object.fromEntries(Object.entries(currentFees).map(([key, value]) => [key, value.toString()])),
        targetState: Object.fromEntries(Object.entries(TEST_ENGINE_FEES).map(([key, value]) => [key, value.toString()])),
        userVisiblePolicy: {
          newLockNaraFee: "1.00%",
          ethAllocationFee: "1.00% (ETH allocations only; NARA allocations remain fee-free)",
          lockFlatFee: "0.000001 ETH",
          unlockFlatFee: "0.000001 ETH",
          hookFee: "unchanged",
        },
        timing: "All four Engine fees become active immediately when the Safe batch executes; no seven-day delay applies.",
        existingPositions: "Existing matured positions will require the new 0.000001 ETH flat unlock fee after execution.",
        invariant: "Normal CALL operations only. No approvals, transfers, role changes, Hook changes, or automatic submission.",
      },
    };

    const outputDir = resolve(repoRoot, "deployments");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const outputPath = resolve(outputDir, "v4-engine-test-fees-activation-batch.json");
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Safe batch written: ${outputPath}`);
    console.log(`Verified and simulated at Base block ${block.number}. No transaction was signed or submitted.`);
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
