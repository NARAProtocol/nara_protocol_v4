/**
 * Restricted NARA v4 liquidity-fee compounding maintainer.
 *
 * Default mode is read-only. Execute mode requires a dedicated, whitelisted
 * keeper and refuses to run until the compounder address is permanently frozen.
 */
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";
import { readSqrtPriceX96 } from "./lib/v4SwapSafety.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env"), quiet: true });

const BASE_CHAIN_ID = 8453n;
const Q96 = 1n << 96n;
const DEFAULT_MIN_LIQUIDITY_USDC = "5";
const DEFAULT_GUARD_BPS = 9_900n;

export const VAULT_ABI = [
  "function owner() view returns (address)",
  "function compounder() view returns (address)",
  "function compounderFrozen() view returns (bool)",
  "function routeMode() view returns (uint8)",
  "function compoundKeeper(address) view returns (bool)",
  "function balances() view returns (uint256 tokenBalance,uint256 baseBalance)",
  "function totalTokenCompounded() view returns (uint256)",
  "function totalBaseCompounded() view returns (uint256)",
  "function compoundAll(uint256 minLiquidityAdded,uint64 deadline,bytes data) returns (uint256 liquidityAdded)",
];
export const COMPOUNDER_ABI = [
  "function owner() view returns (address)",
  "function vault() view returns (address)",
  "function nara() view returns (address)",
  "function usdc() view returns (address)",
  "function positionTokenId() view returns (uint256)",
  "function totalLiquidityAdded() view returns (uint256)",
  "function totalNaraAdded() view returns (uint256)",
  "function totalUsdcAdded() view returns (uint256)",
  "function bankedBalances() view returns (uint256 naraBanked,uint256 usdcBanked)",
  "function pendingRecovery() view returns (uint8 kind,address to,uint64 eta)",
];
const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
];

export type LiquidityMaintainerOptions = {
  execute: boolean;
  confirmations: number;
};

export function parseLiquidityMaintainerArgs(args: readonly string[]): LiquidityMaintainerOptions {
  const confirmationIndex = args.indexOf("--confirmations");
  let confirmations = 1;
  if (confirmationIndex !== -1) {
    const raw = args[confirmationIndex + 1];
    if (!raw || raw.startsWith("--")) throw new Error("--confirmations requires a value");
    confirmations = Number(raw);
    if (!Number.isSafeInteger(confirmations) || confirmations < 1 || confirmations > 20) {
      throw new Error("--confirmations must be an integer between 1 and 20");
    }
  }
  return { execute: args.includes("--execute"), confirmations };
}

export function liquidityMinimum(simulatedLiquidity: bigint, guardBps = DEFAULT_GUARD_BPS): bigint {
  if (simulatedLiquidity <= 0n) throw new Error("Simulated liquidity must be positive");
  if (guardBps <= 0n || guardBps > 10_000n) throw new Error("Guard must be within 1..10000 bps");
  const minimum = simulatedLiquidity * guardBps / 10_000n;
  return minimum > 0n ? minimum : 1n;
}

export function baseDepthForLiquidity(
  liquidity: bigint,
  sqrtPriceX96: bigint,
  naraIsCurrency0: boolean,
): bigint {
  if (liquidity < 0n || sqrtPriceX96 <= 0n) throw new Error("Invalid liquidity or price");
  return naraIsCurrency0
    ? liquidity * sqrtPriceX96 / Q96
    : liquidity * Q96 / sqrtPriceX96;
}

export function shouldCompound(
  simulatedLiquidity: bigint,
  simulatedBaseDepth: bigint,
  minimumBaseDepth: bigint,
): boolean {
  return simulatedLiquidity > 0n && simulatedBaseDepth >= minimumBaseDepth;
}

type Snapshot = {
  vaultNara: bigint;
  vaultUsdc: bigint;
  totalNaraCompounded: bigint;
  totalUsdcCompounded: bigint;
  positionTokenId: bigint;
  totalLiquidityAdded: bigint;
  totalNaraAdded: bigint;
  totalUsdcAdded: bigint;
  bankedNara: bigint;
  bankedUsdc: bigint;
};

async function readSnapshot(vault: ethers.Contract, compounder: ethers.Contract): Promise<Snapshot> {
  const [balances, totalNaraCompounded, totalUsdcCompounded, positionTokenId,
    totalLiquidityAdded, totalNaraAdded, totalUsdcAdded, banked] = await Promise.all([
    vault.balances() as Promise<{ tokenBalance: bigint; baseBalance: bigint }>,
    vault.totalTokenCompounded() as Promise<bigint>,
    vault.totalBaseCompounded() as Promise<bigint>,
    compounder.positionTokenId() as Promise<bigint>,
    compounder.totalLiquidityAdded() as Promise<bigint>,
    compounder.totalNaraAdded() as Promise<bigint>,
    compounder.totalUsdcAdded() as Promise<bigint>,
    compounder.bankedBalances() as Promise<{ naraBanked: bigint; usdcBanked: bigint }>,
  ]);
  return {
    vaultNara: balances.tokenBalance,
    vaultUsdc: balances.baseBalance,
    totalNaraCompounded,
    totalUsdcCompounded,
    positionTokenId,
    totalLiquidityAdded,
    totalNaraAdded,
    totalUsdcAdded,
    bankedNara: banked.naraBanked,
    bankedUsdc: banked.usdcBanked,
  };
}

function formatted(snapshot: Snapshot) {
  return {
    vaultNara: ethers.formatUnits(snapshot.vaultNara, 18),
    vaultUsdc: ethers.formatUnits(snapshot.vaultUsdc, 6),
    totalNaraCompounded: ethers.formatUnits(snapshot.totalNaraCompounded, 18),
    totalUsdcCompounded: ethers.formatUnits(snapshot.totalUsdcCompounded, 6),
    positionTokenId: snapshot.positionTokenId.toString(),
    totalLiquidityAdded: snapshot.totalLiquidityAdded.toString(),
    totalNaraAdded: ethers.formatUnits(snapshot.totalNaraAdded, 18),
    totalUsdcAdded: ethers.formatUnits(snapshot.totalUsdcAdded, 6),
    bankedNara: ethers.formatUnits(snapshot.bankedNara, 18),
    bankedUsdc: ethers.formatUnits(snapshot.bankedUsdc, 6),
  };
}

async function postJson(url: string | undefined, payload: Record<string, unknown>): Promise<void> {
  if (!url?.trim()) return;
  const response = await fetch(url.trim(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseLiquidityMaintainerArgs(args);
  const config = currentV4Config();
  const compounderAddress = ethers.getAddress(requiredEnv("V4_COMPOUNDER"));
  const expectedSafe = ethers.getAddress(requiredEnv("V4_SAFE"));
  const configuredKeeperRaw = process.env.V4_COMPOUND_KEEPER_ADDRESS?.trim();
  const configuredKeeper = configuredKeeperRaw ? ethers.getAddress(configuredKeeperRaw) : undefined;
  const minBaseDepth = ethers.parseUnits(
    process.env.V4_COMPOUND_MIN_LIQUIDITY_USDC?.trim() || DEFAULT_MIN_LIQUIDITY_USDC,
    6,
  );
  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, Number(BASE_CHAIN_ID), {
    staticNetwork: true,
    batchMaxCount: 1,
  });

  try {
    const network = await provider.getNetwork();
    if (network.chainId !== BASE_CHAIN_ID) throw new Error(`Expected Base chainId ${BASE_CHAIN_ID}`);
    for (const [label, address] of [
      ["vault", config.vault], ["compounder", compounderAddress], ["position manager", config.positionManager],
    ] as const) {
      if ((await provider.getCode(address)) === "0x") throw new Error(`${label} has no runtime code`);
    }

    const readVault = new ethers.Contract(config.vault, VAULT_ABI, provider);
    const compounder = new ethers.Contract(compounderAddress, COMPOUNDER_ABI, provider);
    const [owner, boundCompounder, frozen, routeMode, compounderOwner, boundVault,
      boundNara, boundUsdc, recovery] = await Promise.all([
      readVault.owner() as Promise<string>,
      readVault.compounder() as Promise<string>,
      readVault.compounderFrozen() as Promise<boolean>,
      readVault.routeMode() as Promise<bigint>,
      compounder.owner() as Promise<string>,
      compounder.vault() as Promise<string>,
      compounder.nara() as Promise<string>,
      compounder.usdc() as Promise<string>,
      compounder.pendingRecovery() as Promise<{ kind: bigint; to: string; eta: bigint }>,
    ]);
    for (const [label, actual, expected] of [
      ["vault owner", owner, expectedSafe],
      ["vault compounder", boundCompounder, compounderAddress],
      ["compounder owner", compounderOwner, expectedSafe],
      ["compounder vault", boundVault, config.vault],
      ["compounder NARA", boundNara, config.token],
      ["compounder USDC", boundUsdc, config.base],
    ] as const) {
      if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
        throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
      }
    }
    if (routeMode !== 0n) throw new Error(`Vault routeMode must be Liquidity (0), got ${routeMode}`);
    if (recovery.kind !== 0n) throw new Error(`Compounder recovery kind ${recovery.kind} is pending`);

    let keeperAllowed = false;
    if (configuredKeeper) {
      keeperAllowed = await readVault.compoundKeeper(configuredKeeper) as boolean;
    }
    const before = await readSnapshot(readVault, compounder);
    const latest = await provider.getBlock("latest");
    if (!latest) throw new Error("Latest Base block is unavailable");
    const deadline = BigInt(latest.timestamp + 900);
    const simulationCaller = configuredKeeper && keeperAllowed ? configuredKeeper : expectedSafe;

    let simulatedLiquidity = 0n;
    let simulatedBaseDepth = 0n;
    if (before.vaultNara > 0n && before.vaultUsdc > 0n) {
      simulatedLiquidity = await readVault.compoundAll.staticCall(1n, deadline, "0x", {
        from: simulationCaller,
      }) as bigint;
      const sqrtPrice = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
      simulatedBaseDepth = baseDepthForLiquidity(
        simulatedLiquidity,
        sqrtPrice,
        BigInt(config.token) < BigInt(config.base),
      );
    }
    const ready = shouldCompound(simulatedLiquidity, simulatedBaseDepth, minBaseDepth);
    console.log(`NARA v4 liquidity maintainer (${options.execute ? "execute" : "read-only"})`);
    console.log(JSON.stringify({
      block: latest.number,
      compounderFrozen: frozen,
      configuredKeeper: configuredKeeper ?? null,
      keeperAllowed,
      minimumLiquidityUsdcDepth: ethers.formatUnits(minBaseDepth, 6),
      simulatedLiquidity: simulatedLiquidity.toString(),
      simulatedLiquidityUsdcDepth: ethers.formatUnits(simulatedBaseDepth, 6),
      ready,
      ...formatted(before),
    }, null, 2));
    if (!options.execute) return;

    if (!frozen) throw new Error("Execution blocked until the Safe validates and freezes the compounder");
    if (!configuredKeeper) throw new Error("V4_COMPOUND_KEEPER_ADDRESS is required in execute mode");
    if (!keeperAllowed) throw new Error("Configured compound keeper is not authorized by the vault");
    if (!ready) {
      console.log("No compound transaction required at the configured threshold.");
      return;
    }

    const operationsKey = process.env.V4_OPERATIONS_KEEPER_PRIVATE_KEY?.trim();
    const signer = new ethers.Wallet(
      operationsKey || requiredEnv("V4_COMPOUND_KEEPER_PRIVATE_KEY"),
      provider,
    );
    if (signer.address.toLowerCase() !== configuredKeeper.toLowerCase()) {
      throw new Error("V4_COMPOUND_KEEPER_PRIVATE_KEY does not match V4_COMPOUND_KEEPER_ADDRESS");
    }
    if (signer.address.toLowerCase() === expectedSafe.toLowerCase()) {
      throw new Error("Compound keeper must be separate from the Safe owner");
    }
    const vault = readVault.connect(signer) as ethers.Contract;
    const minLiquidityAdded = liquidityMinimum(simulatedLiquidity);
    await vault.compoundAll.staticCall(minLiquidityAdded, deadline, "0x");
    const gasEstimate = await vault.compoundAll.estimateGas(minLiquidityAdded, deadline, "0x");
    const tx = await vault.compoundAll(minLiquidityAdded, deadline, "0x", {
      gasLimit: gasEstimate * 120n / 100n,
    });
    console.log(`compoundAll: ${tx.hash}`);
    const receipt = await tx.wait(options.confirmations);
    if (!receipt || receipt.status !== 1) throw new Error("compoundAll transaction failed");

    const after = await readSnapshot(readVault, compounder);
    if (after.totalLiquidityAdded <= before.totalLiquidityAdded || after.positionTokenId === 0n) {
      throw new Error("Compound transaction did not create or increase the POL position");
    }
    const positionManager = new ethers.Contract(config.positionManager, POSITION_MANAGER_ABI, provider);
    const [positionOwner, positionLiquidity] = await Promise.all([
      positionManager.ownerOf(after.positionTokenId) as Promise<string>,
      positionManager.getPositionLiquidity(after.positionTokenId) as Promise<bigint>,
    ]);
    if (ethers.getAddress(positionOwner) !== compounderAddress || positionLiquidity === 0n) {
      throw new Error("Compounder POL custody verification failed");
    }
    console.log("Final liquidity state");
    console.log(JSON.stringify({
      transactionHash: tx.hash,
      positionOwner,
      positionLiquidity: positionLiquidity.toString(),
      ...formatted(after),
    }, null, 2));
    await postJson(process.env.V4_COMPOUND_HEARTBEAT_URL, {
      source: "nara-v4-liquidity-maintainer",
      status: "compounded",
      transactionHash: tx.hash,
      positionTokenId: after.positionTokenId.toString(),
    });
  } catch (error) {
    try {
      await postJson(process.env.V4_COMPOUND_ALERT_WEBHOOK_URL, {
        source: "nara-v4-liquidity-maintainer",
        status: "failed",
        error: error instanceof Error ? error.message : "unknown error",
      });
    } catch (alertError) {
      console.error(`Alert failed: ${alertError instanceof Error ? alertError.message : "unknown error"}`);
    }
    throw error;
  } finally {
    provider.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
