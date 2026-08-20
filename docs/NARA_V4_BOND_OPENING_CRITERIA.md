# NARA v4 Bond Opening Criteria

Last updated: 2026-05-28.  
Audience: protocol operator. This is an internal decision document.  
The bond depository deploys with `V4_BOND_ACTIVE=false` and capacity=0. Bonds open only when every criterion below is satisfied.

---

## Hard Prerequisites (No Exceptions)

```
□ Fresh v4 core is deployed and verified (smoke test passed).
□ NARA/USDC pool has at least $500 of real liquidity seeded.
□ NARA/USDC TWAP is at least 24 hours old.
□ `minOracleLiquidity` threshold in NARABondDepositoryV4NFT is set and enforced.
□ NARABondVaultV4 is funded (289,970 NARA default).
□ NARABondDepositoryV4NFT is deployed and roles are assigned to Safe.
□ NARAGenesisRewardDistributorV4 is deployed and bound to NARAPositionNFTV4.
□ Bond terms are set with at least MIN_PRICE_DELAY = 1 day before opening.
□ Bond capacity is explicitly set (non-zero) by Safe, not deployer.
□ ETH split ratio (rewardSplitWad) is confirmed: at least 50% to notifyEthRewards().
□ All admin roles have been transferred from deployer to Safe.
```

---

## Liquidity Depth Gate

Bond price is derived from NARA/USDC TWAP. Thin liquidity = manipulable price = bond buyers extract vault NARA at wrong discount.

**Minimum before opening bonds:**
- At least **$500 depth** in the NARA/USDC pool.
- TWAP interval must span at least **24 hours of real price history**.
- `engine.totalLocked > 0` — at least one real active locker exists before bonds are opened (avoids empty-weight-share edge case on first bond ETH distribution).

If the pool is too thin, bonds stay closed. A $1k liquidity launch means bonds open only after the initial liquidity has settled and the price oracle has history.

---

## Genesis Metadata Decision

Before the first bond term is activated:
```
□ roundId and tierId for the Genesis batch are decided.
□ rewardMultiplierBps is confirmed (100–50,000 bps; 10,000 = 1×, 50,000 = 5×).
□ isEternal flag decision is documented (eternal locks cannot be force-unlocked).
□ NARAGenesisRewardDistributorV4 has sufficient USDC or token balance for bonus rewards.
```

---

## Pricing Parameters

Review these before each bond term activation:

| Parameter | Description | Safe range |
|---|---|---|
| Base discount | Starting discount applied to TWAP price | 5–15% |
| Max discount | Ceiling on total discount (TWAP + base + inventory boost) | < 30% |
| Demand penalty | Reduces discount as purchases accumulate in a period | Must be active |
| Min/max bond price | Hard clamps on ETH-per-NARA | Set to prevent manipulation extremes |
| Term duration | How long a bond term stays valid | MAX_TERMS_AGE = 2 days |
| Execution delay | MIN_PRICE_DELAY before terms can be used | 1 day minimum |

---

## Vault Health Check

Before each capacity top-up:
```
□ Vault NARA balance > planned capacity.
□ Treasury float remains >= 10,030 NARA after capacity is set.
□ Ops vault vesting is on track (if ops allocation exists).
```

---

## Bond Opening Checklist (Per Term)

Run this before setting each new bond term:

```
□ Pool liquidity > $500 (check on-chain)
□ TWAP > 24h history (verify twapSecondsAgo against bond pricing call)
□ No active stale terms (MAX_TERMS_AGE expiry check)
□ Capacity is non-zero and within vault balance
□ rewardSplitWad confirmed (default: 50% to lockers)
□ Genesis metadata confirmed for this round
□ Term delay set (MIN_PRICE_DELAY = 1 day)
□ Bond purchase fee (if any) reviewed
□ Safe multisig has signed the term proposal
```

---

## Things That Keep Bonds Closed

If any of these are true, bonds must remain closed:

- Deployer still holds bond vault or depository roles.
- TWAP < 24h history.
- Pool depth < $500.
- Treasury float would drop below 10,030 NARA after capacity is activated.
- Genesis metadata is unconfirmed.
- `notifyEthRewards` split is below 50%.
- `minOracleLiquidity` is not set.
- activeTotalWeight == 0 (no live lockers).

---

## After Opening

Monitor each 24h window:
```
□ Bond purchases within expected range (no flash drain)
□ ETH split reaching engine notifyEthRewards() (verify with event logs)
□ NARA vault balance decreasing at expected rate
□ No stale-term reverts in mempool
□ Vault capacity has not been exhausted prematurely
```

If purchases are suspiciously concentrated in a single block: inspect for TWAP manipulation. If detected, close the term immediately via the Safe.

---

## Pilot Batch #1 Strategic Blueprint (Capital Formation Round 1)

Bonds function as decentralized on-chain Series fundraising rounds, swapping discounted future tokens for real ETH cash flow without market sell pressure.

### Strategic Gates for Batch #1
1. **Valuation Gate:** $NARA Spot Price $\ge \mathbf{\$1.00\text{ USD}}$. Prevents exhausting the 250k reserve at micro-cap levels.
2. **Pilot Batch Capacity:** **`20,000 NARA`** (2.0% of total supply / 8% of bond reserve).
3. **Discount Setting:** `15% – 20%` (e.g. `$0.80 – $0.85 / NARA`).
4. **Lock Structure:** Mandatory 365-day (1-Year) lock minted as **Genesis Position NFTs** at `4.00x` duration multiplier.

### Cash Flow Impact of Pilot Batch #1
* **Gross ETH Raised:** `~$16,000 – $17,000 USD in ETH`.
* **50% Direct Locker Dividend:** `~$8,000+ USD in ETH` sent to `engine.notifyEthRewards()`, generating instant real-yield cash flow to active lockers.
* **50% Treasury Growth:** `~$8,000+ USD in ETH` to protocol reserves.
* **0 AMM Sell Pressure:** 100% of tokens locked for 1 year.

---

## Macro Reserve Scale Reference (250,000 NARA Vault)

| $NARA Spot Price | Gross 250k Vault Value | Raised at 20% Discount | 50% Direct Locker ETH Yield | 50% Treasury Reserve |
| :---: | :---: | :---: | :---: | :---: |
| **$1.00** | $250,000 | $200,000 | **$100,000 in ETH** | $100,000 in ETH |
| **$5.00** | $1,250,000 | $1,000,000 | **$500,000 in ETH** | $500,000 in ETH |
| **$10.00** | $2,500,000 | $2,000,000 | **$1,000,000 in ETH** | $1,000,000 in ETH |
| **$50.00** | $12,500,000 | $10,000,000 | **$5,000,000 in ETH** | $5,000,000 in ETH |
| **$100.00** | $25,000,000 | $20,000,000 | **$10,000,000 in ETH** | $10,000,000 in ETH |

---

## The Phased AMM USDC Fee-Sharing Switch (Bond NFT Superpower)

Inside `NARALiquidityGrowthVault.sol`, dynamic routing allows protocol governance to switch Uniswap v4 AMM trading fees to Genesis Bond NFT holders:

```
[Phase 1: Liquidity Launch] ──► [Phase 2: Bond Sale] ──► [Phase 3: Activate USDC Cash Flow]
     RouteMode.Liquidity           Mint Genesis NFTs          Safe calls vault.setRouteMode(
 (100% Fees -> POL Depth)       (Reward Weight Stamped)          RouteMode.GenesisSplit)
```

### Key Operating Invariants
1. **Decoupled Deployment:** Bonds can be issued while the Vault is compounding 100% into POL (`RouteMode.Liquidity`). Genesis reward weights are permanently recorded at mint time.
2. **The Safe Switch:** When trading volume on Uniswap v4 grows, the Safe multisig executes `vault.setRouteMode(RouteMode.GenesisSplit)` with e.g. `splitGenesisShareBps = 5000` (50% split).
3. **Direct USDC Dividend Streams:** From that block forward, 50% of all USDC buy swap fees are delivered directly to `NARAGenesisRewardDistributorV4`, allowing Genesis Bond NFT holders to claim continuous real USDC cash flow directly from Uniswap trading volume!
