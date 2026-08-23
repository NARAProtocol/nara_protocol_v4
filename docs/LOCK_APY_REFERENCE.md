# NARA Lock APY Reference

Last updated: 2026-05-27. Snapshot values below are historical v3 values from Base block 44,772,634 (v3 retired 2026-05-27).

Status: do not use this file for v4 launch yield claims. Current public copy should avoid fixed APY promises and should use [CURRENT_STATE.md](CURRENT_STATE.md) for live data.

## Historical v3 Protocol Numbers (block 44,772,634)

| Metric | Value |
|---|---|
| Total NARA locked | 35,506 NARA |
| Active total weight | 103,382.067 |
| Epoch emission (current) | 0.5097 NARA/epoch |
| Epoch length | 15 minutes |
| Epochs per day | 96 |
| Total emission per day | ~48.9 NARA/day (all stakers) |
| Reward reserve | 699,962 NARA (~39 years at current rate) |
| Max lock duration | 35,040 epochs (1 year) |
| Max weight multiplier | 3× (at 35,040 epochs) |

## APY Calculation — 1,000 NARA Max Lock

**Inputs:**
- Amount: 1,000 NARA
- Duration: 35,040 epochs (1 year, max lock)
- `previewWeight(1000, 35040)` = **3,000** (3× multiplier)

**Formula:**
```
share = weight / activeTotalWeight = 3000 / 103382.067 = 2.902%
NARA_per_epoch = share × epochEmission = 0.02902 × 0.5097 = 0.01479 NARA
NARA_per_day   = 0.01479 × 96 = 1.420 NARA/day
NARA_per_year  = 1.420 × 365 = 518.4 NARA/year
APY (NARA)     = 518.4 / 1000 = 51.8%
```

**USD at $0.1149/NARA (2026-04-16):**
| Metric | Value |
|---|---|
| Position value | $114.90 |
| Earnings/day | $0.163 |
| Earnings/year | $59.52 |
| APY (USD, at current price) | **51.8%** |

## APY at Different Price Points

| NARA price | USD invested (1K) | USD/day | USD/year | APY |
|---|---|---|---|---|
| $0.1149 | $114.90 | $0.163 | $59.52 | 51.8% |
| $0.50 | $500 | $0.71 | $259 | 51.8% |
| $1.00 | $1,000 | $1.42 | $518 | 51.8% |
| $2.00 | $2,000 | $2.84 | $1,036 | 51.8% |
| $5.00 | $5,000 | $7.10 | $2,590 | 51.8% |

> APY % stays constant at ~51.8% regardless of price — the yield is denominated in NARA, not USD.
> USD earnings scale linearly with price.

## Weight Multiplier Reference

The multiplier is a function of lock duration. Longer lock = higher weight = larger share of emissions.

| Lock duration | Approx multiplier | Notes |
|---|---|---|
| 9 epochs (~2h) | ~1× | Minimal boost |
| 30 epochs (~7.5h) | ~1× | Near-baseline |
| 35,040 epochs (1 year) | **3×** | Max lock, max weight |

## ETH Rewards

_v3 state: `pendingEthForNextEpoch = 0` at time of snapshot._ When the bond market opens and ETH flows via `notifyEthRewards()`, ETH yield stacks on top of the NARA APY. v4 uses `contracts/v4/NARAEngine.sol` for this call.

## Caveats

- `epochEmission` is dynamic. The stress model adjusts it each epoch based on circulating supply,
  locked ratio, and protocol health. 0.51 NARA/epoch is the current live rate.
- `activeTotalWeight` grows as more NARA is locked. Higher participation = lower individual share.
- APY quoted here uses a v3 snapshot. After v4 deploy, read live state from v4 engine address in `CURRENT_STATE.md`.
- The weight multiplier formula is `m = 1 + durationLinearWad*r + durationQuadraticWad*r²` where `r = dur/maxLockEpochs`. v4 production defaults: linear 0.5, quadratic 2.5 → max 4× at max lock. Read `contracts/v4/NARAEngine.sol` and `contracts/v4/libraries/NARAEngineModelLib.sol` for the exact formula.

## How to Recalculate

_`npm run check:nara:live` was a v3 script and does not exist in v4. After fresh v4 deploy, read live state from the v4 engine address recorded in `CURRENT_STATE.md`._

Apply the formula:
```
share          = previewWeight(amount, duration) / activeTotalWeight
NARA_per_epoch = share × epochEmission
NARA_per_day   = NARA_per_epoch × 96
APY            = (NARA_per_day × 365 / amount) × 100
```
