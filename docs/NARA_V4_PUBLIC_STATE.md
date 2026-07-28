# NARA v4 — Public State

Last updated: 2026-07-27.
Audience: users, analysts, external protocols, integrators.  
Maintained by: protocol operator. Update every time deployment state changes.

---

## One-Sentence State

**The fresh v4 token, engine, reward reserve, and liquidity-routing contracts
are deployed on Base. The pool is not initialized, there is no liquidity, and
no public app or market is live yet.**

---

## Protocol Status

| Surface | Status | Notes |
|---|---|---|
| v4 contracts (code) | Complete | 453 tests passing (2026-07-26), static analysis reviewed |
| v4 mainnet deploy | Stage A complete | Fresh core deployed; public activation pending |
| v3 contracts | Retired 2026-05-27 | Archived, not operational |
| NARA token | Deployed | Fixed supply minted; no public market yet |
| NARA/USDC pool | Registered only | Uninitialized, zero liquidity |
| Liquidity compounder | Deployed, wired, source verified | Not frozen until post-seed validation |
| NARA protocol depth | Executed and verified | 60,000 NARA active; pending entry cleared |
| Public launch surface | Preview only | Baskets only; Lockboard deferred; Lotto and Arena retired |
| Locking | Contract deployed | No approved public frontend yet |
| Bonds | Closed at launch | Opens separately after verification |
| stNARA / staking pool | Pending | Deploys in composability phase |
| Pendle SY adapter | Pending | After stNARA is deployed and validated |
| fracNARA | Pending | After composability phase |
| BribeRouterV4 | Pending | Deploys with router/lens; needs role grant |

---

## What Is Deployed in Stage A

The following contracts are deployed:

1. **NARAToken** — 1,000,000 NARA fixed supply, ERC-20 with EIP-2612 permit, ERC-1363, flash mint.
2. **NARAEngine** — lock NARA for any duration, earn NARA + ETH rewards each epoch.
3. **NARARewardReserve** — holds the sealed 650,000 NARA emission reserve.
4. **NARALiquidityGrowthHook** — registered for the intended NARA/USDC pool.
5. **NARALiquidityGrowthVault** — deployed and bound to the hook and engine.

The pool is not initialized and no LP position exists. The production
`NARALiquidityCompounderV4` was subsequently deployed at
`0xc327e50c14002a82c9F1477122204BB183f446Ab` and wired to the vault. It is not
frozen. Its source is verified on Basescan, Blockscout, and Sourcify. Position NFT,
router, lenses, bonds, and composability contracts are not part of Stage A.

The reviewed initial position is `60,000 NARA + 300 USDC`, which represents an
opening ratio of `$0.005` per NARA and an implied FDV of approximately `$5,000`
on the fixed 1,000,000 NARA supply. This is a configuration target, not a live
market price: the pool remains uninitialized and unseeded.

A protocol-depth change from `30 NARA` to `60,000 NARA` was proposed on
2026-07-27. The active value remains `30 NARA` until the timelocked execution
transaction succeeds and is verified. Liquidity must not be initialized before
that verification.

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
| External bribe routing | Role-gated only | `BribeRouterV4` makes it permissionless for any protocol |

---

## Locking Mechanics (for analysts)

- **Supply:** 1,000,000 NARA total. Fixed. No inflation.
- **Reward reserve:** 650,000 NARA sealed at deployment. Distributed to lockers over time via the emission model.
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

Stage A addresses are populated below. Pending entries have not been deployed.

| Contract | Address |
|---|---|
| NARAToken | `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A` |
| NARAEngine | `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9` |
| NARARewardReserve | `0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD` |
| NARAPositionNFTV4 | `— pending —` |
| NARAPositionAccountV4 (impl) | `— pending —` |
| NARAGenesisRewardDistributorV4 | `— pending —` |
| NARABondVaultV4 | `— pending —` |
| NARABondDepositoryV4NFT | `— pending —` |
| NARALiquidityGrowthHook | `0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088` |
| NARALiquidityGrowthVault | `0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988` |
| NARALiquidityCompounderV4 | `0xc327e50c14002a82c9F1477122204BB183f446Ab` (wired and source verified; not frozen) |
| CREATE2 Hook Deployer | `0xC045644303E43cbb1E3c3E3fC851246F5c590834` |
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
The only launch frontend currently in scope is `apps/nara-baskets`, and it
remains preview-only pending verified basket deployment manifests.

---

## Maintenance Rule

Update this file immediately when:
- A new contract is deployed (add address).
- A contract is retired (add to retired table).
- Bond status changes.
- Composability phase launches.
