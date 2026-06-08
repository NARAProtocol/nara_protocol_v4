/**
 * BribeRouterV4 — test suite
 *
 * Covers:
 *  - Constructor validation
 *  - notify() happy path: token pulled from caller, forwarded to engine, router holds 0
 *  - Engine approval cleared after every call
 *  - Reverts: NARA token, zero token, zero amount, insufficient allowance
 *  - Engine-side revert propagates (NoActiveWeight)
 *  - Multiple sequential bribes from different callers
 *
 * Uses a lightweight MockEngineForBribe that implements notifyTokenRewards
 * with the same safeTransferFrom pull-from-msg.sender semantics as the real engine.
 */

import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";

const ONE = 10n ** 18n;

// ---------------------------------------------------------------------------
// Inline mock — avoids creating a Solidity file just for this test
// We reuse MockERC20 (already exists) and MockEngineForRouter (already exists)
// but MockEngineForRouter's notifyTokenRewards pulls differently, so we deploy
// a small bespoke mock inline via ContractFactory.
// ---------------------------------------------------------------------------

async function deployFixture() {
    const { ethers } = await hre.network.connect();
    const [deployer, alice, bob] = await ethers.getSigners();

    // Deploy a mock NARA token (used as the blocked token guard)
    const Token = await ethers.getContractFactory("MockERC20Permit", deployer);
    const nara: any = await Token.deploy("NARA Protocol", "NARA");
    await nara.waitForDeployment();

    // Deploy a separate ERC-20 for bribes
    const MockERC20 = await ethers.getContractFactory("MockERC20", deployer);
    const usdc: any = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();
    const weth: any = await MockERC20.deploy("Wrapped ETH", "WETH", 18);
    await weth.waitForDeployment();

    // Deploy mock engine that:
    //   - exposes NARA()
    //   - exposes notifyTokenRewards(token, amount) -> pulls from msg.sender
    //   - tracks what was received
    //   - can be set to revert (simulates NoActiveWeight)
    const EngineFactory = await ethers.getContractFactory("MockEngineForBribe", deployer);
    const engine: any = await EngineFactory.deploy(await nara.getAddress());
    await engine.waitForDeployment();

    const BribeRouter = await ethers.getContractFactory("BribeRouterV4", deployer);
    const bribeRouter: any = await BribeRouter.deploy(await engine.getAddress(), await usdc.getAddress(), 1n);
    await bribeRouter.waitForDeployment();

    // Mint bribe tokens to alice and bob
    await usdc.mint(await alice.getAddress(), 1_000_000n * 10n**6n);
    await usdc.mint(await bob.getAddress(),   1_000_000n * 10n**6n);
    await weth.mint(await alice.getAddress(), 100n * ONE);

    return { ethers, deployer, alice, bob, nara, usdc, weth, engine, bribeRouter };
}

describe("BribeRouterV4", () => {
    let ethers: any;
    let deployer: Signer, alice: Signer, bob: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, alice, bob] = await ethers.getSigners();
    });

    // -----------------------------------------------------------------------
    // A. Constructor
    // -----------------------------------------------------------------------

    describe("constructor", () => {
        it("stores ENGINE immutable and resolves NARA", async () => {
            const { nara, usdc, engine, bribeRouter } = await deployFixture();
            expect(await bribeRouter.ENGINE()).to.equal(await engine.getAddress());
            expect(await bribeRouter.NARA()).to.equal(await nara.getAddress());
            expect(await bribeRouter.REWARD_TOKEN()).to.equal(await usdc.getAddress());
        });

        it("reverts BribeRouterZeroAddress on zero engine", async () => {
            const { ethers, deployer, usdc } = await deployFixture();
            const BR = await ethers.getContractFactory("BribeRouterV4", deployer);
            await expect(BR.deploy(ethers.ZeroAddress, await usdc.getAddress(), 1n))
                .to.be.revertedWithCustomError({ interface: BR.interface }, "BribeRouterZeroAddress");
        });
    });

    // -----------------------------------------------------------------------
    // B. Happy path
    // -----------------------------------------------------------------------

    describe("notify() — happy path", () => {
        it("pulls token from caller and delivers to engine", async () => {
            const { usdc, engine, bribeRouter, alice } = await deployFixture();
            const routerAddr  = await bribeRouter.getAddress();
            const engineAddr  = await engine.getAddress();
            const amount      = 500n * 10n**6n;

            await usdc.connect(alice).approve(routerAddr, amount);
            await bribeRouter.connect(alice).notify(await usdc.getAddress(), amount);

            // Engine received the USDC
            const [, receivedAmt] = await engine.lastNotified();
            expect(receivedAmt).to.equal(amount);
            expect(await usdc.balanceOf(engineAddr)).to.equal(amount);
        });

        it("router holds zero token balance after call", async () => {
            const { usdc, bribeRouter, alice } = await deployFixture();
            const routerAddr = await bribeRouter.getAddress();
            const amount     = 1000n * 10n**6n;

            await usdc.connect(alice).approve(routerAddr, amount);
            await bribeRouter.connect(alice).notify(await usdc.getAddress(), amount);

            expect(await usdc.balanceOf(routerAddr)).to.equal(0n);
        });

        it("engine approval is cleared to 0 after call", async () => {
            const { usdc, engine, bribeRouter, alice } = await deployFixture();
            const routerAddr = await bribeRouter.getAddress();
            const engineAddr = await engine.getAddress();
            const amount     = 100n * 10n**6n;

            await usdc.connect(alice).approve(routerAddr, amount);
            await bribeRouter.connect(alice).notify(await usdc.getAddress(), amount);

            expect(await usdc.allowance(routerAddr, engineAddr)).to.equal(0n);
        });

        it("emits BribeNotified event", async () => {
            const { usdc, bribeRouter, alice } = await deployFixture();
            const routerAddr = await bribeRouter.getAddress();
            const amount     = 200n * 10n**6n;

            await usdc.connect(alice).approve(routerAddr, amount);
            await expect(bribeRouter.connect(alice).notify(await usdc.getAddress(), amount))
                .to.emit(bribeRouter, "BribeNotified")
                .withArgs(await alice.getAddress(), await usdc.getAddress(), amount);
        });

        it("works with different token types through a dedicated router", async () => {
            const { ethers, deployer, weth, engine, alice } = await deployFixture();
            const BribeRouter = await ethers.getContractFactory("BribeRouterV4", deployer);
            const bribeRouter: any = await BribeRouter.deploy(await engine.getAddress(), await weth.getAddress(), 1n);
            await bribeRouter.waitForDeployment();
            const routerAddr = await bribeRouter.getAddress();
            const amount     = 5n * ONE;

            await weth.connect(alice).approve(routerAddr, amount);
            await bribeRouter.connect(alice).notify(await weth.getAddress(), amount);

            const [, receivedAmt] = await engine.lastNotified();
            expect(receivedAmt).to.equal(amount);
        });

        it("multiple sequential bribes from different callers", async () => {
            const { usdc, engine, bribeRouter, alice, bob } = await deployFixture();
            const routerAddr = await bribeRouter.getAddress();
            const amtA = 500n * 10n**6n;
            const amtB = 300n * 10n**6n;

            await usdc.connect(alice).approve(routerAddr, amtA);
            await bribeRouter.connect(alice).notify(await usdc.getAddress(), amtA);

            await usdc.connect(bob).approve(routerAddr, amtB);
            await bribeRouter.connect(bob).notify(await usdc.getAddress(), amtB);

            // Engine got both transfers; totalReceived tracks cumulative
            expect(await engine.totalReceived(await usdc.getAddress())).to.equal(amtA + amtB);
        });
    });

    // -----------------------------------------------------------------------
    // C. Reverts
    // -----------------------------------------------------------------------

    describe("notify() — reverts", () => {
        it("reverts BribeRouterNaraNotAllowed for NARA token", async () => {
            const { nara, bribeRouter, alice } = await deployFixture();
            const routerAddr = await bribeRouter.getAddress();
            await nara.mint(await alice.getAddress(), 1000n * ONE);
            await nara.connect(alice).approve(routerAddr, 1000n * ONE);
            await expect(
                bribeRouter.connect(alice).notify(await nara.getAddress(), 100n * ONE),
            ).to.be.revertedWithCustomError(bribeRouter, "BribeRouterNaraNotAllowed");
        });

        it("reverts BribeRouterNaraNotAllowed for zero address token", async () => {
            const { ethers, bribeRouter, alice } = await deployFixture();
            await expect(
                bribeRouter.connect(alice).notify(ethers.ZeroAddress, 100n * ONE),
            ).to.be.revertedWithCustomError(bribeRouter, "BribeRouterNaraNotAllowed");
        });

        it("reverts BribeRouterTokenNotAllowed for non-approved reward token", async () => {
            const { weth, bribeRouter, alice } = await deployFixture();
            await expect(
                bribeRouter.connect(alice).notify(await weth.getAddress(), ONE),
            ).to.be.revertedWithCustomError(bribeRouter, "BribeRouterTokenNotAllowed");
        });

        it("reverts BribeRouterZeroAmount for amount == 0", async () => {
            const { usdc, bribeRouter, alice } = await deployFixture();
            await expect(
                bribeRouter.connect(alice).notify(await usdc.getAddress(), 0n),
            ).to.be.revertedWithCustomError(bribeRouter, "BribeRouterZeroAmount");
        });

        it("reverts BribeRouterAmountTooSmall below the immutable minimum", async () => {
            const { ethers, deployer, usdc, engine, alice } = await deployFixture();
            const BribeRouter = await ethers.getContractFactory("BribeRouterV4", deployer);
            const bribeRouter: any = await BribeRouter.deploy(await engine.getAddress(), await usdc.getAddress(), 100n);
            await bribeRouter.waitForDeployment();
            await expect(
                bribeRouter.connect(alice).notify(await usdc.getAddress(), 99n),
            ).to.be.revertedWithCustomError(bribeRouter, "BribeRouterAmountTooSmall");
        });

        it("reverts on insufficient caller allowance (ERC20InsufficientAllowance)", async () => {
            const { usdc, bribeRouter, alice } = await deployFixture();
            // No approve — OZ v5 ERC-20 throws ERC20InsufficientAllowance
            await expect(
                bribeRouter.connect(alice).notify(await usdc.getAddress(), 100n * 10n**6n),
            ).to.be.revertedWithCustomError(usdc, "ERC20InsufficientAllowance");
        });

        it("propagates engine revert (NotifyFailed)", async () => {
            const { usdc, engine, bribeRouter, alice } = await deployFixture();
            const routerAddr = await bribeRouter.getAddress();
            await engine.setRevertOnNotify(true);
            await usdc.connect(alice).approve(routerAddr, 100n * 10n**6n);
            await expect(
                bribeRouter.connect(alice).notify(await usdc.getAddress(), 100n * 10n**6n),
            ).to.be.revertedWithCustomError(engine, "NotifyFailed");
        });

        it("router holds zero tokens even when engine reverts (no stuck tokens)", async () => {
            const { usdc, engine, bribeRouter, alice } = await deployFixture();
            const routerAddr = await bribeRouter.getAddress();
            await engine.setRevertOnNotify(true);
            await usdc.connect(alice).approve(routerAddr, 100n * 10n**6n);
            try {
                await bribeRouter.connect(alice).notify(await usdc.getAddress(), 100n * 10n**6n);
            } catch {}
            // If engine reverts, the whole tx rolls back so router holds 0
            expect(await usdc.balanceOf(routerAddr)).to.equal(0n);
        });
    });
});
