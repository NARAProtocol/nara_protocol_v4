# NARA-20260826-v4-stabilizer-shadow

Date: 2026-08-26

Updated: 2026-08-27

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
- `stabilizerSwapFlow.ts`: exact canonical PoolManager swap-flow
  reconstruction for the source transaction.
- `stabilizerVirtualPortfolio.ts`: sequential USDC/NARA state with explicit
  seeded basis and FIFO realization.
- `stabilizerExpectedValue.ts`: conservative probability-weighted, all-cost
  expected-value calculation with explicit `POSITIVE_EV`, `NON_POSITIVE_EV`,
  and `BLOCKED` outcomes.
- `stabilizerHistoricalQuotes.ts`: canonical receipt reconstruction and exact
  block/hash-pinned V4 quotes with no current-head fallback.
- `stabilizerHistoricalFloorEv.ts`: sequential, fixed-horizon floor portfolios
  with reserve, gas, overlap, and FIFO inventory enforcement.
- `stabilizerGasModel.ts`: pure conservative quote-gas/base-fee conversion to
  atomic USDC, including the fixed Base L1 data buffer.
- `NARAV4StabilizerNextBlock.fork.test.ts`: opt-in archive-fork proof that
  mines one empty block after the exact trigger snapshot before defense quote.
- `NARAV4StabilizerHistoricalFloorEv.fork.test.ts`: opt-in floor-only archive
  fork screen over all canonical floor candidates and five exit horizons.

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
records therefore carry `positiveEvVerdict: BLOCKED` and
`activationVerdict: BLOCKED`.

The original persistence analysis selected all 34 observations but found only
4 of 195 unique direct historical reads available. A 2026-08-27 rerun against
the current HTTP endpoint found 2 available and 193 unavailable because direct
historical `eth_call` was rejected. The same endpoint did serve the historical
state proofs required by the isolated local forks below. The general 34-event
persistence analysis remains unavailable; no persistence conclusion is
claimed.

On 2026-08-27, the opt-in archive-fork proof passed for the canonical floor
trigger transaction
`0x0167bc7f58aa15aec7bc84b593a376102f5d3ea1d3516a74976c67daf287b84e`
at Base block `49,721,262`, hash
`0x811065427ef5e543a6ab5428a537c47389853524e9afceb07bb8de90b6f4ebfe`:

- canonical PoolManager flow reconstructed `12,257.063182609538962180` net
  NARA into the pool and `79.795311` USDC out;
- the production manifest, Base chain ID, and pinned runtime hashes passed;
- after one empty local-fork block, a read-only 150 USDC defense quote returned
  `17,523.135437734645459844` NARA with a `127,189` gas estimate;
- no signer or production transaction was created.

This single exact counterfactual validates the archive/fork plumbing. It is not
an exit quote, a calibrated probability distribution, or positive-EV proof.

The same day, a separate floor-only historical screen completed over all 15
canonical floor candidates in that session. It created an isolated Base fork
for every entry and exit observation, with canonical block/hash checks, and
sent no transaction. Five separate portfolios tested exits at `+1`, `+3`,
`+5`, `+10`, and `+20` blocks relative to the entry block:

- each portfolio started with `350 USDC`, preserved `200 USDC`, and used a
  fixed `148 USDC` entry under the `150 USDC` cap;
- modeled gas used `max(350,000, 2 x quoter estimate)` units,
  `max(2 x block base fee, 0.01 gwei)`, `5,000 USDC/ETH`, plus a fixed
  `0.05 USDC` Base L1 data buffer per action;
- all 15 candidates received complete entry and five-horizon quote coverage;
- each horizon admitted 1 episode and reserve-blocked the remaining 14;
- the admitted `148 USDC` entry quoted
  `17,370.349934589888866750 NARA`; every canonical horizon returned
  `64.876685 USDC` gross, with `0.0675 USDC` modeled gas on each leg;
- the sole episode was therefore identical across the five horizons: modeled
  realized P&L `-83.258315 USDC`, ending cash `266.741685 USDC`, median and
  mean `-83.258315 USDC`, and win rate `0/1`.

This is an adverse exploratory observation, not an expected-value estimate.
One admitted episode cannot establish a distribution, and the canonical exit
states omit the hypothetical entry's effect on the pool. The report is scoped
`HISTORICAL_COUNTERFACTUAL_SCREEN` and therefore remains
`evidenceComplete: false`, `verdict: BLOCKED`, and
`executionAuthorized: false`. The five offsets are alternative fixed-horizon
policies, not five independent samples or probability weights.

Earlier schema v1 sessions, including an interrupted exploratory full-history
run and the original whale-window reconstruction, remain local development
evidence and are excluded from release totals.

## Verification

Verified from branch `feat/v4-stabilizer-shadow`, based directly on
`origin/main` commit `7b28d3a23123b5ee58f93e9c8cb34150adeb9d05`:

- focused stabilizer, EV, FIFO, source-flow, summary, aggregation, and
  persistence tests: `89 passing`;
- exact historical archive-fork proof: `1 passing` for the pinned floor trigger;
- historical identity/quote/gas/evaluator unit tests: `27 passing`;
- hardened floor-only historical archive-fork screen: `1 passing` in 197
  seconds on the final rerun, with all 15 candidates and 75 exit observations
  collected;
- `npm run test:ops`: `43 passing`;
- `npm run build`: pass;
- `npm run test:nonfork`: `775 passing`;
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
record alone. Exact source-output reconstruction, next-block fork quoting,
virtual FIFO accounting, and conservative EV math now have reusable code and
focused tests. The floor screen has complete canonical quote coverage for its
15 selected candidates, but it is not a stateful counterfactual and admits only
one portfolio episode per horizon. A future explicit order and deployment-
specific review still need stateful intervention replay; calibrated scenario
probabilities; a materially larger sequential sample; persistence calibration;
cooldown and cascade controls;
per-action and daily loss caps; stale-state/RPC disagreement handling;
allowance hygiene; dedicated credentials; an emergency disable path; and new
fork and simulation evidence.
