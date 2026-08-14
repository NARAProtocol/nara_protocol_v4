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

Use a widening verification cadence. Repeating every expensive gate after each
edit is neither required nor useful:

```powershell
# Fast operations/config/workflow edit loop
npm run test:ops

# Once before committing a non-contract change
npm run build
npm run test:nonfork
```

`npm test` is the canonical complete CI gate. A local `.env` with a Base RPC
also opts it into state-dependent fork tests, so run it locally only when a
contract/fork surface changed or when live fork evidence is intentionally being
refreshed. Record any skipped or state-dependent fork result in the pull
request; never relabel it as passing.

At the final pre-push boundary, run the remaining applicable gates once:

```powershell
npm ci
npm run build
npm run test:nonfork # use npm test when contract/fork scope requires it
npm run size
npm audit --audit-level=high
git diff --check
git status --short
git diff
```

Run scoped static analysis and fork tests when the changed risk surface requires
them.

Feature branches must not trigger duplicate CI through both `push` and
`pull_request`. The canonical workflow restricts `push` to `main`, retains all
required PR checks, and verifies `main` again after merge.

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

