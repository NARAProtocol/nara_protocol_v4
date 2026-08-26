import { expect } from "chai";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  atomicWriteJson,
  createLiveBuyMatrixEvidencePaths,
  latestPointerForTerminalRun,
  minimumSubmissionWaitMs,
  resolveLiveBuyMatrixTerminalOutcome,
  secondsBetweenSubmissions,
} from "../scripts/matrix/liveBuyMatrixRuntime.js";

describe("v4 live buy Matrix runtime helpers", () => {
  it("paces relative to the previous actual submission without catch-up", () => {
    expect(minimumSubmissionWaitMs(null, 50_000, 3)).to.equal(0);
    expect(minimumSubmissionWaitMs(50_000, 51_250, 3)).to.equal(1_750);
    expect(minimumSubmissionWaitMs(50_000, 54_000, 3)).to.equal(0);
    expect(secondsBetweenSubmissions(50_000, 53_125)).to.equal(3.125);
  });

  it("creates immutable run-specific paths and a separate latest pointer", () => {
    const first = createLiveBuyMatrixEvidencePaths(
      "C:/evidence",
      "3s-100x11",
      new Date("2026-08-27T01:02:03.456Z"),
      "one"
    );
    const second = createLiveBuyMatrixEvidencePaths(
      "C:/evidence",
      "3s-100x11",
      new Date("2026-08-27T01:02:03.456Z"),
      "two"
    );

    expect(first.runId).to.equal("20260827T010203-456Z-one");
    expect(first.runPath).not.to.equal(second.runPath);
    expect(first.latestPointerPath).to.equal(second.latestPointerPath);
    expect(first.runPath).not.to.equal(first.latestPointerPath);
  });

  it("atomically replaces one run file without leaving temporary files", () => {
    const root = mkdtempSync(join(tmpdir(), "nara-live-buy-evidence-"));
    const path = join(root, "run.json");
    try {
      atomicWriteJson(path, { status: "RUNNING", trades: [] });
      atomicWriteJson(path, { status: "PASS", trades: [1] });

      expect(JSON.parse(readFileSync(path, "utf8"))).to.deep.equal({
        status: "PASS",
        trades: [1],
      });
      expect(readdirSync(root)).to.deep.equal(["run.json"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds a latest pointer only for terminal evidence", () => {
    const pointer = latestPointerForTerminalRun({
      runId: "run-1",
      runPath: "C:/evidence/run-1.json",
      status: "PASS",
      finishedAt: "2026-08-27T01:10:00.000Z",
    });

    expect(pointer).to.deep.equal({
      schemaVersion: 1,
      runId: "run-1",
      evidenceFile: "run-1.json",
      status: "PASS",
      finishedAt: "2026-08-27T01:10:00.000Z",
    });
    expect(() =>
      latestPointerForTerminalRun({
        runId: "run-1",
        runPath: "C:/evidence/run-1.json",
        status: "RUNNING",
        finishedAt: "",
      })
    ).to.throw("latest pointer requires a terminal run");
  });

  it("preserves the primary failure while recording cleanup separately", () => {
    expect(
      resolveLiveBuyMatrixTerminalOutcome({
        primaryError: "buy 17 failed",
        cleanupErrors: ["Permit2 cleanup failed"],
        completedTrades: 16,
        expectedTrades: 100,
      })
    ).to.deep.equal({
      status: "FAILED_STOPPED",
      error: "buy 17 failed",
    });
    expect(
      resolveLiveBuyMatrixTerminalOutcome({
        primaryError: null,
        cleanupErrors: ["Permit2 cleanup failed", "ERC20 cleanup failed"],
        completedTrades: 100,
        expectedTrades: 100,
      })
    ).to.deep.equal({
      status: "FAILED_CLEANUP",
      error: "Permit2 cleanup failed | ERC20 cleanup failed",
    });
  });

  it("does not require RPC, environment, signer, or transaction access", () => {
    const source = readFileSync(
      "scripts/matrix/liveBuyMatrixRuntime.ts",
      "utf8"
    );

    expect(source).not.to.contain("process.env");
    expect(source).not.to.match(
      /ethers|Provider|Wallet|Signer|sendTransaction/
    );
    expect(existsSync("scripts/matrix/liveBuyMatrixRuntime.ts")).to.equal(true);
  });
});
