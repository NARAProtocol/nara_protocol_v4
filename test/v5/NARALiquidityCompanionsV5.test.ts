import { expect } from "chai";
import hre from "hardhat";

const SQRT_PRICE_1_1 = 1n << 96n;
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;
const FEES = [1_500, 1_250, 1_000, 750, 500];
const THRESHOLDS = [1_000n, 1_250n, 1_500n, 1_750n, 2_000n];
const TICK_LOWER = -120;
const TICK_UPPER = 120;
const REHEARSAL = 0;
const PRODUCTION = 1;
const ONE_HOUR = 3_600;
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const ONE = 10n ** 18n;
const REAL_ENGINE_SUPPLY = 1_000_000n * ONE;
const REAL_ENGINE_RESERVE = 100_000n * ONE;

function receipt(label: string, ethers: any): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

async function setNextTimestamp(provider: any, timestamp: bigint | number) {
  await provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
}

async function deployFixture(
  options: {
    engineShareBps?: number;
    seedLiquidity?: bigint;
    useRealEngine?: boolean;
  } = {}
) {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [
    configurationAuthority,
    operationsAuthority,
    recoverySafe,
    user,
    attacker,
  ] = await ethers.getSigners();

  const token = await ethers.deployContract("MockERC20", [
    "NARA V5",
    "NARA",
    18,
  ]);
  const base = await ethers.deployContract("MockERC20", [
    "USD Coin",
    "USDC",
    6,
  ]);
  await Promise.all([token.waitForDeployment(), base.waitForDeployment()]);
  const tokenAddress = await token.getAddress();
  const baseAddress = await base.getAddress();

  const poolManager = await ethers.deployContract(
    "MockLiquidityPoolManagerV5",
    [tokenAddress, baseAddress]
  );
  const positionManager = await ethers.deployContract(
    "MockNamedPositionManagerV5"
  );
  await Promise.all([
    poolManager.waitForDeployment(),
    positionManager.waitForDeployment(),
  ]);

  const vault = await ethers.deployContract("NARALiquidityGrowthVaultV5", [
    configurationAuthority.address,
    recoverySafe.address,
    tokenAddress,
    baseAddress,
    await poolManager.getAddress(),
    options.engineShareBps ?? 2_000,
  ]);
  await vault.waitForDeployment();

  const hook = await ethers.deployContract("MockLiquidityHookLifecycleV5", [
    tokenAddress,
    baseAddress,
    await poolManager.getAddress(),
    await vault.getAddress(),
  ]);
  await hook.waitForDeployment();
  const hookAddress = await hook.getAddress();

  const [currency0, currency1] =
    BigInt(tokenAddress) < BigInt(baseAddress)
      ? [tokenAddress, baseAddress]
      : [baseAddress, tokenAddress];
  const poolKey = {
    currency0,
    currency1,
    fee: 3_000,
    tickSpacing: 60,
    hooks: hookAddress,
  };
  const poolId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
      ],
      [poolKey]
    )
  );
  const scheduleHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint16[]", "uint128[]"],
      [FEES, THRESHOLDS]
    )
  );

  const seedCustody = await ethers.deployContract("NARASeedPOLCustodyV5", [
    configurationAuthority.address,
    recoverySafe.address,
    await positionManager.getAddress(),
    poolId,
    TICK_LOWER,
    TICK_UPPER,
    REHEARSAL,
    ONE_HOUR,
  ]);
  await seedCustody.waitForDeployment();

  const compounder = await ethers.deployContract("NARALiquidityCompounderV5", [
    configurationAuthority.address,
    operationsAuthority.address,
    recoverySafe.address,
    tokenAddress,
    baseAddress,
    await poolManager.getAddress(),
    await positionManager.getAddress(),
    await vault.getAddress(),
    poolId,
    TICK_LOWER,
    TICK_UPPER,
    1,
    1,
    REHEARSAL,
    ONE_HOUR,
  ]);
  await compounder.waitForDeployment();

  const controller = await ethers.deployContract(
    "NARALiquidityPhaseControllerV5",
    [
      configurationAuthority.address,
      recoverySafe.address,
      await poolManager.getAddress(),
      await positionManager.getAddress(),
      await vault.getAddress(),
      await seedCustody.getAddress(),
      await compounder.getAddress(),
      poolId,
      scheduleHash,
      [60, 60, 60, 60],
      [2, 2, 2, 2],
      REHEARSAL,
      ONE_HOUR,
    ]
  );
  await controller.waitForDeployment();
  await hook.bind(
    await controller.getAddress(),
    poolId,
    scheduleHash,
    THRESHOLDS
  );

  const adapter = await ethers.deployContract(
    "MockLiquidityPositionAdapterV5",
    [
      tokenAddress,
      baseAddress,
      await poolManager.getAddress(),
      await positionManager.getAddress(),
      await compounder.getAddress(),
      poolKey,
      TICK_LOWER,
      TICK_UPPER,
      5_000,
      5_000,
    ]
  );
  let engine: any;
  let engineReserve: any;
  let enginePositionController: any;
  let engineOrigin = 0n;
  if (options.useRealEngine) {
    await token.mint(configurationAuthority.address, REAL_ENGINE_SUPPLY);
    await base.mint(configurationAuthority.address, 1_000_000n * 10n ** 6n);
    const latest = await ethers.provider.getBlock("latest");
    engineOrigin = BigInt(latest!.timestamp) + 300n;
    engineReserve = await ethers.deployContract("NARARewardReserveV5", [
      configurationAuthority.address,
      recoverySafe.address,
      tokenAddress,
      REAL_ENGINE_RESERVE,
    ]);
    await engineReserve.waitForDeployment();
    engine = await ethers.deployContract("NARAEngineV5", [
      configurationAuthority.address,
      tokenAddress,
      baseAddress,
      await engineReserve.getAddress(),
      recoverySafe.address,
      {
        epochOrigin: engineOrigin,
        epochLength: 3_600,
        minLockDuration: 3_600,
        maxLockDuration: 7_200,
        maxAdvancePerCall: 64,
        minWeightMultiplierWad: ONE,
        maxWeightMultiplierWad: ONE,
        emissionPerEpoch: ONE,
        emissionBootstrapWeight: 100n * ONE,
        minimumRewardWeight: 100n * ONE,
      },
    ]);
    await engine.waitForDeployment();
    enginePositionController = await ethers.deployContract(
      "NARAPositionControllerBindingHarnessV5",
      [await engine.getAddress(), tokenAddress]
    );
    await enginePositionController.waitForDeployment();
    await engine
      .connect(configurationAuthority)
      .bindPositionController(await enginePositionController.getAddress());
    await engine
      .connect(configurationAuthority)
      .bindLiquidityFeeVault(await vault.getAddress());
    await engineReserve
      .connect(configurationAuthority)
      .bindEngine(await engine.getAddress());
    await token
      .connect(configurationAuthority)
      .approve(await engineReserve.getAddress(), REAL_ENGINE_RESERVE);
    await engineReserve
      .connect(configurationAuthority)
      .fund(REAL_ENGINE_RESERVE);
    await engineReserve.connect(configurationAuthority).seal();
    await engine.connect(configurationAuthority).sealConfiguration();
  } else {
    engine = await ethers.deployContract("MockLiquidityFeeEngineV5", [
      tokenAddress,
      baseAddress,
      await vault.getAddress(),
    ]);
    await engine.waitForDeployment();
  }
  await adapter.waitForDeployment();

  const seedTokenId = await positionManager.nextTokenId();
  await positionManager.mintNamedPosition(
    await seedCustody.getAddress(),
    poolKey,
    TICK_LOWER,
    TICK_UPPER,
    options.seedLiquidity ?? THRESHOLDS[0]
  );
  await seedCustody.registerPosition(seedTokenId);
  await seedCustody.sealConfiguration(
    hookAddress,
    await controller.getAddress()
  );
  await compounder.sealConfiguration(
    hookAddress,
    await controller.getAddress(),
    await adapter.getAddress()
  );
  await vault.sealConfiguration(
    hookAddress,
    await controller.getAddress(),
    await compounder.getAddress(),
    await engine.getAddress()
  );
  await poolManager.setPoolState(poolId, SQRT_PRICE_1_1, 0, 10_000);
  await controller.sealConfiguration(hookAddress);

  return {
    connection,
    ethers,
    configurationAuthority,
    operationsAuthority,
    recoverySafe,
    user,
    attacker,
    token,
    base,
    poolManager,
    positionManager,
    vault,
    hook,
    seedCustody,
    compounder,
    controller,
    adapter,
    engine,
    engineReserve,
    enginePositionController,
    engineOrigin,
    tokenAddress,
    baseAddress,
    poolKey,
    poolId,
    scheduleHash,
    seedTokenId,
  };
}

async function recordFees(
  f: Awaited<ReturnType<typeof deployFixture>>,
  label: string,
  tokenFee: bigint,
  baseFee: bigint,
  isBuy = true
) {
  await f.poolManager.mintClaimsForTest(
    await f.vault.getAddress(),
    f.tokenAddress,
    tokenFee
  );
  await f.poolManager.mintClaimsForTest(
    await f.vault.getAddress(),
    f.baseAddress,
    baseFee
  );
  const phase = Number(await f.hook.currentPhase());
  const inputCurrency = isBuy ? f.baseAddress : f.tokenAddress;
  const outputCurrency = isBuy ? f.tokenAddress : f.baseAddress;
  const inputFee = isBuy ? baseFee : tokenFee;
  const outputFee = isBuy ? tokenFee : baseFee;
  await f.hook.recordFees({
    poolId: f.poolId,
    swapCaller: f.user.address,
    inputCurrency,
    outputCurrency,
    grossInput: inputFee + 10_000n,
    inputFee,
    grossOutput: outputFee + 10_000n,
    outputFee,
    feeBps: FEES[phase],
    phase,
    isBuy,
  });
  return receipt(label, f.ethers);
}

async function qualifyFirstPhase(f: Awaited<ReturnType<typeof deployFixture>>) {
  await f.positionManager.setLiquidityForTest(f.seedTokenId, THRESHOLDS[1]);
  await f.controller.observeNextPhase();
  const first = await f.controller.phaseObservation(1);
  await setNextTimestamp(f.connection.provider, BigInt(first.startedAt) + 60n);
  await f.controller.observeNextPhase();
  await f.controller.advanceQualifiedPhase();
}

describe("NARA V5 liquidity companions", function () {
  it("enforces the disposable one-hour and production seven-day recovery domains", async function () {
    const f = await deployFixture();
    const Factory = await f.ethers.getContractFactory("NARASeedPOLCustodyV5");
    const args = [
      f.configurationAuthority.address,
      f.recoverySafe.address,
      await f.positionManager.getAddress(),
      f.poolId,
      TICK_LOWER,
      TICK_UPPER,
    ] as const;
    await expect(
      Factory.deploy(...args, REHEARSAL, ONE_HOUR + 1)
    ).to.be.revertedWithCustomError(f.seedCustody, "InvalidRecoveryDelay");
    await expect(
      Factory.deploy(...args, PRODUCTION, SEVEN_DAYS - 1)
    ).to.be.revertedWithCustomError(f.seedCustody, "InvalidRecoveryDelay");
    const production = await Factory.deploy(
      ...args,
      PRODUCTION,
      SEVEN_DAYS + 1
    );
    await production.waitForDeployment();
    expect(await production.recoveryDelay()).to.equal(SEVEN_DAYS + 1);
    expect(await production.deploymentDomain()).to.equal(PRODUCTION);
  });

  it("classifies Bootstrap fees 100% to liquidity and moves one way into Shared", async function () {
    const f = await deployFixture({ engineShareBps: 2_000 });
    await recordFees(f, "bootstrap-a", 101n, 203n, true);
    await recordFees(f, "bootstrap-b", 17n, 29n, false);

    expect(await f.vault.bootstrapTokenLiquidityClassified()).to.equal(118n);
    expect(await f.vault.bootstrapBaseLiquidityClassified()).to.equal(232n);
    expect(await f.vault.sharedTokenEngineClassified()).to.equal(0n);
    expect(await f.vault.sharedBaseEngineClassified()).to.equal(0n);

    await qualifyFirstPhase(f);
    expect(await f.hook.currentPhase()).to.equal(1);
    expect(await f.vault.routingState()).to.equal(2);

    await recordFees(f, "shared-a", 3n, 7n, true);
    await recordFees(f, "shared-b", 4n, 6n, false);
    expect(await f.vault.sharedTokenAccrued()).to.equal(7n);
    expect(await f.vault.sharedBaseAccrued()).to.equal(13n);
    expect(await f.vault.sharedTokenEngineClassified()).to.equal(1n);
    expect(await f.vault.sharedBaseEngineClassified()).to.equal(2n);
    expect(await f.vault.sharedTokenEngineActiveAccounted()).to.equal(1n);
    expect(await f.vault.sharedBaseEngineActiveAccounted()).to.equal(2n);
    expect(await f.vault.sharedTokenLiquidityClassified()).to.equal(6n);
    expect(await f.vault.sharedBaseLiquidityClassified()).to.equal(11n);
    expect(await f.vault.bootstrapTokenLiquidityClassified()).to.equal(118n);
    expect(await f.vault.bootstrapBaseLiquidityClassified()).to.equal(232n);
    expect(await f.vault.totalTokenFeeRecorded()).to.equal(125n);
    expect(await f.vault.totalBaseFeeRecorded()).to.equal(245n);
  });

  it("uses cumulative telescoping so split records cannot change Engine allocation and dust stays liquidity", async function () {
    const split = await deployFixture({ engineShareBps: 2_000 });
    await qualifyFirstPhase(split);
    for (let i = 0; i < 10; i += 1) {
      await recordFees(split, `split-${i}`, 1n, 1n, i % 2 === 0);
    }
    expect(await split.vault.sharedTokenEngineClassified()).to.equal(2n);
    expect(await split.vault.sharedBaseEngineClassified()).to.equal(2n);
    expect(await split.vault.sharedTokenLiquidityClassified()).to.equal(8n);
    expect(await split.vault.sharedBaseLiquidityClassified()).to.equal(8n);

    const single = await deployFixture({ engineShareBps: 2_000 });
    await qualifyFirstPhase(single);
    await recordFees(single, "single", 10n, 10n, true);
    expect(await single.vault.sharedTokenEngineClassified()).to.equal(
      await split.vault.sharedTokenEngineClassified()
    );
    expect(await single.vault.sharedBaseEngineClassified()).to.equal(
      await split.vault.sharedBaseEngineClassified()
    );
  });

  it("redeems classified PoolManager claims exactly once and banks one-sided flow", async function () {
    const f = await deployFixture();
    await recordFees(f, "fees", 100n, 80n, true);
    const pullReceipt = receipt("pull-a", f.ethers);
    await f.compounder
      .connect(f.operationsAuthority)
      .pullLiquidityClaims(pullReceipt, 60, 0);
    expect(await f.token.balanceOf(await f.compounder.getAddress())).to.equal(
      60n
    );
    expect(await f.base.balanceOf(await f.compounder.getAddress())).to.equal(
      0n
    );
    expect(
      await f.poolManager.balanceOf(
        await f.vault.getAddress(),
        BigInt(f.tokenAddress)
      )
    ).to.equal(40n);
    expect(await f.vault.tokenLiquidityClaimsReleased()).to.equal(60n);
    await expect(
      f.compounder
        .connect(f.operationsAuthority)
        .pullLiquidityClaims(pullReceipt, 1, 0)
    ).to.be.revertedWithCustomError(f.compounder, "ReceiptAlreadyProcessed");
    await expect(
      f.compounder
        .connect(f.attacker)
        .pullLiquidityClaims(receipt("unauthorized", f.ethers), 1, 0)
    ).to.be.revertedWithCustomError(f.compounder, "Unauthorized");
  });

  it("enforces both usage floors, compounds through exact allowances, and keeps remainders banked", async function () {
    const f = await deployFixture();
    await recordFees(f, "fees", 100n, 80n, true);
    await f.compounder
      .connect(f.operationsAuthority)
      .pullLiquidityClaims(receipt("pull", f.ethers), 100, 80);
    expect(await f.compounder.configuredMinimumNaraUsed()).to.equal(1n);
    expect(await f.compounder.configuredMinimumBaseUsed()).to.equal(1n);
    expect(await f.adapter.configuredMinimumNaraUsed()).to.equal(1n);
    expect(await f.adapter.configuredMinimumBaseUsed()).to.equal(1n);
    await expect(
      f.compounder
        .connect(f.operationsAuthority)
        .compoundBanked(
          receipt("below-floor", f.ethers),
          100,
          80,
          0,
          1,
          1,
          2n ** 63n
        )
    ).to.be.revertedWithCustomError(
      f.compounder,
      "MinimumUsageBelowConfiguration"
    );
    await expect(
      f.compounder
        .connect(f.operationsAuthority)
        .compoundBanked(
          receipt("tight-nara", f.ethers),
          100,
          80,
          51,
          40,
          1,
          2n ** 63n
        )
    ).to.be.revertedWithCustomError(f.adapter, "Slippage");
    await f.compounder
      .connect(f.operationsAuthority)
      .compoundBanked(
        receipt("compound", f.ethers),
        100,
        80,
        50,
        40,
        1,
        2n ** 63n
      );

    const compounderAddress = await f.compounder.getAddress();
    const adapterAddress = await f.adapter.getAddress();
    const positionTokenId = await f.compounder.positionTokenId();
    expect(positionTokenId).not.to.equal(0n);
    expect(await f.positionManager.ownerOf(positionTokenId)).to.equal(
      compounderAddress
    );
    expect(
      await f.positionManager.getPositionLiquidity(positionTokenId)
    ).to.equal(40n);
    expect(await f.token.balanceOf(compounderAddress)).to.equal(50n);
    expect(await f.base.balanceOf(compounderAddress)).to.equal(40n);
    expect(await f.token.allowance(compounderAddress, adapterAddress)).to.equal(
      0n
    );
    expect(await f.base.allowance(compounderAddress, adapterAddress)).to.equal(
      0n
    );
    expect(await f.compounder.totalNaraAdded()).to.equal(50n);
    expect(await f.compounder.totalBaseAdded()).to.equal(40n);
  });

  it("counts only exact named, owned, in-range positions and ignores third-party liquidity", async function () {
    const f = await deployFixture();
    expect(await f.controller.activeProtocolLiquidity()).to.equal(
      THRESHOLDS[0]
    );
    await f.positionManager.mintNamedPosition(
      f.attacker.address,
      f.poolKey,
      TICK_LOWER,
      TICK_UPPER,
      1_000_000
    );
    expect(await f.controller.activeProtocolLiquidity()).to.equal(
      THRESHOLDS[0]
    );
    await f.poolManager.setPoolState(
      f.poolId,
      SQRT_PRICE_1_1,
      TICK_UPPER,
      1_010_000
    );
    expect(await f.controller.activeProtocolLiquidity()).to.equal(0n);
    await f.poolManager.setPoolState(f.poolId, SQRT_PRICE_1_1, 0, 1_010_000);
    expect(await f.controller.activeProtocolLiquidity()).to.equal(
      THRESHOLDS[0]
    );
  });

  it("requires spaced observations, resets a failed threshold, and advances only one fixed phase", async function () {
    const f = await deployFixture();
    expect(await f.controller.observeNextPhase.staticCall()).to.equal(false);
    await f.controller.observeNextPhase();
    await f.positionManager.setLiquidityForTest(f.seedTokenId, THRESHOLDS[1]);
    await f.controller.observeNextPhase();
    await expect(f.controller.observeNextPhase()).to.be.revertedWithCustomError(
      f.controller,
      "ObservationTooSoon"
    );
    const observation = await f.controller.phaseObservation(1);
    await setNextTimestamp(
      f.connection.provider,
      BigInt(observation.startedAt) + 59n
    );
    await expect(
      f.controller.advanceQualifiedPhase()
    ).to.be.revertedWithCustomError(f.controller, "ObservationIncomplete");
    await setNextTimestamp(
      f.connection.provider,
      BigInt(observation.startedAt) + 60n
    );
    await f.controller.observeNextPhase();
    await f.controller.advanceQualifiedPhase();
    expect(await f.hook.currentPhase()).to.equal(1);
    expect(await f.vault.routingState()).to.equal(2);
    await expect(
      f.controller.advanceQualifiedPhase()
    ).to.be.revertedWithCustomError(f.controller, "ObservationIncomplete");
  });

  it("cannot accrue or consume phase observations before Hook activation", async function () {
    const f = await deployFixture();
    await f.hook.setPoolActiveForTest(false);
    await f.positionManager.setLiquidityForTest(f.seedTokenId, THRESHOLDS[1]);

    await expect(f.controller.observeNextPhase()).to.be.revertedWithCustomError(
      f.controller,
      "PoolNotActive"
    );
    await expect(
      f.controller.advanceQualifiedPhase()
    ).to.be.revertedWithCustomError(f.controller, "PoolNotActive");
    expect((await f.controller.phaseObservation(1)).count).to.equal(0n);

    await f.hook.setPoolActiveForTest(true);
    await f.controller.observeNextPhase();
    expect((await f.controller.phaseObservation(1)).count).to.equal(1n);
  });

  it("clears pending phase evidence when retirement is queued and restarts after cancellation", async function () {
    const f = await deployFixture();
    await f.positionManager.setLiquidityForTest(f.seedTokenId, THRESHOLDS[1]);
    await f.controller.observeNextPhase();
    expect((await f.controller.phaseObservation(1)).count).to.equal(1n);

    await expect(f.controller.connect(f.recoverySafe).proposeRetirement())
      .to.emit(f.controller, "PhaseObservationCleared")
      .withArgs(1);
    expect((await f.controller.phaseObservation(1)).count).to.equal(0n);
    await expect(f.controller.observeNextPhase()).to.be.revertedWithCustomError(
      f.controller,
      "RetirementAlreadyPending"
    );

    const eta = await f.controller.retirementEta();
    await setNextTimestamp(f.connection.provider, eta - 1n);
    await f.controller.connect(f.recoverySafe).cancelRetirement();
    await expect(
      f.controller.advanceQualifiedPhase()
    ).to.be.revertedWithCustomError(f.controller, "ObservationIncomplete");

    await f.controller.observeNextPhase();
    const restarted = await f.controller.phaseObservation(1);
    await setNextTimestamp(
      f.connection.provider,
      BigInt(restarted.startedAt) + 60n
    );
    await f.controller.observeNextPhase();
    await f.controller.advanceQualifiedPhase();
    expect(await f.hook.currentPhase()).to.equal(1n);
  });

  it("retires atomically at ETA, settles both classifications, and cannot reactivate", async function () {
    const f = await deployFixture({ engineShareBps: 2_000 });
    await recordFees(f, "bootstrap", 100n, 80n, true);
    await f.compounder
      .connect(f.operationsAuthority)
      .pullLiquidityClaims(receipt("pull", f.ethers), 40, 40);
    await f.compounder
      .connect(f.operationsAuthority)
      .compoundBanked(
        receipt("compound", f.ethers),
        40,
        40,
        1,
        1,
        1,
        2n ** 63n
      );
    const compounderPositionId = await f.compounder.positionTokenId();
    await f.positionManager.setLiquidityForTest(f.seedTokenId, THRESHOLDS[1]);
    await qualifyFirstPhase(f);
    await recordFees(f, "shared-before", 11n, 13n, false);

    await f.controller.connect(f.recoverySafe).proposeRetirement();
    const eta = await f.controller.retirementEta();
    expect(await f.seedCustody.recoveryEta()).to.equal(eta);
    expect(await f.compounder.recoveryEta()).to.equal(eta);
    await recordFees(f, "shared-during-delay", 9n, 7n, true);

    await setNextTimestamp(f.connection.provider, eta - 1n);
    await expect(
      f.controller.executeRetirement()
    ).to.be.revertedWithCustomError(f.controller, "RetirementNotReady");
    await setNextTimestamp(f.connection.provider, eta);
    await f.controller.connect(f.attacker).executeRetirement();

    expect(await f.hook.poolRetired()).to.equal(true);
    expect(await f.vault.routingState()).to.equal(3);
    expect(await f.controller.retired()).to.equal(true);
    expect(await f.seedCustody.retired()).to.equal(true);
    expect(await f.compounder.retired()).to.equal(true);
    expect(await f.positionManager.ownerOf(f.seedTokenId)).to.equal(
      f.recoverySafe.address
    );
    expect(await f.positionManager.ownerOf(compounderPositionId)).to.equal(
      f.recoverySafe.address
    );
    expect(await f.vault.allClassifiedClaimsProcessed()).to.equal(true);
    expect(await f.engine.totalLiquidityNaraFeesReceived()).to.equal(4n);
    expect(await f.engine.totalLiquidityBaseFeesReceived()).to.equal(4n);
    expect(await f.token.balanceOf(f.recoverySafe.address)).to.be.greaterThan(
      0n
    );
    expect(await f.base.balanceOf(f.recoverySafe.address)).to.be.greaterThan(
      0n
    );
    await expect(
      f.controller.executeRetirement()
    ).to.be.revertedWithCustomError(f.controller, "NoPendingRetirement");
    await expect(recordFees(f, "post-retire", 1n, 1n, true)).to.be.rejected;
  });

  it("lets the Engine pull all backing without consuming the future retirement receipt", async function () {
    const f = await deployFixture({ engineShareBps: 2_000 });
    await qualifyFirstPhase(f);
    await recordFees(f, "shared-domain-separation", 10n, 10n, true);
    expect(await f.vault.engineClaimsOutstanding()).to.deep.equal([2n, 2n]);

    await f.controller.connect(f.recoverySafe).proposeRetirement();
    const eta = await f.controller.retirementEta();
    const { chainId } = await f.ethers.provider.getNetwork();
    const retirementReceipt = f.ethers.keccak256(
      f.ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "uint256", "address", "uint64"],
        ["NARA_V5_RETIREMENT", chainId, await f.controller.getAddress(), eta]
      )
    );

    await f.engine.connect(f.attacker).syncLiquidityFeeBacking();
    expect(await f.engine.totalLiquidityNaraFeesReceived()).to.equal(2n);
    expect(await f.engine.totalLiquidityBaseFeesReceived()).to.equal(2n);
    expect(await f.vault.engineClaimsOutstanding()).to.deep.equal([0n, 0n]);
    expect(await f.vault.receiptProcessed(retirementReceipt, 3)).to.equal(
      false
    );

    await setNextTimestamp(f.connection.provider, eta);
    await f.controller.connect(f.attacker).executeRetirement();

    expect(await f.controller.retired()).to.equal(true);
    expect(await f.vault.allClassifiedClaimsProcessed()).to.equal(true);
    expect(await f.vault.receiptProcessed(retirementReceipt, 3)).to.equal(true);
    const retirementReplayKey = await f.vault.receiptReplayKey(
      retirementReceipt,
      3
    );
    expect(await f.vault.processedReceiptRoute(retirementReplayKey)).to.equal(
      3
    );
  });

  it("keeps real Vault backing equal to mixed Engine pending buckets through claims and retirement", async function () {
    const f = await deployFixture({
      engineShareBps: 2_000,
      useRealEngine: true,
    });
    await qualifyFirstPhase(f);

    const vaultAddress = await f.vault.getAddress();
    const engineAddress = await f.engine.getAddress();
    const tokenId = BigInt(f.tokenAddress);
    const baseId = BigInt(f.baseAddress);

    async function assertPendingBacking(label: string) {
      const [vaultNara, vaultBase] = await f.vault.engineClaimsOutstanding();
      const activeNara = await f.engine.pendingActiveNaraFeeFunding();
      const activeBase = await f.engine.pendingActiveBaseFeeFunding();
      const inactiveNara = await f.engine.pendingInactiveNaraFeeFunding();
      const inactiveBase = await f.engine.pendingInactiveBaseFeeFunding();
      expect(vaultNara, `${label}: Vault/Engine NARA pending`).to.equal(
        activeNara + inactiveNara
      );
      expect(vaultBase, `${label}: Vault/Engine base pending`).to.equal(
        activeBase + inactiveBase
      );

      const [liquidityNara, liquidityBase] =
        await f.vault.liquidityClaimsOutstanding();
      expect(
        await f.poolManager.balanceOf(vaultAddress, tokenId),
        `${label}: NARA claim backing`
      ).to.equal(liquidityNara + vaultNara);
      expect(
        await f.poolManager.balanceOf(vaultAddress, baseId),
        `${label}: base claim backing`
      ).to.equal(liquidityBase + vaultBase);
      return { activeNara, activeBase, inactiveNara, inactiveBase };
    }

    let randomState = 0x6a09e667f3bcc909n;
    function nextAmount(modulus: bigint) {
      randomState =
        (randomState * 6_364_136_223_846_793_005n +
          1_442_695_040_888_963_407n) &
        ((1n << 64n) - 1n);
      return (randomState % modulus) + 1n;
    }

    async function recordSequence(label: string, count: number) {
      let naraClassified = 0n;
      let baseClassified = 0n;
      for (let i = 0; i < count; i += 1) {
        const naraBefore = await f.vault.sharedTokenEngineClassified();
        const baseBefore = await f.vault.sharedBaseEngineClassified();
        await recordFees(
          f,
          `${label}-${i}`,
          nextAmount(97n),
          nextAmount(89n),
          i % 2 === 0
        );
        const naraAfter = await f.vault.sharedTokenEngineClassified();
        const baseAfter = await f.vault.sharedBaseEngineClassified();
        naraClassified += naraAfter - naraBefore;
        baseClassified += baseAfter - baseBefore;
        await assertPendingBacking(`${label}-${i}`);
      }
      return { nara: naraClassified, base: baseClassified };
    }

    async function openPosition(signer: any) {
      const principal = 100n * ONE;
      await f.enginePositionController.setCanonicalAccount(
        signer.address,
        true
      );
      await f.token
        .connect(f.configurationAuthority)
        .transfer(signer.address, principal);
      await f.token.connect(signer).approve(engineAddress, principal);
      const positionId = (await f.engine.positionCount()) + 1n;
      await f.engine
        .connect(signer)
        .openPosition(signer.address, principal, 7_200);
      return positionId;
    }

    // Both fee legs are mandatory at the production Vault boundary. Invalid
    // zero-leg records must leave all classifications and pending buckets unchanged.
    const recordedBeforeZero = [
      await f.vault.totalTokenFeeRecorded(),
      await f.vault.totalBaseFeeRecorded(),
    ];
    const zeroRecord = {
      poolId: f.poolId,
      swapCaller: f.user.address,
      inputCurrency: f.baseAddress,
      outputCurrency: f.tokenAddress,
      grossInput: 10_000n,
      inputFee: 0n,
      grossOutput: 10_001n,
      outputFee: 1n,
      feeBps: FEES[1],
      phase: 1,
      isBuy: true,
    };
    await expect(f.hook.recordFees(zeroRecord)).to.be.revertedWithCustomError(
      f.vault,
      "InvalidRecord"
    );
    await expect(
      f.hook.recordFees({
        ...zeroRecord,
        grossInput: 10_001n,
        inputFee: 1n,
        grossOutput: 10_000n,
        outputFee: 0n,
      })
    ).to.be.revertedWithCustomError(f.vault, "InvalidRecord");
    expect(await f.vault.totalTokenFeeRecorded()).to.equal(
      recordedBeforeZero[0]
    );
    expect(await f.vault.totalBaseFeeRecorded()).to.equal(
      recordedBeforeZero[1]
    );
    await assertPendingBacking("rejected-zero-records");

    // With no eligible weight, every telescoped Engine share is pinned
    // inactive. A position opened later cannot capture it when its claim
    // self-funds all pending backing.
    const firstInactive = await recordSequence("no-weight", 9);
    let buckets = await assertPendingBacking("no-weight-final");
    expect(buckets.activeNara).to.equal(0n);
    expect(buckets.activeBase).to.equal(0n);
    expect(buckets.inactiveNara).to.equal(firstInactive.nara);
    expect(buckets.inactiveBase).to.equal(firstInactive.base);

    await f.enginePositionController.setCanonicalAccount(f.user.address, true);
    await f.token
      .connect(f.configurationAuthority)
      .transfer(f.user.address, 100n * ONE);
    await f.token.connect(f.user).approve(engineAddress, 100n * ONE);
    await setNextTimestamp(f.connection.provider, f.engineOrigin);
    const firstPositionId = (await f.engine.positionCount()) + 1n;
    await f.engine
      .connect(f.user)
      .openPosition(f.user.address, 100n * ONE, 7_200);

    const recoveryNaraBefore = await f.token.balanceOf(f.recoverySafe.address);
    const recoveryBaseBefore = await f.base.balanceOf(f.recoverySafe.address);
    const lateLockerBaseBefore = await f.base.balanceOf(f.user.address);
    await f.engine
      .connect(f.user)
      .claimPosition(firstPositionId, f.user.address, [
        f.tokenAddress,
        f.baseAddress,
      ]);
    expect(
      (await f.base.balanceOf(f.user.address)) - lateLockerBaseBefore
    ).to.equal(0n);
    expect(
      (await f.token.balanceOf(f.recoverySafe.address)) - recoveryNaraBefore
    ).to.equal(firstInactive.nara);
    expect(
      (await f.base.balanceOf(f.recoverySafe.address)) - recoveryBaseBefore
    ).to.equal(firstInactive.base);
    buckets = await assertPendingBacking("first-claim-sync");
    expect(buckets.activeNara + buckets.inactiveNara).to.equal(0n);
    expect(buckets.activeBase + buckets.inactiveBase).to.equal(0n);

    // Repeated active records remain exactly backed until the position claim
    // atomically pulls the complete batch.
    const firstActive = await recordSequence("active", 13);
    buckets = await assertPendingBacking("active-final");
    expect(buckets.activeNara).to.equal(firstActive.nara);
    expect(buckets.activeBase).to.equal(firstActive.base);
    expect(buckets.inactiveNara + buckets.inactiveBase).to.equal(0n);
    const firstActiveNaraClaim = await f.engine.claimableToken(
      firstPositionId,
      f.tokenAddress
    );
    const firstActiveBaseClaim = await f.engine.claimableToken(
      firstPositionId,
      f.baseAddress
    );
    const firstNaraBefore = await f.token.balanceOf(f.user.address);
    const firstBaseBefore = await f.base.balanceOf(f.user.address);
    await f.engine
      .connect(f.user)
      .claimPosition(firstPositionId, f.user.address, [
        f.tokenAddress,
        f.baseAddress,
      ]);
    expect(
      (await f.token.balanceOf(f.user.address)) - firstNaraBefore
    ).to.equal(firstActiveNaraClaim);
    expect((await f.base.balanceOf(f.user.address)) - firstBaseBefore).to.equal(
      firstActiveBaseClaim
    );
    buckets = await assertPendingBacking("active-claim-sync");
    expect(buckets.activeNara + buckets.inactiveNara).to.equal(0n);
    expect(buckets.activeBase + buckets.inactiveBase).to.equal(0n);

    // Leave one active batch pending, cross an Engine epoch without
    // processing it, then append an inactive batch. The Vault outstanding
    // amounts must equal the sum of both Engine bucket classes throughout.
    const historicalActive = await recordSequence("historical-active", 7);
    await setNextTimestamp(f.connection.provider, f.engineOrigin + 3_601n);
    const staleInactive = await recordSequence("stale-inactive", 8);
    buckets = await assertPendingBacking("mixed-active-inactive");
    expect(buckets.activeNara).to.equal(historicalActive.nara);
    expect(buckets.activeBase).to.equal(historicalActive.base);
    expect(buckets.inactiveNara).to.equal(staleInactive.nara);
    expect(buckets.inactiveBase).to.equal(staleInactive.base);

    await f.engine.advanceEpochs(64);
    const secondPositionId = await openPosition(f.attacker);
    expect(
      await f.engine.claimableToken(secondPositionId, f.baseAddress)
    ).to.equal(0n);
    const secondRecoveryNaraBefore = await f.token.balanceOf(
      f.recoverySafe.address
    );
    const secondRecoveryBaseBefore = await f.base.balanceOf(
      f.recoverySafe.address
    );
    const secondBaseBefore = await f.base.balanceOf(f.attacker.address);
    await f.engine
      .connect(f.attacker)
      .claimPosition(secondPositionId, f.attacker.address, [f.baseAddress]);
    expect(
      (await f.base.balanceOf(f.attacker.address)) - secondBaseBefore
    ).to.equal(0n);
    expect(
      (await f.token.balanceOf(f.recoverySafe.address)) -
        secondRecoveryNaraBefore
    ).to.equal(staleInactive.nara);
    expect(
      (await f.base.balanceOf(f.recoverySafe.address)) -
        secondRecoveryBaseBefore
    ).to.equal(staleInactive.base);
    buckets = await assertPendingBacking("later-locker-claim-sync");
    expect(buckets.activeNara + buckets.inactiveNara).to.equal(0n);
    expect(buckets.activeBase + buckets.inactiveBase).to.equal(0n);

    // The final active batch is not claimed. Controller retirement must
    // perform the exact Engine pull before retiring and settling the Vault.
    const retirementActive = await recordSequence("retirement-active", 11);
    buckets = await assertPendingBacking("pre-retirement");
    expect(buckets.activeNara).to.equal(retirementActive.nara);
    expect(buckets.activeBase).to.equal(retirementActive.base);
    const activeNaraFundedBefore = await f.engine.totalActiveNaraFeesFunded();
    const activeBaseFundedBefore = await f.engine.totalActiveBaseFeesFunded();

    await f.controller.connect(f.recoverySafe).proposeRetirement();
    const eta = await f.controller.retirementEta();
    await setNextTimestamp(f.connection.provider, eta);
    await f.controller.executeRetirement();

    buckets = await assertPendingBacking("post-retirement");
    expect(buckets.activeNara + buckets.inactiveNara).to.equal(0n);
    expect(buckets.activeBase + buckets.inactiveBase).to.equal(0n);
    expect(
      (await f.engine.totalActiveNaraFeesFunded()) - activeNaraFundedBefore
    ).to.equal(retirementActive.nara);
    expect(
      (await f.engine.totalActiveBaseFeesFunded()) - activeBaseFundedBefore
    ).to.equal(retirementActive.base);
    expect(await f.vault.engineClaimsOutstanding()).to.deep.equal([0n, 0n]);
    expect(await f.vault.liquidityClaimsOutstanding()).to.deep.equal([0n, 0n]);
    expect(await f.vault.allClassifiedClaimsProcessed()).to.equal(true);
    expect(await f.poolManager.balanceOf(vaultAddress, tokenId)).to.equal(0n);
    expect(await f.poolManager.balanceOf(vaultAddress, baseId)).to.equal(0n);
  });

  it("keeps seal, state-transition, recovery, and release authority fail-closed", async function () {
    const f = await deployFixture();
    await expect(
      f.vault
        .connect(f.attacker)
        .sealConfiguration(
          await f.hook.getAddress(),
          await f.controller.getAddress(),
          await f.compounder.getAddress(),
          await f.engine.getAddress()
        )
    ).to.be.revertedWithCustomError(f.vault, "Unauthorized");
    await expect(
      f.vault
        .connect(f.configurationAuthority)
        .sealConfiguration(
          await f.hook.getAddress(),
          await f.controller.getAddress(),
          await f.compounder.getAddress(),
          await f.engine.getAddress()
        )
    ).to.be.revertedWithCustomError(f.vault, "AlreadySealed");
    await expect(
      f.controller.connect(f.attacker).proposeRetirement()
    ).to.be.revertedWithCustomError(f.controller, "Unauthorized");
    await expect(
      f.seedCustody.connect(f.attacker).queueRecovery()
    ).to.be.revertedWithCustomError(f.seedCustody, "Unauthorized");
    await expect(
      f.vault
        .connect(f.attacker)
        .releaseLiquidityClaims(receipt("bad", f.ethers), 1, 0)
    ).to.be.revertedWithCustomError(f.vault, "Unauthorized");
    await expect(
      f.vault.connect(f.attacker).releaseAllEngineClaimsToEngine()
    ).to.be.revertedWithCustomError(f.vault, "Unauthorized");
    expect(await f.vault.configurationHash()).not.to.equal(ZERO_BYTES32);
    expect(await f.controller.configurationHash()).not.to.equal(ZERO_BYTES32);
    expect(await f.seedCustody.configurationHash()).not.to.equal(ZERO_BYTES32);
    expect(await f.compounder.configurationHash()).not.to.equal(ZERO_BYTES32);
  });
});
