# NARA-20260731 post-launch operations

Change-ID: `NARA-20260731-post-launch-operations`

Origin remote: `NARAProtocol/nara_protocol_v4`

Origin evidence: deployed engine source and ABI commit
`3215b69a1154b9c30957cd8d875b636dedc9d0ca`; sanitized launch and replacement
deployment manifests in `deployments/`. Record the immutable protected-branch
merge commit in downstream handoffs after this release pull request merges.

Evidence state: engine backlog recovered; emission reserve synchronized;
replacement liquidity trio deployed, configured, validation-compounded, and
frozen; dedicated compound keeper authorized; recurring operations workflow
implemented and tested but deliberately disabled pending its first reviewed
manual execute-mode run.

Changed contracts/interfaces: the repository now includes the hardened active
v4 source corresponding to the deployed replacement stack. This pull request
does not deploy or upgrade contracts. It also adds operations scripts, tests,
workflows, and current-state evidence.

Generated artifact or ABI source: generated Hardhat artifacts from active
`contracts/v4/` source. Maintainers use minimal read/write ABI fragments derived
from those interfaces; consumers must use artifacts from the eventual immutable
merge commit.

Deployment manifests: `deployments/v4-base-usdc-latest.json` and
`deployments/v4-pool-launch-2026-07-30.json`, preserving historical Stage A and
replacement-trio evidence rather than overwriting it.

Chain and verification evidence: Base, chain ID `8453`. Pool launch transaction
`0x91638d26adbc301e715f76ea2c3e8e6bf6727590f4bcd46416dfbeb456740c8c`
at block `49328483`. At block `49363662`, current epoch was `478`, settled epoch
was `475`, and the remaining three-epoch backlog was inside the engine's
eight-epoch just-in-time recovery cap. The sealed reward reserve reported
`650,000 NARA`, with zero direct untracked engine balance.

Liquidity evidence: the replacement compounder owns LP NFT `2885838`. The vault
recorded `10,497.819596280213570307 NARA` and `289.617384 USDC` compounded, and
the compounder address is permanently frozen. Transaction
`0x27d87f0c216133c590e49e59980b208d22726c5b6522d9572a9f16cff8f33cbd`
authorized dedicated keeper
`0xa4B4B00f067cB4f5607c9a7298827fa1C1315aB7` at block `49363406`.

Keeper design: a single low-cost scheduled workflow checks epoch health and
liquidity maintenance every 30 minutes. Epoch advancement is permissionless.
The keeper has no owner, parameter, treasury, Safe, recovery, or arbitrary
withdrawal authority. Its vault authorization permits `compound` operations in
the current `Liquidity` route mode; route or split behavior remains controlled
by the Safe through the vault configuration. Execution is guarded by the
repository variable `V4_OPERATIONS_KEEPER_ENABLED`, currently `false`.

Commands and results at release candidate `223d524` before this documentation
correction:

- `npm ci`: passed;
- `npm run verify:public`: passed, 251 files inspected;
- `npm run build`: passed, 69 Solidity files compiled with solc `0.8.34`;
- `npm test`: 507 passing, 5 pending, 0 failing;
- `npm run size`: passed; all deployment artifacts within configured limits;
- `npm audit --audit-level=high`: passed; eight low-severity transitive
  `elliptic` advisories remain with no available fix;
- `git diff --check`: passed;
- staged secret scan: no credential-bearing RPC URLs, private-key assignments,
  or `.env` files found;
- read-only `npm run maintain:v4:epochs`: passed and reported JIT-recoverable
  epoch health;
- read-only `npm run maintain:v4:liquidity`: passed, confirmed keeper
  authorization and frozen compounder, and correctly planned no transaction
  while vault balances were zero.

On-chain or production writes by this pull request: none. The evidence above
records separately authorized operator and Safe transactions performed before
publication.

Unresolved risks and next gates:

- merge through protected-branch CI;
- dispatch the published workflow in read-only mode and inspect its logs;
- dispatch one reviewed execute-mode run, confirm epoch and liquidity
  post-state, then enable the schedule;
- observe at least 48 hours of successful maintenance and alerting before
  describing the operations path as activated;
- finish the two-stage Safe/timelock fee-policy update separately;
- custody remains one 2-of-3 Safe rather than the documented two-Safe 3-of-5
  target, and the treasury lock commitment remains unexecuted;
- basket contracts and the publishable app remain preview-only until their own
  verified deployment manifests and release gates exist.

Secret handling: no RPC or signing-key value is stored in the repository. The
workflow reads only repository secrets and rejects admin, treasury, deployer,
or Safe-owner key fallbacks.
