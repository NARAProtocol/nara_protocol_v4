/**
 * Buy-ladder probe for the v4 hook's per-block fee reset.
 *
 * The hook accumulates swap flow per block (`flowBlock` / `flowAmountInBlock`)
 * and charges a piecewise cumulative integral, so same-block splitting cannot
 * reduce the aggregate fee. That accumulator resets on every new block, so the
 * open question is what a single wallet pays when it spreads the same notional
 * across consecutive blocks instead of sending one swap.
 *
 * This script measures that directly. It reuses the exact PoolKey and swap
 * encoding from swapUsdcForNara.ts.
 *
 * It is READ-ONLY unless LADDER_EXECUTE=1. Without that flag it prints the
 * projection and exits without broadcasting.
 *
 * Required env:
 *   BASE_RPC_URL
 *   LIQ_PRIVATE_KEY
 *
 * Optional env:
 *   LADDER_BUYS            buys to send        (default 20, max 50)
 *   LADDER_USDC_EACH       USDC per buy        (default 15)
 *   LADDER_MODE            spaced | burst      (default spaced)
 *   LADDER_MAX_TOTAL_USDC  hard spend ceiling  (default 300)
 *   LADDER_EXECUTE         1 to broadcast      (default unset = dry run)
 *   V4_SMOKE_SLIPPAGE_BPS  10-1000             (default 500)
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv, optionalEnv } from "./lib/v4LiveConfig.js";
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
const Q96 = 1n << 96n;
const Q192 = 1n << 192n;

const ABSOLUTE_MAX_BUYS = 50;
const ABSOLUTE_MAX_TOTAL_USDC = ethers.parseUnits("1000", 6);

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
  "function protocolDepth(address currency) view returns (uint256)",
  "function flowBlock(address currency) view returns (uint256)",
  "function flowAmountInBlock(address currency) view returns (uint256)",
  "event PoolFeeTaken(bytes32 indexed poolId, address indexed sender, address indexed currency, uint256 amountIn, uint256 feeAmount, uint16 feeBps, bool isBuy)",
];

function usdcPerNaraWad(sqrtPriceX96: bigint): bigint {
  return (sqrtPriceX96 * sqrtPriceX96 * 10n ** 30n) / Q192;
}

/** Advance sqrtPrice for a USDC-in (currency1-in) exact-input swap on constant L. */
function stepPrice(usdcIn: bigint, sqrtStart: bigint, liquidity: bigint) {
  if (liquidity === 0n) throw new Error("Pool has no active liquidity");
  const sqrtEnd = sqrtStart + (usdcIn * Q96) / liquidity;
  const naraOut = (liquidity * Q96 * (sqrtEnd - sqrtStart)) / (sqrtStart * sqrtEnd);
  return { sqrtEnd, naraOut };
}

async function readActiveLiquidity(
  provider: ethers.Provider,
  poolManagerAddress: string,
  poolId: string,
): Promise<bigint> {
  const pm = new ethers.Contract(
    poolManagerAddress,
    ["function extsload(bytes32 slot) view returns (bytes32)"],
    provider,
  );
  const base = ethers.keccak256(
    ethers.solidityPacked(["bytes32", "bytes32"], [poolId, ethers.zeroPadValue("0x06", 32)]),
  );
  const liquiditySlot = ethers.zeroPadValue(ethers.toBeHex(BigInt(base) + 3n), 32);
  return BigInt(await pm.extsload(liquiditySlot) as string);
}

function parsePositiveInt(name: string, fallback: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${name}: ${raw}`);
  const value = Number(raw);
  if (value < 1 || value > max) throw new Error(`${name} must be between 1 and ${max}`);
  return value;
}

export async function main() {
  const config = currentV4Config();
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const wallet = new ethers.Wallet(requiredEnv("LIQ_PRIVATE_KEY"), provider);
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) {
    throw new Error(`Expected Base mainnet chainId 8453, got ${network.chainId}`);
  }

  const buys = parsePositiveInt("LADDER_BUYS", 20, ABSOLUTE_MAX_BUYS);
  const perBuy = ethers.parseUnits(optionalEnv("LADDER_USDC_EACH", "15"), 6);
  const mode = optionalEnv("LADDER_MODE", "spaced").toLowerCase();
  if (mode !== "spaced" && mode !== "burst") {
    throw new Error(`LADDER_MODE must be "spaced" or "burst", got ${mode}`);
  }
  const slippageBps = boundedSlippageBps(process.env.V4_SMOKE_SLIPPAGE_BPS);
  const totalIn = perBuy * BigInt(buys);
  const maxTotal = ethers.parseUnits(optionalEnv("LADDER_MAX_TOTAL_USDC", "300"), 6);
  const execute = process.env.LADDER_EXECUTE?.trim() === "1";

  if (totalIn > maxTotal) {
    throw new Error(
      `Ladder total ${ethers.formatUnits(totalIn, 6)} USDC exceeds LADDER_MAX_TOTAL_USDC ` +
      `${ethers.formatUnits(maxTotal, 6)}`,
    );
  }
  if (totalIn > ABSOLUTE_MAX_TOTAL_USDC) {
    throw new Error("Ladder total exceeds the hard-coded 1000 USDC ceiling");
  }

  const usdc = new ethers.Contract(config.base, ERC20_ABI, wallet);
  const nara = new ethers.Contract(config.token, ERC20_ABI, wallet);
  const p2 = new ethers.Contract(config.permit2, PERMIT2_ABI, wallet);
  const ur = new ethers.Contract(config.universalRouter, UNIVERSAL_ROUTER_ABI, wallet);
  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);

  const [usdcBal, naraBal, ethBal, liquidity, sqrtStart, depth] = await Promise.all([
    usdc.balanceOf(wallet.address) as Promise<bigint>,
    nara.balanceOf(wallet.address) as Promise<bigint>,
    provider.getBalance(wallet.address),
    readActiveLiquidity(provider, config.poolManager, config.poolId),
    readSqrtPriceX96(provider, config.poolManager, config.poolId),
    hook.protocolDepth(config.base) as Promise<bigint>,
  ]);

  const [perBuyBps, perBuyFee] = await hook.quotePoolFee(true, perBuy) as [bigint, bigint];
  const [oneShotBps, oneShotFee] = await hook.quotePoolFee(true, totalIn) as [bigint, bigint];

  // Project the ladder assuming each buy lands in its own block (fee resets to
  // the base tier every time) against constant full-range liquidity.
  let sqrtProjected = sqrtStart;
  let projectedNara = 0n;
  const projectedMinimums: bigint[] = [];
  for (let i = 0; i < buys; i++) {
    const net = perBuy - perBuyFee;
    projectedMinimums.push(
      calculateSpotMinimum({
        amountInAfterHookFee: net,
        sqrtPriceX96: sqrtProjected,
        inputIsCurrency0: false,
        poolFeePips: config.fee,
        slippageBps,
      }),
    );
    const afterPoolFee = (net * BigInt(1_000_000 - config.fee)) / 1_000_000n;
    const step = stepPrice(afterPoolFee, sqrtProjected, liquidity);
    projectedNara += step.naraOut;
    sqrtProjected = step.sqrtEnd;
  }
  const priceStart = usdcPerNaraWad(sqrtStart);
  const priceProjected = usdcPerNaraWad(sqrtProjected);
  const ladderFee = perBuyFee * BigInt(buys);

  console.log("NARA v4 buy-ladder probe");
  console.log("Wallet:  ", wallet.address);
  console.log("Mode:    ", mode, execute ? "(EXECUTE)" : "(DRY RUN — nothing will be sent)");
  console.log("");
  console.log(JSON.stringify({
    ladder: {
      buys,
      usdcPerBuy: ethers.formatUnits(perBuy, 6),
      usdcTotal: ethers.formatUnits(totalIn, 6),
      slippageBps: slippageBps.toString(),
    },
    funding: {
      usdc: ethers.formatUnits(usdcBal, 6),
      nara: ethers.formatUnits(naraBal, 18),
      eth: ethers.formatEther(ethBal),
    },
    hook: {
      configuredUsdcDepth: ethers.formatUnits(depth, 6),
      perBuyMarginalBps: perBuyBps.toString(),
      perBuyFeeUsdc: ethers.formatUnits(perBuyFee, 6),
      oneShotMarginalBps: oneShotBps.toString(),
      oneShotFeeUsdc: ethers.formatUnits(oneShotFee, 6),
    },
    projection: {
      ladderTotalFeeUsdc: ethers.formatUnits(ladderFee, 6),
      oneShotTotalFeeUsdc: ethers.formatUnits(oneShotFee, 6),
      feeSavedUsdc: ethers.formatUnits(oneShotFee - ladderFee, 6),
      feeSavedPercent:
        oneShotFee === 0n
          ? "n/a"
          : `${(Number(((oneShotFee - ladderFee) * 10000n) / oneShotFee) / 100).toFixed(2)}%`,
      ladderEffectiveFeePercent: `${(Number((ladderFee * 1000000n) / totalIn) / 10000).toFixed(3)}%`,
      oneShotEffectiveFeePercent: `${(Number((oneShotFee * 1000000n) / totalIn) / 10000).toFixed(3)}%`,
      projectedNaraOut: ethers.formatUnits(projectedNara, 18),
      spotPriceBefore: ethers.formatUnits(priceStart, 18),
      projectedPriceAfter: ethers.formatUnits(priceProjected, 18),
      projectedPriceMovePercent:
        `${(Number(((priceProjected - priceStart) * 10000n) / priceStart) / 100).toFixed(1)}%`,
    },
  }, null, 2));

  if (usdcBal < totalIn) {
    throw new Error(`Insufficient USDC: have ${ethers.formatUnits(usdcBal, 6)}, need ${ethers.formatUnits(totalIn, 6)}`);
  }

  if (!execute) {
    console.log("");
    console.log("DRY RUN — set LADDER_EXECUTE=1 to broadcast.");
    return;
  }

  // Approvals must be in place before the ladder so no approval tx interleaves
  // with the buy nonces.
  const p2Allowance = await usdc.allowance(wallet.address, config.permit2) as bigint;
  if (p2Allowance < totalIn) {
    console.log("Approving USDC -> Permit2...");
    await (await usdc.approve(config.permit2, ethers.MaxUint256)).wait();
  }
  const [routerAllowance, routerExpiration] =
    await p2.allowance(wallet.address, config.base, config.universalRouter) as [bigint, bigint, bigint];
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  if (routerAllowance < totalIn || routerExpiration <= nowSeconds) {
    console.log("Setting Permit2 USDC -> Universal Router allowance...");
    await (await p2.approve(config.base, config.universalRouter, (1n << 160n) - 1n, (1n << 48n) - 1n)).wait();
  }

  const naraIsCurrency0 = BigInt(config.token) < BigInt(config.base);
  const [currency0, currency1] = naraIsCurrency0
    ? [config.token, config.base]
    : [config.base, config.token];
  const zeroForOne = !naraIsCurrency0;
  const abi = ethers.AbiCoder.defaultAbiCoder();

  function encodeBuy(amountIn: bigint, amountOutMinimum: bigint) {
    const swapParams = abi.encode(
      ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
      [[[currency0, currency1, config.fee, config.tickSpacing, config.hook], zeroForOne, amountIn, amountOutMinimum, "0x"]],
    );
    const settleParams = abi.encode(["address", "uint256"], [config.base, amountIn]);
    const takeParams = abi.encode(["address", "uint256"], [config.token, 0n]);
    const actions = new Uint8Array([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]);
    return abi.encode(["bytes", "bytes[]"], [actions, [swapParams, settleParams, takeParams]]);
  }

  const commands = ethers.hexlify(new Uint8Array([V4_SWAP]));
  const hookInterface = new ethers.Interface(HOOK_ABI);
  const results: Array<Record<string, string | number>> = [];
  const naraBefore = naraBal;

  console.log("");
  console.log(`Sending ${buys} buys in "${mode}" mode...`);

  if (mode === "spaced") {
    // One buy per block. Re-reads the live price each time so the slippage
    // guard tracks the real ladder instead of a projection.
    for (let i = 0; i < buys; i++) {
      const beforeBlock = await provider.getBlockNumber();
      const sqrtNow = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
      const [, feeNow] = await hook.quotePoolFee(true, perBuy) as [bigint, bigint];
      const minOut = calculateSpotMinimum({
        amountInAfterHookFee: perBuy - feeNow,
        sqrtPriceX96: sqrtNow,
        inputIsCurrency0: false,
        poolFeePips: config.fee,
        slippageBps,
      });
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;
      const tx = await ur.execute(commands, [encodeBuy(perBuy, minOut)], deadline, { gasLimit: 600_000n });
      const receipt = await tx.wait();
      if (receipt?.status !== 1) throw new Error(`Buy ${i + 1} reverted (${tx.hash})`);

      let feePaid = 0n;
      let feeBps = 0n;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== config.hook.toLowerCase()) continue;
        try {
          const parsed = hookInterface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name === "PoolFeeTaken") {
            feePaid = parsed.args.feeAmount as bigint;
            feeBps = BigInt(parsed.args.feeBps);
          }
        } catch { /* not our event */ }
      }
      results.push({
        buy: i + 1,
        block: receipt.blockNumber,
        feeUsdc: ethers.formatUnits(feePaid, 6),
        feeBps: feeBps.toString(),
        tx: tx.hash,
      });
      console.log(
        `  buy ${String(i + 1).padStart(2)}  block ${receipt.blockNumber}  fee ${ethers.formatUnits(feePaid, 6)} USDC  (${feeBps} bps)  ${tx.hash}`,
      );

      // Wait for a fresh block so the next buy hits a reset accumulator.
      if (i < buys - 1) {
        while ((await provider.getBlockNumber()) <= receipt.blockNumber) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }
  } else {
    // Burst: fire every buy back to back on sequential nonces so they contend
    // for the same blocks. Minimums come from the forward projection.
    let nonce = await provider.getTransactionCount(wallet.address, "pending");
    const sent: Array<{ index: number; tx: ethers.TransactionResponse }> = [];
    for (let i = 0; i < buys; i++) {
      const tx = await ur.execute(commands, [encodeBuy(perBuy, projectedMinimums[i])], BigInt(Math.floor(Date.now() / 1000)) + 900n, {
        gasLimit: 600_000n,
        nonce: nonce + i,
      });
      sent.push({ index: i, tx });
      console.log(`  queued buy ${i + 1} nonce ${nonce + i} ${tx.hash}`);
    }
    for (const { index, tx } of sent) {
      const receipt = await tx.wait();
      let feePaid = 0n;
      let feeBps = 0n;
      if (receipt?.status === 1) {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== config.hook.toLowerCase()) continue;
          try {
            const parsed = hookInterface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed?.name === "PoolFeeTaken") {
              feePaid = parsed.args.feeAmount as bigint;
              feeBps = BigInt(parsed.args.feeBps);
            }
          } catch { /* not our event */ }
        }
      }
      results.push({
        buy: index + 1,
        block: receipt?.blockNumber ?? 0,
        feeUsdc: ethers.formatUnits(feePaid, 6),
        feeBps: feeBps.toString(),
        status: receipt?.status ?? 0,
        tx: tx.hash,
      });
    }
  }

  const naraAfter = await nara.balanceOf(wallet.address) as bigint;
  const naraReceived = naraAfter - naraBefore;
  const sqrtEnd = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
  const priceEnd = usdcPerNaraWad(sqrtEnd);
  const totalFeePaid = results.reduce((acc, r) => acc + ethers.parseUnits(String(r.feeUsdc), 6), 0n);
  const blocksUsed = new Set(results.map((r) => r.block));

  console.log("");
  console.log(JSON.stringify({
    measured: {
      buysSent: results.length,
      distinctBlocks: blocksUsed.size,
      totalUsdcIn: ethers.formatUnits(totalIn, 6),
      totalHookFeeUsdc: ethers.formatUnits(totalFeePaid, 6),
      effectiveFeePercent: `${(Number((totalFeePaid * 1000000n) / totalIn) / 10000).toFixed(3)}%`,
      naraReceived: ethers.formatUnits(naraReceived, 18),
      spotPriceBefore: ethers.formatUnits(priceStart, 18),
      spotPriceAfter: ethers.formatUnits(priceEnd, 18),
      priceMovePercent: `${(Number(((priceEnd - priceStart) * 10000n) / priceStart) / 100).toFixed(1)}%`,
    },
    counterfactual: {
      oneShotFeeUsdc: ethers.formatUnits(oneShotFee, 6),
      oneShotEffectiveFeePercent: `${(Number((oneShotFee * 1000000n) / totalIn) / 10000).toFixed(3)}%`,
      feeAvoidedUsdc: ethers.formatUnits(oneShotFee - totalFeePaid, 6),
      feeAvoidedPercent:
        oneShotFee === 0n
          ? "n/a"
          : `${(Number(((oneShotFee - totalFeePaid) * 10000n) / oneShotFee) / 100).toFixed(2)}%`,
    },
    perBuy: results,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
