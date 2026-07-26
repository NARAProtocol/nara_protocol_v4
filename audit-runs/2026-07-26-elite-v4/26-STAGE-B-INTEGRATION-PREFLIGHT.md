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

2. **Deploy the allocation and position layer**
   - `NARAPositionAccountV4`
   - `NARAPositionNFTV4` and renderer dependencies
   - `NARAGenesisRewardDistributorV4`
   - `NARABondVaultV4` and `NARABondDepositoryV4NFT`, initially closed
   - `NARAOpsVaultV4`
   - Verify all source and run `verify:v4:allocations`.

3. **Deploy the integration layer**
   - `NARARouter`
   - `NARADashboardLens`
   - `NARAPositionDataLensV1`
   - `NARAProtocolStatsLensV1`
   - `NARAEngineOpsRouterV1`
   - `BribeRouterV4`
   - Grant only the intended notifier and operations roles.

4. **Complete the indexer configuration**
   - The Ponder indexer exists; do not build a second core indexer.
   - Its full profile correctly remains fail-closed until the position NFT,
     bond/ops allocation contracts, operations router, break-glass Safe, and
     database URL exist.
   - Once deployed, populate the remaining `V4_*` addresses and start the
     indexer from block `49148235`.

5. **Rebuild frontend integrations**
   - Lockboard, lotto, and arena still contain retired v3 addresses/ABIs.
   - Lotto and arena remain retired and must not be re-enabled.
   - Rebuild the lockboard against generated v4 token/engine/NFT/router/lens
     ABIs after those contracts are deployed. Do not perform an address-only
     swap against v3 ABIs.

6. **Deploy and freeze the liquidity compounder**
   - Deploy `NARALiquidityCompounderV4`.
   - Verify source and ownership.
   - Final admin calls `vault.setCompounder`, validates the real route, then
     `vault.freezeCompounder`.

7. **Initialize and seed only after review**
   - Review exact NARA/USDC price, amounts, ticks, slippage, deadlines, and
     ownership of the LP NFT.
   - Initialize the registered pool and seed liquidity.
   - Record the real LP NFT ID and rerun environment sync.

8. **Final gates**
   - `npm run verify:v4:preflight`
   - `npm run verify:v4:launch-gates` with every required address populated
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
  - SKIP: undeployed allocation/router/bond/NFT surfaces
