# NARA v4 Epoch Maintenance Runbook

Change-ID: `NARA-20260731-epoch-recovery`

Recurring-maintenance hardening change-ID:
`NARA-20260814-v4-epoch-maintainer-production-guard`

Current activation evidence:
`docs/releases/NARA-20260815-v4-epoch-maintainer-activation.md`

Latest recovery and operator fast-path evidence:
`docs/releases/NARA-20260826-v4-epoch-recovery.md`

Recurring scheduler-resilience review:
`docs/releases/NARA-20260828-v4-epoch-maintainer-resilience.md`

Redundant scheduler watchdog:
`docs/releases/NARA-20260828-v4-epoch-railway-watchdog.md`

This runbook covers the fresh Base v4 engine only. The engine's epoch functions
are permissionless. No admin, treasury, Safe, or protocol role is needed.

## Correct Reserve Model

`emissionReserve()` is only the engine-local, tracked NARA balance. The sealed
`NARARewardReserve` is separate and appears through
`rewardReserveAvailable()`. The engine pulls from that sealed reserve during
epoch advancement when local emission funding is insufficient.

Call `syncEmissionReserve()` only when NARA was transferred directly to the
engine and is not yet included in `trackedEmissionReserve`. The maintainer
detects that exact condition. A zero `emissionReserve()` does not imply that the
sealed reserve is unfunded.

Execute mode refuses to account for an unexpected direct Engine balance unless
the separately reviewed command includes `--sync-untracked-reserve`. Scheduled
maintenance never includes that flag.

## Read-Only Check

Verify the active environment and deployed runtime bytecode against the pinned
production activation manifest before reviewing Engine health:

```powershell
npm run verify:v4:runtime-config
```

This guard fails closed if any active address, PoolId, LP token ID, release
commit, deployment receipt anchor, Safe code hash, or deployed Token/Engine/
Hook/Vault/Compounder bytecode differs from the pinned manifest. Operational
scripts run the same guard internally; an internally consistent historical
Token/Engine pair is not sufficient.

```powershell
npm run maintain:v4:epochs
```

The command verifies Base chain ID, engine runtime code, the configured NARA
binding, current and settled epochs, both reserve buckets, total locked NARA,
and the next position ID. It prints the bounded transaction plan but sends
nothing.

## Fast Recovery Decision

This section is the shortest safe route after a new explicit human approval.
It does not pre-authorize a future transaction. Run from the authoritative
`NARAProtocol/nara_protocol_v4` checkout and regenerate the live plan
immediately before execution.

```powershell
npm run verify:v4:runtime-config
npx tsx scripts/maintainV4Epochs.ts --batch-size 100 --max-batches 10
```

Use the reported state to select exactly one path:

| Observed state | Action |
|---|---|
| backlog `0` | Stop. No transaction is required. |
| backlog `1..150` | Dispatch the existing `main` workflow with `execute=true`; its reviewed routine can clear the full backlog as `100 + remainder`. |
| backlog `151..1000`, dedicated keeper credential already available in the approved local runtime | Run the documented dedicated-wallet recovery command below after checking the wallet address, balance, reserve state, and gas estimate. |
| backlog `151..1000`, keeper credential exists only as a GitHub Actions secret | Use the temporary, CI-validated GitHub-secret path below. The `main` workflow deliberately refuses this backlog. |
| untracked direct reserve greater than `0`, external reserve `0`, backlog above configured recovery capacity, runtime mismatch, or keeper mismatch | Stop and perform a new deployment-specific review. Do not widen flags or bounds casually. |

For a routine backlog of at most 150, the hosted path is:

```powershell
gh workflow run v4-epoch-maintainer.yml --ref main -f execute=true
```

Record the returned run URL, wait for completion, then perform the verification
steps below. A successful idle cycle may submit no transaction.

### GitHub-secret-only recovery path

Use this only when the backlog is above the routine limit and the dedicated
signer is intentionally available only through the protected repository
secret. Never export, print, copy, rotate, or download that secret.

1. Confirm the public keeper address, required secret names, workflow state,
   live backlog, zero untracked reserve, sufficient sealed reserve, and keeper
   ETH balance. Secret metadata may be listed; secret values must never be
   read.
2. Preserve any dirty checkout. Create a focused clean worktree from current
   `origin/main`, for example:

   ```powershell
   $RecoveryPath = 'C:\checked\nara-protocol-hardhat-epoch-recovery-YYYYMMDD'
   $Branch = 'ops/v4-epoch-recovery-YYYYMMDD'
   git fetch origin main
   git worktree add -b $Branch $RecoveryPath origin/main
   ```

   Replace `YYYYMMDD` with the recovery date and verify the resolved path before
   any later cleanup.

3. In the temporary branch only, change
   `.github/workflows/v4-epoch-maintainer.yml` so scheduled execution retains
   both existing routine steps and their `max-backlog 150` commands, while
   manual `workflow_dispatch` with `execute=true` runs these two additional
   steps:

   ```yaml
   - name: Verify bounded manual recovery plan
     if: github.event_name == 'workflow_dispatch' && inputs.execute == true
     run: npx tsx scripts/maintainV4Epochs.ts --batch-size 100 --max-batches 10
   - name: Recover epochs with the dedicated keeper
     if: github.event_name == 'workflow_dispatch' && inputs.execute == true
     env:
       V4_EPOCH_KEEPER_ADDRESS: ${{ vars.V4_EPOCH_KEEPER_ADDRESS }}
       V4_EPOCH_KEEPER_PRIVATE_KEY: ${{ secrets.V4_EPOCH_KEEPER_PRIVATE_KEY }}
       V4_EPOCH_ALERT_WEBHOOK_URL: ${{ secrets.V4_EPOCH_ALERT_WEBHOOK_URL }}
       V4_EPOCH_HEARTBEAT_URL: ${{ secrets.V4_EPOCH_HEARTBEAT_URL }}
       V4_EPOCH_REQUIRE_HEARTBEAT: "true"
       V4_EPOCH_NOTIFY_RECOVERY: "true"
     run: npx tsx scripts/maintainV4Epochs.ts --execute --batch-size 100 --max-batches 10
   ```

   Restrict the original routine check and routine execute steps to
   `github.event_name == 'schedule'`. Do not change the schedule, deployment
   binding, keeper, secret names, heartbeat requirement, package scripts, or
   recurring bounds.
4. Run `npm ci --ignore-scripts`, `npm run test:ops`, `npm run build`,
   `npm run test:nonfork`, `npm audit --audit-level=high`, and
   `git diff --check`. Review the full diff and scan it for secrets.
5. Commit the one-file workflow change on the focused branch, push it, open a
   pull request using the repository template, and wait for the required
   canonical CI check. Do not bypass branch protection.
6. Lock the local, pull-request, and remote branch to the same full commit SHA.
   Dispatch from that exact branch and watch the returned run:

   ```powershell
   $Expected = (git rev-parse HEAD).Trim()
   $Remote = ((git ls-remote origin "refs/heads/$Branch") -split '\s+')[0]
   $PullRequest = gh pr view --json headRefOid | ConvertFrom-Json
   if ($Remote -ne $Expected -or $PullRequest.headRefOid -ne $Expected) {
     throw 'Recovery branch changed after review'
   }
   gh workflow run v4-epoch-maintainer.yml --ref $Branch -f execute=true
   $RunId = gh run list --workflow v4-epoch-maintainer.yml --branch $Branch --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId'
   gh run watch $RunId --exit-status
   ```

7. Verify every transaction independently: Base chain `8453`, sender equals
   the dedicated epoch keeper, target equals the manifest Engine, calldata
   decodes only to the planned `advanceEpochs(uint256)` batch, receipt status
   is `1`, and receipt-block state progressed.
8. Run the unchanged routine guard locally. Completion requires `backlog: 0`,
   no planned batches, zero untracked reserve, and a funded external reserve:

   ```powershell
   npx tsx scripts/maintainV4Epochs.ts --batch-size 100 --max-batches 2 --max-backlog 150
   ```

9. Attach sanitized hashes, blocks, block hashes, decoded calls, gas cost,
   pre/post health, workflow run, and locked commit to the pull request. Close
   the temporary pull request without merging, delete only the exact temporary
   branch/worktree after verifying they are clean, and confirm `main` was not
   changed.

The CI wait and Base confirmations are intentional. The shortcut is selecting
the correct route immediately, not bypassing runtime checks, protected secrets,
receipt-pinned reads, or explicit approval.

## One-Time Recovery

### Lowest-friction path: one Safe batch

Generate the batch immediately before signing:

```powershell
npm run build:v4:epoch-recovery
```

Import `deployments/v4-epoch-recovery-safe-batch.json` into Safe Transaction
Builder. It contains every bounded `advanceEpochs()` call required by the read
block and adds `syncEmissionReserve()` only if direct untracked engine NARA is
actually present. The builder simulates each call from the Safe and never signs
or submits. Review the engine address, call list, evidence block, and zero ETH
values; collect the normal Safe signatures and execute before the observed
backlog exceeds the recorded recovery capacity. Calls safely stop early once
the engine is current, so the generated batch rounds its final capacity up to
leave several hours of signing headroom.

### Dedicated permissionless wallet path

Use a dedicated gas-funded keeper key. It is permissionless and must not be an
admin, treasury, Safe owner, or deployer key.

Required environment keys:

```text
BASE_RPC_URL (or BASE_MAINNET_RPC_URL)
Pinned production V4 keys generated by npm run v4:env:production:write
V4_EPOCH_KEEPER_ADDRESS
V4_EPOCH_KEEPER_PRIVATE_KEY
```

After explicit human approval:

```powershell
npx tsx scripts/maintainV4Epochs.ts --execute --batch-size 100 --max-batches 10
```

For the 466-epoch backlog observed at Base block `49358447`, the expected plan
is five transactions: `100 + 100 + 100 + 100 + 66`. Read-only estimates at
that state were `3,934,332` gas for a 100-epoch call and `2,634,510` gas for
the final 66-epoch call, about `18,371,838` execution gas in total. Actual cost
depends on Base execution and L1 data fees. The script re-reads every health
value at the successful receipt's exact block, retries only that block-pinned
read if the RPC backend has not indexed it yet, stops if progress is not
observed, and fails if any backlog remains. Verification retries never resend a
transaction.

## Recurring Maintenance

> **Activated 2026-08-14:** GitHub workflow `NARA v4 epoch maintainer`
> (workflow ID `324678194`, previously named `NARA v4 operations keeper`) is
> `active`; repository variable `V4_EPOCH_MAINTAINER_ENABLED` is `true`; and
> dedicated gas-only keeper
> `0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD` is configured. The standalone
> liquidity workflow was separately authorized and activated on 2026-08-15.
> Read the two dated maintainer activation records before changing either path.

`.github/workflows/v4-epoch-maintainer.yml` is an epoch-only cycle at minutes
`3,18,33,48` of every UTC hour. Its active configuration requires:

- repository variable `V4_EPOCH_MAINTAINER_ENABLED=true`;
- repository variable `V4_EPOCH_KEEPER_ADDRESS` with a dedicated gas-only EOA;
- secret `BASE_RPC_URL`;
- secret `V4_EPOCH_KEEPER_PRIVATE_KEY` for that same EOA;
- secret `V4_EPOCH_HEARTBEAT_URL` for a dead-man monitoring service; and
- optional secret `V4_EPOCH_ALERT_WEBHOOK_URL`.

The workflow generates its public configuration from the committed production
activation manifest and then verifies the manifest hash and live runtime
bytecode. GitHub deployment-address variables are deliberately not used. A
stale or modified manifest, a credential/address mismatch, a zero-gas wallet,
an absent heartbeat, an unexpected direct Engine balance, or a backlog above
150 fails before routine execution.

The scheduled policy uses at most two calls, `advanceEpochs(100)` followed by
the exact remainder, and refuses partial automatic recovery. The 150-epoch
ceiling covers 37.5 hours of missed 15-minute epochs while keeping each call
inside the production-proven 100-step envelope. The independent hosted monitor
must poll every five minutes and alert before the Engine's eight-epoch JIT
write boundary; the wider recovery envelope is not a substitute for that
external scheduler/dead-man check.

Do not reuse the epoch EOA for liquidity, admin, treasury, deployment,
Safe-owner, or trading activity. Do not change the enabled state, keeper,
schedule, bounds, or deployment binding without a new explicit user order and
deployment-specific review. Manual diagnostics should use `workflow_dispatch`
in read-only mode first.

The heartbeat is sent only after an execute-mode cycle ends with zero backlog.
Configure the dead-man service to alert if the 15-minute workflow misses its
expected window; this detects scheduler outages that an in-process error
webhook cannot see.

### Redundant Railway dispatch watchdog

`scripts/dispatchV4EpochMaintainer.ts` is a scheduler-only fallback. Railway
runs it at minutes `12,27,42,57` UTC, nine minutes after each expected GitHub
schedule. It checks the exact repository ID, workflow ID and path, default
branch, active workflow state, active runs, and the latest scheduled or manual
run. A run no older than 12 minutes is healthy. If the latest relevant run is
older, the watchdog dispatches the protected `main` workflow once with
`execute=true`.

The Railway service must contain only these watchdog settings:

```text
V4_EPOCH_RAILWAY_DISPATCH_ENABLED=true
GITHUB_ACTIONS_DISPATCH_TOKEN=<fine-grained credential>
V4_EPOCH_DISPATCH_STALE_MINUTES=12
```

The dispatch credential is limited to Actions write and metadata read for
`NARAProtocol/nara_protocol_v4`. Enter it directly in Railway; never paste it
into chat, logs, source, or a shell command. Railway must not contain
`V4_EPOCH_KEEPER_PRIVATE_KEY`, an RPC secret, or any admin, Safe, treasury, or
liquidity credential. The watchdog cannot sign or send a transaction. GitHub
hydrates and validates the pinned production configuration, holds the existing
gas-only keeper secret, and performs the bounded routine.

GitHub workflow concurrency remains `nara-v4-operations-keeper` with
`cancel-in-progress: false`. This serializes a delayed native schedule and a
fallback dispatch; a second idle cycle submits no transaction after the first
has cleared the backlog. The watchdog also refuses to dispatch while any target
workflow run is active. Set the Railway enable variable to `false` before
rotating its credential or changing its schedule, and perform a new protected
release review before re-enabling it.

## Verification Gate

Recovery is complete only when all of these hold at the same read block:

```text
currentEpoch == epochState.epoch
untrackedDirectReserve == 0
rewardReserveAvailable > 0
```

Then simulate or execute a separately approved small lock, advance through the
activation delay, confirm NARA accrual, claim, and verify the receiver balance
delta. Do not describe locking as available before that production smoke test
has immutable transaction evidence.

## Failure Response

- Backlog `1..8`: engine JIT can recover, but the maintainer should still catch
  up on its next run.
- Backlog `9..150`: user writes can revert `EpochStale`; the reviewed routine
  can clear the full backlog in no more than two calls.
- Backlog `>150`: recurring automation fails closed and requires a new
  deployment-specific recovery review.
- External reserve `0`: verify reserve binding, balance, allocation, and
  `totalReleased` before attempting any funding action.
- Untracked direct reserve `>0`: the maintainer calls
  `syncEmissionReserve()` once, then verifies the delta is gone.
- Status-`1` receipt followed by a progress error: inspect state at the exact
  receipt block before considering any recovery. Never replay or manually
  dispatch based on an unpinned `latest` read.
- Repeated RPC failure: switch the keeper to a reviewed backup RPC and keep the
  monitor alert open. Never log an RPC URL or secret value.
