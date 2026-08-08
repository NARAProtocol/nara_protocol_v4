# NARA v4 Deployment Handoff

Last updated: 2026-08-09.

This filename is retained for existing links. The current deployment authority
is the fresh Base v4 core from immutable protected commit
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`, together with its canonical
receipts and protected sanitized manifest.

Continue from:

1. [CURRENT_STATE.md](CURRENT_STATE.md) for deployed addresses and exact dormant
   state.
2. [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md) for the next gated
   ownership, Compounder, pool, and verification sequence.
3. [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) for required pass and stop
   conditions.
4. [NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md) for human-reviewed
   operations.

The fresh Launcher, Token, Engine, RewardReserve, Vault, CREATE2 Hook deployer,
and canonical Hook are deployed and source-verified. The approved core
configuration is `60,000 NARA` / `300 USDC`, but no pool liquidity exists.

The planned pool is unregistered, uninitialized, and unseeded. Hook and Vault
ownership acceptance by the production Safe is pending, the Compounder is the
zero address, and no LP NFT or fresh-pool smoke evidence exists. The protected
fresh manifest is accompanied by a supplemental canonical receipt
reconciliation because 24 original journal entries stored a zero normalized
block hash; the supplement reconciles all 31 canonical receipts with no
mismatch.

Do not repeat the core deployment. Do not deploy or wire the Compounder,
register or initialize the pool, seed liquidity, run swaps, enable keepers, or
publish downstream availability without the separate approval and evidence
required for that exact step.

Controlled Stage A and the 2026-07-30 pool are historical incident/recovery
evidence only. Their addresses and manifests are not valid fallbacks.
