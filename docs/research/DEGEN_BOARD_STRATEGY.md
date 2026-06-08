# NARA Degen Board — Strategic Analysis

> Last updated: 2026-03-26
> This is a strategy document. Cross-check `docs/CURRENT_STATE.md` for live protocol state.
> 2026-04-29 status: historical strategy reference. Do not use this as current v4 launch copy.

---

## What It Is

The NARA Degen Board is a 10×10 grid of 100 founding locker slots at `/mine`.

Each slot has a fixed tier: 50, 100, 250, 500, or 1,000 NARA.
Each slot maps to an on-chain max-duration lock.
Each slot is a public identity tile — alias, emoji, project name, links, message.

Slot distribution (seeded-random placement across the grid):

| Tier | Slots | NARA per slot | Total NARA |
|------|-------|---------------|------------|
| 🧱 50 | 25 | 50 | 1,250 |
| 🔒 100 | 25 | 100 | 2,500 |
| ⚡ 250 | 20 | 250 | 5,000 |
| 🔥 500 | 15 | 500 | 7,500 |
| 👑 1K | 15 | 1,000 | 15,000 |
| **Total** | **100** | — | **31,250 NARA** |

If the board fills completely, 31,250 NARA is locked across 100 wallets, each at maximum duration.

---

## Why the Board Comes First

Every other protocol milestone has a dependency. The board has none.

- Bonds require V3 pool depth + TWAP stability + price conditions. Not ready.
- BurnRunArena requires deployment + tuning + community size. Not deployed.
- Composability wrappers require liquidity + lock volume + third-party builders. Not started.

The board needs exactly two things: NARA in a wallet and a connected wallet.
That is achievable today, at any price, with any amount of liquidity.

It is the only live growth action available right now.

---

## The Floor Price Mechanism

This is the angle most people miss.

The board does not just record locks. It **creates inbound buy pressure against a float that cannot absorb it**.

Live float: approximately 20,000 NARA in the Uniswap V3 pool and open market.
Board demand if filled: 31,250 NARA.

The board cannot fill without buying more NARA than currently exists in liquid circulation.

Walk through the math:

- Current liquid supply: ~20,000 NARA
- Board total if all slots claimed: 31,250 NARA
- Shortfall: ~11,250 NARA that must come from somewhere else

The only place it comes from is the Uniswap V3 pool.
Every slot claim is a market buy, or a buy that previously happened and is now being locked.
The more slots fill, the more NARA gets pulled from float into long-term locks.

This is a structural floor price mechanism, not a narrative one. The math forces it.

It also means:
- 1K tier slots (15 × 1,000 = 15,000 NARA) alone would require nearly the entire current float to fill
- 500 tier slots (15 × 500 = 7,500 NARA) represent another 37.5% of float
- Even partial board fill materially tightens supply

---

## The Bond Enablement Angle

The board is the fastest path to bond activation.

Bonds require:
1. Sufficient V3 pool depth to make the TWAP manipulation-resistant
2. Price stability that makes discounting non-destructive

Both requirements are satisfied by the same thing: **more NARA bought and locked**.

When board participants buy NARA from the V3 pool:
- Pool depth increases (assuming they don't extract liquidity)
- TWAP stabilizes because more ETH/NARA sits in the pool
- Price appreciation from buy pressure creates headroom for the bond discount

The bond discount cap is 12%. If NARA price is too low, a 12% discount pushes buyers toward immediate arbitrage rather than locking. The board fills at current price — no discount required — and in doing so, raises the price baseline that makes bonds viable.

**Board fills → price rises → pool deepens → TWAP stabilizes → bonds open → ETH enters engine → lockers earn ETH → more locking → repeat.**

This is the correct order of operations. The board is not a side feature. It is the first step in the revenue loop.

---

## The Verification Architecture

This is the board's most underappreciated engineering property.

Claiming a slot is not a form submission. It is a cryptographic proof of on-chain action.

The backend (`claim-slot.ts`) does all of the following before accepting any claim:

1. Fetches the tx receipt from Base mainnet and checks `status === success`
2. Confirms the transaction sender matches the claiming wallet
3. Confirms the transaction called the live `NARAEngineV2` address
4. Decodes the calldata and confirms it was a `lock()` call
5. Confirms the lock duration equals `maxLockEpochs` — max duration, no exceptions
6. Parses the `Locked` event logs and extracts the actual on-chain net amount and weight
7. Checks that the net amount qualifies for the claimed slot tier
8. Confirms the slot is not already taken (race condition safe)
9. Confirms the wallet has not already claimed another slot (1 slot per wallet)
10. Writes to Cloudflare D1 only after all checks pass

A slot on the board is not a badge. It is a verified proof that a specific wallet locked a specific amount of NARA at maximum duration on Base mainnet. It cannot be faked, purchased, or transferred without a real on-chain lock.

This is a trust primitive, not a UX feature.

---

## The Social Layer

Each slot is a public identity card.

A slot holder can set:
- Alias (their name or handle)
- Project name and description
- Display character (letter, emoji, or custom)
- Display color
- Twitter / X handle
- Farcaster handle
- Website
- A free-text message

The wallet address is visible. The lock weight is visible. The activation epoch is visible.

This creates a public signal layer on top of the financial layer. Anyone can look at the board and see:
- Who locked
- How much they locked
- When they locked
- What they represent
- How to reach them

The board is a credibility board for the founding cohort. Slot #01 is not the same as slot #99 in social terms, even if the tier is identical. Position matters. The slot number is visible and permanent.

---

## The Scarcity Structure

The board has hard, transparent, irreversible scarcity.

100 slots. That is it. Forever.

The slot layout is seeded-deterministic, computed from the string "NARA" (`0x4e415241`). The tier for every slot is fixed before anyone claims. No one controls which slot gets which tier. It is not a team decision — it is a hash output.

This matters for trust. If the team controlled tier assignment, they could assign the best tiers to friends. Because it is seeded-random and verifiable, the tier layout is neutral.

Once the board fills, there will never be another founding slot. The board is not a campaign. It is a closed ledger.

Additional scarcity mechanics:
- One slot per wallet, enforced on-chain tx verification
- Team wallets are excluded from claiming (hardcoded in `DEFAULT_EXCLUDED_WALLETS`)
- The slot tier must match the net locked amount — you cannot claim a 1K slot by locking 50 NARA

---

## The Timing Advantage

Being early on the board has compounding advantages that disappear over time.

**Weight advantage:** Early lockers are the only active lockers while the board is filling. Every epoch that advances before a new locker activates is an epoch where the existing lockers take 100% of the drip. There are no partial rewards. There is no consolation prize.

**Bootstrap decay advantage:** Bootstrap phantom weight decays each epoch. Early lockers entered when bootstrap was higher, meaning their weight as a fraction of total weight is now larger than it was. This does not decrease as the board fills — it is baked into the epoch index history.

**Float advantage:** Every slot filled tightens the float. Early slot fillers lock at a lower price. Later fillers lock at a higher price caused by earlier fills. Being early means locking more weight per dollar of ETH spent.

**Social advantage:** Slot numbers are visible. Slot #01 will always have been #01. There is no retroactive position improvement. The order of arrival is permanent.

---

## The ETH Flow Connection

The board is not just about NARA locking. It is the earliest mechanism for ETH to start flowing to lockers.

Currently: 0 ETH in the engine reward queue.

ETH enters the engine through:
1. `lockFeeWei` — flat ETH charged at lock time (0.0001 ETH per lock)
2. `claimFeeBps` — percentage of ETH rewards taken at claim time
3. Bond sales — not open yet
4. BurnRunArena — not deployed yet

Every board claim pays `lockFeeWei`. At 100 slots: 100 × 0.0001 ETH = 0.01 ETH queued as treasury fees.

More significantly: every person who buys NARA to claim a board slot moves price in the V3 pool. Price movement creates trading activity. Trading volume in the V3 pool is what eventually supports TWAP for bond pricing. Board activity is the seed that grows into bond-eligible pool depth.

There is also a direct social ETH flow mechanism: once slots are visible with profiles, other protocols and projects will look at the board and see who is here. That visibility creates inbound interest. Inbound interest creates buys. Buys create price support. Price support enables bonds.

---

## The Identity Protocol Angle

The board is the first identity layer for NARA.

The profile system stores:
- On-chain: wallet address, lock amount, weight, activation epoch, unlock epoch, tx hash
- Off-chain (Cloudflare D1): alias, display, project name, description, links, message

The combination creates something no other early-stage DeFi protocol has built: a **verified, on-chain-backed identity registry** for founding participants.

This is composable. Future products can:
- Display board holder badges in other UIs
- Gate access to early features to board wallets
- Route governance weight to board participants
- Use board slot data as a credibility signal in lending or collateral contexts

The board is not just a grid. It is the founding registry of the protocol.

---

## Angles Most People Won't See

### The Impossible Fill Math

The board cannot technically fill at current prices without either:
- New external capital entering the market to buy NARA, or
- Existing NARA holders selling other assets to acquire NARA for board slots

Either path is protocol-positive. New capital deepens liquidity. Existing holders consolidating into locks tightens float. The board is adversarial to casual holders who want liquid NARA — it applies continuous pressure to convert float into locks.

### The Permanent Weight Roster

Once the board is full, the locked supply from board participants will sit there for 365 days. 100 wallets locked at max duration. These wallets will all be receiving NARA and ETH rewards for a year. They have a financial incentive to talk about the protocol, to use it, to build on top of it.

The board converts 100 wallets from observers into invested participants with a material financial stake in the outcome.

### The Board as TWAP Defender

One of the most concrete risks to bond activation is V3 pool manipulation. Thin pools are manipulable. A pool with more NARA-side liquidity is harder to manipulate.

Board claimants buy NARA from the pool. Some of those buyers may also add liquidity. Even if they don't, the act of buying raises the price and increases the ETH-denominated value of the pool's existing NARA. Higher pool value = harder to manipulate TWAP.

The board is an indirect TWAP hardening mechanism.

### The Tier Structure as Social Signal Amplifier

The 1K tier costs 1,000 NARA. At current prices (~$0.02), that is approximately $20. But the social signal is not priced in dollars — it is priced in commitment. Locking 1,000 NARA at max duration, surrendering liquidity for 365 days, to claim a slot with a 👑 crown emoji, is a visible statement.

The board turns financial commitment into public identity. In crypto, that is one of the strongest acquisition mechanics that exists.

---

## Positioning Against Other Protocols

No other early-stage Base DeFi protocol has built this specific combination:

1. On-chain tx verification to prevent fake claims
2. Public identity grid tied to real locks
3. Fixed tier amounts at fixed slot counts, never expandable
4. Max-duration enforcement at the smart contract level
5. Team wallet exclusion baked in

This is not a whitelist. Not a points campaign. Not an airdrop eligibility system. It is a proof-of-commitment registry with permanent social visibility.

Comparable surface mechanics (NFT mint, whitelist, OG role) are all soft. Anyone can get an OG role with enough social engagement. Nobody can fake a 365-day max-duration lock on Base mainnet.

---

## What Needs to Happen

The board is live. The mechanism works. The verification is solid.

What it needs:

1. **Visibility.** People who would lock don't know the board exists. Every slot that fills should be a public event with a specific, unique post — not a template.

2. **Explanation.** The floor price math, the verification architecture, and the scarcity structure are not obvious. They need to be written down in accessible language and distributed wherever NARA is discussed.

3. **The first 5 outside slots.** The two founding team slots are locked. The first 5 outside wallets to claim will set the social precedent. Those first claims need to be treated as events, not just transactions.

4. **Bond narrative linkage.** Every board discussion should explicitly connect to bond activation. The board is not separate from bonds. It is the prerequisite. Communicating this turns board slots from a collectible into a strategic asset.

5. **The scarcity countdown.** The board should prominently display how many slots remain at each tier. Scarcity should be legible. Right now a visitor to `/mine` may not immediately understand that these 100 slots are forever.

---

## Summary

The Degen Board is the protocol's only zero-dependency growth mechanism right now.

It creates floor price pressure through fixed buy demand against a tight float.
It enables bond activation by deepening the V3 pool.
It converts 100 wallets into financially invested founding participants.
It creates a public, verified, on-chain-backed identity registry.
It is the first and only source of early ETH flow into the engine.
It has hard, transparent, irreversible scarcity.
It enforces max-duration locking at the smart contract level — no shortcuts.

If any single thing moves NARA from "deployed protocol with two team locks" to "protocol with a visible, growing founding cohort," it is the board filling.

Start there. Everything else follows.
