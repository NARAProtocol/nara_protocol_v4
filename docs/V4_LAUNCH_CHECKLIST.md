# V4 Launch Checklist

Last updated: 2026-08-09.

> **Active fixed-v4 checklist.** The candidate must be a fresh full-v4
> deployment from one immutable reviewed origin commit. Controlled Stage A and
> the 2026-07-30 pool are historical incident/recovery evidence only. Never
> reuse their addresses, manifests, role assignments, or pool state. The
> experimental protocol V5 stack is obsolete and deleted.

Use this file when starting cold.

## Current checkpoint — fresh core deployed, pool dormant

Fresh core deployment from protected origin commit
`027af3f06bbe6dea2c187dfd8062e50c228f1c35` has completed on Base and all
seven core contracts are source-verified. The approved core configuration is
`60,000 NARA` / `300 USDC`; it is configured depth and a later seed target, not
current liquidity.

| Component | Address |
|---|---|
| `NARALauncher` | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` |
| `NARAToken` | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| `NARAEngine` | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` |
| `NARARewardReserve` | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` |
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` |
| `Create2HookDeployer` | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` |

Planned pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.

Stop at the Compounder/ownership checkpoint. The pool is unregistered,
uninitialized, and unseeded; PoolManager slot0 is zero, the LP NFT is absent,
and the Vault Compounder is the zero address. The Hook and Vault still require
the production Safe to execute `acceptOwnership()` separately. The core deploy
does not authorize either acceptance, a Compounder deploy, pool activation,
seed, smoke swap, or downstream publication. The receipt-journal block-hash
normalization gap described in [CURRENT_STATE.md](CURRENT_STATE.md) is covered
by the tracked supplemental canonical reconciliation artifact.

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

Allocation deploy must use, if bonds or NFT positions are in launch scope:

- `NARAOpsVaultV4`
- `NARABondVaultV4`
- `NARAPositionAccountV4`
- `NARAPositionRendererV5` (uses modular `NARAArt*V1` contracts)
- `NARAPositionNFTV4`
- `NARAGenesisRewardDistributorV4`
- `NARABondDepositoryV4NFT`

Router / lens deploy (`deploy:v4:router:lens`) must use:

- `NARARouter`
- `NARADashboardLens`
- `NARAPositionDataLensV1`
- `NARAProtocolStatsLensV1`
- `NARACirculatingSupplyV1`

`BribeRouterV4` is intentionally not deployed. Do not grant
`REWARD_NOTIFIER_ROLE` to any launch component.

Optional composability deploy must use:

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

- Full Hardhat suite (`npm test`): 553 passing with 5 opt-in Base-fork cases
  pending as of 2026-08-09.
- Fresh deployment/receipt/Safe-batch evidence: 12 focused tests passing.
- Slither v4 scoped run: completed with exit 0 on 2026-07-29.
- Echidna v4 engine harness: 13/13 properties passed on 2026-06-08; historical
  evidence for the current liquidity correction.
- `npm run size`: all deployable artifacts below EVM bytecode limits.
- `NARAEngine` deployed bytecode: 24,554 bytes.
- `NARAStakingPoolSYV4` deployed bytecode: 8,503 bytes.
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
the addresses in the checkpoint above. Hook permission bits are `0x2088`;
`Hook.poolRegistered()` is false; expected opening price and PoolManager slot0
are zero; the RewardReserve holds `650,000 NARA`; the Vault has zero recorded
fees and zero token balances. The deployment intentionally used
`V4_SKIP_COMPOUNDER=1`.

This completed only the core-deploy subsection. The fresh sanitized manifest
and supplemental canonical receipt reconciliation are published together by
the protected core-evidence change. Every later subsection remains pending.

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

---

## Compounder Deploy And Pre-Seed Gate

Current result: **not started**. `Vault.compounder()` is the zero address. The
production Safe is only the pending owner of the Hook and Vault and must accept
both ownership transfers before this section can proceed.

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

---

## Post-Seed Preflight And Compounder Freeze Gate

After the atomic seed receipt is confirmed and `V4_LP_TOKEN_ID` is synchronized,
run:

```bash
npm run verify:v4:preflight
```

Pass criteria:

- Hook token/base/vault and Vault token/base/hook/engine match the fresh manifest.
- Registered pool id matches `V4_POOL_ID`.
- Hook pool is registered and its bound opening `sqrtPriceX96` is nonzero.
- Pool fee is `3000`, tick spacing is `60`, and the seeded LP NFT has nonzero
  liquidity.
- Hook, Vault, and Compounder bindings match reciprocally.
- No stale or retired address mismatch appears.

Before any smoke swap, follow
[NARA_V4_COMPOUNDER_VALIDATION_RUNBOOK.md](NARA_V4_COMPOUNDER_VALIDATION_RUNBOOK.md):

1. Build and review the validation batch with an independently reviewed price
   reference and explicit raw-unit NARA/USDC caps.
2. Have the Safe execute the validation compound as its own transaction.
3. Record the confirmed transaction hash and receipt block. Reconcile the exact
   Vault counters, banked remainders, Compounder position ownership, and nonzero
   full-range liquidity against that receipt.
4. Only after that evidence passes, build the separate freeze batch with
   `npm run build:v4:compounder-validation -- --freeze`, review its simulation,
   and have the Safe execute the irreversible `vault.freezeCompounder()` call.
5. Confirm `vault.compounderFrozen()` is true and run
   `npm run verify:v4:launch-gates:baskets` successfully.

A missing or unreconciled validation receipt, a failed exact-spend check, a
pending recovery, or an unfrozen Compounder is a stop condition. Do not run the
smoke test yet.

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

If smoke fails, do not launch.

---

## Allocation Gate

Run a dry-run first:

```powershell
$env:V4_ALLOC_DRY_RUN = "1"
npm run deploy:v4:allocations
Remove-Item Env:V4_ALLOC_DRY_RUN
```

Required environment:

```bash
PRIVATE_KEY=
BASE_RPC_URL=
TREASURY_PRIVATE_KEY=
V4_ADMIN_ADDRESS=
V4_TREASURY_ADDRESS=
```

Approved allocation overrides:

```bash
V4_OPS_AMOUNT_NARA=0
V4_BOND_AMOUNT_NARA=200000
V4_MIN_TREASURY_FLOAT_NARA=150000
V4_BOND_ACTIVE=false
```

**Known Phase 2 stop condition:** these stated values are not currently
executable together. `deployV4Allocations.ts` rejects
`V4_BOND_AMOUNT_NARA + V4_OPS_AMOUNT_NARA + V4_MIN_TREASURY_FLOAT_NARA`
above `300,000 NARA`; `200,000 + 0 + 150,000 = 350,000 NARA`. Do not change the
economics ad hoc and do not run the real allocation deploy until a separate
human-approved allocation decision resolves this mismatch and the dry run
passes.

If dry-run passes and allocations are in launch scope, run:

```bash
npm run deploy:v4:allocations
npm run verify:v4:allocations
```

Do not leave `V4_ALLOC_DRY_RUN=1` in `.env` before the real allocation deploy.

Pass criteria:

- `NARAOpsVaultV4` deployed if ops allocation is configured.
- `NARABondVaultV4` deployed and funded.
- `NARAPositionAccountV4` deployed.
- `NARAPositionNFTV4` deployed.
- `NARAGenesisRewardDistributorV4` deployed.
- `NARABondDepositoryV4NFT` deployed.
- Engine `bondVault` points to the new `NARABondVaultV4`.
- Treasury final NARA balance is at least `V4_MIN_TREASURY_FLOAT_NARA`.
- Bond terms remain inactive.
- Bond capacity remains `0`.
- Public bond path uses `NARABondDepositoryV4NFT`, not raw-position `NARABondDepositoryV4`.

Record the timestamped `deployments/v4-allocations-*.json` file.

---

## Optional Composability Gate

Only proceed if composability is in launch scope and core plus allocations are verified.

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
- `NARABondVaultV4.ADMIN_ROLE`, `MARKET_ADMIN_ROLE`, and `CAP_ADMIN_ROLE` are held by intended production addresses.
- `NARABondDepositoryV4NFT.TERMS_ROLE`, `PAUSER_ROLE`, `TREASURY_ROLE`, and `PRICE_SIGNER_ROLE` are held by intended production addresses.
- `NARAPositionNFTV4.owner()` is the intended owner, and pending `Ownable2Step` transfer has been accepted if applicable.

---

## Launch Decision

Current decision (2026-08-09): **not launch-ready**. Core contracts are
deployed and source-verified, but ownership acceptance, the Compounder,
protected receipt/manifest evidence, atomic pool launch, LP NFT, validation and
freeze, post-seed preflight, and smoke tests remain incomplete. No public
market or active NARA/USDC liquidity exists from this deployment.

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
- Allocations passed if bonds or NFT positions are in launch scope.
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
- Position NFT address.
- Bond vault address.
- NFT bond depository address.
- Genesis reward distributor address.
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
- Hook opening price is zero or differs from PoolManager slot0.
- Hook, vault, or compounder reciprocal bindings differ.
- Any engine `REWARD_NOTIFIER_ROLE` holder remains in launch scope.
- Basket collector still exposes arbitrary executor/selector/calldata swaps.
- Smoke test buy or sell reverts.
- Seeded LP liquidity is zero after `V4_LP_TOKEN_ID` is updated.
- The validation compound lacks a confirmed, receipt-pinned accounting
  reconciliation or `vault.compounderFrozen()` is false.
- Phase 2 retains `V4_BOND_AMOUNT_NARA=200000` together with
  `V4_MIN_TREASURY_FLOAT_NARA=150000`; the allocation script rejects that
  `350,000 NARA` total against its `300,000 NARA` guard.
- Treasury float is below `V4_MIN_TREASURY_FLOAT_NARA`.
- Public bond path does not mint position NFTs.
- Docs still describe the wrong stack as live.

---

## Short Version

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

```powershell
$env:V4_ALLOC_DRY_RUN = "1"
npm run deploy:v4:allocations
Remove-Item Env:V4_ALLOC_DRY_RUN
```

```bash
npm run deploy:v4:allocations
npm run verify:v4:allocations
# Router / lens layer (deploys Router, DashboardLens, PositionDataLens, ProtocolStatsLens, CirculatingSupply):
ENGINE_V4=<engine> POSITION_NFT_V4=<nft> npm run deploy:v4:router:lens
# BribeRouter is intentionally skipped; REWARD_NOTIFIER_ROLE must remain absent.
# Optional composability:
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployComposabilityV4.ts --network base
```

Only after the relevant commands pass should the stack be treated as launch-ready.
