# NARA v4 Compounder Activation Evidence

Change ID: `NARA-20260809-v4-compounder-activation`

Date: 2026-08-09

Network: Base (`8453`)

Contract source commit:
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`

Canonical sanitized evidence:
`deployments/v4-compounder-activation-2026-08-09.json`

## Outcome

The production Safe executed one bounded Compounder validation and then, only
after receipt reconciliation, executed the separate irreversible Vault binding
freeze. Both transactions succeeded.

The validation minted Compounder-owned LP NFT `2898486` with liquidity
`9455824137787`. The original seed LP NFT `2898124` remains Safe-owned with
liquidity `4242640687119285`. PoolManager active liquidity increased by exactly
the Compounder position liquidity, from `4242640687119285` to
`4252096511257072`.

This clears the Compounder validation/freeze gate. It does not configure a
recurring liquidity keeper, complete the Engine lifecycle smoke, deploy basket
contracts, or establish overall production readiness.

## Contracts and pool

| Item | Value |
|---|---|
| NARA | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Vault | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` |
| Hook | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` |
| Compounder | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` |
| Safe | `0xd65c0e390Dc187A22c52c03816591CC736C0D755` |
| Pool ID | `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464` |

## Validation policy

The reference was fixed before building the Safe transaction as the midpoint
of the receipt-pinned pre-buy and post-reversal sqrt prices from the same-block
round-trip evidence:

```text
reference sqrtPriceX96:       841040439224134229852494024897112973
execution sqrtPriceX96:       837876861495905586957508528589190037
sqrt-price guard:             100 BPS
max reference imbalance:     100 BPS
maximum NARA used:            100 NARA
maximum USDC used:            1 USDC
simulated liquidity:          9455824137787
minimum accepted liquidity:   9361265896409
```

The execution `sqrtPriceX96` was approximately `37.615 BPS` from the fixed
sqrt-price reference (`38 BPS` rounded up) and passed the approved `100 BPS`
sqrt-price guard.

## Validation execution

Base transaction:
[`0xf1ea7e7d...56b5890be`](https://basescan.org/tx/0xf1ea7e7dfdf8e1021ceebf26a943cba604e0a8c894eec5f527bc01656b5890be)

| Field | Result |
|---|---:|
| Safe nonce | `32` |
| Safe transaction hash | `0x5f52bc00269e368f020c0b72ad0b9ba2ff2b7109ea48121c6b9994da9b6c3325` |
| Block | `49736646` |
| Block hash | `0x6500ebab0b18a044c417aa278064ae4e00a04045c493eace0ccf0dcb7469f6b8` |
| Block time | `2026-08-09 08:03:59 UTC` |
| Receipt status | `1` |
| Gas used | `595833` |
| Vault NARA input | `1818.586695052744227683 NARA` |
| Vault USDC input | `25.412880 USDC` |
| Keeper bounty | `0 USDC` |
| NARA added to LP | `99.999999999997037752 NARA` |
| USDC added to LP | `0.894127 USDC` |
| Liquidity added | `9455824137787` |
| NARA banked in Compounder | `1718.586695052747189931 NARA` |
| USDC banked in Compounder | `24.518753 USDC` |

The Vault transferred its complete recorded inventory to the exact-spend
Compounder. The bounded balanced subset entered the LP position; the remainder
stayed banked in the Compounder. Therefore Vault lifetime-compounded counters
describe inventory handed to the Compounder, while Compounder lifetime-added
counters describe actual LP inputs. They must not be presented as the same
quantity.

Receipt-block verification confirmed:

- `positionTokenId == 2898486`;
- PositionManager owner is the Compounder;
- position liquidity equals `9455824137787`;
- Compounder lifetime liquidity equals the position liquidity;
- both LP inputs remained below their explicit caps;
- both Vault-to-Compounder allowances returned to zero; and
- `pendingRecovery.kind == 0`.

## Permanent binding freeze

Base transaction:
[`0xccd73cf0...78084ef3`](https://basescan.org/tx/0xccd73cf07602f18412bea291812f0d171fa5cabd41fcff6b6894029978084ef3)

| Field | Result |
|---|---:|
| Safe nonce | `33` |
| Safe transaction hash | `0x9554f43d1160cea56edbd1b3ab78311dfdb942b8f1f20a741f0fee40c7f637ef` |
| Block | `49736809` |
| Block hash | `0xa587de1613fdd59b96d8c077353824d4f97792caca555693f530bf21eb55e065` |
| Block time | `2026-08-09 08:09:25 UTC` |
| Receipt status | `1` |
| Gas used | `100140` |

The receipt emitted `CompounderFrozen` for
`0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF`. Receipt-block reads confirmed:

```text
vault.compounder()       = 0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF
vault.compounderFrozen() = true
positionTokenId          = 2898486
position owner           = Compounder
position liquidity       = 9455824137787
pendingRecovery.kind     = 0
```

The freeze permanently locks the Vault's Compounder binding. It does not erase
the Compounder's separately documented seven-day recovery path for its owned
position and banked balances.

## Liquidity interpretation at the freeze block

| Position | Owner | Liquidity | Purpose |
|---|---|---:|---|
| LP NFT `2898124` | Production Safe | `4242640687119285` | Original 60,000 NARA / 300 USDC seed |
| LP NFT `2898486` | Compounder | `9455824137787` | First validated protocol-owned-liquidity addition |
| Total active liquidity | PoolManager | `4252096511257072` | Exact sum at freeze block |

At the freeze block, the Compounder banked `1718.586695052747189931 NARA` and
`24.518753 USDC` outside the LP position. Describe those balances as banked
inventory, not active liquidity or instant POL. Later balances require a new
pinned readback.

## Communications and legal boundary

This evidence is factual engineering disclosure, not investment, legal, tax,
or financial advice. It does not promise price support, returns, liquidity,
safety, regulatory approval, insurance, or loss protection. Do not describe the
deployment as audited, secure, production-ready, or available solely because
these two transactions succeeded. User-facing value-bearing actions must remain
self-directed and show fees, expected output, slippage/deadline where relevant,
approvals, exits, and risk notice before confirmation.

## Remaining gates

1. Preserve this evidence and the same-block tax evidence in a protected origin
   pull request.
2. Provision and explicitly authorize a dedicated gas-only operations keeper.
3. Complete and receipt-pin the Engine lock, activation, claim, and unlock
   lifecycle smoke.
4. Complete the monitored observation period.
5. Resolve the separate allocation mismatch before allocation/periphery
   deployment.
6. Obtain jurisdiction-specific review of public copy and value-bearing flows
   from qualified counsel; technical disclaimers do not establish compliance.
7. Update baskets and monitor only from merged origin evidence; publish public
   documentation last.

## Evidence boundary

This record proves the two named Safe executions and their receipt-pinned state.
It is not an independent security audit and does not claim that recurring
maintenance, public locking, basket contracts, or downstream applications are
available.
