# NARA v4 — Whole-Project Scope (Cold-AI Start Here)

> **2026-08-01 liquidity override:** The liquidity status and next-step sections
> in this older whole-project map are superseded by
> [NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md)
> and [CURRENT_STATE.md](CURRENT_STATE.md). Stage 0 is executed, the keeper is
> revoked, `WindDown` ETA is `2026-08-07T22:00:35Z`, and nothing moves
> automatically. Preserve v4 only as the recovery/retirement source; the
> explicitly approved V5 direction is a separate new token, engine, reserve,
> modules, liquidity stack, pool, custody, tooling, and integrations. Read
> [NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md).

Last updated: 2026-07-29. Produced by a full scope-coherence audit.

**Audience:** any AI (Claude, GPT, Gemini, Cursor, Codex, …) or human starting cold on this workspace.
Read this first. It is the single end-to-end map: what exists, what state it's in, what's genuinely
outstanding, and how the pieces fit. It links out to the deeper docs rather than duplicating them.

> **Code is the source of truth.** Where this doc disagrees with Solidity or scripts, fix the doc.
> Test counts and addresses drift — this doc references commands + dated stamps for those, never
> hard-codes a number that rots. See the "Clockwork rules" section at the bottom.

---

## 0. The one-paragraph version

NARA v4 is a fixed-supply (1,000,000) time-preference protocol on Base. You lock NARA → get a
weight → earn NARA + ETH rewards per epoch. **A lock *is* an NFT** (`NARAPositionNFTV4`).
Pool fees initially compound protocol-owned liquidity. The **five pillars** are: **Token, Engine,
Liquidity (the taxed Uniswap v4 pool), the NFT lock layer, and Baskets** (the brand front door).
Controlled Stage A is deployed on Base: token, engine, reward reserve, launcher,
CREATE2 hook deployer, and a now-quarantined liquidity trio. The corrected
replacement hook, vault, and compounder are source-remediated but not deployed.
The launch NARA/USDC pool therefore remains uninitialized with zero liquidity.
The launch surface is Baskets only and remains in preview; Lockboard is
deferred, while Lotto and Arena are retired.

---

## 1. TWO build systems — the #1 gotcha

| Project | Path | Build system | Binary | Run tests |
|---|---|---|---|---|
| **NARA Protocol** (token, engine, NFT, router, composability) | `nara-protocol-hardhat/` | **Hardhat** | `npx hardhat` (Node 20 needs `NODE_OPTIONS="--require ./polyfill.cjs"`) | `NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test` |
| **NARA Baskets** (the front door) | `nara-category-baskets-v1/` | **Foundry** | `~/.foundry/bin/forge` (NOT on PATH) | `~/.foundry/bin/forge test --root nara-category-baskets-v1 --no-match-path "test/AerodromeBasketAdapterV1.t.sol"` |

`nara-protocol-hardhat/` has **no Foundry** (`remappings.txt`/`echidna/`/`crytic-export/` are
static-analysis artifacts, not a Forge setup). Do not run `forge` there. Baskets integrate with the
protocol **only** via `engine.depositRewards()` / `engine.notifyEthRewards()` — no shared compile.

---

## 2. The five pillars + the layer model

Conceptually five pillars. Mechanically, layers that deploy in order. **Build order ≠ what users see.**

```
build order:   token → engine → LIQUIDITY → NFT locks + router → baskets → buy/sell UI
user sees:     baskets (front door) sitting on top of everything beneath it
```

Liquidity (the taxed pool) is the easy-to-forget pillar: no depth → nothing tradable, locking can't
happen, baskets can't route. It is the foundation everything sits on.

| Layer | Deploy step / script | Contracts |
|---|---|---|
| **Core** | `deploy:v4:base:usdc` (`deployV4BaseUsdc.ts`) | Token, Engine, RewardReserve, LiquidityGrowthHook, LiquidityGrowthVault, Launcher, Create2HookDeployer |
| **Replacement liquidity controls** | `deploy:v4:pool:only` (`redeployPoolOnly.ts`) | Corrected LiquidityGrowthHook, LiquidityGrowthVault, LiquidityCompounder |
| **Liquidity** | `build:v4:atomic-pool-launch` + `smoke:v4` | (no new contract — one Safe batch registers and seeds the NARA/USDC v4 pool) |
| **Allocation** | `deploy:v4:allocations` (`deployV4Allocations.ts`) | PositionNFT, PositionAccount, **PositionRenderer**, GenesisRewardDistributor, BondVault, BondDepository(NFT + raw), OpsVault |
| **Router / Lens** | `deploy:v4:router:lens` (`deployRouterLens.ts`) | Router, DashboardLens, **PositionDataLensV1**, **ProtocolStatsLensV1**, **CirculatingSupplyV1**; BribeRouter intentionally skipped |
| **Composability** | `deployComposabilityV4.ts` | StakingPool (stNARA), StakingPoolSY (Pendle), FractionalPosition + Factory |
| **Baskets** (separate Foundry pkg) | `DeployMainnetReady.s.sol` | 4 immutable basket managers + fee collector + 5 DEX adapters |

---

## 3. Complete contract inventory + status

Deployment status is not uniform. Controlled Stage A token/engine/reserve are
deployed, while the Stage A hook/vault/compounder are quarantined. Their
corrected replacements, allocation, router/lens, composability, and basket
contracts are not deployed. See `CURRENT_STATE.md` and the deployment manifests
for exact live state. The inventory below describes implementation coverage and
dependency order, not a claim that every listed contract is deployed.

### Protocol (`nara-protocol-hardhat/contracts/v4/`)

| Contract | Layer | Tested | Deploy prerequisite |
|---|---|---|---|
| `NARAToken` | Core | ✅ `NARAToken.v4.test.ts` | none — first thing deployed |
| `NARAEngine` | Core | ✅ `NARAEngine.v4.test.ts`, invariants, (Echidna harness) | token |
| `NARARewardReserve` | Core | ✅ (engine tests) | token |
| `NARALiquidityGrowthHook` | Core | ✅ `NARALiquidityGrowth.v4.test.ts` | hook address mining (`0x2088` low bits) |
| `NARALiquidityGrowthVault` | Core | ✅ `NARALiquidityGrowth.v4.test.ts` | hook |
| `NARALauncher` / `utils/Create2HookDeployer` | Core | ✅ (deploy-path) | none |
| `NARAPositionNFTV4` | Allocation | ✅ `NARAPositionNFTV4.test.ts` | engine |
| `NARAPositionAccountV4` | Allocation | ✅ (NFT tests) | deployed as clone impl |
| `NARAPositionRendererV5` | Allocation | ✅ `NARAPositionNFTV4.test.ts` (art/metadata/fallback) | deploy **before** NFT (NFT references it) |
| `NARAGenesisRewardDistributorV4` | Allocation | ✅ (NFT + genesis tests) | engine, NFT |
| `NARABondVaultV4` | Allocation | ✅ `NARABondV4.test.ts` | engine |
| `NARABondDepositoryV4NFT` (canonical bond path) | Allocation | ✅ `NARABondV4NFT.test.ts` | NFT, vault — **stays closed at launch** |
| `NARABondDepositoryV4` (raw, non-canonical) | Allocation | ✅ `NARABondV4.test.ts` | not the public path |
| `NARAOpsVaultV4` | Allocation | ✅ (alloc tests) | token |
| `router/NARARouter` | Router | ✅ `NARARouter.test.ts` | engine |
| `router/NARADashboardLens` | Router | ✅ `NARADashboardLens.test.ts` | engine, NFT |
| `router/NARAPositionDataLensV1` | Router | ✅ `NARAPositionDataLensV1.test.ts` | engine, NFT; now incl. weight share / age / countdown / lifetime earned / realized return — see `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `router/NARAProtocolStatsLensV1` | Router | ✅ `NARAProtocolStatsLensV1.test.ts` | engine; one-call protocol headline stats (all-time ETH distributed, runway, totals). See `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `router/BribeRouterV4` | Dormant reference | ✅ isolated transfer-path tests | Do not deploy or grant `REWARD_NOTIFIER_ROLE` for the deployed engine |
| `router/NARACirculatingSupplyV1` | Router | ✅ `NARACirculatingSupplyV1.test.ts` (25) | token + the excluded wallet set (reserve/bonds/vesting/dead — treasury stays circulating). Genesis ≈ 110k. See `CIRCULATING_SUPPLY.md` |
| `composability/NARAStakingPoolV4` (stNARA) | Composability | ✅ `composability/NARAStakingPool.test.ts` | core + allocation + **TVL** |
| `composability/NARAStakingPoolSYV4` (Pendle SY) | Composability | ✅ (staking pool tests) | stNARA pool |
| `composability/NARAFractionalPositionV4` + Factory | Composability | ✅ `composability/NARAFractionalPosition.test.ts` | NFT |

### Baskets (`nara-category-baskets-v1/src/`)

| Contract | Tested |
|---|---|
| `NARAImmutableBasketPositionManagerV1` (canonical) + `NARABasketPositionManagerV1` | ✅ manager + invariant suites |
| `NARAIndexFeeCollectorV2` (canonical) + `V1` | ✅ `NARAIndexFeeCollectorV2.t.sol` |
| `CategoryIndexSuiteV1` | ✅ `CategoryIndexSuiteV1.t.sol` |
| Adapters: UniswapV3 / UniswapV4 / Aerodrome AMM / Aerodrome Slipstream / PancakeV3 | ✅ per-adapter unit suites (+ fork proof) |

---

## 4. What's genuinely outstanding (ops vs. external — NOT code)

Everything above is **built and tested**. The remaining work to actually launch is mostly **not
writing contracts**:

| Item | Type | Why it's not a code task |
|---|---|---|
| Execute NARA-depth update | **complete** | Executed after the timelock; active depth verified at 60,000 NARA and pending entry cleared |
| Initialize and seed NARA/USDC | **ops/capital** | Atomic initial position is 60,000 NARA + 300 USDC; approximately $5,000 implied FDV |
| Validate and freeze compounder | **ops** | Source is verified; run the live compound smoke and accounting checks, then the one-way freeze |
| Lock UI rebuilt for v4 | **deferred frontend** | Lockboard is not part of the baskets-only launch |
| Baskets buy/sell UI | **frontend** | The public front door app |
| **stNARA AMM pool** for instant exit | **ops/liquidity** | A pool you seed, not a contract. Without it, exit is via the redemption queue (which IS built) |
| **Pendle PT/YT market** | **external** | Pendle deploys it on top of the already-built SY adapter (`NARAStakingPoolSYV4`) |
| Market-price/TWAP oracle for stNARA | **ops, later** | Only needed for *lending* integrations, and depends on the AMM pool existing first |
| Bonds opening | **ops, deliberate** | Needs a market price to discount from; stays closed at launch |
| **Aderyn + Echidna** | historical 2026-06-08; current rerun pending | Echidna previously passed 13/13 over 10,004 calls; Aderyn previously reported 4 High / 18 Low heuristic items. Those runs predate the liquidity correction and are historical evidence only. Use a Linux runner or CI and `scripts/run-gates-linux.sh` for the release-source rerun. |

> **The NAV oracle the composability layer needs IS built**: `NARAStakingPoolV4.exchangeRateWad()`
> (NARA per stNARA share) and `NARAStakingPoolSYV4.exchangeRate()` / `assetInfo()`. The composability
> layer is **not** "blocked on a missing design piece" — it's gated on deploy + TVL + external market,
> all of which correctly sit after the core launch.

---

## 5. The flywheel (why the order compounds)

```
basket trades + pool tax
   → fees route to engine (notifyEthRewards / depositRewards)
   → lockers earn ETH + NARA
   → demand to buy NARA and lock
   → pool deepens, tax compounds LP
   → baskets route cheaper → more volume → more fees → (loop)
```

It only spins once **depth** (liquidity) and **locked weight** (lockers) exist. That is the whole
reason baskets ship last in build order even though they're the front door. The engine **banks** ETH
when locked weight is zero (not lost, but no visible reward), so fee-producing surfaces go live after
lockers exist.

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

`apps/nara-baskets` is the only current launch frontend. It contains the fresh
v4 launch configuration but remains fail-closed in preview until verified
basket manager and adapter manifests exist. `nara-lockboard` is deferred.
`nara-lotto` and `nara-arena` are retired. Other historical or experimental
apps are not part of the launch scope and must not be presented as active v4
surfaces.

---

## 8. Source-of-truth doc hierarchy

| Question | Read |
|---|---|
| Whole-project map (this doc) | `NARA_V4_PROJECT_SCOPE.md` |
| Every contract → purpose → deploy step | `V4_CONTRACT_INDEX.md` |
| What's actually deployed / live state | `CURRENT_STATE.md` |
| Product direction and phases | `ROADMAP.md` |
| Operator deploy commands | `NARA_V4_LAUNCH_RUNBOOK.md`, `V4_LAUNCH_CHECKLIST.md` |
| NFT position spec | `NARA_V4_NFT_POSITIONS.md`, `NARA_V4_NFT_PRODUCTION_PLAN.md` |
| NFT protocol-wide role / gap audit | `NARA_V4_NFT_PROTOCOL_ROLE_AUDIT.md` |
| Router/lens spec | `ROUTER_LENS.md` |
| Emission model | `EMISSION_MECHANICS.md`, `LOCK_APY_REFERENCE.md` |
| Security disclosure | `../SECURITY.md` |

The NARA Baskets product lives in its own repository. Some internal planning, strategy, and dated
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

**Last full protocol run — 2026-07-29:** Hardhat **468 passing / 0 failing**;
size gate green; Slither exit 0; npm audit **0 high / 0 critical**. This includes
the real Uniswap v4 split-invariance regression and read-only Stage A
quarantine test. The latest Aderyn + Echidna run remains 2026-06-08 and
predates the liquidity correction, so it is historical evidence only. Basket
verification has its own evidence and must be rerun before deployment. See
`CURRENT_STATE.md` for exact commands and limitations.

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
