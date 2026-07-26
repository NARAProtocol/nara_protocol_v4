# NARA v4 Opportunity Gaps

Last updated: 2026-07-26.

> **Research only — not launch scope.** The current product launch is NARA
> Baskets only. Ideas in this document do not authorize deployments,
> integrations, or core changes. See [CURRENT_STATE.md](CURRENT_STATE.md).

This document maps current v4 code against external DeFi opportunities. Code is the source of truth. Live market sizes are volatile, so this document links to current data sources instead of treating old TVL numbers as durable facts.

Canonical references:

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [V4_BUILD_PLAN_COMPOSABILITY.md](V4_BUILD_PLAN_COMPOSABILITY.md)
- [COMPOSABILITY_AUDIT_CHECKLIST.md](COMPOSABILITY_AUDIT_CHECKLIST.md)
- [V4_REDEPLOY_NO_SURPRISE_PLAN.md](V4_REDEPLOY_NO_SURPRISE_PLAN.md)

---

## Current Truth

The previous v4 opportunity framing said NARA lacked:

- A liquid ERC-20 wrapper.
- A Pendle-compatible wrapper.
- A fractional-position wrapper.

That is no longer accurate for the current repo.

Current code status:

| Opportunity | Current v4 code status | Remaining gap |
|---|---|---|
| Liquid ERC-20 wrapper | `NARAStakingPoolV4` exists and mints `stNARA`. | Not deployed on fresh v4 mainnet stack; no seeded TVL; no NARA/stNARA AMM. |
| Pendle SY adapter | `NARAStakingPoolSYV4` exists. | No deployed Pendle PT/YT market; needs fork/testnet validation and Pendle coordination. |
| Fractional single-position wrappers | `NARAFractionalPositionFactoryV4` and `NARAFractionalPositionV4` exist. | No public UI/indexer/marketplace flow documented yet. |
| Real-yield routing | Role-gated `NARAEngine.notifyTokenRewards(address,uint256)` and `NARALiquidityGrowthVault` route modes exist. | Needs fresh deployment, seeded liquidity, reward-notifier role wiring, and monitored route-mode operations. |
| **Self-sustaining POL flywheel** | Hook (harvest) + vault (5 route modes, default `Liquidity`) built and tested. **Production compounder `NARALiquidityCompounderV4` built, unit-tested + Base fork-validated (2026-06-29)** — full-range, no-swap, exact-spend, POL custody, 7-day recovery timelock. | Deploy via `scripts/deployLiquidityCompounderV4.ts`, then `vault.setCompounder` + `freezeCompounder` (Safe). Code is fork-certified against live v4; remaining work is operational deploy/wiring only. Until wired, `Liquidity` mode is still inert. |
| Gas sponsorship | No custom onchain paymaster in repo. | Optional frontend/ops integration through provider paymaster infrastructure. |
| v4 sponsor hub | No v4 sponsor hub contracts in repo. | Deferred product lane. |

---

## External Market Signals To Recheck

Do not hard-code these numbers into launch claims. Recheck them before publishing any public material.

Useful live sources:

- Pendle protocol dashboard: https://defillama.com/protocol/pendle
- DefiLlama liquid staking overview: https://defillama.com/lst
- Pendle Standardized Yield docs: https://docs.pendle.finance/pendle-v2-dev/Contracts/StandardizedYield

Latest checked source facts:

- Pendle docs describe Standardized Yield as the adapter layer that exposes deposit, redeem, exchange-rate, token-list, and reward-claim behavior for heterogeneous yield sources.
- DefiLlama tracks Pendle under the Yield category and lists protocol, yield, fee, and user-activity data.
- DefiLlama's liquid staking page is the correct live source for LST scale checks.

---

## Highest-Leverage Remaining Gaps

### 1. Deploy And Prove stNARA

Current code:

- `NARAStakingPoolV4.deposit(uint256 naraAmount, uint256 minShares)` mints `stNARA`.
- First deposit must be at least `100 NARA`.
- First deposit mints `DEAD_SHARES = 1e18` to `address(0xdead)`.
- `lockLiquid(uint25ok
6 grossAmount, uint256 minWeight)` turns idle NARA into max-duration `NARAPositionNFTV4` positions.
- `queueRedeem(uint256 shares)` burns shares and creates a redemption claim.
- `claimRedemption(uint256 id)` pays only when liquid NARA is available after the ready epoch.
- `harvest()` and `batchHarvest(uint256 start, uint256 end)` claim rewards from underlying positions.

Remaining gap:

- No fresh mainnet deployment exists.
- No initial TVL exists.
- No NARA/stNARA AMM exists.
- No lending-market collateral path exists.

Action:

1. Deploy fresh v4 core and allocations.
2. Deploy composability with `scripts/deployComposabilityV4.ts`.
3. Seed first `stNARA` deposit with at least `100 NARA`.
4. Lock idle pool NARA through `lockLiquid(uint256 grossAmount, uint256 minWeight)`.
5. Monitor `exchangeRateWad`, `liquidNara`, `lockedPrincipal`, `reservedForRedemptions`, `usdcRewardIndexRay`, and `ethRewardIndexRay`.
6. Create a NARA/stNARA AMM only after the pool behavior is verified.

### 2. Validate Pendle SY Before Outreach

Current code:

- `NARAStakingPoolSYV4` accepts NARA and stNARA deposits.
- `NARAStakingPoolSYV4` redeems only to stNARA.
- `redeem(address receiver, uint256 amountIn, address tokenOut, uint256 minTokenOut, bool burnFromInternalBalance)` rejects `burnFromInternalBalance == true`.
- `exchangeRate()` returns the stNARA exchange rate.
- `getRewardTokens()` returns USDC only.
- `accruedRewards(address user)`, `rewardIndexesCurrent()`, and `rewardIndexesStored()` exist.
- `claimRewards(address user)` pays only the requested user's accrued USDC.
- `claimNativeEth(address payable to)` is separate from Pendle `claimRewards()` so native ETH does not force transfers into Pendle receiver contracts.

Remaining gap:

- Pendle market is not deployed by this repo.
- No fork or testnet integration with Pendle contracts has been recorded.
- No external Pendle coordination has been completed.

Action:

1. Verify deployed SY constructor inputs.
2. Test `getTokensIn()` and `getTokensOut()` on the deployed SY.
3. Test NARA deposit into SY.
4. Test stNARA deposit into SY.
5. Test normal redeem to stNARA.
6. Test disabled internal-balance redeem to stNARA.
7. Test `rewardIndexesCurrent()`, `rewardIndexesStored()`, and `accruedRewards(address user)`.
8. Test `claimRewards(address user)` after pool USDC rewards exist.
9. Test `claimNativeEth(address payable to)` after pool ETH rewards exist.
10. Only then contact Pendle with deployed addresses, expected TVL, reward behavior, and audit notes.

### 3. Productize Fractional Position Wrappers

Current code:

- `NARAFractionalPositionFactoryV4.create(uint256 tokenId)` deploys one wrapper per NFT token ID.
- Caller must own or be approved for the NFT.
- `NARAFractionalPositionV4.bind(uint256 tokenId, uint256 fractions)` transfers the NFT into the wrapper.
- `fractions` must be greater than `0` and no more than `1e12`.
- `harvest()` claims rewards for the underlying NFT.
- `claimRewards(address to)` pays pro-rata NARA emission and USDC rewards.
- `unlockPosition()` harvests final rewards, then unlocks after maturity.
- `claimPrincipal(address to)` pays pro-rata principal; final claimant receives dust.
- `totalSupply()` stays equal to `fractionCount` after principal claims.

Remaining gap:

- No public fractional-position UI exists in current docs.
- No indexer spec exists for showing fractional wrappers and underlying NFT metadata.
- No marketplace guidance exists for post-unlock fractional wrappers.

Action:

1. Build frontend flow for `create(uint256 tokenId)`.
2. Require NFT owner approval before `bind(uint256 tokenId, uint256 fractions)`.
3. Display maturity, underlying `positionId`, reward status, and principal-claim status.
4. Warn integrations that `totalSupply()` does not shrink after principal claims.
5. Treat fractional wrappers as position vaults, not canonical burn-style ERC-20s.

### 4. Lending And Collateral Integrations

Current code gives NARA two potential collateral surfaces:

- `stNARA`, if seeded and liquid.
- Fractional wrapper tokens, if market depth and metadata support exist.

Remaining gap:

- No oracle design is documented for stNARA or fractional wrappers.
- No lending integration is deployed.
- No risk parameters are defined.

Action:

1. Wait until stNARA has deployed history and AMM liquidity.
2. Use `exchangeRateWad()` as one input for stNARA valuation.
3. Define withdrawal/liquidity risk because protocol redemption is queued, not instant.
4. Do not propose lending collateral before oracle, liquidity, and redemption-risk analysis exists.

### 5. Gas Sponsorship And Sponsor Hub

Current code:

- No v4 custom onchain paymaster exists.
- No `NARASponsorHubV4` exists.
- No `NARASponsorFundAdapterV4` exists.

Remaining gap:

- Gas sponsorship is an optional frontend/ops setup, not a Solidity primitive.
- Sponsor hub is a separate product lane.

Action:

1. Use provider-based paymaster infrastructure if gas sponsorship is needed.
2. Do not sponsor admin functions, bond activation, vault releases, hook ownership changes, arbitrary approvals, swaps, or `notifyEthRewards`.
3. Build v4 sponsor hub only after token/liquidity/bond/composability launch scope is stable.

---

## What NARA v4 Already Has

| Feature | Current implementation |
|---|---|
| Tradable lock positions | `NARAPositionNFTV4` plus `NARAPositionAccountV4` |
| NFT bond positions | `NARABondDepositoryV4NFT` |
| ERC-20 wrapper | `NARAStakingPoolV4` |
| Pendle-style SY adapter | `NARAStakingPoolSYV4` |
| Single-position fractional wrappers | `NARAFractionalPositionV4` and factory |
| USDC reward routing | role-gated `NARAEngine.notifyTokenRewards(address,uint256)` |
| ETH reward routing | `NARAEngine.notifyEthRewards()` |
| Liquidity growth routing | `NARALiquidityGrowthVault` route modes: `Liquidity`, `Engine`, `Split`, `Genesis`, `GenesisSplit` |
| Dynamic swap fee hook | `NARALiquidityGrowthHook` |
| JIT epoch advancement | `NARAEngine` |
| Genesis reward weights | `NARAPositionNFTV4` and `NARAGenesisRewardDistributorV4` |

---

## Current Priority Table

| Priority | Work item | Core contract change required | Status |
|---|---|---|---|
| 1 | Fresh v4 core redeploy | No | Required before any opportunity is live |
| 2 | Allocation deploy with NFT bonds | No | Required if bonds/Genesis are in launch scope |
| 3 | Deploy `NARAStakingPoolV4` and `NARAStakingPoolSYV4` | No | Implemented, not deployed |
| 4 | Validate SY reward-index behavior | No | Local tests passed; deployed/fork validation still needed |
| 5 | Seed NARA/stNARA AMM | No | Not implemented by current script |
| 6 | Pendle outreach and PT/YT market | No | External coordination required |
| 7 | Fractional-position UI and indexer | No | Not implemented |
| 8 | Lending collateral path | No | Deferred until liquidity/oracle work exists |
| 9 | v4 sponsor hub | New contracts required | Deferred product lane |
| 10 | Cross-chain wrapper | New contracts required | Deferred |

---

## Summary

The main v4 gap is no longer missing composability code. The current gap is deployment, verification, liquidity, external integration, and productization.

Immediate work:

1. Fresh v4 redeploy.
2. Allocation verification.
3. Composability deployment.
4. stNARA seed and monitoring.
5. SY validation before Pendle outreach.
6. Fractional-position frontend/indexer planning.

Do not describe stNARA, the SY adapter, or fractionalization as absent. They exist in code. Describe them as implemented locally and awaiting fresh deployment plus external validation.
