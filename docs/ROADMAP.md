# NARA Roadmap

Last updated: 2026-08-09.

> **Current-state override:** the fresh v4 core and Compounder are deployed and
> source-verified on Base mainnet. Hook/Vault ownership is accepted, and the
> NARA/USDC pool is initialized and seeded with a Safe-owned LP NFT. Compounder
> validation/freeze, Engine epoch recovery, allocations, periphery, and downstream handoffs remain
> separate gates. The current product launch scope is NARA Baskets only;
> Baskets remain preview-only, Lockboard is deferred, and Lotto and Arena are
> retired. Current activation authority is
> `deployments/v4-production-activation-2026-08-09.json` together with
> `docs/releases/NARA-20260809-v4-production-activation.md`. This file is
> product direction, not a deployment runbook.

This roadmap is anchored to [CURRENT_STATE.md](CURRENT_STATE.md). Code and deployment scripts are the source of truth. If roadmap language conflicts with code, update the roadmap.

---

## Core Position

NARA is a fixed-supply, time-preference yield protocol on Base.

Current v4 thesis:

- Fixed `1,000,000 NARA` supply.
- Fresh v4 launch through `NARALauncher`, `NARAToken`, and `NARAEngine`.
- Base native USDC liquidity on Uniswap v4.
- Dynamic liquidity-growth hook through `NARALiquidityGrowthHook`.
- Fee routing through `NARALiquidityGrowthVault`.
- Tradable lock positions through `NARAPositionNFTV4` and `NARAPositionAccountV4`, with immutable
  on-chain art and stable marketplace metadata via the modular `NARAPositionRendererV5`.
- Public bond path through `NARABondDepositoryV4NFT`, not raw direct-lock bonds.
- Genesis reward accounting through `NARAGenesisRewardDistributorV4`.
- Lazy UX + read layer: `NARARouter` (permit+sync+lock, permissionless
  `syncEpochs()`) and `NARADashboardLens` / `NARAPositionDataLensV1` (typed
  live reads). External ERC-20 bribes are disabled for the deployed engine.
- Optional composability through `NARAStakingPoolV4`, `NARAStakingPoolSYV4`, and fractional position wrappers.

The frontend is a launch and education surface. The protocol thesis is the durable layer; UI surfaces can change without changing the core commitment model.

---

## Current Starting Point

As of 2026-08-09:

- v3 is **retired**. All v3 mainnet contracts are archived at `archive/legacy-v3/`. See `archive/legacy-v3/README.md` for retired addresses.
- The 2026-04-23 v4 incident stack is retired for launch purposes.
- Controlled Stage A and the 2026-07-30 pool are historical evidence only.
- The fresh v4 core is deployed and source-verified from the immutable release
  commit recorded in `CURRENT_STATE.md`.
- The fresh NARA/USDC pool is registered, initialized, and seeded with
  `60,000 NARA + 300 USDC`; LP NFT `2898124` is Safe-owned.
- Receipt-pinned buy and sell tax tests passed and Vault accounting reconciled.
- The Vault has recorded and banked `1495.229242512170995797 NARA` and
  `20.462880 USDC`; the Compounder remains unvalidated and unfrozen with no
  position and zero compounded totals.
- At block `49734434`, the Engine was 30 epochs behind, beyond its eight-epoch
  JIT buffer. User-facing Engine writes remain an operations gate until the
  backlog is advanced and receipt-pinned.
- The current product launch scope is the NARA basket app only.
- Do not repeat the core deployment.
- Current v4 code uses `NARALiquidityGrowthHook` and `NARALiquidityGrowthVault`.
- Current v4 launch pair is NARA/Base native USDC.
- Current public bond path is `NARABondDepositoryV4NFT`.
- Current composability code is implemented locally but not deployed.

Latest verification — see [CURRENT_STATE.md](CURRENT_STATE.md#verification-evidence) for the
commands and dated stamp. As of 2026-08-09:

- Full Hardhat suite: 556 passing, with 5 opt-in Base-fork cases pending.
- Fresh deployment/receipt/Safe-batch evidence: 12 focused tests passing.
- The most recent basket verification evidence is recorded separately in
  [CURRENT_STATE.md](CURRENT_STATE.md); rerun it before basket deployment.
- `npm run size`: passed, all artifacts within EVM limits.
- Slither v4: passed (exit 0).
- `npm audit --audit-level=high` on 2026-08-08: 0 high / 0 critical after
  overriding Mocha's `js-yaml` to fixed `4.3.1`; 8 low upstream findings remain
  in Hardhat Verify's legacy Ethers v5 dependency chain with no available fix.
- The current-patch Aderyn rerun remains unavailable locally; do not present
  the 2026-06-08 Aderyn/Echidna results as verification of the 2026-07-28 patch.

---

## Principles

1. Code wins.
   Documentation, roadmap, frontend copy, and launch materials must follow current Solidity and scripts.

2. Do not reuse retired v4.
   The 2026-04-23 v4 stack is historical only. Do not market it, integrate against it, or use it as a public launch candidate.

3. Launch depth before leverage.
   NARA/USDC liquidity, hook/vault verification, and smoke tests come before bonds, composability, or external integrations.

4. Bonds open deliberately.
   `NARABondDepositoryV4NFT` should remain inactive until terms, capacity, treasury routing, Genesis metadata, and role ownership are verified.

5. Visibility is part of the product.
   Users and operators need clear state for epoch, activation, lock ownership, NFT position status, reward routing, liquidity, bond terms, and composability balances.

6. Composability is a second launch surface.
   stNARA, SY, and fractional wrappers increase integration surface and should launch only after fresh core and allocation verification.

---

## Phase 0: State Discipline

Status: active.

Goal: keep the workspace synchronized to the activated fresh core and pool
while the remaining Compounder, allocation, periphery, and downstream gates are
completed.

Deliverables:

- [CURRENT_STATE.md](CURRENT_STATE.md) reflects v3 retirement, the retired v4
  incident stack, and the fresh v4 activation evidence and remaining gates.
- [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md) reflects current deploy scripts.
- [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) reflects current launch gates.
- [V4_REDEPLOY_NO_SURPRISE_PLAN.md](V4_REDEPLOY_NO_SURPRISE_PLAN.md) reflects current allocation and launch sequencing.
- [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md) reflects current composability code.

Success criteria:

- No public doc presents retired v4 addresses as current.
- No launch doc points at retired liquidity tax contracts as current code.
- No launch doc equates the confirmed core/liquidity activation with complete
  product production readiness.

---

## Phase 1: Fresh v4 Core and Liquidity Activation

Status: core deployment, source verification, Hook/Vault Safe ownership,
Compounder deployment/wiring, atomic pool launch, and receipt-pinned buy/sell
tax verification are complete. Compounder validation and the separate one-way
freeze remain pending.

Goal: validate one live compound, reconcile the position and accounting
evidence, and only then perform the Safe's permanent Compounder freeze.

Required contracts:

- `NARALauncher`
- `NARAToken`
- `NARAEngine`
- `NARALiquidityGrowthVault`
- `NARALiquidityGrowthHook`
- `NARALiquidityCompounderV4`
- `Create2HookDeployer`

Completed core-deploy command — **do not rerun**:

```bash
npm run deploy:v4:base:usdc
```

Remaining Compounder validation path; builders do not send transactions:

```bash
npm run build:v4:compounder-validation
npm run build:v4:compounder-validation -- --freeze
```

The freeze builder is valid only after the separately executed live compound
has produced and reconciled a nonzero position. Both operations workflows stay
disabled until separately authorized.

Success criteria:

- Activation evidence remains pinned to the authoritative manifest and release
  record cited above.
- One live compound produces a nonzero Safe-reviewed position with reconciled
  Vault and Compounder totals.
- `freezeCompounder()` executes only after that evidence is verified.
- No workflow is enabled without a new explicit authorization and
  deployment-specific review.

---

## Phase 2: Allocation Layer And NFT Bonds

Status: pending as a separate deployment after the activated-liquidity evidence.

Goal: deploy v4 allocation contracts and keep public bonds closed until reviewed.

Required contracts:

- `NARAOpsVaultV4`
- `NARABondVaultV4`
- `NARAPositionAccountV4`
- `NARAPositionNFTV4`
- `NARAGenesisRewardDistributorV4`
- `NARABondDepositoryV4NFT`

Required command path:

```powershell
$env:V4_ALLOC_DRY_RUN = "1"
npm run deploy:v4:allocations
Remove-Item Env:V4_ALLOC_DRY_RUN
```

Then, if dry-run passes:

```bash
npm run deploy:v4:allocations
npm run verify:v4:allocations
```

Default allocation posture:

- `V4_OPS_AMOUNT_NARA=0`
- `V4_BOND_AMOUNT_NARA=200000`
- `V4_MIN_TREASURY_FLOAT_NARA=150000`
- `V4_BOND_ACTIVE=false`

Success criteria:

- Treasury float preserves the approved `70,000 NARA` LP allocation,
  `40,000 NARA` external vesting allocation, and `40,000 NARA` treasury allocation.
- Engine `bondVault` points to the new `NARABondVaultV4`.
- Public bond depository is `NARABondDepositoryV4NFT`.
- Bond terms remain inactive.
- Bond capacity remains `0`.
- Position NFT ownership and bond roles are assigned intentionally.
- Public bond UI uses NFT bonds, not raw direct-lock bonds.

---

## Phase 3: Launch UX And State Visibility

Status: pending verified allocation/periphery addresses and explicit downstream
handoff; the basket app remains preview-only.

Goal: make fresh v4 understandable before promoting it.

Focus:

- Fresh address display and chain checks.
- NFT position mint, claim, extend, and unlock flows.
- Genesis metadata display.
- NARA/USDC pool and liquidity visibility.
- Hook/vault fee routing visibility.
- Bond status: inactive, active, capacity, terms, stale terms, and release cap.
- Epoch status and JIT advancement expectations.
- Reward panels for NARA, ETH, and ERC-20 rewards.
- Clear fallback for users who cannot use sponsored transactions.

Success criteria:

- Frontend never points to retired v4 addresses.
- Users can distinguish direct locks from NFT-managed locks.
- Users can see whether bonds are closed before attempting to buy.
- Operators can see preflight, smoke, liquidity, and allocation status.

---

## Phase 4: Liquidity Growth Operations

Status: pool fees are live and banked, but maintenance is inactive pending one
validated compound, the permanent Compounder freeze, and separate keeper/workflow
authorization.

Goal: operate `NARALiquidityGrowthVault` deliberately.

Route modes:

- `Liquidity`
- `Genesis`
- `GenesisSplit`

The `Engine` and `Split` enum values are unreachable and must remain disabled.

Launch expectation:

- Keep the current `Liquidity` mode.
- Treat the wired Compounder as unusable for routine operations until the live
  validation and permanent freeze gates pass.
- Treat the recorded Vault fees as banked, not compounded POL, until on-chain
  Compounder position and totals prove otherwise.

Success criteria:

- Route mode is recorded in ops docs.
- Compounder status is recorded.
- Keeper bounty settings are intentional.
- Any move to `Genesis` or `GenesisSplit` is documented before execution.

---

## Phase 5: Composability Launch

Status: implemented locally, not deployed.

Goal: turn v4 positions into DeFi-compatible surfaces after core and allocation verification.

Implemented contracts:

- `NARAStakingPoolV4`
- `NARAStakingPoolSYV4`
- `NARAFractionalPositionFactoryV4`
- `NARAFractionalPositionV4`

Required command path:

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployComposabilityV4.ts --network base
```

Launch gates:

- Fresh v4 core verified.
- Allocation layer verified if bonds or Genesis rewards are in scope.
- Focused composability tests pass.
- Static analysis is run or explicitly waived.
- `CONFIG_ROLE` and `EMERGENCY_ROLE` are assigned to production-controlled addresses.
- First `stNARA` deposit is at least `100 NARA`.
- `NARAStakingPoolSYV4.rewardIndexesCurrent()` and `claimRewards(address user)` are tested on deployed contracts.

Success criteria:

- `stNARA` can be minted through `NARAStakingPoolV4.deposit(uint256 naraAmount, uint256 minShares)`.
- Idle NARA can be locked through `lockLiquid(uint256 grossAmount, uint256 minWeight)`.
- Redemptions queue through `queueRedeem(uint256 shares)`.
- SY accepts NARA and stNARA deposits.
- SY redeems only to stNARA.
- Fractional wrappers can be created and bound for approved owners of standard
  (non-Genesis) NFTs; binding succeeds only for the factory's current canonical
  `fractionalOf(tokenId)` wrapper.

---

## Phase 6: External Markets And Integrations

Status: deferred until composability is deployed and monitored.

Goal: let third-party capital use v4 positions safely.

Focus:

- NARA/stNARA AMM for instant exit liquidity.
- Pendle PT/YT market after SY reward-index validation.
- Indexing for fractional position wrappers.
- Marketplace guidance for post-unlock fractional wrappers.
- Lending collateral research only after stNARA has liquidity, history, and an oracle design.

Decision rule:

- Do not contact Pendle for a live market until deployed `NARAStakingPoolSYV4` passes reward-index, reward-claim, and disabled internal-balance redeem checks.
- Do not pursue lending collateral before liquidity, oracle, and redemption-risk analysis exists.

---

## Phase 7: Ecosystem Expansion

Status: future product lane.

Goal: expand beyond the initial token/liquidity/bond/composability launch.

Focus:

- v4 sponsor hub.
- v4 sponsor fund adapter.
- Game or campaign reward routing on top of v4 positions.
- Cross-chain wrapper research only after Base-native v4 is stable.
- Governance or coordination layers above core contracts, not inside the engine.

Deferred contracts:

- `NARASponsorHubV4`
- `NARASponsorFundAdapterV4`

---

## What We Will Not Do

- Reuse the retired 2026-04-23 v4 incident stack as the public launch candidate.
- Deploy retired liquidity tax contracts as current v4 launch code.
- Open bonds just to create headline activity.
- Market the protocol as risk-free.
- Hide activation, epoch, reward, or liquidity mechanics from users.
- Treat gas sponsorship as a Solidity dependency.
- Contact Pendle for a live market before SY validation.
- Treat a roadmap item as complete until deployed addresses and verification are recorded.

---

## Decision Rules

If fresh v4 preflight fails:

- Stop deployment flow.
- Fix address/config mismatch.
- Do not seed liquidity.

If smoke test fails:

- Do not launch.
- Do not proceed to allocations.
- Investigate hook, vault, route, token approval, and liquidity path.

If treasury float cannot preserve the approved `150,000 NARA` post-reserve allocation:

- Stop allocation deploy.
- Fix allocation inputs before retrying.

If bonds are requested before verification:

- Keep `V4_BOND_ACTIVE=false`.
- Keep capacity at `0`.
- Complete allocation and role review first.

If composability is requested before core verification:

- Defer.
- Complete core deploy, smoke test, allocations, and static analysis first.

If users do not understand rewards:

- Build visibility first.
- Do not solve a comprehension problem with more promotional copy.

---

## Near-Term Build Order

1. Finish documentation sync to the activation authority files.
2. Build and independently review one bounded Compounder validation action.
3. After Safe execution, reconcile the nonzero position, liquidity, custody,
   and exact Vault/Compounder accounting.
4. Only then build, review, and execute the permanent Compounder freeze.
5. Keep both v4 operations workflows disabled until a new explicit order,
   dedicated keeper review, and deployment-specific authorization.
6. Deploy and verify allocations with NFT bonds closed.
7. Deploy periphery separately and update frontend/monitor configuration only
   through explicit fresh-address handoffs.
8. Keep Baskets preview-only until its verified manifests and handoff exist.
9. Open public lock flow through `NARAPositionNFTV4` only after its gates.
10. Open bonds only after terms, capacity, and roles are reviewed.
11. Deploy composability only after core and allocation verification, then
    validate SY before Pendle outreach.
