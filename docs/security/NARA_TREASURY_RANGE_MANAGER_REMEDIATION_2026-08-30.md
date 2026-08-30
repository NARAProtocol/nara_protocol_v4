# NARA Treasury Range Manager V1 - Internal Audit Remediation

Date: 2026-08-30

Change ID: `NARA-20260828-v4-treasury-range-manager`

Status: all five retained internal-audit findings are remediated in protected
source commit `35091010de09802f39ccda7e726ff8c4b240e165` and independently
reviewed. This is not an independent external audit, production approval,
deployment authority, or profit guarantee.

## Finding closure

| Finding | Severity | Closure evidence |
|---|---:|---|
| `ARI-001` - optimizer accepted fewer than all required candidates | Medium | The optimizer now requires the exact canonical set of 21 unique candidate IDs before selection. Missing, duplicate, extra, incomplete, or mismatched candidates block every selection. |
| `ARI-002` - declaration-only or failed matrix evidence could satisfy the fork gate | Medium | Strategy schema v2 requires 30 exact successful matrix rows, exact per-row keys, explicit executed status for every transactional component, strict row identity/scenario coverage, receipt/state evidence, and recomputed aggregates. Failed, reverted, missing, duplicated, extra, declaration-only, or inconsistent rows block optimizer selection, deployment, and order creation. Cancellation intentionally does not depend on matrix exactness. |
| `SIG-001` - cleared signed transaction could be replayed on a reused EOA nonce | Medium | Signed raw bytes, hash, nonce, and intent remain durable across provider-local drops and terminal races. Only a canonical confirmed receipt for the exact hash clears lineage. Exact rebroadcast requires fresh all-three nonce/absence, dependency, binding, and exact-calldata simulation checks. |
| `EXT-001` - a silent RPC could wedge an instance indefinitely | Medium | Every critical provider call has a source-labelled deadline below the whole-sweep watchdog. A timeout poisons the coordinator, tears down providers/watchers, and exits nonzero for supervisor restart; three-of-three agreement is never reduced. |
| `UPG-001` - USDC proxy implementation drift was invisible | Low | Strategy v2 binds Circle's exact proxy implementation/admin slots, implementation runtime, control roles, pause/monitored-blacklist state, and a code-hash-pinned Multicall3 reader. Builders and all three settler providers stop before signing on drift. Safe cancellation alone uses an explicit exit-only bypass. |

## Independent review

- Independent adversarial review: **PASS**, no remaining remediation blocker.
- Strongest-model architecture review: **PASS**, no remaining remediation blocker.
- The reviewers specifically exercised proxy-compatible implementation drift,
  manager-actor evidence serialization, cancellation warning text, and exact
  rebroadcast preconditions.

## Final local verification

| Gate | Result |
|---|---|
| Treasury-focused suite | 61 Hardhat + 32 Node operations = **93/93 passing** |
| Repository non-fork suite | **759/759 passing** on the current upstream base |
| Pinned Base fork | **4/4 passing** at the historical audit pin; includes the full 21-candidate adversarial matrix |
| Strict TypeScript | Manual strict target set and settler project no-emit type-check passed |
| Protected CI coverage | PR #52 and post-merge `main` passed build/test/size, the 32 settler operations tests, strict settler TypeScript, Slither, Aderyn, Echidna, and CodeQL |
| Build | Hardhat build passed |
| Bytecode | Manager runtime 23,620 bytes; initcode 28,095 bytes; both within EVM limits |
| Slither | 0.11.5 with solc 0.8.34 completed; same 17 previously triaged raw signals, no new detector class |
| Dependency audit | Production dependencies: zero vulnerabilities; development graph: eight low-severity `elliptic` advisories, no fix available |
| Changed-content secret check | Passed; Gitleaks was unavailable, so no Gitleaks pass is claimed |

Aderyn did not run locally because its binary was unavailable. Echidna did not
run locally because the configured WSL distribution could not start. They later
passed in protected PR and post-merge CI; those hosted results are not
relabelled as local runs. Gitleaks remained unavailable locally.

## What this does not prove

- Circle can change USDC after a just-in-time check and before inclusion.
- A USDC pause, blacklist, or incompatible implementation can still prevent an
  exit even though cancellation packet construction remains available.
- An off-chain settler cannot interrupt a same-transaction range crossing and
  reversal.
- Finality beyond the configured confirmation window needs external journal
  block-hash monitoring.
- The strategy searches a constrained candidate family and does not guarantee
  maximum or positive profit.

## Production boundary

No manager is deployed or funded, no transaction was signed or broadcast, and
no settler was activated. Before any production use, the candidate still needs
fresh schema-v2 state and strategy regeneration, explicit Safe funding
approval, receipt-pinned deployment verification, human approval of fresh
nonce-bound packets, a two-host rehearsal, and a monitored canary.
