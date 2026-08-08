# NARA v4 Current Session Handoff

Last updated: 2026-08-09.

Code, canonical receipts, and protected deployment artifacts are authoritative.
Begin with [CURRENT_STATE.md](CURRENT_STATE.md) and
[V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md).

## Current state

The fresh v4 core is deployed on Base from immutable protected release commit
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`. The core configuration is
`60,000 NARA` token depth and `300 USDC` base depth. All deployed contracts in
this table are source-verified:

| Component | Address | State |
|---|---|---|
| `NARALauncher` | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` | Deployed and verified |
| `NARAToken` | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` | Deployed and verified; `NARA` / `NARA` |
| `NARAEngine` | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` | Deployed and verified |
| `NARARewardReserve` | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` | Deployed, verified, sealed with `650,000 NARA` |
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` | Deployed and verified; Safe acceptance pending; Compounder zero |
| `Create2HookDeployer` | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` | Deployed and verified; Safe-owned |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` | Deployed and verified; `0x2088`; Safe acceptance pending |

Planned pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.

Production admin Safe:
`0xd65c0e390Dc187A22c52c03816591CC736C0D755`.

Treasury: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`.

Verification readback block: `49719008`.

## Exact dormant-state boundary

- The pool is not registered, initialized, or seeded.
- The Hook's expected opening price is zero and PoolManager slot0 is zero.
- No LP NFT exists and pool liquidity is zero.
- `Vault.compounder()` is the zero address; Liquidity routing is inert.
- Hook and Vault current ownership has not transferred. Each reports the Safe
  only as pending owner until the Safe separately calls `acceptOwnership()`.
- Vault token balances and recorded fee/routing counters are zero.
- No smoke transaction has run against this fresh pool.
- No recurring v4 operations or liquidity-maintainer workflow is active.

This is not an active market, availability claim, completed launch, or
production-readiness claim.

## Evidence note

The original 31-step deployment journal records all transaction hashes,
statuses, and block numbers as confirmed, but its normalization stored a zero
block hash in 24 entries. Canonical Base RPC receipts matched the successful
transactions. Preserve the original journal unchanged and publish a separate
supplemental canonical receipt-reconciliation artifact before treating the
fresh sanitized manifest as protected downstream authority.

Controlled Stage A and the 2026-07-30 pool remain historical recovery evidence.
Do not copy their addresses, manifests, LP state, or role assignments into this
deployment.

## Next gated work

1. Publish the fresh sanitized manifest plus canonical receipt reconciliation
   through the protected review path.
2. Build and review the two Safe `acceptOwnership()` calls for the Hook and
   Vault. Human Safe signers execute them; then verify both `owner()` values.
3. Deploy and source-verify the replacement `NARALiquidityCompounderV4` with
   exact fresh bindings. Have the Safe wire it while the Vault is empty; do not
   freeze it yet.
4. Run the pre-seed verification and launch-gate commands.
5. Build and review the atomic pool launch for the separately reviewed
   `60,000 NARA + 300 USDC` seed. Do not send it without a fresh explicit
   execution order and Safe approval.
6. After atomic registration/initialization/first mint, record the receipt and
   LP NFT ID, then rerun post-seed preflight.
7. Validate Compounder accounting in its own receipt-pinned transaction; only
   after reconciliation may the separate irreversible freeze be executed.
8. Run receipt-pinned buy and sell smoke tests only after every prior gate.
9. Keep baskets and public documentation in preview/non-availability state
   until immutable producer evidence and explicit downstream handoffs exist.

## Verification commands

Run from `nara-protocol-hardhat/` after the required evidence/environment sync:

```powershell
npm run verify:v4:preseed
npm run verify:v4:launch-gates:preseed
```

The following commands are intentionally blocked until their preceding state
transitions are complete:

```powershell
npm run build:v4:atomic-pool-launch
npm run verify:v4:preflight
npm run verify:v4:launch-gates:baskets
npm run smoke:v4
```

## Stop conditions

Stop immediately if:

- any configured address differs from the protected fresh deployment evidence;
- the receipt reconciliation reports any canonical mismatch;
- Hook or Vault ownership remains pending when a later gate requires the Safe
  as current owner;
- the Compounder is nonzero before reviewed deployment/wiring evidence exists;
- pool state differs from the documented dormant state before atomic launch;
- a retired v3 or historical incident-stack address appears in active config;
- a seed, validation, freeze, or smoke action lacks explicit current approval;
  or
- any documentation or consumer describes this dormant deployment as active,
  available, audited, secure, complete, or production-ready.
