# NARA v4 Treasury Range Manager Canary Activation

Evidence state: **DEPLOYED / FUNDED / ACTIVE ON BASE MAINNET / SETTLER READY**

- Change ID: `NARA-20260831-v4-treasury-range-500-usdc-canary`
- Repository HEAD: `a776d97843bed8f728ff2e51593c7eeb2a9998d9`
- Manager Deployed Address: `0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C`
- Manager Deployment Tx: `0xa657e0be76f040195fddb791e030b2fa0275f6ed989e2c17e2d1256bb95cb869`
- Manager Deployment Block: `50736510`
- Order Creation Tx: `0xff1c88baab9b5e4f3f6b1950b5de3c87f19336f7be494555c306535875271823`
- Order Creation Block: `50738288`
- Executing Custody Safe: `0x5050BC6dc3E07313D52D05cecD53f727D6CDa245` (1/1 threshold)
- Deployment Executor Safe: `0xd65c0e390Dc187A22c52c03816591CC736C0D755` (2/3 threshold)

---

## 1. Onchain Verified Active Orders

| Order ID | Side | Position NFT ID | Tick Range | Input Amount | Min Output | Status |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | `SELL_NARA` | `2994935` | `[297540, 300360]` | 6,666.67 NARA | 693.94 USDC | `ACTIVE` |
| 2 | `SELL_NARA` | `2994936` | `[294660, 297480]` | 8,888.89 NARA | 1,234.05 USDC | `ACTIVE` |
| 3 | `SELL_NARA` | `2994937` | `[291480, 294600]` | 11,111.11 NARA | 2,088.47 USDC | `ACTIVE` |
| 4 | `SELL_NARA` | `2994938` | `[288420, 291420]` | 13,333.33 NARA | 3,423.75 USDC | `ACTIVE` |
| 5 | `SELL_NARA` | `2994939` | `[285000, 288360]` | 15,555.56 NARA | 5,522.73 USDC | `ACTIVE` |
| 6 | `SELL_NARA` | `2994940` | `[281460, 284940]` | 15,555.56 NARA | 7,821.33 USDC | `ACTIVE` |
| 7 | `SELL_NARA` | `2994941` | `[277380, 281400]` | 15,555.56 NARA | 11,448.24 USDC | `ACTIVE` |
| 8 | `SELL_NARA` | `2994942` | `[273720, 277320]` | 13,333.33 NARA | 14,449.59 USDC | `ACTIVE` |
| 9 | `BUY_NARA` | `2994943` | `[309180, 309960]` | 40.00 USDC | 1,111.33 NARA | `ACTIVE` |
| 10 | `BUY_NARA` | `2994944` | `[310020, 312240]` | 50.00 USDC | 1,623.67 NARA | `ACTIVE` |
| 11 | `BUY_NARA` | `2994945` | `[312300, 315120]` | 50.00 USDC | 2,101.56 NARA | `ACTIVE` |
| 12 | `BUY_NARA` | `2994946` | `[315180, 319140]` | 60.00 USDC | 3,560.79 NARA | `ACTIVE` |

---

## 2. Dedicated Safe Custody Status

- **Protected Unallocated Reserve:** `10,000.0 NARA` + `301.0 USDC`
- **Active Allowances:** `0 NARA` and `0 USDC` (zero reset post-batch)
- **Settlement Destination:** All terminal settlement proceeds route directly to `0x5050BC6dc3E07313D52D05cecD53f727D6CDa245`.

---

## 3. Settler Execution

Settler operations are gas-only and permissionless. Any account or automated keeper can call:
- `settle(orderId)`: settles one crossed terminal order.
- `settleMany(orderIds)`: batch settles multiple crossed terminal orders.

A local CLI sweep monitor is available via:
```powershell
npx tsx scripts/sweepV4TreasuryRangeSettler.ts
```
