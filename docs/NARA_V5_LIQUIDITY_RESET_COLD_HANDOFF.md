# NARA V5 Complete-Stack Reset Cold Handoff

Recovery Change-ID: `NARA-20260731-liquidity-stack-reset`

V5 planning Change-ID: `NARA-20260801-v5-complete-stack-reset`

Last verified: 2026-08-01 at Base block `49373282`.

> **Read this first after any context loss.** Stage 0 was executed successfully
> by the human `2-of-3` custody Safe. The dedicated old compound keeper is
> revoked and a seven-day
> `WindDown` is pending. **No NARA, USDC, NFT, or liquidity moved in Stage 0,
> and nothing moves automatically when the ETA arrives.** A different, freshly
> built, reviewed, simulated, and signed Safe withdrawal is required. V5 means
> a genuinely new complete stack, including a new token, engine, reserve,
> protocol periphery, liquidity stack, pool, custody, tooling, and integrations.

This handoff supersedes earlier session handoffs and old pool-launch directions
for all liquidity work. Fresh on-chain reads supersede fixed balance, fee,
liquidity, and price snapshots in this file.

## Thirty-second verdict

- Stage 0 is **done**, not waiting for signatures.
- Authoritative maturity is **2026-08-07 22:00:35 UTC**, which is
  **2026-08-08 01:00:35 Kyiv (EEST)**.
- Before maturity: design and test V5 and the old-v4 withdrawal; do not withdraw.
- At or after maturity: maturity still moves nothing. Build the v4 withdrawal
  from fresh state and give it to human Safe signers only after exact-fork
  simulation and review. V5 does not need to be deployed for old assets to land
  in the Safe, but no partial withdrawal is acceptable.
- V5 is a complete new protocol stack, not a periphery revision. Current v4
  addresses become recovery/retirement sources and historical evidence.
- The main reason for V5 is the complete Hook V5 redesign. Its accounting,
  anti-splitting economics, dual-currency fee flow, active-POL behavior, and
  simulations are design workstream number one; the rest of V5 is built around
  it. Local source/tests and the external-review disposition are recorded in
  [NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md](NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md),
  A complete selected contract candidate and offline deterministic deployment
  planner now exist locally, including Vault, Controller/custody, Compounder,
  Engine, core modules, and periphery. They are undeployed, unapproved, not an
  immutable release, and not an audit result. Protected integrations and actual
  rehearsal/production evidence remain blocked.
- The canonical local NFT-bond candidate now uses one exact lifetime-capacity
  campaign: the positive bond allocation remains in Treasury, its Vault deploys
  unfunded, and the market has zero live capacity. A term must be queued before
  exact funding, activation is delayed by at least one hour, campaign duration
  is capped at 30 days, locks must fit the Engine envelope, and protected buys
  commit to payout/deadline/epoch-aligned unlock/term hash. Every terminal path
  has delayed immutable-recipient recovery for unsold inventory and later
  donations. This is implementation evidence only: the allocation, fixed-price
  versus oracle/TWAP policy, price, term, lock, and activation payload remain
  unapproved, and no one may fund or open the bond market from this handoff.
- The Stage-0 action authorizes only the old compounder's recovery clock. It
  does not authorize V5 deployment, token minting/allocation, holder migration,
  engine shutdown, or movement of the old sealed reserve.

Canonical detail is in
[CURRENT_STATE.md](CURRENT_STATE.md) and the
[V5 complete-stack plan](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md). The
[v4 liquidity recovery plan](NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md) remains the
authority for the old withdrawal mechanics. Machine-readable Stage-0
evidence is
[`v4-liquidity-stack-recovery-stage0-execution-2026-07-31.json`](../deployments/v4-liquidity-stack-recovery-stage0-execution-2026-07-31.json).

## What "V5 complete stack" means

The current v4 components below remain live only until their explicit recovery,
retirement, or shutdown gate. They are **not** V5 addresses:

| v4 recovery/retirement source | Current address / rule                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `NARAToken`                   | `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`                                                               |
| `NARAEngine`                  | `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9`                                                               |
| Sealed `NARARewardReserve`    | `0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD`; its `650,000 NARA` is outside the Stage-0 liquidity recovery |
| Old liquidity trio/pool       | Recover using the exact addresses, NFTs, and pending `WindDown` below                                      |

The local candidate now supplies source and tests for the following selected
contract scope, but V5 still requires fresh reviewed deployment evidence and
manifests for at least:

- token, launcher/deployment path, engine, and reward reserve;
- position NFT/account and any V5 position renderer selected for launch;
- Genesis, bond, operations/treasury, router/lens, and other protocol periphery
  selected for V5 launch scope;
- hook, growth vault, compounder, and a new hooked NARA/USDC pool;
- custody, roles, timelocks, keepers, recovery policy, and monitoring; and
- baskets/adapters/frontend addresses, ABIs, start blocks, and public docs.

The offline planner commits 22 component constructors, runtime hashes, a mined
Hook salt nonce, the nested PositionAccount implementation, exact setup actions,
an atomic activation group, execution window, CREATE2 factory evidence, and
typed USDC/PoolManager/PositionManager/Permit2/UniversalRouter code evidence.
External proxy implementation/admin/beacon slots and token behavior must also be
attested where applicable. V4Quoter and protected product routes remain separate
integration gates.

No V5 contract is deployed and no production V5 address is approved. Do not
rename current v4 deployments as V5, and do not merely rerun v4 deployment
bytecode under a new version label.

## Executed Stage-0 proof

| Fact                   | Verified value                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Human Safe transaction | [`0xf8079c50...435b`](https://basescan.org/tx/0xf8079c502c32e037bbb947b0cccd3ef362a4f9b02325cff1f06db0963875435b) |
| Receipt                | status `1`; block `49372944`; gas `108282`                                                                        |
| Block                  | hash `0x3ec68c8347bcb9d7a1828572432b8db65e6b6f6c967c882bc4271daedf2643e3`; `2026-07-31T22:00:35Z`                 |
| Safe                   | `0xd65c0e390Dc187A22c52c03816591CC736C0D755`; `2-of-3`                                                            |
| Call 1                 | old vault `setCompoundKeeper(0xa4B4...5aB7, false)`                                                               |
| Call 2                 | old compounder `proposeRecovery(3, custodySafe)`; enum value `3` is reviewed `WindDown`                           |
| Event                  | `CompoundKeeperSet(keeper, false)`                                                                                |
| Event                  | `RecoveryProposed(kind=3, to=Safe, eta=1786140035)`                                                               |
| Post-state             | keeper `false`; pending `WindDown` to the exact Safe                                                              |
| ETA                    | Unix `1786140035`; `2026-08-07T22:00:35Z`; Kyiv `2026-08-08 01:00:35 EEST`                                        |

Post-execution readback at Base block `49373282` confirmed:

- seed NFT `2884402` was still Safe-owned with liquidity
  `4242640687119285`;
- compounder NFT `2885838` was still compounder-owned with liquidity
  `931745121747730`;
- vault still held `23,905.821206413424856364 NARA + 0 USDC`;
- compounder bank still held `24.383460617742441949 NARA + 268.675972 USDC`;
- Safe still held `10,000.000000000002070478 NARA + 154.169235 USDC`; and
- the sealed reserve still held `650,000 NARA`.

Therefore Stage 0 moved no scoped asset and removed no liquidity. It only
revoked the dedicated compound keeper and started the recovery clock.

## Maturity state machine

| State                                                     | Required action                                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `now < 1786140035`                                        | Keep the old LP active. Build, audit, and rehearse the exact v4 withdrawal and complete V5 design. Do not attempt recovery.                                                              |
| `now >= 1786140035`, no reviewed withdrawal payload       | Leave the matured `WindDown` and both LP NFTs in place. Maturity alone changes nothing.                                                                                                  |
| `now >= 1786140035`, exact v4 withdrawal passes all gates | Human Safe signers may execute one atomic old-v4 retirement batch that drains the old vault/bank, removes both NFTs, and lands both tokens in the Safe. V5 need not already be deployed. |
| v4 assets recovered, V5 not ready                         | Keep recovered v4 NARA and USDC in custody. Do not invent a conversion, seed a V5 pool, or dispose of old tokens without an approved V5 migration plan.                                  |
| V5 implementation and migration policy approved           | Deploy and activate only through the separate complete-stack V5 gates and human approvals.                                                                                               |
| Any invariant differs                                     | Stop. Do not reuse a payload or "fix forward" with a partial production transaction.                                                                                                     |

Do not re-propose the recovery: it overwrites the pending action and restarts
the seven-day delay. Do not cancel it unless the human Safe deliberately decides
to abandon or change the recovery. The pre-execution Transaction Builder JSON
is now historical evidence; do not re-import or rerun it.

## Pinned recovery inventory and USDC accounting

The following is the exact post-sell, pre-Stage-0 snapshot at Base block
`49372240` (`2026-07-31T21:37:07Z`). Stage 0 did not change it, but the old pool
remains tradeable and fees can still accrue, so this is **not** a future payout
or cutover amount.

| Scoped recovery source                                  |                             NARA |      Actual USDC |
| ------------------------------------------------------- | -------------------------------: | ---------------: |
| Seed NFT `2884402`, principal plus claimable fees       |     `244,214.552718396627865941` |      `78.858978` |
| Compounder NFT `2885838`, principal plus claimable fees |      `53,518.118386149543239408` |      `16.246494` |
| Old vault plus compounder bank                          |      `23,930.204667031167298313` |     `268.675972` |
| **Scoped pull snapshot**                                | **`321,662.875771577338403662`** | **`363.781444`** |

USDC locations at that snapshot:

- actual USDC in the scoped future pull: **`363.781444 USDC`**;
- existing custody Safe USDC: `154.169235 USDC`;
- projected Safe balance after that scoped pull: `517.950679 USDC`;
- separate liquidity EOA balance after all three sells: `436.563886 USDC` and
  exactly `0 NARA`; and
- total actual USDC across scoped recovery, Safe, and EOA:
  **`954.514565 USDC`**.

The EOA is not part of the scoped pull and must not be silently included in a
Safe transaction. The scoped NARA remains NARA. Its snapshot spot mark of
`97.797110 USDC` and the combined `461.578554 USDC` spot-equivalent are
informational only, not guaranteed sale proceeds.

## Work authorized during the wait

Continue safe local and read-only work:

- use
  [NARA_V5_DEPTH_ECONOMICS_2026-08-01.md](NARA_V5_DEPTH_ECONOMICS_2026-08-01.md)
  as the parameter-neutral lower bound, then continue exact concentrated-range
  simulation against the observed buy ladder, three sells, one-sided flow,
  compound, depth, MEV, and split-order cases; do not freeze wider V5
  production parameters until its exit gate passes;
- harden and independently review the implemented V5 token, engine, reserve,
  selected protocol modules, liquidity contracts, and offline deployment
  planner; finish protected route, verification, and monitor schemas;
- separately finish the exact old-v4 withdrawal builder and receipt
  reconciliation without coupling it to an unapproved V5 token design;
- model flat dual-asset input-and-output launch fees on both buys and sells;
- reduce fees only through objective protocol-owned-liquidity milestones;
- test baskets and adapters, but keep the publishable app in preview and do not
  deploy or activate baskets against the retiring pool;
- run static, fuzz, real-PoolManager, economic, exact Base-fork, accounting,
  receipt-reconciliation, and duplicate-retry tests; and
- prepare immutable origin and downstream handoff evidence under V5 Change-ID
  `NARA-20260801-v5-complete-stack-reset`.

The user-selected Bootstrap rate is `15% input + 15% actual output` on both
buys and sells. This is 30 nominal percentage points and a `27.75%` no-impact
hook-only effective charge; pool fees and price impact remain additional and
must be displayed separately. Bootstrap is the hard maximum. The approved
symmetric phases are `15% + 15%`, `12.5% + 12.5%`, `10% + 10%`,
`7.5% + 7.5%`, and `5% + 5%`; five percent per leg is the hard floor.
Phases move only downward as verified designated active POL reaches approved
liquidity-depth milestones. The exact milestones and observation windows
remain simulation and explicit-approval inputs. They must not reuse the old
fixed `300 USDC`/`60,000 NARA` protocol-depth calibration.

The Hook always accrues both fee currencies to one bound Vault. The production
Vault must move one way through
`Unbound -> BootstrapLiquidity -> Shared -> Retired`. Bootstrap permanently
classifies 100% of both currencies for liquidity. Shared applies immutable,
human-approved share `X` only to post-transition fees in both currencies using
cumulative telescoping; the remainder stays liquidity-classified and rounding
dust stays with liquidity. There is no retroactive reclassification, arbitrary
route mode, 100%-Engine escape, or V4 notifier reuse. In Shared mode,
active/inactive Engine entitlement is recorded synchronously at the swap; later
redemption only provides exact backing and cannot reward a later locker. An
epoch-stale or below-minimum Engine irrevocably routes that share to its
immutable inactive recipient without halting swaps. `X`, the recipient, and
this production policy remain unapproved.

### One-hour rehearsal rule

The old deployed compounder's seven-day delay cannot be shortened. Use a
**disposable, non-public complete V5 rehearsal stack** with a one-hour recovery
delay to prove deployment, roles, movement, pull, removal, shutdown, and reseed
behavior end to end. Retire every rehearsal address afterward. Production must
be a separate fresh complete-stack deployment with recovery already immutable
or irreversibly sealed at **seven days or longer** before public activation.
Never carry a one-hour escape path into production.

Local simulation evidence as of 2026-08-01:

- Hook-focused suites: 48 passing;
- selected V5 unit/integration/release/planner matrix: 102 passing;
- that matrix includes mixed active/inactive Vault-to-Engine backing
  reconciliation and 8 unsigned protected-swap-plan tests that prevent
  V4Quoter output-fee double-discounting;
- it also includes 16 focused bond lifecycle, real-Engine, and arithmetic tests:
  exact queue/fund/activate ordering, protected purchase, NFT unlock/claim/close,
  sold-out/cancel/expiry/admin-close recovery, taxed-payment and Engine-backlog
  atomic rollback, 1,531,904 accepted payment-lattice cases, and 390,625 exact
  price-floor comparisons;
- final Base fork: 2 passing, including real Base PoolManager, PositionManager,
  Permit2, real local Engine/Vault Shared routing, separate LP-fee harvest,
  one-hour retirement, exact receipt-block recovery deltas, both NFT removals,
  and zero final active liquidity; and
- V4 liquidity regression: 29 passing.

The Base fork is a deterministic local rehearsal. It is **not** the required
disposable deployed rehearsal and created no production address or transaction.
The fork used local tokens, a position-controller harness, an EOA recovery
recipient, and two post-retirement removal transactions; the final Safe/batch
shape and exact production USDC path still require deployment evidence.

## Required atomic v4 withdrawal after the ETA

There is no approved final transaction yet. At or after the ETA, generate the
withdrawal from fresh state and execute all old-liquidity movement as one
pre-simulated Safe transaction. This batch recovers v4 assets to custody; it
does not deploy or seed V5.

1. Assert Base chain ID `8453`, exact Safe/threshold/runtime, source runtime
   hashes, keeper `false`, matured `WindDown` kind `3` to the exact Safe, both
   NFT owners/liquidities, fresh balances, and an unchanged `650,000 NARA`
   sealed reserve.
2. Drain the old vault through its reviewed retirement
   `compoundAll(0, deadline, "")` path. This can add old compounder liquidity,
   so do not reuse an earlier liquidity amount.
3. Call old compounder `executeRecovery()` only after maturity. It transfers
   its LP NFT and bank to the Safe; it does **not** remove that liquidity.
4. From the Safe, fully decrease NFTs `2884402` and `2885838` and `TAKE` both
   currencies. Do not use a direct-EOA removal helper.
5. Revoke every temporary ERC-20 and Permit2 allowance in the same transaction.
6. Assert exact per-currency conservation, both old NFT liquidities and old pool
   active liquidity equal zero, vault/bank balances equal zero, all recovered
   v4 NARA and USDC reached the Safe, and the sealed reserve is unchanged.

If any part cannot be atomic or exact-fork simulated from the Safe, stop. Never
move the compounder NFT to the Safe as a partial production intermediate.

## Complete V5 deployment gates

The v4 withdrawal does not decide V5 economics or migration. Before any V5
deployment payload is built, the human owner must explicitly approve and the
implementation must encode:

- the new V5 token's fixed supply, decimals, name/symbol, allocation table,
  mint/freeze policy, launcher, and flash behavior;
- whether v4 holders receive no migration, a snapshot claim, or another exact
  conversion, including the snapshot block, eligibility, rounding, deadline,
  unclaimed-token disposition, and double-claim protection;
- the fate of recovered v4 NARA and the old sealed `650,000 NARA` reserve;
- new engine epoch/reward/fee parameters and reserve funding;
- exact V5 module launch scope and which former v4 modules remain deferred;
- custody Safes, role separation, timelocks, emergency/recovery authority, and
  the production recovery delay;
- new token/USDC opening price, seed amounts, fee design, milestone rules, and
  protocol-owned-liquidity accounting; and
- full deployment, verification, monitor, basket, frontend, exit, smoke, and
  soak gates.

Do not infer a 1:1 v4-to-V5 conversion or reuse the old pool's spot/opening price.
Those are explicit economic decisions, not properties of the recovery proof.

## Hard stop list

- Do not rerun, re-import, or re-propose the executed Stage-0 batch.
- Do not assume seven days triggers an automatic transfer.
- Do not call `executeRecovery()` alone.
- Do not remove only one LP NFT or drain assets in separate production steps.
- Do not finalize the old pending `0.75%`/`1%`/`2%` fee curve.
- Do not confuse current v4 addresses with V5 or rerun the v4 deployment as V5.
- Do not move the old sealed reserve or shut down old core as part of the
  liquidity withdrawal; those require the approved full-stack migration plan.
- Do not deploy or mint V5 until supply, allocation, v4-holder treatment,
  module scope, custody, and migration invariants are explicit and tested.
- Do not reuse the old pool-only launch runbook or its `$0.005` opening price.
- Do not reuse the snapshot amounts or price in a final transaction.
- Do not call the old pool a launch candidate or activate baskets against it.
- Do not send transactions or deploy from an AI session; human approval and
  Safe signatures remain mandatory.

## Transaction-tooling rule learned from the live sells

`scripts/swapNaraForUsdc.ts` can report a false post-receipt failure because it
reads `latest` from a load-balanced RPC after `tx.wait()`. Replacement tooling
must persist the transaction hash, treat receipt status `1` as executed, read
post-state at the receipt block, reconcile receipt logs, and classify a stale
read as `EXECUTED - VERIFICATION PENDING`. It must block a same-parameter retry
until the earlier hash and nonce are checked and a human explicitly approves a
new action.

## Cold-AI resume algorithm

1. Read workspace and repository `AGENTS.md`, repository `CLAUDE.md`, this file,
   [CURRENT_STATE.md](CURRENT_STATE.md), the
   [V5 complete-stack plan](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md), the
   [v4 recovery plan](NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md), and
   `../docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md`.
2. Run `scripts/check-nara-repository-routing.ps1` from the workspace root
   before any cross-repository work.
3. Read Base at one block. Verify chain `8453`, the exact Safe, keeper `false`,
   pending kind `3`, destination Safe, ETA `1786140035`, both NFT owners and
   liquidity, old vault/bank balances, source pool state, and reserve balance.
4. If before ETA, work and test only.
5. If at/after ETA, generate a fresh v4 inventory and exact atomic withdrawal
   payload. V5 deployment is not a prerequisite for recovery into the Safe.
6. Run the durable retirement proof and an exact-fork simulation of that precise
   withdrawal payload. If no approved payload exists, leave the LP unchanged.
7. Give the reviewed withdrawal payload and evidence to human Safe signers. The AI does
   not sign or broadcast.
8. After withdrawal, pin receipt-block events/balances, exact reconciliation,
   runtime hashes, and old-pool retirement block. Keep the recovered v4 assets
   in custody until the full V5 migration policy explicitly says otherwise.
9. Treat V5 as a new release: fresh source, protected origin commit, deployment
   manifests, new addresses, full tests, human approval, then downstream
   baskets/monitor handoffs and public documentation last.

Useful local evidence:

- pre-execution proposal artifact:
  [`v4-liquidity-stack-recovery-proposal-batch.json`](../deployments/v4-liquidity-stack-recovery-proposal-batch.json)
  (**historical; do not re-import**);
- executed Stage-0 evidence:
  [`v4-liquidity-stack-recovery-stage0-execution-2026-07-31.json`](../deployments/v4-liquidity-stack-recovery-stage0-execution-2026-07-31.json);
- durable fork proof:
  [`NARAV4LiquidityRetirement.fork.test.ts`](../test/fork/NARAV4LiquidityRetirement.fork.test.ts); and
- cross-repository release record:
  [`NARA-20260731-liquidity-stack-reset.md`](releases/NARA-20260731-liquidity-stack-reset.md); and
- full-stack V5 plan:
  [`NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md`](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md).

Run the retirement proof with the configured Base RPC, without printing it:

```powershell
$env:NODE_OPTIONS = "--require ./polyfill.cjs"
npx hardhat test test/fork/NARAV4LiquidityRetirement.fork.test.ts
```

The pinned proof completed the seven-day warp, vault drain, `WindDown`, both
full decreases, zero old active liquidity, exact `363.781444 USDC`
reconciliation, and unchanged reserve. Its sole NARA delta was one raw unit
(`1e-18 NARA`) of explicitly asserted PositionManager round-trip dust. It proves
the mechanism, not permission to reuse stale state or broadcast a transaction.
