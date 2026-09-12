# NARA v4 Protocol Vault Compounding Runbook

This runbook documents the deterministic, fast-path operational procedure for deploying and compounding all accumulated protocol fees from [`NARALiquidityGrowthVault`](../contracts/v4/NARALiquidityGrowthVault.sol) into permanent Uniswap v4 Protocol-Owned Liquidity (POL).

---

## ⚡ 1. One-Word Trigger & Quick Command

When the operator requests to deploy funds from the vault or types **`COMPOUNDSAFE`** (or **`VAULTCOMPOUND`**):

Run directly in `nara-protocol-hardhat/`:
```bash
node --import tsx scripts/buildV4CompoundFeesBatch.ts
```

This runs a read-only script that:
1. Validates all on-chain bindings and verifies the compounder is frozen.
2. Reads uncompounded fee balances from the Vault and banked surplus from the Compounder.
3. Fetches live pool `sqrtPriceX96` from Base mainnet.
4. Computes safety constraints (200 bps sqrt-price guard, 250 bps value-imbalance guard).
5. Simulates `compoundAll()` via `staticCall` with the Production Safe as `msg.sender`.
6. Enforces a 1.0% slippage guard (`minLiquidityAdded = 99% * simulatedLiquidity`).
7. Verifies that `compoundAll(minLiquidityAdded, deadline, constraints)` succeeds without reverting.
8. Writes the verified Safe Transaction Builder JSON to:
   `nara-protocol-hardhat/deployments/v4-compound-fees-safe-batch.json`

Execution takes **under 4 seconds**.

---

## 🏛️ 2. Core Architecture & Contracts

| Contract / Entity | Address on Base Mainnet | Role / Permissions |
| :--- | :--- | :--- |
| **Production Safe** | `0xd65c0e390Dc187A22c52c03816591CC736C0D755` | 2-of-3 Multisig Admin; owner of Vault and Compounder |
| **`NARALiquidityGrowthVault`** | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` | Collects Uniswap v4 hook swap fees; routes into POL |
| **`NARALiquidityCompounderV4`** | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` | Custodies POL NFT `#2898486`; executes `PositionManager.modifyLiquidities` |
| **POL Position NFT** | Token ID `#2898486` | Permanent full-range LP (`tickLower = -887220`, `tickUpper = 887220`) |
| **Uniswap v4 Canonical Pool** | `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464` | NARA/USDC 0.30% fee pool with dynamic hook flags (`0x2088`) |

---

## ⚙️ 3. How `compoundAll` Deploys Funds

1. **Vault Drainage**: `compoundAll()` transfers `100%` of the Vault's NARA and USDC into the Compounder contract. The Vault balances return to `0.00 NARA` and `0.00 USDC`.
2. **Balanced Liquidity Addition**: The Compounder combines the newly drained fees with previously banked surplus inventory. At the live pool `sqrtPriceX96`, it computes the balanced amounts of NARA and USDC required for the full-range position and adds that liquidity to NFT `#2898486`.
3. **Surplus Bank Banking**: Any one-sided remainder (typically NARA when buy volume dominates) stays safely stored inside the Compounder contract. It is never lost or stranded; it rolls forward to immediately match subsequent USDC buy fees.

---

## 🛡️ 4. Mathematical Guardrails & Parameters

The Compounder contract enforces strict invariants inside `_validateConstraints`:

1. **`sqrtGuardBps` (Target: 200 bps / 2.0%)**:
   - The contract defines `MAX_SQRT_PRICE_DEVIATION_BPS = 250`.
   - **Crucial Rule:** Due to integer division with `Math.Rounding.Ceil`, passing `250` in the script yields an effective calculated deviation of `251`, which causes `_validateConstraints` to revert with `InvalidCompoundConstraints()`.
   - Always set `sqrtGuardBps <= 240` (200 bps recommended, providing ~4% spot price tolerance).
2. **`maxReferenceValueImbalanceBps` (Target: 250 bps / 2.5%)**:
   - The contract allows up to `500` (5.0%).
   - Full-range liquidity across `[-887220, 887220]` naturally exhibits ~133 bps of value difference between the two token legs at current spot. Setting a 100 bps guard will revert with `ReferenceValueLossExceeded`. Setting `250 bps` allows clean execution while strictly bounding value divergence.
3. **`minLiquidityAdded` (1.0% Slippage Buffer)**:
   - Calculated as `(simulatedLiquidity * 9900) / 10000`.
   - Protects against frontrunning or pool trades occurring between transaction creation and execution.
4. **`deadline` (24 Hours)**:
   - Set to `block.timestamp + 86400` so 2-of-3 multisig signers have ample time to review and sign without deadline expiration.

---

## 🚀 5. Safe Execution Steps

1. Run the script:
   ```bash
   node --import tsx scripts/buildV4CompoundFeesBatch.ts
   ```
2. Open the Safe Web UI:
   `https://app.safe.global/home?safe=base:0xd65c0e390Dc187A22c52c03816591CC736C0D755`
3. Navigate to **Apps** ➔ **Transaction Builder**.
4. Upload `deployments/v4-compound-fees-safe-batch.json` (or paste the contents).
5. Verify the decoded transaction fields:
   - **Target**: `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` (`NARALiquidityGrowthVault`)
   - **Function**: `compoundAll(uint256 minLiquidityAdded, uint64 deadline, bytes data)`
6. Sign with 2 of the 3 owner keys and execute on Base.

---

## 📝 6. Troubleshooting & Diagnostics for Future AI Agents

If an agent needs to diagnose or rerun this operation:

- **Do NOT use `npx tsx -e "..."` in Windows PowerShell**: PowerShell handles multi-line string quotation and child process stdio poorly, causing silent background hangs. Always execute standard files via `node --import tsx <script.ts>`.
- **Ethers v6 RPC Batching**: Base public RPC endpoints reject batches with more than 10 calls (`-32014: maximum 10 calls in 1 batch`). Always instantiate providers with:
  ```ts
  new ethers.JsonRpcProvider(rpcUrl, 8453, { staticNetwork: true, batchMaxCount: 1 });
  ```
- **Error Selectors Reference**:
  - `0xd72797aa`: `InvalidCompoundConstraints()` (check `upperDeviation > 250 bps`).
  - `0xef5760b0`: `ReferenceValueLossExceeded(uint256,uint256)` (check `maxReferenceValueImbalanceBps < 133 bps`).
  - `0x8199f5f3`: `SlippageExceeded()` (check `minLiquidityAdded`).
  - `0x1ab7da6b`: `DeadlineExpired()`.
