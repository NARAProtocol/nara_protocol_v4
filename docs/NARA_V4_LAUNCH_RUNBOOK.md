# NARA v4 Launch Runbook

Last updated: 2026-07-29.
Source of truth: `CURRENT_STATE.md`, `ROADMAP.md`, deploy scripts.  
This doc turns the roadmap phases into a concrete command-by-command operator sequence.

---

## Current Scope Override — Baskets-Only Launch

The 2026-07-26 launch scope is `apps/nara-baskets` plus the standalone
`nara-category-baskets-v1` contracts. The lockboard, position NFT allocation
layer, bonds, router/lenses, and composability are deferred. Lotto and Arena
remain retired.

Stage A token, engine, and sealed reward reserve are already deployed and
remain the active core. Do not repeat that core deployment. The original Stage
A hook, vault, and compounder are quarantined by the 2026-07-28 review. Their
pool is still uninitialized and must never be seeded.

The applicable next steps are a fresh hook/vault/compounder deployment,
fresh-address verification, notifier-role removal, pool initialization/liquidity,
basket deployment and verification, baskets frontend configuration, basket
monitoring, smoke tests, and observation.

The old compounder at `0xc327e50c14002a82c9F1477122204BB183f446Ab`
is permanently bound to the old vault and hook. Do not reuse it. The
replacement deployment script creates a matching trio and leaves the new pool
uninitialized. This runbook does not authorize that production transaction.

The full-protocol steps below are retained for later phases and do not gate the
baskets-only launch unless explicitly identified as basket dependencies.

---

## Pre-Launch Checklist (Before Any Deploy Command)

Complete every item before running anything on Base mainnet.

```
□ PRIVATE_KEY is the intended deployer EOA. Not a hot wallet.
□ BASE_RPC_URL points to a reliable Base mainnet RPC (Alchemy/Infura/Coinbase).
□ BASESCAN_API_KEY is set for contract verification.
□ `NARALauncher` constructor admin will be the deployer EOA that calls `launch()`.
□ V4_ADMIN_ADDRESS is a Safe or cold-wallet — NOT the deployer.
□ V4_TREASURY_ADDRESS is a Safe or cold-wallet — NOT the deployer.
□ Deployer wallet has at least 0.05 ETH on Base for gas.
□ npm run build passes locally.
□ npm run test passes locally (468/468 green as of 2026-07-29; run `npm test` for the live count).
□ npm run size passes (all contract bytecodes under EVM limit).
□ npm run slither:v4 passes.
□ Aderyn is rerun when its Linux binary is available; do not claim a current Aderyn pass otherwise.
□ npm run echidna:v4 passes (latest historical run: 13 properties, 10k+ calls; rerun on the release source).
□ No retired v4 incident-stack addresses are in .env.
```

---

## Step 1 — Historical Core Deployment (Completed; Do Not Run)

```bash
cd nara-protocol-hardhat
V4_SKIP_COMPOUNDER=1 npm run deploy:v4:base:usdc
```

> **Why `V4_SKIP_COMPOUNDER=1`:** the script requires either `V4_COMPOUNDER_ADDRESS` or
> `V4_SKIP_COMPOUNDER=1`, and the compounder cannot exist yet — it takes the vault address that *this*
> step creates. So deploy the vault now with the compounder unset, then deploy + wire the compounder
> in **Step 4b**. (If you skip this flag the step throws.)

**What it deploys:**
- `NARALauncher` → `NARAToken` + `NARAEngine` (atomic via CREATE2)
- `NARARewardReserve`
- `NARALiquidityGrowthVault` (compounder left unset — wired in Step 4b)
- `Create2HookDeployer` → `NARALiquidityGrowthHook` (hook address low bits must be `0x2088`)
- Registers the NARA/USDC pool on Uniswap v4; initialization and seeding are separate

**Output:** `deployments/v4-base-usdc-latest.json`

**Immediate gate — stop if any fails:**
```
□ v4-base-usdc-latest.json written
□ `NARALauncher.launcherAdmin()` matched the deployer before `launch()`
□ `NARAToken.FLASH_FEE_SINK()` equals deployed `NARAEngine`
□ `NARAEngine.NARA()` equals deployed `NARAToken`
□ Hook address low bits == 0x2088
□ Hook.NARA_TOKEN == deployed NARAToken address
□ Hook.VAULT == deployed Vault address
□ Vault.HOOK == deployed Hook address
□ Vault.ENGINE == deployed Engine address
□ NARA/USDC pool ID is non-zero in the deployment evidence
□ Hook.poolRegistered() is false and PoolManager slot0 is zero
□ Vault mode is Liquidity (default)
```

---

## Step 2 — Deploy the Replacement Liquidity Trio

After explicit human approval for the production deployment:

```powershell
$env:V4_NARA_TOKEN = "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A"
$env:V4_ENGINE = "0xbC2492BA73dE35d1114b5c18d7db633aca8963c9"
$env:V4_ADMIN_ADDRESS = "<approved Safe or cold admin>"
$env:V4_INITIAL_NARA_AMOUNT = "60000"
$env:V4_INITIAL_USDC_AMOUNT = "300"
npm run deploy:v4:pool:only
```

The script deploys a fresh vault, `0x2088` hook, CREATE2 helper, and compounder
bound to that exact vault/hook pair. It configures depth, calculates the exact
opening `sqrtPriceX96`, and transfers ownership while leaving the pool
unregistered. It does **not** initialize the pool, seed liquidity,
freeze the compounder, or grant `REWARD_NOTIFIER_ROLE`.

**Gate:**

```text
□ Fresh vault, hook, compounder, CREATE2 helper, and pool ID are recorded
□ Hook source matches the corrected configured-depth block-snapshot implementation
□ Vault source rejects Engine and Split with EngineTokenRoutingDisabled
□ Hook expectedSqrtPriceX96 is zero while unregistered
□ Deployment evidence planned sqrtPriceX96 equals the reviewed 60,000 NARA / 300 USDC ratio
□ Hook accepts only pool fee 3000 and tick spacing 60
□ Vault.hook(), Hook.vault(), Hook.token(), and Hook.base() match reciprocally
□ Compounder.vault() equals the fresh vault
□ Compounder.nara() and Compounder.usdc() equal the fresh token pair
□ Compounder constructor hook equals the fresh hook
□ PoolManager slot0 for the fresh pool is zero
```

---

## Step 2b — Sync Environment

```bash
npm run v4:env:sync          # generates .env.v4.fresh — review this output
npm run v4:env:sync:write    # merges fresh addresses into .env
```

**Manual check:** open `.env` and confirm every v4 address is the fresh deployment. Reject if any address matches the retired incident stack (see `CURRENT_STATE.md` → Retired v4 Incident Stack).

---

## Step 3 — Fresh-Address Preseed and Role Verification

Run the dormant-state verifier first:

```bash
npm run verify:v4:preseed
```

The two old depth transactions belong to the quarantined Stage A hook and are
historical evidence only. The replacement hook is configured before its pool is
registered, so its fresh read must show `60,000 NARA`, `300 USDC`, and no
pending update.

Before initialization, the engine admin must separately revoke
`REWARD_NOTIFIER_ROLE` from the Stage A admin
`0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` and Stage A vault
`0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988`. Then run:

```bash
npm run verify:v4:preseed
npm run verify:v4:launch-gates:preseed
```

Continue only when the fresh-address wiring passes and every notifier-role
check is false. The pre-seed gate requires the replacement compounder to be
configured but does not require its one-way freeze before the validation
compound. Deferred NFT and bond gates are reported as not applicable to the
baskets-only scope. This runbook does not authorize the revocation transactions.

---

## Step 4 — Atomically Register and Seed Liquidity

Controlled initial position: `60,000 NARA + 300 USDC`, targeting `$0.005` per
NARA and approximately `$600` of two-sided pool value. This uses part of the
locked `70,000 NARA` LP allocation; the remaining `10,000 NARA` stays in
custody for separately reviewed later liquidity additions. Do not open bonds
until liquidity is established.

```powershell
$env:V4_SEED_NARA = "60000"
$env:V4_SEED_USDC = "300"
$env:V4_LP_OWNER_ADDRESS = "<reviewed LP custody address>"
$env:V4_ATOMIC_LAUNCH_DEADLINE = "<future unix timestamp, at most seven days>"
npm run build:v4:atomic-pool-launch
```

The builder performs read-only Base checks and writes a Safe Transaction
Builder batch. It never submits a transaction. The final admin Safe must hold
the exact seed balances and own the unregistered hook. Review every call, then
execute the complete batch once. The batch sets exact temporary approvals,
calls `registerPool`, immediately calls PositionManager
`initializePool + modifyLiquidities`, and revokes approvals. Do not split,
reorder, or manually reproduce the calls. Direct execution of
`scripts/seedV4Liquidity.ts` is disabled.

Abort if the hook is already registered, slot0 is nonzero, the configured depth
is not `60,000 NARA / 300 USDC`, or the calculated opening ratio is not
`$0.005` per NARA. This runbook does not itself authorize the production
transaction.

After seeding:
```bash
npm run v4:env:sync:write    # captures LP NFT token ID from liquidity seed log
```

---

## Step 4b — Validate the Replacement Liquidity Compounder

The replacement compounder is deployed and wired by Step 2. Its address must
come from the fresh replacement manifest, not the Stage A evidence.

`NARALiquidityCompounderV4` is a full-range, no-swap, exact-spend POL adder.
POL is owner-recoverable via a **7-day recovery timelock** (`proposeRecovery`
→ wait `RECOVERY_DELAY` → `executeRecovery`: migrate / sweep / wind-down).

Run one reviewed validation compound after the pool is initialized and seeded.
Freeze the compounder only after exact-spend accounting and the resulting
full-range position are verified.

**Gate:**
```
□ NARALiquidityCompounderV4 address and constructor inputs match fresh deployment evidence
□ vault.compounder() == compounder and compounder.vault() == vault
□ compounder.owner() is the code-hash-verified production Safe
□ compounder.pendingRecovery().kind == None before activation
□ Route mode is Liquidity (default)
□ Explorer source verification completed on Basescan, Blockscout, and Sourcify
□ A validation compound minted a real full-range position (compounder.positionTokenId() != 0)
□ vault.freezeCompounder() executed once satisfied (or explicitly deferred + tracked)
□ Compounder address recorded in the fresh manifest, environment, and CURRENT_STATE.md
□ npm run verify:v4:launch-gates:baskets passes with the compounder frozen
```

Code is fork-validated against live v4
(`test/fork/NARALiquidityCompounderV4.fork.test.ts`).

---

## Step 5 — Smoke Test

```bash
npm run smoke:v4
```

Runs a test buy and test sell through the hook pool. Both must pass.

**Gate — stop if any fails:**
```
□ Buy swap succeeded and hook fee was collected
□ Sell swap succeeded and hook fee was collected
□ Vault balance increased after swaps
□ No EpochStale reverts during smoke
```

---

## Step 6 — Deploy Allocation Layer (NFT bonds closed)

```powershell
# Dry run first
$env:V4_ALLOC_DRY_RUN = "1"
npm run deploy:v4:allocations
Remove-Item Env:V4_ALLOC_DRY_RUN
```

Review output. If dry run is clean:

```bash
npm run deploy:v4:allocations
npm run verify:v4:allocations
```

**Approved allocation overrides (set explicitly; do not rely on script defaults):**
```
V4_OPS_AMOUNT_NARA=0
V4_BOND_AMOUNT_NARA=200000
V4_MIN_TREASURY_FLOAT_NARA=150000
V4_BOND_ACTIVE=false
```

**Deploys:**
- `NARAOpsVaultV4`
- `NARABondVaultV4`
- `NARAPositionAccountV4` (implementation)
- `NARAArtMetadataV1`
- `NARAArtSecurityPrintV1`
- `NARAArtCorePlateV1`
- `NARAArtGenesisPlateV1`
- `NARAPositionRendererV5` (immutable modular on-chain art and metadata)
- `NARAPositionNFTV4`
- `NARAGenesisRewardDistributorV4`
- `NARABondDepositoryV4NFT` (bonds closed by default)

**Gate:**
```
□ Treasury float >= 150,000 NARA before the approved post-deploy allocation split
□ Engine.bondVault == new NARABondVaultV4
□ Bond depository is NARABondDepositoryV4NFT (not raw bond path)
□ Bond terms inactive
□ Bond capacity == 0
□ NFT ownership assigned to intended Safe
□ Bond roles assigned to intended admin
```

---

## Step 7 — Deploy Router + Lens

```bash
ENGINE_V4=<engine_address> POSITION_NFT_V4=<nft_address> npm run deploy:v4:router:lens
```

**Output:** `deployments/router-lens-8453.json`

**Deploys (five components):**
- `NARARouter` — permit + sync + lock, permissionless `syncEpochs()`, keeper replacement
- `NARADashboardLens` — single-call `getUserState()` for all frontends
- `NARAPositionDataLensV1` — typed live-data surface for position NFTs
- `NARAProtocolStatsLensV1` — one-call protocol-wide stats (clock, participation, real-yield, runway)
- `NARACirculatingSupplyV1` — circulating-supply oracle (CoinGecko/CMC excluded-address method)
`BribeRouterV4` is intentionally skipped. Do not grant
`REWARD_NOTIFIER_ROLE` to any router, vault, Safe, or EOA on the deployed
engine.

**Update nara.ts with deployed addresses:**
```typescript
// apps/nara-lockboard/src/shared/nara.ts
NARA_ROUTER_ADDRESS = "<deployed>"
NARA_LENS_ADDRESS   = "<deployed>"
NARA_BRIBE_ROUTER_ADDRESS = "<deployed>"
```

---

## Step 8 — Deploy Composability Layer

Run only after Steps 1–7 are verified and at least 48h of monitoring has passed.

```bash
NODE_OPTIONS="--require ./polyfill.cjs" \
  NARA_TOKEN_V4=<addr> ENGINE_V4=<addr> POSITION_NFT_V4=<addr> ADMIN_ADDRESS=<safe_addr> \
  npx hardhat run scripts/deployComposabilityV4.ts --network base
```

**Deploys:**
- `NARAStakingPoolV4` (`stNARA` liquid wrapper)
- `NARAStakingPoolSYV4` (Pendle SY adapter)
- `NARAFractionalPositionFactoryV4`

**Gate:**
```
□ First stNARA deposit >= 100 NARA
□ DEAD_SHARES (1e18) minted to 0xdead on first deposit
□ exchangeRateWad() returns correct initial rate
□ SY.rewardIndexesCurrent() returns non-zero after deposit
□ CONFIG_ROLE and EMERGENCY_ROLE assigned to Safe, not deployer
```

---

## Step 9 — Role Transfer

All deployer-owned roles must be transferred to Safe/timelocked admin before public promotion.

```
□ NARAEngine: PARAM_ROLE → Safe
□ NARAEngine: TREASURY_ROLE → Safe
□ NARAEngine: REWARD_NOTIFIER_ROLE absent from the old admin EOA, old vault, replacement vault, Safe, deployer, and every router
□ NARALiquidityGrowthVault: owner → Safe (do this AFTER setCompounder/freezeCompounder, or have the Safe run those)
□ NARALiquidityGrowthHook: owner → Safe
□ NARALiquidityCompounderV4: owner == Safe (set at deploy — confirm, no transfer needed)
□ vault.freezeCompounder() executed (or deferred + tracked) — one-way lock of the compounder address
□ NARABondVaultV4: all roles → Safe
□ NARABondDepositoryV4NFT: all roles → Safe
□ NARAPositionNFTV4: owner → Safe
□ NARAStakingPoolV4: CONFIG_ROLE, EMERGENCY_ROLE → Safe (if deployed)
□ Deployer EOA has no remaining privileged roles
```

---

## Step 10 — 48h Monitored Observation

Before any public promotion or bond opening:

```
□ Watch at least 48 hours of live epoch advancement (JIT or via poke)
□ Confirm vault balance growing from hook fees
□ Confirm no EpochStale reverts in mempool
□ Confirm NARARouter.syncEpochs() callable by anyone
□ Confirm NARADashboardLens.getUserState() returns correct data
□ Confirm the launch-gate script reports REWARD_NOTIFIER_ROLE absent everywhere checked
```

---

## Step 11 — Update the Baskets Launch Surface

The current launch scope is baskets only. Lockboard is deferred; Lotto and
Arena are retired. Use generated active-v4 ABIs and the basket deployment
manifests as the integration source of truth.

```
□ apps/nara-baskets uses the fresh NARA token address
□ launch-baskets.json uses the fresh engine and hook addresses
□ every basket remains preview until its manager and adapter manifests exist
□ production status is set explicitly; missing status never defaults to live
□ retired v3 and incident-stack addresses are absent from UI copy and trust links
□ exact Base-mainnet fork preflight passes before any production transaction
□ basket buys read configured and live NARA/USDC depth and use the lower value
□ the NARA allocation is capped at 3% of effective USDC-side depth
□ at the 300 USDC seed, small buys work (60 USDC for 15% NARA baskets; 90 USDC for CORE)
□ unavailable or zero depth blocks buys before approval
□ no-swap withdrawUnderlying remains visible and tested as the exit fallback
```

---

## Step 12 — Open Bonds (Separate Decision)

Do NOT open bonds during launch day. See `NARA_V4_BOND_OPENING_CRITERIA.md` for the explicit criteria. Default state at launch: `V4_BOND_ACTIVE=false`, capacity = 0.

---

## Decision Rules (Stop Conditions)

| Condition | Action |
|---|---|
| Preflight fails | Stop. Fix address/config mismatch. Do not seed. |
| Smoke test fails | Stop. Do not proceed to allocations. Investigate hook/vault/routing. |
| Treasury float cannot satisfy the approved 70k LP + 40k vesting + 40k treasury split | Stop. Fix allocation inputs. |
| Any role still owned by deployer at Step 9 | Block public promotion. Transfer first. |
| epoch backlog > 8 during observation | Call `router.syncEpochs()`. Investigate if recurrent. |

---

## Post-Launch Monitoring (Ongoing)

| Metric | Where | Target |
|---|---|---|
| Epoch backlog | `router.getEpochState()` or `lens.getEpochState()` | `syncRequired == false` |
| Vault balance | `vault.tokenBalance()`, `vault.baseBalance()` | Growing with swap volume |
| Hook fee income | `lens.getUserState()` totals | Positive after each batch of swaps |
| Engine token notifier role | `hasRole(REWARD_NOTIFIER_ROLE, address)` for every known holder | Always false |
| stNARA exchange rate | `pool.exchangeRateWad()` | Monotonically non-decreasing |
| CDP paymaster credits | CDP dashboard | Keep > $10 to maintain auto-sync UX |

---

## Ops Contacts and Wallet Map

| Role | Address | Notes |
|---|---|---|
| Current final admin | `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` | Stage A EOA; Safe migration or explicit custody acceptance required before activation |
| Current treasury | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` | Receives treasury assets; currently an EOA |
| Deployer | Ephemeral EOA | No roles retained after Step 9 |
| BribeRouterV4 | Not deployed | ERC-20 reward route disabled for this engine |

Fill in this table after Step 9 and update `CURRENT_STATE.md`.
