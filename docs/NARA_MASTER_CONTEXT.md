# NARA Protocol - Master Context Document

> Single-file reference for AI context loading.
> Covers: v3 protocol design, all formulas, historical state, operational infrastructure, degen board.
> Last updated: 2026-05-27.
> **Status: v3 archive reference. All v3 contracts are RETIRED as of 2026-05-27.**
> v4 mechanics differ significantly from v3 (JIT epoch advance, native NFT positions, no separate reward reserve, EIP-712 bond quotes, NARA/USDC Uniswap v4 pool).
> For current v4 work, use `CURRENT_STATE.md`, `PRD.md`, `ROADMAP.md`, and the `V4_*` docs first.
> Do NOT apply the v3 formulas or contract patterns in this document to v4 without verification.

---

## 1. What NARA Is

NARA is a **fixed-supply, time-preference yield protocol** on Base.

Core thesis:
- 1,000,000 NARA total supply. No mint. No burn by the token contract.
- 700,000 NARA sealed in a reward reserve. Admin cannot sweep it. Only the engine can pull it.
- 250,000 NARA sealed in a bond inventory vault.
- Users lock NARA for a chosen duration and earn proportional NARA + ETH rewards each 15-minute epoch.
- Longer locks earn structurally higher weight. Weight determines reward share.
- ETH from any source (bonds, games, fees, future products) routes to active lockers.
- The lockboard is a launch surface. The protocol is the durable layer under it.

---

## 2. Retired v3 Contracts (Base Mainnet, Chain ID 8453)

> **All retired as of 2026-05-27. Do not call, integrate, or reference these as live.**
> See `archive/legacy-v3/README.md` for the full retired-address table.

| Contract | Address |
|---|---|
| NARATokenV3 | `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` |
| NARARewardReserve | `0xC425F45f3e108cA4E49f86E01C6d256e6c572876` |
| NARAEngineV2 | `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F` |
| NARABondVault | `0xcCe364b9cF815D47B0338aAd960367CdE8E3525D` |
| NARABondDepository | `0xe5f3D18d81661F63F9Fa5B53401eee08d383Ca20` |
| Uniswap V3 NARA/WETH 0.3% | `0x71528CC56F44950aA74C3D656D2bD3502BAD2e91` |

| Role | Address |
|---|---|
| Engine treasury parameter | `0x39139CA6cB1b2330a612D28691a0E66E0af69a40` |
| Token treasury wallet | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` |
| Owner signer wallet | `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` |

---

## 3. Historical v3 State Snapshot (2026-03-27T08:31 UTC — v3 is now retired)

| Field | Value |
|---|---|
| currentEpoch | 964 |
| processedEpoch | 964 (backlog: 0) |
| totalLocked | 30,100 NARA |
| activeTotalWeight | 90,300 |
| rewardReserveAvailable | 699,998.443 NARA |
| rewardReserveTotalReleased | 1.557 NARA |
| vaultTokenBalance | 250,000 NARA |
| liquid float (circ) | 19,900 NARA |
| pendingEthForNextEpoch | 0 ETH |
| lockFeeBps | 200 (2%) |
| claimFeeBps | 500 (5%) |
| lockFeeWei | 0.0001 ETH |
| unlockFeeWei | 0.001 ETH |
| activationDelayEpochs | 8 |
| maxLockEpochs | 35,040 |
| epochLength | 900 seconds (15 min) |
| bond market open | NO — capacity = 0 |

**Team positions:**

| Wallet | Amount | Weight | Activation | Unlock |
|---|---|---|---|---|
| Treasury wallet | 20,000 NARA | 60,000 | Epoch 343 | Epoch 35,375 |
| Owner signer wallet | 10,000 NARA | 30,000 | Epoch 344 | Epoch 35,376 |

Both at 3× multiplier = max lock duration (35,040 epochs ≈ 1 year).

**Note:** total locked is 30,100 NARA — an additional 100 NARA position (300 weight at 3×) was created by a third party after the March 22 baseline. Liquid float dropped from ~20,000 to ~19,900 accordingly.

---

## 4. Token Supply Accounting

**Circulating supply** as computed by the engine:

```
circ = totalSupply (1,000,000 NARA)
       − balanceOf(NARAEngineV2)        // locked principal + pending rewards
       − balanceOf(NARARewardReserve)   // 700K sealed reserve
       − balanceOf(NARABondVault)       // 250K sealed inventory
       − bondVault.excludedMarketBalance()  // NARA in active bond markets
```

Effective liquid float at baseline ≈ **20,000 NARA**. This is the denominator
that makes the emission model sensitive to early participation.

---

## 5. Epoch System (v3 — see CURRENT_STATE.md for v4 differences)

> **v3 behavior described here.** v4 NARAEngine uses JIT auto-advance inside user calls (up to `MAX_JIT_ADVANCE = 8` per call) — no external keeper required. The v4 epoch formula and advance mechanism differ from v3.

```
currentEpoch = (block.timestamp − genesisTimestamp) / epochLength
```

- `epochLength` = 900 seconds, immutable (v3; v4 `EPOCH_LENGTH` is set in constructor — verify with `engine.EPOCH_LENGTH()`)
- Epoch advance is **explicit** in v3 — a keeper must call `advanceEpoch()` or `advanceEpochs(n)`
- `epochStartTimestamp(e)` = `genesisTimestamp + e × 900`
- If `currentEpoch() > epochState.epoch`, the engine has a backlog
- Most writes (`lock`, `unlock`, `claimRewards`) require `epochState.epoch == currentEpoch()`

---

## 6. Lock Mechanics

### Lock flow

```
feeAmount = amount × lockFeeBps / 10,000      // 2% → treasury
netAmount = amount − feeAmount

activationEpoch = currentEpoch + activationDelayEpochs + 1   // +8 = 2-hour delay
unlockEpoch     = currentEpoch + durationEpochs + 1
```

Flat ETH fee `lockFeeWei = 0.0001 ETH` goes to `accumulatedTreasuryEthFees`.

### Weight formula (NARAEngineModelLib.computeWeight)

```
r  = durationEpochs / maxLockEpochs              (WAD-scaled, ∈ [0,1])
r² = r × r / WAD
m  = 1 + durationLinearWad × r / WAD
       + durationQuadraticWad × r² / WAD
weight = netAmount × m / WAD
```

| Duration | r | Multiplier (current params) |
|---|---|---|
| minimum | ≈ 0 | ≈ 1× |
| 8,760 epochs (90 days) | 0.25 | 1.31× |
| 17,520 epochs (180 days) | 0.50 | 1.75× |
| 26,280 epochs (270 days) | 0.75 | 2.31× |
| 35,040 epochs (1 year) | 1.00 | 3× |

Constraint enforced at config validation:
`1 + durationLinearWad + durationQuadraticWad ≤ 10e18` (max 10× multiplier absolute cap).

Up to 64 positions per wallet. Zeroed slots are reused.

### Unlock

- Requires `epochState.epoch >= unlockEpoch`
- Flat ETH fee `unlockFeeWei = 0.001 ETH`
- Principal returned in full — no exit penalty

---

## 7. Adaptive Emission Model

Source: `NARAEngineModelLib.computeNextEpochSnapshot`. All formulas operate per epoch. WAD = 1e18.

### 7.1 Warmup Factor (approaches 1.0 from 0)
```
warmup[n+1] = warmup[n] + warmupRateWad × (1 − warmup[n]) / WAD
```
Scales down early NARA emissions. Asymptotically converges to 1.

### 7.2 Bootstrap Weight (phantom dilution, decays to 0)
```
bootstrap[n+1] = bootstrap[n] × bootstrapDecayWad / WAD
```
Phantom weight that dilutes locker reward share early on. As it decays, lockers capture the full distribution.

### 7.3 Weighted Lock Share (WLS)
```
wls = activeWeight / (circulatingSupply + activeWeight + bootstrapWeight)
```
Primary signal: what fraction of effective supply is actively locked. ∈ [0,1].

### 7.4 Base Emission (geometric growth, bounded)
```
baseEm[n+1] = baseEm[n] × growthFactorWad / WAD
baseEm      = clamp(baseEm, minBaseEmission, maxBaseEmission)
```

### 7.5 Emission Factor (incentive vs penalty)
```
incentive     = 1 + aWad × wls / WAD
penalty       = bWad × stress[n] / WAD
emissionFactor = max(incentive − penalty, 0)
emission       = clamp(baseEm × emissionFactor / WAD, 0, maxBaseEmission)
```
More locking → higher incentive → higher emission. High stress → lower emission.

### 7.6 Beta and Horizon (adaptive supply ceiling)
```
beta    = beta0Wad + mWad × stress[n] / WAD
horizon = eMax / beta
```
Horizon contracts under stress. `eMax` is the absolute upper bound on horizon.

### 7.7 Retention (emission gate based on supply vs ceiling)
```
retention = 0                        if circ ≥ horizon
retention = 1 − circ / horizon       if circ < horizon
```

### 7.8 Admitted Supply and NARA Distribution
```
admitted   = emission × retention / WAD

targetNara = admitted × dripSplitWad / WAD × warmup / WAD

// Bootstrap dilution: phantom weight claims a share
distNara   = targetNara × activeWeight / (activeWeight + bootstrapWeight)
             (= 0 if activeWeight == 0)
```

`distNara` is capped at `emissionReserve + rewardReserveAvailable`.
Shortfall is pulled from NARARewardReserve automatically.

In V2: `treasuryAmount` is forced to 0. The field exists for legacy ABI compatibility only.

### 7.9 ETH Distribution
```
distEth = pendingEthForNextEpoch    (if activeWeight > 0)
        = 0                          (if activeWeight == 0)
```
All queued ETH distributes fully each epoch. No smoothing.
Safety: if `activeTotalWeight == 0` for ≥ 192 consecutive epochs (≈ 48 hours), queued ETH sweeps to treasury.

### 7.10 Stress (feedback signal)
```
e2h    = emission / horizon
stress = cWad × (1 − wls) / WAD + dWad × e2h / WAD
stress = min(stress, 1.0)
```
Stress rises when locking is low or supply grows fast. It feeds back into beta (contracts horizon) and the emission penalty.

### 7.11 Heartbeat (diagnostic only)
```
heartbeat = horizon / emission    // epochs until horizon at current rate
```
Emitted in `EpochAdvanced` event. Not used in any computation.

---

## 8. Reward Index Accounting

RAY = 1e27. Precision is maintained throughout; no floating point.

### Global index update (per epoch advance)
```
naraAccRay  = distributedNara × RAY / activeTotalWeight
naraIndexRay += naraAccRay                    // cumulative global index

ethAccRay   = distributedEth × RAY / activeTotalWeight
ethIndexRay += ethAccRay

naraIndexAtEpoch[e] = naraIndexRay   // checkpoint per epoch
ethIndexAtEpoch[e]  = ethIndexRay
```

### Position accrual (earned from activationEpoch to min(currentEpoch−1, unlockEpoch−1))
```
naraDebt (lazy init) = weight × naraIndexAtEpoch[activationEpoch − 1] / RAY
naraGross            = weight × naraIndexAtEpoch[endEpoch] / RAY
naraOwed             = max(naraGross − naraDebt, 0)
```
Same for ETH using `ethIndexAtEpoch` and `ethPositionDebtRay[account][positionId]`.

Debt indices are initialised as `type(uint256).max` (sentinel) at lock time.
On first accrual, the sentinel is replaced with the correct baseline.

### Claim fee
```
ethFee = ethGross × claimFeeBps / 10,000     // 5%
ethNet = ethGross − ethFee
```
No fee on NARA rewards.

---

## 9. Bond System (NARABondDepository)

**Status: deployed on Base, verified, not open.**

The live depository no longer creates vested bond notes. It now enforces a mandatory locked-bond path through the live NFT wrapper.

### Purchase Flow

```
lockFeeEth = engine.lockFeeWei
bondEthIn  = ethIn - lockFeeEth
```

`bondEthIn` is the ETH amount used for bond pricing and reward/treasury splitting.

### TWAP Price
```
(tick, harmonicLiquidity) = consultTwap(oraclePool, twapWindow)
require(harmonicLiquidity ? minOracleLiquidity)
twapPriceWad = NARA per 1 ETH (WAD-scaled)
```

### Effective Discount
```
raw         = baseDiscountBps + inventoryBoost
discountBps = clamp(raw - demandPenalty, minDiscountBps, maxDiscountBps)
if campaign active: discountBps = min(discountBps + campaignBoost, 1200)
```

### Locked Bond Quote
```
rawPayout    = bondEthIn ? twapPriceWad ? (10,000 + discountBps) / 10,000
payout       = normalizedLockedPayout(rawPayout)
grossRequired = grossUpForLockFee(payout)
```

`grossRequired` is larger than `payout` when the engine lock fee in NARA is active, so the final engine position still lands at the intended locked principal.

### Delivery Path
```
vault.pullToMarket(grossRequired)
lockNft.mintAndLock(grossRequired, lockDurationEpochs, 0)
transfer lock NFT to buyer
```

The wrapper creates a clone account, locks into the live engine, and mints an NFT that controls that position. The buyer ends up owning a real engine lock position immediately. Operational note: the bond depository requires `lockNft.mintFeeWei() == 0` and forwards only the engine lock fee on bond purchases. Wrapper-side rental and extend fees, when nonzero, are separate auto-forwarded ETH flows into `notifyEthRewards()` from `NaraLockNFT`.

### ETH Split on Purchase
```
rewardEth   = bondEthIn * rewardSplitWad / WAD   -> engine.notifyEthRewards() -> lockers
treasuryEth = bondEthIn - rewardEth              -> treasury
```

### Operational Consequence

- Bond buyers become engine participants immediately.
- Bond buyers earn NARA drip and ETH rewards under normal engine weight rules.
- There is no `claimBond` vesting path on the live depository.
- Bonds remain closed until vault market wiring, release cap, and bond capacity are opened.

## 10. BurnRunArena (ETH routing game)

Competitive NARA-burning game. Entry fees and prize slices flow to lockers via `notifyEthRewards()`.

### Entry Fee Split
```
rewardCut   = fee × rewardShareOfEntryWad / WAD  → engine (lockers)
treasuryCut = fee × treasuryShareOfEntryWad / WAD → treasury
prizeCut    = fee − rewardCut − treasuryCut       → prize pool
```

### Forward Movement (burning NARA to advance position)
```
base     = forwardCoefficientWad × sqrt(naraToBurn × WAD) / WAD   // sub-linear

// Drag: front-runners slow down (quadratic)
posRatio = min(pos / trackLength, 1.0)
drag     = max(1.0 − dragWeightWad × posRatio² / WAD, dragFloorWad)

// Catchup: gap to leader gives bonus
catchup  = 1.0 + min(catchupWeightWad × (leaderPos − myPos) / trackLength, catchupCap)

// Momentum: time since last move
momentum = 1.0 + min(elapsed / momentumPeriod, cap)   // cap = 1.5× in overdrive

// Heat penalty: burst spamming penalised
heat     = 1 / (1 + heatStepWad × heatStreak / WAD)

// Overdrive: 2× multiplier for 30s every 180s
distanceMoved = base × drag × catchup × momentum × heat × overdriveMultiplier
```

### Sabotage (burning NARA to push target back)
```
base        = pushbackCoefficientWad × sqrt(naraToBurn × WAD) / WAD
frontFactor = frontBaseWad + frontWeightWad × (victimPos / trackLength)
defense     = 1 / (1 + recentAttacks)           // recent attacks reduce damage
pushed      = base × frontFactor × defense × heat × overdriveMultiplier (1.8×)
pushed      = min(pushed, 35% of victim's position)   // hard cap
```

### Epoch Prize Slice
```
slice      = prizePool × prizeSlicePerEpochWad / WAD
burnAmount = slice × burnShareOfSliceWad / WAD   → 0xdEaD (destroyed)
winner     = slice × winnerShareOfSliceWad / WAD → epoch leader
top5       = slice × topFiveShareOfSliceWad / WAD → split among top 5
```

### Burn Ranks (identity/reputation, no direct reward mechanic)
1K / 10K / 100K / 1M / 10M lifetime NARA burned → Rank 1–5.

---

## 11. ETH Flow Summary

| Source | ETH destination |
|---|---|
| Bond purchase | `rewardSplitWad` (30%) -> `notifyEthRewards()` -> engine lockers; rest -> treasury |
| Arena entry fee | `rewardShareOfEntryWad` -> `notifyEthRewards()` -> engine lockers; treasury cut; rest -> prize pool |
| Arena epoch burn share | → 0xdEaD (destroyed) |
| Arena prizes | → top runners (claimable) |
| Lock ETH fee (0.0001 ETH) | → treasury withdrawal |
| Unlock ETH fee (0.001 ETH) | → treasury withdrawal |
| Claim ETH fee (5%) | → treasury withdrawal |
| NFT wrapper mint/rental/extend fee | nonzero configured fees -> `notifyEthRewards()` -> queued for next epoch distribution |
| Any address calling `notifyEthRewards()` | -> queued for next epoch distribution |

---

## 12. NARARewardReserve

```
availableRewards = min(balance, rewardAllocation − totalReleased)
```

- `rewardAllocation = 700,000e18` — immutable, set at deploy
- Only the engine address (set once, immutable) can call `releaseToEngine()`
- Admin **cannot** sweep NARA — `sweepForeignToken` reverts on NARA
- Engine calls it automatically during epoch advance when local reserve is insufficient

---

## 13. Operational Infrastructure

### Epoch Keeper (cron/)

**Platform:** Railway cron job
**Schedule:** `*/15 * * * *` (every 15 minutes)
**Script:** `cron/src/advanceNaraEpochCron.mjs`
**Restart policy:** NEVER (run-and-exit model)
**Config file:** `cron/railway.json`

What it does each run:
1. Reads `currentEpoch` and `epochState.epoch` (backlog = difference)
2. Logs claimable rewards for treasury and owner wallets
3. If backlog > 0: `staticCall` pre-flight to check feasibility
4. Sends one `advanceEpochs(steps)` tx where `steps = min(backlog, maxAdvanceSteps)`
5. Logs post-advance state

Required env vars:
- `BASE_RPC_URL`
- `PRIVATE_KEY` (keeper wallet with Base ETH for gas)

Optional env vars (have defaults):
- `ENGINE_V2_ADDRESS` default: `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F`
- `TREASURY_WALLET` default: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`
- `OWNER_WALLET` default: `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`
- `KEEPER_MAX_ADVANCE_STEPS` default: `20`

Recovery: if Railway misses runs, the script catches up up to `maxAdvanceSteps` epochs in one tx.

---

### NARA Degen Board (apps/nara-lockboard/)

**What it is:** 100-slot founding grid (10×10). Each slot is claimed by one wallet,
permanently, by locking NARA at max duration through the engine.

**Live route:** `https://www.naraprotocol.io/mine`
**GitHub:** `https://github.com/NARAProtocol/nara-lockboard.git`
**Platform:** Cloudflare Pages + Workers + D1
**Pages project:** `nara-lockboard`
**D1 database:** `nara-lockboard` (ID: `f48dd6c7-79aa-4a0c-b4e9-830744afa7b2`)
**Wrangler config:** `apps/nara-lockboard/wrangler.toml`

#### Grid Structure

| Tier | Key | Slots | Min NARA to lock |
|---|---|---|---|
| t50 | t50 | 25 | 50 NARA |
| t100 | t100 | 25 | 100 NARA |
| t250 | t250 | 20 | 250 NARA |
| t500 | t500 | 15 | 500 NARA |
| t1000 | t1000 | 15 | 1,000 NARA |
| **Total** | | **100** | |

**Total NARA if all slots filled:** 25×50 + 25×100 + 20×250 + 15×500 + 15×1000 = **31,250 NARA**

This demand (31,250 NARA) against a liquid float of ~20,000 NARA creates structural buy pressure.

#### Slot Layout

`BOARD_SEED = 0x4e415241` ("NARA" in ASCII). Board manifest is computed via a seeded
Fisher-Yates shuffle. All 100 slot positions are deterministic and neutral — not
assigned by the team.

#### Claim Requirements

A wallet can claim a slot **only if**:
1. It locked NARA through NARAEngineV2 (verified via tx receipt on-chain)
2. The lock used `durationEpochs === maxLockEpochs` (35,040 — max duration, no exceptions)
3. `netAmountWei >= tier.minAmount` (after 2% lock fee)
4. The slot is unclaimed
5. The wallet hasn't claimed any other slot
6. The wallet is not an excluded team wallet

#### 10-Step On-Chain Verification (claim-slot.ts)

1. Fetch tx receipt from Base RPC
2. Verify `tx.from === claimingWallet`
3. Verify `tx.to === NARAEngineV2 address`
4. Decode calldata — must be `lock(amount, durationEpochs, minWeight)`
5. Verify `durationEpochs === 35,040` (maxLockEpochs)
6. Parse `Locked` event from receipt → get actual `netAmountWei` and `weight`
7. Verify `netAmountWei >= tier.minAmount`
8. Verify slot is available (D1 query)
9. Verify wallet hasn't claimed another slot (D1 query)
10. Write claim record to D1 (UNIQUE constraint + retry on race)

#### Claim Record (SlotClaimRecord)

Each claimed slot stores:
- `slotNum`, `wallet`, `txHash`, `positionId`, `tierKey`
- `netAmountWei`, `weight`, `durationEpochs`
- Profile: `alias`, `projectName`, `projectUrl`, `twitterHandle`, `farcasterHandle`, `avatarUrl`

#### Exclusions

Excluded wallets cannot claim:
- `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` (treasury)
- `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` (owner)
- Any addresses in `EXCLUDED_WALLETS` env var

#### Cloudflare Deploy Commands

```bash
npm run cf:db:apply       # apply D1 migrations
npm run cf:db:verify      # verify schema
npm run deploy:cf:prod    # deploy to Pages production
```

Requires `CLOUDFLARE_API_TOKEN` in shell (may need to load from `.env` manually — Wrangler doesn't auto-load it).

---

## 14. EngineConfig Parameter Reference

| Parameter | Role |
|---|---|
| `eMax` | Absolute supply ceiling for horizon |
| `beta0Wad` | Base beta at zero stress |
| `mWad` | Stress → beta slope |
| `aWad` | WLS incentive coefficient |
| `bWad` | Stress penalty coefficient |
| `cWad` | Low-WLS → stress coefficient |
| `dWad` | High-emission → stress coefficient |
| `dripSplitWad` | Fraction of admitted supply earmarked for lockers |
| `durationLinearWad` | Linear term in weight multiplier |
| `durationQuadraticWad` | Quadratic term in weight multiplier |
| `growthFactorWad` | Per-epoch base emission growth (∈ [1e18, 2e18]) |
| `minBaseEmission` / `maxBaseEmission` | Emission bounds |
| `warmupRateWad` | Warmup convergence rate (≤ 1e18) |
| `bootstrapInitialWeight` | Phantom weight at genesis |
| `bootstrapDecayWad` | Per-epoch bootstrap decay (≤ 1e18) |
| `activationDelayEpochs` | Epochs from lock to reward eligibility (live: 8) |
| `maxLockEpochs` | Max allowed lock duration (live: 35,040) |

Config changes: propose → wait `configChangeDelay` → execute (stages for epoch N+1) → activates on next `_advanceOneEpoch`.

---

## 15. Security Properties

- `NARARewardReserve.rewardAllocation` — immutable, set at deploy
- `NARARewardReserve.engine` — set once, cannot change
- Admin cannot sweep NARA from reserve or engine
- All state-mutating functions protected by `ReentrancyGuard`
- Engine config, bond terms, bond treasury all have timelocks
- Bond terms changes require contract to be paused before execution
- `trackedEmissionReserve` accounting: direct NARA transfers to engine cannot become distributable rewards — only reserve-released NARA increments the tracked pool
- Bond depository: if `notifyEthRewards` reverts, ETH accumulates in `pendingRewardEth`, flushed via `flushRewardEth()` — no ETH stuck
- D1 lockboard: UNIQUE constraint on (wallet, slot) + Cloudflare serialized writes prevent race conditions

---

## 16. v3 Deployment Status (Retired as of 2026-05-27)

> All v3 contracts are retired. This table records historical status only.

| Component | Historical Status | Current Status |
|---|---|---|
| NARATokenV3 | Was live on Base | **Retired** |
| NARAEngineV2 | Was live on Base, accepting locks | **Retired** |
| NARARewardReserve | Was live, holding ~700K NARA | **Retired** |
| NARABondVault | Was live, holding 250K NARA | **Retired** |
| NARABondDepository | Deployed, verified, bonds closed | **Retired** |
| Uniswap V3 NARA/WETH | Was live, thin liquidity | **Retired** |
| Railway epoch keeper | Was running `*/15 * * * *` | Must be retargeted to v4 |
| Degen Board (lockboard) | Was live at naraprotocol.io/mine | Wired to v3 — needs v4 rebuild |
| BurnRunArenaV2 | Was deployed, not playable | **Retired**, no v4 equivalent yet |
| Lotto | Was live | **Retired**, no v4 equivalent yet |

---

## 17. Known Limitations

1. **Epoch advance is not automatic.** If the Railway cron fails, epochs backlog and ETH queued for lockers sits undelivered until the next advance.

2. **Weight is computed at lock time against the current config.** If config changes after a lock, the stored weight may not match a fresh `computeWeight` call. The `extend()` function handles this correctly (re-derives both old and new weights from current config).

3. **`treasuryAmount` in EpochSnapshot is always 0 in V2.** The field exists for legacy ABI compatibility. Do not use it for accounting.

4. **ETH distributes fully every epoch — no smoothing.** A large ETH inflow creates a spike for that epoch's lockers.

5. **TWAP manipulability at low liquidity.** `minOracleLiquidity` is a circuit-breaker, not a full defense. Bond opening requires adequate V3 depth.

6. **Warmup and bootstrap are one-way.** Warmup converges toward 1 and cannot decrease. Bootstrap decays toward 0 and cannot increase. Config changes cannot reset them.

7. **Max 64 lock positions per account.** Zeroed positions are reused.

8. **Degen Board lockboard has no on-chain registry.** Claims are stored in Cloudflare D1. The on-chain proof is the lock transaction. If D1 data were lost, claims would need to be re-derived from on-chain events.

---

## 18. Roadmap

> The v3 roadmap phases in this document are obsolete. The active v4 roadmap is in [ROADMAP.md](ROADMAP.md). The next milestone is a fresh v4 core deploy from `contracts/v4/`.

---

## 19. Working Rules for Any AI Reading This

1. **Check CURRENT_STATE.md before making claims about live numbers.** This doc has a snapshot date. Numbers change.

2. **The canonical ABI source for v4 is `nara-protocol-hardhat/contracts/v4/NARAEngine.sol`.** `NARAEngineV2.sol` is archived at `archive/legacy-v3/contracts/`. Do not use the v3 ABI for v4 integrations.

3. **The lockboard is in `apps/nara-lockboard/`.** It was pushed to `https://github.com/NARAProtocol/nara-lockboard.git`.

4. **The cron is in `cron/`.** It runs on Railway. The only env vars it needs are `BASE_RPC_URL` and `PRIVATE_KEY`.

5. **Bonds are not yet open.** v4 bond launch requires fresh deploy, preflight, liquidity seed, smoke test, and allocation verification first. See `V4_LAUNCH_CHECKLIST.md`.

6. **The protocol is not the board.** The board is a launch surface. If it doesn't work, the surface changes, not the protocol.

7. **Do not reintroduce FIELD branding.** FIELD was a legacy name. Everything is NARA now.

8. **`treasuryAmount` in the epoch snapshot is always 0 in V2.** This is intentional.

9. **`distNara` goes fully to lockers after bootstrap decays.** Early on, bootstrap phantom weight captures a portion. This is by design.

10. **The liquid float is ≈ 20,000 NARA, not 1,000,000.** The effective market is tiny. This is a feature of the protocol design, not an oversight.

---

## 20. Protocol Flywheel: Emission-as-Treasury and ETH Capture Without Market Selling

### The Core Insight

The protocol controls 30,000 of 30,100 total locked NARA (99.7% of weight at launch). This is not a temporary state — treasury and owner positions lock until epoch 35375+, which is decades at 15-minute epochs. Every epoch that runs, those positions earn NARA rewards proportional to their share of total weight.

The critical implication: **the protocol receives a dominant share of every NARA emission without any buying activity.** These earned tokens become deployable protocol capital — and none of the deployment paths require selling on the open market.

### Validated Against Contracts

**Emission source — NARARewardReserve:**
- 700,000 NARA sealed at deploy. Only the engine can pull via `releaseRewards()`.
- Admin cannot sweep NARA. The reserve is protocol-controlled, not admin-accessible.
- `availableRewards = min(balance, rewardAllocation - totalReleased)` — hard ceiling enforced on-chain.

**Weight dominance — NARAEngineV2:**
- Treasury: 20,000 NARA × 3× multiplier (max lock) = 60,000 weight
- Owner: 10,000 NARA × 3× multiplier = 30,000 weight
- Total protocol weight: 90,000 of 90,300 active weight = 99.7%
- Any public locker increases total weight → protocol share dilutes, but total emission can increase via WLS. New lockers are additive.

**WLS as the emission lever:**
- `WLS = activeTotalWeight / (activeTotalWeight + bootstrapWeight)`
- As public locking grows, bootstrap phantom weight shrinks relative to real weight → WLS rises → more NARA emitted per epoch
- Protocol controls this lever. More total locking = more total emission = more earned NARA for everyone including the protocol

**Bond vault ceiling — NARABondVault:**
- `initialBondAllocation = 250,000 NARA` — set at deployment, immutable
- `proposeReleaseCap(newCap)` reverts if `newCap > initialBondAllocation`
- **Hard constraint:** earned rewards recycled into the bond vault as fresh bond inventory still cannot push total releases above 250,000 NARA. The vault ceiling is fixed. You can refill it with earned tokens, but the total bond distribution is bounded.

### Deployment Paths for Earned NARA (No Market Selling Required)

**Path 1: Bonds → ETH capture**
Send earned NARA to the bond vault as additional inventory. Bonders deposit ETH, receive NARA at a discount. Protocol captures ETH without touching the open market. The reward slice of bond ETH is pushed into `notifyEthRewards()` for lockers, while the treasury slice is sent directly to treasury.
- Constraint: total bond releases bounded by `initialBondAllocation` (250K). Refilling with earned tokens works within that ceiling — it does not expand it.
- Effect: turns NARA emission → ETH inflows → ETH distributed to lockers → lockers re-lock longer → higher WLS → more emission. Full loop.

**Path 2: LP incentives → liquidity without free provision**
Earned NARA can be used to reward external LP providers on the NARA/WETH Uniswap V3 pool. This gives LPs a reason to take the position risk — they earn protocol NARA on top of trading fees. Protocol does not need to LP itself or ask anyone to "provide liquidity for free." Incentive budget comes from emission, not from treasury sales.

**Path 3: BurnRunArena prizes**
Arena entry fees split to engine treasury and prize pool. But the protocol can also top up prize pools with earned NARA to deepen engagement. Arena prizes create locking demand (winners lock to enter, losers re-lock to compete again). Locking demand raises WLS → more emission → more prize funding. Reflexive.

**Path 4: Future product grants and ecosystem**
Any future surface (composability layer, aggregators, integrations) can be funded with earned NARA rather than a treasury token sale. Protocol retains emission control and avoids sell pressure.

### The Flywheel Described

```
Protocol locks 30K NARA (max duration)
        ↓
Earns dominant share of NARA emission every epoch
        ↓
Earned NARA → bonds → ETH inflows to protocol
Earned NARA → LP incentives → deeper liquidity → better price for bonders
Earned NARA → arena prizes → locking demand grows
        ↓
More public locking → higher WLS → higher total emission per epoch
        ↓
Protocol earns more per epoch as the reserve deploys
        ↓
(Repeat — self-reinforcing without open-market selling)
```

Each loop iteration: price stability (no protocol sell pressure) + deeper liquidity (LP incentives) + growing ETH reserves (bonds) + growing engagement (arena). All funded by the sealed 700K reserve, released only through weight-based earning.

### What the Protocol Must NOT Do

- Sell earned NARA on the open market — this breaks price stability, hurts bonders, and reduces the LP incentive budget in real terms.
- Open bonds without price/liquidity conditions met — premature bonds at low price give away NARA cheaply and waste the 250K ceiling.
- Skip LP incentives — thin liquidity means bonders get worse TWAP pricing, reducing the bond discount's attractiveness.

### Validated by COMPOSABILITY_CASCADE_REPORT.md

The report explicitly lists "Protocol-owned lock strategies" as a meta-layer opportunity and validates the ETH routing reflexive loop. It describes the engine's `notifyEthRewards()` as an inbound hook for any ETH-generating surface to route rewards to all weight holders. The bond-to-lock pattern (bond ETH → engine ETH rewards → more locking) is documented there as a planned composability primitive.

### Key Numbers at Epoch 964 Snapshot

- Protocol weight share: 90,000 / 90,300 = 99.67%
- Earned at snapshot: treasury 0.887 NARA, owner 0.516 NARA (claimable so far)
- Reward reserve remaining: 699,998.44 NARA (99.997% still undeployed)
- Bond vault: 250,000 NARA at rest — full capacity available for first bond activation
- Liquid float: ~20,000 NARA — tiny market, bonds are the primary ETH capture mechanism, not market selling
