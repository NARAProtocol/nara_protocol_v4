# NARA v4 research roadmap

Last updated: 2026-08-30.

Status: internal research and release sequencing only. This document does not
authorize a deployment, transaction, product launch, public invitation, or
marketing claim.

> **Base-mainnet live-testing warning:** the canonical NARA/USDC pool is
> initialized, seeded, and processing real transactions on Base. Real assets
> and irreversible transactions are involved. Liquidity can be limited,
> execution can move the market materially, and a successful transaction does
> not prove economic safety or production readiness.

Canonical current state is maintained in [CURRENT_STATE.md](CURRENT_STATE.md).
Where this research roadmap conflicts with a verified manifest, dated release
record, source, or current-state document, the verified evidence controls.

## Evidence boundary

The following statements are supported by the current repository evidence:

- NARA v4 is the only active protocol stack.
- The fixed-supply token, Engine, reward reserve, Hook, Vault, Compounder, and
  canonical NARA/USDC pool are deployed on Base.
- The canonical pool is active under live testing. Recorded exact-input swaps
  and bounded liquidity operations are evidence for those specific paths only.
- Pool pressure accounting is per input currency and per block. Same-block
  splits share cumulative pressure, but waiting for a later block resets it.
  This is not a general anti-sandwich or cross-block manipulation guarantee.
- Pool fees accrue in the input currency. Only balanced inventory can become
  active protocol-owned liquidity through the no-swap Compounder; unmatched
  inventory remains banked.
- The seven-contract Position NFT Phase-2 baseline passed its recorded release
  review/test gates and is deployed, Safe-finalized, and source-verified. This
  is not an overall independent protocol audit. Its final manifest remains
  `integrationReady: false`.
  It is not integrated, indexed, publicly available, or evidence of a working
  user exit path.
- The deployed Engine's ERC-20 reward-notification route is prohibited.
  `REWARD_NOTIFIER_ROLE` must not be granted to the Safe, Vault, a router, or
  any other account. Future ERC-20 reward research requires a separately
  reviewed architecture and must not reactivate this deployed path.

Relevant evidence:

- [Current protocol state](CURRENT_STATE.md)
- [Public technical state](NARA_V4_PUBLIC_STATE.md)
- [Hook and fee semantics](UNISWAP_V4_HOOK.md)
- [Position NFT Phase-2 release record](releases/NARA-20260821-v4-position-nft-phase2.md)
- [Position NFT finalized manifest](../deployments/v4-position-nft-phase2-finalized-2026-08-21.json)
- [Latest reconciled full-inventory compound](releases/NARA-20260827-v4-full-inventory-compound.md)

## Current release gates

| Surface | Evidence state | Release boundary |
|---|---|---|
| Core token and Engine | Deployed and source-verified | Public lock/claim/unlock availability still requires the documented lifecycle and exit evidence |
| Canonical NARA/USDC pool | Initialized, seeded, and live-tested | Limited-liquidity and execution risks remain; no price or market-depth promise |
| Hook, Vault, and Compounder | Deployed and specifically exercised | No claim that all fees instantly become active liquidity |
| Position NFT baseline | Deployed, configured, and source-verified | `integrationReady: false`; no consumer availability claim |
| Router and lenses | Source exists | Separate deployment, verification, and consumer handoff required |
| Bonds and Genesis distribution | Source/research only for release purposes | Separate economic, security, custody, legal-copy, deployment, and exit review required |
| Category baskets | Preview only | Separate verified basket manifests and user-flow evidence required |
| Composability modules | Optional source/research | Separate deployment and integration review required |

## Research sequence

This ordering expresses dependencies, not dates or approval:

1. Keep current Base operations observable and evidence-pinned.
2. Complete the Engine lock, activation, claim, and unlock lifecycle evidence
   before describing public locking as available.
3. Complete Position NFT smoke, monitored hold, start-block history, and
   immutable downstream handoff before enabling consumers.
4. Review router and read-only lens deployment independently from Position NFT
   availability.
5. Evaluate bonds and Genesis distribution only through a separate capped
   economic, custody, security, and legal review.
6. Keep baskets in preview until their own deployment and exit-path gates pass.
7. Treat staking, fractional positions, lending, and other composability ideas
   as optional future research, not promised features.

Every state-changing step still requires an explicit user order, protected
source review, applicable tests, current deployment evidence, and human
approval.

## Claims this roadmap does not make

NARA does not promise or target through this document:

- a market-cap floor, token-price floor, price target, or price appreciation;
- protection from whales, losses, MEV, sandwiching, or manipulation;
- guaranteed order flow, demand, volume, liquidity, buyers, or exits;
- yield, income, cash dividends, APY, profit, or any minimum distribution;
- permanent liquidity or irreversible governance policy;
- public availability merely because source or contracts exist; or
- legal, regulatory, tax, investment, or suitability conclusions.

Rewards, fees, liquidity, and market activity are variable and can be zero.
Qualified jurisdiction-specific counsel must review public copy and
value-bearing user flows before release. Technical checks and disclaimers do
not establish legal compliance.

## Publication rule

Describe only the evidence state supported by the release protocol:
`implemented`, `tested`, `merged`, `deployed`, `configured`, `indexed`,
`activated`, or `available`. Do not replace these gates with promotional use of
`live`. Public documentation is updated only after the owning repository and
direct consumers converge on immutable evidence.
