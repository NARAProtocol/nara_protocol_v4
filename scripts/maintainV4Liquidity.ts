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
const DEFAULT_SQRT_PRICE_GUARD_BPS = 100n;
const DEFAULT_VALUE_IMBALANCE_BPS = 100n;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;

const COMPOUND_POLICY_ENV_KEYS = [
  "V4_COMPOUND_REFERENCE_SQRT_PRICE_X96",
  "V4_COMPOUND_MAX_NARA_USED_RAW",
  "V4_COMPOUND_MAX_USDC_USED_RAW",
] as const;

export type CompoundExecutionPolicy = {
  referenceSqrtPriceX96: bigint;
  maxNaraUsed: bigint;
  maxUsdcUsed: bigint;
  sqrtGuardBps: bigint;
  maxValueImbalanceBps: bigint;
};

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
  "function poolManager() view returns (address)",
  "function positionManager() view returns (address)",
  "function permit2() view returns (address)",
  "function hooks() view returns (address)",
  "function poolFee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function poolId() view returns (bytes32)",
  "function peripheryBindingsValid() view returns (bool)",
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
  "function poolManager() view returns (address)",
  "function permit2() view returns (address)",
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

export function hasCompoundableInventory(
  vaultNara: bigint,
  vaultUsdc: bigint,
  bankedNara: bigint,
  bankedUsdc: bigint,
): boolean {
  // Banked inventory can supply either side of the next liquidity add, but
  // Vault.compoundAll() still reverts with ZeroValue when the Vault itself has
  // no newly collected fees to transfer. Require both a fresh trigger and a
  // combined two-sided balance before attempting the simulation.
  return (vaultNara > 0n || vaultUsdc > 0n)
    && vaultNara + bankedNara > 0n
    && vaultUsdc + bankedUsdc > 0n;
}

function positiveBigInt(label: string, raw: string | undefined, maximum: bigint): bigint {
  if (!raw?.trim()) throw new Error(`${label} is required`);
  let value: bigint;
  try {
    value = BigInt(raw.trim());
  } catch {
    throw new Error(`${label} must be an unsigned integer`);
  }
  if (value <= 0n || value > maximum) {
    throw new Error(`${label} must be within 1..${maximum}`);
  }
  return value;
}

function boundedBps(label: string, raw: string | undefined, fallback: bigint, maximum: bigint): bigint {
  const value = raw?.trim() ? positiveBigInt(label, raw, maximum) : fallback;
  if (value > maximum) throw new Error(`${label} must be within 1..${maximum} bps`);
  return value;
}

function nonNegativeBps(label: string, raw: string | undefined, fallback: bigint, maximum: bigint): bigint {
  if (!raw?.trim()) return fallback;
  let value: bigint;
  try {
    value = BigInt(raw.trim());
  } catch {
    throw new Error(`${label} must be an unsigned integer`);
  }
  if (value < 0n || value > maximum) {
    throw new Error(`${label} must be within 0..${maximum} bps`);
  }
  return value;
}

/**
 * Reads an explicit, independently selected compound policy. An entirely absent
 * policy is allowed only so read-only maintenance can report "blocked" without
 * inventing a reference from the manipulable pool spot.
 */
export function compoundExecutionPolicyFromEnv(
  values: Readonly<Record<string, string | undefined>>,
): CompoundExecutionPolicy | undefined {
  const supplied = COMPOUND_POLICY_ENV_KEYS.filter((key) => Boolean(values[key]?.trim()));
  if (supplied.length === 0) return undefined;
  if (supplied.length !== COMPOUND_POLICY_ENV_KEYS.length) {
    const missing = COMPOUND_POLICY_ENV_KEYS.filter((key) => !values[key]?.trim());
    throw new Error(`Incomplete compound execution policy; missing ${missing.join(", ")}`);
  }

  return {
    referenceSqrtPriceX96: positiveBigInt(
      "V4_COMPOUND_REFERENCE_SQRT_PRICE_X96",
      values.V4_COMPOUND_REFERENCE_SQRT_PRICE_X96,
      UINT160_MAX,
    ),
    maxNaraUsed: positiveBigInt(
      "V4_COMPOUND_MAX_NARA_USED_RAW",
      values.V4_COMPOUND_MAX_NARA_USED_RAW,
      UINT256_MAX,
    ),
    maxUsdcUsed: positiveBigInt(
      "V4_COMPOUND_MAX_USDC_USED_RAW",
      values.V4_COMPOUND_MAX_USDC_USED_RAW,
      UINT256_MAX,
    ),
    sqrtGuardBps: boundedBps(
      "V4_COMPOUND_SQRT_PRICE_GUARD_BPS",
      values.V4_COMPOUND_SQRT_PRICE_GUARD_BPS,
      DEFAULT_SQRT_PRICE_GUARD_BPS,
      250n,
    ),
    maxValueImbalanceBps: nonNegativeBps(
      "V4_COMPOUND_MAX_VALUE_IMBALANCE_BPS",
      values.V4_COMPOUND_MAX_VALUE_IMBALANCE_BPS,
      DEFAULT_VALUE_IMBALANCE_BPS,
      500n,
    ),
  };
}

export function requireCompoundExecutionPolicy(
  values: Readonly<Record<string, string | undefined>>,
): CompoundExecutionPolicy {
  const policy = compoundExecutionPolicyFromEnv(values);
  if (!policy) {
    throw new Error(
      "Independent compound policy is required: set V4_COMPOUND_REFERENCE_SQRT_PRICE_X96, "
      + "V4_COMPOUND_MAX_NARA_USED_RAW, and V4_COMPOUND_MAX_USDC_USED_RAW",
    );
  }
  return policy;
}

export function compoundSqrtPriceBounds(referenceSqrtPriceX96: bigint, sqrtGuardBps: bigint) {
  if (referenceSqrtPriceX96 <= 0n || referenceSqrtPriceX96 > UINT160_MAX) {
    throw new Error("Reference sqrt price must be a positive uint160");
  }
  if (sqrtGuardBps <= 0n || sqrtGuardBps > 250n) {
    throw new Error("Sqrt-price guard must be within 1..250 bps");
  }
  return {
    minSqrtPriceX96: referenceSqrtPriceX96 * (10_000n - sqrtGuardBps) / 10_000n,
    maxSqrtPriceX96: (referenceSqrtPriceX96 * (10_000n + sqrtGuardBps) + 9_999n) / 10_000n,
  };
}

export function assertCurrentSqrtPriceWithinPolicy(
  currentSqrtPriceX96: bigint,
  policy: CompoundExecutionPolicy,
): void {
  const { minSqrtPriceX96, maxSqrtPriceX96 } = compoundSqrtPriceBounds(
    policy.referenceSqrtPriceX96,
    policy.sqrtGuardBps,
  );
  if (currentSqrtPriceX96 < minSqrtPriceX96 || currentSqrtPriceX96 > maxSqrtPriceX96) {
    throw new Error(
      `Current sqrtPriceX96 ${currentSqrtPriceX96} is outside the independent reference band `
      + `[${minSqrtPriceX96}, ${maxSqrtPriceX96}]`,
    );
  }
}

export function compoundConstraintsData(
  referenceSqrtPriceX96: bigint,
  maxNaraUsed: bigint,
  maxUsdcUsed: bigint,
  sqrtGuardBps = DEFAULT_SQRT_PRICE_GUARD_BPS,
  maxValueImbalanceBps = DEFAULT_VALUE_IMBALANCE_BPS,
): string {
  if (referenceSqrtPriceX96 <= 0n || maxNaraUsed <= 0n || maxUsdcUsed <= 0n) {
    throw new Error("Compound constraints require positive price and amount caps");
  }
  const { minSqrtPriceX96, maxSqrtPriceX96 } = compoundSqrtPriceBounds(referenceSqrtPriceX96, sqrtGuardBps);
  if (maxValueImbalanceBps < 0n || maxValueImbalanceBps > 500n) {
    throw new Error("Reference-value imbalance guard must be within 0..500 bps");
  }
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(uint160 referenceSqrtPriceX96,uint160 minSqrtPriceX96,uint160 maxSqrtPriceX96,uint16 maxReferenceValueImbalanceBps,uint256 maxNaraUsed,uint256 maxUsdcUsed)"],
    [[referenceSqrtPriceX96, minSqrtPriceX96, maxSqrtPriceX96, maxValueImbalanceBps, maxNaraUsed, maxUsdcUsed]],
  );
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
      boundNara, boundUsdc, boundPoolManager, boundPositionManager, boundPermit2,
      boundHook, boundPoolFee, boundTickSpacing, boundPoolId, bindingsValid, recovery] = await Promise.all([
      readVault.owner() as Promise<string>,
      readVault.compounder() as Promise<string>,
      readVault.compounderFrozen() as Promise<boolean>,
      readVault.routeMode() as Promise<bigint>,
      compounder.owner() as Promise<string>,
      compounder.vault() as Promise<string>,
      compounder.nara() as Promise<string>,
      compounder.usdc() as Promise<string>,
      compounder.poolManager() as Promise<string>,
      compounder.positionManager() as Promise<string>,
      compounder.permit2() as Promise<string>,
      compounder.hooks() as Promise<string>,
      compounder.poolFee() as Promise<bigint>,
      compounder.tickSpacing() as Promise<bigint>,
      compounder.poolId() as Promise<string>,
      compounder.peripheryBindingsValid() as Promise<boolean>,
      compounder.pendingRecovery() as Promise<{ kind: bigint; to: string; eta: bigint }>,
    ]);
    for (const [label, actual, expected] of [
      ["vault owner", owner, expectedSafe],
      ["vault compounder", boundCompounder, compounderAddress],
      ["compounder owner", compounderOwner, expectedSafe],
      ["compounder vault", boundVault, config.vault],
      ["compounder NARA", boundNara, config.token],
      ["compounder USDC", boundUsdc, config.base],
      ["compounder PoolManager", boundPoolManager, config.poolManager],
      ["compounder PositionManager", boundPositionManager, config.positionManager],
      ["compounder Permit2", boundPermit2, config.permit2],
      ["compounder Hook", boundHook, config.hook],
    ] as const) {
      if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
        throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
      }
    }
    if (!bindingsValid) throw new Error("Compounder reciprocal periphery binding check failed");
    if (boundPoolFee !== BigInt(config.fee) || boundTickSpacing !== BigInt(config.tickSpacing)) {
      throw new Error("Compounder pool fee or tick spacing mismatch");
    }
    if (boundPoolId.toLowerCase() !== config.poolId.toLowerCase()) throw new Error("Compounder pool ID mismatch");
    const positionManagerBinding = new ethers.Contract(config.positionManager, POSITION_MANAGER_ABI, provider);
    const [positionManagerPoolManager, positionManagerPermit2] = await Promise.all([
      positionManagerBinding.poolManager() as Promise<string>,
      positionManagerBinding.permit2() as Promise<string>,
    ]);
    if (ethers.getAddress(positionManagerPoolManager) !== config.poolManager
      || ethers.getAddress(positionManagerPermit2) !== config.permit2) {
      throw new Error("PositionManager reciprocal PoolManager/Permit2 binding mismatch");
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
    const compoundPolicy = compoundExecutionPolicyFromEnv(process.env);

    let simulatedLiquidity = 0n;
    let simulatedBaseDepth = 0n;
    let constraintsData = "0x";
    let currentSqrtPriceX96: bigint | undefined;
    let blockedReason: string | undefined;
    if (!compoundPolicy) {
      blockedReason = "independent compound reference and explicit token-use caps are not configured";
    } else if (before.vaultNara === 0n && before.vaultUsdc === 0n) {
      blockedReason = "Vault has no newly collected fees to trigger compounding";
    } else if (!hasCompoundableInventory(
      before.vaultNara,
      before.vaultUsdc,
      before.bankedNara,
      before.bankedUsdc,
    )) {
      blockedReason = "combined Vault and Compounder inventory does not contain both NARA and USDC";
    } else {
      currentSqrtPriceX96 = await readSqrtPriceX96(provider, config.poolManager, config.poolId);
      assertCurrentSqrtPriceWithinPolicy(currentSqrtPriceX96, compoundPolicy);
      constraintsData = compoundConstraintsData(
        compoundPolicy.referenceSqrtPriceX96,
        compoundPolicy.maxNaraUsed,
        compoundPolicy.maxUsdcUsed,
        compoundPolicy.sqrtGuardBps,
        compoundPolicy.maxValueImbalanceBps,
      );
      simulatedLiquidity = await readVault.compoundAll.staticCall(1n, deadline, constraintsData, {
        from: simulationCaller,
      }) as bigint;
      simulatedBaseDepth = baseDepthForLiquidity(
        simulatedLiquidity,
        currentSqrtPriceX96,
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
      independentReferenceSqrtPriceX96: compoundPolicy?.referenceSqrtPriceX96.toString() ?? null,
      currentSqrtPriceX96: currentSqrtPriceX96?.toString() ?? null,
      maxNaraUsedRaw: compoundPolicy?.maxNaraUsed.toString() ?? null,
      maxUsdcUsedRaw: compoundPolicy?.maxUsdcUsed.toString() ?? null,
      blockedReason: blockedReason ?? null,
      ready,
      ...formatted(before),
    }, null, 2));
    if (!options.execute) return;

    if (!compoundPolicy) throw new Error(blockedReason);
    if (!frozen) throw new Error("Execution blocked until the Safe validates and freezes the compounder");
    if (!configuredKeeper) throw new Error("V4_COMPOUND_KEEPER_ADDRESS is required in execute mode");
    if (!keeperAllowed) throw new Error("Configured compound keeper is not authorized by the vault");
    const heartbeatUrl = process.env.V4_COMPOUND_HEARTBEAT_URL?.trim();
    if (process.env.V4_COMPOUND_REQUIRE_HEARTBEAT?.trim().toLowerCase() === "true" && !heartbeatUrl) {
      throw new Error("V4_COMPOUND_HEARTBEAT_URL is required in execute mode");
    }
    if (!ready) {
      console.log("No compound transaction required at the configured threshold.");
      await postJson(heartbeatUrl, {
        source: "nara-v4-liquidity-maintainer",
        status: "idle",
        block: latest.number,
        simulatedLiquidityUsdcDepth: ethers.formatUnits(simulatedBaseDepth, 6),
      });
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
    await vault.compoundAll.staticCall(minLiquidityAdded, deadline, constraintsData);
    const gasEstimate = await vault.compoundAll.estimateGas(minLiquidityAdded, deadline, constraintsData);
    const tx = await vault.compoundAll(minLiquidityAdded, deadline, constraintsData, {
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
    await postJson(heartbeatUrl, {
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
