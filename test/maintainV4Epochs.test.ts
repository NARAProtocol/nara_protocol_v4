import { expect } from "chai";
import {
  epochHealthStatus,
  parseMaintainerArgs,
  planEpochBatches,
  untrackedDirectReserve,
} from "../scripts/maintainV4Epochs.js";

describe("v4 epoch maintainer", function () {
  it("plans the current 462-epoch recovery in bounded batches", function () {
    expect(planEpochBatches(462n, 100, 10)).to.deep.equal([100n, 100n, 100n, 100n, 62n]);
  });

  it("honors the maximum batch count", function () {
    expect(planEpochBatches(462n, 100, 3)).to.deep.equal([100n, 100n, 100n]);
  });

  it("distinguishes the external sealed reserve from direct untracked engine funds", function () {
    expect(untrackedDirectReserve(0n, 0n, 0n, 0n)).to.equal(0n);
    expect(untrackedDirectReserve(650_000n, 0n, 0n, 0n)).to.equal(650_000n);
    expect(untrackedDirectReserve(650_000n, 100_000n, 50_000n, 500_000n)).to.equal(0n);
  });

  it("classifies backlog against the engine JIT cap", function () {
    expect(epochHealthStatus(0n)).to.equal("current");
    expect(epochHealthStatus(8n)).to.equal("jit-recoverable");
    expect(epochHealthStatus(9n)).to.equal("writes-blocked");
  });

  it("defaults to read-only and validates execution bounds", function () {
    expect(parseMaintainerArgs([])).to.deep.equal({
      execute: false,
      batchSize: 100,
      maxBatches: 10,
      confirmations: 1,
    });
    expect(parseMaintainerArgs([
      "--execute", "--batch-size", "75", "--max-batches", "8", "--confirmations", "2",
    ])).to.deep.equal({ execute: true, batchSize: 75, maxBatches: 8, confirmations: 2 });
    expect(() => parseMaintainerArgs(["--batch-size", "151"]))
      .to.throw("--batch-size must be an integer between 1 and 150");
  });
});
