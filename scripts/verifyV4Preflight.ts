/**
 * Verify the configured v4 deployment is internally consistent before launch.
 *
 * This script is intended to catch stale addresses, dead LP NFT config,
 * mismatched hook/vault wiring, and pool-fee settings that would surprise operators.
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { currentV4Config, requiredBaseRpcUrl } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });

export function requireExpectedPoolRegistrationState(
  preSeed: boolean,
  poolRegistered: boolean,
  registeredPool: string,
  configuredPool: string,
  expectedSqrtPriceX96: bigint,
): void {
  if (preSeed) {
    if (poolRegistered || registeredPool !== ethers.ZeroHash || expectedSqrtPriceX96 !== 0n) {
      throw new Error("Pre-seed hook must remain unregistered until the atomic Safe launch batch");
    }
    return;
  }
  if (!poolRegistered) throw new Error("Hook pool is not registered");
  if (registeredPool.toLowerCase() !== configuredPool.toLowerCase()) {
    throw new Error(`Registered poolId mismatch. expected=${configuredPool} actual=${registeredPool}`);
  }
  if (expectedSqrtPriceX96 === 0n) throw new Error("Hook opening price is not bound");
}

/**
 * PS-05 opening-price integrity.
 *
 * The opening price is enforced on-chain, not here: `registerPool` is one-shot and
 * rejects a zero price, and `_beforeInitialize` reverts with
 * `InvalidInitializationPrice` unless `sqrtPriceX96 == expectedSqrtPriceX96`. So an
 * initialized pool plus a nonzero bound price *proves* the pool opened at that price.
 *
 * Live price is therefore NOT compared to the bound price. Once the pool trades, the
 * two legitimately diverge; asserting equality would permanently fail every post-seed
 * gate the moment anyone swaps. Drift is reported, never fatal.
 *
 * The one genuine anomaly is an initialized pool with no bound price — that would mean
 * this hook did not gate initialization, so it is fatal.
 */
export function assertPoolOpeningIntegrity(
  poolInitialized: boolean,
  boundSqrtPriceX96: bigint,
  liveSqrtPriceX96: bigint,
): { drifted: boolean } {
  if (!poolInitialized) return { drifted: false };
  if (boundSqrtPriceX96 === 0n) {
    throw new Error(
      "Pool is initialized but the hook has no bound opening price. " +
      "Initialization was not gated by this hook — investigate before trusting this pool.",
    );
  }
  return { drifted: liveSqrtPriceX96 !== boundSqrtPriceX96 };
}

const HOOK_ABI = [
  "function token() view returns (address)",
  "function base() view returns (address)",
  "function vault() view returns (address)",
  "function registeredPoolId() view returns (bytes32)",
  "function poolRegistered() view returns (bool)",
  "function expectedSqrtPriceX96() view returns (uint160)",
  "function protocolDepth(address) view returns (uint256)",
  "function buyCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function sellCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
];

const VAULT_ABI = [
  "function token() view returns (address)",
  "function base() view returns (address)",
  "function hook() view returns (address)",
  "function engine() view returns (address)",
  "function compounder() view returns (address)",
  "function routeMode() view returns (uint8)",
  "function totalBaseFeeRecorded() view returns (uint256)",
  "function totalTokenFeeRecorded() view returns (uint256)",
];

const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128 liquidity)",
];

const POOL_MANAGER_ABI = [
  "function extsload(bytes32 slot) view returns (bytes32)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

function assertEqual(label: string, actual: string, expected: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} mismatch. expected=${expected} actual=${actual}`);
  }
}

function stringifyTuple(value: unknown): string {
  return JSON.stringify(value, (_, current) => typeof current === "bigint" ? current.toString() : current);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) {
    throw new Error(`Expected Base mainnet chainId 8453, got ${network.chainId}`);
  }
  const config = currentV4Config();
  const preSeed = process.argv.includes("--pre-seed");

  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  const vault = new ethers.Contract(config.vault, VAULT_ABI, provider);
  const pm = new ethers.Contract(config.positionManager, POSITION_MANAGER_ABI, provider);
  const poolManager = new ethers.Contract(config.poolManager, POOL_MANAGER_ABI, provider);
  const baseToken = new ethers.Contract(config.base, ERC20_ABI, provider);
  const naraToken = new ethers.Contract(config.token, ERC20_ABI, provider);

  console.log("v4 preflight");
  console.log("Hook:             ", config.hook);
  console.log("Vault:            ", config.vault);
  console.log("Token/Base:       ", `${config.token} / ${config.base}`);
  console.log("LP token id:      ", config.lpTokenId.toString());
  console.log("Mode:             ", preSeed ? "pre-seed wiring" : "post-seed launch");
  console.log("");

  const [
    hookToken,
    hookBase,
    hookVault,
    registeredPool,
    poolRegistered,
    expectedSqrtPriceX96,
    baseDepth,
    tokenDepth,
    buyCurve,
    sellCurve,
    vaultToken,
    vaultBase,
    vaultHook,
    engine,
    compounder,
    routeMode,
    totalBaseFee,
    totalTokenFee,
    vaultBaseBalance,
    vaultTokenBalance,
  ] = await Promise.all([
    hook.token() as Promise<string>,
    hook.base() as Promise<string>,
    hook.vault() as Promise<string>,
    hook.registeredPoolId() as Promise<string>,
    hook.poolRegistered() as Promise<boolean>,
    hook.expectedSqrtPriceX96() as Promise<bigint>,
    hook.protocolDepth(config.base) as Promise<bigint>,
    hook.protocolDepth(config.token) as Promise<bigint>,
    hook.buyCurve(),
    hook.sellCurve(),
    vault.token() as Promise<string>,
    vault.base() as Promise<string>,
    vault.hook() as Promise<string>,
    vault.engine() as Promise<string>,
    vault.compounder() as Promise<string>,
    vault.routeMode() as Promise<number>,
    vault.totalBaseFeeRecorded() as Promise<bigint>,
    vault.totalTokenFeeRecorded() as Promise<bigint>,
    baseToken.balanceOf(config.vault) as Promise<bigint>,
    naraToken.balanceOf(config.vault) as Promise<bigint>,
  ]);

  assertEqual("hook token", hookToken, config.token);
  assertEqual("hook base", hookBase, config.base);
  assertEqual("hook vault", hookVault, config.vault);
  assertEqual("vault token", vaultToken, config.token);
  assertEqual("vault base", vaultBase, config.base);
  assertEqual("vault hook", vaultHook, config.hook);

  requireExpectedPoolRegistrationState(
    preSeed,
    poolRegistered,
    registeredPool,
    config.poolId,
    expectedSqrtPriceX96,
  );

  // Uniswap v4 PoolManager stores pools at mapping slot 6. A zero sqrt price
  // means the key is registered in our hook but not initialized in PoolManager.
  const poolStateSlot = ethers.keccak256(
    ethers.solidityPacked(
      ["bytes32", "bytes32"],
      [config.poolId, ethers.zeroPadValue("0x06", 32)],
    ),
  );
  const rawSlot0 = await poolManager.extsload(poolStateSlot) as string;
  const sqrtPriceX96 = BigInt(rawSlot0) & ((1n << 160n) - 1n);
  const poolInitialized = sqrtPriceX96 !== 0n;
  const { drifted: priceDrifted } = assertPoolOpeningIntegrity(
    poolInitialized,
    expectedSqrtPriceX96,
    sqrtPriceX96,
  );

  let lpOwner = "burned-or-missing";
  let lpLiquidity = 0n;
  try {
    lpOwner = await pm.ownerOf(config.lpTokenId) as string;
    lpLiquidity = await pm.getPositionLiquidity(config.lpTokenId) as bigint;
  } catch {
    // allow burned or never-minted positions to surface in output instead of aborting preflight
  }

  console.log("Checks");
  console.log("pool registered:   ", poolRegistered);
  console.log("pool initialized:  ", poolInitialized);
  console.log("registered poolId: ", registeredPool);
  console.log("bound sqrtPriceX96:", expectedSqrtPriceX96.toString());
  console.log(
    "live sqrtPriceX96: ",
    sqrtPriceX96.toString(),
    priceDrifted ? "(moved from opening price — pool has traded)" : "(still at opening price)",
  );
  console.log("vault engine:      ", engine);
  console.log("vault compounder:  ", compounder);
  console.log("vault routeMode:   ", routeMode.toString());
  console.log("lp owner:          ", lpOwner);
  console.log("lp liquidity:      ", lpLiquidity.toString());
  console.log("");

  console.log("Depth");
  console.log("base depth:        ", baseDepth.toString());
  console.log("token depth:       ", tokenDepth.toString());
  console.log("");

  console.log("Vault balances");
  console.log("base balance:      ", ethers.formatUnits(vaultBaseBalance, 6));
  console.log("token balance:     ", ethers.formatUnits(vaultTokenBalance, 18));
  console.log("base pool fee recorded: ", ethers.formatUnits(totalBaseFee, 6));
  console.log("token pool fee recorded:", ethers.formatUnits(totalTokenFee, 18));
  console.log("");

  console.log("Curves");
  console.log("buy curve:         ", stringifyTuple(buyCurve));
  console.log("sell curve:        ", stringifyTuple(sellCurve));
  console.log("");

  const findings: string[] = [];
  const notices: string[] = [];
  if (!preSeed && compounder === ethers.ZeroAddress && BigInt(routeMode) === 0n) {
    findings.push("pool fees are parked in Liquidity mode with no compounder");
  } else if (compounder === ethers.ZeroAddress && BigInt(routeMode) === 0n) {
    notices.push("compounder is intentionally unset before liquidity activation");
  }
  if (!preSeed && lpLiquidity === 0n) {
    findings.push("configured LP NFT currently has zero liquidity");
  } else if (lpLiquidity === 0n) {
    notices.push("LP NFT is intentionally absent before liquidity seed");
  }
  if (baseDepth > 0n || tokenDepth > 0n) {
    notices.push("configured protocolDepth fee basis is populated");
  }
  if (preSeed && poolInitialized) {
    findings.push("PoolManager pool must remain uninitialized before the atomic Safe launch batch");
  } else if (preSeed) {
    notices.push("hook and PoolManager pool are intentionally unregistered and uninitialized before atomic launch");
  }
  if (!preSeed && !poolInitialized) {
    findings.push("PoolManager pool is not initialized");
  }
  if (engine.toLowerCase() !== config.engine.toLowerCase()) {
    findings.push(`vault engine does not match configured target engine (${config.engine})`);
  }

  if (notices.length > 0) {
    console.log("Expected state / notices");
    for (const notice of notices) {
      console.log(`- ${notice}`);
    }
    console.log("");
  }

  if (findings.length > 0) {
    console.log("Launch blockers");
    for (const finding of findings) {
      console.log(`- ${finding}`);
    }
    throw new Error("v4 preflight failed");
  } else {
    console.log(preSeed ? "Pre-seed wiring gate passed." : "Post-seed launch preflight passed.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}
