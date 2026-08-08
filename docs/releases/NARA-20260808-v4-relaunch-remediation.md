# NARA-20260808-v4-relaunch-remediation

Change-ID: `NARA-20260808-v4-relaunch-remediation`

Origin remote: `NARAProtocol/nara_protocol_v4`

Origin commit: _blank until a full 40-character commit is created through the
protected review path_. This working tree is not immutable release evidence and
must not be consumed downstream.

Evidence state: **implemented and locally tested** for the named deterministic,
focused fork, size, dependency, and static-analysis gates below. This is not a merged,
deployed, configured, indexed, activated, available, independently audited, or
production-ready claim.

Canonical identity for the fresh deployment is public brand `NARA`, ERC-20 name
`NARA`, raw ERC-20 symbol `NARA`, and presentation ticker `$NARA`. The dollar
prefix is not part of the onchain symbol. ERC-2612/EIP-712 clients must derive
the fresh signing domain from token `name()` (`NARA`); no stale `NARA Token`
domain may be used.

## Phase-one execution gate

State: **blocked before the first Base transaction**.

Phase one is the complete fresh core activation: Launcher; atomic Token/Engine;
sealed RewardReserve; Vault; CREATE2 Hook deployer; canonical `0x2088` Hook;
fresh PoolKey; replacement Compounder deployment and wiring; atomic pool
registration/initialization/first mint; validation compound and one-way
Compounder freeze; receipt-pinned buy/sell smoke; and verified sanitized
manifest. Allocations, position NFT/bonds, router/lenses, basket activation, and
composability are later phases.

Current proposed economic inputs are `60,000 NARA + 300 USDC`, pool fee `3000`,
tick spacing `60`, and opening price `$0.005/NARA`. Those seed/depth values are
not implicitly approved by this source change: the prior pool at the same depth
scale demonstrated extreme sell impact. The final depth and custody inputs
require explicit human approval before deployment.

Hard stops as of 2026-08-08:

- no immutable reviewed origin commit exists for this working tree;
- required CI has not run against the actual candidate;
- local Aderyn and Echidna cannot start because the registered WSL virtual disks
  are missing;
- the configured deployer is below the runbook's `0.05 ETH` gas minimum;
- the current environment still contains historical incident-stack address
  keys and must not be used by post-deploy sync/preflight until a fresh manifest
  is generated and reviewed; and
- no fresh receipt-pinned manifest, runtime hashes, source-verification blocks,
  ownership acceptances, or notifier-role proof exists.

No retry may reuse a partial deployment blindly. The deployment journal and
fresh-manifest synchronizer must preserve enough receipt evidence to recover or
explicitly abandon a partial attempt without mixing it with retired state.

The production deployer now enforces that boundary: on Base it requires a clean
full-length release commit already contained in synchronized `origin/main`, a
minimum `0.05 ETH` deployer balance, canonical Base infrastructure and pool
configuration, the approved Safe v1.4.1 singleton/proxy and 2-of-3 custody
shape, matched treasury credentials when supplied, and durable prepared →
submitted → confirmed receipt journaling. Any partial attempt creates a
no-blind-retry checkpoint.

The atomic launch builder now pins canonical Base USDC, Permit2, PoolManager,
PositionManager, Hook immutables, approved fee curves, receipt-anchored
notifier-role history, and the Safe runtime/singleton/no-guard/no-module state.
It encodes the exact MultiSendCallOnly payload, records the Safe nonce and
transaction hash, and requires a whole-batch Safe-context simulation before it
writes an artifact. Historical generated batches are not release evidence.

Changed contracts/interfaces:

- `contracts/v4/NARALiquidityGrowthHook.sol`
- `contracts/v4/NARALiquidityGrowthVault.sol`
- `contracts/v4/NARALiquidityCompounderV4.sol`
- `contracts/v4/composability/NARAFractionalPositionV4.sol`
- no frozen `NARAEngine.sol` or `NARAPositionNFTV4.sol` edit;
- all experimental protocol V5 contracts/interfaces/tests/scripts/plans are
  deleted and must stay absent; and
- `contracts/v4/NARAPositionRendererV5.sol` intentionally remains. Its name is
  the renderer revision inside the v4 family, not a protocol V5 stack.

Generated artifact or ABI source: generated active-v4 Hardhat artifacts from
the eventual immutable origin commit. Working-tree artifacts are test evidence
only and may not be vendored downstream.

Deployment manifest: _blank_. Create a new sanitized full-v4 manifest only
after explicit human approval and verified deployment. Controlled Stage A and
`deployments/v4-pool-launch-2026-07-30.json` are historical incident/recovery
evidence and must not supply candidate addresses, roles, pool state, or defaults.

Chain and verification block: Base, chain ID `8453`; transaction hashes,
addresses, deployment block, verification block, runtime hashes, constructor
arguments, pool ID, and start block are blank until observed and verified.

Depends-on:

- protected review, green canonical CI, and a full 40-character origin commit;
- final human approval of full-v4 scope, custody, fees, configured depths,
  opening price, seed amounts, roles, and deployment inputs;
- complete deterministic, fork, invariant, economic, static-analysis, fuzz,
  bytecode-size, dependency, secret, documentation, and launch-gate evidence;
- exact simulation of the final atomic launch batch from the intended Safe;
- verified source, receipt-pinned readbacks, reciprocal Hook/Vault/Compounder
  bindings, and a new sanitized manifest; and
- explicit downstream handoffs after immutable producer evidence exists.

Unblocks:

- basket integration against the exact fresh Token, Engine, Hook, pool key,
  generated ABI, deployment block, and verified manifest;
- monitor configuration against the same producer commit, events, addresses,
  and start block; and
- public documentation only after protocol, baskets, and monitor evidence
  converges.

Downstream repositories reviewed:

- `NARAProtocol/nara_protocol_v4_baskets`: depends on immutable protocol ABI,
  fresh addresses/pool key, exact Hook quote and fee semantics, and a verified
  manifest. Its publishable app remains preview-only.
- `NARAProtocol/nara-swarm-monitor`: depends on immutable event ABI, fresh
  addresses, verified deployment/start blocks, keeper state, and fee/banking
  alerts.
- `NARAProtocol/nara_protocol`: publishes last and must not claim availability
  from this working tree.
- `nara_protocol_v4_publication`: secondary checkout of this same origin remote;
  it was not edited and must be synchronized only from a merged remote commit.

## Behavioral boundaries requiring downstream review

- Tax applies to every supported exact-input swap through the one registered
  canonical NARA/USDC v4 Hook pool. Exact-output swaps are rejected.
- ERC-20 transfers and swaps through third-party or unregistered pools are
  outside this Hook and are not universally taxed.
- Same-block input flow aggregates across callers; a new block resets pressure.
- Fees are taken in the input currency. One-sided inventory remains banked until
  matching counterasset exists; only balanced inventory can become active POL.
- Every official script that loads `currentV4Config()` now requires exact
  `0x2088` Hook permission bits, fee `3000`, tick spacing `60`, and a pool ID
  recomputed from the sorted NARA/USDC PoolKey before it can read or encode that
  pool. The live preflight independently repeats this derivation.
- The USDC-to-NARA pressure-ladder projection, spot-price display, and minimum
  output calculation derive currency direction from the fresh Token/Base
  address ordering; both possible orderings have focused regressions.
- Fractional wrappers support only standard, non-Genesis position NFTs. A bind
  must target the factory's current `fractionalOf(tokenId)` entry; a replaced
  stale wrapper cannot bind.

## V5 retirement and remaining names

The experimental protocol V5 source, tests, scripts, compiler override, package
commands, and release plans are obsolete and deleted. Remaining V5 strings are
limited to:

- the intentionally active v4 renderer revision
  `contracts/v4/NARAPositionRendererV5.sol` and its renderer-specific tests/docs;
- explicit warnings that the experimental protocol V5 stack is deleted; and
- immutable historical recovery manifests/release records that describe the
  canceled proposal and are labeled historical. Historical manifests are not
  edited or reused as release authority.

## Commands and results

Commands and results:

- workspace repository-routing check: **passed** on 2026-08-08;
- origin identity check: remote `NARAProtocol/nara_protocol_v4`, branch
  `fix/v4-relaunch-remediation-20260808`, starting HEAD
  `235a60663dc03917592fa52d435e8f3139e7de3f`;
- `npm install --package-lock-only --ignore-scripts`: **passed**; lockfile now
  resolves Mocha's `js-yaml` to fixed `4.3.1`;
- `npm install --ignore-scripts` and `npm ls js-yaml --all`: **passed**; the
  installed tree resolves `js-yaml@4.3.1` without an invalid override;
- `npm audit --json`: initial result **1 High / 8 Low**; the High was
  `js-yaml@4.3.0` (`GHSA-5p4m-2wfm-xmqj`);
- `npm audit --json` after the override: **0 Critical / 0 High / 0 Moderate /
  8 Low**; all eight Low entries trace to Hardhat Verify's legacy Ethers
  v5/elliptic chain and report `fixAvailable: false`;
- `npm run build`: **passed**;
- post-identity affected Hardhat selection (token, permit/EIP-712 consumers,
  engine/router/lens/bribe/NFT fixtures, invariants, and deployment identity):
  **253 passing / 0 failing**;
- deterministic non-fork Hardhat suite on the settled tree, including the new
  deployment-evidence, fresh-sync, and atomic-artifact regressions: **546
  passing / 0 failing**;
- focused PoolKey/config/preflight/ladder-safety regressions: **19 passing / 0
  failing**;
- targeted TypeScript compile for the changed config, preflight, ladder,
  swap-safety, and test files: **passed**. The repository-wide `tsc --noEmit`
  command still reports pre-existing diagnostics in unrelated scripts and
  contract tests; it reported no changed-file diagnostic from this work;
- `hardhat test test/fork/NARALiquidityCompounderV4.fork.test.ts`: **2 passing /
  0 failing** against Base fork;
- aggregate `npm test` includes every RPC-enabled Base fork suite on this
  machine and exceeded the four-minute command window on the settled tree. It
  is not counted as a pass or failure; the deterministic suite and relevant
  focused Base-fork suite are reported separately above;
- `npm run size`: **passed**; all deployable artifacts are within EVM limits.
  `NARAEngine` remains 24,554 bytes, 22 bytes below EIP-170;
- `npm run slither:v4`: **completed with exit 0** for every configured v4
  production target; raw heuristic findings still require critic disposition;
- `npm run aderyn:v4:only`: **not executed successfully** because no Aderyn
  binary exists in the installed WSL environment;
- `npm run echidna:v4:smoke`: **not executed successfully** because the wrapper's
  configured `AderynTmp20260524` WSL distribution points to a missing virtual
  disk. Ubuntu is registered, but this does not prove the expected Echidna/solc
  toolchain is installed there;
- `git diff --check`: **passed** (line-ending conversion warnings only);
- changed-Markdown local-link check: **passed** for 20 files;
- GitHub Action immutable-pin check: **passed** on the current workflow tree;
- workflow YAML parses with `contents: read`; all Action refs use full SHAs;
  Slither is pinned to 0.11.3, Aderyn to checksum-verified 0.6.8 with updater
  installation disabled, and Echidna to 2.3.3. Advisory analyzer failures are
  visible at the step level rather than hidden by shell `|| true`;
- added-line literal-secret pattern scan: **passed**;
- active config/document references to deleted V5 paths: **none**; and
- verified zero-byte junk files `still`, `{`, and `{const`: **removed**.

Skipped gates:

- no merge or immutable origin commit;
- no production deployment, transaction, verification, configuration,
  downstream update, indexing, activation, or availability check;
- no use of the duplicate publication checkout; and
- Aderyn and Echidna remain open as described in Commands and results. The
  canonical CI must rerun every configured gate on the immutable origin.

Unresolved risks:

- the Engine runtime remains near the EIP-170 limit and must not grow;
- per-block pressure does not prevent cross-block splitting;
- one-sided fee inventory cannot create POL without matching counterasset;
- the remaining eight Low npm advisories are in Hardhat Verify's legacy Ethers
  v5 dependency chain and report no available upstream fix; and
- four unrelated untracked historical-liquidity withdrawal files appeared
  concurrently during this remediation and were not reviewed under this change
  ID; they must be excluded or audited separately before the origin commit; and
- production readiness remains blocked on immutable origin, independent review,
  human-approved inputs, exact launch simulation, verified deployment evidence,
  downstream convergence, and soak/exit evidence.

Onchain or production writes: **none**. No transaction was built for signing,
signed, submitted, broadcast, or deployed by this work.

Secret scan: **passed** for added-line literal-secret patterns. No environment
value, RPC URL, private key, mnemonic, signer material, API token, webhook, or
deployment credential was requested, printed, copied, or written by this work.
