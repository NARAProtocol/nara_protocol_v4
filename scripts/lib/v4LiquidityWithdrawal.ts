import { ethers } from "ethers";

/**
 * RETIRED HISTORICAL STACK — DO NOT USE AS A CURRENT MANIFEST.
 *
 * These constants exist only to reproduce the completed 2026-08-08
 * withdrawal evidence. Fresh-v4 addresses come from the verified active
 * deployment manifests and must never be inferred from this module.
 */

export const BASE_CHAIN_ID = 8453n;
export const CHANGE_ID = "NARA-20260731-liquidity-stack-reset";
export const SAFE = "0xd65c0e390Dc187A22c52c03816591CC736C0D755";
export const SAFE_VERSION = "1.4.1";
export const SAFE_THRESHOLD = 2n;
export const SAFE_OWNERS = Object.freeze([
  "0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e",
  "0xC019Dc79412c4b20103ac4ce97B2615FF45D490d",
  "0x42365cAE9abB6cb357dd485734CAd75a2d3c6664",
]);
export const SAFE_MODULE_SENTINEL = "0x0000000000000000000000000000000000000001";
export const SAFE_RUNTIME_CODE_HASH =
  "0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c";
export const MULTISEND_CALL_ONLY = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";
export const MULTISEND_RUNTIME_CODE_HASH =
  "0xecd5bd14a08c5d2122379900b2f272bdf107a7e92423c10dd5fe3254386c9939";

export const STACK = Object.freeze({
  nara: "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  rewardReserve: "0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD",
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  positionManager: "0x7C5f5A4bBd8fD63184577525326123B519429bDc",
  vault: "0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d",
  hook: "0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088",
  compounder: "0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98",
  keeper: "0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7",
  poolId: "0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318",
  seedPositionTokenId: 2_884_402n,
  compounderPositionTokenId: 2_885_838n,
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

export type TokenPair = { amount0: bigint; amount1: bigint };
export type SafeCall = {
  to: string;
  value: string;
  data: string;
  contractMethod: null;
  contractInputsValues: null;
};

const Q96 = 1n << 96n;
const UINT256_MASK = (1n << 256n) - 1n;
const BURN_POSITION = 0x03;
const TAKE_PAIR = 0x11;

function checkedAddress(label: string, value: string): string {
  try {
    return ethers.getAddress(value);
  } catch {
    throw new Error(`${label} is not a valid address`);
  }
}

export function bpsFloor(value: bigint, bps: bigint): bigint {
  if (value < 0n || bps < 0n || bps > 10_000n) throw new Error("Invalid BPS input");
  return (value * bps) / 10_000n;
}

export function decodePositionTicks(positionInfo: bigint): { tickLower: number; tickUpper: number } {
  const signed24 = (value: bigint): number => {
    const raw = Number(value & 0xff_ffffn);
    return raw >= 0x80_0000 ? raw - 0x100_0000 : raw;
  };
  return {
    tickLower: signed24(positionInfo >> 8n),
    tickUpper: signed24(positionInfo >> 32n),
  };
}

export function sqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < -887272 || tick > 887272) {
    throw new Error("Tick is outside the Uniswap v4 range");
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

export function positionPrincipalAtSpot(input: {
  liquidity: bigint;
  sqrtPriceX96: bigint;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
}): TokenPair {
  const amount0 = (a: bigint, b: bigint): bigint => {
    const [lower, upper] = a <= b ? [a, b] : [b, a];
    return ((((input.liquidity << 96n) * (upper - lower)) / upper) / lower);
  };
  const amount1 = (a: bigint, b: bigint): bigint =>
    (input.liquidity * (a >= b ? a - b : b - a)) / Q96;
  const lower = sqrtPriceAtTick(input.tickLower);
  const upper = sqrtPriceAtTick(input.tickUpper);
  if (input.currentTick < input.tickLower) return { amount0: amount0(lower, upper), amount1: 0n };
  if (input.currentTick < input.tickUpper) {
    return { amount0: amount0(input.sqrtPriceX96, upper), amount1: amount1(lower, input.sqrtPriceX96) };
  }
  return { amount0: 0n, amount1: amount1(lower, upper) };
}

export function burnPositionUnlockData(input: {
  tokenId: bigint;
  currency0: string;
  currency1: string;
  recipient: string;
  amount0Min: bigint;
  amount1Min: bigint;
}): string {
  if (input.tokenId <= 0n) throw new Error("Position token ID must be positive");
  if (input.amount0Min < 0n || input.amount1Min < 0n) throw new Error("Minimum outputs cannot be negative");
  const currency0 = checkedAddress("Currency0", input.currency0);
  const currency1 = checkedAddress("Currency1", input.currency1);
  const recipient = checkedAddress("Recipient", input.recipient);
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const actions = ethers.hexlify(new Uint8Array([BURN_POSITION, TAKE_PAIR]));
  const burn = abi.encode(
    ["uint256", "uint128", "uint128", "bytes"],
    [input.tokenId, input.amount0Min, input.amount1Min, "0x"],
  );
  const takePair = abi.encode(
    ["address", "address", "address"],
    [currency0, currency1, recipient],
  );
  return abi.encode(["bytes", "bytes[]"], [actions, [burn, takePair]]);
}

export function encodeMultiSendCalls(calls: readonly Pick<SafeCall, "to" | "value" | "data">[]): string {
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

export function withdrawalCallPlan(input: {
  deadline: bigint;
  seedMin: TokenPair;
  compounderMin: TokenPair;
}): SafeCall[] {
  if (input.deadline <= 0n || input.deadline > (1n << 64n) - 1n) throw new Error("Invalid withdrawal deadline");
  const vault = new ethers.Interface([
    "function compoundAll(uint256 minLiquidityAdded,uint64 deadline,bytes data) returns(uint256)",
  ]);
  const compounder = new ethers.Interface(["function executeRecovery()"]);
  const positionManager = new ethers.Interface([
    "function modifyLiquidities(bytes unlockData,uint256 deadline) payable",
  ]);
  const burn = (tokenId: bigint, minimum: TokenPair): string => burnPositionUnlockData({
    tokenId,
    currency0: STACK.nara,
    currency1: STACK.usdc,
    recipient: SAFE,
    amount0Min: minimum.amount0,
    amount1Min: minimum.amount1,
  });
  const call = (to: string, data: string): SafeCall => ({
    to,
    value: "0",
    data,
    contractMethod: null,
    contractInputsValues: null,
  });
  return [
    call(STACK.vault, vault.encodeFunctionData("compoundAll", [1n, input.deadline, "0x"])),
    call(STACK.compounder, compounder.encodeFunctionData("executeRecovery")),
    call(STACK.positionManager, positionManager.encodeFunctionData("modifyLiquidities", [
      burn(STACK.seedPositionTokenId, input.seedMin),
      input.deadline,
    ])),
    call(STACK.positionManager, positionManager.encodeFunctionData("modifyLiquidities", [
      burn(STACK.compounderPositionTokenId, input.compounderMin),
      input.deadline,
    ])),
  ];
}
