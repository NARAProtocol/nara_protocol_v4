# NARA-20260809-disable-github-operations-bots

Change-ID: `NARA-20260809-disable-github-operations-bots`

Origin remote: `NARAProtocol/nara_protocol_v4`

Evidence state: `configured` at the GitHub repository-settings layer. This is
an operational shutdown record, not a protocol deployment or availability
claim.

Origin documentation commit: established by the protected pull request that
adds this record. The two workflow files remain in the repository for
historical review, but GitHub's workflow state and repository variables control
whether they can run. This record does not claim that a code commit performed
the GitHub settings change.

## Action and observed state

At `2026-08-08T22:19Z` (`2026-08-09 01:19` Kyiv), the following GitHub
repository settings were changed:

| Control | Before | After |
|---|---|---|
| `NARA v4 operations keeper`, workflow ID `324678194` | `active` | `disabled_manually` |
| `NARA v4 liquidity maintainer`, workflow ID `324678196` | `active` | `disabled_manually` |
| `V4_OPERATIONS_KEEPER_ENABLED` | `true` | `false` |
| `V4_LIQUIDITY_MAINTAINER_ENABLED` | `true` | `false` |

A post-change GitHub query found no operational run in `in_progress`, `queued`,
`requested`, `waiting`, or `pending` state. The most recent operations-keeper
run before shutdown was scheduled at `2026-08-08T21:41:59Z`, run ID
`31279937640`, and completed with conclusion `failure`.

`NARA v4 CI`, `CodeQL`, and Dependabot were deliberately left active. They do
not use the operational execution path.

## Boundaries

- No on-chain transaction was sent.
- No workflow source, contract, deployment manifest, or downstream repository
  was changed by the GitHub settings action.
- No GitHub secret was read, modified, printed, or deleted.
- The execution secret remains under GitHub secret storage. Keeping it was a
  reversible shutdown choice; this record does not assert that the underlying
  credential has been rotated or destroyed.
- Repository variables being `false` guard scheduled behavior, but the workflow
  source permits some manual-dispatch paths. The `disabled_manually` workflow
  state is therefore a required part of the shutdown.

## Re-enable gate

Do not re-enable or manually dispatch either workflow without all of:

1. a new explicit user order;
2. a current verified fresh-v4 deployment manifest and exact addresses;
3. review of the execution key, its funding, and its least-privilege on-chain
   role;
4. reviewed repository variables and alert/heartbeat configuration;
5. a read-only workflow dispatch and receipt-pinned state verification; and
6. an updated canonical-state record.

Re-enabling a workflow is a production operation. An elapsed interval, engine
backlog, fee balance, or existing workflow file is not authority to do it.

## Verification commands and results

GitHub workflow listing after the change reported:

```text
NARA v4 operations keeper     disabled_manually  324678194
NARA v4 liquidity maintainer  disabled_manually  324678196
```

Repository-variable listing reported both enable flags as `false`. The
operational active-run query returned no rows.

Downstream repositories reviewed: monitor and public-documentation state
language must be reviewed after this origin evidence is merged. No contract
ABI or production address propagation is required by this settings-only change.

On-chain or production writes: GitHub repository settings only; no blockchain
write.
