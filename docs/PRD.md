# NARA Protocol PRD

Last updated: 2026-08-30.

Status: v3 is retired. The fresh v4 core and Compounder are deployed and
source-verified on Base mainnet. Hook/Vault Safe ownership is accepted; the
NARA/USDC pool is initialized and seeded, LP NFT `2898124` is Safe-owned, and
receipt-pinned buy/sell and same-block tax tests passed. The bounded Compounder
validation minted LP NFT `2898486`, and the separate permanent Vault binding
freeze succeeded. The latest receipt-pinned compound increased that position to
liquidity `4386316228001171`. Both maintainers are active under separate bounded
policies. The Position NFT Phase-2 baseline is deployed and finalized but
remains `integrationReady: false`. The Engine lifecycle smoke remains pending;
Baskets remain preview-only, Lockboard is deferred, and Lotto and Arena are
retired. Current authority is [CURRENT_STATE.md](CURRENT_STATE.md) and its
referenced manifests and release records.

The canonical contracts and NARA/USDC pool are in technical live testing with
real assets on Base mainnet. This PRD is an engineering specification, not
public product availability, legal approval, financial promotion, or a
recommendation to transact. This repository contains no evidence of completed
jurisdiction-specific qualified legal review.

Code and deployment scripts are the source of truth. If this PRD conflicts with Solidity, scripts, or [CURRENT_STATE.md](CURRENT_STATE.md), update this PRD.

---

## 1. Product Definition

NARA v4 is a Base-native, fixed-supply protocol with time-weighted positions and
variable reward accounting.

The v4 product is built around:

- A fixed `1,000,000 NARA` token supply minted once at deployment.
- A fresh NARA/USDC Uniswap v4 launch pair using Base native USDC.
- Dynamic swap-fee capture through `NARALiquidityGrowthHook`.
- Fee custody and routing through `NARALiquidityGrowthVault`.
- Duration-weighted NARA and ETH reward accounting through `NARAEngine`; its
  generic ERC-20 notifier is prohibited for the deployed Engine.
- Owner-transferable lock positions through `NARAPositionNFTV4` and
  `NARAPositionAccountV4`; transferability does not guarantee a market, buyer,
  liquidity, value, or exit.
- Undeployed bond-position source through `NARABondDepositoryV4NFT`.
- Undeployed Genesis-accounting source through
  `NARAGenesisRewardDistributorV4`.
- Optional undeployed composability source through `NARAStakingPoolV4`,
  `NARAStakingPoolSYV4`, and fractional position wrappers.

The frontend is a planned/preview education and transaction-review surface; it
is not a currently available product or the protocol identity.

---

## 2. Product Thesis

NARA source assigns accounting weight based on recorded amount and duration.
Variable NARA emissions and contributed ETH are allocated across eligible
active weight; amounts can be zero.

The design objective is a protocol where:

- Finite NARA emissions flow to active committed weight.
- NARA emissions and contributed ETH can be accounted across active committed
  weight. The deployed Engine's generic ERC-20 notifier must remain unused.
- Duration changes economic weight, not only display status.
- Lock positions can be owner-transferred as NFTs; marketplace support is not
  implied.
- Optional undeployed source could later create ERC-20 representations through
  stNARA or fractional wrappers after separate gates.
- Core rules are deployed in contracts, while product surfaces can iterate.

In plain terms:

- NARA emission is finite.
- The deployed Engine accounts contributed ETH; its generic ERC-20 notifier is
  prohibited.
- Duration is an accounting and unlock input.
- ERC-721 control can be transferred, but no market, value, liquidity, buyer,
  or exit is implied.
- Composability code is optional, undeployed source and has no availability
  commitment.

---

## 3. Current Scope

Deployed and liquidity-activated:

- Fresh v4 core contracts, including the public NARA token address recorded in
  `CURRENT_STATE.md`.
- Fresh Safe-owned Hook and Vault, wired Safe-owned Compounder, initialized and
  seeded NARA/USDC pool, and Safe-owned LP NFT `2898124`.
- Live buy/sell and same-block tax tests with reconciled Vault accounting.
- At the latest receipt-pinned compound, Compounder-owned LP NFT `2898486` had
  liquidity `4386316228001171`; `28.423769295100595183 NARA / 2.326460 USDC`
  remained banked and Vault balances were zero.
- The seven-contract Position NFT Phase-2 baseline is deployed,
  source-verified, and Safe-finalized, with `integrationReady: false`.

Source present; deployment not authorized:

- v4 source code in `contracts/v4/`.
- v4 deployment and verification scripts in `scripts/`.
- v4 composability code in `contracts/v4/composability/`.

Each future module still requires applicable security, economic, legal,
integration, monitoring, custody, and user-exit review plus explicit human
approval.

Not live today:

- Full public product launch and production-readiness claim.
- Public lock, activation, claim, and unlock lifecycle availability.
- Position NFT consumer integration; the deployment remains
  `integrationReady: false`.
- Public v4 NFT bond market.
- Deployed v4 composability layer.
- Pendle market for `NARAStakingPoolSYV4`.
- NARA/stNARA AMM.
- v4 sponsor hub.

Fresh v4 remaining launch scope:

- Treat core deployment, Safe ownership acceptance, Compounder deployment and
  wiring, atomic pool activation, receipt-pinned tax testing, Engine backlog
  recovery, and Compounder validation/freeze as complete; do not rerun them.
- Monitor the separately authorized bounded epoch and liquidity maintainers;
  do not change their independent roles, schedules, bounds, or deployment
  bindings without a new explicit authorization and deployment-specific review.
- Complete and receipt-pin the Engine lock, activation, claim, and unlock
  lifecycle smoke.
- Deploy allocations with NFT bonds closed.
- Run `npm run verify:v4:allocations`.
- Consider a public Position NFT flow only after lifecycle, integration,
  monitoring, disclosure, exit, and jurisdiction-specific legal gates pass; no
  current activation is authorized.
- Open bonds only after terms, capacity, treasury routing, Genesis metadata, and roles are reviewed.
- Deploy composability only after core and allocation verification.

---

## 4. Source-Level Future User Loops

These are design requirements for flows that remain unavailable unless current
deployment, integration, product, and legal gates are all satisfied. They are
not instructions, recommendations, or an invitation to transact.

### v4 Committed Participant

- Acquire NARA.
- Approve or permit NARA spending.
- Mint a `NARAPositionNFTV4` lock position.
- Wait through activation according to v4 epoch rules.
- Account for variable NARA emissions and contributed ETH based on active
  weight; amounts can be zero. The deployed Engine's ERC-20 notifier is
  prohibited.
- Claim rewards over time.
- Extend the lock if desired.
- Unlock after maturity unless the position is an eternal Genesis position.

### Genesis Participant

- If a separately reviewed and authorized future Genesis path exists, receive
  or mint a Genesis-aware position through that exact verified path.
- Hold an NFT with Genesis metadata:
  - `roundId`
  - `tierId`
  - `rewardMultiplierBps`
  - `mintedAt`
  - `rewardWeight`
  - `isEternal`
- Claim Genesis ETH or ERC-20 rewards through `NARAPositionNFTV4`.
- Understand that eternal Genesis source positions cannot use the normal unlock
  path. After maturity, `burnEternalGenesis` attempts to remove Genesis reward
  weight and release the recorded NARA amount when contract conditions pass;
  execution, token value, and recovery are not guaranteed.

### NFT Bond Buyer

- Buy through `NARABondDepositoryV4NFT` after the market is intentionally opened.
- Receive an owner-transferable Genesis position NFT; no market, buyer,
  liquidity, value, or exit is guaranteed.
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
- After maturity and when contract conditions pass, source attempts the unlock
  and pro-rata disbursement of recorded NARA; execution, token value, and
  recovery are not guaranteed.

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
- Contains a generic non-NARA ERC-20 notification function, but the deployed
  Engine has no authorized notifier and this path is prohibited because of the
  documented accounting issue. Do not grant `REWARD_NOTIFIER_ROLE` or call it.
- Rejects NARA as an ERC-20 bribe token.
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
- Supports `Liquidity`, `Genesis`, and `GenesisSplit` only when their required
  reviewed dependencies are deployed and bound. The `Engine` and `Split` enum
  values exist in immutable code but permanently revert
  `EngineTokenRoutingDisabled`.
- The current deployment uses `Liquidity`. Genesis modes are unavailable until
  a separately verified distributor is deployed and bound.
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

### `NARABondVaultV4` (undeployed source)

- Holds v4 bond inventory.
- Uses timelocked market and cap controls.
- The cited operator plan internally selected
  `V4_BOND_AMOUNT_NARA=200000` and `V4_MIN_TREASURY_FLOAT_NARA=150000` as
  engineering inputs. This is not legal, regulatory, economic, or activation
  approval, and the source is not deployed or funded.

### `NARABondDepositoryV4NFT` (undeployed source)

- Canonical undeployed bond-source candidate; no offer or market is available.
- If separately deployed and opened, source can mint owner-transferable Genesis
  position NFTs for a recipient; no buyer, market, liquidity, value, or exit is
  guaranteed.
- Starts with inactive terms by default through `V4_BOND_ACTIVE=false`.
- Initial capacity starts at `0`.
- `executeTerms()` requires the depository to be paused.
- `addCapacity(uint256 amount)` requires the depository to be paused.
- Legacy `buyBond` and `buyBondFor` revert; the source-level quote functions are
  `buyBondWithQuote` and `buyBondForWithQuote`. Function names do not establish
  public availability.
- Source quotes are EIP-712 signed by `PRICE_SIGNER_ROLE` and include the
  caller/recipient, ETH input, payout bounds, deadline, nonce, and active terms
  timestamp.

### `NARAOpsVaultV4`

- One-shot operations vesting vault.
- Ops allocation defaults to `V4_OPS_AMOUNT_NARA=0`.
- Ops amount is capped by script at `10,000 NARA`.

---

## 6. Composability Components

> **Source only.** These components are not deployed, integrated, offered, or
> publicly available. The following describes conditional contract behavior.

### `NARAStakingPoolV4`

- ERC-20 `stNARA` wrapper over pooled v4 position NFTs.
- First deposit must be at least `100 NARA`.
- First deposit mints `DEAD_SHARES = 1e18` to `address(0xdead)`.
- `deposit(uint256 naraAmount, uint256 minShares)` mints stNARA.
- `lockLiquid(uint256 grossAmount, uint256 minWeight)` lets `LOCKER_ROLE` lock idle liquid NARA into max-duration NFT positions.
- `harvest()` and `batchHarvest(uint256 start, uint256 end)` harvest underlying positions.
- Claimed NARA amounts are retained in pool accounting; this does not guarantee
  token value, exchange-rate growth, or return.
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
- `claimPrincipal(address to)` attempts to disburse the recorded NARA amount pro
  rata when contract conditions pass; execution, token value, and recovery are
  not guaranteed.
- Source assigns residual accounting dust to the final eligible claimant.
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

- The operator plan's internally selected engineering input is
  `V4_BOND_AMOUNT_NARA=200000`; this is not legal/regulatory or activation
  approval.
- The script rejects values above `290,000 NARA`.
- Bond terms start inactive by default.
- Bond capacity starts at `0`.
- Opening bonds is a separate operator action after verification.

### Treasury Float

- The operator plan's internally selected minimum-float input is
  `V4_MIN_TREASURY_FLOAT_NARA=150000`; this is not legal/regulatory or
  activation approval.
- It preserves the locked `70,000 NARA` LP allocation, `40,000 NARA` external
  team vesting allocation, and `40,000 NARA` treasury allocation.
- The controlled initial pool seed was `60,000 NARA + 300 USDC`. That is
  historical deployment evidence, not a price target, valuation, expected
  return, liquidity promise, or exit. A historical plan reserved a remaining
  `10,000 NARA`; its current custody and balance require a fresh verified read.

### Commitment-Weighted Accounting

- Active reward share is based on active weight.
- Weight depends on amount and duration.
- The deployed supported rails are NARA emissions and ETH. The generic ERC-20
  notifier is prohibited.

### Liquidity Growth

- NARA/USDC pool fees are captured by `NARALiquidityGrowthHook`.
- Fees accrue in `NARALiquidityGrowthVault`.
- Vault mode may route value to Liquidity or Genesis paths. The Engine and
  Split ERC-20 routes permanently revert for this deployment.

---

## 8. Product Strategy

### Near-Term

- Merge the receipt-pinned activation evidence through protected CI.
- Monitor the separately authorized epoch and liquidity workflows; change no
  keeper, schedule, bounds, or deployment binding without a new review.
- Complete the Engine lock, activation, claim, and unlock lifecycle smoke.
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
