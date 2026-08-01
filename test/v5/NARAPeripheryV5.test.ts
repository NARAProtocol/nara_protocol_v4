import hre from "hardhat";
import { expect } from "chai";

const WAD = 10n ** 18n;
const USDC = 10n ** 6n;

function wad(value: number | bigint): bigint {
  return BigInt(value) * WAD;
}

async function now(ethers: any): Promise<number> {
  return Number((await ethers.provider.getBlock("latest"))!.timestamp);
}

async function setTime(ethers: any, timestamp: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function signPermit(
  ethers: any,
  token: any,
  owner: any,
  spender: string,
  value: bigint,
  deadline: bigint
) {
  const ownerAddress = await owner.getAddress();
  const nonce = await token.nonces(ownerAddress);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const signature = await owner.signTypedData(
    {
      name: await token.name(),
      version: "1",
      chainId,
      verifyingContract: await token.getAddress(),
    },
    {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    { owner: ownerAddress, spender, value, nonce, deadline }
  );
  return ethers.Signature.from(signature);
}

async function deployFixture() {
  const { ethers } = await hre.network.connect();
  const [deployer, alice, bob, treasury, beneficiary] =
    await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const Token = await ethers.getContractFactory("MockERC20PermitV5", deployer);
  const nara: any = await Token.deploy(
    "NARA V5 Test",
    "NARA5",
    18,
    deployerAddress,
    wad(1_000_000)
  );
  const reward: any = await Token.deploy(
    "USD Test",
    "USDC-T",
    6,
    deployerAddress,
    1_000_000n * USDC
  );
  await Promise.all([nara.waitForDeployment(), reward.waitForDeployment()]);

  const Engine = await ethers.getContractFactory(
    "MockPositionEngineV5",
    deployer
  );
  const engine: any = await Engine.deploy(await nara.getAddress());
  await engine.waitForDeployment();
  const Renderer = await ethers.getContractFactory(
    "NARACanonicalPositionRendererV5",
    deployer
  );
  const renderer: any = await Renderer.deploy(
    "NARA Position V5",
    "Test",
    "ipfs://test"
  );
  await renderer.waitForDeployment();
  const NFT = await ethers.getContractFactory("NARAPositionNFTV5", deployer);
  const nft: any = await NFT.deploy(
    await engine.getAddress(),
    await renderer.getAddress(),
    "NARA Position V5",
    "NARAP5"
  );
  await nft.waitForDeployment();

  const UserRouter = await ethers.getContractFactory(
    "NARAUserRouterV5",
    deployer
  );
  const userRouter: any = await UserRouter.deploy(
    await nara.getAddress(),
    await nft.getAddress()
  );
  await userRouter.waitForDeployment();
  const OpsRouter = await ethers.getContractFactory(
    "NARAEngineOperationsRouterV5",
    deployer
  );
  const opsRouter: any = await OpsRouter.deploy(await engine.getAddress(), 3);
  await opsRouter.waitForDeployment();
  const PositionLens = await ethers.getContractFactory(
    "NARAPositionDataLensV5",
    deployer
  );
  const positionLens: any = await PositionLens.deploy(await nft.getAddress());
  await positionLens.waitForDeployment();
  const Dashboard = await ethers.getContractFactory(
    "NARADashboardLensV5",
    deployer
  );
  const dashboard: any = await Dashboard.deploy(
    await nara.getAddress(),
    await nft.getAddress(),
    await positionLens.getAddress()
  );
  await dashboard.waitForDeployment();

  const timestamp = await now(ethers);
  const Ops = await ethers.getContractFactory(
    "NARAOpsVestingVaultV5",
    deployer
  );
  const ops: any = await Ops.deploy(
    await nara.getAddress(),
    deployerAddress,
    await beneficiary.getAddress(),
    wad(1_000),
    timestamp + 100,
    timestamp + 200,
    timestamp + 1_000
  );
  await ops.waitForDeployment();

  const Bond = await ethers.getContractFactory(
    "NARANFTBondDepositoryV5",
    deployer
  );
  const bond: any = await Bond.deploy(
    await nara.getAddress(),
    await reward.getAddress(),
    await nft.getAddress(),
    deployerAddress,
    await treasury.getAddress(),
    3600,
    wad(1_000),
    10n * USDC,
    1_000n * USDC,
    wad(20),
    1n,
    2n * 10n ** 12n,
    24 * 60 * 60,
    365 * 24 * 60 * 60,
    30 * 24 * 60 * 60,
    await treasury.getAddress(),
    3600
  );
  await bond.waitForDeployment();
  const Inventory = await ethers.getContractFactory(
    "NARABondInventoryVaultV5",
    deployer
  );
  const inventory: any = await Inventory.deploy(
    await nara.getAddress(),
    await treasury.getAddress(),
    await bond.getAddress(),
    wad(1_000),
    await treasury.getAddress(),
    3600
  );
  await inventory.waitForDeployment();
  await bond.bindInventoryVault(await inventory.getAddress());
  await nara.transfer(await treasury.getAddress(), wad(1_000));

  const Genesis = await ethers.getContractFactory(
    "NARAGenesisDistributorV5",
    deployer
  );
  const genesis: any = await Genesis.deploy(
    await nara.getAddress(),
    deployerAddress,
    await treasury.getAddress(),
    wad(500),
    ethers.id("PERIPHERY-GENESIS"),
    ethers.id("NONZERO-TEST-ROOT"),
    timestamp + 10_000
  );
  await genesis.waitForDeployment();

  const Stats = await ethers.getContractFactory(
    "NARAProtocolStatsLensV5",
    deployer
  );
  const stats: any = await Stats.deploy(
    await nara.getAddress(),
    await engine.getAddress(),
    await nft.getAddress(),
    await genesis.getAddress(),
    await inventory.getAddress(),
    await bond.getAddress(),
    await ops.getAddress()
  );
  await stats.waitForDeployment();

  const Circulating = await ethers.getContractFactory(
    "NARACirculatingSupplyV5",
    deployer
  );
  const circulating: any = await Circulating.deploy(await nara.getAddress(), [
    await ops.getAddress(),
    await inventory.getAddress(),
  ]);
  await circulating.waitForDeployment();

  await nara.transfer(await alice.getAddress(), wad(20_000));
  await nara.transfer(await bob.getAddress(), wad(20_000));

  return {
    ethers,
    deployer,
    alice,
    bob,
    treasury,
    beneficiary,
    nara,
    reward,
    engine,
    nft,
    userRouter,
    opsRouter,
    positionLens,
    dashboard,
    ops,
    bond,
    inventory,
    genesis,
    stats,
    circulating,
  };
}

describe("V5 routers and lenses", function () {
  it("opens through EIP-2612 without leaving router custody or controller allowance", async function () {
    const f = await deployFixture();
    const amount = wad(1_000);
    const deadline = BigInt((await now(f.ethers)) + 3600);
    const routerAddress = await f.userRouter.getAddress();
    const sig = await signPermit(
      f.ethers,
      f.nara,
      f.alice,
      routerAddress,
      amount,
      deadline
    );

    await f.userRouter
      .connect(f.alice)
      .openPositionWithPermit(
        amount,
        7 * 24 * 60 * 60,
        await f.alice.getAddress(),
        deadline,
        sig.v,
        sig.r,
        sig.s
      );

    expect(await f.nft.ownerOf(1)).to.equal(await f.alice.getAddress());
    expect(await f.nara.balanceOf(routerAddress)).to.equal(0n);
    expect(
      await f.nara.allowance(routerAddress, await f.nft.getAddress())
    ).to.equal(0n);
    expect(
      await f.nara.allowance(await f.alice.getAddress(), routerAddress)
    ).to.equal(0n);
    expect((await f.engine.positionState(1)).principal).to.equal(amount);
  });

  it("opens additional permitted principal as a fresh independently controlled position", async function () {
    const f = await deployFixture();
    const initial = wad(500);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), initial);
    await f.nft
      .connect(f.alice)
      .mintPosition(await f.alice.getAddress(), initial, 7 * 24 * 60 * 60);

    expect(
      f.userRouter.interface.fragments.some(
        (fragment: any) =>
          fragment.type === "function" &&
          fragment.name === "increasePositionWithPermit"
      )
    ).to.equal(false);

    const additionalPrincipal = wad(50);
    const deadline = BigInt((await now(f.ethers)) + 3600);
    const sig = await signPermit(
      f.ethers,
      f.nara,
      f.alice,
      await f.userRouter.getAddress(),
      additionalPrincipal,
      deadline
    );
    await f.userRouter
      .connect(f.alice)
      .openPositionWithPermit(
        additionalPrincipal,
        7 * 24 * 60 * 60,
        await f.alice.getAddress(),
        deadline,
        sig.v,
        sig.r,
        sig.s
      );

    expect((await f.engine.positionState(1)).principal).to.equal(initial);
    expect((await f.engine.positionState(2)).principal).to.equal(
      additionalPrincipal
    );
    expect(await f.nft.ownerOf(1)).to.equal(await f.alice.getAddress());
    expect(await f.nft.ownerOf(2)).to.equal(await f.alice.getAddress());
    expect(await f.nft.totalSupply()).to.equal(2n);
    expect(await f.nara.balanceOf(await f.userRouter.getAddress())).to.equal(
      0n
    );
  });

  it("provides bounded permissionless epoch catch-up and an explicit manual fallback", async function () {
    const f = await deployFixture();
    await f.engine.setTargetEpoch(10);
    await expect(f.opsRouter.advance(4)).to.be.revertedWithCustomError(
      f.opsRouter,
      "InvalidBound"
    );

    await f.opsRouter.connect(f.alice).catchUp(2);
    expect(await f.engine.currentEpoch()).to.equal(6n);
    await f.opsRouter.connect(f.bob).catchUp(2);
    expect(await f.engine.currentEpoch()).to.equal(10n);
    await expect(f.opsRouter.catchUp(1))
      .to.emit(f.opsRouter, "CatchUpExecuted")
      .withArgs(0, 10, 10, 10, true);
  });

  it("returns paginated owner positions and explicitly selected reward lanes", async function () {
    const f = await deployFixture();
    for (const amount of [wad(100), wad(200)]) {
      await f.nara.connect(f.alice).approve(await f.nft.getAddress(), amount);
      await f.nft
        .connect(f.alice)
        .mintPosition(await f.alice.getAddress(), amount, 7 * 24 * 60 * 60);
    }
    const rewardAmount = 50n * USDC;
    await f.reward.approve(await f.engine.getAddress(), rewardAmount);
    await f.engine.fundTokenReward(
      1,
      await f.reward.getAddress(),
      rewardAmount
    );

    const position = await f.positionLens.getPosition(1, [
      await f.reward.getAddress(),
    ]);
    expect(position.owner).to.equal(await f.alice.getAddress());
    expect(position.state.principal).to.equal(wad(100));
    expect(position.claimableTokens[0]).to.equal(rewardAmount);

    const page = await f.dashboard.getUserState(
      await f.alice.getAddress(),
      1,
      1,
      [await f.reward.getAddress()]
    );
    expect(page.positionCount).to.equal(2n);
    expect(page.positions.length).to.equal(1);
    expect(page.positions[0].state.principal).to.equal(wad(200));
    await expect(
      f.dashboard.getUserState(await f.alice.getAddress(), 0, 65, [])
    ).to.be.revertedWithCustomError(f.dashboard, "InvalidPage");
  });

  it("reconciles protocol stats and immutable circulating-supply exclusions", async function () {
    const f = await deployFixture();
    const opsAllocation = await f.ops.allocation();
    const bondAllocation = await f.inventory.allocation();
    await f.nara.approve(await f.ops.getAddress(), opsAllocation);
    await f.ops.fund();
    const timestamp = await now(f.ethers);
    const startsAt = timestamp + 3601;
    await f.bond.queueTerms({
      capacity: bondAllocation,
      minPayment: 10n * USDC,
      maxPayment: 500n * USDC,
      payoutNumerator: 2n * 10n ** 12n,
      payoutDenominator: 1n,
      lockDurationSeconds: 7 * 24 * 60 * 60,
      startsAt,
      endsAt: startsAt + 100,
    });
    await f.nara
      .connect(f.treasury)
      .approve(await f.inventory.getAddress(), bondAllocation);
    await f.inventory.connect(f.treasury).fund();

    const amount = wad(250);
    await f.nara.connect(f.alice).approve(await f.nft.getAddress(), amount);
    await f.nft
      .connect(f.alice)
      .mintPosition(await f.alice.getAddress(), amount, 7 * 24 * 60 * 60);

    const protocol = await f.stats.getProtocolStats();
    expect(protocol.fixedSupply).to.equal(await f.nara.totalSupply());
    expect(protocol.totalLocked).to.equal(amount);
    expect(protocol.positionNftSupply).to.equal(1n);
    expect(protocol.bondAllocation).to.equal(bondAllocation);
    expect(protocol.bondInventoryFunded).to.equal(true);
    expect(protocol.bondMarketActive).to.equal(false);
    expect(protocol.bondRemainingCapacity).to.equal(0n);
    expect(protocol.opsAllocation).to.equal(opsAllocation);
    expect(protocol.opsFunded).to.equal(true);

    const excluded = opsAllocation + bondAllocation;
    expect(await f.circulating.excludedSupply()).to.equal(excluded);
    expect(await f.circulating.circulatingSupply()).to.equal(
      (await f.nara.totalSupply()) - excluded
    );
  });

  it("reports an expired bond market as inactive with no available capacity", async function () {
    const f = await deployFixture();
    const allocation = await f.inventory.allocation();

    const timestamp = await now(f.ethers);
    const startsAt = timestamp + 3601;
    const endsAt = startsAt + 100;
    await f.bond.queueTerms({
      capacity: allocation,
      minPayment: 10n * USDC,
      maxPayment: 100n * USDC,
      payoutNumerator: 2n * 10n ** 12n,
      payoutDenominator: 1n,
      lockDurationSeconds: 7 * 24 * 60 * 60,
      startsAt,
      endsAt,
    });
    await f.nara
      .connect(f.treasury)
      .approve(await f.inventory.getAddress(), allocation);
    await f.inventory.connect(f.treasury).fund();
    await setTime(f.ethers, startsAt);
    await f.bond.activateTerms();

    let protocol = await f.stats.getProtocolStats();
    expect(protocol.bondMarketActive).to.equal(true);
    expect(protocol.bondRemainingCapacity).to.equal(allocation);

    await setTime(f.ethers, endsAt + 1);
    protocol = await f.stats.getProtocolStats();
    expect(await f.bond.active()).to.equal(false);
    expect(await f.bond.remainingCapacity()).to.equal(0n);
    expect(protocol.bondMarketActive).to.equal(false);
    expect(protocol.bondRemainingCapacity).to.equal(0n);
  });
});
