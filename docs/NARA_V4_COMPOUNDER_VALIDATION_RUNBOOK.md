# NARA v4 Compounder Validation Runbook

Change-ID: `NARA-20260731-compounder-validation`

Current boundary (2026-08-09): Hook and Vault ownership has been accepted by the
production Safe; `NARALiquidityCompounderV4` at
`0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` is deployed, source-verified,
wired, and Safe-owned; and the NARA/USDC pool is initialized and seeded. The
Vault has recorded and banked `1495.229242512170995797 NARA` and
`20.462880 USDC`. The Compounder remains unvalidated and unfrozen, with
`positionTokenId == 0` and zero total compounded amounts. This runbook is the
next gated operation; it does not authorize a transaction or workflow.

Current activation authority is
`deployments/v4-production-activation-2026-08-09.json` together with
`docs/releases/NARA-20260809-v4-production-activation.md`. Final Compounder and
maintenance gates remain blocked until one live compound is independently
verified and the Safe performs the separate one-way freeze.

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
