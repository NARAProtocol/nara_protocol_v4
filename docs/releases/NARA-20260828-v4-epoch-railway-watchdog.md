# NARA v4 epoch Railway watchdog

Change-ID: `NARA-20260828-v4-epoch-railway-watchdog`

Status: implemented and under protected release review; not yet activated

## Reason

GitHub's native scheduled events stopped arriving after 2026-08-27 14:34 UTC,
while protected manual dispatches continued to execute successfully. The
independent Railway sentinel detected the resulting epoch backlog. The
2026-08-28 recovery used the unchanged protected GitHub workflow and restored
the Engine to zero backlog, but a second scheduling path is required to prevent
the same delivery failure from silently recurring.

## Design

Railway runs `scripts/dispatchV4EpochMaintainer.ts` at UTC minutes
`12,27,42,57`, nine minutes after the native GitHub schedule. The script:

1. requires an exact opt-in and a repository-scoped Actions dispatch token;
2. pins repository `NARAProtocol/nara_protocol_v4` by numeric ID `1262891792`;
3. pins active workflow ID `324678194`, path
   `.github/workflows/v4-epoch-maintainer.yml`, and branch `main`;
4. skips while any target workflow run is active;
5. skips when the latest scheduled or manual run is no more than 12 minutes
   old; and
6. otherwise sends one `workflow_dispatch` request with `execute=true`.

The watchdog never receives the epoch keeper key, never receives an RPC
credential, never reads Engine state directly, and never sends an on-chain
transaction. The existing GitHub workflow remains the signer and bounded
executor. Its concurrency group serializes overlapping native and fallback
runs.

## Activation boundary

Source merge does not activate the fallback. Activation additionally requires:

- a dedicated Railway cron service sourced from protected `main`;
- the repository's committed `railway.json` schedule;
- `V4_EPOCH_RAILWAY_DISPATCH_ENABLED=true`;
- `V4_EPOCH_DISPATCH_STALE_MINUTES=12`;
- a fine-grained `GITHUB_ACTIONS_DISPATCH_TOKEN` entered directly in Railway
  with repository metadata read and Actions write only; and
- one observed healthy skip plus one controlled stale-path dispatch with a
  successful GitHub run and zero-backlog readback.

No keeper, RPC, admin, treasury, Safe, liquidity, or deployment secret belongs
in Railway.

## Recovery evidence before activation

- GitHub run: `33144152432`
- Protected source commit:
  `2dd03ac62c919cc5d4757a461723777074756088`
- Base transaction:
  `0x528646d712a4145b1ff46e321ee004c5a0e48e69b958fa76d101b0096d559bda`
- Receipt block: `50552392`
- Receipt status: `1`
- Receipt-block current/stored epoch: `1852 / 1852`
- Receipt-block backlog: `0`
- Independent Railway sentinel: `status=GREEN backlog=0 block=50552508
  notification=recovered`

Activation evidence and the immutable watchdog source commit will be appended
only after protected merge and Railway verification.
