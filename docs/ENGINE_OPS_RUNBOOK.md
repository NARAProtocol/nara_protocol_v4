# NARAEngine v4 operations guide

This guide describes observable v4 engine state and safe operational review. It
does not authorize a transaction.

Canonical deployed address and activation status:
[`CURRENT_STATE.md`](CURRENT_STATE.md).

## Operating model

`NARAEngine` advances epochs through user-facing mutations and permissionless
maintenance calls. A call advances at most `MAX_JIT_ADVANCE` epochs. When the
backlog exceeds that bound, state-changing user flows revert with `EpochStale`
until enough permissionless advancement calls succeed.

There is no required privileged epoch keeper.

## Read-only health review

First run `npm run verify:v4:runtime-config`. Every active Engine operation is
anchored to the pinned production manifest and runtime code hashes. A command
must stop if `.env` points to a retired or merely internally consistent older
deployment.

Check:

| Read | Expected interpretation |
|---|---|
| `currentEpoch()` | Wall-clock epoch derived from genesis, timestamp, and epoch length |
| `epochState()` | Last settled epoch and snapshot |
| `activeTotalWeight()` | Weight currently receiving indexed allocations |
| `totalLocked()` | Principal recorded in active engine positions |
| `emissionReserve()` | Locally tracked NARA available for scheduled allocation |
| `rewardReserveAvailable()` | Available amount reported by the optional sealed reserve |
| `pendingEthForNextEpoch()` | ETH queued for a future epoch |
| `totalPendingNaraRewards()` | NARA allocated but not yet delivered |
| `accumulatedTreasuryEthFees()` | Flat engine fees available to the treasury role |
| `treasury()` | Current treasury receiver |
| `rewardReserve()` | Bound external reserve |
| `bondVault()` | Optional bound bond-vault view |

Interpret results at a named Base block. Do not mix values from different blocks
when evaluating accounting relationships.

## Epoch backlog

Calculate:

```text
backlog = currentEpoch - epochState.epoch
```

If `backlog == 0`, the engine is current.

If `backlog > 0`, simulate one of the permissionless maintenance paths before
submitting it:

- `poke()` advances through the internal bounded JIT path;
- `advanceEpochs(maxSteps)` lets the caller provide an additional bound.

Repeated calls may be required. A revert must be investigated rather than
masked by increasing gas or sending value.

## Reward-reserve synchronization

`syncEmissionReserve()` recognizes eligible NARA already held by the engine.
Epoch advancement can also request a bounded shortfall from the sealed external
reserve.

Before any synchronization transaction:

1. verify the engine, token, and reward-reserve addresses;
2. read engine-held NARA, `totalLocked`, pending NARA allocations, and tracked
   reserve at the same block;
3. simulate the call;
4. confirm the result cannot treat position principal or pending claims as free
   reserve.

Do not transfer tokens directly as an assumed funding method. Use the defined
funding and synchronization paths and verify their accounting effect.

## Reward notification

Native ETH:

- enter through `notifyEthRewards()`;
- require non-zero value and active weight;
- are queued according to engine rules.

Non-NARA ERC-20:

- the function exists in immutable source, but it is prohibited for the
  deployed Engine because post-notification extensions can under-allocate later
  distributions;
- no current component may hold `REWARD_NOTIFIER_ROLE`;
- do not grant the role, approve a notifier, or call
  `notifyTokenRewards(token, amount)`.

Any future ERC-20 reward design requires a new reviewed implementation rather
than activating this deployed path.

## Configuration

Parameter changes use the contract's role checks and staged configuration
mechanism. Before execution:

1. decode every proposed field;
2. compare it with hard-coded validation bounds;
3. evaluate the worst-case effect on positions, allocation rate, liveness, and
   fees;
4. verify the proposal timestamp and execution condition;
5. simulate against a fork at the intended block;
6. obtain the required human authorization.

Never copy a configuration from a retired address or an old deployment file.

## Treasury fees

`withdrawTreasuryEthFees(to)` is role-gated and transfers only the separately
tracked flat engine-fee accumulator. Verify:

- the caller has `TREASURY_ROLE`;
- `to` is the approved receiver and is neither zero nor the engine;
- the accumulator and engine balance at one block;
- the simulated balance and state deltas.

Reward allocations are accounted separately from treasury fees.

## Incident stop conditions

Stop state-changing operations and preserve evidence when:

- deployed bytecode differs from the published v4 release;
- `totalLocked` cannot be reconciled with position principal;
- pending allocations appear underfunded;
- a role or bound address changed unexpectedly;
- epoch advancement repeatedly reverts outside expected stale-epoch behavior;
- the reward reserve reports an unexpected binding or amount;
- a transaction simulation differs from the intended balance or state deltas.

Report suspected vulnerabilities privately through
[`../SECURITY.md`](../SECURITY.md).

## Evidence record

For every authorized operation, record:

- chain ID and block;
- contract address and runtime-code hash;
- caller and required role;
- decoded calldata;
- pre-state reads;
- simulation result;
- transaction hash when broadcast by an authorized human;
- post-state reads and reconciliation.

Never record private keys, seed phrases, credentials, or private RPC URLs.
