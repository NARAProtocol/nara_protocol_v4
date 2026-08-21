import hre from "hardhat";
import { expect } from "chai";
import { deployRenderer } from "../helpers/art.js";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;

async function deployFixture() {
  const { ethers } = await hre.network.connect();
  const [admin, user, other, keeper, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", admin);
  const nara: any = await Token.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();
  const usdc: any = await Token.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();

  const Engine = await ethers.getContractFactory("MockNARAEngineV4", admin);
  const engine: any = await Engine.deploy();
  await engine.waitForDeployment();
  await engine.setNara(await nara.getAddress());
  await engine.setLockFeeWei(0);
  await engine.setUnlockFeeWei(0);
  await engine.setLockFeeBps(0);

  const Account = await ethers.getContractFactory("NARAPositionAccountV4", admin);
  const accountImpl: any = await Account.deploy();
  await accountImpl.waitForDeployment();

  const renderer: any = await deployRenderer(ethers, admin);

  const NFT = await ethers.getContractFactory("NARAPositionNFTV4", admin);
  const nft: any = await NFT.deploy(
    await engine.getAddress(),
    await nara.getAddress(),
    await accountImpl.getAddress(),
    await renderer.getAddress(),
    await admin.getAddress(),
    await treasury.getAddress(),
    0,
  );
  await nft.waitForDeployment();

  const Pool = await ethers.getContractFactory("NARAStakingPoolV4", admin);
  const pool: any = await Pool.deploy(
    await nara.getAddress(),
    await usdc.getAddress(),
    await engine.getAddress(),
    await nft.getAddress(),
    await admin.getAddress(),
  );
  await pool.waitForDeployment();
  await pool.grantRole(await pool.LOCKER_ROLE(), await keeper.getAddress());

  await nara.mint(await user.getAddress(), 10_000n * ONE);
  await nara.mint(await other.getAddress(), 10_000n * ONE);

  return { ethers, admin, user, other, keeper, treasury, nara, usdc, engine, nft, pool };
}

async function openPoolPosition(f: Awaited<ReturnType<typeof deployFixture>>, amount = 1_000n * ONE) {
  await f.nara.connect(f.user).approve(await f.pool.getAddress(), amount);
  await f.pool.connect(f.user).deposit(amount, 0);
  await f.pool.connect(f.keeper).lockLiquid(amount, 0);

  const tokenId = await f.pool.underlyingTokenIds(0);
  const positionId = await f.nft.positionIdOf(tokenId);
  return { tokenId, positionId, amount };
}

describe("NARAStakingPoolV4", () => {
  it("first deposit preview and minShares reflect permanently burned dead shares", async () => {
    const f = await deployFixture();
    const amount = 1_000n * ONE;
    await f.nara.connect(f.user).approve(await f.pool.getAddress(), amount);

    expect(await f.pool.previewDeposit(amount)).to.equal(amount - ONE);
    await expect(f.pool.connect(f.user).deposit(amount, amount))
      .to.be.revertedWithCustomError(f.pool, "SlippageExceeded");
    await f.pool.connect(f.user).deposit(amount, amount - ONE);
    expect(await f.pool.balanceOf(await f.user.getAddress())).to.equal(amount - ONE);
  });

  it("opens and harvests a real v4 NFT position without zero-reward reverts", async () => {
    const f = await deployFixture();
    await openPoolPosition(f);

    await f.pool.connect(f.keeper).harvest();
    expect(await f.pool.underlyingTokenCount()).to.equal(1n);
  });

  it("accrues USDC before claimUsdc pays the holder", async () => {
    const f = await deployFixture();
    const { positionId } = await openPoolPosition(f);
    const reward = 1_000n * USDC;

    await f.usdc.mint(await f.engine.getAddress(), reward);
    await f.engine.setTokenClaimable(positionId, await f.usdc.getAddress(), reward);
    await f.pool.connect(f.keeper).harvest();

    const userAddr = await f.user.getAddress();
    const claimable = await f.pool.claimableUsdc(userAddr);
    expect(claimable).to.be.gt(0n);

    const before = await f.usdc.balanceOf(userAddr);
    await f.pool.connect(f.user).claimUsdc(userAddr);
    const after = await f.usdc.balanceOf(userAddr);
    expect(after - before).to.equal(claimable);
  });

  it("checkpoints underlying rewards before stNARA ownership moves", async () => {
    const f = await deployFixture();
    const { positionId } = await openPoolPosition(f);
    const reward = 1_000n * USDC;
    const userAddr = await f.user.getAddress();
    const otherAddr = await f.other.getAddress();

    await f.usdc.mint(await f.engine.getAddress(), reward);
    await f.engine.setTokenClaimable(positionId, await f.usdc.getAddress(), reward);

    const userShares = await f.pool.balanceOf(userAddr);
    await f.pool.connect(f.user).transfer(otherAddr, userShares * 9n / 10n);

    expect(await f.pool.claimableUsdc(otherAddr)).to.equal(0n);
    expect(await f.pool.claimableUsdc(userAddr)).to.be.gt(0n);
  });

  it("harvests stale NARA rewards before pricing new deposits", async () => {
    const f = await deployFixture();
    const { positionId } = await openPoolPosition(f);
    const reward = 100n * ONE;
    const depositAmount = 1_000n * ONE;

    await f.nara.mint(await f.engine.getAddress(), reward);
    await f.engine.setClaimable(positionId, reward, 0);

    const otherAddr = await f.other.getAddress();
    await f.nara.connect(f.other).approve(await f.pool.getAddress(), depositAmount);
    await f.pool.connect(f.other).deposit(depositAmount, 0);

    expect(await f.pool.balanceOf(otherAddr)).to.be.lt(depositAmount);
    expect(await f.pool.liquidNara()).to.equal(depositAmount + reward);
  });

  it("checkpoints every underlying position before pricing a deposit", async () => {
    const f = await deployFixture();
    const amount = 100n * ONE;
    const poolAddr = await f.pool.getAddress();
    const positionIds: bigint[] = [];

    for (let i = 0; i < 10; i++) {
      await openPoolPosition(f, amount);
      const count = await f.pool.underlyingTokenCount();
      const tokenId = await f.pool.underlyingTokenIds(count - 1n);
      const positionId = await f.nft.positionIdOf(tokenId);
      positionIds.push(positionId);
    }

    await f.nara.mint(await f.engine.getAddress(), 20n);
    for (const positionId of positionIds) {
      await f.engine.setClaimable(positionId, 1n, 0);
    }

    await f.engine.resetClaimRewardsCalls();
    await f.nara.connect(f.other).approve(poolAddr, amount);
    await f.pool.connect(f.other).deposit(amount, 0);
    expect(await f.engine.claimRewardsCalls()).to.equal(10n);

    for (const positionId of positionIds) {
      await f.engine.setClaimable(positionId, 1n, 0);
    }

    await f.engine.resetClaimRewardsCalls();
    await f.pool.connect(f.keeper).batchHarvest(0, await f.pool.underlyingTokenCount());
    expect(await f.engine.claimRewardsCalls()).to.equal(10n);
  });

  it("does not let a depositor capture rewards earned by position nine", async () => {
    const f = await deployFixture();
    const positionAmount = 100n * ONE;
    const entrantAmount = 900n * ONE;
    const naraReward = 90n * ONE;
    const usdcReward = 900n * USDC;
    const ethReward = 9n * 10n ** 15n;

    for (let i = 0; i < 9; i++) {
      await openPoolPosition(f, positionAmount);
    }

    const tokenId = await f.pool.underlyingTokenIds(8);
    const positionId = await f.nft.positionIdOf(tokenId);
    await f.nara.mint(await f.engine.getAddress(), naraReward);
    await f.usdc.mint(await f.engine.getAddress(), usdcReward);
    await f.admin.sendTransaction({ to: await f.engine.getAddress(), value: ethReward });
    await f.engine.setClaimable(positionId, naraReward, ethReward);
    await f.engine.setTokenClaimable(positionId, await f.usdc.getAddress(), usdcReward);

    const incumbent = await f.user.getAddress();
    const entrant = await f.other.getAddress();
    const incumbentShares = await f.pool.balanceOf(incumbent);
    const supplyBefore = await f.pool.totalSupply();

    await f.nara.connect(f.other).approve(await f.pool.getAddress(), entrantAmount);
    await f.pool.connect(f.other).deposit(entrantAmount, 0);

    const expectedIncumbentUsdc =
      (incumbentShares * ((usdcReward * (10n ** 27n)) / supplyBefore)) / (10n ** 27n);
    const expectedIncumbentEth =
      (incumbentShares * ((ethReward * (10n ** 27n)) / supplyBefore)) / (10n ** 27n);

    expect(await f.pool.claimableUsdc(entrant)).to.equal(0n);
    expect(await f.pool.claimableEth(entrant)).to.equal(0n);
    expect(await f.pool.claimableUsdc(incumbent)).to.equal(expectedIncumbentUsdc);
    expect(await f.pool.claimableEth(incumbent)).to.equal(expectedIncumbentEth);
    expect(await f.pool.liquidNara()).to.equal(entrantAmount + naraReward);
    expect(await f.pool.balanceOf(entrant)).to.be.lt(entrantAmount);
  });

  it("harvests stale NARA rewards before pricing redemptions", async () => {
    const f = await deployFixture();
    const { positionId } = await openPoolPosition(f);
    const reward = 100n * ONE;
    const userAddr = await f.user.getAddress();

    await f.nara.mint(await f.engine.getAddress(), reward);
    await f.engine.setClaimable(positionId, reward, 0);

    const shares = await f.pool.balanceOf(userAddr);
    await f.pool.connect(f.user).queueRedeem(shares);
    const redemption = await f.pool.redemptions(0);

    expect(await f.pool.liquidNara()).to.equal(reward);
    expect(redemption.naraOwed).to.be.gt(shares);
  });

  it("lets redeemers cap acceptable readyEpoch when liquid NARA was just locked", async () => {
    const f = await deployFixture();
    const amount = 1_000n * ONE;
    const userAddr = await f.user.getAddress();
    await f.nara.connect(f.user).approve(await f.pool.getAddress(), amount);
    await f.pool.connect(f.user).deposit(amount, 0);
    await f.pool.connect(f.keeper).lockLiquid(amount, 0);

    const shares = await f.pool.balanceOf(userAddr);
    const current = await f.engine.currentEpoch();
    await expect(f.pool.connect(f.user).queueRedeemWithMaxReadyEpoch(shares, current))
      .to.be.revertedWithCustomError(f.pool, "RedemptionNotReady");
  });

  it("assigns later readyEpoch when earlier maturities are already reserved", async () => {
    const f = await deployFixture();
    const amount = 1_000n * ONE;
    await f.nara.connect(f.user).approve(await f.pool.getAddress(), amount);
    await f.pool.connect(f.user).deposit(amount, 0);
    await f.nara.connect(f.other).approve(await f.pool.getAddress(), amount);
    await f.pool.connect(f.other).deposit(amount, 0);

    await f.pool.connect(f.keeper).lockLiquid(amount, 0);
    const firstTokenId = await f.pool.underlyingTokenIds(0);
    const firstPosition = await f.engine.positionOf(await f.nft.positionIdOf(firstTokenId));

    await f.engine.setCurrentEpoch(100);
    await f.pool.connect(f.keeper).lockLiquid(amount, 0);
    const secondTokenId = await f.pool.underlyingTokenIds(1);
    const secondPosition = await f.engine.positionOf(await f.nft.positionIdOf(secondTokenId));

    await f.pool.connect(f.user).queueRedeem(await f.pool.balanceOf(await f.user.getAddress()));
    await f.pool.connect(f.other).queueRedeem(await f.pool.balanceOf(await f.other.getAddress()));
    const firstRedemption = await f.pool.redemptions(0);
    const secondRedemption = await f.pool.redemptions(1);

    expect(firstRedemption.readyEpoch).to.equal(firstPosition.unlockEpoch);
    expect(secondRedemption.readyEpoch).to.equal(secondPosition.unlockEpoch);
    expect(secondRedemption.readyEpoch).to.be.gt(firstRedemption.readyEpoch);
  });

  it("accounts harvested ETH to holders instead of leaving it trapped", async () => {
    const f = await deployFixture();
    const { positionId } = await openPoolPosition(f);
    const ethReward = 2n * 10n ** 15n;

    await f.admin.sendTransaction({ to: await f.engine.getAddress(), value: ethReward });
    await f.engine.setClaimable(positionId, 0, ethReward);
    await f.pool.connect(f.keeper).harvest();

    const userAddr = await f.user.getAddress();
    const claimable = await f.pool.claimableEth(userAddr);
    expect(claimable).to.be.gt(0n);

    await f.pool.connect(f.user).claimEth(userAddr);
    await expect(f.pool.connect(f.user).claimEth(await f.pool.getAddress()))
      .to.be.revertedWithCustomError(f.pool, "ZeroAddress");
  });

  it("unlocks through unlockTo and subtracts principal, not reward-inflated balance deltas", async () => {
    const f = await deployFixture();
    const { tokenId, positionId, amount } = await openPoolPosition(f);
    const reward = 50n * ONE;

    await f.nara.mint(await f.engine.getAddress(), reward);
    await f.engine.setClaimable(positionId, reward, 0);

    const position = await f.engine.positionOf(positionId);
    await f.engine.setCurrentEpoch(position.unlockEpoch);

    await f.pool.connect(f.keeper).unlockMatured(tokenId);
    expect(await f.pool.underlyingTokenCount()).to.equal(0n);
    expect(await f.pool.lockedPrincipal()).to.equal(0n);
    expect(await f.pool.liquidNara()).to.equal(amount + reward);
  });

  it("rejects direct position NFT safe transfers into the pool", async () => {
    const f = await deployFixture();
    const amount = 1_000n * ONE;
    const userAddr = await f.user.getAddress();
    await f.nara.connect(f.user).approve(await f.nft.getAddress(), amount);
    const tx = await f.nft.connect(f.user).mintAndLock(amount, 35_040n, 0);
    await tx.wait();

    await expect(
      f.nft.connect(f.user)["safeTransferFrom(address,address,uint256)"](
        userAddr,
        await f.pool.getAddress(),
        1n,
      ),
    ).to.be.revertedWithCustomError(f.pool, "InvalidNftReceived");
  });

  it("emergency withdrawals are disabled even during shutdown", async () => {
    const f = await deployFixture();
    const naraAmount = 123n * ONE;
    const usdcAmount = 456n * USDC;
    const ethAmount = 7n * 10n ** 15n;
    const poolAddr = await f.pool.getAddress();
    const recipient = await f.treasury.getAddress();
    const emergencyRole = await f.pool.EMERGENCY_ROLE();

    await f.nara.mint(poolAddr, naraAmount);
    await f.usdc.mint(poolAddr, usdcAmount);
    await f.admin.sendTransaction({ to: poolAddr, value: ethAmount });

    await expect(f.pool.emergencyWithdrawNara(recipient, naraAmount))
      .to.be.revertedWithCustomError(f.pool, "NotEmergency");
    await expect(f.pool.emergencyWithdrawUsdc(recipient, usdcAmount))
      .to.be.revertedWithCustomError(f.pool, "NotEmergency");
    await expect(f.pool.emergencyWithdrawEth(recipient, ethAmount))
      .to.be.revertedWithCustomError(f.pool, "NotEmergency");

    await f.pool.connect(f.admin).setEmergencyShutdown(true);

    await expect(f.pool.connect(f.user).emergencyWithdrawNara(recipient, naraAmount))
      .to.be.revertedWithCustomError(f.pool, "AccessControlUnauthorizedAccount")
      .withArgs(await f.user.getAddress(), emergencyRole);
    await expect(f.pool.emergencyWithdrawNara(f.ethers.ZeroAddress, naraAmount))
      .to.be.revertedWithCustomError(f.pool, "EmergencyWithdrawDisabled");
    await expect(f.pool.emergencyWithdrawUsdc(f.ethers.ZeroAddress, usdcAmount))
      .to.be.revertedWithCustomError(f.pool, "EmergencyWithdrawDisabled");
    await expect(f.pool.emergencyWithdrawEth(f.ethers.ZeroAddress, ethAmount))
      .to.be.revertedWithCustomError(f.pool, "EmergencyWithdrawDisabled");

    await expect(f.pool.emergencyWithdrawNara(recipient, naraAmount))
      .to.be.revertedWithCustomError(f.pool, "EmergencyWithdrawDisabled");
    await expect(f.pool.emergencyWithdrawUsdc(recipient, usdcAmount))
      .to.be.revertedWithCustomError(f.pool, "EmergencyWithdrawDisabled");
    await expect(f.pool.emergencyWithdrawEth(recipient, ethAmount))
      .to.be.revertedWithCustomError(f.pool, "EmergencyWithdrawDisabled");

    expect(await f.nara.balanceOf(poolAddr)).to.equal(naraAmount);
    expect(await f.usdc.balanceOf(poolAddr)).to.equal(usdcAmount);
    expect(await f.ethers.provider.getBalance(poolAddr)).to.equal(ethAmount);
  });

  it("M-08: holders can still exit (queue + claim) during emergencyShutdown", async () => {
    const f = await deployFixture();
    const userAddr = await f.user.getAddress();
    const { tokenId, positionId, amount } = await openPoolPosition(f); // deposit + lockLiquid

    await f.pool.connect(f.admin).setEmergencyShutdown(true);

    // Inflows are frozen...
    await f.nara.connect(f.user).approve(await f.pool.getAddress(), ONE);
    await expect(f.pool.connect(f.user).deposit(ONE, 0))
      .to.be.revertedWithCustomError(f.pool, "EmergencyActive");

    // ...but holders are NOT trapped: queueRedeem works during shutdown (previously reverted
    // EmergencyActive via the auto-harvest path).
    const shares = await f.pool.balanceOf(userAddr);
    await f.pool.connect(f.user).queueRedeem(shares);

    // Mature the underlying position, convert to liquid, and claim the redemption.
    const position = await f.engine.positionOf(positionId);
    await f.engine.setCurrentEpoch(position.unlockEpoch);
    await f.pool.connect(f.keeper).unlockMatured(tokenId);

    const before = await f.nara.balanceOf(userAddr);
    await f.pool.connect(f.user).claimRedemption(0);
    const recovered = (await f.nara.balanceOf(userAddr)) - before;
    expect(recovered).to.be.gt(0n);
    expect(recovered).to.equal(amount - (await f.pool.DEAD_SHARES()));
  });

  it("SY claims pool USDC through Pendle rewards and native ETH through a separate path", async () => {
    const f = await deployFixture();
    const SY = await f.ethers.getContractFactory("NARAStakingPoolSYV4", f.admin);
    const sy: any = await SY.deploy(
      await f.nara.getAddress(),
      await f.usdc.getAddress(),
      await f.pool.getAddress(),
      await f.pool.getAddress(),
    );
    await sy.waitForDeployment();

    const amount = 1_000n * ONE;
    const userAddr = await f.user.getAddress();
    await f.nara.connect(f.user).approve(await sy.getAddress(), amount);
    await sy.connect(f.user).deposit(userAddr, await f.nara.getAddress(), amount, 0);
    await f.pool.connect(f.keeper).lockLiquid(amount, 0);

    const tokenId = await f.pool.underlyingTokenIds(0);
    const positionId = await f.nft.positionIdOf(tokenId);
    const reward = 1_000n * USDC;
    const ethReward = 2n * 10n ** 15n;
    await f.usdc.mint(await f.engine.getAddress(), reward);
    await f.admin.sendTransaction({ to: await f.engine.getAddress(), value: ethReward });
    await f.engine.setTokenClaimable(positionId, await f.usdc.getAddress(), reward);
    await f.engine.setClaimable(positionId, 0, ethReward);
    await f.pool.connect(f.keeper).harvest();

    let indexes = await sy.rewardIndexesStored();
    expect(indexes.length).to.equal(1);
    expect(indexes[0]).to.equal(1n);
    await sy.connect(f.keeper).rewardIndexesCurrent();
    indexes = await sy.rewardIndexesStored();
    expect(indexes.length).to.equal(1);
    expect(indexes[0]).to.be.gt(1n);

    const accrued = await sy.accruedRewards(userAddr);
    expect(accrued[0]).to.be.gt(0n);

    const syBalance = await sy.balanceOf(userAddr);
    await sy.connect(f.user).redeem(userAddr, syBalance, await f.pool.getAddress(), syBalance, false);
    expect(await sy.balanceOf(userAddr)).to.equal(0n);

    const before = await f.usdc.balanceOf(userAddr);
    await sy.connect(f.user).claimRewards(userAddr);
    const after = await f.usdc.balanceOf(userAddr);
    expect(after - before).to.be.gt(0n);

    const ethClaimable = await sy.claimableEth(userAddr);
    expect(ethClaimable).to.be.gt(0n);
    const otherAddr = await f.other.getAddress();
    const ethBefore = await f.ethers.provider.getBalance(otherAddr);
    await sy.connect(f.user).claimNativeEth(otherAddr);
    const ethAfter = await f.ethers.provider.getBalance(otherAddr);
    expect(ethAfter - ethBefore).to.equal(ethClaimable);
    await expect(sy.connect(f.user).claimNativeEth(await sy.getAddress()))
      .to.be.revertedWithCustomError(sy, "ZeroAddress");
  });

  it("checkpoints pool rewards before SY ownership moves", async () => {
    const f = await deployFixture();
    const SY = await f.ethers.getContractFactory("NARAStakingPoolSYV4", f.admin);
    const sy: any = await SY.deploy(
      await f.nara.getAddress(),
      await f.usdc.getAddress(),
      await f.pool.getAddress(),
      await f.pool.getAddress(),
    );
    await sy.waitForDeployment();

    const amount = 1_000n * ONE;
    const userAddr = await f.user.getAddress();
    const otherAddr = await f.other.getAddress();
    await f.nara.connect(f.user).approve(await sy.getAddress(), amount);
    await sy.connect(f.user).deposit(userAddr, await f.nara.getAddress(), amount, 0);
    await f.pool.connect(f.keeper).lockLiquid(amount, 0);

    const tokenId = await f.pool.underlyingTokenIds(0);
    const positionId = await f.nft.positionIdOf(tokenId);
    const reward = 1_000n * USDC;
    await f.usdc.mint(await f.engine.getAddress(), reward);
    await f.engine.setTokenClaimable(positionId, await f.usdc.getAddress(), reward);
    await f.pool.connect(f.keeper).harvest();

    const userShares = await sy.balanceOf(userAddr);
    await sy.connect(f.user).transfer(otherAddr, userShares * 9n / 10n);

    expect(await sy.claimableUsdc(otherAddr)).to.equal(0n);
    expect(await sy.claimableUsdc(userAddr)).to.be.gt(0n);
  });

  it("assigns direct stNARA deposit rewards to the pre-mint SY supply", async () => {
    const f = await deployFixture();
    const { positionId } = await openPoolPosition(f);
    const SY = await f.ethers.getContractFactory("NARAStakingPoolSYV4", f.admin);
    const sy: any = await SY.deploy(
      await f.nara.getAddress(),
      await f.usdc.getAddress(),
      await f.pool.getAddress(),
      await f.pool.getAddress(),
    );
    await sy.waitForDeployment();

    const userAddr = await f.user.getAddress();
    const otherAddr = await f.other.getAddress();
    const incumbentAmount = 400n * ONE;
    const entrantAmount = 200n * ONE;

    await f.pool.connect(f.user).transfer(otherAddr, entrantAmount);
    await f.pool.connect(f.user).approve(await sy.getAddress(), incumbentAmount);
    await sy.connect(f.user).deposit(
      userAddr,
      await f.pool.getAddress(),
      incumbentAmount,
      incumbentAmount,
    );

    const usdcReward = 1_000n * USDC;
    const ethReward = 2n * 10n ** 15n;
    await f.usdc.mint(await f.engine.getAddress(), usdcReward);
    await f.admin.sendTransaction({ to: await f.engine.getAddress(), value: ethReward });
    await f.engine.setTokenClaimable(positionId, await f.usdc.getAddress(), usdcReward);
    await f.engine.setClaimable(positionId, 0, ethReward);

    await f.pool.connect(f.other).approve(await sy.getAddress(), entrantAmount);
    await sy.connect(f.other).deposit(
      otherAddr,
      await f.pool.getAddress(),
      entrantAmount,
      entrantAmount,
    );

    expect(await sy.claimableUsdc(userAddr)).to.be.gt(0n);
    expect(await sy.claimableEth(userAddr)).to.be.gt(0n);
    expect(await sy.claimableUsdc(otherAddr)).to.equal(0n);
    expect(await sy.claimableEth(otherAddr)).to.equal(0n);
  });

  it("preserves a redeemer's share of rewards crystallized by the outbound stNARA transfer", async () => {
    const f = await deployFixture();
    const { positionId } = await openPoolPosition(f);
    const SY = await f.ethers.getContractFactory("NARAStakingPoolSYV4", f.admin);
    const sy: any = await SY.deploy(
      await f.nara.getAddress(),
      await f.usdc.getAddress(),
      await f.pool.getAddress(),
      await f.pool.getAddress(),
    );
    await sy.waitForDeployment();

    const userAddr = await f.user.getAddress();
    const otherAddr = await f.other.getAddress();
    const userAmount = 400n * ONE;
    const otherAmount = 200n * ONE;

    await f.pool.connect(f.user).approve(await sy.getAddress(), userAmount + otherAmount);
    await sy.connect(f.user).deposit(
      userAddr,
      await f.pool.getAddress(),
      userAmount,
      userAmount,
    );
    await sy.connect(f.user).deposit(
      otherAddr,
      await f.pool.getAddress(),
      otherAmount,
      otherAmount,
    );

    const usdcReward = 1_000n * USDC;
    const ethReward = 2n * 10n ** 15n;
    await f.usdc.mint(await f.engine.getAddress(), usdcReward);
    await f.admin.sendTransaction({ to: await f.engine.getAddress(), value: ethReward });
    await f.engine.setTokenClaimable(positionId, await f.usdc.getAddress(), usdcReward);
    await f.engine.setClaimable(positionId, 0, ethReward);

    await sy.connect(f.user).redeem(
      userAddr,
      userAmount,
      await f.pool.getAddress(),
      userAmount,
      false,
    );

    const userUsdc = await sy.claimableUsdc(userAddr);
    const otherUsdc = await sy.claimableUsdc(otherAddr);
    const userEth = await sy.claimableEth(userAddr);
    const otherEth = await sy.claimableEth(otherAddr);

    expect(userUsdc).to.be.gt(otherUsdc);
    expect(otherUsdc).to.be.gt(0n);
    expect(userEth).to.be.gt(otherEth);
    expect(otherEth).to.be.gt(0n);
  });

  it("SY disables public internal-balance redeem", async () => {
    const f = await deployFixture();
    const SY = await f.ethers.getContractFactory("NARAStakingPoolSYV4", f.admin);
    const sy: any = await SY.deploy(
      await f.nara.getAddress(),
      await f.usdc.getAddress(),
      await f.pool.getAddress(),
      await f.pool.getAddress(),
    );
    await sy.waitForDeployment();

    const amount = 1_000n * ONE;
    const userAddr = await f.user.getAddress();
    const syAddr = await sy.getAddress();
    await f.nara.connect(f.user).approve(syAddr, amount);
    await sy.connect(f.user).deposit(userAddr, await f.nara.getAddress(), amount, 0);

    const syBalance = await sy.balanceOf(userAddr);
    await sy.connect(f.user).transfer(syAddr, syBalance);
    await expect(
      sy.connect(f.other).redeem(userAddr, syBalance, await f.pool.getAddress(), syBalance, true),
    ).to.be.revertedWithCustomError(sy, "InternalBalanceRedeemDisabled");

    expect(await sy.balanceOf(syAddr)).to.equal(syBalance);
  });
});
