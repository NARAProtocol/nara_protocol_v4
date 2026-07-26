# V4 Launch Checklist

Last updated: 2026-07-26.

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

Router / lens / bribe deploy (`deploy:v4:router:lens`) must use:

- `NARARouter`
- `NARADashboardLens`
- `NARAPositionDataLensV1`
- `NARAProtocolStatsLensV1`
- `NARACirculatingSupplyV1`
- `BribeRouterV4`  ← then grant `REWARD_NOTIFIER_ROLE` to it on the engine

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
- Do not use `V4_SKIP_POOL_INITIALIZE=1` unless pool initialization has a separate reviewed runbook.

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

Latest known local targeted result (post v3 retirement and May 2026 audit remediation):

- Full Hardhat suite (`npm test`): 360 passing as of 2026-06-07 (run `npm test` for the live count; the older "568" predates the 2026-05-27 v4 reset that archived the v3 tests).
- Slither v4 scoped run: 27 targets passed.
- Echidna v4 engine harness: 10,022 calls, all 3 properties passing.
- `npm run size`: all deployable artifacts below EVM bytecode limits.
- `NARAEngine` deployed bytecode: 24541 bytes.
- `NARAStakingPoolSYV4` deployed bytecode: 8482 bytes.

Static analysis:

- Slither was not available in the last local environment. Verification not possible.
- Run Slither or equivalent static analysis before mainnet, or record an explicit governance waiver.

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

`V4_LP_TOKEN_ID=0` is acceptable before liquidity seed creates the LP NFT. After seed, `scripts/seedV4Liquidity.ts` writes `deployments/v4-liquidity-seed-latest.json`; rerun sync so `.env` gets the real LP token ID:

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
- No unexpected stale address mismatch appears.

Warnings that may be acceptable before first seed:

- Configured LP NFT has zero liquidity.
- Pool fees are parked in `RouteMode.Liquidity` with no compounder because `V4_SKIP_COMPOUNDER=1` was intentional.
- Fallback protocol depth is populated because the deploy script set initial depth before pool registration.

Any other mismatch: stop.

---

## Liquidity Seed

Run:

```bash
npx tsx scripts/seedV4Liquidity.ts
```

Required environment:

```bash
TREASURY_PRIVATE_KEY=
BASE_RPC_URL=
```

Required reviewed seed overrides:

```bash
V4_SEED_NARA=3000
V4_SEED_USDC=300
V4_SEED_SLIPPAGE_BPS=200
```

These values target an opening price of `$0.10` per NARA and an implied
`$100,000` FDV. They use `3,000` of the locked `70,000 NARA` LP allocation.
The remaining `67,000 NARA` is reserved for separately reviewed later
liquidity additions. The executable script still has a historical `30 NARA`
default, so operators must set these overrides explicitly and verify the printed
amounts before signing. Documentation approval does not authorize execution.

Pass criteria:

- LP seed transaction confirms.
- Script prints the LP NFT token ID.
- `V4_LP_TOKEN_ID` is updated to the printed LP NFT token ID.
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
V4_SMOKE_SEED_NARA=30
V4_SMOKE_SEED_USDC=300
V4_SMOKE_BUY_USDC=5
V4_SMOKE_SELL_NARA=5
```

Important behavior:

- `npm run smoke:v4` runs preflight.
- It runs `scripts/seedV4Liquidity.ts` as part of the smoke flow.
- It runs a small USDC-to-NARA buy.
- It runs a small NARA-to-USDC sell.
- It checks `NARALiquidityGrowthVault` balance deltas.

If liquidity was already seeded manually, account for the smoke test's additional seed amounts.

Pass criteria:

- Preflight passes.
- Seed path works.
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
npx tsx scripts/seedV4Liquidity.ts
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
# Router / lens / bribe layer (deploys Router, DashboardLens, PositionDataLens, ProtocolStatsLens, CirculatingSupply, BribeRouter):
ENGINE_V4=<engine> POSITION_NFT_V4=<nft> npm run deploy:v4:router:lens
# then grant REWARD_NOTIFIER_ROLE to BribeRouterV4 on the engine (see runbook Step 7)
# Optional composability:
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployComposabilityV4.ts --network base
```

Only after the relevant commands pass should the stack be treated as launch-ready.
