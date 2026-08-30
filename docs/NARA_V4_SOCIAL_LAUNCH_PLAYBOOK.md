# NARA v4 communications research

Last updated: 2026-08-30.

Status: internal historical/research guidance. It is not approved launch copy,
an invitation to transact, or authorization to publish.

## Current factual boundary

The canonical NARA/USDC pool is active on Base under a live-testing phase. It
uses real assets and irreversible transactions. Liquidity may be limited,
execution may have material price impact, and the observed tests do not prove
economic safety, future performance, or whole-protocol production readiness.

The Position NFT Phase-2 baseline is deployed, configured, Safe-finalized, and
source-verified, but its final manifest remains `integrationReady: false`.
Position NFTs must not be described as integrated, indexed, publicly available,
or supported by a proven user exit flow.

The deployed Engine's ERC-20 reward notifier is prohibited. Communications
must not suggest that bribe tokens, basket-token fees, USDC, or arbitrary
ERC-20 rewards can be routed into that deployed Engine path. Native ETH and
NARA accounting must be described only to the extent supported by current
source and verified release evidence.

Before drafting any external statement, read:

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [NARA_V4_PUBLIC_STATE.md](NARA_V4_PUBLIC_STATE.md)
- [SECURITY.md](../SECURITY.md)
- [Position NFT Phase-2 release record](releases/NARA-20260821-v4-position-nft-phase2.md)

## Required communication rules

- Use the exact evidence-state words supported by the repository.
- Say `active under live testing` for the canonical pool, not
  `production-ready`, `safe`, or `complete`.
- State that rewards and fee distributions are variable and can be zero.
- Separate deployed contracts from integrated and publicly available products.
- State material limits close to the claim they qualify.
- Keep token, basket, bond, lock, and position choices neutral and
  self-directed.
- Link current technical evidence instead of repeating changing balances,
  prices, liquidity percentages, or operational snapshots.
- Require jurisdiction-specific qualified-counsel review before publishing
  value-bearing product or promotional copy.

## Prohibited claims

Do not publish or imply:

- a token-price or market-cap floor, target, support level, or expected
  appreciation;
- guaranteed demand, volume, order flow, liquidity, buyers, or exits;
- protection from whales, losses, MEV, sandwiching, or manipulation;
- guaranteed yield, APY, profit, income, cash dividends, or returns;
- `safe`, `risk free`, `protected`, `insured`, `approved`, `best`,
  `recommended`, `low risk`, or similar suitability language;
- that same-block pressure accounting prevents cross-block splitting or all
  adverse execution;
- that one-sided fees immediately create active protocol-owned liquidity;
- that source code, tests, deployment, or source verification establish public
  availability; or
- that an internal audit, test suite, or live transaction proves legal
  compliance or economic safety.

Do not use calls to buy, lock, hold, bond, provide liquidity, or select a NARA
product. Do not publish projected returns, hypothetical profit tables, price
milestones, countdowns, scarcity pressure, influencer scripts, or urgency
language.

## Neutral release-note pattern

A factual release note may state:

1. the component and exact evidence state;
2. the network and immutable evidence reference;
3. what was tested or observed;
4. what remains unavailable or unproved;
5. the live-testing and risk boundary; and
6. whether any production write occurred.

Example structure:

> NARA v4 records a verified Base-mainnet checkpoint for the named component.
> The canonical pool remains active under live testing. This evidence is
> limited to the cited transactions and blocks; it is not a safety, liquidity,
> availability, price, or return claim. See the current-state record for open
> gates.

External publication remains a separate approval step. Repository text alone
does not authorize posting, outreach, listings, or product activation.
