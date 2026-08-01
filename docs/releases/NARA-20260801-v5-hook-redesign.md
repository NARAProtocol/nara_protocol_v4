# NARA-20260801-v5-hook-redesign

> **Change-ID scope — read before assembling any payload.** This file is the
> record of the Hook-redesign **workstream**. It is not the release Change-ID.
>
> The canonical release Change-ID is
> **`NARA-20260801-v5-complete-stack-reset`**, which is what
> `docs/NARA_V5_DEPLOYMENT_DECISION_RECORD.md` declares and what
> `scripts/v5/lib/v5ReleaseGate.ts` pins as `V5_CHANGE_ID`. A configuration
> whose `changeId` is `NARA-20260801-v5-hook-redesign` is **rejected** by the
> gate with "unexpected V5 change ID".
>
> Use `NARA-20260801-v5-complete-stack-reset` for every gate configuration,
> Safe payload, manifest, and downstream handoff. Cite this file only as
> workstream evidence.

Status: local complete-stack V5 contract candidate implemented and verified;
not an immutable release origin; not deployed; production activation blocked.

Origin repository: `https://github.com/NARAProtocol/nara_protocol_v4.git`

Working branch: `feat/v5-hook-redesign-20260801`

Base commit before this working-tree change:
`451eaa6310512158e03eb57955dd6e0ee06d2629`

Origin commit: not yet created. This dirty working tree is not an immutable
release origin and must not be consumed by baskets, monitor, public docs, or any
other downstream repository. No ABI/address/manifest handoff is authorized.

## Scope

- fresh V5 Token, Reserve, Engine, canonical position stack, selected modules,
  periphery, Hook, Vault, named-POL custody, no-swap Compounder, phase
  Controller, seed initializer, real Uniswap V4 position adapter, and CREATE2
  factory;
- deterministic offline 22-component deployment planner with CREATE2 root,
  Hook nonce, runtime/artifact, nested account, external dependency,
  execution-window, action-DAG, and atomic activation commitments;
- focused mock, complete-stack, and real Uniswap V4 PoolManager/Base-fork tests;
- approved symmetric per-leg fee curve:
  `15% -> 12.5% -> 10% -> 7.5% -> 5%`;
- dual-leg input/actual-output ERC-6909 claim accounting;
- active-POL phase checks without a fixed `300 USDC` depth;
- versioned swap protection, exact-input/full-fill restrictions, transient
  callback state, fail-closed Vault accounting, and one-way retirement; and
- accrual-time Engine eligibility and exact later backing, stale-epoch inactive
  routing, observation-lifecycle hardening, per-asset seed/compound floors, and
  separate LP-fee harvest before existing-position principal; and
- V5 plan, decision record, cold handoff, implementation review, and
  current-state corrections.

## External-review disposition

The 2026-08-01 reviews were not dismissed wholesale. Their delayed Engine
entitlement, claim-starvation, stale-epoch Hook-liveness, preactivation phase
observation, and accrued-LP-fee settlement findings were reproduced and fixed.
The bootstrap-friction arithmetic is correct but describes the explicitly
approved economic policy, not a hidden implementation defect. Hook-data
structure and per-currency minima were fixed; ceiling rounding is bounded and
intentionally retained; exact-input/full-fill and synchronous Vault/Engine
accrual accounting are deliberate fail-closed execution constraints.

Configuration hashes are defense in depth only. They cannot make an upgradeable
proxy or mutable companion safe. Production companions must be direct,
non-upgradeable, irreversibly sealed contracts, and deployment tooling must
independently verify reviewed runtime code and a documented static hash schema.

## Local verification

- `npm run test:hook:v5`: 48 passing, 0 failing.
- all selected files under `test/v5/`: 83 passing, 0 failing.
- Base fork: 2 passing, 0 failing. It covers real Base PoolManager,
  PositionManager, Permit2, real local Engine/Vault Shared routing, LP-fee
  harvest, recompound, retirement Engine sync, exact recovery deltas, both NFT
  removals, and zero final active pool liquidity.
- Real PoolManager coverage includes both token orderings, buy/sell settlement,
  all five fee phases, protected Hook data, a non-300-USDC seed, and a fee claim
  above the Manager's pre-settlement token balance.
- `npm run test:liquidity:v4`: 29 passing, 0 failing after final Hook changes.
- Final reviewed runtime bytes: Engine 17,121; Hook 15,385; Vault 10,949;
  Compounder 13,429; PhaseController 12,851; SeedCustody 4,380;
  SeedInitializer 10,067; PositionAdapter 10,728. All are below 24,576.
- Forced compilation of 130 Solidity files passed. Strict deployment-planner
  TypeScript, formatting, and 11/11 offline planner tests passed.
- Slither 0.11.5 compiled/analyzed all 25 production V5 targets with pinned solc
  0.8.34 and deployment settings. The Hook returned zero results; manual
  Medium/High triage found no actionable defect.
- Added real stale-Engine eligible-weight and mixed Vault/Engine backing
  regressions, plus an 8-test unsigned protected-swap planner that prevents
  V4Quoter output-fee double-discounting.
- The historical aggregate stamp of 566/1 predates this complete candidate and
  is not a current full-suite result.

These are local engineering results, not an audit, production-readiness claim,
or permission to deploy.

## Production blockers

1. Approve exact supply/allocation/holder treatment, custody/recovery roles,
   module scope, opening price/seed, trade minimums, per-asset seed/compound
   usage floors, POL thresholds/observations/ranges, inactive recipient,
   minimum reward weight, compound policy, and Engine share `X`.
2. Complete economic/MEV/gas/long-sequence simulations, fuzzed Vault/Engine
   pending-equality invariants, and independent review against an immutable
   origin commit.
3. Finish protected Universal Router, Quoter, basket, multi-action, monitoring,
   incident, and soak integration evidence.
4. Freeze exact runtime/configuration hashes, external proxy-slot/token
   evidence, Hook salt nonce, execution window, setup DAG, and atomic activation
   Safe batch into the reviewed manifest.
5. Deploy and fully retire a disposable one-hour stack with receipt-block
   evidence and an address denylist; then separately approve and deploy fresh
   production addresses sealed at seven days or longer.

## External state

No contract deployment, transaction, Safe payload execution, role change,
address publication, downstream repository update, or production write was
performed for this change.
