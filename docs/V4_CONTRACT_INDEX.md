# NARA v4 Contract Index

Last updated: 2026-08-30.
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
| `NARAToken.sol` | Fixed permanent-supply ERC-20 (1,000,000 minted once) with capped same-transaction ERC-3156 flash minting that must burn before completion. ERC-2612/1363/3156. | `PRD.md`, `CURRENT_STATE.md` |
| `NARAEngine.sol` | Core epoch engine: lock → weight → NARA + ETH rewards. Contains an ERC-20 reward surface that is disabled for the deployed engine. JIT epoch advance (`MAX_JIT_ADVANCE = 8`). | `EMISSION_MECHANICS.md`, `LOCK_APY_REFERENCE.md`, `ENGINE_OPS_RUNBOOK.md` |
| `NARAEngineTypes.sol` | Shared structs (`Position`) + errors (`NothingToClaim`). | inline |
| `NARALauncher.sol` | Atomic CREATE2 deploy of token + engine (no half-wired state). | `NARA_V4_LAUNCH_RUNBOOK.md` |
| `NARARewardReserve.sol` | Sealed NARA reward reserve; admin cannot sweep, only the engine pulls. | `EMISSION_MECHANICS.md` |
| `NARALiquidityGrowthHook.sol` | Uniswap v4 input-fee hook (default 5%/5%, default operational maximum 20%/20%). Same-input flow accumulates within one block; cross-block flow resets. Hook address low bits must be `0x2088`. | `UNISWAP_V4_HOOK.md` |
| `NARALiquidityGrowthVault.sol` | Receives hook fees. Reachable routes: Liquidity (default), Genesis, GenesisSplit. Legacy Engine and Split selections permanently revert. | `UNISWAP_V4_HOOK.md`, `research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md` |
| `NARALiquidityCompounderV4.sol` | Production `ILiquidityCompounder`. Adds balanced Vault NARA/USDC inventory as a permanent **full-range** Uniswap v4 position (PositionManager + Permit2). One-sided inventory remains banked until matching counterasset exists. No-swap, exact-spend, remainder-banking, POL custody. | `UNISWAP_V4_HOOK.md`, `V4_OPPORTUNITY_GAPS.md` |
| `utils/Create2HookDeployer.sol` | Mines + deploys the hook at the required `0x2088` address. | `NARA_V4_LAUNCH_RUNBOOK.md` |

## Treasury Range Manager candidate (implemented/tested/remediated; not deployed)

This periphery is separate from permanent POL and has no production address.
Its deployment and order builders remain blocked until protected review/CI,
approved Safe funding, a fresh schema-v2 state pin, and explicit human approval.
The completed internal audit/remediation is not an independent external audit
or security clearance.

| Contract | Purpose | Doc |
|---|---|---|
| `NARATreasuryRangeManagerV1.sol` | Immutable Safe-bound owner of explicitly registered one-sided tactical NARA/USDC PositionManager NFTs. Safe alone creates/cancels; anyone may settle a terminal range; every output goes to the Safe. It never replans or reinvests. | `architecture/NARA_TREASURY_RANGE_MANAGER_V1.md`, `releases/NARA-20260828-v4-treasury-range-manager.md` |

The offchain planner/optimizer, adversarial simulator, unsigned Safe builders,
and gas-only settler live under `scripts/` and
`services/v4-treasury-range-settler/`; they are not additional contracts or
custody authorities.

## Engine internals

| Contract | Purpose |
|---|---|
| `libraries/NARAEngineAccountingLib.sol` | Per-weight reward index accounting (NARA/ETH/ERC-20 `*IndexRay`, debt). |
| `libraries/NARAEngineModelLib.sol` | Weight + emission model math. |
| `interfaces/INARAEngine.sol` | Canonical engine interface for integrators. |

## Position NFT Phase 2 (exact seven — `deploy:v4:position-nft`)

Use only
`releases/NARA-20260821-v4-position-nft-phase2.md` and
`NARA_V4_NFT_PRODUCTION_PLAN.md`. The seven contracts deploy in the table order.
The historical `deploy:v4:allocations` alias now refuses execution; it is not a
Phase-2 dry run or fallback and must not be bypassed.

| Contract | Purpose | Doc |
|---|---|---|
| `NARAArtMetadataV1.sol` | Immutable shared metadata fragments; first Phase-2 deployment. | `NARA_V4_NFT_ART_DESIGN_BIBLE.md` |
| `NARAArtSecurityPrintV1.sol` | Immutable security-print art module. | `NARA_V4_NFT_ART_DESIGN_BIBLE.md` |
| `NARAArtCorePlateV1.sol` | Immutable core-position plate module. | `NARA_V4_NFT_ART_DESIGN_BIBLE.md` |
| `NARAArtGenesisPlateV1.sol` | Immutable Genesis-capable plate module; its presence does not deploy or bind the Genesis reward distributor. | `NARA_V4_NFT_ART_DESIGN_BIBLE.md` |
| `NARAPositionRendererV5.sol` | Immutable modular on-chain art + metadata. Art **evolves** with realized **Realized Tier** (New -> Apex), claim/extension counts, and Genesis/Eternal flags; cache-safe (tx-driven drivers only). | `NARA_V4_NFT_ART_DESIGN_BIBLE.md`, `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `NARAPositionAccountV4.sol` | EIP-1167 clone account per NFT; owns the engine position. | `NARA_V4_NFT_POSITIONS.md` |
| `NARAPositionNFTV4.sol` | ERC-721 lock positions ("veNARA NFT"). A lock **is** the NFT. The **single** NFT collection — Genesis/Eternal are flags, not separate collections. Phase-2 final policy is a frozen advisory ERC-2981 royalty of `1000 BPS` to the manifest-pinned production Treasury, plus zero/frozen wrapper NARA and token claim fees. Also tracks per-position lifetime earned and emits ERC-4906 refreshes. | **`NARA_V4_NFT_POSITIONS.md`**, `NARA_V4_NFT_PROTOCOL_ROLE_AUDIT.md`, `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |

## Phase 3 allocations, bonds, and Genesis (deferred)

These contracts are active v4 source, but none belongs to Position NFT Phase 2.
They require a separate approved deployment plan, manifest, verifier, funding
decision, and any Engine/Genesis binding. Phase 2 permits no
`GenesisMinterSet` event.

| Contract | Purpose | Doc |
|---|---|---|
| `NARAGenesisRewardDistributorV4.sol` | Parallel ETH + USDC reward pool for genesis NFTs, weighted by reward weight. | `NARA_V4_NFT_POSITIONS.md` (rewards section) |
| `NARABondVaultV4.sol` | Sealed bond NARA inventory. | `NARA_V4_BOND_OPENING_CRITERIA.md` |
| `NARABondDepositoryV4NFT.sol` | **Canonical** bond path: sells discounted NARA, delivers vesting genesis NFTs. | `NARA_V4_BOND_OPENING_CRITERIA.md` |
| `NARABondDepositoryV4.sol` | Raw bond path (non-NFT). Not the canonical public path. | `NARA_V4_BOND_OPENING_CRITERIA.md` |
| `NARAOpsVaultV4.sol` | Ops/treasury NARA vault (vested ops allocation). | `NARA_V4_LAUNCH_RUNBOOK.md` |

## Phase 3 Router layer (deferred — `deploy:v4:router:lens` only after approval)

| Contract | Purpose | Doc |
|---|---|---|
| `router/NARARouter.sol` | Permit + sync + lock in one tx; permissionless `syncEpochs()` (replaces the keeper). | `ROUTER_LENS.md` |
| `router/NARADashboardLens.sol` | Single-call `getUserState()` for any frontend. | `ROUTER_LENS.md`, `NARA_V4_DASHBOARD_SPEC.md` |
| `router/NARAPositionDataLensV1.sol` | Typed live position-NFT data for apps; batches capped at 100. Now also returns **weight share, age, time-to-unlock, lifetime earned, realized NARA return (bps)**. | `ROUTER_LENS.md`, `NARA_V4_NFT_POSITIONS.md`, `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `router/NARAProtocolStatsLensV1.sol` | **One-call protocol headline stats**: all-time ETH distributed to lockers, NARA emitted, total locked, positions, emission runway, treasury. For homepages/aggregators. | `NARA_V4_POSITION_STATS_AND_CLAIM_FEES.md` |
| `router/BribeRouterV4.sol` | Dormant reference implementation. Do not deploy it for, or grant it a role on, the deployed engine. | `ROUTER_LENS.md` |
| `router/NARACirculatingSupplyV1.sol` | Trustless **market** circulating-supply oracle for listings (CoinGecko/CMC/DexScreener). `circulatingSupply = cappedTotal − Σ(reserve+bonds+vesting+dead)`; user-locked AND treasury count as circulating (≠ engine's emission free-float). Genesis ≈ 110k. Immutable, ownerless, versioned. `excludedAccounts()` publishes the exact set for listing review. | `CIRCULATING_SUPPLY.md` |

## Phase 3 Composability (deferred; deploy only with approval, a market, and an oracle)

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
6. `releases/NARA-20260821-v4-position-nft-phase2.md` — exact Position NFT
   two-commit/deploy/Safe/finalization procedure.
7. Per-contract docs above as needed.
8. `../CLAUDE.md` (repo) for safety standards and v4-reset rules.
