# NARA v4 Protocol Vault Fee Compounding Evidence

Change ID: `NARA-20260911-v4-vault-fees-compounding`

Date: 2026-09-11

Network: Base Mainnet (`8453`)

## Summary of Execution

On 2026-09-11, the 2-of-3 Production Safe executed an on-chain protocol fee compounding transaction:
- **Operation**: Full Protocol Fee Compounding (`compoundAll`)
- **Execution Tx Hash**: [`0xfb23c0ee4db133eec8b0c0521abd1604d4f89b33ee6b3015bf6d44acd91c5663`](https://basescan.org/tx/0xfb23c0ee4db133eec8b0c0521abd1604d4f89b33ee6b3015bf6d44acd91c5663)
- **Base Block**: `51182779`
- **Execution Caller**: Production Safe (`0xd65c0e390Dc187A22c52c03816591CC736C0D755`)
- **Target**: `NARALiquidityGrowthVault` (`0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`)
- **Bound Compounder**: `NARALiquidityCompounderV4` (`0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF`)
- **Method**: `compoundAll(uint256 minLiquidityAdded, uint64 deadline, bytes data)`

---

## 1. Liquidity State Comparison

| Metric | Pre-Execution Snapshot | Post-Execution Verified State | Net Change |
| :--- | :--- | :--- | :--- |
| **POL Position NFT (`#2898486`) Liquidity** | `4,386,316,227,994,171` units | **`7,105,185,825,255,508` units** | **+2,718,869,597,254,337 units (+62%)** 🚀 |
| **Vault Uncompounded Balances** | `24,302.96 NARA` / `919.43 USDC` | **`0.00 NARA` / `0.00 USDC`** | **100% Swept** 🧹 |
| **Compounder Banked Surplus Remainder** | `28.42 NARA` / `2.32 USDC` | **`16,617.12 NARA` / `11.22 USDC`** | Banked for future compounds |
| **NARA Added to POL** | — | **`~8,019.71 NARA`** | Added to permanent full-range POL |
| **USDC Added to POL** | — | **`~921.76 USDC`** | Added to permanent full-range POL |
| **Safe Nonce** | `47` | **`50`** | Executed and confirmed |

---

## 2. Verified Invariants & Parameters

- **Slippage Protection**: Enforced with `minLiquidityAdded = 2691680901281793` (1.0% maximum slippage).
- **Price Bounds Guard**: 200 bps (`sqrtGuardBps = 200`) ensuring execution within ~4% of reference spot price.
- **Reference Value Imbalance**: 250 bps (`maxReferenceValueImbalanceBps = 250`).
- **Deadline**: 24-hour window from creation block.

---

## 3. Tooling & Automation

- Script: [`scripts/buildV4CompoundFeesBatch.ts`](../scripts/buildV4CompoundFeesBatch.ts)
- Runbook: [`docs/NARA_V4_VAULT_COMPOUND_RUNBOOK.md`](NARA_V4_VAULT_COMPOUND_RUNBOOK.md)
- Universal AI Trigger: `COMPOUNDSAFE` (or `VAULTCOMPOUND`) added to `AGENTS.md` and `CLAUDE.md`.
