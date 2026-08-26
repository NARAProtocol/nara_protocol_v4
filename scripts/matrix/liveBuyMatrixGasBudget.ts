export const LIVE_BUY_GAS_ASSUMPTIONS = {
  approvalTransactionCount: 2,
  cleanupTransactionCount: 2,
  approvalGasUnitsPerTransaction: 120_000n,
  tradeGasUnitsPerTransaction: 600_000n,
  cleanupGasUnitsPerTransaction: 120_000n,
  gasUnitsBufferBps: 15_000n,
  baseFeeFloorWei: 10_000_000n,
  gasPriceMultiplierBps: 20_000n,
  l1EthBufferPerTransactionWei: 5_000_000_000_000n,
} as const;

const BPS = 10_000n;

const ceilDiv = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - 1n) / denominator;

export interface LiveBuyMatrixGasBudget {
  approvalTransactionCount: number;
  tradeTransactionCount: number;
  cleanupTransactionCount: number;
  totalTransactionCount: number;
  observedBaseFeePerGasWei: bigint;
  baseFeeFloorWei: bigint;
  modeledGasPriceWei: bigint;
  unbufferedGasUnits: bigint;
  bufferedGasUnits: bigint;
  gasUnitsBufferBps: bigint;
  executionGasWei: bigint;
  l1EthBufferPerTransactionWei: bigint;
  totalL1EthBufferWei: bigint;
  requiredEthWei: bigint;
}

export function calculateLiveBuyMatrixGasBudget(
  baseFeePerGasWei: bigint | null,
  tradeTransactionCount: number
): LiveBuyMatrixGasBudget {
  if (baseFeePerGasWei !== null && baseFeePerGasWei < 0n) {
    throw new Error("baseFeePerGasWei must be non-negative");
  }
  if (
    !Number.isSafeInteger(tradeTransactionCount) ||
    tradeTransactionCount < 1
  ) {
    throw new Error("tradeTransactionCount must be a positive safe integer");
  }

  const assumptions = LIVE_BUY_GAS_ASSUMPTIONS;
  const observedBaseFeePerGasWei = baseFeePerGasWei ?? 0n;
  const baseFeeBasisWei =
    observedBaseFeePerGasWei > assumptions.baseFeeFloorWei
      ? observedBaseFeePerGasWei
      : assumptions.baseFeeFloorWei;
  const modeledGasPriceWei = ceilDiv(
    baseFeeBasisWei * assumptions.gasPriceMultiplierBps,
    BPS
  );
  const unbufferedGasUnits =
    BigInt(assumptions.approvalTransactionCount) *
      assumptions.approvalGasUnitsPerTransaction +
    BigInt(tradeTransactionCount) * assumptions.tradeGasUnitsPerTransaction +
    BigInt(assumptions.cleanupTransactionCount) *
      assumptions.cleanupGasUnitsPerTransaction;
  const bufferedGasUnits = ceilDiv(
    unbufferedGasUnits * assumptions.gasUnitsBufferBps,
    BPS
  );
  const totalTransactionCount =
    assumptions.approvalTransactionCount +
    tradeTransactionCount +
    assumptions.cleanupTransactionCount;
  const executionGasWei = bufferedGasUnits * modeledGasPriceWei;
  const totalL1EthBufferWei =
    BigInt(totalTransactionCount) * assumptions.l1EthBufferPerTransactionWei;

  return {
    approvalTransactionCount: assumptions.approvalTransactionCount,
    tradeTransactionCount,
    cleanupTransactionCount: assumptions.cleanupTransactionCount,
    totalTransactionCount,
    observedBaseFeePerGasWei,
    baseFeeFloorWei: assumptions.baseFeeFloorWei,
    modeledGasPriceWei,
    unbufferedGasUnits,
    bufferedGasUnits,
    gasUnitsBufferBps: assumptions.gasUnitsBufferBps,
    executionGasWei,
    l1EthBufferPerTransactionWei: assumptions.l1EthBufferPerTransactionWei,
    totalL1EthBufferWei,
    requiredEthWei: executionGasWei + totalL1EthBufferWei,
  };
}
