/**
 * Read-only summarizer for the Phase 1 stabilizer shadow JSONL ledger.
 *
 * Release-evidence records are schemaVersion 2 objects with a non-empty
 * sessionId. Schema v1 remains parsed and visible as explicitly ineligible
 * legacy evidence; unversioned/unsupported records are ignored and reported.
 * This module reads only the requested ledger file, performs no writes, and
 * has no RPC or environment dependencies.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;
type SupportedSchemaVersion = 1 | 2;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_STABILIZER_SHADOW_LEDGER = resolve(
  __dirname,
  "..",
  "..",
  "deployments",
  "stabilizer-shadow.jsonl"
);

type SimulationSide = "pump" | "floor";

export interface StabilizerShadowDiagnostic {
  line: number;
  reason: string;
}

export interface CanonicalStabilizerShadowEntry {
  line: number;
  sessionId: string;
  schemaVersion: SupportedSchemaVersion;
  value: Record<string, unknown>;
}

export interface ParsedCanonicalStabilizerShadowJsonl {
  lines: {
    total: number;
    blank: number;
    canonical: number;
    canonicalV2: number;
    legacySchema1: number;
    ignoredNonCanonical: number;
    malformedJson: number;
    invalidCanonical: number;
  };
  entries: CanonicalStabilizerShadowEntry[];
  diagnostics: {
    malformedJson: StabilizerShadowDiagnostic[];
    invalidCanonical: StabilizerShadowDiagnostic[];
    ignoredNonCanonical: StabilizerShadowDiagnostic[];
    legacySchema1: StabilizerShadowDiagnostic[];
  };
}

interface EdgeAccumulator {
  total: number;
  go: number;
  noGo: number;
  pump: number;
  floor: number;
  samples: number;
  invalidSamples: number;
}

export interface StabilizerShadowSessionSummary {
  sessionId: string;
  schemaVersion: SupportedSchemaVersion;
  mode: string | null;
  firstLine: number;
  lastLine: number;
  startedAt: string | null;
  endedAt: string | null;
  complete: boolean;
  malformed: boolean;
  releaseEvidenceEligibility: {
    eligible: boolean;
    exclusionReasons: string[];
  };
  issues: string[];
  counts: {
    pumps: number;
    dumps: number;
    simulations: number;
    pumpSimulations: number;
    floorSimulations: number;
    skips: number;
    triggerSkips: number;
    pumpSimulationSkips: number;
    floorSimulationSkips: number;
  };
  verdicts: {
    GO: number;
    NO_GO: number;
    unknown: number;
  };
  standaloneEdgeUsdc: EdgeAccumulator;
  reported: {
    pumpsSeen: number | null;
    dumpsSeen: number | null;
    simulationsRun: number | null;
    lastBlock: number | null;
  };
  evidenceBinding: {
    chainId: number | null;
    poolId: string | null;
    configFingerprint: string | null;
  };
  simulationEvidence: StabilizerShadowSimulationEvidence[];
}

export interface StabilizerShadowSimulationEvidence {
  line: number;
  sessionId: string;
  side: SimulationSide;
  identity: string;
  triggerBlockHash: string;
  observationIds: string[];
  verdict: "GO" | "NO_GO" | "unknown";
  edgeUsdc: number | null;
}

export interface DuplicateSimulationEvidenceDiagnostic {
  identity: string;
  kept: { sessionId: string; line: number };
  duplicate: { sessionId: string; line: number };
}

export interface StabilizerShadowAggregateTotals {
  pumps: number;
  dumps: number;
  simulations: number;
  skips: number;
  verdicts: {
    GO: number;
    NO_GO: number;
    unknown: number;
  };
  standaloneEdgeUsdc: EdgeAccumulator;
}

export interface StabilizerShadowSummary {
  schemaVersion: 2;
  canonicalSchemaVersion: 2;
  lines: {
    total: number;
    blank: number;
    canonical: number;
    canonicalV2: number;
    legacySchema1: number;
    ignoredNonCanonical: number;
    malformedJson: number;
    invalidCanonical: number;
  };
  sessions: StabilizerShadowSessionSummary[];
  sessionCounts: {
    total: number;
    complete: number;
    incomplete: number;
    malformed: number;
    eligible: number;
    legacySchema1: number;
  };
  /** Deduplicated release totals from complete, valid, gap-free v2 sessions. */
  totals: StabilizerShadowAggregateTotals;
  /** Diagnostic totals across every canonical session, including exclusions. */
  diagnosticAllSessionTotals: StabilizerShadowAggregateTotals;
  evidenceDeduplication: {
    eligibleSimulationRecords: number;
    uniqueSimulationRecords: number;
    duplicateSimulationRecords: number;
    duplicateStandaloneEdgeSamples: number;
  };
  diagnostics: {
    malformedJson: StabilizerShadowDiagnostic[];
    invalidCanonical: StabilizerShadowDiagnostic[];
    ignoredNonCanonical: StabilizerShadowDiagnostic[];
    legacySchema1: StabilizerShadowDiagnostic[];
    duplicateSimulationEvidence: DuplicateSimulationEvidenceDiagnostic[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function finiteDecimal(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedBytes32(value: unknown): string | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
    ? value.toLowerCase()
    : null;
}

function positiveChainId(value: unknown): number | null {
  const parsed = nonNegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function normalizedObservationIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const normalized: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !/^0x[0-9a-fA-F]{64}:\d+$/.test(item.trim())
    )
      return null;
    normalized.push(item.trim().toLowerCase());
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return normalized.sort();
}

function fallbackObservationIds(
  record: Record<string, unknown>
): string[] | null {
  const transactionHash = [
    record.transactionHash,
    record.triggerTx,
    record.txHash,
  ].find(
    (value): value is string =>
      typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
  );
  const logIndex = nonNegativeInteger(record.logIndex);
  return transactionHash && logIndex !== null
    ? [`${transactionHash.toLowerCase()}:${logIndex}`]
    : null;
}

function roundedUsdc(value: number): number {
  return Number(value.toFixed(6));
}

function emptyEdgeAccumulator(): EdgeAccumulator {
  return {
    total: 0,
    go: 0,
    noGo: 0,
    pump: 0,
    floor: 0,
    samples: 0,
    invalidSamples: 0,
  };
}

function addIssue(issues: string[], issue: string): void {
  if (!issues.includes(issue)) issues.push(issue);
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Date.parse(value))
  );
}

function readReportedCounter(
  value: unknown,
  field: string,
  issues: string[]
): number | null {
  const parsed = nonNegativeInteger(value);
  if (parsed === null) addIssue(issues, `invalid_session_summary_${field}`);
  return parsed;
}

function summarizeSession(
  sessionId: string,
  records: CanonicalStabilizerShadowEntry[]
): StabilizerShadowSessionSummary {
  const issues: string[] = [];
  const schemaVersions = new Set(records.map((record) => record.schemaVersion));
  const schemaVersion = records[0].schemaVersion;
  if (schemaVersions.size > 1) addIssue(issues, "mixed_schema_versions");
  if (schemaVersion === LEGACY_SCHEMA_VERSION)
    addIssue(issues, "legacy_schema_v1");
  const firstLine = records[0].line;
  const lastLine = records[records.length - 1].line;
  let startCount = 0;
  let summaryCount = 0;
  let firstStartIndex = -1;
  let firstSummaryIndex = -1;
  let mode: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let pumpSimulations = 0;
  let floorSimulations = 0;
  let triggerSkips = 0;
  let pumpSimulationSkips = 0;
  let floorSimulationSkips = 0;
  let reportedPumps: number | null = null;
  let reportedDumps: number | null = null;
  let reportedSimulations: number | null = null;
  let reportedLastBlock: number | null = null;
  let chainId: number | null = null;
  let poolId: string | null = null;
  let configFingerprint: string | null = null;
  const verdicts = { GO: 0, NO_GO: 0, unknown: 0 };
  const edge = emptyEdgeAccumulator();
  const simulationEvidence: StabilizerShadowSimulationEvidence[] = [];

  const recordSimulation = (
    record: Record<string, unknown>,
    side: SimulationSide,
    line: number
  ): void => {
    if (side === "pump") pumpSimulations++;
    else floorSimulations++;

    const verdict = record.verdict;
    if (verdict === "GO" || verdict === "NO_GO") verdicts[verdict]++;
    else {
      verdicts.unknown++;
      addIssue(issues, `invalid_${side}_simulation_verdict`);
    }

    const edgeValue = finiteDecimal(
      side === "pump" ? record.edgeUsdc : record.profitIfRecoveryUsdc
    );
    if (edgeValue === null) {
      edge.invalidSamples++;
      addIssue(issues, `invalid_${side}_standalone_edge`);
    } else {
      edge.samples++;
      edge.total += edgeValue;
      edge[side] += edgeValue;
      if (verdict === "GO") edge.go += edgeValue;
      else if (verdict === "NO_GO") edge.noGo += edgeValue;
    }

    if (schemaVersion !== CANONICAL_SCHEMA_VERSION) return;
    const triggerBlockHash = normalizedBytes32(record.triggerBlockHash);
    const observationIds =
      normalizedObservationIds(record.observationIds) ??
      fallbackObservationIds(record);
    if (
      chainId === null ||
      poolId === null ||
      configFingerprint === null ||
      triggerBlockHash === null ||
      observationIds === null
    ) {
      addIssue(issues, `invalid_${side}_simulation_evidence_identity`);
      return;
    }
    simulationEvidence.push({
      line,
      sessionId,
      side,
      identity: [
        chainId,
        poolId,
        configFingerprint,
        triggerBlockHash,
        observationIds.join(","),
      ].join("|"),
      triggerBlockHash,
      observationIds,
      verdict: verdict === "GO" || verdict === "NO_GO" ? verdict : "unknown",
      edgeUsdc: edgeValue,
    });
  };

  for (let index = 0; index < records.length; index++) {
    const { value } = records[index];
    const kind = value.kind;
    if (typeof kind !== "string" || kind.trim() === "") {
      addIssue(issues, "missing_or_invalid_kind");
      continue;
    }
    if (!validTimestamp(value.ts))
      addIssue(issues, "missing_or_invalid_timestamp");

    if (kind === "sessionStarted") {
      startCount++;
      if (firstStartIndex === -1) {
        firstStartIndex = index;
        startedAt = validTimestamp(value.ts) ? value.ts : null;
        mode = typeof value.mode === "string" ? value.mode : null;
        if (schemaVersion === CANONICAL_SCHEMA_VERSION) {
          chainId = positiveChainId(value.chainId);
          poolId = normalizedBytes32(value.poolId);
          configFingerprint = normalizedBytes32(value.configFingerprint);
          if (chainId === null) addIssue(issues, "invalid_session_chain_id");
          if (poolId === null) addIssue(issues, "invalid_session_pool_id");
          if (configFingerprint === null)
            addIssue(issues, "invalid_session_config_fingerprint");
        }
      }
    } else if (kind === "sessionSummary") {
      summaryCount++;
      if (firstSummaryIndex === -1) {
        firstSummaryIndex = index;
        endedAt = validTimestamp(value.ts) ? value.ts : null;
        reportedPumps = readReportedCounter(
          value.pumpsSeen,
          "pumpsSeen",
          issues
        );
        reportedDumps = readReportedCounter(
          value.dumpsSeen,
          "dumpsSeen",
          issues
        );
        reportedSimulations = readReportedCounter(
          value.simulationsRun,
          "simulationsRun",
          issues
        );
        reportedLastBlock = nonNegativeInteger(value.lastBlock);
        if (reportedLastBlock === null)
          addIssue(issues, "invalid_session_summary_lastBlock");
      }
    } else if (kind === "pumpDefenseSimulated") {
      recordSimulation(value, "pump", records[index].line);
    } else if (kind === "floorDefenseSimulated") {
      recordSimulation(value, "floor", records[index].line);
    } else if (kind === "triggerSkipped") {
      triggerSkips++;
      if (value.side !== "pump" && value.side !== "floor")
        addIssue(issues, "invalid_trigger_skip_side");
    } else if (kind === "pumpSimSkipped") {
      pumpSimulationSkips++;
    } else if (kind === "floorSimSkipped") {
      floorSimulationSkips++;
    } else if (kind === "watcherError") {
      addIssue(issues, "watcher_error");
    } else if (kind === "scanGap") {
      addIssue(issues, "scan_gap");
    }
  }

  if (startCount === 0) addIssue(issues, "missing_session_start");
  if (summaryCount === 0) addIssue(issues, "missing_session_summary");
  if (startCount > 1) addIssue(issues, "duplicate_session_start");
  if (summaryCount > 1) addIssue(issues, "duplicate_session_summary");
  if (firstStartIndex > 0) addIssue(issues, "records_before_session_start");
  if (firstSummaryIndex !== -1 && firstSummaryIndex < records.length - 1)
    addIssue(issues, "records_after_session_summary");
  if (
    firstStartIndex !== -1 &&
    firstSummaryIndex !== -1 &&
    firstSummaryIndex < firstStartIndex
  )
    addIssue(issues, "session_summary_before_start");

  const observedSimulations = pumpSimulations + floorSimulations;
  const derivedPumps = pumpSimulations + pumpSimulationSkips;
  const derivedDumps = floorSimulations + floorSimulationSkips;
  if (
    reportedSimulations !== null &&
    reportedSimulations !== observedSimulations
  )
    addIssue(issues, "reported_simulation_count_mismatch");
  if (reportedPumps !== null && reportedPumps !== derivedPumps)
    addIssue(issues, "reported_pump_count_mismatch");
  if (reportedDumps !== null && reportedDumps !== derivedDumps)
    addIssue(issues, "reported_dump_count_mismatch");

  edge.total = roundedUsdc(edge.total);
  edge.go = roundedUsdc(edge.go);
  edge.noGo = roundedUsdc(edge.noGo);
  edge.pump = roundedUsdc(edge.pump);
  edge.floor = roundedUsdc(edge.floor);

  const complete = startCount === 1 && summaryCount === 1;
  const nonMalformedIssues = new Set([
    "missing_session_start",
    "missing_session_summary",
    "legacy_schema_v1",
    "watcher_error",
    "scan_gap",
  ]);
  const malformed = issues.some((issue) => !nonMalformedIssues.has(issue));
  const exclusionReasons: string[] = [];
  if (!complete) exclusionReasons.push("incomplete_session");
  if (malformed) exclusionReasons.push("malformed_session");
  if (schemaVersion === LEGACY_SCHEMA_VERSION)
    exclusionReasons.push("legacy_schema_v1");
  if (issues.includes("watcher_error")) exclusionReasons.push("watcher_error");
  if (issues.includes("scan_gap")) exclusionReasons.push("scan_gap");

  return {
    sessionId,
    schemaVersion,
    mode,
    firstLine,
    lastLine,
    startedAt,
    endedAt,
    complete,
    malformed,
    releaseEvidenceEligibility: {
      eligible:
        schemaVersion === CANONICAL_SCHEMA_VERSION &&
        complete &&
        !malformed &&
        !issues.includes("watcher_error") &&
        !issues.includes("scan_gap"),
      exclusionReasons,
    },
    issues,
    counts: {
      pumps:
        reportedPumps !== null && reportedPumps === derivedPumps
          ? reportedPumps
          : derivedPumps,
      dumps:
        reportedDumps !== null && reportedDumps === derivedDumps
          ? reportedDumps
          : derivedDumps,
      simulations: observedSimulations,
      pumpSimulations,
      floorSimulations,
      skips: triggerSkips + pumpSimulationSkips + floorSimulationSkips,
      triggerSkips,
      pumpSimulationSkips,
      floorSimulationSkips,
    },
    verdicts,
    standaloneEdgeUsdc: edge,
    reported: {
      pumpsSeen: reportedPumps,
      dumpsSeen: reportedDumps,
      simulationsRun: reportedSimulations,
      lastBlock: reportedLastBlock,
    },
    evidenceBinding: { chainId, poolId, configFingerprint },
    simulationEvidence,
  };
}

export function parseCanonicalStabilizerShadowJsonl(
  jsonl: string
): ParsedCanonicalStabilizerShadowJsonl {
  const rawLines = jsonl.split(/\r?\n/);
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "")
    rawLines.pop();

  let blank = 0;
  let canonical = 0;
  let canonicalV2 = 0;
  let legacySchema1 = 0;
  let ignoredNonCanonical = 0;
  let malformedJson = 0;
  let invalidCanonical = 0;
  const malformedJsonDiagnostics: StabilizerShadowDiagnostic[] = [];
  const invalidCanonicalDiagnostics: StabilizerShadowDiagnostic[] = [];
  const ignoredNonCanonicalDiagnostics: StabilizerShadowDiagnostic[] = [];
  const legacySchema1Diagnostics: StabilizerShadowDiagnostic[] = [];
  const entries: CanonicalStabilizerShadowEntry[] = [];

  rawLines.forEach((rawLine, index) => {
    const line = index + 1;
    if (rawLine.trim() === "") {
      blank++;
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine) as unknown;
    } catch {
      malformedJson++;
      malformedJsonDiagnostics.push({ line, reason: "invalid_json" });
      return;
    }

    if (
      !isRecord(parsed) ||
      (parsed.schemaVersion !== CANONICAL_SCHEMA_VERSION &&
        parsed.schemaVersion !== LEGACY_SCHEMA_VERSION)
    ) {
      ignoredNonCanonical++;
      ignoredNonCanonicalDiagnostics.push({
        line,
        reason: isRecord(parsed)
          ? "unsupported_or_missing_schema_version"
          : "json_value_is_not_an_object",
      });
      return;
    }

    if (
      typeof parsed.sessionId !== "string" ||
      parsed.sessionId.trim() === ""
    ) {
      invalidCanonical++;
      invalidCanonicalDiagnostics.push({
        line,
        reason: "missing_or_invalid_session_id",
      });
      return;
    }

    canonical++;
    const schemaVersion = parsed.schemaVersion as SupportedSchemaVersion;
    if (schemaVersion === CANONICAL_SCHEMA_VERSION) canonicalV2++;
    else {
      legacySchema1++;
      legacySchema1Diagnostics.push({
        line,
        reason: "legacy_schema_v1_release_ineligible",
      });
    }
    entries.push({
      line,
      sessionId: parsed.sessionId,
      schemaVersion,
      value: parsed,
    });
  });

  return {
    lines: {
      total: rawLines.length,
      blank,
      canonical,
      canonicalV2,
      legacySchema1,
      ignoredNonCanonical,
      malformedJson,
      invalidCanonical,
    },
    entries,
    diagnostics: {
      malformedJson: malformedJsonDiagnostics,
      invalidCanonical: invalidCanonicalDiagnostics,
      ignoredNonCanonical: ignoredNonCanonicalDiagnostics,
      legacySchema1: legacySchema1Diagnostics,
    },
  };
}

export function groupCanonicalStabilizerShadowEntries(
  entries: readonly CanonicalStabilizerShadowEntry[]
): Map<string, CanonicalStabilizerShadowEntry[]> {
  const grouped = new Map<string, CanonicalStabilizerShadowEntry[]>();
  for (const entry of entries) {
    const records = grouped.get(entry.sessionId) ?? [];
    records.push(entry);
    grouped.set(entry.sessionId, records);
  }
  return grouped;
}

function aggregateSessions(
  sessions: readonly StabilizerShadowSessionSummary[]
): StabilizerShadowAggregateTotals {
  const totalEdge = emptyEdgeAccumulator();
  const totals: StabilizerShadowAggregateTotals = {
    pumps: 0,
    dumps: 0,
    simulations: 0,
    skips: 0,
    verdicts: { GO: 0, NO_GO: 0, unknown: 0 },
    standaloneEdgeUsdc: totalEdge,
  };

  for (const session of sessions) {
    totals.pumps += session.counts.pumps;
    totals.dumps += session.counts.dumps;
    totals.simulations += session.counts.simulations;
    totals.skips += session.counts.skips;
    totals.verdicts.GO += session.verdicts.GO;
    totals.verdicts.NO_GO += session.verdicts.NO_GO;
    totals.verdicts.unknown += session.verdicts.unknown;
    totalEdge.total += session.standaloneEdgeUsdc.total;
    totalEdge.go += session.standaloneEdgeUsdc.go;
    totalEdge.noGo += session.standaloneEdgeUsdc.noGo;
    totalEdge.pump += session.standaloneEdgeUsdc.pump;
    totalEdge.floor += session.standaloneEdgeUsdc.floor;
    totalEdge.samples += session.standaloneEdgeUsdc.samples;
    totalEdge.invalidSamples += session.standaloneEdgeUsdc.invalidSamples;
  }
  totalEdge.total = roundedUsdc(totalEdge.total);
  totalEdge.go = roundedUsdc(totalEdge.go);
  totalEdge.noGo = roundedUsdc(totalEdge.noGo);
  totalEdge.pump = roundedUsdc(totalEdge.pump);
  totalEdge.floor = roundedUsdc(totalEdge.floor);
  return totals;
}

function deduplicateEligibleSimulationEvidence(
  sessions: readonly StabilizerShadowSessionSummary[],
  totals: StabilizerShadowAggregateTotals
): {
  diagnostics: DuplicateSimulationEvidenceDiagnostic[];
  eligibleSimulationRecords: number;
  uniqueSimulationRecords: number;
  duplicateStandaloneEdgeSamples: number;
} {
  const firstByIdentity = new Map<string, StabilizerShadowSimulationEvidence>();
  const diagnostics: DuplicateSimulationEvidenceDiagnostic[] = [];
  let eligibleSimulationRecords = 0;
  let duplicateStandaloneEdgeSamples = 0;

  for (const session of sessions) {
    for (const evidence of session.simulationEvidence) {
      eligibleSimulationRecords++;
      const kept = firstByIdentity.get(evidence.identity);
      if (!kept) {
        firstByIdentity.set(evidence.identity, evidence);
        continue;
      }

      diagnostics.push({
        identity: evidence.identity,
        kept: { sessionId: kept.sessionId, line: kept.line },
        duplicate: { sessionId: evidence.sessionId, line: evidence.line },
      });
      totals.simulations--;
      totals[evidence.side === "pump" ? "pumps" : "dumps"]--;
      totals.verdicts[evidence.verdict]--;
      if (evidence.edgeUsdc !== null) {
        duplicateStandaloneEdgeSamples++;
        totals.standaloneEdgeUsdc.samples--;
        totals.standaloneEdgeUsdc.total -= evidence.edgeUsdc;
        totals.standaloneEdgeUsdc[evidence.side] -= evidence.edgeUsdc;
        if (evidence.verdict === "GO")
          totals.standaloneEdgeUsdc.go -= evidence.edgeUsdc;
        else if (evidence.verdict === "NO_GO")
          totals.standaloneEdgeUsdc.noGo -= evidence.edgeUsdc;
      }
    }
  }

  totals.standaloneEdgeUsdc.total = roundedUsdc(
    totals.standaloneEdgeUsdc.total
  );
  totals.standaloneEdgeUsdc.go = roundedUsdc(totals.standaloneEdgeUsdc.go);
  totals.standaloneEdgeUsdc.noGo = roundedUsdc(totals.standaloneEdgeUsdc.noGo);
  totals.standaloneEdgeUsdc.pump = roundedUsdc(totals.standaloneEdgeUsdc.pump);
  totals.standaloneEdgeUsdc.floor = roundedUsdc(
    totals.standaloneEdgeUsdc.floor
  );

  return {
    diagnostics,
    eligibleSimulationRecords,
    uniqueSimulationRecords: firstByIdentity.size,
    duplicateStandaloneEdgeSamples,
  };
}

export function summarizeStabilizerShadowText(
  jsonl: string
): StabilizerShadowSummary {
  const parsed = parseCanonicalStabilizerShadowJsonl(jsonl);
  const grouped = groupCanonicalStabilizerShadowEntries(parsed.entries);

  const sessions = Array.from(grouped, ([sessionId, records]) =>
    summarizeSession(sessionId, records)
  );
  const eligibleSessions = sessions.filter(
    (session) => session.releaseEvidenceEligibility.eligible
  );
  const totals = aggregateSessions(eligibleSessions);
  const deduplication = deduplicateEligibleSimulationEvidence(
    eligibleSessions,
    totals
  );

  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
    lines: parsed.lines,
    sessions,
    sessionCounts: {
      total: sessions.length,
      complete: sessions.filter((session) => session.complete).length,
      incomplete: sessions.filter((session) => !session.complete).length,
      malformed: sessions.filter((session) => session.malformed).length,
      eligible: eligibleSessions.length,
      legacySchema1: sessions.filter(
        (session) => session.schemaVersion === LEGACY_SCHEMA_VERSION
      ).length,
    },
    totals,
    diagnosticAllSessionTotals: aggregateSessions(sessions),
    evidenceDeduplication: {
      eligibleSimulationRecords: deduplication.eligibleSimulationRecords,
      uniqueSimulationRecords: deduplication.uniqueSimulationRecords,
      duplicateSimulationRecords: deduplication.diagnostics.length,
      duplicateStandaloneEdgeSamples:
        deduplication.duplicateStandaloneEdgeSamples,
    },
    diagnostics: {
      ...parsed.diagnostics,
      duplicateSimulationEvidence: deduplication.diagnostics,
    },
  };
}

export function summarizeStabilizerShadowFile(
  ledgerPath = DEFAULT_STABILIZER_SHADOW_LEDGER
): StabilizerShadowSummary {
  return summarizeStabilizerShadowText(
    readFileSync(resolve(ledgerPath), "utf8")
  );
}

function runCli(): void {
  const positionalArgs = process.argv.slice(2);
  if (positionalArgs.length > 1) {
    throw new Error(
      "Usage: tsx scripts/matrix/summarizeStabilizerShadow.ts [ledger.jsonl]"
    );
  }
  const ledgerPath = positionalArgs[0]
    ? resolve(positionalArgs[0])
    : DEFAULT_STABILIZER_SHADOW_LEDGER;
  const summary = summarizeStabilizerShadowFile(ledgerPath);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`stabilizer shadow summary failed: ${message}\n`);
    process.exitCode = 1;
  }
}
