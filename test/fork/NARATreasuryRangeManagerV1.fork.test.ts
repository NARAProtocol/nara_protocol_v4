/**
 * Pinned Base fork proof for the real NARA pool and Uniswap v4 periphery.
 *
 * This test impersonates the production Safe and Treasury only inside the local fork and funds only
 * their fork ETH gas balances. It reproduces the real funding prerequisite by calling the actual ERC20
 * transfers from Treasury to Safe; it never edits token storage. It then proves the manager's binding
 * checks and one-sided MINT_POSITION/SETTLE_PAIR then BURN_POSITION/TAKE_PAIR encoding against the
 * deployed PositionManager and Permit2. Price traversal and adversarial settlement belong to the
 * separate simulator stream; unit/invariant tests cover the manager's terminal state machine.
 */
import { expect } from "chai";
import hre from "hardhat";

const PINNED_BLOCK = 50_537_172;
const PINNED_BLOCK_HASH = "0x6e896c222c2b8313fc232d174136d58212835c39a06378f2dbf2b73c0101b7d9";

const SAFE = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";
const TREASURY = "0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e";
const TREASURY_DELEGATION_CODE = "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b";
const NARA = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const VAULT = "0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D";
const HOOK = "0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088";
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const POOL_ID = "0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464";
const POOL_FEE = 3_000;
const TICK_SPACING = 60;
const SEED_POSITION = 2_898_124n;
const COMPOUNDER_POSITION = 2_898_486n;
const SELL_INPUT = 10n ** 18n;
const BUY_INPUT = 10n ** 6n;

async function latestBlock(ethers: any) {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("Latest block is unavailable");
  return block;
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
const POSITION_MANAGER_ABI = [
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function getPositionLiquidity(uint256) view returns (uint128)",
];
const PERMIT2_ABI = [
  "function allowance(address,address,address) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
];

const rpcUrl = process.env.BASE_MAINNET_RPC_URL || process.env.BASE_RPC_URL;

(rpcUrl ? describe : describe.skip)("NARATreasuryRangeManagerV1 - pinned Base fork", function () {
  it("binds the live stack and round-trips real one-sided positions without disturbing permanent POL", async function () {
    this.timeout(180_000);
    const { ethers } = await hre.network.connect({
      network: "baseFork",
      chainType: "op",
      override: { forking: { url: rpcUrl!, blockNumber: PINNED_BLOCK } },
    });

    const pinned = await ethers.provider.getBlock(PINNED_BLOCK);
    expect(pinned?.hash).to.equal(PINNED_BLOCK_HASH);
    await ethers.provider.send("hardhat_impersonateAccount", [SAFE]);
    await ethers.provider.send("hardhat_impersonateAccount", [TREASURY]);
    await ethers.provider.send("hardhat_setBalance", [SAFE, ethers.toBeHex(10n ** 18n)]);
    await ethers.provider.send("hardhat_setBalance", [TREASURY, ethers.toBeHex(10n ** 18n)]);
    const safeSigner = await ethers.getSigner(SAFE);
    const treasurySigner = await ethers.getSigner(TREASURY);
    const [deployer] = await ethers.getSigners();

    const nara: any = new ethers.Contract(NARA, ERC20_ABI, safeSigner);
    const usdc: any = new ethers.Contract(USDC, ERC20_ABI, safeSigner);
    const treasuryNara: any = nara.connect(treasurySigner);
    const treasuryUsdc: any = usdc.connect(treasurySigner);
    const positionManager: any = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, ethers.provider);
    const permit2: any = new ethers.Contract(PERMIT2, PERMIT2_ABI, ethers.provider);

    expect(await nara.balanceOf(SAFE)).to.equal(2_070_480n);
    expect(await usdc.balanceOf(SAFE)).to.equal(0n);
    expect(await nara.balanceOf(TREASURY)).to.equal(231_654_347945195939825307n);
    expect(await usdc.balanceOf(TREASURY)).to.equal(4_398_903041n);
    expect(await ethers.provider.getCode(TREASURY)).to.equal(TREASURY_DELEGATION_CODE);
    const seedOwnerBefore = await positionManager.ownerOf(SEED_POSITION);
    const seedLiquidityBefore = await positionManager.getPositionLiquidity(SEED_POSITION);
    const compounderOwnerBefore = await positionManager.ownerOf(COMPOUNDER_POSITION);
    const compounderLiquidityBefore = await positionManager.getPositionLiquidity(COMPOUNDER_POSITION);

    const block = await latestBlock(ethers);
    const manager: any = await ethers.deployContract("NARATreasuryRangeManagerV1", [
      SAFE, NARA, USDC, VAULT, POOL_MANAGER, POSITION_MANAGER, PERMIT2, HOOK,
      POOL_FEE, TICK_SPACING, POOL_ID, BigInt(block.timestamp + 3_600),
    ], deployer);
    await manager.waitForDeployment();
    const managerAddress = await manager.getAddress();
    expect(await manager.assertOperationalClean()).to.equal(true);
    expect(await manager.canonicalPoolKey()).to.deep.equal([USDC, NARA, 3_000n, 60n, HOOK]);

    const [, currentTick] = await manager.currentPoolState();
    const tick = Number(currentTick);
    const floorAligned = Math.floor(tick / TICK_SPACING) * TICK_SPACING;
    const ceilAligned = Math.ceil(tick / TICK_SPACING) * TICK_SPACING;
    const sellUpper = floorAligned - TICK_SPACING;
    const sellLower = sellUpper - TICK_SPACING;
    const buyLower = ceilAligned + TICK_SPACING;
    const buyUpper = buyLower + TICK_SPACING;

    // An approval cannot manufacture inventory: the unfunded Safe attempt rolls back before registration.
    const nextBeforeFailedCreate = await positionManager.nextTokenId();
    const failedDeadline = BigInt((await latestBlock(ethers)).timestamp + 3_600);
    await (await nara.approve(managerAddress, SELL_INPUT)).wait();
    await expect(manager.connect(safeSigner).createSellNaraOrder(
      sellLower,
      sellUpper,
      SELL_INPUT,
      1n,
      ethers.keccak256(ethers.toUtf8Bytes("fork-unfunded-safe")),
      failedDeadline,
    )).to.revert(ethers);
    expect(await manager.orderCount()).to.equal(0n);
    expect(await positionManager.nextTokenId()).to.equal(nextBeforeFailedCreate);
    await (await nara.approve(managerAddress, 0n)).wait();
    expect(await manager.assertOperationalClean()).to.equal(true);

    // Reproduce the actual operational prerequisite with ERC20 transfers from Treasury, never storage edits.
    const treasuryNaraBeforeFunding = await nara.balanceOf(TREASURY);
    const treasuryUsdcBeforeFunding = await usdc.balanceOf(TREASURY);
    const safeNaraBeforeFunding = await nara.balanceOf(SAFE);
    const safeUsdcBeforeFunding = await usdc.balanceOf(SAFE);
    await (await treasuryNara.transfer(SAFE, SELL_INPUT)).wait();
    await (await treasuryUsdc.transfer(SAFE, BUY_INPUT)).wait();
    expect(treasuryNaraBeforeFunding - (await nara.balanceOf(TREASURY))).to.equal(SELL_INPUT);
    expect(treasuryUsdcBeforeFunding - (await usdc.balanceOf(TREASURY))).to.equal(BUY_INPUT);
    expect((await nara.balanceOf(SAFE)) - safeNaraBeforeFunding).to.equal(SELL_INPUT);
    expect((await usdc.balanceOf(SAFE)) - safeUsdcBeforeFunding).to.equal(BUY_INPUT);

    const roundTrip = async (
      token: any,
      side: "sell" | "buy",
      input: bigint,
      lower: number,
      upper: number,
      orderId: bigint,
    ) => {
      const safeNaraBefore = await nara.balanceOf(SAFE);
      const safeUsdcBefore = await usdc.balanceOf(SAFE);
      const tokenId = await positionManager.nextTokenId();
      const deadline = BigInt((await latestBlock(ethers)).timestamp + 3_600);
      await (await token.approve(managerAddress, input)).wait();
      const strategyHash = ethers.keccak256(ethers.toUtf8Bytes(`fork-${side}-${orderId}`));
      const createName = side === "sell" ? "createSellNaraOrder" : "createBuyNaraOrder";
      await (await manager.connect(safeSigner)[createName](
        lower, upper, input, 1n, strategyHash, deadline,
      )).wait();

      const order = await manager.getOrder(orderId);
      expect(order.tokenId).to.equal(tokenId);
      expect(order.inputAmount).to.be.greaterThan(0n);
      expect(order.inputAmount).to.be.at.most(input);
      expect(order.status).to.equal(1n);
      expect(await manager.tokenIdToOrderId(tokenId)).to.equal(orderId);
      expect(await positionManager.ownerOf(tokenId)).to.equal(managerAddress);
      expect(await positionManager.getPositionLiquidity(tokenId)).to.equal(order.liquidity);
      expect(await token.allowance(SAFE, managerAddress)).to.equal(0n);
      expect(await token.allowance(managerAddress, PERMIT2)).to.equal(0n);
      expect((await permit2.allowance(managerAddress, await token.getAddress(), POSITION_MANAGER)).amount)
        .to.equal(0n);

      await (await manager.connect(safeSigner).cancel(orderId, 0n, 0n, deadline)).wait();
      expect((await manager.getOrder(orderId)).status).to.equal(3n);
      expect(await positionManager.getPositionLiquidity(tokenId)).to.equal(0n);
      await expect(positionManager.ownerOf(tokenId)).to.revert(ethers);
      expect(await nara.balanceOf(managerAddress)).to.equal(0n);
      expect(await usdc.balanceOf(managerAddress)).to.equal(0n);
      expect(await manager.assertOperationalClean()).to.equal(true);

      const safeNaraAfter = await nara.balanceOf(SAFE);
      const safeUsdcAfter = await usdc.balanceOf(SAFE);
      if (side === "sell") {
        expect(safeUsdcAfter).to.equal(safeUsdcBefore);
        expect(safeNaraAfter).to.be.at.least(safeNaraBefore - 1n);
      } else {
        expect(safeNaraAfter).to.equal(safeNaraBefore);
        expect(safeUsdcAfter).to.be.at.least(safeUsdcBefore - 1n);
      }
    };

    await roundTrip(nara, "sell", SELL_INPUT, sellLower, sellUpper, 1n);
    await roundTrip(usdc, "buy", BUY_INPUT, buyLower, buyUpper, 2n);

    expect(await positionManager.ownerOf(SEED_POSITION)).to.equal(seedOwnerBefore);
    expect(await positionManager.getPositionLiquidity(SEED_POSITION)).to.equal(seedLiquidityBefore);
    expect(await positionManager.ownerOf(COMPOUNDER_POSITION)).to.equal(compounderOwnerBefore);
    expect(await positionManager.getPositionLiquidity(COMPOUNDER_POSITION)).to.equal(compounderLiquidityBefore);
    expect(await nara.balanceOf(TREASURY)).to.equal(treasuryNaraBeforeFunding - SELL_INPUT);
    expect(await usdc.balanceOf(TREASURY)).to.equal(treasuryUsdcBeforeFunding - BUY_INPUT);
    expect(await manager.activeOrderCount()).to.equal(0n);
  });
});
