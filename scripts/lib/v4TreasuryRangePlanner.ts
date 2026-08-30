import { ethers } from "ethers";
import {
  WAD,
  compareRational,
  formatRational,
  geometricMeanPriceWad,
  getAmount0Delta,
  getAmount1Delta,
  getLiquidityForAmount0,
  getLiquidityForAmount1,
  getSqrtPriceAtTick,
  humanPriceToAlignedTick,
  multiplyRational,
  parseDecimalRational,
  rational,
  sqrtPriceX96ToHumanUsdcPerNara,
  tickToHumanUsdcPerNara,
  type Rational,
} from "./v4TreasuryRangeMath.js";

export const NARA_DECIMALS = 18n;
export const USDC_DECIMALS = 6n;
export const NARA_UNIT = 10n ** NARA_DECIMALS;
export const USDC_UNIT = 10n ** USDC_DECIMALS;
export const BPS = 10_000n;

export type TreasuryOrderSide = "SELL_NARA" | "BUY_NARA";
export type BoundaryPolicy = "inward" | "outward";
export type StrategyProfileName = "CONSERVATIVE" | "AGGRESSIVE" | "ADVERSARIAL";

export type TreasuryRangeRequest = Readonly<{
  side: TreasuryOrderSide;
  lowerUsdcPerNara: Rational;
  upperUsdcPerNara: Rational;
  inputAmount: bigint;
  toleranceBps: bigint;
  strategyHash: string;
  creationDeadline: bigint;
  boundaryPolicy?: BoundaryPolicy;
}>;

export type PlannedTreasuryRange = Readonly<{
  side: TreasuryOrderSide;
  inputAmount: bigint;
  minimumOutputAmount: bigint;
  expectedPrincipalOutput: bigint;
  expectedLiquidity: bigint;
  expectedInputUsed: bigint;
  expectedRoundingDust: bigint;
  toleranceBps: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  requestedLowerUsdcPerNara: Rational;
  requestedUpperUsdcPerNara: Rational;
  alignedLowerUsdcPerNara: Rational;
  alignedUpperUsdcPerNara: Rational;
  geometricExecutionReferenceWad: bigint;
  strategyHash: string;
  creationDeadline: bigint;
}>;

export type StrategyTemplateRange = Readonly<{
  lower: string;
  upper: string;
  input: string;
}>;

export type StrategyTemplate = Readonly<{
  name: StrategyProfileName;
  sell: readonly StrategyTemplateRange[];
  buy: readonly StrategyTemplateRange[];
  protectedUsdc: string;
  designNote: string;
}>;

export type PlannedStrategyProfile = Readonly<{
  name: StrategyProfileName;
  orders: readonly PlannedTreasuryRange[];
  totalNaraInput: bigint;
  exposedUsdcInput: bigint;
  protectedUsdc: bigint;
  currentPriceCompatible: boolean;
  twentyPercentBandCompatible: boolean;
  strategyHash: string;
  hookConfigurationHash: string;
  incompatibilities: readonly string[];
  designNote: string;
}>;

function parseTokenAmount(raw: string, decimals: bigint): bigint {
  const value = parseDecimalRational(raw);
  const scaled = value.numerator * 10n ** decimals;
  if (scaled % value.denominator !== 0n) {
    throw new Error(`Token amount ${raw} has more than ${decimals} decimals`);
  }
  return scaled / value.denominator;
}

function alignedTicks(
  lower: Rational,
  upper: Rational,
  tickSpacing: bigint,
  policy: BoundaryPolicy,
): { tickLower: bigint; tickUpper: bigint } {
  if (compareRational(lower, upper) >= 0) throw new Error("Range lower price must be below upper price");
  // Human USDC/NARA is inverse to the pool's raw currency1/currency0 price.
  // Therefore the high human boundary is tickLower and the low boundary is tickUpper.
  const tickLower = humanPriceToAlignedTick(upper, tickSpacing, policy === "inward" ? "ceil" : "floor");
  const tickUpper = humanPriceToAlignedTick(lower, tickSpacing, policy === "inward" ? "floor" : "ceil");
  if (tickLower >= tickUpper) throw new Error("Aligned range collapsed or inverted");
  return { tickLower, tickUpper };
}

export function planTreasuryRange(
  request: TreasuryRangeRequest,
  tickSpacing = 60n,
): PlannedTreasuryRange {
  if (request.inputAmount <= 0n) throw new Error("Order input amount must be positive");
  if (request.toleranceBps < 0n || request.toleranceBps > 1_000n) {
    throw new Error("Tolerance must be within 0..1000 BPS");
  }
  if (request.creationDeadline <= 0n) throw new Error("Creation deadline must be positive");
  const { tickLower, tickUpper } = alignedTicks(
    request.lowerUsdcPerNara,
    request.upperUsdcPerNara,
    tickSpacing,
    request.boundaryPolicy ?? "inward",
  );
  if (tickLower % tickSpacing !== 0n || tickUpper % tickSpacing !== 0n) {
    throw new Error("Planner produced a tick not aligned to tickSpacing");
  }

  const sqrtLower = getSqrtPriceAtTick(tickLower);
  const sqrtUpper = getSqrtPriceAtTick(tickUpper);
  const liquidity = request.side === "SELL_NARA"
    ? getLiquidityForAmount1(sqrtLower, sqrtUpper, request.inputAmount)
    : getLiquidityForAmount0(sqrtLower, sqrtUpper, request.inputAmount);
  if (liquidity === 0n) throw new Error("Order amount produces zero liquidity");

  const inputUsed = request.side === "SELL_NARA"
    ? getAmount1Delta(sqrtLower, sqrtUpper, liquidity, true)
    : getAmount0Delta(sqrtLower, sqrtUpper, liquidity, true);
  const expectedOutput = request.side === "SELL_NARA"
    ? getAmount0Delta(sqrtLower, sqrtUpper, liquidity, false)
    : getAmount1Delta(sqrtLower, sqrtUpper, liquidity, false);
  if (inputUsed > request.inputAmount) {
    throw new Error("Exact v4 rounding requires more input than the approved order amount");
  }
  const minimumOutput = expectedOutput * (BPS - request.toleranceBps) / BPS;
  if (minimumOutput <= 0n) throw new Error("Minimum output must be non-zero");

  const alignedLower = tickToHumanUsdcPerNara(tickUpper);
  const alignedUpper = tickToHumanUsdcPerNara(tickLower);
  return {
    side: request.side,
    inputAmount: request.inputAmount,
    minimumOutputAmount: minimumOutput,
    expectedPrincipalOutput: expectedOutput,
    expectedLiquidity: liquidity,
    expectedInputUsed: inputUsed,
    expectedRoundingDust: request.inputAmount - inputUsed,
    toleranceBps: request.toleranceBps,
    tickLower,
    tickUpper,
    requestedLowerUsdcPerNara: request.lowerUsdcPerNara,
    requestedUpperUsdcPerNara: request.upperUsdcPerNara,
    alignedLowerUsdcPerNara: alignedLower,
    alignedUpperUsdcPerNara: alignedUpper,
    geometricExecutionReferenceWad: geometricMeanPriceWad(alignedLower, alignedUpper),
    strategyHash: request.strategyHash,
    creationDeadline: request.creationDeadline,
  };
}

export function assertOneSidedAtCreation(plan: PlannedTreasuryRange, sqrtPriceX96: bigint): void {
  const sqrtLower = getSqrtPriceAtTick(plan.tickLower);
  const sqrtUpper = getSqrtPriceAtTick(plan.tickUpper);
  if (plan.side === "SELL_NARA" && sqrtPriceX96 < sqrtUpper) {
    throw new Error("SELL_NARA range is active or already below the pinned creation price");
  }
  if (plan.side === "BUY_NARA" && sqrtPriceX96 > sqrtLower) {
    throw new Error("BUY_NARA range is active or already above the pinned creation price");
  }
}

export function oneSidedAcrossHumanPriceBand(
  plan: PlannedTreasuryRange,
  minimumSpot: Rational,
  maximumSpot: Rational,
): boolean {
  if (compareRational(minimumSpot, maximumSpot) > 0) throw new Error("Invalid spot-price band");
  if (plan.side === "SELL_NARA") {
    return compareRational(maximumSpot, plan.alignedLowerUsdcPerNara) <= 0;
  }
  return compareRational(minimumSpot, plan.alignedUpperUsdcPerNara) >= 0;
}

export function priceBand(center: Rational, movementBps: bigint): { minimum: Rational; maximum: Rational } {
  if (center.numerator <= 0n || movementBps < 0n || movementBps >= BPS) {
    throw new Error("Invalid center price or movement BPS");
  }
  return {
    minimum: rational(center.numerator * (BPS - movementBps), center.denominator * BPS),
    maximum: rational(center.numerator * (BPS + movementBps), center.denominator * BPS),
  };
}

export const DETERMINISTIC_STRATEGY_TEMPLATES: readonly StrategyTemplate[] = [
  {
    name: "CONSERVATIVE",
    sell: [
      { lower: "0.09", upper: "0.12", input: "3000" },
      { lower: "0.12", upper: "0.16", input: "4000" },
      { lower: "0.16", upper: "0.22", input: "5000" },
      { lower: "0.22", upper: "0.30", input: "6000" },
      { lower: "0.30", upper: "0.42", input: "7000" },
      { lower: "0.42", upper: "0.60", input: "7000" },
      { lower: "0.60", upper: "0.90", input: "7000" },
      { lower: "0.90", upper: "1.30", input: "6000" },
    ],
    buy: [
      { lower: "0.075", upper: "0.082", input: "400" },
      { lower: "0.06", upper: "0.075", input: "500" },
      { lower: "0.045", upper: "0.06", input: "500" },
      { lower: "0.03", upper: "0.045", input: "600" },
    ],
    protectedUsdc: "3000",
    designNote: "Highest near-market continuity while retaining the minimum 60% protected USDC reserve.",
  },
  {
    name: "AGGRESSIVE",
    sell: [
      { lower: "0.09", upper: "0.12", input: "1000" },
      { lower: "0.12", upper: "0.16", input: "1500" },
      { lower: "0.16", upper: "0.22", input: "2500" },
      { lower: "0.22", upper: "0.30", input: "4000" },
      { lower: "0.30", upper: "0.42", input: "6000" },
      { lower: "0.42", upper: "0.60", input: "8000" },
      { lower: "0.60", upper: "0.90", input: "10000" },
      { lower: "0.90", upper: "1.30", input: "12000" },
    ],
    buy: [
      { lower: "0.075", upper: "0.082", input: "300" },
      { lower: "0.06", upper: "0.075", input: "400" },
      { lower: "0.045", upper: "0.06", input: "500" },
      { lower: "0.03", upper: "0.045", input: "600" },
    ],
    protectedUsdc: "3200",
    designNote: "Seed hypothesis with progressively larger asks and a majority protected USDC reserve.",
  },
  {
    name: "ADVERSARIAL",
    sell: [
      { lower: "0.09", upper: "0.12", input: "500" },
      { lower: "0.12", upper: "0.16", input: "750" },
      { lower: "0.16", upper: "0.22", input: "1500" },
      { lower: "0.22", upper: "0.30", input: "3000" },
      { lower: "0.30", upper: "0.42", input: "6000" },
      { lower: "0.42", upper: "0.60", input: "9000" },
      { lower: "0.60", upper: "0.90", input: "11000" },
      { lower: "0.90", upper: "1.30", input: "13250" },
    ],
    buy: [
      { lower: "0.075", upper: "0.082", input: "150" },
      { lower: "0.06", upper: "0.075", input: "250" },
      { lower: "0.045", upper: "0.06", input: "400" },
      { lower: "0.03", upper: "0.045", input: "500" },
    ],
    protectedUsdc: "3700",
    designNote: "Sparse near-market inventory; explicitly accepts the highest quote and empty-cliff risk.",
  },
] as const;

export function buildDeterministicStrategyProfiles(params: {
  currentSqrtPriceX96: bigint;
  creationDeadline: bigint;
  hookConfigurationHash: string;
  toleranceBps?: bigint;
  tickSpacing?: bigint;
}): readonly PlannedStrategyProfile[] {
  if (!ethers.isHexString(params.hookConfigurationHash, 32)) {
    throw new Error("hookConfigurationHash must be bytes32");
  }
  const toleranceBps = params.toleranceBps ?? 0n;
  const tickSpacing = params.tickSpacing ?? 60n;
  const currentPrice = sqrtPriceX96ToHumanUsdcPerNara(params.currentSqrtPriceX96);
  const band = priceBand(currentPrice, 2_000n);
  return DETERMINISTIC_STRATEGY_TEMPLATES.map((template) => {
    const sellAnchor = parseDecimalRational(template.sell[0].lower);
    const buyAnchor = parseDecimalRational(template.buy[0].upper);
    const sellScale = compareRational(sellAnchor, band.maximum) < 0
      ? rational(band.maximum.numerator * sellAnchor.denominator, band.maximum.denominator * sellAnchor.numerator)
      : rational(1n);
    const buyScale = compareRational(buyAnchor, band.minimum) > 0
      ? rational(band.minimum.numerator * buyAnchor.denominator, band.minimum.denominator * buyAnchor.numerator)
      : rational(1n);
    let planned: PlannedTreasuryRange[] = [];
    const incompatibilities: string[] = [];
    const buildSide = (ranges: readonly StrategyTemplateRange[], side: TreasuryOrderSide) => {
      ranges.forEach((rangeTemplate, index) => {
        const scale = side === "SELL_NARA" ? sellScale : buyScale;
        const plan = planTreasuryRange({
          side,
          lowerUsdcPerNara: multiplyRational(parseDecimalRational(rangeTemplate.lower), scale),
          upperUsdcPerNara: multiplyRational(parseDecimalRational(rangeTemplate.upper), scale),
          inputAmount: parseTokenAmount(rangeTemplate.input, side === "SELL_NARA" ? NARA_DECIMALS : USDC_DECIMALS),
          toleranceBps,
          strategyHash: ethers.ZeroHash,
          creationDeadline: params.creationDeadline,
        }, tickSpacing);
        planned.push(plan);
        try {
          assertOneSidedAtCreation(plan, params.currentSqrtPriceX96);
        } catch (error) {
          incompatibilities.push(`${side}[${index}]: ${(error as Error).message}`);
        }
        if (!oneSidedAcrossHumanPriceBand(plan, band.minimum, band.maximum)) {
          incompatibilities.push(`${side}[${index}]: not one-sided across the pinned +/-20% price band`);
        }
      });
    };
    buildSide(template.sell, "SELL_NARA");
    buildSide(template.buy, "BUY_NARA");
    const totalNaraInput = planned
      .filter((order) => order.side === "SELL_NARA")
      .reduce((sum, order) => sum + order.inputAmount, 0n);
    const exposedUsdcInput = planned
      .filter((order) => order.side === "BUY_NARA")
      .reduce((sum, order) => sum + order.inputAmount, 0n);
    const protectedUsdc = parseTokenAmount(template.protectedUsdc, USDC_DECIMALS);
    if (exposedUsdcInput + protectedUsdc !== 5_000n * USDC_UNIT) {
      throw new Error(`${template.name} does not preserve the fixed 5,000 USDC budget`);
    }
    if (protectedUsdc * BPS < 5_000n * USDC_UNIT * 6_000n) {
      incompatibilities.push("protected USDC is below the 60% hard gate");
    }
    const twentyPercentBandCompatible = planned.every((order) =>
      oneSidedAcrossHumanPriceBand(order, band.minimum, band.maximum));
    return {
      name: template.name,
      orders: planned,
      totalNaraInput,
      exposedUsdcInput,
      protectedUsdc,
      currentPriceCompatible: incompatibilities.length === 0,
      twentyPercentBandCompatible,
      strategyHash: ethers.ZeroHash,
      hookConfigurationHash: params.hookConfigurationHash,
      incompatibilities,
      designNote: `${template.designNote} Pinned spot ${formatRational(currentPrice, 8)} USDC/NARA.`,
    };
  });
}

export function rescaleSellOrders(
  orders: readonly PlannedTreasuryRange[],
  targetNaraRaw: bigint,
  tickSpacing = 60n,
): readonly PlannedTreasuryRange[] {
  if (targetNaraRaw <= 0n) throw new Error("Target NARA budget must be positive");
  const sells = orders.filter((order) => order.side === "SELL_NARA");
  const original = sells.reduce((sum, order) => sum + order.inputAmount, 0n);
  if (original === 0n) throw new Error("Profile has no SELL_NARA orders");
  let allocated = 0n;
  return sells.map((order, index) => {
    const isLast = index === sells.length - 1;
    const inputAmount = isLast ? targetNaraRaw - allocated : order.inputAmount * targetNaraRaw / original;
    allocated += inputAmount;
    return planTreasuryRange({
      side: order.side,
      lowerUsdcPerNara: order.requestedLowerUsdcPerNara,
      upperUsdcPerNara: order.requestedUpperUsdcPerNara,
      inputAmount,
      toleranceBps: order.toleranceBps,
      strategyHash: order.strategyHash,
      creationDeadline: order.creationDeadline,
    }, tickSpacing);
  });
}

export function rescaleStrategyProfile(
  profile: PlannedStrategyProfile,
  targetNaraRaw: bigint,
  tickSpacing = 60n,
): PlannedStrategyProfile {
  const buys = profile.orders.filter((order) => order.side === "BUY_NARA");
  const sells = rescaleSellOrders(profile.orders, targetNaraRaw, tickSpacing);
  const unhashedOrders = [...sells, ...buys].map((order) => ({ ...order, strategyHash: ethers.ZeroHash }));
  return {
    ...profile,
    orders: unhashedOrders,
    totalNaraInput: targetNaraRaw,
    strategyHash: ethers.ZeroHash,
  };
}

export function stampStrategyHash(
  profile: PlannedStrategyProfile,
  strategyHash: string,
): PlannedStrategyProfile {
  if (!ethers.isHexString(strategyHash, 32) || strategyHash === ethers.ZeroHash) {
    throw new Error("Final strategyHash must be a non-zero bytes32 value");
  }
  const normalized = strategyHash.toLowerCase();
  return {
    ...profile,
    strategyHash: normalized,
    orders: profile.orders.map((order) => ({ ...order, strategyHash: normalized })),
  };
}

export function serializePlannedRange(plan: PlannedTreasuryRange): Record<string, string> {
  return {
    side: plan.side,
    inputAmount: plan.inputAmount.toString(),
    minimumOutputAmount: plan.minimumOutputAmount.toString(),
    expectedPrincipalOutput: plan.expectedPrincipalOutput.toString(),
    expectedLiquidity: plan.expectedLiquidity.toString(),
    expectedInputUsed: plan.expectedInputUsed.toString(),
    expectedRoundingDust: plan.expectedRoundingDust.toString(),
    toleranceBps: plan.toleranceBps.toString(),
    tickLower: plan.tickLower.toString(),
    tickUpper: plan.tickUpper.toString(),
    requestedLowerUsdcPerNara: formatRational(plan.requestedLowerUsdcPerNara, 18),
    requestedUpperUsdcPerNara: formatRational(plan.requestedUpperUsdcPerNara, 18),
    alignedLowerUsdcPerNara: formatRational(plan.alignedLowerUsdcPerNara, 18),
    alignedUpperUsdcPerNara: formatRational(plan.alignedUpperUsdcPerNara, 18),
    geometricExecutionReferenceWad: plan.geometricExecutionReferenceWad.toString(),
    strategyHash: plan.strategyHash,
    creationDeadline: plan.creationDeadline.toString(),
  };
}

export function wadPriceToRational(priceWad: bigint): Rational {
  if (priceWad <= 0n) throw new Error("Price WAD must be positive");
  return rational(priceWad, WAD);
}
