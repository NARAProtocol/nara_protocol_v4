# Repository maintenance protocol

This procedure is mandatory for maintainers, contributors, and AI agents.

## Evidence priority

When sources disagree:

1. deployed bytecode and state at a named Base block;
2. sanitized deployment manifests;
3. active `contracts/v4/` source and generated artifacts at the release commit;
4. passing tests and reproducible scripts;
5. current documentation;
6. plans, issues, chat history, and archived material.

Stop when higher-ranked sources conflict. Do not resolve the conflict by
rewriting documentation around an assumption.

## Required reading

Before changing code-derived or deployment-derived facts:

1. [`../AGENTS.md`](../AGENTS.md)
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. [`V4_CONTRACT_INDEX.md`](V4_CONTRACT_INDEX.md)
4. the affected source, test, script, and documentation

## Synchronization matrix

| Changed fact | Files to review |
|---|---|
| Contract behavior or ABI | source, tests, `V4_CONTRACT_INDEX.md`, relevant technical doc, README |
| Deployment address or state | sanitized manifest, `CURRENT_STATE.md`, `NARA_V4_PUBLIC_STATE.md`, README |
| Compiler or dependency | `hardhat.config.ts`, `package.json`, lockfile, CI, developer guide |
| Engine model or accounting | libraries, engine tests, invariants, `EMISSION_MECHANICS.md`, risk docs |
| Liquidity behavior | hook/vault/compounder tests, `UNISWAP_V4_HOOK.md`, `CURRENT_STATE.md` |
| Position lifecycle | NFT/account tests, `NARA_V4_NFT_POSITIONS.md`, developer guide |
| Role or custody | tests, scripts, `CURRENT_STATE.md`, custody doc, security policy |
| Product availability | `CURRENT_STATE.md`, public state, roadmap, README |

For every affected row, update the file or record “reviewed—no change needed”
in the pull request.

## Change procedure

1. Work on a focused branch.
2. Classify the change as contract, test, deployment, integration,
   documentation, dependency, or operations.
3. Record exact evidence before editing prose.
4. Make the smallest complete change.
5. Add or update tests for behavior changes.
6. Search for superseded names, addresses, statuses, limits, and test counts.
7. Run the applicable gates.
8. Inspect `git status`, `git diff --check`, and the complete diff.
9. Scan tracked content for secrets.
10. Open a pull request using the repository template.

## Required local gates

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

Run scoped static analysis and fork tests when the changed risk surface requires
them.

## State language

- `implemented`: source exists;
- `tested`: named tests passed at a stated commit;
- `deployed`: bytecode exists at a verified address;
- `configured`: required bindings or roles are set;
- `activated`: intended public behavior is enabled;
- `available`: a user can actually use the surface;
- `deferred`: deliberately outside current scope;
- `retired`: historical and unsupported.

Never collapse these states into “live.”

## Generated and deployment material

- Use generated Hardhat artifacts as ABI truth.
- Never edit compiled artifacts to resemble deployed code.
- Never change a deployment manifest without reproducible transaction evidence.
- Keep only sanitized manifests in Git.
- Do not publish wallet material, private RPC URLs, or signing procedures.

## Cross-repository order

This folder is a secondary checkout of the same
`NARAProtocol/nara_protocol_v4` remote used by the authoritative engineering
checkout. It is not a publication fork or an independent source.

1. Complete engineering work in the authoritative checkout.
2. Merge through protected CI and record the full release commit.
3. Verify any deployed or observed state.
4. Start this documentation branch from the identified remote commit.
5. Update consumers in baskets and monitor from the same evidence.
6. Publish beginner-facing state through `NARAProtocol/nara_protocol` last.

Never copy uncommitted files between checkouts. In the FIELD workspace, follow
`../docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md` for the complete registry
and handoff format.

## Stop conditions

Stop and request maintainer review when:

- source, artifact, constructor arguments, or runtime bytecode disagree;
- an address cannot be independently verified;
- a change modifies engine or position-NFT accounting without authorization;
- a diff contains a secret or personal data;
- wording claims safety, guaranteed returns, legal approval, or suitability;
- scanner output provides no location or reproducible attack sequence.

## Handoff

Every pull request records scope, evidence, threat-model impact, synchronized
files, commands and results, unresolved assumptions, and whether an onchain
write occurred.
