import { expect } from "chai";
import {
  baseDepthForLiquidity,
  liquidityMinimum,
  parseLiquidityMaintainerArgs,
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
});
