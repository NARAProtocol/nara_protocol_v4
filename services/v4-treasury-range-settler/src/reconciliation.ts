import { ethers } from "ethers";
import { canonicalProductionV4Deployment, type ProductionV4Deployment } from "../../../scripts/lib/v4LiveConfig.js";
import {
  canonicalTreasuryRangeAuthorities,
  type TreasuryRangeAuthorities,
} from "../../../scripts/lib/v4TreasuryRangeConfig.js";
import {
  readCanonicalNaraSafeEvidence,
  readTreasuryRangeSafeEvidence,
} from "../../../scripts/lib/v4SafeEvidence.js";
import { treasuryRangeHookConfigurationHash } from "../../../scripts/lib/v4TreasuryRangeManifest.js";
import {
  CIRCLE_FIAT_TOKEN_ADMIN_SLOT,
  CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA,
  CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT,
  CIRCLE_FIAT_TOKEN_PROXY_MECHANISM,
  BASE_MULTICALL3,
  assertCircleFiatTokenDependencyExact,
  parseCircleFiatTokenDependencyEvidence,
  readCircleFiatTokenDependency,
  treasuryRangeUsdcMonitoredAccounts,
  type CircleFiatTokenDependencyEvidence,
} from "../../../scripts/lib/v4UsdcDependency.js";
import type { SettlerConfig } from "./config.js";
import {
  FatalRuntimeGate,
  RpcDeadlineSet,
  allSettledOrThrow,
  isFatalRuntimeError,
  type RpcSource,
} from "./runtime.js";
import {
  ERC20_ABI,
  PERMIT2_ABI,
  POSITION_MANAGER_ABI,
  RANGE_MANAGER_ABI,
  decodeOrder,
  type RangeOrderSnapshot,
} from "./contracts.js";

export interface ProviderSet {
  primary: ethers.Provider;
  secondary: ethers.Provider;
  fallback: ethers.Provider;
}

export interface CanonicalPoint {
  number: number;
  hash: string;
  timestamp: number;
}

export interface SweepSnapshot {
  point: CanonicalPoint;
  activeOrders: RangeOrderSnapshot[];
  settleableOrderIds: bigint[];
  treasuryRangeSafeNaraBalance: bigint;
  treasuryRangeSafeUsdcBalance: bigint;
  unknownPositionCount: bigint;
  allowanceClean: true;
  managerNaraBalance: bigint;
  managerUsdcBalance: bigint;
}

export interface SettlementEvidence {
  receiptBlock: CanonicalPoint;
  transactionHash: string;
  orderIds: bigint[];
  naraOut: bigint;
  usdcOut: bigint;
}

export type TerminalOutcome = "active" | "settled" | "cancelled" | "mixed_terminal";

export function terminalOutcomeFromStatuses(statuses: readonly number[]): TerminalOutcome {
  if (statuses.length > 0 && statuses.every((status) => status === 2)) return "settled";
  if (statuses.length > 0 && statuses.every((status) => status === 3)) return "cancelled";
  if (statuses.length > 0 && statuses.every((status) => status === 2 || status === 3)) return "mixed_terminal";
  return "active";
}

export interface ReceiptConsensus {
  state: "absent" | "partial" | "agreed";
  receipt?: ethers.TransactionReceipt;
}

const TRANSFER_INTERFACE = new ethers.Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const RANGE_INTERFACE = new ethers.Interface(RANGE_MANAGER_ABI);
const CURVE_OUTPUTS = "uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps";
const HOOK_CONFIGURATION_ABI = [
  `function buyCurve() view returns(${CURVE_OUTPUTS})`,
  `function sellCurve() view returns(${CURVE_OUTPUTS})`,
  "function protocolDepth(address) view returns(uint256)",
  `function pendingBuyCurve() view returns(tuple(${CURVE_OUTPUTS}) curve,uint48 eta,bool exists)`,
  `function pendingSellCurve() view returns(tuple(${CURVE_OUTPUTS}) curve,uint48 eta,bool exists)`,
  "function pendingProtocolDepth(address) view returns(uint256 depth,uint48 eta,bool exists)",
  "function registeredPoolId() view returns(bytes32)",
  "function poolRegistered() view returns(bool)",
] as const;

export function hasIndependentBurnOwnershipProof(results: readonly PromiseSettledResult<unknown>[]): boolean {
  return results.length === 3 && results.every((result) => {
    if (result.status === "fulfilled") return false;
    const reason = result.reason as { code?: unknown };
    return reason?.code === "CALL_EXCEPTION";
  });
}

function sameAddress(actual: string, expected: string, label: string): void {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) throw new Error(`${label} binding mismatch`);
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function normalize(value: unknown): unknown {
  return JSON.parse(stable(value));
}

async function readHookConfiguration(
  provider: ethers.Provider,
  source: RpcSource,
  rpc: RpcDeadlineSet,
  hookAddress: string,
  usdc: string,
  nara: string,
  blockTag: number,
): Promise<Array<{ label: string; expected: unknown }>> {
  const hook = new ethers.Contract(hookAddress, HOOK_CONFIGURATION_ABI, provider);
  const [buy, sell, usdcDepth, naraDepth, pendingBuy, pendingSell, pendingUsdc, pendingNara, poolId, registered] = await allSettledOrThrow([
    rpc.one(source, "hook.buyCurve", () => hook.buyCurve({ blockTag })),
    rpc.one(source, "hook.sellCurve", () => hook.sellCurve({ blockTag })),
    rpc.one(source, "hook.protocolDepth.usdc", () => hook.protocolDepth(usdc, { blockTag })),
    rpc.one(source, "hook.protocolDepth.nara", () => hook.protocolDepth(nara, { blockTag })),
    rpc.one(source, "hook.pendingBuyCurve", () => hook.pendingBuyCurve({ blockTag })),
    rpc.one(source, "hook.pendingSellCurve", () => hook.pendingSellCurve({ blockTag })),
    rpc.one(source, "hook.pendingProtocolDepth.usdc", () => hook.pendingProtocolDepth(usdc, { blockTag })),
    rpc.one(source, "hook.pendingProtocolDepth.nara", () => hook.pendingProtocolDepth(nara, { blockTag })),
    rpc.one(source, "hook.registeredPoolId", () => hook.registeredPoolId({ blockTag })),
    rpc.one(source, "hook.poolRegistered", () => hook.poolRegistered({ blockTag })),
  ]);
  return [
    { label: "hook.buyCurve", expected: normalize(buy) },
    { label: "hook.sellCurve", expected: normalize(sell) },
    { label: "hook.protocolDepth.usdc", expected: normalize(usdcDepth) },
    { label: "hook.protocolDepth.nara", expected: normalize(naraDepth) },
    { label: "hook.pendingBuyCurve", expected: normalize(pendingBuy) },
    { label: "hook.pendingSellCurve", expected: normalize(pendingSell) },
    { label: "hook.pendingProtocolDepth.usdc", expected: normalize(pendingUsdc) },
    { label: "hook.pendingProtocolDepth.nara", expected: normalize(pendingNara) },
    { label: "hook.registeredPoolId", expected: normalize(poolId) },
    { label: "hook.poolRegistered", expected: normalize(registered) },
  ];
}

async function canonicalBlockAt(providers: ProviderSet, number: number, rpc: RpcDeadlineSet): Promise<CanonicalPoint> {
  const [primary, secondary, fallback] = await rpc.all("getBlock", {
    primary: () => providers.primary.getBlock(number),
    secondary: () => providers.secondary.getBlock(number),
    fallback: () => providers.fallback.getBlock(number),
  });
  const blocks = [primary, secondary, fallback];
  if (blocks.some((block) => !block?.hash || /^0x0{64}$/i.test(block.hash))) throw new Error("RPC_BLOCK_MISSING");
  const hashes = new Set(blocks.map((block) => block!.hash!.toLowerCase()));
  if (hashes.size !== 1) throw new Error("RPC_BLOCK_HASH_DISAGREEMENT");
  return { number, hash: primary!.hash!, timestamp: primary!.timestamp };
}

export async function commonConfirmedPoint(
  providers: ProviderSet,
  confirmations: number,
  rpc: RpcDeadlineSet,
): Promise<CanonicalPoint> {
  const heads = await rpc.all("getBlockNumber", {
    primary: () => providers.primary.getBlockNumber(),
    secondary: () => providers.secondary.getBlockNumber(),
    fallback: () => providers.fallback.getBlockNumber(),
  });
  if (Math.max(...heads) - Math.min(...heads) > 12) throw new Error("RPC_HEAD_DISAGREEMENT");
  const number = Math.min(...heads) - confirmations + 1;
  if (number < 1) throw new Error("RPC_HEAD_TOO_LOW");
  return canonicalBlockAt(providers, number, rpc);
}

async function compareCall(
  contracts: readonly ethers.Contract[],
  method: string,
  args: readonly unknown[],
  blockTag: number,
  rpc: RpcDeadlineSet,
): Promise<unknown> {
  if (contracts.length !== 3) throw new Error("RPC_PROVIDER_COUNT_INVALID");
  const sources: RpcSource[] = ["primary", "secondary", "fallback"];
  const values = await allSettledOrThrow(contracts.map((contract, index) =>
    rpc.one(sources[index], `call.${method}`, () => contract.getFunction(method)(...args, { blockTag }))
  ));
  if (new Set(values.map(stable)).size !== 1) throw new Error(`RPC_CALL_DISAGREEMENT_${method.toUpperCase()}`);
  return values[0];
}

async function assertRuntime(
  provider: ethers.Provider,
  source: RpcSource,
  rpc: RpcDeadlineSet,
  target: string,
  expectedHash: string,
  blockTag: number,
  label: string,
): Promise<void> {
  const code = await rpc.one(source, `getCode.${label}`, () => provider.getCode(target, blockTag));
  if (code === "0x" || ethers.keccak256(code).toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(`${label.toUpperCase()}_RUNTIME_CHANGED`);
  }
}

function contracts(address: string, abi: readonly string[], providers: ProviderSet): ethers.Contract[] {
  return [providers.primary, providers.secondary, providers.fallback].map((provider) => new ethers.Contract(address, abi, provider));
}

function providerEntries(providers: ProviderSet): ReadonlyArray<readonly [RpcSource, ethers.Provider]> {
  return [
    ["primary", providers.primary],
    ["secondary", providers.secondary],
    ["fallback", providers.fallback],
  ];
}

function assertEqualBigints(values: readonly bigint[], errorCode: string): bigint {
  if (values.length !== 3 || new Set(values.map(String)).size !== 1) throw new Error(errorCode);
  return values[0];
}

function expectedUsdcDependency(
  production: ProductionV4Deployment,
  authorities: TreasuryRangeAuthorities,
  config: SettlerConfig,
): CircleFiatTokenDependencyEvidence {
  const monitoredAccounts = treasuryRangeUsdcMonitoredAccounts({
    treasuryRangeSafe: authorities.treasuryRangeSafe,
    poolManager: production.poolManager,
    positionManager: production.positionManager,
    permit2: production.permit2,
    liquidityVault: production.vault,
    liquidityCompounder: production.compounder,
    rangeManager: config.managerAddress,
  });
  return parseCircleFiatTokenDependencyEvidence({
    schemaVersion: CIRCLE_FIAT_TOKEN_DEPENDENCY_SCHEMA,
    mechanism: CIRCLE_FIAT_TOKEN_PROXY_MECHANISM,
    proxyAddress: production.base,
    implementationSlot: CIRCLE_FIAT_TOKEN_IMPLEMENTATION_SLOT,
    adminSlot: CIRCLE_FIAT_TOKEN_ADMIN_SLOT,
    readerAddress: BASE_MULTICALL3,
    readerRuntimeCodeHash: config.usdcDependency.readerRuntimeCodeHash,
    proxyRuntimeCodeHash: config.infrastructureRuntimeCodeHashes.usdc,
    implementationAddress: config.usdcDependency.implementationAddress,
    implementationRuntimeCodeHash: config.usdcDependency.implementationRuntimeCodeHash,
    admin: config.usdcDependency.admin,
    owner: config.usdcDependency.owner,
    pauser: config.usdcDependency.pauser,
    blacklister: config.usdcDependency.blacklister,
    paused: false,
    monitoredAccounts: Object.fromEntries(Object.entries(monitoredAccounts).map(([label, address]) => [label, {
      address,
      isBlacklisted: false,
    }])),
  });
}

export class Reconciler {
  readonly production: ProductionV4Deployment;
  readonly authorities: TreasuryRangeAuthorities;
  readonly runtimeGate: FatalRuntimeGate;
  readonly rpc: RpcDeadlineSet;

  constructor(
    readonly providers: ProviderSet,
    readonly config: SettlerConfig,
    production = canonicalProductionV4Deployment(),
    runtimeGate = new FatalRuntimeGate(),
  ) {
    this.production = production;
    this.authorities = canonicalTreasuryRangeAuthorities(production);
    this.runtimeGate = runtimeGate;
    this.rpc = new RpcDeadlineSet(runtimeGate, config.rpcRequestTimeoutMs);
  }

  commonConfirmedPoint(confirmations: number): Promise<CanonicalPoint> {
    return commonConfirmedPoint(this.providers, confirmations, this.rpc);
  }

  async assertBindings(point: CanonicalPoint): Promise<void> {
    if (point.number < this.config.deploymentBlock) throw new Error("MANAGER_DEPLOYMENT_BLOCK_NOT_REACHED");
    const networkIds = await this.rpc.all("getNetwork", {
      primary: () => this.providers.primary.getNetwork(),
      secondary: () => this.providers.secondary.getNetwork(),
      fallback: () => this.providers.fallback.getNetwork(),
    });
    if (networkIds.some((network) => network.chainId !== 8453n)) throw new Error("RPC_CHAIN_MISMATCH");
    const providers = providerEntries(this.providers);
    const runtimes: ReadonlyArray<[string, string, string]> = [
      ["manager", this.config.managerAddress, this.config.managerRuntimeCodeHash],
      ["hook", this.production.hook, this.production.runtimeCodeHashes.hook],
      ["nara", this.production.token, this.production.runtimeCodeHashes.token],
      ["vault", this.production.vault, this.production.runtimeCodeHashes.vault],
      ["compounder", this.production.compounder, this.production.runtimeCodeHashes.compounder],
      [
        "deployment_executor_safe",
        this.authorities.deploymentExecutorSafe,
        this.authorities.deploymentExecutorSafeRuntimeCodeHash,
      ],
      [
        "treasury_range_safe",
        this.authorities.treasuryRangeSafe,
        this.authorities.treasuryRangeSafeRuntimeCodeHash,
      ],
      ["usdc", this.production.base, this.config.infrastructureRuntimeCodeHashes.usdc],
      ["pool_manager", this.production.poolManager, this.config.infrastructureRuntimeCodeHashes.poolManager],
      ["position_manager", this.production.positionManager, this.config.infrastructureRuntimeCodeHashes.positionManager],
      ["permit2", this.production.permit2, this.config.infrastructureRuntimeCodeHashes.permit2],
    ];
    await allSettledOrThrow(runtimes.flatMap(([label, target, expectedHash]) =>
      providers.map(([source, provider]) => assertRuntime(provider, source, this.rpc, target, expectedHash, point.number, label))
    ));
    const deploymentExecutorSafeEvidence = await allSettledOrThrow(providers.map(([source, provider]) =>
      this.rpc.one(source, "deploymentExecutorSafe.policy", () => readCanonicalNaraSafeEvidence(
        provider,
        this.authorities.deploymentExecutorSafe,
        this.authorities.deploymentExecutorSafeRuntimeCodeHash,
        point.number,
      ))
    ));
    const treasuryRangeSafeEvidence = await allSettledOrThrow(providers.map(([source, provider]) =>
      this.rpc.one(source, "treasuryRangeSafe.policy", () => readTreasuryRangeSafeEvidence(provider, {
        address: this.authorities.treasuryRangeSafe,
        safeRuntimeCodeHash: this.authorities.treasuryRangeSafeRuntimeCodeHash,
        version: this.authorities.treasuryRangeSafeVersion,
        threshold: this.authorities.treasuryRangeSafeThreshold,
        ownerCount: this.authorities.treasuryRangeSafeOwnerCount,
        ownerSetHash: this.authorities.treasuryRangeSafeOwnerSetHash,
      }, point.number))
    ));
    if (new Set(deploymentExecutorSafeEvidence.map(stable)).size !== 1
        || new Set(treasuryRangeSafeEvidence.map(stable)).size !== 1
        || deploymentExecutorSafeEvidence[0].verifiedAtBlockHash.toLowerCase() !== point.hash.toLowerCase()
        || treasuryRangeSafeEvidence[0].verifiedAtBlockHash.toLowerCase() !== point.hash.toLowerCase()) {
      throw new Error("SAFE_POLICY_RPC_DISAGREEMENT");
    }
    const expectedUsdc = expectedUsdcDependency(this.production, this.authorities, this.config);
    const usdcDependencies = await allSettledOrThrow(providers.map(([source, provider]) =>
      readCircleFiatTokenDependency(
        provider,
        this.production.base,
        treasuryRangeUsdcMonitoredAccounts({
          treasuryRangeSafe: this.authorities.treasuryRangeSafe,
          poolManager: this.production.poolManager,
          positionManager: this.production.positionManager,
          permit2: this.production.permit2,
          liquidityVault: this.production.vault,
          liquidityCompounder: this.production.compounder,
          rangeManager: this.config.managerAddress,
        }),
        point.number,
        (operation, task) => this.rpc.one(source, `usdc.${operation}`, task),
      )
    ));
    if (new Set(usdcDependencies.map(stable)).size !== 1) throw new Error("USDC_DEPENDENCY_RPC_DISAGREEMENT");
    for (const actualUsdc of usdcDependencies) {
      assertCircleFiatTokenDependencyExact(expectedUsdc, actualUsdc);
    }
    const hookConfigurations = await allSettledOrThrow(providers.map(([source, provider]) =>
      readHookConfiguration(provider, source, this.rpc, this.production.hook, this.production.base, this.production.token, point.number)
    ));
    if (new Set(hookConfigurations.map(stable)).size !== 1) throw new Error("HOOK_CONFIGURATION_RPC_DISAGREEMENT");
    if (treasuryRangeHookConfigurationHash(hookConfigurations[0]) !== this.config.hookConfigurationHash) {
      throw new Error("HOOK_CONFIGURATION_CHANGED");
    }
    const managers = contracts(this.config.managerAddress, RANGE_MANAGER_ABI, this.providers);
    const expected: ReadonlyArray<[string, string | bigint | number]> = [
      ["NARA", this.production.token],
      ["USDC", this.production.base],
      ["TREASURY_SAFE", this.authorities.treasuryRangeSafe],
      ["LIQUIDITY_VAULT", this.production.vault],
      ["POOL_MANAGER", this.production.poolManager],
      ["POSITION_MANAGER", this.production.positionManager],
      ["PERMIT2", this.production.permit2],
      ["HOOK", this.production.hook],
      ["POOL_FEE", this.production.poolFee],
      ["TICK_SPACING", this.production.tickSpacing],
      ["POOL_ID", this.production.poolId],
      ["MAX_SETTLE_BATCH", 16],
    ];
    for (const [method, expectedValue] of expected) {
      const actual = await compareCall(managers, method, [], point.number, this.rpc);
      let matches: boolean;
      if (typeof expectedValue === "string" && ethers.isAddress(String(expectedValue))) {
        matches = ethers.getAddress(String(actual)) === ethers.getAddress(expectedValue);
      } else if (typeof expectedValue === "string") {
        matches = String(actual).toLowerCase() === String(expectedValue).toLowerCase();
      } else {
        matches = BigInt(actual as bigint) === BigInt(expectedValue);
      }
      if (!matches) {
        throw new Error(`${method}_BINDING_MISMATCH`);
      }
    }
    const positionManagers = contracts(this.production.positionManager, POSITION_MANAGER_ABI, this.providers);
    const [poolManager, permit2] = await allSettledOrThrow([
      compareCall(positionManagers, "poolManager", [], point.number, this.rpc),
      compareCall(positionManagers, "permit2", [], point.number, this.rpc),
    ]);
    sameAddress(String(poolManager), this.production.poolManager, "PositionManager.poolManager");
    sameAddress(String(permit2), this.production.permit2, "PositionManager.permit2");
  }

  async assertExactSettlementSimulation(rawTransaction: string, point: CanonicalPoint): Promise<void> {
    const transaction = ethers.Transaction.from(rawTransaction);
    if (!transaction.from || !transaction.to || ethers.getAddress(transaction.to) !== this.config.managerAddress ||
        transaction.chainId !== 8453n || transaction.value !== 0n) {
      throw new Error("PENDING_REBROADCAST_TRANSACTION_BINDING_MISMATCH");
    }
    const providers = providerEntries(this.providers);
    const results = await allSettledOrThrow(providers.map(([source, provider]) =>
      this.rpc.one(source, "call.pendingExactRebroadcast", () => provider.call({
        from: transaction.from!,
        to: transaction.to!,
        data: transaction.data,
        value: transaction.value,
        blockTag: point.number,
      }))
    ));
    if (new Set(results.map((result) => result.toLowerCase())).size !== 1) {
      throw new Error("RPC_PENDING_REBROADCAST_SIMULATION_DISAGREEMENT");
    }
  }

  async sweep(point?: CanonicalPoint): Promise<SweepSnapshot> {
    // Writes are triggered from the newest block all three independent providers
    // agree on; configured confirmations apply to the mined receipt, not detection.
    const canonical = point ?? await this.commonConfirmedPoint(1);
    await this.assertBindings(canonical);
    const managers = contracts(this.config.managerAddress, RANGE_MANAGER_ABI, this.providers);
    const total = BigInt(await compareCall(managers, "activeOrderCount", [], canonical.number, this.rpc) as bigint);
    const maximum = BigInt(this.config.maxPageSize * this.config.maxPages);
    if (total > maximum) throw new Error("ACTIVE_ORDER_BOUND_EXCEEDED");
    const ids: bigint[] = [];
    let offset = 0n;
    for (let page = 0; page < this.config.maxPages && offset < total; page += 1) {
      const result = await compareCall(managers, "getActiveOrderIds", [offset, this.config.maxPageSize], canonical.number, this.rpc) as ethers.Result;
      const pageIds = (result[0] as bigint[]).map(BigInt);
      const nextOffset = BigInt(result[1]);
      if (pageIds.length === 0 || nextOffset <= offset) throw new Error("ACTIVE_ORDER_PAGINATION_STALLED");
      ids.push(...pageIds);
      offset = nextOffset;
    }
    if (BigInt(ids.length) !== total) throw new Error("ACTIVE_ORDER_PAGINATION_INCOMPLETE");
    if (new Set(ids.map(String)).size !== ids.length) throw new Error("DUPLICATE_ACTIVE_ORDER_ID");
    const orders: RangeOrderSnapshot[] = [];
    const settleableOrderIds: bigint[] = [];
    const positionManagers = contracts(this.production.positionManager, POSITION_MANAGER_ABI, this.providers);
    for (const orderId of ids) {
      const raw = await compareCall(managers, "getOrder", [orderId], canonical.number, this.rpc) as ethers.Result;
      const order = decodeOrder(orderId, raw);
      if (order.status !== 1 || order.liquidity === 0n) throw new Error("ACTIVE_ORDER_STATE_MISMATCH");
      const [owner, liquidity, settleable] = await allSettledOrThrow([
        compareCall(positionManagers, "ownerOf", [order.tokenId], canonical.number, this.rpc),
        compareCall(positionManagers, "getPositionLiquidity", [order.tokenId], canonical.number, this.rpc),
        compareCall(managers, "isSettleable", [orderId], canonical.number, this.rpc),
      ]);
      sameAddress(String(owner), this.config.managerAddress, "active order NFT owner");
      if (BigInt(liquidity as bigint) !== order.liquidity) throw new Error("ACTIVE_ORDER_LIQUIDITY_MISMATCH");
      orders.push(order);
      if (settleable === true) settleableOrderIds.push(orderId);
    }
    const naraContracts = contracts(this.production.token, ERC20_ABI, this.providers);
    const usdcContracts = contracts(this.production.base, ERC20_ABI, this.providers);
    const permit2Contracts = contracts(this.production.permit2, PERMIT2_ABI, this.providers);
    const [
      managerNftBalance,
      treasuryRangeSafeNaraBalance,
      treasuryRangeSafeUsdcBalance,
      managerNaraBalance,
      managerUsdcBalance,
      treasuryRangeSafeNaraAllowance,
      treasuryRangeSafeUsdcAllowance,
      managerNaraPermit2Allowance,
      managerUsdcPermit2Allowance,
      permit2Nara,
      permit2Usdc,
    ] = await allSettledOrThrow([
      compareCall(positionManagers, "balanceOf", [this.config.managerAddress], canonical.number, this.rpc),
      compareCall(naraContracts, "balanceOf", [this.authorities.treasuryRangeSafe], canonical.number, this.rpc),
      compareCall(usdcContracts, "balanceOf", [this.authorities.treasuryRangeSafe], canonical.number, this.rpc),
      compareCall(naraContracts, "balanceOf", [this.config.managerAddress], canonical.number, this.rpc),
      compareCall(usdcContracts, "balanceOf", [this.config.managerAddress], canonical.number, this.rpc),
      compareCall(naraContracts, "allowance", [this.authorities.treasuryRangeSafe, this.config.managerAddress], canonical.number, this.rpc),
      compareCall(usdcContracts, "allowance", [this.authorities.treasuryRangeSafe, this.config.managerAddress], canonical.number, this.rpc),
      compareCall(naraContracts, "allowance", [this.config.managerAddress, this.production.permit2], canonical.number, this.rpc),
      compareCall(usdcContracts, "allowance", [this.config.managerAddress, this.production.permit2], canonical.number, this.rpc),
      compareCall(permit2Contracts, "allowance", [this.config.managerAddress, this.production.token, this.production.positionManager], canonical.number, this.rpc),
      compareCall(permit2Contracts, "allowance", [this.config.managerAddress, this.production.base, this.production.positionManager], canonical.number, this.rpc),
    ]);
    const allowances = [
      BigInt(treasuryRangeSafeNaraAllowance as bigint), BigInt(treasuryRangeSafeUsdcAllowance as bigint),
      BigInt(managerNaraPermit2Allowance as bigint), BigInt(managerUsdcPermit2Allowance as bigint),
      BigInt((permit2Nara as ethers.Result)[0]), BigInt((permit2Usdc as ethers.Result)[0]),
    ];
    if (allowances.some((allowance) => allowance !== 0n)) throw new Error("MANAGER_RESIDUAL_ALLOWANCE");
    const unknownPositionCount = BigInt(managerNftBalance as bigint) - BigInt(orders.length);
    if (unknownPositionCount < 0n) throw new Error("MANAGER_NFT_ACCOUNTING_UNDERFLOW");
    return {
      point: canonical,
      activeOrders: orders,
      settleableOrderIds,
      treasuryRangeSafeNaraBalance: BigInt(treasuryRangeSafeNaraBalance as bigint),
      treasuryRangeSafeUsdcBalance: BigInt(treasuryRangeSafeUsdcBalance as bigint),
      unknownPositionCount,
      allowanceClean: true,
      managerNaraBalance: BigInt(managerNaraBalance as bigint),
      managerUsdcBalance: BigInt(managerUsdcBalance as bigint),
    };
  }

  async receiptConsensus(transactionHash: string): Promise<ReceiptConsensus> {
    const receipts = await this.rpc.all("getTransactionReceipt", {
      primary: () => this.providers.primary.getTransactionReceipt(transactionHash),
      secondary: () => this.providers.secondary.getTransactionReceipt(transactionHash),
      fallback: () => this.providers.fallback.getTransactionReceipt(transactionHash),
    });
    const present = receipts.filter((receipt): receipt is ethers.TransactionReceipt => receipt !== null);
    if (present.length === 0) return { state: "absent" };
    if (present.length !== 3) return { state: "partial" };
    const normalized = present.map((receipt) => ({
      hash: receipt.hash.toLowerCase(),
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash.toLowerCase(),
      logs: receipt.logs.map((log) => ({
        address: ethers.getAddress(log.address),
        topics: log.topics.map((topic) => topic.toLowerCase()),
        data: log.data.toLowerCase(),
        index: log.index,
      })),
    }));
    if (new Set(normalized.map(stable)).size !== 1) throw new Error("RPC_RECEIPT_DISAGREEMENT");
    return { state: "agreed", receipt: present[0] };
  }

  async receiptConfirmed(receipt: ethers.TransactionReceipt): Promise<boolean> {
    const heads = await this.rpc.all("getBlockNumber.receiptConfirmed", {
      primary: () => this.providers.primary.getBlockNumber(),
      secondary: () => this.providers.secondary.getBlockNumber(),
      fallback: () => this.providers.fallback.getBlockNumber(),
    });
    if (Math.max(...heads) - Math.min(...heads) > 12) throw new Error("RPC_HEAD_DISAGREEMENT");
    return Math.min(...heads) >= receipt.blockNumber + this.config.confirmations - 1;
  }

  async assertSettlementTransaction(
    transactionHash: string,
    wallet: string,
    nonce: number,
    orderIds: readonly bigint[],
  ): Promise<void> {
    const transactions = await this.rpc.all("getTransaction.settlement", {
      primary: () => this.providers.primary.getTransaction(transactionHash),
      secondary: () => this.providers.secondary.getTransaction(transactionHash),
      fallback: () => this.providers.fallback.getTransaction(transactionHash),
    });
    if (transactions.some((transaction) => transaction === null)) {
      throw new Error("SETTLEMENT_TRANSACTION_NOT_RECONCILED_BY_ALL_RPCS");
    }
    const present = transactions as ethers.TransactionResponse[];
    const normalized = present.map((transaction) => ({
      hash: transaction.hash.toLowerCase(),
      from: ethers.getAddress(transaction.from),
      to: ethers.getAddress(transaction.to ?? ethers.ZeroAddress),
      nonce: transaction.nonce,
      value: transaction.value.toString(),
      data: transaction.data.toLowerCase(),
      chainId: transaction.chainId.toString(),
      blockNumber: transaction.blockNumber,
      blockHash: transaction.blockHash?.toLowerCase() ?? null,
    }));
    if (new Set(normalized.map(stable)).size !== 1) throw new Error("RPC_SETTLEMENT_TRANSACTION_DISAGREEMENT");
    const transaction = present[0];
    if (transaction.hash.toLowerCase() !== transactionHash.toLowerCase() ||
        ethers.getAddress(transaction.from) !== ethers.getAddress(wallet) ||
        ethers.getAddress(transaction.to ?? ethers.ZeroAddress) !== this.config.managerAddress ||
        transaction.nonce !== nonce || transaction.value !== 0n || transaction.chainId !== 8453n) {
      throw new Error("SETTLEMENT_TRANSACTION_BINDING_MISMATCH");
    }
    const parsed = RANGE_INTERFACE.parseTransaction({ data: transaction.data, value: transaction.value });
    if (!parsed || parsed.name !== "settleMany") throw new Error("SETTLEMENT_TRANSACTION_CALL_MISMATCH");
    const actualOrderIds = (parsed.args[0] as bigint[]).map((value) => BigInt(value));
    if (stable(actualOrderIds) !== stable(orderIds)) throw new Error("SETTLEMENT_TRANSACTION_ORDER_SET_MISMATCH");
  }

  async absentTransactionDisposition(transactionHash: string, wallet: string, nonce: number): Promise<"pending" | "dropped" | "nonce_consumed"> {
    const [transactionsRaw, latestNoncesRaw, pendingNoncesRaw] = await allSettledOrThrow<unknown>([
      this.rpc.all("getTransaction.absent", {
        primary: () => this.providers.primary.getTransaction(transactionHash),
        secondary: () => this.providers.secondary.getTransaction(transactionHash),
        fallback: () => this.providers.fallback.getTransaction(transactionHash),
      }),
      this.rpc.all("getTransactionCount.latest", {
        primary: () => this.providers.primary.getTransactionCount(wallet, "latest"),
        secondary: () => this.providers.secondary.getTransactionCount(wallet, "latest"),
        fallback: () => this.providers.fallback.getTransactionCount(wallet, "latest"),
      }),
      this.rpc.all("getTransactionCount.pending", {
        primary: () => this.providers.primary.getTransactionCount(wallet, "pending"),
        secondary: () => this.providers.secondary.getTransactionCount(wallet, "pending"),
        fallback: () => this.providers.fallback.getTransactionCount(wallet, "pending"),
      }),
    ]);
    const transactions = transactionsRaw as Array<ethers.TransactionResponse | null>;
    const latestNonces = latestNoncesRaw as number[];
    const pendingNonces = pendingNoncesRaw as number[];
    if (transactions.some((transaction) => transaction !== null)) return "pending";
    const latest = Number(assertEqualBigints(latestNonces.map((value) => BigInt(value)), "RPC_LATEST_NONCE_DISAGREEMENT"));
    const pending = Number(assertEqualBigints(pendingNonces.map((value) => BigInt(value)), "RPC_PENDING_NONCE_DISAGREEMENT"));
    if (latest > nonce) return "nonce_consumed";
    if (latest < nonce || pending > nonce) return "pending";
    if (latest === nonce && pending === nonce) return "dropped";
    return "pending";
  }

  async nextWriteNonce(wallet: string): Promise<number> {
    const [latestNoncesRaw, pendingNoncesRaw] = await allSettledOrThrow<unknown>([
      this.rpc.all("getTransactionCount.latest", {
        primary: () => this.providers.primary.getTransactionCount(wallet, "latest"),
        secondary: () => this.providers.secondary.getTransactionCount(wallet, "latest"),
        fallback: () => this.providers.fallback.getTransactionCount(wallet, "latest"),
      }),
      this.rpc.all("getTransactionCount.pending", {
        primary: () => this.providers.primary.getTransactionCount(wallet, "pending"),
        secondary: () => this.providers.secondary.getTransactionCount(wallet, "pending"),
        fallback: () => this.providers.fallback.getTransactionCount(wallet, "pending"),
      }),
    ]);
    const latestNonces = latestNoncesRaw as number[];
    const pendingNonces = pendingNoncesRaw as number[];
    const latest = Number(assertEqualBigints(latestNonces.map((value) => BigInt(value)), "RPC_LATEST_NONCE_DISAGREEMENT"));
    const pending = Number(assertEqualBigints(pendingNonces.map((value) => BigInt(value)), "RPC_PENDING_NONCE_DISAGREEMENT"));
    if (pending !== latest) throw new Error("SETTLER_ACCOUNT_HAS_PENDING_NONCE");
    return latest;
  }

  async reconcileReceipt(receipt: ethers.TransactionReceipt, expectedOrderIds: readonly bigint[]): Promise<SettlementEvidence> {
    const consensus = await this.receiptConsensus(receipt.hash);
    if (consensus.state !== "agreed" || !consensus.receipt) throw new Error("SETTLEMENT_RECEIPT_NOT_RECONCILED_BY_ALL_RPCS");
    receipt = consensus.receipt;
    if (receipt.status !== 1) throw new Error("SETTLEMENT_RECEIPT_REVERTED");
    const point = await canonicalBlockAt(this.providers, receipt.blockNumber, this.rpc);
    if (point.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("SETTLEMENT_RECEIPT_REORGED");
    const settlements: Array<{ orderId: bigint; tokenId: bigint; strategyHash: string; naraOut: bigint; usdcOut: bigint }> = [];
    for (const log of receipt.logs) {
      if (ethers.getAddress(log.address) !== this.config.managerAddress) continue;
      try {
        const parsed = RANGE_INTERFACE.parseLog(log);
        if (parsed?.name === "OrderSettled") settlements.push({
          orderId: BigInt(parsed.args.orderId),
          tokenId: BigInt(parsed.args.tokenId),
          strategyHash: String(parsed.args.strategyHash).toLowerCase(),
          naraOut: BigInt(parsed.args.naraOut),
          usdcOut: BigInt(parsed.args.usdcOut),
        });
      } catch { /* unrelated manager log */ }
    }
    const actualIds = settlements.map((item) => item.orderId).sort((a, b) => a < b ? -1 : 1);
    const expectedIds = [...expectedOrderIds].sort((a, b) => a < b ? -1 : 1);
    if (stable(actualIds) !== stable(expectedIds)) throw new Error("SETTLEMENT_EVENT_ORDER_SET_MISMATCH");
    const naraOut = settlements.reduce((sum, item) => sum + item.naraOut, 0n);
    const usdcOut = settlements.reduce((sum, item) => sum + item.usdcOut, 0n);
    let naraTransfers = 0n;
    let usdcTransfers = 0n;
    for (const log of receipt.logs) {
      const address = ethers.getAddress(log.address);
      if (address !== this.production.token && address !== this.production.base) continue;
      try {
        const transfer = TRANSFER_INTERFACE.parseLog(log);
        if (transfer?.name === "Transfer"
            && ethers.getAddress(transfer.args.to) === this.authorities.treasuryRangeSafe) {
          if (address === this.production.token) naraTransfers += BigInt(transfer.args.value);
          else usdcTransfers += BigInt(transfer.args.value);
        }
      } catch { /* unrelated token log */ }
    }
    if (naraTransfers !== naraOut || usdcTransfers !== usdcOut) throw new Error("SAFE_BALANCE_DELTA_MISMATCH");
    const managers = contracts(this.config.managerAddress, RANGE_MANAGER_ABI, this.providers);
    const positionManagers = contracts(this.production.positionManager, POSITION_MANAGER_ABI, this.providers);
    for (const settlement of settlements) {
      const order = decodeOrder(
        settlement.orderId,
        await compareCall(managers, "getOrder", [settlement.orderId], receipt.blockNumber, this.rpc) as ethers.Result,
      );
      if (order.status !== 2 || order.terminalBlock !== BigInt(receipt.blockNumber) ||
          order.tokenId !== settlement.tokenId || order.strategyHash !== settlement.strategyHash) {
        throw new Error("SETTLED_ORDER_RECEIPT_STATE_MISMATCH");
      }
      const liquidity = await compareCall(positionManagers, "getPositionLiquidity", [settlement.tokenId], receipt.blockNumber, this.rpc);
      if (BigInt(liquidity as bigint) !== 0n) throw new Error("SETTLED_POSITION_STILL_HAS_LIQUIDITY");
      const sources: RpcSource[] = ["primary", "secondary", "fallback"];
      const ownerResults = await Promise.allSettled(positionManagers.map((positionManager, index) =>
        this.rpc.one(sources[index], "call.ownerOf.burnProof", () =>
          positionManager.ownerOf(settlement.tokenId, { blockTag: receipt.blockNumber })
        )
      ));
      const fatalOwnerFailure = ownerResults.find((result): result is PromiseRejectedResult =>
        result.status === "rejected" && isFatalRuntimeError(result.reason)
      );
      if (fatalOwnerFailure) throw fatalOwnerFailure.reason;
      if (!hasIndependentBurnOwnershipProof(ownerResults)) {
        if (ownerResults.some((result) => result.status === "fulfilled")) throw new Error("SETTLED_POSITION_NFT_NOT_BURNED");
        throw new Error("SETTLED_POSITION_OWNER_PROOF_UNAVAILABLE");
      }
    }
    return { receiptBlock: point, transactionHash: receipt.hash, orderIds: expectedIds, naraOut, usdcOut };
  }

  async allOrdersTerminal(orderIds: readonly bigint[], blockTag: number | "latest" = "latest"): Promise<boolean> {
    return (await this.terminalOutcome(orderIds, blockTag)) !== "active";
  }

  async terminalOutcome(orderIds: readonly bigint[], blockTag: number | "latest" = "latest"): Promise<TerminalOutcome> {
    const managers = contracts(this.config.managerAddress, RANGE_MANAGER_ABI, this.providers);
    const sources: RpcSource[] = ["primary", "secondary", "fallback"];
    const states = await allSettledOrThrow(orderIds.map(async (orderId) => {
      const values = await allSettledOrThrow(managers.map((manager, index) =>
        this.rpc.one(sources[index], "call.getOrder.terminal", () => manager.getOrder(orderId, { blockTag }))
      ));
      const decoded = values.map((value) => decodeOrder(orderId, value).status);
      if (new Set(decoded).size !== 1) throw new Error("RPC_TERMINAL_STATE_DISAGREEMENT");
      return decoded[0];
    }));
    return terminalOutcomeFromStatuses(states);
  }
}
