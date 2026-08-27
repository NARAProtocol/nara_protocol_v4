# NARA-20260821-v4-position-nft-phase2 — Production Operator Runbook

Status: **HISTORICAL OPERATOR RUNBOOK — DEPLOYMENT AND SAFE FINALIZATION COMPLETE;
INTEGRATION GATES PENDING**

Network: Base mainnet (`chainId 8453`)

Change ID: `NARA-20260821-v4-position-nft-phase2`

This is the fail-closed operator sequence for the Position NFT Phase-2 release. It is not a
deployment authorization, is not a Safe signing request, and does not replace the external gate
attestation or explicit human approvals. Never place private keys, RPC values, API-key values, or
signatures in this document or any release artifact.

## Executed outcome

Gates 0 through 9 below are retained as the historical one-time operator path
and must not be replayed. Canonical outcome evidence is
`deployments/v4-position-nft-phase2-finalized-2026-08-21.json` and
`deployments/v4-position-nft-phase2-source-verification-2026-08-21.json`.

- Canonical `NARAPositionNFTV4`:
  `0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC`.
- Seven-contract deployment transaction sequence completed successfully; the
  NFT deployment transaction is
  `0x20d8e0a3fa62c1628c9fcb66055de631cfbf5519b988e2d98d5f713b63aa1f45`
  at Base block `50293938`.
- All seven contracts are source-verified.
- Production Safe finalization transaction
  `0xfb83cb4cb4b8a2c30216f46be69b519628ad74259795806e30d158a7736c6e8f`
  succeeded at Base block `50296367`.
- Final evidence state is `configured_source_verified`, with frozen 10% Treasury
  royalties, frozen zero claim fees, and Genesis distributor unset.
- `integrationReady` remains `false`. The separately approved value-bearing
  smoke was `not_performed`; Gate 10's smoke and 48-hour hold and Gate 11's
  immutable downstream handoff remain pending. Safe finalization is not
  consumer activation or public availability.

## Release boundary

The release deployed exactly seven contracts, in this order:

1. `NARAArtMetadataV1`
2. `NARAArtSecurityPrintV1`
3. `NARAArtCorePlateV1`
4. `NARAArtGenesisPlateV1`
5. `NARAPositionRendererV5`
6. `NARAPositionAccountV4`
7. `NARAPositionNFTV4`

Phase 2 does not deploy or bind bonds, `NARAGenesisRewardDistributorV4`, `NARAOpsVaultV4`,
`NARAPositionDataLensV1`, `NARADashboardLens`, `BribeRouterV4`, or
`NARACirculatingSupplyV1`. Those remain Phase 3. No `GenesisMinterSet` event is permitted in this
release, and Genesis-minter configuration remains unfrozen for a later separately reviewed phase.

## Canonical policy

- NFT owner: manifest-pinned production Admin Safe.
- ERC-2981 receiver: manifest-pinned `production.treasury` address.
- ERC-2981 rate: exactly `1000 BPS` (10.00%).
- Royalty state after finalization: frozen.
- NARA wrapper claim fee: `0 BPS`, frozen.
- Token wrapper claim fee: `0 BPS`, frozen.
- Claim-fee recipient: zero address.
- Genesis distributor/minter: unset in Phase 2.

The owner Safe and Treasury destination are separate manifest fields. Resolve both from the pinned
canonical production manifest at execution time. Do not substitute one for the other, do not call the
Treasury a Safe without separate proof, and do not claim that royalty proceeds automatically reach
lockers; the Treasury controls their later use.

The canonical core dependency is
`deployments/v4-production-activation-2026-08-09.json`, validated through the production runtime
guard. Do not fall back to source constants, environment addresses, or a secondary checkout when
resolving Engine, NARA, Admin Safe, Treasury, or runtime hashes.

## Gate 0 — route and freeze the release boundary

From the workspace root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-nara-repository-routing.ps1
```

Record the authoritative checkout, exact `origin` URL, branch, full `HEAD`, `origin/main`, dirty
state, ahead/behind state, PR, required checks, and commit-signature conclusion. Stop if this is not
the authoritative `NARAProtocol/nara_protocol_v4` checkout or if any required fact is contradictory.

Freeze the following before evidence generation:

- exact seven-contract scope and deployment order;
- canonical production core manifest and runtime hashes;
- Admin Safe and Treasury fields;
- reproducible compiler/build configuration and the artifact/source hashes that
  the later evidence-commit `artifact-build.json` must record;
- exact royalty and claim-fee policy;
- dedicated deployment signer and its starting nonce; and
- change ID and evidence paths.

## Gate 1 — audited source commit

Create the first protected commit, the **source commit**. It contains the reviewed tracked contracts,
release scripts, tests, documentation, and reproducible compiler/build configuration. Hardhat
`artifacts/`, `cache/`, and build-info output remain ignored/untracked and are not source-commit
content. Do not add an ABI unless it is an explicitly named tracked repository output reviewed in the
source diff. The source commit contains neither generated deployment-plan evidence nor
`artifact-build.json`; those belong to the evidence-only second commit.

Before this commit is accepted:

```text
npm run build
npm run test:nft:v4
npm run test:nonfork
npm run size
npm run slither:v4
npm run aderyn:v4:only
npm run echidna:v4:smoke
npm run preview:v4:position-nft-art
npm run rehearse:v4:position-nft
```

The preview command runs only on local Hardhat and writes regenerated scratch output to the ignored
repo-local `.nara-art-qa/v4-position-nft-phase2/` directory. An optional
`V4_POSITION_NFT_ART_QA_OUT` must name a new, unused subdirectory inside the repository's
`.nara-art-qa/` root; the root itself, any path outside it, and a non-empty prior output directory
fail closed. Human reviewers inspect `index.html`, `rare-showcase.html`, `thumbnail-qa.html`,
`metadata-qa.html`, `fallback-collection-image.svg`, and `qa-manifest.json`, including the manifest's
artifact inventory and hashes, before approval. `fallback-collection-image.svg` is decoded from the
renderer-failure `contractURI().image`, and `metadata-qa.html` must display that exact SVG. Copy/hash
the approved QA record into
`release-evidence/NARA-20260821-v4-position-nft-phase2/` and bind that hash in the external
attestation; do not commit `.nara-art-qa/` itself.

The preview command must fail closed unless the checkout is clean and full
`HEAD == origin/main`. It writes that SHA as `qa-manifest.json.sourceCommit` and
must include `sourceArtifacts` for exactly all seven Phase-2 contracts, binding
their fully qualified source identity and source, artifact, ABI,
creation/deployed-bytecode, compiler-input, and compiler-sources fingerprints.
Human approval is valid only for those exact bytes and commit. Any commit or
fingerprint change requires a newly generated, reviewed, copied/hashed, and
attested gallery; an older gallery can never authorize newer source.

`rehearse:v4:position-nft` deploys and verifies atomically inside one fresh ephemeral `baseFork`
process. The `verify:v4:position-nft:rehearsal` alias repeats that entire fresh flow; a separate
Hardhat process cannot inspect a prior ephemeral fork and must not be described as a post-rehearsal
verification step.

Every rehearsal creates a new, no-overwrite scratch Safe Transaction Builder file:

```text
deployments/REHEARSAL-DO-NOT-IMPORT-v4-position-nft-phase2-finalization-<block>-<run-id>.json
```

The file targets ephemeral fork contracts. Its internal name includes `REHEARSAL - DO NOT IMPORT`,
and its description explicitly says it must never be imported or signed. Treat it only as local
rehearsal evidence: never import, sign, send, execute, rename, or copy it into the production
release path. Production deployment creates no standalone Safe import: its canonical batch remains
embedded-only in the pending manifest until all-seven source verification. The only importable
production file is the nonce- and transaction-hash-bound `UNEXECUTED` JIT Safe batch produced with
its evidence packet at Gate 7.

Also require:

- final-commit independent audit with zero unresolved confirmed findings;
- explicit browser, marketplace-decoder, thumbnail, metadata, and renderer-failure collection
  fallback QA, including `fallback-collection-image.svg` rendered in `metadata-qa.html`, whose
  approved record/hash is under the Phase-2 release-evidence directory rather than ignored scratch
  output;
- no contract-source/build-configuration drift and no unreviewed tracked integration output;
- no secrets in the staged diff or evidence;
- protected-branch review and required checks; and
- a signed immutable full source SHA on `origin/main`.

Historical test/audit results cannot approve a changed source commit.

## Gate 2 — plan evidence and second commit

Use a dedicated, idle, gas-only deployment signer. It must be distinct from the Admin Safe, have no
prior Phase-2 production attempt, and remain idle after planning. Never copy or record its key.

On a clean checkout of the exact audited source commit at `origin/main`, run:

```text
npm run plan:v4:position-nft
npm run build:v4:position-nft-plan-evidence
```

Review the generated files:

```text
release-evidence/NARA-20260821-v4-position-nft-phase2/deployment-plan.json
release-evidence/NARA-20260821-v4-position-nft-phase2/artifact-build.json
```

The plan must bind:

- the source commit and Base `chainId 8453`;
- a pinned observation block and block hash;
- the dedicated signer and exact starting nonce;
- equal latest and pending signer nonces;
- all seven nonce-derived predicted addresses in canonical order;
- zero runtime code at all seven predicted addresses;
- the canonical core dependencies and artifact/source hashes; and
- human attestations for an idle signer, no prior attempt, and approval after observation.

The deployment plan has its own declared validity bound. If it is stale, the signer nonce changes, a
predicted address gains code, or any input changes, discard it and restart the two-commit review. This
plan validity is distinct from the later JIT Safe packet.

Create the second protected commit, the **evidence commit**. Its diff from the source commit must
contain only files under:

```text
release-evidence/NARA-20260821-v4-position-nft-phase2/
```

Merge it through the protected branch and require green canonical CI for the exact evidence commit.
The source and evidence SHAs must be distinct and full-length.

## Gate 3 — external attestation and execution approval

Create the external, ignored gate attestation only after the evidence commit is immutable:

```text
deployments/v4-position-nft-phase2-gate-attestation.json
```

It must remain untracked/ignored to prevent Git self-reference. It must bind the exact source and
evidence commits and independently attest:

- canonical CI for both the source and evidence commits and all required jobs;
- static-analysis evidence for the source commit;
- clean artifact-build evidence and hashes;
- independent audit report/hash with zero unresolved confirmed findings;
- art QA evidence/hash for 64, 128, and 300px on light, neutral, and dark backgrounds, with
  `artQa.reviewedCommit` exactly equal to `sourceCommit` and the reviewed QA manifest binding all
  seven source/artifact fingerprints;
- roadmap floor/strategic-buffer decision and pinned observation evidence;
- the exact approved deployment plan and predicted addresses;
- the exact 10% Treasury royalty plus zero/frozen wrapper claim-fee policy;
- permissionless minting from NFT deployment; and
- explicit human production approval and reference.

The attestation contains two independent canonical CI objects:

```text
sourceCi:
  status: pass
  repository: NARAProtocol/nara_protocol_v4
  headSha: <exact sourceCommit>
  runUrl: https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/<source run id>
  workflowPath: .github/workflows/ci.yml
  requiredJobs: [build · test · size, slither (advisory), aderyn (advisory), echidna (advisory)]
ci:
  status: pass
  repository: NARAProtocol/nara_protocol_v4
  headSha: <exact evidenceCommit>
  runUrl: https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/<evidence run id>
  workflowPath: .github/workflows/ci.yml
  requiredJobs: [build · test · size, slither (advisory), aderyn (advisory), echidna (advisory)]
```

The live gate fetches both runs and their jobs. Each must be a completed,
successful `push` run on `main` named `NARA v4 CI`, with exact head SHA,
workflow path, canonical URL, and exactly one successful job for every required
name. Evidence CI cannot substitute for source CI, or vice versa.

The attestation's `releaseControl` object must contain exactly these 18 fields:

```text
status: pass
repository: NARAProtocol/nara_protocol_v4
protectedBranch: main
sourceCommitSignatureVerified: true
evidenceCommitSignatureVerified: true
sourcePullRequestNumber: <positive integer>
sourcePullRequestUrl: https://github.com/NARAProtocol/nara_protocol_v4/pull/<same number>
evidencePullRequestNumber: <positive integer>
evidencePullRequestUrl: https://github.com/NARAProtocol/nara_protocol_v4/pull/<same number>
mergedToProtectedMain: true
administratorsEnforced: true
signedCommitsRequired: true
linearHistoryRequired: true
forcePushesAllowed: false
branchDeletionAllowed: false
conversationResolutionRequired: true
canonicalCiRequired: true
noBypassActors: true
```

The live release-control verifier requires both attested commits to have valid
GitHub signature verification and each to be the exact merge result of its one
attested approved PR into `main`. Classic `main` branch protection must apply to
administrators, require pull-request review, signed commits, linear history,
resolved conversations, forbid force pushes and deletion, and require all four
exact status contexts: `build · test · size`, `slither (advisory)`,
`aderyn (advisory)`, and `echidna (advisory)`. There is no emergency bypass:
classic pull-request bypass allowances for users, teams, and apps must be
absent/empty. The verifier paginates the complete ruleset list, fails if a next
page cannot be read, fetches each returned ruleset's detail by ID, and requires
an explicitly visible empty `bypass_actors` array for every direct repository
ruleset and every inherited organization ruleset. Any bypass-capable
administrator, team, app, integration, or ruleset actor is a hard stop.

Before deployment or live verification, provide a least-privilege authenticated
credential through `GH_TOKEN`, `GITHUB_TOKEN`, or an authenticated `gh` CLI
session that can read both commits and signature status, their associated PRs,
Actions runs/jobs, `main` branch protection, required-signatures protection,
and every repository ruleset detail. GitHub returns `bypass_actors` only when
the caller has write access to that specific ruleset. The credential must
therefore have write access to every returned ruleset, including inherited
organization rulesets; generic public or read-only access cannot satisfy this
evidence gate. This permission is used read-only by the release gate and does
not authorize using a bypass. Never print or store the credential in the
attestation, evidence, logs, or operator record. A `403`, a missing/hidden
ruleset field, incomplete pagination, any bypass actor, or any other live
mismatch fails closed.

Only variable names, never values, may appear in an operator record:

```text
V4_POSITION_NFT_EXECUTION_CONFIRM
V4_POSITION_NFT_RELEASE_COMMIT
V4_POSITION_NFT_GATE_ATTESTATION
```

Immediately before execution, the checkout must be clean and `HEAD`, the requested release commit,
and protected `origin/main` must all equal the exact evidence commit. Stop on branch drift, dirty
state, missing/failed CI, attestation mismatch, signer nonce drift, predicted-address code, canonical
runtime drift, or an already recorded Phase-2 attempt.

Production preflight also enumerates `deployments/` and refuses any stale
`UNEXECUTED-v4-position-nft-phase2-*` file or partial
`PENDING-PACKET-LINK-DO-NOT-IMPORT-v4-position-nft-phase2-*` staging file. Stop and reconcile its
origin and onchain status; never delete or rename it merely to permit a deployment. The
post-execution standalone quarantine command is recovery only after an exact finalized manifest
proves verified execution. The separately confirmed incomplete-artifact command described at Gate 7
is only for reconciled, pre-execution JIT remnants.

## Gate 4 — one-attempt deployment

After the explicit human deployment approval, run once:

```text
npm run deploy:v4:position-nft
```

The deployer must recheck before every transaction that:

- the signer pending/latest nonce equals the exact planned nonce;
- the next predicted address has zero code;
- the Base network and canonical production runtime remain exact; and
- the prior receipt journal step is complete and unambiguous.

Deploy the seven contracts at consecutive nonces `start` through `start + 6`. Production receipts
require the configured confirmations. The append-only receipt journal is authoritative during the
attempt. If submission, replacement, confirmation, receipt, or address state is ambiguous, stop and
reconcile the journal and Base state. Do not retry blindly and do not begin a second attempt.

In addition to the append-only receipt journal/checkpoint described above, the completed deployment
output is:

```text
deployments/v4-position-nft-phase2-2026-08-21.json
```

No standalone Safe file is emitted. The pending manifest's `safeFinalization.batch`, `batchSha256`,
`calls`, Safe snapshot, and simulation preserve the canonical five-call plan internally, while
`safeFinalization.batchArtifact` must say:

```text
status: embedded_only_pending_source_verification
path: null
```

The manifest must not contain `safeFinalization.batchPath`, and production deployment must not write
any standalone Safe Transaction Builder import before all-seven source verification. Never extract
the embedded batch or substitute a `REHEARSAL-DO-NOT-IMPORT` scratch file.

The first manifest must say:

```text
evidenceState: deployed_pending_safe_finalization
integrationReady: false
sourceVerification.status: pending
safeFinalization.status: unexecuted
```

It must include all seven addresses, constructor arguments, deployment receipts and blocks/hashes,
start blocks, runtime hashes, artifact evidence, production-core binding, policy, pinned readback,
Safe snapshot/simulation, and receipt journal.

### Permissionless mint window

`NARAPositionNFTV4` minting is permissionless from the confirmed NFT deployment block; it does not
wait for source verification or Safe freezes. The constructor already binds the approved Treasury
royalty and `1000 BPS`, while the Safe batch reasserts and freezes that state. Wrapper claim fees are
zero but not yet frozen.

Every verifier and operator must query and sort the complete `PositionMinted` history from the NFT
deployment block through its pinned verification block and reconcile it to `nextTokenId`. Never
assume no one minted, assume token ID 1 is available, or rely on a manually chosen smoke token.

## Gate 5 — strict pending verification

Before source verification or Safe preparation:

```text
npm run verify:v4:position-nft:pending
```

This must fail closed on manifest, release, chain, core runtime, seven-contract runtime/artifact,
constructor, owner, royalty, zero claim-fee, unfrozen finalization, Genesis-event, mint-history, Safe,
batch, receipt, or pinned-block drift. Do not hand-edit a failed manifest into passing form.

## Gate 6 — source verification

Run:

```text
npm run verify:v4:position-nft:sources
```

This command reruns the strict pending verifier first, then submits/checks source verification for
all seven contracts and writes:

```text
deployments/v4-position-nft-phase2-source-verification-2026-08-21.json
```

`BASESCAN_API_KEY` is required by name only. Never log or store its value. Continue only when all
seven addresses have source proof bound to the exact FQN, constructor inputs, source/artifact hashes,
and release evidence.

## Gate 7 — just-in-time Safe signing packet

Immediately before human Safe review, run:

```text
npm run build:v4:position-nft-finalization
```

This command reruns the strict pending verifier and performs only read calls and `eth_call`
simulation. It never signs, sends, or executes a transaction. Before producing any importable Safe
batch, it requires and validates the canonical all-seven source-verification artifact against the
pending manifest/release, computes and binds that artifact's SHA-256, requires `BASESCAN_API_KEY`
without logging it, and rechecks fresh live BaseScan proof for every address against the exact
recorded proof. It writes an explicitly quarantined packet and a standalone Safe Transaction Builder
import file:

```text
deployments/UNEXECUTED-v4-position-nft-phase2-signing-packet-<block>-nonce-<nonce>.json
deployments/UNEXECUTED-v4-position-nft-phase2-safe-batch-<block>-nonce-<nonce>.json
```

These are the only standalone production signing artifacts and the Safe batch above is the only
importable production file. Both are no-overwrite, nonce-bound, and bound by the packet to the exact
batch hash and Safe transaction hash. Do not import the pending manifest's embedded batch.

Safe-batch publication is deliberately staged. The builder durably writes the packet, then writes
and hash-checks the batch under this temporary name before atomically renaming it to the
`UNEXECUTED` Safe-batch path:

```text
deployments/PENDING-PACKET-LINK-DO-NOT-IMPORT-v4-position-nft-phase2-safe-batch-<block>-nonce-<nonce>.json
```

That `PENDING-PACKET-LINK-DO-NOT-IMPORT` state can exist only after an interrupted builder. It is an
incomplete packet link, never an importable or signable Safe batch. Do not rename it by hand. After
reconciling that no Safe execution occurred and that the remnants belong to this release, recoverably
quarantine all matching partial `UNEXECUTED`/staging artifacts in PowerShell with:

```powershell
$env:V4_POSITION_NFT_INCOMPLETE_QUARANTINE_CONFIRM = "QUARANTINE-INCOMPLETE-NARA-20260821-v4-position-nft-phase2"
npm run quarantine:v4:position-nft-incomplete-artifacts
Remove-Item Env:V4_POSITION_NFT_INCOMPLETE_QUARANTINE_CONFIRM
```

The command refuses without that exact confirmation, never deletes or changes bytes, and renames
each match to `INCOMPLETE-DO-NOT-IMPORT-<original-name>`. Reconcile its reported SHA-256 values before
building again. It does not complete the packet and is not the post-execution finalized-artifact
quarantine.

The packet must bind and recheck:

- the pending-manifest path and SHA-256;
- the canonical all-seven source-verification evidence, its repo-relative path
  and SHA-256, plus matching fresh live BaseScan proof;
- source/evidence commits and all seven deployed runtimes/bindings;
- latest pinned Base block and block hash;
- exact Safe 1.4.1 runtime, approved singleton, exact three-owner set, threshold `2`, fallback handler,
  zero guard, zero modules, and nonce;
- unchanged Safe nonce since the deployment verification snapshot;
- NFT owner, approved Treasury royalty/rate, zero claim fees, unfrozen finalization flags, zero
  Genesis distributor/events, and complete mint history;
- the exact five calls, canonical MultiSendCallOnly batch and SHA-256;
- successful atomic Safe simulation; and
- Safe nonce and Safe transaction hash.

The JIT packet has no block-count expiry. Its validity is exact-state and exact-nonce based. It
becomes stale if the Safe nonce or any pinned Safe/NFT/release state changes.
Any Safe nonce drift from the deployment verification snapshot is a stop-and-review event: identify
and approve every intervening Safe execution before restarting; never silently rebuild around it.

## Gate 8 — exact human Safe execution

Human signers compare the standalone import file to the packet and pending manifest. Import nothing
unless the file hash, batch hash, Safe nonce, Safe transaction hash, chain, Safe, NFT target, and call
order match exactly.

The only authorized inner calls are, in order:

1. `setDefaultRoyalty(production.treasury, 1000)`
2. `setClaimFees(0, 0)`
3. `setClaimFeeRecipient(0x0000000000000000000000000000000000000000)`
4. `freezeRoyalties()`
5. `freezeClaimFees()`

Every call targets the deployed NFT, carries zero value, and uses inner `CALL`. The outer Safe action
must be the canonical `MultiSendCallOnly` `DELEGATECALL` encoded in the packet. Do not add, remove,
reorder, or edit a transaction in the Safe UI. Human Safe owners sign and execute; no CLI key or
deployment signer is used.

## Gate 9 — final evidence and final verification

After the Safe transaction is confirmed, set only these operator inputs:

```text
V4_POSITION_NFT_SIGNING_PACKET=<repo-relative UNEXECUTED signing-packet path>
V4_POSITION_NFT_SAFE_EXECUTION_TX=<confirmed Base transaction hash>
BASESCAN_API_KEY=<operator secret; never record the value>
```

Then run:

```text
npm run finalize:v4:position-nft-evidence
npm run verify:v4:position-nft
```

The package finalization command chains the pending verifier, evidence finalizer, strict final
verifier, and filesystem quarantine. Only after the final manifest proves the exact successful Safe
execution, quarantine hash-checks and renames both JIT artifacts without deleting or modifying their
bytes:

```text
deployments/EXECUTED-DO-NOT-IMPORT-v4-position-nft-phase2-signing-packet-<block>-nonce-<nonce>.json
deployments/EXECUTED-DO-NOT-IMPORT-v4-position-nft-phase2-safe-batch-<block>-nonce-<nonce>.json
```

The rename is recoverable evidence hygiene, not deletion. If final verification succeeded but the
rename was interrupted, run `npm run quarantine:v4:position-nft-safe-artifacts`; it accepts the exact
final-manifest hashes and resumes from either the `UNEXECUTED` or already quarantined path. The
explicit final-verifier rerun above is a deliberate operator readback after quarantine. Never import
an executed artifact under either filename.

The finalizer must prove:

- the signing packet exactly supersedes the pending manifest;
- the Safe did not drift before signing;
- the executed transaction matches the exact Safe transaction hash and five-call batch;
- the Safe nonce advanced exactly once;
- the receipt and required event order are canonical;
- royalty receiver is the pinned Treasury, royalty rate is `1000 BPS`, and royalties are frozen;
- both wrapper claim fees and recipient are zero and claim fees are frozen;
- owner/bindings remain exact and Genesis distributor/event count remains zero;
- complete `PositionMinted` history reconciles through the final block; and
- live BaseScan source proof still matches all seven contracts.

Expected final output:

```text
deployments/v4-position-nft-phase2-finalized-2026-08-21.json
```

The final manifest remains `integrationReady: false`. Safe finalization is not consumer activation.

## Gate 10 — approved smoke and 48-hour hold

Obtain a separate explicit human approval before any value-bearing production smoke transaction.
Using receipt-block-pinned reads and the complete mint history, validate:

- permissionless NFT mint and clone/Engine binding;
- NFT transfer and bearer-control change;
- NARA, ETH, and supported token claim paths as applicable;
- extension, maturity, unlock/burn, and terminal ownership/accounting;
- `tokenURI()`, `contractURI()`, SVG/JSON decoding, and fallback behavior;
- frozen 10% Treasury royalty and frozen zero wrapper claim fees; and
- direct raw Engine positions remain valid without the NFT wrapper.

Record transaction hashes, receipt blocks/hashes, readback blocks/hashes, outcomes, and any test
assets. Do not reuse an unverified or permissionlessly minted token without reconciling its state.

After smoke, hold for 48 monitored hours. Monitor at minimum:

- epoch backlog and Engine health;
- mint, transfer, claim, extend, unlock, and burn failures;
- renderer, metadata, collection URI, and fallback reads;
- owner, royalty, fee-freeze, Genesis, and source-verification invariants;
- unexpected Safe activity or nonce changes; and
- monitor alert delivery and indexing lag.

Any invariant breach restarts readiness review and keeps all consumers disabled.

## Gate 11 — immutable handoff and downstream quarantine

Until the final manifest, smoke record, and 48-hour observation record are committed to the
authoritative protocol origin, all consumers remain quarantined:

- Swarm must omit/disable Position NFT behavior and must not retain a zero-code fallback;
- baskets and frontends must not expose NFT actions or planned addresses;
- analytics must not infer an NFT address or start block;
- generated ABIs/bindings must not move from a dirty/uncommitted tree; and
- public documentation may describe the manifest-pinned deployment and
  finalization, but must state `integrationReady: false` and must not say
  integrated, indexed, available, or live.

Create one cross-repository handoff for the same change ID containing:

- immutable protocol origin commit;
- final-manifest path and hash;
- seven addresses and runtime hashes;
- Position NFT deployment/start block and final verification block/hash;
- ABI/binding file hashes and source-verification status;
- exact owner, Treasury royalty/rate/freeze, zero claim-fee/freeze, and Genesis state;
- complete mint-history boundary;
- smoke and 48-hour observation evidence;
- intended consumer repositories and exact surfaces; and
- fail-closed disable/rollback condition.

Release order is protocol origin, then baskets/other protocol consumers as approved, then Swarm and
monitoring, then public documentation. Each consumer opens a focused protected-branch PR, verifies
manifest/address/ABI/start-block parity, records deployment and present health separately, and links
its result back to this change ID.

## Stop conditions

Stop without signing, sending, retrying, publishing, or updating consumers if any of the following is
true:

- dirty, secondary, unsigned, unprotected, or non-canonical source/evidence checkout;
- failed/missing CI, audit, art, roadmap, plan, or human approval evidence;
- signer nonce or any predicted address differs from the approved plan;
- prior/ambiguous deployment attempt or incomplete receipt journal;
- chain, core runtime, Safe, Treasury, artifact, constructor, receipt, source, or manifest drift;
- any `GenesisMinterSet` history;
- incomplete or unreconciled permissionless mint history;
- Safe nonce drift or signing packet mismatch;
- Safe batch differs from the exact five calls or intended post-state;
- source proof or final readback fails; or
- smoke/observation detects an invariant or availability failure.

The safe result of a stop is an evidence-backed `not ready` verdict with downstream NFT support still
disabled.
