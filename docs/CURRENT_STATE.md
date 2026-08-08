# Current State

Last updated: 2026-08-09.

This repository is v4-only. `contracts/v4/` is the sole active Solidity source.
The experimental V5 stack, tests, scripts, and release plans have been deleted
and must not be restored or used as deployment authority.

The fresh v4 core contracts have been deployed and source-verified on Base from
immutable protected origin commit
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`. This is a core-deployment state,
not an activation or availability claim. The NARA/USDC pool is dormant: it is
not registered, initialized, or seeded, and no LP NFT exists. The Compounder is
not deployed or configured. Hook and Vault ownership acceptance by the
production Safe is still pending.

No further deployment, Safe action, pool activation, seed, smoke swap, or
downstream publication is authorized by this document.

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
- Fees are charged in the swap input currency. One-sided fee inventory remains
  in the Vault until matching counterasset exists. A no-swap Compounder creates
  POL only from balanced inventory.
- The v4 Engine ERC-20 notifier is prohibited. Fresh deployment tooling must
  prove `REWARD_NOTIFIER_ROLE` is absent from the custody Safe and fee Vault.
- Baskets remain preview-only until verified fresh-v4 manifests and handoffs
  exist.

The modular NFT contract named `NARAPositionRendererV5` is a renderer revision
inside the v4 stack. It is not the deleted protocol V5 stack. Renaming it would
change active v4 artifacts and is outside the liquidity remediation.

## Fresh Base v4 core deployment

The core deployment was executed during the 2026-08-08 UTC / 2026-08-09 local
release session on Base, chain ID `8453`. All seven deployed contracts below
are source-verified on Basescan. The verification readback was pinned at Base
block `49719008`.

| Component | Address | Current state |
|---|---|---|
| `NARALauncher` | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` | Deployed and source-verified |
| `NARAToken` | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` | Deployed and source-verified; name/symbol `NARA` / `NARA` |
| `NARAEngine` | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` | Deployed and source-verified |
| `NARARewardReserve` | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` | Deployed, source-verified, and funded with `650,000 NARA` |
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` | Deployed and source-verified; Safe ownership acceptance pending |
| `Create2HookDeployer` | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` | Deployed and source-verified; owned by the production Safe |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` | Deployed and source-verified; permission bits `0x2088`; Safe ownership acceptance pending |

Planned pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.
The deployment used the human-approved core configuration of `60,000 NARA`
token depth and `300 USDC` base depth, corresponding to the later seed target
of `$0.005/NARA`. These values do not mean liquidity exists.

Current custody and activation state:

- production admin Safe:
  `0xd65c0e390Dc187A22c52c03816591CC736C0D755`;
- treasury: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`;
- Hook and Vault still report the deployment signer as current owner and the
  production Safe as `pendingOwner()`; the Safe must separately execute
  `acceptOwnership()` on each before any Compounder wiring or pool launch;
- `Vault.compounder()` is the zero address and the Liquidity route is inert;
- `Hook.poolRegistered()` is false, `Hook.expectedSqrtPriceX96()` is zero, and
  the PoolManager slot0 for the planned pool is zero;
- the pool has no liquidity and no LP NFT; and
- Vault token balances, recorded lifetime pool fees, and recorded routed
  amounts are zero.

The pre-seed wiring/readback gates passed against this dormant state. The
deployment receipt journal contains complete transaction hashes, statuses, and
block numbers, but 24 normalized entries stored a zero block hash. The tracked
supplemental reconciliation at
`deployments/v4-base-usdc-receipt-reconciliation-2026-08-08.json` preserves the
journal hash and proves that all 31 canonical Base receipts succeeded, all 24
zero hashes are supplemented, all seven recorded nonzero hashes match, and no
other receipt field mismatches. The tracked `latest` manifest now identifies
this fresh dormant deployment.

The docs-only execution record is
[NARA-20260809-fresh-v4-core-deployment.md](releases/NARA-20260809-fresh-v4-core-deployment.md).

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
| Complete Hardhat suite | 553 passing on 2026-08-09; 5 opt-in Base-fork cases pending |
| Fresh deployment/receipt/Safe-batch evidence | 12 focused tests passing on 2026-08-09 |
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
The operator-local `NARA_V4_LIQUIDITY_WITHDRAWAL_RUNBOOK.md` is not part of this
protected release and must not be treated as repository authority until it
enters through its own review.
Do not replay the consumed Safe batch, restore its pending state, or treat the
historical addresses or recovered assets as a fresh-v4 manifest. This evidence
authorizes no further transaction or redeployment.

## Release blockers

The core deployment is complete, but the stack is not activated, available, or
production-ready. Remaining gates include:

1. Have the production Safe accept Hook and Vault ownership, then verify both
   `owner()` values. Pending ownership alone does not pass the gate.
2. Deploy and source-verify the fresh `NARALiquidityCompounderV4`, wire it from
   the Safe while the Vault is empty, and keep it unfrozen until its separate
   validation flow passes.
3. Rerun the pre-seed gates, build the exact atomic Safe batch, and require a
   successful whole-batch simulation before any signature or execution.
4. Register, initialize, and seed the pool atomically with the separately
   reviewed `60,000 NARA + 300 USDC` seed. Record the receipt and LP NFT ID.
5. Validate the Compounder, reconcile the receipt-pinned accounting, and only
   then execute the separate irreversible Compounder freeze.
6. Pass post-seed preflight and receipt-pinned buy/sell smoke tests.
7. Resolve the later-phase allocation mismatch and complete any allocations,
   routers/lenses, baskets, monitoring, and downstream handoffs separately.

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
