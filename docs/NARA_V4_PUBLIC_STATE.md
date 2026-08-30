# NARA v4 — Public State

Last updated: 2026-08-30.
Audience: users, analysts, external protocols, integrators.  
Maintained by: protocol operator. Update every time deployment state changes.

---

## One-Sentence State

**The fresh v4 core and liquidity stack are deployed and source-verified on
Base and are in technical live testing with real assets. The NARA/USDC pool is registered, initialized, seeded, and evidenced by
receipt-pinned buy/sell and same-block tax tests. Compounder validation and the
separate permanent Vault binding freeze are receipt-pinned as complete.
The separately credentialed epoch and liquidity maintainers are active under
bounded policies. Allocations, remaining periphery, the Engine lifecycle smoke,
and downstream launch surfaces remain separately gated.**

This is factual technical disclosure, not public product availability,
investment, legal, tax, or financial advice, an invitation or inducement to
transact, or a promise of safety, liquidity, price, returns, or availability.
Transactions are irreversible, liquidity can be limited or unavailable, and
token values can fall to zero. This repository contains no evidence of
completed jurisdiction-specific qualified legal review; no legal approval or
jurisdictional availability is claimed.

---

## Protocol Status

| Surface | Status | Notes |
|---|---|---|
| v4 contracts (code) | Implemented and tested | 556 local tests passing, 7 opt-in Base-fork cases pending, 0 failing (2026-08-09); internal checks are not an independent audit |
| v4 mainnet deploy | Technical live testing | Core and Compounder source-verified; pool activation evidence published; this is not a public-availability, legal-compliance, or full production-readiness claim |
| v3 contracts | Retired 2026-05-27 | Archived, not operational |
| NARA token | Deployed | Fixed supply minted; fresh NARA/USDC pool exists |
| NARA/USDC pool | Seeded | Initialized with 60,000 NARA / 300 USDC; LP NFT 2898124 is Safe-owned; live buy/sell tax tests passed |
| Liquidity compounder | Validated and binding frozen | At Base block `50499085`, Compounder-owned LP NFT `2898486` had liquidity `4386316228001171`; `28.423769295100595183 NARA / 2.326460 USDC` remained banked |
| Engine operations | Backlog recovered; recurring maintenance active | Dedicated keeper transactions advanced epochs `1500..1661`; final receipt block `50466604` read current/stored epoch as `1661 / 1661`, zero backlog, zero untracked reserve, and a funded external reward reserve. The routine limit remains eight epochs. |
| NARA protocol depth | Configured fee input | Hook `protocolDepth` values are 60,000 NARA / 300 USDC; these deterministic fee inputs are not measurements of current pool liquidity or executable depth |
| Position NFT Phase 2 | Tested, deployed, and finalized; integration gated | Seven contracts passed the recorded release review/test gates, were source-verified and Safe-finalized; this is not an overall independent protocol audit, and the manifest remains `integrationReady: false` |
| Public product surfaces | Preview or unavailable | Baskets preview-only; Position NFT consumers disabled; Lockboard deferred; Lotto and Arena retired |
| Locking | Operations gated | Contract deployed and the activation backlog is recovered; a receipt-pinned production lock smoke test and verified public frontend are still required |
| Bonds | Not deployed or opened | Any future activation is separately gated and not promised |
| stNARA / staking pool | Optional source only | No deployment or availability commitment |
| Pendle SY adapter | Optional source only | No integration, market, or availability commitment |
| fracNARA | Optional source only | No deployment, market, or availability commitment |
| BribeRouterV4 | Dormant / prohibited | Do not deploy or grant the notifier role for this deployment |

---

## What Is Deployed in the Fresh Core

The following contracts are deployed:

1. **NARAToken** — 1,000,000 NARA fixed supply, ERC-20 with EIP-2612 permit, ERC-1363, flash mint.
2. **NARAEngine** — contains time-weighted lock accounting and variable NARA/ETH reward accounting by epoch; amounts can be zero, and the public lifecycle is unavailable.
3. **NARARewardReserve** — holds the sealed 650,000 NARA emission reserve.
4. **NARALiquidityGrowthHook** — bound to and active for the intended NARA/USDC pool.
5. **NARALiquidityGrowthVault** — deployed and bound to the hook and engine.
6. **NARALiquidityCompounderV4** — deployed, source-verified, Safe-owned, and
   live-validated; the Vault binding is permanently frozen to this address.

The pool is registered, initialized, and seeded. LP NFT `2898124` is owned by
the production Safe, and receipt-pinned buy and sell tax tests passed. Hook and
Vault ownership has been accepted by the production Safe. The separately
released Position NFT Phase-2 baseline is deployed and finalized but remains
`integrationReady: false`. Router, lenses, bonds, and composability contracts
are not part of the fresh core-and-liquidity activation.

The reviewed initial position was `60,000 NARA + 300 USDC`. This is historical
deployment evidence only, not a statement of current price, value, depth,
liquidity availability, expected return, or exit.

Configured Hook depths are `60,000 NARA` and `300 USDC`. At the latest
receipt-pinned full-inventory compound (Base block `50499085`), LP NFT
`2898486` had liquidity `4386316228001171`; Vault balances were zero and the
Compounder banked `28.423769295100595183 NARA / 2.326460 USDC`. Those balances
were not active LP. Later balances require a fresh onchain readback.

---

## What Is Not Publicly Available

| Item | Why |
|---|---|
| Bonds | Not deployed, funded, opened, offered, or promised; any future release has separate gates |
| stNARA (staking pool) | Optional undeployed source; no availability commitment |
| Pendle PT/YT market | Not deployed or integrated; no availability commitment |
| fracNARA marketplace | Not deployed or integrated; no market, buyer, liquidity, or exit commitment |
| stNARA oracle | No deployed market-price oracle or availability commitment |
| NARA/stNARA AMM | Not deployed; no liquidity or availability commitment |
| External bribe integrations | BribeRouterV4 is not deployed and the Engine notifier path is prohibited |

---

## What v4 Changes vs v3

| Feature | v3 | v4 |
|---|---|---|
| Token | `0xE444de61752b...` retired | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| Epoch advance | Off-chain Railway cron (private key, 15-min cadence) | Engine JIT plus active bounded maintenance; `router.syncEpochs()` is undeployed source design and unavailable |
| Lock path | Approve → lock (two txs) | Direct Engine source exists; permit + sync + lock via `NARARouter` is undeployed source design and unavailable |
| LP pair | NARA/WETH on Uniswap v3 | NARA/USDC on Uniswap v4 |
| Hook fees | Flat tax-style | Dynamic pressure tiers, asymmetric buy/sell curves |
| Position ownership | v3 wrapper (EIP-1167 clone) | Deployed Phase-2 `NARAPositionNFTV4` + clone account, with `integrationReady: false`; owner-transferable ERC-721 behavior does not guarantee a marketplace or exit |
| Dashboard reads | ~17 separate RPC calls | `NARADashboardLens.getUserState()` is an undeployed source design and unavailable |
| External bribe routing | Role-gated only | Disabled for this deployment; `BribeRouterV4` is a dormant source reference and must not receive the notifier role |

---

## Locking source mechanics (not public availability)

The bullets below describe source behavior. The Position NFT Phase-2 baseline
is deployed but remains `integrationReady: false`; the Engine lifecycle smoke
is pending, and no public locking flow is available from this release.

- **Supply:** 1,000,000 NARA permanent supply. A capped ERC-3156 flash mint can
  expand supply transiently and must be burned within the same transaction.
- **Reward reserve:** 650,000 NARA sealed at deployment. The Engine source is designed to distribute it over time through the emission model after valid positions exist.
- **Duration range:** 1 epoch minimum (activation delay + 1) up to 35,040 epochs (~1 year at 15-min epochs).
- **Weight formula:** quadratic in duration. A max-duration lock receives up to
  approximately 4x the modeled weight per NARA versus the shortest lock.
- **Activation delay:** source behavior activates weight 8 epochs after locking.
- **ETH rewards:** the Engine source accounts ETH sent through `notifyEthRewards()` across active weight. No production funding action is authorized by this document.
- **ERC-20 rewards:** the generic Engine rail exists in source but is disabled
  for this deployment. No `BribeRouterV4` deployment or notifier-role grant is
  authorized.
- **Exit:** source behavior unlocks after `unlockEpoch` and provides no early
  principal exit. ERC-721 ownership can be transferred, but that is not a
  guarantee of marketplace support, liquidity, a buyer, or an exit.

---

## Epoch Model

- **Epoch length:** deployed at 900 seconds (15 minutes on Base).
- **Backlog:** a user write can auto-advance up to 8 epochs. Beyond 8, the
  undeployed router source exposes `syncEpochs()`; no production app call is
  available from this release.
- **Maintenance:** user calls can advance up to eight epochs, but this is a
  bounded buffer rather than indefinite keeperlessness. The guarded v4 epoch
  maintainer is active at minutes `3,18,33,48` of every UTC hour. After RPC failures
  let backlog exceed the routine limit, the explicitly approved 2026-08-26
  recovery advanced epochs `1500..1661`; Base receipt block `50466604` read
  current/stored epoch `1661 / 1661` with zero backlog. See `CURRENT_STATE.md`
  before any operational change.
- **Backlog visibility:** the undeployed lens source exposes `getEpochState()`;
  production monitoring must use separately verified deployed read surfaces.

---

## Bond State

At launch bonds are **closed**. The criteria to open them are documented in `NARA_V4_BOND_OPENING_CRITERIA.md`.

If bonds are later deployed, verified, and explicitly opened:

- source behavior exchanges ETH for NARA under configured terms and locks the
  output into a Genesis position NFT;
- the NFT is owner-transferable, but marketplace availability or liquidity is
  not guaranteed; and
- source behavior splits bond ETH between an Engine reward call and treasury
  routing.

---

## Deployed Contract Addresses

Verified fresh-core and finalized Position NFT Phase-2 addresses are populated
below. Pending entries have not been deployed as part of those releases.

| Contract | Address |
|---|---|
| NARALauncher | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` |
| NARAToken | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| NARAEngine | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` |
| NARARewardReserve | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` |
| NARAPositionNFTV4 | `0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC` (`integrationReady: false`) |
| NARAPositionAccountV4 (impl) | `0x3a8c9cA4f95E94751774810B33caF01bb992A55F` |
| NARAGenesisRewardDistributorV4 | `— pending —` |
| NARABondVaultV4 | `— pending —` |
| NARABondDepositoryV4NFT | `— pending —` |
| NARALiquidityGrowthHook | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` (active pool; Safe-owned) |
| NARALiquidityGrowthVault | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` (wired to Compounder; Safe-owned) |
| NARALiquidityCompounderV4 | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` (validated; Vault binding permanently frozen) |
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

Current authority is `docs/CURRENT_STATE.md` together with the referenced
deployment manifests. Position NFT authority is
`deployments/v4-position-nft-phase2-finalized-2026-08-21.json`; its
`integrationReady: false` gate must be preserved. Add router/lens rows only
from their own future verified deployment manifest.

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

The Position NFT Phase-2 baseline is deployed and finalized, but its canonical
manifest remains `integrationReady: false`. Router, dashboard lens, and
BribeRouter are not deployed. Do not enable Position NFT consumers, integrate
against planned periphery addresses, or advertise those paths as available.

**Planned position read after the router/lens phase:** one call —
`NARADashboardLens.getUserState(user, positionIds[], nftTokenIds[])`.

**External ERC-20 bribe flow:** no such flow is authorized for this deployment.
`BribeRouterV4` remains a dormant source reference and must not receive the
notifier role.

**ETH reward pipe:** `NARAEngine.notifyEthRewards{value: amount}()` exists as a
permissionless source entry point. This document does not authorize a
production call or funding action; integrators must wait for the lifecycle,
operations, custody, and public-availability gates.

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
