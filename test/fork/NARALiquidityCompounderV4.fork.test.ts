/**
 * Base mainnet FORK test for NARALiquidityCompounderV4.
 *
 * Exercises the one thing the unit tests' mock can't certify: the compounder's PositionManager
 * `modifyLiquidities` encoding (MINT_POSITION/INCREASE_LIQUIDITY + SETTLE_PAIR) and the
 * compounder -> Permit2 -> PositionManager pull, against the REAL Uniswap v4 contracts on Base.
 *
 * Uses a fresh mock NARA/USDC pair and a HOOKLESS pool: NARA's hook has no liquidity-op permission
 * (only beforeInitialize/beforeSwap), so it never touches modifyLiquidities — a hookless pool
 * faithfully tests the add path. The compounder accepts hooks == address(0).
 *
 * Requires BASE_RPC_URL or BASE_MAINNET_RPC_URL in env. Skips otherwise.
 *
 *   NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test test/fork/NARALiquidityCompounderV4.fork.test.ts
 */
import { expect } from "chai";
import hre from "hardhat";

const ONE = 10n ** 18n;
const USDC = 10n ** 6n;
const MAX_UINT64 = (1n << 64n) - 1n;
const SQRT_PRICE_1_1 = 1n << 96n;
const POOL_FEE = 3000;
const TICK_SPACING = 60;

// Live Base mainnet Uniswap v4 + Permit2 (mirrors scripts/lib/v4LiveConfig.ts).
const BASE_POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const BASE_POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
const BASE_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const POOL_MANAGER_ABI = [
  "function initialize((address,address,uint24,int24,address) key, uint160 sqrtPriceX96) returns (int24)",
];
const ERC721_ABI = ["function ownerOf(uint256) view returns (address)"];
const ERC20_BAL_ABI = ["function balanceOf(address) view returns (uint256)"];

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

function sortAddresses(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

(hasRpc ? describe : describe.skip)("NARALiquidityCompounderV4 — Base fork", () => {
  it("adds real full-range liquidity via the live PositionManager (mint, exact-spend, bank)", async function () {
    this.timeout(180000);
    const { ethers } = await hre.network.connect("baseFork");
    const [deployer, keeper] = await ethers.getSigners();

    // Fresh mock pair (so the pool definitely doesn't exist yet on the fork).
    const nara = await ethers.deployContract("MockERC20", ["NARA", "NARA", 18], deployer);
    await nara.waitForDeployment();
    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6], deployer);
    await usdc.waitForDeployment();
    const naraAddr = await nara.getAddress();
    const usdcAddr = await usdc.getAddress();

    const [currency0, currency1] = sortAddresses(naraAddr, usdcAddr);
    const key = [currency0, currency1, POOL_FEE, TICK_SPACING, ethers.ZeroAddress] as const;

    // Initialize the hookless pool on the REAL PoolManager.
    const poolManager = new ethers.Contract(BASE_POOL_MANAGER, POOL_MANAGER_ABI, deployer);
    await (await poolManager.initialize(key, SQRT_PRICE_1_1)).wait();

    // Vault + compounder wired to the REAL v4 stack.
    const vault = await ethers.deployContract(
      "NARALiquidityGrowthVault",
      [deployer.address, naraAddr, usdcAddr],
      deployer,
    );
    await vault.waitForDeployment();
    await vault.setCompoundKeeper(keeper.address, true);

    const compounder = await ethers.deployContract(
      "NARALiquidityCompounderV4",
      [
        deployer.address,
        await vault.getAddress(),
        BASE_POOL_MANAGER,
        BASE_POSITION_MANAGER,
        BASE_PERMIT2,
        naraAddr,
        usdcAddr,
        POOL_FEE,
        TICK_SPACING,
        ethers.ZeroAddress, // hookless pool
      ],
      deployer,
    );
    await compounder.waitForDeployment();
    const compounderAddr = await compounder.getAddress();
    await vault.setCompounder(compounderAddr);

    // Seed the vault skim balances.
    const naraIn = 1_000n * ONE;
    const usdcIn = 1_000n * USDC;
    await nara.mint(await vault.getAddress(), naraIn);
    await usdc.mint(await vault.getAddress(), usdcIn);

    const pmNaraBefore = (await new ethers.Contract(naraAddr, ERC20_BAL_ABI, deployer).balanceOf(BASE_POOL_MANAGER)) as bigint;

    // Compound through the REAL PositionManager.
    await vault.connect(keeper).compound(naraIn, usdcIn, 1n, MAX_UINT64, "0x");

    // A real position NFT was minted to the compounder.
    const tokenId = await compounder.positionTokenId();
    expect(tokenId).to.be.greaterThan(0n);
    const posMgr = new ethers.Contract(BASE_POSITION_MANAGER, ERC721_ABI, deployer);
    expect(await posMgr.ownerOf(tokenId)).to.equal(compounderAddr);

    // Real liquidity recorded and tokens actually moved into the v4 singleton.
    expect(await compounder.totalLiquidityAdded()).to.be.greaterThan(0n);
    const pmNaraAfter = (await new ethers.Contract(naraAddr, ERC20_BAL_ABI, deployer).balanceOf(BASE_POOL_MANAGER)) as bigint;
    expect(pmNaraAfter).to.be.greaterThan(pmNaraBefore);

    // Exact-spend held (vault released exactly the requested amounts; remainder banked here).
    const [bankedNara, bankedUsdc] = await compounder.bankedBalances();
    expect(bankedNara + (await compounder.totalNaraAdded())).to.equal(naraIn);
    expect(bankedUsdc + (await compounder.totalUsdcAdded())).to.equal(usdcIn);

    // Second compound increases the SAME position (no new mint).
    await nara.mint(await vault.getAddress(), naraIn);
    await usdc.mint(await vault.getAddress(), usdcIn);
    await vault.connect(keeper).compound(naraIn, usdcIn, 1n, MAX_UINT64, "0x");
    expect(await compounder.positionTokenId()).to.equal(tokenId);
    expect(await posMgr.ownerOf(tokenId)).to.equal(compounderAddr);
  });
});
