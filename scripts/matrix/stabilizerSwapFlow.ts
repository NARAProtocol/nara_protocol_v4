/**
 * Pure reconstruction of canonical NARA/USDC flow from Uniswap v4 PoolManager
 * Swap logs. Source evidence for this ABI and sign convention:
 * - @uniswap/v4-core/src/interfaces/IPoolManager.sol (Swap event)
 * - @uniswap/v4-core/src/libraries/Pool.sol (constructs the caller delta)
 * - @uniswap/v4-periphery/src/PositionManager.sol (negative debt is settled;
 *   positive credit is taken)
 *
 * amount0 and amount1 are deltas of the swap caller: negative means currency
 * input/owed by the caller and positive means output/received by the caller.
 */
import { ethers } from "ethers";

export const V4_POOL_MANAGER_SWAP_EVENT_ABI =
  "event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)";
export const V4_POOL_MANAGER_SWAP_EVENT_SIGNATURE =
  "Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)";
export const V4_POOL_MANAGER_SWAP_TOPIC = ethers.id(
  V4_POOL_MANAGER_SWAP_EVENT_SIGNATURE
);

const SWAP_INTERFACE = new ethers.Interface([V4_POOL_MANAGER_SWAP_EVENT_ABI]);
const SWAP_DATA_HEX_LENGTH = 2 + 64 * 6;

export type StabilizerTriggerSide = "pump" | "floor";

export interface CanonicalSwapLog {
  address: string;
  transactionHash: string;
  /** ethers v6 receipt logs expose `index`; `logIndex` supports normalized fixtures. */
  index?: number;
  logIndex?: number;
  topics: readonly string[];
  data: string;
  removed?: boolean;
}

export interface ReconstructSwapFlowOptions {
  poolManager: string;
  poolId: string;
  tokenIsCurrency0: boolean;
  expectedSide?: StabilizerTriggerSide;
  /** Optional external receipt binding; otherwise the first log establishes it. */
  transactionHash?: string;
}

export interface CanonicalSwapFlow {
  transactionHash: string;
  poolId: string;
  poolManager: string;
  side: StabilizerTriggerSide;
  tokenIsCurrency0: boolean;
  swapLogCount: number;
  logIndices: number[];
  amount0CallerDelta: bigint;
  amount1CallerDelta: bigint;
  usdcIn: bigint;
  usdcOut: bigint;
  naraIn: bigint;
  naraOut: bigint;
}

interface DecodedSwap {
  logIndex: number;
  amount0: bigint;
  amount1: bigint;
  usdcCallerDelta: bigint;
  naraCallerDelta: bigint;
  side: StabilizerTriggerSide;
}

function reject(reason: string): never {
  throw new Error(`canonical_swap_flow_rejected:${reason}`);
}

function canonicalBytes32(value: string, label: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) reject(`invalid_${label}`);
  return value.toLowerCase();
}

function canonicalAddress(value: string, label: string): string {
  try {
    return ethers.getAddress(value);
  } catch {
    return reject(`invalid_${label}`);
  }
}

function decodeSwap(
  log: CanonicalSwapLog,
  expectedTransactionHash: string,
  expectedPoolManager: string,
  expectedPoolId: string,
  tokenIsCurrency0: boolean
): DecodedSwap {
  if (log.removed) reject("removed_log");
  if (
    log.index !== undefined &&
    log.logIndex !== undefined &&
    log.index !== log.logIndex
  ) {
    reject("conflicting_log_index");
  }
  const logIndex = log.index ?? log.logIndex;
  if (!Number.isSafeInteger(logIndex) || (logIndex ?? -1) < 0) {
    reject("invalid_log_index");
  }

  const transactionHash = canonicalBytes32(
    log.transactionHash,
    "log_transaction_hash"
  );
  if (transactionHash !== expectedTransactionHash) {
    reject("wrong_transaction_hash");
  }
  const address = canonicalAddress(log.address, "log_address");
  if (address !== expectedPoolManager) reject("wrong_pool_manager");
  if (log.topics.length !== 3) reject("malformed_topics");
  if (log.topics[0].toLowerCase() !== V4_POOL_MANAGER_SWAP_TOPIC) {
    reject("wrong_event_signature");
  }
  if (canonicalBytes32(log.topics[1], "log_pool_id") !== expectedPoolId) {
    reject("wrong_pool_id");
  }
  const senderTopic = canonicalBytes32(log.topics[2], "log_sender_topic");
  if (!/^0x0{24}[0-9a-f]{40}$/.test(senderTopic)) {
    reject("malformed_sender_topic");
  }
  if (
    !/^0x[0-9a-fA-F]+$/.test(log.data) ||
    log.data.length !== SWAP_DATA_HEX_LENGTH
  ) {
    reject("malformed_data");
  }

  let parsed: ethers.LogDescription | null;
  try {
    parsed = SWAP_INTERFACE.parseLog({
      topics: [...log.topics],
      data: log.data,
    });
  } catch {
    return reject("malformed_swap_log");
  }
  if (!parsed || parsed.name !== "Swap") reject("malformed_swap_log");

  const amount0 = parsed.args.amount0 as bigint;
  const amount1 = parsed.args.amount1 as bigint;
  if (amount0 === 0n || amount1 === 0n) reject("zero_flow");
  if (amount0 > 0n === amount1 > 0n) reject("ambiguous_flow_signs");

  const usdcCallerDelta = tokenIsCurrency0 ? amount1 : amount0;
  const naraCallerDelta = tokenIsCurrency0 ? amount0 : amount1;
  const side: StabilizerTriggerSide =
    usdcCallerDelta < 0n && naraCallerDelta > 0n ? "pump" : "floor";

  return {
    logIndex: logIndex!,
    amount0,
    amount1,
    usdcCallerDelta,
    naraCallerDelta,
    side,
  };
}

export function reconstructCanonicalSwapFlow(
  logs: readonly CanonicalSwapLog[],
  options: ReconstructSwapFlowOptions
): CanonicalSwapFlow {
  if (logs.length === 0) reject("no_swap_logs");
  const transactionHash = canonicalBytes32(
    options.transactionHash ?? logs[0].transactionHash,
    "transaction_hash"
  );
  const poolId = canonicalBytes32(options.poolId, "pool_id");
  const poolManager = canonicalAddress(options.poolManager, "pool_manager");
  if (
    options.expectedSide !== undefined &&
    options.expectedSide !== "pump" &&
    options.expectedSide !== "floor"
  ) {
    reject("invalid_expected_side");
  }

  const decoded = logs.map((log) =>
    decodeSwap(
      log,
      transactionHash,
      poolManager,
      poolId,
      options.tokenIsCurrency0
    )
  );
  const logIndices = decoded.map((swap) => swap.logIndex);
  if (new Set(logIndices).size !== logIndices.length) {
    reject("duplicate_log_index");
  }

  const sides = new Set(decoded.map((swap) => swap.side));
  if (sides.size !== 1) reject("mixed_swap_directions");
  const side = decoded[0].side;
  if (options.expectedSide && side !== options.expectedSide) {
    reject("unexpected_trigger_direction");
  }

  const amount0CallerDelta = decoded.reduce(
    (total, swap) => total + swap.amount0,
    0n
  );
  const amount1CallerDelta = decoded.reduce(
    (total, swap) => total + swap.amount1,
    0n
  );
  const usdcCallerDelta = decoded.reduce(
    (total, swap) => total + swap.usdcCallerDelta,
    0n
  );
  const naraCallerDelta = decoded.reduce(
    (total, swap) => total + swap.naraCallerDelta,
    0n
  );
  if (usdcCallerDelta === 0n || naraCallerDelta === 0n) {
    reject("zero_aggregate_flow");
  }
  if (usdcCallerDelta > 0n === naraCallerDelta > 0n) {
    reject("ambiguous_aggregate_flow");
  }

  return {
    transactionHash,
    poolId,
    poolManager,
    side,
    tokenIsCurrency0: options.tokenIsCurrency0,
    swapLogCount: decoded.length,
    logIndices: [...logIndices].sort((a, b) => a - b),
    amount0CallerDelta,
    amount1CallerDelta,
    usdcIn: usdcCallerDelta < 0n ? -usdcCallerDelta : 0n,
    usdcOut: usdcCallerDelta > 0n ? usdcCallerDelta : 0n,
    naraIn: naraCallerDelta < 0n ? -naraCallerDelta : 0n,
    naraOut: naraCallerDelta > 0n ? naraCallerDelta : 0n,
  };
}
