# NARA v4 epoch-maintainer production guard

Change-ID: `NARA-20260814-v4-epoch-maintainer-production-guard`

Status: prepared for protected-branch review and locally tested. Activation,
dispatch, and onchain execution remain outside this record.

## Scope

This change hardens `.github/workflows/v4-epoch-maintainer.yml` for the fixed
2026-08-09 production deployment. It does not change any contract, deployed
bytecode, protocol role, Safe configuration, or liquidity automation.

The workflow now:

- derives all public deployment configuration from the committed production
  activation manifest rather than mutable GitHub address variables;
- verifies the pinned manifest hash and Token, Engine, Hook, Vault,
  Compounder, and Safe runtime bytecode before every operational check;
- uses an epoch-only gas EOA and separate GitHub secret;
- refuses an automatic backlog above eight epochs;
- refuses partial automatic recovery and unexpected direct-reserve accounting;
- requires a dead-man heartbeat endpoint before execute mode; and
- does not invoke liquidity maintenance.

## Activation boundary

Workflow ID `324678194` remains `disabled_manually`. The new repository variable
`V4_EPOCH_MAINTAINER_ENABLED` is not configured, and legacy variable
`V4_OPERATIONS_KEEPER_ENABLED` remains `false`. The existing Engine backlog must
be recovered and receipt-verified separately. A new dedicated epoch key,
matching public address, Base gas, and heartbeat endpoint must be provisioned
before a read-only workflow dispatch and any later activation review.

No private key, RPC URL, webhook URL, or other secret belongs in this record.
