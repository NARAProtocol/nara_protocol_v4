import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { assertTreasuryRangeMatrix } from "./v4TreasuryRangeEvidence.js";
import {
  assertCircleFiatTokenDependencyHealthy,
  parseCircleFiatTokenDependencyEvidence,
  treasuryRangeUsdcMonitoredAccounts,
  type CircleFiatTokenDependencyEvidence,
} from "./v4UsdcDependency.js";

export const TREASURY_RANGE_STRATEGY_SCHEMA = "nara.v4.treasury-range-strategy.v2" as const;

export type TreasuryRangeOrderSide = "SELL_NARA" | "BUY_NARA";

export interface TreasuryRangeStrategyOrder {
  orderId?: string;
  side: TreasuryRangeOrderSide;
  humanPriceLower: string;
  humanPriceUpper: string;
  tickLower: number;
  tickUpper: number;
  inputAmountRaw: string;
  expectedOutputAmountRaw: string;
  minimumOutputAmountRaw: string;
  expectedLiquidity: string;
  expectedDustNaraRaw: string;
  expectedDustUsdcRaw: string;
  toleranceBps: number;
  enabled: boolean;
}

export interface TreasuryRangeStrategyManifest {
  schemaVersion: typeof TREASURY_RANGE_STRATEGY_SCHEMA;
  status: "candidate_no_broadcast";
  changeId: string;
  repositoryHead: string;
  pinnedState: {
    chainId: "8453";
    blockNumber: number;
    blockHash: string;
    timestamp: number;
  };
  addresses: Record<string, string> & {
    safe: string;
    nara: string;
    usdc: string;
    hook: string;
    poolManager: string;
    positionManager: string;
    permit2: string;
    liquidityVault: string;
    liquidityCompounder: string;
    universalRouter: string;
    officialV4Quoter: string;
    create2HookDeployer: string;
  };
  runtimeCodeHashes: Record<string, string>;
  externalDependencies: {
    usdc: CircleFiatTokenDependencyEvidence;
  };
  poolId: string;
  poolKey: {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
  };
  currentSlot0: {
    sqrtPriceX96: string;
    tick: number;
    protocolFee?: number;
    lpFee?: number;
  };
  hookConfiguration: Record<string, unknown>;
  hookConfigurationHash: string;
  pendingHookConfiguration: Record<string, unknown> | null;
  existingPositions: readonly Record<string, unknown>[];
  proposedOrders: readonly TreasuryRangeStrategyOrder[];
  budget: {
    totalNaraAllocatedRaw: string;
    totalUsdcBudgetRaw: string;
    exposedUsdcRaw: string;
    protectedUsdcReserveRaw: string;
  };
  simulationMatrix: readonly Record<string, unknown>[];
  managerDeployment?: {
    manifestPath: string;
    manifestSha256: string;
  };
  strategyHash: string;
  noBroadcast: true;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function decimal(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!/^\d+$/.test(parsed)) throw new Error(`${label} must be an unsigned base-10 integer string`);
  return parsed;
}

function humanDecimal(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(parsed)) throw new Error(`${label} must be a canonical non-negative decimal string`);
  return parsed;
}

function decimalFraction(value: string): [bigint, bigint] {
  const [whole, fraction = ""] = value.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  return [BigInt(`${whole}${fraction}`), denominator];
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value as number;
}

function address(value: unknown, label: string): string {
  try {
    return ethers.getAddress(string(value, label));
  } catch {
    throw new Error(`${label} must be a checksummable EVM address`);
  }
}

function bytes32(value: unknown, label: string): string {
  const parsed = string(value, label).toLowerCase();
  if (!ethers.isHexString(parsed, 32)) throw new Error(`${label} must be bytes32`);
  return parsed;
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalTreasuryRangeJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function prettyTreasuryRangeJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256Hex(value: string | Uint8Array): string {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export function treasuryRangeHookConfigurationHash(entries: readonly { label: string; expected: unknown }[]): string {
  const canonical = entries
    .map((entry) => ({ label: entry.label, expected: entry.expected }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalTreasuryRangeJson(canonical))).toLowerCase();
}

export function treasuryRangeStrategyHash(manifest: Omit<TreasuryRangeStrategyManifest, "strategyHash"> | TreasuryRangeStrategyManifest): string {
  const { strategyHash: _ignored, ...hashInput } = manifest as TreasuryRangeStrategyManifest;
  return sha256Hex(canonicalTreasuryRangeJson(hashInput));
}

function parseOrder(value: unknown, index: number, spacing: number): TreasuryRangeStrategyOrder {
  const item = object(value, `proposedOrders[${index}]`);
  const side = string(item.side, `proposedOrders[${index}].side`);
  if (side !== "SELL_NARA" && side !== "BUY_NARA") throw new Error(`proposedOrders[${index}].side is invalid`);
  const tickLower = integer(item.tickLower, `proposedOrders[${index}].tickLower`);
  const tickUpper = integer(item.tickUpper, `proposedOrders[${index}].tickUpper`);
  if (tickLower >= tickUpper || tickLower % spacing !== 0 || tickUpper % spacing !== 0) {
    throw new Error(`proposedOrders[${index}] has invalid or unaligned ticks`);
  }
  const toleranceBps = integer(item.toleranceBps, `proposedOrders[${index}].toleranceBps`);
  if (toleranceBps < 0 || toleranceBps > 1_000) throw new Error(`proposedOrders[${index}].toleranceBps exceeds 10%`);
  if (item.enabled !== true && item.enabled !== false) throw new Error(`proposedOrders[${index}].enabled must be boolean`);
  const result: TreasuryRangeStrategyOrder = {
    side,
    humanPriceLower: humanDecimal(item.humanPriceLower, `proposedOrders[${index}].humanPriceLower`),
    humanPriceUpper: humanDecimal(item.humanPriceUpper, `proposedOrders[${index}].humanPriceUpper`),
    tickLower,
    tickUpper,
    inputAmountRaw: decimal(item.inputAmountRaw, `proposedOrders[${index}].inputAmountRaw`),
    expectedOutputAmountRaw: decimal(item.expectedOutputAmountRaw, `proposedOrders[${index}].expectedOutputAmountRaw`),
    minimumOutputAmountRaw: decimal(item.minimumOutputAmountRaw, `proposedOrders[${index}].minimumOutputAmountRaw`),
    expectedLiquidity: decimal(item.expectedLiquidity, `proposedOrders[${index}].expectedLiquidity`),
    expectedDustNaraRaw: decimal(item.expectedDustNaraRaw, `proposedOrders[${index}].expectedDustNaraRaw`),
    expectedDustUsdcRaw: decimal(item.expectedDustUsdcRaw, `proposedOrders[${index}].expectedDustUsdcRaw`),
    toleranceBps,
    enabled: item.enabled,
  };
  if (item.orderId !== undefined) result.orderId = decimal(item.orderId, `proposedOrders[${index}].orderId`);
  if (BigInt(result.inputAmountRaw) === 0n || BigInt(result.minimumOutputAmountRaw) === 0n) {
    throw new Error(`proposedOrders[${index}] contains a zero input or minimum output`);
  }
  if (BigInt(result.expectedLiquidity) === 0n || BigInt(result.minimumOutputAmountRaw) > BigInt(result.expectedOutputAmountRaw)) {
    throw new Error(`proposedOrders[${index}] has zero liquidity or minimum above expected output`);
  }
  const [lowerNumerator, lowerDenominator] = decimalFraction(result.humanPriceLower);
  const [upperNumerator, upperDenominator] = decimalFraction(result.humanPriceUpper);
  if (lowerNumerator * upperDenominator >= upperNumerator * lowerDenominator) {
    throw new Error(`proposedOrders[${index}] human price range is not increasing`);
  }
  return result;
}

export function parseTreasuryRangeStrategyManifest(value: unknown): TreasuryRangeStrategyManifest {
  const root = object(value, "strategy manifest");
  if (root.schemaVersion !== TREASURY_RANGE_STRATEGY_SCHEMA) throw new Error("Unsupported treasury-range strategy schema");
  if (root.status !== "candidate_no_broadcast" || root.noBroadcast !== true) {
    throw new Error("Strategy manifest must remain candidate_no_broadcast with noBroadcast=true");
  }
  const repositoryHead = string(root.repositoryHead, "repositoryHead").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(repositoryHead)) throw new Error("repositoryHead must be a full commit SHA");
  const pinned = object(root.pinnedState, "pinnedState");
  if (String(pinned.chainId) !== "8453") throw new Error("Strategy manifest must target Base chain 8453");
  const blockNumber = integer(pinned.blockNumber, "pinnedState.blockNumber");
  const timestamp = integer(pinned.timestamp, "pinnedState.timestamp");
  if (blockNumber < 1 || timestamp < 1) throw new Error("pinnedState block/timestamp must be positive");
  const addressesRaw = object(root.addresses, "addresses");
  const addresses = Object.fromEntries(Object.entries(addressesRaw).map(([key, item]) => [key, address(item, `addresses.${key}`)]));
  for (const key of [
    "safe", "nara", "usdc", "hook", "poolManager", "positionManager", "permit2",
    "liquidityVault", "liquidityCompounder", "universalRouter", "officialV4Quoter", "create2HookDeployer",
  ] as const) {
    if (!addresses[key]) throw new Error(`addresses.${key} is required`);
  }
  const hashesRaw = object(root.runtimeCodeHashes, "runtimeCodeHashes");
  const runtimeCodeHashes = Object.fromEntries(Object.entries(hashesRaw).map(([key, item]) => [key, bytes32(item, `runtimeCodeHashes.${key}`)]));
  const externalDependenciesRaw = object(root.externalDependencies, "externalDependencies");
  const usdcDependency = parseCircleFiatTokenDependencyEvidence(externalDependenciesRaw.usdc);
  const poolKeyRaw = object(root.poolKey, "poolKey");
  const fee = integer(poolKeyRaw.fee, "poolKey.fee");
  const tickSpacing = integer(poolKeyRaw.tickSpacing, "poolKey.tickSpacing");
  if (tickSpacing <= 0) throw new Error("poolKey.tickSpacing must be positive");
  const slot0Raw = object(root.currentSlot0, "currentSlot0");
  const proposedRaw = root.proposedOrders;
  if (!Array.isArray(proposedRaw)) throw new Error("proposedOrders must be an array");
  const budgetRaw = object(root.budget, "budget");
  const matrix = root.simulationMatrix;
  const positions = root.existingPositions;
  if (!Array.isArray(matrix) || !Array.isArray(positions)) throw new Error("simulationMatrix/existingPositions must be arrays");
  const manifest: TreasuryRangeStrategyManifest = {
    schemaVersion: TREASURY_RANGE_STRATEGY_SCHEMA,
    status: "candidate_no_broadcast",
    changeId: string(root.changeId, "changeId"),
    repositoryHead,
    pinnedState: {
      chainId: "8453",
      blockNumber,
      blockHash: bytes32(pinned.blockHash, "pinnedState.blockHash"),
      timestamp,
    },
    addresses: addresses as TreasuryRangeStrategyManifest["addresses"],
    runtimeCodeHashes,
    externalDependencies: { usdc: usdcDependency },
    poolId: bytes32(root.poolId, "poolId"),
    poolKey: {
      currency0: address(poolKeyRaw.currency0, "poolKey.currency0"),
      currency1: address(poolKeyRaw.currency1, "poolKey.currency1"),
      fee,
      tickSpacing,
      hooks: address(poolKeyRaw.hooks, "poolKey.hooks"),
    },
    currentSlot0: {
      sqrtPriceX96: decimal(slot0Raw.sqrtPriceX96, "currentSlot0.sqrtPriceX96"),
      tick: integer(slot0Raw.tick, "currentSlot0.tick"),
      ...(slot0Raw.protocolFee === undefined ? {} : { protocolFee: integer(slot0Raw.protocolFee, "currentSlot0.protocolFee") }),
      ...(slot0Raw.lpFee === undefined ? {} : { lpFee: integer(slot0Raw.lpFee, "currentSlot0.lpFee") }),
    },
    hookConfiguration: object(root.hookConfiguration, "hookConfiguration"),
    hookConfigurationHash: bytes32(root.hookConfigurationHash, "hookConfigurationHash"),
    pendingHookConfiguration: root.pendingHookConfiguration === null ? null : object(root.pendingHookConfiguration, "pendingHookConfiguration"),
    existingPositions: positions as Record<string, unknown>[],
    proposedOrders: proposedRaw.map((item, index) => parseOrder(item, index, tickSpacing)),
    budget: {
      totalNaraAllocatedRaw: decimal(budgetRaw.totalNaraAllocatedRaw, "budget.totalNaraAllocatedRaw"),
      totalUsdcBudgetRaw: decimal(budgetRaw.totalUsdcBudgetRaw, "budget.totalUsdcBudgetRaw"),
      exposedUsdcRaw: decimal(budgetRaw.exposedUsdcRaw, "budget.exposedUsdcRaw"),
      protectedUsdcReserveRaw: decimal(budgetRaw.protectedUsdcReserveRaw, "budget.protectedUsdcReserveRaw"),
    },
    simulationMatrix: matrix as Record<string, unknown>[],
    ...(root.managerDeployment === undefined ? {} : {
      managerDeployment: (() => {
        const deployment = object(root.managerDeployment, "managerDeployment");
        return {
          manifestPath: string(deployment.manifestPath, "managerDeployment.manifestPath"),
          manifestSha256: bytes32(deployment.manifestSha256, "managerDeployment.manifestSha256"),
        };
      })(),
    }),
    strategyHash: bytes32(root.strategyHash, "strategyHash"),
    noBroadcast: true,
  };
  const hookChecks = manifest.hookConfiguration.readChecks;
  if (!Array.isArray(hookChecks) || treasuryRangeHookConfigurationHash(hookChecks as Array<{ label: string; expected: unknown }>) !== manifest.hookConfigurationHash) {
    throw new Error("hookConfigurationHash does not bind hookConfiguration.readChecks");
  }
  if (BigInt(manifest.currentSlot0.sqrtPriceX96) === 0n) throw new Error("currentSlot0.sqrtPriceX96 must be non-zero");
  const enabled = manifest.proposedOrders.filter((order) => order.enabled);
  const allocatedNara = enabled.filter((order) => order.side === "SELL_NARA").reduce((sum, order) => sum + BigInt(order.inputAmountRaw), 0n);
  const exposedUsdc = enabled.filter((order) => order.side === "BUY_NARA").reduce((sum, order) => sum + BigInt(order.inputAmountRaw), 0n);
  if (allocatedNara !== BigInt(manifest.budget.totalNaraAllocatedRaw) || exposedUsdc !== BigInt(manifest.budget.exposedUsdcRaw)) {
    throw new Error("Strategy budget does not equal enabled order inputs");
  }
  if (BigInt(manifest.budget.exposedUsdcRaw) + BigInt(manifest.budget.protectedUsdcReserveRaw) !== BigInt(manifest.budget.totalUsdcBudgetRaw)) {
    throw new Error("Strategy exposed plus protected USDC does not equal total budget");
  }
  if (manifest.strategyHash !== treasuryRangeStrategyHash(manifest)) throw new Error("Strategy manifest hash is invalid");
  if (manifest.pendingHookConfiguration !== null) throw new Error("Pending Hook configuration must be resolved before building a Safe packet");
  if (manifest.externalDependencies.usdc.proxyAddress !== manifest.addresses.usdc ||
      manifest.externalDependencies.usdc.proxyRuntimeCodeHash !== manifest.runtimeCodeHashes.usdc) {
    throw new Error("USDC dependency evidence does not bind the strategy proxy address/runtime hash");
  }
  const expectedUsdcAccounts = treasuryRangeUsdcMonitoredAccounts({
    safe: manifest.addresses.safe,
    poolManager: manifest.addresses.poolManager,
    positionManager: manifest.addresses.positionManager,
    permit2: manifest.addresses.permit2,
    liquidityVault: manifest.addresses.liquidityVault,
    liquidityCompounder: manifest.addresses.liquidityCompounder,
    rangeManager: manifest.addresses.treasuryRangeManager,
  });
  if (canonicalTreasuryRangeJson(Object.fromEntries(Object.entries(expectedUsdcAccounts).map(([label, account]) => [label, {
    address: ethers.getAddress(account),
    isBlacklisted: false,
  }]))) !== canonicalTreasuryRangeJson(manifest.externalDependencies.usdc.monitoredAccounts)) {
    throw new Error("USDC dependency monitored account set does not match strategy actors");
  }
  assertCircleFiatTokenDependencyHealthy(manifest.externalDependencies.usdc);
  return manifest;
}

export function loadTreasuryRangeStrategyManifest(path: string): TreasuryRangeStrategyManifest {
  return parseTreasuryRangeStrategyManifest(JSON.parse(readFileSync(path, "utf8")));
}

export function assertTreasuryRangeManifestExactEvidence(manifest: TreasuryRangeStrategyManifest): void {
  const verified = assertTreasuryRangeMatrix(manifest.simulationMatrix, {
    repositoryHead: manifest.repositoryHead,
    chainId: 8453n,
    blockNumber: BigInt(manifest.pinnedState.blockNumber),
    blockHash: manifest.pinnedState.blockHash,
  });
  const match = /^(CONSERVATIVE|AGGRESSIVE|ADVERSARIAL)-(\d+)-NARA$/.exec(verified.candidateId);
  if (!match || BigInt(match[2]) * 10n ** 18n !== BigInt(manifest.budget.totalNaraAllocatedRaw)) {
    throw new Error("Exact matrix candidate does not match the strategy NARA budget");
  }
  const expectedChangeId = `NARA-20260828-v4-treasury-ranges-${match[1].toLowerCase()}-${match[2]}-nara`;
  if (manifest.changeId !== expectedChangeId) {
    throw new Error("Exact matrix candidate profile does not match the strategy changeId");
  }
}
