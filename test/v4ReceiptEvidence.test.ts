import { expect } from "chai";
import { canonicalReceiptEvidence } from "../scripts/lib/v4ReceiptEvidence.js";

const TRANSACTION_HASH = `0x${"12".repeat(32)}`;
const CANONICAL_BLOCK_HASH = `0x${"34".repeat(32)}`;
const ZERO_HASH = `0x${"00".repeat(32)}`;

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    hash: TRANSACTION_HASH,
    blockNumber: 123,
    blockHash: CANONICAL_BLOCK_HASH,
    status: 1,
    gasUsed: 42_000n,
    contractAddress: null,
    ...overrides,
  };
}

async function expectRejection(promise: Promise<unknown>, expectedMessage: string): Promise<void> {
  let failure: unknown;
  try {
    await promise;
  } catch (error) {
    failure = error;
  }
  expect(failure).to.be.instanceOf(Error);
  expect((failure as Error).message).to.contain(expectedMessage);
}

describe("v4 deployment receipt evidence", function () {
  it("replaces a tx.wait ZeroHash with the canonical provider receipt block hash", async function () {
    const provider = {
      getTransactionReceipt: async (transactionHash: string) => {
        expect(transactionHash).to.equal(TRANSACTION_HASH);
        return receipt();
      },
    };

    const evidence = await canonicalReceiptEvidence(
      provider,
      TRANSACTION_HASH,
      receipt({ blockHash: ZERO_HASH }),
    );

    expect(evidence.blockHash).to.equal(CANONICAL_BLOCK_HASH);
    expect(evidence.blockNumber).to.equal(123);
    expect(evidence.status).to.equal(1);
    expect(evidence.gasUsed).to.equal("42000");
  });

  it("rejects a canonical provider receipt that still has a zero block hash", async function () {
    const provider = {
      getTransactionReceipt: async () => receipt({ blockHash: ZERO_HASH }),
    };

    await expectRejection(
      canonicalReceiptEvidence(provider, TRANSACTION_HASH, receipt()),
      "does not contain a non-zero block hash",
    );
  });

  it("rejects missing or inconsistent canonical receipts", async function () {
    await expectRejection(
      canonicalReceiptEvidence({ getTransactionReceipt: async () => null }, TRANSACTION_HASH, receipt()),
      "is unavailable after transaction confirmation",
    );

    await expectRejection(
      canonicalReceiptEvidence(
        { getTransactionReceipt: async () => receipt({ blockNumber: 124 }) },
        TRANSACTION_HASH,
        receipt(),
      ),
      "block number does not match tx.wait()",
    );

    await expectRejection(
      canonicalReceiptEvidence(
        { getTransactionReceipt: async () => receipt({ status: 0 }) },
        TRANSACTION_HASH,
        receipt(),
      ),
      "status does not match tx.wait()",
    );
  });
});
