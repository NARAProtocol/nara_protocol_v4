import { expect } from "chai";
import hre from "hardhat";

describe("10-Rank Multi-Vector Evolution Engine Verification", function () {
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

  it("1. Correctly calculates Ranks 0 through 10 based on lifetime ETH", async function () {
    const { ethers } = await hre.network.connect();
    expect(await corePlate.rankOf(0n)).to.equal(0);
    expect(await corePlate.rankOf(ethers.parseEther("0.005"))).to.equal(1);
    expect(await corePlate.rankOf(ethers.parseEther("0.02"))).to.equal(2);
    expect(await corePlate.rankOf(ethers.parseEther("0.05"))).to.equal(3);
    expect(await corePlate.rankOf(ethers.parseEther("0.10"))).to.equal(4);
    expect(await corePlate.rankOf(ethers.parseEther("0.25"))).to.equal(5);
    expect(await corePlate.rankOf(ethers.parseEther("0.50"))).to.equal(6);
    expect(await corePlate.rankOf(ethers.parseEther("1.00"))).to.equal(7);
    expect(await corePlate.rankOf(ethers.parseEther("2.50"))).to.equal(8);
    expect(await corePlate.rankOf(ethers.parseEther("5.00"))).to.equal(9);
    expect(await corePlate.rankOf(ethers.parseEther("10.00"))).to.equal(10);
  });

  it("2. Returns all 10 Rank Names with exact nomenclature", async function () {
    expect(await corePlate.rankName(0)).to.equal("DORMANT CHASSIS");
    expect(await corePlate.rankName(1)).to.equal("SENSOR ACTIVE");
    expect(await corePlate.rankName(2)).to.equal("CIRCUIT IGNITION");
    expect(await corePlate.rankName(3)).to.equal("DOUBLE CONDUIT");
    expect(await corePlate.rankName(4)).to.equal("STATOR TURBINE");
    expect(await corePlate.rankName(5)).to.equal("ORBITAL GYROSCOPE");
    expect(await corePlate.rankName(6)).to.equal("GRAVITATIONAL WARP");
    expect(await corePlate.rankName(7)).to.equal("TACHYON STARBURST");
    expect(await corePlate.rankName(8)).to.equal("PLASMA SUPER-RING");
    expect(await corePlate.rankName(9)).to.equal("DIMENSIONAL CORONA");
    expect(await corePlate.rankName(10)).to.equal("APEX SUPERNOVA");
  });

  it("3. Renders all 10 Ranks to valid SVG with Capacitor HUD and Claim Notches", async function () {
    const { ethers } = await hre.network.connect();
    const ETH_TIERS = [
      0n,
      ethers.parseEther("0.005"),
      ethers.parseEther("0.02"),
      ethers.parseEther("0.05"),
      ethers.parseEther("0.10"),
      ethers.parseEther("0.25"),
      ethers.parseEther("0.50"),
      ethers.parseEther("1.00"),
      ethers.parseEther("2.50"),
      ethers.parseEther("5.00"),
      ethers.parseEther("10.00"),
    ];

    for (let r = 0; r <= 10; r++) {
      const svg = await corePlate.svg(
        ETH_TIERS[r],
        12345,
        0,
        1,
        1,
        ethers.parseEther("10.0"),
        1000n,
        1000n + 35040n,
        false,
        r, // claim count = r
        r  // extend count = r
      );
      expect(svg).to.include("<svg");
      expect(svg).to.include("NARA");
      expect(svg).to.include(`RANK ${r}`);
      expect(svg).to.include("CAPACITOR");
    }
  });

  it("4. Generates rich OpenSea metadata with multi-vector traits", async function () {
    const { ethers } = await hre.network.connect();
    const attrs = await metadata.attributes(
      ethers.parseEther("1.5"), // Rank 7 (Tachyon Starburst)
      12345,
      0,
      1,
      1,
      ethers.parseEther("50.0"),
      1000n,
      1000n + 35040n,
      false,
      8, // 8 claims
      3  // 3 extensions
    );

    const parsed = JSON.parse(attrs);
    const traitMap = Object.fromEntries(parsed.map((a: any) => [a.trait_type, a.value]));

    expect(traitMap["Evolution Rank"]).to.include("Rank 7 // TACHYON STARBURST");
    expect(traitMap["Capacitor Charge"]).to.equal("7/10 Cells");
    expect(traitMap["Claim Scars (Provenance)"]).to.equal("8 Claims");
    expect(traitMap["Armor Reinforcements"]).to.equal("3 Extensions");
  });
});
