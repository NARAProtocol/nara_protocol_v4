/**
 * NARARouter — test suite
 *
 * Covers:
 *  - syncEpochs() with backlog 0, 1, 8, 9, 20 (keeper-elimination linchpin)
 *  - syncEpochs(uint256 maxSteps) capping behaviour
 *  - syncAndLockWithPermit: permit → sync → lock in one tx
 *  - syncAndMintAndLockWithPermit: permit → sync → mintAndLockFor in one tx
 *  - Router holds zero NARA after every call (invariant)
 *  - ETH fee forwarding to engine
 *  - Permit try/catch: works even if already approved (swallowed gracefully)
 *
 * Uses MockEngineForRouter, MockNFTForRouter, MockERC20Permit.
 * Hardhat 3 pattern: hre.network.connect() in before(); fresh deploy per it().
 */

import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";

const ONE      = 10n ** 18n;
const LOCK_FEE = 10n ** 14n;   // 0.0001 ETH

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

async function deployFixture() {
    const { ethers } = await hre.network.connect();
    const [deployer, alice, bob] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20Permit", deployer);
    const nara: any = await Token.deploy("NARA Token", "NARA");
    await nara.waitForDeployment();

    const Engine = await ethers.getContractFactory("MockEngineForRouter", deployer);
    const engine: any = await Engine.deploy();
    await engine.waitForDeployment();
    await engine.setNara(await nara.getAddress());

    const NFT = await ethers.getContractFactory("MockNFTForRouter", deployer);
    const nft: any = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.setNara(await nara.getAddress());
    await nft.setEngine(await engine.getAddress());

    const Router = await ethers.getContractFactory("NARARouter", deployer);
    const router: any = await Router.deploy(
        await engine.getAddress(),
        await nft.getAddress(),
    );
    await router.waitForDeployment();

    await nara.mint(await alice.getAddress(), 100_000n * ONE);
    await nara.mint(await bob.getAddress(),   100_000n * ONE);

    return { ethers, deployer, alice, bob, nara, engine, nft, router };
}

// ---------------------------------------------------------------------------
// EIP-2612 permit helper
// ---------------------------------------------------------------------------

async function signPermit(
    ethers: any,
    token: any,
    owner: Signer,
    spender: string,
    amount: bigint,
    deadline: bigint,
) {
    const ownerAddr = await owner.getAddress();
    const nonce     = await token.nonces(ownerAddr);
    const chainId   = (await ethers.provider.getNetwork()).chainId;
    const domain = {
        name:              "NARA Token",
        version:           "1",
        chainId,
        verifyingContract: await token.getAddress(),
    };
    const types = {
        Permit: [
            { name: "owner",    type: "address" },
            { name: "spender",  type: "address" },
            { name: "value",    type: "uint256" },
            { name: "nonce",    type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };
    const message = { owner: ownerAddr, spender, value: amount, nonce, deadline };
    const sig = await (owner as any).signTypedData(domain, types, message);
    return ethers.Signature.from(sig);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NARARouter", () => {
    let ethers: any;
    let deployer: Signer, alice: Signer, bob: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, alice, bob] = await ethers.getSigners();
    });

    // -----------------------------------------------------------------------
    // A. syncEpochs()
    // -----------------------------------------------------------------------

    describe("syncEpochs() — no backlog", () => {
        it("returns 0 and does not call advanceEpochs when live == settled", async () => {
            const { engine, router } = await deployFixture();
            // liveEpoch == settledEpoch == 0
            const steps = await router["syncEpochs()"].staticCall();
            expect(steps).to.equal(0n);
            await router["syncEpochs()"]();
            expect(await engine.advanceEpochsCalls()).to.equal(0n);
        });
    });

    for (const backlog of [1n, 8n, 9n, 20n]) {
        describe(`syncEpochs() — backlog ${backlog}`, () => {
            it(`advances all ${backlog} epochs and settledEpoch matches`, async () => {
                const { engine, router } = await deployFixture();
                await engine.setLiveEpoch(backlog);

                const steps = await router["syncEpochs()"].staticCall();
                expect(steps).to.equal(backlog);

                await router["syncEpochs()"]();
                expect(await engine.settledEpoch()).to.equal(backlog);
                expect(await engine.advanceEpochsCalls()).to.equal(1n);
            });
        });
    }

    // -----------------------------------------------------------------------
    // B. syncEpochs(uint256 maxSteps)
    // -----------------------------------------------------------------------

    describe("syncEpochs(uint256 maxSteps)", () => {
        it("returns 0 for maxSteps == 0", async () => {
            const { engine, router } = await deployFixture();
            await engine.setLiveEpoch(5n);
            const steps = await router["syncEpochs(uint256)"].staticCall(0n);
            expect(steps).to.equal(0n);
            await router["syncEpochs(uint256)"](0n);
            expect(await engine.advanceEpochsCalls()).to.equal(0n);
        });

        it("returns 0 when no backlog regardless of maxSteps", async () => {
            const { router } = await deployFixture();
            const steps = await router["syncEpochs(uint256)"].staticCall(100n);
            expect(steps).to.equal(0n);
        });

        it("advances exactly maxSteps when backlog > maxSteps", async () => {
            const { engine, router } = await deployFixture();
            await engine.setLiveEpoch(20n);
            await router["syncEpochs(uint256)"](5n);
            expect(await engine.settledEpoch()).to.equal(5n);
        });

        it("advances full backlog when maxSteps >= backlog", async () => {
            const { engine, router } = await deployFixture();
            await engine.setLiveEpoch(10n);
            const steps = await router["syncEpochs(uint256)"].staticCall(50n);
            expect(steps).to.equal(10n);
            await router["syncEpochs(uint256)"](50n);
            expect(await engine.settledEpoch()).to.equal(10n);
        });

        it("clears large backlog in chained calls", async () => {
            const { engine, router } = await deployFixture();
            await engine.setLiveEpoch(25n);
            await router["syncEpochs(uint256)"](10n);
            await router["syncEpochs(uint256)"](10n);
            await router["syncEpochs(uint256)"](10n);
            expect(await engine.settledEpoch()).to.equal(25n);
        });
    });

    // -----------------------------------------------------------------------
    // C. syncAndLockWithPermit
    // -----------------------------------------------------------------------

    describe("syncAndLockWithPermit()", () => {
        it("creates engine position owned by msg.sender", async () => {
            const { nara, engine, router, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            const routerAddr = await router.getAddress();
            const amount   = 1_000n * ONE;
            const duration = 50n;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);

            const posId = await router.connect(alice).syncAndLockWithPermit.staticCall(
                amount, duration, 0n, deadline, sig.v, sig.r, sig.s,
            );
            await router.connect(alice).syncAndLockWithPermit(
                amount, duration, 0n, deadline, sig.v, sig.r, sig.s,
            );

            const pos = await engine.positionOf(posId);
            expect(pos.owner).to.equal(aliceAddr);
            expect(BigInt(pos.amount)).to.equal(amount);
        });

        it("router holds zero NARA after call", async () => {
            const { nara, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            const amount = 500n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);

            await router.connect(alice).syncAndLockWithPermit(amount, 30n, 0n, deadline, sig.v, sig.r, sig.s);
            expect(await nara.balanceOf(routerAddr)).to.equal(0n);
        });

        it("engine allowance cleared to 0 after call", async () => {
            const { nara, engine, router, alice } = await deployFixture();
            const routerAddr  = await router.getAddress();
            const engineAddr  = await engine.getAddress();
            const amount = 1_000n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);

            await router.connect(alice).syncAndLockWithPermit(amount, 50n, 0n, deadline, sig.v, sig.r, sig.s);
            expect(await nara.allowance(routerAddr, engineAddr)).to.equal(0n);
        });

        it("syncs backlog before locking", async () => {
            const { nara, engine, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            await engine.setLiveEpoch(7n);
            expect(await engine.settledEpoch()).to.equal(0n);

            const amount = 1_000n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);
            await router.connect(alice).syncAndLockWithPermit(amount, 50n, 0n, deadline, sig.v, sig.r, sig.s);

            expect(await engine.settledEpoch()).to.equal(7n);
        });

        it("works when permit already approved (swallows revert)", async () => {
            const { nara, engine, router, alice } = await deployFixture();
            const aliceAddr  = await alice.getAddress();
            const routerAddr = await router.getAddress();
            const amount = 1_000n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;

            // Pre-approve so the permit signature would cause a nonce reuse revert.
            await nara.connect(alice).approve(routerAddr, amount);
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);
            // Consume the nonce by calling again — now sig is stale.
            const sig2 = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);

            // Should still work: pre-approval covers the pull, stale permit is swallowed.
            await router.connect(alice).syncAndLockWithPermit(amount, 50n, 0n, deadline, sig.v, sig2.r, sig2.s);
            const pos = await engine.positionOf(1n);
            expect(pos.owner).to.equal(aliceAddr);
            expect(await nara.balanceOf(routerAddr)).to.equal(0n);
        });

        it("forwards ETH lockFeeWei to engine", async () => {
            const { ethers: fx, nara, engine, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            const engineAddr = await engine.getAddress();
            const amount = 1_000n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(fx, nara, alice, routerAddr, amount, deadline);

            const balBefore = await fx.provider.getBalance(engineAddr);
            await router.connect(alice).syncAndLockWithPermit(
                amount, 50n, 0n, deadline, sig.v, sig.r, sig.s,
                { value: LOCK_FEE },
            );
            const balAfter = await fx.provider.getBalance(engineAddr);
            expect(balAfter - balBefore).to.equal(LOCK_FEE);
        });
    });

    // -----------------------------------------------------------------------
    // D. syncAndMintAndLockWithPermit
    // -----------------------------------------------------------------------

    describe("syncAndMintAndLockWithPermit()", () => {
        it("creates NFT token and engine position for msg.sender", async () => {
            const { nara, engine, router, alice } = await deployFixture();
            const aliceAddr  = await alice.getAddress();
            const routerAddr = await router.getAddress();
            const amount   = 1_000n * ONE;
            const duration = 50n;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);

            const [tokenId, posId] = await router.connect(alice).syncAndMintAndLockWithPermit.staticCall(
                amount, duration, 0n, deadline, sig.v, sig.r, sig.s,
            );
            await router.connect(alice).syncAndMintAndLockWithPermit(
                amount, duration, 0n, deadline, sig.v, sig.r, sig.s,
            );

            expect(tokenId).to.equal(1n);
            const pos = await engine.positionOf(posId);
            expect(pos.owner).to.equal(aliceAddr);
            expect(BigInt(pos.amount)).to.equal(amount);
        });

        it("router holds zero NARA after call", async () => {
            const { nara, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            const amount = 1_000n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);

            await router.connect(alice).syncAndMintAndLockWithPermit(amount, 50n, 0n, deadline, sig.v, sig.r, sig.s);
            expect(await nara.balanceOf(routerAddr)).to.equal(0n);
        });

        it("NFT allowance cleared to 0 after call", async () => {
            const { nara, nft, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            const nftAddr    = await nft.getAddress();
            const amount = 1_000n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);

            await router.connect(alice).syncAndMintAndLockWithPermit(amount, 50n, 0n, deadline, sig.v, sig.r, sig.s);
            expect(await nara.allowance(routerAddr, nftAddr)).to.equal(0n);
        });

        it("syncs backlog before minting", async () => {
            const { nara, engine, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            await engine.setLiveEpoch(3n);
            const amount = 1_000n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);

            await router.connect(alice).syncAndMintAndLockWithPermit(amount, 50n, 0n, deadline, sig.v, sig.r, sig.s);
            expect(await engine.settledEpoch()).to.equal(3n);
        });

        it("forwards ETH lockFeeWei to engine via NFT", async () => {
            const { ethers: fx, nara, engine, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            const engineAddr = await engine.getAddress();
            const amount = 1_000n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(fx, nara, alice, routerAddr, amount, deadline);

            const balBefore = await fx.provider.getBalance(engineAddr);
            await router.connect(alice).syncAndMintAndLockWithPermit(
                amount, 50n, 0n, deadline, sig.v, sig.r, sig.s,
                { value: LOCK_FEE },
            );
            const balAfter = await fx.provider.getBalance(engineAddr);
            expect(balAfter - balBefore).to.equal(LOCK_FEE);
        });
    });

    // -----------------------------------------------------------------------
    // E. NARA balance invariant
    // -----------------------------------------------------------------------

    describe("NARA balance invariant — router always holds 0", () => {
        it("zero before any call", async () => {
            const { nara, router } = await deployFixture();
            expect(await nara.balanceOf(await router.getAddress())).to.equal(0n);
        });

        it("zero after syncEpochs", async () => {
            const { nara, engine, router } = await deployFixture();
            await engine.setLiveEpoch(5n);
            await router["syncEpochs()"]();
            expect(await nara.balanceOf(await router.getAddress())).to.equal(0n);
        });

        it("zero after syncAndLockWithPermit", async () => {
            const { nara, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            const amount = 800n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);
            await router.connect(alice).syncAndLockWithPermit(amount, 40n, 0n, deadline, sig.v, sig.r, sig.s);
            expect(await nara.balanceOf(routerAddr)).to.equal(0n);
        });

        it("zero after syncAndMintAndLockWithPermit", async () => {
            const { nara, router, alice } = await deployFixture();
            const routerAddr = await router.getAddress();
            const amount = 800n * ONE;
            const deadline = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
            const sig = await signPermit(ethers, nara, alice, routerAddr, amount, deadline);
            await router.connect(alice).syncAndMintAndLockWithPermit(amount, 40n, 0n, deadline, sig.v, sig.r, sig.s);
            expect(await nara.balanceOf(routerAddr)).to.equal(0n);
        });
    });

    // -----------------------------------------------------------------------
    // F. Immutables
    // -----------------------------------------------------------------------

    describe("immutables", () => {
        it("ENGINE and NFT are set from constructor", async () => {
            const { engine, nft, router } = await deployFixture();
            expect(await router.ENGINE()).to.equal(await engine.getAddress());
            expect(await router.NFT()).to.equal(await nft.getAddress());
        });

        it("NARA_TOKEN is resolved from engine.NARA()", async () => {
            const { nara, router } = await deployFixture();
            expect(await router.NARA_TOKEN()).to.equal(await nara.getAddress());
        });

        it("reverts RouterZeroAddress when engine is zero", async () => {
            const { ethers, deployer, nft } = await deployFixture();
            const Router = await ethers.getContractFactory("NARARouter", deployer);
            await expect(
                Router.deploy(ethers.ZeroAddress, await nft.getAddress()),
            ).to.be.revertedWithCustomError({ interface: Router.interface }, "RouterZeroAddress");
        });

        it("rejects an NFT paired with a different engine", async () => {
            const { ethers, deployer, nft } = await deployFixture();
            const Engine = await ethers.getContractFactory("MockEngineForRouter", deployer);
            const otherEngine: any = await Engine.deploy();
            await otherEngine.waitForDeployment();
            const Router = await ethers.getContractFactory("NARARouter", deployer);
            await expect(Router.deploy(await otherEngine.getAddress(), await nft.getAddress()))
              .to.be.revertedWithCustomError({ interface: Router.interface }, "RouterPairingMismatch");
        });
    });
});
