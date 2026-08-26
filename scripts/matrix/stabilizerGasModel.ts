/** Pure conservative gas-cost model for Matrix historical shadow screens. */
export const STABILIZER_GAS_UNITS_FLOOR = 350_000n;
export const STABILIZER_GAS_PRICE_FLOOR_WEI = 10_000_000n;
export const STABILIZER_ETH_PRICE_USDC_ATOMIC = 5_000n * 10n ** 6n;
export const STABILIZER_L1_DATA_BUFFER_USDC_ATOMIC = 50_000n;

const WAD = 10n ** 18n;

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

export function modeledGasUsdc(
  quoteGasEstimate: bigint,
  baseFeePerGas: bigint | null
): bigint {
  if (quoteGasEstimate < 0n) {
    throw new Error("quoteGasEstimate must be non-negative");
  }
  if (baseFeePerGas !== null && baseFeePerGas < 0n) {
    throw new Error("baseFeePerGas must be non-negative or null");
  }

  const doubledQuoteGas = quoteGasEstimate * 2n;
  const gasUnits =
    doubledQuoteGas > STABILIZER_GAS_UNITS_FLOOR
      ? doubledQuoteGas
      : STABILIZER_GAS_UNITS_FLOOR;
  const doubledBaseFee = (baseFeePerGas ?? 0n) * 2n;
  const gasPrice =
    doubledBaseFee > STABILIZER_GAS_PRICE_FLOOR_WEI
      ? doubledBaseFee
      : STABILIZER_GAS_PRICE_FLOOR_WEI;
  const executionUsdc = ceilDiv(
    gasUnits * gasPrice * STABILIZER_ETH_PRICE_USDC_ATOMIC,
    WAD
  );
  return executionUsdc + STABILIZER_L1_DATA_BUFFER_USDC_ATOMIC;
}
