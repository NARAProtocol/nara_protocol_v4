# NARA v4 — Position Stats, Claim Fees & Evolving NFT Art

Last updated: 2026-06-29.
Status: **built + tested in the working tree, not committed, not deployed.** All of it is
**fresh-deploy-only** — these are immutable v4 contracts and nothing v4 is live yet.
Test state when written: full Hardhat suite **402 passing, 0 failing**.

Audience: any cold AI (Claude/GPT/Gemini/etc.) or contributor picking up the NFT/lens layer.
Read `V4_CONTRACT_INDEX.md` → this file for the position-stats + claim-fee detail.

---

## 0. The hard constraint that shaped every decision

`NARAEngine.sol` is at the **EIP-170 limit**: 24,522 bytes deployed, **54 bytes of headroom**
under the 24,576 ceiling (production settings: `viaIR`, `optimizer runs=1`, `bytecodeHash=none`).
It cannot absorb new logic. The engine is also immutable (no proxy, no admin upgrade).

**Consequence:** every feature below lives **off the engine** — in the NFT wrapper, the renderer, or
new/extended lens contracts. The engine bytecode was **not touched** this session (verified
byte-identical at 24,522 before and after). Anything that "should" be in the engine but isn't is
there for this reason, not by oversight.

A short-lived experiment that added an engine-level `tokenClaimFeeBps` was **reverted** because it
pushed the engine 293 bytes over the limit (the +347-byte change blew the 54-byte headroom). That is
why the bribe-token fee ended up in the wrapper instead.

---

## 1. Wrapper claim fees — `NARAPositionNFTV4.sol`

Two optional, owner-set, capped fees on rewards **claimed through the NFT wrapper**:

| Field | Taxes | Default | Cap | Notes |
|---|---|---|---|---|
| `naraClaimFeeBps` | NARA emission claims | `0` | `MAX_CLAIM_FEE_BPS = 1000` (10%) | Skim on `claimRewards`; ETH passes through untouched |
| `tokenClaimFeeBps` | bribed/external ERC-20 claims | `0` | 1000 (10%) | Skim on `claimTokenRewards` + `claimClosedTokenRewards` |

- `claimFeeRecipient` (owner-set) is the destination. **Fees are inert until it is set** — both rates
  default to 0 and the code no-ops when the recipient is `address(0)`, so shipping changes nothing.
- `setClaimFees(naraBps, tokenBps)`, `setClaimFeeRecipient(addr)`, `freezeClaimFees()` — all `onlyOwner`
  (Ownable2Step). `freezeClaimFees()` is a one-way permanent lock (parity with the royalty freeze).
- Mechanism: when a fee is active, the wrapper claims to **itself** (`account.claimRewards(address(this))`),
  skims the fee to the recipient, forwards the remainder to `to`. A `receive()` was added so the
  wrapper can take the ETH leg of `claimRewards` and forward it. **There is no balance-based
  accounting** anywhere in the wrapper (every ETH fee path uses strict `msg.value == expected`), so
  the new `receive()` cannot perturb lock/unlock fee logic.

### Why NARA-claim fee defaults to 0 and should probably stay 0
NARA emissions are the protocol's own incentive. Taxing them lowers headline yield, double-dips the
lock fee, and is dominated by simply tuning emission size. The hook exists only to preserve the
**option** (it can't be added to an immutable contract later). The **token (bribe) fee** is the
economically clean one — it taxes external value the protocol provides a rail for.

### Caveat a cold AI must know: wrapper-only capture
These fees only hit claims routed through the NFT wrapper. A position locked **directly** via
`engine.lock()` and claimed via `engine.claimRewards()` (EOA-owned, no NFT) pays **nothing**. This is
inherent to keeping the engine untouched. Funnel users through NFT positions in the UI if capture
matters; it is not enforceable on-chain.

---

## 2. Lifetime earnings + ERC-4906 — `NARAPositionNFTV4.sol`

Per-position realized earnings, accumulated in the wrapper (engine doesn't track per-position):

- `lifetimeNaraClaimed[tokenId]`, `lifetimeEthClaimed[tokenId]` — incremented in `claimRewards` by the
  **net** amount delivered to the holder (NARA net of any wrapper fee; ETH net of the engine's ETH
  claim fee). Public getters. These are realized **facts**, and only change on a token-specific claim
  tx → safe to surface in cached NFT metadata.
- `MetadataUpdate(tokenId)` (ERC-4906) is emitted on `claimRewards` and `extendLock`. **Not** on
  unlock — `_unlockTo` burns the NFT (`_burn` already emits the delist Transfer). The contract already
  declared `IERC4906`; it just wasn't firing the event before.

---

## 3. Realized Tier — delivered-rewards ladder

Tier is derived purely from `lifetimeEthClaimed` (delivered ETH already received through the wrapper).
Defined in the modular renderer and surfaced as the `Realized Tier` NFT trait.

| Tier | Threshold (lifetime ETH delivered) | Name | Art color |
|---|---|---|---|
| 0 | 0 | `New` | `#8f9099` muted grey (no frame, no glow) |
| 1 | > 0 | `Activated` | lit smoked steel |
| 2 | ≥ 0.1 ETH | `Rewarded` | oxidized copper security-print layer |
| 3 | ≥ 1 ETH | `One ETH Mark` | old brass calibration marks |
| 4 | ≥ 10 ETH | `Apex` | `#ffd24a` radiant gold (max glow) |

Tier moves only on token-specific reward delivery txs → cache-safe, and `MetadataUpdate` forces
marketplace refresh on each claim or extension.

---

## 4. Evolving on-chain art — `NARAPositionRendererV5.sol`

> Canonical art direction lives in **`NARA_V4_NFT_ART_DESIGN_BIBLE.md`** (the 7-module sacred-machine
> system + tier logic + status/gap). The summary below is the current implementation.


The SVG image now reflects status (previously identity-only). All visual drivers are **tx-driven
(tier via claim) or mint-fixed (Genesis/Eternal)** — never per-epoch/live values — so cached
marketplace images never go stale. This respects the renderer's standing rule: live values that
change without a token-specific tx stay in the lens, not in metadata.

- **Tier frame**: inner frame tinted by tier color; `New` adds nothing (stays quiet); thickness/glow
  escalate (glow filter `#ng` engages at tier ≥ 2, thicker stroke at tier ≥ 3).
- **Status strip** (top): tier name + glowing tier dot (left); `GENESIS` / `ETERNAL` provenance flags
  (right, tier-colored).
- Brand frame (Base Blue `#0000FF`) is preserved as the outer frame; tier color is the inner accent.

---

## 5. DataLens enrichment — `router/NARAPositionDataLensV1.sol`

`PositionData` (the live per-position struct) gained these fields (read live; UI surface, not metadata):

- `weightShareWad` — position weight ÷ live `activeTotalWeight` (1e18 = 100%)
- `ageEpochs`, `epochsToUnlock`, `secondsToUnlock` (uses engine `EPOCH_LENGTH()`)
- `lifetimeNaraEarned`, `lifetimeEthEarned` (from the wrapper getters above)
- `realizedNaraReturnBps` — `lifetimeNaraEarned × 10000 / principal`, to date. **Unit-consistent
  (NARA vs NARA), historical fact, not a projection.** There is deliberately **no** single
  ETH-denominated "total return" because that needs a NARA/ETH price oracle (not in the stack).

New engine reads added to the lens interface: `activeTotalWeight()`, `EPOCH_LENGTH()`.

---

## 6. Protocol stats lens — `router/NARAProtocolStatsLensV1.sol` (NEW contract)

One stateless, admin-free call — `getProtocolStats()` — returning protocol-wide headline numbers for
homepages, dashboards, and data aggregators. **The key gap it closes:** all-time ETH distributed to
lockers existed on the engine (`totalEthRewardsReceived/Claimed`) but **no lens surfaced it.**

Returns (all cumulative on-chain facts): `ethDistributedToLockersAllTime`, `ethClaimedByLockersAllTime`,
`ethToTreasuryAllTime`, `naraEmittedAllTime`, `naraClaimedAllTime`, `pendingEthNextEpoch`,
`totalLocked`, `activeTotalWeight`, `totalPositionsCreated` (= `nextPositionId − 1`),
`circulatingSupply`, `emissionReserveAvailable`, `rewardReserveAvailable`, `currentEpochEmission`,
`emissionRunwayEpochs` (divide-by-zero-safe), epochs/clock, and `treasury`.

**Deploy:** new contract, constructor takes the engine address only. **Wired into
`scripts/deployRouterLens.ts`** (deploys alongside `NARADashboardLens` / `NARAPositionDataLensV1`,
auto-verifies on mainnet, recorded in `deployments/router-lens-<chainId>.json` as
`NARAProtocolStatsLensV1`). Pairs with mock `MockStatsEngineV1` for tests.

---

## 7. Compliance stance baked into the bytecode

The NFT belongs to the holder, but the renderer/lens **language is the project's permanent on-chain
speech**. So: **realized facts only, never forward-looking promises.** No `APY`, `guaranteed`,
`best`, `safest`, projected-return, or ranking-of-expected-return wording anywhere in metadata/art.
"Realized return to date", "lifetime ETH earned", tier names = facts the contract can stand behind
forever. This is why the lens exposes `realizedNaraReturnBps` (historical) and not a projected rate.

---

## 8. Still open (intentionally off-chain or needs new infra)

- **Multi-asset lifetime earnings** (per bribe token) — not accumulated; would need per-token maps.
  UI can read live `claimableTokenReward` / `claimableTokenRewards` per token via the DataLens/engine.
- **Single ETH-denominated total return** — needs a NARA/ETH price oracle (absent in the stack).
- **Rank / percentile ("Top 1%")** — requires a global sort → indexer/subgraph + UI, not on-chain
  (unbounded gas). The DataLens + ProtocolStatsLens give the UI everything needed to compute it.

---

## 9. Files touched this session

- `contracts/v4/NARAPositionNFTV4.sol` — claim fees, lifetime tracking, `receive()`, ERC-4906 emits.
- `contracts/v4/NARAPositionRendererV5.sol` — modular renderer coordinator.
- `contracts/v4/NARAArtMetadataV1.sol` — safe trait vocabulary and JSON attributes.
- `contracts/v4/NARAArtCorePlateV1.sol` / `NARAArtGenesisPlateV1.sol` / `NARAArtSecurityPrintV1.sol` — SVG plates and security-printing modules.
- `contracts/v4/router/NARAPositionDataLensV1.sol` — enriched `PositionData`.
- `contracts/v4/router/NARADashboardLens.sol` — `FeeConfig` now includes the wrapper claim fees + recipient.
- `contracts/v4/router/NARAProtocolStatsLensV1.sol` — **new** protocol headline-stats lens.
- `contracts/v4/mocks/MockNARAEngineV4.sol`, `MockNFTForRouter.sol`, `MockStatsEngineV1.sol` (new) — test mocks.
- Tests: `NARAPositionNFTV4.test.ts`, `NARAPositionDataLensV1.test.ts`, `NARADashboardLens.test.ts`,
  `NARAProtocolStatsLensV1.test.ts` (new), `NARAEngine.v4.test.ts` (engine fee experiment reverted).

Engine (`NARAEngine.sol`) was **not** modified. Deployed-size check after all changes:
engine 24,522 (54 headroom), wrapper 20,744, renderer 14,231, all lenses < 8k — all deployable.
