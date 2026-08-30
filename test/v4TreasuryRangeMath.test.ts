import { expect } from "chai";
import {
  MAX_TICK,
  MIN_TICK,
  alignTick,
  getAmount0Delta,
  getAmount1Delta,
  getLiquidityForAmount0,
  getLiquidityForAmount1,
  getSqrtPriceAtTick,
  getTickAtSqrtPrice,
  humanPriceToAlignedTick,
  humanUsdcPerNaraToSqrtPriceX96,
  parseDecimalRational,
  sqrtPriceX96ToHumanPriceWad,
  tickToHumanUsdcPerNara,
} from "../scripts/lib/v4TreasuryRangeMath.js";

const PRICES = [
  "0.03", "0.045", "0.06", "0.075", "0.082", "0.09", "0.12",
  "0.16", "0.22", "0.30", "0.42", "0.60", "0.90", "1.30",
] as const;

describe("v4 treasury range exact math", function () {
  it("matches the v4 TickMath boundary constants and round-trips ticks", function () {
    expect(getSqrtPriceAtTick(MIN_TICK)).to.equal(4_295_128_739n);
    expect(getSqrtPriceAtTick(MAX_TICK))
      .to.equal(1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n);
    for (const tick of [MIN_TICK, -600_000n, -1n, 0n, 1n, 600_000n, MAX_TICK - 1n]) {
      expect(getTickAtSqrtPrice(getSqrtPriceAtTick(tick))).to.equal(tick);
    }
  });

  for (const rawPrice of PRICES) {
    it(`converts and aligns $${rawPrice} using only integer/rational math`, function () {
      const requested = parseDecimalRational(rawPrice);
      const sqrtPriceX96 = humanUsdcPerNaraToSqrtPriceX96(requested);
      const expectedWad = requested.numerator * 10n ** 18n / requested.denominator;
      const actualWad = sqrtPriceX96ToHumanPriceWad(sqrtPriceX96);
      const error = actualWad >= expectedWad ? actualWad - expectedWad : expectedWad - actualWad;
      expect(error <= 1n).to.equal(true);

      const floorTick = humanPriceToAlignedTick(requested, 60n, "floor");
      const ceilTick = humanPriceToAlignedTick(requested, 60n, "ceil");
      expect(floorTick % 60n).to.equal(0n);
      expect(ceilTick % 60n).to.equal(0n);
      expect(floorTick <= ceilTick).to.equal(true);
      // Human price decreases as the raw currency1/currency0 tick increases.
      const floorHuman = tickToHumanUsdcPerNara(floorTick);
      const ceilHuman = tickToHumanUsdcPerNara(ceilTick);
      expect(floorHuman.numerator * ceilHuman.denominator
        >= ceilHuman.numerator * floorHuman.denominator).to.equal(true);
    });
  }

  it("aligns negative ticks with mathematical floor and ceil", function () {
    expect(alignTick(-1n, 60n, "floor")).to.equal(-60n);
    expect(alignTick(-1n, 60n, "ceil")).to.equal(0n);
    expect(alignTick(-61n, 60n, "floor")).to.equal(-120n);
    expect(alignTick(-61n, 60n, "ceil")).to.equal(-60n);
  });

  it("uses v4 liquidity floors and directional amount rounding", function () {
    const a = getSqrtPriceAtTick(100n);
    const b = getSqrtPriceAtTick(1_000n);
    const amount0 = 1_000_000n;
    const liquidity0 = getLiquidityForAmount0(a, b, amount0);
    expect(getAmount0Delta(a, b, liquidity0, true) <= amount0).to.equal(true);
    expect(getAmount0Delta(a, b, liquidity0, true)
      >= getAmount0Delta(a, b, liquidity0, false)).to.equal(true);

    const amount1 = 10n ** 18n;
    const liquidity1 = getLiquidityForAmount1(a, b, amount1);
    expect(getAmount1Delta(a, b, liquidity1, true) <= amount1).to.equal(true);
    expect(getAmount1Delta(a, b, liquidity1, true)
      >= getAmount1Delta(a, b, liquidity1, false)).to.equal(true);
  });
});
