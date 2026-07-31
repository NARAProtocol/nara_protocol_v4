# NARA v4 NFT Positions — Canonical Spec

Last updated: 2026-06-29.
**This is the v4 canonical NFT spec.** The old `NFT_WRAPPER_BUILD_PLAN.md` lives only in
`archive/legacy-v3/docs/` and describes the **retired v3** `NaraLockNFT` + `NaraLockAccount`.
Do not apply v3 wrapper patterns to v4 — the architecture is different.

For the protocol-wide picture of what NFTs exist, what's missing, and what should never be built,
see `NARA_V4_NFT_PROTOCOL_ROLE_AUDIT.md`.

Source contracts:
- `contracts/v4/NARAPositionNFTV4.sol`
- `contracts/v4/NARAPositionAccountV4.sol`
- `contracts/v4/NARAPositionRendererV5.sol` (+ modular `NARAArt*V1` contracts)
- `contracts/v4/router/NARAPositionDataLensV1.sol`
- `contracts/v4/NARAGenesisRewardDistributorV4.sol` (parallel reward pool, separate doc territory)

---

## What it is

In v4, **a lock position is an ERC-721 NFT.** There is no separate "wrapper" step — locking
NARA mints `NARAPositionNFTV4` (`"NARA Position"`, symbol `NARAPOS`). The NFT is the bearer
asset; transferring it transfers the whole position and all its future rewards.

## Architecture (NFT → clone account → engine)

```
NARAPositionNFTV4 (one ERC-721 collection)
   │  owns tokenId N
   ▼
NARAPositionAccountV4 (one EIP-1167 clone per tokenId)   ← accountOf[tokenId]
   │  owns the actual engine position
   ▼
NARAEngine position (positionId)                          ← positionIdOf[tokenId]
```

- Each NFT gets its **own clone account** (`Clones.clone(accountImplementation)`), initialized with
  `(engine, nara, factory=NFT)`. The clone holds the engine position; only the NFT contract (the
  "factory") can drive it (`onlyFactory`).
- Mappings on the NFT: `accountOf[tokenId]`, `tokenOfAccount[account]`, `positionIdOf[tokenId]`,
  `tokenOfPosition[positionId]`. Token IDs start at **1**.
- The account is deliberately thin: `lock / extend / claimRewards / claimTokenRewards / unlock /
  sweepNara / sweepEth / sweepToken`, all `onlyFactory`. It `forceApprove`s the engine only for the
  exact lock amount, then resets to 0.

## Minting (two paths)

1. **Manual lock** — `mintAndLock(amount, durationEpochs, minWeight)` /
   `mintAndLockFor(recipient, …)` / `mintAndLockWithPermit(… v,r,s)` (ERC-2612 permit, best-effort
   try/catch). Pulls NARA from `msg.sender` into the clone, locks it, mints the NFT.
   **`msg.value` must equal `engine.lockFeeWei()` exactly** or it reverts.
2. **Genesis bond** — `mintGenesisAndLockFor(…, roundId, tierId, rewardMultiplierBps, eternal)`.
   `onlyGenesisMinter` (allowlisted via `setGenesisMinter`). This is the path the **bond depository**
   uses to deliver discounted NARA as a vesting NFT. Records `GenesisMetadata` and registers a
   **reward weight** with the Genesis distributor (see below).

## Rewards — what an NFT position earns

A position earns from **two independent pools**:

| Pool | What | Claim |
|---|---|---|
| **Engine** (all lockers) | Active: NARA drip + ETH by lock **weight**. ERC-20 claim functions exist but notification is disabled for this deployment. | `claimRewards(tokenId, to)` → NARA + ETH; token-claim functions remain dormant |
| **Genesis** (genesis NFTs only) | Extra ETH + reward-token (USDC) by **reward weight**, parallel pool | `claimGenesisEth(tokenId, to)`, `claimGenesisToken(tokenId, to)` |

- Engine claims flow NFT → `account.claimRewards(to)` → `engine.claimRewards(positionId, to)` → assets
  go **directly to `to`**, never held by the NFT. `to` cannot be the clone account (guarded).
- `claimRewards` returns `(naraAmount, ethAmount)`; both can be zero (`NothingToClaim` is tolerated
  in the burn path).
- **Genesis reward weight** = `position.amount * rewardMultiplierBps / 10_000`. Multiplier is capped
  at `MAX_GENESIS_REWARD_MULTIPLIER_BPS = 50_000` (5×). The NFT keeps `totalGenesisRewardWeight` and
  notifies the distributor on every weight change (mint/eternal/burn) so the parallel pool stays fair
  (sync-before-change anti-gaming).

## Lifecycle functions

- `extendLock(tokenId, additionalEpochs)` — extends maturity; forwards rewards settled by the engine
  extension path to the owner, records lifetime delivered rewards, and applies the wrapper NARA claim
  fee when that fee path is active. Explicit `sweepAccount*` calls recover unrelated stray account balances.
- `unlock(tokenId)` / `unlockTo(tokenId, to)` — `msg.value == engine.unlockFeeWei()`. Claims genesis
  rewards first, unlocks the engine position, sweeps principal+rewards to `to`, **burns the NFT**, and
  records `closedRewardOwnerOfPosition`; the trailing ERC-20 claim surface
  exists but remains dormant while token notification is disabled.
- A transfer is **blocked while an unlock is in progress** (`unlocking[tokenId]`).

## Eternal Genesis (fixed at mint)

- Eternal status and the Genesis reward multiplier are fixed in the reviewed Genesis mint terms.
  Holders cannot raise reward weight after mint or front-run reward notifications with a conversion.
- **Eternal positions cannot be normally unlocked.**
- `burnEternalGenesis(tokenId)` — the only exit for an eternal position: requires maturity
  (`currentEpoch >= unlockEpoch`), pays the unlock fee, claims everything, unlocks, burns, removes the
  genesis reward weight.

## Owner / admin surface (capped, per safety standards)

- `Ownable2Step`. `setGenesisMinter`, `setGenesisRewardDistributor` (one-time set, can't be changed),
  `setDefaultRoyalty` / `deleteDefaultRoyalty` (ERC-2981, capped at `MAX_ROYALTY_BPS = 1_000` = 10%),
  one-way `freezeRoyalties`, and `sweepNative` (only stray ETH sent to the NFT contract itself, not
  position funds).
- Production deployment defaults to zero royalties and freezes the configuration before ownership
  handoff. A non-zero royalty remains optional and ERC-2981 royalties are not marketplace-enforced.
- No mint authority over arbitrary positions, no ability to move user funds out of clone accounts
  except the owner-driven `sweepAccount*` which always sends to a validated `to`.

## On-chain metadata

`NARAPositionRendererV5` renders fully on-chain base64 SVG + JSON through modular art contracts
(`NARAArtMetadataV1`, `NARAArtCorePlateV1`, `NARAArtGenesisPlateV1`, and
`NARAArtSecurityPrintV1`). The *why* of the art is `NARA_V4_NFT_ART_DESIGN_BIBLE.md`; the
*how* is `NARA_V4_NFT_RENDERER_README.md`. Two kinds of inputs drive a token, by design:

- **Mint-fixed identity (cache-safe):** `keccak256(tokenId, positionId, createdEpoch)` is the art
  seed. It picks one of **six deterministic module compositions** and drives the Scar angle/width,
  Lattice node field, and Glyph fingerprint. These never change after mint — same token always
  renders the same base identity.
- **Realized tier (tx-driven, cache-safe):** a **Realized Tier** (`New -> Activated -> Rewarded
  -> One ETH Mark -> Apex`) derived from the position's **realized** `lifetimeEthClaimed`. It escalates
  the art *structurally* (security-print layers, calibration, scar sculpting), not just by color.
  Claim count and extension count are also realized token-specific facts; they drive claim
  phyllotaxis, extension sediment, and the compact C/E action ledger. Because these inputs only move
  on token-specific transactions, they are safe to cache.
- **Genesis / Eternal flags (mint-fixed):** switch the card into archive modes (provenance plate,
  ledger, seal).

`MetadataUpdate` (ERC-4906) fires on `claimRewards` and `extendLock` so marketplaces refresh the
cached image when the realized tier or lock changes.

**Deliberately NOT used in the art:** current epoch, live active/claimable state, unlock epoch, reward
share, and live claimables. Those change *without* a token transaction, so putting them in cached
marketplace metadata would let the image silently go stale. They belong to the live UI via
`NARAPositionDataLensV1`, never the cached artwork.

**Compliance line:** the art encodes **realized historical facts + provenance only — never expected
return, projected yield, or rarity-implies-value framing.** The Realized Tier is based on ETH already
delivered through the wrapper, a fact, not a forecast. See `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md`.

Canonical trait list (kept in sync in `NARA_V4_NFT_RENDERER_README.md`): `Position ID`, `Realized Tier`,
`Core`, `Module`, `Provenance`, `Storage` (Fully On Chain), `Renderer` (V5 Modular), `Created Epoch`,
`Claim Count`, `Extension Count`, plus
Genesis traits (`Round`, `Tier`, `Multiplier`, `Minted At`, `Eternal`) on genesis tokens.

> Spec note (2026-06-29): an earlier version of this section described "eight equal-status artworks"
> that "never encode rarity" and called all metadata "deliberately stable." That predates the current
> modular renderer's Realized Tier system. The current rule is narrower and is the one above:
> **art evolves only on mint-fixed or realized-fact (tx-driven) inputs — never on live per-epoch
> state — and never encodes expected return.** Structural tier escalation from realized delivered rewards is
> intentional and cache-safe; it is not cosmetic rarity.

`contractURI()` provides fully on-chain collection image, banner, featured image, and collection
description. If the immutable renderer reverts or returns an empty URI, the NFT returns minimal
fully on-chain fallback token and collection metadata instead of becoming unrenderable.

## Live data for apps and future projects

`NARAPositionDataLensV1` is the typed, stateless, admin-free live-data surface. It returns:

- actual ERC-721 owner, clone account, and engine-position custodian as separate fields;
- live and settled epochs plus pending/active/matured state based on the settled epoch;
- amount, weight, lifecycle epochs, engine claimables, and arbitrary token claimables;
- Genesis provenance, reward weight/share, Eternal state, and Genesis claimables;
- bounded batches of up to 100 token IDs.

Apps should use marketplace metadata for presentation and the data lens for current financial state.

## Who builds on top of these NFTs

- **Bonds** (`NARABondDepositoryV4NFT`) mint genesis NFTs as the delivery vehicle.
- **Composability** wraps them: `NARAStakingPoolV4` (stNARA) locks NARA under the hood and holds
  positions; `NARAFractionalPositionFactoryV4` fractionalizes a single position NFT.
- **Lens** (`NARADashboardLens`) reads broad dashboard state; `NARAPositionDataLensV1` provides the
  canonical typed live data for position NFTs and future integrations.

## Integration

- ABIs + deployed addresses: `apps/nara-lockboard/src/shared/nara.ts` (canonical registry).
- Deploy: the allocation layer step in `NARA_V4_LAUNCH_RUNBOOK.md` (`deploy:v4:allocations`) deploys
  `NARAPositionAccountV4` (impl) → `NARAPositionNFTV4` → `NARAGenesisRewardDistributorV4`, then wires
  `setGenesisRewardDistributor` and `setGenesisMinter`.
- The allocation deployment adds the immutable renderer before the NFT and freezes royalties by
  default. The router/lens deployment adds `NARAPositionDataLensV1`.
- The engine is **not permit-aware**, but the NFT is: `mintAndLockWithPermit` does the NARA permit.
