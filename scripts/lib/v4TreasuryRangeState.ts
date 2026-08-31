import { ethers } from "ethers";
import {
  canonicalProductionV4Deployment,
  deriveV4PoolKey,
  type ProductionV4Deployment,
} from "./v4LiveConfig.js";
import {
  canonicalTreasuryRangeAuthorities,
  type TreasuryRangeAuthorities,
} from "./v4TreasuryRangeConfig.js";
import {
  floorDiv,
  formatRational,
  sqrtPriceX96ToHumanUsdcPerNara,
  usableTickBounds,
} from "./v4TreasuryRangeMath.js";
import {
  readCircleFiatTokenDependency,
  treasuryRangeUsdcMonitoredAccounts,
  type CircleFiatTokenDependencyEvidence,
} from "./v4UsdcDependency.js";

export const BASE_CHAIN_ID = 8453n;
export const BASE_STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71";
export const BASE_V4_QUOTER = "0x0d5e0F971ED27FBfF6c2837bf31316121532048D";
export const PRODUCTION_POOL_ACTIVATION_BLOCK = 49_721_188n;
export const DEFAULT_LOG_CHUNK_SIZE = 5_000n;

export const BASE_EXTERNAL_RUNTIME_CODE_HASHES = Object.freeze({
  usdc: "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab",
  poolManager: "0x83b2af6e9f3158defc2811cbcb0db71ecf8b2ba2abea39c39e370ac5c6f43eb6",
  positionManager: "0x243f9e091ddf11c7c04e28059fdbbf1bab82b72d414fafb8e096c097aaeb622a",
  permit2: "0xa67739abc3ede9dbdc0491636c67d6a14ac07fab9030c3f509b1eb7b11dff8ed",
  universalRouter: "0x27713951fb0660a1422b710122022d90723d883dc7b72949be79cb2957d234e0",
  quoter: "0x9a5c0cdd56325bef0e48cdab071a4b6a7f877e1271c2e08510998d724a038bb3",
  stateView: "0xbbd5859677ef5491143133e8ed2b8faa0272f6fc2cbae94c53e79cc8c0538545",
  create2HookDeployer: "0xf66603d80f8c2d1b32da7767761e2fd10c41290c7224d5632501c2d558468db6",
});

const STATE_VIEW_ABI = [
  "function poolManager() view returns (address)",
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
  "function getTickLiquidity(bytes32 poolId,int24 tick) view returns (uint128 liquidityGross,int128 liquidityNet)",
  "function getTickBitmap(bytes32 poolId,int16 wordPosition) view returns (uint256 tickBitmap)",
  "function getPositionInfo(bytes32 poolId,address owner,int24 tickLower,int24 tickUpper,bytes32 salt) view returns (uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128)",
] as const;

const POSITION_MANAGER_ABI = [
  "function poolManager() view returns (address)",
  "function permit2() view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns (tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,uint256 info)",
] as const;

const HOOK_ABI = [
  "function token() view returns (address)",
  "function base() view returns (address)",
  "function vault() view returns (address)",
  "function poolManager() view returns (address)",
  "function CANONICAL_POOL_FEE() view returns (uint24)",
  "function CANONICAL_TICK_SPACING() view returns (int24)",
  "function registeredPoolId() view returns (bytes32)",
  "function poolRegistered() view returns (bool)",
  "function buyCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function sellCurve() view returns (uint32,uint32,uint32,uint16,uint16,uint16,uint16,uint16)",
  "function pendingBuyCurve() view returns (tuple(uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps) curve,uint48 eta,bool exists)",
  "function pendingSellCurve() view returns (tuple(uint32 mediumPressureBps,uint32 highPressureBps,uint32 extremePressureBps,uint16 baseFeeBps,uint16 mediumFeeBps,uint16 highFeeBps,uint16 extremeFeeBps,uint16 maxFeeBps) curve,uint48 eta,bool exists)",
  "function protocolDepth(address currency) view returns (uint256)",
  "function pendingProtocolDepth(address currency) view returns (uint256 depth,uint48 eta,bool exists)",
] as const;

const VAULT_ABI = [
  "function token() view returns (address)",
  "function base() view returns (address)",
  "function hook() view returns (address)",
  "function compounder() view returns (address)",
  "function balances() view returns (uint256 tokenBalance,uint256 baseBalance)",
] as const;

const COMPOUNDER_ABI = [
  "function nara() view returns (address)",
  "function usdc() view returns (address)",
  "function vault() view returns (address)",
  "function poolManager() view returns (address)",
  "function positionManager() view returns (address)",
  "function permit2() view returns (address)",
  "function hooks() view returns (address)",
  "function poolFee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function poolId() view returns (bytes32)",
  "function peripheryBindingsValid() view returns (bool)",
  "function bankedBalances() view returns (uint256 naraBanked,uint256 usdcBanked)",
  "function positionTokenId() view returns (uint256)",
] as const;

const POOL_MANAGER_BOUND_CONTRACT_ABI = ["function poolManager() view returns (address)"] as const;

const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"] as const;

export const TREASURY_RANGE_MANAGER_ABI = [
  "function TREASURY_SAFE() view returns (address)",
  "function NARA() view returns (address)",
  "function USDC() view returns (address)",
  "function LIQUIDITY_VAULT() view returns (address)",
  "function POOL_MANAGER() view returns (address)",
  "function POSITION_MANAGER() view returns (address)",
  "function PERMIT2() view returns (address)",
  "function HOOK() view returns (address)",
  "function POOL_FEE() view returns (uint24)",
  "function TICK_SPACING() view returns (int24)",
  "function POOL_ID() view returns (bytes32)",
  "function DEPLOYMENT_DEADLINE() view returns (uint64)",
  "function getOrder(uint256 orderId) view returns (uint256 tokenId,uint256 inputAmount,uint256 minimumOutputAmount,bytes32 strategyHash,uint128 liquidity,int24 tickLower,int24 tickUpper,uint64 createdBlock,uint64 creationDeadline,uint64 terminalBlock,uint8 side,uint8 status)",
  "function getActiveOrderIds(uint256 offset,uint256 limit) view returns (uint256[] ids,uint256 nextOffset)",
  "function isSettleable(uint256 orderId) view returns (bool)",
  "function currentPoolState() view returns (uint160 sqrtPriceX96,int24 tick,uint128 activeLiquidity,uint24 protocolFee,uint24 lpFee)",
  "function canonicalPoolKey() view returns (address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
  "function settle(uint256 orderId)",
  "function settleMany(uint256[] orderIds)",
  "function cancel(uint256 orderId,uint128 amount0Min,uint128 amount1Min,uint64 deadline)",
] as const;

const POOL_MANAGER_EVENTS = new ethers.Interface([
  "event ModifyLiquidity(bytes32 indexed id,address indexed sender,int24 tickLower,int24 tickUpper,int256 liquidityDelta,bytes32 salt)",
]);

export type FeeCurveState = Readonly<{
  mediumPressureBps: bigint;
  highPressureBps: bigint;
  extremePressureBps: bigint;
  baseFeeBps: bigint;
  mediumFeeBps: bigint;
  highFeeBps: bigint;
  extremeFeeBps: bigint;
  maxFeeBps: bigint;
}>;

export type PendingValue<T> = Readonly<{ value: T; eta: bigint; exists: boolean }>;

export type PositionCandidate = Readonly<{
  owner: string;
  tickLower: bigint;
  tickUpper: bigint;
  salt: string;
  firstObservedBlock: bigint;
  lastObservedBlock: bigint;
  observedLiquidityDelta: bigint;
}>;

export type ReconciledPosition = PositionCandidate & Readonly<{
  positionId: string;
  liquidity: bigint;
  activeAtPinnedTick: boolean;
  positionManagerTokenId?: bigint;
  nftOwner?: string;
}>;

export type TickReconciliation = Readonly<{
  tick: bigint;
  expectedLiquidityGross: bigint;
  actualLiquidityGross: bigint;
  expectedLiquidityNet: bigint;
  actualLiquidityNet: bigint;
  matches: boolean;
}>;

export type PositionReconciliation = Readonly<{
  scanFromBlock: bigint;
  scanToBlock: bigint;
  candidatesObserved: bigint;
  activePositions: readonly ReconciledPosition[];
  zeroLiquidityCandidates: bigint;
  expectedActiveLiquidity: bigint;
  poolActiveLiquidity: bigint;
  activeLiquidityMatches: boolean;
  ticks: readonly TickReconciliation[];
  allTicksMatch: boolean;
  exact: boolean;
}>;

export type ManagerOrderState = Readonly<{
  orderId: bigint;
  tokenId: bigint;
  inputAmount: bigint;
  minimumOutputAmount: bigint;
  strategyHash: string;
  liquidity: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  createdBlock: bigint;
  creationDeadline: bigint;
  terminalBlock: bigint;
  side: bigint;
  status: bigint;
  settleable: boolean;
}>;

export type V4TreasuryRangeState = Readonly<{
  chainId: bigint;
  blockNumber: bigint;
  blockHash: string;
  timestamp: bigint;
  stateView: string;
  poolId: string;
  poolRegistered: boolean;
  poolKey: Readonly<{
    currency0: string;
    currency1: string;
    fee: bigint;
    tickSpacing: bigint;
    hooks: string;
  }>;
  sqrtPriceX96: bigint;
  tick: bigint;
  activeLiquidity: bigint;
  humanUsdcPerNara: string;
  humanUsdcPerNaraRational: Readonly<{ numerator: bigint; denominator: bigint }>;
  protocolFee: bigint;
  lpFee: bigint;
  buyCurve: FeeCurveState;
  sellCurve: FeeCurveState;
  pendingBuyCurve: PendingValue<FeeCurveState>;
  pendingSellCurve: PendingValue<FeeCurveState>;
  protocolDepthNara: bigint;
  protocolDepthUsdc: bigint;
  pendingProtocolDepthNara: PendingValue<bigint>;
  pendingProtocolDepthUsdc: PendingValue<bigint>;
  vaultBalances: Readonly<{ nara: bigint; usdc: bigint }>;
  compounderBankedBalances: Readonly<{ nara: bigint; usdc: bigint }>;
  permanentPositions: readonly Readonly<{
    role: "seed" | "compounder";
    tokenId: bigint;
    liquidity: bigint;
    nftOwner: string;
    poolKeyMatches: boolean;
  }>[];
  positionReconciliation: PositionReconciliation;
  treasuryRangeSafeBalances: Readonly<{ nara: bigint; usdc: bigint }>;
  treasuryBalances: Readonly<{ nara: bigint; usdc: bigint }>;
  manager: Readonly<{ address?: string; activeOrders: readonly ManagerOrderState[] }>;
  runtimeCodeHashes: Readonly<Record<string, string>>;
  externalDependencies: Readonly<{ usdc: CircleFiatTokenDependencyEvidence }>;
}>;

export type V4TreasuryRangeStateOptions = Readonly<{
  blockNumber: bigint;
  deployment?: ProductionV4Deployment;
  stateView?: string;
  scanFromBlock?: bigint;
  logChunkSize?: bigint;
  managerAddress?: string;
  managerRuntimeCodeHash?: string;
  managerPageSize?: bigint;
  managerMaximumOrders?: bigint;
}>;

function feeCurve(result: readonly bigint[]): FeeCurveState {
  if (result.length < 8) throw new Error("Hook returned an incomplete fee curve");
  return {
    mediumPressureBps: result[0],
    highPressureBps: result[1],
    extremePressureBps: result[2],
    baseFeeBps: result[3],
    mediumFeeBps: result[4],
    highFeeBps: result[5],
    extremeFeeBps: result[6],
    maxFeeBps: result[7],
  };
}

function positionCandidateKey(candidate: Pick<PositionCandidate, "owner" | "tickLower" | "tickUpper" | "salt">): string {
  return `${candidate.owner.toLowerCase()}:${candidate.tickLower}:${candidate.tickUpper}:${candidate.salt.toLowerCase()}`;
}

export function positionId(owner: string, tickLower: bigint, tickUpper: bigint, salt: string): string {
  return ethers.keccak256(ethers.solidityPacked(
    ["address", "int24", "int24", "bytes32"],
    [owner, tickLower, tickUpper, salt],
  ));
}

export function permanentTokenIds(seedTokenId: bigint, compounderTokenId: bigint): readonly bigint[] {
  const values = [seedTokenId, compounderTokenId].filter((tokenId) => tokenId > 0n);
  return [...new Set(values.map((tokenId) => tokenId.toString()))].map(BigInt);
}

function sameAddress(actual: string, expected: string): boolean {
  return ethers.getAddress(actual) === ethers.getAddress(expected);
}

function assertAddressBinding(label: string, actual: string, expected: string): void {
  if (!sameAddress(actual, expected)) {
    throw new Error(`${label} binding mismatch: expected ${expected}, received ${actual}`);
  }
}

function poolKeyMatches(
  raw: readonly (string | bigint)[],
  expected: Readonly<{ currency0: string; currency1: string; fee: number; tickSpacing: number; hook: string }>,
): boolean {
  return sameAddress(raw[0] as string, expected.currency0)
    && sameAddress(raw[1] as string, expected.currency1)
    && raw[2] === BigInt(expected.fee)
    && raw[3] === BigInt(expected.tickSpacing)
    && sameAddress(raw[4] as string, expected.hook);
}

async function assertRuntimeAndBindings(params: {
  provider: ethers.Provider;
  deployment: ProductionV4Deployment;
  authorities: TreasuryRangeAuthorities;
  stateViewAddress: string;
  managerAddress?: string;
  managerRuntimeCodeHash?: string;
  blockTag: string;
}): Promise<Readonly<Record<string, string>>> {
  const expectedHashes: Readonly<Record<string, readonly [string, string]>> = {
    token: [params.deployment.token, params.deployment.runtimeCodeHashes.token],
    usdc: [params.deployment.base, BASE_EXTERNAL_RUNTIME_CODE_HASHES.usdc],
    hook: [params.deployment.hook, params.deployment.runtimeCodeHashes.hook],
    vault: [params.deployment.vault, params.deployment.runtimeCodeHashes.vault],
    compounder: [params.deployment.compounder, params.deployment.runtimeCodeHashes.compounder],
    deploymentExecutorSafe: [
      params.authorities.deploymentExecutorSafe,
      params.authorities.deploymentExecutorSafeRuntimeCodeHash,
    ],
    treasuryRangeSafe: [
      params.authorities.treasuryRangeSafe,
      params.authorities.treasuryRangeSafeRuntimeCodeHash,
    ],
    create2HookDeployer: [
      params.deployment.create2HookDeployer,
      BASE_EXTERNAL_RUNTIME_CODE_HASHES.create2HookDeployer,
    ],
    poolManager: [params.deployment.poolManager, BASE_EXTERNAL_RUNTIME_CODE_HASHES.poolManager],
    positionManager: [params.deployment.positionManager, BASE_EXTERNAL_RUNTIME_CODE_HASHES.positionManager],
    permit2: [params.deployment.permit2, BASE_EXTERNAL_RUNTIME_CODE_HASHES.permit2],
    universalRouter: [params.deployment.universalRouter, BASE_EXTERNAL_RUNTIME_CODE_HASHES.universalRouter],
    quoter: [BASE_V4_QUOTER, BASE_EXTERNAL_RUNTIME_CODE_HASHES.quoter],
    stateView: [params.stateViewAddress, BASE_EXTERNAL_RUNTIME_CODE_HASHES.stateView],
  };
  if (params.managerAddress) {
    if (!params.managerRuntimeCodeHash || !ethers.isHexString(params.managerRuntimeCodeHash, 32)) {
      throw new Error("managerRuntimeCodeHash is required when managerAddress is configured");
    }
  }
  const entries = Object.entries(expectedHashes);
  if (params.managerAddress && params.managerRuntimeCodeHash) {
    entries.push(["manager", [params.managerAddress, params.managerRuntimeCodeHash]]);
  }
  const actualHashes: Record<string, string> = {};
  for (const [label, [address, expectedHash]] of entries) {
    const code = await params.provider.getCode(address, params.blockTag);
    if (code === "0x") throw new Error(`${label} has no runtime code at the pinned block`);
    const actualHash = ethers.keccak256(code).toLowerCase();
    if (actualHash !== expectedHash.toLowerCase()) {
      throw new Error(`${label} runtime hash mismatch: expected ${expectedHash}, received ${actualHash}`);
    }
    actualHashes[label] = actualHash;
  }

  const hook = new ethers.Contract(params.deployment.hook, HOOK_ABI, params.provider);
  const vault = new ethers.Contract(params.deployment.vault, VAULT_ABI, params.provider);
  const compounder = new ethers.Contract(params.deployment.compounder, COMPOUNDER_ABI, params.provider);
  const positionManager = new ethers.Contract(params.deployment.positionManager, POSITION_MANAGER_ABI, params.provider);
  const router = new ethers.Contract(params.deployment.universalRouter, POOL_MANAGER_BOUND_CONTRACT_ABI, params.provider);
  const quoter = new ethers.Contract(BASE_V4_QUOTER, POOL_MANAGER_BOUND_CONTRACT_ABI, params.provider);
  const stateView = new ethers.Contract(params.stateViewAddress, STATE_VIEW_ABI, params.provider);
  const overrides = { blockTag: params.blockTag };
  const [hookToken, hookBase, hookVault, hookPoolManager, hookFee, hookSpacing, registeredPoolId,
    vaultToken, vaultBase, vaultHook, vaultCompounder,
    compounderNara, compounderUsdc, compounderVault, compounderPoolManager,
    compounderPositionManager, compounderPermit2, compounderHook, compounderFee,
    compounderSpacing, compounderPoolId, compounderBindingsValid,
    positionManagerPoolManager, positionManagerPermit2, routerPoolManager, quoterPoolManager, stateViewPoolManager] =
    await Promise.all([
      hook.token(overrides), hook.base(overrides), hook.vault(overrides), hook.poolManager(overrides),
      hook.CANONICAL_POOL_FEE(overrides), hook.CANONICAL_TICK_SPACING(overrides), hook.registeredPoolId(overrides),
      vault.token(overrides), vault.base(overrides), vault.hook(overrides), vault.compounder(overrides),
      compounder.nara(overrides), compounder.usdc(overrides), compounder.vault(overrides),
      compounder.poolManager(overrides), compounder.positionManager(overrides), compounder.permit2(overrides),
      compounder.hooks(overrides), compounder.poolFee(overrides), compounder.tickSpacing(overrides),
      compounder.poolId(overrides), compounder.peripheryBindingsValid(overrides),
      positionManager.poolManager(overrides), positionManager.permit2(overrides), router.poolManager(overrides),
      quoter.poolManager(overrides), stateView.poolManager(overrides),
    ]);
  assertAddressBinding("Hook.token", hookToken as string, params.deployment.token);
  assertAddressBinding("Hook.base", hookBase as string, params.deployment.base);
  assertAddressBinding("Hook.vault", hookVault as string, params.deployment.vault);
  assertAddressBinding("Hook.poolManager", hookPoolManager as string, params.deployment.poolManager);
  if (hookFee !== BigInt(params.deployment.poolFee) || hookSpacing !== BigInt(params.deployment.tickSpacing)
      || (registeredPoolId as string).toLowerCase() !== params.deployment.poolId.toLowerCase()) {
    throw new Error("Hook canonical pool binding mismatch");
  }
  assertAddressBinding("Vault.token", vaultToken as string, params.deployment.token);
  assertAddressBinding("Vault.base", vaultBase as string, params.deployment.base);
  assertAddressBinding("Vault.hook", vaultHook as string, params.deployment.hook);
  assertAddressBinding("Vault.compounder", vaultCompounder as string, params.deployment.compounder);
  assertAddressBinding("Compounder.nara", compounderNara as string, params.deployment.token);
  assertAddressBinding("Compounder.usdc", compounderUsdc as string, params.deployment.base);
  assertAddressBinding("Compounder.vault", compounderVault as string, params.deployment.vault);
  assertAddressBinding("Compounder.poolManager", compounderPoolManager as string, params.deployment.poolManager);
  assertAddressBinding("Compounder.positionManager", compounderPositionManager as string, params.deployment.positionManager);
  assertAddressBinding("Compounder.permit2", compounderPermit2 as string, params.deployment.permit2);
  assertAddressBinding("Compounder.hooks", compounderHook as string, params.deployment.hook);
  if (compounderFee !== BigInt(params.deployment.poolFee)
      || compounderSpacing !== BigInt(params.deployment.tickSpacing)
      || (compounderPoolId as string).toLowerCase() !== params.deployment.poolId.toLowerCase()
      || compounderBindingsValid !== true) {
    throw new Error("Compounder canonical pool binding mismatch");
  }
  assertAddressBinding("PositionManager.poolManager", positionManagerPoolManager as string, params.deployment.poolManager);
  assertAddressBinding("PositionManager.permit2", positionManagerPermit2 as string, params.deployment.permit2);
  assertAddressBinding("UniversalRouter.poolManager", routerPoolManager as string, params.deployment.poolManager);
  assertAddressBinding("V4Quoter.poolManager", quoterPoolManager as string, params.deployment.poolManager);
  assertAddressBinding("StateView.poolManager", stateViewPoolManager as string, params.deployment.poolManager);

  if (params.managerAddress) {
    const manager = new ethers.Contract(params.managerAddress, TREASURY_RANGE_MANAGER_ABI, params.provider);
    const [safe, nara, usdc, managerVault, managerPoolManager, managerPositionManager, managerPermit2,
      managerHook, fee, spacing, poolId, canonicalPoolKey] = await Promise.all([
      manager.TREASURY_SAFE(overrides), manager.NARA(overrides), manager.USDC(overrides),
      manager.LIQUIDITY_VAULT(overrides), manager.POOL_MANAGER(overrides), manager.POSITION_MANAGER(overrides),
      manager.PERMIT2(overrides), manager.HOOK(overrides), manager.POOL_FEE(overrides), manager.TICK_SPACING(overrides),
      manager.POOL_ID(overrides), manager.canonicalPoolKey(overrides),
    ]);
    assertAddressBinding("Manager.TREASURY_SAFE", safe as string, params.authorities.treasuryRangeSafe);
    assertAddressBinding("Manager.NARA", nara as string, params.deployment.token);
    assertAddressBinding("Manager.USDC", usdc as string, params.deployment.base);
    assertAddressBinding("Manager.LIQUIDITY_VAULT", managerVault as string, params.deployment.vault);
    assertAddressBinding("Manager.POOL_MANAGER", managerPoolManager as string, params.deployment.poolManager);
    assertAddressBinding("Manager.POSITION_MANAGER", managerPositionManager as string, params.deployment.positionManager);
    assertAddressBinding("Manager.PERMIT2", managerPermit2 as string, params.deployment.permit2);
    assertAddressBinding("Manager.HOOK", managerHook as string, params.deployment.hook);
    if (fee !== BigInt(params.deployment.poolFee) || spacing !== BigInt(params.deployment.tickSpacing)
        || (poolId as string).toLowerCase() !== params.deployment.poolId.toLowerCase()
        || !poolKeyMatches(canonicalPoolKey as readonly (string | bigint)[], {
          currency0: BigInt(params.deployment.base) < BigInt(params.deployment.token)
            ? params.deployment.base : params.deployment.token,
          currency1: BigInt(params.deployment.base) < BigInt(params.deployment.token)
            ? params.deployment.token : params.deployment.base,
          fee: params.deployment.poolFee,
          tickSpacing: params.deployment.tickSpacing,
          hook: params.deployment.hook,
        })) {
      throw new Error("Manager canonical pool binding mismatch");
    }
  }
  return actualHashes;
}

export function aggregateModifyLiquidityLogs(logs: readonly ethers.Log[]): readonly PositionCandidate[] {
  const candidates = new Map<string, PositionCandidate>();
  for (const log of logs) {
    const parsed = POOL_MANAGER_EVENTS.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== "ModifyLiquidity") continue;
    const candidate = {
      owner: ethers.getAddress(parsed.args.sender as string),
      tickLower: parsed.args.tickLower as bigint,
      tickUpper: parsed.args.tickUpper as bigint,
      salt: parsed.args.salt as string,
      firstObservedBlock: BigInt(log.blockNumber),
      lastObservedBlock: BigInt(log.blockNumber),
      observedLiquidityDelta: parsed.args.liquidityDelta as bigint,
    } satisfies PositionCandidate;
    const key = positionCandidateKey(candidate);
    const previous = candidates.get(key);
    candidates.set(key, previous ? {
      ...candidate,
      firstObservedBlock: previous.firstObservedBlock,
      observedLiquidityDelta: previous.observedLiquidityDelta + candidate.observedLiquidityDelta,
    } : candidate);
  }
  return [...candidates.values()].sort((a, b) => positionCandidateKey(a).localeCompare(positionCandidateKey(b)));
}

async function readModifyLiquidityLogs(params: {
  provider: ethers.Provider;
  poolManager: string;
  poolId: string;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize: bigint;
}): Promise<readonly ethers.Log[]> {
  if (params.fromBlock > params.toBlock) return [];
  if (params.chunkSize <= 0n) throw new Error("Log chunk size must be positive");
  const event = POOL_MANAGER_EVENTS.getEvent("ModifyLiquidity");
  if (!event) throw new Error("ModifyLiquidity event ABI is unavailable");
  const topics = POOL_MANAGER_EVENTS.encodeFilterTopics(event, [params.poolId]);
  const logs: ethers.Log[] = [];
  for (let from = params.fromBlock; from <= params.toBlock; from += params.chunkSize) {
    const to = from + params.chunkSize - 1n < params.toBlock ? from + params.chunkSize - 1n : params.toBlock;
    logs.push(...await params.provider.getLogs({
      address: params.poolManager,
      topics,
      fromBlock: ethers.toQuantity(from),
      toBlock: ethers.toQuantity(to),
    }));
  }
  return logs;
}

export function reconcilePositions(params: {
  candidates: readonly ReconciledPosition[];
  pinnedTick: bigint;
  poolActiveLiquidity: bigint;
  actualTicks: ReadonlyMap<bigint, Readonly<{ liquidityGross: bigint; liquidityNet: bigint }>>;
  scanFromBlock: bigint;
  scanToBlock: bigint;
}): PositionReconciliation {
  const activePositions = params.candidates.filter((position) => position.liquidity > 0n);
  const expectedActiveLiquidity = activePositions
    .filter((position) => position.tickLower <= params.pinnedTick && params.pinnedTick < position.tickUpper)
    .reduce((sum, position) => sum + position.liquidity, 0n);
  const expectedTicks = new Map<bigint, { liquidityGross: bigint; liquidityNet: bigint }>();
  for (const position of activePositions) {
    const lower = expectedTicks.get(position.tickLower) ?? { liquidityGross: 0n, liquidityNet: 0n };
    lower.liquidityGross += position.liquidity;
    lower.liquidityNet += position.liquidity;
    expectedTicks.set(position.tickLower, lower);
    const upper = expectedTicks.get(position.tickUpper) ?? { liquidityGross: 0n, liquidityNet: 0n };
    upper.liquidityGross += position.liquidity;
    upper.liquidityNet -= position.liquidity;
    expectedTicks.set(position.tickUpper, upper);
  }
  const allTickKeys = new Set([
    ...expectedTicks.keys(),
    ...params.actualTicks.keys(),
  ]);
  const ticks = [...allTickKeys].sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map((tick) => {
    const expected = expectedTicks.get(tick) ?? { liquidityGross: 0n, liquidityNet: 0n };
    const actual = params.actualTicks.get(tick) ?? { liquidityGross: 0n, liquidityNet: 0n };
    return {
      tick,
      expectedLiquidityGross: expected.liquidityGross,
      actualLiquidityGross: actual.liquidityGross,
      expectedLiquidityNet: expected.liquidityNet,
      actualLiquidityNet: actual.liquidityNet,
      matches: expected.liquidityGross === actual.liquidityGross && expected.liquidityNet === actual.liquidityNet,
    };
  });
  const activeLiquidityMatches = expectedActiveLiquidity === params.poolActiveLiquidity;
  const allTicksMatch = ticks.every((tick) => tick.matches);
  return {
    scanFromBlock: params.scanFromBlock,
    scanToBlock: params.scanToBlock,
    candidatesObserved: BigInt(params.candidates.length),
    activePositions,
    zeroLiquidityCandidates: BigInt(params.candidates.length - activePositions.length),
    expectedActiveLiquidity,
    poolActiveLiquidity: params.poolActiveLiquidity,
    activeLiquidityMatches,
    ticks,
    allTicksMatch,
    exact: activeLiquidityMatches && allTicksMatch,
  };
}

async function readAllInitializedTicks(params: {
  stateView: ethers.Contract;
  poolId: string;
  tickSpacing: bigint;
  overrides: Readonly<{ blockTag: string }>;
}): Promise<readonly bigint[]> {
  const bounds = usableTickBounds(params.tickSpacing);
  const minWord = floorDiv(bounds.minTick / params.tickSpacing, 256n);
  const maxWord = floorDiv(bounds.maxTick / params.tickSpacing, 256n);
  const ticks: bigint[] = [];
  for (let word = minWord; word <= maxWord; word += 1n) {
    const bitmap = await params.stateView.getTickBitmap(params.poolId, word, params.overrides) as bigint;
    if (bitmap === 0n) continue;
    for (let bit = 0n; bit < 256n; bit += 1n) {
      if ((bitmap & (1n << bit)) !== 0n) {
        const tick = (word * 256n + bit) * params.tickSpacing;
        if (tick >= bounds.minTick && tick <= bounds.maxTick) ticks.push(tick);
      }
    }
  }
  return ticks;
}

export async function paginateManagerOrderIds(params: {
  pageSize: bigint;
  maximumOrders: bigint;
  fetchPage: (offset: bigint, limit: bigint) => Promise<readonly [readonly bigint[], bigint]>;
}): Promise<readonly bigint[]> {
  if (params.pageSize <= 0n || params.maximumOrders <= 0n) throw new Error("Manager pagination bounds must be positive");
  const ids: bigint[] = [];
  let offset = 0n;
  const seenOffsets = new Set<string>();
  for (;;) {
    if (seenOffsets.has(offset.toString())) throw new Error("Manager pagination returned a repeated offset");
    seenOffsets.add(offset.toString());
    const [page, nextOffset] = await params.fetchPage(offset, params.pageSize);
    if (page.length === 0) break;
    if (BigInt(ids.length + page.length) > params.maximumOrders) {
      throw new Error("Manager active-order enumeration exceeded cap");
    }
    ids.push(...page);
    if (nextOffset <= offset) throw new Error("Manager pagination did not advance");
    offset = nextOffset;
  }
  return ids;
}

async function readManagerOrders(
  provider: ethers.Provider,
  managerAddress: string | undefined,
  blockTag: string,
  pageSize: bigint,
  maximumOrders: bigint,
): Promise<readonly ManagerOrderState[]> {
  if (!managerAddress) return [];
  const manager = new ethers.Contract(managerAddress, TREASURY_RANGE_MANAGER_ABI, provider);
  const orders: ManagerOrderState[] = [];
  const ids = await paginateManagerOrderIds({
    pageSize,
    maximumOrders,
    fetchPage: async (offset, limit) => manager.getActiveOrderIds(offset, limit, { blockTag }) as Promise<Readonly<[readonly bigint[], bigint]>>,
  });
  for (const orderId of ids) {
    const [raw, settleable] = await Promise.all([
      manager.getOrder(orderId, { blockTag }) as Promise<readonly (bigint | string)[]>,
      manager.isSettleable(orderId, { blockTag }) as Promise<boolean>,
    ]);
    orders.push({
      orderId,
      tokenId: raw[0] as bigint,
      inputAmount: raw[1] as bigint,
      minimumOutputAmount: raw[2] as bigint,
      strategyHash: raw[3] as string,
      liquidity: raw[4] as bigint,
      tickLower: raw[5] as bigint,
      tickUpper: raw[6] as bigint,
      createdBlock: raw[7] as bigint,
      creationDeadline: raw[8] as bigint,
      terminalBlock: raw[9] as bigint,
      side: raw[10] as bigint,
      status: raw[11] as bigint,
      settleable,
    });
  }
  return orders;
}

export async function readV4TreasuryRangeState(
  provider: ethers.Provider,
  options: V4TreasuryRangeStateOptions,
): Promise<V4TreasuryRangeState> {
  const deployment = options.deployment ?? canonicalProductionV4Deployment();
  const authorities = canonicalTreasuryRangeAuthorities(deployment);
  const stateViewAddress = ethers.getAddress(options.stateView ?? BASE_STATE_VIEW);
  const scanFromBlock = options.scanFromBlock ?? PRODUCTION_POOL_ACTIVATION_BLOCK;
  const logChunkSize = options.logChunkSize ?? DEFAULT_LOG_CHUNK_SIZE;
  if (options.blockNumber < scanFromBlock) throw new Error("Pinned block predates pool activation scan start");
  const network = await provider.getNetwork();
  if (network.chainId !== BASE_CHAIN_ID) throw new Error(`Expected Base chain ID 8453; received ${network.chainId}`);
  const blockTag = ethers.toQuantity(options.blockNumber);
  const blockBefore = await provider.getBlock(blockTag);
  if (!blockBefore?.hash) throw new Error(`Pinned block ${options.blockNumber} is unavailable`);

  const poolKey = deriveV4PoolKey({
    token: deployment.token,
    base: deployment.base,
    hook: deployment.hook,
    fee: deployment.poolFee,
    tickSpacing: deployment.tickSpacing,
  });
  if (poolKey.poolId.toLowerCase() !== deployment.poolId.toLowerCase()) {
    throw new Error("Deployment PoolId does not match the canonical PoolKey");
  }
  const runtimeCodeHashes = await assertRuntimeAndBindings({
    provider,
    deployment,
    authorities,
    stateViewAddress,
    managerAddress: options.managerAddress,
    managerRuntimeCodeHash: options.managerRuntimeCodeHash,
    blockTag,
  });
  const usdcDependency = await readCircleFiatTokenDependency(
    provider,
    deployment.base,
    treasuryRangeUsdcMonitoredAccounts({
      treasuryRangeSafe: authorities.treasuryRangeSafe,
      poolManager: deployment.poolManager,
      positionManager: deployment.positionManager,
      permit2: deployment.permit2,
      liquidityVault: deployment.vault,
      liquidityCompounder: deployment.compounder,
      rangeManager: options.managerAddress,
    }),
    blockTag,
  );

  const stateView = new ethers.Contract(stateViewAddress, STATE_VIEW_ABI, provider);
  const positionManager = new ethers.Contract(deployment.positionManager, POSITION_MANAGER_ABI, provider);
  const hook = new ethers.Contract(deployment.hook, HOOK_ABI, provider);
  const vault = new ethers.Contract(deployment.vault, VAULT_ABI, provider);
  const compounder = new ethers.Contract(deployment.compounder, COMPOUNDER_ABI, provider);
  const nara = new ethers.Contract(deployment.token, ERC20_ABI, provider);
  const usdc = new ethers.Contract(deployment.base, ERC20_ABI, provider);
  const overrides = { blockTag };

  const logsPromise = readModifyLiquidityLogs({
    provider,
    poolManager: deployment.poolManager,
    poolId: deployment.poolId,
    fromBlock: scanFromBlock,
    toBlock: options.blockNumber,
    chunkSize: logChunkSize,
  });
  const [slot0, activeLiquidity, poolRegistered, buyCurveRaw, sellCurveRaw, pendingBuyRaw, pendingSellRaw,
    protocolDepthNara, protocolDepthUsdc, pendingDepthNaraRaw, pendingDepthUsdcRaw,
    vaultRaw, bankedRaw, compounderPositionTokenId, treasuryRangeSafeNara, treasuryRangeSafeUsdc,
    treasuryNara, treasuryUsdc,
    logs, managerOrders] = await Promise.all([
    stateView.getSlot0(deployment.poolId, overrides) as Promise<readonly bigint[]>,
    stateView.getLiquidity(deployment.poolId, overrides) as Promise<bigint>,
    hook.poolRegistered(overrides) as Promise<boolean>,
    hook.buyCurve(overrides) as Promise<readonly bigint[]>,
    hook.sellCurve(overrides) as Promise<readonly bigint[]>,
    hook.pendingBuyCurve(overrides) as Promise<readonly [readonly bigint[], bigint, boolean]>,
    hook.pendingSellCurve(overrides) as Promise<readonly [readonly bigint[], bigint, boolean]>,
    hook.protocolDepth(deployment.token, overrides) as Promise<bigint>,
    hook.protocolDepth(deployment.base, overrides) as Promise<bigint>,
    hook.pendingProtocolDepth(deployment.token, overrides) as Promise<readonly [bigint, bigint, boolean]>,
    hook.pendingProtocolDepth(deployment.base, overrides) as Promise<readonly [bigint, bigint, boolean]>,
    vault.balances(overrides) as Promise<readonly [bigint, bigint]>,
    compounder.bankedBalances(overrides) as Promise<readonly [bigint, bigint]>,
    compounder.positionTokenId(overrides) as Promise<bigint>,
    nara.balanceOf(authorities.treasuryRangeSafe, overrides) as Promise<bigint>,
    usdc.balanceOf(authorities.treasuryRangeSafe, overrides) as Promise<bigint>,
    nara.balanceOf(deployment.treasury, overrides) as Promise<bigint>,
    usdc.balanceOf(deployment.treasury, overrides) as Promise<bigint>,
    logsPromise,
    readManagerOrders(
      provider,
      options.managerAddress,
      blockTag,
      options.managerPageSize ?? 100n,
      options.managerMaximumOrders ?? 10_000n,
    ),
  ]);
  if (!poolRegistered) throw new Error("Canonical Hook reports poolRegistered=false at the pinned block");

  const expectedPoolKey = {
    currency0: poolKey.currency0,
    currency1: poolKey.currency1,
    fee: poolKey.fee,
    tickSpacing: poolKey.tickSpacing,
    hook: poolKey.hook,
  };
  const permanentPositions = await Promise.all(
    permanentTokenIds(deployment.lpTokenId, compounderPositionTokenId).map(async (tokenId) => {
      const [liquidity, nftOwner, poolAndPosition] = await Promise.all([
        positionManager.getPositionLiquidity(tokenId, overrides) as Promise<bigint>,
        positionManager.ownerOf(tokenId, overrides) as Promise<string>,
        positionManager.getPoolAndPositionInfo(tokenId, overrides) as Promise<Readonly<[readonly (string | bigint)[], bigint]>>,
      ]);
      const matches = poolKeyMatches(poolAndPosition[0], expectedPoolKey);
      if (!matches) throw new Error(`Permanent PositionManager token ${tokenId} is not in the canonical pool`);
      return {
        role: tokenId === deployment.lpTokenId ? "seed" as const : "compounder" as const,
        tokenId,
        liquidity,
        nftOwner,
        poolKeyMatches: matches,
      };
    }),
  );

  const candidates = aggregateModifyLiquidityLogs(logs);
  const reconciledPositions = await Promise.all(candidates.map(async (candidate): Promise<ReconciledPosition> => {
    const liquidity = (await stateView.getPositionInfo(
      deployment.poolId,
      candidate.owner,
      candidate.tickLower,
      candidate.tickUpper,
      candidate.salt,
      overrides,
    ) as readonly bigint[])[0];
    const isPositionManager = candidate.owner.toLowerCase() === deployment.positionManager.toLowerCase();
    const tokenId = isPositionManager ? BigInt(candidate.salt) : undefined;
    let nftOwner: string | undefined;
    if (isPositionManager && liquidity > 0n) {
      try {
        nftOwner = await positionManager.ownerOf(tokenId, overrides) as string;
      } catch {
        nftOwner = undefined;
      }
    }
    return {
      ...candidate,
      positionId: positionId(candidate.owner, candidate.tickLower, candidate.tickUpper, candidate.salt),
      liquidity,
      activeAtPinnedTick: liquidity > 0n && candidate.tickLower <= slot0[1] && slot0[1] < candidate.tickUpper,
      positionManagerTokenId: tokenId,
      nftOwner,
    };
  }));
  const initializedTicks = await readAllInitializedTicks({
    stateView,
    poolId: deployment.poolId,
    tickSpacing: BigInt(deployment.tickSpacing),
    overrides,
  });
  const tickEntries = await Promise.all(initializedTicks.map(async (tick) => {
    const raw = await stateView.getTickLiquidity(deployment.poolId, tick, overrides) as readonly bigint[];
    return [tick, { liquidityGross: raw[0], liquidityNet: raw[1] }] as const;
  }));
  const positionReconciliation = reconcilePositions({
    candidates: reconciledPositions,
    pinnedTick: slot0[1],
    poolActiveLiquidity: activeLiquidity,
    actualTicks: new Map(tickEntries),
    scanFromBlock,
    scanToBlock: options.blockNumber,
  });
  if (!positionReconciliation.exact) {
    throw new Error(
      `Active-position reconciliation failed at block ${options.blockNumber}: `
      + `activeLiquidityMatches=${positionReconciliation.activeLiquidityMatches}, `
      + `allTicksMatch=${positionReconciliation.allTicksMatch}`,
    );
  }
  if (options.managerAddress) {
    const manager = new ethers.Contract(options.managerAddress, TREASURY_RANGE_MANAGER_ABI, provider);
    const managerPoolState = await manager.currentPoolState(overrides) as readonly bigint[];
    if (managerPoolState[0] !== slot0[0] || managerPoolState[1] !== slot0[1]
        || managerPoolState[2] !== activeLiquidity || managerPoolState[3] !== slot0[2]
        || managerPoolState[4] !== slot0[3]) {
      throw new Error("Manager currentPoolState does not match pinned StateView state");
    }
  }

  const blockAfter = await provider.getBlock(blockTag);
  if (!blockAfter?.hash || blockAfter.hash.toLowerCase() !== blockBefore.hash.toLowerCase()) {
    throw new Error("Pinned block hash changed while state was being read");
  }
  const humanPrice = sqrtPriceX96ToHumanUsdcPerNara(slot0[0]);
  return {
    chainId: network.chainId,
    blockNumber: options.blockNumber,
    blockHash: blockBefore.hash,
    timestamp: BigInt(blockBefore.timestamp),
    stateView: stateViewAddress,
    poolId: deployment.poolId,
    poolRegistered,
    poolKey: {
      currency0: poolKey.currency0,
      currency1: poolKey.currency1,
      fee: BigInt(poolKey.fee),
      tickSpacing: BigInt(poolKey.tickSpacing),
      hooks: poolKey.hook,
    },
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
    activeLiquidity,
    humanUsdcPerNara: formatRational(humanPrice, 18),
    humanUsdcPerNaraRational: humanPrice,
    protocolFee: slot0[2],
    lpFee: slot0[3],
    buyCurve: feeCurve(buyCurveRaw),
    sellCurve: feeCurve(sellCurveRaw),
    pendingBuyCurve: { value: feeCurve(pendingBuyRaw[0]), eta: pendingBuyRaw[1], exists: pendingBuyRaw[2] },
    pendingSellCurve: { value: feeCurve(pendingSellRaw[0]), eta: pendingSellRaw[1], exists: pendingSellRaw[2] },
    protocolDepthNara,
    protocolDepthUsdc,
    pendingProtocolDepthNara: { value: pendingDepthNaraRaw[0], eta: pendingDepthNaraRaw[1], exists: pendingDepthNaraRaw[2] },
    pendingProtocolDepthUsdc: { value: pendingDepthUsdcRaw[0], eta: pendingDepthUsdcRaw[1], exists: pendingDepthUsdcRaw[2] },
    vaultBalances: { nara: vaultRaw[0], usdc: vaultRaw[1] },
    compounderBankedBalances: { nara: bankedRaw[0], usdc: bankedRaw[1] },
    permanentPositions,
    positionReconciliation,
    treasuryRangeSafeBalances: { nara: treasuryRangeSafeNara, usdc: treasuryRangeSafeUsdc },
    treasuryBalances: { nara: treasuryNara, usdc: treasuryUsdc },
    manager: { address: options.managerAddress, activeOrders: managerOrders },
    runtimeCodeHashes,
    externalDependencies: { usdc: usdcDependency },
  };
}

export function jsonSafeState(state: V4TreasuryRangeState): unknown {
  return JSON.parse(JSON.stringify(state, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}
