import { expect } from "chai";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  groupCanonicalStabilizerShadowEntries,
  parseCanonicalStabilizerShadowJsonl,
  summarizeStabilizerShadowFile,
  summarizeStabilizerShadowText,
} from "../scripts/matrix/summarizeStabilizerShadow.js";

const POOL_ID = `0x${"11".repeat(32)}`;
const CONFIG_FINGERPRINT = `0x${"22".repeat(32)}`;

function line(
  value: Record<string, unknown>,
  schemaVersion: 1 | 2 = 2
): string {
  return JSON.stringify({ schemaVersion, ...value });
}

function binding(): Record<string, unknown> {
  return {
    chainId: 8453,
    poolId: POOL_ID,
    configFingerprint: CONFIG_FINGERPRINT,
  };
}

function evidence(seed: string): Record<string, unknown> {
  return {
    triggerBlockHash: `0x${seed.repeat(64).slice(0, 64)}`,
    observationIds: [`0x${seed.repeat(64).slice(0, 64)}:0`],
  };
}

describe("v4 stabilizer shadow ledger summary", () => {
  it("exports pure canonical parsing and session grouping for later analysis", () => {
    const ledger = [
      line({
        sessionId: "one",
        ts: "2026-08-26T00:00:00.000Z",
        kind: "sessionStarted",
        ...binding(),
      }),
      line({
        sessionId: "two",
        ts: "2026-08-26T00:00:01.000Z",
        kind: "sessionStarted",
        ...binding(),
      }),
      line({
        sessionId: "one",
        ts: "2026-08-26T00:00:02.000Z",
        kind: "sessionSummary",
      }),
    ].join("\n");

    const parsed = parseCanonicalStabilizerShadowJsonl(ledger);
    const grouped = groupCanonicalStabilizerShadowEntries(parsed.entries);

    expect(parsed.entries.map((entry) => entry.line)).to.deep.equal([1, 2, 3]);
    expect(Array.from(grouped.keys())).to.deep.equal(["one", "two"]);
    expect(grouped.get("one")?.map((entry) => entry.line)).to.deep.equal([
      1, 3,
    ]);
  });

  it("groups canonical sessions and aggregates triggers, skips, verdicts, and edge", () => {
    const ledger = [
      JSON.stringify({ ts: "2026-08-26T00:00:00.000Z", kind: "legacy" }),
      line({
        sessionId: "session-a",
        ts: "2026-08-26T00:01:00.000Z",
        kind: "sessionStarted",
        mode: "REPLAY_SHADOW",
        ...binding(),
      }),
      line({
        sessionId: "session-b",
        ts: "2026-08-26T00:02:00.000Z",
        kind: "sessionStarted",
        mode: "LIVE_SHADOW",
        ...binding(),
      }),
      line({
        sessionId: "session-a",
        ts: "2026-08-26T00:01:01.000Z",
        kind: "pumpDefenseSimulated",
        verdict: "GO",
        edgeUsdc: "1.5000",
        ...evidence("a"),
      }),
      line({
        sessionId: "session-a",
        ts: "2026-08-26T00:01:02.000Z",
        kind: "floorDefenseSimulated",
        verdict: "NO_GO",
        profitIfRecoveryUsdc: "-0.2500",
        ...evidence("b"),
      }),
      line({
        sessionId: "session-a",
        ts: "2026-08-26T00:01:03.000Z",
        kind: "triggerSkipped",
        side: "floor",
        reason: "watched_wallet_transaction",
      }),
      line({
        sessionId: "session-a",
        ts: "2026-08-26T00:01:04.000Z",
        kind: "sessionSummary",
        pumpsSeen: 1,
        dumpsSeen: 1,
        simulationsRun: 2,
        lastBlock: 100,
      }),
      line({
        sessionId: "session-b",
        ts: "2026-08-26T00:02:01.000Z",
        kind: "pumpSimSkipped",
        reason: "quote_unavailable_at_trigger_block",
      }),
      "",
      "{not-json",
    ].join("\n");

    const summary = summarizeStabilizerShadowText(ledger);

    expect(summary.lines).to.deep.equal({
      total: 10,
      blank: 1,
      canonical: 7,
      canonicalV2: 7,
      legacySchema1: 0,
      ignoredNonCanonical: 1,
      malformedJson: 1,
      invalidCanonical: 0,
    });
    expect(summary.sessionCounts).to.deep.equal({
      total: 2,
      complete: 1,
      incomplete: 1,
      malformed: 0,
      eligible: 1,
      legacySchema1: 0,
    });
    expect(summary.totals).to.deep.equal({
      pumps: 1,
      dumps: 1,
      simulations: 2,
      skips: 1,
      verdicts: { GO: 1, NO_GO: 1, unknown: 0 },
      standaloneEdgeUsdc: {
        total: 1.25,
        go: 1.5,
        noGo: -0.25,
        pump: 1.5,
        floor: -0.25,
        samples: 2,
        invalidSamples: 0,
      },
    });
    expect(summary.diagnosticAllSessionTotals).to.deep.equal({
      pumps: 2,
      dumps: 1,
      simulations: 2,
      skips: 2,
      verdicts: { GO: 1, NO_GO: 1, unknown: 0 },
      standaloneEdgeUsdc: {
        total: 1.25,
        go: 1.5,
        noGo: -0.25,
        pump: 1.5,
        floor: -0.25,
        samples: 2,
        invalidSamples: 0,
      },
    });
    expect(summary.sessions[0]).to.include({
      sessionId: "session-a",
      complete: true,
      malformed: false,
    });
    expect(summary.sessions[0].releaseEvidenceEligibility).to.deep.equal({
      eligible: true,
      exclusionReasons: [],
    });
    expect(summary.sessions[1].issues).to.include("missing_session_summary");
    expect(summary.sessions[1].releaseEvidenceEligibility).to.deep.equal({
      eligible: false,
      exclusionReasons: ["incomplete_session"],
    });
    expect(summary.diagnostics.malformedJson).to.deep.equal([
      { line: 10, reason: "invalid_json" },
    ]);
  });

  it("flags structurally malformed sessions and invalid canonical records", () => {
    const ledger = [
      line({
        sessionId: "bad-session",
        ts: "2026-08-26T01:00:00.000Z",
        kind: "sessionStarted",
        mode: "REPLAY_SHADOW",
        ...binding(),
      }),
      line({
        sessionId: "bad-session",
        ts: "2026-08-26T01:00:01.000Z",
        kind: "pumpDefenseSimulated",
        verdict: "MAYBE",
        edgeUsdc: "not-a-number",
        ...evidence("c"),
      }),
      line({
        sessionId: "bad-session",
        ts: "2026-08-26T01:00:02.000Z",
        kind: "sessionSummary",
        pumpsSeen: 2,
        dumpsSeen: 0,
        simulationsRun: 0,
        lastBlock: 200,
      }),
      JSON.stringify({
        schemaVersion: 1,
        ts: "2026-08-26T01:00:03.000Z",
        kind: "sessionStarted",
      }),
    ].join("\n");

    const summary = summarizeStabilizerShadowText(ledger);
    const session = summary.sessions[0];

    expect(summary.lines.invalidCanonical).to.equal(1);
    expect(summary.sessionCounts.malformed).to.equal(1);
    expect(session.complete).to.equal(true);
    expect(session.malformed).to.equal(true);
    expect(session.releaseEvidenceEligibility).to.deep.equal({
      eligible: false,
      exclusionReasons: ["malformed_session"],
    });
    expect(session.verdicts.unknown).to.equal(1);
    expect(session.standaloneEdgeUsdc.invalidSamples).to.equal(1);
    expect(session.issues).to.include.members([
      "invalid_pump_simulation_verdict",
      "invalid_pump_standalone_edge",
      "reported_simulation_count_mismatch",
      "reported_pump_count_mismatch",
    ]);
    expect(summary.totals).to.deep.equal({
      pumps: 0,
      dumps: 0,
      simulations: 0,
      skips: 0,
      verdicts: { GO: 0, NO_GO: 0, unknown: 0 },
      standaloneEdgeUsdc: {
        total: 0,
        go: 0,
        noGo: 0,
        pump: 0,
        floor: 0,
        samples: 0,
        invalidSamples: 0,
      },
    });
    expect(summary.diagnosticAllSessionTotals).to.include({
      pumps: 1,
      simulations: 1,
    });
  });

  it("reads only the selected JSONL file and the CLI prints the same JSON summary", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nara-shadow-summary-"));
    const ledgerPath = join(tempRoot, "fixture.jsonl");
    const fixture = [
      line({
        sessionId: "cli-session",
        ts: "2026-08-26T02:00:00.000Z",
        kind: "sessionStarted",
        mode: "LIVE_SHADOW",
        ...binding(),
      }),
      line({
        sessionId: "cli-session",
        ts: "2026-08-26T02:00:01.000Z",
        kind: "sessionSummary",
        pumpsSeen: 0,
        dumpsSeen: 0,
        simulationsRun: 0,
        lastBlock: 300,
      }),
    ].join("\n");
    writeFileSync(ledgerPath, fixture, "utf8");

    try {
      const direct = summarizeStabilizerShadowFile(ledgerPath);
      const cli = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/matrix/summarizeStabilizerShadow.ts",
          ledgerPath,
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );

      expect(cli.status, cli.stderr).to.equal(0);
      expect(JSON.parse(cli.stdout)).to.deep.equal(direct);
      expect(direct.sessionCounts).to.deep.equal({
        total: 1,
        complete: 1,
        incomplete: 0,
        malformed: 0,
        eligible: 1,
        legacySchema1: 0,
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps schema v1 sessions visible but excludes them from v2 release evidence", () => {
    const ledger = [
      line(
        {
          sessionId: "legacy-complete",
          ts: "2026-08-26T03:00:00.000Z",
          kind: "sessionStarted",
          mode: "REPLAY_SHADOW",
        },
        1
      ),
      line(
        {
          sessionId: "legacy-complete",
          ts: "2026-08-26T03:00:01.000Z",
          kind: "pumpDefenseSimulated",
          verdict: "GO",
          edgeUsdc: "9.5",
        },
        1
      ),
      line(
        {
          sessionId: "legacy-complete",
          ts: "2026-08-26T03:00:02.000Z",
          kind: "sessionSummary",
          pumpsSeen: 1,
          dumpsSeen: 0,
          simulationsRun: 1,
          lastBlock: 400,
        },
        1
      ),
    ].join("\n");

    const summary = summarizeStabilizerShadowText(ledger);

    expect(summary.lines).to.include({
      canonical: 3,
      canonicalV2: 0,
      legacySchema1: 3,
    });
    expect(summary.sessionCounts).to.include({
      total: 1,
      complete: 1,
      eligible: 0,
      legacySchema1: 1,
    });
    expect(summary.sessions[0].issues).to.include("legacy_schema_v1");
    expect(summary.sessions[0].releaseEvidenceEligibility).to.deep.equal({
      eligible: false,
      exclusionReasons: ["legacy_schema_v1"],
    });
    expect(summary.totals.simulations).to.equal(0);
    expect(summary.diagnosticAllSessionTotals.simulations).to.equal(1);
    expect(summary.diagnostics.legacySchema1).to.have.length(3);
  });

  it("excludes sessions containing watcher errors or scan gaps", () => {
    const ledger = [
      line({
        sessionId: "integrity-gap",
        ts: "2026-08-26T04:00:00.000Z",
        kind: "sessionStarted",
        mode: "LIVE_SHADOW",
        ...binding(),
      }),
      line({
        sessionId: "integrity-gap",
        ts: "2026-08-26T04:00:01.000Z",
        kind: "watcherError",
        reason: "rpc_unavailable",
      }),
      line({
        sessionId: "integrity-gap",
        ts: "2026-08-26T04:00:02.000Z",
        kind: "scanGap",
        fromBlock: 401,
        toBlock: 410,
      }),
      line({
        sessionId: "integrity-gap",
        ts: "2026-08-26T04:00:03.000Z",
        kind: "sessionSummary",
        pumpsSeen: 0,
        dumpsSeen: 0,
        simulationsRun: 0,
        lastBlock: 410,
      }),
    ].join("\n");

    const session = summarizeStabilizerShadowText(ledger).sessions[0];

    expect(session.complete).to.equal(true);
    expect(session.malformed).to.equal(false);
    expect(session.issues).to.include.members(["watcher_error", "scan_gap"]);
    expect(session.releaseEvidenceEligibility).to.deep.equal({
      eligible: false,
      exclusionReasons: ["watcher_error", "scan_gap"],
    });
  });

  it("deduplicates overlapping eligible v2 simulations by immutable evidence identity", () => {
    const blockHash = `0x${"ab".repeat(32)}`;
    const observationA = `0x${"cd".repeat(32)}:4`;
    const observationB = `0x${"ef".repeat(32)}:9`;
    const session = (
      sessionId: string,
      configFingerprint = CONFIG_FINGERPRINT
    ): string[] => [
      line({
        sessionId,
        ts: "2026-08-26T05:00:00.000Z",
        kind: "sessionStarted",
        mode: "REPLAY_SHADOW",
        ...binding(),
        configFingerprint,
      }),
      line({
        sessionId,
        ts: "2026-08-26T05:00:01.000Z",
        kind: "pumpDefenseSimulated",
        verdict: "GO",
        edgeUsdc: "5",
        triggerBlockHash: blockHash,
        observationIds:
          sessionId === "overlap-b"
            ? [observationB, observationA]
            : [observationA, observationB],
      }),
      line({
        sessionId,
        ts: "2026-08-26T05:00:02.000Z",
        kind: "sessionSummary",
        pumpsSeen: 1,
        dumpsSeen: 0,
        simulationsRun: 1,
        lastBlock: 500,
      }),
    ];
    const ledger = [
      ...session("overlap-a"),
      ...session("overlap-b"),
      ...session("different-config", `0x${"33".repeat(32)}`),
    ].join("\n");

    const summary = summarizeStabilizerShadowText(ledger);

    expect(summary.sessionCounts.eligible).to.equal(3);
    expect(summary.diagnosticAllSessionTotals.simulations).to.equal(3);
    expect(summary.totals).to.include({ pumps: 2, simulations: 2 });
    expect(summary.totals.verdicts.GO).to.equal(2);
    expect(summary.totals.standaloneEdgeUsdc).to.include({
      total: 10,
      go: 10,
      pump: 10,
      samples: 2,
    });
    expect(summary.evidenceDeduplication).to.deep.equal({
      eligibleSimulationRecords: 3,
      uniqueSimulationRecords: 2,
      duplicateSimulationRecords: 1,
      duplicateStandaloneEdgeSamples: 1,
    });
    expect(summary.diagnostics.duplicateSimulationEvidence).to.have.length(1);
    expect(summary.diagnostics.duplicateSimulationEvidence[0]).to.deep.include({
      kept: { sessionId: "overlap-a", line: 2 },
      duplicate: { sessionId: "overlap-b", line: 5 },
    });
  });

  it("has no secret, environment, RPC, network, or ledger-write surface", () => {
    const source = readFileSync(
      "scripts/matrix/summarizeStabilizerShadow.ts",
      "utf8"
    );

    expect(source).not.to.contain("process.env");
    expect(source).not.to.contain("dotenv");
    expect(source).not.to.contain("PRIVATE_KEY");
    expect(source).not.to.contain("ethers");
    expect(source).not.to.match(/appendFile|writeFile|fetch\(|JsonRpcProvider/);
  });
});
