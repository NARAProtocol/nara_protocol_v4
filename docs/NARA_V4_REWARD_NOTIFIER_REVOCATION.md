# NARA v4 Reward Notifier Revocation

Prepared: 2026-07-30

Status: completed and post-action verified

## Purpose

Remove every `REWARD_NOTIFIER_ROLE` holder from the active Base v4 engine.
This closes launch blocker `ARI-001` without changing the engine, its default
administrator, or any external interface.

Do not provide a private key to an AI, script, website, or chat. Sign with the
wallet or hardware wallet that already controls the administrator address.

## Completion evidence

- Stage A vault revocation:
  [`0x6610cb9f…a80e1`](https://basescan.org/tx/0x6610cb9fa27387dee1ff1a165f340be4c5e2bc39b8487e2e65108ec34bfa80e1),
  successful in block `49319896`.
- Stage A administrator revocation:
  [`0x0c3ff542…cd710`](https://basescan.org/tx/0x0c3ff54232dd5a61c37a92f522d8f1f092ee12667393ebabfb492f4f80ccd710),
  successful in block `49319966`.
- `hasRole(REWARD_NOTIFIER_ROLE, Stage A vault)`: `false`.
- `hasRole(REWARD_NOTIFIER_ROLE, Stage A administrator)`: `false`.
- `hasRole(DEFAULT_ADMIN_ROLE, Stage A administrator)`: `true`.
- Complete grant-history gate: `historicalGrants=3 active=none`.
- Post-action baskets pre-seed result: 5 pass, 0 fail, 9 intentionally
  unconfigured skips, 9 not applicable.

## Pre-action verified chain state

- Network: Base mainnet
- Chain ID: `8453`
- Engine: `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9`
- Engine deployment block: `49148334`
- `REWARD_NOTIFIER_ROLE`:
  `0x76345641021c0e4c51a3e752176a1536de2809b273da674bb2f0ba00ce1f3023`
- Role administrator: `DEFAULT_ADMIN_ROLE`
- Current administrator:
  `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`
- Administrator account type: EOA
- The administrator holds `DEFAULT_ADMIN_ROLE`: yes
- The deployer holds `DEFAULT_ADMIN_ROLE`: no

Before the transactions above, the complete `RoleGranted`/`RoleRevoked`
history was scanned from block `49148334`. It contained three grants and one
revocation. Exactly these two holders were active:

1. Stage A vault: `0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988`
2. Stage A administrator:
   `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`

## Execution procedure used

- Control of `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`.
- The wallet connected to Base mainnet.
- Enough ETH on Base for two ordinary contract calls.

Nothing else was required. The wallet private key was not imported or exposed.

## Transaction 1 — revoke the Stage A vault

Send from:

`0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`

Send to:

`0xbC2492BA73dE35d1114b5c18d7db633aca8963c9`

Value:

`0 ETH`

Function:

`revokeRole(bytes32 role, address account)`

Arguments:

- `role`:
  `0x76345641021c0e4c51a3e752176a1536de2809b273da674bb2f0ba00ce1f3023`
- `account`: `0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988`

Exact calldata:

```text
0xd547741f76345641021c0e4c51a3e752176a1536de2809b273da674bb2f0ba00ce1f3023000000000000000000000000c0cf9bcf8879182368b1cdbdc81b6a143ffa2988
```

Before signing, the wallet must decode the destination as the engine, the
value as zero, and the call as `revokeRole` with the arguments above.

Wait for a successful Base confirmation before continuing.

## Transaction 2 — revoke the Stage A administrator

Send from:

`0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`

Send to:

`0xbC2492BA73dE35d1114b5c18d7db633aca8963c9`

Value:

`0 ETH`

Function:

`revokeRole(bytes32 role, address account)`

Arguments:

- `role`:
  `0x76345641021c0e4c51a3e752176a1536de2809b273da674bb2f0ba00ce1f3023`
- `account`: `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`

Exact calldata:

```text
0xd547741f76345641021c0e4c51a3e752176a1536de2809b273da674bb2f0ba00ce1f3023000000000000000000000000c019dc79412c4b20103ac4ce97b2615ff45d490d
```

This removes only `REWARD_NOTIFIER_ROLE`. It does not remove
`DEFAULT_ADMIN_ROLE`.

Wait for a successful Base confirmation.

## Post-transaction verification

From `nara-protocol-hardhat`, run:

```powershell
$env:V4_ENGINE_DEPLOYMENT_BLOCK='49148334'
$env:V4_ROLE_HISTORY_RPC_URL='https://mainnet.base.org'
$env:V4_ROLE_LOG_CHUNK_BLOCKS='9000'
npm run verify:v4:launch-gates:preseed
```

The following four gates must report `PASS`:

- `AC-07 REWARD_NOTIFIER absent from configured final admin`
- `AC-07 REWARD_NOTIFIER absent from vault/bribe-router`
- `AC-07 REWARD_NOTIFIER absent from known Stage A holders`
- `AC-07 REWARD_NOTIFIER absent from complete grant history`

The complete-history detail must end with `active=none`. Other launch gates may
remain `SKIP` until their unrelated `V4_*` configuration is supplied.

## Independent read check

Call `hasRole(bytes32,address)` on the engine for each of the two accounts,
using the role value above. Both calls must return `false`.

Record both successful transaction hashes in the controlled release handoff.
Do not change a deployment manifest or claim production approval until the
post-transaction verification has passed.
