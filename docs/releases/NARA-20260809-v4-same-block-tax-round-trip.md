# NARA v4 Same-Block Tax Round-Trip Evidence

Change ID: `NARA-20260809-v4-same-block-tax-round-trip`

Date: 2026-08-09

Network: Base (`8453`)

Contract source commit:
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`

Deployment authority:
`deployments/v4-production-activation-2026-08-09.json`

## Outcome

Two live Base transactions exercised the fresh canonical NARA/USDC Hook in
both directions. The first transaction executed twenty `3 USDC` exact-input
buys in one atomic Universal Router call. The second transaction sold the exact
NARA output of the buy through twenty exact-input actions in one atomic call.

Both receipts succeeded. The expected cumulative Hook fee, emitted Hook fee,
Vault record, and PoolManager-to-Vault token transfer matched exactly in both
directions. The tests also confirmed that the active LP liquidity did not
change and the temporary ERC-20 and Permit2 allowances ended at zero.

This is evidence that repeated Hook callbacks for one input currency aggregate
through the deployed per-block pressure curve. It is not an external security
audit or a live multi-wallet/multi-transaction ordering test.

## Deployment under test

| Item                          | Value                                                                |
| ----------------------------- | -------------------------------------------------------------------- |
| NARA                          | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1`                         |
| USDC                          | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`                         |
| Hook                          | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088`                         |
| Vault                         | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`                         |
| PoolManager                   | `0x498581fF718922c3f8e6A244956aF099B2652b2b`                         |
| Universal Router              | `0x6ff5693b99212da76ad316178a184ab56d299b43`                         |
| Pool ID                       | `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464` |
| Seed LP NFT at test time      | `2898124`                                                            |
| Active liquidity at test time | `4242640687119285`                                                   |
| Configured USDC depth         | `300 USDC`                                                           |
| Configured NARA depth         | `60,000 NARA`                                                        |
| Standard Uniswap pool fee     | `3000` (`0.30%`)                                                     |

Deployed buy curve:

| Cumulative input pressure | Marginal Hook rate |
| ------------------------: | -----------------: |
|         Up to 5% of depth |                 5% |
|       Above 5%, up to 15% |                 8% |
|      Above 15%, up to 30% |                12% |
|                 Above 30% |                20% |

Deployed sell curve:

| Cumulative input pressure | Marginal Hook rate |
| ------------------------: | -----------------: |
|         Up to 5% of depth |                 5% |
|       Above 5%, up to 15% |                 7% |
|      Above 15%, up to 30% |                10% |
|                 Above 30% |                15% |

Both deployed curve records have a `maxFeeBps` cap of `2,000 BPS` (`20%`).
The current final marginal rates are `20%` for buys and `15%` for sells.

## Live buy: twenty actions in one block

Base transaction:
[`0x8b305a8c...a78d106`](https://basescan.org/tx/0x8b305a8c3e441dbf68fcf5a1e14fab021be0eeef3c98bd659cb0433b3a78d106)

| Field                        |                                                               Result |
| ---------------------------- | -------------------------------------------------------------------: |
| Receipt status               |                                                                  `1` |
| Block                        |                                                           `49735413` |
| Block hash                   | `0xbf006602d6e24c1a342155d762190e3d0e4c795378bf26a5b737cb7f6579f58f` |
| Block time                   |                                            `2026-08-09 07:22:53 UTC` |
| Atomic router transactions   |                                                                  `1` |
| Exact-input swap actions     |                                                                 `20` |
| Input per action             |                                                             `3 USDC` |
| Gross input                  |                                                            `60 USDC` |
| NARA received                |                                      `5,476.535036293903312662 NARA` |
| Quoted output                |                                      `5,476.535036293903312674 NARA` |
| Protected minimum output     |                                      `4,928.881532664512981406 NARA` |
| Hook fee                     |                                                          `4.95 USDC` |
| Effective Hook rate          |                                                  `825 BPS` (`8.25%`) |
| Final terminal marginal tier |                                                  `1,200 BPS` (`12%`) |
| Gas used                     |                                                          `1,044,095` |
| Gas cost                     |                                                  `0.00000626457 ETH` |

The exact cumulative buy calculation was:

```text
USDC depth:                       300
5% threshold:                     15
15% threshold:                    45

first 15 USDC at 5%:            0.75 USDC
next 30 USDC at 8%:             2.40 USDC
final 15 USDC at 12%:           1.80 USDC
                                  ---------
expected cumulative Hook fee:   4.95 USDC
observed cumulative Hook fee:   4.95 USDC
```

The receipt contained twenty Hook fee events and twenty corresponding Vault
records. Their totals and the twenty PoolManager-to-Vault USDC transfers each
equaled exactly `4.95 USDC`. The Vault's recorded USDC fee total and actual USDC
balance both increased from `20.462880` to `25.412880 USDC`.

At the exact `15 USDC` and `45 USDC` boundaries, the event reports the next
terminal marginal tier even though the action that finishes the preceding band
is charged using the cumulative integral. Consumers must not present the event
`feeBps` as the effective average rate for the complete transaction.

## Live sell: exact reversal through twenty actions

Base transaction:
[`0xb4d2b3c7...fe6166`](https://basescan.org/tx/0xb4d2b3c7fb56137194d89cb976d0f889707b1cdd42aa480bc8d64c0fc7fe6166)

| Field                                         |                                                               Result |
| --------------------------------------------- | -------------------------------------------------------------------: |
| Receipt status                                |                                                                  `1` |
| Block                                         |                                                           `49735692` |
| Block hash                                    | `0xb944a6863b63edcf9e90de9d9103f44c9be99ffb100746f0c8c7d0471bef7f73` |
| Block time                                    |                                            `2026-08-09 07:32:11 UTC` |
| Atomic router transactions                    |                                                                  `1` |
| Exact-input sell actions                      |                                                                 `20` |
| Gross NARA input                              |                                      `5,476.535036293903312662 NARA` |
| USDC received                                 |                                                     `51.878091 USDC` |
| Quoted output                                 |                                                     `51.878102 USDC` |
| Protected minimum output                      |                                                     `46.690291 USDC` |
| Hook fee                                      |                                        `323.357452540573231886 NARA` |
| Effective Hook rate                           |                           approximately `590.4417 BPS` (`5.904417%`) |
| Integer effective rate recorded by the script |                                                            `590 BPS` |
| Final terminal marginal tier                  |                                                     `700 BPS` (`7%`) |
| Gas used                                      |                                                            `986,097` |
| Gas cost                                      |                                                 `0.000005916582 ETH` |

The twenty action amounts partitioned the buy output exactly. Actions 1 through
19 sold `273.826751814695165633 NARA` each; action 20 sold
`273.826751814695165635 NARA`. Their sum was exactly the
`5,476.535036293903312662 NARA` received in the buy.

The exact cumulative sell calculation was:

```text
NARA depth:                                  60,000
5% threshold:                                3,000
15% threshold:                               9,000

first 3,000 NARA at 5%:                    150 NARA
remaining 2,476.535036293903312662 at 7%: 173.357452540573231886 NARA
                                             ------------------------------
expected cumulative Hook fee:              323.357452540573231886 NARA
observed cumulative Hook fee:              323.357452540573231886 NARA
```

The receipt contained twenty Hook fee events and twenty corresponding Vault
records. Their totals and the twenty PoolManager-to-Vault NARA transfers each
equaled exactly `323.357452540573231886 NARA`. The Vault's recorded NARA fee
total and actual NARA balance both increased from
`1,495.229242512170995797` to `1,818.586695052744227683 NARA`.

## Round-trip result

The same wallet completed this measured round trip:

```text
60.000000 USDC
    -> 5,476.535036293903312662 NARA
    -> 51.878091 USDC
```

The USDC difference was `8.121909 USDC`, or approximately `13.5365%` of the
initial `60 USDC`, excluding gas. The wallet's NARA balance returned exactly to
its pre-buy value because the sell input was the exact buy output.

The USDC difference must not be labeled entirely as Hook tax. It combines:

- the `4.95 USDC` buy Hook fee;
- the `323.357452540573231886 NARA` sell Hook fee;
- the standard `0.30%` Uniswap pool fee in each direction;
- price impact in a deliberately shallow pool; and
- per-action AMM rounding.

Spot price moved from approximately `$0.0088077370/NARA` before the buy to
`$0.0114032557/NARA` after the buy, then returned to approximately
`$0.0089412610/NARA` after the sell. It did not return exactly to the starting
price because the input-currency Hook fees are removed before the remaining
input reaches the AMM.

## Comparison with earlier distinct-block evidence

Earlier live matrices established the new-block reset behavior:

| Live matrix                            | Block pattern          |   Gross input | Observed Hook fee |
| -------------------------------------- | ---------------------- | ------------: | ----------------: |
| Twenty buys from `1` through `20 USDC` | twenty distinct blocks |    `210 USDC` |      `10.95 USDC` |
| Ten sells of `1,000 NARA`              | ten distinct blocks    | `10,000 NARA` |        `500 NARA` |

Those transactions are not an amount-for-amount control for the same-block
round trip. For comparison, the deployed formula predicts that twenty `3 USDC`
buys separated across twenty blocks would pay `3.00 USDC`, while the live
same-block execution paid `4.95 USDC`. Similarly, splitting the exact reversal
amount equally across distinct blocks would mathematically pay approximately
`273.826751814695165620 NARA`, while the live same-block execution paid
`323.357452540573231886 NARA`.

The extra same-block amounts are the expected consequence of cumulative
pressure crossing higher marginal bands; they are not accounting drift.

## Verification performed

Receipt reconciliation independently checked:

- transaction status, receipt block, and block hash;
- twenty Hook events per direction;
- twenty Vault records per direction;
- twenty exact PoolManager-to-Vault fee transfers per direction;
- wallet input and output balance deltas;
- Vault lifetime-recorded fee deltas against actual Vault token balances;
- unchanged active pool liquidity `4242640687119285`;
- expected versus observed tier-integrated fees; and
- zero final ERC-20 and Permit2 allowances.

Latest-state Base fork regressions also passed the fee/accounting invariants:

- `test/fork/NARAV4SameBlockBuyTax.fork.test.ts` verified the 20-action buy
  tier integration, exact `4.95 USDC` Hook/Vault fee, and minimum output at the
  then-current fork state;
- `test/fork/NARAV4SameBlockSellReversal.fork.test.ts` verified the exact-input
  20-action reversal, sell-tier fee/accounting reconstruction, and minimum
  output at the then-current fork state.

Fork swap outputs are state-dependent and are not asserted to reproduce the
historical live receipt outputs unless the fork block is explicitly pinned.

The execution and reconciliation helpers are:

- `scripts/matrix/runV4LiveSameBlockBuyTaxMatrix.ts`;
- `scripts/matrix/runV4LiveSameBlockSellReversal.ts`;
- local generated evidence
  `deployments/v4-live-buy-tax-same-block-20x3-latest.json`; and
- local generated evidence
  `deployments/v4-live-sell-reversal-same-block-20-actions-latest.json`.

The generated `*-latest.json` files are local execution artifacts under the
repository's deployment-output ignore policy. This tracked release record and
the Base receipts preserve the sanitized result.

## Evidence boundary

This test proves the behavior of twenty sequential Hook callbacks within each
of two atomic Universal Router transactions. It does not by itself prove live
aggregation across twenty independent transactions, multiple EOAs, arbitrary
builder ordering, reorgs, or every adversarial integration path. Real
PoolManager tests cover cross-caller behavior locally, but that is separate
from this live receipt evidence.

The pressure horizon remains one block. Waiting for another block resets the
accumulator by design, so this mechanism is not persistent cross-block split
resistance. The Hook applies only to supported exact-input swaps through the
registered canonical NARA/USDC pool. Exact-output swaps are rejected; ERC-20
transfers and third-party pools are outside this tax boundary.

At these test receipts, the Vault was in `Liquidity` route mode and the
Compounder had not yet validation-compounded or frozen. The later bounded
validation and permanent binding freeze are recorded separately in
[NARA-20260809-v4-compounder-activation.md](NARA-20260809-v4-compounder-activation.md).
Only the balanced subset added by that later transaction is active POL;
unmatched inventory remains banked in the Compounder.
