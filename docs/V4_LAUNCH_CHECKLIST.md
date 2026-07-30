# V4 Launch Checklist

Last updated: 2026-07-29.

> **Historical full-stack checklist.** Stage A is already deployed. For the
> current baskets-only launch, use [CURRENT_STATE.md](CURRENT_STATE.md) and
> [NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md). Do not deploy
> deferred lockboard/composability components or retired Lotto/Arena surfaces.

The material below is the historical full-stack checklist and must not be
executed as the current baskets-only plan.

Use this file when starting cold.

---

## Rules

- Do not reuse the retired 2026-04-23 v4 stack as the public launch candidate.
- Do not deploy or document retired liquidity tax contracts as current v4 launch code.
- Do not run preflight, seed, or smoke scripts against default retired addresses.
- Do not seed liquidity before core preflight passes.
- Do not treat deployment as complete until smoke tests pass.
- Do not open public locks, bonds, or composability if docs, deployment logs, frontend config, and live contracts disagree.

---

## Read First

1. [CURRENT_STATE.md](CURRENT_STATE.md)
2. [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md)
3. [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md)
4. [V4_REDEPLOY_NO_SURPRISE_PLAN.md](V4_REDEPLOY_NO_SURPRISE_PLAN.md)

Historical context only:

- [V4_INCIDENT_REDEPLOY_2026-04-23.md](V4_INCIDENT_REDEPLOY_2026-04-23.md)

---

## Required Current Contracts

Fresh core deploy (`deploy:v4:base:usdc`) must use:

- `NARALauncher`
- `NARAToken`
- `NARAEngine`
- `NARARewardReserve`
- `NARALiquidityGrowthVault`
- `NARALiquidityGrowthHook`
- `Create2HookDeployer`

Liquidity compounder deploy (`scripts/deployLiquidityCompounderV4.ts`, after the vault exists — closes the POL flywheel):

- `NARALiquidityCompounderV4`  ← then `vault.setCompounder(...)`, then `vault.freezeCompounder()` once validated. **Without this, `Liquidity` route mode is inert and the skim never compounds.**

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
V4_TOKEN_NAME=NARA Token
V4_TOKEN_SYMBOL=NARA
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

- Full Hardhat suite (`npm test`): 468 passing as of 2026-07-29.
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
npm run deploy:v4:base:usdc
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

---

## Post-Deploy Env Sync

The post-deploy scripts read live addresses from environment variables through `scripts/lib/v4LiveConfig.ts`. That file still has retired incident-stack defaults for safety/backward compatibility, so the fresh deployment log must be synced into launch env before preflight, seed, or smoke.

After `npm run deploy:v4:base:usdc` writes `deployments/v4-base-usdc-latest.json`, run:

```bash
npm run v4:env:sync
```

Review `.env.v4.fresh`, then merge only the V4 launch address keys into `.env`:

```bash
npm run v4:env:sync:write
```

The sync helper refuses retired incident-stack addresses unless `--allow-retired` is passed for recovery checks.

`V4_LP_TOKEN_ID=0` is acceptable before the atomic Safe launch creates the LP
NFT. After the confirmed batch, record its LP token ID in reviewed deployment
evidence and rerun sync so `.env` gets the real value:

```bash
npm run v4:env:sync:write
```

---

## Preflight Gate

Run:

```bash
npm run verify:v4:preflight
```

Pass criteria:

- Hook token/base/vault match expected deployment.
- Vault token/base/hook match expected deployment.
- Registered pool id matches `V4_POOL_ID`.
- Vault engine matches `V4_ENGINE`.
- Hook pool is registered.
- Hook bound opening `sqrtPriceX96` is nonzero and matches the reviewed seed ratio.
- Registered pool fee is `3000` and tick spacing is `60`.
- If slot0 is nonzero, it equals the hook's bound opening price exactly.
- Hook, vault, and compounder token/base/vault bindings match reciprocally.
- No unexpected stale address mismatch appears.

Warnings that may be acceptable before first seed:

- Configured LP NFT has zero liquidity.
- Pool fees are parked in `RouteMode.Liquidity` with no compounder because `V4_SKIP_COMPOUNDER=1` was intentional.
- Configured protocol depth is populated because it is the deterministic fee basis.

Any other mismatch: stop.

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
- The hook must be unregistered and slot0 must be zero before the batch.
- `registerPool` is immediately followed by initialize-and-mint in the same
  Safe transaction.
- Any registered or initialized pre-seed state stops batch generation.
- LP seed transaction confirms.
- Confirmed receipt contains exactly one LP NFT mint to `V4_LP_OWNER_ADDRESS`.
- `V4_LP_TOKEN_ID` is updated to the confirmed LP NFT token ID.
- Re-running `npm run verify:v4:preflight` shows nonzero LP liquidity for that LP NFT.

---

## Smoke Test

Run:

```bash
npm run smoke:v4
```

Required environment:

```bash
BASE_RPC_URL=
LIQ_PRIVATE_KEY=
```

Optional smoke controls:

```bash
V4_SMOKE_BUY_USDC=5
V4_SMOKE_SELL_NARA=5
```

Important behavior:

- `npm run smoke:v4` runs preflight.
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

Launch-ready means all of these are true:

- Fresh deploy completed.
- Canonical deploy log exists.
- Fresh deployment addresses are exported into `.env`.
- Preflight passed.
- Liquidity seeded.
- `V4_LP_TOKEN_ID` points to the fresh LP NFT.
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
npm run verify:v4:preflight
npm run build:v4:atomic-pool-launch
npm run v4:env:sync:write
# Step 4b — close the POL flywheel (needs the vault from core deploy):
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployLiquidityCompounderV4.ts --network base
# then (vault owner): vault.setCompounder(<compounder>) -> validate one compound -> vault.freezeCompounder()
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
