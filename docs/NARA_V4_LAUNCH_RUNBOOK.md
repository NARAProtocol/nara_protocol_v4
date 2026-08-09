# NARA v4 Launch Runbook

> **Fresh full-v4 release only.** Use [CURRENT_STATE.md](CURRENT_STATE.md) as
> the state authority. The experimental protocol V5 proposal is obsolete and
> deleted. Controlled Stage A and the 2026-07-30 pool are historical
> incident/recovery evidence; do not reuse their token, Engine, Hook, Vault,
> Compounder, pool, role, or manifest addresses. This runbook requires one
> immutable reviewed v4 origin commit and a new verified full-v4 manifest.

> **2026-08-09 execution boundary:** the fresh core, ownership acceptance,
> Compounder deployment/wiring, and atomic pool seed described below have
> already executed. Do not replay Steps 1 through 5. Resume only from the
> current Engine epoch-recovery and Compounder-validation gates in
> `CURRENT_STATE.md` and
> `deployments/v4-production-activation-2026-08-09.json`.

Last updated: 2026-08-09.
Source of truth: `CURRENT_STATE.md`, `ROADMAP.md`, deploy scripts.  
This doc turns the roadmap phases into a concrete command-by-command operator sequence.

---

## Current Scope — Fresh Full-v4 Origin, Baskets Preview

The candidate includes a fresh v4 Token, Engine, Reserve, Hook, Vault, pool,
Compounder, and every explicitly selected release module. Freeze that scope
before deployment. The publishable frontend is
`../nara-category-baskets-v1/app/` and remains preview-only until the protocol
and basket repositories each have immutable origin evidence and verified
manifests. Lockboard and composability remain deferred unless separately added
to the approved scope; Lotto and Arena remain retired.

No deployment or transaction is authorized by this document. Production
actions require explicit human approval after source, tests, static/fuzz gates,
custody, economic inputs, and the exact atomic batch are reviewed.

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
□ Deployer wallet has at least 0.001 ETH on Base and passes the deployment
  script's higher live-fee requirement when Base fees demand it.
□ npm run build passes locally.
□ npm run test passes locally (556 passing with 5 opt-in Base-fork cases pending
  as of 2026-08-09; run `npm test` for the live count).
□ npm run size passes (all contract bytecodes under EVM limit).
□ npm run slither:v4 passes.
□ Aderyn is rerun when its Linux binary is available; do not claim a current Aderyn pass otherwise.
□ npm run echidna:v4 passes (latest historical run: 13 properties, 10k+ calls; rerun on the release source).
□ The full 40-character immutable origin commit is recorded in the release handoff.
□ No Stage A, 2026-07-30, or other retired incident-stack address is in the candidate manifest or launch environment.
```

---

## Step 1 — Deploy the Fresh Full-v4 Core

```bash
cd nara-protocol-hardhat
V4_SKIP_COMPOUNDER=1 npm run deploy:v4:base:usdc
```

> **Why `V4_SKIP_COMPOUNDER=1`:** the script requires either `V4_COMPOUNDER_ADDRESS` or
> `V4_SKIP_COMPOUNDER=1`, and the compounder cannot exist yet — it takes the vault address that *this*
> step creates. So deploy the vault now with the compounder unset, then deploy + wire the compounder
> in **Step 2c**. (If you skip this flag the step throws.)

**What it deploys:**
- `NARALauncher` → `NARAToken` + `NARAEngine` (atomic via CREATE2)
- `NARARewardReserve`
- `NARALiquidityGrowthVault` (compounder left unset — wired in Step 2c)
- `Create2HookDeployer` → `NARALiquidityGrowthHook` (hook address low bits must be `0x2088`)
- Derives and records the fresh NARA/USDC PoolKey and configures Hook depth;
  registration, initialization, and seeding all remain deferred to the atomic Safe batch

**Output:** a new `deployments/v4-base-usdc-latest.json` tied to the immutable
origin commit. Never copy or edit the historical Stage A/2026-07-30 manifests
into this output.

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

## Step 2 — Verify the Fresh Core Before Any Pool Action

Do not use `deploy:v4:pool:only` to combine a new liquidity trio with a
historical Token or Engine. The Token, Engine, Reserve, Hook, Vault, and pool key
must all come from the same fresh full-v4 deployment evidence. The Compounder is
deployed only after the fresh Vault exists and must bind reciprocally to that
fresh Hook/Vault/token pair. Pool initialization and seeding remain separate,
human-approved actions.

**Gate:**

```text
□ Fresh Token, Engine, Reserve, vault, hook, CREATE2 helper, and pool ID are recorded
□ Every recorded address is absent from the Stage A and 2026-07-30 historical manifests
□ Hook source matches the corrected configured-depth block-snapshot implementation
□ Vault source rejects Engine and Split with EngineTokenRoutingDisabled
□ Hook expectedSqrtPriceX96 is zero while unregistered
□ Deployment evidence planned sqrtPriceX96 equals the reviewed 60,000 NARA / 300 USDC ratio
□ Hook accepts only pool fee 3000 and tick spacing 60
□ Every supported exact-input swap through the registered canonical pool is taxed; exact-output reverts
□ ERC-20 transfers and third-party/unregistered pools are not described or tested as universally taxed
□ Vault.hook(), Hook.vault(), Hook.token(), and Hook.base() match reciprocally
□ PoolManager slot0 for the fresh pool is zero
```

---

## Step 2b — Sync Environment

```bash
npm run v4:env:sync          # generates .env.v4.fresh — review this output
npm run v4:env:sync:write    # merges fresh addresses into .env
```

**Manual check:** open `.env` and confirm every v4 address is the fresh deployment. Reject if any address matches the retired incident stack (see `CURRENT_STATE.md` → Retired v4 Incident Stack).
The fresh sync must also populate the receipt-pinned
`V4_ENGINE_DEPLOYMENT_BLOCK`, `V4_ENGINE_DEPLOYMENT_TX_HASH`, release commit,
and `V4_SAFE_CODEHASH`. A missing evidence field is a stop; never recover it
from a historical replacement manifest.

---

## Step 2c — Deploy and Wire the Replacement Compounder

The Compounder depends on the fresh Vault address, so it cannot be part of the
initial core transaction sequence. Deploy it now, before the pre-seed gates,
using only addresses from the reviewed fresh-core manifest:

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployLiquidityCompounderV4.ts --network base
```

The Compounder constructor owner must be the production Safe. The core deploy
starts `Ownable2Step` transfers for the Hook and Vault, so the Safe must first
call `acceptOwnership()` on both and verify that each `owner()` is the Safe.
While the fresh Vault still has zero lifetime fees and zero token balances,
that Safe then calls `vault.setCompounder(freshCompounder)`. Confirm all
reciprocal bindings and leave the address **unfrozen** until the post-seed
validation compound succeeds.

**Gate:**
```
□ Compounder.vault() equals the fresh Vault
□ Compounder.nara() and Compounder.usdc() equal the fresh token pair
□ Compounder Hook, PoolManager, PositionManager, Permit2, fee, tick spacing, and PoolId match the fresh manifest
□ Compounder.owner() is the code-hash-verified production Safe
□ Hook.owner() and Vault.owner() are the production Safe; pending ownership alone is insufficient
□ vault.compounder() equals the fresh Compounder
□ vault.compounderFrozen() is false pending live validation
```

---

## Step 3 — Fresh-Address Preseed and Role Verification

Run the dormant-state verifier first:

```bash
npm run verify:v4:preseed
```

Historical depth transactions and notifier-role assignments are evidence only;
never replay them against the candidate. The fresh Hook is configured before
its pool is registered. Confirm its values equal the separately reviewed
candidate inputs and that no update is pending. The fresh deployment must
renounce its constructor-granted notifier role, and the gate must reconstruct
role history and prove that neither the custody Safe nor fresh Vault has
`REWARD_NOTIFIER_ROLE`. Then run:

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
Builder batch. It never submits a transaction. It pins Base native USDC,
Permit2, PoolManager, PositionManager, the approved buy/sell curves, and the
Hook/Vault/Engine bindings. It receipt-anchors the complete notifier-role
history, verifies the Safe runtime hash and approved 2-of-3 Safe 1.4.1 state,
encodes the exact canonical MultiSendCallOnly payload, and simulates all child
calls from the Safe context. The artifact records the Safe nonce, Safe
transaction hash, packed-call hash, and simulation block.

The final admin Safe must hold the exact seed balances and own the unregistered
hook. Review every call and require the signing UI's nonce, MultiSend target,
operation, calldata, and Safe transaction hash to match the generated artifact,
then execute the complete batch once. Any intervening Safe transaction makes
the artifact stale and requires regeneration. The batch sets exact temporary
approvals, calls `registerPool`, immediately calls PositionManager
`initializePool + modifyLiquidities`, and revokes approvals. Do not split,
reorder, or manually reproduce the calls. Direct execution of
`scripts/seedV4Liquidity.ts` is disabled.

Delete or ignore every previously generated atomic batch. Regenerate only from
the fresh manifest immediately before signing. Abort if the hook is already
registered, slot0 is nonzero, the configured depth is not `60,000 NARA / 300
USDC`, the approved curve differs, the exact Safe simulation fails, or the
calculated opening ratio is not `$0.005` per NARA. This runbook does not itself
authorize the production transaction.

After seeding:
```bash
npm run v4:env:sync:write    # captures LP NFT token ID from liquidity seed log
```

---

## Step 4b — Validate and Freeze the Replacement Liquidity Compounder

The Compounder was deployed and wired in Step 2c after the fresh Vault existed.
Its address must come from the fresh full-v4 manifest, never historical evidence.

`NARALiquidityCompounderV4` is a full-range, no-swap, exact-spend POL adder.
POL is owner-recoverable via a **7-day recovery timelock** (`proposeRecovery`
→ wait `RECOVERY_DELAY` → `executeRecovery`: migrate / sweep / wind-down).

Run one reviewed validation compound after the pool is initialized and seeded.
Freeze the compounder only after exact-spend accounting and the resulting
full-range position are verified. Follow
[NARA_V4_COMPOUNDER_VALIDATION_RUNBOOK.md](NARA_V4_COMPOUNDER_VALIDATION_RUNBOOK.md)
without combining the validation and freeze into one transaction:

```powershell
npm run build:v4:compounder-validation
# Safe executes the reviewed validation batch. Record its tx hash and receipt block.
# Reconcile exact Vault counters, banked remainders, position ownership, and liquidity.
npm run build:v4:compounder-validation -- --freeze
# Safe executes the separately reviewed irreversible freeze batch.
npm run verify:v4:launch-gates:baskets
```

**Gate:**
```
□ NARALiquidityCompounderV4 address and constructor inputs match fresh deployment evidence
□ vault.compounder() == compounder and compounder.vault() == vault
□ compounder.owner() is the code-hash-verified production Safe
□ compounder.pendingRecovery().kind == None before activation
□ Route mode is Liquidity (default)
□ Explorer source verification completed on Basescan, Blockscout, and Sourcify
□ A validation compound minted a real full-range position (compounder.positionTokenId() != 0)
□ Validation transaction hash and receipt block are recorded
□ Vault counters, banked balances, position ownership, and liquidity reconcile to that receipt
□ vault.freezeCompounder() executed in a separate reviewed transaction before smoke testing
□ vault.compounderFrozen() is true before Step 5
□ Compounder address recorded in the fresh manifest, environment, and CURRENT_STATE.md
□ npm run verify:v4:launch-gates:baskets passes with the compounder frozen
```

Code is fork-validated against live v4
(`test/fork/NARALiquidityCompounderV4.fork.test.ts`).

The validation transaction hash and receipt block must be recorded. Vault
lifetime-compounded counters, banked balances, Compounder position ownership,
and nonzero liquidity must reconcile to that confirmed receipt. The separate
freeze transaction must then confirm `vault.compounderFrozen() == true` before
Step 5. Do not smoke-test if the receipt is missing or unreconciled, a recovery
is pending, an exact-spend check differs, or the one-way freeze is unconfirmed.

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

**Phase 2 is currently stopped at these inputs.** `deployV4Allocations.ts`
rejects any allocation plus required float above `300,000 NARA`, while the
stated values total `200,000 + 0 + 150,000 = 350,000 NARA`. Do not alter the
economics in this runbook and do not run the real allocation deploy until a
separate human-approved decision resolves the mismatch and the dry run passes.

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
- `NARARouter` — permit + bounded epoch sync + lock; it does not eliminate
  operations when backlog exceeds the configured call plan
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
// BribeRouterV4 is intentionally not deployed for this Engine.
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
□ NARALiquidityGrowthVault: Safe accepted ownership before Step 2c wiring
□ NARALiquidityGrowthHook: Safe accepted ownership before Step 2c wiring
□ NARALiquidityCompounderV4: owner == Safe (set at deploy — confirm, no transfer needed)
□ vault.freezeCompounder() executed and receipt-verified before smoke — one-way lock of the compounder address
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
□ ../nara-category-baskets-v1/app uses the fresh NARA token address from the verified handoff
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
| Validation compound receipt is missing/unreconciled or Compounder is unfrozen | Stop. Do not smoke-test or proceed to allocations. |
| Smoke test fails | Stop. Do not proceed to allocations. Investigate hook/vault/routing. |
| Phase 2 still specifies 200k bond allocation plus 150k minimum float | Stop. The allocation script rejects the 350k total against its 300k guard; obtain a separate approved economics decision. |
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
| Final admin | `<from verified fresh manifest>` | Human-approved Safe or timelock; never inherit Stage A ownership |
| Treasury | `<from verified fresh manifest>` | Human-approved custody address; never inherit a historical default |
| Deployer | Ephemeral EOA | No roles retained after Step 9 |
| BribeRouterV4 | Not deployed | ERC-20 reward route disabled for this engine |

Fill in this table after Step 9 and update `CURRENT_STATE.md`.
