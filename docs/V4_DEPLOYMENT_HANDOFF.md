# NARA v4 Deployment Handoff

Last updated: 2026-07-26.

This filename is retained for old links. It is not a redeployment handoff.

Controlled Stage A is already deployed on Base mainnet. Do not repeat the core
deployment. Continue from:

1. [CURRENT_STATE.md](CURRENT_STATE.md) for deployed addresses and exact state.
2. [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md) for the current
   activation sequence.
3. [NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md) for gated operations.

Current scope is NARA Baskets only. Lockboard, position NFTs, bonds,
router/lenses, allocations, and composability are deferred. Lotto, Arena, and
the old cron are retired.

The pool is registered but uninitialized and has no liquidity. Production
activation remains blocked until the compounder, liquidity, preflight, smoke,
soak, exact-fork basket rehearsal, contract Safe/timelock, verified manifests,
and basket flow tests are complete.
