import { ethers } from "ethers";

export const V4_LAUNCH_TICK_LOWER = -887220;
export const V4_LAUNCH_TICK_UPPER = 887220;

const MINT_POSITION = 0x02;
const SETTLE_PAIR = 0x0d;

const ERC20 = new ethers.Interface([
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const PERMIT2 = new ethers.Interface([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const HOOK = new ethers.Interface([
  "function registerPool((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,uint160 expectedSqrtPriceX96)",
]);
const POSITION_MANAGER = new ethers.Interface([
  "function initializePool((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key,uint160 sqrtPriceX96) payable returns (int24)",
  "function modifyLiquidities(bytes unlockData,uint256 deadline) payable",
  "function multicall(bytes[] data) payable returns (bytes[])",
]);

export interface AtomicPoolLaunchInput {
  nara: string;
  usdc: string;
  permit2: string;
  positionManager: string;
  hook: string;
  lpOwner: string;
  fee: number;
  tickSpacing: number;
  naraAmount: bigint;
  usdcAmount: bigint;
  deadline: bigint;
}

export interface SafeCall {
  to: string;
  value: string;
  data: string;
  operation: 0;
}

export interface AtomicPoolLaunchPlan {
  currency0: string;
  currency1: string;
  poolKey: readonly [string, string, number, number, string];
  poolId: string;
  expectedSqrtPriceX96: bigint;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
  transactions: SafeCall[];
}

function integerSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("Cannot take the square root of a negative value");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + value / x) >> 1n;
  }
  return x;
}

function checkedAddress(label: string, value: string): string {
  const address = ethers.getAddress(value);
  if (address === ethers.ZeroAddress) throw new Error(`${label} is zero`);
  return address;
}

export function buildAtomicV4PoolLaunch(input: AtomicPoolLaunchInput): AtomicPoolLaunchPlan {
  const nara = checkedAddress("nara", input.nara);
  const usdc = checkedAddress("usdc", input.usdc);
  const permit2 = checkedAddress("permit2", input.permit2);
  const positionManager = checkedAddress("positionManager", input.positionManager);
  const hook = checkedAddress("hook", input.hook);
  const lpOwner = checkedAddress("lpOwner", input.lpOwner);
  if (nara === usdc) throw new Error("NARA and USDC must differ");
  if (input.naraAmount <= 0n || input.usdcAmount <= 0n) throw new Error("Seed amounts must be positive");
  if (input.naraAmount > (1n << 160n) - 1n || input.usdcAmount > (1n << 160n) - 1n) {
    throw new Error("Seed amount exceeds Permit2 uint160 capacity");
  }
  if (input.deadline <= 0n || input.deadline > (1n << 48n) - 1n) throw new Error("Invalid launch deadline");

  const [currency0, currency1] = BigInt(nara) < BigInt(usdc) ? [nara, usdc] : [usdc, nara];
  const naraIsCurrency0 = currency0 === nara;
  const amount0Max = naraIsCurrency0 ? input.naraAmount : input.usdcAmount;
  const amount1Max = naraIsCurrency0 ? input.usdcAmount : input.naraAmount;
  const expectedSqrtPriceX96 = integerSqrt((amount1Max * (1n << 192n)) / amount0Max);
  const q96 = 1n << 96n;
  const liquidity0 = (amount0Max * expectedSqrtPriceX96) / q96;
  const liquidity1 = (amount1Max * q96) / expectedSqrtPriceX96;
  const liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
  if (liquidity <= 0n) throw new Error("Seed liquidity rounds to zero");

  const poolKey = [currency0, currency1, input.fee, input.tickSpacing, hook] as const;
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const poolId = ethers.keccak256(
    abi.encode(["tuple(address,address,uint24,int24,address)"], [poolKey]),
  );
  const mintParams = abi.encode(
    [
      "tuple(address,address,uint24,int24,address)",
      "int24",
      "int24",
      "uint256",
      "uint128",
      "uint128",
      "address",
      "bytes",
    ],
    [
      poolKey,
      V4_LAUNCH_TICK_LOWER,
      V4_LAUNCH_TICK_UPPER,
      liquidity,
      amount0Max,
      amount1Max,
      lpOwner,
      "0x",
    ],
  );
  const settleParams = abi.encode(["address", "address"], [currency0, currency1]);
  const actions = ethers.hexlify(new Uint8Array([MINT_POSITION, SETTLE_PAIR]));
  const unlockData = abi.encode(["bytes", "bytes[]"], [actions, [mintParams, settleParams]]);
  const initializeCall = POSITION_MANAGER.encodeFunctionData("initializePool", [poolKey, expectedSqrtPriceX96]);
  const mintCall = POSITION_MANAGER.encodeFunctionData("modifyLiquidities", [unlockData, input.deadline]);
  const seedCall = POSITION_MANAGER.encodeFunctionData("multicall", [[initializeCall, mintCall]]);

  const call = (to: string, data: string): SafeCall => ({ to, value: "0", data, operation: 0 });
  const transactions: SafeCall[] = [
    call(nara, ERC20.encodeFunctionData("approve", [permit2, input.naraAmount])),
    call(usdc, ERC20.encodeFunctionData("approve", [permit2, input.usdcAmount])),
    call(
      permit2,
      PERMIT2.encodeFunctionData("approve", [nara, positionManager, input.naraAmount, input.deadline]),
    ),
    call(
      permit2,
      PERMIT2.encodeFunctionData("approve", [usdc, positionManager, input.usdcAmount, input.deadline]),
    ),
    call(hook, HOOK.encodeFunctionData("registerPool", [poolKey, expectedSqrtPriceX96])),
    call(positionManager, seedCall),
    call(permit2, PERMIT2.encodeFunctionData("approve", [nara, positionManager, 0n, 0n])),
    call(permit2, PERMIT2.encodeFunctionData("approve", [usdc, positionManager, 0n, 0n])),
    call(nara, ERC20.encodeFunctionData("approve", [permit2, 0n])),
    call(usdc, ERC20.encodeFunctionData("approve", [permit2, 0n])),
  ];

  return {
    currency0,
    currency1,
    poolKey,
    poolId,
    expectedSqrtPriceX96,
    liquidity,
    amount0Max,
    amount1Max,
    transactions,
  };
}
