# NARA v4 NFT Positions — Canonical Spec

Last updated: 2026-06-07.
**This is the v4 canonical NFT spec.** The old `NFT_WRAPPER_BUILD_PLAN.md` lives only in
`archive/legacy-v3/docs/` and describes the **retired v3** `NaraLockNFT` + `NaraLockAccount`.
Do not apply v3 wrapper patterns to v4 — the architecture is different.

Source contracts:
- `contracts/v4/NARAPositionNFTV4.sol`
- `contracts/v4/NARAPositionAccountV4.sol`
- `contracts/v4/NARAPositionRendererV4.sol`
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
| **Engine** (all lockers) | NARA drip + ETH + any ERC-20 reward stream, by lock **weight** | `claimRewards(tokenId, to)` → NARA + ETH; `claimTokenRewards(tokenId, token, to)` → ERC-20 |
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

- `extendLock(tokenId, additionalEpochs)` — extends maturity; sweeps any stray NARA/ETH to owner.
- `unlock(tokenId)` / `unlockTo(tokenId, to)` — `msg.value == engine.unlockFeeWei()`. Claims genesis
  rewards first, unlocks the engine position, sweeps principal+rewards to `to`, **burns the NFT**, and
  records `closedRewardOwnerOfPosition` so the ex-owner can still pull trailing ERC-20 rewards via
  `claimClosedTokenRewards(positionId, token, to)`.
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

`NARAPositionRendererV4` renders fully on-chain base64 SVG + JSON. It assigns one of eight
deterministic, equal-status artwork compositions from the token ID. Art never encodes rarity,
position size, rewards, expected return, or a preferred asset choice.

Marketplace metadata is deliberately stable. It includes artwork identity, position ID, origin,
created epoch, and fixed Genesis provenance. Changing financial values such as status, amount,
weight, unlock epoch, reward share, and claimables are excluded so marketplace caches cannot
silently present stale financial data. ERC-4906 remains available for any future stable-metadata
change that is explicitly introduced and audited.

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
