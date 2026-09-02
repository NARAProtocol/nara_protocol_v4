# NARA v4 Autonomous Range Ranger & Security Testing Harness

Evidence state: **DEPLOYED / ACTIVATED / TESTED & PROVED ON BASE MAINNET**

---

## 1. Executive Summary & Purpose

The **Autonomous Range Ranger** and **Single-Wallet Burst Buyer** were developed and deployed on Base mainnet to provide continuous, institutional-grade automated liquidity management and stress-testing for the NARA Uniswap v4 ecosystem.

### 🛡️ Critical Purpose & Non-Manipulation Policy
The Multi-Block Burst Buyer (`scripts/runSingleWalletBurstBuys.ts`) and the 21-case Adversarial Matrix are **security, parameter verification, and liquidity-defense testing harnesses**. 

They are strictly designed to:
1. **Stress-test the Uniswap v4 Dynamic Fee Hook (`NARALiquidityGrowthHook.sol`):** Verify that Block-0 cumulative swap pressure scales accurately from 3% up to 20% across sequential blocks without arithmetic overflow or rounding truncation.
2. **Prove MEV & Arbitrage Interception:** Validate that external MEV searchers and flash-arbitrageurs cannot extract unearned value from the protocol, capturing 100% of their arbitrage taxes directly into Protocol-Owned Liquidity (`NARALiquidityGrowthVault.sol`).
3. **Calibrate Autonomous Liquidity Defense:** Simulate real-world retail and sniper demand waves ($1.00 micro-buys packed 15 per block) to test how the Range Manager autonomously elevates support floors, preventing liquidity traps and protecting holder value.

**They are explicitly NOT intended for market manipulation, wash trading, artificial volume inflation, or price-fixing.**

---

## 2. Technical Architecture & Invariants

```
                             [Uniswap v4 Pool (0x83edce...)]
                                           │
                       Live Spot Price & Volatility Breach
                                           │
                         ┌─────────────────┴─────────────────┐
                         │                                   │
             [nara-protocol-hardhat]               [nara-swarm-monitor]
           Local CLI Engine / Watcher             Railway Cloud Daemon (24/7)
           autoRangeManager.ts                   rangeRangerWatcher.mjs
           rangeRangerEventEngine.ts             rangeRangerRuntime.mjs
                         │                                   │
                         └─────────────────┬─────────────────┘
                                           │
                       Synthesize 4 Buy & 4 Sell Brackets
                                           │
                     EIP-712 SafeTx Typed Data Signing (Viem / Ethers)
                                           │
                  Gnosis Safe 1.4.1 execTransaction (Gas: 7,500,000)
                                           │
                       MultiSendCallOnly (0x40A2aCCb...130D)
                         ├── Cancel & Settle Stale Orders
                         ├── ERC-20 Allowances
                         ├── Deploy Fresh Buy & Sell Bands
                         ├── Revoke Allowances to 0
                         └── assertOperationalClean() Invariant
```

### Key Architectural Invariants
1. **Gnosis Safe 1.4.1 Custody Isolation:**  
   Order inventory and token custody reside exclusively in the **Treasury Range Safe (`0x5050BC6dc3E07313D52D05cecD53f727D6CDa245`)**. The bot holds zero custody.
2. **Atomic MultiSend Execution:**  
   All 18 operations execute atomically inside 1 single EVM transaction. Either 100% of the rebalance succeeds, or 0% happens. No intermediate order book gaps exist.
3. **`assertOperationalClean()` Invariant:**  
   Every batch concludes by asserting that zero loose tokens remain in `NARATreasuryRangeManagerV1`.
4. **Gas Ceiling:**  
   Multi-band cancellation and minting consumes ~3.8M - 4.2M gas. The execution ceiling is set to **`7,500,000`** gas.
5. **Anti-Flash-Loan Guard:**  
   A 2,500-tick instant shift ceiling prevents the engine from rebalancing against single-block flash loan spikes without multi-block confirmation.

---

## 3. Empirical Live Mainnet Evidence

On **2026-09-02**, the entire pipeline was proven on Base mainnet across two live rebalance cycles and an active burst test:

### Cycle 1: Safe MultiSend Execution & Gas Limit Proof
- **Transaction:** [`0xe5382c9a83d171a9c9707ef49e5ac4cc1cb9e35d5e07dc6d5b4efe359dcf5917`](https://basescan.org/tx/0xe5382c9a83d171a9c9707ef49e5ac4cc1cb9e35d5e07dc6d5b4efe359dcf5917)
- **Block:** `#50792858` | **Gas Used:** `4,125,336`
- **Result:** Successfully cancelled 5 stale orders (#21-#24, #28) and deployed 8 fresh bands centered at spot `$0.0727 USDC`.

### Security Testing Wave: Multi-Block Micro-Burst Test
- **Tool:** `scripts/runSingleWalletBurstBuys.ts`
- **Execution:** 44 block waves (660 swaps @ $1.00 each) deploying $660.00 USDC from Treasury.
- **Result:** Accumulated **+7,416.48 NARA** into Treasury wallet, collected input fees into Hook Vault, and elevated spot price by **+32.5%** (from `$0.0727` to `$0.0964 USDC`).

### Cycle 2: Autonomous Liquidity Gap Rebalance
- **Transaction:** [`0x73a0a92dc351668994bf3ec9c7ec0774ae8f789c89320ebb96dfd89f64f95e0b`](https://basescan.org/tx/0x73a0a92dc351668994bf3ec9c7ec0774ae8f789c89320ebb96dfd89f64f95e0b)
- **Block:** `#50794578` | **Gas Used:** `3,878,810`
- **Trigger:** Detected 28.0% liquidity gap following the upward volume wave.
- **Result:** Autonomously cancelled stale orders, deployed **4 new Buy support floors ($0.0678 - $0.0920)** to lock in the new price level, and extended the Sell profit-taking ladder up to **`$0.2710`**.

---

## 4. Operational Commands & Repository Locations

| Command | Script Path | Action |
| :--- | :--- | :--- |
| **`RANGERECENTER`** | `nara-protocol-hardhat/scripts/autoRangeManager.ts --execute` | Atomically recenters 4 buy & 4 sell bands around spot |
| **`BURSTBUY <amount>`** | `nara-protocol-hardhat/scripts/runSingleWalletBurstBuys.ts --execute --target-spend <amount>` | Executes multi-block $1.00 micro-buys |
| **`RANGESTATUS`** | Live node query on `NARATreasuryRangeManagerV1` | Inspects active orders, tick displacement, and Safe cash |
| **Railway Cloud Watcher** | `nara-swarm-monitor/scripts/rangeRangerWatcher.mjs` | Runs 24/7 background auto-rebalancer on Railway |
| **Viem Runtime Engine** | `nara-swarm-monitor/scripts/rangeRangerRuntime.mjs` | Provides bracket synthesis and Safe 1.4.1 signing |