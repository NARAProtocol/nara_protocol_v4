# NARA Protocol AI Context

Last updated: 2026-07-26.
This repository is the active NARA contracts and operations workspace.

## 🚨 v4 RESET — READ FIRST

On **2026-05-27** the project committed to a clean fresh start on the v4 stack.
The v3 stack was archived. On **2026-07-26**, controlled Stage A deployed the
fresh `NARAToken` at `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`
and its core dependencies. The registered pool remains uninitialized and has no
liquidity. Do not repeat the core deployment. The v3 token
`0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` is **retired**.

**Active code paths (all v4):**
- `contracts/v4/` — the only Solidity sources in the active compile path
- `test/` — v4 test suite only (v3 tests are in `archive/legacy-v3/test/`)
- `scripts/` — v4 deploy/verify/sync scripts only
- `docs/` — v4 product, ops, and audit documentation only
- `package.json` scripts — v4-only after this reset

**Archived (do not modify, do not import from `contracts/v4/`, do not redeploy):**
- `archive/legacy-v3/` — frozen v3 stack with its own README, CLAUDE.md, AGENTS.md, and PORTING_ROADMAP.md
- The four satellites with **no v4 equivalent yet** (Arena, Lotto, MisterMint, Sponsor Hub) are listed in `archive/legacy-v3/PORTING_ROADMAP.md`

When the user asks anything about NARA (token, engine, bond, NFT position, etc.), the default answer is **v4** unless they explicitly ask about historical v3 behavior or porting. Never surface a retired v3 mainnet address as "live."

## Active Paths

- Active contracts and ops: `nara-protocol-hardhat/`
- Active launch frontend: `../apps/nara-baskets/` only.
- `../apps/nara-lockboard/` is deferred. `../apps/nara-lotto/` and
  `../apps/nara-arena/` remain retired and must not be enabled.
- Active cron folder: `../cron/` — **RETIRED 2026-05-28**, see `../cron/DEPRECATED.md`. Router replaces it.
- Historical only: `archive/legacy-field/` and `archive/checkpoints/`

## v4 Router + Lens + BribeRouter (added 2026-05-28)

- `contracts/v4/router/NARARouter.sol` — permit + sync + lock in one tx, plus permissionless `syncEpochs()` (kills the keeper).
- `contracts/v4/router/NARADashboardLens.sol` — single-call `getUserState(user, positionIds[], nftTokenIds[])` for any frontend.
- `contracts/v4/router/BribeRouterV4.sol` — permissionless `notify(token, amount)` wrapper around engine.notifyTokenRewards. Holds REWARD_NOTIFIER_ROLE. Any external protocol can bribe NARA lockers. Grant role after deploy.
- Deploy: `npm run deploy:v4:router:lens` (needs `ENGINE_V4`, `POSITION_NFT_V4` env). Then grant role to BribeRouterV4.
- Full spec: `docs/ROUTER_LENS.md`.
- ABI source of truth: generated artifacts under `artifacts/contracts/v4/`.
  Router/lens deployment and frontend integration are deferred from the
  baskets-only launch.

## Pre-Launch Fix 2026-05-28: NARARewardReserve restored

- `contracts/v4/NARARewardReserve.sol` — added. Same code as the archived v3 version (interface is version-agnostic). The v4 engine and `scripts/deployV4BaseUsdc.ts` already required it; the contract was archived prematurely.
- Historical result at the time of that fix: **324/324 tests passing**. Use
  `docs/CURRENT_STATE.md` for the latest dated verification result.

## Launch Documents (2026-05-28)

All in `docs/`:
- `NARA_V4_LAUNCH_RUNBOOK.md` — step-by-step deploy with gates
- `NARA_V4_PUBLIC_STATE.md` — honest current state for users/analysts
- `NARA_V4_LOCK_USER_GUIDE.md` — user-facing lock guide
- `NARA_V4_BOND_OPENING_CRITERIA.md` — bond opening gates
- `NARA_V4_DASHBOARD_SPEC.md` — frontend data spec
- `NARA_V4_ANALYST_POSTS.md` — draft comms (publish post-deploy)
- `NARA_V4_POST_LAUNCH_WORK.md` — deferred work tracker

**Controlled Stage A deployed to Base mainnet on 2026-07-26.** Token, engine,
reward reserve, hook, vault, CREATE2 deployer, and launcher are deployed and
verified. The NARA/USDC pool is registered but uninitialized, with no
liquidity. The current launch scope is NARA Baskets only.

## Canonical Documents

- Save all new protocol and operations markdown docs under `docs/` in this repository.
- `docs/README.md`, `docs/CLAUDE.md`, and `docs/APPS.md` are the landing docs for navigation and save location.
- `docs/NARA_V4_PROJECT_SCOPE.md` is the **cold-AI whole-project map** — five pillars, layer model, build-vs-reveal order, exact status of every contract, what's genuinely outstanding (ops vs. external vs. code), the two-build-system gotcha, and the audit-corrections log. Read it first when starting cold.
- `docs/V4_CONTRACT_INDEX.md` is the **v4 start-here map** — every active v4 contract → purpose → deploy step → its doc. Read it for per-contract detail under the scope map.
- `docs/CURRENT_STATE.md` is the source of truth for live protocol state.
- `docs/ROADMAP.md` is the source of truth for where the product is headed.
- `docs/NARA_MASTER_CONTEXT.md` is a **v3 archive reference only** (its header says so). Do not apply its formulas/patterns to v4 — use `V4_CONTRACT_INDEX.md` + `CURRENT_STATE.md` + `PRD.md` + the `V4_*` docs.
- `docs/research/COMPOSABILITY_CASCADE_REPORT.md` is a strategy reference, not a canonical live-state snapshot.

## UI Rule Source

- The canonical always-on UI standard for this workspace now lives in `../CLAUDE.md` under `Canonical UI System Prompt (Always Enforced)`.
- For any frontend, dashboard, app, or design work in this repository, follow that UI system prompt first.
- For financial/Web3 choice flows, also follow `../docs/UI_UX_NEUTRAL_ACTION_HIERARCHY.md`.
- Core rule: do not decide the asset for the user; decide the navigation for the user.
- Never label a token, basket, bond, lock, position, or exit as recommended, best, safest, beginner-friendly, popular, highest return, or low risk unless the user provides legally reviewed factual copy.
- Treat every token, basket, lock, bond, buy, sell, conversion, claim, and exit as a self-directed value-bearing action.
- Do not use personalized advice, suitability labels, managed-investment framing, risk profiling, projected-return promises, or optimized-choice language.
- Do not claim safety, protection, insurance, regulator approval, guaranteed yield, or reduced risk unless the exact wording is legally reviewed.
- Comparable value-bearing choices must keep equal visual weight. Use hierarchy for procedural actions like `View`, `Continue`, `Back`, `Review`, and `Confirm`, not for asset preference.
- Before confirmation, show selected action, fees, slippage/deadline where relevant, approvals, expected output, exits, and risk notice.
- If older repo-local UI guidance conflicts with the workspace-root UI system prompt, the workspace-root prompt wins.

## Current v4 Launch State

The fresh v4 controlled Stage A stack is deployed. Canonical addresses and
evidence are in `docs/CURRENT_STATE.md` and
`deployments/v4-base-usdc-latest.json`. Run
`npm run verify:v4:preseed` for the current dormant state. The strict
`npm run verify:v4:preflight` must remain blocked until the compounder is
wired and the pool is initialized and seeded.

Do not use retired v3 addresses for new integrations, UI, scripts, baskets, or
public copy. The retired v3 address table lives in `archive/legacy-v3/README.md`
and is historical reference only.

## Retired v3 Reference

The old v3 Base mainnet stack, including `NARATokenV3`, `NARAEngineV2`,
`NARABondVault`, `NARABondDepository`, `NARALottoPoolV2`, `NaraLockNFT`, and
their related wrapper/accounts, is retired as of 2026-05-27. If an active
document or script calls any of those contracts "live" or "current", fix the
wording before relying on it.

Use `docs/CURRENT_STATE.md` as the canonical current-state source.

## Product Framing That Must Stay Consistent

- NARA is a fixed-supply, time-preference yield protocol on Base.
- The lockboard is a launch surface, not the protocol identity.
- If the OG board does not prove to be the right growth surface, replace the surface, not the protocol thesis.
- The protocol thesis is larger than any one UI:
  - fixed supply
  - sealed reward reserve
  - sealed bond inventory
  - weight-based locking
  - ETH reward routing
  - future composability on top of the locked-position layer

## ABI And Integration Truths

- Integrate only against v4 ABIs generated from `contracts/v4/`.
- The active engine contract is `contracts/v4/NARAEngine.sol`.
- The intended v4 bond delivery path is `NARABondDepositoryV4NFT`, which mints
  `NARAPositionNFTV4` positions.
- Do not project retired v3 wrapper, lotto, arena, or lockboard assumptions onto
  v4 unless that satellite has been explicitly ported and recorded in
  `docs/CURRENT_STATE.md`.
- The engine is not permit-aware today, so locking remains `approve` plus the
  relevant lock/mint call when allowance is missing.

## Environment Notes

- Node.js 20.x requires the polyfill workaround: `NODE_OPTIONS="--require ./polyfill.cjs"` for all Hardhat commands.
- `.env` is NOT committed (per security rules). The deployer must have `PRIVATE_KEY`, `BASESCAN_API_KEY`, and either `BASE_RPC_URL` or `BASE_MAINNET_RPC_URL` in their shell environment or a local `.env` file.
- `hardhat.config.ts` and v4 post-deploy scripts read `BASE_RPC_URL` or `BASE_MAINNET_RPC_URL` for the `base` network.

## ⚠️ MANDATORY PROTOCOL SAFETY STANDARDS (Apply to EVERY contract)

These rules MUST be implemented in every smart contract built on or integrated with NARA. No exceptions.

### 1. All Ecosystem Fees Must Route to the Engine
- Any protocol fee, wrapper fee, game fee, or integration fee **MUST** be sent to the active v4 engine's `notifyEthRewards()` to reward lockers.
- Before calling `notifyEthRewards`, always guard with `if (fee > 0)` because the engine reverts on zero-value.
- Only flat lock/unlock ETH fees set by the engine itself go to `accumulatedTreasuryEthFees` — that is the engine's own internal accounting.
- **Never** accumulate fees in a contract balance without a guaranteed route to the engine or the owner wallet.

### 2. Safety Caps (Min / Max) Are MANDATORY on All Parameters
Every configurable parameter exposed to an `onlyOwner` setter MUST have a hard-coded ceiling and/or floor:
```solidity
// ✅ REQUIRED PATTERN
uint256 public constant MAX_FEE_WEI = 0.1 ether;       // e.g., for protocol fees
uint96  public constant MAX_ROYALTY_BPS = 1000;         // 10% max royalty

function setFee(uint256 _fee) external onlyOwner {
    if (_fee > MAX_FEE_WEI) revert Contract__FeeTooHigh();
    fee = _fee;
}
```
- Caps protect users even if the owner key is compromised.
- Caps make the contract trustworthy to external auditors and users.
- Caps MUST be commented with why the limit was chosen.

### 3. No Scary Trust Assumptions for Users
- Fee changes must be bounded (see rule 2). Never allow unbounded admin power over user costs.
- Timelocks: For any parameter change that could materially harm users (e.g., large fee hikes), a `TimelockController` or a `pendingValue` + `applyAfter` pattern is strongly recommended.
- Emergency functions (sweeps, pauses) must be clearly documented and bounded.
- Every `onlyOwner` function must have a comment explaining worst-case impact.

### 4. Security Checklist Before Every Deployment
```
□ All fees route to the Engine (notifyEthRewards) or are clearly accounted for?
□ All admin setters have min/max caps?
□ Reentrancy: all external-call functions use nonReentrant?
□ Clone/proxy initialization is guarded against front-running?
□ ETH accounting: no wei can be trapped or leaked?
□ Tests: 100% of new code has corresponding test cases?
□ CLAUDE.md and docs/CURRENT_STATE.md updated with new addresses?
```

---

## Working Rules

- Check `docs/CURRENT_STATE.md` before making operational claims.
- For `../apps/nara-lockboard/` deploys, remember that `CLOUDFLARE_API_TOKEN` may live in `nara-protocol-hardhat/.env`, but Wrangler still needs it loaded into the current shell session.
- Check `docs/ROADMAP.md` before pitching product direction.
- Treat the report as directionally useful but subordinate to verified live state.
- Do not reintroduce legacy FIELD names, archived env vars, or retired UI paths into active work.
- If a fact may have changed, rerun `npm run check:nara:live` rather than trusting markdown.
- For v4 NFT position work, always read `docs/NARA_V4_NFT_POSITIONS.md` first — it is the canonical v4 spec (`NARAPositionNFTV4` + `NARAPositionAccountV4`). The old `NFT_WRAPPER_BUILD_PLAN.md` is **v3-only** and lives in `archive/legacy-v3/docs/` — do not use it for v4.
- Run all tests with `NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test` — the polyfill is mandatory on Node 20.
- **Before any new contract deployment, verify the Protocol Safety Standards checklist above is fully satisfied.**
