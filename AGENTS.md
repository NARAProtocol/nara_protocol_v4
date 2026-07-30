# NARA Protocol — Universal Agent Context

This file is read by AI coding assistants that look for `AGENTS.md` on entry (OpenAI Codex, Cursor, DeepSeek, Gemini, and others). The companion file [CLAUDE.md](CLAUDE.md) carries the same context framed for Claude / Anthropic models.

Last updated: 2026-07-28.

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

- **Active code path:** `contracts/v4/` — this is the only Solidity source tree in the active compile.
- **Archived:** `archive/legacy-v3/` — the entire v3 protocol stack (token, engine, bond, NFT wrapper, reward reserve) plus all v3 satellites (Arena, Lotto, MisterMint, Sponsor Hub) was moved here. It is frozen.
- **Active token:** the fresh `NARAToken` is deployed on Base at
  `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`. The v3 mainnet token
  `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` is **retired**.
- **Deployment state:** The Stage A token, engine, and sealed reward reserve
  remain the active core. The Stage A hook, vault, compounder, and registered
  NARA/USDC pool are quarantined by the 2026-07-28 review. The pool is
  uninitialized and has no liquidity; never initialize or seed it. Deploy and
  verify the corrected replacement liquidity trio before launch. Do not repeat
  the core deployment.
- **Launch scope:** NARA Baskets only. Lockboard and composability are deferred;
  Lotto and Arena are retired.
- **Pre-seed findings:** read
  `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md` before touching the
  hook, vault, compounder, fee collector, seed flow, or basket limits. Never
  remove the exact opening-price bind, configured-depth fee basis, reciprocal
  one-shot binding checks, notifier-role prohibition, or live basket-size cap.
- **Other retired Base mainnet addresses** are listed in `archive/legacy-v3/README.md`. Do not surface them as "live" or "current" in any output.

## Rules of engagement

1. When the user asks about NARA (token, engine, bond, NFT position, lock, claim, reward), default to the **v4** answer. v4 contracts live in `contracts/v4/`.
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
- Use generated active v4 Hardhat artifacts as the ABI source of truth.

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

| Concern | Path |
|---|---|
| v4 contract sources | `contracts/v4/` |
| v4 test suite | `test/` (root) + `test/composability/` |
| v4 deploy/verify/sync scripts | `scripts/` (root) |
| v4 ops, product, audit docs | `docs/` |
| v4 canonical state document | `docs/CURRENT_STATE.md` |
| v4 launch checklist | `docs/V4_LAUNCH_CHECKLIST.md` |
| v4 protocol safety standards | `CLAUDE.md` (this folder) → "MANDATORY PROTOCOL SAFETY STANDARDS" |
| v3 archived sources | `archive/legacy-v3/contracts/` |
| v3 archive policy + retired addresses | `archive/legacy-v3/README.md` |
| v3 → v4 port roadmap | `archive/legacy-v3/PORTING_ROADMAP.md` |

## v4 protocol surface (quick reference)

| Concern | Contract | File |
|---|---|---|
| Token | `NARAToken` | `contracts/v4/NARAToken.sol` |
| Core engine | `NARAEngine` | `contracts/v4/NARAEngine.sol` |
| Position NFT | `NARAPositionNFTV4` | `contracts/v4/NARAPositionNFTV4.sol` |
| Position account (clone) | `NARAPositionAccountV4` | `contracts/v4/NARAPositionAccountV4.sol` |
| Genesis reward distributor | `NARAGenesisRewardDistributorV4` | `contracts/v4/NARAGenesisRewardDistributorV4.sol` |
| Bond vault | `NARABondVaultV4` | `contracts/v4/NARABondVaultV4.sol` |
| Bond depository (raw) | `NARABondDepositoryV4` | `contracts/v4/NARABondDepositoryV4.sol` |
| Bond depository (NFT) — launch path | `NARABondDepositoryV4NFT` | `contracts/v4/NARABondDepositoryV4NFT.sol` |
| Uniswap v4 liquidity hook | `NARALiquidityGrowthHook` | `contracts/v4/NARALiquidityGrowthHook.sol` |
| Uniswap v4 fee vault | `NARALiquidityGrowthVault` | `contracts/v4/NARALiquidityGrowthVault.sol` |
| Ops vesting vault | `NARAOpsVaultV4` | `contracts/v4/NARAOpsVaultV4.sol` |
| Composability — staking pool | `NARAStakingPoolV4` | `contracts/v4/composability/NARAStakingPoolV4.sol` |
| Composability — Pendle SY | `NARAStakingPoolSYV4` | `contracts/v4/composability/NARAStakingPoolSYV4.sol` |
| Composability — fractional position | `NARAFractionalPositionV4` | `contracts/v4/composability/NARAFractionalPositionV4.sol` |
| Composability — fractional factory | `NARAFractionalPositionFactoryV4` | `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol` |
| Launcher (one-shot atomic) | `NARALauncher` | `contracts/v4/NARALauncher.sol` |

## Build, test, and gate commands

All commands run from `nara-protocol-hardhat/`. Node 20 requires the polyfill:

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat compile
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test

npm run build              # hardhat compile
npm run test               # hardhat test (whole v4 suite)
npm run test:v4            # Token + Engine + Liquidity Growth
npm run test:bond:v4
npm run test:bond-nft:v4
npm run test:nft:v4
npm run test:composability:v4
npm run test:invariants:v4
npm run size               # bytecode size check
npm run slither:v4         # static analysis
npm run aderyn:v4          # static analysis
npm run echidna:v4         # fuzz harness
npm run launch:gates       # combined local launch gate
```

## Mandatory protocol safety standards

See [CLAUDE.md](CLAUDE.md) → "MANDATORY PROTOCOL SAFETY STANDARDS" for the full rules. The four cornerstones:

1. ETH rewards may route through `NARAEngine.notifyEthRewards()`. Do not grant
   `REWARD_NOTIFIER_ROLE` or call `notifyTokenRewards(token, amount)` on the
   deployed v4 engine: a post-notification active-position extension can make
   its live denominator exceed the frozen per-position claim basis. Pool ERC-20
   fees route only through `Liquidity`, `Genesis`, or `GenesisSplit`; the
   replacement vault permanently rejects `Engine` and `Split`.
2. Every `onlyOwner` setter has a hard-coded min/max cap.
3. All external-call functions use `nonReentrant`.
4. All admin functions have a comment explaining worst-case impact.

## When to escalate to the user

- If a v4 contract surface is not what this file claims (function name, parameter, return type), trust the source, update this file's table accordingly in a follow-up edit, and tell the user.
- If you find yourself wanting to import from `archive/legacy-v3/`, stop and ask the user — almost always the right answer is to port to v4 instead.
- If you find a v3 mainnet address referenced as "live" anywhere in active docs after this reset, flag it. The reset's promise is that v3 addresses are documented exclusively as "retired" in active docs.
