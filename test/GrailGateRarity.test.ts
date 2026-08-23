import { expect } from "chai";
import hre from "hardhat";

describe("NARA High-Stakes Grail Gate Rarity Verification", function () {
  let corePlate: any;
  let metadata: any;

  before(async function () {
    const { ethers } = await hre.network.connect();
    const CorePlate = await ethers.getContractFactory("NARAArtCorePlateV3");
    corePlate = await CorePlate.deploy();
    await corePlate.waitForDeployment();

    const Metadata = await ethers.getContractFactory("NARAArtMetadataV3");
    metadata = await Metadata.deploy(await corePlate.getAddress());
    await metadata.waitForDeployment();
  });

  it("1. Dust lock (< 10 NARA) with 1-Year lock CANNOT pull Gold or Holo", async function () {
    const { ethers } = await hre.network.connect();
    const DUST_AMOUNT = ethers.parseEther("1.0"); // 1 NARA
    const CREATED_EPOCH = 1000n;
    const UNLOCK_EPOCH = 1000n + 35040n; // 1 Year Max Lock

    // Test 1000 seeds - none should pull Gold or Holo
    for (let seed = 0; seed < 1000; seed++) {
      const theme = await corePlate.getTheme(seed, DUST_AMOUNT, CREATED_EPOCH, UNLOCK_EPOCH, false);
      expect(theme.isHolo).to.equal(false);
      expect(theme.name).to.not.equal("24K Gilded Gold");
      expect(theme.name).to.not.equal("Prismatic Holo Foil");
    }
  });

  it("2. Short duration (< 6 Months) with large amount (10,000 NARA) CANNOT pull Gold or Holo", async function () {
    const { ethers } = await hre.network.connect();
    const LARGE_AMOUNT = ethers.parseEther("10000.0"); // 10k NARA
    const CREATED_EPOCH = 1000n;
    const UNLOCK_EPOCH = 1000n + 100n; // 1 Day Lock

    for (let seed = 0; seed < 1000; seed++) {
      const theme = await corePlate.getTheme(seed, LARGE_AMOUNT, CREATED_EPOCH, UNLOCK_EPOCH, false);
      expect(theme.isHolo).to.equal(false);
      expect(theme.name).to.not.equal("24K Gilded Gold");
      expect(theme.name).to.not.equal("Prismatic Holo Foil");
    }
  });

  it("3. Eligible lock (100+ NARA for 1 Year) CAN pull Gold, Holo, Obsidian, Emerald, and Titanium", async function () {
    const { ethers } = await hre.network.connect();
    const ELIGIBLE_AMOUNT = ethers.parseEther("100.0"); // 100 NARA
    const CREATED_EPOCH = 1000n;
    const UNLOCK_EPOCH = 1000n + 35040n; // 1 Year Max Lock

    let holoCount = 0;
    let goldCount = 0;
    let obsidianCount = 0;
    let emeraldCount = 0;
    let titaniumCount = 0;

    for (let seed = 0; seed < 1000; seed++) {
      const theme = await corePlate.getTheme(seed, ELIGIBLE_AMOUNT, CREATED_EPOCH, UNLOCK_EPOCH, false);
      if (theme.isHolo) holoCount++;
      else if (theme.name === "24K Gilded Gold") goldCount++;
      else if (theme.name === "Obsidian Stealth") obsidianCount++;
      else if (theme.name === "Cybernetic Emerald") emeraldCount++;
      else titaniumCount++;
    }

    expect(holoCount).to.be.greaterThan(0);
    expect(goldCount).to.be.greaterThan(0);
    expect(obsidianCount).to.be.greaterThan(0);
    expect(emeraldCount).to.be.greaterThan(0);
    expect(titaniumCount).to.be.greaterThan(0);
  });

  it("4. Eternal Genesis positions are ALWAYS eligible for Sovereign Gold", async function () {
    const { ethers } = await hre.network.connect();
    const ZERO_AMOUNT = 0n;
    const theme = await corePlate.getTheme(12345, ZERO_AMOUNT, 0n, 0n, true);
    expect(theme.name).to.equal("24K Gilded Gold");
  });

  it("5. Generates rich on-chain SVG and valid JSON metadata with grail gate traits", async function () {
    const { ethers } = await hre.network.connect();
    const ELIGIBLE_AMOUNT = ethers.parseEther("100.0");
    const CREATED_EPOCH = 1000n;
    const UNLOCK_EPOCH = 1000n + 35040n;

    const svg = await corePlate.svg(1, 12345, 0, 1, 1, ELIGIBLE_AMOUNT, CREATED_EPOCH, UNLOCK_EPOCH, false, 0, 0);
    expect(svg).to.include("<svg");
    expect(svg).to.include("NARA");

    const attr = await metadata.attributes(0, 12345, 0, 1, 1, ELIGIBLE_AMOUNT, CREATED_EPOCH, UNLOCK_EPOCH, false, 0, 0);
    expect(attr).to.include("Chassis Finish");
  });
});
