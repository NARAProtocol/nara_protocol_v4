# NARA v4 — Public State

Last updated: 2026-08-09.
Audience: users, analysts, external protocols, integrators.  
Maintained by: protocol operator. Update every time deployment state changes.

---

## One-Sentence State

**The fresh v4 core and liquidity stack are deployed and source-verified on
Base, and the NARA/USDC pool is registered, initialized, seeded, and proven by
receipt-pinned buy/sell tax tests. Compounder validation/freeze, allocations,
periphery, recurring operations, and downstream launch surfaces remain
separately gated. The Engine activation backlog is receipt-pinned as recovered.**

---

## Protocol Status

| Surface | Status | Notes |
|---|---|---|
| v4 contracts (code) | Implemented and tested | 556 local tests passing (2026-08-09); internal checks are not an independent audit |
| v4 mainnet deploy | Liquidity activated | Core and Compounder source-verified; pool activation evidence published; this is not a full production-readiness claim |
| v3 contracts | Retired 2026-05-27 | Archived, not operational |
| NARA token | Deployed | Fixed supply minted; fresh NARA/USDC pool exists |
| NARA/USDC pool | Seeded | Initialized with 60,000 NARA / 300 USDC; LP NFT 2898124 is Safe-owned; live buy/sell tax tests passed |
| Liquidity compounder | Validation pending | Deployed, source-verified, wired, and Safe-owned; unfrozen with positionTokenId 0 and zero compounded totals |
| Engine operations | Backlog recovered; recurring maintenance disabled | Safe transaction `0xcd6e52b3...638493` advanced epochs 5 through 35; receipt block `49735161` read current/stored epoch as `35 / 35` |
| NARA protocol depth | Configured and seeded | Hook depths and initial liquidity are 60,000 NARA / 300 USDC |
| Public launch surface | Preview only | Baskets only; Lockboard deferred; Lotto and Arena retired |
| Locking | Operations gated | Contract deployed and the activation backlog is recovered; a receipt-pinned production lock smoke test and verified public frontend are still required |
| Bonds | Closed at launch | Opens separately after verification |
| stNARA / staking pool | Pending | Deploys in composability phase |
| Pendle SY adapter | Pending | After stNARA is deployed and validated |
| fracNARA | Pending | After composability phase |
| BribeRouterV4 | Dormant / prohibited | Do not deploy or grant the notifier role for this deployment |

---

## What Is Deployed in the Fresh Core

The following contracts are deployed:

1. **NARAToken** — 1,000,000 NARA fixed supply, ERC-20 with EIP-2612 permit, ERC-1363, flash mint.
2. **NARAEngine** — lock NARA for any duration, earn NARA + ETH rewards each epoch.
3. **NARARewardReserve** — holds the sealed 650,000 NARA emission reserve.
4. **NARALiquidityGrowthHook** — bound to and active for the intended NARA/USDC pool.
5. **NARALiquidityGrowthVault** — deployed and bound to the hook and engine.
6. **NARALiquidityCompounderV4** — deployed, source-verified, wired, and
   Safe-owned; live compound validation and permanent freeze remain pending.

The pool is registered, initialized, and seeded. LP NFT `2898124` is owned by
the production Safe, and receipt-pinned buy and sell tax tests passed. Hook and
Vault ownership has been accepted by the production Safe. Position NFT,
router, lenses, bonds, and composability contracts are not part of the fresh
core-and-liquidity activation.

The reviewed initial position is `60,000 NARA + 300 USDC`, which represents an
opening ratio of `$0.005` per NARA and an implied FDV of approximately `$5,000`
on the fixed 1,000,000 NARA supply. The seed is confirmed, but that historical
opening ratio is not a statement of current market price.

Configured Hook depths are already `60,000 NARA` and `300 USDC` in the fresh
deployment. The Vault has recorded and banked
`1495.229242512170995797 NARA` and `20.462880 USDC`. These balances have not
been compounded: the Compounder remains unfrozen and unvalidated with
`positionTokenId == 0` and zero total compounded amounts.

---

## What Is NOT Live At v4 Launch

| Item | Why |
|---|---|
| Bonds | Intentionally closed until terms, capacity, and Genesis metadata are reviewed |
| stNARA (staking pool) | Composability phase — after core is verified |
| Pendle PT/YT market | After stNARA is deployed and SY reward-index validation passes |
| fracNARA marketplace | After composability phase |
| stNARA oracle | After stNARA is deployed and has history |
| NARA/stNARA AMM | After stNARA is deployed |
| External bribe integrations | BribeRouterV4 is not deployed in the baskets-only launch scope |

---

## What v4 Changes vs v3

| Feature | v3 | v4 |
|---|---|---|
| Token | `0xE444de61752b...` retired | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| Epoch advance | Off-chain Railway cron (private key, 15-min cadence) | JIT inside every user call + permissionless `router.syncEpochs()` |
| Lock path | Approve → lock (two txs) | Permit + sync + lock in one tx via `NARARouter` |
| LP pair | NARA/WETH on Uniswap v3 | NARA/USDC on Uniswap v4 |
| Hook fees | Flat tax-style | Dynamic pressure tiers, asymmetric buy/sell curves |
| Position ownership | v3 wrapper (EIP-1167 clone) | Native `NARAPositionNFTV4` + clone account; tradable on any NFT market |
| Dashboard reads | ~17 separate RPC calls | 1 call to `NARADashboardLens.getUserState()` |
| External bribe routing | Role-gated only | Disabled for this deployment; `BribeRouterV4` is a dormant source reference and must not receive the notifier role |

---

## Locking Mechanics (for analysts)

- **Supply:** 1,000,000 NARA total. Fixed. No inflation.
- **Reward reserve:** 650,000 NARA sealed at deployment. Distributed to lockers over time via the emission model.
- **Duration range:** 1 epoch minimum (activation delay + 1) up to 35,040 epochs (~1 year at 15-min epochs).
- **Weight formula:** quadratic in duration. Max-duration lock earns up to ~3× the weight per NARA vs shortest lock.
- **Activation delay:** 3 epochs after locking, weight becomes active and earning begins.
- **ETH rewards:** flow in via `notifyEthRewards()` (from bond purchases and other sources). Distributed to active weight holders.
- **ERC-20 rewards:** the generic Engine rail exists in source but is disabled
  for this deployment. No `BribeRouterV4` deployment or notifier-role grant is
  authorized.
- **Exit:** positions unlock after `unlockEpoch`. No early exit. NFT is tradable at any time.

---

## Epoch Model

- **Epoch length:** deployed at 900 seconds (15 minutes on Base).
- **Backlog:** if no user writes for 8+ epochs, any write auto-advances up to 8 epochs. Beyond 8, the app calls `router.syncEpochs()`.
- **Maintenance:** user calls can advance up to eight epochs, but this is a
  bounded buffer rather than indefinite keeperlessness. The guarded v4
  maintainer workflow is currently disabled; see `CURRENT_STATE.md` before any
  operational change.
- **Backlog visibility:** `lens.getEpochState()` returns `{currentEpoch, settledEpoch, backlog, syncRequired}`.

---

## Bond State

At launch bonds are **closed**. The criteria to open them are documented in `NARA_V4_BOND_OPENING_CRITERIA.md`.

When bonds open:
- ETH in → discounted NARA out, locked into a Genesis position NFT.
- NFT is tradable immediately on any ERC-721 marketplace.
- Bond ETH is split: portion to `notifyEthRewards()` (rewards all lockers), portion to treasury.

---

## Deployed Contract Addresses

Fresh-core addresses are populated below. Pending entries have not been
deployed as part of this release.

| Contract | Address |
|---|---|
| NARALauncher | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` |
| NARAToken | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| NARAEngine | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` |
| NARARewardReserve | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` |
| NARAPositionNFTV4 | `— pending —` |
| NARAPositionAccountV4 (impl) | `— pending —` |
| NARAGenesisRewardDistributorV4 | `— pending —` |
| NARABondVaultV4 | `— pending —` |
| NARABondDepositoryV4NFT | `— pending —` |
| NARALiquidityGrowthHook | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` (active pool; Safe-owned) |
| NARALiquidityGrowthVault | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` (wired to Compounder; Safe-owned) |
| NARALiquidityCompounderV4 | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` (unvalidated and unfrozen) |
| CREATE2 Hook Deployer | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` (Safe-owned) |
| NARARouter | `— pending —` |
| NARADashboardLens | `— pending —` |
| BribeRouterV4 | `— not deployed; prohibited for this deployment —` |
| NARAStakingPoolV4 (stNARA) | `— pending (composability phase) —` |
| NARAStakingPoolSYV4 | `— pending (composability phase) —` |
| NARAFractionalPositionFactoryV4 | `— pending (composability phase) —` |

Active pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.
It was initialized and seeded in transaction
`0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`
at block `49721188`; LP NFT `2898124` is Safe-owned.
Production admin Safe:
`0xd65c0e390Dc187A22c52c03816591CC736C0D755` (`2 of 3`).

Current activation authority is
`deployments/v4-production-activation-2026-08-09.json` together with
`docs/releases/NARA-20260809-v4-production-activation.md`. Add router/lens rows
only from their own future verified deployment manifest.

---

## Retired Addresses (Do Not Use)

| Contract | Address | Status |
|---|---|---|
| NARATokenV3 | `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` | Retired 2026-05-27 |
| NARAEngineV2 | `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F` | Retired 2026-05-27 |
| NaraLockNFT | `0x2654602d8b0A7e328dcEC553aC2d1D289fC3B5da` | Retired 2026-05-27 |
| NARAEngine v4 (incident) | `0x9E8cE51805b13a4d75c324F75B06ABc00d9b1E03` | Retired 2026-05-27 |

Full retired list: `archive/legacy-v3/README.md`.

---

## For Integrators

The router, dashboard lens, position NFT, and BribeRouter are not deployed in
the baskets-only launch scope. Do not integrate against their planned addresses
or advertise those paths as live.

**Planned position read after the router/lens phase:** one call —
`NARADashboardLens.getUserState(user, positionIds[], nftTokenIds[])`.

**External ERC-20 bribe flow:** no such flow is authorized for this deployment.
`BribeRouterV4` remains a dormant source reference and must not receive the
notifier role.

**ETH reward pipe:** call `NARAEngine.notifyEthRewards{value: amount}()`. Permissionless.

**ABIs:** use generated artifacts from `nara-protocol-hardhat/artifacts/contracts/v4/`,
but pair them only with addresses in the current activation manifest cited
above or in a later immutable, verified deployment-specific manifest.
The only publishable launch frontend currently in scope is the separate
`nara-category-baskets-v1/app/` project, and it remains preview-only pending
verified basket deployment manifests and explicit downstream handoff.

---

## Maintenance Rule

Update this file immediately when:
- A new contract is deployed (add address).
- A contract is retired (add to retired table).
- Bond status changes.
- Composability phase launches.
