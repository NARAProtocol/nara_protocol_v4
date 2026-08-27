# NARA-20260827-v4-live-buy-matrix-3s

Date: 2026-08-27

Owner: `NARAProtocol/nara_protocol_v4`

Evidence state: `TERMINAL_PARTIAL_EXECUTION_RECONCILED`

Decision: `47_OF_100_CONFIRMED_INCOMPLETE`

Not claimed: `100-buy completion`, `merged`, `deployed`, or authorization to
resume the remaining 53 buys

## Scope and result

The live Matrix attempted 100 separate exact-input buys of `11 USDC` with a
minimum three-second submission interval. Three terminal attempts produced 47
confirmed buys. The remaining 53 buys were not executed.

Every receipt was independently fetched from Base and checked for status,
receipt block/hash, and exactly one canonical `PoolFeeTaken` buy event for the
production pool, USDC input currency, reported fee, and terminal fee tier. All
47 reconciled without discrepancy.

| Attempt | Terminal state | Buys | USDC input | NARA received | Hook fee |
|---|---|---:|---:|---:|---:|
| `100x11` | `FAILED_STOPPED` | 1 | 11 | 59.852195120638428267 | 0.33 USDC |
| `99x11` resume | `FAILED_STOPPED` | 24 | 264 | 1,421.046854929165604806 | 7.92 USDC |
| `75x11` resume | `STOPPED_BY_USER` | 22 | 242 | 1,219.677802134681217031 | 7.26 USDC |
| **Total** | **incomplete** | **47** | **517** | **2,700.576852184485250104** | **15.510000 USDC** |

All buys matched the expected isolated `0.33 USDC` Hook fee. The receipt range
is block `50497498` through block `50498688`. This is a partial execution
record, not a successful 100-buy Matrix result.

## Attempt 1 — initial 100-buy run

Run ID:
`20260826T224520-843Z-4a39ec9c-a05e-46ec-87b2-50670aef32b2`.

The first buy confirmed as
`0x3ee3b52b63d4503bcec244baba590b19c4f2146746fe371d1ec1ce32fd66635c`
at block `50497498`, hash
`0x39e0f25cb4d2365428c855ff97aabe9c5ea7dfa59930c61991403c70634316da`.
The next submission failed with `NONCE_EXPIRED`: transaction nonce `499` was
below the provider's next nonce `502`. The signed raw transaction and signature
are intentionally omitted.

| Cleanup | Nonce | Transaction | Block / hash |
|---|---:|---|---|
| Permit2 zero | 502 | `0xe135caf43b58962571b12e69b92220cda995f78358d716adf617bad064d05aff` | `50497518` / `0xcf8fb0535b1a6d4e60c471a87fe8e0407aef644dbef617e4d06cdf0e02748101` |
| ERC-20 zero | 503 | `0x1075690c6f0143d6b650c07a7f1b06f40b83b4aba6f3b8ccba3ca65ca6c1ef16` | `50497521` / `0x7d9e990e9df2731f21ca3975a5fefc413f5bfb25b341535cbba6f89a8f01ab7f` |

Both receipts have status `1`. Both allowance layers read zero at terminal
block `50497521`.

## Attempt 2 — 99-buy resume

Run ID:
`20260826T225453-381Z-785d4332-5e33-4054-82ae-f0170477db31`.

Twenty-four buys confirmed from
`0xbe3facac84173cfc49e4383b36581a6795189c537fab3cc2d4132bf54b07ef9f`
at block `50497795`, hash
`0xd934453f06446570f2e758ab92fd2a8a6fa1571d60f8b8cfe969414e82802110`,
through
`0xa6bd871582a739a1906b3bfac329b4eb1b47d3c6d58bc4c5bd7b90ece872d5af`
at block `50498165`, hash
`0x2a7884a4eee32ede7fed1d9b10e7ff13071087e0e1c71409fa8519fa71af577c`.

The next trade stopped at `estimateGas` with custom-error selector
`0x8b063d73` and arguments `52772192383746342893` and
`50690407006365325339`. Configured minimum-output price protection rejected
the then-current quote; no trade transaction was submitted. Full calldata is
intentionally omitted.

| Cleanup | Nonce | Transaction | Block / hash |
|---|---:|---|---|
| Permit2 zero | 530 | `0x3673d65a9f27d52e1163d19880d3dc3aedd8d28142297f8152a01deb63d5ef46` | `50498180` / `0x55e2a9e40db8c0507d90be65161ca8b5073eb2cf7dc3eefa10f719e3969b22df` |
| ERC-20 zero | 531 | `0x6d5533d9da982a913fbfcbd61a0709ba07a255b94a9e4726acaca213f67f8df9` | `50498183` / `0x990c29f9aebc6382aac1fbc4088bace794766b8a74e2359a6c8dff326037e0f7` |

Both receipts have status `1`. Both allowance layers read zero at terminal
block `50498183`.

## Attempt 3 — 75-buy resume and operator stop

Run ID:
`20260826T231419-816Z-3126f5f8-9326-47c4-adaa-5a5e4fa2d18f`.

Twenty-two buys confirmed from
`0x38c11ee051efa070ce562e2e2fc64823789a16b7b3c9d7869cbeaafba5ec3fb0`
at block `50498373`, hash
`0x4371cc47b9cbbe7bd4f95f010ba90dfcf1103dc8d18cf85b4ceec7a45e5e5fa1`,
through
`0xc128459cb5d4dbb7fbb4492b53fc9fae9bf9e3150dc588a1e0138d3947c41cbf`
at block `50498688`, hash
`0x5fb527bd4df5d0c52715ddd3cf10ac8dc4cef412fcfd480aba7cdd9bfe636896`.

The operator stopped the bot after buy 22. The terminal reason is
`USER_REQUESTED_AFTER_BUY_22`. Manual post-interrupt cleanup confirmed:

| Cleanup | Nonce | Transaction | Block / hash |
|---|---:|---|---|
| Permit2 zero | 556 | `0x23b62c00b2f969e4b528bd98230fc559b0d62008e1586bd8ff1aafb92ad64c6f` | `50498722` / `0x18f7c566279cf9dce2155d76c996f813cc490d4cfb7f250a739e259bb7d564c9` |
| ERC-20 zero | 557 | `0x4d6c7276bb615ad7b9026ea8aacd3abb0d54a33e4c7f50cbb12c94894dcab7bf` | `50498725` / `0x144365332562d2a44666d1bd125b418da32c9326c4f252ebec889b03940066e2` |

Both receipts have status `1`. Both allowance layers read zero at terminal
block `50498725`.

## Evidence boundary

Ignored timestamped reports were used only as transaction indexes. Every trade
and cleanup fact above was independently checked onchain. Mutable
`*-latest.json` aliases, local preflight balances, signed raw transactions,
signatures, full calldata, RPC values, and secrets are not reproduced here.

The runner remained sequential and receipt-gated. Actual spacing was longer
than three seconds because quoting, submission, mining, and receipt verification
were serialized. This record does not authorize a resume, establish
profitability, or complete the original 100-buy objective.
