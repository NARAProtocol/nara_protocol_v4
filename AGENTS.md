# NARA Protocol — Universal Agent Context

This file is read by AI coding assistants that look for `AGENTS.md` on entry (OpenAI Codex, Cursor, DeepSeek, Gemini, and others). 

Last updated: 2026-08-30.

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

## 🚨 v4 RETIRED & FROZEN (READ-ONLY) / v5 ACTIVE MODULAR STACK

> **Technical live testing on Base mainnet — not public product availability.**
> The canonical v4 contracts and NARA/USDC pool use real assets. This is an
> observed technical state, not a claim that every NARA product or interface is
> available, production-ready, audited, safe, approved, or offered in any
> jurisdiction. Transactions are irreversible; liquidity can be limited or
> unavailable; token values can fall to zero. This repository contains no
> evidence of completed jurisdiction-specific
> qualified legal review. Public material must remain factual and
> educational, not an invitation, inducement, or recommendation to acquire,
> hold, sell, lock, stake, or provide liquidity for NARA.

- **v4 Retired & Strictly Read-Only:** `contracts/v4/` is permanently RETIRED, frozen, and strictly READ-ONLY. Zero fixes, zero edits, zero mutations across any file in `contracts/v4/`. It serves exclusively as a cryptographically locked reference baseline verified by `scripts/check-frozen-v4-contracts.cjs` against `docs/FROZEN_V4_SOLIDITY_MANIFEST.json`.
- **v5 Active Modular Stack:** V5 is the exclusive authorized development stack. **Its source of truth is `../.worktrees/nara-v5-engine-production-20260923/contracts/v5/`, not this checkout's `contracts/v5/`,** which is a stale partial snapshot. Read that worktree's `docs/v5/LAUNCH_WIRING_STATUS.md` first.
  - **Deployed & Verified on Base Mainnet (Block `53,422,831`, 34 contracts):** `NARATokenV5` (`0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f`), `NARAEmissionReserveV5` (`0xf932178F24b0813C82093985F0Af6Db27Ae25930`, bound, sealed, funded with `949,987 NARA` at `fundingSequence = 2`), `NARAEpochEngineV5` (`0xd93FbEbFb33FAc9288125074625D4750573B1a53`), `NARAPrincipalLedgerV5` (`0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2`), `NARARewardLedgerV5` (`0xC72671D9438388638547444524F6542b650C9264`), `NARARewardIngressV5` (`0x44130CC47b886D8488041F5eaE271477D1aFA909`), `NARAEmissionModelV5` (`0xd26b3c23d677b2DE82722DB5e687744600d4A231`), `NARAPositionNFTV5` (`0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA`), `NARAForgeV5` (`0x84225aBaBbE7433c736925f9c0ba6f6CcB51551a`, commits paused under Equal-Footing Launch Mode), `NARAPositionSaleV5` (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`, `FEE_BPS = 500`), `NARALiquidityHookV5` (`0x201fBD2839bEc513040024b37dAe97B401E96acC`, `poolId = 0x3bd8b60dc9eb37f00afa57585232e4018ae661b2dbd5318562183a67a07ac758`, `tradingPaused = true`), `NARAFeeVaultV5` (`0xe63b4BaAF873FC57859bfe13e0e8cFccAaB6AddE`), `NARAPoolOracleV5` (`0xA2151333BDD77DF2E058f9cE274F63D2e48A5553`), `NARAPOLPositionV5` (`0x01EF9de9f4e9197F2A3944b5B34A90eA2f558b64`), `NARACapitalBudgetV5` (`0x6f5f586Bd4F14e47F432264D88Fe9A6A6A80552B`), `NARACapitalPolicyV5` (`0xC6b5471ADadcf66c2375EC8600bb7a3D85C73e45`), and `NARATreasuryRangeManagerV5` (`0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288`, holding `49,997 NARA`). `999,984 NARA` (`99.9984%` of total supply) is locked inside V5 contracts; public pool seeding (`Safe nonce 9`) and opening trading (`Safe nonce 10`) remain held back per owner decision.
  - Actual modules:
    - financial graph: `NARAEpochEngineV5`, `NARAPrincipalLedgerV5`, `NARARewardLedgerV5`, `NARARewardIngressV5`, `NARAEmissionModelV5`, `NARAEmissionReserveV5`;
    - receipt: `NARAPositionNFTV5`;
    - fee layer: `NARAFeeVaultV5`, `NARALiquidityHookV5`, `NARAPoolOracleV5`, `NARAPOLPositionV5`, `NARACapitalBudgetV5`, `NARACapitalPolicyV5`.
  - Economics per the user's 2026-09-23 decisions:
    - 80/20 base/rarity rewards;
    - 100X rarity maximum, with `NARAForgeV5` (`0x84225aBaBbE7433c736925f9c0ba6f6CcB51551a`, commits paused on-chain under Equal-Footing Launch Mode) and `NARAPositionSaleV5` (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`, `FEE_BPS = 500`) deployed on Base Mainnet;
    - Hook and LP fees start **100% POL** (holder share 0%, governed later).
  - `NARAEngineCore` / `NARACardForge` / `NARAFleetDeckLens` do not exist in V5 source.
- **NARALiquidityGrowthHook:** Hardened with 7-day governance timelocks (`FEE_UPDATE_DELAY = 7 days`), 20% max default operational fee caps, aligned floor rounding, and direct vault fee recording.
- **Sniper Liquidity Bootstrapping:** The pressure accumulator is explicitly
  per-block. Same-block Block-0 flow aggregates across callers and can reach the
  20% buy tier; a trader can reset pressure by waiting for another block. Hook
  fees are input-currency-only, so buy-only USDC fees remain banked until
  matching NARA exists. A keeper compounds only balanced inventory into POL.
  Do not claim persistent cross-block split resistance or instant POL from
  one-sided fees.
- **Archived:** `archive/legacy-v3/` — frozen v3 legacy code.
- **Fresh v4 activation (retired stack):** the v4 stack's `NARAToken` is the
  retired v4-era token (see the workspace `AGENTS.md` retired list; the
  canonical token is now V5 `0x91FB…ae0f`). The v4 Engine is
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
- **Activation boundary:** the pool/tax path is active and in technical live
  testing. The sampled and same-block live tax paths reconciled, and the Vault
  binding is permanently frozen to Compounder `0xfeF...13DF`. The latest
  receipt-pinned full-inventory compound increased Compounder LP NFT `2898486`
  to liquidity `4386316228001171` at Base block `50499085`; the banked remainder
  was `28.423769295100595183 NARA / 2.326460 USDC`. Both the epoch and liquidity
  maintainers are active under separate bounded policies, credentials, and
  schedules. Raw lock/activation/unlock and post-fee lock paths are exercised;
  the current Position NFT deployment remains `integrationReady: false` until
  its separately approved value-bearing smoke, monitored hold, and downstream
  handoff are complete. Baskets remain preview-only. Do not claim whole-stack
  production readiness or public product availability.
- **Read-first liquidity state:** read `docs/CURRENT_STATE.md`,
  `docs/releases/NARA-20260809-v4-production-activation.md`,
  `docs/releases/NARA-20260827-v4-full-inventory-compound.md`,
  `docs/releases/NARA-20260828-v4-epoch-maintainer-resilience.md`,
  `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`,
  `docs/UNISWAP_V4_HOOK.md`, and `docs/V4_LAUNCH_CHECKLIST.md` before pool,
  fee, liquidity, recovery, or basket-activation work. For active modular v5
  specifications, consult `contracts/v5/PRD.md` and `contracts/v5/README.md`.
- **Treasury range candidate boundary:** before any tactical range work, read
  `docs/releases/NARA-20260828-v4-treasury-range-manager.md`,
  `docs/releases/NARA-20260831-v4-treasury-range-500-usdc-canary.md`,
  `docs/architecture/NARA_TREASURY_RANGE_MANAGER_V1.md`, and
  `docs/runbooks/NARA_V4_TREASURY_RANGE_SETTLER_RUNBOOK.md`, and
  `deployments/v4-treasury-range-custody-policy-2026-08-31.json`. The protected
  500-USDC policy commit `5a6b449df7d50b25d71715b3bbedc720ef6960ee`
  and its historical/fresh matrix evidence predate the dedicated-Safe role
  correction and are not launch authority by themselves. Current candidate
  architecture uses the protocol 2-of-3 Safe only to execute CREATE2 deployment
  and the distinct, policy-pinned Treasury Range Safe for immutable custody,
  order/cancellation authority, and all settlements. The dedicated Safe is
  currently 1-of-1; require explicit human risk acceptance or an approved
  multisig upgrade/re-pin before funding. The manager is not funded, deployed,
  activated, independently externally audited, or part of permanent POL. Never
  import a legacy single-Safe packet/evidence file, describe optimizer output as
  a profit guarantee, or reuse an existing keeper for the settler.
- **Historical withdrawal completed:** human Safe signers retired the 2026-07-30
  NARA/USDC pool on 2026-08-08 in Base transaction
  `0xd3b4c1790b586c399e48307afa3c282a279ac395212f0242a98835781a430523`.
  The old pool active liquidity, Vault, and Compounder are zero; both LP NFTs
  are burned; the recovery is cleared; and the sealed reserve is unchanged.
  Never replay the consumed Safe batch, re-propose its `WindDown`, or use those
  historical addresses as a current manifest.
- **GitHub operations boundary:** workflow `324678194` (`NARA v4 epoch
  maintainer`) and workflow `324678196` (`NARA v4 liquidity maintainer`) are
  active, separately credentialed, and separately gated. The epoch workflow
  runs at minutes `3,18,33,48` with `V4_EPOCH_MAINTAINER_ENABLED=true`; its
  Railway fallback is scheduled at `12,27,42,57`. The liquidity workflow runs
  at `17,47` with `V4_OPERATIONS_KEEPER_ENABLED=true` and
  `V4_LIQUIDITY_MAINTAINER_ENABLED=true`. Do not broaden or reuse either
  keeper, change a deployment binding, schedule, or policy, or disable either
  workflow without a new explicit user order and current deployment-specific
  review. Read `docs/CURRENT_STATE.md`,
  `docs/releases/NARA-20260828-v4-epoch-maintainer-resilience.md`, and
  `docs/releases/NARA-20260827-v4-full-inventory-compound.md` for current
  evidence.
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

1. **COLD AI START INVARIANT — ALWAYS START IN `contracts/v5/`**:
   Whenever the user asks to do any contract work, feature additions, token, gacha forge, or engine tasks, AI Agent MUST ALWAYS start and build in the **modular v5 stack**. That stack lives at **`../.worktrees/nara-v5-engine-production-20260923/contracts/v5/`**; this checkout's `contracts/v5/` is a stale snapshot. Start by reading that worktree's `docs/v5/LAUNCH_WIRING_STATUS.md`.
   - `contracts/v4/` is permanently FROZEN, read-only baseline, cryptographically locked against `docs/FROZEN_V4_SOLIDITY_MANIFEST.json`. Never edit any `.sol` file in `contracts/v4/`. Run `npm run verify:frozen-v4` to verify.
   - All new modular architecture lives exclusively in the V5 worktree. That includes the approved but not yet implemented rarity awards (100X maximum), paid rolls and fusion. Hook and LP fees start 100% POL, not 100% to holders.
2. Do not import anything from `archive/legacy-v3/` into active code paths.
3. Do not modify files in `archive/legacy-v3/` without explicit user direction.
4. Do not redeploy any archived contract. The archive is reference material, not deployable code.
5. Satellites with **no v4 equivalent yet** (Arena, Lotto, MisterMint, Sponsor Hub) are documented in `archive/legacy-v3/PORTING_ROADMAP.md`. Porting produces a **new** file under `contracts/v4/`, not an edit to the archive.

## AI Agent Guardrails

- Do not reintroduce mining.
- Do not reintroduce jackpot/lotto behavior.
- Do not reintroduce old keeper/cron assumptions.
- **IMMUTABLE EXISTING SOLIDITY RULE — ZERO MUTATION OF EXISTING .SOL CODE**:
  Do NOT alter, edit, mutate, or overwrite any existing Solidity contracts (`contracts/v4/*.sol`).
  Existing Solidity code is strictly frozen to protect the verified project state from breaking.
  All future modular contracts, new architectures, or redeployment candidates MUST be created in separate,
  isolated files/directories without modifying or breaking existing `.sol` files.
- Do not edit `contracts/v4/NARAEngine.sol` under any circumstance.
- Do not edit `contracts/v4/NARAPositionNFTV4.sol` under any circumstance.
- Prefer periphery, routers, lenses, monitors, views, and docs over frozen core
  edits.
- AI agents are read/report only unless the user explicitly changes that scope.
- Never ask for, print, or store private keys.
- Do not send transactions or perform production writes without explicit human
  approval.
- Do not deploy contracts without explicit human approval.
- Use generated active-v4 Hardhat artifacts from an immutable reviewed origin
  commit and verified v4 manifest as the ABI source of truth.

## Market conduct (replaces the retired "Mandatory Fleet Invariants", 2026-09-24)

The owner retired the former fleet-invariants section on 2026-09-24 (workspace audit `../audit-runs/2026-09-24-range-manager/REPORT.md`, finding GOV-01). Do not follow, restore or implement it; git history keeps the old text. The workspace `AGENTS.md` holds the same rules.

- Do not build, run, tune or document wallet fleets that generate trading volume, hide links between wallets, add timing jitter to avoid clustering detection, create holders to pass sniper or DEX filters, or time buys and liquidity to move the price.
- Project-controlled wallets (treasury, deployer, relayer, fleet and bot keys) must not trade in any pool where the treasury quotes. A key that signs for a treasury Safe must not also run a bot, keeper, relayer or trading wallet.
- `NARATreasuryRangeManagerV1`, the Range Ranger automation and their Safe packets are retired and must never be used with V5.


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
| v5 active modular sources              | `contracts/v5/`                                                   |
| v5 PRD & architecture specification    | `contracts/v5/PRD.md` and `contracts/v5/README.md`               |
| v4 contract sources (frozen, read-only)| `contracts/v4/`                                                   |
| v4 test suite                          | `test/` (root) + `test/composability/`                            |
| v4 deploy/verify/sync scripts          | `scripts/` (root)                                                 |
| v4 ops, product, audit docs            | `docs/`                                                           |
| v4 canonical state document            | `docs/CURRENT_STATE.md`                                           |
| v4 hook design and fee semantics       | `docs/UNISWAP_V4_HOOK.md`                                        |
| v4 post-deployment findings            | `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`            |
| v4 launch checklist                    | `docs/V4_LAUNCH_CHECKLIST.md`                                     |
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
| Treasury tactical ranges (candidate)| `NARATreasuryRangeManagerV1`      | `contracts/v4/NARATreasuryRangeManagerV1.sol`                    |
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
npm run test:treasury-ranges:v4
npm run typecheck:treasury-range-settler:v4
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

The four cornerstones of protocol safety: The four cornerstones:

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

## Official NARA Brand Logo & Token Icon Standards

- **Canonical Insignia**: 15-Notch Epoch Radar Dial + Monolithic Architectural N on full-bleed solid `#000000` deep black canvas (`nara-logo-white.png`).
- **Master Files**: `tools/nara-landing/public/`.
- **Solid Black Background Mandate**: All token icons and avatars MUST use a solid `#000000` background. Never export transparent corners for token listing icons to prevent Chromium and tracker white box/border defects.
- **Hosted URLs**:
  - BaseScan (`128x128`): `https://files.catbox.moe/snrc7s.png` / `https://naraprotocol.io/nara_token_128.png`
  - CoinGecko/CMC (`200x200`): `https://files.catbox.moe/f9xge7.png` / `https://naraprotocol.io/nara_token_200.png`
  - DexScreener/Uniswap (`256x256`): `https://files.catbox.moe/b16drt.png` / `https://naraprotocol.io/nara_token_256.png`
  - Community/Telegram/Discord (`512x512`): `https://files.catbox.moe/f5tan3.png` / `https://naraprotocol.io/nara_token_512.png`
  - Master Logo (`1024x1024`): `https://files.catbox.moe/4v6oup.png` / `https://naraprotocol.io/nara-logo-white.png`
