/**
 * Railway dead-man dispatcher for the protected NARA v4 epoch maintainer.
 *
 * This process never holds the epoch keeper key and never sends an on-chain
 * transaction. When GitHub's native schedule is stale, it dispatches the same
 * bounded, concurrency-protected GitHub Actions workflow used by operators.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

export const TARGET_REPOSITORY = "NARAProtocol/nara_protocol_v4";
export const TARGET_REPOSITORY_ID = 1_262_891_792;
export const TARGET_DEFAULT_BRANCH = "main";
export const TARGET_WORKFLOW_ID = 324_678_194;
export const TARGET_WORKFLOW_PATH = ".github/workflows/v4-epoch-maintainer.yml";
export const DEFAULT_STALE_MINUTES = 12;

const GITHUB_API = "https://api.github.com";
const MIN_STALE_MINUTES = 10;
const MAX_STALE_MINUTES = 14;
const ACTIVE_RUN_STATUSES = new Set([
  "pending",
  "queued",
  "requested",
  "waiting",
  "in_progress",
]);
const RELEVANT_EVENTS = new Set(["schedule", "workflow_dispatch"]);

export type WatchdogOutcome =
  | { status: "disabled" }
  | { status: "skipped-active"; runId: number }
  | { status: "skipped-recent"; runId: number; ageMinutes: number }
  | { status: "dispatched"; previousRunId?: number; previousAgeMinutes?: number };

type WatchdogConfig = {
  enabled: boolean;
  token?: string;
  staleMinutes: number;
};

type GitHubRun = {
  id: number;
  event: string;
  status: string;
  createdAt: string;
};

export type WatchdogLogger = Pick<Console, "log">;
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type WatchdogDependencies = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  now?: Date;
  logger?: WatchdogLogger;
};

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GitHub API returned invalid ${label} metadata`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`GitHub API returned invalid ${label}`);
  }
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`GitHub API returned invalid ${label}`);
  }
  return value;
}

export function parseWatchdogConfig(env: NodeJS.ProcessEnv): WatchdogConfig {
  const enabledValue = env.V4_EPOCH_RAILWAY_DISPATCH_ENABLED?.trim();
  if (enabledValue === undefined || enabledValue === "" || enabledValue === "false") {
    return { enabled: false, staleMinutes: DEFAULT_STALE_MINUTES };
  }
  if (enabledValue !== "true") {
    throw new Error("V4_EPOCH_RAILWAY_DISPATCH_ENABLED must be exactly true or false");
  }

  const token = env.GITHUB_ACTIONS_DISPATCH_TOKEN?.trim();
  if (!token) {
    throw new Error("GITHUB_ACTIONS_DISPATCH_TOKEN is required when the watchdog is enabled");
  }

  const staleValue = env.V4_EPOCH_DISPATCH_STALE_MINUTES?.trim();
  const staleMinutes = staleValue === undefined || staleValue === ""
    ? DEFAULT_STALE_MINUTES
    : Number(staleValue);
  if (
    !Number.isInteger(staleMinutes)
    || staleMinutes < MIN_STALE_MINUTES
    || staleMinutes > MAX_STALE_MINUTES
  ) {
    throw new Error(
      `V4_EPOCH_DISPATCH_STALE_MINUTES must be an integer between ${MIN_STALE_MINUTES} and ${MAX_STALE_MINUTES}`,
    );
  }

  return { enabled: true, token, staleMinutes };
}

function requestId(response: Response): string {
  return response.headers.get("x-github-request-id") ?? "unavailable";
}

async function requestJson(
  fetchImpl: FetchLike,
  token: string,
  path: string,
  label: string,
): Promise<unknown> {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    method: "GET",
    headers: githubHeaders(token),
  });
  if (!response.ok) {
    throw new Error(
      `GitHub API ${label} request failed: status=${response.status} request_id=${requestId(response)}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`GitHub API ${label} response was not valid JSON`);
  }
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "nara-v4-epoch-dispatch-watchdog",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function parseRuns(value: unknown): GitHubRun[] {
  const metadata = requiredRecord(value, "workflow runs");
  if (!Array.isArray(metadata.workflow_runs)) {
    throw new Error("GitHub API returned invalid workflow runs list");
  }
  return metadata.workflow_runs.map((entry, index) => {
    const run = requiredRecord(entry, `workflow run ${index}`);
    return {
      id: requiredNumber(run.id, `workflow run ${index} id`),
      event: requiredString(run.event, `workflow run ${index} event`),
      status: requiredString(run.status, `workflow run ${index} status`),
      createdAt: requiredString(run.created_at, `workflow run ${index} created_at`),
    };
  });
}

function runTime(run: GitHubRun): number {
  const timestamp = Date.parse(run.createdAt);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`GitHub API returned invalid created_at for workflow run ${run.id}`);
  }
  return timestamp;
}

function ageMinutes(now: Date, run: GitHubRun): number {
  const age = (now.getTime() - runTime(run)) / 60_000;
  if (age < 0) {
    throw new Error(`GitHub workflow run ${run.id} has a future created_at timestamp`);
  }
  return age;
}

function assertRepository(value: unknown): void {
  const repository = requiredRecord(value, "repository");
  if (
    repository.full_name !== TARGET_REPOSITORY
    || repository.id !== TARGET_REPOSITORY_ID
    || repository.default_branch !== TARGET_DEFAULT_BRANCH
  ) {
    throw new Error("GitHub repository identity does not match the pinned epoch-maintainer target");
  }
}

function assertWorkflow(value: unknown): void {
  const workflow = requiredRecord(value, "workflow");
  if (
    workflow.id !== TARGET_WORKFLOW_ID
    || workflow.path !== TARGET_WORKFLOW_PATH
    || workflow.state !== "active"
  ) {
    throw new Error("GitHub workflow identity or state does not match the pinned epoch maintainer");
  }
}

async function dispatchWorkflow(fetchImpl: FetchLike, token: string): Promise<void> {
  const response = await fetchImpl(
    `${GITHUB_API}/repos/${TARGET_REPOSITORY}/actions/workflows/${TARGET_WORKFLOW_ID}/dispatches`,
    {
      method: "POST",
      headers: {
        ...githubHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: TARGET_DEFAULT_BRANCH,
        inputs: { execute: "true" },
      }),
    },
  );
  if (response.status !== 204) {
    throw new Error(
      `GitHub workflow dispatch failed: status=${response.status} request_id=${requestId(response)}`,
    );
  }
}

export async function runEpochDispatchWatchdog(
  dependencies: WatchdogDependencies = {},
): Promise<WatchdogOutcome> {
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const now = dependencies.now ?? new Date();
  const logger = dependencies.logger ?? console;
  const config = parseWatchdogConfig(env);

  if (!config.enabled) {
    logger.log("Epoch dispatch watchdog: disabled");
    return { status: "disabled" };
  }
  const token = config.token!;

  const repository = await requestJson(
    fetchImpl,
    token,
    `/repos/${TARGET_REPOSITORY}`,
    "repository",
  );
  assertRepository(repository);

  const workflow = await requestJson(
    fetchImpl,
    token,
    `/repos/${TARGET_REPOSITORY}/actions/workflows/${TARGET_WORKFLOW_ID}`,
    "workflow",
  );
  assertWorkflow(workflow);

  const runsResponse = await requestJson(
    fetchImpl,
    token,
    `/repos/${TARGET_REPOSITORY}/actions/workflows/${TARGET_WORKFLOW_ID}/runs?branch=${TARGET_DEFAULT_BRANCH}&per_page=20`,
    "workflow runs",
  );
  const runs = parseRuns(runsResponse);

  const activeRun = runs
    .filter((run) => ACTIVE_RUN_STATUSES.has(run.status))
    .sort((left, right) => runTime(right) - runTime(left))[0];
  if (activeRun) {
    logger.log(`Epoch dispatch watchdog: active run ${activeRun.id}; dispatch skipped`);
    return { status: "skipped-active", runId: activeRun.id };
  }

  const latestRelevantRun = runs
    .filter((run) => RELEVANT_EVENTS.has(run.event))
    .sort((left, right) => runTime(right) - runTime(left))[0];
  const previousAgeMinutes = latestRelevantRun
    ? ageMinutes(now, latestRelevantRun)
    : undefined;
  if (latestRelevantRun && previousAgeMinutes! <= config.staleMinutes) {
    const roundedAge = Math.floor(previousAgeMinutes! * 10) / 10;
    logger.log(
      `Epoch dispatch watchdog: recent ${latestRelevantRun.event} run ${latestRelevantRun.id} age_minutes=${roundedAge}; dispatch skipped`,
    );
    return {
      status: "skipped-recent",
      runId: latestRelevantRun.id,
      ageMinutes: previousAgeMinutes!,
    };
  }

  await dispatchWorkflow(fetchImpl, token);
  logger.log(
    latestRelevantRun
      ? `Epoch dispatch watchdog: stale run ${latestRelevantRun.id}; protected workflow dispatched`
      : "Epoch dispatch watchdog: no prior scheduled/manual run; protected workflow dispatched",
  );
  return {
    status: "dispatched",
    previousRunId: latestRelevantRun?.id,
    previousAgeMinutes,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  runEpochDispatchWatchdog().catch((error) => {
    console.error(error instanceof Error ? error.message : "Epoch dispatch watchdog failed");
    process.exitCode = 1;
  });
}
