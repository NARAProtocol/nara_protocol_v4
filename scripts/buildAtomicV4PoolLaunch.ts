/**
 * Builds, but never submits, the one Safe batch that registers, initializes,
 * and seeds the canonical NARA/USDC v4 pool without a public intermediate state.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  currentV4Config,
  requiredBaseRpcUrl,
  requiredEnv,
} from "./lib/v4LiveConfig.js";
import { buildAtomicV4PoolLaunch } from "./lib/v4AtomicPoolLaunch.js";
import {
  requireApprovedSeedAmounts,
  requireNonQuarantinedLiquidityStack,
} from "./seedV4Liquidity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env") });

const HOOK_ABI = [
  "function owner() view returns (address)",
  "function poolRegistered() view returns (bool)",
  "function expectedSqrtPriceX96() view returns (uint160)",
  "function protocolDepth(address currency) view returns (uint256)",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const POOL_MANAGER_ABI = ["function extsload(bytes32 slot) view returns (bytes32)"];

async function requireCode(provider: ethers.Provider, label: string, address: string): Promise<void> {
  if ((await provider.getCode(address)) === "0x") throw new Error(`${label} has no code: ${address}`);
}

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) throw new Error(`Expected Base mainnet chainId 8453, got ${network.chainId}`);

  const config = currentV4Config();
  requireNonQuarantinedLiquidityStack(config.hook, config.poolId);
  const safe = ethers.getAddress(requiredEnv("V4_ADMIN_ADDRESS"));
  const lpOwner = ethers.getAddress(requiredEnv("V4_LP_OWNER_ADDRESS"));
  const seedNara = requiredEnv("V4_SEED_NARA");
  const seedUsdc = requiredEnv("V4_SEED_USDC");
  requireApprovedSeedAmounts(seedNara, seedUsdc);
  const deadline = BigInt(requiredEnv("V4_ATOMIC_LAUNCH_DEADLINE"));
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (deadline <= now || deadline > now + 7n * 24n * 60n * 60n) {
    throw new Error("V4_ATOMIC_LAUNCH_DEADLINE must be in the future and no more than seven days away");
  }

  for (const [label, address] of [
    ["Safe", safe],
    ["NARA", config.token],
    ["USDC", config.base],
    ["Permit2", config.permit2],
    ["PoolManager", config.poolManager],
    ["PositionManager", config.positionManager],
    ["Hook", config.hook],
  ] as const) {
    await requireCode(provider, label, address);
  }

  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  if (ethers.getAddress(await hook.owner()) !== safe) throw new Error("Hook owner is not V4_ADMIN_ADDRESS");
  if (await hook.poolRegistered()) throw new Error("Pool is already registered; no atomic launch window remains");
  if ((await hook.expectedSqrtPriceX96()) !== 0n) throw new Error("Unregistered hook has a nonzero expected price");

  const naraAmount = ethers.parseUnits(seedNara, 18);
  const usdcAmount = ethers.parseUnits(seedUsdc, 6);
  const plan = buildAtomicV4PoolLaunch({
    nara: config.token,
    usdc: config.base,
    permit2: config.permit2,
    positionManager: config.positionManager,
    hook: config.hook,
    lpOwner,
    fee: config.fee,
    tickSpacing: config.tickSpacing,
    naraAmount,
    usdcAmount,
    deadline,
  });
  if (plan.poolId.toLowerCase() !== config.poolId) {
    throw new Error(`Configured pool ID mismatch: expected ${plan.poolId}, found ${config.poolId}`);
  }
  const [naraDepth, usdcDepth] = await Promise.all([
    hook.protocolDepth(config.token) as Promise<bigint>,
    hook.protocolDepth(config.base) as Promise<bigint>,
  ]);
  if (naraDepth !== naraAmount || usdcDepth !== usdcAmount) {
    throw new Error(
      `Hook depth mismatch: NARA=${naraDepth}/${naraAmount} USDC=${usdcDepth}/${usdcAmount}`,
    );
  }

  const poolStateSlot = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [config.poolId, ethers.zeroPadValue("0x06", 32)],
    ),
  );
  const poolManager = new ethers.Contract(config.poolManager, POOL_MANAGER_ABI, provider);
  const rawSlot0 = await poolManager.extsload(poolStateSlot) as string;
  if ((BigInt(rawSlot0) & ((1n << 160n) - 1n)) !== 0n) throw new Error("PoolManager pool is already initialized");

  const nara = new ethers.Contract(config.token, ERC20_ABI, provider);
  const usdc = new ethers.Contract(config.base, ERC20_ABI, provider);
  if ((await nara.balanceOf(safe)) < naraAmount) throw new Error("Safe has insufficient NARA for the exact seed");
  if ((await usdc.balanceOf(safe)) < usdcAmount) throw new Error("Safe has insufficient USDC for the exact seed");

  const output = {
    version: "1.0",
    chainId: "8453",
    createdAt: Date.now(),
    meta: {
      name: "NARA v4 atomic pool registration and seed",
      description: "One Safe batch. Do not split or reorder.",
      txBuilderVersion: "1.18.0",
      createdFromSafeAddress: safe,
      createdFromOwnerAddress: "",
    },
    transactions: plan.transactions.map(({ to, value, data }) => ({
      to,
      value,
      data,
      contractMethod: null,
      contractInputsValues: null,
    })),
    naraEvidence: {
      safe,
      lpOwner,
      hook: config.hook,
      poolId: plan.poolId,
      expectedSqrtPriceX96: plan.expectedSqrtPriceX96.toString(),
      liquidity: plan.liquidity.toString(),
      naraAmount: naraAmount.toString(),
      usdcAmount: usdcAmount.toString(),
      deadline: deadline.toString(),
      invariant: "registerPool is immediately followed by initializePool + first mint in one atomic Safe batch",
    },
  };

  const outputDir = resolve(repoRoot, "deployments");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, "v4-atomic-pool-launch-batch.json");
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Atomic launch batch written: ${outputPath}`);
  console.log("Review every call in Safe Transaction Builder. Execute only as one batch.");
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
