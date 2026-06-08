# NARA v4 Clean Redeploy Plan

Last updated: 2026-05-27.

This is the no-surprise plan for the next clean NARA v4 redeploy. Code and deployment scripts are the source of truth. If this document conflicts with Solidity or scripts, update this document.

Canonical references:

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md)
- [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md)
- [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md)

---

## Goal

Redeploy the v4 stack cleanly with:

- Final token metadata: `NARA Protocol` / `NARA`
- Base native USDC liquidity only
- Uniswap v4 NARA/USDC pool through the current liquidity growth hook
- Tradable v4 lock positions through `NARAPositionNFTV4`
- NFT-based public bonds through `NARABondDepositoryV4NFT`
- Safe allocation sequencing that preserves treasury float
- Optional gas sponsorship configured only after core deployment addresses are final

Launch pair:

- NARA/Base native USDC only
- No ETH/WETH launch pair

Base native USDC:

```text
0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

Base Uniswap v4 PoolManager:

```text
0x498581ff718922c3f8e6a244956af099b2652b2b
```

Required hook permission bits:

```text
0x2088
```

---

## Current Blocker

There is no approved public v4 launch candidate.

The 2026-04-23 v4 incident stack is retired for launch purposes. Do not market it, reuse it, or build integrations against it. It remains relevant only for recovery, accounting, and historical analysis in [CURRENT_STATE.md](CURRENT_STATE.md).

Current status as of 2026-05-27:

- Clean launch code is present locally.
- Clean launch candidate has not been deployed live yet.
- Next production launch must be a fresh v4 redeploy from current repo code.
- Next action is local preflight, then clean core deploy, then post-deploy verification, then allocations.

Clean redeploy must preserve the allocation model:

- `700,000 NARA` engine reserve.
- `289,970 NARA` bond inventory by default.
- `10,030 NARA` minimum treasury float.
- Treasury float is intended to cover `30 NARA` LP seed and `10,000 NARA` loose/ops reserve.

`scripts/deployV4Allocations.ts` must fail if treasury float would drop below `V4_MIN_TREASURY_FLOAT_NARA`, which defaults to `10,030 NARA`.

---

## Implementation Status

Implemented in current repo:

- `contracts/v4/NARALauncher.sol`
- `contracts/v4/NARAToken.sol`
- `contracts/v4/NARAEngine.sol`
- `contracts/v4/NARALiquidityGrowthVault.sol`
- `contracts/v4/NARALiquidityGrowthHook.sol`
- `contracts/v4/utils/Create2HookDeployer.sol`
- `contracts/v4/NARAPositionAccountV4.sol`
- `contracts/v4/NARAPositionNFTV4.sol`
- `contracts/v4/NARAGenesisRewardDistributorV4.sol`
- `contracts/v4/NARABondVaultV4.sol`
- `contracts/v4/NARABondDepositoryV4.sol`
- `contracts/v4/NARABondDepositoryV4NFT.sol`
- `contracts/v4/NARAOpsVaultV4.sol`
- `contracts/v4/composability/NARAStakingPoolV4.sol`
- `contracts/v4/composability/NARAStakingPoolSYV4.sol`
- `contracts/v4/composability/NARAFractionalPositionV4.sol`
- `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol`

Current deploy and verification scripts:

- `scripts/deployV4BaseUsdc.ts`
- `scripts/deployV4Allocations.ts`
- `scripts/deployComposabilityV4.ts`
- `scripts/verifyV4Preflight.ts`
- `scripts/verifyV4AllocationsLive.ts`
- `scripts/smokeTestV4Deployment.ts`
- `scripts/seedV4Liquidity.ts`
- `scripts/lib/v4LiveConfig.ts`

Deferred from first launch unless scope changes:

- v4 game sponsor hub
- v4 game sponsor adapters
- custom onchain paymaster

---

## Required Contract Scope

### 1. Core v4

Required contracts:

- `NARALauncher`
- `NARAToken`
- `NARAEngine`
- `NARALiquidityGrowthVault`
- `NARALiquidityGrowthHook`
- `Create2HookDeployer`

Required properties:

- Token metadata is configurable at launch.
- No post-constructor token minting path is introduced.
- Engine keeps v4 JIT epoch advancement and v4 reward accounting.
- Public launch pool is NARA/Base native USDC.
- Hook address low bits satisfy `0x2088`.
- Hook accepts only the registered official pool.
- Hook supports exact-input swaps and rejects exact-output swaps.
- Hook fee curves and protocol-depth updates are immediate only before pool registration.
- After pool registration, fee curve and protocol-depth changes are staged for `1 day`.
- Hook sends pool fees to `NARALiquidityGrowthVault`.
- Vault starts in `RouteMode.Liquidity`.
- Vault `setHook(address)` is one-time because it reverts after `hook` is already set.
- Vault `setCompounder(address)` is optional; without a compounder, pool fees accumulate in the vault until a reviewed adapter or route-mode change is configured.
- The vault needs `REWARD_NOTIFIER_ROLE` on the engine before Engine/Split routes can forward ERC-20 rewards. `scripts/redeployPoolOnly.ts` grants it by default; set `V4_SKIP_REWARD_NOTIFIER_GRANT=1` only if the grant is handled separately.

Hook accounting behavior:

- `PoolFeeTaken` is emitted when a fee is taken.
- `vault.recordPoolFee(address currency, uint256 amount, uint16 feeBps, address sender, bool isBuy)` is called inside `try/catch`.
- If vault accounting reverts after the fee is taken, the hook emits `PoolFeeRecordFailed` and does not revert the swap path.

### 2. Tradable Position NFTs

Required before public locks or public bonds:

- `NARAPositionAccountV4`
- `NARAPositionNFTV4`

Design:

- `NARAPositionNFTV4` mints an ERC-721 controller token.
- Each NFT has a clone account that owns the underlying v4 engine `positionId`.
- NFT owner controls claim, ERC-20 reward claim, extend, and unlock paths.
- Genesis metadata is stored on the NFT when minted through the Genesis path.
- ERC-4906 metadata update events are used.
- ERC-2981 royalties are optional marketplace metadata only. Do not count royalties as guaranteed protocol revenue.
- Do not auto-claim rewards inside ERC-721 transfer hooks. Unclaimed rewards travel with the NFT unless the seller claims first.
- Do not ship ERC-4907 rental in the first v4 launch unless product scope changes and the implementation is reviewed.

Reason:

- Direct v4 engine positions are not transferable.
- Positions are tradable only if created through the wrapper/account path from the start.

### 3. NFT Bond Launch Path

Required before opening public bonds:

- `NARABondVaultV4`
- `NARABondDepositoryV4NFT`
- `NARAPositionNFTV4`

Launch posture:

- Use `NARABondDepositoryV4NFT` for public bonds.
- Keep direct raw-position `NARABondDepositoryV4` closed unless there is a separate reviewed reason to use it.
- Buyer receives a Genesis position NFT, not only a raw `positionId`.
- Bond terms start inactive by default through `V4_BOND_ACTIVE=false`.
- Initial bond capacity is `0` because `remainingCapacityNara` starts at `0`.
- Opening bonds requires a separate explicit transaction after LP, allocation, treasury, Genesis metadata, and role checks.

Bond controls from current code:

- `proposeTerms(BondTerms)` and `executeTerms()` are timelocked by `adminDelay`.
- `executeTerms()` requires the depository to be paused.
- `addCapacity(uint256)` requires the depository to be paused.
- Terms become unusable after the freshness window enforced by `_termsFresh()`.
- Legacy `buyBond(uint256)` and `buyBondFor(address,uint256)` revert. Use `buyBondWithQuote` or `buyBondForWithQuote` with an EIP-712 quote signed by `PRICE_SIGNER_ROLE`.

### 4. v4 Composability Layer

Composability is optional for first public launch. If deployed, deploy it after fresh core, position NFT, NARA/USDC pool, and allocation checks.

Contracts:

- `NARAStakingPoolV4`
- `NARAStakingPoolSYV4`
- `NARAFractionalPositionFactoryV4`
- `NARAFractionalPositionV4`

Current Pendle SY requirements are implemented:

- `NARAStakingPoolSYV4.accruedRewards(address user)`
- `NARAStakingPoolSYV4.rewardIndexesCurrent()`
- `NARAStakingPoolSYV4.rewardIndexesStored()`
- `NARAStakingPoolSYV4.claimNativeEth(address payable to)` exists outside the Pendle reward-token list for native ETH.
- `NARAStakingPoolSYV4.redeem(address receiver, uint256 amountIn, address tokenOut, uint256 minTokenOut, bool burnFromInternalBalance)` rejects `burnFromInternalBalance == true`.

Do not contact Pendle or publish SY integration docs until reward-index and redeem behavior are checked against the deployed addresses.

### 5. Base Gas Sponsorship

Gas sponsorship is an optional frontend/ops lane. It is not a Solidity dependency for the core redeploy.

Recommended posture:

- Use a provider-based paymaster service such as Coinbase Developer Platform Paymaster for Base Account support.
- Do not build a custom onchain paymaster for launch.
- Put the paymaster service URL behind a backend proxy.
- Configure contract and function allowlists.
- Configure per-user and global spend caps.
- Check wallet paymaster capability before attempting sponsored calls.
- EOA and non-sponsored wallet flows must still work through normal transactions.

Allowed sponsored functions for launch, if sponsorship is enabled:

- `NARAPositionNFTV4.mintAndLockWithPermit`
- `NARAPositionNFTV4.claimRewards`
- `NARAPositionNFTV4.claimTokenRewards`
- Optional: `NARAPositionNFTV4.extendLock`
- Optional: NFT bond purchase only after bond terms are live and capped.

Do not sponsor:

- Admin functions.
- Vault release functions.
- Bond market activation.
- Hook/vault ownership changes.
- Uniswap swaps.
- Arbitrary token approvals.
- `notifyEthRewards`.
- Functions with open-ended calldata that can drain the paymaster budget.

Provider-specific paymaster behavior must be rechecked against current provider docs before enabling production sponsorship.

### 6. NARA Sponsor Hub v4

This is a separate product lane from gas sponsorship.

If v4 games or sponsor-backed campaigns become part of launch scope, build and review separate v4 sponsor contracts:

- `NARASponsorHubV4`
- `NARASponsorFundAdapterV4`

Required differences from v2/v3 sponsor hub:

- Use v4 global `positionId`.
- Prefer the v4 position-account/NFT pattern if sponsor positions should be tradable.
- Keep campaign reward routing portable.
- Keep sponsor principal owned by stable accounts, not by game contracts.

Current launch decision:

- Deferred to phase 2.
- Do not deploy v4 game sponsor contracts before token/liquidity/bond launch unless the launch scope changes.

---

## Local Verification Requirements

Run from `nara-protocol-hardhat/` before Base mainnet deploy:

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

Latest local targeted verification (post v3 retirement and May 2026 audit remediation):

- Full Hardhat suite (`npm test`): 360 passing as of 2026-06-07 (run `npm test` for the live count; the older "568" predates the 2026-05-27 v4 reset that archived the v3 tests).
- Slither v4 scoped run: 27 targets passed.
- Echidna v4 engine harness: 10,022 calls, all 3 properties passing.
- `npm run size`: all deployable artifacts below EVM bytecode limits.
- `NARAEngine` deployed bytecode: 24541 bytes.
- `NARAStakingPoolSYV4` deployed bytecode: 8482 bytes.

Static analysis:

- Slither was not available in the last local environment. Verification not possible.
- Run Slither or equivalent static analysis before mainnet.

Suggested scoped static-analysis commands if Slither is installed:

```bash
npx slither contracts/v4/ --exclude naming-convention
npx slither contracts/v4/composability/ --exclude naming-convention
```

---

## Deployment Order

Strict order for the clean v4 production launch:

1. Confirm the branch contains only reviewed production changes.
2. Run the full local verification block above.
3. Confirm live environment variables for `scripts/deployV4BaseUsdc.ts`.
4. Deploy fresh core with `npm run deploy:v4:base:usdc`.
5. Run `npm run verify:v4:preflight`.
6. Seed NARA/USDC liquidity with `scripts/seedV4Liquidity.ts`.
7. Run `npm run smoke:v4`.
8. Deploy allocations with `npm run deploy:v4:allocations` if NFT positions, Genesis rewards, or bonds are part of launch.
9. Run `npm run verify:v4:allocations` if allocations were deployed.
10. Keep bond market closed until terms, capacity, treasury routing, Genesis metadata, and role ownership are reviewed.
11. Deploy composability with `scripts/deployComposabilityV4.ts` only if composability is in launch scope.
12. Verify every deployed contract on Basescan.
13. Transfer production roles and ownership to the intended Safe or timelock.
14. Update [CURRENT_STATE.md](CURRENT_STATE.md), frontends, and public docs with fresh addresses only after verification.
15. Start with a small monitored user flow and watch for at least 48 hours before public promotion.

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

Required live environment variables:

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

Recommended:

```bash
V4_COMPOUNDER_ADDRESS=
V4_COMPOUND_KEEPER_ADDRESS=
```

If no reviewed compounder exists:

```bash
V4_SKIP_COMPOUNDER=1
```

Important optional controls:

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

Production rules:

- Do not override `V4_BASE_USDC_ADDRESS` for production.
- Do not use `V4_ALLOW_NON_BASE=1` for production.
- Do not use `V4_ALLOW_DUPLICATE_TOKEN_METADATA=1` unless the duplicate-token check is intentionally waived.
- Do not set `V4_SKIP_POOL_INITIALIZE=1` unless pool initialization will be performed and verified separately before public use.

---

## Core Post-Deploy Gate

After `npm run deploy:v4:base:usdc`, do not announce or open public flows.

Run:

```bash
npm run verify:v4:preflight
```

Seed liquidity:

```bash
hardhat run scripts/seedV4Liquidity.ts --network base
```

Run smoke test:

```bash
npm run smoke:v4
```

`npm run smoke:v4` uses these environment variables:

```bash
BASE_RPC_URL=
LIQ_PRIVATE_KEY=
V4_SMOKE_SEED_NARA=30
V4_SMOKE_SEED_USDC=300
V4_SMOKE_BUY_USDC=5
V4_SMOKE_SELL_NARA=5
```

Smoke test expectation:

- Preflight passes.
- Liquidity seed succeeds.
- Small buy succeeds.
- Small sell succeeds.
- Vault balance deltas match hook-fee expectations.

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
6. Optional `NARALiquidityGrowthVault` to Genesis distributor binding
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
V4_ENGINE=
V4_GENESIS_REWARD_TOKEN=
V4_LIQUIDITY_GROWTH_VAULT=
V4_OPS_OWNER_ADDRESS=
V4_OPS_AMOUNT_NARA=0
V4_BOND_AMOUNT_NARA=289970
V4_MIN_TREASURY_FLOAT_NARA=10030
V4_OPS_VESTING_DAYS=365
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
V4_ALLOC_DRY_RUN=1
```

Allocation rules:

- Run with `V4_ALLOC_DRY_RUN=1` first.
- Keep `V4_BOND_ACTIVE=false` for initial launch.
- Do not open bond terms in the same operational step as deployment.
- Bond capacity should remain closed until release cap, terms, treasury routing, Genesis metadata, and role ownership are reviewed.
- Use `NARABondDepositoryV4NFT` for public bonds, not the direct raw-position depository.

After allocation deploy:

```bash
npm run verify:v4:allocations
```

---

## Composability Deploy Script

Command:

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployComposabilityV4.ts --network base
```

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

What it deploys:

1. `NARAStakingPoolV4`
2. `NARAStakingPoolSYV4`
3. `NARAFractionalPositionFactoryV4`

Post-deploy checks:

- Run the exact Basescan verification commands printed by `scripts/deployComposabilityV4.ts`.
- Transfer `CONFIG_ROLE` on `NARAStakingPoolV4` to the Safe or timelock.
- Transfer `EMERGENCY_ROLE` on `NARAStakingPoolV4` to the Safe or timelock.
- Seed first `stNARA` deposit with at least `100 NARA`.
- Verify `NARAStakingPoolSYV4.rewardIndexesCurrent()`.
- Verify `NARAStakingPoolSYV4.claimRewards(address user)`.
- Verify `NARAStakingPoolSYV4.claimNativeEth(address payable to)`.
- Monitor exchange rate, `liquidNara`, `lockedPrincipal`, `reservedForRedemptions`, `usdcRewardIndexRay`, and `ethRewardIndexRay` for 48 hours.

---

## Testing Requirements

NFT tests must cover:

- Mint and lock.
- Permit mint and lock.
- Stored `positionId`.
- Claim NARA rewards.
- Claim ETH rewards.
- Claim ERC-20 token rewards.
- Extend.
- Unlock after maturity.
- Revert on non-owner actions.
- NFT transfer moves control.
- Unclaimed rewards travel with transferred NFT.
- Burn/cleanup after unlock.
- Genesis metadata.
- Metadata update events.

Bond tests must cover:

- Buyer receives NFT.
- Underlying account owns engine position.
- Vault inventory and release-cap accounting.
- Terms inactive by default.
- Capacity starts at `0`.
- Slippage/min payout.
- ETH split and queued fallback behavior.
- No public bond path routes users through raw `engine.lockFor(address owner, uint256 amount, uint64 durationEpochs, uint256 minWeight)`.

Hook/vault tests must cover:

- Only registered official pool is accepted.
- Exact-output swaps revert.
- Buy and sell fee quote behavior.
- Fee curve bounds.
- Timelocked curve and protocol-depth changes after registration.
- `PoolFeeRecordFailed` path does not revert after fee transfer.
- Vault route-mode requirements.
- Launch with no compounder accumulates pool fees.

Composability tests must cover:

- First `NARAStakingPoolV4` deposit minimum.
- Share accounting with `DEAD_SHARES`.
- Queue redeem behavior.
- Pool ERC-20 and ETH reward index accounting.
- SY deposit using NARA.
- SY deposit using `stNARA`.
- SY redeem to `stNARA`.
- SY disabled internal-balance redeem.
- SY USDC reward selectors used by Pendle.
- SY native ETH claim path outside Pendle `claimRewards`.
- Fractional NFT claim and principal dust behavior.

Paymaster tests, if sponsorship is enabled, must cover:

- Sponsored Base Account flow on Base Sepolia.
- Non-sponsored EOA fallback.
- Rejection of non-allowlisted functions.
- Per-wallet cap behavior.
- Global cap behavior.
- Paymaster capability detection before sponsored calls.

---

## Mainnet Go/No-Go

Do not open public access unless every item is true:

- [ ] Current branch has no unreviewed production code changes.
- [ ] Token metadata confirmed: `NARA Protocol` / `NARA`.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] `npm run size` passes.
- [ ] Static analysis is run or explicitly waived by governance.
- [ ] Fresh core deployed with `npm run deploy:v4:base:usdc`.
- [ ] Deployment log written under `deployments/`.
- [ ] Deployed core uses `NARALiquidityGrowthHook`, not any retired hook path.
- [ ] Hook address low bits satisfy `0x2088`.
- [ ] `npm run verify:v4:preflight` passes.
- [ ] NARA/USDC pool exists and liquidity is seeded.
- [ ] `npm run smoke:v4` passes.
- [ ] Treasury float after allocations is at least `10,030 NARA`.
- [ ] LP seed funds are still available.
- [ ] `NARAPositionNFTV4` is deployed and verified.
- [ ] Public lock UI uses NFT wrapper, not direct engine lock.
- [ ] Public bond path mints NFT positions, not direct raw positions.
- [ ] Bond terms are inactive until manually opened.
- [ ] Bond capacity is `0` until manually opened.
- [ ] `npm run verify:v4:allocations` passes if allocations were deployed.
- [ ] Composability contracts are verified if composability was deployed.
- [ ] Basescan verification is complete for all deployed contracts.
- [ ] Admin, treasury, emergency, market, cap, and owner roles moved to production-controlled addresses.
- [ ] Frontend and public docs use only the fresh deployment addresses.
- [ ] Retired 2026-04-23 addresses remain marked retired.
- [ ] Paymaster proxy, allowlist, and spend caps are configured if sponsorship is enabled.
- [ ] EOA fallback path works if sponsorship is enabled.

---

## Resolved Decisions

These are resolved for the current clean launch scope:

1. Should all public bond positions be tradable NFTs from day one?
   - Decision: yes.

2. Should direct engine locks remain public in the UI?
   - Decision: no for normal users. UI should default to the NFT wrapper.

3. Should direct engine `lock` remain contract-accessible?
   - Decision: yes. The wrapper/account needs the engine and advanced users may call contracts directly.

4. Should launch include v4 game sponsor hub?
   - Decision: no. Keep it phase 2.

5. Should launch include a custom onchain paymaster?
   - Decision: no. Use provider-based paymaster infrastructure only if sponsored gas is included.

6. Should composability be deployed before core v4 is live and verified?
   - Decision: no. Composability waits for fresh core, position NFT, liquidity, and allocation verification.

---

## Immediate Resume Point

Next exact step for a clean v4 deployment session:

1. Confirm environment variables for `scripts/deployV4BaseUsdc.ts`.
2. Run the full local verification block in "Local Verification Requirements".
3. Run `npm run deploy:v4:base:usdc` on Base.
4. Run `npm run verify:v4:preflight`.
5. Seed liquidity.
6. Run `npm run smoke:v4`.
7. Proceed to allocations only after core deployment and smoke checks pass.
8. Proceed to bonds, composability, and public launch preparation only after allocation verification passes.

---

## Source Notes

- Base Account sponsor gas docs: https://docs.base.org/base-account/improve-ux/sponsor-gas/paymasters
- CDP Paymaster docs: https://docs.cdp.coinbase.com/paymaster/introduction/welcome
- ERC-4337: https://eips.ethereum.org/EIPS/eip-4337
- ERC-5792: https://eips.ethereum.org/EIPS/eip-5792
- ERC-7677: https://eips.ethereum.org/EIPS/eip-7677
- ERC-721: https://eips.ethereum.org/EIPS/eip-721
- ERC-4906: https://ercs.ethereum.org/ERCS/erc-4906
- ERC-6551: https://eips.ethereum.org/EIPS/eip-6551
