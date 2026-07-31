# Locking on NARA v4 — User Guide

Last updated: 2026-07-28.
Audience: anyone who wants to lock NARA and earn rewards.

---

## What locking does

You deposit NARA for a fixed duration. You earn NARA emission and ETH rewards on every settled epoch. Your locked position is a tradable NFT — you can sell it without unlocking.

---

## Before you lock

- You need NARA tokens on Base.
- You need a small amount of ETH on Base for gas (and a flat lock fee if enabled).
- You need a wallet connected to Base (Base Smart Wallet, MetaMask, Coinbase Wallet, etc.).

---

## Choosing your duration

Duration is measured in epochs. Default epoch length: 900 seconds (15 min).

| Duration | Approximate real time | Weight multiplier vs 1-epoch |
|---|---|---|
| 4 epochs | 1 hour | 1× (minimum) |
| 96 epochs | 1 day | ~1.07× |
| 672 epochs | 1 week | ~1.5× |
| 2,880 epochs | 30 days | ~2× |
| 35,040 epochs | ~1 year | ~3× |

Longer lock = more weight per NARA = more rewards per epoch. The relationship is quadratic, so doubling duration gives more than double the weight.

**There is no early exit.** Your NARA is locked until `unlockEpoch`. The NFT representing your position is tradable at any time on any NFT marketplace.

---

## Activation delay

After locking, your position is not immediately earning. There is an `activationDelayEpochs` (default: 3 epochs = 45 min) before your weight becomes active. You will see `0` claimable rewards until activation passes. This is expected.

---

## How to lock (one-transaction path)

The lockboard uses `NARARouter.syncAndLockWithPermit`. You sign one EIP-712 permit (no separate approve transaction) and the router handles permit + epoch sync + lock in a single transaction.

1. Open the lockboard.
2. Enter amount and duration.
3. Review the `previewLock()` output: net amount after fee, weight, and ETH fee.
4. Sign the permit in your wallet.
5. Confirm the transaction. One signature, one tx.

Your position NFT appears in your wallet immediately.

---

## How to lock (manual two-step path, for EOA users without Base Smart Wallet)

1. Approve `NARAEngine` for your NARA amount (or approve `NARARouter`).
2. Call `engine.lock(amount, durationEpochs, minWeight)` or `router.syncAndLockWithPermit(...)`.

---

## Understanding your position

Your NFT contains:
- `positionId` — global engine ID for the lock.
- `amount` — NARA locked (after lock fee if any).
- `weight` — your earning power. Higher = more rewards per epoch.
- `activationEpoch` — when earning starts.
- `unlockEpoch` — when you can exit.

Read all of this in one call:
```
NARADashboardLens.getUserState(yourAddress, [positionId], [])
```

---

## Claiming rewards

Rewards accumulate every epoch. You can claim at any time before unlock.

Active reward streams:
- **NARA emission** — protocol distributes from the sealed 650,000 NARA reserve based on your weight share.
- **ETH rewards** — from bond purchases and external notifiers (`notifyEthRewards()`).

The engine's arbitrary ERC-20 reward path is disabled for this deployment. No
vault, router, Safe, or EOA should hold `REWARD_NOTIFIER_ROLE`.

Claiming does not affect your lock. Your position continues earning after you claim.

---

## Extending your lock

You can extend the duration of an active position before it matures. Extending:
- Settles all accrued rewards first (you collect what you've earned).
- Increases `unlockEpoch` by `additionalEpochs`.
- Recomputes your weight at the new duration.

Extending settles accumulated rewards and keeps the existing position active.
It also delays the date when the principal can be unlocked. Review the new
unlock epoch and weight before confirming; the interface must not present
extension as a recommended choice.

---

## Unlocking

When `settledEpoch >= unlockEpoch`, your position is matured. Call `unlock()` (or the NFT's `unlockTo()`):
- Returns your NARA principal.
- Forwards any remaining unclaimed rewards.
- Burns the NFT.
- Costs the flat unlock ETH fee (if set).

---

## Selling your position NFT

If you need liquidity before maturity: list your position NFT on any ERC-721 marketplace (OpenSea, Blur, etc.). The buyer inherits the position and all future rewards. The underlying engine position stays locked — selling the NFT does not unlock the NARA.

---

## Epoch stale errors

If the protocol hasn't been used in over 8 epochs (2 hours), user-facing transactions auto-advance up to 8 epochs. If backlog is larger, the lockboard calls `router.syncEpochs()` before your action — silently, in the same batch.

If you see an `EpochStale` error:
1. The app should handle this automatically via `router.syncEpochs()`.
2. If it doesn't, manually call `router.syncEpochs()` to clear backlog.

---

## Fees

| Fee | Type | Notes |
|---|---|---|
| `lockFeeBps` | % of NARA locked | Taken from principal before weight is computed. Default: 2% (200 bps). |
| `lockFeeWei` | Flat ETH per lock | Sent with the transaction. Check current value via `lens.getUserState()`. |
| `unlockFeeWei` | Flat ETH per unlock | Sent with the unlock transaction. |

All ETH fees go to treasury (not burned). NARA fees reduce your locked amount.

---

## Key contracts

| Contract | What you interact with |
|---|---|
| `NARARouter` | `syncAndLockWithPermit()`, `syncEpochs()` |
| `NARAEngine` | Underlying lock/claim/unlock (called via router or NFT) |
| `NARAPositionNFTV4` | Your position NFT; `claimRewards()`, `unlockTo()`, `extend()` |
| `NARADashboardLens` | `getUserState()`, `getEpochState()`, `previewLock()` |

ABIs: `apps/nara-lockboard/src/shared/nara.ts`.
