# NARA v4 Historical Activation Handoff

Activation checkpoint: 2026-08-09. Current-state annotation: 2026-08-30.

> **Historical checkpoint.** This file preserves the 2026-08-09 activation
> handoff. It is not current deployment or operations authority. Begin with
> [CURRENT_STATE.md](CURRENT_STATE.md), the latest dated release records, and
> verified manifests. The canonical contracts and pool are now in technical
> live testing; that does not establish public product availability or legal
> approval.

Code, canonical receipts, and protected deployment artifacts are authoritative.
Begin with [CURRENT_STATE.md](CURRENT_STATE.md) and
[V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md).

## 2026-08-09 checkpoint state

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
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` | Deployed and verified; Safe-owned; Compounder binding permanently frozen |
| `Create2HookDeployer` | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` | Deployed and verified; Safe-owned |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` | Deployed and verified; `0x2088`; Safe-owned; pool registered |
| `NARALiquidityCompounderV4` | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` | Validated; owns LP NFT `2898486`; current liquidity requires the latest release/readback |

Activated pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.

Production admin Safe:
`0xd65c0e390Dc187A22c52c03816591CC736C0D755`.

Treasury: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`.

Core verification readback block: `49719008`.

### Treasury Range Manager candidate - not deployed

`NARA-20260828-v4-treasury-range-manager` was implemented and tested at
historical pre-remediation candidate commit
`b34b78330f2f40b514d2bf6a0e5cff96c92ff928`. The 2026-08-30 remediation
closes the five retained internal-audit findings but does not yet have an
immutable protected release commit. It adds a Safe-bound tactical
range manager, exact planner/optimizer, adversarial fork simulator, unsigned
Safe builders, and a separate permissionless gas-only settler. It changes no
current deployment, permanent POL position, Hook/Vault/Compounder binding,
keeper role, schedule, or production manifest.

The Base-fork checkpoint at block `50537172` selected
`CONSERVATIVE-100000-NARA`, 12 candidate orders, with
`SELECTED_EXECUTION_BLOCKED`. The production Safe lacks the proposed 100,000
NARA and 5,000 USDC budget. No manager address or deployment receipt exists and
no transaction was signed or broadcast. Read
[`releases/NARA-20260828-v4-treasury-range-manager.md`](releases/NARA-20260828-v4-treasury-range-manager.md)
before any range-manager work.

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
- Receipt-pinned live buy/sell and same-block tax evidence passed.
- Compounder validation transaction
  `0xf1ea7e7dfdf8e1021ceebf26a943cba604e0a8c894eec5f527bc01656b5890be`
  minted Compounder-owned LP NFT `2898486` with liquidity `9455824137787`.
  Separate freeze transaction
  `0xccd73cf07602f18412bea291812f0d171fa5cabd41fcff6b6894029978084ef3`
  permanently locked the Vault binding.
- Safe transaction
  `0xcd6e52b319f21b5a6772a36cc076a5c6f8390dcd7326ab1adf822a16f6638493`
  recovered the Engine activation backlog. At receipt block `49735161`, current
  and stored epochs were both `35`; at later pinned block `49735219`, the gap
  was one epoch (`36 / 35`) and JIT-recoverable.
- Baskets remain preview-only.
- The epoch and liquidity maintainers are active under separate bounded
  policies, credentials, schedules, and deployment bindings. Neither is the
  Treasury Range Settler, and neither may be reused or broadened for it.

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

The current sanitized Compounder activation record is
[`deployments/v4-compounder-activation-2026-08-09.json`](../deployments/v4-compounder-activation-2026-08-09.json).
The dated release handoff is
[`docs/releases/NARA-20260809-v4-compounder-activation.md`](releases/NARA-20260809-v4-compounder-activation.md).
The current liquidity-automation authority is
[`docs/releases/NARA-20260815-v4-liquidity-maintainer-activation.md`](releases/NARA-20260815-v4-liquidity-maintainer-activation.md).
The current epoch-automation authority is
[`docs/releases/NARA-20260815-v4-epoch-maintainer-activation.md`](releases/NARA-20260815-v4-epoch-maintainer-activation.md).

## Next gated work

1. Monitor the separately active epoch and liquidity maintainers and keep the
   Engine backlog within its eight-epoch JIT buffer.
2. Complete and receipt-pin the Engine lock, activation, claim, and unlock
   lifecycle smoke.
3. Complete the monitored observation period.
4. Monitor both active bounded maintainers and preserve their separate keepers,
   schedules, bounds, and deployment bindings unless a new explicit user order
   and deployment-specific review authorize a change.
5. Keep baskets in preview/non-availability state until their verified
   manifests and explicit downstream handoffs exist.
6. Reconcile public documentation last. Do not turn the activation evidence
   into an overall production-ready, audited, safe, or complete claim.
7. For the Treasury Range Manager candidate, preserve the completed internal
   audit/remediation evidence, then complete protected review/CI, an immutable
   release commit, separately approved Safe funding, fresh schema-v2 state
   regeneration, receipt-pinned deployment, two-host settler rehearsal, and a
   monitored canary before any activation claim. No independent external audit
   is claimed.

## Verification commands

Run from `nara-protocol-hardhat/` after the required evidence/environment sync:

```powershell
npm run verify:v4:preflight
npm run verify:v4:launch-gates:baskets
```

The one-time validation and freeze builders must not be replayed. Epoch and
liquidity maintenance are active only under their separately recorded bounded
policies; material changes require fresh explicit approval.

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
