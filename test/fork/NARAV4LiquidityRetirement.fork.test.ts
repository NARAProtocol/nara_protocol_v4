/**
 * Deterministic Base-fork proof for retirement of the active NARA/USDC
 * liquidity stack. This test never signs or broadcasts a Base transaction.
 *
 * It pins the fork after three sells emptied the liquidity EOA's NARA and an
 * intervening keeper compound, then proves the complete custody path:
 *
 *   revoke keeper -> queue 7-day WindDown -> drain vault -> execute WindDown
 *   -> fully decrease both Safe-owned LP NFTs -> TAKE both currencies to Safe
 *
 * Run from the protocol repository:
 *
 *   $env:NODE_OPTIONS='--require ./polyfill.cjs'
 *   npx hardhat test test/fork/NARAV4LiquidityRetirement.fork.test.ts
 */
import { expect } from "chai";
import hre from "hardhat";
import {
  decodePositionTicks,
  fullDecreaseUnlockData,
  positionFeesFromGrowth,
  positionPrincipalAtSpot,
} from "../../scripts/buildV4LiquidityStackRecoveryProposal.js";

const RPC_URL = process.env.BASE_RPC_URL ?? process.env.BASE_MAINNET_RPC_URL;
const PINNED_BLOCK = 49_372_240;
const PINNED_BLOCK_HASH = "0x02da53fa90857257c4f8b75efe2db57f3de7f19b5874175b09aa0d8dfb948300";

const SAFE = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";
const KEEPER = "0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7";
const VAULT = "0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d";
const COMPOUNDER = "0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98";
const NARA = "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const REWARD_RESERVE = "0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD";
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
const POOL_ID = "0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318";
const SEED_POSITION_ID = 2_884_402n;
const COMPOUNDER_POSITION_ID = 2_885_838n;
const WIND_DOWN = 3;
const RECOVERY_DELAY = 7n * 24n * 60n * 60n;

const EXPECTED_SCOPED_NARA = 321_662_875_771_577_338_403_662n;
const EXPECTED_SCOPED_USDC = 363_781_444n;
// PositionManager rounds token input up when the retirement drain increases
// liquidity, then rounds the corresponding full decrease down. The fixed
// add/remove round trip at this snapshot leaves exactly one raw NARA unit of
// singleton dust (1e-18 NARA); account for it explicitly instead of hiding it.
const EXPECTED_RETIREMENT_ROUNDING_DUST_NARA = 1n;
const UINT128_MASK = (1n << 128n) - 1n;
const UINT256_MASK = (1n << 256n) - 1n;
const POOLS_STORAGE_SLOT = 6n;

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const VAULT_ABI = [
  "function owner() view returns (address)",
  "function compoundKeeper(address) view returns (bool)",
  "function balances() view returns (uint256 tokenBalance,uint256 baseBalance)",
  "function setCompoundKeeper(address keeper,bool allowed)",
  "function compoundAll(uint256 minLiquidityAdded,uint64 deadline,bytes data) returns (uint256 liquidityAdded)",
];
const COMPOUNDER_ABI = [
  "function owner() view returns (address)",
  "function positionTokenId() view returns (uint256)",
  "function totalLiquidityAdded() view returns (uint256)",
  "function bankedBalances() view returns (uint256 naraBanked,uint256 usdcBanked)",
  "function pendingRecovery() view returns (uint8 kind,address to,uint64 eta)",
  "function proposeRecovery(uint8 kind,address to)",
  "function executeRecovery()",
];
const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,uint256 info)",
  "function modifyLiquidities(bytes unlockData,uint256 deadline) payable",
];
const POOL_MANAGER_ABI = [
  "function extsload(bytes32 slot) view returns (bytes32 value)",
  "function extsload(bytes32 startSlot,uint256 nSlots) view returns (bytes32[] values)",
];

type PoolKeySnapshot = {
  currency0: string;
  currency1: string;
  fee: bigint;
  tickSpacing: bigint;
  hooks: string;
};

type TokenInventory = {
  principalNara: bigint;
  principalUsdc: bigint;
  feesNara: bigint;
  feesUsdc: bigint;
  withdrawableNara: bigint;
  withdrawableUsdc: bigint;
};

function word(ethers: typeof import("ethers"), value: bigint): string {
  return ethers.zeroPadValue(ethers.toBeHex(value & UINT256_MASK), 32);
}

function addSlot(ethers: typeof import("ethers"), slot: string, offset: bigint): string {
  return word(ethers, BigInt(slot) + offset);
}

function subtractModulo256(...values: bigint[]): bigint {
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) {
    result = (result - values[i]) & UINT256_MASK;
  }
  return result;
}

function signed24(value: bigint): number {
  const raw = Number(value & 0xff_ffffn);
  return raw >= 0x80_0000 ? raw - 0x100_0000 : raw;
}

(RPC_URL ? describe : describe.skip)("NARA v4 liquidity retirement — pinned Base fork", function () {
  it("moves the complete scoped inventory to the Safe without touching the reward reserve", async function () {
    this.timeout(240_000);
    const { ethers } = await hre.network.connect("baseLiquidityRetirementFork");
    const pinnedBlock = await ethers.provider.getBlock(PINNED_BLOCK);
    expect(pinnedBlock?.number).to.equal(PINNED_BLOCK);
    expect(pinnedBlock?.hash).to.equal(PINNED_BLOCK_HASH);

    const nara = new ethers.Contract(NARA, ERC20_ABI, ethers.provider);
    const usdc = new ethers.Contract(USDC, ERC20_ABI, ethers.provider);
    const vault = new ethers.Contract(VAULT, VAULT_ABI, ethers.provider);
    const compounder = new ethers.Contract(COMPOUNDER, COMPOUNDER_ABI, ethers.provider);
    const positionManager = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, ethers.provider);
    const poolManager = new ethers.Contract(POOL_MANAGER, POOL_MANAGER_ABI, ethers.provider);

    const poolStateSlot = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "bytes32"],
        [POOL_ID, word(ethers, POOLS_STORAGE_SLOT)],
      ),
    );
    const feeGrowthGlobalSlot = addSlot(ethers, poolStateSlot, 1n);
    const activeLiquiditySlot = addSlot(ethers, poolStateSlot, 3n);
    const ticksMappingSlot = addSlot(ethers, poolStateSlot, 4n);
    const positionsMappingSlot = addSlot(ethers, poolStateSlot, 6n);

    const loadWord = async (slot: string): Promise<string> =>
      poolManager["extsload(bytes32)"](slot) as Promise<string>;
    const loadWords = async (slot: string, count: bigint): Promise<string[]> =>
      poolManager["extsload(bytes32,uint256)"](slot, count) as Promise<string[]>;
    const poolActiveLiquidity = async (): Promise<bigint> =>
      BigInt(await loadWord(activeLiquiditySlot)) & UINT128_MASK;

    const slot0Word = BigInt(await loadWord(poolStateSlot));
    const sqrtPriceX96 = slot0Word & ((1n << 160n) - 1n);
    const currentTick = signed24(slot0Word >> 160n);
    const feeGrowthGlobals = await loadWords(feeGrowthGlobalSlot, 2n);
    const feeGrowthGlobal0X128 = BigInt(feeGrowthGlobals[0]);
    const feeGrowthGlobal1X128 = BigInt(feeGrowthGlobals[1]);

    const feeGrowthInside = async (tickLower: number, tickUpper: number) => {
      const lowerSlot = ethers.keccak256(
        ethers.solidityPacked(["int256", "bytes32"], [BigInt(tickLower), ticksMappingSlot]),
      );
      const upperSlot = ethers.keccak256(
        ethers.solidityPacked(["int256", "bytes32"], [BigInt(tickUpper), ticksMappingSlot]),
      );
      const [lowerWords, upperWords] = await Promise.all([
        loadWords(addSlot(ethers, lowerSlot, 1n), 2n),
        loadWords(addSlot(ethers, upperSlot, 1n), 2n),
      ]);
      const lower0 = BigInt(lowerWords[0]);
      const lower1 = BigInt(lowerWords[1]);
      const upper0 = BigInt(upperWords[0]);
      const upper1 = BigInt(upperWords[1]);
      if (currentTick < tickLower) {
        return {
          feeGrowthInside0X128: subtractModulo256(lower0, upper0),
          feeGrowthInside1X128: subtractModulo256(lower1, upper1),
        };
      }
      if (currentTick >= tickUpper) {
        return {
          feeGrowthInside0X128: subtractModulo256(upper0, lower0),
          feeGrowthInside1X128: subtractModulo256(upper1, lower1),
        };
      }
      return {
        feeGrowthInside0X128: subtractModulo256(feeGrowthGlobal0X128, lower0, upper0),
        feeGrowthInside1X128: subtractModulo256(feeGrowthGlobal1X128, lower1, upper1),
      };
    };

    const positionInventory = async (tokenId: bigint): Promise<TokenInventory> => {
      const liquidity = await positionManager.getPositionLiquidity(tokenId) as bigint;
      const result = await positionManager.getPoolAndPositionInfo(tokenId) as readonly [PoolKeySnapshot, bigint];
      const [key, packedPositionInfo] = result;
      const actualPoolId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint24,int24,address)"],
          [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]],
        ),
      );
      expect(actualPoolId).to.equal(POOL_ID);
      const ticks = decodePositionTicks(packedPositionInfo);
      const positionId = ethers.solidityPackedKeccak256(
        ["address", "int24", "int24", "bytes32"],
        [POSITION_MANAGER, ticks.tickLower, ticks.tickUpper, word(ethers, tokenId)],
      );
      const positionSlot = ethers.keccak256(
        ethers.solidityPacked(["bytes32", "bytes32"], [positionId, positionsMappingSlot]),
      );
      const [positionWords, inside] = await Promise.all([
        loadWords(positionSlot, 3n),
        feeGrowthInside(ticks.tickLower, ticks.tickUpper),
      ]);
      expect(BigInt(positionWords[0]) & UINT128_MASK).to.equal(liquidity);

      const principal = positionPrincipalAtSpot({
        liquidity,
        sqrtPriceX96,
        currentTick,
        tickLower: ticks.tickLower,
        tickUpper: ticks.tickUpper,
      });
      const fees = positionFeesFromGrowth({
        liquidity,
        ...inside,
        feeGrowthInside0LastX128: BigInt(positionWords[1]),
        feeGrowthInside1LastX128: BigInt(positionWords[2]),
      });
      const naraIsCurrency0 = ethers.getAddress(key.currency0) === ethers.getAddress(NARA);
      const principalNara = naraIsCurrency0 ? principal.amount0 : principal.amount1;
      const principalUsdc = naraIsCurrency0 ? principal.amount1 : principal.amount0;
      const feesNara = naraIsCurrency0 ? fees.amount0 : fees.amount1;
      const feesUsdc = naraIsCurrency0 ? fees.amount1 : fees.amount0;
      return {
        principalNara,
        principalUsdc,
        feesNara,
        feesUsdc,
        withdrawableNara: principalNara + feesNara,
        withdrawableUsdc: principalUsdc + feesUsdc,
      };
    };

    const [seedInventory, compounderInventory] = await Promise.all([
      positionInventory(SEED_POSITION_ID),
      positionInventory(COMPOUNDER_POSITION_ID),
    ]);
    const [vaultBalancesBefore, compounderBankBefore] = await Promise.all([
      vault.balances() as Promise<{ tokenBalance: bigint; baseBalance: bigint }>,
      compounder.bankedBalances() as Promise<{ naraBanked: bigint; usdcBanked: bigint }>,
    ]);
    const scopedNara =
      seedInventory.withdrawableNara
      + compounderInventory.withdrawableNara
      + vaultBalancesBefore.tokenBalance
      + compounderBankBefore.naraBanked;
    const scopedUsdc =
      seedInventory.withdrawableUsdc
      + compounderInventory.withdrawableUsdc
      + vaultBalancesBefore.baseBalance
      + compounderBankBefore.usdcBanked;
    expect(scopedNara).to.equal(EXPECTED_SCOPED_NARA);
    expect(scopedUsdc).to.equal(EXPECTED_SCOPED_USDC);

    expect(await vault.owner()).to.equal(SAFE);
    expect(await compounder.owner()).to.equal(SAFE);
    expect(await vault.compoundKeeper(KEEPER)).to.equal(true);
    const pendingBefore = await compounder.pendingRecovery();
    expect([pendingBefore.kind, pendingBefore.to, pendingBefore.eta]).to.deep.equal([
      0n,
      ethers.ZeroAddress,
      0n,
    ]);

    const readStage0InvariantState = async () => {
      const [
        safeNara,
        safeUsdc,
        vaultReported,
        vaultNara,
        vaultUsdc,
        compounderBank,
        compounderNara,
        compounderUsdc,
        seedOwner,
        seedLiquidity,
        compounderOwner,
        compounderLiquidity,
        positionTokenId,
        totalLiquidityAdded,
        slot0,
        activeLiquidity,
        reserveNara,
      ] = await Promise.all([
        nara.balanceOf(SAFE) as Promise<bigint>,
        usdc.balanceOf(SAFE) as Promise<bigint>,
        vault.balances() as Promise<{ tokenBalance: bigint; baseBalance: bigint }>,
        nara.balanceOf(VAULT) as Promise<bigint>,
        usdc.balanceOf(VAULT) as Promise<bigint>,
        compounder.bankedBalances() as Promise<{ naraBanked: bigint; usdcBanked: bigint }>,
        nara.balanceOf(COMPOUNDER) as Promise<bigint>,
        usdc.balanceOf(COMPOUNDER) as Promise<bigint>,
        positionManager.ownerOf(SEED_POSITION_ID) as Promise<string>,
        positionManager.getPositionLiquidity(SEED_POSITION_ID) as Promise<bigint>,
        positionManager.ownerOf(COMPOUNDER_POSITION_ID) as Promise<string>,
        positionManager.getPositionLiquidity(COMPOUNDER_POSITION_ID) as Promise<bigint>,
        compounder.positionTokenId() as Promise<bigint>,
        compounder.totalLiquidityAdded() as Promise<bigint>,
        loadWord(poolStateSlot),
        poolActiveLiquidity(),
        nara.balanceOf(REWARD_RESERVE) as Promise<bigint>,
      ]);
      return {
        safeNara,
        safeUsdc,
        vaultReportedToken: vaultReported.tokenBalance,
        vaultReportedBase: vaultReported.baseBalance,
        vaultNara,
        vaultUsdc,
        compounderBankNara: compounderBank.naraBanked,
        compounderBankUsdc: compounderBank.usdcBanked,
        compounderNara,
        compounderUsdc,
        seedOwner,
        seedLiquidity,
        compounderOwner,
        compounderLiquidity,
        positionTokenId,
        totalLiquidityAdded,
        slot0,
        activeLiquidity,
        reserveNara,
      };
    };

    const stage0Before = await readStage0InvariantState();
    expect(stage0Before.reserveNara).to.equal(650_000n * 10n ** 18n);
    expect(stage0Before.activeLiquidity).to.equal(
      stage0Before.seedLiquidity + stage0Before.compounderLiquidity,
    );

    await ethers.provider.send("hardhat_impersonateAccount", [SAFE]);
    await ethers.provider.send("hardhat_setBalance", [SAFE, ethers.toBeHex(10n ** 18n)]);
    const safeSigner = await ethers.getSigner(SAFE);
    const vaultAsSafe = vault.connect(safeSigner) as typeof vault;
    const compounderAsSafe = compounder.connect(safeSigner) as typeof compounder;
    const positionManagerAsSafe = positionManager.connect(safeSigner) as typeof positionManager;

    const revokeReceipt = await (
      await vaultAsSafe.setCompoundKeeper(KEEPER, false)
    ).wait();
    const proposalReceipt = await (
      await compounderAsSafe.proposeRecovery(WIND_DOWN, SAFE)
    ).wait();
    expect(revokeReceipt?.status).to.equal(1);
    expect(proposalReceipt?.status).to.equal(1);

    const pendingAfterProposal = await compounder.pendingRecovery();
    const proposalBlock = await ethers.provider.getBlock(proposalReceipt!.blockNumber);
    expect(await vault.compoundKeeper(KEEPER)).to.equal(false);
    expect(pendingAfterProposal.kind).to.equal(3n);
    expect(pendingAfterProposal.to).to.equal(SAFE);
    expect(pendingAfterProposal.eta).to.equal(BigInt(proposalBlock!.timestamp) + RECOVERY_DELAY);
    expect(await readStage0InvariantState()).to.deep.equal(stage0Before);

    // Advance the local fork to the exact executable time, then have the Safe
    // drain the still-accruing vault before WindDown. At this pinned state the
    // vault is NARA-only, while banked USDC supplies the balancing side.
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(pendingAfterProposal.eta)]);
    await ethers.provider.send("evm_mine", []);
    const compounderLiquidityBeforeDrain = await positionManager.getPositionLiquidity(
      COMPOUNDER_POSITION_ID,
    ) as bigint;
    const drainDeadline = pendingAfterProposal.eta + 3_600n;
    const expectedDrainLiquidity = await vaultAsSafe.compoundAll.staticCall(
      1n,
      drainDeadline,
      "0x",
    ) as bigint;
    expect(expectedDrainLiquidity).to.be.greaterThan(0n);
    const drainReceipt = await (
      await vaultAsSafe.compoundAll(1n, drainDeadline, "0x")
    ).wait();
    expect(drainReceipt?.status).to.equal(1);
    const compounderLiquidityAfterDrain = await positionManager.getPositionLiquidity(
      COMPOUNDER_POSITION_ID,
    ) as bigint;
    const drainLiquidityAdded = compounderLiquidityAfterDrain - compounderLiquidityBeforeDrain;
    expect(drainLiquidityAdded).to.equal(expectedDrainLiquidity);
    const vaultBalancesAfterDrain = await vault.balances();
    expect(vaultBalancesAfterDrain.tokenBalance).to.equal(0n);
    expect(vaultBalancesAfterDrain.baseBalance).to.equal(0n);

    const bankBeforeWindDown = await compounder.bankedBalances();
    const safeNaraBeforeRecovery = await nara.balanceOf(SAFE) as bigint;
    const safeUsdcBeforeRecovery = await usdc.balanceOf(SAFE) as bigint;
    const executeReceipt = await (await compounderAsSafe.executeRecovery()).wait();
    expect(executeReceipt?.status).to.equal(1);
    expect(await compounder.positionTokenId()).to.equal(0n);
    expect(await positionManager.ownerOf(COMPOUNDER_POSITION_ID)).to.equal(SAFE);
    const bankAfterWindDown = await compounder.bankedBalances();
    expect(bankAfterWindDown.naraBanked).to.equal(0n);
    expect(bankAfterWindDown.usdcBanked).to.equal(0n);
    const safeNaraAfterWindDown = await nara.balanceOf(SAFE) as bigint;
    const safeUsdcAfterWindDown = await usdc.balanceOf(SAFE) as bigint;
    expect(safeNaraAfterWindDown - safeNaraBeforeRecovery).to.equal(bankBeforeWindDown.naraBanked);
    expect(safeUsdcAfterWindDown - safeUsdcBeforeRecovery).to.equal(bankBeforeWindDown.usdcBanked);

    const [currency0, currency1] = BigInt(NARA) < BigInt(USDC) ? [NARA, USDC] : [USDC, NARA];
    const removalBlock = await ethers.provider.getBlock("latest");
    const removalDeadline = BigInt(removalBlock!.timestamp) + 3_600n;
    const seedLiquidity = await positionManager.getPositionLiquidity(SEED_POSITION_ID) as bigint;
    const compounderLiquidity = await positionManager.getPositionLiquidity(COMPOUNDER_POSITION_ID) as bigint;
    const seedUnlockData = fullDecreaseUnlockData({
      tokenId: SEED_POSITION_ID,
      liquidity: seedLiquidity,
      recipient: SAFE,
      currency0,
      currency1,
    });
    const compounderUnlockData = fullDecreaseUnlockData({
      tokenId: COMPOUNDER_POSITION_ID,
      liquidity: compounderLiquidity,
      recipient: SAFE,
      currency0,
      currency1,
    });
    const seedRemovalReceipt = await (
      await positionManagerAsSafe.modifyLiquidities(
        seedUnlockData,
        removalDeadline,
        { gasLimit: 2_000_000n },
      )
    ).wait();
    const compounderRemovalReceipt = await (
      await positionManagerAsSafe.modifyLiquidities(
        compounderUnlockData,
        removalDeadline,
        { gasLimit: 2_000_000n },
      )
    ).wait();
    expect(seedRemovalReceipt?.status).to.equal(1);
    expect(compounderRemovalReceipt?.status).to.equal(1);

    const safeNaraAfter = await nara.balanceOf(SAFE) as bigint;
    const safeUsdcAfter = await usdc.balanceOf(SAFE) as bigint;
    const safeNaraDelta = safeNaraAfter - stage0Before.safeNara;
    const safeUsdcDelta = safeUsdcAfter - stage0Before.safeUsdc;
    expect(safeNaraDelta + EXPECTED_RETIREMENT_ROUNDING_DUST_NARA).to.equal(scopedNara);
    expect(safeUsdcDelta).to.equal(scopedUsdc);
    expect(await positionManager.getPositionLiquidity(SEED_POSITION_ID)).to.equal(0n);
    expect(await positionManager.getPositionLiquidity(COMPOUNDER_POSITION_ID)).to.equal(0n);
    expect(await poolActiveLiquidity()).to.equal(0n);
    expect(await nara.balanceOf(VAULT)).to.equal(0n);
    expect(await usdc.balanceOf(VAULT)).to.equal(0n);
    expect(await nara.balanceOf(COMPOUNDER)).to.equal(0n);
    expect(await usdc.balanceOf(COMPOUNDER)).to.equal(0n);
    expect(await nara.balanceOf(REWARD_RESERVE)).to.equal(stage0Before.reserveNara);

    console.log(JSON.stringify({
      pinnedBlock: PINNED_BLOCK,
      pinnedBlockHash: PINNED_BLOCK_HASH,
      preStateInventory: {
        naraRaw: scopedNara.toString(),
        usdcRaw: scopedUsdc.toString(),
        nara: ethers.formatUnits(scopedNara, 18),
        usdc: ethers.formatUnits(scopedUsdc, 6),
      },
      stage0: {
        revokeTxHash: revokeReceipt!.hash,
        proposalTxHash: proposalReceipt!.hash,
        eta: pendingAfterProposal.eta.toString(),
        noMovementInvariant: true,
      },
      retirementDrain: {
        txHash: drainReceipt!.hash,
        compounderLiquidityBefore: compounderLiquidityBeforeDrain.toString(),
        liquidityAdded: drainLiquidityAdded.toString(),
        compounderLiquidityAfter: compounderLiquidityAfterDrain.toString(),
        vaultNaraAfter: "0",
        vaultUsdcAfter: "0",
      },
      windDown: {
        txHash: executeReceipt!.hash,
        safeNaraDeltaBeforeLpRemoval: (safeNaraAfterWindDown - stage0Before.safeNara).toString(),
        safeUsdcDeltaBeforeLpRemoval: (safeUsdcAfterWindDown - stage0Before.safeUsdc).toString(),
        bankAfterNara: "0",
        bankAfterUsdc: "0",
      },
      removal: {
        seedTxHash: seedRemovalReceipt!.hash,
        compounderTxHash: compounderRemovalReceipt!.hash,
        finalSafeNaraDelta: safeNaraDelta.toString(),
        finalSafeUsdcDelta: safeUsdcDelta.toString(),
        accountedRoundingDustNaraRaw: EXPECTED_RETIREMENT_ROUNDING_DUST_NARA.toString(),
        seedLiquidityAfter: "0",
        compounderLiquidityAfter: "0",
        poolActiveLiquidityAfter: "0",
        reserveUnchanged: true,
      },
    }, null, 2));
  });
});
