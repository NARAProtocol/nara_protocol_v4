# NARA v4 Compounder Validation Runbook

Change-ID: `NARA-20260731-compounder-validation`

Current stop boundary (2026-08-09): the fresh Vault is empty, its Compounder is
the zero address, Hook/Vault Safe ownership acceptance is pending, and the pool
is unregistered, uninitialized, and unseeded. Do not use this runbook yet.

After ownership acceptance, fresh Compounder deployment/wiring, atomic pool
activation, and receipt verification, final launch gates remain blocked until
one live compound is verified and the Safe performs the separate one-way
freeze.

## Build The Validation Transaction

Set an independently reviewed reference and explicit raw-unit caps before
building. Do not derive the reference from the current pool spot:

```powershell
$env:V4_COMPOUND_REFERENCE_SQRT_PRICE_X96="<independent uint160 reference>"
$env:V4_COMPOUND_MAX_NARA_USED_RAW="<maximum NARA raw units>"
$env:V4_COMPOUND_MAX_USDC_USED_RAW="<maximum USDC raw units>"
```

The optional `V4_COMPOUND_SQRT_PRICE_GUARD_BPS` defaults to `100` and may not
exceed `250`. `V4_COMPOUND_MAX_VALUE_IMBALANCE_BPS` defaults to `100` and may
not exceed `500`.

```powershell
npm run build:v4:compounder-validation
```

The builder:

- checks Base chain ID and every vault/compounder/token/Safe binding;
- rejects a pending compounder recovery;
- reads both vault balances;
- requires the explicit independent reference and token-use caps;
- rejects current `slot0` outside the fixed reference band instead of adopting
  it as a new reference;
- simulates `compoundAll` from the Safe;
- sets `minLiquidityAdded` to 99% of the simulated result; and
- writes `deployments/v4-compounder-validation-batch.json`.

It does not send a transaction. Review the deadline and simulation again just
before Safe execution; regenerate the file if the deadline expires.

## Verify The Compound

After the Safe transaction confirms, record its hash and block, then verify:

```text
vault totalTokenCompounded increased by the exact requested NARA amount
vault totalBaseCompounded increased by the exact requested USDC amount
compounder positionTokenId is nonzero
PositionManager ownerOf(positionTokenId) is the compounder
PositionManager getPositionLiquidity(positionTokenId) is nonzero
compounder totalLiquidityAdded is nonzero
banked balances plus added balances reconcile to the vault inputs
compounder pendingRecovery.kind is zero
```

## Build The Permanent Freeze

Only after the preceding evidence is on-chain:

```powershell
npm run build:v4:compounder-validation -- --freeze
```

The builder refuses to create the freeze batch unless it can read all required
position evidence. It then simulates `freezeCompounder()` from the Safe and
writes `deployments/v4-compounder-freeze-batch.json`.

`freezeCompounder()` is permanent. The validation and freeze are deliberately
separate transactions so a failing or surprising compound cannot be hidden by
an atomic batch.
