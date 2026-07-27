import { expect } from "chai";
import {
  boundedSlippageBps,
  calculateSpotMinimum,
  Q192,
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
});
