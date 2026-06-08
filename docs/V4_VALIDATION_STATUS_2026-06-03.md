# NARA v4 Validation Status — 2026-06-03

Status: local v4 code hardening pass completed. Fresh mainnet deployment is still
blocked until operator-provided fresh v4 addresses exist and post-deploy live
preflight/smoke checks pass.

## What Changed In This Pass

- `NARAEngine` keeps closed position token-reward metadata after principal
  unlock by setting `amount = 0` but preserving owner, weight, activation epoch,
  and unlock epoch. Eligible non-NARA token rewards earned before unlock remain
  claimable after principal exits.
- `NARAPositionNFTV4` rejects token reward receivers equal to the clone account,
  records closed-position reward ownership during unlock/burn, and exposes
  `claimClosedTokenRewards`.
- `NARAPositionAccountV4` allows factory-routed token reward claims after the
  underlying engine position is unlocked, and adds factory-gated `sweepToken`.
- `NARAStakingPoolV4` emergency NARA/USDC/ETH withdrawals are now
  `nonReentrant`, in addition to existing shutdown and emergency-role gates.
- v4 launch config tests now enforce that retired incident-stack defaults fail
  closed unless `V4_ALLOW_RETIRED_DEFAULTS=1` is explicitly set for recovery.
- `verifyV4Preflight.ts` now treats preflight findings as launch blockers.
- `runMainnetLaunchGates.ps1` refuses `V4_ALLOW_RETIRED_DEFAULTS=1` during
  launch gates.
- Allocation, reserve-funding, and role-batch helper scripts no longer silently
  fall back to stale mainnet addresses.
- `CLAUDE.md` and the historical composability report were corrected so retired
  v3 contracts are not described as live/current.

## Checks Run

All commands below were run from `nara-protocol-hardhat/` with
`NODE_OPTIONS="--require ./polyfill.cjs"` where Hardhat needed it.

| Check | Result |
| --- | --- |
| `npm run build` | Pass |
| targeted tests | Pass: `80 passing` |
| `npm test` | Pass: `332 passing` |
| `npm run size` | Pass. `NARAEngine` deployed bytecode is `24532` bytes; limit is `24576` |
| `npm run slither:v4` | Pass as tool execution. Active v4 target list scanned |
| `npm audit --audit-level=high` | Pass earlier in this run; only low/moderate dev dependency issues reported |
| `npm run verify:v4:preflight` | Blocked/fails correctly without fresh `V4_*` launch env |
| `npm run aderyn:v4:only` | Blocked: Aderyn binary not available in working Windows/WSL env |
| `npm run echidna:v4:smoke` | Blocked: configured WSL distro path is broken/missing VHDX |

## Slither Status

`npm run slither:v4` scans only active `contracts/v4/` targets and clears stale
reports before each run.

Current detector totals:

- High: `9 arbitrary-send-eth`, `8 reentrancy-eth`, `2 reentrancy-balance`,
  `1 uninitialized-state`
- Medium: `37 incorrect-equality`, `20 unused-return`, `11 reentrancy-no-eth`,
  `4 uninitialized-local`

Manual multi-agent triage found the listed Highs to be guarded/intentional or
Slither false positives:

- Role-gated rescue/treasury ETH sends are not public drains.
- Main external-call flows are `nonReentrant`.
- `NARAEngine._tokenIndexCheckpoints` is a valid mapping to dynamic arrays and
  is written by `_writeTokenIndexCheckpoint`.
- Liquidity vault compounder routes are keeper/route-mode constrained and
  require exact token/base consumption.

Do not delete Slither findings from reports. Keep them as review inputs and
maintain exploit regression tests around the flagged paths.

## Remaining Launch Blockers

1. Fresh v4 deployment addresses are not set. Required before live preflight:
   `V4_NARA_TOKEN`, `V4_ENGINE`, `V4_HOOK`, `V4_VAULT`, `V4_POOL_ID`,
   `V4_LP_TOKEN_ID`, plus any allocation addresses for allocation verification.
2. Post-deploy live checks must pass:
   `npm run verify:v4:preflight`, liquidity seed/smoke scripts, allocation
   verification, and Basescan verification.
3. Aderyn and Echidna are not currently runnable because local WSL/tooling is
   broken. Fix WSL or run those tools in a clean Linux environment before mainnet
   TVL.
4. Engine reward-index rounding dust remains a known residual accounting risk.
   Add an invariant/fuzz harness for non-divisible NARA/ETH distributions across
   changing active weights before high-TVL launch.
5. Genesis reward claims are still a hard precondition in NFT unlock/burn paths.
   Test distributor/token failure modes and decide whether a bypass path is
   required before broad public use.
6. Admin/Safe sequencing still needs operator confirmation. Allocation scripts
   may require temporary roles or Safe batch calldata if the deployer renounces
   core roles before allocation wiring.

## Correct Gate Order

Pre-deploy:

```powershell
npm run build
npm test
npm run size
npm run slither:v4
```

Post-deploy after fresh env sync:

```powershell
npm run verify:v4:preflight
npm run smoke:v4
npm run verify:v4:allocations
npm run launch:gates
```

Never run launch gates with `V4_ALLOW_RETIRED_DEFAULTS=1`. That flag is
recovery-only.

## Verdict

Needs fixes before deploy.

The local v4 codebase is materially safer after this pass and passes build,
tests, size, and Slither execution. It is not mainnet-ready until fresh
deployment env exists, live preflight/smoke checks pass, Aderyn/Echidna or
equivalent external static/fuzz checks are run, and the residual reward-rounding
and Genesis-claim liveness tests are addressed.
