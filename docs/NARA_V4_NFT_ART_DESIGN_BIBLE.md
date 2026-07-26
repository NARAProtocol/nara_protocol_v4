# NARA Position NFT Art Direction Bible v1

Last updated: 2026-07-04.
Status: **canonical art direction** for `contracts/v4/NARAPositionRendererV5.sol` and its modular
`NARAArt*V1` contracts. This is the source of truth; see Appendix A for implementation status.

**Hard engineering constraints (always apply, do not violate when implementing):**
- Fully on-chain SVG; **no uploaded/IPFS image**. Engine is immutable and at the EIP-170 size limit —
  all NFT art/logic lives in the renderer/wrapper, **never the engine**.
- **Cache-safe drivers only:** art may change with **realized delivered-reward tier (tx-driven)**,
  **claim/extension action counts (tx-driven)**, or
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

## 2.1 Perception constraints added 2026-07-04

The immutable renderer should be beautiful because it is lawful, not because it is loud.

- **One anchor, one void, one signature:** one central Core, one true quiet reserve, one Scar.
- **Contrast budget by scale:** fine detail stays low opacity; large forms carry the visual weight.
- **Color as event:** tier color is scarce and earned by realized state; the Scar red stays unique.
- **Lawful density:** complexity comes from deterministic security-print systems, not random noise.
- **Stratigraphy:** holder actions accrete as durable marks, not repaint. Claims grow as ordered
  phyllotaxis around the Core/Seal; extensions settle as downward ledger sediment.
- **Motion is breath:** animation must be slow, optional, and never required for the static artwork.
- **Thumbnail and long-look test:** the Core, Scar, and tier color must survive at 300px; full size
  should keep rewarding inspection without becoming visual stress.

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
Cues: pressure channels · cost trace lines · issuance axis · realized-state glow · archive
arcs · claim/extension history marks.

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
   · extraction pressure · incomplete potential. (T0 one clean missing segment → wider for Rewarded
   → calibrated for One ETH Mark → sculpted radiant for Apex → archive scar for Genesis.)
3. **The Pulse** — timing rings = time. Epoch rhythm · claim window · streak continuity · maturity ·
   heartbeat. Subtle, never noisy halos. T0 faint → T1 one active → T2 layered → T3 calibrated → T4
   ceremonial.
4. **The Lattice** — the position map. Place inside NARA · relation to the mining field · network
   territory · coordinate. Faint background map lines / radial zones / grid fragments / coordinate
   arcs. Visible, not loud.
5. **The Trace** — economic behavior: output · cost · time · realized reward history · signal flow.
   Thin lines / channels / small bars / pressure meters / calibrated output marks. Integrated into the
   machine, not normal chart design.
6. **The Seal** — rare-status stamp (protocol stamp, not a sticker): Genesis · Eternal · One ETH Mark ·
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
Technical, clean, readable. Good labels: `NARA`, `POSITION 000001`, `TOKEN 000001`, `STATE ACTIVATED`,
`TIER 02`, `FULLY ON CHAIN`, `RENDERER V5`, `GENESIS`, `ETERNAL`, `CLAIM WINDOW ACTIVE`.
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
- **Tier 1 — Activated / Active machine:** stronger Core · one visible Pulse · one active Trace
  channel · clear issuance axis · brighter center · small glyph cluster · readable state label. The
  machine woke up.
- **Tier 2 — Rewarded / Marked reactor:** dual-ring Core · oxidized copper Trace · more Pulse
  density · stronger Lattice · visible claim arc · multiple history marks · active inner chamber.
  Alive even when static.
- **Tier 3 — One ETH Mark / Recognized high-status instrument:** controlled brass calibration marks ·
  stronger Seal · refined symmetry · more precise Pulse · restrained Scar · higher glyph complexity
  · premium frame. Gold as authority, not paint — never a whole-yellow card.
- **Tier 4 — Apex / Ceremonial reactor relic:** multi-ring Core · radiant center · sculpted Scar ·
  full Lattice · complex glyph field · Apex Seal · controlled halo · strongest depth · rare border
  architecture. The visual maximum of standard NARA.
- **Genesis — Birth archive:** ledger grid · provenance frame · archive Seal · hash fragments · ivory
  lines · minimal glow · less reactor, more document artifact · calm authority. The founding record.
- **Eternal — Preserved permanent state:** timeless symmetry · Eternal Seal · stable Pulse · archive
  geometry · less noise · strong frame · high permanence. Cannot decay.

## 11. Variant system (replace random variants with NARA subsystems)

- **Archive Arc** — claim-history arc band around the Core.
- **Pressure Scar** — cost pressure → calibrated bars integrated into frame/Trace (not a
  normal chart).
- **Orbit Field** — position inside the wider NARA map → orbit paths, coordinate rings, network nodes.
- **Scar Wave** — contested issuance & production stress → distorted ring cuts, fracture arcs,
  controlled tension lines.
- **Ledger Grid** — Genesis/Eternal provenance → archive lines, block records, chain marks, seal
  geometry.
- **Crown Trace** — abstract crown-like ring segments around the Core. This is ornament/provenance
  notation only; it does not imply a streak mechanic.

## 12. Trait generation (from real NARA data)

Inputs: token id · position id · tier · state · claim count · extension count ·
genesis flag · eternal flag · mint block · epoch number · provenance marker.
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
- **Arc variant** → Archive Arc (claim-history arc band).
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

What `NARAPositionRendererV5` + `NARAArt*V1` do today (2026-07-04) vs this bible:

Action accretion is implemented: standard cards use claim phyllotaxis, extension sediment, and a
compact C/E action ledger; Genesis/Eternal plates use calmer archive accretion.

Renderer production hardening is implemented: SVGs use no remote font imports or external assets,
rare predicates have visible QA marks, and the preview script writes full-size, rare-showcase, and
thumbnail QA pages.

Implemented:
- ✅ **Core** (central reactor: disc, axis, restrained glow, calibration tick-ring at T3+),
  protected by a true quiet reserve.
- ✅ **Pulse** (slow center pulse), low-contrast security print, **Trace** (restrained signal
  lines, brass calibration ticks).
- ✅ **Scar** (standard missing-segment Scar plus archive Scar on Genesis/Eternal seals).
- ✅ **Seal** (Genesis/Eternal markers + archival ledger plate for Genesis).
- ✅ Layered plate, mineral palette, identity band, status marker, restrained animation,
  tx-driven tier (cache-safe).
- ✅ Registration marks, compact action counter, forced rare-hit previews, and 64/128/300px thumbnail
  review output.

Remaining optional polish (renderer-only build order; engine untouched; pass §17/§18 each step):
1. ❌ **Deterministic micro-notation** — no richer per-token glyph cluster beyond microprint and
   low-contrast security marks yet.
2. ❌ **Distinct module subsystems** — Archive Arc / Pressure Scar / Orbit Field / Signal Trace / Ledger
   Fragment / Crown Trace can be made even more visually distinct.
3. ❌ **Cartographic Lattice** — current grid is decorative, not a coordinate/position map tied to
   token/position id.
4. ⚠️ **Pulse/Trace not yet "timed structure"** — exist visually but not bound to epoch/claim/streak
   data.

Renderer size budget: V5 is split across modules; each module must remain under the 24,576-byte
deployed-code limit. Engine stays untouched.
