import { expect } from "chai";
import hre from "hardhat";

const Q96 = 1n << 96n;
const POOL_FEE = 3_000;
const TICK_SPACING = 60;
const STRATEGY_HASH = `0x${"42".repeat(32)}`;

async function latestBlock(ethers: any) {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("Latest block is unavailable");
  return block;
}

function sqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < -887272 || tick > 887272) throw new Error("tick");
  const absTick = Math.abs(tick);
  let ratio = (absTick & 1) !== 0
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n;
  const factors: readonly [number, bigint][] = [
    [0x2, 0xfff97272373d413259a46990580e213an], [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n], [0x10, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20, 0xff973b41fa98c081472e6896dfb254c0n], [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80, 0xfe5dee046a99a2a811c461f1969c3053n], [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200, 0xf987a7253ac413176f2b074cf7815e54n], [0x400, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n], [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n], [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000, 0x31be135f97d08fd981231505542fcfa6n], [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000, 0x5d6af8dedb81196699c329225ee604n], [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [mask, factor] of factors) if ((absTick & mask) !== 0) ratio = (ratio * factor) >> 128n;
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio + ((1n << 32n) - 1n)) >> 32n;
}

async function latestDeadline(ethers: any, seconds = 3600): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block.timestamp + seconds);
}

async function deployFixture() {
  const { ethers } = await hre.network.connect();
  const [deployer, outsider, attacker] = await ethers.getSigners();

  const tokenA: any = await ethers.deployContract("MockERC20", ["Token A", "A", 18], deployer);
  const tokenB: any = await ethers.deployContract("MockERC20", ["Token B", "B", 18], deployer);
  await Promise.all([tokenA.waitForDeployment(), tokenB.waitForDeployment()]);
  const tokenAAddress = await tokenA.getAddress();
  const tokenBAddress = await tokenB.getAddress();
  const usdc: any = BigInt(tokenAAddress) < BigInt(tokenBAddress) ? tokenA : tokenB;
  const nara: any = usdc === tokenA ? tokenB : tokenA;
  const usdcAddress = await usdc.getAddress();
  const naraAddress = await nara.getAddress();

  const safe: any = await ethers.deployContract("MockTreasuryRangeSafe", [], deployer);
  const poolManager: any = await ethers.deployContract("MockTreasuryRangePoolManager", [], deployer);
  const permit2: any = await ethers.deployContract("MockTreasuryRangePermit2", [], deployer);
  const vault: any = await ethers.deployContract(
    "MockTreasuryRangeVaultBinding", [naraAddress, usdcAddress], deployer,
  );
  await Promise.all([
    safe.waitForDeployment(), poolManager.waitForDeployment(), permit2.waitForDeployment(), vault.waitForDeployment(),
  ]);

  const hook: any = await ethers.deployContract("MockTreasuryRangeHookBinding", [
    naraAddress,
    usdcAddress,
    await vault.getAddress(),
    await poolManager.getAddress(),
    POOL_FEE,
    TICK_SPACING,
  ], deployer);
  await hook.waitForDeployment();
  await vault.setHook(await hook.getAddress());
  const poolId = await hook.registeredPoolId();
  await poolManager.setPool(poolId, Q96, 0, 1_000_000n);

  const positionManager: any = await ethers.deployContract("MockTreasuryRangePositionManager", [
    await poolManager.getAddress(),
    await permit2.getAddress(),
    usdcAddress,
    naraAddress,
  ], deployer);
  await positionManager.waitForDeployment();

  const deploymentDeadline = await latestDeadline(ethers);
  const manager: any = await ethers.deployContract("NARATreasuryRangeManagerV1", [
    await safe.getAddress(),
    naraAddress,
    usdcAddress,
    await vault.getAddress(),
    await poolManager.getAddress(),
    await positionManager.getAddress(),
    await permit2.getAddress(),
    await hook.getAddress(),
    POOL_FEE,
    TICK_SPACING,
    poolId,
    deploymentDeadline,
  ], deployer);
  await manager.waitForDeployment();

  const safeAddress = await safe.getAddress();
  const managerAddress = await manager.getAddress();
  await nara.mint(safeAddress, 1_000_000n);
  await usdc.mint(safeAddress, 1_000_000n);

  const safeCall = async (target: any, functionName: string, args: readonly unknown[] = []) =>
    safe.execute(await target.getAddress(), target.interface.encodeFunctionData(functionName, args));
  const approveFromSafe = async (token: any, amount: bigint) =>
    safeCall(token, "approve", [managerAddress, amount]);
  const createSell = async (
    input = 1_000n,
    minimum = 1n,
    lower = -120,
    upper = -60,
    strategyHash = STRATEGY_HASH,
  ) => {
    const deadline = await latestDeadline(ethers);
    await approveFromSafe(nara, input);
    return safeCall(manager, "createSellNaraOrder", [lower, upper, input, minimum, strategyHash, deadline]);
  };
  const createBuy = async (
    input = 1_000n,
    minimum = 1n,
    lower = 60,
    upper = 120,
    strategyHash = STRATEGY_HASH,
  ) => {
    const deadline = await latestDeadline(ethers);
    await approveFromSafe(usdc, input);
    return safeCall(manager, "createBuyNaraOrder", [lower, upper, input, minimum, strategyHash, deadline]);
  };

  return {
    ethers, deployer, outsider, attacker, tokenA, tokenB, nara, usdc, safe, poolManager,
    permit2, vault, hook, positionManager, manager, poolId, safeAddress, managerAddress,
    naraAddress, usdcAddress, deploymentDeadline, safeCall, approveFromSafe, createSell, createBuy,
  };
}

describe("NARATreasuryRangeManagerV1", function () {
  it("binds the exact pool stack and enforces deployment expiry and PoolId", async function () {
    const f = await deployFixture();
    expect(await f.manager.TREASURY_SAFE()).to.equal(f.safeAddress);
    expect(await f.manager.POOL_ID()).to.equal(f.poolId);
    expect(await f.manager.DEPLOYMENT_DEADLINE()).to.equal(f.deploymentDeadline);
    expect(await f.manager.assertOperationalClean()).to.equal(true);

    const now = BigInt((await latestBlock(f.ethers)).timestamp);
    const args = [
      f.safeAddress, f.naraAddress, f.usdcAddress, await f.vault.getAddress(),
      await f.poolManager.getAddress(), await f.positionManager.getAddress(), await f.permit2.getAddress(),
      await f.hook.getAddress(), POOL_FEE, TICK_SPACING, f.poolId,
    ];
    await expect(
      f.ethers.deployContract("NARATreasuryRangeManagerV1", [...args, now - 1n], f.deployer),
    ).to.be.revertedWithCustomError(f.manager, "DeadlineExpired");
    await expect(
      f.ethers.deployContract("NARATreasuryRangeManagerV1", [
        ...args.slice(0, 10), `0x${"ff".repeat(32)}`, now + 100n,
      ], f.deployer),
    ).to.be.revertedWithCustomError(f.manager, "WrongPoolId");

    await expect(
      f.ethers.deployContract("NARATreasuryRangeManagerV1", [
        f.safeAddress, f.usdcAddress, f.naraAddress, ...args.slice(3), now + 100n,
      ], f.deployer),
    ).to.be.revertedWithCustomError(f.manager, "WrongCurrencyOrder");

    const alternatePool: any = await f.ethers.deployContract("MockTreasuryRangePoolManager", [], f.deployer);
    await alternatePool.waitForDeployment();
    const wrongPositionManager: any = await f.ethers.deployContract("MockTreasuryRangePositionManager", [
      await alternatePool.getAddress(), await f.permit2.getAddress(), f.usdcAddress, f.naraAddress,
    ], f.deployer);
    await wrongPositionManager.waitForDeployment();
    const wrongPositionArgs = [...args];
    wrongPositionArgs[5] = await wrongPositionManager.getAddress();
    await expect(
      f.ethers.deployContract("NARATreasuryRangeManagerV1", [...wrongPositionArgs, now + 100n], f.deployer),
    ).to.be.revertedWithCustomError(f.manager, "InvalidPeripheryBinding");

    const wrongPermitArgs = [...args];
    wrongPermitArgs[6] = f.safeAddress;
    await expect(
      f.ethers.deployContract("NARATreasuryRangeManagerV1", [...wrongPermitArgs, now + 100n], f.deployer),
    ).to.be.revertedWithCustomError(f.manager, "InvalidPeripheryBinding");

    const wrongVault: any = await f.ethers.deployContract(
      "MockTreasuryRangeVaultBinding", [f.naraAddress, f.usdcAddress], f.deployer,
    );
    await wrongVault.waitForDeployment();
    const wrongVaultArgs = [...args];
    wrongVaultArgs[3] = await wrongVault.getAddress();
    await expect(
      f.ethers.deployContract("NARATreasuryRangeManagerV1", [...wrongVaultArgs, now + 100n], f.deployer),
    ).to.be.revertedWithCustomError(f.manager, "InvalidPeripheryBinding");

    await f.hook.setPoolRegistered(false);
    await expect(
      f.ethers.deployContract("NARATreasuryRangeManagerV1", [...args, now + 100n], f.deployer),
    ).to.be.revertedWithCustomError(f.manager, "InvalidPeripheryBinding");
    await f.hook.setPoolRegistered(true);

    await f.hook.setInvalidLiquidityPermissions(true);
    await expect(
      f.ethers.deployContract("NARATreasuryRangeManagerV1", [...args, now + 100n], f.deployer),
    ).to.be.revertedWithCustomError(f.manager, "InvalidHookPermissions");
  });

  it("creates a NARA-only sell order, records actual spend, returns dust, and clears manager approvals", async function () {
    const f = await deployFixture();
    await f.positionManager.setMintDust(0, 7);
    const safeNaraBefore = await f.nara.balanceOf(f.safeAddress);

    await expect(f.createSell(1_000n, 500n)).to.emit(f.manager, "OrderCreated");

    const order = await f.manager.getOrder(1n);
    expect(order.tokenId).to.equal(1n);
    expect(order.inputAmount).to.equal(993n);
    expect(order.minimumOutputAmount).to.equal(500n);
    expect(order.strategyHash).to.equal(STRATEGY_HASH);
    expect(order.side).to.equal(0n);
    expect(order.status).to.equal(1n);
    expect(await f.positionManager.ownerOf(1n)).to.equal(f.managerAddress);
    expect(await f.positionManager.getPositionLiquidity(1n)).to.equal(order.liquidity);
    expect(safeNaraBefore - (await f.nara.balanceOf(f.safeAddress))).to.equal(993n);
    expect(await f.nara.balanceOf(f.managerAddress)).to.equal(0n);
    expect(await f.usdc.balanceOf(f.managerAddress)).to.equal(0n);
    expect(await f.nara.allowance(f.managerAddress, await f.permit2.getAddress())).to.equal(0n);
    expect((await f.permit2.allowance(f.managerAddress, f.naraAddress, await f.positionManager.getAddress())).amount)
      .to.equal(0n);
    expect(await f.manager.activeOrderCount()).to.equal(1n);

    expect(await f.manager.assertOperationalClean()).to.equal(true);

    // The final assertion also detects a Safe-builder approval that was not reset.
    await f.approveFromSafe(f.nara, 1n);
    await expect(f.manager.assertOperationalClean()).to.be.revertedWithCustomError(
      f.manager, "ResidualSafeAllowance",
    );
    await f.approveFromSafe(f.nara, 0n);
    expect(await f.manager.assertOperationalClean()).to.equal(true);
  });

  it("forwards forceable NARA and USDC dust only to Safe during order creation", async function () {
    const f = await deployFixture();
    await f.nara.mint(f.attacker.address, 1n);
    await f.usdc.mint(f.attacker.address, 1n);
    await f.nara.connect(f.attacker).transfer(f.managerAddress, 1n);
    await f.usdc.connect(f.attacker).transfer(f.managerAddress, 1n);
    expect(await f.nara.balanceOf(f.managerAddress)).to.equal(1n);
    expect(await f.usdc.balanceOf(f.managerAddress)).to.equal(1n);

    const safeNaraBefore = await f.nara.balanceOf(f.safeAddress);
    const safeUsdcBefore = await f.usdc.balanceOf(f.safeAddress);
    await expect(f.createSell(1_000n, 1n))
      .to.emit(f.manager, "PoolTokenDustForwarded")
      .withArgs(1n, 1n);

    const order = await f.manager.getOrder(1n);
    const actualInput = BigInt(order.inputAmount);
    expect(actualInput).to.equal(1_000n);
    expect(await f.nara.balanceOf(f.safeAddress)).to.equal(BigInt(safeNaraBefore) - actualInput + 1n);
    expect(await f.usdc.balanceOf(f.safeAddress)).to.equal(BigInt(safeUsdcBefore) + 1n);
    expect(await f.nara.balanceOf(f.attacker.address)).to.equal(0n);
    expect(await f.usdc.balanceOf(f.attacker.address)).to.equal(0n);
    expect(await f.nara.balanceOf(f.managerAddress)).to.equal(0n);
    expect(await f.usdc.balanceOf(f.managerAddress)).to.equal(0n);

    const permit2Address = await f.permit2.getAddress();
    const positionManagerAddress = await f.positionManager.getAddress();
    expect(await f.nara.allowance(f.safeAddress, f.managerAddress)).to.equal(0n);
    expect(await f.usdc.allowance(f.safeAddress, f.managerAddress)).to.equal(0n);
    expect(await f.nara.allowance(f.managerAddress, permit2Address)).to.equal(0n);
    expect(await f.usdc.allowance(f.managerAddress, permit2Address)).to.equal(0n);
    expect((await f.permit2.allowance(f.managerAddress, f.naraAddress, positionManagerAddress)).amount)
      .to.equal(0n);
    expect((await f.permit2.allowance(f.managerAddress, f.usdcAddress, positionManagerAddress)).amount)
      .to.equal(0n);
    expect(await f.manager.assertOperationalClean()).to.equal(true);
  });

  it("creates a USDC-only buy order and enforces exact token/tick orientation", async function () {
    const f = await deployFixture();
    await f.createBuy();
    const order = await f.manager.getOrder(1n);
    expect(order.side).to.equal(1n);
    expect(order.tickLower).to.equal(60n);
    expect(order.tickUpper).to.equal(120n);
    expect(order.inputAmount).to.equal(1_000n);

    await f.poolManager.setPrice(sqrtPriceAtTick(60), 60);
    await f.approveFromSafe(f.usdc, 1_000n);
    await expect(f.safeCall(f.manager, "createBuyNaraOrder", [
      60, 120, 1_000n, 1n, STRATEGY_HASH, await latestDeadline(f.ethers),
    ])).not.to.revert(f.ethers);

    await f.poolManager.setPrice(sqrtPriceAtTick(-60), -60);
    await f.approveFromSafe(f.nara, 1_000n);
    await expect(f.safeCall(f.manager, "createSellNaraOrder", [
      -120, -60, 1_000n, 1n, STRATEGY_HASH, await latestDeadline(f.ethers),
    ])).not.to.revert(f.ethers);
  });

  it("rejects unauthorized, stale, malformed, in-range, and already-filled creation", async function () {
    const f = await deployFixture();
    const deadline = await latestDeadline(f.ethers);
    await expect(
      f.manager.connect(f.outsider).createSellNaraOrder(-120, -60, 1_000n, 1n, STRATEGY_HASH, deadline),
    ).to.be.revertedWithCustomError(f.manager, "UnauthorizedSafe");

    await f.approveFromSafe(f.nara, 10_000n);
    const call = (args: readonly unknown[]) => f.safeCall(f.manager, "createSellNaraOrder", args);
    await expect(call([-121, -60, 1_000n, 1n, STRATEGY_HASH, deadline]))
      .to.be.revertedWithCustomError(f.manager, "InvalidTickSpacing");
    await expect(call([-60, -60, 1_000n, 1n, STRATEGY_HASH, deadline]))
      .to.be.revertedWithCustomError(f.manager, "InvalidTickRange");
    await expect(call([-120, -60, 0n, 1n, STRATEGY_HASH, deadline]))
      .to.be.revertedWithCustomError(f.manager, "ZeroValue");
    await expect(call([-120, -60, 1_000n, 0n, STRATEGY_HASH, deadline]))
      .to.be.revertedWithCustomError(f.manager, "ZeroValue");
    await expect(call([-120, -60, 1_000n, 1n, f.ethers.ZeroHash, deadline]))
      .to.be.revertedWithCustomError(f.manager, "ZeroStrategyHash");
    await expect(call([-60, 60, 1_000n, 1n, STRATEGY_HASH, deadline]))
      .to.be.revertedWithCustomError(f.manager, "RangeInMarket");
    await expect(call([60, 120, 1_000n, 1n, STRATEGY_HASH, deadline]))
      .to.be.revertedWithCustomError(f.manager, "RangeAlreadyFilled");
    await expect(call([-120, -60, 1_000n, (1n << 128n) - 1n, STRATEGY_HASH, deadline]))
      .to.be.revertedWithCustomError(f.manager, "MinimumOutputTooHigh");
    await expect(call([-120, -60, 1_000n, 1n, STRATEGY_HASH, 1n]))
      .to.be.revertedWithCustomError(f.manager, "DeadlineExpired");
  });

  it("settles only at the exact side-aware boundary and routes principal plus fees only to Safe", async function () {
    const f = await deployFixture();
    await f.createSell(1_000n, 500n);
    expect(await f.manager.isSettleable(1n)).to.equal(false);
    await expect(f.manager.connect(f.outsider).settle(1n))
      .to.be.revertedWithCustomError(f.manager, "OrderNotSettleable");

    await f.positionManager.setSettlement(1n, 600n, 0n, 3n, 4n);
    await f.usdc.mint(await f.positionManager.getAddress(), 603n);
    await f.poolManager.setPrice(sqrtPriceAtTick(-120), -120);
    expect(await f.manager.isSettleable(1n)).to.equal(true);
    expect((await f.manager.previewSettlement(1n)).settleable).to.equal(true);
    const safeNaraBefore = await f.nara.balanceOf(f.safeAddress);
    const safeUsdcBefore = await f.usdc.balanceOf(f.safeAddress);

    await expect(f.manager.connect(f.outsider).settle(1n)).to.emit(f.manager, "OrderSettled");
    expect((await f.nara.balanceOf(f.safeAddress)) - safeNaraBefore).to.equal(4n);
    expect((await f.usdc.balanceOf(f.safeAddress)) - safeUsdcBefore).to.equal(603n);
    expect(await f.positionManager.getPositionLiquidity(1n)).to.equal(0n);
    await expect(f.positionManager.ownerOf(1n)).to.be.revert(f.ethers);
    expect((await f.manager.getOrder(1n)).status).to.equal(2n);
    expect(await f.manager.activeOrderCount()).to.equal(0n);
    await expect(f.manager.settle(1n)).to.be.revertedWithCustomError(f.manager, "OrderAlreadySettled");
    await expect(f.safeCall(f.manager, "cancel", [1n, 0n, 0n, await latestDeadline(f.ethers)]))
      .to.be.revertedWithCustomError(f.manager, "OrderAlreadySettled");
  });

  it("settles a BUY_NARA order only at its upper sqrt boundary", async function () {
    const f = await deployFixture();
    await f.createBuy(1_000n, 700n);
    await f.positionManager.setSettlement(1n, 0n, 750n, 2n, 5n);
    await f.nara.mint(await f.positionManager.getAddress(), 755n);
    await f.poolManager.setPrice(sqrtPriceAtTick(120), 120);
    expect(await f.manager.isSettleable(1n)).to.equal(true);
    const naraBefore = await f.nara.balanceOf(f.safeAddress);
    await f.manager.connect(f.outsider).settle(1n);
    expect((await f.nara.balanceOf(f.safeAddress)) - naraBefore).to.equal(755n);
  });

  it("keeps settlement and bounded cancellation available while creation is paused", async function () {
    const f = await deployFixture();
    await f.createSell();
    await f.safeCall(f.manager, "pauseOrderCreation");
    await f.approveFromSafe(f.nara, 1_000n);
    await expect(f.safeCall(f.manager, "createSellNaraOrder", [
      -240, -180, 1_000n, 1n, STRATEGY_HASH, await latestDeadline(f.ethers),
    ])).to.be.revertedWithCustomError(f.manager, "OrderCreationIsPaused");

    const order = await f.manager.getOrder(1n);
    const naraBefore = await f.nara.balanceOf(f.safeAddress);
    await expect(f.safeCall(f.manager, "cancel", [
      1n, order.inputAmount, 0n, await latestDeadline(f.ethers),
    ])).to.emit(f.manager, "OrderCancelled");
    expect((await f.nara.balanceOf(f.safeAddress)) - naraBefore).to.equal(order.inputAmount);
    expect((await f.manager.getOrder(1n)).status).to.equal(3n);
    await expect(f.manager.settle(1n)).to.be.revertedWithCustomError(f.manager, "OrderAlreadyCancelled");

    await f.safeCall(f.manager, "unpauseOrderCreation");
    expect(await f.manager.orderCreationPaused()).to.equal(false);
  });

  it("enforces cancellation deadline and both output minima without changing Active state on failure", async function () {
    const f = await deployFixture();
    await f.createSell();
    await f.positionManager.setSettlement(1n, 0n, 500n, 0n, 0n);

    await expect(f.safeCall(f.manager, "cancel", [1n, 500n, 0n, 1n]))
      .to.be.revertedWithCustomError(f.manager, "DeadlineExpired");
    await expect(f.safeCall(f.manager, "cancel", [
      1n, 501n, 0n, await latestDeadline(f.ethers),
    ])).to.revert(f.ethers);
    expect((await f.manager.getOrder(1n)).status).to.equal(1n);
    expect(await f.positionManager.ownerOf(1n)).to.equal(f.managerAddress);

    const safeNaraBefore = await f.nara.balanceOf(f.safeAddress);
    await f.safeCall(f.manager, "cancel", [1n, 500n, 0n, await latestDeadline(f.ethers)]);
    expect((await f.nara.balanceOf(f.safeAddress)) - safeNaraBefore).to.equal(500n);
    expect((await f.manager.getOrder(1n)).status).to.equal(3n);
  });

  it("settleMany is bounded and atomic on mixed or duplicate state", async function () {
    const f = await deployFixture();
    await f.createSell(1_000n, 100n, -120, -60, STRATEGY_HASH);
    await f.createSell(1_000n, 100n, -240, -180, `0x${"43".repeat(32)}`);
    await f.positionManager.setSettlement(1n, 200n, 0n, 0n, 0n);
    await f.positionManager.setSettlement(2n, 300n, 0n, 0n, 0n);
    await f.usdc.mint(await f.positionManager.getAddress(), 500n);
    await f.poolManager.setPrice(sqrtPriceAtTick(-240), -240);

    await expect(f.manager.settleMany([1n, 1n])).to.be.revertedWithCustomError(
      f.manager, "OrderAlreadySettled",
    );
    expect((await f.manager.getOrder(1n)).status).to.equal(1n);
    await expect(f.manager.settleMany(new Array(17).fill(1n))).to.be.revertedWithCustomError(
      f.manager, "InvalidBatchSize",
    );
    await f.manager.settleMany([1n, 2n]);
    expect(await f.manager.activeOrderCount()).to.equal(0n);
  });

  it("blocks reentrancy through PositionManager and preserves the Active order on revert", async function () {
    const f = await deployFixture();
    await f.createSell(1_000n, 100n);
    await f.positionManager.setSettlement(1n, 200n, 0n, 0n, 0n);
    await f.usdc.mint(await f.positionManager.getAddress(), 200n);
    await f.poolManager.setPrice(sqrtPriceAtTick(-120), -120);
    await f.positionManager.setReentry(
      f.managerAddress,
      f.manager.interface.encodeFunctionData("settle", [1n]),
      true,
    );
    await expect(f.manager.settle(1n)).to.be.revertedWithCustomError(
      f.manager, "ReentrancyGuardReentrantCall",
    );
    expect((await f.manager.getOrder(1n)).status).to.equal(1n);
    expect(await f.positionManager.getPositionLiquidity(1n)).to.be.greaterThan(0n);
  });

  it("contains direct-mint receiver bypass without registering it, then quarantines only to Safe", async function () {
    const f = await deployFixture();
    await f.createSell();
    await f.positionManager.mintUnregisteredDirect(f.managerAddress);
    const foreignId = 2n;
    expect(await f.positionManager.ownerOf(foreignId)).to.equal(f.managerAddress);
    expect(await f.manager.tokenIdToOrderId(foreignId)).to.equal(0n);
    await expect(f.manager.settle(2n)).to.be.revertedWithCustomError(f.manager, "OrderNotFound");
    await expect(f.manager.connect(f.outsider).quarantineUnregisteredPosition(foreignId))
      .to.be.revertedWithCustomError(f.manager, "UnauthorizedSafe");
    await expect(f.safeCall(f.manager, "quarantineUnregisteredPosition", [foreignId]))
      .to.emit(f.manager, "UnregisteredPositionQuarantined")
      .withArgs(foreignId, f.safeAddress);
    expect(await f.positionManager.ownerOf(foreignId)).to.equal(f.safeAddress);

    await expect(f.safeCall(f.manager, "quarantineUnregisteredPosition", [1n]))
      .to.be.revertedWithCustomError(f.manager, "RegisteredPositionCannotBeQuarantined");

    const directlyOwned = await f.positionManager.mintUnregisteredDirect.staticCall(f.attacker.address);
    await f.positionManager.mintUnregisteredDirect(f.attacker.address);
    await expect(
      f.positionManager.connect(f.attacker)["safeTransferFrom(address,address,uint256)"](
        f.attacker.address, f.managerAddress, directlyOwned,
      ),
    ).to.be.revertedWithCustomError(f.manager, "UnexpectedPositionNft");
    expect(await f.positionManager.ownerOf(directlyOwned)).to.equal(f.attacker.address);
  });
});
