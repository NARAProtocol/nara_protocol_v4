# NARA v4 Audit Response

Last updated: 2026-05-27.

This document records the current response to the v4 adversarial review. Code is the source of truth. The launch target is the current repository implementation and a fresh redeploy, not the retired 2026-04-23 deployment stack.

## Current Result

The reviewed v4 system is production-ready for a fresh deployment after the operational launch checklist is completed.

The current launch code uses:

- `NARAEngine`
- `NARAToken`
- `NARARewardReserve`
- `NARALauncher`
- `NARABondVaultV4`
- `NARABondDepositoryV4NFT`
- `NARAPositionNFTV4`
- `NARAGenesisRewardDistributorV4`
- `NARALiquidityGrowthVault`
- `NARALiquidityGrowthHook`
- `NARAOpsVaultV4`

Optional composability code is implemented but should be deployed and validated after the fresh core deployment:

- `NARAStakingPoolV4`
- `NARAStakingPoolSYV4`
- `NARAFractionalPositionFactoryV4`
- `NARAFractionalPositionV4`

Do not treat retired hook/vault names from earlier documents as current v4 launch code.

## Implemented Fixes

- `NARAEngine.setRewardReserve` rejects EOAs and incompatible contracts before the one-shot reward reserve address is stored.
- `NARABondVaultV4.returnUnsold` accounts by exact received balance delta and rejects non-exact token semantics.
- `NARABondVaultV4.pullToMarket` verifies the exact amount left the vault and reached the market.
- `NARABondVaultV4.excludedMarketBalance()` reports NARA parked in the active market and previous market.
- `NARABondVaultV4` records `previousMarket` during market migrations.
- `NARABondDepositoryV4` enforces `adminDelay >= 1 day`.
- `NARABondDepositoryV4NFT` enforces `adminDelay >= 1 day`.
- Both v4 bond depositories expire manual fixed-price terms after `1 day`.
- Expired bond terms quote `0`.
- `buyBond` and `buyBondFor` revert with `PriceStale` after fixed-price terms expire.
- `addCapacity` cannot add capacity to any stale fixed-price market, active or inactive.
- `rescueRewardEth` in both v4 bond depositories can only rescue queued reward ETH to the configured treasury.
- `NARALiquidityGrowthHook` catches vault fee-accounting reverts and emits `PoolFeeRecordFailed` instead of halting the swap path.
- `NARALiquidityGrowthHook` timelocks fee-curve and protocol-depth changes for `1 day` after the official pool is registered.
- `NARALiquidityGrowthHook` rejects nonzero protocol-depth values below `1_000_000` raw units to catch dust-depth misconfiguration.
- `NARALiquidityGrowthHook` rejects exact-output swaps so pool-fee accounting cannot flip swap semantics.
- `NARALiquidityGrowthVault` routes recorded ERC-20 pool fees through `Liquidity`, `Engine`, `Split`, `Genesis`, and `GenesisSplit` modes.
- `scripts/deployV4BaseUsdc.ts` deploys the current growth vault and hook path.
- `NARAStakingPoolSYV4` now exposes Pendle reward selectors for USDC and native ETH: `accruedRewards`, `rewardIndexesCurrent`, and `rewardIndexesStored`.
- `NARAStakingPoolSYV4.redeem(address receiver, uint256 amountIn, address tokenOut, uint256 minTokenOut, bool burnFromInternalBalance)` rejects shared internal-balance redeem; integrations must redeem from caller-held SY.

## Accepted Operational Constraints

- There is no onchain TWAP/oracle in the v4 fixed-price bond contracts. This is intentional for first launch because the pool will be too new and thin for a reliable TWAP. Bonds must stay closed until liquidity and pricing are ready. Any fixed-price bond opening must be short-lived, capped, and manually refreshed.
- `lockFor(address owner, uint256 amount, uint64 durationEpochs, uint256 minWeight)` can create direct engine positions for another address without consent. This can consume direct-address position slots, but the attacker must supply the NARA and the recipient controls the resulting positions. Public UX should route users through `NARAPositionNFTV4`.
- `TREASURY_ROLE` can withdraw accumulated ETH fees to a valid recipient. Treat it as a Safe-only role before public TVL.
- `PARAM_ROLE` holders can cancel each other's pending config changes. Use one Safe or governance path for this role.
- `notifyEthRewards()` is permissionless by design so sponsors, hooks, games, and donors can fund lockers.
- Direct NARA top-ups increasing `trackedEmissionReserve` through `syncEmissionReserve()` are intentional because token flash-loan fees arrive as direct NARA transfers to the engine.
- Pendle integration is not complete until `NARAStakingPoolSYV4` is tested against deployed contracts and, ideally, a fork or testnet Pendle flow.

## Verification

For the current latest verification baseline, see [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md).

Historical verification on 2026-04-29 (at time of audit response):

- `npm run build`: passed.
- `npx hardhat test test/NARAToken.v4.test.ts test/NARAEngine.v4.test.ts test/NARALiquidityGrowth.v4.test.ts`: passed, 80 tests.
- `npm run test:bond:v4`: passed, 104 tests.
- `npm run test:nft:v4`: passed, 16 tests.
- `npm run test:bond-nft:v4`: passed, 11 tests.
- `npm run test:invariants:v4`: passed, 4 tests.
- `npx hardhat test test/composability/NARAStakingPool.test.ts`: passed, 6 tests.
- `npm test`: passed, 536 tests.
- `npm run size`: passed.

Current deployed bytecode sizes from `npm run size`:

| Contract | Deployed bytes | Status |
| --- | ---: | --- |
| `v4/NARAEngine` | 24508 | Under 24576-byte EVM limit |
| `v4/NARALiquidityGrowthHook` | 10028 | Under 24576-byte EVM limit |
| `v4/NARALiquidityGrowthVault` | 9514 | Under 24576-byte EVM limit |
| `v4/NARAPositionNFTV4` | 20583 | Under 24576-byte EVM limit |
| `v4/composability/NARAStakingPoolV4` | 14913 | Under 24576-byte EVM limit |
| `v4/composability/NARAStakingPoolSYV4` | 7194 | Under 24576-byte EVM limit |

Known warnings:

- `npm test` prints a `PromiseRejectionHandledWarning` after the suite passes. This is existing test-runner noise, not a contract failure.
- Solidity emits warnings for test/mock fallback behavior, OpenZeppelin transient storage, and one legacy arena unnamed return variable. These warnings do not block v4 deployment, but they remain visible in compile output.
- Slither verification: Verification not possible.

## Issue-By-Issue Status

### Token Flash Fee Sink Validation

Status: addressed in the launcher/deployment flow, not the token constructor.

Concern:

- `FLASH_FEE_SINK` is immutable and could be miswired in a standalone token deployment.

Response:

- Do not add a code-length check to the `NARAToken` constructor. In the launcher flow, the token is deployed before the engine, and the sink is the predicted CREATE2 engine address. A constructor code-length check would break the intended atomic launch.
- `scripts/deployV4BaseUsdc.ts` validates after `launcher.launch()` that the engine has code, `NARAToken.FLASH_FEE_SINK()` equals the launched engine, and `NARAEngine.NARA()` equals the launched token.

Residual note:

- A standalone manual `NARAToken` deployment can still point fees to any nonzero address. Clean launch must use `NARALauncher`, not a manual token deploy.

### Engine Report Triage

Status: reviewed; no additional engine code change required from the submitted critical/high labels.

Rejected as critical/high:

- `setTreasury` mutability is not an external exploit. It is a trusted-role power and must be moved to a Safe before public TVL.
- `totalEthRewardsClaimed` is not double-counted in `claimRewards`. `_claimOne()` sends ETH directly; `_deliverEth()` is used by extend/unlock paths. Regression coverage proves claim accounting increments once by net ETH.
- `extend()` reward settlement before updating extension fields is protected by `nonReentrant`; claiming rewards while extending is intentional and equivalent to claim plus extend.
- `notifyEthRewards()` is permissionless by design, has no external call, and rejects zero value.
- `lockWithPermit()` best-effort permit is intentional. If a permit was already consumed or front-run, the call can still proceed only for the exact user-specified amount and only if allowance exists.
- ERC-1363 does not bypass flat ETH fees when `lockFeeWei != 0`; the callback reverts in that case.
- Timestamp epochs are an accepted Base/L2 design tradeoff. Launch epoch length is `900 seconds`, so normal timestamp skew cannot skip meaningful time by itself.

### Reward Reserve Wiring

Status: fixed.

Concern:

- A bad one-shot reward reserve address could brick epoch advancement.

Response:

- `setRewardReserve` requires deployed code and a successful `availableRewards()` interface check before storing the address.

Residual note:

- A malicious reserve contract can still lie or later revert. That is admin-trust territory. For clean launch, either do not wire an external reward reserve or wire only the reviewed reserve.

### Stale Fixed Bond Pricing

Status: mitigated for launch; oracle still deferred.

Concern:

- Manual fixed bond price can become stale and let arbitrageurs drain inventory.

Response:

- Bond admin delay is at least `1 day`.
- Manual fixed-price terms expire after `1 day`.
- Expired terms quote zero and cannot be bought.
- Capacity cannot be added to any stale market, active or inactive.
- Emergency queued reward ETH rescue is restricted to treasury, not an arbitrary admin-chosen address.

Launch rule:

- Do not open bonds until LP, pricing, Basescan verification, and smoke tests are complete.
- Open only small capped rounds.
- Refresh terms manually before each round.
- Long-term, replace fixed price with a TWAP/oracle or keep bonds as manually capped campaigns.

### Bond Depository Report Triage

Status: useful hardening applied; several critical/high labels were overstated.

Findings accepted and fixed:

- `addCapacity` is fail-closed for stale terms in both direct and NFT v4 bond depositories.
- `rescueRewardEth` requires `to == treasury` in both direct and NFT v4 bond depositories.
- The direct v4 bond depository discount-cap comment matches the actual `3000 bps` hard cap.

Findings rejected or downgraded:

- `flushRewardEth` retry queue is not a critical permanent trap by itself. Queued ETH is recoverable through treasury-only `rescueRewardEth`.
- Raw ETH sends are guarded by `nonReentrant` public entrypoints and queue on failure. This is not a demonstrated steal path.
- `buyBondFor` direct position-slot grief applies to the direct-lock depository. Clean launch should use `NARABondDepositoryV4NFT`, where the recipient receives a tradable wrapper NFT instead of filling raw direct engine slots.
- `_grossUpForLockFee` is safe under the engine fee cap because `lockFeeBps <= 1000`, so the denominator cannot underflow or approach zero.
- The `returnExcessToVault` approval concern is not persistent if `vault.returnUnsold()` reverts; the whole transaction reverts, including approval changes.

### Bond Vault Token Accounting

Status: fixed.

Concern:

- Return accounting credited nominal amounts and could drift with nonstandard tokens.

Response:

- `pullToMarket` and `returnUnsold` require exact transfer semantics.
- This matches canonical NARA behavior and rejects fee-on-transfer or wrong-token behavior instead of corrupting accounting.

### Market Inventory Exclusion

Status: fixed.

Concern:

- Engine circulating supply should exclude NARA parked in active or previous bond markets.

Response:

- `NARABondVaultV4.excludedMarketBalance()` reports NARA held in the active market and previous market.

### Minimum Price Delay

Status: fixed.

Concern:

- Minimum price delay existed as an intended control and needed enforcement.

Response:

- Both v4 bond depositories reject `adminDelaySeconds_ < 1 days`.

### Treasury Mutability Comment

Status: documentation and trust-model issue.

Concern:

- Old wording described treasury as one-shot, while code allows treasury rotation.

Response:

- No code change was made. Treasury rotation is useful operationally for moving from a hot wallet to a Safe. Public docs should describe treasury as mutable by `TREASURY_ROLE`.

### Liquidity Growth Hook And Vault

Status: current implementation verified.

Findings accepted and fixed:

- Vault fee-accounting failure no longer blocks the swap path. The hook takes the pool fee, catches the accounting failure, emits `PoolFeeRecordFailed`, and returns the before-swap delta.
- Fee-curve changes are immediate only before the official pool is registered. After registration, they are proposed and must wait `1 day` before execution.
- Protocol-depth changes are immediate only before the official pool is registered. After registration, they are proposed and must wait `1 day` before execution.
- Dust nonzero protocol depths are rejected with `DepthTooSmall`.
- Exact-output swaps are rejected.
- The Base USDC deploy script uses the current growth hook and growth vault path.

Findings rejected or downgraded:

- `amountSpecified == type(int256).min` handling is already the right overflow guard for exact-input conversion.
- `MAX_POOL_FEE_BPS = 5_000` is an admin/governance parameter risk, not a user exploit by itself. The post-registration timelock is the monitorable user protection.
- `beforeInitialize` requiring a registered pool is intentional. It prevents fake pools from using the hook.
- Swap input reduction through `BeforeSwapDelta` is the intended Uniswap v4 hook accounting model. Users still need UI slippage that includes pool fees.
- No pool migration is intentional; a new fee tier or pair requires a new hook.

### Composability SY Adapter

Status: fixed.

Concern:

- `NARAStakingPoolSYV4` needed Pendle-compatible reward selectors and safe redeem behavior before any Pendle outreach.

Response:

- `accruedRewards(address user)` returns current accrued USDC and ETH rewards for a user.
- `rewardIndexesStored()` returns the stored Pendle-style reward indexes.
- `rewardIndexesCurrent()` claims current pool USDC and ETH rewards into the SY contract, updates both reward indexes, and returns the current indexes.
- `claimRewards(address user)` accrues and pays the user's USDC and ETH rewards and emits the Pendle-compatible `ClaimRewards` event.
- `redeem(address receiver, uint256 amountIn, address tokenOut, uint256 minTokenOut, bool burnFromInternalBalance)` rejects `burnFromInternalBalance == true` to avoid stealing SY left on the adapter balance.

Residual note:

- The adapter is code-complete locally, but live Pendle market outreach should wait until the deployed SY is checked on the fresh v4 addresses.

## Launch Rules

- Fresh v4 deployment only. Do not use the retired 2026-04-23 deployment stack as launch infrastructure.
- Verify every deployed contract on Basescan before public announcement.
- Do not open bonds during initial deployment.
- Do not enable live bond capacity until LP, pricing, smoke tests, and admin roles are confirmed.
- Do not publish v4 addresses until the deployment is verified.
- Do not claim CertiK, external audit completion, or third-party review unless it is actually complete.
- Contact Pendle only after deployed SY reward-index, reward-claim, and disabled internal-balance redeem checks pass.

## Old Version Comparison

Old v2/v3 path:

- Mature engine and lock math.
- Existing lock NFT wrapper pattern.
- Existing bond vault with market inventory exclusion.
- Game sponsor architecture exists and works, but it is not part of the clean v4 launch.

Current v4 path after fixes:

- Keeps the same engine formulas and lock-weight idea.
- Adds global v4 position ids.
- Adds tradable v4 position NFTs.
- Adds NFT-based v4 bonds.
- Adds Uniswap v4 USDC launch hook with dynamic buy/sell pressure fees.
- Adds fee custody and routing through the growth vault.
- Adds flash-loan fee income into the engine reserve path.
- Adds optional stNARA, SY, and fractional position wrappers.
- Has stronger launch guardrails around bond inventory, stale fixed pricing, route-mode operations, and allocation float.

## Source Notes

Current source references:

- `contracts/v4/NARAEngine.sol`
- `contracts/v4/NARAToken.sol`
- `contracts/NARARewardReserve.sol`
- `contracts/v4/NARALauncher.sol`
- `contracts/v4/NARABondVaultV4.sol`
- `contracts/v4/NARABondDepositoryV4.sol`
- `contracts/v4/NARABondDepositoryV4NFT.sol`
- `contracts/v4/NARAPositionNFTV4.sol`
- `contracts/v4/NARAGenesisRewardDistributorV4.sol`
- `contracts/v4/NARALiquidityGrowthHook.sol`
- `contracts/v4/NARALiquidityGrowthVault.sol`
- `contracts/v4/NARAOpsVaultV4.sol`
- `contracts/v4/composability/NARAStakingPoolV4.sol`
- `contracts/v4/composability/NARAStakingPoolSYV4.sol`
- `contracts/v4/composability/NARAFractionalPositionV4.sol`
- `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol`
- `scripts/deployV4BaseUsdc.ts`
- `scripts/deployV4Allocations.ts`
- `scripts/deployComposabilityV4.ts`
