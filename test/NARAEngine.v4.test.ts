/**
 * NARAEngine v4 — focused test suite
 *
 * Covers:
 *  - Launcher-driven atomic deploy (token + engine)
 *  - Lock paths: standard, lockFor, lockWithPermit, ERC-1363 onTransferReceived
 *  - JIT auto-advance + permissionless poke() + MAX_JIT_ADVANCE cap
 *  - Emission advance + claim + unlock round-trip
 *  - Multi-token bribes (notifyTokenRewards + claimTokenRewards)
 *  - Batch ops (unlockBatch, claimBatch)
 *  - Config timelock (propose / execute / cancel)
 *  - One-shot setters (reward reserve, bond vault) + AlreadySet revert
 *  - Flat ETH lock/unlock fees + treasury sweep
 *  - NotPositionOwner enforcement
 *  - DirectEthTransferForbidden on receive()
 *  - NoActiveWeight revert on notifyTokenRewards
 *
 * Hardhat 3: each hre.network.connect() returns an ISOLATED EVM. All ops in a
 * test must use the same ethers/provider obtained from ONE connect() call.
 */

import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";

// ─── Constants ──────────────────────────────────────────────────────────────

const ONE = 10n ** 18n;
const MAX_SUPPLY = 1_000_000n * ONE;
const RAY = 10n ** 27n;

const EPOCH_SECONDS = 900n;       // 15 min
const CONFIG_DELAY = 3600n;       // 1 hour
const INITIAL_BASE = ONE / 2n;    // 0.5e18
const TOKEN_NAME = "NARA Token";
const TOKEN_SYMBOL = "NARA";
// Storage slot for NARAEngine.totalPendingNaraRewards. Used only to model
// the rare accounting-counter drift that can arise from per-position floors.
const TOTAL_PENDING_NARA_REWARDS_SLOT = 42n;

// EngineConfig shape (must match Solidity struct order)
const ENGINE_CONFIG_TYPE =
    "tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint64,uint64)";

function defaultEngineConfig(ethers: any) {
    return {
        eMax:                   ethers.parseUnits("1000000", 18),
        beta0Wad:               ethers.parseUnits("0.008",   18),
        mWad:                   ethers.parseUnits("0.25",    18),
        aWad:                   ethers.parseUnits("1.25",    18),
        bWad:                   ethers.parseUnits("0.90",    18),
        cWad:                   ethers.parseUnits("0.50",    18),
        dWad:                   ethers.parseUnits("0.50",    18),
        dripSplitWad:           ethers.parseUnits("0.85",    18),
        durationLinearWad:      ethers.parseUnits("0.8",     18),
        durationQuadraticWad:   ethers.parseUnits("0.9",     18),
        growthFactorWad:        ethers.parseUnits("1.000104",18),
        minBaseEmission:        ethers.parseUnits("0.2",     18),
        maxBaseEmission:        ethers.parseUnits("5",       18),
        warmupRateWad:          ethers.parseUnits("0.00133", 18),
        bootstrapInitialWeight: ethers.parseUnits("10000000",18),
        bootstrapDecayWad:      ethers.parseUnits("0.9991",  18),
        activationDelayEpochs:  3n,      // D2 per spec
        maxLockEpochs:          35040n,
    };
}

function configAsTuple(cfg: ReturnType<typeof defaultEngineConfig>): any[] {
    return [
        cfg.eMax, cfg.beta0Wad, cfg.mWad, cfg.aWad, cfg.bWad, cfg.cWad, cfg.dWad,
        cfg.dripSplitWad, cfg.durationLinearWad, cfg.durationQuadraticWad,
        cfg.growthFactorWad, cfg.minBaseEmission, cfg.maxBaseEmission,
        cfg.warmupRateWad, cfg.bootstrapInitialWeight, cfg.bootstrapDecayWad,
        cfg.activationDelayEpochs, cfg.maxLockEpochs,
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

function mulDivDown(x: bigint, y: bigint, denominator: bigint) {
    return (x * y) / denominator;
}

function computeWeight(amount: bigint, durationEpochs: bigint, cfg: ReturnType<typeof defaultEngineConfig>) {
    const r = mulDivDown(durationEpochs, ONE, cfg.maxLockEpochs);
    const r2 = mulDivDown(r, r, ONE);
    const multiplier = ONE
        + mulDivDown(cfg.durationLinearWad, r, ONE)
        + mulDivDown(cfg.durationQuadraticWad, r2, ONE);
    return mulDivDown(amount, multiplier, ONE);
}

async function setTotalPendingNaraRewardsForTest(ethers: any, engine: any, value: bigint) {
    await ethers.provider.send("hardhat_setStorageAt", [
        await engine.getAddress(),
        ethers.toBeHex(TOTAL_PENDING_NARA_REWARDS_SLOT),
        ethers.toBeHex(value, 32),
    ]);
    expect(await engine.totalPendingNaraRewards()).to.equal(value);
}

async function launchSystem(
    ethers: any,
    deployer: Signer,
    treasury: Signer,
    rewardDeposit: bigint = 100_000n * ONE,
) {
    const deployerAddr = await deployer.getAddress();
    const treasuryAddr = await treasury.getAddress();

    const launcher = await ethers.deployContract("NARALauncher", [deployerAddr], deployer);
    await launcher.waitForDeployment();

    const cfg = defaultEngineConfig(ethers);
    const code = await buildEngineCreationCode(
        ethers, deployerAddr, EPOCH_SECONDS, CONFIG_DELAY, INITIAL_BASE, cfg,
    );
    const salt = ethers.keccak256(ethers.toUtf8Bytes("NARA-V4-TEST"));
    const predicted = await launcher.previewEngineAddress(code, salt);

    await launcher.connect(deployer).launch(treasuryAddr, code, salt, TOKEN_NAME, TOKEN_SYMBOL);

    const tokenAddr = await launcher.deployedToken();
    const engineAddr = await launcher.deployedEngine();
    expect(engineAddr).to.equal(predicted);

    const token = await ethers.getContractAt(
        "contracts/v4/NARAToken.sol:NARAToken",
        tokenAddr,
    );
    const engine = await ethers.getContractAt(
        "contracts/v4/NARAEngine.sol:NARAEngine",
        engineAddr,
    );

    // Wire treasury so lock fees can be paid; no reward reserve in this minimal rig.
    await engine.connect(deployer).setTreasury(treasuryAddr);

    if (rewardDeposit != 0n) {
        // Fund engine with NARA emission reserve so _advanceOneEpoch can drip.
        await token.connect(treasury).approve(engineAddr, rewardDeposit);
        await engine.connect(treasury).depositRewards(rewardDeposit);
    }

    return { launcher, token, engine, tokenAddr, engineAddr, cfg };
}

async function deployErc20(ethers: any, signer: Signer, supplyTo: string) {
    // Use NARAToken itself as a dummy ERC-20 bribe token (different deployment -> different address)
    const mock = await ethers.deployContract(
        "contracts/v4/NARAToken.sol:NARAToken",
        [supplyTo, supplyTo, "NARA Bribe Test", "BRIBE"],
        signer,
    );
    await mock.waitForDeployment();
    return mock;
}

async function grantRewardNotifier(ethers: any, engine: any, admin: Signer, notifier: Signer) {
    await engine.connect(admin).grantRole(
        ethers.id("REWARD_NOTIFIER_ROLE"),
        await notifier.getAddress(),
    );
}

// ────────────────────────────────────────────────────────────────────────────
// A. Launcher deploy
// ────────────────────────────────────────────────────────────────────────────
describe("NARAEngine v4 — launcher deploy", () => {
    let ethers: any;
    let deployer: Signer, treasury: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, treasury] = await ethers.getSigners();
    });

    it("deploys token + engine atomically with correct immutables", async () => {
        const { token, engine, tokenAddr, engineAddr } =
            await launchSystem(ethers, deployer, treasury);

        expect(await engine.NARA()).to.equal(tokenAddr);
        expect(await token.FLASH_FEE_SINK()).to.equal(engineAddr);
        expect(await engine.EPOCH_LENGTH()).to.equal(EPOCH_SECONDS);
        expect(await engine.CONFIG_CHANGE_DELAY()).to.equal(CONFIG_DELAY);
        expect(await engine.nextPositionId()).to.equal(1n);
        expect(await engine.totalLocked()).to.equal(0n);
    });

    it("rejects direct ETH transfer to engine", async () => {
        const { engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        await expect(
            deployer.sendTransaction({ to: engineAddr, value: ONE }),
        ).to.be.revertedWithCustomError(engine, "DirectEthTransferForbidden");
    });
});

// ────────────────────────────────────────────────────────────────────────────
// B. Lock paths
// ────────────────────────────────────────────────────────────────────────────
describe("NARAEngine v4 — lock paths", () => {
    let ethers: any;
    let deployer: Signer, treasury: Signer, alice: Signer, bob: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, treasury, alice, bob] = await ethers.getSigners();
    });

    it("lock() with approve-then-lock creates a position with correct weight", async () => {
        const { token, engine, engineAddr, cfg } = await launchSystem(ethers, deployer, treasury);
        const amt = 1_000n * ONE;

        await token.connect(treasury).transfer(await alice.getAddress(), amt);
        await token.connect(alice).approve(engineAddr, amt);

        const duration = 100n;
        const expectedWeight = computeWeight(amt, duration, cfg);
        const posId = await engine.connect(alice).lock.staticCall(amt, duration, 0n);
        await engine.connect(alice).lock(amt, duration, 0n);

        const pos = await engine.positionOf(posId);
        expect(pos.owner).to.equal(await alice.getAddress());
        expect(pos.amount).to.equal(amt);
        expect(pos.weight).to.equal(expectedWeight);

        expect(await engine.nextPositionId()).to.equal(posId + 1n);
    });

    it("lock() reverts LockTooShort when duration <= activationDelay", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 100n * ONE;
        await token.connect(treasury).transfer(await alice.getAddress(), amt);
        await token.connect(alice).approve(engineAddr, amt);
        // activationDelay = 3, so duration <= 3 must revert
        await expect(
            engine.connect(alice).lock(amt, 3n, 0n),
        ).to.be.revertedWithCustomError(engine, "LockTooShort");
    });

    it("lock() reverts SlippageExceeded when minWeight exceeds computed weight", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 100n * ONE;
        await token.connect(treasury).transfer(await alice.getAddress(), amt);
        await token.connect(alice).approve(engineAddr, amt);
        const impossibleMin = amt * 1_000_000n;
        await expect(
            engine.connect(alice).lock(amt, 50n, impossibleMin),
        ).to.be.revertedWithCustomError(engine, "SlippageExceeded");
    });

    it("lockFor() credits posOwner, payer is msg.sender", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 500n * ONE;
        const aliceAddr = await alice.getAddress();
        const bobAddr = await bob.getAddress();

        await token.connect(treasury).transfer(aliceAddr, amt);
        await token.connect(alice).approve(engineAddr, amt);

        await engine.connect(alice).lockFor(bobAddr, amt, 50n, 0n);

        const bobPosition = await engine.positionOf(1n);
        expect(bobPosition.owner).to.equal(bobAddr);
    });

    it("third-party lockFor() does not consume the recipient cap", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const donatedAmt = ONE;
        const ownAmt = 10n * ONE;
        const aliceAddr = await alice.getAddress();
        const bobAddr = await bob.getAddress();

        await token.connect(treasury).transfer(aliceAddr, 64n * donatedAmt);
        await token.connect(treasury).transfer(bobAddr, ownAmt);
        await token.connect(alice).approve(engineAddr, 64n * donatedAmt);
        await token.connect(bob).approve(engineAddr, ownAmt);

        for (let i = 0; i < 64; i++) {
            await engine.connect(alice).lockFor(bobAddr, donatedAmt, 50n, 0n);
        }

        await engine.connect(bob).lock(ownAmt, 50n, 0n);

        const donatedPosition = await engine.positionOf(1n);
        const bobPosition = await engine.positionOf(65n);
        expect(donatedPosition.flags).to.equal(0n);
        expect(bobPosition.owner).to.equal(bobAddr);
        expect(bobPosition.flags).to.equal(1n);
    });

    it("third-party ERC-1363 posOwner does not consume the recipient cap", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const donatedAmt = ONE;
        const ownAmt = 10n * ONE;
        const aliceAddr = await alice.getAddress();
        const bobAddr = await bob.getAddress();
        const data = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint64", "uint256", "address"],
            [50n, 0n, bobAddr],
        );

        await token.connect(treasury).transfer(aliceAddr, 64n * donatedAmt);
        await token.connect(treasury).transfer(bobAddr, ownAmt);
        await token.connect(bob).approve(engineAddr, ownAmt);

        for (let i = 0; i < 64; i++) {
            await (token.connect(alice) as any)["transferAndCall(address,uint256,bytes)"](
                engineAddr, donatedAmt, data,
            );
        }

        await engine.connect(bob).lock(ownAmt, 50n, 0n);

        const donatedPosition = await engine.positionOf(1n);
        const bobPosition = await engine.positionOf(65n);
        expect(donatedPosition.owner).to.equal(bobAddr);
        expect(donatedPosition.flags).to.equal(0n);
        expect(bobPosition.flags).to.equal(1n);
    });

    it("self-created locks still enforce the per-owner cap", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = ONE;
        const bobAddr = await bob.getAddress();

        await token.connect(treasury).transfer(bobAddr, 65n * amt);
        await token.connect(bob).approve(engineAddr, 65n * amt);

        for (let i = 0; i < 64; i++) {
            await engine.connect(bob).lock(amt, 50n, 0n);
        }

        await expect(
            engine.connect(bob).lock(amt, 50n, 0n),
        ).to.be.revertedWithCustomError(engine, "TooManyPositions");
    });

    it("onTransferReceived (ERC-1363 transferAndCall) creates a position", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 400n * ONE;
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, amt);

        const data = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint64", "uint256", "address"],
            [60n, 0n, ethers.ZeroAddress],
        );

        const tx = await (token.connect(alice) as any)["transferAndCall(address,uint256,bytes)"](
            engineAddr, amt, data,
        );
        await tx.wait();

        const pos = await engine.positionOf(1n);
        expect(pos.amount).to.equal(amt);
        expect(pos.owner).to.equal(aliceAddr);
    });

    it("ERC-1363 transferFromAndCall lets an approved operator choose the position owner", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 400n * ONE;
        const aliceAddr = await alice.getAddress();
        const bobAddr = await bob.getAddress();
        await token.connect(treasury).transfer(aliceAddr, amt);
        await token.connect(alice).approve(bobAddr, amt);

        const data = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint64", "uint256", "address"],
            [60n, 0n, bobAddr],
        );

        await (token.connect(bob) as any)["transferFromAndCall(address,address,uint256,bytes)"](
            aliceAddr,
            engineAddr,
            amt,
            data,
        );

        const pos = await engine.positionOf(1n);
        expect(pos.amount).to.equal(amt);
        expect(pos.owner).to.equal(bobAddr);
        expect(await token.allowance(aliceAddr, bobAddr)).to.equal(0n);
    });

    it("onTransferReceived reverts when flat lock ETH fee is enabled", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 400n * ONE;
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, amt);
        await engine.connect(deployer).setLockEthFee(ethers.parseEther("0.001"));

        const data = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint64", "uint256", "address"],
            [60n, 0n, ethers.ZeroAddress],
        );

        await expect(
            (token.connect(alice) as any)["transferAndCall(address,uint256,bytes)"](
                engineAddr, amt, data,
            ),
        ).to.be.revertedWithCustomError(engine, "InsufficientFee");
    });

    it("onTransferReceived rejects stale epochs instead of advancing historical snapshots with new principal", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 400n * ONE;
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, amt);
        await mineTime(ethers, EPOCH_SECONDS);

        const data = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint64", "uint256", "address"],
            [60n, 0n, ethers.ZeroAddress],
        );

        await expect(
            (token.connect(alice) as any)["transferAndCall(address,uint256,bytes)"](
                engineAddr, amt, data,
            ),
        ).to.be.revertedWithCustomError(engine, "EpochStale");
    });

    it("lockWithPermit() locks in a single tx without prior approve", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 250n * ONE;
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, amt);

        const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
        const nonce = await token.nonces(aliceAddr);
        const chainId = (await ethers.provider.getNetwork()).chainId;
        const domain = {
            name: TOKEN_NAME,
            version: "1",
            chainId,
            verifyingContract: await token.getAddress(),
        };
        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };
        const message = { owner: aliceAddr, spender: engineAddr, value: amt, nonce, deadline };
        const signature = await (alice as any).signTypedData(domain, types, message);
        const sig = ethers.Signature.from(signature);

        await engine.connect(alice).lockWithPermit(amt, 80n, 0n, deadline, sig.v, sig.r, sig.s);

        expect(await engine.nextPositionId()).to.equal(2n);
    });

    it("charges lockFeeWei flat ETH fee and accumulates to treasury bucket", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        await engine.connect(deployer).setLockEthFee(BigInt(1e14)); // 0.0001 ETH

        const amt = 100n * ONE;
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, amt);
        await token.connect(alice).approve(engineAddr, amt);

        await expect(
            engine.connect(alice).lock(amt, 50n, 0n, { value: 0n }),
        ).to.be.revertedWithCustomError(engine, "InsufficientFee");

        await expect(
            engine.connect(alice).lock(amt, 50n, 0n, { value: BigInt(1e14) + 1n }),
        ).to.be.revertedWithCustomError(engine, "InsufficientFee");

        await engine.connect(alice).lock(amt, 50n, 0n, { value: BigInt(1e14) });
        expect(await engine.accumulatedTreasuryEthFees()).to.equal(BigInt(1e14));
    });
});

// ────────────────────────────────────────────────────────────────────────────
// C. Epoch advance + claim/unlock
// ────────────────────────────────────────────────────────────────────────────
describe("NARAEngine v4 — advance, claim, unlock", () => {
    let ethers: any;
    let deployer: Signer, treasury: Signer, alice: Signer, bob: Signer, sponsor: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, treasury, alice, bob, sponsor] = await ethers.getSigners();
    });

    it("advances epochs via JIT on interaction; poke() works permissionlessly", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        expect((await engine.epochState()).epoch).to.equal(0n);

        // Age chain 5 epochs — but JIT cap is 8, so poke() advances all 5.
        await mineTime(ethers, EPOCH_SECONDS * 5n);

        // Call from a non-admin signer to prove it's permissionless.
        await engine.connect(alice).poke();

        expect((await engine.epochState()).epoch).to.equal(5n);
    });

    it("caps JIT advance at MAX_JIT_ADVANCE=8; backlog requires chained poke()", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        await mineTime(ethers, EPOCH_SECONDS * 20n);

        await engine.connect(alice).poke();
        expect((await engine.epochState()).epoch).to.equal(8n);

        await engine.connect(alice).poke();
        expect((await engine.epochState()).epoch).to.equal(16n);

        await engine.connect(alice).poke();
        expect((await engine.epochState()).epoch).to.equal(20n);
    });

    it("rejects locks while JIT backlog remains stale after the per-call cap", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, 100n * ONE);
        await token.connect(alice).approve(engineAddr, 100n * ONE);

        await mineTime(ethers, EPOCH_SECONDS * 20n);
        await expect(
            engine.connect(alice).lock(10n * ONE, 100n, 0),
        ).to.be.revertedWithCustomError(engine, "EpochStale");

        await engine.connect(alice).poke();
        await engine.connect(alice).poke();
        await expect(engine.connect(alice).lock(10n * ONE, 100n, 0))
            .to.emit(engine, "Locked");
    });

    it("distributes NARA emissions, claim delivers, unlock returns principal + tail accrual", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 10_000n * ONE;
        const aliceAddr = await alice.getAddress();

        await token.connect(treasury).transfer(aliceAddr, amt);
        await token.connect(alice).approve(engineAddr, amt);
        const duration = 10n; // activation=3, unlock at epoch 11 from lock time

        await engine.connect(alice).lock(amt, duration, 0n);

        // Age past activation + a few earning epochs
        await mineTime(ethers, EPOCH_SECONDS * 8n);
        await engine.connect(alice).poke();

        const [naraOwed, ethOwed] = await engine.claimableRewards(1n);
        expect(naraOwed).to.be.gt(0n);
        expect(ethOwed).to.equal(0n);

        const balBefore = await token.balanceOf(aliceAddr);
        await engine.connect(alice).claimRewards(1n, aliceAddr);
        const balAfter = await token.balanceOf(aliceAddr);
        expect(balAfter - balBefore).to.equal(naraOwed);

        // Advance to maturity
        await mineTime(ethers, EPOCH_SECONDS * 20n);
        await engine.connect(alice).poke();
        await engine.connect(alice).poke();
        await engine.connect(alice).poke();

        const preUnlock = await token.balanceOf(aliceAddr);
        await engine.connect(alice).unlock(1n);
        const postUnlock = await token.balanceOf(aliceAddr);
        // Should receive at least the full principal back (plus any tail NARA accrual)
        expect(postUnlock - preUnlock).to.be.gte(amt);

        // Position cleared
        expect((await engine.positionOf(1n)).amount).to.equal(0n);
        expect(await engine.totalLocked()).to.equal(0n);
    });

    it("unlocks when pending NARA reward telemetry is one wei below owed rewards", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 10_000n * ONE;
        const aliceAddr = await alice.getAddress();

        await token.connect(treasury).transfer(aliceAddr, amt);
        await token.connect(alice).approve(engineAddr, amt);
        await engine.connect(alice).lock(amt, 10n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 20n);
        await engine.connect(alice).advanceEpochs(64);

        const [naraOwed] = await engine.claimableRewards(1n);
        expect(naraOwed).to.be.gt(1n);
        expect(await engine.totalPendingNaraRewards()).to.be.gte(naraOwed);

        await setTotalPendingNaraRewardsForTest(ethers, engine, naraOwed - 1n);

        const preUnlock = await token.balanceOf(aliceAddr);
        await engine.connect(alice).unlock(1n);
        const postUnlock = await token.balanceOf(aliceAddr);

        expect(postUnlock - preUnlock).to.equal(amt + naraOwed);
        expect(await engine.totalPendingNaraRewards()).to.equal(0n);
        expect((await engine.positionOf(1n)).amount).to.equal(0n);
    });

    it("M-04 boundary: maturing positions exclude rewards indexed at unlockEpoch", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const amt = 1_000n * ONE;
        const aliceAddr = await alice.getAddress();
        const bobAddr = await bob.getAddress();

        await token.connect(treasury).transfer(aliceAddr, amt);
        await token.connect(treasury).transfer(bobAddr, amt);
        await token.connect(alice).approve(engineAddr, amt);
        await token.connect(bob).approve(engineAddr, amt);

        await engine.connect(alice).lock(amt, 5n, 0n);  // activation=4, unlock=6
        await engine.connect(bob).lock(amt, 100n, 0n);  // remains active at epoch 6
        const alicePosition = await engine.positionOf(1n);
        expect(alicePosition.activationEpoch).to.equal(4n);
        expect(alicePosition.unlockEpoch).to.equal(6n);

        await mineTime(ethers, EPOCH_SECONDS * 4n);
        await engine.connect(alice).poke();

        await engine.connect(sponsor).notifyEthRewards({ value: ONE });
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).advanceEpochs(1); // epoch 5: Alice and Bob active

        await engine.connect(sponsor).notifyEthRewards({ value: ONE });
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).advanceEpochs(1); // epoch 6: Alice deactivates first

        const naraStart = await engine.naraIndexAtEpoch(alicePosition.activationEpoch - 1n);
        const naraAtLastActive = await engine.naraIndexAtEpoch(alicePosition.unlockEpoch - 1n);
        const naraAtUnlock = await engine.naraIndexAtEpoch(alicePosition.unlockEpoch);
        const ethStart = await engine.ethIndexAtEpoch(alicePosition.activationEpoch - 1n);
        const ethAtLastActive = await engine.ethIndexAtEpoch(alicePosition.unlockEpoch - 1n);
        const ethAtUnlock = await engine.ethIndexAtEpoch(alicePosition.unlockEpoch);

        expect(naraAtUnlock).to.be.gt(naraAtLastActive);
        expect(ethAtUnlock).to.be.gt(ethAtLastActive);

        const expectedNara = mulDivDown(alicePosition.weight, naraAtLastActive - naraStart, RAY);
        const expectedEth = mulDivDown(alicePosition.weight, ethAtLastActive - ethStart, RAY);
        const overclaimNara = mulDivDown(alicePosition.weight, naraAtUnlock - naraStart, RAY);
        const overclaimEth = mulDivDown(alicePosition.weight, ethAtUnlock - ethStart, RAY);

        const [claimableNara, claimableEth] = await engine.claimableRewards(1n);
        expect(claimableNara).to.equal(expectedNara);
        expect(claimableEth).to.equal(expectedEth);
        expect(overclaimNara).to.be.gt(expectedNara);
        expect(overclaimEth).to.be.gt(expectedEth);
    });

    it("unlock reverts PositionNotMatured before unlockEpoch", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, 100n * ONE);
        await token.connect(alice).approve(engineAddr, 100n * ONE);
        await engine.connect(alice).lock(100n * ONE, 50n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        await expect(
            engine.connect(alice).unlock(1n),
        ).to.be.revertedWithCustomError(engine, "PositionNotMatured");
    });

    it("unlockTo lets an ETH-rejecting raw position owner receive principal through an alternate receiver", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const [, , , receiver, sponsor] = await ethers.getSigners();
        const aliceAddr = await alice.getAddress();
        const receiverAddr = await receiver.getAddress();
        const rejector = await ethers.deployContract("MockEthRejectingPositionOwner", [], deployer);
        await rejector.waitForDeployment();
        const rejectorAddr = await rejector.getAddress();

        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        const positionId = await engine.connect(alice).lockFor.staticCall(rejectorAddr, 1_000n * ONE, 8n, 0n);
        await engine.connect(alice).lockFor(rejectorAddr, 1_000n * ONE, 8n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();
        await engine.connect(sponsor).notifyEthRewards({ value: ONE });
        await mineTime(ethers, EPOCH_SECONDS * 2n);
        await engine.connect(alice).poke();
        expect((await engine.claimableRewards(positionId))[1]).to.be.gt(0n);

        await mineTime(ethers, EPOCH_SECONDS * 3n);
        await engine.connect(alice).poke();
        await expect(
            rejector.connect(alice).unlock(engineAddr, positionId),
        ).to.be.revertedWithCustomError(engine, "EthTransferFailed");

        const naraBefore = await token.balanceOf(receiverAddr);
        const ethBefore = await ethers.provider.getBalance(receiverAddr);
        await rejector.connect(alice).unlockTo(engineAddr, positionId, receiverAddr);

        expect(await token.balanceOf(receiverAddr)).to.be.gte(naraBefore + 1_000n * ONE);
        expect(await ethers.provider.getBalance(receiverAddr)).to.be.gt(ethBefore);
        expect((await engine.positionOf(positionId)).amount).to.equal(0n);
    });

    it("NotPositionOwner when non-owner tries to claim or unlock", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, 100n * ONE);
        await token.connect(alice).approve(engineAddr, 100n * ONE);
        await engine.connect(alice).lock(100n * ONE, 50n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 8n);

        await expect(
            engine.connect(treasury).claimRewards(1n, await treasury.getAddress()),
        ).to.be.revertedWithCustomError(engine, "NotPositionOwner");

        await expect(
            engine.connect(deployer).unlock(1n),
        ).to.be.revertedWithCustomError(engine, "NotPositionOwner");
    });
});

// ────────────────────────────────────────────────────────────────────────────
// D. ETH reward notifications
// ────────────────────────────────────────────────────────────────────────────
    describe("NARAEngine v4 — ETH rewards", () => {
    let ethers: any;
    let deployer: Signer, treasury: Signer, alice: Signer, sponsor: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, treasury, alice, sponsor] = await ethers.getSigners();
    });

    it("notifyEthRewards reverts when no active weight exists", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        await expect(
            engine.connect(sponsor).notifyEthRewards({ value: ONE }),
        ).to.be.revertedWithCustomError(engine, "NoActiveWeight");
    });

    it("notifyEthRewards queues ETH and distributes it to lockers at next epoch", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 50n, 0n);

        // Activate
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        // Sponsor sends ETH
        await engine.connect(sponsor).notifyEthRewards({ value: ONE });
        expect(await engine.pendingEthForNextEpoch()).to.equal(ONE);
        expect(await engine.totalEthRewardsReceived()).to.equal(ONE);

        // Advance one epoch to settle the ETH
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).poke();

        // Accrual follows the v2 closed-epoch convention: rewards distributed
        // into epoch N become claimable after N is closed by the next advance.
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).poke();

        const [, ethOwed] = await engine.claimableRewards(1n);
        expect(ethOwed).to.be.gt(0n);
    });

    it("notifyEthRewards catches up stale epochs before queuing ETH", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 50n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 5n);
        expect((await engine.epochState()).epoch).to.equal(0n);
        await engine.connect(sponsor).notifyEthRewards({ value: ONE });

        expect((await engine.epochState()).epoch).to.equal(5n);
        expect(await engine.pendingEthForNextEpoch()).to.equal(ONE);
    });

    it("notifyEthRewards reverts while epoch backlog remains beyond the JIT cap", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        await mineTime(ethers, EPOCH_SECONDS * 20n);

        await expect(
            engine.connect(sponsor).notifyEthRewards({ value: ONE }),
        ).to.be.revertedWithCustomError(engine, "EpochStale");
    });

    it("claimRewards increments totalEthRewardsClaimed exactly once by net ETH", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();

        await engine.connect(deployer).setClaimFee(1000);
        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 50n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();
        await engine.connect(sponsor).notifyEthRewards({ value: ONE });
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).poke();
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).poke();

        const [, ethOwedNet] = await engine.claimableRewards(1n);
        expect(ethOwedNet).to.be.gt(0n);

        const claimedBefore = await engine.totalEthRewardsClaimed();
        await engine.connect(alice).claimRewards(1n, aliceAddr);
        expect(await engine.totalEthRewardsClaimed()).to.equal(claimedBefore + ethOwedNet);
    });

    it("unlock charges the claim fee on forced ETH settlement", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();

        await engine.connect(deployer).setClaimFee(1000);
        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 10n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();
        await engine.connect(sponsor).notifyEthRewards({ value: ONE });
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).poke();
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).poke();

        const [, ethOwedNet] = await engine.claimableRewards(1n);
        const feesBefore = await engine.accumulatedTreasuryEthFees();
        const claimedBefore = await engine.totalEthRewardsClaimed();

        await mineTime(ethers, EPOCH_SECONDS * 20n);
        await engine.connect(alice).poke();
        await engine.connect(alice).poke();
        await engine.connect(alice).poke();
        await engine.connect(alice).unlock(1n);

        expect(await engine.accumulatedTreasuryEthFees()).to.be.gt(feesBefore);
        expect(await engine.totalEthRewardsClaimed()).to.be.gte(claimedBefore + ethOwedNet);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// E. Multi-token bribes (instant-distribution)
// ────────────────────────────────────────────────────────────────────────────
describe("NARAEngine v4 — multi-token bribes", () => {
    let ethers: any;
    let deployer: Signer, treasury: Signer, alice: Signer, briber: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, treasury, alice, briber] = await ethers.getSigners();
    });

    it("notifyTokenRewards reverts NoActiveWeight when no active lockers", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        const bribe = await deployErc20(ethers, briber, await briber.getAddress());
        await grantRewardNotifier(ethers, engine, deployer, briber);
        await bribe.connect(briber).approve(await engine.getAddress(), 100n * ONE);

        await expect(
            engine.connect(briber).notifyTokenRewards(await bribe.getAddress(), 100n * ONE),
        ).to.be.revertedWithCustomError(engine, "NoActiveWeight");
    });

    it("notifyTokenRewards rejects NARA itself as a bribe token", async () => {
        const { engine, tokenAddr, token, engineAddr } = await launchSystem(ethers, deployer, treasury);
        // Make an active locker so we don't short-circuit on NoActiveWeight
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, 500n * ONE);
        await token.connect(alice).approve(engineAddr, 500n * ONE);
        await engine.connect(alice).lock(500n * ONE, 50n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        await expect(
            engine.connect(deployer).notifyTokenRewards(tokenAddr, 100n * ONE),
        ).to.be.revertedWithCustomError(engine, "RewardTokenNotAllowed");
    });

    it("full bribe lifecycle: notify -> index bumps -> locker claims", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();

        // Activate a locker
        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 50n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        const bribe = await deployErc20(ethers, briber, await briber.getAddress());
        const bribeAmt = 1_000n * ONE;
        await grantRewardNotifier(ethers, engine, deployer, briber);
        await bribe.connect(briber).approve(engineAddr, bribeAmt);
        await engine.connect(briber).notifyTokenRewards(await bribe.getAddress(), bribeAmt);

        const idx = await engine.tokenIndexRay(await bribe.getAddress());
        expect(idx).to.be.gt(0n);

        const owed = await engine.claimableTokenRewards(1n, await bribe.getAddress());
        expect(owed).to.be.gt(0n);

        const balBefore = await bribe.balanceOf(aliceAddr);
        await engine.connect(alice).claimTokenRewards(1n, await bribe.getAddress(), aliceAddr);
        const balAfter = await bribe.balanceOf(aliceAddr);
        expect(balAfter - balBefore).to.equal(owed);

        // Second claim reverts NothingToClaim (debt caught up with index)
        await expect(
            engine.connect(alice).claimTokenRewards(1n, await bribe.getAddress(), aliceAddr),
        ).to.be.revertedWithCustomError(engine, "NothingToClaim");
    });

    it("does not let positions activated after a bribe claim historical token rewards", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        const bob = (await ethers.getSigners())[4];
        const bobAddr = await bob.getAddress();

        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 50n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        const bribe = await deployErc20(ethers, briber, await briber.getAddress());
        const bribeAmt = 1_000n * ONE;
        await grantRewardNotifier(ethers, engine, deployer, briber);
        await bribe.connect(briber).approve(engineAddr, bribeAmt);
        await engine.connect(briber).notifyTokenRewards(await bribe.getAddress(), bribeAmt);

        await token.connect(treasury).transfer(bobAddr, 1_000n * ONE);
        await token.connect(bob).approve(engineAddr, 1_000n * ONE);
        const bobPositionId = await engine.connect(bob).lock.staticCall(1_000n * ONE, 50n, 0n);
        await engine.connect(bob).lock(1_000n * ONE, 50n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(bob).poke();

        expect(await engine.claimableTokenRewards(1n, await bribe.getAddress())).to.be.gt(0n);
        expect(await engine.claimableTokenRewards(bobPositionId, await bribe.getAddress())).to.equal(0n);
        await expect(
            engine.connect(bob).claimTokenRewards(bobPositionId, await bribe.getAddress(), bobAddr),
        ).to.be.revertedWithCustomError(engine, "NothingToClaim");
    });

    it("stops matured inactive positions from claiming token rewards notified after unlock", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        const bob = (await ethers.getSigners())[4];
        const bobAddr = await bob.getAddress();

        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(treasury).transfer(bobAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await token.connect(bob).approve(engineAddr, 1_000n * ONE);

        await engine.connect(alice).lock(1_000n * ONE, 8n, 0n);
        const bobPositionId = await engine.connect(bob).lock.staticCall(1_000n * ONE, 50n, 0n);
        await engine.connect(bob).lock(1_000n * ONE, 50n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        const bribe = await deployErc20(ethers, briber, await briber.getAddress());
        const bribeAddr = await bribe.getAddress();
        await grantRewardNotifier(ethers, engine, deployer, briber);
        await bribe.connect(briber).approve(engineAddr, 2_000n * ONE);

        await engine.connect(briber).notifyTokenRewards(bribeAddr, 1_000n * ONE);
        const aliceFirstClaim = await engine.claimableTokenRewards(1n, bribeAddr);
        expect(aliceFirstClaim).to.be.gt(0n);
        await engine.connect(alice).claimTokenRewards(1n, bribeAddr, aliceAddr);

        await mineTime(ethers, EPOCH_SECONDS * 6n);
        await engine.connect(bob).poke();
        const alicePosition = await engine.positionOf(1n);
        expect((await engine.epochState()).epoch).to.be.gte(alicePosition.unlockEpoch);

        await engine.connect(briber).notifyTokenRewards(bribeAddr, 1_000n * ONE);

        expect(await engine.claimableTokenRewards(1n, bribeAddr)).to.equal(0n);
        expect(await engine.claimableTokenRewards(bobPositionId, bribeAddr)).to.be.gt(0n);
        await expect(
            engine.connect(alice).claimTokenRewards(1n, bribeAddr, aliceAddr),
        ).to.be.revertedWithCustomError(engine, "NothingToClaim");
    });

    it("keeps already-earned token rewards claimable after principal unlock", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        const bob = (await ethers.getSigners())[4];
        const bobAddr = await bob.getAddress();

        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(treasury).transfer(bobAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await token.connect(bob).approve(engineAddr, 1_000n * ONE);

        await engine.connect(alice).lock(1_000n * ONE, 8n, 0n);
        await engine.connect(bob).lock(1_000n * ONE, 50n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        const bribe = await deployErc20(ethers, briber, await briber.getAddress());
        const bribeAddr = await bribe.getAddress();
        await grantRewardNotifier(ethers, engine, deployer, briber);
        await bribe.connect(briber).approve(engineAddr, 1_000n * ONE);
        await engine.connect(briber).notifyTokenRewards(bribeAddr, 1_000n * ONE);

        const owedBeforeUnlock = await engine.claimableTokenRewards(1n, bribeAddr);
        expect(owedBeforeUnlock).to.be.gt(0n);

        await mineTime(ethers, EPOCH_SECONDS * 6n);
        await engine.connect(bob).poke();
        await engine.connect(alice).unlock(1n);

        expect((await engine.positionOf(1n)).amount).to.equal(0n);
        expect(await engine.claimableTokenRewards(1n, bribeAddr)).to.equal(owedBeforeUnlock);

        const balanceBefore = await bribe.balanceOf(aliceAddr);
        await engine.connect(alice).claimTokenRewards(1n, bribeAddr, aliceAddr);
        expect(await bribe.balanceOf(aliceAddr)).to.equal(balanceBefore + owedBeforeUnlock);
    });

    it("does not let an arbitrary ERC20 notifier disable active extensions", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        const briberAddr = await briber.getAddress();
        const role = ethers.id("REWARD_NOTIFIER_ROLE");

        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 100n, 0);
        await mineTime(ethers, EPOCH_SECONDS * 4n);
        await engine.connect(alice).poke();

        const bribe = await deployErc20(ethers, briber, briberAddr);
        await bribe.connect(briber).approve(engineAddr, 1n);
        await expect(
            engine.connect(briber).notifyTokenRewards(await bribe.getAddress(), 1n),
        )
            .to.be.revertedWithCustomError(engine, "AccessControlUnauthorizedAccount")
            .withArgs(briberAddr, role);

        await expect(engine.connect(alice).extend(1n, 10n))
            .to.emit(engine, "Extended");
    });

    // M-05 history (audit 2026-06-10): freezing tokenWeight kept extend() available
    // without retroactively over-crediting earlier token rewards. It also created a
    // permanent under-allocation for rewards notified after an active extension.
    // Production mitigates that immutable-engine limitation by granting no
    // REWARD_NOTIFIER_ROLE and disabling engine-token routing in the growth vault.
    it("M-05 fix: extend() succeeds for active positions even after an authorized token-reward notify", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();

        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 100n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke(); // position now active, not matured

        const bribe = await deployErc20(ethers, briber, await briber.getAddress());
        await grantRewardNotifier(ethers, engine, deployer, briber);
        await bribe.connect(briber).approve(engineAddr, 1_000n * ONE);
        await engine.connect(briber).notifyTokenRewards(await bribe.getAddress(), 1_000n * ONE);

        // Fixed: extend() is no longer disabled by a live token-reward stream.
        await expect(engine.connect(alice).extend(1n, 10n)).to.emit(engine, "Extended");
    });

    it("documents the immutable-engine remainder created by a post-notify active extension", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        const bob = (await ethers.getSigners())[4];
        const bobAddr = await bob.getAddress();

        // Two equal active lockers.
        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(treasury).transfer(bobAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await token.connect(bob).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 100n, 0n);
        const bobId = await engine.connect(bob).lock.staticCall(1_000n * ONE, 100n, 0n);
        await engine.connect(bob).lock(1_000n * ONE, 100n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        const bribe = await deployErc20(ethers, briber, await briber.getAddress());
        const bribeAddr = await bribe.getAddress();
        await grantRewardNotifier(ethers, engine, deployer, briber);
        await bribe.connect(briber).approve(engineAddr, 4_000n * ONE);

        // Bribe #1 while weights are equal.
        await engine.connect(briber).notifyTokenRewards(bribeAddr, 1_000n * ONE);

        // Alice extends (live weight grows). Token weight must stay frozen at the original.
        await engine.connect(alice).extend(1n, 50n);

        // Bribe #2 after the extend.
        await engine.connect(briber).notifyTokenRewards(bribeAddr, 1_000n * ONE);

        await engine.connect(alice).claimTokenRewards(1n, bribeAddr, aliceAddr);
        await engine.connect(bob).claimTokenRewards(bobId, bribeAddr, bobAddr);
        const aliceGot = await bribe.balanceOf(aliceAddr);
        const bobGot = await bribe.balanceOf(bobAddr);

        // Equal frozen token weight => equal token-reward claims (extend gave Alice no token-share boost).
        const diff = aliceGot > bobGot ? aliceGot - bobGot : bobGot - aliceGot;
        expect(diff).to.be.lte(10n); // rounding dust only
        const claimed = aliceGot + bobGot;
        const stranded = await bribe.balanceOf(engineAddr);

        // This is the deployed-engine limitation the launch configuration must
        // keep dormant: some of bribe #2 has no position claim basis.
        expect(stranded).to.be.greaterThan(0n);
        expect(claimed + stranded).to.equal(2_000n * ONE);
    });

    it("M-03 regression: config-decrease extend cannot drop live weight below frozen token weight", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();

        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 100n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        const bribe = await deployErc20(ethers, briber, await briber.getAddress());
        await grantRewardNotifier(ethers, engine, deployer, briber);
        await bribe.connect(briber).approve(engineAddr, 1_000n * ONE);
        await engine.connect(briber).notifyTokenRewards(await bribe.getAddress(), 1_000n * ONE);

        const cfg2 = defaultEngineConfig(ethers);
        cfg2.durationLinearWad = ethers.parseUnits("0.1", 18);
        cfg2.durationQuadraticWad = 0n;
        await engine.connect(deployer).proposeConfig(cfg2);
        await mineTime(ethers, CONFIG_DELAY + 1n);
        await engine.connect(deployer).executeConfig();
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(deployer).poke();

        await expect(engine.connect(alice).extend(1n, 1n))
            .to.be.revertedWithCustomError(engine, "InvalidExtension");
    });
});

// ────────────────────────────────────────────────────────────────────────────
// F. NARA reward top-ups / flash fees
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
describe("NARAEngine v4 â€” NARA reward top-ups", () => {
    let ethers: any;
    let deployer: Signer, treasury: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, treasury] = await ethers.getSigners();
    });

    it("syncEmissionReserve tracks direct NARA top-ups such as flash-loan fees", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const before = await engine.emissionReserve();
        const topUp = 10n * ONE;

        await token.connect(treasury).transfer(engineAddr, topUp);
        expect(await engine.emissionReserve()).to.equal(before);

        await engine.connect(deployer).syncEmissionReserve();
        expect(await engine.emissionReserve()).to.equal(before + topUp);
    });

    it("NARAToken flash-loan fees sent to the engine can be synced into emission reserve", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const borrower = await ethers.deployContract("MockFlashBorrower", [await token.getAddress()]);
        await borrower.waitForDeployment();

        const loan = 10_000n * ONE;
        const fee = await token.flashFee(await token.getAddress(), loan);
        await token.connect(treasury).transfer(await borrower.getAddress(), fee);

        const before = await engine.emissionReserve();
        await borrower.flashBorrow(await token.getAddress(), loan, "0x");
        await engine.connect(deployer).syncEmissionReserve();

        expect(await engine.emissionReserve()).to.equal(before + fee);
        expect(await token.balanceOf(engineAddr)).to.be.gte(before + fee);
    });

    it("caps circulating supply snapshots during flash-mint epoch advancement", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const borrower = await ethers.deployContract(
            "MockFlashAdvanceBorrower",
            [await token.getAddress(), engineAddr],
        );
        await borrower.waitForDeployment();

        const loan = 10_000n * ONE;
        const fee = await token.flashFee(await token.getAddress(), loan);
        await token.connect(treasury).transfer(await borrower.getAddress(), fee);
        await mineTime(ethers, EPOCH_SECONDS);

        await borrower.flashBorrowAndAdvance(await token.getAddress(), loan, 1);

        const snapshot = await engine.epochState();
        expect(snapshot.circulatingSupply).to.equal(MAX_SUPPLY - 100_000n * ONE);
        expect(await token.balanceOf(engineAddr)).to.equal(100_000n * ONE + fee);
    });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// G. Batch ops
// ────────────────────────────────────────────────────────────────────────────
describe("NARAEngine v4 — batch ops", () => {
    let ethers: any;
    let deployer: Signer, treasury: Signer, alice: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, treasury, alice] = await ethers.getSigners();
    });

    it("claimBatch + unlockBatch process multiple positions", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, 3_000n * ONE);
        await token.connect(alice).approve(engineAddr, 3_000n * ONE);

        await engine.connect(alice).lock(1_000n * ONE, 10n, 0n);
        await engine.connect(alice).lock(1_000n * ONE, 10n, 0n);
        await engine.connect(alice).lock(1_000n * ONE, 10n, 0n);

        const ids = [1n, 2n, 3n];
        expect(ids.length).to.equal(3);

        // Age past activation
        await mineTime(ethers, EPOCH_SECONDS * 6n);
        await engine.connect(alice).poke();

        const [totalNara] = await engine.connect(alice).claimBatch.staticCall(ids, aliceAddr);
        expect(totalNara).to.be.gt(0n);
        await engine.connect(alice).claimBatch(ids, aliceAddr);

        // Mature and unlock batch
        await mineTime(ethers, EPOCH_SECONDS * 20n);
        await engine.connect(alice).poke();
        await engine.connect(alice).poke();

        await engine.connect(alice).unlockBatch(ids);
        expect((await engine.positionOf(1n)).amount).to.equal(0n);
        expect((await engine.positionOf(2n)).amount).to.equal(0n);
        expect((await engine.positionOf(3n)).amount).to.equal(0n);
        expect(await engine.totalLocked()).to.equal(0n);
    });

    it("unlockBatch requires the flat unlock fee for each position", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();
        const unlockFee = BigInt(1e14);

        await engine.connect(deployer).setUnlockEthFee(unlockFee);
        await token.connect(treasury).transfer(aliceAddr, 2_000n * ONE);
        await token.connect(alice).approve(engineAddr, 2_000n * ONE);

        await engine.connect(alice).lock(1_000n * ONE, 10n, 0n);
        await engine.connect(alice).lock(1_000n * ONE, 10n, 0n);

        const ids = [1n, 2n];
        await mineTime(ethers, EPOCH_SECONDS * 20n);
        await engine.connect(alice).poke();
        await engine.connect(alice).poke();

        await expect(
            engine.connect(alice).unlockBatch(ids, { value: unlockFee }),
        ).to.be.revertedWithCustomError(engine, "InsufficientFee");
        expect(await engine.accumulatedTreasuryEthFees()).to.equal(0n);

        await engine.connect(alice).unlockBatch(ids, { value: unlockFee * 2n });
        expect(await engine.accumulatedTreasuryEthFees()).to.equal(unlockFee * 2n);
        expect((await engine.positionOf(1n)).amount).to.equal(0n);
        expect((await engine.positionOf(2n)).amount).to.equal(0n);
        expect(await engine.totalLocked()).to.equal(0n);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// G. Config timelock + one-shot setters
// ────────────────────────────────────────────────────────────────────────────
describe("NARAEngine v4 — admin controls", () => {
    let ethers: any;
    let deployer: Signer, treasury: Signer, alice: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, treasury, alice] = await ethers.getSigners();
    });

    it("config timelock: propose -> wait -> execute", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        const cfg2 = defaultEngineConfig(ethers);
        cfg2.bWad = ethers.parseUnits("0.80", 18); // changed parameter

        await engine.connect(deployer).proposeConfig(cfg2);
        await expect(
            engine.connect(deployer).executeConfig(),
        ).to.be.revertedWithCustomError(engine, "ConfigTimelockNotElapsed");

        await mineTime(ethers, CONFIG_DELAY + 1n);
        await engine.connect(deployer).executeConfig();

        // Staged for epoch+1; advance one epoch to apply.
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(deployer).poke();

        const live = await engine.config();
        expect(live.bWad).to.equal(ethers.parseUnits("0.80", 18));
    });

    it("proposeConfig reverts ConfigExists when one is already pending", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        const cfg = defaultEngineConfig(ethers);
        await engine.connect(deployer).proposeConfig(cfg);
        await expect(
            engine.connect(deployer).proposeConfig(cfg),
        ).to.be.revertedWithCustomError(engine, "ConfigExists");
    });

    it("cancelConfig clears pending config", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        const cfg = defaultEngineConfig(ethers);
        await engine.connect(deployer).proposeConfig(cfg);
        await engine.connect(deployer).cancelConfig();
        expect(await engine.pendingConfigTimestamp()).to.equal(0n);
    });

    it("one-shot setters: setRewardReserve / setBondVault cannot be reused", async () => {
        const { token, engine, tokenAddr, engineAddr } = await launchSystem(ethers, deployer, treasury);

        await expect(
            engine.connect(deployer).setRewardReserve(await alice.getAddress()),
        ).to.be.revertedWithCustomError(engine, "InvalidConfig");

        const reserve = await ethers.deployContract("NARARewardReserve", [await deployer.getAddress(), 100_000n * ONE], deployer);
        await reserve.waitForDeployment();
        await reserve.connect(deployer).setNara(tokenAddr);

        const notEngine = await ethers.deployContract("NARABondVaultV4", [await deployer.getAddress(), 86_400, 10_000n * ONE], deployer);
        await notEngine.waitForDeployment();
        await notEngine.connect(deployer).setNara(tokenAddr);
        await expect(
            reserve.connect(deployer).setEngine(await notEngine.getAddress()),
        ).to.be.revertedWithCustomError(reserve, "InvalidEngine");

        await reserve.connect(deployer).setEngine(engineAddr);
        await token.connect(treasury).transfer(await reserve.getAddress(), 1_000n * ONE);

        await engine.connect(deployer).setRewardReserve(await reserve.getAddress());
        await expect(
            engine.connect(deployer).setRewardReserve(await treasury.getAddress()),
        ).to.be.revertedWithCustomError(engine, "AlreadySet");

        await expect(
            engine.connect(deployer).setBondVault(await alice.getAddress()),
        ).to.be.revertedWithCustomError(engine, "InvalidConfig");

        const bondVault = await ethers.deployContract("NARABondVaultV4", [await deployer.getAddress(), 86_400, 10_000n * ONE], deployer);
        await bondVault.waitForDeployment();
        const wrongToken = await deployErc20(ethers, deployer, await treasury.getAddress());
        const badBondVault = await ethers.deployContract("NARABondVaultV4", [await deployer.getAddress(), 86_400, 10_000n * ONE], deployer);
        await badBondVault.waitForDeployment();
        await badBondVault.connect(deployer).setNara(await wrongToken.getAddress());
        await expect(
            engine.connect(deployer).setBondVault(await badBondVault.getAddress()),
        ).to.be.revertedWithCustomError(engine, "InvalidConfig");

        await bondVault.connect(deployer).setNara(tokenAddr);
        await engine.connect(deployer).setBondVault(await bondVault.getAddress());
        await expect(
            engine.connect(deployer).setBondVault(await treasury.getAddress()),
        ).to.be.revertedWithCustomError(engine, "AlreadySet");
    });

    it("withdrawTreasuryEthFees drains accumulated ETH to recipient", async () => {
        const { token, engine, engineAddr } = await launchSystem(ethers, deployer, treasury);
        await engine.connect(deployer).setLockEthFee(BigInt(1e14));

        const aliceAddr = await alice.getAddress();
        await token.connect(treasury).transfer(aliceAddr, 100n * ONE);
        await token.connect(alice).approve(engineAddr, 100n * ONE);
        await engine.connect(alice).lock(100n * ONE, 50n, 0n, { value: BigInt(1e14) });

        expect(await engine.accumulatedTreasuryEthFees()).to.equal(BigInt(1e14));

        const preBal = await ethers.provider.getBalance(await treasury.getAddress());
        await engine.connect(deployer).withdrawTreasuryEthFees(await treasury.getAddress());
        const postBal = await ethers.provider.getBalance(await treasury.getAddress());
        expect(postBal - preBal).to.equal(BigInt(1e14));
        expect(await engine.accumulatedTreasuryEthFees()).to.equal(0n);
    });

    it("emits explicit events for governance-critical setter changes", async () => {
        const { token, engine, tokenAddr, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const reserve = await ethers.deployContract("NARARewardReserve", [await deployer.getAddress(), 100_000n * ONE], deployer);
        await reserve.waitForDeployment();
        await reserve.connect(deployer).setNara(tokenAddr);
        await reserve.connect(deployer).setEngine(engineAddr);
        await token.connect(treasury).transfer(await reserve.getAddress(), 1_000n * ONE);

        await expect(engine.connect(deployer).setTreasury(await treasury.getAddress()))
            .to.emit(engine, "AddressParameterSet")
            .withArgs(ethers.keccak256(ethers.toUtf8Bytes("treasury")), await treasury.getAddress());
        await expect(engine.connect(deployer).setRewardReserve(await reserve.getAddress()))
            .to.emit(engine, "AddressParameterSet")
            .withArgs(ethers.keccak256(ethers.toUtf8Bytes("rewardReserve")), await reserve.getAddress());
        const bondVault = await ethers.deployContract("NARABondVaultV4", [await deployer.getAddress(), 86_400, 10_000n * ONE], deployer);
        await bondVault.waitForDeployment();
        await bondVault.connect(deployer).setNara(tokenAddr);
        await expect(engine.connect(deployer).setBondVault(await bondVault.getAddress()))
            .to.emit(engine, "AddressParameterSet")
            .withArgs(ethers.keccak256(ethers.toUtf8Bytes("bondVault")), await bondVault.getAddress());
        await expect(engine.connect(deployer).setLockFee(100))
            .to.emit(engine, "UintParameterSet")
            .withArgs(ethers.keccak256(ethers.toUtf8Bytes("lockFeeBps")), 100);
        await expect(engine.connect(deployer).setClaimFee(200))
            .to.emit(engine, "UintParameterSet")
            .withArgs(ethers.keccak256(ethers.toUtf8Bytes("claimFeeBps")), 200);
        await expect(engine.connect(deployer).setLockEthFee(BigInt(1e14)))
            .to.emit(engine, "UintParameterSet")
            .withArgs(ethers.keccak256(ethers.toUtf8Bytes("lockFeeWei")), BigInt(1e14));
        await expect(engine.connect(deployer).setUnlockEthFee(BigInt(2e14)))
            .to.emit(engine, "UintParameterSet")
            .withArgs(ethers.keccak256(ethers.toUtf8Bytes("unlockFeeWei")), BigInt(2e14));
    });

    it("setLockFee / setClaimFee / setLockEthFee enforce hard caps", async () => {
        const { engine } = await launchSystem(ethers, deployer, treasury);
        await expect(
            engine.connect(deployer).setLockFee(1001),
        ).to.be.revertedWithCustomError(engine, "InvalidConfig");
        await expect(
            engine.connect(deployer).setClaimFee(1001),
        ).to.be.revertedWithCustomError(engine, "InvalidConfig");
        await expect(
            engine.connect(deployer).setLockEthFee(BigInt(2e16)),
        ).to.be.revertedWithCustomError(engine, "InvalidConfig");
    });

    it("M-01: successful reserve under-delivery is measured and cannot mint phantom rewards", async () => {
        const { token, engine, tokenAddr, engineAddr } = await launchSystem(ethers, deployer, treasury, 0n);
        const aliceAddr = await alice.getAddress();
        const amt = 1_000n * ONE;

        await token.connect(treasury).transfer(aliceAddr, amt);
        await token.connect(alice).approve(engineAddr, amt);
        await engine.connect(alice).lock(amt, 100n, 0n);

        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();
        expect(await engine.emissionReserve()).to.equal(0n);

        const badReserve = await ethers.deployContract(
            "contracts/v4/mocks/MockMaliciousRewardReserve.sol:MockMaliciousRewardReserve",
            [],
            deployer,
        );
        await badReserve.waitForDeployment();
        const badReserveAddr = await badReserve.getAddress();
        await badReserve.configure(tokenAddr, engineAddr);
        await token.connect(treasury).transfer(badReserveAddr, 1_000n * ONE);
        await badReserve.setAvailable(1_000n * ONE);
        await badReserve.setReleaseAmount(1n);
        await engine.connect(deployer).setRewardReserve(badReserveAddr);

        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).advanceEpochs(1);
        const snap = await engine.epochState();
        expect(snap.distributedNara).to.equal(1n);
        expect(await engine.totalPendingNaraRewards()).to.equal(1n);
        expect(await engine.trackedEmissionReserve()).to.equal(0n);

        const balance = await token.balanceOf(engineAddr);
        const requiredBacking = await engine.totalLocked() + await engine.totalPendingNaraRewards();
        expect(balance).to.be.gte(requiredBacking);
    });

    // M-04 (audit 2026-06-10): rewardReserve.availableRewards()/releaseToEngine() are consulted
    // inside _advanceOneEpoch. A reserve that reverts there used to freeze every user mutation
    // (all go through _jitAdvanceFresh). The fix wraps both calls in try/catch and falls back to
    // locally-held emission funds, so a misbehaving reserve can never brick the engine.
    it("M-04: a reverting reward reserve does not freeze epoch advancement (fails open)", async () => {
        const { token, engine, tokenAddr, engineAddr } = await launchSystem(ethers, deployer, treasury);
        const aliceAddr = await alice.getAddress();

        // Active locker so epoch advances distribute NARA (distributedNara > 0 -> reserve consulted).
        await token.connect(treasury).transfer(aliceAddr, 1_000n * ONE);
        await token.connect(alice).approve(engineAddr, 1_000n * ONE);
        await engine.connect(alice).lock(1_000n * ONE, 100n, 0n);
        await mineTime(ethers, EPOCH_SECONDS * 5n);
        await engine.connect(alice).poke();

        // Wire a reserve that passes setRewardReserve validation but can be flipped hostile.
        const badReserve = await ethers.deployContract(
            "contracts/v4/mocks/MockMaliciousRewardReserve.sol:MockMaliciousRewardReserve",
            [],
            deployer,
        );
        await badReserve.waitForDeployment();
        await badReserve.configure(tokenAddr, engineAddr);
        await engine.connect(deployer).setRewardReserve(await badReserve.getAddress());

        // Flip it hostile: availableRewards()/releaseToEngine() now revert.
        await badReserve.setBoom(true);

        // Epoch advance must still succeed and actually distribute (reserve revert is caught).
        await mineTime(ethers, EPOCH_SECONDS);
        const before = (await engine.epochState()).epoch;
        await expect(engine.connect(alice).advanceEpochs(1)).to.emit(engine, "EpochAdvanced");
        const snap = await engine.epochState();
        expect(snap.epoch).to.be.gt(before);
        expect(snap.distributedNara).to.be.gt(0n); // confirms the reserve path was exercised

        // And ordinary user flows are not bricked either.
        await mineTime(ethers, EPOCH_SECONDS);
        await engine.connect(alice).poke(); // reverts here would fail the test
    });
});
