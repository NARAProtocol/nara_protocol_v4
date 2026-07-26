/**
 * Seed initial NARA/USDC liquidity into the v4 pool.
 *
 * Uses LIQ_PRIVATE_KEY - liquidity wallet holds both the 30 NARA LP seed and the
 * 300 USDC required for the initial position.
 *
 * Required env (in .env):
 *   LIQ_PRIVATE_KEY
 *   BASE_RPC_URL or BASE_MAINNET_RPC_URL
 *
 * Optional env:
 *   V4_NARA_TOKEN          required fresh deployment address
 *   V4_SEED_NARA           default: 30     (human NARA, 18 decimals)
 *   V4_SEED_USDC           default: 300    (human USDC, 6 decimals)
 *   V4_SEED_SLIPPAGE_BPS   default: 200    (2% max slippage on each token)
 *
 * Usage:
 *   npx tsx scripts/seedV4Liquidity.ts
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { currentV4Config, optionalEnv, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env") });

// ── Constants ─────────────────────────────────────────────────────────────────

// Full range ticks, rounded to nearest tickSpacing=60
// ceil(-887272 / 60) * 60 = -887220
// floor(887272 / 60) * 60 = 887220
const TICK_LOWER = -887220;
const TICK_UPPER =  887220;

// v4-periphery v1.0.3 action codes (contracts/v4/node_modules/.../Actions.sol)
const MINT_POSITION = 0x02;
const SETTLE_PAIR   = 0x0d;

// ── ABIs ──────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const PERMIT2_ABI = [
  "function approve(address token, address spender, uint160 amount, uint48 expiration) external",
  "function allowance(address owner, address token, address spender) external view returns (uint160 amount, uint48 expiration, uint48 nonce)",
];

const POSITION_MANAGER_ABI = [
  "function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable",
  "function nextTokenId() external view returns (uint256)",
];

const POOL_MANAGER_ABI = [
  "function extsload(bytes32 slot) external view returns (bytes32)",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function applySlippage(amount: bigint, slippageBps: bigint): bigint {
  return amount + (amount * slippageBps) / 10000n;
}

// Compute sqrtPriceX96 from raw token amounts (same formula as deploy script)
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  return x;
}

function sqrtPriceX96FromAmounts(amount0: bigint, amount1: bigint): bigint {
  return isqrt((amount1 * (1n << 192n)) / amount0);
}

// Encode the pool key as the Solidity struct tuple
function encodePoolKey(
  currency0: string,
  currency1: string,
  fee: number,
  tickSpacing: number,
  hooks: string,
): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,uint24,int24,address)"],
    [[currency0, currency1, fee, tickSpacing, hooks]],
  );
}

function writeSeedLog(payload: Record<string, unknown>) {
  const dir = resolve(repoRoot, "deployments");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const body = JSON.stringify(
    payload,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  const file = join(dir, `v4-liquidity-seed-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, body);
  writeFileSync(join(dir, "v4-liquidity-seed-latest.json"), body);
  console.log("Liquidity seed log written:", file);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const rpcUrl    = requiredBaseRpcUrl();
  const liqKey    = requiredEnv("LIQ_PRIVATE_KEY");
  const config    = currentV4Config();
  const naraAddr  = config.token;
  const usdcAddr  = config.base;
  const seedNara  = optionalEnv("V4_SEED_NARA", "30");
  const seedUsdc  = optionalEnv("V4_SEED_USDC", "300");
  const slipBps   = BigInt(optionalEnv("V4_SEED_SLIPPAGE_BPS", "200"));

  const provider  = new ethers.JsonRpcProvider(rpcUrl);
  const treasury  = new ethers.Wallet(liqKey, provider);
  const network   = await provider.getNetwork();

  console.log("NARA v4 — Seed LP");
  console.log("Network:      ", network.chainId.toString());
  console.log("Liquidity wallet:", treasury.address);
  console.log("NARA token:   ", naraAddr);
  console.log("Seed NARA:    ", seedNara);
  console.log("Seed USDC:    ", seedUsdc);
  console.log("Slippage:     ", slipBps.toString(), "bps");
  console.log("");

  const nara  = new ethers.Contract(naraAddr, ERC20_ABI, treasury);
  const usdc  = new ethers.Contract(usdcAddr, ERC20_ABI, treasury);
  const p2    = new ethers.Contract(config.permit2, PERMIT2_ABI, treasury);
  const pm    = new ethers.Contract(config.positionManager, POSITION_MANAGER_ABI, treasury);

  // Sort currencies: lower address = currency0
  const [currency0, currency1] = BigInt(naraAddr) < BigInt(usdcAddr)
    ? [naraAddr, usdcAddr]
    : [usdcAddr, naraAddr];
  const naraIsCurrency0 = currency0.toLowerCase() === naraAddr.toLowerCase();

  const naraAmount = ethers.parseUnits(seedNara, 18);
  const usdcAmount = ethers.parseUnits(seedUsdc, 6);
  const amount0Raw = naraIsCurrency0 ? naraAmount : usdcAmount;
  const amount1Raw = naraIsCurrency0 ? usdcAmount : naraAmount;

  console.log("currency0:    ", currency0);
  console.log("currency1:    ", currency1);
  console.log("NARA is c0:   ", naraIsCurrency0);
  console.log("");

  // Balance checks
  const naraBal = await nara.balanceOf(treasury.address) as bigint;
  const usdcBal = await usdc.balanceOf(treasury.address) as bigint;
  console.log("Treasury NARA:", ethers.formatUnits(naraBal, 18));
  console.log("Treasury USDC:", ethers.formatUnits(usdcBal, 6));
  console.log("");

  if (naraBal < naraAmount) throw new Error(`Insufficient NARA: have ${ethers.formatUnits(naraBal, 18)}, need ${seedNara}`);
  if (usdcBal < usdcAmount) throw new Error(`Insufficient USDC: have ${ethers.formatUnits(usdcBal, 6)}, need ${seedUsdc}. Send ${seedUsdc} USDC to ${treasury.address} first.`);

  // Permit2: approve both tokens to Permit2 if needed
  for (const [token, name] of [[nara, "NARA"], [usdc, "USDC"]] as const) {
    const tokenAddress = await token.getAddress();
    const p2Allowance = await token.allowance(treasury.address, config.permit2) as bigint;
    if (p2Allowance < ethers.MaxUint256 / 2n) {
      console.log(`Approving Permit2 for ${name}…`);
      const tx = await token.approve(config.permit2, ethers.MaxUint256);
      await tx.wait();
      console.log(`${name} → Permit2 approved: ${tx.hash}`);
    } else {
      console.log(`${name} → Permit2 already approved`);
    }

    // Permit2: approve PositionManager
    const [p2Amount] = await p2.allowance(treasury.address, tokenAddress, config.positionManager) as [bigint, bigint, bigint];
    const needAmount = tokenAddress.toLowerCase() === naraAddr.toLowerCase() ? naraAmount : usdcAmount;
    if (p2Amount < needAmount) {
      console.log(`Setting Permit2 allowance for ${name} → PositionManager…`);
      const maxUint160 = (1n << 160n) - 1n;
      const maxUint48  = (1n << 48n) - 1n;
      const tx = await p2.approve(tokenAddress, config.positionManager, maxUint160, maxUint48);
      await tx.wait();
      console.log(`${name} Permit2 allowance set: ${tx.hash}`);
    } else {
      console.log(`${name} → Permit2 PositionManager allowance OK`);
    }
  }
  console.log("");

  // Build modifyLiquidities call
  const abi = ethers.AbiCoder.defaultAbiCoder();

  // Compute sqrtPriceX96 and liquidity for full-range position
  // Full range: sqrtPriceLower ≈ 0, sqrtPriceUpper ≈ ∞
  // L ≈ min(amount0 * sqrtPriceX96 / Q96, amount1 * Q96 / sqrtPriceX96)
  const sqrtPriceX96 = sqrtPriceX96FromAmounts(amount0Raw, amount1Raw);
  const Q96 = 1n << 96n;
  const liq0 = (amount0Raw * sqrtPriceX96) / Q96;
  const liq1 = (amount1Raw * Q96) / sqrtPriceX96;
  const liquidity = liq0 < liq1 ? liq0 : liq1;

  const amount0Max = applySlippage(amount0Raw, slipBps);
  const amount1Max = applySlippage(amount1Raw, slipBps);

  // MINT_POSITION (0x02): explicit liquidity
  // params: (PoolKey, int24 tickLower, int24 tickUpper, uint256 liquidity, uint128 amount0Max, uint128 amount1Max, address owner, bytes hookData)
  const mintParams = abi.encode(
    ["tuple(address,address,uint24,int24,address)", "int24", "int24", "uint256", "uint128", "uint128", "address", "bytes"],
    [[currency0, currency1, config.fee, config.tickSpacing, config.hook], TICK_LOWER, TICK_UPPER, liquidity, amount0Max, amount1Max, treasury.address, "0x"],
  );

  // SETTLE_PAIR: pay both currencies from Permit2 allowance
  const settleParams = abi.encode(
    ["address", "address"],
    [currency0, currency1],
  );

  const actions = ethers.concat([
    new Uint8Array([MINT_POSITION]),
    new Uint8Array([SETTLE_PAIR]),
  ]);

  const unlockData = abi.encode(
    ["bytes", "bytes[]"],
    [actions, [mintParams, settleParams]],
  );

  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

  // Preview next token ID
  const nextId = await pm.nextTokenId() as bigint;
  console.log("Expected LP NFT token ID:", nextId.toString());
  console.log("Submitting modifyLiquidities…");
  console.log("  tickLower:", TICK_LOWER, "tickUpper:", TICK_UPPER);
  console.log("  liquidity:", liquidity.toString());
  console.log("  amount0Max:", ethers.formatUnits(amount0Max, naraIsCurrency0 ? 18 : 6));
  console.log("  amount1Max:", ethers.formatUnits(amount1Max, naraIsCurrency0 ? 6 : 18));
  console.log("");

  const tx = await pm.modifyLiquidities(unlockData, deadline, { gasLimit: 2_000_000n });
  console.log("TX hash:", tx.hash);
  const receipt = await tx.wait();
  if (receipt?.status !== 1) throw new Error("Transaction reverted");

  console.log("");
  console.log("LP seeded successfully.");
  console.log("LP NFT token ID:", nextId.toString());
  console.log("Owner:          ", treasury.address);
  console.log("Pool:            NARA/USDC v4 with hook", config.hook);

  writeSeedLog({
    generatedAt: new Date().toISOString(),
    chainId: network.chainId.toString(),
    owner: treasury.address,
    token: naraAddr,
    base: usdcAddr,
    hook: config.hook,
    vault: config.vault,
    engine: config.engine,
    poolId: config.poolId,
    lpTokenId: nextId.toString(),
    seedNara,
    seedUsdc,
    transactionHash: tx.hash,
  });
}

main().catch(err => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
