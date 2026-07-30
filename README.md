<div align="center">

# NARA Protocol v4

**A fixed-supply, time-preference commitment protocol on Base. Commit NARA, hold a tradable position NFT; the protocol distributes NARA emissions and contributed ETH across committed weight each epoch.**

[![Solidity](https://img.shields.io/badge/Solidity-0.8.34-363636?logo=solidity)](https://soliditylang.org)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-fff100)](https://hardhat.org)
[![Tests](https://img.shields.io/badge/tests-468%20passing-2ea44f)](#-build--test)
[![Echidna](https://img.shields.io/badge/invariants-13%2F13%20passing-2ea44f)](#-security)
[![Uniswap v4](https://img.shields.io/badge/Uniswap-v4%20hook-ff007a)](docs/UNISWAP_V4_HOOK.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Status](https://img.shields.io/badge/status-core%20deployed%20%C2%B7%20liquidity%20pending-orange)](#-status)

<br/>

![NARA Protocol — The Commitment Engine on Base. Commit NARA, hold a tradable position NFT, and the NARAEngine distributes NARA emissions and contributed ETH across committed weight every 15-minute epoch. A Uniswap v4 hook can route a bounded fee from the registered pool into protocol liquidity or Genesis rewards.](docs/assets/how-it-works.png)

</div>

---

## What is NARA?

NARA is built around commitment. You commit a fixed-supply token for a chosen duration; the longer you
commit, the more **weight** your position carries; and the protocol distributes its reward streams —
NARA emissions and contributed ETH across committed weight **every 15-minute epoch**. Rewards are
variable, never promised, and can be zero. The deployed engine's generic ERC-20 notification surface
is intentionally disabled; see [Current State](docs/CURRENT_STATE.md).

A commitment isn't a database row you can't move — **it's an NFT**. You can sell it, fractionalize it, wrap
it into a liquid staking token, or borrow against it, all without breaking the underlying commitment.

And the value flywheel is built into the AMM itself: NARA's liquidity lives in a **custom Uniswap v4
pool** whose hook skims a small fee from every trade and routes that flow back to committers.

```
      commit NARA (time)  ──▶  weight  ──▶  NARA + contributed ETH each epoch
              ▲                                          │
              └──────── buy pressure + protocol fees ◀───┘  (Uniswap v4 hook → reward vault)
```

> **New here?** Read [`docs/NARA_V4_PROJECT_SCOPE.md`](docs/NARA_V4_PROJECT_SCOPE.md) — the cold-start
> map of the whole system.

---

## Table of contents

- [Status](#-status)
- [Architecture](#-architecture)
- [The five pillars](#-the-five-pillars)
- [How the engine works](#-how-the-engine-works)
- [The Uniswap v4 hook](#-the-uniswap-v4-hook)
- [Positions, Genesis & bonds](#-positions-genesis--bonds)
- [Composability layer](#-composability-layer)
- [Contract map](#-contract-map)
- [Build & test](#-build--test)
- [Security](#-security)
- [Deployment](#-deployment)
- [Documentation](#-documentation)
- [License](#-license)

---

## 🚦 Status

**Core deployed; liquidity not launched.** The v4 token, engine, and sealed reward reserve are on Base.
The originally registered Stage A hook, vault, and compounder are quarantined; their pool remains
uninitialized and must not be seeded. A corrected replacement liquidity trio must pass the documented
fresh-address gates before initialization. Canonical addresses and evidence:
[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).

---

## 🏗 Architecture

```mermaid
flowchart TD
    subgraph CORE[Core]
      T[NARAToken<br/>1,000,000 fixed supply]
      E[NARAEngine<br/>epochs · weight · rewards]
      R[NARARewardReserve<br/>sealed emission reserve]
    end
    subgraph LIQ[Liquidity]
      H[NARALiquidityGrowthHook<br/>Uniswap v4 · buy-weighted fee]
      V[NARALiquidityGrowthVault<br/>3 enabled routing modes]
      P((NARA / USDC<br/>v4 pool))
    end
    subgraph POS[Positions]
      NFT[NARAPositionNFTV4<br/>a commitment IS an NFT]
      ACC[NARAPositionAccountV4<br/>clone per position]
      G[Genesis + Bonds]
    end
    subgraph CMP[Composability]
      ST[stNARA staking pool]
      SY[Pendle SY adapter]
      FR[fractional positions]
    end
    subgraph RTR[Router / Lens]
      RT[NARARouter · DashboardLens · PositionDataLens · BribeRouter]
    end

    T --> E
    R --> E
    P --- H --> V --> E
    E --> NFT --> ACC --> E
    G --> NFT
    NFT --> ST --> SY
    NFT --> FR
    RT --> E
    E -->|NARA · ETH · ERC-20| U[Committers]
```

Build order is bottom-up, reveal order is top-down: `token → engine → liquidity → positions → composability`.
Full layer model and per-contract status: [`docs/NARA_V4_PROJECT_SCOPE.md`](docs/NARA_V4_PROJECT_SCOPE.md).

---

## 🧱 The five pillars

| Pillar | What it is |
|--------|-----------|
| **Token** | `NARAToken` — 1,000,000 fixed supply, minted once. ERC-2612 permit, ERC-1363 (`transferAndCall` to commit in one tx), capped ERC-3156 flash mint, multicall. |
| **Engine** | `NARAEngine` — the settlement core: JIT epoch advance and weight-based NARA/ETH accounting. Its generic ERC-20 rail exists in immutable code but is disabled for this deployment. |
| **Liquidity** | A fee-charging **Uniswap v4** pool (`NARALiquidityGrowthHook` + `NARALiquidityGrowthVault`) that turns swap fees into committer rewards. |
| **Positions** | `NARAPositionNFTV4` — a commitment *is* a tradable NFT, with Genesis tiers and a bond intake path. |
| **Composability** | `stNARA`, a Pendle SY adapter, and fractional position wrappers built on top of the position layer. |

---

## ⚙️ How the engine works

- **JIT epochs.** Time is divided into fixed (default 15-min) epochs. Epoch advancement is triggered
  *inside* user calls — no keeper cron. A single call bridges up to `MAX_JIT_ADVANCE = 8` epochs; past
  that, writes revert `EpochStale` until anyone calls `poke()` / `advanceEpochs()`. (Better failure
  shape than a cron dependency — but frontends must surface backlog.)
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

## 🦄 The Uniswap v4 hook

NARA's liquidity home is a **custom Uniswap v4 pool**. The hook is not a neutral fee — it is an
**asymmetric, buy-weighted fee** that funds committers, built the canonical v4 way.

- **Correct by construction.** `NARALiquidityGrowthHook is BaseHook`. `getHookPermissions()` declares
  `beforeInitialize + beforeSwap + beforeSwapReturnDelta`, which encode to a hook address ending in
  **`0x2088`** (`0x2000 | 0x80 | 0x08`) — mined via CREATE2 by `utils/Create2HookDeployer`. The
  declared permissions and the required address bits match exactly.
- **Asymmetric curves.** Buyers pay more under pressure than sellers (default buy 5→25%, sell 5→20%,
  across four pressure tiers). Buy pressure = `amountIn / depth`.
- **Deterministic pressure basis.** Each input currency uses its configured
  `protocolDepth`, captured on the first flow of the block. Live pool depth is
  monitoring telemetry only, and per-block cumulative fee deltas make a
  same-block split charge exactly the same aggregate fee as one gross input.
- **Fee skim, the v4 way.** The hook returns a `BeforeSwapDelta` and `poolManager.take()`s the fee in
  the input currency straight to the vault (best-effort accounting that never blocks a swap).
- **Vault routing (5 modes).** `NARALiquidityGrowthVault` routes collected fees: `Liquidity`
  (compound LP) · `Engine` (rewards) · `Split` · `Genesis` · `GenesisSplit`.

📄 Full expert deep-dive: **[`docs/UNISWAP_V4_HOOK.md`](docs/UNISWAP_V4_HOOK.md)**.

---

## 🎟 Positions, Genesis & bonds

- **A commitment is an NFT.** `NARAPositionNFTV4` mints an ERC-721 backed 1:1 by a minimal-clone account
  (`NARAPositionAccountV4`) that owns the underlying engine position. Transfer the NFT = transfer the commitment.
- **Genesis positions** carry a reward multiplier (capped 5×) and an optional `isEternal` flag;
  Eternal positions exit only via `burnEternalGenesis()` (auto-harvest → release → return principal → burn).
- **Bonds** (`NARABondDepositoryV4NFT`) sell NARA at a discount for ETH, delivered as a **vesting position
  NFT** that earns from day one. Bonds stay **closed at launch**, opened
  deliberately per [`docs/NARA_V4_BOND_OPENING_CRITERIA.md`](docs/NARA_V4_BOND_OPENING_CRITERIA.md).

Spec: [`docs/NARA_V4_NFT_POSITIONS.md`](docs/NARA_V4_NFT_POSITIONS.md).

---

## 🧩 Composability layer

Built and tested, deployed after the core proves out (needs TVL + a market):

- **stNARA** (`NARAStakingPoolV4`) — liquid staking token over a pool of max-duration positions;
  exchange rate rises as rewards compound. First deposit mints dead shares (inflation-attack safe).
- **Pendle SY adapter** (`NARAStakingPoolSYV4`) — implements Pendle's SY (Standardized-Yield) interface
  over stNARA, with two reward streams (USDC + native ETH) and the NAV oracle Pendle needs.
- **Fractional positions** (`NARAFractionalPositionV4`) — split one committed position into up to 1e12
  units, tradable/collateralizable without breaking the engine commitment.

---

## 🗺 Contract map

`contracts/v4/` — the only active source path. Full index with deploy steps: [`docs/V4_CONTRACT_INDEX.md`](docs/V4_CONTRACT_INDEX.md).

| Layer | Contracts |
|-------|-----------|
| **Core** | `NARAToken` · `NARAEngine` · `NARARewardReserve` · `NARALauncher` · `NARALiquidityGrowthHook` · `NARALiquidityGrowthVault` · `utils/Create2HookDeployer` |
| **Positions** | `NARAPositionNFTV4` · `NARAPositionAccountV4` · `NARAPositionRendererV4` · `NARAGenesisRewardDistributorV4` · `NARABondVaultV4` · `NARABondDepositoryV4NFT` · `NARAOpsVaultV4` |
| **Router / Lens** | `router/NARARouter` · `router/NARADashboardLens` · `router/NARAPositionDataLensV1` · dormant `router/BribeRouterV4` reference |
| **Composability** | `composability/NARAStakingPoolV4` · `NARAStakingPoolSYV4` · `NARAFractionalPositionV4` · `NARAFractionalPositionFactoryV4` |

---

## 🔨 Build & test

Hardhat project. **Node 20 requires the polyfill** on every command.

```bash
npm install

# compile
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat compile

# full suite — 468 passing on 2026-07-29
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test

# bytecode size gate
NODE_OPTIONS="--require ./polyfill.cjs" npm run size

# static analysis
npm run slither:v4
```

Toolchain: `solc 0.8.34`, EVM `cancun`, `via-ir`. This repo is **Hardhat only** — the NARA Baskets
package is a separate Foundry repo. (`remappings.txt` / `echidna/` here are static-analysis artifacts,
not a Forge setup.)

---

## 🔐 Security verification

| Gate | Latest evidence |
|------|-----------------|
| Hardhat test suite | **468 passing, 0 failing** on 2026-07-29 |
| Real Uniswap v4 path | Single-vs-split buy and sell equality through the actual PoolManager/test routers on 2026-07-29 |
| Slither | Completed with exit 0 on 2026-07-29; heuristic findings are recorded in `CURRENT_STATE.md` |
| Bytecode size | All deployable artifacts within EVM limits on 2026-07-29 |
| npm dependency audit | **0 high / 0 critical** on 2026-07-28; 8 low findings remain in Hardhat Verify's legacy Ethers v5 chain with no upstream fix |
| Echidna | **13/13** invariants on 2026-06-08, before the 2026-07-28 liquidity patch |
| Aderyn | Latest completed run is 2026-06-08; the 2026-07-29 rerun could not start because the binary is unavailable |

Design posture includes a sealed reward reserve, JIT liveness with explicit
`EpochStale` guards, immutable parameter caps, a quarantined Stage A liquidity
stack, and disabled deployed-engine ERC-20 notification. These are internal
verification results, not an independent audit or a production-readiness
claim. See [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) for open launch
gates.

> Automated analysis is necessary but not sufficient. An independent human / competitive review is
> planned before mainnet value. Disclosure policy: [`SECURITY.md`](SECURITY.md).

---

## 🚀 Deployment

Strict order (full runbook: [`docs/NARA_V4_LAUNCH_RUNBOOK.md`](docs/NARA_V4_LAUNCH_RUNBOOK.md), gates:
[`docs/V4_LAUNCH_CHECKLIST.md`](docs/V4_LAUNCH_CHECKLIST.md)):

1. `npm run deploy:v4:base:usdc` — core (token + engine + reserve + hook + vault), atomic via `NARALauncher`
2. `npm run verify:v4:preflight` — hook `0x2088` bits, pool/vault wiring
3. seed NARA/USDC liquidity → `npm run smoke:v4`
4. `npm run deploy:v4:allocations` — position NFT layer (bonds **closed**)
5. `npm run deploy:v4:router:lens` — safe router and read-only lens components;
   `BribeRouterV4` is intentionally skipped for the deployed engine
6. composability — only after core proves out
7. hand all roles to a Safe/timelock

Nothing is "done" until deployed addresses + verification are recorded in `CURRENT_STATE.md`.

---

## 📚 Documentation

| Doc | Purpose |
|-----|---------|
| [NARA_V4_PROJECT_SCOPE.md](docs/NARA_V4_PROJECT_SCOPE.md) | **Start here** — whole-project map, layers, status |
| [V4_CONTRACT_INDEX.md](docs/V4_CONTRACT_INDEX.md) | Every contract → purpose → deploy step |
| [CURRENT_STATE.md](docs/CURRENT_STATE.md) | Canonical live state (source of truth) |
| [UNISWAP_V4_HOOK.md](docs/UNISWAP_V4_HOOK.md) | Hook architecture deep-dive (`0x2088`, fee curves, anti-gaming) |
| [EMISSION_MECHANICS.md](docs/EMISSION_MECHANICS.md) | Adaptive emission model |
| [NARA_V4_NFT_POSITIONS.md](docs/NARA_V4_NFT_POSITIONS.md) | Position NFT + account + Genesis spec |
| [ROUTER_LENS.md](docs/ROUTER_LENS.md) | Router · lens · disabled `BribeRouterV4` reference |
| [ROADMAP.md](docs/ROADMAP.md) | Product direction and phases |

Full index: [`docs/README.md`](docs/README.md).

---

## ⚠️ Disclaimer

This repository is software, not financial advice or an offer of any product. NARA is a permissionless,
non-custodial protocol with no admin over user principal. Tokens and positions can lose **all** value.
Rewards are variable and are **never promised or guaranteed** — they can be zero. Nothing here is
investment advice, and no NARA entity manages assets or promises any return. You are solely responsible
for evaluating the protocol and complying with the laws of your jurisdiction. Pre-launch: nothing here
is deployed to mainnet.

---

## Community & contact

- 🌐 Website: **[naraprotocol.pro](https://naraprotocol.pro)**
- 🟣 Farcaster: **@naraprotocol**
- 𝕏 Twitter/X: **[@NARA_protocol](https://x.com/NARA_protocol)**
- 🔐 Security: **security@naraprotocol.pro** (see [SECURITY.md](SECURITY.md))

---

## License

[MIT](LICENSE) © NARA Protocol
