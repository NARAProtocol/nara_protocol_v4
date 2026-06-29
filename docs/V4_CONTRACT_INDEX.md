# NARA v4 Contract Index

Last updated: 2026-06-29.
**Start here for v4.** Maps every active v4 contract to its purpose, deploy step, and canonical doc.
Active sources live **only** in `contracts/v4/`. Everything else is archived/retired.

> For the **whole-project scope** (five pillars, layer model, build-vs-reveal order, what's genuinely
> outstanding, two-build-system gotcha, audit corrections), read **`NARA_V4_PROJECT_SCOPE.md`** first —
> it's the cold-start map; this file is the per-contract detail underneath it.

> `NARA_MASTER_CONTEXT.md` is a **v3 archive reference** (its own header says so) — do not use it for
> v4 mechanics. Use this index + `CURRENT_STATE.md` + `PRD.md` + `ROADMAP.md` + the `V4_*` docs.

---

## Core (deploy step 1 — `deploy:v4:base:usdc`)

| Contract | Purpose | Doc |
|---|---|---|
| `NARAToken.sol` | Fixed-supply ERC-20 (1,000,000, mints once, no inflation). ERC-2612/1363/3156. | `PRD.md`, `CURRENT_STATE.md` |
| `NARAEngine.sol` | Core epoch engine: lock → weight → NARA + ETH + ERC-20 rewards per 15-min epoch. JIT epoch advance (`MAX_JIT_ADVANCE = 8`). | `EMISSION_MECHANICS.md`, `LOCK_APY_REFERENCE.md`, `ENGINE_OPS_RUNBOOK.md` |
| `NARAEngineTypes.sol` | Shared structs (`Position`) + errors (`NothingToClaim`). | inline |
| `NARALauncher.sol` | Atomic CREATE2 deploy of token + engine (no half-wired state). | `NARA_V4_LAUNCH_RUNBOOK.md` |
| `NARARewardReserve.sol` | Sealed NARA reward reserve; admin cannot sweep, only the engine pulls. | `EMISSION_MECHANICS.md` |
| `NARALiquidityGrowthHook.sol` | Taxed Uniswap v4 hook (default 5%/5%, cap 25%/20%). Hook address low bits must be `0x2088`. | `research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md` |
| `NARALiquidityGrowthVault.sol` | Receives hook tax. `routeMode`: Liquidity (default, compounds LP) / Engine / Split / Genesis / GenesisSplit. POL-first by design. | `UNISWAP_V4_HOOK.md`, `research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md` |
| `NARALiquidityCompounderV4.sol` | Production `ILiquidityCompounder` — closes the POL flywheel. Adds the vault's NARA/USDC skim as a permanent **full-range** Uniswap v4 position (PositionManager + Permit2). No-swap, exact-spend, remainder-banking, POL custody. Built + unit-tested; deploy via `scripts/deployLiquidityCompounderV4.ts` then `vault.setCompounder`. | `UNISWAP_V4_HOOK.md`, `V4_OPPORTUNITY_GAPS.md` |
| `utils/Create2HookDeployer.sol` | Mines + deploys the hook at the required `0x2088` address. | `NARA_V4_LAUNCH_RUNBOOK.md` |

## Engine internals

| Contract | Purpose |
|---|---|
| `libraries/NARAEngineAccountingLib.sol` | Per-weight reward index accounting (NARA/ETH/ERC-20 `*IndexRay`, debt). |
| `libraries/NARAEngineModelLib.sol` | Weight + emission model math. |
| `interfaces/INARAEngine.sol` | Canonical engine interface for integrators. |

## Allocation layer (deploy step 6 — `deploy:v4:allocations`)

| Contract | Purpose | Doc |
|---|---|---|
| `NARAPositionNFTV4.sol` | ERC-721 lock positions ("veNARA NFT"). A lock **is** the NFT. The **single** NFT collection — genesis/eternal are flags inside it, not separate collections. Also holds **wrapper-level claim fees** (`naraClaimFeeBps`/`tokenClaimFeeBps`, default 0, cap 10%), per-position **lifetime earned** tracking, and ERC-4906 refresh emits. | **`NARA_V4_NFT_POSITIONS.md`**, `NARA_V4_NFT_PROTOCOL_ROLE_AUDIT.md`, `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `NARAPositionAccountV4.sol` | EIP-1167 clone account per NFT; owns the engine position. | `NARA_V4_NFT_POSITIONS.md` |
| `NARAPositionRendererV4.sol` | Immutable on-chain art + metadata. Art **evolves** with realized-earnings **Yield Tier** (New→Apex) + Genesis/Eternal flags; cache-safe (tx-driven drivers only). **Canonical art direction: `NARA_V4_NFT_ART_DESIGN_BIBLE.md`** (7-module sacred-machine system + status/gap). | `NARA_V4_NFT_ART_DESIGN_BIBLE.md`, `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `NARAGenesisRewardDistributorV4.sol` | Parallel ETH + USDC reward pool for genesis NFTs, weighted by reward weight. | `NARA_V4_NFT_POSITIONS.md` (rewards section) |
| `NARABondVaultV4.sol` | Sealed bond NARA inventory. | `NARA_V4_BOND_OPENING_CRITERIA.md` |
| `NARABondDepositoryV4NFT.sol` | **Canonical** bond path: sells discounted NARA, delivers vesting genesis NFTs. | `NARA_V4_BOND_OPENING_CRITERIA.md` |
| `NARABondDepositoryV4.sol` | Raw bond path (non-NFT). Not the canonical public path. | `NARA_V4_BOND_OPENING_CRITERIA.md` |
| `NARAOpsVaultV4.sol` | Ops/treasury NARA vault (vested ops allocation). | `NARA_V4_LAUNCH_RUNBOOK.md` |

## Router layer (deploy step 7 — `deploy:v4:router:lens`)

| Contract | Purpose | Doc |
|---|---|---|
| `router/NARARouter.sol` | Permit + sync + lock in one tx; permissionless `syncEpochs()` (replaces the keeper). | `ROUTER_LENS.md` |
| `router/NARADashboardLens.sol` | Single-call `getUserState()` for any frontend. | `ROUTER_LENS.md`, `NARA_V4_DASHBOARD_SPEC.md` |
| `router/NARAPositionDataLensV1.sol` | Typed live position-NFT data for apps; batches capped at 100. Now also returns **weight share, age, time-to-unlock, lifetime earned, realized NARA return (bps)**. | `ROUTER_LENS.md`, `NARA_V4_NFT_POSITIONS.md`, `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `router/NARAProtocolStatsLensV1.sol` | **One-call protocol headline stats**: all-time ETH distributed to lockers, NARA emitted, total locked, positions, emission runway, treasury. For homepages/aggregators. | `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `router/BribeRouterV4.sol` | Permissionless `notify(token, amount)` → engine. Any protocol can bribe NARA lockers. Needs `REWARD_NOTIFIER_ROLE`. | `ROUTER_LENS.md` |
| `router/NARACirculatingSupplyV1.sol` | Trustless **market** circulating-supply oracle for listings (CoinGecko/CMC/DexScreener). `circulatingSupply = cappedTotal − Σ(reserve+bonds+vesting+dead)`; user-locked AND treasury count as circulating (≠ engine's emission free-float). Genesis ≈ 110k. Immutable, ownerless, versioned. `excludedAccounts()` publishes the exact set for listing review. | `CIRCULATING_SUPPLY.md` |

## Composability (deploy step 8 — code-complete, deploy only with a market + oracle)

| Contract | Purpose | Doc |
|---|---|---|
| `composability/NARAStakingPoolV4.sol` | `stNARA` liquid staking wrapper; locks NARA at max duration under the hood. Queued redemption. | `V4_BUILD_PLAN_COMPOSABILITY.md`, `COMPOSABILITY_AUDIT_CHECKLIST.md` |
| `composability/NARAStakingPoolSYV4.sol` | Pendle SY adapter over stNARA (USDC rewards + separate ETH claim). | `V4_BUILD_PLAN_COMPOSABILITY.md` |
| `composability/NARAFractionalPositionV4.sol` | Fractionalizes a single position NFT (fractions ≤ 1e12). | `V4_BUILD_PLAN_COMPOSABILITY.md` |
| `composability/NARAFractionalPositionFactoryV4.sol` | Factory for fractional wrappers. | `V4_BUILD_PLAN_COMPOSABILITY.md` |

## Baskets (separate Foundry package)

Not in this Hardhat compile path. Lives in `../../nara-category-baskets-v1/`. Integrates only via
`engine.depositRewards()` / `engine.notifyEthRewards()`. See that package's `CLAUDE.md` and
`NARA_V4_BASKETS_LAUNCH_STRATEGY.md`.

## Not built in v4 yet (archived v3, need a port)

Sponsor Hub, Lotto, BurnRun Arena, MisterMint — see `archive/legacy-v3/PORTING_ROADMAP.md`. None
scheduled. A port writes a **new** file under `contracts/v4/`, never edits the archive.

---

## Cold-start reading order

1. `NARA_V4_PROJECT_SCOPE.md` — whole-project scope map (pillars, layers, status, outstanding work).
2. This file (`V4_CONTRACT_INDEX.md`) — the per-contract map.
3. `CURRENT_STATE.md` — what's actually deployed/live.
4. `PRD.md` + `ROADMAP.md` — what it is and where it's going.
5. `NARA_V4_ECONOMIC_LAUNCH_ROADMAP.md` — launch order + economics.
6. Per-contract docs above as needed.
7. `../CLAUDE.md` (repo) for safety standards and v4-reset rules.
