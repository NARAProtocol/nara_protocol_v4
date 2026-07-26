# NARA v4 Stage B Integration Preflight

Date: 2026-07-26

Release deployed: `3215b69a1154b9c30957cd8d875b636dedc9d0ca`

Post-deployment operations commit: pending at report creation

## Decision

**Fresh-address Stage A wiring: PASS.**

**Public activation: BLOCKED.**

No pool initialization, liquidity seed, smoke transaction, or public frontend
activation was performed during this stage.

## Completed

- Generated and merged the canonical fresh v4 environment configuration.
- Created `deployments/v4-base-usdc-latest.json`.
- Added a phase-correct `npm run verify:v4:preseed` gate.
- Verified chain ID 8453, hook/vault/token/base/engine bindings, registered pool
  ID, deliberate uninitialized PoolManager state, and zero-liquidity state.
- Added direct PoolManager slot-zero initialization detection to the strict
  post-seed preflight.
- Verified all seven Stage A contracts on BaseScan.
- Added reproducible NARAEngine constructor arguments for explorer verification.
- Updated `docs/CURRENT_STATE.md` and `docs/NARA_V4_PUBLIC_STATE.md`.
- Configured the existing Ponder monitor with the Stage A start block
  `49148235` and fresh token, engine, hook, vault, treasury, admin, and deployer
  addresses.
- Regenerated monitor ABIs from active v4 Hardhat artifacts.
- Monitor tests and TypeScript checks passed.
- Protocol build, 453 tests, and bytecode-size gate passed.

## Remaining blockers, in required order

1. **Admin custody and notifier-role correction**
   - Final admin and treasury are EOAs, not Safes.
   - Confirm documented cold-wallet recovery or migrate control to a verified
     Safe before public activation.
   - Revoke `REWARD_NOTIFIER_ROLE` from the human final admin. Keep it only on
     approved notifier contracts such as the vault and later BribeRouter.

2. **Deploy and freeze the liquidity compounder**
   - Deploy `NARALiquidityCompounderV4`.
   - Verify source and ownership.
   - Final admin calls `vault.setCompounder`, validates the real route, then
     `vault.freezeCompounder`.

3. **Initialize and seed only after review**
   - Review exact NARA/USDC price, amounts, ticks, slippage, deadlines, and
     ownership of the LP NFT.
   - Initialize the registered pool and seed liquidity.
   - Record the real LP NFT ID and rerun environment sync.

4. **Deploy and verify NARA Baskets**
   - Launch scope is the standalone `nara-category-baskets-v1` Foundry package.
   - Deploy `NARAIndexFeeCollectorV2`, all five immutable adapters including
     `UniswapV4BasketAdapterV1`, and one
     `NARAImmutableBasketPositionManagerV1` per basket.
   - Every immutable manager must use the fresh NARA address, the v4 adapter,
     the reviewed NARA/USDC hook pool, and the V2 fee collector.
   - Save and verify one immutable manifest for CORE, AI, FINANCE, and CULTURE.

5. **Integrate only the baskets frontend**
   - Configure `apps/nara-baskets` from the verified basket manifests.
   - Run manifest/env parity, typecheck, builder tests, and production build.
   - The lockboard is not part of this launch and will not be rebuilt.
   - Lotto and Arena remain retired and must not be re-enabled.

6. **Complete basket monitoring**
   - The Ponder monitor exists; do not build a second core indexer.
   - Add the deployed basket managers and V2 fee collector to its fresh-address
     configuration and monitor their events from their deployment blocks.
   - Full position-NFT, bond, router, and composability monitoring is deferred
     because those protocol surfaces are outside the baskets-only launch.

7. **Final gates**
   - `npm run verify:v4:preflight`
   - Basket Foundry build, unit/fuzz/invariant, Base fork, and deployed-manifest
     verification gates
   - baskets frontend `check:manifest-env`, typecheck, tests, and production build
   - transactional smoke test only with explicit operator approval
   - minimum 48-hour observation of roles, epoch advancement, hook/vault
     accounting, indexer correctness, and alert delivery

## Current automated results

- `npm run verify:v4:preseed`: PASS
- `npm run verify:v4:preflight`: expected FAIL
  - compounder unset in Liquidity mode
  - LP NFT has zero liquidity
  - PoolManager pool uninitialized
- Launch-gate diagnostic: 5 PASS, 2 FAIL, 9 SKIP
  - FAIL: compounder unset
  - FAIL: human final admin holds `REWARD_NOTIFIER_ROLE`
  - SKIP: allocation/router/bond/NFT surfaces are outside the baskets-only
    launch and must remain disabled
