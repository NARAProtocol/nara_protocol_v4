# NARA v4 Dashboard Specification

Last updated: 2026-05-28.  
Audience: frontend developers and designers building any NARA v4 app.  
Source contracts: `NARADashboardLens`, `NARARouter`, `NARAEngine`, `NARAPositionNFTV4`.

---

## One-Call Data Source

Every dashboard panel derives from a single RPC call:

```typescript
const state = await lens.getUserState(
  userAddress,
  positionIds,    // uint256[] from Locked event logs or prior scan
  nftTokenIds,    // uint256[] from ERC-721 Transfer event logs
);
```

`positionIds` and `nftTokenIds` are supplied by the frontend from indexed event logs. The lens does not iterate — it accepts explicit IDs. Maximum 100 per array.

For epoch state only (cheap, no wallet context):
```typescript
const epoch = await lens.getEpochState();
// { currentEpoch, settledEpoch, backlog, syncRequired }
```

For lock preview (before user confirms):
```typescript
const [netAmount, weight, lockFeeEth] = await lens.previewLock(grossAmount, durationEpochs);
```

---

## Returned Data Structure

```
UserDashboardState {
  // Wallet
  ethBalance          uint256
  naraBalance         uint256
  naraAllowanceEngine uint256
  naraAllowanceRouter uint256

  // Epoch
  epoch {
    currentEpoch  uint64
    settledEpoch  uint64
    backlog       uint256
    syncRequired  bool
  }

  // Fee config (read once per session, cache)
  fees {
    lockFeeBps            uint16
    claimFeeBps           uint16
    lockFeeWei            uint96
    unlockFeeWei          uint96
    maxLockEpochs         uint64
    activationDelayEpochs uint64
  }

  // Protocol totals
  activeTotalWeight       uint256
  totalLocked             uint256
  emissionReserveAvailable uint256
  rewardReserveAvailable  uint256

  // Direct engine positions
  positions[] {
    positionId      uint256
    owner           address
    activationEpoch uint64
    unlockEpoch     uint64
    amount          uint128
    weight          uint128
    claimableNara   uint256
    claimableEth    uint256
    active          bool
    matured         bool
  }

  // NFT-wrapped positions
  nftPositions[] {
    tokenId              uint256
    positionId           uint256
    owner                address
    activationEpoch      uint64
    unlockEpoch          uint64
    amount               uint128
    weight               uint128
    claimableNara        uint256
    claimableEth         uint256
    claimableGenesisEth  uint256
    claimableGenesisToken uint256
    active               bool
    matured              bool
  }
}
```

---

## Panel Specifications

### Epoch Strip (always visible, top of every page)

| Field | Source | Display |
|---|---|---|
| Live epoch | `state.epoch.currentEpoch` | `Epoch {n}` |
| Settled epoch | `state.epoch.settledEpoch` | `Settled {n}` |
| Sync required | `state.epoch.syncRequired` | Quiet "syncing" pill when true |
| Backlog | `state.epoch.backlog` | Show if > 0 |

Do not block the UI on sync. The router auto-syncs on every user write. Show epoch state as informational only. Never show "poke" or "advance epoch" buttons to users.

**Auto-sync trigger (Base Smart Wallet only):**
```typescript
useEffect(() => {
  if (!syncRequired || backlog === 0n) return;
  sendCalls([{ to: NARA_ROUTER_ADDRESS, abi: routerAbi, functionName: 'syncEpochs' }])
    .catch(() => {}); // silent failure OK — next user write will sync
}, [syncRequired]);
```

---

### Wallet Bar

| Field | Source | Display |
|---|---|---|
| ETH balance | `state.ethBalance` | `{n} ETH` |
| NARA balance | `state.naraBalance` | `{n} NARA` |
| Router allowance | `state.naraAllowanceRouter` | Used internally to decide if permit needed |
| Engine allowance | `state.naraAllowanceEngine` | Used internally for direct lock path |

Show allowance to user only if it would block an action. No raw allowance numbers.

---

### Protocol Totals Panel

| Field | Source | Display |
|---|---|---|
| Total locked | `state.totalLocked` | `{n} NARA locked` |
| Active weight | `state.activeTotalWeight` | `{n} weight` |
| Emission reserve | `state.emissionReserveAvailable` | `{n} NARA remaining` |
| Reward reserve | `state.rewardReserveAvailable` | `{n} NARA` |

---

### Fee Panel (show before lock flow)

| Field | Source | Display |
|---|---|---|
| Lock fee | `state.fees.lockFeeBps` | `{n/100}%` |
| Lock ETH fee | `state.fees.lockFeeWei` | `{n} ETH` |
| Unlock ETH fee | `state.fees.unlockFeeWei` | `{n} ETH` |
| Max duration | `state.fees.maxLockEpochs` | `{n} epochs (~{days} days)` |
| Activation delay | `state.fees.activationDelayEpochs` | `{n} epochs (~{hours})` |

---

### Lock Preview Panel (before confirm)

Call once per user input change (debounce 500ms):
```typescript
const [netAmount, weight, lockFeeEth] = await lens.previewLock(amount, durationEpochs);
```

Display:
- Gross amount entered
- Fee deducted: `(amount × lockFeeBps) / 10,000`
- Net NARA locked: `netAmount`
- Position weight: `weight`
- Your weight share: `weight / state.activeTotalWeight` (after lock)
- ETH fee required: `lockFeeEth`

---

### My Positions Panel

Source: `state.positions[]` + `state.nftPositions[]`

For each position show:

| Field | Source | Display |
|---|---|---|
| Status | `active`, `matured`, else pending | Active / Pending activation / Matured |
| Amount locked | `amount` | `{n} NARA` |
| Weight | `weight` | `{n}` |
| Epochs to unlock | `unlockEpoch - state.epoch.settledEpoch` | `{n} epochs (~{time})` |
| Claimable NARA | `claimableNara` | `{n} NARA` |
| Claimable ETH | `claimableEth` | `{n} ETH` |
| Claimable genesis ETH | `claimableGenesisEth` (NFT only) | `{n} ETH` |
| Claimable genesis token | `claimableGenesisToken` (NFT only) | `{n}` |

Actions per position:

| State | Actions |
|---|---|
| Pending activation | None. Show "Activates in {n} epochs." |
| Active | Claim, Extend |
| Matured | Claim + Unlock (single batch) |

---

### No Positions Empty State

```
No positions.
```

One CTA: `Create Position`.

---

## Write Flows (EIP-5792 Batch Pattern)

All write flows bundle `router.syncEpochs()` first for Smart Wallet users. EOA users get sequential txs.

**Create Position:**
```
[router.syncEpochs(), router.syncAndLockWithPermit(amount, duration, minWeight, deadline, v, r, s)]
```

**Claim:**
```
[router.syncEpochs(), nft.claimRewards(tokenId, to)]
```

**Compound (Claim + Relock):**
```
[router.syncEpochs(), nft.claimRewards(tokenId, to), router.syncAndLockWithPermit(claimedAmount, duration, 0, deadline, v, r, s)]
```

**Unlock:**
```
[router.syncEpochs(), nft.unlockTo(tokenId, userAddress)]
```

---

## Loading States

- First load: show skeleton cards while `getUserState()` resolves.
- Epoch strip: always visible, even during load (cheap `getEpochState()` resolves first).
- After a write: refetch `getUserState()` once tx confirms. Do not optimistically update positions.

---

## Error States

| Error | Message |
|---|---|
| `EpochStale` | Handled silently — router auto-syncs. If persists, show: "Syncing epoch…" |
| `SlippageExceeded` | "Position weight fell below your minimum. Retry or lower your slippage guard." |
| `InsufficientFee` | "Add {n} ETH to cover the lock fee." |
| `LockTooShort` | "Duration must be longer than the activation delay ({n} epochs)." |
| Wallet rejected | "Transaction cancelled." |
| RPC error | "Unable to read chain state. Retry in a moment." |

---

## Refresh Cadence

| Data | Refresh | Why |
|---|---|---|
| `getUserState()` | On tx confirm + every 60s | Positions and rewards change each epoch |
| `getEpochState()` | Every 15s | Cheap; drives sync-required state |
| `previewLock()` | On user input change (500ms debounce) | Price estimate only |

---

## Copy Rules

Per the CLAUDE.md canonical UI rules:

- Position count: `No positions.` (not "You don't have any positions yet")
- Lock action: `Create Position` (not "Lock NARA")
- Claim + relock: `Compound` (not "Claim and Relock")
- Exit: `Unlock` (not "Withdraw")
- Epoch terms: `Live epoch` / `Settled epoch` / `Backlog` (not "current"/"last"/"pending")
- Status: `Active` / `Pending activation` / `Matured` (not "live"/"waiting"/"done")
