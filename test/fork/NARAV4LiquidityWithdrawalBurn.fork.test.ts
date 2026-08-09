import { expect } from "chai";
import { ethers as standaloneEthers } from "ethers";
import hre from "hardhat";
import {
  SAFE,
  STACK,
  bpsFloor,
  burnPositionUnlockData,
  decodePositionTicks,
  positionPrincipalAtSpot,
  sqrtPriceAtTick,
  withdrawalCallPlan,
} from "../../scripts/lib/v4LiquidityWithdrawal.js";

const RPC_URL = process.env.BASE_MAINNET_RPC_URL ?? process.env.BASE_RPC_URL;
const UINT128_MASK = (1n << 128n) - 1n;
const POOLS_STORAGE_SLOT = 6n;
const EXPECTED_SCOPED_NARA = 321_662_875_771_577_338_403_662n;
const EXPECTED_SCOPED_USDC = 363_781_444n;
const EXPECTED_ROUNDING_DUST_NARA = 1n;

const ERC20_ABI = ["function balanceOf(address) view returns(uint256)"];
const VAULT_ABI = [
  "function balances() view returns(uint256 tokenBalance,uint256 baseBalance)",
  "function compoundAll(uint256 minLiquidityAdded,uint64 deadline,bytes data) returns(uint256)",
];
const COMPOUNDER_ABI = [
  "function positionTokenId() view returns(uint256)",
  "function bankedBalances() view returns(uint256 naraBanked,uint256 usdcBanked)",
  "function pendingRecovery() view returns(uint8 kind,address to,uint64 eta)",
];
const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns(address)",
  "function getPositionLiquidity(uint256 tokenId) view returns(uint128)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,uint256 info)",
];
const POOL_MANAGER_ABI = ["function extsload(bytes32 slot) view returns(bytes32 value)"];

function word(value: bigint): string {
  return standaloneEthers.zeroPadValue(standaloneEthers.toBeHex(value), 32);
}

function signed24(value: bigint): number {
  const raw = Number(value & 0xff_ffffn);
  return raw >= 0x80_0000 ? raw - 0x100_0000 : raw;
}

describe("NARA v4 liquidity withdrawal burn encoding", function () {
  it("matches canonical TickMath boundary values", function () {
    expect(sqrtPriceAtTick(0)).to.equal(1n << 96n);
    expect(sqrtPriceAtTick(-887272)).to.equal(4_295_128_739n);
    expect(sqrtPriceAtTick(887272)).to.equal(
      1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342n,
    );
  });

  it("encodes BURN_POSITION followed by TAKE_PAIR to the custody Safe", function () {
    const encoded = burnPositionUnlockData({
      tokenId: STACK.seedPositionTokenId,
      currency0: STACK.nara,
      currency1: STACK.usdc,
      recipient: SAFE,
      amount0Min: 123n,
      amount1Min: 456n,
    });
    const abi = standaloneEthers.AbiCoder.defaultAbiCoder();
    const [actions, params] = abi.decode(["bytes", "bytes[]"], encoded) as unknown as [string, string[]];
    expect(actions).to.equal("0x0311");
    const burn = abi.decode(["uint256", "uint128", "uint128", "bytes"], params[0]);
    expect(burn[0]).to.equal(STACK.seedPositionTokenId);
    expect(burn[1]).to.equal(123n);
    expect(burn[2]).to.equal(456n);
    const take = abi.decode(["address", "address", "address"], params[1]);
    expect(take[0]).to.equal(STACK.nara);
    expect(take[1]).to.equal(STACK.usdc);
    expect(take[2]).to.equal(SAFE);
  });
});

(RPC_URL ? describe : describe.skip)("NARA v4 matured withdrawal — immutable pre-execution Base fork", function () {
  it("drains the Vault, executes WindDown, burns both positions, and reconciles custody", async function () {
    this.timeout(240_000);
    const { ethers } = await hre.network.connect("baseLiquidityWithdrawalFork");
    const vault = new ethers.Contract(STACK.vault, VAULT_ABI, ethers.provider);
    const compounder = new ethers.Contract(STACK.compounder, COMPOUNDER_ABI, ethers.provider);
    const positionManager = new ethers.Contract(STACK.positionManager, POSITION_MANAGER_ABI, ethers.provider);
    const poolManager = new ethers.Contract(STACK.poolManager, POOL_MANAGER_ABI, ethers.provider);
    const nara = new ethers.Contract(STACK.nara, ERC20_ABI, ethers.provider);
    const usdc = new ethers.Contract(STACK.usdc, ERC20_ABI, ethers.provider);

    const block = await ethers.provider.getBlock("latest");
    expect(block).not.to.equal(null);
    const deadline = BigInt(block!.timestamp) + 3_600n;
    const pending = await compounder.pendingRecovery();
    expect(pending.kind).to.equal(3n);
    expect(pending.to).to.equal(SAFE);
    expect(BigInt(block!.timestamp)).to.be.greaterThanOrEqual(pending.eta);

    const poolStateSlot = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [STACK.poolId, word(POOLS_STORAGE_SLOT)]),
    );
    const activeLiquiditySlot = word(BigInt(poolStateSlot) + 3n);
    const slot0Word = BigInt(await poolManager.extsload(poolStateSlot));
    const sqrtPriceX96 = slot0Word & ((1n << 160n) - 1n);
    const currentTick = signed24(slot0Word >> 160n);

    const [seedLiquidity, compounderLiquidity, seedInfo, compounderInfo] = await Promise.all([
      positionManager.getPositionLiquidity(STACK.seedPositionTokenId) as Promise<bigint>,
      positionManager.getPositionLiquidity(STACK.compounderPositionTokenId) as Promise<bigint>,
      positionManager.getPoolAndPositionInfo(STACK.seedPositionTokenId),
      positionManager.getPoolAndPositionInfo(STACK.compounderPositionTokenId),
    ]);
    const seedTicks = decodePositionTicks(seedInfo[1]);
    const compounderTicks = decodePositionTicks(compounderInfo[1]);
    const added = await vault.compoundAll.staticCall(1n, deadline, "0x", { from: SAFE }) as bigint;
    expect(added).to.be.greaterThan(0n);
    const seedPrincipal = positionPrincipalAtSpot({
      liquidity: seedLiquidity,
      sqrtPriceX96,
      currentTick,
      ...seedTicks,
    });
    const projectedCompounderPrincipal = positionPrincipalAtSpot({
      liquidity: compounderLiquidity + added,
      sqrtPriceX96,
      currentTick,
      ...compounderTicks,
    });
    const calls = withdrawalCallPlan({
      deadline,
      seedMin: {
        amount0: bpsFloor(seedPrincipal.amount0, 9_900n),
        amount1: bpsFloor(seedPrincipal.amount1, 9_900n),
      },
      compounderMin: {
        amount0: bpsFloor(projectedCompounderPrincipal.amount0, 9_900n),
        amount1: bpsFloor(projectedCompounderPrincipal.amount1, 9_900n),
      },
    });

    const [safeNaraBefore, safeUsdcBefore, reserveBefore] = await Promise.all([
      nara.balanceOf(SAFE) as Promise<bigint>,
      usdc.balanceOf(SAFE) as Promise<bigint>,
      nara.balanceOf(STACK.rewardReserve) as Promise<bigint>,
    ]);
    await ethers.provider.send("hardhat_impersonateAccount", [SAFE]);
    await ethers.provider.send("hardhat_setBalance", [SAFE, ethers.toBeHex(10n ** 18n)]);
    const safeSigner = await ethers.getSigner(SAFE);
    for (const call of calls) {
      const receipt = await (await safeSigner.sendTransaction({
        to: call.to,
        value: call.value,
        data: call.data,
        gasLimit: 5_000_000n,
      })).wait();
      expect(receipt?.status).to.equal(1);
    }

    const [
      vaultAfter,
      bankAfter,
      pendingAfter,
      seedLiquidityAfter,
      compounderLiquidityAfter,
      safeNaraAfter,
      safeUsdcAfter,
      reserveAfter,
      activeAfter,
    ] = await Promise.all([
      vault.balances(),
      compounder.bankedBalances(),
      compounder.pendingRecovery(),
      positionManager.getPositionLiquidity(STACK.seedPositionTokenId) as Promise<bigint>,
      positionManager.getPositionLiquidity(STACK.compounderPositionTokenId) as Promise<bigint>,
      nara.balanceOf(SAFE) as Promise<bigint>,
      usdc.balanceOf(SAFE) as Promise<bigint>,
      nara.balanceOf(STACK.rewardReserve) as Promise<bigint>,
      poolManager.extsload(activeLiquiditySlot) as Promise<string>,
    ]);
    expect(vaultAfter.tokenBalance).to.equal(0n);
    expect(vaultAfter.baseBalance).to.equal(0n);
    expect(bankAfter.naraBanked).to.equal(0n);
    expect(bankAfter.usdcBanked).to.equal(0n);
    expect(pendingAfter.kind).to.equal(0n);
    expect(pendingAfter.to).to.equal(ethers.ZeroAddress);
    expect(pendingAfter.eta).to.equal(0n);
    expect(seedLiquidityAfter).to.equal(0n);
    expect(compounderLiquidityAfter).to.equal(0n);
    expect(await nara.balanceOf(STACK.vault)).to.equal(0n);
    expect(await usdc.balanceOf(STACK.vault)).to.equal(0n);
    expect(await nara.balanceOf(STACK.compounder)).to.equal(0n);
    expect(await usdc.balanceOf(STACK.compounder)).to.equal(0n);
    expect(await compounder.positionTokenId()).to.equal(0n);
    await expect(positionManager.ownerOf(STACK.seedPositionTokenId)).to.be.revert(ethers);
    await expect(positionManager.ownerOf(STACK.compounderPositionTokenId)).to.be.revert(ethers);
    expect(BigInt(activeAfter) & UINT128_MASK).to.equal(0n);
    expect(safeUsdcAfter - safeUsdcBefore).to.equal(EXPECTED_SCOPED_USDC);
    expect(safeNaraAfter - safeNaraBefore + EXPECTED_ROUNDING_DUST_NARA).to.equal(EXPECTED_SCOPED_NARA);
    expect(reserveAfter).to.equal(reserveBefore);
  });
});
