# NARA-20260827-v4-post-compound-sell-fees

Date: 2026-08-27

Evidence state: `READ_ONLY_CHAIN_RECONCILIATION`

Not claimed: ownership attribution, coordinated strategy, profitability,
complete future history, or authorization for a compound transaction

## Query boundary

Canonical `PoolFeeTaken` sell events were decoded after the full-inventory
compound block. The inclusive query ran from block `50499086` through cutoff
block `50534484`, hash
`0x375a30de056a4c0b3cc11dcb82faff19bfa7fc62b44ce5335aaea3253973e04d`
(timestamp `1787858315`). Filters were the production Hook, canonical pool ID,
`isBuy == false`, and NARA input currency.

The range contains 22 matching events:

- exact aggregate sell input: `48,350 NARA`;
- exact aggregate NARA Hook fees: `2,627.5 NARA`;
- observed terminal fee tiers: `500 BPS` and `800 BPS`; and
- event blocks: `50499504` through `50500432`.

## Event reconciliation

| Block | Transaction | NARA input | NARA fee | BPS |
|---:|---|---:|---:|---:|
| 50499504 | `0xda9262405791bd78d83e27badb4c0b3ca643692de7f8aa39842cc03bedb5b5e9` | 400 | 20 | 500 |
| 50499546 | `0x6b88d8dd925a7af019bd71c643b27ea0394c54579ab304363996a0c10715222a` | 300 | 15 | 500 |
| 50499601 | `0x27b410919d1fa0b9d2637b98e696200d4d5706e6d03a4f90981dddd818ce1470` | 250 | 12.5 | 500 |
| 50499624 | `0x61f104b266dcab2ffe524be57271e2438351b3d8daa0ff0cf7f35cc265fdfb0a` | 300 | 15 | 500 |
| 50499675 | `0x9ddab4edbea61799a93c7f6aeb9891bbac79c21b750769d63c464bfde72d459e` | 1,000 | 50 | 500 |
| 50499729 | `0xe659fc00ce59783ce2b661f34d34a07dba8ca4c2b9a8aaa58b069893ded19710` | 1,000 | 50 | 500 |
| 50499746 | `0x656960c280112abc6bb7fece1a01c0da9fbe29069c4f21a741b96b5f23591639` | 700 | 35 | 500 |
| 50499781 | `0x5b769effaaa19b8bb41380f1756fd78a41c068914f591c6a1e7223137f76a977` | 1,200 | 60 | 500 |
| 50499797 | `0x7df6d3708f4c6eed235990eaa4f4516f9353b10b3da3695fd879ce094ebbf7ee` | 1,200 | 60 | 500 |
| 50499813 | `0x476d41308b02f1bb9fe3311bb06d2adf12fff4e20d496b532311660177efae8f` | 3,000 | 150 | 800 |
| 50499827 | `0x6fb24518dcc6de13f8ad50ffbe889f39ff38966deaf117b51a79b07935942da8` | 4,000 | 230 | 800 |
| 50499847 | `0x608f72964fe1b152aa0452703c6673f47a9fd0041bf4c9e17cacd598d5e83e1f` | 4,000 | 230 | 800 |
| 50499863 | `0xe68266d459ad939942d4131b0e3950d35df5552e9ec7e2b2e0eebcf782a64776` | 4,000 | 230 | 800 |
| 50499883 | `0xce89482d7a74b1b803a66393d91a43a233b89d2caf05f26215f8677cb1a5cdb4` | 3,000 | 150 | 800 |
| 50499902 | `0xd8c85ef1f121d2a2ba28a1633dd50c0aab5246d66b66ddef661e7155917c20d8` | 2,000 | 100 | 500 |
| 50500329 | `0x54c59e6f33476538bd5ebb5f6c835d9028db6c64da2d1b696979bfc4ce1dde94` | 1,000 | 50 | 500 |
| 50500347 | `0x81ac8822460a6bc308ca421b333d5e26f140db9ac78b61d7b77f46d5957f0714` | 2,000 | 100 | 500 |
| 50500367 | `0xcc262cd34199d33798ca5e0c978a8c5936d8357596b8d6fc7b2df42c62837142` | 3,000 | 150 | 800 |
| 50500383 | `0x53d4ab8bf40a22917f0cd60c990c6e015756d27d0c89e7158968a847bf0359cb` | 3,000 | 150 | 800 |
| 50500398 | `0xc336ac755e8256f052ff4eb33b5bd640c8ab324be577c9b863aea1b566e7c175` | 4,000 | 230 | 800 |
| 50500413 | `0xa75ee6e654970f561f1f0146d902a98af55c0827139dd1066538e280682b753d` | 4,000 | 230 | 800 |
| 50500432 | `0x5eb17016d5f652b478f312c3c937b4634827693815b118d3037a9bcbd4bbdfd8` | 5,000 | 310 | 800 |

Each row is one distinct transaction and one canonical decoded sell-fee event.
All 22 transaction receipts were independently fetched, had status `1`, and
matched the event's transaction hash, block number, block hash, and log index.
Event senders are omitted because events do not prove beneficial ownership,
common control, or intent.

## Cutoff balances

At the same cutoff block, direct ERC-20 reads returned:

| Custodian | NARA | USDC |
|---|---:|---:|
| `NARALiquidityGrowthVault` | 2,627.5 | 0.660000 |
| `NARALiquidityCompounderV4` | 28.423769295100595183 | 2.326460 |
| **Combined** | **2,655.923769295100595183** | **2.986460** |

The Vault NARA balance exactly equals the aggregate NARA sell fees in this
range. Its `0.660000 USDC` reflects separate buy-side fee flow and is reported
only as cutoff state. The Compounder balances are unmatched post-compound
inventory.

## Limitations

This is a finite, block-hash-pinned historical query. Events after the cutoff,
later canonical-state changes, transfers outside the filtered Hook event, swap
proceeds, costs, price impact, and offchain ownership or coordination are
outside scope. Event fees measure tokens routed to the Vault, not profit, loss,
active POL, or future compoundable liquidity.

The balance snapshot does not authorize compounding. Routine execution still
requires fresh fee-triggered inventory, current policy-compliant constraints,
minimum simulated USDC-side depth, and the separately gated maintainer path.
