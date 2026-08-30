# NARA v4 research backlog

Last updated: 2026-08-30.

Status: unapproved research topics and evidence gaps. Nothing in this document
authorizes implementation, deployment, funding, a production transaction,
consumer activation, or public promotion.

## Current boundary

- The canonical NARA/USDC pool is active on Base under live testing. It has
  limited, variable liquidity and does not provide a price, execution, MEV, or
  availability guarantee.
- The Position NFT Phase-2 baseline is deployed, Safe-finalized, configured,
  and source-verified, but `integrationReady` is `false`. Consumer integration,
  indexing, smoke, monitored hold, and public availability remain gated.
- The deployed Engine ERC-20 reward notifier is prohibited. Do not propose a
  `BribeRouterV4` deployment, `REWARD_NOTIFIER_ROLE` grant, or any direct
  ERC-20 notification into that Engine. A future ERC-20 reward design would
  require a separate architecture and security review.
- Bonds, baskets, router/lens availability, and composability products remain
  separate release scopes. Existing source is not deployment approval.

Authoritative references:

- [Current protocol state](CURRENT_STATE.md)
- [Cross-repository release gates](../AGENTS.md)
- [Position NFT Phase-2 release](releases/NARA-20260821-v4-position-nft-phase2.md)
- [Position NFT production boundary](NARA_V4_NFT_PRODUCTION_PLAN.md)
- [Hook behavior and limitations](UNISWAP_V4_HOOK.md)

## Priority evidence gaps

### Operations and observability

- Keep epoch and liquidity-maintainer health independently observable without
  expanding either keeper's permissions.
- Record receipt-block readbacks and immutable runtime bindings for every
  authorized production operation.
- Expose clear stale-state and degraded-RPC signals to operators and future
  user interfaces.

### User lifecycle evidence

- Complete and receipt-pin the Engine lock, activation, claim, and unlock
  lifecycle before describing locking as publicly available.
- Verify all value-bearing review screens disclose amount, contract, chain,
  fees, approvals, slippage/deadline where applicable, expected output, risks,
  and exit behavior.
- Confirm that an exit path works under the same deployed configuration used by
  any future public entry flow.

### Position NFT integration

- Reconcile complete `PositionMinted` history from the deployment block.
- Complete the separately authorized mint/transfer/claim/unlock smoke and
  monitored hold.
- Issue an immutable ABI/address/start-block handoff before enabling indexers or
  applications.
- Keep marketplace support, liquidity, buyers, and transfer-based exits outside
  availability claims unless independently evidenced.

### Liquidity accounting

- Continue separating Vault balances, banked Compounder inventory, active LP,
  and historical lifetime counters.
- Present one-sided fees as banked inventory until matching counterasset exists;
  never describe them as immediate active liquidity.
- Pin any reported depth, balances, ratios, or price observations to a block and
  timestamp. Historical observations are not forecasts.

### Downstream consumers

- Keep the basket application preview-only until verified basket deployment
  manifests and complete user-flow evidence exist.
- Configure monitoring only from immutable producer artifacts and a verified
  start block.
- Publish beginner documentation last, after protocol and direct consumers
  agree on state and availability language.

## Deferred research

The following may be evaluated only through separate scoped proposals:

- router and read-only lens deployment;
- bond and Genesis distribution economics and custody;
- staking, fractional-position, lending, or marketplace integrations;
- additional pool telemetry and execution-risk tooling; and
- a replacement architecture for any future non-native reward assets.

Each proposal must identify ownership, dependencies, invariants, tests,
deployment effects, value at risk, exit behavior, monitoring, legal-copy review,
and explicit human approval gates. Prefer periphery and read-only tooling over
changes to frozen core contracts.

## Excluded objectives

This backlog does not pursue or promise:

- a market floor, price target, price appreciation, or valuation milestone;
- guaranteed flow, demand, volume, liquidity, yield, income, or returns;
- protection from whales, MEV, sandwiching, price impact, or losses;
- artificial scarcity, coordinated market activity, or preferential asset
  recommendations; or
- a claim that technical controls establish legal or regulatory compliance.

Rewards and distributions are variable and may be zero. Public copy and
value-bearing flows require jurisdiction-specific qualified-counsel review;
technical review is not legal advice.
