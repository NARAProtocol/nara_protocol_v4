# NARA Position NFT — Renderer V5 (implementation README)

Last updated: 2026-07-04.
Contract: `contracts/v4/NARAPositionRendererV5.sol` (fully on-chain SVG, no uploaded image).
Art modules: `NARAArtMetadataV1`, `NARAArtCorePlateV1`, `NARAArtGenesisPlateV1`, and `NARAArtSecurityPrintV1`.
Art direction: `NARA_V4_NFT_ART_DESIGN_BIBLE.md` (the *why*). This file is the *how*.

Render path: `NARAPositionNFTV4.tokenURI(id)` → `renderer.tokenURI(nft, id)` → builds JSON +
base64 SVG in Solidity, on demand, every read. `MetadataUpdate` (ERC-4906) fires on claim/extend so
marketplaces refresh.

---

## Determinism model (read this first)

Two kinds of inputs, by design:

- **Identity (mint-fixed → cache-safe):** `keccak256(tokenId, positionId, createdEpoch)` = the **art
  seed**. Drives Scar angle/width, security-print rosettes, and module variant detail. Never changes
  after mint → same token always renders the same base identity.
- **Evolution (realized facts):** **Realized Tier** from `lifetimeEthClaimed` (tx-driven), plus
  claim count, extension count, and **Genesis/Eternal** flags. Tier escalates structure; flags switch
  to archive modes. Claim and extension counts drive action accretion: claim phyllotaxis nodes,
  extension sediment, and an exact on-card action ledger.

**Deliberately NOT used in the art:** current epoch, live active state, claim state, streak. Those are
live values that change *without* a token transaction — putting them in cached marketplace metadata
would make every image stale/misleading. They belong to the live UI card via
`NARAPositionDataLensV1`, not the immutable artwork. (This is also the compliance line: art shows
realized facts + provenance, never expected return.)

---

## Perception Rules Implemented

The V5 split follows the 2026-07-04 perception pass:

- **One anchor, one void, one signature:** the central Core is the anchor, `_quietReserve()` is a true
  empty plate field, and the blood-oxide Scar remains the only violent mark.
- **Contrast budget by scale:** large forms may carry high contrast; rosettes, microprint, history
  marks, module overlays, and registration marks are low opacity.
- **Color as event:** tier color is scarce and earned by realized state. The bottom accent now uses
  the current tier color instead of a permanent amber flourish.
- **Lawful density:** security print is generated from a few deterministic rosette/axis/module
  systems, not unrelated random marks.
- **Stratigraphy and growth vector:** claims accrete outward around the Core/Seal, extensions settle
  downward as sediment, and the exact action ledger changes on every holder action.
- **Motion is breath:** the center pulse is 18 seconds and only appears on higher realized tiers.
  Static SVGs remain complete.

## Rendered Modules

| Module | Contract/function(s) | Driven by | Behavior |
|---|---|---|---|
| **Core** | `NARAArtCorePlateV1._coreField` | tier | Central seal, disc, axis, restrained glow, and slow pulse at higher tiers. |
| **Scar** | `NARAArtCorePlateV1._scar` | art seed + tier | Engineered radial notch; the collection signature. |
| **Security print** | `NARAArtSecurityPrintV1.securityLayer` | seed + tier | Microborder, lawful rosettes, and registration marks with low fine-detail contrast. |
| **Quiet reserve** | `NARAArtCorePlateV1._quietReserve` | fixed layout | Empty plate field that gives the eye a resting point. |
| **Action accretion** | `NARAArtCorePlateV1._historyMarks` + `_actionLedger` | claim/extend counts | Claim phyllotaxis, extension sediment, and exact C/E ledger; bounded density, every action remains visible in text. |
| **Genesis plate** | `NARAArtGenesisPlateV1.svg` | Genesis/Eternal flags + claim/extend counts | Archive ledger/seal layout with calm archive accretion for provenance tokens. |

### Module subsystems (`moduleOverlay`, deterministic from `tokenId`)
The `Module` trait + one distinct accent, all in the same grammar:
- **Archive Arc** - arc band over the core
- **Pressure Scar** - calibrated pressure ticks beneath the core
- **Orbit Field** - coordinate nodes on the position ring
- **Ledger Fragment** - archive line fragments near the identity band
- **Crown Trace** - subdued dash crown around the core
- **Signal Trace** - faint secondary signal lines

---

## Tier evolution (structural, not just color)

`_tierIndex(lifetimeEthClaimed)`:

| Tier | Threshold | Name / Core class | Structure |
|---|---|---|---|
| 0 | 0 | New / Dormant | 1 ring, warm ash `#6F6B63`, small scar, quiet |
| 1 | >0 | Activated / Active | lit smoked steel `#8C8A82` (no blue), defined scar |
| 2 | ≥0.1 ETH | Rewarded / Marked | oxidized copper `#397C68` security-print layer |
| 3 | ≥1 ETH | One ETH Mark / Calibrated | old brass `#A88745` calibration tick-ring, slow center pulse |
| 4 | ≥10 ETH | Apex / Radiant | burned amber `#C2772E` restrained halo, denser security print |

The blood-oxide Scar (`#6E2924`) appears on **every** card as the only violent mark.

Rarity is **structural** (calibration, security-print density, history marks, scar width) — never just a
border color.

## Archive modes
- **Genesis** (`_genesisField`): replaces the reactor with a provenance plate — ledger rows with
  deterministic hash-fragment line lengths (from the art seed), a layered protocol seal, ivory lines,
  `GENESIS ARCHIVE` wordmark.
- **Eternal**: same plate, gold seal + lemniscate node + `ETERNAL LEDGER`, calmer/preserved.

---

## Layout (1000x1000, render order = depth)
plate -> partial low-contrast grid -> vignette -> security print -> Core (glow -> **Scar** -> axis ->
**Module** -> disc) -> quiet reserve -> action accretion -> status marker (top-left) -> identity band
(bottom: `NARA` wordmark, `POSITION/TOKEN/STATE`, `FULLY ON CHAIN / RENDERER V5 / provenance`) ->
compact C/E action ledger above the band.

## Palette (artifact / anti-neon — color earned by state)
Mineral, aged-instrument palette in the library: BG `#07090A` · smoked graphite `#111417` · warm line
`#26241F` · bone ivory `#D8D1BD` · ash `#70757D` (dormant) · cold iron `#5E7088` (T1) · oxidized copper
`#397C68` (T2) · old brass `#A88745` (T3) · **peat amber `#C2772E`** (T4 + brand cut) · aged paper
`#C7B98D` (Genesis) · **blood oxide `#6E2924` — the Scar, on every card**. Faint grain + smoked-glass
depth; no neon. (Earlier blue/green/gold palette retired 2026-06-29 as too generic-Web3.)

## Animation (restrained, optional)
Center pulse at T3+ only, with an 18-second period. Static composition is complete without motion
(marketplaces that rasterize still get the full design).

---

## Metadata (`tokenURI` JSON)
Name: `NARA Position #000001 · <Tier>` / `NARA Genesis Archive #…` / `NARA Eternal Ledger #…`.
Traits: `Position ID`, `Realized Tier`, `Core`, `Module`, `Provenance`, `Storage` (Fully On Chain),
`Renderer` (V5 Modular), `Created Epoch`, `Claim Count`, `Extension Count`, + Genesis traits (Round/Tier/Multiplier/Minted At/Eternal).
Background color `070A12`. Image is an inline base64 SVG. No uploaded image, IPFS asset,
remote font, or external URL is required.

---

## Preview & tests
- **Preview gallery:** `NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/previewPositionArt.ts`
  → writes SVGs + `index.html` to the scratchpad (every tier + Genesis/Eternal + module variants).
- **Rare-hit showcase:** the same script writes `rare-showcase.html` with forced Double Strike and
  Golden Sigil predicates for visual QA. Real minted tokens only receive those marks from their
  deterministic seed.
- **Thumbnail QA:** the same script writes `thumbnail-qa.html`, a 64/128/300px contact sheet on
  light, neutral, and dark surfaces. This is the pre-freeze marketplace legibility gate.
- **Tests:** `npx hardhat test test/NARAPositionNFTV4.test.ts` - covers deterministic rendering
  (same token -> identical SVG; different token -> distinct SVG), module/Scar/security-print presence,
  tier evolution, Genesis/Eternal, action accretion past the old six-event ceiling, ERC-4906, metadata
  stability vs live data, and lifetime tracking.

## Constraints (do not break)
- Engine is **untouched** and at the EIP-170 limit — all art lives in the renderer/wrapper.
- V5 splits art across several deployed modules, each with its own EIP-170 budget. Keep each module
  under 24,576 deployed bytes and keep `tokenURI()` affordable for marketplace `eth_call`.
- Drivers must stay **mint-fixed or tx-driven** (cache-safe). Never wire live epoch/claim/streak into
  the art.

## Status vs the bible
Implemented: Core, Scar, slow Pulse, security print, registration marks, quiet reserve, module
subsystems, visible rare predicates, tier evolution, Genesis/Eternal, deterministic identity, and
claim/extension action accretion. Future polish (see bible Appendix A): make module subsystems even
more visually distinct and enrich the Genesis hash-fragment field without adding live/cache-unsafe
drivers.
