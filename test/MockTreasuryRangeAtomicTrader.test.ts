import { expect } from "chai";
import { AbiCoder } from "ethers";
import hre from "hardhat";

const abi = (types: readonly string[], values: readonly unknown[]): string =>
  AbiCoder.defaultAbiCoder().encode(types, values);

async function fixture() {
  const { ethers } = await hre.network.connect();
  const [controller, outsider] = await ethers.getSigners();

  const nara: any = await ethers.deployContract("MockERC20", ["NARA", "NARA", 18], controller);
  const usdc: any = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6], controller);
  const permit2: any = await ethers.deployContract("MockTreasuryRangePermit2", [], controller);
  await Promise.all([nara.waitForDeployment(), usdc.waitForDeployment(), permit2.waitForDeployment()]);

  const router: any = await ethers.deployContract(
    "MockTreasuryRangeAtomicUniversalRouter",
    [await permit2.getAddress()],
    controller,
  );
  await router.waitForDeployment();

  const trader: any = await ethers.deployContract(
    "MockTreasuryRangeAtomicTrader",
    [await router.getAddress(), await permit2.getAddress(), await nara.getAddress(), await usdc.getAddress()],
    controller,
  );
  await trader.waitForDeployment();

  return {
    ethers,
    controller,
    outsider,
    nara,
    usdc,
    permit2,
    router,
    trader,
    naraAddress: await nara.getAddress(),
    usdcAddress: await usdc.getAddress(),
    traderAddress: await trader.getAddress(),
    routerAddress: await router.getAddress(),
    permit2Address: await permit2.getAddress(),
  };
}

async function deadline(ethers: any): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block.timestamp + 600);
}

function swapInput(tokenIn: string, amountIn: bigint, tokenOut: string, amountOut: bigint): string {
  return abi(["address", "uint160", "address", "uint160"], [tokenIn, amountIn, tokenOut, amountOut]);
}

describe("MockTreasuryRangeAtomicTrader", function () {
  it("binds its controller and fixed simulator dependencies", async function () {
    const f = await fixture();
    expect(await f.trader.CONTROLLER()).to.equal(f.controller.address);
    expect(await f.trader.UNIVERSAL_ROUTER()).to.equal(f.routerAddress);
    expect(await f.trader.PERMIT2()).to.equal(f.permit2Address);
    expect(await f.trader.NARA()).to.equal(f.naraAddress);
    expect(await f.trader.USDC()).to.equal(f.usdcAddress);

    await expect(
      f.ethers.deployContract(
        "MockTreasuryRangeAtomicTrader",
        [f.outsider.address, f.permit2Address, f.naraAddress, f.usdcAddress],
        f.controller,
      ),
    ).to.be.revertedWithCustomError(f.trader, "AtomicTraderNotContract").withArgs(f.outsider.address);
  });

  it("executes two prebuilt buys in one outer transaction and clears both allowance layers", async function () {
    const f = await fixture();
    const amountInA = 100n;
    const amountInB = 200n;
    const naraOutA = 90n;
    const naraOutB = 180n;
    const totalUsdc = amountInA + amountInB;
    const totalNara = naraOutA + naraOutB;

    await f.usdc.mint(f.controller.address, totalUsdc);
    await f.nara.mint(f.routerAddress, totalNara);
    await f.usdc.approve(f.traderAddress, totalUsdc);
    await expect(f.trader.fund(0, totalUsdc))
      .to.emit(f.trader, "AtomicTraderFunded")
      .withArgs(0, totalUsdc);

    const expiry = await deadline(f.ethers);
    const calls = [
      { commands: "0x10", inputs: [swapInput(f.usdcAddress, amountInA, f.naraAddress, naraOutA)], deadline: expiry },
      { commands: "0x10", inputs: [swapInput(f.usdcAddress, amountInB, f.naraAddress, naraOutB)], deadline: expiry },
    ];

    await expect(f.trader.executeAtomic(calls, 0, totalUsdc, expiry))
      .to.emit(f.trader, "AtomicRouterSequenceExecuted")
      .withArgs(2, 0, totalUsdc);

    expect(await f.router.executeCount()).to.equal(2n);
    expect(await f.usdc.balanceOf(f.traderAddress)).to.equal(0n);
    expect(await f.nara.balanceOf(f.traderAddress)).to.equal(totalNara);
    expect(await f.trader.assertAllowanceClean()).to.equal(true);
    expect(await f.nara.allowance(f.traderAddress, f.permit2Address)).to.equal(0n);
    expect(await f.usdc.allowance(f.traderAddress, f.permit2Address)).to.equal(0n);
    const clearedNaraPermit = await f.permit2.allowance(f.traderAddress, f.naraAddress, f.routerAddress);
    const clearedUsdcPermit = await f.permit2.allowance(f.traderAddress, f.usdcAddress, f.routerAddress);
    expect(clearedNaraPermit.amount).to.equal(0n);
    expect(clearedUsdcPermit.amount).to.equal(0n);
    expect(clearedNaraPermit.expiration).to.be.greaterThan(0n);
    expect(clearedUsdcPermit.expiration).to.be.greaterThan(0n);

    await f.trader.returnBalances();
    expect(await f.nara.balanceOf(f.controller.address)).to.equal(totalNara);
    expect(await f.usdc.balanceOf(f.controller.address)).to.equal(0n);
  });

  it("uses output from a buy as the reverse input in the same outer transaction", async function () {
    const f = await fixture();
    const usdcIn = 100n;
    const naraOut = 80n;
    const usdcOut = 70n;

    await f.usdc.mint(f.controller.address, usdcIn);
    await f.nara.mint(f.routerAddress, naraOut);
    await f.usdc.mint(f.routerAddress, usdcOut);
    await f.usdc.approve(f.traderAddress, usdcIn);
    await f.trader.fund(0, usdcIn);

    const expiry = await deadline(f.ethers);
    await f.trader.executeAtomic([
      { commands: "0x10", inputs: [swapInput(f.usdcAddress, usdcIn, f.naraAddress, naraOut)], deadline: expiry },
      { commands: "0x10", inputs: [swapInput(f.naraAddress, naraOut, f.usdcAddress, usdcOut)], deadline: expiry },
    ], naraOut, usdcIn, expiry);

    expect(await f.router.executeCount()).to.equal(2n);
    expect(await f.nara.balanceOf(f.traderAddress)).to.equal(0n);
    expect(await f.usdc.balanceOf(f.traderAddress)).to.equal(usdcOut);
    expect(await f.trader.assertAllowanceClean()).to.equal(true);
  });

  it("rolls the first router call and temporary approvals back when the second call fails", async function () {
    const f = await fixture();
    const usdcIn = 100n;
    const naraOut = 80n;
    await f.usdc.mint(f.controller.address, usdcIn);
    await f.nara.mint(f.routerAddress, naraOut);
    await f.usdc.approve(f.traderAddress, usdcIn);
    await f.trader.fund(0, usdcIn);

    const expiry = await deadline(f.ethers);
    await expect(f.trader.executeAtomic([
      { commands: "0x10", inputs: [swapInput(f.usdcAddress, usdcIn, f.naraAddress, naraOut)], deadline: expiry },
      { commands: "0xff", inputs: [], deadline: expiry },
    ], 0, usdcIn, expiry)).to.be.revertedWithCustomError(f.router, "AtomicRouterForcedFailure");

    expect(await f.router.executeCount()).to.equal(0n);
    expect(await f.usdc.balanceOf(f.traderAddress)).to.equal(usdcIn);
    expect(await f.nara.balanceOf(f.traderAddress)).to.equal(0n);
    expect(await f.usdc.balanceOf(f.routerAddress)).to.equal(0n);
    expect(await f.nara.balanceOf(f.routerAddress)).to.equal(naraOut);
    expect(await f.trader.assertAllowanceClean()).to.equal(true);
  });

  it("rejects unauthorized control and unbounded or non-atomic call counts", async function () {
    const f = await fixture();
    const expiry = await deadline(f.ethers);
    const oneCall = [{ commands: "0x10", inputs: [], deadline: expiry }];

    await expect(f.trader.connect(f.outsider).fund(0, 0))
      .to.be.revertedWithCustomError(f.trader, "AtomicTraderUnauthorized")
      .withArgs(f.outsider.address);
    await expect(f.trader.connect(f.outsider).executeAtomic([oneCall[0], oneCall[0]], 0, 0, expiry))
      .to.be.revertedWithCustomError(f.trader, "AtomicTraderUnauthorized")
      .withArgs(f.outsider.address);
    await expect(f.trader.executeAtomic(oneCall, 0, 0, expiry))
      .to.be.revertedWithCustomError(f.trader, "AtomicTraderInvalidCallCount")
      .withArgs(1);
  });
});
