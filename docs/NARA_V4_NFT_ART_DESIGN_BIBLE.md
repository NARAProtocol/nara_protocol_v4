# NARA Position NFT Art Direction Bible v1

Last updated: 2026-06-29.
Status: **canonical art direction** for `contracts/v4/NARAPositionRendererV4.sol`. This is the source
of truth; the current renderer is a partial implementation (see Appendix A — Status & Gap).

**Hard engineering constraints (always apply, do not violate when implementing):**
- Fully on-chain SVG; **no uploaded/IPFS image**. Engine is immutable and at the EIP-170 size limit —
  all NFT art/logic lives in the renderer/wrapper, **never the engine**.
- **Cache-safe drivers only:** art may change with **realized earnings tier (tx-driven)** or
  **mint-fixed flags (Genesis/Eternal)** — never live per-epoch values. `MetadataUpdate` (ERC-4906)
  fires on claim/extend so marketplaces refresh.
- **Compliance:** art encodes **realized facts + provenance, never expected return** or speculative
  rarity-as-value. See `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md`.

---

## 1. Core creative thesis

NARA Position NFTs are not pictures. They are **live protocol relics**. Each NFT should look like a
sacred economic machine that proves a user's position inside the NARA system.

The art must communicate: Position · Issuance · Demand · Cost · Time · Scarcity · Provenance ·
Status · On-chain truth.

The viewer should not think "another NFT image." They should think: *"This looks like a machine
artifact from a real protocol."*

## 2. Primary design goal

Make NARA visually own one idea: **Protocol truth made visible.**

Every shape must come from NARA mechanics — no random decoration. If a ring exists, it must mean
something. If a scar exists, it must mean something. If a glow exists, it must mean something. If a
glyph exists, it must come from token data. This is the main rule that makes the collection different.

## 3. Visual identity in one sentence

**NARA art is a calm, sacred, economic reactor mapped onto an on-chain position system.**

## 4. What NARA must NOT look like

Avoid: generic cyberpunk · random abstract shapes · cheap neon overload · meme reward badges · cartoon
PFP energy · simple rarity color swaps · dashboard-placeholder bar charts · random zigzags · game-UI
clutter · brain-rot animation. NARA must feel controlled, precise, silent, and valuable.

## 5. The three combined themes

**Theme 1 — Sacred machine.** Ceremonial. Symmetry, seals, rings, axes, precise spacing. Designed by a
protocol civilization, not a social-media artist. Cues: central core · ritual geometry · quiet glow ·
institutional frame · seal marks · glyph language.

**Theme 2 — Economic reactor.** Show production cost, demand, mining pressure, issuance as energy.
Cues: pressure channels · cost trace lines · demand axis · issuance axis · productive glow · yield
arcs · claimed/unclaimed states.

**Theme 3 — Cartographic position map.** Every NFT is a coordinate in a larger NARA world. Cues:
lattice fields · position coordinates · token territory · network zones · ring maps · epoch bands ·
archive grids.

## 6. Permanent NARA modules (build every card from these 7)

1. **The Core** — main identity symbol on almost every standard token. Center node = value source ·
   vertical line = issuance · horizontal line = demand · ring = position state · inner chamber =
   latent potential. Reactor + compass + vault + protocol lock at once. Instantly recognizable, yet
   rewards study.
2. **The Scar** — NARA's most important unique mark: a clean cut / missing segment / fracture / notch
   in the ring system. Engineered, never accidental. Means scarcity · mining cost · contested issuance
   · extraction pressure · incomplete potential. (T0 one clean missing segment → wider for productive
   → gold-edged for One ETH Club → sculpted radiant for Apex → archive scar for Genesis.)
3. **The Pulse** — timing rings = time. Epoch rhythm · claim window · streak continuity · maturity ·
   heartbeat. Subtle, never noisy halos. T0 faint → T1 one active → T2 layered → T3 calibrated → T4
   ceremonial.
4. **The Lattice** — the position map. Place inside NARA · relation to the mining field · network
   territory · coordinate. Faint background map lines / radial zones / grid fragments / coordinate
   arcs. Visible, not loud.
5. **The Trace** — economic behavior: output · demand · cost · yield · productive pressure · flow.
   Thin lines / channels / small bars / pressure meters / calibrated output marks. Integrated into the
   machine, not normal chart design.
6. **The Seal** — rare-status stamp (protocol stamp, not a sticker): Genesis · Eternal · One ETH Club ·
   Apex · special provenance. Restrained gold / ivory / deep blue.
7. **The Glyphs** — deterministic micro-marks from token data: identity fingerprint · on-chain
   determinism · native NARA language · inspection reward. NOT letters — segmented notation (tiny cut
   marks, node triplets, mini arcs, vertical strokes, encoded angle clusters, fragmented ring marks).

## 7. Palette (artifact, anti-neon — color is earned by state)

NARA's signature is a **mineral / aged-instrument** palette, NOT generic Web3 blue-green-gold. Nearly
monochrome bone + graphite; one material accent appears per state. Peat amber is the brand signature.

| Role | Token | Hex |
|---|---|---|
| Background (NARA black) | `BG` | `#07090A` |
| Smoked graphite panel | `PLATE` | `#111417` |
| Warm etched line | `LINE` | `#26241F` |
| Bone ivory (lines + text) | `IVORY` | `#D8D1BD` |
| Ash / gunmetal (dormant, Tier 0) | `MUTED` | `#70757D` |
| Cold iron (Tier 1, faint) | `IRON` | `#5E7088` |
| Oxidized copper green (Tier 2) | `COPPER` | `#397C68` |
| Old brass (Tier 3) | `BRASS` | `#A88745` |
| Peat / burned amber (Tier 4 + brand) | `AMBER` | `#C2772E` |
| Aged paper ivory (Genesis) | `PAPER` | `#C7B98D` |
| **Blood oxide — the Scar (every card)** | `SCAR` | `#6E2924` |

Banned: bright cyberpunk blue as identity, neon green, shiny yellow gold, pure white, saturated glow,
RGB light-show logic. Material depth comes from smoked-glass gradients, a faint desaturated **grain**
overlay, bevel edges, and uneven line opacity — not bloom.

## 8. Typography

Hierarchy: NARA wordmark → position number → tier & state → token id → renderer/provenance metadata.
Technical, clean, readable. Good labels: `NARA`, `POSITION 000001`, `TOKEN 000001`, `STATE EARNING`,
`TIER 02`, `FULLY ON CHAIN`, `RENDERER V4`, `GENESIS`, `ETERNAL`, `CLAIM WINDOW ACTIVE`.
Avoid casual words: fresh · quiet · glow · fun · lucky · rare vibes. Sound like protocol metadata,
not social copy.

## 9. Card layout (one master layout)

- **Top status band:** state, tier, special flags. Small but readable.
- **Main field (sacred machine zone):** Core · Scar · Pulse · Lattice · Trace · Seal (if applicable).
- **Bottom identity band:** NARA wordmark · position number · token id · tier · renderer text ·
  on-chain statement.
- **Border system (not just decoration — encodes frame class/rarity/provenance):** outer dark frame →
  inner technical frame → micro glyph marks → rare seal marks → subtle glow only for higher tiers.

## 10. Tier art rules

- **Tier 0 — New / Dormant artifact:** single Core ring · faint center node · small Scar · minimal
  Pulse · very light Lattice · no major Trace · no Seal · low glow. Silent, not unfinished.
- **Tier 1 — Earning / Activated machine:** stronger Core · one visible Pulse · one active Trace
  channel · clear issuance axis · brighter center · small glyph cluster · readable state label. The
  machine woke up.
- **Tier 2 — Productive / Running reactor:** dual-ring Core · productive green Trace · more Pulse
  density · stronger Lattice · visible claim arc · multiple output channels · active inner chamber.
  Alive even when static.
- **Tier 3 — One ETH Club / Recognized high-status instrument:** controlled gold calibration marks ·
  stronger Seal · refined symmetry · more precise Pulse · gold-touched Scar · higher glyph complexity
  · premium frame. Gold as authority, not paint — never a whole-yellow card.
- **Tier 4 — Apex / Ceremonial reactor relic:** multi-ring Core · radiant center · sculpted Scar ·
  full Lattice · complex glyph field · Apex Seal · controlled halo · strongest depth · rare border
  architecture. The visual maximum of standard NARA.
- **Genesis — Birth archive:** ledger grid · provenance frame · archive Seal · hash fragments · ivory
  lines · minimal glow · less reactor, more document artifact · calm authority. The founding record.
- **Eternal — Preserved permanent state:** timeless symmetry · Eternal Seal · stable Pulse · archive
  geometry · less noise · strong frame · high permanence. Cannot decay.

## 11. Variant system (replace random variants with NARA subsystems)

- **Yield Arc** — claim window, earning curve, output flow → arc bands around the Core.
- **Pressure Bars** — demand & cost pressure → calibrated bars integrated into frame/Trace (not a
  normal chart).
- **Orbit Field** — position inside the wider NARA map → orbit paths, coordinate rings, network nodes.
- **Scar Wave** — contested issuance & production stress → distorted ring cuts, fracture arcs,
  controlled tension lines.
- **Ledger Grid** — Genesis/Eternal provenance → archive lines, block records, chain marks, seal
  geometry.
- **Streak Crown** — repeated participation → crown-like ring segments around the Core (abstract, not
  a literal crown).

## 12. Trait generation (from real NARA data)

Inputs: token id · position id · tier · state · productive status · claim status · streak length ·
genesis flag · eternal flag · mint block · epoch number · miner-history marker.
Generated visual traits: Core type · ring count · Scar type · Scar angle · Pulse density · Lattice
family · Trace system · Seal class · Glyph cluster · frame class · glow level · archive mark.
Rule: randomness only inside strict taste boundaries. Controlled determinism makes a collectible
system; bad randomness makes cheap art.

## 13. Rarity design (structural, not border-color)

Better rarity signals: more precise Core architecture · more complex Scar · stronger Seal · more glyph
density · more Pulse layers · more refined frame · rarer Lattice type · more provenance marks · more
controlled light · more symmetry. Tier 4 must look architecturally **more advanced** than Tier 0, not
just brighter.

## 14. Animation rules (optional; slow and serious)

Good: core breathing very slowly · pulse expanding faintly · orbit drifting slowly · trace line waking
up · apex seal shimmer · genesis scanline pass. Bad: fast spin · flashing neon · casino energy ·
constant movement · rainbow · meme bounce. Living machine, not slot machine.

## 15. SVG layer order (render in this order — creates depth)

1. background plate → 2. outer frame → 3. inner frame → 4. subtle texture → 5. lattice field →
6. core base → 7. scar cuts → 8. pulse rings → 9. trace channels → 10. seal module → 11. glyph layer →
12. bottom identity band → 13. typography → 14. optional glow overlay → 15. optional animation.

## 16. Current cards upgrade path

- **Circle cards** → keep circular identity, redesign as the NARA Core; add Scar, Pulse, Lattice,
  Trace, Glyphs, better frame, better typography.
- **Bar variant** → Pressure Bars (economic logic).
- **Arc variant** → Yield Arc (claim window + output).
- **Orbit variant** → Orbit Field (position mapping).
- **Zigzag variant** → remove or convert to Scar Wave (current pink zigzag is too generic).
- **Genesis card** → keep direction, make more archival: ledger marks, hash fragments, provenance
  seal, ivory archive frame, calmer blue.

## 17. Designer checklist

Looks unmistakably NARA · contains the Core · uses the Scar · shows time via Pulse · shows position
via Lattice · shows economics via Trace · Seal feels premium · Glyphs deterministic · rarity
structural · palette controlled · typography readable · works without animation · avoids brain-rot
noise · every major shape means something.

## 18. Developer checklist

No uploaded-image dependency · SVG fully on-chain · traits deterministic · same token → same base
identity · state changes update meaningful layers · tier changes structurally visible · Genesis &
Eternal visually distinct · text readable at marketplace preview size · gas acceptable · metadata
matches visual traits · no random unused decoration · modules compose/toggle cleanly.

## 19. Collection promise

NARA does not sell "art." NARA sells **proof of position.** The art is the interface, the NFT is the
artifact, the protocol is the source of truth.

## 20. Final art direction statement

NARA Position NFTs must look like calm, sacred economic machines generated from on-chain state. Every
card should combine a central **Core**, visible **Scar**, epoch **Pulse**, position **Lattice**,
economic **Trace**, rare **Seal**, and deterministic **Glyphs**. The result should feel precise,
collectible, and impossible to fake as real NARA provenance.

---

## Appendix A — Current implementation status & gap

What `NARAPositionRendererV4` does today (2026-06-29) vs this bible:

Implemented:
- ✅ **Core** (central reactor: disc + concentric rings + issuance/demand axis), tier-escalating
  structure (ring/orbit count, glow, calibration tick-ring at T3+, apex halo), bold strokes.
- ✅ **Pulse** (concentric rings), basic **Lattice** (background grid), **Trace** (productive green
  arc, gold calibration ticks).
- ✅ **Seal** (Genesis/Eternal markers + archival ledger plate for Genesis).
- ✅ Layered plate, controlled palette (deep navy / electric cobalt `#3A6BFF` / ivory / green / gold),
  identity band, status marker, restrained animation, tx-driven tier (cache-safe).

Gap to this bible (renderer-only build order; engine untouched; pass §17/§18 each step):
1. ❌ **The Scar** — the signature subtraction element is absent. **Highest priority.** (4 Scar types,
   deterministic Scar angle; gold-edged at T3, sculpted at T4, archive scar at Genesis.)
2. ❌ **Deterministic Glyphs** — no notation language / per-token glyph cluster + micro-border
   fragments yet.
3. ❌ **Distinct module subsystems** — Yield Arc / Pressure Bars / Orbit Field / Scar Wave / Ledger
   Grid / Streak Crown are currently labels + orbit tilt, not visually distinct readouts.
4. ❌ **Cartographic Lattice** — current grid is decorative, not a coordinate/position map tied to
   token/position id.
5. ⚠️ **Pulse/Trace not yet "timed structure"** — exist visually but not bound to epoch/claim/streak
   data.

Renderer size budget: currently ~19 KB of the 24,576-byte limit (engine stays untouched).
