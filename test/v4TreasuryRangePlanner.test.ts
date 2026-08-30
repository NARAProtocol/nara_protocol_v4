import { expect } from "chai";
import {
  BPS,
  NARA_UNIT,
  USDC_UNIT,
  buildDeterministicStrategyProfiles,
  oneSidedAcrossHumanPriceBand,
  planTreasuryRange,
  priceBand,
  rescaleStrategyProfile,
  stampStrategyHash,
} from "../scripts/lib/v4TreasuryRangePlanner.js";
import {
  formatRational,
  humanUsdcPerNaraToSqrtPriceX96,
  parseDecimalRational,
  sqrtPriceX96ToHumanUsdcPerNara,
} from "../scripts/lib/v4TreasuryRangeMath.js";

describe("v4 treasury range planner", function () {
  const currentSqrtPriceX96 = humanUsdcPerNaraToSqrtPriceX96(parseDecimalRational("0.0847"));

  it("plans one-sided sell and buy ranges with non-zero exact principal minimums", function () {
    const sell = planTreasuryRange({
      side: "SELL_NARA",
      lowerUsdcPerNara: parseDecimalRational("0.09"),
      upperUsdcPerNara: parseDecimalRational("0.12"),
      inputAmount: 1_000n * NARA_UNIT,
      toleranceBps: 0n,
      strategyHash: `0x${"11".repeat(32)}`,
      creationDeadline: 2_000_000_000n,
    });
    expect(sell.minimumOutputAmount).to.equal(sell.expectedPrincipalOutput);
    expect(sell.expectedRoundingDust >= 0n).to.equal(true);
    expect(sell.tickLower % 60n).to.equal(0n);
    expect(sell.tickUpper % 60n).to.equal(0n);

    const buy = planTreasuryRange({
      side: "BUY_NARA",
      lowerUsdcPerNara: parseDecimalRational("0.06"),
      upperUsdcPerNara: parseDecimalRational("0.075"),
      inputAmount: 500n * USDC_UNIT,
      toleranceBps: 0n,
      strategyHash: `0x${"22".repeat(32)}`,
      creationDeadline: 2_000_000_000n,
    });
    expect(buy.minimumOutputAmount).to.equal(buy.expectedPrincipalOutput);
    expect(buy.expectedRoundingDust >= 0n).to.equal(true);
  });

  it("locks the reviewed $0.14-$0.21 / 1,000 NARA acceptance vector", function () {
    const plan = planTreasuryRange({
      side: "SELL_NARA",
      lowerUsdcPerNara: parseDecimalRational("0.14"),
      upperUsdcPerNara: parseDecimalRational("0.21"),
      inputAmount: 1_000n * NARA_UNIT,
      toleranceBps: 0n,
      strategyHash: `0x${"33".repeat(32)}`,
      creationDeadline: 2_000_000_000n,
    });
    expect(plan.tickLower).to.equal(291_960n);
    expect(plan.tickUpper).to.equal(295_980n);
    expect(formatRational(plan.alignedLowerUsdcPerNara, 18)).to.equal("0.14008595468649157");
    expect(formatRational(plan.alignedUpperUsdcPerNara, 18)).to.equal("0.209397863955322724");
    expect(plan.expectedPrincipalOutput).to.equal(171_270_837n);
    expect(plan.expectedInputUsed).to.equal(999_999_999_999_999_544_876n);
    expect(plan.expectedRoundingDust).to.equal(455_124n);
  });

  it("builds three deterministic placeholder profiles under hard gates", function () {
    const profiles = buildDeterministicStrategyProfiles({
      currentSqrtPriceX96,
      creationDeadline: 2_000_000_000n,
      hookConfigurationHash: `0x${"44".repeat(32)}`,
    });
    expect(profiles.map((profile) => profile.name))
      .to.deep.equal(["CONSERVATIVE", "AGGRESSIVE", "ADVERSARIAL"]);
    const band = priceBand(sqrtPriceX96ToHumanUsdcPerNara(currentSqrtPriceX96), 2_000n);
    for (const profile of profiles) {
      expect(profile.incompatibilities).to.deep.equal([]);
      expect(profile.protectedUsdc * BPS >= 5_000n * USDC_UNIT * 6_000n).to.equal(true);
      expect(profile.twentyPercentBandCompatible).to.equal(true);
      expect(profile.orders.every((order) => order.toleranceBps === 0n)).to.equal(true);
      expect(new Set(profile.orders.map((order) => order.strategyHash))).to.deep.equal(new Set([profile.strategyHash]));
      expect(profile.strategyHash).to.equal(`0x${"00".repeat(32)}`);
      expect(profile.orders.every((order) => oneSidedAcrossHumanPriceBand(order, band.minimum, band.maximum)))
        .to.equal(true);
    }
  });

  it("returns an unhashed placeholder when the NARA budget changes", function () {
    const profile = buildDeterministicStrategyProfiles({
      currentSqrtPriceX96,
      creationDeadline: 2_000_000_000n,
      hookConfigurationHash: `0x${"44".repeat(32)}`,
    })[1];
    const resized = rescaleStrategyProfile(profile, 75_000n * NARA_UNIT);
    expect(resized.totalNaraInput).to.equal(75_000n * NARA_UNIT);
    expect(resized.strategyHash).to.equal(`0x${"00".repeat(32)}`);
    expect(new Set(resized.orders.map((order) => order.strategyHash)).size).to.equal(1);
  });

  it("stamps one finalized whole-manifest hash into every order", function () {
    const draft = buildDeterministicStrategyProfiles({
      currentSqrtPriceX96,
      creationDeadline: 2_000_000_000n,
      hookConfigurationHash: `0x${"55".repeat(32)}`,
    })[0];
    const hash = `0x${"77".repeat(32)}`;
    const finalized = stampStrategyHash(draft, hash);
    expect(finalized.strategyHash).to.equal(hash);
    expect(new Set(finalized.orders.map((order) => order.strategyHash))).to.deep.equal(new Set([hash]));
  });
});
