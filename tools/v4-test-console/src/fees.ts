const BPS_DENOMINATOR = 10_000n;

export type TokenFeeBreakdown = {
  grossAmount: bigint;
  feeAmount: bigint;
  netAmount: bigint;
  feeBps: bigint;
};

export function tokenFeeBreakdown(grossAmount: bigint, feeBps: bigint): TokenFeeBreakdown {
  if (grossAmount < 0n) throw new Error("Amount cannot be negative.");
  if (feeBps < 0n || feeBps > BPS_DENOMINATOR) {
    throw new Error("Fee rate must be between 0 and 10,000 basis points.");
  }
  const feeAmount = (grossAmount * feeBps) / BPS_DENOMINATOR;
  return {
    grossAmount,
    feeAmount,
    netAmount: grossAmount - feeAmount,
    feeBps,
  };
}
