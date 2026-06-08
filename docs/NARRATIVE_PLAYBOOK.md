# NARA Protocol - Narrative Playbook

Last updated: 2026-05-27.
This is the canonical voice and story guide for all NARA public communication.
Any doc, post, UI copy, or thread should pass through this before publishing.

Status: v3 is retired as of 2026-05-27. Fresh v4 has not yet launched. Do not describe any live protocol state until the fresh v4 deploy is verified and recorded in `CURRENT_STATE.md`. For v4 positioning copy, use [V4_POSITIONING.md](V4_POSITIONING.md).

> **v4 note:** The structural narrative (fixed supply, sealed yield budget, weight inheritance mechanics, the rebuild story, the founding 100 concept) holds for v4. Specific claims tied to v3 live state (epoch numbers, committed amounts, emission stats) are marked as v3-era. Refresh these at launch with data from `CURRENT_STATE.md`.

---

## The True Story

NARA launches with the team already committed.

The team commits at max duration before public participation opens — a structural decision, not a personal enrichment play. The protocol needs sufficient weight during bootstrap to prevent the adaptive emission model from misbehaving on a thin float. The team provides that weight from their own NARA. No additional tokens minted. No treasury allocation created.

The team's committed NARA seeds two strategic functions: seeding liquidity to support the market, and seeding sponsor positions in Arena and Lotto to activate the competitive layer. The goal is to attract committed participants who want to compete and earn — and to build enough activity that the protocol runs on its own.

The floor is controlled by the team's long commitment during bootstrap. That control transfers to the community over time, one committed participant at a time.

_v3 reference: the team committed 30,000 NARA at max duration in v3. No additional tokens were minted. v4 will establish fresh positions at launch._

---

## The Weight Inheritance Event

When the team's max-duration commitment positions mature, if they do not recommit:

- All team weight exits the pool permanently
- The sealed 700,000 NARA reserve continues emitting
- Public committed participants go from a small share of emissions to near 100%
- Per-unit yield for the committed increases dramatically

This is the structural reward for being early and staying committed at max duration.

It is not a trick. It is not marketing. It is the mechanical consequence of the team's positions maturing without replacement.

The founding board's max-duration requirement exists precisely because of this. Every slot is a commitment that runs through the transition. Every max-duration committer at launch is positioned for the weight inheritance event.

_v3 reference: team weight was 90,000 (87.1% of pool), public weight ~13,284 (12.9%). If team exited at epoch 35,375 without recommitting, public yield would have increased ~7.8× per unit. v4 will have fresh numbers — see `CURRENT_STATE.md` post-deploy._

---

## Voice Rules

### Say this

- "Commit NARA" — not "lock NARA"
- "Commitment position" — not "lock position"
- "Committed participants" — not "lockers"
- "Commitment duration" — not "lock duration"
- "Commitment weight" — not "lock weight"
- "Your commitment activates" — not "your lock activates"
- "Committed NARA" — not "locked NARA"
- "Duration earns structurally more" — not "longer stakes earn more APY"
- "The team committed before public" — not "team tokens are vested"
- "Live calibration" — not "beta" or "early access"
- "Weight inheritance event" — for the structural shift when team weight exits

### Never say

- "lock" in user-facing copy (technical docs only)
- "locker" in user-facing copy
- "APY" or "yield percentage" — rates are dynamic, never fixed
- "risk free" or "guaranteed returns"
- "price control" or "floor management" — say "the team's committed position supports the market"
- "bonds are coming soon" — say "bonds are deployed and will open when conditions support it"
- "we will relock" — say "the team has not committed to recommitting those positions"
- Any language that implies the current price or liquidity is permanent

---

## The Enemy

**Inflation theater** — protocols that mint tokens to pay rewards, calling it "yield" while transferring the cost to holders through supply dilution. Every inflationary reward protocol is taking from holders with one hand and returning a fraction with the other.

NARA is structurally opposite:
- Supply is fixed at deployment
- Reward budget is sealed and finite
- Admin cannot add to either
- The amount of NARA that will ever reach committed participants is mathematically bounded

When asked "how is this different," the answer is: **the yield budget is closed. It was set at deployment and cannot be expanded by anyone.**

---

## Positioning Statement

> Fixed supply. Sealed yield budget. Duration earns.

Longer form:

> NARA is a protocol on Base where the yield budget is mathematically sealed at deployment, duration is the only multiplier, and the reward pool closes permanently over time — no inflation, no governance unlock, no rewrite.

---

## Three Pillars

**1. The budget is closed.**
700,000 NARA. Sealed. Admin cannot touch it. Only the engine releases it, epoch by epoch, to active weight holders. The total NARA that can ever reach committed participants is a fixed number that started depleting the moment the protocol launched. It can only go down, never up.

**2. Duration is the asset.**
Commitment duration earns quadratic weight. This is not a loyalty bonus. Duration is the primary variable in the yield formula. A longer commitment is structurally, mechanically, non-cosmetically worth more than a shorter one on the same principal.

**3. ETH is the upgrade.**
NARA drip from the reserve is finite. But ETH routed from protocol activity — bonds, games, fees — is open-ended. When bonds open and games run, committed participants earn ETH on top of NARA. This is the path from a token yield system to a protocol cash flow system.

---

## The Current Phase

This is the v4 rebuild and fresh launch.

v3 ran for months on Base, the team ran it in real conditions, found what to refine, and rebuilt from scratch for the v4 launch. The emission model, the weight mechanics, the game surfaces — hardened through real operation, then redesigned. Not a soft start.

The fresh v4 deploy establishes the next live phase. When it launches:
- Calibration begins again in real conditions
- The team commits fresh positions under the same rules as everyone else
- Bonds open when terms, capacity, and roles are reviewed
- Liquidity deepens as committed participants and sponsor activity builds

The protocol is not waiting to be finished — it is designed to be tuned in real conditions. That is the only way to tune it correctly.

_v3 reference: v3 ran for over 3,000 epochs (~750+ hours) with no critical failure, no contract exploit, no supply change. v4 builds on that foundation._

---

## Mythology Elements

**The rebuild**: NARA started as FIELD, a working prototype. The team ran it, found the gaps, and rebuilt from scratch rather than shipping something unsafe. The current repo has been internally reviewed and hardened, with external review still required before large public TVL. Teams that rebuild for correctness over speed are worth backing.

**The genesis commitment**: Before any public participation, the team commits at max duration. Not a soft vesting cliff. A real engine commitment under the same rules as everyone else. The team's tokens don't unlock until their positions mature. They earn through the same activation delay, the same weight formula, the same claim mechanics. No special path.

_v3 reference: the team committed 30,000 NARA, positions set to mature at epoch 35,375. v4 will establish fresh positions at launch._

**The founding 100**: The lockboard has 100 slots. Max duration required. Permanent on-chain record. These are not "early stakers." They are the founding committed participants — people who chose the maximum duration before the weight inheritance event was widely understood. When the team's weight exits, these positions are the core of the new pool.

**The closing window**: 700,000 NARA sealed. Every epoch that runs depletes the budget by a small amount. The window to commit early is not a countdown timer gimmick — it is a mathematical reality. The rate increases as warmup and bootstrap mechanics resolve. The earliest committed participants capture the most of a budget that can never be refilled.

_v3 reference: 43 NARA emitted at one snapshot (reserve 99.994% intact). v4 resets at fresh deploy — see `CURRENT_STATE.md` post-deploy for live emission stats._

---

## Content Piece Order

When publishing externally, prioritize in this order:

1. The weight inheritance event — the structural reason max duration is the right position now
2. The genesis commitment proof — team locked before anyone, same rules as everyone else
3. The closed yield budget — 700K sealed, admin cannot touch it, finite forever
4. The rebuild story — FIELD → NARA, why the team chose correctness over speed
5. The founding 100 — permanent record, max duration, and what that means post weight-shift

---

## What This Is Not

- A governance protocol
- A staking program with adjustable rewards
- A team allocation with a vesting cliff
- A finished product
- A price guarantee
- A promise of future APY

It is a live, calibrating, fixed-supply protocol where duration is the only multiplier and the team's commitment matures on the same timeline as everyone else's.
