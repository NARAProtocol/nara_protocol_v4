# NARA v4 Liquidity Maintenance Runbook

Change-ID: `NARA-20260731-liquidity-maintainer`

The hook collects NARA/USDC pool fees into the growth vault during live swaps.
Those fees do not become liquidity inside the swap transaction. A second,
restricted `compoundAll()` transaction moves them through the bound compounder,
adds the balanced portion as full-range protocol-owned liquidity, and banks any
unbalanced remainder in the compounder for a later cycle.

## Activation order

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
9. Set repository variables `V4_LIQUIDITY_MAINTAINER_ENABLED=true` and
   `V4_OPERATIONS_KEEPER_ENABLED=true` only after the manual cycle and
   post-state verification pass. The combined operations workflow runs every
   30 minutes; the separate liquidity workflow remains manual-only.

## Runtime safety

The maintainer defaults to read-only. Execute mode refuses to run unless:

- Base chain ID and all vault/compounder/token bindings match;
- route mode is Liquidity;
- no compounder recovery is pending;
- the compounder address is permanently frozen;
- the signer matches the configured dedicated keeper address;
- that address is authorized by the vault; and
- simulated added USDC-side depth meets `V4_COMPOUND_MIN_LIQUIDITY_USDC`
  (default `5`).

It simulates `compoundAll`, applies a 99% minimum-liquidity guard, submits one
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
