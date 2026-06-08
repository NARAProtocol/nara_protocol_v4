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
 * Optional env:
 *   V4_SMOKE_SEED_NARA
 *   V4_SMOKE_SEED_USDC
 *   V4_SMOKE_BUY_USDC
 *   V4_SMOKE_SELL_NARA
 */

import { spawnSync } from "node:child_process";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

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

function runScript(command: string, extraEnv: Record<string, string>) {
  const child = spawnSync("npx", ["tsx", command], {
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
  wallet: ethers.Wallet,
  config: ReturnType<typeof currentV4Config>,
): Promise<void> {
  const nara = new ethers.Contract(config.token, ERC20_ABI, wallet);
  const p2 = new ethers.Contract(config.permit2, PERMIT2_ABI, wallet);
  const ur = new ethers.Contract(config.universalRouter, UNIVERSAL_ROUTER_ABI, wallet);

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

  const V4_SWAP = 0x10;
  const SWAP_EXACT_IN_SINGLE = 0x06;
  const SETTLE_ALL = 0x0c;
  const TAKE_ALL = 0x0f;
  const abi = ethers.AbiCoder.defaultAbiCoder();

  const swapParams = abi.encode(
    ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
    [[[currency0, currency1, config.fee, config.tickSpacing, config.hook], zeroForOne, amountIn, 0n, "0x"]],
  );
  const settleParams = abi.encode(["address", "uint256"], [config.token, amountIn]);
  const takeParams = abi.encode(["address", "uint256"], [config.base, 0n]);
  const actions = new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]);
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);
  const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

  console.log(`Smoke sell: ${sellHuman} NARA -> USDC`);
  const tx = await ur.execute(commands, [v4Input], deadline, { gasLimit: 600_000n });
  console.log("Sell tx:", tx.hash);
  const receipt = await tx.wait();
  if (receipt?.status !== 1) {
    throw new Error("Sell smoke test reverted");
  }
}

async function main() {
  const config = currentV4Config();
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const wallet = new ethers.Wallet(requiredEnv("LIQ_PRIVATE_KEY"), provider);
  const seedNara = process.env.V4_SMOKE_SEED_NARA?.trim() || "30";
  const seedUsdc = process.env.V4_SMOKE_SEED_USDC?.trim() || "300";
  const buyUsdc = process.env.V4_SMOKE_BUY_USDC?.trim() || "5";
  const sellNaraAmount = process.env.V4_SMOKE_SELL_NARA?.trim() || "5";
  const baseToken = new ethers.Contract(config.base, ERC20_ABI, provider);
  const naraToken = new ethers.Contract(config.token, ERC20_ABI, provider);

  console.log("v4 smoke test");
  console.log("Wallet:", wallet.address);
  console.log("");

  runScript("scripts/verifyV4Preflight.ts", {});

  const vaultBaseBefore = await baseToken.balanceOf(config.vault) as bigint;
  const vaultTokenBefore = await naraToken.balanceOf(config.vault) as bigint;

  console.log("Seeding liquidity for smoke test...");
  runScript("scripts/seedV4Liquidity.ts", {
    V4_SEED_NARA: seedNara,
    V4_SEED_USDC: seedUsdc,
  });

  const vaultBaseAfterSeed = await baseToken.balanceOf(config.vault) as bigint;
  const vaultTokenAfterSeed = await naraToken.balanceOf(config.vault) as bigint;
  console.log("Vault after seed:", ethers.formatUnits(vaultBaseAfterSeed, 6), "USDC /", ethers.formatUnits(vaultTokenAfterSeed, 18), "NARA");

  console.log("Running smoke buy...");
  runScript("scripts/swapUsdcForNara.ts", {
    SWAP_USDC_IN: buyUsdc,
  });

  const vaultBaseAfterBuy = await baseToken.balanceOf(config.vault) as bigint;
  const vaultTokenAfterBuy = await naraToken.balanceOf(config.vault) as bigint;
  console.log("Vault delta after buy:", ethers.formatUnits(vaultBaseAfterBuy - vaultBaseAfterSeed, 6), "USDC /", ethers.formatUnits(vaultTokenAfterBuy - vaultTokenAfterSeed, 18), "NARA");

  console.log("Running smoke sell...");
  await sellNara(sellNaraAmount, wallet, config);

  const vaultBaseAfterSell = await baseToken.balanceOf(config.vault) as bigint;
  const vaultTokenAfterSell = await naraToken.balanceOf(config.vault) as bigint;
  console.log("Vault delta after sell:", ethers.formatUnits(vaultBaseAfterSell - vaultBaseAfterBuy, 6), "USDC /", ethers.formatUnits(vaultTokenAfterSell - vaultTokenAfterBuy, 18), "NARA");

  console.log("");
  console.log("Smoke test complete.");
  console.log("Initial vault:", ethers.formatUnits(vaultBaseBefore, 6), "USDC /", ethers.formatUnits(vaultTokenBefore, 18), "NARA");
  console.log("Final vault:  ", ethers.formatUnits(vaultBaseAfterSell, 6), "USDC /", ethers.formatUnits(vaultTokenAfterSell, 18), "NARA");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
