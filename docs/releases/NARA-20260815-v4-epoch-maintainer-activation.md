# NARA v4 Epoch Maintainer Activation

Change ID: `NARA-20260815-v4-epoch-maintainer-activation`

Date: 2026-08-15

Network: Base (`8453`)

## Outcome

The epoch-only GitHub Actions workflow `NARA v4 epoch maintainer` (workflow ID
`324678194`) is active on `7,37 * * * *` UTC. Repository variable
`V4_EPOCH_MAINTAINER_ENABLED` is `true`, and the dedicated gas-only keeper is
`0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD`.

The required secret names `BASE_RPC_URL`, `V4_EPOCH_KEEPER_PRIVATE_KEY`, and
`V4_EPOCH_HEARTBEAT_URL` exist. No secret value was read or recorded. The
workflow requires a successful heartbeat after each execute-mode cycle reaches
zero backlog.

The epoch maintainer is independently gated and credentialed from the liquidity
maintainer. Neither keeper is an administrator, treasury, deployer, Safe owner,
or general transaction key.

## Current bounded routine

Every scheduled cycle:

1. hydrates `deployments/v4-production-activation-2026-08-09.json`;
2. verifies the pinned manifest hash and deployed runtime bytecode;
3. refuses a backlog above eight epochs;
4. executes at most two batches of at most eight epochs each;
5. re-reads the Engine after the receipt; and
6. posts the required heartbeat only after backlog is zero.

## Hosted evidence

Scheduled run
[`31887698876`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/31887698876)
completed successfully on immutable main commit
`84be1be3ee5fe7786ca9222d49f922814e020c7d`.

The pre-execution read reported current/stored epochs `637 / 634`, backlog `3`,
no local, tracked, or untracked direct Engine reserve, and external reward
reserve `649999.999999537418365599 NARA`. The bounded keeper submitted:

`advanceEpochs(3)` — transaction
`0x754acc5ee3168d085afe1632b0aace9c4cb8f96abd2f83c2777c2711cb0e008f`

Post-receipt readback reported current/stored epochs `637 / 637`, backlog `0`,
and completed the required heartbeat path.

This operational evidence does not establish overall protocol availability,
an independent audit, or a production-readiness claim. Any keeper, schedule,
deployment binding, batch bound, or role change requires a new explicit order
and deployment-specific review.
