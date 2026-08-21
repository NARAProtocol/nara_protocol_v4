/**
 * Base mainnet FORK test for NARALiquidityCompounderV4.
 *
 * Exercises the one thing the unit tests' mock can't certify: the compounder's PositionManager
 * `modifyLiquidities` encoding (MINT_POSITION/INCREASE_LIQUIDITY + SETTLE_PAIR) and the
 * compounder -> Permit2 -> PositionManager pull, against the REAL Uniswap v4 contracts on Base.
 *
 * Uses a fresh mock NARA/USDC pair and a permission-correct production Hook. The Hook has no liquidity-op permission
 * (only beforeInitialize/beforeSwap), so it never touches modifyLiquidities; the hooked pool
 * faithfully tests the add path while the Compounder's full immutable binding checks remain active.
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
const HOOK_FLAG_MASK = 0x3fffn;
const REQUIRED_HOOK_FLAGS = 0x2088n;

// Live Base mainnet Uniswap v4 + Permit2 (mirrors scripts/lib/v4LiveConfig.ts).
const BASE_POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const BASE_POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
const BASE_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const POOL_MANAGER_ABI = [
  "function initialize((address,address,uint24,int24,address) key, uint160 sqrtPriceX96) returns (int24)",
];
const POSITION_MANAGER_ABI = [
  "function initializePool((address,address,uint24,int24,address) key, uint160 sqrtPriceX96) payable returns (int24)",
  "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
  "function multicall(bytes[] data) payable returns (bytes[])",
  "function nextTokenId() view returns (uint256)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];
const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
];
const ERC721_ABI = ["function ownerOf(uint256) view returns (address)"];
const ERC20_BAL_ABI = ["function balanceOf(address) view returns (uint256)"];

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

function sortAddresses(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

function sqrtPriceX96FromAmounts(amount0: bigint, amount1: bigint): bigint {
  return isqrt((amount1 * (1n << 192n)) / amount0);
}

function mineHookSalt(
  ethers: any,
  create2Deployer: string,
  initCode: string,
): { salt: string; address: string } {
  const initCodeHash = ethers.keccak256(initCode);
  const seed = ethers.keccak256(ethers.toUtf8Bytes("NARA-COMPOUNDER-BASE-FORK"));

  for (let i = 0; i < 250_000; i += 1) {
    const salt = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "uint256"], [seed, BigInt(i)]),
    );
    const candidate = ethers.getCreate2Address(create2Deployer, salt, initCodeHash);
    if ((BigInt(candidate) & HOOK_FLAG_MASK) === REQUIRED_HOOK_FLAGS) {
      return { salt, address: candidate };
    }
  }

  throw new Error("Unable to mine a valid Hook address");
}

function encodeCompoundConstraints(
  ethers: any,
  sqrtPriceX96: bigint,
  maxNaraUsed: bigint,
  maxUsdcUsed: bigint,
): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint160,uint160,uint160,uint16,uint256,uint256)"],
    [[sqrtPriceX96, sqrtPriceX96, sqrtPriceX96, 500, maxNaraUsed, maxUsdcUsed]],
  );
}

(hasRpc ? describe : describe.skip)("NARALiquidityCompounderV4 — Base fork", () => {
  it("atomically initializes a fresh pool and mints its first full-range position", async function () {
    this.timeout(180000);
    const { ethers } = await hre.network.connect("baseFork");
    const [deployer] = await ethers.getSigners();

    const nara = await ethers.deployContract("MockERC20", ["NARA", "NARA", 18], deployer);
    await nara.waitForDeployment();
    const usdc = await ethers.deployContract("MockERC20", ["USD Coin", "USDC", 6], deployer);
    await usdc.waitForDeployment();
    const naraAddr = await nara.getAddress();
    const usdcAddr = await usdc.getAddress();
    const [currency0, currency1] = sortAddresses(naraAddr, usdcAddr);
    const naraIsCurrency0 = currency0 === naraAddr;
    const key = [currency0, currency1, POOL_FEE, TICK_SPACING, ethers.ZeroAddress] as const;

    const naraAmount = 60_000n * ONE;
    const usdcAmount = 300n * USDC;
    const amount0 = naraIsCurrency0 ? naraAmount : usdcAmount;
    const amount1 = naraIsCurrency0 ? usdcAmount : naraAmount;
    const sqrtPriceX96 = sqrtPriceX96FromAmounts(amount0, amount1);
    const q96 = 1n << 96n;
    const liquidity0 = (amount0 * sqrtPriceX96) / q96;
    const liquidity1 = (amount1 * q96) / sqrtPriceX96;
    const liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;

    await nara.mint(deployer.address, naraAmount);
    await usdc.mint(deployer.address, usdcAmount);
    await nara.approve(BASE_PERMIT2, ethers.MaxUint256);
    await usdc.approve(BASE_PERMIT2, ethers.MaxUint256);
    const permit2 = new ethers.Contract(BASE_PERMIT2, PERMIT2_ABI, deployer);
    const maxUint160 = (1n << 160n) - 1n;
    const maxUint48 = (1n << 48n) - 1n;
    await permit2.approve(naraAddr, BASE_POSITION_MANAGER, maxUint160, maxUint48);
    await permit2.approve(usdcAddr, BASE_POSITION_MANAGER, maxUint160, maxUint48);

    const pm = new ethers.Contract(BASE_POSITION_MANAGER, POSITION_MANAGER_ABI, deployer);
    const nextId = await pm.nextTokenId() as bigint;
    const abi = ethers.AbiCoder.defaultAbiCoder();
    const mintParams = abi.encode(
      [
        "tuple(address,address,uint24,int24,address)",
        "int24",
        "int24",
        "uint256",
        "uint128",
        "uint128",
        "address",
        "bytes",
      ],
      [key, -887220, 887220, liquidity, amount0, amount1, deployer.address, "0x"],
    );
    const settleParams = abi.encode(["address", "address"], [currency0, currency1]);
    const actions = ethers.hexlify(new Uint8Array([0x02, 0x0d]));
    const unlockData = abi.encode(["bytes", "bytes[]"], [actions, [mintParams, settleParams]]);
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

    const initializeCall = pm.interface.encodeFunctionData("initializePool", [key, sqrtPriceX96]);
    const mintCall = pm.interface.encodeFunctionData("modifyLiquidities", [unlockData, deadline]);
    await (await pm.multicall([initializeCall, mintCall])).wait();

    expect(await pm.ownerOf(nextId)).to.equal(deployer.address);
    expect(await pm.getPositionLiquidity(nextId)).to.be.greaterThan(0n);

    const poolManager = new ethers.Contract(BASE_POOL_MANAGER, POOL_MANAGER_ABI, deployer);
    await expect(poolManager.initialize(key, sqrtPriceX96)).to.be.revert(ethers);
  });

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

    // Vault + permission-correct Hook wired to the REAL v4 stack.
    const vault: any = await ethers.deployContract(
      "NARALiquidityGrowthVault",
      [deployer.address, naraAddr, usdcAddr],
      deployer,
    );
    await vault.waitForDeployment();

    const create2 = await ethers.deployContract("Create2HookDeployer", [deployer.address], deployer);
    await create2.waitForDeployment();
    const Hook = await ethers.getContractFactory("NARALiquidityGrowthHook", deployer);
    const hookDeployTx = await Hook.getDeployTransaction(
      BASE_POOL_MANAGER,
      deployer.address,
      naraAddr,
      usdcAddr,
      await vault.getAddress(),
    );
    if (typeof hookDeployTx.data !== "string") throw new Error("Hook init code unavailable");
    const minedHook = mineHookSalt(ethers, await create2.getAddress(), hookDeployTx.data);
    await (await create2.deploy(minedHook.salt, hookDeployTx.data)).wait();
    const hook = await ethers.getContractAt("NARALiquidityGrowthHook", minedHook.address, deployer);
    await vault.setHook(minedHook.address);

    const [currency0, currency1] = sortAddresses(naraAddr, usdcAddr);
    const key = [currency0, currency1, POOL_FEE, TICK_SPACING, minedHook.address] as const;
    await hook.setProtocolDepth(naraAddr, 1_000n * ONE);
    await hook.setProtocolDepth(usdcAddr, 1_000n * USDC);
    await hook.registerPool(
      {
        currency0,
        currency1,
        fee: POOL_FEE,
        tickSpacing: TICK_SPACING,
        hooks: minedHook.address,
      },
      SQRT_PRICE_1_1,
    );

    const poolManager = new ethers.Contract(BASE_POOL_MANAGER, POOL_MANAGER_ABI, deployer);
    await (await poolManager.initialize(key, SQRT_PRICE_1_1)).wait();
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
        minedHook.address,
      ],
      deployer,
    );
    await compounder.waitForDeployment();
    const compounderAddr = await compounder.getAddress();
    await vault.setCompounder(compounderAddr);
    await vault.freezeCompounder();

    // Seed the vault skim balances.
    const naraIn = 1_000n * ONE;
    const usdcIn = 1_000n * USDC;
    await nara.mint(await vault.getAddress(), naraIn);
    await usdc.mint(await vault.getAddress(), usdcIn);

    const pmNaraBefore = (await new ethers.Contract(naraAddr, ERC20_BAL_ABI, deployer).balanceOf(BASE_POOL_MANAGER)) as bigint;

    // Compound through the REAL PositionManager.
    const constraints = encodeCompoundConstraints(ethers, SQRT_PRICE_1_1, naraIn, usdcIn);
    await vault.connect(keeper).compound(naraIn, usdcIn, 1n, MAX_UINT64, constraints);

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
    await vault.connect(keeper).compound(naraIn, usdcIn, 1n, MAX_UINT64, constraints);
    expect(await compounder.positionTokenId()).to.equal(tokenId);
    expect(await posMgr.ownerOf(tokenId)).to.equal(compounderAddr);
  });
});
