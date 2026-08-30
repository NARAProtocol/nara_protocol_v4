export const Q96 = 1n << 96n;
export const Q192 = 1n << 192n;
export const WAD = 10n ** 18n;
export const HUMAN_PRICE_SCALE = 10n ** 12n;
export const HUMAN_PRICE_WAD_NUMERATOR = 10n ** 30n * Q192;
export const MIN_TICK = -887_272n;
export const MAX_TICK = 887_272n;
export const MIN_SQRT_PRICE_X96 = 4_295_128_739n;
export const MAX_SQRT_PRICE_X96 = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n;
export const UINT128_MAX = (1n << 128n) - 1n;

export type Rational = Readonly<{
  numerator: bigint;
  denominator: bigint;
}>;

const TICK_MULTIPLIERS = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
] as const;

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error("Rational denominator must be non-zero");
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return {
    numerator: numerator / divisor * sign,
    denominator: abs(denominator) / divisor,
  };
}

export function parseDecimalRational(raw: string): Rational {
  const value = raw.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`Invalid unsigned decimal: ${raw}`);
  const fraction = match[2] ?? "";
  return rational(BigInt(`${match[1]}${fraction}`), 10n ** BigInt(fraction.length));
}

export function compareRational(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function multiplyRational(a: Rational, b: Rational): Rational {
  return rational(a.numerator * b.numerator, a.denominator * b.denominator);
}

export function divideRational(a: Rational, b: Rational): Rational {
  if (b.numerator === 0n) throw new Error("Cannot divide by zero");
  return rational(a.numerator * b.denominator, a.denominator * b.numerator);
}

export function floorDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("floorDiv denominator must be positive");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder < 0n ? quotient - 1n : quotient;
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("ceilDiv denominator must be positive");
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder > 0n ? quotient + 1n : quotient;
}

export function mulDiv(a: bigint, b: bigint, denominator: bigint, roundUp = false): bigint {
  if (a < 0n || b < 0n || denominator <= 0n) throw new Error("mulDiv requires unsigned inputs");
  const product = a * b;
  const quotient = product / denominator;
  return roundUp && product % denominator !== 0n ? quotient + 1n : quotient;
}

export function integerSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("Square root input must be non-negative");
  if (value < 2n) return value;
  let x = 1n << (BigInt(value.toString(2).length) + 1n >> 1n);
  for (;;) {
    const next = (x + value / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
}

export function formatRational(value: Rational, decimals = 18): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 100) {
    throw new Error("Formatting decimals must be an integer within 0..100");
  }
  const negative = value.numerator < 0n;
  const numerator = abs(value.numerator);
  const scale = 10n ** BigInt(decimals);
  const scaled = numerator * scale / value.denominator;
  const whole = scaled / scale;
  if (decimals === 0) return `${negative ? "-" : ""}${whole}`;
  const fraction = (scaled % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function humanUsdcPerNaraToRawPrice(price: Rational): Rational {
  if (price.numerator <= 0n) throw new Error("Human USDC-per-NARA price must be positive");
  return rational(HUMAN_PRICE_SCALE * price.denominator, price.numerator);
}

export function humanUsdcPerNaraToSqrtPriceX96(price: Rational): bigint {
  const raw = humanUsdcPerNaraToRawPrice(price);
  const scaledSquared = raw.numerator * Q192 / raw.denominator;
  const sqrtPriceX96 = integerSqrt(scaledSquared);
  if (sqrtPriceX96 < MIN_SQRT_PRICE_X96 || sqrtPriceX96 >= MAX_SQRT_PRICE_X96) {
    throw new Error("Human price is outside Uniswap v4 TickMath bounds");
  }
  return sqrtPriceX96;
}

export function sqrtPriceX96ToHumanUsdcPerNara(sqrtPriceX96: bigint): Rational {
  if (sqrtPriceX96 <= 0n) throw new Error("sqrtPriceX96 must be positive");
  return rational(HUMAN_PRICE_WAD_NUMERATOR, sqrtPriceX96 * sqrtPriceX96 * WAD);
}

export function sqrtPriceX96ToHumanPriceWad(sqrtPriceX96: bigint, roundUp = false): bigint {
  if (sqrtPriceX96 <= 0n) throw new Error("sqrtPriceX96 must be positive");
  const denominator = sqrtPriceX96 * sqrtPriceX96;
  const quotient = HUMAN_PRICE_WAD_NUMERATOR / denominator;
  return roundUp && HUMAN_PRICE_WAD_NUMERATOR % denominator !== 0n ? quotient + 1n : quotient;
}

export function getSqrtPriceAtTick(tick: bigint): bigint {
  if (tick < MIN_TICK || tick > MAX_TICK) throw new Error(`Invalid tick: ${tick}`);
  const absTick = abs(tick);
  let ratio = (absTick & 1n) !== 0n ? TICK_MULTIPLIERS[0] : 1n << 128n;
  for (let bit = 1; bit < TICK_MULTIPLIERS.length; bit += 1) {
    if ((absTick & (1n << BigInt(bit))) !== 0n) {
      ratio = ratio * TICK_MULTIPLIERS[bit] >> 128n;
    }
  }
  if (tick > 0n) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio + (1n << 32n) - 1n) >> 32n;
}

export function getTickAtSqrtPrice(sqrtPriceX96: bigint): bigint {
  if (sqrtPriceX96 < MIN_SQRT_PRICE_X96 || sqrtPriceX96 >= MAX_SQRT_PRICE_X96) {
    throw new Error(`Invalid sqrtPriceX96: ${sqrtPriceX96}`);
  }
  let low = MIN_TICK;
  let high = MAX_TICK - 1n;
  while (low <= high) {
    const mid = floorDiv(low + high, 2n);
    if (getSqrtPriceAtTick(mid) <= sqrtPriceX96) low = mid + 1n;
    else high = mid - 1n;
  }
  return high;
}

export type TickRounding = "floor" | "ceil" | "nearest";

export function alignTick(tick: bigint, tickSpacing: bigint, rounding: TickRounding): bigint {
  if (tickSpacing <= 0n) throw new Error("tickSpacing must be positive");
  const lower = floorDiv(tick, tickSpacing) * tickSpacing;
  const upper = ceilDiv(tick, tickSpacing) * tickSpacing;
  if (rounding === "floor") return lower;
  if (rounding === "ceil") return upper;
  return tick - lower <= upper - tick ? lower : upper;
}

export function usableTickBounds(tickSpacing: bigint): { minTick: bigint; maxTick: bigint } {
  if (tickSpacing <= 0n || tickSpacing > 32_767n) throw new Error("Invalid v4 tick spacing");
  return {
    minTick: MIN_TICK / tickSpacing * tickSpacing,
    maxTick: MAX_TICK / tickSpacing * tickSpacing,
  };
}

export function humanPriceToAlignedTick(
  price: Rational,
  tickSpacing: bigint,
  rounding: TickRounding,
): bigint {
  const sqrtPriceX96 = humanUsdcPerNaraToSqrtPriceX96(price);
  const floorTick = getTickAtSqrtPrice(sqrtPriceX96);
  const rawTick = rounding === "ceil" && getSqrtPriceAtTick(floorTick) !== sqrtPriceX96
    ? floorTick + 1n
    : floorTick;
  const aligned = alignTick(rawTick, tickSpacing, rounding);
  const bounds = usableTickBounds(tickSpacing);
  if (aligned < bounds.minTick || aligned > bounds.maxTick) {
    throw new Error("Aligned tick is outside usable TickMath bounds");
  }
  return aligned;
}

export function tickToHumanUsdcPerNara(tick: bigint): Rational {
  return sqrtPriceX96ToHumanUsdcPerNara(getSqrtPriceAtTick(tick));
}

export function getLiquidityForAmount0(sqrtPriceAX96: bigint, sqrtPriceBX96: bigint, amount0: bigint): bigint {
  if (amount0 < 0n) throw new Error("amount0 must be non-negative");
  const [a, b] = sqrtPriceAX96 <= sqrtPriceBX96
    ? [sqrtPriceAX96, sqrtPriceBX96]
    : [sqrtPriceBX96, sqrtPriceAX96];
  if (a <= 0n || a === b) throw new Error("Invalid sqrt price range");
  const intermediate = mulDiv(a, b, Q96);
  const liquidity = mulDiv(amount0, intermediate, b - a);
  if (liquidity > UINT128_MAX) throw new Error("Liquidity exceeds uint128");
  return liquidity;
}

export function getLiquidityForAmount1(sqrtPriceAX96: bigint, sqrtPriceBX96: bigint, amount1: bigint): bigint {
  if (amount1 < 0n) throw new Error("amount1 must be non-negative");
  const [a, b] = sqrtPriceAX96 <= sqrtPriceBX96
    ? [sqrtPriceAX96, sqrtPriceBX96]
    : [sqrtPriceBX96, sqrtPriceAX96];
  if (a <= 0n || a === b) throw new Error("Invalid sqrt price range");
  const liquidity = mulDiv(amount1, Q96, b - a);
  if (liquidity > UINT128_MAX) throw new Error("Liquidity exceeds uint128");
  return liquidity;
}

export function getAmount0Delta(
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  liquidity: bigint,
  roundUp: boolean,
): bigint {
  if (liquidity < 0n || liquidity > UINT128_MAX) throw new Error("Invalid liquidity");
  const [a, b] = sqrtPriceAX96 <= sqrtPriceBX96
    ? [sqrtPriceAX96, sqrtPriceBX96]
    : [sqrtPriceBX96, sqrtPriceAX96];
  if (a <= 0n || a === b) throw new Error("Invalid sqrt price range");
  const first = mulDiv(liquidity << 96n, b - a, b, roundUp);
  return roundUp ? ceilDiv(first, a) : first / a;
}

export function getAmount1Delta(
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  liquidity: bigint,
  roundUp: boolean,
): bigint {
  if (liquidity < 0n || liquidity > UINT128_MAX) throw new Error("Invalid liquidity");
  const difference = abs(sqrtPriceBX96 - sqrtPriceAX96);
  return mulDiv(liquidity, difference, Q96, roundUp);
}

export function geometricMeanPriceWad(low: Rational, high: Rational): bigint {
  if (low.numerator <= 0n || high.numerator <= 0n) throw new Error("Prices must be positive");
  const product = multiplyRational(low, high);
  return integerSqrt(product.numerator * WAD * WAD / product.denominator);
}
