# NARA Landing Page & DEX Architecture

Production landing page and DEX swap meta-aggregator built with React 18, Vite, Tailwind CSS, `@kyberswap/widgets`, and `@web3-onboard`.

---

## 🚨 Permanent Rules & Brand Standards (MANDATORY FOR ALL AGENTS)

### 1. Zero Functional Duplication
- **The Header is an architectural framework + primary wayfinding rail:**
  - Left: Official NARA emblem + `NARA PROTOCOL` title (always navigates back to Home `/`).
  - Right: Step navigation `SWAP / COMMIT / GRID / VAULT` (wayfinding only — plain links, never transaction CTAs), then `CHART` (DexScreener), `EXPLORER` (BaseScan), `VISION` (Architecture modal), and `CONNECT` / Connected wallet account pill.
- **Never add transaction action buttons to the Header that duplicate page CTAs:**
  - Do **NOT** add `BUY`, `APPROVE`, `COMMIT & JOIN`, `HARVEST`, or other functional/transaction action buttons to the Header.
  - The step links (`SWAP / COMMIT / GRID / VAULT`) are route navigation mirroring `StepProgressTracker` and `TacticalDock` — they perform no wallet action and trigger no transaction.
  - On the Landing page, the hero buttons (`JOIN THE GRID` / `ENTER APP`) serve as the primary entry point to the DEX.
  - On the DEX page, the swap widget is already on the screen; the Header `SWAP` link is wayfinding, not a swap action.
  - Header remains clean, minimal, and non-repetitive across all views.

### 2. Official Brand Logo Standards (NO PLACEHOLDER LOGOS EVER)
- **The canonical brand emblem consists strictly of:**
  1. Dual concentric radar rings.
  2. 15 precision notches representing the 15-minute epoch dial.
  3. The sovereign monolithic architectural **N**.
  4. Solid `#000000` black background for all listings, avatars, cards, and wallet modals.
- **Never substitute the official logo with generic letters, simplified "N" SVGs, or ad-hoc shapes.**
- **Authoritative Assets in `public/` and `src/lib/content.ts`:**
  - `NARA_MASTER_LOGO_SVG` (exported in `src/lib/content.ts` for inline SVG usage, modals, and Web3-Onboard).
  - `BRAND_ASSETS` (exported in `src/lib/content.ts`).
  - `public/nara-logo-white.png` (1024×1024 solid black master).
  - `public/nara-logo.svg` (canonical vector master).
  - `public/nara-logo-transparent.png` (alpha=0, web headers and overlays only).
  - `public/nara_token_512.png`, `public/nara_token_256.png`, `public/nara_token_200.png`, `public/nara_token_128.png`.

### 3. Pleasant Transaction Ergonomics & Symmetrical Centering Mandate
- **Single Unified Chassis**: Never fragment the swap flow into stacked floating boxes. All micro-telemetry and inputs live in `.nara-dex-chassis`.
- **Token Freedom**: Support the entire Base token space. Never place arbitrary 2-3 token preset buttons.
- **Color Comfort**: Obsidian slate (`#080C16`) substrate, neutral hairlines, dark slate wells. Banned: neon cyan borders and high-contrast saturation.
- **Child Component Symmetrical Centering**: In `@kyberswap/widgets`, pass explicit width `<Widget width={432} />` and CSS full-width overrides so internal styled-components never default to `375px` and create lopsided margins.
- **Automated Centering Verification**: Run `npm run verify:ui` to test all viewports (1920, 1440, 1280, 1024, 768, 390) for 0px centering drift.

---

## Reusable Page Components

All pages in this application (and future pages) share the standardized header, footer dock, and layout components from `src/components/`:

### 1. `Layout` (`src/components/Layout.tsx`)
The standard page wrapper. Includes the high-definition Sovereign Grid background vignette, the architectural `Header`, the page content (`children`), and the floating telemetry glass dock `Footer`.

```tsx
import { Layout } from "./components";

export default function MyNewPage() {
  return (
    <Layout>
      <main className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-10 flex-1 flex flex-col justify-center">
        {/* Page Content */}
      </main>
    </Layout>
  );
}
```

Props:
- `children: React.ReactNode`: Content rendered in the main area between header and footer.
- `showBackground?: boolean` (default `true`): Renders the 3D Sovereign Grid background with depth vignette.
- `headerProps?: HeaderProps`: Customization for the header.
- `footerProps?: FooterProps`: Customization for the footer.
- `className?: string`: Additional wrapper classes.

---

### 2. `Header` (`src/components/Header.tsx`)
Edge-to-edge architectural header navigation bar.
- **Left**: Official NARA emblem (`/nara-logo-transparent.png`) + `NARA PROTOCOL` link to `/`.
- **Right Nav**:
  - `CHART`: Direct link to DexScreener analytics.
  - `EXPLORER`: Direct link to BaseScan verified token contract.
  - `VISION`: Triggers the sovereign protocol vision & architecture modal.
  - `CONNECT`: Web3-Onboard wallet connect / account status pill.
- Fully self-contained: manages VisionModal and Web3-Onboard connection state.

---

### 3. `Footer` (`src/components/Footer.tsx`)
Floating glass telemetry dock and legal copyright bar.
- **Left**:
  - `ADD $NARA`: 1-tap MetaMask `wallet_watchAsset` token integration (with automatic address copy fallback).
  - `Built with ❤️ on Base` link.
- **Center**: Official community & documentation links:
  - `Telegram`: Official Telegram portal.
  - `X`: Official X/Twitter profile.
  - `GitHub`: Direct link to verified public documentation repository.
  - `LEGALS`: Opens the autonomous software terms modal.
- **Right**: Real-time 15-minute engine pulse clock `PULSE mm:ss (EPOCH X/96)` with spinning indicator.
- **Bottom**: Centered legal copyright notice: `© 2026 NARA PROTOCOL. ALL RIGHTS RESERVED.`
- Fully self-contained: manages pulse clock timer and legal modal internally.

---

### 4. `NaraSwapWidget` (`src/components/NaraSwapWidget.tsx`)
The production NARA DEX interface powered by KyberSwap meta-aggregator infrastructure:
- **Token Freedom**: Full Base token ecosystem support without arbitrary 2-3 button gates. Curated token list includes `$NARA`, `ETH`, `USDC`, `WETH`, `cbBTC`, `AERO`, `DAI`, `DEGEN`, `VIRTUAL` + arbitrary address search.
- **Single Unified Chassis**: Dual-bezel hardware enclosure (`bg-[#080C16]/95`, `rounded-[24px]`, `border-white/[0.08]`) with integrated micro-telemetry (`NARA DEX • BASE 8453` and `0% PROTOCOL FEE`).
- **Ergonomically Calibrated Palette**: Whisper-quiet borders, recessed dark slate wells, and calm Base Blue/Emerald accents for pleasant, zero-eye-strain transactions.
- **Zero Redundant Feedback**: Clean internal transaction receipts with direct BaseScan verification without duplicate external banners.
- Zero added integrator fee (0.00%).
- Connected wallet signing via ethers.js with BaseScan broadcast feedback.

---

### 5. `LegalModal` (`src/components/LegalModal.tsx`)
Clean non-custodial legal notices and protocol terms modal with verified contract addresses and ESC/backdrop click dismissals.

---

### 6. `VisionModal` (`src/components/VisionModal.tsx`)
Comprehensive architectural overview detailing the 4 core pillars (Scarcity, Cadence, Yield Routing, Game-Theoretic Moat).
