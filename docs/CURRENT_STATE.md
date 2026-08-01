# Current State

Last updated: 2026-08-01 (retiring V4 market still tradeable; engine backlog
recovered; liquidity-stack Stage 0 executed by the human Safe; dedicated old
compound keeper revoked; seven-day `WindDown` pending; no assets or liquidity
moved; a complete selected V5 contract candidate and offline deployment planner
exist locally but are undeployed and unapproved; atomic V4 withdrawal, frozen
production economics/custody, immutable origin, actual one-hour rehearsal and
retirement, protected integration, basket, independent-review, and soak gates
remain).

This is the canonical state document for the active NARA workspace. Current
Solidity and verified deployment evidence are authoritative. Existing V4
deployment scripts are not V5 release instructions. When this document
conflicts with current source or verified state, update this document.

Resume reset work from the read-first
[NARA V5 complete-stack cold handoff](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md),
then this document, the
[V5 complete-stack plan](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md), and the
[v4 liquidity recovery plan](NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md). The older launch
runbook, handoffs, incident reports, and research plans are historical inputs,
not executable liquidity instructions.

---

## 🚨 v4 RESET — 2026-05-27

On **2026-05-27** the project committed to a clean fresh start on v4. The entire v3 protocol stack is **retired**. This is unconditional — not conditional on the v4 redeploy completing.

- v3 is not "still live until v4 launches." v3 is retired now.
- The fresh NARA token deployed from `contracts/v4/NARAToken.sol` at
  `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`. The v3 token
  `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` remains permanently retired.
- All v3 mainnet contracts are archived at `archive/legacy-v3/`. See [archive/legacy-v3/README.md](../archive/legacy-v3/README.md) for the full retired-address table.
- `contracts/v4/` is the only deployed/recovery code path. The active compile
  also contains a complete selected V5 contract candidate under `contracts/v5/`.
  It has no production deployment, approved manifest, address, or availability
  claim.
- `../nara-category-baskets-v1/app/` is the only publishable launch frontend. It must remain in
  preview until verified basket deployment manifests exist. Lockboard is
  deferred; Lotto and Arena are retired.

---

## Operational Truth

The v4 incident stack deployed on 2026-04-23 is retired for launch purposes. It remains relevant only for recovery, accounting, and historical analysis.

The fresh v4 core was deployed from release
`3215b69a1154b9c30957cd8d875b636dedc9d0ca` on 2026-07-26. The replacement
NARA/USDC pool was registered, initialized, and seeded on 2026-07-30, and its
buy/sell smoke test passed. The market exists only as a recovery/retirement
source; V4 is no longer the launch candidate. Historically,
at Base block `49358447` the engine was at epoch `466` while the settled epoch
was `0`, so user mutations reverted after the eight-epoch JIT cap. The backlog
was recovered through the Safe on 2026-07-31. Any further V4 epoch maintenance
is recovery hygiene, not a V5 launch gate. The fresh V5 Engine must separately
prove its own clockwork, downtime recovery, monitoring, and manual fallback.

The intended eventual public launch surface remains NARA Baskets only, but no
product is available. Basket deployment/smoke evidence, frontend routing, and
the documented V5 soak remain required. Position NFTs, bonds, router/lenses,
and other modules deploy only if selected in the V5 scope. Lockboard is
deferred; Lotto and Arena are retired.

The approved V5 planning record is
[NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md).
The local Hook implementation, external-review disposition, evidence, and
remaining blockers are in
[NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md](NARA_V5_HOOK_IMPLEMENTATION_REVIEW_2026-08-01.md).
The executed recovery and old-v4 withdrawal subplan is
[NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md](NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md).
The context-loss-safe operational summary is
[NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md](NARA_V5_LIQUIDITY_RESET_COLD_HANDOFF.md).
The earlier canonical remediation record is
[NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md](NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md).
The 2026-07-30 liquidity trio remains deployed and its pool remains active only
while the controlled recovery and replacement process is prepared. Basket
contracts and the publishable frontend still require verified deployment and
integration evidence. Current status is **market active, liquidity stack
slated for retirement, product activation blocked**, not production-ready.

### V5 moved to its own origin repository — 2026-08-01

The V5 stack now has a dedicated origin repository:

| Local path | Remote | Authority |
|---|---|---|
| `../nara-protocol-v5/` | `NARAProtocol/nara_protocol_V5` (private) | Canonical fresh V5 contracts, tests, offline planning/release-gate tooling, and V5 engineering state |

Until 2026-08-01 the entire V5 candidate existed **only as untracked files in
this repository** — no commit on any branch, no backup — which made the release
gate's required 40-character `sourceCommit` unsatisfiable. It was moved to the
new repository and landed there through pull request `#1` from branch
`feat/v5-complete-stack-20260801`. Initcode and runtime bytecode for the Hook,
Engine, bond depository, and bond inventory vault are byte-for-byte identical
across both trees, so the mined Hook CREATE2 salt and address are preserved.

**The `contracts/v5/`, `test/v5/`, and `scripts/v5/` trees kept in this
repository are a frozen historical working copy, exactly like
`../apps/nara-baskets/` is for the baskets app. Do not make a final V5 change
here.** Originate every V5 change in `../nara-protocol-v5/`. This repository
remains the origin for V4 recovery/retirement only.

Two environment facts that cost real time and are easy to rediscover the hard
way:

- `remappings.txt` is **load-bearing for the Hardhat compile**, not merely a
  static-analysis artifact. It points `@uniswap/v4-core/` at the copy vendored
  inside `@uniswap/v4-periphery`, so `BaseHook` and the V5 Hook resolve the same
  `IPoolManager`. Without it the Hook does not compile at all.
- `npm run size` runs `hardhat clean` before measuring. Never run it
  concurrently with a test suite; a parallel run deletes `artifacts/` mid-suite
  and produces spurious `ENOENT` mock-artifact failures that look like real
  regressions.

### Undeployed V5 candidate truth

- A fresh local Token, Reserve, Engine, positions/modules/periphery, Vault,
  named-POL custody, no-swap Compounder, phase Controller, Hook, seed initializer,
  Uniswap V4 position adapter, CREATE2 factory, and deterministic offline
  deployment planner now exist as source and tests. No V5 contract is deployed;
  there is no approved production manifest, address, pool, or product
  integration.
- Its fixed symmetric per-leg phases are `15%`, `12.5%`, `10%`, `7.5%`, and
  `5%`. Bootstrap is a 27.75% sequential hook-only toll before the 0.30% LP fee
  and price impact.
- V5 has no fixed `300 USDC` / `60,000 NARA` `protocolDepth`. Those numbers are
  historical V4 pool configuration. V5 phase milestones must use named, active,
  protocol-owned, recovery-locked liquidity and separately approved thresholds.
- Routing is `Hook -> Vault`, then the one-way Vault state
  `Unbound -> BootstrapLiquidity -> Shared -> Retired`. Bootstrap permanently
  classifies 100% of both fee currencies for liquidity. Shared may route only
  an immutable, human-approved share `X` of post-transition fees to the fresh
  V5 Engine, identically for both currencies. `X` remains unapproved. Engine
  entitlement is indexed synchronously at swap accrual, while later claim
  redemption only provides exact backing. A later locker cannot capture older
  fees; an epoch-stale Engine routes that share inactive without reverting the
  swap or rewarding expired weight.
- V5 must not reuse the deployed V4 Engine's generic ERC-20 notifier or
  `syncEmissionReserve()` routing pattern.

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

## V4 Source Inventory — Recovery/Historical

These are the current V4 source contracts. A subset is deployed only as the
recovery/retirement system; undeployed V4 surfaces are not pending V5
deployments and are not automatically carried into V5.

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
| `NARABondDepositoryV4` | `contracts/v4/NARABondDepositoryV4.sol` | Historical direct raw-position bond source; not approved for V5 |
| `NARABondDepositoryV4NFT` | `contracts/v4/NARABondDepositoryV4NFT.sol` | Historical preferred V4 NFT-bond source; not approved for V5 |
| `NARALiquidityGrowthHook` | `contracts/v4/NARALiquidityGrowthHook.sol` | Retiring Uniswap v4 exact-input hook with the historical dynamic fee curves |
| `NARALiquidityGrowthVault` | `contracts/v4/NARALiquidityGrowthVault.sol` | Retiring V4 pool-fee vault. `Engine` and `Split` cannot be selected; it is not the V5 Vault design. |
| `NARALiquidityCompounderV4` | `contracts/v4/NARALiquidityCompounderV4.sol` | Retiring full-range, no-swap POL adapter. The original Stage A instance at `0xc327…46Ab` is quarantined; the July-30 instance at `0xE28C…6C98` is active only pending migration. Neither is reusable for V5. |
| `NARAOpsVaultV4` | `contracts/v4/NARAOpsVaultV4.sol` | One-shot operations vesting vault capped at `10,000 NARA` |

---

## V4 Router / Lens Source (added 2026-05-28)

Historical V4 lazy-UX/read-layer source. The V4 deploy step is
`deploy:v4:router:lens`, but it is not authorized for the V5 reset and is not a
V5 verification path. Full V4 spec: `ROUTER_LENS.md`.

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

### Retiring V4 Liquidity Routing

`NARALiquidityGrowthVault` keeps five enum values for ABI compatibility, but
only three are reachable:

- `Liquidity`: compound NARA/USDC back into LP.
- `Engine`: disabled; `setRouteMode` reverts `EngineTokenRoutingDisabled`.
- `Split`: disabled; `setRouteMode` reverts `EngineTokenRoutingDisabled`.
- `Genesis`: route USDC to `NARAGenesisRewardDistributorV4`.
- `GenesisSplit`: split USDC between Genesis rewards and LP compounding.

The deployed July-30 vault remains in `Liquidity` mode only while the V4
withdrawal is prepared. No V4 route change or new launch is planned. Engine
routing is not an operator option on this vault and is not evidence for V5.

> **Historical 2026-07-28 gate — completed, then superseded.** The corrected
> V4 trio was deployed, seeded, validation-compounded, and frozen on July 30-31.
> It is now retiring. Do not follow the old instruction to deploy another V4
> trio. V5 uses the separate Hook-to-Vault state machine recorded above.

---

## V4 Composability Source — Historical/Undeployed

Status: V4 source exists and is not deployed. It is historical candidate source,
not a pending V4 launch phase and not automatically part of V5.

| Contract | Path | Purpose |
|---|---|---|
| `NARAStakingPoolV4` | `contracts/v4/composability/NARAStakingPoolV4.sol` | ERC-20 `stNARA` wrapper over pooled v4 position NFTs |
| `NARAStakingPoolSYV4` | `contracts/v4/composability/NARAStakingPoolSYV4.sol` | Pendle SY adapter over `stNARA` |
| `NARAFractionalPositionV4` | `contracts/v4/composability/NARAFractionalPositionV4.sol` | Fractional ERC-20-like wrapper for one `NARAPositionNFTV4` |
| `NARAFractionalPositionFactoryV4` | `contracts/v4/composability/NARAFractionalPositionFactoryV4.sol` | Permissionless factory for fractional position wrappers |

Historical V4 deployment command — do not run for the V5 reset:

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
NODE_OPTIONS="--require ./polyfill.cjs" npm run test:hook:v5      # focused local Hook V5
NODE_OPTIONS="--require ./polyfill.cjs" npm run test:v5           # selected complete V5 matrix
NODE_OPTIONS="--require ./polyfill.cjs" npm run size              # compiled-runtime/creation size gate
npm run slither:v4                                                # static analysis
```

Current local verification evidence — **2026-08-01**:

- Forced Hardhat compile: **130 Solidity files compiled successfully** with
  solc 0.8.34 / Cancun. The emitted transient-storage and unreachable-code
  warnings are from OpenZeppelin dependency code; no compile error occurred.
- Strict TypeScript check of every `scripts/v5/lib/*.ts` planner module: passed.
- `npm run test:hook:v5`: **48 passing, 0 failing**. The added real-PoolManager
  regression proves a stale Engine with otherwise eligible weight cannot halt a
  swap or let a later locker capture the fee backing.
- All files under `test/v5/`: **102 passing, 0 failing** (re-run 2026-08-01;
  supersedes the earlier 83 stamp). This covers the fresh core, modules,
  periphery, complete-stack fee path, liquidity companions, repeated
  Vault/Engine backing reconciliation, release gate, deterministic deployment
  planner, protected-swap planning, economics, receipt-block reconciliation, and
  the NFT-bond lifecycle/math/real-Engine suites.
- `npm run size` previously aborted on Node 20 because
  `scripts/checkBytecodeSizes.ts` spawned `npx hardhat compile` without the
  mandatory `--require ./polyfill.cjs`. The script now forwards the polyfill
  through `NODE_OPTIONS`. Note that this gate runs `hardhat clean` first, so it
  must not run concurrently with a test suite — a parallel run deletes
  `artifacts/` mid-suite and produces spurious `ENOENT` mock-artifact failures.
- Final Base-fork V5 liquidity/retirement suite: **2 passing, 0 failing**. It
  exercises the real Base PoolManager, PositionManager, and Permit2 with local
  V5 contracts, including named-POL mint/increase, separate LP-fee harvest,
  Engine-backing sync, receipt-block reconciliation, retirement, complete NFT
  liquidity removal, and zero final active PoolManager liquidity. This is local
  fork evidence, not an on-chain one-hour rehearsal.
- V4 liquidity suites: **29 passing, 0 failing**.
- Fresh plain-artifact bytecode gate: every V5 deployable runtime and initcode is
  within the EVM limits. Reviewed liquidity runtimes are Engine 17,121; Hook
  15,385; Vault 10,949; Compounder 13,429; PhaseController 12,851; SeedCustody
  4,380; SeedInitializer 10,067; and PositionAdapter 10,728 bytes, each below
  the 24,576-byte runtime limit.
- Focused Slither 0.11.5 analysis compiled all 25 non-mock/non-interface V5
  production targets with pinned solc 0.8.34, via-IR, optimizer 200, and Cancun.
  The Hook returned zero results; manual review of the other Medium/High flags
  found only intentional guarded/accounting patterns and no actionable defect.
  This is local engineering evidence, not an independent external audit.
- The earlier aggregate `npm test` stamp was **566 passing, 1 failing** before
  the complete V5 candidate was added. It is historical, not a current aggregate
  result. Its one failure was
  `test/fork/NARAEngineLiveLock.fork.test.ts:50`, whose historical treasury EOA
  fixture now has zero NARA. This is an external live-state fixture failure,
  not a Hook V5 or V4-liquidity regression.
- These results prove a local candidate, not deployment or production readiness.
  Human-frozen parameters/custody, protected router/Quoter and basket
  integration, an immutable origin commit, independent external review, actual one-hour
  deployment/retirement evidence, production soak/monitoring, and every V5
  production address remain absent.

Pinned V4/recovery evidence — **2026-07-31**:

- The durable liquidity-retirement proof passed at pinned final-state Base block
  `49372240`; Stage 0, the seven-day wait, vault drain, `WindDown`, and both full
  decreases reconciled. USDC was exact; the only NARA difference was one
  explicitly asserted raw-unit (`1e-18`) PositionManager round-trip dust.
- V4 compile passed. V4 compiled-runtime size gate: all deployable artifacts remain within
  EVM limits. `NARAEngine` 24,554 · `NARALiquidityGrowthHook` 11,706 ·
  `NARALiquidityGrowthVault` 11,204 · `NARALiquidityCompounderV4` 10,843 ·
  `NARAPositionNFTV4` 21,562 · `NARAPositionRendererV5` 4,972 bytes.
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
    which was deliberately post-launch in the historical V4 plan). These results
    are preserved V4 evidence, not V5 launch approval.
  - Environment note: the local WSL distro that used to host these was wiped (its `ext4.vhdx` was under
    `%LOCALAPPDATA%\Temp\` and got reaped) and Docker Desktop hangs the dev PC, so these now run on a
    throwaway Linux box (or CI). Toolchain quirks hit on Ubuntu 26.04 / Python 3.14: npm needs
    `--legacy-peer-deps`; Aderyn needs solc 0.8.34 seeded into `~/.svm/`; crytic-compile 0.4.1 needs a
    one-line `default=str` patch to its `solc.py` JSON dump. See `scripts/run-gates-linux.sh`.
- Baskets (separate Foundry package, `../../nara-category-baskets-v1/`):
  **148 deterministic tests passing, 1 expected environment-dependent skip, 0
  failing** on 2026-07-31, with fork-only suites excluded. The separate
  CI-profile invariant run passed 4/4, including three 256-campaign/
  16,384-call invariants. Four Base adapter fork suites passed 31/31. App
  install, check, and production build passed. `ForkBuyProof` still requires a
  candidate basket stack deployed on the local fork and remains a release gate.

> Evidence is version-scoped. The active compile now includes the local complete
> V5 candidate as well as V4 recovery source. Use the dated V4 and focused V5
> results above or rerun the exact command; never combine them into an invented
> aggregate or treat either as complete-stack readiness.

---

## Recovery And V5 Work Order

The Stage A v4 core already exists. Do not rerun its deployment. V5 is a fresh
complete stack under [NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md](NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md).

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
6. ~~Clear the V4 engine backlog.~~ **Done 2026-07-31** through three successful
   Safe transactions. Further V4 epoch maintenance is recovery hygiene, not a
   V5 launch requirement. Do not call the V4 `syncEmissionReserve()` unless a
   separately reviewed recovery check proves direct untracked V4 NARA.
7. ~~Execute the validation compound, verify it, and freeze the replacement
   compounder.~~ **Done 2026-07-31.** The compounder owns POL NFT `2885838`,
   the accounting deltas reconciled, and `compounderFrozen()` is true.
8. ~~Through the custody Safe, revoke the old compound keeper and call
   `proposeRecovery(WindDown, custodySafe)` without withdrawing either LP.~~
   **Done 2026-07-31.** Safe transaction
   `0xf8079c502c32e037bbb947b0cccd3ef362a4f9b02325cff1f06db0963875435b`
   succeeded at Base block `49372944`. Keeper authorization is `false`; pending
   recovery is kind `3` (`WindDown`) to the Safe with ETA
   `2026-08-07T22:00:35Z` / `2026-08-08 01:00:35 Kyiv`. No NARA, USDC, NFT, or
   liquidity moved. Do not re-propose it or the clock restarts.
9. **NEXT DURING THE COOLDOWN.** A complete selected V5 contract candidate and
   offline deterministic deployment planner now exist locally. Continue
   adversarial concentrated-range/MEV simulation and independent external
   review using the parameter-neutral depth note as a lower bound; freeze every
   production parameter, allocation, custody role, runtime/proxy observation,
   seed/compound usage floor, phase threshold/window, and Engine share in the
   decision record. The unsigned protected-swap builder now prevents Quoter
   double-discounting, but approved Quoter/runtime evidence, Universal Router
   calldata/fork coverage, monitor, and basket integration remain open. Then use
   a disposable, non-public complete-stack
   deployment at exactly a one-hour recovery delay and retire every rehearsal
   address with exact receipt-block reconciliation. This local Base-fork proof
   is not that deployment. Production is a separate fresh deployment from an
   immutable origin with recovery already sealed at seven days or longer; never
   carry the one-hour addresses or policy into production. Continue basket
   contract and adapter verification, but do not broadcast a basket deployment
   against a liquidity stack slated for retirement.
10. At or after the ETA, build, review, and human-Safe-execute one atomic v4
    withdrawal: drain the old vault, execute the matured `WindDown`, decrease
    both old LP NFTs, take both currencies to the Safe, revoke allowances, and
    prove exact conservation. V5 does not need to be deployed first. Do not
    seed V5 or assign a v4-to-V5 conversion in this withdrawal.
11. After explicit approval of V5 supply, holder treatment, allocations,
    modules, roles, recovery, Engine share `X`, and every still-open liquidity
    parameter, run a newly implemented complete V5 deployment and verification
    suite against fresh V5 addresses.
12. Complete and record the required stability soak.
13. Run the complete basket deployment sequence on an exact Base-mainnet fork.
   Validate every adapter, immutable constructor value, typed collector route,
   oracle feed, role separation, engine/NARA binding, and exact-pull behavior
   before broadcast.
14. Broadcast the basket sequence only with an approved contract Safe/timelock
   as fee-collector admin. The deployment script rejects an EOA admin.
15. Save and verify a deployment manifest for every basket.
16. Run basket buy, sell, and `withdrawUnderlying` smoke tests.
17. Keep every frontend basket in preview until its manifest and smoke evidence
    pass the production gates.

---

## Current Baskets Activation Gates

The V4 market is active only as a retirement source. Existing `*:v4` build,
preflight, smoke, maintainer, and launch commands are V4 recovery/history tools;
they must not be run against or cited as verification for V5 addresses. The
baskets product is not ready for production activation until the complete V5
stack is deployed from approved immutable source and new fail-closed V5-specific
build, test, size, static-analysis, preseed, seed, smoke, engine-clockwork,
monitoring, exit, and soak gates are implemented and pass against its fresh
manifest.

- The 48 focused Hook tests and 83 selected complete-stack
  unit/integration/release/planner tests remain green, but do not substitute for
  deployment and product gates.
- Basket Foundry build, non-fork tests, and required Base-fork proofs pass.
- Before activation, the new V5 token/engine/reserve and every in-scope V5
  protocol module must be deployed from reviewed source, verified, correctly
  funded, and under approved custody.
- Before activation, the newly designed V5 NARA pool must be initialized,
  liquid, smoke-tested, and through the required stability soak.
- Before activation, the V5 hook/vault/compounder trio must be deployed from
  reviewed source, mutually wired, and verified; the quarantined V4 Stage A
  pool must remain uninitialized and the 2026-07-30 V4 pool must have documented
  atomic withdrawal/retirement evidence.
- The basket fee-collector admin is an approved contract Safe/timelock.
- Every basket has a verified deployment manifest.
- Admin, treasury, emergency, and owner roles for in-scope deployed contracts
  are assigned to approved production-controlled addresses.
- All deployment constructor inputs match the intended Base addresses.
- Public docs and frontend addresses are updated only after successful deployment verification.

---

## Fresh V4 Stage A Deployment — Recovery/Historical Evidence

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

## Current Liquidity Trio — Base Mainnet (deployed 2026-07-30; retirement planned)

Deployed by `scripts/redeployPoolOnly.ts` from the corrected post-2026-07-28
source. **This remains the active on-chain liquidity stack until a reviewed Safe
migration executes, but it is not the launch candidate.** All four contracts
are owned by the custody Safe `0xd65c0e390Dc187A22c52c03816591CC736C0D755`.

| Contract | Address | Status |
|---|---|---|
| `NARALiquidityGrowthVault` | `0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d` | Active pending migration; `RouteMode.Liquidity`; compounder frozen; dedicated keeper revoked in block `49372944`, so automatic compounding is stopped |
| `NARALiquidityGrowthHook` | `0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088` | Active pending migration; flags `0x2088`; pool registered, initialized, and seeded; pending low curve must not be finalized |
| `NARALiquidityCompounderV4` | `0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98` | Active pending migration; `WindDown` kind `3` pending to the custody Safe; ETA `2026-08-07T22:00:35Z`; maturity moves nothing automatically |
| `Create2HookDeployer` | `0xa6Ef629291170B80e5f23Ab14dB0B3620062f016` | Helper; owned by the Safe |

Replacement pool ID (**registered, initialized, and seeded 2026-07-30**):
`0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318`.

## Retiring V4 Pool Launch Evidence — Base Mainnet (2026-07-30)

Everything in this section is pinned V4 history and recovery evidence. It does
not define V5 opening price, seed amounts, fee basis, phase thresholds, routing,
or readiness.

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

Both vault deltas reconcile to the wei. The retiring V4 Hook-to-Vault path was
verified mechanically; this is not V5 routing or readiness evidence.

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

A later full ladder confirmed the economic problem and corrected the earlier
shorthand description of "15 buys": it was **20 buys × 15 USDC = 300 USDC**.
Each transaction landed in a separate block and paid only the 5% base tier, so
the vault captured exactly **15 USDC** and **285 USDC** reached the swap path.
The one-shot curve quote for 300 USDC was 50.55 USDC; the ladder therefore
avoided 35.55 USDC, or 70.32% of that quoted hook fee.

The ladder itself **did not add active liquidity**. Hook fees accrued in the
vault and liquidity changed only when an explicit compound later executed.

### Live sell, compound, and RPC false-negative evidence

Three live sells that emptied the liquidity EOA's NARA then confirmed the
shallow-depth problem:

| Transaction | Block | NARA from wallet | Hook fee to vault | USDC to wallet | End spot USDC/NARA |
|---|---:|---:|---:|---:|---:|
| `0x3fc3e8c2496cc21bda655e097abaf1ae488ff21f06f99d09cba0e4ba6db6e4ff` | `49371719` | `100,000` | `13,770` | `314.389472` | `0.001267444646714848` |
| `0xb78ed436845380938ca036efdc488e3884808f8b1fb74944e6c803fb138ec77c` | `49371916` | `100,000` | `13,770` | `68.465886` | `0.000500394328467635` |
| `0x508ffac254f3342499af9e0b4efbce23d7f991d9181d37a3fb667e6d5ad2ae87` | `49372197` | `75,772.141376089499042429` | `10,135.821206413424856364` | `25.524550` | `0.000304036052119707` |

The first sell had status `1`, used `222623` gas, and matched the projected
output within `0.000002 USDC`, while moving spot down `87.98%`. The second and
final sells also had status `1`, using `205913` and `194278` gas. Across all
three sells, the wallet sent `275,772.141376089499042429 NARA`, received
`408.379908 USDC`, and ended at exactly `0 NARA + 436.563886 USDC`.

Between the sells, the keeper successfully compounded transaction
`0x758e915dc9ff9d6917e459942903556a881114d17cf5ee8218f39dd4c23221e5`
at block `49371781`. The vault supplied `13,770 NARA + 15 USDC`; the compounder
used `13,745.616539382264769373 NARA + 17.372123 USDC` including banked USDC
and added `490228370306205` liquidity. This proves the movement/addition path
works mechanically. Current named liquidity is:

| Position | NFT | Active liquidity |
|---|---:|---:|
| Safe seed position | `2884402` | `4242640687119285` |
| Compounder position | `2885838` | `931745121747730` |
| **Total active liquidity** | — | **`5174385808867015`** |

Those two positions still equal all active pool liquidity; there is no
unattributed third-party active liquidity in the snapshot. This mechanical
success does not make the fee/depth economics acceptable and does not put the
sealed `650,000 NARA` reserve in scope.

The first successful sell was followed by a false script error because
`scripts/swapNaraForUsdc.ts` reads the latest wallet balance immediately after
`tx.wait()` without pinning the read to the receipt block. A load-balanced RPC
can return stale state, calculate approximately zero output, and print
`Post-state output is below the protected minimum` after the swap is already
final. The second sell is a distinct on-chain execution; the chain cannot say
whether it was intentional or a retry, but tooling must prevent an unverified
rerun. Replacement scripts must persist the hash, treat status `1` as executed,
use receipt-block reads plus receipt-specific transfer logs, report stale reads
as `EXECUTED — VERIFICATION PENDING`, and block same-parameter retries until the
previous hash/nonce is checked and a human confirms a new action.

### Recovery proposal and inventory snapshot

`deployments/v4-liquidity-stack-recovery-proposal-batch.json` was generated at
Base block `49372240`, after all three sells and the keeper compound. Its exact
two-call Safe batch and diagnostic full decreases passed read-only simulation.
The human Safe later executed those two Stage-0 calls successfully in
transaction
`0xf8079c502c32e037bbb947b0cccd3ef362a4f9b02325cff1f06db0963875435b`
at Base block `49372944` (`2026-07-31T22:00:35Z`). The artifact is now
**historical executed evidence: do not re-import, rerun, or re-propose it**.
Machine-readable receipt/event/readback evidence is in
`deployments/v4-liquidity-stack-recovery-stage0-execution-2026-07-31.json`.

The receipt emitted `CompoundKeeperSet(keeper, false)` and
`RecoveryProposed(kind=3, to=Safe, eta=1786140035)`. Readback through Base block
`49373282` confirmed keeper `false`, pending `WindDown` to the exact custody
Safe, ETA `2026-08-07T22:00:35Z` / `2026-08-08 01:00:35 Kyiv`, unchanged NFT
owners/liquidity and named balances, and the unchanged `650,000 NARA` reserve.
Both LP positions remain live. **The ETA does not trigger execution or asset
movement; a separate `2-of-3` Safe v4 withdrawal is mandatory.** That withdrawal
lands old NARA and USDC in custody and does not itself deploy or seed V5.

| Scoped source | Withdrawable/current NARA | Withdrawable/current USDC |
|---|---:|---:|
| Seed NFT `2884402`, principal plus claimable fees | `244,214.552718396627865941` | `78.858978` |
| Compounder NFT `2885838`, principal plus claimable fees | `53,518.118386149543239408` | `16.246494` |
| Compounder bank | `24.383460617742441949` | `268.675972` |
| Vault | `23,905.821206413424856364` | `0` |
| **Scoped recovery total** | **`321,662.875771577338403662`** | **`363.781444`** |

At pinned block `49372240`, the scoped pull snapshot was `363.781444 USDC`.
Because the old pool remains tradeable and fees can accrue, a fresh block-pinned
inventory is mandatory immediately before execution; `363.781444` is not a
guaranteed future receipt. Another `154.169235 USDC` was already in the custody
Safe and `436.563886 USDC` was in the separate liquidity EOA. At that snapshot,
a scoped pull would leave `517.950679 USDC` in the Safe; the EOA stays separate.
The recovery proposal moves zero assets. The recovered NARA remains NARA; its approximately
`97.797110 USDC` spot mark and the approximately `461.578554 USDC` combined
spot-equivalent are informational only, not guaranteed swap proceeds.

The durable proof in
`test/fork/NARAV4LiquidityRetirement.fork.test.ts` passed at final-state block
`49372240`. Stage 0 changed only keeper authorization and pending recovery.
After the local seven-day warp, the retirement drain added
`417262115245385` compounder liquidity, `WindDown` moved its NFT and bank to the
Safe, and full decreases reduced both NFTs and pool active liquidity to zero.
The Safe received all `363.781444 USDC`; NARA differed by exactly one asserted
raw unit (`1e-18 NARA`) from PositionManager add/remove rounding. The vault and
bank reached zero and the reward reserve remained unchanged. Production was
first re-read at block `49372469` before Stage 0 and all six fork transaction
hashes were absent. The later real Stage-0 Safe transaction is recorded above;
it changed only keeper authorization and pending recovery, as the proof
predicted.

- Historical V4 pool key: currency0 `NARA`, currency1 native `USDC`, fee `3000`, tick spacing `60`.
- Historical V4 configured fee-basis depth: `60,000 NARA` and `300 USDC`, set before
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

These fixed V4 depth values and the V4 notifier prohibition must not be
misread as V5 inputs. V5 has no `protocolDepth` and uses only the fresh Engine
receiver/routing design after that implementation and share `X` are approved.

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
- The 2026-07-30 compounder remains active only pending migration. It is wired,
  source verified, and permanently frozen to the current vault. It owns LP NFT
  `2885838` with liquidity `931745121747730` after the block-`49371781`
  compound, and reports lifetime additions of
  `24,243.436135662471128358 NARA + 35.941412 USDC`.
  Keeper authorization transaction
  `0x27d87f0c216133c590e49e59980b208d22726c5b6522d9572a9f16cff8f33cbd`
  set `compoundKeeper(0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7)=true`
  at block `49363406`. That keeper successfully executed the later compound at
  block `49371781`. The human Safe revoked it in Stage-0 transaction
  `0xf8079c502c32e037bbb947b0cccd3ef362a4f9b02325cff1f06db0963875435b`
  at block `49372944`; current authorization is `false`.
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

## V4 Recovery And Historical Scripts

None of these commands is a V5 deployment or verification path. Use mutation
commands only under the explicit V4 recovery authorization recorded in the
applicable runbook; never point them at V5.

| Script or command | Purpose |
|---|---|
| `npm run deploy:v4:base:usdc` | Historical full V4 deploy command; do not run again or reuse for V5 |
| `npm run v4:env:sync` | Generate `.env.v4.fresh` from a fresh deploy log and refuse retired incident-stack addresses |
| `npm run v4:env:sync:write` | Merge the generated fresh V4 launch keys into `.env` after review |
| `npm run deploy:v4:allocations` | Historical V4 allocation command; not authorized for this reset |
| `npm run deploy:v4:pool:only` | **Old-stack-only; do not run for this reset.** Its vault/hook/compounder design is replaced locally. An offline deterministic V5 planner exists, but no approved broadcast-capable V5 runner or production payload exists |
| `npm run verify:v4:preflight` | V4-only hook/vault/pool verification; not a V5 gate |
| `npm run maintain:v4:epochs` | Read-only engine epoch/reward-reserve health plan; add `-- --execute` only for an explicitly approved permissionless recovery |
| `npm run build:v4:epoch-recovery` | Build and simulate one Safe Transaction Builder batch containing the complete current epoch recovery; never broadcasts |
| `npm run build:v4:fee-curve` | Disabled fail-closed: the pending low fee policy is superseded and must not be proposed or finalized |
| `npm run build:v4:compounder-validation` | Build and simulate validation compound or permanent-freeze batches; never broadcasts |
| `npm run build:v4:liquidity-recovery-proposal` | Historical Stage-0 builder; Stage 0 already executed, so do not rerun or re-propose it |
| `npm run smoke:v4` | Historical V4 smoke path; do not use as V5 evidence or trade the retiring pool without separate approval |
| `npm run launch:gates` | V4-only gate wrapper; not a V5 launch gate |
| `npm run slither:v4` | Scoped Slither static-analysis gate for V4 contracts |
| `npm run aderyn:v4` | Aderyn all-contract and V4-focused static-analysis reports |
| `npm run echidna:v4` | Echidna V4 engine-accounting fuzz gate |
| `npm run echidna:v4:smoke` | Short Echidna smoke profile for tool/path validation |
| `scripts/deployComposabilityV4.ts` | Deploy v4 composability layer |
| `scripts/lib/v4LiveConfig.ts` | Shared canonical v4 live config for ops scripts |
| `npm run build:v4:atomic-pool-launch` | **Old-stack-only; do not run for this reset.** V4 withdrawal needs a Safe-compatible atomic removal builder; the separate V5 pool needs its own reviewed seed builder and newly approved price |
| `scripts/seedV4Liquidity.ts` | Disabled direct-seed helper retained only for receipt/recovery utilities |
| `scripts/removeV4Liquidity.ts` | Historical direct-EOA removal helper; **do not use** for Safe-owned migration positions; the reset requires a separate Safe-compatible atomic migration builder |
| `scripts/swapUsdcForNara.ts` | Retiring-V4 test/recovery helper only; not a V5 smoke tool and not authorized for an unreviewed live trade |
| `scripts/swapNaraForUsdc.ts` | Retiring-V4 helper with a documented stale read-after-write post-check defect; never retry from its error alone and do not use for V5 |

`scripts/lib/v4LiveConfig.ts` requires explicit V4 addresses for V4
recovery/verification. It is not a V5 configuration source. Retired
incident-stack defaults remain blocked unless `V4_ALLOW_RETIRED_DEFAULTS=1` is
intentionally set for a recovery-only check.

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

Full archive: [archive/legacy-v3/README.md](../archive/legacy-v3/README.md)

---

## Maintenance Rule

Update this file whenever canonical live state changes. If a stack is retired, mark it retired here immediately. If code changes a function signature, deployment order, or verification command, update this file in the same change set.
