# NARA Protocol AI Context

Last updated: 2026-08-01.
This repository is the active NARA contracts and operations workspace.

> **Liquidity reset override:** Before any pool, hook, vault, compounder, fee,
> recovery, or basket-activation work, read
> `docs/NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md`. Human Safe signers executed
> the no-movement Stage-0 `WindDown` proposal on 2026-07-31. The dedicated old
> compound keeper is revoked; ETA is `2026-08-07T22:00:35Z`; maturity moves
> nothing automatically.
> V5 is a separate complete new token, engine, reserve, protocol-module,
> liquidity, pool, custody, tooling, monitor, and integration release. Current
> v4 addresses are recovery/retirement sources, not retained V5 components. This
> override supersedes older pool-launch directions elsewhere in this file.
> Hook V5 is the primary reason and first design workstream. Prove its
> anti-splitting economics, dual-currency accounting, active-POL behavior, and
> live-evidence simulations before freezing the wider V5 implementation.
> The local complete-stack V5 contract candidate and local-review
> disposition are in
> `docs/NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md`. It includes the Hook,
> Vault, Engine, named-POL custody/Controller, Compounder, core modules,
> periphery, and deterministic offline deployment planning. It is tested but
> undeployed, unapproved, unaudited, and not an immutable release. Production
> parameters, protected integrations, an actual one-hour deployment/retirement
> rehearsal, and a distinct seven-day-or-longer production approval remain.
> Use `docs/NARA_V5_DEPTH_ECONOMICS_2026-08-01.md` for the parameter-neutral
> reserve lower bound. It does not approve the five absolute POL thresholds.
> Before any V5 bond work, read
> `docs/NARA_V5_DEPLOYMENT_DECISION_RECORD.md`. The local canonical NFT-bond
> candidate is one-campaign, exact-capacity, initially unfunded, and closed.
> Its allocation, fixed-price/oracle policy, price, term, and lock remain
> unapproved; do not fund, queue, activate, or call it deployed from local code.

## 🚨 v4 RESET — READ FIRST

On **2026-05-27** the project committed to a clean fresh start on the v4 stack.
The v3 stack was archived. On **2026-07-26**, controlled Stage A deployed the
fresh `NARAToken` at `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`
and its core dependencies. Do not rerun that v4 deployment; V5 requires fresh
reviewed source and addresses. The active
2026-07-30 pool is liquid but retiring under the read-first reset handoff. The v3 token
`0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` is **retired**.

**Active code paths:**

- `contracts/v4/` — deployed/recovery V4 sources
- `contracts/v5/` — local undeployed complete-stack V5 contract candidate
- `test/` — V4 plus local V5 unit, integration, and fork suites (v3 tests are in `archive/legacy-v3/test/`)
- `scripts/` — v4 operations plus offline-only V5 planning/evidence helpers
- `docs/` — V4 recovery truth plus the reviewed V5 planning/evidence records
- `package.json` scripts — V4 operations plus local V5 verification

**Archived (do not modify, do not import from `contracts/v4/`, do not redeploy):**

- `archive/legacy-v3/` — frozen v3 stack with its own README, CLAUDE.md, AGENTS.md, and PORTING_ROADMAP.md
- The four satellites with **no v4 equivalent yet** (Arena, Lotto, MisterMint, Sponsor Hub) are listed in `archive/legacy-v3/PORTING_ROADMAP.md`

When the user asks about deployed state, the default answer is **v4 recovery**.
When they ask about the redesign, use the undeployed V5 source and planning
records. Never surface a retired v3 address as live or call a planned V5
address deployed.

## Active Paths

- Active contracts and ops: `nara-protocol-hardhat/`
- Active publishable launch frontend: `../nara-category-baskets-v1/app/` only.
  `../apps/nara-baskets/` is a non-publishing historical working copy.
- `../apps/nara-lockboard/` is deferred. `../apps/nara-lotto/` and
  `../apps/nara-arena/` remain retired and must not be enabled.
- Active cron folder: `../cron/` — **RETIRED 2026-05-28**, see `../cron/DEPRECATED.md`. Router replaces it.
- Historical only: `archive/legacy-field/` and `archive/checkpoints/`

## v4 Router + Lens (BribeRouter disabled on deployed engine)

- `contracts/v4/router/NARARouter.sol` — permit + sync + lock in one tx, plus permissionless `syncEpochs()` (kills the keeper).
- `contracts/v4/router/NARADashboardLens.sol` — single-call `getUserState(user, positionIds[], nftTokenIds[])` for any frontend.
- `contracts/v4/router/BribeRouterV4.sol` is a dormant reference implementation.
  Do not deploy it for, or grant `REWARD_NOTIFIER_ROLE` on, the deployed v4
  engine. The 2026-07-28 review confirmed that an active extension after the
  first token notification can strand part of later token distributions.
- `npm run deploy:v4:router:lens` deploys only the safe router/read components
  when their dependencies exist. It intentionally skips `BribeRouterV4`.
- Full spec: `docs/ROUTER_LENS.md`.
- ABI source of truth: generated artifacts under `artifacts/contracts/v4/`.
  Router/lens deployment and frontend integration are deferred from the
  baskets-only launch.

## Historical V4 Fix 2026-05-28: NARARewardReserve restored

- `contracts/v4/NARARewardReserve.sol` — added. Same code as the archived v3 version (interface is version-agnostic). The v4 engine and `scripts/deployV4BaseUsdc.ts` already required it; the contract was archived prematurely.
- Historical result at the time of that fix: **324/324 tests passing**. Use
  `docs/CURRENT_STATE.md` for the latest dated verification result.

## Historical V4 Launch Documents (2026-05-28)

All in `docs/`:

- `NARA_V4_LAUNCH_RUNBOOK.md` — step-by-step deploy with gates
- `NARA_V4_PUBLIC_STATE.md` — honest current state for users/analysts
- `NARA_V4_LOCK_USER_GUIDE.md` — user-facing lock guide
- `NARA_V4_BOND_OPENING_CRITERIA.md` — bond opening gates
- `NARA_V4_DASHBOARD_SPEC.md` — frontend data spec
- `NARA_V4_ANALYST_POSTS.md` — draft comms (publish post-deploy)
- `NARA_V4_POST_LAUNCH_WORK.md` — deferred work tracker

**Controlled Stage A deployed to Base mainnet on 2026-07-26.** The token,
engine, and sealed reward reserve remain deployed only as recovery/retirement
sources. A corrected
liquidity trio and pool deployed on 2026-07-30 and traded, but economic testing
now requires retiring v4 and building a separate complete V5. Stage 0 was
executed successfully as recorded in the cold handoff. The eventual public
product scope remains NARA Baskets only, and baskets remain preview-only
through the V5 cutover gates.

Before changing or operating the deployed v4 hook, vault, compounder, fee
collector, seed flow, or basket limits, read
`docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`. Those configured-depth
rules are v4 recovery history. V5 preserves exact opening-price and reciprocal
sealed binding guarantees, but deliberately has no fixed `300 USDC` / `60,000
NARA` `protocolDepth` and must not reuse the v4 ERC-20 Engine notifier path.

## Canonical Documents

- Save all new protocol and operations markdown docs under `docs/` in this repository.
- `docs/README.md`, `docs/CLAUDE.md`, and `docs/APPS.md` are the landing docs for navigation and save location.
- `docs/NARA_V4_PROJECT_SCOPE.md` is the **historical V4 whole-project map** — five pillars, layer model, build-vs-reveal order, contract inventory, the two-build-system gotcha, and the audit-corrections log. It does not define V5.
- `docs/V4_CONTRACT_INDEX.md` is the **V4 source/recovery map** — each V4 contract → purpose → historical deploy step → its doc. It does not define V5 deployment.
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

The fresh v4 core is deployed and remains current pending explicit
recovery/retirement. Canonical addresses and evidence
are in `docs/CURRENT_STATE.md` and the read-first liquidity handoff. The
2026-07-30 pool remains active only until the reviewed v4 withdrawal. Do not
reuse the old pool-only launch path or pending low fee curve. Build and verify
the separate complete V5 stack under
`docs/NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md`, then run its full deployment,
preflight, smoke, monitoring, and soak gates.

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

- For deployed-v4 recovery state, integrate only against v4 ABIs generated from
  `contracts/v4/`. Future V5 consumers may use only generated V5 artifacts from
  an immutable reviewed origin commit and verified deployment manifest.
- The currently deployed recovery engine source is `contracts/v4/NARAEngine.sol`.
  No V5 Engine is deployed or production-approved.
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

Apply these rules according to the deployed version and the contract's actual
execution model. Never project a V4 routing surface onto V5.

### 1. Fee Routing Is Version-Scoped

- Deployed-v4 native ETH reward flows may use `NARAEngine.notifyEthRewards()`;
  guard the call with `if (fee > 0)` because that engine rejects zero value.
- Never grant `REWARD_NOTIFIER_ROLE` or call `notifyTokenRewards(token, amount)`
  on the deployed v4 Engine. Its repeated ERC-20 notification accounting can
  strand value. The retiring v4 liquidity vault therefore permits only its
  documented `Liquidity`, `Genesis`, and `GenesisSplit` routes.
- In deployed V4, only flat lock/unlock ETH fees set by the engine itself go to
  `accumulatedTreasuryEthFees`; that is the V4 engine's own internal accounting.
- V5 must not reuse either the V4 generic ERC-20 notifier or
  `syncEmissionReserve()` routing. Hook V5 accrues both fee currencies to its
  bound Vault. `BootstrapLiquidity` permanently classifies 100% of both
  currencies for liquidity; later `Shared` routing may send only an immutable,
  human-approved share `X` of post-transition fees to the fresh V5 Engine.
  The local Engine records active/inactive entitlement synchronously at accrual
  and later exact-pulls backing; a stale Engine routes that share inactive
  without blocking swaps. `X`, the inactive recipient, every production value,
  and every production address remain unapproved and undeployed.
- Never leave fees in an untracked balance. Each version needs explicit,
  conservation-tested pending, redeemed, and destination accounting.

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
□ Fee routing matches the reviewed version-specific policy and reconciles exactly?
□ V5 companions are direct non-proxy contracts with sealed configuration hashes?
□ V5 phase liquidity comes only from named, owned, active, recovery-locked POL?
□ All admin setters have min/max caps?
□ Reentrancy is blocked by nonReentrant or an audited callback/context guard?
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
