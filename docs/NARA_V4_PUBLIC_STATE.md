# NARA v4 — Public State

Last updated: 2026-08-09.
Audience: users, analysts, external protocols, integrators.  
Maintained by: protocol operator. Update every time deployment state changes.

---

## One-Sentence State

**The fresh v4 core contracts are deployed and source-verified on Base. The
NARA/USDC pool is not registered, initialized, or seeded; there is no official
liquidity, LP NFT, public app, or active market yet.**

---

## Protocol Status

| Surface | Status | Notes |
|---|---|---|
| v4 contracts (code) | Implemented and tested | 553 local tests passing (2026-08-09); internal checks are not an independent audit |
| v4 mainnet deploy | Fresh core deployed | Seven core contracts source-verified; public activation pending |
| v3 contracts | Retired 2026-05-27 | Archived, not operational |
| NARA token | Deployed | Fixed supply minted; no public market yet |
| NARA/USDC pool | Dormant | Unregistered, uninitialized, unseeded; zero liquidity and no LP NFT |
| Liquidity compounder | Pending | Not deployed or configured; Vault Compounder is the zero address |
| NARA protocol depth | Configured only | Hook depths are 60,000 NARA / 300 USDC; these are not active liquidity |
| Public launch surface | Preview only | Baskets only; Lockboard deferred; Lotto and Arena retired |
| Locking | Contract deployed | No approved public frontend yet |
| Bonds | Closed at launch | Opens separately after verification |
| stNARA / staking pool | Pending | Deploys in composability phase |
| Pendle SY adapter | Pending | After stNARA is deployed and validated |
| fracNARA | Pending | After composability phase |
| BribeRouterV4 | Pending | Deploys with router/lens; needs role grant |

---

## What Is Deployed in the Fresh Core

The following contracts are deployed:

1. **NARAToken** — 1,000,000 NARA fixed supply, ERC-20 with EIP-2612 permit, ERC-1363, flash mint.
2. **NARAEngine** — lock NARA for any duration, earn NARA + ETH rewards each epoch.
3. **NARARewardReserve** — holds the sealed 650,000 NARA emission reserve.
4. **NARALiquidityGrowthHook** — bound to the intended NARA/USDC pair, but not
   registered for a pool.
5. **NARALiquidityGrowthVault** — deployed and bound to the hook and engine.

The pool is not registered or initialized and no LP position exists. The fresh
`NARALiquidityCompounderV4` is not deployed or wired. Hook and Vault ownership
still require acceptance by the production Safe before Compounder wiring or
pool activation. Position NFT, router, lenses, bonds, and composability
contracts are not part of the fresh core deployment.

The reviewed initial position is `60,000 NARA + 300 USDC`, which represents an
opening ratio of `$0.005` per NARA and an implied FDV of approximately `$5,000`
on the fixed 1,000,000 NARA supply. This is a configuration target, not a live
market price: the pool remains uninitialized and unseeded.

Configured Hook depths are already `60,000 NARA` and `300 USDC` in the fresh
deployment. Liquidity must not be initialized before the separate ownership,
Compounder, pre-seed, and atomic-batch gates pass.

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
| Token | `0xE444de61752b...` retired | New address at fresh launch |
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

- **Epoch length:** set at deployment (expected 900s = 15 min on Base).
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
| NARALiquidityGrowthHook | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` (unregistered; Safe ownership acceptance pending) |
| NARALiquidityGrowthVault | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` (Compounder zero; Safe ownership acceptance pending) |
| NARALiquidityCompounderV4 | `— pending —` |
| CREATE2 Hook Deployer | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` (Safe-owned) |
| NARARouter | `— pending —` |
| NARADashboardLens | `— pending —` |
| BribeRouterV4 | `— pending —` |
| NARAStakingPoolV4 (stNARA) | `— pending (composability phase) —` |
| NARAStakingPoolSYV4 | `— pending (composability phase) —` |
| NARAFractionalPositionFactoryV4 | `— pending (composability phase) —` |

Planned dormant pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.
Production admin Safe:
`0xd65c0e390Dc187A22c52c03816591CC736C0D755` (`2 of 3`).

The fresh-core rows are reconciled to
`deployments/v4-base-usdc-latest.json`. Add router/lens rows only from their own
future verified deployment manifest.

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

**Planned bribe flow after BribeRouter deployment and role verification:**
1. Approve `BribeRouterV4` for your token amount.
2. Call `BribeRouterV4.notify(yourToken, amount)`.
3. Active weight holders receive the token pro-rata on the next claim.

**ETH reward pipe:** call `NARAEngine.notifyEthRewards{value: amount}()`. Permissionless.

**ABIs:** use generated artifacts from `nara-protocol-hardhat/artifacts/contracts/v4/`,
but only pair them with addresses recorded as deployed in `CURRENT_STATE.md`.
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
