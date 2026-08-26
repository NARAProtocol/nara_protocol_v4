/**
 * Read-only historical persistence analysis for completed Phase 1 stabilizer
 * shadow sessions. The analyzer never substitutes current pool state for a
 * missing historical block.
 */
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STABILIZER_PERSISTENCE_OFFSETS,
  calculatePersistence,
  type PersistenceResult,
} from "./stabilizerPersistence.js";
import {
  DEFAULT_STABILIZER_SHADOW_LEDGER,
  groupCanonicalStabilizerShadowEntries,
  parseCanonicalStabilizerShadowJsonl,
  summarizeStabilizerShadowText,
  type StabilizerShadowDiagnostic,
} from "./summarizeStabilizerShadow.js";
import {
  midUsdcPerNaraFromSqrtPriceX96,
  POOL_STATE_READER_ABI,
  productionV4ReadOnlyConfig,
  readPoolStateAt,
  verifyProductionV4ReadOnlyRuntime,
} from "./v4ReadOnlyPool.js";

export { midUsdcPerNaraFromSqrtPriceX96 } from "./v4ReadOnlyPool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_CHAIN_ID = 8453n;

type SimulationKind = "pumpDefenseSimulated" | "floorDefenseSimulated";
type ObservationRole = "reference" | "trigger" | "future";
type ObservationStatus = "available" | "unavailable" | "not_indexed";

export type HistoricalMidReader = (blockNumber: number) => Promise<number>;

export interface PersistenceAnalyzerOptions {
  sessionId?: string;
  indexedThroughBlock?: number;
}

export interface PersistenceReadDiagnostic {
  line: number;
  sessionId: string;
  blockNumber: number;
  role: ObservationRole;
  offsetBlocks: number | null;
  reason:
    | "block_not_indexed"
    | "historical_block_unavailable"
    | "pool_state_read_failed"
    | "invalid_mid_price";
}

export interface PersistenceSelectionDiagnostic {
  sessionId: string | null;
  line: number | null;
  reason:
    | "requested_session_not_found"
    | "session_incomplete"
    | "completed_session_ineligible"
    | "invalid_simulation_block_fields";
  issues?: string[];
  exclusionReasons?: string[];
}

export interface PersistenceObservation {
  blockNumber: number;
  role: ObservationRole;
  offsetBlocks: number | null;
  status: ObservationStatus;
  midUsdcPerNara: number | null;
  reason: PersistenceReadDiagnostic["reason"] | null;
}

export interface StabilizerPersistenceEventAnalysis {
  line: number;
  sessionId: string;
  kind: SimulationKind;
  side: "pump" | "floor";
  triggerTx: string | null;
  referenceBlock: number;
  triggerBlock: number;
  status: "complete" | "partial" | "unavailable";
  observations: PersistenceObservation[];
  persistence: PersistenceResult | null;
}

export interface StabilizerPersistenceAnalysis {
  schemaVersion: 1;
  canonicalSchemaVersion: 1;
  requestedSessionId: string | null;
  offsets: number[];
  ledger: {
    lines: ReturnType<typeof parseCanonicalStabilizerShadowJsonl>["lines"];
    diagnostics: {
      malformedJson: StabilizerShadowDiagnostic[];
      invalidCanonical: StabilizerShadowDiagnostic[];
      ignoredNonCanonical: StabilizerShadowDiagnostic[];
    };
  };
  sessions: {
    canonical: number;
    completed: number;
    eligible: number;
    selected: number;
    selectedIds: string[];
  };
  events: StabilizerPersistenceEventAnalysis[];
  blockReads: {
    indexedThroughBlock: number | null;
    uniqueRequested: number;
    available: number;
    unavailable: number;
    notIndexed: number;
  };
  diagnostics: {
    selection: PersistenceSelectionDiagnostic[];
    reads: PersistenceReadDiagnostic[];
  };
}

interface CachedMidRead {
  status: ObservationStatus;
  midUsdcPerNara: number | null;
  reason: PersistenceReadDiagnostic["reason"] | null;
}

function safeBlockNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function knownHistoricalBlockFailure(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /block (?:not found|unavailable)|header not found|unknown block|missing trie node|historical state/i.test(
    text
  );
}

function simulationKind(value: unknown): SimulationKind | null {
  return value === "pumpDefenseSimulated" || value === "floorDefenseSimulated"
    ? value
    : null;
}

/**
 * Converts Uniswap v4 slot0 sqrtPriceX96 into human USDC per NARA. The active
 * pool uses 18-decimal NARA and 6-decimal USDC.
 */
export async function analyzeStabilizerPersistenceText(
  jsonl: string,
  readMid: HistoricalMidReader,
  options: PersistenceAnalyzerOptions = {}
): Promise<StabilizerPersistenceAnalysis> {
  const parsed = parseCanonicalStabilizerShadowJsonl(jsonl);
  const grouped = groupCanonicalStabilizerShadowEntries(parsed.entries);
  const summary = summarizeStabilizerShadowText(jsonl);
  const requestedSessionId = options.sessionId?.trim() || null;
  const indexedThroughBlock =
    options.indexedThroughBlock === undefined
      ? null
      : safeBlockNumber(options.indexedThroughBlock);
  if (
    options.indexedThroughBlock !== undefined &&
    indexedThroughBlock === null
  ) {
    throw new Error("indexedThroughBlock must be a non-negative safe integer");
  }

  const selectionDiagnostics: PersistenceSelectionDiagnostic[] = [];
  const readDiagnostics: PersistenceReadDiagnostic[] = [];
  const completedSessions = summary.sessions.filter(
    (session) => session.complete
  );
  const eligibleSessions = summary.sessions.filter(
    (session) => session.releaseEvidenceEligibility.eligible
  );
  const candidateSessions = requestedSessionId
    ? summary.sessions.filter(
        (session) => session.sessionId === requestedSessionId
      )
    : summary.sessions;

  if (requestedSessionId && candidateSessions.length === 0) {
    selectionDiagnostics.push({
      sessionId: requestedSessionId,
      line: null,
      reason: "requested_session_not_found",
    });
  }

  const selectedSessions = candidateSessions.filter((session) => {
    if (!session.releaseEvidenceEligibility.eligible) {
      const completedButIneligible = session.complete;
      selectionDiagnostics.push({
        sessionId: session.sessionId,
        line: session.firstLine,
        reason: completedButIneligible
          ? "completed_session_ineligible"
          : "session_incomplete",
        issues: session.issues,
        exclusionReasons: session.releaseEvidenceEligibility.exclusionReasons,
      });
      return false;
    }
    return true;
  });
  const selectedIds = new Set(
    selectedSessions.map((session) => session.sessionId)
  );

  const blockCache = new Map<number, Promise<CachedMidRead>>();
  const readBlock = (blockNumber: number): Promise<CachedMidRead> => {
    const cached = blockCache.get(blockNumber);
    if (cached) return cached;

    const pending = (async (): Promise<CachedMidRead> => {
      if (indexedThroughBlock !== null && blockNumber > indexedThroughBlock) {
        return {
          status: "not_indexed",
          midUsdcPerNara: null,
          reason: "block_not_indexed",
        };
      }
      try {
        const midUsdcPerNara = await readMid(blockNumber);
        if (!Number.isFinite(midUsdcPerNara) || midUsdcPerNara <= 0) {
          return {
            status: "unavailable",
            midUsdcPerNara: null,
            reason: "invalid_mid_price",
          };
        }
        return {
          status: "available",
          midUsdcPerNara,
          reason: null,
        };
      } catch (error) {
        return {
          status: "unavailable",
          midUsdcPerNara: null,
          reason: knownHistoricalBlockFailure(error)
            ? "historical_block_unavailable"
            : "pool_state_read_failed",
        };
      }
    })();
    blockCache.set(blockNumber, pending);
    return pending;
  };

  const events: StabilizerPersistenceEventAnalysis[] = [];
  for (const session of selectedSessions) {
    const entries = grouped.get(session.sessionId) ?? [];
    for (const entry of entries) {
      const kind = simulationKind(entry.value.kind);
      if (!kind) continue;

      const referenceBlock = safeBlockNumber(entry.value.referenceBlock);
      const triggerBlock = safeBlockNumber(entry.value.triggerBlock);
      if (
        referenceBlock === null ||
        triggerBlock === null ||
        referenceBlock >= triggerBlock ||
        STABILIZER_PERSISTENCE_OFFSETS.some(
          (offset) => !Number.isSafeInteger(triggerBlock + offset)
        )
      ) {
        selectionDiagnostics.push({
          sessionId: session.sessionId,
          line: entry.line,
          reason: "invalid_simulation_block_fields",
        });
        continue;
      }

      const requestedObservations = [
        {
          blockNumber: referenceBlock,
          role: "reference" as const,
          offsetBlocks: null,
        },
        {
          blockNumber: triggerBlock,
          role: "trigger" as const,
          offsetBlocks: 0,
        },
        ...STABILIZER_PERSISTENCE_OFFSETS.map((offsetBlocks) => ({
          blockNumber: triggerBlock + offsetBlocks,
          role: "future" as const,
          offsetBlocks,
        })),
      ];
      const observations = await Promise.all(
        requestedObservations.map(
          async ({ blockNumber, role, offsetBlocks }) => {
            const read = await readBlock(blockNumber);
            return {
              blockNumber,
              role,
              offsetBlocks,
              status: read.status,
              midUsdcPerNara: read.midUsdcPerNara,
              reason: read.reason,
            } satisfies PersistenceObservation;
          }
        )
      );
      for (const observation of observations) {
        if (!observation.reason) continue;
        readDiagnostics.push({
          line: entry.line,
          sessionId: session.sessionId,
          blockNumber: observation.blockNumber,
          role: observation.role,
          offsetBlocks: observation.offsetBlocks,
          reason: observation.reason,
        });
      }

      const reference = observations[0];
      const trigger = observations[1];
      const persistence =
        reference.midUsdcPerNara !== null && trigger.midUsdcPerNara !== null
          ? calculatePersistence(
              reference.midUsdcPerNara,
              trigger.midUsdcPerNara,
              observations
                .slice(2)
                .filter(
                  (
                    observation
                  ): observation is PersistenceObservation & {
                    midUsdcPerNara: number;
                    offsetBlocks: number;
                  } =>
                    observation.midUsdcPerNara !== null &&
                    observation.offsetBlocks !== null
                )
                .map((observation) => ({
                  offsetBlocks: observation.offsetBlocks,
                  midUsdcPerNara: observation.midUsdcPerNara,
                }))
            )
          : null;
      const availableCount = observations.filter(
        (observation) => observation.status === "available"
      ).length;

      events.push({
        line: entry.line,
        sessionId: session.sessionId,
        kind,
        side: kind === "pumpDefenseSimulated" ? "pump" : "floor",
        triggerTx:
          typeof entry.value.triggerTx === "string"
            ? entry.value.triggerTx
            : null,
        referenceBlock,
        triggerBlock,
        status:
          persistence === null
            ? "unavailable"
            : availableCount === observations.length
            ? "complete"
            : "partial",
        observations,
        persistence,
      });
    }
  }

  const cachedReads = await Promise.all(blockCache.values());
  return {
    schemaVersion: 1,
    canonicalSchemaVersion: 1,
    requestedSessionId,
    offsets: [...STABILIZER_PERSISTENCE_OFFSETS],
    ledger: {
      lines: parsed.lines,
      diagnostics: parsed.diagnostics,
    },
    sessions: {
      canonical: summary.sessionCounts.total,
      completed: completedSessions.length,
      eligible: eligibleSessions.length,
      selected: selectedIds.size,
      selectedIds: Array.from(selectedIds),
    },
    events,
    blockReads: {
      indexedThroughBlock,
      uniqueRequested: blockCache.size,
      available: cachedReads.filter((read) => read.status === "available")
        .length,
      unavailable: cachedReads.filter((read) => read.status === "unavailable")
        .length,
      notIndexed: cachedReads.filter((read) => read.status === "not_indexed")
        .length,
    },
    diagnostics: {
      selection: selectionDiagnostics,
      reads: readDiagnostics,
    },
  };
}

export async function analyzeStabilizerPersistenceFile(
  ledgerPath: string,
  readMid: HistoricalMidReader,
  options: PersistenceAnalyzerOptions = {}
): Promise<StabilizerPersistenceAnalysis> {
  return analyzeStabilizerPersistenceText(
    readFileSync(resolve(ledgerPath), "utf8"),
    readMid,
    options
  );
}

function parseCliArgs(args: string[]): {
  ledgerPath: string;
  sessionId?: string;
} {
  if (args.length > 2) {
    throw new Error(
      "Usage: tsx scripts/matrix/analyzeStabilizerPersistence.ts [ledger.jsonl] [session-id]"
    );
  }
  return {
    ledgerPath: args[0] ? resolve(args[0]) : DEFAULT_STABILIZER_SHADOW_LEDGER,
    sessionId: args[1],
  };
}

async function runCli(): Promise<void> {
  const { ledgerPath, sessionId } = parseCliArgs(process.argv.slice(2));

  const rpcUrls = [
    process.env.V4_STABILIZER_RPC_URL,
    process.env.BASE_MAINNET_RPC_URL,
    process.env.BASE_RPC_URL,
  ]
    .map((value) => value?.trim() ?? "")
    .filter(
      (value, index, values) => value !== "" && values.indexOf(value) === index
    );
  if (rpcUrls.length === 0) {
    throw new Error("Missing Base read-only RPC configuration");
  }

  const config = productionV4ReadOnlyConfig();
  const providers = rpcUrls.map(
    (rpcUrl) =>
      new ethers.JsonRpcProvider(rpcUrl, Number(BASE_CHAIN_ID), {
        staticNetwork: true,
      })
  );
  try {
    for (const provider of providers) {
      const network = await provider.getNetwork();
      if (network.chainId !== BASE_CHAIN_ID) {
        throw new Error(
          `Base chain mismatch: expected ${BASE_CHAIN_ID}, received ${network.chainId}`
        );
      }
      await verifyProductionV4ReadOnlyRuntime(provider);
    }
    const indexedThroughBlock = Math.min(
      ...(await Promise.all(
        providers.map((provider) => provider.getBlockNumber())
      ))
    );
    const poolManagers = providers.map(
      (provider) =>
        new ethers.Contract(config.poolManager, POOL_STATE_READER_ABI, provider)
    );
    const report = await analyzeStabilizerPersistenceFile(
      ledgerPath,
      async (blockNumber) => {
        let lastError: unknown;
        for (const poolManager of poolManagers) {
          try {
            const state = await readPoolStateAt(
              poolManager,
              config.poolId,
              blockNumber
            );
            return midUsdcPerNaraFromSqrtPriceX96(
              state.sqrtPriceX96,
              config.canonicalPoolKey.tokenIsCurrency0
            );
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError;
      },
      { sessionId, indexedThroughBlock }
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    for (const provider of providers) provider.destroy();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  runCli().catch((error) => {
    const reason = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(
      `${JSON.stringify({ schemaVersion: 1, status: "error", reason })}\n`
    );
    process.exitCode = 1;
  });
}
