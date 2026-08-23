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
    metadata = await MetadataFactory.deploy(await corePlate.getAddress());
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
      const bonus = await corePlate.computeLuckBonus(1000n, 1096n, false);
      expect(bonus).to.equal(0n);
    });

    it("calculates correct luck bonus for 1 month (2880 epochs)", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 1000n + 2880n, false);
      expect(bonus).to.equal(1n);
    });

    it("calculates correct luck bonus for 6 months (17520 epochs)", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 1000n + 17520n, false);
      expect(bonus).to.equal(10n);
    });

    it("calculates maximum 30 luck bonus for 1 year (35040 epochs)", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 1000n + 35040n, false);
      expect(bonus).to.equal(30n);
    });

    it("clamps to 30 luck bonus when duration > 35040 epochs (no overflow)", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 1000n + 50000n, false);
      expect(bonus).to.equal(30n);
    });

    it("returns maximum 30 luck bonus for isEternal = true", async function () {
      const bonus = await corePlate.computeLuckBonus(1000n, 1000n + 96n, true);
      expect(bonus).to.equal(30n);
    });
  });

  describe("2. Probability Shift Simulation (1,000 Seed Monte Carlo)", function () {
    it("proves 1-Year Max Lock with 100+ NARA enables 24K Gold and Prismatic Holo pull rates", async function () {
      const { ethers } = await hre.network.connect();
      const amount = ethers.parseEther("100");
      let goldCount = 0;
      let holoCount = 0;

      for (let seed = 0; seed < 1000; seed++) {
        const theme = await corePlate.getTheme(seed, amount, 1000n, 1000n + 35040n, false);
        if (theme.isHolo) holoCount++;
        if (theme.name === "24K Gilded Gold") goldCount++;
      }

      expect(goldCount + holoCount).to.be.greaterThan(0);
    });
  });

  describe("3. SVG Generation & Metadata Validation", function () {
    it("generates valid non-empty SVG for all duration combinations", async function () {
      const { ethers } = await hre.network.connect();
      const amount = ethers.parseEther("100");
      for (const dur of [96n, 2880n, 17520n, 35040n]) {
        const svg = await corePlate.svg(0, 100n, 0, 1n, 15n, amount, 1000n, 1000n + dur, false, 0, 0);
        expect(svg).to.be.a("string");
        expect(svg).to.include("<svg");
        expect(svg).to.include("</svg>");
      }
    });

    it("generates valid attributes in Metadata", async function () {
      const { ethers } = await hre.network.connect();
      const amount = ethers.parseEther("100");
      const attrs = await metadata.attributes(
        0,
        100n,
        0,
        1n,
        15n,
        amount,
        1000n,
        1000n + 35040n,
        false,
        0,
        0
      );
      expect(attrs).to.include("Chassis Finish");
    });
  });
});
