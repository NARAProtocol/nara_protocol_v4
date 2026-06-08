# NARA Emission Mechanics

Last updated: 2026-05-27.

Status: historical v3 emission reference. v3 is retired as of 2026-05-27. This document preserves the v3 emission mechanics as a reference; do not quote v3 state numbers as current. v4 uses the engine at `contracts/v4/NARAEngine.sol`. Use [PRD.md](PRD.md), [ROADMAP.md](ROADMAP.md), and [CURRENT_STATE.md](CURRENT_STATE.md) for current v4 numbers once the fresh v4 deploy is verified.

## Historical v3 State (block 44,772,634 snapshot)

| Metric | Value |
|---|---|
| Total emission per epoch | 0.5097 NARA |
| Total emission per day | ~48.9 NARA |
| Bond market status | **CLOSED** (remainingCapacity: 0) |
| ETH flowing to committed participants | 0 ETH/epoch |
| pendingEthForNextEpoch | 0 ETH |

The emission is currently at floor because **no ETH is flowing in**. The bond market is not yet open.

---

## Why You Can't Earn 5 NARA/Epoch Right Now

Total emission for ALL stakers combined = **0.51 NARA/epoch**.

To personally earn 5 NARA/epoch you would need 980% of total weight — mathematically impossible.
No single wallet can earn more than 100% of the epoch emission.

---

## What Drives Emission Higher

The emission rate is recalculated every epoch by the stress model in `contracts/v4/NARAEngine.sol` (v3: `NARAEngineV2`).
The key input is **ETH flowing into `notifyEthRewards()`**.

```
More ETH in → higher betaWad (yield temperature) → higher emission
```

### ETH Sources (in priority order)

| Source | Mechanism | Status |
|---|---|---|
| Bond purchases | Buyers pay ETH; split routes part → `notifyEthRewards` | Market closed |
| Protocol fee products | Any app using engine fees routes ETH to committed participants | Not yet live |
| Manual top-up | Owner calls `notifyEthRewards` directly | Available always |

**The bond market opening is the primary activation event.**
Once bonds are live and ETH flows in, emission climbs and every committed participant benefits proportionally.

> v3 used a 70/30 split (70% to rewards). v4 default is `rewardSplitWad = 0.30` (30% to engine rewards, 70% to treasury). The split is set in `BondTerms` by the `TERMS_ROLE` via `executeTerms()`.

---

## What "5 NARA/Epoch Total" Means for Committed Participants

If emission reaches 5 NARA/epoch, individual earnings depend on share of total weight pool.
_v3-era illustrative example (total weight 103K, total locked 35,506 NARA):_

| Commitment size | Max commitment weight (3×) | Share of 103K total weight | Earnings/epoch |
|---|---|---|---|
| 1,000 NARA | 3,000 | 2.9% | 0.145 NARA |
| 5,000 NARA | 15,000 | 12.7% | 0.635 NARA |
| 10,000 NARA | 30,000 | 22.5% | 1.13 NARA |
| 35,000 NARA | 105,000 | ~50% (dominant) | 2.5 NARA |

To personally earn 5 NARA/epoch at 5 NARA/epoch total emission:
you would need to own ~100% of total weight — requires being the only meaningful committed participant.

_v4 will have a fresh weight pool. Actual share percentages depend on v4 launch positions. See `CURRENT_STATE.md` post-deploy._

---

## Emission Model Levers

The stress model parameters controlling emission range (from `config()`):

- `minBaseEmission` — floor emission even with zero ETH activity
- `maxBaseEmission` — ceiling on base emission
- `beta0Wad` — baseline yield temperature
- `betaWad` — live yield temperature, rises with ETH inflow
- `stressWad` — protocol stress level (low stress = lower emission pressure)
- `warmupFactorWad` — reduces emission for new/warming-up positions

These are settable post-deploy via the `PARAM_ROLE` using `proposeConfig` / `executeConfig` (timelocked). In v3, changes required contract redeployment. In v4, config changes go through a time-delayed proposal flow.

---

## The Activation Path

```
Bond market opens
    → Users buy bonds paying ETH
    → 70% of ETH → notifyEthRewards()
    → betaWad rises
    → emission per epoch increases
    → all committed participants earn more NARA per epoch
    → higher yield → more commitment demand
    → more weight in protocol → more stress pressure
    → emission climbs further
```

This is the flywheel. The bond market is the ignition.

---

## How to Monitor

Once v4 is deployed, read live state via direct contract calls or a script against the v4 engine address from `CURRENT_STATE.md`.

Key reads on `NARAEngine`:
- `epochState()` → `emission`, `betaWad`, `distributedNara`, `epoch`
- `pendingEthForNextEpoch` (if exposed) → ETH queued for next epoch (leading indicator)
- `rewardReserveAvailable()` → remaining sealed reward budget

Key reads on `NARABondDepositoryV4NFT`:
- `terms()` → `active`, `remainingCapacityNara` — bond market status
