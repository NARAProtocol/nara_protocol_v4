# NARA v4 Custody And Governance Plan

Last updated: 2026-07-28.
Status: **approved plan, not executed**. No transaction is authorized by this
document. Executing it produces the custody evidence that closes the
"custody/recovery acceptance" gate in [CURRENT_STATE.md](CURRENT_STATE.md).

Scope: the fresh v4 Stage A stack only. The v3 recovery map lives in
[NARA_CUSTODY_AND_RECOVERY.md](NARA_CUSTODY_AND_RECOVERY.md) and is historical.

Decisions recorded 2026-07-28:

- Signer capacity: operator plus 2–4 trusted people → **3-of-5 Safes**.
- Treasury commitment: **240,000 NARA locked in the v4 engine**
  (200,000 bond-inventory tranche + 40,000 team-vesting tranche),
  leaving 110,000 NARA liquid — matching the planned genesis circulating
  disclosure in [SUPPLY_ALLOCATION.md](SUPPLY_ALLOCATION.md).

---

## 1. Audited Current Custody State

As deployed 2026-07-26 (evidence: `deployments/v4-base-usdc-latest.json`).

| Holder | Address | Powers |
|---|---|---|
| Final admin EOA | `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` | Engine `DEFAULT_ADMIN` + `PARAM_ROLE` + `TREASURY_ROLE` and, as of the 2026-07-28 read, `REWARD_NOTIFIER_ROLE` that must be revoked; reserve `DEFAULT_ADMIN` + `ADMIN_ROLE` + `ENGINE_SETTER_ROLE`; owner of the Stage A hook, vault, compounder, and Create2 deployer |
| Treasury EOA | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` | Holds 350,000 NARA (35% of fixed supply), unrestricted |
| Deployer EOA | `0xcf222f05911e3AbeF77F2A552C623c122522F670` | No remaining roles (renounced in Stage A step 10) |

Highest-impact retained powers, ranked:

1. Treasury EOA can transfer/sell 350,000 NARA at will — no contract restricts it.
2. Hook `setFeeCurve` up to `MAX_POOL_FEE_BPS = 5,000` (50%), delay `FEE_UPDATE_DELAY = 1 day`.
3. Vault `setCompounder` — single-tx redirect of the fee skim while `compounderFrozen == false`.
4. Replacement vault `setRouteMode` / Genesis split share — instant redirect
   among `Liquidity`, `Genesis`, and `GenesisSplit`; `Engine` and `Split`
   permanently revert.
5. Compounder POL removal — bounded by the 7-day propose→execute recovery timelock.
6. Engine params — bounded by `MAX_FEE_BPS = 1,000`, `MAX_FLAT_ETH_FEE = 0.01 ether`,
   and the `CONFIG_CHANGE_DELAY = 1 day` staged-config timelock.

## 2. Immutable Properties (no action required — publish these)

- `NARAToken`: zero privileged functions. No mint, pause, blacklist, or owner.
- `NARARewardReserve`: 650,000 NARA sealed. `setNara`/`setEngine` are one-shot and
  already consumed; `releaseToEngine` callable only by the engine; NARA sweep
  reverts `NaraSweepForbidden`. A compromised admin cannot extract the reserve.
- `NARALauncher`: one-shot, no owner.
- Locked user principal has no admin seizure path in the engine.
- `freezeCompounder()` permanently disables `setCompounder`.

## 3. Target Topology

```
Safe A — Protocol Admin (Base, 3-of-5)
  engine roles · reserve roles · hook owner¹ · vault owner¹ ·
  compounder owner · Create2 deployer owner
Safe B — Treasury (Base, 3-of-5, different signer mix)
  350,000 NARA → 240,000 engine-locked + 110,000 liquid · protocol USDC/ETH
  never holds admin powers
Keeper EOA — ops hot wallet (low value)
  vault compound keeper only (bounty capped MAX_KEEPER_BOUNTY_BPS = 1,000)
TimelockController — 48h (Phase 2)
  ¹ hook and vault ownership move Safe A → Timelock after the flywheel freeze
```

Rationale for two Safes: one Safe holding both admin powers and 35% of supply is
a single blast radius. Different signer composition on Safe B means no single
3-person subset controls both protocol and treasury.

### Signer requirements

- Five signers per Safe, threshold 3. Hardware wallets only.
- Each signer key on its own seed phrase. Never multiple signer keys from one
  seed — that is one key wearing a costume.
- No signer stores a seed backup in the same physical location as another
  signer's key. Operator holds at most 2 of 5 keys per Safe.
- Each signer executes one harmless test signature during setup.
- Disclose per Safe: address, threshold, signer count, and operator key share.
  Signer identities may stay pseudonymous; the structure may not.

### Timelock parameters (Phase 2)

- OpenZeppelin `TimelockController`, `minDelay = 172,800` (48h).
- Proposer: Safe A. Executor: Safe A. Canceller: Safe A.
- `DEFAULT_ADMIN_ROLE` renounced after configuration.
- Covers the never-freezable reachable vault levers (`setRouteMode`, Genesis split share,
  keeper set, `setEngine`, `setGenesisRewardDistributor`) and the hook levers
  (`setFeeCurve`/`executeFeeCurve`, `setProtocolDepth`/`executeProtocolDepth`),
  stacking 48h on top of the hook's own 1-day delay.

## 4. ⚠️ Ownership-Transfer Hazard

`NARALiquidityGrowthHook` and `NARALiquidityGrowthVault` are plain `Ownable` —
single-step, irreversible `transferOwnership`. A transfer to a wrong or
uncontrolled address permanently bricks pool registration, fee curves, protocol
depth, and route mode. `NARALiquidityCompounderV4` is `Ownable2Step` (safe).

Mandatory before any single-step transfer:

1. The receiving Safe/timelock already exists **on Base** (chain id 8453).
2. A harmless transaction has been executed **from** the receiver to prove control.
3. Transfers happen one contract at a time, `owner()` read back after each.
4. The single-step contracts (vault, hook) go **last**.

## 5. Phase 1 Runbook — before pool initialization

Post-seed, every role change is priced by a live market and reads as
suspicious; pre-seed it is free. All steps below are Safe/EOA transactions
requiring explicit operator execution — nothing here is automated.

1. Deploy Safe A and Safe B on Base. Record addresses, thresholds, signer
   counts in `deployments/v4-custody-2026-07-XX.json`.
2. Prove control: one 0-value self-transaction from each Safe.
3. Engine roles, from `0xC019…490d`, **grant before renounce**:
   - `grantRole(DEFAULT_ADMIN_ROLE, SafeA)` → verify `hasRole`
   - `grantRole(PARAM_ROLE, SafeA)`, `grantRole(TREASURY_ROLE, SafeA)` → verify
   - do **not** grant `REWARD_NOTIFIER_ROLE` to Safe A or the replacement vault
   - revoke `REWARD_NOTIFIER_ROLE` from the current admin EOA and Stage A vault,
     then verify both reads are false
   - then `renounceRole(...)` for each role from the EOA → verify removal
4. Reserve roles, same grant→verify→renounce pattern for `DEFAULT_ADMIN_ROLE`,
   `ADMIN_ROLE`, `ENGINE_SETTER_ROLE`. (Both setters are consumed; this is
   hygiene, not live power.)
5. Compounder: `transferOwnership(SafeA)` from the EOA, then `acceptOwnership()`
   from Safe A. Verify `owner()`.
6. Create2 deployer: `transferOwnership(SafeA)`. Verify `owner()`.
7. **Last, one at a time** (single-step, irreversible):
   `vault.transferOwnership(SafeA)` → verify `owner()` →
   `hook.transferOwnership(SafeA)` → verify `owner()`.
8. Treasury: move 350,000 NARA from `0xfe3A…1E8e` to Safe B. Verify balance.
9. Execute the treasury lock commitment (section 6) from Safe B.
10. Re-run `npm run verify:v4:preseed`. Record all tx hashes in the custody
    evidence file. Update `CURRENT_STATE.md`.

Only after all ten steps: fund Safe A with the exact seed assets and execute the
launch runbook's single atomic register-initialize-seed batch. The hook must
remain unregistered before that batch.

## 6. Phase 2 Runbook — after seed, smoke test, and flywheel freeze

1. Complete the live-compound smoke test and `vault.freezeCompounder()` while
   the vault is still on Safe A (avoids 48h queues during launch validation).
2. Deploy `TimelockController` with the parameters in section 3.
3. Prove control: schedule and execute a no-op through the timelock via Safe A.
4. `vault.transferOwnership(Timelock)` → verify → `hook.transferOwnership(Timelock)`
   → verify. From this point every fee-curve, depth, and routing change is
   publicly queued for 48h on top of any contract-native delay.
5. Record evidence; update `CURRENT_STATE.md` and the disclosure page.

## 7. Treasury Lock Commitment — 240,000 NARA

Executed from Safe B against `NARAEngine.lock(amount, durationEpochs, minWeight)`.

| Tranche | Amount | Duration | Note |
|---|---:|---|---|
| Bond inventory | 200,000 NARA | 35,040 epochs (365 days) | Bonds cannot open from this inventory before maturity — intentional; bond activation is already deferred until ≈$1 NARA per the activation strategy |
| Team vesting | 40,000 NARA | 35,040 epochs (365 days) | Replaces an off-chain vesting promise with an on-chain lock |

- 35,040 epochs is the deployed `maxLockEpochs` (900s epochs → exactly 1 year).
- Verify live `lockFeeBps` and `lockFeeWei` before execution; a nonzero
  percentage lock fee would burn into the committed amount.
- Publish both position ids, amounts, and unlock epochs on the disclosure page.
- At maturity, re-lock or move to the bond vault as a fresh disclosed decision.

### Emissions policy for the commitment positions

At launch these positions will hold nearly all active weight and would capture
nearly all engine emissions — undisclosed, that reads as self-dealing. Policy:

- **NARA emissions claimed by the commitment positions are burned** (transfer
  to `0x…dEaD`), verifiable on-chain. The treasury takes zero emission yield
  from its own commitment. (Alternative if preferred: transfer into the reward
  reserve, where NARA is unsweepable — economically equivalent to a burn.)
- Non-NARA rewards (ETH/USDC) accrued by these positions go to Safe B and are
  itemized on the disclosure page.
- This policy is published before seeding and every claim links its burn tx.

## 8. Disclosure Page (required before public activation)

One public page listing, with no omissions:

- Every deployed contract, its owner or role holders, and the exact addresses.
- Safe A / Safe B addresses, thresholds, signer counts, operator key share.
- Every timelock: compounder 7-day recovery, hook 1-day fee/depth delay,
  engine 1-day config delay, Phase 2 48h `TimelockController`.
- Every hard cap: `MAX_FEE_BPS = 1,000`, `MAX_FLAT_ETH_FEE = 0.01 ether`,
  `MAX_POOL_FEE_BPS = 5,000`, `MAX_KEEPER_BOUNTY_BPS = 1,000`,
  `MAX_JIT_ADVANCE = 8`, fixed supply 1,000,000.
- Every retained power — including the uncomfortable ones: the 50% pool-fee
  ceiling, route-mode control, and the compounder recovery levers. Disclosed
  bounded power is trusted; discovered power is not.
- The treasury map: 240,000 locked (position ids), 110,000 liquid (purpose:
  70,000 liquidity envelope + 40,000 operations), emissions-burn policy.
- The power-reduction schedule (section 9).

## 9. Power-Reduction Schedule (publish as commitments)

1. At seed: custody per Phase 1 (all powers on 3-of-5 Safes, treasury committed).
2. Post-smoke-test: `freezeCompounder()` — compounder swap permanently dead.
3. Post-freeze: hook + vault behind the 48h timelock (Phase 2).
4. Ongoing: fee curves stay within a published envelope well below the 50%
   ceiling; any change is announced when queued, 48h + 1 day before effect.
5. Battle-tested milestone (published criteria, e.g. audit + N months live):
   evaluate transferring compounder ownership to the timelock or renouncing —
   graduating POL from owner-recoverable to permanent, as documented in
   `NARALiquidityCompounderV4`.

## 10. Evidence Artifacts

Executing this plan must produce `deployments/v4-custody-<date>.json` recording:
Safe addresses/thresholds, timelock address/delay, every grant/renounce/transfer
tx hash, post-state reads (`hasRole`, `owner()`), treasury transfer tx, lock txs
and position ids. `CURRENT_STATE.md` is updated in the same change set — that
update, plus this file, closes the custody gate.

## 11. What This Plan Does Not Do

- It does not authorize any transaction by itself.
- It does not make the treasury unable to act — it makes every action
  multi-party, delayed where dangerous, and publicly disclosed.
- It does not substitute for the audit/legal gates in
  [NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md](NARA_V4_BASKETS_AUDIT_GOVERNANCE_LEGAL.md).
- The Safe/timelock deployment, signer ceremony, and every on-chain step
  require explicit human execution and approval.
