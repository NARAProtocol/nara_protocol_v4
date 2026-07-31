# Current State

Last updated: 2026-07-31 (market active; engine backlog recovered, replacement
compounder validated and frozen, dedicated keeper authorized; scheduled
automation, fee finalization, baskets, soak, and custody gates remain).

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
- v3 source remains available through repository history. The retired-address
  table is reproduced in [Retired v3 Base Addresses](#retired-v3-base-addresses).
- The only current code path is `contracts/v4/`.
- `../nara-category-baskets-v1/app/` is the only publishable launch frontend. It must remain in
  preview until verified basket deployment manifests exist. Lockboard is
  deferred; Lotto and Arena are retired.

---

## Operational Truth

The v4 incident stack deployed on 2026-04-23 is retired for launch purposes. It remains relevant only for recovery, accounting, and historical analysis.

The fresh v4 core was deployed from release
`3215b69a1154b9c30957cd8d875b636dedc9d0ca` on 2026-07-26. The replacement
NARA/USDC pool was registered, initialized, and seeded on 2026-07-30, and its
buy/sell smoke test passed. The market exists, but the product is not available:
at Base block `49358447` the engine was at epoch `466` while the settled epoch
was `0`, so user mutations reverted after the eight-epoch JIT cap. The backlog
was recovered through the Safe on 2026-07-31. Scheduled maintenance is not yet
active, so a small recoverable backlog can accumulate until the workflow is
merged and enabled.

Current launch scope remains NARA Baskets only. Epoch recovery and sustained
keeper execution evidence, the reviewed fee finalization, basket
deployment/smoke evidence, frontend routing, and the documented soak are still
required. Position NFTs, bonds,
router/lenses, lockboard, and composability are deferred. Lotto and Arena are
retired.

The canonical remediation record is
[NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md](NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md).
The replacement liquidity trio is deployed and the pool is active. Basket
contracts and the publishable frontend still require verified deployment and
integration evidence. Current status is **market active, product activation
blocked**, not production-ready.

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
| Fee vault | Simple tax vault | Replacement `NARALiquidityGrowthVault` supports `Liquidity`, `Genesis`, and `GenesisSplit`; legacy `Engine` and `Split` enum values permanently revert |
| Reward tokens | ETH-focused reward flow | NARA emissions plus ETH rewards; deployed-engine ERC-20 notification is disabled operationally |
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
| `NARALiquidityGrowthVault` | `contracts/v4/NARALiquidityGrowthVault.sol` | Replacement pool-fee vault for LP compounding and Genesis routing. `Engine` and `Split` cannot be selected. LP compounding plugs in an external `ILiquidityCompounder` — production adapter is `NARALiquidityCompounderV4` (see "Liquidity Routing" below). |
| `NARALiquidityCompounderV4` | `contracts/v4/NARALiquidityCompounderV4.sol` | Full-range, no-swap, exact-spend POL adapter with remainder banking and a 7-day recovery timelock. The Stage A instance at `0xc327…46Ab` is quarantined with its old vault/hook; deploy a fresh instance with the replacement trio. |
| `NARAOpsVaultV4` | `contracts/v4/NARAOpsVaultV4.sol` | One-shot operations vesting vault capped at `10,000 NARA` |

---

## v4 Router / Lens Layer (added 2026-05-28)

Lazy UX + read layer for any frontend. Deploy step `deploy:v4:router:lens`. Full spec: `ROUTER_LENS.md`.

| Contract | Path | Role |
|---|---|---|
| `NARARouter` | `contracts/v4/router/NARARouter.sol` | Permit + sync + lock in one tx; permissionless `syncEpochs()` (replaces the Railway keeper cron) |
| `NARADashboardLens` | `contracts/v4/router/NARADashboardLens.sol` | Single-call `getUserState(user, positionIds[], nftTokenIds[])` for any frontend |
| `NARAPositionDataLensV1` | `contracts/v4/router/NARAPositionDataLensV1.sol` | Typed live position-NFT data for apps; batches capped at 100. Added in the 2026-06 NFT presentation pass |
| `BribeRouterV4` | `contracts/v4/router/BribeRouterV4.sol` | Dormant reference implementation. Deployment tooling skips it and the deployed engine must not grant it `REWARD_NOTIFIER_ROLE`. |

---

## v4 Core Behavior

### JIT Epoch Auto-Advance

`NARAEngine` auto-advances epochs during user-facing calls such as lock, unlock, and claim. A single call advances at most `MAX_JIT_ADVANCE = 8` epochs. If backlog is larger, users or keepers can call `poke()` repeatedly.

### Configurable Epoch Length

`EPOCH_LENGTH` is set at deployment through the engine constructor. Do not assume 900 seconds unless the deployment config proves it. Check `engine.EPOCH_LENGTH()`.

### Direct ETH Handling

`NARAEngine.receive()` reverts with `DirectEthTransferForbidden`. ETH rewards enter through `notifyEthRewards()`. Flat lock/unlock ETH fees are collected separately as treasury fees.

### ERC-20 Reward Handling

The deployed engine contains
`notifyTokenRewards(address token, uint256 amount)`, but launch configuration
must keep that path disabled. After the first token notification, an active
position may extend and increase `activeTotalWeight` while its token-reward
weight remains frozen. A later distribution then divides by more weight than
positions can claim, permanently leaving part of that token in the engine.

Required pre-seed state:

- no Safe, EOA, vault, or router holds `REWARD_NOTIFIER_ROLE`;
- the replacement vault is deployed from the corrected source and rejects
  `RouteMode.Engine` and `RouteMode.Split`;
- `BribeRouterV4` is not deployed for this engine;
- ETH rewards through `notifyEthRewards()` remain available.

Read-only Base checks on 2026-07-28 showed `nextPositionId = 1`,
`totalLocked = 0`, `activeTotalWeight = 0`, and a zero USDC token index. The
accounting issue has therefore not been activated.

The Stage A admin EOA and Stage A vault held `REWARD_NOTIFIER_ROLE` at that
check. Both were revoked on 2026-07-30 and re-verified as `false`, alongside the
Safe and the deployer. Evidence:
[NARA_V4_REWARD_NOTIFIER_REVOCATION.md](NARA_V4_REWARD_NOTIFIER_REVOCATION.md).
No address currently holds `REWARD_NOTIFIER_ROLE`. Keep it that way — do not
grant it to the replacement vault, a router, the Safe, or an EOA.

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

`NARALiquidityGrowthVault` keeps five enum values for ABI compatibility, but
only three are reachable:

- `Liquidity`: compound NARA/USDC back into LP.
- `Engine`: disabled; `setRouteMode` reverts `EngineTokenRoutingDisabled`.
- `Split`: disabled; `setRouteMode` reverts `EngineTokenRoutingDisabled`.
- `Genesis`: route USDC to `NARAGenesisRewardDistributorV4`.
- `GenesisSplit`: split USDC between Genesis rewards and LP compounding.

Launch expectation: remain in `Liquidity` mode to build depth (POL-first).
`Genesis` or `GenesisSplit` may be considered later after their dependencies
and operations are ready. Engine routing is not a future operator option on
this vault.

> **Flywheel status (2026-07-28): replacement trio required.** The Stage A
> compounder is deployed and source-verified but permanently bound to the
> quarantined Stage A vault/hook. `Liquidity` mode uses an external
> `ILiquidityCompounder` adapter. Deploy the corrected vault/hook and a fresh
> `NARALiquidityCompounderV4` bound to them, verify the fresh addresses, seed,
> execute a small reviewed compound, verify exact-spend accounting, and only
> then call `freezeCompounder()`.

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

Last full run — **2026-07-29**:

- Full Hardhat suite: **468 passing, 0 failing**. This includes the real
  Uniswap v4 PoolManager split-invariance test, Base compounder fork tests, and
  the Stage A quarantine read.
- Bytecode size gate: all deployable artifacts within EVM limits. `NARAEngine` 24,554 ·
  `NARALiquidityGrowthHook` 11,511 · `NARALiquidityGrowthVault` 11,204 ·
  `NARALiquidityCompounderV4` 10,843 · `NARAPositionNFTV4` 21,562 ·
  `NARAPositionRendererV5` 4,972 · `NARAArtCorePlateV1` 15,530 ·
  `NARAArtSecurityPrintV1` 9,694 · `NARAArtGenesisPlateV1` 12,676 ·
  `NARAArtMetadataV1` 5,252 · `NARAPositionDataLensV1` 7,017 ·
  `NARAStakingPoolSYV4` 8,503 bytes.
- Slither v4 gate: completed on 2026-07-29 (exit 0). The hook reports four
  heuristic findings, including the deliberate same-block equality guard and
  view-only ignored tuple values. The vault reports eight, including the known
  `reentrancy-balance` heuristic on compounder calls guarded by
  `nonReentrant`; the balance deltas are the intended exact-spend check.
- `npm audit --audit-level=high`: completed on 2026-07-28 with **0 high and
  0 critical** findings after pinning corrected `brace-expansion` and `diff`
  transitive versions. Eight low findings remain in Hardhat Verify's legacy
  Ethers v5 dependency chain; npm reports no available fix.
- **Aderyn + Echidna:** latest run was 2026-06-08 on the pre-2026-07-28
  source. Those results are historical evidence, not current-patch verification.
  A v4-only Aderyn rerun was attempted on 2026-07-29 but the local Aderyn
  binary/WSL toolchain is unavailable; it did not execute.
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
  **138 deterministic tests passing, 1 environment-dependent skip, 0
  failing** on 2026-07-29, with fork-named suites excluded. The separate
  CI-profile invariant run passed 4/4. Four Base adapter fork suites passed
  31/31. `ForkBuyProof` still requires a candidate basket stack deployed on
  the local fork and remains a release gate.

> Historical note: pre-reset runs cited different totals because they included
> code and tests that are no longer in the active v4 compile. Use the dated
> results above or rerun the commands; do not reuse historical totals.

---

## Current Activation Order

The Stage A core already exists. Do not redeploy it.

1. ~~Deploy the corrected replacement vault, hook, and compounder trio. Verify
   their source, exact immutable bindings, ownership, uninitialized pool state,
   and recovery policy.~~ **Done 2026-07-30.**
2. ~~Sync the replacement manifest into the reviewed fresh environment.~~
   **Done 2026-07-30** via `npm run v4:env:sync` and `v4:env:sync:write`.
3. ~~Revoke `REWARD_NOTIFIER_ROLE` from the Stage A admin and vault, then run
   `npm run verify:v4:preseed` and
   `npm run verify:v4:launch-gates:preseed`.~~ **Done 2026-07-30** — both
   passed; launch gates 14/0/0.
4. ~~Initialize and seed the replacement NARA/USDC pool.~~ **Done 2026-07-30** —
   one atomic Safe batch, opening price verified against the hook bind.
5. ~~Run buy and sell smoke tests.~~ **Done 2026-07-30** — both legs passed,
   vault fee deltas reconcile exactly.
6. ~~Clear the engine backlog.~~ **Done 2026-07-31** through three successful
   Safe transactions. The dedicated keeper is authorized; merge and enable the
   30-minute combined operations workflow, then record 48 hours within the
   configured backlog tolerance. Do not call `syncEmissionReserve()` unless the
   maintainer reports direct untracked NARA in the engine.
7. ~~Execute the validation compound, verify it, and freeze the replacement
   compounder.~~ **Done 2026-07-31.** The compounder owns POL NFT `2885838`,
   the accounting deltas reconciled, and `compounderFrozen()` is true.
8. **NEXT.** Finalize the reviewed balanced fee curve after its on-chain
   timelock, then apply the documented weekly depth policy.
9. Run `npm run verify:v4:preflight`, `npm run smoke:v4`, and
   `npm run verify:v4:launch-gates:baskets`.
10. Complete and record the required stability soak.
11. Run the complete basket deployment sequence on an exact Base-mainnet fork.
   Validate every adapter, immutable constructor value, typed collector route,
   oracle feed, role separation, engine/NARA binding, and exact-pull behavior
   before broadcast.
12. Broadcast the basket sequence only with an approved contract Safe/timelock
   as fee-collector admin. The deployment script rejects an EOA admin.
13. Save and verify a deployment manifest for every basket.
14. Run basket buy, sell, and `withdrawUnderlying` smoke tests.
15. Keep every frontend basket in preview until its manifest and smoke evidence
    pass the production gates.

---

## Current Baskets Activation Gates

The core market is active, but the baskets product is not
ready for production activation until all gates below are true:

- `npm run build` passes.
- `npm test` passes.
- `npm run size` passes.
- `npm run slither:v4` passes.
- `npm run aderyn:v4` passes.
- `npm run echidna:v4` passes.
- `npm run verify:v4:preflight` passes against the intended deployment config.
- `npm run smoke:v4` passes after liquidity is seeded.
- `npm run verify:v4:launch-gates:preseed` passes before initialization.
- `npm run verify:v4:launch-gates:baskets` passes after the validation compound
  and compounder freeze.
- `npm run maintain:v4:epochs` reports a backlog within tolerance, and the
  dedicated 15-minute maintainer has clean 48-hour evidence.
- `npm run launch:gates` passes after seed. This wraps local/static gates, the
  strict read-only preflight, and the baskets-only final live gate.
- Basket Foundry build, non-fork tests, and required Base-fork proofs pass.
- The replacement NARA pool is initialized, liquid, smoke-tested, and has completed the
  required stability soak.
- The replacement hook/vault/compounder trio is deployed from corrected source,
  mutually wired, and verified; the Stage A pool remains uninitialized.
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
| `NARALiquidityGrowthVault` | `0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988` | Quarantined Stage A instance; do not use for launch |
| `Create2HookDeployer` | `0xC045644303E43cbb1E3c3E3fC851246F5c590834` | Quarantined Stage A helper; superseded |
| `NARALiquidityGrowthHook` | `0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088` | Quarantined Stage A instance; registered pool must remain uninitialized |

Stage A pool ID (quarantined, uninitialized, never to be seeded):
`0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3`.

## Replacement Liquidity Trio — Base Mainnet (2026-07-30)

Deployed by `scripts/redeployPoolOnly.ts` from the corrected post-2026-07-28
source. **This is the active liquidity stack.** All four contracts are owned by
the custody Safe `0xd65c0e390Dc187A22c52c03816591CC736C0D755`.

| Contract | Address | Status |
|---|---|---|
| `NARALiquidityGrowthVault` | `0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d` | Active; `RouteMode.Liquidity`; compounder frozen; dedicated keeper `0xa4B4…15aB7` authorized |
| `NARALiquidityGrowthHook` | `0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088` | Active; flags `0x2088`; pool registered, initialized, and seeded |
| `NARALiquidityCompounderV4` | `0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98` | Active; no pending recovery |
| `Create2HookDeployer` | `0xa6Ef629291170B80e5f23Ab14dB0B3620062f016` | Helper; owned by the Safe |

Replacement pool ID (**registered, initialized, and seeded 2026-07-30**):
`0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318`.

## Pool Launch — Base Mainnet (2026-07-30)

The atomic register + initialize + seed Safe batch executed successfully in
block `49328483`
([`0x91638d26…40c8c`](https://basescan.org/tx/0x91638d26adbc301e715f76ea2c3e8e6bf6727590f4bcd46416dfbeb456740c8c)),
signed 2-of-3 and executed by Safe owner `0x42365cAE…6664`.

- `PoolManager.Initialize` recorded `sqrtPriceX96 = 5602277097478613991873`,
  **exactly** the hook-bound opening price. PS-05 held: the pool could not be
  opened at any other price.
- Seed: `60,000 NARA + 300 USDC` at `$0.005/NARA`, `$5,000` implied FDV.
- LP NFT **tokenId `2884402`**, owner = the custody Safe, liquidity
  `4242640687119285`, full range `-887220 … 887220`.
- All four Permit2/ERC-20 approvals were revoked to zero inside the same batch.
- `V4_LP_TOKEN_ID=2884402` is recorded in `.env` (runbook step 6 closed).

**The pool is initialized, seeded, and actively trading.** It began trading immediately. Do not
assume dormancy in any later step.

### Post-launch smoke test — passed

`npm run smoke:v4` completed both legs on Base mainnet:

- Buy `3 USDC -> 242.09 NARA`
  ([`0xc8652610…4a1a`](https://basescan.org/tx/0xc8652610b74bf25662f8870206bb7edb6f4818d00e8b2134a17ac771f5194a1a));
  vault captured `0.15 USDC` = exactly the 5% buy floor fee.
- Sell `5 NARA`
  ([`0x4031f5e4…9380`](https://basescan.org/tx/0x4031f5e4fb57dfabbc6b07633b3b9892544bceebc25c196b360b542793959380));
  vault captured `0.25 NARA` = exactly the 5% sell floor fee.

Both vault deltas reconcile to the wei. Hook fee routing is verified working.

### Fee-curve observation — laddering reduces pressure fees

Four sequential `24 USDC` buys, ~60s apart (blocks `49330573`, `49330611`,
`49330649`, `49330684`), each paid an identical `1.47 USDC` fee — the fee basis
is *configured* depth, so live price movement cannot cheapen it. That part of
PS-01 works.

However the tiers key off **per-transaction** size with no cross-block
accumulation:

| Single trade | Tier | Fee |
|---|---|---|
| 12 USDC | 5% | 0.60 |
| 24 USDC | 8% | 1.47 |
| 48 USDC | 12% | 3.51 |
| 96 USDC | 20% | 9.75 |

`96 USDC` split into 4 paid `5.88` versus `9.75` in one trade — a 40% saving,
and `8 x 12 USDC` would pay `4.80`. PS-01 closed same-**block** splitting;
splitting across blocks remains fully available and is trivial to automate. The
sell curve (5/7/10/15/20%) is softer still. This is a design decision to make
deliberately before the frontend ships, since the app will make laddering easy.

Those four buys moved the price `$0.0117 -> $0.0175` on `96 USDC` of input —
the book is very shallow.

- Pool key: currency0 `NARA`, currency1 native `USDC`, fee `3000`, tick spacing `60`.
- Configured fee-basis depth: `60,000 NARA` and `300 USDC`, set before
  registration so no timelocked pending update exists.
- Bound opening `sqrtPriceX96`: `5602277097478613991873`, which is
  `$0.005` per NARA and a `$5,000` implied FDV on the fixed supply. This value
  was bound permanently by `registerPool` in the atomic Safe batch.
- Hook salt `0x76a3bf2187024a7512f6f516bc0fa035419260f26a702e11b2b208db91454160`
  with init-code hash
  `0x391b688cd9637189a3c15cc2583f4e9f1c1f156a7334e6b37e348bb64421abcd`
  reproduces the hook address exactly through the CREATE2 helper.
- `REWARD_NOTIFIER_ROLE` was deliberately **not** granted to the replacement
  vault. Deployed-engine ERC-20 reward notification stays disabled (PS-02).

Deployment evidence is in
`deployments/v4-pool-redeploy-2026-07-30-replacement-trio.json`; launch, receipt,
smoke, LP, and post-launch verification evidence is in
`deployments/v4-pool-launch-2026-07-30.json`.

> Operator note: the deploy script exited non-zero on its final `owner()`
> read-back after every transaction had already succeeded — a stale-RPC read,
> not a failed transfer. The manifest was therefore reconstructed from chain
> state and independently re-verified. All four owners, both reciprocal binding
> sets, both depths, and the unregistered pool state were confirmed by direct
> reads.

Pre-seed gate result on 2026-07-30: `npm run verify:v4:preseed` passed, and
`npm run verify:v4:launch-gates:preseed` returned **14 pass, 0 fail, 0 skip, 9
not applicable** to the baskets-only scope. Before recovery and freeze on
2026-07-31, the post-launch gate returned **14 pass, 2 fail, 0 skip, 9 not
applicable**. Those two conditions have since changed on-chain; rerun the full
gate after scheduled maintenance is active.

Current outstanding state:

- LP NFT `2884402` exists, is owned by the Safe, and has liquidity
  `4242640687119285`.
- The original engine backlog is recovered. At Base block `49363662`, current
  epoch was `478`, settled epoch was `475`, and the three-epoch backlog remained
  within the eight-epoch JIT recovery cap. The sealed reward reserve reported
  `650,000 NARA`; the direct untracked engine balance was zero.
- The historical Stage A NARA protocol-depth update from `30` to `60,000 NARA`
  executed successfully in transaction
  `0x86d6f37b9d35040a3bd1a89c6d0fe398b4ba65f7ce5a06a7360d80c75e12b6ba`
  at block `49215671`. The pending entry is cleared, and the read-only pre-seed
  verifier confirmed the active depth is exactly `60,000 NARA`. This does not
  authorize or validate seeding the old pool.
- The old compounder remains quarantined. The active replacement compounder is
  deployed, wired, source verified, validation-compounded, and permanently
  frozen. It owns LP NFT `2885838` with liquidity `441516751441525`. The vault
  recorded `10,497.819596280213570307 NARA` and `289.617384 USDC` compounded.
  Keeper authorization transaction
  `0x27d87f0c216133c590e49e59980b208d22726c5b6522d9572a9f16cff8f33cbd`
  set `compoundKeeper(0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7)=true`
  at block `49363406`. The protected operations release merged as verified
  commit `0a3b16961ab66a7b870bbfd52cd0b5a5049ddfdf`. A reviewed read-only
  workflow run found a nine-epoch backlog; execute run `30654484536` advanced
  it to zero in transaction
  `0x906296a6041117a3ce1b895de291a221dcc5caad406f190ca548b7bf52854091`
  at block `49366244`. Independent post-state run `30654597591` then confirmed
  current/settled epoch `484/484`, the external `650,000 NARA` reserve, frozen
  compounder, authorized keeper, and no liquidity transaction required. The
  30-minute schedule was enabled at `2026-07-31T18:19:32Z`; its 48-hour soak
  remains in progress.
  Position NFT, allocations, router/lenses, bonds, and composability are not deployed.
- `../nara-category-baskets-v1/app/` contains the publishable launch frontend but remains
  fail-closed in preview until verified manager/adapter manifests exist.
  Lockboard is deferred; Lotto and Arena remain retired.
- Engine role custody moved to a Base Safe on 2026-07-30. Safe
  `0xd65c0e390Dc187A22c52c03816591CC736C0D755`, version `1.4.1`, threshold
  `2 of 3`, no modules, runtime code hash
  `0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`. The Safe
  now solely holds `DEFAULT_ADMIN_ROLE`, `PARAM_ROLE`, and `TREASURY_ROLE`; the
  legacy admin EOA and the deployer hold none. Evidence:
  [NARA_V4_SAFE_CUSTODY_HANDOFF.md](NARA_V4_SAFE_CUSTODY_HANDOFF.md) and
  `deployments/v4-custody-2026-07-30.json`.
- This custody gate is **not** closed. The approved plan
  [NARA_V4_CUSTODY_AND_GOVERNANCE_PLAN.md](NARA_V4_CUSTODY_AND_GOVERNANCE_PLAN.md)
  requires two `3-of-5` Safes with separated admin and treasury, a phase-2 48h
  timelock, and a `240,000 NARA` treasury lock commitment. The deployed posture
  is one `2-of-3` Safe with no Safe B. `engine.treasury()` is still the EOA
  `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`, which is also a Safe owner. The
  replacement liquidity-stack owner roles are on the same Safe. Resolve or
  formally amend the remaining custody plan deviations before public activation.

Canonical evidence:
`deployments/v4-base-usdc-2026-07-26-controlled-stage-a.json`.
Compounder evidence:
`deployments/v4-liquidity-compounder-2026-07-26.json`.
Executed NARA-depth update evidence:
`deployments/v4-nara-depth-proposal-2026-07-27.json`.

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
| `npm run deploy:v4:pool:only` | Deploy a matching replacement vault/hook/compounder trio and leave its pool unregistered |
| `npm run verify:v4:preflight` | Hook, vault, pool, and routing verification gate |
| `npm run maintain:v4:epochs` | Read-only engine epoch/reward-reserve health plan; add `-- --execute` only for an explicitly approved permissionless recovery |
| `npm run build:v4:epoch-recovery` | Build and simulate one Safe Transaction Builder batch containing the complete current epoch recovery; never broadcasts |
| `npm run build:v4:fee-curve` | Build and simulate reviewed Safe proposal/finalization batches for the balanced fee curve; never broadcasts |
| `npm run build:v4:compounder-validation` | Build and simulate validation compound or permanent-freeze batches; never broadcasts |
| `npm run smoke:v4` | Post-deploy smoke test |
| `npm run launch:gates` | Mainnet automatic gate wrapper; does not replace explicit operator approval for live smoke transactions |
| `npm run slither:v4` | Scoped Slither static-analysis gate for V4 contracts |
| `npm run aderyn:v4` | Aderyn all-contract and V4-focused static-analysis reports |
| `npm run echidna:v4` | Echidna V4 engine-accounting fuzz gate |
| `npm run echidna:v4:smoke` | Short Echidna smoke profile for tool/path validation |
| `scripts/deployComposabilityV4.ts` | Deploy v4 composability layer |
| `scripts/lib/v4LiveConfig.ts` | Shared canonical v4 live config for ops scripts |
| `npm run build:v4:atomic-pool-launch` | Build the one Safe batch that registers, initializes, and seeds the v4 NARA/USDC pool |
| `scripts/seedV4Liquidity.ts` | Disabled direct-seed helper retained only for receipt/recovery utilities |
| `scripts/removeV4Liquidity.ts` | Config-driven LP removal |
| `scripts/swapUsdcForNara.ts` | Exact-path buy script for the hook pool |

`scripts/lib/v4LiveConfig.ts` requires explicit fresh v4 launch addresses for preflight/smoke operations. The retired incident-stack defaults are blocked unless `V4_ALLOW_RETIRED_DEFAULTS=1` is intentionally set for recovery-only checks.

---

## Active Workspace

- Active contracts and ops repo: `nara-protocol-hardhat/`
- Publishable launch frontend: `../nara-category-baskets-v1/app/`.
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

The frozen v3 source remains available through repository history; it is not
part of the active public source tree.

---

## Maintenance Rule

Update this file whenever canonical live state changes. If a stack is retired, mark it retired here immediately. If code changes a function signature, deployment order, or verification command, update this file in the same change set.
