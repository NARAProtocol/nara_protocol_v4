# NARA Roadmap

Last updated: 2026-08-21.

> **Current-state override:** the fresh v4 core and Compounder are deployed and
> source-verified on Base mainnet. Hook/Vault ownership is accepted, and the
> NARA/USDC pool is initialized and seeded with a Safe-owned LP NFT. Engine
> epoch recovery and Compounder validation/freeze are receipt-pinned as
> complete. The immediate contract-release step is the exact seven-contract
> Position NFT Phase 2; its hardened workflow exists locally but is unmerged
> and has no Base deployment manifest. Allocations, bonds, Genesis distribution,
> router/lens periphery, the Engine lifecycle smoke, and downstream handoffs
> remain separate later gates. Baskets remain preview-only, Lockboard is
> deferred, and Lotto and Arena are retired. Current authority includes
> `deployments/v4-compounder-activation-2026-08-09.json` together with
> `docs/releases/NARA-20260809-v4-compounder-activation.md`. This file is
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
- Phase-2 tradable lock positions through `NARAPositionNFTV4` and
  `NARAPositionAccountV4`, with immutable on-chain art and stable marketplace metadata via the
  modular `NARAPositionRendererV5`; not deployed yet.
- Phase-3 public bond path through `NARABondDepositoryV4NFT`, not raw direct-lock bonds.
- Phase-3 Genesis reward accounting through `NARAGenesisRewardDistributorV4`.
- Phase-3 lazy UX + read layer: `NARARouter` (permit+sync+lock, permissionless
  `syncEpochs()`) and `NARADashboardLens` / `NARAPositionDataLensV1` (typed
  live reads). External ERC-20 bribes are disabled for the deployed engine.
- Optional composability through `NARAStakingPoolV4`, `NARAStakingPoolSYV4`, and fractional position wrappers.

The frontend is a launch and education surface. The protocol thesis is the durable layer; UI surfaces can change without changing the core commitment model.

---

## Current Starting Point

As of 2026-08-21:

- v3 is **retired**. All v3 mainnet contracts are archived at `archive/legacy-v3/`. See `archive/legacy-v3/README.md` for retired addresses.
- The 2026-04-23 v4 incident stack is retired for launch purposes.
- Controlled Stage A and the 2026-07-30 pool are historical evidence only.
- The fresh v4 core is deployed and source-verified from the immutable release
  commit recorded in `CURRENT_STATE.md`.
- The fresh NARA/USDC pool is registered, initialized, and seeded with
  `60,000 NARA + 300 USDC`; LP NFT `2898124` is Safe-owned.
- Receipt-pinned buy/sell and same-block tax tests passed and Vault accounting
  reconciled.
- Compounder validation/freeze succeeded. Compounder-owned LP NFT `2898486`
  has liquidity `9455824137787`; unmatched inventory is banked in the
  Compounder, not active LP.
- Engine activation-backlog recovery is receipt-pinned. Recurring maintenance
  and the Engine lock/activation/claim/unlock lifecycle smoke remain gated.
- The immediate deployment scope is the exact seven-contract Position NFT Phase 2. The workflow is
  local/unmerged; there is no verified Base NFT address or final manifest, and every consumer remains
  disabled.
- Baskets remain preview-only and are not the origin for NFT deployment facts.
- Do not repeat the core deployment.
- Current v4 code uses `NARALiquidityGrowthHook` and `NARALiquidityGrowthVault`.
- Current v4 launch pair is NARA/Base native USDC.
- Current public bond path is `NARABondDepositoryV4NFT`.
- Current composability code is implemented locally but not deployed.

Latest verification — see [CURRENT_STATE.md](CURRENT_STATE.md#verification-evidence) for the
commands and dated stamp. As of 2026-08-09:

- Full Hardhat suite: 556 passing, with 7 opt-in Base-fork cases pending.
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

Goal: keep the workspace synchronized to the activated fresh core, pool, and
Compounder while the remaining operations, lifecycle-smoke, allocation,
periphery, and downstream gates are completed.

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

Status: complete onchain. Core deployment, source verification, Hook/Vault Safe
ownership, Compounder deployment/wiring, atomic pool launch, receipt-pinned tax
verification, bounded Compounder validation, and the separate one-way freeze
are complete. Protected merge of the evidence remains a release-process gate.

Goal: preserve the receipt-pinned validation, position/accounting
reconciliation, and permanent Compounder binding freeze as immutable evidence.

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

Completed Compounder validation path; do not replay these one-time actions:

```bash
npm run build:v4:compounder-validation
npm run build:v4:compounder-validation -- --freeze
```

The freeze was built only after the separately executed live compound produced
and reconciled a nonzero position. The liquidity workflow was separately
authorized and activated on 2026-08-15 after an additional bounded compound and
hosted idle/heartbeat verification. The epoch workflow was separately activated
with its own bounded keeper path.

Success criteria:

- Activation evidence remains pinned to the authoritative manifest and release
  record cited above.
- One live compound produced a nonzero Safe-reviewed position with reconciled
  Vault and Compounder totals.
- `freezeCompounder()` executed only after that evidence was verified.
- Any workflow activation or material policy change has a new explicit
  authorization and deployment-specific review.

---

## Phase 2: Position NFT And Modular On-Chain Art

Status: active release preparation. The contracts and fail-closed deployment workflow exist in the
local release worktree, but they are unmerged and not deployed. No planned address is a production
address, and consumers remain disabled.

Goal: deploy and finalize exactly the optional Position NFT wrapper and its immutable art/account
dependencies without coupling the release to allocations, bonds, Genesis distribution, or periphery.

Exact deployment order:

1. `NARAArtMetadataV1`
2. `NARAArtSecurityPrintV1`
3. `NARAArtCorePlateV1`
4. `NARAArtGenesisPlateV1`
5. `NARAPositionRendererV5`
6. `NARAPositionAccountV4`
7. `NARAPositionNFTV4`

Phase-2 policy:

- NFT owner is the manifest-pinned production Admin Safe from construction.
- ERC-2981 royalties are exactly `1000 BPS` (10.00%) to the manifest-pinned production Treasury
  address and are permanently frozen by the Safe.
- NARA/token wrapper claim fees are both `0 BPS`, their recipient is zero, and those values are
  permanently frozen.
- ERC-2981 is marketplace-advisory. Treasury controls later royalty use; royalties do not
  automatically reach lockers.
- Genesis distributor/minter remains unset, no `GenesisMinterSet` event is allowed, and Genesis
  configuration remains available only for a separately reviewed Phase-3 release.
- Minting is permissionless from the confirmed NFT deployment block, so every verifier reconciles
  the complete `PositionMinted` history and `nextTokenId`.

Canonical flow:

1. Complete source tests, current byte sizes, static analysis, local art QA, and the atomic fresh-fork
   rehearsal on the exact source commit.
2. Merge the audited source commit through protected `origin/main`; generate the nonce/address plan
   and artifact evidence from that clean commit; then merge the evidence-only second commit.
3. Bind exact source/evidence commits, CI, audit, art, roadmap, plan, royalty/fee policy, and explicit
   human approval in the ignored external attestation.
4. Use the dedicated idle one-attempt signer and `npm run deploy:v4:position-nft` once. Stop on nonce,
   code, receipt-journal, runtime, or prior-attempt ambiguity; never retry blindly.
5. Run strict pending verification, all-seven source verification, and the just-in-time Safe packet
   builder. Any Safe nonce drift from the deployment snapshot is a stop-and-review condition.
6. Human Safe signers execute only the exact five-call royalty/claim-fee reset-and-freeze batch.
   Finalize and rerun the final verifier.
7. Complete separately approved value-bearing smoke, the 48-hour monitored hold, immutable protocol
   origin evidence, and the explicit downstream handoff before enabling any consumer.

Canonical command names, separated by the human/evidence gates above:

```text
npm run preview:v4:position-nft-art
npm run rehearse:v4:position-nft
npm run plan:v4:position-nft
npm run build:v4:position-nft-plan-evidence
npm run deploy:v4:position-nft
npm run verify:v4:position-nft:pending
npm run verify:v4:position-nft:sources
npm run build:v4:position-nft-finalization
# human Safe review/sign/execute occurs here; no CLI signs or sends it
npm run finalize:v4:position-nft-evidence
npm run verify:v4:position-nft
```

This is not a single uninterrupted command sequence. Source/evidence commits, external attestation,
explicit deployment approval, Safe review, and separate smoke approval remain mandatory boundaries.

The authoritative checklist and operator sequence are
[`NARA_V4_NFT_PRODUCTION_PLAN.md`](NARA_V4_NFT_PRODUCTION_PLAN.md) and
[`releases/NARA-20260821-v4-position-nft-phase2.md`](releases/NARA-20260821-v4-position-nft-phase2.md).

`npm run deploy:v4:allocations` is intentionally quarantined and refuses execution. It is not a
Phase-2 dry-run or deployment path. Do not bypass that refusal or restore the former
`V4_ALLOC_DRY_RUN` instructions.

Success criteria:

- exact seven-contract receipts, runtime/source proofs, constructors, bindings, and start blocks are
  recorded in the finalized manifest;
- the royalty receiver/rate and both zero claim fees are read back as permanently frozen;
- owner, Safe state/nonce continuity, Genesis-zero history, and complete permissionless mint history
  reconcile;
- smoke and the 48-hour observation hold pass; and
- consumers remain quarantined until an immutable manifest/ABI/start-block handoff exists.

---

## Phase 3: Allocations, Bonds, Genesis, Router/Lens, And Public Exposure

Status: deferred until Phase 2 has a finalized immutable origin, successful smoke and 48-hour hold,
and an explicit downstream handoff. No combined Phase-3 production release is currently authorized;
the old broad allocation command remains quarantined, and the presence of a narrower periphery
script is not deployment approval.

Goal: review and deploy the allocation/bond/Genesis and read/router layers as separate evidence-bound
releases, keep bonds closed until their independent economic and role gates pass, and expose only
verified state to users.

Deferred Phase-3 contract surfaces include:

- `NARAOpsVaultV4`, `NARABondVaultV4`, `NARABondDepositoryV4NFT`, and
  `NARAGenesisRewardDistributorV4`;
- `NARARouter`, `NARADashboardLens`, `NARAPositionDataLensV1`, `BribeRouterV4`, and
  `NARACirculatingSupplyV1`; and
- any Genesis distributor/minter binding on the Phase-2 Position NFT.

Focus:

- Build a new fail-closed plan and manifest schema for each Phase-3 release instead of reviving the
  retired `deploy:v4:allocations` flow.
- Preserve treasury float and keep bond terms/capacity inactive until the separately approved
  valuation, terms, routing, roles, and Genesis metadata gates pass.
- Verify every allocation, role, NFT minter/distributor binding, router/lens binding, address, runtime,
  ABI, and indexed start block before handoff.
- Show fresh addresses, chain checks, direct-versus-NFT lock paths, Genesis provenance, bond closed/
  active state, pool/liquidity state, epoch state, reward routes, and clear self-directed exits.
- Publish public discovery/documentation only after protocol and direct-consumer evidence is immutable.

Success criteria:

- No Phase-3 address is copied from a plan, environment, old allocation script, or uncommitted tree.
- Allocation, bond, Genesis, and router/lens releases each have protected origin, receipts, source and
  runtime verification, post-state readback, smoke, observation, and handoff evidence.
- Users can distinguish direct locks from NFT-managed locks and see that bonds are closed before
  attempting any value-bearing action.
- Consumers fail closed when a verified manifest, ABI, or start block is absent.

---

## Phase 4: Liquidity Growth Operations

Status: pool fees are live, the first bounded compound and permanent binding freeze are complete,
and the separately credentialed bounded liquidity maintainer is active under its verified policy,
schedule, runtime guard, and heartbeat.

Goal: operate `NARALiquidityGrowthVault` deliberately.

Route modes:

- `Liquidity`
- `Genesis`
- `GenesisSplit`

The `Engine` and `Split` enum values are unreachable and must remain disabled.

Launch expectation:

- Keep the current `Liquidity` mode.
- Preserve the currently authorized liquidity maintainer's dedicated keeper, `17,47` UTC schedule,
  token-use/price bounds, runtime binding, and heartbeat. Do not broaden, reuse, disable, or change
  it without a new explicit order and deployment-specific review.
- Distinguish active LP inputs from unmatched inventory banked in the
  Compounder.

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

1. Finish the exact Phase-2 Position NFT source, tests, current size/static-analysis evidence, local
   art QA, atomic fork rehearsal, and operator documentation.
2. Merge the audited source commit through protected CI, generate the deployment plan/artifact
   evidence from that exact clean origin, and merge the evidence-only second commit.
3. Complete the ignored external attestation and explicit human approval, then execute the dedicated
   one-attempt seven-contract deployment without any blind retry.
4. Complete strict pending verification, all-seven source verification, nonce/state-bound JIT Safe
   preparation, exact five-call human Safe finalization, and final evidence/readback.
5. Complete separately approved Position NFT smoke and the 48-hour monitored hold; commit the final
   manifest/observation evidence and issue the immutable downstream handoff.
6. Keep Swarm, baskets, analytics, frontends, and public documentation NFT surfaces disabled until
   that handoff; keep Baskets preview-only until their own verified manifests exist.
7. Continue monitoring both active maintainers while keeping credentials, schedules, bounds, and
   deployment bindings separate unless a new explicit order authorizes a reviewed change.
8. Only then design and review new Phase-3 allocation/bond/Genesis and router/lens release paths;
   do not revive the quarantined broad allocation deployer.
9. Open bonds only after the Phase-3 valuation, terms, capacity, treasury routing, Genesis metadata,
   role, smoke, and observation gates pass.
10. Deploy composability only after its dependencies have verified manifests and handoffs, then
    validate SY before Pendle outreach.
