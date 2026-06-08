# NARA v4 Incident And Redeploy Memo

Last updated: 2026-05-27.

This document is the historical recovery memo for the failed 2026-04-23 v4 launch attempt. It is not the current v4 launch plan.

Current v4 launch truth is in [CURRENT_STATE.md](CURRENT_STATE.md), [V4_DEPLOYMENT_HANDOFF.md](V4_DEPLOYMENT_HANDOFF.md), and [V4_REDEPLOY_NO_SURPRISE_PLAN.md](V4_REDEPLOY_NO_SURPRISE_PLAN.md). Current launch code uses `NARALiquidityGrowthHook` and `NARALiquidityGrowthVault`, not the retired tax hook/vault path described in this incident.

## Executive Summary

The v4 contracts were not fundamentally broken, but the launch configuration was unacceptable for a retail launch.

Main failures:

- The live trading pool was a Uniswap v4 custom-hook pool, so normal Uniswap UI routing was not retail-friendly.
- The tax model was marketed as market-following, but the implementation used static `protocolDepth` values.
- The live tax vault accumulated USDC and had no compounder configured.
- The repo liquidity-removal script for v4 was stale and pointed at the wrong pool/token id.
- Multiple operational assumptions lived in docs/scripts and drifted from live state.

Outcome:

- LP liquidity has now been removed from the live v4 NARA/USDC pool.
- The tax vault still holds collected USDC separately.
- Full code and deployment redeploy is the correct next move.

## Live Incident Snapshot

Canonical live addresses involved in this incident:

- Token: `0x58c209B95350aFBEFa17137CEd209f8c4b7D896D`
- Engine: `0x9E8cE51805b13a4d75c324F75B06ABc00d9b1E03`
- Hook: `0x86ED92166aF1f97Fba75A9b12D9b1F7FfEE5E088`
- Tax vault: `0x58C3f6E6b005009B775C0912B003D39660D14391`
- Pool ID: `0x1d291f26281fb2a8dda28c0c35bd79251956dfef110266f4c53e62e65239ba34`
- LP NFT: `2187473`
- LP wallet: `0x290286870126c291594BC6Fa4Ed41DC4cF82020B`
- Vault owner / deployer wallet: `0xcf222f05911e3AbeF77F2A552C623c122522F670`

## What Actually Happened

### 1. Trading UX failure

The pool was deployed as a Uniswap v4 custom-hook pool.

That meant:

- direct scripted swaps worked because the exact `PoolKey` was known and manually encoded
- normal Uniswap UI users saw `No routes available`
- retail users could not simply open Uniswap and buy

This was not a token transfer restriction problem. The token itself has no owner/pause/blacklist path.

Relevant files:

- `contracts/v4/NARAToken.sol`
- `scripts/swapUsdcForNara.ts`

### 2. Tax model did not follow the market

The tax hook used static `protocolDepth` storage values:

- `300 USDC`
- `10,000 NARA`

Those values were set at launch and stayed fixed unless manually updated.

The hook therefore priced tax using:

- `trade size / configured depth`

It did **not** use:

- current live reserves
- current active pool liquidity
- current price
- current post-buy depletion

So the implementation did not match the intended product claim that tax should follow the market.

Relevant file:

- `contracts/v4/NARALiquidityTaxHook.sol`

### 3. Tax collection worked, but funds parked in vault

The hook tax was live and working.

Verified live state:

- buy/sell curves were on default values
- pool fee remained `0.3%`
- vault recorded tax correctly
- live recent swaps matched expected tax bands

But the vault had:

- `routeMode = Liquidity`
- `compounder = zero address`
- `keeper bounty = 0`

So the vault collected USDC and simply held it idle.

Verified vault balance after test trading:

- `28.800499 USDC`
- `0 NARA`

Relevant file:

- `contracts/v4/NARALiquidityTaxVault.sol`

### 4. Live LP was removed

The v4 pool LP was withdrawn.

Important result:

- LP position liquidity is now `0`
- LP NFT `2187473` still exists, but as an empty position

Post-pull wallet balances:

- LIQ wallet USDC: `632.951614`
- LIQ wallet NARA: `10029.831054062471830331`

The tax vault funds were not part of the LP pull and remain separate.

### 5. Repo operational script drift

The checked-in `scripts/removeV4Liquidity.ts` was stale and unusable for the live pool:

- hardcoded old token id
- hardcoded old NARA/ETH assumptions
- not aligned to the live NARA/USDC pool

This is a process failure, not just a coding failure. Scripts that move real funds must never drift from live configuration.

## Current Recoverable Funds

### LIQ wallet

After LP removal, the LP wallet holds approximately:

- `632.951614 USDC`
- `10029.831054062471830331 NARA`

### Tax vault

Separate from LP:

- `28.800499 USDC`
- held at `0x58C3f6E6b005009B775C0912B003D39660D14391`

### Important constraint

The tax vault has no direct owner sweep-to-EOA path.

The only real movement paths are:

- route into engine
- compound through a real compounder adapter

There is no production compounder adapter in this repo today. Only an interface and mocks exist.

So the vault funds should not be rushed into the old engine if the old stack is being abandoned.

## Verified Transactions During Incident

Trading txs executed during investigation included:

- `0xef2d55c95f3d2392e7f8e363b3d596b6417c00f0e8ed1ddbe912500efab6890d`
- `0x8ce1eb1dfa472cb87442cae7f7698855cc36bc6ab52731bd24aabd613bfda466`
- `0x46811569719a6993edfc82f506ea3b5283cdf96d1de172ca6e5a3c3be9549e2f`
- `0xa7b186d06386cad4cd183098bd311ad9fc8a9e0ca84296ffe53519c090e945a1`
- `0x4516dbc80028e7c2cf50fd6eafef7d6c0b1751e68d12cf63ecc023738309c9ac`
- `0x1c7a3c98e9e3becfb9d06b85b6152c42b34860326b4968a18ce9a4dc28ca5a03`
- `0x4103bd51758f325b6fc8c029a894cb76a3d1710b509656e4241c71104db45381`

LP removal tx:

- successful pull path: `0x2d5c6f1743e9be6a0cb81bb0691a80e8c5a00c65552e865d77e08047770e4c8c`

Expected revert after LP was already empty:

- `0x0f376267d3f6cf74399453639b52a862dd776192a51a8caffd3a1c540378fbef`

## Root Cause Summary

This incident came from a combination of product/engineering mismatches:

1. Built a custom-hook pool but expected retail UX from standard DEX frontends.
2. Described tax as market-following but implemented static-depth tax.
3. Launched with no production compounder while still relying on liquidity-mode vault routing.
4. Allowed live-operational scripts to drift from actual deployed state.
5. Let docs carry conflicting role ownership and pool state details.

## Non-Negotiable Fixes Before Redeploy

### Product / UX

- Decide explicitly whether launch is:
  - custom app-only pool
  - or standard DEX-routable pool
- Do not assume a custom-hook Uniswap v4 pool will be normie-friendly in third-party UIs.

### Hook logic

- Replace static `protocolDepth` tax logic if the product requirement is market-following tax.
- Either:
  - derive tax from live pool state, or
  - define clearly that depth is keeper-managed and not autonomous

### Vault routing

- Decide the intended route mode before launch:
  - `Liquidity`
  - `Engine`
  - `Split`
- If `Liquidity`, ship a real reviewed compounder first.
- If no production compounder exists, do not market automatic compounding.

### Scripts

- Update all live scripts so they take addresses/token ids from env or deployment logs.
- Remove hardcoded stale live values from liquidity and ops scripts.
- Add one preflight script that verifies:
  - pool id
  - hook
  - vault
  - LP NFT owner
  - LP NFT liquidity
  - route mode
  - compounder presence

### Docs

- Keep one canonical live-state file.
- All incident and redeploy notes must point back to that file.
- Record exact wallet separation:
  - LP wallet
  - deployer/vault owner wallet
  - admin wallet

## Recommended Redeploy Sequence

1. Treat the current v4 live pool as retired.
2. Preserve the parked tax vault funds until the new stack exists.
3. Fix the hook logic to match the intended product behavior.
4. Fix stale scripts before any redeploy.
5. Redeploy clean code and contracts.
6. After new engine exists, decide whether the old vault funds should be routed into the new engine or otherwise retired deliberately.

## Immediate Next Actions

1. Keep the 2026-04-23 incident stack retired.
2. Preserve historical addresses only for recovery and accounting.
3. Use the current growth-hook deploy path for any fresh v4 launch.
4. Run the current v4 preflight, smoke, and allocation verification scripts before public announcement.
5. Redeploy from corrected current code only.

## Fixes Landed In Repo

The immediate 2026-04-23 hardening work landed these historical fixes:

- `scripts/lib/v4LiveConfig.ts`
  - single shared source of truth for v4 live script defaults and env overrides
- `scripts/removeV4Liquidity.ts`
  - rewritten to use configured token/base addresses and the live LP NFT id instead of stale NARA/ETH assumptions
- `scripts/swapUsdcForNara.ts`
  - rewritten to use shared config instead of hardcoded pool addresses
- `scripts/seedV4Liquidity.ts`
  - updated to use shared config and avoid hidden one-off live values
- `scripts/verifyV4Preflight.ts`
  - new preflight script for hook/vault/pool id/LP NFT/tax-routing checks
- retired `contracts/v4/NARALiquidityTaxHook.sol`
  - tax pressure hardening was added during the incident response, but this path is no longer the current launch hook

The current v4 launch path now uses:

- `contracts/v4/NARALiquidityGrowthHook.sol`
- `contracts/v4/NARALiquidityGrowthVault.sol`
- `scripts/deployV4BaseUsdc.ts`
- `scripts/verifyV4Preflight.ts`
- `scripts/smokeTestV4Deployment.ts`

Required operator rule going forward:

1. Deploy.
2. Run `npm run verify:v4:preflight`.
3. Only seed/open after preflight passes and findings are understood.

## Bottom Line

The issue was not a single broken contract. It was a launch stack whose behavior, routing assumptions, and operations tooling did not line up with the intended public product.

Do not reuse the current configuration as a public launch candidate.
