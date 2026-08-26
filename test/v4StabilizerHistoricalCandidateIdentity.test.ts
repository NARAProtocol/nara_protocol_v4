import { expect } from "chai";
import {
  bindCanonicalCandidateTransactionHashes,
  selectUniqueHistoricalFloorCandidateEvidence,
} from "../scripts/matrix/stabilizerHistoricalCandidateIdentity.js";
import { summarizeStabilizerShadowText } from "../scripts/matrix/summarizeStabilizerShadow.js";

const bytes32 = (pair: string) => `0x${pair.repeat(32)}`;
const observation = (pair: string, logIndex: number) =>
  `${bytes32(pair)}:${logIndex}`;

function line(value: Record<string, unknown>): string {
  return JSON.stringify({ schemaVersion: 2, ...value });
}

function ledger(simulations: readonly Record<string, unknown>[]): string {
  return [
    line({
      sessionId: "historical-candidates",
      ts: "2026-08-27T00:00:00.000Z",
      kind: "sessionStarted",
      mode: "REPLAY_SHADOW",
      chainId: 8453,
      poolId: bytes32("11"),
      configFingerprint: bytes32("22"),
    }),
    ...simulations.map((simulation, index) =>
      line({
        sessionId: "historical-candidates",
        ts: `2026-08-27T00:00:0${index + 1}.000Z`,
        kind: "floorDefenseSimulated",
        verdict: "NO_GO",
        profitIfRecoveryUsdc: "-1",
        triggerBlockHash: bytes32("33"),
        ...simulation,
      })
    ),
    line({
      sessionId: "historical-candidates",
      ts: "2026-08-27T00:00:09.000Z",
      kind: "sessionSummary",
      pumpsSeen: 0,
      dumpsSeen: simulations.length,
      simulationsRun: simulations.length,
      lastBlock: 100,
    }),
  ].join("\n");
}

describe("v4 stabilizer historical candidate identity", () => {
  it("reuses the summarizer's lowercased, sorted, fully bound identity", () => {
    const summary = summarizeStabilizerShadowText(
      ledger([
        {
          observationIds: [observation("BB", 7), observation("AA", 2)],
        },
      ])
    );
    const selected = selectUniqueHistoricalFloorCandidateEvidence(
      summary.sessions[0].simulationEvidence
    );

    expect(summary.sessions[0].releaseEvidenceEligibility.eligible).to.equal(
      true
    );
    expect(selected).to.have.length(1);
    expect(selected[0].observationIds).to.deep.equal([
      observation("aa", 2),
      observation("bb", 7),
    ]);
    expect(selected[0].identity).to.equal(
      [
        "8453",
        bytes32("11"),
        bytes32("22"),
        bytes32("33"),
        `${observation("aa", 2)},${observation("bb", 7)}`,
      ].join("|")
    );
  });

  it("rejects duplicate canonical identities before historical quoting", () => {
    const summary = summarizeStabilizerShadowText(
      ledger([
        {
          observationIds: [observation("aa", 2), observation("bb", 7)],
        },
        {
          observationIds: [observation("BB", 7), observation("AA", 2)],
        },
      ])
    );

    expect(() =>
      selectUniqueHistoricalFloorCandidateEvidence(
        summary.sessions[0].simulationEvidence
      )
    ).to.throw("duplicate immutable candidate identity at lines 2 and 3");
  });

  it("returns the exact canonical transaction set bound by observation IDs", () => {
    const summary = summarizeStabilizerShadowText(
      ledger([
        {
          observationIds: [observation("aa", 2), observation("bb", 7)],
        },
      ])
    );
    const evidence = summary.sessions[0].simulationEvidence[0];

    expect(
      bindCanonicalCandidateTransactionHashes(evidence, [
        bytes32("BB"),
        bytes32("AA"),
      ])
    ).to.deep.equal([bytes32("aa"), bytes32("bb")]);
  });

  it("rejects duplicate raw transaction hashes before historical quoting", () => {
    const summary = summarizeStabilizerShadowText(
      ledger([
        {
          observationIds: [observation("aa", 2), observation("aa", 7)],
        },
      ])
    );
    const evidence = summary.sessions[0].simulationEvidence[0];

    expect(() =>
      bindCanonicalCandidateTransactionHashes(evidence, [
        bytes32("aa"),
        bytes32("AA"),
      ])
    ).to.throw("line 2 has a duplicate raw transaction hash");
  });

  it("rejects a raw transaction set that mismatches the immutable identity", () => {
    const summary = summarizeStabilizerShadowText(
      ledger([
        {
          observationIds: [observation("aa", 2), observation("bb", 7)],
        },
      ])
    );
    const evidence = summary.sessions[0].simulationEvidence[0];

    expect(() =>
      bindCanonicalCandidateTransactionHashes(evidence, [
        bytes32("aa"),
        bytes32("cc"),
      ])
    ).to.throw(
      "line 2 transaction hash set does not match immutable observation identity"
    );
  });
});
