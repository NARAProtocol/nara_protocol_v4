/**
 * Build and simulate the first Safe batch for the NARA v4 liquidity-stack reset.
 *
 * This script is deliberately read-only with respect to Base. It uses pinned
 * eth_call simulations, writes a sanitized Safe Transaction Builder file, and
 * never signs, submits, or broadcasts a transaction.
 */
import { ethers, type InterfaceAbi } from "ethers";
import * as dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentV4Config, requiredBaseRpcUrl, requiredEnv } from "./lib/v4LiveConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
dotenv.config({ path: resolve(repoRoot, ".env"), quiet: true });

export const LIQUIDITY_STACK_RESET_CHANGE_ID = "NARA-20260731-liquidity-stack-reset";
export const BASE_CHAIN_ID = 8453n;
export const RECOVERY_DELAY_SECONDS = 7n * 24n * 60n * 60n;
export const CANONICAL_CUSTODY_SAFE = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";
export const CANONICAL_SAFE_RUNTIME_CODE_HASH =
  "0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c";
export const CANONICAL_SAFE_VERSION = "1.4.1";
export const CANONICAL_SAFE_THRESHOLD = 2n;
export const CANONICAL_SAFE_OWNERS = Object.freeze([
  "0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e",
  "0xC019Dc79412c4b20103ac4ce97B2615FF45D490d",
  "0x42365cAE9abB6cb357dd485734CAd75a2d3c6664",
]);
export const CANONICAL_COMPOUND_KEEPER = "0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7";
export const SAFE_MODULE_SENTINEL = "0x0000000000000000000000000000000000000001";
export const CANONICAL_ACTIVE_LIQUIDITY_STACK = Object.freeze({
  nara: "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  positionManager: "0x7C5f5A4bBd8fD63184577525326123B519429bDc",
  vault: "0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d",
  hook: "0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088",
  compounder: "0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98",
  poolId: "0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318",
  seedPositionTokenId: 2_884_402n,
  compounderPositionTokenId: 2_885_838n,
  poolFee: 3_000n,
  tickSpacing: 60n,
  runtimeCodeHashes: Object.freeze({
    nara: "0x1ae6fe9a0621b52f632b09f4f66adce953884bb87df73732efcb2d70f5a3f401",
    usdc: "0xa6705a10bb756b5dea144591118be77d7af0c3eee3bf2dfe2583dcb0364fefab",
    poolManager: "0x83b2af6e9f3158defc2811cbcb0db71ecf8b2ba2abea39c39e370ac5c6f43eb6",
    positionManager: "0x243f9e091ddf11c7c04e28059fdbbf1bab82b72d414fafb8e096c097aaeb622a",
    vault: "0x977e1e981c1ecd44e7f2ea1308786991e86212d762c0cbacfdaf6490065352dc",
    hook: "0x895c2347090d7a12acdb84e7e16c143053de6283e9f53b825bdd2d59e92a5ae3",
    compounder: "0x67f1603262286843367da39f20ed1adbb906714dffd548c62968e13a5b00aaf7",
  }),
});

export const MULTISEND_CALL_ONLY = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";
export const MULTISEND_CALL_ONLY_RUNTIME_CODE_HASH =
  "0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939";
export const ERC721_RECEIVED_SELECTOR = "0x150b7a02";

function generatedArtifact(relativePath: string): { abi: InterfaceAbi } {
  const artifactPath = resolve(repoRoot, "artifacts", "contracts", "v4", relativePath);
  if (!existsSync(artifactPath)) {
    throw new Error(`Missing generated active-v4 artifact: ${relativePath}. Run npm run build first.`);
  }
  const parsed = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi?: InterfaceAbi };
  if (!parsed.abi || !Array.isArray(parsed.abi)) {
    throw new Error(`Generated artifact has no ABI: ${relativePath}`);
  }
  return { abi: parsed.abi };
}

function reviewedRecoveryKind(name: string): bigint {
  const source = readFileSync(resolve(repoRoot, "contracts", "v4", "NARALiquidityCompounderV4.sol"), "utf8");
  const match = source.match(/enum\s+RecoveryKind\s*\{([^}]*)\}/m);
  if (!match) throw new Error("RecoveryKind enum is missing from active compounder source");
  const members = match[1].split(",").map((member) => member.trim()).filter(Boolean);
  const reviewedOrder = ["None", "MigratePosition", "RecoverPoolTokens", "WindDown"];
  if (members.length !== reviewedOrder.length || members.some((member, index) => member !== reviewedOrder[index])) {
    throw new Error("RecoveryKind enum order differs from the reviewed deployed source");
  }
  const index = members.indexOf(name);
  if (index < 0) throw new Error(`RecoveryKind ${name} is missing`);
  return BigInt(index);
}

export const WIND_DOWN_RECOVERY_KIND = reviewedRecoveryKind("WindDown");

const VAULT_ARTIFACT = generatedArtifact("NARALiquidityGrowthVault.sol/NARALiquidityGrowthVault.json");
const HOOK_ARTIFACT = generatedArtifact("NARALiquidityGrowthHook.sol/NARALiquidityGrowthHook.json");
const COMPOUNDER_ARTIFACT = generatedArtifact("NARALiquidityCompounderV4.sol/NARALiquidityCompounderV4.json");
const VAULT_ABI = VAULT_ARTIFACT.abi;
const HOOK_ABI = HOOK_ARTIFACT.abi;
const COMPOUNDER_ABI = COMPOUNDER_ARTIFACT.abi;

const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128)",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,uint256 info)",
  "function modifyLiquidities(bytes unlockData,uint256 deadline) payable",
];

const POOL_MANAGER_ABI = [
  "function extsload(bytes32 slot) view returns (bytes32 value)",
  "function extsload(bytes32 startSlot,uint256 nSlots) view returns (bytes32[] values)",
];

const SAFE_ABI = [
  "function VERSION() view returns (string)",
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getModulesPaginated(address start,uint256 pageSize) view returns (address[] modules,address next)",
  "function onERC721Received(address operator,address from,uint256 tokenId,bytes data) view returns (bytes4)",
  "function simulateAndRevert(address targetContract,bytes calldataPayload)",
];

const MULTISEND_ABI = ["function multiSend(bytes transactions)"];

const Q96 = 1n << 96n;
const Q128 = 1n << 128n;
const Q192 = 1n << 192n;
const UINT128_MASK = (1n << 128n) - 1n;
const UINT256_MODULUS = 1n << 256n;
const UINT256_MASK = UINT256_MODULUS - 1n;
const POOLS_STORAGE_SLOT = 6n;
const POOL_FEE_GROWTH_GLOBAL_OFFSET = 1n;
const POOL_ACTIVE_LIQUIDITY_OFFSET = 3n;
const POOL_TICKS_OFFSET = 4n;
const POOL_POSITIONS_OFFSET = 6n;
const DECREASE_LIQUIDITY_ACTION = 0x01;
const TAKE_ACTION = 0x0e;
const OPEN_DELTA = 0n;

type PoolKeySnapshot = {
  currency0: string;
  currency1: string;
  fee: bigint;
  tickSpacing: bigint;
  hooks: string;
};

export type PositionInventory = {
  principal0: bigint;
  principal1: bigint;
  collectableFees0: bigint;
  collectableFees1: bigint;
  withdrawable0: bigint;
  withdrawable1: bigint;
};

export type RecoveryProposalCall =
  | {
    target: "vault";
    to: string;
    value: "0";
    functionName: "setCompoundKeeper";
    args: [string, false];
  }
  | {
    target: "compounder";
    to: string;
    value: "0";
    functionName: "proposeRecovery";
    args: [bigint, string];
  };

export type RecoveryProposalValidationInput = {
  chainId: bigint;
  expected: {
    safe: string;
    vault: string;
    hook: string;
    compounder: string;
    nara: string;
    usdc: string;
    poolManager: string;
    positionManager: string;
    keeper: string;
    seedPositionTokenId: bigint;
    poolId: string;
    poolFee: bigint;
    tickSpacing: bigint;
  };
  safe: {
    runtimeCodeHash: string;
    version: string;
    threshold: bigint;
    owners: string[];
    modules: string[];
    nextModule: string;
    erc721ReceiverSelector: string;
  };
  owners: {
    vault: string;
    hook: string;
    compounder: string;
  };
  runtimeCodeHashes: {
    nara: string;
    usdc: string;
    poolManager: string;
    positionManager: string;
    vault: string;
    hook: string;
    compounder: string;
  };
  vault: {
    token: string;
    base: string;
    hook: string;
    compounder: string;
    routeMode: bigint;
    compounderFrozen: boolean;
    keeperAuthorized: boolean;
  };
  hook: {
    token: string;
    base: string;
    vault: string;
    poolRegistered: boolean;
  };
  compounder: {
    vault: string;
    nara: string;
    usdc: string;
    poolManager: string;
    positionManager: string;
    positionTokenId: bigint;
    positionOwner: string;
    positionLiquidity: bigint;
    totalLiquidityAdded: bigint;
    recoveryDelay: bigint;
    pendingRecovery: {
      kind: bigint;
      to: string;
      eta: bigint;
    };
  };
  seedPosition: {
    tokenId: bigint;
    owner: string;
    liquidity: bigint;
  };
};

function checkedAddress(label: string, value: string): string {
  try {
    const address = ethers.getAddress(value);
    if (address === ethers.ZeroAddress) throw new Error("zero address");
    return address;
  } catch {
    throw new Error(`${label} must be a nonzero address`);
  }
}

function requireAddressMatch(label: string, actual: string, expected: string): void {
  if (ethers.getAddress(actual) !== ethers.getAddress(expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function uint256Word(value: bigint): string {
  if (value < 0n || value > UINT256_MASK) throw new Error("Value does not fit uint256");
  return ethers.zeroPadValue(ethers.toBeHex(value), 32);
}

function addStorageSlot(slot: string, offset: bigint): string {
  return uint256Word((BigInt(slot) + offset) & UINT256_MASK);
}

function subtractModulo256(...values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  let result = values[0];
  for (let index = 1; index < values.length; index += 1) {
    result = (result - values[index]) & UINT256_MASK;
  }
  return result;
}

function signed24(value: bigint): number {
  const raw = Number(value & 0xff_ffffn);
  return raw >= 0x80_0000 ? raw - 0x100_0000 : raw;
}

/** Decode PositionManager's packed PositionInfo tick fields. */
export function decodePositionTicks(positionInfo: bigint): { tickLower: number; tickUpper: number } {
  return {
    tickLower: signed24(positionInfo >> 8n),
    tickUpper: signed24(positionInfo >> 32n),
  };
}

/** Exact TypeScript port of Uniswap v4 TickMath.getSqrtPriceAtTick. */
export function sqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || Math.abs(tick) > 887_272) {
    throw new Error(`Invalid Uniswap tick: ${tick}`);
  }
  const absTick = Math.abs(tick);
  let price = (absTick & 0x1) !== 0
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n;
  const factors: readonly [number, bigint][] = [
    [0x2, 0xfff97272373d413259a46990580e213an],
    [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
    [0x10, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20, 0xff973b41fa98c081472e6896dfb254c0n],
    [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80, 0xfe5dee046a99a2a811c461f1969c3053n],
    [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200, 0xf987a7253ac413176f2b074cf7815e54n],
    [0x400, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n],
    [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n],
    [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000, 0x31be135f97d08fd981231505542fcfa6n],
    [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000, 0x5d6af8dedb81196699c329225ee604n],
    [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [mask, factor] of factors) {
    if ((absTick & mask) !== 0) price = (price * factor) >> 128n;
  }
  if (tick > 0) price = UINT256_MASK / price;
  return (price + ((1n << 32n) - 1n)) >> 32n;
}

function amount0DeltaRoundDown(sqrtPriceAX96: bigint, sqrtPriceBX96: bigint, liquidity: bigint): bigint {
  const [lower, upper] = sqrtPriceAX96 <= sqrtPriceBX96
    ? [sqrtPriceAX96, sqrtPriceBX96]
    : [sqrtPriceBX96, sqrtPriceAX96];
  if (lower <= 0n) throw new Error("Lower sqrt price must be positive");
  return ((((liquidity << 96n) * (upper - lower)) / upper) / lower);
}

function amount1DeltaRoundDown(sqrtPriceAX96: bigint, sqrtPriceBX96: bigint, liquidity: bigint): bigint {
  const difference = sqrtPriceAX96 >= sqrtPriceBX96
    ? sqrtPriceAX96 - sqrtPriceBX96
    : sqrtPriceBX96 - sqrtPriceAX96;
  return (liquidity * difference) / Q96;
}

/** Principal returned by a full decrease, matching v4's round-down removal math. */
export function positionPrincipalAtSpot(input: {
  liquidity: bigint;
  sqrtPriceX96: bigint;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
}): { amount0: bigint; amount1: bigint } {
  if (input.liquidity <= 0n) throw new Error("Position liquidity must be positive");
  if (input.tickLower >= input.tickUpper) throw new Error("Position ticks are invalid");
  const sqrtLower = sqrtPriceAtTick(input.tickLower);
  const sqrtUpper = sqrtPriceAtTick(input.tickUpper);
  if (input.currentTick < input.tickLower) {
    return {
      amount0: amount0DeltaRoundDown(sqrtLower, sqrtUpper, input.liquidity),
      amount1: 0n,
    };
  }
  if (input.currentTick < input.tickUpper) {
    return {
      amount0: amount0DeltaRoundDown(input.sqrtPriceX96, sqrtUpper, input.liquidity),
      amount1: amount1DeltaRoundDown(sqrtLower, input.sqrtPriceX96, input.liquidity),
    };
  }
  return {
    amount0: 0n,
    amount1: amount1DeltaRoundDown(sqrtLower, sqrtUpper, input.liquidity),
  };
}

/** Fees currently collectable when the position is touched. */
export function positionFeesFromGrowth(input: {
  liquidity: bigint;
  feeGrowthInside0X128: bigint;
  feeGrowthInside1X128: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
}): { amount0: bigint; amount1: bigint } {
  return {
    amount0:
      (subtractModulo256(input.feeGrowthInside0X128, input.feeGrowthInside0LastX128) * input.liquidity) / Q128,
    amount1:
      (subtractModulo256(input.feeGrowthInside1X128, input.feeGrowthInside1LastX128) * input.liquidity) / Q128,
  };
}

/** Raw-USDC spot quote only; no fee, slippage, impact, or executable route is implied. */
export function naraToUsdcSpotRaw(
  naraRaw: bigint,
  sqrtPriceX96: bigint,
  naraIsCurrency0: boolean,
): bigint {
  if (naraRaw < 0n || sqrtPriceX96 <= 0n) throw new Error("Invalid spot quote inputs");
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  return naraIsCurrency0
    ? (naraRaw * priceX192) / Q192
    : (naraRaw * Q192) / priceX192;
}

/** Diagnostic full-decrease payload. It is simulated only and never added to the Safe batch. */
export function fullDecreaseUnlockData(input: {
  tokenId: bigint;
  liquidity: bigint;
  recipient: string;
  currency0: string;
  currency1: string;
}): string {
  if (input.tokenId <= 0n || input.liquidity <= 0n) throw new Error("Position must be liquid");
  const recipient = checkedAddress("Withdrawal recipient", input.recipient);
  const currency0 = checkedAddress("Currency0", input.currency0);
  const currency1 = checkedAddress("Currency1", input.currency1);
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const actions = ethers.hexlify(new Uint8Array([
    DECREASE_LIQUIDITY_ACTION,
    TAKE_ACTION,
    TAKE_ACTION,
  ]));
  const decrease = abi.encode(
    ["uint256", "uint128", "uint128", "uint128", "bytes"],
    [input.tokenId, input.liquidity, 0n, 0n, "0x"],
  );
  const take0 = abi.encode(["address", "address", "uint256"], [currency0, recipient, OPEN_DELTA]);
  const take1 = abi.encode(["address", "address", "uint256"], [currency1, recipient, OPEN_DELTA]);
  return abi.encode(["bytes", "bytes[]"], [actions, [decrease, take0, take1]]);
}

/** Safe MultiSendCallOnly payload: normal CALL operation only, in listed order. */
export function encodeMultiSendCalls(
  calls: readonly { to: string; value: string; data: string }[],
): string {
  if (calls.length === 0) throw new Error("MultiSend plan cannot be empty");
  return ethers.hexlify(ethers.concat(calls.map((call) => {
    const to = checkedAddress("MultiSend target", call.to);
    const value = BigInt(call.value);
    if (value < 0n) throw new Error("MultiSend value cannot be negative");
    const data = ethers.getBytes(call.data);
    return ethers.concat([
      ethers.toBeHex(0, 1),
      to,
      ethers.toBeHex(value, 32),
      ethers.toBeHex(data.length, 32),
      data,
    ]);
  })));
}

function nestedErrorData(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.data === "string" && ethers.isHexString(record.data)) return record.data;
  return nestedErrorData(record.error) ?? nestedErrorData(record.info);
}

function decodeSimulateAndRevert(error: unknown): { success: boolean; response: string } {
  const data = nestedErrorData(error);
  if (!data || ethers.dataLength(data) < 64) {
    throw new Error("Safe simulateAndRevert did not return its canonical result payload");
  }
  const bytes = ethers.getBytes(data);
  const success = BigInt(ethers.hexlify(bytes.slice(0, 32))) === 1n;
  const responseSize = Number(BigInt(ethers.hexlify(bytes.slice(32, 64))));
  if (!Number.isSafeInteger(responseSize) || bytes.length !== 64 + responseSize) {
    throw new Error("Safe simulateAndRevert result payload has an invalid length");
  }
  return { success, response: ethers.hexlify(bytes.slice(64)) };
}

/** Return the only two calls allowed in the first recovery proposal batch. */
export function recoveryProposalCallPlan(input: {
  safe: string;
  vault: string;
  compounder: string;
  keeper: string;
}): RecoveryProposalCall[] {
  const safe = checkedAddress("Safe", input.safe);
  const vault = checkedAddress("Vault", input.vault);
  const compounder = checkedAddress("Compounder", input.compounder);
  const keeper = checkedAddress("Compound keeper", input.keeper);
  if (keeper === safe) throw new Error("Compound keeper must be separate from the Safe");
  if (vault === compounder) throw new Error("Vault and compounder must be separate contracts");

  return [
    {
      target: "vault",
      to: vault,
      value: "0",
      functionName: "setCompoundKeeper",
      args: [keeper, false],
    },
    {
      target: "compounder",
      to: compounder,
      value: "0",
      functionName: "proposeRecovery",
      args: [WIND_DOWN_RECOVERY_KIND, safe],
    },
  ];
}

/** Fail closed unless the pinned live snapshot is the intended active stack. */
export function validateRecoveryProposalState(state: RecoveryProposalValidationInput): void {
  if (state.chainId !== BASE_CHAIN_ID) {
    throw new Error(`Recovery proposal requires Base chain ${BASE_CHAIN_ID}, got ${state.chainId}`);
  }

  const expected = {
    safe: checkedAddress("Expected Safe", state.expected.safe),
    vault: checkedAddress("Expected vault", state.expected.vault),
    hook: checkedAddress("Expected hook", state.expected.hook),
    compounder: checkedAddress("Expected compounder", state.expected.compounder),
    nara: checkedAddress("Expected NARA", state.expected.nara),
    usdc: checkedAddress("Expected USDC", state.expected.usdc),
    poolManager: checkedAddress("Expected PoolManager", state.expected.poolManager),
    positionManager: checkedAddress("Expected PositionManager", state.expected.positionManager),
    keeper: checkedAddress("Expected compound keeper", state.expected.keeper),
  };

  requireAddressMatch("configured custody Safe", expected.safe, CANONICAL_CUSTODY_SAFE);
  requireAddressMatch("configured compound keeper", expected.keeper, CANONICAL_COMPOUND_KEEPER);
  for (const [label, actual, canonical] of [
    ["configured vault", expected.vault, CANONICAL_ACTIVE_LIQUIDITY_STACK.vault],
    ["configured hook", expected.hook, CANONICAL_ACTIVE_LIQUIDITY_STACK.hook],
    ["configured compounder", expected.compounder, CANONICAL_ACTIVE_LIQUIDITY_STACK.compounder],
    ["configured NARA", expected.nara, CANONICAL_ACTIVE_LIQUIDITY_STACK.nara],
    ["configured USDC", expected.usdc, CANONICAL_ACTIVE_LIQUIDITY_STACK.usdc],
    ["configured PoolManager", expected.poolManager, CANONICAL_ACTIVE_LIQUIDITY_STACK.poolManager],
    ["configured PositionManager", expected.positionManager, CANONICAL_ACTIVE_LIQUIDITY_STACK.positionManager],
  ] as const) {
    requireAddressMatch(label, actual, canonical);
  }
  for (const key of [
    "nara",
    "usdc",
    "poolManager",
    "positionManager",
    "vault",
    "hook",
    "compounder",
  ] as const) {
    if (state.runtimeCodeHashes[key].toLowerCase() !== CANONICAL_ACTIVE_LIQUIDITY_STACK.runtimeCodeHashes[key]) {
      throw new Error(`${key} runtime code hash is not canonical`);
    }
  }
  if (state.expected.poolId.toLowerCase() !== CANONICAL_ACTIVE_LIQUIDITY_STACK.poolId) {
    throw new Error("Configured pool ID is not the canonical active pool");
  }
  if (
    state.expected.seedPositionTokenId !== CANONICAL_ACTIVE_LIQUIDITY_STACK.seedPositionTokenId
    || state.expected.poolFee !== CANONICAL_ACTIVE_LIQUIDITY_STACK.poolFee
    || state.expected.tickSpacing !== CANONICAL_ACTIVE_LIQUIDITY_STACK.tickSpacing
  ) {
    throw new Error("Configured seed NFT, pool fee, or tick spacing is not canonical");
  }
  if (expected.keeper === expected.safe) {
    throw new Error("Configured compound keeper must be separate from the Safe");
  }
  if (state.safe.runtimeCodeHash.toLowerCase() !== CANONICAL_SAFE_RUNTIME_CODE_HASH) {
    throw new Error("Recovery destination Safe runtime code hash is not canonical");
  }
  if (state.safe.version !== CANONICAL_SAFE_VERSION) {
    throw new Error(`Recovery destination Safe version must be ${CANONICAL_SAFE_VERSION}`);
  }
  if (
    state.safe.threshold !== CANONICAL_SAFE_THRESHOLD
    || state.safe.owners.length !== CANONICAL_SAFE_OWNERS.length
  ) {
    throw new Error("Recovery destination Safe must retain the reviewed 2-of-3 posture");
  }
  const safeOwners = state.safe.owners.map((owner) => checkedAddress("Safe owner", owner));
  if (new Set(safeOwners).size !== safeOwners.length) {
    throw new Error("Recovery destination Safe owner list contains duplicates");
  }
  const actualOwnerSet = new Set(safeOwners.map((owner) => owner.toLowerCase()));
  if (!CANONICAL_SAFE_OWNERS.every((owner) => actualOwnerSet.has(owner.toLowerCase()))) {
    throw new Error("Recovery destination Safe owner set changed without review");
  }
  if (state.safe.modules.length !== 0) {
    throw new Error("Recovery destination Safe has enabled modules");
  }
  requireAddressMatch("Safe module pagination sentinel", state.safe.nextModule, SAFE_MODULE_SENTINEL);
  if (state.safe.erc721ReceiverSelector.toLowerCase() !== ERC721_RECEIVED_SELECTOR) {
    throw new Error("Recovery destination Safe cannot receive the LP ERC-721");
  }

  for (const [label, actual] of [
    ["vault owner", state.owners.vault],
    ["hook owner", state.owners.hook],
    ["compounder owner", state.owners.compounder],
  ] as const) {
    requireAddressMatch(label, actual, expected.safe);
  }

  for (const [label, actual, wanted] of [
    ["vault token", state.vault.token, expected.nara],
    ["vault base", state.vault.base, expected.usdc],
    ["vault hook", state.vault.hook, expected.hook],
    ["vault compounder", state.vault.compounder, expected.compounder],
    ["hook token", state.hook.token, expected.nara],
    ["hook base", state.hook.base, expected.usdc],
    ["hook vault", state.hook.vault, expected.vault],
    ["compounder vault", state.compounder.vault, expected.vault],
    ["compounder NARA", state.compounder.nara, expected.nara],
    ["compounder USDC", state.compounder.usdc, expected.usdc],
    ["compounder PoolManager", state.compounder.poolManager, expected.poolManager],
    ["compounder PositionManager", state.compounder.positionManager, expected.positionManager],
  ] as const) {
    requireAddressMatch(label, actual, wanted);
  }

  if (!state.hook.poolRegistered) throw new Error("Active hook pool is not registered");
  if (state.vault.routeMode !== 0n) {
    throw new Error(`Vault routeMode must be Liquidity (0), got ${state.vault.routeMode}`);
  }
  if (!state.vault.compounderFrozen) throw new Error("Active compounder is not frozen");
  if (!state.vault.keeperAuthorized) throw new Error("Configured compound keeper is not currently authorized");
  if (state.expected.seedPositionTokenId <= 0n) throw new Error("Configured seed LP token ID is missing");
  if (state.seedPosition.tokenId !== state.expected.seedPositionTokenId) {
    throw new Error("Seed LP token ID does not match the active configuration");
  }
  if (state.seedPosition.liquidity <= 0n) throw new Error("Seed LP position has no liquidity");
  requireAddressMatch("seed LP owner", state.seedPosition.owner, expected.safe);

  if (state.compounder.positionTokenId <= 0n) throw new Error("Compounder LP token ID is missing");
  if (state.compounder.positionTokenId !== CANONICAL_ACTIVE_LIQUIDITY_STACK.compounderPositionTokenId) {
    throw new Error("Compounder LP token ID is not canonical");
  }
  if (BigInt(state.compounder.positionTokenId) === BigInt(state.seedPosition.tokenId)) {
    throw new Error("Seed and compounder LP token IDs must be distinct");
  }
  if (state.compounder.positionLiquidity <= 0n) throw new Error("Compounder LP position has no liquidity");
  if (state.compounder.totalLiquidityAdded <= 0n) throw new Error("Compounder has no lifetime liquidity evidence");
  requireAddressMatch("compounder LP owner", state.compounder.positionOwner, expected.compounder);

  if (state.compounder.recoveryDelay !== RECOVERY_DELAY_SECONDS) {
    throw new Error(
      `Compounder recovery delay must be ${RECOVERY_DELAY_SECONDS} seconds, got ${state.compounder.recoveryDelay}`,
    );
  }
  const pending = state.compounder.pendingRecovery;
  if (pending.kind !== 0n || pending.to !== ethers.ZeroAddress || pending.eta !== 0n) {
    throw new Error("Compounder already has a pending recovery");
  }
}

export function recoveryEtaProjection(
  snapshotTimestamp: bigint,
  recoveryDelay: bigint = RECOVERY_DELAY_SECONDS,
): { unix: string; iso: string } {
  if (snapshotTimestamp < 0n) throw new Error("Snapshot timestamp cannot be negative");
  if (recoveryDelay <= 0n) throw new Error("Recovery delay must be positive");
  const eta = snapshotTimestamp + recoveryDelay;
  const milliseconds = eta * 1_000n;
  if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Projected recovery ETA exceeds the supported date range");
  }
  return { unix: eta.toString(), iso: new Date(Number(milliseconds)).toISOString() };
}

async function main(): Promise<void> {
  const config = currentV4Config();
  const safeAddress = checkedAddress("V4_SAFE", requiredEnv("V4_SAFE"));
  const compounderAddress = checkedAddress("V4_COMPOUNDER", requiredEnv("V4_COMPOUNDER"));
  const keeperAddress = CANONICAL_COMPOUND_KEEPER;
  const configuredKeeper = process.env.V4_COMPOUND_KEEPER_ADDRESS?.trim();
  if (configuredKeeper) {
    requireAddressMatch(
      "V4_COMPOUND_KEEPER_ADDRESS",
      checkedAddress("V4_COMPOUND_KEEPER_ADDRESS", configuredKeeper),
      keeperAddress,
    );
  }

  const request = new ethers.FetchRequest(requiredBaseRpcUrl());
  request.timeout = 30_000;
  const provider = new ethers.JsonRpcProvider(request, Number(BASE_CHAIN_ID), {
    staticNetwork: true,
    batchMaxCount: 1,
  });

  try {
    const [network, block] = await Promise.all([provider.getNetwork(), provider.getBlock("latest")]);
    if (!block) throw new Error("Latest Base block is unavailable");
    if (network.chainId !== BASE_CHAIN_ID) {
      throw new Error(`Recovery proposal requires Base chain ${BASE_CHAIN_ID}, got ${network.chainId}`);
    }
    const blockTag = block.number;
    const callOverrides = { blockTag } as const;

    const vault = new ethers.Contract(config.vault, VAULT_ABI, provider);
    const hook = new ethers.Contract(config.hook, HOOK_ABI, provider);
    const compounder = new ethers.Contract(compounderAddress, COMPOUNDER_ABI, provider);
    const positionManager = new ethers.Contract(config.positionManager, POSITION_MANAGER_ABI, provider);
    const poolManager = new ethers.Contract(config.poolManager, POOL_MANAGER_ABI, provider);
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);

    const runtimeAddresses = {
      nara: config.token,
      usdc: config.base,
      poolManager: config.poolManager,
      positionManager: config.positionManager,
      vault: config.vault,
      hook: config.hook,
      compounder: compounderAddress,
    };
    const runtimeCodeHashes = Object.fromEntries(await Promise.all(
      Object.entries(runtimeAddresses).map(async ([key, address]) => [
        key,
        ethers.keccak256(await provider.getCode(address, blockTag)),
      ]),
    )) as RecoveryProposalValidationInput["runtimeCodeHashes"];
    const multiSendRuntimeCodeHash = ethers.keccak256(await provider.getCode(MULTISEND_CALL_ONLY, blockTag));
    if (multiSendRuntimeCodeHash !== MULTISEND_CALL_ONLY_RUNTIME_CODE_HASH) {
      throw new Error("Safe MultiSendCallOnly runtime code hash is not canonical");
    }

    const [
      safeCode,
      safeVersion,
      safeThreshold,
      safeOwners,
      safeModulesPage,
      vaultOwner,
      vaultToken,
      vaultBase,
      vaultHook,
      vaultCompounder,
      routeMode,
      compounderFrozen,
      keeperAuthorized,
      vaultBalances,
      hookOwner,
      hookToken,
      hookBase,
      hookVault,
      poolRegistered,
      compounderOwner,
      compounderVault,
      compounderNara,
      compounderUsdc,
      compounderPoolManager,
      compounderPositionManager,
      compounderPositionTokenId,
      totalLiquidityAdded,
      totalNaraAdded,
      totalUsdcAdded,
      compounderBanked,
      recoveryDelay,
      pendingRecovery,
    ] = await Promise.all([
      provider.getCode(safeAddress, blockTag),
      safe.VERSION(callOverrides) as Promise<string>,
      safe.getThreshold(callOverrides) as Promise<bigint>,
      safe.getOwners(callOverrides) as Promise<string[]>,
      safe.getModulesPaginated(SAFE_MODULE_SENTINEL, 100n, callOverrides) as Promise<unknown>,
      vault.owner(callOverrides) as Promise<string>,
      vault.token(callOverrides) as Promise<string>,
      vault.base(callOverrides) as Promise<string>,
      vault.hook(callOverrides) as Promise<string>,
      vault.compounder(callOverrides) as Promise<string>,
      vault.routeMode(callOverrides) as Promise<bigint>,
      vault.compounderFrozen(callOverrides) as Promise<boolean>,
      vault.compoundKeeper(keeperAddress, callOverrides) as Promise<boolean>,
      vault.balances(callOverrides) as Promise<{ tokenBalance: bigint; baseBalance: bigint }>,
      hook.owner(callOverrides) as Promise<string>,
      hook.token(callOverrides) as Promise<string>,
      hook.base(callOverrides) as Promise<string>,
      hook.vault(callOverrides) as Promise<string>,
      hook.poolRegistered(callOverrides) as Promise<boolean>,
      compounder.owner(callOverrides) as Promise<string>,
      compounder.vault(callOverrides) as Promise<string>,
      compounder.nara(callOverrides) as Promise<string>,
      compounder.usdc(callOverrides) as Promise<string>,
      compounder.poolManager(callOverrides) as Promise<string>,
      compounder.positionManager(callOverrides) as Promise<string>,
      compounder.positionTokenId(callOverrides) as Promise<bigint>,
      compounder.totalLiquidityAdded(callOverrides) as Promise<bigint>,
      compounder.totalNaraAdded(callOverrides) as Promise<bigint>,
      compounder.totalUsdcAdded(callOverrides) as Promise<bigint>,
      compounder.bankedBalances(callOverrides) as Promise<{ naraBanked: bigint; usdcBanked: bigint }>,
      compounder.RECOVERY_DELAY(callOverrides) as Promise<bigint>,
      compounder.pendingRecovery(callOverrides) as Promise<{ kind: bigint; to: string; eta: bigint }>,
    ]);

    if (compounderPositionTokenId <= 0n) throw new Error("Compounder LP token ID is missing");
    const [
      seedPositionOwner,
      seedPositionLiquidity,
      seedPoolAndPositionInfo,
      compounderPositionOwner,
      compounderPositionLiquidity,
      compounderPoolAndPositionInfo,
    ] =
      await Promise.all([
        positionManager.ownerOf(config.lpTokenId, callOverrides) as Promise<string>,
        positionManager.getPositionLiquidity(config.lpTokenId, callOverrides) as Promise<bigint>,
        positionManager.getPoolAndPositionInfo(config.lpTokenId, callOverrides) as Promise<unknown>,
        positionManager.ownerOf(compounderPositionTokenId, callOverrides) as Promise<string>,
        positionManager.getPositionLiquidity(compounderPositionTokenId, callOverrides) as Promise<bigint>,
        positionManager.getPoolAndPositionInfo(compounderPositionTokenId, callOverrides) as Promise<unknown>,
      ]);
    const safeErc721ReceiverSelector = await safe.onERC721Received(
      compounderAddress,
      compounderAddress,
      compounderPositionTokenId,
      "0x",
      callOverrides,
    ) as string;

    const [seedPoolKey, seedPackedPositionInfo] = seedPoolAndPositionInfo as readonly [PoolKeySnapshot, bigint];
    const [compounderPoolKey, compounderPackedPositionInfo] =
      compounderPoolAndPositionInfo as readonly [PoolKeySnapshot, bigint];
    const [currency0, currency1] = BigInt(config.token) < BigInt(config.base)
      ? [config.token, config.base]
      : [config.base, config.token];
    const expectedPoolKey = {
      currency0,
      currency1,
      fee: BigInt(config.fee),
      tickSpacing: BigInt(config.tickSpacing),
      hooks: config.hook,
    };
    const poolKeyId = (key: PoolKeySnapshot): string => ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,int24,address)"],
        [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]],
      ),
    );
    for (const [label, key] of [
      ["seed LP", seedPoolKey],
      ["compounder LP", compounderPoolKey],
    ] as const) {
      requireAddressMatch(`${label} currency0`, key.currency0, expectedPoolKey.currency0);
      requireAddressMatch(`${label} currency1`, key.currency1, expectedPoolKey.currency1);
      requireAddressMatch(`${label} hook`, key.hooks, expectedPoolKey.hooks);
      if (key.fee !== expectedPoolKey.fee || key.tickSpacing !== expectedPoolKey.tickSpacing) {
        throw new Error(`${label} PoolKey fee or tick spacing mismatch`);
      }
      if (poolKeyId(key).toLowerCase() !== config.poolId.toLowerCase()) {
        throw new Error(`${label} PoolKey ID does not match the active pool`);
      }
    }
    const seedTicks = decodePositionTicks(seedPackedPositionInfo);
    const compounderTicks = decodePositionTicks(compounderPackedPositionInfo);

    // Read the v4 pool's canonical storage at the same pinned block. This is
    // the same StateLibrary layout used by the contracts: slot0, fee growth,
    // ticks, and the two salted PositionManager positions.
    const poolStateSlot = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "bytes32"], [config.poolId, uint256Word(POOLS_STORAGE_SLOT)]),
    );
    const loadWord = async (slot: string): Promise<string> =>
      poolManager["extsload(bytes32)"](slot, callOverrides) as Promise<string>;
    const loadWords = async (slot: string, count: bigint): Promise<string[]> =>
      poolManager["extsload(bytes32,uint256)"](slot, count, callOverrides) as Promise<string[]>;
    const [slot0Word, feeGrowthGlobals, poolActiveLiquidityWord] = await Promise.all([
      loadWord(poolStateSlot),
      loadWords(addStorageSlot(poolStateSlot, POOL_FEE_GROWTH_GLOBAL_OFFSET), 2n),
      loadWord(addStorageSlot(poolStateSlot, POOL_ACTIVE_LIQUIDITY_OFFSET)),
    ]);
    const slot0 = BigInt(slot0Word);
    const sqrtPriceX96 = slot0 & ((1n << 160n) - 1n);
    const currentTick = signed24(slot0 >> 160n);
    if (sqrtPriceX96 <= 0n) throw new Error("Active pool is not initialized");
    const feeGrowthGlobal0X128 = BigInt(feeGrowthGlobals[0]);
    const feeGrowthGlobal1X128 = BigInt(feeGrowthGlobals[1]);
    const poolActiveLiquidity = BigInt(poolActiveLiquidityWord) & UINT128_MASK;
    const ticksMappingSlot = addStorageSlot(poolStateSlot, POOL_TICKS_OFFSET);
    const positionsMappingSlot = addStorageSlot(poolStateSlot, POOL_POSITIONS_OFFSET);

    const feeGrowthInside = async (tickLower: number, tickUpper: number) => {
      const lowerSlot = ethers.keccak256(
        ethers.solidityPacked(["int256", "bytes32"], [BigInt(tickLower), ticksMappingSlot]),
      );
      const upperSlot = ethers.keccak256(
        ethers.solidityPacked(["int256", "bytes32"], [BigInt(tickUpper), ticksMappingSlot]),
      );
      const [lowerWords, upperWords] = await Promise.all([
        loadWords(addStorageSlot(lowerSlot, 1n), 2n),
        loadWords(addStorageSlot(upperSlot, 1n), 2n),
      ]);
      const lower0 = BigInt(lowerWords[0]);
      const lower1 = BigInt(lowerWords[1]);
      const upper0 = BigInt(upperWords[0]);
      const upper1 = BigInt(upperWords[1]);
      if (currentTick < tickLower) {
        return {
          feeGrowthInside0X128: subtractModulo256(lower0, upper0),
          feeGrowthInside1X128: subtractModulo256(lower1, upper1),
        };
      }
      if (currentTick >= tickUpper) {
        return {
          feeGrowthInside0X128: subtractModulo256(upper0, lower0),
          feeGrowthInside1X128: subtractModulo256(upper1, lower1),
        };
      }
      return {
        feeGrowthInside0X128: subtractModulo256(feeGrowthGlobal0X128, lower0, upper0),
        feeGrowthInside1X128: subtractModulo256(feeGrowthGlobal1X128, lower1, upper1),
      };
    };

    const positionInventory = async (
      tokenId: bigint,
      liquidity: bigint,
      ticks: { tickLower: number; tickUpper: number },
    ): Promise<PositionInventory> => {
      const salt = uint256Word(tokenId);
      const positionId = ethers.solidityPackedKeccak256(
        ["address", "int24", "int24", "bytes32"],
        [config.positionManager, ticks.tickLower, ticks.tickUpper, salt],
      );
      const positionSlot = ethers.keccak256(
        ethers.solidityPacked(["bytes32", "bytes32"], [positionId, positionsMappingSlot]),
      );
      const [positionWords, inside] = await Promise.all([
        loadWords(positionSlot, 3n),
        feeGrowthInside(ticks.tickLower, ticks.tickUpper),
      ]);
      const storedLiquidity = BigInt(positionWords[0]) & UINT128_MASK;
      if (storedLiquidity !== liquidity) {
        throw new Error(`PositionManager and PoolManager liquidity disagree for NFT ${tokenId}`);
      }
      const principal = positionPrincipalAtSpot({
        liquidity,
        sqrtPriceX96,
        currentTick,
        tickLower: ticks.tickLower,
        tickUpper: ticks.tickUpper,
      });
      const fees = positionFeesFromGrowth({
        liquidity,
        ...inside,
        feeGrowthInside0LastX128: BigInt(positionWords[1]),
        feeGrowthInside1LastX128: BigInt(positionWords[2]),
      });
      return {
        principal0: principal.amount0,
        principal1: principal.amount1,
        collectableFees0: fees.amount0,
        collectableFees1: fees.amount1,
        withdrawable0: principal.amount0 + fees.amount0,
        withdrawable1: principal.amount1 + fees.amount1,
      };
    };

    const [seedInventory0And1, compounderInventory0And1] = await Promise.all([
      positionInventory(config.lpTokenId, seedPositionLiquidity, seedTicks),
      positionInventory(compounderPositionTokenId, compounderPositionLiquidity, compounderTicks),
    ]);

    const naraIsCurrency0 = ethers.getAddress(currency0) === ethers.getAddress(config.token);
    const denominatedInventory = (inventory: PositionInventory) => naraIsCurrency0
      ? {
        principalNara: inventory.principal0,
        principalUsdc: inventory.principal1,
        collectableNaraFees: inventory.collectableFees0,
        collectableUsdcFees: inventory.collectableFees1,
        withdrawableNara: inventory.withdrawable0,
        withdrawableUsdc: inventory.withdrawable1,
      }
      : {
        principalNara: inventory.principal1,
        principalUsdc: inventory.principal0,
        collectableNaraFees: inventory.collectableFees1,
        collectableUsdcFees: inventory.collectableFees0,
        withdrawableNara: inventory.withdrawable1,
        withdrawableUsdc: inventory.withdrawable0,
      };
    const seedInventory = denominatedInventory(seedInventory0And1);
    const compounderInventory = denominatedInventory(compounderInventory0And1);

    const [safeModules, nextSafeModule] = safeModulesPage as readonly [string[], string];
    const validationState: RecoveryProposalValidationInput = {
      chainId: network.chainId,
      expected: {
        safe: safeAddress,
        vault: config.vault,
        hook: config.hook,
        compounder: compounderAddress,
        nara: config.token,
        usdc: config.base,
        poolManager: config.poolManager,
        positionManager: config.positionManager,
        keeper: keeperAddress,
        seedPositionTokenId: config.lpTokenId,
        poolId: config.poolId,
        poolFee: BigInt(config.fee),
        tickSpacing: BigInt(config.tickSpacing),
      },
      safe: {
        runtimeCodeHash: ethers.keccak256(safeCode),
        version: safeVersion,
        threshold: safeThreshold,
        owners: safeOwners,
        modules: safeModules,
        nextModule: nextSafeModule,
        erc721ReceiverSelector: safeErc721ReceiverSelector,
      },
      owners: { vault: vaultOwner, hook: hookOwner, compounder: compounderOwner },
      runtimeCodeHashes,
      vault: {
        token: vaultToken,
        base: vaultBase,
        hook: vaultHook,
        compounder: vaultCompounder,
        routeMode,
        compounderFrozen,
        keeperAuthorized,
      },
      hook: { token: hookToken, base: hookBase, vault: hookVault, poolRegistered },
      compounder: {
        vault: compounderVault,
        nara: compounderNara,
        usdc: compounderUsdc,
        poolManager: compounderPoolManager,
        positionManager: compounderPositionManager,
        positionTokenId: compounderPositionTokenId,
        positionOwner: compounderPositionOwner,
        positionLiquidity: compounderPositionLiquidity,
        totalLiquidityAdded,
        recoveryDelay,
        pendingRecovery,
      },
      seedPosition: {
        tokenId: config.lpTokenId,
        owner: seedPositionOwner,
        liquidity: seedPositionLiquidity,
      },
    };
    validateRecoveryProposalState(validationState);

    const plan = recoveryProposalCallPlan({
      safe: safeAddress,
      vault: config.vault,
      compounder: compounderAddress,
      keeper: keeperAddress,
    });
    const transactions = plan.map((call) => {
      const contract = call.target === "vault" ? vault : compounder;
      return {
        to: call.to,
        value: call.value,
        data: contract.interface.encodeFunctionData(call.functionName, call.args),
        contractMethod: null,
        contractInputsValues: null,
      };
    });

    const multiSendTransactions = encodeMultiSendCalls(transactions);
    const multiSendPayload = new ethers.Interface(MULTISEND_ABI).encodeFunctionData(
      "multiSend",
      [multiSendTransactions],
    );
    const safeSimulationPayload = safe.interface.encodeFunctionData("simulateAndRevert", [
      MULTISEND_CALL_ONLY,
      multiSendPayload,
    ]);
    let exactBatchSimulation: { success: boolean; response: string };
    try {
      await provider.call({
        from: safeOwners[0],
        to: safeAddress,
        data: safeSimulationPayload,
        gasLimit: 5_000_000n,
        blockTag,
      });
      throw new Error("Safe simulateAndRevert unexpectedly returned without reverting");
    } catch (error) {
      exactBatchSimulation = decodeSimulateAndRevert(error);
    }
    if (!exactBatchSimulation.success) {
      const selector = ethers.dataLength(exactBatchSimulation.response) >= 4
        ? ethers.dataSlice(exactBatchSimulation.response, 0, 4)
        : "empty";
      throw new Error(`Exact Safe MultiSendCallOnly simulation failed (response selector: ${selector})`);
    }

    // Both calls are independent of each other's state transition, so pinned
    // per-call simulation is equivalent for authorization and revert checks.
    await vault.setCompoundKeeper.staticCall(keeperAddress, false, { from: safeAddress, blockTag });
    await compounder.proposeRecovery.staticCall(WIND_DOWN_RECOVERY_KIND, safeAddress, {
      from: safeAddress,
      blockTag,
    });

    // Diagnostic only: prove each full decrease path is accepted by the
    // PositionManager at the snapshot. These payloads are never written into
    // the Safe batch. The compounder-owner eth_call is an authorization-path
    // simulation; the NFT must first move to the Safe through WindDown before
    // a real Safe removal can be built.
    const withdrawalDeadline = BigInt(block.timestamp) + 3_600n;
    const simulateFullDecrease = async (
      from: string,
      tokenId: bigint,
      liquidity: bigint,
    ): Promise<void> => {
      const unlockData = fullDecreaseUnlockData({
        tokenId,
        liquidity,
        recipient: safeAddress,
        currency0,
        currency1,
      });
      const data = positionManager.interface.encodeFunctionData("modifyLiquidities", [
        unlockData,
        withdrawalDeadline,
      ]);
      await provider.call({
        from,
        to: config.positionManager,
        data,
        gasLimit: 2_000_000n,
        blockTag,
      });
    };
    await Promise.all([
      simulateFullDecrease(seedPositionOwner, config.lpTokenId, seedPositionLiquidity),
      simulateFullDecrease(compounderPositionOwner, compounderPositionTokenId, compounderPositionLiquidity),
    ]);

    const eta = recoveryEtaProjection(BigInt(block.timestamp), recoveryDelay);
    const totalPositionLiquidity = seedPositionLiquidity + compounderPositionLiquidity;
    if (totalPositionLiquidity > poolActiveLiquidity) {
      throw new Error("Named protocol position liquidity exceeds active pool liquidity");
    }
    const unattributedActiveLiquidity = poolActiveLiquidity - totalPositionLiquidity;
    const namedProtocolActiveShareBps = poolActiveLiquidity === 0n
      ? 0n
      : (totalPositionLiquidity * 10_000n) / poolActiveLiquidity;
    const totalLpPrincipalNara = seedInventory.principalNara + compounderInventory.principalNara;
    const totalLpPrincipalUsdc = seedInventory.principalUsdc + compounderInventory.principalUsdc;
    const totalLpCollectableNaraFees =
      seedInventory.collectableNaraFees + compounderInventory.collectableNaraFees;
    const totalLpCollectableUsdcFees =
      seedInventory.collectableUsdcFees + compounderInventory.collectableUsdcFees;
    const totalLpWithdrawableNara = seedInventory.withdrawableNara + compounderInventory.withdrawableNara;
    const totalLpWithdrawableUsdc = seedInventory.withdrawableUsdc + compounderInventory.withdrawableUsdc;
    const totalActualNara =
      totalLpWithdrawableNara + vaultBalances.tokenBalance + compounderBanked.naraBanked;
    const totalActualUsdc =
      totalLpWithdrawableUsdc + vaultBalances.baseBalance + compounderBanked.usdcBanked;
    const naraSpotValueUsdc = naraToUsdcSpotRaw(totalActualNara, sqrtPriceX96, naraIsCurrency0);
    const totalSpotUsdcEquivalent = totalActualUsdc + naraSpotValueUsdc;
    const spotPriceScaled18 = naraIsCurrency0
      ? ((sqrtPriceX96 * sqrtPriceX96) * (10n ** 30n)) / Q192
      : (Q192 * (10n ** 30n)) / (sqrtPriceX96 * sqrtPriceX96);
    const tokenAmounts = (inventory: ReturnType<typeof denominatedInventory>) => ({
      principal: {
        naraRaw: inventory.principalNara.toString(),
        nara: ethers.formatUnits(inventory.principalNara, 18),
        usdcRaw: inventory.principalUsdc.toString(),
        usdc: ethers.formatUnits(inventory.principalUsdc, 6),
      },
      collectableFees: {
        naraRaw: inventory.collectableNaraFees.toString(),
        nara: ethers.formatUnits(inventory.collectableNaraFees, 18),
        usdcRaw: inventory.collectableUsdcFees.toString(),
        usdc: ethers.formatUnits(inventory.collectableUsdcFees, 6),
      },
      principalPlusCollectableFees: {
        naraRaw: inventory.withdrawableNara.toString(),
        nara: ethers.formatUnits(inventory.withdrawableNara, 18),
        usdcRaw: inventory.withdrawableUsdc.toString(),
        usdc: ethers.formatUnits(inventory.withdrawableUsdc, 6),
      },
    });
    const output = {
      version: "1.0",
      chainId: BASE_CHAIN_ID.toString(),
      createdAt: Date.now(),
      meta: {
        name: "NARA v4 liquidity-stack recovery proposal",
        description:
          "FIRST STEP ONLY: revoke the dedicated compound keeper and propose a seven-day WindDown recovery. " +
          "No liquidity or tokens move in this batch.",
        txBuilderVersion: "1.18.0",
        createdFromSafeAddress: safeAddress,
        createdFromOwnerAddress: "",
      },
      transactions,
      naraEvidence: {
        changeId: LIQUIDITY_STACK_RESET_CHANGE_ID,
        evidenceState: "tested",
        proposalStatus: "prepared-and-simulated-not-signed-not-submitted",
        network: "base",
        chainId: BASE_CHAIN_ID.toString(),
        snapshotBlock: {
          number: block.number,
          hash: block.hash,
          timestamp: block.timestamp,
          timestampIso: new Date(block.timestamp * 1_000).toISOString(),
        },
        simulation: {
          caller: safeAddress,
          blockNumber: block.number,
          method: "Pinned eth_call/staticCall for each independent call",
          callsSucceeded: 2,
          exactSafeMultiSendCallOnly: "succeeded-and-reverted-read-only",
          multiSendCallOnly: MULTISEND_CALL_ONLY,
          multiSendCallOnlyRuntimeCodeHash: multiSendRuntimeCodeHash,
          exactBatchCalls: 2,
          exactBatchReturnData: exactBatchSimulation.response,
          diagnosticFullDecreaseCallsSucceeded: 2,
          diagnosticFullDecreaseRule:
            "Full DECREASE_LIQUIDITY + TAKE + TAKE calls were simulated independently from each current NFT owner. They are not transactions in this batch.",
          compounderDecreaseCaveat:
            "The compounder-owner eth_call proves the PositionManager authorization/accounting path only. The NFT must first reach the Safe through WindDown before a real Safe decrease can be prepared.",
          broadcast: false,
          signed: false,
          submitted: false,
        },
        custodySafe: {
          address: safeAddress,
          version: safeVersion,
          threshold: safeThreshold.toString(),
          ownerCount: safeOwners.length,
          runtimeCodeHash: ethers.keccak256(safeCode),
          destinationVerified: true,
          canonicalOwnerSetVerified: true,
          enabledModuleCount: safeModules.length,
          modulePaginationNext: nextSafeModule,
          erc721ReceiverSelector: safeErc721ReceiverSelector,
        },
        activeLiquidityStack: {
          nara: config.token,
          usdc: config.base,
          poolManager: config.poolManager,
          positionManager: config.positionManager,
          poolId: config.poolId,
          vault: config.vault,
          hook: config.hook,
          compounder: compounderAddress,
          runtimeCodeHashes,
          generatedAbiSources: {
            vault: "artifacts/contracts/v4/NARALiquidityGrowthVault.sol/NARALiquidityGrowthVault.json",
            hook: "artifacts/contracts/v4/NARALiquidityGrowthHook.sol/NARALiquidityGrowthHook.json",
            compounder: "artifacts/contracts/v4/NARALiquidityCompounderV4.sol/NARALiquidityCompounderV4.json",
          },
          generatedAbiHashes: {
            vault: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(VAULT_ARTIFACT.abi))),
            hook: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(HOOK_ARTIFACT.abi))),
            compounder: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(COMPOUNDER_ARTIFACT.abi))),
          },
          ownersMatchCustodySafe: true,
          reciprocalBindingsVerified: true,
          hookPoolRegistered: poolRegistered,
          vaultRouteMode: "Liquidity",
          compounderFrozen,
        },
        poolSpot: {
          sqrtPriceX96: sqrtPriceX96.toString(),
          tick: currentTick,
          usdcPerNara: ethers.formatUnits(spotPriceScaled18, 18),
          valuationOnly: true,
          warning:
            "Spot conversion is an estimate, not guaranteed proceeds. It excludes hook/swap fees, slippage, price impact, and future state changes.",
        },
        keeper: {
          address: keeperAddress,
          authorizedAtSnapshot: keeperAuthorized,
          proposedAuthorizationAfterBatch: false,
        },
        positions: {
          seedPosition: {
            tokenId: config.lpTokenId.toString(),
            owner: seedPositionOwner,
            liquidity: seedPositionLiquidity.toString(),
            tickLower: seedTicks.tickLower,
            tickUpper: seedTicks.tickUpper,
            ...tokenAmounts(seedInventory),
            fullDecreaseSimulation: "succeeded-read-only-from-current-owner",
            immediateBatchEffect: "none",
          },
          compounderPosition: {
            tokenId: compounderPositionTokenId.toString(),
            owner: compounderPositionOwner,
            liquidity: compounderPositionLiquidity.toString(),
            tickLower: compounderTicks.tickLower,
            tickUpper: compounderTicks.tickUpper,
            lifetimeLiquidityAdded: totalLiquidityAdded.toString(),
            ...tokenAmounts(compounderInventory),
            fullDecreaseSimulation: "succeeded-read-only-owner-context-diagnostic",
            immediateBatchEffect: "none",
          },
          totalPositionLiquidity: totalPositionLiquidity.toString(),
          poolActiveLiquidity: poolActiveLiquidity.toString(),
          namedProtocolActiveLiquidity: totalPositionLiquidity.toString(),
          unattributedActiveLiquidity: unattributedActiveLiquidity.toString(),
          namedProtocolActiveShareBps: namedProtocolActiveShareBps.toString(),
          protocolPositionsEqualAllActivePoolLiquidity: unattributedActiveLiquidity === 0n,
          liquidityScope:
            "poolActiveLiquidity is total in-range pool liquidity; namedProtocolActiveLiquidity is only the two identified full-range protocol positions.",
          bothNftsAndLiquidityRemainInPlaceAfterProposal: true,
        },
        balances: {
          vaultUncompounded: {
            naraRaw: vaultBalances.tokenBalance.toString(),
            nara: ethers.formatUnits(vaultBalances.tokenBalance, 18),
            usdcRaw: vaultBalances.baseBalance.toString(),
            usdc: ethers.formatUnits(vaultBalances.baseBalance, 6),
          },
          compounderBanked: {
            naraRaw: compounderBanked.naraBanked.toString(),
            nara: ethers.formatUnits(compounderBanked.naraBanked, 18),
            usdcRaw: compounderBanked.usdcBanked.toString(),
            usdc: ethers.formatUnits(compounderBanked.usdcBanked, 6),
          },
          compounderLifetimeAdded: {
            naraRaw: totalNaraAdded.toString(),
            nara: ethers.formatUnits(totalNaraAdded, 18),
            usdcRaw: totalUsdcAdded.toString(),
            usdc: ethers.formatUnits(totalUsdcAdded, 6),
          },
        },
        withdrawalInventorySnapshot: {
          scope:
            "Both LP principals, currently collectable LP fees, vault balances, and compounder-banked balances at the pinned snapshot block.",
          lpPrincipal: {
            naraRaw: totalLpPrincipalNara.toString(),
            nara: ethers.formatUnits(totalLpPrincipalNara, 18),
            usdcRaw: totalLpPrincipalUsdc.toString(),
            usdc: ethers.formatUnits(totalLpPrincipalUsdc, 6),
          },
          lpCollectableFees: {
            naraRaw: totalLpCollectableNaraFees.toString(),
            nara: ethers.formatUnits(totalLpCollectableNaraFees, 18),
            usdcRaw: totalLpCollectableUsdcFees.toString(),
            usdc: ethers.formatUnits(totalLpCollectableUsdcFees, 6),
            determination:
              "Calculated from pinned PoolManager feeGrowthInside minus each salted position's last fee growth, multiplied by position liquidity / 2^128.",
          },
          lpPrincipalPlusCollectableFees: {
            naraRaw: totalLpWithdrawableNara.toString(),
            nara: ethers.formatUnits(totalLpWithdrawableNara, 18),
            usdcRaw: totalLpWithdrawableUsdc.toString(),
            usdc: ethers.formatUnits(totalLpWithdrawableUsdc, 6),
          },
          totalActualTokensAcrossScope: {
            naraRaw: totalActualNara.toString(),
            nara: ethers.formatUnits(totalActualNara, 18),
            usdcRaw: totalActualUsdc.toString(),
            usdc: ethers.formatUnits(totalActualUsdc, 6),
            separationRule: "The USDC figure is actual USDC. NARA remains NARA and is not assumed sold.",
          },
          spotValuationEstimate: {
            naraSpotValueUsdcRaw: naraSpotValueUsdc.toString(),
            naraSpotValueUsdc: ethers.formatUnits(naraSpotValueUsdc, 6),
            totalUsdcEquivalentRaw: totalSpotUsdcEquivalent.toString(),
            totalUsdcEquivalent: ethers.formatUnits(totalSpotUsdcEquivalent, 6),
            guaranteed: false,
            swapSimulated: false,
            warning:
              "This marks NARA at the instantaneous pool spot only. A real NARA sale would move this shallow market and incur hook/swap fees, so realizable USDC can be materially lower.",
          },
          timing:
            "Amounts are exact raw-token accounting at the snapshot but remain time-sensitive until liquidity is actually decreased and fees collected.",
        },
        recovery: {
          pendingBeforeBatch: { kind: "None", code: "0", to: ethers.ZeroAddress, eta: "0" },
          proposedKind: { name: "WindDown", code: WIND_DOWN_RECOVERY_KIND.toString() },
          destination: safeAddress,
          delaySeconds: recoveryDelay.toString(),
          delayDays: "7",
          projectedEtaUnix: eta.unix,
          projectedEtaIso: eta.iso,
          projectionRule:
            "Projection uses snapshot block time. The authoritative ETA is pendingRecovery.eta emitted when the Safe executes this proposal.",
          oldStackDelayUnchanged: true,
        },
        replacementRecoveryPolicy: {
          partOfThisBatch: false,
          oldStackRule: "The active old compounder's immutable seven-day delay is unchanged by this proposal.",
          rehearsalRule:
            "Use a disposable replacement rehearsal stack/pool with a one-hour recovery delay only for the complete move, pull, removal, and reseed proof.",
          productionRule:
            "After rehearsal succeeds, deploy a fresh production stack with a recovery delay of at least seven days and permanently seal it before public activation.",
          safetyInvariant:
            "Do not make the production delay decreaseable. Any supported delay transition must be one-way non-decreasing, and sealing must be irreversible.",
        },
        expectedIfSafeExecutes: {
          assetMovement: "none",
          liquidityChange: "none",
          nftMovement: "none",
          dedicatedKeeper: "revoked",
          recoveryClock: "started for WindDown",
        },
        operatorWarnings: [
          "NO BROADCAST: this generator only reads Base, simulates with eth_call, and writes a Safe Transaction Builder file.",
          "DO NOT SIGN OR SUBMIT WITHOUT HUMAN REVIEW through the custody Safe.",
          "Regenerate immediately before Safe execution and abort if any ownership, binding, keeper, NFT, liquidity, or pending-recovery evidence changes.",
          "This batch does not remove liquidity. It leaves both LP NFTs and both liquidity positions in place while the seven-day clock runs.",
          "The inventory is a pinned snapshot, not a guaranteed withdrawal receipt. Recompute it immediately before any later decrease-liquidity batch.",
          "Actual USDC and NARA are listed separately. The USDC-equivalent total is only a no-swap spot mark and must not be described as guaranteed USDC proceeds.",
          "Use the on-chain pendingRecovery.eta after execution; the projected ETA in this file is not execution authority.",
          "A later executeRecovery transfers only the compounder-owned LP NFT and banked NARA/USDC to the Safe; it does not burn that NFT or decrease its liquidity.",
          "The seed LP NFT is already Safe-owned and is untouched by this recovery proposal; any eventual liquidity decrease requires a separately reviewed PositionManager plan.",
          "Revoking the dedicated keeper stops that keeper only. The Safe retains vault owner authority and hook fees may continue to accrue.",
          "The separate one-hour replacement rehearsal policy does not alter this old compounder's immutable seven-day recovery clock and adds no call to this batch.",
        ],
        onchainWritesByGenerator: "none",
      },
    };

    const outputDir = resolve(repoRoot, "deployments");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    const outputPath = resolve(outputDir, "v4-liquidity-stack-recovery-proposal-batch.json");
    writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    console.log(`Safe recovery proposal batch written: ${outputPath}`);
    console.log("Both calls simulated from the custody Safe. Nothing was signed, submitted, or broadcast.");
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
