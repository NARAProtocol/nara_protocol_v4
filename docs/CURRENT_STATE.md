# Current State

Last updated: 2026-08-27.

This repository is v4-only. `contracts/v4/` is the sole active Solidity source.
The experimental V5 stack, tests, scripts, and release plans have been deleted
and must not be restored or used as deployment authority.

The fresh v4 core contracts were deployed and source-verified on Base from
immutable protected origin commit
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`. Human Safe signers subsequently
accepted Hook/Vault ownership, deployed and wired the verified Compounder, and
atomically registered, initialized, and seeded the canonical NARA/USDC pool.
LP NFT `2898124` is Safe-owned. Recorded initial flow, the 20-buy and 10-sell
distinct-block matrix, and the later same-block 20-action buy plus exact
20-action reversal prove the Hook and Vault charged and reconciled every
recorded supported exact-input transaction.

This is a receipt-pinned liquidity activation checkpoint, not a full
protocol-availability or production-readiness claim. The Compounder validation
and separate permanent Vault binding freeze succeeded. Allocations/periphery
are not evidenced by this release, the epoch and liquidity maintainers are
active under separate bounded policies and credentials, the Engine lifecycle
smoke is pending, and baskets remain preview-only. Canonical
sanitized evidence is `deployments/v4-production-activation-2026-08-09.json`,
`deployments/v4-engine-epoch-recovery-2026-08-09.json`,
`deployments/v4-compounder-activation-2026-08-09.json`, and
`deployments/v4-engine-epoch-recovery-2026-08-14.json`. The latest recurring
operations recovery evidence is
`deployments/v4-engine-epoch-recovery-2026-08-26.json`. The latest reconciled
liquidity state is recorded in
[`NARA-20260827-v4-full-inventory-compound.md`](releases/NARA-20260827-v4-full-inventory-compound.md),
and the later block-pinned fee accrual is recorded in
[`NARA-20260827-v4-post-compound-sell-fees.md`](releases/NARA-20260827-v4-post-compound-sell-fees.md).
The terminal three-second Matrix record is
[`NARA-20260827-v4-live-buy-matrix-3s.md`](releases/NARA-20260827-v4-live-buy-matrix-3s.md).
Only sanitized Matrix evidence is public; the implementation remains private
local operator tooling and is not a protocol repository component.

## DEPLOYED AND FINALIZED — Position NFT Phase 2

The seven-contract Position NFT Phase-2 baseline is deployed on Base Mainnet,
source-verified on BaseScan, and finalized under production Safe governance.
Canonical sanitized evidence: `deployments/v4-position-nft-phase2-finalized-2026-08-21.json`
(normalized-LF SHA-256:
`68d9df51f9bc222437252e3628c6c7c593ef96088a518b99b17a50965504c06b`) and
`deployments/v4-position-nft-phase2-source-verification-2026-08-21.json`.

The finalized evidence state is `configured_source_verified`, but
`integrationReady` remains `false`. At finalization, the complete reconciled
history contained no `PositionMinted` event and `nextTokenId` was `1`. The
separately approved value-bearing mint/transfer/claim/unlock smoke, 48-hour
monitored hold, and immutable downstream handoff are not evidenced as complete.

### Initial Verification Deployment (Phase 2 Baseline — Historical Evidence)
Phase 2 initially deployed and verified the static baseline stack on Base Mainnet:
1. `NARAArtMetadataV1`: `0xAE0Da2B2066FF0c1409A2aC4053699E75dd00633`
2. `NARAArtSecurityPrintV1`: `0x0640dd2B545348eC91826ab7c58DD88EcE81f353`
3. `NARAArtCorePlateV1`: `0x476b69f490C17a5500c4Eb9b6cB49302cef4bE4A`
4. `NARAArtGenesisPlateV1`: `0x20520115546c28F99aE581d62935e62D9E8B9022`
5. `NARAPositionRendererV5`: `0x607b08365C23a983C542898a79E670e6D4B80673`
6. `NARAPositionAccountV4`: `0x3a8c9cA4f95E94751774810B33caF01bb992A55F`
7. `NARAPositionNFTV4`: `0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC`

Safe finalization transaction `0xfb83cb4cb4b8a2c30216f46be69b519628ad74259795806e30d158a7736c6e8f`
(mined in block `50296367`) executed the atomic batch:

- `setDefaultRoyalty(production.treasury, 1000)` — permanently frozen at 10.00% (`1000 BPS`)
- `setClaimFees(0, 0)` & `setClaimFeeRecipient(address(0))` — permanently frozen at 0 BPS
- `freezeRoyalties()` (`royaltiesFrozen = true`)
- `freezeClaimFees()` (`claimFeesFrozen = true`)

### Unverified later Position NFT activity

Later V8 addresses, mint-count claims, marketplace activity, and audit results
previously described here are not bound to a canonical deployment manifest or
dated release evidence in this repository. They are provisional and are not
production-address, integration, or availability authority. A future release
must supply immutable origin, receipts, runtime/source proof, complete mint
history, smoke, observation, and downstream handoff evidence before any such
claim becomes authoritative.

The Cloudflare console at
`https://nara-v4-console-preview.pages.dev` is a preview deployment only. Its
existence does not establish Position NFT integration or public availability.


Bonds, allocations/Ops Vault, `NARAGenesisRewardDistributorV4` and Genesis binding, router,
data/dashboard lenses, circulating-supply periphery, and composability remain Phase 3.



## Authoritative v4 release policy

- Canonical contracts: `contracts/v4/`.
- Frozen core: do not edit `NARAEngine.sol` or `NARAPositionNFTV4.sol` without an
  explicit user order naming that contract.
- Canonical Hook: `contracts/v4/NARALiquidityGrowthHook.sol`.
- Hook update delay: seven days.
- Both constructor-default curves set their curve-level `maxFeeBps` to
  `2,000 BPS` (20%). The separate source-level governance hard ceiling is
  `MAX_POOL_FEE_BPS = 5,000 BPS` (50%); registered-pool curve changes remain
  subject to the seven-day delay. The activated production configuration is buy
  `300/500/800/1,200 BPS` (maximum 12%) and sell
  `500/800/1,200/2,000 BPS` (maximum 20%), activated at Base block `50189462`.
  See
  [NARA-20260819-v4-pol-compound-and-fee-update.md](releases/NARA-20260819-v4-pol-compound-and-fee-update.md).
- Pressure accounting: cumulative per input currency within one block.
- Tax boundary: every supported exact-input swap through the one registered
  canonical NARA/USDC Hook pool is charged. Exact-output is rejected. ERC-20
  transfers and third-party or unregistered pools are outside this Hook and are
  not universally taxed.
- Same-block splits share one cumulative curve; waiting for another block resets
  pressure. This is an explicit Block-0/per-block policy, not rolling-window
  anti-splitting.
- Fees are charged in the swap input currency. Inventory initially accrues in
  the Vault; after a compound call, any unmatched remainder is banked in the
  no-swap Compounder. Only the balanced subset becomes active POL.
- The v4 Engine ERC-20 notifier is prohibited. Fresh deployment tooling must
  prove `REWARD_NOTIFIER_ROLE` is absent from the custody Safe and fee Vault.
- Baskets remain preview-only until verified fresh-v4 manifests and handoffs
  exist.

The modular NFT contract named `NARAPositionRendererV5` is a renderer revision
inside the v4 stack. It is not the deleted protocol V5 stack. Renaming it would
change active v4 artifacts and is outside the liquidity remediation.

## GitHub operational automation — both maintainers active and separately gated

At `2026-08-08T22:19Z` (`2026-08-09 01:19` Kyiv), the repository's two
transaction-capable operational workflows were shut down through GitHub's
reversible workflow controls:

| Workflow | GitHub workflow ID | Current state |
|---|---:|---|
| `NARA v4 epoch maintainer` | `324678194` | `active` |
| `NARA v4 liquidity maintainer` | `324678196` | `active` |

Repository variables `V4_OPERATIONS_KEEPER_ENABLED` and
`V4_LIQUIDITY_MAINTAINER_ENABLED` are both `true` for the separately authorized
liquidity workflow. The hardened epoch workflow independently requires
`V4_EPOCH_MAINTAINER_ENABLED`, which is also `true`. `NARA v4 CI`, `CodeQL`, and
Dependabot remain active as verification/dependency workflows rather than
transaction bots.

No secret was read, changed, or deleted, and the 2026-08-09 shutdown sent no
on-chain transaction. The epoch workflow source was later separated from
liquidity, bound to the hash-pinned production manifest, and separately
activated with its own gas-only keeper, bounded routine, and
required heartbeat. Do not change either maintainer's authority, deployment
binding, policy, or schedule without a new explicit user order and current
deployment-specific review. See
[NARA-20260809-disable-github-operations-bots.md](releases/NARA-20260809-disable-github-operations-bots.md).
Current epoch evidence is
[NARA-20260828-v4-epoch-maintainer-resilience.md](releases/NARA-20260828-v4-epoch-maintainer-resilience.md).

On 2026-08-16, receipt-block reconciliation proved that six scheduled epoch
runs shown as failed had actually submitted successful status-`1`
`advanceEpochs()` transactions and advanced the stored epoch. The failure was
an unpinned post-receipt `latest` read, not a failed keeper write. The source
correction retains the confirmed receipt block, pins every post-write health
read to that block, and bounds retries to read-only RPC indexing checks. It does
not replay a transaction or change the keeper's authority, schedule, bounds,
credentials, heartbeat, or deployment binding. Evidence and test scope are in
[NARA-20260816-v4-epoch-maintainer-receipt-readback-fix.md](releases/NARA-20260816-v4-epoch-maintainer-receipt-readback-fix.md).

On 2026-08-26, the dedicated epoch keeper recovered a 162-epoch backlog after
the previous RPC provider's free-plan `408` failures and the routine workflow's
intentional eight-epoch guard prevented automatic catch-up. Workflow run
`32934625356` submitted `advanceEpochs(100)` and `advanceEpochs(62)` in
status-`1` transactions
`0x886606357052b7f1256613e30dbd962248fcf67ff5ae9e2862641c602725ada0`
and
`0xce4ecd87fdf0ab145a1c1e6db9008ba009727b0724056991ed6a9752d19b42df`.
At final receipt block `50466604`, current and stored epoch were both `1661`,
backlog and untracked direct reserve were zero, and the external reward reserve
was `649998.642061840394812631 NARA`. The paid RPC restored reachability; the
separately approved recovery cleared the already-accumulated backlog. The
temporary workflow branch was closed without merge, so `main` retains the
unchanged routine policy. See the latest recovery record and
`NARA_V4_EPOCH_MAINTENANCE_RUNBOOK.md` for the repeatable fast path.

On 2026-08-28, live workflow evidence proved that GitHub did not emit expected
scheduled events for gaps of `2h20m`, `3h13m`, `5h04m`, and `11h03m`. The
keeper, enable variable, concurrency policy, and RPC reads were healthy, but
the first delayed run observed backlog `10` and the eight-epoch routine ceiling
then prevented all later catch-up. The reviewed resilience policy changes the
epoch-only cadence to `3,18,33,48`, permits complete automatic recovery through
backlog `150` using at most `100 + remainder`, and still fails closed above
that bound. No contract, ABI, address, role, credential, or liquidity policy is
changed. Independent Railway polling and alerting is the separate consumer-side
guard for early detection.

On 2026-08-15, a new explicit user order initiated a deployment-specific
liquidity-maintainer review. Read-only checks found that the dormant script
ignored matching inventory already banked in the Compounder and that idle
scheduled cycles did not heartbeat. Protected changes now count combined Vault
plus Compounder inventory, require fresh Vault fees to trigger `compoundAll()`,
require execute-mode heartbeat reporting, verify the hash-pinned production
runtime, and run on the guarded twice-hourly `17,47` schedule.

The Safe authorized dedicated keeper
`0x0f8ADa55B394E58e9BC667c23a1EEcED12216272` on the current production Vault.
Hosted read-only run `31886696484` passed. Hosted execute run `31886879730`
submitted transaction
`0x0d5c4deb1448855391be29b488c5435cba2f23b1afaf924782c480e8bfe579de`
at Base block `50005313`, increasing Compounder-owned LP NFT `2898486`
liquidity from `9455824137787` to `61410660413174`. A post-call empty-Vault
idle defect was caught before the next schedule, the workflow and gates were
disabled, and PR #28 added the missing trigger guard. Hosted execute-mode idle
run `31887339426` then completed the required heartbeat without submitting a
transaction; keeper nonce remained `1`. The workflow is active with both gates
true. See
[NARA-20260815-v4-liquidity-maintainer-activation.md](releases/NARA-20260815-v4-liquidity-maintainer-activation.md).

On 2026-08-27, a separately controlled full-inventory operation compounded
`8,891.386678206871411484 NARA + 1,717.033154 USDC` in status-`1` transaction
`0x855691363aaf930f418cf065a491653513a69f4bece0ec210d53bd92a4864583`
at Base block `50499085`. Receipt-pinned reconciliation recorded Compounder LP
liquidity `4386316228001171`, banked remainder
`28.423769295100595183 NARA + 2.326460 USDC`, lifetime realized totals
`11,764.639965826519127719 NARA + 1,797.139917 USDC`, and zero Vault token
balances. The temporary broad caps were removed: routine policy is again
`500 NARA`, `6 USDC`, a `100 BPS` sqrt-price guard, a `200 BPS` imbalance
guard, and a `5 USDC` minimum trigger. Both workflow gates remained true and
the keeper role, schedule, and runtime binding were unchanged. This is
controlled compound activation/reconciliation evidence, not a whole-protocol
availability claim. See
[NARA-20260827-v4-full-inventory-compound.md](releases/NARA-20260827-v4-full-inventory-compound.md).

After that zero-Vault post-state, 22 confirmed sells through the canonical Hook
accrued `2,627.5 NARA` of new sell fees. At cutoff block `50534484`, the Vault
held `2,627.5 NARA + 0.660000 USDC`; the Compounder still held
`28.423769295100595183 NARA + 2.326460 USDC`. Combined USDC inventory was
`2.986460`, below the routine `5 USDC` minimum. This balance snapshot is
read-only evidence and does not authorize a compound. See
[NARA-20260827-v4-post-compound-sell-fees.md](releases/NARA-20260827-v4-post-compound-sell-fees.md).

On 2026-08-14, the production Safe executed three permissionless, zero-value
`advanceEpochs(200)` calls at Safe nonces `35..37`. Receipt events covered
epochs `36..235`, `236..435`, and `436..559`; the final call stopped after the
124 epochs actually available. At Base block `49970969`, current and stored
epochs were both `559`, the backlog was zero, the external reward reserve
reported `650,000 NARA`, and local, tracked, and untracked direct Engine reserve
were zero. This one-time recovery did not enable, configure, or dispatch either
workflow. Sanitized receipt evidence is in
`deployments/v4-engine-epoch-recovery-2026-08-14.json`.

## Fresh Base v4 core deployment

The core deployment was executed during the 2026-08-08 UTC / 2026-08-09 local
release session on Base, chain ID `8453`. The seven core contracts and the
later Compounder listed below are source-verified on Basescan. The core
verification readback was pinned at Base block `49719008`.

| Component | Address | Current state |
|---|---|---|
| `NARALauncher` | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` | Deployed and source-verified |
| `NARAToken` | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` | Deployed and source-verified; name/symbol `NARA` / `NARA` |
| `NARAEngine` | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` | Deployed and source-verified |
| `NARARewardReserve` | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` | Deployed, source-verified, and funded with `650,000 NARA` |
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` | Source-verified; Safe-owned; Compounder binding permanently frozen; balance zero at freeze block |
| `Create2HookDeployer` | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` | Deployed and source-verified; owned by the production Safe |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` | Source-verified; permission bits `0x2088`; Safe-owned; canonical pool registered |
| `NARALiquidityCompounderV4` | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` | Source-verified and Safe-owned; validated; owns LP NFT `2898486` |

Canonical pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.
The human-approved configured depth and atomic seed were `60,000 NARA` and
`300 USDC`, with bound opening `sqrtPriceX96`
`1120455419495722798374638764549163435`.

Current custody and activation state:

- production admin Safe:
  `0xd65c0e390Dc187A22c52c03816591CC736C0D755`;
- treasury: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`;
- Hook and Vault `owner()` are the Safe and `pendingOwner()` is zero after Safe
  transaction `0x35320c5a5dfa31898d8a66e088038b67d1113bf6b95b82a230eaaf64be6f595d`
  at block `49720700`;
- the verified Compounder was deployed at
  `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` in transaction
  `0x8180bc9b7ec6f1e89719cb04cc358ad6e512c664e53aae810cb91abc3c00d461`
  at block `49720856`, then wired by Safe transaction
  `0x29727cf5578989932175bd4e672d193e38b580f50645dd3bfcc173b44b2e70da`
  at block `49721044`;
- atomic Safe transaction
  `0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`
  at block `49721188` registered and initialized the pool and minted full-range
  LP NFT `2898124` to the Safe with liquidity `4242640687119285`;
- `Hook.poolRegistered()` is true and its registered PoolId matches the
  canonical PoolId above;
- at historical pre-validation readback block `49734252`, the Vault recorded
  and held exactly `1,495.229242512170995797 NARA` and `20.462880 USDC`; routed
  and compounded counters were then zero; and
- the later validation and freeze state is recorded separately below and
  supersedes that historical inventory snapshot.

The initial live flow included a buy at transaction
`0x60b4a0a0e6dbb388bda3e9a8e5b81ac1983c0eeaa2f530189dd0898263ef019e`
and a sell at
`0x0167bc7f58aa15aec7bc84b593a376102f5d3ea1d3516a74976c67daf287b84e`.
The later live matrix executed twenty distinct-block buys from `1` through
`20 USDC` and ten distinct-block sells of `1,000 NARA` each. All thirty matrix
transactions reconciled Hook events, Vault events, token transfers, receipt
blocks, and zero ending ERC-20/Permit2 allowances. The buy matrix recorded
`10.95 USDC` of Hook fees; the sell matrix recorded `500 NARA`.

A subsequent live round-trip tested cumulative same-block pressure explicitly.
One atomic Universal Router transaction executed twenty `3 USDC` buys in block
`49735413`: `60 USDC` produced `5,476.535036293903312662 NARA` and exactly
`4.95 USDC` of Hook fees, reaching the 12% terminal marginal buy tier. A second
atomic transaction sold that exact NARA output through twenty actions in block
`49735692`: it returned `51.878091 USDC` and charged exactly
`323.357452540573231886 NARA`, reaching the 7% terminal marginal sell tier.
For both receipts, twenty Hook events, twenty Vault records, and twenty
PoolManager-to-Vault transfers reconciled exactly; active liquidity remained
`4242640687119285`, and temporary ERC-20/Permit2 allowances ended at zero.

The full receipt-pinned calculation, round-trip accounting, and evidence limits
are documented in
[NARA-20260809-v4-same-block-tax-round-trip.md](releases/NARA-20260809-v4-same-block-tax-round-trip.md).

On 2026-08-27, a separately gated three-second Matrix attempted 100 buys of
`11 USDC`. Three terminal attempts confirmed 47 buys before two fail-closed
stops and an explicit operator stop. The confirmed partial result was
`517 USDC` in, `2,700.576852184485250104 NARA` out, and `15.510000 USDC` of
Hook fees. All 47 receipts and canonical fee events reconciled; all six cleanup
receipts succeeded and both allowance layers ended at zero. The remaining 53
buys were not executed, no resume is authorized, and this is not a completed
100-buy or profitability result. See
[NARA-20260827-v4-live-buy-matrix-3s.md](releases/NARA-20260827-v4-live-buy-matrix-3s.md).

The production Safe then executed the historical initial bounded Compounder
validation in Base transaction
`0xf1ea7e7dfdf8e1021ceebf26a943cba604e0a8c894eec5f527bc01656b5890be`
at block `49736646`. The transaction minted Compounder-owned LP NFT `2898486`
with liquidity `9455824137787`, adding
`99.999999999997037752 NARA + 0.894127 USDC` to active liquidity. The Safe
executed the separate permanent Vault binding freeze in transaction
`0xccd73cf07602f18412bea291812f0d171fa5cabd41fcff6b6894029978084ef3`
at block `49736809`. At that freeze block:

- seed LP NFT `2898124` remained Safe-owned with liquidity
  `4242640687119285`;
- total PoolManager active liquidity was `4252096511257072`, exactly the sum of
  both positions;
- Vault token balances and Vault-to-Compounder allowances were zero;
- the Compounder banked the unmatched remainder of
  `1718.586695052747189931 NARA + 24.518753 USDC`; and
- `pendingRecovery.kind == 0`.

Vault lifetime-compounded counters describe the full inventory handed to the
exact-spend Compounder (`1818.586695052744227683 NARA + 25.412880 USDC`). They
are not the actual LP inputs. The difference remains banked in the Compounder,
not active liquidity. This initial snapshot is superseded for current liquidity
balances by the 2026-08-15 maintainer activation and the 2026-08-27
full-inventory compound. Full validation evidence is in
[NARA-20260809-v4-compounder-activation.md](releases/NARA-20260809-v4-compounder-activation.md).

The original core deployment evidence remains a historical pre-activation
checkpoint. Its deployment receipt journal contains complete transaction
hashes, statuses, and block numbers, but 24 normalized entries stored a zero
block hash. The tracked
supplemental reconciliation at
`deployments/v4-base-usdc-receipt-reconciliation-2026-08-08.json` preserves the
journal hash and proves that all 31 canonical Base receipts succeeded, all 24
zero hashes are supplemented, all seven recorded nonzero hashes match, and no
other receipt field mismatches. The tracked core manifest identifies that
deployed-but-dormant checkpoint; the post-activation manifest supersedes only
its live-state fields.

The docs-only execution record is
[NARA-20260809-fresh-v4-core-deployment.md](releases/NARA-20260809-fresh-v4-core-deployment.md).
The activation execution record is
[NARA-20260809-v4-production-activation.md](releases/NARA-20260809-v4-production-activation.md).
## What happened after the 2026-07-30 v4 pool deployment

The historical pool launched atomically with `60,000 NARA + 300 USDC` and an
opening price of `$0.005/NARA`. Hook/Vault custody accounting reconciled on the
initial buy and sell smoke tests, but later trading exposed two economic facts:

1. The book was too shallow. Three successful sells produced the following
   results:

   | NARA sent | Hook fee | USDC received |
   |---:|---:|---:|
   | `100,000` | `13,770 NARA` | `314.389472` |
   | `100,000` | `13,770 NARA` | `68.465886` |
   | `75,772.141376089499042429` | `10,135.821206413424856364 NARA` | `25.524550` |

   The first sale moved spot down about 87.98%. Price impact from shallow
   liquidity dominated execution; the Hook fee was only one component.

2. Same-block flow aggregation does not persist across blocks. A 300-USDC ladder
   split into twenty 15-USDC transactions paid 15 USDC total instead of the
   50.55-USDC single-order quote. The corrected Hook prevents meaningful
   same-block splitting but deliberately resets on the next block.

The ladder did not create liquidity by itself. A later explicit compound used
both currencies and added POL. Buy-only USDC or sell-only NARA cannot become
active liquidity until the other currency is available.

The historical sell helper also demonstrated a receipt-verification hazard: an
unpinned post-receipt RPC balance read can be stale even after a status-1
transaction. Any live script must persist the transaction hash, pin reads to the
receipt block, reconcile receipt logs, and block blind retries.

## Concrete fresh-v4 remediation

### Hook and fee semantics

- Fee-curve and configured-depth updates use a seven-day delay.
- Owners can cancel pending curve/depth updates without changing active values.
- Tier rounding is aligned with `_cumulativeFee` thresholds.
- Quotes use the active block's cumulative input flow when applicable.
- `quotePoolFeeDetailed` separates:
  - terminal marginal BPS;
  - effective integrated BPS; and
  - exact integrated fee amount.
- Constructor-default buy/sell curve-level maximums are both 20%; the distinct
  source hard ceiling for delayed governance updates is 50%. The active
  production curve is buy `3%/5%/8%/12%` and sell `5%/8%/12%/20%`; source
  defaults and the absolute hard ceiling are not the current buy configuration.
- Live-depth probing rejects invalid token/pool inputs and remains telemetry;
  configured protocol depth is the deterministic fee basis.
- Exact-output swaps remain rejected so fee deltas cannot invert swap semantics.

### Atomic launch containment

`scripts/buildAtomicV4PoolLaunch.ts` now refuses to build the batch unless:

- Hook bytecode, Vault bytecode, and Engine bytecode exist;
- `Hook.vault()` equals the expected Vault;
- `Vault.hook()` equals the expected Hook;
- `Engine.NARA()` equals the expected NARA token;
- neither the custody Safe nor Vault has `REWARD_NOTIFIER_ROLE`;
- registration is immediately followed by atomic initialize-and-mint; and
- token and Permit2 approvals are revoked inside the batch.

The full deployment script renounces the constructor-granted notifier and the
launch gate reconstructs notifier role grant/revoke history. This contains the
frozen Engine reward-accounting defect without editing `NARAEngine.sol`.

### One-sided fee banking

The no-swap Compounder already handles unbalanced inventory. The explicit
regression proves that a one-sided `compoundAll` attempt reverts atomically,
leaves funds in the Vault, and later creates POL after matching counterasset is
present. No documentation may claim one-sided fees create instant POL.

## Verification evidence

Current local evidence after remediation:

| Gate | Result |
|---|---|
| Complete Hardhat suite | 556 passing, 7 pending, 0 failing on 2026-08-09; pending cases require opt-in Base-fork environments |
| Fresh deployment/receipt/Safe-batch evidence | 12 focused tests passing on 2026-08-09 |
| Live Hook/Vault tax matrix | 20 buys + 10 sells; all receipt/event/transfer/fee proofs passed |
| Current manifest/env synchronization | 19 focused live-config and env-sync tests passing; fresh Compounder and LP NFT exported |
| Focused Hook/Vault/Compounder/atomic launch | 43 passing |
| Hardhat invariant regression | 4 passing |
| Compiled-size gate | Passed; Engine runtime is 24,554 bytes, only 22 bytes below EIP-170 |
| Slither v4 | Completed every configured production target; raw alerts require critic disposition |
| Aderyn | Not executed on 2026-08-05: configured WSL binary/environment is missing |
| Echidna smoke | Not executed on 2026-08-05: registered WSL virtual disks are missing |
| Internal audit, pre-fix baseline | `../../audit-runs/2026-08-05-v4-full-redeploy/` complete |
| Internal audit, post-fix | `../../audit-runs/2026-08-05-v4-full-redeploy-final/` complete and schema-validated |

These are internal verification results, not an independent external audit or a
production-readiness claim.

## Baseline audit findings and disposition

The expanded pre-fix audit found no Critical or High finding. It identified:

- Cross-block laddering bypasses cumulative pressure taxation: accepted as the
  explicit per-block policy and covered by quantified tests/documentation.
- Buy-only fees cannot instantly become POL: corrected as a specification claim
  and covered by the one-sided banking regression.
- The old quote paired marginal BPS with integrated fee amount: resolved by the
  detailed quote API.
- A fresh Engine constructor initially grants `REWARD_NOTIFIER_ROLE`: contained
  by mandatory renunciation plus role-history and atomic-builder gates.
- Post-notification extensions can strand token-reward remainder: contained by
  permanently prohibiting Engine ERC-20 notification.
- Hook-to-Vault record callbacks are nonfatal: reciprocal immutable binding and
  launch-state checks make misbinding a deployment failure; custody deltas remain
  independently testable.

The post-fix critic and final report are complete. No Critical or High source
finding was confirmed. The three deployment blockers remain conditional release
invariants: zero active notifier holders, the frozen Engine token-reward path
must remain unreachable, and reciprocal Hook/Vault binding must pass before the
atomic batch is built.

## Historical Base evidence — not a redeploy manifest

Controlled Stage A core, deployed 2026-07-26 from commit
`3215b69a1154b9c30957cd8d875b636dedc9d0ca`:

| Contract | Address | Historical status |
|---|---|---|
| `NARAToken` | `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A` | Fixed 1,000,000 supply |
| `NARAEngine` | `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9` | Incident/recovery source |
| `NARARewardReserve` | `0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD` | Historically sealed with 650,000 NARA |

The 2026-07-30 liquidity trio and pool are also historical incident/recovery
evidence. Do not copy their addresses into a fresh manifest or consumer:

| Contract | Address |
|---|---|
| `NARALiquidityGrowthVault` | `0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d` |
| `NARALiquidityGrowthHook` | `0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088` |
| `NARALiquidityCompounderV4` | `0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98` |
| Pool ID | `0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318` |

The custody Safe queued a no-movement `WindDown` on 2026-07-31 with ETA
`2026-08-07T22:00:35Z`. Human Safe signers then executed the reviewed atomic
withdrawal on 2026-08-08 in Base transaction
`0xd3b4c1790b586c399e48307afa3c282a279ac395212f0242a98835781a430523`,
block `49715317` (status `1`). The transaction drained the Vault and
Compounder, burned position NFTs `2884402` and `2885838`, reduced old pool
active liquidity to zero, cleared `pendingRecovery`, and left the sealed
`650000 NARA` reward reserve unchanged. The custody Safe received
`321662.875771577338403661 NARA` and `363.781444 USDC`; the exact scoped NARA
reconciliation differed by one raw unit (`1e-18 NARA`) from integer rounding.

The completed recovery is anchored by the transaction and state reads above.
The reviewed
[NARA_V4_LIQUIDITY_WITHDRAWAL_RUNBOOK.md](NARA_V4_LIQUIDITY_WITHDRAWAL_RUNBOOK.md)
preserves the historical read-only builder, immutable fork reconciliation, and
do-not-replay boundary. It is evidence for the retired stack, never a current
deployment manifest.
Do not replay the consumed Safe batch, restore its pending state, or treat the
historical addresses or recovered assets as a fresh-v4 manifest. This evidence
authorizes no further transaction or redeployment.

## Release blockers

The fresh NARA/USDC pool, tested exact-input swap/tax path, and bounded
Compounder validation/freeze are active or complete as specifically documented,
but the whole stack is not production-ready. Remaining gates include:

1. Keep the Engine backlog within its eight-epoch JIT buffer and monitor the
   active recurring maintenance path. The 2026-08-26 keeper recovery advanced
   epochs `1500..1661`; at final receipt block `50466604`, current and stored
   epochs were both `1661`, backlog and untracked direct reserve were zero, and
   the external reserve remained funded. Continued scheduled observation
   remains an operational gate.
2. Complete and receipt-pin the Engine lock, activation, claim, and unlock
   lifecycle smoke before describing public locking or reward use as available.
3. Merge the activation manifests and handoff through protected CI. Do not
   update a consumer from this uncommitted or unmerged release tree.
4. Reconcile basket and monitor consumers from the immutable origin evidence,
   then publish the public documentation last. Baskets remain preview-only
   until their own verified deployment manifests exist.
5. Resolve the later-phase allocation mismatch and complete any allocations,
   routers/lenses, monitoring deployment/indexing, and public availability
   gates separately.
6. Complete the monitored observation period before any broader availability
   claim.
7. Obtain jurisdiction-specific qualified-counsel review of public copy and
   value-bearing flows; technical evidence and disclaimers do not establish
   legal compliance.

The GitHub v4 epoch and liquidity maintainers are active with separate enable
variables, gas-only keepers, schedules, heartbeat checks, and bounded duties.
Do not reuse or broaden either keeper's authority, change policy caps or batch
bounds, or change either deployment binding without a new explicit user order
and deployment-specific review.

## Active workspace

- Contracts and operations: this repository.
- Publishable basket frontend: `../nara-category-baskets-v1/app/`, preview-only.
- Historical working copy: `../apps/nara-baskets/`, non-publishing.
- Deferred: Lockboard.
- Retired: v3, Lotto, Arena, old keeper/cron assumptions.

## Maintenance rule

Update this file whenever verified live state or a release gate changes. Never
label planned addresses as deployed, unexecuted gates as passing, or internal
review as an independent audit.
