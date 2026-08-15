import { expect } from "chai";
import {
  assertCurrentSqrtPriceWithinPolicy,
  baseDepthForLiquidity,
  compoundExecutionPolicyFromEnv,
  hasCompoundableInventory,
  liquidityMinimum,
  parseLiquidityMaintainerArgs,
  requireCompoundExecutionPolicy,
  shouldCompound,
} from "../scripts/maintainV4Liquidity.js";

describe("v4 liquidity maintainer", function () {
  it("defaults to read-only and validates confirmations", function () {
    expect(parseLiquidityMaintainerArgs([])).to.deep.equal({ execute: false, confirmations: 1 });
    expect(parseLiquidityMaintainerArgs(["--execute", "--confirmations", "2"]))
      .to.deep.equal({ execute: true, confirmations: 2 });
    expect(() => parseLiquidityMaintainerArgs(["--confirmations", "0"]))
      .to.throw("--confirmations must be an integer between 1 and 20");
  });

  it("uses a 99% minimum liquidity guard", function () {
    expect(liquidityMinimum(1_000_000n)).to.equal(990_000n);
    expect(() => liquidityMinimum(0n)).to.throw("Simulated liquidity must be positive");
  });

  it("converts liquidity to base-side active depth for either currency order", function () {
    const q96 = 1n << 96n;
    expect(baseDepthForLiquidity(100n, q96 * 2n, true)).to.equal(200n);
    expect(baseDepthForLiquidity(100n, q96 / 2n, false)).to.equal(200n);
  });

  it("compounds only when the configured base-depth threshold is met", function () {
    expect(shouldCompound(100n, 5_000_000n, 5_000_000n)).to.equal(true);
    expect(shouldCompound(100n, 4_999_999n, 5_000_000n)).to.equal(false);
    expect(shouldCompound(0n, 5_000_000n, 5_000_000n)).to.equal(false);
  });

  it("counts previously banked Compounder inventory when checking whether both sides exist", function () {
    expect(hasCompoundableInventory(0n, 6_750_000n, 1_718n, 24_518_753n)).to.equal(true);
    expect(hasCompoundableInventory(0n, 6_750_000n, 0n, 24_518_753n)).to.equal(false);
    expect(hasCompoundableInventory(1n, 0n, 0n, 1n)).to.equal(true);
  });

  it("blocks compounding when the independent reference or explicit token caps are missing", function () {
    expect(compoundExecutionPolicyFromEnv({})).to.equal(undefined);
    expect(() => requireCompoundExecutionPolicy({}))
      .to.throw("Independent compound policy is required");
    expect(() => compoundExecutionPolicyFromEnv({
      V4_COMPOUND_REFERENCE_SQRT_PRICE_X96: (1n << 96n).toString(),
    })).to.throw("Incomplete compound execution policy");
  });

  it("never promotes a manipulated current slot0 into the independent reference", function () {
    const reference = 1n << 96n;
    const policy = requireCompoundExecutionPolicy({
      V4_COMPOUND_REFERENCE_SQRT_PRICE_X96: reference.toString(),
      V4_COMPOUND_MAX_NARA_USED_RAW: "100000000000000000000",
      V4_COMPOUND_MAX_USDC_USED_RAW: "100000000",
      V4_COMPOUND_SQRT_PRICE_GUARD_BPS: "100",
    });
    expect(policy.referenceSqrtPriceX96).to.equal(reference);
    expect(policy.maxNaraUsed).to.equal(100_000_000_000_000_000_000n);
    expect(policy.maxUsdcUsed).to.equal(100_000_000n);

    const manipulatedCurrent = reference + reference / 50n;
    expect(() => assertCurrentSqrtPriceWithinPolicy(manipulatedCurrent, policy))
      .to.throw("outside the independent reference band");
    expect(policy.referenceSqrtPriceX96).to.equal(reference);
  });
});
