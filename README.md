<div align="center">

# NARA — Fixed V4 Stack

**`contracts/v4/` is the only active contract source. The experimental V5 stack
has been deleted. Fresh deployment work is v4-only.**

[![Solidity](https://img.shields.io/badge/Solidity-0.8.34-363636?logo=solidity)](https://soliditylang.org)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-fff100)](https://hardhat.org)
[![Tests](https://img.shields.io/badge/non--fork-759%20passing-2ea44f)](#-build--test)
[![Echidna](https://img.shields.io/badge/invariants-13%2F13%20passing-2ea44f)](#-security)
[![Uniswap v4](https://img.shields.io/badge/Uniswap-v4-ff007a)](docs/UNISWAP_V4_HOOK.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Status](https://img.shields.io/badge/status-technical%20live%20testing-orange)](#-status)

<br/>

![NARA v4 architecture illustration.](docs/assets/how-it-works.png)

</div>

---

> **V4-only release rule (2026-08-05):** do not restore V5 source, tests,
> scripts, or deployment plans. Read [Current State](docs/CURRENT_STATE.md), the
> [v4 Hook specification](docs/UNISWAP_V4_HOOK.md), and the
> [v4 launch checklist](docs/V4_LAUNCH_CHECKLIST.md) before liquidity work.

> **Technical live testing on Base mainnet — not public product availability.**
> The canonical v4 contracts and NARA/USDC pool use real assets. This repository
> reports observed technical state; it does not mean every NARA product or
> interface is available, production-ready, audited, safe, legally approved, or
> available in any jurisdiction. Transactions are irreversible, liquidity can
> be limited or unavailable, and token values can fall to zero. This repository
> contains no evidence of completed jurisdiction-specific qualified legal
> review. Nothing here is an invitation,
> inducement, or recommendation to transact in NARA.

---

## What is NARA?

The description below is the v4 protocol thesis and source inventory. It does
not claim that every optional v4 module is deployed.

The v4 source is built around commitment: a participant can lock a fixed-supply
token for a chosen duration, and duration affects position weight. The Engine
source accounts NARA emissions and contributed ETH across active weight in
15-minute epochs. Rewards are variable, never promised, and can be zero. Public
locking is unavailable; the production lock/activation/claim/unlock smoke and
verified frontend gates remain incomplete. The
deployed Engine's generic ERC-20
notification surface is intentionally disabled; see
[Current State](docs/CURRENT_STATE.md).

The deployed, tested, release-reviewed, and source-verified Position NFT
Phase-2 baseline can represent a commitment as an owner-transferable NFT. Its
release gates do not constitute an overall independent protocol audit. Its finalized manifest remains
`integrationReady: false`: the separately approved value-bearing smoke,
48-hour monitored hold, and immutable downstream handoff are pending.
Fractionalization, wrapping, marketplace, and lending integrations are optional
undeployed source or future integration work; their existence does not
guarantee a buyer, market, lender, liquidity, or exit.

The fresh v4 market uses a custom Uniswap v4 pool. The Hook and Vault are
Safe-owned, the Compounder is deployed and wired, and the pool was atomically
registered, initialized, and seeded on 2026-08-09. Receipt-pinned live buy and
sell tax matrices and the same-block round trip passed. The bounded Compounder
validation minted Compounder-owned LP NFT `2898486`, and the separate Vault
binding freeze succeeded. The Vault is in `Liquidity` mode and its generic
ERC-20 Engine notifier path is disabled.

```
NARAToken -> NARAEngine -> positions / bonds
NARA/USDC pool -> v4 Hook -> v4 Vault -> balanced inventory -> Compounder/POL
```

> **New here?** Start with [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) and
> [`docs/UNISWAP_V4_HOOK.md`](docs/UNISWAP_V4_HOOK.md).

---

## Table of contents

- [Status](#-status)
- [V4 architecture snapshot](#-v4-architecture-snapshot)
- [V4 source pillars](#-v4-source-pillars)
- [How the deployed V4 engine works](#%EF%B8%8F-how-the-deployed-v4-engine-works)
- [Uniswap v4 hook workstreams](#-the-uniswap-v4-hook-workstreams)
- [V4 positions, Genesis & bonds](#-v4-positions-genesis--bonds)
- [V4 composability source](#-v4-composability-source)
- [Contract map](#-contract-map)
- [Build & test](#-build--test)
- [Security](#-security)
- [Deployment](#-deployment)
- [Documentation](#-documentation)
- [License](#-license)

---

## 🚦 Status

**The fresh v4 core and NARA/USDC pool are active in technical live testing on
Base, with product-availability gates still pending.** The production Safe accepted Hook and Vault
ownership, the Compounder was deployed and wired, and the pool was seeded with
LP NFT `2898124` and liquidity `4242640687119285`. Both live tax matrices
passed, including receipt-pinned same-block pressure and reversal evidence.
Compounder validation/reconciliation/freeze is complete. The latest controlled
compound increased Compounder-owned LP NFT `2898486` to liquidity
`4386316228001171` at Base block `50499085`; `28.423769295100595183 NARA /
2.326460 USDC` remained banked. The epoch and liquidity maintainers are active
under separate bounded policies and credentials. The epoch schedule is
`3,18,33,48` with a Railway fallback at `12,27,42,57`; liquidity maintenance is
scheduled at `17,47`. The Position NFT Phase-2 baseline is deployed and
finalized but remains `integrationReady: false`. Baskets remain preview-only.
This is not an overall production-readiness, legal-compliance, or public-
availability claim.
Canonical deployment and operations evidence:
[`deployments/v4-production-activation-2026-08-09.json`](deployments/v4-production-activation-2026-08-09.json),
[`deployments/v4-engine-epoch-recovery-2026-08-09.json`](deployments/v4-engine-epoch-recovery-2026-08-09.json),
[`deployments/v4-compounder-activation-2026-08-09.json`](deployments/v4-compounder-activation-2026-08-09.json),
and [`deployments/v4-engine-epoch-recovery-2026-08-14.json`](deployments/v4-engine-epoch-recovery-2026-08-14.json).
Latest operational evidence is recorded in
[`docs/releases/NARA-20260827-v4-full-inventory-compound.md`](docs/releases/NARA-20260827-v4-full-inventory-compound.md)
and
[`docs/releases/NARA-20260828-v4-epoch-maintainer-resilience.md`](docs/releases/NARA-20260828-v4-epoch-maintainer-resilience.md).

---

## 🏗 V4 Architecture Snapshot

This diagram describes the v4 source family; it is not an availability claim.
The v4 liquidity vault routes pool fees to POL; its `Engine` and `Split`
ERC-20 routes are disabled.

```mermaid
flowchart TD
    subgraph CORE[Core]
      T[NARAToken<br/>1,000,000 fixed supply]
      E[NARAEngine<br/>epochs · weight · rewards]
      R[NARARewardReserve<br/>sealed emission reserve]
    end
    subgraph LIQ[Liquidity]
      H[NARALiquidityGrowthHook<br/>fresh V4 · buy-weighted fee]
      V[NARALiquidityGrowthVault<br/>Liquidity / Genesis routes only]
      P((NARA / USDC<br/>seeded fresh V4 pool))
      LP[Initial full-range LP NFT 2898124]
    end
    subgraph POS[Positions]
      NFT[NARAPositionNFTV4<br/>optional NFT-created commitment]
      ACC[NARAPositionAccountV4<br/>clone per position]
      G[Genesis + Bonds]
    end
    subgraph CMP[Composability]
      ST[stNARA staking pool]
      SY[Pendle SY adapter]
      FR[fractional positions]
    end
    subgraph RTR[Router / Lens]
      RT[NARARouter · lenses<br/>V4 source inventory]
    end

    subgraph TR[Tactical Treasury Ranges - candidate only]
      RM[NARATreasuryRangeManagerV1<br/>Safe-bound one-sided ranges]
      RS[Permissionless range settler<br/>gas-only service]
    end

    T --> E
    R --> E
    P --- H --> V --> LP
    E --> NFT --> ACC --> E
    G --> NFT
    NFT --> ST --> SY
    NFT --> FR
    RT --> E
    S[Production Safe] -->|create / cancel only| RM
    RS -->|settle terminal ranges| RM -->|all proceeds| S
    E -->|NARA · ETH| U[Committers]
```

This is the v4 dependency shape. Full v4 layer inventory:
[`docs/NARA_V4_PROJECT_SCOPE.md`](docs/NARA_V4_PROJECT_SCOPE.md).

The Treasury Range Manager path in the diagram is an implemented, tested, and
internal-audit-remediated candidate only. It is not funded, deployed,
activated, independently externally audited, or part of permanent POL.

---

## 🧱 V4 Source Pillars

| Pillar | What it is |
|--------|-----------|
| **Token** | `NARAToken` — 1,000,000 fixed supply, minted once. ERC-2612 permit, ERC-1363 (`transferAndCall` to commit in one tx), capped ERC-3156 flash mint, multicall. |
| **Engine** | `NARAEngine` — the settlement core: JIT epoch advance and weight-based NARA/ETH accounting. Its generic ERC-20 rail exists in immutable code but is disabled for this deployment. |
| **Liquidity** | The fresh **Uniswap v4** Hook/Vault/Compounder family and seeded pool. Initial full-range liquidity is active under Safe-owned LP NFT `2898124`; at the latest receipt-pinned compound, Compounder-owned LP NFT `2898486` had liquidity `4386316228001171`. Banked Compounder inventory is not active LP. V4 ERC-20 Engine notification is prohibited. |
| **Positions** | `NARAPositionNFTV4` — the Phase-2 baseline is deployed, finalized, and source-verified, but remains `integrationReady: false`; Genesis and bond modules are not part of that deployment. |
| **Composability** | Tested optional v4 source for `stNARA`, a Pendle SY adapter, and fractional position wrappers; not automatically deployed. |

---

## ⚙️ How the Deployed V4 Engine Works

- **JIT epochs.** Time is divided into fixed (default 15-min) epochs. Epoch advancement is triggered
  *inside* user calls and does not require privileged keeper authority. A single
  call bridges up to `MAX_JIT_ADVANCE = 8` epochs; past that, writes revert
  `EpochStale` until anyone calls `poke()` / `advanceEpochs()`. Frontends must
  surface backlog. The 2026-08-14 Safe recovery advanced epochs `36..559`; final
  receipt block `49970727` and later read block `49970969` both reported current
  and stored epoch `559 / 559`. The separately bounded epoch maintainer is now
  active on its `3,18,33,48` schedule, with a separately provisioned Railway
  fallback at `12,27,42,57`. After an RPC outage let backlog exceed the
  routine eight-epoch guard, the explicitly approved 2026-08-26 dedicated
  keeper recovery advanced epochs `1500..1661`; final receipt block `50466604`
  reported current/stored epoch `1661 / 1661`, zero backlog, and zero untracked
  reserve. Operators must still monitor this invariant. The fast recovery
  decision path is in `docs/NARA_V4_EPOCH_MAINTENANCE_RUNBOOK.md`.
- **Weight = committed time.** `weight = amount × (1 + linearWad·r + quadraticWad·r²)`, where
  `r = duration / maxDuration`. Longer commitments receive a structurally higher weight (the curve
  accelerates with duration).
- **Adaptive emission.** Per-epoch NARA emission responds to commitment share, stress, a warmup factor
  (converges up to 1.0), and a decaying bootstrap weight — an incentive loop that rewards real commitment.
- **Two active reward rails.** NARA drip (emissions) and **ETH** through
  `notifyEthRewards()`. The deployed engine contains a role-gated ERC-20 reward
  function, but launch policy disables it because post-notification extensions
  can make later distributions under-allocate. Direct ETH transfers to the
  engine are rejected (`DirectEthTransferForbidden`).

Details: [`docs/EMISSION_MECHANICS.md`](docs/EMISSION_MECHANICS.md) · [`docs/LOCK_APY_REFERENCE.md`](docs/LOCK_APY_REFERENCE.md).

---

## 🦄 The Uniswap v4 Hook

### Fixed v4 design

The v4 hook is an asymmetric, per-block pressure design at permission suffix
`0x2088`. It uses configured `protocolDepth`, charges the input currency, and
aggregates all same-currency flow only within one block. Cross-block splitting
resets pressure by design and must not be described as prevented. Buy-only fees
produce USDC only and remain banked until matching NARA exists; only balanced
inventory can be compounded into active POL. `Engine` and `Split` vault routes
permanently revert, so pool ERC-20 fees do not enter the v4 Engine.

Source detail: [`docs/UNISWAP_V4_HOOK.md`](docs/UNISWAP_V4_HOOK.md).

---

## 🎟 V4 Positions, Genesis & Bonds

- **Optional NFT-created commitment.** `NARAPositionNFTV4` mints an ERC-721 backed 1:1 by a minimal-clone account
  (`NARAPositionAccountV4`) that owns the underlying engine position. Transfer the NFT = transfer the commitment.
- **Deployment state.** The seven-contract Phase-2 baseline is deployed,
  source-verified, and Safe-finalized, but `integrationReady` is `false` until
  the separately approved value-bearing smoke, monitored hold, and downstream
  handoff are complete. It is not presented as a generally available product.
- **Genesis positions** carry a reward multiplier (capped 5×) and an optional `isEternal` flag;
  Eternal positions exit only via `burnEternalGenesis()` (auto-harvest → release → return principal → burn).
- **Bonds** (`NARABondDepositoryV4NFT`) are historical V4 source for delivering
  a vesting position NFT. They were closed under the V4 launch plan and are not
  part of a fresh deployment unless explicitly selected. Historical criteria:
  [`docs/NARA_V4_BOND_OPENING_CRITERIA.md`](docs/NARA_V4_BOND_OPENING_CRITERIA.md).

Spec: [`docs/NARA_V4_NFT_POSITIONS.md`](docs/NARA_V4_NFT_POSITIONS.md).

---

## 🧩 V4 Composability Source

The following v4 components are built and tested but optional. They are not
automatically part of a fresh v4 release:

- **stNARA** (`NARAStakingPoolV4`) — liquid staking token over a pool of max-duration positions;
  exchange-rate accounting includes a dead-share mitigation on first deposit.
- **Pendle SY adapter** (`NARAStakingPoolSYV4`) — implements Pendle's SY (Standardized-Yield) interface
  over stNARA, with two reward streams (USDC + native ETH) and the NAV oracle Pendle needs.
- **Fractional positions** (`NARAFractionalPositionV4`) — undeployed source can
  represent one committed position as up to 1e12 transferable units. No market,
  buyer, collateral support, liquidity, value, or exit is implied.

---

## 🗺 Contract map

`contracts/v4/` is the only active source path. Full v4 index with deploy steps:
[`docs/V4_CONTRACT_INDEX.md`](docs/V4_CONTRACT_INDEX.md).

`NARATreasuryRangeManagerV1` is an undeployed Safe-bound tactical range
candidate. Its exact planner, adversarial simulator, unsigned Safe builders,
and gas-only settler are documented separately and do not alter permanent POL.

| Layer | Contracts |
|-------|-----------|
| **Core** | `NARAToken` · `NARAEngine` · `NARARewardReserve` · `NARALauncher` · `NARALiquidityGrowthHook` · `NARALiquidityGrowthVault` · `utils/Create2HookDeployer` |
| **Positions** | `NARAPositionNFTV4` · `NARAPositionAccountV4` · `NARAPositionRendererV5` · `NARAGenesisRewardDistributorV4` · `NARABondVaultV4` · `NARABondDepositoryV4NFT` · `NARAOpsVaultV4` |
| **Router / Lens** | `router/NARARouter` · `router/NARADashboardLens` · `router/NARAPositionDataLensV1` · dormant `router/BribeRouterV4` reference |
| **Composability** | `composability/NARAStakingPoolV4` · `NARAStakingPoolSYV4` · `NARAFractionalPositionV4` · `NARAFractionalPositionFactoryV4` |

---

## 🔨 Build & test

Hardhat project. **Node 20 requires the polyfill** on every command.

```bash
npm install

# compile
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat compile

# full active suite; use CURRENT_STATE.md for the latest dated result
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test

# compiled-runtime/creation size gate
NODE_OPTIONS="--require ./polyfill.cjs" npm run size

# static analysis
npm run slither:v4
```

Toolchain: `solc 0.8.34`, EVM `cancun`, `via-ir`. This repo is **Hardhat only** — the NARA basket
package is a separate Foundry repo. (`remappings.txt` / `echidna/` here are static-analysis artifacts,
not a Forge setup.)

---

## 🔐 Security verification

| Gate | Latest evidence |
|------|-----------------|
| Deterministic non-fork Hardhat suite | **759 passing, 0 failing** on 2026-08-30; opt-in Base-fork cases were not exercised by this documentation-only pass |
| Fresh deployment/receipt/Safe-batch evidence | **12/12** focused tests passing on 2026-08-09 |
| Fresh v4 activation | Safe ownership accepted; Compounder deployed/wired; pool seeded in block `49721188` with LP NFT `2898124` and liquidity `4242640687119285` |
| Live Hook-tax matrices | Receipt-pinned buy and sell matrices passed on 2026-08-09 |
| Same-block Hook-tax round trip | 20-action buy and exact 20-action sell reversal reconciled at receipt blocks on 2026-08-09 |
| Compounder activation | Bounded compound transaction `0xf1ea7e7d...56b5890be` minted LP NFT `2898486`; separate freeze transaction `0xccd73cf0...78084ef3` permanently locked the Vault binding |
| Liquidity maintainer | Dedicated keeper active at `17,47`; latest controlled transaction `0x85569136...64583` increased LP NFT `2898486` to liquidity `4386316228001171`; normal bounded policy was restored and the residual remains banked |
| Position NFT Phase 2 | Seven contracts tested, release-reviewed, deployed, source-verified, and Safe-finalized; manifest state `configured_source_verified`, `integrationReady: false`; not an overall independent protocol audit |
| Focused Hook/Vault/Compounder/atomic batch | **43/43** passing on 2026-08-05 |
| V4 invariants | **4/4** Hardhat invariant regressions passing on 2026-08-05 |
| Static review | Slither completed every configured production v4 target; internal critic disposition is recorded in the dated audit run |
| Compiled size | Size gate passes; `NARAEngine` remains only 22 bytes below EIP-170 and must not grow |
| npm dependency audit | **0 high / 0 critical** on 2026-08-30; 8 low findings remain in Hardhat Verify's legacy Ethers v5 chain with no upstream fix |
| Echidna | **13/13** invariants on 2026-06-08, before the 2026-07-28 liquidity patch |
| Aderyn | Latest completed run is 2026-06-08; the 2026-07-29 rerun could not start because the binary is unavailable |

These are internal verification results, not an independent audit or a
production-readiness claim. Engine lifecycle smoke, soak, basket deployment,
and downstream integration remain open. The epoch and liquidity maintainers
are active under separate bounded roles and credentials. See
[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).

> Automated analysis is necessary but not sufficient. Independent review
> remains a gate before an overall product-ready claim or expanded automated
> operations. Disclosure policy:
> [`SECURITY.md`](SECURITY.md).

---

## 🚀 Deployment

The 2026-08-09 activation, the 2026-08-14 Engine recovery, same-block tax round
trip, bounded Compounder validation, permanent Vault binding freeze, and the
2026-08-15 guarded liquidity-maintainer cycle have receipt-block evidence, but
release work is not finished. Monitor both separately bounded maintainers,
complete the Engine lifecycle smoke and monitored observation period, deploy no
basket from this repository, and update
downstream consumers only through the cross-repository handoff.
Every further production transaction still requires explicit human approval.
See the activation manifest and release note linked above.

---

## 📚 Documentation

| Doc | Purpose |
|-----|---------|
| [CURRENT_STATE.md](docs/CURRENT_STATE.md) | Canonical live state (source of truth) |
| [v4-production-activation-2026-08-09.json](deployments/v4-production-activation-2026-08-09.json) | Sanitized activation addresses, receipts, pool state, and remaining gates |
| [NARA-20260809-v4-production-activation.md](docs/releases/NARA-20260809-v4-production-activation.md) | Dated activation handoff and verification record |
| [NARA_V4_PROJECT_SCOPE.md](docs/NARA_V4_PROJECT_SCOPE.md) | V4 architecture and recovery-source inventory |
| [V4_CONTRACT_INDEX.md](docs/V4_CONTRACT_INDEX.md) | V4 source/deployment history |
| [UNISWAP_V4_HOOK.md](docs/UNISWAP_V4_HOOK.md) | Fixed v4 hook architecture (`0x2088`, pressure curves) |
| [NARA_TREASURY_RANGE_MANAGER_V1.md](docs/architecture/NARA_TREASURY_RANGE_MANAGER_V1.md) | Undeployed tactical range-manager architecture and boundaries |
| [NARA-20260828-v4-treasury-range-manager.md](docs/releases/NARA-20260828-v4-treasury-range-manager.md) | Implemented/tested candidate evidence, blockers, and handoff |
| [EMISSION_MECHANICS.md](docs/EMISSION_MECHANICS.md) | Adaptive emission model |
| [NARA_V4_NFT_POSITIONS.md](docs/NARA_V4_NFT_POSITIONS.md) | Position NFT + account + Genesis spec |
| [ROUTER_LENS.md](docs/ROUTER_LENS.md) | Router · lens · disabled `BribeRouterV4` reference |
| [ROADMAP.md](docs/ROADMAP.md) | Product direction and phases |

Full index: [`docs/README.md`](docs/README.md).

---

## ⚠️ Disclaimer

This repository contains software and technical evidence, not financial,
investment, legal, or tax advice or an offer of any product. Contract roles,
custody, mutability, and user control vary by deployed component and must be
verified from the current manifest and onchain state; this README makes no
legal characterization of them. Tokens and positions can lose all value.
Rewards are variable, never promised or guaranteed, and can be zero. Public
copy and value-bearing flows require jurisdiction-specific review by qualified
counsel, and users should obtain appropriate professional advice.
Fresh-v4 activation evidence exists, but the basket frontend remains
preview-only and this repository does not claim that the overall product is
production-ready.

---

## Community & contact

- 🌐 Website: **[naraprotocol.pro](https://naraprotocol.pro)**
- 🟣 Farcaster: **@naraprotocol**
- 𝕏 Twitter/X: **[@NARA_protocol](https://x.com/NARA_protocol)**
- 🔐 Security: **security@naraprotocol.pro** (see [SECURITY.md](SECURITY.md))

---

## License

[MIT](LICENSE) © NARA Protocol
