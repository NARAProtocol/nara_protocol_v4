# NARA Protocol v4

[![NARA v4 CI](https://github.com/NARAProtocol/nara_protocol_v4/actions/workflows/ci.yml/badge.svg)](https://github.com/NARAProtocol/nara_protocol_v4/actions/workflows/ci.yml)
[![Solidity 0.8.34](https://img.shields.io/badge/Solidity-0.8.34-363636.svg)](https://docs.soliditylang.org/)
[![Base](https://img.shields.io/badge/network-Base-0052FF.svg)](https://base.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)

NARA v4 is an experimental protocol engineering stack for programmable
time-locked positions on Base.

The repository explores a simple primitive—commit tokens for a chosen duration,
receive deterministic participation weight—then builds extensible accounting,
liquidity routing, NFT-controlled positions, read layers, and optional
composability around it.

The interesting part for developers is not a token price. It is the protocol
surface:

- global position IDs with scheduled activation and deactivation;
- bounded just-in-time epoch advancement without a mandatory keeper;
- NARA, native ETH, and allowlisted ERC-20 distribution indexes;
- ERC-2612 and ERC-1363 lock entry paths;
- a Uniswap v4 hook, routing vault, and protocol-owned-liquidity compounder;
- position NFTs backed by isolated clone accounts;
- routers and lenses designed for one-transaction writes and low-round-trip
  reads;
- experimental pooled, standardized-yield, and fractional position modules.

This is software infrastructure, not investment advice, an offer, or a promise
of returns. Some modules are deployed, some are deliberately dormant, and some
are source-only experiments. Read [Current state](docs/CURRENT_STATE.md) before
integrating.

## Current state

Last documentation check: **2026-07-28**

| Layer | State |
|---|---|
| NARA v4 token | Deployed on Base |
| Engine and sealed reward reserve | Deployed |
| Liquidity hook, vault, and compounder | Deployed; pool remains uninitialized |
| Official NARA/USDC liquidity | Not added |
| Public locking and reward use | Not activated |
| Position NFT, bonds, routers, and lenses | Implemented in this repository; not deployed |
| Composability modules | Experimental source and tests; not deployed |
| Baskets | Separate Foundry repository; preview only |

Canonical addresses, transactions, operational limitations, and the distinction
between deployed and activated are maintained in
[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md). A smaller public verification
package is available in
[`NARAProtocol/nara_protocol`](https://github.com/NARAProtocol/nara_protocol).

## System map

```text
NARAToken
    │
    ├── NARAEngine ── NARARewardReserve
    │      │
    │      ├── direct positions
    │      ├── NARAPositionNFTV4 ── per-position clone accounts
    │      ├── NARARouter / operations router
    │      └── dashboard, position, protocol and supply lenses
    │
    ├── Uniswap v4 PoolManager
    │      └── NARALiquidityGrowthHook
    │              └── NARALiquidityGrowthVault
    │                      └── NARALiquidityCompounderV4
    │
    └── experimental composability
           ├── NARAStakingPoolV4
           ├── NARAStakingPoolSYV4
           └── fractional position factory + wrappers
```

### Engine

`NARAEngine` is the accounting core. A position records principal, duration,
activation epoch, unlock epoch, weight, and reward-index debt. Epoch transitions
apply scheduled weight changes and update cumulative indexes. User mutations
advance a bounded number of stale epochs; permissionless maintenance functions
can clear a larger backlog.

This design turns time commitment into a reusable accounting primitive without
requiring the token contract to contain protocol policy.

Start with:

- [`contracts/v4/NARAEngine.sol`](contracts/v4/NARAEngine.sol)
- [`contracts/v4/libraries/NARAEngineModelLib.sol`](contracts/v4/libraries/NARAEngineModelLib.sol)
- [`contracts/v4/libraries/NARAEngineAccountingLib.sol`](contracts/v4/libraries/NARAEngineAccountingLib.sol)
- [`docs/EMISSION_MECHANICS.md`](docs/EMISSION_MECHANICS.md)

### Liquidity rail

The Uniswap v4 rail separates observation, custody, and execution:

1. `NARALiquidityGrowthHook` applies the configured hook behavior.
2. `NARALiquidityGrowthVault` accounts for collected assets and selects a route.
3. `NARALiquidityCompounderV4` can add exact-spend, full-range liquidity without
   performing an internal swap.

The registered pool is currently uninitialized. These contracts being deployed
does not mean swaps or official liquidity are available.

Read [`docs/UNISWAP_V4_HOOK.md`](docs/UNISWAP_V4_HOOK.md).

### Position layer

`NARAPositionNFTV4` makes an engine position controllable through an ERC-721.
Each token uses an isolated clone account that owns the underlying engine
position. The NFT surface adds controlled transfers, claims, extensions,
metadata, Genesis attributes, and renderer modules without changing the engine's
global-ID model.

Read [`docs/NARA_V4_NFT_POSITIONS.md`](docs/NARA_V4_NFT_POSITIONS.md).

### Integration layer

The router and lens directory is intentionally periphery-first:

- `NARARouter` composes permit, epoch synchronization, and locking.
- `NARAEngineOpsRouterV1` exposes bounded maintenance helpers.
- `NARADashboardLens`, `NARAPositionDataLensV1`,
  `NARAProtocolStatsLensV1`, and `NARACirculatingSupplyV1` provide typed read
  models.
- `BribeRouterV4` is a permissionless funding wrapper whose engine call still
  depends on explicit notifier-role configuration.

These modules are implemented and tested but are not part of the deployed Stage
A surface.

## Build locally

Requirements:

- Node.js 20
- npm
- Git

```powershell
git clone https://github.com/NARAProtocol/nara_protocol_v4.git
cd nara_protocol_v4
npm ci
npm run build
npm test
npm run size
```

The Hardhat configuration loads `polyfill.cjs` through `NODE_OPTIONS` in CI.
If your local Node 20 environment requires the same workaround:

```powershell
$env:NODE_OPTIONS = "--require ./polyfill.cjs"
npm run build
npm test
Remove-Item Env:NODE_OPTIONS
```

No RPC endpoint or wallet is required for the default compile and unit-test
suite. Fork tests skip when a Base RPC is unavailable.

## Verification commands

| Command | Purpose |
|---|---|
| `npm run build` | Compile the active v4 Solidity tree |
| `npm test` | Run the full Hardhat test suite |
| `npm run test:v4` | Run token, engine, and liquidity suites |
| `npm run test:invariants:v4` | Run regression invariants |
| `npm run test:composability:v4` | Run experimental composability suites |
| `npm run size` | Enforce deployed-bytecode and initcode limits |
| `npm run slither:v4` | Run scoped Slither analysis |
| `npm run aderyn:v4` | Run Aderyn analysis |
| `npm run echidna:v4` | Run the engine property harness |

On the publication branch, the full unit suite and bytecode-size gate pass.
Static analyzers are useful evidence but are not substitutes for manual review.
See [`SECURITY.md`](SECURITY.md) for the exact security posture.

## Repository layout

| Path | Purpose |
|---|---|
| `contracts/v4/` | Active protocol and periphery contracts |
| `contracts/v4/router/` | Transaction composition and read models |
| `contracts/v4/composability/` | Experimental higher-order position modules |
| `test/` | Unit, regression, deployment-coverage, and optional fork tests |
| `echidna/` | Property harness and configuration |
| `scripts/` | Build, verification, deployment, and operational tooling |
| `deployments/` | Sanitized Stage A deployment evidence |
| `docs/` | Architecture, behavior, current state, risks, and runbooks |
| `audit-runs/` | Selected review and deployment records |

Use [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) for an integration path
and [`docs/V4_CONTRACT_INDEX.md`](docs/V4_CONTRACT_INDEX.md) for the complete
contract inventory.

## Build something

Good contribution and integration targets include:

- alternative indexers and event-derived position views;
- simulation and invariant harnesses for epoch/accounting behavior;
- read-only dashboards using the lens contracts;
- wallet-safe transaction previews for permit and ERC-1363 paths;
- adapters that consume position NFTs without taking hidden custody;
- monitoring for role, reserve, pool, hook, and epoch-state changes;
- documentation and executable examples for third-party integrators.

Deployment and activation are separate governance and operational decisions.
An implemented module must not be described as live until its address and state
are verified in `docs/CURRENT_STATE.md`.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a change. Every pull
request must include:

- the behavior or documentation being changed;
- source, test, or onchain evidence;
- affected threat assumptions;
- commands run and results;
- confirmation that no secret or production transaction is included.

Security vulnerabilities must be reported privately according to
[`SECURITY.md`](SECURITY.md), not opened as public issues.

## License and risk

The source is provided under the [MIT License](LICENSE).

NARA is experimental smart-contract software. Contracts, tokens, positions,
integrations, and interfaces may contain defects or change before activation.
Crypto assets can lose all value, transactions can be irreversible, and
liquidity can be unavailable. Nothing in this repository is legal, tax, or
financial advice, and nothing here recommends acquiring or using a token.
