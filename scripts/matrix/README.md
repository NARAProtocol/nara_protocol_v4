# Live Buy/Sell Tax Matrix Scripts (`scripts/matrix/`)

Live Base mainnet evidence runners for the NARA v4 hook tax policy. Each script
executes (or simulates) an explicitly approved matrix of real swaps against the
pinned fresh-v4 pool and produces a per-trade, onchain-verified evidence JSON.

These scripts are the **only** sanctioned way to generate live buy-tax /
sell-reversal evidence for `NARALiquidityGrowthHook` + `NARALiquidityGrowthVault`.
They are read-only by default; execution requires both a CLI flag and a typed
confirmation environment variable (see below).

---

## Contents

| Script                                       | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Execution gate                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `runV4LiveSameBlockBuyTaxMatrix.ts`          | One atomic Universal Router transaction containing **20 × 3 USDC** NARA buys in a single block. Verifies tier escalation under cumulative same-block pressure.                                                                                                                                                                                                                                                                                                                                      | `--execute` + `V4_LIVE_SAME_BLOCK_BUY_CONFIRMATION=BUY_NARA_20_X_3_USDC_SAME_BLOCK`                                                           |
| `runV4LiveSameBlockSellReversal.ts`          | Reverses the exact NARA output of the 20×3 USDC same-block buy: one atomic transaction with **20 NARA sell actions** in one block.                                                                                                                                                                                                                                                                                                                                                                  | `--execute` + `V4_LIVE_SAME_BLOCK_SELL_CONFIRMATION=SELL_FAST_BUY_NARA_20_ACTIONS_SAME_BLOCK`                                                 |
| `runV4LiveStaggeredBuyMatrix.ts`             | **10 × 11 USDC** buys, one tx per _distinct later block_, ~6 s apart (~1 min span). Verifies pressure resets across blocks (base tier).                                                                                                                                                                                                                                                                                                                                                             | `--execute` + `V4_LIVE_STAGGERED_BUY_CONFIRMATION=BUY_NARA_10_X_11_USDC_STAGGERED`                                                            |
| `runV4LiveTenMinBuyMatrix.ts`                | **100 × 11 USDC** (1,100 USDC gross), one tx per distinct later block, absolute 6 s schedule spanning ~10 min. The long-run baseline evidence matrix.                                                                                                                                                                                                                                                                                                                                               | `--execute` + `V4_LIVE_TEN_MIN_BUY_CONFIRMATION=BUY_NARA_100_X_11_USDC_TEN_MIN`                                                               |
| `runV4LiveTenMinBuyMatrixWithBigBuyHedge.ts` | The ten-min matrix **plus reactive big-buy hedging**: while the buy sequence runs, external buys ≥ trigger (default 100 USDC) are watched; whale bursts (10–20 buys in one go) aggregate into a pending bucket, and once the burst goes quiet **90% of the total whale-equivalent NARA is sold back in one swap**, then the sequence continues unchanged. See [Big-buy hedging variant](#big-buy-hedging-variant) below. Hedging is armed only by `--hedge` (dry-run accounting in read-only mode). | `--execute` + `V4_LIVE_TEN_MIN_BUY_CONFIRMATION=...`; with `--hedge` also `V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION=HEDGE_SELL_ON_BIG_EXTERNAL_BUY` |
| `runV4TwoSidedStabilizer.ts`                 | **Phase 1 shadow runner.** Watches large NARA buys and sells, quotes hypothetical counter-flow at the trigger block, and appends replayable decisions to `deployments/stabilizer-shadow.jsonl`.                                                                                                                                                                                                                                                                                                     | No execution gate exists. `--live` always exits; the runner cannot send transactions.                                                         |

---

## Big-buy hedging variant (`runV4LiveTenMinBuyMatrixWithBigBuyHedge.ts`)

Same preflight, absolute schedule, per-trade tax reconstruction, and evidence
discipline as the plain ten-min runner, plus a reactive hedge leg:

1. **Whale watcher.** Between scheduled buys (and after each one), freshly mined
   hook `PoolFeeTaken` BUY events with USDC input ≥ trigger (default 100 USDC)
   from other wallets are scanned. Each contributes its whale-equivalent NARA
   output, quoted through the official V4Quoter at that whale's own block, to a
   pending bucket. Our own transactions are always excluded.
2. **Burst aggregation.** A whale splitting into 10–20 buys across adjacent
   blocks accumulates in the bucket; the hedge fires only after the burst is
   quiet for `V4_HEDGE_QUIET_BLOCKS` (default 2) blocks, pricing the TOTAL.
3. **Hedge execution.** One Universal Router swap sells 90% of the bucket
   (`V4_HEDGE_SELL_RATIO_BPS`, default 9000) back into the pool: quote-floored
   slippage (10%), simulate-before-send with one fresh re-pin retry, distinct
   strictly-later-block enforcement shared with the buy schedule, marginal sell
   fee reconstructed from the live sell curve including third-party same-block
   NARA sell flow, Vault `totalTokenFeeRecorded` delta reconciliation, and full
   allowance cleanup. Dust hedges below `V4_HEDGE_MIN_SELL_USDC` (default 5)
   quoted output are skipped. Hard cap: `V4_HEDGE_MAX_SELLS` per run (default 25).
4. **Sequence continuity.** The buy schedule is never replaced or re-timed;
   hedges only occupy wait windows. Buy-side verification is unaffected — hook
   pressure ledgers are per input currency, so NARA sells never contaminate the
   USDC buy-flow reconstruction.
5. **Gates & modes.**
   - Plain run (no `--hedge`): behaves exactly like the ten-min runner.
   - Read-only + `--hedge`: DRY-RUN — logs `wouldHedge` decisions, sends nothing.
   - `--execute` + `--hedge`: additionally requires
     `V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION=HEDGE_SELL_ON_BIG_EXTERNAL_BUY`.
6. **Evidence.** `deployments/v4-live-buy-tax-tenmin-100x11-bigbuy-hedge-latest.json`
   records every whale observation (buyer EOA via `tx.from`, amount,
   nara-equivalent) and every executed hedge (trigger txs, totals, fee
   reconstruction, vault delta), plus run totals incl. unhedged remainder and
   net USDC delta.

Cost note: at current prices a 100-USDC whale ≈ 11k NARA ⇒ the hedge sell lands
in the high sell tier of the LIVE curve (≥9k NARA ⇒ 12%; ≥18k ⇒ 20%) plus LP fee
and impact. The hedge wins only when whale price impact exceeds round-trip
costs; caps and gates exist because of that.

Allowance note: pre-existing NARA approvals from other workflows are PRESERVED
(never overwritten with exact amounts, never revoked); observed grants are
recorded in preflight evidence. USDC allowances must start at zero and are
revoked after the run as usual. As of 2026-08-24+ the deployer wallet carries a
pre-existing max-uint256 NARA→Permit2 approval of unknown origin — confirm it
is intentional; revoking it is a separate explicit decision.

```powershell
cd nara-protocol-hardhat

# Dry-run hedging decisions alongside a read-only preflight:
npx tsx scripts/matrix/runV4LiveTenMinBuyMatrixWithBigBuyHedge.ts --hedge

# Production (buys + armed hedges):
$env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION='BUY_NARA_100_X_11_USDC_TEN_MIN'
$env:V4_LIVE_TEN_MIN_HEDGE_CONFIRMATION='HEDGE_SELL_ON_BIG_EXTERNAL_BUY'
npx tsx scripts/matrix/runV4LiveTenMinBuyMatrixWithBigBuyHedge.ts --execute --hedge
```

---

## Two-sided stabilizer — Phase 1 shadow mode

The stabilizer observes the same canonical Hook event stream without signing or
sending anything. It does not load the general `.env` file, import an executable
matrix runner, read `PRIVATE_KEY`, or construct a signer. The PowerShell
launcher copies only an explicit public/read-only environment whitelist into
the child process. When `V4_STABILIZER_WALLET` is supplied, the runner
constrains simulations by that public address's balance at the trigger block;
otherwise it labels and uses the configured shadow inventory/budget.
When a watched address is configured, its own transactions are excluded from
the external-flow trigger set. Without one, origin is labeled unclassified.

- Trigger qualification is transaction-scoped. Hook actions in one transaction
  are summed first; five unrelated 20-USDC transactions do not satisfy a
  100-USDC threshold. Independently qualifying external transactions in the
  same block are then combined into one block-side diagnostic candidate.
- Pump diagnostic: an external NARA buy of at least
  `V4_PUMP_TRIGGER_USDC` (default 100 USDC) applies
  `V4_HEDGE_SELL_RATIO_BPS` (default 90%) to an end-of-trigger-block quote and
  marks selling the smaller of that amount, available watched inventory, and
  `V4_HEDGE_BUCKET_NARA`.
- Floor diagnostic: an external NARA sell worth at least
  `V4_DUMP_TRIGGER_USDC` (default 100 USDC at the pre-trigger mid) simulates a
  buy capped by `V4_DEFENSE_USDC_CAP` while preserving
  `V4_RESERVE_FLOOR_USDC` when a watched wallet is configured.
- Diagnostic verdict: `GO` means only that an independent historical mark
  reaches `V4_MIN_EDGE_BPS` (default 300 bps). It is explicitly scoped as
  `DIAGNOSTIC_MARK_ONLY`; every record separately carries
  `positiveEvVerdict: BLOCKED`, `activationVerdict: BLOCKED`, and
  `activationEligible: false`.
- Historical quotes use end-of-trigger-block state. They are not the observed
  trader's actual output and do not model the Hook's next-block pressure reset.
  An executable counterfactual requires a fork pinned after the trigger with an
  empty block mined before quoting.
- Independent candidates do not consume virtual inventory across the replay.
  Their edge marks must never be summed or described as realizable policy P&L.
  Floor edge is an unrealized recovery mark before exit fees, impact, gas,
  timing, and probability.
- Historical reads are block-pinned. If an RPC cannot serve one, the event is
  recorded as skipped; current-head state is never substituted.
- Every run records `sessionStarted` and `sessionSummary` entries even when no
  qualifying events occur. Canonical `schemaVersion: 2` binds chain, pool,
  manifest/config fingerprint, block hash, transaction hash, and log index.
  Schema v1 remains visible but is release-ineligible. Overlapping v2 replays
  are deduplicated by immutable observation identity. Watcher errors, scan gaps,
  malformed counters, and incomplete shutdowns exclude a session.
- Live shadow mode waits 20 confirmations by default. A range checkpoint is
  appended only after every log in that range has been processed, and shutdown
  waits for an active scan to finish.

```powershell
# Watch new blocks for 10 minutes (shadow only):
.\scripts\matrix\start-two-sided-stabilizer.ps1 -MaxSeconds 600

# Replay a bounded historical block window (shadow only):
.\scripts\matrix\start-two-sided-stabilizer.ps1 `
  -ReplayFromBlock 50468880 `
  -ReplayToBlock 50468925

# Safety proof: exits with PHASE 2 NOT ENABLED and sends nothing:
npx tsx scripts/matrix/runV4TwoSidedStabilizer.ts --live

# Summarize canonical sessions and deduplicated evidence (read-only):
npx tsx scripts/matrix/summarizeStabilizerShadow.ts

# Analyze +1/+3/+5/+10/+20 block persistence for one eligible session.
# Requires an archive-capable Base RPC in the public environment:
npx tsx scripts/matrix/analyzeStabilizerPersistence.ts `
  deployments/stabilizer-shadow.jsonl `
  <session-id>
```

### Positive-EV validation

The economic gate is separate from the historical mark:

- `stabilizerSwapFlow.ts` reconstructs the actual USDC/NARA input and output
  from canonical PoolManager `Swap` logs for the exact transaction and pool.
- `stabilizerVirtualPortfolio.ts` consumes a sequential virtual USDC/NARA path
  with explicit seeded inventory basis and FIFO lot accounting. It blocks
  balance reuse and refuses inventory whose basis is unknown.
- `stabilizerExpectedValue.ts` requires executable exit proceeds and residual
  value for probability-weighted scenarios totaling exactly 10,000 bps. Entry
  cost, entry gas, exit gas, and other costs are explicit atomic-USDC inputs.
  Its only verdicts are `POSITIVE_EV`, `NON_POSITIVE_EV`, and `BLOCKED`.
  Recovery marks are informational and never enter the calculation.
- `test/fork/NARAV4StabilizerNextBlock.fork.test.ts` is an opt-in read-only
  historical fork proof. It requires `V4_STABILIZER_ARCHIVE_RPC_URL`,
  `V4_STABILIZER_FORK_BLOCK`, `V4_STABILIZER_TRIGGER_BLOCK_HASH`,
  `V4_STABILIZER_TRIGGER_TX_HASH`, and
  `V4_STABILIZER_EXPECTED_TRIGGER_SIDE`. It pins the exact trigger block and
  hash, verifies the production runtime, reconstructs actual source output,
  mines one empty local-fork block, and quotes the defense from that next-block
  state. Without every input and an archive-capable provider it skips;
  current-head substitution is forbidden.
- `stabilizerHistoricalQuotes.ts` binds source-flow reconstruction and exact-
  input quotes to canonical block numbers and hashes. It rejects missing
  receipts, direction mismatches, reorgs, and unavailable historical state;
  it never retries against current head.
- `stabilizerHistoricalFloorEv.ts` applies fixed-horizon floor candidates to
  five separate sequential FIFO portfolios. Each starts with 350 USDC,
  preserves a 200 USDC reserve, caps entries at 150 USDC, reserves entry and
  exit gas, blocks overlapping capital, and never reuses inventory.
- `stabilizerGasModel.ts` provides the pure, unit-tested conservative gas-to-
  USDC conversion used by the historical screen.
- `test/fork/NARAV4StabilizerHistoricalFloorEv.fork.test.ts` is the opt-in
  floor-only historical screen. It quotes a fixed 148 USDC entry at the
  canonical block after each trigger and quotes the exact resulting NARA
  inventory at `+1`, `+3`, `+5`, `+10`, and `+20` blocks. Gas uses the larger
  of 350,000 units or twice the quoter estimate, the larger of twice the block
  base fee or 0.01 gwei, a 5,000 USDC/ETH conversion, and a 0.05 USDC Base L1
  data buffer per action.

These primitives make a positive-EV claim testable, but they do not create the
missing evidence. A `POSITIVE_EV` result still requires calibrated outcome
probabilities and block-pinned executable exit quotes, including gas and all
path-dependent inventory changes.

The floor-only screen is deliberately
`HISTORICAL_COUNTERFACTUAL_SCREEN`, not an EV proof. Canonical later blocks do
not contain the hypothetical defense entry or its pool-state impact. Therefore
the screen always reports `evidenceComplete: false`, `verdict: BLOCKED`, and
`executionAuthorized: false`, regardless of apparent historical P&L. Each
offset is a separate policy horizon, not a probability or an independent
sample. Its output retains the canonical identity, exact entry/exit quote and
gas, block/hash binding, admission decision and reason, portfolio snapshots,
and realized P&L for every candidate at every offset. Fewer than 30 admitted
episodes is explicitly labeled `BELOW_MINIMUM_SAMPLE_COUNT`; reaching that
count is only a factual threshold and does not claim statistical sufficiency.

Phase 2 remains blocked until a sequential shadow replay demonstrates
calibrated persistence and FIFO inventory economics, with cooldown/cascade
guards, loss limits, an explicit execution confirmation design, and a separate
deployment-specific review.

---

## How they work

Every script follows the same hardened pipeline:

1. **Preflight pinning (read-only).** Pins a Base block; verifies chain ID,
   signer == `V4_DEPLOYER`, every pinned v4 address via env config, runtime
   code hashes of token/vault/hook/PoolManager/USDC/Permit2/UniversalRouter/V4Quoter,
   hook pool registration, configured depth (300 USDC), active buy curve vs the
   expected seller-weighted policy curve, pool sqrtPrice/liquidity != 0, clean
   zero USDC allowances, wallet USDC ≥ count × amount, ETH ≥ gas floor.
2. **Quote.** Uses the official Base `V4Quoter.quoteExactInputSingle` at the
   pinned block. Builds Universal Router calldata:
   `V4_SWAP → SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL` with Permit2 settle.
3. **Protection.** `amountOutMinimum = quote − OUTPUT_TOLERANCE_BPS (10%)`;
   deadline = pinned block timestamp + 600 s.
4. **Pre-send simulation.** `router.execute.staticCall(...)` must succeed before
   any transaction is broadcast.
5. **Execution.** Gas estimated then sent with a +20% margin; receipt confirmed
   twice and validated canonical (block hash stable).
6. **Per-trade verification (the core value).** For every buy the script proves:
   - the trade mined in a **distinct strictly-later block**;
   - the exact `PoolFeeTaken` hook event (sender = Universal Router, amountIn exact);
   - the fee equals the **marginal reconstruction** from the policy curve applied
     to this block's _full prior buy flow_ (so third-party same-block flow is
     accounted, never assumed zero);
   - terminal bps tier matches the reconstructed curve position;
   - exactly one matching Vault `PoolFeeRecorded` event with identical amount/bps;
   - an exact PoolManager→Vault USDC transfer equal to the fee exists in the receipt;
   - wallet USDC delta is exactly the input; NARA received ≥ protected minimum;
   - Vault lifetime `totalBaseFeeRecorded` increased by exactly the event fee.
7. **Run-level reconciliation.** Sum of all event fees must equal the vault's
   lifetime fee delta over the whole run.
8. **Cleanup (finally).** Residual Permit2 / ERC20 USDC allowances are revoked
   even when the run aborts mid-matrix.
9. **Evidence.** Every trade appended to
   `deployments/v4-live-buy-tax-tenmin-100x11-latest.json` (per-trade hashes,
   blocks, fees, quotes, balances) and persisted after each trade, so partial
   runs always leave complete evidence.

---

## 2026-08-24 incident & fix (ten-min matrix)

### What happened

The first ten-min run aborted safely after trade **3 of 100**: the pre-send
simulation for trade 4 reverted. Root cause was **not** our tax math — a
third-party sell moved the pool price adversely (~5.7%) between our quote pin
and execution, pushing expected output below the 10% slippage protection floor.
The guard did exactly its job: no unprotected trade was sent.

The script's original behavior was single-shot: any simulation revert failed the
whole run. That is correct safety but poor operability for a 10-minute schedule
on a live pool where third-party flow is normal.

### What we changed (in `runV4LiveTenMinBuyMatrix.ts`)

1. **Simulation retry with fresh state re-pin.** Quote/build/simulate now runs
   inside a bounded loop (max **2 attempts**, hard cap):
   - Attempt 1 uses the originally pinned freshest block.
   - If the static-call simulation reverts, the script waits for a _strictly
     newer_ block than the pinned one, **re-quotes via the official V4Quoter at
     that new block**, rebuilds `amountOutMinimum` and all calldata from that
     fresh state, and re-simulates.
   - Only if attempt 2 also reverts does the buy fail the run. No attempt ever
     widens slippage or loosens any other check.
2. Removed the unused `hook.quotePoolFee` pre-quote (the executed truth comes
   from the `PoolFeeTaken` event reconstruction) and its log field.
3. Cosmetic: split an accidentally merged error-check line.

### Result

The resumed run (`V4_TEN_MIN_BUY_COUNT=97`) completed **97/97 trades, PASS**:

- Every trade: `hookFeeUsdc = 0.33`, `terminalFeeBps = 300`,
  `matchedBaseline = true`, zero baseline mismatches.
- Totals: spent 1,067.00 USDC → received 8,434.60 NARA; hook fees 32.01 USDC ==
  baseline expectation 32.01 == vault delta 32.01.
- Allowance cleanup: empty (nothing left to revoke).

Combined with the earlier partial run, the approved 100-buy matrix is fully
executed as 3 + 97 trades across two evidence runs.

### Operational lesson for future runs

A simulation revert on a live pool is usually **stale state, not broken math**.
The re-pin-and-retry pattern here is the template: re-quote from a strictly
fresher block, rebuild protection, simulate again — never loosen the guard.

---

## Running them (cold AI checklist)

### Two run modes (one-command launchers)

| Version             | Launcher                                          | Hedge behavior                                |
| ------------------- | ------------------------------------------------- | --------------------------------------------- |
| **1 — BUY ONLY**    | `scripts\matrix\start-tenmin-buys-only.ps1`       | never armed                                   |
| **2 — BUY + HEDGE** | `scripts\matrix\start-tenmin-buys-with-hedge.ps1` | armed in execute mode, dry-run in `-ReadOnly` |

Both launchers fail fast with the exact missing-confirmation instruction when
production gates are not satisfied, and support `-Count <n>` for resume and
`-ReadOnly` for preflight/dry-run. The underlying scripts also work directly
via `npx tsx ...` exactly as documented below (`--hedge` is the master switch
on the hedge runner: omit it and it is a pure buy matrix).

### Instant mode (`--instant` / `-Instant`)

Speed-optimized hedging, execute+armed only (read-only ignores it):

- **Detection:** ~250 ms background watcher; WebSocket push via
  `BASE_WS_RPC_URL` triggers an immediate scan (~100–300 ms) — poll stays as
  fallback. Measured end-to-end hedge latency target: **1 block (~2 s)** vs
  ~38 s standard.
- **Zero approval txs in the hot path:** one standing Permit2 NARA→Router
  approval is set at run start (`V4_STANDING_NARA_CAP`, default 25 000 NARA,
  clamped to balance, 2 h expiry) and revoked by the normal cleanup. The
  standing grant is preserved-flagged in evidence like any other pre-existing
  approval.
- **Quiet-gate bypass:** first whale event is immediately actionable. A whale
  splitting into many txs may produce several smaller hedges instead of one
  aggregated sell — usually worse fee-wise; keep `HEDGE_QUIET_BLOCKS` behavior
  (omit `--instant`) when bursts are expected.

```powershell
cd nara-protocol-hardhat

# Read-only preflight (default; sends nothing):
$env:V4_TEN_MIN_BUY_COUNT='97'
npx tsx scripts/matrix/runV4LiveTenMinBuyMatrix.ts

# Production execution requires BOTH the flag and the confirmation string:
$env:V4_LIVE_TEN_MIN_BUY_CONFIRMATION='BUY_NARA_100_X_11_USDC_TEN_MIN'
npx tsx scripts/matrix/runV4LiveTenMinBuyMatrix.ts --execute
```

Hard rules baked into the scripts (do not bypass):

- **Read-only unless both gates present.** No `--execute`, or wrong confirmation
  string ⇒ throws before anything stateful.
- **Never print or infer keys.** `PRIVATE_KEY` comes from `.env` only; the
  preflight prints `"loaded locally; never displayed"`. Signer must equal
  `V4_DEPLOYER` or it aborts.
- **Immutable pins.** Addresses, pool id, LP token id, fee/tickSpacing, runtime
  code hashes, depth, and curve are asserted exactly; any drift aborts.
- **Budget guard.** Wallet must hold `count × 11 USDC` before approvals.
  Seeing `Wallet has less than the approved ... budget` means the count is too
  high for current balance (or buys already happened) — lower
  `V4_TEN_MIN_BUY_COUNT` accordingly. This error is expected in read-only mode
  after the completed 2026-08-24 runs.
- **Distinct-later-block enforcement.** A buy mined in a block ≤ the previous
  trade's block fails the run.
- **Allowance hygiene.** Approvals are sized to the exact run budget and revoked
  in `finally`; clean-zero allowances are asserted in preflight.

### Resume procedure (partial-run recovery)

If a run aborts at trade N of C:

1. Check `deployments/v4-live-buy-tax-tenmin-100x11-latest.json` — `status`,
   completed `trades[]`, `error`, `cleanup` are always persisted.
2. Confirm allowances were cleaned (preflight asserts zero anyway).
3. Relaunch with `V4_TEN_MIN_BUY_COUNT=<remaining>` and the same confirmation
   env. The schedule restarts cleanly; evidence accumulates across runs.

### Evidence locations

- Per-run evidence JSON: `deployments/v4-live-buy-tax-tenmin-100x11-latest.json`
  (overwritten per invocation — archive before re-running if you need history).
- Console log lines are JSON per trade (`verifiedTax`, tx hash, block, fee,
  reconstruction, balances) plus the final `{ status, outputPath }`.

### Environment

- RPC: `BASE_MAINNET_RPC_URL` (then `BASE_RPC_URL`) from `.env` — never print values.
- Chain: Base mainnet (8453) only, enforced.
- `tsx` is the runner; `tsc --noEmit` must stay clean for these files.

### Workspace-rule reminders for cold agents

- These scripts perform production writes **only** with explicit human approval
  (`--execute` + confirmation env). AI agents otherwise stay read/report-only.
- Do not edit core contracts (`NARAEngine.sol`, `NARAPositionNFTV4.sol`, the
  hook/vault) to make a matrix pass; fix the harness instead, as done here.
- Treat generated evidence JSONs as integration source of truth for what
  actually executed onchain.
