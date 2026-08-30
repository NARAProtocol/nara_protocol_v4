# NARA Treasury Range Manager V1 - Static Analysis Record

Status: 2026-08-30 internal-audit remediation evidence. This record is not an
independent external audit, a security guarantee, or production approval.

## Slither

The repository wrapper initially stopped because the isolated worktree did not contain its ignored `.venv-slither` runtime. The manager was then analyzed directly with the repository's existing Slither environment and Solidity `0.8.34` binary using optimizer runs `1`, `viaIR`, and Cancun settings.

At the current-base release gate, the pinned analyzer environment ran the 32
pre-existing production targets and the manager separately on the same tree.
The local wrapper now includes the manager as its 33rd enforced production
target, and pull-request CI explicitly asserts that the dynamically discovered
target set contains it.

Target:

`contracts/v4/NARATreasuryRangeManagerV1.sol`

Result: Slither completed successfully and emitted 17 detector results after informational and low findings were excluded.

Triage:

- `arbitrary-send-erc20`: not actionable. The `transferFrom` source is the immutable `TREASURY_SAFE`, and the only external creation entrypoints require `msg.sender == TREASURY_SAFE`. Callers cannot choose the source address.
- `reentrancy-balance`: not actionable under the pinned bindings. Every create, settle, cancel, and quarantine entrypoint is protected by OpenZeppelin `ReentrancyGuard`; NARA, USDC, Permit2, and PositionManager are immutable canonical dependencies. Terminal order state is written before the external burn/take call and a revert restores the transaction. Malicious callback mocks are covered by focused tests. The before/after Safe balance reads are deliberate receipt accounting, not authorization.
- `incorrect-equality`: not actionable. Equality is used for explicit zero-spend rejection and exact enum-state lookup.
- `unused-return`: not actionable. Slot0 fields that are irrelevant to a particular boundary check are intentionally omitted. `ownerOf` is invoked in `try/catch` specifically to prove that the burned NFT lookup reverts, and unused Permit2 tuple members are not part of the allowance invariant.

The 2026-08-30 remediation rerun used Slither `0.11.5` with Solidity `0.8.34`,
optimizer runs `1`, `viaIR`, and Cancun settings. It completed with the same 17
raw detector results and no new detector class. The raw JSON remains local
build evidence under `slither-reports/` and is not deployment authority.

## Aderyn

`npm run aderyn:v4:only` did not execute because no Aderyn binary was
available. No local Aderyn pass is claimed; protected PR and post-merge CI
later passed the pinned Aderyn gate.

## Echidna

`npm run echidna:v4:smoke` did not execute because the configured WSL
distribution could not be started. No local Echidna pass is claimed; protected
PR and post-merge CI later passed the pinned Echidna gate. Deterministic
lifecycle/property tests exercise the manager invariants in Hardhat, but they
are not represented as a local Echidna substitute.

## Independent review and executable gates

The independent adversarial review and strongest-model architecture review
closed all five retained audit findings (`ARI-001`, `ARI-002`, `SIG-001`,
`EXT-001`, and `UPG-001`) with no remaining remediation blocker. The final
focused suite passed 93/93, the repository non-fork suite passed 759/759, and
the pinned Base fork suites passed 4/4. The manager's clean-build runtime is
23,620 bytes and initcode is 28,095 bytes, both within EVM limits.

The initial Low forced-dust observation remains contained: unsolicited
NARA/USDC does not block settlement or cancellation, operations treat balances
as alert-only telemetry, and a regression proves the next valid creation
forwards both donated pool tokens only to the Safe before
`assertOperationalClean()` runs.

One Low operations risk remains: after the configured confirmations, reconciled receipt accounting is appended durably and pending state is cleared, but the settler does not continuously revalidate that historical receipt block hash. A reorganization deeper than the confirmation window could orphan the transaction while leaving the append-only reconciliation record. Production monitoring must independently revalidate journal block hashes or use a finality policy appropriate for the value at risk.

## Acceptance boundary

Automated findings were reviewed against the immutable dependency and
authorization model. Exact pinned-fork and independent review evidence exists
for this candidate, but production acceptance still requires a fresh
signing-time re-pin, a monitored canary, and explicit human approval. Protected
PR and post-merge CI passed for source commit
`35091010de09802f39ccda7e726ff8c4b240e165`. No independent external audit is
claimed.
