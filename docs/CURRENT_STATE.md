# Current State

Last updated: 2026-07-04 (Renderer V5 action-accretion pass: standard cards now render claim
phyllotaxis, extension sediment, and a compact C/E action ledger; Genesis/Eternal plates render
archive accretion. Full suite and bytecode size gate re-run green).

This is the canonical state document for the active NARA workspace. Code is the source of truth. When this document conflicts with Solidity or deployment scripts, update this document.

Resume v4 work from:

- [V4_NEXT_SESSION_HANDOFF.md](V4_NEXT_SESSION_HANDOFF.md)
- [research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md](research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md)
- [V4_AUDIT_RESPONSE_2026-04-23.md](V4_AUDIT_RESPONSE_2026-04-23.md)
- [V4_INCIDENT_REDEPLOY_2026-04-23.md](V4_INCIDENT_REDEPLOY_2026-04-23.md)
- [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md)

---

## 🚨 v4 RESET — 2026-05-27

On **2026-05-27** the project committed to a clean fresh start on v4. The entire v3 protocol stack is **retired**. This is unconditional — not conditional on the v4 redeploy completing.

- v3 is not "still live until v4 launches." v3 is retired now.
- A fresh NARA token will launch from `contracts/v4/NARAToken.sol` with a new address. The v3 token `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C` is permanently retired.
- All v3 mainnet contracts are archived at `archive/legacy-v3/`. See [archive/legacy-v3/README.md](../archive/legacy-v3/README.md) for the full retired-address table.
- The only current code path is `contracts/v4/`.
- Frontend apps (`apps/nara-lockboard/`, `apps/nara-lotto/`, `apps/nara-arena/`) were wired to v3 ABIs and are non-functional end-to-end until rebuilt for v4.

---

## Operational Truth

The v4 incident stack deployed on 2026-04-23 is retired for launch purposes. It remains relevant only for recovery, accounting, and historical analysis.

The next production launch must use a fresh v4 redeploy from the current repo code. Do not market, integrate, or reuse the retired v4 incident stack as the public launch candidate.

Current launch constraint: operator has approximately `$1k` for liquidity. Treat the next v4 launch as a calibrated lock/NFT launch, not a full public trading launch. The detailed plan is [research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md](research/V4_1K_LIQUIDITY_LAUNCH_PLAN_2026-05-05.md).

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

These are the current v4 source contracts. A fresh mainnet deploy from these sources is the next launch step.

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
| `NARALiquidityCompounderV4` | `contracts/v4/NARALiquidityCompounderV4.sol` | Production POL compounder: adds the vault's NARA/USDC skim as a **full-range** Uniswap v4 position (PositionManager + Permit2). No-swap, exact-spend, remainder-banking. POL is owner-recoverable via a **7-day recovery timelock** (propose→wait→execute: migrate / sweep banked / wind-down), so holders get a ≥7-day exit window; renounce ownership later for permanent POL. Built, unit-tested (8 tests) + **Base fork-validated** against live PoolManager/PositionManager/Permit2; **not yet deployed/wired** (needs deploy + `setCompounder`). |
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

> **Flywheel status (2026-06-29): compounder built, awaiting deploy.** `Liquidity` mode compounds via
> an **external `ILiquidityCompounder` adapter** (`vault.setCompounder`). The production adapter now
> exists — **`NARALiquidityCompounderV4`** (full-range, no-swap, exact-spend, POL custody), unit-tested
> through the real vault + a faithful PositionManager/Permit2 mock. **Remaining before it runs on
> mainnet:** deploy via `scripts/deployLiquidityCompounderV4.ts`, then the Safe calls
> `vault.setCompounder` + `freezeCompounder`, plus a Base fork test against the real PositionManager.
> Until then the vault reverts compounding (no compounder set) and `Liquidity` mode is inert. The
> harvest (hook) + routing (vault) were always built and self-sustaining; this closes the loop. See
> `UNISWAP_V4_HOOK.md`.

---

## v4 Composability Layer

Status: code complete in repo, not yet deployed, awaiting fresh v4 core mainnet redeploy.

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

- Full Hardhat suite: **449 passing, 0 failing, 0 skipped**. Run `npx hardhat test` for the live number.
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
- Baskets (separate Foundry package, `../../nara-category-baskets-v1/`): **136 passing, 1 skipped**
  (the skip is the fork test needing `--fork-url`), 0 failing.

> Historical note: pre-reset runs cited "568 passing" — that count predates the 2026-05-27 v4 reset
> that archived the v3 stack and its tests. The active v4 suite is the 360 above.

---

## v4 Deployment Order

Strict order for next clean launch:

1. Deploy fresh v4 core with `npm run deploy:v4:base:usdc`.
2. Sync fresh launch config with `npm run v4:env:sync`, review `.env.v4.fresh`, then run `npm run v4:env:sync:write`.
3. Run `npm run verify:v4:preflight`.
4. Seed NARA/USDC liquidity with `scripts/seedV4Liquidity.ts`.
5. Rerun `npm run v4:env:sync:write` so `.env` captures the real LP NFT token ID from `deployments/v4-liquidity-seed-latest.json`.
6. Run `npm run smoke:v4`.
7. Deploy v4 allocations if applicable with `npm run deploy:v4:allocations`.
8. Open NFT bond depository only after terms, capacity, treasury, and Genesis metadata are verified.
9. Deploy composability layer with `scripts/deployComposabilityV4.ts`.
10. Transfer all production roles to the intended Safe or timelock.
11. Start with a small monitored deposit and watch for at least 48 hours before public promotion.
12. Contact Pendle with the deployed `NARAStakingPoolSYV4` address only after local and testnet/fork reward-index checks pass.

---

## v4 Launch Gates

The next v4 launch candidate is not production-ready until all gates below are true:

- `npm run build` passes.
- `npm test` passes.
- `npm run size` passes.
- `npm run slither:v4` passes.
- `npm run aderyn:v4` passes.
- `npm run echidna:v4` passes.
- `npm run verify:v4:preflight` passes against the intended deployment config.
- `npm run smoke:v4` passes after liquidity is seeded.
- `npm run launch:gates` passes. This wraps safe local/static gates and the read-only preflight.
- Composability focused tests pass if composability is included in launch.
- Static analysis is run for in-scope v4 contracts.
- Admin, treasury, emergency, market, cap, and owner roles are assigned to production-controlled addresses.
- All deployment constructor inputs match the intended Base addresses.
- Public docs and frontend addresses are updated only after successful deployment verification.

---

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
- The next launch must come from a fresh deploy using current `NARALiquidityGrowthHook` and `NARALiquidityGrowthVault` code.

---

## v4 Scripts

| Script or command | Purpose |
|---|---|
| `npm run deploy:v4:base:usdc` | Full v4 core deploy with canonical deployment output |
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
- Active frontend surfaces: `apps/nara-lockboard/`, `apps/nara-lotto/`, and `apps/nara-arena/` — **not yet functional end-to-end; must be rebuilt for v4 ABIs before use**
- Active cron folder: `cron/` — cron targets v3 engine and must be retargeted for v4 before use
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
