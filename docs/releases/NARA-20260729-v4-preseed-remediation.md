# NARA v4 Pre-Seed Remediation — Cross-Repository Handoff

Release ID: `NARA-20260729-v4-preseed-remediation`
Repository: `NARAProtocol/nara_protocol_v4`
Authoritative local checkout: `nara-protocol-hardhat/`
Working branch: `audit-remediation-2026-06-18`
Working-tree base commit: `65f297c8123b2b1e8015d467f3cb1d31c5713c40`
Observed `origin/main`: `9e3059e9dbdabacc1662bbe7cd3fe5b0b690e68d`
Recorded: 2026-07-29
State: **implemented and tested in a dirty working tree; not merged, not deployed, not configured, and not activated**

This record routes the current large pre-seed remediation across the NARA
repositories. It is not a release announcement, deployment authorization, or
claim that the corrected source is live on Base.

## Authoritative scope

The canonical technical record is
[`../NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`](../NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md).
It records:

- PS-01: same-block split-fee accounting remediation;
- PS-02: immutable deployed-engine ERC-20 reward containment;
- PS-03: launch-depth-aware basket input limits and no-swap exit fallback;
- PS-04: typed, oracle-bounded basket fee collector redesign; and
- PS-05: exact opening-price binding for the permissionless v4 initialization
  path.

The protocol repository owns the corrected hook, vault, deployment and launch
gates, engine-containment checks, active protocol ABIs, and verified protocol
deployment evidence. Basket contracts, their application, the monitor, and
public documentation consume only immutable evidence produced from this
repository and the baskets repository.

## Evidence boundary

The findings register records the verification performed against the current
working tree on 2026-07-29. That evidence is useful for review, but it is not
immutable release evidence because the repository has uncommitted changes and
untracked files.

Before this handoff can name an origin release commit:

1. remove or deliberately classify unrelated and accidental working-tree
   files without discarding intended user work;
2. review the complete staged diff;
3. scan the staged release for secrets and generated deployment material;
4. rerun the repository's canonical build, test, bytecode, static-analysis,
   and launch-gate commands against the exact staged source;
5. create a focused, signed commit on a protected pull-request branch;
6. merge only after the required canonical CI check is green; and
7. replace the working-tree base below with the full 40-character merged
   origin commit in the successor release record.

No downstream repository may treat
`65f297c8123b2b1e8015d467f3cb1d31c5713c40` as the remediation release. It is
only the base beneath the current uncommitted work.

## Deployment boundary

The fresh v4 core deployed in Controlled Stage A is not permission to reuse the
quarantined Stage A liquidity trio. The corrected hook, vault, compounder, and
related basket components require reviewed deployment transactions and
verified manifests before their addresses can be consumed.

The deployed engine is immutable. PS-02 therefore remains an operational
containment requirement:

- do not use ERC-20 reward notification for the deployed engine;
- do not deploy or authorize `BribeRouterV4` for that engine;
- verify that every known Safe, EOA, vault, and router lacks
  `REWARD_NOTIFIER_ROLE`; and
- do not activate locks or liquidity while the launch gate reports a notifier
  holder.

Source remediation does not change Base state. This record authorizes no
transaction.

## Required publication order

| Gate | Repository | Required evidence | Current state |
|---|---|---|---|
| 1. Origin review | `NARAProtocol/nara_protocol_v4` | Clean reviewed diff, canonical verification, protected PR | Blocked: dirty working tree |
| 2. Origin merge | `NARAProtocol/nara_protocol_v4` | Full merged commit SHA | Not created |
| 3. Deployment | `NARAProtocol/nara_protocol_v4` | Verified contracts, chain ID, addresses, deployment transaction hashes, immutable manifest | Not performed |
| 4. Basket reconciliation | `NARAProtocol/nara_protocol_v4_baskets` | Pinned protocol commit and verified deployment manifest | Blocked on gates 2–3 |
| 5. Monitor reconciliation | `NARAProtocol/nara-swarm-monitor` | Pinned producer commits, verified addresses, deployment block, ABI/event compatibility | Blocked on gates 2–4 |
| 6. Public documentation | `NARAProtocol/nara_protocol` | Reconciled protocol, baskets, and monitor evidence | Blocked on gates 2–5 |
| 7. Activation | Operator-controlled surfaces | All launch gates green and explicit human transaction approval | Not authorized |

The secondary checkout `nara_protocol_v4_publication/` points to the same
GitHub repository as `nara-protocol-hardhat/`. It may prepare documentation
against a pinned merged origin commit, but it must not originate protocol code,
addresses, ABIs, or state claims.

## Downstream handoff requirements

### Baskets

After the protocol remediation is merged and, where required, deployed:

- pin the full protocol origin commit;
- consume ABI and interface changes only from that commit;
- consume addresses only from the verified active deployment manifest;
- record the dependency in the baskets release handoff;
- run deterministic, invariant, frontend, and applicable Base-fork gates; and
- keep the application in preview until its own verified deployment manifests
  and production configuration exist.

### Monitor

After producer evidence exists:

- set `NARA_WORKSPACE_ROOT`;
- set the full merged `NARA_PROTOCOL_ORIGIN_COMMIT`;
- set the full merged `NARA_BASKETS_ORIGIN_COMMIT`;
- run the explicit pinned cross-repository drift check;
- update addresses and start blocks only from verified deployment evidence;
- verify handler coverage for the deployed event surface; and
- do not synchronize ABIs during a runtime monitoring cycle.

The monitor must fail closed if a producer commit is absent, not locally known,
not merged into the producer's `origin/main`, or inconsistent with its expected
GitHub remote.

### Public documentation

Update `NARAProtocol/nara_protocol` last. Public state may describe only:

- code contained in pinned merged origin commits;
- contracts and addresses supported by verified deployment evidence;
- consumer behavior already reconciled in baskets and monitor repositories;
  and
- activation state proven by the applicable launch gates.

Do not convert “implemented,” “tested,” or “deployed” into “active” or
“available.”

## Successor record

When the origin pull request is merged, create a successor record whose release
ID names the merged change and includes:

- this release ID as its predecessor;
- the full merged protocol commit;
- exact verification commands and results from that commit;
- changed ABI, event, address, environment, and manifest surfaces;
- deployment evidence or an explicit `not deployed` state;
- required downstream repository pull requests; and
- explicit `unblocks` and `still blocked` fields.

Until that successor record exists, every downstream state-changing or public
availability update remains blocked.
