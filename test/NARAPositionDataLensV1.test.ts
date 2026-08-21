import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";
import { deployRenderer } from "./helpers/art.js";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;
const LOCK_FEE = 10n ** 14n;

function wad(value: bigint | number): bigint {
  return BigInt(value) * ONE;
}

async function deployFixture() {
  const { ethers } = await hre.network.connect();
  const [deployer, alice, bob, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const nara: any = await Token.deploy("NARA", "NARA", 18);
  const usdc: any = await Token.deploy("USD Coin", "USDC", 6);
  await Promise.all([nara.waitForDeployment(), usdc.waitForDeployment()]);

  const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
  const engine: any = await Engine.deploy();
  await engine.waitForDeployment();
  await engine.setNara(await nara.getAddress());

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", deployer);
  const account: any = await Account.deploy();
  await account.waitForDeployment();

  const renderer: any = await deployRenderer(ethers, deployer);

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", deployer);
  const nft: any = await NFT.deploy(
    await engine.getAddress(),
    await nara.getAddress(),
    await account.getAddress(),
    await renderer.getAddress(),
    await deployer.getAddress(),
    await treasury.getAddress(),
    0,
  );
  await nft.waitForDeployment();

  const Distributor = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", deployer);
  const distributor: any = await Distributor.deploy(await nft.getAddress(), await usdc.getAddress());
  await distributor.waitForDeployment();
  await nft.setGenesisRewardDistributor(await distributor.getAddress());

  const Lens = await ethers.getContractFactory("NARAPositionDataLensV1", deployer);
  const lens: any = await Lens.deploy(await engine.getAddress(), await nft.getAddress());
  await lens.waitForDeployment();

  await nara.mint(await alice.getAddress(), wad(10_000));
  await nara.mint(await bob.getAddress(), wad(10_000));

  return { ethers, deployer, alice, bob, nara, usdc, engine, nft, distributor, lens };
}

async function mintManual(f: Awaited<ReturnType<typeof deployFixture>>, owner: Signer, duration = 20n) {
  const tokenId = await f.nft.nextTokenId();
  const amount = wad(1_000);
  await f.nara.connect(owner).approve(await f.nft.getAddress(), amount);
  await f.nft.connect(owner).mintAndLock(amount, duration, 0, { value: LOCK_FEE });
  return tokenId;
}

describe("NARAPositionDataLensV1", () => {
  it("validates the engine and NFT pairing", async () => {
    const f = await deployFixture();
    const Engine = await f.ethers.getContractFactory("MockNARAEngineV4", f.deployer);
    const otherEngine: any = await Engine.deploy();
    await otherEngine.waitForDeployment();
    const Lens = await f.ethers.getContractFactory("NARAPositionDataLensV1", f.deployer);

    await expect(Lens.deploy(await otherEngine.getAddress(), await f.nft.getAddress()))
      .to.be.revertedWithCustomError({ interface: Lens.interface }, "NARAPositionDataLensV1__PairingMismatch");
  });

  it("reports the ERC-721 owner, clone account, and engine custodian separately", async () => {
    const f = await deployFixture();
    await mintManual(f, f.alice);

    const data = await f.lens.getPositionData(1);
    expect(data.dataVersion).to.equal(1n);
    expect(data.owner).to.equal(await f.alice.getAddress());
    expect(data.account).to.equal(await f.nft.accountOf(1));
    expect(data.enginePositionOwner).to.equal(data.account);
    expect(data.owner).not.to.equal(data.account);
    expect(data.positionId).to.equal(1n);
    expect(data.amount).to.equal(wad(1_000));
  });

  it("uses settled epoch for pending, active, and matured lifecycle state", async () => {
    const f = await deployFixture();
    await mintManual(f, f.alice);
    const position = await f.nft.positionInfo(1);

    await f.engine.setCurrentEpoch(100);
    await f.engine.setSettledEpoch(0);
    let data = await f.lens.getPositionData(1);
    expect(data.liveEpoch).to.equal(100n);
    expect(data.settledEpoch).to.equal(0n);
    expect(data.pending).to.equal(true);
    expect(data.active).to.equal(false);
    expect(data.matured).to.equal(false);

    await f.engine.setSettledEpoch(position.activationEpoch);
    data = await f.lens.getPositionData(1);
    expect(data.pending).to.equal(false);
    expect(data.active).to.equal(true);
    expect(data.matured).to.equal(false);

    await f.engine.setSettledEpoch(position.unlockEpoch);
    data = await f.lens.getPositionData(1);
    expect(data.pending).to.equal(false);
    expect(data.active).to.equal(false);
    expect(data.matured).to.equal(true);
  });

  it("returns live engine rewards and arbitrary token rewards", async () => {
    const f = await deployFixture();
    await mintManual(f, f.alice);
    await f.engine.setClaimable(1, wad(12), ONE);
    await f.engine.setTokenClaimable(1, await f.usdc.getAddress(), 77n * USDC);

    const data = await f.lens.getPositionData(1);
    expect(data.claimableNara).to.equal(wad(12));
    expect(data.claimableEth).to.equal(ONE);
    expect(await f.lens.claimableTokenReward(1, await f.usdc.getAddress())).to.equal(77n * USDC);
  });

  it("returns Genesis provenance, weight, share, and claimable parallel rewards", async () => {
    const f = await deployFixture();
    const alice = await f.alice.getAddress();
    await f.nft.setGenesisMinter(alice, true);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.alice).mintGenesisAndLockFor(
      alice,
      wad(1_000),
      20,
      0,
      7,
      3,
      20_000,
      false,
      { value: LOCK_FEE },
    );

    await f.distributor.notifyEthRewards({ value: ONE });
    await f.usdc.mint(await f.deployer.getAddress(), 77n * USDC);
    await f.usdc.approve(await f.distributor.getAddress(), 77n * USDC);
    await f.distributor.notifyTokenRewards(77n * USDC);

    const data = await f.lens.getPositionData(1);
    expect(data.isGenesis).to.equal(true);
    expect(data.isEternal).to.equal(false);
    expect(data.genesisRoundId).to.equal(7n);
    expect(data.genesisTierId).to.equal(3n);
    expect(data.genesisRewardMultiplierBps).to.equal(20_000n);
    expect(data.genesisRewardWeight).to.equal(wad(2_000));
    expect(data.genesisRewardShareWad).to.equal(ONE);
    expect(data.claimableGenesisEth).to.equal(ONE);
    expect(data.claimableGenesisToken).to.equal(77n * USDC);
  });

  it("supports bounded batches and rejects more than 100 token IDs", async () => {
    const f = await deployFixture();
    await mintManual(f, f.alice);
    await mintManual(f, f.bob);

    const batch = await f.lens.getPositionDataBatch([1, 2]);
    expect(batch.length).to.equal(2);
    expect(batch[0].owner).to.equal(await f.alice.getAddress());
    expect(batch[1].owner).to.equal(await f.bob.getAddress());

    const tooMany = Array.from({ length: 101 }, (_, index) => BigInt(index + 1));
    await expect(f.lens.getPositionDataBatch(tooMany))
      .to.be.revertedWithCustomError(f.lens, "NARAPositionDataLensV1__TooManyTokenIds");
  });

  it("keeps valid batch results available when one token ID is stale or burned", async () => {
    const f = await deployFixture();
    await mintManual(f, f.alice, 20n);
    await mintManual(f, f.bob, 20n);
    const first = await f.nft.positionInfo(1);
    await f.engine.setCurrentEpoch(first.unlockEpoch);
    await f.nft.connect(f.alice).unlock(1);

    const batch = await f.lens.getPositionDataBatch([1, 2]);
    expect(batch[0].tokenId).to.equal(1n);
    expect(batch[0].exists).to.equal(false);
    expect(batch[1].tokenId).to.equal(2n);
    expect(batch[1].exists).to.equal(true);
  });

  it("reports closed-position arbitrary token rewards by position ID", async () => {
    const f = await deployFixture();
    await mintManual(f, f.alice, 20n);
    await f.engine.setTokenClaimable(1, await f.usdc.getAddress(), 77n * USDC);
    const position = await f.nft.positionInfo(1);
    await f.engine.setCurrentEpoch(position.unlockEpoch);
    await f.nft.connect(f.alice).unlock(1);

    const closed = await f.lens.getClosedPositionTokenData(1, await f.usdc.getAddress());
    expect(closed.rewardOwner).to.equal(await f.alice.getAddress());
    expect(closed.account).not.to.equal(f.ethers.ZeroAddress);
    expect(closed.claimableAmount).to.equal(77n * USDC);
  });

  it("reports the closed Genesis reward owner after the NFT burns", async () => {
    const f = await deployFixture();
    const alice = await f.alice.getAddress();
    await f.nft.setGenesisMinter(alice, true);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), wad(1_000));
    await f.nft.connect(f.alice).mintGenesisAndLockFor(
      alice,
      wad(1_000),
      20,
      0,
      1,
      1,
      20_000,
      false,
      { value: LOCK_FEE },
    );
    const position = await f.nft.positionInfo(1);
    await f.engine.setCurrentEpoch(position.unlockEpoch);
    await f.nft.connect(f.alice).unlock(1);

    const closed = await f.lens.getClosedGenesisData(1);
    expect(closed.rewardOwner).to.equal(alice);
    expect(closed.claimableEth).to.equal(0n);
    expect(closed.claimableToken).to.equal(0n);
  });
});
