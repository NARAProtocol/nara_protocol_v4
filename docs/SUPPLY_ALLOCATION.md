# NARA v4 Supply Allocation

Last updated: 2026-08-09.

This document is the canonical supply-allocation and initial-liquidity reference
for the active NARA v4 deployment. Code and verified on-chain balances remain
the source of truth.

## Fixed Supply

`NARAToken` minted exactly `1,000,000 NARA` once. The token has no administrative
mint function.

## Approved Allocation

| Allocation | NARA | Share | Status |
|---|---:|---:|---|
| Reward reserve | 650,000 | 65% | Deployed and sealed |
| Bond inventory | 200,000 | 20% | Deferred; bonds remain closed |
| Liquidity | 70,000 | 7% | Earmarked; pool remains uninitialized |
| External team vesting | 40,000 | 4% | Deferred |
| Treasury | 40,000 | 4% | Retained treasury allocation |
| **Total** | **1,000,000** | **100%** | |

The fresh-core verification readback reconciles with this plan:

- `650,000 NARA` is sealed in `NARARewardReserve`.
- `350,000 NARA` remains in the treasury before the deferred allocation split.
- `350,000 = 200,000 + 70,000 + 40,000 + 40,000`.

## Controlled Initial Liquidity

The `70,000 NARA` liquidity allocation is an allocation envelope, not the amount
that must enter the first pool transaction.

The reviewed initial position is:

| Asset | Amount |
|---|---:|
| NARA | 60,000 |
| Base native USDC | 300 |

This ratio initializes the pool at:

- `$0.005` per NARA;
- `$5,000` implied fully diluted valuation on the fixed 1,000,000 supply; and
- approximately `$600` of two-sided pool value.

The remaining `10,000 NARA` liquidity allocation stays in custody. Any later
liquidity addition is a separate production action requiring its own balance,
price-impact, custody, and transaction review.

## Execution Guardrails

- The NARA/USDC pool is currently unregistered, uninitialized, and unseeded and
  has no liquidity or LP NFT.
- Do not use the historical `30 NARA + 300 USDC` seed values; that ratio implies
  `$10` per NARA and a `$10,000,000` FDV.
- Do not use the superseded `3,000 NARA + 300 USDC` ratio; it implies `$0.10`
  per NARA and a `$100,000` FDV.
- Use Base native USDC at
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Documentation changes do not authorize token transfers, approvals, pool
  initialization, liquidity seeding, or any other production transaction.

## Circulating-Supply Treatment

The planned post-allocation disclosure model counts the `70,000 NARA` liquidity
allocation and `40,000 NARA` treasury allocation as circulating, for a planned
genesis disclosure of `110,000 NARA`.

That is not a claim about the current circulating supply. The allocation layer
and final custody split are deferred. Do not deploy or publish the
circulating-supply oracle until its excluded-address set matches the verified
post-allocation custody structure.
