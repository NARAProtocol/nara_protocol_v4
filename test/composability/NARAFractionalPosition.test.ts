import hre from "hardhat";
import { expect } from "chai";
import { deployRenderer } from "../helpers/art";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;

async function deployFixture() {
  const { ethers } = await hre.network.connect();
  const [owner, buyer1, buyer2, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", owner);
  const nara: any = await Token.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();
  const usdc: any = await Token.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const Engine = await ethers.getContractFactory("MockNARAEngineV4", owner);
  const engine: any = await Engine.deploy();
  await engine.waitForDeployment();
  await engine.setNara(await nara.getAddress());
  await engine.setLockFeeWei(0);
  await engine.setUnlockFeeWei(0);

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", owner);
  const accountImpl: any = await Account.deploy();
  await accountImpl.waitForDeployment();

  const renderer: any = await deployRenderer(ethers, owner);

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", owner);
  const nft: any = await NFT.deploy(
    await engine.getAddress(),
    await nara.getAddress(),
    await accountImpl.getAddress(),
    await renderer.getAddress(),
    await owner.getAddress(),
    await treasury.getAddress(),
    0,
  );
  await nft.waitForDeployment();

  const Distributor = await ethers.getContractFactory("NARAGenesisRewardDistributorV4", owner);
  const genesisDistributor: any = await Distributor.deploy(await nft.getAddress(), await usdc.getAddress());
  await genesisDistributor.waitForDeployment();
  await nft.setGenesisRewardDistributor(await genesisDistributor.getAddress());

  const Factory = await ethers.getContractFactory("NARAFractionalPositionFactoryV4", owner);
  const factory: any = await Factory.deploy(
    await nara.getAddress(),
    await usdc.getAddress(),
    await engine.getAddress(),
    await nft.getAddress(),
  );
  await factory.waitForDeployment();

  const amount = 1_000n * ONE;
  await nara.mint(await owner.getAddress(), amount * 2n);
  await nara.connect(owner).approve(await nft.getAddress(), amount);
  await nft.connect(owner).mintAndLock(amount, 100n, 0);

  return {
    ethers,
    owner,
    buyer1,
    buyer2,
    treasury,
    nara,
    usdc,
    engine,
    nft,
    genesisDistributor,
    factory,
    tokenId: 1n,
    positionId: 1n,
    amount,
  };
}

async function createAndBind(
  f: Awaited<ReturnType<typeof deployFixture>>,
  fractions = 1_000n,
  tokenId = f.tokenId,
) {
  await f.factory.connect(f.owner).create(tokenId);
  const fracAddr = await f.factory.fractionalOf(tokenId);
  const frac: any = await f.ethers.getContractAt("NARAFractionalPositionV4", fracAddr);
  await f.nft.connect(f.owner).approve(fracAddr, tokenId);
  await frac.connect(f.owner).bind(tokenId, fractions);
  return frac;
}

describe("NARAFractionalPositionV4", () => {
  it("prevents non-owners from squatting another account's tokenId", async () => {
    const f = await deployFixture();

    await expect(
      f.factory.connect(f.buyer1).create(f.tokenId),
    ).to.be.revertedWithCustomError(f.factory, "NotTokenOwnerOrApproved");

    await f.nft.connect(f.owner).approve(await f.buyer1.getAddress(), f.tokenId);
    await f.factory.connect(f.buyer1).create(f.tokenId);
    expect(await f.factory.fractionalOf(f.tokenId)).to.not.equal(f.ethers.ZeroAddress);
  });

  it("lets the current NFT owner replace an unbound wrapper registry entry", async () => {
    const f = await deployFixture();
    await f.factory.connect(f.owner).create(f.tokenId);
    const firstWrapper = await f.factory.fractionalOf(f.tokenId);

    const buyerAddr = await f.buyer1.getAddress();
    await f.nft.connect(f.owner).transferFrom(await f.owner.getAddress(), buyerAddr, f.tokenId);
    await f.factory.connect(f.buyer1).create(f.tokenId);
    const secondWrapper = await f.factory.fractionalOf(f.tokenId);

    expect(secondWrapper).to.not.equal(firstWrapper);
  });

  it("binds the NFT and mints all fractions to the depositor", async () => {
    const f = await deployFixture();
    const frac = await createAndBind(f);

    expect(await frac.balanceOf(await f.owner.getAddress())).to.equal(1_000n);
    expect(await frac.totalSupply()).to.equal(1_000n);
    expect(await frac.bound()).to.equal(true);
  });

  it("rejects Eternal Genesis NFTs before binding", async () => {
    const f = await deployFixture();
    const ownerAddr = await f.owner.getAddress();
    await f.nft.setGenesisMinter(ownerAddr, true);
    await f.nara.connect(f.owner).approve(await f.nft.getAddress(), f.amount);
    await f.nft.connect(f.owner).mintGenesisAndLockFor(
      ownerAddr,
      f.amount,
      100n,
      0,
      1,
      1,
      20_000,
      true,
    );

    const tokenId = 2n;
    await f.factory.connect(f.owner).create(tokenId);
    const fracAddr = await f.factory.fractionalOf(tokenId);
    const frac: any = await f.ethers.getContractAt("NARAFractionalPositionV4", fracAddr);
    await f.nft.connect(f.owner).approve(fracAddr, tokenId);

    await expect(frac.connect(f.owner).bind(tokenId, 1_000n))
      .to.be.revertedWithCustomError(frac, "UnsupportedEternalGenesis");
    expect(await frac.bound()).to.equal(false);
    expect(await f.nft.ownerOf(tokenId)).to.equal(ownerAddr);
  });

  it("rejects direct safe transfers so NFTs cannot be trapped outside bind()", async () => {
    const f = await deployFixture();
    await f.factory.connect(f.owner).create(f.tokenId);
    const fracAddr = await f.factory.fractionalOf(f.tokenId);
    const frac: any = await f.ethers.getContractAt("NARAFractionalPositionV4", fracAddr);

    await expect(
      f.nft.connect(f.owner)["safeTransferFrom(address,address,uint256)"](
        await f.owner.getAddress(),
        fracAddr,
        f.tokenId,
      ),
    ).to.be.revertedWithCustomError(frac, "InvalidNftReceived");
  });

  it("indexes direct ETH received after binding instead of trapping it as dust", async () => {
    const f = await deployFixture();
    const frac = await createAndBind(f);
    const ownerAddr = await f.owner.getAddress();
    const reward = f.ethers.parseEther("1");

    await f.buyer1.sendTransaction({ to: await frac.getAddress(), value: reward });
    expect(await frac.pendingEth(ownerAddr)).to.equal(reward);
  });

  it("harvest tolerates empty reward claims from the underlying position", async () => {
    const f = await deployFixture();
    const frac = await createAndBind(f);

    await frac.harvest();
  });

  it("checkpoints underlying rewards before fraction ownership moves", async () => {
    const f = await deployFixture();
    const frac = await createAndBind(f);
    const ownerAddr = await f.owner.getAddress();
    const buyerAddr = await f.buyer1.getAddress();
    const reward = 100n * ONE;

    await f.nara.mint(await f.engine.getAddress(), reward);
    await f.engine.setClaimable(f.positionId, reward, 0);
    await frac.connect(f.owner).transfer(buyerAddr, 900n);

    const [ownerPending] = await frac.pendingRewards(ownerAddr);
    const [buyerPending] = await frac.pendingRewards(buyerAddr);
    expect(ownerPending).to.equal(reward);
    expect(buyerPending).to.equal(0n);
  });

  it("self transfer and same-address transferFrom preserve pending rewards", async () => {
    const f = await deployFixture();
    const frac = await createAndBind(f);
    const ownerAddr = await f.owner.getAddress();
    const reward = 100n * ONE;

    await f.nara.mint(await f.engine.getAddress(), reward);
    await f.engine.setClaimable(f.positionId, reward, 0);
    await frac.harvest();

    const [beforeSelf] = await frac.pendingRewards(ownerAddr);
    expect(beforeSelf).to.be.gt(0n);

    await frac.connect(f.owner).transfer(ownerAddr, 1n);
    const [afterSelf] = await frac.pendingRewards(ownerAddr);
    expect(afterSelf).to.equal(beforeSelf);

    await frac.connect(f.owner).approve(await f.buyer1.getAddress(), 1n);
    await frac.connect(f.buyer1).transferFrom(ownerAddr, ownerAddr, 1n);
    const [afterTransferFrom] = await frac.pendingRewards(ownerAddr);
    expect(afterTransferFrom).to.equal(beforeSelf);
  });

  it("unlocks through unlockTo after maturity and lets holders claim principal", async () => {
    const f = await deployFixture();
    const frac = await createAndBind(f);
    const ownerAddr = await f.owner.getAddress();
    const buyerAddr = await f.buyer1.getAddress();

    await frac.connect(f.owner).transfer(buyerAddr, 400n);

    const position = await f.engine.positionOf(f.positionId);
    await f.engine.setCurrentEpoch(position.unlockEpoch);

    await frac.unlockPosition();

    const ownerBefore = await f.nara.balanceOf(ownerAddr);
    await frac.connect(f.owner).claimPrincipal(ownerAddr);
    const ownerAfter = await f.nara.balanceOf(ownerAddr);
    expect(ownerAfter - ownerBefore).to.equal((f.amount * 600n) / 1_000n);
  });

  it("requires the exact native unlock fee when unlocking the fractional position", async () => {
    const f = await deployFixture();
    const frac = await createAndBind(f);

    await f.engine.setUnlockFeeWei(5n);
    const position = await f.engine.positionOf(f.positionId);
    await f.engine.setCurrentEpoch(position.unlockEpoch);

    await expect(frac.unlockPosition({ value: 4n }))
      .to.be.revertedWithCustomError(frac, "IncorrectEthFee")
      .withArgs(5n, 4n);
    await expect(frac.unlockPosition({ value: 6n }))
      .to.be.revertedWithCustomError(frac, "IncorrectEthFee")
      .withArgs(5n, 6n);

    await frac.unlockPosition({ value: 5n });
    expect(await frac.unlocked()).to.equal(true);
  });

  it("M-07: indivisible fractions — final claimer sweeps the exact remainder, no dust stranded", async () => {
    const f = await deployFixture();
    const ownerAddr = await f.owner.getAddress();
    const buyer1Addr = await f.buyer1.getAddress();
    const buyer2Addr = await f.buyer2.getAddress();

    // 7 fractions over 1000e18 principal => indivisible, so rounding dust would otherwise strand.
    const frac = await createAndBind(f, 7n);
    await frac.connect(f.owner).transfer(buyer1Addr, 2n);
    await frac.connect(f.owner).transfer(buyer2Addr, 2n); // owner keeps 3

    const position = await f.engine.positionOf(f.positionId);
    await f.engine.setCurrentEpoch(position.unlockEpoch);
    await frac.unlockPosition();

    const principal = await frac.principalReturned();
    expect(principal).to.equal(f.amount);

    const o0 = await f.nara.balanceOf(ownerAddr);
    const b1_0 = await f.nara.balanceOf(buyer1Addr);
    const b2_0 = await f.nara.balanceOf(buyer2Addr);

    // All three holders claim (owner is NOT the cumulative-last under the old broken check).
    await frac.connect(f.owner).claimPrincipal(ownerAddr);
    await frac.connect(f.buyer1).claimPrincipal(buyer1Addr);
    await frac.connect(f.buyer2).claimPrincipal(buyer2Addr);

    const recovered =
      ((await f.nara.balanceOf(ownerAddr)) - o0) +
      ((await f.nara.balanceOf(buyer1Addr)) - b1_0) +
      ((await f.nara.balanceOf(buyer2Addr)) - b2_0);
    // Full participation recovers the entire principal with zero stranded dust.
    expect(recovered).to.equal(principal);
    expect(await f.nara.balanceOf(await frac.getAddress())).to.equal(0n);
  });

  it("accounts Genesis reward tokens received during fractional unlock", async () => {
    const f = await deployFixture();
    const ownerAddr = await f.owner.getAddress();
    await f.nft.setGenesisMinter(ownerAddr, true);
    await f.nara.connect(f.owner).approve(await f.nft.getAddress(), f.amount);
    await f.nft.connect(f.owner).mintGenesisAndLockFor(
      ownerAddr,
      f.amount,
      100n,
      0,
      1,
      1,
      20_000,
      false,
    );

    const tokenId = 2n;
    const positionId = await f.nft.positionIdOf(tokenId);
    const frac = await createAndBind(f, 1_000n, tokenId);
    const reward = 100n * USDC;
    await f.usdc.mint(ownerAddr, reward);
    await f.usdc.connect(f.owner).approve(await f.genesisDistributor.getAddress(), reward);
    await f.genesisDistributor.connect(f.owner).notifyTokenRewards(reward);

    const position = await f.engine.positionOf(positionId);
    await f.engine.setCurrentEpoch(position.unlockEpoch);
    await frac.unlockPosition();

    const [, pendingUsdc] = await frac.pendingRewards(ownerAddr);
    expect(pendingUsdc).to.equal(reward);
    const before = await f.usdc.balanceOf(ownerAddr);
    await frac.claimRewards(ownerAddr);
    const after = await f.usdc.balanceOf(ownerAddr);
    expect(after - before).to.equal(reward);
  });
});
