# NARA v4 Composability Build Plan

Last updated: 2026-05-27.

This document tracks the current v4 composability layer. Code is the source of truth. The active implementation lives under `contracts/v4/composability/`.

Canonical references:

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md)
- [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md)
- [V4_REDEPLOY_NO_SURPRISE_PLAN.md](V4_REDEPLOY_NO_SURPRISE_PLAN.md)

---

## Status

The composability layer is implemented in the repository. The fresh core v4
core now exists, but these modules remain deliberately undeployed until the core
market, position-NFT layer, oracle assumptions, and operational gates are ready.

Implemented contracts:

| Contract | Path | Status |
|---|---|---|
| `NARAStakingPoolV4` | `contracts/v4/composability/NARAStakingPoolV4.sol` | Implemented |
| `NARAStakingPoolSYV4` | `contracts/v4/composability/NARAStakingPoolSYV4.sol` | Implemented |
| `NARAFractionalPositionV4` | `contracts/v4/composability/NARAFractionalPositionV4.sol` | Implemented; deployed by factory |
| `NARAFractionalPositionFactoryV4` | `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol` | Implemented |

Not present in current code:

| Name | Current decision |
|---|---|
| `NARAStakingPoolHarvester.sol` | Not needed. Harvesting is inline in `NARAStakingPoolV4.harvest()` and `batchHarvest(uint256 start, uint256 end)`. |
| `interfaces/INARAStakingPool.sol` | Not present. Interfaces are local to implementation files. Add a standalone interface only if integrations need it. |
| `NARAStakeRouter.sol` | Not implemented. Optional frontend convenience router remains deferred. |
| DN-404 fractional NFTs | Not implemented. Current fractionalization uses `NARAFractionalPositionV4`. |

Critical principle: composability is a separate layer. It must not require changes to deployed v4 core contracts.

---

## Deployment Preconditions

Deploy composability only after these are true:

- Fresh v4 core is deployed and verified.
- `NARAToken`, `NARAEngine`, and `NARAPositionNFTV4` addresses are final.
- NARA/Base native USDC Uniswap v4 pool is seeded.
- `NARABondDepositoryV4NFT` and Genesis reward configuration are reviewed if bonds are in launch scope.
- The team accepts the extra risk of public pooled-position and fractional-position integrations.

Do not deploy composability against the retired 2026-04-23 incident stack.

---

## Deployment Script

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

What the script deploys:

1. `NARAStakingPoolV4`
2. `NARAStakingPoolSYV4`
3. `NARAFractionalPositionFactoryV4`

Constructor arguments used by the script:

```text
NARAStakingPoolV4(NARA_TOKEN_V4, USDC_ADDRESS, ENGINE_V4, POSITION_NFT_V4, ADMIN_ADDRESS)
NARAStakingPoolSYV4(NARA_TOKEN_V4, USDC_ADDRESS, NARAStakingPoolV4, NARAStakingPoolV4)
NARAFractionalPositionFactoryV4(NARA_TOKEN_V4, USDC_ADDRESS, ENGINE_V4, POSITION_NFT_V4)
```

The script writes:

```text
composability-v4-addresses-${Date.now()}.json
```

The script also prints exact Basescan verification commands for all three deployed contracts.

---

## `NARAStakingPoolV4`

Purpose: ERC-20 `stNARA` wrapper over pooled `NARAPositionNFTV4` positions.

Token metadata:

```text
name: Liquid Staked NARA
symbol: stNARA
```

Constructor:

```solidity
constructor(address nara_, address usdc_, address engine_, address positionNft_, address admin_)
```

Important constants:

```text
MIN_INITIAL_DEPOSIT = 100e18
DEAD_SHARES = 1e18
TARGET_LOCK_EPOCHS = 35_040
MAX_POSITIONS = 50
MAX_KEEPER_BOUNTY_BPS = 50
```

External user and keeper surface:

```solidity
function totalNaraValue() public view returns (uint256);
function exchangeRateWad() public view returns (uint256);
function previewDeposit(uint256 naraAmount) external view returns (uint256);
function claimableUsdc(address user) external view returns (uint256);
function claimableEth(address user) external view returns (uint256);
function userRedemptions(address user) external view returns (uint256[] memory);
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
```

Admin and emergency surface:

```solidity
function setKeeperBounty(uint16 bps) external;
function setDepositsPaused(bool paused) external;
function setEmergencyShutdown(bool shutdown) external;
function emergencyWithdrawNara(address to, uint256 amount) external;
function emergencyWithdrawUsdc(address to, uint256 amount) external;
function emergencyWithdrawEth(address payable to, uint256 amount) external;
```

Current behavior:

- First deposit must be at least `100 NARA`.
- First deposit mints `DEAD_SHARES = 1e18` to `address(0xdead)`.
- Deposits increase `liquidNara`.
- `lockLiquid(uint256 grossAmount, uint256 minWeight)` lets `LOCKER_ROLE` lock idle liquid NARA into a max-duration `NARAPositionNFTV4` position.
- `unlockMatured(uint256 tokenId)` unlocks only after the underlying engine position reaches maturity.
- `harvest()` claims NARA, ETH, and USDC rewards from all underlying positions.
- `batchHarvest(uint256 start, uint256 end)` provides paginated harvesting for large position sets.
- NARA rewards compound into pool value through `liquidNara`.
- USDC rewards distribute through `usdcRewardIndexRay`.
- ETH rewards distribute through `ethRewardIndexRay`.
- `queueRedeem(uint256 shares)` burns stNARA immediately and reserves NARA owed.
- `claimRedemption(uint256 id)` only pays after the redemption ready epoch and only if liquid NARA is available.
- Redemptions do not break underlying locks early.
- Emergency withdrawals require `emergencyShutdown == true`.

Known integration assumptions:

- Integrations should price stNARA through `exchangeRateWad()`.
- Integrations should not assume immediate protocol redemption.
- An external NARA/stNARA AMM can provide instant exit, but that AMM is not created by this contract.
- Direct NARA transfers to the pool are not counted in `liquidNara`.
- Direct ETH transfers are not indexed as rewards unless accounted during harvest or unlock accounting.

---

## `NARAStakingPoolSYV4`

Purpose: Pendle-style Standardized Yield adapter over `stNARA`.

Token metadata:

```text
name: SY NARA Staking Pool
symbol: SY-stNARA
```

Constructor:

```solidity
constructor(address nara_, address usdc_, address stNara_, address pool_)
```

Script configuration:

```text
stNara_ = NARAStakingPoolV4
pool_ = NARAStakingPoolV4
```

External surface:

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

Current behavior:

- Accepts NARA deposits.
- Accepts stNARA deposits.
- Redeems only to stNARA.
- NARA deposits call `NARAStakingPoolV4.deposit(amountIn, 0)`.
- stNARA deposits wrap 1:1 into SY.
- SY redeems 1:1 into stNARA.
- `burnFromInternalBalance == true` is disabled and reverts `InternalBalanceRedeemDisabled`; integrations must redeem from caller-held SY.
- `exchangeRate()` returns `NARAStakingPoolV4.exchangeRateWad()`.
- Reward token list contains USDC and native ETH.
- `rewardIndexesStored()` returns WAD-scaled reward indexes for USDC and ETH.
- `rewardIndexesCurrent()` pulls pool USDC and ETH rewards, updates the SY indexes, and returns the current WAD-scaled reward indexes.
- `claimRewards(address user)` pays only `user`'s accrued USDC and ETH.

Pendle status:

- The local adapter exposes the reward-index functions expected by the current remediation; shared internal-balance redeem is intentionally disabled.
- External Pendle integration is not complete until tested on a fork or testnet against Pendle contracts.
- Do not request a live Pendle market until deployed `rewardIndexesCurrent()`, `rewardIndexesStored()`, `accruedRewards(address)`, `claimRewards(address)`, and disabled internal-balance `redeem` behavior are verified end to end.

---

## `NARAFractionalPositionFactoryV4`

Purpose: deploy one fractional wrapper for a specific `NARAPositionNFTV4` token ID.

Constructor:

```solidity
constructor(address nara_, address usdc_, address engine_, address positionNft_)
```

External surface:

```solidity
function create(uint256 tokenId) external returns (address fractional);
function allFractionalsLength() external view returns (uint256);
```

Public storage accessors:

```solidity
function fractionalOf(uint256 tokenId) external view returns (address);
function allFractionals(uint256 index) external view returns (address);
```

Current behavior:

- `create(uint256 tokenId)` reverts if the registered wrapper is already bound.
  An unbound stale wrapper may be replaced by the current owner or an approved
  operator; only the latest `fractionalOf[tokenId]` entry is canonical.
- Caller must own the NFT or be approved for it.
- The factory deploys `NARAFractionalPositionV4`.
- The factory records `fractionalOf[tokenId]`.
- The factory appends the new wrapper to `allFractionals`.
- The factory does not transfer or bind the NFT. The user must call `bind(uint256 tokenId, uint256 fractions)` on the created wrapper.

---

## `NARAFractionalPositionV4`

Purpose: fractional ERC-20-like wrapper for one `NARAPositionNFTV4`.

Constructor:

```solidity
constructor(address nara_, address usdc_, address engine_, address positionNft_)
```

External surface:

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
```

Current behavior:

- `bind(uint256 tokenId, uint256 fractions)` requires this wrapper to equal the
  factory's current `fractionalOf(tokenId)` entry and transfers the NFT into the
  fractional contract.
- Only standard, non-Genesis position NFTs are supported. All Genesis position
  NFTs are rejected before transfer because their arbitrary reward-token set
  cannot be enumerated safely by this wrapper.
- `fractions` must be greater than `0` and no more than `1e12`.
- The initial binder receives all fraction units.
- Display metadata is set at bind time:
  - For `tokenId = 123`, `name = "NARA Fraction #123"`.
  - For `tokenId = 123`, `symbol = "fracNARA-123"`.
- `harvest()` claims NARA emission and USDC rewards from the underlying NFT.
- Rewards are distributed pro rata by fraction balance.
- `unlockPosition()` can only execute after the underlying position reaches maturity.
- `unlockPosition()` auto-harvests final rewards before unlocking principal.
- `claimPrincipal(address to)` pays principal pro rata.
- The final claimant receives remaining principal dust.
- After principal claim, the claimant balance is set to zero.
- `totalSupply()` remains equal to `fractionCount` after principal claims; integrations must not treat it as burn-style ERC-20 supply accounting.

---

## Verification Requirements

Run before Base mainnet composability deployment:

```bash
npm run build
npx hardhat test test/composability/NARAStakingPool.test.ts test/composability/NARAFractionalPosition.test.ts
npm test
npm run size
```

Latest known local targeted result after the May 7 audit remediations:

- `npm run test:v4`: 86 passing.
- `test/NARAPositionNFTV4.test.ts`: 18 passing.
- Composability tests: 15 passing.
- Bond and reserve tests: 158 passing.
- `npm run test:bond-nft:v4`: 11 passing.
- V4 invariant regression tests: 4 passing.
- `npm run size`: passed.
- `NARAEngine` deployed bytecode: 24514 bytes.
- `NARAStakingPoolSYV4` deployed bytecode: 8502 bytes.

Static analysis:

- The repository's scoped Slither run completed on 2026-07-29 with exit 0 and
  included all four active composability contracts.
- Slither emitted heuristic findings for the fractional and staking contracts;
  they remain review inputs, not proof of an exploit or a clean bill of health.
- Aderyn has not run against the current patch because its binary is
  unavailable. Rerun both tools before the later composability deployment.

Reproduction command:

```bash
npm run slither:v4
```

---

## Post-Deploy Checklist

After `scripts/deployComposabilityV4.ts` completes:

- Verify `NARAStakingPoolV4` on Basescan with the printed command.
- Verify `NARAStakingPoolSYV4` on Basescan with the printed command.
- Verify `NARAFractionalPositionFactoryV4` on Basescan with the printed command.
- Store the generated `composability-v4-addresses-${Date.now()}.json` file with the deployment records.
- Confirm `NARAStakingPoolV4.NARA()` matches the fresh v4 token.
- Confirm `NARAStakingPoolV4.USDC()` matches Base native USDC.
- Confirm `NARAStakingPoolSYV4.yieldToken()` equals `NARAStakingPoolV4`.
- Confirm `NARAStakingPoolSYV4.assetInfo()` returns the intended NARA asset address.
- Grant `CONFIG_ROLE` on `NARAStakingPoolV4` to the Safe or timelock.
- Grant `EMERGENCY_ROLE` on `NARAStakingPoolV4` to the Safe or timelock.
- Revoke or renounce deployer roles if the deployer should not retain production control.
- Seed first stNARA deposit with at least `100 NARA`.
- Call `lockLiquid(uint256 grossAmount, uint256 minWeight)` only after confirming lock fee ETH funding.
- Run `harvest()` after there is at least one underlying position.
- Verify `claimUsdc(address to)` and `claimEth(address payable to)` with small amounts when rewards exist.
- Verify `NARAStakingPoolSYV4.rewardIndexesCurrent()`.
- Verify `NARAStakingPoolSYV4.claimRewards(address user)`.
- Monitor `exchangeRateWad`, `liquidNara`, `lockedPrincipal`, `reservedForRedemptions`, `usdcRewardIndexRay`, and `ethRewardIndexRay` for at least 48 hours.

---

## Launch Gates

Do not open public composability deposits unless every item is true:

- Fresh v4 core is deployed and verified.
- Fresh v4 allocation layer is deployed and verified if bonds or Genesis rewards are in launch scope.
- NARA/USDC liquidity is seeded.
- `npm test` passes.
- `npm run size` passes.
- Focused composability tests pass.
- Static analysis is run or explicitly waived by governance.
- `CONFIG_ROLE` and `EMERGENCY_ROLE` are assigned to production-controlled addresses.
- `NARAStakingPoolSYV4` reward-index functions are tested on deployed contracts.
- First `stNARA` deposit is at least `100 NARA`.
- Public docs and frontend config use only fresh addresses.
- Retired 2026-04-23 addresses remain marked retired.

---

## Deferred Work

These remain separate future work items:

| Item | Status |
|---|---|
| NARA/stNARA AMM market | Not deployed by current script. Needed for instant exit UX. |
| Pendle PT/YT market | Not deployed by this repo. Requires external Pendle coordination after adapter validation. |
| Frontend stake route | Not implemented in this doc. Frontend must call current contract functions directly or add a reviewed router later. |
| Standalone integration interfaces | Not present. Add only when downstream integrators need stable interface files. |
| Cross-chain wrapper | Deferred. v4 focus is Base-native. |
| Custom paymaster | Deferred. Use provider-based paymaster infrastructure if gas sponsorship is enabled. |

---

## Immediate Next Actions

1. Complete fresh v4 core redeploy and verification.
2. Complete allocation deploy and verification if bonds, NFT positions, or Genesis rewards are in launch scope.
3. Run the composability verification block in this document.
4. Run static analysis on `contracts/v4/composability/`.
5. Deploy composability with `scripts/deployComposabilityV4.ts`.
6. Verify contracts on Basescan using the printed commands.
7. Seed the first `stNARA` deposit.
8. Run deployed reward-index checks before Pendle outreach.
