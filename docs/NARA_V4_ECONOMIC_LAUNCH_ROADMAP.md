# NARA v4 — Economic Launch Roadmap

Last updated: 2026-06-04.
This is the **single working roadmap**: what to launch, in what order, and why.
Operator commands live in `NARA_V4_LAUNCH_RUNBOOK.md` and `V4_LAUNCH_CHECKLIST.md`.
Baskets brand/strategy lives in `NARA_V4_BASKETS_LAUNCH_STRATEGY.md`.
This doc is the **economic ordering layer** that ties them together.

---

## The one rule that sets the order

Baskets are the **front door** (the brand, the thing users see first). They are **not** the
first thing built. A basket buy swaps NARA through the taxed v4 pool — no depth means
unusable slippage. And basket ETH fees only *visibly* reward lockers if locked weight
already exists (the engine **banks** ETH when locked weight is zero — not lost, but no proof).

So we build bottom-up and reveal top-down:

```
build order:   token → liquidity → lock UI → baskets → buy/sell UI
user sees:     baskets front door  ← sits on top of everything beneath it
```

---

## The numbers (decide these first — they bake in forever)

### Budget: ~$500

| Use | Amount | Why |
|---|---|---|
| Pool seed (paired USDC side) | ~$400 | This is the liquidity. Concentrated, thin but functional. |
| Gas + buffer | ~$80 | Base gas is cheap; keep a buffer for re-seeds. |
| Friends' buys | $50 × N (after launch) | Each buy deepens the pool and pays the tax that compounds into LP. |

### Launch price / FDV — your single biggest decision

- **Start LOW.** Recommend ~**$100k FDV** → **~$0.10 / NARA** on 1M supply.
- Why low: room to grow, cheap accumulation for you + friends, and a $500 pool against a
  $100k FDV looks honest. A high FDV against $500 of liquidity looks absurd and front-runs upside.
- The tax is the auto-compounder — it **thickens liquidity over time from a thin start**, so you
  do not need to dump supply or capital in on day one.

### 1M NARA allocation — proposed sweet spot

The current runbook default (`bond 289,970 / treasury float 10,030 / reserve ~700,000`) leaves
**almost no float to seed liquidity or airdrop** — 10k NARA ≈ $1k at launch. That's the gap you felt.
Bonds are **closed at launch anyway**, so trim the bond war chest to free real float:

| Slice | NARA | % | Why |
|---|---|---|---|
| Reward reserve (locker drip) | 650,000 | 65% | This **is** the product — the decades yield. Keep it fat. |
| Bond inventory (closed, opened later) | 180,000 | 18% | War chest to sell for ETH/treasury once NARA has a price. Trimmed from 290k. |
| Treasury float (liquidity seed + airdrop + buffer) | 80,000 | 8% | Seeds the pool, funds the airdrop. The float you were missing. |
| Ops / partnerships / bribes (vested) | 90,000 | 9% | Contributors, CEX, bribe seeding. Vest it. |

> Deviates from runbook defaults on purpose. **Confirm before the allocation deploy** — it's immutable after.

**Your three calls:** (1) launch FDV, (2) final allocation %, (3) airdrop yes/no.

---

## The roadmap

Each phase: **What · Why · How · Gate.** Don't start the next phase until the gate is green.

### P0 — Lock the numbers (½ day, no deploy)
- **What:** Decide launch FDV/price and final 1M allocation.
- **Why:** Every later step bakes these in immutably. Wrong here = unfixable cheaply.
- **How:** Confirm the two tables above. Set env (`V4_INITIAL_NARA_AMOUNT`, `V4_INITIAL_USDC_AMOUNT`, allocation vars).
- **Gate:** FDV + allocation signed off in writing.

### P1 — Token + Engine (core deploy)
- **What:** `NARALauncher` → `NARAToken` (1M fixed) + `NARAEngine` + reserve + vault + hook; pool registered.
- **Why:** Everything references the token. The engine is the profit-sharing core. Atomic deploy avoids a half-wired state.
- **How:** `npm run deploy:v4:base:usdc` → `v4:env:sync:write` → `verify:v4:preflight`.
- **Gate:** Preflight green, hook low bits `0x2088`, pool registered, vault mode = Liquidity.

### P2 — Liquidity (seed the taxed pool)
- **What:** Seed concentrated NARA/USDC LP (~$400 + matching NARA from float). Tax compounds into LP.
- **Why:** No depth = nothing tradable, no reason to buy NARA, baskets can't route. **This is the foundation everything sits on.**
- **How:** `seedV4Liquidity.ts` → `v4:env:sync:write` (LP token ID) → `smoke:v4`.
- **Gate:** Real buy + sell work, tax lands in vault, small-buy slippage acceptable.

### P3 — Lock / Unlock UI
- **What:** Rebuild the lock UI for v4 (lockboard or simple-ui) on engine via router/lens.
- **Why:** Locking is the **first demand sink**. To lock, people must **buy NARA** → buy pressure deepens the pool + pays tax. Lockers are the audience that receives every future fee. **This starts the flywheel before baskets exist** — day one they earn the NARA drip.
- **How:** Deploy router/lens/bribe (`deploy:v4:router:lens`, grant `REWARD_NOTIFIER_ROLE` to BribeRouterV4). Wire UI to `lens.getUserState` + `router.lock`/`syncEpochs`. Enforce the epoch-sync rule (block stale actions).
- **Gate:** A friend can buy → lock → see weight → claim the NARA drip.

### P4 — Baskets contracts
- **What:** Fee collector + 4 immutable basket managers (CORE / AI / FINANCE / CULTURE), all 5 adapters incl. UniswapV4.
- **Why:** Baskets are the **volume + fee engine** and the brand front door. They go in **after** depth (P2) and lockers (P3) so fees land on real locked weight instead of being banked.
- **How:** `DeployMainnetReady.s.sol`, set `NARA_V4_POOL_READY`, fork-test the v4 route against the real pool, set sane `minInputAmount`, verify each `configHash` on Basescan.
- **Gate:** Fork buy routes NARA at acceptable slippage; buy/sell fees route to engine.

### P5 — Buy / Sell basket UI (the front door goes live)
- **What:** Ship the swap-card baskets app, v4 env wired, neutral flow (no default basket).
- **Why:** The public product that drives **sustained fee volume → engine → lockers now earn ETH on top of NARA.** Last because it's only good once depth + lockers + contracts are all real.
- **How:** Set `VITE_` env (adapter v4, hook, pool fee, tick spacing, token), `deploy:cf:prod`, QA at 375px + desktop end-to-end on mainnet.
- **Gate:** Live mainnet buy + sell, fees confirmed in engine, lockers see ETH appear.

---

## The flywheel (why this order compounds)

```
basket trades + pool tax
   → fees route to engine (notifyEthRewards / depositRewards)
   → lockers earn ETH + NARA
   → demand to buy NARA and lock
   → pool deepens, tax compounds LP
   → baskets route cheaper → more volume → more fees
   → (loop)
```

It only spins once **depth (P2)** and **locked weight (P3)** exist. That's the whole reason
baskets (P4/P5) come after them, not before.

---

## Full ecosystem map (so nothing is a footnote)

Everything in the protocol falls into three buckets. "When do we launch X" depends on the bucket.

### Bucket A — built in v4, ships WITH the core (only question is "when to switch on")

| Thing | What it is | When |
|---|---|---|
| **veNARA NFTs** | Your lock *is* the NFT (`NARAPositionNFTV4`). Not a separate launch — it's how locking works. Bonds + locks mint them; stNARA/fractions wrap them. | Ships in core allocation layer (P3/P4). No separate event. |
| **Bribes** | `BribeRouterV4` — any external protocol can pay NARA lockers (Convex/Votium primitive). Dormant rail, not an event. | Deploy with router/lens (P3). "Launches" when a partner first uses it. |
| **Genesis NFTs** | Early-locker subset with a reward multiplier (extra ETH+USDC stream). | Ships with allocation layer; promote during launch window. |

### Bucket B — UI skin, not a new primitive

| Thing | What it is | When |
|---|---|---|
| **The grid (lockboard)** | 100-slot "Degen Grid" — first 100 lockers claim a scarce numbered slot. A FOMO/distribution skin on P3 locking, not a financial primitive. Currently wired to v3 (broken until rebuilt). | A *choice* for the P3 lock UI: plain page vs gamified grid. UI decision, never a protocol dependency. |

### Phase 6 — treasury scale-up (after the loop turns)

- **Open bonds.** Sell NARA at a discount, paid in **ETH/USDC**, delivered as a **vesting NFT position**. Bond buyers *give* the protocol ETH; they get discounted NARA that vests. This is how the protocol **acquires treasury + protocol-owned liquidity without dumping NARA on market** (OlympusDAO-style) — converts the 180k bond inventory into real assets. **Why wait:** a discount needs a market price to discount from, and demand to absorb the NARA. Opening early = selling into a void. Gate: P2 depth + P3 lockers + P5 volume proven. Operator-gated, `NARA_V4_BOND_OPENING_CRITERIA.md`.
- **Airdrop to basket users.** Carve from the 80k float; rewards real usage, not farming.
- **Switch vault routeMode to Split.** Send part of the pool tax to lockers as ETH (trade-off: less LP compounding, more locker yield). Lever, not default.

### Bucket C — NOT built in v4 (archived v3, need a real port, never gate launch)

These need a **new contract written** under `contracts/v4/`, not a config flip. Source: `archive/legacy-v3/PORTING_ROADMAP.md`. None are scheduled.

| Thing | What it is | When |
|---|---|---|
| **Sponsor Hub** | Portable sponsor layer — external games/dApps receive NARA prize funding without holding principal; repoint a campaign without moving funds. B2B funding rail. Built+tested on v3, never deployed, no v4 version. | **Late.** Only matters once external games/partners want NARA sponsorship. Port when a real partner asks. |
| **Lotto** | Epoch lotto, VRF draw weighted by locked weight, sponsor-funded jackpot. v3 archived. | Post-traction game lane. Needs a v4 port + VRF wiring. |
| **Arena (BurnRun)** | Burn-rate competition game backed by NARA locks. v3 archived. | Post-traction game lane. v4 port. |
| **MisterMint** | Retroactive pro-rata distributor (historical program). | Only if the program is revived. |

### Composability (stNARA / Pendle SY / fractions)

**Built and tested** (`contracts/v4/composability/`), **not deployed.** This includes the NAV oracle
the integrations need: `NARAStakingPoolV4.exchangeRateWad()` (NARA value per stNARA share) and the
full Pendle SY adapter `NARAStakingPoolSYV4` (`exchangeRate()`, `assetInfo()`, reward indexes). The
code is done — it is **not** blocked on a missing design piece.

What is genuinely outstanding before deploy is **ops + external**, not contracts:
- **Seed a NARA/stNARA AMM pool** for an instant-exit path (a liquidity action, not a contract to
  write — without it, exit is via the redemption queue).
- **Pendle PT/YT market** — Pendle deploys this on top of the already-built SY contract (external
  dependency; see the deploy checklist in `scripts/deployComposabilityV4.ts`).
- A separate **market-price/TWAP oracle** is only needed later for lending integrations, and depends
  on the AMM pool existing first.

Not launch scope — it sits on top of veNARA NFTs after TVL exists.

---

## What this does NOT change

- Operator gates in `NARA_V4_LAUNCH_RUNBOOK.md` / `V4_LAUNCH_CHECKLIST.md` — they are the command source of truth. This doc orders *products*; those order *commands*.
- Protocol safety standards in repo `CLAUDE.md` — all fees route to engine, all setters capped.
- The neutral-UI rules — no recommended/best/popular, equal weight, no asset advice.
- Bonds stay closed at launch.
