# NARA Protocol - Beginner Messaging

Last updated: 2026-05-27.
This document covers simple, public-facing messaging for NARA.

Status: v3 is retired as of 2026-05-27. Fresh v4 has not yet launched. Do not describe any live protocol state until the fresh v4 deploy is verified and recorded in `CURRENT_STATE.md`. For v4 positioning copy, use [V4_POSITIONING.md](V4_POSITIONING.md).

> **v4 note:** The structural messaging in this document (fixed supply, sealed reserve, commitment-weighted yield, weight inheritance concept) holds for v4. Specific numbers drawn from v3 state (committed amounts, weight totals, unlock epochs) are marked as v3-era examples. Actual v4 numbers will be set at launch and confirmed in `CURRENT_STATE.md`.

---

## Core Line

> NARA rewards commitment, not attention.

Use this as the default positioning line across all surfaces.

---

## The True Story

NARA launches with a calibrated foundation. The team commits NARA at max duration before public participation opens — not for personal gain, but as a structural choice to stabilize the adaptive emission model during bootstrap and protect early participants.

Those positions are the basis for the protocol's liquidity operations and sponsor seeding. The team controls the floor during bootstrap. The goal is to attract committed participants, seed game activity, and grow the protocol into something worth competing for.

When the team's commitment positions mature, if they choose not to recommit, the weight they held exits the pool permanently. The reserve continues emitting. Everyone still committed captures a dramatically larger share. This is the weight inheritance event — the structural reward for being early and staying.

_v3 reference: in v3, the team committed 30,000 NARA at max duration (90,000 weight). Positions were set to mature at epoch 35,375. v4 will establish fresh positions at launch._

---

## What NARA Is

NARA is a fixed-supply protocol on Base built for people who want more than passive token exposure.

Core structure:

- `1,000,000 NARA` total supply — fixed forever in code
- `700,000 NARA` sealed in the reward reserve — only the engine can release it, epoch by epoch
- `~290,000 NARA` sealed in a bond inventory vault
- Commitment-weighted yield: longer commitment earns quadratic weight
- ETH reward routing: protocol game and bond activity routes ETH to the committed

---

## What Is Live Right Now

**Pre-launch state as of 2026-05-27:** v3 is retired. Fresh v4 has not yet launched. Do not quote live-state numbers until verified and recorded in `CURRENT_STATE.md`.

Durable facts that hold regardless of deploy timing:

- `1,000,000 NARA` total supply. Fixed forever in code.
- `700,000 NARA` sealed in the reward reserve — admin cannot touch it.
- `~290,000 NARA` sealed in the bond vault — capacity starts at zero until terms are reviewed.
- Commitment positions earn NARA and ETH proportional to weight.
- In v4, epochs auto-advance JIT on lock/unlock/claim — no external keeper required.
- Bonds begin inactive. Terms, capacity, and roles must be reviewed before opening.

When the fresh v4 deploy is verified, CURRENT_STATE.md will have the canonical committed amounts, position counts, epoch, and live addresses. Do not quote exact v4 addresses, deployment timing, or private allocation numbers in public messaging until then.

---

## The Weight Inheritance Event

This is the most important structural fact for anyone considering max-duration commitment at launch.

The mechanism:
- The team commits NARA at max duration at launch, holding a dominant weight share during bootstrap.
- As long as those positions are active, public participants earn proportional to their weight share.
- When the team's positions mature, if the team does not recommit, all of that weight exits the pool permanently.
- The reserve continues emitting. The same engine advances. But the denominator of every reward calculation drops sharply.
- Public commitments go from earning a small share to earning near 100% of each epoch's emission.

**Max-duration commitment at launch captures the full window.** You ride the team's weight shadow during bootstrap, then inherit the yield landscape when they exit.

_v3 reference: in v3, team weight was 90,000 (87.1% of pool) and public weight was ~13,284 (12.9%). If team exited at epoch 35,375 without recommitting, public yield would have increased ~7.8× per unit. v4 will establish fresh numbers at launch — see `CURRENT_STATE.md` post-deploy._

---

## What Not To Say

- Do not promise profits
- Do not say rewards are guaranteed
- Do not imply bonds are already open
- Do not imply the board is the whole protocol
- Do not say the team can change supply later
- Do not use `risk free`, `easy money`, or similar language
- Do not describe the team's weight control as price manipulation — it is long-duration commitment, not trading

---

## Product Framing

Good framing:

- hold NARA for exposure
- commit NARA to earn NARA and ETH reward flow
- when bonds open, they become a controlled discounted entry path
- future wrappers and tools can expand what committed NARA means

Important framing:

- the lockboard is an onboarding surface
- it is not the full product thesis
- the protocol is broader than one campaign or one page
- live now = calibration, not finished product

---

## Simple Explanations

### 5 seconds

NARA rewards commitment, not attention.

### 15 seconds

NARA is a fixed-supply Base protocol where committed participants earn from a sealed NARA reserve and future ETH flow — proportional to how long they stay in.

### 30 seconds

NARA has a fixed supply of `1,000,000`. `700,000` is sealed for participant rewards, `~290,000` for future bonds, and only a small float is liquid. Committed participants earn NARA from the reserve and ETH from protocol games and bonds over time. Duration is the multiplier — commit longer, earn structurally more.

---

## Why It Matters

### 1. Supply is constrained by code

The main story is not `trust us.` The main story is that supply and reserve rules are locked into deployed contracts. Admin cannot add supply. Admin cannot touch the reward reserve.

### 2. Duration is structural, not cosmetic

Longer commitment earns more weight via a quadratic formula. This is not an APY tier. Duration is part of the asset.

### 3. The weight shift is real

The team's dominant weight exits the pool in approximately 11 months. The protocol does not have a mechanism to prevent this or extend it without recommitting. Whoever is committed at max duration through that event inherits the yield pool.

### 4. The protocol can outgrow the first surface

The launch board is one entry point. The long-term protocol opportunity is larger: analytics, wrappers, automation, and future ETH-routing surfaces built by the community.

---

## Homepage / Bio Style Copy

Short:

- Commitment-weighted yield. Fixed supply. Live on Base.
- Duration earns. Time is the multiplier.
- Base-native. Sealed reserves. No inflation escape hatch.

Longer:

- NARA is a fixed-supply protocol on Base with sealed reward reserves, commitment-weighted yield, and growing ETH flow to participants who stay in longest.

---

## Vocabulary Reference

| User-facing term | Technical contract term (do not change) |
|---|---|
| Commit NARA | `lock()` |
| Commitment position | `position` |
| Commitment duration | `durationEpochs` |
| Committed NARA | `netAmount` / `principal` |
| Commitment fee | `lockFeeWei` / `lockFeeBps` |
| Commitment activates | `activationEpoch` reached |
| Commitment matures | `unlockEpoch` reached |
| Committed participant | locker (internal reference only) |

---

## Messaging Guardrail

If a line makes NARA sound like a short-term campaign instead of a durable protocol, it is the wrong line.

If a line makes the team's weight position sound like control rather than commitment, rewrite it.

If a line makes the weight inheritance event sound like a risk rather than an opportunity, flip it.
