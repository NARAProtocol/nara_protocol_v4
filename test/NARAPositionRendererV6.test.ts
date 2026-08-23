import { expect } from "chai";
import hre from "hardhat";

describe("NARAPositionRendererV6 & NARAArtCorePlateV2", function () {

  it("deploys art modules and renders high-contrast fat frame SVGs across tiers", async function () {
    const { ethers } = await hre.network.connect();
    const [deployer] = await ethers.getSigners();

    const SecurityPrint = await ethers.getContractFactory("NARAArtSecurityPrintV1", deployer);

    const securityPrint = await SecurityPrint.deploy();
    await securityPrint.waitForDeployment();

    const CorePlateV2 = await ethers.getContractFactory("NARAArtCorePlateV2");
    const corePlate = await CorePlateV2.deploy(await securityPrint.getAddress());
    await corePlate.waitForDeployment();

    const GenesisPlate = await ethers.getContractFactory("NARAArtGenesisPlateV1");
    const genesisPlate = await GenesisPlate.deploy();
    await genesisPlate.waitForDeployment();

    const Metadata = await ethers.getContractFactory("NARAArtMetadataV1");
    const metadata = await Metadata.deploy();
    await metadata.waitForDeployment();

    const RendererV6 = await ethers.getContractFactory("NARAPositionRendererV6", deployer);
    const renderer = await RendererV6.deploy(
      await metadata.getAddress(),
      await corePlate.getAddress(),
      await genesisPlate.getAddress(),
      await securityPrint.getAddress()
    );
    await renderer.waitForDeployment();


    expect(await renderer.RENDERER_VERSION()).to.equal(6n);

    // Test direct SVG generation from CorePlateV2 for Tier 0 (New / Dormant)
    const svgTier0 = await corePlate.svg(
      0, // tier
      12345n, // seed
      0, // moduleIdx
      1n, // tokenId
      11n, // positionId
      1396n, // createdEpoch
      0, // claimCount
      0 // extendCount
    );

    expect(svgTier0).to.include('viewBox="0 0 1000 1000"');
    expect(svgTier0).to.include('fill="url(#frame-bevel)"'); // Luxury fat frame bevel
    expect(svgTier0).to.include('rx="36"'); // Rounded architectural outer border
    expect(svgTier0).to.include('rx="18"'); // Inner plate
    expect(svgTier0).to.include('fill="#0052FF"'); // Cobalt jewel / glow
    expect(svgTier0).to.include('DORMANT'); // High contrast tier badge
    expect(svgTier0).to.include('M-30 -44 L30 44'); // Crisp NARA diagonal sigil
    expect(svgTier0).to.include('#000011'); // Padded position ID

    // Test Tier 4 (Apex Radiant)
    const svgTier4 = await corePlate.svg(
      4, // tier
      99999n,
      1,
      2n,
      12n,
      4180n,
      5,
      2
    );
    expect(svgTier4).to.include('fill="#FF6B00"'); // Apex Radiant Amber
    expect(svgTier4).to.include('APEX RADIANT');
    expect(svgTier4).to.include('#000012');
  });
});

