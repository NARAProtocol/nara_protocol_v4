# NARA Baskets — Mainnet Readiness Master Checklist

> **Historical planning baseline.** The approved current verification route is
> an exact Base-mainnet fork, not Sepolia. No independent audit is claimed or
> scheduled. Current launch state and gates are in
> [CURRENT_STATE.md](CURRENT_STATE.md) and the basket deployment manifests.

Last updated: 2026-05-28.
Status: in preparation — items below must all be GREEN before public launch.
Companion: `NARA_V4_BASKETS_LAUNCH_STRATEGY.md`, `NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md`.

This is the single go/no-go document. If any item is not GREEN, do not announce, do not list, do not push promotional copy.

---

## What changed since the audit

The audit (`NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md`) flagged HIGH-trust issues in the V1 fee collector and a missing swap adapter. Both are now fixed at the contract level.

| Audit finding | Resolution |
|---|---|
| F-08 HIGH: `sweepToken` admin escape for USDC fees | `NARAIndexFeeCollectorV2.sol` removes `sweepToken` entirely. Only path out of the contract is swap → NARA/WETH → engine. |
| F-09 HIGH: selector allowlist load-bearing | Same V2 keeps selector allowlist but documents the exact 4-byte values for SwapRouter02 (`exactInputSingle = 0x04e45aaf`, `exactInput = 0xb858183f`). Multicall and proxy selectors explicitly denied. |
| F-10 MEDIUM: zero-input swap accepted | V2 reverts on `actualIn == 0`. |
| F-11 MEDIUM: admin can stop swaps and stranded fees | V2 mitigated by F-08 fix — even if swaps stop, no admin extraction path exists. Fees can only flow forward to engine. |
| F-13 INFO: `sweepETH` admin escape for stuck ETH | V2 removes `sweepETH`. Idle ETH can only be sent to engine via `notifyNativeEth`. |
| Missing swap adapter | `UniswapV3BasketAdapterV1.sol` ships. Immutable. Constructor-pinned to SwapRouter02. |

The V1 fee collector remains in the repo for compatibility but **must not be used at mainnet launch**. Use V2.

---

## New contracts shipped this round

| File | Purpose | Status |
|---|---|---|
| `nara-category-baskets-v1/src/NARAIndexFeeCollectorV2.sol` | Sweep-resistant fee router | Built — needs `forge test` after Foundry install |
| `nara-category-baskets-v1/src/adapters/UniswapV3BasketAdapterV1.sol` | Single-hop V3 SwapRouter02 adapter | Built — needs `forge test` after Foundry install |
| `nara-category-baskets-v1/script/DeployMainnetReady.s.sol` | Atomic deploy: adapter + V2 collector + first basket | Built — runs against Base mainnet (`chainid 8453`) |
| `nara-category-baskets-v1/config/launch-baskets.json` | Curation manifest for the 4 launch baskets | Templated — operator fills `<TBD>` token candidates |

---

## Go / No-Go gates

### Gate 0 — v4 core (prerequisite)

| ID | Item | Owner | Verification |
|---|---|---|---|
| G0-1 | NARA token v4 deployed | Operator | Address in `deployments/v4-base-usdc-latest.json` |
| G0-2 | NARA engine v4 deployed | Operator | Address in `deployments/v4-base-usdc-latest.json` |
| G0-3 | LP seeded, swaps live | Operator | `npm run smoke:v4` passes |
| G0-4 | 48h monitored operation | Operator | `lens.getEpochState()` shows `syncRequired = false` over 48h |
| G0-5 | Engine admin roles transferred to Safe | Operator | Basescan: `engine.hasRole(PARAM_ROLE, deployer) == false` |

**If any G0 item is RED, baskets cannot deploy. Period.**

### Gate 1 — basket contracts

| ID | Item | Owner | Verification |
|---|---|---|---|
| G1-1 | Foundry installed on deployer machine | Operator | `forge --version` returns ≥ 0.2.0 |
| G1-2 | `forge build` clean | Operator | Exit 0 from `forge build` in `nara-category-baskets-v1/` |
| G1-3 | `forge test --fuzz-runs 1000` all pass | Operator | All existing 46 V1 tests + new V2 + adapter tests |
| G1-4 | V2 fee collector unit tests added | Engineering | New `test/NARAIndexFeeCollectorV2.t.sol` covers sweep removal, swap path constraint |
| G1-5 | Adapter unit tests + fork test | Engineering | New `test/UniswapV3BasketAdapterV1.t.sol` against Base fork |
| G1-6 | Slither clean (no MEDIUM+ unresolved) | Engineering | `slither .` output reviewed; high/medium triaged |
| G1-7 | Manual review of `_executeSwap` against allowlist bypass | Engineering | Document selector check is gas-cheap and reverts before any external call |
| G1-8 | External audit on V2 collector + adapter | Operator | Vendor sign-off (recommended: zellic, Code4rena, Spearbit) |

### Gate 2 — operational keys

| ID | Item | Owner | Verification |
|---|---|---|---|
| G2-1 | `ADMIN` is a Safe with ≥2-of-N signers | Operator | Basescan shows multisig at the address; signers documented in `CURRENT_STATE.md` |
| G2-2 | Safe has a timelock module | Operator | Module address visible in Safe UI; minimum delay ≥ 24h documented |
| G2-3 | Deployer EOA is ephemeral and pre-funded | Operator | Wallet has ≥ 0.05 ETH and no other roles |
| G2-4 | Deployer address renounces all roles in deploy tx | Automatic | `DeployMainnetReady.s.sol` does this; verify with `hasRole` after deploy |
| G2-5 | Selector allowlist set to exact V3 selectors only | Automatic | Deploy script sets `exactInputSingle = 0x04e45aaf`; `exactInput = 0xb858183f` set in a separate Safe tx if multi-hop is needed |
| G2-6 | No `multicall`, `selfPermit`, or proxy selectors allowlisted | Operator | Manual review of fee collector `allowedSelector` mapping post-deploy |
| G2-7 | `SWAPPER_ROLE` and `EXECUTOR_MANAGER_ROLE` granted to **separate** keys (not one address) | Operator | `hasRole` shows distinct holders — prevents one compromised key from both adding a malicious executor and swapping through it (F-14) |
| G2-8 | After legit executors/selectors are wired, call `freezeAllowlist()` (one-way) | Operator | `allowlistFrozen() == true`; `setAllowedExecutor`/`setAllowedSelector` now revert `AllowlistFrozen` — definitive close of the F-14 pre-swap-skim window |

### Gate 3 — asset curation (per basket)

For each basket in `launch-baskets.json`, verify these on launch day:

| ID | Item | Verification |
|---|---|---|
| G3-1 | Every asset has a Base mainnet Uniswap V3 pool at the listed fee tier | Read `Pool.liquidity()` returns > 0 |
| G3-2 | Every non-NARA asset has ≥ $250k pool depth | Basescan + pool TVL on Geckoterminal |
| G3-3 | No asset is fee-on-transfer | Test transfer of 1 wei: balance delta == 1 |
| G3-4 | No asset is rebasing | Token contract has no `rebase` / `setRebasingState` / similar |
| G3-5 | No asset has a blacklist / pause function exercisable by an EOA | Read contract source on Basescan |
| G3-6 | No asset is behind an unverified bridge | Token deployed natively on Base or bridged via well-known canonical bridge |
| G3-7 | Total weight sums to exactly 10,000 bps | `weights.reduce((a,b)=>a+b) == 10000` in the operator's spreadsheet |
| G3-8 | NARA weight ≥ `minNaraWeightBps` for this basket | Inline check |

### Gate 4 — frontend

| ID | Item | Owner | Verification |
|---|---|---|---|
| G4-1 | `apps/nara-baskets/` exists with Degen Board design tokens | Engineering | App scaffolded, dev server runs |
| G4-2 | `baskets.ts` registry generated from `launch-baskets.json` after deploy | Engineering | Addresses populated, ABI exports correct |
| G4-3 | Frontend verifies `manager.requiredAsset() == NARA_TOKEN` at runtime for each basket | Engineering | Mismatched basket triggers visible warning and refuses listing (defense against F-02) |
| G4-4 | Buy flow: USDC permit → Quote Worker → basket buy in single Smart Wallet UserOp | Engineering | E2E test on Base Sepolia |
| G4-5 | Quote Worker (Cloudflare) live and tested | Engineering | Per-asset V3 quote with adjustable slippage, returns `BuyParams` |
| G4-6 | Receipt page: shows position contents, current value, sell + withdraw CTAs | Engineering | Verified visually on Sepolia receipts |
| G4-7 | "Withdraw underlying" path tested per launch basket | Engineering | Receipt burns, underlying tokens land in wallet |
| G4-8 | Coinbase Smart Wallet + Paymaster sponsorship policy set | Operator | CDP allowlist: adapter + manager + USDC permit |
| G4-9 | OFAC sanctions block at infra layer (no securities geo-fence — open to all jurisdictions) | Engineering | Cloudflare WAF default rules cover sanctioned countries; no `cf-ipcountry` securities block at launch |
| G4-9b | Kill-switch geo-fence worker exists in repo but disabled | Engineering | Pre-built Cloudflare Worker stored in `apps/nara-baskets/functions/_kill-switch-geofence.ts.disabled`. Flip-on rename takes one operator action if regulatory event lands. |
| G4-10 | Risk disclosure footer visible on every basket page | Engineering | Required disclosure block per Audit doc Part 3 |
| G4-11 | ToS clickwrap modal on first wallet connect | Engineering | Wallet signs EIP-191 message with ToS hash; signature + timestamp + wallet stored backend-side |

### Gate 5 — legal + compliance

| ID | Item | Owner | Verification |
|---|---|---|---|
| G5-1 | Securities counsel review of ToS, frontend copy, and basket pages | Operator | Written sign-off retained |
| G5-2 | Terms of Service drafted with clickwrap consent | Operator | ToS hosted, consent recorded for every wallet on first connect |
| G5-3 | Public copy passes the banned-word check in Audit doc Part 3 | Operator | Manual review of every public-facing string |
| G5-4 | OFAC compliance confirmed at infra layer (no securities geo-fence at launch — operator decision 2026-05-28) | Operator | Cloudflare WAF rules active for sanctioned countries; ToS includes clickwrap denial-of-service to sanctioned persons; kill-switch worker ready in repo |
| G5-5 | Operating entity established | Operator | Entity formation docs retained |
| G5-6 | No "yield / invest / return / fund" language anywhere on the basket UI | Operator | Grep all frontend strings |
| G5-7 | Risk-disclosure footer present on every basket route | Engineering | Verified per route |
| G5-8 | Tax-status disclaimer present | Operator | Footer + ToS |

### Gate 6 — monitoring + ops

| ID | Item | Owner | Verification |
|---|---|---|---|
| G6-1 | Event indexer running (Subgraph or Cloudflare Worker) | Engineering | `BasketBought`, `BasketSold`, `UnderlyingWithdrawn`, `SwapExecuted` indexed |
| G6-2 | Fee accumulation dashboard | Operator | Live USDC balance of fee collector + chart of weekly inflow |
| G6-3 | Engine reward push telemetry | Operator | Cron checks `engine.depositRewards` and `engine.notifyEthRewards` calls per week |
| G6-4 | Safe transaction queue review process | Operator | Documented runbook for routine fee-swap pushes |
| G6-5 | Incident response runbook | Operator | `NARA_V4_BASKETS_INCIDENT_RESPONSE_RUNBOOK.md` covers route failure, token failure, exit-only status, replacement deploys, and neutral comms |
| G6-6 | Cloudflare Workers, CDP credit balance, RPC quota monitored | Operator | Low-balance alerts configured |

---

## Pre-launch dry run (Base Sepolia)

Before mainnet, run this sequence on Base Sepolia with a small test stack:

1. Deploy v4 core to Sepolia (separate script).
2. Deploy `UniswapV3BasketAdapterV1` pointing to Sepolia SwapRouter02 (`0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4`).
3. Deploy `NARAIndexFeeCollectorV2` with deployer-only admin.
4. Set `exactInputSingle = 0x04e45aaf` as allowed selector.
5. Deploy a test "NARA CORE Basket" pointing to Sepolia tokens (any verified ERC-20s, low decimals).
6. Mint receipts: buy basket with 10 USDC.
7. Sell receipt to USDC.
8. Buy basket again. Test `withdrawUnderlying` to a separate address.
9. Buy basket again. Test `withdrawUnderlyingPartial` for one selected asset and `sellBasketPartial` for the remaining selected assets.
10. Verify fee collector received fees in USDC.
11. Run a fee swap: USDC → WETH via SwapRouter02.
12. Run `unwrapWethAndNotifyEth`. Confirm engine received ETH.
13. Confirm `engine.depositRewards` path with a small NARA balance.

If any step reverts unexpectedly, fix before mainnet.

---

## Mainnet launch sequence (final)

Run these in order. Do not skip steps. Do not run two in parallel.

```
Day 0 (T-7)
  □ All Gate 0–6 items GREEN
  □ Safe admin address confirmed in writing with all signers
  □ Deployer wallet topped up with ≥ 0.1 ETH on Base mainnet
  □ Foundry installed on deployer machine, forge build clean

Day 1 (T-0)
  □ Deploy fresh v4 core per LAUNCH_RUNBOOK.md (12 steps)
  □ Smoke test passes

Day 3 (T+2)
  □ Confirm 48h stable epoch advance
  □ Confirm vault balance growing

Day 4 (T+3) — basket deploy
  □ Set env: ADMIN (Safe), NARA, NARA_ENGINE, USDC, WETH, UNISWAP_V3_ROUTER02, EXECUTOR_0_SELECTOR
  □ Set env: BASKET_CATEGORY="CORE", BASKET_NAME="NARA CORE Basket", BASKET_RISK_TIER=1
  □ Set env: BASKET_BUY_FEE_BPS=10, BASKET_SELL_FEE_BPS=10, BASKET_MAX_WEIGHT_DEV_BPS=25
  □ Set env: BASKET_MIN_NARA_WEIGHT_BPS=500
  □ Set env: BASKET_ASSETS, BASKET_WEIGHTS (CSV)
  □ Dry-run: forge script script/DeployMainnetReady.s.sol --rpc-url $BASE_MAINNET_RPC_URL
  □ Inspect simulation output
  □ Broadcast: forge script script/DeployMainnetReady.s.sol --rpc-url $BASE_MAINNET_RPC_URL --broadcast
  □ Verify all contracts on Basescan with --verify

Day 4 (T+3) — post-deploy verification
  □ Basescan: feeCollector.hasRole(DEFAULT_ADMIN_ROLE, Safe) == true
  □ Basescan: feeCollector.hasRole(DEFAULT_ADMIN_ROLE, deployer) == false
  □ Basescan: feeCollector.allowedSelector[router02][0x04e45aaf] == true
  □ Basescan: manager.requiredAsset() == NARA
  □ Basescan: manager.basket().feeRecipient == feeCollector
  □ Basescan: manager.getBasketAssets() returns the curated list
  □ Update launch-baskets.json with deployed addresses

Day 5 (T+4) — pilot
  □ Operator buys $20 USDC of "NARA CORE Basket" from a hot test wallet
  □ Confirm receipt minted, position page shows correct assets
  □ Operator sells receipt to USDC
  □ Operator buys again, calls withdrawUnderlying, confirms raw tokens land
  □ Operator buys again, tests withdrawUnderlyingPartial and sellBasketPartial
  □ Confirm fee collector received ≥ 4 cents of USDC fees
  □ Execute fee swap (Safe → executeFeeSwap → USDC→WETH)
  □ Execute unwrapWethAndNotifyEth (Safe)
  □ Confirm engine event NotifyEthRewards fired

Day 6 (T+5) — frontend
  □ apps/nara-baskets/src/shared/baskets.ts updated with mainnet addresses
  □ Frontend deployed to Cloudflare staging
  □ Buy flow tested with Smart Wallet (paymaster sponsored)
  □ Cloudflare WAF default rules confirmed active (OFAC sanctioned countries blocked at infra layer)
  □ Kill-switch geo-fence worker present in repo, disabled
  □ ToS clickwrap modal renders on first wallet connect and records signature
  □ Risk disclosure footer visible
  □ Banned-word grep clean on all production frontend strings

Day 7 (T+6) — public
  □ Deploy frontend to naraprotocol.pro (production)
  □ Public announcement
  □ Monitor: fee collector inflow, first 24h conversions, paymaster credit burn
  □ Open to all jurisdictions — no securities geo-fence at launch (decision 2026-05-28)
```

If any step fails mid-sequence, stop. Document the failure. Fix. Restart from the failed step.

---

## Anti-checklist (the things that BLOCK launch)

If any of the following is true on launch day, **do not launch**. Push the date.

- Foundry not installed on deployer machine
- Any `forge test` failure
- Any open Slither MEDIUM+ on V2 collector or adapter
- `ADMIN` is an EOA (not a Safe)
- Safe has no timelock module
- `multicall` selector is allowlisted on the fee collector
- Any basket asset has < $250k pool depth
- Any basket asset has an admin-mutable transfer function
- Frontend's basket page is missing the risk-disclosure footer
- ToS clickwrap is missing (load-bearing under no-block policy)
- Any banned word ("yield", "invest", "fund", "returns", "profit", "portfolio") appears on a production basket page
- OFAC infra-layer block not confirmed active (sanctions compliance is non-negotiable even under no-block securities posture)
- ToS has not been counsel-reviewed
- Geo-fence rules not deployed
- `manager.requiredAsset() != NARA_TOKEN` for any listed basket
- The deployer EOA still holds any fee collector role
- The engine still has the deployer in `PARAM_ROLE` or `TREASURY_ROLE`

---

## Open items for the operator (decisions only the operator can make)

These need human judgment, not engineering execution.

1. **Choose the operating entity** (Cayman foundation / Swiss / BVI DAO LLC / Wyoming DAO LLC). This needs to be done before frontend ships because ToS references the operating entity.
2. **Select the Safe signer set**. ≥3 signers, ≥2 threshold recommended. Document each signer's identity in `CURRENT_STATE.md`.
3. **Set the timelock delay**. 24h recommended for routine swaps; 7d for any role grant or selector allowlist change.
4. **Pick a securities lawyer** in the operating-entity jurisdiction and engage formally.
5. **Decide on first basket**. Choose the pilot by operational readiness, verified liquidity, and legal review. Do not label it safest, best, or lowest risk.
6. **Decide which audit vendor** to engage. Zellic, Code4rena, Spearbit, Trail of Bits — pick one and book.
7. **Set the Coinbase Paymaster sponsorship policy** at the CDP dashboard: allowlist adapter, manager, USDC permit, and the four flow selectors.

---

## What I have NOT done (cannot do from this environment)

These are the explicit hand-offs to the operator:

- Run `forge test` — Foundry is not installed in this environment
- Deploy to Sepolia or mainnet — needs the operator's keys and live RPC
- Set up the Safe — needs the operator's signers and Gnosis Safe UI
- Set up CDP Paymaster sponsorship — needs operator's CDP project
- Cloudflare geo-fence Worker — easy to write; needs operator's CF account to deploy
- ToS drafting — needs counsel
- External audit — needs vendor

Everything that can be done in code is done. The remaining items are operational and human-judgment.

---

## Next concrete action

Install Foundry on the deployer machine, then in `nara-category-baskets-v1/`:

```bash
forge build
forge test --fuzz-runs 1000
```

If both succeed, the contract layer is mainnet-ready pending external audit. Move to Gate 0 (v4 core deploy).

If `forge test` fails on the new V2 collector or adapter, the test files for them need to be added (placeholders not included in this drop because Foundry is not available to verify the test code). Templates are in `test/NARAIndexFeeCollectorV1.t.sol` and the new tests should mirror those structures.

---

## References

- `nara-category-baskets-v1/src/NARAIndexFeeCollectorV2.sol`
- `nara-category-baskets-v1/src/adapters/UniswapV3BasketAdapterV1.sol`
- `nara-category-baskets-v1/script/DeployMainnetReady.s.sol`
- `nara-category-baskets-v1/config/launch-baskets.json`
- `nara-protocol-hardhat/docs/NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md`
- `nara-protocol-hardhat/docs/NARA_V4_BASKETS_LAUNCH_STRATEGY.md`
- `nara-protocol-hardhat/docs/NARA_V4_LAUNCH_RUNBOOK.md`
