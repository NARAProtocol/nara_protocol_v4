# NARA v4 Protocol-Owned Liquidity Compounding & Fee Curve Update Evidence

Change ID: `NARA-20260819-v4-pol-compound-and-fee-update`

Date: 2026-08-19

Network: Base (`8453`)

## Summary of Executions

On 2026-08-19, the production Safe executed two on-chain governance operations:
1. **Full Protocol Fee Compounding (`compoundAll`)**: Converted all available uncompounded Vault fees and banked surplus inventory into active Uniswap v4 Protocol-Owned Liquidity (POL).
2. **Fee Curve Reduction Activation (`executeFeeCurve`)**: Executed the matured seven-day timelocked fee curve updates, lowering the base buy tax from 5.00% to 3.00% and capping maximum buy tax at 12.00%.

---

## 1. Liquidity Compounding (`compoundAll`)

- **Execution Safe Nonce**: `43`
- **Base Block**: `50189224`
- **Target**: `NARALiquidityGrowthVault` (`0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`)
- **Method**: `compoundAll(uint256 minLiquidityAdded, uint64 deadline, bytes data)`

### Liquidity State Comparison

| Metric | Pre-Execution Snapshot | Post-Execution Verified State | Change |
| :--- | :--- | :--- | :--- |
| **POL Position NFT (`#2898486`) Liquidity** | `61,410,660,413,174` units | **`473,995,658,948,700` units** | **+7.7x (+412.58T units)** |
| **POL Share of Active Pool Liquidity** | `1.43%` | **`10.05%`** | **+8.62%** |
| **Seed LP NFT (`#2898124`) Liquidity** | `4,242,640,687,119,285` units | `4,242,640,687,119,285` units | `89.95%` of pool |
| **Total Active Uniswap v4 Pool Liquidity** | `4,304,051,347,532,459` units | **`4,716,636,346,067,985` units** | **+9.58% Total Pool Depth** |
| **Vault Uncompounded Balances** | `1,056.67 NARA` / `47.97 USDC` | **`0.00 NARA` / `0.00 USDC`** | `100% Swept` |
| **Compounder Banked Surplus Remainder** | `1,268.70 NARA` / `25.27 USDC` | **`2.00 NARA` / `0.028 USDC`** | `~99.9% Deployed` |
| **Lifetime NARA Added to POL** | `549.88 NARA` | **`2,873.25 NARA`** | `+2,323.37 NARA` |
| **Lifetime USDC Added to POL** | `6.89 USDC` | **`80.11 USDC`** | `+73.22 USDC` |

---

## 2. Fee Curve Reduction Activation (`executeFeeCurve`)

- **Execution Safe Nonce**: `44`
- **Base Block**: `50189462`
- **Target**: `NARALiquidityGrowthHook` (`0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088`)
- **Timelock Maturation Date**: `2026-08-16 08:57:13 UTC` (7-day governance timelock elapsed)
- **Methods Executed**: `executeFeeCurve(true)` and `executeFeeCurve(false)`

### Verified Active Curve Rates

| Curve Tier | Previous Active Curve | **New Active Curve (LIVE)** |
| :--- | :--- | :--- |
| **Buy Curve Base Fee** | `5.00%` (`500 BPS`) | **`3.00%` (`300 BPS`)** 📉 |
| **Buy Curve Medium Tier** | `8.00%` (`800 BPS`) | **`5.00%` (`500 BPS`)** |
| **Buy Curve High Tier** | `12.00%` (`1,200 BPS`) | **`8.00%` (`800 BPS`)** |
| **Buy Curve Extreme Tier** | `20.00%` (`2,000 BPS`) | **`12.00%` (`1,200 BPS`)** |
| **Buy Curve Max Fee Cap** | `20.00%` (`2,000 BPS`) | **`12.00%` (`1,200 BPS`)** |
| **Sell Curve Base Fee** | `5.00%` (`500 BPS`) | **`5.00%` (`500 BPS`)** |
| **Sell Curve Medium Tier** | `7.00%` (`700 BPS`) | **`8.00%` (`800 BPS`)** |
| **Sell Curve High Tier** | `10.00%` (`1,000 BPS`) | **`12.00%` (`1,200 BPS`)** |
| **Sell Curve Extreme Tier** | `15.00%` (`1,500 BPS`) | **`20.00%` (`2,000 BPS`)** |
| **Sell Curve Max Fee Cap** | `20.00%` (`2,000 BPS`) | **`20.00%` (`2,000 BPS`)** |

---

## 3. Verified Contracts & Custody Status

| Contract / Entity | Address | Status | Notes |
| :--- | :--- | :--- | :--- |
| `NARAToken` | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` | Verified | 1,000,000 NARA fixed supply |
| `NARALiquidityGrowthVault` | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` | Verified | Owned by Safe; compounder permanently frozen |
| `NARALiquidityGrowthHook` | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` | Verified | Dynamic fee curve hook (`0x2088` flags) |
| `NARALiquidityCompounderV4` | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` | Verified | Custodies POL LP NFT `#2898486` |
| `Uniswap v4 Pool ID` | `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464` | Initialized | NARA/USDC 0.30% canonical pool |
| `Production Safe` | `0xd65c0e390Dc187A22c52c03816591CC736C0D755` | Active | 2-of-3 Multisig Admin (Nonce: `44`) |
