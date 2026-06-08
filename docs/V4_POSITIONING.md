# NARA v4 Positioning and Promo Copy

Last updated: 2026-05-27.

This document is the internal source for public-facing v4 language. Code is the source of truth. Use this file to keep social posts, replies, and launch copy accurate without leaking deployment-sensitive details.

---

## Status Guardrail

- v3 status: the v3 protocol stack was retired on 2026-05-27. The v3 token and contracts remain on-chain but are no longer the active protocol.
- v4 status: implemented in this repository and pending a fresh clean redeploy. No approved public v4 launch candidate has been deployed yet.
- Retired stack: any v4 deployment from 2026-04-23 is not the launch candidate.
- Public rule: do not say v4 is live, active, or earning rewards until the fresh deployment is verified and officially announced.

---

## Public Safety Rules

Do not reveal in public replies:

- Contract addresses before the official announcement.
- Deployment timing, launch timing, or private readiness state.
- Bond opening conditions, capacity settings, liquidity thresholds, or route-mode switch criteria.
- Internal allocation numbers, treasury amounts, ops float, seed liquidity, or reserved launch balances.
- Unresolved integration gaps, testing gaps, private audit findings, or internal remediation notes.
- Function names, exact constants, or contract architecture unless that detail is already intentionally public.

Safe public framing:

- NARA is a Base-native commitment protocol.
- NARA rewards duration and committed capital.
- The current public system is already on Base.
- v4 is designed around NFT-owned commitments, USDC liquidity, and protocol-controlled reward routing.
- Exact addresses and flows will be published only after the fresh deployment is verified.

Default rule: if a reply would expose timing, thresholds, addresses, allocation values, or unannounced mechanics, do not post it.

---

## NARA Language

Use NARA vocabulary instead of competitor framing.

| External framing | NARA framing |
| --- | --- |
| upstream or downstream | commitment layer or settlement layer |
| routes the flow | epoch settlement or reward routing |
| captures value | lockers earn through weight-based settlement |
| agent-routed intent | self-advancing engine |
| auctioned execution | pressure-based pool fees |
| sticky liquidity | committed capital |
| full loop | sealed reserve cycle |

---

## Approved Public Language

### One-Liner

> NARA is a commitment engine: lock time, earn protocol rewards, and carry your position as an on-chain asset.

### Short Reply

> NARA turns commitment into an on-chain position. The protocol rewards duration, routes rewards through explicit settlement, and makes positions portable instead of hiding them inside an account balance.

### Technical But Public-Safe

> v4 is designed around NFT-owned commitments, USDC liquidity, and protocol-controlled reward routing. We will publish addresses and exact flows only after the fresh deployment is verified.

### Competitor Framing Reply

> NARA is not a downstream fee sink. It is the commitment layer: duration, settlement, and reward routing are protocol decisions.

Stop after the short reply. Do not explain private architecture in public threads.

---

## Do Not Say

- "v4 is live."
- "Every swap, every bond, and every game fee is already paying lockers."
- "Bonds are open."
- "stNARA, Pendle integrations, fractional wrappers, lending markets, or collateral integrations are live."
- "Bond NFTs are collateral-ready."
- "The launch is on a specific date."
- "The pool opens at a specific threshold."
- "The ops vault contains a specific amount."

These statements are either not true for the current public deployment, disclose private readiness data, or describe integrations that are not live.

---

## Internal Technical Anchors

Use this section for internal accuracy checks. Do not paste these details into public replies unless the team has approved the disclosure.

- `NARAToken` has `MAX_SUPPLY = 1_000_000 ether` and mints once in the constructor.
- `NARAEngine` has `MAX_JIT_ADVANCE = 8`; mutating calls revert `EpochStale` if backlog remains after the capped JIT advance.
- `NARAEngine` supports permissionless `notifyEthRewards()` plus role-gated `notifyTokenRewards(address token, uint256 amount)`.
- `NARAEngine` only accepts direct ETH through `notifyEthRewards()`; stray ETH transfers revert.
- `NARAEngine` supports position lock, extend, claim, token reward claim, and unlock flows through explicit position ownership.
- `NARAPositionNFTV4` wraps engine positions in ERC-721 ownership through one clone account per NFT.
- `NARAPositionNFTV4` exposes `mintAndLock`, `mintAndLockFor`, `mintAndLockWithPermit`, and `mintGenesisAndLockFor`.
- `NARAPositionNFTV4` exposes `claimRewards`, `claimTokenRewards`, `claimGenesisEth`, and `claimGenesisToken`.
- `NARAPositionNFTV4` caps Genesis reward multipliers at `MAX_GENESIS_REWARD_MULTIPLIER_BPS = 50_000`, equal to a 5x internal multiplier cap.
- `NARALiquidityGrowthHook` applies exact-input pool-level fees and rejects unsupported exact-output swaps.
- `NARALiquidityGrowthHook` has separate buy and sell pressure curves with base, medium, high, and extreme tiers.
- `NARALiquidityGrowthHook` fee configuration is bounded by `MAX_POOL_FEE_BPS = 5_000` and delayed by `FEE_UPDATE_DELAY = 1 days`.
- `NARALiquidityGrowthHook` requires official pool registration and rejects nonzero protocol depth below `MIN_PROTOCOL_DEPTH = 1_000_000`.
- `NARALiquidityGrowthVault` route modes are `Liquidity`, `Engine`, `Split`, `Genesis`, and `GenesisSplit`.
- `NARALiquidityGrowthVault` records ERC-20 pool fees and can compound liquidity, route to the engine, route to the Genesis distributor, or split according to configured shares.
- `NARABondDepositoryV4NFT` mints `NARAPositionNFTV4` positions for bond purchases when terms are active and capacity remains.
- `scripts/deployV4Allocations.ts` defaults `V4_BOND_ACTIVE=false`; public copy must not imply bonds are open.
- `NARAOpsVaultV4` enforces `MAX_OPS_ALLOCATION = 10_000e18`, but `scripts/deployV4Allocations.ts` defaults `V4_OPS_AMOUNT_NARA=0`; do not publish an ops allocation amount unless the final deployment uses one and the team approves disclosure.

---

## Trust Anchors

These are safe as internal review points and may become public once deployment materials are finalized:

- Fixed maximum NARA supply.
- Sealed reward reserve design.
- Weight-based settlement.
- NFT-owned positions.
- Explicit reward routing instead of implicit balance changes.
- Fresh v4 redeploy required before public v4 launch claims.

---

## Source Notes

When this document conflicts with code, update this document. Current source references:

- `contracts/v4/NARAToken.sol`
- `contracts/v4/NARAEngine.sol`
- `contracts/v4/NARAPositionNFTV4.sol`
- `contracts/v4/NARALiquidityGrowthHook.sol`
- `contracts/v4/NARALiquidityGrowthVault.sol`
- `contracts/v4/NARABondDepositoryV4NFT.sol`
- `contracts/v4/NARAOpsVaultV4.sol`
- `scripts/deployV4Allocations.ts`
