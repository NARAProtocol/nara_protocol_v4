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

const HOOK_ABI = [
  "function token() view returns (address)",
  "function base() view returns (address)",
  "function vault() view returns (address)",
  "function registeredPoolId() view returns (bytes32)",
  "function poolRegistered() view returns (bool)",
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
  const config = currentV4Config();

  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  const vault = new ethers.Contract(config.vault, VAULT_ABI, provider);
  const pm = new ethers.Contract(config.positionManager, POSITION_MANAGER_ABI, provider);
  const baseToken = new ethers.Contract(config.base, ERC20_ABI, provider);
  const naraToken = new ethers.Contract(config.token, ERC20_ABI, provider);

  console.log("v4 preflight");
  console.log("Hook:             ", config.hook);
  console.log("Vault:            ", config.vault);
  console.log("Token/Base:       ", `${config.token} / ${config.base}`);
  console.log("LP token id:      ", config.lpTokenId.toString());
  console.log("");

  const [
    hookToken,
    hookBase,
    hookVault,
    registeredPool,
    poolRegistered,
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

  if (!poolRegistered) {
    throw new Error("Hook pool is not registered");
  }
  if (registeredPool.toLowerCase() !== config.poolId) {
    throw new Error(`Registered poolId mismatch. expected=${config.poolId} actual=${registeredPool}`);
  }

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
  console.log("registered poolId: ", registeredPool);
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
  if (compounder === ethers.ZeroAddress && routeMode === 0) {
    findings.push("pool fees are parked in Liquidity mode with no compounder");
  }
  if (lpLiquidity === 0n) {
    findings.push("configured LP NFT currently has zero liquidity");
  }
  if (baseDepth > 0n || tokenDepth > 0n) {
    findings.push("manual protocolDepth fallback is populated; verify live-depth hook logic before launch");
  }
  if (engine.toLowerCase() !== config.engine.toLowerCase()) {
    findings.push(`vault engine does not match configured target engine (${config.engine})`);
  }

  if (findings.length > 0) {
    console.log("Launch blockers");
    for (const finding of findings) {
      console.log(`- ${finding}`);
    }
    throw new Error("v4 preflight failed");
  } else {
    console.log("No preflight warnings.");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
