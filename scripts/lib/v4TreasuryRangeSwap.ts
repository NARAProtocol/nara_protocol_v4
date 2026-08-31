import { ethers } from "ethers";
import type { CanonicalV4PoolKey } from "./v4LiveConfig.js";
import type { FeeCurveState } from "./v4TreasuryRangeState.js";

export const V4_SWAP_COMMAND = 0x10;
export const SWAP_EXACT_IN_SINGLE_ACTION = 0x06;
export const SETTLE_ACTION = 0x0b;
export const SETTLE_ALL_ACTION = 0x0c;
export const TAKE_ALL_ACTION = 0x0f;
export const V4_BEFORE_SWAP_SELECTOR = "0x575e24b4";
export const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
export const BPS = 10_000n;
export const PIPS_DENOMINATOR = 1_000_000n;
export const UINT128_MAX = (1n << 128n) - 1n;

export const UNIVERSAL_ROUTER_ABI = [
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
] as const;

export const POOL_AND_HOOK_EVENT_ABI = [
  "event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)",
  "event PoolFeeTaken(bytes32 indexed poolId,address indexed sender,address indexed currency,uint256 amountIn,uint256 feeAmount,uint16 feeBps,bool isBuy)",
] as const;

const EVENT_INTERFACE = new ethers.Interface(POOL_AND_HOOK_EVENT_ABI);
const TRANSIENT_BALANCE_ERROR_INTERFACE = new ethers.Interface([
  "error UnexpectedRevertBytes(bytes revertData)",
  "error WrappedError(address target,bytes4 selector,bytes reason,bytes details)",
  "error HookCallFailed()",
  "error ERC20TransferFailed()",
  "error ERC20InsufficientBalance(address sender,uint256 balance,uint256 needed)",
]);

const HOOK_CALL_FAILED_DATA = TRANSIENT_BALANCE_ERROR_INTERFACE.encodeErrorResult("HookCallFailed");
const ERC20_TRANSFER_FAILED_DATA = TRANSIENT_BALANCE_ERROR_INTERFACE.encodeErrorResult("ERC20TransferFailed");

export type V4ExactInputLeg = Readonly<{
  amountIn: bigint;
  amountOutMinimum: bigint;
}>;

export type V4ExactInputCall = Readonly<{
  commands: string;
  inputs: readonly string[];
  deadline: bigint;
  totalAmountIn: bigint;
  aggregateAmountOutMinimum: bigint;
  zeroForOne: boolean;
  inputCurrency: string;
  outputCurrency: string;
}>;

export type SwapEventObservation = Readonly<{
  poolId: string;
  sender: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: bigint;
  lpFeePips: bigint;
}>;

export type HookFeeObservation = Readonly<{
  poolId: string;
  sender: string;
  currency: string;
  amountIn: bigint;
  feeAmount: bigint;
  feeBps: bigint;
  isBuy: boolean;
}>;

export type ParsedSwapReceipt = Readonly<{
  swaps: readonly SwapEventObservation[];
  hookFees: readonly HookFeeObservation[];
  hookFeeByCurrency: ReadonlyMap<string, bigint>;
  aggregateAmount0: bigint;
  aggregateAmount1: bigint;
}>;

export type ExactV4QuoterPoolManagerBalanceFailure = Readonly<{
  observedBalance: bigint;
  needed: bigint;
  errorFingerprint: string;
}>;

export type ExactV4QuoterPoolManagerBalanceFailureConfig = Readonly<{
  hook: string;
  nara: string;
  poolManager: string;
}>;

function parseCanonicalCustomError(
  data: unknown,
  expectedName: string,
): ethers.ErrorDescription | undefined {
  if (typeof data !== "string" || data.length % 2 !== 0 || !ethers.isHexString(data)) return undefined;
  try {
    const parsed = TRANSIENT_BALANCE_ERROR_INTERFACE.parseError(data);
    if (!parsed || parsed.name !== expectedName) return undefined;
    const canonical = TRANSIENT_BALANCE_ERROR_INTERFACE.encodeErrorResult(
      parsed.fragment,
      Array.from(parsed.args),
    );
    return canonical.toLowerCase() === data.toLowerCase() ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function structuredRevertDataCandidates(error: unknown): readonly string[] {
  if (typeof error !== "object" || error === null) return [];
  const candidates: string[] = [];
  const queue: object[] = [error];
  const seen = new Set<object>();
  const nestedErrorKeys = ["data", "error", "info", "cause"] as const;
  while (queue.length > 0 && seen.size < 64) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const key of nestedErrorKeys) {
      let value: unknown;
      try {
        value = (current as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (key === "data" && typeof value === "string" && value.length % 2 === 0 && ethers.isHexString(value)) {
        candidates.push(value);
      } else if (typeof value === "object" && value !== null) {
        queue.push(value);
      }
    }
  }
  return candidates;
}

/**
 * Recognizes only the exact V4Quoter -> Hook -> NARA transfer failure caused
 * by PoolManager's physical NARA balance being below the Hook fee requested
 * during beforeSwap. Message text and unstructured hex strings are ignored.
 */
export function decodeExactV4QuoterPoolManagerBalanceFailure(
  error: unknown,
  config: ExactV4QuoterPoolManagerBalanceFailureConfig,
): ExactV4QuoterPoolManagerBalanceFailure | undefined {
  const expectedHook = ethers.getAddress(config.hook);
  const expectedNara = ethers.getAddress(config.nara);
  const expectedPoolManager = ethers.getAddress(config.poolManager);
  for (const candidate of structuredRevertDataCandidates(error)) {
    const unexpected = parseCanonicalCustomError(candidate, "UnexpectedRevertBytes");
    if (!unexpected) continue;
    const hookWrapper = parseCanonicalCustomError(unexpected.args[0], "WrappedError");
    if (
      !hookWrapper
      || ethers.getAddress(hookWrapper.args[0]) !== expectedHook
      || (hookWrapper.args[1] as string).toLowerCase() !== V4_BEFORE_SWAP_SELECTOR
      || (hookWrapper.args[3] as string).toLowerCase() !== HOOK_CALL_FAILED_DATA
    ) continue;
    const tokenWrapper = parseCanonicalCustomError(hookWrapper.args[2], "WrappedError");
    if (
      !tokenWrapper
      || ethers.getAddress(tokenWrapper.args[0]) !== expectedNara
      || (tokenWrapper.args[1] as string).toLowerCase() !== ERC20_TRANSFER_SELECTOR
      || (tokenWrapper.args[3] as string).toLowerCase() !== ERC20_TRANSFER_FAILED_DATA
    ) continue;
    const insufficientBalance = parseCanonicalCustomError(
      tokenWrapper.args[2],
      "ERC20InsufficientBalance",
    );
    if (!insufficientBalance || ethers.getAddress(insufficientBalance.args[0]) !== expectedPoolManager) {
      continue;
    }
    const observedBalance = insufficientBalance.args[1] as bigint;
    const needed = insufficientBalance.args[2] as bigint;
    if (needed <= observedBalance) continue;
    return {
      observedBalance,
      needed,
      errorFingerprint: ethers.keccak256(candidate).toLowerCase(),
    };
  }
  return undefined;
}

export function cumulativeHookFee(curve: FeeCurveState, amountIn: bigint, depth: bigint): bigint {
  if (amountIn < 0n || depth < 0n) throw new Error("Hook fee inputs must be non-negative");
  if (amountIn === 0n) return 0n;
  if (depth === 0n) return amountIn * curve.extremeFeeBps / BPS;
  const mediumAt = depth * curve.mediumPressureBps / BPS;
  const highAt = depth * curve.highPressureBps / BPS;
  const extremeAt = depth * curve.extremePressureBps / BPS;
  let end = amountIn < mediumAt ? amountIn : mediumAt;
  let fee = end * curve.baseFeeBps / BPS;
  if (amountIn <= mediumAt) return fee;
  end = amountIn < highAt ? amountIn : highAt;
  fee += (end - mediumAt) * curve.mediumFeeBps / BPS;
  if (amountIn <= highAt) return fee;
  end = amountIn < extremeAt ? amountIn : extremeAt;
  fee += (end - highAt) * curve.highFeeBps / BPS;
  if (amountIn <= extremeAt) return fee;
  return fee + (amountIn - extremeAt) * curve.extremeFeeBps / BPS;
}

export function marginalHookFeeBps(curve: FeeCurveState, amountIn: bigint, depth: bigint): bigint {
  if (amountIn < 0n || depth < 0n) throw new Error("Hook fee inputs must be non-negative");
  let fee = curve.baseFeeBps;
  if (depth === 0n) fee = curve.extremeFeeBps;
  else {
    const mediumAt = depth * curve.mediumPressureBps / BPS;
    const highAt = depth * curve.highPressureBps / BPS;
    const extremeAt = depth * curve.extremePressureBps / BPS;
    if (amountIn >= extremeAt) fee = curve.extremeFeeBps;
    else if (amountIn >= highAt) fee = curve.highFeeBps;
    else if (amountIn >= mediumAt) fee = curve.mediumFeeBps;
  }
  return fee < curve.maxFeeBps ? fee : curve.maxFeeBps;
}

export function incrementalHookFees(
  curve: FeeCurveState,
  legs: readonly bigint[],
  depth: bigint,
): readonly bigint[] {
  let cumulativeInput = 0n;
  let previousFee = 0n;
  return legs.map((amountIn) => {
    if (amountIn <= 0n) throw new Error("Every exact-input leg must be positive");
    cumulativeInput += amountIn;
    const cumulativeFee = cumulativeHookFee(curve, cumulativeInput, depth);
    const incremental = cumulativeFee - previousFee;
    previousFee = cumulativeFee;
    return incremental;
  });
}

export function exactLpFeeAmount(postHookInput: bigint, lpFeePips: bigint): bigint {
  if (postHookInput < 0n || lpFeePips < 0n || lpFeePips >= PIPS_DENOMINATOR) {
    throw new Error("Invalid AMM input or LP fee");
  }
  // PoolManager deducts the complement first. This is ceil(input * fee), and
  // differs by one raw unit from floor(input * fee) whenever division has dust.
  return postHookInput
    - postHookInput * (PIPS_DENOMINATOR - lpFeePips) / PIPS_DENOMINATOR;
}

export function buildV4ExactInputCall(params: {
  poolKey: Pick<CanonicalV4PoolKey, "currency0" | "currency1" | "fee" | "tickSpacing" | "hook">;
  inputCurrency: string;
  legs: readonly V4ExactInputLeg[];
  aggregateAmountOutMinimum: bigint;
  deadline: bigint;
  hookData?: string;
}): V4ExactInputCall {
  if (params.legs.length === 0) throw new Error("At least one swap leg is required");
  if (params.deadline <= 0n) throw new Error("Swap deadline must be positive");
  if (params.aggregateAmountOutMinimum < 0n) throw new Error("Aggregate minimum output cannot be negative");
  const currency0 = ethers.getAddress(params.poolKey.currency0);
  const currency1 = ethers.getAddress(params.poolKey.currency1);
  const inputCurrency = ethers.getAddress(params.inputCurrency);
  if (inputCurrency !== currency0 && inputCurrency !== currency1) {
    throw new Error("Input currency is not part of the PoolKey");
  }
  const outputCurrency = inputCurrency === currency0 ? currency1 : currency0;
  const zeroForOne = inputCurrency === currency0;
  const hookData = params.hookData ?? "0x";
  const abi = ethers.AbiCoder.defaultAbiCoder();
  let totalAmountIn = 0n;
  let individualMinimums = 0n;
  const swapParams = params.legs.map((leg) => {
    if (leg.amountIn <= 0n || leg.amountIn > UINT128_MAX) throw new Error("Swap amountIn must fit uint128");
    if (leg.amountOutMinimum < 0n || leg.amountOutMinimum > UINT128_MAX) {
      throw new Error("Swap amountOutMinimum must fit uint128");
    }
    totalAmountIn += leg.amountIn;
    individualMinimums += leg.amountOutMinimum;
    return abi.encode(
      ["tuple(tuple(address,address,uint24,int24,address) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)"],
      [[
        [currency0, currency1, params.poolKey.fee, params.poolKey.tickSpacing, params.poolKey.hook],
        zeroForOne,
        leg.amountIn,
        leg.amountOutMinimum,
        hookData,
      ]],
    );
  });
  if (params.aggregateAmountOutMinimum < individualMinimums) {
    throw new Error("Aggregate minimum cannot be below the sum of leg minimums");
  }
  // Pre-settle exact input before the swap. The active Hook takes its
  // input-currency fee during beforeSwap, while the ordinary Universal Router
  // ordering transfers the trader's input only afterward. Pre-settlement is a
  // supported V4Router action and funds the Hook fee before that callback.
  // This does not restore continuity for the ordinary SWAP -> SETTLE_ALL route;
  // the separate fork-control builder below retains evidence for that route.
  const settle = abi.encode(
    ["address", "uint256", "bool"],
    [inputCurrency, totalAmountIn, true],
  );
  const take = abi.encode(["address", "uint256"], [outputCurrency, params.aggregateAmountOutMinimum]);
  const actions = ethers.hexlify(new Uint8Array([
    SETTLE_ACTION,
    ...params.legs.map(() => SWAP_EXACT_IN_SINGLE_ACTION),
    TAKE_ALL_ACTION,
  ]));
  const v4Input = abi.encode(["bytes", "bytes[]"], [actions, [settle, ...swapParams, take]]);
  return {
    commands: ethers.hexlify(new Uint8Array([V4_SWAP_COMMAND])),
    inputs: [v4Input],
    deadline: params.deadline,
    totalAmountIn,
    aggregateAmountOutMinimum: params.aggregateAmountOutMinimum,
    zeroForOne,
    inputCurrency,
    outputCurrency,
  };
}

/**
 * Builds the ordinary Universal Router SWAP(s) -> SETTLE_ALL -> TAKE_ALL order.
 * This is a fork-test continuity control, not the supported prefunded route.
 */
export function buildV4PostSwapSettleAllForkControlCall(params: {
  poolKey: Pick<CanonicalV4PoolKey, "currency0" | "currency1" | "fee" | "tickSpacing" | "hook">;
  inputCurrency: string;
  legs: readonly V4ExactInputLeg[];
  aggregateAmountOutMinimum: bigint;
  deadline: bigint;
  hookData?: string;
}): V4ExactInputCall {
  const prefundedCall = buildV4ExactInputCall(params);
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const [, encodedParameters] = abi.decode(["bytes", "bytes[]"], prefundedCall.inputs[0]);
  const prefundedParameters = Array.from(encodedParameters) as string[];
  const swapParameters = prefundedParameters.slice(1, -1);
  const settleAll = abi.encode(
    ["address", "uint256"],
    [prefundedCall.inputCurrency, prefundedCall.totalAmountIn],
  );
  const takeAll = prefundedParameters[prefundedParameters.length - 1];
  const actions = ethers.hexlify(new Uint8Array([
    ...params.legs.map(() => SWAP_EXACT_IN_SINGLE_ACTION),
    SETTLE_ALL_ACTION,
    TAKE_ALL_ACTION,
  ]));
  const v4Input = abi.encode(
    ["bytes", "bytes[]"],
    [actions, [...swapParameters, settleAll, takeAll]],
  );
  return { ...prefundedCall, inputs: [v4Input] };
}

export function parseV4SwapReceipt(
  logs: readonly Pick<ethers.Log, "address" | "topics" | "data">[],
  addresses: Readonly<{ poolManager: string; hook: string }>,
  poolId?: string,
): ParsedSwapReceipt {
  const poolManager = addresses.poolManager.toLowerCase();
  const hook = addresses.hook.toLowerCase();
  const swaps: SwapEventObservation[] = [];
  const hookFees: HookFeeObservation[] = [];
  const hookFeeByCurrency = new Map<string, bigint>();
  for (const log of logs) {
    const address = log.address.toLowerCase();
    if (address !== poolManager && address !== hook) continue;
    let parsed: ethers.LogDescription | null;
    try {
      parsed = EVENT_INTERFACE.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue;
    }
    if (!parsed) continue;
    const parsedPoolId = parsed.args[0] as string;
    if (poolId && parsedPoolId.toLowerCase() !== poolId.toLowerCase()) continue;
    if (address === poolManager && parsed.name === "Swap") {
      swaps.push({
        poolId: parsedPoolId,
        sender: ethers.getAddress(parsed.args[1] as string),
        amount0: parsed.args[2] as bigint,
        amount1: parsed.args[3] as bigint,
        sqrtPriceX96: parsed.args[4] as bigint,
        liquidity: parsed.args[5] as bigint,
        tick: parsed.args[6] as bigint,
        lpFeePips: parsed.args[7] as bigint,
      });
    } else if (address === hook && parsed.name === "PoolFeeTaken") {
      const currency = ethers.getAddress(parsed.args[2] as string);
      const feeAmount = parsed.args[4] as bigint;
      hookFees.push({
        poolId: parsedPoolId,
        sender: ethers.getAddress(parsed.args[1] as string),
        currency,
        amountIn: parsed.args[3] as bigint,
        feeAmount,
        feeBps: parsed.args[5] as bigint,
        isBuy: parsed.args[6] as boolean,
      });
      hookFeeByCurrency.set(currency, (hookFeeByCurrency.get(currency) ?? 0n) + feeAmount);
    }
  }
  return {
    swaps,
    hookFees,
    hookFeeByCurrency,
    aggregateAmount0: swaps.reduce((sum, swap) => sum + swap.amount0, 0n),
    aggregateAmount1: swaps.reduce((sum, swap) => sum + swap.amount1, 0n),
  };
}

export function exactEffectiveBps(amount: bigint, grossInput: bigint): bigint {
  if (amount < 0n || grossInput <= 0n) throw new Error("Invalid effective-BPS inputs");
  return amount * BPS / grossInput;
}
