# Cold AI Context

This document is for future AI agents and coders who open the NARA workspace
without the history in their context window.

## What NARA Is

NARA is a fixed-supply, time-preference yield protocol on Base. The active
design centers on locking NARA for weighted participation in NARA, ETH, and
approved ERC-20 reward flows. The v4 system is a fresh start, not a continuation
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
  `NARALiquidityCompounderV4.sol`: liquidity growth stack.
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
- old v3 keeper/cron assumptions are not active. The new guarded v4 operations
  workflow described below is active and must not be confused with the retired
  cron folder.
- old incident-stack v4 addresses are retired for public launch.
- hand-written ABIs are not the source of truth.

Use generated active v4 Hardhat artifacts for ABIs.

## Current deployment and launch scope

Controlled Stage A is deployed. The hardened replacement NARA/USDC pool is
initialized and seeded, and its replacement hook, vault, and compounder are
configured under Safe custody. The earlier Stage A pool is quarantined; do not
mix its addresses or state with the active replacement. The current launch
product is NARA Baskets, but the publishable app remains preview-only until
verified basket manager/adapter manifests exist. Position NFTs, bonds,
router/lenses, lockboard, allocations, and composability are deferred. Lotto,
Arena, and the old cron folder are retired.

Do not repeat the core deployment. Do not invent addresses for deferred
contracts. Keep baskets in preview until verified deployment manifests exist.

## Current v4 epoch and liquidity operations

The v4 engine is not indefinitely keeperless. User-facing calls can perform a
bounded just-in-time advance of at most eight epochs. If the backlog exceeds
that cap, lock-related calls revert with `EpochStale()` until permissionless
`advanceEpochs` maintenance catches up.

The active maintenance path is:

- workflow: `.github/workflows/v4-epoch-maintainer.yml`;
- cadence: every 30 minutes at `:07` and `:37` UTC;
- execution guard: repository variable
  `V4_OPERATIONS_KEEPER_ENABLED=true`;
- dedicated keeper: `0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7`;
- vault authority: restricted compounding only in the current `Liquidity`
  route mode; no owner, parameter, treasury, Safe, recovery, or arbitrary
  withdrawal authority;
- recovery evidence: transaction
  `0x906296a6041117a3ce1b895de291a221dcc5caad406f190ca548b7bf52854091`
  advanced epoch `475` to `484` at Base block `49366244`;
- independent post-state: workflow run `30654597591` confirmed epoch `484/484`,
  backlog `0`, frozen compounder, authorized keeper, and no liquidity
  transaction required;
- validation status: manual read-only and execute runs passed; the 48-hour
  scheduled-run soak remains open.

The engine's direct `emissionReserve()` may correctly read zero while
`rewardReserveAvailable()` reports the external `650,000 NARA` reserve.
`syncEmissionReserve()` registers untracked NARA held directly by the engine;
it is not required merely to make the direct-reserve number nonzero when the
untracked direct balance is zero.

Use `docs/CURRENT_STATE.md` and
`docs/releases/NARA-20260731-epoch-recovery.md` for the canonical detailed
evidence. Never copy RPC URLs or signing-key values from local configuration or
workflow secrets.

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
6. Do not infer v3, jackpot, mining, retired cron, or old UI behavior from names
   alone. Distinguish the retired cron folder from the active guarded v4 GitHub
   workflow.
