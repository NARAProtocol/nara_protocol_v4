# NARA Roadmap

Last updated: 2026-07-26.

> **Current-state override:** the fresh v4 Stage A core is deployed on Base
> mainnet and remains dormant. The current product launch scope is NARA
> Baskets only. Lockboard is deferred; Lotto and Arena are retired. This file
> is product direction, not a deployment runbook. See [CURRENT_STATE.md](CURRENT_STATE.md).

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

As of 2026-07-26:

- v3 is **retired**. All v3 mainnet contracts are archived at `archive/legacy-v3/`. See `archive/legacy-v3/README.md` for retired addresses.
- The 2026-04-23 v4 incident stack is retired for launch purposes.
- Controlled Stage A is deployed and deliberately dormant.
- The registered NARA/USDC pool is uninitialized and has no liquidity.
- The current product launch scope is the NARA basket app only.
- Do not repeat the core deployment.
- Current v4 code uses `NARALiquidityGrowthHook` and `NARALiquidityGrowthVault`.
- Current v4 launch pair is NARA/Base native USDC.
- Current public bond path is `NARABondDepositoryV4NFT`.
- Current composability code is implemented locally but not deployed.

Latest verification — see [CURRENT_STATE.md](CURRENT_STATE.md#verification-status) for the live
commands and dated stamp. As of 2026-07-29:

- Full Hardhat suite: 468 passing, 0 failing. This includes the real Uniswap v4
  split-invariance test and the read-only Stage A quarantine check.
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

Goal: keep the workspace synchronized while the deployed Stage A stack remains
dormant and the baskets activation gates are completed.

Deliverables:

- [CURRENT_STATE.md](CURRENT_STATE.md) reflects v3 retirement, the retired v4 incident stack, and the fresh v4 deployment plan.
- [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md) reflects current deploy scripts.
- [V4_LAUNCH_CHECKLIST.md](V4_LAUNCH_CHECKLIST.md) reflects current launch gates.
- [V4_REDEPLOY_NO_SURPRISE_PLAN.md](V4_REDEPLOY_NO_SURPRISE_PLAN.md) reflects current allocation and launch sequencing.
- [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md) reflects current composability code.

Success criteria:

- No public doc presents retired v4 addresses as current.
- No launch doc points at retired liquidity tax contracts as current code.
- No launch doc says v4 is production-live before fresh deployment and verification.

---

## Phase 1: Fresh v4 Core Redeploy

Status: next production milestone.

Goal: deploy a fresh v4 core stack on Base using current code.

Required contracts:

- `NARALauncher`
- `NARAToken`
- `NARAEngine`
- `NARALiquidityGrowthVault`
- `NARALiquidityGrowthHook`
- `Create2HookDeployer`

Required command path:

```bash
npm run deploy:v4:base:usdc
npm run verify:v4:preflight
npm run build:v4:atomic-pool-launch
npm run smoke:v4
```

Success criteria:

- `deployments/v4-base-usdc-latest.json` is written.
- Fresh addresses are copied into `.env` before post-deploy scripts run.
- Hook address low bits satisfy `0x2088`.
- Hook token/base/vault match the fresh deployment.
- Vault token/base/hook/engine match the fresh deployment.
- NARA/USDC pool is registered and seeded.
- Smoke test buy and sell both pass.
- `NARALiquidityGrowthVault` balance deltas match expected hook-fee behavior.

---

## Phase 2: Allocation Layer And NFT Bonds

Status: after fresh core smoke test.

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

Status: after verified v4 addresses exist.

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

Status: after fresh core deployment and initial liquidity.

Goal: operate `NARALiquidityGrowthVault` deliberately.

Route modes:

- `Liquidity`
- `Genesis`
- `GenesisSplit`

The `Engine` and `Split` enum values are unreachable and must remain disabled.

Launch expectation:

- Start in `Liquidity` mode to build depth.
- Use `V4_SKIP_COMPOUNDER=1` if no reviewed compounder adapter exists.
- Treat pool fees as parked in the vault until compounder or route-mode changes are reviewed.

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

1. Finish one-file-at-a-time documentation sync.
2. Run full local verification.
3. Run static analysis or record explicit waiver.
4. Confirm deployment environment variables.
5. Deploy fresh v4 core.
6. Run preflight, seed liquidity, and smoke test.
7. Deploy allocations with NFT bonds closed.
8. Verify allocations.
9. Update current-state docs and frontend config with fresh addresses.
10. Open public lock flow through `NARAPositionNFTV4`.
11. Open bonds only after terms, capacity, and roles are reviewed.
12. Deploy composability only after core and allocation verification.
13. Validate SY before Pendle outreach.
