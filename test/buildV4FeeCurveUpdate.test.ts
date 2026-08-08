import { expect } from "chai";
import {
  assertSupersededFeePolicyAcknowledged,
  cumulativeFee,
  curvesEqual,
  REVIEWED_BALANCED_CURVE,
} from "../scripts/buildV4FeeCurveUpdate.js";

describe("v4 reviewed balanced fee curve", function () {
  const usdc = 10n ** 6n;
  const depth = 300n * usdc;

  it("fails closed because this fee policy is superseded", function () {
    expect(() => assertSupersededFeePolicyAcknowledged(undefined)).to.throw(
      "is superseded and must not be proposed against the fresh Hook",
    );
    expect(() => assertSupersededFeePolicyAcknowledged("1")).not.to.throw();
  });

  it("charges a 0.75% floor on ordinary trades", function () {
    expect(cumulativeFee(REVIEWED_BALANCED_CURVE, 1n * usdc, depth)).to.equal(7_500n);
    expect(cumulativeFee(REVIEWED_BALANCED_CURVE, 12n * usdc, depth)).to.equal(90_000n);
  });

  it("makes cross-block laddering savings immaterial at the measured 96 USDC size", function () {
    const single = cumulativeFee(REVIEWED_BALANCED_CURVE, 96n * usdc, depth);
    const split = 8n * cumulativeFee(REVIEWED_BALANCED_CURVE, 12n * usdc, depth);
    expect(single).to.equal(772_500n);
    expect(split).to.equal(720_000n);
    expect(single - split).to.equal(52_500n); // 0.0525 USDC, 0.055% of input.
  });

  it("uses one neutral curve for buys and sells", function () {
    expect(curvesEqual(REVIEWED_BALANCED_CURVE, { ...REVIEWED_BALANCED_CURVE })).to.equal(true);
    expect(curvesEqual(REVIEWED_BALANCED_CURVE, {
      ...REVIEWED_BALANCED_CURVE,
      baseFeeBps: 76n,
    })).to.equal(false);
  });
});
