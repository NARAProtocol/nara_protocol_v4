# NARA Treasury Range Manager V1 Threat Model

Status: internal-audit-remediated candidate; not an independent external audit
or production approval.

Change ID: `NARA-20260828-v4-treasury-range-manager`

Current launch boundary: `NARA-20260831-v4-treasury-range-500-usdc-canary`

Dedicated-Safe change ID: `NARA-20260831-v4-treasury-range-dedicated-safe`

## Scope and assets

This model covers the Range Manager contract, its PositionManager NFTs, Treasury-Range-Safe-authorized order capital, unsigned Safe builders, exact state reader and simulator, and the event-driven settlement service. The active Hook, Vault, Compounder, permanent positions, Safe implementation, Uniswap v4 contracts, Permit2, NARA, and Circle-controlled USDC proxy/implementation are external dependencies and are not modified.

Assets at risk include treasury NARA/USDC committed to active ranges, converted principal, tactical LP fees, Treasury Range Safe approvals, tactical position NFTs, settler gas, and the integrity of strategy and deployment evidence.

## Trust model

Trusted within their explicit boundaries:

- the production 2-of-3 Safe may execute only the manager deployment packet through the canonical CREATE2 deployer;
- the distinct Treasury Range Safe is the immutable manager authority, inventory custodian, order/cancellation signer, settlement recipient, and the only Safe that may create, cancel, pause, unpause, or quarantine;
- human reviewers validate the packet for the Safe whose role it exercises: deployment calldata, current nonce, deadline, and runtime evidence for the protocol Safe; strategy, order calldata, deadlines, and output floors for the Treasury Range Safe;
- the canonical Base PoolManager, PositionManager, Permit2, tokens, deployed Hook, and Base Multicall3 reader are trusted only when code hashes and bindings match pinned evidence;
- Circle USDC control roles and its proxy implementation/admin slots are trusted only while three-provider observations match strategy-v3 and matrix-row-v4 evidence and remain healthy;
- the reviewed repository commit and receipt-pinned manifests are release evidence.

Untrusted:

- callers of permissionless settlement;
- settler accounts and operators beyond their gas-only transaction authority;
- traders, MEV searchers, block builders, and token/NFT senders;
- RPC, WebSocket, HTTP, heartbeat, and alert providers;
- stale files, screenshots, quotes, off-chain prices, generated packets, and unmerged source;
- arbitrary ERC-721 and ERC-20 transfers to the manager or settler.

## Security invariants

- Only the immutable Treasury Range Safe can cause treasury capital to enter an order.
- Settlement and cancellation recipients are always the immutable Treasury Range Safe.
- A settler cannot create, edit, cancel, pause, quarantine, or redirect an order.
- An order settles only while Active and at its exact side-specific terminal sqrt boundary.
- Settled and Cancelled states are terminal.
- A registered managed NFT has active liquidity only while its order is Active and zero liquidity after a terminal action.
- No supplied external token ID can be registered as an order.
- An unregistered PositionManager NFT cannot be settled, cancelled, or accounted as treasury principal.
- Managed principal, Treasury Range Safe deltas, position liquidity, dust, and allowances are reconcilable.
- Creation and cancellation packets expire.
- No write function loops over the complete historical order set.
- There is no delegatecall, arbitrary external call, arbitrary recipient, or generic managed-asset recovery.
- Creation, deployment, settlement, and exact rebroadcast stop before signing on USDC implementation, control-role, pause, monitored-blacklist, or reader drift.
- A persisted signed nonce is never assigned to a different intent merely because providers report the transaction dropped or its orders became terminal.

## Attack analysis

### Unauthorized creation or cancellation

All capital-entry, cancellation, pause, and quarantine functions check the immutable Treasury Range Safe directly. There is no mutable owner role. The protocol 2-of-3 Safe has no manager authority after executing deployment, and a compromised settler key cannot use these paths. Treasury Range Safe compromise remains catastrophic within the contract's bounded surface: an attacker controlling it can create economically harmful orders or cancel them at adverse prices, but cannot change immutable recipients or bindings.

Mitigations include role-separated human review, explicit acceptance of the bounded 1-of-1 canary custody risk, short deadlines, strategy-hash binding, exact allowance totals, output floors, whole-batch simulation, and fresh nonce/state verification. The protocol Safe's 2-of-3 threshold protects deployment only; it does not mitigate later Treasury Range Safe order authority.

### NFT injection

PositionManager `_mint` and ordinary `transferFrom` bypass receiver callbacks. An attacker can force an unrelated PositionManager NFT onto the manager. Preventing ownership is impossible at the recipient contract.

The manager rejects unsolicited safe transfers, registers only its synchronous expected mint, and keys every operation through the immutable registry. A Treasury-Range-Safe-only quarantine transfers only an unregistered PositionManager token to that Safe and rejects registered token IDs. The service alerts when PositionManager ownership count differs from registered active positions but continues processing valid orders. Injection therefore causes monitoring/reconciliation work, not registration or settlement authority.

### Recipient substitution

Callers supply no settlement or cancellation recipient. `TAKE_PAIR` always encodes the immutable Treasury Range Safe. Balance-delta checks measure that Safe, not the caller or manager. No generic recovery or arbitrary call can bypass that restriction.

### Reentrancy and callback behavior

Create, settle, cancel, and quarantine are guarded. Terminal status and active-set removal occur before external settlement calls; transaction reverts restore state. PositionManager is the only accepted ERC-721 callback sender, and only an explicitly expected safe-transfer context is accepted. Tests use malicious mocks to attempt callbacks during token transfer and position modification.

### Permit2 and ERC-20 allowance leakage

Creation uses exact, call-scoped ERC-20-to-Permit2 and Permit2-to-PositionManager approvals. Both layers are reset after mint. The manager rejects observed transfer-tax behavior and returns deterministic dust to the Treasury Range Safe. `assertOperationalClean()` and Treasury Range Safe batch review expose residual balances and allowances.

Residual risk: a nonstandard token could change behavior after deployment. NARA
runtime is pinned. For Base USDC, proxy runtime alone is insufficient because
Circle can upgrade the implementation without changing the proxy address or
runtime. Strategy schema v3 therefore pins the exact implementation/admin
slots, implementation address/runtime, proxy admin, owner, pauser,
blacklister, pause state, monitored actor blacklist state, and the code hash of
the Multicall3 reader used for token views. Matrix-row schema v4 additionally
binds the exact route and quote status for each adversarial row. Deployment and order builders read
this state just in time; all three settlement providers must independently
agree with it before nonce selection.

Treasury Range Safe cancellation deliberately uses a visibly labelled
`emergency_exit_bypass` for this dependency gate. The bypass preserves an exit
attempt after administrative drift but cannot make a paused, blacklisted, or
otherwise incompatible token transfer succeed.

### Boundary, rounding, and minimum-output errors

The reversed human-price/tick orientation is a primary hazard. Contract checks use exact `sqrtPriceX96` boundaries and v4 liquidity math. Off-chain utilities use bigint/rational arithmetic only for financial values. Both sides, equality boundaries, negative tick alignment, dust, and integer-width limits require unit, fuzz, and fork coverage.

The Treasury Range Safe supplies a nonzero output minimum no higher than deterministic full-conversion principal. An unrealistically tight minimum can delay settlement even after traversal, producing a self-inflicted availability failure. Builders must show expected principal, minimum, and tolerance explicitly.

### Settlement front-running and MEV

Permissionless settlement gives callers no recipient choice or reward, so front-running a valid settlement should produce the same Treasury-Range-Safe-directed state transition. A trader can influence pool price before settlement. The terminal check is current-state based, and the approved minimum bounds crystallization.

A partially filled order cannot settle. A terminally crossed order can cross back before an off-chain settlement confirms. This is a timing limitation, not a promise of atomic execution.

### Atomic round-trip limitation

An external service cannot insert a transaction inside a trader's atomic buy-and-reverse transaction. V1 protects only when the range is crossed in one transaction, settled in a later confirmed transaction, and the reversal occurs afterward. Same-transaction flow and delayed/censored settlement remain unprotected. Simulations must report both settled and unsettled controls without claiming guaranteed attacker loss across external venues.

### Order enumeration and gas denial of service

Active IDs use pagination and swap-and-pop removal. `settleMany` has a fixed maximum and never scans history. Services prefilter and simulate bounded batches. Invalid mixed batches fail atomically, so the service partitions candidates rather than repeatedly submitting a poisoned group.

Injected NFTs are never enumerated as orders. An attacker may create many market swaps and trigger observation load; the service serializes triggers, coalesces refreshes, rate-limits RPC work, and performs periodic canonical sweeps.

### RPC disagreement, stale state, reorgs, and replacements

Readers pin every call to one block and verify its hash. Settlers compare independent RPCs before writes, wait for receipts, and pin post-write reads to the receipt block and hash. WebSocket loss falls back to HTTP polling and full sweeps. A race is classified as successful only when receipt-block events and manager state prove settlement by another transaction.

Every critical request has a source-labelled deadline shorter than the whole-sweep watchdog. A timeout poisons the coordinator, destroys providers, stops watchers, and exits nonzero for supervised restart. The service never degrades below three-of-three agreement.

The exact signed raw transaction, hash, nonce, and order intent are persisted before broadcast. A pre-broadcast crash may rebroadcast only those identical bytes after fresh all-three absence/nonce checks, canonical binding and USDC dependency checks, and exact-calldata simulation on all three providers. Provider-local drops and terminal order races retain the nonce lineage. Only a canonical confirmed receipt for that exact hash clears it; an ambiguously consumed nonce blocks writes for operator investigation.

No RPC policy can eliminate chain reorganization risk. Required confirmations and operational escalation are configurable; they do not convert probabilistic finality into a guarantee.

### Hook configuration or runtime change

Builders and services verify the canonical PoolId, Hook permissions, reciprocal bindings, active and pending fee/depth configuration, and pinned runtime hashes. A mismatch stops creation and packet generation. Settlement remains desirable during configuration drift, but service alerts and independent reconciliation are required before submitting if runtime or binding authority is unclear.

Exact-output swaps remain unsupported by the active Hook and are not used by strategy simulations or builders.

### Oracle and external-market assumptions

Settlement uses no oracle or TWAP; it enforces completion of a predefined pool range and a Treasury-Range-Safe-approved raw output floor. The optimizer may compare human prices for reporting but cannot guarantee fair value, demand, arbitrage availability, or profitability relative to another venue. External price manipulation can make an otherwise valid range economically unattractive; Treasury Range Safe review owns that decision.

### Unknown token transfers and operational cleanliness

Anyone may transfer ordinary ERC-20 tokens to the manager or settler. The design can prevent intentional custody and unauthorized use, but cannot guarantee that an address never receives dust. Unexpected NARA/USDC makes the clean-state assertion or balance monitor alert. Operators must reconcile it without granting the settler or an arbitrary caller recovery authority.

### Infrastructure and secret handling

Settler configuration is environment-only. Logs are allowlisted structured fields and never include RPC URLs, private-key material, calldata containing secrets, or environment dumps. Each live instance uses its own gas-only key; two instances never share a nonce domain. No transaction-capable GitHub workflow is created.

## Failure response

- Pause creation if strategy, binding, or reconciliation evidence becomes questionable.
- Keep settlement and Treasury Range Safe cancellation available while creation is paused.
- Stop builders on nonce, block-hash, runtime, binding, pending-Hook, deadline, or strategy-hash drift.
- Stop builders and settler writes on USDC implementation/control/health or Multicall3 reader drift; preserve the separately labelled Treasury Range Safe cancellation path for an exit attempt.
- Stop and restart a settler on an RPC or whole-sweep deadline, and stop writes on RPC disagreement, unknown registered ownership, post-settlement liquidity, or Treasury Range Safe delta mismatch.
- Retain signed nonce lineage until the exact hash has a canonical confirmed receipt; never replace it with a different intent based only on provider-local absence.
- Treat unsolicited NFTs and tokens as reconciliation alerts; never register them or redirect them to a recipient other than the Treasury Range Safe.
- Preserve logs, block/hash evidence, calldata, receipt, runtime hashes, and sanitized manifests.

## Residual risks and acceptance boundary

- Same-transaction buy/reverse cannot be interrupted by V1.
- Crossed but unsettled positions can re-enter their range.
- Treasury Range Safe compromise can authorize economically harmful orders within immutable bindings.
- Uniswap, Permit2, Base, token, or Hook defects remain external dependency risks.
- Circle can upgrade, pause, blacklist, or otherwise change USDC after a pinned check and before transaction inclusion; the fail-closed checks reduce but cannot remove that race.
- Sequencer censorship, reorgs, RPC outages, and gas starvation can delay settlement.
- Output floors can intentionally or accidentally make settlement unavailable.
- External prices and route availability can change after planning.
- Forced NFT/token ownership cannot be prevented; only isolated from managed accounting.

The internal review completed senior analysis, independent adversarial review,
strongest-model architecture review, focused regressions, full non-fork tests,
fork tests, and available static analysis. This is not an independent external
audit or a security guarantee. Protected commit
`35091010de09802f39ccda7e726ff8c4b240e165` remains the manager-contract
internal-review origin. Later protected commits added the bounded canary,
dedicated-Safe role separation, strategy-v3, matrix-row-v4, and deployment
tooling hardening; the latest protected commit that changed functional
implementation was `162c24be080398b65c76e542a48ccb608cd1fb43` before this
evidence correction.
Neither historical commit is packet authority by itself. Every production
rebuild must bind the exact then-current protected `origin/main` tip after all
launch-evidence corrections merge. Production acceptance still requires fresh
signing-time evidence, a monitored canary, and explicit human approval by the
applicable Safe of the exact nonce-bound artifact.
