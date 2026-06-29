import hre from "hardhat";
import { expect } from "chai";

const ONE = 10n ** 18n;

async function deployFixture() {
  const { ethers } = await hre.network.connect();
  const [deployer, treasury] = await ethers.getSigners();

  const Engine = await ethers.getContractFactory("MockStatsEngineV1", deployer);
  const engine: any = await Engine.deploy();
  await engine.waitForDeployment();

  const Lens = await ethers.getContractFactory("NARAProtocolStatsLensV1", deployer);
  const lens: any = await Lens.deploy(await engine.getAddress());
  await lens.waitForDeployment();

  return { ethers, deployer, treasury, engine, lens };
}

describe("NARAProtocolStatsLensV1", () => {
  it("rejects a zero or non-contract engine", async () => {
    const { ethers, deployer } = await deployFixture();
    const Lens = await ethers.getContractFactory("NARAProtocolStatsLensV1", deployer);
    await expect(Lens.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      Lens,
      "NARAProtocolStatsLensV1__ZeroAddress",
    );
    await expect(Lens.deploy(await deployer.getAddress())).to.be.revertedWithCustomError(
      Lens,
      "NARAProtocolStatsLensV1__NotAContract",
    );
  });

  it("surfaces all-time real-yield and participation headline stats in one call", async () => {
    const { engine, lens, treasury } = await deployFixture();
    const treasuryAddr = await treasury.getAddress();

    await engine.set(120n, 118n, treasuryAddr, 700_000n * ONE, 4_200n * ONE, 51n, 110_000n * ONE, 50n * ONE);
    await engine.setTotals(42n * ONE, 40n * ONE, 3n * ONE, 9_000n * ONE, 8_500n * ONE, ONE / 2n);
    await engine.setReserves(500_000n * ONE, 150_000n * ONE);

    const s = await lens.getProtocolStats();

    expect(s.statsVersion).to.equal(1n);
    expect(s.currentEpoch).to.equal(120n);
    expect(s.settledEpoch).to.equal(118n);
    expect(s.epochLength).to.equal(900n);
    expect(s.treasury).to.equal(treasuryAddr);

    expect(s.totalLocked).to.equal(700_000n * ONE);
    expect(s.activeTotalWeight).to.equal(4_200n * ONE);
    expect(s.totalPositionsCreated).to.equal(50n); // nextPositionId 51 - 1
    expect(s.circulatingSupply).to.equal(110_000n * ONE);

    // The credibility numbers.
    expect(s.ethDistributedToLockersAllTime).to.equal(42n * ONE);
    expect(s.ethClaimedByLockersAllTime).to.equal(40n * ONE);
    expect(s.ethToTreasuryAllTime).to.equal(3n * ONE);
    expect(s.naraEmittedAllTime).to.equal(9_000n * ONE);
    expect(s.naraClaimedAllTime).to.equal(8_500n * ONE);
    expect(s.pendingEthNextEpoch).to.equal(ONE / 2n);

    // Runway = (emissionReserve + rewardReserveAvailable) / currentEpochEmission.
    expect(s.emissionReserveAvailable).to.equal(500_000n * ONE);
    expect(s.rewardReserveAvailable).to.equal(150_000n * ONE);
    expect(s.currentEpochEmission).to.equal(50n * ONE);
    expect(s.emissionRunwayEpochs).to.equal((500_000n + 150_000n) / 50n); // 13_000 epochs
  });

  it("reports zero runway when current emission is zero (no divide-by-zero)", async () => {
    const { engine, lens, treasury } = await deployFixture();
    await engine.set(1n, 1n, await treasury.getAddress(), 0n, 0n, 1n, 0n, 0n); // emission 0
    await engine.setReserves(650_000n * ONE, 0n);
    const s = await lens.getProtocolStats();
    expect(s.emissionRunwayEpochs).to.equal(0n);
    expect(s.totalPositionsCreated).to.equal(0n); // nextPositionId 1 - 1
  });
});
