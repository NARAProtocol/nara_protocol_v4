# NARA V5 Depth Economics — 2026-08-01

Status: **parameter-neutral local engineering analysis**. No opening price,
seed, named-POL threshold, quote policy, custody value, or deployment is
approved by this document. No transaction or deployment occurred.

## Purpose

The V5 fee curve is intentionally aggressive at launch:

| Phase | Fee on input | Fee on actual output |
| ----: | -----------: | -------------------: |
|     0 |       15.00% |               15.00% |
|     1 |       12.50% |               12.50% |
|     2 |       10.00% |               10.00% |
|     3 |        7.50% |                7.50% |
|     4 |        5.00% |                5.00% |

This note separates the unavoidable Hook and 0.30% LP toll from losses caused
by insufficient pool depth. It is a planning lower bound, not a production
quote and not investment guidance.

## Balanced constant-product lower bound

Let:

- `f` be the per-leg Hook fee;
- `p = 0.003` be the LP fee;
- `X` be gross trade input;
- `R` be the balanced pool's input-side reserve;
- `M = R / X` be the reserve multiple;
- `A = (1 - f)(1 - p)`; and
- `C = (1 - f)^2(1 - p)` be the maximum net-output/pre-trade-spot
  ratio before depth impact.

For the simplified balanced constant-product model:

```text
r(M) = C / (1 + A / M)
M_min = A r / (C - r)
```

`r` must be strictly below the exact ceiling `C`. The calculation uses exact
integer/rational arithmetic in tooling; displayed percentages are rounded.

| Per-leg fee | Hook-only toll | Toll incl. LP, no impact | Ceiling `C` | 95% of `C`: target / reserve multiple | 99% of `C`: target / reserve multiple |
| ----------: | -------------: | -----------------------: | ----------: | ------------------------------------: | ------------------------------------: |
|      15.00% |       27.7500% |                27.96675% |   72.03325% |                  68.43159% / 16.1015x |                  71.31292% / 83.8975x |
|      12.50% |       23.4375% |                23.66719% |   76.33281% |                  72.51617% / 16.5751x |                  75.56948% / 86.3651x |
|      10.00% |       19.0000% |                19.24300% |   80.75700% |                  76.71915% / 17.0487x |                  79.94943% / 88.8327x |
|       7.50% |       14.4375% |                14.69419% |   85.30581% |                  81.04052% / 17.5223x |                  84.45275% / 91.3003x |
|       5.00% |        9.7500% |                10.02075% |   89.97925% |                  85.48029% / 17.9958x |                  89.07946% / 93.7678x |

Examples for common absolute net-output/pre-trade-spot targets:

| Target |        15% |      12.5% |        10% |      7.5% |       5% |
| -----: | ---------: | ---------: | ---------: | --------: | -------: |
|    70% |   29.1757x |    9.6428x |    5.8391x |   4.2177x |  3.3185x |
|    80% | impossible | impossible |   94.8269x |  13.9051x |  7.5930x |
|    85% | impossible | impossible | impossible | 256.3307x | 16.1686x |

`x` is the initial input-side reserve divided by gross trade size. “Impossible”
means the requested execution is above the Hook-plus-LP no-impact ceiling; no
amount of depth can remove that fee toll.

## Turning this into the five phase thresholds

Absolute named-POL thresholds cannot be frozen until humans approve all of the
following:

1. gross target buy size in USDC and gross target sell size in NARA;
2. minimum net-output/pre-trade-spot ratio for each phase and direction;
3. opening price, token ordering, decimals, and acceptable evaluation tick band;
4. exact seed and Compounder tick ranges and allocation between them;
5. rounding, volatility, range-crossing, and MEV safety margins; and
6. the observation duration and minimum sample count for every transition.

For each phase, calculate the required buy-side and sell-side reserves, convert
both through the exact Uniswap V4 concentrated-liquidity math for the approved
ranges, and use the larger required `uint128 liquidity` value. Only the two
named, recovery-locked, in-range protocol-owned positions count. Loose wallet
balances, banked Vault claims, third-party/JIT positions, and out-of-range
liquidity do not count.

## Production quote rule

The balanced model cannot represent range crossings. Final thresholds and swap
protection require a sweep against the approved V4Quoter, real PoolManager
state, exact ranges, both directions, phase changes, and adverse tick bands.

V4Quoter returns the Hook-adjusted **net output** from the simulated
`BalanceDelta`. Do not apply the output-leg Hook fee to that result a second
time. An unsigned protected-swap plan may derive `minimumNetOutput` from the
returned net quote, but the protected Universal Router/Quoter and basket paths
remain deployment gates until independently approved and fork-tested.

## Model verification

The parameter-neutral implementation and tests are:

- `scripts/v5/lib/v5HookEconomics.ts`; and
- `test/v5/V5HookEconomics.test.ts`.

They use bigint accounting, conservative fee rounding, and both-direction split
tests. Production evidence still requires concentrated-liquidity Quoter sweeps;
this model must never be presented as an executable quote.
