import { ethers } from "ethers";

export const BPS = 10_000n;
export const Q192 = 1n << 192n;
export const MIN_SLIPPAGE_BPS = 10n;
export const MAX_SLIPPAGE_BPS = 1_000n;
export const DEFAULT_SMOKE_SLIPPAGE_BPS = 500n;

const POOL_MANAGER_ABI = [
  "function extsload(bytes32 slot) view returns (bytes32)",
];

export function requiredExactAmount(name: string, expected: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing env: ${name}. Set it explicitly to ${expected}.`);
  }
  if (value !== expected) {
    throw new Error(`${name} must be exactly ${expected}; received ${value}`);
  }
  return value;
}

export function boundedSlippageBps(raw: string | undefined): bigint {
  const value = raw?.trim() || DEFAULT_SMOKE_SLIPPAGE_BPS.toString();
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid V4_SMOKE_SLIPPAGE_BPS: ${value}`);
  }
  const bps = BigInt(value);
  if (bps < MIN_SLIPPAGE_BPS || bps > MAX_SLIPPAGE_BPS) {
    throw new Error(
      `V4_SMOKE_SLIPPAGE_BPS must be between ${MIN_SLIPPAGE_BPS} and ${MAX_SLIPPAGE_BPS} bps`,
    );
  }
  return bps;
}

export async function readSqrtPriceX96(
  provider: ethers.Provider,
  poolManagerAddress: string,
  poolId: string,
): Promise<bigint> {
  const poolManager = new ethers.Contract(poolManagerAddress, POOL_MANAGER_ABI, provider);
  const poolStateSlot = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [poolId, ethers.zeroPadValue("0x06", 32)],
    ),
  );
  const rawSlot0 = await poolManager.extsload(poolStateSlot) as string;
  const sqrtPriceX96 = BigInt(rawSlot0) & ((1n << 160n) - 1n);
  if (sqrtPriceX96 === 0n) {
    throw new Error("Cannot calculate a protected swap minimum: pool is uninitialized");
  }
  return sqrtPriceX96;
}

export function calculateSpotMinimum(params: {
  amountInAfterHookFee: bigint;
  sqrtPriceX96: bigint;
  inputIsCurrency0: boolean;
  poolFeePips: number;
  slippageBps: bigint;
}): bigint {
  const { amountInAfterHookFee, sqrtPriceX96, inputIsCurrency0, poolFeePips, slippageBps } = params;
  if (amountInAfterHookFee <= 0n) throw new Error("Swap input after hook fee must be positive");
  if (sqrtPriceX96 <= 0n) throw new Error("sqrtPriceX96 must be positive");
  if (!Number.isInteger(poolFeePips) || poolFeePips < 0 || poolFeePips >= 1_000_000) {
    throw new Error(`Invalid pool fee: ${poolFeePips}`);
  }
  if (slippageBps < MIN_SLIPPAGE_BPS || slippageBps > MAX_SLIPPAGE_BPS) {
    throw new Error("Slippage is outside the permitted bounds");
  }

  const afterPoolFee = amountInAfterHookFee * BigInt(1_000_000 - poolFeePips) / 1_000_000n;
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  const spotOutput = inputIsCurrency0
    ? afterPoolFee * priceX192 / Q192
    : afterPoolFee * Q192 / priceX192;
  const minimum = spotOutput * (BPS - slippageBps) / BPS;
  if (minimum <= 0n) {
    throw new Error("Calculated minimum output is zero");
  }
  return minimum;
}
