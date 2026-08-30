/**
 * Exact, read-only-by-default NARA treasury range simulation entrypoint.
 *
 * Execution is refused unless Hardhat is connected to the block-pinned
 * `baseFork` network. Fork mutations use impersonation only inside that local
 * EVM and are never signed or broadcast to Base.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { ethers } from "ethers";
import hre from "hardhat";
import {
  canonicalProductionV4Deployment,
  deriveV4PoolKey,
  type ProductionV4Deployment,
} from "./lib/v4LiveConfig.js";
import {
  formatRational,
  parseDecimalRational,
  rational,
  sqrtPriceX96ToHumanUsdcPerNara,
} from "./lib/v4TreasuryRangeMath.js";
import {
  BPS,
  NARA_UNIT,
  USDC_UNIT,
  buildDeterministicStrategyProfiles,
  serializePlannedRange,
  stampStrategyHash,
  type PlannedStrategyProfile,
} from "./lib/v4TreasuryRangePlanner.js";
import {
  BASE_STATE_VIEW,
  BASE_V4_QUOTER,
  jsonSafeState,
  readV4TreasuryRangeState,
  type FeeCurveState,
  type ManagerOrderState,
  type V4TreasuryRangeState,
} from "./lib/v4TreasuryRangeState.js";
import {
  UNIVERSAL_ROUTER_ABI,
  buildV4ExactInputCall,
  exactEffectiveBps,
  exactLpFeeAmount,
  parseV4SwapReceipt,
} from "./lib/v4TreasuryRangeSwap.js";
import {
  treasuryRangeStrategyHash as opsTreasuryRangeStrategyHash,
  type TreasuryRangeStrategyManifest as OpsTreasuryRangeStrategyManifest,
} from "./lib/v4TreasuryRangeManifest.js";
import {
  REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS,
  REQUIRED_TREASURY_BUY_SIZES_USDC,
  REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA,
} from "./lib/v4TreasuryRangeEvidence.js";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function transfer(address to,uint256 amount) returns (bool)",
] as const;
const PERMIT2_ABI = [
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
] as const;
const STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
] as const;
const QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
] as const;

export const PINNED_USDC_ADVERSARY = Object.freeze({
  address: "0xf70da97812CB96acDF810712Aa562db8dfA3dbEF",
  blockNumber: 50_537_172n,
  balanceRaw: 3_608_364_062_214n,
  runtimeCode: "0x",
});

export const REQUIRED_BUY_SIZES_USDC = REQUIRED_TREASURY_BUY_SIZES_USDC;
export const REQUIRED_INDEPENDENT_SELL_SIZES_NARA = REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA;
export const REQUIRED_ACQUIRED_SELL_FRACTIONS_BPS = REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS;

export const SCENARIO_MATRIX = [
  { id: "A", description: "one single exact-input buy", settlementWindow: false, atomic: false },
  { id: "B", description: "multiple buy transactions mined in the same Base block", settlementWindow: false, atomic: false },
  { id: "C", description: "multiple swap actions in one Universal Router transaction", settlementWindow: false, atomic: true },
  { id: "D", description: "identical buys split across different blocks", settlementWindow: true, atomic: false },
  { id: "E", description: "buy transaction, manager settlement transaction, sell transaction", settlementWindow: true, atomic: false },
  { id: "F", description: "buy and reverse inside one actor-controlled atomic transaction", settlementWindow: false, atomic: true },
  { id: "G", description: "buy, no manager settlement, then reverse", settlementWindow: true, atomic: false },
  { id: "H", description: "buy, settle fully crossed ranges, then reverse", settlementWindow: true, atomic: false },
] as const;

export type ExactForkSwapResult = Readonly<{
  status: "executed" | "reverted";
  revertReason?: string;
  transactionHash?: string;
  blockNumber?: bigint;
  grossInput: bigint;
  quotedOutput: bigint;
  actualOutput: bigint;
  hookFee: bigint;
  effectiveHookFeeBps: bigint;
  lpFee: bigint;
  netAmmInput: bigint;
  startSqrtPriceX96: bigint;
  endSqrtPriceX96: bigint;
  startTick: bigint;
  endTick: bigint;
  startHumanUsdcPerNara: string;
  endHumanUsdcPerNara: string;
  averageExecutionPrice: Readonly<{ numerator: bigint; denominator: bigint }>;
  gasUsed: bigint;
  traderNaraDelta: bigint;
  traderUsdcDelta: bigint;
  vaultNaraDelta: bigint;
  vaultUsdcDelta: bigint;
  swapEvents: ReturnType<typeof parseV4SwapReceipt>["swaps"];
  hookEvents: ReturnType<typeof parseV4SwapReceipt>["hookFees"];
}>;

export type TreasuryRangeScenarioPlan = Readonly<{
  pinnedBlock: bigint;
  blockHash: string;
  profiles: readonly PlannedStrategyProfile[];
  manifests: readonly TreasuryRangeStrategyManifest[];
  hookConfiguration: Readonly<Record<string, unknown>>;
  hookConfigurationHash: string;
  hardFundingGate: Readonly<{
    immutableOrderCreator: string;
    nominalUsdcBudget: bigint;
    safeUsdcBalance: bigint;
    treasuryUsdcBalance: bigint;
    safeNominalUsdcShortfall: bigint;
    treasuryNominalUsdcShortfall: bigint;
    safeNaraBalance: bigint;
    treasuryNaraBalance: bigint;
    executionBlockedUntilSafeFunded: boolean;
  }>;
}>;

export type TreasuryRangeStrategyManifestBody = Readonly<{
  schemaVersion: string;
  status: string;
  changeId: string;
  repositoryHead: string;
  pinnedState: Readonly<Record<string, unknown>>;
  addresses: Readonly<Record<string, unknown>>;
  runtimeCodeHashes: Readonly<Record<string, string>>;
  externalDependencies: Readonly<Record<string, unknown>>;
  poolId: string;
  poolKey: Readonly<Record<string, unknown>>;
  currentSlot0: Readonly<Record<string, unknown>>;
  hookConfiguration: Readonly<Record<string, unknown>>;
  hookConfigurationHash: string;
  pendingHookConfiguration: Readonly<Record<string, unknown>> | null;
  existingPositions: readonly Readonly<Record<string, unknown>>[];
  proposedOrders: readonly Readonly<Record<string, unknown>>[];
  budget: Readonly<Record<string, unknown>>;
  simulationMatrix: readonly Readonly<Record<string, unknown>>[];
  managerDeployment?: Readonly<Record<string, unknown>>;
  noBroadcast: boolean;
}>;

export type TreasuryRangeStrategyManifest = TreasuryRangeStrategyManifestBody & Readonly<{
  strategyHash: string;
}>;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Canonical JSON numbers must be safe integers");
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error(`Unsupported canonical JSON value: ${typeof value}`);
}

export function treasuryRangeStrategyHash(manifest: TreasuryRangeStrategyManifestBody): string {
  if (Object.prototype.hasOwnProperty.call(manifest, "strategyHash")) {
    throw new Error("Strategy hash input must exclude only the top-level strategyHash field");
  }
  return opsTreasuryRangeStrategyHash(
    manifest as unknown as Omit<OpsTreasuryRangeStrategyManifest, "strategyHash">,
  );
}

export function currentRepositoryHead(): string {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error("Repository HEAD is not a full 40-character Git commit");
  return head;
}

export function pinnedHookConfiguration(state: V4TreasuryRangeState): Readonly<Record<string, unknown>> {
  const hook = state.poolKey.hooks;
  const curve = (value: FeeCurveState) => [
    value.mediumPressureBps, value.highPressureBps, value.extremePressureBps,
    value.baseFeeBps, value.mediumFeeBps, value.highFeeBps, value.extremeFeeBps, value.maxFeeBps,
  ].map(String);
  const pendingCurve = (value: V4TreasuryRangeState["pendingBuyCurve"]) => [
    curve(value.value), value.eta.toString(), value.exists,
  ];
  const pendingDepth = (value: V4TreasuryRangeState["pendingProtocolDepthNara"]) => [
    value.value.toString(), value.eta.toString(), value.exists,
  ];
  return {
    readChecks: [
      { label: "hook.buyCurve", target: hook, method: "buyCurve", args: [], expected: curve(state.buyCurve) },
      { label: "hook.sellCurve", target: hook, method: "sellCurve", args: [], expected: curve(state.sellCurve) },
      { label: "hook.protocolDepth.usdc", target: hook, method: "protocolDepth", args: [state.poolKey.currency0], expected: state.protocolDepthUsdc.toString() },
      { label: "hook.protocolDepth.nara", target: hook, method: "protocolDepth", args: [state.poolKey.currency1], expected: state.protocolDepthNara.toString() },
      { label: "hook.pendingBuyCurve", target: hook, method: "pendingBuyCurve", args: [], expected: pendingCurve(state.pendingBuyCurve) },
      { label: "hook.pendingSellCurve", target: hook, method: "pendingSellCurve", args: [], expected: pendingCurve(state.pendingSellCurve) },
      { label: "hook.pendingProtocolDepth.usdc", target: hook, method: "pendingProtocolDepth", args: [state.poolKey.currency0], expected: pendingDepth(state.pendingProtocolDepthUsdc) },
      { label: "hook.pendingProtocolDepth.nara", target: hook, method: "pendingProtocolDepth", args: [state.poolKey.currency1], expected: pendingDepth(state.pendingProtocolDepthNara) },
      { label: "hook.registeredPoolId", target: hook, method: "registeredPoolId", args: [], expected: state.poolId },
      { label: "hook.poolRegistered", target: hook, method: "poolRegistered", args: [], expected: state.poolRegistered },
    ],
  };
}

export function hookConfigurationHash(configuration: Readonly<Record<string, unknown>>): string {
  const readChecks = configuration.readChecks;
  if (!Array.isArray(readChecks) || readChecks.length !== 10) {
    throw new Error("hookConfiguration must contain exactly 10 readChecks");
  }
  const hashPayload = readChecks.map((entry) => {
    const value = entry as Record<string, unknown>;
    return { label: value.label, expected: value.expected };
  }).sort((left, right) => String(left.label).localeCompare(String(right.label)));
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(hashPayload))).toLowerCase();
}

function positiveDecimalToUnits(raw: string, decimals: bigint): bigint {
  const value = parseDecimalRational(raw);
  const scaled = value.numerator * 10n ** decimals;
  if (scaled % value.denominator !== 0n || scaled <= 0n) {
    throw new Error(`Amount ${raw} cannot be represented exactly with ${decimals} decimals`);
  }
  return scaled / value.denominator;
}

function shortfall(required: bigint, available: bigint): bigint {
  return required > available ? required - available : 0n;
}

function exactJsonNumber(value: bigint, label: string): number {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} cannot be represented as an exact JSON number`);
  }
  return Number(value);
}

function strategyChangeId(profile: PlannedStrategyProfile): string {
  return `NARA-20260828-v4-treasury-ranges-${profile.name.toLowerCase()}-${profile.totalNaraInput / NARA_UNIT}-nara`;
}

function proposedOrders(profile: PlannedStrategyProfile): readonly Readonly<Record<string, unknown>>[] {
  return profile.orders.map((order) => ({
    side: order.side,
    humanPriceLower: formatRational(order.requestedLowerUsdcPerNara, 18),
    humanPriceUpper: formatRational(order.requestedUpperUsdcPerNara, 18),
    tickLower: exactJsonNumber(order.tickLower, "order.tickLower"),
    tickUpper: exactJsonNumber(order.tickUpper, "order.tickUpper"),
    inputAmountRaw: order.inputAmount.toString(),
    expectedOutputAmountRaw: order.expectedPrincipalOutput.toString(),
    minimumOutputAmountRaw: order.minimumOutputAmount.toString(),
    expectedLiquidity: order.expectedLiquidity.toString(),
    expectedDustNaraRaw: (order.side === "SELL_NARA" ? order.expectedRoundingDust : 0n).toString(),
    expectedDustUsdcRaw: (order.side === "BUY_NARA" ? order.expectedRoundingDust : 0n).toString(),
    toleranceBps: exactJsonNumber(order.toleranceBps, "order.toleranceBps"),
    enabled: true,
  }));
}

function manifestBody(params: {
  state: V4TreasuryRangeState;
  profile: PlannedStrategyProfile;
  hookConfiguration: Readonly<Record<string, unknown>>;
  hookConfigurationHash: string;
  repositoryHead: string;
  deployment?: ProductionV4Deployment;
  managerDeployment?: Readonly<Record<string, unknown>>;
  simulationEvidence?: Readonly<{
    scenarioCoverage?: readonly string[];
    matrix?: readonly Readonly<Record<string, unknown>>[];
  }>;
}): TreasuryRangeStrategyManifestBody {
  if (!/^[0-9a-fA-F]{40}$/.test(params.repositoryHead)) {
    throw new Error("repositoryHead must be a full 40-character Git commit");
  }
  if (!params.state.positionReconciliation.exact) {
    throw new Error("Cannot build a strategy manifest from inexact position state");
  }
  const deployment = params.deployment ?? canonicalProductionV4Deployment();
  const activePositions = params.state.positionReconciliation.activePositions.map((position) => ({
    owner: position.owner,
    tickLower: position.tickLower.toString(),
    tickUpper: position.tickUpper.toString(),
    salt: position.salt,
    positionId: position.positionId,
    liquidity: position.liquidity.toString(),
    activeAtPinnedTick: position.activeAtPinnedTick,
    ...(position.positionManagerTokenId === undefined
      ? {} : { positionManagerTokenId: position.positionManagerTokenId.toString() }),
    ...(position.nftOwner === undefined ? {} : { nftOwner: position.nftOwner }),
  }));
  const body: TreasuryRangeStrategyManifestBody = {
    schemaVersion: "nara.v4.treasury-range-strategy.v2",
    status: "candidate_no_broadcast",
    changeId: strategyChangeId(params.profile),
    repositoryHead: params.repositoryHead.toLowerCase(),
    pinnedState: {
      chainId: params.state.chainId.toString(),
      blockNumber: exactJsonNumber(params.state.blockNumber, "pinnedState.blockNumber"),
      blockHash: params.state.blockHash,
      timestamp: exactJsonNumber(params.state.timestamp, "pinnedState.timestamp"),
    },
    addresses: {
      safe: deployment.safe,
      nara: deployment.token,
      usdc: deployment.base,
      liquidityVault: deployment.vault,
      liquidityCompounder: deployment.compounder,
      hook: deployment.hook,
      poolManager: deployment.poolManager,
      positionManager: deployment.positionManager,
      permit2: deployment.permit2,
      universalRouter: deployment.universalRouter,
      officialV4Quoter: BASE_V4_QUOTER,
      create2HookDeployer: deployment.create2HookDeployer,
      stateView: params.state.stateView,
      treasury: deployment.treasury,
      ...(params.state.manager.address === undefined ? {} : { treasuryRangeManager: params.state.manager.address }),
    },
    runtimeCodeHashes: {
      nara: params.state.runtimeCodeHashes.token,
      usdc: params.state.runtimeCodeHashes.usdc,
      hook: params.state.runtimeCodeHashes.hook,
      safe: params.state.runtimeCodeHashes.safe,
      liquidityVault: params.state.runtimeCodeHashes.vault,
      liquidityCompounder: params.state.runtimeCodeHashes.compounder,
      poolManager: params.state.runtimeCodeHashes.poolManager,
      positionManager: params.state.runtimeCodeHashes.positionManager,
      permit2: params.state.runtimeCodeHashes.permit2,
      universalRouter: params.state.runtimeCodeHashes.universalRouter,
      officialV4Quoter: params.state.runtimeCodeHashes.quoter,
      create2HookDeployer: params.state.runtimeCodeHashes.create2HookDeployer,
      stateView: params.state.runtimeCodeHashes.stateView,
      ...(params.state.runtimeCodeHashes.manager === undefined
        ? {} : { rangeManager: params.state.runtimeCodeHashes.manager }),
    },
    externalDependencies: {
      usdc: params.state.externalDependencies.usdc,
    },
    poolId: params.state.poolId,
    poolKey: {
      currency0: params.state.poolKey.currency0,
      currency1: params.state.poolKey.currency1,
      fee: exactJsonNumber(params.state.poolKey.fee, "poolKey.fee"),
      tickSpacing: exactJsonNumber(params.state.poolKey.tickSpacing, "poolKey.tickSpacing"),
      hooks: params.state.poolKey.hooks,
    },
    currentSlot0: {
      sqrtPriceX96: params.state.sqrtPriceX96.toString(),
      tick: exactJsonNumber(params.state.tick, "currentSlot0.tick"),
      protocolFee: exactJsonNumber(params.state.protocolFee, "currentSlot0.protocolFee"),
      lpFee: exactJsonNumber(params.state.lpFee, "currentSlot0.lpFee"),
    },
    hookConfiguration: params.hookConfiguration,
    hookConfigurationHash: params.hookConfigurationHash.toLowerCase(),
    pendingHookConfiguration: [
      params.state.pendingBuyCurve.exists,
      params.state.pendingSellCurve.exists,
      params.state.pendingProtocolDepthUsdc.exists,
      params.state.pendingProtocolDepthNara.exists,
    ].every((exists) => !exists) ? null : {
      buyCurve: (params.hookConfiguration.readChecks as readonly Readonly<Record<string, unknown>>[])[4].expected,
      sellCurve: (params.hookConfiguration.readChecks as readonly Readonly<Record<string, unknown>>[])[5].expected,
      protocolDepthUsdc: (params.hookConfiguration.readChecks as readonly Readonly<Record<string, unknown>>[])[6].expected,
      protocolDepthNara: (params.hookConfiguration.readChecks as readonly Readonly<Record<string, unknown>>[])[7].expected,
    },
    existingPositions: [
      ...params.state.permanentPositions.map((position) => ({
        source: "permanent_nft",
        role: position.role,
        tokenId: position.tokenId.toString(),
        liquidity: position.liquidity.toString(),
        nftOwner: position.nftOwner,
        poolKeyMatches: position.poolKeyMatches,
      })),
      ...activePositions.map((position) => ({ source: "pool_manager_events", ...position })),
    ],
    proposedOrders: proposedOrders(params.profile),
    budget: {
      totalNaraAllocatedRaw: params.profile.totalNaraInput.toString(),
      totalUsdcBudgetRaw: (5_000n * USDC_UNIT).toString(),
      exposedUsdcRaw: params.profile.exposedUsdcInput.toString(),
      protectedUsdcReserveRaw: params.profile.protectedUsdc.toString(),
    },
    simulationMatrix: params.simulationEvidence?.matrix ?? [
      ...SCENARIO_MATRIX,
      ...REQUIRED_BUY_SIZES_USDC.map((size) => ({ kind: "buy_size_usdc", amount: size.toString() })),
      ...REQUIRED_INDEPENDENT_SELL_SIZES_NARA.map((size) => ({
        kind: "independent_sell_size_nara",
        amount: size.toString(),
      })),
      ...REQUIRED_ACQUIRED_SELL_FRACTIONS_BPS.map((size) => ({
        kind: "acquired_sell_fraction_bps",
        amount: size.toString(),
      })),
    ],
    ...(params.managerDeployment === undefined ? {} : { managerDeployment: params.managerDeployment }),
    noBroadcast: true,
  };
  return body;
}

export function finalizeTreasuryRangeProfile(params: {
  state: V4TreasuryRangeState;
  profile: PlannedStrategyProfile;
  hookConfiguration: Readonly<Record<string, unknown>>;
  hookConfigurationHash: string;
  repositoryHead: string;
  deployment?: ProductionV4Deployment;
  managerDeployment?: Readonly<Record<string, unknown>>;
  simulationEvidence?: Readonly<{
    scenarioCoverage?: readonly string[];
    matrix?: readonly Readonly<Record<string, unknown>>[];
  }>;
}): Readonly<{ profile: PlannedStrategyProfile; manifest: TreasuryRangeStrategyManifest }> {
  const body = manifestBody(params);
  const strategyHash = treasuryRangeStrategyHash(body);
  return {
    profile: stampStrategyHash(params.profile, strategyHash),
    manifest: { ...body, strategyHash },
  };
}

export async function assertLocalPinnedBaseFork(provider: ethers.Provider): Promise<void> {
  const network = await provider.getNetwork();
  if (network.chainId !== 8453n) throw new Error(`Expected Base fork chain ID 8453; received ${network.chainId}`);
  const rpc = provider as ethers.JsonRpcApiProvider;
  let metadata: unknown;
  try {
    metadata = await rpc.send("hardhat_metadata", []);
  } catch {
    throw new Error("Refusing execution: provider is not a local Hardhat fork");
  }
  if (!metadata || typeof metadata !== "object"
      || !(metadata as Record<string, unknown>).forkedNetwork) {
    throw new Error("Refusing execution: Hardhat network is not backed by a pinned fork");
  }
}

export function buildTreasuryRangeScenarioPlan(
  state: V4TreasuryRangeState,
  creationDeadline: bigint,
  repositoryHead: string,
  managerDeployment?: Readonly<Record<string, unknown>>,
): TreasuryRangeScenarioPlan {
  const hookConfiguration = pinnedHookConfiguration(state);
  const pinnedHookConfigurationHash = hookConfigurationHash(hookConfiguration);
  const draftProfiles = buildDeterministicStrategyProfiles({
    currentSqrtPriceX96: state.sqrtPriceX96,
    creationDeadline,
    tickSpacing: state.poolKey.tickSpacing,
    hookConfigurationHash: pinnedHookConfigurationHash,
  });
  const finalized = draftProfiles.map((profile) => finalizeTreasuryRangeProfile({
    state,
    profile,
    hookConfiguration,
    hookConfigurationHash: pinnedHookConfigurationHash,
    repositoryHead,
    managerDeployment,
  }));
  const nominalUsdcBudget = 5_000n * USDC_UNIT;
  return {
    pinnedBlock: state.blockNumber,
    blockHash: state.blockHash,
    profiles: finalized.map((value) => value.profile),
    manifests: finalized.map((value) => value.manifest),
    hookConfiguration,
    hookConfigurationHash: pinnedHookConfigurationHash,
    hardFundingGate: {
      immutableOrderCreator: canonicalProductionV4Deployment().safe,
      nominalUsdcBudget,
      safeUsdcBalance: state.safeBalances.usdc,
      treasuryUsdcBalance: state.treasuryBalances.usdc,
      safeNominalUsdcShortfall: shortfall(nominalUsdcBudget, state.safeBalances.usdc),
      treasuryNominalUsdcShortfall: shortfall(nominalUsdcBudget, state.treasuryBalances.usdc),
      safeNaraBalance: state.safeBalances.nara,
      treasuryNaraBalance: state.treasuryBalances.nara,
      executionBlockedUntilSafeFunded: state.safeBalances.usdc < nominalUsdcBudget,
    },
  };
}

function positionFillClassification(order: ManagerOrderState, endTick: bigint): "unfilled" | "partial" | "full" {
  if (order.side === 0n) {
    if (endTick <= order.tickLower) return "full";
    if (endTick < order.tickUpper) return "partial";
    return "unfilled";
  }
  if (endTick >= order.tickUpper) return "full";
  if (endTick > order.tickLower) return "partial";
  return "unfilled";
}

export function classifyManagerOrders(
  orders: readonly ManagerOrderState[],
  endTick: bigint,
): Readonly<{ partiallyFilled: readonly bigint[]; fullyFilled: readonly bigint[] }> {
  const partiallyFilled: bigint[] = [];
  const fullyFilled: bigint[] = [];
  for (const order of orders) {
    const fill = positionFillClassification(order, endTick);
    if (fill === "partial") partiallyFilled.push(order.orderId);
    if (fill === "full") fullyFilled.push(order.orderId);
  }
  return { partiallyFilled, fullyFilled };
}

export async function executeExactForkSwap(params: {
  provider: ethers.Provider;
  signer: ethers.Signer;
  deployment: ProductionV4Deployment;
  amountIn: bigint;
  inputCurrency: string;
  stateViewAddress?: string;
}): Promise<ExactForkSwapResult> {
  await assertLocalPinnedBaseFork(params.provider);
  if (params.amountIn <= 0n || params.amountIn >= 1n << 128n) throw new Error("Swap input must fit uint128");
  const signerAddress = await params.signer.getAddress();
  const poolKey = deriveV4PoolKey({
    token: params.deployment.token,
    base: params.deployment.base,
    hook: params.deployment.hook,
    fee: params.deployment.poolFee,
    tickSpacing: params.deployment.tickSpacing,
  });
  const inputCurrency = ethers.getAddress(params.inputCurrency);
  const outputCurrency = inputCurrency === ethers.getAddress(params.deployment.base)
    ? ethers.getAddress(params.deployment.token)
    : inputCurrency === ethers.getAddress(params.deployment.token)
      ? ethers.getAddress(params.deployment.base)
      : (() => { throw new Error("Input currency is not NARA or USDC"); })();
  const zeroForOne = inputCurrency === poolKey.currency0;
  const input = new ethers.Contract(inputCurrency, ERC20_ABI, params.signer);
  const nara = new ethers.Contract(params.deployment.token, ERC20_ABI, params.provider);
  const usdc = new ethers.Contract(params.deployment.base, ERC20_ABI, params.provider);
  const permit2 = new ethers.Contract(params.deployment.permit2, PERMIT2_ABI, params.signer);
  const router = new ethers.Contract(params.deployment.universalRouter, UNIVERSAL_ROUTER_ABI, params.signer);
  const stateView = new ethers.Contract(params.stateViewAddress ?? BASE_STATE_VIEW, STATE_VIEW_ABI, params.provider);
  const quoter = new ethers.Contract(BASE_V4_QUOTER, QUOTER_ABI, params.provider);
  const latest = await params.provider.getBlock("latest");
  if (!latest) throw new Error("Fork latest block is unavailable");
  const deadline = BigInt(latest.timestamp) + 600n;

  const [quote] = await quoter.quoteExactInputSingle.staticCall([
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hook],
    zeroForOne,
    params.amountIn,
    "0x",
  ], { blockTag: latest.number }) as readonly [bigint, bigint];
  if (quote <= 0n) throw new Error("Real V4Quoter returned zero output");
  const call = buildV4ExactInputCall({
    poolKey,
    inputCurrency,
    legs: [{ amountIn: params.amountIn, amountOutMinimum: quote }],
    aggregateAmountOutMinimum: quote,
    deadline,
  });

  await (await input.approve(params.deployment.permit2, params.amountIn)).wait();
  await (await permit2.approve(inputCurrency, params.deployment.universalRouter, params.amountIn, deadline)).wait();
  const [slotBefore, traderNaraBefore, traderUsdcBefore, vaultNaraBefore, vaultUsdcBefore] = await Promise.all([
    stateView.getSlot0(params.deployment.poolId) as Promise<readonly bigint[]>,
    nara.balanceOf(signerAddress) as Promise<bigint>,
    usdc.balanceOf(signerAddress) as Promise<bigint>,
    nara.balanceOf(params.deployment.vault) as Promise<bigint>,
    usdc.balanceOf(params.deployment.vault) as Promise<bigint>,
  ]);

  try {
    const transaction = await router.execute(call.commands, call.inputs, call.deadline, { gasLimit: 3_000_000n });
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Universal Router transaction did not succeed");
    const parsed = parseV4SwapReceipt(receipt.logs, {
      poolManager: params.deployment.poolManager,
      hook: params.deployment.hook,
    }, params.deployment.poolId);
    const [slotAfter, traderNaraAfter, traderUsdcAfter, vaultNaraAfter, vaultUsdcAfter] = await Promise.all([
      stateView.getSlot0(params.deployment.poolId) as Promise<readonly bigint[]>,
      nara.balanceOf(signerAddress) as Promise<bigint>,
      usdc.balanceOf(signerAddress) as Promise<bigint>,
      nara.balanceOf(params.deployment.vault) as Promise<bigint>,
      usdc.balanceOf(params.deployment.vault) as Promise<bigint>,
    ]);
    const traderNaraDelta = traderNaraAfter - traderNaraBefore;
    const traderUsdcDelta = traderUsdcAfter - traderUsdcBefore;
    const vaultNaraDelta = vaultNaraAfter - vaultNaraBefore;
    const vaultUsdcDelta = vaultUsdcAfter - vaultUsdcBefore;
    const hookFee = parsed.hookFeeByCurrency.get(inputCurrency) ?? 0n;
    const netAmmInput = params.amountIn - hookFee;
    const lpFee = parsed.swaps.reduce((sum, swap) => sum + exactLpFeeAmount(netAmmInput, swap.lpFeePips), 0n);
    const actualOutput = outputCurrency === ethers.getAddress(params.deployment.token)
      ? traderNaraDelta
      : traderUsdcDelta;
    if (actualOutput <= 0n) throw new Error("Trader received no output on the real route");
    const averageExecutionPrice = inputCurrency === ethers.getAddress(params.deployment.base)
      ? rational(params.amountIn * NARA_UNIT, actualOutput * USDC_UNIT)
      : rational(actualOutput * NARA_UNIT, params.amountIn * USDC_UNIT);
    return {
      status: "executed",
      transactionHash: receipt.hash,
      blockNumber: BigInt(receipt.blockNumber),
      grossInput: params.amountIn,
      quotedOutput: quote,
      actualOutput,
      hookFee,
      effectiveHookFeeBps: exactEffectiveBps(hookFee, params.amountIn),
      lpFee,
      netAmmInput,
      startSqrtPriceX96: slotBefore[0],
      endSqrtPriceX96: slotAfter[0],
      startTick: slotBefore[1],
      endTick: slotAfter[1],
      startHumanUsdcPerNara: formatRational(sqrtPriceX96ToHumanUsdcPerNara(slotBefore[0]), 18),
      endHumanUsdcPerNara: formatRational(sqrtPriceX96ToHumanUsdcPerNara(slotAfter[0]), 18),
      averageExecutionPrice,
      gasUsed: receipt.gasUsed,
      traderNaraDelta,
      traderUsdcDelta,
      vaultNaraDelta,
      vaultUsdcDelta,
      swapEvents: parsed.swaps,
      hookEvents: parsed.hookFees,
    };
  } catch (error) {
    return {
      status: "reverted",
      revertReason: (error as Error).message,
      grossInput: params.amountIn,
      quotedOutput: quote,
      actualOutput: 0n,
      hookFee: 0n,
      effectiveHookFeeBps: 0n,
      lpFee: 0n,
      netAmmInput: 0n,
      startSqrtPriceX96: slotBefore[0],
      endSqrtPriceX96: slotBefore[0],
      startTick: slotBefore[1],
      endTick: slotBefore[1],
      startHumanUsdcPerNara: formatRational(sqrtPriceX96ToHumanUsdcPerNara(slotBefore[0]), 18),
      endHumanUsdcPerNara: formatRational(sqrtPriceX96ToHumanUsdcPerNara(slotBefore[0]), 18),
      averageExecutionPrice: rational(0n),
      gasUsed: 0n,
      traderNaraDelta: 0n,
      traderUsdcDelta: 0n,
      vaultNaraDelta: 0n,
      vaultUsdcDelta: 0n,
      swapEvents: [],
      hookEvents: [],
    };
  }
}

export async function fundForkAccountFromTreasury(params: {
  provider: ethers.Provider;
  deployment: ProductionV4Deployment;
  recipient: string;
  token: string;
  amount: bigint;
}): Promise<void> {
  await assertLocalPinnedBaseFork(params.provider);
  const providerWithSend = params.provider as ethers.JsonRpcApiProvider;
  const treasuryBalance = await new ethers.Contract(params.token, ERC20_ABI, params.provider)
    .balanceOf(params.deployment.treasury) as bigint;
  if (treasuryBalance < params.amount) {
    throw new Error(`Pinned Treasury balance is insufficient for fork funding: required ${params.amount}, available ${treasuryBalance}`);
  }
  await providerWithSend.send("hardhat_impersonateAccount", [params.deployment.treasury]);
  await providerWithSend.send("hardhat_setBalance", [params.deployment.treasury, ethers.toQuantity(ethers.parseEther("10"))]);
  const treasurySigner = await providerWithSend.getSigner(params.deployment.treasury);
  const token = new ethers.Contract(params.token, ERC20_ABI, treasurySigner);
  await (await token.transfer(params.recipient, params.amount)).wait();
  await providerWithSend.send("hardhat_stopImpersonatingAccount", [params.deployment.treasury]);
}

export async function fundForkAccountFromPinnedUsdcAdversary(params: {
  provider: ethers.Provider;
  deployment: ProductionV4Deployment;
  recipient: string;
  amount: bigint;
  requirePristinePinnedBalance?: boolean;
}): Promise<void> {
  await assertLocalPinnedBaseFork(params.provider);
  if (params.amount <= 0n) throw new Error("Pinned adversary funding amount must be positive");
  const providerWithSend = params.provider as ethers.JsonRpcApiProvider;
  const usdc = new ethers.Contract(params.deployment.base, ERC20_ABI, params.provider);
  const [runtimeCode, holderBefore, recipientBefore] = await Promise.all([
    params.provider.getCode(PINNED_USDC_ADVERSARY.address),
    usdc.balanceOf(PINNED_USDC_ADVERSARY.address) as Promise<bigint>,
    usdc.balanceOf(params.recipient) as Promise<bigint>,
  ]);
  if (runtimeCode !== PINNED_USDC_ADVERSARY.runtimeCode) {
    throw new Error("Pinned USDC adversary is no longer the verified code-empty account");
  }
  if (params.requirePristinePinnedBalance && holderBefore !== PINNED_USDC_ADVERSARY.balanceRaw) {
    throw new Error(
      `Pinned USDC adversary balance mismatch: expected ${PINNED_USDC_ADVERSARY.balanceRaw}, received ${holderBefore}`,
    );
  }
  if (holderBefore < params.amount) {
    throw new Error(`Pinned USDC adversary balance is insufficient: required ${params.amount}, available ${holderBefore}`);
  }
  await providerWithSend.send("hardhat_impersonateAccount", [PINNED_USDC_ADVERSARY.address]);
  await providerWithSend.send(
    "hardhat_setBalance",
    [PINNED_USDC_ADVERSARY.address, ethers.toQuantity(ethers.parseEther("10"))],
  );
  try {
    const holder = await providerWithSend.getSigner(PINNED_USDC_ADVERSARY.address);
    await (await usdc.connect(holder).getFunction("transfer")(params.recipient, params.amount)).wait();
  } finally {
    await providerWithSend.send("hardhat_stopImpersonatingAccount", [PINNED_USDC_ADVERSARY.address]);
  }
  const [holderAfter, recipientAfter] = await Promise.all([
    usdc.balanceOf(PINNED_USDC_ADVERSARY.address) as Promise<bigint>,
    usdc.balanceOf(params.recipient) as Promise<bigint>,
  ]);
  if (holderBefore - holderAfter !== params.amount || recipientAfter - recipientBefore !== params.amount) {
    throw new Error("Pinned USDC adversary funding deltas do not reconcile exactly");
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

async function main(): Promise<void> {
  const pinnedRaw = process.env.V4_TREASURY_FORK_BLOCK?.trim();
  if (!pinnedRaw || !/^\d+$/.test(pinnedRaw)) {
    throw new Error("V4_TREASURY_FORK_BLOCK is required for an exact pinned simulation");
  }
  const pinnedBlock = BigInt(pinnedRaw);
  const { ethers: hardhatEthers, networkName } = await hre.network.connect("baseFork") as unknown as {
    ethers: { provider: ethers.JsonRpcApiProvider; getSigners(): Promise<ethers.Signer[]> };
    networkName: string;
  };
  if (networkName !== "baseFork") {
    throw new Error("Treasury range simulation execution is restricted to --network baseFork");
  }
  const latest = await hardhatEthers.provider.getBlock("latest");
  if (!latest || BigInt(latest.number) !== pinnedBlock) {
    throw new Error(`baseFork is not pinned to V4_TREASURY_FORK_BLOCK=${pinnedBlock}`);
  }
  const state = await readV4TreasuryRangeState(hardhatEthers.provider, { blockNumber: pinnedBlock });
  const plan = buildTreasuryRangeScenarioPlan(
    state,
    BigInt(latest.timestamp) + 3_600n,
    currentRepositoryHead(),
  );
  const output: Record<string, unknown> = {
    mode: "exact pinned Base fork; no production transaction",
    atomicLimitation: "V1 cannot settle between a buy and reverse contained in another actor's single atomic transaction.",
    state: jsonSafeState(state),
    scenarioMatrix: SCENARIO_MATRIX,
    requiredBuySizesUsdc: REQUIRED_BUY_SIZES_USDC.map(String),
    requiredIndependentSellSizesNara: REQUIRED_INDEPENDENT_SELL_SIZES_NARA.map(String),
    requiredAcquiredSellFractionsBps: REQUIRED_ACQUIRED_SELL_FRACTIONS_BPS.map(String),
    fundingGate: serialize(plan.hardFundingGate),
    hookConfiguration: serialize(plan.hookConfiguration),
    hookConfigurationHash: plan.hookConfigurationHash,
    manifests: serialize(plan.manifests),
    profiles: plan.profiles.map((profile) => ({
      ...(serialize(profile) as Record<string, unknown>),
      orders: profile.orders.map(serializePlannedRange),
    })),
  };
  if (process.argv.includes("--execute-single-buy")) {
    const rawAmount = argument("--buy-usdc") ?? "10";
    const amount = positiveDecimalToUnits(rawAmount, 6n);
    const [attacker] = await hardhatEthers.getSigners();
    const attackerAddress = await attacker.getAddress();
    await fundForkAccountFromTreasury({
      provider: hardhatEthers.provider,
      deployment: canonicalProductionV4Deployment(),
      recipient: attackerAddress,
      token: canonicalProductionV4Deployment().base,
      amount,
    });
    output.singleBuy = serialize(await executeExactForkSwap({
      provider: hardhatEthers.provider,
      signer: attacker,
      deployment: canonicalProductionV4Deployment(),
      amountIn: amount,
      inputCurrency: canonicalProductionV4Deployment().base,
    }));
  }
  console.log(JSON.stringify(output, null, 2));
}

const invoked = process.argv[1]?.replace(/\\/g, "/").endsWith("/simulateV4TreasuryRanges.ts");
if (invoked) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
