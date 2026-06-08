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
| Term duration | How long a bond term stays valid | MAX_TERMS_AGE = 1 day |
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
