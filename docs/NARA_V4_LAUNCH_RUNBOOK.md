# NARA v4 Launch Runbook

Last updated: 2026-05-28.  
Source of truth: `CURRENT_STATE.md`, `ROADMAP.md`, deploy scripts.  
This doc turns the roadmap phases into a concrete command-by-command operator sequence.

---

## Pre-Launch Checklist (Before Any Deploy Command)

Complete every item before running anything on Base mainnet.

```
□ PRIVATE_KEY is the intended deployer EOA. Not a hot wallet.
□ BASE_RPC_URL points to a reliable Base mainnet RPC (Alchemy/Infura/Coinbase).
□ BASESCAN_API_KEY is set for contract verification.
□ V4_ADMIN_ADDRESS is a Safe or cold-wallet — NOT the deployer.
□ V4_TREASURY_ADDRESS is a Safe or cold-wallet — NOT the deployer.
□ Deployer wallet has at least 0.05 ETH on Base for gas.
□ npm run build passes locally.
□ npm run test passes locally (360/360 green as of 2026-06-07; run `npm test` for the live count — earlier "324"/"568" figures predate suite growth and the 2026-05-27 v4 reset, not test loss).
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
npm run deploy:v4:base:usdc
```

**What it deploys:**
- `NARALauncher` → `NARAToken` + `NARAEngine` (atomic via CREATE2)
- `NARALiquidityGrowthVault`
- `Create2HookDeployer` → `NARALiquidityGrowthHook` (hook address low bits must be `0x2088`)
- Registers and seeds NARA/USDC pool on Uniswap v4

**Output:** `deployments/v4-base-usdc-latest.json`

**Immediate gate — stop if any fails:**
```
□ v4-base-usdc-latest.json written
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

Approximate: `$1,000` worth. Do not open bonds until liquidity is established.

```bash
npx tsx scripts/seedV4Liquidity.ts
```

After seeding:
```bash
npm run v4:env:sync:write    # captures LP NFT token ID from liquidity seed log
```

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

**Default allocation inputs (do not deviate without explicit review):**
```
V4_OPS_AMOUNT_NARA=0
V4_BOND_AMOUNT_NARA=289970
V4_MIN_TREASURY_FLOAT_NARA=10030
V4_BOND_ACTIVE=false
```

**Deploys:**
- `NARAOpsVaultV4`
- `NARABondVaultV4`
- `NARAPositionAccountV4` (implementation)
- `NARAPositionRendererV4` (immutable on-chain art and metadata)
- `NARAPositionNFTV4`
- `NARAGenesisRewardDistributorV4`
- `NARABondDepositoryV4NFT` (bonds closed by default)

**Gate:**
```
□ Treasury float >= 10,030 NARA
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

**Deploys:**
- `NARARouter` — permit + sync + lock, permissionless `syncEpochs()`, keeper replacement
- `NARADashboardLens` — single-call `getUserState()` for all frontends
- `BribeRouterV4` — permissionless ERC-20 bribe delivery to NARA lockers

This step also deploys `NARAPositionDataLensV1`, the typed live-data surface for position NFTs.

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
□ NARALiquidityGrowthVault: owner → Safe
□ NARALiquidityGrowthHook: owner → Safe
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

## Step 11 — Update Frontend

Update all frontend apps with fresh v4 contract addresses and ABIs. The lockboard has the canonical ABI registry at `apps/nara-lockboard/src/shared/nara.ts`.

```
□ NARA_TOKEN_ADDRESS updated to fresh NARAToken
□ NARA_ENGINE_ADDRESS updated to fresh NARAEngine
□ NARA_LOCK_NFT_ADDRESS updated to fresh NARAPositionNFTV4
□ NARA_ROUTER_ADDRESS updated
□ NARA_LENS_ADDRESS updated
□ NARA_BRIBE_ROUTER_ADDRESS updated
□ All retired v3 and incident-stack addresses removed from UI copy and trust links
□ "Base mainnet live" copy updated to reflect the actual fresh v4 launch
□ OWL P0 fixes applied: no retired addresses as trust anchors
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
| Treasury float < 10,030 NARA after allocation | Stop. Fix allocation inputs. |
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
| Admin / Safe | TBD — set at deploy | Owns all protocol roles post Step 9 |
| Treasury | TBD — set at deploy | Receives ETH fees, NARA treasury float |
| Deployer | Ephemeral EOA | No roles retained after Step 9 |
| BribeRouterV4 | Set at Step 7 | Holds REWARD_NOTIFIER_ROLE |

Fill in this table after Step 9 and update `CURRENT_STATE.md`.
