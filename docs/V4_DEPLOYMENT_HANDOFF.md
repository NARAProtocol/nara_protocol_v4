# NARA v4 Deployment Handoff

Last updated: 2026-05-27.

This handoff is for the next clean v4 redeploy. Code and deployment scripts are the source of truth. If this document conflicts with Solidity or scripts, update this document.

Canonical state reference: [CURRENT_STATE.md](CURRENT_STATE.md).

---

## Current Deployment Status

There is no approved public v4 launch candidate.

The 2026-04-23 v4 incident stack is retired for launch purposes. Do not market it, reuse it, or build integrations against it. Retired addresses remain in [CURRENT_STATE.md](CURRENT_STATE.md) only for recovery and accounting.

The next production launch must be a fresh deployment using current repo code:

- `NARALauncher`
- `NARAToken`
- `NARAEngine`
- `NARALiquidityGrowthVault`
- `NARALiquidityGrowthHook`
- `Create2HookDeployer`
- v4 allocation contracts
- optional v4 composability contracts

Do not deploy or document `NARALiquidityTaxHook` or `NARALiquidityTaxVault` as current v4 launch code. Those names belong to retired/historical paths.

---

## Current v4 Launch Architecture

| Component | Current contract | Path |
|---|---|---|
| Launcher | `NARALauncher` | `contracts/v4/NARALauncher.sol` |
| Token | `NARAToken` | `contracts/v4/NARAToken.sol` |
| Engine | `NARAEngine` | `contracts/v4/NARAEngine.sol` |
| Liquidity vault | `NARALiquidityGrowthVault` | `contracts/v4/NARALiquidityGrowthVault.sol` |
| Liquidity hook | `NARALiquidityGrowthHook` | `contracts/v4/NARALiquidityGrowthHook.sol` |
| Hook deploy helper | `Create2HookDeployer` | `contracts/v4/utils/Create2HookDeployer.sol` |
| Operations vesting | `NARAOpsVaultV4` | `contracts/v4/NARAOpsVaultV4.sol` |
| Bond inventory | `NARABondVaultV4` | `contracts/v4/NARABondVaultV4.sol` |
| Position NFT account implementation | `NARAPositionAccountV4` | `contracts/v4/NARAPositionAccountV4.sol` |
| Position NFT | `NARAPositionNFTV4` | `contracts/v4/NARAPositionNFTV4.sol` |
| Genesis rewards | `NARAGenesisRewardDistributorV4` | `contracts/v4/NARAGenesisRewardDistributorV4.sol` |
| Public bond market | `NARABondDepositoryV4NFT` | `contracts/v4/NARABondDepositoryV4NFT.sol` |

Launch pair: NARA/Base native USDC on Uniswap v4.

Base native USDC address used by `scripts/deployV4BaseUsdc.ts`:

```text
0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

Base Uniswap v4 PoolManager address used by `scripts/deployV4BaseUsdc.ts`:

```text
0x498581ff718922c3f8e6a244956af099b2652b2b
```

Required hook permission bits:

```text
0x2088
```

---

## Pre-Deploy Local Verification

Run from `nara-protocol-hardhat/`.

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

Latest local targeted result (post v3 retirement and May 2026 audit remediation):

- Full Hardhat suite (`npm test`): 360 passing as of 2026-06-07 (run `npm test` for the live count; the older "568" predates the 2026-05-27 v4 reset that archived the v3 tests).
- Slither v4 scoped run: 27 targets passed.
- Echidna v4 engine harness: 10,022 calls, all 3 properties passing.
- `npm run size`: all deployable artifacts below EVM bytecode limits.
- `NARAEngine`: 24541 deployed bytes.
- `NARAStakingPoolSYV4`: 8482 deployed bytes.

Slither was not available in the last local environment. Run static analysis before mainnet:

```bash
npx slither contracts/v4/ --exclude naming-convention
```

If Slither is too noisy for the full tree, run scoped passes:

```bash
npx slither contracts/v4/NARAEngine.sol contracts/v4/NARAToken.sol contracts/v4/NARAPositionNFTV4.sol --exclude naming-convention
npx slither contracts/v4/composability/ --exclude naming-convention
```

---

## Core Deploy Script

Command:

```bash
npm run deploy:v4:base:usdc
```

Underlying script:

```bash
hardhat run scripts/deployV4BaseUsdc.ts --network base
```

What it does:

1. Verifies it is on Base unless `V4_ALLOW_NON_BASE=1`.
2. Deploys `NARALauncher`.
3. Launches `NARAToken` and `NARAEngine`.
4. Funds the engine emission reserve when NARA is available from deployer or treasury signer.
5. Deploys `NARALiquidityGrowthVault`.
6. Deploys `Create2HookDeployer`.
7. Mines and deploys `NARALiquidityGrowthHook` with low bits `0x2088`.
8. Binds vault, hook, engine, and optional compounder.
9. Sets keeper bounty if configured.
10. Registers and initializes the NARA/USDC Uniswap v4 pool.
11. Transfers engine roles and hook/vault/deployer ownership to final admin when final admin differs from deployer.
12. Writes deployment logs and canonical latest deployment pointers unless `V4_SKIP_DEPLOYMENT_LOG=1`.

Required environment variables for live Base:

```bash
PRIVATE_KEY=
BASE_RPC_URL=
V4_ADMIN_ADDRESS=
V4_TREASURY_ADDRESS=
V4_TOKEN_NAME=
V4_TOKEN_SYMBOL=
V4_INITIAL_NARA_AMOUNT=
V4_INITIAL_USDC_AMOUNT=
```

Recommended environment variables:

```bash
V4_COMPOUNDER_ADDRESS=
V4_COMPOUND_KEEPER_ADDRESS=
```

If no compounder is ready, deploy with explicit pool-fee accumulation:

```bash
V4_SKIP_COMPOUNDER=1
```

Optional deploy controls:

```bash
V4_POOL_FEE=3000
V4_HOOK_SALT_LABEL=NARA-V4-BASE-USDC-HOOK-1
V4_ENGINE_SALT_LABEL=NARA-V4-BASE-USDC-ENGINE-1
V4_HOOK_SALT_MAX_ITERATIONS=2000000
V4_KEEPER_BOUNTY_BPS=0
V4_MIN_COMPOUND_BASE_USDC=0
V4_SKIP_POOL_INITIALIZE=0
V4_SKIP_DEPLOYMENT_LOG=0
```

The script enforces Base native USDC. Do not override `V4_BASE_USDC_ADDRESS` for production.

---

## Core Post-Deploy Gate

After `npm run deploy:v4:base:usdc`, do not announce or open public flows yet.

Run:

```bash
npm run verify:v4:preflight
```

Then seed liquidity with:

```bash
hardhat run scripts/seedV4Liquidity.ts --network base
```

Then run:

```bash
npm run smoke:v4
```

`npm run smoke:v4` uses:

```bash
BASE_RPC_URL=
LIQ_PRIVATE_KEY=
V4_SMOKE_SEED_NARA=30
V4_SMOKE_SEED_USDC=300
V4_SMOKE_BUY_USDC=5
V4_SMOKE_SELL_NARA=5
```

The smoke test runs preflight, seeds liquidity, performs a small buy, performs a small sell, and checks vault balance deltas.

---

## Allocation Deploy Script

Command:

```bash
npm run deploy:v4:allocations
```

Underlying script:

```bash
hardhat run scripts/deployV4Allocations.ts --network base
```

What it deploys or wires:

1. `NARAOpsVaultV4`
2. `NARABondVaultV4`
3. `NARAPositionAccountV4`
4. `NARAPositionNFTV4`
5. `NARAGenesisRewardDistributorV4`
6. Optional binding from `NARALiquidityGrowthVault` to Genesis distributor
7. `NARABondDepositoryV4NFT`
8. Role transfers and ownership handoffs

Required environment variables:

```bash
PRIVATE_KEY=
BASE_RPC_URL=
TREASURY_PRIVATE_KEY=
V4_ADMIN_ADDRESS=
V4_TREASURY_ADDRESS=
```

Important optional/defaulted variables:

```bash
V4_NARA_TOKEN=
V4_GENESIS_REWARD_TOKEN=
V4_LIQUIDITY_GROWTH_VAULT=
V4_OPS_OWNER_ADDRESS=
V4_BOND_AMOUNT_NARA=289970
V4_MIN_TREASURY_FLOAT_NARA=10030
V4_BOND_ACTION_DELAY_SECONDS=86400
V4_BOND_ADMIN_DELAY_SECONDS=86400
V4_BOND_NARA_PER_ETH=100
V4_BOND_DISCOUNT_BPS=0
V4_BOND_REWARD_SPLIT=0.30
V4_BOND_MIN_DEPOSIT_ETH=0.01
V4_BOND_MAX_PAYOUT_NARA=10000
V4_BOND_LOCK_DURATION_EPOCHS=
V4_BOND_GENESIS_ROUND_ID=1
V4_BOND_GENESIS_TIER_ID=1
V4_BOND_GENESIS_REWARD_MULTIPLIER_BPS=20000
V4_BOND_GENESIS_ETERNAL=false
V4_BOND_ACTIVE=false
V4_POSITION_NFT_OWNER_ADDRESS=
V4_POSITION_NFT_ROYALTY_BPS=0
V4_POSITION_NFT_ROYALTY_RECEIVER=
```

Default launch posture:

- `V4_BOND_ACTIVE=false`.
- Bond capacity should remain closed until release cap, terms, treasury routing, Genesis metadata, and admin ownership are reviewed.
- Use `NARABondDepositoryV4NFT` for public bonds, not the direct raw-position `NARABondDepositoryV4`.

After allocation deploy, run:

```bash
npm run verify:v4:allocations
```

---

## Composability Deploy Script

Command:

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployComposabilityV4.ts --network base
```

What it deploys:

1. `NARAStakingPoolV4`
2. `NARAStakingPoolSYV4`
3. `NARAFractionalPositionFactoryV4`

Required environment variables:

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

Deployment prerequisites:

- Fresh v4 core deployed and verified.
- `NARAPositionNFTV4` deployed.
- NARA/USDC pool seeded.
- Bond and Genesis reward configuration reviewed.
- External or governance approval for composability risk accepted.

Post-deploy check: run the exact Basescan verification commands printed by `scripts/deployComposabilityV4.ts`. The script prints all constructor arguments after it deploys `NARAStakingPoolV4`, `NARAStakingPoolSYV4`, and `NARAFractionalPositionFactoryV4`.

Then:

- Transfer `CONFIG_ROLE` on `NARAStakingPoolV4` to the Safe or timelock.
- Transfer `EMERGENCY_ROLE` on `NARAStakingPoolV4` to the Safe or timelock.
- Seed the first `stNARA` deposit with at least `100 NARA`.
- Verify `NARAStakingPoolSYV4.rewardIndexesCurrent()`, `claimRewards(address user)`, and the separate `claimNativeEth(address payable to)` path before Pendle outreach.
- Monitor exchange rate, `liquidNara`, `lockedPrincipal`, `reservedForRedemptions`, `usdcRewardIndexRay`, and `ethRewardIndexRay` for 48 hours.

---

## Liquidity Growth Hook and Vault Requirements

Production must deploy `NARALiquidityGrowthHook` at an address whose low permission bits satisfy `0x2088`. The deploy script uses `Create2HookDeployer` and salt mining for this.

Do not deploy `TestNARALiquidityGrowthHook` live. It is a test helper.

Hook properties to verify:

- `beforeInitialize` enabled.
- `beforeSwap` enabled.
- `beforeSwapReturnDelta` enabled.
- Exact-input swaps are supported.
- Exact-output swaps revert.
- Only the registered official pool is accepted.
- Fee curves are capped by code.
- After pool registration, fee curve and protocol-depth changes are staged for 1 day before execution.
- `vault.recordPoolFee(address currency, uint256 amount, uint16 feeBps, address sender, bool isBuy)` is called in a `try/catch`; accounting failure emits an event and does not halt the swap after the fee is taken.

Vault properties to verify:

- Constructor starts in `RouteMode.Liquidity`.
- `setHook(address)` binds the hook once.
- `setEngine(address)` validates the target can receive NARA and base reward routing.
- `setCompounder(address)` is optional. If unset, pool fees accumulate in the vault.
- `scripts/deployV4BaseUsdc.ts` grants `REWARD_NOTIFIER_ROLE` to the liquidity growth vault so Engine/Split routes can call `notifyTokenRewards(address,uint256)`.
- `setGenesisRewardDistributor(address)` validates the reward token matches base.
- `setRouteMode(RouteMode)` enforces configuration requirements for split and Genesis modes.

Route modes:

| Mode | Meaning |
|---|---|
| `Liquidity` | Compound NARA and USDC into LP through the configured compounder |
| `Engine` | Route NARA to engine emission reserve and USDC to engine token rewards |
| `Split` | Split balances between engine routing and LP compounding |
| `Genesis` | Route USDC to Genesis reward distributor |
| `GenesisSplit` | Split USDC between Genesis rewards and LP compounding |

If no compounder adapter is ready, launch with `V4_SKIP_COMPOUNDER=1`. In that mode, pool fees accumulate in `NARALiquidityGrowthVault` until the owner configures a reviewed compounder or switches route mode.

---

## Role and Ownership Handoff

Before meaningful TVL:

- `NARAEngine.DEFAULT_ADMIN_ROLE` must be held by the production admin Safe or timelock.
- `NARAEngine.PARAM_ROLE` must be held by the production admin Safe or timelock.
- `NARAEngine.TREASURY_ROLE` must be held by the production treasury/admin Safe or timelock.
- `NARALiquidityGrowthHook.owner()` must be the production admin Safe or timelock.
- `NARALiquidityGrowthVault.owner()` must be the production admin Safe or timelock.
- `Create2HookDeployer.owner()` must be the production admin Safe or timelock, or ownership should be intentionally burned/retained according to the launch plan.
- `NARABondVaultV4` roles must be assigned intentionally: `ADMIN_ROLE`, `MARKET_ADMIN_ROLE`, and `CAP_ADMIN_ROLE`.
- `NARABondDepositoryV4NFT` roles must be assigned intentionally: `TERMS_ROLE`, `PAUSER_ROLE`, `TREASURY_ROLE`, and `PRICE_SIGNER_ROLE`.
- `NARAPositionNFTV4` ownership transfer must be accepted if `Ownable2Step` ownership was proposed.
- `NARAStakingPoolV4.CONFIG_ROLE` and `EMERGENCY_ROLE` must be assigned to production-controlled addresses if composability is deployed.

Record role holders in the deployment log and update [CURRENT_STATE.md](CURRENT_STATE.md) after verification.

---

## Go / No-Go

Do not proceed to public launch unless all items below are true:

- [ ] Current branch has no unreviewed production code changes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] `npm run size` passes.
- [ ] Static analysis has been run or explicitly waived by governance.
- [ ] `npm run deploy:v4:base:usdc` completed successfully.
- [ ] Deployment log was written under `deployments/`.
- [ ] `npm run verify:v4:preflight` passes.
- [ ] Liquidity is seeded.
- [ ] `npm run smoke:v4` passes.
- [ ] `npm run deploy:v4:allocations` completed if bonds/NFT positions are part of launch.
- [ ] `npm run verify:v4:allocations` passes if allocations were deployed.
- [ ] Bond market remains closed until intentionally opened.
- [ ] Admin and owner roles are no longer on a hot wallet before public TVL.
- [ ] Basescan verification is complete for all deployed contracts.
- [ ] Frontend and public docs use only the fresh deployment addresses.
- [ ] Retired 2026-04-23 addresses remain marked retired.

---

## Immediate Resume Point

Next exact step for a clean v4 deployment session:

1. Confirm environment variables for `scripts/deployV4BaseUsdc.ts`.
2. Run the full local verification block in "Pre-Deploy Local Verification".
3. Run `npm run deploy:v4:base:usdc` on Base.
4. Run `npm run verify:v4:preflight`.
5. Seed liquidity.
6. Run `npm run smoke:v4`.
7. Only then proceed to allocations, bonds, composability, and public launch preparation.
