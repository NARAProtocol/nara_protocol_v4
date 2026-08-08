export interface ReceiptEvidence {
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  status: number;
  gasUsed: string;
  contractAddress: string | null;
}

interface ReceiptLike {
  blockNumber: number | bigint;
  blockHash?: unknown;
  status: number | bigint | null;
  gasUsed?: { toString(): string } | bigint | number | string;
  contractAddress?: unknown;
  hash?: unknown;
  transactionHash?: unknown;
}

interface ReceiptProviderLike {
  getTransactionReceipt(transactionHash: string): Promise<ReceiptLike | null>;
}

const ZERO_BLOCK_HASH = /^0x0{64}$/i;
const BLOCK_HASH = /^0x[0-9a-f]{64}$/i;

function requireCanonicalBlockHash(value: unknown, transactionHash: string): string {
  if (typeof value !== "string" || !BLOCK_HASH.test(value) || ZERO_BLOCK_HASH.test(value)) {
    throw new Error(`Canonical receipt for ${transactionHash} does not contain a non-zero block hash`);
  }
  return value;
}

function recordedTransactionHash(receipt: ReceiptLike): string | null {
  const value = receipt.hash ?? receipt.transactionHash;
  return typeof value === "string" ? value : null;
}

/**
 * Re-queries the provider after tx.wait() and records only the canonical receipt.
 * Some transaction-response wrappers can expose ZeroHash as a temporary blockHash;
 * accepting any string would make that placeholder durable deployment evidence.
 */
export async function canonicalReceiptEvidence(
  provider: ReceiptProviderLike,
  transactionHash: string,
  waitedReceipt: ReceiptLike,
): Promise<ReceiptEvidence> {
  const canonicalReceipt = await provider.getTransactionReceipt(transactionHash);
  if (canonicalReceipt === null) {
    throw new Error(`Canonical receipt for ${transactionHash} is unavailable after transaction confirmation`);
  }

  const canonicalTransactionHash = recordedTransactionHash(canonicalReceipt);
  if (canonicalTransactionHash !== null && canonicalTransactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
    throw new Error(`Canonical receipt transaction hash does not match ${transactionHash}`);
  }

  const waitedBlockNumber = Number(waitedReceipt.blockNumber);
  const canonicalBlockNumber = Number(canonicalReceipt.blockNumber);
  if (canonicalBlockNumber !== waitedBlockNumber) {
    throw new Error(`Canonical receipt block number does not match tx.wait() for ${transactionHash}`);
  }

  const waitedStatus = Number(waitedReceipt.status);
  const canonicalStatus = Number(canonicalReceipt.status);
  if (canonicalStatus !== waitedStatus) {
    throw new Error(`Canonical receipt status does not match tx.wait() for ${transactionHash}`);
  }

  return {
    transactionHash,
    blockNumber: canonicalBlockNumber,
    blockHash: requireCanonicalBlockHash(canonicalReceipt.blockHash, transactionHash),
    status: canonicalStatus,
    gasUsed: canonicalReceipt.gasUsed?.toString?.() ?? "0",
    contractAddress:
      typeof canonicalReceipt.contractAddress === "string" ? canonicalReceipt.contractAddress : null,
  };
}
