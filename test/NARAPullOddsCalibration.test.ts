import { expect } from "chai";
import hre from "hardhat";

describe("NARA Calibrated Rarity Pyramid & Renderer V9", function () {
  let ethers: any;
  let defsPlate: any;
  let corePlate: any;
  let metadata: any;

  before(async function () {
    const conn = await hre.network.connect();
    ethers = conn.ethers;

    const DefsPlateFactory = await ethers.getContractFactory("NARAArtDefsPlateV5");
    defsPlate = await DefsPlateFactory.deploy();
    await defsPlate.waitForDeployment();

    const CorePlateFactory = await ethers.getContractFactory("NARAArtCorePlateV5");
    corePlate = await CorePlateFactory.deploy(defsPlate.target);
    await corePlate.waitForDeployment();

    const MetadataFactory = await ethers.getContractFactory("NARAArtMetadataV5");
    metadata = await MetadataFactory.deploy();
    await metadata.waitForDeployment();
  });

  describe("Tokens 48+ Calibrated Probabilities (Exact Mathematical Ladder)", function () {
    const EPOCHS_PER_YEAR = 35040;

    it("evaluates exact 1-day baseline odds (1.0% Gold, 4.0% Damascus, 15.0% Obsidian, 30.0% Emerald, 50.0% Slate)", async function () {
      const createdEpoch = 1000;
      const unlockEpoch = createdEpoch + 96; // 1 day
      const amount = ethers.parseEther("100"); // non-whale

      let goldCount = 0;
      let damascusCount = 0;
      let obsidianCount = 0;
      let emeraldCount = 0;
      let slateCount = 0;

      // Test all 1000 rolls (0 to 999) for token #48
      for (let roll = 0; roll < 1000; roll++) {
        const tier = Number(await corePlate.determineTier(48, roll, false, amount, createdEpoch, unlockEpoch));
        if (tier === 0) goldCount++;
        else if (tier === 1) damascusCount++;
        else if (tier === 2) obsidianCount++;
        else if (tier === 3) emeraldCount++;
        else if (tier === 4) slateCount++;
      }

      expect(goldCount).to.equal(10); // 1.0%
      expect(damascusCount).to.equal(40); // 4.0%
      expect(obsidianCount).to.equal(150); // 15.0%
      expect(emeraldCount).to.equal(300); // 30.0%
      expect(slateCount).to.equal(500); // 50.0%
      expect(goldCount + damascusCount + obsidianCount + emeraldCount + slateCount).to.equal(1000);
    });

    it("evaluates exact 365-day max luck odds (4.5% Gold, 10.5% Damascus, 22.0% Obsidian, 35.0% Emerald, 28.0% Slate)", async function () {
      const createdEpoch = 1000;
      const unlockEpoch = createdEpoch + EPOCHS_PER_YEAR; // 365 days
      const amount = ethers.parseEther("100"); // non-whale

      let goldCount = 0;
      let damascusCount = 0;
      let obsidianCount = 0;
      let emeraldCount = 0;
      let slateCount = 0;

      for (let roll = 0; roll < 1000; roll++) {
        const tier = Number(await corePlate.determineTier(48, roll, false, amount, createdEpoch, unlockEpoch));
        if (tier === 0) goldCount++;
        else if (tier === 1) damascusCount++;
        else if (tier === 2) obsidianCount++;
        else if (tier === 3) emeraldCount++;
        else if (tier === 4) slateCount++;
      }

      expect(goldCount).to.equal(45); // 4.5%
      expect(damascusCount).to.equal(105); // 10.5%
      expect(obsidianCount).to.equal(220); // 22.0%
      expect(emeraldCount).to.equal(350); // 35.0%
      expect(slateCount).to.equal(280); // 28.0%
      expect(goldCount + damascusCount + obsidianCount + emeraldCount + slateCount).to.equal(1000);
    });

    it("evaluates exact Whale 365-day max luck odds (6.5% Gold, 14.5% Damascus, 22.0% Obsidian, 33.0% Emerald, 24.0% Slate)", async function () {
      const createdEpoch = 1000;
      const unlockEpoch = createdEpoch + EPOCHS_PER_YEAR; // 365 days
      const amount = ethers.parseEther("5000"); // Whale (>= 5,000 NARA)

      let goldCount = 0;
      let damascusCount = 0;
      let obsidianCount = 0;
      let emeraldCount = 0;
      let slateCount = 0;

      for (let roll = 0; roll < 1000; roll++) {
        const tier = Number(await corePlate.determineTier(48, roll, false, amount, createdEpoch, unlockEpoch));
        if (tier === 0) goldCount++;
        else if (tier === 1) damascusCount++;
        else if (tier === 2) obsidianCount++;
        else if (tier === 3) emeraldCount++;
        else if (tier === 4) slateCount++;
      }

      expect(goldCount).to.equal(65); // 6.5% Apex Grail
      expect(damascusCount).to.equal(145); // 14.5% Legendary
      expect(obsidianCount).to.equal(220); // 22.0% Rare
      expect(emeraldCount).to.equal(330); // 33.0% Uncommon
      expect(slateCount).to.equal(240); // 24.0% Common
      expect(goldCount + damascusCount + obsidianCount + emeraldCount + slateCount).to.equal(1000);
    });
  });

  describe("Grandfathering Gen-0 Relics (Tokens #1 to #47)", function () {
    it("preserves legacy V8 identity roll for Token #1 to #47", async function () {
      const createdEpoch = 1000;
      const unlockEpoch = createdEpoch + 35040;
      const amount = ethers.parseEther("1000");

      // For token #10 (historical Gold in Gen-0), verify it evaluates to Gold (tier 0)
      // In legacy V8: for 365d lock (luck = 350), seed % 1000 between 350 and 479 collapsed into roll < 130 -> Gold!
      const seedGold = 400; // 400 - 350 = 50 < 130 -> Gold
      const tier10 = await corePlate.determineTier(10, seedGold, false, amount, createdEpoch, unlockEpoch);
      expect(tier10).to.equal(0); // 24K Gilded Gold

      // Verify metadata returns "24K Gilded Gold (Apex Grail)"
      const alloyName10 = await metadata.alloyName(10, seedGold, false, amount, createdEpoch, unlockEpoch);
      expect(alloyName10).to.equal("24K Gilded Gold (Apex Grail)");
    });
  });

  describe("Metadata & Luxury Trait Consistency", function () {
    it("returns Obsidian Void (Rare) instead of Obsidian Stealth for tier 2", async function () {
      const createdEpoch = 1000;
      const unlockEpoch = createdEpoch + 96;
      const amount = ethers.parseEther("100");

      // Roll 60 on 1-day lock -> Gold is 0-9, Damascus is 10-49, Obsidian is 50-199
      const rollObsidian = 100;
      const name = await metadata.alloyName(48, rollObsidian, false, amount, createdEpoch, unlockEpoch);
      expect(name).to.equal("Obsidian Void (Rare)");
    });

    it("returns 24K Gilded Gold (Apex Grail) for tier 0", async function () {
      const createdEpoch = 1000;
      const unlockEpoch = createdEpoch + 96;
      const amount = ethers.parseEther("100");

      const rollGold = 5; // < 10
      const name = await metadata.alloyName(48, rollGold, false, amount, createdEpoch, unlockEpoch);
      expect(name).to.equal("24K Gilded Gold (Apex Grail)");
    });

    it("returns Forged Damascus Meteorite (Legendary) for tier 1", async function () {
      const createdEpoch = 1000;
      const unlockEpoch = createdEpoch + 96;
      const amount = ethers.parseEther("100");

      const rollDamascus = 25; // 10 to 49
      const name = await metadata.alloyName(48, rollDamascus, false, amount, createdEpoch, unlockEpoch);
      expect(name).to.equal("Forged Damascus Meteorite (Legendary)");
    });
  });

  describe("SVG Quality & Omnidirectional Shine", function () {
    it("renders valid SVG for Gold with 360-degree halo and solar astrolabe", async function () {
      const svg = await corePlate.svg(
        5000, // currentEpoch
        5,    // seed (rolls Gold)
        48,   // tokenId
        1,    // positionId
        ethers.parseEther("5000"), // amount
        1000, // createdEpoch
        36040,// unlockEpoch (365d)
        true, // isEternal
        0,    // claimCount
        0,    // extendCount
        1     // walletActiveSlots
      );

      expect(svg).to.include("<svg");
      expect(svg).to.include("</svg>");
      expect(svg).to.include("24K Gilded Gold");
      expect(svg).to.include("box-shadow:0 0 50px rgba(255,193,7,.55)"); // 360 halo
      expect(svg).to.include("goldSunburst"); // solar astrolabe
      expect(svg).to.include("goldOmniShine"); // radial ambient bloom
      expect(svg).to.include("10.00X POWER"); // apex power
    });

    it("renders valid SVG for Obsidian Void with Royal Purple palette", async function () {
      const svg = await corePlate.svg(
        5000, // currentEpoch
        100,  // seed (rolls Obsidian Void)
        48,   // tokenId
        1,    // positionId
        ethers.parseEther("1000"),
        1000,
        18280,// unlockEpoch
        false,
        0,
        0,
        1
      );

      expect(svg).to.include("<svg");
      expect(svg).to.include("Obsidian Void");
      expect(svg).to.include("#C084FC"); // royal purple pinstripe
      expect(svg).to.include("#7E22CE"); // deep amethyst glow
      expect(svg).to.not.include("#FF1744"); // NO red!
      expect(svg).to.not.include("#FF2A55"); // NO red!
    });
  });
});
