# NARA-20260827-v4-live-buy-matrix-3s

Date: 2026-08-27

Owner: `NARAProtocol/nara_protocol_v4`

Evidence state: `prepared`, `read-only preflight passed`

Not claimed: `executed`, `completed`, `merged`, or `deployed`

## Scope

This operations-only change adds an explicitly confirmed three-second minimum
schedule to the buy-only live Matrix. The requested run is 100 separate buys
of exactly 11 USDC each: 1,100 USDC gross plus Base gas, with hedging disabled.

The runner enforces at least three seconds between actual submissions, remains
sequential, waits for canonical confirmations, and rejects any trade that does
not mine in a distinct strictly later block. Confirmation and verification can
make actual spacing longer, never shorter.

No contract, ABI, address, role, manifest, keeper, or deployed runtime changes.

## Production gate

The six-second legacy confirmation cannot authorize this mode. The exact gate
for the prepared 100-buy, three-second schedule is:

`V4_LIVE_TEN_MIN_BUY_CONFIRMATION=BUY_NARA_100_X_11_USDC_3_SECOND_MINIMUM`

The runner also requires `--execute`. An execute invocation without the exact
confirmation exits before provider or signer construction. A partial resume
receives a new confirmation bound to the remaining count.

Each launch receives a unique immutable run ID and atomically updated evidence
file. `deployments/v4-live-buy-tax-3s-100x11-latest.json` is updated only after
terminal persistence and contains a pointer to that run; prior evidence is not
overwritten.

## Read-only preflight

The hardened three-second, 100-buy configuration passed at Base block
`50,497,404`, hash
`0x08cfe73599bbef903570320dee1e08d00a446c74e2c7c36bb69fed97e5c94026`:

- chain ID `8453` and the fresh-v4 production bindings passed;
- wallet USDC: `1,203.624303`; required gross buy budget: `1,100 USDC`;
- wallet ETH: `0.003994823842849454`; modeled full-run requirement:
  `0.0023344 ETH` across approvals, 100 trades, cleanup, buffered execution gas,
  and fixed per-transaction L1 buffers;
- ERC-20 and Permit2 USDC allowances were zero;
- the official V4Quoter returned `59.852195120638428267 NARA` for one
  `11 USDC` buy;
- expected isolated Hook fee: `0.33 USDC` per buy, `33 USDC` baseline total;
- active pool liquidity and runtime code/hash checks passed.

The preflight did not load the private key, constructed no transaction, and
sent nothing.

## Verification

- focused schedule, gas-budget, runtime, one-click, and production-guard tests:
  `25 passing`;
- scoped strict TypeScript: pass;
- direct missing-confirmation fail-closed check: pass;
- PowerShell launcher missing-confirmation fail-closed check: pass;
- PowerShell parse and parameter-isolation checks: pass;
- configured three-second read-only preflight without a private key: pass.

The workspace one-click entry point is `RUN-NARA-100-BUY-MATRIX.cmd`. It shows
one review dialog defaulted to `No`, blocks concurrent launches with a named
mutex, loads the existing local environment without displaying secrets, and
then invokes the hardened production runner.

Execution remains pending the exact typed production confirmation above.
