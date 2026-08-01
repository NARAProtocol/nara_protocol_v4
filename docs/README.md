# NARA Protocol — V4 Recovery / V5 Development Documentation

Current Solidity, verified deployment evidence, and `CURRENT_STATE.md` are the
sources of truth. Existing V4 deployment scripts are recovery/history tools and
must not be treated as V5 release instructions.

## ⭐ Start here

**Active liquidity reset:** read
[NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md)
before any reset, recovery, V5, pool, fee, or basket-activation work. It records
the executed Safe proposal, exact ETA, complete-stack V5 scope, and the manual
atomic v4 withdrawal rule.

1. **[NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md)** — read-first recovery state and resume algorithm.
2. **[CURRENT_STATE.md](CURRENT_STATE.md)** — canonical deployed state and evidence.
3. **[NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md)** — approved complete-stack V5 direction and unresolved decisions.
4. **[NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md](NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md)** — local tested, undeployed V5 Hook/complete-stack candidate and production blockers.
5. **[NARA_V5_DEPLOYMENT_DECISION_RECORD.md](NARA_V5_DEPLOYMENT_DECISION_RECORD.md)** — human approvals still required before rehearsal or production.
6. **[NARA_V5_DEPTH_ECONOMICS_2026-08-01.md](NARA_V5_DEPTH_ECONOMICS_2026-08-01.md)** — parameter-neutral fee ceilings, reserve multiples, and inputs needed for absolute POL thresholds.
7. **[NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md](NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md)** — old-V4 atomic withdrawal and retirement mechanics.

V4 architecture references such as `NARA_V4_PROJECT_SCOPE.md`,
`V4_CONTRACT_INDEX.md`, `SUPPLY_ALLOCATION.md`, and `UNISWAP_V4_HOOK.md`
describe deployed/recovery history. They do not define V5 allocation, Hook
economics, routing, or deployment.

## Technical references

| Doc | Purpose |
|-----|---------|
| [EMISSION_MECHANICS.md](EMISSION_MECHANICS.md) | Adaptive emission model |
| [LOCK_APY_REFERENCE.md](LOCK_APY_REFERENCE.md) | Lock weight + reward-rate reference math |
| [NARA_V4_NFT_POSITIONS.md](NARA_V4_NFT_POSITIONS.md) | Position NFT + clone account + Genesis spec |
| [NARA_V4_NFT_PRODUCTION_PLAN.md](NARA_V4_NFT_PRODUCTION_PLAN.md) | NFT renderer / metadata production plan |
| [ROUTER_LENS.md](ROUTER_LENS.md) | Router / dashboard lens / position-data lens; disabled BribeRouter reference |
| [V4_BUILD_PLAN_COMPOSABILITY.md](V4_BUILD_PLAN_COMPOSABILITY.md) | Composability layer (stNARA / SY / fractional) build plan |
| [NARA_V4_DASHBOARD_SPEC.md](NARA_V4_DASHBOARD_SPEC.md) | Frontend data spec (single-call lens, panels) |
| [NARA_V4_LOCK_USER_GUIDE.md](NARA_V4_LOCK_USER_GUIDE.md) | Locking guide: duration, weight, claiming, exits |

## Security & operations

| Doc | Purpose |
|-----|---------|
| [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md) | Composability security checklist |
| [NARA_CUSTODY_AND_RECOVERY.md](NARA_CUSTODY_AND_RECOVERY.md) | Custody and recovery procedures |
| [ENGINE_OPS_RUNBOOK.md](ENGINE_OPS_RUNBOOK.md) | Engine operational procedures |
| [REPOSITORY_MAINTENANCE.md](REPOSITORY_MAINTENANCE.md) | Mandatory engineering, verification, and cross-repository release procedure |
| [NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md) | Historical V4 launch sequence; not a V5 runbook |
| [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) | Historical V4 gates; do not run against V5 addresses |
| [NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md) | Read-first state for executed Stage 0, pending manual v4 recovery, and complete V5 redeployment |
| [NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md) | Canonical complete new token/engine/reserve/protocol/liquidity/integration V5 plan and decision gates |
| [NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md](NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md) | Undeployed V5 Hook/complete-stack implementation, review disposition, evidence, and production blockers |
| [NARA_V5_DEPLOYMENT_DECISION_RECORD.md](NARA_V5_DEPLOYMENT_DECISION_RECORD.md) | Explicit approved/unapproved parameter, custody, dependency, execution, and recovery fields |
| [NARA_V5_DEPTH_ECONOMICS_2026-08-01.md](NARA_V5_DEPTH_ECONOMICS_2026-08-01.md) | Parameter-neutral Hook/LP fee ceilings, reserve multiples, and concentrated-liquidity threshold method |
| [releases/NARA-20260801-v5-hook-redesign.md](releases/NARA-20260801-v5-hook-redesign.md) | Change-ID, local verification, immutable-origin status, downstream hold, and unresolved V5 production gates |
| [NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md](NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md) | Executed Stage-0 evidence and old-v4 liquidity withdrawal/retirement mechanics |
| [NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md](NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md) | Canonical findings #1–#5, remediations, evidence, and remaining deployment gates |
| [releases/NARA-20260729-v4-preseed-remediation.md](releases/NARA-20260729-v4-preseed-remediation.md) | Cross-repository handoff and publication gates for the current pre-seed remediation |
| [NARA_V4_BOND_OPENING_CRITERIA.md](NARA_V4_BOND_OPENING_CRITERIA.md) | Operator checklist before opening bonds |
| [LOCAL_TESTING.md](LOCAL_TESTING.md) | Local test environment setup |

## State & direction

| Doc | Purpose |
|-----|---------|
| [CURRENT_STATE.md](CURRENT_STATE.md) | Canonical live protocol state |
| [SUPPLY_ALLOCATION.md](SUPPLY_ALLOCATION.md) | V4 allocation history only; V5 allocation remains separately unapproved |
| [NARA_V4_PUBLIC_STATE.md](NARA_V4_PUBLIC_STATE.md) | V4 public-state history; `CURRENT_STATE.md` controls current wording |
| [ROADMAP.md](ROADMAP.md) | Product direction and phases |

---

The repo [`../README.md`](../README.md) is the front door; [`../SECURITY.md`](../SECURITY.md) is the
disclosure policy; [`../LICENSE`](../LICENSE) is MIT.
