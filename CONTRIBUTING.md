# Contributing to NARA v4

Contributions are welcome when they improve correctness, verification,
integrator usability, or technical clarity.

## Before starting

1. Read [`AGENTS.md`](AGENTS.md), even when you are not using an AI agent.
2. Read [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).
3. Follow [`docs/REPOSITORY_MAINTENANCE.md`](docs/REPOSITORY_MAINTENANCE.md).
4. Open an issue for a material new feature before implementing it.
5. Report suspected vulnerabilities privately through [`SECURITY.md`](SECURITY.md).

## Development setup

```powershell
npm ci
npm run build
npm test
npm run size
```

Default unit tests require no wallet or RPC endpoint. Fork tests skip when the
required Base RPC environment variable is absent.

## Change requirements

- Keep active code under `contracts/v4/`.
- Never import archived v3 code into the active compile.
- Match interfaces, errors, events, constants, and examples to actual source.
- Add or update tests for every behavior change.
- Include explicit bounds for new configurable value-bearing parameters.
- Use checks-effects-interactions and reentrancy protection where external calls
  and mutable state interact.
- Document the worst-case authority of every privileged operation.
- Prefer periphery changes over core-engine changes when the same behavior can
  be implemented without altering core accounting.
- Update all affected documentation in the same pull request.

## Pull requests

Use a focused branch and a small, reviewable pull request. Complete the pull
request template with:

- change class and scope;
- threat-model impact;
- exact evidence;
- tests and analyzers run;
- current-state and documentation synchronization;
- confirmation that no credentials or production writes are included.

Pull requests must pass required CI checks. Advisory analyzer output must still
be reviewed and discussed when relevant.

## Commit style

Use an imperative subject with a clear scope:

```text
feat(router): add bounded position preview
fix(engine): preserve reward debt during extension
test(hook): cover exact-input boundary tier
docs(protocol): synchronize Stage A state
```

Do not mix unrelated formatting, generated artifacts, deployment operations, and
contract behavior changes in one commit.

## Legal

By contributing, you agree that your contribution is licensed under the
repository's MIT License. Do not submit third-party code or content unless its
license is compatible and attribution requirements are satisfied.

