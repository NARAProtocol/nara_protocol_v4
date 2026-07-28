# NARA Position Cards Collector Gap Report

Date: 2026-07-04
Scope: NARA v4 Position Card renderer before freeze
Inputs: local V5 renderer/code audit, delegated market/utility/narrative/technical/red-team agents, and web-source checks.

Resolution note, 2026-07-04: the production pass addressed the pre-freeze renderer blockers called
out below: remote SVG font fetches were removed, rare visual predicates were made visible, compact
action counters and registration marks were restored, the old crown label was renamed `Crown Trace`,
preview tooling now cleans stale output, and `thumbnail-qa.html` is generated as a release gate. The
remaining items are collector narrative, indexing, listing hygiene, lending dossiers, remix/IP policy,
and future visual enrichment.

## 1. Verdict

NARA is not yet on a pure collected-art path; it is on a strong instrument-with-art path that can become collectible if the renderer freeze removes the remaining trust breaks and makes the card's visual biography easy to read. The strongest advantage is real: a fully on-chain position card whose art evolves only from realized facts, while live market-facing values stay in lens/UI surfaces. The biggest threat is also real: Uniswap v3 and veNFTs prove that an ERC-721 wrapping a useful position is usually held for control, not collected for culture. NARA crosses into the top collector lane only if it ships as a credible on-chain artwork first and a position wrapper second in public language.

## 2. Evidence Base

Market examples:
- Art Blocks documents the on-chain generative-art model: artist algorithms stored permanently on-chain, deterministic output from a mint hash, and Art Blocks' later on-chain storage/generator path. Sources: [Art Blocks protocol overview](https://github.com/ArtBlocks/artblocks-docs), [Art Blocks on-chain storage](https://docs.artblocks.io/protocol/on-chain-storage/), [Art Blocks true on-chain preservation](https://www.artblocks.io/articles/true-on-chain-preservation-a-four-year-journey).
- Fidenza is a 999-piece Art Blocks collection; Tyler Hobbs describes long-form generative art as permanent, immutable, verifiable scripts with a limited number of iterations. Sources: [Fidenza collection](https://www.artblocks.io/collection/fidenza-by-tyler-hobbs), [Tyler Hobbs on long-form generative art](https://www.tylerxhobbs.com/words/the-rise-of-long-form-generative-art), [Tyler Hobbs on Fidenza palettes](https://www.tylerxhobbs.com/words/fidenza).
- Autoglyphs owns the early fully on-chain generative-art lane; Larva Labs describes the generator algorithm embedded on-chain and executed at mint. Source: [Larva Labs Autoglyphs](https://www.larvalabs.com/autoglyphs).
- Nouns owns ritual/cadence and public-domain remix: one Noun every 24 hours, forever; Nouns Center describes the protocol as smart contracts that generate and auction a Noun daily, with public-domain art. Sources: [Nouns DAO](https://nouns.wtf/), [Nouns Center protocol](https://nouns.center/dev/nouns-protocol).
- Opepen demonstrates collector consensus and public art mechanics: creators submit, collectors vote, and permanent-collection spots are filled over time. Sources: [Opepen](https://opepen.art/), [Jack Butcher Opepen Edition](https://www.jack.art/opepen-edition).
- Ringers shows that a single legible anomaly can become a grail; Ringers #879 sold at Sotheby's for $6.2M. Source: [Sotheby's Ringers #879](https://www.sothebys.com/en/articles/dmitri-cherniak-ringers-879-goose-lays-6-2m-golden-egg-at-generative-art-auction).
- Uniswap v3 is the key negative case. Official support states v3/v4 liquidity ownership is represented by NFTs; the owner can remove liquidity, claim fees, or add liquidity, and transfer transfers control. Source: [Uniswap support](https://support.uniswap.org/hc/en-us/articles/20980786685069-Why-is-liquidity-position-ownership-represented-by-tokens-or-NFTs).
- Velodrome veNFTs are also control instruments: its spec describes ERC-721 voting-escrow NFTs with balances representing voting weight. Source: [Velodrome specification](https://github.com/velodrome-finance/contracts/blob/main/SPECIFICATION.md).
- Blend demonstrates NFT collateral mechanics: peer-to-peer lending with arbitrary NFT collateral, no oracle dependency, no expiry, and off-chain offers. Source: [Paradigm Blend](https://www.paradigm.xyz/2023/05/blend).
- ERC-4906 is marketplace table stakes for dynamic metadata, not unique differentiation. Sources: [EIP-4906](https://eips.ethereum.org/EIPS/eip-4906), [OpenSea metadata standards](https://docs.opensea.io/docs/metadata-standards).

Local code evidence:
- V5 composes metadata, core art, Genesis art, and collection art in [NARAPositionRendererV5.sol](../contracts/v4/NARAPositionRendererV5.sol).
- The renderer derives tier, seed, module, claim count, extension count, Genesis flags, and minted provenance in [NARAPositionRendererV5.sol](../contracts/v4/NARAPositionRendererV5.sol).
- Core art implements the scar, golden sigil, claim phyllotaxis, extension sediment, action ledger, and double-strike wordmark in [NARAArtCorePlateV1.sol](../contracts/v4/NARAArtCorePlateV1.sol).
- Metadata names tier, core, module, provenance, renderer, plate-spec rares, incision register, claim count, extension count, and Genesis attributes in [NARAArtMetadataV1.sol](../contracts/v4/NARAArtMetadataV1.sol).
- Security-print modules and microborder live in [NARAArtSecurityPrintV1.sol](../contracts/v4/NARAArtSecurityPrintV1.sol).
- Live position data is intentionally lens territory, not cached marketplace art, via [NARAPositionDataLensV1.sol](../contracts/v4/router/NARAPositionDataLensV1.sol).

## 3. Gap Table

Sorted with pre-freeze irreversible items first.

| Rank | Gap | Evidence | Impact | Cost | Deadline | Instruction |
|---:|---|---|---:|---|---|---|
| 1 | Resolved: SVG had remote font imports | Before the production pass, Core and Genesis SVG defs fetched remote font CSS. Hard constraint says no external URLs/fonts/deps. | High | Renderer change | Pre-freeze irreversible | Complete: SVG defs now keep font-family fallbacks only and fetch no fonts. |
| 2 | Rare traits are not fully canonical across Standard and Genesis | Standard Golden Sigil is visible; Genesis/Eternal can have rare metadata predicates but no matching gold seal variant. Double Strike on Genesis is subtler than Standard. | High | Renderer change | Pre-freeze irreversible | Either render the same rare signals on Genesis plates or gate `Plate Spec` metadata to only where the visual exists. |
| 3 | 300px survival is not proven as a release gate | Red-team found dark mineral palette and small text may collapse in marketplace grids/light UIs; code uses dark background and small microtext. | High | Renderer + QA | Pre-freeze irreversible | Generate 64/128/300px contact sheets on white/gray/dark backgrounds. If weak, increase outer keyline, NARA wordmark contrast, core disc contrast, and scar thickness. |
| 4 | External dependency claim and docs conflict | Renderer README claims no off-chain dependency, but SVG font imports exist. | High | Renderer + docs | Pre-freeze irreversible | Fix renderer first; then update README to explicitly say no remote assets are used. |
| 5 | Module traits are named but not always legible | Metadata names six modules; code overlays for some modules are faint/tiny, and design bible notes visual distinctness gaps. | Medium-high | Renderer change | Pre-freeze irreversible | Give each module one 300px-visible silhouette mark or add a tiny `MODULE <name>` field. Avoid increasing color saturation. |
| 6 | Action history exists but is too small | Claim/extend counts are metadata attributes and tiny action-ledger text; phyllotaxis/sediment marks are full-size inspection signals, not grid signals. | Medium-high | Renderer change | Pre-freeze irreversible | Add compact larger `C# / E#` counter near the identity band while keeping the existing full ledger. |
| 7 | Resolved: old crown label could imply a nonexistent streak mechanic | Module naming existed, but protocol docs warn not to imply streak logic. | Medium | Metadata/docs or renderer | Pre-freeze if metadata frozen | Complete: renamed to `Crown Trace` and documented as abstract ornament only. |
| 8 | Registration marks documented but disabled | Security-print code returns empty registration marks; docs still mention them. | Medium | Renderer or docs | Pre-freeze if visual intended | Restore one minimal registration mark or remove "registration marks" from docs. |
| 9 | Void incision is an absence, not a visible grail | `seed % 1000 == 123` removes scar; metadata says `Void`, but absence is hard to notice. | Medium | Renderer change | Pre-freeze irreversible | Render a thin "void outline" or named negative-space mark so the rare reads visually. |
| 10 | Public narrative is protocol-insider heavy | Market examples show top collections have one-sentence cultural shorthand; NARA currently needs long explanation. | High | Docs/off-chain | Post-launch fixable but should begin now | Publish one renderer essay: "the card is the position's biography." |
| 11 | No canonical collector artifact yet | Fidenza/Autoglyphs/Nouns have algorithm/protocol pages and cultural artifacts; NARA has internal docs but no collector-facing museum/spec. | High | Docs/off-chain | Post-launch fixable | Publish `Living Note Renderer Spec`, `Scar Taxonomy`, and `Genesis Plate Registry`. |
| 12 | Live position data is not packaged for bidders/lenders | Lens exposes state, but marketplaces typically consume metadata/traits. | Very high for bid depth | Off-chain + optional periphery | Post-launch fixable | Build a position quote packet/indexer with block timestamp, owner, maturity, claim state, and Genesis fields. |
| 13 | Claim-state market hygiene missing | Buyers can distrust stale listings unless claim state is obvious outside cached metadata. | Very high for bid depth | Off-chain + optional periphery | Post-launch fixable | Build "claim/refresh/list" helper, stale-listing warnings, and block-tagged listing snapshots. |
| 14 | Lending/escrow readiness package missing | Blend-style lending accepts arbitrary NFT collateral, but lenders need rules and custody clarity. | High | Off-chain + optional escrow | Post-launch fixable | Publish collateral dossier and optionally build wrapper-aware escrow/claim custody adapter. |
| 15 | Open remix/IP policy unclear | Nouns/Blitmap/Opepen show cultural spread from open remix surfaces; NARA has on-chain art but no clear reuse policy. | Medium | Docs/legal | Post-launch fixable | Decide and publish art/IP/remix policy. |
| 16 | Docs drift around V4/V5 and rarity | Several docs still mention Renderer V4/equal-art assumptions while active stack is V5. | Medium | Docs-only | Pre-launch | Replace stale Renderer V4 references and explain V5 rare/evolution system. |
| 17 | Preview/mock rare tooling drift | Mock script reportedly still brute-forces Golden Sigil at 1/10k while contract uses 1/100k. | Low-medium | Script/docs | Pre-launch | Align all preview/mock scripts with `seed % 100000 == 7777`. |

## 4. Top 5 Moves

1. **Remove external SVG dependencies now.**
   Completed on 2026-07-04. `NARAArtCorePlateV1._defs()` and `NARAArtGenesisPlateV1._defs()` now keep generic font-family fallbacks only and fetch no fonts from the SVG.

2. **Make every named rare visually true.**
   Implement one of two policies: either render Golden Sigil/Double Strike/Void on both Standard and Genesis plates, or only emit `Plate Spec`/`Incision Register` traits when the visual mark exists for that plate type. The collector rule: if metadata says it, the card must show it.

3. **Add a 300px release test and amplify only the invariant marks.**
   Create a script that exports the contact sheet at 64/128/300px on white, gray, and dark backgrounds. Pass condition: NARA wordmark, core disc, scar, tier/state, and Genesis/Eternal plate type survive in three seconds. If not, increase keyline/wordmark/scar/core contrast without adding neon or hype effects.

4. **Publish the collector-facing renderer spec before launch.**
   Artifact: `Living Note Renderer Spec`. It should explain: realized-fact-only art inputs, rarity predicates, module names, scar taxonomy, Genesis plate meaning, what live data is intentionally excluded, and how to verify tokenSVG/tokenJSON from chain. This is docs/off-chain, high impact, low cost.

5. **Build bid-depth infrastructure around lens data.**
   Artifact: `NARAPositionQuotePacket` API/indexer. For each token, show owner/custodian, maturity state, claim state, Genesis fields, latest metadata update block, and stale-listing warning. Do not push live values into cached art. This protects marketplace trust without violating the renderer thesis.

## 5. Conflicts

- **Louder rares vs instrument dignity.**
  Collector/market logic wants rare marks to read instantly and screenshot well. Red-team warns that loudness can break the banknote/security-print thesis. Human resolution: decide how far Golden Sigil/Double Strike can go before they stop feeling like print errors and start feeling like marketing effects.

- **Art-first narrative vs instrument-first reality.**
  Market archaeology says collected projects need a cultural sentence. Red-team says the actual audience will initially scan facts like maturity, ownership, and claim state. Human resolution: public homepage can lead with "proof of position," while collector docs lead with "the card is the biography."

- **Dynamic evolution vs canonical meme image.**
  Technical differentiation likes evolving realized-fact art. Red-team says evolving images reduce memability. Human resolution: freeze the invariant identity: NARA wordmark + scar + core disc + plate frame must never become secondary to changing marks.

- **Trait-bid marketplaces vs changing state.**
  Marketplaces like stable trait filters; NARA's Realized Tier and action counts evolve. Human resolution: marketplace traits should emphasize mint-fixed traits and provenance; native UI/indexer should handle realized-state filtering.

## 6. Considered And Rejected

- Showing projected or performance-style values in art/metadata: rejected; violates legal/neutral-action constraints and the realized-fact-only thesis.
- Driving cached NFT art from live claimables/current epoch/unlock countdown: rejected; live state belongs in `NARAPositionDataLensV1` and UI, not marketplace metadata.
- Uploading token art to IPFS/CDN for prettier thumbnails: rejected; violates fully on-chain art claim.
- Auto-claim-on-transfer or listing-lock tricks as a casual sniping fix: rejected; core behavior/security/legal implications require explicit separate review.
- Neon/glow/saturation escalation for thumbnail attention: rejected; violates mineral/banknote design constraints.

## 7. Honest Ceiling

If NARA ships with unresolved external dependencies, docs drift, and 300px legibility unproven, its realistic ceiling is the upper tier of useful DeFi position NFTs, not the top 10% of collectible NFT culture: roughly **60th-70th percentile** among serious Web3 NFT instruments, much lower among art-first collections.

If the pre-freeze renderer gaps are fixed and the post-launch artifacts are published, NARA can plausibly reach the **80th-85th percentile**: not Autoglyphs/Fidenza/Nouns cultural gravity, but a distinctive, serious, fully on-chain position-art collection with collector pull beyond utility.

The single factor that caps it most is not art quality. It is **audience framing**: if buyers experience the card primarily as a transferable position wrapper, the market will price it like a position wrapper. If they experience it as a permanent on-chain biography of a position, the collection has a real shot at becoming collected rather than merely held.
