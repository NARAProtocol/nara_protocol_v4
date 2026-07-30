# NARA Protocol PRD

Last updated: 2026-07-26.

Status: v3 is retired. The fresh v4 Stage A core is already deployed on Base
mainnet and remains dormant. The current product launch scope is NARA Baskets
only. Lockboard is deferred; Lotto and Arena are retired. Do not repeat the
core deployment. See [CURRENT_STATE.md](CURRENT_STATE.md).

Code and deployment scripts are the source of truth. If this PRD conflicts with Solidity, scripts, or [CURRENT_STATE.md](CURRENT_STATE.md), update this PRD.

---

## 1. Product Definition

NARA v4 is a Base-native, fixed-supply, time-preference yield protocol.

The v4 product is built around:

- A fixed `1,000,000 NARA` token supply minted once at deployment.
- A fresh NARA/USDC Uniswap v4 launch pair using Base native USDC.
- Dynamic swap-fee capture through `NARALiquidityGrowthHook`.
- Fee custody and routing through `NARALiquidityGrowthVault`.
- Duration-weighted NARA, ETH, and ERC-20 reward accounting through `NARAEngine`.
- Tradable lock positions through `NARAPositionNFTV4` and `NARAPositionAccountV4`.
- NFT bond positions through `NARABondDepositoryV4NFT`.
- Genesis reward accounting through `NARAGenesisRewardDistributorV4`.
- Optional composability through `NARAStakingPoolV4`, `NARAStakingPoolSYV4`, and fractional position wrappers.

The frontend is a launch and education surface. It is not the protocol identity.

---

## 2. Product Thesis

NARA rewards committed capital and duration.

The durable promise is a protocol where:

- Finite NARA emissions flow to active committed weight.
- ETH and ERC-20 rewards can route to the same active committed weight.
- Duration changes economic weight, not only display status.
- Lock positions can be traded as NFTs.
- NFT positions can later become ERC-20 surfaces through stNARA or fractional wrappers.
- Core rules are deployed in contracts, while product surfaces can iterate.

In plain terms:

- NARA emission is finite.
- Protocol reward flow is open-ended through ETH and ERC-20 reward routes.
- Duration is part of the asset.
- NFT position ownership makes commitment portable.
- Composability turns committed positions into DeFi building blocks.

---

## 3. Current Scope

Not yet live (awaiting fresh v4 deploy):

- Fresh v4 mainnet deploy.
- Public v4 token address.

In repo, ready to deploy:

- v4 source code in `contracts/v4/`.
- v4 deployment and verification scripts in `scripts/`.
- v4 composability code in `contracts/v4/composability/`.

Not live today:

- Public v4 launch candidate.
- Fresh v4 NARA/USDC pool.
- Fresh v4 allocation stack.
- Public v4 NFT bond market.
- Deployed v4 composability layer.
- Pendle market for `NARAStakingPoolSYV4`.
- NARA/stNARA AMM.
- v4 sponsor hub.

Fresh v4 launch scope:

- Deploy v4 core with `npm run deploy:v4:base:usdc`.
- Run `npm run verify:v4:preflight`.
- Seed NARA/USDC liquidity.
- Run `npm run smoke:v4`.
- Deploy allocations with NFT bonds closed.
- Run `npm run verify:v4:allocations`.
- Open public lock flow through `NARAPositionNFTV4`.
- Open bonds only after terms, capacity, treasury routing, Genesis metadata, and roles are reviewed.
- Deploy composability only after core and allocation verification.

---

## 4. Primary User Loops

### v4 Committed Participant

- Acquire NARA.
- Approve or permit NARA spending.
- Mint a `NARAPositionNFTV4` lock position.
- Wait through activation according to v4 epoch rules.
- Earn NARA, ETH, and supported ERC-20 rewards based on active weight.
- Claim rewards over time.
- Extend the lock if desired.
- Unlock after maturity unless the position is an eternal Genesis position.

### Genesis Participant

- Receive or mint a Genesis-aware position through an approved launch path.
- Hold an NFT with Genesis metadata:
  - `roundId`
  - `tierId`
  - `rewardMultiplierBps`
  - `mintedAt`
  - `rewardWeight`
  - `isEternal`
- Claim Genesis ETH or ERC-20 rewards through `NARAPositionNFTV4`.
- Understand that eternal Genesis positions cannot unlock principal through the normal path; after maturity they exit through `burnEternalGenesis`, which removes Genesis reward weight and returns principal.

### NFT Bond Buyer

- Buy through `NARABondDepositoryV4NFT` after the market is intentionally opened.
- Receive a tradable Genesis position NFT.
- Enter the engine reward system through the NFT position.
- Create ETH flow for the protocol through the bond purchase split.
- Accept that bond terms, capacity, and pricing are controlled by timelocked roles and should start inactive.

### stNARA User

- Deposit NARA into `NARAStakingPoolV4`.
- Receive `stNARA` shares.
- Let the pool lock idle NARA into max-duration NFT positions.
- Queue redemptions with `queueRedeem(uint256 shares)`.
- Claim redemptions only when liquid NARA is available.
- Claim USDC and ETH rewards through pool reward indexes.

### Pendle / SY User

- Deposit NARA or stNARA into `NARAStakingPoolSYV4`.
- Receive `SY-stNARA`.
- Redeem only to stNARA.
- Use Pendle flows only after deployed SY reward-index behavior is validated.

### Fractional Position User

- Own or obtain approval for a `NARAPositionNFTV4`.
- Call `NARAFractionalPositionFactoryV4.create(uint256 tokenId)`.
- Bind the NFT into the created wrapper with `bind(uint256 tokenId, uint256 fractions)`.
- Trade or transfer fractional balances.
- Claim pro-rata rewards.
- Unlock after maturity and claim principal pro rata.

### Operator

- Maintain canonical state docs.
- Run local verification before deployment.
- Keep deployment logs and `.env` synchronized.
- Verify preflight, seed, smoke, allocations, and composability gates.
- Move roles and ownership to production-controlled addresses.
- Keep public docs and frontend config aligned with fresh addresses only.

### Future Integrator

- Build dashboards, AMMs, lending research, analytics, or automation around:
  - `NARAPositionNFTV4`
  - `NARAStakingPoolV4`
  - `NARAStakingPoolSYV4`
  - `NARAFractionalPositionV4`
  - `NARALiquidityGrowthVault`

---

## 5. Core v4 Components

### `NARALauncher`

- Deploys `NARAToken` and `NARAEngine` as a paired launch.
- Resolves the constructor dependency between token flash-fee sink and engine token binding.

### `NARAToken`

- ERC-20 token with fixed `MAX_SUPPLY = 1_000_000 ether`.
- Mints supply once to the configured treasury.
- Has no owner, pause, blacklist, upgrade, admin mint, or admin setter.
- Supports ERC-2612 permit.
- Supports ERC-1363 transfer-and-call flows.
- Supports ERC-3156 flash mint with `MAX_FLASH_LOAN = 100_000 ether` and `FLASH_FEE_BPS = 10`.
- Routes flash-mint fees to immutable `FLASH_FEE_SINK`, expected to be the engine.

### `NARAEngine`

- Manages v4 locks, activation, rewards, claims, extensions, and unlocks.
- Uses global `positionId`, starting at `1`.
- Auto-advances epochs inside user-facing calls, capped by `MAX_JIT_ADVANCE = 8`; mutating flows revert `EpochStale` if backlog remains after the cap.
- Exposes `poke()` and explicit epoch-advance paths for backlog catch-up.
- `EPOCH_LENGTH` is set in the constructor; deployments must check the actual value.
- Rejects direct ETH transfers.
- Accepts ETH rewards through `notifyEthRewards()`.
- Contains a role-gated non-NARA ERC-20 reward surface, but the deployed-engine
  launch configuration keeps it disabled because later notifications can
  under-allocate after an active-position extension.
- Rejects NARA as an ERC-20 reward token.
- Supports `lockWithPermit(uint256 amount, uint64 durationEpochs, uint256 minWeight, uint256 deadline, uint8 v, bytes32 r, bytes32 s)`.
- Supports ERC-1363 `onTransferReceived(address operator, address from, uint256 value, bytes data)` locking when flat lock ETH fee is zero.

### `NARALiquidityGrowthHook`

- Current Uniswap v4 hook for the NARA/USDC pool.
- Supports exact-input swaps.
- Rejects exact-output swaps.
- Enforces the registered official pool.
- Uses dynamic buy/sell fee curves.
- Timelocks fee-curve and protocol-depth changes after pool registration.
- Sends pool fees to `NARALiquidityGrowthVault`.
- Emits `PoolFeeRecordFailed` if vault accounting fails after the fee is taken.

### `NARALiquidityGrowthVault`

- Custodies pool fees from the hook.
- Starts in `RouteMode.Liquidity`.
- Supports route modes:
  - `Liquidity`
  - `Genesis`
  - `GenesisSplit`
  - legacy `Engine` and `Split` enum values, both permanently rejected by
    `setRouteMode`
- Can route NARA and USDC into LP compounding, or USDC into Genesis rewards and
  Genesis/LP split flows, depending on mode and configuration.
- `setHook(address)` is one-time.
- `setCompounder(address)` is optional; without a reviewed compounder, fees can accumulate in the vault. Compound/split callers must be owner or allowed with `setCompoundKeeper(address,bool)`.

### `NARAPositionNFTV4`

- ERC-721 controller for v4 engine positions.
- Each position NFT controls a clone account through `NARAPositionAccountV4`.
- NFT owner controls claim, ERC-20 reward claim, extend, and unlock paths.
- Supports Genesis metadata and Genesis reward claims.
- Uses optional ERC-2981 royalties as marketplace metadata only.

### `NARAPositionAccountV4`

- Per-NFT clone account that owns the underlying engine position.
- Lets NFT ownership control engine position actions without transferring raw engine position ownership.

### `NARAGenesisRewardDistributorV4`

- Tracks Genesis reward weights.
- Supports ETH and ERC-20 reward distribution for Genesis positions.
- Used by `NARAPositionNFTV4` Genesis claim paths.

### `NARABondVaultV4`

- Holds v4 bond inventory.
- Uses timelocked market and cap controls.
- Approved launch allocation target is `V4_BOND_AMOUNT_NARA=200000`.
- Approved minimum treasury float is `V4_MIN_TREASURY_FLOAT_NARA=150000`.
- These are approved operator overrides; current executable defaults must not be
  treated as approval to use different values.

### `NARABondDepositoryV4NFT`

- Preferred public v4 bond market.
- Mints tradable Genesis position NFTs for buyers.
- Starts with inactive terms by default through `V4_BOND_ACTIVE=false`.
- Initial capacity starts at `0`.
- `executeTerms()` requires the depository to be paused.
- `addCapacity(uint256 amount)` requires the depository to be paused.
- Legacy `buyBond` and `buyBondFor` revert; public purchases must use `buyBondWithQuote` or `buyBondForWithQuote`.
- Bond quotes are EIP-712 signed by `PRICE_SIGNER_ROLE` and include buyer, recipient, ETH input, payout bounds, deadline, nonce, and active terms timestamp.

### `NARAOpsVaultV4`

- One-shot operations vesting vault.
- Ops allocation defaults to `V4_OPS_AMOUNT_NARA=0`.
- Ops amount is capped by script at `10,000 NARA`.

---

## 6. Composability Components

### `NARAStakingPoolV4`

- ERC-20 `stNARA` wrapper over pooled v4 position NFTs.
- First deposit must be at least `100 NARA`.
- First deposit mints `DEAD_SHARES = 1e18` to `address(0xdead)`.
- `deposit(uint256 naraAmount, uint256 minShares)` mints stNARA.
- `lockLiquid(uint256 grossAmount, uint256 minWeight)` lets `LOCKER_ROLE` lock idle liquid NARA into max-duration NFT positions.
- `harvest()` and `batchHarvest(uint256 start, uint256 end)` harvest underlying positions.
- NARA rewards compound into pool value.
- USDC and ETH rewards distribute through reward indexes.
- `queueRedeem(uint256 shares)` burns shares and creates a redemption claim.
- `claimRedemption(uint256 id)` pays only when ready and liquid.

### `NARAStakingPoolSYV4`

- Pendle-style SY adapter for stNARA.
- Accepts NARA or stNARA deposits.
- Redeems only to stNARA.
- Exposes:
  - `accruedRewards(address user)`
  - `rewardIndexesCurrent()`
  - `rewardIndexesStored()`
  - `claimRewards(address user)`
- Reports USDC as the Pendle reward token; native ETH is claimable through `claimNativeEth(address payable to)`, not through SY `claimRewards`.
- Rejects `burnFromInternalBalance == true`; integrations must redeem from caller-held SY.
- Must be tested on deployed contracts before Pendle outreach.

### `NARAFractionalPositionFactoryV4`

- Deploys one `NARAFractionalPositionV4` wrapper per NFT token ID.
- Requires the caller to own or be approved for the NFT.
- Records `fractionalOf(uint256 tokenId)`.

### `NARAFractionalPositionV4`

- Fractional ERC-20-like wrapper for one position NFT.
- `bind(uint256 tokenId, uint256 fractions)` transfers the NFT into the wrapper.
- `fractions` must be greater than `0` and no more than `1e12`.
- `harvest()` claims rewards.
- `claimRewards(address to)` pays pro-rata NARA emission and USDC rewards.
- `unlockPosition()` unlocks after maturity and auto-harvests final rewards.
- `claimPrincipal(address to)` pays principal pro rata.
- Final claimant receives principal dust.
- `totalSupply()` remains equal to `fractionCount` after principal claims.

---

## 7. Economic Design

### Fixed Supply

- Persistent supply is fixed at `1,000,000 NARA`.
- No post-deploy admin mint exists.
- Flash minting exists only inside ERC-3156 flash-loan execution and pays a fee to the immutable fee sink.

### Emission Reserve

- The deployed v4 emission reserve was funded with `650,000 NARA`.
- Funding enters `NARAEngine.depositRewards(uint256 amount)` and becomes tracked emission reserve.
- If automatic funding is not possible, deployment can require it with `V4_REQUIRE_REWARD_DEPOSIT=1`.

### Bond Inventory

- Approved bond inventory is `V4_BOND_AMOUNT_NARA=200000`.
- The script rejects values above `290,000 NARA`.
- Bond terms start inactive by default.
- Bond capacity starts at `0`.
- Opening bonds is a separate operator action after verification.

### Treasury Float

- Approved minimum float is `V4_MIN_TREASURY_FLOAT_NARA=150000`.
- It preserves the locked `70,000 NARA` LP allocation, `40,000 NARA` external
  team vesting allocation, and `40,000 NARA` treasury allocation.
- The controlled initial pool seed is `60,000 NARA + 300 USDC`, targeting
  `$0.005` per NARA and approximately `$5,000` FDV. The remaining `10,000 NARA`
  LP allocation stays in custody
  until separately reviewed liquidity additions.

### Commitment-Weighted Yield

- Active reward share is based on active weight.
- Weight depends on amount and duration.
- Rewards can include NARA, ETH, and non-NARA ERC-20 tokens.

### Liquidity Growth

- NARA/USDC pool fees are captured by `NARALiquidityGrowthHook`.
- Fees accrue in `NARALiquidityGrowthVault`.
- Vault mode determines whether value compounds liquidity, routes to engine rewards, routes to Genesis, or splits.

---

## 8. Product Strategy

### Near-Term

- Finish documentation sync to v4 code.
- Run local verification and static analysis or record an explicit waiver.
- Deploy fresh v4 core.
- Run preflight, liquidity seed, and smoke test.
- Deploy allocations with NFT bonds closed.
- Update docs and frontends only after fresh address verification.

### Mid-Term

- Open NFT-managed public lock flow.
- Build v4 position visibility around NFT token ID, engine position ID, activation, reward state, maturity, and Genesis metadata.
- Open NFT bonds only after terms, capacity, treasury, and role review.
- Operate liquidity growth vault route modes deliberately.

### Long-Term

- Deploy composability after core and allocation verification.
- Validate stNARA and SY behavior on deployed contracts.
- Create NARA/stNARA AMM only after pool behavior is monitored.
- Contact Pendle only after deployed SY validation.
- Build fractional-position UI and indexing.
- Research lending collateral only after liquidity, oracle, and redemption-risk work exists.
- Consider v4 sponsor hub as a separate product lane after the core v4 launch is stable.

---

## 9. Non-Goals

- Reusing the retired 2026-04-23 v4 stack.
- Deploying retired liquidity tax contracts as current v4 launch code.
- Opening bonds early for headline activity.
- Marketing the protocol as risk-free.
- Hiding activation, epoch, reward, liquidity, or bond-state mechanics.
- Treating gas sponsorship as a Solidity dependency.
- Treating composability as live before deployment and verification.
- Contacting Pendle for a live market before SY validation.
- Treating a roadmap item as complete before deployed addresses and verification are recorded.

---

## 10. Success Criteria

Short-term success:

- Fresh v4 core deploy succeeds.
- Preflight passes.
- NARA/USDC liquidity is seeded.
- Smoke test passes.
- Allocation dry-run and allocation deploy preserve treasury float.
- Public docs and frontend config point only to fresh verified addresses.

Medium-term success:

- Users can mint and manage v4 NFT positions without manual support.
- Operators can see hook, vault, route, pool, epoch, and reward state.
- NFT bond market can be opened in controlled tranches.
- Genesis reward state is visible and claimable.

Long-term success:

- stNARA is deployed, seeded, and monitored.
- SY reward-index behavior is verified before Pendle outreach.
- Fractional position wrappers have a usable UI and indexer.
- Third parties can build on current v4 contracts without core changes.
- NARA is understood as a Base-native time-preference protocol, not only a token or campaign page.
