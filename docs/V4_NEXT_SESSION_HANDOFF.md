# NARA v4 Current Session Handoff

> **SUPERSEDED FOR ALL CURRENT LIQUIDITY WORK.** This 2026-07-26 session record
> describes an earlier dormant pool and must not be executed. Resume from
> [NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md)
> and [CURRENT_STATE.md](CURRENT_STATE.md). Stage 0 is already executed; do not
> re-propose it or run this file's old pool-deployment sequence.

Last updated: 2026-07-26.

Code and deployment artifacts are authoritative. Begin with
[CURRENT_STATE.md](CURRENT_STATE.md).

## Current state

Controlled Stage A is deployed on Base mainnet from release commit
`3215b69a1154b9c30957cd8d875b636dedc9d0ca`.

| Component | Address | State |
|---|---|---|
| `NARAToken` | `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A` | Deployed |
| `NARAEngine` | `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9` | Deployed |
| `NARARewardReserve` | `0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD` | Deployed and sealed |
| `NARALiquidityGrowthVault` | `0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988` | Deployed; compounder unset |
| `NARALiquidityGrowthHook` | `0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088` | Deployed; pool registered |

Pool ID:
`0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3`.

The pool is uninitialized and has no liquidity. No LP NFT exists. The system is
not a public market.

Canonical deployment evidence:
`deployments/v4-base-usdc-2026-07-26-controlled-stage-a.json`.

## Scope

- Current launch product: NARA Baskets.
- Deferred: position NFT, bonds, router/lenses, lockboard, allocations, and
  composability.
- Retired: v3, Lotto, Arena, and the old cron.
- Do not repeat the Stage A core deployment.
- Do not initialize the pool, seed liquidity, deploy baskets, or send another
  production transaction without explicit human approval.

## Next safe work

1. Run `npm run verify:v4:preseed`.
2. Review and deploy `NARALiquidityCompounderV4`.
3. Wire and freeze the compounder only after ownership and recovery-policy
   review.
4. Initialize and seed the registered pool with an explicitly approved
   transaction.
5. Run `npm run verify:v4:preflight` and `npm run smoke:v4`.
6. Record the required stability soak.
7. Rehearse the complete basket deployment on an exact Base-mainnet fork.
8. Validate all adapters, executors, selectors, immutable constructor inputs,
   and the irreversible fee-collector allowlist freeze.
9. Use a contract Safe/timelock as fee-collector admin; the deployment script
   rejects an EOA.
10. Save and verify a manifest for every deployed basket.
11. Run buy, sell, and `withdrawUnderlying` smoke tests.
12. Keep the frontend in preview until all production gates pass.

## Verification commands

Run from `nara-protocol-hardhat/`:

```powershell
npm run build
npm test
npm run size
npm run verify:v4:preseed
```

The strict preflight and smoke commands are expected to remain blocked until
the compounder and liquidity are configured:

```powershell
npm run verify:v4:preflight
npm run smoke:v4
```

## Stop conditions

Stop immediately if:

- any configured address differs from the canonical deployment evidence;
- a retired v3 or retired incident-stack address appears in an active config;
- pool state differs from the documented dormant state before activation;
- the basket admin is an EOA;
- any basket manager or adapter manifest is missing;
- fork rehearsal, preflight, smoke testing, or manifest parity fails.
