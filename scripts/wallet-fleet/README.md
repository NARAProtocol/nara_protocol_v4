# NARA v4 Isolated Wallet Fleet & Swarm Trading Toolkit

A fully automated, mathematically isolated 100-wallet generation, MEXC funding, and Uniswap v4 trading system.

---

## ??? Strict Isolation & Anti-Cross-Interaction Rules

1. **Zero Cross-Wallet Transfers:** No wallet in this fleet ever sends ETH, NARA, or USDC to any other wallet in the fleet.
2. **Independent Custody:** Each wallet interacts exclusively with:
   - MEXC Exchange (inbound USDC / ETH deposits).
   - Canonical Uniswap v4 Contracts (`UniversalRouter`, `Permit2`, `PoolManager`).
3. **Deterministic Backup:** All 100 wallets are derived from a single BIP-39 mnemonic seed phrase.
4. **Git Isolation:** Private keys are stored exclusively in `.fleet-wallets.json` (auto-ignored by Git).

---

## ?? Step-by-Step Execution Guide

### Step 1: Generate 100 HD Wallets
Derives 100 distinct addresses (`m/44'/60'/0'/0/0` to `m/44'/60'/0'/0/99`):
```bash
npx tsx scripts/wallet-fleet/01_generate_fleet.ts
```
* **Output 1:** `scripts/wallet-fleet/.fleet-wallets.json` (Protected keystore).
* **Output 2:** `scripts/wallet-fleet/fleet_addresses.csv` (Public address list for whitelisting or CSV export).

---

### Step 2: MEXC API Batch Withdrawal (USDC / ETH)
Configure your MEXC API credentials in `.env`:
```env
MEXC_API_KEY=your_mexc_api_key
MEXC_API_SECRET=your_mexc_api_secret
MEXC_WITHDRAW_COIN=USDC
MEXC_WITHDRAW_NETWORK=Base
MEXC_WITHDRAW_AMOUNT=10
MEXC_REQUEST_DELAY_MS=3000
```

1. **Dry Run Preview:**
   ```bash
   npx tsx scripts/wallet-fleet/02_mexc_withdraw_fleet.ts
   ```
2. **Execute Live Dispersal:**
   ```bash
   npx tsx scripts/wallet-fleet/02_mexc_withdraw_fleet.ts --execute
   ```

*(Note: Ensure your MEXC account has "Withdraw" API permission enabled with your IP whitelisted).*

---

### Step 3: Verify Fleet Balances
Audit ETH (gas) and USDC balances across all 100 addresses before running trades:
```bash
npx tsx scripts/wallet-fleet/03_verify_fleet_balances.ts
```

---

### Step 4: Start Autonomous Swarm Trader
Launches randomized, natural trading cycles on the Uniswap v4 pool:
```bash
npx tsx scripts/wallet-fleet/04_fleet_trader.ts
```

#### Optional Environment Overrides:
```env
FLEET_MIN_USDC_TRADE=2         # Minimum swap size ($2)
FLEET_MAX_USDC_TRADE=15        # Maximum swap size ($15)
FLEET_BUY_PROBABILITY=0.65     # 65% buys, 35% sells
FLEET_MIN_DELAY_SECONDS=15     # Min pause between trades (seconds)
FLEET_MAX_DELAY_SECONDS=60     # Max pause between trades (seconds)
FLEET_SLIPPAGE_BPS=500         # Slippage tolerance (5%)
```
