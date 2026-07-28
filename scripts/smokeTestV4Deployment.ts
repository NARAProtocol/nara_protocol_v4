/**
 * Post-deploy smoke test for the configured v4 stack.
 *
 * This verifies:
 * - live preflight wiring
 * - ability to seed liquidity
 * - one small buy through the intended script path
 * - one small sell through the hook pool
 * - Liquidity Growth vault balance changes after each trade
 *
 * Required env:
 *   BASE_RPC_URL or BASE_MAINNET_RPC_URL
 *   LIQ_PRIVATE_KEY
 *
 * Required env:
 *   V4_SMOKE_SEED_NARA (must be 60000)
 *   V4_SMOKE_SEED_USDC (must be 300)
 *
 * Optional env:
 *   V4_SMOKE_BUY_USDC
 *   V4_SMOKE_SELL_NARA
 *   V4_SMOKE_SLIPPAGE_BPS (10-1000, default 500)
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";
import {
  boundedSlippageBps,
  calculateSpotMinimum,
  readSqrtPriceX96,
  requiredExactAmount,
} from "./lib/v4SwapSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

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

function runScript(command: string, args: string[], extraEnv: Record<string, string>) {
  const child = spawnSync("npx", ["tsx", command, ...args], {
    cwd: resolve(__dirname, ".."),
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
  if (child.status !== 0) {
    throw new Error(`Script failed: ${command}`);
  }
}

async function sellNara(
  sellHuman: string,
  slippageBps: bigint,
  wallet: ethers.Wallet,
  config: ReturnType<typeof currentV4Config>,
): Promise<void> {
  const nara = new ethers.Contract(config.token, ERC20_ABI, wallet);
  const p2 = new ethers.Contract(config.permit2, PERMIT2_ABI, wallet);
  const ur = new ethers.Contract(config.universalRouter, UNIVERSAL_ROUTER_ABI, wallet);
  const hook = new ethers.Contract(config.hook, HOOK_ABI, wallet.provider);

  const amountIn = ethers.parseUnits(sellHuman, 18);
  const naraBal = await nara.balanceOf(wallet.address) as bigint;
  if (naraBal < amountIn) {
    throw new Error(`Insufficient NARA for sell smoke test: have ${ethers.formatUnits(naraBal, 18)}, need ${sellHuman}`);
  }

  const p2Allowance = await nara.allowance(wallet.address, config.permit2) as bigint;
  if (p2Allowance < amountIn) {
    await (await nara.approve(config.permit2, ethers.MaxUint256)).wait();
  }

  const [routerAllowance] = await p2.allowance(wallet.address, config.token, config.universalRouter) as [bigint, bigint, bigint];
  if (routerAllowance < amountIn) {
    const maxU160 = (1n << 160n) - 1n;
    const maxU48 = (1n << 48n) - 1n;
    await (await p2.approve(config.token, config.universalRouter, maxU160, maxU48)).wait();
  }

  const naraIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = naraIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];
  const zeroForOne = naraIsCurrency0;
  const sqrtPriceX96 = await readSqrtPriceX96(wallet.provider!, config.poolManager, config.poolId);
  const [, hookFeeAmount] = await hook.quotePoolFee(false, amountIn) as [bigint, bigint];
  if (hookFeeAmount >= amountIn) {
    throw new Error("Hook fee consumes the entire sell input");
  }
  const amountOutMinimum = calculateSpotMinimum({
    amountInAfterHookFee: amountIn - hookFeeAmount,
    sqrtPriceX96,
    inputIsCurrency0: naraIsCurrency0,
    poolFeePips: config.fee,
    slippageBps,
  });
  const usdc = new ethers.Contract(config.base, ERC20_ABI, wallet);
  const usdcBefore = await usdc.balanceOf(wallet.address) as bigint;

  const V4_SWAP = 0x10;
  const SWAP_EXACT_IN_SINGLE = 0x06;
  const SETTLE_ALL = 0x0c;
  const TAKE_ALL = 0x0f;
  const abi = ethers.AbiCoder.defaultAbiCoder();

  const swapParams = abi.encode(
    ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
    [[[currency0, currency1, config.fee, config.tickSpacing, config.hook], zeroForOne, amountIn, amountOutMinimum, "0x"]],
  );
  const settleParams = abi.encode(["address", "uint256"], [config.token, amountIn]);
  const takeParams = abi.encode(["address", "uint256"], [config.base, 0n]);
  const actions = new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]);
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);
  const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

  console.log(`Smoke sell: ${sellHuman} NARA -> USDC`);
  console.log("Minimum USDC out:", ethers.formatUnits(amountOutMinimum, 6), `(${slippageBps} bps limit)`);
  const tx = await ur.execute(commands, [v4Input], deadline, { gasLimit: 600_000n });
  console.log("Sell tx:", tx.hash);
  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error("Sell smoke test reverted");
  }
  const usdcAfter = await usdc.balanceOf(wallet.address) as bigint;
  if (usdcAfter - usdcBefore < amountOutMinimum) {
    throw new Error("Sell output was below the protected minimum");
  }
}

async function main() {
  const config = currentV4Config();
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const wallet = new ethers.Wallet(requiredEnv("LIQ_PRIVATE_KEY"), provider);
  const seedNara = requiredExactAmount("V4_SMOKE_SEED_NARA", "60000");
  const seedUsdc = requiredExactAmount("V4_SMOKE_SEED_USDC", "300");
  const buyUsdc = process.env.V4_SMOKE_BUY_USDC?.trim() || "5";
  const sellNaraAmount = process.env.V4_SMOKE_SELL_NARA?.trim() || "5";
  const slippageBps = boundedSlippageBps(process.env.V4_SMOKE_SLIPPAGE_BPS);
  const baseToken = new ethers.Contract(config.base, ERC20_ABI, provider);
  const naraToken = new ethers.Contract(config.token, ERC20_ABI, provider);

  console.log("v4 smoke test");
  console.log("Wallet:", wallet.address);
  console.log("");

  runScript("scripts/verifyV4Preflight.ts", ["--pre-seed"], {});

  const vaultBaseBefore = await baseToken.balanceOf(config.vault) as bigint;
  const vaultTokenBefore = await naraToken.balanceOf(config.vault) as bigint;

  console.log("Seeding liquidity for smoke test...");
  runScript("scripts/seedV4Liquidity.ts", [], {
    V4_SEED_NARA: seedNara,
    V4_SEED_USDC: seedUsdc,
  });

  const vaultBaseAfterSeed = await baseToken.balanceOf(config.vault) as bigint;
  const vaultTokenAfterSeed = await naraToken.balanceOf(config.vault) as bigint;
  console.log("Vault after seed:", ethers.formatUnits(vaultBaseAfterSeed, 6), "USDC /", ethers.formatUnits(vaultTokenAfterSeed, 18), "NARA");

  const seedEvidencePath = resolve(__dirname, "../deployments/v4-liquidity-seed-latest.json");
  const seedEvidence = JSON.parse(readFileSync(seedEvidencePath, "utf8")) as {
    lpTokenId?: string;
    transactionHash?: string;
  };
  if (!seedEvidence.lpTokenId || !seedEvidence.transactionHash) {
    throw new Error("Seed evidence is missing lpTokenId or transactionHash");
  }
  runScript("scripts/verifyV4Preflight.ts", [], {
    V4_LP_TOKEN_ID: seedEvidence.lpTokenId,
  });

  console.log("Running smoke buy...");
  runScript("scripts/swapUsdcForNara.ts", [], {
    SWAP_USDC_IN: buyUsdc,
    V4_SMOKE_SLIPPAGE_BPS: slippageBps.toString(),
  });

  const vaultBaseAfterBuy = await baseToken.balanceOf(config.vault) as bigint;
  const vaultTokenAfterBuy = await naraToken.balanceOf(config.vault) as bigint;
  console.log("Vault delta after buy:", ethers.formatUnits(vaultBaseAfterBuy - vaultBaseAfterSeed, 6), "USDC /", ethers.formatUnits(vaultTokenAfterBuy - vaultTokenAfterSeed, 18), "NARA");
  if (vaultBaseAfterBuy <= vaultBaseAfterSeed) {
    throw new Error("Buy smoke test did not increase the vault USDC balance");
  }
  if (vaultTokenAfterBuy !== vaultTokenAfterSeed) {
    throw new Error("Buy smoke test unexpectedly changed the vault NARA balance");
  }

  console.log("Running smoke sell...");
  await sellNara(sellNaraAmount, slippageBps, wallet, config);

  const vaultBaseAfterSell = await baseToken.balanceOf(config.vault) as bigint;
  const vaultTokenAfterSell = await naraToken.balanceOf(config.vault) as bigint;
  console.log("Vault delta after sell:", ethers.formatUnits(vaultBaseAfterSell - vaultBaseAfterBuy, 6), "USDC /", ethers.formatUnits(vaultTokenAfterSell - vaultTokenAfterBuy, 18), "NARA");
  if (vaultTokenAfterSell <= vaultTokenAfterBuy) {
    throw new Error("Sell smoke test did not increase the vault NARA balance");
  }
  if (vaultBaseAfterSell !== vaultBaseAfterBuy) {
    throw new Error("Sell smoke test unexpectedly changed the vault USDC balance");
  }

  console.log("");
  console.log("Smoke test complete.");
  console.log("Initial vault:", ethers.formatUnits(vaultBaseBefore, 6), "USDC /", ethers.formatUnits(vaultTokenBefore, 18), "NARA");
  console.log("Final vault:  ", ethers.formatUnits(vaultBaseAfterSell, 6), "USDC /", ethers.formatUnits(vaultTokenAfterSell, 18), "NARA");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
