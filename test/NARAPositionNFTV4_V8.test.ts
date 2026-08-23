import { expect } from "chai";
import hre from "hardhat";

const ONE = 10n ** 18n;
const UNLOCK_FEE = 2n * 10n ** 14n;

function wad(x: bigint | number): bigint {
  return BigInt(x) * ONE;
}

function decodeDataUri(uri: string, prefix: string): string {
  expect(uri.startsWith(prefix)).to.equal(true);
  return Buffer.from(uri.slice(prefix.length), "base64").toString("utf8");
}

function decodeJsonDataUri(uri: string): any {
  return JSON.parse(decodeDataUri(uri, "data:application/json;base64,"));
}

describe("NARAPositionRendererV8 & Multi-Vector Progression Suite", function () {
  let corePlate: any;
  let metadata: any;
  let renderer: any;
  let nft: any;
  let engine: any;
  let nara: any;
  let accountImpl: any;
  let deployer: any;
  let alice: any;
  let treasury: any;

  before(async function () {
    const { ethers } = await hre.network.connect();
    [deployer, alice, treasury] = await ethers.getSigners();

    // 1. Deploy Core Plate & Metadata
    const CorePlateFactory = await ethers.getContractFactory("NARAArtCorePlateV4");
    corePlate = await CorePlateFactory.deploy();
    await corePlate.waitForDeployment();

    const MetadataFactory = await ethers.getContractFactory("NARAArtMetadataV4");
    metadata = await MetadataFactory.deploy();
    await metadata.waitForDeployment();

    // 2. Deploy Mock Engine & NARA Token
    const Token = await ethers.getContractFactory("MockERC20", deployer);
    nara = await Token.deploy("NARA", "NARA", 18);
    await nara.waitForDeployment();

    const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
    engine = await Engine.deploy();
    await engine.waitForDeployment();
    await engine.setNara(await nara.getAddress());
    await engine.setUnlockFeeWei(UNLOCK_FEE);

    // 3. Deploy Account Implementation & Renderer V8
    const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
    accountImpl = await Account.deploy();
    await accountImpl.waitForDeployment();

    const BannerFactory = await ethers.getContractFactory("NARAArtCollectionBannerV4");
    const banner = await BannerFactory.deploy();
    await banner.waitForDeployment();

    const RendererV8Factory = await ethers.getContractFactory("NARAPositionRendererV8", deployer);
    renderer = await RendererV8Factory.deploy(
      await engine.getAddress(),
      await corePlate.getAddress(),
      await metadata.getAddress(),
      await banner.getAddress()
    );
    await renderer.waitForDeployment();

    // 4. Deploy Position NFT with Safe/Deployer & Treasury 10%
    const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
    nft = await NFT.deploy(
      await engine.getAddress(),
      await nara.getAddress(),
      await accountImpl.getAddress(),
      await renderer.getAddress(),
      await deployer.getAddress(),
      await treasury.getAddress(),
      1000 // 10.00%
    );
    await nft.waitForDeployment();

    await nara.mint(await alice.getAddress(), wad(100_000));
  });

  it("Should calculate correct progression ranks based on age and lock commitment", async function () {
    // 1-Day lock (96 epochs), 10 NARA, seed 0
    const p0 = await corePlate.calculateProgression(100, 100, 196, wad(10), 0, 0, 1, false);
    expect(p0.rank).to.equal(0);
    expect(p0.rankTitle).to.equal("DORMANT NODE");
    expect(p0.lockTier).to.equal(1);
    expect(p0.lockBoostLabel).to.equal("1.0X TRIAL");
    expect(p0.amountTier).to.equal(1);

    // 365-Day lock (35040 epochs), 5000 NARA (Whale), seed 7
    const p1yr = await corePlate.calculateProgression(100, 100, 35140, wad(5000), 7, 0, 1, false);
    expect(p1yr.rank).to.equal(10);
    expect(p1yr.rankTitle).to.equal("1-YEAR HORIZON");
    expect(p1yr.lockTier).to.equal(5);
    expect(p1yr.lockBoostLabel).to.equal("4.0X MAX BOOST");
    expect(p1yr.amountTier).to.equal(5); // Whale
    expect(p1yr.chargedCells).to.equal(10);
  });

  it("Should unlock Ascension I (Supernova) on Year 2 extension or 2+ extensions", async function () {
    const pAsc1 = await corePlate.calculateProgression(71000, 100, 71096, wad(100), 0, 0, 1, false);
    expect(pAsc1.ascensionTier).to.equal(1);
    expect(pAsc1.ascensionLabel).to.equal("ASCENSION I: SUPERNOVA");

    const pExt2 = await corePlate.calculateProgression(5000, 100, 5096, wad(100), 0, 2, 1, false);
    expect(pExt2.ascensionTier).to.equal(1);
  });

  it("Should unlock Ascension II (Immortal Quantum Sovereign) on Year 3 or 4+ extensions", async function () {
    const pAsc2 = await corePlate.calculateProgression(106000, 100, 106096, wad(100), 0, 0, 1, false);
    expect(pAsc2.ascensionTier).to.equal(2);
    expect(pAsc2.ascensionLabel).to.equal("ASCENSION II: IMMORTAL QUANTUM");

    const pExt4 = await corePlate.calculateProgression(5000, 100, 5096, wad(100), 0, 4, 1, false);
    expect(pExt4.ascensionTier).to.equal(2);
  });

  it("Should scale Fleet Grid ranks according to active wallet slots", async function () {
    const f1 = await corePlate.calculateProgression(100, 100, 196, wad(100), 0, 0, 1, false);
    expect(f1.fleetTitle).to.equal("FLEET: SOLO VANGUARD");

    const f4 = await corePlate.calculateProgression(100, 100, 196, wad(100), 0, 0, 4, false);
    expect(f4.fleetTitle).to.equal("FLEET: SQUADRON");

    const f16 = await corePlate.calculateProgression(100, 100, 196, wad(100), 0, 0, 16, false);
    expect(f16.fleetTitle).to.equal("FLEET: ARMADA");

    const f64 = await corePlate.calculateProgression(100, 100, 196, wad(100), 0, 0, 64, false);
    expect(f64.fleetTitle).to.equal("FLEET 64/64: SOVEREIGN MASTER");
  });

  it("Should mint a position on NARAPositionNFTV4 and render valid V8 tokenURI", async function () {
    const aliceAddr = await alice.getAddress();
    await nara.connect(alice).approve(await nft.getAddress(), wad(1000));

    const tx = await nft.connect(alice).mintAndLock(wad(1000), 35040, 0, { value: 10n ** 14n }); // 1-Year Max Lock
    await tx.wait();

    expect(await nft.ownerOf(1)).to.equal(aliceAddr);
    expect(await nft.balanceOf(aliceAddr)).to.equal(1);

    const tokenUri = await nft.tokenURI(1);
    expect(tokenUri.startsWith("data:application/json;base64,")).to.be.true;

    const parsedJson = decodeJsonDataUri(tokenUri);
    expect(parsedJson.name).to.equal("NARA Position #1");
    expect(parsedJson.image.startsWith("data:image/svg+xml;base64,")).to.be.true;

    const svgString = decodeDataUri(parsedJson.image, "data:image/svg+xml;base64,");
    expect(svgString).to.include('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700"');
    expect(svgString).to.include("FLEET: SOLO VANGUARD");
    expect(svgString).to.include("LOCKED PRINCIPAL");
    expect(svgString).to.include("1000 NARA");

    const traits = parsedJson.attributes;
    const alloyTrait = traits.find((t: any) => t.trait_type === "Chassis Alloy");
    expect(alloyTrait).to.exist;

    const eraTrait = traits.find((t: any) => t.trait_type === "Staking Era");
    expect(eraTrait).to.exist;
  });
});
