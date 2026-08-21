/**
 * NARA v4 Bond Contract Test Suite
 *
 * Covers all three v4 bond contracts in a single file:
 *   I.   NARAOpsVaultV4
 *        A. Constructor guards
 *        B. fund() — one-shot, cap, guards
 *        C. vestedAmount + withdrawable math
 *        D. withdraw + withdrawAmount
 *        E. Two-step ownership
 *        F. sweepForeignToken
 *
 *   II.  NARABondVaultV4
 *        A. Constructor guards
 *        B. setNara — one-shot
 *        C. View helpers
 *        D. Market management (timelock)
 *        E. Release cap management (timelock)
 *        F. pullToMarket + returnUnsold accounting
 *        G. sweepForeignToken
 *
 *   III. NARABondDepositoryV4
 *        A. Constructor guards
 *        B. Terms management (propose / timelock / execute / cancel)
 *        C. addCapacity
 *        D. buyBond — price math, payout, capacity
 *        E. buyBondFor — recipient delivery
 *        F. ETH routing (reward + treasury splits)
 *        G. ETH queue and flush functions
 *        H. quoteBond view
 *        I. MAX_DISCOUNT_BPS = 3000 enforced
 *        J. Full lifecycle
 *
 * Hardhat 3: each describe block calls hre.network.connect() in before()
 * to get an isolated EVM with fresh signers and a clean state.
 */

import hre from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";

// ─── Shared helpers ──────────────────────────────────────────────────────────

const ONE = 10n ** 18n;
function wad(x: number | bigint): bigint { return BigInt(x) * ONE; }
function pct(n: bigint, d: bigint): bigint { return (n * d) / 10_000n; }

const ACTION_DELAY    = 86_400n;     // matches production minimum price delay
const VESTING_30DAYS  = 30n * 86400n;
const VESTING_90DAYS  = 90n * 86400n;
const MAX_BOND_ALLOC  = wad(290_000);
const MAX_OPS_ALLOC   = wad(10_000);
const LOCK_FEE_WEI    = 10n ** 14n;  // 0.0001 ETH (matches mock default)

async function mineTime(ethers: any, seconds: bigint) {
  await ethers.provider.send("evm_increaseTime", [Number(seconds)]);
  await ethers.provider.send("evm_mine", []);
}

/** Default BondTerms — capacity is always 0 at constructor time. */
function defaultTerms(ethers: any, overrides: Record<string, unknown> = {}) {
  return {
    naraPerEthWad:          ethers.parseUnits("100", 18), // 100 NARA/ETH
    discountBps:            500,                           // 5%
    rewardSplitWad:         ethers.parseUnits("0.3", 18), // 30% to engine
    minDepositWei:          ethers.parseEther("0.01"),    // 0.01 ETH min
    maxPayoutNara:          wad(10_000),                  // 10k NARA max
    remainingCapacityNara:  0n,                           // MUST be 0 at deploy
    lockDurationEpochs:     1344n,                        // > activationDelay(3), <= maxLock(35040)
    active:                 true,
    ...overrides,
  };
}

// ─── Deploy helpers (NARAOpsVaultV4) ─────────────────────────────────────────

async function deployOps(ethers: any, deployer: Signer, duration = VESTING_30DAYS) {
  const deployerAddr = await deployer.getAddress();

  const NaraToken = await ethers.getContractFactory("MockERC20", deployer);
  const nara = await NaraToken.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();

  const Vault = await ethers.getContractFactory("NARAOpsVaultV4", deployer);
  const vault = await Vault.deploy(await nara.getAddress(), deployerAddr, duration);
  await vault.waitForDeployment();

  return { nara, vault };
}

// ─── Deploy helpers (NARABondVaultV4) ────────────────────────────────────────

async function deployBondVault(
  ethers: any,
  deployer: Signer,
  alloc = wad(10_000),
) {
  const deployerAddr = await deployer.getAddress();

  const NaraToken = await ethers.getContractFactory("MockERC20", deployer);
  const nara = await NaraToken.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();

  const Vault = await ethers.getContractFactory("NARABondVaultV4", deployer);
  const vault = await Vault.deploy(deployerAddr, ACTION_DELAY, alloc);
  await vault.waitForDeployment();

  return { nara, vault };
}

async function deployBondVaultWired(ethers: any, deployer: Signer, alloc = wad(10_000)) {
  const ctx = await deployBondVault(ethers, deployer, alloc);
  const { nara, vault } = ctx;
  const vaultAddr = await vault.getAddress();

  await vault.setNara(await nara.getAddress());
  await (nara as any).mint(vaultAddr, alloc);

  return ctx;
}

// ─── Deploy helpers (NARABondDepositoryV4 full stack) ────────────────────────

interface FullCtx {
  ethers: any;
  deployer: Signer;
  alice: Signer;
  bob: Signer;
  treasury: Signer;
  nara: any;
  engine: any;
  vault: any;
  dep: any;
  naraAddr: string;
  engineAddr: string;
  vaultAddr: string;
  depAddr: string;
  treasuryAddr: string;
}

async function deployFull(ethers: any, opts: {
  termOverrides?: Record<string, unknown>;
  vaultAlloc?: bigint;
  releaseCap?: bigint;
} = {}): Promise<FullCtx> {
  const [deployer, alice, bob, treasury] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const treasuryAddr = await treasury.getAddress();

  const vaultAlloc = opts.vaultAlloc ?? wad(50_000);
  const releaseCap = opts.releaseCap ?? vaultAlloc;

  // 1. NARA token
  const NaraToken = await ethers.getContractFactory("MockERC20", deployer);
  const nara = await NaraToken.deploy("NARA", "NARA", 18);
  await nara.waitForDeployment();
  const naraAddr = await nara.getAddress();

  // 2. Mock engine (acts as INARAEngineV4)
  const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
  const engine = await Engine.deploy();
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  await engine.setNara(naraAddr);

  // 3. Bond vault
  const Vault = await ethers.getContractFactory("NARABondVaultV4", deployer);
  const vault = await Vault.deploy(deployerAddr, ACTION_DELAY, vaultAlloc);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  await vault.setNara(naraAddr);
  await (nara as any).mint(vaultAddr, vaultAlloc);

  // 4. Depository
  const terms = defaultTerms(ethers, opts.termOverrides ?? {});
  const Dep = await ethers.getContractFactory("NARABondDepositoryV4", deployer);
  const dep = await Dep.deploy(
    naraAddr,
    engineAddr,
    vaultAddr,
    deployerAddr,
    treasuryAddr,
    ACTION_DELAY,
    terms,
  );
  await dep.waitForDeployment();
  const depAddr = await dep.getAddress();

  // 5. Wire vault → depository as market
  await vault.proposeMarket(depAddr);
  await mineTime(ethers, ACTION_DELAY + 1n);
  await vault.executeMarketChange();

  // 6. Set release cap on vault
  await vault.proposeReleaseCap(releaseCap);
  await mineTime(ethers, ACTION_DELAY + 1n);
  await vault.executeReleaseCapChange();

  // 7. Refresh manually-priced terms after vault wiring so price TTL starts
  //    from the moment the market can actually be opened.
  await dep.pause();
  await dep.proposeTerms(terms);
  await mineTime(ethers, ACTION_DELAY + 1n);
  await dep.executeTerms();
  await dep.unpause();

  return { ethers, deployer, alice, bob, treasury, nara, engine, vault, dep,
           naraAddr, engineAddr, vaultAddr, depAddr, treasuryAddr };
}

/** Open the market: pause → addCapacity → unpause. */
async function openMarket(ctx: FullCtx, capacity = wad(5_000)) {
  const { dep } = ctx;
  await dep.pause();
  await dep.addCapacity(capacity);
  await dep.unpause();
}

// ─────────────────────────────────────────────────────────────────────────────
// I. NARAOpsVaultV4
// ─────────────────────────────────────────────────────────────────────────────

describe("I. NARAOpsVaultV4", () => {

  // ─── A. Constructor guards ────────────────────────────────────────────────

  describe("A. Constructor guards", () => {
    let ethers: any;
    let deployer: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
    });

    it("reverts ZeroAddress for nara_", async () => {
      const addr = await deployer.getAddress();
      const V = await ethers.getContractFactory("NARAOpsVaultV4", deployer);
      await expect(V.deploy(ethers.ZeroAddress, addr, VESTING_30DAYS))
        .to.be.revertedWithCustomError(V, "ZeroAddress");
    });

    it("reverts ZeroAddress for owner_", async () => {
      const { nara } = await deployOps(ethers, deployer);
      const V = await ethers.getContractFactory("NARAOpsVaultV4", deployer);
      await expect(V.deploy(await nara.getAddress(), ethers.ZeroAddress, VESTING_30DAYS))
        .to.be.revertedWithCustomError(V, "ZeroAddress");
    });

    it("reverts VestingDurationTooShort when duration < 30 days", async () => {
      const { nara } = await deployOps(ethers, deployer);
      const V = await ethers.getContractFactory("NARAOpsVaultV4", deployer);
      const addr = await deployer.getAddress();
      await expect(V.deploy(await nara.getAddress(), addr, 86400n)) // 1 day
        .to.be.revertedWithCustomError(V, "VestingDurationTooShort");
    });

    it("deploys successfully with minimum duration (30 days)", async () => {
      const { vault } = await deployOps(ethers, deployer, VESTING_30DAYS);
      expect(await vault.vestingDuration()).to.equal(VESTING_30DAYS);
    });
  });

  // ─── B. fund() ────────────────────────────────────────────────────────────

  describe("B. fund()", () => {
    let ethers: any;
    let deployer: Signer;
    let alice: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer, alice] = await ethers.getSigners();
    });

    it("reverts ZeroValue for amount = 0", async () => {
      const { vault } = await deployOps(ethers, deployer);
      await expect(vault.fund(0n)).to.be.revertedWithCustomError(vault, "ZeroValue");
    });

    it("reverts InvalidAllocation when amount is not exactly MAX_OPS_ALLOCATION", async () => {
      const { vault, nara } = await deployOps(ethers, deployer);
      await (nara as any).mint(await deployer.getAddress(), MAX_OPS_ALLOC + 1n);
      await nara.approve(await vault.getAddress(), MAX_OPS_ALLOC + 1n);
      await expect(vault.fund(MAX_OPS_ALLOC + 1n))
        .to.be.revertedWithCustomError(vault, "InvalidAllocation");
    });

    it("funds successfully with valid amount", async () => {
      const { vault, nara } = await deployOps(ethers, deployer);
      const vaultAddr = await vault.getAddress();
      const amount = wad(10_000);
      await (nara as any).mint(await deployer.getAddress(), amount);
      await nara.approve(vaultAddr, amount);
      await expect(vault.fund(amount)).to.emit(vault, "Funded");
      expect(await vault.totalAllocation()).to.equal(amount);
      expect(await vault.funded()).to.equal(true);
      expect(await nara.balanceOf(vaultAddr)).to.equal(amount);
    });

    it("reverts NotOwner when a third party tries to fund the one-shot allocation", async () => {
      const { vault, nara } = await deployOps(ethers, deployer);
      const amount = MAX_OPS_ALLOC;
      await (nara as any).mint(await alice.getAddress(), amount);
      await (nara.connect(alice) as any).approve(await vault.getAddress(), amount);
      await expect((vault.connect(alice) as any).fund(amount))
        .to.be.revertedWithCustomError(vault, "NotOwner");
    });

    it("reverts AlreadyFunded on second call", async () => {
      const { vault, nara } = await deployOps(ethers, deployer);
      const vaultAddr = await vault.getAddress();
      const amount = MAX_OPS_ALLOC;
      await (nara as any).mint(await deployer.getAddress(), amount * 2n);
      await nara.approve(vaultAddr, amount * 2n);
      await vault.fund(amount);
      await expect(vault.fund(amount)).to.be.revertedWithCustomError(vault, "AlreadyFunded");
    });
  });

  // ─── C. vestedAmount + withdrawable ───────────────────────────────────────

  describe("C. vestedAmount + withdrawable", () => {
    let ethers: any;
    let deployer: Signer;
    let vault: any;
    let nara: any;
    const AMOUNT = wad(10_000);

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
      ({ vault, nara } = await deployOps(ethers, deployer, VESTING_90DAYS));
      const vaultAddr = await vault.getAddress();
      await (nara as any).mint(await deployer.getAddress(), AMOUNT);
      await nara.approve(vaultAddr, AMOUNT);
      await vault.fund(AMOUNT);
    });

    it("vestedAmount = 0 at start (no time elapsed)", async () => {
      // Immediately after fund, no blocks mined
      expect(await vault.vestedAmount()).to.be.lt(AMOUNT / 1000n); // < 0.1% tolerance for 1-block drift
    });

    it("vestedAmount grows linearly at 30 days", async () => {
      await mineTime(ethers, 30n * 86400n);
      const vested = await vault.vestedAmount();
      // 30/90 = 1/3 of total
      const expected = AMOUNT / 3n;
      expect(vested).to.be.closeTo(expected, AMOUNT / 100n); // within 1%
    });

    it("vestedAmount caps at totalAllocation after full duration", async () => {
      await mineTime(ethers, 90n * 86400n);
      const vested = await vault.vestedAmount();
      expect(vested).to.equal(AMOUNT);
    });

    it("withdrawable = vestedAmount when nothing withdrawn yet", async () => {
      const vested = await vault.vestedAmount();
      expect(await vault.withdrawable()).to.equal(vested);
    });

    it("returns 0 before fund", async () => {
      const { vault: v2 } = await deployOps(ethers, deployer, VESTING_30DAYS);
      expect(await v2.vestedAmount()).to.equal(0n);
      expect(await v2.withdrawable()).to.equal(0n);
    });
  });

  // ─── D. withdraw + withdrawAmount ─────────────────────────────────────────

  describe("D. withdraw + withdrawAmount", () => {
    let ethers: any;
    let deployer: Signer;
    let alice: Signer;
    let vault: any;
    let nara: any;
    const AMOUNT = wad(10_000);

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer, alice] = await ethers.getSigners();
      ({ vault, nara } = await deployOps(ethers, deployer, VESTING_30DAYS));
      const vaultAddr = await vault.getAddress();
      await (nara as any).mint(await deployer.getAddress(), AMOUNT);
      await nara.approve(vaultAddr, AMOUNT);
      await vault.fund(AMOUNT);
      await mineTime(ethers, VESTING_30DAYS / 2n); // 50% vested
    });

    it("reverts NothingVested for full allocation before meaningful vesting", async () => {
      const { vault: v2, nara: n2 } = await deployOps(ethers, deployer, VESTING_90DAYS);
      const vaultAddr = await v2.getAddress();
      await (n2 as any).mint(await deployer.getAddress(), MAX_OPS_ALLOC);
      await n2.approve(vaultAddr, MAX_OPS_ALLOC);
      await v2.fund(MAX_OPS_ALLOC);
      await expect(v2.withdrawAmount(await deployer.getAddress(), MAX_OPS_ALLOC))
        .to.be.revertedWithCustomError(v2, "NothingVested");
    });

    it("reverts ZeroAddress on withdraw to zero address", async () => {
      await expect(vault.withdraw(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("withdraw() transfers available tokens", async () => {
      const deployerAddr = await deployer.getAddress();
      const available = await vault.withdrawable();
      const balBefore = await nara.balanceOf(deployerAddr);
      await expect(vault.withdraw(deployerAddr)).to.emit(vault, "Withdrawn");
      const balAfter = await nara.balanceOf(deployerAddr);
      const withdrawn = await vault.withdrawn();
      expect(balAfter - balBefore).to.equal(withdrawn);
      expect(withdrawn).to.be.gte(available);
    });

    it("withdrawable() returns 0 after full withdrawal of vested amount", async () => {
      // Already withdrawn all vested above; might have a tiny bit from 1 new block
      const w = await vault.withdrawable();
      expect(w).to.be.lt(wad(1)); // negligible drift from mining
    });

    it("reverts NotOwner when non-owner calls withdraw", async () => {
      await expect((vault.connect(alice) as any).withdraw(await alice.getAddress()))
        .to.be.revertedWithCustomError(vault, "NotOwner");
    });

    it("withdrawAmount() reverts ZeroValue for amount = 0", async () => {
      const deployerAddr = await deployer.getAddress();
      await expect(vault.withdrawAmount(deployerAddr, 0n))
        .to.be.revertedWithCustomError(vault, "ZeroValue");
    });

    it("withdrawAmount() reverts NothingVested when amount > available", async () => {
      const deployerAddr = await deployer.getAddress();
      await expect(vault.withdrawAmount(deployerAddr, wad(10_000)))
        .to.be.revertedWithCustomError(vault, "NothingVested");
    });

    it("withdrawAmount() transfers exact requested amount", async () => {
      await mineTime(ethers, VESTING_30DAYS); // advance to full vest
      const deployerAddr = await deployer.getAddress();
      const available = await vault.withdrawable();
      const partialAmount = available / 2n;
      const balBefore = await nara.balanceOf(deployerAddr);
      await vault.withdrawAmount(deployerAddr, partialAmount);
      const balAfter = await nara.balanceOf(deployerAddr);
      expect(balAfter - balBefore).to.equal(partialAmount);
    });
  });

  // ─── E. Two-step ownership ────────────────────────────────────────────────

  describe("E. Two-step ownership", () => {
    let ethers: any;
    let deployer: Signer;
    let alice: Signer;
    let vault: any;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer, alice] = await ethers.getSigners();
      ({ vault } = await deployOps(ethers, deployer));
    });

    it("reverts NotOwner when non-owner proposes transfer", async () => {
      await expect((vault.connect(alice) as any).proposeOwnershipTransfer(await alice.getAddress()))
        .to.be.revertedWithCustomError(vault, "NotOwner");
    });

    it("reverts ZeroAddress when proposing zero", async () => {
      await expect(vault.proposeOwnershipTransfer(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("proposeOwnershipTransfer emits event", async () => {
      const aliceAddr = await alice.getAddress();
      await expect(vault.proposeOwnershipTransfer(aliceAddr))
        .to.emit(vault, "OwnershipTransferProposed").withArgs(aliceAddr);
      expect(await vault.pendingOwner()).to.equal(aliceAddr);
    });

    it("reverts NoPendingOwner when wrong caller accepts", async () => {
      await expect((vault.connect(deployer) as any).acceptOwnership())
        .to.be.revertedWithCustomError(vault, "NoPendingOwner");
    });

    it("acceptOwnership transfers ownership to pendingOwner", async () => {
      const oldOwner = await deployer.getAddress();
      const newOwner = await alice.getAddress();
      await expect((vault.connect(alice) as any).acceptOwnership())
        .to.emit(vault, "OwnershipTransferred").withArgs(oldOwner, newOwner);
      expect(await vault.owner()).to.equal(newOwner);
      expect(await vault.pendingOwner()).to.equal(ethers.ZeroAddress);
    });
  });

  // ─── F. sweepForeignToken ─────────────────────────────────────────────────

  describe("F. sweepForeignToken", () => {
    let ethers: any;
    let deployer: Signer;
    let vault: any;
    let nara: any;
    let foreign: any;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
      ({ vault, nara } = await deployOps(ethers, deployer));

      const ForeignToken = await ethers.getContractFactory("MockERC20", deployer);
      foreign = await ForeignToken.deploy("USDC", "USDC", 6);
      await foreign.waitForDeployment();
      const vaultAddr = await vault.getAddress();
      await (foreign as any).mint(vaultAddr, 1_000_000n);
    });

    it("reverts NaraSweepForbidden for NARA token", async () => {
      const deployerAddr = await deployer.getAddress();
      await expect(vault.sweepForeignToken(await nara.getAddress(), deployerAddr, 1n))
        .to.be.revertedWithCustomError(vault, "NaraSweepForbidden");
    });

    it("sweeps foreign token to owner", async () => {
      const deployerAddr = await deployer.getAddress();
      const foreignAddr = await foreign.getAddress();
      const balBefore = await foreign.balanceOf(deployerAddr);
      await vault.sweepForeignToken(foreignAddr, deployerAddr, 1_000_000n);
      const balAfter = await foreign.balanceOf(deployerAddr);
      expect(balAfter - balBefore).to.equal(1_000_000n);
    });

    it("reverts ZeroAddress for to address", async () => {
      await expect(vault.sweepForeignToken(await foreign.getAddress(), ethers.ZeroAddress, 1n))
        .to.be.revertedWithCustomError(vault, "ZeroAddress");
    });
  });

}); // NARAOpsVaultV4

// ─────────────────────────────────────────────────────────────────────────────
// II. NARABondVaultV4
// ─────────────────────────────────────────────────────────────────────────────

describe("II. NARABondVaultV4", () => {

  // ─── A. Constructor guards ────────────────────────────────────────────────

  describe("A. Constructor guards", () => {
    let ethers: any;
    let deployer: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
    });

    it("reverts ZeroAddress for admin = zero", async () => {
      const V = await ethers.getContractFactory("NARABondVaultV4", deployer);
      await expect(V.deploy(ethers.ZeroAddress, ACTION_DELAY, wad(1_000)))
        .to.be.revertedWithCustomError(V, "ZeroAddress");
    });

    it("reverts ZeroValue for actionDelaySeconds = 0", async () => {
      const V = await ethers.getContractFactory("NARABondVaultV4", deployer);
      const addr = await deployer.getAddress();
      await expect(V.deploy(addr, 0n, wad(1_000)))
        .to.be.revertedWithCustomError(V, "ZeroValue");
    });

    it("reverts ZeroValue for initialBondAllocation = 0", async () => {
      const V = await ethers.getContractFactory("NARABondVaultV4", deployer);
      const addr = await deployer.getAddress();
      await expect(V.deploy(addr, ACTION_DELAY, 0n))
        .to.be.revertedWithCustomError(V, "ZeroValue");
    });

    it("reverts CapTooHigh when initialBondAllocation > MAX_BOND_ALLOCATION", async () => {
      const V = await ethers.getContractFactory("NARABondVaultV4", deployer);
      const addr = await deployer.getAddress();
      await expect(V.deploy(addr, ACTION_DELAY, MAX_BOND_ALLOC + 1n))
        .to.be.revertedWithCustomError(V, "CapTooHigh");
    });

    it("deploys successfully at exactly MAX_BOND_ALLOCATION", async () => {
      const V = await ethers.getContractFactory("NARABondVaultV4", deployer);
      const addr = await deployer.getAddress();
      const vault = await V.deploy(addr, ACTION_DELAY, MAX_BOND_ALLOC);
      await vault.waitForDeployment();
      expect(await vault.initialBondAllocation()).to.equal(MAX_BOND_ALLOC);
    });
  });

  // ─── B. setNara — one-shot ────────────────────────────────────────────────

  describe("B. setNara", () => {
    let ethers: any;
    let deployer: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
    });

    it("reverts ZeroAddress", async () => {
      const { vault } = await deployBondVault(ethers, deployer);
      await expect(vault.setNara(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("reverts NotAContract for EOA address", async () => {
      const { vault } = await deployBondVault(ethers, deployer);
      const addr = await deployer.getAddress();
      await expect(vault.setNara(addr))
        .to.be.revertedWithCustomError(vault, "NotAContract");
    });

    it("sets nara once", async () => {
      const { vault, nara } = await deployBondVault(ethers, deployer);
      await vault.setNara(await nara.getAddress());
      expect(await vault.nara()).to.equal(await nara.getAddress());
    });

    it("reverts AlreadyInitialized on second setNara", async () => {
      const { vault, nara } = await deployBondVault(ethers, deployer);
      await vault.setNara(await nara.getAddress());
      await expect(vault.setNara(await nara.getAddress()))
        .to.be.revertedWithCustomError(vault, "AlreadyInitialized");
    });
  });

  // ─── C. View helpers ──────────────────────────────────────────────────────

  describe("C. View helpers", () => {
    let ethers: any;
    let deployer: Signer;
    let vault: any;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
      ({ vault } = await deployBondVaultWired(ethers, deployer, wad(5_000)));
    });

    it("bondInventory returns NARA balance", async () => {
      expect(await vault.bondInventory()).to.equal(wad(5_000));
    });

    it("netReleased = 0 before any pull", async () => {
      expect(await vault.netReleased()).to.equal(0n);
    });

    it("maxCapNow = netReleased + inventory", async () => {
      expect(await vault.maxCapNow()).to.equal(wad(5_000));
    });

    it("availableToPull = 0 when activeReleaseCap = 0", async () => {
      expect(await vault.availableToPull()).to.equal(0n);
    });
  });

  // ─── D. Market management (timelock) ─────────────────────────────────────

  describe("D. Market management", () => {
    let ethers: any;
    let deployer: Signer;
    let vault: any;
    let mockMarket: any;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
      ({ vault } = await deployBondVaultWired(ethers, deployer));

      // Deploy a mock contract to satisfy code-length guard
      const Mock = await ethers.getContractFactory("MockNARAEngineV4", deployer);
      mockMarket = await Mock.deploy();
      await mockMarket.waitForDeployment();
    });

    it("reverts ZeroAddress when proposing zero market", async () => {
      await expect(vault.proposeMarket(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("reverts NotAContract for EOA market", async () => {
      const addr = await deployer.getAddress();
      await expect(vault.proposeMarket(addr))
        .to.be.revertedWithCustomError(vault, "NotAContract");
    });

    it("reverts InvalidMarket when proposing the vault itself", async () => {
      await expect(vault.proposeMarket(await vault.getAddress()))
        .to.be.revertedWithCustomError(vault, "InvalidMarket");
    });

    it("proposeMarket emits MarketChangeProposed", async () => {
      const addr = await mockMarket.getAddress();
      await expect(vault.proposeMarket(addr))
        .to.emit(vault, "MarketChangeProposed");
    });

    it("reverts ActionNotReady before delay elapses", async () => {
      await expect(vault.executeMarketChange())
        .to.be.revertedWithCustomError(vault, "ActionNotReady");
    });

    it("cancelMarketChange clears pending", async () => {
      await vault.cancelMarketChange();
      expect((await vault.pendingMarketChange()).value).to.equal(ethers.ZeroAddress);
    });

    it("executeMarketChange sets market after delay", async () => {
      const addr = await mockMarket.getAddress();
      await vault.proposeMarket(addr);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await vault.executeMarketChange();
      expect(await vault.market()).to.equal(addr);
    });
  });

  // ─── E. Release cap management ────────────────────────────────────────────

  describe("E. Release cap management", () => {
    let ethers: any;
    let deployer: Signer;
    let vault: any;
    const ALLOC = wad(1_000);

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
      ({ vault } = await deployBondVaultWired(ethers, deployer, ALLOC));
    });

    it("reverts CapTooHigh when newCap > initialBondAllocation", async () => {
      await expect(vault.proposeReleaseCap(ALLOC + 1n))
        .to.be.revertedWithCustomError(vault, "CapTooHigh");
    });

    it("reverts SameValue when newCap = activeReleaseCap (both 0)", async () => {
      await expect(vault.proposeReleaseCap(0n))
        .to.be.revertedWithCustomError(vault, "SameValue");
    });

    it("proposeReleaseCap emits event", async () => {
      await expect(vault.proposeReleaseCap(ALLOC))
        .to.emit(vault, "ReleaseCapChangeProposed");
    });

    it("reverts ActionNotReady before delay", async () => {
      await expect(vault.executeReleaseCapChange())
        .to.be.revertedWithCustomError(vault, "ActionNotReady");
    });

    it("cancelReleaseCapChange clears pending", async () => {
      await vault.cancelReleaseCapChange();
      expect((await vault.pendingReleaseCapChange()).eta).to.equal(0n);
    });

    it("executeReleaseCapChange sets cap after delay", async () => {
      await vault.proposeReleaseCap(ALLOC);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await vault.executeReleaseCapChange();
      expect(await vault.activeReleaseCap()).to.equal(ALLOC);
      expect(await vault.availableToPull()).to.equal(ALLOC);
    });
  });

  // ─── F. pullToMarket + returnUnsold ───────────────────────────────────────

  describe("F. pullToMarket + returnUnsold", () => {
    let ethers: any;
    let deployer: Signer;
    let vault: any;
    let nara: any;
    let mockMarket: any;
    const ALLOC = wad(1_000);

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
      ({ vault, nara } = await deployBondVaultWired(ethers, deployer, ALLOC));

      // Deploy a usable mock market
      const MockMarket = await ethers.getContractFactory("MockNARAEngineV4", deployer);
      mockMarket = await MockMarket.deploy();
      await mockMarket.waitForDeployment();
      const mockAddr = await mockMarket.getAddress();

      await vault.proposeMarket(mockAddr);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await vault.executeMarketChange();

      await vault.proposeReleaseCap(ALLOC);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await vault.executeReleaseCapChange();
    });

    it("reverts InvalidMarket when non-market calls pullToMarket", async () => {
      await expect(vault.pullToMarket(wad(100)))
        .to.be.revertedWithCustomError(vault, "InvalidMarket");
    });

    it("reverts AmountExceedsAvailable when pull > cap", async () => {
      const market = await vault.market();
      const signer = await ethers.getSigner(market); // won't work — mock is contract
      // Use impersonation
      await ethers.provider.send("hardhat_impersonateAccount", [market]);
      await ethers.provider.send("hardhat_setBalance", [market, "0x1000000000000000000"]);
      const marketSigner = await ethers.getSigner(market);
      await expect((vault.connect(marketSigner) as any).pullToMarket(ALLOC + 1n))
        .to.be.revertedWithCustomError(vault, "AmountExceedsAvailable");
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [market]);
    });

    it("pullToMarket transfers NARA and updates accounting", async () => {
      const market = await vault.market();
      await ethers.provider.send("hardhat_impersonateAccount", [market]);
      await ethers.provider.send("hardhat_setBalance", [market, "0x1000000000000000000"]);
      const marketSigner = await ethers.getSigner(market);
      const pullAmount = wad(100);
      await expect((vault.connect(marketSigner) as any).pullToMarket(pullAmount))
        .to.emit(vault, "PulledToMarket").withArgs(market, pullAmount);
      expect(await vault.totalReleased()).to.equal(pullAmount);
      expect(await vault.netReleased()).to.equal(pullAmount);
      expect(await nara.balanceOf(market)).to.equal(pullAmount);
      expect(await vault.excludedMarketBalance()).to.equal(pullAmount);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [market]);
    });

    it("returnUnsold reduces netReleased and restores inventory", async () => {
      const market = await vault.market();
      const returnAmount = wad(100);
      await ethers.provider.send("hardhat_impersonateAccount", [market]);
      await ethers.provider.send("hardhat_setBalance", [market, "0x1000000000000000000"]);
      const marketSigner = await ethers.getSigner(market);
      // Market must approve vault to pull back
      await (nara.connect(marketSigner) as any).approve(await vault.getAddress(), returnAmount);
      const inventoryBefore = await vault.bondInventory();
      await expect((vault.connect(marketSigner) as any).returnUnsold(returnAmount))
        .to.emit(vault, "ReturnedFromMarket");
      expect(await vault.netReleased()).to.equal(0n);
      expect(await vault.bondInventory()).to.equal(inventoryBefore + returnAmount);
      expect(await vault.excludedMarketBalance()).to.equal(0n);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [market]);
    });

    it("lets a previous market return unsold inventory before clearing migration state", async () => {
      const { vault: localVault, nara: localNara } = await deployBondVaultWired(ethers, deployer, ALLOC);
      const MockMarket = await ethers.getContractFactory("MockNARAEngineV4", deployer);
      const marketA = await MockMarket.deploy();
      const marketB = await MockMarket.deploy();
      const marketC = await MockMarket.deploy();
      await marketA.waitForDeployment();
      await marketB.waitForDeployment();
      await marketC.waitForDeployment();
      const marketAAddr = await marketA.getAddress();
      const marketBAddr = await marketB.getAddress();
      const marketCAddr = await marketC.getAddress();

      await localVault.proposeMarket(marketAAddr);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await localVault.executeMarketChange();
      await localVault.proposeReleaseCap(ALLOC);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await localVault.executeReleaseCapChange();

      await ethers.provider.send("hardhat_impersonateAccount", [marketAAddr]);
      await ethers.provider.send("hardhat_setBalance", [marketAAddr, "0x1000000000000000000"]);
      const marketASigner = await ethers.getSigner(marketAAddr);
      const pulled = wad(100);
      await (localVault.connect(marketASigner) as any).pullToMarket(pulled);
      expect(await localNara.balanceOf(marketAAddr)).to.equal(pulled);

      await localVault.proposeMarket(marketBAddr);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await localVault.executeMarketChange();
      expect(await localVault.market()).to.equal(marketBAddr);
      expect(await localVault.previousMarket()).to.equal(marketAAddr);
      expect(await localVault.excludedMarketBalance()).to.equal(pulled);

      await localVault.proposeMarket(marketCAddr);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await expect(localVault.executeMarketChange())
        .to.be.revertedWithCustomError(localVault, "PreviousMarketStillPendingReturns");
      await expect(localVault.clearPreviousMarket())
        .to.be.revertedWithCustomError(localVault, "PreviousMarketStillPendingReturns");

      await (localNara.connect(marketASigner) as any).approve(await localVault.getAddress(), pulled);
      await expect((localVault.connect(marketASigner) as any).returnUnsold(pulled))
        .to.emit(localVault, "ReturnedFromMarket")
        .withArgs(marketAAddr, pulled);
      expect(await localVault.netReleased()).to.equal(0n);
      expect(await localVault.excludedMarketBalance()).to.equal(0n);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [marketAAddr]);

      await expect(localVault.clearPreviousMarket())
        .to.emit(localVault, "PreviousMarketCleared")
        .withArgs(marketAAddr);
      expect(await localVault.previousMarket()).to.equal(ethers.ZeroAddress);

      await localVault.executeMarketChange();
      expect(await localVault.market()).to.equal(marketCAddr);
      expect(await localVault.previousMarket()).to.equal(marketBAddr);
    });

    it("force-clears a stuck previous market without freeing its release cap", async () => {
      const { vault: localVault, nara: localNara } = await deployBondVaultWired(ethers, deployer, ALLOC);
      const MockMarket = await ethers.getContractFactory("MockNARAEngineV4", deployer);
      const marketA = await MockMarket.deploy();
      const marketB = await MockMarket.deploy();
      const marketC = await MockMarket.deploy();
      await marketA.waitForDeployment();
      await marketB.waitForDeployment();
      await marketC.waitForDeployment();
      const marketAAddr = await marketA.getAddress();
      const marketBAddr = await marketB.getAddress();
      const marketCAddr = await marketC.getAddress();

      await localVault.proposeMarket(marketAAddr);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await localVault.executeMarketChange();
      await localVault.proposeReleaseCap(ALLOC);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await localVault.executeReleaseCapChange();

      await ethers.provider.send("hardhat_impersonateAccount", [marketAAddr]);
      await ethers.provider.send("hardhat_setBalance", [marketAAddr, "0x1000000000000000000"]);
      const marketASigner = await ethers.getSigner(marketAAddr);
      const pulled = wad(100);
      await (localVault.connect(marketASigner) as any).pullToMarket(pulled);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [marketAAddr]);
      expect(await localNara.balanceOf(marketAAddr)).to.equal(pulled);

      await localVault.proposeMarket(marketBAddr);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await localVault.executeMarketChange();
      expect(await localVault.previousMarket()).to.equal(marketAAddr);
      expect(await localVault.excludedMarketBalance()).to.equal(pulled);

      await localVault.proposeMarket(marketCAddr);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await expect(localVault.executeMarketChange())
        .to.be.revertedWithCustomError(localVault, "PreviousMarketStillPendingReturns");
      await expect(localVault.clearPreviousMarket())
        .to.be.revertedWithCustomError(localVault, "PreviousMarketStillPendingReturns");

      await expect(localVault.forceClearPreviousMarket())
        .to.emit(localVault, "PreviousMarketForceCleared")
        .withArgs(marketAAddr, pulled);
      expect(await localVault.previousMarket()).to.equal(ethers.ZeroAddress);
      expect(await localVault.excludedMarketBalance()).to.equal(0n);
      expect(await localVault.netReleased()).to.equal(pulled);
      expect(await localVault.availableToPull()).to.equal(ALLOC - pulled);

      await localVault.executeMarketChange();
      expect(await localVault.market()).to.equal(marketCAddr);
      expect(await localVault.previousMarket()).to.equal(marketBAddr);
      expect(await localNara.balanceOf(marketAAddr)).to.equal(pulled);
    });
  });

  // ─── G. sweepForeignToken ─────────────────────────────────────────────────

  describe("G. sweepForeignToken", () => {
    let ethers: any;
    let deployer: Signer;
    let vault: any;
    let nara: any;
    let foreign: any;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
      ({ vault, nara } = await deployBondVaultWired(ethers, deployer, wad(1_000)));
      const ForeignToken = await ethers.getContractFactory("MockERC20", deployer);
      foreign = await ForeignToken.deploy("USDC", "USDC", 6);
      await foreign.waitForDeployment();
      await (foreign as any).mint(await vault.getAddress(), 1_000_000n);
    });

    it("reverts NaraSweepForbidden for NARA", async () => {
      const addr = await deployer.getAddress();
      await expect(vault.sweepForeignToken(await nara.getAddress(), addr, 1n))
        .to.be.revertedWithCustomError(vault, "NaraSweepForbidden");
    });

    it("sweeps foreign token successfully", async () => {
      const addr = await deployer.getAddress();
      const foreignAddr = await foreign.getAddress();
      const balBefore = await foreign.balanceOf(addr);
      await vault.sweepForeignToken(foreignAddr, addr, 1_000_000n);
      expect((await foreign.balanceOf(addr)) - balBefore).to.equal(1_000_000n);
    });

    it("reverts before NARA is bound", async () => {
      const { vault: fresh } = await deployBondVault(ethers, deployer, wad(1_000));
      const ForeignToken = await ethers.getContractFactory("MockERC20", deployer);
      const token = await ForeignToken.deploy("USDC", "USDC", 6);
      await token.waitForDeployment();
      await expect(fresh.sweepForeignToken(await token.getAddress(), await deployer.getAddress(), 1n))
        .to.be.revertedWithCustomError(fresh, "InvalidToken");
    });
  });

}); // NARABondVaultV4

// ─────────────────────────────────────────────────────────────────────────────
// III. NARABondDepositoryV4
// ─────────────────────────────────────────────────────────────────────────────

describe("III. NARABondDepositoryV4", () => {

  // ─── A. Constructor guards ────────────────────────────────────────────────

  describe("A. Constructor guards", () => {
    let ethers: any;
    let deployer: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      [deployer] = await ethers.getSigners();
    });

    async function baseContracts() {
      const deployerAddr = await deployer.getAddress();
      const NaraToken = await ethers.getContractFactory("MockERC20", deployer);
      const nara = await NaraToken.deploy("NARA", "NARA", 18);
      await nara.waitForDeployment();
      const Engine = await ethers.getContractFactory("MockNARAEngineV4", deployer);
      const engine = await Engine.deploy();
      await engine.waitForDeployment();
      await engine.setNara(await nara.getAddress());
      const Vault = await ethers.getContractFactory("NARABondVaultV4", deployer);
      const vault = await Vault.deploy(deployerAddr, ACTION_DELAY, wad(10_000));
      await vault.waitForDeployment();
      await vault.setNara(await nara.getAddress());
      return { nara, engine, vault, deployerAddr };
    }

    it("reverts ZeroAddress for nara = zero", async () => {
      const { engine, vault, deployerAddr } = await baseContracts();
      const D = await ethers.getContractFactory("NARABondDepositoryV4", deployer);
      const t = defaultTerms(ethers);
      await expect(D.deploy(ethers.ZeroAddress, await engine.getAddress(), await vault.getAddress(), deployerAddr, deployerAddr, ACTION_DELAY, t))
        .to.be.revertedWithCustomError(D, "ZeroAddress");
    });

    it("reverts ZeroAddress for engine = zero", async () => {
      const { nara, vault, deployerAddr } = await baseContracts();
      const D = await ethers.getContractFactory("NARABondDepositoryV4", deployer);
      const t = defaultTerms(ethers);
      await expect(D.deploy(await nara.getAddress(), ethers.ZeroAddress, await vault.getAddress(), deployerAddr, deployerAddr, ACTION_DELAY, t))
        .to.be.revertedWithCustomError(D, "ZeroAddress");
    });

    it("reverts ZeroAddress for vault = zero", async () => {
      const { nara, engine, deployerAddr } = await baseContracts();
      const D = await ethers.getContractFactory("NARABondDepositoryV4", deployer);
      const t = defaultTerms(ethers);
      await expect(D.deploy(await nara.getAddress(), await engine.getAddress(), ethers.ZeroAddress, deployerAddr, deployerAddr, ACTION_DELAY, t))
        .to.be.revertedWithCustomError(D, "ZeroAddress");
    });

    it("reverts InvalidTerms when adminDelaySeconds = 0", async () => {
      const { nara, engine, vault, deployerAddr } = await baseContracts();
      const D = await ethers.getContractFactory("NARABondDepositoryV4", deployer);
      const t = defaultTerms(ethers);
      await expect(D.deploy(await nara.getAddress(), await engine.getAddress(), await vault.getAddress(), deployerAddr, deployerAddr, 0n, t))
        .to.be.revertedWithCustomError(D, "InvalidTerms");
    });

    it("reverts PriceDelayTooShort when adminDelaySeconds is below 1 day", async () => {
      const { nara, engine, vault, deployerAddr } = await baseContracts();
      const D = await ethers.getContractFactory("NARABondDepositoryV4", deployer);
      const t = defaultTerms(ethers);
      await expect(D.deploy(
        await nara.getAddress(),
        await engine.getAddress(),
        await vault.getAddress(),
        deployerAddr,
        deployerAddr,
        ACTION_DELAY - 1n,
        t,
      )).to.be.revertedWithCustomError(D, "PriceDelayTooShort");
    });

    it("reverts PriceDelayTooLong when adminDelay consumes the terms freshness margin", async () => {
      const { nara, engine, vault, deployerAddr } = await baseContracts();
      const D = await ethers.getContractFactory("NARABondDepositoryV4", deployer);
      const t = defaultTerms(ethers);
      await expect(D.deploy(
        await nara.getAddress(),
        await engine.getAddress(),
        await vault.getAddress(),
        deployerAddr,
        deployerAddr,
        ACTION_DELAY + 1n,
        t,
      )).to.be.revertedWithCustomError(D, "PriceDelayTooLong");
    });

    it("reverts InvalidTerms when initialTerms.remainingCapacityNara != 0", async () => {
      const { nara, engine, vault, deployerAddr } = await baseContracts();
      const D = await ethers.getContractFactory("NARABondDepositoryV4", deployer);
      const t = defaultTerms(ethers, { remainingCapacityNara: wad(100) });
      await expect(D.deploy(await nara.getAddress(), await engine.getAddress(), await vault.getAddress(), deployerAddr, deployerAddr, ACTION_DELAY, t))
        .to.be.revertedWithCustomError(D, "InvalidTerms");
    });
  });

  // ─── B. Terms management ──────────────────────────────────────────────────

  describe("B. Terms management", () => {
    let ethers: any;
    let dep: any;
    let deployer: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ({ dep, deployer } = await deployFull(ethers));
    });

    it("proposeTerms reverts PendingProposalExists if one already exists", async () => {
      const t = defaultTerms(ethers);
      await dep.proposeTerms(t);
      await expect(dep.proposeTerms(t))
        .to.be.revertedWithCustomError(dep, "PendingProposalExists");
      await dep.cancelTerms();
    });

    it("cancelTerms clears pending", async () => {
      const t = defaultTerms(ethers);
      await dep.proposeTerms(t);
      await dep.cancelTerms();
      // Can now propose again
      await expect(dep.proposeTerms(t)).to.emit(dep, "TermsProposed");
    });

    it("executeTerms reverts PriceTimelockNotElapsed before delay", async () => {
      await dep.pause(); // must be paused to execute
      await expect(dep.executeTerms()).to.be.revertedWithCustomError(dep, "PriceTimelockNotElapsed");
    });

    it("executeTerms reverts PauseRequired when not paused", async () => {
      await dep.unpause();
      await mineTime(ethers, ACTION_DELAY + 1n);
      await expect(dep.executeTerms()).to.be.revertedWithCustomError(dep, "PauseRequired");
    });

    it("executeTerms applies new terms when paused + delay elapsed", async () => {
      const t = defaultTerms(ethers, { discountBps: 1000 });
      await dep.cancelTerms();
      await dep.proposeTerms(t);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await dep.pause();
      await dep.executeTerms();
      const live = await dep.terms();
      expect(live.discountBps).to.equal(1000n);
      await dep.unpause();
    });

    it("keeps active terms fresh through the minimum timelock refresh window", async () => {
      const ctx = await deployFull(ethers);
      await openMarket(ctx, wad(5_000));
      const msgValue = LOCK_FEE_WEI + ethers.parseEther("0.1");
      expect(await ctx.dep.quoteBond(msgValue)).to.be.gt(0n);

      await ctx.dep.proposeTerms(defaultTerms(ethers, { discountBps: 750 }));
      await mineTime(ethers, ACTION_DELAY + 1n);

      expect(await ctx.dep.quoteBond(msgValue)).to.be.gt(0n);
      await ctx.dep.pause();
      await ctx.dep.executeTerms();
      expect((await ctx.dep.terms()).discountBps).to.equal(750n);
    });
  });

  // ─── C. addCapacity ───────────────────────────────────────────────────────

  describe("C. addCapacity", () => {
    let ethers: any;
    let dep: any;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ({ dep } = await deployFull(ethers));
    });

    it("reverts PauseRequired when not paused", async () => {
      await expect(dep.addCapacity(wad(100)))
        .to.be.revertedWithCustomError(dep, "PauseRequired");
    });

    it("reverts ZeroValue for amount = 0", async () => {
      await dep.pause();
      await expect(dep.addCapacity(0n))
        .to.be.revertedWithCustomError(dep, "ZeroValue");
      await dep.unpause();
    });

    it("adds capacity when paused with sufficient vault inventory", async () => {
      await dep.pause();
      const capacity = wad(1_000);
      await expect(dep.addCapacity(capacity))
        .to.emit(dep, "CapacityAdded").withArgs(capacity, capacity);
      expect((await dep.terms()).remainingCapacityNara).to.equal(capacity);
      await dep.unpause();
    });

    it("reverts InsufficientInventory when capacity exceeds available", async () => {
      await dep.pause();
      await expect(dep.addCapacity(wad(100_000))) // way more than vault has
        .to.be.revertedWithCustomError(dep, "InsufficientInventory");
      await dep.unpause();
    });

    it("reverts PriceStale before adding capacity even when terms are inactive", async () => {
      const inactiveTerms = defaultTerms(ethers, { active: false });
      await dep.proposeTerms(inactiveTerms);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await dep.pause();
      await dep.executeTerms();
      await mineTime(ethers, 2n * ACTION_DELAY + 1n);

      await expect(dep.addCapacity(wad(100)))
        .to.be.revertedWithCustomError(dep, "PriceStale");
      await dep.unpause();
    });
  });

  // ─── D. buyBond — price math, payout, capacity ────────────────────────────

  describe("D. buyBond — price math", () => {
    let ethers: any;
    let ctx: FullCtx;
    let dep: any;
    let deployer: Signer;
    let alice: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ctx = await deployFull(ethers);
      ({ dep, deployer, alice } = ctx);
      await openMarket(ctx, wad(5_000));
    });

    it("reverts when paused", async () => {
      await dep.pause();
      await expect(
        (dep.connect(alice) as any).buyBond(0n, { value: ethers.parseEther("0.02") })
      ).to.be.revertedWithCustomError(dep, "EnforcedPause");
      await dep.unpause();
    });

    it("reverts ZeroValue when msg.value = 0", async () => {
      await expect(
        (dep.connect(alice) as any).buyBond(0n, { value: 0n })
      ).to.be.revertedWithCustomError(dep, "ZeroValue");
    });

    it("reverts DepositTooSmall when msg.value <= lockFeeWei", async () => {
      // lockFeeWei = 0.0001 ETH — sending exactly that leaves bondEthIn = 0
      await expect(
        (dep.connect(alice) as any).buyBond(0n, { value: LOCK_FEE_WEI })
      ).to.be.revertedWithCustomError(dep, "DepositTooSmall");
    });

    it("reverts DepositTooSmall when bondEthIn < minDepositWei", async () => {
      // minDepositWei = 0.01 ETH; send 0.001 + lockFee
      const tooSmall = LOCK_FEE_WEI + ethers.parseEther("0.001");
      await expect(
        (dep.connect(alice) as any).buyBond(0n, { value: tooSmall })
      ).to.be.revertedWithCustomError(dep, "DepositTooSmall");
    });

    it("reverts InvalidTerms instead of panicking when engine lockFeeBps is 100%", async () => {
      await ctx.engine.setLockFeeBps(10_000);
      const msgValue = LOCK_FEE_WEI + ethers.parseEther("0.1");

      await expect(dep.quoteBond(msgValue))
        .to.be.revertedWithCustomError(dep, "InvalidTerms");
      await expect((dep.connect(alice) as any).buyBond(0n, { value: msgValue }))
        .to.be.revertedWithCustomError(dep, "InvalidTerms");

      await ctx.engine.setLockFeeBps(200);
    });

    it("computes correct payout at 5% discount on 100 NARA/ETH price", async () => {
      // 0.01 ETH bond at 100 NARA/ETH + 5% discount = 1.05 NARA
      const bondEth = ethers.parseEther("0.01");
      const msgValue = LOCK_FEE_WEI + bondEth;
      const aliceAddr = await alice.getAddress();
      const balBefore = await ctx.nara.balanceOf(await ctx.engine.getAddress());

      const tx = await (dep.connect(alice) as any).buyBond(0n, { value: msgValue });
      const receipt = await tx.wait();

      // Find BondCreated event
      const bondEvent = receipt.logs
        .map((l: any) => { try { return dep.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "BondCreated");

      expect(bondEvent).to.not.be.null;
      const payout = bondEvent!.args.payout;
      // Expected: (0.01e18 * 105e18) / 1e18 = 1.05e18
      const expectedPayout = bondEth * 105n;
      expect(payout).to.be.closeTo(expectedPayout, wad(1) / 100n); // within 1%
    });

    it("buyBond decrements remainingCapacity", async () => {
      const bondEth = ethers.parseEther("0.01");
      const msgValue = LOCK_FEE_WEI + bondEth;
      const capBefore = (await dep.terms()).remainingCapacityNara;
      await (dep.connect(alice) as any).buyBond(0n, { value: msgValue });
      const capAfter = (await dep.terms()).remainingCapacityNara;
      expect(capAfter).to.be.lt(capBefore);
    });

    it("reverts SlippageExceeded when minNaraOut not met", async () => {
      const bondEth = ethers.parseEther("0.01");
      const msgValue = LOCK_FEE_WEI + bondEth;
      const unreachable = wad(999_999);
      await expect(
        (dep.connect(alice) as any).buyBond(unreachable, { value: msgValue })
      ).to.be.revertedWithCustomError(dep, "SlippageExceeded");
    });

    it("reverts BondInactive when terms.active = false", async () => {
      // Propose and execute inactive terms
      const t = defaultTerms(ethers, { active: false });
      await dep.proposeTerms(t);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await dep.pause();
      await dep.executeTerms();
      await dep.addCapacity(wad(5_000));
      await dep.unpause();

      const bondEth = ethers.parseEther("0.01");
      const msgValue = LOCK_FEE_WEI + bondEth;
      await expect(
        (dep.connect(alice) as any).buyBond(0n, { value: msgValue })
      ).to.be.revertedWithCustomError(dep, "BondInactive");

      // Reset to active
      const t2 = defaultTerms(ethers);
      await dep.proposeTerms(t2);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await dep.pause();
      await dep.executeTerms();
      await dep.addCapacity(wad(5_000));
      await dep.unpause();
    });

    it("increments totalBondsMinted and totalNaraSold", async () => {
      const mintsBefore = await dep.totalBondsMinted();
      const bondEth = ethers.parseEther("0.01");
      const msgValue = LOCK_FEE_WEI + bondEth;
      await (dep.connect(alice) as any).buyBond(0n, { value: msgValue });
      expect(await dep.totalBondsMinted()).to.equal(mintsBefore + 1n);
      expect(await dep.totalNaraSold()).to.be.gt(0n);
    });

    it("quotes zero and rejects buys after manual terms expire", async () => {
      const msgValue = LOCK_FEE_WEI + ethers.parseEther("0.01");
      expect(await dep.quoteBond(msgValue)).to.be.gt(0n);

      await mineTime(ethers, 2n * ACTION_DELAY + 1n);

      expect(await dep.quoteBond(msgValue)).to.equal(0n);
      await expect((dep.connect(alice) as any).buyBond(0n, { value: msgValue }))
        .to.be.revertedWithCustomError(dep, "PriceStale");
    });
  });

  // ─── E. buyBondFor ────────────────────────────────────────────────────────

  describe("E. buyBondFor", () => {
    let ethers: any;
    let ctx: FullCtx;
    let dep: any;
    let alice: Signer;
    let bob: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ctx = await deployFull(ethers);
      ({ dep, alice, bob } = ctx);
      await openMarket(ctx, wad(5_000));
    });

    it("reverts InvalidRecipient for zero address", async () => {
      const bondEth = ethers.parseEther("0.01");
      await expect(
        (dep.connect(alice) as any).buyBondFor(ethers.ZeroAddress, 0n, { value: LOCK_FEE_WEI + bondEth })
      ).to.be.revertedWithCustomError(dep, "InvalidRecipient");
    });

    it("reverts InvalidRecipient for depository address", async () => {
      const depAddr = await dep.getAddress();
      const bondEth = ethers.parseEther("0.01");
      await expect(
        (dep.connect(alice) as any).buyBondFor(depAddr, 0n, { value: LOCK_FEE_WEI + bondEth })
      ).to.be.revertedWithCustomError(dep, "InvalidRecipient");
    });

    it("mints a bond for the specified recipient", async () => {
      const bobAddr = await bob.getAddress();
      const bondEth = ethers.parseEther("0.01");
      const posIdBefore = await ctx.engine.nextPositionId();

      const tx = await (dep.connect(alice) as any).buyBondFor(bobAddr, 0n, { value: LOCK_FEE_WEI + bondEth });
      const receipt = await tx.wait();

      const bondEvent = receipt.logs
        .map((l: any) => { try { return dep.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "BondCreated");

      expect(bondEvent!.args.recipient).to.equal(bobAddr);
      expect(bondEvent!.args.buyer).to.equal(await alice.getAddress());
      // positionId = engine.nextPositionId before call
      expect(bondEvent!.args.positionId).to.equal(posIdBefore);
    });
  });

  // ─── F. ETH routing ───────────────────────────────────────────────────────

  describe("F. ETH routing — splits and queuing", () => {
    let ethers: any;
    let ctx: FullCtx;
    let dep: any;
    let engine: any;
    let alice: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ctx = await deployFull(ethers);
      ({ dep, engine, alice } = ctx);
      await openMarket(ctx, wad(5_000));
    });

    it("routes rewardEth to engine.notifyEthRewards", async () => {
      const ethBefore = await engine.totalEthNotified();
      const bondEth = ethers.parseEther("0.1");
      await (dep.connect(alice) as any).buyBond(0n, { value: LOCK_FEE_WEI + bondEth });
      const ethAfter = await engine.totalEthNotified();
      // rewardSplitWad = 0.3 → 30% of 0.1 ETH = 0.03 ETH to engine
      const expectedReward = (bondEth * 3n) / 10n;
      expect(ethAfter - ethBefore).to.be.closeTo(expectedReward, ethers.parseEther("0.0001"));
    });

    it("queues rewardEth when engine.notifyEthRewards reverts", async () => {
      await engine.setRevertOnNotify(true);
      const pendingBefore = await dep.pendingRewardEth();
      const bondEth = ethers.parseEther("0.1");
      await (dep.connect(alice) as any).buyBond(0n, { value: LOCK_FEE_WEI + bondEth });
      const pendingAfter = await dep.pendingRewardEth();
      expect(pendingAfter).to.be.gt(pendingBefore);
      await engine.setRevertOnNotify(false);
    });

    it("routes treasury ETH to treasury address", async () => {
      const treasuryAddr = ctx.treasuryAddr;
      const balBefore = await ethers.provider.getBalance(treasuryAddr);
      const bondEth = ethers.parseEther("0.1");
      await (dep.connect(alice) as any).buyBond(0n, { value: LOCK_FEE_WEI + bondEth });
      const balAfter = await ethers.provider.getBalance(treasuryAddr);
      // treasury gets 70% of bondEth
      const expectedTreasury = (bondEth * 7n) / 10n;
      expect(balAfter - balBefore).to.be.closeTo(expectedTreasury, ethers.parseEther("0.001"));
    });
  });

  // ─── G. ETH flush functions ───────────────────────────────────────────────

  describe("G. ETH flush functions", () => {
    let ethers: any;
    let ctx: FullCtx;
    let dep: any;
    let engine: any;
    let alice: Signer;
    let deployer: Signer;
    let treasury: Signer;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ctx = await deployFull(ethers);
      ({ dep, engine, alice, deployer, treasury } = ctx);
      await openMarket(ctx, wad(5_000));

      // Force some ETH into pendingRewardEth by making engine revert
      await engine.setRevertOnNotify(true);
      const bondEth = ethers.parseEther("0.1");
      await (dep.connect(alice) as any).buyBond(0n, { value: LOCK_FEE_WEI + bondEth });
      await engine.setRevertOnNotify(false);
    });

    it("flushRewardEth forwards queued ETH to engine", async () => {
      const pending = await dep.pendingRewardEth();
      expect(pending).to.be.gt(0n);
      const before = await engine.totalEthNotified();
      await dep.flushRewardEth();
      expect(await dep.pendingRewardEth()).to.equal(0n);
      expect(await engine.totalEthNotified()).to.equal(before + pending);
    });

    it("flushRewardEth reverts ZeroValue when nothing queued", async () => {
      await expect(dep.flushRewardEth())
        .to.be.revertedWithCustomError(dep, "ZeroValue");
    });

    it("rescueRewardEth extracts pendingRewardEth only to treasury", async () => {
      // Create more pending ETH
      await engine.setRevertOnNotify(true);
      const bondEth = ethers.parseEther("0.05");
      await (dep.connect(alice) as any).buyBond(0n, { value: LOCK_FEE_WEI + bondEth });
      await engine.setRevertOnNotify(false);

      const pending = await dep.pendingRewardEth();
      await expect(dep.rescueRewardEth(await deployer.getAddress()))
        .to.be.revertedWithCustomError(dep, "InvalidRecipient");

      const treasuryAddr = await treasury.getAddress();
      const balBefore = await ethers.provider.getBalance(treasuryAddr);
      await dep.rescueRewardEth(treasuryAddr);
      const balAfter = await ethers.provider.getBalance(treasuryAddr);
      expect(balAfter - balBefore).to.equal(pending);
      expect(await dep.pendingRewardEth()).to.equal(0n);
    });
  });

  // ─── H. quoteBond view ────────────────────────────────────────────────────

  describe("H. quoteBond view", () => {
    let ethers: any;
    let ctx: FullCtx;
    let dep: any;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ctx = await deployFull(ethers);
      ({ dep } = ctx);
    });

    it("returns 0 when market is not open (capacity = 0)", async () => {
      const ethIn = LOCK_FEE_WEI + ethers.parseEther("0.01");
      expect(await dep.quoteBond(ethIn)).to.equal(0n);
    });

    it("returns payout after market opens", async () => {
      await openMarket(ctx, wad(5_000));
      const bondEth = ethers.parseEther("0.01");
      const ethIn = LOCK_FEE_WEI + bondEth;
      const quote = await dep.quoteBond(ethIn);
      expect(quote).to.be.gt(0n);
      // 1.05 NARA (approx)
      expect(quote).to.be.closeTo(wad(1) + wad(1) / 20n, wad(1) / 100n);
    });

    it("returns 0 when ethIn <= lockFeeWei", async () => {
      expect(await dep.quoteBond(LOCK_FEE_WEI)).to.equal(0n);
    });
  });

  // ─── I. MAX_DISCOUNT_BPS = 3000 enforced ─────────────────────────────────

  describe("I. MAX_DISCOUNT_BPS = 3000 enforced", () => {
    let ethers: any;
    let dep: any;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ({ dep } = await deployFull(ethers));
    });

    it("MAX_DISCOUNT_BPS constant is 3000", async () => {
      expect(await dep.MAX_DISCOUNT_BPS()).to.equal(3000n);
    });

    it("proposeTerms reverts InvalidTerms when discountBps > 3000", async () => {
      const t = defaultTerms(ethers, { discountBps: 3001 });
      await expect(dep.proposeTerms(t))
        .to.be.revertedWithCustomError(dep, "InvalidTerms");
    });

    it("proposeTerms accepts discountBps = 3000 (max allowed)", async () => {
      const t = defaultTerms(ethers, { discountBps: 3000 });
      await expect(dep.proposeTerms(t)).to.emit(dep, "TermsProposed");
      await dep.cancelTerms();
    });

    it("30% discount yields correct payout", async () => {
      // Set terms to 30% discount
      const t30 = defaultTerms(ethers, { discountBps: 3000 });
      await dep.proposeTerms(t30);
      await mineTime(ethers, ACTION_DELAY + 1n);
      await dep.pause();
      await dep.executeTerms();
      await dep.unpause();

      // Open market
      await dep.pause();
      await dep.addCapacity(wad(5_000));
      await dep.unpause();

      // Quote: 0.01 ETH at 100 NARA/ETH + 30% = 1.30 NARA
      const bondEth = ethers.parseEther("0.01");
      const quote = await dep.quoteBond(LOCK_FEE_WEI + bondEth);
      const expected = bondEth * 130n;
      expect(quote).to.be.closeTo(expected, wad(1) / 100n);
    });
  });

  // ─── J. Full lifecycle ────────────────────────────────────────────────────

  describe("J. Full lifecycle", () => {
    let ethers: any;
    let ctx: FullCtx;

    before(async () => {
      ({ ethers } = await hre.network.connect());
      ctx = await deployFull(ethers);
    });

    it("end-to-end: deploy → fund vault → open → buy → verify accounting", async () => {
      const { dep, vault, nara, engine, alice, deployer, treasuryAddr } = ctx;
      const deployerAddr = await deployer.getAddress();

      // Open 2000 NARA capacity
      await dep.pause();
      await dep.addCapacity(wad(2_000));
      await dep.unpause();

      // Quote before buy
      const bondEth = ethers.parseEther("0.1");
      const msgValue = LOCK_FEE_WEI + bondEth;
      const quote = await dep.quoteBond(msgValue);
      expect(quote).to.be.gt(0n);

      // Execute buy
      const mintsBefore = await dep.totalBondsMinted();
      const soldBefore = await dep.totalNaraSold();
      const engineEthBefore = await engine.totalEthNotified();
      const treasuryBalBefore = await ethers.provider.getBalance(treasuryAddr);

      const tx = await (dep.connect(alice) as any).buyBond(0n, { value: msgValue });
      const receipt = await tx.wait();

      // Bond event
      const bondEvent = receipt.logs
        .map((l: any) => { try { return dep.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === "BondCreated");

      expect(bondEvent).to.not.be.null;

      // Accounting
      expect(await dep.totalBondsMinted()).to.equal(mintsBefore + 1n);
      expect(await dep.totalNaraSold()).to.be.gt(soldBefore);
      expect(await dep.totalBondedEth()).to.equal(bondEth);

      // Engine received some ETH (rewardSplit = 30%)
      const engineEthAfter = await engine.totalEthNotified();
      expect(engineEthAfter - engineEthBefore).to.be.closeTo(
        (bondEth * 3n) / 10n,
        ethers.parseEther("0.001"),
      );

      // Treasury received some ETH (70%)
      const treasuryBalAfter = await ethers.provider.getBalance(treasuryAddr);
      expect(treasuryBalAfter - treasuryBalBefore).to.be.closeTo(
        (bondEth * 7n) / 10n,
        ethers.parseEther("0.001"),
      );

      // Vault has less NARA (gross was pulled)
      const vaultBal = await nara.balanceOf(await vault.getAddress());
      expect(vaultBal).to.be.lt(wad(50_000));

      // Engine has more NARA (lockFor pulled it)
      const engineBal = await nara.balanceOf(await engine.getAddress());
      expect(engineBal).to.be.gt(0n);

      // Capacity decreased
      const capacityAfter = (await dep.terms()).remainingCapacityNara;
      expect(capacityAfter).to.be.lt(wad(2_000));

      // totalReleased on vault updated
      expect(await vault.totalReleased()).to.be.gt(0n);
    });

    it("returnExcessToVault sends any stray NARA back to vault", async () => {
      const { dep, nara, vault } = ctx;
      const depAddr = await dep.getAddress();

      // Manually send some NARA to the depository to simulate excess
      await (nara as any).mint(depAddr, wad(50));
      const vaultBalBefore = await nara.balanceOf(await vault.getAddress());
      await dep.returnExcessToVault();
      const vaultBalAfter = await nara.balanceOf(await vault.getAddress());
      expect(vaultBalAfter - vaultBalBefore).to.equal(wad(50));
      expect(await dep.excessNara()).to.equal(0n);
    });
  });

}); // NARABondDepositoryV4
