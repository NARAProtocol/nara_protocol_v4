import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  analyzeStabilizerPersistenceText,
  midUsdcPerNaraFromSqrtPriceX96,
} from "../scripts/matrix/analyzeStabilizerPersistence.js";

function line(value: Record<string, unknown>): string {
  return JSON.stringify({ schemaVersion: 2, ...value });
}

const V2_SESSION_METADATA = {
  chainId: 8453,
  poolId: `0x${"11".repeat(32)}`,
  configFingerprint: `0x${"22".repeat(32)}`,
};

function completedSession(
  sessionId: string,
  events: Record<string, unknown>[]
): string[] {
  return [
    line({
      sessionId,
      ts: "2026-08-26T00:00:00.000Z",
      kind: "sessionStarted",
      mode: "REPLAY_SHADOW",
      ...V2_SESSION_METADATA,
    }),
    ...events.map((event, index) =>
      line({
        sessionId,
        ts: `2026-08-26T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
        verdict: "GO",
        edgeUsdc: "1.0000",
        triggerBlockHash: `0x${"33".repeat(32)}`,
        observationIds: [`0x${String(index + 1).padStart(64, "0")}:0`],
        ...event,
      })
    ),
    line({
      sessionId,
      ts: "2026-08-26T00:01:00.000Z",
      kind: "sessionSummary",
      pumpsSeen: events.filter((event) => event.kind === "pumpDefenseSimulated")
        .length,
      dumpsSeen: events.filter(
        (event) => event.kind === "floorDefenseSimulated"
      ).length,
      simulationsRun: events.length,
      lastBlock: 1_000,
    }),
  ];
}

describe("v4 stabilizer persistence analyzer", () => {
  it("selects only completed canonical sessions and analyzes all offsets", async () => {
    const ledger = [
      JSON.stringify({ sessionId: "legacy", kind: "sessionStarted" }),
      ...completedSession("complete", [
        {
          kind: "pumpDefenseSimulated",
          triggerTx: "0xabc",
          referenceBlock: 99,
          triggerBlock: 100,
        },
      ]),
      line({
        sessionId: "incomplete",
        ts: "2026-08-26T00:02:00.000Z",
        kind: "sessionStarted",
        ...V2_SESSION_METADATA,
      }),
    ].join("\n");
    const mids = new Map<number, number>([
      [99, 1],
      [100, 1.2],
      [101, 1.18],
      [103, 1.15],
      [105, 1.1],
      [110, 1.05],
      [120, 1],
    ]);

    const report = await analyzeStabilizerPersistenceText(
      ledger,
      async (blockNumber) => {
        const mid = mids.get(blockNumber);
        if (mid === undefined) throw new Error("unexpected block");
        return mid;
      }
    );

    expect(report.sessions).to.deep.equal({
      canonical: 2,
      completed: 1,
      eligible: 1,
      selected: 1,
      selectedIds: ["complete"],
    });
    expect(report.offsets).to.deep.equal([1, 3, 5, 10, 20]);
    expect(report.events).to.have.length(1);
    expect(report.events[0].status).to.equal("complete");
    expect(report.events[0].persistence?.triggerMoveBps).to.equal(2_000);
    expect(
      report.events[0].persistence?.points.map((point) => point.offsetBlocks)
    ).to.deep.equal([1, 3, 5, 10, 20]);
    expect(report.diagnostics.selection).to.deep.include({
      sessionId: "incomplete",
      line: 5,
      reason: "session_incomplete",
      issues: ["missing_session_summary"],
      exclusionReasons: ["incomplete_session"],
    });
    expect(report.ledger.lines.ignoredNonCanonical).to.equal(1);
  });

  it("caches shared block reads across events", async () => {
    const ledger = completedSession("shared", [
      {
        kind: "pumpDefenseSimulated",
        referenceBlock: 199,
        triggerBlock: 200,
      },
      {
        kind: "pumpDefenseSimulated",
        referenceBlock: 199,
        triggerBlock: 200,
      },
    ]).join("\n");
    const calls = new Map<number, number>();

    const report = await analyzeStabilizerPersistenceText(
      ledger,
      async (blockNumber) => {
        calls.set(blockNumber, (calls.get(blockNumber) ?? 0) + 1);
        return blockNumber === 199 ? 1 : 1.1;
      }
    );

    expect(report.events).to.have.length(2);
    expect(report.blockReads.uniqueRequested).to.equal(7);
    expect(Array.from(calls.values())).to.deep.equal([1, 1, 1, 1, 1, 1, 1]);
  });

  it("reports unavailable and unindexed blocks without substituting another mid", async () => {
    const ledger = completedSession("partial", [
      {
        kind: "floorDefenseSimulated",
        referenceBlock: 299,
        triggerBlock: 300,
        profitIfRecoveryUsdc: "1.0000",
      },
    ]).join("\n");
    const calls: number[] = [];

    const report = await analyzeStabilizerPersistenceText(
      ledger,
      async (blockNumber) => {
        calls.push(blockNumber);
        if (blockNumber === 303) throw new Error("header not found");
        return blockNumber === 299 ? 1 : 0.8;
      },
      { indexedThroughBlock: 305 }
    );

    expect(calls).to.have.members([299, 300, 301, 303, 305]);
    expect(calls).not.to.include.members([310, 320]);
    expect(report.events[0].status).to.equal("partial");
    expect(
      report.events[0].persistence?.points.map((point) => point.offsetBlocks)
    ).to.deep.equal([1, 5]);
    expect(report.blockReads).to.deep.equal({
      indexedThroughBlock: 305,
      uniqueRequested: 7,
      available: 4,
      unavailable: 1,
      notIndexed: 2,
    });
    expect(report.diagnostics.reads.map((item) => item.reason)).to.deep.equal([
      "historical_block_unavailable",
      "block_not_indexed",
      "block_not_indexed",
    ]);
    expect(
      report.events[0].observations.find(
        (observation) => observation.blockNumber === 310
      )
    ).to.include({
      status: "not_indexed",
      midUsdcPerNara: null,
      reason: "block_not_indexed",
    });
  });

  it("supports an explicit session filter and rejects invalid event blocks", async () => {
    const ledger = [
      ...completedSession("selected", [
        {
          kind: "pumpDefenseSimulated",
          referenceBlock: 400,
          triggerBlock: 400,
        },
      ]),
      ...completedSession("other", [
        {
          kind: "pumpDefenseSimulated",
          referenceBlock: 499,
          triggerBlock: 500,
        },
      ]),
    ].join("\n");

    const report = await analyzeStabilizerPersistenceText(
      ledger,
      async () => 1,
      { sessionId: "selected" }
    );

    expect(report.sessions.selectedIds).to.deep.equal(["selected"]);
    expect(report.events).to.deep.equal([]);
    expect(report.blockReads.uniqueRequested).to.equal(0);
    expect(report.diagnostics.selection).to.deep.include({
      sessionId: "selected",
      line: 2,
      reason: "invalid_simulation_block_fields",
    });
  });

  it("excludes a structurally complete but counter-mismatched session", async () => {
    const records = completedSession("counter-mismatch", [
      {
        kind: "pumpDefenseSimulated",
        referenceBlock: 599,
        triggerBlock: 600,
      },
    ]);
    records[records.length - 1] = line({
      sessionId: "counter-mismatch",
      ts: "2026-08-26T00:01:00.000Z",
      kind: "sessionSummary",
      pumpsSeen: 2,
      dumpsSeen: 0,
      simulationsRun: 1,
      lastBlock: 600,
    });
    let readCount = 0;

    const report = await analyzeStabilizerPersistenceText(
      records.join("\n"),
      async () => {
        readCount++;
        return 1;
      },
      { sessionId: "counter-mismatch" }
    );

    expect(report.sessions).to.deep.equal({
      canonical: 1,
      completed: 1,
      eligible: 0,
      selected: 0,
      selectedIds: [],
    });
    expect(report.events).to.deep.equal([]);
    expect(report.blockReads.uniqueRequested).to.equal(0);
    expect(readCount).to.equal(0);
    expect(report.diagnostics.selection).to.deep.equal([
      {
        sessionId: "counter-mismatch",
        line: 1,
        reason: "completed_session_ineligible",
        issues: ["reported_pump_count_mismatch"],
        exclusionReasons: ["malformed_session"],
      },
    ]);
  });

  it("converts either canonical currency ordering into USDC per NARA", () => {
    const q96 = 2n ** 96n;

    expect(midUsdcPerNaraFromSqrtPriceX96(q96, true)).to.equal(1e12);
    expect(midUsdcPerNaraFromSqrtPriceX96(q96, false)).to.equal(1e12);
    expect(midUsdcPerNaraFromSqrtPriceX96(q96 * 2n, true)).to.equal(4e12);
    expect(midUsdcPerNaraFromSqrtPriceX96(q96 * 2n, false)).to.equal(2.5e11);
  });

  it("contains no signer, execution, approval, secret, or write surface", () => {
    const source = readFileSync(
      "scripts/matrix/analyzeStabilizerPersistence.ts",
      "utf8"
    );

    expect(source).not.to.match(/Wallet|Signer|sendTransaction|\.approve\s*\(/);
    expect(source).not.to.match(/appendFile|writeFile|mkdirSync/);
    expect(source).not.to.contain("PRIVATE_KEY");
  });
});
