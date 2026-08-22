# NARA v4 Test Console

Internal wallet-connected smoke-test UI for the verified Base v4 core. It is
separate from the preview-only basket app and does not depend on the monitor.

## First slice

- Connect Base Account first, or use an explicit Uniswap Wallet, MetaMask,
  injected-wallet, or generic WalletConnect option.
- Query wallet capabilities on Base rather than assuming that every mobile
  wallet can batch calls or use a paymaster.
- Name the exact missing Base asset for the selected action and preserve that
  action while the wallet is funded or while NARA is bought.
- Offer copy-address and immediate balance-refresh fallbacks everywhere. When
  server-side Coinbase Onramp is configured, require a one-use wallet-signed
  challenge before creating a Base-only ETH or USDC funding session.
- Verify the live token and Engine bytecode before enabling writes.
- Read NARA/USDC/ETH balances and current/stored epoch state.
- Read the live NARA/USDC pool spot price, current pre-allocation market cap,
  and fully diluted value without depending on DexScreener. The pre-allocation
  figure uses only funded, verified exclusions and does not prematurely treat
  planned Bond Vault or team-vesting transfers as completed. The console will
  use the immutable market circulating-supply oracle after deployment.
- Discover raw Engine positions from `Locked` events, with manual position-ID
  recovery when an RPC limits log queries.
- Simulate and submit exact approval, lock, claim, and unlock transactions.
- Preview the exact input-token NARA fee, amount entering the pool, 0.3% pool
  fee rate, output, and slippage minimum through the production v4 Quoter.
- Execute direct NARA/USDC swaps through the verified Universal Router route
  with a fresh quote, slippage protection, and a required pre-signature
  simulation. Existing sufficient approvals are reused.
- Detect wallet-funded atomic batching independently from optional paymaster
  support. A compatible wallet receives exact token approval, exact Permit2
  approval, and the swap as one all-or-nothing wallet action. A paymaster can
  sponsor that same batch when separately configured, but is never required
  for the one-confirmation path.
- Unsupported wallets keep exact-amount setup, swap, and revocation as
  separate explicit one-transaction actions; no fallback opens another wallet
  request automatically.
- After confirmation, reconcile the actual NARA fee from the hook's
  `PoolFeeTaken` receipt instead of reporting the earlier estimate as final.
- Read live Engine lock, unlock, and ETH-allocation fees and show them in the
  applicable transaction review; wallet gas remains separate.
- Revoke Router and token access one transaction at a time from the Trade tab.
- Track every write through `Check → Wallet → Base → Updated`, with elapsed
  time, a BaseScan link, explicit action/no-action status, and submitted-hash
  recovery after a browser reload.
- Persist EIP-5792 call IDs as well as ordinary transaction hashes, so an
  atomic action resumes its wallet/Base status check after reload instead of
  exposing the action as safe to repeat.
- Anchor the post-confirmation refresh to the receipt block and reject stale
  background reads; completed lock forms reset immediately instead of leaving
  the previous action active.
- Clear completed feedback before opening another transaction review and keep
  every review above the progress layer so its confirmation remains reachable.
- Consume the amount and quote after every confirmed swap. A new trade or
  direction change starts blank and requires a fresh amount, review, and wallet
  confirmation even when reusable trading access is still active.
- Close transaction reviews when control passes to the wallet so the tracker is
  immediately visible for the Wallet, Base, and Updated stages.
- Keep Position NFTs gated until their contracts are separately deployed.

The console never reads private keys. Every write is simulated, then explicitly
confirmed and signed by the connected wallet. Sponsorship pays network gas
only; it never supplies the Engine's required `msg.value`, so lock/unlock ETH
readiness and fee review remain mandatory.

### Optional Coinbase funding

Coinbase funding fails closed unless all four server bindings exist:

- `CDP_API_KEY_ID`: encrypted Pages secret for an ECDSA/ES256 CDP Secret API Key.
- `CDP_API_KEY_SECRET`: the matching encrypted PEM private key; never prefix it
  with `VITE_`.
- `ONRAMP_STATE`: Cloudflare KV namespace binding used for one-use wallet
  challenges and bounded per-wallet/IP session requests.
- `BASE_RPC_URL`: encrypted server-side Base RPC URL used to verify both EOA
  and smart-account signatures. It is also used by the existing read-only
  browser RPC proxy.

The browser never receives either CDP credential. `/api/onramp-session` accepts
only same-origin requests, restricts destinations to the connected wallet on
Base, allows only ETH or USDC, verifies a short-lived wallet signature, consumes
the challenge once, and returns only a Coinbase-hosted URL. Without these
bindings, the UI keeps three active fallbacks: open the Base app/Coinbase flow,
open Uniswap's multi-provider Buy surface, or copy the exact Base destination
address. The Balances panel always exposes separate `Add USDC` and `Add ETH`
actions.

### Optional redacted error telemetry

Sentry is disabled by default. The browser loads the Sentry chunk only when a
maintainer intentionally sets the public `VITE_SENTRY_DSN`. The console never
sets a Sentry user and disables default PII, tracing, and session replay.
Before transmission it redacts wallet addresses, transaction hashes, URL query
values, authorization-shaped strings, calldata-labelled fields, and user
objects. Known MetaMask listener/liveness noise is filtered so application
exceptions remain visible. A `VITE_` value is public browser configuration;
never place a Sentry auth token there.

### Optional protected gas sponsorship

Gas sponsorship fails closed unless these server bindings exist:

- `CDP_PAYMASTER_URL`: encrypted CDP endpoint for Base. Never use a `VITE_`
  prefix or place this URL in browser code.
- `CDP_PAYMASTER_POLICY_ID`: optional server-side policy ID when the endpoint
  configuration requires it.
- `PAYMASTER_STATE`: a separate Cloudflare KV namespace for one-use challenges,
  short-lived call-bound tickets, replay binding, and rate counters.
- `BASE_RPC_URL`: server-side Base RPC used for ERC-1271/6492 signature checks
  and account-implementation verification.

The browser receives only the same-origin `/api/paymaster` URL and a short-lived
ticket. The proxy accepts only Base EntryPoint v0.6 stub/final-data requests,
decodes the smart-account call wrapper, and matches it to the wallet-signed
calls hash. Its policy permits only the fixed production Engine, NARA, Base
USDC, Permit2, Universal Router, Hook, pool configuration, method selectors,
amount bounds, approval spenders, and deadlines. It also pins the supported
Base Account implementation and rejects fresh-account `initCode` sponsorship.

Cloudflare KV counters are not a substitute for the CDP controls. Before this
feature is enabled, configure a CDP contract allowlist plus conservative
per-operation, per-address, and global spend limits. Without those controls,
leave `CDP_PAYMASTER_URL` unset; the UI automatically retains the normal wallet
path.

The sponsored one-action path first requests a non-transaction sponsorship
signature, then the wallet confirms the atomic transaction. Wallet-funded
atomic execution does not request that sponsorship signature. Existing
sufficient approvals are reused. If sponsorship is unavailable but atomic
batching is supported, the wallet pays network gas and retains the same atomic
trade path. If protected simulation or wallet batching is unavailable, nothing
is submitted automatically and the separate exact-amount setup action becomes
visible.

### Mobile approval compatibility rule

This is a permanent low-friction and least-authority requirement for Trade:

1. Wallet atomic capability and paymaster capability are separate facts. Never
   gate `wallet_sendCalls` behind paymaster configuration.
2. When atomic execution is `ready` or `supported`, submit one batch containing
   only the missing exact ERC-20 approval, the missing exact Permit2 approval,
   and the reviewed swap. Set `forceAtomic`; all calls succeed or all revert.
3. Approval amounts equal the reviewed trade input. The batch's Permit2 expiry
   equals the short swap deadline. Successful execution consumes the approvals;
   the default mobile path must not request unlimited USDC or NARA access.
4. Simulate the complete batch before opening the wallet and persist its
   EIP-5792 call ID before polling. A timeout or reload must not expose the same
   trade as safe to repeat.
5. A wallet without atomic support gets explicit exact-amount setup actions.
   The console must not automatically open the next wallet request.
6. If a wallet advertises atomic support but rejects the batch before
   submission, persist compatibility mode for that Base wallet. Show the user
   exact setup actions on the next attempt and provide an explicit control to
   retry atomic mode later. Never submit the sequential fallback automatically.

Why this rule exists: on 2026-08-15 the Coinbase `keys.coinbase.com/sign`
mobile surface rejected a Base USDC `MaxUint256` approval for wallet
`0x9a7B...aC26` with a generic pre-submission error whether gas was selected in
ETH or USDC. The wallet had sufficient ETH and USDC, both contract calls passed
Base simulation, and no allowance or transaction was created. The exact
three-call batch subsequently passed live Base simulation. Coinbase then also
rejected the exact atomic batch before submission even though its review showed
the correct `-11 USDC / +NARA` asset change and the same 11-USDC batch passed
all three live Base simulations. The console therefore retains exact atomic as
the preferred path but provides a wallet-scoped compatibility fallback. Do not
restore unlimited approval as the default in an attempt to save prompts.

## Run

```powershell
npm run ui:v4:install
npm run ui:v4
```

Open `http://127.0.0.1:4174`.

Fast read-only production binding check:

```powershell
npm run check:live
```

Fast local edit loop from the repository root (browser builds, RPC boundary,
console-focused tests, and the mobile/desktop Playwright regression; no
unrelated contract suite):

```powershell
npm run ui:v4:verify
```

`npm run sync:contracts` extracts only the required ABI entries from the local
Hardhat artifacts and binds them to the checked-in production activation
manifest. It runs automatically before development and production builds.

## Temporary mobile preview

The current direct-upload Cloudflare Pages preview is:

`https://nara-v4-console-preview.pages.dev`

- Cloudflare project: `nara-v4-console-preview`
- Pages production branch label: `mobile-preview`
- Direct uploads must use `--branch mobile-preview`; uploading to `main` creates
  only a branch preview and does not update the canonical URL.
- On desktop, `Open site on phone` reveals a locally hosted QR code for the
  stable preview URL; it is deliberately labelled as a website handoff rather
  than a wallet-pairing QR. The control is omitted on phone-sized screens.
- This is a temporary test deployment of the local working tree, not a tagged
  release or a replacement for the protected GitHub release process.
- The Base RPC provider is stored as the encrypted Pages secret
  `BASE_RPC_URL`; it is not embedded in `dist` or exposed to browser code.
- `/base-rpc` accepts only same-origin browser requests and an explicit
  read-only JSON-RPC allowlist. It rejects transaction-broadcast methods.
- The preview is publicly reachable by URL and is marked `noindex`; `noindex`
  is not authentication. Remove or place it behind Cloudflare Access after
  mobile testing if it will not remain an intentionally public test surface.

Verification:

```powershell
npm run check:proxy
npm run build
npx --yes wrangler@4.63.0 pages functions build functions --outdir .wrangler/functions-build-check
npm run check:preview -- https://nara-v4-console-preview.pages.dev
```

The live browser check uses a 390 x 844 mobile viewport and fails unless the
page, Base chain ID, core bytecode, protocol overview, security headers, and
read-only RPC boundary all pass. The RPC proxy permits `eth_simulateV1` only
for complete actions that pass the same NARA call policy; transaction-broadcast
methods remain blocked. Changing a Pages secret or KV binding requires a new
Pages deployment before the new binding is active.

## Standalone NARA Swap preview

Retired 2026-08-17. `https://nara-swap-preview.pages.dev` now returns a
reversible HTTP 302 redirect to the console. Use the separate `NARAswap` tab at
`https://nara-v4-console-preview.pages.dev/` for current testing. The material
below documents the former standalone surface.

The isolated mobile-first swap surface is deployed separately at:

`https://nara-swap-preview.pages.dev`

It reuses the production-tested trade module but does not register the hosted
Base Account/passkey connector that failed before broadcast in mobile testing.
It offers wallet-app, WalletConnect, and injected-browser paths, with a separate
wallet-session storage key. This is a test surface, not the publishable basket
frontend.

Commands:

```powershell
npm run dev:swap
npm run build:swap
npm run check:swap-preview
```

The complete execution policy, verification evidence, and remaining real-device
proof are recorded in
`../../docs/NARA_V4_SWAP_MOBILE_PREVIEW_2026-08-16.md`.
