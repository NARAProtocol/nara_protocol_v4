# NARA v4 Historical Liquidity Withdrawal Runbook

## Status: completed — never replay

The historical NARA/USDC liquidity withdrawal completed successfully on Base
on 2026-08-08. The old pool is retired. The consumed Safe batch and any
generated Transaction Builder JSON are single-use evidence, not reusable
operator artifacts.

This document records what happened and gives a verification procedure for a
future analogous incident. It does not authorize a transaction, deployment,
conversion, or reuse of the historical addresses.

## Canonical execution evidence

| Field | Receipt-pinned value |
|---|---|
| Base transaction | `0xd3b4c1790b586c399e48307afa3c282a279ac395212f0242a98835781a430523` |
| Receipt | status `1`, block `49715317`, transaction index `44` |
| Block hash | `0x3e1eb23802d541bcde4fc447bb6eb738a0c2a13c5ff6f5ca5da9da12f2ecf7a6` |
| Block time | `2026-08-08T20:13:01Z` |
| Safe transaction hash | `0x2b197abeec75ca40b1296034d356aaac05c3b80eb94b054b7ce06dbb84577de7` |
| Safe | `0xd65c0e390Dc187A22c52c03816591CC736C0D755`, threshold `2 of 3` |
| Safe nonce | `27` consumed; next nonce `28` |
| Executor | `0x42365cAE9abB6cb357dd485734CAd75a2d3c6664` |
| Gas used | `507510` |

The exact four-call `MultiSendCallOnly` transaction performed, atomically:

1. Vault `compoundAll(1, deadline, 0x)`.
2. Compounder `executeRecovery()` for the matured `WindDown`.
3. Position Manager `modifyLiquidities(...)` with
   `BURN_POSITION + TAKE_PAIR` for NFT `2884402`.
4. The same burn-and-take operation for NFT `2885838`.

The human Safe signers executed the transaction. The local tooling only built
and simulated the payload; it did not sign, submit, or broadcast it.

## Receipt-pinned reconciliation

The pre-state is Base block `49715316`. The post-state is the receipt block,
`49715317`.

| Check | Before | After / delta |
|---|---:|---:|
| Safe NARA | `10000.000000000002070478` | `331662.875771577340474139`; delta `321662.875771577338403661` |
| Safe USDC | `0` | `363.781444`; delta `363.781444` |
| Vault NARA | `23905.821206413424856364` | `0` |
| Vault USDC | `0` | `0` |
| Compounder NARA | `24.383460617742441949` | `0` |
| Compounder USDC | `268.675972` | `0` |
| Pool active liquidity | `5174385808867015` | `0` |
| Sealed reward reserve | `650000 NARA` | unchanged at `650000 NARA` |

Additional postconditions:

- `pendingRecovery` is cleared: kind `0`, recipient zero address, ETA `0`.
- Compounder `positionTokenId` is `0`.
- Position NFTs `2884402` and `2885838` are burned and return `NOT_MINTED`.
- The scoped expected NARA receipt exceeded the actual receipt by exactly one
  raw token unit (`1e-18 NARA`) because of integer rounding. Vault and
  Compounder balances are nevertheless exactly zero.

### Known portfolio-indexer false positive

After execution, a portfolio interface continued to show position `#2884402`
with `73.97735 USDC` as deposited and `4.88162 USDC` as reward, even while its
screen said it had updated less than a minute earlier. This was stale indexed
position data, not live withdrawable liquidity.

A fresh Base read at block `49715562` proved:

- `ownerOf(2884402)` and `ownerOf(2885838)` both revert `NOT_MINTED`;
- `getPositionLiquidity(2884402)` and
  `getPositionLiquidity(2885838)` both return `0`;
- the old pool active-liquidity slot is `0`; and
- the successful withdrawal receipt contains Position Manager ERC-721
  `Transfer` events from the Safe to the zero address for `2884402` at log
  index `169` and `2885838` at log index `173`. It first transfers `2885838`
  from the Compounder to the Safe at log index `165`.

Treat direct contract reads and receipt logs as authoritative. A portfolio
card, token image, fiat estimate, or “updated” timestamp can remain stale when
an indexer does not process a Uniswap v4 position burn correctly. Refreshing,
disconnecting/reconnecting, clearing the interface cache, or reporting the
indexer issue is safe; sending another transaction is not a remedy.

These facts retire only the historical liquidity stack. They are not a fresh
v4 deployment manifest and do not make baskets or other products available.

## Why the positions were burned

The old recovery plan described decreasing a precomputed amount and leaving
empty historical NFTs. That became unsafe once `compoundAll(...)` was placed in
the same atomic batch: compounding can change position liquidity before the
later removal, so a hard-coded decrease can leave residual liquidity.

The implemented path uses the Position Manager's native `BURN_POSITION`
followed by `TAKE_PAIR`. It consumes each position's current liquidity at
execution time, takes both currencies to the Safe, and burns the ERC-721. The
exact Safe simulation proved that this sequence also works after the preceding
Vault compound and Compounder recovery calls.

## Future analogous incident procedure

Do not reuse this batch. For a different deployment or incident, create a new
change ID and deployment-specific implementation, then perform all of these
steps:

1. Pin one recent block and verify chain ID, contract runtime hashes, owners,
   roles, Safe owners/threshold/modules, recovery state, keeper state, pool key,
   position ownership, position liquidity, direct balances, and the protected
   reserve.
2. Inventory Vault balances, Compounder banked balances, LP principal, and
   claimable fees separately by currency. A spot-value conversion is
   informational only and is never a guaranteed recovery amount.
3. Prove that the exact recovery kind has matured to the intended custody Safe
   and that no state changed after the inventory. Never infer execution merely
   from an elapsed delay.
4. Build a new atomic Safe payload with short deadlines and human-reviewed
   minimum outputs. Use current on-chain liquidity at execution time where
   earlier calls can change it.
5. Run the exact payload through Safe `simulateAndRevert` using
   `MultiSendCallOnly` at the pinned block. Reconcile each currency, NFT,
   allowance, pool-liquidity, reserve, and custody delta.
6. Have the required human Safe signers review and execute the exact simulated
   payload. AI and local scripts must not access signer material or broadcast.
7. Persist the transaction hash immediately. Verify status and read all
   postconditions at the receipt block; compare against block `receipt - 1`.
   Do not rely on an unpinned `latest` RPC read and do not retry a transaction
   until its hash and Safe nonce are checked.
8. Record the result in `CURRENT_STATE.md` and the applicable release evidence.
   Downstream consumers may change only from an immutable verified fresh-v4
   origin and explicit handoff, never from this historical recovery.

Any mismatch means stop. A mature recovery or passing local test is not, by
itself, authority to execute.

## Historical tooling and read-only checks

The reviewed historical implementation is retained for evidence:

- [`scripts/buildV4LiquidityStackWithdrawal.ts`](../scripts/buildV4LiquidityStackWithdrawal.ts)
  validates pinned state, builds the four calls, and performs Safe
  `simulateAndRevert`. It never signs or broadcasts.
- [`scripts/lib/v4LiquidityWithdrawal.ts`](../scripts/lib/v4LiquidityWithdrawal.ts)
  contains the reviewed addresses, runtime hashes, burn encoding, and
  MultiSend encoding for this historical deployment only.
- [`test/fork/NARAV4LiquidityWithdrawalBurn.fork.test.ts`](../test/fork/NARAV4LiquidityWithdrawalBurn.fork.test.ts)
  proves the burn encoding and full reconciliation on the immutable
  pre-execution Base fork at block `49715120`.
- [`CURRENT_STATE.md`](CURRENT_STATE.md) preserves the resulting historical
  state and identifies the fresh replacement deployment separately.

Read-only local verification used:

```powershell
$env:NODE_OPTIONS = '--require ./polyfill.cjs'
npx hardhat test test/fork/NARAV4LiquidityWithdrawalBurn.fork.test.ts
```

The historical builder was run before execution with:

```powershell
npx tsx scripts/buildV4LiquidityStackWithdrawal.ts
```

Running that builder against current live state should now refuse to produce a
batch because the recovery is cleared and both NFTs are burned. That refusal is
the expected completed-state behavior. Do not weaken its checks, restore the
old state assumptions, regenerate an executable artifact, or treat a previously
generated ignored JSON artifact as current.

## Never do these things

- Never call `executeRecovery()` alone; it transfers the Compounder assets but
  does not remove both LP positions.
- Never re-propose the completed `WindDown` merely to make the old builder pass.
- Never replay the Safe transaction or reuse its deadline, nonce, signatures,
  calldata, Transaction Builder JSON, or minimum-output assumptions.
- Never use the EOA-oriented `removeV4Liquidity.ts` for this Safe-owned stack.
- Never copy the historical contracts, pool, NFTs, recovered balances, or old
  market price into a fresh deployment manifest.
- Never describe recovered custody assets as converted, reseeded, available to
  users, or committed to another use without separate on-chain evidence and a
  current human-approved release decision.
