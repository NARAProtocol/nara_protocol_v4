# NARA Protocol — Master Knowledge Base & Deep Architecture Reference

> **Authoritative Knowledge Base for FIELD Token / NARA Protocol Workspace**  
> **Status:** Fixed v4 stack only (`contracts/v4/`); canonical contracts and
> NARA/USDC pool are in technical live testing on Base mainnet.
> **Target Network:** Base Mainnet (`chainId: 8453`).  
> **Scope:** Smart Contracts, Economic Formulas, Uniswap v4 Hook/Vault/Compounder, NFT Generative Art Engine, Category Baskets, Swarm Indexer, UI/UX Design Systems, Keepers, Multisig Custody & Governance.

---

## Table of Contents

1. [Executive Summary & Monorepo Topology](#1-executive-summary--monorepo-topology)
2. [Token Supply & Macroeconomics](#2-token-supply--macroeconomics)
3. [NARA Engine & Adaptive Mathematical Models](#3-nara-engine--adaptive-mathematical-models)
4. [Uniswap v4 Dynamic Fee Hook & Fee Vault](#4-uniswap-v4-dynamic-fee-hook--fee-vault)
5. [Liquidity Compounder and Fee-to-LP Flow](#5-liquidity-compounder-and-fee-to-lp-flow)
   - [5.1 Treasury Range Manager Production Deployment & Activation](#51-treasury-range-manager-production-deployment--activation)
   - [5.2 Adversarial Matrix, MEV Stress-Testing & Autonomous Range Ranger](#52-adversarial-matrix-mev-stress-testing--autonomous-range-ranger)
   - [5.3 Dynamic Volume & Directional Pressure Market-Making Engine (Range Ranger)](#53-dynamic-volume--directional-pressure-market-making-engine-range-ranger)
6. [Position NFTs & Generative On-Chain Art Engine](#6-position-nfts--generative-on-chain-art-engine)
   - [6.4 The NFT Position Shield & Off-DEX Operative Architecture](#64-the-nft-position-shield--off-dex-operative-architecture)
     - [6.4.4 Competitive Landscape & The "Third Dimension" Launch Paradigm](#644-competitive-landscape--the-third-dimension-launch-paradigm)
     - [6.4.5 Shielded Launch Archetypes & Ecosystem Models](#645-shielded-launch-archetypes--ecosystem-models)
7. [Bond Markets & Genesis Reward Distribution](#7-bond-markets--genesis-reward-distribution)
8. [Composability Layer (stNARA, SY-stNARA, Fractional Positions)](#8-composability-layer-stnara-sy-stnara-fractional-positions)
9. [NARA Category Baskets (Foundry Architecture & Adapters)](#9-nara-category-baskets-foundry-architecture--adapters)
10. [Swarm Monitor & Real-Time Indexer (Ponder)](#10-swarm-monitor--real-time-indexer-ponder)
11. [Frontend Ecosystem & Design Systems](#11-frontend-ecosystem--design-systems)
    - [11.4 Official NARA Brand Identity, Logo Standards & Hosted Asset Registry](#114-official-nara-brand-identity-logo-standards--hosted-asset-registry)
12. [Operations, Keepers & Multisig Governance](#12-operations-keepers--multisig-governance)
13. [Cross-Repository Release Protocol & State Gates](#13-cross-repository-release-protocol--state-gates)
14. [Codex Solidity Audit Pipeline](#14-codex-solidity-audit-pipeline)
15. [Master Deployment Registry & Verified Addresses](#15-master-deployment-registry--verified-addresses)

---

## 1. Executive Summary & Monorepo Topology

NARA is a fixed-supply protocol with time-weighted positions, variable reward
accounting, and protocol-owned-liquidity components on Base.
The system operates exclusively on the **fixed v4 production stack**. All experimental v5 versions and legacy v3 contracts are retired and frozen.

> **Live-testing and legal boundary:** The canonical contracts and pool use real
> assets. This knowledge base records technical state and design inventory; it
> does not establish public product availability, production readiness, audit
> completion, safety, legal approval, jurisdictional availability, price,
> liquidity, returns, or an exit. This repository contains no evidence of
> completed jurisdiction-specific qualified legal review. Nothing here is an
> invitation, inducement, or recommendation
> to transact. For current gates, see [CURRENT_STATE.md](CURRENT_STATE.md).  
> For investor objection handling, technical defenses, and battlecards, see [NARA_INVESTOR_QNA.md](NARA_INVESTOR_QNA.md).

### Workspace Architecture
The workspace contains self-contained sub-projects without a shared root `package.json`:

```
c:\Users\linas\Desktop\FIELD Token/
├── nara-protocol-hardhat/             # Canonical v4 Hardhat project: contracts, deploy scripts, tests, runbooks
│   ├── contracts/v4/                  # Sole active Solidity source tree (0.8.34)
│   ├── test/                          # Comprehensive Hardhat TypeScript test suite
│   ├── scripts/                       # Deployment, verification, atomic Safe batch builders
│   ├── deployments/                   # Verified JSON deployment receipts & manifests
│   └── docs/                          # Canonical engineering and operational documentation
├── nara-category-baskets-v1/          # Canonical Category Baskets Foundry project
│   ├── src/                           # Basket Manager, Fee Collectors, Adapters
│   ├── test/                          # Forge test suite (130+ unit & fork tests)
│   └── app/                           # Publishable Baskets web app (React, Vite, Cloudflare Pages/Workers)
├── nara-swarm-monitor/                # Canonical Indexer & Alerting (Ponder, TypeScript)
│   ├── ponder.config.ts               # Multi-contract event source bindings
│   └── ponder.schema.ts               # Relational onchain analytics database schema
├── naraswap/                          # Dedicated NARA v4 Uniswap v4 swap frontend
├── nara_protocol_public/              # Public-facing documentation & verification packages
├── apps/                              # Auxiliary / Historical frontends
│   ├── nara-lockboard/                # Deferred 100-slot light-theme Degen Board
│   ├── nara-arena/                    # Historical v3 Arena game (retired)
│   ├── nara-lotto/                    # Historical v3 Lotto game (retired)
│   ├── nara-analytics/                # Read-only Recharts analytics dashboard
│   ├── nara-protocol-ui/              # naraprotocol.io landing page
│   └── nara-simple-ui/                # Simple lock/mine UI
├── templates/wallet-game-app/         # Pinned wagmi/RainbowKit game starter
├── .codex/audit/                      # 6-Specialist multi-agent smart contract audit pipeline
└── docs/                              # Workspace-wide cross-repo release protocols & UX standards
```

---

## 2. Token Supply & Macroeconomics

### Fixed Supply (`NARAToken.sol`)
- **Total Supply:** `1,000,000 NARA` (`1e24` wei). Minted exactly once to Treasury in the constructor.
- **No Inflation / No Admin Mint:** Zero minting functions, zero burning functions in the token contract.
- **No Backdoors / Pauses:** No owner, no blacklist, no upgrade proxy, no transfer taxes at the ERC-20 token layer.
- **Standard Extensions:**
  - **ERC-2612 Permit:** Gasless approvals via EIP-712 signatures.
  - **ERC-1363 Transfer and Call:** `transferAndCall` & `transferFromAndCall` enabling atomic single-tx token lock actions.
  - **ERC-3156 Flash Mint:** `MAX_FLASH_LOAN = 100,000 NARA` (`10%` of total supply), `FLASH_FEE_BPS = 10` (0.10%). Flash loan fees route to immutable `FLASH_FEE_SINK` (`NARAEngine`).

### Supply Distribution Architecture
1. **Reward Reserve (`NARARewardReserve`):** `650,000 NARA` (65%) sealed in custody. Releases strictly to `NARAEngine` for epoch-by-epoch emissions.
2. **Treasury inventory:** historical plans allocate up to `250,000 NARA` to a
   bond vault, but the bond system is not deployed or open and no sale or
   return is promised.
3. **Initial Liquidity & Floating Reserve:** `100,000 NARA` (10%) was the
   deployment allocation model; `60,000 NARA` was used in the initial v4 pool
   seed. Current balances require a fresh read.

### Circulating Supply Formula
Circulating supply is computed as:
$$\text{CirculatingSupply} = \text{TotalSupply} - \text{EngineBalance} - \text{RewardReserveBalance} - \text{BondVaultBalance} - \text{ExcludedMarketBalance}$$

---

## 3. NARA Engine & Adaptive Mathematical Models

The `NARAEngine` (`contracts/v4/NARAEngine.sol`) manages epochs, locking
duration multipliers, emissions, stress feedback, and reward accounting. It is
not a universal revenue sink: routing is module-specific and depends on
deployed, verified configuration.

### 3.0 Deployed Reward-Routing Boundary

- The Engine supports NARA emissions and contributed native ETH through
  `notifyEthRewards()`.
- Its generic ERC-20 notifier exists in immutable code but is prohibited for
  the deployed Engine. There is no authorized `REWARD_NOTIFIER_ROLE` holder;
  do not grant the role or call `notifyTokenRewards`.
- The current liquidity Vault uses `RouteMode.Liquidity`. Its `Engine` and
  `Split` enum values permanently revert `EngineTokenRoutingDisabled`.
- `Genesis` and `GenesisSplit` require a separately deployed and verified
  distributor and are not currently available.
- Bonds, baskets, and future applications have their own deployment and legal
  gates. Source-level routing options are not evidence of current cash flow,
  product availability, revenue, or returns.
- The Treasury Range Manager is an implemented/tested candidate only and is not
  deployed, funded, or activated. Its source design returns treasury principal,
  tactical proceeds, LP fees, and cancellation outputs to the immutable
  production Safe rather than treating them as Engine revenue.

### 3.1 Epoch Lifecycle & JIT Advance
- **Epoch Duration:** `EPOCH_LENGTH = 900` seconds (15 minutes). 96 epochs per day.
- **Clock Formula:**
  $$\text{currentEpoch} = \left\lfloor \frac{\text{block.timestamp} - \text{GENESIS\_TIMESTAMP}}{\text{EPOCH\_LENGTH}} \right\rfloor$$
- **Just-In-Time (JIT) Auto-Advance:** User-facing calls automatically advance up to `MAX_JIT_ADVANCE = 8` un-settled epochs in-line. If backlog exceeds 8 epochs, operations revert with `EpochStale`, prompting keeper or permissionless `advanceEpochs(maxSteps)` catchup.

### 3.2 Lock Mechanics & Duration Multipliers
Users deposit NARA for $D$ epochs ($\text{minLockEpochs} \le D \le \text{maxLockEpochs}$, where $\text{maxLockEpochs} = 35,040 \approx 1\text{ year}$).
- **Activation:** Locks activate at `currentEpoch + activationDelayEpochs + 1` (default delay: 0 or 1 epoch).
- **Maturity:** Positions unlock after `unlockEpoch = currentEpoch + durationEpochs + 1`.
- **Weight Formula (`NARAEngineModelLib.computeWeight`):**
  $$r = \frac{\text{durationEpochs}}{\text{maxLockEpochs}} \in [0, 1]$$
  $$m = 1 + \frac{\text{durationLinearWad} \times r}{10^{18}} + \frac{\text{durationQuadraticWad} \times r^2}{10^{18}}$$
  $$\text{Weight} = \text{NetAmount} \times m$$
- **Weight Multiplier Ladder (Production Configuration: Linear 0.5, Quadratic 2.5):**
  - Min Duration (1 epoch): $\approx 1.01\times$
  - 90 Days (8,760 epochs): $\approx 1.28\times$
  - 180 Days (17,520 epochs): $\approx 1.88\times$
  - 270 Days (26,280 epochs): $\approx 2.78\times$
  - 365 Days (35,040 epochs): $\approx \mathbf{4.00\times}$ (Max Multiplier cap enforced $\le 10\times$).
- **Concurrent Active Slots & Recycling (`MAX_LOCK_POSITIONS_PER_ACCOUNT = 64`):**
  - Accounts can hold up to 64 active positions concurrently.
  - Slots are **not a lifetime cap**: calling `unlock(positionId)` decrements `_ownerPositionCount`, immediately freeing and recycling the slot for new locks over multi-year compounding cycles.

### 3.3 Adaptive Emission Model Formulas
Executed on every epoch transition (`NARAEngineModelLib.computeNextEpochSnapshot`):

1. **Warmup Factor:**
   $$\text{warmup}_{n+1} = \text{warmup}_n + \frac{\text{warmupRateWad} \times (1 - \text{warmup}_n)}{10^{18}}$$
2. **Bootstrap Weight (Phantom Dilution):**
   $$\text{bootstrap}_{n+1} = \frac{\text{bootstrap}_n \times \text{bootstrapDecayWad}}{10^{18}}$$
3. **Weighted Lock Share (WLS):**
   $$\text{WLS} = \frac{\text{ActiveWeight}}{\text{CirculatingSupply} + \text{ActiveWeight} + \text{BootstrapWeight}}$$
4. **Base Emission Dynamics:**
   $$\text{BaseEmission}_{n+1} = \text{clamp}\left(\frac{\text{BaseEmission}_n \times \text{growthFactorWad}}{10^{18}}, \text{minBaseEmission}, \text{maxBaseEmission}\right)$$
5. **Incentive vs Penalty & Stress Feedback:**
   $$\text{Incentive} = 1 + \frac{a_{\text{wad}} \times \text{WLS}}{10^{18}}$$
   $$\text{Penalty} = \frac{b_{\text{wad}} \times \text{Stress}_n}{10^{18}}$$
   $$\text{EmissionFactor} = \max(\text{Incentive} - \text{Penalty}, 0)$$
   $$\text{Emission} = \text{clamp}\left(\frac{\text{BaseEmission} \times \text{EmissionFactor}}{10^{18}}, 0, \text{maxBaseEmission}\right)$$
6. **Beta & Horizon Contraction:**
   $$\beta = \beta_0 + \frac{m_{\text{wad}} \times \text{Stress}_n}{10^{18}}$$
   $$\text{Horizon} = \frac{e_{\text{max}}}{\beta}$$
7. **Retention & Admitted Supply:**
   $$\text{Retention} = \begin{cases} 0 & \text{if } \text{Circ} \ge \text{Horizon} \\ 1 - \frac{\text{Circ}}{\text{Horizon}} & \text{if } \text{Circ} < \text{Horizon} \end{cases}$$
   $$\text{AdmittedSupply} = \frac{\text{Emission} \times \text{Retention}}{10^{18}}$$
   $$\text{DistributedNara} = \frac{\text{AdmittedSupply} \times \text{dripSplitWad} \times \text{warmup} \times \text{ActiveWeight}}{10^{18} \times 10^{18} \times (\text{ActiveWeight} + \text{BootstrapWeight})}$$
8. **Stress Calculation:**
   $$\text{Stress} = \min\left( \frac{c_{\text{wad}} \times (1 - \text{WLS})}{10^{18}} + \frac{d_{\text{wad}} \times (\text{Emission} / \text{Horizon})}{10^{18}}, 1.0 \right)$$

### 3.4 Multi-Asset Distribution & Ray Indexes
- **Ray Precision:** $10^{27}$ (RAY).
- **Index Updates:** On each epoch or reward notification:
  $$\text{indexRay}_{n+1} = \text{indexRay}_n + \frac{\text{RewardAmount} \times 10^{27}}{\text{ActiveTotalWeight}}$$
- **Claimable Rewards Calculation:**
  $$\text{Earned} = \frac{\text{PositionWeight} \times (\text{indexRay} - \text{positionDebtRay})}{10^{27}}$$
- **Native ETH Distribution:** Injected via `notifyEthRewards()`. 100% of queued ETH distributes in the next epoch.
- **Safety Invariant:** `REWARD_NOTIFIER_ROLE` is permanently renounced from Custody Safe and Vault to prevent arbitrary ERC-20 denominator dilution.

### 3.5 Variable Reward-Rate Inputs

Position reward amounts are state-dependent and can be zero. Bootstrap weight,
active weight, admitted supply, reserve availability, contribution timing, and
timelocked parameters all affect realized accounting. Formula outputs and
historical snapshots are not APR quotes, forecasts, promises, or guarantees.
The deployed Engine's ERC-20 notifier remains prohibited.

---

## 4. Uniswap v4 Dynamic Fee Hook & Fee Vault

NARA's primary liquidity home is an atomic **Uniswap v4 pool** (`NARA/USDC`, 0.30% canonical fee, tick spacing 60).

### 4.1 CREATE2 Permission Encoding (`0x2088`)
Uniswap v4 encodes hook permissions into the lowest bits of the deployed hook address:
- `BEFORE_INITIALIZE_FLAG`: bit 13 (`0x2000`)
- `BEFORE_SWAP_FLAG`: bit 7 (`0x0080`)
- `BEFORE_SWAP_RETURNS_DELTA_FLAG`: bit 3 (`0x0008`)
- **Combined Permission Mask:** `0x2000 | 0x0080 | 0x0008 = 0x2088`. Verified by CREATE2 mining via `Create2HookDeployer.sol`.

### 4.2 Dynamic Fee Curve & Cumulative Pressure Model
- **Exact-Input Only:** Exact-output swaps revert with `ExactOutputUnsupported`.
- **Asymmetric Buy/Sell Curves:**
  - **Buy Curve (USDC in):** Base 3% $\to$ Medium 5% $\to$ High 8% $\to$ Extreme 12% (Default Cap: 12%).
  - **Sell Curve (NARA in):** Base 5% $\to$ Medium 8% $\to$ High 12% $\to$ Extreme 20% (Default Cap: 20%).
- **Block-0 Cumulative Pressure:** Pressure accumulates across all transactions within the same block:
  $$\text{Pressure} = \frac{\text{CumulativeBlockAmountIn}}{\text{protocolDepth}}$$
  Splitting a swap into multiple sub-orders in the same block results in the exact same integrated fee. Pressure resets on subsequent blocks.
- **7-Day Governance Timelock:** Any update to fee curves or `protocolDepth` is subject to `FEE_UPDATE_DELAY = 7 days`. Pending proposals can be cancelled instantly by Safe.

### 4.3 Liquidity Growth Vault (`NARALiquidityGrowthVault.sol`)
- Receives pool fees in input currency (USDC on buys, NARA on sells) directly via `poolManager.take(..., address(vault), feeAmount)`.
- **Dynamic Route Modes (`enum RouteMode`):**
  - **`Liquidity` (0, Active Default):** balanced collected USDC and NARA can
    be added to the Compounder's position; one-sided or unmatched inventory is
    banked and is not active LP.
  - **`Genesis` (3):** unavailable until a separately verified Genesis
    distributor is deployed and bound.
  - **`GenesisSplit` (4):** unavailable under the same gate; its source-level
    split is not current distribution evidence.
  - **`Engine` (1) / `Split` (2):** Disabled/Prohibited to preserve core invariants.
- A future Genesis route requires separate deployment evidence, configuration,
  security review, legal review, and explicit human approval. Source capability
  alone is not authorization.
- **Frozen Compounder Binding:** The binding from Vault to Compounder is permanently frozen (`compounderFrozen = true`).

---

## 5. Liquidity Compounder and Fee-to-LP Flow

`NARALiquidityCompounderV4.sol` adds protocol-owned liquidity to the Uniswap v4
pool subject to documented owner recovery/migration controls and a seven-day
timelock.

### Key Architectural Invariants
1. **Full-Range Liquidity:** Uses `MIN_TICK` to `MAX_TICK` (aligned to tick
   spacing 60) and is intended to avoid routine range rebalancing. This does not
   eliminate price, manipulation, contract, liquidity, or operational risk.
2. **No-Swap Compound:** Never executes market swaps. Only the balanced ratio of NARA:USDC at the live `sqrtPriceX96` is deposited.
3. **Remainder Banking:** Unbalanced surplus (for example, excess USDC from buy
   pressure) remains held by the Compounder subject to contract, admin, and
   recovery risk. One-sided fees do not become instant LP.
4. **Position NFT Custody:** Uniswap v4 LP NFT `2898486` is held by the
   Compounder. Its liquidity was `4386316228001171` at the latest
   receipt-pinned compound (Base block `50499085`). A percentage share requires
   a fresh total-liquidity read and must not be inferred from this snapshot.
5. **Exact-Spend Invariant:** Pulls exact allowances from the Vault and clears
   the intended intermediate spend path; this does not eliminate all contract,
   integration, or recovery risk.
6. **7-Day Recovery Timelock:** Owner POL-removal operations (`WindDown`, `MigratePosition`, `RecoverPoolTokens`) require `RECOVERY_DELAY = 7 days`.

### 5.1 Treasury Range Manager Production Deployment & Activation

The Treasury Range Manager (`NARATreasuryRangeManagerV1.sol`) is **DEPLOYED, FUNDED, AND ACTIVATED ON BASE MAINNET**:
- **Contract Address:** [`0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C`](https://basescan.org/address/0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C)
- **Dedicated Treasury Range Safe:** [`0x5050BC6dc3E07313D52D05cecD53f727D6CDa245`](https://basescan.org/address/0x5050BC6dc3E07313D52D05cecD53f727D6CDa245) (1-of-1 threshold, owned by `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`). Holds exclusive custody of order inventory and receives all cancellation and settlement proceeds.
- **Protocol 2-of-3 Safe:** `0xd65c0e390Dc187A22c52c03816591CC736C0D755` executed the CREATE2 deployment packet only on 2026-09-01 (tx `0xa657e0be76f040195fddb791e030b2fa0275f6ed989e2c17e2d1256bb95cb869`, block `50736510`); it holds zero operational range custody.
- **Runtime Hash:** keccak256 `0xbd53ab49bd70983a352c5fc3c638f8df2d527e42011671218461aa5fb5b83a09` (23620 bytes).
- **Autonomous Settler Daemon:** Active on Railway (`services/v4-treasury-range-settler`, keeper `0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7`), executing 15-second polling sweeps to return terminal profits to the Safe.
- **Invariants:**
  1. The manager contract holds zero persistent token balances.
  2. Every rebalance execution ends with `assertOperationalClean()`.
  3. Strict Uniswap v4 tick alignment: Buy orders have $tickLower \ge currentTick$ (dollar price lower); Sell orders have $tickUpper \le currentTick$ (dollar price higher).

This manager is strictly separate from permanent POL (Hook → Vault → Compounder). Prior documentation dated 2026-08-31 describing the manager as undeployed was stale document lag.

### Historical candidate notes (through 2026-08-31)

`NARATreasuryRangeManagerV1.sol` was documented as an implemented and tested, then-undeployed,
Safe-bound periphery candidate for tactical one-sided NARA/USDC ranges. It is
strictly separate from permanent POL: it owns only manager-registered tactical
PositionManager NFTs, never changes the Hook/Vault/Compounder, and sends every
settlement or cancellation output directly to the immutable dedicated Treasury
Range Safe. Protected PR #62 separated that 1-of-1 canary-custody Safe from the
protocol 2-of-3 deployment Safe. Protected PR #64 merged the prefunded-route and
strict matrix-evidence hardening as GitHub-verified commit
`162c24be080398b65c76e542a48ccb608cd1fb43`.

### 5.2 Adversarial Matrix, MEV Stress-Testing & Autonomous Range Ranger

The **Adversarial Matrix** and the **Multi-Block Burst Buyer** are specialized **security, verification, and liquidity-defense testing harnesses**. They are strictly protocol research, testing, and automated market stability tools—**NOT market manipulation, wash trading, or price-fixing instruments**.

#### A. Purpose & Regulatory UX Boundary of the Matrix
1. **Adversarial Hook Stress-Testing:** The 21-case matrix (`scripts/runV4LiveSameBlockBuyTaxMatrix.ts`, `runV4LiveSameBlockSellReversal.ts`) systematically verified that same-block Block-0 swap volume aggregates properly across transactions and scales taxes up to the 20% cap without overflow or rounding flaws.
2. **MEV & Arbitrage Resistance Proof:** The matrix verified that MEV sandwichers and cross-pool searchers cannot exploit the canonical pool. Instead, their arbitrage volume is taxed, capturing POL directly into `NARALiquidityGrowthVault.sol` (proven by Base transactions `0x86a1...8c3` and `0x9361...394`).
3. **Liquidity Defense Calibration:** The Single-Wallet Burst Buyer (`scripts/runSingleWalletBurstBuys.ts`) was used to simulate sequential micro-volume ($1.00 trades across blocks) to test how the automated order book responds to real-world demand, ensuring that liquidity floors adjust upwards to lock in protocol value and prevent predatory down-wicks.

#### B. The Autonomous Range Ranger Engine
To remove manual UI bottlenecks and protect the pool 24/7, the system features an autonomous rebalance engine:
- **CLI Atomic Rebalancer:** `nara-protocol-hardhat/scripts/autoRangeManager.ts`
- **Zero-Waste Adaptive Streamer:** `nara-protocol-hardhat/scripts/rangeRangerEventEngine.ts`
- **Cloud 24/7 Watcher (Railway):** `nara-swarm-monitor/scripts/rangeRangerWatcher.mjs`
- **Core Viem Runtime:** `nara-swarm-monitor/scripts/rangeRangerRuntime.mjs`

#### C. Execution Architecture & Anti-Exploit Safeguards
1. **Atomic MultiSend Execution:** All actions (cancellations, approvals, 4-5 fresh buy bands, 4-5 fresh sell bands, approval revocations, and `assertOperationalClean`) execute in **1 single atomic EVM transaction** via Safe 1.4.1 MultiSendCallOnly (`0x40A2aCCbd92BCA938b02010E17A5b8929b49130D`).
2. **Gas Ceiling:** Requires `7_500_000` gas limit (batch consumes ~3.8M - 4.2M gas across Uniswap v4 position mints/burns).
3. **Anti-Flash-Loan Guard:** 2,500-tick instant shift ceiling prevents rebalancing against single-block flash loan spikes without multi-block confirmation.
4. **Live On-Chain Evidence:**
   - **Rebalance Cycle 1 (Block `50792858`):** Cancelled 5 stale orders, deployed 8 bands centered at $0.0727. ([Tx `0xe538...917`](https://basescan.org/tx/0xe5382c9a83d171a9c9707ef49e5ac4cc1cb9e35d5e07dc6d5b4efe359dcf5917)).
   - **Rebalance Cycle 2 (Block `50794578`):** Autonomously triggered by 28% pump to $0.0964. Cancelled stale orders, deployed 4 new buy floors ($0.0678 - $0.0920) and 4 new sell targets up to $0.2710. ([Tx `0x73a0...e0b`](https://basescan.org/tx/0x73a0a92dc351668994bf3ec9c7ec0774ae8f789c89320ebb96dfd89f64f95e0b)).

Protocol authority:
- `docs/CURRENT_STATE.md`
- `docs/architecture/NARA_TREASURY_RANGE_MANAGER_V1.md`
- `docs/runbooks/NARA_V4_TREASURY_RANGE_SETTLER_RUNBOOK.md`
- `scripts/autoRangeManager.ts`
- `../nara-swarm-monitor/scripts/rangeRangerWatcher.mjs`
- `../nara-swarm-monitor/scripts/rangeRangerRuntime.mjs`

### 5.3 Dynamic Volume & Directional Pressure Market-Making Engine (Range Ranger)

The **Range Ranger** is the protocol's autonomous, non-custodial concentrated liquidity market maker on Uniswap v4. Operating via the dedicated Treasury Range Safe (`0x5050BC6dc3E07313D52D05cecD53f727D6CDa245`), it eliminates manual rebalancing bottlenecks and replaces rigid, static liquidity grids with a **dynamic, volume- and pressure-responsive adaptive order-book engine**.

```
                           ┌──────────────────────────────────────────────┐
                           │          LIVE BASE BLOCKCHAIN TELEMETRY       │
                           └──────────────────────┬───────────────────────┘
                                                  │
                   ┌──────────────────────────────┼──────────────────────────────┐
                   ▼                              ▼                              ▼
     [Uniswap v4 Hook Event Stream]     [Short-Term Price Momentum]    [Resting Order Depletion]
     - eth_getLogs (PoolFeeTaken)       - ΔP = (P_curr - P_start)/P    - Filled Buys vs Filled Sells
     - Net Buy USD vs Sell USD Vol      - Directional Trend Vector     - Book Inventory Skew
                   │                              │                              │
                   └──────────────────────────────┼──────────────────────────────┘
                                                  │
                                                  ▼
                                ┌───────────────────────────────────┐
                                │  calculateMarketFlow() Analytics  │
                                ├───────────────────────────────────┤
                                │ • Net Pressure: P_net ∈ [-1, +1]  │
                                │ • Regime: BUY / SELL / NEUTRAL    │
                                │ • Volatility: V_vol ∈ [0.7, 2.5]  │
                                └─────────────────┬─────────────────┘
                                                  │
                         ┌────────────────────────┴────────────────────────┐
                         ▼                                                 ▼
        ┌──────────────────────────────────┐             ┌──────────────────────────────────┐
        │ calculateDynamicBudgets()        │             │ synthesizeBuy/SellBracket()      │
        ├──────────────────────────────────┤             ├──────────────────────────────────┤
        │ • Reserve-Aware Allocation       │             │ • 5-Tier Adaptive Geometry       │
        │ • ~35% Safe USDC Reserve         │             │ • Dead-Zone Elimination (2-2.5%) │
        │ • ~25% Safe NARA Reserve         │             │ • Asymmetric Pressure Skewing    │
        │ • Volatility Scaling Multiplier  │             │ • Stale Order Retention Logic    │
        └────────────────┬─────────────────┘             └────────────────┬─────────────────┘
                         │                                                 │
                         └────────────────────────┬────────────────────────┘
                                                  │
                                                  ▼
                               ┌─────────────────────────────────────┐
                               │     Atomic Safe 1.4.1 MultiSend     │
                               ├─────────────────────────────────────┤
                               │ • Cancel Obsolete / Conflicting     │
                               │ • Retain Strategic Moon-Pump Limits │
                               │ • Approve Exact Capital (Permit2)   │
                               │ • Mint 5 Fresh Buy / 5 Sell Bands   │
                               │ • Revoke Allowances                 │
                               │ • assertOperationalClean()          │
                               └─────────────────────────────────────┘
```

#### 5.3.1 Market Flow & Directional Pressure Formulation
Traditional concentrated liquidity managers deploy static symmetric brackets around spot price. Under real-world order flow, this causes rapid inventory adverse selection:
- When aggressive buying occurs, static sell orders are quickly absorbed at cheap prices, and buy support remains far below, leaving the pool vulnerable to sharp retracements.
- When aggressive selling occurs, static buy orders absorb dumps prematurely before price discovers real support, exhausting quote capital at local highs.

The Range Ranger resolves this through continuous **On-Chain Flow Quantification** (`rangeRangerRuntime.mjs -> calculateMarketFlow`):

1. **Volume Flow Imbalance ($P_{\text{vol}}$):**
   The engine queries the Uniswap v4 Hook's `PoolFeeTaken` logs over a recent lookback window ($\le 1,900$ blocks, within public Base RPC limits). Because `NARALiquidityGrowthHook.sol` takes fees in the input currency (USDC on buys, NARA on sells), every swap emits direct flow evidence:
   $$V_{\text{buy}} = \sum \text{USDC Amount In}$$
   $$V_{\text{sell}} = \sum (\text{NARA Amount In} \times P_{\text{spot}})$$
   $$P_{\text{vol}} = \frac{V_{\text{buy}} - V_{\text{sell}}}{V_{\text{buy}} + V_{\text{sell}} + \epsilon} \in [-1.0, +1.0]$$

2. **Price Momentum ($\Delta P$):**
   Evaluates percentage price displacement across the observation window:
   $$\Delta P = \frac{P_{\text{current}} - P_{\text{start}}}{P_{\text{start}}}$$
   $$P_{\text{mom}} = \tanh(10 \cdot \Delta P) \in [-1.0, +1.0]$$

3. **Order Book Inventory Depletion ($P_{\text{book}}$):**
   Compares the fill state of active maker orders in `NARATreasuryRangeManagerV1`:
   $$P_{\text{book}} = \frac{N_{\text{sells\_filled}} - N_{\text{buys\_filled}}}{N_{\text{total\_orders}}} \in [-1.0, +1.0]$$

4. **Composite Net Directional Pressure ($P_{\text{net}}$):**
   Synthesizes the three independent signals with calibrated weights:
   $$P_{\text{net}} = 0.50 \cdot P_{\text{vol}} + 0.30 \cdot P_{\text{mom}} + 0.20 \cdot P_{\text{book}}$$
   *(If RPC log queries are throttled or empty, the engine gracefully degrades weights to price momentum and order book depletion).*

5. **Operational Flow Regimes:**
   - **`BUY_PRESSURE` ($P_{\text{net}} > +0.25$):** Aggressive taker buy flow dominating; upward price momentum.
   - **`SELL_PRESSURE` ($P_{\text{net}} < -0.25$):** Taker sell flow dominating; downward price drift.
   - **`NEUTRAL_CHOP` ($-0.25 \le P_{\text{net}} \le +0.25$):** Mean-reverting consolidation.

#### 5.3.2 Volatility Multiplier ($V_{\text{vol}}$) & Dynamic Reserve Budgeting
To protect Treasury Safe reserves, capital allocation and bracket spacing dynamically adapt to market volatility:

- **Volatility Multiplier ($V_{\text{vol}} \in [0.70, 2.50]$):**
  Derived from the standard deviation of short-term price returns relative to baseline. During quiet consolidation, $V_{\text{vol}} \to 0.70 - 0.85\times$, signaling tight spreads. During high-velocity expansions, $V_{\text{vol}} \to 1.50 - 2.50\times$, signaling wide spacing to shield inventory from toxic arbitrage.

- **Dynamic Reserve-Aware Budgets (`calculateDynamicBudgets`):**
  Rather than risking all treasury capital in a single rebalance, the engine caps active exposure:
  $$\text{Budget}_{\text{USDC}} = \text{Safe USDC Balance} \times 0.35 \times \text{clamp}(V_{\text{vol}}, 0.8, 1.2)$$
  $$\text{Budget}_{\text{NARA}} = \text{Safe NARA Balance} \times 0.25 \times \text{clamp}(V_{\text{vol}}, 0.8, 1.2)$$
  - Enforces minimum operational floors ($100 USDC and 1,000 NARA) to guarantee order viability.
  - Leaves 65% of USDC and 75% of NARA unallocated in Safe custody, ensuring reserves can never be depleted in a single trend leg.

#### 5.3.3 5-Tier Adaptive Bracket Geometry & Elimination of Dead Zones
The bracket synthesizer (`synthesizeBuyBracket`, `synthesizeSellBracket`) structures orders across 5 dynamic tiers:

1. **Elimination of Dead Zones:**
   Legacy 4-tier bands positioned the first order $4.5\%$ to $8.0\%$ away from spot, creating an unserved dead zone where spot price fluctuated without providing maker liquidity. The 5-tier architecture closes this gap:
   - **Tier 1 Buy:** Anchored tight at $-2.0\%$ to $-2.5\%$ below spot.
   - **Tier 1 Sell:** Anchored tight at $+2.5\%$ to $+3.5\%$ above spot.

2. **Asymmetric Pressure Skewing:**
   - **Under `BUY_PRESSURE` ($P_{\text{net}} > 0.25$):**
     - **Buy Ladder (Floor Ratchet):** Front-loads ~70% of available USDC budget into Tiers 1 & 2 (e.g., 40% Tier 1, 30% Tier 2) with tight spacing ($-2.0\%$ to $-6.0\%$). This immediately builds a thick bid wall directly under spot, ratcheting up the support floor and preventing price from retracing.
     - **Sell Ladder (Parabolic Extension):** Spacing expands geometrically outward (Tier 1 at $+3.5\%$, scaling up to Tier 5 at $+200\%$ to $+300\%$ above spot). Sells are spaced wider and thinner, letting the token appreciate freely while taking profits exponentially higher instead of dumping prematurely.
   - **Under `SELL_PRESSURE` ($P_{\text{net}} < -0.25$):**
     - **Buy Ladder (Deep Value Accumulation):** Spacing widens downward (Tier 1 at $-3.0\%$, stretching to Tier 5 at $-35\%$ to $-50\%$). Buys are weighted towards deeper tiers, preventing the engine from catching falling knives and accumulating NARA at substantial discounts.
     - **Sell Ladder (Relief Rally Scalp):** Sells compress tightly above spot ($+2.0\%$ to $+12.0\%$) to offload inventory on minor relief bounces and restore USDC liquidity.
   - **Under `NEUTRAL_CHOP` ($-0.25 \le P_{\text{net}} \le 0.25$):**
     - Symmetrical 5-tier geometric distribution providing continuous two-sided liquidity and harvesting AMM trading fees.

| Tier | Buy Price Offset (Neutral) | Sell Price Offset (Neutral) | Buy Weight (Pump Skew) | Sell Weight (Pump Skew) |
| :---: | :---: | :---: | :---: | :---: |
| **Tier 1** | $-2.5\%$ | $+2.5\%$ | **40% (Heavy Floor)** | 10% (Tight Scalp) |
| **Tier 2** | $-5.5\%$ | $+6.0\%$ | **30% (Dense Bid)** | 15% (Low Resistance) |
| **Tier 3** | $-10.0\%$ | $+12.0\%$ | 15% (Mid Support) | 20% (Mid Target) |
| **Tier 4** | $-16.0\%$ | $+22.0\%$ | 10% (Deep Floor) | 25% (High Target) |
| **Tier 5** | $-25.0\%$ | $+38.0\%$ | 5% (Safety Net) | **30% (Moon Ladder $\to 3\times$)** |

#### 5.3.4 Stale Order Management & Moon-Pump Capture Strategy
In concentrated AMMs, orders become "stale" when spot price moves completely past their upper or lower tick bounds. A naive algorithm immediately burns gas to cancel and recreate every out-of-range order.

The Range Ranger enforces an intentional **Asymmetric Stale Order Strategy**:
1. **Out-of-Range Moon-Pump Sells Left Resting:**
   When spot price retraces or consolidates at lower levels, previously deployed sell orders resting high above spot (e.g. Orders #51, #59, and #60 resting at $0.1728, $0.2197, and $0.3324, representing 15,000 NARA valued at >$3,000 USDC) are **intentionally left open on-chain**:
   - They consume zero ongoing gas while resting in `NARATreasuryRangeManagerV1`.
   - If an unexpected volume spike or market breakout occurs, these orders are filled automatically by taker flow, locking in massive profits for the Treasury Safe without latency or transaction costs.
2. **Selective Stale Cancellation:**
   Only orders that actively conflict with the new 5-tier bracket or exceed operational capacity limits are cancelled during a rebalance cycle, conserving Safe MultiSend gas headroom within the `7_500_000` limit.

#### 5.3.5 Operational Telemetry, Telegram Bot & Cloud Watcher
The Range Ranger operates 24/7 with zero human intervention, monitored via dedicated tools:
- **Cloud 24/7 Watcher (Railway):** Running `nara-swarm-monitor/scripts/rangeRangerWatcher.mjs` on project `zealous-generosity`. Streams on-chain events, computes live market pressure, evaluates rebalance thresholds, and executes atomic Safe MultiSend transactions.
- **Telegram Bot (`@naraswarmbot`):**
  - `/ranger`: Displays live Market Pressure Gauge, Flow Regime, Volatility Multiplier, Safe Balances, Dynamic Budgets, and active order counts.
  - `/rangerorders`: Granular inspection of all active orders, prices, ticks, balances, and fill status.
  - `/recenter`: Interactive dry-run preview of the 5-tier adaptive bracket around current spot.
  - `/health` & `/status`: Global protocol health and keeper keepalive status.
- **CLI Rebalancer (`scripts/autoRangeManager.ts`):** Allows operators to trigger instant atomic Safe rebalances directly from the terminal with `--execute`.

---

## 6. Position NFTs & Generative On-Chain Art Engine

Direct Engine positions are not ERC-721 tokens. The separately deployed
`NARAPositionNFTV4` (`"NARA Position"`, symbol `NARAPOS`) is an optional path
that creates a clone-owned Engine position. The seven-contract Phase-2 baseline
is source-verified and Safe-finalized but remains `integrationReady: false`.

### 6.1 Clone Account Architecture (EIP-1167)
```
NARAPositionNFTV4 (ERC-721 Collection)
       │ (owns tokenId N)
       ▼
NARAPositionAccountV4 (EIP-1167 Clone) ← Unique contract per tokenId
       │ (holds positionId N in NARAEngine)
       ▼
NARAEngine Position (global positionId)
```
- **Contract-control transfer:** Contract control follows the current ERC-721
  owner; no legal property characterization is made. Transferability does not
  establish a buyer, market, liquidity, value, or exit.
- **Thin Proxy Security:** Clone accounts only accept calls from the NFT factory (`onlyFactory`).
- **Claim Fees:** Configurable wrapper-level fees (up to 10% hard cap) on NARA and bribe tokens. ETH claims bypass wrapper fees. Direct EOA locks bypass NFT wrapper fees entirely.

### 6.2 Generative On-Chain SVG Renderer (`NARAPositionRendererV9.sol`)
Renders 100% on-chain vector art and JSON metadata without external IPFS/HTTP dependencies:
- **Modular Art Architecture:** `NARAArtDefsPlateV5`, `NARAArtCorePlateV5`, `NARAArtMetadataV5`, `NARAArtCollectionBannerV4`.
- **Mint-Fixed Deterministic Seeds & Calibrated Physical Alloys:**
  - 👑 **24K Gilded Gold (#1 Apex Grail · 1.0% - 6.5%):** Mirror-polished molten 24K bullion with 360° omnidirectional solar corona (`dx="0" dy="0" stdDeviation="22"` halo and `#goldOmniShine` ambient bloom).
  - 🌌 **Forged Damascus Meteorite (#2 Legendary · 4.0% - 14.5%):** Celestial quantum-blue acid-etched meteorite steel.
  - 🔮 **Obsidian Void (#3 Rare · 15.0% - 22.0%):** Imperial Royal Amethyst Purple (`#C084FC`, `#7E22CE`) with zero red.
  - 🟢 **Cybernetic Emerald (#4 Uncommon · 30.0% - 35.0%):** Precision emerald telemetry.
  - 🪙 **Titanium Slate (#5 Common Baseline · 50.0% - 24.0%):** Grade-5 aerospace titanium.
- **Grandfathering Invariant:** Tokens #1–#47 maintain their immutable Gen-0 rolled alloy identities (Tokens #10 & #27 remain 24K Gold Apex Grails). Tokens #48+ roll against the strictly calibrated Vector 1 probability matrix.
- **Continuous Quadratic Multipliers ($1.00\text{X} \to 4.00\text{X}$):** Driven by duration epochs up to 365 days max.
- **Renderer content invariant:** The renderer encodes realized historical facts
  and provenance. It does not display projected returns, estimated APY, or
  speculative rarity; this technical rule is not a legal-compliance claim.

### 6.3 Position Accounting and Multiplier Bounds

The NFT controls a clone account that owns the underlying Engine position. The
deployed supported reward rails are variable NARA emissions and contributed
native ETH; amounts can be zero. Generic Engine ERC-20 notification is
prohibited. Genesis token/ETH claim functions describe future source behavior
and are unavailable without a separately deployed and bound Genesis
distributor.

Duration affects accounting weight. The deployed parameter set and source-level
ceilings are technical inputs, not return multipliers, APR/APY forecasts, or
promises. The NFT, clone account, and Engine have distinct custody and control
relationships that must be shown factually; this document makes no legal
characterization of them.

### 6.4 The NFT Position Shield & Off-DEX Operative Architecture

The 3-tier architecture (`NARAEngine` $\to$ `NARAPositionAccountV4` clone $\to$ `NARAPositionNFTV4`) structurally decouples **ERC-20 token custody and reward streams from wallet identity**. Because locked tokens remain anchored inside the Engine contract, ownership of an active, yield-bearing capital position transfers via standard ERC-721 mechanisms without DEX interaction.

```
[ Traditional DEX Flow ]
User Swap ──> Uniswap Mempool ──> MEV Sandwich Bots ──> Copy-Trading Scrapers ──> Chart Impact / Doxxed Link

[ NARA Position Shield Flow ]
Owner Transfer ──> ERC-721 Transfer(from, to, tokenId) ──> Zero Swap Logs ──> Zero Spot Impact ──> Invisible to DEX Bots
                                  │
                                  └──> Fresh Wallet calls claimRewards() ──> Receives Native Gas ETH + NARA off-DEX
```

#### 6.4.1 Architectural Decoupling & Zero DEX Footprint
- **Zero Market Impact & Invisible Transfer:** Trading or transferring ERC-20 tokens on Uniswap emits `Swap` events and moves spot price. Transferring a Position NFT emits a single standard ERC-721 event (`Transfer(from, to, tokenId)`). Uniswap v4 pool liquidity, spot price, and hook fee curves experience zero change.
- **Off-DEX Self-Funding:** A newly transferred fresh wallet can immediately call [`claimRewards(tokenId, recipient)`](../contracts/v4/NARAPositionNFTV4.sol). In a single transaction, the fresh wallet receives accumulated **native ETH** (for gas) and **NARA tokens** (for operations) directly from contract reserves without buying on an AMM.
- **Anti-MEV Immunity:** Because the position changes hands via NFT transfer or marketplace settlement (Seaport), transactions are completely immune to front-running, sandwich attacks, and LP fee drag.

#### 6.4.2 Primary Operative Applications

| Sector / User | The Problem Without Position NFT | The Position Shield Solution |
| :--- | :--- | :--- |
| **Fresh / Stealth Wallets** | Direct funding from a doxxed main wallet leaves an immutable on-chain trace on block explorers and clustering engines (Bubblemaps, Arkham). | Operator transfers a Position NFT to a fresh wallet. Claiming accumulated rewards funds both gas ETH and operating NARA off-DEX without any fund transfer from the primary wallet. |
| **Devs & Autonomous Bot Runners** | Bots tested on mainnet get detected by mempool monitors; copy-trading bots shadow-buy and front-run test routines. | Fresh bot wallet is provisioned with a Position NFT; it self-funds gas via protocol rewards and executes test transactions with zero wallet history or copy-bot tracking. |
| **KOL & Team Allocations** | Liquid token transfers create visible "kabal" wallet clusters on Bubblemaps and risk immediate listing sell pressure. | Allocations are distributed as time-locked Position NFTs. Capital remains locked in the Engine, holders earn continuous 15-minute pulse rewards, and spot liquidity is protected. |
| **Third-Party & MemeFi Launches** | Block-0 MEV sniper bots drain initial AMM liquidity before community participants can enter, followed by immediate chart dumps. | External projects or future launches can adopt NARA's bond/NFT architecture: early allocations distribute as time-locked Position NFTs ([`NARABondDepositoryV4NFT.sol`](contracts/v4/NARABondDepositoryV4NFT.sol)). Tokens are anchored in vault positions at genesis, bypassing Block-0 sniper extraction entirely. |

#### 6.4.3 Operational Invariants & OpSec Guidelines
- **The Broken-Link Rule:** To maintain unlinkability between primary and operative wallets, initial gas for the recipient wallet should be funded via an exchange hot-wallet pool (CEX) or claimed directly via protocol methods, never via a direct EOA-to-EOA transfer from a doxxed source.
- **Technical & Compliance Boundary:** Position NFTs are on-chain bearer yield instruments and locked accounting positions. They do not utilize zero-knowledge obfuscation, cryptographic ring signatures, or transaction mixing pools, and must not be characterized as an anonymity tool or mixer.

#### 6.4.4 Competitive Landscape & The "Third Dimension" Launch Paradigm

Modern Web3 token launches suffer from a structural binary limitation that predatory MEV searchers and snipers exploit:

```
[ Current Web3 Paradigm: The Broken Binary ]
       ┌─────────────────────────────┐
       │     TOKEN DISTRIBUTION      │
       └──────────────┬──────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
1. 100% LIQUID              2. 100% FROZEN
   - Snipers corner Block 0     - "Dead capital" (0% yield)
   - Whales dump at Block 1     - Illiquid lockup friction
   - Bubblemaps "kabal" panic   - Zero incentive to hold
```

| Existing Launch / Vesting Model | Industry Examples | Operational Mechanics | Structural Failure Point |
| :--- | :--- | :--- | :--- |
| **Bonding Curves** | pump.fun, Moonshot, Clanker | Swaps on curve until target $\to$ graduates to AMM pool. | Block-0 snipers buy early curve, dev dumps post-graduation; average token lifespan < 1 hour. |
| **Traditional Launchpads** | Fjord Foundry, PinkSale, Seedify | Whitelist/presale deposits; liquid ERC-20 airdropped/claimed at TGE. | Claim-and-dump rush: early whales race to market-sell into the pool, crashing spot price. |
| **Vesting Platforms** | Sablier, Hedgey, Streamflow | Linear token stream into recipient wallets over time. | Tokens sit completely idle (zero yield); vesting wallets are permanently doxxed on Bubblemaps. |
| **Pre-Market Escrows** | Whales Market | P2P collateral escrow for pre-TGE allocations. | Off-chain settlement friction, zero protocol cashflow, and zero on-chain composability. |

**The NARA "Third Dimension" Solution:**  
Instead of forcing token distribution into liquid dumping or frozen dead capital, NARA's Position NFT architecture introduces three simultaneous properties:
1. **Zero Spot Dump:** 100% of distributed tokens remain locked inside the Engine; zero loose ERC-20 tokens circulate to dump on DEX spot pools.
2. **Active Cash Flow:** Position NFTs continuously capture and distribute 15-minute network reward pulses (native ETH and token emissions) while locked.
3. **Frictionless Bearer Exit:** If an allocator needs early liquidity, they sell the Position NFT on secondary marketplaces (OpenSea / Seaport). The underlying token never hits the Uniswap spot pool, preventing chart slippage.

#### 6.4.5 Shielded Launch Archetypes & Ecosystem Models

```
                    ┌────────────────────────────────────────────────────────┐
                    │               NARA SHIELDED LAUNCH ENGINE              │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
         ┌───────────────────┬─────────────────┴─────────────────┬───────────────────┐
         ▼                   ▼                                   ▼                   ▼
1. Anti-Sniper Fair  2. "Clean Bubblemaps"               3. Sovereign Launch  4. Stealth Bot &
   Launchpad (MemeFi)   KOL / Angel Syndicate               as-a-Service         Quant Sandbox
```

1. **Anti-Sniper Fair Launchpad (MemeFi & New Protocols):**
   - Early participants deposit ETH into a Bond Depository ([`NARABondDepositoryV4NFT.sol`](contracts/v4/NARABondDepositoryV4NFT.sol)) and receive time-locked Position NFTs (e.g. 30, 90, or 180 days).
   - The team pairs raised ETH into a Uniswap v4 pool.
   - Snipers in Block 0 cannot buy the community's allocation because it was minted off-AMM. Community members cannot dump on the chart because tokens are locked in the Engine. AMM swap fees continuously stream back to NFT holders as real ETH dividends.
2. **"Clean Bubblemaps" KOL & Angel Syndicate:**
   - Private round and influencer allocations are minted as Vested Position NFTs instead of liquid tokens.
   - Eliminates suspicious multi-wallet clusters on Bubblemaps and prevents the "influencer dump at listing" meta.
   - Promoters earn ongoing pulse cashflow while holding, aligning long-term incentives.
3. **Sovereign Launch-as-a-Service (The NARA Dual-Flywheel):**
   - Third-party projects launch using NARA's open-source Position & Bond contracts.
   - Launching projects lock $NARA as collateral or pair their token against $NARA in Uniswap v4 pools.
   - A percentage fee from third-party bond raises routes into the NARA Treasury Safe (POL backing) and NARA Engine active cells (ecosystem yield).
4. **Stealth Operations & Quant Sandboxing:**
   - Automated market makers and quant teams provision dedicated Position NFTs to fresh burner wallets.
   - Calling `claimRewards()` self-funds gas ETH and operating inventory directly from contract yield, operating with zero on-chain funding links to parent treasuries.

#### 6.4.6 Component Readiness Matrix

| Architecture Component | Contract Implementation | Base Mainnet Deployment Status | Launchpad Reusability |
| :--- | :--- | :--- | :--- |
| **Position NFT & Proxy Clones** | [`NARAPositionNFTV4.sol`](contracts/v4/NARAPositionNFTV4.sol) | **Deployed & Verified** (`0x01D3...52b`) | **100% Ready:** Can mint positions for any recipient with configurable lock horizons. |
| **Bond Depository Engine** | [`NARABondDepositoryV4NFT.sol`](contracts/v4/NARABondDepositoryV4NFT.sol) | **Source Complete** in `contracts/v4/` | **Ready:** Handles ETH deposit $\to$ token lock $\to$ NFT mint $\to$ dual ETH split (Rewards + Treasury). |
| **Fractional Liquidity Factory** | [`NARAFractionalPositionFactoryV4.sol`](contracts/v4/composability/NARAFractionalPositionFactoryV4.sol) | **Source Complete** in `contracts/v4/` | **Ready:** Allows Position NFT holders to fractionalize large positions into tradable ERC-20 slices. |
| **Anti-Sniper Dynamic Hook** | [`NARALiquidityGrowthHook.sol`](contracts/v4/NARALiquidityGrowthHook.sol) | **Deployed & Verified** | **Ready:** Dynamic fee curves up to 20.00% cap penalizing rapid block-0 sniper flow. |
| **Autonomous Range Rebalancer** | [`NARATreasuryRangeManagerV1.sol`](contracts/v4/periphery/NARATreasuryRangeManagerV1.sol) | **Deployed & Verified** (`0xd58a...a69C`) | **Ready:** Safe 1.4.1 EIP-712 atomic 4-band buy floor and 4-band sell resistance. |

---

---

## 7. Bond Markets & Genesis Reward Distribution

### 7.1 Bond Depository Source (`NARABondDepositoryV4NFT.sol`)
- **Source mechanism:** ETH input, bounded signed quote, NARA locked in the
  Engine, and a Genesis Position NFT delivered to the recipient. This is not
  deployed or offered.
- **Fixed-Price Model:** Admin-set fixed price with 24-hour change delay (`MIN_PRICE_DELAY = 1 day`) and 48-hour expiration (`MAX_TERMS_AGE = 2 days`).
- **Parameter cap:** Source caps the quote discount at 30%
  (`MAX_DISCOUNT_BPS = 3,000`); a cap does not make terms safe or suitable.
- **ETH Routing Split (`rewardSplitWad`):** Fully configurable from `0%` to `100%` (`MAX_REWARD_SPLIT_WAD = 1e18`). Default is `0.50` (50% to `NARAEngine.notifyEthRewards()`, 50% to Treasury). Can be configured to 100% Treasury / 0% Lockers or 100% Lockers / 0% Treasury depending on capital requirements.
- **Inventory sourcing:** Source can pull NARA from `NARABondVaultV4`; no
  deployed, funded reserve is claimed here.

### 7.2 Genesis Reward Distributor Source (`NARAGenesisRewardDistributorV4.sol`)
- Undeployed parallel accounting source for Genesis NFT holders.
- **Reward-weight parameter:** source bound up to $5.0\times$
  (`MAX_GENESIS_REWARD_MULTIPLIER_BPS = 50,000`); this is not a return claim.
- **Genesis Reward Weight:** $\text{Weight} = \text{Amount} \times \text{Multiplier}$.
- **Eternal Genesis Positions:** Source does not allow the normal unlock path.
  After maturity, `burnEternalGenesis(tokenId)` attempts to remove Genesis
  reward weight and release the recorded NARA amount when contract conditions
  pass; execution, token value, and recovery are not guaranteed.

### 7.3 Bond and Genesis Availability Boundary

Bond, Genesis distributor, and Genesis Vault routes are source-level future
components. They are not deployed, funded, opened, marketed, or available.
Price scenarios, valuation targets, projected proceeds, returns, distributions,
and market-impact claims are intentionally excluded because they are not
verified current facts.

Any future activation requires a protected protocol release, verified manifests
and bindings, security and economic review, explicit human approval, and written
jurisdiction-specific legal review of terms, audience, disclosures, marketing,
and transaction journey. No current document authorizes a bond sale or a switch
to `Genesis` or `GenesisSplit`.

---

## 8. Composability Layer (stNARA, SY-stNARA, Fractional Positions)

Located in `contracts/v4/composability/`:

> **Source only.** These components are not deployed, integrated, offered, or
> publicly available. The following bullets describe conditional source
> behavior, not a product commitment.

### 8.1 Liquid Staking (`NARAStakingPoolV4.sol` / `stNARA`)
- ERC-4626 style liquid staking pool.
- If deployed and approved, source can aggregate NARA deposits and create
  maximum-duration Engine positions.
- **Queued Redemptions:** source queues redemption claims until recorded liquid
  NARA is available; execution and token value are not guaranteed.
- **Reward accounting:** source contains internal indexes for supported claimed
  amounts; no amount or distribution is promised.

### 8.2 Pendle Standardized Yield (`NARAStakingPoolSYV4.sol` / `SY-stNARA`)
- Implements the Pendle Standardized Yield (SY) interface for `stNARA`.
- Implements an SY-compatible source interface; no Pendle PT/YT market,
  liquidity, integration, or yield is deployed or guaranteed.

### 8.3 Fractional Positions (`NARAFractionalPositionFactoryV4.sol` & `NARAFractionalPositionV4.sol`)
- Allows locking a single `NARAPositionNFTV4` into a smart vault and issuing 1,000,000 fractional ERC-20 tokens.
- Source produces transferable ERC-20 units and pro-rata accounting. No DEX
  market, buyer, liquidity, token value, reward, principal recovery, or exit is
  guaranteed.

---

## 9. NARA Category Baskets (Foundry Architecture & Adapters)

Located in `nara-category-baskets-v1/` (Foundry build system).

> **Source and preview only.** Basket managers are not deployed and public
> purchases are unavailable. Current launch design accepts USDC entry only.

### 9.1 Immutable Basket Position Manager (`NARAImmutableBasketPositionManagerV1.sol`)
- ERC-721 tokenized basket positions.
- If deployed and activated, source accepts USDC and constructs a defined
  portfolio in one transaction; WETH entry is not in the current launch design.
- **Required Asset Anchor:** **$NARA is mandatory in every basket** with a protocol-enforced minimum weight.
- **Four Canonical Categories:**
  1. **CORE:** Foundation assets ($NARA, WETH, cbBTC).
  2. **AI:** Artificial intelligence category tokens.
  3. **FINANCE:** Decentralized finance tokens.
  4. **CULTURE:** Community and cultural ecosystem tokens.
- **Streaming Holding Fees:** Linear time-based holding fees collected on position interaction (`holdingFeeBps \le 200` BPS/yr).
- **Source-level referral fee-share parameter:** `referralShareBps \le 5,000`
  BPS; no referral program is deployed or offered.
- **Contract-mediated exits:** source exposes `sell` (swap back to payment
  token) and `withdrawUnderlying` (receive portfolio tokens directly). Custody,
  liquidity, adapter, slippage, and deployment state must be disclosed; no
  immediate or complete exit is guaranteed.

### 9.2 DEX Swap Adapters (`src/adapters/`)
Modular swap adapters implementing `INARABasketSwapAdapterV1`:
- `UniswapV4BasketAdapterV1.sol`: Routes swaps through the canonical NARA Uniswap v4 hook pool via Universal Router.
- `UniswapV3BasketAdapterV1.sol`: Uniswap v3 single-hop / multi-hop adapter.
- `AerodromeBasketAdapterV1.sol`: Aerodrome v2 AMM pools on Base.
- `AerodromeSlipstreamBasketAdapterV1.sol`: Aerodrome Slipstream concentrated liquidity CL pools.
- `PancakeV3BasketAdapterV1.sol`: PancakeSwap v3 CL pools.

---

## 10. Swarm Monitor & Real-Time Indexer (Ponder)

Located in `nara-swarm-monitor/`. Powered by Ponder framework for real-time Base event indexing.

### Relational Schema Tables (`ponder.schema.ts`)
- **`wallets`:** Address tracking, conviction scores, risk levels, first seen blocks.
- **`transactions` & `erc20_transfers`:** Full execution traces, gas profiling, transfer logs.
- **`locks` & `claims`:** Position lifecycle, activation tracking, historical NARA/ETH/token reward distributions.
- **`nfts` & `nft_transfers`:** Token ownership, Genesis metadata, realized tier tracking.
- **`liquidity_events`:** Uniswap v4 mint/burn/modify liquidity events.
- **`hook_fee_events` & `hook_flow_blocks`:** Detailed per-block pressure analysis, marginal vs effective fees, cumulative flow tracking.
- **`compounder_events` & `compounder_banks`:** Realized POL additions, banked surplus tracking.
- **`engine_epoch_snapshots`:** On-chain epoch state, WLS, stress index, beta, horizon, base emission.
- **`basket_positions` & `basket_swaps`:** Basket purchases, adapter routing, holding fee accrual, redemptions.
- **`alerts` & `protocol_health`:** Automated triggers for epoch delays, whale movements, abnormal slippage, and contract state divergence.

---

## 11. Frontend Ecosystem & Design Systems

### 11.1 Publishable Basket App (`nara-category-baskets-v1/app/`)
- **Stack:** React 19, Vite, Tailwind CSS, Cloudflare Pages & Workers.
- **Visual Design Rules (`DESIGN.md`):**
  - **Fonts:** `Satoshi` (headings) / `Inter` (UI body) / `IBM Plex Mono` (numbers & hashes only).
  - **Accent Color:** `#0000FF` Base Blue (Never `#1877f2` or generic purple).
  - **Token Tickers:** Canonical `$NARA` branding.
  - **Token Rails:** Text rails (`$NARA · WETH · cbBTC`), no rainbow dot legends.
  - **Neutral Badges:** Clean monochrome badges, no blue/purple/gold gamified tiers.

### 11.2 Neutral Action Hierarchy (`docs/UI_UX_NEUTRAL_ACTION_HIERARCHY.md`)
**Mandatory Rule for all Web3/Financial UIs:**
> **"Do not decide the asset for the user. Decide the navigation for the user."**

- **Guided Flow:** Connect Wallet $\to$ View Products $\to$ Preview Selected $\to$ Review Terms/Fees/Risks $\to$ Confirm Self-Directed Transaction.
- **Equal Visual Weight:** Comparable cards must have identical layout and visual weight.
- **Banned Promotional Clichés:** Prohibited terms include `Recommended`, `Best`, `Safest`, `Trending`, `Guaranteed APY`, `Low Risk`, `You should buy this`.
- **Pre-Transaction Review:** Must explicitly display asset list, weights, protocol fees, slippage estimates, execution route, exit paths, and risk notices.

### 11.3 Degen Board System (`apps/nara-lockboard/`)
- **Parchment Light Theme:** `--bg: #f7f2e8`, `--text: #191612`, `--accent: #1877f2`.
- **Typography:** `JetBrains Mono` everywhere.
- **Prefix:** `nb-` class naming convention (`nb-shell`, `nb-slot`, `nb-board-wrap`).
- **Epoch Backlog Guard:** Apps must inspect `currentEpoch` vs `epochState.epoch`. If backlog $> 0$, disable mutating actions and show an explicit **Sync Epoch** button.

### 11.4 Official NARA Brand Identity, Logo Standards & Hosted Asset Registry

#### Canonical Master Asset Locations
- **Desktop Master Branding Suite:** `C:\Users\linas\Desktop\NARA_Branding_Package\`
  - Master Logo: `07_HighRes_Masters_and_Logos\nara-logo-white.png` (1024×1024, Dual Concentric Radar Rings + 15-Notch Epoch Dial + Monolithic Architectural N on solid `#000000` deep black canvas).
  - Token Icons: `05_Token_Icons_DEX_and_Trackers\` (all standard sizes from 128px to 1024px).
  - Web & App Icons: `06_Web_and_App_Icons\` (`favicon.ico`, `apple-touch-icon_180x180.png`, web favicons).
  - Community & DEX Headers: `01_DexScreener_and_DEX_Banners\`, `02_Twitter_X_Assets\`, `03_Telegram_Assets\`, `04_Discord_Assets\`.
- **Authoritative Repository Public Assets:** `tools/nara-landing/public/`
  - Canonical files: `nara_token_128.png`, `nara_token_200.png`, `nara_token_256.png`, `nara_token_512.png`, `nara-logo-white.png`.

#### Where It Is Hosted (Direct Permanent Raw Links & CDN Routing)
All official token icons are rendered on a **solid deep black `#000000` square canvas** with zero transparent corners to completely eliminate white-box/border artifacts in Chromium browsers and tracker interfaces:

| Target Platform / Form | Required Size | Asset Purpose | Permanent Raw HTTPS Link | Production Cloudflare URL |
| :--- | :---: | :--- | :--- | :--- |
| **BaseScan Explorer** | `128x128` | Token contract verification & explorer avatar | `https://files.catbox.moe/snrc7s.png` | `https://naraprotocol.com/nara_token_128.png` |
| **CoinGecko / CoinMarketCap** | `200x200` | Listing submission form token icon | `https://files.catbox.moe/f9xge7.png` | `https://naraprotocol.com/nara_token_200.png` |
| **DexScreener / Uniswap / Wallets** | `256x256` | DEX profile update, Uniswap tokenlist, TrustWallet | `https://files.catbox.moe/b16drt.png` | `https://naraprotocol.com/nara_token_256.png` |
| **Telegram / Discord / Channels** | `512x512` | Official announcements, group avatar, Discord server | `https://files.catbox.moe/f5tan3.png` | `https://naraprotocol.com/nara_token_512.png` |
| **Master Brand Emblem** | `1024x1024` | Master high-res artwork & web app display | `https://files.catbox.moe/4v6oup.png` | `https://naraprotocol.com/nara-logo-white.png` |

#### Mandatory Brand & Icon Design Rules
1. **Full-Bleed Solid Black Canvas (`#000000`):** Token listing icons must NEVER have transparent outer corners. When platforms mask the icon with `border-radius: 50%`, the circle is cleanly carved out of solid black. Transparent corners cause Chromium and light-themed dashboards to render an ugly white square around the emblem.
2. **Insignia Symbolism:**
   - **Outer Radar Ring & 15-Notch Epoch Dial:** Encodes the on-chain 15-minute engine epoch cadence of the NARA Engine (`NARAEngine.sol`).
   - **Monolithic Architectural "N":** Pure white (`#FFFFFF`) central block letterform symbolizing structural resilience and immutable store of value.
3. **Core Brand Color Palette:**
   - **Primary Substrate:** Deep Black (`#000000`) for token icons, dark interfaces, and brand emblems; Warm Ivory (`#FAF7EF`) for basket web dApp.
   - **Primary Mark:** Pure White (`#FFFFFF`).
   - **Primary Action Accent:** Base Blue (`#0000FF`) for CTAs, active highlights, and canonical NARA allocation rails.

---

## 12. Operations, Keepers & Multisig Governance

### 12.1 Production Custody Safe
- **Production Admin Safe Address:** `0xd65c0e390Dc187A22c52c03816591CC736C0D755` (Base Mainnet).
- **Treasury Address:** `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`.
- Holds ownership of `NARALiquidityGrowthHook`, `NARALiquidityGrowthVault`, `NARALiquidityCompounderV4`, `Create2HookDeployer`, and seed LP NFT `2898124`.

### 12.2 GitHub Operational Keepers
- **`v4-epoch-maintainer.yml` (ACTIVE):**
  - Schedule: `7 * * * *` (Hourly at minute 7, optimized for 75% keeper gas savings by batching up to 4 epochs per transaction).
  - Dedicated Gas-Only Key: `0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD`.
  - Operations: Calls `advanceEpochs(uint256)` (bounded routine), verifies runtime bytecode hashes against the pinned production manifest, and pings the external heartbeat monitor.
  - Contract JIT Invariant: `NARAEngine.sol` maintains `MAX_JIT_ADVANCE = 8` (2-hour buffer); active user interactions settle pending epochs instantly without delay or reward loss.
  - Monitoring: Telegram `/health` reports `🟢 Synchronized (GREEN)` for backlogs $\le 4$ epochs (the routine hourly window).
- **`v4-liquidity-maintainer.yml` (ACTIVE):**
  - Schedule: `17,47 * * * *`.
  - Dedicated Gas-Only Key: `0x0f8ADa55B394E58e9BC667c23a1EEcED12216272`.
  - Operations: Runs the bounded, deployment-bound `compoundAll()` policy only
    when its enable gate, token-use caps, pinned price guard, runtime checks,
    and trigger conditions pass; otherwise emits the required idle heartbeat.
  - Do not reuse or broaden either keeper.

### 12.3 Treasury Range Settler Service (`services/v4-treasury-range-settler`)
- **Role:** Autonomous 24/7 terminal settlement daemon for `NARATreasuryRangeManagerV1` (`0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C`).
- **Hosting:** Railway (Project `glistening-peace`, Service `nara_protocol_v4`, Instance `settler-railway-primary`).
- **Settler Keeper Wallet:** `0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7` (gas-only execution).
- **Execution Cadence:** 15-second polling sweeps and WebSocket `Swap` event triggers; 5-minute full reconciliation sweep.
- **Safe Custody Invariant:**
  - Protocol 2-of-3 Safe: `0xd65c0e390Dc187A22c52c03816591CC736C0D755` (Owners: `0xfe3A8678...`, `0xC019Dc...`, `0x9c61175b...` as of 2026-09-11 nonces 48 & 49).
  - Dedicated Treasury Range Safe: `0x5050BC6dc3E07313D52D05cecD53f727D6CDa245` (1-of-1, owner `0xfe3A8678...`).
- **Verification Binding:** Every sweep executes `assertBindings` verifying Safe runtime hashes, owners, singleton, and Circle USDC dependency health.
- **Settler Alert Diagnostics:**
  - If a Telegram alert fires (`[SETTLER ALERT: <REASON>]`):
    1. Inspect logs: `railway logs -n 25`.
    2. If `PRODUCTION_SAFE_OWNER_SET_MISMATCH`: the multisig owners rotated on Base mainnet. Update `NARA_PRODUCTION_SAFE_OWNERS` in `scripts/lib/v4SafeEvidence.ts` and `docs/NARA_V4_SAFE_CUSTODY_HANDOFF.md`.
    3. Verify tests: `npm run test:treasury-range-settler:v4` (35 tests).
    4. Deploy: in `.worktrees/nara-treasury-range-packet-20260831-a776`, run `railway up -s nara_protocol_v4 -e production -d`.
    5. Verify: `railway logs -n 20` must report `event="sweep_complete" count=15`.

---

## 13. Cross-Repository Release Protocol & State Gates

Defined at workspace level in
`../docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md`; this repository's tracked
entry points are `AGENTS.md` and `docs/REPOSITORY_MAINTENANCE.md`.

### Single Source of Truth Authority Matrix
| Repository | Authority Domain |
|---|---|
| `nara-protocol-hardhat/` | Fixed-v4 contracts, ABIs, deploy scripts, protocol manifests. Origin for all core changes. |
| `nara-category-baskets-v1/` | Basket contracts, adapters, basket manifests, publishable basket app. |
| `nara-swarm-monitor/` | Indexer schemas, event handlers, monitoring alerts, read-only analytics. |
| `nara_protocol_public/` | Public documentation, beginner guides, verified deployment packages. |

### Strict State Gate Sequence
$$\text{implemented} \longrightarrow \text{tested} \longrightarrow \text{merged} \longrightarrow \text{deployed} \longrightarrow \text{configured} \longrightarrow \text{indexed} \longrightarrow \text{activated} \longrightarrow \text{available}$$
- Qualify `live` precisely. `Technical live testing` means the named deployed
  contracts or pool are being observed with real assets; it does not mean
  every product or interface is available, production-ready, audited, safe,
  legally approved, or available in any jurisdiction.
- Never update downstream consumers from uncommitted branches, local edits, or planned addresses.

---

## 14. Codex Solidity Audit Pipeline

Located in `.codex/audit/`. Workspace serves as a dedicated security audit hub.

### Pipeline Stages
1. **`01-recon.md`:** Codebase topology, compilers, libraries, attack surface scan.
2. **`02-threat-model.md`:** Trust boundaries, actor privileges, economic flow diagrams.
3. **Specialist Waves (Cap: 6 parallel specialists):**
   - **Wave 1:** Reentrancy, Access Control, Arithmetic/Accounting, External Integrations, MEV/Economic, DoS/Griefing.
   - **Wave 2:** Upgradeability, Signatures/Replay, Protocol-Specific Logic.
4. **`12-confirmed.json` (Critic):** Deduplicates, tests validity, rejects false positives.
5. **`13-pocs/` (PoC Writer):** Generates executable Foundry proof-of-concept tests.
6. **`14-final-report.md` (Reporter):** Executive summary, categorized vulnerability register with `file:line` citations and remediations.

---

## 15. Master Deployment Registry & Verified Addresses

*Network: Base Mainnet (`chainId: 8453`)*

| Contract / Component | Verified Address | Status | Notes |
|---|---|---|---|
| **`NARALauncher`** | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` | Verified | Deploys paired Token + Engine |
| **`NARAToken`** | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` | Verified | Symbol: `NARA`, 1M Fixed Supply |
| **`NARAEngine`** | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` | Verified | Core Epoch Allocation Engine |
| **`NARARewardReserve`** | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` | Verified | Funded with `650,000 NARA` |
| **`NARALiquidityGrowthVault`** | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` | Verified | Safe-owned; Compounder frozen |
| **`Create2HookDeployer`** | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` | Verified | Safe-owned CREATE2 factory |
| **`NARALiquidityGrowthHook`** | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` | Verified | Uniswap v4 Hook (bits `0x2088`) |
| **`NARALiquidityCompounderV4`** | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` | Verified | Owns POL LP NFT `2898486` |
| **`NARAArtDefsPlateV5`** | `0xECdaf4B930cec3293479de0404B72282c7Bf9Aba` | Verified | 360° Omnidirectional Apex Gold Halo & Core Ambient Bloom |
| **`NARAArtCorePlateV5`** | `0x3Ae72d3ef410AE9baE795Cf9a027ef9fDcBf9996` | Verified | Generative Swiss Chronometer Engine (5 Physical Alloys) |
| **`NARAArtMetadataV5`** | `0xe644Be90A7B46EE146be0C1Eb79Ee47C9cf700d9` | Verified | OpenSea JSON attributes & Gen-0 Grandfathering (#1-#47) |
| **`NARAArtCollectionBannerV4`** | `0xc528A95212a9f9BD69B056fe89119F9Aa0bBb09a` | Verified | Collection-level contract URI banner |
| **`NARAPositionRendererV9`** | `0xBe25F3cE387e01cAe5dA7d7F0bc2FdE72c244a98` | Verified & Active | Master 3-Vector & Ascension Renderer (Activated block 51159172) |
| **`NARAPositionAccountV4`** | `0x3a8c9cA4f95E94751774810B33caF01bb992A55F` | Verified | Position NFT Phase-2 implementation (ERC-6551 TBA) |
| **`NARAPositionNFTV4`** | `0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b` | Verified & Active | Core Position NFT (Active Renderer: `0xBe25...4a98`). 10% royalty to Treasury |
| **`NARAFleetDeckLensV1`** | `0x4B097067106623185aE32Cd9c2463Bb4143Fb516` | Verified | Fleet synergy read lens |
| **Uniswap v4 Pool ID** | `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464` | Initialized | NARA/USDC 0.30% fee, tick 60 |
| **Seed LP NFT** | `2898124` | Active | Owned by Production Safe |
| **Compounder LP NFT** | `2898486` | Active | Owned by Compounder |
| **Production Safe** | `0xd65c0e390Dc187A22c52c03816591CC736C0D755` | Active | Multi-sig Admin |
| **Treasury Wallet** | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` | Active | Protocol Treasury |
| **Epoch Keeper Address** | `0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD` | Active | Gas-only maintainer key |
| **`NARATreasuryRangeManagerV1`** | `0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C` | Verified & Active | Treasury Range Manager contract (zero token balances held) |
| **Treasury Range Safe** | `0x5050BC6dc3E07313D52D05cecD53f727D6CDa245` | Active | Dedicated 1-of-1 custody Safe for Range orders & settlement |
| **Settler Keeper Key** | `0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7` | Active | Gas-only settler daemon key |

### Non-Contract Production Services

| Service | Deployment evidence | Merge/CI state | Health/availability boundary |
|---|---|---|---|
| **NARA Swarm Monitor** | Railway deployment `393c7901-8b70-4965-9176-bc022bd0a909`, environment `zealous-generosity / production`, runtime commit `38db568f77e5b81f48678b745506300429d6243c`, status `SUCCESS` | Runtime source merged through green protected PR `#27`; activation and knowledge records through green PRs `#28` and `#29` (`e99fdeeb5783a88209a7fceb56ac32ed3f50ec84`) | Process, DB, indexing, and large-buy watcher healthy; Telegram bot listener active |
| **Range Ranger Watcher** | Railway deployment `029268dd-bec3-4de4-b1ec-ed222e9933a7`, environment `zealous-generosity / production`, status `SUCCESS` | Verified via `testRangeRangerRuntime.mjs` (7/7 tests passed), `npm run verify` passed | Autonomous 24/7 rebalancer active; real-time Net Pressure, Volatility, and Dynamic 5-Tier synthesis |
| **Treasury Range Settler** | Railway deployment `cd716ce9-39fb-491b-947b-5cefd1479c2c`, environment `glistening-peace / production`, service `nara_protocol_v4`, status `SUCCESS` | Verified via `npm run test:treasury-range-settler:v4` (35/35 tests passed) | 15-second polling sweeps returning terminal filled profits to Treasury Safe; `assertBindings` clean |

