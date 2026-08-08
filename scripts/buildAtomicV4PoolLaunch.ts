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
  BASE_PERMIT2,
  BASE_POOL_MANAGER,
  BASE_POSITION_MANAGER,
  BASE_USDC,
  currentV4Config,
  requiredBaseRpcUrl,
  requiredEnv,
} from "./lib/v4LiveConfig.js";
import {
  buildAtomicV4PoolLaunch,
  encodeSafeMultiSendTransactions,
} from "./lib/v4AtomicPoolLaunch.js";
import {
  requireApprovedSeedAmounts,
  requireNonQuarantinedLiquidityStack,
} from "./seedV4Liquidity.js";
import {
  activeRoleHoldersFromHistory,
  rewardNotifierHistoryLogs,
} from "./verifyV4LaunchGates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env") });

const HOOK_ABI = [
  "function owner() view returns (address)",
  "function poolManager() view returns (address)",
  "function token() view returns (address)",
  "function base() view returns (address)",
  "function vault() view returns (address)",
  "function poolRegistered() view returns (bool)",
  "function expectedSqrtPriceX96() view returns (uint160)",
  "function protocolDepth(address currency) view returns (uint256)",
  "function buyCurve() view returns (uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps)",
  "function sellCurve() view returns (uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps)",
];
const VAULT_ABI = [
  "function hook() view returns (address)",
  "function owner() view returns (address)",
];
const ENGINE_ABI = [
  "function NARA() view returns (address)",
  "function hasRole(bytes32 role,address account) view returns (bool)",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
const POOL_MANAGER_ABI = ["function extsload(bytes32 slot) view returns (bytes32)"];
const SAFE_ABI = [
  "function masterCopy() view returns (address)",
  "function VERSION() view returns (string)",
  "function nonce() view returns (uint256)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getStorageAt(uint256 offset,uint256 length) view returns (bytes)",
  "function getModulesPaginated(address start,uint256 pageSize) view returns (address[] array,address next)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
  "function simulateAndRevert(address targetContract,bytes calldataPayload)",
];
const MULTISEND_ABI = ["function multiSend(bytes transactions)"];
const REWARD_NOTIFIER_ROLE = ethers.id("REWARD_NOTIFIER_ROLE");
const ROLE_GRANTED_TOPIC = ethers.id("RoleGranted(bytes32,address,address)");
const SAFE_MODULE_SENTINEL = "0x0000000000000000000000000000000000000001";
const SAFE_GUARD_STORAGE_SLOT = BigInt("0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8");
const BASE_MULTISEND_CALL_ONLY = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";
const BASE_MULTISEND_CALL_ONLY_CODEHASH = "0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939";
const BASE_SAFE_141_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const BASE_SAFE_141_SINGLETON_CODEHASH = "0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff";

const APPROVED_BUY_CURVE = [500n, 1_500n, 3_000n, 500n, 800n, 1_200n, 2_000n, 2_000n] as const;
const APPROVED_SELL_CURVE = [500n, 1_500n, 3_000n, 500n, 700n, 1_000n, 1_500n, 2_000n] as const;

export function requireCanonicalBaseLaunchInfrastructure(input: {
  base: string;
  permit2: string;
  poolManager: string;
  positionManager: string;
}): void {
  for (const [label, actual, expected] of [
    ["Base token", input.base, BASE_USDC],
    ["Permit2", input.permit2, BASE_PERMIT2],
    ["PoolManager", input.poolManager, BASE_POOL_MANAGER],
    ["PositionManager", input.positionManager, BASE_POSITION_MANAGER],
  ] as const) {
    if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
      throw new Error(`${label} must be the canonical Base deployment: expected ${expected}, found ${actual}`);
    }
  }
}

export function requireApprovedAtomicLaunchFeeCurves(
  buyCurve: readonly bigint[],
  sellCurve: readonly bigint[],
): void {
  for (const [label, actual, expected] of [
    ["buy", buyCurve, APPROVED_BUY_CURVE],
    ["sell", sellCurve, APPROVED_SELL_CURVE],
  ] as const) {
    if (actual.length < expected.length || expected.some((value, index) => BigInt(actual[index]) !== value)) {
      throw new Error(`Hook ${label} fee curve does not match the approved atomic-launch curve`);
    }
  }
}

export function requireRewardNotifierHistoryAnchor(input: {
  deploymentBlock: number;
  latestBlock: number;
  mainDeploymentBlockHash: string | null;
  historyDeploymentBlockHash: string | null;
  deploymentTransactionBlock: number | null;
  deploymentTransactionBlockHash: string | null;
  deploymentTransactionSucceeded: boolean;
  constructorGrantFound: boolean;
  codeAbsentBeforeDeployment: boolean;
  codePresentAtDeployment: boolean;
  history: readonly { kind: "grant" | "revoke"; account: string }[];
}): void {
  if (input.latestBlock < input.deploymentBlock) {
    throw new Error("Role-history RPC is behind V4_ENGINE_DEPLOYMENT_BLOCK");
  }
  if (!input.mainDeploymentBlockHash || !input.historyDeploymentBlockHash) {
    throw new Error("Engine deployment block is unavailable from a required RPC");
  }
  if (input.mainDeploymentBlockHash.toLowerCase() !== input.historyDeploymentBlockHash.toLowerCase()) {
    throw new Error("Role-history RPC does not agree with the Base RPC at the engine deployment block");
  }
  if (
    !input.deploymentTransactionSucceeded ||
    input.deploymentTransactionBlock !== input.deploymentBlock ||
    !input.deploymentTransactionBlockHash ||
    input.deploymentTransactionBlockHash.toLowerCase() !== input.mainDeploymentBlockHash.toLowerCase()
  ) {
    throw new Error("Engine deployment transaction does not anchor V4_ENGINE_DEPLOYMENT_BLOCK");
  }
  if (!input.constructorGrantFound || !input.codeAbsentBeforeDeployment || !input.codePresentAtDeployment) {
    throw new Error("Engine deployment evidence does not prove the constructor notifier grant");
  }
  if (input.history.length === 0 || input.history[0].kind !== "grant") {
    throw new Error("REWARD_NOTIFIER_ROLE history is not anchored by the constructor grant");
  }
}

export function requireAtomicLaunchSafetyState(input: {
  hookVault: string;
  expectedVault: string;
  hookPoolManager: string;
  expectedPoolManager: string;
  hookToken: string;
  hookBase: string;
  vaultHook: string;
  expectedHook: string;
  engineNara: string;
  expectedNara: string;
  hookOwner: string;
  vaultOwner: string;
  expectedOwner: string;
  activeRewardNotifierHolders: readonly string[];
}): void {
  if (ethers.getAddress(input.hookVault) !== ethers.getAddress(input.expectedVault)) {
    throw new Error("Hook vault binding does not match V4_VAULT");
  }
  if (ethers.getAddress(input.hookPoolManager) !== ethers.getAddress(input.expectedPoolManager)) {
    throw new Error("Hook PoolManager binding does not match canonical Base PoolManager");
  }
  if (ethers.getAddress(input.hookToken) !== ethers.getAddress(input.expectedNara)) {
    throw new Error("Hook token binding does not match V4_NARA_TOKEN");
  }
  if (ethers.getAddress(input.hookBase) !== ethers.getAddress(BASE_USDC)) {
    throw new Error("Hook base binding does not match Base native USDC");
  }
  if (ethers.getAddress(input.vaultHook) !== ethers.getAddress(input.expectedHook)) {
    throw new Error("Vault hook binding does not match V4_HOOK");
  }
  if (ethers.getAddress(input.engineNara) !== ethers.getAddress(input.expectedNara)) {
    throw new Error("Engine NARA binding does not match V4_NARA_TOKEN");
  }
  if (ethers.getAddress(input.hookOwner) !== ethers.getAddress(input.expectedOwner)) {
    throw new Error("Hook owner is not V4_ADMIN_ADDRESS");
  }
  if (ethers.getAddress(input.vaultOwner) !== ethers.getAddress(input.expectedOwner)) {
    throw new Error("Vault owner is not V4_ADMIN_ADDRESS");
  }
  if (input.activeRewardNotifierHolders.length !== 0) {
    throw new Error(
      `REWARD_NOTIFIER_ROLE must have no active holder before the atomic pool launch: ${input.activeRewardNotifierHolders.join(",")}`,
    );
  }
}

async function requireCode(provider: ethers.Provider, label: string, address: string): Promise<void> {
  if ((await provider.getCode(address)) === "0x") throw new Error(`${label} has no code: ${address}`);
}

function revertData(error: unknown): string | undefined {
  const candidate = error as {
    data?: unknown;
    error?: { data?: unknown };
    info?: { error?: { data?: unknown } };
  };
  for (const value of [candidate.data, candidate.error?.data, candidate.info?.error?.data]) {
    if (typeof value === "string" && ethers.isHexString(value)) return value;
  }
  return undefined;
}

async function simulateAtomicSafeBatch(
  provider: ethers.Provider,
  safeAddress: string,
  multiSendCall: string,
): Promise<void> {
  const safeInterface = new ethers.Interface(SAFE_ABI);
  const simulationCall = safeInterface.encodeFunctionData("simulateAndRevert", [
    BASE_MULTISEND_CALL_ONLY,
    multiSendCall,
  ]);
  try {
    await provider.call({ to: safeAddress, data: simulationCall });
  } catch (error) {
    const data = revertData(error);
    if (data) {
      try {
        const [succeeded] = ethers.AbiCoder.defaultAbiCoder().decode(["bool", "bytes"], data);
        if (succeeded) return;
      } catch {
        // The fail-closed error below intentionally hides provider internals.
      }
    }
  }
  throw new Error("Exact Safe MultiSend simulation failed; no launch artifact was written");
}

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(requiredBaseRpcUrl());
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) throw new Error(`Expected Base mainnet chainId 8453, got ${network.chainId}`);

  const config = currentV4Config();
  requireCanonicalBaseLaunchInfrastructure(config);
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
    ["MultiSendCallOnly", BASE_MULTISEND_CALL_ONLY],
    ["Safe 1.4.1 singleton", BASE_SAFE_141_SINGLETON],
    ["NARA", config.token],
    ["USDC", config.base],
    ["Permit2", config.permit2],
    ["PoolManager", config.poolManager],
    ["PositionManager", config.positionManager],
    ["Hook", config.hook],
    ["Vault", config.vault],
    ["Engine", config.engine],
  ] as const) {
    await requireCode(provider, label, address);
  }

  const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
  if (await hook.poolRegistered()) throw new Error("Pool is already registered; no atomic launch window remains");
  if ((await hook.expectedSqrtPriceX96()) !== 0n) throw new Error("Unregistered hook has a nonzero expected price");

  const vault = new ethers.Contract(config.vault, VAULT_ABI, provider);
  const engine = new ethers.Contract(config.engine, ENGINE_ABI, provider);
  const [hookVault, hookPoolManager, hookToken, hookBase, buyCurve, sellCurve, vaultHook, engineNara, hookOwner, vaultOwner] = await Promise.all([
    hook.vault() as Promise<string>,
    hook.poolManager() as Promise<string>,
    hook.token() as Promise<string>,
    hook.base() as Promise<string>,
    hook.buyCurve() as Promise<readonly bigint[]>,
    hook.sellCurve() as Promise<readonly bigint[]>,
    vault.hook() as Promise<string>,
    engine.NARA() as Promise<string>,
    hook.owner() as Promise<string>,
    vault.owner() as Promise<string>,
  ]);
  requireApprovedAtomicLaunchFeeCurves(buyCurve, sellCurve);

  const engineDeploymentBlock = Number(requiredEnv("V4_ENGINE_DEPLOYMENT_BLOCK"));
  if (!Number.isSafeInteger(engineDeploymentBlock) || engineDeploymentBlock <= 0) {
    throw new Error("V4_ENGINE_DEPLOYMENT_BLOCK is not a valid block number");
  }
  const engineDeploymentTxHash = requiredEnv("V4_ENGINE_DEPLOYMENT_TX_HASH");
  if (!ethers.isHexString(engineDeploymentTxHash, 32)) {
    throw new Error("V4_ENGINE_DEPLOYMENT_TX_HASH is not a valid transaction hash");
  }
  const roleHistoryRpc = process.env.V4_ROLE_HISTORY_RPC_URL?.trim();
  const roleHistoryProvider = roleHistoryRpc ? new ethers.JsonRpcProvider(roleHistoryRpc) : provider;
  const roleHistoryNetwork = await roleHistoryProvider.getNetwork();
  if (roleHistoryNetwork.chainId !== 8453n) {
    throw new Error(`Role-history RPC must be Base mainnet chainId 8453, got ${roleHistoryNetwork.chainId}`);
  }
  const roleChunkBlocks = Number(process.env.V4_ROLE_LOG_CHUNK_BLOCKS?.trim() || "9000");
  const roleLogs = await rewardNotifierHistoryLogs(
    roleHistoryProvider,
    config.engine,
    REWARD_NOTIFIER_ROLE,
    engineDeploymentBlock,
    roleChunkBlocks,
  );
  const roleHistory = roleLogs.map((log) => ({
    kind: log.topics[0] === ROLE_GRANTED_TOPIC ? "grant" as const : "revoke" as const,
    account: ethers.getAddress(ethers.dataSlice(log.topics[2], 12)),
  }));
  const [roleHistoryLatestBlock, mainDeploymentBlock, historyDeploymentBlock, deploymentReceipt, codeBefore, codeAt] = await Promise.all([
    roleHistoryProvider.getBlockNumber(),
    provider.getBlock(engineDeploymentBlock),
    roleHistoryProvider.getBlock(engineDeploymentBlock),
    provider.getTransactionReceipt(engineDeploymentTxHash),
    provider.getCode(config.engine, engineDeploymentBlock - 1),
    provider.getCode(config.engine, engineDeploymentBlock),
  ]);
  const constructorGrantFound = deploymentReceipt?.logs.some((log) =>
    ethers.getAddress(log.address) === ethers.getAddress(config.engine) &&
    log.topics[0]?.toLowerCase() === ROLE_GRANTED_TOPIC.toLowerCase() &&
    log.topics[1]?.toLowerCase() === REWARD_NOTIFIER_ROLE.toLowerCase()
  ) ?? false;
  requireRewardNotifierHistoryAnchor({
    deploymentBlock: engineDeploymentBlock,
    latestBlock: roleHistoryLatestBlock,
    mainDeploymentBlockHash: mainDeploymentBlock?.hash ?? null,
    historyDeploymentBlockHash: historyDeploymentBlock?.hash ?? null,
    deploymentTransactionBlock: deploymentReceipt?.blockNumber ?? null,
    deploymentTransactionBlockHash: deploymentReceipt?.blockHash ?? null,
    deploymentTransactionSucceeded: deploymentReceipt?.status === 1,
    constructorGrantFound,
    codeAbsentBeforeDeployment: codeBefore === "0x",
    codePresentAtDeployment: codeAt !== "0x",
    history: roleHistory,
  });
  const historicalActive = activeRoleHoldersFromHistory(roleHistory);
  const activeRewardNotifierHolders = (
    await Promise.all(
      historicalActive.map(async (account) =>
        (await engine.hasRole(REWARD_NOTIFIER_ROLE, account)) ? account : undefined,
      ),
    )
  ).filter(Boolean) as string[];

  requireAtomicLaunchSafetyState({
    hookVault,
    expectedVault: config.vault,
    hookPoolManager,
    expectedPoolManager: config.poolManager,
    hookToken,
    hookBase,
    vaultHook,
    expectedHook: config.hook,
    engineNara,
    expectedNara: config.token,
    hookOwner,
    vaultOwner,
    expectedOwner: safe,
    activeRewardNotifierHolders,
  });

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

  const expectedSafeCodeHash = requiredEnv("V4_SAFE_CODEHASH");
  if (!ethers.isHexString(expectedSafeCodeHash, 32)) throw new Error("V4_SAFE_CODEHASH must be a 32-byte hash");
  const [safeCode, safeSingletonCode, multiSendCode, simulationBlock] = await Promise.all([
    provider.getCode(safe),
    provider.getCode(BASE_SAFE_141_SINGLETON),
    provider.getCode(BASE_MULTISEND_CALL_ONLY),
    provider.getBlockNumber(),
  ]);
  if (ethers.keccak256(safeCode).toLowerCase() !== expectedSafeCodeHash.toLowerCase()) {
    throw new Error("Safe runtime code hash does not match fresh deployment evidence");
  }
  if (ethers.keccak256(multiSendCode).toLowerCase() !== BASE_MULTISEND_CALL_ONLY_CODEHASH) {
    throw new Error("MultiSendCallOnly runtime code hash does not match canonical Safe 1.4.1 infrastructure");
  }

  const safeContract = new ethers.Contract(safe, SAFE_ABI, provider);
  const [safeMasterCopy, safeVersion, safeNonce, safeThreshold, safeOwners, safeGuardStorage, safeModules] = await Promise.all([
    safeContract.masterCopy() as Promise<string>,
    safeContract.VERSION() as Promise<string>,
    safeContract.nonce() as Promise<bigint>,
    safeContract.getThreshold() as Promise<bigint>,
    safeContract.getOwners() as Promise<string[]>,
    safeContract.getStorageAt(SAFE_GUARD_STORAGE_SLOT, 1) as Promise<string>,
    safeContract.getModulesPaginated(SAFE_MODULE_SENTINEL, 10) as Promise<[string[], string]>,
  ]);
  if (
    ethers.getAddress(safeMasterCopy) !== ethers.getAddress(BASE_SAFE_141_SINGLETON) ||
    ethers.keccak256(safeSingletonCode).toLowerCase() !== BASE_SAFE_141_SINGLETON_CODEHASH
  ) {
    throw new Error("Launch Safe is not bound to the approved Base Safe 1.4.1 singleton");
  }
  if (safeVersion !== "1.4.1") throw new Error(`Expected Safe version 1.4.1, got ${safeVersion}`);
  if (safeThreshold !== 2n || safeOwners.length !== 3) throw new Error("Launch custody must be the approved 2-of-3 Safe");
  const safeGuard = ethers.getAddress(ethers.dataSlice(safeGuardStorage, 12));
  if (ethers.getAddress(safeGuard) !== ethers.ZeroAddress) throw new Error("Launch Safe must not have an active guard");
  if (safeModules[0].length !== 0 || ethers.getAddress(safeModules[1]) !== ethers.getAddress(SAFE_MODULE_SENTINEL)) {
    throw new Error("Launch Safe must not have active modules");
  }

  const packedTransactions = encodeSafeMultiSendTransactions(plan.transactions);
  const multiSendCall = new ethers.Interface(MULTISEND_ABI).encodeFunctionData("multiSend", [packedTransactions]);
  await simulateAtomicSafeBatch(provider, safe, multiSendCall);
  const safeTx = {
    to: ethers.getAddress(BASE_MULTISEND_CALL_ONLY),
    value: "0",
    data: multiSendCall,
    operation: 1,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: safeNonce.toString(),
  } as const;
  const safeTxHash = await safeContract.getTransactionHash(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.operation,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    safeTx.nonce,
  ) as string;

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
      safeVersion,
      safeThreshold: safeThreshold.toString(),
      safeOwnerCount: safeOwners.length,
      safeNonce: safeNonce.toString(),
      safeCodeHash: ethers.keccak256(safeCode),
      safeSingleton: ethers.getAddress(BASE_SAFE_141_SINGLETON),
      safeSingletonCodeHash: ethers.keccak256(safeSingletonCode),
      multiSendCallOnly: ethers.getAddress(BASE_MULTISEND_CALL_ONLY),
      multiSendCallOnlyCodeHash: ethers.keccak256(multiSendCode),
      packedTransactionsHash: ethers.keccak256(packedTransactions),
      safeTxHash,
      simulatedAtBlock: simulationBlock,
      simulation: "PASS: Safe.simulateAndRevert -> canonical MultiSendCallOnly.multiSend",
    },
    safeTransaction: safeTx,
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
