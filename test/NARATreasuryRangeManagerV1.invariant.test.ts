import { expect } from "chai";
import hre from "hardhat";

const Q96 = 1n << 96n;
const POOL_FEE = 3_000;
const TICK_SPACING = 60;

async function latestBlock(ethers: any) {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("Latest block is unavailable");
  return block;
}

function sqrtPriceAtTick(tick: number): bigint {
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
    [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  ];
  for (const [mask, factor] of factors) if ((absTick & mask) !== 0) ratio = (ratio * factor) >> 128n;
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio + ((1n << 32n) - 1n)) >> 32n;
}

async function deployFixture() {
  const { ethers } = await hre.network.connect();
  const [deployer, outsider] = await ethers.getSigners();
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
    naraAddress, usdcAddress, await vault.getAddress(), await poolManager.getAddress(), POOL_FEE, TICK_SPACING,
  ], deployer);
  await hook.waitForDeployment();
  await vault.setHook(await hook.getAddress());
  const poolId = await hook.registeredPoolId();
  await poolManager.setPool(poolId, Q96, 0, 1_000_000n);
  const positionManager: any = await ethers.deployContract("MockTreasuryRangePositionManager", [
    await poolManager.getAddress(), await permit2.getAddress(), usdcAddress, naraAddress,
  ], deployer);
  await positionManager.waitForDeployment();

  const now = BigInt((await latestBlock(ethers)).timestamp);
  const manager: any = await ethers.deployContract("NARATreasuryRangeManagerV1", [
    await safe.getAddress(), naraAddress, usdcAddress, await vault.getAddress(),
    await poolManager.getAddress(), await positionManager.getAddress(), await permit2.getAddress(),
    await hook.getAddress(), POOL_FEE, TICK_SPACING, poolId, now + 3_600n,
  ], deployer);
  await manager.waitForDeployment();
  const safeAddress = await safe.getAddress();
  const managerAddress = await manager.getAddress();
  await nara.mint(safeAddress, 1_000_000n);
  await usdc.mint(safeAddress, 1_000_000n);

  const safeCall = async (target: any, name: string, args: readonly unknown[] = []) =>
    safe.execute(await target.getAddress(), target.interface.encodeFunctionData(name, args));
  const create = async (
    side: "sell" | "buy", lower: number, upper: number, nonce: number, input = 1_000n,
  ) => {
    const token = side === "sell" ? nara : usdc;
    await safeCall(token, "approve", [managerAddress, input]);
    const deadline = BigInt((await latestBlock(ethers)).timestamp + 3_600);
    const strategyHash = ethers.keccak256(ethers.toUtf8Bytes(`invariant-${side}-${nonce}`));
    const name = side === "sell" ? "createSellNaraOrder" : "createBuyNaraOrder";
    return safeCall(manager, name, [lower, upper, input, 1n, strategyHash, deadline]);
  };
  return {
    ethers, outsider, nara, usdc, safe, poolManager, permit2, positionManager, manager,
    safeAddress, managerAddress, naraAddress, usdcAddress, safeCall, create,
  };
}

describe("NARATreasuryRangeManagerV1 lifecycle invariants", function () {
  it("keeps permanent one-to-one registration and exact active-set accounting through mixed lifecycles", async function () {
    const f = await deployFixture();
    const sellRanges = [[-120, -60], [-240, -180], [-360, -300]] as const;
    const buyRanges = [[60, 120], [180, 240], [300, 360]] as const;

    for (let i = 0; i < sellRanges.length; ++i) {
      await f.create("sell", sellRanges[i][0], sellRanges[i][1], i);
      await f.create("buy", buyRanges[i][0], buyRanges[i][1], i);
    }

    expect(await f.manager.orderCount()).to.equal(6n);
    expect(await f.manager.activeOrderCount()).to.equal(6n);
    const [initialActive, initialNextOffset] = await f.manager.getActiveOrderIds(0, 100);
    expect(initialActive).to.deep.equal([1n, 2n, 3n, 4n, 5n, 6n]);
    expect(initialNextOffset).to.equal(6n);
    for (let orderId = 1n; orderId <= 6n; ++orderId) {
      const order = await f.manager.getOrder(orderId);
      expect(order.tokenId).to.not.equal(0n);
      expect(await f.manager.tokenIdToOrderId(order.tokenId)).to.equal(orderId);
      expect(order.status).to.equal(1n);
      expect(await f.positionManager.ownerOf(order.tokenId)).to.equal(f.managerAddress);
    }

    const deadline = BigInt((await latestBlock(f.ethers)).timestamp + 3_600);
    await f.safeCall(f.manager, "cancel", [1n, 1n, 0n, deadline]);
    await f.safeCall(f.manager, "cancel", [2n, 0n, 1n, deadline]);
    expect((await f.manager.getOrder(1n)).status).to.equal(3n);
    expect((await f.manager.getOrder(2n)).status).to.equal(3n);
    expect(await f.manager.activeOrderCount()).to.equal(4n);

    await f.poolManager.setPrice(sqrtPriceAtTick(-360), -360);
    await f.positionManager.setSettlement(3n, 200n, 0n, 0n, 0n);
    await f.positionManager.setSettlement(5n, 200n, 0n, 0n, 0n);
    await f.manager.settleMany([3n, 5n]);
    await f.poolManager.setPrice(sqrtPriceAtTick(360), 360);
    await f.positionManager.setSettlement(4n, 0n, 200n, 0n, 0n);
    await f.positionManager.setSettlement(6n, 0n, 200n, 0n, 0n);
    await f.manager.settleMany([4n, 6n]);

    expect(await f.manager.activeOrderCount()).to.equal(0n);
    const [finalActive, finalNextOffset] = await f.manager.getActiveOrderIds(0, 100);
    expect(finalActive).to.deep.equal([]);
    expect(finalNextOffset).to.equal(0n);
    for (let orderId = 1n; orderId <= 6n; ++orderId) {
      const order = await f.manager.getOrder(orderId);
      expect(order.status).to.equal(orderId <= 2n ? 3n : 2n);
      expect(await f.manager.tokenIdToOrderId(order.tokenId)).to.equal(orderId);
      await expect(f.positionManager.ownerOf(order.tokenId)).to.revert(f.ethers);
    }
    expect(await f.manager.assertOperationalClean()).to.equal(true);
  });

  it("never turns arbitrary PositionManager token IDs into managed orders", async function () {
    const f = await deployFixture();
    for (let i = 0; i < 4; ++i) {
      const tokenId = await f.positionManager.mintUnregisteredDirect.staticCall(f.managerAddress);
      await f.positionManager.mintUnregisteredDirect(f.managerAddress);
      expect(await f.manager.tokenIdToOrderId(tokenId)).to.equal(0n);
      expect(await f.manager.orderCount()).to.equal(0n);
      await expect(f.manager.settle(tokenId)).to.be.revertedWithCustomError(f.manager, "OrderNotFound");
      await expect(f.safeCall(f.manager, "cancel", [tokenId, 0n, 0n, 2n ** 48n - 1n]))
        .to.be.revertedWithCustomError(f.manager, "OrderNotFound");
      await expect(f.manager.connect(f.outsider).quarantineUnregisteredPosition(tokenId))
        .to.be.revertedWithCustomError(f.manager, "UnauthorizedSafe");
      await f.safeCall(f.manager, "quarantineUnregisteredPosition", [tokenId]);
      expect(await f.positionManager.ownerOf(tokenId)).to.equal(f.safeAddress);
    }

    await f.create("sell", -120, -60, 99);
    const managed = await f.manager.getOrder(1n);
    await expect(f.safeCall(f.manager, "quarantineUnregisteredPosition", [managed.tokenId]))
      .to.be.revertedWithCustomError(f.manager, "RegisteredPositionCannotBeQuarantined");
    expect(await f.manager.tokenIdToOrderId(managed.tokenId)).to.equal(1n);
    expect(await f.manager.activeOrderCount()).to.equal(1n);
  });

  it("preserves registration, principal, recipient, and monotonic status over bounded pseudo-random orders", async function () {
    const f = await deployFixture();
    let seed = 0x6e896c22n;

    for (let i = 0; i < 12; ++i) {
      seed = (seed * 1_103_515_245n + 12_345n) & 0x7fffffffn;
      const sell = (seed & 1n) === 0n;
      const offset = Number((seed % 7n) + 1n);
      seed = (seed * 1_103_515_245n + 12_345n) & 0x7fffffffn;
      const width = Number((seed % 4n) + 1n);
      const upper = sell ? -offset * TICK_SPACING : (offset + width) * TICK_SPACING;
      const lower = sell ? -(offset + width) * TICK_SPACING : offset * TICK_SPACING;
      const input = 500n + (seed % 1_500n);
      const dust = seed % 5n;
      await f.positionManager.setMintDust(sell ? 0n : dust, sell ? dust : 0n);

      const inputToken = sell ? f.nara : f.usdc;
      const otherToken = sell ? f.usdc : f.nara;
      const safeInputBefore = await inputToken.balanceOf(f.safeAddress);
      const safeOtherBefore = await otherToken.balanceOf(f.safeAddress);
      const outsiderInputBefore = await inputToken.balanceOf(f.outsider.address);
      const outsiderOtherBefore = await otherToken.balanceOf(f.outsider.address);

      await f.create(sell ? "sell" : "buy", lower, upper, i + 1_000, input);
      const orderId = BigInt(i + 1);
      const order = await f.manager.getOrder(orderId);
      expect(order.status).to.equal(1n);
      expect(order.inputAmount).to.equal(input - dust);
      expect(await f.manager.tokenIdToOrderId(order.tokenId)).to.equal(orderId);
      expect(await f.manager.activeOrderCount()).to.equal(1n);
      expect(safeInputBefore - (await inputToken.balanceOf(f.safeAddress))).to.equal(order.inputAmount);
      expect(await inputToken.balanceOf(f.managerAddress)).to.equal(0n);
      expect(await otherToken.balanceOf(f.managerAddress)).to.equal(0n);

      const deadline = BigInt((await latestBlock(f.ethers)).timestamp + 3_600);
      await f.safeCall(f.manager, "cancel", [
        orderId,
        sell ? order.inputAmount : 0n,
        sell ? 0n : order.inputAmount,
        deadline,
      ]);
      expect((await f.manager.getOrder(orderId)).status).to.equal(3n);
      expect(await f.manager.tokenIdToOrderId(order.tokenId)).to.equal(orderId);
      expect(await f.manager.activeOrderCount()).to.equal(0n);
      expect(await inputToken.balanceOf(f.safeAddress)).to.equal(safeInputBefore);
      expect(await otherToken.balanceOf(f.safeAddress)).to.equal(safeOtherBefore);
      expect(await inputToken.balanceOf(f.outsider.address)).to.equal(outsiderInputBefore);
      expect(await otherToken.balanceOf(f.outsider.address)).to.equal(outsiderOtherBefore);
      await expect(f.manager.settle(orderId)).to.be.revertedWithCustomError(f.manager, "OrderAlreadyCancelled");
      expect((await f.manager.getOrder(orderId)).status).to.equal(3n);
      expect(await f.manager.assertOperationalClean()).to.equal(true);
    }
  });
});
