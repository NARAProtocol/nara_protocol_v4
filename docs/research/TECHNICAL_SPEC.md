# NARA Protocol — Technical Specification

> **Source of truth:** the deployed contracts at the addresses below.
> **Last verified baseline:** Base block 43,703,057 (2026-03-22).
> All formulas are taken directly from the Solidity source — no paraphrasing.
> **2026-04-29 status:** historical v3 technical spec. Do not use this as the current v4 redeploy source of truth.

---

## 0. Deployed Contracts

| Contract | Address | Chain |
|---|---|---|
| NARATokenV3 | `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` | Base |
| NARARewardReserve | `0xC425F45f3e108cA4E49f86E01C6d256e6c572876` | Base |
| NARAEngineV2 | `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F` | Base |
| NARABondVault | `0xcCe364b9cF815D47B0338aAd960367CdE8E3525D` | Base |
| NARABondDepository | `0xe5f3D18d81661F63F9Fa5B53401eee08d383Ca20` | Base |
| Uniswap V3 NARA/WETH 0.3% | `0x71528CC56F44950aA74C3D656D2bD3502BAD2e91` | Base |

---

## 1. Token Supply Accounting

**Fixed supply:** 1,000,000 NARA (ERC-20, 18 decimals, no mint, no burn by token contract).

**Supply allocations at genesis:**
- 700,000 NARA → NARARewardReserve (locking rewards, sealed)
- 250,000 NARA → NARABondVault (bond inventory, sealed)
- 50,000 NARA → team/treasury wallets

**Circulating supply** as used by the engine:

```
circ = totalSupply
       − balanceOf(NARAEngineV2)        // locked principal + pending NARA rewards
       − balanceOf(NARARewardReserve)   // sealed 700K reserve
       − balanceOf(NARABondVault)       // sealed 250K inventory
       − bondVault.excludedMarketBalance()  // NARA held in active bond markets
```

At baseline (block 43,703,057) effective liquid float ≈ **20,000 NARA**.
This is the denominator that makes the emission model sensitive to early activity.

---

## 2. Epoch System

```
currentEpoch = (block.timestamp − genesisTimestamp) / epochLength
```

- `epochLength` = 900 seconds (15 minutes), immutable
- `epochStartTimestamp(e)` = `genesisTimestamp + e × epochLength`
- `epochEndTimestamp(e)` = `genesisTimestamp + (e + 1) × epochLength`

**Epoch advance is explicit.** No automatic advancement. Any caller may invoke
`advanceEpoch()`, `advanceEpochs(maxSteps)`, or `advanceAndClaimRewards()`.
If the on-chain epoch counter (`epochState.epoch`) lags `currentEpoch()`, the
engine is in a "backlog" state. Most state-mutating calls (`lock`, `unlock`,
`claimRewards`) require the epoch to be current (`_requireEpochCurrent`).

**Config staging:**
Config changes follow a two-phase commit. After proposing and waiting for
`configChangeDelay`, `executeConfig()` stages the new config for epoch `N+1`.
The config activates atomically at the start of `_advanceOneEpoch()` when
`nextEpoch == stagedConfigEpoch`.

---

## 3. Lock Positions

### 3.1 Creating a position (`lock`)

```
feeAmount = amount × lockFeeBps / 10,000
netAmount = amount − feeAmount
```

Fee sent to `treasury`. Position stores `netAmount`.

```
activationEpoch = currentEpoch + activationDelayEpochs + 1
unlockEpoch     = currentEpoch + durationEpochs + 1
```

Live values: `lockFeeBps = 200` (2%), `activationDelayEpochs = 8` (2-hour delay),
`maxLockEpochs = 35,040` (≈ 1 year).

Position struct:
```solidity
struct LockPosition {
    uint128 amount;         // netAmount after fee
    uint128 weight;         // computed weight
    uint64  createdEpoch;
    uint64  activationEpoch;
    uint64  unlockEpoch;
    uint256 naraDebtRay;    // RAY-scaled global index snapshot at first accrual
}
```

Up to 64 positions per account. Zeroed slots are reused.

### 3.2 Weight Formula

Source: `NARAEngineModelLib.computeWeight`

```
r  = dur / maxLockEpochs                              (WAD-scaled)
r² = r × r / WAD
m  = 1 + durationLinearWad × r / WAD
       + durationQuadraticWad × r² / WAD
weight = amount × m / WAD
```

Where:
- `dur` = `durationEpochs` (the duration the user commits to, not net of activation delay)
- `r` ∈ [0, 1] — ratio of chosen duration to the maximum
- `durationLinearWad` — coefficient on the linear term
- `durationQuadraticWad` — coefficient on the quadratic term

**Hard constraint enforced at config validation:**
```
1 + durationLinearWad + durationQuadraticWad ≤ 10e18
```
Maximum possible multiplier is 10× (with both coefficients at the theoretical limit).

**Example at current parameters** (L = Q = 1e18, maxLockEpochs = 35,040):

| Duration | r | m | Multiplier |
|---|---|---|---|
| activationDelay+1 (min) | ≈ 0 | ≈ 1.0 | 1× |
| 8,760 epochs (90 days) | 0.25 | 1.3125 | 1.31× |
| 17,520 epochs (180 days) | 0.5 | 1.75 | 1.75× |
| 26,280 epochs (270 days) | 0.75 | 2.3125 | 2.31× |
| 35,040 epochs (1 year) | 1.0 | 3.0 | 3× |

### 3.3 Extending a position

Extension recomputes weight using the current config (not the config at lock time).
Both old and new weights are computed from current config so the comparison is
config-agnostic:

```
refOldWeight = computeWeight(config, amount, oldDurationEpochs)
newWeight    = computeWeight(config, amount, newDurationEpochs)
require(newWeight > refOldWeight)  // extension must strictly increase weight
```

If the stored weight differs from `refOldWeight` (due to a config change since
lock), the active weight delta is reconciled saturatingly.

### 3.4 Unlocking

Unlock is permissible only when `epochState.epoch >= unlockEpoch`.
Flat ETH fee (`unlockFeeWei = 0.001 ETH`) goes to `accumulatedTreasuryEthFees`.
Principal (`netAmount`) is returned in full — no exit penalty.

---

## 4. Adaptive Emission Model

Source: `NARAEngineModelLib.computeNextEpochSnapshot`

All fields tagged `[n]` refer to the previous snapshot; `[n+1]` is computed output.

### 4.1 Warmup Factor

```
warmup[n+1] = warmup[n] + warmupRateWad × (1 − warmup[n]) / WAD
```

Exponential approach to 1.0. Warmup starts at 0 at genesis and converges
asymptotically. The convergence rate is controlled by `warmupRateWad`.
With `warmupRateWad = 0.01e18`, warmup reaches ~63% after ~100 epochs
and ~95% after ~300 epochs.

**Effect:** scales down the NARA drip early in the protocol's life, preventing
the full emission weight from hitting before the system has established depth.

### 4.2 Bootstrap Weight

```
bootstrap[n+1] = bootstrap[n] × bootstrapDecayWad / WAD
```

Geometric decay. `bootstrapDecayWad < 1e18` ensures strict monotone decrease.
Bootstrap is phantom weight — it participates in the Weighted Lock Share
denominator and dilutes locker rewards toward 0 when active locker weight is low.
As it decays, lockers capture an increasing fraction of emissions.

**Effect:** early lockers are "protected" from capturing 100% of emissions
before the protocol has real participation. Decay rate determines how fast
this phantom weight dissolves.

### 4.3 Weighted Lock Share (WLS)

```
wls = activeWeight / (circulatingSupply + activeWeight + bootstrapWeight)
```

`wls` ∈ [0, 1]. Represents what fraction of the effective token supply is
actively locked. Used as the primary signal for both the emission incentive
and the stress calculation.

### 4.4 Base Emission Growth

```
baseEm[n+1] = baseEm[n] × growthFactorWad / WAD
baseEm      = clamp(baseEm, minBaseEmission, maxBaseEmission)
```

Geometric growth bounded by `[minBaseEmission, maxBaseEmission]`.
`growthFactorWad ∈ [1e18, 2e18]` — enforced by config validation.

### 4.5 Emission Factor

```
incentive     = 1 + aWad × wls / WAD
penalty       = bWad × stress[n] / WAD
emissionFactor = max(incentive − penalty, 0)
emission       = clamp(baseEm × emissionFactor / WAD, 0, maxBaseEmission)
```

- **Incentive path:** more locking (higher wls) → higher incentive → higher emission
- **Penalty path:** high stress → reduces emission
- Both are linear in their inputs; the interaction is multiplicative with `baseEm`

### 4.6 Beta and Horizon

```
beta    = beta0Wad + mWad × stress[n] / WAD
horizon = eMax / beta
```

`horizon` is the target circulating supply ceiling. It contracts under stress
(more stress → higher beta → lower horizon), tightening the emission gate.

`eMax` is the absolute cap — even at zero stress, `horizon ≤ eMax / beta0`.

### 4.7 Retention

```
retention = 0                          if circ ≥ horizon
retention = 1 − circ / horizon         if circ < horizon
```

Retention is the fraction of the horizon not yet consumed by circulating supply.
When `circ = 0`, `retention = 1.0`. When `circ = horizon`, `retention = 0`.
It gates how much emission is "admitted" to the system.

### 4.8 Admitted Supply and NARA Distribution

```
admitted   = emission × retention / WAD

targetNara = admitted × dripSplitWad / WAD × warmup / WAD

distNara   = targetNara × activeWeight / (activeWeight + bootstrapWeight)
             (only if activeWeight > 0, otherwise distNara = 0)
```

- `dripSplitWad` controls what fraction of `admitted` is earmarked for NARA
  distribution (vs. treasury). In V2 the treasury NARA split is removed and
  `treasuryAmount` is forced to 0 in `_advanceOneEpoch`.
- Bootstrap dilution: the `activeWeight / (activeWeight + bootstrapWeight)` ratio
  means bootstrap "claims" a phantom share. As bootstrap decays to zero, lockers
  receive the full `targetNara`.

**Reserve check:** `distNara` is capped at `totalRewardFunds = emissionReserve + rewardReserveAvailable()`.
If the engine's local balance is insufficient, the shortfall is pulled from
`NARARewardReserve.releaseToEngine()`.

### 4.9 ETH Distribution

```
distEth = pendingEthForNextEpoch    (if activeWeight > 0)
        = 0                          (if activeWeight == 0)
```

All queued ETH distributes in one epoch. ETH never drips — it is fully distributed
each epoch to whoever holds active weight at that moment.

**Zero-active-epoch safety sweep:**
If `activeTotalWeight == 0` for `maxZeroActiveEpochsBeforeEthSweep` consecutive
epochs (≈ 48 hours worth), queued ETH is swept to treasury to prevent permanent
lock-up.

### 4.10 Stress

```
e2h    = emission / horizon         (emission as fraction of horizon)
stress = cWad × (1 − wls) / WAD
       + dWad × e2h / WAD
stress = min(stress, 1.0)
```

Stress increases when:
1. WLS is low (low lock participation, first term)
2. Emission-to-horizon ratio is high (supply expanding fast, second term)

Stress feeds back into beta (§4.6) and the emission penalty (§4.5), creating
a self-correcting loop: high stress → higher beta → lower horizon → lower
retention → lower emission → lower e2h → lower future stress.

### 4.11 Heartbeat

```
heartbeat = horizon / emission    (epochs until horizon at current emission rate)
```

A diagnostic integer — how many epochs until circulating supply would reach
`horizon` if emission and horizon were both frozen. Not used in any computation;
emitted in `EpochAdvanced` for off-chain monitoring.

---

## 5. Reward Index Accounting

Source: `NARAEngineAccountingLib`

### 5.1 Global Index Update (per epoch advance)

```
naraAccRay  = distributedNara × RAY / activeTotalWeight
naraIndexRay += naraAccRay

ethAccRay   = distributedEth × RAY / activeTotalWeight
ethIndexRay += ethAccRay
```

`RAY = 1e27`. Integer precision is maintained throughout; no floating point.

Both indices are checkpointed per epoch:
```
naraIndexAtEpoch[e] = naraIndexRay   (after epoch e is advanced)
ethIndexAtEpoch[e]  = ethIndexRay
```

### 5.2 Position Reward Accrual

A position earns from `activationEpoch` to `min(currentEpoch−1, unlockEpoch−1)`.

```
naraDebt (initialised lazily) = weight × naraIndexAtEpoch[activationEpoch − 1] / RAY
naraGross                     = weight × naraIndexAtEpoch[endEpoch] / RAY
naraOwed                      = naraGross − naraDebt
```

ETH accrual follows the identical pattern using `ethIndexAtEpoch` and
`_ethPositionDebtRay[account][positionId]`.

**Lazy initialisation:** debt indices are set to `type(uint256).max` (sentinel)
at lock time and populated on first accrual, pulling the index from the epoch
before activation. This avoids a storage write on lock and correctly captures
the starting baseline.

### 5.3 Claim Fee

```
ethFee    = ethGross × claimFeeBps / 10,000
ethNet    = ethGross − ethFee
```

Live: `claimFeeBps = 500` (5%). No fee on NARA rewards.
Fee accumulates in `accumulatedTreasuryEthFees` and is withdrawn by `TREASURY_ROLE`.

---

## 6. NARABondDepository

Note: this section describes the live Base depository deployed at `0xe5f3D18d81661F63F9Fa5B53401eee08d383Ca20`.

### 6.1 Mandatory Locked Bond Model

The live depository no longer issues vested bond notes. Each bond purchase mints a `NaraLockNFT` that controls a real `NARAEngineV2` lock position.

### 6.2 TWAP Price Oracle

Uses `UniOracleLib` (Uniswap V3 oracle) over `twapWindow` seconds:

```
(tick, harmonicLiquidity) = consultTwap(oraclePool, twapWindow)
require(harmonicLiquidity >= minOracleLiquidity)

quoteInNaraUnits = getQuoteAtTick(tick, 1e18 WETH, weth, nara)
twapPriceWad     = quoteInNaraUnits * naraScale
```

### 6.3 Effective Discount

```
raw         = baseDiscountBps + inventoryBoost
discountBps = clamp(raw - demandPenalty, minDiscountBps, maxDiscountBps)
if campaign active: discountBps = min(discountBps + discountBoostBps, 1200)
```

### 6.4 Locked Bond Quote

```
lockFeeEth    = engine.lockFeeWei
bondEthIn     = ethIn - lockFeeEth
rawPayout     = bondEthIn * twapPriceWad * (10,000 + discountBps) / 10,000
payout        = normalizedLockedPayout(rawPayout)
grossRequired = grossUpForLockFee(payout)
```

Where:
- `lockFeeEth` is the flat ETH fee required by the engine lock path
- `payout` is the intended final locked principal
- `grossRequired` is the larger NARA amount pulled from the vault so the engine's NARA lock fee still leaves the buyer with `payout` locked

### 6.5 ETH Split on Bond Purchase

```
rewardEth   = bondEthIn * rewardSplitWad / WAD   -> engine.notifyEthRewards()
treasuryEth = bondEthIn - rewardEth              -> treasury
```

If either forward fails, the depository queues ETH in `pendingRewardEth` or `pendingTreasuryEth` for later flush.

### 6.6 Delivery Path

```
vault.pullToMarket(grossRequired)
lockNft.mintAndLock(grossRequired, lockDurationEpochs, 0)
IERC721(lockNft).safeTransferFrom(address(this), buyer, tokenId)
```

The depository reads the newly created clone position from the engine and records the actual locked amount and weight for accounting and events.

### 6.7 Additional Sale Controls

The live contract also provides:
- `previewBond(ethIn)` for frontend previews
- `buyBondFor(recipient, minOut)`
- `setSalesThrottle` for per-window ETH throttling
- `setCampaign` for finite boost/cap campaigns
- queueing and manual flush for failed reward and treasury ETH forwards

### 6.8 Inventory Flow

NARA is not held in the depository at rest:
- Inventory remains inside `NARABondVault` until a purchase happens
- On purchase the depository pulls `grossRequired` from the vault
- The wrapper consumes that NARA immediately to create the engine lock
- The buyer receives the lock NFT, not a claimable bond note

`NARABondVault.excludedMarketBalance()` is still included in the engine's circulating-supply exclusion logic.

## 7. NARARewardReserve

Custodian for the 700,000 NARA reward allocation.

```
availableRewards = min(balance, rewardAllocation − totalReleased)
```

- `rewardAllocation = 700,000e18` — immutable, set at deploy
- `totalReleased` — cumulative NARA already sent to engine
- Admin **cannot** sweep NARA. `sweepForeignToken` explicitly reverts on NARA
- Only the engine address (set once, immutable after `setEngine`) can call `releaseToEngine`

The engine calls `releaseToEngine(shortfall)` during `_advanceOneEpoch` when its
local `trackedEmissionReserve` is insufficient:

```
if (distNara > localRewardFunds):
    shortfall = distNara − localRewardFunds
    rewardReserve.releaseToEngine(shortfall)
    trackedEmissionReserve += shortfall
```

---

## 8. BurnRunArena

A competitive NARA-burning game that routes ETH entry fees and prize slices to
engine lockers via `notifyEthRewards()`.

### 8.1 Entry Fee Split

```
rewardCut  = entryFeeWei × rewardShareOfEntryWad / WAD  → notifyEthRewards()
treasuryCut = entryFeeWei × treasuryShareOfEntryWad / WAD → treasury
prizeCut   = entryFeeWei − rewardCut − treasuryCut       → prize pool
```

### 8.2 Forward Movement

```
sqrtBurn = sqrt(naraToBurn × WAD)
base     = forwardCoefficientWad × sqrtBurn / WAD
```

Sub-linear scaling — doubling NARA burned yields √2× distance, not 2×.

```
// Position drag (quadratic — front-runners slow down)
posRatio    = min(positionWad / trackLengthWad, 1.0)
posRatioSq  = posRatio²
dragPenalty = dragWeightWad × posRatioSq / WAD
drag        = max(1.0 − dragPenalty, dragFloorWad)

// Catchup bonus (proportional to gap to leader)
dist   = leaderPos − myPos
extra  = min(catchupWeightWad × dist / trackLengthWad, catchupCapWad)
catchup = 1.0 + extra

// Momentum bonus (time since last move)
elapsed  = now − lastActionTime
bonus    = min(elapsed / momentumPeriod, overdriveMomentumCap or 1.0)
momentum = 1.0 + bonus

// Heat penalty (rapid burst penalty)
heat = 1 / (1 + heatStepWad × heatStreak / WAD)

// Overdrive: 2× multiplier during active 30-second window (every 180s)
overdriveMultiplier = 2.0 if inOverdrive else 1.0

distanceMoved = base × drag × catchup × momentum × heat × overdriveMultiplier
```

### 8.3 Sabotage

```
sqrtBurn    = sqrt(naraToBurn × WAD)
base        = pushbackCoefficientWad × sqrtBurn / WAD

// Front factor (targets near finish line take more damage)
victimRatio = min(victimPos / trackLengthWad, 1.0)
frontFactor = frontBaseWad + frontWeightWad × victimRatio / WAD

// Defense (recent attacks reduce damage taken)
attacks = victim.recentAttacks (reset after attackDecaySeconds)
defense = 1 / (1 + attacks)

// Attacker heat penalty
heat = 1 / (1 + heatStepWad × attackerHeatStreak / WAD)

// Overdrive: 1.8× multiplier
overdriveMultiplier = 1.8 if inOverdrive else 1.0

pushed  = base × frontFactor × defense × heat × overdriveMultiplier
maxPush = 35% of victim's current position      // hard cap
pushed  = min(pushed, maxPush)
```

### 8.4 Epoch Prize Distribution

```
slice        = prizePool × prizeSlicePerEpochWad / WAD

burnAmount   = slice × burnShareOfSliceWad / WAD        → sent to 0xdEaD
winnerAmount = slice × winnerShareOfSliceWad / WAD       → epoch leader
topFivePool  = slice × topFiveShareOfSliceWad / WAD      → split among top 5
```

ETH burned to `0xdEaD` (the DEAD address) reduces prize pool supply permanently.

### 8.5 Entry Fee Rebalancing (per epoch)

```
occupancyBps = activeRunners × 10,000 / maxActiveRunners

if occupancyBps >= 9,000:  // ≥90% full
    currentEntryFeeWei = currentEntryFeeWei × (10,000 + entryGrowthBpsPerEpoch) / 10,000
else:
    currentEntryFeeWei = currentEntryFeeWei × 9,700 / 10,000   // −3% per epoch
```

Fee self-adjusts. Crowded arena → rising fee. Sparse arena → decaying fee.

### 8.6 Burn Ranks

| Rank | Lifetime NARA Burned |
|---|---|
| 1 | ≥ 1,000 |
| 2 | ≥ 10,000 |
| 3 | ≥ 100,000 |
| 4 | ≥ 1,000,000 |
| 5 | ≥ 10,000,000 |

Ranks are on-chain state, emitted as `RankThresholdCrossed` events. No reward
mechanic attached — pure identity/reputation layer.

### 8.7 Overdrive Windows

```
overdriveInterval = 180 seconds
overdriveDuration = 30 seconds

// Window start calculation:
elapsed          = now − overdriveStart
intervalsElapsed = elapsed / overdriveInterval
windowStart      = overdriveStart + intervalsElapsed × overdriveInterval
windowEnd        = windowStart + overdriveDuration

inOverdrive = now ∈ [windowStart, windowEnd)
```

Overdrive occurs for 30 of every 180 seconds (≈ 16.7% of time).
Forward multiplier 2×, pushback multiplier 1.8×, momentum cap 1.5×.

---

## 9. ETH Flow Summary

Every source of ETH that enters the protocol routes to lockers via
`notifyEthRewards()` or accumulates in the prize pool:

| Source | ETH Route |
|---|---|
| Bond purchases (`buyBond`) | `rewardSplitWad` fraction → engine lockers; remainder → treasury |
| Arena entry fees (`join`) | `rewardShareOfEntryWad` fraction → engine lockers; `treasuryShareOfEntryWad` → treasury; remainder → prize pool |
| Arena epoch prize burn | Sent to `0xdEaD` (destroyed) |
| Arena epoch prizes | Credited to top runners, claimable by them |
| Lock ETH fee (`lockFeeWei`) | Accumulated in engine → treasury withdrawal |
| Unlock ETH fee (`unlockFeeWei`) | Accumulated in engine → treasury withdrawal |
| Claim ETH fee (`claimFeeBps`) | Accumulated in engine → treasury withdrawal |
| Future product ETH | Any ETH sent to engine address or calling `notifyEthRewards()` |

---

## 10. Live State Snapshot (2026-03-22, Block 43,703,057)

| Parameter | Value |
|---|---|
| currentEpoch | 515 |
| processedEpoch | 514 (1 backlog) |
| epochLength | 900 seconds |
| totalLocked | 30,000 NARA |
| activeTotalWeight | 90,000 |
| lockFeeBps | 200 (2%) |
| claimFeeBps | 500 (5%) |
| lockFeeWei | 0.0001 ETH |
| unlockFeeWei | 0.001 ETH |
| activationDelayEpochs | 8 |
| maxLockEpochs | 35,040 |
| rewardReserveAvailable | 699,999.752 NARA |
| vaultTokenBalance | 250,000 NARA |
| liquid float (circ) | ≈ 20,000 NARA |
| bond status | deployed, not paused, active=true, capacity=0 (closed) |

**Team positions:**

| Wallet | Amount | Weight | Created | Activates |
|---|---|---|---|---|
| Treasury wallet | 20,000 NARA | 60,000 | Epoch 334 | Epoch 343 |
| Owner signer wallet | 10,000 NARA | 30,000 | Epoch 335 | Epoch 344 |

Both positions at 3× multiplier implying `dur = maxLockEpochs` (max lock duration).

---

## 11. Config Parameter Reference

### EngineConfig (NARAEngineTypes.sol)

| Field | Type | Role |
|---|---|---|
| `eMax` | uint256 | Absolute supply ceiling for horizon calculation |
| `beta0Wad` | uint256 | Base beta (horizon sensitivity at zero stress) |
| `mWad` | uint256 | Stress-to-beta slope |
| `aWad` | uint256 | WLS incentive coefficient |
| `bWad` | uint256 | Stress penalty coefficient |
| `cWad` | uint256 | WLS-to-stress coefficient (locks) |
| `dWad` | uint256 | Emission-to-stress coefficient |
| `dripSplitWad` | uint256 | Fraction of admitted supply earmarked for lockers |
| `durationLinearWad` | uint256 | Linear coefficient in weight multiplier |
| `durationQuadraticWad` | uint256 | Quadratic coefficient in weight multiplier |
| `growthFactorWad` | uint256 | Per-epoch geometric base emission growth |
| `minBaseEmission` | uint256 | Floor on base emission |
| `maxBaseEmission` | uint256 | Ceiling on emission (also clamps base emission) |
| `warmupRateWad` | uint256 | Exponential warmup convergence rate |
| `bootstrapInitialWeight` | uint256 | Phantom weight at genesis |
| `bootstrapDecayWad` | uint256 | Per-epoch geometric bootstrap decay |
| `activationDelayEpochs` | uint64 | Epochs from lock to reward eligibility |
| `maxLockEpochs` | uint64 | Maximum allowed lock duration |

**Validation constraints:**
```
eMax > 0, beta0Wad > 0
mWad, aWad, bWad, cWad, dWad ≤ 10e18
dripSplitWad ≤ 1e18
durationLinearWad, durationQuadraticWad ≤ 10e18
1 + durationLinearWad + durationQuadraticWad ≤ 10e18  // max multiplier cap
growthFactorWad ∈ [1e18, 2e18]
maxBaseEmission ≥ minBaseEmission
warmupRateWad ≤ 1e18
bootstrapDecayWad ≤ 1e18
maxLockEpochs ∈ [1, 175,200]   // 175,200 = 5 years at 15-min epochs
activationDelayEpochs ∈ [1, maxLockEpochs − 1]
```

### BondTerms (NARABondDepository.sol)

| Field | Type | Role |
|---|---|---|
| `oraclePool` | address | Uniswap V3 pool for TWAP |
| `twapWindow` | uint32 | TWAP observation window in seconds |
| `baseDiscountBps` | uint16 | Floor discount regardless of inventory/demand |
| `minDiscountBps` | uint16 | Absolute minimum effective discount |
| `maxDiscountBps` | uint16 | Absolute maximum effective discount (≤1200) |
| `inventoryBoostBps` | uint16 | Max additional discount at full inventory |
| `demandPenaltyBps` | uint16 | Max discount reduction at full demand |
| `minOracleLiquidity` | uint128 | Min TWAP harmonic liquidity (circuit-breaker) |
| `demandDecayWindow` | uint64 | Demand decay halflife in seconds |
| `demandScaleEth` | uint256 | ETH volume that produces full demand penalty |
| `rewardSplitWad` | uint256 | Fraction of bond ETH routed to engine |
| `minDepositWei` | uint256 | Minimum ETH per bond purchase |
| `maxPayoutNara` | uint256 | Maximum NARA per single bond |
| `remainingCapacityNara` | uint256 | Live remaining inventory (decremented on purchase) |
| `capacityReferenceNara` | uint256 | Reference capacity for inventory ratio (not decremented) |
| `lockDurationEpochs` | uint64 | Lock duration used when minting the bond buyer's engine position |
| `active` | bool | Bond sale gate |

---

## 12. Security Properties

### Immutability
- `NARARewardReserve.rewardAllocation` — set at deploy, immutable
- `NARARewardReserve.engine` — set once via `setEngine`, cannot change
- `NARARewardReserve.nara` — set once via `setNara`, cannot change
- `NARAEngineV2.nara`, `.rewardReserve`, `.bondVault`, `.genesisTimestamp`,
  `.epochLength`, `.configChangeDelay` — all immutable

### Admin Cannot Steal Rewards
- `sweepForeignToken` on `NARARewardReserve` reverts if `token == nara`
- `sweepForeignToken` on `NARAEngineV2` reverts if `token == nara`
- Admin cannot call `releaseToEngine` — only the engine can
- The engine has no function to sweep NARA reserves arbitrarily

### Timelocks
- Engine config changes: `configChangeDelay` seconds (proposal → staging → epoch activation)
- Bond terms changes: `adminDelay` seconds, requires contract to be paused, capacity checked against vault
- Bond treasury changes: `adminDelay` seconds
- BurnRunArena config: `adminDelay` seconds, requires pause

### Reentrancy
All state-mutating external functions are protected by OpenZeppelin's `ReentrancyGuard`.

### Race Conditions
- D1-backed lockboard: UNIQUE constraint on (wallet, slot) + Cloudflare D1 serialized writes
- Engine: position storage uses slot reuse (find free slot before push), no duplicate position IDs

### ETH Routing Safety
- Bond depository: if `notifyEthRewards` reverts, ETH accumulates in `pendingRewardEth`
  and is flushed via `flushRewardEth()`. No ETH is lost or stuck.
- Arena: entry fee reward cut reverts entire join if `rewardSink == address(0)`.

### Circulating Supply Integrity
- Direct NARA transfers to the engine do not become distributable rewards —
  only NARA released through `NARARewardReserve.releaseToEngine()` increments
  `trackedEmissionReserve`. This prevents reward inflation via accidental sends.

---

## 13. Known Limitations and Design Choices

1. **Epoch advance is not automatic.** If no one calls `advanceEpoch()`, epochs
   accumulate as backlog. ETH queued for lockers sits undelivered. The Railway
   cron job advances epochs every 15 minutes — without it, the system is live but
   idle.

2. **Position weight is computed at lock time against the current config.** If
   config changes after lock, stored weight may not match what `computeWeight`
   returns for that position's parameters. The `extend()` function handles this
   by recomputing both old and new weights from current config (N-03 fix).

3. **ETH distributes fully every epoch.** There is no per-epoch ETH cap or
   smoothing. A single large ETH inflow one epoch results in a spike for that
   epoch's lockers. This is by design — epoch timing and ETH routing create
   natural MEV for well-timed locks.

4. **TWAP manipulability at low liquidity.** The `minOracleLiquidity` parameter
   is a circuit-breaker, not a full defense. Thin liquidity on the V3 pool can
   still create multi-block TWAP windows where bond pricing is stale or skewed.
   Bond opening is intentionally gated behind adequate liquidity depth.

5. **Bootstrap and warmup are one-way.** Neither can be increased once set.
   `warmupFactorWad` strictly increases toward 1. `bootstrapWeight` strictly
   decreases toward 0. Config changes cannot reset them.

6. **`treasuryAmount` in EpochSnapshot is always 0 in V2.** The struct field
   exists for legacy ABI compatibility. Do not rely on it for accounting.

7. **Max 64 lock positions per account.** Zeroed positions are reused. Integrators
   building on top should handle position array iteration carefully.
