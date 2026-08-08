import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";

const ONE = 10n ** 18n;
const MAX_SUPPLY = 1_000_000n * ONE;

const EPOCH_SECONDS = 900n;
const CONFIG_DELAY = 3600n;
const INITIAL_BASE = ONE / 2n;
const TOKEN_NAME = "NARA";
const TOKEN_SYMBOL = "NARA";

const ENGINE_CONFIG_TYPE =
  "tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64)";

function defaultEngineConfig(ethers: any) {
  return {
    eMax: ethers.parseUnits("1000000", 18),
    beta0Wad: ethers.parseUnits("0.008", 18),
    mWad: ethers.parseUnits("0.25", 18),
    aWad: ethers.parseUnits("1.25", 18),
    bWad: ethers.parseUnits("0.90", 18),
    cWad: ethers.parseUnits("0.50", 18),
    dWad: ethers.parseUnits("0.50", 18),
    dripSplitWad: ethers.parseUnits("0.85", 18),
    durationLinearWad: ethers.parseUnits("0.8", 18),
    durationQuadraticWad: ethers.parseUnits("0.9", 18),
    growthFactorWad: ethers.parseUnits("1.000104", 18),
    minBaseEmission: ethers.parseUnits("0.2", 18),
    maxBaseEmission: ethers.parseUnits("5", 18),
    warmupRateWad: ethers.parseUnits("0.00133", 18),
    bootstrapInitialWeight: ethers.parseUnits("10000000", 18),
    bootstrapDecayWad: ethers.parseUnits("0.9991", 18),
    activationDelayEpochs: 3n,
    maxLockEpochs: 35040n,
  };
}

function configAsTuple(cfg: ReturnType<typeof defaultEngineConfig>): any[] {
  return [
    cfg.eMax,
    cfg.beta0Wad,
    cfg.mWad,
    cfg.aWad,
    cfg.bWad,
    cfg.cWad,
    cfg.dWad,
    cfg.dripSplitWad,
    cfg.durationLinearWad,
    cfg.durationQuadraticWad,
    cfg.growthFactorWad,
    cfg.minBaseEmission,
    cfg.maxBaseEmission,
    cfg.warmupRateWad,
    cfg.bootstrapInitialWeight,
    cfg.bootstrapDecayWad,
    cfg.activationDelayEpochs,
    cfg.maxLockEpochs,
  ];
}

async function buildEngineCreationCode(
  ethers: any,
  admin: string,
  epochLength: bigint,
  configDelay: bigint,
  initialBaseEmission: bigint,
  cfg: ReturnType<typeof defaultEngineConfig>,
): Promise<string> {
  const artifact = await hre.artifacts.readArtifact("contracts/v4/NARAEngine.sol:NARAEngine");
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint64", "uint64", "uint256", ENGINE_CONFIG_TYPE],
    [admin, epochLength, configDelay, initialBaseEmission, configAsTuple(cfg)],
  );
  return artifact.bytecode + encoded.slice(2);
}

async function mineTime(ethers: any, seconds: bigint) {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

async function launchSystem(ethers: any, deployer: Signer, treasury: Signer) {
  const deployerAddr = await deployer.getAddress();
  const treasuryAddr = await treasury.getAddress();

  const launcher = await ethers.deployContract("NARALauncher", [deployerAddr], deployer);
  await launcher.waitForDeployment();

  const cfg = defaultEngineConfig(ethers);
  const code = await buildEngineCreationCode(
    ethers,
    deployerAddr,
    EPOCH_SECONDS,
    CONFIG_DELAY,
    INITIAL_BASE,
    cfg,
  );
  const salt = ethers.keccak256(ethers.toUtf8Bytes("NARA-V4-OPS-ROUTER-TEST"));
  await launcher.connect(deployer).launch(treasuryAddr, code, salt, TOKEN_NAME, TOKEN_SYMBOL);

  const tokenAddr = await launcher.deployedToken();
  const engineAddr = await launcher.deployedEngine();
  const token = await ethers.getContractAt("contracts/v4/NARAToken.sol:NARAToken", tokenAddr);
  const engine = await ethers.getContractAt("contracts/v4/NARAEngine.sol:NARAEngine", engineAddr);

  await engine.connect(deployer).setTreasury(treasuryAddr);
  await token.connect(treasury).approve(engineAddr, MAX_SUPPLY);
  await engine.connect(treasury).depositRewards(100_000n * ONE);

  return { token, engine, tokenAddr, engineAddr, cfg };
}

async function deployOpsRouter(
  ethers: any,
  engine: any,
  engineAddr: string,
  deployer: Signer,
  paramOperator: Signer,
  treasuryOperator: Signer,
) {
  const router = await ethers.deployContract(
    "NARAEngineOpsRouterV1",
    [engineAddr, await paramOperator.getAddress(), await treasuryOperator.getAddress()],
    deployer,
  );
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();

  await engine.connect(deployer).grantRole(ethers.id("PARAM_ROLE"), routerAddr);
  await engine.connect(deployer).grantRole(ethers.id("TREASURY_ROLE"), routerAddr);

  return { router, routerAddr };
}

describe("NARAEngineOpsRouterV1", () => {
  let ethers: any;
  let deployer: Signer;
  let treasury: Signer;
  let ops: Signer;
  let alice: Signer;

  before(async () => {
    ({ ethers } = await hre.network.connect());
    [deployer, treasury, ops, alice] = await ethers.getSigners();
  });

  it("wraps proposeConfig with an observed event and matching engine state", async () => {
    const { engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
    const { router } = await deployOpsRouter(ethers, engine, engineAddr, deployer, ops, ops);
    const cfg2 = defaultEngineConfig(ethers);
    cfg2.bWad = ethers.parseUnits("0.80", 18);

    const configHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode([ENGINE_CONFIG_TYPE], [configAsTuple(cfg2)]),
    );

    const tx = await router.connect(ops).proposeConfig(cfg2);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const expectedExecutableAt = BigInt(block.timestamp) + CONFIG_DELAY;

    await expect(tx)
      .to.emit(router, "EngineConfigProposedObserved")
      .withArgs(await ops.getAddress(), configHash, expectedExecutableAt);
    expect(await engine.pendingConfigTimestamp()).to.equal(expectedExecutableAt);
  });

  it("wraps executeConfig and cancelConfig with observed events", async () => {
    const { engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
    const { router } = await deployOpsRouter(ethers, engine, engineAddr, deployer, ops, ops);
    const cfg2 = defaultEngineConfig(ethers);
    cfg2.bWad = ethers.parseUnits("0.80", 18);

    await router.connect(ops).proposeConfig(cfg2);
    await mineTime(ethers, CONFIG_DELAY + 1n);

    const stagedEpoch = (await engine.currentEpoch()) + 1n;
    await expect(router.connect(ops).executeConfig())
      .to.emit(router, "EngineConfigStagedObserved")
      .withArgs(await ops.getAddress(), stagedEpoch);
    expect(await engine.stagedConfigEpoch()).to.equal(stagedEpoch);

    await expect(router.connect(ops).cancelConfig())
      .to.emit(router, "EngineConfigCancelledObserved")
      .withArgs(await ops.getAddress());
    expect(await engine.pendingConfigTimestamp()).to.equal(0n);
    expect(await engine.stagedConfigEpoch()).to.equal(0n);
  });

  it("wraps treasury ETH fee withdrawals and keeps no ETH", async () => {
    const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
    const { router, routerAddr } = await deployOpsRouter(ethers, engine, engineAddr, deployer, ops, ops);
    const fee = 10n ** 14n;
    const amount = 100n * ONE;

    await engine.connect(deployer).setLockEthFee(fee);
    await token.connect(treasury).transfer(await alice.getAddress(), amount);
    await token.connect(alice).approve(engineAddr, amount);
    await engine.connect(alice).lock(amount, 50n, 0n, { value: fee });

    const treasuryBefore = await ethers.provider.getBalance(await treasury.getAddress());
    const tx = await router.connect(ops).withdrawTreasuryEthFees(await treasury.getAddress());
    await expect(tx)
      .to.emit(router, "TreasuryEthFeesWithdrawnObserved")
      .withArgs(await ops.getAddress(), await treasury.getAddress(), fee);

    expect(await engine.accumulatedTreasuryEthFees()).to.equal(0n);
    expect((await ethers.provider.getBalance(await treasury.getAddress())) - treasuryBefore).to.equal(fee);
    expect(await ethers.provider.getBalance(routerAddr)).to.equal(0n);
  });

  it("wraps depositRewards and keeps no NARA", async () => {
    const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
    const { router, routerAddr } = await deployOpsRouter(ethers, engine, engineAddr, deployer, ops, ops);
    const amount = 1_000n * ONE;
    const beforeTracked = await engine.trackedEmissionReserve();

    await token.connect(treasury).transfer(await ops.getAddress(), amount);
    await token.connect(ops).approve(routerAddr, amount);

    await expect(router.connect(ops).depositRewards(amount))
      .to.emit(router, "EmissionReserveDepositedObserved")
      .withArgs(await ops.getAddress(), amount, beforeTracked + amount);

    expect(await engine.trackedEmissionReserve()).to.equal(beforeTracked + amount);
    expect(await token.balanceOf(routerAddr)).to.equal(0n);
    expect(await token.allowance(routerAddr, engineAddr)).to.equal(0n);
  });

  it("wraps syncEmissionReserve and reports the tracked reserve delta", async () => {
    const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
    const { router, routerAddr } = await deployOpsRouter(ethers, engine, engineAddr, deployer, ops, ops);
    const amount = 7n * ONE;
    const beforeTracked = await engine.trackedEmissionReserve();

    await token.connect(treasury).transfer(engineAddr, amount);
    expect(await engine.trackedEmissionReserve()).to.equal(beforeTracked);

    await expect(router.connect(ops).syncEmissionReserve())
      .to.emit(router, "EmissionReserveSyncedObserved")
      .withArgs(await ops.getAddress(), amount, beforeTracked + amount);

    expect(await engine.trackedEmissionReserve()).to.equal(beforeTracked + amount);
    expect(await token.balanceOf(routerAddr)).to.equal(0n);
  });

  it("rejects unauthorized router callers", async () => {
    const { engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
    const { router } = await deployOpsRouter(ethers, engine, engineAddr, deployer, ops, ops);
    const cfg2 = defaultEngineConfig(ethers);
    cfg2.bWad = ethers.parseUnits("0.80", 18);

    await expect(router.connect(alice).proposeConfig(cfg2))
      .to.be.revertedWithCustomError(router, "OpsRouterUnauthorized")
      .withArgs(await alice.getAddress());
    await expect(router.connect(alice).withdrawTreasuryEthFees(await treasury.getAddress()))
      .to.be.revertedWithCustomError(router, "OpsRouterUnauthorized")
      .withArgs(await alice.getAddress());
    await expect(router.connect(alice).syncEmissionReserve())
      .to.be.revertedWithCustomError(router, "OpsRouterUnauthorized")
      .withArgs(await alice.getAddress());
  });

  it("leaves direct engine calls available for break glass and distinguishable from router calls", async () => {
    const { engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
    const { router, routerAddr } = await deployOpsRouter(ethers, engine, engineAddr, deployer, ops, ops);
    const cfg2 = defaultEngineConfig(ethers);
    cfg2.bWad = ethers.parseUnits("0.80", 18);

    await expect(engine.connect(alice).proposeConfig(cfg2))
      .to.be.revertedWithCustomError(engine, "AccessControlUnauthorizedAccount")
      .withArgs(await alice.getAddress(), ethers.id("PARAM_ROLE"));

    const tx = await engine.connect(deployer).proposeConfig(cfg2);
    const receipt = await tx.wait();
    expect(await engine.pendingConfigTimestamp()).to.be.gt(0n);
    expect(receipt.logs.some((log: any) => log.address.toLowerCase() === routerAddr.toLowerCase())).to.equal(false);

    const cfg3 = defaultEngineConfig(ethers);
    cfg3.bWad = ethers.parseUnits("0.70", 18);
    await engine.connect(deployer).cancelConfig();

    const routerTx = await router.connect(ops).proposeConfig(cfg3);
    const routerReceipt = await routerTx.wait();
    expect(
      routerReceipt.logs.some((log: any) => log.address.toLowerCase() === routerAddr.toLowerCase()),
    ).to.equal(true);
  });

  it("rejects ETH sent directly to the router", async () => {
    const { engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
    const { router, routerAddr } = await deployOpsRouter(ethers, engine, engineAddr, deployer, ops, ops);

    await expect(
      ops.sendTransaction({ to: routerAddr, value: 1n }),
    ).to.be.revertedWithCustomError(router, "OpsRouterEthRejected");
    expect(await ethers.provider.getBalance(routerAddr)).to.equal(0n);
  });
});
