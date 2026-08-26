import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  planPumpHedgeAmount,
  planStabilizerScan,
} from "../scripts/matrix/stabilizerScanRange.js";

describe("v4 two-sided stabilizer scan planning", () => {
  it("pins the current head as the first live baseline", () => {
    expect(planStabilizerScan({ lastBlock: 0, chainHead: 500 })).to.deep.equal({
      mode: "live",
      baselineBlock: 500,
      complete: false,
      completeAfterRange: false,
    });
  });

  it("scans every new live block when the watcher is within its range cap", () => {
    expect(
      planStabilizerScan({ lastBlock: 500, chainHead: 503 })
    ).to.deep.equal({
      mode: "live",
      fromBlock: 501,
      toBlock: 503,
      skippedFromBlock: undefined,
      skippedToBlock: undefined,
      complete: false,
      completeAfterRange: false,
    });
  });

  it("reports the exact live gap skipped when the watcher falls behind", () => {
    expect(
      planStabilizerScan({
        lastBlock: 100,
        chainHead: 200,
        maxBlockRange: 25,
      })
    ).to.deep.equal({
      mode: "live",
      fromBlock: 176,
      toBlock: 200,
      skippedFromBlock: 101,
      skippedToBlock: 175,
      complete: false,
      completeAfterRange: false,
    });
  });

  it("starts replay immediately before the requested first block", () => {
    expect(
      planStabilizerScan({
        lastBlock: 0,
        chainHead: 1_000,
        replayFromBlock: 700,
        replayToBlock: 900,
      })
    ).to.deep.equal({
      mode: "replay",
      baselineBlock: 699,
      complete: false,
      completeAfterRange: false,
    });
  });

  it("advances replay in bounded contiguous chunks", () => {
    expect(
      planStabilizerScan({
        lastBlock: 699,
        chainHead: 1_000,
        replayFromBlock: 700,
        replayToBlock: 900,
        maxBlockRange: 100,
      })
    ).to.deep.equal({
      mode: "replay",
      fromBlock: 700,
      toBlock: 799,
      complete: false,
      completeAfterRange: false,
    });
  });

  it("marks the final replay chunk and then reports completion", () => {
    const finalChunk = planStabilizerScan({
      lastBlock: 799,
      chainHead: 1_000,
      replayFromBlock: 700,
      replayToBlock: 900,
      maxBlockRange: 200,
    });
    expect(finalChunk).to.include({
      fromBlock: 800,
      toBlock: 900,
      completeAfterRange: true,
    });

    expect(
      planStabilizerScan({
        lastBlock: 900,
        chainHead: 1_000,
        replayFromBlock: 700,
        replayToBlock: 900,
      })
    ).to.deep.equal({
      mode: "replay",
      complete: true,
      completeAfterRange: false,
    });
  });

  it("rejects an inverted replay window", () => {
    expect(() =>
      planStabilizerScan({
        lastBlock: 0,
        chainHead: 1_000,
        replayFromBlock: 900,
        replayToBlock: 800,
      })
    ).to.throw(
      "replayToBlock must be greater than or equal to replayFromBlock"
    );
  });

  it("reconstructs the proven 90% whale-equivalent hedge amount", () => {
    expect(
      planPumpHedgeAmount({
        whaleEquivalentNara: 616_640_240_255_518_701_004n,
        hedgeRatioBps: 9_000n,
        configuredCapNara: 25_000n * 10n ** 18n,
        availableNara: 25_000n * 10n ** 18n,
      })
    ).to.equal(554_976_216_229_966_830_903n);
  });

  it("caps a planned pump hedge by available inventory", () => {
    expect(
      planPumpHedgeAmount({
        whaleEquivalentNara: 1_000n,
        hedgeRatioBps: 9_000n,
        configuredCapNara: 800n,
        availableNara: 500n,
      })
    ).to.equal(500n);
  });

  it("keeps Phase 1 free of signing-key and execution surfaces", () => {
    const source = readFileSync(
      "scripts/matrix/runV4TwoSidedStabilizer.ts",
      "utf8"
    );
    const liveGateIndex = source.indexOf("if (LIVE_FLAG)");
    const configIndex = source.indexOf(
      "const config = productionV4ReadOnlyConfig(deployment)"
    );

    expect(liveGateIndex).to.be.greaterThan(-1);
    expect(configIndex).to.be.greaterThan(liveGateIndex);
    expect(source).to.contain("process.exit(2)");
    expect(source).not.to.contain("PRIVATE_KEY");
    expect(source).not.to.contain("dotenv");
    expect(source).not.to.contain("runV4LiveSameBlockBuyTaxMatrix");
    expect(source).not.to.contain("process.env.V4_DEPLOYER");
    expect(source).not.to.contain("new ethers.Wallet");
    expect(source).not.to.contain("--execute");
    expect(source).not.to.contain("process.exit(code)");
    expect(source).to.contain('kind: "scanCheckpoint"');
    expect(source.indexOf("lastBlock = plan.toBlock")).to.be.greaterThan(
      source.indexOf('kind: "scanCheckpoint"')
    );
  });
});
