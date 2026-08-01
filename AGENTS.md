# NARA Protocol — Universal Agent Context

This file is read by AI coding assistants that look for `AGENTS.md` on entry (OpenAI Codex, Cursor, DeepSeek, Gemini, and others). The companion file [CLAUDE.md](CLAUDE.md) carries the same context framed for Claude / Anthropic models.

Last updated: 2026-08-01.

## Cross-Repository Role

This repository is the upstream engineering authority for
`NARAProtocol/nara_protocol_v4`. Protocol contracts, ABIs, events, artifacts,
deployment scripts, and protocol manifests originate here.

For a change that affects another NARA repository:

1. finish and test the protocol change here;
2. merge it through protected CI and record the full origin commit;
3. record verified deployment evidence when the change is deployed;
4. then update `nara_protocol_v4_baskets` and `nara-swarm-monitor` as direct
   consumers;
5. update `nara_protocol` public documentation last.

In the FIELD workspace, read
`../docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md` before a multi-repository
change. `../nara_protocol_v4_publication/` is a secondary checkout of this same
GitHub remote, not a second source of truth. Never copy uncommitted source,
artifacts, manifests, or addresses between the two working trees.

Every downstream handoff records a change ID, this repository's full commit,
artifact or ABI source, evidence state, deployment manifest and verification
block when applicable, test results, and unresolved risks.

## 🚨 v4 RESET — READ FIRST

On **2026-05-27** the project committed to a clean fresh start on the v4 stack.

- **Deployed/recovery code path:** `contracts/v4/`. The active compile also
  contains a local, undeployed complete-stack V5 contract candidate under
  `contracts/v5/`. Never describe the V5 source as deployed,
  production-approved, audited, or an immutable release.
- **Archived:** `archive/legacy-v3/` — the entire v3 protocol stack (token, engine, bond, NFT wrapper, reward reserve) plus all v3 satellites (Arena, Lotto, MisterMint, Sponsor Hub) was moved here. It is frozen.
- **Deployed V4 recovery token:** the fresh V4 `NARAToken` is deployed on Base at
  `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`. The v3 mainnet token
  `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` is **retired**.
- **Read-first liquidity state:** read
  `docs/NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md` before any pool, fee,
  liquidity, recovery, or basket-activation work. The 2026-07-30 NARA/USDC pool
  is initialized, liquid, and trading, but the complete v4 stack is slated for
  retirement in favor of a separate complete V5. Human Safe signers executed
  the no-movement Stage-0 `WindDown` proposal on 2026-07-31; the dedicated old
  compound keeper is revoked and the ETA is
  `2026-08-07T22:00:35Z`. Nothing moves automatically at maturity.
- **V5 complete-stack scope:** V5 is a separate new token, engine, reserve,
  protocol-module, liquidity, pool, custody, tooling, monitor, and integration
  release. Preserve current v4 addresses only as recovery/retirement sources;
  do not rerun v4 deployment bytecode and do not call old addresses V5. Read
  `docs/NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md`. Production deployment still
  requires separate explicit human approval.
- **V5 work priority:** Hook V5 is first. The full reset is primarily driven by
  lessons from the live ladder, sells, shallow depth, directional fees, and
  compounding. A fresh Token, Reserve, Engine, position/modules/periphery,
  Vault, named-POL custody, no-swap Compounder, phase Controller, Hook, seed
  initializer, Uniswap V4 position adapter, CREATE2 factory, and offline
  deterministic deployment planner now exist locally. Their implementation and
  review disposition are recorded in
  `docs/NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md`. This is a tested
  candidate, not a release. Human-selected economics/custody/allocations,
  protected router/Quoter and basket integration, an immutable origin commit,
  independent review, and the actual disposable one-hour deployment and full
  retirement proof remain hard blockers before any distinct seven-day-or-longer
  production deployment.
- **V5 bond baseline:** Before bond work, read
  `docs/NARA_V5_DEPLOYMENT_DECISION_RECORD.md`. The local canonical NFT-bond
  candidate is one-campaign, exact-capacity, initially unfunded, and closed.
  Do not fund, queue, activate, or describe it as approved. Its immutable
  allocation/price/term/lock choices and fixed-price versus oracle/TWAP policy
  still require explicit evidence and human approval; unsold inventory follows
  only the sealed delayed-recovery path.
- **Eventual product scope:** NARA Baskets only, after the complete V5 gates
  pass. Baskets remain preview-only today. Lockboard and composability are
  deferred; Lotto and Arena are retired.
- **Retiring-v4 findings:** read
  `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md` before changing or
  operating the deployed v4 hook, vault, compounder, fee collector, seed flow,
  or basket limits. Its configured-depth fee basis is v4 recovery history, not
  a V5 requirement. V5 preserves exact opening-price and reciprocal sealed
  binding guarantees, but must not copy the fixed `300 USDC` / `60,000 NARA`
  `protocolDepth` calibration or the v4 ERC-20 Engine notifier path.
- **Other retired Base mainnet addresses** are listed in `archive/legacy-v3/README.md`. Do not surface them as "live" or "current" in any output.

## Rules of engagement

1. When the user asks about deployed NARA state, default to the **v4** recovery
   answer. When the user asks about the redesign, use the undeployed V5 source
   and its review record. Never blend V4 addresses with V5 plans.
2. Do not import anything from `archive/legacy-v3/` into active code paths.
3. Do not modify files in `archive/legacy-v3/` without explicit user direction.
4. Do not redeploy any archived contract. The archive is reference material, not deployable code.
5. Satellites with **no v4 equivalent yet** (Arena, Lotto, MisterMint, Sponsor Hub) are documented in `archive/legacy-v3/PORTING_ROADMAP.md`. Porting produces a **new** file under `contracts/v4/`, not an edit to the archive.

## Cold AI Guardrails

- Do not reintroduce mining.
- Do not reintroduce jackpot/lotto behavior.
- Do not reintroduce old keeper/cron assumptions.
- Do not edit `contracts/v4/NARAEngine.sol` unless the user explicitly orders
  that exact core edit.
- Do not edit `contracts/v4/NARAPositionNFTV4.sol` unless the user explicitly
  orders that exact core edit.
- Prefer periphery, routers, lenses, monitors, views, and docs over frozen core
  edits.
- AI agents are read/report only unless the user explicitly changes that scope.
- Never ask for, print, or store private keys.
- Do not send transactions or perform production writes without explicit human
  approval.
- Do not deploy contracts without explicit human approval.
- Use generated active-v4 Hardhat artifacts as the ABI source of truth for
  deployed v4 recovery work. Future V5 consumers may use only generated V5
  artifacts from an immutable reviewed origin commit and verified manifest.

## UI/UX rule for financial surfaces

When protocol work touches docs, apps, dashboards, basket flows, bond flows,
lock flows, or any other value-bearing UI, follow the workspace-level neutral
action hierarchy in `../docs/UI_UX_NEUTRAL_ACTION_HIERARCHY.md`.

Core rule: do not decide the asset for the user. Decide the navigation for the
user.

- Make the next action obvious.
- Keep comparable asset/product choices visually equal.
- Treat every token, basket, lock, bond, buy, sell, conversion, claim, and exit
  as a self-directed value-bearing action.
- Do not label any basket, token, bond, or position as recommended, best,
  safest, popular, beginner-friendly, highest return, or low risk.
- Do not use suitability labels, managed-investment framing, risk profiling,
  projected-return promises, or optimized-choice language.
- Do not claim safety, protection, insurance, regulator approval, guaranteed
  yield, or reduced risk unless the exact wording is legally reviewed.
- Do not use stars, green arrows, winner badges, preferential sizing, or sorting
  that implies one value-bearing choice is better.
- Use neutral flow copy: `View Basket`, `Continue`, `Back`, `Review before
buying`, `Confirm Buy`, `Confirm Exit`.
- Before confirmation, show what the user chose, the relevant fees/risks, and
  that the user is choosing for themselves. Include slippage/deadline,
  approvals, expected output, and exits where relevant.

## Where to find things

| Concern                                | Path                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| v4 contract sources                    | `contracts/v4/`                                                   |
| v4 test suite                          | `test/` (root) + `test/composability/`                            |
| v4 deploy/verify/sync scripts          | `scripts/` (root)                                                 |
| v4 ops, product, audit docs            | `docs/`                                                           |
| v4 canonical state document            | `docs/CURRENT_STATE.md`                                           |
| liquidity-reset cold handoff           | `docs/NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md`                    |
| complete V5 redeployment plan          | `docs/NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md`                    |
| undeployed complete-stack V5 candidate | `contracts/v5/`                                                   |
| V5 Hook/stack review evidence          | `docs/NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md`           |
| V5 parameter-neutral depth economics   | `docs/NARA_V5_DEPTH_ECONOMICS_2026-08-01.md`                      |
| v4 launch checklist                    | `docs/V4_LAUNCH_CHECKLIST.md`                                     |
| v4 protocol safety standards           | `CLAUDE.md` (this folder) → "MANDATORY PROTOCOL SAFETY STANDARDS" |
| v3 archived sources                    | `archive/legacy-v3/contracts/`                                    |
| v3 archive policy + retired addresses  | `archive/legacy-v3/README.md`                                     |
| v3 → v4 port roadmap                   | `archive/legacy-v3/PORTING_ROADMAP.md`                            |

## v4 protocol surface (quick reference)

| Concern                             | Contract                          | File                                                             |
| ----------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| Token                               | `NARAToken`                       | `contracts/v4/NARAToken.sol`                                     |
| Core engine                         | `NARAEngine`                      | `contracts/v4/NARAEngine.sol`                                    |
| Position NFT                        | `NARAPositionNFTV4`               | `contracts/v4/NARAPositionNFTV4.sol`                             |
| Position account (clone)            | `NARAPositionAccountV4`           | `contracts/v4/NARAPositionAccountV4.sol`                         |
| Genesis reward distributor          | `NARAGenesisRewardDistributorV4`  | `contracts/v4/NARAGenesisRewardDistributorV4.sol`                |
| Bond vault                          | `NARABondVaultV4`                 | `contracts/v4/NARABondVaultV4.sol`                               |
| Bond depository (raw)               | `NARABondDepositoryV4`            | `contracts/v4/NARABondDepositoryV4.sol`                          |
| Bond depository (NFT) — launch path | `NARABondDepositoryV4NFT`         | `contracts/v4/NARABondDepositoryV4NFT.sol`                       |
| Uniswap v4 liquidity hook           | `NARALiquidityGrowthHook`         | `contracts/v4/NARALiquidityGrowthHook.sol`                       |
| Uniswap v4 fee vault                | `NARALiquidityGrowthVault`        | `contracts/v4/NARALiquidityGrowthVault.sol`                      |
| Ops vesting vault                   | `NARAOpsVaultV4`                  | `contracts/v4/NARAOpsVaultV4.sol`                                |
| Composability — staking pool        | `NARAStakingPoolV4`               | `contracts/v4/composability/NARAStakingPoolV4.sol`               |
| Composability — Pendle SY           | `NARAStakingPoolSYV4`             | `contracts/v4/composability/NARAStakingPoolSYV4.sol`             |
| Composability — fractional position | `NARAFractionalPositionV4`        | `contracts/v4/composability/NARAFractionalPositionV4.sol`        |
| Composability — fractional factory  | `NARAFractionalPositionFactoryV4` | `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol` |
| Launcher (one-shot atomic)          | `NARALauncher`                    | `contracts/v4/NARALauncher.sol`                                  |

## Build, test, and gate commands

All commands run from `nara-protocol-hardhat/`. Node 20 requires the polyfill:

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat compile
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test

npm run build              # hardhat compile
npm run test               # hardhat test (active V4 + local V5 suites)
npm run test:v4            # Token + Engine + Liquidity Growth
npm run test:hook:v5       # local undeployed Hook V5 suites
npm run test:bond:v4
npm run test:bond-nft:v4
npm run test:nft:v4
npm run test:composability:v4
npm run test:invariants:v4
npm run size               # compiled-runtime/creation size check
npm run slither:v4         # static analysis
npm run aderyn:v4          # static analysis
npm run echidna:v4         # fuzz harness
npm run launch:gates       # combined local launch gate
```

## Mandatory protocol safety standards

See [CLAUDE.md](CLAUDE.md) → "MANDATORY PROTOCOL SAFETY STANDARDS" for the full rules. The four cornerstones:

1. Deployed-v4 ETH rewards may route through `NARAEngine.notifyEthRewards()`.
   Do not grant
   `REWARD_NOTIFIER_ROLE` or call `notifyTokenRewards(token, amount)` on the
   deployed v4 engine: a post-notification active-position extension can make
   its live denominator exceed the frozen per-position claim basis. Pool ERC-20
   fees route only through `Liquidity`, `Genesis`, or `GenesisSplit`; the
   retiring v4 vault permanently rejects `Engine` and `Split`. V5 must not reuse
   that ERC-20 notifier: Hook V5 accrues both currencies to its bound Vault;
   `BootstrapLiquidity` classifies 100% to liquidity, and later `Shared` routing
   may send only an immutable human-approved share `X` to the fresh V5 Engine.
2. Every `onlyOwner` setter has a hard-coded min/max cap.
3. State-changing external-call surfaces use `nonReentrant` or an audited
   protocol-specific equivalent such as Hook V5's transient callback/context
   guard.
4. All admin functions have a comment explaining worst-case impact.

## When to escalate to the user

- If a v4 contract surface is not what this file claims (function name, parameter, return type), trust the source, update this file's table accordingly in a follow-up edit, and tell the user.
- If you find yourself wanting to import from `archive/legacy-v3/`, stop and ask the user — almost always the right answer is to port to v4 instead.
- If you find a v3 mainnet address referenced as "live" anywhere in active docs after this reset, flag it. The reset's promise is that v3 addresses are documented exclusively as "retired" in active docs.
