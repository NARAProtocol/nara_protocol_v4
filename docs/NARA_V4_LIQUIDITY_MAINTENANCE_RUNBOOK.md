# NARA v4 Liquidity Maintenance Runbook

Change-ID: `NARA-20260731-liquidity-maintainer`

Current stop boundary (2026-08-09): the fresh pool is initialized and seeded,
the Engine activation backlog is recovered, and Compounder validation/freeze
completed under receipt-pinned Safe transactions. LP NFT `2898486` is
Compounder-owned with liquidity `9455824137787`; unmatched inventory remains
banked in the Compounder. Both v4 operations workflows and their repository
enable variables are disabled. Do not schedule, dispatch, execute maintenance,
or re-enable a workflow without a new explicit order, deployment-specific
review, and keeper authorization. Current authority is
`deployments/v4-production-activation-2026-08-09.json` together with
`deployments/v4-compounder-activation-2026-08-09.json` and
`docs/releases/NARA-20260809-v4-compounder-activation.md`.

The hook collects NARA/USDC pool fees into the growth vault during live swaps.
Those fees do not become liquidity inside the swap transaction. A second,
restricted `compoundAll()` transaction moves them through the bound compounder,
adds the balanced portion as full-range protocol-owned liquidity, and banks any
unbalanced remainder in the compounder for a later cycle.

## Completed one-time activation order

The following sequence is historical and must not be replayed. It documents
the separation between the validation and irreversible binding-freeze actions.

1. Generate the validation batch immediately before Safe signing:

   ```powershell
   npm run build:v4:compounder-validation
   ```

2. Import `deployments/v4-compounder-validation-batch.json` into Safe Transaction
   Builder, verify the vault target and zero ETH value, collect the normal 2/3
   signatures, and execute it before its one-hour deadline.
3. Verify the receipt, nonzero compounder `positionTokenId`, compounder ownership
   of that NFT, and increasing liquidity/compounded totals.
4. Build the one-way freeze only after step 3 is on-chain:

   ```powershell
   npm run build:v4:compounder-validation -- --freeze
   ```

5. Execute the freeze batch through the Safe. This permanently prevents the
   vault from being pointed at a different compounder; it does not disable
   future compounding.
6. Create one dedicated gas-only operations EOA locally. Do not reuse an admin,
   treasury, deployer, Safe-owner, or trading key. The same new EOA may run the
   permissionless epoch maintenance and the narrowly authorized compound call.
   Put only its public address in `V4_COMPOUND_KEEPER_ADDRESS`.
7. Build and execute the keeper authorization through the Safe:

   ```powershell
   npm run build:v4:compound-keeper-auth
   ```

8. Fund the dedicated keeper with a small amount of ETH for Base gas, store its
   key only in the GitHub Actions secret `V4_OPERATIONS_KEEPER_PRIVATE_KEY`, and
   run the workflow manually in read-only mode, then execute mode.
9. Only after a new explicit authorization, the manual cycle, and post-state
   verification pass may maintainers consider setting repository variables
   `V4_LIQUIDITY_MAINTAINER_ENABLED=true` and
   `V4_OPERATIONS_KEEPER_ENABLED=true`. If later enabled, the combined
   operations workflow is scheduled every 30 minutes; the separate liquidity
   workflow remains manual-only. Both are disabled now.

## Runtime safety

The maintainer defaults to read-only. Execute mode refuses to run unless:

- Base chain ID and all vault/compounder/token bindings match;
- route mode is Liquidity;
- no compounder recovery is pending;
- the compounder address is permanently frozen;
- the signer matches the configured dedicated keeper address;
- that address is authorized by the vault; and
- `V4_COMPOUND_REFERENCE_SQRT_PRICE_X96` is an independently selected reference
  recorded before execution, not copied automatically from current pool `slot0`;
- `V4_COMPOUND_MAX_NARA_USED_RAW` and `V4_COMPOUND_MAX_USDC_USED_RAW` are explicit
  per-call raw-unit limits reviewed for the current depth and banked inventory;
- current `slot0` remains inside the fixed reference band
  (`V4_COMPOUND_SQRT_PRICE_GUARD_BPS`, default `100`, maximum `250`); and
- simulated added USDC-side depth meets `V4_COMPOUND_MIN_LIQUIDITY_USDC`
  (default `5`).

With no independent reference/caps, read-only mode reports compounding as
blocked and execute mode fails. The script never substitutes current `slot0`
for the missing reference. When configured, it simulates `compoundAll`, applies
a 99% minimum-liquidity guard, submits one
transaction, then verifies the POL NFT custody and nonzero position liquidity.
The keeper has no vault ownership, configuration, compounder-recovery, or
arbitrary withdrawal authority. While the live route mode is `Liquidity`, the
route and split entry points revert and the keeper can execute only compounding.
The same keeper mapping also gates route execution if the Safe deliberately
changes to an allowed routing mode later; rotate or revoke the keeper before
such a governance change unless that wider executor role is explicitly
reviewed. Keeper bounty remains zero unless governance separately approves a
different policy.

## Important balance behavior

The compounder never swaps. It adds only the NARA/USDC portion balanced at the
live price. Excess assets remain banked in the compounder and are reconsidered
on the next call. This reduces MEV exposure but cannot guarantee every collected
USDC is immediately deployed. Changing that behavior requires a separately
reviewed replacement compounder, not a keeper setting.
