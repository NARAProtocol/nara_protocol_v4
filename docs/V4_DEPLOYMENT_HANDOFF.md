# NARA v4 Deployment Handoff

Last updated: 2026-08-09.

This filename is retained for existing links. The current deployment authority
is the fresh Base v4 core from immutable protected commit
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`, together with its canonical
receipts and protected sanitized manifest.

Continue from:

1. [CURRENT_STATE.md](CURRENT_STATE.md) for deployed addresses and current
   state.
2. [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md) for the next gated
   Compounder validation, reconciliation, freeze, and operations sequence.
3. [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) for required pass and stop
   conditions.
4. [NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md) for human-reviewed
   operations.
5. [Fresh v4 production activation manifest](../deployments/v4-production-activation-2026-08-09.json)
   and [dated activation release](releases/NARA-20260809-v4-production-activation.md)
   for the receipt-pinned 2026-08-09 state transition.

The fresh Launcher `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2`, Token
`0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1`, Engine
`0x98ab6406D6B548F37dEF7110961bb45A399e5aFC`, RewardReserve
`0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f`, Vault
`0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`, CREATE2 Hook deployer
`0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646`, and Hook
`0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` are deployed and
source-verified.

The production Safe accepted Hook and Vault ownership in transaction
`0x35320c5a5dfa31898d8a66e088038b67d1113bf6b95b82a230eaaf64be6f595d`
at block `49720700`. Compounder
`0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` was deployed in transaction
`0x8180bc9b7ec6f1e89719cb04cc358ad6e512c664e53aae810cb91abc3c00d461`
at block `49720856` and wired in transaction
`0x29727cf5578989932175bd4e672d193e38b580f50645dd3bfcc173b44b2e70da`
at block `49721044`.

PoolId
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`
was registered, initialized, and seeded with `60,000 NARA` / `300 USDC` in
transaction
`0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`
at block `49721188`. Initial LP NFT `2898124` holds liquidity
`4242640687119285`. Receipt-pinned live buy and sell tax matrices passed.

Do not repeat the core deployment or pool launch. Compounder validation and
accounting reconciliation remain pending; it is not frozen and
`positionTokenId=0`. The Engine also has a 30-epoch backlog at the pinned
readback, beyond its eight-epoch JIT buffer, so epoch recovery is the first
operations gate. Both recurring v4 workflows remain disabled, baskets are
preview-only, and downstream availability still requires the explicit handoff
sequence. This is not an overall production-readiness claim.

The earlier protected core manifest remains accompanied by its supplemental
canonical receipt reconciliation because 24 original journal entries stored a
zero normalized block hash; that historical supplement reconciles all 31 core
deployment receipts with no mismatch. The new activation manifest records the
later ownership, Compounder, pool, and tax-matrix evidence.

Controlled Stage A and the 2026-07-30 pool are historical incident/recovery
evidence only. Their addresses and manifests are not valid fallbacks.
