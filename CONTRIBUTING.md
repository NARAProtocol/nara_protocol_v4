# Contributing to NARA v4

Contributions are welcome when they improve correctness, verification,
operational safety, integration clarity, or documentation.

## Before starting

1. Read [`AGENTS.md`](AGENTS.md) and [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).
2. For cross-repository work, follow
   [`../docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md`](../docs/NARA_CROSS_REPOSITORY_RELEASE_PROTOCOL.md).
3. Read [`SECURITY.md`](SECURITY.md) and report suspected vulnerabilities
   privately.
4. Never use retired v3, incident-stack, or deleted experimental v5 artifacts
   as deployment authority.

## Development setup

```powershell
npm ci
npm run build
npm test
npm run size
```

Environment-dependent Base fork and production verification commands require a
private RPC endpoint. Never print or commit it, wallet credentials, signing
keys, production environment files, or unsanitized deployment outputs.

## Change requirements

- `contracts/v4/` is the only active contract source.
- Do not edit frozen core contracts unless the issue and pull request explicitly
  name and justify that exact core change.
- Add focused regressions for every behavior change.
- Update deployment scripts, verification gates, generated evidence schema, and
  operational documentation together when an integration fact changes.
- Preserve exact Hook/PoolKey bindings, receipt-pinned accounting, role
  separation, and fail-closed launch gates.
- Do not claim deployment, activation, availability, audit completion, or
  production readiness without the evidence required by the release protocol.

## Pull requests

Use a focused branch and the pull-request template. PRs must name the change ID,
security and deployment impact, exact verification commands, skipped gates,
unresolved risks, and whether any onchain or production write occurred.

Required CI must pass against the current protected base branch. Resolve every
review conversation. Routine direct or force pushes to the default branch are
not allowed.

## Commit style

Use focused Conventional Commits, for example:

```text
fix(v4): bind hook fees to atomic vault accounting
test(v4): cover same-block cumulative rounding
docs(release): record fresh deployment prerequisites
chore(ci): pin analyzer toolchains
```

## Legal

Contributions are licensed under this repository's MIT License. Do not submit
third-party code unless its license and attribution requirements are compatible.
