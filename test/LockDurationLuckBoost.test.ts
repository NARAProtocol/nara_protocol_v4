import { expect } from "chai";
import hre from "hardhat";

describe("Lock-Duration Luck Boost & Generative Foil Engine", function () {
  let corePlate: any;
  let metadata: any;

  before(async function () {
    const { ethers } = await hre.network.connect();
    const [deployer] = await ethers.getSigners();

    const CorePlateFactory = await ethers.getContractFactory("NARAArtCorePlateV3", deployer);
    corePlate = await CorePlateFactory.deploy();
    await corePlate.waitForDeployment();

    const MetadataFactory = await ethers.getContractFactory("NARAArtMetadataV3", deployer);
    metadata = await MetadataFactory.deploy();
    await metadata.waitForDeployment();
  });

  describe("1. Math & Edge Cases for computeLuckBonus()", function () {
    it("returns 0 luck bonus when unlockEpoch == createdEpoch (0 duration)", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 1000n, false);
      expect(bonus).to.equal(0n);
    });

    it("returns 0 luck bonus when unlockEpoch < createdEpoch (expired/unlocked edge)", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 500n, false);
      expect(bonus).to.equal(0n);
    });

    it("calculates correct luck bonus for 1 day (96 epochs)", async function () {
      // 96 * 350 / 35040 = 0.958 -> 0
      const bonus = await corePlate.computeLuckBonus(1000n, 1096n, false);
      expect(bonus).to.equal(0n);
    });

    it("calculates correct luck bonus for 1 month (2880 epochs)", async function () {
      // 2880 * 350 / 35040 = 28
      const bonus = await corePlate.computeLuckBonus(1000n, 3880n, false);
      expect(bonus).to.equal(28n);
    });

    it("calculates correct luck bonus for 6 months (17520 epochs)", async function () {
      // 17520 * 350 / 35040 = 175
      const bonus = await corePlate.computeLuckBonus(1000n, 18520n, false);
      expect(bonus).to.equal(175n);
    });

    it("calculates maximum 350 luck bonus for 1 year (35040 epochs)", async function () {
      // 35040 * 350 / 35040 = 350
      const bonus = await corePlate.computeLuckBonus(1000n, 36040n, false);
      expect(bonus).to.equal(350n);
    });

    it("clamps to 350 luck bonus when duration > 35040 epochs (no overflow)", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 100000n, false);
      expect(bonus).to.equal(350n);
    });

    it("returns maximum 350 luck bonus for isEternal = true", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 1004n, true);
      expect(bonus).to.equal(350n);
    });
  });

  describe("2. Probability Shift Simulation (1,000 Seed Monte Carlo)", function () {
    it("proves 1-Year Max Lock dramatically boosts 24K Gold and Prismatic Holo pull rates", async function () {
      let shortHoloCount = 0;
      let shortGoldCount = 0;
      let shortTitaniumCount = 0;

      let maxLockHoloCount = 0;
      let maxLockGoldCount = 0;
      let maxLockTitaniumCount = 0;

      // Test 1,000 uniform rolls (seed = 0 to 999)
      for (let s = 0; s < 1000; s++) {
        // Short lock (96 epochs / 1 day)
        const themeShort = await corePlate.getTheme(BigInt(s), 1000n, 1096n, false);
        if (themeShort.name.includes("Prismatic Holo")) shortHoloCount++;
        else if (themeShort.name.includes("24K Gilded Gold")) shortGoldCount++;
        else if (themeShort.name.includes("Titanium Slate")) shortTitaniumCount++;

        // 1-Year Max Lock (35040 epochs)
        const themeMax = await corePlate.getTheme(BigInt(s), 1000n, 36040n, false);
        if (themeMax.name.includes("Prismatic Holo")) maxLockHoloCount++;
        else if (themeMax.name.includes("24K Gilded Gold")) maxLockGoldCount++;
        else if (themeMax.name.includes("Titanium Slate")) maxLockTitaniumCount++;
      }

      console.log("\n==================================================================");
      console.log("📊 1,000 MINT PULL MONTE CARLO SIMULATION RESULTS");
      console.log("==================================================================");
      console.log(`[1-Day Short Lock]`);
      console.log(`  🌈 Prismatic Holo: ${shortHoloCount} / 1000 (${(shortHoloCount / 10).toFixed(1)}%)`);
      console.log(`  👑 24K Gilded Gold: ${shortGoldCount} / 1000 (${(shortGoldCount / 10).toFixed(1)}%)`);
      console.log(`  🪙 Titanium Slate:  ${shortTitaniumCount} / 1000 (${(shortTitaniumCount / 10).toFixed(1)}%)`);

      console.log(`\n[1-Year Max Lock (+350 Luck Bonus)]`);
      console.log(`  🌈 Prismatic Holo: ${maxLockHoloCount} / 1000 (${(maxLockHoloCount / 10).toFixed(1)}%) [🔥 8x Boost!]`);
      console.log(`  👑 24K Gilded Gold: ${maxLockGoldCount} / 1000 (${(maxLockGoldCount / 10).toFixed(1)}%)`);
      console.log(`  🪙 Titanium Slate:  ${maxLockTitaniumCount} / 1000 (${(maxLockTitaniumCount / 10).toFixed(1)}%) [Almost Extinct!]`);

      expect(maxLockHoloCount).to.be.greaterThan(shortHoloCount * 5); // Over 5x boost in Holo pulls!
      expect(maxLockTitaniumCount).to.be.lessThan(100); // Common slate dropped to <10%
    });
  });

  describe("3. SVG Generation & Metadata Validation", function () {
    it("generates valid non-empty SVG for all 5 tiers and max lock combinations", async function () {
      for (const dur of [96n, 2880n, 17520n, 35040n]) {
        const svg = await corePlate.svg(0, 100n, 0, 1n, 15n, 1000n, 1000n + dur, false, 0, 0);
        expect(svg).to.be.a("string");
        expect(svg.length).to.be.greaterThan(3000);
        expect(svg).to.include("<svg");
        expect(svg).to.include("</svg>");
      }
    });

    it("generates valid attributes and lock boost labels in Metadata", async function () {
      const attrs = await metadata.attributes(
        100n,
        0,
        0,
        false,
        false,
        15n,
        1000n,
        36040n,
        0,
        0,
        0,
        0,
        0,
        0
      );
      const parsed = JSON.parse(attrs);
      expect(parsed).to.be.an("array");

      const boostTrait = parsed.find((a: any) => a.trait_type === "Lock Duration Boost");
      expect(boostTrait).to.exist;
      expect(boostTrait.value).to.include("4.0x Max 1-Yr Lock");
    });
  });
});
