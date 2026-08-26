import { createHash } from "node:crypto";
import { ethers } from "ethers";
import {
  assertCanonicalV4PoolConfig,
  canonicalProductionV4Deployment,
  type ProductionV4Deployment,
  type V4LiveConfig,
} from "../lib/v4LiveConfig.js";

export const BASE_V4_QUOTER = "0x0d5e0F971ED27FBfF6c2837bf31316121532048D";

export const POOL_STATE_READER_ABI = [
  "function extsload(bytes32) view returns (bytes32)",
];

function poolStateSlot(poolId: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [poolId, ethers.zeroPadValue("0x06", 32)]
    )
  );
}

function poolLiquiditySlot(poolId: string): string {
  return ethers.toBeHex(BigInt(poolStateSlot(poolId)) + 3n, 32);
}

export async function readPoolStateAt(
  poolManager: ethers.Contract,
  poolId: string,
  blockTag: number
): Promise<{ sqrtPriceX96: bigint; liquidity: bigint }> {
  const [rawSlot0, rawLiquidity] = await Promise.all([
    poolManager.extsload(poolStateSlot(poolId), {
      blockTag,
    }) as Promise<string>,
    poolManager.extsload(poolLiquiditySlot(poolId), {
      blockTag,
    }) as Promise<string>,
  ]);
  return {
    sqrtPriceX96: BigInt(rawSlot0) & ((1n << 160n) - 1n),
    liquidity: BigInt(rawLiquidity) & ((1n << 128n) - 1n),
  };
}

export function midUsdcPerNaraFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  tokenIsCurrency0: boolean
): number {
  if (sqrtPriceX96 <= 0n) throw new Error("pool sqrt price is zero");

  const sqrtRawRatio = Number(sqrtPriceX96) / 2 ** 96;
  const rawCurrency1PerCurrency0 = sqrtRawRatio * sqrtRawRatio;
  const decimalScale = 10 ** 12;
  const mid = tokenIsCurrency0
    ? rawCurrency1PerCurrency0 * decimalScale
    : decimalScale / rawCurrency1PerCurrency0;
  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error("derived pool mid is not a positive finite number");
  }
  return mid;
}

export function productionV4ReadOnlyConfig(
  deployment = canonicalProductionV4Deployment()
): V4LiveConfig {
  const canonicalPoolKey = assertCanonicalV4PoolConfig({
    token: deployment.token,
    base: deployment.base,
    hook: deployment.hook,
    fee: deployment.poolFee,
    tickSpacing: deployment.tickSpacing,
    poolId: deployment.poolId,
  });
  return {
    universalRouter: deployment.universalRouter,
    permit2: deployment.permit2,
    poolManager: deployment.poolManager,
    positionManager: deployment.positionManager,
    token: deployment.token,
    base: deployment.base,
    hook: deployment.hook,
    fee: deployment.poolFee,
    tickSpacing: deployment.tickSpacing,
    lpTokenId: deployment.lpTokenId,
    poolId: deployment.poolId,
    vault: deployment.vault,
    engine: deployment.engine,
    canonicalPoolKey,
  };
}

export function stabilizerConfigFingerprint(
  deployment: ProductionV4Deployment,
  policy: Record<string, string | number | null>
): string {
  const canonical = JSON.stringify({
    chainId: deployment.chainId.toString(),
    manifestSha256: deployment.manifestSha256,
    originCommit: deployment.originCommit,
    poolId: deployment.poolId,
    hook: deployment.hook.toLowerCase(),
    policy,
  });
  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}

export async function verifyProductionV4ReadOnlyRuntime(
  provider: ethers.Provider,
  deployment = canonicalProductionV4Deployment()
): Promise<void> {
  const network = await provider.getNetwork();
  if (network.chainId !== deployment.chainId) {
    throw new Error(
      `Base chain mismatch: expected ${deployment.chainId}, received ${network.chainId}`
    );
  }

  const hashedTargets = [
    ["token", deployment.token],
    ["engine", deployment.engine],
    ["hook", deployment.hook],
    ["vault", deployment.vault],
    ["compounder", deployment.compounder],
    ["safe", deployment.safe],
  ] as const;
  for (const [label, address] of hashedTargets) {
    const code = await provider.getCode(address);
    if (code === "0x") {
      throw new Error(`Production v4 ${label} has no runtime code`);
    }
    const actualHash = ethers.keccak256(code).toLowerCase();
    if (actualHash !== deployment.runtimeCodeHashes[label]) {
      throw new Error(`Production v4 ${label} runtime hash mismatch`);
    }
  }

  for (const [label, address] of [
    ["poolManager", deployment.poolManager],
    ["v4Quoter", BASE_V4_QUOTER],
  ] as const) {
    if ((await provider.getCode(address)) === "0x") {
      throw new Error(`Production v4 ${label} has no runtime code`);
    }
  }
}
