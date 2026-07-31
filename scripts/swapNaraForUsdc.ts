/**
 * Swap NARA -> USDC on the configured v4 custom-hook pool via Universal Router.
 *
 * Default mode is a non-signing eth_call against current Base state. Production
 * execution requires the explicit --execute flag and a signer whose address
 * exactly matches SWAP_WALLET_ADDRESS.
 *
 * Required env:
 *   BASE_RPC_URL or BASE_MAINNET_RPC_URL
 *   SWAP_WALLET_ADDRESS
 *   SWAP_NARA_IN
 *   SWAP_MIN_USDC_OUT
 *
 * Execute mode only:
 *   LIQ_PRIVATE_KEY
 *   SWAP_EXECUTE=SELL_NARA_FOR_USDC
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

const V4_SWAP = 0x10;
const SWAP_EXACT_IN_SINGLE = 0x06;
const SETTLE_ALL = 0x0c;
const TAKE_ALL = 0x0f;
const EXECUTE_CONFIRMATION = "SELL_NARA_FOR_USDC";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
];
const PERMIT2_ABI = [
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
];
const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
];
const HOOK_ABI = [
  "function quotePoolFee(bool isBuy,uint256 amountIn) view returns (uint16 feeBps,uint256 feeAmount)",
];

function effectivePercent(amount: bigint, total: bigint): string {
  return (Number(amount * 1_000_000n / total) / 10_000).toFixed(2);
}

function assertPositive(name: string, value: bigint): void {
  if (value <= 0n) throw new Error(`${name} must be greater than zero`);
}

async function main() {
  const executeConfirmation = process.env.SWAP_EXECUTE?.trim();
  if (executeConfirmation && executeConfirmation !== EXECUTE_CONFIRMATION) {
    throw new Error(`SWAP_EXECUTE must be exactly ${EXECUTE_CONFIRMATION}`);
  }
  const execute =
    process.argv.includes("--execute") || executeConfirmation === EXECUTE_CONFIRMATION;
  const config = currentV4Config();
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) {
    throw new Error(`Expected Base mainnet chainId 8453, got ${network.chainId}`);
  }

  const expectedWallet = ethers.getAddress(requiredEnv("SWAP_WALLET_ADDRESS"));
  const amountIn = ethers.parseUnits(requiredEnv("SWAP_NARA_IN"), 18);
  const amountOutMinimum = ethers.parseUnits(requiredEnv("SWAP_MIN_USDC_OUT"), 6);
  assertPositive("SWAP_NARA_IN", amountIn);
  assertPositive("SWAP_MIN_USDC_OUT", amountOutMinimum);
  if (amountIn > (1n << 128n) - 1n || amountOutMinimum > (1n << 128n) - 1n) {
    throw new Error("Swap amount exceeds Universal Router uint128 bounds");
  }

  let signer: ethers.Wallet | undefined;
  if (execute) {
    signer = new ethers.Wallet(requiredEnv("LIQ_PRIVATE_KEY"), provider);
    if (signer.address.toLowerCase() !== expectedWallet.toLowerCase()) {
      throw new Error(
        `LIQ_PRIVATE_KEY signer ${signer.address} does not match SWAP_WALLET_ADDRESS ${expectedWallet}`,
      );
    }
  }

  const naraRead = new ethers.Contract(config.token, ERC20_ABI, provider);
  const usdcRead = new ethers.Contract(config.base, ERC20_ABI, provider);
  const permit2Read = new ethers.Contract(config.permit2, PERMIT2_ABI, provider);
  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  const naraBalance = await naraRead.balanceOf(expectedWallet) as bigint;
  const usdcBalance = await usdcRead.balanceOf(expectedWallet) as bigint;
  const erc20Allowance = await naraRead.allowance(expectedWallet, config.permit2) as bigint;
  const [permit2Allowance, permit2Expiration] = await permit2Read.allowance(
    expectedWallet,
    config.token,
    config.universalRouter,
  ) as [bigint, bigint, bigint];
  const [marginalFeeBps, hookFee] = await hook.quotePoolFee(false, amountIn) as [bigint, bigint];

  if (naraBalance < amountIn) {
    throw new Error(
      `Insufficient NARA: wallet has ${ethers.formatUnits(naraBalance, 18)}, needs ${ethers.formatUnits(amountIn, 18)}`,
    );
  }
  if (hookFee >= amountIn) throw new Error("Hook fee consumes the entire input");

  const naraIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = naraIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const poolKey = [currency0, currency1, config.fee, config.tickSpacing, config.hook];
  const swapParams = abi.encode(
    ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
    [[poolKey, naraIsCurrency0, amountIn, amountOutMinimum, "0x"]],
  );
  const settleParams = abi.encode(["address", "uint256"], [config.token, amountIn]);
  const takeParams = abi.encode(["address", "uint256"], [config.base, 0n]);
  const actions = ethers.hexlify(new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]));
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);
  const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("Could not read latest Base block");
  const deadline = BigInt(latest.timestamp + 600);
  const routerInterface = new ethers.Interface(UNIVERSAL_ROUTER_ABI);
  const calldata = routerInterface.encodeFunctionData("execute", [commands, [v4Input], deadline]);

  console.log("NARA v4 swap NARA -> USDC");
  console.log("Mode:                ", execute ? "EXECUTE" : "DRY RUN (no signature, no transaction)");
  console.log("Base block:          ", latest.number);
  console.log("Wallet:              ", expectedWallet);
  console.log("NARA balance:        ", ethers.formatUnits(naraBalance, 18));
  console.log("USDC balance:        ", ethers.formatUnits(usdcBalance, 6));
  console.log("NARA input:          ", ethers.formatUnits(amountIn, 18));
  console.log("Minimum USDC output: ", ethers.formatUnits(amountOutMinimum, 6));
  console.log("Hook fee:            ", ethers.formatUnits(hookFee, 18), `NARA (${effectivePercent(hookFee, amountIn)}% effective)`);
  console.log("Marginal hook tier:  ", `${marginalFeeBps} bps`);

  const nowSeconds = BigInt(latest.timestamp);
  const permit2Ready = permit2Allowance >= amountIn && permit2Expiration > nowSeconds;
  console.log("NARA -> Permit2:     ", erc20Allowance >= amountIn ? "ready" : "approval required");
  console.log("Permit2 -> Router:   ", permit2Ready ? "ready" : "approval required");

  if (!execute) {
    if (erc20Allowance < amountIn || !permit2Ready) {
      console.log("Dry run stopped before router simulation because an approval is required.");
      console.log("Run with --execute to submit required approval(s) and the protected swap.");
      return;
    }
    await provider.call({ from: expectedWallet, to: config.universalRouter, data: calldata });
    console.log("Router simulation:    PASS");
    console.log("No transaction was signed or broadcast.");
    return;
  }

  const nara = new ethers.Contract(config.token, ERC20_ABI, signer);
  const permit2 = new ethers.Contract(config.permit2, PERMIT2_ABI, signer);
  const router = new ethers.Contract(config.universalRouter, UNIVERSAL_ROUTER_ABI, signer);
  if (erc20Allowance < amountIn) {
    console.log("Approving NARA -> Permit2...");
    await (await nara.approve(config.permit2, ethers.MaxUint256)).wait();
  }
  if (!permit2Ready) {
    console.log("Approving Permit2 -> Universal Router...");
    await (await permit2.approve(
      config.token,
      config.universalRouter,
      (1n << 160n) - 1n,
      (1n << 48n) - 1n,
    )).wait();
  }

  await provider.call({ from: expectedWallet, to: config.universalRouter, data: calldata });
  const gasEstimate = await router.execute.estimateGas(commands, [v4Input], deadline);
  const usdcBefore = await usdcRead.balanceOf(expectedWallet) as bigint;
  const tx = await router.execute(commands, [v4Input], deadline, {
    gasLimit: gasEstimate * 120n / 100n,
  });
  console.log("Transaction hash:     ", tx.hash);
  const receipt = await tx.wait();
  if (receipt?.status !== 1) throw new Error("Swap transaction reverted");
  const usdcAfter = await usdcRead.balanceOf(expectedWallet) as bigint;
  const received = usdcAfter - usdcBefore;
  if (received < amountOutMinimum) {
    throw new Error("Post-state output is below the protected minimum");
  }
  console.log("USDC received:        ", ethers.formatUnits(received, 6));
  console.log("Swap successful.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
