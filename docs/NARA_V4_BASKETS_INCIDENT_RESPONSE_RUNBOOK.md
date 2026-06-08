# NARA v4 Baskets Incident Response Runbook

Last updated: 2026-06-02.
Scope: `NARAImmutableBasketPositionManagerV1`, basket adapters, and
`apps/nara-baskets/`.

This runbook answers the practical question: if a basket asset fails, can we
close the basket, deploy a replacement, and let users exit when they are ready?

Short answer: yes for normal market, DEX, and routing failures. Mark the old
basket exit-only, keep existing receipts visible, deploy a replacement manager
for the new basket, and let users choose USDC, NARA, raw-token exits, or
asset-by-asset exits. A token that refuses to transfer cannot be forced out by
any smart contract, but one broken token no longer has to trap the other working
tokens.

## Source-of-Truth Contract Facts

`NARAImmutableBasketPositionManagerV1` is immutable:

- no owner
- no pause
- no upgrade
- no config mutation
- no admin sweep
- one deployed manager represents one fixed basket

Available user exits for a live receipt:

- `sellBasket(..., USDC, ...)`
- `sellBasket(..., NARA, ...)`
- `withdrawUnderlying(tokenId, receiver)`
- `sellBasketPartial(...)`
- `withdrawUnderlyingPartial(tokenId, receiver, assetsToWithdraw)`

The contract uses exact transfer checks. This protects against fee-on-transfer
tokens, but it also means a token that later becomes paused, frozen,
blacklisted, or non-exact can make exits that include that token revert. Partial
sell and partial raw withdrawal let the user extract the remaining working
assets while leaving the failed component claim in the receipt.

## Basket Lifecycle States

Use these states operationally:

| State | Meaning | UI behavior |
|---|---|---|
| `live` | New buys and exits are available | Show card, enable buy flow |
| `exit_only` | Existing receipts can exit, no new buys | Show card with factual status, disable buy flow |
| `replaced` | A new manager exists for the same category | Old manager remains exit-only; new manager is listed separately |
| `hidden` | No manager address is listed | Only use when there are no user receipts or a separate recovery UI exists |

Frontend switch:

```text
VITE_BASKET_STATUS_BASE=exit_only
VITE_BASKET_STATUS_AI=exit_only
VITE_BASKET_STATUS_MEME=exit_only
VITE_BASKET_STATUS_DEFI=exit_only
```

Do not remove an old manager address from the app while users may still hold
receipts. Removing it can hide their positions from the normal UI.

## Incident Matrix

### 1. DEX Route Or Quoter Failure

Symptoms:

- quotes return zero
- one adapter route reverts
- pool exists but route data is stale

Action:

1. Disable new buys for the affected basket if route health is uncertain.
2. Keep positions visible.
3. Keep USDC/NARA sell available only if simulations pass.
4. Tell users raw-token withdrawal avoids DEX routing.

Replacement basket needed: no, unless the route cannot be restored.

### 2. Liquidity Disappears Or Becomes Too Thin

Symptoms:

- pool depth falls below launch threshold
- sell quotes are too small or unstable
- buys cause high price impact

Action:

1. Mark basket `exit_only`.
2. Keep raw-token withdrawal visible.
3. Deploy a replacement only after the new asset list passes liquidity checks.

User options:

- wait
- sell to USDC/NARA if a route simulates successfully
- withdraw raw tokens

### 3. Asset Price Goes To Zero

Symptoms:

- token still transfers, but market value is near zero
- DEX liquidity may still exist at low value

Action:

1. Mark basket `exit_only`.
2. Do not imply recovery, safety, or protection.
3. Deploy a replacement basket without the failed asset if the category should continue.

User options:

- sell if a route works
- withdraw raw tokens
- keep the receipt

Important: no contract action can restore value if the token itself has lost
market value.

### 4. Token Exploit, Rug, Or Bridge Failure

Symptoms:

- token contract is compromised
- bridge/wrapper backing fails
- issuer or admin action destroys market confidence

Action:

1. Mark the affected basket `exit_only`.
2. Disable all new buys immediately at the frontend.
3. Publish a factual incident notice.
4. Deploy a replacement manager with a reviewed asset list.
5. Keep the old manager visible for exits.

User options:

- withdraw raw tokens if transfers work
- sell to USDC/NARA if routes work
- hold receipt

### 5. Token Transfer Freezes, Blacklist, Pause, Or Fee-On-Transfer Turns On

Symptoms:

- `withdrawUnderlying` simulation reverts
- `sellBasket` simulation reverts on a token transfer
- token transfer amount no longer matches exact amount

Action:

1. Mark basket `exit_only`.
2. Keep the receipt visible, but show that automated exits may fail.
3. Publish direct Basescan instructions only for paths that simulate.
4. Do not deploy a new basket with any token that has admin-mutable transfers.

Current manager behavior:

- `withdrawUnderlyingPartial` can withdraw selected assets and leave the receipt live.
- `sellBasketPartial` can convert selected assets to USDC or NARA and leave the receipt live.
- If one asset cannot transfer, exits that include that asset can still revert.
- The failed component cannot be forced out while the token itself refuses transfer.

### 6. Basket Manager Or Adapter Exploit

Symptoms:

- user-owned underlying is missing
- adapter drains or misroutes assets
- manager balance is below `totalAccountedAsset`

Action:

1. Stop all buys across affected managers.
2. Keep only exit paths that simulate successfully.
3. Preserve logs and transaction hashes.
4. Deploy a new audited manager/adapter set.
5. Treat any reimbursement as an operator/legal decision, not protocol copy.

Important: if assets are actually gone from the manager, users can only withdraw
or sell what remains. A replacement basket does not repair the old manager.

### 7. Fee Collector Compromise

Symptoms:

- protocol fee tokens are drained or misrouted
- fee swaps behave unexpectedly

Action:

1. Stop fee operations.
2. Review Safe roles and selector allowlists.
3. If user positions are unaffected, do not block user exits.
4. Deploy a corrected fee collector for new baskets.

User underlying should not be affected by fee collector compromise unless the
incident also involves adapters or managers.

### 8. NARA Token Or NARA Pool Incident

Symptoms:

- NARA exits fail
- NARA pool has no liquidity
- NARA token address mismatch

Action:

1. Disable new buys if NARA cannot be bought as a required asset.
2. Keep USDC and raw-token exits available if they simulate.
3. Do not list replacement baskets until canonical NARA address and liquidity
   are verified.

### 9. Frontend Misconfiguration

Symptoms:

- manager address points at wrong contract
- manager `requiredAsset()` is not canonical NARA
- weights, assets, fees, or fee collector do not match config

Action:

1. Let the runtime checks disable buys.
2. Fix env/config.
3. Redeploy frontend.
4. Confirm all manager verification checks pass.

## Operational Playbook

Use this sequence for any major basket incident:

1. Identify the failure class: route, liquidity, token value, token transfer,
   manager, adapter, fee collector, NARA, or frontend config.
2. Simulate full and partial user exits: USDC, NARA, raw tokens, selected assets.
3. Set the affected basket status to `exit_only`.
4. Redeploy the frontend.
5. Publish a factual notice with exact affected basket, token, and options.
6. Keep old receipts visible in the UI.
7. Deploy a replacement manager only after asset curation passes again.
8. Add the replacement as a new listing or version. Do not overwrite the old
   manager while old receipts exist.
9. Monitor exit success, failed simulations, and support reports.

## Neutral Incident Copy

Use factual navigation copy:

```text
This basket is exit-only. New buys are disabled. Existing receipt holders can
review available exits: sell to USDC, convert to NARA where routes are
available, withdraw raw tokens, or withdraw selected working assets.
```

```text
One token in this basket has an active market or transfer issue. Review the
tokens and available exits before choosing an action.
```

Do not say:

- safe
- protected
- guaranteed recovery
- recommended exit
- best option
- lowest risk
- compensated
- insured

## Main Gap Before Production

The updated manager is strong for immutable custody and DEX-failure fallback.
The remaining unavoidable gap is the failed token itself: if a token refuses to
transfer, no basket contract can force that token out. The contract goal is to
make sure that failed token does not trap the other assets.

Production hardening backlog:

1. Keep the exit-only UI switch enabled for every basket.
2. Add multi-version basket listings so old managers and replacement managers
   can coexist under the same category.
3. Add daily token-risk monitoring: pool depth, transfer simulation, blacklist
   source scan, pause/admin source scan, route simulation.
4. Keep full-flow tests for partial sell and partial withdrawal in the launch gate.
5. Keep incident comms legally reviewed and neutral.
