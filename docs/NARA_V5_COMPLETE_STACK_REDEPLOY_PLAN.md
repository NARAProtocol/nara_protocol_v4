# NARA V5 Complete-Stack Redeployment Plan

Change-ID: `NARA-20260801-v5-complete-stack-reset`

Related v4 recovery Change-ID: `NARA-20260731-liquidity-stack-reset`

Status: user-approved architecture direction. A complete selected V5 contract
candidate, test matrix, and deterministic offline deployment planner now exist
locally, but no production parameters, immutable origin, signed payload,
address, token allocation, holder treatment, production transaction, or
availability claim is approved by this document.

Last updated: 2026-08-01.

## Decision

V5 is a genuinely new complete protocol stack. It includes a new token, engine,
reward reserve, position and allocation modules, liquidity contracts and pool,
custody, operations, monitoring, basket integrations, and public configuration.
It is not a same-token liquidity-periphery revision.

The current v4 deployment remains the live recovery/retirement source until
each old-state obligation is accounted for and the relevant retirement gate is
completed. Do not mutate v4 source into V5 or call an old address V5. Build V5
as a new reviewed source tree with new generated artifacts, deployment
manifests, addresses, runtime evidence, and downstream handoffs.

The read-first operational record is
[NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md).
The Hook source/evidence and external-review disposition are
[NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md](NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md).

## Primary Reason And First Workstream — Hook V5

The main reason for the complete V5 reset is to redesign the liquidity hook
from first principles using the live buy, sell, fee, compounding, and depth
evidence. **Hook V5 is design workstream number one.** The rest of V5 must be
specified around its proven accounting and economic requirements.

This is design order, not deployment order. Production deployment will still
respect constructor/address dependencies: the V5 token and any required core
bindings may deploy before the hook even though the hook specification is
completed and approved first.

The v4 evidence established that:

- transaction-size tiers were avoidable by splitting buys across later blocks;
- collecting a fee into a vault did not itself add active liquidity;
- directional input-only fees could leave the wrong currency banked instead of
  producing balanced POL;
- shallow depth dominated execution and produced extreme price impact on sells;
- a mechanically successful compound did not make the fee/depth economics
  acceptable; and
- receipt confirmation tooling must distinguish a successful transaction from
  a stale post-receipt RPC read.

The local Hook V5 baseline now exists, but its production interface and
parameters must not be frozen until it proves:

1. economically equivalent orders cannot materially reduce the intended launch
   fee merely by splitting across transactions, blocks, routes, or wallets under
   the approved policy model;
2. both buys and sells collect the intended currency legs with exact,
   user-visible quote and receipt reconciliation;
3. the fee/compound flow builds balanced **active** protocol-owned liquidity,
   with explicit handling for one-sided flow and banked remainder;
4. launch fees are intentionally aggressive at the beginning and can decrease
   only through objective, manipulation-resistant POL milestones;
5. fee caps, rounding, hook deltas, PoolManager settlement, events, and
   unsupported swap modes are fail-closed and exact;
6. price impact and maximum executable trade guidance come from actual pool
   state and cannot be confused with the hook fee; and
7. keeper failure, delayed compounding, donations, JIT liquidity, MEV, dust,
   alternating flow, and long one-sided sequences preserve conservation.

The user-selected Bootstrap rate is **15% of gross input plus 15% of actual
AMM output** on both buys and sells. These are 30 nominal percentage points,
but the no-impact hook-only reduction in user output is **27.75%** because the
output leg applies after the input leg (`1 - 0.85 * 0.85`). Pool fees and price
impact are additional and must be displayed separately. The approved symmetric
fee phases are **15%, 12.5%, 10%, 7.5%, and 5% per leg**. They advance only in
that order as verified active protocol-owned liquidity reaches the approved
depth milestones. Five percent per leg is the hard floor. The exact POL
milestones, observation periods, range policy, and compounding trigger remain
undecided simulation and approval inputs.

### Hook-first exit gate

Do not freeze the wider V5 implementation baseline or prepare a production
deployment until all of these exist:

- a written Hook V5 accounting/state-machine specification;
- economic simulations reproducing the observed v4 ladder and sell sequence;
- one-trade versus split-trade invariants across the approved policy window;
- real-PoolManager tests for buys, sells, one-sided fees, compound, withdrawal,
  and recovery;
- exact quote/event/vault/POL reconciliation;
- adversarial and long-sequence tests; and
- explicit human approval of the selected fee and POL policy.

## Two Separate Accounting Tracks

### Track A — recover and retire old v4 liquidity

The old compounder has a pending seven-day `WindDown`. Human Safe signers
successfully started it in Base transaction
`0xf8079c502c32e037bbb947b0cccd3ef362a4f9b02325cff1f06db0963875435b`
at block `49372944`. Authoritative ETA is Unix `1786140035`, or
`2026-08-07T22:00:35Z` / `2026-08-08 01:00:35 EEST` in Kyiv.

Stage 0 moved no asset. At or after the ETA, a different exact-fork-simulated
and human-signed Safe transaction must drain the old vault/bank, execute the
matured recovery, fully remove LP NFTs `2884402` and `2885838`, and take old v4
NARA plus USDC into custody. V5 does not need to be deployed first.

The pinned pre-withdrawal baseline was
`321,662.875771577338403662 v4 NARA + 363.781444 USDC`. It is not a future
receipt; recompute at one block immediately before withdrawal. The custody Safe
already held `154.169235 USDC`, the separate liquidity EOA held
`436.563886 USDC`, and the three listed locations contained
`954.514565 USDC` in total at that snapshot.

### Track B — specify, build, deploy, and activate V5

V5 has a different token address. Recovered v4 NARA is not V5 NARA and cannot
seed a V5-token/USDC pool unless an explicit, reviewed conversion or allocation
mechanism says so. Recovered USDC is technically reusable, but no V5 deployment
may spend it without an approved allocation and Safe transaction.

Do not combine Track A with a V5 mint, conversion, opening-price decision, or
pool seed. The default operational boundary is:

1. withdraw and reconcile v4 assets to the Safe;
2. keep them in custody;
3. finish the V5 specification and protected release; and
4. deploy/fund V5 only through separately reviewed human actions.

## Old v4 Reality That V5 Must Respect

- v4 `NARAToken` at `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`
  has no owner, upgrade, global pause, blacklist, or ordinary governance burn.
  It will continue to exist on Base after V5. Retirement means removing it from
  official routing/integrations and publishing the exact V5 address, not
  claiming the old token was destroyed.
- v4 `NARAEngine` at `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9`
  has no global shutdown. A fresh final read must prove positions, locked
  balances, weights, claims, ETH, tokens, roles, and epoch state before a
  retirement action is proposed. Never call it technically dead.
- v4 `NARARewardReserve` at
  `0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD` is sealed to the old engine. The
  old engine can pull its v4 NARA; the reserve cannot sweep NARA as ordinary
  rescue inventory. Its `650,000 v4 NARA` is neither V5 capital nor part of the
  liquidity withdrawal.
- v4 NARA and V5 NARA may share a symbol but are different assets. Every UI,
  monitor, basket, explorer link, manifest, and public document must distinguish
  them by full address and version.

## Complete V5 Component Inventory

Names below are design roles, not approved final contract names. Dependency
order matters.

Base infrastructure is verified and reused, not redeployed as V5:

| External dependency          | Base address                                 |
| ---------------------------- | -------------------------------------------- |
| Native USDC                  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Uniswap v4 `PoolManager`     | `0x498581fF718922c3f8e6A244956aF099B2652b2b` |
| Uniswap v4 `PositionManager` | `0x7C5f5A4bBd8fD63184577525326123B519429bDc` |
| Permit2                      | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Universal Router             | `0x6ff5693b99212da76ad316178a184ab56d299b43` |

The production V5 manifest must pin chain ID `8453`, full addresses, runtime
hashes, and reviewed versions for these dependencies.

### 1. Governance, custody, and migration control

- approved V5 admin Safe or timelock;
- separate V5 treasury Safe;
- explicit owner/admin/parameter/treasury/emergency/keeper role matrix;
- deployer-renunciation and role-handoff batches;
- recovery and incident-response policy; and
- a conditional v4-to-V5 claim/escrow distributor only if holder migration is
  explicitly selected.

The current interim v4 `2-of-3` Safe does not satisfy the recorded target of
separate `3-of-5` admin and treasury Safes plus timelock. The production V5
custody posture must be approved before any deployment payload exists.

### 2. Atomic V5 core

- fresh launcher/deployment coordinator;
- fresh fixed-supply V5 token;
- fresh V5 engine;
- V5 engine types, accounting, and model libraries;
- fresh V5 reward reserve, one-shot bound and funded for the new token/engine;
  and
- explicit circular immutable construction for token flash-fee sink and engine
  token binding.

The launcher pattern is required only if the reviewed V5 design retains the
token/engine circular immutables. Do not copy it mechanically without proving
the new constructor and CREATE2 invariants.

### 3. Complete V5 liquidity stack

- fresh V5 liquidity growth vault;
- fresh CREATE2 hook deployer if hook-address flag mining remains required;
- freshly mined V5 growth hook;
- fresh V5 compounder;
- new V5-token/native-USDC PoolKey and pool ID;
- dedicated non-proxy V5 POL-custody-owned seed NFT, with immutable approved
  Safe recovery authority and a sealed production delay of at least seven days;
- compounder-owned named POL NFT under equivalent recovery and removal rules;
- atomic register/initialize/seed tooling;
- withdrawal, retry-safe receipt reconciliation, and recovery tooling; and
- verified liquidity-monitor event/address/start-block configuration.

The Hook only accrues both fee currencies to its bound Vault. The Vault must
implement this one-way routing state machine:

`Unbound -> BootstrapLiquidity -> Shared -> Retired`

- `BootstrapLiquidity` permanently classifies 100% of both-currency claims for
  liquidity, with no keeper bounty from those claims.
- `Shared` applies one immutable, human-approved Engine percentage `X` only to
  fees accrued after the transition, identically for both currencies; the
  remainder stays liquidity-classified.
- Cumulative telescoping allocation per currency must make order splitting
  irrelevant and leave rounding dust with liquidity.
- There is no retroactive reclassification, arbitrary owner-selectable route
  mode, 100%-Engine escape, or direct Hook-to-Engine token path.
- `X` remains unapproved. In Shared mode, the Vault calls the dedicated
  `accrueLiquidityFees` surface synchronously to fix active/inactive entitlement
  at swap accrual. The permissionless and claim-internal
  `syncLiquidityFeeBacking` then exact-pulls all backing through the Vault's
  Engine-only `releaseAllEngineClaimsToEngine`; funding never resamples weight.
  This is not the V4 notifier pattern.

The V5 pool receives a newly approved opening price, FDV, V5-token amount, and
USDC amount. Do not preserve or infer the v4 spot or historical `$0.005` opening
price across a different token.

### 4. Allocation, position, Genesis, bond, and operations stack

- V5 operations vesting vault;
- V5 bond inventory vault;
- V5 position-account clone implementation;
- V5 art/metadata modules selected for the canonical renderer;
- V5 canonical position renderer;
- V5 position NFT/controller;
- V5 Genesis reward distributor; and
- canonical V5 NFT bond depository.

The raw non-NFT bond path is a separate decision. Do not deploy it merely
because a v4 implementation exists. Deployment does not equal activation:
the canonical NFT bond depository and its sealed inventory vault deploy with a
positive, immutable lifetime ceiling, but that allocation remains in Treasury.
The vault is unfunded, no terms are queued, and live market capacity is zero
until a separate reviewed queue/fund/activate payload passes the bond gates.

The local V5 bond baseline is deliberately one-campaign and terminal. Its term
capacity, depository lifetime ceiling, release allocation, and vault allocation
must be identical. Funding is permitted only after one valid delayed term is
queued; activation requires exact funding. The depository enforces the Engine
lock envelope, previews the epoch-aligned unlock, and binds each buy to minimum
payout, deadline, maximum unlock, and the exact term hash. Sold-out,
admin-cancelled, expired, and admin-closed campaigns cannot reopen. Unsold and
later-donated inventory is recoverable only to the immutable release recovery
recipient after the immutable delay. The fixed-price versus oracle/TWAP policy,
exact price, duration, capacity, and lock are still human approval decisions,
not defaults inferred from this implementation.

### 5. Routers, lenses, and operations views

- V5 user router;
- V5 dashboard lens;
- V5 position-data lens;
- V5 protocol-stats lens;
- V5 engine-operations router;
- V5 circulating-supply view; and
- any replacement maintenance coordinator needed for reliable clockwork.

Do not deploy a BribeRouter by default. The v4 generic ERC-20 reward-notifier
path is operationally disabled because of its accounting defect; V5 must fix or
remove that design before any notifier extension exists.

### 6. Product and operational integrations

- permissionless/user-triggered epoch advancement plus a reliable monitored
  maintainer or redesigned clockwork mechanism;
- liquidity keeper plus scheduler and manual fallback;
- indexer/monitor schemas, alerts, start blocks, runtime hashes, and Commander
  state language;
- sanitized ABI/address/role/manifest handoffs;
- basket fee collector, four approved basket managers, selected adapters and
  oracle feeds;
- publishable baskets frontend configuration; and
- smoke, exit, soak, incident, and public-status tooling.

### 7. Explicitly optional or deferred modules

Decide rather than infer whether the first V5 release includes:

- V5 staking/stNARA pool;
- Pendle SY adapter;
- fractional-position factory and instances;
- raw-position bond depository; or
- any additional router/extension.

Do not reintroduce Lotto, Arena, Sponsor Hub, MisterMint, mining, jackpot, or
archived v3 behavior. Do not treat the existing
`contracts/v4/NARAPositionRendererV5.sol` art revision as evidence that the new
protocol V5 exists.

## Decisions That Must Be Frozen Before Deployment

Every row is **UNDECIDED except for facts explicitly approved in this plan or a
linked reviewed specification**. Approved values must still be verified in
source and tests; they must not be silently reopened or extrapolated.

| Decision                    | Required exact evidence                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token identity              | Name, symbol, decimals, chain, fixed supply, address derivation policy                                                                                                                                                                                                    |
| Token features              | Permit, ERC-1363, multicall, flash behavior/fee/sink, transfer invariants, no hidden mint path                                                                                                                                                                            |
| Allocation                  | Every allocation and recipient; exact sum equals fixed supply; reserve, POL, claims, bonds, ops, treasury, baskets/ecosystem all named                                                                                                                                    |
| v4-holder treatment         | No migration vs snapshot claim vs surrender/escrow; no assumption is allowed                                                                                                                                                                                              |
| Migration snapshot          | Exact block/hash, eligible/excluded address rules, reproducible raw dataset and Merkle root if used                                                                                                                                                                       |
| Claim math                  | Ratio, cap, decimals, rounding, dust, deadline, unclaimed disposition, double-claim and replay prevention                                                                                                                                                                 |
| Old v4 NARA                 | Custody, official deprecation, any claim escrow, and disposition of recovered v4 liquidity tokens                                                                                                                                                                         |
| Old engine                  | Final position/lock/claim/balance read, epoch/emission posture, fee withdrawal, role revocation/renunciation, preserved user exits                                                                                                                                        |
| Old reserve                 | Acknowledge it remains bound to v4; never count it as V5 supply or recoverable liquidity                                                                                                                                                                                  |
| V5 reserve                  | Allocation, funding, one-shot binding, sealing, and whether a long-delay one-way successor migration exists                                                                                                                                                               |
| Engine model                | Epoch length, emissions, commitment math, fees, JIT behavior, maintainer dependency, reserve pulls, reward tokens                                                                                                                                                         |
| Module scope                | Which components deploy now, deploy disabled, or remain deferred                                                                                                                                                                                                          |
| Custody                     | Safe addresses/thresholds, timelocks, role separation, deployer removal, modules/guards                                                                                                                                                                                   |
| Approved Hook fee curve     | Symmetric `15%, 12.5%, 10%, 7.5%, 5%` per leg; sequential active-POL reductions only; `5%` per-leg floor                                                                                                                                                                  |
| Unapproved liquidity inputs | Opening price/FDV, V5 amount, USDC amount/source, range policy, exact POL thresholds/observations, token/base trade minimums, seed and Compounder immutable/per-call usage floors, compound trigger/min-liquidity policy, inactive Engine recipient, and Engine share `X` |
| Recovery                    | All recovery kinds/recipients/delays; one-hour rehearsal only; production delay at least seven days and irreversible/sealed                                                                                                                                               |
| Activation                  | Preseed, seed, smoke, keeper, monitor, exits, soak, basket, frontend, and public-state gates                                                                                                                                                                              |

Never infer that the liquidity EOA ending with zero v4 NARA means there are no
other v4 holders. Holder treatment requires a full reproducible chain snapshot.

## Known v4 Behavior V5 Must Not Copy Blindly

### ERC-20 reward-notifier accounting

The deployed v4 engine's generic ERC-20 notifier is disabled operationally
because later notifications can strand part of token distributions. V5 must
either remove the generic path or repair and prove denominator/accounting
behavior across repeated notifications, zero-weight intervals, claims, and
rounding. No extension receives notifier authority until this closes.

### Epoch availability

v4 user writes can advance only eight epochs in-call and still require the
external maintainer to prevent a larger backlog. V5 must make the desired
availability contract explicit and test long downtime, sequencer/RPC outages,
permissionless catch-up, bounded gas, scheduler failure, monitoring, and manual
fallback. "Click like a clock" requires observed sustained execution, not only
an eight-epoch buffer.

### Launch-liquidity fees and depth

The v4 progressive fee can be avoided by splitting orders across blocks, and
the shallow pool caused extreme price impact. V5 must prove:

- the exact fee is understandable and invariant under economically equivalent
  order splitting within the selected policy window;
- buy and sell fee legs build the intended currencies for active liquidity;
- all fee paths, caps, rounding, events, and quote/UI displays agree;
- phase reductions use objective protocol-owned-liquidity milestones; and
- one-sided flow, alternating flow, dust, JIT liquidity, donations, sandwiching,
  and keeper outages cannot corrupt accounting or silently stall growth.

Bootstrap is fixed at `15% input + 15% output` in both directions. The frozen
phase curve is `15%`, `12.5%`, `10%`, `7.5%`, then `5%` on each leg. The
implementation caps each leg at `1,500 bps`, caps the Bootstrap hook-only
effective rate at `2,775 bps` before explicitly bounded raw-unit rounding,
permits only sequential 250-bps reductions, and rejects any phase below the
`500 bps` per-leg floor. Exact active-POL milestones and observation windows
remain simulation and explicit-approval inputs. They must use designated live
position liquidity, never the old fixed `300 USDC`/`60,000 NARA` depth pair or
a spot-price-dependent pool-reserve snapshot.

## Recovery-Delay Commissioning Rule

The user's one-hour request applies only to a disposable, non-public complete
V5 rehearsal deployment:

1. deploy every in-scope rehearsal component with one-hour recovery;
2. exercise complete deployment, custody, fee, compounding, pull, removal,
   shutdown, and reseed behavior;
3. reconcile every token/NFT/role/allowance/event at receipt blocks;
4. retire and permanently exclude every rehearsal address; and
5. deploy a separate fresh production stack whose recovery delay is already
   immutable or irreversibly sealed at seven days or longer.

Never decrease the delay of a production address. If a configurable
commissioning transition exists, it must be one-way non-decreasing, require no
pending recovery, seal irreversibly, block activation while below the production
minimum, and be proven impossible to reopen.

## Implementation and Release Sequence

### Phase 0 — finish v4 recovery independently

- preserve the executed Stage-0 evidence;
- build and test the exact atomic v4 withdrawal;
- after ETA and human review/signatures, recover old liquidity into the Safe;
- pin receipt-block reconciliation and retirement evidence; and
- keep recovered v4 assets in custody pending explicit V5 disposition.

### Phase 1 — freeze the V5 specification

- complete and approve the Hook V5 exit gate first;
- close every undecided row above;
- produce a threat model and invariant register;
- define contract/module dependency graph and deployment/activation boundaries;
- define v4-holder and old-state treatment; and
- obtain explicit human approval for supply, allocations, custody, economics,
  and launch scope.

### Phase 2 — implement V5 without mutating v4 history

- add a dedicated `contracts/v5/` source tree and V5 test/deployment surfaces;
- keep `contracts/v4/` intact as the recovery and historical source;
- use generated V5 artifacts only;
- create deterministic builders that fail closed on chain, address, role,
  runtime hash, balance, nonce, pending action, or manifest mismatch; and
- never place planned addresses in consumer production configuration.

The active compile now includes a complete selected V5 contract candidate under
`contracts/v5/`: Token, Reserve, Engine, canonical positions, selected
modules/periphery, Vault, named-POL custody, no-swap Compounder, phase
Controller, Hook, seed initializer, real PositionManager adapter, and CREATE2
factory. `scripts/v5/lib/v5DeploymentPlan.ts` builds an offline deterministic
22-component plan with constructor/runtime evidence, Hook nonce, nested account,
external dependency, execution-window, setup-action, and atomic activation
commitments. `scripts/v5/lib/v5ProtectedSwapPlan.ts` now builds an unsigned,
route-bound SwapProtection V1 plan from V4Quoter's already-Hook-adjusted net
output without double-discounting the output fee. This local source and these
planners do not authorize deployment. Approved Quoter/runtime evidence,
Universal Router calldata and fork coverage, basket integration, production
inputs, immutable origin, independent external review, and actual rehearsal
evidence remain absent.

The final local hardening pass also removes five concrete failure modes:

- delayed Engine funding cannot let a later locker capture older fees;
- a dust accrual cannot starve claims because claims self-fund atomically;
- an epoch-stale Engine routes its share inactive without reverting swaps or
  rewarding expired weight;
- phase observations cannot mature before Hook activation or survive a queued
  retirement; and
- existing-position LP fee credits are harvested separately before new
  principal, so a positive delta cannot brick `SETTLE_PAIR`.

The Base fork proves this local one-hour domain through real Base PoolManager,
PositionManager, and Permit2, including both named NFT removals and zero final
active liquidity. It is simulation evidence only, not the required disposable
onchain rehearsal deployment.

### Phase 3 — disposable one-hour full-stack rehearsal

- deploy the entire selected V5 graph in a non-public environment;
- execute all role handoffs, funding, pool, trade, compound, recovery, removal,
  engine catch-up, position, claim, bond-closed plus isolated full bond
  lifecycle, basket, monitor, and exit scenarios;
- prove retry-safe receipt-block accounting and exact conservation;
- record failures and amend source/specification; and
- retire every rehearsal address.

### Phase 4 — protected production release

- complete deterministic, fork, fuzz/invariant, economic, static-analysis, and
  independent audit/review gates;
- merge through protected CI with a full immutable origin commit;
- scan staged source/artifacts/builders for secrets and stale v4 addresses;
- create the cross-repository handoff under this Change-ID; and
- obtain explicit human approval for the exact production deployment payload.

### Phase 5 — dormant production deployment and custody

- deploy fresh V5 contracts in dependency order;
- verify source, constructor inputs, CREATE2 derivations, runtime hashes,
  token/engine/reserve circular bindings, supply and allocations;
- bind and reciprocally verify every direct non-proxy liquidity companion,
  independently recompute its domain-separated static configuration hash, and
  seal configuration irreversibly before Hook activation;
- transfer and verify roles to approved Safes/timelocks;
- revoke deployer roles and temporary approvals;
- keep pools, bonds, baskets, and public surfaces closed; and
- write additive sanitized manifests without rewriting v4 history.

### Phase 6 — pool activation, clockwork, and validation

- initialize/seed the V5 pool through the reviewed atomic builder;
- verify the exact named, recovery-locked, active POL positions and Controller
  observation state, then activate the Hook against the already sealed bindings;
- run small reviewed buy/sell receipts and reconcile both fee legs;
- run guarded fee processing/compounding and re-verify POL NFT custody and
  accounting without changing the sealed configuration;
- authorize monitored maintainers/keepers only after validation;
- prove engine catch-up and manual fallback;
- index from exact start blocks; and
- complete the required stability soak without severity-blocking findings.

### Phase 7 — baskets and public release

- update baskets only from the immutable V5 origin and verified manifest;
- repeat Foundry, adapter-fork, exact-pull, buy/sell/exit, fee-display, and
  frontend preview gates;
- update monitor addresses/ABIs/start blocks and mark every v4 address
  historical from exact retirement blocks;
- update public documentation last; and
- use `available` only after deployment, configuration, indexing, smoke, exits,
  keeper, and soak evidence all pass.

## Minimum Verification Matrix

### Core/token/reserve

- fixed supply and allocation sum exact;
- no post-launch mint or hidden allocation path;
- flash/permit/ERC-1363/multicall invariants where retained;
- token/engine/reserve bindings exact and one-shot;
- repeated reward notifications cannot strand value;
- epoch backlog and long-downtime recovery bounded and live; and
- claims, fees, rounding, pause/recovery, and role transitions proven.

### Position/Genesis/bonds/ops

- clone ownership and NFT/engine position identity exact;
- transfer, claim, unlock, metadata, receiver, and ETH-rejection paths;
- Genesis accounting and repeated funding/claim behavior;
- bond markets default unfunded and closed even though their immutable lifetime
  allocation ceiling is positive;
- bond release allocation, Vault allocation, term capacity, and total payout
  reconcile exactly, with exact-lattice price math and atomic failure rollback;
- bond queue -> fund -> activate -> protected buy -> NFT unlock/close works as
  one complete user flow, including exact epoch-aligned unlock disclosure;
- sold-out, cancel, expiry, and admin-close terminal paths recover every unsold
  or later-donated token only after the immutable delay and never reopen;
- vesting math and custody; and
- every deferred module demonstrably inactive.

### Liquidity/economic

- real PoolManager buy/sell paths and unsupported-mode rejection;
- dual-leg fee deltas, split-order invariants, caps, rounding, events, and UI;
- one-sided/alternating flow, dust, donation, JIT, MEV, and keeper failure;
- opening price/FDV and seed allocation exact;
- compounding/banked balances/POL ownership/conservation;
- all recovery kinds and recipient/delay/seal rules; and
- full withdrawal/reseed rehearsal with zero leftover approvals.

### Operations/integration

- Safe thresholds/modules/guards and complete role separation;
- deployer/EOA roles zero after handoff;
- generated ABI/runtime/manifest parity;
- monitor indexing and deterministic alerts from exact blocks;
- keeper/scheduler failure plus manual fallback;
- basket adapters/oracles/fee collector/admin/exits; and
- preview, smoke, soak, rollback, incident, and public-state language.

## Stop Conditions

Stop implementation, deployment review, or activation if any of these is true:

- token supply, allocation, v4-holder treatment, or old-state disposition is
  still implicit;
- any planned V5 address is presented as deployed or verified;
- old v4 NARA is counted as V5 NARA without an approved conversion mechanism;
- the old sealed reserve is counted as V5 funding;
- the one-hour delay appears on a production candidate;
- the V5 engine copies the notifier or backlog defect without a proved fix;
- custody is an unapproved EOA or incomplete interim posture;
- a consumer uses an uncommitted tree, hand-written ABI, or planned address;
- a deploy, Safe, pool, role, or seed payload lacks exact-fork simulation and
  independent review; or
- any document claims V5 is live, audited, safe, production-ready, or available
  without current evidence for that exact statement.

## Current State Label

Until verified V5 deployment manifests and activation evidence exist, use:

**v4 recovery/retirement state; Stage-0 WindDown executed and pending maturity;
complete selected V5 contract candidate locally implemented/tested but
undeployed and unapproved; no V5 address deployed; product activation blocked.**

After v4 liquidity withdrawal but before V5 launch, use:

**v4 liquidity recovered to custody; old pool retired for protocol routing;
complete V5 planned or in testing; no public product available.**

Onchain or production writes by this plan or its authoring AI: **none**.
