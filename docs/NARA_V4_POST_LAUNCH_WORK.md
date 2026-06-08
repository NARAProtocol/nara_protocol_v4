# NARA v4 — Post-Launch Work

Last updated: 2026-05-28.  
Audience: protocol operator + future contributors.  
Source: RABBIT / FOX / OWL reports + operator feedback.

These are items intentionally deferred from the mainnet launch to keep the launch surface tight. Ship in priority order after mainnet is stable for 48h+.

---

## Pre-Launch Blockers Fixed 2026-05-28

| Item | Status | Notes |
|---|---|---|
| `NARARewardReserve` missing from `contracts/v4/` | **FIXED** | Restored to active path. Deploy script and 3 engine tests now pass. 324/324 tests green. |
| `BribeRouterV4` not built | **FIXED** | Built, 14/14 tests passing. Needs `REWARD_NOTIFIER_ROLE` grant at Step 7 of runbook. |
| `NARARouter` / `NARADashboardLens` not built | **FIXED** | Built, 56/56 tests passing. ABIs exported in `nara.ts`. |
| Bond timing risk undocumented | **FIXED** | `NARA_V4_BOND_OPENING_CRITERIA.md` enforces $500 depth + 24h TWAP + non-zero active weight. |
| Launch sequence undocumented | **FIXED** | `NARA_V4_LAUNCH_RUNBOOK.md` is the operator playbook. |
| Public state messaging inconsistent | **FIXED** | `NARA_V4_PUBLIC_STATE.md` is the honest single source. |

---

## Priority 1 — Required Within 7 Days Of Launch

### 1.1 Position event indexer (Subgraph or custom)

**Why:** `NARADashboardLens.getUserState()` requires the caller to supply `positionIds[]` and `nftTokenIds[]`. Without an indexer, no app can find a user's positions cold. The frontend has no way to enumerate the user's holdings.

**Build:**
- Subgraph indexing `NARAEngine.Locked(uint256 positionId, address indexed owner, ...)` events
- Subgraph indexing `NARAPositionNFTV4.Transfer(from, to, tokenId)` events
- Query by owner address → array of positionIds + array of NFT tokenIds
- Endpoint URL added to `apps/nara-lockboard/src/shared/nara.ts`

**Effort:** 1–2 days for a Subgraph; less for a Goldsky or Envio hosted variant.

**Without this:** every app must store positionIds in its own backend after observing user actions. Cold dashboard reads are impossible.

---

### 1.2 Lockboard v4 rebuild (frontend)

**Why:** Current `apps/nara-lockboard` is wired to v3 ABIs. It will appear "live" to visitors but show retired contracts as if they're active. This is the **OWL P0 trust leak**.

**Build:**
- Replace v3 addresses with fresh v4 addresses from `nara.ts`
- Replace 17 fan-out reads with `lens.getUserState()`
- Replace approve→lock multi-tx flows with `router.syncAndLockWithPermit()`
- Add `router.syncEpochs()` to every write batch (EIP-5792 `useSendCalls`)
- Add page-load auto-sync for Base Smart Wallet users
- Remove visible "Sync" / "Advance epoch" / "Poke" buttons
- Update copy: "Create Position", "Claim", "Compound", "Unlock"
- Remove all retired v3 trust-link references
- Add Coinbase CDP Paymaster (optional, for zero-gas UX)

**Spec:** `NARA_V4_DASHBOARD_SPEC.md` has exact panel definitions and copy rules.

**Effort:** 3–5 days for full rebuild.

**Without this:** the public launch surface shows incorrect/retired data and breaks user trust on day one (OWL P0 RED finding).

---

### 1.3 OWL trust banner across all apps

**Why:** Even before lockboard rebuild, every visible app surface (`nara-lockboard`, `nara-lotto`, `nara-arena`, `nara-protocol-ui`) currently shows "Base mainnet live" copy while v4 is pre-deploy. OWL flagged this as RED P0.

**Build:**
- Global protocol-state banner component
- Reads state from a shared manifest (`apps/shared/protocol-state.ts`)
- Banner copy: "v4 launch active. Token: {address}. Bond status: closed."
- Or pre-launch: "v4 launch in preparation. v3 retired 2026-05-27."
- Updated immediately when fresh deploy completes

**Effort:** half a day per app. Shared banner component once, reused everywhere.

---

## Priority 2 — Required Within 30 Days

### 2.1 stNARA oracle wrapper

**Why:** Lending market integrations (AAVE, Morpho) require a Chainlink-style oracle interface around `pool.exchangeRateWad()`. Without this, no lending market can list stNARA as collateral.

**Build:**
- New contract: `contracts/v4/composability/NARAStakingPoolOracleV4.sol`
- Implements `AggregatorV3Interface` (Chainlink standard)
- Reads `NARAStakingPoolV4.exchangeRateWad()`
- Optional: TWAP smoothing to dampen flash price moves
- Deploy with admin in Safe, no upgrade

**Effort:** half a day Solidity + 1 day tests.

**Prerequisite:** stNARA deployed and has at least 7 days of price history.

---

### 2.2 NARA/stNARA Uniswap v3 pool (instant exit)

**Why:** RABBIT report flagged this as critical for stNARA UX. Without an AMM, all stNARA exits go through `queueRedeem()` which waits for matured positions. Users feel trapped. Bad story spreads.

**Build:**
- Deploy Uniswap v3 NARA/stNARA pool, fee tier 0.05%
- Seed with $5k–$20k of paired liquidity (protocol or community)
- Concentrated liquidity around 1:1 ratio (exchange rate baseline)
- Optional: dedicated UI for instant swap vs queue redeem

**Effort:** ops task, no Solidity. 1 day setup + ongoing rebalancing.

**Prerequisite:** stNARA composability layer deployed.

---

### 2.3 Pendle framing doc + outreach

**Why:** SY adapter is built but `NARAStakingPoolSYV4` exposes only USDC rewards through `getRewardTokens()`. ETH yield is a separate `claimNativeEth()` channel. YT buyers on Pendle will price stNARA based on USDC yield alone and miss the ETH side-channel. This creates an information edge — but the protocol misses the framing opportunity unless documented.

**Build:**
- `NARA_V4_PENDLE_INTEGRATION.md` explaining the three yield streams (NARA emission, USDC pool fees, ETH bond/notify pipe) and which Pendle prices vs which it doesn't
- Outreach package for Pendle team
- Public explainer for YT buyers (analyst posts already drafted in `NARA_V4_ANALYST_POSTS.md`)

**Effort:** 1 day docs + ongoing outreach.

**Prerequisite:** `NARAStakingPoolSYV4` deployed and `rewardIndexesCurrent()` + `claimRewards()` validated on-chain.

---

## Priority 3 — Required Within 90 Days

### 3.1 fracNARA marketplace

**Why:** `NARAFractionalPositionFactoryV4` and `NARAFractionalPositionV4` are deployed primitives. No UI exists to list, price, or trade fractional position units. The composability primitive sits unused.

**Build:**
- Indexer for all created fractional wrappers
- UI for browsing fractionals (NFT-style cards: tokenId, fractions outstanding, accrued NARA/USDC/ETH)
- Pricing layer: NAV oracle per fractional (based on underlying NFT's claimable + remaining duration)
- Optional: OTC desk integration or simple ERC-20 transfer UI
- Optional: market-making bot to provide thin liquidity for popular fractionals

**Effort:** 5–10 days for MVP.

**Prerequisite:** at least 3–5 fractionalized positions exist (organic or seeded).

---

### 3.2 OWL Phase 2 fixes (per-surface status badges, progressive disclosure)

**Why:** OWL flagged Tier 2 UX work after the P0 banner is shipped.

**Build:**
- Per-surface availability badge: live / planned / closed / repo-only
- Quick vs advanced mode toggle for dense dashboards
- Progressive disclosure for fee/epoch/warmup detail
- WCAG accessibility validation pass with evidence

**Effort:** 5–10 days across all apps.

---

### 3.3 Keeper bounty bot for `batchHarvest`

**Why:** `NARAStakingPoolV4` has a built-in keeper bounty (capped at 50 bps) for permissionless `batchHarvest()` calls. Without bots watching, harvesting depends on user activity.

**Build:**
- Off-chain bot (Cloudflare Worker or small VPS) that monitors stNARA pool harvestability
- Triggers `batchHarvest()` when bounty exceeds gas cost
- Publishes simple metrics (last harvest, accumulated bounty, gas cost)

**Effort:** 1–2 days.

---

## Priority 4 — Future / Optional

### 4.1 NARA position NFT lending integration

Use `NARAPositionNFTV4` as collateral on Blend / Astaria / generic NFT lending. Requires:
- On-chain oracle for position NFT value (remaining duration + claimable + weight share)
- Integration spec for each lending protocol

### 4.2 Sponsor Hub v4

Per `archive/legacy-v3/PORTING_ROADMAP.md`. Sponsor primitive that locks principal and uses yield to fund prizes, separate from direct sponsor lanes.

### 4.3 Cross-chain stNARA

stNARA on other chains via LayerZero / Stargate while underlying positions stay on Base. Requires bridge contract spec and security review.

### 4.4 Convex-for-NARA (stNARA booster)

Wrap stNARA in a governance-token-issuing booster contract. Replicates Curve/Convex dynamic. Adds a meta-locker that delegates voting / bribe routing for stNARA holders.

---

## What We Will NOT Build (And Why)

| Item | Reason |
|---|---|
| Stablecoin product | Out of scope. NARA is a commitment engine, not a stablecoin issuer. |
| Native governance token / DAO layer | Intentional. Configuration is timelocked, fee curves are bounded, no token-weighted voting needed for v4. |
| Off-chain Railway keeper | Retired 2026-05-28. Replaced by `router.syncEpochs()` + paymaster auto-fire. See `../../cron/DEPRECATED.md`. |
| Re-deploy retired v4 incident stack | Hard rule per `CURRENT_STATE.md`. Always fresh deploy from current repo code. |
| Hide retired addresses from archive | Archive remains visible for accounting and recovery. Only the trust-link presentation in live UIs must be patched. |

---

## Tracking

Update this file whenever:
- A post-launch item is shipped (mark complete with date)
- A new item is added based on operator or community feedback
- Priorities shift based on adoption signals (e.g., fracNARA marketplace becomes P1 if a whale fractionalizes a major position)

Cross-reference: `ROUTER_LENS.md`, `NARA_V4_LAUNCH_RUNBOOK.md`, `NARA_V4_DASHBOARD_SPEC.md`, `NARA_V4_BOND_OPENING_CRITERIA.md`.
