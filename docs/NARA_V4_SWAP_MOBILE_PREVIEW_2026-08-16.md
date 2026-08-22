# NARA v4 standalone swap mobile preview — 2026-08-16

## Status

Updated 2026-08-17: the standalone swap origin is retired. It now returns an
HTTP 302 redirect to `https://nara-v4-console-preview.pages.dev/`. The direct
v4 swap is available there as the separate `NARAswap` console section.

The move keeps wallet connection and transaction requests on the existing
console origin. It does not prove that Coinbase Wallet has removed any domain
warning; that still requires a fresh real-device wallet test.

## Why this page exists

Desktop NARA/USDC swaps already proved the production Uniswap v4 route. The
failed mobile attempts were stopped by the hosted Coinbase Base Account signer
before any transaction reached Base:

- the tested account remained code-empty with nonce zero;
- the copied hosted USDC-paymaster UserOperation was already outside its
  `validUntil` window when captured;
- a later standalone approval surfaced provider code `4001` even though the
  user did not intentionally cancel; and
- no transaction hash or accepted calls identifier was returned.

Changing the swap calldata could not repair that hosted signing surface. The
standalone page therefore reuses the already tested swap engine and changes the
wallet path.

## Wallet policy

The preview offers:

- Coinbase Wallet in explicit EOA-only mode;
- Uniswap Wallet;
- WalletConnect;
- MetaMask; and
- an injected Browser Wallet, including a wallet app's in-app browser.

It deliberately does not register the hosted Base Account/passkey connector.
The swap site also uses its own Wagmi storage key, so a cached connection from
the internal console cannot silently reopen the failing connector. A defensive
runtime check blocks an unexpected Base Account identity before any write.

This does not move or recover assets held by a different wallet address. A
tester must verify the full connected address before approving or swapping.

## Execution behavior

- Exact-input NARA/USDC quotes come from the pinned production v4 Quoter.
- The canonical PoolKey, hook, Permit2, and Universal Router addresses come
  from the generated production bindings.
- Contract bytecode hashes are checked before writes are enabled.
- The review shows the selected direction, input, NARA fee, pool fee, estimated
  output, protected minimum, slippage, gas disclosure, and wallet-confirmation
  count.
- A wallet that reports atomic execution as `supported` receives one
  approval-and-swap batch. All calls succeed together or revert together.
- Other wallets receive clearly labelled, user-triggered exact-approval steps;
  no next wallet prompt opens automatically.
- An atomic provider failure never auto-submits a sequential fallback. The page
  switches to visible step-by-step mode and waits for another user action.
- While a request is open or confirming, its action button is disabled and the
  page shows `Check → Wallet → Base → Updated`.
- Once Base confirms a swap, the submitted amount and quote are cleared before
  the action becomes available again.
- A pending transaction or calls identifier is restored after reload, preventing
  a blind duplicate submission.

## Deployment boundary

The active surface is Cloudflare project `nara-v4-console-preview`, production
branch `mobile-preview`. Deployment `dbdfe3ee` added the `NARAswap` section.

Cloudflare project `nara-swap-preview` is now a static redirect only. Deployment
`537c8df4` removed the standalone wallet surface and returns HTTP 302 to the
console. The redirect is intentionally reversible while wallet testing is in
progress.

The console `/base-rpc` function remains same-origin and read-only;
transaction-broadcast RPC methods return HTTP 403. Wallet writes go directly
through the wallet provider. Both URLs remain marked `noindex`.

## Verification completed

Completed before handoff:

- standalone TypeScript and production build;
- original test-console TypeScript and production build regression;
- 58 focused swap, route, wallet, progress, funding, and policy tests;
- live Base bytecode and buy/sell quote checks;
- Cloudflare Function bundle compilation;
- local and deployed browser checks at 390 × 844;
- deployed wallet-menu inspection confirming no Base Account/passkey option;
- deployed HTTP/security-header checks;
- deployed `eth_chainId == 0x2105` check; and
- deployed rejection of transaction broadcasts and cross-origin RPC calls.

Additional 2026-08-17 verification:

- 63 focused console tests passed;
- the production console and Cloudflare Function bundle built successfully;
- the live console returned Base chain ID `0x2105`, verified core bytecode, and
  rejected transaction-broadcast RPC methods with HTTP 403;
- a 390 x 844 browser check opened the separate `NARAswap` section with both
  swap directions, amount input, and execution-safety panel; and
- the retired standalone URL returned HTTP 302 with the console URL as its
  `Location`, then resolved to HTTP 200.

The first live injected-wallet buy check exposed a Base RPC
`eth_simulateV1` validation-mode incompatibility: the provider returned
`-32000 intrinsic gas too high` before any wallet prompt. The same exact
approval-and-swap calls succeeded read-only with provider validation disabled
(47,590 and 201,051 gas used). Deployment `c6776484` now retries only that
recognized validation gas-cap error, still requires every simulated call to
succeed, and only then opens the wallet. Other simulation errors continue to
stop the action.

After the confirmed MetaMask in-app-browser swap, a transient Permit2 expiry
value reached the date formatter and raised `RangeError: Invalid time value`.
Deployment `dc3177ea` bounds all provider/onchain timestamps and renders
out-of-range values as unavailable instead of crashing the React tree. The
MetaMask `contentscript.js` listener and orphaned-stream warnings originate in
the wallet bridge, not the console bundle.

A later confirmed MetaMask SDK swap exposed a short lag between the wallet RPC
and the console read RPC: the wallet returned confirmed block `0x2fc2646` while
the read service temporarily returned `-32001 block not found` for that block.
The block became readable shortly afterward. Deployment `6366ff2f` now waits
up to ten seconds for the exact confirmed block to become readable before
performing post-transaction balance and protocol reads. It retries only this
specific block-not-found condition and never resubmits the transaction.

Run the quick deployed boundary check with:

```powershell
npm --prefix tools/v4-test-console run check:preview -- https://nara-v4-console-preview.pages.dev
```

## Remaining proof

The next proof is one deliberate real-device Coinbase Wallet test on the
console origin. Until the warning is absent and a tester receives a transaction
hash that Base confirms, describe this as moving the transaction origin and
removing the old standalone surface, not as proving the warning or all mobile
swaps fixed.

Test one action at a time:

1. Open `https://nara-v4-console-preview.pages.dev/` inside the chosen wallet
   app or its in-app browser, then select `NARAswap`.
2. Connect and verify the full wallet address and Base network.
3. Enter the tester-selected amount and inspect the live fee/minimum figures.
4. Open `Review swap` and verify the stated number of wallet confirmations.
5. Confirm only the currently labelled action.
6. Require the page to reach `Updated` and show a BaseScan transaction before
   starting another action.
