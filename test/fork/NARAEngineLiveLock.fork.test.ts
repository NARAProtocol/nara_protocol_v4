/**
 * Base-mainnet fork recovery proof for the deployed v4 engine.
 *
 * No production transaction is sent. The test forks current Base state,
 * impersonates the documented treasury holder, clears the real backlog in
 * bounded batches, creates a 1 NARA raw position, advances through activation,
 * and claims NARA emissions end to end.
 */
import { expect } from "chai";
import hre from "hardhat";

const NARA = "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A";
const ENGINE = "0xbC2492BA73dE35d1114b5c18d7db633aca8963c9";
const TREASURY_HOLDER = "0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e";
const ONE_NARA = 10n ** 18n;

const ENGINE_ABI = [
  "function currentEpoch() view returns (uint64)",
  "function epochState() view returns (tuple(uint64 epoch,uint64 timestamp,uint256 circulatingSupply,uint256 totalLocked,uint256 activeTotalWeight,uint256 weightedLockShareWad,uint256 stressWad,uint256 betaWad,uint256 horizon,uint256 retentionWad,uint256 baseEmission,uint256 emission,uint256 admittedSupply,uint256 distributedNara,uint256 distributedEth,uint256 treasuryAmount,uint256 warmupFactorWad,uint256 bootstrapWeight,uint256 heartbeat))",
  "function rewardReserveAvailable() view returns (uint256)",
  "function nextPositionId() view returns (uint256)",
  "function lockFeeWei() view returns (uint96)",
  "function EPOCH_LENGTH() view returns (uint64)",
  "function advanceEpochs(uint256 maxSteps) returns (uint256,tuple(uint64,uint64,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))",
  "function lock(uint256 amount,uint64 durationEpochs,uint256 minWeight) payable returns (uint256 positionId)",
  "function claimableRewards(uint256 positionId) view returns (uint256 naraAmount,uint256 ethAmount)",
  "function claimRewards(uint256 positionId,address to) returns (uint256 naraAmount,uint256 ethAmount)",
];
const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
];

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

(hasRpc ? describe : describe.skip)("deployed NARA v4 engine - Base fork lock recovery", function () {
  it("clears the live backlog, locks 1 NARA, accrues, and claims", async function () {
    this.timeout(600_000);
    const { ethers } = await hre.network.connect("baseFork");
    await ethers.provider.send("hardhat_impersonateAccount", [TREASURY_HOLDER]);
    await ethers.provider.send("hardhat_setBalance", [
      TREASURY_HOLDER,
      ethers.toQuantity(ethers.parseEther("1")),
    ]);
    const treasury = await ethers.getSigner(TREASURY_HOLDER);
    const engine = new ethers.Contract(ENGINE, ENGINE_ABI, treasury);
    const nara = new ethers.Contract(NARA, ERC20_ABI, treasury);

    expect(await engine.rewardReserveAvailable()).to.be.greaterThan(0n);
    expect(await nara.balanceOf(TREASURY_HOLDER)).to.be.greaterThanOrEqual(ONE_NARA);

    let live = await engine.currentEpoch() as bigint;
    let state = await engine.epochState() as { epoch: bigint };
    let batches = 0;
    while (state.epoch < live) {
      const backlog = live - state.epoch;
      const steps = backlog < 100n ? backlog : 100n;
      // Supplying the limit avoids repeating every epoch transition during
      // eth_estimateGas against the remote fork before executing it locally.
      await (await engine.advanceEpochs(steps, { gasLimit: 10_000_000n })).wait();
      batches += 1;
      expect(batches).to.be.lessThan(10);
      live = await engine.currentEpoch() as bigint;
      state = await engine.epochState() as { epoch: bigint };
    }
    expect(state.epoch).to.equal(live);

    const positionId = await engine.nextPositionId() as bigint;
    const lockFeeWei = await engine.lockFeeWei() as bigint;
    await (await nara.approve(ENGINE, ONE_NARA)).wait();
    await (await engine.lock(ONE_NARA, 96n, 0n, { value: lockFeeWei })).wait();
    expect(await engine.nextPositionId()).to.equal(positionId + 1n);

    const epochLength = await engine.EPOCH_LENGTH() as bigint;
    await ethers.provider.send("evm_increaseTime", [Number(epochLength * 10n + 1n)]);
    await ethers.provider.send("evm_mine", []);
    live = await engine.currentEpoch() as bigint;
    state = await engine.epochState() as { epoch: bigint };
    await (await engine.advanceEpochs(live - state.epoch, { gasLimit: 10_000_000n })).wait();

    const [claimable] = await engine.claimableRewards(positionId) as [bigint, bigint];
    expect(claimable).to.be.greaterThan(0n);
    const balanceBefore = await nara.balanceOf(TREASURY_HOLDER) as bigint;
    await (await engine.claimRewards(positionId, TREASURY_HOLDER)).wait();
    const balanceAfter = await nara.balanceOf(TREASURY_HOLDER) as bigint;
    expect(balanceAfter - balanceBefore).to.equal(claimable);
  });
});
