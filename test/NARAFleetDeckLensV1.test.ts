import { expect } from "chai";
import hre from "hardhat";

const ONE = 10n ** 18n;
const LOCK_FEE = 10n ** 14n;

function wad(x: bigint | number): bigint {
  return BigInt(x) * ONE;
}

describe("NARAFleetDeckLensV1 & Quadratic Multiplier Suite", function () {
  let ethers: any;
  let deployer: any;
  let alice: any;
  let bob: any;
  let treasury: any;
  let nara: any;
  let usdc: any;
  let engine: any;
  let accountImpl: any;
  let corePlate: any;
  let metadata: any;
  let banner: any;
  let renderer: any;
  let nft: any;
  let distributor: any;
  let fleetLens: any;

  before(async function () {
    const net = await hre.network.connect();
    ethers = net.ethers;
    [deployer, alice, bob, treasury] = await ethers.getSigners();

    // 1. Tokens
    const Token = await ethers.getContractFactory("MockERC20", deployer);
    nara = await Token.deploy("NARA", "NARA", 18);
    usdc = await Token.deploy("USD Coin", "USDC", 6);
    await Promise.all([nara.waitForDeployment(), usdc.waitForDeployment()]);

    // 2. Engine
    const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
    engine = await Engine.deploy();
    await engine.waitForDeployment();
    await engine.setNara(await nara.getAddress());

    // 3. Periphery Art & Renderer Stack
    const CorePlate = await ethers.getContractFactory("NARAArtCorePlateV4", deployer);
    corePlate = await CorePlate.deploy();
    await corePlate.waitForDeployment();

    const Metadata = await ethers.getContractFactory("NARAArtMetadataV4", deployer);
    metadata = await Metadata.deploy();
    await metadata.waitForDeployment();

    const Banner = await ethers.getContractFactory("NARAArtCollectionBannerV4", deployer);
    banner = await Banner.deploy();
    await banner.waitForDeployment();

    const Renderer = await ethers.getContractFactory("NARAPositionRendererV8", deployer);
    renderer = await Renderer.deploy(
      await engine.getAddress(),
      await corePlate.getAddress(),
      await metadata.getAddress(),
      await banner.getAddress()
    );
    await renderer.waitForDeployment();

    // 4. NFT & Account Implementation
    const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
    accountImpl = await Account.deploy();
    await accountImpl.waitForDeployment();

    const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
    nft = await NFT.deploy(
      await engine.getAddress(),
      await nara.getAddress(),
      await accountImpl.getAddress(),
      await renderer.getAddress(),
      await deployer.getAddress(),
      await treasury.getAddress(),
      1000
    );
    await nft.waitForDeployment();

    // 5. Genesis Distributor
    const Distr = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", deployer);
    distributor = await Distr.deploy(await nft.getAddress(), await usdc.getAddress());
    await distributor.waitForDeployment();
    await nft.setGenesisRewardDistributor(await distributor.getAddress());

    // 6. Deploy Fleet Deck Lens V1
    const FleetLens = await ethers.getContractFactory("NARAFleetDeckLensV1", deployer);
    fleetLens = await FleetLens.deploy(await engine.getAddress(), await nft.getAddress());
    await fleetLens.waitForDeployment();

    // Mint funds for Alice
    await nara.mint(await alice.getAddress(), wad(100_000));
    await nara.connect(alice).approve(await nft.getAddress(), wad(100_000));
  });

  describe("1. Granular Multiplier & Horology Verification", function () {
    it("computes exact continuous quadratic multipliers from 1.00X to 3.00X", async function () {
      // 0 Days -> 1.00X
      const m0 = await corePlate.calculateMultiplierWad(1000n, 1000n, false);
      expect(m0).to.equal(wad(1));
      expect(await corePlate.formatMultiplier(m0)).to.equal("1.00X");

      // 180 Days (17,520 epochs) -> 1.75X
      const m180 = await corePlate.calculateMultiplierWad(1000n, 1000n + 17520n, false);
      expect(m180).to.equal((175n * ONE) / 100n);
      expect(await corePlate.formatMultiplier(m180)).to.equal("1.75X");

      // 365 Days (35,040 epochs) -> 3.00X
      const m365 = await corePlate.calculateMultiplierWad(1000n, 1000n + 35040n, false);
      expect(m365).to.equal(wad(3));
      expect(await corePlate.formatMultiplier(m365)).to.equal("3.00X");
    });
  });

  describe("2. NARAFleetDeckLensV1 Deck Aggregation & Synergy", function () {
    it("scans a 6-slot full fleet deck and computes weighted average multiplier & Hexa Armada Synergy", async function () {
      const aliceAddr = await alice.getAddress();
      const tokenIds: bigint[] = [];

      for (let i = 0; i < 3; i++) {
        const tx = await nft.connect(alice).mintAndLock(wad(1000), 35040, 0, { value: LOCK_FEE });
        await tx.wait();
        tokenIds.push(BigInt(i + 1));
      }
      for (let i = 3; i < 6; i++) {
        const tx = await nft.connect(alice).mintAndLock(wad(1000), 17520, 0, { value: LOCK_FEE });
        await tx.wait();
        tokenIds.push(BigInt(i + 1));
      }

      await engine.setCurrentEpoch(100);

      const deck = await fleetLens.getFleetDeckSummary(aliceAddr, tokenIds);

      expect(deck.user).to.equal(aliceAddr);
      expect(deck.totalLockedNara).to.equal(wad(6000));
      // Total weight: 3 * (1000 * 35040) + 3 * (1000 * 17520) = 105120000 + 52560000 = 157680000 NARA weight
      expect(deck.totalWeight).to.equal(wad(157680000));

      expect(deck.synergy.synergyTier).to.equal(5);
      expect(deck.synergy.synergyTierName).to.equal("Hexa Armada Sovereign");
      expect(deck.synergy.synergyBonusBps).to.equal(2500);
      expect(deck.synergy.activeSlotsCount).to.equal(6);
    });

    it("reverts when deck exceeds 6 positions", async function () {
      const aliceAddr = await alice.getAddress();
      const invalidDeck = [1n, 2n, 3n, 4n, 5n, 6n, 7n];

      await expect(
        fleetLens.getFleetDeckSummary(aliceAddr, invalidDeck)
      ).to.be.revertedWithCustomError(fleetLens, "NARAFleetDeckLensV1__DeckCapacityExceeded");
    });
  });
});
