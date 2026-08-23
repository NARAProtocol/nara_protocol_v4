# NARA Protocol — Universal Agent Context

This file is read by AI coding assistants that look for `AGENTS.md` on entry (OpenAI Codex, Cursor, DeepSeek, Gemini, and others). The companion file [CLAUDE.md](CLAUDE.md) carries the same context framed for Claude / Anthropic models.

Last updated: 2026-08-09.

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

## 🚨 v4 STACK ONLY — FIXED PRODUCTION RELEASE

- **Active release stack:** `contracts/v4/` is the **only** maintained and authoritative contract source. Historical Base deployments are incident/recovery evidence, not the fresh release manifest. All experimental protocol V5 files and folders have been completely eliminated.
- **NARALiquidityGrowthHook:** Hardened with 7-day governance timelocks (`FEE_UPDATE_DELAY = 7 days`), 20% max default operational fee caps, aligned floor rounding, and direct vault fee recording.
- **Sniper Liquidity Bootstrapping:** The pressure accumulator is explicitly
  per-block. Same-block Block-0 flow aggregates across callers and can reach the
  20% buy tier; a trader can reset pressure by waiting for another block. Hook
  fees are input-currency-only, so buy-only USDC fees remain banked until
  matching NARA exists. A keeper compounds only balanced inventory into POL.
  Do not claim persistent cross-block split resistance or instant POL from
  one-sided fees.
- **Archived:** `archive/legacy-v3/` — frozen v3 legacy code.
- **Fresh v4 activation:** the canonical Base `NARAToken` is
  `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1`, Engine is
  `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC`, Vault is
  `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`, Hook is
  `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088`, and wired Compounder is
  `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF`. Pool ID
  `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`
  was atomically seeded in Base transaction
  `0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`;
  Safe-owned LP NFT is `2898124`. Read
  `deployments/v4-production-activation-2026-08-09.json` and
  `deployments/v4-compounder-activation-2026-08-09.json` before using any
  address or liquidity state.
- **Activation boundary:** the pool/tax path is active, the sampled and
  same-block live tax paths reconciled, and the bounded Compounder validation
  minted Compounder-owned LP NFT `2898486` with liquidity `9455824137787`.
  The Vault binding is permanently frozen to the deployed Compounder. Engine
  backlog recovery succeeded, and the separately hardened epoch maintainer is
  active on its bounded twice-hourly schedule. Liquidity maintenance remains
  disabled. Raw lock/activation/unlock and post-fee lock paths are exercised;
  post-fee unlock and positive ETH-allocation claim evidence remain pending.
  Baskets remain preview-only. Do not claim whole-stack production readiness.
- **Read-first liquidity state:** read `docs/CURRENT_STATE.md`,
  `docs/releases/NARA-20260809-v4-production-activation.md`,
  `docs/releases/NARA-20260809-v4-compounder-activation.md`,
  `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`,
  `docs/UNISWAP_V4_HOOK.md`, and `docs/V4_LAUNCH_CHECKLIST.md` before pool,
  fee, liquidity, recovery, or basket-activation work. Do not use deleted V5
  plans or sources as instructions.
- **Historical withdrawal completed:** human Safe signers retired the 2026-07-30
  NARA/USDC pool on 2026-08-08 in Base transaction
  `0xd3b4c1790b586c399e48307afa3c282a279ac395212f0242a98835781a430523`.
  The old pool active liquidity, Vault, and Compounder are zero; both LP NFTs
  are burned; the recovery is cleared; and the sealed reserve is unchanged.
  Never replay the consumed Safe batch, re-propose its `WindDown`, or use those
  historical addresses as a current manifest.
- **GitHub operations boundary:** workflow `324678194` (`NARA v4 epoch
  maintainer`) was explicitly reactivated on 2026-08-14 after backlog recovery,
  dedicated-key provisioning, heartbeat setup, and dry runs. It runs at minutes
  `7,37` with `V4_EPOCH_MAINTAINER_ENABLED=true` and the bounded production
  routine guard. Workflow `324678196` (`NARA v4 liquidity maintainer`) remains
  `disabled_manually`; `V4_OPERATIONS_KEEPER_ENABLED` and
  `V4_LIQUIDITY_MAINTAINER_ENABLED` remain `false`. Do not broaden epoch-keeper
  authority, change its deployment binding, or activate liquidity maintenance
  without a new explicit user order and current deployment-specific review.
  Read `docs/CURRENT_STATE.md` and
  `docs/NARA_V4_TEST_CONSOLE_CHECKPOINT_2026-08-15.md` for current evidence.
- **Product scope:** NARA Baskets only after a verified fresh-v4 deployment
  manifest and handoff exist. Baskets remain preview-only today. Lockboard and
  composability are deferred; Lotto and Arena are retired.
- **v4 findings:** read
  `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md` before changing or
  operating the v4 hook, vault, compounder, fee collector, seed flow, or basket
  limits. Fresh-v4 deployment must preserve exact opening-price and reciprocal
  sealed binding guarantees. `protocolDepth` is an explicit governance input,
  not a claim about live pool depth.
- **Other retired Base mainnet addresses** are listed in `archive/legacy-v3/README.md`. Do not surface them as "live" or "current" in any output.

## Rules of engagement

1. When the user asks about NARA contracts, use only the active v4 source and
   verified v4 manifests. Deleted V5 plans are not an implementation source.
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
- Use generated active-v4 Hardhat artifacts from an immutable reviewed origin
  commit and verified v4 manifest as the ABI source of truth.

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
| v4 hook design and fee semantics       | `docs/UNISWAP_V4_HOOK.md`                                        |
| v4 post-deployment findings            | `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`            |
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
npm run test               # complete active-v4 Hardhat suite
npm run test:v4            # Token + Engine + Liquidity Growth
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

### Mandatory verification cadence

Do not run the live/fork suite after every edit. Use the smallest gate that
fully covers the changed surface, then widen verification once at the release
boundary:

1. Operations scripts, runtime config, or keeper workflow edits:
   `npm run test:ops` during the edit loop.
2. Before committing a non-contract change: `npm run build` and
   `npm run test:nonfork` once.
3. Contract, compiler, dependency-lock, or fork-integration changes: run the
   applicable focused contract/fork tests, then the complete applicable suite.
4. The protected pull request runs the canonical required CI checks once.

Local `.env` RPC values automatically opt `npm test` into state-dependent Base
fork suites. Do not use that command as a routine non-contract edit-loop gate;
use `npm run test:nonfork`. Run live/fork tests only when their surface changed
or when the current onchain-state evidence is deliberately being refreshed.

Feature-branch CI must run through `pull_request` only. `push` verification is
restricted to `main`; the regression test in
`test/v4ProductionRuntimeGuard.test.ts` enforces this and prevents duplicate
copies of every expensive job.

## Mandatory protocol safety standards

See [CLAUDE.md](CLAUDE.md) → "MANDATORY PROTOCOL SAFETY STANDARDS" for the full rules. The four cornerstones:

1. Deployed-v4 ETH rewards may route through `NARAEngine.notifyEthRewards()`.
   Do not grant
   `REWARD_NOTIFIER_ROLE` or call `notifyTokenRewards(token, amount)` on the
   deployed v4 engine: a post-notification active-position extension can make
   its live denominator exceed the frozen per-position claim basis. Pool ERC-20
   fees route only through `Liquidity`, `Genesis`, or `GenesisSplit`; the
   v4 vault permanently rejects `Engine` and `Split`. The atomic-launch gate
   must prove that no prohibited notifier grant remains on the Safe or vault.
2. Every `onlyOwner` setter has a hard-coded min/max cap.
3. State-changing external-call surfaces use `nonReentrant` or an audited
   protocol-specific equivalent.
4. All admin functions have a comment explaining worst-case impact.

## When to escalate to the user

- If a v4 contract surface is not what this file claims (function name, parameter, return type), trust the source, update this file's table accordingly in a follow-up edit, and tell the user.
- If you find yourself wanting to import from `archive/legacy-v3/`, stop and ask the user — almost always the right answer is to port to v4 instead.
- If you find a v3 mainnet address referenced as "live" anywhere in active docs after this reset, flag it. The reset's promise is that v3 addresses are documented exclusively as "retired" in active docs.
