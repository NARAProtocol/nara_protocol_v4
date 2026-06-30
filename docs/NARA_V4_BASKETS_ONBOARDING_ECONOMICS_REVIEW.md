# NARA Baskets — Onboarding, Economics & Funnel Review (Elite)

Last updated: 2026-07-01.
Audience: protocol operator, frontend team, growth, legal review.
Scope: make Baskets the mass-onboarding front door — **noob-friendly, compliant, easy** — with one
prime directive: **do not lose the customer until he buys.**

Grounded in: the baskets contracts (`nara-category-baskets-v1/src/`), the live frontend
(`apps/nara-baskets/src/app.tsx`, ~3,410 lines; **RainbowKit** `getDefaultConfig` — wallet-list modal,
no embedded/email-first, no paymaster/on-ramp/batching), the baskets strategy/legal/readiness
docs, and 2026 onboarding/index-product best practices (sources at the end). This is an internal
strategy doc — it does **not** propose user-facing copy that violates the neutral-choice rules.

> **Status of the product vs the funnel:** the contracts are well-built (immutable manager,
> exact-transfer enforcement, no admin) and the buy/sell/referral UI exists. The gap is the **funnel
> before the UI matters** (wallet, funds, gas) and a few **permanent economic choices** that are
> locked at the immutable deploy. Fix the funnel in the frontend (iterable); decide the economics
> before deploy (not iterable).

---

## 0. Prime directive — "do not lose the customer until he buys"

Every step between a cold visitor and their first confirmed buy is a drop-off point. Industry data:
**traditional Web3 onboarding loses 90%+ of users before their first transaction.** The job is to
remove every reason to leave, at every step, while staying inside the compliance guardrails. The rest
of this doc is organized around that funnel.

---

## 1. The funnel drop-off map (the core)

Each row = a step, the way a brand-new user drops, and the fix. ✅ = present today, ❌ = missing,
⚠️ = present but weak.

| # | Step | How a noob drops today | Fix | State |
|---|---|---|---|---|
| 1 | **Land** | Must connect a wallet before seeing anything of value | **Try-before-connect**: show baskets, contents, fees, and a live "you'd get ~X" preview with zero wallet | ⚠️ |
| 2 | **Understand** | "What's a basket? What's NARA? What's the risk?" — jargon, no explainer | Factual, non-advice explainer layer (allowed under neutral-choice): what it is, fees, risks, "self-directed" | ❌ |
| 3 | **Get a wallet** | Needs MetaMask + a seed phrase — the 90% cliff | **Embedded wallet** (email / passkey, non-custodial) — one tap, no extension, no seed phrase | ❌ |
| 4 | **Get funds** | Needs USDC *on Base* — can't get it | **Fiat on-ramp** (card → native USDC delivered to their Base address) | ❌ |
| 5 | **Get gas** | "I have USDC but the tx fails" — needs ETH for gas | **Paymaster** (gasless) or pay-gas-in-USDC | ❌ |
| 6 | **Approve** | wrap → approve → buy = 2–3 confirmations, confusing | **Batch** approve+buy into one confirmation (smart-wallet `wallet_sendCalls` / 4337 userOp) or Permit2 | ⚠️ |
| 7 | **Quote/slippage** | Stale quote → cryptic revert | Auto-refresh quote, conservative default slippage, map every revert to plain language, auto-retry | ⚠️ |
| 8 | **Confirm** | Surprise fees | Clear all-in cost breakdown (buy fee + swap + NARA hook tax + slippage) | ✅ (mostly) |
| 9 | **Success** | "Did it work? Now what?" | Strong success state + **shareable receipt card** + portfolio link | ⚠️ |
| 10 | **Hold/exit** | Later can't afford gas to **sell** | **Sponsor exits too** (or USDC-gas) — otherwise the noob is trapped holding | ❌ |

**The four ❌ at steps 3/4/5/10 are the whole ballgame.** They're all solved by one stack
(embedded wallet + paymaster + on-ramp), and your readiness doc already *plans* it (gate G4-8) — it
just isn't built in the app. See §3.

---

## 2. Sharp edges / gotchas (the things that quietly lose the customer)

These are the non-obvious ones. Several are **launch-breaking** for the noob segment specifically.

1. **`_safeMint` + smart-wallet compatibility (VERIFIED, must stay a gate).** The manager mints the
   receipt with `_safeMint(receiver)` (line 589). If the receiver is a contract wallet that does **not**
   implement `onERC721Received`, **every basket buy reverts at the mint** — for exactly the smart-wallet
   users you onboard. **Coinbase Smart Wallet is safe** (it inherits Solady's `Receiver` mixin →
   returns the magic value). **Gate:** any embedded/smart-wallet provider must be verified
   ERC-721-receiver-compatible before it touches the buy path; re-verify if you ever switch providers.

2. **On-ramp must deliver the EXACT allowlisted token, on Base, to the user's own address.** The
   manager's `paymentTokenAllowed` set is **immutable** (native USDC `0x833589fCD6...`). If the on-ramp
   delivers **USDbC** (bridged), Ethereum-mainnet USDC, or to a **custodial** Coinbase balance, the buy
   fails or the user has to bridge/withdraw first → drop. Configure the on-ramp for **native Base USDC →
   embedded wallet address**.

3. **Sponsor the EXIT, not just the buy.** A paymaster that only sponsors the buy leaves a noob unable
   to afford gas to **sell/withdraw** later — they're trapped. "Easy + spread risk" requires sponsored
   (or USDC-gas) **sells and withdraws** too.

4. **Paymaster policy = a drain vector if too broad.** Sponsoring gas means you pay for users' txs.
   The CDP Paymaster policy must **allowlist only** the manager + the adapters + `approve`/`wrap` (per
   readiness G4-8) — never arbitrary calls, or your gas budget gets drained. Add per-user/day caps.

5. **Value display needs an off-chain price feed.** There's **no on-chain oracle** (by design). The
   app shows allocations in payment-token units; a noob can't see "current value / PnL" without a price
   service. Missing → "did I make or lose money?" confusion → churn. Add a read-only price feed for
   display only (never into mint/redeem math).

6. **Referral attribution survives wallet creation + on-ramp redirects.** A referral link that brings a
   noob must carry the `referrer` through embedded-wallet signup and the on-ramp redirect, or attribution
   is lost at exactly the moment it's earned. Persist it (URL param → storage → buy params).

7. **Account recovery.** Email/passkey wallets need a recovery story (lost device/email). CDP handles
   it, but it must be surfaced — "how do I get back in" is a retention cliff for noobs.

8. **Non-custodial only (compliance + UX).** The embedded wallet must be **non-custodial** (MPC/passkey),
   or *you* become a custodian (regulatory). It also must be self-custody for the "we are not a
   custodian / not a manager" legal posture. CDP embedded wallets are non-custodial — keep it that way.

9. **Atomic-buy reverts need friendly mapping.** A basket buy is atomic — if any swap leg fails the
   whole thing reverts (safe!), but the noob sees a raw revert. Every revert (slippage, stale quote,
   token-not-allowed, deadline) must map to one plain sentence + a retry.

10. **Minimums must line up.** On-ramp minimums ($5–30 + fees), `minInputAmount` on the basket, and
    gas economics must be coherent — a $5 noob buy that's 40% eaten by on-ramp + fees is a bad first
    experience. Decide a sane minimum and show the all-in before they pay.

11. **Mobile / in-wallet-browser.** Most noobs are mobile. The Vite SPA must be flawless inside the
    Coinbase Wallet and MetaMask in-app browsers, and ideally a PWA. Embedded wallet removes the
    extension dependency entirely (big mobile win).

12. **State preservation.** If a user drops at "approve" and returns, the app should resume where they
    were, not reset. Lost progress = lost customer.

---

## 3. The #1 lever — CDP embedded wallet + Paymaster + on-ramp (integration spec)

This is the concrete plan to close funnel steps 3/4/5/6/10 against the **existing** app. Target: a
brand-new user goes **email → card → owns a basket** without ever seeing a seed phrase or buying ETH.

### 3.1 Wallet (step 3)
- Add **Coinbase CDP Embedded Wallet** (email/SMS/passkey, non-custodial, smart account) as the primary
  connector in `main.tsx`, alongside the existing injected/WalletConnect (keep those for power users).
- Default the smart account to **Base**. It's ERC-721-receiver-safe (§2.1), so the receipt mints fine.
- Surface a one-line recovery explainer.

### 3.2 Gas (steps 5 + 10)
- Wire the **CDP Paymaster** so the **first buy is gasless**, and **sells/withdraws are sponsored too**
  (or pay-gas-in-USDC).
- **Sponsorship policy (critical):** allowlist exactly — the manager (`buyBasket`, `sellBasket`,
  `sellBasketPartial`, `withdrawUnderlying`, `withdrawUnderlyingPartial`, `claimReferralReward`), the
  adapters, USDC `approve`, WETH `wrap`/`approve`. Nothing else. Add per-address daily caps to bound the
  gas budget.

### 3.3 Funds (step 4)
- Add the **Coinbase / CDP on-ramp** (card/Apple Pay → **native Base USDC → the user's embedded-wallet
  address**). Pre-fill the amount from what they typed in the buy box.
- KYC/sanctions are handled by the on-ramp provider (offloads OFAC/AML — see §6).

### 3.4 One-tap buy (step 6)
- With the smart account, **batch `approve` + `buyBasket` into a single `wallet_sendCalls`** (EIP-5792)
  so the user confirms **once**. Eliminates the wrap/approve/buy multi-tx confusion.
- Keep the existing self-advancing CTA as the fallback for injected wallets.

### 3.5 Result (steps 1/2/9)
- Try-before-connect preview (read-only, no wallet), factual explainer, strong success state + share
  card. None of these need the wallet stack — ship them in parallel.

**Net:** the four ❌ funnel steps collapse into "sign in with email → tap Buy." That is the difference
between a niche dApp and "the place everyone onboards."

---

## 4. The idle-NARA fix — graduation / auto-lock (the economic flywheel)

**The problem:** every basket buy buys NARA (the moat), but that NARA **sits inert in the receipt** —
not locked, not earning engine rewards. The flagship onboarding product creates NARA *buy pressure* but
**doesn't convert buyers into lockers** (the flywheel that gives NARA real yield). Index Coop's own
lesson: *incentivize behaviors that add value, not just TVL.*

**Hard constraint:** the manager is **immutable** and holds the NARA inert. You **cannot** make the
*in-basket* NARA productive on the current contract. Two real paths:

### 4.1 Near-term — Graduation router (move NARA out to a lock)
A thin, optional "graduate" action: convert a basket position (or just its NARA slice) into a **NARA
engine lock** (a position NFT that earns real yield). Because the receipt is **owner-only / non-delegable**
(no operators), the router cannot pull from the receipt on the user's behalf. Two implementable shapes:
- **Frontend macro (no new contract):** with the smart account, batch `withdrawUnderlyingPartial(NARA)`
  + `engine.lock(NARA, duration)` into one confirmation. Simplest; ships with the wallet work.
- **Graduation router contract:** user transfers the receipt to the router (owner-initiated transfer is
  allowed), router atomically withdraws underlying, locks the NARA into the engine **for the user**,
  returns the non-NARA assets, and the user gets a position NFT. More moving parts; needs its own audit;
  trusted-intermediary-within-one-tx model.

### 4.2 Durable — a V2 manager that auto-locks the NARA slice on buy
The real fix is a **future basket manager** where the NARA slice is auto-locked into the engine at buy
time (basket buyer becomes a locker automatically; the lock yield optionally compounds back). This is a
new immutable contract (V2 design + audit) — **not** a change to the current one. Flag it as the
highest-value economic V2 item.

**Recommendation:** ship the **frontend graduation macro** at/near launch (cheap, uses the smart-wallet
batching), and scope the **V2 auto-lock manager** as the durable answer. Either way, the "why is my NARA
doing nothing?" complaint is foreseeable — get ahead of it.

---

## 5. Economics — the permanent decisions to lock before deploy

Because the manager is immutable, these are **one-shot, per-basket, forever** choices. Decide them
explicitly before deploying launch baskets.

| Decision | Tension for a mass-onboarding product | Note |
|---|---|---|
| **Buy/sell fee (≤1% each)** | All-in round-trip = buy fee + per-asset DEX fees + **NARA hook tax (5%+) on the NARA slice** + slippage, then the same on exit. Several % before the market moves. | Index products' value prop is *cheaper than buying constituents*; Index Coop even eats rebalancing cost. NARA passes all cost to the user. Model a real $100 buy. **Immutable.** |
| **Holding fee (≤2%/yr)** | A streaming fee on a "park here" product silently **decays** a dormant position — combined with idle NARA, a passive holder loses to fees. | Decide if the decay/reputation cost is worth it for the onboarding segment. **Immutable.** |
| **Referral share (≤50%)** | Self-referral via an alt wallet leaks the share back to savvy buyers (~30% effective fee cut). | Accept or lower. **Immutable.** |
| **Idle NARA** | Buyers' NARA earns nothing in-basket (see §4). | Needs graduation/auto-lock externally. |
| **Adapter set** | If a DEX dies or a better route appears, the basket is stuck with its adapters. | **Immutable per basket.** |
| **Non-marketable receipt** | No collateral, no marketplace, no P2P sale → composability dead-end. | Deliberate anti-phishing trade. **Permanent.** |

**Missing economic primitives (frontend/V2, not blocked by immutability):** recurring buy / **DCA**
(the #1 retail wealth behavior), auto-compound, yield on idle stable legs.

---

## 6. Compliance overlay (must stay true through the whole funnel)

"Easy + grow everyone" pulls toward managed-fund framing; the legal posture pulls the other way. The
funnel must optimize **step-completion**, never **asset-selection**.

- **Neutral-choice (workspace rule, load-bearing):** guide the **navigation** aggressively (make the
  next step obvious) but keep **basket choice neutral** — equal-weight cards, no `recommended / popular /
  trending / best / highest return`, no sort that implies a winner. A zero-drop funnel is *compatible*
  with this as long as you're removing friction, not steering the pick.
- **Securities language:** factual, self-directed-purchase framing only — no `yield / invest / returns /
  guaranteed / safe`. Under the no-geo-fence posture, **language is the only protection** — every funnel
  string (including embedded-wallet/on-ramp screens you control) must comply.
- **Custody:** embedded wallet must be **non-custodial** (§2.8) — you are not a custodian and not a
  manager. Don't undo this with a custodial shortcut.
- **Sanctions/AML:** the **on-ramp provider performs KYC/sanctions screening** — this offloads much of
  the OFAC/AML burden to a regulated counterparty. Keep the OFAC infra block (Cloudflare WAF) regardless.
- **Paymaster = you paying for user actions:** keep sponsorship narrowly scoped (§3.2) and documented so
  it can't be read as operating a service beyond a self-directed interface.
- **Risk disclosure + clickwrap ToS** on first connect (already an action item A-08) — make it part of
  the embedded-wallet signup, not a buried footer.

---

## 7. Prioritized plan

**P0 — funnel (before/at launch; the "don't lose the customer" stack):**
1. CDP **embedded wallet** (email/passkey, non-custodial) — verified ERC-721-receiver-safe.
2. CDP **Paymaster** — gasless **buy and exit**, narrowly-scoped policy + caps.
3. **Fiat on-ramp** — card → native Base USDC → embedded-wallet address.
4. **One-tap batched** approve+buy (EIP-5792).
5. Try-before-connect preview · factual explainer · total revert→plain-language mapping · success +
   **shareable receipt card** · mobile/in-wallet-browser polish · referral attribution persistence.

**P1:** graduation macro (basket→lock) · DCA/recurring · portfolio + price/PnL display · tax/CSV export ·
quote-builder redundancy + MEV-protected buys.

**P2:** notifications · multi-language · more baskets · V2 auto-lock manager · secondary-market/lending rethink.

**Never (V1, already decided):** rebalance · leverage · governance · oracle mint/redeem.

**Permanent decisions to lock before the immutable deploy (§5):** fee calibration, holding fee,
referral share, idle-NARA strategy, adapter set, receipt non-marketability.

---

## 8. Verdict

The contracts are strong and the buy UI exists. The reason "everyone uses it" hasn't happened yet is
**the funnel stalls at the wallet/funds/gas wall** — and that wall is removable with one well-scoped
stack (embedded wallet + paymaster + on-ramp), which you've already half-planned. The two things that
are **not** reversible — **fee calibration** and **idle NARA** — must be decided **before** the immutable
deploy. Fix the funnel in the frontend; lock the economics with intent.

---

### Sources
- [Coinbase Smart Wallet source (Solady `Receiver` → ERC-721 safe)](https://github.com/coinbase/smart-wallet)
- [Openfort — embedded wallets / smart accounts (2026)](https://www.openfort.io/blog/embedded-wallet-explained)
- [Coinbase Smart Wallet announcement](https://www.coinbase.com/blog/a-new-era-in-crypto-wallets-smart-wallet-is-here)
- [CDP Paymaster — gasless on Base](https://docs.cdp.coinbase.com/paymaster/guides/paymaster-masterclass)
- [Top fiat on-ramps 2026](https://www.quicknode.com/builders-guide/best/top-9-fiat-onramps)
- [Modern crypto onboarding stack (Fireblocks)](https://www.fireblocks.com/blog/modern-crypto-stack)
- [Index Coop / DPI (index-product economics)](https://www.gemini.com/cryptopedia/what-is-index-coop)
- [Structured-product decay mechanics](https://www.crystalfunds.com/insights/leveraged-etfs-decay-understanding-mechanics-and-risks)
