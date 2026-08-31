# NARA v4 Treasury Range Manager Candidate

Evidence state: **HISTORICAL PROTECTED CANDIDATE / SUPERSEDED FOR LAUNCH BY DEDICATED-SAFE REMEDIATION / NOT DEPLOYED / NOT ACTIVATED / NO EXTERNAL AUDIT CLAIM**

Change ID: `NARA-20260828-v4-treasury-range-manager`

Strategy retirement note: the 100,000 NARA / 5,000 USDC strategy and every
hash or generated artifact in this record are historical and must not be
imported. The smaller 2026-08-31 canary is a separate source/evidence change;
see
[`NARA-20260831-v4-treasury-range-500-usdc-canary.md`](NARA-20260831-v4-treasury-range-500-usdc-canary.md).
The amounts later in this document are intentionally preserved as historical
facts, not current launch parameters.

Dedicated-custody correction: the historical implementation below used the
protocol 2-of-3 Safe for both deployment execution and tactical custody. That
conflation is not launch authority. Change
`NARA-20260831-v4-treasury-range-dedicated-safe` separates the roles: the
protocol Safe may execute only the CREATE2 deployment, while the dedicated
Treasury Range Safe is the immutable manager authority, inventory custodian,
order/cancellation signer, and settlement recipient. The dedicated Safe is
currently a pinned 1-of-1 canary custody Safe; explicit human risk acceptance or
an approved multisig upgrade is required before funding. The protected
remediation source, tests, and documents do not constitute a deployment or
transaction.

Origin remote: `https://github.com/NARAProtocol/nara_protocol_v4`

Historical pre-remediation implementation commit: `b34b78330f2f40b514d2bf6a0e5cff96c92ff928`

Protected PR #52 merged the 2026-08-30 remediation as GitHub-verified source
commit `35091010de09802f39ccda7e726ff8c4b240e165`. The protected PR and
post-merge `main` checks passed. This immutable source evidence is not
deployment authority. The old single-Safe strategy/deployment model must not be
regenerated for signing; current builders require the dedicated-Safe policy and
new protected source.

This change adds the immutable Safe-bound manager contract, exact state reader/planner/optimizer, adversarial Base-fork matrix, three unsigned Safe packet builders, and a separate event-driven permissionless settler. It does not modify permanent POL, the active Hook, existing production maintainer workflows or services, schedules, keys, roles, or production manifests. The protected CI workflow is extended only to run the settler tests and strict TypeScript check and to require the manager in Slither target discovery.

No production transaction was signed, submitted, broadcast, or proposed for immediate execution. Generated JIT packets are deliberately nonce/block/hash/deadline-bound human-review evidence, not deployment authority.

The final internal remediation record is
[`NARA_TREASURY_RANGE_MANAGER_REMEDIATION_2026-08-30.md`](../security/NARA_TREASURY_RANGE_MANAGER_REMEDIATION_2026-08-30.md).

Live-state correction requiring a new pinned preflight: current review found the dedicated Treasury Range Safe holds zero NARA/USDC while material inventory remains at the separate EIP-7702-delegated Treasury address. The protocol deployment Safe is not custody and must not be funded for this strategy. The order builder reads only dedicated-Safe balances and therefore fails closed. Any Treasury-to-dedicated-Safe funding is a separate explicitly approved action, is not included in these builders, and requires re-pinning/re-hashing/rebuilding afterward.

## Operations design

- Deployment uses the existing protocol-Safe-owned CREATE2 deployer but binds the constructor to the distinct dedicated Treasury Range Safe, NARA, USDC, Vault, PoolManager, PositionManager, Permit2, Hook, fee, tick spacing, PoolId, and a short deadline. The executor receives no order authority.
- Order creation atomically approves exact total inputs, creates strategy-hash/deadline-bound orders, resets approvals, and calls `assertOperationalClean()`.
- Cancellation requires explicit order IDs, reviewed `minNaraOut`/`minUsdcOut`, reason, and short deadline. It directly verifies allowance layers but deliberately does not gate on forceable manager token balances or append `assertOperationalClean()`. Its cancellation-only `emergency_exit_bypass` keeps packet construction available after USDC dependency drift and visibly labels snapshot-only evidence; it cannot make an incompatible token transfer succeed.
- Every builder requires protected-origin ancestry plus live credential-free `git ls-remote` equality with the configured upstream branch, a clean tracked repository HEAD while permitting only the exact resolved untracked generated strategy file, recent strategy block/hash/timestamp, canonical addresses/runtime hashes/reciprocal bindings, complete active and pending Hook curve/depth checks, role-specific Safe 1.4.1 topology evidence/nonce, whole-batch `simulateAndRevert`, per-slug call-shape validation, and a no-overwrite JIT output.
- Before it reads the manager artifact, the deployment builder forces Hardhat `clean` and a no-test forced build so an ignored or previously tampered artifact cannot survive as deployment input.
- Order creation imports the simulator's shared exact integer planner and recomputes each enabled order's price/tick alignment, JIT one-sidedness, liquidity, exact input/dust, output, tolerance, and minimum before encoding.
- Deployment consumption requires a hash-pinned v3 manifest binding the exact successful protocol-Safe execution/nonce/inner call and `ExecutionSuccess` log, exact Create2HookDeployer `Deployed(address,salt,initCodeHash)` event/receipt, and sanitized dedicated-Safe policy. Legacy v2 evidence is refused.
- The settler listens to the canonical PoolManager Swap topic on two independent WebSockets, uses independent HTTP polling/full sweeps, bounds pagination and the contract's 16-order settlement batch, simulates on all three providers, and requires all-three receipt/state agreement.
- Each sweep checks manager/core/infrastructure runtime hashes and both Safe roles on all three providers and compares a pinned canonical hash of active and pending Hook curves/depths, so governance-state drift is visible without bytecode drift. Strategy v3 additionally binds the custody policy plus Circle USDC proxy implementation/admin slots, proxy/implementation/Multicall3 reader hashes, admin/owner/pauser/blacklister, pause state, and blacklist state for the actual token actor set. Three-provider disagreement or drift blocks writes before nonce selection.
- Every critical RPC has a source-labelled deadline and each sweep has a watchdog. A hang destroys providers, stops watchers, and exits nonzero for supervised restart; three-of-three agreement is never weakened.
- The service signs and durably records the exact raw transaction, hash, nonce, and order intent before broadcast. That pending transaction blocks further writes but not sweeps, heartbeats, or alerts. A dropped view or terminal race retains the signed nonce lineage until the exact hash has a canonical confirmed receipt. Crash recovery may rebroadcast only the identical raw transaction after fresh all-three bindings, USDC dependency validation, and all-three exact-calldata simulation; the service never blindly replaces it or submits a nonce chain. For a successful settlement receipt, full receipt-bound accounting is appended durably before pending state is cleared. A canonically confirmed reverted receipt also consumes the nonce and clears the pending record after its terminal state is classified; it is never represented as successful accounting.
- Three distinct RPC URL origins are enforced, but hostnames cannot prove vendor, account/control-plane, or infrastructure independence. Production activation requires a separate human attestation of those properties.
- Two-instance races are intentionally safe: the first valid call wins and the second reports `Settled`, `Cancelled`, or `mixed_terminal` distinctly. The instances must use distinct gas-only keys.

The service reacts to a relevant Swap immediately, but V1 settlement is a later transaction. A fully traversed SELL_NARA range is not irreversibly crystallized into Safe-held USDC until the settlement receipt; it may reverse before then, and same-transaction buy/reverse flow cannot be intercepted off-chain. Partial or mixed positions are never described as settled.

## Adaptive planner scope

Each planning run reads the pinned PoolManager spot, pool liquidity, active positions, Hook curves/depths and pending updates, runtime bindings, and separate Safe/Treasury balances. It rescales the three strategy templates around that observed price, proves every proposed range remains one-sided across the pinned plus/minus 20 percent sensitivity band, evaluates seven NARA budgets per profile, and selects only from candidates with complete exact-fork evidence.

"Optimal" means the deterministic best candidate under the documented objectives and tested family. It is not a promise of maximum profit, an oracle, or a prediction of future order flow. The settler never replans, moves, or reinvests positions. A new market snapshot requires a new read-only planning run and a new human-reviewed Safe proposal; the JIT order builder rechecks live spot, ticks, economics, balances, and bindings and refuses stale input.

## Safety limitation: forced ERC-721 ownership

PositionManager `transferFrom` can force an NFT into the manager without invoking `onERC721Received`. Therefore the invariant “manager never owns an unregistered PositionManager NFT” is not enforceable solely on-chain without restricting the upstream ERC-721.

The service monitors manager NFT balance versus registered active ownership and alerts on a surplus. It continues settling valid registered orders so an injected NFT cannot create a global settlement denial of service. Quarantine is never automatic: only the Safe can review a proven unregistered token ID and invoke the bounded quarantine method.

## Evidence completed in this candidate

- Exact manager ABI, shared integer planner, optimizer, Safe builders, and settler are integrated.
- The final pinned Base fork executes the canary plus all A-H scenarios, 12 buy sizes, five independent sell sizes, and three reversal fractions across all 21 profile/budget candidates.
- Focused contract, invariant, planner, builder, and settler checks pass; the manager remains below the EIP-170 runtime limit.
- The comprehensive internal audit retained `ARI-001`, `ARI-002`, `SIG-001`, `EXT-001`, and `UPG-001`. All five now have local code regressions and independent adversarial/architecture review closure. This is remediation evidence, not an external audit or security clearance.
- A provider-level USDC proxy-upgrade regression changes the implementation slot/address/hash while preserving proxy address/runtime, exercises Multicall3 decoding, and proves builder/settler rejection before nonce, signing, persistence, or broadcast.

### Historical pre-remediation candidate checkpoint

| Evidence | Result |
|---|---|
| Chain / pinned fork | Base `8453`, block `50537172`, hash `0x6e896c222c2b8313fc232d174136d58212835c39a06378f2dbf2b73c0101b7d9` |
| Optimizer result | `CONSERVATIVE-100000-NARA`, `SELECTED_EXECUTION_BLOCKED`, 12 proposed orders |
| Strategy hash | `0x731fe3fb62b5f522d7a014ef5b67a8dac8473e6fd875f34add6dcc1a20480d47` |
| Strategy evidence SHA-256 | `FA533FF2EB0C208202409822AA92CA1B6477460D7E3D3726A402E3D87D5A4E14` |
| Matrix evidence SHA-256 | `CB4DC7110B751E04ED575F749D84BFE07B185EC2BE2D7905BFA448A9E07A553D` |
| Focused tests | Superseded by the remediation checkpoint below |
| Repository non-fork suite | Superseded by the remediation checkpoint below |
| Pinned fork suites | Manager round-trip 1/1 and adversarial matrix 3/3 passing |
| Bytecode | Runtime 23,620 bytes; initcode 28,095 bytes; both within EVM limits |
| Settler type-check | `npx tsc -p services/v4-treasury-range-settler/tsconfig.json --noEmit` passed |
| Dependency audit | `npm audit --audit-level=high` exited zero; eight low-severity `elliptic` advisories remain with no available fix |

The historical strategy hash and evidence hashes above use superseded schemas
and cannot be used by current builders. Strategy schema v3 requires a fresh
pinned state, both distinct Safe roles, the hash-pinned custody policy, USDC
proxy/implementation/control evidence, and a newly computed whole-manifest hash.

### 2026-08-30 remediation checkpoint

| Evidence | Result |
|---|---|
| Retained audit items | `ARI-001`, `ARI-002`, `SIG-001`, `EXT-001`, `UPG-001` remediated in the candidate |
| Focused tests | 61 Hardhat plus 32 Node operations tests: 93 passing |
| Repository non-fork suite | 759 passing on the current upstream base |
| Pinned fork suites | 4/4 passing at Base block `50537172` |
| Strict TypeScript | Manual strict no-emit target set and service project type-check passed |
| Independent reviews | Independent adversarial PASS and strongest-model architecture PASS; no remaining remediation blocker |
| Slither | `0.11.5`/solc `0.8.34` rerun completed; same 17 triaged raw signals, no new detector class |
| Protected release | PR #52 merged as GitHub-verified commit `35091010de09802f39ccda7e726ff8c4b240e165` |
| Hosted gates | PR runs `33332837160` / `33332837113` and post-merge runs `33333021179` / `33333021180` passed build/test/size, Slither, Aderyn, Echidna, and CodeQL |
| Local additional analyzers | Aderyn binary unavailable; configured Echidna WSL distro could not start locally; the hosted passes above close those protected gates but are not relabelled as local runs |
| Dependency audit | Production dependencies: zero vulnerabilities; development graph: eight low-severity `elliptic` advisories with no fix available |
| Secret review | Focused changed-content scan passed; Gitleaks unavailable and no Gitleaks pass is claimed |
| Production writes | None |

The selected candidate allocates 100,000 NARA and a nominal 5,000 USDC
budget: 3,000 USDC remains protected and 2,000 USDC is exposed through bid
ranges. At the pinned state the Safe shortfall is effectively 100,000 NARA and
5,000 USDC. The separate Treasury holds enough NARA but is 601.096959 USDC
short of the nominal USDC budget. The manager never substitutes Treasury
custody for Safe custody.

The pinned spot was approximately 0.08509842 USDC/NARA. The planner generated
eight NARA sell ranges above spot and four USDC buy ranges below spot. These are
candidate outputs from one snapshot, not permanent ranges, forecasts, profit
promises, or authority to trade.

### Cross-repository handoff status

```text
Change-ID: NARA-20260828-v4-treasury-range-manager
Origin remote: https://github.com/NARAProtocol/nara_protocol_v4
Origin commit: 35091010de09802f39ccda7e726ff8c4b240e165
Evidence state: protected source merged, tested, internal-audit remediated; not deployment authority
Changed contracts/interfaces: NARATreasuryRangeManagerV1; no existing production interface or core contract changed
Generated artifact or ABI source: rebuild Hardhat artifacts from exact protected origin commit 35091010de09802f39ccda7e726ff8c4b240e165
Deployment manifest: none
Chain and verification block: Base 8453 fork pinned to block 50537172; no deployed manager address
Depends-on: explicit 1-of-1 risk acceptance or approved multisig upgrade, approved dedicated-Safe funding, fresh state pin/schema-v3 evidence, explicit human Safe approval
Unblocks: controlled deployment-proposal preparation from the exact source; deployment-dependent orders, settler canary, monitor integration, and public documentation remain blocked
Downstream repositories reviewed: none updated; deployment-dependent consumers remain blocked until verified deployment evidence exists
Commands and results: 93 focused, 759 non-fork, 4 pinned-fork cases, strict TypeScript, build, bytecode size, dependency audit, protected Slither/Aderyn/Echidna, and CodeQL passed
Skipped/unavailable gates: local Gitleaks, independent external audit, deployment, two-host rehearsal, 48-hour canary
Unresolved risks: same-transaction buy/reverse cannot be intercepted; Circle can change USDC after snapshot and incompatible behavior may block exit; deep post-confirmation reorg monitoring remains external
Onchain or production writes: none
Secret scan: focused changed-content scan passed; Gitleaks remains unavailable; no secrets or RPC values are recorded in this handoff
```

## Acceptance gates still outstanding

- Explicit human production acceptance. The completed internal audit and protected gates are not represented as an independent external audit or security guarantee.
- Fresh live re-pin and regenerated strategy immediately before any human signing review.
- Explicit human acceptance of the dedicated Safe's current 1-of-1 risk, or a verified approved multisig upgrade before funding.
- Explicitly approved Treasury-to-dedicated-Treasury-Range-Safe funding; the dedicated Safe is unfunded and the builder refuses to substitute either Treasury or protocol-Safe custody.
- Receipt-pinned deployment verification and explicit human approval.
- Separate canary approval, two-instance infrastructure rehearsal, bounded gas funding, alert/heartbeat validation, and at least 48 hours of monitored canary behavior before any expansion.
- Ongoing post-confirmation receipt/block-hash monitoring for a reorg deeper than the configured confirmation window.

Until all gates are met, describe this work only as an undeployed candidate.
