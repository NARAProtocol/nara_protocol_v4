# NARA v4 Safe Custody Handoff

Prepared and verified: 2026-07-30. Current-state annotation: 2026-08-09.

Status: the production Safe has accepted ownership of the fresh Hook and Vault
and owns the deployed, source-verified, and wired Compounder at
`0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF`. The fresh NARA/USDC pool is
initialized and seeded; LP NFT `2898124` is Safe-owned. The Compounder passed
bounded validation, owns LP NFT `2898486` with liquidity `9455824137787`, and
the Vault binding is permanently frozen to it. Recurring maintenance remains
disabled.

Current activation authority is
`deployments/v4-production-activation-2026-08-09.json` together with
`deployments/v4-compounder-activation-2026-08-09.json` and
`docs/releases/NARA-20260809-v4-compounder-activation.md`. Historical Stage A
and 2026-07-30 addresses later in this handoff remain custody history, not
active deployment targets.

## Approved Safe

- Network: Base mainnet
- Chain ID: `8453`
- Safe:
  `0xd65c0e390Dc187A22c52c03816591CC736C0D755`
- Version: `1.4.1`
- Runtime code hash:
  `0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`
- Threshold: `2 of 3`
- Enabled modules: none
- Owners:
  - `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`
  - `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`
  - `0x42365cAE9abB6cb357dd485734CAd75a2d3c6664`

No private key was requested, read, stored, or used by an agent.

## Safe creation and policy evidence

- Safe creation:
  [`0x7a660d88…4a359`](https://basescan.org/tx/0x7a660d888fd1c5cbb9f79fe15ac5c45e25367e92eca91cbe054f48e5ede4a359),
  block `49320808`.
- Threshold changed from `1` to `2`:
  [`0x5e65c496…b0cee`](https://basescan.org/tx/0x5e65c49687cbc71b651dd6edcf3d3f070fc6e7f80434f4c4b5a5a4de9d7b0cee),
  block `49321037`.

The threshold correction occurred before protocol authority was granted.

## Historical 2026-07-30 Custody Evidence

The remainder of this handoff records the 2026-07-30 custody state and is
preserved as historical evidence. It is superseded for current addresses and
activation state by the authority files cited above.

### Engine administrator handoff

Engine:

`0xbC2492BA73dE35d1114b5c18d7db633aca8963c9`

1. The legacy administrator granted `DEFAULT_ADMIN_ROLE` to the Safe:
   [`0x049bb8de…941c5`](https://basescan.org/tx/0x049bb8de1f7760cc3a3ce691dd9dc2e07e6cbe9ca20931db89f6626bc40941c5),
   block `49322250`.
2. A `2/3` Safe transaction revoked the legacy administrator:
   [`0xeca00f32…49c01`](https://basescan.org/tx/0xeca00f320cdbad70e31fe66ab36cd5834f04e90b5329c8e8d2ffeeb0c2f49c01),
   block `49322563`.

Post-action state:

- Safe has `DEFAULT_ADMIN_ROLE`: `true`.
- Legacy administrator
  `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d`: `false`.
- Deployment EOA
  `0xcf222f05911e3AbeF77F2A552C623c122522F670`: `false`.
- Safe threshold remains `2`.
- Safe owners remain the three addresses above.
- Safe modules remain empty.

### PARAM and TREASURY role consolidation

`DEFAULT_ADMIN_ROLE` alone did not make the Safe the sole engine authority. A
post-handoff read showed `PARAM_ROLE` and `TREASURY_ROLE` still held solely by
the legacy EOA. Both role admins are `DEFAULT_ADMIN_ROLE`, so the Safe closed
the gap itself.

Role identifiers:

- `PARAM_ROLE`:
  `0x8a4778feaa2fc65ebc9ddd026461f05b6522e206b955ca87f94c0eebfa8bcb2c`
- `TREASURY_ROLE`:
  `0xe1dcbdb91df27212a29bc27177c840cf2f819ecf2187432e1fac86c2dd5dfca9`

One `2/3` Safe batch, grants ordered before revokes so neither role was ever
unheld:
[`0x91b0a180…fd6b6`](https://basescan.org/tx/0x91b0a1800b05e8120f53b66cbb5beb10ed257b1e5b94ba5af46673a5b0efd6b6),
successful in block `49323239`. Batch definition:
`deployments/v4-engine-role-consolidation-batch.json`.

The batch routed through Safe `MultiSendCallOnly`
`0x9641d764fc13c8B624c04430C7356C1C7C8102e2`, whose runtime contains `CALL` and
no `DELEGATECALL` opcode. Each of the four inner engine calls therefore executed
as a plain call.

Emitted engine events, in order:

1. `RoleGranted(PARAM_ROLE, Safe)`
2. `RoleGranted(TREASURY_ROLE, Safe)`
3. `RoleRevoked(PARAM_ROLE, legacy EOA)`
4. `RoleRevoked(TREASURY_ROLE, legacy EOA)`

Independently verified engine role matrix after execution:

| Role | Safe | Legacy EOA | Deployer | Stage A vault |
|---|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `true` | `false` | `false` | `false` |
| `PARAM_ROLE` | `true` | `false` | `false` | `false` |
| `TREASURY_ROLE` | `true` | `false` | `false` | `false` |
| `REWARD_NOTIFIER_ROLE` | `false` | `false` | `false` | `false` |

Safe re-verified at the same time: version `1.4.1`, threshold `2`, three owners
unchanged, modules empty, runtime code hash unchanged.

### Deviation from the approved custody plan

[NARA_V4_CUSTODY_AND_GOVERNANCE_PLAN.md](NARA_V4_CUSTODY_AND_GOVERNANCE_PLAN.md)
specifies two `3-of-5` Safes — Safe A for protocol admin and Safe B for treasury
with a different signer mix. What is deployed is a single `2-of-3` Safe, and no
Safe B exists.

This is an accepted interim posture, decided on 2026-07-30, not an oversight.
It remains open work, not a closed gate:

- Signer count and threshold are below the approved policy.
- Admin and treasury custody are not separated.
- `engine.treasury()` is still the EOA
  `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`, which is also a Safe owner.
- The `240,000 NARA` treasury lock commitment is not executed.

Resolve or formally amend the plan before public activation.

### Quarantined Stage A liquidity stack

Do not transfer, initialize, seed, or reuse:

- Vault: `0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988`
- Hook: `0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088`
- Compounder: `0xc327e50c14002a82c9F1477122204BB183f446Ab`

These contracts remain bound to the quarantined Stage A pool. Their ownership
is not evidence for launch custody.

## Replacement liquidity custody — completed 2026-07-30

The corrected trio was deployed with `V4_ADMIN_ADDRESS` set to the Safe, so
ownership was assigned at deployment rather than transferred afterwards from a
live stack. Verified owners, all equal to the Safe:

| Contract | Address |
|---|---|
| `NARALiquidityGrowthVault` | `0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d` |
| `NARALiquidityGrowthHook` | `0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088` |
| `NARALiquidityCompounderV4` | `0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98` |
| `Create2HookDeployer` | `0xa6Ef629291170B80e5f23Ab14dB0B3620062f016` |

The compounder reports no pending recovery. The replacement pool is not
registered, so no liquidity custody exists yet. `REWARD_NOTIFIER_ROLE` was not
granted to the replacement vault.

Evidence: `deployments/v4-pool-redeploy-2026-07-30-replacement-trio.json`.
Gate result: `verify:v4:launch-gates:preseed` — 14 pass, 0 fail, 0 skip.

### Historical remaining custody work recorded 2026-07-30

The following list is preserved as the work that remained at that historical
checkpoint; it is not a current execution checklist.

1. Keep the replacement pool unregistered and uninitialized until the reviewed
   atomic launch batch. Registration permanently binds the opening price.
2. Fund the Safe with exactly `60,000 NARA` and `300 USDC` before that batch.
3. Resolve or formally amend the 2-of-3 custody deviation recorded above.
4. Migrate `engine.treasury()` off the EOA
   `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`.
5. Execute the `240,000 NARA` treasury lock commitment.
6. After the seed and one validated compound, call `freezeCompounder()` from the
   Safe, then proceed to the phase-2 timelock.

Already verified through the pre-seed launch gates on 2026-07-30: the Safe
runtime code hash, compounder custody with no pending recovery, and every
reciprocal immutable binding.

This handoff closes engine role custody and replacement liquidity-contract
custody. It does not close the custody-plan deviation above, and it does not
approve pool registration, seeding, or public launch.
