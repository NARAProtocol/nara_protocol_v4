# NARA Protocol — Investor & Community Q&A Reference (V5 Canonical Objections & Defenses)

> **Authoritative Q&A and Objection-Handling Manual (V5 Launch Configuration — Equal-Footing Launch Mode)**  
> **Target Audience:** Investors, Community Members, Moderators, and AI Agents.  
> **Guiding Principle:** Total technical transparency, mathematical honesty, and zero promotional hyperbole.

---

## Quick Navigation

1. [AMM Mechanics & Zero-Delay Uniswap v4 Hook Fee Routing](#1-amm-mechanics--zero-delay-uniswap-v4-hook-fee-routing)
2. [Anti-Sniper Protection & Supply Custody (`99.9984%` Sealed)](#2-anti-sniper-protection--supply-custody-999984-sealed)
3. [Liquidity, Rug-Pull Resistance & Two-Way Range Manager](#3-liquidity-rug-pull-resistance--two-way-range-manager)
4. [Token Supply, Macroeconomics & Dilution Fears](#4-token-supply-macroeconomics--dilution-fears)
5. [Committing NARA, CryptoSLIP Companion & `5%` Secondary NFT Market](#5-committing-nara-cryptoslip-companion--5-secondary-nft-market)
6. [Multisig Custody, Governance Safeguards & Security Audits](#6-multisig-custody-governance-safeguards--security-audits)
7. [Community Battlecards (5-Second Rapid FUD Dismantlers)](#7-community-battlecards-5-second-rapid-fud-dismantlers)

---

## 1. AMM Mechanics & Zero-Delay Uniswap v4 Hook Fee Routing

### Q1.1: Is NARA a "tax token"? Why are the Uniswap v4 pool swap fees ~`4.92%`?
**The Short Answer:**  
No. `NARATokenV5` (`0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f`) has **zero transfer taxes (`0%`)** at the ERC-20 token contract layer. Wallet-to-wallet transfers, CryptoSLIP off-DEX slip sends, and peer-to-peer transfers are 100% fee-free.

**The Technical Reality:**  
Fee dynamics exist exclusively inside the **Uniswap v4 `USDC/NARA` pool** via `NARALiquidityHookV5` (`0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC`):
- **Base Swap Fee (Both Ways):** `4.63%` (`463 bps`) Hook fee + `0.30%` (`3000 pips`) Uniswap v4 LP fee = **`4.9161%` total each way** at the base tier.
- **Same-Block Volume Tiers:** If large trading volume aggregates within the same 2-second Base block, fees step up progressively (`5% / 8% / 12% / 20%` on buys and `5% / 7% / 10% / 15%` up to `20%` max on sells) to deter single-block sandwiching and sniper sweeps.
- **Block Reset:** As soon as the next block arrives, the fee resets to the base tier.

---

### Q1.2: Can the team suddenly increase fees to 100% and honeypot the pool?
**The Short Answer:**  
No. The smart contracts make a 100% fee mathematically and architecturally impossible.

**The Technical Reality:**  
1. **Hardcoded Bytecode Ceiling:** `NARALiquidityHookV5` enforces an immutable maximum fee ceiling of **`20.00%` (`2,000 bps`)**. Any attempt to set a tier above `20%` reverts on-chain.
2. **7-Day Governance Delay:** Any update to Hook fee parameters or automatic holder fee splits is governed by a mandatory **7-day delay**, giving all participants 168 hours of public on-chain visibility before any parameter change can take effect.

---

### Q1.3: Where do swap fees actually go?
**The Short Answer:**  
100% of Hook swap fees (`USDC` on buys, `NARA` on sells) flow into the verified **`NARAFeeVaultV5`** (`0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf`), which is sealed directly to the zero-delay **`NARATreasuryFeeControllerV5`** (`0xB6A436b48222C94fe427ecAfB263DF9cf42646b9`) and **`NARAFeeIngressBindingV5`** (`0x17cc74317AD75a170887F9E76e5fF09f2058d4BF` → `NARARewardIngressV5`).

**The Technical Reality:**  
1. **Zero-Delay Controller Routing (`NARATreasuryFeeControllerV5` — `0-Second Delay` & Zero Permanent Tie-Up):** Unlike legacy POL architectures (`NARAPOLPositionV5`) that permanently trap swap fees inside a one-way LP position, `NARAFeeVaultV5` is bound directly to `NARATreasuryFeeControllerV5` (`0xB6A436b48222C94fe427ecAfB263DF9cf42646b9`). With `holderFeeBps = 0` at launch, 100% of `USDC` and `NARA` Hook fees accrue to the controller bucket (`polClaims` / `polRaw`), allowing the `2-of-3` `Treasury Safe` (`0xe320C281c86079eA85f2Bc67864E873A61D551E3`) to redeem (`sweepToSafe()`, `withdrawAllTo(recipient)`, `withdrawTo(asset, amount, recipient)`) and route 100% or any custom split (`50/50`, `100%`, etc.) of `USDC` and `NARA` swap fees with **`0-second delay`**:
   - To the **Treasury Safe** or **`NARATreasuryRangeManagerV5`** (`0x221c625d2BC416460C397035C1286C1f4A4D3A7C`) to deepen active two-way liquidity,
   - Directly into **`NARARewardIngressV5`** (`0x44130CC47b886D8488041F5eaE271477D1aFA909`) → **`NARARewardLedgerV5`** (`0xC72671D9438388638547444524F6542b650C9264`) for 15-minute epoch rewards, or
   - Into **`NARAEmissionReserveV5`** (`0xf932178F24b0813C82093985F0Af6Db27Ae25930`).
2. **Configurable Direct Holder Split (`NARAFeeIngressBindingV5` → `NARARewardIngressV5`):** `NARAFeeVaultV5` also supports a direct on-chain `holderFeeBps` split (`0%` to `100%`, governed by a 7-day notice) that automatically forwards that percentage via `NARAFeeIngressBindingV5` (`0x17cc74317AD75a170887F9E76e5fF09f2058d4BF`) into `NARARewardIngressV5` → `NARARewardLedgerV5` for 15-minute epoch distributions.

---

## 2. Anti-Sniper Protection & Supply Custody (`99.9984%` Sealed)

### Q2.1: How do we know no whale or insider can dump on the pool?
**The Short Answer:**  
Check the BaseScan Token Holders tab. **`99.9984%` (`999,984 NARA`)** of the entire `1,000,000 NARA` fixed supply is held inside verified smart contracts on Base Mainnet.

**The Technical Reality (Verified On-Chain Supply Breakdown):**

| Allocation / Holder | NARA Amount | % of Supply | On-Chain Contract / Custodian | Can It Dump on the Market? |
| :--- | :---: | :---: | :--- | :---: |
| **Emission Reserve** | `949,987.0 NARA` | `94.9987%` | [`NARAEmissionReserveV5`](https://basescan.org/address/0xf932178F24b0813C82093985F0Af6Db27Ae25930) | **NO.** Sealed (`coreBound = true`). Releases strictly via 15-minute epoch pulses to active positions. |
| **Two-Way Range Manager** | `49,997.0 NARA` | `4.9997%` | [`NARATreasuryRangeManagerV5`](https://basescan.org/address/0x221c625d2BC416460C397035C1286C1f4A4D3A7C) (`51.0149 NARA` active + `49,997 NARA` migrating from [`0xa72557...`](https://basescan.org/address/0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288)) | **NO.** Supplies two-way range liquidity (`NARA -> USDC` sell rungs & `USDC -> NARA` buy-back rungs); raw `NARA` withdrawals require a `7-day` delay (extendable to `1 year`). |
| **Initial Seed LP** | `3.0 NARA` | `0.0003%` | [`Treasury Safe (2-of-3)`](https://basescan.org/address/0xe320C281c86079eA85f2Bc67864E873A61D551E3) | Paired with `300 USDC` at `100 USDC / NARA` to seed the Uniswap v4 pool. |
| **Live E2E Verification** | `13.0 NARA` | `0.0013%` | `NARAPrincipalLedgerV5` & E2E verification wallets | **NO.** Zero VC, presale, or whale bags exist. |
| **Total Fixed Supply** | **`1,000,000.0 NARA`** | **`100.0000%`** | [`NARATokenV5`](https://basescan.org/address/0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f) | Hardcapped forever (`0` owner, `0` mint capability). |

---

## 3. Liquidity, Rug-Pull Resistance & Two-Way Range Manager

### Q3.1: How does `NARATreasuryRangeManagerV5` (`49,997 NARA`) work?
**The Short Answer:**  
`NARATreasuryRangeManagerV5` (`0x221c625d2BC416460C397035C1286C1f4A4D3A7C` bound to active Pool `0x4a4752...` pre-funded with `51.0149 NARA`, plus `49,997.0 NARA` queued at `Safe Nonce 9` in legacy `0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288` maturing `2026-11-14T14:27:48Z` to migrate into `0x221c62...`) is a **two-way active range liquidity manager**. It places `NARA` sell rungs above spot price to provide upside depth as price rises, and uses the collected `USDC` to place buy-back rungs below spot price on dips.

**The Technical Reality:**  
1. **Two-Way Range Liquidity:** Unlike static one-way walls, `NARATreasuryRangeManagerV5` supports both `NARA -> USDC` upside range bands and `USDC -> NARA` buy-back range bands inside the canonical Uniswap v4 pool.
2. **7-Day `NARA` Withdrawal Delay (Extendable to 1 Year):** Any raw `NARA` withdrawal to the `Treasury Safe` is gated by a mandatory **`7-day` on-chain withdrawal delay** at launch so live operation can be verified cleanly. Once verified, this delay can be extended up to **`1 year` (`365 days`)** on-chain.
3. **Instant Reserve Replenishment (`0-Delay`) & Surplus Recycling:** Returning `NARA` from the Range Manager directly into `NARAEmissionReserveV5` (`0xf932178F24b0813C82093985F0Af6Db27Ae25930`) has `0` delay. Any net trading surplus and LP proceeds generated by the Range Manager — alongside swap fees — may be used to acquire `NARA` from the market and send it to `NARAEmissionReserveV5`, routed into the 15-minute reward pool, or deployed into higher-impact ecosystem mechanisms as we build — so that swap taxes and range liquidity proceeds are used in one way or another to benefit committed `NARA` positions *(discretionary, activity-dependent, and never promised or guaranteed)*.

---

## 4. Token Supply, Macroeconomics & Dilution Fears

### Q4.1: Can the owner or deployer mint more NARA tokens?
**The Short Answer:**  
No. `NARATokenV5` has zero mint functions and zero owner. `1,000,000 NARA` is the permanent, immutable ceiling.

**The Technical Reality:**  
- `NARATokenV5` (`0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f`) minted `1,000,000 NARA` (`1e24` wei) once in its constructor and has no `mint()`, no owner key, no blacklist, and no upgrade proxy.
- Bounded ERC-3156 flash minting (`MAX_FLASH_LOAN = 100,000 NARA`, `0.10%` / `10 bps` fee) must be repaid within the exact same transaction or the transaction reverts.

---

## 5. Committing NARA, CryptoSLIP Companion & `5%` Secondary NFT Market

### Q5.1: How do commitments and duration multipliers work in V5?
**The Short Answer:**  
Users commit `NARA` (`1.0 NARA` minimum per Position NFT) for **`1 day` (`96` epochs)** up to **`365 days` (`35,040` epochs)** to mint a 1:1 ERC-721 **Position NFT (`NARAP`)** with a weight multiplier from **`1.00x` to `4.00x`**.

**The Technical Reality:**  
- **Quadratic Duration Curve (`V4Quadratic`):**
  $$\text{Multiplier}(r) = 1 + 0.5r + 2.5r^2, \quad r = \frac{\text{durationEpochs}}{35040}$$
  - **1 Day (`96` epochs):** `1.00x`
  - **30 Days (`2,880` epochs):** `1.06x`
  - **90 Days (`8,640` epochs):** `1.28x`
  - **180 Days (`17,280` epochs):** `1.85x`
  - **365 Days (`35,040` epochs):** **`4.00x`**
- **Equal-Footing Duration-Only Launch Mode (No NFT Splitting or Fusion):** Position NFTs are individual 1:1 ERC-721 tokens (never split or fractionalized), and VRF rarity rolls and 5-NFT fusions in `NARAForgeV5` (`0x84225aBaBbE7433c736925f9c0ba6f6CcB51551a`) are disabled (`commitsPaused = true`, bound to deterministic `NARANullEntropyAdapterV5`). Every participant enters on equal mathematical footing with zero roll/fusion fees.

---

### Q5.2: How does the CryptoSLIP App work with NARA (`Commit NARA` & Fractional `NARA Slips`)?
**The Short Answer:**  
The companion [**CryptoSLIP App**](https://cryptoslip-g29s.4everland.app/?v=cs-1794113891779) provides a dedicated **`Commit NARA`** tab for `1.0+ NARA` Position NFTs & 1-tap reward harvesting, alongside fractional **`NARA` payment slips (`>= 0.001 NARA`)**, **atomic 10-slip combining**, and **in-vault Slip-to-Slip swaps**.

**The Technical Reality:**  
1. **`Commit NARA` (`1.0+ NARA` Individual Position NFTs & 1-Tap Reward Harvesting):** Commit `1.0+ NARA` (`NARAPrincipalLedgerV5.create`) across canonical duration horizons (`1d` to `365d`) to mint your own `NARAP` Position NFT, track live 15-minute rewards (`NARA`, `ETH`, `USDC`), tap **`Collect`** to claim rewards to your wallet or wrap them directly into a shareable CryptoSLIP payment link (`>= 0.1 NARA`), and tap **`Get back`** at maturity to withdraw 100% of your `NARA` 1-for-1 (or as a slip to send).
2. **Fractional `NARA` Payment Slips (`>= 0.001 NARA`), Split & 10-Slip Combine:** Because `1,000,000 NARA` is scarce and `NARAPrincipalLedgerV5` requires `1.0 NARA` minimum per Position NFT, CryptoSLIP (`CryptoSlipVaultV32` `0x38BF0321FA7489576978353a6a8da4A3e85C2F18`) lets anyone send, receive, or keep (`acceptWithPermit`, `0%` fee) fractional `NARA` bearer slips starting from **`0.001 NARA`**, split payment slips with automatic change (`splitAndPayWithPermit`), or combine up to **10 smaller `NARA` slips** into `1.0+ NARA` in a single atomic transaction (`rearrangeAndPayWithPermits`) to commit into a V5 Position NFT.
3. **In-Vault Slip-to-Slip Swaps (`CryptoSlipTradeRouterV32`):** Swap `USDC`, `ETH`, `cbBTC`, and `NARA` directly inside slips (`0x295E72cB3dc09582F32e0fEB7e0e650752219a7f`) without exposing your personal wallet address on-chain.

---

### Q5.3: What if I commit my `NARA` and want to exit before my commitment timer finishes?
**The Short Answer:**  
When your commitment expires, you withdraw **100% of your `NARA` back 1-for-1** (`withdrawPrincipal`) with zero fee. If you want to exit early before expiration, you can list and sell your live **Position NFT (`NARAP`)** anytime for **`ETH`** on the built-in **`NARAPositionSaleV5`** marketplace (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`).

**The Technical Reality:**  
- **Zero Chart Impact:** Selling a committed Position NFT on `NARAPositionSaleV5` transfers the ERC-721 NFT (`0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA`) and its underlying principal/weight directly peer-to-peer for `ETH` without touching the Uniswap v4 pool.
- **`5%` Marketplace Royalty to Rewards (`95%` to Seller):** Every Position NFT sale on `NARAPositionSaleV5` (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`) sends **`95%` (`9,500 bps`)** of the `ETH` sale price directly to the seller and routes the **`5%` (`500 bps`)** royalty fee into `NARARewardIngressV5` (`0x44130CC47b886D8488041F5eaE271477D1aFA909`) for 15-minute `ETH` reward distributions to active positions.

---

## 6. Multisig Custody, Governance Safeguards & Security Audits

### Q6.1: How is governance structured on Base Mainnet?
**The Short Answer:**  
All governance roles are separated across three independent **2-of-3 Gnosis Safes** on Base Mainnet, with `1:1` segregated user principal custody that has zero admin sweep or rescue functions.

**The Technical Reality:**  
- **`Treasury Safe (2-of-3)`:** `0xe320C281c86079eA85f2Bc67864E873A61D551E3`
- **`OA-3 VRF Governance Safe (2-of-3)`:** `0x9d415e070AF8e93890dcCaE27755C66E3A313f0F`
- **`C1 Presentation Governor Safe (2-of-3)`:** `0x0939BE9a5359764C2334a70A13eC567C7e38E017`
- **Segregated Principal Custody (`NARAPrincipalLedgerV5` `0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2`):** Holds user-committed `NARA` 1-for-1 and has no admin withdrawal, sweep, or upgrade function.

---

## 7. Community Battlecards (5-Second Rapid FUD Dismantlers)

| Objection | Instant Response |
| :--- | :--- |
| **"Is this a tax token?"** | "Zero tax on ERC-20 transfers (`0%`). Only Uniswap v4 pool swaps pay the ~`4.92%` base fee (`4.63%` Hook + `0.30%` LP) routed via `NARAFeeVaultV5` and zero-delay `NARATreasuryFeeControllerV5` to support active liquidity and committed position rewards." |
| **"Can a whale or VC dump on us?"** | "`99.9984%` (`999,984 NARA`) of the `1,000,000` fixed supply is sealed in verified smart contracts (`949,987 NARA` in `NARAEmissionReserveV5` + `49,997 NARA` in `NARATreasuryRangeManagerV5`). Zero VCs or presales exist." |
| **"How does the Range Manager work?"** | "It is a two-way range liquidity manager (`49,997 NARA`): it sells `NARA` for `USDC` on upside rungs and uses collected `USDC` to buy `NARA` back on dips, with a `7-day` `NARA` withdrawal delay extendable to `1 year`." |
| **"What if I have less than `1 NARA`?"** | "Use CryptoSLIP (`cryptoslip.eth.limo`) to hold, split, swap, or combine fractional `NARA` payment slips (`>= 0.001 NARA`, up to 10 slips combined atomically via `rearrangeAndPayWithPermits`), and once you hold `1.0+ NARA`, commit it in the `Commit NARA` tab to mint your own `NARAP` Position NFT." |
| **"What if I want to exit before my commitment ends?"** | "List your Position NFT (`NARAP`) for `ETH` on `NARAPositionSaleV5` anytime: you receive `95%` of the `ETH` and `5%` routes into the 15-minute `ETH` reward pool." |
| **"Can the owner mint more tokens?"** | "No. `NARATokenV5` is hardcapped at `1,000,000 NARA` forever with `0` owner and `0` mint functions." |
