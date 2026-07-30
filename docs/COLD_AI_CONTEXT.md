# Cold AI Context

This document is for future AI agents and coders who open the NARA workspace
without the history in their context window.

## What NARA Is

NARA is a fixed-supply, time-preference yield protocol on Base. The active
design centers on locking NARA for weighted participation in NARA and ETH
reward flows. The deployed engine's optional ERC-20 notification path is
disabled. The v4 system is a fresh start, not a continuation
of the retired v3 mainnet contracts.

The protocol identity is larger than any one UI or launch surface:

- fixed supply NARA
- engine-managed lock positions
- native position NFTs for wrapped positions
- reward accounting through active v4 contracts
- bond inventory and NFT bond launch path
- liquidity growth components for protocol-owned liquidity
- future composability on top of locked positions

## Active v4 Architecture

The only active Solidity source tree is `contracts/v4/`.

Core active contracts:

- `NARAToken.sol`: fixed-supply token deployed in controlled Stage A at
  `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`.
- `NARAEngine.sol`: frozen core lock, reward, treasury fee, and emission engine,
  deployed at `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9`.
- `NARAPositionNFTV4.sol`: frozen core NFT wrapper/controller for positions.
- `NARAPositionAccountV4.sol`: account clone used by position NFTs.
- `NARAGenesisRewardDistributorV4.sol`: Genesis reward accounting.
- `NARABondVaultV4.sol`: bond inventory vault.
- `NARABondDepositoryV4NFT.sol`: intended NFT bond launch path.
- `NARABondDepositoryV4.sol`: raw-position bond path, not the preferred launch
  path.
- `NARALiquidityGrowthHook.sol`, `NARALiquidityGrowthVault.sol`, and
  `NARALiquidityCompounderV4.sol`: corrected replacement liquidity stack. It
  uses configured-depth block snapshots and permanently rejects Engine/Split
  vault routing.
- `NARAOpsVaultV4.sol`: capped operations vesting vault.
- `composability/`: staking, Pendle SY, and fractional position extensions.
- `router/`: periphery routers and lenses, including the monitored engine ops
  router.

If code and docs disagree, trust active Solidity source and current deployment
docs, then update docs separately.

## Frozen Core

`NARAEngine.sol` and `NARAPositionNFTV4.sol` are frozen core for normal work.
Do not edit them unless the user explicitly orders that exact core change.

Monitoring and observability should usually be added through:

- routers
- periphery contracts
- Ponder monitor handlers
- offchain scanners
- SQL views
- deterministic alert rules
- docs

Do not add events to frozen core just for monitor convenience. Do not change
helper signatures, storage layout, or role model for observability convenience.

## Historical And Deprecated

The v3 system is retired. Archived v3 code lives under `archive/legacy-v3/` and
is historical reference only. It must not be imported, redeployed, or described
as live.

Deprecated or out-of-scope assumptions:

- v3 token/engine/bond/NFT wrapper addresses are retired.
- jackpot/lotto is not active.
- mining is not active.
- old keeper/cron epoch assumptions are not active.
- old incident-stack v4 addresses are retired for public launch.
- hand-written ABIs are not the source of truth.

Use generated active v4 Hardhat artifacts for ABIs.

## Current deployment and launch scope

Controlled Stage A is deployed. The NARA/USDC pool is registered but
uninitialized and has no liquidity. The current launch product is NARA Baskets.
Position NFTs, bonds, router/lenses, lockboard, allocations, and composability
are deferred. Lotto, Arena, and the old cron are retired.

Before seeding, deploy and verify fresh hook/vault/compounder addresses from the
corrected source, then revoke `REWARD_NOTIFIER_ROLE` from the Stage A admin and
Stage A vault. No Safe, EOA, vault, or router may hold that role.

Do not repeat the core deployment. Do not invent addresses for deferred
contracts. Keep baskets in preview until verified deployment manifests exist.

## Monitor Stack

`../nara-swarm-monitor/` is the read-only monitor for the fresh v4 stack. It
indexes active v4 contracts through Ponder and records events, traces, failed
transactions, wallet intelligence, position intelligence, deterministic alerts,
Commander reports, and AI summaries.

The monitor never sends transactions and never holds private keys.

Current monitor flow:

`contracts -> Ponder -> schema tables -> views -> deterministic rules -> alerts -> Commander -> AI summary`

## Commander Agent

Commander v1 is deterministic read-only reporting. It reads monitor views and
alerts, assigns status using fixed rules, and produces a structured report.

Status rules:

- RED if any open severity 5 alert exists.
- YELLOW if any open severity 3 or 4 alert exists.
- GREEN if no open severity 3+ alert exists.

Commander does not query raw chain state directly, send transactions, resolve
alerts, change scores, or decide actions. It only reports.

## AI Summarizer

The AI summarizer may only read `commander_reports` and rewrite the already
built Commander report for human readability. The default provider is
`local_stub`, which makes no external API call.

The summarizer may not:

- read raw monitor tables or chain state
- invent evidence
- lower severity
- hide critical alerts
- create or resolve alerts
- change scores
- execute recommendations
- send transactions
- post publicly

If evidence is missing, it must say evidence unavailable.

## Deployment Safety

No AI agent may deploy contracts, call production contracts, or perform
production writes without explicit human approval.

Never ask for or print private keys, RPC secrets, API tokens, or deployment
secrets. It is acceptable to mention environment variable names.

Before any future deployment, run the documented v4 gates in this repository and
use only fresh v4 addresses from the active deployment output.

## How To Reason Without Hallucinating Old Features

When uncertain:

1. Start with `AGENTS.md`, `CLAUDE.md`, and `docs/CURRENT_STATE.md`.
2. Confirm active code under `contracts/v4/`.
3. Treat archive code as historical only.
4. Search for the exact active contract, event, or function in generated
   artifacts/source.
5. If a folder status is unclear, mark it unknown and ask for verification.
6. Do not infer v3, jackpot, mining, cron, or old UI behavior from names alone.
