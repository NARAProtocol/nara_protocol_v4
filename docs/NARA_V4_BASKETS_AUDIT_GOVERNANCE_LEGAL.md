# NARA Baskets — Contract Audit, Governance, and Legal Wording

> **Planning/research document.** Sepolia and external-audit language below is
> superseded for the current launch: verification uses an exact Base-mainnet
> fork, and no independent audit is claimed. This does not waive any current
> technical or manifest gate.

Last updated: 2026-05-28.
Audience: protocol operator, future contributors, legal counsel review.
Scope: `nara-category-baskets-v1/` contracts as of audit date.
Companion: `NARA_V4_BASKETS_LAUNCH_STRATEGY.md`.

Three questions answered here:
1. What do the contracts actually do, who has power, what are the risks
2. Who decides what a basket is, who deploys it, how is curation enforced
3. What language is safe to use publicly and what language exposes the protocol to securities law

---

## Part 1 — Contract Audit

### NARAImmutableBasketPositionManagerV1 (the canonical product)

**Power model**: zero on-chain admin. No owner, no roles, no pause, no upgrade, no sweep, no config mutation. Once deployed, the basket is permanent. Constructor-only configuration.

**Hard caps enforced at construction**:

| Constant | Value | What it caps |
|---|---|---|
| `MAX_FEE_BPS` | 100 | 1% maximum on buy or sell fee |
| `MAX_REQUIRED_ASSET_WEIGHT_BPS` | 5000 | NARA can be required up to 50% max (prevents "100% NARA basket disguised as a sector basket") |
| `MAX_WEIGHT_DEVIATION_BPS` | 1000 | 10% maximum allocation tolerance |
| `MAX_ASSETS` | 20 | Maximum tokens per basket |
| `MAX_PAYMENT_TOKENS` | 8 | Maximum payment-token allowlist |
| `MAX_ADAPTERS` | 16 | Maximum swap-adapter allowlist |

**Invariants the contract enforces** (verified by reading the source):

- Total weight must equal exactly 10,000 bps
- NARA must be present in the basket at or above `minRequiredAssetWeightBps`
- Every swap must consume exactly `amountIn` (`_executeExactInputSwap` checks balance deltas, not adapter return values alone)
- Every transfer must be exact (`_pullExact` / `_sendExact` revert on fee-on-transfer)
- Total of all allocations must equal net input after fee — no slack
- Allocation per asset must be within `maxWeightDeviationBps` of target weight
- Normal receipt sell must drain every non-output basket asset (`UnsoldAsset` revert otherwise)
- Partial sell and partial raw withdrawal can exit selected assets while leaving any broken asset claim in the receipt
- Closed positions cannot be re-sold or re-withdrawn (`closed` flag)
- `withdrawUnderlying` and `withdrawUnderlyingPartial` are callable **only by the literal receipt owner** (the contract disables `approve`/`setApprovalForAll` and requires `msg.sender == ownerOf` — there is no approved-operator path), and are the design replacement for an admin pause
- All external mutators use `ReentrancyGuard`

**Findings**:

| ID | Severity | Issue | Action |
|---|---|---|---|
| F-01 | MEDIUM | A token that becomes fee-on-transfer, paused, blacklisted, or otherwise transfer-blocked can brick exits involving that token. Full `withdrawUnderlying` may revert, but `withdrawUnderlyingPartial` and `sellBasketPartial` can rescue the other selected assets. | Curate assets that have no admin-mutable transfer logic. Keep partial exits in the UI/runbook. Document that the bad token itself may remain untransferable. |
| F-02 | MEDIUM | `requiredAsset` is immutable but the contract does not verify it is actually the canonical NARA token. A rogue deployer could deploy a "NARA Basket" with `requiredAsset = SOMETHING_ELSE`. | Frontend MUST verify `manager.requiredAsset() == NARA_TOKEN_ADDRESS` before listing. See Part 2. |
| F-03 | LOW | Receipt is an ERC-721 but **NOT a standard one**: `approve`/`setApprovalForAll` revert (`ApprovalsDisabled`), so it has **no approved-operator path and is not listable on approval-based marketplaces** (OpenSea etc.). It is still **owner-transferable directly** (`transferFrom` where `msg.sender == owner`), so the bearer-title model holds (Bob receives Alice's receipt → Bob can sell). | Document precisely in user-facing copy: receipt = owner-only title; transfer it by sending it, not by listing it. This is an **immutable** choice — confirm intent before deploy. |
| F-04 | LOW | No on-chain price oracle. `minAmountsOut` is supplied by the caller. Bad quote = bad fill. | Quote builder service is load-bearing. Server must apply conservative slippage. |
| F-05 | LOW | No deadline ceiling. Caller can set arbitrary future deadlines. | UI enforces typical 20-min deadline. Non-exploitable. |
| F-06 | INFO | Buy fee is taken in input token *before* allocation; sell fee is taken in output token *after* swaps. Documented behavior. | Show this clearly in the UI quote breakdown. |
| F-07 | INFO | `_assetIndexPlusOne` uses `+1` to distinguish unset (0) from index 0. Gas-cheap. Correct. | None. |
| F-15 | INFO | The referral guard only ignores `referrer == msg.sender` and `== address(this)`. A buyer can pass `referrer = their-own-second-wallet` and pull-claim `referralShareBps` (e.g. 30%) of their own buy/sell fees. Effective fee is ~that much lower for anyone who self-refers via an alt address. | Accepted design (standard for open referral). Set `referralShareBps` knowing the effective protocol take is `fee × (1 − referralShareBps)` for savvy users; lower the share if that erosion matters. |

**Verdict on the manager**: well-designed. The immutability + full/partial user exit combination removes admin trust while avoiding all-good-assets-being-trapped by one failed component. The one strategic risk is F-02 — the contract enforces *a* required asset, not specifically *the* NARA token. Frontend curation is the load-bearing control.

---

### NARAIndexFeeCollectorV1 (the fee router)

> **⚠️ This subsection describes the SUPERSEDED V1 collector.** The **canonical, launch contract is
> `NARAIndexFeeCollectorV2`** (`src/NARAIndexFeeCollectorV2.sol`). V2 **removes `sweepToken` and
> `sweepETH` entirely** (closing F-08) and has only 3 roles (`DEFAULT_ADMIN`, `SWAPPER`,
> `EXECUTOR_MANAGER`). Tokens can leave V2 **only** through the swap pipeline (output constrained to
> NARA or WETH) → engine. Idle native ETH leaves only via `notifyNativeEth` → engine. V2 also adds
> **`freezeAllowlist()`** — a one-way lock on the executor/selector allowlist. See **F-14** below: V2's
> anti-drain guarantee is only *fully* realized once the allowlist is frozen. The V1 role table /
> F-08…F-12 below are retained as historical context for the retired V1 collector.

| Role | What it can do | Risk if compromised |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Grant/revoke all roles. Call `sweepToken` (non-NARA, non-WETH). Call `sweepETH`. | Drain accumulated USDC/asset fees before swap. Drain idle ETH. **See F-08 below.** |
| `EXECUTOR_MANAGER_ROLE` | Allowlist/revoke executor addresses and 4-byte selectors. | Add a malicious executor or broad selector that lets a swap output be misdirected. **See F-09.** |
| `SWAPPER_ROLE` | Execute fee swaps via `executeFeeSwap`. Push rewards via `depositNaraRewards`, `unwrapWethAndNotifyEth`, `notifyNativeEth`. | Misdirect swap outputs within executor allowlist limits. |
| `REDEEMER_ROLE` | Redeem static-vault fee shares into underlying. | Only matters if static vault path is enabled. |
| `VAULT_MANAGER_ROLE` | Allowlist redeemable vaults. | Only matters if static vault path is enabled. |

**Strong protections already present**:

- Swap output is restricted to NARA or WETH (`_executeSwap` line 184–186)
- Executor + selector double allowlist
- Exact balance-delta accounting
- `sweepToken` cannot remove NARA or WETH (line 162)
- Approval cleared after every swap (`forceApprove(0)`)
- ReentrancyGuard everywhere

**Findings**:

| ID | Severity | Issue | Action |
|---|---|---|---|
| **F-08** | **HIGH (trust)** | `sweepToken(USDC, attacker, balance)` is callable by `DEFAULT_ADMIN_ROLE`. USDC is the actual fee inflow on every basket buy. A malicious admin could drain protocol fees before they swap into NARA/WETH. NARA and WETH are blocked, but USDC is not. | **`ADMIN` MUST be a Safe with timelock.** A 1-of-1 EOA admin = catastrophic single-point-of-failure. Make this a `LAUNCH_RUNBOOK` gate. |
| **F-09** | **HIGH (trust)** | Selector allowlist is load-bearing. If `EXECUTOR_MANAGER_ROLE` allowlists a multicall, batch, or generic-call selector, funds can be drained inside a single swap call. | Selector allowlist must be a multisig action with deliberate review. Document the exact allowed selectors per executor (e.g., Uniswap V3 SwapRouter02 `exactInputSingle` = `0x414bf389`, `exactInput` = `0xc04b8d59`). Never allowlist `multicall`, `aggregate`, `execute`, or proxy entry points. |
| F-10 | MEDIUM | `_executeSwap` accepts `actualIn = 0` (executor takes no input but delivers tokenOut from elsewhere). Not a drain, but weird accounting. | **Fixed in V2** (`if (actualIn == 0) revert ZeroAmount()`). |
| F-11 | MEDIUM | Admin can revoke `SWAPPER_ROLE` from everyone, then sweep accumulated non-reward fees. Fees would never reach lockers. | Same mitigation as F-08 — `ADMIN` must be a Safe with timelock. |
| F-12 | LOW | `notifyNativeEth` and `unwrapWethAndNotifyEth` will revert if engine paused/misbehaving. Fees stuck until engine recovered. | Engine has no pause — non-issue for v4. Document. |
| F-13 | INFO | Anyone can send ETH via `receive()`. Sweep is admin-only. | Expected pattern. None. |
| **F-14** | **MEDIUM (trust, V2)** | V2 removed `sweepToken`, but until `freezeAllowlist()` is called, a key holding **both** `EXECUTOR_MANAGER_ROLE` + `SWAPPER_ROLE` (both granted to `admin` at construction) can allowlist a malicious executor+selector and call `executeFeeSwap` with `minAmountOut ≈ 1`, skimming pre-swap fee tokens (the output-≥-minAmountOut check is set by the same actor). | **Launch gate:** after wiring the legit DEX executors/selectors, call `freezeAllowlist()` (one-way) so no malicious executor can ever be added. Additionally **split the roles**: grant `SWAPPER_ROLE` and `EXECUTOR_MANAGER_ROLE` to different keys. Safe+timelock (A-01) helps but freeze is the definitive fix. |

**Verdict on the fee collector**: well-designed *if* `ADMIN` is a Safe with a timelock. **As an EOA, the fee collector is a custodial honeypot for accumulated USDC fees.** This is the single most important pre-launch action item.

---

### CategoryIndexSuiteV1 (static vault, NOT canonical)

Demoted to optional module per the V1 docs. Not part of the launch surface. Audit deferred unless we decide to enable the static-vault path post-launch.

---

### Adapter interface — `INARABasketSwapAdapterV1`

Adapter is the trust surface for actual DEX execution. The interface is minimal:

```solidity
function swapExactInput(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut,
    bytes calldata data
) external returns (uint256 amountInUsed, uint256 amountOut);
```

**No concrete implementation exists in the repo.** Only the interface. This is a **P0 build item** before launch.

**Adapter design rules** (mandatory):

- Immutable per deployment (no admin, no upgrade)
- Constructor pins the underlying router (e.g., Uniswap V3 `SwapRouter02` on Base)
- `data` parameter is parsed for the specific router (e.g., `(uint24 fee, uint160 sqrtPriceLimitX96)` for Uniswap V3)
- Pull `amountIn` from `msg.sender` with `safeTransferFrom`
- Execute exact-input swap
- Send `tokenOut` back to `msg.sender`
- Return real `(amountInUsed, amountOut)` matching the actual deltas
- Revert if any dust is left behind
- Clear router approval after each swap
- No `payable` (basket manager never sends ETH)
- No fallback / receive

**Launch adapter recommendation**: `UniswapV3BasketAdapterV1` first. Add `AerodromeBasketAdapterV1` and/or `ZeroExBasketAdapterV1` later if quote quality is insufficient.

---

## Part 2 — Who Picks and Builds Baskets

This is where the strategy is decided, not the contract.

### Who can deploy a basket on-chain

**Anyone.** The basket manager has no factory, no permission gate, no registry. Anybody with gas and the right constructor args can deploy a `NARAImmutableBasketPositionManagerV1`.

This is intentional. It's also why the next sentence matters.

### Who can deploy an *official NARA basket*

**Only the protocol operator's deployer wallet.** Officialness is a frontend property, not a contract property. An on-chain basket is "official" if and only if:

1. The frontend at naraprotocol.pro lists it
2. The receipt manager's `requiredAsset` equals the deployed NARA token address
3. The receipt manager's `feeRecipient` equals the deployed `NARAIndexFeeCollectorV1`
4. The receipt manager's adapters are all addresses the protocol has audited and approved
5. The receipt manager's payment-token list is the curated set (USDC for v1)
6. The category, weights, and assets match the published basket spec

The frontend MUST verify all six items on every basket listing. A registry contract is overkill; a hard-coded address list in `apps/nara-baskets/src/shared/baskets.ts` is the right level for v1.

### How a basket is built — the curation process

**Step 1 — Category selection.** Pick a clear, defensible category name. Avoid hype tickers. Example: "Base Ecosystem" not "100x Gems."

**Step 2 — Asset curation.** Apply the hard exclusion list (already in `SECURITY_CHECKLIST.md`):

Reject any token that is:
- Fee-on-transfer (breaks `_sendExact` and `withdrawUnderlying`)
- Rebasing
- Blacklistable by an admin
- Pausable on transfer
- Honeypot (cannot be sold)
- Below $250k pool depth on the dominant Base DEX
- Behind an unverified bridge or wrapper
- Owned by an EOA with admin powers that could mutate transfer logic

For every accepted asset, document:
- Verified Base mainnet address (Basescan source-verified)
- Dominant pool and fee tier
- 30-day average daily volume
- Pool TVL
- Token admin / owner / governance pause function audit
- Bridge or wrapping path (if not native to Base)

**Step 3 — Weights.** Pick weights summing to 10,000 bps. NARA must be at or above the configured minimum. Document the rationale per basket without suitability or risk-tier language.

**Step 4 — Fees.** Fees are configured per basket and shown before confirmation:

| Basket | Buy/Sell fee | Basis |
|---|---|---|
| CORE | configured bps | Documented liquidity and route review |
| AI | configured bps | Documented liquidity and route review |
| FINANCE | configured bps | Documented liquidity and route review |
| CULTURE | configured bps | Documented liquidity and route review |

Hard cap is 100 bps (1%) per side.

**Step 5 — Slippage tolerance.** Set `maxWeightDeviationBps` based on liquidity:

- Set per basket from observed route depth, volatility, and quote precision.
- Do not describe this setting as a user risk tier or suitability label.

**Step 6 — Pre-deploy verification.** Run on Base Sepolia first. Test buy, sell, `withdrawUnderlying` for each asset. Confirm no asset misbehaves.

**Step 7 — Mainnet deploy.** Run `script/CreateReceiptBasketExample.s.sol` with the verified config. Save deployed address to `deployments/baskets-base.json`.

**Step 8 — Frontend listing.** Add the address to `apps/nara-baskets/src/shared/baskets.ts` with the verified config (category, assets, weights, fees, adapter addresses, payment tokens). Frontend reads from this hard-coded list, not from any on-chain registry.

**Step 9 — Public announcement.** Only after the listing is live and tested.

### Curation governance — who decides which baskets exist

For v1 launch: **the protocol operator decides.** No DAO, no committee, no curator role. The operator is accountable for the curation list because the operator controls naraprotocol.pro and signs the deploy transactions.

Post-launch options (not for v1):
- External curators with revenue share (Reserve DTF model)
- Community proposals via on-chain voting (governance token required — NARA does not have one, intentionally)
- Algorithmic baskets (e.g., "top 10 by Base TVL" — requires keeper and oracle)

V1 keeps it simple: a few hand-picked baskets, signed by the operator, listed on the frontend.

### Removing or closing a basket from the official list

The contract is immutable; an on-chain basket cannot be retired. The safer
frontend default is to mark the old manager `exit_only`, not to remove the
address immediately:

- Keep the old manager address visible while users may still hold receipts.
- Disable new buys for that manager.
- Show a factual status banner: "This basket is exit-only. Existing receipts can review available exits."
- Deploy a new manager for any replacement basket instead of mutating the old one.
- Only hide the old manager after there is a separate recovery/history view or no known receipts remain.

Users with existing receipts retain the receipt NFT and can attempt `sellBasket`
to USDC/NARA through any compatible UI, `sellBasketPartial` for selected
routable assets, or full/partial raw withdrawal directly via Basescan. Caveat:
if an underlying token itself stops transferring, becomes fee-on-transfer, or
is paused/blacklisted, the exact-transfer checks can make exits involving that
token revert. Partial exits can rescue the other assets, but cannot force the
bad token contract to transfer. See
`NARA_V4_BASKETS_INCIDENT_RESPONSE_RUNBOOK.md` for the full incident matrix.

---

## Part 3 — Legal Wording

This section is for the operator and any future copywriter. It is not legal advice. **Have a securities lawyer review before public launch.** The notes below identify the obvious traps so legal review is faster and cheaper.

### The core legal framing

NARA Baskets are **not investment products**. They are smart-contract execution tools:

- The user signs a transaction
- A smart contract buys the specified tokens on a DEX
- The user receives an on-chain receipt (NFT) representing exact title to those tokens
- The user can withdraw raw tokens themselves when the underlying ERC20 transfers normally, including selected-asset withdrawal when one component breaks
- No NARA entity holds, manages, or rebalances the assets
- No NARA entity promises any return

This framing is structurally true because:
- The receipt manager has no admin, no rebalance, no manager keys
- The user holds the receipt; transferring it transfers ownership of the tokens
- Full and partial raw withdrawal do not depend on NARA's frontend, manager keys, or DEX liquidity; they still depend on the selected underlying ERC20 tokens transferring normally

**Howey test self-assessment** (operator review):

| Prong | NARA Baskets posture | Comment |
|---|---|---|
| Investment of money | Yes (USDC) | Cannot avoid this prong. |
| Common enterprise | **Weak — receipt-by-receipt isolation, no pooled NAV** | Each receipt owns specific tokens, not a share of a pool. This is the strongest defense. |
| Expectation of profit | Depends on marketing | **Marketing language is the operator-controllable factor.** Bad copy here is what creates exposure. |
| From efforts of others | **Weak — no manager, no rebalance, immutable composition** | NARA picks composition once, at deploy. There are no "efforts" after that. |

The combination — receipt-based, immutable, withdrawable, manager-less — makes the legal posture defensible. The operator must not undo this with marketing copy that re-introduces the appearance of a managed fund.

### Words to BAN in public materials

These words pull the product toward the securities-law side of the line. Do not use them in landing pages, social media, analyst posts, or product copy.

| Banned | Why | Replace with |
|---|---|---|
| **invest / investment / investor** | Direct Howey trigger. | "buy", "user", "buyer" |
| **fund / fund manager** | Suggests pooled vehicle with a manager. | "basket", "set of tokens", "smart contract" |
| **index fund / ETF** | Regulated terms. Trademark and securities issues. | "category basket", "themed token set" |
| **portfolio / managed portfolio** | Suggests active management. | "basket composition", "configured tokens" |
| **returns / earn returns / generate returns** | Profit-expectation language. | (no replacement — don't promise returns) |
| **yield / yield from baskets** | Profit-expectation language. The yield from NARA locking is separate; don't conflate. | "fees route to NARA stakers" (only when describing the flywheel, not as a user benefit promise) |
| **profit / profitable** | Direct Howey trigger. | (don't promise profit) |
| **guaranteed / secure / safe returns** | Marketing fraud risk in addition to securities risk. | (don't use any guarantee language) |
| **expert curation / professional management** | Implies effort-of-others. | "we picked a set of tokens for this category" |
| **rebalanced / actively managed** | Implies ongoing management. | "fixed composition", "immutable basket" |
| **performance / outperforming** | Profit-expectation language. | (describe what the basket holds, not what it might do) |
| **HODL the basket / diamond hands** | While casual, retail-investor cultural language is being noticed by regulators. | "hold the receipt", "withdraw any time" |
| **passive income** | Direct profit-expectation language. | (no replacement) |
| **wealth / get rich / financial freedom** | Investment-pitch language. | (no replacement) |

### Words to USE

These words describe the product accurately and defensibly.

- **"buy a basket"** — describes the transaction
- **"basket of tokens"** — describes the contents
- **"exposure to [category]"** — describes economic effect without promising profit
- **"receipt for the tokens you bought"** — accurate ERC-721 framing
- **"self-custody"** / **"you hold the keys"** / **"non-custodial"** — emphasizes user control
- **"withdraw the raw tokens any time"** — emphasizes user exit option
- **"immutable smart contract"** — emphasizes no admin
- **"no manager"** / **"no protocol custody"** — emphasizes the legal posture
- **"category basket"** / **"themed token set"** — describes without promising
- **"buy fee"** / **"sell fee"** — flat operational language
- **"NARA token is included in every basket"** — factual, not promotional

### Required disclosures

Every public-facing basket surface should include a footer or modal with:

1. **No investment advice.** "NARA Baskets are not investment products. Token prices can go to zero. NARA does not promise any return."
2. **Composition is fixed.** "Each basket's contents are set at deployment and cannot be changed. The smart contract has no admin."
3. **You hold the underlying.** "Your receipt is an ERC-721 NFT representing claim to specific tokens held by the smart contract. You can withdraw all raw tokens with `withdrawUnderlying` or selected raw tokens with `withdrawUnderlyingPartial`, subject to the selected token contracts transferring normally."
4. **Risk acknowledgment.** "You are responsible for evaluating the tokens in each basket. NARA is not a fiduciary."
5. **No tax advice.** "Buying, selling, and withdrawing baskets may have tax consequences. Consult your own advisor."
6. **Risk acknowledgment** clickwrap on first wallet connect. See "ToS" below.

### Geographic policy — OPEN AT LAUNCH

**Decision 2026-05-28: NARA Baskets launches with no geo-fence.** Open to all jurisdictions from day one.

The reasoning (operator's call):
- Maximize reach for the crown launch product
- The contracts are permissionless anyway — geo-fencing the frontend is symbolic protection at best (VPN-bypassable in 30 seconds)
- The product is structurally non-custodial: user holds the receipt NFT, can use full or partial raw withdrawal paths, and no NARA entity controls the assets
- The operator accepts the elevated exposure and compensates with stricter language discipline and a load-bearing ToS clickwrap

Consequences this decision creates:
- **Language discipline becomes the only protection.** Every "banned word" in the table above moves from "should avoid" to "must not appear, anywhere, ever." If a user sees the word "yield" or "invest" on a NARA Baskets page, they can hold the operator to it in any jurisdiction.
- **ToS clickwrap on first wallet connect is mandatory, not optional.** No connect = no buy. Consent is recorded on-chain (signed message) or in a backing log.
- **Counsel engagement is more urgent, not less.** Without geo-fence, the operating entity choice and ToS scope have to handle worldwide exposure.
- **If US regulatory action lands** (subpoena, cease-and-desist, registration demand), the operator can flip a Cloudflare worker on within minutes to add a geo-block. Have the worker ready as a kill-switch even if disabled at launch.

Sanctioned-jurisdiction handling is the **only** remaining server-side block: OFAC (Iran, North Korea, Syria, Cuba, Crimea, Russia under specific rules) compliance is non-negotiable for the frontend operator regardless of US-securities posture. This is a different legal regime (sanctions, not securities) and does not depend on counsel's broker-dealer analysis. The operator MUST honor OFAC at the infrastructure layer — Cloudflare's own WAF rules cover most of this automatically. Confirm with infrastructure provider.

### Terms of Service — load-bearing under the no-block posture

ToS becomes the primary frontend-operator protection. Draft requirements:

- User acknowledges all risk in plain language
- User acknowledges they are not receiving investment advice
- User acknowledges baskets are execution tools, not investment products
- User waives any claim arising from token-price changes
- User affirms they are not on any OFAC-sanctioned list
- User affirms they are not located in a comprehensively sanctioned jurisdiction
- User affirms they understand the receipt NFT is a bearer instrument
- Clear disclosure of fees (buy/sell bps per basket)
- Limitation of liability clause
- No promise of any return
- Jurisdiction and arbitration clauses tied to the operating entity

**Implementation requirements**:
- Clickwrap modal on first wallet connect to the basket frontend
- Wallet signs an EIP-191 message acknowledging the ToS hash and version
- Signed message stored on the backend with timestamp + wallet address + IP + user-agent
- Re-consent required on any material ToS update (operator publishes new hash)
- "Have you read this?" friction is intentional — the bar to claim "I didn't know" must be high

Have a securities lawyer in a relevant jurisdiction (Switzerland, BVI, Cayman, or Wyoming for a DAO LLC) review this before launch.

### Entity structure note

The protocol's exposure also depends on the entity that operates the frontend and signs the deploy transactions. Common defensive structures:

- **Cayman foundation** — popular for DeFi protocols, governance can be on-chain
- **Swiss foundation (Verein/Stiftung)** — used by Ethereum, Lido, others
- **BVI / Marshall Islands DAO LLC** — newer, lighter-weight
- **Wyoming DAO LLC** — US option for non-securities products

The contracts themselves do not constrain entity choice. Frontend operation and revenue receipt do. If a CEX or fiat ramp routes fees through NARA's bank account, that activity needs a domiciled operating entity.

This is out of scope for the contract audit but is the right question to raise with counsel.

### Promotional language safe-list (drop-in copy)

These are tested phrasings that describe the product without triggering securities concerns. Use these as starting points.

**Homepage hero**:
> "Pick a category. Buy a basket of tokens in one click. Self-custody. No manager. No admin."

**Basket detail header**:
> "NARA CORE Basket — a fixed set of ecosystem tokens, executed by an immutable smart contract."

**Buy CTA**:
> "Buy this basket — USDC in, tokens to your wallet, receipt NFT to confirm your position."

**NARA inclusion footnote**:
> "Every NARA Basket includes the NARA token, the asset that funds the smart contract that built this product. Buying a basket buys NARA along with the rest."

**Receipt page**:
> "Your receipt represents claim to the specific tokens listed below. Sell the whole basket to USDC or NARA, or withdraw raw tokens when the selected token contracts transfer normally."

**Withdraw CTA**:
> "Withdraw underlying — receive the exact tokens shown above. No fees, no slippage, no swap."

**Risk disclosure (always visible)**:
> "Tokens can lose value. NARA does not promise any return. You are responsible for evaluating each basket's contents before buying."

### What NOT to say even if it's tempting

- "The AI basket is up 40% this month" → implies profit promise, even as observation
- "Our baskets outperform single-token holdings" → promise of performance
- "Earn yield from the basket flywheel" → yield language re: baskets
- "NARA team handpicked these tokens for explosive growth" → manager + profit expectation
- "Get exposure to the next 100x" → speculative promotion
- "Diversify your portfolio with one click" → "portfolio" is loaded language
- "Lower risk than picking individual tokens" → unprovable comparative claim
- "Smart money is buying these baskets" → unverifiable social-proof claim

If a basket performs well, *let users discover it on-chain or on Twitter*. Do not advertise performance on the official frontend.

---

## Part 4 — Pre-Launch Action Items

Hard gates derived from the audit. None of these are optional.

| ID | Item | Why | Status |
|---|---|---|---|
| A-01 | `ADMIN` for fee collector must be a Safe with timelock | F-08, F-09, F-11 — single EOA admin is a USDC honeypot | Pending |
| A-02 | Deploy + verify Uniswap V3 swap adapter on Base | No adapter exists today | Pending |
| A-03 | Document exact allowed selectors for each executor | F-09 — broad selector = drain | Pending |
| A-04 | Frontend verifies `manager.requiredAsset() == NARA_TOKEN` per basket | F-02 — rogue basket impersonation risk | Pending |
| A-05 | Curated asset list with verified Base addresses + pool depth + admin audit | Asset hygiene per `SECURITY_CHECKLIST.md` | Pending |
| A-06 | Securities counsel review of ToS and public copy (no-block posture) | Part 3 — under no-block policy, language is the only protection | Pending |
| A-07 | OFAC-only infrastructure block (Cloudflare WAF default rules — no jurisdiction-securities geo-fence) | Part 3 — sanctions compliance is non-negotiable; securities geo-fence is operator's call: NO at launch | Pending |
| A-08 | Risk-disclosure footer on every basket page + clickwrap ToS on first wallet connect | Part 3 — load-bearing under no-block policy | Pending |
| A-08b | Pre-built "kill-switch" geo-fence worker held in reserve, not deployed | Part 3 — flippable in minutes if regulatory action lands | Pending |
| A-09 | Operating entity decision (Cayman / Swiss / BVI / DAO LLC) | Part 3 — entity-structure note | Pending |
| A-10 | Slither + Echidna + external review on adapter + collector before mainnet | Defense-in-depth | Pending |
| A-11 | Base Sepolia full-flow smoke test (buy, sell, withdrawUnderlying) per launch basket | Pre-mainnet hygiene | Pending |
| A-12 | `baskets.ts` registry committed and reviewed before frontend ships | Curation gate | Pending |
| A-13 | Fee collector V2: after wiring legit executors/selectors, call `freezeAllowlist()` (one-way); grant `SWAPPER_ROLE` and `EXECUTOR_MANAGER_ROLE` to **separate** keys | F-14 — unfrozen allowlist + combined roles can skim pre-swap fees | Pending |
| A-14 | Confirm the receipt's **owner-only / non-delegable** model is intended before the immutable deploy (no approvals, not marketplace-listable); align all user copy | F-03 — permanent at deploy; docs corrected 2026-06-30 | Pending |

---

## Part 5 — Open Questions for Counsel

These are the specific questions to put to a securities lawyer. Don't accept generic "this might be a security" answers — ask each question directly.

1. Does the receipt model (1 NFT = title to specific tokens, no NAV, no rebalance) avoid the "common enterprise" prong of Howey under both the broad and narrow interpretations?
2. Does the mandatory NARA allocation in every basket cause the basket itself to be characterized as a primary distribution of NARA, with implications for NARA's own classification?
3. Does fee revenue flowing back to NARA stakers via `engine.depositRewards` / `notifyEthRewards` constitute "from the efforts of others" with respect to the basket purchase, or is that downstream NARA-token economics separate from the basket transaction?
4. The operator has chosen to launch without geo-fence. Under that posture, what is the minimum risk-mitigation kit (ToS scope, clickwrap, language discipline, entity domicile, advertising bans) to keep US-broker-dealer exposure manageable? At what trigger event (subpoena, public letter, registration demand) should the kill-switch geo-fence be activated?
5. Should the buy/sell fee be characterized as a "convenience fee" (not investment-related) or as a "transaction fee" (potentially regulated)?
6. Does the protocol need an MSB or money-transmitter registration in any jurisdiction for the basket-buy flow?
7. What is the recommended operating-entity structure for an immutable, non-custodial DeFi product with a paid frontend?
8. What disclosures are required on the frontend itself versus in a separate ToS?

---

## References

- `nara-category-baskets-v1/src/NARAImmutableBasketPositionManagerV1.sol` (592 lines)
- `nara-category-baskets-v1/src/NARAIndexFeeCollectorV1.sol` (214 lines)
- `nara-category-baskets-v1/script/DeployBaseMainnet.s.sol`
- `nara-category-baskets-v1/docs/SECURITY_CHECKLIST.md`
- `nara-category-baskets-v1/docs/NARA_INTEGRATION.md`
- `nara-protocol-hardhat/docs/NARA_V4_BASKETS_LAUNCH_STRATEGY.md` (companion strategy doc)
- `nara-protocol-hardhat/docs/NARA_V4_LAUNCH_RUNBOOK.md` (core deploy sequence)
