# NARA Liquidity Growth Hook — Uniswap v4 Deep-Dive

> Source: [`contracts/v4/NARALiquidityGrowthHook.sol`](../contracts/v4/NARALiquidityGrowthHook.sol)
> · [`contracts/v4/NARALiquidityGrowthVault.sol`](../contracts/v4/NARALiquidityGrowthVault.sol)
> · [`contracts/v4/utils/Create2HookDeployer.sol`](../contracts/v4/utils/Create2HookDeployer.sol)
> Code/test baseline verified 2026-08-08; deployment and operations state
> reconciled through 2026-08-30.

> **Technical live testing on Base mainnet — not public product availability.**
> The canonical contracts and pool use real assets. This is technical evidence,
> not an audit, safety or legal-approval claim, an offer, or a recommendation.
> Transactions are irreversible; liquidity can be limited or unavailable; token
> values can fall to zero. This repository contains no evidence of completed
> jurisdiction-specific qualified legal review.

NARA's canonical liquidity home is a **single custom Uniswap v4 pool**
(NARA/USDC). The fresh canonical Hook is registered and the pool is initialized
and seeded. Every supported
exact-input swap through that one registered Hook pool pays the configured
asymmetric pressure fee into the Vault. Exact-output swaps are rejected. NARA
ERC-20 transfers and swaps in third-party or unregistered pools are outside
this Hook and are not universally taxed.

> **READ THIS FIRST — the mechanism is POL-first, not locker-first.** The vault's **default route mode
> is `Liquidity`** (`NARALiquidityGrowthVault` constructor sets `routeMode = RouteMode.Liquidity`). The
> skim is designed to **compound back into protocol-owned liquidity (POL) first**, building depth.
> The replacement vault may later redirect USDC to `Genesis` or
> `GenesisSplit`. `Engine` and `Split` are legacy enum values that permanently
> revert because the deployed engine's ERC-20 reward denominator can
> under-allocate after an active-position extension. Do **not** describe the
> hook as "a tax that funds lockers."
>
> **FRESH FULL-v4 POOL AND COMPOUNDER IN TECHNICAL LIVE TESTING.** Stage A and
> the 2026-07-30 pool are historical incident/recovery evidence only. The
> corrected Hook and Vault are Safe-owned and the fresh pool is seeded. The POL
> adapter remains intentionally pluggable through
> `ILiquidityCompounder.compound(...)`, with exact-spend checks, minimum-output
> protection, remainder banking, POL custody, and a seven-day recovery
> timelock. The verified Compounder at
> `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` passed bounded validation and
> owns LP NFT `2898486`. At the latest receipt-pinned compound (Base block
> `50499085`), the position had liquidity `4386316228001171`; the banked
> remainder was `28.423769295100595183 NARA / 2.326460 USDC`. The Vault binding
> is permanently frozen to that address. Unmatched inventory remains banked in
> the Compounder and must not be described as active LP. The separately
> credentialed liquidity maintainer is active at `17,47` under bounded policy.

This document explains the Hook design, observed behavior, verification
evidence, and remaining limitations.

## Current Base deployment

| Item | Value |
|---|---|
| NARA | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| Vault | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` |
| Hook | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` |
| Compounder | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` |
| Pool ID | `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464` |
| LP NFT | `2898124`, owned by the production Safe |

Safe transaction
`0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`
registered, initialized, and seeded the pool at block `49721188` with
`60,000 NARA + 300 USDC`. The sanitized receipt, configuration, address,
runtime-hash, and 30-transaction matrix evidence is in
`../deployments/v4-production-activation-2026-08-09.json`.

---

## 1. Why a hook at all?

In a normal AMM, swap fees go to LPs. NARA redirects this additional hook fee
to the protocol fee vault. The hook lets NARA:

1. charge **more on buy pressure than sell pressure** (a deliberate policy, not a neutral fee), and
2. route the skim to a vault that can compound LP or fund Genesis without
   redeploying the token or engine.

```
swap ──▶ hook (beforeSwap) ──skim input token──▶ vault ──▶ {LP compound | Genesis}
```

---

## 2. The `0x2088` address requirement (and why it's correct)

Uniswap v4 encodes a hook's permissions in the **low bits of its address**. The PoolManager reads
those bits to know which callbacks to invoke, so a hook must be **deployed at an address whose bits
match its declared permissions** — achieved by mining a CREATE2 salt.

`NARALiquidityGrowthHook.getHookPermissions()` declares exactly three:

| Permission | Flag bit | Value |
|------------|----------|-------|
| `beforeInitialize` | `BEFORE_INITIALIZE_FLAG` | `1 << 13` = `0x2000` |
| `beforeSwap` | `BEFORE_SWAP_FLAG` | `1 << 7` = `0x0080` |
| `beforeSwapReturnDelta` | `BEFORE_SWAP_RETURNS_DELTA_FLAG` | `1 << 3` = `0x0008` |

`0x2000 | 0x0080 | 0x0008` = **`0x2088`**.

So the documented "hook address must end in `0x2088`" requirement is **precisely the encoding of the
hook's declared permissions** — not an arbitrary magic number. `utils/Create2HookDeployer` mines a salt
that yields an address with those bits, and `npm run verify:v4:preflight` checks them post-deploy. If
the address bits and the permissions ever disagreed, the PoolManager would reject the hook at pool
initialization. ✅ Verified consistent.

---

## 3. Hook callbacks

### `beforeInitialize`
Restricts both the pool and its opening price. The one-shot
`registerPool(key, expectedSqrtPriceX96)` stores a nonzero exact price. The key
must use this hook, the NARA/USDC pair, fee `3000`, and tick spacing `60`.
`_beforeInitialize` rejects any different key or price.

The callback intentionally does not require the owner as sender because the
legitimate PositionManager is the callback sender during seeding. Canonical
deployment leaves the hook unregistered until the final Safe executes
`registerPool`, exact `initializePool`, and the first full-range mint in one
atomic batch. This removes the public pre-seed interval; direct seeding is
disabled.

### `beforeSwap` — the fee algorithm
Called before the AMM math on every attempted swap through the registered Hook
pool. Supported exact-input swaps are charged; exact-output attempts revert.
Step by step (from the verified source):

1. **Exact-input only.** `params.amountSpecified >= 0` reverts `ExactOutputUnsupported`;
   `type(int256).min` reverts `AmountTooLarge`. The fee model is defined on exact-input swaps.
2. **Buy vs sell.** The input currency is `base` (USDC) → **buy**, or `token` (NARA) → **sell**; anything
   else reverts `InvalidTokenPair`.
3. **Depth = configured `protocolDepth`.** The hook captures the configured
   input-currency depth on that currency's first swap in a block and reuses the
   snapshot for the rest of the block. Live depth from `getLiquidity` and
   `getSlot0` remains available through `probeLiveDepth()` for monitoring only.
   A trader therefore cannot alter the fee basis by adding narrow liquidity,
   removing liquidity, or moving the price immediately before a swap.
4. **Per-block cumulative flow.** `_recordBlockFlow` accumulates `amountIn`
   across all same-input-currency swaps in the block and tracks the fee already
   charged. The cumulative fee function is evaluated once conceptually and
   each swap pays only the new delta. Splitting a gross input across wallets or
   transactions in one block therefore charges exactly the same aggregate fee,
   provided the gross input and currency are identical. A new block starts a
   new pressure horizon; this v4 design does not resist cross-block splitting.
5. **Tiered fee curve.** `_feeBps(curve, pressureAmountIn, depth)` selects a bps rate from the buy or
   sell curve based on `pressure = amountIn / depth`. The result is capped at the curve's `maxFeeBps`.
6. **Skim, the v4 way.** `poolManager.take(specified, address(vault), feeAmount)` pulls the fee in the
   **input currency** straight to the vault, and the hook returns
   `toBeforeSwapDelta(int128(feeAmount), 0)` so the PoolManager accounts for the skim. The remaining
   input proceeds into the normal AMM swap.
7. **Atomic, fail-closed accounting.** After `poolManager.take(...)`, the Hook calls
   `vault.recordPoolFee(...)` directly. If the Vault rejects or cannot record the
   fee, the complete PoolManager callback reverts, including the preceding take;
   custody and lifetime counters therefore cannot diverge silently. `registerPool`
   also requires the reciprocal Vault-to-Hook binding before the pool can activate.
8. **Quote semantics.** `quotePoolFee` returns the terminal marginal tier beside the authoritative
   integrated fee amount. `quotePoolFeeDetailed` also returns the effective rate derived from that
   amount. Interfaces must display the effective rate and label the tier only as marginal.

---

## 4. Fee curves (asymmetric by design)

Default tiers (set in the constructor; values shown are the documented defaults):

| Tier | Buy | Sell |
|------|-----|------|
| base | 5% | 5% |
| medium | 8% | 7% |
| high | 12% | 10% |
| extreme | 20% | 15% |
| **default operational cap** | **20%** | **20%** |

Buyers pay more under pressure than sellers. This is an intentional asymmetric
per-block fee policy; it is not a neutral AMM fee or a persistent launch-window tax.
The constructor caps both default curves at 20%. Governance may propose a different
curve up to the contract's absolute 50% ceiling, but it cannot activate until the
seven-day fee-update delay has elapsed. Operational material must therefore report
the active onchain curve rather than describe 20% as an immutable contract ceiling.

**Current active curve (post-timelock):** production later optimized the fee
curves via the seven-day timelock. Active buy curve: base 3% → medium 5% →
high 8% → extreme 12% (cap 12%). Active sell curve: base 5% → medium 8% →
high 12% → extreme 20% (cap 20%).

---

## 5. Vault routing — `NARALiquidityGrowthVault`

The vault receives every skim and routes it by **mode**:

| Mode | Behavior |
|------|----------|
| `Liquidity` | **default** — compound a balanced NARA/USDC subset into a full-range LP position through the no-swap **`NARALiquidityCompounderV4`**. The production adapter is validated and the Vault binding is permanently frozen. Unmatched inventory remains banked in the Compounder. |
| `Engine` | legacy enum value; `setRouteMode` permanently reverts `EngineTokenRoutingDisabled` |
| `Split` | legacy enum value; `setRouteMode` permanently reverts `EngineTokenRoutingDisabled` |
| `Genesis` | route USDC to the Genesis reward distributor |
| `GenesisSplit` | split USDC between Genesis rewards and LP |

The owner can move among the reachable modes, subject to their configuration
requirements. Engine ERC-20 routing cannot be re-enabled by the owner.

---

## 6. How consumers route through the pool

Any swapper interacting with the NARA/USDC pool pays the hook fee automatically. The **NARA basket**
package (separate Foundry repo) does this through its
`UniswapV4BasketAdapterV1`, which routes a basket's NARA slice through the pool via the Uniswap
**Universal Router** (v4 swap commands, exact-input). Every basket buy through
the canonical pool pays the hook fee into the vault. The adapter is a pure
consumer; it needs no hook permission bits of its own.

---

## 7. Verification status (2026-08-09)

- ✅ `getHookPermissions()` = `beforeInitialize + beforeSwap + beforeSwapReturnDelta` → address bits
  `0x2088`, matching the deploy/preflight requirement.
- ✅ Built on the canonical `BaseHook` from Uniswap v4-periphery.
- ✅ Exact-input-only, buy/sell detection, configured-depth block snapshots,
  cumulative fee deltas, and `maxFeeBps` caps.
- ✅ Fee skim via `BeforeSwapDelta` + `poolManager.take()` to the vault, followed
  by direct fail-closed `vault.recordPoolFee(...)` accounting in the same call.
- ✅ Single-pool authorization (`UnauthorizedPool` / `PoolNotRegistered`).
- ✅ Exact opening-price binding plus canonical fee/tick validation.
- ✅ Reciprocal vault/hook/compounder binding checks protect one-shot wiring.
- ✅ Covered by the focused mock suite and
  `NARALiquidityGrowth.real-v4.test.ts`, which deploys the actual Uniswap v4
  PoolManager and official test routers, moves live depth in both directions,
  and proves single-swap versus meaningful same-block split equality for buys
  and sells.
- ✅ Replacement vault prevents the deployed engine's ERC-20 accounting issue
  from being reached through pool-fee routing.
- ✅ Initial public flow plus twenty distinct-block buys and ten distinct-block
  sells reconciled Hook fees, Vault counters, ERC-20 transfers, and receipt
  blocks on Base. The matrices exercised 5%/8% buy tiers and the 5% sell tier;
  they do not substitute for live coverage of every same-block higher tier.
- ✅ At freeze block `49736809`, the bounded validation had added
  `99.999999999997037752 NARA` and `0.894127 USDC` to LP NFT `2898486`, adding
  liquidity `9455824137787`. The Vault binding freeze is receipt-pinned. Vault
  balances were zero; unmatched `1718.586695052747189931 NARA` and
  `24.518753 USDC` were banked in the Compounder. Later balances require a new
  readback.
- ✅ A later controlled full-inventory compound at Base block `50499085`
  increased LP NFT `2898486` to liquidity `4386316228001171`; Vault balances
  were zero and `28.423769295100595183 NARA / 2.326460 USDC` remained banked.
  See
  [`NARA-20260827-v4-full-inventory-compound.md`](releases/NARA-20260827-v4-full-inventory-compound.md).

The canonical record for findings #1–#5 is
[`NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`](NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md).
These internal fixes and tests do not convert the repository into an
independent audit or remove the operational gates in
[`CURRENT_STATE.md`](CURRENT_STATE.md).

**Scope of this evidence:** the Hook/Vault tax path is active and the recorded
initial flow, twenty-buy/ten-sell matrix, and same-block round trip reconciled.
The fresh convert-to-liquidity layer (`NARALiquidityCompounderV4`) is deployed,
source-verified, validation-compounded, and permanently bound to the Vault.
Recurring liquidity maintenance is active under a separately credentialed,
bounded `17,47` policy. Whole-product availability remains gated. See
[`NARA_V4_PROJECT_SCOPE.md`](NARA_V4_PROJECT_SCOPE.md).
