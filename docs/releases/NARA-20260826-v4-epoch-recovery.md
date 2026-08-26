# NARA v4 Epoch Recovery — 2026-08-26

Change ID: `NARA-20260826-v4-epoch-recovery`

Network: Base (`8453`)

Evidence state: activated recovery; recurring maintainer remains separately
activated under its unchanged routine policy.

## Outcome

The dedicated gas-only epoch keeper cleared a 162-epoch production Engine
backlog in two permissionless, zero-value calls. Final receipt-block state was
current/stored epoch `1661 / 1661`, backlog `0`, with zero untracked direct
Engine reserve.

This recovery changed no contract, ABI, address, role, deployment binding,
keeper, schedule, recurring batch bound, or liquidity-maintainer policy.
Sanitized machine-readable receipt evidence is
[`deployments/v4-engine-epoch-recovery-2026-08-26.json`](../../deployments/v4-engine-epoch-recovery-2026-08-26.json).

## Why the Engine fell behind

The last successful routine cycle before the incident was GitHub Actions run
`32730777918`. Subsequent scheduled checks first lost RPC access with provider
`408 Request Timeout — free plan` responses. Updating `BASE_RPC_URL` to the paid
provider restored reads, but the accumulated backlog was already above the
routine workflow's deliberate `max-backlog 8` guard. Every later routine cycle
then failed closed rather than automatically widening its transaction scope.

The provider upgrade prevents the original free-plan rejection but cannot
retroactively clear a backlog. A separately approved one-time recovery was
therefore required.

## Authorization and preflight

The user explicitly authorized immediate epoch recovery using the dedicated
keeper. No private key was requested, read, printed, copied, or stored. The
signing credential remained only in the protected GitHub Actions secret
`V4_EPOCH_KEEPER_PRIVATE_KEY`.

Preflight established:

- canonical Engine:
  `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC`;
- dedicated epoch keeper:
  `0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD`;
- pinned production-manifest SHA-256:
  `e525b8c6508c454b951fdb422eb6ad03b51a120827b22efc4ae64a3862ddd066`;
- execution pre-state: current epoch `1661`, stored epoch `1499`, backlog
  `162`;
- planned batches: `100 + 62`;
- external reward reserve:
  `649999.064660728418213654 NARA`;
- untracked direct reserve: `0 NARA`;
- total locked: `7076.1735 NARA`;
- keeper balance before recovery: `0.002258839350502051 ETH`; and
- estimated two-call execution-gas upper cost before the Base L1 data fee:
  `0.000145935119 ETH`.

## Protected execution path

The default `main` workflow intentionally refused the backlog because manual
execute mode used the same eight-epoch routine guard. The dedicated credential
was not present locally, so direct local signing was unavailable by design.

A clean temporary branch from `origin/main` changed only manual dispatch
behavior while preserving the scheduled routine commands and limits. The exact
temporary commit was
`df05c83356b3dde7004f63cc1a917ec57291c3fd`. Pull request
[`#42`](https://github.com/NARAProtocol/nara_protocol_v4/pull/42) passed the
canonical build/test/size check, CodeQL, Slither, Aderyn, and Echidna before
production dispatch.

Workflow run
[`32934625356`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/32934625356)
re-ran the production runtime guard and regenerated the live plan immediately
before signing. The required heartbeat completed after the final zero-backlog
read.

## Receipt evidence

| Part | Decoded call | Transaction | Block | Status | Gas used | Total fee |
|---:|---|---|---:|---:|---:|---:|
| 1 | `advanceEpochs(100)` | [`0x886606357052b7f1256613e30dbd962248fcf67ff5ae9e2862641c602725ada0`](https://basescan.org/tx/0x886606357052b7f1256613e30dbd962248fcf67ff5ae9e2862641c602725ada0) | `50466603` | `1` | `7,796,862` | `0.000046781581543705 ETH` |
| 2 | `advanceEpochs(62)` | [`0xce4ecd87fdf0ab145a1c1e6db9008ba009727b0724056991ed6a9752d19b42df`](https://basescan.org/tx/0xce4ecd87fdf0ab145a1c1e6db9008ba009727b0724056991ed6a9752d19b42df) | `50466604` | `1` | `4,851,204` | `0.000029107633543705 ETH` |

Receipt identities were independently verified:

- chain ID: `8453`;
- sender: dedicated epoch keeper;
- target: canonical production Engine;
- value: zero;
- first block hash:
  `0x86efa63bb3e09126174e047465d5f462bfe8ea1c53825e76f7193230770cd8ce`;
- second block hash:
  `0xc155ef0f7a15a5d4b5125e3a39bb96031e2caa062f910a43762f42019e5c8406`;
- first block timestamp: `2026-08-26T05:35:53.000Z`; and
- second block timestamp: `2026-08-26T05:35:55.000Z`.

The first receipt emitted epochs `1500..1599`; the second emitted epochs
`1600..1661`. The L2 execution fee was `0.000075888396 ETH`, the Base L1 data
fee was `0.000000000819087410 ETH`, and total keeper balance cost was
`0.000075889215087410 ETH`.

## Receipt-pinned final state

At block `50466604`:

```text
currentEpoch:                   1661
storedEpoch:                    1661
backlog:                           0
localEmissionReserveNara:          0
externalRewardReserveNara:    649998.642061840394812631
trackedEmissionReserveNara:        0
untrackedDirectReserveNara:        0
totalLockedNara:                7076.1735
nextPositionId:                    56
```

An independent latest-state routine check returned the same epoch state and no
planned batch. The keeper retained `0.002182950135414641 ETH`.

## Verification performed

Before dispatch:

```text
npm run test:ops       PASS — 42 tests
npm run build          PASS
npm run test:nonfork   PASS — 685 tests
npm audit --audit-level=high
                       PASS threshold — eight existing low findings, no fix
git diff --check       PASS
secret-shaped diff scan
                       PASS
```

The pull-request checks were all green before dispatch. After execution, both
receipts, decoded calls, sender, target, chain, status, blocks, gas, and fees
were verified independently through a Base RPC. The unchanged routine command
with `--max-backlog 8` then returned `status: current`, backlog `0`, and no
planned calls.

## Cleanup and next-time procedure

The recovery pull request was closed without merge. Its remote branch and clean
local worktree were deleted after receipt evidence was attached. `main` and the
operator's unrelated dirty checkout were not changed.

The canonical next-time decision tree and GitHub-secret-only procedure are now
in [`NARA_V4_EPOCH_MAINTENANCE_RUNBOOK.md`](../NARA_V4_EPOCH_MAINTENANCE_RUNBOOK.md).
Every future production recovery still requires a new explicit human approval.
Do not treat this record as standing authorization.

At the time of this evidence capture, workflow `324678194` remained `active`,
`V4_EPOCH_MAINTAINER_ENABLED` remained `true`, the routine bound remained
eight epochs, and the first scheduled cycle after recovery had not yet been
observed. That later scheduled result is monitoring evidence, not a condition
for the already-confirmed recovery receipts.

This is internal operational evidence, not an independent audit or a claim of
whole-stack production readiness.
