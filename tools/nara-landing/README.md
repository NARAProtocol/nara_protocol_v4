# NARA landing (naraprotocol.io)

Single static page: the NARA toilet/frog meme landing with the flush game, live Uniswap v4 swap modal (`#buyNaraModal`), post forge, sticker cards, and the self-reported Fame Board + Award Claim Pass. Built with Vite 5 and Tailwind 3 (compiled at build time), served by Cloudflare Pages with five Pages Functions (`/api/leaderboard`, `/api/quote`, `/api/supply`, `/api/circulating-supply`, and `/api/total-supply`).

This directory is the canonical landing source. The public mirror repo
`NARAProtocol/nara-landing` is updated from an immutable commit here, following
`docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md`.

## Layout

| Path | Purpose |
|---|---|
| `index.html` | Markup only. No inline scripts, no inline `on*=` handlers (`data-on-<event>="action[:arg]"` instead). |
| `src/meme/config.js` | Public constants: token address, chain, canonical URL, CryptoSLIP URL (`https://slip.naraprotocol.io`), `SWAP_PUBLIC_LAUNCHED`, Turnstile site key. |
| `src/meme/v4SwapEngine.js` | Zero-dependency BigInt ABI + Uniswap v4 `NARALiquidityHookV5` quote & `UniversalRouter` calldata engine (100% V4-Hook-only). |
| `src/meme/buyModal.js` | First-screen live spot/supply telemetry, Instant Buy controller, and EIP-6963 Web3 swap modal (`#buyNaraModal`, preflight `eth_call` simulation guard, L2 clock-skew safety). |
| `src/meme/main.js` | Game, audio, share, sticker and board logic. `ACTIONS` + `bindActions()` at the bottom wire the markup. |
| `src/meme/styles.css` | Tailwind directives, self-hosted `@font-face`, page CSS. |
| `public/_headers` | Security headers incl. the CSP (`script-src 'self' https://challenges.cloudflare.com …`), `Referrer-Policy: no-referrer`, and `Cross-Origin-Resource-Policy: same-origin` on HTML/assets (`cross-origin` only on `/nara_token_256.png`). |
| `public/_redirects` | `/swap*`, `/app*` → CryptoSLIP (`https://slip.naraprotocol.io`) (302); `/docs*`, `/github`, `/audit` → GitHub Docs (302); `/meme*` → `/` (301). |
| `public/llms.txt`, `public/llms-full.txt`, `public/ai-facts.json`, `public/ai.txt`, `public/robots.txt`, `public/research/` | AI / LLM crawler discovery manifests, machine-readable facts feed, full single-file protocol context, and 5 forensic research briefs. |
| `public/404.html` | Static not-found page (no scripts). |
| `public/fonts/` | JetBrains Mono + Space Grotesk, latin variable subsets (SIL OFL). |
| `functions/api/leaderboard.js` | Fame Board & Award Claim Pass API: same-origin check, Turnstile verify (`action === "fame_board_submit"` + hostname allowlist + 8s timeout), KV rate limits, timing-safe admin Bearer auth (`>= 24` chars). |
| `functions/api/quote.js` | Read-only Base Mainnet Uniswap v4 `NARALiquidityHookV5` live spot & swap quote API (`/api/quote?summary=1` and `/api/quote?direction=...`) with 3 default Base RPCs (`publicnode`, `drpc`, `mainnet.base.org`) + optional `BASE_RPC_URL` override. |
| `functions/_shared/supplyCore.js` | Shared Base Mainnet on-chain reader querying `NARATokenV5`, `NARAEmissionReserveV5`, `NARAPrincipalLedgerV5`, `NARATreasuryRangeManagerV5`, `NARARewardLedgerV5`, and `CryptoSlipVaultV32` (`v33` & `v32`) with 3-RPC failover + optional `BASE_RPC_URL`. |
| `functions/api/circulating-supply.js`, `total-supply.js`, `supply.js` | Live Base Mainnet supply disclosure API (`text/plain` decimal numbers + `/api/supply` JSON breakdown; excludes protocol vaults and commitments locked `> 1 day`, while keeping `<= 1 day` locks, unclaimed rewards, slips, LP and wallets circulating). |
| `scripts/check-denylist.cjs` | Fails on retired addresses, Tailwind CDN, `unsafe-eval`, dead URLs, inline scripts/handlers, "NFT" wording. |
| `scripts/deploy-pages.mjs` | Runs `npm run check`, verifies `VITE_TURNSTILE_SITE_KEY` is bundled into `dist/assets/*.js`, and runs `wrangler pages deploy dist` (`preview` or `production`). |
| `tests/leaderboard.test.mjs`, `tests/supply.test.mjs`, `tests/quote.test.mjs` | `node --test` unit tests for the Pages Functions and V4 swap calldata parity. |
| `tests/smoke.mjs` | Playwright smoke: every control, console/page errors, banned wording, screenshots. |

Archived (read-only): the former React "Sovereign Grid" app and v4-wired swap live in
`../nara-landing-archive/sovereign-grid-2026-11/`. Never redeploy or import from it.

## Commands

```bash
npm ci                 # install (Node 20+)
npm run dev            # Vite dev server on http://127.0.0.1:5180 (mounts live in-memory KV + all 5 /api/* handlers)
npm run check          # denylist + 33 unit tests + production build
npm run preview        # serve dist on http://127.0.0.1:4173 (mounts live in-memory KV + all 5 /api/* handlers)
npm run test:smoke     # Playwright smoke against SMOKE_URL (default: http://127.0.0.1:4173)
npm run pages:dev      # Wrangler Pages dev on :8788 with a local KV (real _headers/_redirects/Functions)
```

Turnstile + Award Claim Pass end-to-end locally (Cloudflare's documented always-pass test keys):

```bash
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
npx wrangler pages dev dist --port 8788 --kv NARA_LEADERBOARD_KV --binding TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA AWARD_CLAIM_SALT=dev_salt AWARD_ADMIN_TOKEN=dev_admin_token_24chars_min
SMOKE_URL=http://127.0.0.1:8788 SMOKE_EXPECT_SUBMIT="POSTED TO BOARD" npm run test:smoke
```

## Hosting (Cloudflare Pages)

Project name: `nara-landing` (`nara-landing-6wd.pages.dev`, `wrangler.jsonc`). Static
catch-all hosts (IPFS gateways) ignore `_headers`, `_redirects` and `functions/`, so the
security headers, live supply/quote functions, and global board only work on Cloudflare Pages / Workers.

| Setting | Value |
|---|---|
| Root directory | `tools/nara-landing` (monorepo: without it the build finds neither `functions/` nor `dist`) |
| Build command | `npm run check` (or `npm run build`) |
| Output directory | `dist` |
| KV binding (`NARA_LEADERBOARD_KV`) | Production ID `7923b1171b884f1c904e9480d1abc5c8` / Preview ID `77d680f7bd3944ce984de5c8791e9907` |
| Secret | `TURNSTILE_SECRET_KEY` (Turnstile widget secret). Absent → `POST /api/leaderboard` returns 503 `board_disabled`, UI issues a device-local Claim Pass and says "SAVED ON DEVICE". |
| Secret (optional) | `AWARD_CLAIM_SALT` (HMAC-SHA256 key/salt for deterministic `NARA-AWARD:v1:...` Award Claim Pass codes; falls back to `TURNSTILE_SECRET_KEY` when omitted). |
| Secret (optional) | `AWARD_ADMIN_TOKEN` (**`24+` char** Bearer token authorizing `GET /api/leaderboard?admin=1` & `POST` `action=mark_awarded` / `action=delete_entry` via timing-safe SHA-256 comparison). |
| Env var (optional) | `BASE_RPC_URL` (custom Base Mainnet JSON-RPC endpoint prepended to the 3 default Base RPCs in `/api/quote` and `/api/supply`). |
| Build variable | `VITE_TURNSTILE_SITE_KEY` (public site key). Absent → the page never calls the API for posting; `scripts/deploy-pages.mjs` fails closed if missing from the built JS bundle. |

Deploy: `npm run deploy:cf:preview` (branch `preview`) or `npm run deploy:cf:prod`. A
production deploy is a production switch under the root `AGENTS.md`: it needs explicit owner
authorization for that action, not just a green check.
Verify on the `*.pages.dev` URL before pointing DNS: `curl -I` for CSP/HSTS/XFO,
`/swap` → 302 to `https://slip.naraprotocol.io/?tab=nara&action=buy`, `/meme.html` → 301 `/`,
`/api/leaderboard` → JSON, `/api/supply` → JSON, `/flush.mp3` → `audio/mpeg`, then run `tests/smoke.mjs` against it.

## Launch switch

`SWAP_PUBLIC_LAUNCHED` in `src/meme/config.js` is `true`. When true, `initSwapControl()` opens the
in-page Uniswap v4 `#buyNaraModal` on click and `https://slip.naraprotocol.io/?tab=nara&action=buy`
links are wired across the Buy modal footer and `_redirects` (`/swap*` and `/app*` → 302). Verify with `npm run test:smoke`.

## Participant Award Claim Pass API

- `POST /api/leaderboard` accepts optional `platform` (`x` | `tg` | `fc`), Base `wallet` (`0x...`), validated X/Warpcast `postUrl`, optional masked contact, and per-browser `operatorKey` (`16..80` chars) to prevent handle hijacking (`403 handle_locked`) and return an HMAC-SHA256 signed `claimPass` (`NARA-AWARD:v1:<handle>.<nonce>.<mac>`) + `claimCode` (`NARA-XXXX-XXXX`).
- Public `GET /api/leaderboard` masks `wallet` into `walletHint` (`0x1234…abcd`) and never exposes `wallet`, `contact`, or `keyHash` (stored privately in KV `claim:<id>`).
- Public `GET /api/leaderboard?verify=1&handle=@name&claim=...` (or `POST` `action=verify_claim`, rate-limited `30/hr/IP`) checks cryptographic validity and `awarded` status without exposing payout details.
- Private admin `GET /api/leaderboard?admin=1` & `POST` `action=mark_awarded` / `action=delete_entry` (requires `Authorization: Bearer <AWARD_ADMIN_TOKEN>` >= 24 chars, locked after `5` failed auth attempts/hr/IP) manages the unmasked participant payout roster for distributing CryptoSLIP / Base awards.

## Security posture

- **Web3 Wallet & Swap Execution (`#buyNaraModal`):**
  - Supports user-initiated EIP-1193 / EIP-6963 wallets, `wallet_switchEthereumChain`, `wallet_addEthereumChain` (Base `8453`), `wallet_watchAsset`, and **100% Uniswap v4 Hook-only swaps** via Uniswap `UniversalRouter` (`0x6fF5693b99212Da76ad316178A184AB56D299b43`) + `Permit2` (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) → `NARALiquidityHookV5` (`0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC`).
  - Zero Uniswap V3 NARA pools or third-party aggregators are ever invoked for `NARA` swaps.
  - Every swap runs a mandatory preflight `eth_call` simulation (`Safety simulation blocked` fail-closed guard) with 3-RPC fallback and L2 clock-skew safety on deadlines.
- **CSP & HTTP Security Headers:**
  - `default-src 'self'`; scripts only from `'self'` plus `challenges.cloudflare.com` (Turnstile, loaded only when needed) and `static.cloudflareinsights.com`. No `unsafe-inline`/`unsafe-eval` for scripts. Styles allow `'unsafe-inline'` for the inline `style=` attributes the game sets.
  - HSTS (1 year, `includeSubDomains`; `preload` omitted until all subdomains are confirmed HTTPS-only), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` (explicitly overridden to `cross-origin` only on `/nara_token_256.png` so wallets can load the token icon for `wallet_watchAsset`).
  - `_headers` applies to static files only. All `/api/*` Functions set their own `nosniff`, `XFO: DENY`, `default-src 'none'` CSP, and explicit `Cache-Control`.
- **Anti-Abuse & Fail-Closed Server Validation:**
  - Build keeps `console.error` (other console calls are stripped) so any broken `data-on-*` binding is reported in production and caught by `data-nara-bind-error`.
  - Browser storage holds game/quest progress only. `POST /api/leaderboard` normalizes handles server-side, validates Turnstile `action === "fame_board_submit"` + allowed hostname + `8s` abort timeout, enforces 2 KB body cap, `8` accepted posts/IP/hr, `30` verify checks/IP/hr, `5` failed admin attempts/IP/hr, same-origin only, and re-validates rows on every read.
  - Share links always use the canonical origin (`https://naraprotocol.io`), never a preview host.

## Honesty rules (enforced by `check-denylist.cjs` and `tests/smoke.mjs`)

- Stickers are device-local cards. Never call them NFTs, on-chain or collectibles with value.
- The Fame Board is self-reported. Never label it verified.
- The grid log shows only this browser's events and true tips. No invented users or feeds.
- No unverified APY promises; protocol metrics match live Base Mainnet contracts.
- The disclaimer line in the footer stays.
- The flush SFX path (`/flush.mp3` with procedural fallback, three modes) is a keep-as-is feature.
