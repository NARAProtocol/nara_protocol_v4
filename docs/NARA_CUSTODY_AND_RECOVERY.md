# NARA Custody And Recovery

Last updated: 2026-05-27.

Purpose: list the retired v3 Base addresses that custody NARA, whether that NARA is recoverable, and under what condition it can be pulled out.

v3 is retired as of 2026-05-27. These contracts are no longer the active protocol, but the underlying on-chain positions still exist and must be managed by their wallet owners. Use `docs/CURRENT_STATE.md` as the v4 address source of truth once fresh v4 is deployed. This file is the operator recovery map for v3 and retired incident-stack assets; it is not the v4 launch plan.

## Short Answer

If the question is "what protocol NARA is effectively stuck for about one year and later becomes pullable?", the answer is:

1. Treasury wallet engine position
2. Owner wallet engine position

Those are not admin-sweepable contract balances. They are normal `NARAEngineV2` lock positions owned by EOAs and can only be withdrawn by those wallets after their unlock epochs.

## Year-Locked Protocol Positions

These are the protocol-owned positions that matter for the "after a year we can pull it" question.

| Holder | Owner Address | Where The NARA Sits | Amount | Unlock Epoch | How It Comes Out |
| --- | --- | --- | --- | --- | --- |
| Treasury token wallet | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` | `NARAEngineV2` at `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F` | `20,000 NARA` | `35375` | Call `unlock(0)` from the treasury wallet after maturity |
| Owner signer wallet | `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` | `NARAEngineV2` at `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F` | `10,000 NARA` | `35376` | Call `unlock(0)` from the owner wallet after maturity |

Important:

- These are wallet-owned positions, not treasury-role sweepable balances.
- `NARAEngineV2` forbids sweeping NARA with `sweepForeignToken(address token, address to, uint256 amount)`.
- The engine unlock path itself returns principal only after the position is mature.
- Any accrued rewards should be claimed from the same wallet after unlock if needed.

Relevant code:

- `NARAEngineV2.unlock(uint256)` in `contracts/NARAEngineV2.sol`
- `NARAEngineV2.sweepForeignToken(address token, address to, uint256 amount)` forbids sweeping NARA

## v3 Custody Matrix (Retired Contracts)

This section answers: where v3 NARA sits, and whether it is recoverable. All contracts below are retired v3 deployments.

| Contract / Wallet | Live Address | Snapshot Balance / Role | Recovery Status | Actual Recovery Path |
| --- | --- | --- | --- | --- |
| `NARARewardReserve` | `0xC425F45f3e108cA4E49f86E01C6d256e6c572876` | `699,956.966832069600493497 NARA` reward inventory at the current snapshot | Not admin-recoverable | Only `releaseToEngine(uint256 amount)` can move NARA; admin cannot sweep NARA |
| `NARABondVault` | `0xcCe364b9cF815D47B0338aAd960367CdE8E3525D` | `250,000 NARA` bond inventory | Controlled, not time-locked | Moved through market pull / return flow; admin cannot direct-sweep NARA |
| `NARAEngineV2` | `0x62250aEE40F37e2eb2cd300E5a429d7096C8868F` | `35,544.586488313191480881 NARA` total engine balance at the current snapshot | Mixed | Protocol-owned locks come out only through each wallet's unlock; third-party locks are not protocol-recoverable |
| `NARABondDepository` | `0xe5f3D18d81661F63F9Fa5B53401eee08d383Ca20` | Should not be a resting NARA inventory bucket | Recoverable only back to vault | Excess inventory should be returned with the vault return path, not swept by treasury |
| `NARALottoPoolV2` | `0x81573dEDa5BcED23f0754cf3D0D2553d3694a0Ba` | Holds player principal, sponsor principal, and jackpot balances while active | Surplus-only | Owner can `emergencySweep(address to)` only when the pool is empty and no draw is pending; user principal is not an admin recovery bucket |
| `BurnRunArenaV2` | `0x6a1d3f01EFB35F3A8d5d6B3101f2764Bdf47cf3b` | Holds sponsor-yield-funded prize balances while active | No generic admin NARA sweep | Sponsor principal only comes out through each sponsor's `withdrawSponsor(uint256 sponsorId)` after unlock |
| `NaraLockNFT` | `0x2654602d8b0A7e328dcEC553aC2d1D289fC3B5da` | Wrapper surface, not intended as a NARA treasury bucket | Not a normal NARA recovery bucket | NFT owners unlock their own engine positions; wrapper owner only has ETH-fee withdrawal hooks |

## What Is Actually Pullable

### Pullable after maturity

- The two protocol-owned engine positions above
- Any lotto participant or sponsor position, but only by the position owner after unlock
- Any arena sponsor position, but only by the sponsor after unlock
- Any NFT wrapper lock, but only by the NFT owner after unlock

### Pullable only as surplus

- `NaraLottoPoolV2`: only owner-surplus via `emergencySweep(address to)`, and only when:
  - there are no participants
  - there are no sponsor positions
  - there is no pending draw
  - the balance exceeds all owed pot and winnings accounting

### Not admin-pullable

- `NARARewardReserve` NARA
- `NARABondVault` NARA via direct sweep
- `NARAEngineV2` locked NARA via treasury sweep
- Arena prize-pool NARA through a generic owner sweep

## Contracts That Explicitly Forbid Sweeping NARA

These contracts let admins recover foreign tokens, but explicitly block NARA itself:

- `NARARewardReserve`
- `NARABondVault`
- `NARAEngineV2`
- `NARABondDepository`

That means if NARA is sitting there by design, you should assume it is governed by the protocol flow, not by an admin rescue path.

## Operator Notes

### For the one-year engine unlocks

When the live epoch reaches the unlock target:

1. Use the treasury wallet `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` to call `NARAEngineV2.unlock(0)` after epoch `35375`
2. Use the owner wallet `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` to call `NARAEngineV2.unlock(0)` after epoch `35376`
3. Claim any accrued rewards from each wallet after unlock if you want the NARA/ETH reward balances moved out as well

### Do not confuse these buckets

- `RewardReserve` is reserved emissions inventory, not reclaimable treasury inventory
- `BondVault` is controlled bond inventory, not "stuck" inventory
- `Lotto` and `Arena` balances are game-accounting balances, not treasury sweep buckets

## Code Pointers (v3 — Archived)

- `archive/legacy-v3/contracts/NARAEngineV2.sol`
- `archive/legacy-v3/contracts/NARARewardReserve.sol`
- `archive/legacy-v3/contracts/NARABondVault.sol`
- `archive/legacy-v3/contracts/NARABondDepository.sol`
- `archive/legacy-v3/contracts/NaraLottoPoolV2.sol`
- `archive/legacy-v3/contracts/BurnRunArenaV2.sol`
- `archive/legacy-v3/contracts/NaraLockNFT.sol`
