# Current State

Last updated: 2026-08-09.

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
are not evidenced by this release, recurring maintenance remains disabled, the
Engine lifecycle smoke is pending, and baskets remain preview-only. Canonical
sanitized evidence is `deployments/v4-production-activation-2026-08-09.json`,
`deployments/v4-engine-epoch-recovery-2026-08-09.json`, and
`deployments/v4-compounder-activation-2026-08-09.json`.

## Authoritative v4 release policy

- Canonical contracts: `contracts/v4/`.
- Frozen core: do not edit `NARAEngine.sol` or `NARAPositionNFTV4.sol` without an
  explicit user order naming that contract.
- Canonical Hook: `contracts/v4/NARALiquidityGrowthHook.sol`.
- Hook update delay: seven days.
- Default maximum buy and sell curve rates: 2,000 BPS (20%).
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

## GitHub operational automation — disabled

At `2026-08-08T22:19Z` (`2026-08-09 01:19` Kyiv), the repository's two
transaction-capable operational workflows were shut down through GitHub's
reversible workflow controls:

| Workflow | GitHub workflow ID | Current state |
|---|---:|---|
| `NARA v4 operations keeper` | `324678194` | `disabled_manually` |
| `NARA v4 liquidity maintainer` | `324678196` | `disabled_manually` |

Repository variables `V4_OPERATIONS_KEEPER_ENABLED` and
`V4_LIQUIDITY_MAINTAINER_ENABLED` are both `false`. A post-change query found
no running or queued operational run. `NARA v4 CI`, `CodeQL`, and Dependabot
remain active because they are verification/dependency workflows, not
transaction bots.

No secret was read, changed, or deleted, and this shutdown sent no on-chain
transaction. The workflow files remain as historical/reviewable source, but
GitHub will not schedule or dispatch them while disabled. Do not re-enable or
dispatch either workflow without a new explicit user order, current verified
deployment inputs, a reviewed execution credential/role posture, and a
read-only dry run. See
[NARA-20260809-disable-github-operations-bots.md](releases/NARA-20260809-disable-github-operations-bots.md).

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

The production Safe then executed one bounded Compounder validation in Base
transaction
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
not active liquidity. Full evidence is in
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
- Default buy/sell maximum curve values are both capped at 20%.
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

1. Keep the Engine backlog within its eight-epoch JIT buffer and explicitly
   authorize a recurring maintenance path. Recovery transaction
   `0xcd6e52b319f21b5a6772a36cc076a5c6f8390dcd7326ab1adf822a16f6638493`
   advanced epochs `5..35`; at receipt block `49735161`, current and stored
   epochs were both `35`. At later pinned block `49735219`, the state was
   `36 / 35`, a one-epoch JIT-recoverable gap.
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

The GitHub v4 operations and liquidity-maintainer workflows are disabled and
their repository enable variables are false. No recurring v4 keeper is active;
do not re-enable or dispatch either workflow without a new explicit user order
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
