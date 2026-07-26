# Current State

Last updated: 2026-07-26 (fresh v4 controlled Stage A deployment on Base mainnet).

This is the canonical state document for the active NARA workspace. Code is the source of truth. When this document conflicts with Solidity or deployment scripts, update this document.

Resume current launch work from this document and
[NARA_V4_LAUNCH_RUNBOOK.md](NARA_V4_LAUNCH_RUNBOOK.md). Older handoffs,
incident reports, and research plans are historical inputs, not executable
instructions.

---

## 🚨 v4 RESET — 2026-05-27

On **2026-05-27** the project committed to a clean fresh start on v4. The entire v3 protocol stack is **retired**. This is unconditional — not conditional on the v4 redeploy completing.

- v3 is not "still live until v4 launches." v3 is retired now.
- The fresh NARA token deployed from `contracts/v4/NARAToken.sol` at
  `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`. The v3 token
  `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` remains permanently retired.
- All v3 mainnet contracts are archived at `archive/legacy-v3/`. See [archive/legacy-v3/README.md](../archive/legacy-v3/README.md) for the full retired-address table.
- The only current code path is `contracts/v4/`.
- `apps/nara-baskets/` is the only current launch frontend. It must remain in
  preview until verified basket deployment manifests exist. Lockboard is
  deferred; Lotto and Arena are retired.

---

## Operational Truth

The v4 incident stack deployed on 2026-04-23 is retired for launch purposes. It remains relevant only for recovery, accounting, and historical analysis.

The fresh v4 core was deployed from release
`3215b69a1154b9c30957cd8d875b636dedc9d0ca` on 2026-07-26. This is a
controlled Stage A deployment: core contracts and the sealed reserve are live,
but the pool is uninitialized, has no liquidity, and is not a public market.
Do not market or reuse the retired v4 incident stack.

Current launch scope: NARA Baskets only. The NARA/USDC pool must be initialized,
seeded, smoke-tested, and observed for the documented soak period before any
basket can be enabled. Position NFTs, bonds, router/lenses, lockboard, and
composability are deferred. Lotto and Arena are retired.

---

## v4 Is Not v3

Any AI, developer, or operator reading this document must treat v4 as a different system from v3.

| Area | v3 | v4 |
|---|---|---|
| Engine | `NARAEngineV2` | `NARAEngine` |
| Token | `NARATokenV3` | `NARAToken` |
| Epoch advance | Keeper-driven cron; backlog can block writes | JIT auto-advance inside user calls, capped by `MAX_JIT_ADVANCE = 8`; remaining backlog returns `EpochStale` |
| LP pair | NARA/WETH on Uniswap v3 | NARA/USDC on Uniswap v4 |
| Hook | Flat tax-style hook in older design | `NARALiquidityGrowthHook` with dynamic buy/sell pressure tiers |
| Fee vault | Simple tax vault | `NARALiquidityGrowthVault` with `Liquidity`, `Engine`, `Split`, `Genesis`, and `GenesisSplit` routes |
| Reward tokens | ETH-focused reward flow | ETH plus role-gated ERC-20 reward flow through `notifyTokenRewards(address,uint256)` |
| Position IDs | Per-wallet indexed positions | Global `positionId`, starting at 1 |
| Position ownership | v3 wrapper retrofit | Native `NARAPositionNFTV4` plus clone account |
| Bonds | Raw-position bond path exists | Launch path is `NARABondDepositoryV4NFT`, which mints position NFTs |

---

## v4 Core Contracts in Repo

These are the current v4 source contracts. The Stage A subset identified below
has been deployed; the remaining launch surfaces are still pending.

| Contract | Path | Role |
|---|---|---|
| `NARALauncher` | `contracts/v4/NARALauncher.sol` | One-shot atomic launcher for token and engine |
| `NARAToken` | `contracts/v4/NARAToken.sol` | Fixed-supply ERC-20 with ERC-2612 permit, ERC-1363, capped ERC-3156 flash mint, and multicall |
| `NARAEngine` | `contracts/v4/NARAEngine.sol` | Core locking, JIT epoch advance, NARA/ETH/ERC-20 reward accounting |
| `NARAPositionNFTV4` | `contracts/v4/NARAPositionNFTV4.sol` | ERC-721 controller for v4 engine positions |
| `NARAPositionAccountV4` | `contracts/v4/NARAPositionAccountV4.sol` | Per-NFT clone account that owns the engine position |
| `NARAPositionRendererV5` | `contracts/v4/NARAPositionRendererV5.sol` | Immutable modular fully on-chain art, security-print SVG plates, stable marketplace metadata, collection metadata. Uses `NARAArtMetadataV1`, `NARAArtCorePlateV1`, `NARAArtGenesisPlateV1`, and `NARAArtSecurityPrintV1`. |
| `NARAGenesisRewardDistributorV4` | `contracts/v4/NARAGenesisRewardDistributorV4.sol` | ETH and ERC-20 reward accounting for Genesis positions |
| `NARABondVaultV4` | `contracts/v4/NARABondVaultV4.sol` | Bond inventory vault with market and cap timelocks |
| `NARABondDepositoryV4` | `contracts/v4/NARABondDepositoryV4.sol` | Direct raw-position bond depository; not the preferred launch path |
| `NARABondDepositoryV4NFT` | `contracts/v4/NARABondDepositoryV4NFT.sol` | NFT bond depository; preferred launch path |
| `NARALiquidityGrowthHook` | `contracts/v4/NARALiquidityGrowthHook.sol` | Uniswap v4 exact-input hook with dynamic fee curves |
| `NARALiquidityGrowthVault` | `contracts/v4/NARALiquidityGrowthVault.sol` | Pool-fee vault for LP compounding, engine routing, and Genesis routing. LP compounding plugs in an external `ILiquidityCompounder` — production adapter is `NARALiquidityCompounderV4` (see "Liquidity Routing" below). |
| `NARALiquidityCompounderV4` | `contracts/v4/NARALiquidityCompounderV4.sol` | Deployed at `0xc327e50c14002a82c9F1477122204BB183f446Ab` and set on the Stage A vault. Full-range, no-swap, exact-spend POL adapter with remainder banking and a 7-day recovery timelock. `compounderFrozen` remains `false` until the initialized-pool smoke test succeeds. |
| `NARAOpsVaultV4` | `contracts/v4/NARAOpsVaultV4.sol` | One-shot operations vesting vault capped at `10,000 NARA` |

---

## v4 Router / Lens Layer (added 2026-05-28)

Lazy UX + read layer for any frontend. Deploy step `deploy:v4:router:lens`. Full spec: `ROUTER_LENS.md`.

| Contract | Path | Role |
|---|---|---|
| `NARARouter` | `contracts/v4/router/NARARouter.sol` | Permit + sync + lock in one tx; permissionless `syncEpochs()` (replaces the Railway keeper cron) |
| `NARADashboardLens` | `contracts/v4/router/NARADashboardLens.sol` | Single-call `getUserState(user, positionIds[], nftTokenIds[])` for any frontend |
| `NARAPositionDataLensV1` | `contracts/v4/router/NARAPositionDataLensV1.sol` | Typed live position-NFT data for apps; batches capped at 100. Added in the 2026-06 NFT presentation pass |
| `BribeRouterV4` | `contracts/v4/router/BribeRouterV4.sol` | Permissionless `notify(token, amount)` → engine. Any external protocol can bribe NARA lockers. Needs `REWARD_NOTIFIER_ROLE` granted after deploy |

---

## v4 Core Behavior

### JIT Epoch Auto-Advance

`NARAEngine` auto-advances epochs during user-facing calls such as lock, unlock, and claim. A single call advances at most `MAX_JIT_ADVANCE = 8` epochs. If backlog is larger, users or keepers can call `poke()` repeatedly.

### Configurable Epoch Length

`EPOCH_LENGTH` is set at deployment through the engine constructor. Do not assume 900 seconds unless the deployment config proves it. Check `engine.EPOCH_LENGTH()`.

### Direct ETH Handling

`NARAEngine.receive()` reverts with `DirectEthTransferForbidden`. ETH rewards enter through `notifyEthRewards()`. Flat lock/unlock ETH fees are collected separately as treasury fees.

### ERC-20 Reward Handling

`notifyTokenRewards(address token, uint256 amount)` distributes non-NARA ERC-20 rewards to active weight holders and requires `REWARD_NOTIFIER_ROLE`. NARA itself is rejected as a bribe token.

If epoch backlog exceeds `MAX_JIT_ADVANCE`, user-facing engine mutations revert `EpochStale` after the capped JIT advance. Call `poke()` or `advanceEpochs()` until `epochState.epoch == currentEpoch()` before retrying.

### Permit and ERC-1363 Lock Paths

`NARAEngine` supports:

- `lockWithPermit(uint256 amount, uint64 durationEpochs, uint256 minWeight, uint256 deadline, uint8 v, bytes32 r, bytes32 s)` for approve-and-lock in one transaction. Uses JIT advance — handles up to `MAX_JIT_ADVANCE = 8` epochs of backlog.
- `onTransferReceived(address operator, address from, uint256 value, bytes calldata data)` for ERC-1363 `transferAndCall` locking when the flat lock ETH fee is zero. **No JIT advance** — reverts `EpochStale` on any epoch backlog. Epoch must be fully current before calling. Data encoding: `abi.encode(uint64 durationEpochs, uint256 minWeight, address positionOwner)` — if `positionOwner` is zero it defaults to `from`.
- Prefer protocol wrappers such as `NARARouter.syncAndLockWithPermit` or NFT `mintAndLockWithPermit` for permit-based user flows. Raw `NARAToken.multicall([permit, action])` cannot ignore a permit nonce that was consumed earlier, so it is front-run griefable.
- For ERC-1363 `transferFromAndCall`, an approved operator can spend the holder's allowance and choose the encoded `positionOwner`. This is not more power than the allowance grants, but integrations should not approve untrusted operators.

### Genesis Positions

`NARAPositionNFTV4` supports Genesis metadata:

- `roundId`
- `tierId`
- `rewardMultiplierBps`, capped by `MAX_GENESIS_REWARD_MULTIPLIER_BPS = 50_000`
- `mintedAt`
- `rewardWeight`
- `isEternal`

Eternal Genesis positions cannot be unlocked through normal NFT paths. After maturity, `burnEternalGenesis(uint256 tokenId)` removes Genesis reward weight, forwards any claimable rewards, unlocks the underlying engine position, returns principal to the NFT owner, and burns the NFT.

### Bonds

`NARABondDepositoryV4NFT` is the intended launch bond surface. It mints a tradable Genesis position NFT for the buyer.

Bond term controls:

- Terms require at least `MIN_PRICE_DELAY = 1 day` before execution.
- Terms older than `MAX_TERMS_AGE = 2 days` are stale and cannot be used for purchases.
- Term and capacity changes require the depository to be paused where enforced by code.

### Liquidity Routing

`NARALiquidityGrowthVault` supports five route modes:

- `Liquidity`: compound NARA/USDC back into LP.
- `Engine`: route NARA to engine emission reserve and USDC to engine ERC-20 rewards.
- `Split`: route part to engine and part to LP compounding.
- `Genesis`: route USDC to `NARAGenesisRewardDistributorV4`.
- `GenesisSplit`: split USDC between Genesis rewards and LP compounding.

Launch expectation: begin in `Liquidity` mode to build depth (POL-first), then move to `Split`, `Engine`, or Genesis routing after liquidity and operations are ready. The skim is designed to **build protocol-owned liquidity first** and redirect to lockers later — it is not a "tax that funds lockers" by default.

> **Flywheel status (2026-07-26): compounder deployed and wired, not frozen.** `Liquidity` mode compounds via
> an **external `ILiquidityCompounder` adapter** (`vault.setCompounder`). The production adapter is
> **`NARALiquidityCompounderV4`** (full-range, no-swap, exact-spend, POL custody), unit-tested
> through the real vault plus a faithful PositionManager/Permit2 mock. The Stage A vault now points
> to the deployed compounder. **Remaining before it is frozen:** initialize and seed the pool, execute a
> small live compound with a reviewed `minLiquidityAdded`, verify the LP NFT/accounting, then call
> `vault.freezeCompounder()`. Until the pool is initialized, compounding remains unavailable. The
> adapter completes the implementation path, but the live flywheel remains dormant until that
> initialization and validation sequence succeeds. See `UNISWAP_V4_HOOK.md`.

---

## v4 Composability Layer

Status: code complete in repo, not yet deployed. The fresh v4 core prerequisite
now exists, but composability remains a later phase.

| Contract | Path | Purpose |
|---|---|---|
| `NARAStakingPoolV4` | `contracts/v4/composability/NARAStakingPoolV4.sol` | ERC-20 `stNARA` wrapper over pooled v4 position NFTs |
| `NARAStakingPoolSYV4` | `contracts/v4/composability/NARAStakingPoolSYV4.sol` | Pendle SY adapter over `stNARA` |
| `NARAFractionalPositionV4` | `contracts/v4/composability/NARAFractionalPositionV4.sol` | Fractional ERC-20-like wrapper for one `NARAPositionNFTV4` |
| `NARAFractionalPositionFactoryV4` | `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol` | Permissionless factory for fractional position wrappers |

Deployment script:

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat run scripts/deployComposabilityV4.ts --network base
```

Important implementation details:

- `NARAStakingPoolV4.deposit(uint256 naraAmount, uint256 minShares)` mints `stNARA`.
- First `NARAStakingPoolV4` deposit must be at least `100 NARA`.
- `NARAStakingPoolV4` mints `DEAD_SHARES = 1e18` to `address(0xdead)` on the first deposit.
- `NARAStakingPoolV4.queueRedeem(uint256 shares)` burns shares and creates a redemption claim against future liquid NARA.
- `NARAStakingPoolSYV4` accepts NARA or `stNARA` deposits and redeems only to `stNARA`.
- `NARAStakingPoolSYV4` exposes Pendle reward selectors for USDC only: `accruedRewards`, `rewardIndexesCurrent`, and `rewardIndexesStored`.
- `NARAStakingPoolSYV4.claimNativeEth(address payable to)` keeps native ETH rewards out of Pendle `claimRewards()` while still letting direct SY holders claim ETH.
- `NARAStakingPoolSYV4.redeem(address receiver, uint256 amountIn, address tokenOut, uint256 minTokenOut, bool burnFromInternalBalance)` rejects `burnFromInternalBalance == true`; integrations must redeem from caller-held SY.
- `NARAFractionalPositionV4.claimPrincipal(address to)` gives the last claimant the remaining principal dust.
- `NARAFractionalPositionV4.totalSupply()` remains equal to `fractionCount` after principal claims; post-unlock integrations must not assume burn-style ERC-20 supply accounting.

See [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md) for the synchronized security checklist.

---

## Verification Status

Test counts drift every time a test is added, so this section records **how to verify**, plus a
dated stamp of the last full run. Re-run the commands and update the stamp — do not trust a hard-coded
number that may be stale.

```bash
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat compile
NODE_OPTIONS="--require ./polyfill.cjs" npx hardhat test          # full Hardhat suite
NODE_OPTIONS="--require ./polyfill.cjs" npm run size              # bytecode size gate
npm run slither:v4                                                # static analysis
```

Last full run — **2026-07-04**:

- Full Hardhat suite: **453 passing, 0 failing, 0 skipped**. Run `npx hardhat test` for the live number.
- Bytecode size gate: all deployable artifacts within EVM limits. `NARAEngine` 24,554 ·
  `NARAPositionNFTV4` 21,562 · `NARAPositionRendererV5` 4,960 · `NARAArtCorePlateV1` 11,437 ·
  `NARAArtSecurityPrintV1` 8,938 · `NARAArtGenesisPlateV1` 8,050 · `NARAArtMetadataV1` 4,701 · `NARAPositionDataLensV1` 7,017 ·
  `NARAStakingPoolSYV4` 8,482 bytes.
- Slither v4 gate: completed (exit 0). Findings on the new contracts are intentional (best-effort
  `try/catch` unused-returns) or benign (trusted owner-set distributor, `nonReentrant` entry points).
- **Aderyn + Echidna: re-run 2026-06-08 on a Linux box (Ubuntu 26.04), against current code — both green.**
  - **Echidna** v4 engine harness: invariant suite expanded **3 → 13**, **13/13 passing**, 0 falsified,
    10,004 calls. Covers fixed supply, principal conservation, NARA solvency, ETH solvency (exact
    inflow/outflow accounting), `totalLocked ≤ supply`, settled-epoch ≤ wall-clock, drip claimed ≤ paid,
    ETH claimed ≤ received, active-weight ≤ live-weight, per-position sanity (amount/weight > 0), and
    NARA/ETH-index + position-id + settled-epoch monotonicity. New fuzz actions exercise ETH notify,
    extra deposits, and treasury sweep. This re-confirms the engine after the 2026-06-05 changes.
    Harness: `echidna/harnesses/EchidnaNARAEngineV4Harness.sol`; logs in `audit-runs/gates-2026-06-08/`.
  - **Aderyn** (v0.6.8, 88 detectors over 28 files): **4 High / 18 Low**. The 4 Highs are heuristic and
    cluster in bond/router/fractional code, not the launch-critical core: H-1 locked-ether
    (NARARouter:67, false positive — fee is forwarded to engine); H-2 ERC721-interface
    (NARAFractionalPositionV4, false positive — ERC20 wrapper); H-3 reentrancy-after-call (bond
    depositories/vault, `nonReentrant`-guarded, same class Slither/manual audit cleared); H-4
    storage-array-edited-with-memory (BondDepositoryV4/V4NFT:282/295 — eyeball before **bonds open**,
    which is deliberately post-launch). None block the core token/engine/liquidity launch.
  - Environment note: the local WSL distro that used to host these was wiped (its `ext4.vhdx` was under
    `%LOCALAPPDATA%\Temp\` and got reaped) and Docker Desktop hangs the dev PC, so these now run on a
    throwaway Linux box (or CI). Toolchain quirks hit on Ubuntu 26.04 / Python 3.14: npm needs
    `--legacy-peer-deps`; Aderyn needs solc 0.8.34 seeded into `~/.svm/`; crytic-compile 0.4.1 needs a
    one-line `default=str` patch to its `solc.py` JSON dump. See `scripts/run-gates-linux.sh`.
- Baskets (separate Foundry package, `../../nara-category-baskets-v1/`):
  **136 passing, 5 fork-dependent skipped, 0 failing** in the environment-free
  full suite on 2026-07-26.

> Historical note: pre-reset runs cited different totals because they included
> code and tests that are no longer in the active v4 compile. Use the dated
> results above or rerun the commands; do not reuse historical totals.

---

## Current Activation Order

The Stage A core already exists. Do not redeploy it.

1. Deploy and wire `NARALiquidityCompounderV4`; complete the required ownership
   and recovery-policy review.
2. Run `npm run verify:v4:preseed`.
3. Initialize and seed the registered NARA/USDC pool with the approved,
   explicitly reviewed transaction.
4. Run `npm run v4:env:sync:write` so `.env` records the real LP NFT token ID
   from `deployments/v4-liquidity-seed-latest.json`.
5. Run `npm run verify:v4:preflight` and `npm run smoke:v4`.
6. Complete and record the required stability soak.
7. Run the complete basket deployment sequence on an exact Base-mainnet fork.
   Validate every adapter, executor, selector, immutable constructor value, and
   the fee collector's irreversible allowlist freeze before broadcast.
8. Broadcast the basket sequence only with an approved contract Safe/timelock
   as fee-collector admin. The deployment script rejects an EOA admin.
9. Save and verify a deployment manifest for every basket.
10. Run basket buy, sell, and `withdrawUnderlying` smoke tests.
11. Keep every frontend basket in preview until its manifest and smoke evidence
    pass the production gates.

---

## Current Baskets Activation Gates

The deployed Stage A core is deliberately dormant. The baskets product is not
ready for production activation until all gates below are true:

- `npm run build` passes.
- `npm test` passes.
- `npm run size` passes.
- `npm run slither:v4` passes.
- `npm run aderyn:v4` passes.
- `npm run echidna:v4` passes.
- `npm run verify:v4:preflight` passes against the intended deployment config.
- `npm run smoke:v4` passes after liquidity is seeded.
- `npm run launch:gates` passes. This wraps safe local/static gates and the read-only preflight.
- Basket Foundry build, non-fork tests, and required Base-fork proofs pass.
- The NARA pool is initialized, liquid, smoke-tested, and has completed the
  required stability soak.
- The compounder is deployed, wired, and verified.
- The basket fee-collector admin is an approved contract Safe/timelock.
- Every basket has a verified deployment manifest.
- Admin, treasury, emergency, and owner roles for in-scope deployed contracts
  are assigned to approved production-controlled addresses.
- All deployment constructor inputs match the intended Base addresses.
- Public docs and frontend addresses are updated only after successful deployment verification.

---

## Fresh v4 Stage A Deployment — Base Mainnet

Deployed 2026-07-26 from RC3 commit
`3215b69a1154b9c30957cd8d875b636dedc9d0ca`.

| Contract | Address | Status |
|---|---|---|
| `NARALauncher` | `0x90505C8c382519B168C6ab773Ed15D5ac99c9956` | One-shot launch complete |
| `NARAToken` | `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A` | Deployed; 1,000,000 fixed supply |
| `NARAEngine` | `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9` | Deployed |
| `NARARewardReserve` | `0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD` | Sealed with 650,000 NARA |
| `NARALiquidityGrowthVault` | `0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988` | Deployed; compounder set and not frozen |
| `Create2HookDeployer` | `0xC045644303E43cbb1E3c3E3fC851246F5c590834` | Ownership transferred to final admin |
| `NARALiquidityGrowthHook` | `0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088` | Pool registered |

Pool ID:
`0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3`.

This deployment is deliberately dormant:

- PoolManager slot-zero price is zero; the pool is uninitialized.
- No LP NFT or public liquidity exists.
- The compounder is deployed and wired but not frozen. Position NFT,
  allocations, router/lenses, bonds, and composability are not deployed.
- `apps/nara-baskets/` contains the fresh v4 launch configuration but remains
  fail-closed in preview until verified manager/adapter manifests exist.
  Lockboard is deferred; Lotto and Arena remain retired.
- Final admin and treasury are EOAs. Custody/recovery acceptance or migration
  to a verified Safe is required before public activation.

Canonical evidence:
`deployments/v4-base-usdc-2026-07-26-controlled-stage-a.json`.
Compounder evidence:
`deployments/v4-liquidity-compounder-2026-07-26.json`.

## Retired v4 Incident Stack

These addresses remain important for recovery/accounting only. Do not market or reuse them as the public v4 launch candidate.

| Contract | Address | Notes |
|---|---|---|
| NARAToken v4 | `0x58c209B95350aFBEFa17137CEd209f8c4b7D896D` | Retired incident stack |
| NARAEngine v4 | `0x9E8cE51805b13a4d75c324F75B06ABc00d9b1E03` | Retired incident stack |
| NARALiquidityTaxVault | `0x58C3f6E6b005009B775C0912B003D39660D14391` | Historical retired vault; holds `28.800499 USDC` per prior note |
| NARALiquidityTaxHook | `0x86ED92166aF1f97Fba75A9b12D9b1F7FfEE5E088` | Historical retired hook |
| NARA/USDC v4 pool ID | `0x1d291f26281fb2a8dda28c0c35bd79251956dfef110266f4c53e62e65239ba34` | Retired pool |
| LP wallet | `0x290286870126c291594BC6Fa4Ed41DC4cF82020B` | Owns empty LP NFT `2187473` per prior note |
| Vault owner / deployer | `0xcf222f05911e3AbeF77F2A552C623c122522F670` | Historical operator wallet |

Retired stack facts from prior notes:

- LP NFT `2187473` still exists, but liquidity is `0`.
- The custom-hook NARA/USDC v4 pool is retired.
- The fresh replacement stack is the Stage A deployment documented above. Do
  not redeploy or reuse this retired incident stack.

---

## v4 Scripts

| Script or command | Purpose |
|---|---|
| `npm run deploy:v4:base:usdc` | Full v4 core deploy command; Stage A is already deployed, so do not run again without explicit approval |
| `npm run v4:env:sync` | Generate `.env.v4.fresh` from a fresh deploy log and refuse retired incident-stack addresses |
| `npm run v4:env:sync:write` | Merge the generated fresh V4 launch keys into `.env` after review |
| `npm run deploy:v4:allocations` | Deploy or configure v4 allocations |
| `npm run deploy:v4:pool:only` | Redeploy only the v4 pool/hook/vault path |
| `npm run verify:v4:preflight` | Hook, vault, pool, and routing verification gate |
| `npm run smoke:v4` | Post-deploy smoke test |
| `npm run launch:gates` | Mainnet automatic gate wrapper; does not replace explicit operator approval for live smoke transactions |
| `npm run slither:v4` | Scoped Slither static-analysis gate for V4 contracts |
| `npm run aderyn:v4` | Aderyn all-contract and V4-focused static-analysis reports |
| `npm run echidna:v4` | Echidna V4 engine-accounting fuzz gate |
| `npm run echidna:v4:smoke` | Short Echidna smoke profile for tool/path validation |
| `scripts/deployComposabilityV4.ts` | Deploy v4 composability layer |
| `scripts/lib/v4LiveConfig.ts` | Shared canonical v4 live config for ops scripts |
| `scripts/seedV4Liquidity.ts` | Seed v4 NARA/USDC liquidity |
| `scripts/removeV4Liquidity.ts` | Config-driven LP removal |
| `scripts/swapUsdcForNara.ts` | Exact-path buy script for the hook pool |

`scripts/lib/v4LiveConfig.ts` requires explicit fresh v4 launch addresses for preflight/smoke operations. The retired incident-stack defaults are blocked unless `V4_ALLOW_RETIRED_DEFAULTS=1` is intentionally set for recovery-only checks.

---

## Active Workspace

- Active contracts and ops repo: `nara-protocol-hardhat/`
- Active launch frontend: `apps/nara-baskets/`.
- Deferred frontend: `apps/nara-lockboard/`.
- Retired frontends: `apps/nara-lotto/` and `apps/nara-arena/`.
- Retired cron folder: `cron/` — targets the retired v3 engine; do not run or retarget it
- Historical only: `archive/legacy-field/` and `archive/checkpoints/`

---

## Retired v3 Base Addresses

All v3 Base mainnet contracts are **retired as of 2026-05-27**. These are archived reference addresses only. Do not call them, integrate them, or surface them as "live" or "current."

| Contract | Address |
|---|---|
| NARATokenV3 | `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` |
| NARARewardReserve | `0xC425F45f3e108cA4E49f86E01C6d256e6c572876` |
| NARAEngineV2 | `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F` |
| NARABondVault | `0xcCe364b9cF815D47B0338aAd960367CdE8E3525D` |
| NARABondDepository | `0xe5f3D18d81661F63F9Fa5B53401eee08d383Ca20` |
| NARALottoPoolV2 | `0x81573dEDa5BcED23f0754cf3D0D2553d3694a0Ba` |
| BurnRunArenaV2 | `0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b` |
| NaraLockNFT | `0x2654602d8b0A7e328dcEC553aC2d1D289fC3B5da` |
| NaraLockAccount | `0x255770CA9D2b69ef766cF2755276051a6D21D131` |
| NaraLockRenderer | `0x7FDbA2DB4C46d69216f2166aA7f2CED403d97885` |
| Owner signer wallet | `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` |

Full archive: [archive/legacy-v3/README.md](../archive/legacy-v3/README.md)

---

## Maintenance Rule

Update this file whenever canonical live state changes. If a stack is retired, mark it retired here immediately. If code changes a function signature, deployment order, or verification command, update this file in the same change set.
