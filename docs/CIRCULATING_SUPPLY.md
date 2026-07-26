# NARA Circulating Supply — oracle + listing playbook

Last updated: 2026-07-27.

How NARA reports **market circulating supply** to listing sites (CoinGecko, CoinMarketCap,
DexScreener) and to its own UI, and how to deploy + submit it on launch day.

Contract: [`contracts/v4/router/NARACirculatingSupplyV1.sol`](../contracts/v4/router/NARACirculatingSupplyV1.sol).
Tests: [`test/NARACirculatingSupplyV1.test.ts`](../test/NARACirculatingSupplyV1.test.ts).

---

## The problem

NARA mints **all 1,000,000 at deploy** ([`NARAToken.sol`](../contracts/v4/NARAToken.sol) →
`_mint(treasury, MAX_SUPPLY)`). So `totalSupply()` is `1,000,000` forever, and there is **no
on-chain "circulating supply" function**. Left alone, every tracker shows
`market cap = price × 1,000,000` (i.e. FDV), which is wrong when protocol-controlled
allocations remain non-market.

Circulating supply is therefore a **disclosure**, not something the chain emits. This contract
makes that disclosure trustless and self-updating.

---

## The definition (read before changing anything)

```
circulating = cappedTotalSupply − Σ( balanceOf(excluded) + excludedMarketBalance(excluded) )
```

Excluded = the **non-market** wallets: reward reserve, bond vault, team vesting wallet,
treasury, and the burn sink (`0x…dead`). Everything else is circulating — **including NARA that
users have locked in the engine.**

**Why user-locked counts as circulating.** This is the market definition listing sites use:
coins in the public's hands. A holder who buys and locks NARA still owns it — it is voluntarily
illiquid, not protocol-controlled (same treatment as staked ETH or locked CRV/CVX). Counting it
keeps market cap from *shrinking* as the protocol succeeds and more people lock.

**This is deliberately NOT the same number as `NARAEngine._circulatingSupply()`.** The engine's
internal figure is an *emission-model free-float*: it also subtracts the engine's own balance
(locked principal + in-flight emission reserve) because that figure scales emissions, not market
cap. Two numbers, two purposes. **Do not add the engine to the excluded set here** to "reconcile"
them — that would erase user-locked supply from the public number.

**Planned post-allocation disclosure:** `1,000,000 − 650,000 reserve − 200,000 bonds
− 40,000 vesting = 110,000` (`70,000` LP allocation plus `40,000` treasury).
This is not the current Stage A value: the allocation layer is deferred and the
Stage A treasury still holds the unsplit balance. Deploy and configure this
oracle only after the final excluded-address set and custody split are verified.

---

## Excluded set (fill in at deploy)

| Bucket | Address source | In set? |
|---|---|---|
| Reward reserve | `NARARewardReserve` | ✅ |
| Bonds | `NARABondVaultV4` (also self-reports `excludedMarketBalance()`) | ✅ |
| Team / owner | external OZ `VestingWallet` | ✅ |
| Burn | `0x000000000000000000000000000000000000dEaD` | ✅ |
| Treasury | treasury Safe | ❌ earmarked for game sponsorship → circulating |
| LP allocation | Initial pool plus designated later-liquidity custody | ❌ disclosed as circulating under the approved 110k model |
| Engine (user locks) | `NARAEngine` | ❌ user-locked is circulating |

**Approved allocation model:** the `40,000 NARA` treasury allocation and full
`70,000 NARA` LP allocation are disclosed as circulating after the custody split,
for planned genesis circulating supply of `110,000 NARA`. The controlled initial
pool position contains `60,000 NARA + 300 USDC`; the remaining `10,000 NARA`
liquidity allocation is added only through separately reviewed transactions.
The oracle must not be published before the addresses representing those
allocations are finalized and verified.

---

## Deploy

Part of the router/lens step ([`scripts/deployRouterLens.ts`](../scripts/deployRouterLens.ts)).
Gated on env so it only deploys when you pass the wallet set:

```bash
NARA_V4=0x<token> \
CIRC_EXCLUDED=0x<rewardReserve>,0x<bondVault>,0x<vestingWallet>,0x000000000000000000000000000000000000dEaD \
CIRC_MAX_SUPPLY_CAP=1000000000000000000000000 \
npm run deploy:v4:router:lens
```

(Treasury is intentionally absent from `CIRC_EXCLUDED` — it counts as circulating.)

`CIRC_MAX_SUPPLY_CAP` defaults to `1_000_000e18` if omitted. The script rejects duplicates and
prints `circulatingSupply()` + the excluded set on deploy. The contract is **immutable and
ownerless** — there is no setter. To change the excluded set later, deploy
`NARACirculatingSupplyV2` and repoint the site + listing submissions (this is intentional;
mutable supply contracts get rejected by reviewers).

---

## Launch-day listing playbook

The trackers do the subtraction themselves from a submitted **excluded-address list** — they do
not call this contract. This contract is the trustless mirror: it feeds your own UI/API one
authoritative number, and `excludedAccounts()` lets a reviewer verify your submission.

1. **CoinGecko** (do this first — the others inherit from it). Submit the token request, then the
   **"excluded from circulating supply" address list** = the same wallets in `CIRC_EXCLUDED`.
   They poll those balances on-chain and recompute circulating automatically forever.
2. **CoinMarketCap.** Same pattern: self-reported circulating supply + verified excluded-address
   list. (A circulating-supply API URL is optional; the address list is sufficient.)
3. **DexScreener.** No address-list input — it auto-excludes only burn addresses and otherwise
   inherits circulating supply from CoinGecko. Submit token info; fix CoinGecko first.
4. **Label the wallets on Basescan** (reserve, bond vault, vesting, treasury) so the exclusions
   are visibly legitimate.
5. **Point the site/infographic** at `circulatingSupply()` / `supplyReport()`. Never show
   `price × totalSupply` and call it market cap.

---

## Reading it

| Call | Returns |
|---|---|
| `circulatingSupply()` | market circulating supply (18 dec) |
| `lockedSupply()` | total − circulating |
| `totalSupply()` / `rawTotalSupply()` | capped / uncapped supply |
| `percentCirculatingBps()` | circulating as bps of total (1100 = 11%) |
| `supplyReport()` | all of the above in one call |
| `excludedAccounts()` | the exact excluded set (listing proof) |
| `excludedBreakdown()` | per-wallet excluded balances |

---

## Legal note

Stating circulating vs total factually is neutral disclosure and is fine. Do **not** pair it with
return, price-appreciation, or "market cap target" framing. See
`NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md` for the banned-wording list.
