import { expect } from "chai";
import {
  combinedEffectiveHookFeeBps,
  hookFeeFor,
  minimumBalancedDepthForTokenSell,
  simulateConstantProductExactInput,
  simulateSplitOrder,
} from "../../scripts/v5/lib/v5HookEconomics.js";

describe("V5 Hook economic arithmetic", function () {
  it("matches the approved effective two-leg fee at every phase", function () {
    expect(combinedEffectiveHookFeeBps(1_500n)).to.equal(2_775n);
    expect(combinedEffectiveHookFeeBps(1_250n)).to.equal(2_344n);
    expect(combinedEffectiveHookFeeBps(1_000n)).to.equal(1_900n);
    expect(combinedEffectiveHookFeeBps(750n)).to.equal(1_444n);
    expect(combinedEffectiveHookFeeBps(500n)).to.equal(975n);
    expect(hookFeeFor(10_001n, 1_500n)).to.equal(1_501n);
  });

  it("conserves both currency legs on buys and sells", function () {
    for (const direction of ["buy-token", "sell-token"] as const) {
      const result = simulateConstantProductExactInput({
        pool: { token: 10_000_000_000n, base: 10_000_000_000n },
        direction,
        grossInput: 1_000_000n,
        hookFeeBps: 1_500n,
        poolFeePips: 3_000n,
      });
      expect(result.inputHookFee + result.ammInput).to.equal(result.grossInput);
      expect(result.outputHookFee + result.netOutput).to.equal(
        result.grossOutput
      );
      if (direction === "buy-token") {
        expect(
          result.poolAfter.base - result.poolBefore.base + result.hookFees.base
        ).to.equal(result.grossInput);
        expect(result.poolBefore.token - result.poolAfter.token).to.equal(
          result.grossOutput
        );
      } else {
        expect(
          result.poolAfter.token -
            result.poolBefore.token +
            result.hookFees.token
        ).to.equal(result.grossInput);
        expect(result.poolBefore.base - result.poolAfter.base).to.equal(
          result.grossOutput
        );
      }
    }
  });

  it("does not let a 15-way split reduce the fixed Bootstrap input fee", function () {
    const args = {
      pool: { token: 1_000_000_000_000n, base: 5_000_000_000n },
      direction: "buy-token" as const,
      grossInput: 150_000_000n,
      hookFeeBps: 1_500n,
      poolFeePips: 3_000n,
    };
    const one = simulateSplitOrder({ ...args, parts: 1 });
    const fifteen = simulateSplitOrder({ ...args, parts: 15 });
    expect(fifteen.totalInputHookFee).to.be.at.least(one.totalInputHookFee);
    expect(fifteen.netOutput).to.be.at.most(one.netOutput);
    // The split may create slightly less gross AMM output through per-swap LP
    // fee rounding, so its absolute output-leg fee may also be lower. That is
    // not an avoidance benefit: every output unit still pays the same rounded-
    // up rate and the user receives no more output than the unsplit order.
    for (const trade of fifteen.trades) {
      expect(trade.outputHookFee).to.equal(
        hookFeeFor(trade.grossOutput, args.hookFeeBps)
      );
    }
    expect(fifteen.hookFees.base).to.equal(fifteen.totalInputHookFee);
    expect(fifteen.hookFees.token).to.equal(fifteen.totalOutputHookFee);
  });

  it("keeps split resistance in both directions across all approved phases", function () {
    for (const hookFeeBps of [1_500n, 1_250n, 1_000n, 750n, 500n]) {
      for (const direction of ["buy-token", "sell-token"] as const) {
        const args = {
          pool: { token: 9_000_000_000_000n, base: 7_000_000_000_000n },
          direction,
          grossInput: 90_000_000n,
          hookFeeBps,
          poolFeePips: 3_000n,
        };
        const one = simulateSplitOrder({ ...args, parts: 1 });
        for (const parts of [2, 3, 15, 100]) {
          const split = simulateSplitOrder({ ...args, parts });
          expect(split.totalInputHookFee).to.be.at.least(one.totalInputHookFee);
          expect(split.netOutput).to.be.at.most(one.netOutput);
        }
      }
    }
  });

  it("calculates a depth lower bound and rejects an impossible fee-adjusted target", function () {
    const parameters = {
      grossTokenSell: 100_000n,
      basePerTokenNumerator: 5n,
      basePerTokenDenominator: 1_000n,
      hookFeeBps: 1_500n,
      poolFeePips: 3_000n,
      minimumNetVsSpotBps: 7_000n,
    };
    const depth = minimumBalancedDepthForTokenSell(parameters);
    const result = simulateConstantProductExactInput({
      pool: depth,
      direction: "sell-token",
      grossInput: parameters.grossTokenSell,
      hookFeeBps: parameters.hookFeeBps,
      poolFeePips: parameters.poolFeePips,
    });
    expect(
      result.netOutput * parameters.basePerTokenDenominator * 10_000n
    ).to.be.at.least(
      parameters.grossTokenSell *
        parameters.basePerTokenNumerator *
        parameters.minimumNetVsSpotBps
    );
    if (depth.token > 1n) {
      const shallowerBase =
        ((depth.token - 1n) * parameters.basePerTokenNumerator) /
        parameters.basePerTokenDenominator;
      if (shallowerBase > 0n) {
        const shallower = simulateConstantProductExactInput({
          pool: { token: depth.token - 1n, base: shallowerBase },
          direction: "sell-token",
          grossInput: parameters.grossTokenSell,
          hookFeeBps: parameters.hookFeeBps,
          poolFeePips: parameters.poolFeePips,
        });
        expect(
          shallower.netOutput * parameters.basePerTokenDenominator * 10_000n
        ).to.be.below(
          parameters.grossTokenSell *
            parameters.basePerTokenNumerator *
            parameters.minimumNetVsSpotBps
        );
      }
    }

    expect(() =>
      minimumBalancedDepthForTokenSell({
        ...parameters,
        minimumNetVsSpotBps: 7_300n,
      })
    ).to.throw("no-impact fee ceiling");
  });

  it("accepts a whole-bps target below the exact fractional no-impact ceiling", function () {
    const parameters = {
      grossTokenSell: 100_000_000n,
      basePerTokenNumerator: 1n,
      basePerTokenDenominator: 1n,
      hookFeeBps: 1_500n,
      poolFeePips: 3_000n,
      minimumNetVsSpotBps: 7_203n,
    };
    const depth = minimumBalancedDepthForTokenSell(parameters);
    const result = simulateConstantProductExactInput({
      pool: depth,
      direction: "sell-token",
      grossInput: parameters.grossTokenSell,
      hookFeeBps: parameters.hookFeeBps,
      poolFeePips: parameters.poolFeePips,
    });

    expect(
      result.netOutput * parameters.basePerTokenDenominator * 10_000n
    ).to.be.at.least(
      parameters.grossTokenSell *
        parameters.basePerTokenNumerator *
        parameters.minimumNetVsSpotBps
    );
    expect(() =>
      minimumBalancedDepthForTokenSell({
        ...parameters,
        minimumNetVsSpotBps: 7_204n,
      })
    ).to.throw("no-impact fee ceiling");
  });
});
