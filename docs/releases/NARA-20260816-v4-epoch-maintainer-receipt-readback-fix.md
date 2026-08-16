# NARA v4 Epoch Maintainer Receipt-Block Readback Fix

Change ID: `NARA-20260816-v4-epoch-maintainer-receipt-readback-fix`

Date: 2026-08-16

Network: Base (`8453`)

## Outcome

The epoch maintainer now verifies every post-transaction Engine health value at
the successful receipt's exact Base block. If an RPC backend has not indexed
that confirmed block yet, the maintainer retries only the block-pinned read up
to five times with a 500-millisecond delay. It never resubmits the transaction
as part of this verification retry.

This correction changes no contract, keeper, credential, schedule, heartbeat,
batch bound, deployment binding, or production state.

## Incident evidence

Six of the 50 scheduled epoch runs reviewed between 2026-08-15 09:34 UTC and
2026-08-16 17:28 UTC were reported as failed after a successful
`advanceEpochs()` receipt. The first failing line was always
`advanceEpochs did not move the settled epoch`, but receipt-block state proved
that the requested progress occurred.

| Scheduled run | Transaction | Receipt-block result |
|---|---|---|
| [`31961696110`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/31961696110) | [`0x128d3a7346c6f5d5359d7be756424ec942265c7078acaab0358f0a89b1f22b81`](https://basescan.org/tx/0x128d3a7346c6f5d5359d7be756424ec942265c7078acaab0358f0a89b1f22b81) | status `1`; settled epoch `746 -> 748` at block `50055995` |
| [`31944475995`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/31944475995) | [`0x06602f66d4ce54b3b7b35e259a24265356701024a05ac5dd087ed672bb41a4e7`](https://basescan.org/tx/0x06602f66d4ce54b3b7b35e259a24265356701024a05ac5dd087ed672bb41a4e7) | status `1`; settled epoch `722 -> 725` at block `50045258` |

The workflow previously waited for a status-`1` receipt and then performed an
unpinned `latest` read. An eventually consistent RPC backend could serve the
pre-transaction state during that immediate read, causing a false failure and
skipping the otherwise valid heartbeat for that cycle.

No failed-run transaction requires replay. A later scheduled cycle remains the
only automatic recovery path if exact receipt-block state does not prove
progress.

## Source correction

- `sendWithMargin()` retains the confirmed receipt block together with the
  transaction hash.
- All nine Engine/token health calls accept one shared `blockTag`.
- Post-`syncEmissionReserve()` and post-`advanceEpochs()` reads use the
  confirmed receipt block.
- Block-indexing retries are bounded, read-only, and test-injectable.
- Exhaustion still fails closed without sending another transaction.

## Verification

```text
npm ci
PASS - locked dependency graph installed

npx hardhat test test/maintainV4Epochs.test.ts
PASS - 8 passing

npm run test:ops
PASS - 42 passing

npm run build
PASS

npm run test:nonfork
PASS - 568 passing

npm run size
PASS - all deployable artifacts remain within EVM size limits

npm audit --audit-level=high
PASS - no high-severity vulnerability; eight existing low-severity findings
```

The focused regression proves that every health call receives the same receipt
block, that a temporarily unavailable block is retried, and that retry
exhaustion remains bounded. A read-only call through the corrected helper at
known failed-run receipt block `50055995` returned current/stored epochs
`748 / 748` and zero backlog. No transaction was sent.

This is internal operational verification, not an independent audit or a
whole-stack production-readiness claim.
