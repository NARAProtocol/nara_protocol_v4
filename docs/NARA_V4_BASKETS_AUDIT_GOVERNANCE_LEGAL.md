# NARA Baskets — Cross-Repository Audit and Legal-Review Boundary

Last updated: 2026-08-30.

Status: routing/checklist document only. The authoritative basket contracts,
tests, manifests, app, `AGENTS.md`, and `DESIGN.md` are maintained in
`NARAProtocol/nara_protocol_v4_baskets`, not this protocol repository. This
file is not a current basket audit, legal opinion, compliance conclusion,
product approval, or launch authorization.

Baskets are preview-only. Basket managers are not evidenced here as deployed or
available. The canonical v4 token and NARA/USDC pool are in technical live
testing with real assets, but upstream activity does not activate baskets.

## Release ownership

- Protocol token, Engine, Hook/Vault/Compounder, ABI, address, and pool facts
  originate in `NARAProtocol/nara_protocol_v4`.
- Basket contract behavior, adapters, fees, basket composition, deployment
  state, and app behavior originate in
  `NARAProtocol/nara_protocol_v4_baskets`.
- Monitoring facts originate in `NARAProtocol/nara-swarm-monitor`.
- Public documentation is updated last.

Never copy a planned address, uncommitted artifact, historical working copy, or
chat statement into a basket consumer. Every update requires an immutable
protocol origin and explicit downstream handoff.

## Technical review checklist

Review the exact basket source and tests in its owning repository, including:

- constructor immutability and every administrator/role/custody boundary;
- exact-transfer behavior and fee-on-transfer/rebasing token rejection;
- adapter target, selector, route, token, deadline, minimum-output, approval,
  callback, and reentrancy constraints;
- fee collection, referral accounting, allowance cleanup, stranded-fund, and
  recovery behavior;
- basket composition and weight invariants;
- full and partial underlying withdrawal, normal sell, and adverse-liquidity
  exit behavior;
- oracle/reference freshness and manipulation assumptions where applicable;
- deployment manifests, generated ABI/address parity, chain, start blocks, and
  runtime/source verification;
- unit, invariant, exact Base-fork, end-to-end, and frontend transaction-review
  evidence; and
- monitoring, pause/failure behavior, incident ownership, and rollback limits.

Tests and source verification do not establish economic safety, legal
compliance, product availability, liquidity, token value, or an exit.

## Governance and curation boundary

For any future basket release, record who selected assets and weights, the
objective inclusion/exclusion methodology, conflicts of interest, update
authority, compensation, fees, and immutable versus mutable fields. Comparable
baskets must have neutral visual weight and neutral ordering. Do not label any
basket recommended, best, safest, popular, trending, highest-return, low-risk,
or suitable for a category of user.

An immutable contract does not remove responsibility for offchain selection,
frontend presentation, promotion, access, or operations. A receipt NFT or
wallet signature does not by itself resolve legal custody, product, securities,
consumer-protection, marketing, or jurisdiction questions.

## Required public-language boundary

Public material may describe only verified current facts and must distinguish:

- source present;
- tested;
- merged;
- deployed and source-verified;
- configured;
- indexed;
- technically activated; and
- publicly available.

Do not use upstream pool activity to imply basket availability. Do not promise
price, performance, diversification benefit, protection, demand, liquidity,
returns, income, safety, recovery, or an exit. Historical values must carry an
observation time/block and must not be presented as forecasts.

Before any value-bearing consumer activation or promotion, require written
jurisdiction-specific review by qualified counsel of the operating entity,
asset/product characterization, audience, distribution restrictions,
financial-promotion route, disclosures/warnings, conflicts, fees, custody and
control, privacy, sanctions/AML obligations if applicable, and the complete
entry/review/confirmation/exit journey. This repository contains no evidence
that such review is complete.

Technical or internal risk review is not a legal opinion. Avoid categorical
statements such as "compliant," "not a security," "non-custodial," or "no
regulatory risk" unless counsel approves the exact claim for the exact product,
entity, audience, and jurisdiction.

## Availability gate

Keep baskets preview-only unless all of the following are evidenced:

1. protected basket-source merge and current security/test gates;
2. verified Base deployment manifests and immutable upstream handoff;
3. exact app environment/address/ABI parity;
4. complete buy, receipt, valuation-source, fee, sell, partial-withdrawal, and
   underlying-withdrawal evidence under the deployed configuration;
5. neutral review screens that show selected assets/weights, chain, contracts,
   fees, approvals, expected output, slippage/deadline, custody/control, risks,
   and exits before confirmation;
6. operational monitoring and incident ownership; and
7. written jurisdiction-specific legal approval for the proposed availability
   and communications route.

Until then, do not send assets to placeholders, enable production transaction
controls, announce availability, solicit users, or submit listing materials
that depend on basket deployment.
