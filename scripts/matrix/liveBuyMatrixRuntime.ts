import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export interface LiveBuyMatrixEvidencePaths {
  readonly runId: string;
  readonly runPath: string;
  readonly latestPointerPath: string;
}

export interface LiveBuyMatrixLatestPointer {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly evidenceFile: string;
  readonly status: string;
  readonly finishedAt: string;
}

export interface LiveBuyMatrixTerminalOutcome {
  readonly status:
    | "PASS"
    | "FAILED_STOPPED"
    | "FAILED_CLEANUP"
    | "FAILED_INCOMPLETE";
  readonly error: string | null;
}

export class ConfirmedNonceCursor {
  readonly #initialNonce: number;
  #nextNonce: number;
  #inFlight: number | null = null;

  constructor(initialNonce: number) {
    if (!Number.isSafeInteger(initialNonce) || initialNonce < 0) {
      throw new Error("initial nonce must be a non-negative safe integer");
    }
    this.#initialNonce = initialNonce;
    this.#nextNonce = initialNonce;
  }

  get initialNonce(): number {
    return this.#initialNonce;
  }

  get locked(): boolean {
    return this.#inFlight !== null;
  }

  get reservedNonce(): number | null {
    return this.#inFlight;
  }

  reserve(): number {
    if (this.#inFlight !== null) {
      throw new Error(
        `nonce ${
          this.#inFlight
        } has an uncertain outcome; refusing another transaction`
      );
    }
    this.#inFlight = this.#nextNonce;
    return this.#inFlight;
  }

  confirm(transactionNonce: number): void {
    if (this.#inFlight === null || transactionNonce !== this.#inFlight) {
      throw new Error(
        `confirmed transaction nonce ${transactionNonce} does not match reserved nonce ${String(
          this.#inFlight
        )}`
      );
    }
    this.#nextNonce = transactionNonce + 1;
    this.#inFlight = null;
  }
}

export function requireIdleNonceState(
  latestNonce: number,
  pendingNonce: number
): number {
  for (const [label, nonce] of [
    ["latest", latestNonce],
    ["pending", pendingNonce],
  ] as const) {
    if (!Number.isSafeInteger(nonce) || nonce < 0) {
      throw new Error(`${label} nonce must be a non-negative safe integer`);
    }
  }
  if (latestNonce !== pendingNonce) {
    throw new Error(
      `wallet is not nonce-idle: latest=${latestNonce}, pending=${pendingNonce}`
    );
  }
  return pendingNonce;
}

export function minimumSubmissionWaitMs(
  previousSubmittedAtMs: number | null,
  nowMs: number,
  delaySeconds: number
): number {
  if (!Number.isFinite(nowMs)) throw new Error("nowMs must be finite");
  if (!Number.isSafeInteger(delaySeconds) || delaySeconds < 0) {
    throw new Error("delaySeconds must be a non-negative safe integer");
  }
  if (previousSubmittedAtMs === null) return 0;
  if (!Number.isFinite(previousSubmittedAtMs)) {
    throw new Error("previousSubmittedAtMs must be finite or null");
  }
  return Math.max(
    0,
    Math.ceil(previousSubmittedAtMs + delaySeconds * 1_000 - nowMs)
  );
}

export function secondsBetweenSubmissions(
  previousSubmittedAtMs: number | null,
  submittedAtMs: number
): number | null {
  if (previousSubmittedAtMs === null) return null;
  if (
    !Number.isFinite(previousSubmittedAtMs) ||
    !Number.isFinite(submittedAtMs) ||
    submittedAtMs < previousSubmittedAtMs
  ) {
    throw new Error("submission timestamps must be finite and monotonic");
  }
  return (submittedAtMs - previousSubmittedAtMs) / 1_000;
}

export function createLiveBuyMatrixEvidencePaths(
  outputDir: string,
  evidenceLabel: string,
  startedAt: Date = new Date(),
  nonce: string = randomUUID()
): LiveBuyMatrixEvidencePaths {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(evidenceLabel)) {
    throw new Error("evidenceLabel must be a safe lowercase label");
  }
  if (!/^[a-zA-Z0-9-]+$/.test(nonce)) {
    throw new Error("nonce must contain only letters, digits, and hyphens");
  }
  if (!Number.isFinite(startedAt.getTime())) {
    throw new Error("startedAt must be valid");
  }
  const timestamp = startedAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(".", "-");
  const runId = `${timestamp}-${nonce}`;
  return {
    runId,
    runPath: resolve(
      outputDir,
      `v4-live-buy-tax-${evidenceLabel}-${runId}.json`
    ),
    latestPointerPath: resolve(
      outputDir,
      `v4-live-buy-tax-${evidenceLabel}-latest.json`
    ),
  };
}

export function atomicWriteJson(path: string, value: unknown): void {
  const tempPath = `${path}.${randomUUID()}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(tempPath, path);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // The temporary file may not have been created or may already be moved.
    }
    throw error;
  }
}

export function latestPointerForTerminalRun(input: {
  readonly runId: string;
  readonly runPath: string;
  readonly status: string;
  readonly finishedAt: string;
}): LiveBuyMatrixLatestPointer {
  if (input.status === "RUNNING" || input.finishedAt.trim() === "") {
    throw new Error("latest pointer requires a terminal run");
  }
  return {
    schemaVersion: 1,
    runId: input.runId,
    evidenceFile: basename(input.runPath),
    status: input.status,
    finishedAt: input.finishedAt,
  };
}

export function resolveLiveBuyMatrixTerminalOutcome(input: {
  readonly primaryError: string | null;
  readonly cleanupErrors: readonly string[];
  readonly completedTrades: number;
  readonly expectedTrades: number;
}): LiveBuyMatrixTerminalOutcome {
  if (input.primaryError !== null) {
    return { status: "FAILED_STOPPED", error: input.primaryError };
  }
  if (input.cleanupErrors.length > 0) {
    return {
      status: "FAILED_CLEANUP",
      error: input.cleanupErrors.join(" | "),
    };
  }
  if (input.completedTrades !== input.expectedTrades) {
    return {
      status: "FAILED_INCOMPLETE",
      error: `Expected ${input.expectedTrades} trades, recorded ${input.completedTrades}`,
    };
  }
  return { status: "PASS", error: null };
}
