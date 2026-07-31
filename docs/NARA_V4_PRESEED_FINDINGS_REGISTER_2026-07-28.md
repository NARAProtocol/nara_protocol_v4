# NARA v4 Pre-Seed Findings Register

Last verified against source: 2026-07-29
Scope: replacement NARA/USDC liquidity trio, deployed v4 engine interaction,
NARA Baskets launch path, and basket fee collector.

This is the canonical record for the five pre-seed findings. “Source fixed”
does not mean “fixed on Base.” The corrected hook, vault, compounder, basket
contracts, and frontend still require deployment, address synchronization, and
live verification. No production transaction was performed as part of these
remediations.

## Status Summary

| ID | Severity | Finding | Resolution | On-chain status |
|---|---|---|---|---|
| PS-01 | Medium | Same-block split swaps could reduce the aggregate pressure fee | Source fixed and regression-tested | Requires replacement hook |
| PS-02 | Medium | ERC-20 rewards notified after position extensions can become permanently unclaimable | Deployed engine cannot be changed; path disabled and role revocation required | Operational containment pending role verification |
| PS-03 | High | Unrestricted basket sizes are incompatible with shallow launch liquidity | Small buys allowed; live depth-based input cap and no-swap exit fallback added | Frontend deployment and live depth required |
| PS-04 | High | Frozen arbitrary fee-swap routes could strand fees; caller-controlled minimum output could destroy value | Collector redesigned around a typed oracle-bounded USDC/WETH route | Requires first collector deployment |
| PS-05 | High | Anyone could initialize the registered v4 pool at an arbitrary permanent price | Opening price bound in hook; seed accepts only empty or exact-price initialized pool | Requires replacement hook |

## PS-01 — Same-Block Split Fee Evasion

### Confirmed cause

The original fee calculation recomputed live depth for each swap while
subtracting a fee credit calculated at an earlier depth. A sell changes the
pool state used by the next sell. The cumulative-fee telescoping assumption was
therefore false when depth changed between legs.

The earlier test missed this because:

- its mock did not expose real v4 pool state, causing the live-depth probe to
  fall back to a constant;
- the apparent split test used separate automined blocks; and
- the second leg was dust-sized.

### Resolution

`NARALiquidityGrowthHook` now uses configured `protocolDepth` as the fee basis
and captures it on the first same-currency flow in each block. Live pool depth
is telemetry only. Cumulative deltas therefore telescope exactly, and
momentary price or JIT-liquidity changes cannot lower the fee basis.

Fee-curve and depth executions also revert during an active flow block, so an
owner cannot change the cumulative calculation halfway through a block.
Threshold arithmetic uses `Math.mulDiv`, avoiding multiplication overflow.

### Evidence

- `contracts/v4/NARALiquidityGrowthHook.sol`: `_recordBlockFlow`,
  `_cumulativeFee`, `executeFeeCurve`, and `executeProtocolDepth`
- `test/NARALiquidityGrowth.v4.test.ts`: meaningful same-transaction split
  tests
- `test/NARALiquidityGrowth.real-v4.test.ts`: real Uniswap v4 PoolManager buy
  and sell regression

## PS-02 — Post-Extension ERC-20 Reward Under-Allocation

### Confirmed cause

After the first ERC-20 reward notification, `extend()` can increase
`activeTotalWeight` while the position’s `tokenWeight` remains frozen.
`notifyTokenRewards()` divides new rewards by live `activeTotalWeight`, so the
sum of position claims can be lower than the amount deposited. The engine has
no recovery path for the difference.

The earlier test asserted only that claims did not exceed deposits. That
one-sided solvency assertion could not detect under-distribution.

### Resolution

The deployed, reserve-bound engine is immutable and cannot honestly be called
source-fixed. Launch containment is:

1. `NARALiquidityGrowthVault.setRouteMode()` permanently rejects `Engine` and
   `Split`;
2. `BribeRouterV4` is not deployed for this engine;
3. every Safe, EOA, vault, and router must have
   `REWARD_NOTIFIER_ROLE == false`; and
4. `verifyV4LaunchGates.ts` treats any known notifier holder as a launch
   failure.

ETH rewards are unaffected. ERC-20 reward notification must remain disabled
for this deployed engine.

## PS-03 — Basket Size Versus Launch Depth

### Confirmed cause

Every basket contains NARA and its NARA leg is pinned to the canonical hooked
NARA/USDC pool. The planned 60,000 NARA / 300 USDC seed is intentionally
shallow. Unrestricted basket orders would create excessive price impact,
pressure fees, stale quotes, and correlated swap failures.

This escaped the earlier reviews because the hook and basket manager were
tested independently; no release gate converted basket NARA weights into a
maximum order at the actual seed depth.

### Resolution

The launch frontend reads both:

- `protocolDepth(USDC)`; and
- `probeLiveDepth(USDC)`.

It uses the lower value and limits each basket input so the basket’s NARA
allocation is at most 3% of that effective depth:

```text
max basket input = effective USDC depth × 3% ÷ NARA basket weight
```

At the planned 300 USDC side this allows:

- up to 90 USDC for CORE at 10% NARA; and
- up to 60 USDC for AI, FINANCE, and CULTURE at 15% NARA.

The cap grows automatically with depth. Zero or unreadable depth blocks buys.
If an exit swap lacks depth or its quote moves, the interface directs the user
to `withdrawUnderlying`, which requests the recorded underlying assets without
swaps. A component token that freezes or reverts its own transfers can still
block that token; selected-asset exit keeps unaffected assets recoverable.
This is a capacity control, not a promise of price or execution.

## PS-04 — Fee Collector Permanence and Value Loss

### Confirmed cause

The previous V2 collector combined:

- immutable basket fee-recipient addresses;
- no sweep path;
- a one-way executor/selector allowlist freeze;
- arbitrary calldata to an allowlisted executor; and
- a caller-supplied `minAmountOut` with no objective price floor.

A dead route could strand future fees permanently. A compromised swapper could
also submit a near-zero minimum output and lose most of the collector’s value
through an otherwise allowed route.

### Resolution

`NARAIndexFeeCollectorV2` was replaced before deployment:

- no arbitrary executor, selector, calldata, or allowlist;
- one typed Uniswap SwapRouter02 exact-input route from USDC to WETH;
- minimum WETH output derived from fresh USDC/USD and ETH/USD feeds;
- immutable maximum slippage and oracle-age bounds;
- exact USDC spend and WETH balance-delta checks;
- constructor verification that the immutable engine is bound to the same NARA
  token;
- exact NARA balance-delta verification after engine deposits;
- atomic WETH unwrap and `notifyEthRewards`;
- separate contract admin, swapper, and route-manager identities;
- two-day route migration delay;
- admin guardian cancellation;
- revoking a compromised proposer invalidates its pending route; and
- no token or ETH sweep.

Launch basket deployment requires `withdrawFeeBps == 0` and
`holdingFeeBps == 0`, preventing long-tail underlying fee assets from entering
this deliberately narrow collector. Normal buy/sell fees arrive as USDC or
NARA.

## PS-05 — Permissionless Arbitrary Pool Initialization

### Confirmed cause

Uniswap v4 initialization is permissionless. The original
`beforeInitialize` validated only the registered `PoolKey` and ignored
`sqrtPriceX96`. Anyone could therefore set an arbitrary permanent opening price
before the operator seeded liquidity. The seed script would refuse to fund the
poisoned pool, making this denial of launch rather than theft.

Checking the callback sender would be incorrect because legitimate
PositionManager initialization reaches the hook with PositionManager as the
sender.

### Resolution

`registerPool(key, expectedSqrtPriceX96)` now binds a nonzero exact opening
price in the same one-shot registration. `beforeInitialize` accepts every
caller but rejects any other price. The hook also pins fee 3000 and tick
spacing 60.

The seed script:

1. recomputes the opening price from the reviewed 60,000 NARA / 300 USDC
   amounts;
2. requires it to equal the hook’s bound price before approvals;
3. initializes and mints when slot0 is zero;
4. mints without reinitializing when slot0 already equals the bound price; and
5. aborts on every other slot0 value.

An early caller can no longer choose a bad price or permanently block the seed
by initializing at the correct price.

## Supplemental One-Shot Hardening

The focused seam review also closed three deployment-error paths:

- `NARALiquidityGrowthVault.setHook()` verifies the hook’s token, base, and
  vault bindings before consuming the one-shot setter.
- `setCompounder()` verifies the compounder’s NARA, USDC, and vault bindings
  before it can later be frozen.
- pool registration accepts only the canonical 3000 fee and tick spacing 60.

These are preventive controls, not claims that a matching exploit was observed
on Base.

## Verification Evidence — 2026-07-29

- Full Hardhat suite: 468 passing, 0 failing.
- Focused liquidity/seed suite: 33 passing, including a real Uniswap v4
  `PoolManager` same-block split regression.
- Bytecode gate: every deployable v4 artifact is below the EVM limits;
  `NARAEngine` is 24,554 bytes, the replacement hook is 11,511 bytes, and the
  replacement vault is 11,204 bytes.
- Slither v4 run: completed with exit 0. Hook/vault alerts were manually
  classified as deliberate active-block/zero guards, ignored view tuple
  values, or balance-delta checks reachable only through `nonReentrant`
  entrypoints.
- Basket deterministic suite: 138 passing, 0 failing, 1
  environment-dependent skip; the redesigned collector suite is 21/21.
- Basket CI invariant suite: 4 passing. Each stateful invariant ran 256
  campaigns and 16,384 calls; the selected-asset rescue fuzz property ran
  1,000 cases.
- Basket frontend: builder regressions, public-copy gate, launch-config parity,
  TypeScript check, and production Vite build passed.
- Basket frontend dependency audit: 0 critical, 0 high, and 9 moderate. The
  remaining advisory is the MetaMask connector's transitive UUID chain; npm's
  proposed automatic fix requires an incompatible Wagmi 3 migration.
- Base adapter fork suites: 31 passing across Uniswap V3, Aerodrome AMM,
  Aerodrome Slipstream, and PancakeSwap V3.
- Aderyn did not execute because its binary is not installed. `ForkBuyProof`
  still requires the candidate basket stack to be deployed on the local fork.
  Both remain explicit release gaps.
- Frontend production-env and manifest gates correctly fail while fork
  placeholders remain and `deployments/base-mainnet/{base,ai,meme,defi}.json`
  do not exist. Do not bypass these gates; populate them only from verified
  fresh deployments.

## Mandatory Release Gates

Do not call the launch production-ready until all of these are evidenced:

1. deploy and verify the fresh hook, vault, and compounder from the corrected
   source;
2. confirm the bound opening price, pool key, fee, tick spacing, and reciprocal
   hook/vault/compounder bindings;
3. revoke every engine `REWARD_NOTIFIER_ROLE` holder and pass the launch-gate
   script with zero skips in launch scope;
4. run the exact-price seed preflight before approvals;
5. seed, run real buy/sell smoke tests, validate one compound, and freeze the
   compounder only after validation;
6. deploy the redesigned collector and immutable basket managers with zero
   holding and raw-withdraw fees;
7. publish fresh manifests and configure the frontend only from those
   manifests;
8. verify small-buy caps and the no-swap underlying withdrawal on Base;
9. complete the monitored observation period; and
10. preserve this report’s limitation: internal tests and review are not an
    independent security audit.

Until those gates pass against fresh Base addresses, the correct status is
**source remediated, deployment blocked**, not production-ready.
