<div align="center">

# NARA Protocol — Official Web Portal (`naraprotocol.io`)

**Open-source, non-custodial Base Mainnet (`8453`) Web Portal, Uniswap v4 Hook Swap Terminal & Wave 1 Vault Receipts Console.**

[![Live Portal](https://img.shields.io/badge/Live-naraprotocol.io-00FF9D?style=flat-square)](https://naraprotocol.io)
[![Vault Receipts](https://img.shields.io/badge/Vault_Receipts-naraprotocol.io/vault-00E5FF?style=flat-square)](https://naraprotocol.io/vault)
[![CryptoSLIP](https://img.shields.io/badge/CryptoSLIP-slip.naraprotocol.io-111111?style=flat-square)](https://slip.naraprotocol.io)
[![Base Mainnet](https://img.shields.io/badge/Base_Mainnet-8453-0052FF?style=flat-square)](https://basescan.org/token/0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f)
[![ERC-8021](https://img.shields.io/badge/Base_Builder-bc__g71jff6u-16A34A?style=flat-square)](https://basescan.org/address/0xe320C281c86079eA85f2Bc67864E873A61D551E3)
[![Tests](https://img.shields.io/badge/Unit_Tests-53_passing-2ea44f?style=flat-square)](#commands)
[![Zero Cookies](https://img.shields.io/badge/Tracking-Zero_Cookies_%7C_no--transform-334155?style=flat-square)](https://naraprotocol.io/privacy)

</div>

---

Two-page static web portal (`/` Overview & Interactive Terminal + `/vault` Dedicated Wave 1 Sealed Vault Receipts console), built with Vite 5 and Tailwind 3 (compiled at build time), served by Cloudflare Pages with an edge `HTTP 451` jurisdiction middleware (`functions/_middleware.js`), five read/write Pages Functions (`/api/leaderboard`, `/api/quote`, `/api/supply`, `/api/circulating-supply`, `/api/total-supply`), standalone open-source legal/accessibility documentation (`/privacy`, `/terms`, `/accessibility`), and RFC 9116 vulnerability disclosure (`/.well-known/security.txt`).

> **Canonical Release Mirror:** The public repository `NARAProtocol/nara-landing` tracks verified releases from `tools/nara-landing/` in the upstream protocol repository in accordance with the NARA Cross-Repository Release Protocol.

---

## Architecture & Directory Layout

| Path | Purpose |
| :--- | :--- |
| `index.html` | Overview & Interactive Terminal home page (`/`), linking cleanly to `/vault` via a 2-column Gateway card and to `/privacy`, `/terms`, and `/accessibility` in the footer with explicit EU AI Act Art. 50 illustration provenance. Markup only (zero inline scripts or `on*=` handlers). |
| `vault.html` | Dedicated Wave 1 Sealed Vault Receipts page (`/vault`, targeted by `/s/vault` share cards) showcasing `29` multi-tier Vault Receipt NFTs (`#16..#44`), live Chainlink + Uniswap v4 telemetry, and the verified Base Mainnet contract directory. |
| `src/meme/vaultPage.js` | Entry controller for `/vault`, mounting shared `anchorSeats.js` and `buyModal.js`. |
| `src/meme/config.js` | Public constants: canonical `NARATokenV5` (`0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f`), Chain ID `8453`, canonical URL (`https://naraprotocol.io`), CryptoSLIP URL (`https://slip.naraprotocol.io`), `BASE_BUILDER_CODE` (`bc_g71jff6u`), `SWAP_PUBLIC_LAUNCHED`, and Turnstile site key. |
| `src/meme/erc8021.js` | Zero-dependency ERC-8021 Schema `0` Base Builder Code attribution encoder (`appendErc8021DataSuffix`). |
| `src/meme/v4SwapEngine.js` | Zero-dependency BigInt ABI + Uniswap v4 `NARALiquidityHookV5` quote & `UniversalRouter` calldata engine (**100% Uniswap v4 Hook-only** — never routes `NARA` through V3 or external aggregators). |
| `src/meme/buyModal.js` | First-screen live spot/supply telemetry, Instant Buy controller, and EIP-6963 Web3 swap modal (`#buyNaraModal`, mandatory preflight `eth_call` simulation guard, L2 clock-skew safety). |
| `src/meme/anchorSeats.js` | `365D` (`4.00x`) Vault Receipts acquisition controller (`NARAPositionSaleV5` `0x04Ac83045d26259D46400Ce6beb9bBd0641df225`): pins seller (`Treasury Safe`), `ownerOf`, `sellerNonce`, `receiptTransferNonce`, ERC-721 approval, `expectedPriceWei`, all 3 reward credits `[NARA, ETH, USDC]`, `nextCheckpoint`, and `rarityTier` across two independent Base RPCs before fail-closed `eth_call` simulation. |
| `src/meme/main.js` | Interactive console, audio, share, sticker, sector navigation, Fame Board submit, and 1-click GDPR Art. 17 self-erasure (`#erasePassBtn`). All DOM bindings flow through `data-on-*` + `ACTIONS`. |
| `src/meme/styles.css` | Tailwind directives, self-hosted `@font-face` (`JetBrains Mono` + `Space Grotesk`), accessible `:focus-visible` outlines, and `prefers-reduced-motion` support. |
| `public/_headers` | Static security headers: `Cache-Control: public, max-age=0, must-revalidate, no-transform` (prevents proxy/edge beacon injection), strict CSP (`script-src 'self' https://challenges.cloudflare.com ...`), HSTS (`max-age=31536000; includeSubDomains`), `COOP: same-origin-allow-popups`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `frame-ancestors` for Telegram / Farcaster / Base App / Coinbase Wallet. |
| `public/_redirects` & `public/_routes.json` | `/swap*`, `/app*` → `https://slip.naraprotocol.io` (`302`); `/docs*`, `/github`, `/audit` → `https://github.com/NARAProtocol/nara_protocol` (`302`); `/meme*` → `/` (`301`); `_routes.json` routes HTML + `/api/*` through `_middleware.js`. |
| `public/privacy.html`, `public/terms.html`, `public/accessibility.html` | Standalone open-source Privacy Notice (GDPR/UK GDPR/ePrivacy/CCPA, zero cookies, self-erasure, `privacy@naraprotocol.io`), Terms & Risk Disclosure (non-custodial software, EU AI Act Art. 50 disclosure, MiCA/FCA risk prominence), and Accessibility Statement (EAA / WCAG 2.2 AA). |
| `public/.well-known/` | `security.txt` (RFC 9116, `security@naraprotocol.io`), `webauthn` (WebAuthn Related Origin Requests sharing passkeys across `naraprotocol.io`, `slip.naraprotocol.io`, and `cryptoslip.eth.limo`), and `farcaster.json` (Mini App & `baseBuilder` manifest). |
| `public/llms.txt`, `public/llms-full.txt`, `public/ai-facts.json`, `public/ai.txt`, `public/robots.txt`, `public/research/` | AI/LLM crawler discovery manifests, machine-readable protocol facts feed, full single-file protocol context, and 5 forensic research briefs. |
| `functions/_middleware.js` & `functions/_shared/geoblockCore.js` | Edge jurisdiction middleware returning `HTTP 451 Unavailable For Legal Reasons` (`Cache-Control: no-store, no-transform`) for sanctioned jurisdictions (`CU`, `IR`, `KP`, `SY`, and restricted `UA` regions `43/40/14/09`) while keeping `/privacy`, `/terms`, `/accessibility`, and `/.well-known/*` accessible. |
| `functions/api/leaderboard.js` | Fame Board & Award Claim Pass API: same-origin validation, Turnstile verify (`action === "fame_board_submit"` + hostname allowlist + 8s timeout), KV rate limits, 1-click user GDPR self-erasure (`action=delete_own_entry` verified via timing-safe `operatorKey` hash), and timing-safe admin Bearer auth (`>= 24` chars). |
| `functions/api/quote.js` | Read-only Base Mainnet Uniswap v4 `NARALiquidityHookV5` live spot & swap quote API (`/api/quote?summary=1` and `/api/quote?direction=...`) with 3 default Base RPCs + optional `BASE_RPC_URL` override. |
| `functions/_shared/supplyCore.js` & `functions/api/*supply*.js` | Live Base Mainnet on-chain supply reader (`/api/supply`, `/api/circulating-supply`, `/api/total-supply`) querying `NARATokenV5`, `NARAEmissionReserveV5`, `NARAPrincipalLedgerV5`, `NARATreasuryRangeManagerV5`, `NARARewardLedgerV5`, and `CryptoSlipVaultV32` (`v33` & `v32`) with 3-RPC failover. |
| `scripts/check-denylist.cjs` | Automated security & honesty gate failing on retired addresses, Tailwind CDN, `unsafe-eval`, dead URLs, inline scripts/handlers, or misrepresenting device-local stickers as NFTs. |
| `scripts/deploy-pages.mjs` | Runs `npm run check`, verifies `VITE_TURNSTILE_SITE_KEY` is bundled into `dist/assets/*.js`, and deploys to Cloudflare Pages (`preview` or `production`). |
| `tests/*.test.mjs` | `node --test` unit suite (**53 tests**) covering all Pages Functions, GDPR self-erasure, `HTTP 451` geofencing, V4 swap calldata parity, ERC-8021 Schema `0` parity, WebAuthn ROR, and `NARAPositionSaleV5` `BuyerBounds` fail-closed simulation guards. |
| `tests/smoke.mjs` | Playwright browser smoke harness verifying interactive controls, `0` console/page errors, `0` cookies, accessibility/legal links, banned wording, and responsive captures (`1440px` and `390px`). |

---

## Commands

```bash
npm ci                 # Install dependencies (Node 20+)
npm run dev            # Vite dev server on http://127.0.0.1:5180 (mounts in-memory KV + all /api/* handlers)
npm run check          # Denylist gate + 53 unit tests + Vite production build
npm run preview        # Serve dist on http://127.0.0.1:4173 (mounts in-memory KV + all /api/* handlers)
npm run test:smoke     # Playwright browser smoke against SMOKE_URL (default: http://127.0.0.1:4173)
npm run pages:dev      # Wrangler Pages dev on :8788 with local KV (tests real _headers, _redirects, _middleware)
```

End-to-end Turnstile + Award Claim Pass + GDPR Self-Erasure locally (using Cloudflare's documented always-pass test keys):

```bash
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
npx wrangler pages dev dist --port 8788 --kv NARA_LEADERBOARD_KV --binding TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA AWARD_CLAIM_SALT=dev_salt AWARD_ADMIN_TOKEN=dev_admin_token_24chars_min
SMOKE_URL=http://127.0.0.1:8788 SMOKE_EXPECT_SUBMIT="POSTED TO BOARD" npm run test:smoke
```

---

## Hosting (Cloudflare Pages)

Project: `nara-landing` (`wrangler.jsonc`). Static-only gateways ignore `_headers`, `_redirects`, `_middleware.js`, and `functions/`, so security headers, `HTTP 451` middleware, live Base Mainnet quote/supply endpoints, and the Fame Board run on Cloudflare Pages.

| Setting | Value |
| :--- | :--- |
| Build command | `npm run check` (or `npm run build`) |
| Output directory | `dist` |
| KV binding (`NARA_LEADERBOARD_KV`) | Configured per Cloudflare Pages environment (`wrangler.jsonc`) |
| Secret `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile server secret (if absent, `POST /api/leaderboard` returns `503 board_disabled` and UI stores a device-local Claim Pass) |
| Secret `AWARD_CLAIM_SALT` (optional) | HMAC-SHA256 salt for deterministic `NARA-AWARD:v1:...` Award Claim Pass codes |
| Secret `AWARD_ADMIN_TOKEN` (optional) | `>= 24`-char Bearer token for timing-safe admin moderation (`GET ?admin=1`, `mark_awarded`, `delete_entry`) |
| Env var `BASE_RPC_URL` (optional) | Custom Base Mainnet JSON-RPC endpoint prepended to the 3 public Base RPCs in `/api/quote` and `/api/supply` |
| Build var `VITE_TURNSTILE_SITE_KEY` | Public Cloudflare Turnstile site key (`scripts/deploy-pages.mjs` fails closed if missing from `dist/assets/*.js`) |

---

## Privacy, Legal & Security Posture

- **Zero Cookies & Zero Third-Party Analytics:** Sets zero HTTP cookies (`0` cookies across all routes) and emits `Cache-Control: ..., no-transform` on HTML and static assets so no edge RUM or third-party tracking beacon is injected.
- **GDPR Art. 17 Self-Erasure (`/api/leaderboard`):** Public `GET /api/leaderboard` masks wallet addresses to `walletHint` (`0x1234…abcd`) and never exposes contact fields or hashes. Any participant can permanently erase their own board entry in 1 click (`#erasePassBtn` -> `POST /api/leaderboard` `action=delete_own_entry` verified via timing-safe `operatorKey` hash) or email `privacy@naraprotocol.io`.
- **EU AI Act Art. 50 Transparency:** Satirical arcade/sticker artwork is explicitly labeled on-page (`AI-assisted satirical illustrations`) and documented on `/terms` and `/ai.txt`.
- **Accessibility (EAA / WCAG 2.2 AA):** Full keyboard navigation, visible `:focus-visible` outlines, `prefers-reduced-motion` compliance, skip links, and published statement at `/accessibility`.
- **OFAC Jurisdiction Enforcement (`HTTP 451`):** `functions/_middleware.js` enforces sanctioned-territory filtering on interactive app and API routes while keeping `/privacy`, `/terms`, `/accessibility`, and `/.well-known/*` accessible.
- **Strict On-Chain Execution Safety:**
  - `#buyNaraModal` routes **100% of `NARA` swaps exclusively through Uniswap v4 `NARALiquidityHookV5`** (`0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC`) with mandatory preflight `eth_call` simulation and ERC-8021 attribution (`bc_g71jff6u`).
  - `/vault` (`anchorSeats.js`) pins canonical seller (`Treasury Safe`), nonces, approvals, price, and all 3 reward credits `[NARA, ETH, USDC]` across two independent Base RPCs before fail-closed simulation against `NARAPositionSaleV5` (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`).
- **Vulnerability Disclosure:** See [`SECURITY.md`](SECURITY.md) or [`https://naraprotocol.io/.well-known/security.txt`](https://naraprotocol.io/.well-known/security.txt) (`security@naraprotocol.io`).

---

## Editorial & Honesty Invariants (Enforced in CI)

- Device-local sticker cards are never called NFTs, on-chain collectibles, or assets with financial value.
- The Fame Board is self-reported and never labeled verified.
- Protocol supply and price displays read live Base Mainnet contracts; no guaranteed yields or APY promises are ever made.
- Non-custodial open-source risk disclosures, privacy/terms/accessibility links, and AI-illustration disclosures remain visible in the footer.
