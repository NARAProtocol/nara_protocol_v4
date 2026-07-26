# NARA v4 Launch Runbook

Last updated: 2026-07-26.
Source of truth: `CURRENT_STATE.md`, `ROADMAP.md`, deploy scripts.  
This doc turns the roadmap phases into a concrete command-by-command operator sequence.

---

## Current Scope Override — Baskets-Only Launch

The 2026-07-26 launch scope is `apps/nara-baskets` plus the standalone
`nara-category-baskets-v1` contracts. The lockboard, position NFT allocation
layer, bonds, router/lenses, and composability are deferred. Lotto and Arena
remain retired.

Stage A core is already deployed. Use
`deployments/v4-base-usdc-latest.json` and
`npm run verify:v4:preseed`; do not repeat the core deployment step. The
applicable next steps are compounder deployment, pool initialization/liquidity,
basket deployment and verification, baskets frontend configuration, basket
monitoring, smoke tests, and observation.

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
□ npm run test passes locally (453/453 green as of 2026-07-26; run `npm test` for the live count).
□ npm run size passes (all contract bytecodes under EVM limit).
□ npm run slither:v4 passes.
□ npm run aderyn:v4 passes.
□ npm run echidna:v4 passes (3 properties, 10k+ calls).
□ No retired v4 incident-stack addresses are in .env.
```

---

## Step 1 — Deploy v4 Core

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
- Registers and seeds NARA/USDC pool on Uniswap v4

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
□ NARA/USDC pool ID non-zero and registered
□ Vault mode is Liquidity (default)
```

---

## Step 2 — Sync Environment

```bash
npm run v4:env:sync          # generates .env.v4.fresh — review this output
npm run v4:env:sync:write    # merges fresh addresses into .env
```

**Manual check:** open `.env` and confirm every v4 address is the fresh deployment. Reject if any address matches the retired incident stack (see `CURRENT_STATE.md` → Retired v4 Incident Stack).

---

## Step 3 — Preflight Verification

```bash
npm run verify:v4:preflight
```

Checks hook/vault/pool/routing configuration against the fresh addresses. Must produce no errors.

---

## Step 4 — Seed Liquidity

Controlled initial position: `60,000 NARA + 300 USDC`, targeting `$0.005` per
NARA and approximately `$600` of two-sided pool value. This uses part of the
locked `70,000 NARA` LP allocation; the remaining `10,000 NARA` stays in
custody for separately reviewed later liquidity additions. Do not open bonds
until liquidity is established.

```powershell
$env:V4_SEED_NARA = "60000"
$env:V4_SEED_USDC = "300"
$env:V4_SEED_SLIPPAGE_BPS = "200"
npx tsx scripts/seedV4Liquidity.ts
```

The script still contains a historical `30 NARA` default. Do not run it unless
the three reviewed overrides above are present and its pre-transaction output
shows `60,000 NARA` and `300 USDC`. This runbook does not itself authorize the
production transaction.

After seeding:
```bash
npm run v4:env:sync:write    # captures LP NFT token ID from liquidity seed log
```

---

## Step 4b — Deploy Liquidity Compounder (close the POL flywheel)

The vault's default `Liquidity` route mode compounds the skim back into protocol-owned liquidity, but
it is **inert until a compounder is wired** (`vault._compoundUnchecked` reverts with none set). Deploy
the production compounder now that the vault + pool exist, then wire it.

```bash
NODE_OPTIONS="--require ./polyfill.cjs" \
  NARA_TOKEN_V4=<addr> USDC_ADDRESS=<usdc> ADMIN_ADDRESS=<safe> \
  LIQUIDITY_VAULT_V4=<vault_from_step1> \
  V4_POOL_MANAGER=<pm> V4_POSITION_MANAGER=<posm> V4_PERMIT2=<permit2> V4_HOOK=<hook_from_step1> \
  V4_POOL_FEE=3000 V4_TICK_SPACING=60 \
  npx hardhat run scripts/deployLiquidityCompounderV4.ts --network base
```

**Deploys:** `NARALiquidityCompounderV4` — full-range, no-swap, exact-spend POL adder. Owner is set to
the Safe (`ADMIN_ADDRESS`) at construction; POL is owner-recoverable via a **7-day recovery timelock**
(`proposeRecovery` → wait `RECOVERY_DELAY` → `executeRecovery`: migrate / sweep / wind-down).

**Wire it (vault owner = deployer until Step 9):**
```bash
# vault.setCompounder(<compounder_address>)   — required, or Liquidity mode stays inert
# Run one validation compound (small) and confirm a real position was added before freezing.
# vault.freezeCompounder()                     — one-way; do AFTER validation (may defer to post-monitoring)
```

**Gate:**
```
□ NARALiquidityCompounderV4 deployed; owner == Safe
□ vault.setCompounder(compounder) done; vault.compounder() == compounder
□ Route mode is Liquidity (default)
□ A validation compound minted a real full-range position (compounder.positionTokenId() != 0)
□ vault.freezeCompounder() executed once satisfied (or explicitly deferred + tracked)
□ Compounder address recorded into .env (V4_COMPOUNDER_ADDRESS) and CURRENT_STATE.md from the
  liquidity-compounder-v4-*.json deploy log (the env-sync reads the core deploy log, not this one)
```

Code is fork-validated against live v4 (`test/fork/NARALiquidityCompounderV4.fork.test.ts`); this step
is deployment + wiring only.

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

## Step 7 — Deploy Router + Lens + BribeRouterV4

```bash
ENGINE_V4=<engine_address> POSITION_NFT_V4=<nft_address> npm run deploy:v4:router:lens
```

**Output:** `deployments/router-lens-8453.json`

**Deploys (all six):**
- `NARARouter` — permit + sync + lock, permissionless `syncEpochs()`, keeper replacement
- `NARADashboardLens` — single-call `getUserState()` for all frontends
- `NARAPositionDataLensV1` — typed live-data surface for position NFTs
- `NARAProtocolStatsLensV1` — one-call protocol-wide stats (clock, participation, real-yield, runway)
- `NARACirculatingSupplyV1` — circulating-supply oracle (CoinGecko/CMC excluded-address method)
- `BribeRouterV4` — permissionless ERC-20 bribe delivery to NARA lockers

**Critical post-deploy action (without this, `BribeRouterV4.notify()` reverts):**

```bash
# Grant REWARD_NOTIFIER_ROLE to BribeRouterV4
# This must be called by the engine admin (V4_ADMIN_ADDRESS / Safe)
# Role hash: keccak256("REWARD_NOTIFIER_ROLE")
cast send <ENGINE_ADDRESS> \
  "grantRole(bytes32,address)" \
  "0x$(cast keccak "REWARD_NOTIFIER_ROLE")" \
  <BRIBE_ROUTER_V4_ADDRESS> \
  --rpc-url $BASE_RPC_URL \
  --private-key $PRIVATE_KEY
```

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
□ NARAEngine: REWARD_NOTIFIER_ROLE held by BribeRouterV4 (already set)
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
□ Confirm BribeRouterV4.notify() works with a small test token amount
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
| BRIBE_ROUTER notified | Event `BribeNotified` on BribeRouterV4 | Increases as external protocols adopt |
| stNARA exchange rate | `pool.exchangeRateWad()` | Monotonically non-decreasing |
| CDP paymaster credits | CDP dashboard | Keep > $10 to maintain auto-sync UX |

---

## Ops Contacts and Wallet Map

| Role | Address | Notes |
|---|---|---|
| Current final admin | `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` | Stage A EOA; Safe migration or explicit custody acceptance required before activation |
| Current treasury | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` | Receives treasury assets; currently an EOA |
| Deployer | Ephemeral EOA | No roles retained after Step 9 |
| BribeRouterV4 | Set at Step 7 | Holds REWARD_NOTIFIER_ROLE |

Fill in this table after Step 9 and update `CURRENT_STATE.md`.
