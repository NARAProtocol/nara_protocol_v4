/**
 * Legacy direct-seed helper retained for receipt parsing and recovery utilities.
 *
 * Uses LIQ_PRIVATE_KEY - liquidity wallet holds the approved 60,000 NARA and
 * 300 USDC required for the initial position.
 *
 * Required env (in .env):
 *   LIQ_PRIVATE_KEY
 *   BASE_RPC_URL or BASE_MAINNET_RPC_URL
 *
 * Required launch amounts (no defaults):
 *   V4_NARA_TOKEN          required fresh deployment address
 *   V4_SEED_NARA           must be: 60000  (human NARA, 18 decimals)
 *   V4_SEED_USDC           must be: 300    (human USDC, 6 decimals)
 *
 * Direct execution is disabled. Canonical launch uses:
 *   npm run build:v4:atomic-pool-launch
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  currentV4Config,
  QUARANTINED_STAGE_A_HOOK,
  QUARANTINED_STAGE_A_POOL_ID,
  requiredBaseRpcUrl,
  requiredEnv,
} from "./lib/v4LiveConfig.js";

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
const APPROVED_SEED_NARA = "60000";
const APPROVED_SEED_USDC = "300";
const APPROVED_PRICE_USDC_PER_NARA = "0.005";
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
  "function initializePool((address,address,uint24,int24,address) key, uint160 sqrtPriceX96) external payable returns (int24)",
  "function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable",
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) external view returns (uint128)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const POOL_MANAGER_ABI = [
  "function extsload(bytes32 slot) external view returns (bytes32)",
];

const HOOK_ABI = [
  "function expectedSqrtPriceX96() external view returns (uint160)",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

export function requireApprovedSeedAmounts(seedNara: string, seedUsdc: string): void {
  if (
    ethers.parseUnits(seedNara, 18) !== ethers.parseUnits(APPROVED_SEED_NARA, 18) ||
    ethers.parseUnits(seedUsdc, 6) !== ethers.parseUnits(APPROVED_SEED_USDC, 6)
  ) {
    throw new Error(
      `Refusing unapproved launch ratio. V4_SEED_NARA must be ${APPROVED_SEED_NARA} ` +
      `and V4_SEED_USDC must be ${APPROVED_SEED_USDC} ` +
      `(${APPROVED_PRICE_USDC_PER_NARA} USDC/NARA; approximately $5,000 FDV).`,
    );
  }
}

export function requireNonQuarantinedLiquidityStack(hook: string, poolId: string): void {
  if (
    hook.toLowerCase() === QUARANTINED_STAGE_A_HOOK.toLowerCase() ||
    poolId.toLowerCase() === QUARANTINED_STAGE_A_POOL_ID
  ) {
    throw new Error(
      "Refusing to seed the quarantined Stage A liquidity stack. " +
      "Deploy, verify, and configure the corrected replacement vault/hook/compounder trio first.",
    );
  }
}

export type SeedInitializationPlan = "initialize-and-mint" | "mint-only";

export function seedInitializationPlan(
  currentSqrtPriceX96: bigint,
  expectedSqrtPriceX96: bigint,
): SeedInitializationPlan {
  if (expectedSqrtPriceX96 <= 0n) {
    throw new Error("Hook expectedSqrtPriceX96 is not configured");
  }
  if (currentSqrtPriceX96 === 0n) return "initialize-and-mint";
  if (currentSqrtPriceX96 === expectedSqrtPriceX96) return "mint-only";
  throw new Error(
    `Pool initialization price mismatch: expected sqrtPriceX96=${expectedSqrtPriceX96}, ` +
    `found ${currentSqrtPriceX96}. Refusing to seed.`,
  );
}

export function mintedTokenIdFromReceipt(
  receipt: ethers.TransactionReceipt,
  positionManager: string,
  expectedOwner: string,
): bigint {
  const iface = new ethers.Interface(POSITION_MANAGER_ABI);
  const matches: bigint[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== positionManager.toLowerCase()) continue;
    try {
      const parsed = iface.parseLog(log);
      if (
        parsed?.name === "Transfer" &&
        (parsed.args.from as string) === ethers.ZeroAddress &&
        (parsed.args.to as string).toLowerCase() === expectedOwner.toLowerCase()
      ) {
        matches.push(parsed.args.tokenId as bigint);
      }
    } catch {
      // Ignore unrelated PositionManager events.
    }
  }
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one LP NFT mint in receipt, found ${matches.length}`);
  }
  return matches[0];
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
  throw new Error(
    "Direct pool seeding is disabled. Build and execute the one atomic registration-and-seed Safe batch with " +
    "`npm run build:v4:atomic-pool-launch`.",
  );

  const rpcUrl    = requiredBaseRpcUrl();
  const config    = currentV4Config();
  requireNonQuarantinedLiquidityStack(config.hook, config.poolId);
  const liqKey    = requiredEnv("LIQ_PRIVATE_KEY");
  const naraAddr  = config.token;
  const usdcAddr  = config.base;
  const seedNara  = requiredEnv("V4_SEED_NARA");
  const seedUsdc  = requiredEnv("V4_SEED_USDC");
  requireApprovedSeedAmounts(seedNara, seedUsdc);

  const provider  = new ethers.JsonRpcProvider(rpcUrl);
  const treasury  = new ethers.Wallet(liqKey, provider);
  const network   = await provider.getNetwork();
  if (network.chainId !== 8453n) {
    throw new Error(`Expected Base mainnet chainId 8453, got ${network.chainId}`);
  }

  console.log("NARA v4 — Seed LP");
  console.log("Network:      ", network.chainId.toString());
  console.log("Liquidity wallet:", treasury.address);
  console.log("NARA token:   ", naraAddr);
  console.log("Seed NARA:    ", seedNara);
  console.log("Seed USDC:    ", seedUsdc);
  console.log("Opening ratio:", APPROVED_PRICE_USDC_PER_NARA, "USDC/NARA");
  console.log("");

  const nara  = new ethers.Contract(naraAddr, ERC20_ABI, treasury);
  const usdc  = new ethers.Contract(usdcAddr, ERC20_ABI, treasury);
  const p2    = new ethers.Contract(config.permit2, PERMIT2_ABI, treasury);
  const pm    = new ethers.Contract(config.positionManager, POSITION_MANAGER_ABI, treasury);
  const poolManager = new ethers.Contract(config.poolManager, POOL_MANAGER_ABI, provider);
  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);

  // Sort currencies: lower address = currency0
  const [currency0, currency1] = BigInt(naraAddr) < BigInt(usdcAddr)
    ? [naraAddr, usdcAddr]
    : [usdcAddr, naraAddr];
  const naraIsCurrency0 = currency0.toLowerCase() === naraAddr.toLowerCase();

  const naraAmount = ethers.parseUnits(seedNara, 18);
  const usdcAmount = ethers.parseUnits(seedUsdc, 6);
  const amount0Raw = naraIsCurrency0 ? naraAmount : usdcAmount;
  const amount1Raw = naraIsCurrency0 ? usdcAmount : naraAmount;
  const sqrtPriceX96 = sqrtPriceX96FromAmounts(amount0Raw, amount1Raw);

  console.log("currency0:    ", currency0);
  console.log("currency1:    ", currency1);
  console.log("NARA is c0:   ", naraIsCurrency0);
  console.log("");

  // Fail closed before approvals. The replacement hook permanently binds this
  // exact opening price. A third party may harmlessly initialize at that price;
  // in that case mint only. Any other initialized price is rejected.
  const hookExpectedSqrtPriceX96 = await hook.expectedSqrtPriceX96() as bigint;
  if (hookExpectedSqrtPriceX96 !== sqrtPriceX96) {
    throw new Error(
      `Seed ratio does not match hook expectedSqrtPriceX96: ` +
      `hook=${hookExpectedSqrtPriceX96}, seed=${sqrtPriceX96}.`,
    );
  }

  // PoolManager stores pools at mapping slot 6.
  const poolStateSlot = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [config.poolId, ethers.zeroPadValue("0x06", 32)],
    ),
  );
  const rawSlot0 = await poolManager.extsload(poolStateSlot) as string;
  const currentSqrtPriceX96 = BigInt(rawSlot0) & ((1n << 160n) - 1n);
  const initializationPlan = seedInitializationPlan(currentSqrtPriceX96, sqrtPriceX96);

  // Balance checks
  const naraBal = await nara.balanceOf(treasury.address) as bigint;
  const usdcBal = await usdc.balanceOf(treasury.address) as bigint;
  console.log("Treasury NARA:", ethers.formatUnits(naraBal, 18));
  console.log("Treasury USDC:", ethers.formatUnits(usdcBal, 6));
  console.log("");

  if (naraBal < naraAmount) throw new Error(`Insufficient NARA: have ${ethers.formatUnits(naraBal, 18)}, need ${seedNara}`);
  if (usdcBal < usdcAmount) throw new Error(`Insufficient USDC: have ${ethers.formatUnits(usdcBal, 6)}, need ${seedUsdc}. Send ${seedUsdc} USDC to ${treasury.address} first.`);
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 600n;

  // Permit2: approve both tokens to Permit2 if needed
  for (const [token, name] of [[nara, "NARA"], [usdc, "USDC"]] as const) {
    const tokenAddress = await token.getAddress();
    const needAmount = tokenAddress.toLowerCase() === naraAddr.toLowerCase() ? naraAmount : usdcAmount;
    const p2Allowance = await token.allowance(treasury.address, config.permit2) as bigint;
    if (p2Allowance !== needAmount) {
      console.log(`Approving Permit2 for ${name}…`);
      const tx = await token.approve(config.permit2, needAmount);
      await tx.wait();
      console.log(`${name} → Permit2 approved: ${tx.hash}`);
    } else {
      console.log(`${name} → Permit2 already approved`);
    }

    // Permit2: approve PositionManager
    const [p2Amount, p2Expiration] = await p2.allowance(treasury.address, tokenAddress, config.positionManager) as [bigint, bigint, bigint];
    if (p2Amount !== needAmount || p2Expiration < deadline) {
      console.log(`Setting Permit2 allowance for ${name} → PositionManager…`);
      const tx = await p2.approve(tokenAddress, config.positionManager, needAmount, deadline);
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
  const Q96 = 1n << 96n;
  const liq0 = (amount0Raw * sqrtPriceX96) / Q96;
  const liq1 = (amount1Raw * Q96) / sqrtPriceX96;
  const liquidity = liq0 < liq1 ? liq0 : liq1;

  const amount0Max = amount0Raw;
  const amount1Max = amount1Raw;

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

  console.log(
    initializationPlan === "initialize-and-mint"
      ? "Submitting atomic initializePool + modifyLiquidities..."
      : "Pool already initialized at the immutable expected price; submitting modifyLiquidities only...",
  );
  console.log("  tickLower:", TICK_LOWER, "tickUpper:", TICK_UPPER);
  console.log("  liquidity:", liquidity.toString());
  console.log("  amount0Max:", ethers.formatUnits(amount0Max, naraIsCurrency0 ? 18 : 6));
  console.log("  amount1Max:", ethers.formatUnits(amount1Max, naraIsCurrency0 ? 6 : 18));
  console.log("");

  const poolKey = [currency0, currency1, config.fee, config.tickSpacing, config.hook] as const;
  const initializeCall = pm.interface.encodeFunctionData("initializePool", [poolKey, sqrtPriceX96]);
  const mintCall = pm.interface.encodeFunctionData("modifyLiquidities", [unlockData, deadline]);
  const calls = initializationPlan === "initialize-and-mint"
    ? [initializeCall, mintCall]
    : [mintCall];
  const tx = await pm.multicall(calls, { gasLimit: 2_000_000n });
  console.log("TX hash:", tx.hash);
  const receipt = await tx.wait();
  if (receipt?.status !== 1) throw new Error("Transaction reverted");
  const lpTokenId = mintedTokenIdFromReceipt(receipt, config.positionManager, treasury.address);
  const [lpOwner, positionLiquidity] = await Promise.all([
    pm.ownerOf(lpTokenId) as Promise<string>,
    pm.getPositionLiquidity(lpTokenId) as Promise<bigint>,
  ]);
  if (lpOwner.toLowerCase() !== treasury.address.toLowerCase()) {
    throw new Error(`LP NFT ${lpTokenId} owner mismatch: ${lpOwner}`);
  }
  if (positionLiquidity === 0n) {
    throw new Error(`LP NFT ${lpTokenId} has zero liquidity`);
  }

  // Remove both approval layers after the confirmed seed.
  for (const [token, name] of [[nara, "NARA"], [usdc, "USDC"]] as const) {
    const tokenAddress = await token.getAddress();
    const revokePermit2 = await p2.approve(tokenAddress, config.positionManager, 0n, 0n);
    await revokePermit2.wait();
    const revokeErc20 = await token.approve(config.permit2, 0n);
    await revokeErc20.wait();
    const [remainingP2] = await p2.allowance(treasury.address, tokenAddress, config.positionManager) as [bigint, bigint, bigint];
    const remainingErc20 = await token.allowance(treasury.address, config.permit2) as bigint;
    if (remainingP2 !== 0n || remainingErc20 !== 0n) {
      throw new Error(`${name} approval revocation verification failed`);
    }
    console.log(`${name} seed approvals revoked`);
  }

  console.log("");
  console.log("LP seeded successfully.");
  console.log("LP NFT token ID:", lpTokenId.toString());
  console.log("LP liquidity:   ", positionLiquidity.toString());
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
    expectedSqrtPriceX96: sqrtPriceX96.toString(),
    initializationPlan,
    lpTokenId: lpTokenId.toString(),
    positionLiquidity: positionLiquidity.toString(),
    seedNara,
    seedUsdc,
    transactionHash: tx.hash,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch(err => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}
