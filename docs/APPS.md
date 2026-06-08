# NARA Protocol Apps Map

Last updated: 2026-05-27.

This file is the map of the active NARA app surfaces.
For live protocol state and contract truth, use `CURRENT_STATE.md`. For current v4 core deployment work, use the `V4_*` docs first.

## 🚨 v4 Reset — App Status

All frontend apps that connect to NARA contracts were wired to v3 ABIs and addresses. **They are not functional end-to-end until rebuilt for v4.** Do not assume any app works against live contracts until explicitly verified post-v4-deploy.

---

## App Surfaces

### 1. NARA Protocol UI

**What it is:** Main website and protocol-facing homepage. Owns the root domain experience.

**Local path:** `apps/nara-protocol-ui/`

**Role:** Marketing, protocol framing, and main navigation layer for the ecosystem.

**v4 status:** Static marketing content; no direct contract dependency. Needs address/link updates after v4 deploy.

### 2. NARA Lock Board

**What it is:** The 100-slot founding locker board. Target route is `/mine`.

**Local path:** `apps/nara-lockboard/`

**Stack:** Vite + React (TSX) + wagmi v2 + RainbowKit + Cloudflare D1 + Cloudflare Workers

**Production route:** `https://www.naraprotocol.pro/mine`

**Key files:**
- `src/app.tsx`
- `src/styles.css`
- `src/shared/nara.ts` — contract addresses + ABIs
- `src/shared/board.ts` — slot config and logic
- `wrangler.toml`

**v4 status:** Wired to v3 ABIs. Needs ABI and address update for v4 before functioning end-to-end.

### 3. NARA Lotto

**What it is:** Lucky Epoch lotto game surface.

**Local path:** `apps/nara-lotto/`

**Role:** Lotto game UI tied to the broader protocol.

**v4 status:** Was wired to `NaraLottoPoolV2` (v3, retired). The Lotto contract has no v4 equivalent yet — see `archive/legacy-v3/PORTING_ROADMAP.md`. Non-functional until a v4 lotto is deployed and the app is rebuilt.

### 4. NARA Arena

**What it is:** Burn-to-race game surface.

**Local path:** `apps/nara-arena/`

**Role:** Arena gameplay UI for joins, movement, sabotage, prize visibility, and leaderboard.

**GitHub repo:** `https://github.com/NARAProtocol/arena_run_ui-.git`

**Production route target:** `https://www.naraprotocol.pro/arena`

**v4 status:** Was wired to `BurnRunArenaV2` (v3, retired at `0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b`). The Arena contract has no v4 equivalent yet — see `archive/legacy-v3/PORTING_ROADMAP.md`. Non-functional until a v4 arena is deployed and the app is rebuilt.

### 5. NARA Simple UI

**What it is:** Secondary wallet UI for direct lock, unlock, claim, and mine flows.

**Local path:** `apps/nara-simple-ui/`

**Stack:** Vite + React (JSX) + wagmi + RainbowKit

**v4 status:** Wired to v3 ABIs. Needs update for v4 before use.

### 6. NARA Analytics

**What it is:** Read-only protocol analytics dashboard.

**Local path:** `apps/nara-analytics/`

**Stack:** Vite + React + Recharts (no wallet)

**v4 status:** Reads from v3 contracts. Needs update for v4 data sources after v4 deploy.

---

## App Ownership Summary

| App | Local Path | Primary Role | v4 Status |
| --- | --- | --- | --- |
| NARA Protocol UI | `apps/nara-protocol-ui/` | Main website / root domain | Needs address updates |
| NARA Lock Board | `apps/nara-lockboard/` | `/mine` founding board | Needs v4 ABI rebuild |
| NARA Lotto | `apps/nara-lotto/` | Lotto game surface | Needs v4 lotto contract |
| NARA Arena | `apps/nara-arena/` | Arena game surface | Needs v4 arena contract |
| NARA Simple UI | `apps/nara-simple-ui/` | Secondary wallet operations | Needs v4 ABI rebuild |
| NARA Analytics | `apps/nara-analytics/` | Read-only analytics | Needs v4 data sources |

---

## Retired v3 Contract Addresses (Base Mainnet, chainId 8453)

All retired as of 2026-05-27. Do not use these in new integrations.

| Contract | Address |
| --- | --- |
| NARATokenV3 | `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` |
| NARAEngineV2 | `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F` |
| NARARewardReserve | `0xC425F45f3e108cA4E49f86E01C6d256e6c572876` |
| NARABondVault | `0xcCe364b9cF815D47B0338aAd960367CdE8E3525D` |
| NARABondDepository | `0xe5f3D18d81661F63F9Fa5B53401eee08d383Ca20` |
| NARALottoPoolV2 | `0x81573dEDa5BcED23f0754cf3D0D2553d3694a0Ba` |
| BurnRunArenaV2 | `0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b` |
| NaraLockNFT | `0x2654602d8b0A7e328dcEC553aC2d1D289fC3B5da` |
| Uniswap V3 NARA/WETH 0.3% pool | `0x71528CC56F44950aA74C3D656D2bD3502BAD2e91` |

Full archive: `archive/legacy-v3/README.md`

---

## Operational Notes

- All apps targeting v3 contracts are non-functional end-to-end until rebuilt for v4 ABIs and fresh v4 addresses.
- Frontend addresses must only be updated after the fresh v4 deploy is verified and recorded in `CURRENT_STATE.md`.
- For epoch-sensitive UIs, verify engine state against the fresh v4 `NARAEngine` — the v3 engine is retired.
- Lotto and Arena have no v4 contract equivalents yet. Porting roadmap is in `archive/legacy-v3/PORTING_ROADMAP.md`.

---

## Build Commands

### Lock board
```bash
cd apps/nara-lockboard
npm run dev
npm run build
npm run deploy:cf:prod   # Cloudflare Pages deploy
```

### Protocol UI
```bash
cd apps/nara-protocol-ui
npm run build
```

### Lotto
```bash
cd apps/nara-lotto
npm run build
```

### Arena
```bash
cd apps/nara-arena
npm run build
```

### Simple UI
```bash
cd apps/nara-simple-ui
npm run build
```

### Analytics
```bash
cd apps/nara-analytics
npm run build
```
