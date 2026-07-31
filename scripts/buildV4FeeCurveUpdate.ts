/**
 * Builds, but never submits, Safe Transaction Builder batches for the reviewed
 * NARA/USDC fee-curve reduction. Run once to propose and again with --finalize
 * after the hook's one-day timelock.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

export type FeeCurve = {
  mediumPressureBps: bigint;
  highPressureBps: bigint;
  extremePressureBps: bigint;
  baseFeeBps: bigint;
  mediumFeeBps: bigint;
  highFeeBps: bigint;
  extremeFeeBps: bigint;
  maxFeeBps: bigint;
};

// Reviewed 2026-07-31 policy: 0.75% floor, no step at 10%, 1% marginal
// fee above 25% depth, and 2% marginal fee above 50% depth. Using the same
// curve in both directions removes the current regressive buy/sell asymmetry.
export const REVIEWED_BALANCED_CURVE: FeeCurve = Object.freeze({
  mediumPressureBps: 1_000n,
  highPressureBps: 2_500n,
  extremePressureBps: 5_000n,
  baseFeeBps: 75n,
  mediumFeeBps: 75n,
  highFeeBps: 100n,
  extremeFeeBps: 200n,
  maxFeeBps: 200n,
});

const HOOK_ABI = [
  "function owner() view returns (address)",
  "function poolRegistered() view returns (bool)",
  "function buyCurve() view returns (uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps)",
  "function sellCurve() view returns (uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps)",
  "function pendingBuyCurve() view returns (tuple(uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps) curve,uint48 eta,bool exists)",
  "function pendingSellCurve() view returns (tuple(uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps) curve,uint48 eta,bool exists)",
  "function setFeeCurve(bool isBuyCurve,(uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps) curve)",
  "function executeFeeCurve(bool isBuyCurve)",
];

function ceilMulDiv(value: bigint, multiplier: bigint, denominator: bigint): bigint {
  const product = value * multiplier;
  return product === 0n ? 0n : ((product - 1n) / denominator) + 1n;
}

export function cumulativeFee(curve: FeeCurve, amountIn: bigint, depth: bigint): bigint {
  if (amountIn === 0n) return 0n;
  if (depth === 0n) return (amountIn * curve.extremeFeeBps) / 10_000n;
  const mediumAt = ceilMulDiv(depth, curve.mediumPressureBps, 10_000n);
  const highAt = ceilMulDiv(depth, curve.highPressureBps, 10_000n);
  const extremeAt = ceilMulDiv(depth, curve.extremePressureBps, 10_000n);

  let end = amountIn < mediumAt ? amountIn : mediumAt;
  let fee = (end * curve.baseFeeBps) / 10_000n;
  if (amountIn <= mediumAt) return fee;
  end = amountIn < highAt ? amountIn : highAt;
  fee += ((end - mediumAt) * curve.mediumFeeBps) / 10_000n;
  if (amountIn <= highAt) return fee;
  end = amountIn < extremeAt ? amountIn : extremeAt;
  fee += ((end - highAt) * curve.highFeeBps) / 10_000n;
  if (amountIn <= extremeAt) return fee;
  return fee + (((amountIn - extremeAt) * curve.extremeFeeBps) / 10_000n);
}

export function curveArray(curve: FeeCurve): bigint[] {
  return [
    curve.mediumPressureBps,
    curve.highPressureBps,
    curve.extremePressureBps,
    curve.baseFeeBps,
    curve.mediumFeeBps,
    curve.highFeeBps,
    curve.extremeFeeBps,
    curve.maxFeeBps,
  ];
}

function normalizeCurve(value: Record<string, bigint>): FeeCurve {
  return {
    mediumPressureBps: value.mediumPressureBps,
    highPressureBps: value.highPressureBps,
    extremePressureBps: value.extremePressureBps,
    baseFeeBps: value.baseFeeBps,
    mediumFeeBps: value.mediumFeeBps,
    highFeeBps: value.highFeeBps,
    extremeFeeBps: value.extremeFeeBps,
    maxFeeBps: value.maxFeeBps,
  };
}

export function curvesEqual(a: FeeCurve, b: FeeCurve): boolean {
  return curveArray(a).every((value, index) => value === curveArray(b)[index]);
}

function safeBatch(safe: string, name: string, transactions: { to: string; value: string; data: string }[]) {
  return {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name,
      description: "Review every call. This file never submits a transaction.",
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: safe,
      createdFromOwnerAddress: "",
    },
    transactions: transactions.map((transaction) => ({
      ...transaction,
      contractMethod: null,
      contractInputsValues: null,
    })),
  };
}

async function main(): Promise<void> {
  const requestedMode = process.env.V4_FEE_CURVE_BUILD_MODE?.trim();
  if (requestedMode && requestedMode !== "propose" && requestedMode !== "finalize") {
    throw new Error("V4_FEE_CURVE_BUILD_MODE must be propose or finalize");
  }
  const finalize = process.argv.includes("--finalize") || requestedMode === "finalize";
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, 8453, { staticNetwork: true, batchMaxCount: 1 });
  try {
    const config = currentV4Config();
    const safe = ethers.getAddress(requiredEnv("V4_SAFE"));
    const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
    const [owner, registered, buy, sell, pendingBuy, pendingSell, latestBlock] = await Promise.all([
      hook.owner() as Promise<string>,
      hook.poolRegistered() as Promise<boolean>,
      hook.buyCurve() as Promise<Record<string, bigint>>,
      hook.sellCurve() as Promise<Record<string, bigint>>,
      hook.pendingBuyCurve() as Promise<{ curve: Record<string, bigint>; eta: bigint; exists: boolean }>,
      hook.pendingSellCurve() as Promise<{ curve: Record<string, bigint>; eta: bigint; exists: boolean }>,
      provider.getBlock("latest"),
    ]);
    if (ethers.getAddress(owner) !== safe) throw new Error(`Hook owner ${owner} is not V4_SAFE ${safe}`);
    if (!registered) throw new Error("Fee policy must not be staged before pool registration");
    if (!latestBlock) throw new Error("Latest Base block is unavailable");

    const currentBuy = normalizeCurve(buy);
    const currentSell = normalizeCurve(sell);
    const iface = hook.interface;
    const transactions: { to: string; value: string; data: string }[] = [];
    let outputName: string;

    if (!finalize) {
      if (curvesEqual(currentBuy, REVIEWED_BALANCED_CURVE) && curvesEqual(currentSell, REVIEWED_BALANCED_CURVE)) {
        throw new Error("Reviewed balanced fee curve is already active");
      }
      if (pendingBuy.exists || pendingSell.exists) {
        throw new Error("A pending fee update already exists; review or execute it before overwriting");
      }
      transactions.push(
        { to: config.hook, value: "0", data: iface.encodeFunctionData("setFeeCurve", [true, REVIEWED_BALANCED_CURVE]) },
        { to: config.hook, value: "0", data: iface.encodeFunctionData("setFeeCurve", [false, REVIEWED_BALANCED_CURVE]) },
      );
      outputName = "v4-fee-curve-proposal-batch.json";
    } else {
      if (!pendingBuy.exists || !pendingSell.exists) throw new Error("Both pending fee curves must exist before finalization");
      if (!curvesEqual(normalizeCurve(pendingBuy.curve), REVIEWED_BALANCED_CURVE)
        || !curvesEqual(normalizeCurve(pendingSell.curve), REVIEWED_BALANCED_CURVE)) {
        throw new Error("Pending fee curves do not match the reviewed balanced policy");
      }
      const now = BigInt(latestBlock.timestamp);
      if (now < pendingBuy.eta || now < pendingSell.eta) {
        throw new Error(`Fee update timelock has not elapsed (buy=${pendingBuy.eta}, sell=${pendingSell.eta}, now=${now})`);
      }
      transactions.push(
        { to: config.hook, value: "0", data: iface.encodeFunctionData("executeFeeCurve", [true]) },
        { to: config.hook, value: "0", data: iface.encodeFunctionData("executeFeeCurve", [false]) },
      );
      outputName = "v4-fee-curve-finalization-batch.json";
    }

    for (const transaction of transactions) {
      await provider.call({ from: safe, to: transaction.to, data: transaction.data, value: 0n });
    }

    const output = {
      ...safeBatch(
        safe,
        finalize ? "Finalize NARA v4 balanced fee curve" : "Propose NARA v4 balanced fee curve",
        transactions,
      ),
      naraEvidence: {
        changeId: "NARA-20260731-fee-policy",
        hook: config.hook,
        safe,
        mode: finalize ? "finalize-after-timelock" : "propose-one-day-timelock",
        reviewedCurve: Object.fromEntries(
          Object.entries(REVIEWED_BALANCED_CURVE).map(([key, value]) => [key, value.toString()]),
        ),
        currentBuy: curveArray(currentBuy).map(String),
        currentSell: curveArray(currentSell).map(String),
        invariant: "buy and sell curves are identical; the 0.75% floor is independent of trade splitting",
      },
    };
    const outputDir = resolve(repoRoot, "deployments");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const outputPath = resolve(outputDir, outputName);
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Safe batch written: ${outputPath}`);
    console.log(finalize
      ? "Finalization calls simulated successfully. Review before Safe execution."
      : "Proposal calls simulated successfully. Execute through the Safe, then wait one day before --finalize.");
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
