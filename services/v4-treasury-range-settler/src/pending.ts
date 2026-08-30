import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ethers } from "ethers";
import { RANGE_MANAGER_ABI } from "./contracts.js";

export const PENDING_SETTLEMENT_SCHEMA = "nara.v4.treasury-range-settlement-pending.v2" as const;
export const RECONCILED_SETTLEMENT_SCHEMA = "nara.v4.treasury-range-settlement-reconciled.v1" as const;

export interface PendingSettlement {
  schemaVersion: typeof PENDING_SETTLEMENT_SCHEMA;
  manager: string;
  wallet: string;
  transactionHash: string;
  rawTransaction: string;
  nonce: number;
  orderIds: string[];
  preparedAtMs: number;
}

export interface ReconciledSettlementRecord {
  schemaVersion: typeof RECONCILED_SETTLEMENT_SCHEMA;
  manager: string;
  wallet: string;
  transactionHash: string;
  nonce: number;
  orderIds: string[];
  receiptBlockNumber: number;
  receiptBlockHash: string;
  naraOut: string;
  usdcOut: string;
  recordedAtMs: number;
}

function unsignedIntegerStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => typeof item === "string" && /^\d+$/.test(item) && BigInt(item) > 0n) &&
    new Set(value).size === value.length;
}

function parsePreparedTransaction(
  rawTransaction: string,
  manager: string,
  wallet: string,
  transactionHash: string,
  nonce: number,
  orderIds: readonly string[],
): void {
  let transaction: ethers.Transaction;
  try {
    transaction = ethers.Transaction.from(rawTransaction);
  } catch {
    throw new Error("PENDING_STATE_MALFORMED");
  }
  if (!transaction.signature || transaction.hash?.toLowerCase() !== transactionHash || transaction.chainId !== 8453n ||
      transaction.type !== 2 || transaction.nonce !== nonce || transaction.value !== 0n || transaction.gasLimit <= 0n ||
      transaction.maxFeePerGas === null || transaction.maxPriorityFeePerGas === null ||
      ethers.getAddress(transaction.from ?? ethers.ZeroAddress) !== wallet ||
      ethers.getAddress(transaction.to ?? ethers.ZeroAddress) !== manager) {
    throw new Error("PENDING_STATE_MALFORMED");
  }
  const parsed = new ethers.Interface(RANGE_MANAGER_ABI).parseTransaction({ data: transaction.data, value: transaction.value });
  const encodedOrderIds = parsed?.name === "settleMany"
    ? (parsed.args[0] as bigint[]).map((value) => BigInt(value).toString())
    : [];
  if (JSON.stringify(encodedOrderIds) !== JSON.stringify(orderIds)) throw new Error("PENDING_STATE_MALFORMED");
}

export function parsePendingSettlement(value: unknown): PendingSettlement {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PENDING_STATE_MALFORMED");
  const item = value as Record<string, unknown>;
  const transactionHash = String(item.transactionHash).toLowerCase();
  const rawTransaction = String(item.rawTransaction);
  const nonce = Number(item.nonce);
  const preparedAtMs = Number(item.preparedAtMs);
  if (item.schemaVersion !== PENDING_SETTLEMENT_SCHEMA || !ethers.isHexString(transactionHash, 32) ||
      !ethers.isHexString(rawTransaction) || !Number.isSafeInteger(nonce) || nonce < 0 ||
      !Number.isSafeInteger(preparedAtMs) || preparedAtMs < 1 || !unsignedIntegerStrings(item.orderIds)) {
    throw new Error("PENDING_STATE_MALFORMED");
  }
  let manager: string;
  let wallet: string;
  try {
    manager = ethers.getAddress(String(item.manager));
    wallet = ethers.getAddress(String(item.wallet));
  } catch {
    throw new Error("PENDING_STATE_MALFORMED");
  }
  const orderIds = [...item.orderIds];
  parsePreparedTransaction(rawTransaction, manager, wallet, transactionHash, nonce, orderIds);
  return {
    schemaVersion: PENDING_SETTLEMENT_SCHEMA,
    manager,
    wallet,
    transactionHash,
    rawTransaction,
    nonce,
    orderIds,
    preparedAtMs,
  };
}

function syncDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeExclusiveDurable(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  syncDirectory(dirname(path));
}

export class PendingSettlementStore {
  constructor(private readonly path: string) {}

  load(): PendingSettlement | undefined {
    if (!existsSync(this.path)) return undefined;
    try {
      return parsePendingSettlement(JSON.parse(readFileSync(this.path, "utf8")));
    } catch (error) {
      if (error instanceof Error && error.message === "PENDING_STATE_MALFORMED") throw error;
      throw new Error("PENDING_STATE_MALFORMED");
    }
  }

  save(value: PendingSettlement): void {
    writeExclusiveDurable(this.path, parsePendingSettlement(value));
  }

  clearAfterConfirmedReceipt(expectedTransactionHash: string): void {
    const pending = this.load();
    if (!pending || pending.transactionHash !== expectedTransactionHash.toLowerCase()) {
      throw new Error("PENDING_STATE_HASH_MISMATCH");
    }
    unlinkSync(this.path);
    syncDirectory(dirname(this.path));
  }
}

function parseReconciledSettlement(value: ReconciledSettlementRecord): ReconciledSettlementRecord {
  if (value.schemaVersion !== RECONCILED_SETTLEMENT_SCHEMA || !ethers.isHexString(value.transactionHash, 32) ||
      !ethers.isHexString(value.receiptBlockHash, 32) || !Number.isSafeInteger(value.nonce) || value.nonce < 0 ||
      !Number.isSafeInteger(value.receiptBlockNumber) || value.receiptBlockNumber < 1 ||
      !Number.isSafeInteger(value.recordedAtMs) || value.recordedAtMs < 1 || !unsignedIntegerStrings(value.orderIds) ||
      !/^\d+$/.test(value.naraOut) || !/^\d+$/.test(value.usdcOut)) {
    throw new Error("RECONCILED_STATE_MALFORMED");
  }
  return {
    ...value,
    manager: ethers.getAddress(value.manager),
    wallet: ethers.getAddress(value.wallet),
    transactionHash: value.transactionHash.toLowerCase(),
    receiptBlockHash: value.receiptBlockHash.toLowerCase(),
    orderIds: [...value.orderIds],
  };
}

export class SettlementReconciliationStore {
  constructor(private readonly directory: string) {}

  record(value: ReconciledSettlementRecord): void {
    const record = parseReconciledSettlement(value);
    const path = join(this.directory, `${record.transactionHash.slice(2)}.json`);
    if (existsSync(path)) {
      let existing: ReconciledSettlementRecord;
      try {
        existing = parseReconciledSettlement(JSON.parse(readFileSync(path, "utf8")) as ReconciledSettlementRecord);
      } catch {
        throw new Error("RECONCILED_STATE_MALFORMED");
      }
      if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error("RECONCILED_STATE_CONFLICT");
      return;
    }
    writeExclusiveDurable(path, record);
  }
}
