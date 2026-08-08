import { expect } from "chai";
import {
  boundedSlippageBps,
  calculateSpotMinimum,
  projectConstantLiquidityExactInput,
  Q96,
  Q192,
  usdcPerNaraWad,
} from "../scripts/lib/v4SwapSafety.js";

describe("v4 swap safety helpers", function () {
  it("bounds operator-configured slippage", function () {
    expect(boundedSlippageBps(undefined)).to.equal(500n);
    expect(boundedSlippageBps("10")).to.equal(10n);
    expect(boundedSlippageBps("1000")).to.equal(1000n);
    expect(() => boundedSlippageBps("9")).to.throw("between 10 and 1000");
    expect(() => boundedSlippageBps("1001")).to.throw("between 10 and 1000");
    expect(() => boundedSlippageBps("1.5")).to.throw("Invalid");
  });

  it("calculates a nonzero minimum for either currency direction", function () {
    const sqrtOne = 1n << 96n;
    const common = {
      amountInAfterHookFee: 1_000_000n,
      sqrtPriceX96: sqrtOne,
      poolFeePips: 3000,
      slippageBps: 500n,
    };
    expect(calculateSpotMinimum({ ...common, inputIsCurrency0: true })).to.equal(947_150n);
    expect(calculateSpotMinimum({ ...common, inputIsCurrency0: false })).to.equal(947_150n);
    expect(sqrtOne * sqrtOne).to.equal(Q192);
  });

  it("rejects zero-output and unsafe inputs", function () {
    expect(() => calculateSpotMinimum({
      amountInAfterHookFee: 0n,
      sqrtPriceX96: 1n << 96n,
      inputIsCurrency0: true,
      poolFeePips: 3000,
      slippageBps: 500n,
    })).to.throw("must be positive");
  });

  it("projects USDC-in buys when NARA is currency0", function () {
    const sqrtPriceX96 = Q96 / 1_000_000n;
    const amountIn = 997_000n;
    const priceBefore = usdcPerNaraWad(sqrtPriceX96, true);
    const projected = projectConstantLiquidityExactInput({
      amountIn,
      sqrtPriceX96,
      liquidity: 10n ** 18n,
      inputIsCurrency0: false,
    });
    const minimum = calculateSpotMinimum({
      amountInAfterHookFee: amountIn,
      sqrtPriceX96,
      inputIsCurrency0: false,
      poolFeePips: 3000,
      slippageBps: 500n,
    });

    expect(projected.sqrtPriceX96After > sqrtPriceX96).to.equal(true);
    expect(projected.amountOut > 0n).to.equal(true);
    expect(usdcPerNaraWad(projected.sqrtPriceX96After, true) > priceBefore).to.equal(true);
    expect(minimum > 0n).to.equal(true);
  });

  it("projects USDC-in buys when NARA is currency1", function () {
    const sqrtPriceX96 = Q96 * 1_000_000n;
    const amountIn = 997_000n;
    const priceBefore = usdcPerNaraWad(sqrtPriceX96, false);
    const projected = projectConstantLiquidityExactInput({
      amountIn,
      sqrtPriceX96,
      liquidity: 10n ** 18n,
      inputIsCurrency0: true,
    });
    const minimum = calculateSpotMinimum({
      amountInAfterHookFee: amountIn,
      sqrtPriceX96,
      inputIsCurrency0: true,
      poolFeePips: 3000,
      slippageBps: 500n,
    });

    expect(projected.sqrtPriceX96After < sqrtPriceX96).to.equal(true);
    expect(projected.amountOut > 0n).to.equal(true);
    expect(usdcPerNaraWad(projected.sqrtPriceX96After, false) > priceBefore).to.equal(true);
    expect(minimum > 0n).to.equal(true);
    expect(() => calculateSpotMinimum({
      amountInAfterHookFee: amountIn,
      sqrtPriceX96,
      inputIsCurrency0: false,
      poolFeePips: 3000,
      slippageBps: 500n,
    })).to.throw("Calculated minimum output is zero");
  });
});
