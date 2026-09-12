import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import { canonicalProductionV4Deployment, currentV4Config } from "../lib/v4LiveConfig.js";
import { boundedSlippageBps, calculateSpotMinimum, readSqrtPriceX96 } from "../lib/v4SwapSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const FLEET_FILE = path.join(__dirname, ".fleet-wallets.json");

// Universal Router Command Constants
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

// Configuration parameters
const MIN_USDC_TRADE = Number(process.env.FLEET_MIN_USDC_TRADE || "2");
const MAX_USDC_TRADE = Number(process.env.FLEET_MAX_USDC_TRADE || "15");
const BUY_PROBABILITY = Number(process.env.FLEET_BUY_PROBABILITY || "0.65"); // 65% buys, 35% sells
const MIN_DELAY_SECONDS = Number(process.env.FLEET_MIN_DELAY_SECONDS || "15");
const MAX_DELAY_SECONDS = Number(process.env.FLEET_MAX_DELAY_SECONDS || "60");
const SLIPPAGE_BPS = boundedSlippageBps(process.env.FLEET_SLIPPAGE_BPS || "500");

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

export async function main() {
  if (!fs.existsSync(FLEET_FILE)) {
    throw new Error(`Fleet keystore ${FLEET_FILE} not found. Run '01_generate_fleet.ts' first.`);
  }

  const prod = canonicalProductionV4Deployment();
  const config = currentV4Config();
  const rpcUrl = process.env.BASE_RPC_URL || process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true });

  const fleetData = JSON.parse(fs.readFileSync(FLEET_FILE, "utf8"));
  const fleetWallets = fleetData.wallets as Array<{ index: number; address: string; privateKey: string }>;
  const fleetAddressSet = new Set(fleetWallets.map((w) => w.address.toLowerCase()));

  console.log("================================================================================");
  console.log(`?? NARA v4 ISOLATED SWARM TRADER (FLEET SIZE: ${fleetWallets.length})`);
  console.log("================================================================================");
  console.log(`Trade Size:        $${MIN_USDC_TRADE} – $${MAX_USDC_TRADE} USDC`);
  console.log(`Buy Probability:   ${BUY_PROBABILITY * 100}% buys`);
  console.log(`Pacing Interval:   ${MIN_DELAY_SECONDS}s – ${MAX_DELAY_SECONDS}s between swaps`);
  console.log(`Slippage Limit:    ${SLIPPAGE_BPS} BPS`);
  console.log(`Anti-Sybil Rule:   STRICT ISOLATION ENFORCED (Zero Cross-Wallet Transfers)`);
  console.log("================================================================================\n");

  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  const naraIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = naraIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];

  let cycleNumber = 0;

  while (true) {
    cycleNumber++;
    const randomIdx = randomInt(0, fleetWallets.length - 1);
    const selected = fleetWallets[randomIdx];
    const wallet = new ethers.Wallet(selected.privateKey, provider);

    // Strict security check: destination can only ever be self
    if (fleetAddressSet.has(selected.address.toLowerCase()) === false) {
      throw new Error("CRITICAL: Selected address outside verified fleet");
    }

    try {
      const ethBal = await provider.getBalance(wallet.address);
      if (ethBal < ethers.parseEther("0.0001")) {
        console.log(`[Cycle #${cycleNumber}] Wallet #${selected.index} (${selected.address.slice(0, 6)}...${selected.address.slice(-4)}) has low gas (${ethers.formatEther(ethBal)} ETH). Skipping.`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      const usdc = new ethers.Contract(config.base, ERC20_ABI, wallet);
      const nara = new ethers.Contract(config.token, ERC20_ABI, wallet);
      const p2 = new ethers.Contract(config.permit2, PERMIT2_ABI, wallet);
      const ur = new ethers.Contract(config.universalRouter, UNIVERSAL_ROUTER_ABI, wallet);

      const usdcBal = await usdc.balanceOf(wallet.address) as bigint;
      const naraBal = await nara.balanceOf(wallet.address) as bigint;

      const isBuy = Math.random() < BUY_PROBABILITY || naraBal === 0n;

      if (isBuy) {
        // USDC -> NARA Buy
        const tradeAmountUsdc = Math.min(
          Number(ethers.formatUnits(usdcBal, 6)),
          randomBetween(MIN_USDC_TRADE, MAX_USDC_TRADE),
        );

        if (tradeAmountUsdc < MIN_USDC_TRADE) {
          console.log(`[Cycle #${cycleNumber}] Wallet #${selected.index} has insufficient USDC ($${tradeAmountUsdc.toFixed(2)}). Skipping.`);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        const amountIn = ethers.parseUnits(tradeAmountUsdc.toFixed(6), 6);

        // Ensure Permit2 Approvals
        const p2Allowance = await usdc.allowance(wallet.address, config.permit2) as bigint;
        if (p2Allowance < amountIn) {
          console.log(`[Cycle #${cycleNumber}] Approving USDC -> Permit2 for Wallet #${selected.index}...`);
          await (await usdc.approve(config.permit2, ethers.MaxUint256)).wait();
        }

        const [routerAllowance, routerExpiration] = await p2.allowance(wallet.address, config.base, config.universalRouter) as [bigint, bigint, bigint];
        const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
        if (routerAllowance < amountIn || routerExpiration <= nowSeconds) {
          console.log(`[Cycle #${cycleNumber}] Setting Permit2 Router Allowance for Wallet #${selected.index}...`);
          const maxU160 = (1n << 160n) - 1n;
          const maxU48 = (1n << 48n) - 1n;
          await (await p2.approve(config.base, config.universalRouter, maxU160, maxU48)).wait();
        }

        const sqrtPriceX96 = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
        const [, hookFeeAmount] = await hook.quotePoolFee(true, amountIn) as [bigint, bigint];
        const amountOutMinimum = calculateSpotMinimum({
          amountInAfterHookFee: amountIn - hookFeeAmount,
          sqrtPriceX96,
          inputIsCurrency0: !naraIsCurrency0,
          poolFeePips: config.fee,
          slippageBps: SLIPPAGE_BPS,
        });

        const abi = ethers.AbiCoder.defaultAbiCoder();
        const swapParams = abi.encode(
          ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
          [[[currency0, currency1, config.fee, config.tickSpacing, config.hook], !naraIsCurrency0, amountIn, amountOutMinimum, "0x"]],
        );
        const settleParams = abi.encode(["address", "uint256"], [config.base, amountIn]);
        const takeParams = abi.encode(["address", "uint256"], [config.token, 0n]);
        const actions = new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]);
        const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);
        const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
        const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

        console.log(`[Cycle #${cycleNumber}] ?? BUY: Wallet #${selected.index} swapping $${tradeAmountUsdc.toFixed(2)} USDC -> NARA...`);
        const tx = await ur.execute(commands, [v4Input], deadline, { gasLimit: 600_000n });
        console.log(`  ?? Tx submitted: https://basescan.org/tx/${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt.status === 1) {
          console.log(`  ? Confirmed in block #${receipt.blockNumber}!`);
        }
      } else {
        // NARA -> USDC Sell (Random 20% to 50% of holding)
        const sellFraction = randomBetween(0.2, 0.5);
        const amountIn = (naraBal * BigInt(Math.floor(sellFraction * 1000))) / 1000n;
        if (amountIn === 0n) continue;

        // Ensure Permit2 Approvals
        const p2Allowance = await nara.allowance(wallet.address, config.permit2) as bigint;
        if (p2Allowance < amountIn) {
          console.log(`[Cycle #${cycleNumber}] Approving NARA -> Permit2 for Wallet #${selected.index}...`);
          await (await nara.approve(config.permit2, ethers.MaxUint256)).wait();
        }

        const [routerAllowance, routerExpiration] = await p2.allowance(wallet.address, config.token, config.universalRouter) as [bigint, bigint, bigint];
        const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
        if (routerAllowance < amountIn || routerExpiration <= nowSeconds) {
          console.log(`[Cycle #${cycleNumber}] Setting Permit2 Router NARA Allowance for Wallet #${selected.index}...`);
          const maxU160 = (1n << 160n) - 1n;
          const maxU48 = (1n << 48n) - 1n;
          await (await p2.approve(config.token, config.universalRouter, maxU160, maxU48)).wait();
        }

        const sqrtPriceX96 = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
        const [, hookFeeAmount] = await hook.quotePoolFee(false, amountIn) as [bigint, bigint];
        const amountOutMinimum = calculateSpotMinimum({
          amountInAfterHookFee: amountIn - hookFeeAmount,
          sqrtPriceX96,
          inputIsCurrency0: naraIsCurrency0,
          poolFeePips: config.fee,
          slippageBps: SLIPPAGE_BPS,
        });

        const poolKey = [currency0, currency1, config.fee, config.tickSpacing, config.hook];
        const abi = ethers.AbiCoder.defaultAbiCoder();
        const swapParams = abi.encode(
          ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
          [[poolKey, naraIsCurrency0, amountIn, amountOutMinimum, "0x"]],
        );
        const settleParams = abi.encode(["address", "uint256"], [config.token, amountIn]);
        const takeParams = abi.encode(["address", "uint256"], [config.base, 0n]);
        const actions = new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]);
        const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);
        const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
        const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

        console.log(`[Cycle #${cycleNumber}] ?? SELL: Wallet #${selected.index} swapping ${ethers.formatUnits(amountIn, 18).slice(0, 8)} NARA -> USDC...`);
        const tx = await ur.execute(commands, [v4Input], deadline, { gasLimit: 600_000n });
        console.log(`  ?? Tx submitted: https://basescan.org/tx/${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt.status === 1) {
          console.log(`  ? Confirmed in block #${receipt.blockNumber}!`);
        }
      }
    } catch (err: any) {
      console.error(`[Cycle #${cycleNumber}] Error during execution:`, err.message);
    }

    const sleepSec = randomInt(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS);
    console.log(`Sleeping ${sleepSec}s until next cycle...\n`);
    await new Promise((r) => setTimeout(r, sleepSec * 1000));
  }
}

main().catch(console.error);
