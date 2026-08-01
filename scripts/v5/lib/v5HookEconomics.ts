export const HOOK_BPS = 10_000n;
export const UNISWAP_FEE_DENOMINATOR = 1_000_000n;

export type TradeDirection = "buy-token" | "sell-token";

export type PoolInventory = {
  token: bigint;
  base: bigint;
};

export type HookFeeInventory = {
  token: bigint;
  base: bigint;
};

export type ExactInputTradeResult = {
  direction: TradeDirection;
  grossInput: bigint;
  inputHookFee: bigint;
  ammInput: bigint;
  poolFee: bigint;
  priceFormingInput: bigint;
  grossOutput: bigint;
  outputHookFee: bigint;
  netOutput: bigint;
  poolBefore: PoolInventory;
  poolAfter: PoolInventory;
  hookFees: HookFeeInventory;
};

export type SplitOrderResult = {
  parts: number;
  trades: ExactInputTradeResult[];
  grossInput: bigint;
  netOutput: bigint;
  totalInputHookFee: bigint;
  totalOutputHookFee: bigint;
  totalPoolFee: bigint;
  finalPool: PoolInventory;
  hookFees: HookFeeInventory;
};

function requireCondition(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  requireCondition(denominator > 0n, "division denominator must be positive");
  if (numerator === 0n) return 0n;
  return (numerator - 1n) / denominator + 1n;
}

export function hookFeeFor(amount: bigint, feeBps: bigint): bigint {
  requireCondition(amount >= 0n, "amount cannot be negative");
  requireCondition(
    feeBps >= 0n && feeBps <= HOOK_BPS,
    "Hook fee is out of bounds"
  );
  return ceilDiv(amount * feeBps, HOOK_BPS);
}

/** Mirrors Hook V5's conservative integer display calculation. */
export function combinedEffectiveHookFeeBps(perLegFeeBps: bigint): bigint {
  requireCondition(
    perLegFeeBps >= 0n && perLegFeeBps <= HOOK_BPS,
    "Hook fee is out of bounds"
  );
  const retainedBps =
    ((HOOK_BPS - perLegFeeBps) * (HOOK_BPS - perLegFeeBps)) / HOOK_BPS;
  return HOOK_BPS - retainedBps;
}

export function simulateConstantProductExactInput(args: {
  pool: PoolInventory;
  direction: TradeDirection;
  grossInput: bigint;
  hookFeeBps: bigint;
  poolFeePips: bigint;
}): ExactInputTradeResult {
  const { pool, direction, grossInput, hookFeeBps, poolFeePips } = args;
  requireCondition(
    pool.token > 0n && pool.base > 0n,
    "pool reserves must be positive"
  );
  requireCondition(grossInput > 0n, "gross input must be positive");
  requireCondition(
    hookFeeBps > 0n && hookFeeBps < HOOK_BPS,
    "Hook fee must be between zero and 100%"
  );
  requireCondition(
    poolFeePips >= 0n && poolFeePips < UNISWAP_FEE_DENOMINATOR,
    "pool fee is out of bounds"
  );

  const inputHookFee = hookFeeFor(grossInput, hookFeeBps);
  const ammInput = grossInput - inputHookFee;
  requireCondition(
    ammInput > 0n,
    "trade is fully consumed by the input Hook fee"
  );
  const poolFee = ceilDiv(ammInput * poolFeePips, UNISWAP_FEE_DENOMINATOR);
  const priceFormingInput = ammInput - poolFee;
  requireCondition(
    priceFormingInput > 0n,
    "trade is fully consumed by the pool fee"
  );

  const reserveIn = direction === "buy-token" ? pool.base : pool.token;
  const reserveOut = direction === "buy-token" ? pool.token : pool.base;
  const grossOutput =
    (reserveOut * priceFormingInput) / (reserveIn + priceFormingInput);
  requireCondition(
    grossOutput > 0n && grossOutput < reserveOut,
    "trade has zero or invalid AMM output"
  );
  const outputHookFee = hookFeeFor(grossOutput, hookFeeBps);
  const netOutput = grossOutput - outputHookFee;
  requireCondition(
    netOutput > 0n,
    "trade is fully consumed by the output Hook fee"
  );

  const poolAfter =
    direction === "buy-token"
      ? { token: pool.token - grossOutput, base: pool.base + ammInput }
      : { token: pool.token + ammInput, base: pool.base - grossOutput };
  const hookFees =
    direction === "buy-token"
      ? { token: outputHookFee, base: inputHookFee }
      : { token: inputHookFee, base: outputHookFee };

  return {
    direction,
    grossInput,
    inputHookFee,
    ammInput,
    poolFee,
    priceFormingInput,
    grossOutput,
    outputHookFee,
    netOutput,
    poolBefore: { ...pool },
    poolAfter,
    hookFees,
  };
}

function splitAmount(amount: bigint, parts: number): bigint[] {
  requireCondition(
    Number.isSafeInteger(parts) && parts > 0,
    "parts must be a positive safe integer"
  );
  requireCondition(
    amount >= BigInt(parts),
    "gross input is too small for the requested split"
  );
  const quotient = amount / BigInt(parts);
  const remainder = amount % BigInt(parts);
  return Array.from(
    { length: parts },
    (_, index) => quotient + (BigInt(index) < remainder ? 1n : 0n)
  );
}

export function simulateSplitOrder(args: {
  pool: PoolInventory;
  direction: TradeDirection;
  grossInput: bigint;
  parts: number;
  hookFeeBps: bigint;
  poolFeePips: bigint;
}): SplitOrderResult {
  let pool = { ...args.pool };
  const trades: ExactInputTradeResult[] = [];
  let netOutput = 0n;
  let totalInputHookFee = 0n;
  let totalOutputHookFee = 0n;
  let totalPoolFee = 0n;
  let tokenHookFees = 0n;
  let baseHookFees = 0n;

  for (const amount of splitAmount(args.grossInput, args.parts)) {
    const trade = simulateConstantProductExactInput({
      ...args,
      pool,
      grossInput: amount,
    });
    trades.push(trade);
    pool = trade.poolAfter;
    netOutput += trade.netOutput;
    totalInputHookFee += trade.inputHookFee;
    totalOutputHookFee += trade.outputHookFee;
    totalPoolFee += trade.poolFee;
    tokenHookFees += trade.hookFees.token;
    baseHookFees += trade.hookFees.base;
  }

  return {
    parts: args.parts,
    trades,
    grossInput: args.grossInput,
    netOutput,
    totalInputHookFee,
    totalOutputHookFee,
    totalPoolFee,
    finalPool: pool,
    hookFees: { token: tokenHookFees, base: baseHookFees },
  };
}

function executionMeetsMinimum(args: {
  tokenReserve: bigint;
  grossTokenSell: bigint;
  basePerTokenNumerator: bigint;
  basePerTokenDenominator: bigint;
  hookFeeBps: bigint;
  poolFeePips: bigint;
  minimumNetVsSpotBps: bigint;
}): boolean {
  const baseReserve =
    (args.tokenReserve * args.basePerTokenNumerator) /
    args.basePerTokenDenominator;
  if (baseReserve === 0n) return false;
  const result = simulateConstantProductExactInput({
    pool: { token: args.tokenReserve, base: baseReserve },
    direction: "sell-token",
    grossInput: args.grossTokenSell,
    hookFeeBps: args.hookFeeBps,
    poolFeePips: args.poolFeePips,
  });
  const actualScaled =
    result.netOutput * args.basePerTokenDenominator * HOOK_BPS;
  const quotedScaled =
    args.grossTokenSell * args.basePerTokenNumerator * args.minimumNetVsSpotBps;
  return actualScaled >= quotedScaled;
}

/**
 * Finds the smallest balanced constant-product reserve satisfying a specified
 * all-in net-output ratio. This is a planning lower bound, not a Uniswap quote:
 * production concentrated ranges must be simulated with the real V4Quoter.
 */
export function minimumBalancedDepthForTokenSell(args: {
  grossTokenSell: bigint;
  basePerTokenNumerator: bigint;
  basePerTokenDenominator: bigint;
  hookFeeBps: bigint;
  poolFeePips: bigint;
  minimumNetVsSpotBps: bigint;
}): PoolInventory {
  requireCondition(args.grossTokenSell > 0n, "grossTokenSell must be positive");
  requireCondition(
    args.basePerTokenNumerator > 0n,
    "basePerTokenNumerator must be positive"
  );
  requireCondition(
    args.basePerTokenDenominator > 0n,
    "basePerTokenDenominator must be positive"
  );
  requireCondition(
    args.minimumNetVsSpotBps > 0n && args.minimumNetVsSpotBps < HOOK_BPS,
    "minimumNetVsSpotBps is out of bounds"
  );
  requireCondition(
    args.hookFeeBps > 0n && args.hookFeeBps < HOOK_BPS,
    "Hook fee must be between zero and 100%"
  );
  requireCondition(
    args.poolFeePips >= 0n && args.poolFeePips < UNISWAP_FEE_DENOMINATOR,
    "pool fee is out of bounds"
  );

  // Compare the requested ratio exactly against
  // (1 - hookFee)^2 * (1 - poolFee). Do not first floor that ceiling to
  // whole basis points: e.g. Bootstrap's 7203.325-bps ceiling can satisfy a
  // 7203-bps target. The comparison stays strict because every finite
  // constant-product reserve has nonzero price impact.
  const retainedHookBps = HOOK_BPS - args.hookFeeBps;
  const noImpactRetentionNumerator =
    retainedHookBps *
    retainedHookBps *
    (UNISWAP_FEE_DENOMINATOR - args.poolFeePips);
  const requestedRetentionNumerator =
    args.minimumNetVsSpotBps * HOOK_BPS * UNISWAP_FEE_DENOMINATOR;
  requireCondition(
    requestedRetentionNumerator < noImpactRetentionNumerator,
    "requested execution exceeds the no-impact fee ceiling"
  );

  let low = 1n;
  let high = args.grossTokenSell;
  while (!executionMeetsMinimum({ ...args, tokenReserve: high })) {
    high *= 2n;
    requireCondition(
      high < 1n << 240n,
      "required depth exceeds the search bound"
    );
  }
  while (low < high) {
    const midpoint = (low + high) / 2n;
    if (executionMeetsMinimum({ ...args, tokenReserve: midpoint }))
      high = midpoint;
    else low = midpoint + 1n;
  }
  return {
    token: low,
    base: (low * args.basePerTokenNumerator) / args.basePerTokenDenominator,
  };
}
