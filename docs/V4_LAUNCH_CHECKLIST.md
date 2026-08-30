# V4 Launch Checklist

Last updated: 2026-08-30.

> **Technical live testing on Base mainnet — not public product availability.**
> This checklist governs engineering evidence. It does not establish audit
> completion, safety, legal approval, jurisdictional availability, or a
> recommendation to transact. This repository contains no evidence of completed
> jurisdiction-specific qualified legal review.

> **Active fixed-v4 checklist.** The candidate must be a fresh full-v4
> deployment from one immutable reviewed origin commit. Controlled Stage A and
> the 2026-07-30 pool are historical incident/recovery evidence only. Never
> reuse their addresses, manifests, role assignments, or pool state. The
> experimental protocol V5 stack is obsolete and deleted.

Use this file when starting cold.

## Current checkpoint — pool and Compounder in technical live testing

Fresh core deployment from protected origin commit
`027af3f06bbe6dea2c187dfd8062e50c228f1c35` has completed on Base and all
seven core contracts are source-verified. Human Safe signers accepted
Hook/Vault ownership, deployed and wired the source-verified Compounder, and
executed the reviewed atomic `60,000 NARA` / `300 USDC` pool activation.

| Component | Address |
|---|---|
| `NARALauncher` | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` |
| `NARAToken` | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| `NARAEngine` | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` |
| `NARARewardReserve` | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` |
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` |
| `Create2HookDeployer` | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` |
| `NARALiquidityCompounderV4` | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` |

Canonical pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.

The atomic Safe transaction
`0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`
at block `49721188` registered and initialized the pool and minted full-range LP
NFT `2898124` to the production Safe with liquidity `4242640687119285`.
Twenty live buys and ten live sells subsequently reconciled their Hook fees,
Vault accounting, transfers, and receipt blocks. A later same-block 20-action
buy and exact 20-action reversal also reconciled.

Stop before public product activation. The bounded Compounder validation minted
LP NFT `2898486`, and the separate permanent Vault binding freeze succeeded.
At the latest receipt-pinned compound, that position had liquidity
`4386316228001171`. Engine backlog recovery also succeeded. Both maintainers
are active under separate bounded policies, credentials, and schedules. The
Engine lifecycle smoke remains pending; the Position NFT Phase-2 manifest
remains `integrationReady: false`; baskets remain preview-only. Current
authority is `CURRENT_STATE.md` and its referenced manifests/releases.

---

## Rules

- Do not reuse Stage A, the 2026-07-30 pool, or the retired 2026-04-23 stack as
  any part of the public launch candidate.
- Do not deploy or configure a consumer until the full 40-character reviewed
  v4 origin commit and new verified deployment manifest exist.
- Do not deploy or document retired liquidity tax contracts as current v4 launch code.
- Do not run preflight, seed, or smoke scripts against default retired addresses.
- Do not seed liquidity before core preflight passes.
- Do not treat deployment as complete until smoke tests pass.
- For Position NFT Phase 2, use only the dedicated seven-contract workflow.
  `deploy:v4:allocations` is a retired refusal guard, not a dry run or fallback.
- Verify the tax boundary precisely: supported exact-input swaps through the
  one registered canonical NARA/USDC Hook pool are charged; exact-output is
  rejected; ERC-20 transfers and third-party/unregistered pools are not
  universally taxed.
- Do not open public locks, bonds, or composability if docs, deployment logs, frontend config, and live contracts disagree.

---

## Read First

1. [CURRENT_STATE.md](CURRENT_STATE.md)
2. [UNISWAP_V4_HOOK.md](UNISWAP_V4_HOOK.md)
3. [NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md](NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md)
4. [NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md)
5. [NARA_V4_COMPOUNDER_VALIDATION_RUNBOOK.md](NARA_V4_COMPOUNDER_VALIDATION_RUNBOOK.md)
6. [NARA_V4_NFT_PRODUCTION_PLAN.md](NARA_V4_NFT_PRODUCTION_PLAN.md)
7. [NARA-20260821-v4-position-nft-phase2.md](releases/NARA-20260821-v4-position-nft-phase2.md)

Historical incident context is summarized in `CURRENT_STATE.md`; no historical
manifest or missing local runbook is launch authority.

---

## Required Current Contracts

Fresh full-v4 core deploy (`deploy:v4:base:usdc`) must create a new:

- `NARALauncher`
- `NARAToken`
- `NARAEngine`
- `NARARewardReserve`
- `NARALiquidityGrowthVault`
- `NARALiquidityGrowthHook`
- `Create2HookDeployer`

Liquidity compounder deploy (`scripts/deployLiquidityCompounderV4.ts`, after the vault exists):

- `NARALiquidityCompounderV4`  ← then `vault.setCompounder(...)`, then `vault.freezeCompounder()` once validated. **Without this, `Liquidity` route mode is inert. Input-only fees can remain one-sided; only balanced NARA/USDC inventory compounds into active POL.**

Position NFT Phase 2 (`deploy:v4:position-nft`) must deploy exactly, in order:

1. `NARAArtMetadataV1`
2. `NARAArtSecurityPrintV1`
3. `NARAArtCorePlateV1`
4. `NARAArtGenesisPlateV1`
5. `NARAPositionRendererV5`
6. `NARAPositionAccountV4`
7. `NARAPositionNFTV4`

Phase 2 does not deploy or bind `NARAOpsVaultV4`, `NARABondVaultV4`, either
bond depository, `NARAGenesisRewardDistributorV4`, any allocation, or any
Router/Lens contract. Those are Phase 3 and need a separate manifest, approval,
and runbook. No `GenesisMinterSet` event is permitted in Phase 2.

Phase 3 Router/Lens deploy (`deploy:v4:router:lens`), if separately approved,
must use:

- `NARARouter`
- `NARADashboardLens`
- `NARAPositionDataLensV1`
- `NARAProtocolStatsLensV1`
- `NARACirculatingSupplyV1`

`BribeRouterV4` is intentionally not deployed. Do not grant
`REWARD_NOTIFIER_ROLE` to any launch component.

Optional Phase 3 composability deploy, if separately approved, must use:

- `NARAStakingPoolV4`
- `NARAStakingPoolSYV4`
- `NARAFractionalPositionFactoryV4`

> Intentionally NOT deployed: `NARABondDepositoryV4` (raw-position bond path — superseded by the NFT
> path) and `NARAFractionalPositionV4` (deployed per-position by the factory at runtime, not at launch).
> Everything else under `contracts/v4/` (excluding `mocks/`, `interfaces/`, `libraries/`) is covered above.
>
> **Automated guard:** `test/deployCoverage.test.ts` (runs in `npm test`) fails if any deployable v4
> contract is not referenced by a `scripts/deploy*.ts` script. When you add a new contract, either wire
> it into a deploy script or add it to that test's `INTENTIONALLY_NOT_DEPLOYED` map with a reason —
> otherwise the suite goes red. This is what makes "we forgot to deploy X" impossible to ship silently.

---

## Pre-Deploy Inputs

Confirm you are working in:

```text
nara-protocol-hardhat/
```

Confirm `.env` is set for fresh Base deployment:

```bash
PRIVATE_KEY=
BASE_RPC_URL=
V4_ADMIN_ADDRESS=
V4_TREASURY_ADDRESS=
V4_TOKEN_NAME=NARA
V4_TOKEN_SYMBOL=NARA
V4_INITIAL_NARA_AMOUNT=
V4_INITIAL_USDC_AMOUNT=
```

Confirm compounder decision is explicit:

```bash
V4_COMPOUNDER_ADDRESS=
V4_COMPOUND_KEEPER_ADDRESS=
```

or:

```bash
V4_SKIP_COMPOUNDER=1
```

Production rules:

- `V4_ADMIN_ADDRESS` must be the intended final admin Safe or timelock.
- `V4_TREASURY_ADDRESS` must be the intended treasury.
- `V4_INITIAL_NARA_AMOUNT` and `V4_INITIAL_USDC_AMOUNT` must be intentional launch pricing inputs.
- Do not override `V4_BASE_USDC_ADDRESS`; production uses Base native USDC.
- Do not use `V4_ALLOW_NON_BASE=1` for production.
- The replacement-liquidity deployment must leave its pool uninitialized.
  Initialization belongs to the separately reviewed seed workflow.

---

## Local Gate

Run before mainnet deployment:

```bash
npm run build
npm run test:v4
npm run test:nft:v4
npm run test:bond:v4
npm run test:bond-nft:v4
npm run test:invariants:v4
npm run test:composability:v4
npm test
npm run size
```

Pass criteria:

- Build passes.
- Current v4 growth-hook tests pass through `npm run test:v4`.
- NFT and NFT bond tests pass.
- Invariant regression tests pass.
- Composability tests pass if composability is in launch scope.
- Full suite passes.
- Bytecode size check passes.

Latest known local result:

- Deterministic non-fork Hardhat suite: 759 passing on 2026-08-30. Opt-in
  Base-fork cases were not exercised by that documentation-only pass and must
  be rerun when relevant to a release candidate.
- Fresh deployment/receipt/Safe-batch evidence: 12 focused tests passing.
- Slither v4 scoped run: completed with exit 0 on 2026-07-29.
- Echidna v4 engine harness: 13/13 properties passed on 2026-06-08; historical
  evidence for the current liquidity correction.
- `npm run size`: all deployable artifacts below EVM bytecode limits.
- `NARAEngine` deployed bytecode: 24,554 bytes.
- `NARAStakingPoolSYV4` deployed bytecode: 8,506 bytes.
- `npm audit --audit-level=high`: 0 high / 0 critical on 2026-07-28.

Static analysis:

- Slither completed on the current patch. The current-patch Aderyn rerun could
  not start because the local binary/toolchain is unavailable; do not claim
  that Aderyn passed this patch.

---

## Core Deploy

Run:

```bash
V4_SKIP_COMPOUNDER=1 npm run deploy:v4:base:usdc
```

Pass criteria:

- Deploy completes without revert.
- `deployments/v4-base-usdc-latest.json` is written.
- Timestamped `deployments/v4-base-usdc-*.json` is written unless `V4_SKIP_DEPLOYMENT_LOG=1`.
- Deployed hook is `NARALiquidityGrowthHook`.
- Deployed vault is `NARALiquidityGrowthVault`.
- Hook address low bits satisfy `0x2088`.
- Base native USDC is the base token.
- PoolManager is Base Uniswap v4 PoolManager.
- `Hook.poolRegistered()` is false, `Hook.expectedSqrtPriceX96()` is zero, and
  PoolManager slot0 is zero. The core deploy only records the PoolKey and
  configured depth; the later atomic Safe batch registers, initializes, and
  seeds the pool.

Immediately read:

```text
deployments/v4-base-usdc-latest.json
deployments/v4-production-activation-2026-08-09.json
```

Record and confirm:

- `token`
- `tokenName`
- `tokenSymbol`
- `engine`
- `vault`
- `hook`
- `create2HookDeployer`
- `poolId`
- `poolFee`
- `tickSpacing`
- `finalAdmin`
- `treasury`
- `usdc`
- `poolManager`
- `positionManager`
- `compounder`

If any value is wrong, stop.

Current result (2026-08-09): the core deploy and source verification passed for
the addresses in the checkpoint above. The core manifest intentionally records
the then-dormant checkpoint and must not be rewritten. The post-activation
manifest records the later ownership, Compounder, pool, LP, fee, tax-matrix,
and operations readbacks. Use the newer artifact for current state.

---

## Post-Deploy Env Sync

Post-deploy scripts read addresses from environment variables through
`scripts/lib/v4LiveConfig.ts`. The new deployment log is the only allowed
source for launch values. Historical fallbacks, recovery flags, and old
manifests must never populate a launch environment.

After `npm run deploy:v4:base:usdc` writes `deployments/v4-base-usdc-latest.json`, run:

```bash
npm run v4:env:sync
```

Review `.env.v4.fresh`, then merge only the V4 launch address keys into `.env`:

```bash
npm run v4:env:sync:write
```

The sync helper refuses retired incident-stack addresses. Recovery-only escape
hatches are never valid for launch preparation.

The synchronized environment must include the receipt-pinned Engine deployment
block and transaction hash, the immutable release commit, and the final Safe
runtime code hash. Missing evidence is not filled from a replacement/recovery
manifest.

`V4_LP_TOKEN_ID=0` is acceptable before the atomic Safe launch creates the LP
NFT. After the confirmed batch, record its LP token ID in reviewed deployment
evidence and rerun sync so `.env` gets the real value:

```bash
npm run v4:env:sync:write
```

Current production evidence uses `V4_LP_TOKEN_ID=2898124`. A zero value is no
longer valid for the activated pool.

---

## Compounder Deploy And Pre-Seed Gate (completed sequence)

Current result: **completed through validation and permanent binding freeze**.
The Safe accepted both ownership
transfers in transaction
`0x35320c5a5dfa31898d8a66e088038b67d1113bf6b95b82a230eaaf64be6f595d`
at block `49720700`. The Compounder was deployed and source-verified at
`0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF`, then wired in Safe transaction
`0x29727cf5578989932175bd4e672d193e38b580f50645dd3bfcc173b44b2e70da`
at block `49721044`. It later passed validation and the binding was frozen as
recorded in `deployments/v4-compounder-activation-2026-08-09.json`.

After the fresh Vault exists, deploy `NARALiquidityCompounderV4` with exact
fresh-manifest bindings and the production Safe as constructor owner. The core
deploy proposes the Hook and Vault `Ownable2Step` transfers; the production Safe
must first call `acceptOwnership()` on both contracts and verify their
`owner()` values. Only then may the Safe wire the Compounder with
`vault.setCompounder(...)` while the fresh Vault has zero lifetime fees and
zero balances. Do not freeze the address yet.

Then run:

```bash
npm run verify:v4:preseed
npm run verify:v4:launch-gates:preseed
```

Pass criteria:

- The pool remains unregistered and PoolManager slot0 remains zero.
- Hook and Vault ownership transfers have been accepted by the production Safe;
  neither contract merely reports the Safe as `pendingOwner()`.
- Hook, Vault, Token, Engine, and Compounder bindings match reciprocally.
- The Compounder address is configured but not frozen.
- `REWARD_NOTIFIER_ROLE` is absent from the deployer, Safe, Vault, routers, and
  every other launch component checked by the gate.
- No retired incident-stack address appears in the fresh environment.

Any mismatch: stop before generating the atomic Safe batch.

---

## Liquidity Seed

Run:

```bash
npm run build:v4:atomic-pool-launch
```

Required environment:

```bash
BASE_RPC_URL=
V4_ADMIN_ADDRESS=
V4_LP_OWNER_ADDRESS=
V4_ATOMIC_LAUNCH_DEADLINE=
V4_ENGINE_DEPLOYMENT_BLOCK=
V4_ENGINE_DEPLOYMENT_TX_HASH=
V4_SAFE_CODEHASH=
```

Required reviewed seed overrides:

```bash
V4_SEED_NARA=60000
V4_SEED_USDC=300
```

These values target an opening price of `$0.005` per NARA and an implied
`$5,000` FDV. They use `60,000` of the locked `70,000 NARA` LP allocation.
The remaining `10,000 NARA` is reserved for separately reviewed later
liquidity additions. The builder has no private key and never submits; operators
must review the generated Safe batch before signing. Documentation approval
does not authorize execution.

Pass criteria:

- Before generating the batch, the builder proves the seed ratio equals the
  reviewed planned opening price and hook depth.
- Base native USDC, Permit2, PoolManager, PositionManager, Hook immutables, and
  every approved buy/sell curve field are exact.
- The Engine deployment transaction and constructor notifier grant anchor the
  complete role-history scan; an empty, behind, wrong-chain, or fork-mismatched
  history query fails closed.
- The Safe runtime hash, version 1.4.1, 2-of-3 threshold, no-guard/no-module
  state, and canonical MultiSendCallOnly runtime hash are exact.
- The generated artifact contains the Safe nonce, full MultiSend calldata,
  packed-call hash, Safe transaction hash, and a passing whole-batch
  `simulateAndRevert` result from the Safe context.
- The signing UI shows the exact generated nonce, DelegateCall operation,
  MultiSend target, calldata, and Safe transaction hash. Any mismatch or
  intervening Safe transaction requires regeneration.
- The hook must be unregistered and slot0 must be zero before the batch.
- `registerPool` is immediately followed by initialize-and-mint in the same
  Safe transaction.
- Any registered or initialized pre-seed state stops batch generation.
- LP seed transaction confirms.
- Confirmed receipt contains exactly one LP NFT mint to `V4_LP_OWNER_ADDRESS`.
- `V4_LP_TOKEN_ID` is updated to the confirmed LP NFT token ID.
- Re-running `npm run verify:v4:preflight` shows nonzero LP liquidity for that LP NFT.

Execution result: Safe nonce `30` executed successfully in Base transaction
`0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`
at block `49721188`. It minted LP NFT `2898124` to the Safe with liquidity
`4242640687119285`. The pool is already registered and initialized. **Do not
replay or rebuild this seed as a new launch action.**

---

## Post-Seed Preflight And Compounder Freeze Gate (completed history)

This one-time sequence completed on 2026-08-09 and must not be replayed. It is
retained to document the review order and stop conditions.

The completed sequence first synchronized `V4_LP_TOKEN_ID` from the atomic seed
receipt and ran:

```bash
npm run verify:v4:preflight
```

Recorded pass criteria:

- Hook token/base/vault and Vault token/base/hook/engine match the fresh manifest.
- Registered pool id matches `V4_POOL_ID`.
- Hook pool is registered and its bound opening `sqrtPriceX96` is nonzero.
- Pool fee is `3000`, tick spacing is `60`, and the seeded LP NFT has nonzero
  liquidity.
- Hook, Vault, and Compounder bindings match reciprocally.
- No stale or retired address mismatch appears.

The completed workflow then followed
[NARA_V4_COMPOUNDER_VALIDATION_RUNBOOK.md](NARA_V4_COMPOUNDER_VALIDATION_RUNBOOK.md):

1. Built and reviewed the validation batch with the fixed receipt-pinned price
   reference recorded in the Safe workflow and explicit raw-unit NARA/USDC
   caps.
2. The Safe executed the validation compound as its own transaction.
3. Recorded the confirmed transaction hash and receipt block and reconciled the exact
   Vault counters, banked remainders, Compounder position ownership, and nonzero
   full-range liquidity against that receipt.
4. Only after that evidence passed, built and reviewed the separate freeze
   batch; the Safe then executed the irreversible `vault.freezeCompounder()`
   call.
5. Confirmed `vault.compounderFrozen()` and ran the launch-gate verification.

During that sequence, a missing or unreconciled validation receipt, failed
exact-spend check, pending recovery, or unfrozen Compounder was a stop
condition. Recorded tax tests had occurred before the freeze; they evidenced
the sampled Hook/Vault swap accounting but did not satisfy the separate
Compounder gate.

---

## Smoke Test

Run:

```bash
npm run smoke:v4
```

Required environment:

```bash
BASE_RPC_URL=
SWAP_WALLET_ADDRESS=
LIQ_PRIVATE_KEY=
```

Optional smoke controls:

```bash
V4_SMOKE_BUY_USDC=5
V4_SMOKE_SELL_NARA=5
```

Important behavior:

- `npm run smoke:v4` runs preflight.
- `SWAP_WALLET_ADDRESS` is the reviewed public address of the smoke/liquidity
  wallet. `LIQ_PRIVATE_KEY` must resolve to exactly that address; there is no
  separate smoke-wallet key.
- It requires the atomic launch batch and final preflight to have completed.
- It runs a small USDC-to-NARA buy.
- It runs a small NARA-to-USDC sell.
- It checks `NARALiquidityGrowthVault` balance deltas.

Pass criteria:

- Preflight passes.
- Atomically seeded LP position is live.
- Small buy works.
- Small sell works.
- Liquidity growth vault balances change in the expected direction.

Current evidence exceeds the two-swap minimum for the tax path: twenty
distinct-block buys from `1` through `20 USDC` and ten distinct-block sells of
`1,000 NARA` all succeeded and reconciled. Buy Hook fees totaled `10.95 USDC`;
sell Hook fees totaled `500 NARA`; all ending allowances were zero. These
matrices exercised 5%/8% buy tiers and the 5% separate-block sell tier, not
every possible higher same-block tier.

If smoke fails, do not launch.

---

## Position NFT Phase 2 Gate

The historical aggregate allocation workflow is retired. The
`deploy:v4:allocations` alias intentionally refuses execution. Do not set
`V4_ALLOC_DRY_RUN`, call the retired implementation directly, remove the
refusal guard, or treat `verify:v4:allocations` as a Phase-2 verifier.

Use the full operator runbook at
[NARA-20260821-v4-position-nft-phase2.md](releases/NARA-20260821-v4-position-nft-phase2.md).
The following groups are separated by protected commits, review, external
attestation, and human approvals; they are not a copy-paste transaction script.

Before accepting the protected source commit, complete the full source gates
and the portable art/rehearsal gates:

```bash
npm run preview:v4:position-nft-art
npm run rehearse:v4:position-nft
```

The preview writes ignored repo-local scratch output under
`.nara-art-qa/v4-position-nft-phase2/`; copy and hash the approved human QA
record into the release-evidence directory. `rehearse:v4:position-nft` deploys
and verifies atomically in one fresh ephemeral `baseFork` process.

After the audited source commit is immutable on protected `origin/main`, use a
dedicated idle one-attempt signer to build the nonce/address plan and the
evidence-only second commit:

```bash
npm run plan:v4:position-nft
npm run build:v4:position-nft-plan-evidence
```

Require an immutable evidence commit, green canonical CI, the external ignored
attestation, unchanged signer nonce/address plan, and explicit human approval.
The attestation's exact `sourceCi`, evidence `ci`, and `releaseControl` schemas
are defined in the Phase-2 release runbook. The live gate independently verifies
both successful four-job CI runs, both commit signatures, both exact merged PRs
to protected `main`, and current classic branch protection with all four
required CI contexts. It needs authenticated GitHub read access from
`GH_TOKEN`, `GITHUB_TOKEN`, or authenticated `gh`; never print or store the
credential value.
Then and only then run the deployment once:

```bash
npm run deploy:v4:position-nft
```

Minting is permissionless from the NFT deployment block. Do not assume an empty
mint history or an available token ID. Before Safe preparation, run the strict
pending and all-seven source-verification gates:

```bash
npm run verify:v4:position-nft:pending
npm run verify:v4:position-nft:sources
npm run build:v4:position-nft-finalization
```

The finalization builder is read-only. It emits a quarantined `UNEXECUTED`
packet and standalone Safe Transaction Builder import only after validating and
hash-binding the canonical all-seven source-verification artifact and matching
fresh live BaseScan proof. The packet is also bound to the exact Safe nonce and
current state. Any nonce or pinned-state drift is a stop-and-review event. Human
Safe owners compare every hash and execute exactly these inner calls in order:

1. `setDefaultRoyalty(production.treasury, 1000)`
2. `setClaimFees(0, 0)`
3. `setClaimFeeRecipient(0x0000000000000000000000000000000000000000)`
4. `freezeRoyalties()`
5. `freezeClaimFees()`

After that exact Safe transaction confirms:

```bash
npm run finalize:v4:position-nft-evidence
npm run verify:v4:position-nft
```

Pass criteria include all seven receipt/runtime/source/constructor/binding
proofs, owner equal to the manifest-pinned production Admin Safe, frozen
`1000 BPS` royalty to the manifest-pinned production Treasury, zero and frozen
wrapper claim fees, no Genesis distributor/event, and complete reconciled
`PositionMinted` history. The final manifest remains integration-quarantined
until separately approved production smoke, a 48-hour hold, immutable final
evidence, and explicit downstream handoff are complete.

---

## Optional Phase 3 Composability Gate

Only proceed under a separate Phase-3 approval after the Position NFT final
manifest, smoke evidence, 48-hour hold, and handoff are verified. Phase 2 does
not deploy composability.

Run:

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployComposabilityV4.ts --network base
```

Required environment:

```bash
BASE_RPC_URL=
PRIVATE_KEY=
BASESCAN_API_KEY=
NARA_TOKEN_V4=
USDC_ADDRESS=
ENGINE_V4=
POSITION_NFT_V4=
ADMIN_ADDRESS=
```

Pass criteria:

- `NARAStakingPoolV4` deployed.
- `NARAStakingPoolSYV4` deployed.
- `NARAFractionalPositionFactoryV4` deployed.
- Basescan verification commands printed by the script are executed.
- `NARAStakingPoolSYV4.rewardIndexesCurrent()` works on the deployed SY.
- `NARAStakingPoolSYV4.claimRewards(address user)` works for a test user.
- `CONFIG_ROLE` and `EMERGENCY_ROLE` are moved to the Safe or timelock.

---

## Role And Ownership Gate

Before public TVL:

- `NARAEngine.DEFAULT_ADMIN_ROLE` is held by the production admin Safe or timelock.
- `NARAEngine.PARAM_ROLE` is held by the production admin Safe or timelock.
- `NARAEngine.TREASURY_ROLE` is held by the production treasury/admin Safe or timelock.
- `NARALiquidityGrowthHook.owner()` is the production admin Safe or timelock.
- `NARALiquidityGrowthVault.owner()` is the production admin Safe or timelock.
- `Create2HookDeployer.owner()` is the intended production owner or intentionally retained according to the launch plan.
- If separately deployed in Phase 3, `NARABondVaultV4.ADMIN_ROLE`, `MARKET_ADMIN_ROLE`, and `CAP_ADMIN_ROLE` are held by intended production addresses.
- If separately deployed in Phase 3, `NARABondDepositoryV4NFT.TERMS_ROLE`, `PAUSER_ROLE`, `TREASURY_ROLE`, and `PRICE_SIGNER_ROLE` are held by intended production addresses.
- `NARAPositionNFTV4.owner()` is the intended owner, and pending `Ownable2Step` transfer has been accepted if applicable.

---

## Launch Decision

Current decision (2026-08-21): **pool active; whole stack not launch-ready**.
Core deployment, source verification, Safe ownership acceptance, Compounder
deployment/wiring, atomic pool activation, LP NFT creation, and sampled live
buy/sell and same-block tax tests are complete. Engine backlog recovery,
bounded Compounder validation, and the permanent binding freeze are also
receipt-pinned as complete. The pool has public trading history.

Still incomplete at this checkpoint: the dedicated seven-contract Position NFT
Phase-2 release evidence/merge/deployment/finalization, its approved production
smoke and 48-hour hold, downstream monitor and basket handoff, and final public
documentation. Allocations, bonds, Genesis distributor/minter binding,
Router/Lens, and composability remain separate Phase-3 work. The basket app
stays preview-only.

Launch-ready means all of these are true:

- Fresh deploy completed.
- Full 40-character immutable origin commit is recorded.
- Canonical deploy log exists.
- Every deployed address is new and absent from Stage A and 2026-07-30 manifests.
- Fresh deployment addresses are exported into `.env`.
- Preflight passed.
- Liquidity seeded.
- `V4_LP_TOKEN_ID` points to the fresh LP NFT.
- The validation-compound transaction hash and receipt block are recorded and
  its exact-spend/full-range-position accounting reconciles.
- `vault.compounderFrozen()` is true after the separately reviewed freeze
  transaction.
- Smoke test passed.
- If the Position NFT is in scope, its exact seven-contract final manifest,
  source proof, five-call Safe finalization, smoke evidence, and 48-hour hold
  have passed.
- No Phase-3 allocation, bond, Genesis distributor/minter binding, Router/Lens,
  or composability address is presented as part of Phase 2.
- Bond terms are inactive until manually opened.
- Bond capacity is `0` until manually opened.
- Basescan verification is complete for all deployed contracts.
- Roles and ownership are transferred or explicitly accepted as temporary hot-wallet risk.
- Frontend config uses fresh v4 addresses.
- Basket input caps use the lower of configured and live NARA/USDC depth.
- The planned 300 USDC depth allows small buys while limiting 15% NARA baskets to 60 USDC and CORE to 90 USDC.
- `withdrawUnderlying` and partial underlying withdrawal are verified as no-swap exits.
- The collector uses the typed oracle-bounded USDC/WETH route with separate admin, swapper, and route-manager identities.
- The collector's immutable engine reports the same NARA address, and the NARA deposit path enforces an exact engine pull.
- Basket holding and raw-withdraw fees are both zero.
- Docs are updated to reflect the new live addresses.
- Retired 2026-04-23 addresses remain marked retired.

If one item is missing, the stack is not launch-ready.

---

## Post-Launch Documentation

Update:

1. [CURRENT_STATE.md](CURRENT_STATE.md)
2. [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md)
3. [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md), if the deployment process changed
4. Frontend configuration docs, if frontend addresses changed

Required facts to record:

- Deploy date.
- Token address.
- Engine address.
- Liquidity growth vault address.
- Liquidity growth hook address.
- Create2 hook deployer address.
- Pool id.
- Pool fee.
- Tick spacing.
- LP NFT id.
- Position NFT address and exact seven-contract Phase-2 evidence.
- Bond vault address, if separately deployed in Phase 3.
- NFT bond depository address, if separately deployed in Phase 3.
- Genesis reward distributor address, if separately deployed in Phase 3.
- Admin owner.
- Treasury.
- Whether compounder is set.
- Whether bond terms are active.
- Whether composability is deployed.

---

## Stop Conditions

Stop immediately if:

- Deployment log is missing.
- Preflight reports address mismatch.
- Post-deploy `.env` still points to retired incident-stack defaults.
- Hook address does not satisfy `0x2088`.
- Hook pool is not registered.
- Hook opening-price bound is zero or the activation receipt's initialization
  value differs from that bound. Current PoolManager slot0 may differ after
  trading and must not be compared to the opening value as a stop condition.
- Hook, vault, or compounder reciprocal bindings differ.
- Any engine `REWARD_NOTIFIER_ROLE` holder remains in launch scope.
- Basket collector still exposes arbitrary executor/selector/calldata swaps.
- Smoke test buy or sell reverts.
- Seeded LP liquidity is zero after `V4_LP_TOKEN_ID` is updated.
- The validation compound lacks a confirmed, receipt-pinned accounting
  reconciliation or `vault.compounderFrozen()` is false.
- A Phase-2 instruction invokes `deploy:v4:allocations`, sets
  `V4_ALLOC_DRY_RUN`, invokes the retired implementation directly, or uses
  `verify:v4:allocations` as its verifier.
- A Phase-3 allocation, bond, Genesis distributor/minter binding, Router/Lens,
  or composability address appears in the Phase-2 plan or manifest.
- The Position NFT signer/Safe nonce, predicted address, runtime, source,
  immutable evidence, mint history, or five-call finalization state drifts.
- Docs still describe the wrong stack as live.

---

## Short Version

The deploy, ownership, wiring, and atomic-seed commands below describe the
completed release sequence and must not be replayed. Engine recovery and the
Compounder validation/freeze also completed. Resume from the Engine lifecycle
smoke and remaining operations gates using the current manifest and runbooks.

```bash
npm run build
npm run test:v4
npm run test:nft:v4
npm run test:bond:v4
npm run test:bond-nft:v4
npm run test:invariants:v4
npm run test:composability:v4
npm test
npm run size
V4_SKIP_COMPOUNDER=1 npm run deploy:v4:base:usdc   # compounder wired separately below
npm run v4:env:sync
npm run v4:env:sync:write
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployLiquidityCompounderV4.ts --network base
# Safe: accept Hook/Vault ownership, then vault.setCompounder(<compounder>); do not freeze yet.
npm run verify:v4:preseed
npm run verify:v4:launch-gates:preseed
npm run build:v4:atomic-pool-launch
# Human Safe executes the reviewed atomic launch batch exactly once.
npm run v4:env:sync:write
npm run verify:v4:preflight
npm run build:v4:compounder-validation
# Human Safe executes validation; reconcile its receipt before the separate freeze.
npm run build:v4:compounder-validation -- --freeze
# Human Safe executes the reviewed freeze batch, then:
npm run verify:v4:launch-gates:baskets
npm run smoke:v4
```

```bash
# Position NFT Phase 2 source/art gates; stop for source review and protected commit.
npm run preview:v4:position-nft-art
npm run rehearse:v4:position-nft
# On the immutable source commit, create plan evidence; stop for evidence-only commit and attestation.
npm run plan:v4:position-nft
npm run build:v4:position-nft-plan-evidence
# Only after explicit human approval, deploy once with the dedicated idle signer.
npm run deploy:v4:position-nft
npm run verify:v4:position-nft:pending
npm run verify:v4:position-nft:sources
npm run build:v4:position-nft-finalization
# Human Safe owners review and execute the exact five-call packet; then:
npm run finalize:v4:position-nft-evidence
npm run verify:v4:position-nft
```

These markers do not replace the Phase-2 release runbook or authorize a
transaction. Do not run `deploy:v4:allocations`; it is a retired refusal guard.
Router/Lens, allocations, bonds, Genesis distributor/minter binding, and
composability require separate Phase-3 approval after the Position NFT smoke,
48-hour hold, and immutable handoff. Only after the relevant gates pass should
the corresponding release be treated as ready.
