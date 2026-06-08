# NARA Protocol Docs

Last updated: 2026-06-08.

Primary protocol docs live in this folder. Code and deployment scripts are the source of truth.

## ⭐ Start here (cold-start path)

1. **[NARA_V4_PROJECT_SCOPE.md](NARA_V4_PROJECT_SCOPE.md)** — whole-project map: five pillars, layer
   model, build-vs-reveal order, exact status of every contract, audit-corrections log.
2. **[V4_CONTRACT_INDEX.md](V4_CONTRACT_INDEX.md)** — every active v4 contract → purpose → deploy step.
3. **[CURRENT_STATE.md](CURRENT_STATE.md)** — canonical live state (source of truth).
4. **[UNISWAP_V4_HOOK.md](UNISWAP_V4_HOOK.md)** — the Uniswap v4 hook deep-dive (`0x2088`, asymmetric
   fee curves, anti-gaming, vault routing).
5. **[NARA_V4_ECONOMIC_LAUNCH_ROADMAP.md](NARA_V4_ECONOMIC_LAUNCH_ROADMAP.md)** — launch order + economics.

The repo [`../README.md`](../README.md) is the front door; [`../SECURITY.md`](../SECURITY.md) is the
disclosure policy.

## 🚨 v4 Reset — 2026-05-27

v3 is retired. All v3-specific docs (lotto, arena, sponsor hub, NFT wrapper explainers, v3 deployment handoffs) were moved to `../archive/legacy-v3/docs/`. Do not reference them as active docs.

## Current v4 Sources

**State and planning:**
- `CURRENT_STATE.md` — canonical live protocol state (read first)
- `ROADMAP.md` — product direction
- `PRD.md` — product requirements
- `V4_LAUNCH_CHECKLIST.md` — pre-launch gates
- `V4_NEXT_SESSION_HANDOFF.md` — latest work-in-progress handoff
- `V4_OPPORTUNITY_GAPS.md` — identified gaps and opportunities

**Deployment and operations:**
- `V4_DEPLOYMENT_HANDOFF.md` — deployment reference
- `V4_REDEPLOY_NO_SURPRISE_PLAN.md` — clean redeploy guide
- `ENGINE_OPS_RUNBOOK.md` — engine operational procedures
- `NARA_CUSTODY_AND_RECOVERY.md` — custody and recovery procedures
- `LOCAL_TESTING.md` — local test environment setup

**Technical references:**
- `EMISSION_MECHANICS.md` — emission model documentation
- `LOCK_APY_REFERENCE.md` — lock APY calculations
- `COMPOSABILITY_AUDIT_CHECKLIST.md` — composability security checklist
- `V4_BUILD_PLAN_COMPOSABILITY.md` — composability layer build plan
- `V4_POSITIONING.md` — protocol positioning

**Messaging and product:**
- `BEGINNER_MESSAGING.md` — onboarding copy and messaging
- `NARRATIVE_PLAYBOOK.md` — narrative and positioning playbook
- `NARA_MASTER_CONTEXT.md` — consolidated protocol context (verify v4 accuracy before using)
- `APPS.md` — app references (frontends need v4 ABI rebuild — not end-to-end functional yet)

## Historical and Research References

- `V4_AUDIT_RESPONSE_2026-04-23.md` — response to April 2026 audit
- `V4_INCIDENT_REDEPLOY_2026-04-23.md` — incident stack notes (retired addresses)
- `research/TECHNICAL_SPEC.md`
- `research/COMPOSABILITY_CASCADE_REPORT.md`
- `research/DEGEN_BOARD_STRATEGY.md`
- `research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md`
- `research/SERVICE_MONETIZATION_INVESTIGATION_2026-05-05.md`

## Archived v3 Docs

All v3-specific docs are in `../archive/legacy-v3/docs/`. They are read-only reference material. Do not update them or link to them from active v4 documentation.

## Notes

- The repository root `../README.md` remains the canonical repo readme for tooling and onboarding.
- The protocol guidance file remains `../CLAUDE.md`.
- The workspace-level guidance file remains `../../CLAUDE.md`.
