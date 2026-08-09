# NARA v4 Compounder Validation Runbook

Change-ID: `NARA-20260731-compounder-validation`

Completed boundary (2026-08-09): the production Safe executed the bounded
validation in transaction
`0xf1ea7e7dfdf8e1021ceebf26a943cba604e0a8c894eec5f527bc01656b5890be`,
minting Compounder-owned LP NFT `2898486` with liquidity `9455824137787`.
After receipt reconciliation, the Safe permanently froze the Vault binding in
transaction
`0xccd73cf07602f18412bea291812f0d171fa5cabd41fcff6b6894029978084ef3`.
This runbook is retained as the executed verification procedure; it does not
authorize another transaction or a recurring workflow.

Current authority is
`deployments/v4-production-activation-2026-08-09.json` together with
`deployments/v4-compounder-activation-2026-08-09.json` and
`docs/releases/NARA-20260809-v4-compounder-activation.md`. Recurring
maintenance remains blocked pending separate authorization and review.

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
