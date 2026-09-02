# NARA v4 Live Mainnet Evidence: Cross-Pool MEV Arbitrage & Hook Fee Capture

**Date:** 2026-09-02  
**Status:** PROVEN ON-CHAIN (Base Mainnet)  
**Network:** Base (Chain ID `8453`)  
**Canonical Hook:** `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088`  
**Liquidity Vault:** `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`  
**Canonical Pool ID:** `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`  

---

## Executive Summary

On September 2, 2026, following a sequence of volume injections that propelled NARA spot price from **$0.0053 to over $0.072 USDC**, two separate on-chain transactions executed by independent MEV searchers demonstrated the **live enforcement and fee capture of the NARA Uniswap v4 Dynamic Hook**.

Third-party observers noted sell orders appearing on DEXScreener from wallets with zero prior NARA purchase history. On-chain forensic analysis confirms that these transactions were **atomic 2-hop flash-arbitrage cycles**. The searchers did not hold NARA before the block and held zero NARA after it. 

In both instances, the arbitrageurs bought NARA on an un-hooked secondary pool and dumped it into NARA's canonical pool. In both instances, **the NARA Hook successfully intercepted the dump, taxed the searcher 500 BPS (5.00%), and banked the full fee proceeds into `NARALiquidityGrowthVault`**.

---

## The Mechanical Invariant

When external or un-hooked liquidity pools appear:
1. Arbitrage bots monitor price discrepancies between the un-hooked pool and NARA's canonical pool.
2. If spot price on the canonical pool is higher, searchers attempt to buy on the cheap pool and sell into the canonical pool.
3. **The Hook Defense:** The canonical pool enforces dynamic fees (`feeAmount = amountIn * feeBps / 10000`).
4. Even if the searcher captures a micro-spread (e.g., ~$0.01 profit), **the protocol extracts 5.00% of the entire gross trade size in NARA**, building Protocol-Owned Liquidity (POL) at zero protocol expense.

```
                          ┌───────────────────────────────────────┐
                          │     MEV Searcher Contract             │
                          │   0x8Db9c0649d48ab9e1b723844B6d30F392241FE63  │
                          └───────────────────┬───────────────────┘
                                              │
           ┌──────────────────────────────────┴──────────────────────────────────┐
           │                                                                     │
     [HOP 1: BUY CHEAP]                                                    [HOP 2: SELL HIGH]
   Secondary Un-Hooked Pool                                              Canonical NARA Pool
   • Pool ID: 0x302a1a... (3.5% Fee, No Hook)                            • Pool ID: 0x83edce... (0.3% LP + Dynamic Hook)
   • Bot Input:  1.000000 USDC                                           • Bot Input:  NARA from Hop 1
   • Bot Output: NARA                                                    • Hook Tax:   5.00% (500 BPS)
                                                                           ──> Routed to NARALiquidityGrowthVault 🏦
                                                                         • Bot Output: USDC (> $1.00)
           │                                                                     │
           └──────────────────────────────────┬──────────────────────────────────┘
                                              │
                                              ▼
                                    [SEARCHER NET ARB]
                              • Initial USDC: 1.000000 USDC
                              • Returned USDC: > 1.000000 USDC
                              • Net NARA Held: 0.000000 NARA
```

---

## Verified Transaction Evidence

### Evidence Case 1: Transaction `0x86a1bcf5...`

- **Transaction Hash:** [`0x86a1bcf50510960fd5d7b6ad5e72fd4efdf747e5a444ea9f86c441e3e6f608c3`](https://basescan.org/tx/0x86a1bcf50510960fd5d7b6ad5e72fd4efdf747e5a444ea9f86c441e3e6f608c3)
- **Block:** `50791502`
- **Searcher EOA:** `0x61d804deE9E3b45DF89E476A857332cb0C9B1d47`
- **Bot Contract:** `0x8Db9c0649d48ab9e1b723844B6d30F392241FE63`

#### Execution Breakdown:
1. **Hop 1 (Buy Leg):**
   - Swapped **`1.000000 USDC`** on Pool `0x302a1a60813297cca3594223415dd6ea38a941605b8accf0fb0346a29860fe8c` (Un-hooked, 3.5% fee).
   - Acquired **`18.239137 NARA`** (~$0.0548 effective price).
2. **Hop 2 (Sell Leg):**
   - In the exact same atomic transaction, sold **`18.239137 NARA`** into Canonical Pool `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.
   - **Hook Event `PoolFeeTaken`:** Intercepted **`0.911957 NARA`** (500 BPS / 5.00%).
   - **Vault Event `PoolFeeRecorded`:** Credited **`0.911957 NARA`** to `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`.
   - Remaining `17.327180 NARA` filled for **`1.009736 USDC`**.
3. **Outcomes:**
   - **Searcher Profit:** `+$0.009736 USDC` (~$0.01).
   - **Protocol Vault Gain:** `+0.911957 NARA`.

---

### Evidence Case 2: Transaction `0x93612748...`

- **Transaction Hash:** [`0x93612748f69a09d056c5021ba80f35dcbdc4525c5125a21a405904e294a9b394`](https://basescan.org/tx/0x93612748f69a09d056c5021ba80f35dcbdc4525c5125a21a405904e294a9b394)
- **Block:** `50791597` (95 blocks later)
- **Searcher EOA:** `0x957FD50c6bbF6E8679bEC8b549Af04aDA7d986e7`
- **Bot Contract:** `0x8Db9c0649d48ab9e1b723844B6d30F392241FE63`

#### Execution Breakdown:
1. **Hop 1 (Buy Leg):**
   - Swapped **`1.000000 USDC`** on Pool `0x302a1a60813297cca3594223415dd6ea38a941605b8accf0fb0346a29860fe8c`.
   - Acquired **`14.710743 NARA`** (~$0.0679 effective price).
2. **Hop 2 (Sell Leg):**
   - Sold **`14.710743 NARA`** into Canonical Pool `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.
   - **Hook Event `PoolFeeTaken`:** Intercepted **`0.735537 NARA`** (500 BPS / 5.00%).
   - **Vault Event `PoolFeeRecorded`:** Credited **`0.735537 NARA`** to `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`.
   - Remaining `13.975206 NARA` filled for **`1.012448 USDC`**.
3. **Outcomes:**
   - **Searcher Profit:** `+$0.012448 USDC` (~$0.012).
   - **Protocol Vault Gain:** `+0.735537 NARA`.

---

## Cumulative Protocol Impact

| Metric | Case 1 (`0x86a1...`) | Case 2 (`0x9361...`) | Combined Total |
| :--- | :--- | :--- | :--- |
| **Searcher Flash Volume** | $1.00 USDC | $1.00 USDC | **$2.00 USDC** |
| **NARA Sold Into Canonical Pool** | 18.239137 NARA | 14.710743 NARA | **32.949880 NARA** |
| **Dynamic Hook Fee Rate** | 500 BPS (5.00%) | 500 BPS (5.00%) | **500 BPS** |
| **Vault POL Accrual** | **+0.911957 NARA** | **+0.735537 NARA** | **+1.647494 NARA** |
| **Searcher Net Profit** | +$0.009736 USDC | +$0.012448 USDC | **+$0.022184 USDC** |

---

## Architectural Confirmation

1. **Anti-Leakage Security Proved:**
   Third-party bots cannot extract value from NARA price movement on Uniswap v4 without passing through `NARALiquidityGrowthHook.beforeSwap()`.
2. **Deterministic Tax Routing:**
   `feeAmount` was calculated dynamically and routed directly to `NARALiquidityGrowthVault` within the same transaction execution frame.
3. **Zero Phantom Inventory:**
   Neither bot held NARA before the block or retained NARA after the block. The visible "sell" on indexers (DEXScreener) is an artifact of monitoring only the canonical pool leg of a multi-pool atomic flash arbitrage.