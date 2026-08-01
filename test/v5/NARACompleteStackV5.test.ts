import { expect } from "chai";
import hre from "hardhat";

const ONE = 10n ** 18n;
const TOKEN_SUPPLY = 1_000_003n * ONE;
const BASE_SUPPLY = 10_000_000n * 10n ** 6n;
const RESERVE_ALLOCATION = 400_001n * ONE;
const SQRT_PRICE_1_1 = 1n << 96n;
const FEES = [1_500, 1_250, 1_000, 750, 500] as const;
const THRESHOLDS = [1_000n, 1_500n, 2_000n, 3_000n, 5_000n] as const;
const TICK_LOWER = -120;
const TICK_UPPER = 120;

describe("NARA V5 complete-stack binding", function () {
  it("routes prospective dual-currency Hook fees through the real Vault into real Engine positions", async function () {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [admin, operations, recovery, treasury, alice, keeper] = await ethers.getSigners();
    const latest = await ethers.provider.getBlock("latest");
    const epochOrigin = BigInt(latest!.timestamp) + 60n;

    const token = await ethers.deployContract("NARATokenV5", [
      "NARA V5 integration",
      "NARA5I",
      18,
      TOKEN_SUPPLY,
      treasury.address,
    ]);
    const base = await ethers.deployContract("NARATokenV5", [
      "Integration USDC",
      "iUSDC",
      6,
      BASE_SUPPLY,
      treasury.address,
    ]);
    await Promise.all([token.waitForDeployment(), base.waitForDeployment()]);
    const tokenAddress = await token.getAddress();
    const baseAddress = await base.getAddress();

    const reserve = await ethers.deployContract("NARARewardReserveV5", [
      admin.address,
      recovery.address,
      tokenAddress,
      RESERVE_ALLOCATION,
    ]);
    await reserve.waitForDeployment();
    const engine = await ethers.deployContract("NARAEngineV5", [
      admin.address,
      tokenAddress,
      baseAddress,
      await reserve.getAddress(),
      recovery.address,
      {
        epochOrigin,
        // Keep this fee-routing integration below the first Engine epoch while
        // the independent liquidity controller advances its 60-second
        // observation clock. Reserve-emission accounting is covered by the
        // dedicated core suite and would otherwise contaminate the exact
        // dual-currency fee assertion below.
        epochLength: 3_600,
        minLockDuration: 3_600,
        maxLockDuration: 7_200,
        maxAdvancePerCall: 64,
        minWeightMultiplierWad: ONE,
        maxWeightMultiplierWad: 4n * ONE,
        emissionPerEpoch: ONE,
        emissionBootstrapWeight: 10_000n * ONE,
        minimumRewardWeight: 100n * ONE,
      },
    ]);
    await engine.waitForDeployment();

    const renderer = await ethers.deployContract("NARACanonicalPositionRendererV5", [
      "NARA V5 integration position",
      "Integration-only metadata",
      "data:image/svg+xml;base64,",
    ]);
    await renderer.waitForDeployment();
    const positions = await ethers.deployContract("NARAPositionNFTV5", [
      await engine.getAddress(),
      await renderer.getAddress(),
      "NARA V5 Integration Positions",
      "NARA5IP",
    ]);
    await positions.waitForDeployment();

    const poolManager = await ethers.deployContract("MockLiquidityPoolManagerV5", [
      tokenAddress,
      baseAddress,
    ]);
    const positionManager = await ethers.deployContract("MockNamedPositionManagerV5");
    await Promise.all([poolManager.waitForDeployment(), positionManager.waitForDeployment()]);
    const vault = await ethers.deployContract("NARALiquidityGrowthVaultV5", [
      admin.address,
      recovery.address,
      tokenAddress,
      baseAddress,
      await poolManager.getAddress(),
      2_000,
    ]);
    await vault.waitForDeployment();

    await engine.connect(admin).bindPositionController(await positions.getAddress());
    await engine.connect(admin).bindLiquidityFeeVault(await vault.getAddress());
    await reserve.connect(admin).bindEngine(await engine.getAddress());
    await token.connect(treasury).approve(await reserve.getAddress(), RESERVE_ALLOCATION);
    await reserve.connect(treasury).fund(RESERVE_ALLOCATION);
    await reserve.connect(admin).seal();
    await engine.connect(admin).sealConfiguration();

    const hook = await ethers.deployContract("MockLiquidityHookLifecycleV5", [
      tokenAddress,
      baseAddress,
      await poolManager.getAddress(),
      await vault.getAddress(),
    ]);
    await hook.waitForDeployment();
    const hookAddress = await hook.getAddress();
    const [currency0, currency1] = BigInt(tokenAddress) < BigInt(baseAddress)
      ? [tokenAddress, baseAddress]
      : [baseAddress, tokenAddress];
    const poolKey = { currency0, currency1, fee: 3_000, tickSpacing: 60, hooks: hookAddress };
    const poolId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)"],
      [poolKey],
    ));
    const scheduleHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint16[]", "uint128[]"],
      [FEES, THRESHOLDS],
    ));

    const seedCustody = await ethers.deployContract("NARASeedPOLCustodyV5", [
      admin.address,
      recovery.address,
      await positionManager.getAddress(),
      poolId,
      TICK_LOWER,
      TICK_UPPER,
      0,
      3_600,
    ]);
    await seedCustody.waitForDeployment();
    const compounder = await ethers.deployContract("NARALiquidityCompounderV5", [
      admin.address,
      operations.address,
      recovery.address,
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
      0,
      3_600,
    ]);
    await compounder.waitForDeployment();
    const controller = await ethers.deployContract("NARALiquidityPhaseControllerV5", [
      admin.address,
      recovery.address,
      await poolManager.getAddress(),
      await positionManager.getAddress(),
      await vault.getAddress(),
      await seedCustody.getAddress(),
      await compounder.getAddress(),
      poolId,
      scheduleHash,
      [60, 60, 60, 60],
      [2, 2, 2, 2],
      0,
      3_600,
    ]);
    await controller.waitForDeployment();
    await hook.bind(await controller.getAddress(), poolId, scheduleHash, THRESHOLDS);
    const adapter = await ethers.deployContract("MockLiquidityPositionAdapterV5", [
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
    ]);
    await adapter.waitForDeployment();

    const seedTokenId = await positionManager.nextTokenId();
    await positionManager.mintNamedPosition(
      await seedCustody.getAddress(),
      poolKey,
      TICK_LOWER,
      TICK_UPPER,
      THRESHOLDS[0],
    );
    await seedCustody.registerPosition(seedTokenId);
    await seedCustody.sealConfiguration(hookAddress, await controller.getAddress());
    await compounder.sealConfiguration(hookAddress, await controller.getAddress(), await adapter.getAddress());
    await vault.sealConfiguration(
      hookAddress,
      await controller.getAddress(),
      await compounder.getAddress(),
      await engine.getAddress(),
    );
    await poolManager.setPoolState(poolId, SQRT_PRICE_1_1, 0, 10_000);
    await controller.sealConfiguration(hookAddress);

    const beforeOpen = await ethers.provider.getBlock("latest");
    if (BigInt(beforeOpen!.timestamp) < epochOrigin) {
      await connection.provider.send("evm_setNextBlockTimestamp", [Number(epochOrigin)]);
      await connection.provider.send("evm_mine", []);
    }
    const principal = 10_000n * ONE;
    await token.connect(treasury).transfer(alice.address, principal);
    await token.connect(alice).approve(await positions.getAddress(), principal);
    const predictedPositionId = (await engine.positionCount()) + 1n;
    await positions.connect(alice).mintPosition(alice.address, principal, 3_600);
    expect(await positions.ownerOf(predictedPositionId)).to.equal(alice.address);
    const account = await positions.accountFor(predictedPositionId);
    expect(await positions.isCanonicalAccount(account)).to.equal(true);
    expect((await engine.positionState(predictedPositionId)).owner).to.equal(account);

    async function fundAndRecord(tokenFee: bigint, baseFee: bigint, phase: number, label: string) {
      const poolManagerAddress = await poolManager.getAddress();
      await token.connect(treasury).approve(poolManagerAddress, tokenFee);
      await base.connect(treasury).approve(poolManagerAddress, baseFee);
      await poolManager.connect(treasury).fundClaimsForTest(await vault.getAddress(), tokenAddress, tokenFee);
      await poolManager.connect(treasury).fundClaimsForTest(await vault.getAddress(), baseAddress, baseFee);
      await hook.recordFees({
        poolId,
        swapCaller: keeper.address,
        inputCurrency: baseAddress,
        outputCurrency: tokenAddress,
        grossInput: baseFee + 10_000n,
        inputFee: baseFee,
        grossOutput: tokenFee + 10_000n,
        outputFee: tokenFee,
        feeBps: FEES[phase],
        phase,
        isBuy: true,
      });
      return ethers.keccak256(ethers.toUtf8Bytes(label));
    }

    await fundAndRecord(100n, 100n, 0, "bootstrap");
    expect(await vault.bootstrapTokenLiquidityClassified()).to.equal(100n);
    expect(await vault.tokenEngineClaimsReleased()).to.equal(0n);

    await positionManager.setLiquidityForTest(seedTokenId, THRESHOLDS[1]);
    await controller.observeNextPhase();
    const observation = await controller.phaseObservation(1);
    await connection.provider.send("evm_setNextBlockTimestamp", [Number(observation.startedAt) + 60]);
    await controller.observeNextPhase();
    await controller.advanceQualifiedPhase();
    expect(await hook.currentPhase()).to.equal(1);
    expect(await vault.routingState()).to.equal(2);

    const engineReceipt = await fundAndRecord(1_000n, 1_000n, 1, "shared");
    expect(await vault.sharedTokenEngineClassified()).to.equal(200n);
    expect(await vault.sharedBaseEngineClassified()).to.equal(200n);
    expect(await vault.sharedTokenEngineActiveAccounted()).to.equal(200n);
    expect(await vault.sharedBaseEngineActiveAccounted()).to.equal(200n);
    expect(await engine.pendingActiveNaraFeeFunding()).to.equal(200n);
    expect(await engine.pendingActiveBaseFeeFunding()).to.equal(200n);
    await engine.syncLiquidityFeeBacking();
    expect(await engine.pendingActiveNaraFeeFunding()).to.equal(0n);
    expect(await engine.pendingActiveBaseFeeFunding()).to.equal(0n);
    expect(await engine.totalLiquidityNaraFeesReceived()).to.equal(200n);
    expect(await engine.totalLiquidityBaseFeesReceived()).to.equal(200n);
    expect(await token.allowance(await vault.getAddress(), await engine.getAddress())).to.equal(0n);
    expect(await base.allowance(await vault.getAddress(), await engine.getAddress())).to.equal(0n);

    const naraClaimable = await engine.claimableToken(predictedPositionId, tokenAddress);
    const baseClaimable = await engine.claimableToken(predictedPositionId, baseAddress);
    // RAY index division may leave at most sub-unit scaled dust accounted in
    // the Engine; it must never be silently discarded or overpaid.
    expect(naraClaimable).to.be.at.least(199n);
    expect(naraClaimable).to.be.at.most(200n);
    expect(baseClaimable).to.be.at.least(199n);
    expect(baseClaimable).to.be.at.most(200n);
    const naraBefore = await token.balanceOf(alice.address);
    const baseBefore = await base.balanceOf(alice.address);
    await positions.connect(alice).claimPosition(
      predictedPositionId,
      alice.address,
      [tokenAddress, baseAddress],
    );
    expect(await token.balanceOf(alice.address)).to.equal(naraBefore + naraClaimable);
    expect(await base.balanceOf(alice.address)).to.equal(baseBefore + baseClaimable);
    const naraAccounting = await engine.rewardAccounting(tokenAddress);
    const baseAccounting = await engine.rewardAccounting(baseAddress);
    expect(naraAccounting.totalReceived).to.equal(200n);
    expect(naraAccounting.totalClaimed).to.equal(naraClaimable);
    expect(baseAccounting.totalReceived).to.equal(200n);
    expect(baseAccounting.totalClaimed).to.equal(baseClaimable);
    expect(naraAccounting.conserved).to.equal(true);
    expect(baseAccounting.conserved).to.equal(true);
    expect(await vault.bootstrapTokenLiquidityClassified()).to.equal(100n);
    expect(await vault.bootstrapBaseLiquidityClassified()).to.equal(100n);
  });
});
