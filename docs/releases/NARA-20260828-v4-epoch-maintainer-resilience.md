# NARA v4 Epoch Maintainer Resilience — 2026-08-28

Change ID: `NARA-20260828-v4-epoch-maintainer-resilience`

Network: Base (`8453`)

Evidence state: reviewed source change pending protected merge and hosted
observation. This record does not claim that the current backlog has been
cleared.

## Incident

Scheduled run `32991118334` last advanced the Engine to epoch `1706` on
2026-08-26. GitHub then emitted no scheduled workflow events for gaps of
`2h20m`, `3h13m`, `5h04m`, and `11h03m`, despite the configured twice-hourly
cron. The workflow remained active, `V4_EPOCH_MAINTAINER_ENABLED` remained
`true`, jobs started promptly when events existed, and no competing workflow
used its concurrency group.

The first delayed run observed current/stored epochs `1716 / 1706`, backlog
`10`. The former routine limit of eight correctly failed closed before signing,
but it also meant every later routine failed at the same precheck. A direct
Base read on 2026-08-28 at block `50538541` observed current/stored epochs
`1821 / 1706`, backlog `115`.

## Reviewed correction

The recurring epoch-only workflow now:

- requests a scheduled event at `3,18,33,48` UTC each hour;
- accepts a complete automatic recovery only when backlog is at most `150`;
- uses at most two calls, `advanceEpochs(100)` plus the exact remainder;
- refuses partial recovery and still fails closed above `150`;
- retains the pinned production manifest/runtime guard, dedicated gas-only
  keeper checks, untracked-reserve refusal, receipt-status verification,
  receipt-block readback, required zero-backlog heartbeat, and recovery alert;
  and
- exposes the alert webhook to the read-only routine precheck so a configured
  endpoint receives failures that happen before the signing step.

The 100-step transaction size is not theoretical: the 2026-08-26 recovery
confirmed `advanceEpochs(100)` with status `1`. The 150-epoch total ceiling is
37.5 hours of 15-minute epochs, while the separate Railway sentinel is expected
to poll every five minutes and alert well before backlog exceeds the Engine's
eight-epoch JIT boundary.

## Scope

No Solidity source, deployed bytecode, ABI, address, role, private key,
liquidity-maintainer policy, token balance, or onchain state is changed by this
source release. Protected CI/merge evidence and the first successful hosted
recovery must be appended before this record is described as activated.
