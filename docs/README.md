# NARA Protocol — Documentation Hub (V5 Canonical & Frozen V4 Reference)

[CURRENT_STATE.md](CURRENT_STATE.md), [PROJECT_KNOWLEDGE_BASE.md](PROJECT_KNOWLEDGE_BASE.md), [ROADMAP.md](ROADMAP.md), [NARA_INVESTOR_QNA.md](NARA_INVESTOR_QNA.md), and [CRYPTOSLIP_PUBLIC_OVERVIEW_AND_LEGAL_FAQ.md](CRYPTOSLIP_PUBLIC_OVERVIEW_AND_LEGAL_FAQ.md) document the live **NARA V5** stack on Base Mainnet (`8453`, verified through Block `54,778,829`). `contracts/v4/` is permanently retired, frozen, and read-only (`npm run verify:frozen-v4`).

## V5 Canonical Documentation (Start Here)

| Document | Audience & Purpose |
|---|---|
| [CURRENT_STATE.md](CURRENT_STATE.md) | Live Base Mainnet V5 35-contract directory, Zero-Lock Fee Periphery, and supply custody (`Block 54,778,829`) |
| [PROJECT_KNOWLEDGE_BASE.md](PROJECT_KNOWLEDGE_BASE.md) | Complete V5 system guide: `1,000,000 NARA` fixed supply, `949,987 NARA` sealed reserve, `0.1 NARA` Grid, `5%` NFT market, and two-way Range Manager |
| [ROADMAP.md](ROADMAP.md) | Completed Base Mainnet V5 milestones (`S1..S9`, `LPD 25..37`, Zero-Lock Fee Periphery, 2-hour Pulse Keepers) and `Safe Nonce 10` launch readiness |
| [NARA_INVESTOR_QNA.md](NARA_INVESTOR_QNA.md) | Technical Q&A & FUD answers covering AMM fees, `99.9984%` supply seal, Range Manager, and multisig custody |
| [CRYPTOSLIP_PUBLIC_OVERVIEW_AND_LEGAL_FAQ.md](CRYPTOSLIP_PUBLIC_OVERVIEW_AND_LEGAL_FAQ.md) | Companion CryptoSLIP V3.2 architecture, 3-tier forensic visibility analysis, UTXO `slipId` genealogy, and 25-question legal FAQ |

---

## Historical V4 Reference Index (Retired & Frozen Stack)

1. [CURRENT_STATE.md](CURRENT_STATE.md) — canonical state, incident findings,
   remediations, verification evidence, and remaining release blockers.
2. [NARA-20260815-v4-liquidity-maintainer-activation.md](releases/NARA-20260815-v4-liquidity-maintainer-activation.md)
   — keeper authorization, guarded execution, receipt reconciliation, idle
   regression, heartbeat, and current schedule state.
3. [NARA-20260815-v4-epoch-maintainer-activation.md](releases/NARA-20260815-v4-epoch-maintainer-activation.md)
   — dedicated epoch keeper, bounded routine, heartbeat, and current schedule state.
4. [Compounder activation manifest](../deployments/v4-compounder-activation-2026-08-09.json)
   — current receipt-pinned Compounder validation, accounting, LP, and freeze
   state.
5. [NARA-20260809-v4-compounder-activation.md](releases/NARA-20260809-v4-compounder-activation.md)
   — dated Compounder activation evidence and remaining operational gates.
6. [Fresh v4 production activation manifest](../deployments/v4-production-activation-2026-08-09.json)
   — sanitized 2026-08-09 activation addresses, receipts, pool state, and
   historical activation checkpoint.
7. [NARA-20260809-v4-production-activation.md](releases/NARA-20260809-v4-production-activation.md)
   — dated activation handoff and tax-matrix evidence.
8. [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md) — historical
   2026-08-09 activation checkpoint; use `CURRENT_STATE.md` for current state.
9. [UNISWAP_V4_HOOK.md](UNISWAP_V4_HOOK.md) — v4 Hook fee and pressure semantics.
10. [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) — fresh-v4 deployment gates.
11. [NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md](NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md)
   — historical v4 findings and remediations.
12. [V4_CONTRACT_INDEX.md](V4_CONTRACT_INDEX.md) — v4 contract inventory.

The Treasury Range Manager is an **implemented, tested, and
internal-audit-remediated candidate only**. It has no deployed address or
production authority. Start with
[NARA-20260828-v4-treasury-range-manager.md](releases/NARA-20260828-v4-treasury-range-manager.md)
and
[NARA_TREASURY_RANGE_MANAGER_REMEDIATION_2026-08-30.md](security/NARA_TREASURY_RANGE_MANAGER_REMEDIATION_2026-08-30.md),
and do not update deployment-dependent downstream consumers until verified
deployment evidence exists. No independent external audit is claimed.

The fresh pool is activated, live tax evidence passed, and Compounder
validation/reconciliation/freeze and the bounded liquidity-maintainer cycle are
receipt-pinned as complete. This is not an overall production-readiness claim:
the epoch and liquidity maintainers are active under separate bounded roles, the
Engine lifecycle smoke is pending, and baskets remain preview-only.
The latest POL and epoch-maintainer evidence is
[NARA-20260827-v4-full-inventory-compound.md](releases/NARA-20260827-v4-full-inventory-compound.md)
and
[NARA-20260828-v4-epoch-maintainer-resilience.md](releases/NARA-20260828-v4-epoch-maintainer-resilience.md).

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
| [NARA_TREASURY_RANGE_MANAGER_V1.md](architecture/NARA_TREASURY_RANGE_MANAGER_V1.md) | Undeployed Safe-bound tactical range-manager architecture |

## Security and operations

| Document | Purpose |
|---|---|
| [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md) | Composability security checklist |
| [NARA_CUSTODY_AND_RECOVERY.md](NARA_CUSTODY_AND_RECOVERY.md) | Custody and recovery procedures |
| [ENGINE_OPS_RUNBOOK.md](ENGINE_OPS_RUNBOOK.md) | Engine operations |
| [REPOSITORY_MAINTENANCE.md](REPOSITORY_MAINTENANCE.md) | Engineering and release procedure |
| [NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md) | Historical launch mechanics; current checklist controls |
| [NARA_V4_LIQUIDITY_WITHDRAWAL_RUNBOOK.md](NARA_V4_LIQUIDITY_WITHDRAWAL_RUNBOOK.md) | Completed historical stack withdrawal evidence; never a current manifest |
| [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) | Active v4 release gates |
| [NARA_V4_BOND_OPENING_CRITERIA.md](NARA_V4_BOND_OPENING_CRITERIA.md) | Bond-opening operator checks |
| [LOCAL_TESTING.md](LOCAL_TESTING.md) | Local toolchain setup |
| [NARA_TREASURY_RANGE_MANAGER_THREAT_MODEL.md](security/NARA_TREASURY_RANGE_MANAGER_THREAT_MODEL.md) | Manager, builder, simulator, and settler threat model |
| [NARA_TREASURY_RANGE_MANAGER_STATIC_ANALYSIS.md](security/NARA_TREASURY_RANGE_MANAGER_STATIC_ANALYSIS.md) | Static-analysis evidence and unavailable-tool boundary |
| [NARA_V4_TREASURY_RANGE_SETTLER_RUNBOOK.md](runbooks/NARA_V4_TREASURY_RANGE_SETTLER_RUNBOOK.md) | Two-instance gas-only settlement operations |

The repository [README](../README.md) is the front door;
[SECURITY.md](../SECURITY.md) is the disclosure policy.
