# NARA v4 Launch Plan With $1k Liquidity

Date: 2026-05-05

Scope: fresh NARA v4 launch from the current repo contracts. This is an operational launch/risk plan, not legal or financial advice.

## Executive Decision

Do not run a full public hype launch with only $1k of liquidity.

Proceed as a calibrated v4 launch:

1. Fresh deploy only. Do not reuse the retired 2026-04-23 v4 incident stack.
2. Seed a small NARA/Base-native-USDC Uniswap v4 pool.
3. Open only controlled lock/NFT flows first.
4. Keep bonds closed.
5. Keep stNARA, Pendle SY, fractional wrappers, games, and sponsor campaigns out of the day-1 launch scope.
6. Use the first 7-14 days to prove contract wiring, user flows, docs, analytics, and real demand before trying to deepen liquidity or open bond capacity.

The product you are launching first is not "trade NARA size." It is "commit to NARA through locked positions/NFT positions with transparent thin-liquidity limits."

## Current Contract Read

### Current v4 Status

The repo state says public live protocol is still v3, the 2026-04-23 v4 incident stack is retired, and the next production launch must be a fresh v4 redeploy. `docs/CURRENT_STATE.md` and `docs/V4_LAUNCH_CHECKLIST.md` both explicitly warn not to run fresh preflight/seed/smoke scripts against retired defaults.

Operational implication: the first launch step is not marketing. It is a fresh Base deployment, address export, preflight, seed, smoke, and Basescan verification.

### Token

`contracts/v4/NARAToken.sol` is simple in the ways that matter for launch:

- `MAX_SUPPLY = 1,000,000 NARA`.
- Supply is minted once to treasury in the constructor.
- There is no later mint path.
- There is no token owner pause switch.
- Flash mint fee is 10 bps and routes to immutable `FLASH_FEE_SINK`, normally the engine.

Launch implication: token supply risk is legible. Operational risk moves to treasury custody, liquidity, router UX, and downstream modules.

### Launcher And Engine

`NARALauncher` does one atomic token+engine deploy and cannot launch twice.

`NARAEngine` is the core lock/reward engine:

- JIT epoch advance is capped at 8 epochs per user-facing call.
- Direct ETH is rejected; ETH rewards must enter through `notifyEthRewards()`.
- Non-NARA ERC-20 rewards enter through role-gated `notifyTokenRewards(address,uint256)`.
- Reward reserve and bond vault are one-shot bindings.
- Lock/claim/unlock fee caps exist: 10% max percentage fee and 0.01 ETH max flat fee.

Launch implication: after deployment, binding choices matter. Do not bind a throwaway bond vault if bonds are part of the long-term plan. Do not change fee configs near launch unless the frontend/docs already show them.

### Liquidity Hook

`NARALiquidityGrowthHook` is the most important contract for a $1k launch.

It is an exact-input Uniswap v4 hook. Exact-output swaps revert. It registers one NARA/USDC pool, validates pool initialization, and takes a pressure-based hook fee from the input token before the swap proceeds.

Default buy curve:

| Trade pressure vs depth | Hook fee |
|---:|---:|
| Below 5% | 5% |
| 5% to below 15% | 8% |
| 15% to below 30% | 12% |
| 30%+ | 20% |
| Hard cap | 25% |

Default sell curve:

| Trade pressure vs depth | Hook fee |
|---:|---:|
| Below 5% | 5% |
| 5% to below 15% | 7% |
| 15% to below 30% | 10% |
| 30%+ | 15% |
| Hard cap | 20% |

The Uniswap pool fee is separate. The deploy script default is `V4_POOL_FEE=3000`, meaning 0.30%, before hook fee and before price impact.

With only $1,000 USDC-side depth, a user experience table looks like this:

| USDC exact-input buy | Pressure | Buy hook fee | Total explicit fee before price impact |
|---:|---:|---:|---:|
| $10 | 1% | 5% | about 5.30% |
| $25 | 2.5% | 5% | about 5.30% |
| $50 | 5% | 8% | about 8.30% |
| $100 | 10% | 8% | about 8.30% |
| $150 | 15% | 12% | about 12.30% |
| $300 | 30% | 20% | about 20.30% |

With only $800 USDC-side depth, the 5%/15%/30% thresholds become $40/$120/$240.

Launch implication: the frontend must make tiny trades normal. A $50+ buy is already a high-friction trade in a $1k pool. Any marketing that invites size will create bad fills, confusion, and screenshots that make the protocol look hostile.

### Liquidity Growth Vault

`NARALiquidityGrowthVault` starts in `RouteMode.Liquidity`. If no compounder is configured, fees sit in the vault. Preflight warns when fees are parked in Liquidity mode with no compounder.

For this launch, use:

```env
V4_SKIP_COMPOUNDER=1
```

That is acceptable for day 1. It means collected pool fees accumulate instead of being routed automatically. Do not switch to `Engine`, `Genesis`, `Split`, or `GenesisSplit` until the pool has real depth and the reward UX is tested.

### Position NFT

`NARAPositionNFTV4` is launch-useful. It wraps engine positions into tradable ERC-721 positions through clone accounts. It also supports Genesis metadata, Genesis reward weight, and authorized Genesis minters.

Launch implication: the best first public surface is "mint/lock a position NFT" with transparent lock duration and reward accounting. This fits the protocol better than encouraging open-market speculation.

### Bonds

`NARABondVaultV4` has a hard max bond allocation of 290,000 NARA. `activeReleaseCap` starts at zero. Only the market can pull, and cap/market changes are timelocked.

`NARABondDepositoryV4NFT` starts closed unless capacity is added. Fixed terms require at least 1 day admin delay, become stale after 1 day, and purchases mint Genesis position NFTs.

Critical point: v4 bond terms are manual/fixed-price terms. There is no live TWAP oracle in the v4 NFT bond depository. That is correct for a first thin-liquidity launch, but it means bonds must stay closed until liquidity and pricing are defensible.

Launch implication: deploy the bond vault/depository only if you need allocation wiring and future bond readiness, but keep `V4_BOND_ACTIVE=false`, keep release cap at zero, and do not add capacity.

Do not reduce the bond vault allocation just because day-1 liquidity is small. If the future bond program matters, the initial bond vault allocation is a long-term capacity choice. Instead, keep the full intended allocation in the vault and keep active release cap at zero.

### stNARA, SY, Fractional Wrappers

`NARAStakingPoolV4` requires a 100 NARA minimum initial deposit and burns 1 dead share. The staking/SY/fractional layer is implemented locally but increases integration and redemption surface.

Launch implication: do not deploy public composability on day 1 with $1k liquidity. It splits attention, creates extra support load, and can make users think there is more market depth than exists.

## External Protocol Assumptions Checked

Uniswap v4 docs confirm that v4 pools use a singleton `PoolManager` and optional hooks; hooks can be called at lifecycle points such as initialization and swap execution. That matches this repo's launch design: one NARA/USDC pool with `beforeInitialize`, `beforeSwap`, and `beforeSwapReturnDelta` behavior.

Circle docs confirm Base native USDC is `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Use native USDC, not bridged USDbC.

Sources:

- Uniswap v4 hooks: https://developers.uniswap.org/docs/protocols/v4/concepts/hooks
- Uniswap v4 PoolManager: https://developers.uniswap.org/docs/protocols/v4/concepts/poolmanager
- Uniswap v4 swap hooks: https://developers.uniswap.org/docs/protocols/v4/guides/hooks/swap-hooks
- Circle Base USDC: https://www.circle.com/blog/usdc-now-available-natively-on-base

## Verification Completed Locally

Run location: `nara-protocol-hardhat/`

Completed on 2026-05-05:

```powershell
npm run test:v4
npm run test:nft:v4
npm run test:bond:v4
npm run test:bond-nft:v4
npm run test:invariants:v4
npm run size
```

Results:

- Core v4 token/launcher/engine/hook/vault tests passed.
- Position NFT v4 tests passed.
- Bond vault/depository tests passed.
- Bond NFT depository tests passed.
- Invariant regression suite passed.
- Bytecode size check passed for all deployable artifacts.

Remaining before mainnet:

- Run static analysis if toolchain is available:

```powershell
npx slither contracts/v4/ --exclude naming-convention
npx slither contracts/v4/composability/ --exclude naming-convention
```

- Run a Base fork deployment/smoke if RPC supports it.
- Verify Basescan source for every deployed contract after mainnet deployment.

## $1k Liquidity Strategy

### Budget Split

If the $1,000 includes gas and operations:

- Use $800 USDC for LP.
- Hold $150-$200 equivalent for deploy gas, verification attempts, smoke trades, and emergency admin operations.
- Do not spend the whole $1,000 in the initial LP if it leaves you unable to execute fixes or verification.

If the $1,000 is dedicated liquidity and gas is separate:

- Use the full $1,000 USDC side for LP.
- Keep ETH for deploy and ops outside this number.

### Initial Price Decision

The deploy script sets the initial pool price through:

```env
V4_INITIAL_NARA_AMOUNT=
V4_INITIAL_USDC_AMOUNT=
```

The seed script then mints actual liquidity through:

```env
V4_SEED_NARA=
V4_SEED_USDC=
```

The initial ratio and seed ratio must match.

There are two viable lanes. Pick one before deployment. Do not improvise this during deployment.

#### Lane A: Access Launch

Use this if there is no binding old-token conversion price and you want users to understand the pool without absurd FDV optics.

If gas is separate:

```env
V4_INITIAL_NARA_AMOUNT=1000
V4_INITIAL_USDC_AMOUNT=1000
V4_SEED_NARA=1000
V4_SEED_USDC=1000
```

If gas comes from the $1,000:

```env
V4_INITIAL_NARA_AMOUNT=800
V4_INITIAL_USDC_AMOUNT=800
V4_SEED_NARA=800
V4_SEED_USDC=800
```

Implied price: $1/NARA.

Pros:

- Cleaner day-1 optics.
- More accessible for early committed users.
- Less likely to look like a $10M FDV token with almost no liquidity.

Cons:

- More NARA in the pool.
- Buyers can acquire meaningful NARA with small dollars.
- If there is an old-market/migration expectation, this may conflict with it.

#### Lane B: Protocol-Continuity Launch

Use this only if the existing docs/community economics require the prior 30 NARA / 300 USDC style ratio.

If gas is separate:

```env
V4_INITIAL_NARA_AMOUNT=100
V4_INITIAL_USDC_AMOUNT=1000
V4_SEED_NARA=100
V4_SEED_USDC=1000
```

If gas comes from the $1,000:

```env
V4_INITIAL_NARA_AMOUNT=80
V4_INITIAL_USDC_AMOUNT=800
V4_SEED_NARA=80
V4_SEED_USDC=800
```

Implied price: $10/NARA.

Pros:

- Matches the repo's existing 30 NARA / 300 USDC seed pattern.
- Keeps very little NARA in the liquid pool.
- Supports the "tiny float, commitment first" thesis.

Cons:

- 1,000,000 fixed supply implies high FDV optics.
- Only 80-100 NARA is available around the opening pool.
- A few small buys can create dramatic price movement.
- Public users may interpret the launch as overvalued or inaccessible.

### Recommendation

Use Lane A unless there is a specific old-token/migration/brand reason not to.

With $1k liquidity, the project needs trust, clean UX, and early committed users more than it needs an aggressive implied price. A $1/NARA opening is easier to explain and easier to defend. If the strategy depends on a tiny liquid float and high implied price, use Lane B but frame the launch as a calibration launch, not a public trading launch.

## Day-1 Product Scope

Open:

- Fresh v4 token/engine.
- NARA/Base native USDC v4 pool.
- Growth hook and vault.
- Position NFT mint/lock path, after allocation deployment and verification.
- Small exact-input buy path for users who need NARA to lock.

Closed:

- Bonds.
- stNARA.
- Pendle SY.
- Fractional wrappers.
- Games/arena.
- Sponsor hub.
- Any "earn APY" campaign that implies returns.
- Any large-trade trading page.

## User Messaging Rules

Say:

- "This is a calibrated v4 launch with intentionally small liquidity."
- "Use small exact-input trades."
- "The pool has a hook fee that starts at 5% and rises with trade size."
- "Bonds are closed until liquidity and pricing conditions justify opening."
- "The first useful action is locking NARA into a position/NFT, not trading size."

Do not say:

- "Fair launch."
- "Deep liquidity."
- "Price floor."
- "Guaranteed APY."
- "Bonds opening soon" unless the bond gate below is met.
- "No slippage" or "low fee."
- "Official v4 is live" before fresh addresses are verified and docs/frontend are updated.

## Concrete Deployment Plan

### Phase 0: Final Pre-Launch Decisions

Before any mainnet transaction:

1. Pick Lane A or Lane B initial price.
2. Decide whether `$1k` includes gas.
3. Confirm there is no migration promise that conflicts with the selected opening price.
4. Confirm admin and treasury addresses.
5. Confirm whether token metadata will avoid duplicate old metadata.

Recommended:

```env
V4_TOKEN_NAME=NARA Protocol v4
V4_TOKEN_SYMBOL=NARAv4
```

If you insist on `NARA`/`NARA`, the deploy script requires:

```env
V4_ALLOW_DUPLICATE_TOKEN_METADATA=1
```

Use duplicate metadata only if public docs clearly distinguish fresh v4 from the retired stack and v3.

### Phase 1: Environment Setup

Use Base native USDC:

```env
V4_BASE_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

Core deployment:

```env
BASE_RPC_URL=
PRIVATE_KEY=
TREASURY_PRIVATE_KEY=
V4_ADMIN_ADDRESS=
V4_TREASURY_ADDRESS=
V4_POOL_FEE=3000
V4_TICK_SPACING=60
V4_EMISSION_RESERVE_NARA=700000
V4_REQUIRE_REWARD_DEPOSIT=1
V4_SKIP_COMPOUNDER=1
```

Liquidity wallet:

```env
LIQ_PRIVATE_KEY=
V4_SEED_SLIPPAGE_BPS=200
```

Important: `scripts/seedV4Liquidity.ts` uses `LIQ_PRIVATE_KEY`. Fund the LIQ wallet with the seed USDC and seed NARA before running the seed script.

### Phase 2: Local Gate

Run before mainnet:

```powershell
npm run test:v4
npm run test:nft:v4
npm run test:bond:v4
npm run test:bond-nft:v4
npm run test:invariants:v4
npm run size
```

Optional static-analysis gate:

```powershell
npx slither contracts/v4/ --exclude naming-convention
```

No-go if:

- Any focused v4 test fails.
- Bytecode size fails.
- Static analysis finds a launch-relevant issue that affects core, hook, vault, NFT, or bonds.

### Phase 3: Fresh Core Deploy

Deploy:

```powershell
npm run deploy:v4:base:usdc
```

This deploys and wires:

- `NARALauncher`
- fresh `NARAToken`
- fresh `NARAEngine`
- `NARALiquidityGrowthVault`
- `Create2HookDeployer`
- `NARALiquidityGrowthHook`
- NARA/USDC v4 pool initialization

Do not announce after this step.

### Phase 4: Sync Fresh Addresses

Generate fresh launch env from:

```text
deployments/v4-base-usdc-latest.json
```

```powershell
npm run v4:env:sync
npm run v4:env:sync:write
```

This is critical because `scripts/lib/v4LiveConfig.ts` still has retired incident-stack defaults for backward compatibility.

No-go if `.env` still resolves to retired addresses.

### Phase 5: Preflight

Run:

```powershell
npm run verify:v4:preflight
```

Expected warning with this plan:

- Pool fees are parked in Liquidity mode with no compounder.

That warning is acceptable for day 1 if intentional.

No-go if:

- Hook token/base/vault mismatch.
- Vault token/base/hook/engine mismatch.
- Pool ID mismatch.
- `.env` points to retired defaults.
- LP token ID is stale after seed.

### Phase 6: Seed Liquidity

Option 1: seed directly.

```powershell
npx tsx scripts/seedV4Liquidity.ts
```

Then sync the seed log into `.env`:

```powershell
npm run v4:env:sync:write
```

Option 2: use the smoke script as the first seed.

Set:

```env
V4_SMOKE_SEED_NARA=<same as selected seed>
V4_SMOKE_SEED_USDC=<same as selected seed>
V4_SMOKE_BUY_USDC=5
V4_SMOKE_SELL_NARA=1
```

Then run:

```powershell
npm run smoke:v4
```

Be careful: `npm run smoke:v4` seeds liquidity as part of the smoke flow. Do not run direct seed and then smoke with full seed values unless you intend to add liquidity twice.

Recommendation: seed directly first, then use the smallest practical manual buy/sell scripts or a smoke configuration with tiny additional seed if needed.

### Phase 7: Post-Seed Preflight

Run:

```powershell
npm run verify:v4:preflight
```

No-go if:

- LP liquidity is zero.
- LP token ID is missing/stale.
- Pool fee/vault balances look wrong.
- Small exact-input buy/sell fails.

### Phase 8: Allocation Layer

Only after core preflight and seed smoke pass:

```env
V4_BOND_ACTIVE=false
V4_OPS_AMOUNT_NARA=0
V4_BOND_AMOUNT_NARA=289970
V4_MIN_TREASURY_FLOAT_NARA=10030
V4_POSITION_NFT_ROYALTY_BPS=0
```

Run dry validation first:

```env
V4_ALLOC_DRY_RUN=1
```

```powershell
npm run deploy:v4:allocations
```

If dry run passes, remove `V4_ALLOC_DRY_RUN=1` and run:

```powershell
npm run deploy:v4:allocations
npm run verify:v4:allocations
```

Why keep `V4_BOND_AMOUNT_NARA=289970` if liquidity is only $1k?

Because this is long-term maximum inventory wiring, not day-1 open capacity. `NARABondVaultV4` active release cap stays zero until you explicitly raise it. Deploying a tiny bond vault now can permanently limit the bond program if the engine binding is one-shot. Keep the intended vault capacity, but do not open the market.

### Phase 9: Contract Verification And Docs

Verify every deployed contract on Basescan.

Update:

- `docs/CURRENT_STATE.md`
- `docs/V4_LAUNCH_CHECKLIST.md`
- frontend config
- public docs

No-go if public docs or frontend still point to retired v4 addresses.

### Phase 10: Private Calibration Window

Run for 24-48 hours with no broad announcement.

Actions:

- Operator performs small exact-input buy.
- Operator locks NARA through engine.
- Operator mints an NFT position.
- Operator claims after reward state changes.
- Operator unlocks only if a short test position exists.
- Monitor hook vault balances.
- Monitor pool depth.
- Monitor failed router transactions.
- Confirm users can see hook fee and slippage before signing.

No-go for public launch if:

- Users cannot understand the hook fee before signing.
- Any normal wallet flow tries exact-output swap.
- Preflight warnings are unexplained.
- Contract verification is incomplete.
- Admin ownership/roles are not on the intended address.

## Public Launch Plan

### Day 0 Public

Announce narrowly:

- Fresh v4 deployed and verified.
- NARA/USDC pool is live with intentionally small initial liquidity.
- Hook fee starts at 5% and rises with order pressure.
- Bonds closed.
- Composability closed.
- Lock/NFT position flow is the main action.

Recommended caps:

- Suggested buy size: $5-$25.
- Warn before any buy above 5% of current USDC-side pool depth.
- Hide or strongly warn on buys above 15% of depth.
- Block frontend buys above 30% of depth unless user enters an advanced route.

### Days 1-3

Goals:

- 5-20 real users complete tiny buy + lock/NFT.
- No unexplained reverted swaps.
- No wrong-address confusion.
- At least one clean rewards/claim cycle if epoch timing allows.
- Hook fee vault accounting matches expected flow.

Do not:

- Open bonds.
- Deploy stNARA.
- Contact Pendle.
- Run influencer calls.
- Promise liquidity expansion dates.

### Days 4-7

Start liquidity-building conversations, not bond sales.

Possible actions:

- Ask committed users to lock, not trade.
- Invite a few aligned LPs privately.
- Offer non-transfer-promissory recognition for early lockers.
- Build analytics dashboard for pool depth, lock weight, vault fees, reward reserve, and Genesis weight.
- Publish "how v4 works" docs with address verification.

Goal before broader promotion:

- At least $5k-$10k pool depth.
- Stable preflight.
- No exact-output UX failures.
- No support confusion around old v3/v4 addresses.

### Weeks 2-4

Only after the launch proves stable:

- Consider a controlled liquidity-growth campaign.
- Consider small pool-fee compounding automation if vault balances justify it.
- Consider Genesis reward routing only after the Genesis distributor has real claim UX.
- Consider public composability only after the position NFT flow is boring and reliable.

## Bond Opening Gate

Do not open bonds until all are true:

- Fresh v4 core verified.
- Allocation verification passed.
- `activeReleaseCap` is still zero before the planned opening.
- Pool has at least $10k depth for a tiny experimental tranche; preferably $25k+.
- Manual terms are set after a 1-day delay and will be used only inside their 1-day freshness window.
- Frontend shows fixed bond terms, max payout, lock duration, Genesis metadata, and no instant-liquidity promise.
- First tranche cap is tiny.

Suggested first experimental bond tranche:

```env
V4_BOND_ACTIVE=true
V4_BOND_DISCOUNT_BPS=0
V4_BOND_MIN_DEPOSIT_ETH=0.005
V4_BOND_MAX_PAYOUT_NARA=50
```

Release cap for first tranche: 100-500 NARA, not thousands.

If the pool is still around $1k, bond cap stays zero.

## Composability Gate

Do not deploy public stNARA/SY/fractional wrappers until all are true:

- Core, pool, allocations, and NFT flow are verified.
- Pool depth is at least $25k; preferably $50k+.
- Users understand lock positions.
- `NARAStakingPoolV4` initial deposit source is planned.
- Redemption/claim flows are tested against deployed contracts.
- No pending uncertainty around reward indexes or internal balances.

## Frontend Requirements

The frontend should enforce the launch reality:

- Exact-input swaps only.
- Show hook fee tier before wallet signature.
- Show Uniswap pool fee separately.
- Show estimated price impact separately.
- Show "thin liquidity" warning when trade pressure exceeds 5%.
- Use Base native USDC address only.
- Show fresh v4 contract addresses with Basescan links.
- Do not show retired v4 addresses anywhere in active UI.
- For lock/NFT flow, show duration, activation timing, claimability, unlock date, and whether Genesis/Eternal applies.

Minimum frontend trade guard:

```text
if tradePressureBps >= 500:
  warn "This trade enters a higher hook-fee tier."

if tradePressureBps >= 1500:
  require advanced confirmation.

if tradePressureBps >= 3000:
  block in default UI.
```

## Analytics Requirements

Before public launch, track:

- Pool USDC balance/depth.
- Pool NARA balance/depth.
- LP token ID and owner.
- Hook vault USDC/NARA balances.
- Hook route mode.
- Engine current epoch.
- Engine active weight.
- Reward reserve balance.
- Total locks and NFT positions.
- Failed swaps by revert reason.
- Admin role holder addresses.
- Bond vault inventory and active release cap.

## Emergency Runbook

If wrong addresses are published:

1. Delete/replace public links immediately.
2. Pin a correction.
3. Update `docs/CURRENT_STATE.md`.
4. Do not continue launch until frontend and docs agree.

If exact-output swaps are failing for users:

1. Confirm router path.
2. Disable affected route in frontend.
3. Route users through exact-input only.
4. Document the limitation.

If pool price moves violently:

1. Do not add bond capacity.
2. Do not widen marketing.
3. Publish current depth and hook fee explanation.
4. Consider adding LP only if the price is still aligned with the selected launch lane.

If hook vault balances accumulate:

1. Leave them parked.
2. Do not route to Engine/Genesis during an incident.
3. Re-run preflight.
4. Decide route mode only after balances and user claims are understood.

If bond terms were accidentally opened:

1. Pause depository if available through admin flow.
2. Do not add capacity.
3. Confirm `activeReleaseCap`.
4. If capacity exists, return unsold inventory where applicable.
5. Publish correction only after on-chain state is verified.

## Go/No-Go Checklist

Go only if:

- Fresh v4 deployed from current repo.
- Focused v4 tests pass.
- Bytecode size check passes.
- `.env` points to fresh addresses.
- Preflight passes.
- LP seeded with intended ratio.
- Smoke buy/sell passes with tiny exact-input trades.
- Basescan verification complete.
- Admin/treasury roles are correct.
- Frontend has thin-liquidity and hook-fee warnings.
- Bonds closed.
- Composability closed.
- Public docs distinguish v3, retired v4, and fresh v4.

No-go if:

- Any script points to retired v4 defaults.
- Initial price lane is undecided.
- User trade route uses exact-output.
- Public docs imply deep liquidity.
- Bonds are active.
- stNARA/SY is live before core UX is stable.
- You need the last $100-$200 of the budget for LP and have no gas/ops reserve.

## Recommended Immediate Next Steps

1. Decide Lane A or Lane B.
2. Confirm whether the $1,000 includes gas.
3. Set `.env` for fresh deployment.
4. Run one more local full gate immediately before deployment.
5. Deploy fresh core.
6. Sync fresh addresses with `npm run v4:env:sync`, then merge reviewed values with `npm run v4:env:sync:write`.
7. Run preflight.
8. Seed liquidity.
9. Run preflight and tiny smoke.
10. Deploy allocations with bonds closed.
11. Verify all contracts.
12. Run a 24-48 hour private calibration window.
13. Launch publicly as a lock/NFT calibration launch, not a trading launch.
