# NARA v4 — Public State

Last updated: 2026-05-28.  
Audience: users, analysts, external protocols, integrators.  
Maintained by: protocol operator. Update every time deployment state changes.

---

## One-Sentence State

**v4 code is complete and audited. Fresh mainnet deploy pending. Nothing is live on Base yet.**

---

## Protocol Status

| Surface | Status | Notes |
|---|---|---|
| v4 contracts (code) | Complete | 360 tests passing (2026-06-07), static analysis clean |
| v4 mainnet deploy | Pending | No approved public v4 address yet |
| v3 contracts | Retired 2026-05-27 | Archived, not operational |
| NARA token | No live token | New token deploys with fresh v4 launch |
| NARA/USDC pool | Pending | Deploys as part of v4 core launch |
| Locking | Pending | Available once v4 is deployed |
| Bonds | Closed at launch | Opens separately after verification |
| stNARA / staking pool | Pending | Deploys in composability phase |
| Pendle SY adapter | Pending | After stNARA is deployed and validated |
| fracNARA | Pending | After composability phase |
| BribeRouterV4 | Pending | Deploys with router/lens; needs role grant |

---

## What Will Be Live At v4 Launch

At fresh deploy, the following are immediately live:

1. **NARAToken** — 1,000,000 NARA fixed supply, ERC-20 with EIP-2612 permit, ERC-1363, flash mint.
2. **NARAEngine** — lock NARA for any duration, earn NARA + ETH rewards each epoch.
3. **NARAPositionNFTV4** — every lock position is a tradable ERC-721 NFT.
4. **NARA/USDC pool** — Uniswap v4, dynamic hook fees routing to the vault.
5. **NARALiquidityGrowthVault** — collects pool fees, routes to LP depth or engine rewards.
6. **NARARouter** — one-tx permit + lock + sync. Permissionless `syncEpochs()`. No keeper needed.
7. **NARADashboardLens** — single `getUserState()` call returns all wallet + position + epoch data.

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
| External bribe integrations | BribeRouterV4 is deployed, but needs external protocols to adopt it |

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
| External bribe routing | Role-gated only | `BribeRouterV4` makes it permissionless for any protocol |

---

## Locking Mechanics (for analysts)

- **Supply:** 1,000,000 NARA total. Fixed. No inflation.
- **Reward reserve:** 700,000 NARA sealed at deployment. Distributed to lockers over time via the emission model.
- **Duration range:** 1 epoch minimum (activation delay + 1) up to 35,040 epochs (~1 year at 15-min epochs).
- **Weight formula:** quadratic in duration. Max-duration lock earns up to ~3× the weight per NARA vs shortest lock.
- **Activation delay:** 3 epochs after locking, weight becomes active and earning begins.
- **ETH rewards:** flow in via `notifyEthRewards()` (from bond purchases and other sources). Distributed to active weight holders.
- **ERC-20 rewards:** any external protocol can deliver token bribes to all active lockers via `BribeRouterV4.notify(token, amount)`.
- **Exit:** positions unlock after `unlockEpoch`. No early exit. NFT is tradable at any time.

---

## Epoch Model

- **Epoch length:** set at deployment (expected 900s = 15 min on Base).
- **Backlog:** if no user writes for 8+ epochs, any write auto-advances up to 8 epochs. Beyond 8, the app calls `router.syncEpochs()`.
- **No keeper:** epoch advance is baked into every user tx. No external cron or bot required.
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

*Will be populated after fresh v4 mainnet deploy. Until then, all addresses are pending.*

| Contract | Address |
|---|---|
| NARAToken | `— pending —` |
| NARAEngine | `— pending —` |
| NARAPositionNFTV4 | `— pending —` |
| NARAPositionAccountV4 (impl) | `— pending —` |
| NARAGenesisRewardDistributorV4 | `— pending —` |
| NARABondVaultV4 | `— pending —` |
| NARABondDepositoryV4NFT | `— pending —` |
| NARALiquidityGrowthHook | `— pending —` |
| NARALiquidityGrowthVault | `— pending —` |
| NARARouter | `— pending —` |
| NARADashboardLens | `— pending —` |
| BribeRouterV4 | `— pending —` |
| NARAStakingPoolV4 (stNARA) | `— pending (composability phase) —` |
| NARAStakingPoolSYV4 | `— pending (composability phase) —` |
| NARAFractionalPositionFactoryV4 | `— pending (composability phase) —` |

Update this table from `deployments/v4-base-usdc-latest.json` and `deployments/router-lens-8453.json` after deployment.

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

**Read position data:** one call — `NARADashboardLens.getUserState(user, positionIds[], nftTokenIds[])`.

**Bribe all NARA lockers with your token:**
1. Approve `BribeRouterV4` for your token amount.
2. Call `BribeRouterV4.notify(yourToken, amount)`.
3. Done. All active weight holders receive your token pro-rata on next claim.

**ETH reward pipe:** call `NARAEngine.notifyEthRewards{value: amount}()`. Permissionless.

**ABIs:** available in `apps/nara-lockboard/src/shared/nara.ts` (`routerAbi`, `lensAbi`, `bribeRouterAbi`).

---

## Maintenance Rule

Update this file immediately when:
- A new contract is deployed (add address).
- A contract is retired (add to retired table).
- Bond status changes.
- Composability phase launches.
