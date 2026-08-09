# NARA — V4 Documentation

`contracts/v4/`, generated v4 artifacts, verified deployment evidence, and
[CURRENT_STATE.md](CURRENT_STATE.md) are authoritative. The experimental V5
stack and its release plans are deleted and must not be used as instructions.

## Start here

1. [CURRENT_STATE.md](CURRENT_STATE.md) — canonical state, incident findings,
   remediations, verification evidence, and remaining release blockers.
2. [Compounder activation manifest](../deployments/v4-compounder-activation-2026-08-09.json)
   — current receipt-pinned Compounder validation, accounting, LP, and freeze
   state.
3. [NARA-20260809-v4-compounder-activation.md](releases/NARA-20260809-v4-compounder-activation.md)
   — dated Compounder activation evidence and remaining operational gates.
4. [Fresh v4 production activation manifest](../deployments/v4-production-activation-2026-08-09.json)
   — sanitized 2026-08-09 activation addresses, receipts, pool state, and
   historical activation checkpoint.
5. [NARA-20260809-v4-production-activation.md](releases/NARA-20260809-v4-production-activation.md)
   — dated activation handoff and tax-matrix evidence.
6. [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md) — exact current
   checkpoint: activated pool and Compounder, disabled workflows, pending
   Engine lifecycle smoke, and preview-only baskets.
7. [UNISWAP_V4_HOOK.md](UNISWAP_V4_HOOK.md) — v4 Hook fee and pressure semantics.
8. [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) — fresh-v4 deployment gates.
9. [NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md](NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md)
   — historical v4 findings and remediations.
10. [V4_CONTRACT_INDEX.md](V4_CONTRACT_INDEX.md) — v4 contract inventory.

The fresh pool is activated, live tax evidence passed, and Compounder
validation/reconciliation/freeze is receipt-pinned as complete. This is not an
overall production-readiness claim: both recurring workflows are disabled, the
Engine lifecycle smoke is pending, and baskets remain preview-only.

## Technical references

| Document | Purpose |
|---|---|
| [NARA_V4_PROJECT_SCOPE.md](NARA_V4_PROJECT_SCOPE.md) | Whole-project v4 map |
| [EMISSION_MECHANICS.md](EMISSION_MECHANICS.md) | Adaptive emission model |
| [LOCK_APY_REFERENCE.md](LOCK_APY_REFERENCE.md) | Lock-weight and reward-rate reference math |
| [NARA_V4_NFT_POSITIONS.md](NARA_V4_NFT_POSITIONS.md) | Position NFT, account clone, and Genesis specification |
| [NARA_V4_NFT_PRODUCTION_PLAN.md](NARA_V4_NFT_PRODUCTION_PLAN.md) | NFT renderer and metadata plan |
| [ROUTER_LENS.md](ROUTER_LENS.md) | Router and lens surfaces; disabled BribeRouter reference |
| [V4_BUILD_PLAN_COMPOSABILITY.md](V4_BUILD_PLAN_COMPOSABILITY.md) | Optional v4 composability components |
| [NARA_V4_DASHBOARD_SPEC.md](NARA_V4_DASHBOARD_SPEC.md) | Frontend data specification |
| [NARA_V4_LOCK_USER_GUIDE.md](NARA_V4_LOCK_USER_GUIDE.md) | Locking, claiming, and exit guide |

## Security and operations

| Document | Purpose |
|---|---|
| [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md) | Composability security checklist |
| [NARA_CUSTODY_AND_RECOVERY.md](NARA_CUSTODY_AND_RECOVERY.md) | Custody and recovery procedures |
| [ENGINE_OPS_RUNBOOK.md](ENGINE_OPS_RUNBOOK.md) | Engine operations |
| [REPOSITORY_MAINTENANCE.md](REPOSITORY_MAINTENANCE.md) | Engineering and release procedure |
| [NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md) | Historical launch mechanics; current checklist controls |
| [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) | Active v4 release gates |
| [NARA_V4_BOND_OPENING_CRITERIA.md](NARA_V4_BOND_OPENING_CRITERIA.md) | Bond-opening operator checks |
| [LOCAL_TESTING.md](LOCAL_TESTING.md) | Local toolchain setup |

The repository [README](../README.md) is the front door;
[SECURITY.md](../SECURITY.md) is the disclosure policy.
