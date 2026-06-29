# NARA v4 — Bootstrap Lock & the Weight-Inheritance Event

Last updated: 2026-06-09. Status: decided, pending execution at v4 launch.

This is the canonical reference for NARA v4's launch-defense lock and the
year-one payoff it creates for patient holders. It replaces the v3-flavored
"Weight Inheritance Event" notes in `BEGINNER_MESSAGING.md` for v4.

---

## The decision

At v4 launch, the team locks **~30,000 NARA at maximum duration (1 year =
35,040 epochs at 15-min epochs)** directly in `NARAEngine`, from the team Safe.

- It is a **plain `engine.lock` / `lockFor`** — no wrapper contract, no audit,
  no conditional/oracle unlock, no reward-recycling automation.
- The earlier `NARALaunchGuard` idea (liquidity-gated release + auto-recycle via
  `depositRewards()`) was **considered and dropped on 2026-06-09** in favor of
  the simplest possible primitive: one max-duration lock.
- The engine **hard-enforces the duration** — the principal cannot be withdrawn
  before `unlockEpoch`. This is the point: it is irreversible for the year.
- `extend()` is available if the team chooses to prolong the guard window before
  maturity. No early exit exists.

## Why — the two phases

**Phase 1 (year 1): anti-hijack.**
A large founding position holds dominant weight from day one. Because every
epoch's emission splits by `weight / activeTotalWeight`, a dominant founding
weight means a bad actor **cannot cheaply capture the emissions** at launch —
they would be diluted by the founding weight. The start is structurally guarded
while liquidity and participation build. (This is the rabbit-report insight: the
protocol/treasury is the largest early locker by design.)

**Phase 2 (at maturity): the weight-inheritance event.**
When the founding position matures and is **not recommitted**, its weight leaves
the pool. `activeTotalWeight` drops sharply, so the per-weight share of every
subsequent epoch's emission **rises for everyone still locked**. The holders who
stayed absorb the vacated share. The patient don't only earn along the way —
they **inherit the pool** at the end.

## The reinvestment flywheel (the power play)

The founding position earns NARA + ETH + USDC over the year. Those rewards are
**not extracted** — the operator's intent is to put them back to work building
the protocol and its community. Discretionary treasury deployment (not an
automated contract — the auto-recycle wrapper was dropped), e.g.:

- **Deeper liquidity** — strengthen the NARA/USDC pool toward depth targets.
- **Community & interaction** — reward active participation.
- **Games & competitions** — fund play-to-participate surfaces.
- **Creator / influencer campaigns** — growth and reach.

The flywheel: founding stake guards the launch → earns while it holds → rewards
fund liquidity + community + growth for a year → at maturity the dominant weight
steps aside → the holders who stayed inherit the freed share. "You hold the
line; the protocol does the work around you; the patient inherit at the end."

**Hard line — keep public copy neutral.** This flywheel is exciting but the
public framing must NOT promise returns. The power is in the *mechanism and the
scale of the commitment*, never a number. **Banned on public surfaces:** "build
the wealth you deserve", "rewarded hugely", "you deserve", "guaranteed",
projected APY/returns, "huge gains". **Allowed:** "the founding stake works all
year", "rewards go back to work", "deepen liquidity", "the patient inherit the
pool", "a structural shift in share". Always pair with "discretionary /
variable / can be zero / never promised".

## Mechanics (verified against contracts)

- Share each epoch = `position.weight / activeTotalWeight`
  (`NARAEngineModelLib.weightedLockShareWad`).
- Max-duration weight multiplier ≈ **3×** per token
  (`computeWeight`: `1 + 0.8·r + 1.2·r²`, r = duration/maxLockEpochs, r=1 → 3.0).
- On unlock/maturity the position's weight is removed from `activeTotalWeight`
  (scheduled deactivation), lowering the denominator for all remaining holders.
- The engine has **no early-exit**; the 1-year lock is enforced in code.
- The team keeps the rewards the position earns over the year (no recycling in
  this simplest version). The founding principal returns to the Safe at maturity.

## Public framing rules (for landing, social, docs)

- **The 30,000 founding stake IS public** (Leo, 2026-06-09) — shown in the
  landing's worked-example infographic as a transparency feature (it's an
  on-chain-visible lock). The narrative callout still uses "a large founding
  position." Keep the **rest** of the allocation private per `NARA_V4_POSITIONING.md`.
- Frame the payoff as a **structural shift in share**, never a promised return.
  Always keep "rewards are variable and can be zero."
- Do not describe the founding weight as price control — it is long-duration
  holding, not trading.
- Banned: "huge gains," "guaranteed," projected APY/returns. Allowed: "inherit
  the pool," "the patient capture a larger share," "the founding weight steps
  aside."

## Where it appears

- **Landing page:** the `RewardPool` section ("the pool") carries a dedicated
  **"the year-one event"** beat — the founding weight steps aside, the patient
  inherit. Copy lives in `apps/nara-landing/src/lib/content.ts` (`INHERITANCE`).
- **This doc:** the canonical operator + narrative reference.

## Execution checklist (at launch)

1. From the team Safe, approve + `engine.lock(30_000e18, 35040, minWeight)`
   (or `lockFor(safe, …)`), max duration.
2. Record the `positionId` and `unlockEpoch`.
3. Confirm dominant weight share in `epochState` after activation
   (`activationDelayEpochs` ≈ 8 epochs before it earns).
4. Do not transfer or wrap the position; it stays a plain engine position owned
   by the Safe.
5. ~1 year out, decide: recommit (extend) or let it mature → weight inheritance.

---

*Source of truth: `contracts/v4/NARAEngine.sol`, `libraries/NARAEngineModelLib.sol`.
Decision owner: Leo, 2026-06-09.*
