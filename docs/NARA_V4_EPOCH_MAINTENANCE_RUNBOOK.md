# NARA v4 Epoch Maintenance Runbook

Change-ID: `NARA-20260731-epoch-recovery`

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

## Read-Only Check

```powershell
npm run maintain:v4:epochs
```

The command verifies Base chain ID, engine runtime code, the configured NARA
binding, current and settled epochs, both reserve buckets, total locked NARA,
and the next position ID. It prints the bounded transaction plan but sends
nothing.

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
V4_ENGINE
V4_NARA_TOKEN
V4_EPOCH_KEEPER_PRIVATE_KEY
```

After explicit human approval:

```powershell
npm run maintain:v4:epochs -- --execute --batch-size 100 --max-batches 10
```

For the 466-epoch backlog observed at Base block `49358447`, the expected plan
is five transactions: `100 + 100 + 100 + 100 + 66`. Read-only estimates at
that state were `3,934,332` gas for a 100-epoch call and `2,634,510` gas for
the final 66-epoch call, about `18,371,838` execution gas in total. Actual cost
depends on Base execution and L1 data fees. The script re-reads state after every receipt,
stops if progress is not observed, and fails if any backlog remains.

## Recurring Maintenance

`.github/workflows/v4-epoch-maintainer.yml` runs the combined operations cycle
every 30 minutes only after a
maintainer deliberately configures:

- repository variable `V4_OPERATIONS_KEEPER_ENABLED=true`;
- repository variables `V4_ENGINE` and `V4_NARA_TOKEN`;
- secret `BASE_RPC_URL`;
- secret `V4_OPERATIONS_KEEPER_PRIVATE_KEY`; and
- optional secret `V4_EPOCH_ALERT_WEBHOOK_URL`.
- optional secret `V4_EPOCH_HEARTBEAT_URL` for a dead-man monitoring service.

The same new gas-only EOA may run epoch maintenance and the restricted liquidity
compound call. Do not reuse an admin, treasury, deployer, Safe-owner, or trading
wallet. Keep the enable variable false until the one-time recovery has been reviewed.
Use `workflow_dispatch` in read-only mode first. Scheduled execution remains
disabled unless the variable is explicitly enabled.

The heartbeat is sent only after an execute-mode cycle ends with zero backlog.
Configure the dead-man service to alert if the 30-minute workflow misses its
expected window; this detects scheduler outages that an in-process error
webhook cannot see.

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
- Backlog `>8`: user writes can revert `EpochStale`; treat as a launch blocker.
- External reserve `0`: verify reserve binding, balance, allocation, and
  `totalReleased` before attempting any funding action.
- Untracked direct reserve `>0`: the maintainer calls
  `syncEmissionReserve()` once, then verifies the delta is gone.
- Repeated RPC failure: switch the keeper to a reviewed backup RPC and keep the
  monitor alert open. Never log an RPC URL or secret value.
