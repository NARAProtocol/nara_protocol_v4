# NARA Lock Weight and Variable-Reward Reference

Last updated: 2026-08-30.

The filename is retained for existing links. It is not an APY quote, forecast,
offer, recommendation, or availability claim. The prior v3 price scenarios and
fixed-return examples were removed because v3 is retired and those snapshots
do not describe the active v4 deployment.

The canonical v4 contracts are in technical live testing with real assets on
Base mainnet, but no public locking flow is available. The Position NFT Phase-2
baseline is tested, deployed, source-verified, and Safe-finalized while its
manifest remains `integrationReady: false`. This repository contains no
evidence of completed jurisdiction-specific qualified legal review.

## What can be stated from source

- Persistent NARA supply is fixed at `1,000,000 NARA`.
- The deployed Engine uses 900-second epochs.
- Duration affects accounting weight through the configured linear and
  quadratic terms.
- Variable NARA emissions and contributed ETH are accounted across eligible
  active weight; an individual realized amount can be zero.
- The deployed Engine's generic ERC-20 notifier is prohibited.
- Longer duration changes weight and delays the unlock epoch. It does not
  guarantee a reward, return, token value, market, liquidity, buyer, or exit.

## Weight formula

For a valid duration, the model uses a normalized duration ratio `r` and the
configured linear/quadratic terms:

```text
r = durationEpochs / maxLockEpochs
multiplier = 1 + durationLinearWad * r + durationQuadraticWad * r^2
weight = netAmount * multiplier
```

The production configuration recorded in current protocol evidence uses a
maximum modeled duration multiplier of approximately `4x`. This is an
accounting-weight relationship, not a return multiplier. Read the exact current
parameters from the deployed Engine at a pinned block before displaying any
preview.

## Why a durable APY cannot be stated

Realized accounting depends on changing state, including active total weight,
epoch settlement, admitted supply, bootstrap weight, reserve availability,
contributed ETH, position activation/maturity, fees, and any later timelocked
parameter changes. Token-denominated results do not imply fiat value, and a
historical result is not a floor or forecast.

Any internal point-in-time estimate must:

1. identify the exact deployed Engine and chain;
2. pin every input to a block number and timestamp;
3. label assumptions separately from observed state;
4. show that results can be zero and can change before execution;
5. omit annualized fiat-return, price-scenario, and guaranteed-outcome tables;
6. disclose fees, irreversible duration, custody/control, liquidity, token-
   value, execution, and exit risks; and
7. remain internal until jurisdiction-specific qualified-counsel review and all
   product-availability gates pass.

Use [CURRENT_STATE.md](CURRENT_STATE.md) for deployment status and
[EMISSION_MECHANICS.md](EMISSION_MECHANICS.md) for source mechanics. Neither is
a return quote or authorization to transact.
