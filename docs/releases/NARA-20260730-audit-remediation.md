# NARA-20260730-audit-remediation

Status: implemented, locally verified, and notifier cleanup verified on-chain.

Origin commit: not yet created. This working tree is not an immutable release
origin and must not be consumed downstream until reviewed and committed.

## Protocol changes

- Staking entry and redemption price from a complete bounded position
  checkpoint; position nine can no longer donate historical rewards to a new
  depositor.
- Direct stNARA wrap and unwrap checkpoint transfer-crystallized rewards
  against the pre-change SY supply.
- Ready liquidity-hook fee/depth updates cannot be censored by a same-block
  dust swap; that block continues to use its snapshotted curve and depth.
- Recursive ERC-3156 borrowing cannot exceed the aggregate flash principal
  cap.
- Bond price quotes accept authorized EIP-1271 contract signers while retaining
  the existing EOA signature format.
- Deployment tooling leaves a replacement pool unregistered and builds one
  Safe batch for registration, exact initialization, first mint, and approval
  revocation.
- Launch gates reconstruct every historical `REWARD_NOTIFIER_ROLE` grant,
  require no active holder, verify the approved Safe runtime code hash, verify
  hook/vault/compounder ownership, and require no pending POL recovery.

## Verification

- Hardhat compile: pass.
- Full Hardhat suite: 483 pass, 0 fail, including live Base-fork suites.
- Bytecode-size gate: every deployable artifact within EVM limits.

## On-chain action evidence

The deployed engine notifier cleanup was completed by the authorized
administrator:

1. Stage A vault revocation:
   `0x6610cb9fa27387dee1ff1a165f340be4c5e2bc39b8487e2e65108ec34bfa80e1`;
2. Stage A administrator revocation:
   `0x0c3ff54232dd5a61c37a92f522d8f1f092ee12667393ebabfb492f4f80ccd710`;
3. complete grant-history verification from engine deployment block
   `49148334`: `historicalGrants=3 active=none`.

Before any liquidity or public activation:

1. set and verify the approved Safe runtime code hash;
2. execute registration and initial liquidity only through the generated
   atomic Safe batch; and
3. record immutable deployment and custody evidence before downstream
   consumers are updated.

No transaction was broadcast by an agent. No deployment, address, or public
availability state was changed.
