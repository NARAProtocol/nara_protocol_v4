# NARA v4 Lock APY & Emission Reference Guide

Last updated: 2026-08-19.

This document describes the mathematical mechanics governing yield, 15-minute epoch emissions, duration multipliers, bootstrap weight dilution, and the four key levers for increasing locked position APY in the **NARA v4 Allocation Engine** (`NARAEngine.sol` at `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC`).

---

## 1. Live Protocol Snapshot (Base Block #50190412)

| Metric | Live Value | Notes |
|---|---|---|
| **$NARA Market Price** | **`$0.041077 USD`** | Uniswap v4 NARA/USDC Pool |
| **Total NARA Locked** | `5,248.63 NARA` ($215.60 USD) | Positions `#8`, `#9`, `#10` |
| **Active Total Weight** | `20,994.53` | 1-Year Max Lock Multipliers (`4.00x`) |
| **Epoch Duration** | `900 seconds` (15 minutes) | 96 epochs per day |
| **Total Engine Emission** | `0.3113 NARA` per 15 min | ~`10,908 NARA` annualized |
| **Locker Allocation Share** | `85.00%` (`dripSplitWad`) | 15% reserved for Treasury/Reserve |
| **Virtual Bootstrap Weight** | `3,899,160.25` | Anti-hyperinflation launch shield |
| **Current Live Lock APR** | **`0.68%`** | Pre-decay baseline |

---

## 2. Lock Duration Multipliers

Longer lock commitments receive higher participation weight ($w$), scaling individual share of every 15-minute emission.

**Weight Formula (`NARAEngineModelLib.sol`):**
$$r = \frac{\text{durationEpochs}}{\text{maxLockEpochs}} \quad (\text{where } \text{maxLockEpochs} = 35,040 \approx 365\text{ days})$$
$$m = 1 + 0.5 \times r + 2.5 \times r^2$$
$$\text{Weight} = \text{Principal} \times m$$

| Commitment | Duration (Epochs) | Multiplier ($m$) | Weight per 1,000 NARA |
|---|---|---|---|
| **1 Day** | 96 epochs | `1.001x` | 1,001 |
| **30 Days** | 2,880 epochs | `1.058x` | 1,058 |
| **90 Days** | 8,760 epochs | `1.281x` | 1,281 |
| **180 Days** | 17,520 epochs | `1.875x` | 1,875 |
| **270 Days** | 26,280 epochs | `2.781x` | 2,781 |
| **365 Days (1 Year)** | 35,040 epochs | **`4.000x`** | **4,000** |

---

## 3. How Epoch Emissions & APR are Calculated

On each 15-minute epoch transition, the engine executes the adaptive emission formula:

$$\text{TargetLockerNara} = \text{AdmittedSupply} \times \text{dripSplitWad} \times \text{WarmupFactor}$$
$$\text{DistributedToLockers} = \text{TargetLockerNara} \times \frac{\text{ActiveTotalWeight}}{\text{ActiveTotalWeight} + \text{BootstrapWeight}}$$

### Why Early APR is Intentionally Conservative (~0.68%)
During early protocol bootstrap, the engine applies a **Virtual Bootstrap Weight** (initially $10\text{M}$, currently $3.899\text{M}$).
- Real Active Locker Weight: **`20,994.53`**
- Virtual Bootstrap Weight: **`3,899,160.25`**
- **Real Locker Share**: $\frac{20,994.53}{20,994.53 + 3,899,160.25} \approx \mathbf{0.535\%}$.
- The remaining $\approx 99.46\%$ of emission stays unissued in the `NARARewardReserve` ($650,000\text{ NARA}$ reserve), preventing early circulating supply dilution.

---

## 4. The 4 Levers to Increase Lock APR

### 🚀 Lever 1: Natural Bootstrap Decay (Time Progression) — *Up to ~260x Organic Yield Expansion*
* `bootstrapWeight` decays every 15-minute epoch by $0.09\%$ (`bootstrapDecayWad = 99.91%`).
* As virtual bootstrap weight approaches zero, real lockers capture **$100\%$ of designated emissions ($0.2646\text{ NARA/epoch}$)** instead of $0.535\%$.
* **Impact**: On the current pool of $5,248\text{ NARA}$, this naturally increases APR from **`0.68%` $\to$ `~176% APR`** over time without any governance intervention.

### 📈 Lever 2: Compound Base Emission Growth (`growthFactorWad`) — *Up to 16x Base Expansion*
* The engine's base emission rate compound-expands every epoch by **`1.000104x`**.
* Base emission automatically scales from $0.20\text{ NARA/epoch}$ ($7,008\text{ NARA/year}$) up to the max emission cap of **$5.00\text{ NARA/epoch}$ ($175,200\text{ NARA/year}$)** as protocol epochs advance.

### 💎 Lever 3: Real-Yield Secondary Fee Injections (`notifyEthRewards` / `notifyTokenRewards`)
* External revenue, DEX fees, and treasury distributions can be routed directly into the Engine via `notifyEthRewards()` or `notifyTokenRewards()`.
* **Zero Bootstrap Dilution**: Secondary fee rewards are distributed **100% directly** to active lockers based strictly on their relative weight share ($\frac{\text{PositionWeight}}{\text{ActiveTotalWeight}}$).
* Provides direct cash flow (ETH / USDC) on top of base $NARA emissions.

### ⚙️ Lever 4: Governance Parameter Acceleration (via Safe Multisig)
The Safe multisig (`0xd65c...D755`) with `PARAM_ROLE` can propose parameter optimizations:
1. **Accelerate Bootstrap Decay**: Lower `bootstrapDecayWad` from `99.91%` to burn phantom weight faster.
2. **Increase `minBaseEmission`**: Raise the baseline emission floor.
3. **Increase `dripSplitWad`**: Increase locker share from `85%` towards `100%`.
*(All parameter changes are subject to `CONFIG_CHANGE_DELAY` timelocks).*

---

## 5. Recalculation Reference Formula

To calculate live earnings for any position:

```text
PositionShare    = PositionWeight / ActiveTotalWeight
NARA_per_15min   = DistributedToLockers × PositionShare
NARA_per_day     = NARA_per_15min × 96
NARA_per_year    = NARA_per_day × 365
Annual_APR (%)   = (NARA_per_year / LockedPrincipal) × 100
USD_Earnings/day = NARA_per_day × NARA_USD_SpotPrice
```

---

## 6. The 64-Slot Rolling Compounding Ladder Strategy

In `NARAEngine.sol`, `MAX_LOCK_POSITIONS_PER_ACCOUNT = 64` is a **concurrent active slots limit**, NOT a lifetime cap.

### Slot Recycling Invariant
* **Locking:** `_ownerPositionCount` increments when a position is created.
* **Unlocking:** `_ownerPositionCount` decrements when an expired position is unlocked via `unlock(positionId)` (`NARAEngine.sol` line 630).
* **Perpetual Flywheel:** Unlocking frees and recycles that exact position slot. Users can lock, compound, and relock continuously for 15+ years without running out of slots.

### Compounding Cadences across 12 Months

| Compounding Cadence | Active Slots in Year 1 | Free Slots Remaining | Strategy Profile |
|---|:---:|:---:|---|
| **Monthly Ladder** *(1 lock / month)* | **12 / 64** | **52 slots free** | Clean, low gas overhead, steady monthly unlock/compound cycle. |
| **Bi-Weekly Ladder** *(1 lock / 2 weeks)* | **26 / 64** | **38 slots free** | High compound velocity, balanced gas efficiency. |
| **Weekly Ladder** *(1 lock / week)* | **52 / 64** | **12 slots free** | Maximum compound velocity on a single wallet under the 64-slot limit. |

### Execution Workflow
1. **Year 1:** Open periodic 1-year positions (`35,040 epochs`) with claimed yield + bought tokens, securing the maximum **`4.00x` duration boost**.
2. **Year 2 & Beyond:** In Month 13, Position #1 matures. Call `unlock(1)` to receive `Principal + 100% of Accrued Rewards`, then immediately call `lock()` with the combined balance for another 1 year at **`4.00x`** (recycling Slot 1).
3. Repeat each period indefinitely to maintain 100% of your capital at the maximum 4.00x multiplier forever.
