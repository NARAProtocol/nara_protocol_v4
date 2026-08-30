# NARA v4 — Whole-Project Scope (Cold-AI Start Here)

> **Current-state annotation: 2026-08-30:**
> [CURRENT_STATE.md](CURRENT_STATE.md)
> is the broader workspace state index. The experimental protocol V5 proposal and its source,
> tests, scripts, and plans are deleted and must not be restored. The fresh v4
> core is deployed and source-verified from one immutable reviewed origin
> commit with a new verified manifest and receipt reconciliation. Pool
> activation, Engine epoch recovery, and Compounder validation/freeze are
> confirmed. The exact seven-contract Position NFT Phase-2 baseline is deployed,
> source-verified, and Safe-finalized, but its canonical manifest remains
> `integrationReady: false`; the separately approved value-bearing smoke,
> 48-hour monitored hold, and immutable downstream handoff remain pending.
> Allocations, bonds, Genesis distributor/minter binding,
> Router/Lens, and composability are Phase 3. Current core authority is
> `deployments/v4-production-activation-2026-08-09.json` together with
> `deployments/v4-compounder-activation-2026-08-09.json` and
> `docs/releases/NARA-20260809-v4-compounder-activation.md`. Controlled
> Stage A and the 2026-07-30 pool are historical incident/recovery evidence
> only; none of their addresses may be reused in consumer configuration.

Last updated: 2026-08-30. Produced by a full scope-coherence audit and updated
for the fixed-v4 relaunch.

**Audience:** any AI (Claude, GPT, Gemini, Cursor, Codex, …) or human starting cold on this workspace.
Read this first. It is the single end-to-end map: what exists, what state it's in, what's genuinely
outstanding, and how the pieces fit. It links out to the deeper docs rather than duplicating them.

> The canonical contracts and NARA/USDC pool are in technical live testing with
> real assets on Base mainnet. This is not public product availability, audit or
> safety assurance, legal approval, or a recommendation. This repository
> contains no evidence of completed jurisdiction-specific
> qualified legal review.

> **Code is the source of truth.** Where this doc disagrees with Solidity or scripts, fix the doc.
> Test counts and addresses drift — this doc references commands + dated stamps for those, never
> hard-codes a number that rots. See the "Clockwork rules" section at the bottom.

---

## 0. The one-paragraph version

NARA v4 is a fixed-supply (1,000,000) time-weighted protocol on Base. Source
behavior can lock NARA, assign weight, and account variable NARA emissions and
contributed ETH; amounts can be zero. Direct Engine positions are not NFTs.
`NARAPositionNFTV4` is an optional position-creation path.
Pool fees accrue in the Vault; a validated bounded action has compounded the
first balanced subset into protocol-owned liquidity. The **five pillars** are: **Token, Engine,
Liquidity (the taxed Uniswap v4 pool), the NFT lock layer, and Baskets** (the brand front door).
The source candidate is v4-only. The fresh core deployment, immutable origin
commit, verified deployment manifest, and receipt reconciliation now exist.
Hook/Vault Safe ownership, atomic pool activation, Safe-owned LP NFT `2898124`,
receipt-pinned buy/sell and same-block tax evidence, Engine backlog recovery,
and validated/frozen Compounder-owned LP NFT `2898486` now exist. The exact
seven-contract Position NFT Phase-2 baseline is deployed, source-verified, and
Safe-finalized. Its canonical `integrationReady` value remains `false`; the
separately approved smoke, 48-hour hold, and downstream handoff remain.
Allocations and the rest of the periphery are Phase 3; the publishable Baskets
app remains in preview, Lockboard is deferred, and Lotto and Arena are retired.

---

## 1. TWO build systems — the #1 gotcha

| Project | Path | Build system | Binary | Run tests |
|---|---|---|---|---|
| **NARA** (token, engine, NFT, router, composability) | `nara-protocol-hardhat/` | **Hardhat** | `npx hardhat` (Node 20 needs `NODE_OPTIONS="--require ./polyfill.cjs"`) | `NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test` |
| **NARA basket app and contracts** (the front door) | `nara-category-baskets-v1/` | **Foundry** | `~/.foundry/bin/forge` (NOT on PATH) | `~/.foundry/bin/forge test --root nara-category-baskets-v1 --no-match-path "test/AerodromeBasketAdapterV1.t.sol"` |

`nara-protocol-hardhat/` has **no Foundry** (`remappings.txt`/`echidna/`/`crytic-export/` are
static-analysis artifacts, not a Forge setup). Do not run `forge` there. Baskets integrate with the
protocol **only** via `engine.depositRewards()` / `engine.notifyEthRewards()` — no shared compile.

---

## 2. The five pillars + the layer model

Conceptually five pillars. Mechanically, layers that deploy in order. **Build order ≠ what users see.**

```
build order:   token → engine → LIQUIDITY → NFT locks → Phase-3 router/periphery → baskets → buy/sell UI
user sees:     baskets (front door) sitting on top of everything beneath it
```

Liquidity (the taxed pool) is the easy-to-forget pillar: without adequate depth,
swaps can have severe price impact and there may be no practical market; locking cannot
happen, baskets can't route. It is the foundation everything sits on.

| Layer | Deploy step / script | Contracts |
|---|---|---|
| **Core** | `deploy:v4:base:usdc` (`deployV4BaseUsdc.ts`) | Token, Engine, RewardReserve, LiquidityGrowthHook, LiquidityGrowthVault, Launcher, Create2HookDeployer |
| **Liquidity controls** | `deployLiquidityCompounderV4.ts`, after the fresh core deployment creates the vault | LiquidityCompounder bound only to the fresh Hook/Vault pair |
| **Liquidity** | `build:v4:atomic-pool-launch` + `smoke:v4` | (no new contract — one Safe batch registers and seeds the NARA/USDC v4 pool) |
| **Position NFT Phase 2** | `deploy:v4:position-nft`, only through `releases/NARA-20260821-v4-position-nft-phase2.md` | ArtMetadata, ArtSecurityPrint, ArtCorePlate, ArtGenesisPlate, **PositionRenderer**, PositionAccount, PositionNFT — exactly seven |
| **Allocations / bonds / Genesis (Phase 3)** | Separate future approved workflow; the retired `deploy:v4:allocations` alias refuses execution | OpsVault, BondVault, BondDepository NFT/raw paths, GenesisRewardDistributor, allocations and Engine/Genesis bindings |
| **Router / Lens (Phase 3)** | `deploy:v4:router:lens` only after separate approval | Router, DashboardLens, **PositionDataLensV1**, **ProtocolStatsLensV1**, **CirculatingSupplyV1**; BribeRouter intentionally skipped |
| **Composability (Phase 3)** | `deployComposabilityV4.ts` only after separate approval | StakingPool (stNARA), StakingPoolSY (Pendle), FractionalPosition + Factory |
| **Baskets** (separate Foundry pkg) | `DeployMainnetReady.s.sol` | 4 immutable basket managers + fee collector + 5 DEX adapters |

---

## 3. Complete contract inventory + status

The inventory below describes source coverage and dependency order, not current
deployment. Treat every historical Stage A or 2026-07-30 address as
incident/recovery evidence. A component enters the fresh release only through a
new verified manifest produced from the immutable v4 origin commit. See
`CURRENT_STATE.md` for the exact evidence state.

### Protocol (`nara-protocol-hardhat/contracts/v4/`)

| Contract | Layer | Tested | Deploy prerequisite |
|---|---|---|---|
| `NARAToken` | Core | ✅ `NARAToken.v4.test.ts` | none — first thing deployed |
| `NARAEngine` | Core | ✅ `NARAEngine.v4.test.ts`, invariants, (Echidna harness) | token |
| `NARARewardReserve` | Core | ✅ (engine tests) | token |
| `NARALiquidityGrowthHook` | Core | ✅ `NARALiquidityGrowth.v4.test.ts` | hook address mining (`0x2088` low bits) |
| `NARALiquidityGrowthVault` | Core | ✅ `NARALiquidityGrowth.v4.test.ts` | hook |
| `NARALauncher` / `utils/Create2HookDeployer` | Core | ✅ (deploy-path) | none |
| `NARAArtMetadataV1` | Position NFT Phase 2 | ✅ (NFT/art tests) | first of the exact seven-contract release |
| `NARAArtSecurityPrintV1` | Position NFT Phase 2 | ✅ (NFT/art tests) | metadata module |
| `NARAArtCorePlateV1` | Position NFT Phase 2 | ✅ (NFT/art tests) | metadata + security-print modules |
| `NARAArtGenesisPlateV1` | Position NFT Phase 2 | ✅ (NFT/art tests) | metadata + security-print modules; does not bind a Genesis distributor |
| `NARAPositionRendererV5` | Position NFT Phase 2 | ✅ `NARAPositionNFTV4.test.ts` (art/metadata/fallback) | all four art modules; deploy **before** NFT |
| `NARAPositionAccountV4` | Position NFT Phase 2 | ✅ (NFT tests) | clone implementation deployed before NFT |
| `NARAPositionNFTV4` | Position NFT Phase 2 | ✅ `NARAPositionNFTV4.test.ts` | engine, account implementation, renderer; seventh and final Phase-2 contract |
| `NARAGenesisRewardDistributorV4` | Phase 3 | ✅ (NFT + genesis tests) | engine, NFT; not deployed or bound in Phase 2 |
| `NARABondVaultV4` | Phase 3 | ✅ `NARABondV4.test.ts` | engine; separate allocation/bond approval |
| `NARABondDepositoryV4NFT` (canonical bond path) | Phase 3 | ✅ `NARABondV4NFT.test.ts` | NFT, vault — separate deployment and opening decisions |
| `NARABondDepositoryV4` (raw, non-canonical) | Phase 3 | ✅ `NARABondV4.test.ts` | not the public path |
| `NARAOpsVaultV4` | Phase 3 | ✅ (alloc tests) | token; separate allocation approval |
| `router/NARARouter` | Phase 3 Router | ✅ `NARARouter.test.ts` | engine |
| `router/NARADashboardLens` | Phase 3 Router | ✅ `NARADashboardLens.test.ts` | engine, NFT |
| `router/NARAPositionDataLensV1` | Phase 3 Router | ✅ `NARAPositionDataLensV1.test.ts` | engine, NFT; now incl. weight share / age / countdown / lifetime earned / realized return — see `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `router/NARAProtocolStatsLensV1` | Phase 3 Router | ✅ `NARAProtocolStatsLensV1.test.ts` | engine; one-call protocol headline stats (all-time ETH distributed, runway, totals). See `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `router/BribeRouterV4` | Dormant reference | ✅ isolated transfer-path tests | Do not deploy or grant `REWARD_NOTIFIER_ROLE` for the deployed engine |
| `router/NARACirculatingSupplyV1` | Phase 3 Router | ✅ `NARACirculatingSupplyV1.test.ts` (25) | token + the excluded wallet set (reserve/bonds/vesting/dead — treasury stays circulating). Genesis ≈ 110k. See `CIRCULATING_SUPPLY.md` |
| `composability/NARAStakingPoolV4` (stNARA) | Phase 3 Composability | ✅ `composability/NARAStakingPool.test.ts` | core + Position NFT + **TVL** |
| `composability/NARAStakingPoolSYV4` (Pendle SY) | Phase 3 Composability | ✅ (staking pool tests) | stNARA pool |
| `composability/NARAFractionalPositionV4` + Factory | Phase 3 Composability | ✅ `composability/NARAFractionalPosition.test.ts` | standard (non-Genesis) NFT; wrapper binding must equal `factory.fractionalOf(positionId)` |

### Baskets (`nara-category-baskets-v1/src/`)

| Contract | Tested |
|---|---|
| `NARAImmutableBasketPositionManagerV1` (canonical) + `NARABasketPositionManagerV1` | ✅ manager + invariant suites |
| `NARAIndexFeeCollectorV2` (canonical) + `V1` | ✅ `NARAIndexFeeCollectorV2.t.sol` |
| `CategoryIndexSuiteV1` | ✅ `CategoryIndexSuiteV1.t.sol` |
| Adapters: UniswapV3 / UniswapV4 / Aerodrome AMM / Aerodrome Slipstream / PancakeV3 | ✅ per-adapter unit suites (+ fork proof) |

---

## 4. Outstanding release and evidence gates

The listed source exists with the cited test evidence. This is not deployment,
integration, public-availability, legal, economic, or release readiness.

| Item | Type | Why it's not a code task |
|---|---|---|
| Publish the activation evidence downstream | **release** | Use only the activation manifest and release record cited at the top; consumer changes require explicit handoff |
| Complete Position NFT integration readiness | **release/ops** | Seven-contract baseline is deployed, source-verified, and Safe-finalized; value-bearing smoke, 48-hour hold, and immutable downstream handoff remain, so `integrationReady` stays `false` |
| Deploy allocations, bonds, Genesis, Router/Lens, or composability | **Phase 3 ops/capital** | Separate future scopes; never route them through Position NFT Phase 2 or bypass the retired allocation refusal guard |
| Validate and freeze compounder | **completed ops evidence** | Receipt-pinned in `deployments/v4-compounder-activation-2026-08-09.json`; do not replay the one-time activation sequence |
| Lock UI rebuilt for v4 | **deferred frontend** | Lockboard is deferred and no public lock product is available |
| Baskets buy/sell UI | **frontend** | Preview-only app; no public transactions or product availability |
| **stNARA AMM pool** | **ops/liquidity** | Undeployed external liquidity dependency; no instant or complete exit is guaranteed |
| **Pendle PT/YT market** | **external** | No deployment or availability commitment; requires independent Pendle coordination and all release gates |
| Market-price/TWAP oracle for stNARA | **ops, later** | Only needed for *lending* integrations, and depends on the AMM pool existing first |
| Bonds opening | **ops, deliberate** | Needs a market price to discount from; stays closed at launch |
| **Aderyn + Echidna** | historical 2026-06-08; current rerun pending | Echidna previously passed 13/13 over 10,004 calls; Aderyn previously reported 4 High / 18 Low heuristic items. Those runs predate the liquidity correction and are historical evidence only. Use a Linux runner or CI and `scripts/run-gates-linux.sh` for the release-source rerun. |

The source includes `NARAStakingPoolV4.exchangeRateWad()` and
`NARAStakingPoolSYV4.exchangeRate()` / `assetInfo()`. Those functions are not a
market-price oracle or availability evidence. Composability requires separate
security, economic, legal, integration, monitoring, liquidity, custody, and
user-exit gates in addition to deployment and any external market.

---

## 5. Dependency and fee-flow ordering

Current evidenced flow is limited to supported swaps charging input-currency
fees into the Vault and bounded compounding of balanced inventory into LP;
unmatched inventory remains banked. Separate ETH/NARA reward sources have their
own gates. Any claim that this creates demand, deeper liquidity, lower costs,
more volume, more fees, or a self-reinforcing loop is an unverified economic
hypothesis and must not be presented as an expected outcome. Baskets ship only
after their independent deployment, security, economic, legal, monitoring, and
exit gates.

---

## 6. After launch (in order, each gated on the previous proving out)

1. **Treasury scale-up** — open bonds only after their separate gates, deliver
   positions through the documented NFT path, and evaluate `Genesis` or
   `GenesisSplit` only after review. Engine and Split vault modes stay disabled.
2. **Composability** — deploy stNARA + SY + fractions, seed the stNARA AMM, then contact Pendle.
3. **Dormant game lane** (archived v3, need real v4 ports, none scheduled, never gate launch):
   Sponsor Hub, Lotto, BurnRun Arena, MisterMint. A port writes a **new** file under `contracts/v4/`,
   never edits the archive.

---

## 7. Satellite apps (`apps/`)

The only publishable launch frontend is `../nara-category-baskets-v1/app/`; it
remains fail-closed in preview until immutable protocol evidence and verified
basket manager and adapter manifests exist. `../apps/nara-baskets/` is a
non-publishing historical working copy. Lockboard is deferred. Lotto and Arena
are retired. Other historical or experimental apps are not active v4 surfaces.

---

## 8. Source-of-truth doc hierarchy

| Question | Read |
|---|---|
| Whole-project map (this doc) | `NARA_V4_PROJECT_SCOPE.md` |
| Every contract → purpose → deploy step | `V4_CONTRACT_INDEX.md` |
| What's actually deployed / live state | `CURRENT_STATE.md` |
| Product direction and phases | `ROADMAP.md` |
| Operator deploy commands | `NARA_V4_LAUNCH_RUNBOOK.md`, `V4_LAUNCH_CHECKLIST.md` |
| Position NFT Phase-2 operator release | `releases/NARA-20260821-v4-position-nft-phase2.md` |
| NFT position spec | `NARA_V4_NFT_POSITIONS.md`, `NARA_V4_NFT_PRODUCTION_PLAN.md` |
| NFT protocol-wide role / gap audit | `NARA_V4_NFT_PROTOCOL_ROLE_AUDIT.md` |
| Router/lens spec | `ROUTER_LENS.md` |
| Emission model | `EMISSION_MECHANICS.md`, `LOCK_APY_REFERENCE.md` |
| Security disclosure | `../SECURITY.md` |

The NARA basket app and contracts live in their own repository. Some internal planning, strategy, and dated
working docs are intentionally kept out of this public repository.

---

## 9. Verification (command-driven, dated stamp)

Do not trust hard-coded counts. Run these; update the stamp.

```bash
# Protocol (Hardhat)
cd nara-protocol-hardhat
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test     # full suite
NODE_OPTIONS="--require ./polyfill.cjs" npm run size         # bytecode gate
npm run slither:v4                                           # static analysis

# Baskets (Foundry)
~/.foundry/bin/forge test --root nara-category-baskets-v1 --no-match-path "test/AerodromeBasketAdapterV1.t.sol"
```

Do not use this map's historical counts as release evidence. Run the complete
gates against the exact candidate and record results in the current Change-ID
handoff. See `CURRENT_STATE.md` for the latest dated evidence and limitations;
basket verification remains separately owned and must be rerun from the pinned
protocol origin and verified manifest.

---

## 10. Audit corrections log (2026-06-07 scope-coherence pass)

What was stale/wrong before this audit, so a cold AI knows not to trust the old phrasing:

1. **"stNARA AMM market + oracle = the one genuinely missing design piece"** (was in
   `NARA_V4_ECONOMIC_LAUNCH_ROADMAP.md`). **Wrong.** The NAV oracle + Pendle SY adapter are built and
   tested; what's outstanding is ops (seed a pool) + external (Pendle market). Corrected.
2. **"568 passing"** (was in `CURRENT_STATE.md` + `ROADMAP.md`). **Stale** — predates the 2026-05-27
   v4 reset that archived the v3 tests. Current dated evidence lives in
   `CURRENT_STATE.md`; rerun the command instead of trusting an older count.
3. **Router/lens layer + `NARAPositionRendererV5` missing** from `CURRENT_STATE.md` tables (those docs
   were frozen at 2026-05-27, before the 2026-05-28 router work and 2026-06 NFT-presentation work).
   Added.
4. **"94 pass, 1 skip"** for baskets (in workspace-root `CLAUDE.md`). **Stale** — suite grew to 136
   passing / 1 skip.
5. One real **test regression** was fixed the same day: `NARAStakingPoolV4 > unlocks through unlockTo`
   — the NFT's Genesis try-claim helpers called a code-less distributor when none was set; guarded.
   See `NARA_V4_NFT_PRODUCTION_PLAN.md`.

---

## 11. Clockwork rules (keep this from drifting)

1. **Never hard-code test counts in prose.** Reference the command + a "last verified: N on DATE" stamp.
2. **Addresses live in `CURRENT_STATE.md` only**, and only after a real deploy + verification. Never
   surface retired v3 or the 2026-04-23 v4 incident stack as "live."
3. **A roadmap item is not "done" until deployed addresses + verification are recorded.**
4. **Distinguish three kinds of "not done":** code (write a contract), ops (deploy/seed/liquidity),
   external (Pendle/partner). Most remaining NARA work is ops/external, not code — say which.
5. When you add a contract, update: `V4_CONTRACT_INDEX.md`, `CURRENT_STATE.md`, this doc, and the
   relevant deploy script + tests in the same change.
6. Two build systems. Check which project you're in before running `forge` or `hardhat`.
7. `deploy:v4:allocations` is a retired refusal guard. Never bypass it or use it
   as a Position NFT Phase-2 dry run; use the exact seven-contract release
   runbook and dedicated verifiers.
