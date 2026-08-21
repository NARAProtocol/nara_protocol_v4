# NARA v4 — NFT Protocol Role Audit

Last updated: 2026-08-21.
Purpose: the protocol-wide map of where NFTs matter in NARA — what exists in code, what is
missing, what is unnecessary, and what should never be built. Grounded in the actual v4 contracts,
not assumptions.

Read alongside:
- `NARA_V4_NFT_POSITIONS.md` — canonical position-NFT spec (the *what*)
- `NARA_V4_NFT_RENDERER_README.md` — renderer implementation (the *how*)
- `NARA_V4_NFT_ART_DESIGN_BIBLE.md` — art direction (the *why*)
- `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` — claim fees, lifetime stats, compliance stance

Sources verified for this audit:
`contracts/v4/NARAPositionNFTV4.sol`, `NARABondDepositoryV4NFT.sol`,
`composability/NARAStakingPoolV4.sol`, `composability/NARAFractionalPositionV4.sol`,
`NARAEngine.sol`, `NARAGenesisRewardDistributorV4.sol`.

**Deployment status:** the fixed-v4 core is deployed on Base, but the Position NFT suite is not.
The exact seven-contract Phase-2 workflow is implemented locally and remains unmerged, without a
verified NFT address or final manifest. Bonds, Genesis distribution, allocations, and router/lens
surfaces remain Phase 3. The mechanics below describe code capability unless a verified deployment
manifest is cited.

---

## 0. One-line truth

NARA has exactly **one ERC-721** (`NARAPositionNFTV4`, "NARA Position" / `NARAPOS`). It absorbs the
full ladder — position, lock receipt, claim right, bond delivery, genesis provenance, eternal
commitment, and realized high-value status — in a single token. Composability (`stNARA`, `fracNARA`)
consumes that NFT and emits **ERC-20s**, not new NFT classes. Several mechanics commonly assumed
(separate mining, streaks, boosts, governance, liquidity-supporter NFTs) **do not exist in code** and
most should not be built unless the underlying mechanic ships first.

---

## 1. Complete NFT map

| Mechanic | Code reality | NFT today? | Verdict |
|---|---|---|---|
| Position ownership | `lock()` → engine position, wrapped 1:1 by NFT + EIP-1167 clone account | ✅ `NARAPositionNFTV4` | Covered — the NFT *is* the position |
| Locks | `lock/extend/unlock`, weight = amount × duration | ✅ same NFT (receipt by construction) | Covered |
| "Mining" | No separate mechanic; NARA emission drip earned by lock weight via `claimRewards` | ✅ implied by position NFT | Covered |
| Claims (NARA/ETH/bribe) | `claimRewards` (NARA+ETH), `claimTokenRewards` (ERC-20 bribes) | ✅ claim rights gated to NFT owner | Covered |
| Bonds | `NARABondDepositoryV4NFT.mintGenesisAndLockFor(...)` delivers discounted NARA as a genesis NFT | ✅ bond = NFT delivery | Covered |
| Genesis users | `GenesisMetadata{roundId,tierId,rewardMultiplierBps,eternal,rewardWeight}` + parallel pool | ✅ flag inside the same NFT | Covered |
| Eternal / long-term | `isEternal` → no normal unlock; only `burnEternalGenesis` after maturity | ✅ | Covered |
| High-value users | `lifetimeEthClaimed` → renderer Realized Tier 0–4 | ✅ realized delivered-reward tier | Covered |
| Staking | `NARAStakingPoolV4` holds a pool of position NFTs, mints `stNARA` ERC-20 | ⚠️ consumes NFTs, mints ERC-20 | Covered (no NFT needed) |
| Fractional position | `NARAFractionalPositionV4` splits one NFT into ERC-20 units | ⚠️ consumes one NFT, mints ERC-20 | Covered (no NFT needed) |
| Liquidity support | `NARALiquidityGrowthVault/Hook` exists; no NFT tied to LP | ❌ | Missing — decide if it should exist |
| Streaks | No streak logic in contracts; the abstract `Crown Trace` art label is not streak logic | ❌ | Not built — do not imply streak mechanics exist |
| Boosts | No boost mechanic | ❌ | Not built |
| Access gates | None | ❌ | Not built |
| Governance / reputation | None in code | ❌ | Not built |
| Early-supporter / "first miner" badge | None (genesis is the closest real thing) | ❌ | Not built |

---

## 2. Tier ladder (smallest → biggest)

🟢 = code-real today. 🟠 = achievable but **not built** — do not market as live.

| # | Tier | Entry (real) | NFT change | Trait | Transfer | Built |
|---|---|---|---|---|---|---|
| 0 | Observer | Connect wallet, no lock | No NFT | — | n/a | 🟢 (by absence) |
| 1 | Locked holder (base) | `mintAndLock` any amount | Position NFT, Realized Tier "New" | `Realized Tier: New`, `Position ID`, `Created Epoch` | Transferable | 🟢 |
| 2 | Activated | `lifetimeEthClaimed > 0` | Lit steel core, defined scar | `Realized Tier: Activated` | Transferable | 🟢 |
| 3 | Rewarded | ≥ 0.1 ETH claimed | Copper trace arc, history marks | `Realized Tier: Rewarded` | Transferable | 🟢 |
| 4 | One ETH Mark | ≥ 1 ETH claimed | Brass calibration ring | `Realized Tier: One ETH Mark` | Transferable | 🟢 |
| 5 | Apex | ≥ 10 ETH claimed | Burned-amber restrained halo | `Realized Tier: Apex` | Transferable | 🟢 |
| 6 | Bond buyer | Buy via `NARABondDepositoryV4NFT` | Genesis flag + reward weight | `Provenance: Genesis`, `Round`, `Tier` | Transferable | 🟢 |
| 7 | Genesis | Minted by allowlisted genesis minter | Genesis archive art | `Provenance: Genesis` | Transferable | 🟢 |
| 8 | Eternal / Founder grade | Genesis + `eternal=true` | Eternal ledger art, no normal unlock | `Eternal: true` | Transferable, non-exitable until maturity | 🟢 |
| — | Streak holder | needs streak mechanic | — | — | — | 🟠 not built |
| — | Liquidity supporter | needs LP→NFT link | — | — | — | 🟠 not built |

The "new / activated / rewarded / one-ETH / ten-ETH / apex" ladder already exists as the
Realized Tier system, keyed off `lifetimeEthClaimed` (a realized fact), not a vanity counter.

---

## 3. Per-class recommendations

**Lock NFT** — keep as-is. The position NFT *is* the lock receipt; do not double-mint. Transferable is
correct (transferring the NFT transfers the position and future rewards; blocked mid-unlock). Duration
drives weight, so it may drive art intensity — but never let duration alone confer a benefit/rarity
badge (pay-to-win optic).

**Bond NFT** — already correct: bonds deliver a genesis position NFT directly. One artifact, not two.
Early unlock: impossible for eternal; normal genesis unlocks like any position (burns NFT, records
`closedRewardOwnerOfPosition` for trailing bribes). "Collectible after redemption" is **not possible
today** (unlock burns the NFT) — would require a new soulbound "spent bond" stub on burn. Defer.

**Mining position NFT** — do not build. Mining is not a v4 mechanic; the position NFT +
Realized Tier already encodes delivered-reward history.

**History NFT** — do not build. History is captured by `lifetimeEthClaimed`/`lifetimeNaraClaimed` +
events for indexers. Redundant.

**Genesis / Eternal** — implemented and test-covered in the active v4 source,
but deferred from Position NFT Phase 2; an independent Phase-3 deployment,
binding, economic-policy, and security review is still pending. Two known
review points remain: the 5× reward multiplier cap
(`MAX_GENESIS_REWARD_MULTIPLIER_BPS = 50_000`) is large, so publish per-round
multipliers; and Eternal positions are permanent until maturity, so UI copy
must never imply guaranteed/forever yield (state the fact as “non-exitable
until maturity”).

---

## 4. Transferability rules

| Asset | Rule | Why |
|---|---|---|
| Position NFT (incl. genesis/eternal) | Transferable (blocked mid-unlock) | It is a bearer financial position |
| stNARA / fracNARA | ERC-20, freely transferable | Liquid wrappers |
| Any future achievement / reputation badge | Soulbound | Credentials must not be buyable |

Rule of thumb: **economic state = transferable; credential/identity = soulbound.** NARA currently has
zero soulbound assets, which is correct because it has zero pure-credential mechanics.

---

## 5. Utility rules

The single position NFT carries five legitimate reasons at once: **receipt** (the lock), **claim
right** (owner-gated), **economic state** (weight/delivered rewards), **proof/provenance** (genesis/eternal),
**status** (Realized Tier). That is why one collection suffices. Reject any proposed NFT that cannot name
one of: proof, access, receipt, status, history, economic state.

---

## 6. Visual trait rules

Enforced by the renderer: every visual element derives from protocol truth (mint-fixed seed →
scar/lattice/glyphs; realized `lifetimeEthClaimed` → tier structure; genesis/eternal flags → archive
modes). No cosmetic-only rarity. The compliance line is realized facts + provenance only, never
expected return. See `NARA_V4_NFT_POSITIONS.md` (On-chain metadata) and the renderer README.

---

## 7. Abuse & game-theory risks

| Risk | Level | Mitigation in code | Action |
|---|---|---|---|
| Pay-to-win (buy into high tier) | Low | Realized Tier keys off realized ETH claimed, not deposit | Keep tier = realized delivered rewards, never deposit size |
| Whale/insider genesis multiplier | Medium | 5× cap, mint-fixed, reviewed terms, sync-before-change | Publish per-round multipliers |
| Wash trading for status | Low | Realized Tier uses delivered ETH claims, not sale count; ERC-2981 is advisory and tier is not separately tradable | Do not describe the royalty as marketplace-enforced or as an anti-wash guarantee |
| Claim-fee rug optics | Low only after verified freeze | 10% bytecode cap, but Phase-2 policy is `0 BPS` for NARA/token claims, zero recipient, and one-way `freezeClaimFees` | Verify both zero values, zero recipient, and frozen state in the finalized manifest |
| "Rarity = value" securities framing | Medium | compliance rule in docs | Keep "realized facts, not projections" everywhere |
| Too many tiers / confusion | Low | one collection, one ladder | Don't add streak/LP tiers unless the mechanic ships first |

---

## 8. Contract structure recommendation

The current architecture is right — do not expand the NFT surface.

- One ERC-721 (`NARAPositionNFTV4`) for position + lock + bond + genesis + eternal. ✅
- No second ERC-721. Genesis is a flag, not a collection.
- No ERC-1155 badges now. Only introduce for a real credential mechanic (reputation/access), and then
  make them soulbound, metadata-only, zero economic weight, in a separate contract.
- Composability stays ERC-20 (stNARA, fracNARA) — NFTs are inputs, not outputs.

---

## 9. Build plan

**Phase 2 (approved policy, not yet deployed):** ship the single Position NFT and modular renderer
with exactly `1000 BPS` (10.00%) ERC-2981 royalties to the manifest-pinned production Treasury
address, then permanently freeze that receiver/rate. Set both wrapper claim fees to `0 BPS`, set the
recipient to zero, and permanently freeze them. The Admin Safe owner and Treasury destination are
different manifest fields. ERC-2981 is marketplace-advisory, and Treasury controls later royalty
use; royalties do not automatically reach lockers. Genesis distributor/minter bindings remain
unset until the separately reviewed Phase-3 release. (Renderer spec drift was reconciled
2026-06-29; the production policy was superseded on 2026-08-21.)

**V2 (only if the underlying mechanic ships first):**
- Streak mechanic in/around the engine → then a streak trait on the existing NFT (no new collection).
  Until then, drop "streak holder" from tier copy.
- Liquidity-supporter recognition → prefer a soulbound ERC-1155 credential tied to the Uni v4 hook,
  not a tradable NFT.

**Later / maybe-never:** "spent bond / redeemed position" collectible (requires not burning, or a
soulbound stub on burn) — low value, defer. Reputation/governance badges — only if governance launches.

**Never build:** separate lock-receipt NFT, separate mining NFT, separate bond-certificate NFT,
history NFT, duplicate genesis collection. Each duplicates one event across multiple tokens.

---

## 10. Findings summary

- **Covered:** position, lock, delivered-reward history, claims, bonds, genesis, eternal,
  high-value status, staking, fractional.
- **Missing (decide):** liquidity-supporter recognition.
- **Not built (do not market as live):** streaks, boosts, access gates, governance, reputation,
  "first miner" badge.
- **Unnecessary:** separate lock/mining/bond-cert/history NFTs, second genesis collection.
- **Dangerous if mishandled:** 5× Genesis multiplier (publish Phase-3 terms), any mismatch from the
  approved frozen 10% Treasury royalty or frozen zero claim fees, and rarity-as-value framing (keep
  realized-facts language).
- **Resolved this cycle:** documentation drift in `NARA_V4_NFT_POSITIONS.md` (claimed rarity-free /
  frozen metadata) now matches the realized-tier renderer.
