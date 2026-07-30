# NARAEngineV2 Ops Runbook (v3 — Retired)

Last updated: 2026-05-27.

Status: v3 engine operations reference. v3 is retired as of 2026-05-27. This runbook is preserved as historical reference for the v3 engine at `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F`. Do not use these addresses or cron instructions for v4 operations.

**v4 differences from v3:**
- No `EPOCH_ROLE` in v4. Epoch advancement is JIT (auto-triggered on `lock`/`unlock`/`claim` calls). No keeper cron needed.
- v4 `notifyEthRewards` is permissionless. `REWARD_NOTIFIER_ROLE` gates only
  `notifyTokenRewards`, which is disabled operationally for the deployed engine.
- The current v4 engine address and launch gates are in `CURRENT_STATE.md`.
- `npm run check:nara:live` is removed in v4. Read state directly from v4 contract addresses.

## Roles

| Role | Hex | What it controls |
|------|-----|-----------------|
| `DEFAULT_ADMIN_ROLE` | `0x00` | Grant/revoke all roles |
| `PARAM_ROLE` | `keccak256("PARAM_ROLE")` | Fee settings, config proposals |
| `TREASURY_ROLE` | `keccak256("TREASURY_ROLE")` | Treasury address, fee withdrawals, sweeps |
| `EPOCH_ROLE` | `keccak256("EPOCH_ROLE")` | advanceEpoch / advanceEpochs (cron — **v3 only, no equivalent in v4**) |

Engine address (v3, retired): `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F`

---

## sweepExcessNative — ⚠️ DO NOT CALL UNDER NORMAL OPERATION

### Why this function almost never has a legitimate use

Every ETH-receiving path in the engine is accounted for:
- `receive() external payable` ([L231](../archive/legacy-v3/contracts/NARAEngineV2.sol#L231)) — routes direct transfers to `_queueEthRewards`, which goes into rewards.
- `notifyEthRewards()` ([L306](../archive/legacy-v3/contracts/NARAEngineV2.sol#L306)) — same.
- `lock()` / `unlock()` / `unlockBatch()` — `msg.value` goes to `accumulatedTreasuryEthFees`.

**The only way "excess" ETH can appear in the contract is:**
1. A `selfdestruct` from another contract force-sending ETH (bypasses `receive`).
2. Block coinbase rewards to this address (not possible here).
3. An accounting bug.

If you see non-zero "excess" and none of the above is obviously true, **stop and investigate** before sweeping.

### The H-4 bug (why this matters even when you do sweep)

The on-chain safety check at [L402](../archive/legacy-v3/contracts/NARAEngineV2.sol#L402):

```solidity
uint256 reserved = totalEthRewardsReceived - totalEthRewardsClaimed - totalEthSweptToTreasury;
if (address(this).balance < reserved + amount) revert InsufficientExcessNative();
```

**`accumulatedTreasuryEthFees` is NOT subtracted.** Naive callers can sweep ETH that is owed as pending treasury fees. The next `withdrawTreasuryEthFees` will then revert or drain incorrectly.

The contract is deployed and cannot be changed. Enforce the correct formula off-chain.

### Correct safe sweep formula

```
safe_sweep_amount = address(engine).balance
                  - (totalEthRewardsReceived - totalEthRewardsClaimed - totalEthSweptToTreasury)
                  - accumulatedTreasuryEthFees
                  - safety_buffer   // recommend: 0.005 ETH minimum
```

### Computing `totalEthSweptToTreasury` off-chain

Note: `totalEthSweptToTreasury` is an `internal` state variable ([L91](../archive/legacy-v3/contracts/NARAEngineV2.sol#L91)) — **no public getter exists.** Reconstruct it by summing all `TreasuryEthFeesWithdrawn(address indexed to, uint256 amount)` event logs from contract genesis:

```ts
const filter = engine.filters.TreasuryEthFeesWithdrawn();
const logs = await engine.queryFilter(filter, 0, "latest");
const totalEthSweptToTreasury = logs.reduce((sum, ev) => sum + ev.args.amount, 0n);
```

Cache this result; only fetch incremental logs on subsequent runs.

### Mandatory procedure

1. Call `withdrawTreasuryEthFees(treasury)` first if `accumulatedTreasuryEthFees > 0`. Zeroes the accumulator and removes ambiguity.
2. Query the engine balance after withdrawal settles.
3. Read `totalEthRewardsReceived`, `totalEthRewardsClaimed` (public getters).
4. Reconstruct `totalEthSweptToTreasury` from event logs (see above).
5. Compute `reserved = totalEthRewardsReceived - totalEthRewardsClaimed - totalEthSweptToTreasury`.
6. Compute `excess = balance - reserved`.
7. Subtract a `safety_buffer` (≥ 0.005 ETH).
8. Pass `amount ≤ excess - safety_buffer` to `sweepExcessNative`.

**Never skip step 1. Never guess. Compute it.**

---

## withdrawTreasuryEthFees

Callable by `TREASURY_ROLE`. Drains `accumulatedTreasuryEthFees` to `to`.

Safe to call at any time. Call this first before any sweep.

---

## Fee parameters

| Parameter | Current value | Setter | Argument | Role |
|-----------|--------------|--------|----------|------|
| `lockFeeBps` | 200 (2%) | `setLockFee(uint16 feeBps)` | basis points (max 1000) | PARAM_ROLE |
| `claimFeeBps` | 500 (5%) | `setClaimFee(uint16 feeBps)` | basis points (max 1000) | PARAM_ROLE |
| `lockFeeWei` | 0.0001 ETH | `setLockEthFee(uint96 feeWei)` | Wei (flat ETH) | PARAM_ROLE |
| `unlockFeeWei` | 0.001 ETH | `setUnlockEthFee(uint96 feeWei)` | Wei (flat ETH) | PARAM_ROLE |

`setLockFee` / `setClaimFee` are **percentage** setters (bps), capped at `MAX_FEE_BPS = 1000` (10%).
`setLockEthFee` / `setUnlockEthFee` are **flat ETH** setters that take Wei directly. No bps conversion.

Do not confuse `setLockFee(bps)` with `setLockEthFee(wei)` — they set different state variables.

---

## Config timelock

The engine uses a `ConfigProposed` → `ConfigStaged` timelock pattern for governance-sensitive parameters.

- **Watch for `ConfigProposed` events.** This is your window to react before a change goes live.
- Any PARAM_ROLE holder can propose; the timelock delay is configured at deployment.

---

## Liveness check

`currentEpoch()` is derived from block time. `epochState.epoch` is the last settled on-chain epoch.

```
backlog = currentEpoch() - epochState.epoch
```

- Backlog 0: healthy.
- Backlog 1: normal (v3 cron ran every 15 min; **v4 uses JIT advance** — no cron required, backlog is drained on the next user action).
- Backlog ≥ 2 in v3: cron down — investigate immediately.
- Backlog ≥ 9 in v4: exceeds the JIT advance cap (`MAX_JIT_ADVANCE = 8`). `onTransferReceived` reverts `EpochStale` on any backlog; `lock`/`unlock`/`claim` self-advance up to 8 epochs. Manual `advanceEpochs(n)` required beyond 8.

v3 cron was at `cron/` (Railway). v4 has no epoch keeper.

---

## Daily invariant checks

_v3: run `npm run check:nara:live` from `nara-protocol-hardhat/`. This command does not exist in v4. For v4, read live state directly from the v4 engine address in `CURRENT_STATE.md`._

Verify:
- NARA engine balance ≈ total locked NARA (should track closely)
- ETH engine balance ≥ `accumulatedTreasuryEthFees` (always true if accounting is intact)
- `totalEthRewardsReceived - totalEthRewardsClaimed - totalEthSweptToTreasury` ≤ ETH balance
- No unexpected role grants in recent blocks

---

## Emergency contacts / escalation

_v3 addresses (retired):_
- Owner signer: `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`
- Treasury parameter wallet: `0x39139CA6cB1b2330a612D28691a0E66E0af69a40`
- Token treasury wallet: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`

_v4: admin and treasury addresses will be recorded in `CURRENT_STATE.md` after fresh v4 deploy._
