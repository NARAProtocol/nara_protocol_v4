import { ethers } from "ethers";

const ERC20_TRANSFER = new ethers.Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

export type ReceiptLog = {
  address: string;
  topics: readonly string[];
  data: string;
};

export type ConfirmedReceipt = {
  hash: string;
  blockNumber: number;
  status: number | null;
  to: string | null;
  logs: readonly ReceiptLog[];
};

export type ReceiptBalanceReader = {
  balanceOf(account: string, overrides: { blockTag: number }): Promise<bigint>;
};

export type ReceiptReconciliation = {
  transactionHash: string;
  blockNumber: number;
  transferDelta: bigint;
  pinnedBalance: bigint;
  pinnedBalanceDelta: bigint;
};

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizeHash(value: string): string {
  requireCondition(/^0x[0-9a-fA-F]{64}$/.test(value), "transaction hash must be bytes32");
  return value.toLowerCase();
}

export function assertUnrecordedTransaction(transactionHash: string, recordedHashes: Iterable<string>): void {
  const normalized = normalizeHash(transactionHash);
  for (const recorded of recordedHashes) {
    if (normalizeHash(recorded) === normalized) {
      throw new Error(`transaction ${normalized} is already reconciled; do not retry the action`);
    }
  }
}

export function erc20TransferDeltaFromReceipt(args: {
  receipt: ConfirmedReceipt;
  token: string;
  account: string;
}): bigint {
  requireCondition(args.receipt.status === 1, "transaction receipt is not successful");
  requireCondition(args.receipt.blockNumber > 0, "receipt block number is invalid");
  requireCondition(ethers.isAddress(args.token), "token must be an address");
  requireCondition(ethers.isAddress(args.account), "account must be an address");
  const token = ethers.getAddress(args.token);
  const account = ethers.getAddress(args.account);
  let delta = 0n;
  for (const log of args.receipt.logs) {
    if (!ethers.isAddress(log.address) || ethers.getAddress(log.address) !== token) continue;
    let parsed: ethers.LogDescription | null;
    try {
      parsed = ERC20_TRANSFER.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue;
    }
    if (!parsed || parsed.name !== "Transfer") continue;
    const from = ethers.getAddress(parsed.args.from as string);
    const to = ethers.getAddress(parsed.args.to as string);
    const amount = parsed.args.value as bigint;
    if (from === account) delta -= amount;
    if (to === account) delta += amount;
  }
  return delta;
}

/**
 * Reconciles against the exact receipt block. The reader must not perform an
 * untagged load-balanced RPC read; that was the source of the false V4 sell
 * failure after a successful transaction.
 */
export async function reconcileErc20AtReceipt(args: {
  reader: ReceiptBalanceReader;
  receipt: ConfirmedReceipt;
  token: string;
  account: string;
  beforeBalance: bigint;
  minimumTransferDelta: bigint;
  maximumTransferDelta: bigint;
  recordedTransactionHashes?: Iterable<string>;
}): Promise<ReceiptReconciliation> {
  requireCondition(args.beforeBalance >= 0n, "before balance cannot be negative");
  requireCondition(
    args.minimumTransferDelta <= args.maximumTransferDelta,
    "minimum transfer delta exceeds maximum",
  );
  if (args.recordedTransactionHashes) {
    assertUnrecordedTransaction(args.receipt.hash, args.recordedTransactionHashes);
  } else {
    normalizeHash(args.receipt.hash);
  }
  const transferDelta = erc20TransferDeltaFromReceipt(args);
  requireCondition(
    transferDelta >= args.minimumTransferDelta,
    `receipt transfer delta ${transferDelta} is below protected minimum ${args.minimumTransferDelta}`,
  );
  requireCondition(
    transferDelta <= args.maximumTransferDelta,
    `receipt transfer delta ${transferDelta} exceeds protected maximum ${args.maximumTransferDelta}`,
  );
  const pinnedBalance = await args.reader.balanceOf(args.account, { blockTag: args.receipt.blockNumber });
  requireCondition(pinnedBalance >= 0n, "pinned balance cannot be negative");
  return {
    transactionHash: normalizeHash(args.receipt.hash),
    blockNumber: args.receipt.blockNumber,
    transferDelta,
    pinnedBalance,
    pinnedBalanceDelta: pinnedBalance - args.beforeBalance,
  };
}

