/**
 * Swap USDC -> NARA on the configured v4 custom-hook pool via Universal Router.
 *
 * Uniswap UI cannot reliably route this pool, so this script encodes the exact
 * PoolKey and swap path directly.
 *
 * Required env:
 *   BASE_RPC_URL
 *   LIQ_PRIVATE_KEY
 *
 * Required env:
 *   SWAP_USDC_IN
 *
 * Optional env:
 *   V4_SMOKE_SLIPPAGE_BPS (10-1000, default 500)
 *   V4_NARA_TOKEN
 *   V4_BASE_TOKEN
 *   V4_HOOK
 *   V4_POOL_FEE
 *   V4_TICK_SPACING
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";
import {
  boundedSlippageBps,
  calculateSpotMinimum,
  readSqrtPriceX96,
} from "./lib/v4SwapSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external",
  "function allowance(address owner, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)",
];

const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable",
];

const HOOK_ABI = [
  "function quotePoolFee(bool isBuy, uint256 amountIn) view returns (uint16 feeBps, uint256 feeAmount)",
];

export async function main() {
  const config = currentV4Config();
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const wallet = new ethers.Wallet(requiredEnv("LIQ_PRIVATE_KEY"), provider);
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) {
    throw new Error(`Expected Base mainnet chainId 8453, got ${network.chainId}`);
  }
  const amountInHuman = requiredEnv("SWAP_USDC_IN");
  const slippageBps = boundedSlippageBps(process.env.V4_SMOKE_SLIPPAGE_BPS);

  console.log("NARA v4 swap USDC -> NARA");
  console.log("Network: ", network.chainId.toString());
  console.log("Wallet:  ", wallet.address);
  console.log("");

  const usdc = new ethers.Contract(config.base, ERC20_ABI, wallet);
  const nara = new ethers.Contract(config.token, ERC20_ABI, wallet);
  const p2 = new ethers.Contract(config.permit2, PERMIT2_ABI, wallet);
  const ur = new ethers.Contract(config.universalRouter, UNIVERSAL_ROUTER_ABI, wallet);
  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);

  const usdcBal = await usdc.balanceOf(wallet.address) as bigint;
  const naraBal = await nara.balanceOf(wallet.address) as bigint;
  console.log("USDC balance:", ethers.formatUnits(usdcBal, 6));
  console.log("NARA balance:", ethers.formatUnits(naraBal, 18));
  console.log("");

  const amountIn = ethers.parseUnits(amountInHuman, 6);
  if (usdcBal < amountIn) {
    throw new Error(`Insufficient USDC: have ${ethers.formatUnits(usdcBal, 6)}, need ${amountInHuman}`);
  }

  const p2Allowance = await usdc.allowance(wallet.address, config.permit2) as bigint;
  if (p2Allowance < amountIn) {
    console.log("Approving USDC -> Permit2...");
    await (await usdc.approve(config.permit2, ethers.MaxUint256)).wait();
  } else {
    console.log("USDC -> Permit2 already approved");
  }

  const [routerAllowance] = await p2.allowance(wallet.address, config.base, config.universalRouter) as [bigint, bigint, bigint];
  if (routerAllowance < amountIn) {
    console.log("Setting Permit2 USDC -> Universal Router allowance...");
    const maxU160 = (1n << 160n) - 1n;
    const maxU48 = (1n << 48n) - 1n;
    await (await p2.approve(config.base, config.universalRouter, maxU160, maxU48)).wait();
  } else {
    console.log("USDC -> Universal Router Permit2 allowance OK");
  }
  console.log("");

  const naraIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = naraIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];
  const zeroForOne = !naraIsCurrency0;
  const sqrtPriceX96 = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
  const [, hookFeeAmount] = await hook.quotePoolFee(true, amountIn) as [bigint, bigint];
  if (hookFeeAmount >= amountIn) {
    throw new Error("Hook fee consumes the entire swap input");
  }
  const amountOutMinimum = calculateSpotMinimum({
    amountInAfterHookFee: amountIn - hookFeeAmount,
    sqrtPriceX96,
    inputIsCurrency0: !naraIsCurrency0,
    poolFeePips: config.fee,
    slippageBps,
  });

  const abi = ethers.AbiCoder.defaultAbiCoder();
  const swapParams = abi.encode(
    ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
    [[[currency0, currency1, config.fee, config.tickSpacing, config.hook], zeroForOne, amountIn, amountOutMinimum, "0x"]],
  );
  const settleParams = abi.encode(["address", "uint256"], [config.base, amountIn]);
  const takeParams = abi.encode(["address", "uint256"], [config.token, 0n]);
  const actions = new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]);
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);

  const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

  console.log(`Swapping ${ethers.formatUnits(amountIn, 6)} USDC -> NARA...`);
  console.log("Minimum NARA out:", ethers.formatUnits(amountOutMinimum, 18), `(${slippageBps} bps limit)`);
  const tx = await ur.execute(commands, [v4Input], deadline, { gasLimit: 600_000n });
  console.log("TX hash:", tx.hash);

  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error("Transaction reverted");
  }

  const naraAfter = await nara.balanceOf(wallet.address) as bigint;
  const naraReceived = naraAfter - naraBal;
  if (naraReceived < amountOutMinimum) {
    throw new Error(
      `Received ${naraReceived} NARA units, below protected minimum ${amountOutMinimum}`,
    );
  }
  console.log("");
  console.log("Swap successful.");
  console.log("NARA received:", ethers.formatUnits(naraReceived, 18));
  console.log("NARA balance: ", ethers.formatUnits(naraAfter, 18));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
