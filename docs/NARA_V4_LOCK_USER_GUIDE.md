# Locking on NARA v4 — User Guide

Last updated: 2026-08-30.
Audience: future users and integrators reviewing gated source behavior.

> **PREVIEW / SOURCE-DESIGN GUIDE — NOT AN AVAILABLE PRODUCT FLOW.** The
> Position NFT Phase-2 baseline is deployed, source-verified, and Safe-finalized,
> but remains `integrationReady: false`; router, lenses, Genesis/bonds, and
> Lockboard are not deployed, and the Engine lifecycle smoke is pending. Do not
> follow the transaction steps or send funds based on this document. The
> canonical deployment uses real assets in technical live testing; that is not
> public product availability or legal approval. Any future public flow requires
> verified integration evidence, current fee/risk disclosure, monitored exits,
> and written jurisdiction-specific qualified-counsel review.

---

## What the locking source is designed to do

If a Position NFT consumer flow is later approved and activated, source behavior locks
NARA for a fixed duration and accounts variable NARA emission and contributed
ETH across active weight. Rewards are not promised and can be zero. The source
represents the position as an owner-transferable NFT; transferability does not
guarantee marketplace support, liquidity, a buyer, or an exit.

---

## Future user requirements

If a public flow is later deployed and activated, a user would need NARA on
Base, ETH for gas and any disclosed fee, and a compatible Base wallet. Verify
the deployed addresses and transaction review screen before taking any action.

---

## Choosing your duration

Duration is measured in epochs. Default epoch length: 900 seconds (15 min).

| Duration | Approximate real time | Weight multiplier vs 1-epoch |
|---|---|---|
| 4 epochs | 1 hour | ~1× (minimum) |
| 8,760 epochs | 90 days | ~1.28× |
| 17,520 epochs | 180 days | ~1.88× |
| 26,280 epochs | 270 days | ~2.78× |
| 35,040 epochs | 1 year | 4× (max) |

Longer duration produces more modeled weight per NARA. That does not guarantee
more rewards or any return. The source relationship is quadratic, so doubling
duration produces more than double the modeled weight.

**The source provides no early principal exit.** NARA remains locked until
`unlockEpoch`. NFT ownership is transferable, but marketplace availability and
sale are not guaranteed.

---

## Activation delay

Source behavior applies `activationDelayEpochs` (configured as 8 epochs in the
fresh Engine) before weight becomes active. This has not yet completed a
receipt-pinned public lifecycle smoke.

---

## Planned one-transaction path (not deployed)

The planned Lockboard flow uses `NARARouter.syncAndLockWithPermit`. The router,
Position NFT, and Lockboard are not available from this release; the steps below
are product-design notes, not transaction instructions.

1. Open the lockboard.
2. Enter amount and duration.
3. Review the `previewLock()` output: net amount after fee, weight, and ETH fee.
4. Sign the permit in your wallet.
5. Confirm the transaction. One signature, one tx.

The planned flow would mint a position NFT if every deployment and transaction
gate succeeds.

---

## Source-level manual path (not authorized for production use)

1. Approve `NARAEngine` for your NARA amount (or approve `NARARouter`).
2. Call `engine.lock(amount, durationEpochs, minWeight)` or `router.syncAndLockWithPermit(...)`.

---

## Planned position data

The Position NFT source exposes:
- `positionId` — global engine ID for the lock.
- `amount` — NARA locked (after lock fee if any).
- `weight` — the modeled accounting weight; it does not promise rewards.
- `activationEpoch` — when source accounting can become active.
- `unlockEpoch` — when you can exit.

The undeployed lens source is designed to read this in one call:
```
NARADashboardLens.getUserState(yourAddress, [positionId], [])
```

---

## Reward-claim source behavior

After activation, the Engine source can account claimable amounts per settled
epoch. Amounts are variable and can be zero.

Source-supported streams:

- **NARA emission** — accounted from the sealed 650,000 NARA reserve by active
  weight; and
- **ETH rewards** — accounted only after ETH is actually contributed through
  the Engine entry point.

The engine's arbitrary ERC-20 reward path is disabled for this deployment. No
vault, router, Safe, or EOA should hold `REWARD_NOTIFIER_ROLE`.

Source claims do not change the principal lock term.

---

## Extension source behavior

The source can extend an active position before maturity. Extension:

- settles accrued accounting first;
- Increases `unlockEpoch` by `additionalEpochs`.
- Recomputes your weight at the new duration.

Extension delays the date when principal can be unlocked. Any future UI must
show the new unlock epoch and weight before confirmation and must not present
extension as a recommended choice.

---

## Unlock source behavior

When `settledEpoch >= unlockEpoch`, source calls `unlock()` or `unlockTo()` can:
- attempt to release the recorded NARA amount when contract conditions pass;
- forward claimable recorded amounts;
- burn the NFT; and
- require the flat unlock ETH fee, if configured.

Execution, token value, and recovery are not guaranteed.

---

## Position NFT transferability

The source makes position-NFT ownership transferable while the underlying
Engine position remains locked. This is not a recommendation or evidence that
any marketplace will support the NFT, that a buyer exists, or that a transfer
provides liquidity or an exit.

---

## Epoch stale errors

Engine user writes can auto-advance up to 8 epochs. A larger backlog produces
an `EpochStale` condition. The undeployed router source exposes `syncEpochs()`,
but this guide does not authorize manual production calls; follow the current
operations runbook and deployed interfaces only after activation.

---

## Source fee parameters

These are source/configuration concepts, not a current transaction quote. A
future confirmation must read live values and show all fees before signing.

| Fee | Type | Notes |
|---|---|---|
| `lockFeeBps` | % of NARA locked | Taken from principal before weight is computed. Default: 2% (200 bps). |
| `lockFeeWei` | Flat ETH per lock | Sent with the transaction. Check current value via `lens.getUserState()`. |
| `unlockFeeWei` | Flat ETH per unlock | Sent with the unlock transaction. |

All ETH fees go to treasury (not burned). NARA fees reduce your locked amount.

---

## Source contracts and deployment status

| Contract | Current status |
|---|---|
| `NARARouter` | Source tested; not deployed |
| `NARAEngine` | Deployed; public lifecycle smoke pending |
| `NARAPositionNFTV4` | Tested, deployed, source-verified, and Safe-finalized; `integrationReady: false`, so consumers remain disabled |
| `NARADashboardLens` | Source tested; not deployed |

ABI authority: generated artifacts under `artifacts/contracts/v4/` from the
eventual merged origin commit. The deferred Lockboard is not an address or ABI
authority.
