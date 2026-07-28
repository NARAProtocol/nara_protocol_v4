import { expect } from "chai";
import hre from "hardhat";

const HOOK = "0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088";
const NARA = "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const OWNER = "0xC019Dc79412c4b20103ac4ce97B2615FF45D490d";
const LIQUIDITY_WALLET = "0x290286870126c291594BC6Fa4Ed41DC4cF82020B";
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const POOL_ID = "0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3";

const FEE = 3000;
const TICK_SPACING = 60;
const TICK_LOWER = -887220;
const TICK_UPPER = 887220;
const NARA_AMOUNT = 60_000n * 10n ** 18n;
const USDC_AMOUNT = 300n * 10n ** 6n;
const TARGET_NARA_DEPTH = 60_000n * 10n ** 18n;

const HOOK_ABI = [
  "function protocolDepth(address) view returns (uint256)",
  "function pendingProtocolDepth(address) view returns (uint256 depth,uint48 eta,bool exists)",
  "function executeProtocolDepth(address)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const PERMIT2_ABI = [
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
];
const POSITION_MANAGER_ABI = [
  "function initializePool((address,address,uint24,int24,address) key,uint160 sqrtPriceX96) payable returns (int24)",
  "function modifyLiquidities(bytes unlockData,uint256 deadline) payable",
  "function multicall(bytes[] data) payable returns (bytes[])",
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
];
const POOL_MANAGER_ABI = ["function extsload(bytes32 slot) view returns (bytes32)"];

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

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

(hasRpc ? describe : describe.skip)("NARA live deployment — pre-liquidity fork rehearsal", () => {
  it("executes the pending depth update, then atomically initializes and seeds 60k/300", async function () {
    this.timeout(180000);
    const { ethers } = await hre.network.connect("baseFork");

    await ethers.provider.send("hardhat_impersonateAccount", [OWNER]);
    await ethers.provider.send("hardhat_impersonateAccount", [LIQUIDITY_WALLET]);
    await ethers.provider.send("hardhat_setBalance", [OWNER, "0x21e19e0c9bab2400000"]);
    await ethers.provider.send("hardhat_setBalance", [LIQUIDITY_WALLET, "0x21e19e0c9bab2400000"]);

    const owner = await ethers.getSigner(OWNER);
    const liquidityWallet = await ethers.getSigner(LIQUIDITY_WALLET);
    const hook = new ethers.Contract(HOOK, HOOK_ABI, owner);
    const pending = await hook.pendingProtocolDepth(NARA);
    expect(pending.exists).to.equal(true);
    expect(pending.depth).to.equal(TARGET_NARA_DEPTH);

    const latest = await ethers.provider.getBlock("latest");
    if (!latest) throw new Error("Missing latest fork block");
    if (BigInt(latest.timestamp) < pending.eta) {
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(pending.eta)]);
      await ethers.provider.send("evm_mine", []);
    }
    await hook.executeProtocolDepth(NARA);
    expect(await hook.protocolDepth(NARA)).to.equal(TARGET_NARA_DEPTH);
    const executionBlock = await ethers.provider.getBlock("latest");
    if (!executionBlock) throw new Error("Missing post-execution fork block");

    const nara = new ethers.Contract(NARA, ERC20_ABI, liquidityWallet);
    const usdc = new ethers.Contract(USDC, ERC20_ABI, liquidityWallet);
    expect(await nara.balanceOf(LIQUIDITY_WALLET)).to.be.greaterThanOrEqual(NARA_AMOUNT);
    expect(await usdc.balanceOf(LIQUIDITY_WALLET)).to.be.greaterThanOrEqual(USDC_AMOUNT);

    const currency0 = NARA;
    const currency1 = USDC;
    const key = [currency0, currency1, FEE, TICK_SPACING, HOOK] as const;
    const sqrtPriceX96 = sqrtPriceX96FromAmounts(NARA_AMOUNT, USDC_AMOUNT);
    const q96 = 1n << 96n;
    const liquidity0 = (NARA_AMOUNT * sqrtPriceX96) / q96;
    const liquidity1 = (USDC_AMOUNT * q96) / sqrtPriceX96;
    const liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;

    const poolStateSlot = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [POOL_ID, ethers.zeroPadValue("0x06", 32)]),
    );
    const poolManager = new ethers.Contract(POOL_MANAGER, POOL_MANAGER_ABI, liquidityWallet);
    const slot0Before = BigInt(await poolManager.extsload(poolStateSlot)) & ((1n << 160n) - 1n);
    expect(slot0Before).to.equal(0n);

    await nara.approve(PERMIT2, NARA_AMOUNT);
    await usdc.approve(PERMIT2, USDC_AMOUNT);
    const permit2 = new ethers.Contract(PERMIT2, PERMIT2_ABI, liquidityWallet);
    const expiration = BigInt(executionBlock.timestamp + 3600);
    await permit2.approve(NARA, POSITION_MANAGER, NARA_AMOUNT, expiration);
    await permit2.approve(USDC, POSITION_MANAGER, USDC_AMOUNT, expiration);

    const pm = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, liquidityWallet);
    const nextTokenId = await pm.nextTokenId();
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
      [key, TICK_LOWER, TICK_UPPER, liquidity, NARA_AMOUNT, USDC_AMOUNT, LIQUIDITY_WALLET, "0x"],
    );
    const settleParams = abi.encode(["address", "address"], [currency0, currency1]);
    const actions = ethers.hexlify(new Uint8Array([0x02, 0x0d]));
    const unlockData = abi.encode(["bytes", "bytes[]"], [actions, [mintParams, settleParams]]);
    const deadline = BigInt(executionBlock.timestamp + 600);
    const initializeCall = pm.interface.encodeFunctionData("initializePool", [key, sqrtPriceX96]);
    const mintCall = pm.interface.encodeFunctionData("modifyLiquidities", [unlockData, deadline]);
    await (await pm.multicall([initializeCall, mintCall])).wait();

    const slot0After = BigInt(await poolManager.extsload(poolStateSlot)) & ((1n << 160n) - 1n);
    expect(slot0After).to.equal(sqrtPriceX96);
    expect(await pm.ownerOf(nextTokenId)).to.equal(LIQUIDITY_WALLET);
    expect(await pm.getPositionLiquidity(nextTokenId)).to.be.greaterThan(0n);
  });
});
