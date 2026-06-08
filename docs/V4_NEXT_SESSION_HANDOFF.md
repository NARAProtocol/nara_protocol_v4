# NARA v4 Next Session Handoff

Last updated: 2026-05-27.

Start here when resuming v4 work. Code and deployment scripts are the source of truth.

---

## Current Truth

There is no approved public v4 launch candidate.

The 2026-04-23 v4 incident stack is retired for launch purposes. Do not reuse those addresses for the public launch. Use [CURRENT_STATE.md](CURRENT_STATE.md) for retired-address recovery/accounting details.

The next production launch must be a fresh v4 redeploy using current repo code:

- `NARAEngine`
- `NARAToken`
- `NARAPositionNFTV4`
- `NARABondDepositoryV4NFT`
- `NARALiquidityGrowthHook`
- `NARALiquidityGrowthVault`
- optional composability layer after core deployment is verified

Do not treat `NARALiquidityTaxHook` or `NARALiquidityTaxVault` as current v4 launch contracts. Current launch code uses `NARALiquidityGrowthHook` and `NARALiquidityGrowthVault`.

Latest launch-planning constraint: the operator has only about `$1k` for liquidity. The next launch should be a calibrated lock/NFT launch with tiny exact-input trades, not a full public trading launch. Keep bonds, stNARA, Pendle SY, fractional wrappers, games, and sponsor campaigns closed on day 1. Read [research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md](research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md) before suggesting launch steps.

---

## Read First

Before taking action, read these in order:

1. [CURRENT_STATE.md](CURRENT_STATE.md)
2. [research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md](research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md)
3. [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md)
4. [V4_REDEPLOY_NO_SURPRISE_PLAN.md](V4_REDEPLOY_NO_SURPRISE_PLAN.md)
5. [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md), only if composability is in the session scope

Historical context, not launch instructions:

- [V4_INCIDENT_REDEPLOY_2026-04-23.md](V4_INCIDENT_REDEPLOY_2026-04-23.md)
- [V4_AUDIT_RESPONSE_2026-04-23.md](V4_AUDIT_RESPONSE_2026-04-23.md)

---

## Current v4 Script Map

All current v4 scripts live flat in `scripts/`; there is no `scripts/deploy/v4/` directory.

| Command or script | Purpose |
|---|---|
| `npm run deploy:v4:base:usdc` | Deploy fresh v4 core, `NARALiquidityGrowthVault`, `Create2HookDeployer`, `NARALiquidityGrowthHook`, and initialize the NARA/USDC pool |
| `npm run verify:v4:preflight` | Verify configured hook, vault, pool, and routing before launch actions |
| `npm run smoke:v4` | Run preflight, seed liquidity, execute a small buy and sell, and check vault deltas |
| `npm run deploy:v4:allocations` | Deploy ops vault, bond vault, position NFT stack, Genesis distributor, and NFT bond depository |
| `npm run verify:v4:allocations` | Verify the allocation deployment |
| `scripts/deployComposabilityV4.ts` | Deploy `NARAStakingPoolV4`, `NARAStakingPoolSYV4`, and `NARAFractionalPositionFactoryV4` |
| `scripts/seedV4Liquidity.ts` | Seed NARA/USDC liquidity |
| `scripts/removeV4Liquidity.ts` | Remove configured NARA/USDC liquidity |
| `scripts/swapUsdcForNara.ts` | Execute an exact-path buy through the configured hook pool |

---

## Architecture Decisions Already Resolved

Do not re-open these unless the code changes.

### Reward reserve

No separate v4 `NARARewardReserve` contract is required for launch. The v4 engine can be funded directly through `NARAEngine.depositRewards(uint256 amount)`.

Optional external reward reserve wiring remains possible because `NARAEngine.setRewardReserve(address reserve_)` only requires a contract that exposes:

```solidity
function availableRewards() external view returns (uint256);
function releaseToEngine(uint256 amount) external;
```

### Lotto

No v4 lotto contract exists in the current launch scope. Existing lotto contracts are v2/v3 surfaces and are not part of the v4 token/liquidity/bond launch.

### Public bonds

Use `NARABondDepositoryV4NFT` for public bonds. Do not open the direct raw-position `NARABondDepositoryV4` as the public launch bond market.

### Composability

Composability is built but should be deployed only after core v4 is verified and governance accepts the additional integration risk.

Current composability contracts:

- `NARAStakingPoolV4`
- `NARAStakingPoolSYV4`
- `NARAFractionalPositionV4`
- `NARAFractionalPositionFactoryV4`

`NARAStakingPoolSYV4` now exposes Pendle reward-index functions:

```solidity
function accruedRewards(address user) external view returns (uint256[] memory rewardAmounts);
function rewardIndexesCurrent() external returns (uint256[] memory indexes);
function rewardIndexesStored() external view returns (uint256[] memory indexes);
```

---

## What Is Current in Code

Core v4:

- `contracts/v4/NARALauncher.sol`
- `contracts/v4/NARAToken.sol`
- `contracts/v4/NARAEngine.sol`
- `contracts/v4/NARALiquidityGrowthHook.sol`
- `contracts/v4/NARALiquidityGrowthVault.sol`
- `contracts/v4/utils/Create2HookDeployer.sol`

Allocation and position layer:

- `contracts/v4/NARAOpsVaultV4.sol`
- `contracts/v4/NARABondVaultV4.sol`
- `contracts/v4/NARAPositionAccountV4.sol`
- `contracts/v4/NARAPositionNFTV4.sol`
- `contracts/v4/NARAGenesisRewardDistributorV4.sol`
- `contracts/v4/NARABondDepositoryV4NFT.sol`

Composability layer:

- `contracts/v4/composability/NARAStakingPoolV4.sol`
- `contracts/v4/composability/NARAStakingPoolSYV4.sol`
- `contracts/v4/composability/NARAFractionalPositionV4.sol`
- `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol`

Tests:

- `test/NARAToken.v4.test.ts`
- `test/NARAEngine.v4.test.ts`
- `test/NARAPositionNFTV4.test.ts`
- `test/NARALiquidityGrowth.v4.test.ts`
- `test/NARAInvariantRegression.v4.test.ts`
- `test/NARABondV4.test.ts`
- `test/NARABondV4NFT.test.ts`
- `test/composability/NARAStakingPool.test.ts`
- `test/composability/NARAFractionalPosition.test.ts`

---

## Latest Local Verification

Latest verification after the `NARAStakingPoolSYV4` remediation:

```bash
npx hardhat compile
npx hardhat test test/composability/NARAStakingPool.test.ts
npm test
npm run size
```

Observed result (latest — post v3 retirement and May 2026 audit remediation):

- Full Hardhat suite (`npm test`): 360 passing as of 2026-06-07 (run `npm test` for the live count; the older "568" predates the 2026-05-27 v4 reset that archived the v3 tests).
- Slither v4 scoped run: 27 targets passed.
- Aderyn all-contract and v4-only reports: generated successfully.
- Echidna v4 engine harness: 10,022 calls, all 3 properties passing.
- `npm run size`: all deployable artifacts under EVM bytecode limits.
- `NARAEngine` deployed bytecode: 24541 bytes.
- `NARAStakingPoolSYV4` deployed bytecode: 8482 bytes.

Known tooling note:

- Run Slither or equivalent static analysis before mainnet if any contract code has changed since last Slither run.
- `npm test` may emit a `PromiseRejectionHandledWarning`; the full suite passed despite that warning.

---

## Clean Allocation Target

Fresh redeploy allocation target:

- `700,000 NARA` engine emission reserve.
- `289,970 NARA` bond inventory.
- `10,030 NARA` minimum treasury float.

Treasury float covers:

- `30 NARA` initial LP seed target unless launch parameters change.
- `10,000 NARA` loose operations reserve or ops-vault funding plan.

`scripts/deployV4Allocations.ts` defaults:

- `V4_BOND_AMOUNT_NARA=289970`
- `V4_MIN_TREASURY_FLOAT_NARA=10030`
- `V4_OPS_AMOUNT_NARA=0`
- `V4_BOND_ACTIVE=false`

The allocation script supports `V4_ALLOC_DRY_RUN=1` and exits before sending transactions.

---

## Next Exact Steps

Run these from `nara-protocol-hardhat/`.

1. Confirm `.env` values for the core deploy:

```bash
PRIVATE_KEY
BASE_RPC_URL
V4_ADMIN_ADDRESS
V4_TREASURY_ADDRESS
V4_TOKEN_NAME
V4_TOKEN_SYMBOL
V4_INITIAL_NARA_AMOUNT
V4_INITIAL_USDC_AMOUNT
```

2. If no compounder is ready, explicitly set:

```bash
V4_SKIP_COMPOUNDER=1
```

3. Run local verification:

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

4. Deploy fresh core:

```bash
npm run deploy:v4:base:usdc
```

5. Sync the fresh deploy config:

```bash
npm run v4:env:sync
npm run v4:env:sync:write
```

6. Run preflight:

```bash
npm run verify:v4:preflight
```

7. Seed liquidity:

```bash
npx tsx scripts/seedV4Liquidity.ts
npm run v4:env:sync:write
```

8. Run smoke test:

```bash
npm run smoke:v4
```

9. Run allocation dry-run:

```bash
$env:V4_ALLOC_DRY_RUN="1"
npm run deploy:v4:allocations
```

10. If dry-run is correct, run allocation deploy without `V4_ALLOC_DRY_RUN`.

11. Run allocation verification:

```bash
npm run verify:v4:allocations
```

12. Keep bonds closed until:

- liquidity is seeded and smoke-tested;
- terms and capacity are reviewed;
- roles and ownership are transferred or explicitly accepted;
- Basescan verification is complete;
- frontend and public docs point only at fresh deployment addresses.

13. Deploy composability only after core and allocation layers are stable.

---

## Do Not Do Next

- Do not use the 2026-04-23 incident-stack addresses as launch addresses.
- Do not deploy or open `NARALiquidityTaxHook` or `NARALiquidityTaxVault`.
- Do not deploy `TestNARALiquidityGrowthHook` live.
- Do not open `NARABondDepositoryV4` as the public bond market.
- Do not open bond capacity before LP, pricing, roles, Basescan verification, and smoke tests are complete.
- Do not leave admin, treasury, market, cap, emergency, or owner roles on hot wallets if the Safe or timelock is ready.
- Do not deploy game sponsor contracts as part of the v4 token/liquidity/bond launch.
