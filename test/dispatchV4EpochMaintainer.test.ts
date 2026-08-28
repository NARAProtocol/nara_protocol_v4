import { expect } from "chai";
import { readFileSync } from "node:fs";
import {
  TARGET_DEFAULT_BRANCH,
  TARGET_REPOSITORY,
  TARGET_REPOSITORY_ID,
  TARGET_WORKFLOW_ID,
  TARGET_WORKFLOW_PATH,
  parseWatchdogConfig,
  runEpochDispatchWatchdog,
  type FetchLike,
} from "../scripts/dispatchV4EpochMaintainer.js";

const NOW = new Date("2026-08-28T06:12:00.000Z");
const TOKEN = "test-token-must-never-appear";

type MockRun = {
  id: number;
  event: string;
  status: string;
  created_at: string;
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "x-github-request-id": "TEST-REQUEST" },
  });
}

function standardFetch(
  runs: MockRun[],
  overrides: {
    repository?: Record<string, unknown>;
    workflow?: Record<string, unknown>;
    dispatchStatus?: number;
  } = {},
): { fetchImpl: FetchLike; requests: Array<{ url: string; init?: RequestInit }> } {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const repository = overrides.repository ?? {
    id: TARGET_REPOSITORY_ID,
    full_name: TARGET_REPOSITORY,
    default_branch: TARGET_DEFAULT_BRANCH,
  };
  const workflow = overrides.workflow ?? {
    id: TARGET_WORKFLOW_ID,
    path: TARGET_WORKFLOW_PATH,
    state: "active",
  };
  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith(`/repos/${TARGET_REPOSITORY}`)) return jsonResponse(repository);
    if (url.endsWith(`/actions/workflows/${TARGET_WORKFLOW_ID}`)) return jsonResponse(workflow);
    if (url.includes(`/actions/workflows/${TARGET_WORKFLOW_ID}/runs?`)) {
      return jsonResponse({ workflow_runs: runs });
    }
    if (url.endsWith(`/actions/workflows/${TARGET_WORKFLOW_ID}/dispatches`)) {
      return new Response(null, {
        status: overrides.dispatchStatus ?? 204,
        headers: { "x-github-request-id": "TEST-DISPATCH" },
      });
    }
    throw new Error(`Unexpected test URL ${url}`);
  };
  return { fetchImpl, requests };
}

function enabledEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    V4_EPOCH_RAILWAY_DISPATCH_ENABLED: "true",
    GITHUB_ACTIONS_DISPATCH_TOKEN: TOKEN,
    ...extra,
  };
}

describe("v4 epoch Railway dispatch watchdog", function () {
  it("pins Railway to the offset UTC cron and one-shot dispatcher", function () {
    const railway = JSON.parse(readFileSync("railway.json", "utf8"));
    expect(railway.deploy).to.deep.equal({
      startCommand: "npm run watchdog:v4:epochs:dispatch",
      cronSchedule: "12,27,42,57 * * * *",
      restartPolicyType: "NEVER",
    });
  });

  it("is disabled by default and does not call GitHub", async function () {
    const requests: unknown[] = [];
    const outcome = await runEpochDispatchWatchdog({
      env: {},
      fetchImpl: async (...args) => {
        requests.push(args);
        throw new Error("fetch should not run");
      },
      logger: { log: () => undefined },
    });

    expect(outcome).to.deep.equal({ status: "disabled" });
    expect(requests).to.have.length(0);
  });

  it("validates exact enablement and the narrow stale-time window", function () {
    expect(() => parseWatchdogConfig({ V4_EPOCH_RAILWAY_DISPATCH_ENABLED: "yes" }))
      .to.throw("must be exactly true or false");
    expect(() => parseWatchdogConfig({ V4_EPOCH_RAILWAY_DISPATCH_ENABLED: "true" }))
      .to.throw("GITHUB_ACTIONS_DISPATCH_TOKEN is required");
    expect(() => parseWatchdogConfig(enabledEnv({ V4_EPOCH_DISPATCH_STALE_MINUTES: "15" })))
      .to.throw("must be an integer between 10 and 14");
  });

  it("skips a recent scheduled run", async function () {
    const { fetchImpl, requests } = standardFetch([{
      id: 101,
      event: "schedule",
      status: "completed",
      created_at: "2026-08-28T06:03:00.000Z",
    }]);

    const outcome = await runEpochDispatchWatchdog({
      env: enabledEnv(), fetchImpl, now: NOW, logger: { log: () => undefined },
    });

    expect(outcome.status).to.equal("skipped-recent");
    expect(requests).to.have.length(3);
  });

  it("skips a recent manual dispatch", async function () {
    const { fetchImpl, requests } = standardFetch([{
      id: 102,
      event: "workflow_dispatch",
      status: "completed",
      created_at: "2026-08-28T06:02:00.000Z",
    }]);

    const outcome = await runEpochDispatchWatchdog({
      env: enabledEnv(), fetchImpl, now: NOW, logger: { log: () => undefined },
    });

    expect(outcome.status).to.equal("skipped-recent");
    expect(requests).to.have.length(3);
  });

  it("skips any active target-workflow run even when it is old", async function () {
    const { fetchImpl, requests } = standardFetch([{
      id: 103,
      event: "workflow_dispatch",
      status: "in_progress",
      created_at: "2026-08-28T05:00:00.000Z",
    }]);

    const outcome = await runEpochDispatchWatchdog({
      env: enabledEnv(), fetchImpl, now: NOW, logger: { log: () => undefined },
    });

    expect(outcome).to.deep.equal({ status: "skipped-active", runId: 103 });
    expect(requests).to.have.length(3);
  });

  it("dispatches one execute cycle when the latest relevant run is stale", async function () {
    const { fetchImpl, requests } = standardFetch([{
      id: 104,
      event: "schedule",
      status: "completed",
      created_at: "2026-08-28T05:48:00.000Z",
    }]);

    const outcome = await runEpochDispatchWatchdog({
      env: enabledEnv(), fetchImpl, now: NOW, logger: { log: () => undefined },
    });

    expect(outcome.status).to.equal("dispatched");
    expect(requests).to.have.length(4);
    const post = requests[3];
    expect(post.init?.method).to.equal("POST");
    expect(JSON.parse(String(post.init?.body))).to.deep.equal({
      ref: "main",
      inputs: { execute: "true" },
    });
  });

  it("ignores unrelated workflow events when deciding freshness", async function () {
    const { fetchImpl, requests } = standardFetch([{
      id: 105,
      event: "push",
      status: "completed",
      created_at: "2026-08-28T06:11:00.000Z",
    }]);

    const outcome = await runEpochDispatchWatchdog({
      env: enabledEnv(), fetchImpl, now: NOW, logger: { log: () => undefined },
    });

    expect(outcome.status).to.equal("dispatched");
    expect(requests).to.have.length(4);
  });

  it("fails closed when repository or workflow pins differ", async function () {
    const wrongRepository = standardFetch([], {
      repository: {
        id: TARGET_REPOSITORY_ID + 1,
        full_name: TARGET_REPOSITORY,
        default_branch: TARGET_DEFAULT_BRANCH,
      },
    });
    let repositoryFailure: unknown;
    try {
      await runEpochDispatchWatchdog({
        env: enabledEnv(),
        fetchImpl: wrongRepository.fetchImpl,
        now: NOW,
        logger: { log: () => undefined },
      });
    } catch (error) {
      repositoryFailure = error;
    }
    expect(repositoryFailure).to.be.instanceOf(Error);
    expect((repositoryFailure as Error).message).to.include("repository identity");

    const inactiveWorkflow = standardFetch([], {
      workflow: {
        id: TARGET_WORKFLOW_ID,
        path: TARGET_WORKFLOW_PATH,
        state: "disabled_manually",
      },
    });
    let workflowFailure: unknown;
    try {
      await runEpochDispatchWatchdog({
        env: enabledEnv(),
        fetchImpl: inactiveWorkflow.fetchImpl,
        now: NOW,
        logger: { log: () => undefined },
      });
    } catch (error) {
      workflowFailure = error;
    }
    expect(workflowFailure).to.be.instanceOf(Error);
    expect((workflowFailure as Error).message).to.include("workflow identity or state");
  });

  it("does not expose the token in API errors", async function () {
    const { fetchImpl } = standardFetch([{
      id: 106,
      event: "schedule",
      status: "completed",
      created_at: "2026-08-28T05:48:00.000Z",
    }], { dispatchStatus: 403 });

    let failure: unknown;
    try {
      await runEpochDispatchWatchdog({
        env: enabledEnv(), fetchImpl, now: NOW, logger: { log: () => undefined },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).to.be.instanceOf(Error);
    expect((failure as Error).message).to.include("status=403");
    expect((failure as Error).message).not.to.include(TOKEN);
  });
});
