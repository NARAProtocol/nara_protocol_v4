import { expect } from "chai";
import hre from "hardhat";

const ONE = 10n ** 18n;
const BASE_ONE = 10n ** 6n;
const RAY = 10n ** 27n;
const TOKEN_SUPPLY = 1_000_000n * ONE;
const BASE_SUPPLY = 1_000_000_000n * BASE_ONE;
const RESERVE_ALLOCATION = 100_000n * ONE;
const EPOCH = 60n;
const MIN_LOCK = 600n;
const MAX_LOCK = 3_600n;

type DeployOptions = {
  emissionPerEpoch?: bigint;
  maxAdvancePerCall?: number;
  minMultiplier?: bigint;
  maxMultiplier?: bigint;
  emissionBootstrapWeight?: bigint;
  minimumRewardWeight?: bigint;
  blockingBase?: boolean;
};

async function deployUnsealed(options: DeployOptions = {}) {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const [admin, recovery, treasury, alice, bob, carol, outsider] =
    await ethers.getSigners();
  const latest = await ethers.provider.getBlock("latest");
  const origin = BigInt(latest!.timestamp) + 600n;

  const token = await ethers.deployContract("NARATokenV5", [
    "NARA Token V5",
    "NARA",
    18,
    TOKEN_SUPPLY,
    treasury.address,
  ]);
  await token.waitForDeployment();
  const base = options.blockingBase
    ? await ethers.deployContract("MockBlockingERC20V5", [
        "Test Base",
        "TBASE",
        6,
        BASE_SUPPLY,
        treasury.address,
        admin.address,
      ])
    : await ethers.deployContract("NARATokenV5", [
        "Test Base",
        "TBASE",
        6,
        BASE_SUPPLY,
        treasury.address,
      ]);
  await base.waitForDeployment();

  const reserve = await ethers.deployContract("NARARewardReserveV5", [
    admin.address,
    recovery.address,
    await token.getAddress(),
    RESERVE_ALLOCATION,
  ]);
  await reserve.waitForDeployment();

  const config = {
    epochOrigin: origin,
    epochLength: EPOCH,
    minLockDuration: MIN_LOCK,
    maxLockDuration: MAX_LOCK,
    maxAdvancePerCall: options.maxAdvancePerCall ?? 32,
    minWeightMultiplierWad: options.minMultiplier ?? ONE,
    maxWeightMultiplierWad: options.maxMultiplier ?? ONE,
    emissionPerEpoch: options.emissionPerEpoch ?? ONE,
    emissionBootstrapWeight: options.emissionBootstrapWeight ?? 100n * ONE,
    minimumRewardWeight: options.minimumRewardWeight ?? 100n * ONE,
  };
  const engine = await ethers.deployContract("NARAEngineV5", [
    admin.address,
    await token.getAddress(),
    await base.getAddress(),
    await reserve.getAddress(),
    recovery.address,
    config,
  ]);
  await engine.waitForDeployment();

  const controller = await ethers.deployContract(
    "NARAPositionControllerBindingHarnessV5",
    [await engine.getAddress(), await token.getAddress()],
  );
  await controller.waitForDeployment();
  const vault = await ethers.deployContract("NARALiquidityFeeVaultBindingHarnessV5", [
    await token.getAddress(),
    await base.getAddress(),
    await engine.getAddress(),
  ]);
  await vault.waitForDeployment();

  return {
    ethers,
    admin,
    recovery,
    treasury,
    alice,
    bob,
    carol,
    outsider,
    token,
    base,
    reserve,
    engine,
    controller,
    vault,
    config,
    origin,
  };
}

async function sealSystem(ctx: Awaited<ReturnType<typeof deployUnsealed>>) {
  const { admin, treasury, token, reserve, engine, controller, vault } = ctx;
  await engine.connect(admin).bindPositionController(await controller.getAddress());
  await engine.connect(admin).bindLiquidityFeeVault(await vault.getAddress());
  await reserve.connect(admin).bindEngine(await engine.getAddress());
  await token.connect(treasury).approve(await reserve.getAddress(), RESERVE_ALLOCATION);
  await reserve.connect(treasury).fund(RESERVE_ALLOCATION);
  await reserve.connect(admin).seal();
  await engine.connect(admin).sealConfiguration();
}

async function moveTo(ctx: Awaited<ReturnType<typeof deployUnsealed>>, timestamp: bigint) {
  await ctx.ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await ctx.ethers.provider.send("evm_mine", []);
}

async function fundAndOpen(
  ctx: Awaited<ReturnType<typeof deployUnsealed>>,
  signer: any,
  amount: bigint,
  duration: bigint = MIN_LOCK,
) {
  const { treasury, token, engine, controller } = ctx;
  await controller.setCanonicalAccount(signer.address, true);
  await token.connect(treasury).transfer(signer.address, amount);
  await token.connect(signer).approve(await engine.getAddress(), amount);
  const nextId = (await engine.positionCount()) + 1n;
  await engine.connect(signer).openPosition(signer.address, amount, duration);
  return nextId;
}

async function fundVaultBase(
  ctx: Awaited<ReturnType<typeof deployUnsealed>>,
  amount: bigint,
) {
  await ctx.base.connect(ctx.treasury).transfer(await ctx.vault.getAddress(), amount);
}

describe("NARA V5 fresh core", function () {
  describe("fixed-supply token", function () {
    it("mints exactly the explicit supply and has no post-construction mint surface", async function () {
      const { token, treasury, alice } = await deployUnsealed();
      expect(await token.name()).to.equal("NARA Token V5");
      expect(await token.symbol()).to.equal("NARA");
      expect(await token.decimals()).to.equal(18n);
      expect(await token.fixedSupply()).to.equal(TOKEN_SUPPLY);
      expect(await token.totalSupply()).to.equal(TOKEN_SUPPLY);
      expect(await token.balanceOf(treasury.address)).to.equal(TOKEN_SUPPLY);
      expect(token.interface.hasFunction("mint")).to.equal(false);

      await token.connect(treasury).transfer(alice.address, 123n);
      expect(await token.totalSupply()).to.equal(TOKEN_SUPPLY);
      expect(await token.DOMAIN_SEPARATOR()).to.not.equal("0x" + "00".repeat(32));
    });

    it("enforces hard metadata, decimal, supply, and recipient bounds", async function () {
      const { ethers, treasury } = await deployUnsealed();
      const Token = await ethers.getContractFactory("NARATokenV5");
      await expect(Token.deploy("", "NARA", 18, 1n, treasury.address))
        .to.be.revertedWithCustomError(Token, "InvalidMetadata");
      await expect(Token.deploy("NARA", "NARA", 19, 1n, treasury.address))
        .to.be.revertedWithCustomError(Token, "InvalidDecimals");
      await expect(Token.deploy("NARA", "NARA", 18, 0n, treasury.address))
        .to.be.revertedWithCustomError(Token, "InvalidSupply");
      await expect(Token.deploy("NARA", "NARA", 18, 1n, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(Token, "InvalidAddress");
    });
  });

  describe("reserve and reciprocal configuration", function () {
    it("binds and seals the exact funded reserve and complete Engine graph once", async function () {
      const ctx = await deployUnsealed();
      const { admin, token, reserve, engine, controller, vault, treasury } = ctx;

      await expect(engine.connect(admin).sealConfiguration())
        .to.be.revertedWithCustomError(engine, "InvalidBinding");
      await engine.connect(admin).bindPositionController(await controller.getAddress());
      await engine.connect(admin).bindLiquidityFeeVault(await vault.getAddress());
      await reserve.connect(admin).bindEngine(await engine.getAddress());
      await token.connect(treasury).approve(await reserve.getAddress(), RESERVE_ALLOCATION);
      await reserve.connect(treasury).fund(RESERVE_ALLOCATION - 1n);
      await expect(reserve.connect(admin).seal())
        .to.be.revertedWithCustomError(reserve, "FundingMismatch")
        .withArgs(RESERVE_ALLOCATION, RESERVE_ALLOCATION - 1n);
      await reserve.connect(treasury).fund(1n);
      await reserve.connect(admin).seal();
      await engine.connect(admin).sealConfiguration();

      expect(await reserve.configurationSealed()).to.equal(true);
      expect(await engine.configurationSealed()).to.equal(true);
      expect(await reserve.isValidFor(await token.getAddress(), await engine.getAddress()))
        .to.equal(true);
      expect(await reserve.configurationHash()).to.not.equal(ctx.ethers.ZeroHash);
      expect(await engine.configurationHash()).to.not.equal(ctx.ethers.ZeroHash);
      expect(await engine.token()).to.equal(await token.getAddress());
      expect(await engine.NARA()).to.equal(await token.getAddress());

      await expect(engine.connect(admin).bindPositionController(await controller.getAddress()))
        .to.be.revertedWithCustomError(engine, "AlreadySealed");
      await expect(reserve.connect(admin).bindEngine(await engine.getAddress()))
        .to.be.revertedWithCustomError(reserve, "AlreadySealed");
    });

    it("rejects unauthorized configuration, incomplete funding, and protected-token recovery", async function () {
      const ctx = await deployUnsealed();
      const { admin, outsider, recovery, reserve, engine, controller, token } = ctx;
      await expect(engine.connect(outsider).bindPositionController(await controller.getAddress()))
        .to.be.revertedWithCustomError(engine, "Unauthorized");
      await expect(reserve.connect(outsider).bindEngine(await engine.getAddress()))
        .to.be.revertedWithCustomError(reserve, "Unauthorized");
      await reserve.connect(admin).bindEngine(await engine.getAddress());
      await expect(reserve.connect(admin).seal())
        .to.be.revertedWithCustomError(reserve, "FundingMismatch");
      await expect(
        reserve.connect(recovery).recoverForeignToken(
          await token.getAddress(),
          recovery.address,
          1n,
        ),
      ).to.be.revertedWithCustomError(reserve, "ProtectedToken");
      await expect(reserve.connect(outsider).releaseToEngine(1n))
        .to.be.revertedWithCustomError(reserve, "NotSealed");
    });

    it("cannot be bricked by unsolicited NARA and recovers only proven excess", async function () {
      const ctx = await deployUnsealed();
      const { admin, recovery, treasury, token, reserve, engine } = ctx;
      await reserve.connect(admin).bindEngine(await engine.getAddress());
      await token.connect(treasury).approve(await reserve.getAddress(), RESERVE_ALLOCATION);
      await reserve.connect(treasury).fund(RESERVE_ALLOCATION);
      await token.connect(treasury).transfer(await reserve.getAddress(), 1n);

      await reserve.connect(admin).seal();
      expect(await reserve.availableRewards()).to.equal(RESERVE_ALLOCATION);
      await expect(reserve.connect(recovery).recoverExcessToken(recovery.address, 2n))
        .to.be.revertedWithCustomError(reserve, "InsufficientExcess")
        .withArgs(1n, 2n);
      await reserve.connect(recovery).recoverExcessToken(recovery.address, 1n);
      expect(await token.balanceOf(await reserve.getAddress())).to.equal(RESERVE_ALLOCATION);
    });

    it("rejects unbounded or internally inconsistent economic constructor inputs", async function () {
      const ctx = await deployUnsealed();
      const { ethers, admin, token, base, reserve, origin } = ctx;
      const Engine = await ethers.getContractFactory("NARAEngineV5");
      const badConfig = {
        epochOrigin: origin,
        epochLength: 59,
        minLockDuration: MIN_LOCK,
        maxLockDuration: MAX_LOCK,
        maxAdvancePerCall: 1,
        minWeightMultiplierWad: ONE,
        maxWeightMultiplierWad: ONE,
        emissionPerEpoch: ONE,
        emissionBootstrapWeight: 100n * ONE,
        minimumRewardWeight: 100n * ONE,
      };
      await expect(
        Engine.deploy(
          admin.address,
          await token.getAddress(),
          await base.getAddress(),
          await reserve.getAddress(),
          ctx.recovery.address,
          badConfig,
        ),
      ).to.be.revertedWithCustomError(Engine, "InvalidConfig");

      await expect(
        Engine.deploy(
          admin.address,
          await token.getAddress(),
          await base.getAddress(),
          await reserve.getAddress(),
          ctx.recovery.address,
          { ...ctx.config, emissionPerEpoch: 1n },
        ),
      ).to.be.revertedWithCustomError(Engine, "InvalidConfig");
      await expect(
        Engine.deploy(
          admin.address,
          await token.getAddress(),
          await base.getAddress(),
          await reserve.getAddress(),
          ctx.recovery.address,
          { ...ctx.config, minimumRewardWeight: TOKEN_SUPPLY + 1n },
        ),
      ).to.be.revertedWithCustomError(Engine, "InvalidConfig");
    });
  });

  describe("authorization and adapter invariants", function () {
    it("accepts only canonical accounts and only the sealed fee vault", async function () {
      const ctx = await deployUnsealed();
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);

      await ctx.token.connect(ctx.treasury).transfer(ctx.alice.address, 100n * ONE);
      await ctx.token.connect(ctx.alice).approve(await ctx.engine.getAddress(), 100n * ONE);
      await expect(
        ctx.engine.connect(ctx.alice).openPosition(ctx.alice.address, 100n * ONE, MIN_LOCK),
      ).to.be.revertedWithCustomError(ctx.engine, "Unauthorized");

      await ctx.controller.setCanonicalAccount(ctx.alice.address, true);
      await ctx.engine.connect(ctx.alice).openPosition(ctx.alice.address, 100n * ONE, MIN_LOCK);
      const state = await ctx.engine.positionState(1n);
      expect(state.owner).to.equal(ctx.alice.address);
      expect(state.principal).to.equal(100n * ONE);
      expect(state.active).to.equal(true);
      expect(await ctx.engine.totalLocked()).to.equal(100n * ONE);
      expect(await ctx.engine.totalActiveWeight()).to.equal(100n * ONE);

      await expect(ctx.engine.connect(ctx.outsider).extendPosition(1n, MIN_LOCK))
        .to.be.revertedWithCustomError(ctx.engine, "Unauthorized");
      await expect(ctx.engine.connect(ctx.treasury).accrueLiquidityFees(0n, 1n))
        .to.be.revertedWithCustomError(ctx.engine, "Unauthorized");
    });

    it("rejects direct ETH and accepts only the explicit native-reward surface", async function () {
      const ctx = await deployUnsealed();
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);

      await expect(
        ctx.outsider.sendTransaction({ to: await ctx.engine.getAddress(), value: 1n }),
      ).to.be.revertedWithCustomError(ctx.engine, "EtherNotAccepted");
      await ctx.engine.connect(ctx.outsider).depositNativeRewards({ value: ONE });
      expect(await ctx.engine.claimableNative(1n)).to.equal(ONE);
      await ctx.engine.connect(ctx.alice).claimPosition(1n, ctx.alice.address, []);
      expect((await ctx.engine.rewardAccounting(ctx.ethers.ZeroAddress)).totalClaimed)
        .to.equal(ONE);
    });
  });

  describe("reward-weight accounting", function () {
    it("pins no-weight liquidity fees inactive before a later locker can enter", async function () {
      const ctx = await deployUnsealed();
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundVaultBase(ctx, 101n);

      await ctx.vault.account(0n, 101n);
      expect(await ctx.engine.pendingInactiveBaseFeeFunding()).to.equal(101n);
      expect(await ctx.engine.pendingActiveBaseFeeFunding()).to.equal(0n);
      expect(await ctx.engine.totalInactiveBaseFeesAccounted()).to.equal(101n);
      expect((await ctx.engine.rewardAccounting(await ctx.base.getAddress())).totalReceived)
        .to.equal(0n);

      // Entering after accrual cannot change the already-pinned disposition.
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      const inactiveBefore = await ctx.base.balanceOf(ctx.recovery.address);
      await ctx.vault.fund(0n, 101n);

      expect(await ctx.base.balanceOf(ctx.recovery.address) - inactiveBefore).to.equal(101n);
      expect(await ctx.engine.pendingInactiveBaseFeeFunding()).to.equal(0n);
      expect(await ctx.engine.totalInactiveBaseFeesRouted()).to.equal(101n);
      expect(await ctx.engine.claimableToken(1n, await ctx.base.getAddress())).to.equal(0n);
    });

    it("self-funds active accruals inside claims even after a dust fee front-runs them", async function () {
      const ctx = await deployUnsealed();
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      await fundVaultBase(ctx, 100n);

      await ctx.vault.account(0n, 100n);
      const baseAddress = await ctx.base.getAddress();
      expect(await ctx.engine.pendingActiveBaseFeeFunding()).to.equal(100n);
      expect(await ctx.engine.totalActiveBaseFeesAccounted()).to.equal(100n);
      expect(await ctx.engine.claimableToken(1n, baseAddress)).to.equal(100n);

      // A final tiny accrual immediately before the claim cannot create a global
      // claim-denial condition: the claim atomically pulls all 101 units.
      await fundVaultBase(ctx, 1n);
      await ctx.vault.account(0n, 1n);
      expect(await ctx.engine.pendingActiveBaseFeeFunding()).to.equal(101n);
      await ctx.engine.connect(ctx.alice).claimPosition(1n, ctx.alice.address, [baseAddress]);
      expect(await ctx.engine.pendingActiveBaseFeeFunding()).to.equal(0n);
      expect(await ctx.engine.totalActiveBaseFeesFunded()).to.equal(101n);
      expect((await ctx.engine.rewardAccounting(baseAddress)).totalClaimed).to.equal(101n);
    });

    it("requires every added principal tranche to open a fresh independently locked position", async function () {
      const ctx = await deployUnsealed();
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      await fundAndOpen(ctx, ctx.bob, 100n * ONE);
      await fundVaultBase(ctx, 190n);

      await ctx.vault.deposit(0n, 100n);
      expect(ctx.engine.interface.hasFunction("increasePosition")).to.equal(false);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      await ctx.vault.deposit(0n, 90n);

      expect(await ctx.engine.claimableToken(1n, await ctx.base.getAddress())).to.equal(80n);
      expect(await ctx.engine.claimableToken(2n, await ctx.base.getAddress())).to.equal(80n);
      expect(await ctx.engine.claimableToken(3n, await ctx.base.getAddress())).to.equal(30n);
      await ctx.engine.connect(ctx.alice).claimPosition(
        1n,
        ctx.alice.address,
        [await ctx.base.getAddress()],
      );
      await ctx.engine.connect(ctx.bob).claimPosition(
        2n,
        ctx.bob.address,
        [await ctx.base.getAddress()],
      );
      await ctx.engine.connect(ctx.alice).claimPosition(
        3n,
        ctx.alice.address,
        [await ctx.base.getAddress()],
      );

      const accounting = await ctx.engine.rewardAccounting(await ctx.base.getAddress());
      expect(accounting.totalReceived).to.equal(190n);
      expect(accounting.totalClaimed).to.equal(190n);
      expect(accounting.unallocatedScaled).to.equal(0n);
      expect(accounting.indexedOutstandingScaled).to.equal(0n);
      expect(accounting.settledOutstandingScaled).to.equal(0n);
      expect(accounting.conserved).to.equal(true);
    });

    it("preserves exact scaled conservation across an extension-driven weight change", async function () {
      const ctx = await deployUnsealed({
        minMultiplier: ONE,
        maxMultiplier: 4n * ONE,
      });
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      await fundVaultBase(ctx, 100n);

      await ctx.vault.deposit(0n, 77n);
      const before = await ctx.engine.positionState(1n);
      await ctx.engine.connect(ctx.alice).extendPosition(1n, 600n);
      const after = await ctx.engine.positionState(1n);
      expect(after.weight).to.be.gt(before.weight);
      await ctx.vault.deposit(0n, 23n);

      const claimable = await ctx.engine.claimableToken(1n, await ctx.base.getAddress());
      expect(claimable).to.be.gte(99n);
      await ctx.engine.connect(ctx.alice).claimPosition(
        1n,
        ctx.alice.address,
        [await ctx.base.getAddress()],
      );
      const accounting = await ctx.engine.rewardAccounting(await ctx.base.getAddress());
      expect(accounting.totalReceived * RAY).to.equal(
        accounting.totalClaimed * RAY +
          accounting.unallocatedScaled +
          accounting.indexedOutstandingScaled +
          accounting.settledOutstandingScaled,
      );
      expect(accounting.conserved).to.equal(true);
    });

    it("routes ineligible fees away and keeps dust weight from fixed emissions", async function () {
      const ctx = await deployUnsealed();
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundVaultBase(ctx, 101n);

      const inactiveBefore = await ctx.base.balanceOf(ctx.recovery.address);
      await ctx.vault.deposit(0n, 101n);
      expect(await ctx.base.balanceOf(ctx.recovery.address) - inactiveBefore).to.equal(101n);

      await fundAndOpen(ctx, ctx.alice, 1n);
      await moveTo(ctx, ctx.origin + EPOCH + 1n);
      await ctx.engine.advanceEpochs(32);
      expect(await ctx.reserve.totalReleased()).to.equal(0n);
      await fundVaultBase(ctx, 101n);
      await ctx.vault.deposit(0n, 101n);
      expect(await ctx.engine.totalInactiveBaseFeesRouted()).to.equal(202n);

      await fundAndOpen(ctx, ctx.bob, 100n * ONE);
      await fundVaultBase(ctx, 101n);
      await ctx.vault.deposit(0n, 101n);
      expect(await ctx.engine.claimableToken(1n, await ctx.base.getAddress())).to.equal(0n);
      expect(await ctx.engine.claimableToken(2n, await ctx.base.getAddress())).to.equal(100n);
      await ctx.engine.connect(ctx.bob).claimPosition(
        2n,
        ctx.bob.address,
        [await ctx.base.getAddress()],
      );
      const accounting = await ctx.engine.rewardAccounting(await ctx.base.getAddress());
      expect(accounting.totalReceived).to.equal(101n);
      expect(accounting.totalClaimed).to.equal(100n);
      expect(await ctx.engine.totalLiquidityBaseFeesReceived()).to.equal(303n);
      expect(accounting.conserved).to.equal(true);
    });

    it("recycles cross-position fractional dust instead of abandoning a whole token", async function () {
      const ctx = await deployUnsealed();
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      await fundAndOpen(ctx, ctx.bob, 100n * ONE);
      await fundVaultBase(ctx, 101n);
      await ctx.vault.deposit(0n, 101n);

      expect(await ctx.engine.claimableToken(1n, await ctx.base.getAddress())).to.equal(50n);
      expect(await ctx.engine.claimableToken(2n, await ctx.base.getAddress())).to.equal(50n);
      await ctx.engine.connect(ctx.alice).claimPosition(
        1n,
        ctx.alice.address,
        [await ctx.base.getAddress()],
      );
      await ctx.engine.connect(ctx.bob).claimPosition(
        2n,
        ctx.bob.address,
        [await ctx.base.getAddress()],
      );

      const unlockAt = (await ctx.engine.positionState(1n)).unlockAt;
      await moveTo(ctx, unlockAt + 1n);
      await ctx.engine.advanceEpochs(32);
      await ctx.engine.connect(ctx.alice).unlockPosition(1n, ctx.alice.address);
      await ctx.engine.connect(ctx.bob).unlockPosition(2n, ctx.bob.address);
      await ctx.engine.connect(ctx.alice).closePosition(1n);
      await ctx.engine.connect(ctx.bob).closePosition(2n);
      let accounting = await ctx.engine.rewardAccounting(await ctx.base.getAddress());
      expect(accounting.totalClaimed).to.equal(100n);
      expect(accounting.unallocatedScaled).to.equal(RAY);

      await fundAndOpen(ctx, ctx.carol, 100n * ONE);
      expect(await ctx.engine.claimableToken(3n, await ctx.base.getAddress())).to.equal(1n);
      await ctx.engine.connect(ctx.carol).claimPosition(
        3n,
        ctx.carol.address,
        [await ctx.base.getAddress()],
      );
      accounting = await ctx.engine.rewardAccounting(await ctx.base.getAddress());
      expect(accounting.totalClaimed).to.equal(101n);
      expect(accounting.unallocatedScaled).to.equal(0n);
      expect(accounting.indexedOutstandingScaled).to.equal(0n);
      expect(accounting.settledOutstandingScaled).to.equal(0n);
      expect(accounting.conserved).to.equal(true);
    });

    it("returns principal even when the fee-base later blocks Engine transfers", async function () {
      const ctx = await deployUnsealed({ blockingBase: true });
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      await fundVaultBase(ctx, 100n);
      await ctx.vault.deposit(0n, 100n);

      const unlockAt = (await ctx.engine.positionState(1n)).unlockAt;
      await moveTo(ctx, unlockAt + 1n);
      await ctx.engine.advanceEpochs(32);
      await ctx.base.connect(ctx.admin).setBlockedSender(await ctx.engine.getAddress(), true);

      const principalBefore = await ctx.token.balanceOf(ctx.alice.address);
      await ctx.engine.connect(ctx.alice).unlockPosition(1n, ctx.alice.address);
      expect(await ctx.token.balanceOf(ctx.alice.address) - principalBefore).to.equal(100n * ONE);
      expect(await ctx.engine.claimableToken(1n, await ctx.base.getAddress())).to.equal(100n);
      await expect(
        ctx.engine.connect(ctx.alice).claimPosition(
          1n,
          ctx.alice.address,
          [await ctx.base.getAddress()],
        ),
      ).to.be.revertedWithCustomError(ctx.base, "BlockedSender");

      await ctx.engine.connect(ctx.alice).closePosition(1n);
      expect(await ctx.engine.claimableToken(1n, await ctx.base.getAddress())).to.equal(0n);
      const accounting = await ctx.engine.rewardAccounting(await ctx.base.getAddress());
      expect(accounting.unallocatedScaled).to.equal(100n * RAY);
      expect(accounting.conserved).to.equal(true);
    });
  });

  describe("epoch clock and reserve emissions", function () {
    it("advances permissionlessly in bounded batches and measures exact reserve delivery", async function () {
      const emission = 10n * ONE;
      const ctx = await deployUnsealed({ emissionPerEpoch: emission, maxAdvancePerCall: 2 });
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      await moveTo(ctx, ctx.origin + 3n * EPOCH + 1n);

      await ctx.engine.advanceEpochs(50);
      expect(await ctx.engine.currentEpoch()).to.equal(2n);
      expect(await ctx.engine.targetEpoch()).to.equal(3n);
      await ctx.engine.advanceEpochs(50);
      expect(await ctx.engine.currentEpoch()).to.equal(3n);
      const dilutedEmission = emission / 2n;
      expect(await ctx.reserve.totalReleased()).to.equal(3n * dilutedEmission);
      expect(await ctx.engine.totalReserveRewardsReceived()).to.equal(3n * dilutedEmission);
      expect(await ctx.engine.claimableToken(1n, await ctx.token.getAddress()))
        .to.equal(3n * dilutedEmission);
      expect((await ctx.engine.rewardAccounting(await ctx.token.getAddress())).conserved)
        .to.equal(true);
    });

    it("keeps stale Hook accrual live, routes it inactive, and resumes active indexing after catch-up", async function () {
      const ctx = await deployUnsealed({ maxAdvancePerCall: 2 });
      await sealSystem(ctx);
      await moveTo(ctx, ctx.origin);
      await fundAndOpen(ctx, ctx.alice, 100n * ONE);
      await fundVaultBase(ctx, 1n);
      await moveTo(ctx, ctx.origin + 5n * EPOCH + 1n);

      const inactiveBefore = await ctx.base.balanceOf(ctx.recovery.address);
      await ctx.vault.deposit(0n, 1n);
      expect(await ctx.base.balanceOf(ctx.recovery.address) - inactiveBefore).to.equal(1n);
      expect(await ctx.engine.currentEpoch()).to.equal(0n);
      expect(await ctx.engine.totalInactiveBaseFeesAccounted()).to.equal(1n);
      await ctx.engine.connect(ctx.outsider).advanceEpochs(2);
      await ctx.engine.connect(ctx.outsider).advanceEpochs(2);
      await ctx.engine.connect(ctx.outsider).advanceEpochs(2);
      expect(await ctx.engine.currentEpoch()).to.equal(5n);
      await fundVaultBase(ctx, 1n);
      await ctx.vault.deposit(0n, 1n);
      expect(await ctx.engine.claimableToken(1n, await ctx.base.getAddress())).to.equal(1n);
    });
  });
});
