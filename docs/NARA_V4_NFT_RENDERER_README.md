# NARA Position NFT — Renderer V1 (implementation README)

Last updated: 2026-06-29.
Contract: `contracts/v4/NARAPositionRendererV4.sol` (fully on-chain SVG, no uploaded image).
Art direction: `NARA_V4_NFT_ART_DESIGN_BIBLE.md` (the *why*). This file is the *how*.

Render path: `NARAPositionNFTV4.tokenURI(id)` → `renderer.tokenURI(nft, id)` → builds JSON +
base64 SVG in Solidity, on demand, every read. `MetadataUpdate` (ERC-4906) fires on claim/extend so
marketplaces refresh.

---

## Determinism model (read this first)

Two kinds of inputs, by design:

- **Identity (mint-fixed → cache-safe):** `keccak256(tokenId, positionId, createdEpoch)` = the **art
  seed**. Drives Scar angle/width, Glyph notation, Lattice node field, and orbit tilt. Never changes
  after mint → same token always renders the same base identity.
- **Evolution (realized facts):** **Yield Tier** from `lifetimeEthClaimed` (tx-driven), plus
  **Genesis/Eternal** flags (mint-fixed). Tier escalates structure; flags switch to archive modes.

**Deliberately NOT used in the art:** current epoch, productive state, claim state, streak. Those are
live values that change *without* a token transaction — putting them in cached marketplace metadata
would make every image stale/misleading. They belong to the live UI card via
`NARAPositionDataLensV1`, not the immutable artwork. (This is also the compliance line: art shows
realized facts + provenance, never expected return.)

---

## The 7 modules → where each is rendered

| Module | Function(s) | Driven by | Behavior |
|---|---|---|---|
| **Core** | `_coreField` (glow, `_rings`, axis, disc) | tier | Central reactor; ring count 1→4, glow + center pulse escalate by tier. The universal NARA identity. |
| **Scar** | `_scar` | art seed (angle/width) + tier | Engineered radial notch subtracting a clean slice of the ring band. 12 deterministic angles; width 12→26 by tier; gold-edged at T3+, gold cap (sculpted) at T4. Signature element. |
| **Pulse** | `_rings` + core center `<animate>` | tier | Concentric timing rings; faint at T0 → layered/ceremonial at T4. Slow breathing at T2+. |
| **Lattice** | `_lattice` | art seed | Faint coordinate rings (r=300/332) + 5 deterministic position nodes → each token reads as a coordinate in the NARA map. |
| **Trace** | `_energy` (+ `_axis` calibration) | tier | Emerald output arc at Productive; gold calibration tick-ring at One ETH Club+; apex halo at T4. |
| **Seal** | `_seal` + `_genesisField` | Genesis/Eternal flags | Provenance stamp (top-right) + archival plate for Genesis/Eternal. Institutional gold/ivory. |
| **Glyphs** | `_glyphs` | art seed | Right-margin column of 10 deterministic micro-marks (tick / stroke / node / frame) = protocol notation + identity fingerprint. |

### Module subsystems (`_module`, deterministic from `tokenId`)
The `Module` trait + one distinct accent, all in the same grammar:
- **Yield Arc** — output arc band over the core
- **Demand Bars** (Pressure Bars) — calibrated demand/cost ticks beneath the core (not a chart)
- **Position Orbit** (Orbit Field) — coordinate nodes on the position ring
- **Volatility Signal** (Scar Wave) — a faint secondary fracture tension line

---

## Tier evolution (structural, not just color)

`_tierIndex(lifetimeEthClaimed)`:

| Tier | Threshold | Name / Core class | Structure |
|---|---|---|---|
| 0 | 0 | New / Dormant | 1 ring, warm ash `#6F6B63`, small scar, quiet |
| 1 | >0 | Earning / Active | lit smoked steel `#8C8A82` (no blue), defined scar |
| 2 | ≥0.1 ETH | Productive / Productive | 2 rings + orbit, oxidized copper `#397C68` trace arc |
| 3 | ≥1 ETH | One ETH Club / Calibrated | old brass `#A88745` calibration tick-ring, brass scar edge |
| 4 | ≥10 ETH | Apex / Radiant | 4 rings + 3 orbits, burned amber `#C2772E` halo, amber-spine scar |

The blood-oxide Scar (`#6E2924`) and peat-amber brand cut appear on **every** card.

Rarity is **structural** (ring/orbit count, calibration, scar sculpting, glyph density) — never just a
border color.

## Archive modes
- **Genesis** (`_genesisField`): replaces the reactor with a provenance plate — ledger rows with
  deterministic hash-fragment line lengths (from the art seed), a layered protocol seal, ivory lines,
  `GENESIS ARCHIVE` wordmark.
- **Eternal**: same plate, gold seal + lemniscate node + `ETERNAL LEDGER`, calmer/preserved.

---

## Layout (1000×1000, render order = depth)
plate → vignette → grid → **Lattice** → Core (glow → orbits → rings → **Scar** → axis → Trace →
**Module** → disc) → **Glyphs** → status marker (top-left) → Seal (top-right) → identity band (bottom:
`NARA` wordmark, `POSITION/TOKEN/STATE`, `FULLY ON CHAIN / RENDERER V4 / provenance`).

## Palette (artifact / anti-neon — color earned by state)
Mineral, aged-instrument palette in the library: BG `#07090A` · smoked graphite `#111417` · warm line
`#26241F` · bone ivory `#D8D1BD` · ash `#70757D` (dormant) · cold iron `#5E7088` (T1) · oxidized copper
`#397C68` (T2) · old brass `#A88745` (T3) · **peat amber `#C2772E`** (T4 + brand cut) · aged paper
`#C7B98D` (Genesis) · **blood oxide `#6E2924` — the Scar, on every card**. Faint grain + smoked-glass
depth; no neon. (Earlier blue/green/gold palette retired 2026-06-29 as too generic-Web3.)

## Animation (restrained, optional)
Core breathing (T2+), center pulse (T3+), slow orbit rotation (T3+), apex halo shimmer (T4). Static
composition is complete without motion (marketplaces that rasterize still get the full design).

---

## Metadata (`tokenURI` JSON)
Name: `NARA Position #000001 · <Tier>` / `NARA Genesis Archive #…` / `NARA Eternal Ledger #…`.
Traits: `Position ID`, `Yield Tier`, `Core`, `Module`, `Provenance`, `Storage` (Fully On Chain),
`Renderer` (V4), `Created Epoch`, + Genesis traits (Round/Tier/Multiplier/Minted At/Eternal).
Background color `070A12`. Image is an inline base64 SVG. No off-chain dependency.

---

## Preview & tests
- **Preview gallery:** `NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/previewPositionArt.ts`
  → writes SVGs + `index.html` to the scratchpad (every tier + Genesis/Eternal + module variants).
- **Tests:** `npx hardhat test test/NARAPositionNFTV4.test.ts` — covers deterministic rendering
  (same token → identical SVG; different token → distinct SVG), module/Scar/Lattice/Glyph presence,
  tier evolution, Genesis/Eternal, ERC-4906, metadata stability vs live data, and lifetime tracking.

## Constraints (do not break)
- Engine is **untouched** and at the EIP-170 limit — all art lives in the renderer/wrapper.
- Renderer deployed size ~**23.0 KB** of the 24,576-byte limit (~1.6 KB headroom). Keep new geometry
  economical; prefer reusing helpers/opacity over adding strings.
- Drivers must stay **mint-fixed or tx-driven** (cache-safe). Never wire live epoch/claim/streak into
  the art.

## Status vs the bible
Implemented: Core, Scar, Pulse, Lattice (cartographic), Trace, Seal, Glyphs, module subsystems, tier
evolution, Genesis/Eternal, deterministic identity. Future polish (see bible Appendix A): make module
subsystems even more visually distinct, richer Genesis hash-fragment field, Pulse/Trace bound to
streak/claim once a cache-safe surface exists (e.g., snapshot-on-claim).
