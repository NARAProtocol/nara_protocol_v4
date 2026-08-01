# NARA v4 Liquidity Recovery and Retirement Subplan

Change-ID: `NARA-20260731-liquidity-stack-reset`

Status: v4 recovery subplan active. Human Safe signers
executed the no-movement Stage-0 recovery proposal on 2026-07-31; the dedicated
keeper is revoked and `WindDown` is pending to the custody Safe with ETA
`2026-08-07T22:00:35Z`. No LP position has been removed on Base and no further
on-chain transaction is authorized by this document. The user subsequently
expanded V5 to a genuinely new token, engine, reserve, and complete protocol
stack. That architecture is governed by
[NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md).
This file remains authoritative for old-v4 recovery evidence and withdrawal
mechanics only.

Last updated: 2026-08-01.

## Decision

Recover and retire the current v4 NARA/USDC liquidity stack into Safe custody
after the pending `WindDown` matures:

- drain the old vault and compounder bank;
- move the compounder LP NFT to the Safe and fully remove both old LP NFTs in
  one exact-fork-simulated Safe transaction;
- account for old NARA and USDC separately and prove exact conservation;
- leave the old sealed reserve outside this liquidity-withdrawal scope; and
- keep NARA Baskets in preview through the separate complete V5 deployment and
  integration gates.

**Scope correction:** earlier sections of this plan modeled a same-token,
price-preserving liquidity-periphery replacement. That is no longer the V5
decision and those V5 implementation assumptions are historical design input,
not executable instructions. The v4 withdrawal may land assets in the Safe
before V5 exists. Do not seed V5, infer a v4-to-V5 conversion, or reuse the old
pool price without the separately approved complete-stack V5 plan.

## Verified Starting Point

Canonical live state remains [CURRENT_STATE.md](CURRENT_STATE.md). The values
below identify the migration targets; balances and price must be read again at
the migration block.

| Item | Base state on 2026-07-31 |
|---|---|
| Chain | Base, chain ID `8453` |
| Custody Safe | `0xd65c0e390Dc187A22c52c03816591CC736C0D755` (`2 of 3`, interim custody posture) |
| v4 NARA token recovery source (not V5) | `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A` |
| v4 engine retirement source (not V5) | `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9` |
| Old sealed reserve, outside this withdrawal | `0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD`, `650,000 NARA` |
| Active pool ID to retire | `0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318` |
| Active hook to retire | `0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088` |
| Active vault to retire | `0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d` |
| Active compounder to retire | `0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98` |
| Safe-owned seed LP | Position NFT `2884402`; recorded liquidity `4242640687119285` |
| Compounder-owned POL | Position NFT `2885838`; liquidity `931745121747730` after the block-`49371781` keeper compound |
| Active pool configuration | NARA/USDC, fee `3000`, tick spacing `60`, full-range POL |

The current hook has a pending low-fee proposal described in
[NARA_V4_FEE_AND_DEPTH_POLICY.md](NARA_V4_FEE_AND_DEPTH_POLICY.md). Do not
execute that pending `0.75%` to `2%` curve. The proposal cannot activate by
itself, and its Safe finalization must not be signed. Preserve its on-chain and
repository history as evidence rather than rewriting it.

## Recovery Inventory Snapshot (Read-Only)

This is a pinned recovery-builder snapshot, not a redemption quote. The pool,
positions, fees, and direct balances were all read at Base block `49372240`
(`2026-07-31 21:37:07 UTC`), after three sells emptied the liquidity EOA's NARA
and an intervening keeper compound. The builder's exact two-call Safe
`MultiSendCallOnly` simulation and both diagnostic full decreases succeeded
read-only. Do not regenerate the executed Stage-0 artifact. Generate a different
fresh one-block inventory and withdrawal artifact before the later removal.

Snapshot spot price: approximately
`0.000304036052119707 USDC/NARA` at block `49372240`.

| Recoverable source | Actual/estimated NARA | Actual/estimated USDC | Evidence limitation |
|---|---:|---:|---|
| Seed NFT `2884402` full removal, including claimable fees | `244,214.552718396627865941` | `78.858978` | Exact pinned calculation and owner-context full-decrease simulation; output changes with later fees and pool state |
| Compounder NFT `2885838` full removal, including claimable fees | `53,518.118386149543239408` | `16.246494` | Exact pinned calculation and owner-context full-decrease simulation; final old-vault drain can change the later migration state |
| Old growth vault plus compounder bank | `23,930.204667031167298313` | `268.675972` | Direct balances at the same block; later compounding can change their placement |
| **Identifiable migration inventory** | **`321,662.875771577338403662`** | **`363.781444`** | Exact raw-token snapshot including then-claimable LP fees; fresh simulation and receipt reconciliation supersede it |

The `363.781444 USDC` is the amount presently in the scoped pool/vault/
compounder recovery. At the same state, `154.169235 USDC` was already in the
custody Safe and `436.563886 USDC` was in the separate liquidity EOA. A later
scoped pull would therefore leave `517.950679 USDC` in the Safe, while the EOA
balance stays separate unless a human explicitly approves a transfer. All
listed locations sum to approximately `954.514565 USDC`; smallest-unit LP
accounting/rounding makes each fresh builder snapshot authoritative. The
current recovery proposal moves none of these assets.

At the snapshot spot, the scoped NARA marks to approximately `97.797110 USDC`
and the combined scoped inventory marks to approximately `461.578554 USDC`.
That mark is not a realizable exit quote.

The spot-equivalent column is only `NARA amount x snapshot spot price + actual
USDC`. It is not guaranteed sale proceeds, treasury value, minimum output, or a
claim that this amount could be exited without price impact. The recovery and
migration contain **no forced NARA/USDC swap**. Assets remain in their actual
currencies and are moved into replacement POL or the replacement vault.

The recovery builder emits the following inventory fields for one source block
and timestamp. Every later regeneration must preserve them:

| Final builder field | Required evidence |
|---|---|
| Source block and UTC timestamp | Exact Base block used for simulation |
| Source `sqrtPriceX96` and spot USDC/NARA | Direct source-pool `slot0` read with decimal conversion |
| Seed NFT actual NARA and USDC | Full-liquidity decrease simulation for NFT `2884402` |
| Compounder NFT actual NARA and USDC | Full-liquidity decrease simulation for NFT `2885838`, including the effect of the final old-vault drain |
| Old vault actual NARA and USDC | Direct balances immediately before simulated retirement drain |
| Old compounder bank actual NARA and USDC | Direct balances immediately before simulated `WindDown` |
| NARA spot value and total spot-equivalent | Informational arithmetic at that same block, clearly marked non-guaranteed |
| Uncollected/owed LP fees | Separately identified rather than silently folded into principal |
| Migration reconciliation | Per-currency opening inventory, destination use, remainder, and difference |

Treat the removal/move as a migration test with a binary reconciliation result,
not as an estimate that is "close enough." The builder and receipt verifier
must produce:

```text
NARA opening inventory
  = NARA added to replacement seed
  + NARA left in replacement vault/compounder
  + explicitly approved final Safe NARA remainder
  + zero unexplained difference

USDC opening inventory
  = USDC added to replacement seed
  + USDC left in replacement vault/compounder
  + explicitly approved final Safe USDC remainder
  + zero unexplained difference
```

`PASS` requires exact smallest-unit conservation, subject only to explicitly
decoded protocol accounting in the PositionManager receipt; both old named
position liquidities must be zero, the replacement position must be nonzero,
and the reward-reserve delta must be zero. Any unexplained NARA or USDC
difference, hidden swap, unexpected recipient, stale source block, or price
mismatch is `FAIL` and blocks signing or activation.

## Why A Full Liquidity-Stack Reset Is Preferred

The active hook aggregates flow only within one block. Across blocks, a trader
can split an order and repeatedly receive the floor fee. Flattening the active
curve would remove that particular advantage, but it would not solve the more
important compounding constraint: an input-only buy fee produces USDC only,
and an input-only sell fee produces NARA only. Directional activity therefore
banks one asset instead of reliably adding balanced liquidity.

The new design removes the source of both problems:

1. A flat per-swap fee has no size ladder to evade, so it needs no address
   history, block accumulator, or decay function.
2. Every buy captures both USDC and NARA; every sell captures both NARA and
   USDC.
3. Fee phases depend on named protocol-owned positions, not live pool depth,
   spot price, third-party liquidity, trade size, wallet identity, or elapsed
   launch time.

Do not revive either rejected basis:

- **No live-depth fee basis.** Live full-range depth changes with price and can
  also be influenced by liquidity placement. It remains telemetry, not a fee
  oracle.
- **No decaying cumulative-fee credit.** For a nonlinear cumulative curve,
  decaying previously charged fees is not generally equal to recomputing the
  fee at decayed flow. It can create excess credit and fee-free intervals.
  The flat schedule makes the entire accumulator unnecessary.

A new hook address creates a different Uniswap v4 `PoolKey`, so this behavior
cannot be introduced without a replacement pool.

### Live sell, compounding, and false-negative evidence

The depth problem and the operational confirmation race now have live Base
evidence:

| Event | Base evidence | Result |
|---|---|---|
| First `100,000 NARA` sell | tx `0x3fc3e8c2496cc21bda655e097abaf1ae488ff21f06f99d09cba0e4ba6db6e4ff`, block `49371719`, status `1`, gas `222623` | Wallet `-100,000 NARA`, vault `+13,770 NARA`, wallet `+314.389472 USDC`; spot `0.0105511525938483 -> 0.001267444646714848 USDC/NARA` (`-87.98%`) |
| Keeper compound | tx `0x758e915dc9ff9d6917e459942903556a881114d17cf5ee8218f39dd4c23221e5`, block `49371781` | Vault supplied `13,770 NARA + 15 USDC`; compounder used `13,745.616539382264769373 NARA + 17.372123 USDC` including banked inventory and added `490228370306205` liquidity |
| Second `100,000 NARA` sell | tx `0xb78ed436845380938ca036efdc488e3884808f8b1fb74944e6c803fb138ec77c`, block `49371916`, status `1`, gas `205913` | Wallet `-100,000 NARA`, vault `+13,770 NARA`, wallet `+68.465886 USDC`; spot fell again to `0.000500394328467635 USDC/NARA` |
| Final wallet sell | tx `0x508ffac254f3342499af9e0b4efbce23d7f991d9181d37a3fb667e6d5ad2ae87`, block `49372197`, status `1`, gas `194278` | Wallet `-75,772.141376089499042429 NARA`, vault `+10,135.821206413424856364 NARA`, wallet `+25.524550 USDC`; wallet NARA reached zero and spot fell to `0.000304036052119707 USDC/NARA` |

The first sell's output missed its constant-product projection by only
`0.000002 USDC`; the model was accurate. The loss versus the pre-trade spot was
therefore principally shallow depth, with the `13.77%` effective hook fee only
one component. The keeper transaction proves that fee movement and liquidity
addition work mechanically: compounder NFT `2885838` increased from
`441516751441525` to `931745121747730` liquidity, and the two named positions
still equal all pool active liquidity, now `5174385808867015`. It does not make
the fee/depth economics acceptable.

The second and final sells were distinct successful transactions from the same
wallet. Across all three sells, `275,772.141376089499042429 NARA` left the
wallet and `408.379908 USDC` returned; the wallet ended at `0 NARA +
436.563886 USDC`. Whether the second sell was intentional or a retry is an
operator fact that the chain cannot establish, but its timing makes
duplicate-execution prevention mandatory. The reported first-run error is
consistent with the current script's unpinned
read-after-write at `scripts/swapNaraForUsdc.ts:188`: the receipt was already
successful, but a load-balanced RPC could return a stale latest balance and
make the script print `Post-state output is below the protected minimum`.

Replacement transaction tooling must therefore:

- persist and print the transaction hash before any post-state verification;
- treat `receipt.status == 1` as **executed**, never as safe to retry;
- pin post-state reads to `receipt.blockNumber` and reconcile receipt-specific
  ERC-20 `Transfer` logs; use a later confirmation/read only as a secondary
  consistency check;
- classify an unavailable or stale post-read as `EXECUTED — VERIFICATION
  PENDING`, not `swap failed`;
- refuse an automatic or same-parameters rerun until the previous hash and
  nonce have been checked on-chain and a human explicitly approves a new swap;
  and
- add a fork/RPC test that deliberately returns a stale unpinned balance after
  a successful receipt and proves no duplicate transaction is submitted.

The minimum current-script correction is to read
`balanceOf(expectedWallet, { blockTag: receipt.blockNumber })`, but the
receipt-log and duplicate-run guards are also required before replacement
operations are called reliable.

## Historical Same-Token Replacement Architecture — Superseded

The user expanded V5 to a new token, engine, reserve, and complete stack after
this architecture was drafted. Preserve this section as evidence of the fee and
liquidity engineering review only. It is **not** the V5 deployment design and
must not be used to preserve the old token address, carry the old pool price
into V5, or build a same-token cutover. Current V5 authority is
[NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md).

### 1. Replacement hook

The replacement hook must be purpose-built for exact-input NARA/USDC swaps.
Exact-output swaps remain rejected unless a separate security review proves
the complete delta and quote behavior.

For every exact-input swap:

1. `beforeSwap` takes the configured input-leg fee from the specified/input
   currency and reduces the amount reaching the AMM.
2. `afterSwap` takes the configured output-leg fee from the
   unspecified/output currency.
3. Both transfers go directly to the reciprocally bound replacement vault.
4. The hook emits one event containing the pool ID, direction, gross input,
   input currency and amount, gross output, output currency and amount, fee
   phase, and caller/sender fields needed by the monitor.

Required Uniswap permissions therefore include the initialization guard,
before-swap return delta, after-swap callback, and after-swap return delta.
The implementation must prove the sign and denomination of every delta against
a real Uniswap v4 `PoolManager`, not only mocks.

The resulting inventory is deliberately symmetric by direction:

| User action | Input fee captured | Output fee captured |
|---|---|---|
| Buy NARA with USDC | USDC | NARA |
| Sell NARA for USDC | NARA | USDC |

Dual capture materially improves the probability that each maintenance cycle
has both assets. It does not promise perfect balance: price movement,
rounding, pool fees, and asymmetric flow can still leave a remainder. The
compounder must bank and reconcile that remainder.

The hook must also preserve these controls from the current corrected design:

- one supported NARA/USDC pool;
- reciprocal hook/vault/token/base checks before a one-shot bind;
- canonical pool fee and tick spacing fixed in the deployment manifest;
- a one-shot opening-price bind;
- bounded fee parameters with a hard-coded aggregate cap;
- a delay before a fee-phase reduction executes; and
- no engine `REWARD_NOTIFIER_ROLE` or ERC-20 engine-reward route.

The hook must expose a quote/read method that returns both fee legs and the
current phase. The basket app must use a complete replacement-pool quote and
show both hook fees, the separate Uniswap pool fee, expected output, price
impact, slippage, and deadline before confirmation.

### 2. Candidate flat launch-fee phases — parameters not approved

The architecture decision is a flat two-leg fee with objective POL-based
step-downs. The exact rates, caps, observation periods, and milestones below
are **fork-simulation candidates only**. They have not received final human
governance approval and must not be encoded in a deployment or Safe batch from
this document.

The candidate is a symmetric schedule. Percentages in the `Nominal combined`
column are the sum of the two disclosed leg rates; because the output fee is
applied after the input fee, the effective quote impact is compounded and must
be displayed from the actual quote rather than advertised as an exact headline
percentage.

| Phase | Input leg | Output leg | Nominal combined | Objective transition |
|---|---:|---:|---:|---|
| Candidate `BOOTSTRAP` | `7.50%` | `7.50%` | `15.00%` | Candidate opening phase |
| Candidate `GROWTH` | `5.00%` | `5.00%` | `10.00%` | Candidate: named active POL liquidity at least `2 x L0` for 7 continuous days |
| Candidate `MATURE` | `2.50%` | `2.50%` | `5.00%` | Candidate: named active POL liquidity at least `4 x L0` for 14 continuous days |

`L0` is the total active full-range liquidity minted from migrated assets at
the cutover block. Record it once in the verified replacement manifest.
Milestone liquidity is the sum of only the named protocol-owned position NFTs
recorded in that manifest. It excludes third-party positions, flash/JIT
liquidity, token price, configured depth, and idle banked balances.

At the simple linear approximation, equal `7.50%` legs compound to `14.4375%`
before the separate pool fee and price impact; `5.00%` legs compound to
`9.75%`; and `2.50%` legs compound to `4.9375%`. Actual execution must use the
router quote. Product copy must not state that users receive an exact effective
rate from the nominal sum.

Phase transitions are one-way and sequential. They are not automatic with
calendar time, trade count, price, market capitalization, or third-party
liquidity. A transition requires:

- the complete on-chain liquidity threshold for the required continuous
  observation period;
- successful compounding and reconciliation evidence throughout that period;
- healthy epoch and liquidity-maintainer evidence;
- no pending recovery, custody exception, unresolved severity-blocking
  finding, or monitor gap;
- a Safe proposal, the contract's delay, and a separate Safe execution; and
- post-execution readback plus buy/sell quote smoke tests.

The final Solidity constants, basis-point precision, aggregate hard cap,
observation periods, and user-facing fee math may be frozen only after fork
economic tests and explicit human governance approval. Approval must be
recorded in this Change-ID before implementation is called final. The candidate
rates and `2 x`/`4 x` milestones are not operator defaults.

### 3. Replacement vault

The launch vault has one purpose: receive both fee legs and move them to the
bound liquidity compounder. Keep the launch route `Liquidity`-only. Do not add
or enable an engine ERC-20 reward route, and do not grant the vault
`REWARD_NOTIFIER_ROLE`.

Required behavior:

- reciprocal one-shot hook and compounder binding checks;
- per-currency recorded-fee totals split by input and output leg;
- exact balance-delta and exact-spend reconciliation;
- owner-or-narrow-keeper compounding only;
- zero keeper bounty at launch;
- a permanent compounder bind only after a live validation compound;
- deadline and minimum-liquidity guards; and
- no arbitrary owner sweep of NARA or USDC.

The owner may use `compoundAll(0, deadline, "")` only as a reviewed retirement
drain into the bound compounder. A zero minimum during ordinary maintenance is
forbidden because it removes the slippage/failure signal.

### 4. Replacement compounder

The replacement compounder remains full range, exact-spend, and no-swap. It
adds only the balanced portion at the live replacement-pool price and banks
the remainder for the next cycle. This avoids an automatic treasury trade and
does not choose an asset for users.

It must retain:

- immutable vault, token, base, PoolManager, PositionManager, Permit2, fee,
  spacing, and hook bindings;
- one protocol-owned compounding position;
- exact token-use and liquidity-added accounting;
- no caller-supplied arbitrary swap route;
- a production recovery delay of at least seven days with `MigratePosition`,
  `RecoverPoolTokens`, and `WindDown`; and
- Safe custody, with no production key held by an AI agent.

The initial replacement seed position should remain owned by the custody Safe,
as it is today, while the replacement compounder owns its separate accumulated
POL position. Both position IDs must be immutable entries in the deployment
history. This preserves an immediate Safe-controlled abort path for the seed
while keeping compounder POL subject to the disclosed seven-day recovery.

#### One-hour recovery rehearsal, then sealed production delay

The current deployed compounder remains unchanged: its recovery delay is a
hard-coded seven days, so the old-stack proposal in Stage 0 cannot and must not
be shortened.

Because this reset is still early and redeployment is acceptable, the preferred
replacement test is a **disposable rehearsal stack and pool**:

1. deploy the rehearsal compounder with a one-hour recovery delay and only
   capped protocol test liquidity;
2. block public swaps, public routing, and any production manifest from using
   that rehearsal stack;
3. prove proposal, pre-ETA rejection, post-ETA `WindDown`, Safe receipt of the
   NFT and both banked assets, full `DECREASE_LIQUIDITY` plus both `TAKE`s, exact
   smallest-unit reconciliation, and a successful controlled reseed; and
4. retire the rehearsal addresses and deploy the fresh production stack with a
   recovery delay of at least seven days already immutable or irreversibly
   sealed.

This keeps the one-hour escape path out of the production deployment and leaves
the final destination pool uninitialized until the atomic price-preserving
cutover. If a same-deployment commissioning path is implemented instead, it
must be reviewed separately and enforce all of these conditions in code:

- the delay can only increase, has a bounded maximum, and cannot change while a
  recovery is pending;
- the one-hour self-test must be executed or cancelled before the increase;
- public activation is impossible until the self-test passed, the delay is at
  least seven days, no recovery is pending, and the delay is irreversibly
  sealed; and
- commissioning and the shorter delay can never be reopened after sealing.

No production address with an active one-hour recovery path is acceptable.

### 5. Replacement pool and price continuity

The replacement pool uses the retained NARA token and native Base USDC. Its
opening `sqrtPriceX96` must equal the active source pool's `sqrtPriceX96` read
inside the cutover transaction. Do not use the historical `$0.005` opening
price, a chat value, a planned price, or an earlier off-chain snapshot.

Because a normal static Safe batch cannot pass a runtime read into a later
call, the implementation must use a narrowly scoped, reviewed migration
coordinator or equivalent one-shot contract method that:

1. reads the registered source pool's `slot0`;
2. checks a governance-approved min/max migration-price guard;
3. binds the replacement hook to that exact value;
4. initializes the replacement pool at that exact value; and
5. can execute only the named source and destination pool keys.

The coordinator must not have a generic call, token-sweep, reusable approval,
or arbitrary recipient surface. The complete cutover must be simulated from
the Safe on an exact Base fork before signing.

## Recovery And Migration Sequence

The recovery proposal starts a clock; it does not remove liquidity. The final
movement occurs only in the separately reviewed cutover transaction after the
seven-day delay.

### Stage 0 — Completed: seven-day recovery queued

The human `2-of-3` custody Safe executed Stage 0 in transaction
`0xf8079c502c32e037bbb947b0cccd3ef362a4f9b02325cff1f06db0963875435b`
at Base block `49372944` (`2026-07-31T22:00:35Z`). Receipt status was `1`.
The recovery proposal moved no NARA, USDC, NFT, or liquidity. It revoked the
dedicated keeper and queued `WindDown` kind `3` to the custody Safe with ETA
Unix `1786140035` (`2026-08-07T22:00:35Z`, or
`2026-08-08 01:00:35 EEST` in Kyiv).

The instructions below are retained as construction and review evidence. Stage
0 is not a repeatable next step. **Do not rerun, re-import, or re-propose the
artifact; re-proposal overwrites the action and restarts the seven-day delay.**
An AI agent must not broadcast any later transaction.

Before building the proposal:

1. Verify Base chain ID `8453`, the current Safe owner on both old contracts,
   the current Safe runtime/threshold, and the generated deployed ABI.
2. Verify seed NFT `2884402` is Safe-owned and nonzero, compounder NFT
   `2885838` is old-compounder-owned and nonzero, and the old compounder reports
   that same `positionTokenId`.
3. Read and record old vault balances, old compounder banked balances, source
   pool `slot0`, named-position and total pool liquidity, keeper authorization,
   and `pendingRecovery` at one block.
4. Require `pendingRecovery.kind == None`. Do not overwrite an unexpected
   recovery action.
5. Confirm the proposed recipient is exactly custody Safe
   `0xd65c0e390Dc187A22c52c03816591CC736C0D755`.

Build and simulate a Safe `MultiSendCallOnly` batch containing only:

1. `oldVault.setCompoundKeeper(0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7, false)`;
2. `oldCompounder.proposeRecovery(RecoveryKind.WindDown, custodySafe)`.

The historical review builder command was:

```powershell
npm run build:v4:liquidity-recovery-proposal
```

It wrote
`deployments/v4-liquidity-stack-recovery-proposal-batch.json`. The builder is
read-only with respect to Base: it pins and reads state, simulates calls, and
writes a sanitized Transaction Builder file. It does not sign, submit, or
broadcast. That file is now historical executed evidence and must not be
regenerated or re-imported while the real pending recovery exists. Execution
evidence is in
`deployments/v4-liquidity-stack-recovery-stage0-execution-2026-07-31.json`.

`WindDown` is pinned to value `3` from the reviewed deployed-source enum order;
the ABI exposes only `uint8` and cannot recover the enum name or ordering. The
builder must use the generated artifact interface for the function selector and
calldata, while source review plus fork/static-call tests establish and guard
the pinned value. Simulation must reject any unexpected live state and prove
the only intended state changes are keeper revocation and the new
pending-recovery kind, recipient, and ETA. Token balances, position
owners/liquidity, pool `slot0`, pool liquidity, and reward reserve must remain
unchanged.

The complete path is codified in
`test/fork/NARAV4LiquidityRetirement.fork.test.ts` and passed against immutable
Base block `49372240` (hash
`0x02da53fa90857257c4f8b75efe2db57f3de7f19b5874175b09aa0d8dfb948300`).
The exact Stage 0 calls set the keeper to false and queued `WindDown` kind `3`
to the custody Safe while balances, NFT owners/liquidities, pool state, and the
`650,000 NARA` reserve remained unchanged. After a seven-day local warp:

1. the retirement drain zeroed the vault and added `417262115245385` liquidity
   from its NARA plus the compounder's banked USDC;
2. `WindDown` moved the compounder NFT and bank to the Safe and zeroed the bank;
3. the Safe fully decreased both NFTs and took both currencies; and
4. both NFT liquidities and pool active liquidity reached zero while the reward
   reserve remained unchanged.

The `363.781444 USDC` inventory reconciled exactly. The Safe received
`321,662.875771577338403661 NARA`, one raw NARA unit (`1e-18 NARA`) below the
opening scoped inventory because the PositionManager rounds the retirement
add up and the matching full decrease down; the test asserts that sole named
rounding unit rather than hiding it. Production was re-read at block `49372469`
before the real Safe action, with every fork-only transaction hash absent. The
later human Stage-0 transaction then changed exactly the two predicted state
fields. Readback through block `49373282` confirmed keeper `false`, pending
`WindDown` kind `3` to the Safe, ETA `1786140035`, unchanged LP NFT owners and
liquidities, unchanged named balances, and the unchanged `650,000 NARA`
reserve. The transaction and event evidence, not the earlier projected ETA,
prove that the seven-day clock started.

Time passage performs no call. At or after the ETA, a separately built,
exact-fork-simulated, reviewed, and human-signed `2-of-3` Safe withdrawal remains
mandatory. The withdrawal may recover old v4 NARA and USDC to the Safe before
V5 is deployed; it must not seed V5 or infer a token conversion.

The active source pool remains liquid during the wait. The hook continues to
collect fees into the old vault, but automatic liquidity compounding remains
revoked. Keep permissionless epoch maintenance operating. Cancellation is a
deliberate human-Safe decision, not a default cooldown action. Re-proposing
overwrites the pending recovery and restarts the seven-day clock.

### Stage 1 — Parallel V5 design and v4 withdrawal preparation

Use the cooldown rather than waiting idle:

- land the recovery evidence through a protected pull request;
- implement a fail-closed old-v4 withdrawal builder that can only drain the
  named vault/compounder/NFTs to the exact custody Safe;
- run compile, full tests, bytecode, static/fuzz gates, and exact Base-fork
  withdrawal rehearsals;
- separately specify and implement the complete V5 token, engine, reserve,
  selected modules, liquidity stack, custody, tooling, monitoring, and
  integrations under Change-ID `NARA-20260801-v5-complete-stack-reset`;
- run the disposable one-hour full-stack V5 recovery rehearsal, then retire all
  rehearsal addresses; production recovery must be sealed at seven days or
  longer;
- obtain explicit human approval for V5 supply, v4-holder treatment,
  allocations, engine parameters, fee rates, liquidity, custody, and module
  scope;
- continue basket tests but keep every public surface fail-closed in preview;
- do not update a production ABI, address, or manifest from a working tree;
- do not execute the pending old-hook low-fee finalization; and
- monitor pending recovery, owners, LP positions, vault/bank balances,
  source-pool state, reserve, fee-curve executions, and keeper authorization.

### Stage 2 — v4 withdrawal readiness at or after the ETA

Elapsed time is not execution. V5 deployment is not a prerequisite for
recovering old assets into the Safe, but the exact v4 withdrawal must be ready.
Proceed to signing review only when:

- a fresh single-block recovery inventory includes both LP NFTs, claimable
  fees, vault balances, banked balances, actual currencies, and informational
  spot-equivalent;
- the exact withdrawal payload passes on a recent Base fork from the Safe with
  exact per-currency `PASS` reconciliation;
- `pendingRecovery` is matured `WindDown` kind `3` to the exact custody Safe;
- the old keeper remains false;
- both NFT owners and liquidity, runtime hashes, Safe threshold/modules, and
  all named balances match the payload assumptions;
- the old sealed reserve remains `650,000 NARA` and is untouched by the batch;
- every temporary approval is revoked inside the batch; and
- baskets and public surfaces remain preview-only.

If any condition is false, leave the old LP active. Do not call
`executeRecovery()` merely because the ETA passed.

### Stage 3 — Atomic v4 withdrawal to custody

Build one Safe transaction using `MultiSendCallOnly` and only narrowly scoped
helpers where dynamic state passing is unavoidable. Simulate the exact
transaction from the Safe at the intended Base block. It must perform, or
atomically revert, this sequence:

1. Assert chain ID, Safe, source pool/runtime hashes, ownership, revoked keeper,
   matured `WindDown`, both LP NFTs, fresh balances, and reserve exclusion.
2. Call the old vault as owner with the reviewed retirement
   `compoundAll(0, deadline, "")`. Any balanced amount can increase old position
   `2885838`; remainder can stay banked for the next step.
3. Call `oldCompounder.executeRecovery()`. It transfers NFT `2885838` and banked
   v4 NARA/USDC to the Safe; it does not decrease LP liquidity.
4. Decrease 100% of Safe-owned NFTs `2884402` and `2885838` and take both
   currencies to the Safe. Leave historical NFTs empty.
5. Revoke temporary ERC-20 and Permit2 allowances.
6. Assert exact token conservation, zero liquidity in both old NFTs and the old
   pool, zero old vault/bank balances, exact Safe receipts, and unchanged old
   reserve.

No V5 mint, deployment, conversion, price bind, or pool seed belongs in this
withdrawal. If any assertion or postcondition fails, the whole transaction must
revert and the old positions remain unchanged.

### Stage 4 — Record v4 retirement, then continue V5 independently

After the withdrawal receipt succeeds:

1. Save transaction hash, block, both NFT liquidity readbacks, exact NARA/USDC
   deltas, zero allowance/vault/bank readbacks, pool liquidity, and reserve.
2. Mark the old pool retired for protocol routing; call it empty only when a
   named-block read proves total pool liquidity is zero.
3. Keep recovered v4 assets in custody until the approved complete-stack V5
   plan specifies their disposition.
4. Deploy, verify, test, monitor, and activate V5 only through its own protected
   release evidence and explicit human approvals.
5. Update baskets and monitor from the immutable V5 origin and verified
   manifests. Publish public documentation last.

## Abort And Rollback Gates

### Historical pre-clock abort checks — completed for Stage 0

The executed Stage-0 proposal passed these checks. Retain them as evidence; do
not apply the `pendingRecovery.kind == None` requirement to the current state,
which must now be the exact pending `WindDown` recorded above. Before any future
replacement or deliberate re-proposal, stop if any of these is true:

- the old vault or old compounder owner is not the expected custody Safe;
- the Safe runtime, owners, threshold, or module state differs from the
  recorded custody evidence;
- either named old position ID, owner, or liquidity differs unexpectedly;
- `pendingRecovery.kind` is not `None`;
- the keeper address to revoke is not proven from current state;
- the Safe proposal contains any call other than keeper revocation and
  `WindDown` proposal, or moves an asset/approval/liquidity position;
- simulation does not prove zero NARA, USDC, NFT, pool-liquidity, price, and
  reward-reserve deltas; or
- the proposal requires a private key outside approved human custody.

Missing V5 implementation was not a reason to delay the cancellable,
no-movement proposal and is not, by itself, a reason to leave recoverable v4
assets in the old pool after maturity. Missing or failing exact v4 withdrawal
evidence is an absolute reason not to withdraw.

### Abort during the seven-day wait

Do not execute the v4 withdrawal if:

- pending recovery kind, recipient, or ETA changes;
- the old liquidity keeper is re-authorized;
- the pending low-fee curve is executed;
- either old position changes owner unexpectedly;
- the fresh one-block inventory or exact Safe withdrawal simulation fails;
- any withdrawal recipient is not the custody Safe;
- the old reserve would change; or
- a severity-blocking withdrawal finding remains open.

### Transaction-level rollback

Before a successful withdrawal, rollback is automatic: the atomic transaction
reverts in full and the old positions remain active. A matured recovery can be
cancelled or left unexecuted; maturity alone moves nothing.

After a successful withdrawal, do not silently point users back to the old pool
and do not treat custody of recovered v4 assets as a V5 launch. Until V5 passes
its separate gates:

- keep baskets and public activation blocked;
- keep the recovered v4 NARA and USDC in the Safe;
- do not infer holder migration, burn, conversion, allocation, or V5 seed use;
- monitor the retired old pool and old core; and
- publish no availability claim until a new verified state converges.

## Verification Matrix

The v4 withdrawal gates below remain binding where applicable. Same-token
replacement/price-continuity items are historical research only; the complete
V5 verification matrix belongs to
[NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md).

### Contract and unit gates

- compile and complete v4 Hardhat suite;
- bytecode-size gate;
- Slither and the available current static/fuzz gates;
- exact-input buys and sells against a real v4 `PoolManager`;
- input/output delta sign, denomination, rounding, and balance conservation;
- direct and routed swaps cannot bypass either fee leg;
- exact-output rejection and unsupported-pair rejection;
- phase rates, one-way order, timelock, aggregate cap, and milestone evidence;
- reciprocal one-shot hook/vault/compounder binding;
- opening-price continuity and already-initialized destination rejection;
- zero/one-sided balance compounding and remainder accounting;
- keeper revocation and owner-only retirement drain; and
- all three compounder recovery kinds, cancellation, overwrite behavior, ETA,
  and recipient checks.

### Economic and adversarial gates

- one trade versus splits across the same block and hundreds of later blocks;
- sequences equivalent to the observed launch buys, plus sells and round trips;
- dust, alternating direction, sandwich, donation, and third-party/JIT
  liquidity scenarios;
- phase-boundary front-running and milestone spoof attempts;
- price movement during Safe signing and explicit price-bound aborts;
- compounding after buy-heavy, sell-heavy, and alternating flow;
- banked remainder growth and later consumption; and
- complete fee display in basket previews and confirmation screens.

### Exact Base-fork v4 withdrawal gate

The fork proof must use a named Base block and the actual deployed source
addresses. It must impersonate only the custody Safe for simulation and prove:

- old seed NFT `2884402` and compounder NFT `2885838` are both included;
- matured `WindDown` sends the compounder NFT and banked tokens to the Safe;
- the old vault is drained into the bound compounder before recovery;
- both old position liquidities become zero;
- old pool active liquidity becomes zero when the two named positions still
  equal all active liquidity at the execution block;
- all old NARA and USDC deltas reconcile into the Safe;
- temporary allowances end at zero;
- the sealed reserve stays at its pre-transaction balance; and
- reverting any single guard leaves every old position unchanged.

### Separate V5 production gate

V4 withdrawal success is not V5 readiness. Apply every complete-stack gate in
[NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md)
before any new token mint, engine activation, V5 pool seed, basket integration,
or availability statement.

## Basket And Monitor Work During The Recovery Delay

The seven-day cooldown is productive test time, not a launch window.

`NARAProtocol/nara_protocol_v4_baskets` may continue:

- Foundry build and deterministic tests;
- Base adapter fork suites;
- V5 hook/pool quote integration only after generated V5 artifacts exist;
- neutral fee review UI showing both hook fee legs;
- live-depth input cap and fail-closed preview behavior; and
- buy, sell, selected-asset exit, and `withdrawUnderlying` rehearsal.

It must not consume planned addresses, hand-written replacement ABIs, or an
uncommitted protocol tree. Production manifests remain blank until verified
deployment evidence exists.

`NARAProtocol/nara-swarm-monitor` must be prepared to:

- index both fee legs and phase transitions only from a new generated V5 ABI;
- alert on old/V5 pool liquidity, unexpected old-pool routing, keeper state,
  pending recovery, compounding failure, bank imbalance, and phase eligibility;
- retain the old pool as historical from the withdrawal block; and
- use the verified V5 deployment block as its new start block.

The public `NARAProtocol/nara_protocol` documentation updates last and may use
`available` only after every activation gate in the cross-repository release
protocol is satisfied.

## Asset-Custody Rules

- The sealed `650,000 NARA` reward reserve is emissions inventory. It is not a
  liquidity-migration or fee-matching source and must remain untouched.
- No private key, RPC credential, or Safe signer material belongs in a script,
  manifest, release record, CI log, or chat.
- No recovered v4 NARA/USDC goes to an EOA. The atomic withdrawal lands both
  currencies in the custody Safe. Any later use in V5 requires the separately
  approved full-stack migration policy.
- Do not use treasury NARA to mask an unbalanced fee design. A future treasury
  liquidity allocation requires its own approved change and cannot draw from
  the sealed reserve.
- Preserve every old deployment and position record. A replacement manifest is
  additive; it never edits an old address into appearing current.

## Required Evidence Package

Before declaring the v4 withdrawal complete, the origin repository must
contain:

- reviewed withdrawal source/builders and generated ABI evidence;
- a full 40-character protected-branch origin commit;
- focused tests and exact Base-fork withdrawal results;
- recovery proposal transaction, block, ETA, and monitoring record;
- atomic withdrawal transaction, block, position/token reconciliation,
  reserve readback, and zero-allowance proof; and
- an updated release record at
  [releases/NARA-20260731-liquidity-stack-reset.md](releases/NARA-20260731-liquidity-stack-reset.md).

The complete V5 release requires a separate evidence package under
`NARA-20260801-v5-complete-stack-reset`. Until both recovery and V5 packages
exist, the correct state is **v4 recovery pending; complete V5 planned; product
activation blocked**.
