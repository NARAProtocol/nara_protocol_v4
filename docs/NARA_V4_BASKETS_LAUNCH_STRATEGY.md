# NARA v4 — Baskets as the Crown Launch

Last updated: 2026-05-28.
Audience: protocol operator, future contributors, any AI continuing the work.
Source code: `nara-category-baskets-v1/` (separate Foundry package).

This document defines NARA Baskets as the **primary public launch surface** for v4. The lockboard becomes the tier-2 advanced surface; baskets become the front door for cold users.

---

## TL;DR

- **Existing code**: `nara-category-baskets-v1/` is built. 46 Foundry tests pass. Canonical product is `NARAImmutableBasketPositionManagerV1` — ERC-721 receipts, mandatory NARA in every basket, no admin, no rebalance, no governance.
- **Launch positioning**: baskets ship first as the public entry point. Lockboard is the second-tier surface for users who understand NARA already.
- **The flywheel**: every basket buy routes fees through the fee collector, and the engine handles protocol rewards separately from the basket product. Basket pages must not describe this as a return, yield, or reason to choose a basket.
- **What's missing for launch**: a concrete swap adapter (Base Uniswap V3 / 0x), curated basket configs with verified token addresses, the frontend app, the executor-selector allowlist on the fee collector, Foundry environment on the deployer machine.
- **Differentiator**: the receipt manager enforces a mandatory NARA allocation in every basket. Describe this factually; do not frame it as a return promise.

---

## What is already built

Located in `nara-category-baskets-v1/`. Separate Foundry package by design — does not live in the Hardhat repo's compile path.

### Contracts

| File | Lines | Purpose |
|---|---|---|
| `NARAImmutableBasketPositionManagerV1.sol` | 592 | Canonical one-click receipt manager. One immutable contract per basket. ERC-721 receipt per user position. |
| `NARAIndexFeeCollectorV1.sol` | 214 | Routes fees into `engine.depositRewards` (NARA) or `engine.notifyEthRewards` (ETH). Holds `SWAPPER_ROLE`, `REDEEMER_ROLE`, `EXECUTOR_MANAGER_ROLE`. |
| `CategoryIndexSuiteV1.sol` | 722 | Static pro-rata ERC-20 vault. **Not** the canonical one-click product. Optional module. |

### What the receipt manager enforces (constructor-fixed)

- Assets list + weights (sum to 10,000 bps)
- `requiredAsset = NARA` and `minRequiredAssetWeightBps`
- Allowed payment tokens (USDC mandatory)
- Allowed swap adapters (immutable)
- Buy/sell fee in bps (hard cap 100 bps = 1%)
- Fee recipient (must be `NARAIndexFeeCollectorV1`)
- `maxWeightDeviationBps` (budget allocation tolerance, not NAV)

### What is intentionally NOT in V1

Staking, lockups, auto-sell, stop losses, governance, multisig custody, upgradeable vaults, lending, leverage, rebalance, oracle-based mint/redeem, percentage-based partial basket sells, fungible ERC-20 basket shares, NAV oracle, TWAP checks, position merging/splitting, cross-chain routing.

V2 only after separate design + audit. V1 stays receipt-based.

### Tests

```bash
cd nara-category-baskets-v1
forge build
forge test --fuzz-runs 1000
```

Status as of 2026-05-14: 46 tests passing, `forge fmt --check` clean, `via_ir = true` under solc 0.8.34.

### Documentation already in package

| File | Covers |
|---|---|
| `docs/NARA_INTEGRATION.md` | Engine wiring, fee routes, deployment order |
| `docs/RECEIPT_BASKET_FLOW.md` | Canonical buy/sell flow with execution checks |
| `docs/EXAMPLE_BASKETS.md` | Config templates for AI, Base, DeFi, Meme, RWA |
| `docs/SECURITY_CHECKLIST.md` | Pre-deploy checklist |
| `docs/VALIDATION_STATUS.md` | Test run snapshot |
| `docs/IDE_TASK.md` | Instructions for future AI/IDE sessions |

---

## Competitive landscape (verified 2026-05-28)

| Product | Model | Why NARA does better |
|---|---|---|
| **Reserve DTFs** (Base) | Fungible ERC-20, governance rebalances, creator fee splits up to 5% | NARA: immutable per basket, no governance, no rebalance keeper. No rugpull surface from a malicious governance vote. |
| **Index Coop** (DPI/MVI/iETH) | Fungible NAV-priced shares, Ethereum-heavy | NAV-priced indices need reliable oracles. NARA receipts record exact spot execution, but launch curation must still reject fragile or thin-liquidity tokens. |
| **Phuture / Alongside** | Fungible, TWAP-mint, ~$50M AUM peak | TWAP adds price-manipulation surface on thin assets and creates mint/redeem latency. NARA receipts are instant + spot-priced. |
| **Set Protocol / TokenSets** | Strategy meta-layer with manager keys | Manager custody risk. NARA: no manager, user holds the receipt and can use full or partial raw withdrawal when the selected token contracts transfer normally. |
| **Glider Finance** | No-code strategy builder, Base-native | Glider is automation, not curation. NARA is curated category baskets with a mandatory ecosystem allocation. |
| **dHEDGE / Toros** | Managed strategies, leveraged products | Manager-controlled custody and strategy mutation. NARA is immutable per basket. |
| **Enzyme / Avantgarde** | Institutional smart wallets, complex permissions | Enterprise tooling. NARA is consumer-facing one-click. |
| **Coinbase / Robinhood baskets** | Centralized custody, fiat onramp | Borrow their UX (named categories, one-click). Replace their custody (on-chain receipt NFT, self-custody). |
| **Yearn / Beefy vaults** | Managed vault strategies | Different product. NARA baskets are fixed-composition receipt baskets. Basket UX must not promise returns. |

### The unique moat

**Mandatory protocol-token allocation in every basket.** No competitor does this. Reserve DTFs allow basket creators to set any composition. Index Coop's baskets are sector-pure. Coinbase baskets are pure-theme. NARA contractually enforces that every basket includes the NARA token at or above `minRequiredAssetWeightBps`.

Two consequences:

1. **Distribution**: every basket buy is a NARA buy. Every basket sell is a NARA sell. NARA gets organic, scaled buy/sell pressure from a product that solves a different user need.
2. **Conversion funnel**: every basket holder now owns NARA, even if they don't know what it is yet. That's the on-ramp to the lockboard.

---

## The crown launch architecture

### Public surface order

```
naraprotocol.io (front door)
  └─ Baskets (default tab) — Choose a basket, review tokens and fees, confirm
  └─ Locks (advanced tab) — Separate NARA lock flow with its own review
  └─ Bonds (operator-gated tab) — For users who want discounted NARA on a maturity schedule
```

This reverses today's order. Today the lockboard is the front door. After this launch, baskets are.

### The funnel

```
1. Cold user lands on naraprotocol.io
2. Sees equal basket cards: CORE / AI / FINANCE / CULTURE
3. Clicks "View Basket" on one card
4. Connects Coinbase Smart Wallet (or fiat onramp via Coinbase Pay / Apple Pay)
5. One signature, one transaction, paymaster-sponsored
6. Owns ERC-721 receipt — sees their position with exact token amounts
7. Notices NARA is one of the 5 holdings in the basket
8. Receipt UI shows the NARA amount as one underlying token in the receipt
9. Click-through to lockboard. Locks the NARA share. Becomes a locker.
10. Lockboard handles any separate lock decision with its own neutral review flow.
```

The progressive disclosure rule: never lead with NARA mechanics. Lead with exposure. NARA earns the second click after the user already owns NARA from the first click.

### The flywheel

```
Basket buy fee (USDC)
  → fee collector
  → SWAPPER_ROLE converts to NARA or WETH
  → engine.depositRewards(NARA) or engine.notifyEthRewards{value: ETH}()
  → ETH rewards distributed to active NARA lockers
  → basket UI remains neutral and does not frame protocol rewards as a basket-buying reason

Basket sell fee → same path
```

Every basket trade compounds NARA locker rewards. This is the structural reason baskets matter strategically — not just as a side product, as the engine input.

---

## What is missing to ship

### P0 — required before mainnet launch

**1. Concrete swap adapter (Solidity)**

The `INARABasketSwapAdapterV1` interface exists; the implementation does not. Without it the basket manager has nothing approved to call.

Recommendation: ship **two adapters** before launch:

- `UniswapV3BasketAdapterV1` — direct Uniswap V3 exact-input swaps via `SwapRouter02` on Base. Mature, predictable, easy to audit. Constrains to specific fee tiers (e.g., 0.05% / 0.3% / 1%).
- `ZeroExBasketAdapterV1` — wraps 0x Settler with strict selector allowlist. Better routing across all Base DEXs, but adds quote-server dependency.

Ship Uniswap V3 first. Add 0x in a follow-up if quote quality is insufficient.

Each adapter must:
- Pull exactly `amountIn` from the manager (use `safeTransferFrom`)
- Return `(amountInUsed, amountOut)` matching real balance deltas
- Revert if any unused dust is left behind
- Have no admin, no upgrade, no operator role
- Be immutable per deployment

**2. Curated basket configurations with real Base addresses**

Pick the launch set. Suggested starting four:

```
NARA CORE Basket     — fee 10 bps   — [cbBTC, WETH, AERO, BRETT, NARA]
NARA AI Basket       — fee 20 bps   — [FET-equivalent, RNDR-equivalent, GRT-equivalent, NARA]
NARA CULTURE Basket  — fee 30 bps   — [DEGEN, BRETT, TOSHI, MOG, NARA]
NARA FINANCE Basket  — fee 20 bps   — [AERO, MORPHO-equivalent, COMP-on-base, NARA]
```

Each requires:
- Verified Base mainnet token addresses
- Liquidity check (minimum $250k pool depth per asset for non-NARA tokens)
- Confirmation that no asset is fee-on-transfer, rebasing, paused, or blacklistable
- Per-asset Uniswap V3 pool fee tier mapping
- `minRequiredAssetWeightBps` for NARA in each basket (suggest 10% minimum, higher for blue-chip baskets where NARA is a smaller relative share)

Do not launch with more than 4 baskets. Curation discipline is the brand.

**3. Fresh v4 core deploy**

Baskets cannot deploy until v4 core has fresh addresses. Order is hard:

```
1. Deploy NARA token + engine + reward reserve + liquidity vault (per LAUNCH_RUNBOOK.md)
2. Verify 48h of clean operation
3. Deploy router/lens/bribe layer
4. Deploy NARAIndexFeeCollectorV1 with engine, NARA, WETH, admin
5. Set allowed executor + selector on fee collector
6. Deploy NARAImmutableBasketPositionManagerV1 per basket (one per category)
7. Verify each basket constructor config on Basescan
8. Optional: deploy CategoryIndexSuiteV1 if static-vault variant is wanted
```

**4. Frontend app — `apps/nara-baskets/`**

New app, not a tab in the lockboard. Naming: nara-baskets (slug), "NARA Baskets" (display).

Required surfaces:
- Landing: equal basket cards with name, category, asset thumbnails, and fee labels
- Basket detail page: composition, weights, NARA share, fees, exits, and a neutral "Continue" CTA
- Buy flow: input USDC amount → quote builder calls server-side route generator → user signs one Permit-style signature → paymaster sponsors the tx → receipt minted, displayed
- Receipt page: shows token-by-token balance, current value, fee accrued, two CTAs: "Sell whole basket" (to USDC or NARA) and "Withdraw underlying" (raw tokens)
- Optional NARA link on receipt pages: "NARA balance in this receipt: X NARA. View NARA lock options." Do not imply the user should lock.

Frontend must follow the canonical NARA Degen Board design system (`nb-` class prefix, JetBrains Mono, parchment background, blue accent).

**5. Quote builder service**

The buy flow needs per-asset minAmountsOut and Uniswap V3 swap calldata for each asset purchased. That cannot be computed on-chain affordably. Options:

- **Lightweight**: Cloudflare Worker that queries Base RPC for Uniswap V3 quoter outputs per asset, applies user-set slippage, returns the `BuyParams` struct ready to sign. ~50 lines of code. Cheap. No backend state.
- **Heavier**: indexer + price oracle service (not needed for V1; defer).

Ship the Cloudflare Worker version. Quote builder lives at `apps/nara-baskets/functions/quote.ts`.

**6. Receipt NFT renderer**

The receipt is an ERC-721. Default OpenSea metadata is ugly and confusing. Build an on-chain SVG renderer (like `NaraLockRenderer`) that shows:

- Basket name + category
- Token composition with weights
- Current asset values (read from manager's `tokenIdAssets[tokenId]`)
- NARA share highlighted

This is a competitive differentiator. Coinbase baskets are not NFTs. NARA receipts are bearer assets with premium visual identity.

**7. Indexer for basket activity**

Subgraph (or Cloudflare Worker + Base RPC) indexing:
- `BasketBuy(positionId, owner, paymentToken, inputAmount, ...)`
- `BasketSell(positionId, owner, outputToken, outputAmount, ...)`
- `BasketWithdraw(positionId, owner, ...)`

Used for: front page basket cards' 7d/30d performance, leaderboard of largest receipts, fee accrual telemetry.

**8. Security review on adapter + fee collector**

Specifically:
- Adapter's exact-input accounting (does `amountInUsed` match the manager's balance delta exactly, regardless of how the underlying router routes)
- Fee collector's executor + selector allowlist — verify exact 4-byte selector for Uniswap V3 SwapRouter02 `exactInputSingle` and `exactInput`; never enable broad multicall selectors
- Receipt manager's `withdrawUnderlying` path under accounting edge cases (re-entrancy via ERC-721 receiver hooks)
- The `forceApprove → swap → forceApprove(0)` pattern on the fee collector

Use Slither + manual review minimum. Echidna invariant tests on the receipt manager + fee collector if time permits.

### P1 — within 14 days of basket launch

- **Smart Wallet + Paymaster integration** on the basket frontend (same pattern as router/lens). Zero-gas first-buy is the conversion lever.
- **Fiat onramp**: Coinbase Pay button on the basket detail page so a brand-new user can go USD card → USDC → basket in one click. Apple Pay / Google Pay via the same Coinbase widget.
- **Per-basket leaderboards**: top 100 receipts by value. Pseudo-anonymous, creates social proof.
- **Receipt sharing**: copy-link with embed preview that renders the receipt SVG. Twitter card. Farcaster frame.
- **Performance attribution**: per-receipt P&L since mint (price changes for each token + fees paid).

### P2 — within 30 days

- **NARA share upgrade flow**: one-click from receipt page → unwrap NARA share → lock it in the engine. Single signature via EIP-5792.
- **Partial exits** (sell 25% / 50% / 75% of the receipt). This is the V2 boundary in the existing spec, but it's the most-requested ergonomic improvement. Requires careful design — keep V1 receipts whole-only.
- **More baskets** based on adoption signal. Curate, do not flood.
- **Creator baskets** (later): allow external curators to deploy their own basket with their own fee split, with NARA still mandatory and the protocol still taking its cut.

---

## Concrete differentiators vs each competitor (copy for landing page / threads)

### Vs. Reserve DTFs

> Reserve DTFs let governance change the basket composition after you buy. NARA Baskets are immutable. The basket you buy is the basket you own — forever, no vote can change it.

### Vs. Index Coop

> Index Coop indices need oracle prices for every token. NARA Baskets record exact spot execution instead of NAV pricing, while launch curation still rejects fragile tokens and poor-liquidity routes.

### Vs. Phuture / Alongside

> Other ERC-20 baskets price you against a TWAP, so your entry is averaged. NARA Baskets execute at spot, so what you see is what you own — every token, exact amount, on-chain.

### Vs. Coinbase / Robinhood baskets

> Coinbase baskets hold tokens in a custodial account. NARA Baskets give you an on-chain receipt NFT for the listed underlying tokens. Full and partial raw withdrawal are available when the selected token contracts transfer normally.

### Vs. Yearn / Beefy vaults

> Vaults run managed strategies. NARA Baskets are fixed-composition receipts: the user chooses a basket and owns claims to the listed tokens. Any NARA lock flow is a separate self-directed action.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Per-asset slippage on thin liquidity blows past `maxWeightDeviationBps` | Fork-test each launch basket against current Base liquidity. Set per-basket tolerance from observed route depth and quote precision. Build quote service with adaptive slippage. |
| Adapter calldata blob (0x / Universal Router) hides arbitrary intent | Allowlist exact 4-byte selectors only on fee collector + adapter. Never allow multicall / batch / arbitrary-callsite selectors. |
| Fee collector executor selector misconfiguration drains fees | Deploy script must require `EXECUTOR_0_SELECTOR` as an explicit 4-byte value. Verify on-chain after deploy. Re-verify any time a new executor is added. |
| Receipt NFT transferability confuses users (Alice transfers to Bob who can sell whole basket) | UI must explicitly state "your basket is an NFT — transferring it transfers ownership of all tokens inside." Standard ERC-721 risk. |
| Cold user has no USDC on Base | Embed Coinbase Pay widget. Provide bridge instructions for users with funds on other chains. |
| Basket execution can differ from holding spot tokens directly because of fees and routing | Show fees, routes, and token amounts before confirmation. Do not claim a better long-term result. |
| Foundry environment missing on deployer machine | Install Foundry on the deployer machine before launch day. Document in `LAUNCH_RUNBOOK.md`. |
| Quote builder service down → no one can buy | Static fallback quote path that uses last cached liquidity + wider slippage. Worker auto-retries Base RPC. |
| Receipt NFT metadata fails to render on OpenSea / wallet | Build on-chain SVG renderer (mandatory). Test on Rainbow, MetaMask, Phantom, OpenSea, Zerion before launch. |

---

## Launch sequencing

```
Week 1: deploy fresh v4 core (token, engine, reserve, vault, hook). 48h monitor.
Week 2: deploy router/lens/bribe. Build Uniswap V3 adapter. Foundry fork tests.
Week 3: deploy fee collector + 4 launch baskets. Verify on Basescan.
Week 4: ship basket frontend at naraprotocol.io. Soft launch to power users.
Week 5: open Coinbase Pay onramp + Smart Wallet + Paymaster. Public launch.
Week 6+: collect adoption data, decide on basket additions, push NARA-lock upgrade funnel.
```

This sequencing assumes v4 core deploys cleanly. Any blockers reset the clock.

---

## What this document supersedes

- The framing in `NARA_V4_PUBLIC_STATE.md` that positions the lockboard as the primary surface. After this launch, the lockboard becomes secondary.
- The "post-launch" priority of the basket app. Baskets ship as the launch.

What it does NOT supersede:

- All operator gates in `NARA_V4_LAUNCH_RUNBOOK.md` for v4 core deployment. Core deploys first; baskets follow.
- Bond opening criteria in `NARA_V4_BOND_OPENING_CRITERIA.md`. Bonds remain operator-gated and independent of basket adoption.
- Protocol safety standards in the repo `CLAUDE.md` — all baskets and adapters must satisfy them.

---

## References

- `nara-category-baskets-v1/README.md` — package overview
- `nara-category-baskets-v1/docs/NARA_INTEGRATION.md` — engine integration spec
- `nara-category-baskets-v1/docs/RECEIPT_BASKET_FLOW.md` — canonical buy/sell flow
- `nara-category-baskets-v1/docs/EXAMPLE_BASKETS.md` — basket config templates
- `nara-category-baskets-v1/docs/SECURITY_CHECKLIST.md` — pre-deploy gate
- `nara-protocol-hardhat/docs/NARA_V4_LAUNCH_RUNBOOK.md` — v4 core deploy sequence
- `nara-protocol-hardhat/docs/NARA_V4_PUBLIC_STATE.md` — current operational state
