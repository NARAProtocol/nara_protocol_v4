import { ethers } from "ethers";
import { resolve } from "node:path";

export interface SettlerConfig {
  primaryWsRpc: string;
  secondaryWsRpc: string;
  fallbackHttpRpc: string;
  managerAddress: string;
  managerRuntimeCodeHash: string;
  hookConfigurationHash: string;
  infrastructureRuntimeCodeHashes: {
    usdc: string;
    poolManager: string;
    positionManager: string;
    permit2: string;
  };
  usdcDependency: {
    readerRuntimeCodeHash: string;
    implementationAddress: string;
    implementationRuntimeCodeHash: string;
    admin: string;
    owner: string;
    pauser: string;
    blacklister: string;
  };
  deploymentBlock: number;
  privateKey: string;
  heartbeatUrl: string;
  alertWebhookUrl: string;
  minGasBalanceWei: bigint;
  confirmations: number;
  pollingIntervalMs: number;
  fullSweepIntervalMs: number;
  heartbeatIntervalMs: number;
  rpcStaleMs: number;
  rpcRequestTimeoutMs: number;
  sweepTimeoutMs: number;
  maxPageSize: number;
  maxPages: number;
  maxSettlementBatch: number;
  maxFeePerGasWei: bigint;
  maxPriorityFeePerGasWei: bigint;
  maxGasLimit: bigint;
  pendingStatePath: string;
  reconciliationDirectory: string;
  pendingAlertAfterMs: number;
  pendingDropAfterMs: number;
  instanceId: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function integer(environment: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = environment[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function bigint(environment: NodeJS.ProcessEnv, name: string, fallback: bigint, minimum: bigint): bigint {
  const raw = environment[name]?.trim();
  let value: bigint;
  try {
    value = raw ? BigInt(raw) : fallback;
  } catch {
    throw new Error(`${name} must be an unsigned integer`);
  }
  if (value < minimum) throw new Error(`${name} is below its safety minimum`);
  return value;
}

function hash(environment: NodeJS.ProcessEnv, name: string): string {
  const value = required(environment, name).toLowerCase();
  if (!ethers.isHexString(value, 32)) throw new Error(`${name} must be bytes32`);
  return value;
}

function rpcOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (name.includes("WS") && url.protocol !== "wss:" && url.protocol !== "ws:") throw new Error(`${name} must be a WebSocket URL`);
  if (name.includes("HTTP") && url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${name} must be an HTTP URL`);
  return url.host.toLowerCase();
}

export function readSettlerConfig(environment: NodeJS.ProcessEnv = process.env): SettlerConfig {
  const primaryWsRpc = required(environment, "PRIMARY_BASE_WS_RPC");
  const secondaryWsRpc = required(environment, "SECONDARY_BASE_WS_RPC");
  const fallbackHttpRpc = required(environment, "FALLBACK_BASE_HTTP_RPC");
  const origins = new Set([
    rpcOrigin(primaryWsRpc, "PRIMARY_BASE_WS_RPC"),
    rpcOrigin(secondaryWsRpc, "SECONDARY_BASE_WS_RPC"),
    rpcOrigin(fallbackHttpRpc, "FALLBACK_BASE_HTTP_RPC"),
  ]);
  if (origins.size !== 3) throw new Error("Primary, secondary, and fallback RPCs must use distinct URL origins");
  const privateKey = required(environment, "SETTLER_PRIVATE_KEY");
  let walletAddress: string;
  try {
    walletAddress = new ethers.Wallet(privateKey).address;
  } catch {
    throw new Error("SETTLER_PRIVATE_KEY is not a valid EVM private key");
  }
  const instanceId = required(environment, "SETTLER_INSTANCE_ID");
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(instanceId)) throw new Error("SETTLER_INSTANCE_ID contains unsafe characters");
  if (environment.SETTLER_EXPECTED_ADDRESS?.trim() && ethers.getAddress(environment.SETTLER_EXPECTED_ADDRESS) !== walletAddress) {
    throw new Error("SETTLER_PRIVATE_KEY does not match SETTLER_EXPECTED_ADDRESS");
  }
  const managerRuntimeCodeHash = hash(environment, "RANGE_MANAGER_RUNTIME_CODE_HASH");
  const pendingAlertAfterMs = integer(environment, "SETTLER_PENDING_ALERT_AFTER_MS", 120_000, 30_000, 3_600_000);
  const pendingDropAfterMs = integer(environment, "SETTLER_PENDING_DROP_AFTER_MS", 900_000, 60_000, 86_400_000);
  if (pendingDropAfterMs <= pendingAlertAfterMs) throw new Error("SETTLER_PENDING_DROP_AFTER_MS must exceed SETTLER_PENDING_ALERT_AFTER_MS");
  const rpcRequestTimeoutMs = integer(environment, "SETTLER_RPC_REQUEST_TIMEOUT_MS", 10_000, 1_000, 60_000);
  const sweepTimeoutMs = integer(environment, "SETTLER_SWEEP_TIMEOUT_MS", 90_000, 10_000, 600_000);
  if (rpcRequestTimeoutMs >= sweepTimeoutMs) throw new Error("SETTLER_RPC_REQUEST_TIMEOUT_MS must be below SETTLER_SWEEP_TIMEOUT_MS");
  return {
    primaryWsRpc,
    secondaryWsRpc,
    fallbackHttpRpc,
    managerAddress: ethers.getAddress(required(environment, "RANGE_MANAGER_ADDRESS")),
    managerRuntimeCodeHash,
    hookConfigurationHash: hash(environment, "HOOK_CONFIGURATION_HASH"),
    infrastructureRuntimeCodeHashes: {
      usdc: hash(environment, "USDC_RUNTIME_CODE_HASH"),
      poolManager: hash(environment, "POOL_MANAGER_RUNTIME_CODE_HASH"),
      positionManager: hash(environment, "POSITION_MANAGER_RUNTIME_CODE_HASH"),
      permit2: hash(environment, "PERMIT2_RUNTIME_CODE_HASH"),
    },
    usdcDependency: {
      readerRuntimeCodeHash: hash(environment, "USDC_READER_RUNTIME_CODE_HASH"),
      implementationAddress: ethers.getAddress(required(environment, "USDC_IMPLEMENTATION_ADDRESS")),
      implementationRuntimeCodeHash: hash(environment, "USDC_IMPLEMENTATION_RUNTIME_CODE_HASH"),
      admin: ethers.getAddress(required(environment, "USDC_PROXY_ADMIN")),
      owner: ethers.getAddress(required(environment, "USDC_OWNER")),
      pauser: ethers.getAddress(required(environment, "USDC_PAUSER")),
      blacklister: ethers.getAddress(required(environment, "USDC_BLACKLISTER")),
    },
    deploymentBlock: integer(environment, "RANGE_MANAGER_DEPLOYMENT_BLOCK", 0, 1, Number.MAX_SAFE_INTEGER),
    privateKey,
    heartbeatUrl: required(environment, "HEARTBEAT_URL"),
    alertWebhookUrl: required(environment, "ALERT_WEBHOOK_URL"),
    minGasBalanceWei: bigint(environment, "MIN_GAS_BALANCE_WEI", 5_000_000_000_000_000n, 1n),
    confirmations: integer(environment, "CONFIRMATIONS", 3, 1, 64),
    pollingIntervalMs: integer(environment, "SETTLER_POLL_INTERVAL_MS", 15_000, 2_000, 300_000),
    fullSweepIntervalMs: integer(environment, "SETTLER_FULL_SWEEP_INTERVAL_MS", 120_000, 15_000, 3_600_000),
    heartbeatIntervalMs: integer(environment, "SETTLER_HEARTBEAT_INTERVAL_MS", 60_000, 10_000, 3_600_000),
    rpcStaleMs: integer(environment, "SETTLER_RPC_STALE_MS", 90_000, 15_000, 900_000),
    rpcRequestTimeoutMs,
    sweepTimeoutMs,
    maxPageSize: integer(environment, "SETTLER_MAX_PAGE_SIZE", 50, 1, 100),
    maxPages: integer(environment, "SETTLER_MAX_PAGES", 20, 1, 100),
    maxSettlementBatch: integer(environment, "SETTLER_MAX_SETTLEMENT_BATCH", 8, 1, 16),
    maxFeePerGasWei: bigint(environment, "SETTLER_MAX_FEE_PER_GAS_WEI", 1_000_000_000n, 1n),
    maxPriorityFeePerGasWei: bigint(environment, "SETTLER_MAX_PRIORITY_FEE_PER_GAS_WEI", 100_000_000n, 1n),
    maxGasLimit: bigint(environment, "SETTLER_MAX_GAS_LIMIT", 4_000_000n, 100_000n),
    pendingStatePath: resolve(environment.SETTLER_PENDING_STATE_PATH?.trim() || `/var/lib/nara-v4-range-settler/pending-${instanceId}.json`),
    reconciliationDirectory: resolve(environment.SETTLER_RECONCILIATION_DIRECTORY?.trim() || `/var/lib/nara-v4-range-settler/reconciled-${instanceId}`),
    pendingAlertAfterMs,
    pendingDropAfterMs,
    instanceId,
  };
}

export function publicSettlerConfig(config: SettlerConfig): Record<string, string | number> {
  return {
    managerAddress: config.managerAddress,
    managerRuntimeCodeHash: config.managerRuntimeCodeHash,
    hookConfigurationHash: config.hookConfigurationHash,
    deploymentBlock: config.deploymentBlock,
    confirmations: config.confirmations,
    pollingIntervalMs: config.pollingIntervalMs,
    fullSweepIntervalMs: config.fullSweepIntervalMs,
    rpcRequestTimeoutMs: config.rpcRequestTimeoutMs,
    sweepTimeoutMs: config.sweepTimeoutMs,
    maxPageSize: config.maxPageSize,
    maxPages: config.maxPages,
    maxSettlementBatch: config.maxSettlementBatch,
    pendingAlertAfterMs: config.pendingAlertAfterMs,
    pendingDropAfterMs: config.pendingDropAfterMs,
    instanceId: config.instanceId,
  };
}
