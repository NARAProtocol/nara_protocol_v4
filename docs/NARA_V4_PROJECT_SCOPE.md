# NARA v4 — Whole-Project Scope (Cold-AI Start Here)

> **2026-08-09 v4-only release checkpoint:** [CURRENT_STATE.md](CURRENT_STATE.md)
> is the broader workspace state index. The experimental protocol V5 proposal and its source,
> tests, scripts, and plans are deleted and must not be restored. The fresh v4
> core is deployed and source-verified from one immutable reviewed origin
> commit with a new verified manifest and receipt reconciliation. Pool
> activation is confirmed; Compounder validation/freeze, allocations,
> Engine epoch recovery, periphery, and downstream handoffs remain pending. Current activation
> authority is `deployments/v4-production-activation-2026-08-09.json` together
> with `docs/releases/NARA-20260809-v4-production-activation.md`. Controlled
> Stage A and the 2026-07-30 pool are historical incident/recovery evidence
> only; none of their addresses may be reused in consumer configuration.

Last updated: 2026-08-09. Produced by a full scope-coherence audit and updated
for the fixed-v4 relaunch.

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
Pool fees accrue in the Vault; balanced inventory is intended to compound
protocol-owned liquidity only after Compounder validation. The **five pillars** are: **Token, Engine,
Liquidity (the taxed Uniswap v4 pool), the NFT lock layer, and Baskets** (the brand front door).
The source candidate is v4-only. The fresh core deployment, immutable origin
commit, verified deployment manifest, and receipt reconciliation now exist.
Hook/Vault Safe ownership, the deployed and wired Compounder, atomic pool
activation, Safe-owned LP NFT `2898124`, and receipt-pinned buy/sell tax
evidence now exist. The Compounder is still unvalidated and unfrozen with no
position and zero compounded totals. The Engine is also 30 epochs behind at
the pinned operations readback, beyond its eight-epoch JIT buffer. Allocations, periphery, and downstream
handoffs remain separate; the publishable Baskets app remains in preview,
Lockboard is deferred, and Lotto and Arena are retired.

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
build order:   token → engine → LIQUIDITY → NFT locks + router → baskets → buy/sell UI
user sees:     baskets (front door) sitting on top of everything beneath it
```

Liquidity (the taxed pool) is the easy-to-forget pillar: no depth → nothing tradable, locking can't
happen, baskets can't route. It is the foundation everything sits on.

| Layer | Deploy step / script | Contracts |
|---|---|---|
| **Core** | `deploy:v4:base:usdc` (`deployV4BaseUsdc.ts`) | Token, Engine, RewardReserve, LiquidityGrowthHook, LiquidityGrowthVault, Launcher, Create2HookDeployer |
| **Liquidity controls** | `deployLiquidityCompounderV4.ts`, after the fresh core deployment creates the vault | LiquidityCompounder bound only to the fresh Hook/Vault pair |
| **Liquidity** | `build:v4:atomic-pool-launch` + `smoke:v4` | (no new contract — one Safe batch registers and seeds the NARA/USDC v4 pool) |
| **Allocation** | `deploy:v4:allocations` (`deployV4Allocations.ts`) | PositionNFT, PositionAccount, **PositionRenderer**, GenesisRewardDistributor, BondVault, BondDepository(NFT + raw), OpsVault |
| **Router / Lens** | `deploy:v4:router:lens` (`deployRouterLens.ts`) | Router, DashboardLens, **PositionDataLensV1**, **ProtocolStatsLensV1**, **CirculatingSupplyV1**; BribeRouter intentionally skipped |
| **Composability** | `deployComposabilityV4.ts` | StakingPool (stNARA), StakingPoolSY (Pendle), FractionalPosition + Factory |
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
| `composability/NARAFractionalPositionV4` + Factory | Composability | ✅ `composability/NARAFractionalPosition.test.ts` | standard (non-Genesis) NFT; wrapper binding must equal `factory.fractionalOf(positionId)` |

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
| Publish the activation evidence downstream | **release** | Use only the activation manifest and release record cited at the top; consumer changes require explicit handoff |
| Deploy allocations and periphery | **ops/capital** | Separate deployment scope; use human-approved inputs and verified manifests |
| Validate and freeze compounder | **ops** | Use only the compounder bound to the fresh manifest's Hook/Vault pair; run live accounting checks before the one-way freeze |
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
   → NARA/USDC fees accrue in the LiquidityGrowthVault
   → balanced inventory compounds LP only after Compounder validation
   → separate ETH/NARA reward sources can fund lockers
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
