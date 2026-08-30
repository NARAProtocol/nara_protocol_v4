# NARA Baskets — Cross-Repository Mainnet Readiness Gate

Last updated: 2026-08-30.

Status: **NO-GO / preview-only**. This protocol repository does not own basket
deployment readiness. The basket repository's protected source, tests,
manifests, app configuration, and repository-local instructions are
authoritative. Nothing here authorizes a deployment, transaction, promotion,
listing, or public product activation.

The canonical v4 token and NARA/USDC pool are in technical live testing on Base
with real assets. That upstream state does not mean a basket manager is
deployed, configured, indexed, safe, legally approved, or available.

## Required immutable handoff

Before basket deployment work, require a protocol-origin handoff containing:

- change ID and full protected protocol commit;
- exact Base chain and token/Engine/Hook/Vault/Pool ID facts consumed;
- ABI/artifact source and hashes;
- verified deployment manifest and observation/start blocks where applicable;
- current state language and open risks; and
- evidence that the handoff was produced from a committed authoritative tree.

## Basket repository gates

All must pass in the basket repository:

1. focused source review, unit/invariant tests, exact Base-fork tests, compiler
   and dependency checks, secret scan, and canonical CI;
2. adapter target/selector/route/token/deadline/minimum-output and approval
   constraints;
3. basket composition, weight, fee, receipt, valuation, full/partial exit,
   underlying withdrawal, referral, and custody/control invariants;
4. decoded and simulated deployment/configuration artifacts;
5. full protected source commit, signed commit, clean PR, required checks, and
   no unresolved security/economic finding;
6. verified Base addresses, runtimes, constructor inputs, start blocks,
   ownership/roles, and deployment manifest;
7. generated ABI/address/types and app-environment parity; and
8. a downstream monitoring/public-doc handoff from the exact merged and
   deployed origin.

Code presence, tests, a fork, or source verification alone do not establish
release readiness.

## Product and exit gates

- Keep every transaction control disabled until all placeholders are absent and
  the exact deployed configuration is verified.
- Exercise the complete entry, receipt, valuation, fee, normal sell, partial
  withdrawal, raw-underlying withdrawal, and failure/recovery journeys.
- Show selected assets/weights, chain, contracts, amount, fees, approvals,
  route, slippage/deadline, expected output, custody/control, risks, and exits
  before confirmation.
- Prove monitoring for deployment drift, stale prices, adapter/route failures,
  liquidity/price-impact thresholds, accounting divergence, and incident
  ownership.
- Do not infer a buyer, market, liquidity, token value, or exit from receipt
  transferability.

## Communications and legal gate

Public copy must remain factual, balanced, and neutral. Do not promise price,
performance, demand, diversification benefit, safety, protection, liquidity,
returns, income, recovery, or an exit. Do not label a basket recommended, best,
safest, popular, trending, highest-return, low-risk, or suitable for a type of
user.

Before public availability, promotion, or listing submissions, require written
jurisdiction-specific review by qualified counsel of the entity, product/assets,
audience, distribution/financial-promotion route, curation and conflicts, fees,
custody/control, disclosures/warnings, privacy, sanctions/AML obligations if
applicable, and the complete entry-to-exit journey. This repository contains no
evidence that such review is complete. Technical review is not a legal opinion.

## Go decision

The status may change from NO-GO only through a dated release record that cites
the exact protected basket commit, verified deployment manifest, complete test
and user-flow evidence, monitoring state, legal approval scope, and explicit
human authorization. Public documentation is updated last.
