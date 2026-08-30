# NARA v4 test-console and operations checkpoint — 2026-08-15

> **Historical checkpoint.** This file records the state observed on
> 2026-08-15. It is not current authority for Position NFT deployment,
> automation, liquidity, or product availability. Use `CURRENT_STATE.md` and
> its latest referenced manifests/releases. The canonical contracts and pool
> are in technical live testing; this does not establish public availability or
> legal approval.

Change ID: `NARA-20260815-v4-test-console-checkpoint`

Status: live Base evidence recorded; console improvements remain local on the
feature branch until they are committed and merged through protected CI.

This is an internal engineering checkpoint, not an audit or a claim that the
whole protocol is production-ready. It records what was actually exercised,
what the local console now supports, and what remains unproved.

## Authority and repository state

- Repository: `NARAProtocol/nara_protocol_v4`
- Local branch: `feat/v4-test-console-20260815`
- Branch base and `origin/main` at this checkpoint:
  `b2224433c3840b2c656dad7e506d15442685bea2`
- Immutable deployed-contract origin:
  `027af3f06bbe6dea2c187dfd8062e50c228f1c35`
- Production activation manifest:
  `deployments/v4-production-activation-2026-08-09.json`
- Production Engine: `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC`
- Production NARA: `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1`
- Production Hook: `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088`
- Production Safe: `0xd65c0e390Dc187A22c52c03816591CC736C0D755`

The console, its focused tests, and this checkpoint were uncommitted local work
when this record was written. They are not release authority until committed,
reviewed, and merged. No contract source was edited.

## Epoch maintenance

The earlier 522-epoch recovery remains pinned in
`deployments/v4-engine-epoch-recovery-2026-08-14.json`. Its three successful
Safe executions advanced stored epochs `35 → 235 → 435 → 559`.

Current GitHub state was read on 2026-08-15:

- Workflow `324678194`, `NARA v4 epoch maintainer`, is `active`.
- Repository variable `V4_EPOCH_MAINTAINER_ENABLED` is `true`.
- Dedicated keeper address is
  `0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD`.
- Schedule is `7,37 * * * *` (minutes 7 and 37 of every UTC hour).
- Required secret names `BASE_RPC_URL`, `V4_EPOCH_HEARTBEAT_URL`, and
  `V4_EPOCH_KEEPER_PRIVATE_KEY` exist; no secret values were read or recorded.
- Latest checked scheduled run was
  [31880640254](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/31880640254),
  created `2026-08-15T10:53:09Z`, completed successfully at
  `2026-08-15T10:53:55Z`, on commit
  `b2224433c3840b2c656dad7e506d15442685bea2`.
- At Base block `50001734`, Engine current/stored epochs were `628 / 628` and
  backlog was zero.

The external heartbeat check is connected and receiving pings. Its alert/grace
timing is intentionally left for a 24-hour observation pass; it works but its
operator-facing timing is not treated as final. Liquidity maintenance remains
disabled and was not changed by this work.

## Hook trading path exercised through the console

Four wallet-confirmed Base buys from
`0xAE9D1667B45558232BeD9d45DcCA53940F892aB5` reached the verified Universal
Router and emitted the canonical Hook `PoolFeeTaken` event:

| Base transaction | Block | USDC input | Hook fee | Effective Hook fee |
|---|---:|---:|---:|---:|
| `0xa437fd5543716b1bbe0ef810ac2818074ae4203b0d881e4ce30d55aee94f2ae7` | `49996860` | `1` | `0.05 USDC` | `5%` |
| `0x80dfb68e76e6f2298af2fdd146d05ca277aff77abdeb55f15d0faf888e868dcb` | `49997226` | `1` | `0.05 USDC` | `5%` |
| `0x14f3169d20d0d633525ada61e27faa5ffe4566fc0c0b514d5ef7d2d79acf439e` | `49997252` | `1` | `0.05 USDC` | `5%` |
| `0x9d23d942a67cc1510240ef5ed0d65f858adbd843cf0b936ab0ab3ed813b23550` | `49997492` | `2` | `0.1 USDC` | `5%` |

The final buy delivered exactly `161.338136538411231285 NARA` to the wallet.
The pool fee was `0.3%`, included in the quoted/executed pool output rather than
reported as a second wallet deduction. Slippage remained a protection limit,
not a fee.

The console now reconciles the actual Hook fee from the confirmed
`PoolFeeTaken` receipt. It does not present a pre-transaction estimate as the
executed fee.

## Engine fees activated and reconciled

Safe nonce `38` executed successfully with both required confirmations:

- Safe transaction hash:
  `0x6290fccdf5cf14d33d7fc95d142071d6075e04188f87eef4b7e51ffc4920d237`
- Base transaction:
  `0x7de46edff9ae04564c5510a4a3088ce00c048765e4096a4f69b9a81cbf815932`
- Base block: `50001061`
- Four emitted Engine parameters:
  - `lockFeeBps = 100` (`1%`)
  - `claimFeeBps = 100` (`1%`, Engine ETH allocations only)
  - `lockFeeWei = 1000000000000` (`0.000001 ETH`)
  - `unlockFeeWei = 1000000000000` (`0.000001 ETH`)

These Engine fee setters activate immediately. They do not use the Hook's
seven-day curve-update delay. The Hook curve was not changed and its live base
trade tier remained `5%` for the recorded small trades.

At Base block `50001793`, the Engine held `0.000003 ETH` in
`accumulatedTreasuryEthFees`, exactly matching three post-activation locks at
`0.000001 ETH` each. Total live locked principal was `128.7 NARA`.

## Engine position lifecycle evidence

Positions `#1` and `#2` were each created with `10 NARA`, passed their scheduled
activation/maturity epochs, and were later unlocked successfully:

| Position | Unlock transaction | Block | Principal returned |
|---|---|---:|---:|
| `#1` | `0x9a13bcf5d66ca59e1970b29b959433c92d890c63671d73d3e39d609d2f90f6ef` | `49999877` | `10 NARA` |
| `#2` | `0x0d89125dc5858993bb98ae7c2cef5606f88425d8d925405e624dd82cb99918f4` | `49999868` | `10 NARA` |

Those unlocks occurred before the nonzero Engine fees were activated, so they
do not prove collection of the new flat unlock fee.

Three locks executed after fee activation. Receipt transfers reconcile gross
input, the `1%` NARA fee returned by the Engine to the treasury, and net stored
principal:

| Position | Owner | Transaction / block | Gross input | NARA fee | Net principal | Activates / unlocks |
|---|---|---|---:|---:|---:|---|
| `#3` | Treasury `0xfe3A…E8e` | `0x85cb72c16b0231604a4ce290b8ccbd9973d482153ecb47c47e5b1132c4cb5461` / `50001289` | `10` | `0.1` | `9.9` | `636 / 637` |
| `#4` | Test wallet `0xAE9D…2aB5` | `0xf7a5d07abdf924ce02305decf65f3016a5dd3f3ddc4f7a02d8c210fd3f50d17b` / `50001316` | `20` | `0.2` | `19.8` | `636 / 638` |
| `#5` | Test wallet `0xAE9D…2aB5` | `0x5aac7689b43cbe6ed44e26b8970b21f187a02fe13d8f8ad9ded6b8e25a374db3` / `50001732` | `100` | `1` | `99` | `637 / 638` |

At position readback block `50001750`, current/stored epoch was `628 / 628`.
Positions `#3..#5` were waiting for activation and had zero claimable NARA and
ETH. Positions `#1` and `#2` stored zero principal after unlock.

## Test-console solutions now implemented locally

- Verified fixed production addresses and runtime bytecode before writes.
- Exact fee math for Hook trades and Engine lock/claim/unlock reviews.
- Direct NARA/USDC buy and sell through the verified Universal Router.
- Live pool spot price, current pre-allocation market cap, and fully diluted
  value on the Overview tab. The pre-allocation figure uses the verified Reward
  Reserve and burn balances as current exclusions. It does not count the
  planned `200,000 NARA` Bond Vault or `40,000 NARA` team-vesting exclusions
  before those allocations are funded and verified, and will be replaced by
  the immutable market circulating-supply oracle after deployment.
- Wallet-funded atomic trade batching is detected independently from optional
  paymaster support. Compatible wallets receive exact trade-sized token and
  Permit2 approvals plus the swap in one all-or-nothing wallet action.
  Existing sufficient approvals remain reusable; wallets without atomic
  support retain separate exact-amount setup and revocation actions.
- Fresh quote, protected minimum, and simulation immediately before the wallet.
- Post-swap balance refresh and actual Hook fee receipt reconciliation.
- Raw Engine lock discovery, manual position recovery, and action-led
  lock/claim/unlock controls.
- Position language translates contract weight into reward-share mechanics and
  keeps raw details behind disclosure controls.
- A fixed transaction tracker for every write:
  `Check → Wallet → Base → Updated`.
- Submitted transaction hash, elapsed time, BaseScan link, explicit
  `Your action needed` / `No action needed` states, and no fake progress
  percentage.
- Submitted transaction recovery after a browser reload. Only the public hash,
  action label, and start time are stored locally; no key or signature is
  stored.
- If receipt checking pauses, duplicate writes remain blocked and the tracker
  exposes `Check status`. If Base confirmed but UI refresh fails, the console
  says not to repeat the transaction.
- Confirmed writes now refresh from the exact receipt block. A monotonic block
  guard prevents an older background read from restoring stale balances or
  allowances afterward. A completed lock also clears and collapses its form,
  so the previous blue lock action cannot remain active or be repeated.
- Opening a new lock, claim, unlock, or trade review clears completed feedback
  from the previous action. Review dialogs also sit above the progress tracker,
  so stale feedback cannot cover the next confirmation control.
- A confirmed swap consumes and clears its amount and quote instead of
  rebuilding the same trade. Fresh sessions and direction changes also start
  with no amount. Every later swap therefore requires a newly entered amount,
  a fresh quote, explicit review, and a new wallet confirmation.
- Transaction reviews now close as soon as control passes to the wallet. The
  progress tracker then becomes the single visible surface for Wallet, Base,
  and Updated stages; this applies to swaps, claims, and unlocks.
- Mobile wallet routing now puts Base Account first and exposes Uniswap Wallet
  plus WalletConnect only when a valid Reown project ID is configured. The QR
  control is explicitly a website handoff, not a wallet-pairing claim.
- Every buy, sell, lock, and unlock now has an action-specific Base readiness
  result. Missing USDC, NARA, or Engine-fee ETH opens the matching next action;
  the interrupted form is wallet-scoped, expires, and resumes after funding or
  after buying NARA.
- Optional Coinbase funding is server-only and fails closed. It uses a
  one-use challenge, Base smart-account-capable signature verification, a
  Base-only ETH/USDC destination, and KV-backed rate bounds. The Balances panel
  now always exposes separate `Add USDC` and `Add ETH` actions. When direct
  Coinbase checkout is unavailable, the funding sheet retains active Base
  app/Coinbase, Uniswap multi-provider, copy-address, and balance-refresh paths.
- An optional CDP paymaster proxy now keeps the endpoint outside browser code,
  requires a wallet-signed call hash, binds each short-lived ticket to one
  user operation, and rate-bounds ticket creation. It accepts only Base
  EntryPoint v0.6 stub/final-data methods.
- The paymaster call policy decodes the Coinbase/Base Account execution wrapper
  and permits only bounded calls to the fixed production Engine, NARA, Base
  USDC, Permit2, Universal Router, Hook, and pool. It checks exact selectors,
  approval spenders, lock amounts/durations/minimums, claim recipients, router
  actions, currencies, fee/tick/hook, settlement, protected output, and short
  deadlines. Unsupported or new account implementations fall back closed.
- Atomic trade batching is offered automatically only after the current wallet
  address has completed its own provisioning check. For Base Account,
  non-empty deployed code and a freshly reported atomic status of `supported`
  are required; `ready`, unknown, code-empty, and address-switch states remain
  sequential. Missing approvals are limited to the reviewed input amount and
  the Permit2 approval uses the short swap deadline. No failed atomic or
  sponsored path opens a fallback transaction automatically.
- Coinbase mobile compatibility was reproduced with wallet
  `0x9a7B...aC26`. Live reads showed sufficient ETH and USDC and zero approval
  at both trade layers; both individual approvals and the complete atomic buy
  passed Base simulation. Coinbase's hidden signing diagnostic then proved the
  wallet had constructed the counterfactual account deployment, exact USDC and
  Permit2 approvals, router swap, gas fields, and an ERC-20 paymaster-backed
  UserOperation without a NARA contract revert.
- The copied paymaster authorization had `validUntil = 2026-08-15 20:34:40
  UTC`, while the diagnostic was captured at `20:34:56 UTC`. EntryPoint v0.6
  deterministically rejects that state as `AA32 paymaster expired or not due`.
  The captured failure was therefore a stale hosted Coinbase gas quote, not an
  insufficient balance, malformed NARA route, Permit2 failure, or Hook revert.
  The full raw diagnostic, signatures, long call data, and provider material
  are intentionally not recorded in this repository.
- The corrected first-use flow does not send a code-empty Base Account directly
  into the long atomic review. It asks for one short, exact token-to-Permit2
  action, waits for Base, then re-reads deployed code and wallet capabilities.
  Only a confirmed `supported` state can restore atomic execution. An atomic
  rejection closes the review, activates exact sequential setup, preserves the
  nested provider error code/details for a copyable redacted diagnostic, and
  instructs the user to close the hosted signing page rather than reuse its
  stale in-page retry. Every raw `wallet_sendCalls` call now carries explicit
  `value: 0x0`, and the Base Account client is pinned to `2.5.10`.
- The controlled mobile retest of that standalone exact approval also stopped
  inside the hosted Coinbase signer. A post-attempt Base read at block
  `50019263` still showed empty account code and nonce `0`, proving that no
  transaction or account deployment reached Base. The installed Base Account
  SDK routes both `eth_sendTransaction` and `wallet_sendCalls` through that
  hosted popup outside the Base app browser, so further request-shape retries
  on the same signing surface were discontinued.
- The deployed recovery changes the signing surface. The wallet chooser now
  separates `Wallet apps` from `Base Account (passkey)` and forces the legacy
  Coinbase Wallet option to its EOA/mobile route. A failed pre-submission Base
  Account action now offers one `Copy for Base app` action and directs the user
  to open the site in Base app Explorer, choose Browser Wallet, and verify the
  full connected address before continuing. The EOA fallback is a separate
  wallet and is not represented as sharing the Base Account's funds or
  allowances.
- The first Base app Explorer retest did not actually change connectors. The
  copyable diagnostic identified `Connector: baseAccount`, provisioning state
  `required`, and provider code `4001` / `User cancelled transaction`, although
  the user did not cancel. A post-attempt read at block `50019997` again showed
  empty code, nonce `0`, and zero approvals. This proves that the cached Base
  Account session reopened the same hosted signer and that the `4001` message
  is not reliable evidence of a human rejection in this incident.
- The console now detects the Base app injected environment and exposes a
  persistent `Use Base app wallet` banner plus a direct stopped-action switch.
  The action
  disconnects the cached Base Account connector, connects the `injected`
  Browser Wallet connector, requires the returned address to match the prior
  address exactly, and submits no transaction. A mismatch is disconnected and
  blocked.
- Sponsorship covers network gas only. Engine lock/unlock `msg.value` remains a
  user-funded, explicitly reviewed readiness requirement.
- Submitted EIP-5792 call IDs are wallet-scoped and restored after reload, just
  like ordinary transaction hashes, so a status-check gap does not reactivate
  the same value-bearing action.

The console does not chain a second wallet request automatically.

## Verification completed

| Check | Result |
|---|---|
| Console production build (`npm run build`) | Passed on 2026-08-15 |
| Full focused test-console suite | `52 passing`, `0 failing` |
| Cloudflare Pages Functions bundle (`wrangler pages functions build`) | Passed on 2026-08-15 |
| Cloudflare Pages preview deployment | Persistent same-address connector switch published to `https://nara-v4-console-preview.pages.dev` on 2026-08-16; deployment `7bb0ec58`, asset `/assets/index-d8t2FPid.js` |
| Cloudflare production routing | Canonical project branch verified as `mobile-preview`; `main` is preview-only |
| Deployed preview smoke check | Passed: HTTP 200, security headers, Base chain `8453`, core bytecode, protocol overview, mobile layout, and QR handoff |
| Pages RPC boundary check (`npm run check:proxy`) | Passed; broadcast methods blocked and `eth_simulateV1` limited to policy-valid NARA actions |
| Live Base atomic lock simulation | Passed at block `50011904`; approval and lock calls both simulated successfully; no transaction submitted |
| Live Base exact atomic buy simulation | Passed for wallet `0x9a7B...aC26` at block `50017308`; exact USDC approval, exact Permit2 approval, and protected swap all succeeded in simulation; no transaction submitted |
| Live Base exact 11-USDC atomic buy simulation | Passed for wallet `0x9a7B...aC26` at block `50017578`; all three calls succeeded although Coinbase rejected the corresponding wallet review before submission |
| Official Base Account binding read | Factory `0xba5e…5842`; implementation `0x0000…534d`; both bytecode hashes verified at chain ID `8453` |
| Transaction-progress plus trade focused tests | `16 passing`, `0 failing` |
| Engine fee-batch focused tests | `3 passing`, `0 failing` |
| Live runtime/fee read | Passed; bytecode hashes verified; fees `100 / 100 / 1e12 / 1e12` |
| Market-data math tests | `5 passing`, `0 failing` |
| Live market read | Passed at block `50007300`; price `0.013336766254509049 USDC/NARA`, provisional supply `350000.000004048989591643 NARA`, provisional market cap `4667.86818913216757775 USDC`, FDV `13336.766254509049 USDC` |
| Latest epoch-state read | Current/stored `628 / 628`, backlog `0` |
| Fee activation receipt | Status `1`; all four `UintParameterSet` events reconciled |
| Post-fee lock receipts | Three successful; NARA transfers, net principal, and flat ETH accumulation reconciled |

The build still reports large wallet-library chunks above Vite's `500 kB`
warning threshold. That is a performance task, not a correctness failure.

## Open items — do not treat as complete

1. Commit the console, tests, scripts, and this checkpoint on the feature branch;
   review the full diff and secret scan; then open a pull request with required
   CI. Until then, local console changes are not durable release history.
2. After a post-fee position matures, execute one reviewed unlock and reconcile
   the `0.000001 ETH` flat unlock fee. The fee is configured but not yet proven
   by a post-activation unlock receipt.
3. A positive Engine ETH allocation does not currently exist. Therefore the
   `1%` ETH allocation claim fee is configured but has not been exercised with
   a nonzero ETH reward. NARA allocations have no Engine claim fee.
4. Observe the GitHub maintainer plus external heartbeat for 24 hours and adjust
   only the monitor timing if alerts are early or noisy. Do not alter Engine
   scheduling to satisfy the monitor.
5. At this 2026-08-15 checkpoint, liquidity automation was disabled, baskets
   were preview-only, and Position NFT/periphery was not deployed. This state
   was superseded; use `CURRENT_STATE.md` for the current gates.
6. No independent audit was performed by this checkpoint. Do not describe the
   console or protocol as bug-free, audited, or fully production-ready.
7. Coinbase funding and paymaster code is deployed fail-closed but remains
   unavailable until its encrypted Pages secrets and separate KV bindings are
   configured and that configuration receives a fresh preview check. Before
   enabling sponsorship,
   configure the CDP contract allowlist and conservative per-operation,
   per-address, and global spend limits. Do not expose the CDP Paymaster URL.
8. The sponsored path is intentionally limited to the pinned deployed Base
   Account implementation. A newly created or differently upgraded account
   uses the normal wallet path until its implementation is separately reviewed
   and pinned.
9. Coinbase's hosted universal-USDC gas quote is outside the console's control,
   and the shorter standalone request did not bypass that hosted signer. The
   Base app Explorer/injected signing route was not proven by a completed
   mobile transaction. On 2026-08-16 the user explicitly deferred further
   mobile testing to avoid spending more launch time on this integration.
   Treat mobile Base Account writes as unavailable, not partially complete,
   until a new explicit work order resumes them. The production low-friction
   Base Account path still requires configuring the console's own CDP
   paymaster proxy and policy, then testing it with provider logs. A failed
   hosted Coinbase page and its in-page retry must not be treated as a fresh
   quote.

## Next safe action

Do not continue mobile Base Account testing unless the user explicitly resumes
it. The deferred test would begin with the connector-only `Use Base app wallet`
action and must verify the same address before any approval, but it is not the
current next task. Repository durability remains required: inspect and commit
the focused diff, run the non-fork release gate, and open a protected pull
request before treating the accumulated console work as durable release
history.
