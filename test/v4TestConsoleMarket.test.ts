import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AbiCoder, keccak256, solidityPacked } from "ethers";

import {
  calculateMarketValuation,
  poolStateSlot,
  sqrtPriceX96FromSlot0,
  usdcPerNaraWad,
} from "../tools/v4-test-console/src/market.js";

const Q96 = 1n << 96n;
const WAD = 10n ** 18n;

describe("v4 test console market data", function () {
  it("derives the canonical PoolManager state slot", function () {
    const poolId = `0x${"12".repeat(32)}` as `0x${string}`;
    const expected = keccak256(solidityPacked(
      ["bytes32", "bytes32"],
      [poolId, AbiCoder.defaultAbiCoder().encode(["uint256"], [6n])],
    ));
    expect(poolStateSlot(poolId)).to.equal(expected);
  });

  it("extracts only sqrtPriceX96 from packed slot0", function () {
    const sqrtPriceX96 = 123456789n;
    const packedMetadata = 77n << 160n;
    expect(sqrtPriceX96FromSlot0(
      `0x${(packedMetadata | sqrtPriceX96).toString(16).padStart(64, "0")}`,
    )).to.equal(sqrtPriceX96);
  });

  it("prices the reviewed opening ratio without swap fees or price impact", function () {
    const openingSqrtPriceX96 = 1120455419495722798374638764549163435n;
    const openingPrice = usdcPerNaraWad(openingSqrtPriceX96, false);
    expect(openingPrice).to.be.closeTo(5n * 10n ** 15n, 2n);
  });

  it("separates provisional market cap from fully diluted value", function () {
    const totalSupply = 1_000_000n * WAD;
    const valuation = calculateMarketValuation({
      sqrtPriceX96: 1120455419495722798374638764549163435n,
      naraIsCurrency0: false,
      totalSupply,
      excludedBalances: [650_000n * WAD, 0n],
    });

    expect(valuation.provisionalCirculatingSupply).to.equal(350_000n * WAD);
    expect(valuation.provisionalMarketCapUsdcWad).to.be.closeTo(1_750n * WAD, 1n);
    expect(valuation.fullyDilutedValueUsdcWad).to.be.closeTo(5_000n * WAD, 1n);
  });

  it("rejects an impossible excluded-supply total", function () {
    expect(() => calculateMarketValuation({
      sqrtPriceX96: Q96,
      naraIsCurrency0: false,
      totalSupply: 1n,
      excludedBalances: [2n],
    })).to.throw("Excluded balances exceed NARA total supply");
  });

  it("labels pool-derived valuations as estimates rather than oracle values", function () {
    const source = readFileSync(resolve("tools/v4-test-console/src/app.tsx"), "utf8");
    expect(source).to.include("Pool spot estimate · not an oracle");
    expect(source).to.include("Pre-allocation market cap estimate");
    expect(source).to.include("Fully diluted value estimate");
    expect(source).to.include("which a trade can move");
  });
});
