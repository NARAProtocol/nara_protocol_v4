# Docs Location Rule

Save all new protocol and operations markdown docs in this folder:

- `nara-protocol-hardhat/docs/`

Last updated: 2026-05-28.

Current v4 documentation source of truth starts with:

- `CURRENT_STATE.md`
- `PRD.md`
- `ROADMAP.md`
- `V4_NEXT_SESSION_HANDOFF.md`
- `V4_REDEPLOY_NO_SURPRISE_PLAN.md`
- `V4_DEPLOYMENT_HANDOFF.md`
- `V4_LAUNCH_CHECKLIST.md`
- `V4_AUDIT_RESPONSE_2026-04-23.md`

v3 docs are archived in `../archive/legacy-v3/docs/` and are read-only historical reference. Do not use them to describe current protocol state.

Canonical related files outside this folder:

- Protocol repo guidance: `../CLAUDE.md`
- Protocol repo readme: `../README.md`
- Workspace guidance: `../../CLAUDE.md`

Core docs in this folder:

- `V4_NEXT_SESSION_HANDOFF.md`
- `V4_AUDIT_RESPONSE_2026-04-23.md`
- `V4_REDEPLOY_NO_SURPRISE_PLAN.md`
- `V4_DEPLOYMENT_HANDOFF.md`
- `V4_LAUNCH_CHECKLIST.md`
- `CURRENT_STATE.md`
- `NARA_CUSTODY_AND_RECOVERY.md`
- `PRD.md`
- `NARA_MASTER_CONTEXT.md`
- `APPS.md`
- `ENGINE_OPS_RUNBOOK.md`
- `EMISSION_MECHANICS.md`
- `LOCK_APY_REFERENCE.md`
- `LOCAL_TESTING.md`

Added 2026-05-28 (launch prep + router/lens):

- `NARA_V4_LAUNCH_RUNBOOK.md` — step-by-step operator deploy sequence with gates and commands
- `NARA_V4_PUBLIC_STATE.md` — honest current state for users, analysts, integrators; update addresses after deploy
- `NARA_V4_LOCK_USER_GUIDE.md` — user-facing locking guide: duration, weight, claiming, exit paths
- `NARA_V4_BOND_OPENING_CRITERIA.md` — operator checklist before opening bonds
- `NARA_V4_DASHBOARD_SPEC.md` — frontend data spec: one-call lens, panel definitions, write batches, copy rules
- `NARA_V4_ANALYST_POSTS.md` — draft comms posts for launch (do not publish until deployed)
- `ROUTER_LENS.md` — NARARouter + NARADashboardLens + BribeRouterV4 technical spec
- `NARA_V4_POST_LAUNCH_WORK.md` — deferred items: indexer, lockboard rebuild, stNARA AMM/oracle, fracNARA marketplace, etc.
- `NARA_V4_BASKETS_LAUNCH_STRATEGY.md` — canonical crown launch plan. Baskets ship as the public front door; lockboard becomes secondary. Source code lives in `../../nara-category-baskets-v1/`.
- `NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md` — contract audit (manager + fee collector), who can deploy/curate, banned vs allowed wording, geo-fence + ToS requirements, pre-launch action gates. Read before any public basket comms.
- `NARA_V4_BASKETS_MAINNET_READINESS.md` — go/no-go checklist. Closes F-08/F-09 with V2 fee collector + V3 adapter. Lists every gate, every action item, what only the operator can do (Safe, counsel, audit). Read before any deploy command.
