# Cold AI Context

> **Mandatory current-state redirect (2026-08-01):** Read
> [NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md)
> before using this document for liquidity work. The older deployment section
> below is historical: the 2026-07-30 pool is active but retiring and Stage 0 is
> executed. V5 is a separate complete new token, engine, reserve, modules,
> liquidity, custody, tooling, monitor, and integration stack. Current v4
> addresses remain only as recovery/retirement sources.

This document is for future AI agents and coders who open the NARA workspace
without the history in their context window.

## What NARA Is

The deployed V4 recovery system is a fixed-supply, time-preference protocol on
Base centered on locking NARA for weighted participation in NARA and ETH reward
flows. Its optional ERC-20 notification path is disabled. The complete V5
token, Engine model, allocations, and production parameters remain a separate
undeployed release; do not infer them from this V4 description.

The protocol identity is larger than any one UI or launch surface:

- fixed supply NARA
- engine-managed lock positions
- native position NFTs for wrapped positions
- reward accounting through deployed v4 recovery contracts
- bond inventory and NFT bond launch path
- liquidity growth components for protocol-owned liquidity
- future composability on top of locked positions

## Deployed V4 Architecture — Recovery Only

`contracts/v4/` remains the only deployed/recovery Solidity source tree.
`contracts/v5/` now contains a local, undeployed complete-stack V5 contract
candidate. Read
[NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md](NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md)
and
[NARA_V5_DEPTH_ECONOMICS_2026-08-01.md](NARA_V5_DEPTH_ECONOMICS_2026-08-01.md)
before describing or changing its liquidity policy. The local source includes a fresh fixed-supply
token, reserve, Engine, canonical positions and selected modules/periphery, Hook,
Vault, named-POL custody, no-swap Compounder, phase Controller, seed initializer,
real Uniswap V4 position adapter, CREATE2 factory, and offline deployment
planner. It is not deployed, audited, production-approved, or an immutable
release.

### Local V5 candidate truth

- A complete selected contract candidate is locally implemented and tested, but
  no V5 production deployment, approved manifest, address, pool, or availability
  claim exists. The actual disposable one-hour deployment/retirement rehearsal
  has not happened.
- Its fixed per-leg phases are `15%`, `12.5%`, `10%`, `7.5%`, and `5%`, charged
  symmetrically on gross input and actual AMM output. Bootstrap is a 27.75%
  sequential hook-only toll before the 0.30% LP fee and price impact.
- V5 has no fixed `300 USDC` / `60,000 NARA` `protocolDepth`. Those values are
  historical V4 configuration only. V5 phase milestones must use named, active,
  protocol-owned, recovery-locked liquidity. Absolute thresholds remain
  unapproved until target trade sizes/execution ratios and concentrated-range
  Quoter sweeps are frozen.
- Routing is `Hook -> Vault`. The required one-way Vault state is
  `Unbound -> BootstrapLiquidity -> Shared -> Retired`: Bootstrap permanently
  classifies 100% of both fee currencies for liquidity; Shared may route only
  an immutable human-approved share `X` of post-transition fees to a fresh V5
  Engine. `X` is not approved. Shared entitlement is fixed synchronously at the
  swap; delayed PoolManager-claim redemption only backs that entitlement and
  cannot let a later locker capture earlier fees. Stale Engine epochs route the
  Engine share inactive instead of blocking swaps or rewarding expired weight.
- Never reuse the V4 generic ERC-20 Engine notifier or
  `syncEmissionReserve()` pattern for V5.
- V4Quoter exact-input output already includes the Hook's output-leg fee. Never
  subtract it twice. The local unsigned `v5ProtectedSwapPlan` builder binds the
  route and V1 protection envelope, but production Universal Router calldata,
  approved Quoter/dependency evidence, and basket integration remain open.

Deployed/recovery V4 contracts and source:

- `NARAToken.sol`: fixed-supply token deployed in controlled Stage A at
  `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`.
- `NARAEngine.sol`: frozen core lock, reward, treasury fee, and emission engine,
  deployed at `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9`.
- `NARAPositionNFTV4.sol`: frozen core NFT wrapper/controller for positions.
- `NARAPositionAccountV4.sol`: account clone used by position NFTs.
- `NARAGenesisRewardDistributorV4.sol`: Genesis reward accounting.
- `NARABondVaultV4.sol`: bond inventory vault.
- `NARABondDepositoryV4NFT.sol`: historical V4 intended NFT bond launch path;
  not approved or automatically carried into V5.
- `NARABondDepositoryV4.sol`: raw-position bond path, not the preferred launch
  path.
- `NARALiquidityGrowthHook.sol`, `NARALiquidityGrowthVault.sol`, and
  `NARALiquidityCompounderV4.sol`: retiring July-30 V4 liquidity stack. It uses
  configured-depth block snapshots and permanently rejects Engine/Split vault
  routing; do not redeploy or reuse it for V5.
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

Use generated active-v4 Hardhat artifacts for deployed-v4 recovery work.
Future V5 integrations may use only generated V5 artifacts from an immutable
reviewed origin commit and verified deployment manifest.

## Current V4 Recovery And Future V5 Scope

Controlled Stage A and the corrected July-30 V4 liquidity trio are deployed.
The July-30 NARA/USDC pool is initialized, liquid, and still tradeable, but it
is a recovery/retirement source rather than a launch candidate. Human Safe
signers executed the no-movement Stage-0 recovery proposal; the dedicated old
compound keeper is revoked, the seven-day `WindDown` is pending, and maturity
moves nothing automatically. A separately reviewed atomic Safe withdrawal is
still required.

Do not seed or redeploy V4. No V5 production contract or address exists. The
local V5 candidate still requires human-frozen economics, allocations and
custody; an immutable reviewed origin commit; production manifests and protected
integrations; independent review; the actual one-hour rehearsal and complete
retirement proof; and separate approval for a fresh production deployment with
recovery sealed at seven days or longer. Keep
baskets in preview until verified V5 deployment and integration evidence exist.

## Monitor Stack

`../nara-swarm-monitor/` is the read-only monitor for the deployed v4 recovery
stack. It
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

Use documented V4 commands only for V4 recovery or historical verification.
Before any future V5 deployment, first create and approve V5-specific gates,
generated artifacts, deterministic builders, and a verified manifest. Never run
V4 preflight or deployment scripts against planned V5 addresses.

## How To Reason Without Hallucinating Old Features

When uncertain:

1. Start with `AGENTS.md`, `CLAUDE.md`, the V5 cold handoff, and
   `docs/CURRENT_STATE.md`.
2. Use `contracts/v4/` for deployed recovery facts and `contracts/v5/` only for
   the local undeployed redesign. Never blend their addresses or ABIs.
3. Treat archive code as historical only.
4. Search for the exact active contract, event, or function in generated
   artifacts/source.
5. If a folder status is unclear, mark it unknown and ask for verification.
6. Do not infer v3, jackpot, mining, cron, or old UI behavior from names alone.
