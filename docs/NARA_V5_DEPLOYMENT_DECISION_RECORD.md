# NARA V5 Deployment Decision Record

Change-ID: `NARA-20260801-v5-complete-stack-reset`

Status: **BLOCKED — local complete-stack candidate implemented; production
values and release evidence are not approved**

This record is the human configuration freeze required before any V5
deployment payload can be assembled. Blank or `UNAPPROVED` fields are hard
stops. Chat history, V4 constants, rehearsal values, and a planned address are
not substitutes for an approved value.

The machine gate is `scripts/v5/lib/v5ReleaseGate.ts`. It requires a full
40-character immutable origin commit, exact decision-evidence hashes, separate
custody, complete allocation equality, the approved Hook curve, fresh
addresses, and the retired-rehearsal proof before accepting production.

## Already frozen

| Decision               | Frozen value                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack identity         | A genuinely fresh V5 token, Engine, reserve, modules, liquidity stack, pool, custody, tooling, and integration graph                                                                        |
| V4 boundary            | V4 remains a separate recovery/retirement source; no V4 address or bytecode may be relabeled V5                                                                                             |
| Hook curve             | Symmetric per-leg phases `15%`, `12.5%`, `10%`, `7.5%`, `5%`                                                                                                                                |
| Bootstrap effect       | `15%` input plus `15%` actual output; `27.75%` no-impact hook-only reduction                                                                                                                |
| Phase direction        | Sequentially downward only, based on verified active named POL; `5%` per leg is the floor                                                                                                   |
| Fee custody            | Hook accrues both currencies only to the bound Vault                                                                                                                                        |
| Vault routing          | `Unbound -> BootstrapLiquidity -> Shared -> Retired`; Bootstrap classifies 100% for liquidity; Shared applies one immutable equal-currency percentage prospectively; dust remains liquidity |
| POL definition         | Only named, protocol-owned, recovery-locked active position liquidity counts; loose tokens, claims, banked assets, donations, reserve snapshots, third-party LP and JIT LP do not count     |
| Recovery commissioning | Complete disposable rehearsal at exactly one hour; retire it completely; deploy a different production stack already sealed at seven days or longer                                         |
| Excluded legacy scope  | No V3 imports; no mining, jackpot, Lotto, Arena, MisterMint, Sponsor behavior, BribeRouter, or generic V4 notifier                                                                          |
| Initially deferred     | Raw-position bonds, staking/stNARA, Pendle SY, and fractional positions unless separately approved                                                                                          |

## Production decisions requiring explicit human approval

### 1. Token and V4-holder treatment

| Field                                                                   | Approved value | Evidence hash |
| ----------------------------------------------------------------------- | -------------- | ------------- |
| Name / symbol / decimals                                                | `UNAPPROVED`   | `UNAPPROVED`  |
| Fixed supply                                                            | `UNAPPROVED`   | `UNAPPROVED`  |
| Permit                                                                  | `UNAPPROVED`   | `UNAPPROVED`  |
| ERC-1363 / multicall / flash mint                                       | `UNAPPROVED`   | `UNAPPROVED`  |
| Address derivation / deployment root                                    | `UNAPPROVED`   | `UNAPPROVED`  |
| V4-holder mode: none / snapshot claim / escrow                          | `UNAPPROVED`   | `UNAPPROVED`  |
| Snapshot block/hash and eligibility, if used                            | `UNAPPROVED`   | `UNAPPROVED`  |
| Ratio, cap, rounding, deadline, dust and unclaimed destination, if used | `UNAPPROVED`   | `UNAPPROVED`  |
| Recovered V4 NARA disposition                                           | `UNAPPROVED`   | `UNAPPROVED`  |

Recommended control posture, not approval: minimal fixed-supply ERC-20 plus
Permit; no flash mint, ERC-1363, or multicall unless a tested product dependency
requires one.

### 2. Supply allocation and Engine

Every allocation must name one exact recipient and the sum must equal the fixed
supply. The old sealed `650,000 V4 NARA` reserve is not V5 capital.

| Field                                                               | Approved value | Evidence hash |
| ------------------------------------------------------------------- | -------------- | ------------- |
| V5 reward reserve                                                   | `UNAPPROVED`   | `UNAPPROVED`  |
| Seed/POL inventory                                                  | `UNAPPROVED`   | `UNAPPROVED`  |
| Holder claims, if any                                               | `UNAPPROVED`   | `UNAPPROVED`  |
| Bond immutable lifetime ceiling and Treasury-held latent allocation | `UNAPPROVED`   | `UNAPPROVED`  |
| Operations vesting                                                  | `UNAPPROVED`   | `UNAPPROVED`  |
| Treasury/ecosystem/basket inventory                                 | `UNAPPROVED`   | `UNAPPROVED`  |
| Epoch length and catch-up policy                                    | `UNAPPROVED`   | `UNAPPROVED`  |
| Emission/reserve release model                                      | `UNAPPROVED`   | `UNAPPROVED`  |
| Emission bootstrap denominator weight                               | `UNAPPROVED`   | `UNAPPROVED`  |
| Minimum active weight eligible for emissions/fee rewards            | `UNAPPROVED`   | `UNAPPROVED`  |
| Inactive-weight fee recipient                                       | `UNAPPROVED`   | `UNAPPROVED`  |
| Lock durations and weight model                                     | `UNAPPROVED`   | `UNAPPROVED`  |
| Protocol/claim/native fees                                          | `UNAPPROVED`   | `UNAPPROVED`  |
| Engine configuration delay                                          | `UNAPPROVED`   | `UNAPPROVED`  |

The current V5 candidate removes in-place principal increases: every additional
principal tranche must open a fresh position with its own fresh lock. Position
extensions settle first. Principal unlock does not call external reward tokens;
the NFT remains a reward receipt until its owner claims or explicitly closes it.
Reserve emissions are capped by an immutable bootstrap denominator and cannot
start below an immutable minimum active weight. Liquidity fees received below
that weight go immediately to an immutable inactive-weight recipient, never to
a queue capturable by the next locker. Exact values and recipient custody remain
unapproved. The V4 generic notifier and changing-denominator defect are not
permitted.

### 3. Module scope and terms

| Field                                                                       | Approved value                                                                                                  | Evidence hash |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------- |
| Canonical position lifecycle and limits                                     | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| NFT transferability / royalty / wrapper fees                                | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| Genesis eligibility and terms                                               | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| Genesis unique distribution domain                                          | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| NFT bond inventory, assets, oracle, pricing, term, cap                      | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| NFT bond immutable minimum payment / minimum payout                         | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| NFT bond minimum payment-per-payout ratio                                   | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| NFT bond activation delay (`>= 1 hour`)                                     | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| Fixed-price campaign policy or live oracle/TWAP deviation bound             | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| Maximum queued/active bond term lifetime (`1 second..30 days`)              | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| Unsold, expired, or permanently closed inventory recovery/disposition       | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| Bond recovery recipient and delay, exactly matching release recovery policy | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| Bond lock bounds against Engine min/max and epoch-aligned displayed unlock  | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |
| Initial bond state                                                          | Proposed: positive immutable lifetime ceiling held in Treasury; vault unfunded; no terms and zero live capacity | `UNAPPROVED`  |
| Launch / deployed-closed / deferred component lists                         | `UNAPPROVED`                                                                                                    | `UNAPPROVED`  |

### 4. Custody and roles

| Field                                               | Approved value | Evidence hash |
| --------------------------------------------------- | -------------- | ------------- |
| Admin Safe address / owners / threshold             | `UNAPPROVED`   | `UNAPPROVED`  |
| Treasury Safe address / owners / threshold          | `UNAPPROVED`   | `UNAPPROVED`  |
| Governance timelock address / delay                 | `UNAPPROVED`   | `UNAPPROVED`  |
| Recovery authority and recipient                    | `UNAPPROVED`   | `UNAPPROVED`  |
| Keeper and manual-fallback roles                    | `UNAPPROVED`   | `UNAPPROVED`  |
| Safe singleton / modules / guard / fallback handler | `UNAPPROVED`   | `UNAPPROVED`  |
| Deployer role-removal batch                         | `UNAPPROVED`   | `UNAPPROVED`  |

Recommended control posture, not approval: separate 3-of-5 admin and treasury
Safes, a 48-hour governance timelock, no unreviewed Safe modules, and full
deployer removal before activation.

### 5. Pool, depth phases, routing, and compounding

Use
[NARA_V5_DEPTH_ECONOMICS_2026-08-01.md](NARA_V5_DEPTH_ECONOMICS_2026-08-01.md)
to convert approved target trade sizes and execution ratios into candidate
reserve multiples before exact concentrated-liquidity Quoter sweeps. The note
does not approve any absolute threshold.

| Field                                                                               | Approved value | Evidence hash |
| ----------------------------------------------------------------------------------- | -------------- | ------------- |
| Opening price / FDV / `sqrtPriceX96`                                                | `UNAPPROVED`   | `UNAPPROVED`  |
| V5 token seed amount and source                                                     | `UNAPPROVED`   | `UNAPPROVED`  |
| USDC seed amount and source                                                         | `UNAPPROVED`   | `UNAPPROVED`  |
| Counted range policy and ticks                                                      | `UNAPPROVED`   | `UNAPPROVED`  |
| Minimum V5-token and USDC trades                                                    | `UNAPPROVED`   | `UNAPPROVED`  |
| Five absolute active-POL thresholds                                                 | `UNAPPROVED`   | `UNAPPROVED`  |
| Spaced observation period and minimum sample count per transition                   | `UNAPPROVED`   | `UNAPPROVED`  |
| Shared Engine share `X`                                                             | `UNAPPROVED`   | `UNAPPROVED`  |
| Inactive/stale Engine-share recipient and monitoring policy                         | `UNAPPROVED`   | `UNAPPROVED`  |
| Seed immutable minimum NARA and USDC used                                           | `UNAPPROVED`   | `UNAPPROVED`  |
| Initial seed-call minimum NARA and USDC used                                        | `UNAPPROVED`   | `UNAPPROVED`  |
| Seed-position initializer funding caps / minimum liquidity / deadline / exact range | `UNAPPROVED`   | `UNAPPROVED`  |
| Compounder immutable minimum NARA and USDC used                                     | `UNAPPROVED`   | `UNAPPROVED`  |
| Initial compound-call minimum NARA and USDC used                                    | `UNAPPROVED`   | `UNAPPROVED`  |
| Compound trigger / cadence / caps / minimum liquidity                               | `UNAPPROVED`   | `UNAPPROVED`  |
| Quote, slippage and deadline policy                                                 | `UNAPPROVED`   | `UNAPPROVED`  |
| One-sided bank/retry policy                                                         | `UNAPPROVED`   | `UNAPPROVED`  |

Control constraints, not approval: only named recovery-locked in-range positions
count toward phases; phase evidence uses spaced observations; compounding uses no
swap and no keeper bounty; and Shared uses one immutable equal-currency `X` no
greater than 50%. The exact `X`, seed, usage floors, and POL thresholds must come
from sell-size/depth simulation, not the old `$0.005`, `60,000 NARA + 300 USDC`,
or a spot-dependent reserve value.

### 6. Recovery and activation

| Field                                                                                 | Approved value | Evidence hash |
| ------------------------------------------------------------------------------------- | -------------- | ------------- |
| Production recovery delay (`>= 604800`)                                               | `UNAPPROVED`   | `UNAPPROVED`  |
| Every recovery kind / recipient / authority                                           | `UNAPPROVED`   | `UNAPPROVED`  |
| Immutable/sealed configuration hashes                                                 | `UNAPPROVED`   | `UNAPPROVED`  |
| CREATE2 factory address/runtime/configuration evidence                                | `UNAPPROVED`   | `UNAPPROVED`  |
| Hook mined salt nonce and permission-bit proof                                        | `UNAPPROVED`   | `UNAPPROVED`  |
| Every component runtime hash and nested PositionAccount address/hash                  | `UNAPPROVED`   | `UNAPPROVED`  |
| USDC/PoolManager/PositionManager/Permit2/UniversalRouter code and proxy-slot evidence | `UNAPPROVED`   | `UNAPPROVED`  |
| Deployment execution-not-before/deadline window                                       | `UNAPPROVED`   | `UNAPPROVED`  |
| Exact setup DAG and atomic Engine/Vault/Controller/Hook activation batch              | `UNAPPROVED`   | `UNAPPROVED`  |
| Preseed, role, seed, smoke, keeper and monitor gates                                  | `UNAPPROVED`   | `UNAPPROVED`  |
| Exit and soak requirements                                                            | `UNAPPROVED`   | `UNAPPROVED`  |
| Basket/frontend availability gate                                                     | `UNAPPROVED`   | `UNAPPROVED`  |

## Disposable rehearsal fixture

These conspicuous values exist only to exercise code paths. They are not
production proposals and require their own reviewed rehearsal configuration:

- token `NARA V5 REHEARSAL - NOT PRODUCTION`, symbol `rNARA5`, 18 decimals,
  fixed supply `1,000,003`;
- synthetic allocation: reserve `400,001`, POL `250,001`, synthetic claims
  `100,001`, operations `100,000`, direct treasury residual `100,000`, and a
  positive Treasury-held latent bond allocation of `50,000`;
- 60-second epochs, deterministic test emission, zero protocol/NFT fees;
- seed `100,003 rNARA5 + 1,001 test USDC`;
- POL thresholds `L0`, `ceil(1.5 L0)`, `2 L0`, `3 L0`, `5 L0` with ten-minute
  observations;
- Shared-route boundary exercise at `X = 25%`, plus `0`, `1`, `33.33`,
  `99.99`, and rejected `100%` tests;
- canonical `bondDepository` and inventory vault deployed and bound closed with
  a `50,000` immutable lifetime ceiling, one-hour activation delay, one-day
  maximum term lifetime, Engine-aligned `600..3,600` second lock bounds, and the
  same constructor-sealed release recovery recipient/delay in both contracts;
  binding verifies the exact ceiling, Treasury funding authority, and recovery
  pair; zero vault funding, no terms, and zero live market capacity; and
- recovery delay exactly `3,600` seconds, followed by complete retirement and
  address denylisting.

No production builder may import this fixture.

The successful local Base-fork one-hour warp is simulation evidence only. It is
not the rehearsal deployment manifest or retirement proof required below. The
positive bond allocation remains in Treasury while the canonical NFT bond
inventory vault is unfunded and the market has zero live capacity. Any later
token approval, inventory funding, term queue, or term activation requires a
separate approved decision and payload covering the fixed-price/oracle policy,
maximum lifetime, unsold-inventory disposition, and Engine-compatible lock
bounds. The depository and vault must both seal the exact release recovery
recipient and delay; their reciprocal bind must fail on any Treasury, ceiling,
recipient, or delay mismatch.

## Freeze evidence

The final reviewed record must include:

- immutable origin commit: `UNAPPROVED`;
- exact configuration-object hash: `UNAPPROVED`;
- human decision-record reference and hash for every row above;
- one-hour rehearsal deployment manifest: `UNAPPROVED`;
- complete rehearsal retirement proof hash: `UNAPPROVED`;
- production Safe/timelock verification: `UNAPPROVED`; and
- independent fork-simulation result for the exact production Safe payload:
  `UNAPPROVED`.

Until every applicable field is filled and independently verified, the only
allowed state is local implementation, testing, and read-only simulation.
