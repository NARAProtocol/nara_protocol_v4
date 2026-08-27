# NARA v4 Epoch Maintainer Resilience — 2026-08-28

Change ID: `NARA-20260828-v4-epoch-maintainer-resilience`

Network: Base (`8453`)

Evidence state: recurring policy merged, independently monitored, and used for
an operator-approved recovery. Receipt-pinned readback and the independent
sentinel both confirmed backlog zero.

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
source release.

## Activation evidence

Protected protocol PR `#47` passed the canonical build/test/size check, CodeQL,
Slither, Aderyn, and Echidna, then squash-merged as
`4c0829dd8a34b1185e918a94fdbee19c16ead20a`. The workflow remains active under
ID `324678194`, and its enable variable remains `true`.

Read-only workflow dispatch `33120989863` ran from that exact `main` commit and
re-verified the pinned production runtime. It observed current/stored epochs
`1823 / 1706`, backlog `117`, zero untracked direct Engine reserve, and planned
`100 + 17`. Because `execute=false`, the signing and maintenance steps were
skipped and no transaction was submitted.

At that state the external reward reserve was
`649998.509458370760776252 NARA`. The dedicated keeper held
`0.002150060353785219 ETH`; fresh read-only estimates for 100 and 17 steps were
`9,771,472` and `1,788,993` gas. Current fee data modeled an execution upper
cost of `0.000152598138 ETH`, about 14 times below the wallet balance.

The downstream read-only sentinel was merged in monitor PR `#24` from the
immutable protocol origin and deployed successfully on Railway as
`66f20715-0039-43f3-adfb-e77c47600a71`. It polls every five minutes, warned at
the current backlog, proved repeat/cooldown behavior, and contains no signer or
write path. Monitor activation evidence is in
`NARAProtocol/nara-swarm-monitor` commit
`1d63c08de20d889a5864784fddea5dd26a0afb34`.

Both epoch and liquidity workflows stopped receiving expected schedule events
in the same period even though manual and CI workflows continued to run. The
epoch workflow was re-registered disabled-to-enabled and verified `active`.
The expected `22:18` and `22:33` scheduled events were not delivered after the
workflow was re-registered. The operator therefore approved a guarded manual
dispatch; its recovery evidence is recorded below rather than represented as a
scheduled execution.

## Recovery completion

Workflow dispatch `33123323400` ran with `execute=true` from protected `main`
commit `e195ec4f08da7e5ea083b2d4701a6fc9dc6bfcb4`. Its production runtime guard
matched the pinned Base deployment. The read-only precheck observed
current/stored epochs `1825 / 1706`, backlog `119`, zero untracked direct Engine
reserve, and planned the complete bounded recovery as `100 + 19`.

The dedicated epoch keeper
`0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD` submitted two zero-value calls to
the production Engine `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC`:

- `advanceEpochs(100)`: transaction
  `0x2cdf5a58ef7af0a849b784f28c4d45330bd42519bafb0a2b9fa8400b519ee4a7`,
  status `1`, block `50540524`, gas used `7,796,862`;
- `advanceEpochs(19)`: transaction
  `0xf8525318646e6471fca9c2a640189a13ec81887cdeba35bbf27c99a531fc491f`,
  status `1`, block `50540525`, gas used `1,576,824`.

Independent receipt decoding verified chain ID `8453`, sender, target, method,
arguments, zero value, block hash, and successful status for both calls. Their
combined receipt fees were `0.00005624319231305 ETH`, including the reported L1
data fees.

Receipt-block readback at block `50540525` reported current/stored epochs
`1825 / 1825`, backlog `0`, external reward reserve
`649998.123350609976089468 NARA`, and zero untracked direct reserve. The
required heartbeat completed as part of the successful job. The independent
Railway sentinel then observed GREEN, backlog `0`, at block `50540546` and
routed `notification=recovered`.
