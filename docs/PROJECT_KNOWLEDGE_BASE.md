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
   - [5.1 Treasury Range Manager Candidate](#51-treasury-range-manager-candidate)
6. [Position NFTs & Generative On-Chain Art Engine](#6-position-nfts--generative-on-chain-art-engine)
7. [Bond Markets & Genesis Reward Distribution](#7-bond-markets--genesis-reward-distribution)
8. [Composability Layer (stNARA, SY-stNARA, Fractional Positions)](#8-composability-layer-stnara-sy-stnara-fractional-positions)
9. [NARA Category Baskets (Foundry Architecture & Adapters)](#9-nara-category-baskets-foundry-architecture--adapters)
10. [Swarm Monitor & Real-Time Indexer (Ponder)](#10-swarm-monitor--real-time-indexer-ponder)
11. [Frontend Ecosystem & Design Systems](#11-frontend-ecosystem--design-systems)
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

### 5.1 Treasury Range Manager Candidate

`NARATreasuryRangeManagerV1.sol` is an implemented and tested, but undeployed,
Safe-bound periphery candidate for tactical one-sided NARA/USDC ranges. It is
strictly separate from permanent POL: it owns only manager-registered tactical
PositionManager NFTs, never changes the Hook/Vault/Compounder, and sends every
settlement or cancellation output directly to the immutable production Safe.

The companion planner reads a pinned PoolManager spot, pool liquidity, active
positions, Hook configuration and pending updates, runtime bindings, and
separate Safe/Treasury balances. It evaluates 21 profile/budget candidates and
selects deterministically only from complete exact-fork evidence. "Optimal"
means best under that tested family and objective function; it is not a market
prediction or profit guarantee. A new snapshot requires a new plan and a new
human-reviewed Safe proposal. The settler never replans or reinvests proceeds.

The 2026-08-30 internal-audit remediation closes all five retained findings:
exact 21-candidate/strict-row evidence, durable signed-nonce lineage, bounded
fatal RPC/sweep deadlines, and Circle USDC implementation/control-state
binding. Strategy schema v2 pins the USDC proxy and implementation hashes,
implementation/admin slots, admin/owner/pauser/blacklister, pause and monitored
blacklist state, plus the code-hash-bound Base Multicall3 reader. Deployment,
order, settlement, and exact rebroadcast paths fail closed before signing on
drift. Cancellation has a clearly labelled exit-only bypass and cannot promise
success under incompatible token behavior. The internal review is not an
independent external audit or security clearance.

At the 2026-08-28 candidate checkpoint, the pinned Base fork was block
`50537172` and the selected candidate was `CONSERVATIVE-100000-NARA` with 12
orders and status `SELECTED_EXECUTION_BLOCKED`. The Safe lacked the required
NARA and 5,000 USDC budget, so no deployment/order packet was authorized. A
fully traversed range becomes Safe-held inventory only in a later settlement
transaction; an actor's same-transaction buy/reverse cannot be intercepted.

Authority and operating documents:

- [`architecture/NARA_TREASURY_RANGE_MANAGER_V1.md`](architecture/NARA_TREASURY_RANGE_MANAGER_V1.md)
- [`security/NARA_TREASURY_RANGE_MANAGER_THREAT_MODEL.md`](security/NARA_TREASURY_RANGE_MANAGER_THREAT_MODEL.md)
- [`security/NARA_TREASURY_RANGE_MANAGER_REMEDIATION_2026-08-30.md`](security/NARA_TREASURY_RANGE_MANAGER_REMEDIATION_2026-08-30.md)
- [`runbooks/NARA_V4_TREASURY_RANGE_SETTLER_RUNBOOK.md`](runbooks/NARA_V4_TREASURY_RANGE_SETTLER_RUNBOOK.md)
- [`releases/NARA-20260828-v4-treasury-range-manager.md`](releases/NARA-20260828-v4-treasury-range-manager.md)

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

### 6.2 Generative On-Chain SVG Renderer (`NARAPositionRendererV5.sol`)
Renders 100% on-chain vector art and JSON metadata without external IPFS/HTTP dependencies:
- **Modular Art Architecture:** `NARAArtMetadataV1`, `NARAArtCorePlateV1`, `NARAArtGenesisPlateV1`, `NARAArtSecurityPrintV1`, `NARAPositionArtV1`.
- **Mint-Fixed Deterministic Seeds:** `keccak256(tokenId, positionId, createdEpoch)` generates 6 unique geometric module compositions (Scar angles, Lattice nodes, Glyph fingerprints).
- **Realized Tier Escalation (Tx-Driven, Cache-Safe):**
  - `New` $\to$ `Activated` $\to$ `Rewarded` $\to$ `One ETH Mark` $\to$ `Apex`.
  - Driven strictly by **realized historical delivered rewards** (`lifetimeEthClaimed`, claim count, extension count).
  - Emits ERC-4906 `MetadataUpdate` on claims and lock extensions.
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

---

## 12. Operations, Keepers & Multisig Governance

### 12.1 Production Custody Safe
- **Production Admin Safe Address:** `0xd65c0e390Dc187A22c52c03816591CC736C0D755` (Base Mainnet).
- **Treasury Address:** `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`.
- Holds ownership of `NARALiquidityGrowthHook`, `NARALiquidityGrowthVault`, `NARALiquidityCompounderV4`, `Create2HookDeployer`, and seed LP NFT `2898124`.

### 12.2 GitHub Operational Keepers
- **`v4-epoch-maintainer.yml` (ACTIVE):**
  - Schedule: `3,18,33,48 * * * *`; Railway fallback at `12,27,42,57`.
  - Dedicated Gas-Only Key: `0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD`.
  - Operations: Calls `advanceEpochs(uint256)` and uses `poke()` where the
    bounded routine requires it, verifies runtime bytecode hashes, and pings the
    external heartbeat monitor.
- **`v4-liquidity-maintainer.yml` (ACTIVE):**
  - Schedule: `17,47 * * * *`.
  - Dedicated Gas-Only Key: `0x0f8ADa55B394E58e9BC667c23a1EEcED12216272`.
  - Operations: Runs the bounded, deployment-bound `compoundAll()` policy only
    when its enable gate, token-use caps, pinned price guard, runtime checks,
    and trigger conditions pass; otherwise emits the required idle heartbeat.
  - Do not reuse or broaden either keeper.

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
| **`NARAArtMetadataV1`** | `0xAE0Da2B2066FF0c1409A2aC4053699E75dd00633` | Verified | Position NFT Phase-2 baseline |
| **`NARAArtSecurityPrintV1`** | `0x0640dd2B545348eC91826ab7c58DD88EcE81f353` | Verified | Position NFT Phase-2 baseline |
| **`NARAArtCorePlateV1`** | `0x476b69f490C17a5500c4Eb9b6cB49302cef4bE4A` | Verified | Position NFT Phase-2 baseline |
| **`NARAArtGenesisPlateV1`** | `0x20520115546c28F99aE581d62935e62D9E8B9022` | Verified | Position NFT Phase-2 baseline; no Genesis distributor binding |
| **`NARAPositionRendererV5`** | `0x607b08365C23a983C542898a79E670e6D4B80673` | Verified | Position NFT Phase-2 baseline |
| **`NARAPositionAccountV4`** | `0x3a8c9cA4f95E94751774810B33caF01bb992A55F` | Verified | Position NFT Phase-2 implementation |
| **`NARAPositionNFTV4`** | `0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC` | Verified and Safe-finalized | Manifest remains `integrationReady: false`; consumers disabled |
| **Uniswap v4 Pool ID** | `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464` | Initialized | NARA/USDC 0.30% fee, tick 60 |
| **Seed LP NFT** | `2898124` | Active | Owned by Production Safe |
| **Compounder LP NFT** | `2898486` | Active | Owned by Compounder |
| **Production Safe** | `0xd65c0e390Dc187A22c52c03816591CC736C0D755` | Active | Multi-sig Admin |
| **Treasury Wallet** | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` | Active | Protocol Treasury |
| **Epoch Keeper Address** | `0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD` | Active | Gas-only maintainer key |
