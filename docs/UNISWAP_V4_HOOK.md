# NARA Liquidity Growth Hook — Uniswap v4 Deep-Dive

> Source: [`contracts/v4/NARALiquidityGrowthHook.sol`](../contracts/v4/NARALiquidityGrowthHook.sol)
> · [`contracts/v4/NARALiquidityGrowthVault.sol`](../contracts/v4/NARALiquidityGrowthVault.sol)
> · [`contracts/v4/utils/Create2HookDeployer.sol`](../contracts/v4/utils/Create2HookDeployer.sol)
> Verified against code on **2026-06-08**.

NARA's liquidity home is a **single custom Uniswap v4 pool** (NARA/USDC). The pool's hook is not a
neutral fee rail — it is an **asymmetric, anti-gameable buy-pressure tax** that skims a fee from every
swap into a vault.

> **READ THIS FIRST — the mechanism is POL-first, not locker-first.** The vault's **default route mode
> is `Liquidity`** (`NARALiquidityGrowthVault` constructor sets `routeMode = RouteMode.Liquidity`). The
> skim is designed to **compound back into protocol-owned liquidity (POL) first**, building depth.
> Redirecting the skim to lockers (`Engine` / `Split` / `Genesis` / `GenesisSplit`) is a **later
> operator switch**, taken once the book is deep. Do **not** describe the hook as "a tax that funds
> lockers" — that is a later phase, not the default. (An earlier version of this doc led with the
> locker framing; it was wrong-ordered and corrected on 2026-06-29.)
>
> **✅ FLYWHEEL BRICK BUILT + FORK-VALIDATED (2026-06-29) — awaiting deploy only.** The hook and vault
> were always fully built; the POL stage is intentionally **pluggable** (the vault calls an external
> `ILiquidityCompounder.compound(...)` adapter, set via `vault.setCompounder`, lockable via
> `freezeCompounder`, hardened by `CompounderDidNotSpend` + `minLiquidityAdded` slippage guards). The
> production adapter now exists: **`contracts/v4/NARALiquidityCompounderV4.sol`** — full-range, no-swap,
> exact-spend, remainder-banking, POL custody, with a **7-day recovery timelock** (propose→wait→execute)
> so holders always get an exit window. Tested two ways: 8 unit tests through the **real vault**, **and
> a Base mainnet fork test** (`test/fork/NARALiquidityCompounderV4.fork.test.ts`) that adds real
> full-range liquidity through the **live** PoolManager + PositionManager + Permit2 — encoding certified
> end-to-end. **Still required before mainnet value:** deploy via
> `scripts/deployLiquidityCompounderV4.ts`, then `vault.setCompounder` + `freezeCompounder` (Safe).
> Until deployed + wired, `Liquidity` mode is still inert (`_compoundUnchecked` reverts with no
> compounder). `mocks/MockLiquidityCompounder.sol` remains a test-only stub. See §5 and CURRENT_STATE.md.

This document explains how the hook works and why it is correct.

---

## 1. Why a hook at all?

In a normal AMM, swap fees go to LPs. NARA redirects that flow to **lockers** (the people committing
time to the protocol). The hook lets NARA:

1. charge **more on buy pressure than sell pressure** (a deliberate policy, not a neutral fee), and
2. route the skim to a vault that can compound LP, feed the engine reward rails, or fund Genesis —
   all without redeploying the core contracts.

```
swap ──▶ hook (beforeSwap) ──skim fee in input token──▶ vault ──▶ {LP compound | engine rewards | Genesis}
                                                                        │
                                                                        ▼
                                                                  NARA lockers
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
Restricts which pool may use this hook: it calls `_requireRegisteredPool(key)`, and `_validatePoolKey`
reverts `UnauthorizedPool` unless `key.hooks == address(this)` and the pool id matches the single
registered pool. One hook, one pool — no rogue pools can attach.

### `beforeSwap` — the fee algorithm
Called before the AMM math on every swap. Step by step (from the verified source):

1. **Exact-input only.** `params.amountSpecified >= 0` reverts `ExactOutputUnsupported`;
   `type(int256).min` reverts `AmountTooLarge`. The fee model is defined on exact-input swaps.
2. **Buy vs sell.** The input currency is `base` (USDC) → **buy**, or `token` (NARA) → **sell**; anything
   else reverts `InvalidTokenPair`.
3. **Depth = `min(liveDepth, protocolDepth)`.** Live depth is probed from the pool
   (`getLiquidity` + `getSlot0`); protocol depth is an admin-set floor. Taking the **minimum** means a
   swapper **cannot inflate pool depth in the same block to cheapen their fee**.
4. **Per-block cumulative flow.** `_recordBlockFlow` accumulates `amountIn` across all swaps in the
   block and tracks the fee already charged. The fee is computed on **cumulative** pressure minus what
   was already paid — so **splitting one large swap into many small ones charges the same total**. No
   tier-gaming.
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

Buyers pay more under pressure than sellers. This is an **intentional buy-pressure tax** that funds
lockers — it is *not* a neutral AMM fee, and the protocol presents it honestly as policy.

---

## 5. Vault routing — `NARALiquidityGrowthVault`

The vault receives every skim and routes it by **mode**:

| Mode | Behavior |
|------|----------|
| `Liquidity` | **default** — compound NARA/USDC back into the LP position via the external compounder adapter to build depth. Production adapter: **`NARALiquidityCompounderV4`** (full-range, no-swap). Still **inert until deployed + `setCompounder`'d**. |
| `Engine` | route NARA to the engine emission reserve, USDC to the engine ERC-20 reward stream |
| `Split` | part to engine, part to LP |
| `Genesis` | route USDC to the Genesis reward distributor |
| `GenesisSplit` | split USDC between Genesis rewards and LP |

Mode is an operator lever — protocol economics can shift **without redeploying core contracts**.

---

## 6. How consumers route through the pool

Any swapper interacting with the NARA/USDC pool pays the hook fee automatically. The **NARA Baskets**
package (separate Foundry repo) does this through its
`UniswapV4BasketAdapterV1`, which routes a basket's NARA slice through the pool via the Uniswap
**Universal Router** (v4 swap commands, exact-input). Result: **every basket buy pays the hook tax →
funds NARA lockers**. The adapter is a pure consumer; it needs no hook permission bits of its own.

---

## 7. Verification status (2026-06-08)

- ✅ `getHookPermissions()` = `beforeInitialize + beforeSwap + beforeSwapReturnDelta` → address bits
  `0x2088`, matching the deploy/preflight requirement.
- ✅ Built on `BaseHook` (Uniswap v4-periphery) — the canonical, audited base.
- ✅ Exact-input-only, buy/sell detection, `min(liveDepth, protocolDepth)` and per-block
  cumulative-flow anti-manipulation, `maxFeeBps` caps.
- ✅ Fee skim via `BeforeSwapDelta` + `poolManager.take()` to the vault; best-effort vault accounting.
- ✅ Single-pool authorization (`UnauthorizedPool` / `PoolNotRegistered`).
- ✅ Covered by the Hardhat suite (`NARALiquidityGrowth.v4.test.ts`) and the project's Slither gate.

No correctness issues found in the hook on this pass. As with the rest of the protocol, an independent
human review is recommended before mainnet value — see [`../SECURITY.md`](../SECURITY.md).

**Scope of this ✅:** these checks cover the **hook and vault**. The convert-to-liquidity layer
(`NARALiquidityCompounderV4`) is now built and unit-tested (through the real vault + a faithful
PositionManager/Permit2 mock), but is **not yet certified end-to-end on mainnet**: it still needs
deployment, `setCompounder` wiring, and a Base fork test against the real PositionManager. Treat
"Liquidity mode" as built-and-tested but not-yet-operational until the compounder is deployed,
fork-validated, reviewed, and `setCompounder`'d.
