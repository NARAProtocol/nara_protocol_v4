# NARA v4 Composability Layer - Audit Checklist

Last updated: 2026-07-26.

Code is the source of truth. This checklist is synchronized to the current v4 implementation under `contracts/v4/composability/`.

**Status:** code exists but composability is deferred and not deployed. Internal
review evidence exists; no independent audit is claimed. Before any future
mainnet activation, rerun this checklist against the exact deployment candidate
and record the operator's explicit review decision.

---

## Current v4 Scope

| Contract | Path | Lines |
|---|---|---:|
| `NARAStakingPoolV4` | `contracts/v4/composability/NARAStakingPoolV4.sol` | 544 |
| `NARAStakingPoolSYV4` | `contracts/v4/composability/NARAStakingPoolSYV4.sol` | 267 |
| `NARAFractionalPositionV4` | `contracts/v4/composability/NARAFractionalPositionV4.sol` | 323 |
| `NARAFractionalPositionFactoryV4` | `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol` | 56 |

`scripts/deployComposabilityV4.ts` deploys:

1. `NARAStakingPoolV4`
2. `NARAStakingPoolSYV4`
3. `NARAFractionalPositionFactoryV4`

`NARAFractionalPositionV4` instances are deployed by `NARAFractionalPositionFactoryV4.create(uint256 tokenId)`.

Out of scope for this checklist:

- v4 core contracts: `NARAEngine`, `NARAToken`, `NARAPositionNFTV4`
- v3/retired contracts
- archive contracts
- test mocks, except where used to validate v4 behavior

---

## Internal Audit Result Snapshot

| ID | Severity | Status | Code-synced result |
|---|---|---|---|
| CRITICAL-01 | Critical | Fixed | ERC-20 reward debt resets after balance changes in `NARAStakingPoolV4._update`. |
| CRITICAL-02 | Critical | Not a bug | Share math preserves proportional ordering using `totalNaraValue()` and current `totalSupply()`. |
| CRITICAL-03 | Critical | Fixed | `NARAStakingPoolSYV4` tracks USDC rewards per SY holder with a per-user index. |
| CRITICAL-04 | Critical | Fixed | `NARAFractionalPositionV4.claimPrincipal` gives the last principal claimant the full remainder. |
| CRITICAL-05 | Critical | Fixed | `NARAFractionalPositionV4.bind` enforces `MAX_FRACTIONS = 1e12`. |
| HIGH-01 | High | Fixed | `undistributedUsdc` and `undistributedEth` buffer rewards when supply is zero. |
| HIGH-02 | High | Mitigated | Composability contracts use `ReentrancyGuardTransient`; ETH refund failures revert with `EthRefundFailed`. |
| HIGH-03 | High | Fixed | `NARAStakingPoolV4` has `emergencyWithdrawNara`, `emergencyWithdrawUsdc`, and `emergencyWithdrawEth`, gated by `EMERGENCY_ROLE` and `emergencyShutdown`. |
| HIGH-04 | High | Fixed | Dead arithmetic was removed from current code. |
| HIGH-05 | High | Fixed | `_earliestUnlockEpoch()` returns `ENGINE.currentEpoch() + 1` when no positions exist. |
| HIGH-06 | High | Fixed | `NARAStakingPoolSYV4.previewDeposit` uses `POOL.exchangeRateWad()` for NARA deposits. |
| HIGH-07 | High | Fixed | `NARAStakingPoolSYV4` mirrors the per-holder reward-index pattern. |
| HIGH-11 | High | Fixed | `NARAFractionalPositionV4.unlockPosition()` calls `_harvestInternal()` before unlocking principal. |
| HIGH-12 | High | Fixed | `bind` rejects Genesis NFTs and stale wrappers that no longer match `factory.fractionalOf(tokenId)`. |
| MEDIUM-01 | Medium | Fixed | `NARAStakingPoolSYV4` now exposes `accruedRewards`, `rewardIndexesCurrent`, and `rewardIndexesStored` for Pendle reward-index compatibility. |
| MEDIUM-03 | Medium | Fixed | `NARAStakingPoolV4` enforces `MAX_POSITIONS = 50` and exposes `batchHarvest(uint256 start, uint256 end)`. |
| MEDIUM-04 | Medium | Verified | `onERC721Received` accepts only the configured `POSITION_NFT` where applicable. |
| MEDIUM-07 | Medium | Fixed | `NARAStakingPoolSYV4.previewDeposit` contains no dead `supply` dependency. |
| MEDIUM-08 | Medium | Fixed | `NARAStakingPoolSYV4._update` accrues USDC before every SY balance change and resets debt after the balance change. |
| MEDIUM-11 | Medium | Fixed | `NARAFractionalPositionV4.transferFrom` checks balance before consuming allowance. |
| LOW-07 | Low | Fixed | `NARAFractionalPositionV4` derives display `name` and `symbol` at bind time. |

Known accepted risk:

- Direct engine `lockFor` slot griefing is a v4 core issue, not a composability-layer issue. It remains accepted unless direct third-party locking is restricted in `NARAEngine`.

---

## Verified Commands

Use these commands for the current repo:

```bash
npm run build
npm run test:composability:v4
npm test
npm run size
```

Static analyzer command to run before external review:

```bash
npx slither contracts/v4/composability/ --exclude naming-convention
```

Notes:

- 2026-06-03: `npm run build`, targeted composability/core tests, full `npm test`, and `npm run size` passed after the stuck-token and emergency-withdrawal hardening pass. See `V4_VALIDATION_STATUS_2026-06-03.md`.
- 2026-06-03: `npm run slither:v4` ran successfully against the active v4 target list. Aderyn/Echidna remain blocked by local WSL/tooling and still need a clean Linux/tool run before mainnet TVL.
- Hardhat emits expected warnings from OpenZeppelin transient storage usage and unrelated test/v3 files. Review new warnings, but do not require zero global warnings from the whole repo before distinguishing in-scope from out-of-scope warnings.

---

## `NARAStakingPoolV4` Code-Synced Checklist

### Public Signatures

```solidity
function totalNaraValue() public view returns (uint256);
function exchangeRateWad() public view returns (uint256);
function underlyingTokenCount() external view returns (uint256);
function deposit(uint256 naraAmount, uint256 minShares) external returns (uint256 shares);
function queueRedeem(uint256 shares) external returns (uint256 id);
function claimRedemption(uint256 id) external;
function lockLiquid(uint256 grossAmount, uint256 minWeight) external payable returns (uint256 tokenId);
function unlockMatured(uint256 tokenId) external payable;
function harvest() external;
function batchHarvest(uint256 start, uint256 end) external;
function claimUsdc(address to) external returns (uint256 amount);
function claimEth(address payable to) external returns (uint256 amount);
function setKeeperBounty(uint16 bps) external;
function setDepositsPaused(bool paused) external;
function setEmergencyShutdown(bool shutdown) external;
function emergencyWithdrawNara(address to, uint256 amount) external;
function emergencyWithdrawUsdc(address to, uint256 amount) external;
function emergencyWithdrawEth(address payable to, uint256 amount) external;
function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4);
receive() external payable;
```

### Share Accounting

- [ ] `totalNaraValue()` equals `lockedPrincipal + max(0, liquidNara - reservedForRedemptions)`.
- [ ] `exchangeRateWad()` returns `1e18` when `totalSupply() == 0`.
- [ ] First deposit requires `naraAmount >= MIN_INITIAL_DEPOSIT` where `MIN_INITIAL_DEPOSIT = 100e18`.
- [ ] First deposit mints `DEAD_SHARES = 1e18` to `address(0xdead)` and subtracts those shares from the depositor output.
- [ ] Direct NARA transfers to the pool do not change `liquidNara`, so they do not change `totalNaraValue()` until a code path explicitly accounts them.
- [ ] `deposit` reverts when `depositsPaused == true` or `emergencyShutdown == true`.
- [ ] `deposit` enforces `minShares` through `SlippageExceeded(uint256 got, uint256 min)`.

### Redemption Queue

- [ ] `queueRedeem(uint256 shares)` burns the caller's shares immediately.
- [ ] `queueRedeem` calculates `naraOwed = shares * totalNaraValue() / totalSupply()` before burning.
- [ ] `queueRedeem` increments `reservedForRedemptions` by the fixed `naraOwed`.
- [ ] `readyEpoch` is `_earliestUnlockEpoch()`, or `ENGINE.currentEpoch() + 1` when the pool has no positions.
- [ ] `claimRedemption(uint256 id)` requires `msg.sender == redemptions[id].user`.
- [ ] `claimRedemption` checks `claimed`, `readyEpoch`, and `liquidNara >= naraOwed`.
- [ ] `claimRedemption` sets `claimed = true` and updates accounting before transferring NARA.

### Position Management

- [ ] `lockLiquid(uint256 grossAmount, uint256 minWeight)` requires `LOCKER_ROLE`.
- [ ] `lockLiquid` requires `underlyingTokenIds.length < MAX_POSITIONS`, where `MAX_POSITIONS = 50`.
- [ ] `lockLiquid` forwards exactly `ENGINE.lockFeeWei()` to `POSITION_NFT.mintAndLock`.
- [ ] `lockLiquid` refunds `msg.value - ENGINE.lockFeeWei()` to the caller.
- [ ] `lockLiquid` uses `ENGINE.lockFeeBps()` to compute `netAmount` and adds only net principal to `lockedPrincipal`.
- [ ] `lockLiquid` does not lock NARA reserved for queued redemptions.
- [ ] `unlockMatured(uint256 tokenId)` requires the current engine epoch to be at least the underlying position's `unlockEpoch`.
- [ ] `unlockMatured` claims NARA, USDC, and ETH rewards before unlocking principal.
- [ ] `unlockMatured` subtracts principal from `lockedPrincipal`, adds returned NARA to `liquidNara`, removes `tokenId` from `underlyingTokenIds`, and clears `tokenIndex[tokenId]`.
- [ ] `unlockMatured` refunds `msg.value - ENGINE.unlockFeeWei()` to the caller.

### Harvest and Rewards

- [ ] `harvest()` processes every current `underlyingTokenIds` entry.
- [ ] `batchHarvest(uint256 start, uint256 end)` clamps `end` to the current array length and returns without reverting when `start >= end`.
- [ ] `harvest` and `batchHarvest` revert during `emergencyShutdown`.
- [ ] NARA rewards claimed by harvest increase `liquidNara`.
- [ ] USDC rewards are split into keeper bounty and holder distribution.
- [ ] `keeperBountyBps` is capped by `MAX_KEEPER_BOUNTY_BPS = 50`.
- [ ] USDC rewards use `usdcRewardIndexRay` with `RAY = 1e27`.
- [ ] ETH rewards use `ethRewardIndexRay` with `RAY = 1e27`.
- [ ] `_update` accrues rewards for `from` and `to` before `super._update`, then resets debts after balances change.
- [ ] `claimUsdc(address to)` and `claimEth(address payable to)` return `0` instead of reverting when the caller has no accrued amount.
- [ ] Direct ETH transfers to `receive()` are not automatically indexed as holder rewards; only deltas observed during harvest/unlock accounting are indexed. Unexpected ETH requires emergency handling if it is not accounted through a normal reward path.

### Access Control

- [ ] `DEFAULT_ADMIN_ROLE`, `CONFIG_ROLE`, `EMERGENCY_ROLE`, and `LOCKER_ROLE` are granted to constructor `admin_`.
- [ ] `setKeeperBounty(uint16 bps)` is `CONFIG_ROLE` only.
- [ ] `setDepositsPaused(bool paused)` is `EMERGENCY_ROLE` only.
- [ ] `setEmergencyShutdown(bool shutdown)` is `EMERGENCY_ROLE` only.
- [ ] Emergency withdrawals require `emergencyShutdown == true`.
- [ ] Emergency withdrawals can transfer NARA, USDC, or ETH to any non-zero recipient chosen by `EMERGENCY_ROLE`; deploy this role only to a Safe or timelock before public deposits.
- [ ] `onERC721Received` accepts only NFTs sent by the configured `POSITION_NFT`.

---

## `NARAStakingPoolSYV4` Code-Synced Checklist

### Public Signatures

```solidity
function assetInfo() external view returns (uint8 assetType, address assetAddress, uint8 assetDecimals);
function yieldToken() external view returns (address);
function deposit(address receiver, address tokenIn, uint256 amountIn, uint256 minSharesOut) external returns (uint256 sharesOut);
function redeem(address receiver, uint256 amountIn, address tokenOut, uint256 minTokenOut, bool burnFromInternalBalance) external returns (uint256 amountOut);
function exchangeRate() external view returns (uint256);
function getRewardTokens() external view returns (address[] memory tokens);
function claimRewards(address user) external returns (uint256[] memory rewardAmounts);
function accruedRewards(address user) external view returns (uint256[] memory rewardAmounts);
function rewardIndexesCurrent() external returns (uint256[] memory indexes);
function rewardIndexesStored() external view returns (uint256[] memory indexes);
function getTokensIn() external view returns (address[] memory t);
function getTokensOut() external view returns (address[] memory t);
function isValidTokenIn(address token) external view returns (bool);
function isValidTokenOut(address token) external view returns (bool);
function previewDeposit(address tokenIn, uint256 amountIn) external view returns (uint256);
function previewRedeem(address tokenOut, uint256 amountIn) external view returns (uint256);
function claimableUsdc(address user) external view returns (uint256);
```

### Pendle Adapter Behavior

- [ ] `assetInfo()` returns `(0, address(NARA), 18)`.
- [ ] `yieldToken()` returns `address(STNARA)`.
- [ ] `exchangeRate()` returns `POOL.exchangeRateWad()`. In current pool math this is WAD-scaled NARA-per-stNARA.
- [ ] `getRewardTokens()` returns `[address(USDC), address(0)]` for USDC and native ETH.
- [ ] `rewardIndexesStored()` returns WAD-scaled Pendle reward indexes derived from `usdcIndexRay / 1e9 + 1` and `ethIndexRay / 1e9 + 1`.
- [ ] `rewardIndexesCurrent()` pulls USDC and ETH from the pool with `POOL.claimUsdc(address(this))` and `POOL.claimEth(payable(address(this)))`, updates both indexes, and returns the current WAD-scaled Pendle reward indexes.
- [ ] `accruedRewards(address user)` returns two elements: USDC and ETH accrued plus pending.
- [ ] `claimRewards(address user)` pulls current pool rewards, accrues only `user`, pays only that user's USDC and ETH, emits legacy reward events when non-zero, and emits Pendle-compatible `ClaimRewards`.

### Deposit and Redeem Paths

- [ ] `deposit` accepts only `tokenIn == address(STNARA)` or `tokenIn == address(NARA)`.
- [ ] `deposit` reverts on `receiver == address(0)` or `amountIn == 0`.
- [ ] STNARA deposits transfer STNARA from `msg.sender` to the SY contract and mint the same amount of SY.
- [ ] NARA deposits transfer NARA from `msg.sender`, approve `POOL`, call `POOL.deposit(amountIn, 0)`, clear approval, and mint the returned stNARA share amount as SY.
- [ ] `deposit` enforces `minSharesOut`.
- [ ] `redeem` accepts only `tokenOut == address(STNARA)`.
- [ ] `redeem` burns from `msg.sender`.
- [ ] `redeem` reverts `InternalBalanceRedeemDisabled` when `burnFromInternalBalance == true`.
- [ ] `redeem` transfers STNARA to `receiver` and enforces `minTokenOut`.
- [ ] `previewDeposit(address(STNARA), amountIn)` returns `amountIn`.
- [ ] `previewDeposit(address(NARA), amountIn)` returns `(amountIn * 1e18) / POOL.exchangeRateWad()` unless the rate is zero, in which case it returns `amountIn`.
- [ ] `previewRedeem(address(STNARA), amountIn)` returns `amountIn`.

---

## `NARAFractionalPositionV4` Code-Synced Checklist

### Public Signatures

```solidity
function bind(uint256 tokenId, uint256 fractions) external;
function totalSupply() external view returns (uint256);
function transfer(address to, uint256 amount) external returns (bool);
function approve(address spender, uint256 amount) external returns (bool);
function transferFrom(address from, address to, uint256 amount) external returns (bool);
function harvest() external;
function claimRewards(address to) external returns (uint256 naraOut, uint256 usdcOut);
function pendingRewards(address user) external view returns (uint256 naraEmission, uint256 usdcAmount);
function unlockPosition() external payable;
function claimPrincipal(address to) external returns (uint256 naraOut);
function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4);
```

### Bind and ERC-20-Like Fraction Behavior

- [ ] `bind(uint256 tokenId, uint256 fractions)` is callable once.
- [ ] `fractions` must be greater than zero and less than or equal to `MAX_FRACTIONS = 1e12`.
- [ ] `bind` requires this wrapper to equal the factory's current `fractionalOf(tokenId)` entry; a replaced stale wrapper cannot bind.
- [ ] `bind` rejects every Genesis NFT before custody transfer; only standard positions are supported.
- [ ] `bind` transfers the NFT from `msg.sender` into the fractional contract before recording bound state.
- [ ] `bind` reads the underlying engine position and stores `unlockEpoch`.
- [ ] `bind` mints all fractions to `msg.sender`.
- [ ] `name` becomes `NARA Fractional Position #<tokenId>`.
- [ ] `symbol` becomes `fracNARA-<tokenId>`.
- [ ] `decimals` is `18`.
- [ ] `totalSupply()` returns the original `fractionCount`; it does not decrease when users later claim principal.
- [ ] `transfer` and `transferFrom` accrue rewards before changing balances and reset reward debt after changing balances.
- [ ] `transferFrom` checks balance before consuming allowance.
- [ ] Self-transfers and same-address `transferFrom` preserve pending rewards.
- [ ] `onERC721Received` accepts only NFTs sent by the configured `POSITION_NFT`.

### Harvest, Rewards, Unlock, and Principal

- [ ] `harvest()` claims NARA and USDC rewards from the bound position and advances `naraEmissionIndexRay` and `usdcIndexRay`.
- [ ] `claimRewards(address to)` pays the caller's accrued NARA emission and USDC amounts; it returns zero values when no rewards are available.
- [ ] `pendingRewards(address user)` previews accrued plus pending NARA and USDC.
- [ ] `unlockPosition()` requires `ENGINE.currentEpoch() >= unlockEpoch`.
- [ ] `unlockPosition()` auto-harvests before calling `POSITION_NFT.unlockTo`.
- [ ] `unlockPosition()` forwards exactly `ENGINE.unlockFeeWei()` and refunds excess ETH to the caller.
- [ ] `unlockPosition()` sets `unlocked = true` and stores `principalReturned`.
- [ ] `claimPrincipal(address to)` requires `unlocked == true`.
- [ ] `claimPrincipal` uses `principalClaimed[msg.sender]` to block double claims.
- [ ] Non-last claimers receive `(principalReturned * balance) / fractionCount`.
- [ ] The last claimer receives `principalReturned - principalPaid`, so principal dust does not stay trapped.
- [ ] `claimPrincipal` sets the caller's fraction balance to zero but does not emit a burn `Transfer` event and does not reduce `fractionCount`; integrations must treat post-unlock supply carefully.

---

## `NARAFractionalPositionFactoryV4` Code-Synced Checklist

### Public Signatures

```solidity
function create(uint256 tokenId) external returns (address fractional);
function allFractionalsLength() external view returns (uint256);
```

### Factory Behavior

- [ ] Constructor requires non-zero NARA, USDC, ENGINE, and POSITION_NFT addresses.
- [ ] `create(uint256 tokenId)` reverts when the registered wrapper is already
  bound; an unbound stale wrapper can be replaced only by the current owner or
  an approved operator.
- [ ] `create` requires `msg.sender` to be the NFT owner, token-approved address, or operator-approved address.
- [ ] `create` deploys a fresh `NARAFractionalPositionV4`.
- [ ] `create` records `fractionalOf[tokenId]`, appends to `allFractionals`, and emits `FractionalCreated`.
- [ ] Only the current `fractionalOf[tokenId]` entry can bind; replaced wrappers remain inert.
- [ ] The factory does not bind the NFT. The creator must call `bind(tokenId, fractions)` on the deployed fractional contract after approval/transfer setup.
- [ ] There is no admin role in the factory.

---

## Known Limitations to Disclose Before Mainnet

1. **stNARA redemption queue latency:** `queueRedeem` does not guarantee instant NARA. A user can claim only after `readyEpoch` and only when enough `liquidNara` exists. If all pool value is locked, users may wait for position maturity.

2. **No automatic position rotation:** `NARAStakingPoolV4` does not automatically relock matured principal. Operators or keepers must call `unlockMatured` and then `lockLiquid` as appropriate.

3. **Emergency role power:** `EMERGENCY_ROLE` can pause deposits, activate shutdown, and withdraw NARA, USDC, or ETH after shutdown. This role must be controlled by a Safe or timelock before public deposits.

4. **Direct donations:** direct NARA transfers to `NARAStakingPoolV4` are not included in `liquidNara`; direct ETH transfers are not indexed as rewards unless observed during a harvest/unlock accounting window. Avoid sending assets directly to the pool outside documented flows.

5. **Fractional post-unlock ERC-20 semantics:** `NARAFractionalPositionV4.claimPrincipal` zeroes balances but keeps `totalSupply()` fixed at `fractionCount` and does not emit a burn `Transfer`. Frontends and integrations should treat a fractional contract as a position vault, not as a canonical rebasing/burning ERC-20 after unlock.

6. **Pendle integration still needs external validation:** `NARAStakingPoolSYV4` exposes the current reward-index and redemption functions expected by the Pendle flow, but a fork or testnet integration with Pendle contracts is still required before listing a market.

---

## Go / No-Go Before Mainnet

All of these must be true before deploying the composability layer to Base mainnet:

- [ ] `npm run build` passes.
- [ ] Focused composability tests pass: `npm run test:composability:v4`

- [ ] `npm test` passes.
- [ ] `npm run size` passes and all deployable artifacts remain under EVM bytecode limits.
- [ ] Slither or equivalent static analysis is run on `contracts/v4/composability/`.
- [ ] Independent review status is stated accurately; no third-party audit is
  claimed unless evidence exists.
- [ ] All critical and high findings are resolved.
- [ ] Medium findings are resolved or explicitly accepted.
- [ ] `scripts/deployComposabilityV4.ts` dry-run succeeds on an exact
  Base-mainnet fork using the intended production addresses.
- [ ] Constructor addresses are verified: `NARA_TOKEN_V4`, `USDC_ADDRESS`, `ENGINE_V4`, `POSITION_NFT_V4`, `ADMIN_ADDRESS`.
- [ ] `CONFIG_ROLE` and `EMERGENCY_ROLE` on `NARAStakingPoolV4` are assigned to the intended Safe or timelock before public deposits.
- [ ] First mainnet deposit is at least `100 NARA`, because `MIN_INITIAL_DEPOSIT = 100e18`.
- [ ] Post-deploy checklist printed by `scripts/deployComposabilityV4.ts` is completed.
- [ ] `NARAStakingPoolSYV4.rewardIndexesCurrent()` and `claimRewards(address user)` are tested end-to-end before Pendle market outreach.
- [ ] Exchange rate, `liquidNara`, `lockedPrincipal`, `reservedForRedemptions`, `usdcRewardIndexRay`, and `ethRewardIndexRay` are monitored for the first 48 hours.
