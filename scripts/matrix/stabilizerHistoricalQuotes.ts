/**
 * Read-only, block-pinned archive evidence and V4Quoter collection.
 * Every state-dependent read names an exact block number and is bound to an
 * expected canonical block hash before and after the read sequence.
 */
import { ethers } from "ethers";
import {
  reconstructCanonicalSwapFlow,
  V4_POOL_MANAGER_SWAP_TOPIC,
  type CanonicalSwapFlow,
  type CanonicalSwapLog,
  type StabilizerTriggerSide,
} from "./stabilizerSwapFlow.js";

const V4_QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
];
const V4_QUOTER_INTERFACE = new ethers.Interface(V4_QUOTER_ABI);
const MAX_UINT128 = (1n << 128n) - 1n;

export interface HistoricalBlock {
  number: number;
  hash: string;
}

export interface HistoricalReceipt {
  hash: string;
  blockNumber: number;
  blockHash: string;
  status: number | null;
  logs: readonly CanonicalSwapLog[];
}

export interface HistoricalReadProvider {
  getBlock(blockNumber: number): Promise<HistoricalBlock | null>;
  getTransactionReceipt(
    transactionHash: string
  ): Promise<HistoricalReceipt | null>;
  call(transaction: {
    to: string;
    data: string;
    blockTag: number;
  }): Promise<string>;
}

export interface CollectHistoricalSourceFlowOptions {
  triggerBlockNumber: number;
  triggerBlockHash: string;
  transactionHashes: readonly string[];
  poolManager: string;
  poolId: string;
  tokenIsCurrency0: boolean;
  expectedSide: StabilizerTriggerSide;
}

export interface CanonicalHistoricalSourceFlow {
  triggerBlockNumber: number;
  triggerBlockHash: string;
  transactionHashes: string[];
  side: StabilizerTriggerSide;
  tokenIsCurrency0: boolean;
  swapLogCount: number;
  sourceFlows: CanonicalSwapFlow[];
  amount0CallerDelta: bigint;
  amount1CallerDelta: bigint;
  usdcIn: bigint;
  usdcOut: bigint;
  naraIn: bigint;
  naraOut: bigint;
}

export interface HistoricalExactInputQuoteOptions {
  blockNumber: number;
  blockHash: string;
  quoter: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hook: string;
  tokenIsCurrency0: boolean;
  side: StabilizerTriggerSide;
  exactAmount: bigint;
}

export interface BlockPinnedExactInputQuote {
  blockNumber: number;
  blockHash: string;
  side: StabilizerTriggerSide;
  semantics: "exact_input_usdc_to_nara" | "exact_input_nara_to_usdc";
  inputAsset: "USDC" | "NARA";
  outputAsset: "NARA" | "USDC";
  exactAmountIn: bigint;
  amountOut: bigint;
  gasEstimate: bigint;
  zeroForOne: boolean;
}

function reject(reason: string): never {
  throw new Error(`historical_quote_rejected:${reason}`);
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

function safeBlockNumber(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) reject(`invalid_${label}`);
  return value;
}

function canonicalTransactionHashes(values: readonly string[]): string[] {
  if (values.length === 0) reject("empty_transaction_set");
  const hashes = values.map((value) =>
    canonicalBytes32(value, "transaction_hash")
  );
  if (new Set(hashes).size !== hashes.length) {
    reject("duplicate_transaction_hash");
  }
  return hashes;
}

async function assertCanonicalBlock(
  provider: HistoricalReadProvider,
  blockNumber: number,
  blockHash: string
): Promise<void> {
  const block = await provider.getBlock(blockNumber);
  if (!block) reject("canonical_block_absent");
  if (block.number !== blockNumber) reject("canonical_block_number_mismatch");
  const observedHash = canonicalBytes32(block.hash, "observed_block_hash");
  if (observedHash !== blockHash) reject("canonical_block_hash_mismatch");
}

function exactPoolSwapLogs(
  logs: readonly CanonicalSwapLog[],
  poolManager: string,
  poolId: string
): CanonicalSwapLog[] {
  return logs.filter(
    (log) =>
      log.address.toLowerCase() === poolManager.toLowerCase() &&
      log.topics.length === 3 &&
      log.topics[0]?.toLowerCase() === V4_POOL_MANAGER_SWAP_TOPIC &&
      log.topics[1]?.toLowerCase() === poolId
  );
}

export async function collectCanonicalHistoricalSourceFlow(
  provider: HistoricalReadProvider,
  options: CollectHistoricalSourceFlowOptions
): Promise<CanonicalHistoricalSourceFlow> {
  const triggerBlockNumber = safeBlockNumber(
    options.triggerBlockNumber,
    "trigger_block_number"
  );
  const triggerBlockHash = canonicalBytes32(
    options.triggerBlockHash,
    "trigger_block_hash"
  );
  const poolManager = canonicalAddress(options.poolManager, "pool_manager");
  const poolId = canonicalBytes32(options.poolId, "pool_id");
  const transactionHashes = canonicalTransactionHashes(
    options.transactionHashes
  );
  if (options.expectedSide !== "pump" && options.expectedSide !== "floor") {
    reject("invalid_expected_side");
  }

  await assertCanonicalBlock(provider, triggerBlockNumber, triggerBlockHash);
  const sourceFlows: CanonicalSwapFlow[] = [];
  for (const transactionHash of transactionHashes) {
    const receipt = await provider.getTransactionReceipt(transactionHash);
    if (!receipt) reject("receipt_absent");
    if (
      canonicalBytes32(receipt.hash, "receipt_transaction_hash") !==
      transactionHash
    ) {
      reject("receipt_transaction_hash_mismatch");
    }
    if (receipt.status !== 1) reject("receipt_not_successful");
    if (receipt.blockNumber !== triggerBlockNumber) {
      reject("multi_block_transaction_set");
    }
    if (
      canonicalBytes32(receipt.blockHash, "receipt_block_hash") !==
      triggerBlockHash
    ) {
      reject("receipt_block_hash_mismatch");
    }

    const swapLogs = exactPoolSwapLogs(receipt.logs, poolManager, poolId);
    if (swapLogs.length === 0) reject("canonical_swap_log_absent");
    sourceFlows.push(
      reconstructCanonicalSwapFlow(swapLogs, {
        poolManager,
        poolId,
        tokenIsCurrency0: options.tokenIsCurrency0,
        expectedSide: options.expectedSide,
        transactionHash,
      })
    );
  }
  await assertCanonicalBlock(provider, triggerBlockNumber, triggerBlockHash);

  return {
    triggerBlockNumber,
    triggerBlockHash,
    transactionHashes,
    side: options.expectedSide,
    tokenIsCurrency0: options.tokenIsCurrency0,
    swapLogCount: sourceFlows.reduce(
      (total, flow) => total + flow.swapLogCount,
      0
    ),
    sourceFlows,
    amount0CallerDelta: sourceFlows.reduce(
      (total, flow) => total + flow.amount0CallerDelta,
      0n
    ),
    amount1CallerDelta: sourceFlows.reduce(
      (total, flow) => total + flow.amount1CallerDelta,
      0n
    ),
    usdcIn: sourceFlows.reduce((total, flow) => total + flow.usdcIn, 0n),
    usdcOut: sourceFlows.reduce((total, flow) => total + flow.usdcOut, 0n),
    naraIn: sourceFlows.reduce((total, flow) => total + flow.naraIn, 0n),
    naraOut: sourceFlows.reduce((total, flow) => total + flow.naraOut, 0n),
  };
}

export async function quoteV4ExactInputAtBlock(
  provider: HistoricalReadProvider,
  options: HistoricalExactInputQuoteOptions
): Promise<BlockPinnedExactInputQuote> {
  const blockNumber = safeBlockNumber(options.blockNumber, "block_number");
  const blockHash = canonicalBytes32(options.blockHash, "block_hash");
  const quoter = canonicalAddress(options.quoter, "quoter");
  const currency0 = canonicalAddress(options.currency0, "currency0");
  const currency1 = canonicalAddress(options.currency1, "currency1");
  const hook = canonicalAddress(options.hook, "hook");
  if (currency0 === currency1) reject("identical_pool_currencies");
  if (!Number.isSafeInteger(options.fee) || options.fee < 0) {
    reject("invalid_pool_fee");
  }
  if (!Number.isSafeInteger(options.tickSpacing) || options.tickSpacing <= 0) {
    reject("invalid_tick_spacing");
  }
  if (options.side !== "pump" && options.side !== "floor") {
    reject("invalid_quote_side");
  }
  if (options.exactAmount <= 0n || options.exactAmount > MAX_UINT128) {
    reject("invalid_exact_amount");
  }

  await assertCanonicalBlock(provider, blockNumber, blockHash);
  const zeroForOne =
    options.side === "pump"
      ? !options.tokenIsCurrency0
      : options.tokenIsCurrency0;
  const data = V4_QUOTER_INTERFACE.encodeFunctionData("quoteExactInputSingle", [
    {
      poolKey: {
        currency0,
        currency1,
        fee: options.fee,
        tickSpacing: options.tickSpacing,
        hooks: hook,
      },
      zeroForOne,
      exactAmount: options.exactAmount,
      hookData: "0x",
    },
  ]);

  let encodedResult: string;
  try {
    encodedResult = await provider.call({
      to: quoter,
      data,
      blockTag: blockNumber,
    });
  } catch {
    return reject("block_pinned_quote_failed");
  }
  let amountOut: bigint;
  let gasEstimate: bigint;
  try {
    const decoded = V4_QUOTER_INTERFACE.decodeFunctionResult(
      "quoteExactInputSingle",
      encodedResult
    );
    amountOut = decoded.amountOut as bigint;
    gasEstimate = decoded.gasEstimate as bigint;
  } catch {
    return reject("malformed_quote_result");
  }
  if (amountOut <= 0n) reject("zero_quote_output");
  await assertCanonicalBlock(provider, blockNumber, blockHash);

  const pump = options.side === "pump";
  return {
    blockNumber,
    blockHash,
    side: options.side,
    semantics: pump ? "exact_input_usdc_to_nara" : "exact_input_nara_to_usdc",
    inputAsset: pump ? "USDC" : "NARA",
    outputAsset: pump ? "NARA" : "USDC",
    exactAmountIn: options.exactAmount,
    amountOut,
    gasEstimate,
    zeroForOne,
  };
}
