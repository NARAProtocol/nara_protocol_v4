import { expect } from "chai";

import {
  isBlockNotFoundError,
  waitForConfirmedBlockState,
} from "../tools/v4-test-console/src/confirmed-block.js";

import {
  elapsedLabel,
  parseStoredPendingTransaction,
  pendingTransactionStorageKey,
  progressButtonLabel,
  shouldApplyReadSnapshot,
  shouldCloseReviewForProgress,
  shouldDismissProgressForReview,
  type TransactionProgress,
} from "../tools/v4-test-console/src/transaction-progress.js";

const progress: TransactionProgress = {
  action: "Lock 10 NARA",
  stage: "submitted",
  step: 2,
  detail: "Waiting for Base confirmation.",
  startedAt: 1_000,
};

describe("v4 test console transaction progress", function () {
  it("uses wallet and chain-specific pending transaction storage", function () {
    expect(pendingTransactionStorageKey("0xAbC")).to.equal(
      "nara-v4-test-console:pending-transaction:8453:0xabc",
    );
  });

  it("restores only valid submitted transaction records", function () {
    const hash = `0x${"ab".repeat(32)}`;
    expect(parseStoredPendingTransaction(JSON.stringify({ action: "Lock", hash, startedAt: 123 })))
      .to.deep.equal({ action: "Lock", hash, startedAt: 123 });
    expect(parseStoredPendingTransaction(JSON.stringify({ action: "Lock", hash: "0xdead", startedAt: 123 })))
      .to.equal(null);
    expect(parseStoredPendingTransaction("not json")).to.equal(null);
  });

  it("rejects a stale read that finishes after the confirmed receipt snapshot", function () {
    expect(shouldApplyReadSnapshot(500n, 499n)).to.equal(false);
    expect(shouldApplyReadSnapshot(500n, 500n)).to.equal(true);
    expect(shouldApplyReadSnapshot(500n, 501n)).to.equal(true);
  });

  it("removes completed feedback before opening a new transaction review", function () {
    expect(shouldDismissProgressForReview({ ...progress, stage: "complete", step: 4 })).to.equal(true);
    expect(shouldDismissProgressForReview(progress)).to.equal(false);
    expect(shouldDismissProgressForReview({ ...progress, stage: "error" })).to.equal(false);
    expect(shouldDismissProgressForReview(null)).to.equal(false);
  });

  it("hands the screen from review to progress when the wallet takes over", function () {
    expect(shouldCloseReviewForProgress({ ...progress, stage: "checking", step: 0 })).to.equal(false);
    expect(shouldCloseReviewForProgress({ ...progress, stage: "wallet", step: 1 })).to.equal(true);
    expect(shouldCloseReviewForProgress(progress)).to.equal(true);
    expect(shouldCloseReviewForProgress({ ...progress, stage: "syncing", step: 3 })).to.equal(true);
    expect(shouldCloseReviewForProgress({ ...progress, stage: "complete", step: 4 })).to.equal(false);
  });

  it("states the exact active transaction phase on buttons", function () {
    expect(progressButtonLabel(progress, true, "Lock")).to.equal("Waiting for Base…");
    expect(progressButtonLabel({ ...progress, stage: "wallet", step: 1 }, true, "Lock"))
      .to.equal("Confirm or reject in wallet");
    expect(progressButtonLabel(progress, false, "Lock")).to.equal("Lock");
  });

  it("shows elapsed time without implying fake completion progress", function () {
    expect(elapsedLabel(1_000, 45_999)).to.equal("44s");
    expect(elapsedLabel(1_000, 126_000)).to.equal("2m 05s");
  });

  it("waits for a lagging read provider after Base confirms a block", async function () {
    let reads = 0;
    const client = {
      async getBlock() {
        reads += 1;
        if (reads < 3) {
          throw new Error("Requested resource not found. block not found: 0x2fc2646");
        }
        return { number: 50_079_302n };
      },
    };
    await waitForConfirmedBlockState(client, 50_079_302n, {
      attempts: 3,
      intervalMs: 0,
      wait: async () => undefined,
    });
    expect(reads).to.equal(3);
  });

  it("does not retry unrelated confirmed-block read failures", async function () {
    const denied = Object.assign(new Error("request denied"), { code: 403 });
    expect(isBlockNotFoundError(denied)).to.equal(false);
    let reads = 0;
    try {
      await waitForConfirmedBlockState({
        async getBlock() {
          reads += 1;
          throw denied;
        },
      }, 1n, { attempts: 20, intervalMs: 0, wait: async () => undefined });
      expect.fail("Expected the unrelated failure to be preserved");
    } catch (error) {
      expect(error).to.equal(denied);
    }
    expect(reads).to.equal(1);
  });
});
