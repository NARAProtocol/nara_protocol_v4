# NARA v4 Bond Opening Criteria

Last updated: 2026-08-30.

Status: internal signed-quote-era release criteria. Bonds are not deployed,
funded, opened, offered, or publicly available. This document does not
authorize deployment, funding, terms, capacity, a transaction, promotion, or an
offer. This repository contains no evidence of completed jurisdiction-specific
qualified legal review.

The current source candidate is
`contracts/v4/NARABondDepositoryV4NFT.sol`. It requires signed, bounded EIP-712
quotes. The legacy `buyBond` and `buyBondFor` entry points revert
`SignedQuoteRequired`; the quote-bound paths are `buyBondWithQuote` and
`buyBondForWithQuote`. The contract does not contain the TWAP or
`minOracleLiquidity` pricing controls described by earlier versions of this
document.

## Stop conditions

Keep bonds unavailable if any of the following is true:

- the exact bond, Vault, Position NFT, Genesis distributor, Engine, treasury,
  or Safe deployment/binding lacks a protected, verified manifest;
- Position NFT `integrationReady` is `false` or its value-bearing lifecycle and
  downstream handoff are incomplete;
- a current security/economic review, threat model, capacity analysis,
  monitoring plan, or tested exit behavior is absent;
- current custody, inventory, role-holder, pause, terms, capacity, or pending-
  change state has not been independently read and reconciled;
- any `PRICE_SIGNER_ROLE`, `TERMS_ROLE`, `PAUSER_ROLE`, treasury, or admin
  authority is broader than the approved release plan;
- terms are stale, unbounded, active before review, or executable without the
  required pause and timelock;
- quote issuance lacks authentication, authorization, nonce/replay controls,
  expiry, recipient binding, value binding, payout bounds, monitoring, and
  revocation procedures;
- fees, custody, irreversible lock behavior, variable/possibly-zero rewards,
  transfer limits, token/liquidity/value risk, and exit behavior are not shown
  before confirmation; or
- written jurisdiction-specific qualified-counsel review of the entity,
  audience, terms, disclosures, promotion, access controls, and transaction
  journey is absent.

No price target, valuation threshold, projected proceeds, discount scenario,
return, yield, dividend, market-impact claim, or future fee distribution is an
opening criterion.

## Required immutable evidence

Before any opening proposal, a new protected release must record:

1. full protocol origin and exact generated ABI/artifact source;
2. verified Base addresses, runtimes, constructor inputs, and start blocks;
3. Position NFT/Engine/Genesis/Vault/treasury/Safe bindings;
4. role enumeration and complete relevant grant/revoke history;
5. source, focused, invariant, fork, quote/replay, custody, failure-path, and
   end-to-end exit tests;
6. current inventory/capacity reconciliation without treating planned treasury
   allocations as funded balances;
7. simulation and decoded Safe payloads for every deployment/configuration
   action;
8. operations, pause/close, monitoring, incident, and recovery procedures; and
9. an explicit downstream/public-documentation handoff whose availability state
   remains closed until every gate passes.

Deployment evidence and technical testing do not establish economic safety,
legal compliance, suitability, product availability, liquidity, value, or an
exit.

## Terms and capacity review

The source `BondTerms` fields are:

- `naraPerEthWad`;
- `discountBps`, bounded by `MAX_DISCOUNT_BPS = 3_000`;
- `rewardSplitWad`, bounded by `MAX_REWARD_SPLIT_WAD`;
- `minDepositWei`;
- `maxPayoutNara`;
- `remainingCapacityNara`;
- `lockDurationEpochs`;
- Genesis round, tier, reward-weight, and eternal-position fields; and
- `active`.

For any future proposal:

- start inactive and with zero capacity;
- document the independent basis, time, source, and limitations for every
  proposed pricing input;
- treat `MIN_PRICE_DELAY = 1 day` and `MAX_TERMS_AGE = 2 days` as source bounds,
  not evidence that terms are fair, current, or legally approved;
- require pause before `executeTerms` and `addCapacity` as the source does;
- keep capacity within freshly verified `vault.availableToPull()` and the
  separately approved release cap;
- verify the Engine lock fee, net/gross payout math, min/max payout, quote
  expiry, nonce, terms timestamp, and recipient; and
- issue no quote until the complete user-facing terms and legal journey are
  approved.

## Signed-quote controls

Each quote must bind the exact buyer, recipient, `msg.value`, minimum and
maximum payout, deadline, current buyer nonce, and `termsActivatedAt`. Accept
only an authorized `PRICE_SIGNER_ROLE` EOA signature or the source-defined
ERC-1271 contract-wallet format. Test expiry, replay, cross-recipient,
cross-value, stale-terms, signer-revocation, contract-signature, payout-cap, and
capacity failure cases.

Quote signing is a privileged offchain service and must have its own scoped key,
authentication, authorization, audit logs, rate/cap controls, revocation plan,
and incident runbook. Never reuse a keeper, deployer, treasury, Safe-owner, or
application credential.

## Conditional opening sequence

Only after a new explicit human order and every preceding gate passes:

1. re-read current chain state at a pinned block;
2. generate and independently review the exact deployment/configuration/Safe
   artifacts;
3. deploy and verify the separately approved contracts if still undeployed;
4. verify all bindings and roles before funding;
5. fund only the reviewed capped amount;
6. propose terms while the depository remains paused;
7. wait the complete timelock and revalidate all assumptions;
8. execute terms and add only the reviewed capacity while paused;
9. keep `active=false` until the legal, UI, monitoring, and incident gates are
   rechecked; and
10. activate only through a separately decoded, simulated, and human-approved
    transaction, followed by receipt-pinned readback.

This sequence is a future control outline, not current authorization. No current
document authorizes `Genesis`, `GenesisSplit`, a bond sale, or public promotion.

## Monitoring and closure

If a future release is explicitly opened, monitor quote issuance, nonce use,
capacity, Vault inventory, terms age, role changes, pause state, ETH routing,
Engine/Genesis accounting, failed deliveries, concentration, and exit behavior.
Define quantitative alert and automatic-stop thresholds in that release. The
human-controlled pause/closure path must be tested before opening, not first
used during an incident.
