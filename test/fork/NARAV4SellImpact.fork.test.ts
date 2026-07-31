/**
 * Read-only production-state impact simulation for a 10,000 NARA sell.
 *
 * The test forks Base, impersonates the custody/liquidity Safe only inside the
 * local fork, executes the canonical Universal Router path, and prints the
 * measured result. It never signs or broadcasts a production transaction.
 */
import { expect } from "chai";
import { ethers as ethersUtils } from "ethers";
import hre from "hardhat";

const NARA = "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const HOOK = "0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088";
const VAULT = "0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d";
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const LIQUIDITY_SAFE = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";
const SELLER = process.env.V4_SELL_SIMULATOR_HOLDER?.trim() || LIQUIDITY_SAFE;
const POOL_ID = "0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318";
const SELL_AMOUNT = ethersUtils.parseUnits(
  process.env.V4_SELL_SIMULATOR_AMOUNT_NARA?.trim() || "10000",
  18,
);
const Q192 = 1n << 192n;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const PERMIT2_ABI = [
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
];
const ROUTER_ABI = [
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
];
const HOOK_ABI = [
  "function quotePoolFee(bool isBuy,uint256 amountIn) view returns (uint16 feeBps,uint256 feeAmount)",
];
const POOL_MANAGER_ABI = ["function extsload(bytes32 slot) view returns (bytes32)"];

function poolStateSlot() {
  return ethersUtils.keccak256(
    ethersUtils.solidityPacked(
      ["bytes32", "bytes32"],
      [POOL_ID, ethersUtils.zeroPadValue("0x06", 32)],
    ),
  );
}

async function sqrtPriceX96(poolManager: { extsload(slot: string): Promise<string> }): Promise<bigint> {
  const raw = await poolManager.extsload(poolStateSlot()) as string;
  return BigInt(raw) & ((1n << 160n) - 1n);
}

function usdcPerNaraWad(sqrtPrice: bigint): bigint {
  // NARA is currency0 and USDC is currency1. Convert raw USDC/NARA to
  // human-decimal USDC/NARA and retain 18 decimal places for reporting.
  return sqrtPrice * sqrtPrice * 10n ** 30n / Q192;
}

function percent(numerator: bigint, denominator: bigint): string {
  return (Number(numerator * 1_000_000n / denominator) / 10_000).toFixed(2);
}

const hasRpc = !!(process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL);

(hasRpc ? describe : describe.skip)("deployed NARA v4 - 10k sell impact on Base fork", function () {
  it("measures the exact canonical-route result without a production write", async function () {
    this.timeout(180_000);
    const { ethers, networkName } = await hre.network.connect("baseFork");
    expect(networkName).to.equal("baseFork");

    await ethers.provider.send("hardhat_impersonateAccount", [SELLER]);
    await ethers.provider.send("hardhat_setBalance", [
      SELLER,
      ethers.toQuantity(ethers.parseEther("1")),
    ]);
    const seller = await ethers.getSigner(SELLER);
    const nara = new ethers.Contract(NARA, ERC20_ABI, seller);
    const usdc = new ethers.Contract(USDC, ERC20_ABI, seller);
    const permit2 = new ethers.Contract(PERMIT2, PERMIT2_ABI, seller);
    const router = new ethers.Contract(UNIVERSAL_ROUTER, ROUTER_ABI, seller);
    const hook = new ethers.Contract(HOOK, HOOK_ABI, seller);
    const poolManager = new ethers.Contract(POOL_MANAGER, POOL_MANAGER_ABI, seller);

    const blockNumber = await ethers.provider.getBlockNumber();
    const sellerNaraBefore = await nara.balanceOf(SELLER) as bigint;
    const sellerUsdcBefore = await usdc.balanceOf(SELLER) as bigint;
    const vaultNaraBefore = await nara.balanceOf(VAULT) as bigint;
    const priceBefore = usdcPerNaraWad(await sqrtPriceX96(poolManager));
    const [marginalFeeBps, hookFee] = await hook.quotePoolFee(false, SELL_AMOUNT) as [bigint, bigint];
    expect(sellerNaraBefore).to.be.greaterThanOrEqual(SELL_AMOUNT);

    await (await nara.approve(PERMIT2, ethers.MaxUint256)).wait();
    await (await permit2.approve(NARA, UNIVERSAL_ROUTER, (1n << 160n) - 1n, (1n << 48n) - 1n)).wait();

    const abi = ethers.AbiCoder.defaultAbiCoder();
    const poolKey = [NARA, USDC, 3_000, 60, HOOK];
    const swapParams = abi.encode(
      ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
      [[poolKey, true, SELL_AMOUNT, 0n, "0x"]],
    );
    const settleParams = abi.encode(["address", "uint256"], [NARA, SELL_AMOUNT]);
    const takeParams = abi.encode(["address", "uint256"], [USDC, 0n]);
    const actions = ethers.hexlify(new Uint8Array([0x06, 0x0c, 0x0f]));
    const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);
    const commands = ethers.hexlify(new Uint8Array([0x10]));
    const latest = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latest!.timestamp + 600);

    const tx = await router.execute(commands, [v4Input], deadline, { gasLimit: 800_000n });
    const receipt = await tx.wait();
    expect(receipt?.status).to.equal(1);

    const sellerNaraAfter = await nara.balanceOf(SELLER) as bigint;
    const sellerUsdcAfter = await usdc.balanceOf(SELLER) as bigint;
    const vaultNaraAfter = await nara.balanceOf(VAULT) as bigint;
    const priceAfter = usdcPerNaraWad(await sqrtPriceX96(poolManager));
    const naraSpent = sellerNaraBefore - sellerNaraAfter;
    const usdcReceived = sellerUsdcAfter - sellerUsdcBefore;
    const vaultFeeReceived = vaultNaraAfter - vaultNaraBefore;
    const executionPrice = usdcReceived * 10n ** 30n / naraSpent;

    expect(naraSpent).to.equal(SELL_AMOUNT);
    expect(vaultFeeReceived).to.equal(hookFee);
    expect(usdcReceived).to.be.greaterThan(0n);
    expect(priceAfter).to.be.lessThan(priceBefore);

    console.log(JSON.stringify({
      mode: "Base fork only; no production transaction",
      snapshotBlock: blockNumber,
      seller: SELLER,
      naraBalanceBefore: ethers.formatUnits(sellerNaraBefore, 18),
      naraSold: ethers.formatUnits(naraSpent, 18),
      hookMarginalTierBps: marginalFeeBps.toString(),
      hookFeeNara: ethers.formatUnits(hookFee, 18),
      hookEffectiveFeePercent: percent(hookFee, SELL_AMOUNT),
      usdcReceived: ethers.formatUnits(usdcReceived, 6),
      spotPriceBeforeUsdc: ethers.formatUnits(priceBefore, 18),
      executionPriceUsdc: ethers.formatUnits(executionPrice, 18),
      spotPriceAfterUsdc: ethers.formatUnits(priceAfter, 18),
      executionPriceImpactPercent: percent(priceBefore - executionPrice, priceBefore),
      terminalSpotMovePercent: percent(priceBefore - priceAfter, priceBefore),
      vaultNaraFeeDelta: ethers.formatUnits(vaultFeeReceived, 18),
      forkGasUsed: receipt!.gasUsed.toString(),
    }, null, 2));
  });
});
