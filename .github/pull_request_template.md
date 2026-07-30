## Summary

Describe the smallest complete change and why it is needed.

## Change class

Choose one: contract, test, deployment, integration, documentation, dependency,
or operations.

## Cross-repository routing

For a repository-local change, write `not applicable` with a reason.

```text
Change-ID:
Origin remote:
Origin commit:
Evidence state:
Depends-on:
Unblocks:
Downstream repositories reviewed:
```

- [ ] Protocol behavior originated in this repository.
- [ ] Consumer changes use a full merged origin commit.
- [ ] Address or deployment claims use a verified sanitized manifest and named block.
- [ ] No uncommitted file or secondary checkout was used as integration evidence.

## Evidence

Link exact source, tests, sanitized deployment evidence, or a named Base block.

## Threat-model impact

Describe changed trust, custody, authorization, external calls, accounting,
rounding, liveness, or integration assumptions. Write `none` only with a short
reason.

## Synchronization

List every affected file from `docs/REPOSITORY_MAINTENANCE.md` and mark it
`updated` or `reviewed - no change needed`.

## Verification

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run size`
- [ ] `npm audit --audit-level=high`
- [ ] Applicable static analysis or fork tests
- [ ] `git diff --check`
- [ ] Complete diff reviewed

Record command results and any skipped environment-dependent gate.

## Safety

- [ ] Active v4 sources only
- [ ] No private keys, seed phrases, `.env` content, credentials, or private RPC URLs
- [ ] No unauthorized production transaction or production write
- [ ] Deployment and activation states are described separately
- [ ] No safety, return, price, legal-approval, or investment-suitability claim
- [ ] Security-sensitive details are being disclosed privately when required

## Handoff

State unresolved assumptions, remaining risks, and the next authorized step.
