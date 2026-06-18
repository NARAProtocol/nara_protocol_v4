/**
 * NARADashboardLens — test suite
 *
 * Verifies that the single-call getUserState() struct matches individual
 * engine + NFT reads, covering:
 *  - Wallet balances and allowances
 *  - Epoch state: currentEpoch, settledEpoch, backlog, syncRequired
 *  - Fee config and protocol totals
 *  - Direct engine positions: active, matured, pending, claimable rewards
 *  - NFT positions: rewards, genesis claimable (with try/catch)
 *  - getEpochState() standalone
 *  - previewLock() fee math
 *
 * Uses MockEngineForRouter, MockNFTForRouter, MockERC20Permit.
 */

import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";

const ONE = 10n ** 18n;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function deployFixture() {
    const { ethers } = await hre.network.connect();
    const [deployer, alice] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20Permit", deployer);
    const nara: any = await Token.deploy("NARA Protocol", "NARA");
    await nara.waitForDeployment();

    const Engine = await ethers.getContractFactory("MockEngineForRouter", deployer);
    const engine: any = await Engine.deploy();
    await engine.waitForDeployment();
    await engine.setNara(await nara.getAddress());
    await engine.setLockFeeBps(200);
    await engine.setClaimFeeBps(500);
    await engine.setLockFeeWei(LOCK_FEE_WEI);
    await engine.setUnlockFeeWei(UNLOCK_FEE_WEI);
    await engine.setActiveTotalWeight(90_000n * ONE);
    await engine.setTotalLocked(30_000n * ONE);
    await engine.setEmissionReserve(699_000n * ONE);
    await engine.setRewardReserve(699_000n * ONE);

    const NFT = await ethers.getContractFactory("MockNFTForRouter", deployer);
    const nft: any = await NFT.deploy();
    await nft.waitForDeployment();
    await nft.setNara(await nara.getAddress());
    await nft.setEngine(await engine.getAddress());

    const Router = await ethers.getContractFactory("NARARouter", deployer);
    const router: any = await Router.deploy(await engine.getAddress(), await nft.getAddress());
    await router.waitForDeployment();

    const Lens = await ethers.getContractFactory("NARADashboardLens", deployer);
    const lens: any = await Lens.deploy(
        await engine.getAddress(),
        await nft.getAddress(),
        await router.getAddress(),
    );
    await lens.waitForDeployment();

    const ROUTER_ADDR = await router.getAddress();

    return { ethers, deployer, alice, nara, engine, nft, router, lens, ROUTER_ADDR };
}

const LOCK_FEE_WEI   = 10n ** 14n;   // 0.0001 ETH
const UNLOCK_FEE_WEI = 10n ** 15n;   // 0.001 ETH

// Helper: inject a position into the mock engine and return the Position struct.
async function injectEnginePosition(
    engine: any,
    ethers: any,
    id: number,
    owner: string,
    activationEpoch: bigint,
    unlockEpoch: bigint,
    amount: bigint,
    weight: bigint,
) {
    const pos = {
        owner,
        createdEpoch:    0n,
        flags:           0n,
        amount,
        weight,
        activationEpoch,
        unlockEpoch,
        tokenWeight:     0n,
        naraDebtRay:     0n,
        ethDebtRay:      0n,
    };
    await engine.injectPosition(id, pos);
}

// Helper: inject an NFT position into the mock NFT.
async function injectNftPosition(
    nft: any,
    engine: any,
    ethers: any,
    tokenId: number,
    positionId: number,
    owner: string,
    activationEpoch: bigint,
    unlockEpoch: bigint,
    amount: bigint,
    weight: bigint,
) {
    const enginePositionOwner = await nft.getAddress();
    const pos = {
        owner:           enginePositionOwner,
        createdEpoch:    0n,
        flags:           0n,
        amount,
        weight,
        activationEpoch,
        unlockEpoch,
        tokenWeight:     0n,
        naraDebtRay:     0n,
        ethDebtRay:      0n,
    };
    await nft.injectTokenPosition(tokenId, positionId, owner, pos);
    // Mirror into engine so claimableRewards works.
    await engine.injectPosition(positionId, pos);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NARADashboardLens", () => {
    let ethers: any;
    let deployer: Signer, alice: Signer;

    before(async () => {
        ({ ethers } = await hre.network.connect());
        [deployer, alice] = await ethers.getSigners();
    });

    // -----------------------------------------------------------------------
    // A. Constructor validation
    // -----------------------------------------------------------------------

    describe("constructor", () => {
        it("reverts LensZeroAddress on zero engine", async () => {
            const { ethers, deployer, nft } = await deployFixture();
            const Lens = await ethers.getContractFactory("NARADashboardLens", deployer);
            await expect(
                Lens.deploy(ethers.ZeroAddress, await nft.getAddress(), await deployer.getAddress()),
            ).to.be.revertedWithCustomError({ interface: Lens.interface }, "LensZeroAddress");
        });

        it("reverts LensZeroAddress on zero NFT", async () => {
            const { ethers, deployer, engine } = await deployFixture();
            const Lens = await ethers.getContractFactory("NARADashboardLens", deployer);
            await expect(
                Lens.deploy(await engine.getAddress(), ethers.ZeroAddress, await deployer.getAddress()),
            ).to.be.revertedWithCustomError({ interface: Lens.interface }, "LensZeroAddress");
        });

        it("rejects an EOA router", async () => {
            const { ethers, deployer, engine, nft, alice } = await deployFixture();
            const Lens = await ethers.getContractFactory("NARADashboardLens", deployer);
            await expect(
                Lens.deploy(await engine.getAddress(), await nft.getAddress(), await alice.getAddress()),
            ).to.be.revertedWithCustomError({ interface: Lens.interface }, "LensNotAContract");
        });

        it("rejects mismatched engine, NFT, and router pairs", async () => {
            const { ethers, deployer, nft, router } = await deployFixture();
            const Engine = await ethers.getContractFactory("MockEngineForRouter", deployer);
            const otherEngine: any = await Engine.deploy();
            await otherEngine.waitForDeployment();
            const Lens = await ethers.getContractFactory("NARADashboardLens", deployer);
            await expect(
                Lens.deploy(await otherEngine.getAddress(), await nft.getAddress(), await router.getAddress()),
            ).to.be.revertedWithCustomError({ interface: Lens.interface }, "LensPairingMismatch");
        });
    });

    // -----------------------------------------------------------------------
    // B. getEpochState()
    // -----------------------------------------------------------------------

    describe("getEpochState()", () => {
        it("returns 0/0/0/false when both epochs are 0", async () => {
            const { lens } = await deployFixture();
            const state = await lens.getEpochState();
            expect(state.currentEpoch).to.equal(0n);
            expect(state.settledEpoch).to.equal(0n);
            expect(state.backlog).to.equal(0n);
            expect(state.syncRequired).to.equal(false);
        });

        it("returns backlog and syncRequired=true when live > settled", async () => {
            const { lens, engine } = await deployFixture();
            await engine.setLiveEpoch(10n);
            await engine.setSettledEpoch(3n);

            const state = await lens.getEpochState();
            expect(state.currentEpoch).to.equal(10n);
            expect(state.settledEpoch).to.equal(3n);
            expect(state.backlog).to.equal(7n);
            expect(state.syncRequired).to.equal(true);
        });

        it("returns syncRequired=false when live == settled", async () => {
            const { lens, engine } = await deployFixture();
            await engine.setLiveEpoch(5n);
            await engine.setSettledEpoch(5n);

            const state = await lens.getEpochState();
            expect(state.syncRequired).to.equal(false);
            expect(state.backlog).to.equal(0n);
        });
    });

    // -----------------------------------------------------------------------
    // C. previewLock()
    // -----------------------------------------------------------------------

    describe("previewLock()", () => {
        it("computes netAmount = amount - lockFeeBps cut", async () => {
            const { lens } = await deployFixture();
            // lockFeeBps = 200 → 2%
            const amount   = 1_000n * ONE;
            const duration = 100n;
            const [netAmount, weight, lockFeeEth] = await lens.previewLock(amount, duration);

            const expectedFee    = (amount * 200n) / 10_000n; // 20e18
            const expectedNet    = amount - expectedFee;       // 980e18
            const expectedWeight = expectedNet * duration;     // 98_000e18 (mock: weight = amount * duration)

            expect(netAmount).to.equal(expectedNet);
            expect(weight).to.equal(expectedWeight);
            expect(lockFeeEth).to.equal(LOCK_FEE_WEI);
        });

        it("returns zero fee when lockFeeBps = 0", async () => {
            const { lens, engine } = await deployFixture();
            await engine.setLockFeeBps(0);
            const [netAmount,,] = await lens.previewLock(1_000n * ONE, 50n);
            expect(netAmount).to.equal(1_000n * ONE);
        });
    });

    // -----------------------------------------------------------------------
    // D. getUserState() — wallet balances + epoch + fees
    // -----------------------------------------------------------------------

    describe("getUserState() — wallet + epoch + fees", () => {
        it("returns correct ETH and NARA balances", async () => {
            const { nara, lens, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await nara.mint(aliceAddr, 5_000n * ONE);

            const s = await lens.getUserState(aliceAddr, [], []);
            expect(s.naraBalance).to.equal(5_000n * ONE);
            expect(BigInt(s.ethBalance)).to.be.gt(0n);
        });

        it("returns correct NARA allowances for engine and router", async () => {
            const { nara, engine, lens, alice, ROUTER_ADDR } = await deployFixture();
            const aliceAddr  = await alice.getAddress();
            const engineAddr = await engine.getAddress();
            await nara.mint(aliceAddr, 1_000n * ONE);
            await nara.connect(alice).approve(engineAddr, 500n * ONE);
            await nara.connect(alice).approve(ROUTER_ADDR,  250n * ONE);

            const s = await lens.getUserState(aliceAddr, [], []);
            expect(s.naraAllowanceEngine).to.equal(500n * ONE);
            expect(s.naraAllowanceRouter).to.equal(250n * ONE);
        });

        it("epoch fields reflect liveEpoch and settledEpoch", async () => {
            const { lens, engine, alice } = await deployFixture();
            await engine.setLiveEpoch(15n);
            await engine.setSettledEpoch(10n);

            const s = await lens.getUserState(await alice.getAddress(), [], []);
            expect(s.epoch.currentEpoch).to.equal(15n);
            expect(s.epoch.settledEpoch).to.equal(10n);
            expect(s.epoch.backlog).to.equal(5n);
            expect(s.epoch.syncRequired).to.equal(true);
        });

        it("fee config fields match engine values", async () => {
            const { lens, alice } = await deployFixture();
            const s = await lens.getUserState(await alice.getAddress(), [], []);
            expect(s.fees.lockFeeBps).to.equal(200n);
            expect(s.fees.claimFeeBps).to.equal(500n);
            expect(s.fees.lockFeeWei).to.equal(LOCK_FEE_WEI);
            expect(s.fees.unlockFeeWei).to.equal(UNLOCK_FEE_WEI);
            expect(s.fees.maxLockEpochs).to.equal(35040n);
            expect(s.fees.activationDelayEpochs).to.equal(3n);
        });

        it("protocol totals match engine values", async () => {
            const { lens, alice } = await deployFixture();
            const s = await lens.getUserState(await alice.getAddress(), [], []);
            expect(s.activeTotalWeight).to.equal(90_000n * ONE);
            expect(s.totalLocked).to.equal(30_000n * ONE);
            expect(s.emissionReserveAvailable).to.equal(699_000n * ONE);
            expect(s.rewardReserveAvailable).to.equal(699_000n * ONE);
        });
    });

    // -----------------------------------------------------------------------
    // E. getUserState() — direct engine positions
    // -----------------------------------------------------------------------

    describe("getUserState() — engine positions", () => {
        it("returns empty array when no positionIds passed", async () => {
            const { lens, alice } = await deployFixture();
            const s = await lens.getUserState(await alice.getAddress(), [], []);
            expect(s.positions.length).to.equal(0);
        });

        it("fills position fields for an active position", async () => {
            const { lens, engine, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();

            // settledEpoch = 10; position active from 5 to 20
            await engine.setSettledEpoch(10n);
            await injectEnginePosition(engine, ethers, 1, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);

            const s = await lens.getUserState(aliceAddr, [1], []);
            const p = s.positions[0];

            expect(p.positionId).to.equal(1n);
            expect(p.owner).to.equal(aliceAddr);
            expect(BigInt(p.activationEpoch)).to.equal(5n);
            expect(BigInt(p.unlockEpoch)).to.equal(20n);
            expect(BigInt(p.amount)).to.equal(1_000n * ONE);
            expect(p.active).to.equal(true);
            expect(p.matured).to.equal(false);
        });

        it("marks position as matured when settledEpoch >= unlockEpoch", async () => {
            const { lens, engine, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(25n);
            await injectEnginePosition(engine, ethers, 1, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);

            const s = await lens.getUserState(aliceAddr, [1], []);
            expect(s.positions[0].active).to.equal(false);
            expect(s.positions[0].matured).to.equal(true);
        });

        it("marks position as pending when settledEpoch < activationEpoch", async () => {
            const { lens, engine, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(2n);
            await injectEnginePosition(engine, ethers, 1, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);

            const s = await lens.getUserState(aliceAddr, [1], []);
            expect(s.positions[0].active).to.equal(false);
            expect(s.positions[0].matured).to.equal(false);
        });

        it("includes claimable rewards for position with non-zero amount", async () => {
            const { lens, engine, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(10n);
            await injectEnginePosition(engine, ethers, 1, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);
            await engine.setClaimable(1, 100n * ONE, 5n * 10n ** 16n);

            const s = await lens.getUserState(aliceAddr, [1], []);
            expect(s.positions[0].claimableNara).to.equal(100n * ONE);
            expect(s.positions[0].claimableEth).to.equal(5n * 10n ** 16n);
        });

        it("skips claimable rewards for non-existent position (amount == 0)", async () => {
            const { lens, engine, alice } = await deployFixture();
            // Pass positionId=99 which has no injected data → amount is 0
            const s = await lens.getUserState(await alice.getAddress(), [99], []);
            expect(s.positions[0].claimableNara).to.equal(0n);
            expect(s.positions[0].claimableEth).to.equal(0n);
        });

        it("handles multiple positions in one call", async () => {
            const { lens, engine, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(10n);
            await injectEnginePosition(engine, ethers, 1, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);
            await injectEnginePosition(engine, ethers, 2, aliceAddr, 5n, 8n,  500n * ONE,  20_000n);
            await engine.setClaimable(1, 10n * ONE, 0n);
            await engine.setClaimable(2, 5n * ONE, 0n);

            const s = await lens.getUserState(aliceAddr, [1, 2], []);
            expect(s.positions.length).to.equal(2);
            expect(s.positions[0].positionId).to.equal(1n);
            expect(s.positions[0].active).to.equal(true);
            expect(s.positions[1].positionId).to.equal(2n);
            expect(s.positions[1].matured).to.equal(true);
        });

        it("caps positions at 100", async () => {
            const { lens, engine, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            // Pass 102 positionIds — only first 100 should appear in result
            const ids = Array.from({ length: 102 }, (_, i) => i + 1);
            const s = await lens.getUserState(aliceAddr, ids, []);
            expect(s.positions.length).to.equal(100);
        });
    });

    // -----------------------------------------------------------------------
    // F. getUserState() — NFT positions
    // -----------------------------------------------------------------------

    describe("getUserState() — NFT positions", () => {
        it("returns empty array when no nftTokenIds passed", async () => {
            const { lens, alice } = await deployFixture();
            const s = await lens.getUserState(await alice.getAddress(), [], []);
            expect(s.nftPositions.length).to.equal(0);
        });

        it("fills NFT position fields correctly", async () => {
            const { lens, engine, nft, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(10n);
            await injectNftPosition(nft, engine, ethers, 1, 5, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);

            const s = await lens.getUserState(aliceAddr, [], [1]);
            const np = s.nftPositions[0];

            expect(np.tokenId).to.equal(1n);
            expect(np.positionId).to.equal(5n);
            expect(np.owner).to.equal(aliceAddr);
            expect((await nft.positionInfo(1)).owner).not.to.equal(aliceAddr);
            expect(np.active).to.equal(true);
            expect(np.matured).to.equal(false);
        });

        it("includes claimable rewards from engine for NFT position", async () => {
            const { lens, engine, nft, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(10n);
            await injectNftPosition(nft, engine, ethers, 1, 5, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);
            await engine.setClaimable(5, 200n * ONE, 1n * 10n ** 16n);

            const s = await lens.getUserState(aliceAddr, [], [1]);
            expect(s.nftPositions[0].claimableNara).to.equal(200n * ONE);
            expect(s.nftPositions[0].claimableEth).to.equal(1n * 10n ** 16n);
        });

        it("includes genesis claimable when set", async () => {
            const { lens, engine, nft, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(10n);
            await injectNftPosition(nft, engine, ethers, 1, 5, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);
            await nft.setGenesisClaimable(1, 3n * 10n ** 16n, 50n * ONE);

            const s = await lens.getUserState(aliceAddr, [], [1]);
            expect(s.nftPositions[0].claimableGenesisEth).to.equal(3n * 10n ** 16n);
            expect(s.nftPositions[0].claimableGenesisToken).to.equal(50n * ONE);
        });

        it("gracefully returns 0 genesis amounts when NFT reverts (try/catch)", async () => {
            const { lens, engine, nft, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(10n);
            await injectNftPosition(nft, engine, ethers, 1, 5, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);
            await nft.setRevertGenesis(true);

            const s = await lens.getUserState(aliceAddr, [], [1]);
            expect(s.nftPositions[0].claimableGenesisEth).to.equal(0n);
            expect(s.nftPositions[0].claimableGenesisToken).to.equal(0n);
        });

        it("skips engine claimableRewards when NFT positionId is 0", async () => {
            const { lens, nft, alice } = await deployFixture();
            // tokenId=99 has no injected data → positionId = 0
            const s = await lens.getUserState(await alice.getAddress(), [], [99]);
            expect(s.nftPositions[0].exists).to.equal(false);
            expect(s.nftPositions[0].claimableNara).to.equal(0n);
            expect(s.nftPositions[0].claimableEth).to.equal(0n);
        });

        it("keeps valid NFT results when another requested token ID is stale", async () => {
            const { lens, engine, nft, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(10n);
            await injectNftPosition(nft, engine, ethers, 2, 5, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);

            const s = await lens.getUserState(aliceAddr, [], [1, 2]);
            expect(s.nftPositions[0].exists).to.equal(false);
            expect(s.nftPositions[1].exists).to.equal(true);
            expect(s.nftPositions[1].owner).to.equal(aliceAddr);
        });

        it("caps NFT positions at 100", async () => {
            const { lens, alice } = await deployFixture();
            const ids = Array.from({ length: 105 }, (_, i) => i + 1);
            const s = await lens.getUserState(await alice.getAddress(), [], ids);
            expect(s.nftPositions.length).to.equal(100);
        });
    });

    // -----------------------------------------------------------------------
    // G. Mixed: direct + NFT positions in same call
    // -----------------------------------------------------------------------

    describe("getUserState() — mixed direct + NFT positions", () => {
        it("returns correct lengths for both arrays", async () => {
            const { lens, engine, nft, alice } = await deployFixture();
            const aliceAddr = await alice.getAddress();
            await engine.setSettledEpoch(10n);
            await injectEnginePosition(engine, ethers, 1, aliceAddr, 5n, 20n, 1_000n * ONE, 50_000n);
            await injectNftPosition(nft, engine, ethers, 1, 2, aliceAddr, 5n, 20n, 500n * ONE, 25_000n);

            const s = await lens.getUserState(aliceAddr, [1], [1]);
            expect(s.positions.length).to.equal(1);
            expect(s.nftPositions.length).to.equal(1);
        });
    });
});
