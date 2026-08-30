# NARA v4 NFT Positions — Canonical Spec

Last updated: 2026-08-30.
**This is the v4 canonical NFT spec.** The old `NFT_WRAPPER_BUILD_PLAN.md` lives only in
`archive/legacy-v3/docs/` and describes the **retired v3** `NaraLockNFT` + `NaraLockAccount`.
Do not apply v3 wrapper patterns to v4 — the architecture is different.

For the protocol-wide picture of what NFTs exist, what's missing, and what should never be built,
see `NARA_V4_NFT_PROTOCOL_ROLE_AUDIT.md`.

Phase-2 source contracts (exact deployment scope):
- `contracts/v4/NARAArtMetadataV1.sol`
- `contracts/v4/NARAArtSecurityPrintV1.sol`
- `contracts/v4/NARAArtCorePlateV1.sol`
- `contracts/v4/NARAArtGenesisPlateV1.sol`
- `contracts/v4/NARAPositionRendererV5.sol`
- `contracts/v4/NARAPositionAccountV4.sol`
- `contracts/v4/NARAPositionNFTV4.sol`

`NARAPositionDataLensV1`, the dashboard/router layer, bonds, and
`NARAGenesisRewardDistributorV4` are implemented future surfaces but are explicitly deferred to
Phase 3. They are not part of the Phase-2 deployment, manifest, Safe batch, or consumer handoff.

> **Current state:** The seven-contract Phase-2 baseline passed its recorded
> release review/test gates, was deployed on Base, source-verified, and finalized
> under the production Safe. This is not an overall independent protocol audit.
> Canonical evidence
> is `deployments/v4-position-nft-phase2-finalized-2026-08-21.json` and
> `deployments/v4-position-nft-phase2-source-verification-2026-08-21.json`.
> The finalized manifest remains `integrationReady: false`: the separately
> approved value-bearing smoke, 48-hour monitored hold, and immutable
> downstream handoff are not evidenced as complete. Consumers must remain
> disabled. This is technical live-testing state, not public product
> availability, legal approval, or a recommendation to transact.

---

## What it is

In v4, `NARAPositionNFTV4` (`"NARA Position"`, symbol `NARAPOS`) is an **optional ERC-721 creation
path** for new Engine positions. A lock created through the NFT owns its Engine position through a
restricted clone account, and transferring the NFT transfers control of that wrapped position and
its future claimable rewards. Direct `NARAEngine` positions remain valid raw positions and are not
retroactively wrapped.

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
   **reward weight** with the Genesis distributor (see below). This bytecode path is **not enabled in
   Phase 2**: the Genesis distributor and minter remain unset, with no `GenesisMinterSet` event. Its
   configuration belongs to the separately reviewed Phase-3 bond/Genesis release.

## Rewards — what an NFT position earns

The complete bytecode architecture supports **two independent pools**. Phase-2 positions use the
Engine pool; the Genesis pool remains unavailable until its separately verified Phase-3 binding:

| Pool | What | Claim |
|---|---|---|
| **Engine** (all lockers) | Active: NARA drip + ETH by lock **weight**. ERC-20 claim functions exist but notification is disabled for this deployment. | `claimRewards(tokenId, to)` → NARA + ETH; token-claim functions remain dormant |
| **Genesis** (future genesis NFTs only) | Phase-3 extra ETH + reward-token accounting by **reward weight**; unavailable while the distributor/minter are unset | `claimGenesisEth(tokenId, to)`, `claimGenesisToken(tokenId, to)` after the separately verified Phase-3 binding |

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
- The approved Phase-2 production policy is exactly `1000 BPS` (10.00%) to the manifest-pinned
  production Treasury address, followed by the one-way `freezeRoyalties()` call. The NFT is owned by
  the manifest-pinned production Admin Safe from construction; the owner Safe and Treasury receiver
  are separate manifest fields. The Safe also reasserts `0 BPS` NARA/token wrapper claim fees, sets
  the claim-fee recipient to zero, and permanently freezes those fees. Treasury controls later use
  of royalties; they do not automatically reach lockers. ERC-2981 remains marketplace-voluntary.
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

## Live data for apps and future projects (Phase 3)

`NARAPositionDataLensV1` is the implemented typed, stateless, admin-free live-data surface, but it is
not deployed or handed off in Phase 2. After a separately verified Phase-3 deployment it returns:

- actual ERC-721 owner, clone account, and engine-position custodian as separate fields;
- live and settled epochs plus pending/active/matured state based on the settled epoch;
- amount, weight, lifecycle epochs, engine claimables, and arbitrary token claimables;
- Genesis provenance, reward weight/share, Eternal state, and Genesis claimables;
- bounded batches of up to 100 token IDs.

After that Phase-3 manifest exists, apps should use marketplace metadata for presentation and the
data lens for current financial state. Until then, consumers must not invent a lens address.

## Who builds on top of these NFTs

- **Phase-3 bonds** (`NARABondDepositoryV4NFT`) can mint genesis NFTs as the delivery vehicle only
  after the separately verified Genesis/minter binding.
- **Composability** wraps them: `NARAStakingPoolV4` (stNARA) locks NARA under the hood and holds
  positions; `NARAFractionalPositionFactoryV4` fractionalizes a single position NFT.
- **Lens** (`NARADashboardLens`) reads broad dashboard state; `NARAPositionDataLensV1` provides the
  canonical typed live data for position NFTs and future integrations.

## Integration

- Production plan: `NARA_V4_NFT_PRODUCTION_PLAN.md`.
- Exact operator/evidence sequence:
  `releases/NARA-20260821-v4-position-nft-phase2.md`.
- Phase 2 deploys the four art modules, V5 renderer, account implementation, and NFT in the exact
  seven-contract nonce order. It does not deploy an allocation layer, bond/Genesis contracts, or a
  data lens.
- The final Admin Safe batch reasserts the manifest-pinned Treasury receiver and `1000 BPS`, resets
  both wrapper claim fees and their recipient to zero, then freezes royalties and claim fees in that
  exact five-call order.
- Minting is permissionless from the confirmed NFT deployment block. Pending/final verifiers must
  reconcile all `PositionMinted` events and `nextTokenId`; no operator may assume an empty mint window
  or reserve a manual token ID.
- Addresses and start blocks are recorded in the finalized, source-verified
  manifest. Generated bindings and consumer configuration remain disabled
  until the approved smoke, 48-hour observation hold, immutable protocol
  origin, and explicit cross-repository handoff exist. Swarm, baskets,
  analytics, frontends, and public documentation must fail closed during that
  quarantine.
- The engine is **not permit-aware**, but the NFT is: `mintAndLockWithPermit` does the NARA permit.
