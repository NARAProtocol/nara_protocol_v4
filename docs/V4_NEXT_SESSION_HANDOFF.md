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
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` | Deployed and verified; Safe-owned; Compounder wired |
| `Create2HookDeployer` | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` | Deployed and verified; Safe-owned |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` | Deployed and verified; `0x2088`; Safe-owned; pool registered |
| `NARALiquidityCompounderV4` | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` | Deployed and wired; validation/reconciliation/freeze pending; `positionTokenId=0` |

Activated pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.

Production admin Safe:
`0xd65c0e390Dc187A22c52c03816591CC736C0D755`.

Treasury: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`.

Core verification readback block: `49719008`.

## Exact activation boundary

- The production Safe accepted Hook and Vault ownership in transaction
  `0x35320c5a5dfa31898d8a66e088038b67d1113bf6b95b82a230eaaf64be6f595d`
  at block `49720700`.
- Compounder `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` was deployed in
  transaction
  `0x8180bc9b7ec6f1e89719cb04cc358ad6e512c664e53aae810cb91abc3c00d461`
  at block `49720856` and wired to the Vault in transaction
  `0x29727cf5578989932175bd4e672d193e38b580f50645dd3bfcc173b44b2e70da`
  at block `49721044`.
- The atomic pool launch transaction
  `0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`
  at block `49721188` registered, initialized, and seeded the pool. Initial LP
  NFT `2898124` holds liquidity `4242640687119285`.
- Receipt-pinned live buy and sell tax matrices passed.
- Compounder validation and accounting reconciliation have not run to
  completion. The Compounder remains unfrozen and `positionTokenId()` is `0`.
- At block `49734434`, `Engine.currentEpoch()` was `34` and
  `epochState.epoch` was `4`. This 30-epoch backlog exceeds the eight-epoch JIT
  buffer and can make user-facing Engine writes revert `EpochStale`.
- Baskets remain preview-only.
- No recurring v4 operations or liquidity-maintainer workflow is active.

This records onchain activation and tax behavior. It is not an overall
production-readiness claim.

## Evidence note

The original 31-step deployment journal records all transaction hashes,
statuses, and block numbers as confirmed, but its normalization stored a zero
block hash in 24 entries. The journal was preserved unchanged. The tracked
supplement at
`deployments/v4-base-usdc-receipt-reconciliation-2026-08-08.json` reconciles
31/31 successful canonical Base receipts, supplements all 24 zero hashes,
matches all seven nonzero hashes, and reports zero other field mismatches.

Controlled Stage A and the 2026-07-30 pool remain historical recovery evidence.
Do not copy their addresses, manifests, LP state, or role assignments into this
deployment.

The current sanitized activation record is
[`deployments/v4-production-activation-2026-08-09.json`](../deployments/v4-production-activation-2026-08-09.json).
The dated release handoff is
[`docs/releases/NARA-20260809-v4-production-activation.md`](releases/NARA-20260809-v4-production-activation.md).

## Next gated work

1. Advance and receipt-pin the Engine epoch backlog before describing core
   user-write paths as available.
2. Validate Compounder accounting in its own receipt-pinned transaction; only
   after reconciliation may the separate irreversible freeze be executed.
3. Confirm the Compounder mints and owns a nonzero POL position before building
   the freeze transaction; `positionTokenId=0` is a hard stop for freezing.
4. Keep both recurring v4 workflows disabled until a new explicit user order
   and deployment-specific review authorizes an operational path.
5. Keep baskets in preview/non-availability state until their verified
   manifests and explicit downstream handoffs exist.
6. Reconcile public documentation last. Do not turn the activation evidence
   into an overall production-ready, audited, safe, or complete claim.

## Verification commands

Run from `nara-protocol-hardhat/` after the required evidence/environment sync:

```powershell
npm run verify:v4:preflight
npm run build:v4:compounder-validation
```

The following state-changing steps remain blocked until validation evidence is
reconciled and a fresh explicit approval exists:

```powershell
npm run build:v4:compounder-validation -- --freeze
# recurring workflow dispatches remain disabled
```

## Stop conditions

Stop immediately if:

- any configured address differs from the protected fresh deployment evidence;
- the receipt reconciliation reports any canonical mismatch;
- Hook or Vault ownership differs from the production Safe;
- the Vault/Compounder binding differs from the activation manifest;
- the activated PoolId, LP NFT, or liquidity differs from the receipt-pinned
  activation evidence;
- Engine epoch backlog remains beyond the eight-epoch JIT buffer for a
  user-facing availability claim;
- a retired v3 or historical incident-stack address appears in active config;
- Compounder freeze is proposed while `positionTokenId=0` or before validation
  and reconciliation are complete;
- a validation, freeze, keeper, or workflow action lacks explicit current
  approval;
  or
- any documentation or consumer describes the overall deployment as audited,
  secure, complete, or production-ready.
