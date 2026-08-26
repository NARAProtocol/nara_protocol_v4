# NARA-20260826-v4-stabilizer-shadow

Date: 2026-08-26

Owner: `NARAProtocol/nara_protocol_v4`

Evidence state: `implemented`, `tested` locally

Not claimed: `merged`, `deployed`, `configured`, `indexed`, `activated`, or
`available`

## Scope

This change organizes the live v4 tax-matrix evidence runners under
`scripts/matrix/` and adds a Phase 1 two-sided stabilizer shadow harness. The
shadow harness observes the canonical Base NARA/USDC Hook event stream and
records hypothetical counter-flow decisions. It cannot sign, submit, retry, or
resubmit a transaction.

The release remains an operations/evidence change. It does not modify any v4
contract, ABI, address, role, manifest, keeper schedule, or deployed runtime.

## Phase 1 safety boundary

- `--live` exits before manifest/provider setup with `PHASE 2 NOT ENABLED`.
- The runner does not load the general `.env`, import a transaction-capable
  runner, read `PRIVATE_KEY`, or instantiate a signer. Its launcher forwards
  only whitelisted public/read-only values.
- Production addresses come from the hash-pinned deployment manifest; Base
  chain ID and current runtime code hashes are verified before a session starts.
- Pool ID, side, currency, transaction origin, trigger block, and quote block
  are recorded or conservatively rejected.
- Historical quote or reference-state failures are recorded as skipped; the
  runner never substitutes a current-head quote.
- Watched-wallet transactions are excluded from the external trigger set.
- Hook actions are aggregated per transaction and thresholded per transaction.
  Only independently qualifying external transactions are then combined into
  one block-side diagnostic candidate.
- Floor budgets use integer accounting, preserve the configured reserve floor,
  and apply the configured per-action cap.
- JSONL evidence uses `schemaVersion: 2`, immutable chain/pool/config and
  observation identities, finalized block hashes, and per-range checkpoints.
  Schema v1 remains visible but is release-ineligible. Overlapping v2 evidence
  is deduplicated; incomplete, malformed, gap, or watcher-error sessions are
  excluded.
- Timeout and SIGINT request graceful shutdown and wait for any active scan;
  `lastBlock` advances only after the durable checkpoint record.

## Evidence tools

- `runV4TwoSidedStabilizer.ts`: live-shadow observation and bounded historical
  replay.
- `summarizeStabilizerShadow.ts`: read-only canonical-session integrity and
  economics summary.
- `analyzeStabilizerPersistence.ts`: read-only block-pinned price-persistence
  analysis at `+1`, `+3`, `+5`, `+10`, and `+20` blocks.

Raw `deployments/stabilizer-shadow.jsonl` remains ignored by Git. It is local
operational evidence, not an integration manifest. This release record contains
only sanitized conclusions and test results.

## Local evidence checkpoint

Canonical v2 full-range replay session
`stabilizer-2026-08-26T20:34:26.453Z` scanned the activation range
`49721189..50493528` without a signer or transaction:

- 78 durable range checkpoints and a clean `replay_complete` summary;
- 19 pump and 15 floor diagnostic simulations;
- 42 additional qualifying transactions explicitly skipped because the
  configured RPCs could not serve their pre-trigger historical storage state;
- pump diagnostics: 8 `GO`, 11 `NO_GO`;
- floor recovery marks: 7 `GO`, 8 `NO_GO`;
- total independent diagnostic mark: `307.1126 USDC` (`18.7597` pump,
  `288.3529` floor recovery mark).

That total is **not realizable policy P&L**. The replay does not consume virtual
inventory across candidates, pump quotes use end-of-trigger-block Hook state,
and floor marks omit exit costs and recovery probability. All simulation
records therefore carry `activationVerdict: BLOCKED`.

Persistence analysis selected all 34 observations but found the configured RPC
set non-archival for this purpose: only 4 of 195 unique historical block reads
were available, 191 were unavailable, and all 34 event analyses were
unavailable. No +1/+3/+5/+10/+20 persistence conclusion is claimed.

Earlier schema v1 sessions, including an interrupted exploratory full-history
run and the original whale-window reconstruction, remain local development
evidence and are excluded from release totals.

## Verification

Verified from branch `feat/v4-stabilizer-shadow`, based directly on
`origin/main` commit `7b28d3a23123b5ee58f93e9c8cb34150adeb9d05`:

- focused stabilizer, summary, aggregation, and persistence tests: `55 passing`;
- `npm run test:ops`: `43 passing`;
- `npm run build`: pass;
- `npm run test:nonfork`: `741 passing`;
- focused same-block buy/sell latest-state Base-fork tests: `2 passing`;
- scoped strict TypeScript check for the Matrix implementation/tests: pass;
- repository-wide `tsc --noEmit` still exits `2` on pre-existing unrelated
  Position NFT scripts and test-console declaration/module-resolution errors;
- `npm run size`: pass; all deployable artifacts remain within EVM limits;
- `npm audit --audit-level=high`: exit `0`; 8 existing low-severity
  transitive `elliptic` findings have no available fix;
- `git diff --check`: pass.

Push, pull request CI, and merge remain unperformed and require the normal
protected-branch workflow.

## Remaining boundary

Phase 2 remains blocked. No executor may be designed or enabled from this
record alone. A future explicit order and deployment-specific review would need
an archive-capable Base source; actual source-output reconstruction; an
after-trigger fork with one empty block before defense quoting; virtual USDC,
NARA, and FIFO basis across accepted actions; full floor buy/exit economics;
persistence calibration; cooldown and cascade controls; per-action and daily
loss caps; stale-state/RPC disagreement handling; allowance hygiene; dedicated
credentials; an emergency disable path; and new fork and simulation evidence.
