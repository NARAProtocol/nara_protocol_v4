# Developer guide

This guide is the shortest path from a clean checkout to understanding and
extending NARA v4.

## Establish the state boundary

Before reading an interface, read [`CURRENT_STATE.md`](CURRENT_STATE.md).

NARA has three distinct engineering surfaces:

1. deployed Stage A contracts;
2. implemented and tested modules that are not deployed;
3. historical contracts that are not active v4 code.

Do not infer deployment from the presence of source. Do not infer activation
from deployment.

## Run the local gates

```powershell
npm ci
npm run build
npm test
npm run size
```

No wallet or RPC is needed for these commands. A Base RPC is optional for fork
tests and read-only onchain verification.

| Compiler setting | Value |
|---|---|
| Solidity | `0.8.34` |
| EVM target | `cancun` |
| IR pipeline | enabled |
| Engine optimizer runs | `1` |
| Most other deployed contracts | `200` |

Always use generated Hardhat artifacts from the current checkout as the ABI
source. Do not copy an ABI from archived v3 code, a block-explorer search result,
or an earlier conversation.

## Follow one position

The most useful code-reading path is:

1. [`NARAToken.sol`](../contracts/v4/NARAToken.sol)
2. [`NARAEngineTypes.sol`](../contracts/v4/NARAEngineTypes.sol)
3. [`NARAEngine.sol`](../contracts/v4/NARAEngine.sol)
4. [`NARAEngineModelLib.sol`](../contracts/v4/libraries/NARAEngineModelLib.sol)
5. [`NARAEngineAccountingLib.sol`](../contracts/v4/libraries/NARAEngineAccountingLib.sol)
6. [`NARAPositionNFTV4.sol`](../contracts/v4/NARAPositionNFTV4.sol)
7. [`NARAPositionAccountV4.sol`](../contracts/v4/NARAPositionAccountV4.sol)

A direct engine position is identified by a global `positionId`. Its principal
and weight become active according to scheduled epochs. Cumulative indexes let
the engine account for NARA, ETH, and supported ERC-20 distributions without
iterating over all positions.

The NFT layer does not replace that model. A clone account owns the engine
position while the ERC-721 controls the account-facing lifecycle.

## Choose an integration pattern

### Read-only integration

Prefer lens contracts instead of reconstructing protocol state from many RPC
calls:

- `NARADashboardLens`
- `NARAPositionDataLensV1`
- `NARAProtocolStatsLensV1`
- `NARACirculatingSupplyV1`

The lenses are source-only until their deployment is recorded in
`CURRENT_STATE.md`. An integrator may deploy a read-only lens but must verify its
constructor inputs against the intended engine and token.

### Direct locking

The engine exposes `lock`, `lockFor`, `lockWithPermit`, and the ERC-1363
`onTransferReceived` entry point.

Integrations must surface amount, duration, minimum acceptable weight,
approvals, fees, and resulting unlock conditions before requesting a
transaction.

### Routed locking

`NARARouter` composes bounded epoch synchronization with permit-based locking.
Use it only after its exact deployment address and engine binding are verified.

### Reward notification

Native ETH enters through `notifyEthRewards()`. Supported non-NARA ERC-20
distributions enter through `notifyTokenRewards(token, amount)` and require
`REWARD_NOTIFIER_ROLE`.

`BribeRouterV4` can provide a permissionless funding surface, but only after the
router itself receives the required engine role. Source existence does not imply
that role has been granted.

### Position ownership

Integrators consuming position NFTs must model:

- ERC-721 ownership and approval;
- the clone account that owns the engine position;
- maturity and eternal-position behavior;
- reward-claim and extension state;
- the possibility that a receiver rejects ETH.

Never describe an NFT position as guaranteed liquid or equivalent to
immediately redeemable principal.

## Understand the liquidity boundary

The subsystem is divided into:

- `NARALiquidityGrowthHook`: Uniswap v4 hook behavior;
- `NARALiquidityGrowthVault`: collected-asset accounting and routing;
- `NARALiquidityCompounderV4`: exact-spend liquidity execution.

The compounder does not perform an internal swap. It supplies available token
amounts to a full-range position and banks remainders. Swap policy is therefore
not hidden inside the adapter.

The current pool is registered but uninitialized. Do not assume a price,
liquidity, an LP NFT, or working swaps.

## Extend periphery first

Before changing core accounting, consider whether the capability can live in:

- a view or lens;
- an event indexer;
- a router;
- a bounded adapter;
- monitoring;
- documentation or an executable example.

Core changes require explicit authorization, a threat-model update, regression
tests, fuzz properties, and synchronized documentation.

## Test by risk

| Change | Minimum verification |
|---|---|
| View or lens | Unit tests, boundary sizes, missing-position behavior |
| Router | Authorization, slippage, stale epoch, reentrancy, revert propagation |
| Token movement | Balance deltas, fee-on-transfer behavior, zero values, failures |
| Position lifecycle | Activation, extension, maturity, claim, unlock, ownership |
| Reward accounting | Solvency, rounding, index monotonicity, duplicate claims |
| Hook or liquidity | Delta assumptions, custody, size gate, Base-fork test |
| Admin configuration | Bounds, delays, cancellation, compromised-role worst case |
| Core engine | Full suite, invariants, bytecode size, static analysis, manual review |

Every confirmed security finding needs a source location and concrete
transaction or call sequence. Tool labels without evidence are leads.

## Submit the work

Follow [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and
[`REPOSITORY_MAINTENANCE.md`](REPOSITORY_MAINTENANCE.md).

Never include a private key, seed phrase, private RPC URL, `.env` content, or
production transaction in a contribution.

