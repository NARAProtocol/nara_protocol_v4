# NARA V5 Hook Implementation and External-Review Disposition

Date: 2026-08-01

Change-ID: `NARA-20260801-v5-hook-redesign`

Status: **local tested complete-stack contract candidate; not deployed;
production activation blocked**

This document records the Hook-first V5 implementation, the selected local
complete-stack contract candidate, and the disposition of the reviews received
on 2026-08-01. It is not a production approval or independent audit. A fresh
Token, Reserve, Engine, canonical position stack, selected modules/periphery,
Vault, named-POL custody, no-swap Compounder, phase Controller, seed initializer,
Uniswap V4 position adapter, CREATE2 factory, and offline deterministic
deployment planner now exist locally. They are undeployed, unapproved, and not
an immutable release. Protected router/Quoter/basket integration and an actual
deployment rehearsal remain open.

## Approved fee policy

The user selected a symmetric fee on gross input and actual AMM output. The fee
curve is frozen in source and cannot be configured to another sequence:

| Phase     | Each leg | Nominal hook-only effective toll | With 0.30% LP fee, before impact |
| --------- | -------: | -------------------------------: | -------------------------------: |
| Bootstrap |   15.00% |                         27.7500% |                        27.96675% |
| 1         |   12.50% |                         23.4375% |                      23.6671875% |
| 2         |   10.00% |                         19.0000% |                         19.2430% |
| 3         |    7.50% |                         14.4375% |                      14.6941875% |
| 4         |    5.00% |                          9.7500% |                        10.02075% |

The 15% + 15% Bootstrap rate is therefore 30 nominal percentage points but a
27.75% sequential hook toll. It is intentionally not a 15% total toll. The
external suggestion of approximately 7.8046% per leg applies only if policy is
changed to a 15% total effective hook toll.

The parameter-neutral reserve multiples, fee ceilings, and human inputs needed
to derive the five absolute named-POL thresholds are recorded in
[NARA_V5_DEPTH_ECONOMICS_2026-08-01.md](NARA_V5_DEPTH_ECONOMICS_2026-08-01.md).

Price impact, protocol fee state, gas, MEV, and external-venue costs are not
included in this table. V4Quoter exact-input simulation calls the Hook and its
returned `amountOut` is therefore already the post-Hook **net output**, including
the actual-output leg. A protected route must derive slippage protection directly
from that net quote and must never apply the output fee again. The local unsigned
plan builder encodes SwapProtection V1 and enforces this rule, but approved
Quoter/Universal Router addresses, calldata construction, and product integration
remain production gates. The aggressive Bootstrap policy remains a launch-blocking
economic simulation risk even though its implementation is intentional and exact.

## What the Hook now enforces

- One exact canonical NARA/base PoolKey, 0.30% static LP fee, tick spacing 60,
  exact opening price, opening tick, and CREATE2 permission bits.
- Exact-input, full-fill swaps only. Exact-output, partial fills, nested active
  callbacks, malformed deltas, and below-minimum input/output revert atomically.
- The fixed symmetric phase sequence `1500 -> 1250 -> 1000 -> 750 -> 500` bps.
- Four immutable, strictly increasing active-POL thresholds included in the
  phase policy hash. Their production values remain unapproved.
- The current phase's active-POL floor is rechecked before every swap, not only
  at activation or phase advancement. Reported POL above total live pool
  liquidity is rejected.
- Separate immutable raw minimums for NARA and base. Each must be at least
  10,000 raw units, bounding ceiling-rounding uplift below one basis point per
  leg and below two basis points sequentially.
- Versioned swap protection with minimum accepted phase, per-leg cap, nominal
  combined cap, deadline, phase-policy hash, and minimum net output. A later
  beneficial fee decrease does not invalidate a quote. Empty hook data remains
  an explicit opt-out and must not be used by supported production routes.
- Both fee legs accrue as exact PoolManager ERC-6909 claims to the bound Vault.
  Preexisting claim donations are tolerated but are not counted as swap fees.
- `recordSwapFees` is synchronous and fail-closed. A Vault failure or attempted
  claim movement reverts the swap and both claim mints.
- In Shared mode, the Vault makes one O(1), transfer-free Engine call during
  `recordSwapFees` so active/inactive entitlement is frozen at swap accrual.
  Later PoolManager-claim redemption only backs that recorded entitlement.
- Companion runtime hashes, reciprocal bindings, sealed-configuration flags,
  and configuration hashes are checked and pinned. This is defense in depth;
  it does not make proxies safe.
- One-way retirement and transient-context rollback, including a caught failed
  partial fill followed by a successful retry in the same transaction.

## The old fixed-300-USDC defect

V5 fee math has no `protocolDepth[USDC] = 300` or corresponding fixed NARA
calibration. A live regression changes an isolated pool's USDC balance from 125
to 725 across blocks while fee claims continue to reconcile exactly.

Three quantities must never be conflated:

1. PoolManager ERC-6909 fee claims owned by the Vault.
2. Redeemed but not yet deployed NARA/base ERC-20 balances.
3. Active liquidity in exact designated, protocol-owned, recovery-locked LP
   positions.

Only item 3 may satisfy a phase milestone. Total pool balance, spot-price-driven
reserve value, third-party/JIT liquidity, claims, loose tokens, and banked
compounder assets do not qualify.

## Fee routing and later Engine share

The Hook always accrues both currencies to one bound Vault. Routing belongs in
the Vault/Controller layer so the Hook does not need replacement when the
flywheel changes state.

Required one-way state machine:

`Unbound -> BootstrapLiquidity -> Shared -> Retired`

- `BootstrapLiquidity`: 100% of both NARA and base fee claims are permanently
  classified for liquidity; no keeper bounty is taken from them.
- `Shared`: one immutable, human-approved percentage of fees accrued after the
  transition is classified for the fresh V5 Engine, identically for both
  currencies; the remainder stays liquidity-classified. The Vault synchronously
  calls `accrueLiquidityFees` so eligibility and reward index are fixed before
  any later locker can enter. The Engine's permissionless and claim-internal
  `syncLiquidityFeeBacking` pulls all corresponding claims from the Vault in one
  exact reconciliation; funding never resamples weight.
- Bootstrap fees cannot be retroactively reclassified.
- Split allocation must use cumulative telescoping per currency so transaction
  splitting cannot change the Engine share and rounding dust stays liquidity.
- A controller-verified first POL milestone atomically advances the Hook phase
  and activates the shared route. Observations cannot start before Hook
  activation and are cleared when retirement is proposed.
- The Engine share `X` is not approved yet. There is no 100%-Engine escape hatch
  and no arbitrary owner-selectable route mode.

The dedicated receiver surface is
`contracts/v5/interfaces/INARALiquidityFeeEngineV5.sol`. The local Engine
credits NARA and base explicitly at accrual time. If its processed epoch is
stale or eligible weight is below the immutable minimum, that fee share is
irrevocably earmarked for the immutable inactive recipient; it is never queued
for a later locker. This fail-safe preserves swap liveness and prevents expired
weight from capturing fees, but the recipient and policy still require human
approval. Do not reuse the deployed V4 Engine, which is retained only as a
recovery/retirement source, or its `syncEmissionReserve()`/generic
token-notifier surfaces.

## External-review disposition

| #   | Review claim                                                               | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Companion codehash does not prove immutability                             | **Valid release blocker; local companions implemented.** Sealed configuration hashes and post-call checks detect persistent drift. The local direct companions are non-proxy and one-way sealed, while the offline planner pins runtime/configuration evidence. Production must still independently match immutable artifacts and reject proxy/delegatecall shapes. External dependencies that are proxies require implementation/admin/beacon-slot evidence in addition to shell codehash. |
| 2   | Controller scalar does not prove owned/locked/useful POL                   | **Fixed in the local candidate.** The Controller derives the bounded sum from exactly two named PositionManager NFTs and verifies owner/custody, canonical pool, approved range, in-range activity, recovery lock, observation policy, and live position liquidity. Third-party/JIT liquidity, loose tokens, Vault claims, and banked assets do not count. Production threshold/window values remain unapproved.                                                                            |
| 3   | Bootstrap friction is about 28%                                            | **Math correct; approved policy, not a code defect.** It remains an economic launch gate because it may widen arbitrage bands, weaken price discovery, reduce organic volume, and slow POL growth.                                                                                                                                                                                                                                                                                          |
| 4   | Scalar hook-data cap is misleading                                         | **Fixed.** The legacy 32-byte scalar is rejected. V1 protection separately names per-leg and nominal-combined caps and adds deadline, phase floor, policy hash, and minimum net output.                                                                                                                                                                                                                                                                                                     |
| 5   | Mandatory Vault accounting can halt swaps                                  | **Valid accepted fail-closed dependency, narrowed and tested.** `recordSwapFees` is direct/non-proxy, only-Hook, non-pausable while active, and O(1). In Shared mode it intentionally has one state-changing downstream dependency: transfer-free Engine accrual accounting. That call performs no epoch mutation, loop, token transfer, oracle read, or claim redemption. A failure reverts the swap.                                                                                      |
| 6   | Exact-input/full-fill behavior restricts composability                     | **Valid deliberate execution profile.** It is not a fund-drain bug. Permit2 and real PositionManager paths are Base-fork tested. Protected Universal Router, V4Quoter, basket, multi-action, price-limit, and retry coverage still remain production gates.                                                                                                                                                                                                                                 |
| 7   | One raw minimum is decimal-dependent                                       | **Fixed.** NARA and base have separate immutable raw minimums; human-readable production values remain unapproved deployment inputs.                                                                                                                                                                                                                                                                                                                                                        |
| 8   | Ceiling rounding can exceed nominal percentages                            | **Correct but bounded and intentional.** Uplift is less than one raw unit and one bp per leg for supported amounts, and less than two bps sequentially. Ceiling rounding is retained so splitting cannot lower fees.                                                                                                                                                                                                                                                                        |
| 9   | Delayed Engine processing lets a later locker capture earlier fees         | **Fixed.** Eligibility and reward index are frozen synchronously at swap accrual. Funding later pulls all exact backing and never resamples weight.                                                                                                                                                                                                                                                                                                                                         |
| 10  | Pending backing can let a dust swap starve claims                          | **Fixed.** Every NARA/base claim atomically pulls and reconciles all pending backing before payment, so a preceding small swap increases the same transaction's funding work rather than denying the claim.                                                                                                                                                                                                                                                                                 |
| 11  | Existing-position compounding can revert on positive accrued LP-fee deltas | **Fixed.** The adapter first harvests fees with a zero-liquidity `INCREASE_LIQUIDITY + TAKE_PAIR`, measures them separately, then adds new principal with debt-only `SETTLE_PAIR`. Compounder balance equations reconcile principal and harvested fees independently.                                                                                                                                                                                                                       |

## Invariant status

The mock and real-PoolManager suites currently prove:

1. wallet input decreases by gross input;
2. AMM specified input equals gross input minus input fee;
3. wallet output increases by actual gross output minus output fee;
4. Vault claims rise by exactly both charged fees;
5. phase fees can only follow the fixed downward sequence;
6. phase advancement during an active swap fails specifically on the transient
   active-swap guard even when the next POL threshold is satisfied;
7. retirement cannot reverse;
8. failed/partial callbacks leave no reusable transient context or claims;
9. Vault failure, claim movement, and persistent in-callback configuration drift
   revert all accounting atomically;
10. preexisting claim donations do not enter swap-fee counters;
11. V1 protected hook data settles through the real PoolManager test router;
12. only exact named, protocol-owned, in-range, recovery-locked PM NFTs count as
    active POL;
13. phase observations cannot begin before activation and are cleared on a
    retirement proposal;
14. Engine fee eligibility is fixed at swap accrual, a later locker cannot
    capture historical fees, and stale epochs route inactive without halting the
    Hook;
15. a reward claim atomically self-funds all pending backing even after a final
    dust accrual;
16. accrued LP fees larger than new principal do not brick compounding; and
17. the one-hour Base-fork retirement synchronizes Engine claims, moves both
    named NFTs to recovery, fully removes them, and leaves active pool liquidity
    at zero.

The complete production router/basket matrix, long-sequence economic/MEV
simulation, and fuzzed Vault/Engine pending-equality invariants are still open.

## Current evidence

- Focused Hook V5 mock + real-PoolManager tests: 48 passing.
- All selected `test/v5/` unit, integration, release-gate, and deployment-planner
  tests: 102 passing. This now includes the terminal NFT-bond lifecycle, a real
  Engine protected purchase/unlock and stale-Engine atomic rollback, plus
  exhaustive deterministic bond lattice and price-floor arithmetic checks.
- Real PoolManager covers buys, sells, both token orderings, every phase from
  15% through 5% per leg, protected hook data, a non-300-USDC seed, and a fee
  claim larger than the PoolManager's pre-settlement token balance.
- Final Base fork: 2 passing. It covers real Base PoolManager, PositionManager,
  Permit2, real local Engine/Reserve and Vault Shared routing, seed and compounder
  NFTs, inactive Engine backing, LP-fee harvesting, recompounding, exact
  receipt-block recovery deltas, one-hour retirement, full removal of both NFTs,
  zero active pool liquidity, and decoded Hook retirement rejection.
- Existing V4 liquidity regression: 29 passing.
- The real stale-epoch regression keeps a Hook/Vault/Engine swap live with
  otherwise eligible weight, freezes both fee currencies inactive, prevents
  later-locker capture, and routes exact backing to the inactive recipient.
- A deterministic mixed-sequence invariant keeps Vault Engine claims equal to
  Engine active plus inactive pending buckets after every record, through claim
  self-sync and retirement sync, and clears every bucket.
- The unsigned protected-swap builder passes 8 focused tests. It binds route and
  protection inputs and derives `minimumNetOutput` from V4Quoter's already-net
  output; the 15% regression proves the output fee is not applied twice.
- Final reviewed liquidity runtime sizes: Engine 17,121; Hook 15,385; Vault
  10,949; Compounder 13,429; PhaseController 12,851; SeedCustody 4,380;
  SeedInitializer 10,067; PositionAdapter 10,728 bytes. Each is below the
  24,576-byte EVM runtime limit.
- Focused Slither 0.11.5 analysis compiled all 25 production V5 targets using
  pinned solc 0.8.34 and the deployment compiler settings. The Hook returned
  zero results; manual Medium/High triage found no actionable defect. This is
  local engineering evidence, not an independent external audit.
- The earlier 566/1 aggregate stamp predates this complete candidate and is not
  a current full-suite result. Its live-fork fixture expected a now-empty
  historical treasury EOA to hold NARA.
- No deployment, transaction, address, ABI handoff, or downstream repository
  update was performed.

## Production blockers

1. Freeze exact POL thresholds, observation windows, ranges, per-asset immutable
   and per-call usage floors, opening price/seed, compounding policy, minimum
   reward weight, inactive recipient, and Shared Engine share `X` through human
   decision evidence and economic simulation.
2. Freeze V5 supply, allocation, V4-holder treatment, module scope, bond terms,
   Safe/timelock roles, recovery identities, and deployment execution window.
3. Fork-test every supported router/adapter with V1 protection and define
   exact-input/full-fill behavior in UI and integration documentation. The
   current basket V1 adapter forces empty route/Hook data, the basket app still
   reads removed V4 depth methods, and the basket fee collector uses V4 Engine
   selectors. Do not patch that consumer from this uncommitted tree: after an
   immutable protocol origin, hand off a V2 adapter that requires V1 protection,
   update quotes to consume V4Quoter's already-net output, and separately freeze
   the basket-fee routing policy. The existing basket manager can already
   forward arbitrary per-swap data.
4. From one immutable origin commit, finalize independently reviewed runtime
   hashes, Hook mining nonce, nested PositionAccount address/hash, external
   dependency runtime and proxy-slot evidence, full action DAG, and atomic final
   activation Safe batch. The local offline planner is not a signed payload.
5. Run economic/MEV, gas, long-sequence, invariant/fuzz, independent audit, and
   monitor/incident/soak gates against that immutable candidate.
6. Run the actual disposable complete-stack deployment at exactly one hour,
   retire it with receipt-block evidence and denylist every address, then deploy
   a separate production stack with seven-day-or-longer sealed recovery.

The Hook taxes only its canonical pool. It cannot tax an alternate Uniswap
pool, Aerodrome pool, OTC transfer, or another venue. Any product claim must say
"canonical-pool fee," not protocol-wide transfer tax.
