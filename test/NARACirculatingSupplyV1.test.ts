/**
 * NARACirculatingSupplyV1 — test suite
 *
 * Verifies the trustless market circulating-supply oracle:
 *  - Genesis math: total − reserve − bonds − vesting − treasury = LP seed (70k)
 *  - Self-updating: circulating rises as the reserve drips and the team vests
 *  - DEFINITION: user-locked NARA (held by a non-excluded contract) stays circulating
 *  - excludedMarketBalance() probe parity (bond vault off-balance inventory)
 *  - Clamping (never reverts; circulating ≥ 0, locked ≤ total) and supply cap
 *  - Transparency views: excludedAccounts / breakdown / supplyReport / percent / decimals
 *  - Constructor guards: zero token, EOA token, zero cap, zero/duplicate excluded
 *
 * Uses MockERC20Permit (mintable) and MockExcludedMarketHolder.
 */

import hre from "hardhat";
import { expect } from "chai";

const ONE = 10n ** 18n;
const MILLION = 1_000_000n * ONE;
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function deployFixture() {
    const { ethers } = await hre.network.connect();
    const signers = await ethers.getSigners();
    const [deployer, lp, user, team, engine, reserve, vesting, treasury] = signers;

    const Token = await ethers.getContractFactory("MockERC20Permit", deployer);
    const nara: any = await Token.deploy("NARA Token", "NARA");
    await nara.waitForDeployment();

    // Bond vault is a contract that also self-reports off-balance market inventory.
    const Holder = await ethers.getContractFactory("MockExcludedMarketHolder", deployer);
    const bondVault: any = await Holder.deploy();
    await bondVault.waitForDeployment();
    const bondVaultAddr = await bondVault.getAddress();

    // Genesis allocation (sums to exactly 1,000,000).
    await nara.mint(reserve.address, 650_000n * ONE);
    await nara.mint(bondVaultAddr, 200_000n * ONE);
    await nara.mint(vesting.address, 40_000n * ONE);
    await nara.mint(treasury.address, 40_000n * ONE);
    await nara.mint(lp.address, 70_000n * ONE);

    // Launch set: treasury is NOT excluded — it's earmarked for game sponsorship
    // (productive public capital), so it counts as circulating.
    const excluded = [reserve.address, bondVaultAddr, vesting.address, DEAD];

    const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1", deployer);
    const tracker: any = await Tracker.deploy(await nara.getAddress(), MILLION, excluded);
    await tracker.waitForDeployment();

    return {
        ethers, nara, tracker, bondVault, bondVaultAddr,
        deployer, lp, user, team, engine, reserve, vesting, treasury, excluded, Tracker,
    };
}

describe("NARACirculatingSupplyV1", () => {
    describe("genesis math", () => {
        it("circulating = LP seed + treasury (110k); locked = 890k; total = 1M", async () => {
            const { tracker } = await deployFixture();
            expect(await tracker.totalSupply()).to.equal(MILLION);
            expect(await tracker.circulatingSupply()).to.equal(110_000n * ONE);
            expect(await tracker.lockedSupply()).to.equal(890_000n * ONE);
        });

        it("percentCirculatingBps = 1100 (11.00%)", async () => {
            const { tracker } = await deployFixture();
            expect(await tracker.percentCirculatingBps()).to.equal(1100n);
        });

        it("supplyReport bundles every field in one call", async () => {
            const { tracker } = await deployFixture();
            const r = await tracker.supplyReport();
            expect(r.totalSupply).to.equal(MILLION);
            expect(r.circulating).to.equal(110_000n * ONE);
            expect(r.locked).to.equal(890_000n * ONE);
            expect(r.percentCircBps).to.equal(1100n);
            expect(r.excludedCount).to.equal(4n);
        });

        it("total = circulating + locked (identity holds)", async () => {
            const { tracker } = await deployFixture();
            const total = await tracker.totalSupply();
            const circ = await tracker.circulatingSupply();
            const locked = await tracker.lockedSupply();
            expect(circ + locked).to.equal(total);
        });
    });

    describe("self-updating (no transaction to the tracker)", () => {
        it("rises as the reward reserve drips to a holder", async () => {
            const { tracker, nara, reserve, user } = await deployFixture();
            await nara.connect(reserve).transfer(user.address, 5_000n * ONE);
            expect(await tracker.circulatingSupply()).to.equal(115_000n * ONE);
        });

        it("rises as the team vesting wallet releases", async () => {
            const { tracker, nara, vesting, team } = await deployFixture();
            await nara.connect(vesting).transfer(team.address, 4_000n * ONE);
            expect(await tracker.circulatingSupply()).to.equal(114_000n * ONE);
        });

        it("drip + vest compound", async () => {
            const { tracker, nara, reserve, vesting, user, team } = await deployFixture();
            await nara.connect(reserve).transfer(user.address, 5_000n * ONE);
            await nara.connect(vesting).transfer(team.address, 4_000n * ONE);
            expect(await tracker.circulatingSupply()).to.equal(119_000n * ONE);
        });
    });

    describe("DEFINITION: user-locked NARA counts as circulating", () => {
        it("moving NARA into a non-excluded contract (the engine) does not reduce circulating", async () => {
            const { tracker, nara, lp, engine } = await deployFixture();
            const before = await tracker.circulatingSupply();
            // Simulate a user locking: tokens leave the LP holder and sit in the engine,
            // which is NOT in the excluded set. They remain in public hands => circulating.
            await nara.connect(lp).transfer(engine.address, 10_000n * ONE);
            expect(await tracker.circulatingSupply()).to.equal(before);
            // And the engine's balance is indeed part of circulating (not netted out).
            expect(await nara.balanceOf(engine.address)).to.equal(10_000n * ONE);
        });

        it("the treasury is circulating (earmarked for game sponsorship, not excluded)", async () => {
            const { tracker, nara, treasury, user } = await deployFixture();
            // Treasury holds 40k and is NOT in the excluded set => part of circulating.
            expect(await nara.balanceOf(treasury.address)).to.equal(40_000n * ONE);
            const before = await tracker.circulatingSupply();
            expect(before).to.equal(110_000n * ONE);
            // Deploying it into a (non-excluded) game sponsor pool keeps it circulating.
            await nara.connect(treasury).transfer(user.address, 40_000n * ONE);
            expect(await tracker.circulatingSupply()).to.equal(before);
        });
    });

    describe("excludedMarketBalance() probe (bond inventory parity)", () => {
        it("subtracts off-balance market inventory self-reported by a listed contract", async () => {
            const { tracker, bondVault } = await deployFixture();
            await bondVault.setExtra(50_000n * ONE);
            // bond vault now contributes 200k balance + 50k off-balance = 250k excluded.
            expect(await tracker.circulatingSupply()).to.equal(60_000n * ONE);
        });

        it("excludedBalanceOf includes the probe; plain wallets return balance only", async () => {
            const { tracker, bondVaultAddr, bondVault, reserve } = await deployFixture();
            await bondVault.setExtra(50_000n * ONE);
            expect(await tracker.excludedBalanceOf(bondVaultAddr)).to.equal(250_000n * ONE);
            expect(await tracker.excludedBalanceOf(reserve.address)).to.equal(650_000n * ONE);
        });

        it("a non-excluded contract that self-reports is ignored (only listed wallets count)", async () => {
            const { tracker, ethers, nara } = await deployFixture();
            const Holder = await ethers.getContractFactory("MockExcludedMarketHolder");
            const stray: any = await Holder.deploy();
            await stray.waitForDeployment();
            await stray.setExtra(999_000n * ONE);
            // Not in the excluded set => no effect on circulating.
            expect(await tracker.circulatingSupply()).to.equal(110_000n * ONE);
        });
    });

    describe("clamping & cap (never reverts)", () => {
        it("clamps circulating to 0 / locked to total when excluded ≥ capped total", async () => {
            const { ethers, nara, excluded } = await deployFixture();
            // Cap below the excluded sum => capped total < excluded.
            const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1");
            const lowCap = 10_000n * ONE;
            const t: any = await Tracker.deploy(await nara.getAddress(), lowCap, excluded);
            await t.waitForDeployment();
            expect(await t.totalSupply()).to.equal(lowCap);
            expect(await t.circulatingSupply()).to.equal(0n);
            expect(await t.lockedSupply()).to.equal(lowCap);
            expect(await t.percentCirculatingBps()).to.equal(0n);
        });

        it("caps reported total at MAX_SUPPLY_CAP; rawTotalSupply stays uncapped", async () => {
            const { ethers, deployer } = await deployFixture();
            const Token = await ethers.getContractFactory("MockERC20Permit", deployer);
            const t2: any = await Token.deploy("NARA", "NARA");
            await t2.waitForDeployment();
            await t2.mint(deployer.address, 1_300_000n * ONE); // over-minted token
            const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1");
            const tr: any = await Tracker.deploy(await t2.getAddress(), MILLION, []);
            await tr.waitForDeployment();
            expect(await tr.totalSupply()).to.equal(MILLION);
            expect(await tr.rawTotalSupply()).to.equal(1_300_000n * ONE);
            // With no exclusions but capped total, circulating == cap.
            expect(await tr.circulatingSupply()).to.equal(MILLION);
        });
    });

    describe("transparency views", () => {
        it("excludedAccounts / length / at expose the exact set", async () => {
            const { tracker, excluded } = await deployFixture();
            expect(await tracker.excludedAccountsLength()).to.equal(BigInt(excluded.length));
            const list = await tracker.excludedAccounts();
            expect(list.map((a: string) => a.toLowerCase())).to.deep.equal(
                excluded.map((a) => a.toLowerCase()),
            );
            expect((await tracker.excludedAccountAt(0)).toLowerCase()).to.equal(excluded[0].toLowerCase());
        });

        it("excludedAccountAt reverts out of bounds", async () => {
            const { tracker } = await deployFixture();
            await expect(tracker.excludedAccountAt(99)).to.be.revertedWithCustomError(
                tracker, "IndexOutOfBounds",
            );
        });

        it("excludedBreakdown returns aligned addresses and balances", async () => {
            const { tracker, excluded } = await deployFixture();
            const [accounts, balances] = await tracker.excludedBreakdown();
            expect(accounts.length).to.equal(excluded.length);
            expect(balances.length).to.equal(excluded.length);
            expect(balances[0]).to.equal(650_000n * ONE); // reserve
            expect(balances[1]).to.equal(200_000n * ONE); // bond vault
            expect(balances[2]).to.equal(40_000n * ONE);  // vesting
            expect(balances[3]).to.equal(0n);             // dead (nothing burned yet)
        });

        it("decimals passes through the token (18)", async () => {
            const { tracker } = await deployFixture();
            expect(await tracker.decimals()).to.equal(18);
        });

        it("exposes nara, naraToken and MAX_SUPPLY_CAP", async () => {
            const { tracker, nara } = await deployFixture();
            const addr = await nara.getAddress();
            expect(await tracker.nara()).to.equal(addr);
            expect(await tracker.naraToken()).to.equal(addr);
            expect(await tracker.MAX_SUPPLY_CAP()).to.equal(MILLION);
        });
    });

    describe("constructor guards", () => {
        it("reverts on zero token", async () => {
            const { ethers } = await deployFixture();
            const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1");
            await expect(
                Tracker.deploy(ethers.ZeroAddress, MILLION, []),
            ).to.be.revertedWithCustomError(Tracker, "ZeroAddress");
        });

        it("reverts when token is an EOA (not a contract)", async () => {
            const { ethers, user } = await deployFixture();
            const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1");
            await expect(
                Tracker.deploy(user.address, MILLION, []),
            ).to.be.revertedWithCustomError(Tracker, "NotAContract");
        });

        it("reverts on zero cap", async () => {
            const { ethers, nara } = await deployFixture();
            const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1");
            await expect(
                Tracker.deploy(await nara.getAddress(), 0n, []),
            ).to.be.revertedWithCustomError(Tracker, "ZeroValue");
        });

        it("reverts on a zero address in the excluded set", async () => {
            const { ethers, nara, reserve } = await deployFixture();
            const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1");
            await expect(
                Tracker.deploy(await nara.getAddress(), MILLION, [reserve.address, ethers.ZeroAddress]),
            ).to.be.revertedWithCustomError(Tracker, "ZeroAddress");
        });

        it("reverts on a duplicate in the excluded set", async () => {
            const { ethers, nara, reserve } = await deployFixture();
            const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1");
            await expect(
                Tracker.deploy(await nara.getAddress(), MILLION, [reserve.address, reserve.address]),
            ).to.be.revertedWithCustomError(Tracker, "DuplicateAccount");
        });

        it("accepts an empty excluded set (circulating == capped total)", async () => {
            const { ethers, nara } = await deployFixture();
            const Tracker = await ethers.getContractFactory("NARACirculatingSupplyV1");
            const t: any = await Tracker.deploy(await nara.getAddress(), MILLION, []);
            await t.waitForDeployment();
            expect(await t.circulatingSupply()).to.equal(MILLION);
            expect(await t.excludedAccountsLength()).to.equal(0n);
        });
    });
});
