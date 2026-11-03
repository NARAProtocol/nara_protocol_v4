# NARA landing (naraprotocol.com)

Single static page: the NARA toilet/frog meme landing with the flush game, post forge,
sticker cards and the self-reported Fame Board. Built with Vite 5 and Tailwind 3 (compiled
at build time), served by Cloudflare Pages with one Pages Function (`/api/leaderboard`).

This directory is the canonical landing source. The public mirror repo
`NARAProtocol/nara-landing` is updated from an immutable commit here, following
`docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md`.

## Layout

| Path | Purpose |
|---|---|
| `index.html` | Markup only. No inline scripts, no inline `on*=` handlers (`data-on-<event>="action[:arg]"` instead). |
| `src/meme/config.js` | Public constants: token address, chain, canonical URL, CryptoSLIP URL, `SWAP_PUBLIC_LAUNCHED`, Turnstile site key. |
| `src/meme/main.js` | Game, audio, share, sticker and board logic. `ACTIONS` + `bindActions()` at the bottom wire the markup. |
| `src/meme/styles.css` | Tailwind directives, self-hosted `@font-face`, page CSS. |
| `public/_headers` | Security headers incl. the CSP (`script-src 'self' https://challenges.cloudflare.com …`). |
| `public/_redirects` | `/swap*` → CryptoSLIP (302); `/app*`, `/meme*` → `/` (301). |
| `public/404.html` | Static not-found page (no scripts). |
| `public/fonts/` | JetBrains Mono + Space Grotesk, latin variable subsets (SIL OFL). |
| `functions/api/leaderboard.js` | Fame Board API: same-origin check, Turnstile verify, KV rate limit, strict validation. |
| `scripts/check-denylist.cjs` | Fails on retired addresses, Tailwind CDN, `unsafe-eval`, dead URLs, inline scripts/handlers, "NFT" wording. |
| `tests/leaderboard.test.mjs` | `node --test` unit tests for the Function (mocked KV and Turnstile). |
| `tests/smoke.mjs` | Playwright smoke: every control, console/page errors, banned wording, screenshots. |

Archived (read-only): the former React "Sovereign Grid" app and v4-wired swap live in
`../nara-landing-archive/sovereign-grid-2026-11/`. Never redeploy or import from it.

## Commands

```bash
npm ci                 # install (Node 20)
npm run dev            # Vite dev server on http://127.0.0.1:5180 (API stubbed: GET [] / POST 503)
npm run check          # denylist + API unit tests + production build
npm run preview        # serve dist on http://127.0.0.1:4173
npm run test:smoke     # Playwright smoke against SMOKE_URL (default: the preview)
npm run pages:dev      # Wrangler Pages dev on :8788 with a local KV (real _headers/_redirects/Function)
```

Turnstile end-to-end locally (Cloudflare's documented always-pass test keys):

```bash
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build
npx wrangler pages dev dist --port 8788 --kv NARA_LEADERBOARD_KV --binding TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
SMOKE_URL=http://127.0.0.1:8788 SMOKE_EXPECT_SUBMIT="POSTED TO BOARD" npm run test:smoke
```

## Hosting (Cloudflare Pages)

Project name: `naraprotocol-site` (`wrangler.jsonc`). The old `nara-landing` Pages name
belongs to an unrelated third party. Static catch-all hosts (4everland/IPFS) ignore
`_headers`, `_redirects` and `functions/`, so the security headers and the global board
only work on Pages.

| Setting | Value |
|---|---|
| Root directory | `tools/nara-landing` (monorepo: without it the build finds neither `functions/` nor `dist`) |
| Build command | `npm run check` (or `npm run build`) |
| Output directory | `dist` |
| KV binding | `NARA_LEADERBOARD_KV` → a KV namespace |
| Secret | `TURNSTILE_SECRET_KEY` (Turnstile widget secret). Absent → `POST /api/leaderboard` returns 503 `board_disabled`, UI says "SAVED ON DEVICE". |
| Build variable | `VITE_TURNSTILE_SITE_KEY` (public site key). Absent → the page never calls the API for posting. |

Deploy: `npm run deploy:cf:preview` (branch `preview`) or `npm run deploy:cf:prod`. A
production deploy is a production switch under the root `AGENTS.md`: it needs explicit owner
authorization for that action, not just a green check.
Verify on the `*.pages.dev` URL before pointing DNS: `curl -I` for CSP/HSTS/XFO,
`/swap` → 302 to CryptoSLIP, `/meme.html` → 301 `/`, `/api/leaderboard` → JSON,
`/flush.mp3` → `audio/mpeg`, then run `tests/smoke.mjs` against it.

## Launch switch

`SWAP_PUBLIC_LAUNCHED` in `src/meme/config.js` is `false`. While false, the header SWAP
control is a plain `<button>` with no href (so middle-click, "open in new tab", long-press
and link previews cannot reach a swap) and opens the "SWAPS OPEN SOON" modal; `_redirects`
sends old `/swap*` links to `/`. When true, `initSwapControl()` turns the button into a real
link to `https://cryptoslip.eth.limo/` (`target=_blank rel=noopener`) before any interaction.

Launch commit (one reviewed commit, only after Safe nonce 8 `Hook.setTradingPaused(false)`
executed and the V5 launch verification passed): set the flag to `true` AND change the four
`/swap*` targets in `public/_redirects` to `https://cryptoslip.eth.limo/`. Verify with
`SMOKE_SWAP_LAUNCHED=1 npm run test:smoke`.

## Security posture

- CSP: `default-src 'self'`; scripts only from this origin plus `challenges.cloudflare.com`
  (Turnstile, loaded only when the victory modal opens) and `static.cloudflareinsights.com`
  (only if Web Analytics is enabled in the dashboard). No `unsafe-inline`/`unsafe-eval` for
  scripts. Styles allow `'unsafe-inline'` for the inline `style=` attributes the game sets.
- HSTS (1 year, `includeSubDomains`; the `preload` directive is deliberately left out until the
  owner confirms every `*.naraprotocol.com` subdomain is HTTPS-only, since preload-list entry
  is effectively irreversible), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff,
  strict referrer, restrictive Permissions-Policy, COOP same-origin. No
  `Cross-Origin-Resource-Policy` so wallets can load `/nara_token_256.png` for `wallet_watchAsset`.
- `_headers` applies to static files only. `/api/leaderboard` sets its own headers: GET is
  publicly cacheable for 15 s (30 s at the edge), POST is `no-store`, JSON responses carry
  nosniff, XFO DENY and a `default-src 'none'` CSP. HEAD is supported for uptime monitors.
- Build keeps `console.error` (other console calls are stripped) so a broken `data-on-*`
  binding is reported in production and caught by the smoke test (`data-nara-bind-error`).
- Browser storage holds game progress only. The board API never trusts the client: handle
  is normalized server-side, scores must be JSON integers 12..50000 with 12 cards, Turnstile is
  verified, 5 accepted posts per IP per hour (failed attempts do not consume budget), 2 KB
  body cap, same-origin only. Stored rows are re-validated and re-typed on every read. Two
  simultaneous posts can still race on the KV read-modify-write (last writer wins; KV is
  eventually consistent); acceptable for a game board.
- Share links always use the canonical origin, never a preview host.
- Wallet interaction is limited to `wallet_switchEthereumChain`, `wallet_addEthereumChain`
  (Base) and `wallet_watchAsset` for the canonical token. No signing, no transactions.

## Honesty rules (enforced by `check-denylist.cjs` and `tests/smoke.mjs`)

- Stickers are device-local cards. Never call them NFTs, on-chain or collectibles with value.
- The Fame Board is self-reported. Never label it verified.
- The grid log shows only this browser's events and true tips. No invented users or feeds.
- No "verified" or "15M epoch" protocol claims on this page; the token line shows the address.
- The disclaimer line in the footer stays.
- The flush SFX path (`/flush.mp3` with procedural fallback, three modes) is a keep-as-is feature.
