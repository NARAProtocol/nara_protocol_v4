import { expect } from "chai";
import hre from "hardhat";

const WAD = 10n ** 18n;
const USDC = 10n ** 6n;
const HOUR = 3_600n;
const DAY = 24n * HOUR;
const EPOCH = 60n;
const MIN_LOCK = 600n;
const MAX_LOCK = 3_600n;
const TOKEN_SUPPLY = 1_000_000n * WAD;
const BASE_SUPPLY = 1_000_000n * USDC;
const RESERVE_ALLOCATION = 100_000n * WAD;
const BOND_CAPACITY = 60n * WAD;

async function latestTimestamp(ethers: any): Promise<bigint> {
  return BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
}

async function setTime(ethers: any, timestamp: bigint): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await ethers.provider.send("evm_mine", []);
}

async function deployRealEngineBond(maxAdvancePerCall: number) {
  const connection: any = await hre.network.connect();
  const { ethers } = connection;
  const [admin, recovery, treasury, alice, outsider] =
    await ethers.getSigners();
  const epochOrigin = (await latestTimestamp(ethers)) + EPOCH;

  const token: any = await ethers.deployContract("NARATokenV5", [
    "NARA V5 bond integration",
    "NARA5BI",
    18,
    TOKEN_SUPPLY,
    await treasury.getAddress(),
  ]);
  const payment: any = await ethers.deployContract("NARATokenV5", [
    "Bond integration USDC",
    "biUSDC",
    6,
    BASE_SUPPLY,
    await treasury.getAddress(),
  ]);
  await Promise.all([token.waitForDeployment(), payment.waitForDeployment()]);

  const reserve: any = await ethers.deployContract("NARARewardReserveV5", [
    await admin.getAddress(),
    await recovery.getAddress(),
    await token.getAddress(),
    RESERVE_ALLOCATION,
  ]);
  await reserve.waitForDeployment();
  const engine: any = await ethers.deployContract("NARAEngineV5", [
    await admin.getAddress(),
    await token.getAddress(),
    await payment.getAddress(),
    await reserve.getAddress(),
    await recovery.getAddress(),
    {
      epochOrigin,
      epochLength: EPOCH,
      minLockDuration: MIN_LOCK,
      maxLockDuration: MAX_LOCK,
      maxAdvancePerCall,
      minWeightMultiplierWad: WAD,
      maxWeightMultiplierWad: 2n * WAD,
      emissionPerEpoch: WAD,
      emissionBootstrapWeight: 10_000n * WAD,
      minimumRewardWeight: 100n * WAD,
    },
  ]);
  await engine.waitForDeployment();

  const renderer: any = await ethers.deployContract(
    "NARACanonicalPositionRendererV5",
    [
      "NARA V5 bond position",
      "Real Engine bond integration",
      "data:image/svg+xml;base64,",
    ]
  );
  await renderer.waitForDeployment();
  const positions: any = await ethers.deployContract("NARAPositionNFTV5", [
    await engine.getAddress(),
    await renderer.getAddress(),
    "NARA V5 Bond Positions",
    "NARA5BP",
  ]);
  await positions.waitForDeployment();
  const liquidityVault: any = await ethers.deployContract(
    "NARALiquidityFeeVaultBindingHarnessV5",
    [
      await token.getAddress(),
      await payment.getAddress(),
      await engine.getAddress(),
    ]
  );
  await liquidityVault.waitForDeployment();

  await engine
    .connect(admin)
    .bindPositionController(await positions.getAddress());
  await engine
    .connect(admin)
    .bindLiquidityFeeVault(await liquidityVault.getAddress());
  await reserve.connect(admin).bindEngine(await engine.getAddress());
  await token
    .connect(treasury)
    .approve(await reserve.getAddress(), RESERVE_ALLOCATION);
  await reserve.connect(treasury).fund(RESERVE_ALLOCATION);
  await reserve.connect(admin).seal();
  await engine.connect(admin).sealConfiguration();

  const bond: any = await ethers.deployContract("NARANFTBondDepositoryV5", [
    await token.getAddress(),
    await payment.getAddress(),
    await positions.getAddress(),
    await admin.getAddress(),
    await treasury.getAddress(),
    HOUR,
    BOND_CAPACITY,
    10n * USDC,
    30n * USDC,
    20n * WAD,
    1n,
    2n * 10n ** 12n,
    MIN_LOCK,
    MAX_LOCK,
    DAY,
    await recovery.getAddress(),
    HOUR,
  ]);
  await bond.waitForDeployment();
  const inventory: any = await ethers.deployContract(
    "NARABondInventoryVaultV5",
    [
      await token.getAddress(),
      await treasury.getAddress(),
      await bond.getAddress(),
      BOND_CAPACITY,
      await recovery.getAddress(),
      HOUR,
    ]
  );
  await inventory.waitForDeployment();
  await bond.connect(admin).bindInventoryVault(await inventory.getAddress());

  const startsAt = (await latestTimestamp(ethers)) + HOUR + 1n;
  await bond.connect(admin).queueTerms({
    capacity: BOND_CAPACITY,
    minPayment: 10n * USDC,
    maxPayment: 30n * USDC,
    payoutNumerator: 2n * 10n ** 12n,
    payoutDenominator: 1n,
    lockDurationSeconds: MIN_LOCK,
    startsAt,
    endsAt: startsAt + HOUR,
  });
  await token
    .connect(treasury)
    .approve(await inventory.getAddress(), BOND_CAPACITY);
  await inventory.connect(treasury).fund();
  await payment
    .connect(treasury)
    .transfer(await alice.getAddress(), 100n * USDC);
  await setTime(ethers, startsAt);
  await bond.connect(outsider).activateTerms();

  return {
    ethers,
    admin,
    recovery,
    treasury,
    alice,
    outsider,
    token,
    payment,
    reserve,
    engine,
    positions,
    bond,
    inventory,
  };
}

async function protectedQuote(
  f: Awaited<ReturnType<typeof deployRealEngineBond>>,
  payment: bigint
) {
  const quote = await f.bond.previewBuy(payment);
  return {
    quote,
    protection: {
      minimumPayout: quote.payout,
      deadline: (await latestTimestamp(f.ethers)) + HOUR,
      maximumUnlockAt: quote.unlockAt + EPOCH,
      expectedTermsHash: quote.currentTermsHash,
    },
  };
}

describe("V5 NFT bond with the real Engine", function () {
  it("completes protected purchase, exact Engine/NFT accounting, unlock, and NFT close", async function () {
    const f = await deployRealEngineBond(128);
    const paymentAmount = 10n * USDC;
    await f.payment
      .connect(f.alice)
      .approve(await f.bond.getAddress(), paymentAmount);
    const { quote, protection } = await protectedQuote(f, paymentAmount);
    const treasuryPaymentBefore = await f.payment.balanceOf(
      await f.treasury.getAddress()
    );

    await f.bond
      .connect(f.alice)
      .buy(paymentAmount, await f.alice.getAddress(), protection);

    expect(await f.payment.balanceOf(await f.treasury.getAddress())).to.equal(
      treasuryPaymentBefore + paymentAmount
    );
    expect(await f.inventory.distributed()).to.equal(quote.payout);
    expect(await f.bond.totalPayout()).to.equal(quote.payout);
    expect(await f.positions.ownerOf(1n)).to.equal(await f.alice.getAddress());

    const [account, state] = await f.positions.positionData(1n);
    expect(state.owner).to.equal(account);
    expect(state.principal).to.equal(quote.payout);
    expect(state.unlockAt).to.be.at.most(protection.maximumUnlockAt);
    expect(state.active).to.equal(true);

    await setTime(f.ethers, state.unlockAt);
    const principalBefore = await f.token.balanceOf(await f.alice.getAddress());
    await f.positions
      .connect(f.alice)
      .unlockPosition(1n, await f.alice.getAddress());
    expect(await f.token.balanceOf(await f.alice.getAddress())).to.equal(
      principalBefore + quote.payout
    );
    await f.positions.connect(f.alice).closePosition(1n);
    expect(await f.positions.totalSupply()).to.equal(0n);
  });

  it("rolls back every bond state change when Engine maintenance is too far behind", async function () {
    const f = await deployRealEngineBond(8);
    const paymentAmount = 10n * USDC;
    await f.payment
      .connect(f.alice)
      .approve(await f.bond.getAddress(), paymentAmount);
    const { quote, protection } = await protectedQuote(f, paymentAmount);
    const treasuryBefore = await f.payment.balanceOf(
      await f.treasury.getAddress()
    );
    const inventoryBefore = await f.token.balanceOf(
      await f.inventory.getAddress()
    );
    expect(
      (await f.engine.targetEpoch()) - (await f.engine.currentEpoch()) > 8n
    ).to.equal(true);

    await expect(
      f.bond
        .connect(f.alice)
        .buy(paymentAmount, await f.alice.getAddress(), protection)
    ).to.be.revertedWithCustomError(f.engine, "EpochBacklog");
    expect(await f.payment.balanceOf(await f.treasury.getAddress())).to.equal(
      treasuryBefore
    );
    expect(await f.token.balanceOf(await f.inventory.getAddress())).to.equal(
      inventoryBefore
    );
    expect(await f.inventory.distributed()).to.equal(0n);
    expect(await f.bond.totalPayout()).to.equal(0n);
    expect(await f.positions.totalSupply()).to.equal(0n);

    for (let i = 0; i < 20; i += 1) {
      if ((await f.engine.currentEpoch()) >= (await f.engine.targetEpoch()))
        break;
      await f.engine.connect(f.outsider).advanceEpochs(512);
    }
    expect(
      (await f.engine.currentEpoch()) >= (await f.engine.targetEpoch())
    ).to.equal(true);

    await f.bond
      .connect(f.alice)
      .buy(paymentAmount, await f.alice.getAddress(), protection);
    expect(await f.inventory.distributed()).to.equal(quote.payout);
    expect(await f.bond.totalPayout()).to.equal(quote.payout);
    expect(await f.positions.ownerOf(1n)).to.equal(await f.alice.getAddress());
  });
});
