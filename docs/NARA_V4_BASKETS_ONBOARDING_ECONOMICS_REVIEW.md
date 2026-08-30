# NARA Baskets — Neutral Onboarding and Economics Review

Last updated: 2026-08-30.

Status: internal research checklist. Baskets are preview-only; this document is
not consumer copy, product availability, a recommendation, a legal opinion, or
authorization to deploy, promote, or transact. Current implementation and
design authority is the basket repository's `AGENTS.md`, `DESIGN.md`, source,
tests, and verified manifests.

## Objective

Make a future self-directed flow understandable without selecting an asset for
the user or hiding risk. Optimize navigation clarity only after correctness,
security, neutral presentation, explicit review, and exit comprehension.

Do not use conversion pressure, urgency, scarcity, countdowns, preselected
assets, preferential cards, return rankings, or claims that a particular basket
is better for beginners.

## Gated future flow

If deployment, integration, operational, and legal gates are eventually met, a
neutral flow should be:

1. connect a wallet;
2. show that products are self-directed and value-bearing;
3. display comparable basket cards with equal visual weight;
4. let the user select `View Basket`;
5. show assets, weights, fees, valuation source/time, approvals, route,
   slippage/deadline, expected output, custody/control, risks, and exits;
6. require a distinct review step; and
7. request wallet confirmation only for the exact reviewed transaction.

Funding, wallet connection, authentication, approvals, signatures, and
transactions are separate states. OAuth or passkey authentication is not proof
of blockchain authorization. The app must never custody or expose a user key.
Avoid broader legal custody characterizations unless qualified counsel approves
the exact statement.

## Required entry safeguards

- Verify Base chain, exact deployed contract, bytecode/configuration, token,
  amount, and current app manifest before enabling a transaction.
- Treat upstream NARA pool activity as separate from basket deployment and
  availability.
- Require a fresh quote and simulation; distinguish estimates from realized
  receipt results.
- Use bounded slippage and deadline controls and explain approval scope.
- Fail closed on stale/missing price, manifest, adapter, liquidity, or exit
  evidence.
- Keep transaction controls disabled in preview builds and when any deployment
  placeholder remains.

## Economics disclosure

For a future deployed basket, show contract-configured facts rather than
marketing summaries:

- exact assets and target weights;
- required NARA component, if present;
- entry, exit, holding, and referral fee parameters;
- valuation method, source, observation time/block, and known limitations;
- adapter/route and execution assumptions;
- receipt-NFT ownership versus contract-held underlying assets;
- normal sell and raw-underlying withdrawal behavior; and
- adverse cases, including limited liquidity, large price impact, partial or
  failed routes, unavailable buyers, token-value loss, and irreversible
  transactions.

Do not claim diversification reduces risk, a weight is optimal, historical
performance predicts future results, or a basket provides returns, income,
protection, safety, or a guaranteed exit.

## Copy and layout rules

- Keep visible copy short; put necessary detail in accessible `(i)` disclosure
  controls and the mandatory review screen.
- Use neutral CTAs: `View Basket`, `Preview`, `Continue`, `Back`, and
  `Confirm Buy` only when buying is actually available.
- Do not use `Recommended`, `Best`, `Safest`, `Popular`, `Trending`, `Highest
  return`, `Low risk`, or similar language or visual treatment.
- Label time-specific values as estimates and show their source/time.
- Do not label contract-held assets "non-custodial" as a shortcut. Describe the
  actual receipt, manager, approval, withdrawal, and administrator controls.
- Explain exits before entry. Transferability of a receipt does not prove a
  buyer, market, liquidity, token value, or practical exit.

## Legal and activation gate

Language is not a substitute for legal analysis, access controls, disclosures,
or a lawful distribution/financial-promotion route. Before public availability
or promotion, require written jurisdiction-specific qualified-counsel review of
the entity, product/assets, audience, fees, curation, conflicts, custody/control,
warnings, marketing, privacy, sanctions/AML obligations if applicable, and the
complete entry-to-exit journey. This repository contains no evidence that such
review is complete.

See
[NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md](NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md)
for the cross-repository release boundary.
