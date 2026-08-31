import { expect } from "chai";
import {
  BPS,
  NARA_UNIT,
  TREASURY_RANGE_CANARY_NARA_BUDGET,
  TREASURY_RANGE_MINIMUM_PROTECTED_USDC_BPS,
  TREASURY_RANGE_NOMINAL_USDC_BUDGET,
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
      expect(profile.exposedUsdcInput + profile.protectedUsdc).to.equal(TREASURY_RANGE_NOMINAL_USDC_BUDGET);
      expect(profile.protectedUsdc * BPS
        >= TREASURY_RANGE_NOMINAL_USDC_BUDGET * TREASURY_RANGE_MINIMUM_PROTECTED_USDC_BPS).to.equal(true);
      expect(profile.twentyPercentBandCompatible).to.equal(true);
      expect(profile.orders.every((order) => order.toleranceBps === 0n)).to.equal(true);
      expect(profile.orders.every((order) => order.inputAmount > 0n
        && order.expectedLiquidity > 0n
        && order.expectedPrincipalOutput > 0n
        && order.minimumOutputAmount > 0n)).to.equal(true);
      expect(new Set(profile.orders.map((order) => order.strategyHash))).to.deep.equal(new Set([profile.strategyHash]));
      expect(profile.strategyHash).to.equal(`0x${"00".repeat(32)}`);
      expect(profile.orders.every((order) => oneSidedAcrossHumanPriceBand(order, band.minimum, band.maximum)))
        .to.equal(true);
    }
    expect(profiles.map((profile) => profile.exposedUsdcInput / USDC_UNIT)).to.deep.equal([200n, 180n, 130n]);
    expect(profiles.map((profile) => profile.protectedUsdc / USDC_UNIT)).to.deep.equal([300n, 320n, 370n]);
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

  it("locks the exact conservative 100,000 NARA / 500 USDC canary vector", function () {
    const profile = buildDeterministicStrategyProfiles({
      currentSqrtPriceX96,
      creationDeadline: 2_000_000_000n,
      hookConfigurationHash: `0x${"44".repeat(32)}`,
    })[0];
    const canary = rescaleStrategyProfile(profile, TREASURY_RANGE_CANARY_NARA_BUDGET);
    expect(canary.orders.map((order) => order.inputAmount.toString())).to.deep.equal([
      "6666666666666666666666",
      "8888888888888888888888",
      "11111111111111111111111",
      "13333333333333333333333",
      "15555555555555555555555",
      "15555555555555555555555",
      "15555555555555555555555",
      "13333333333333333333337",
      "40000000",
      "50000000",
      "50000000",
      "60000000",
    ]);
    expect(canary.orders.every((order) => order.expectedInputUsed + order.expectedRoundingDust === order.inputAmount))
      .to.equal(true);
    expect(canary.orders.slice(8).map((order) => order.expectedPrincipalOutput.toString())).to.deep.equal([
      "617290654153653387856",
      "901874830189427700888",
      "1167316544777594638943",
      "1977852917162002707552",
    ]);
    expect(canary.orders.slice(8).map((order) => order.expectedLiquidity.toString())).to.deep.equal([
      "4029066476948576",
      "1912202844003854",
      "1712072930329689",
      "1737080829107937",
    ]);
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
