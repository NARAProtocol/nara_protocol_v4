# NARA v4 Position NFT Phase-2 Production Plan

Last updated: 2026-08-22.

This document is the production boundary and readiness checklist for the Phase-2 Position NFT
release. It does not authorize a deployment or a Safe transaction. The operator sequence and
evidence contract are in
[`releases/NARA-20260821-v4-position-nft-phase2.md`](releases/NARA-20260821-v4-position-nft-phase2.md).

## Current state

- The contracts and hardened release tooling exist in the local protocol checkout.
- No verified Phase-2 Base deployment manifest or runtime address exists yet.
- Planned addresses, local Hardhat addresses, environment values, and addresses with zero runtime
  code are not deployments and must not be published to consumers.
- Downstream NFT support remains disabled until a finalized immutable origin manifest, source
  verification evidence, smoke evidence, the 48-hour hold, and a cross-repository handoff exist.

## Exact Phase-2 scope

Phase 2 deploys exactly these seven contracts, in this nonce-locked order:

| Order | Contract | Phase-2 purpose |
|---:|---|---|
| 1 | `NARAArtMetadataV1` | Immutable shared metadata fragments |
| 2 | `NARAArtSecurityPrintV1` | Immutable security-print SVG module |
| 3 | `NARAArtCorePlateV1` | Immutable standard-position art plate |
| 4 | `NARAArtGenesisPlateV1` | Immutable Genesis-capable art plate; no Genesis distributor is bound in Phase 2 |
| 5 | `NARAPositionRendererV5` | On-chain collection and token rendering |
| 6 | `NARAPositionAccountV4` | Restricted EIP-1167 account implementation |
| 7 | `NARAPositionNFTV4` | Optional bearer ERC-721 wrapper for newly created Engine positions |

The NFT is an optional wrapper. Direct positions created in `NARAEngine` remain valid raw positions.
Art assignment is deterministic and equal-status; it does not encode a recommendation, expected
return, or preferred asset choice.

## Explicitly deferred to Phase 3

The following are not part of the Phase-2 deployment, finalization batch, manifest, smoke gate, or
consumer handoff:

- `NARABondDepositoryV4NFT`
- `NARABondVaultV4`
- `NARAGenesisRewardDistributorV4`
- `NARAOpsVaultV4`
- `NARADashboardLens`
- `NARAPositionDataLensV1`
- `BribeRouterV4`
- `NARACirculatingSupplyV1`

Do not bind a Genesis distributor, emit `GenesisMinterSet`, open a bond market, or claim router/lens
availability during Phase 2. Genesis-minter configuration remains unfrozen so a separately reviewed
Phase-3 release can configure it.

## Production policy

The final Position NFT state is:

- owner/custody authority: the manifest-pinned production Admin Safe;
- secondary-sale royalty: exactly `1000 BPS` (10.00%) to the manifest-pinned production `treasury`
  address;
- royalties: permanently frozen after that exact receiver and rate are set;
- wrapper NARA claim fee: `0 BPS`, permanently frozen;
- wrapper token claim fee: `0 BPS`, permanently frozen;
- claim-fee recipient: zero address;
- Genesis distributor/minter: unset in Phase 2; and
- no claim that royalties automatically reach lockers: the Treasury controls their later use.

The owner Safe and Treasury destination are different manifest fields. Do not substitute the owner
Safe for `production.treasury`, and do not describe the Treasury address as a Safe without separate
evidence.

The exact finalization calls, in order, are:

1. `setDefaultRoyalty(production.treasury, 1000)`
2. `setClaimFees(0, 0)`
3. `setClaimFeeRecipient(0x0000000000000000000000000000000000000000)`
4. `freezeRoyalties()`
5. `freezeClaimFees()`

All five calls target the deployed `NARAPositionNFTV4`, carry zero value, use inner `CALL`, and are
wrapped in one canonical `MultiSendCallOnly` transaction. Deployment must stop if the implementation,
tests, generated batch, pending verifier, JIT builder, finalizer, or final verifier encodes a different
receiver, rate, call, order, or post-state.

## Immutable evidence model

The release uses change ID `NARA-20260821-v4-position-nft-phase2` and two protected commits:

1. **Source commit:** final reviewed contracts, release scripts, tests, documentation, and the
   reproducible compiler/build configuration. Ignored Hardhat `artifacts/`, `cache/`, and build-info
   output do not belong in this commit, and no ABI is added unless it is an explicitly named tracked
   repository output reviewed in the source diff. The commit must be clean, signed, protected
   `origin/main` with green canonical CI and final audit and art evidence.
2. **Evidence commit:** generated only from that exact source commit. Its diff from the source commit
   may contain only the Phase-2 release-evidence directory and must include the hashed
   `artifact-build.json` plus deployment-plan evidence produced reproducibly from the source commit.

The external gate attestation is deliberately ignored/untracked so the evidence commit does not
self-reference. It must independently bind the source and evidence commits, canonical CI result,
static-analysis results, independent audit conclusion, art QA, roadmap gate, deployment plan, exact
royalty/claim-fee policy, and explicit human approval.

Canonical CI is attested twice, with the same exact schema and four-job tuple:

- `sourceCi` has `status: "pass"`, the canonical repository, `headSha` equal to
  the source commit, its canonical Actions `runUrl`,
  `workflowPath: ".github/workflows/ci.yml"`, and `requiredJobs`; and
- `ci` is the evidence-CI block with the same fields, but `headSha` equal to the
  evidence commit and its own canonical Actions `runUrl`.

Both `requiredJobs` arrays must equal, in order: `build · test · size`,
`slither (advisory)`, `aderyn (advisory)`, and `echidna (advisory)`. The live
gate verifies both referenced runs are completed successful `push` runs on
`main` for workflow `NARA v4 CI`, with exact head SHA/path/URL and exactly one
successful job for each required name.

Its mandatory `releaseControl` object has exactly 18 fields and this evidence surface:

- `status: "pass"`, `repository: "NARAProtocol/nara_protocol_v4"`, and
  `protectedBranch: "main"`;
- `sourceCommitSignatureVerified: true` and
  `evidenceCommitSignatureVerified: true`;
- positive `sourcePullRequestNumber` / `evidencePullRequestNumber` values and
  matching canonical `sourcePullRequestUrl` / `evidencePullRequestUrl` values;
- `mergedToProtectedMain: true`, with each attested commit the exact merge result
  of its one approved PR into `main`;
- `administratorsEnforced: true`, `signedCommitsRequired: true`,
  `linearHistoryRequired: true`, and `conversationResolutionRequired: true`;
- `forcePushesAllowed: false` and `branchDeletionAllowed: false`; and
- `canonicalCiRequired: true`, with classic branch protection requiring all four
  exact contexts: `build · test · size`, `slither (advisory)`,
  `aderyn (advisory)`, and `echidna (advisory)`; and
- `noBypassActors: true`.

There is no emergency release bypass. The live gate requires classic
pull-request bypass allowances for users, teams, and apps to be absent/empty.
It paginates the complete repository-ruleset list, fails if another page cannot
be read, fetches every returned ruleset's detail by ID, and requires an
explicitly visible empty `bypass_actors` array for each direct repository
ruleset and each inherited organization ruleset. An administrator, team, app,
integration, or ruleset actor that can bypass review is a hard stop even when
every other field and CI job passes.

The deployer and verifier live-check those GitHub facts; attestation text alone
is insufficient. Before either command, provide a least-privilege authenticated
credential through `GH_TOKEN`, `GITHUB_TOKEN`, or an authenticated `gh` CLI
session that can read both commits and signature status, their associated PRs,
Actions runs/jobs, `main` branch protection, required-signatures protection,
and every repository ruleset detail. GitHub returns `bypass_actors` only when
the caller has write access to that specific ruleset, so the credential must
have write access to every returned ruleset, including inherited organization
rulesets; generic public or read-only access cannot satisfy this gate. This
permission is used read-only by the release gate and does not authorize using a
bypass. Never print, commit, or copy the credential value into evidence. A
`403`, a missing/hidden ruleset field, incomplete pagination, an unsigned
commit, a non-exact PR merge, any bypass actor, or weaker current `main`
protection fails closed.

Never deploy from a dirty tree, feature branch, secondary checkout, local simulation, or uncommitted
evidence. Never update another repository directly from either local commit; use the immutable
origin commit plus the explicit handoff record after finalization and observation.

## Current verification commands

From `nara-protocol-hardhat/`, run the commands against the exact release commit:

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

The canonical preview runs only on local Hardhat and writes ignored regenerated output under
`.nara-art-qa/v4-position-nft-phase2/`. An optional `V4_POSITION_NFT_ART_QA_OUT` must name a new,
unused subdirectory inside the repository's `.nara-art-qa/` root; the root itself, any path outside
it, and a non-empty prior output directory fail closed. Human reviewers must inspect `index.html`,
`rare-showcase.html`, `thumbnail-qa.html`, `metadata-qa.html`,
`fallback-collection-image.svg`, and `qa-manifest.json`, including the manifest's artifact inventory
and hashes. `fallback-collection-image.svg` is the decoded renderer-failure
`contractURI().image`, and `metadata-qa.html` must render it for visual review. After browser and
marketplace-decoder approval, copy the approved QA record into the Phase-2 `release-evidence/`
directory and bind its SHA-256 in the external attestation; never treat or commit `.nara-art-qa/`
itself as release evidence.

The preview command itself must refuse unless the checkout is clean and full
`HEAD == origin/main`; that full SHA is the gallery's `sourceCommit`.
`qa-manifest.json` must embed that commit and `sourceArtifacts` for exactly all
seven Phase-2 contracts, including their fully qualified source identity and
source, artifact, ABI, creation/deployed-bytecode, compiler-input, and
compiler-sources fingerprints. The external attestation must set
`artQa.reviewedCommit` to the same exact source commit. Any source-commit or
fingerprint change invalidates the gallery and its approval: regenerate,
review, copy/hash, and attest a new QA record rather than reusing an old one.

The rehearsal command atomically deploys and verifies on one fresh ephemeral `baseFork` connection.
The `verify:v4:position-nft:rehearsal` alias intentionally repeats that complete fresh rehearsal; it
cannot verify a prior Hardhat process after the fork has reset and is not a separate sequential gate.

After the audited source commit is clean and equals protected `origin/main`, generate the plan
evidence with:

```text
npm run plan:v4:position-nft
npm run build:v4:position-nft-plan-evidence
```

The final audit, canonical CI, art/metadata review, roadmap approval, and external attestation are
separate release gates. A local command result does not stand in for them.

## Clean bytecode-size evidence — 2026-08-21

`npm run size` completed after a clean Hardhat build of 69 Solidity files with solc 0.8.34 for
Cancun. All seven Phase-2 artifacts were within the EIP-170 deployed-code limit (24,576 bytes) and
the EIP-3860 initcode limit (49,152 bytes):

| Contract | Deployed bytes | Initcode bytes |
|---|---:|---:|
| `NARAArtMetadataV1` | 5,252 | 5,278 |
| `NARAArtSecurityPrintV1` | 9,694 | 9,720 |
| `NARAArtCorePlateV1` | 15,530 | 15,755 |
| `NARAArtGenesisPlateV1` | 12,676 | 12,702 |
| `NARAPositionRendererV5` | 4,972 | 5,433 |
| `NARAPositionAccountV4` | 3,636 | 3,681 |
| `NARAPositionNFTV4` | 21,562 | 23,234 |

The existing `NARAEngine` also remained within the deployed limit at 24,554 bytes (27,448 bytes
initcode). These measurements are local build evidence, not deployment, source verification, or an
audit conclusion.

## Mandatory pre-deployment gates

1. Run the cross-repository routing preflight and record the canonical protocol checkout, remote,
   branch, source commit, clean state, and protected-branch/CI conclusions.
2. Pass the commands above on the exact source commit. Rerun the independent Solidity audit and
   resolve every confirmed issue; do not use historical audit wording for a changed commit.
3. On the clean exact source commit at `origin/main`, generate the current local gallery with
   `npm run preview:v4:position-nft-art`. Review the SVG gallery, rare-hit showcase, thumbnail contact
   sheet, collection metadata, renderer-failure `contractURI().image` decoded as
   `fallback-collection-image.svg` and rendered in `metadata-qa.html`, and marketplace-compatible
   decoding. Confirm the QA manifest binds that source commit and all seven source/artifact
   fingerprints. Copy/hash only the approved QA record into `release-evidence/`, set
   `artQa.reviewedCommit` to that source commit, and record explicit art approval; keep the ignored
   `.nara-art-qa/` output out of Git.
4. Generate and review the immutable deployment plan and artifact-build evidence. Confirm Base
   `chainId 8453`, canonical production core runtime hashes, the exact seven predicted addresses,
   zero code at every prediction, and pending/latest deployer nonce equality.
5. Use a dedicated, idle, gas-only deployment signer whose exact starting nonce is in the plan.
   Attest that it has made no prior Phase-2 production attempt. Do not reveal or record its key.
6. Build the second evidence commit and external gate attestation, then require explicit human
   deployment approval. The execution commit, source commit, evidence commit, plan, CI, and
   attestation must all reconcile exactly.

## Deployment and finalization gates

1. Run `npm run deploy:v4:position-nft` once. Before each deployment, the script must recheck the
   expected pending/latest nonce and zero code at the predicted address. The seven transactions use
   consecutive planned nonces. Ambiguous submission or receipt state is a stop condition, not a
   reason to retry. Preflight also refuses every stale
   `UNEXECUTED-v4-position-nft-phase2-*` file and every partial
   `PENDING-PACKET-LINK-DO-NOT-IMPORT-v4-position-nft-phase2-*` staging file; stop and reconcile it
   rather than deleting, renaming, or deploying around it.
2. Treat the output as `deployed_pending_safe_finalization`, with `integrationReady: false`. Minting
   through the NFT is permissionless from the confirmed NFT deployment, so index and reconcile all
   `PositionMinted` events and `nextTokenId`; never assume a manual token ID or an empty mint window.
   Production deployment writes no standalone Safe import. Alongside its append-only receipt
   journal/checkpoint, it writes the pending manifest; the canonical five-call batch, hash, call
   order, Safe snapshot, and simulation remain embedded under `safeFinalization`, with
   `batchArtifact.status: embedded_only_pending_source_verification` and `batchArtifact.path: null`.
   It must not write or expose a standalone Safe Transaction Builder import or a `batchPath`.
3. Run `npm run verify:v4:position-nft:pending`. It must reject any pre-source standalone production
   Safe import as well as any manifest, runtime, receipt, policy, Safe, mint-history, or embedded-batch
   drift.
4. Run `npm run verify:v4:position-nft:sources` and preserve the BaseScan source-verification
   evidence. The API key name may be documented; its value must never enter logs or artifacts.
5. Run `npm run build:v4:position-nft-finalization` immediately before Safe signing. It must refuse
   output unless the canonical all-seven source-verification artifact validates against the pending
   manifest/release and its SHA-256 is bound into the packet, `BASESCAN_API_KEY` is available without
   being logged, and fresh live BaseScan proof for every address exactly matches that artifact.
   This JIT step emits the only importable production Safe Transaction Builder file, together with
   its evidence packet. Publication is fail-closed: after durably writing the packet, the builder
   first writes and hash-checks the batch as
   `PENDING-PACKET-LINK-DO-NOT-IMPORT-v4-position-nft-phase2-safe-batch-*`, then atomically renames it
   to the final `UNEXECUTED` batch name. A `PENDING-PACKET-LINK-DO-NOT-IMPORT` file means the builder
   was interrupted; it is never importable or signable and the packet/batch pair is incomplete.
   Import only the final nonce- and transaction-hash-bound `UNEXECUTED` batch after it exactly matches
   the packet's pending-manifest hash, source-evidence path/hash, pinned block/hash, Safe snapshot,
   Safe nonce, batch hash, and Safe transaction hash.
6. The JIT packet has no block-count expiry. It is valid only while its exact Safe nonce, owner set,
   threshold, singleton, fallback handler, guard, modules, target state, and transaction hash remain
   unchanged. Any Safe nonce drift from the deployment verification snapshot is a stop-and-review
   condition; do not silently rebuild around an intervening Safe transaction.
7. Human Safe signers execute the exact five-call batch. No deployment CLI signs, sends, or executes
   that Safe transaction.
8. Run `npm run finalize:v4:position-nft-evidence` with the selected repo-relative signing-packet path
   and Base Safe execution transaction hash. The alias runs pending verification, builds final
   evidence, runs the strict final verifier, then renames the exact JIT packet and Safe batch from
   `UNEXECUTED-v4-position-nft-phase2-*` to
   `EXECUTED-DO-NOT-IMPORT-v4-position-nft-phase2-*`. Quarantine never deletes or changes bytes; it
   verifies the finalized SHA-256 values and preserves recoverable evidence. If final verification
   passed but quarantine was interrupted, rerun only
   `npm run quarantine:v4:position-nft-safe-artifacts`. Then rerun
   `npm run verify:v4:position-nft` as a deliberate readback; never import an executed artifact under
   either name.
9. If a JIT build was interrupted before Safe execution, first reconcile Base/Safe state and every
   partial artifact. With the exact explicit
   `V4_POSITION_NFT_INCOMPLETE_QUARANTINE_CONFIRM` value required by the tool, run
   `npm run quarantine:v4:position-nft-incomplete-artifacts`. It recoverably, hash-preservingly
   renames matching `UNEXECUTED` and `PENDING-PACKET-LINK-DO-NOT-IMPORT` files to
   `INCOMPLETE-DO-NOT-IMPORT-*`; it never completes a packet, authorizes signing, or substitutes for
   the post-execution final-manifest quarantine.

## Smoke, observation, and downstream quarantine

After final evidence, obtain separate explicit approval before any value-bearing smoke transaction.
Validate mint, transfer, claims, extension, maturity, unlock/burn, art, metadata, collection fallback,
fee/royalty readback, and the raw-Engine-position path with receipt-block-pinned reads. Reconcile the
complete `PositionMinted` history, including permissionless mints made during finalization.

Hold for 48 monitored hours before public promotion, Phase-3 work, or consumer activation. Monitor
epoch backlog, claim failures, renderer/metadata reads, ownership, frozen fee/royalty state, source
proof, Safe activity, and alert delivery.

During the hold, baskets, Swarm, analytics, frontends, and public documentation remain quarantined:

- no planned, environment-only, or zero-code NFT address;
- no generated ABI/address handoff from a local or uncommitted tree;
- no NFT start block inferred from a plan;
- no “live”, “available”, or “integrated” claim; and
- no Phase-3 Genesis, bond, router, or lens claim.

Consumer updates start only after the finalized manifest and observation record are committed to the
authoritative protocol origin and an explicit handoff identifies the immutable source commit,
manifest, ABI hashes, deployed address, deployment/start block, chain ID, verification status, and
rollback/disable condition. Public documentation is last.
