# Repository Maintenance Protocol

This procedure is mandatory for maintainers, contributors, and AI agents
working in the authoritative `NARAProtocol/nara_protocol_v4` engineering
repository.

## Repository role

This repository owns:

- active protocol source under `contracts/v4/`;
- protocol tests, generated Hardhat artifacts, and security tooling;
- deployment, verification, smoke, and launch-gate scripts;
- sanitized protocol deployment manifests; and
- engineering documentation describing protocol behavior and observed state.

It does not own basket contracts or the publishable basket application, monitor
handlers, or beginner-facing public documentation. Use the FIELD workspace
[`../../docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md`](../../docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md)
to route changes to those consumers.

The local `nara_protocol_v4_publication/` folder is a secondary checkout of the
same GitHub remote. It is not an independent code source.

## Evidence authority

Use the authority that matches the fact being changed:

| Fact | Authority |
|---|---|
| Intended protocol behavior | Active `contracts/v4/` source at the identified commit |
| ABI, events, errors, and selectors | Generated artifacts from that exact source commit |
| Test or analysis result | Named command output produced against the identified commit or explicitly recorded working tree |
| Deployment address and constructor | Sanitized deployment manifest plus transaction evidence |
| Runtime code | Bytecode and verification result at the named chain, address, and block |
| Roles, balances, bindings, and pool state | Reproducible read at the named chain and block |
| Availability | Verified deployment, configuration, consumers, application flow, monitor, and exit evidence |

Code wins when documentation describes intended behavior incorrectly. Onchain
evidence wins when documentation or a local manifest describes observed
deployment state incorrectly. Stop when intended code and deployed runtime do
not match; do not rewrite the docs to hide the divergence.

Never use chat history, screenshots, copied addresses, plans, archived v3
material, or an uncommitted secondary checkout as release evidence.

## Required reading

Before changing code-derived or deployment-derived facts:

1. [`../AGENTS.md`](../AGENTS.md)
2. [`../CLAUDE.md`](../CLAUDE.md)
3. [`CURRENT_STATE.md`](CURRENT_STATE.md)
4. [`V4_CONTRACT_INDEX.md`](V4_CONTRACT_INDEX.md)
5. the affected source, tests, scripts, manifests, and technical docs
6. the cross-repository release handoff when the change has consumers

## Synchronization matrix

| Changed fact | Files and surfaces to review |
|---|---|
| Contract behavior or ABI | Source, unit/fork/invariant tests, generated artifacts, `V4_CONTRACT_INDEX.md`, affected technical docs, root README |
| Events or indexable state | Source, tests, generated artifacts, monitor compatibility, affected operator docs |
| Deployment constructor or script | Script tests, deployment docs, launch runbook, checklist, manifest schema |
| Deployment address or observed state | Sanitized manifest, `CURRENT_STATE.md`, `NARA_V4_PUBLIC_STATE.md`, launch evidence, downstream configuration |
| Compiler or dependency | `hardhat.config.ts`, `package.json`, lockfile, CI, static-analysis compatibility, developer commands |
| Engine model or accounting | Engine libraries and source, engine tests, invariants, `EMISSION_MECHANICS.md`, operations and risk docs |
| Liquidity behavior | Hook/vault/compounder source and tests, real-v4 or fork tests, `UNISWAP_V4_HOOK.md`, launch scripts and gates |
| Position lifecycle | NFT/account source and tests, `NARA_V4_NFT_POSITIONS.md`, renderer or frontend integrations |
| Role, custody, or recovery | Source and tests, deploy/transfer scripts, `CURRENT_STATE.md`, custody plan, runbooks, security policy |
| Basket integration | Protocol interface/artifact, basket repository dependency, app builders, monitor, public docs |
| Product availability | Verified deployment and configuration, consumer repos, app flow and exit test, monitor state, public docs |

For every affected row, update the listed surface or record
`reviewed — no change needed` with a reason in the pull request.

## Change procedure

1. Run the workspace repository-routing check.
2. Confirm this checkout's origin, branch, HEAD, and working-tree state.
3. Work on a focused branch; never push directly to the default branch.
4. Assign a cross-repository Change-ID when consumers may be affected.
5. Classify the evidence state before editing.
6. Inspect the actual source, generated evidence, and applicable live reads.
7. Make the smallest complete change and add regression tests.
8. Update every applicable synchronization-matrix surface.
9. Run the risk-proportionate gates against the complete intended diff.
10. Inspect the staged diff and classify every untracked file.
11. Scan staged content for secrets, credentials, personal data, and signing
    material.
12. Commit intentionally, open a protected pull request, and record skipped
    gates or unresolved risks.
13. After merge, record the full 40-character origin commit.
14. Deploy only under separate explicit human authorization.
15. Route verified evidence to baskets, monitor, and public documentation in
    the required order.

## Verification gates

Baseline source gates:

```powershell
npm ci
npm run build
npm test
npm run size
npm audit --audit-level=high
git diff --check
git status --short
git diff
```

Run the applicable scoped gates when their risk surface changes:

```powershell
npm run slither:v4
npm run aderyn:v4
npm run echidna:v4
npm run launch:gates
```

Fork, live-read, deployment, or environment-dependent checks must state the
chain, block when applicable, command, result, and reason for every skip.
Passing tests in a dirty working tree may be recorded as working-tree evidence,
but not as an immutable release result.

## ABI and artifact handling

- Generate artifacts from the intended source; do not hand-edit them.
- A downstream consumer must pin the full merged origin commit.
- Do not copy artifacts from the dirty engineering checkout into another
  repository.
- Do not generate or synchronize ABIs during a monitor runtime cycle.
- If an ABI or event changes, review baskets and the monitor explicitly even
  when no consumer update is ultimately required.

## Deployment and manifest handling

- Planned addresses remain unset.
- Every replacement contract receives a new historical manifest entry.
- Never overwrite an old address to make it appear current.
- Record chain ID, transaction hash, deployment block, constructor arguments,
  runtime verification, roles, and bindings.
- Keep only sanitized manifests in Git.
- Do not copy `.env` values, private RPC URLs, wallet material, private keys,
  seed phrases, or signing commands into Git, handoffs, or logs.
- `implemented`, `tested`, `merged`, `deployed`, `configured`, `indexed`,
  `activated`, and `available` are separate states.

## Cross-repository release order

1. Complete source, tests, artifacts, technical docs, and the findings record
   here.
2. Merge through protected CI and record the full origin commit.
3. If production state changes, create and verify the sanitized deployment
   evidence.
4. Reconcile `NARAProtocol/nara_protocol_v4_baskets`.
5. Reconcile `NARAProtocol/nara-swarm-monitor` from pinned producer commits and
   verified start blocks.
6. Update `NARAProtocol/nara_protocol` last.
7. Describe a feature as available only after deployment, configuration,
   application, monitor, smoke, and exit evidence converge.

For a large change, create
`docs/releases/<NARA-YYYYMMDD-short-name>.md`. Downstream pull requests must
reference the record and immutable origin commit.

## Stop conditions

Stop and report the conflict when:

- this checkout and the secondary checkout contain divergent unmerged
  implementations;
- source, artifact, manifest, constructor, runtime bytecode, ABI, event, role,
  binding, or documented state disagree;
- the intended release includes unexplained or accidentally generated files;
- a downstream update depends on an unmerged commit or planned address;
- a required test or security gate is red or was silently skipped;
- a secret, credential, private endpoint, personal datum, or signing artifact
  appears in the diff;
- the change would edit archived v3 code or revive an inactive consumer by
  address substitution; or
- wording claims audit completion, safety, production readiness, regulatory
  approval, returns, or suitability without exact current evidence.

Do not bypass branch protection, signed commits, required checks, secret
scanning, linear history, or this release order.

## Pull-request handoff

Use the repository pull-request template. Record the Change-ID, origin commit,
evidence state, threat-model impact, synchronization review, exact commands and
results, skipped gates, unresolved risks, downstream repositories, and whether
any onchain or production write occurred.
