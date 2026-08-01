import { expect } from "chai";
import { ethers } from "ethers";
import {
  assertUnrecordedTransaction,
  erc20TransferDeltaFromReceipt,
  reconcileErc20AtReceipt,
  type ConfirmedReceipt,
} from "../../scripts/v5/lib/v5ReceiptReconciliation.js";

const transferInterface = new ethers.Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const token = "0x1000000000000000000000000000000000000001";
const account = "0x2000000000000000000000000000000000000002";
const pool = "0x3000000000000000000000000000000000000003";
const other = "0x4000000000000000000000000000000000000004";
const txHash = `0x${"ab".repeat(32)}`;

function transferLog(tokenAddress: string, from: string, to: string, amount: bigint) {
  const encoded = transferInterface.encodeEventLog("Transfer", [from, to, amount]);
  return { address: tokenAddress, topics: encoded.topics, data: encoded.data };
}

function receipt(logs: ConfirmedReceipt["logs"]): ConfirmedReceipt {
  return { hash: txHash, blockNumber: 49_371_719, status: 1, to: pool, logs };
}

describe("V5 receipt-block reconciliation", function () {
  it("derives exact signed wallet flow only from the selected token receipt logs", function () {
    const result = erc20TransferDeltaFromReceipt({
      receipt: receipt([
        transferLog(token, account, pool, 100_000n),
        transferLog(token, pool, account, 314n),
        transferLog(token, pool, other, 50n),
        transferLog(other, pool, account, 999_999n),
      ]),
      token,
      account,
    });
    expect(result).to.equal(-99_686n);
  });

  it("pins the post-state read to the receipt block and returns both sources of evidence", async function () {
    let observedBlockTag: number | undefined;
    const reader = {
      async balanceOf(_account: string, overrides: { blockTag: number }) {
        observedBlockTag = overrides.blockTag;
        return 342_570_000n;
      },
    };
    const result = await reconcileErc20AtReceipt({
      reader,
      receipt: receipt([transferLog(token, pool, account, 314_389_472n)]),
      token,
      account,
      beforeBalance: 28_180_528n,
      minimumTransferDelta: 300_000_000n,
      maximumTransferDelta: 320_000_000n,
    });
    expect(observedBlockTag).to.equal(49_371_719);
    expect(result.transferDelta).to.equal(314_389_472n);
    expect(result.pinnedBalance).to.equal(342_570_000n);
    expect(result.pinnedBalanceDelta).to.equal(314_389_472n);
  });

  it("fails closed on stale intent, failed receipts, and protected-output violations", async function () {
    expect(() => assertUnrecordedTransaction(txHash, [txHash.toUpperCase().replace("0X", "0x")]))
      .to.throw("already reconciled");

    const failed = receipt([]);
    failed.status = 0;
    expect(() => erc20TransferDeltaFromReceipt({ receipt: failed, token, account }))
      .to.throw("not successful");

    const reader = { async balanceOf() { return 1n; } };
    let failure: unknown;
    try {
      await reconcileErc20AtReceipt({
        reader,
        receipt: receipt([transferLog(token, pool, account, 299n)]),
        token,
        account,
        beforeBalance: 0n,
        minimumTransferDelta: 300n,
        maximumTransferDelta: 400n,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.include("below protected minimum");
  });
});
