# NARA Liquidity Growth Hook — Uniswap v4 Deep-Dive

> Source: [`contracts/v4/NARALiquidityGrowthHook.sol`](../contracts/v4/NARALiquidityGrowthHook.sol)
> · [`contracts/v4/NARALiquidityGrowthVault.sol`](../contracts/v4/NARALiquidityGrowthVault.sol)
> · [`contracts/v4/utils/Create2HookDeployer.sol`](../contracts/v4/utils/Create2HookDeployer.sol)
> Verified against code and the real Uniswap v4 PoolManager test on
> **2026-07-28**.

NARA's liquidity home is a **single custom Uniswap v4 pool** (NARA/USDC). The pool's hook is not a
neutral fee rail — it is an **asymmetric pressure fee** that skims a fee from every
swap into a vault.

> **READ THIS FIRST — the mechanism is POL-first, not locker-first.** The vault's **default route mode
> is `Liquidity`** (`NARALiquidityGrowthVault` constructor sets `routeMode = RouteMode.Liquidity`). The
> skim is designed to **compound back into protocol-owned liquidity (POL) first**, building depth.
> The replacement vault may later redirect USDC to `Genesis` or
> `GenesisSplit`. `Engine` and `Split` are legacy enum values that permanently
> revert because the deployed engine's ERC-20 reward denominator can
> under-allocate after an active-position extension. Do **not** describe the
> hook as "a tax that funds lockers."
>
> **PRE-SEED REPLACEMENT REQUIRED (2026-07-28).** Stage A deployed the original
> hook, vault, and compounder, but the pool remains uninitialized and holds no
> liquidity. The corrected hook and vault now require fresh addresses. The POL
> adapter remains intentionally pluggable through
> `ILiquidityCompounder.compound(...)`, with exact-spend checks, minimum-output
> protection, remainder banking, POL custody, and a seven-day recovery
> timelock. Deploy and verify the corrected hook/vault/compounder trio, run the
> real-pool smoke test, then freeze the compounder before public activation.

This document explains how the hook works and why it is correct.

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
Called before the AMM math on every swap. Step by step (from the verified source):

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
   provided the gross input and currency are identical.
5. **Tiered fee curve.** `_feeBps(curve, pressureAmountIn, depth)` selects a bps rate from the buy or
   sell curve based on `pressure = amountIn / depth`. The result is capped at the curve's `maxFeeBps`.
6. **Skim, the v4 way.** `poolManager.take(specified, address(vault), feeAmount)` pulls the fee in the
   **input currency** straight to the vault, and the hook returns
   `toBeforeSwapDelta(int128(feeAmount), 0)` so the PoolManager accounts for the skim. The remaining
   input proceeds into the normal AMM swap.
7. **Best-effort accounting.** `vault.recordPoolFee(...)` is wrapped in `try/catch` and emits
   `PoolFeeRecordFailed` on failure — **fee accounting can never block a user's swap**.

---

## 4. Fee curves (asymmetric by design)

Default tiers (set in the constructor; values shown are the documented defaults):

| Tier | Buy | Sell |
|------|-----|------|
| base | 5% | 5% |
| medium | 8% | 7% |
| high | 12% | 10% |
| extreme | 20% | 15% |
| **hard cap** | **25%** | **20%** |

Buyers pay more under pressure than sellers. This is an intentional asymmetric
fee policy; it is not a neutral AMM fee.

---

## 5. Vault routing — `NARALiquidityGrowthVault`

The vault receives every skim and routes it by **mode**:

| Mode | Behavior |
|------|----------|
| `Liquidity` | **default** — compound NARA/USDC back into the LP position via the external compounder adapter to build depth. Production adapter: **`NARALiquidityCompounderV4`** (full-range, no-swap). Still **inert until deployed + `setCompounder`'d**. |
| `Engine` | legacy enum value; `setRouteMode` permanently reverts `EngineTokenRoutingDisabled` |
| `Split` | legacy enum value; `setRouteMode` permanently reverts `EngineTokenRoutingDisabled` |
| `Genesis` | route USDC to the Genesis reward distributor |
| `GenesisSplit` | split USDC between Genesis rewards and LP |

The owner can move among the reachable modes, subject to their configuration
requirements. Engine ERC-20 routing cannot be re-enabled by the owner.

---

## 6. How consumers route through the pool

Any swapper interacting with the NARA/USDC pool pays the hook fee automatically. The **NARA Baskets**
package (separate Foundry repo) does this through its
`UniswapV4BasketAdapterV1`, which routes a basket's NARA slice through the pool via the Uniswap
**Universal Router** (v4 swap commands, exact-input). Every basket buy through
the canonical pool pays the hook fee into the vault. The adapter is a pure
consumer; it needs no hook permission bits of its own.

---

## 7. Verification status (2026-07-28)

- ✅ `getHookPermissions()` = `beforeInitialize + beforeSwap + beforeSwapReturnDelta` → address bits
  `0x2088`, matching the deploy/preflight requirement.
- ✅ Built on `BaseHook` (Uniswap v4-periphery) — the canonical, audited base.
- ✅ Exact-input-only, buy/sell detection, configured-depth block snapshots,
  cumulative fee deltas, and `maxFeeBps` caps.
- ✅ Fee skim via `BeforeSwapDelta` + `poolManager.take()` to the vault; best-effort vault accounting.
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

The canonical record for findings #1–#5 is
[`NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`](NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md).
These internal fixes and tests do not convert the repository into an
independent audit or remove the operational gates in
[`CURRENT_STATE.md`](CURRENT_STATE.md).

**Scope of this ✅:** these checks cover the **hook and vault**. The convert-to-liquidity layer
(`NARALiquidityCompounderV4`) is deployed and wired on Stage A but not frozen.
Because the corrected hook and vault require fresh addresses, the replacement
trio must be deployed, wired, verified, smoke-tested on the initialized pool,
and only then frozen before public activation.
