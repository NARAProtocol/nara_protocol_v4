# NARA v4 Treasury Range Settler

This is a permissionless, gas-only settlement service for registered tactical positions owned by `NARATreasuryRangeManagerV1`. It cannot create or cancel orders, choose a recipient, move Safe inventory, alter strategy, or quarantine an injected PositionManager NFT.

The service consumes relevant PoolManager `Swap` events from two independent WebSocket providers. A third independent HTTP provider supplies polling/full-sweep fallback. All three providers must agree on every critical block, runtime, binding, order, allowance, simulation, nonce, receipt, and receipt-block reconciliation read before a write is accepted.

A fully traversed SELL_NARA range is settled/burned only after `isSettleable` succeeds and a later settlement receipt proves terminal state; its USDC then remains in the Safe. Event handling begins immediately at the newest block all three providers agree on, but settlement is normally a separate transaction. Before that receipt the position can convert back. An off-chain watcher cannot intervene between actions in one atomic transaction; a caller-controlled atomic sequence could itself call permissionless settlement between separate swap/unlock actions. Partial or mixed positions are never reported as settled.

## Required environment

- `PRIMARY_BASE_WS_RPC`
- `SECONDARY_BASE_WS_RPC`
- `FALLBACK_BASE_HTTP_RPC`
- `RANGE_MANAGER_ADDRESS`
- `RANGE_MANAGER_RUNTIME_CODE_HASH`
- `RANGE_MANAGER_DEPLOYMENT_BLOCK`
- `HOOK_CONFIGURATION_HASH` (canonical hash of the approved active/pending curve/depth read set)
- `USDC_RUNTIME_CODE_HASH`
- `USDC_READER_RUNTIME_CODE_HASH` (Base Multicall3 runtime hash from the same strategy evidence)
- `USDC_IMPLEMENTATION_ADDRESS`
- `USDC_IMPLEMENTATION_RUNTIME_CODE_HASH`
- `USDC_PROXY_ADMIN`
- `USDC_OWNER`
- `USDC_PAUSER`
- `USDC_BLACKLISTER`
- `POOL_MANAGER_RUNTIME_CODE_HASH`
- `POSITION_MANAGER_RUNTIME_CODE_HASH`
- `PERMIT2_RUNTIME_CODE_HASH`
- `SETTLER_PRIVATE_KEY`
- `SETTLER_EXPECTED_ADDRESS` (recommended binding)
- `SETTLER_INSTANCE_ID`
- `HEARTBEAT_URL`
- `ALERT_WEBHOOK_URL`
- `MIN_GAS_BALANCE_WEI`
- `CONFIRMATIONS`

Optional bounded controls are `SETTLER_POLL_INTERVAL_MS`, `SETTLER_FULL_SWEEP_INTERVAL_MS`, `SETTLER_HEARTBEAT_INTERVAL_MS`, `SETTLER_RPC_STALE_MS`, `SETTLER_RPC_REQUEST_TIMEOUT_MS` (default 10 seconds), `SETTLER_SWEEP_TIMEOUT_MS` (default 90 seconds and strictly greater than the request timeout), `SETTLER_MAX_PAGE_SIZE`, `SETTLER_MAX_PAGES`, `SETTLER_MAX_SETTLEMENT_BATCH` (maximum 16), `SETTLER_MAX_FEE_PER_GAS_WEI`, `SETTLER_MAX_PRIORITY_FEE_PER_GAS_WEI`, `SETTLER_MAX_GAS_LIMIT`, `SETTLER_PENDING_ALERT_AFTER_MS`, `SETTLER_PENDING_DROP_AFTER_MS`, `SETTLER_PENDING_STATE_PATH`, and `SETTLER_RECONCILIATION_DIRECTORY`.

The three RPC URLs must have different origins. That syntactic rule does not establish vendor independence: operators must separately attest distinct vendors, accounts/control planes, and infrastructure. Two simultaneous production instances must use different dedicated gas-only keys and different instance IDs. Sharing one key across hosts is unsafe.

Each instance signs the exact EIP-1559 transaction and durably records its raw bytes, hash, nonce, and order intent with mode `0600` before broadcast. It never waits for mining, blindly replaces a transaction, or submits a later nonce while that record is unresolved. Sweeps, heartbeat, and alerts continue. A pre-broadcast crash may rebroadcast only the identical signed raw transaction after all-three absence/nonce checks, a fresh canonical binding/dependency preflight, and all-three simulation of the exact persisted calldata. After the alert window the service pages; after the drop window it reports a drop but retains the signed nonce lineage. Terminal order races also retain it. Only a canonical confirmed receipt for that exact hash clears the pending record. A consumed nonce with no known receipt requires operator investigation and keeps writes blocked. Successful full receipt/accounting reconciliation is durably recorded in the reconciliation directory before pending state is cleared.

`CONFIRMATIONS` controls receipt finality. Swap detection and pre-write simulation use the newest block all three providers agree on so a terminal range is evaluated without intentionally waiting that many blocks.

## Local checks

From the repository root:

```powershell
npm run typecheck:treasury-range-settler:v4
npm run test:treasury-range-settler:v4
node --import tsx --test services/v4-treasury-range-settler/test/*.test.ts
```

Start only after following the operator runbook and independently verifying the deployment receipt/runtime/bindings:

```powershell
node_modules/.bin/tsx services/v4-treasury-range-settler/src/index.ts
```

## Hosting model

This implementation is a continuously running Node/Docker background worker. It is not a Cloudflare Pages function and is not designed around an evictable request lifecycle.

For a Railway primary, deploy one persistent service from this repository, set `RAILWAY_DOCKERFILE_PATH=/services/v4-treasury-range-settler/Dockerfile`, disable serverless sleeping, select the `Always` restart policy, mount persistent storage at `/data`, and set `SETTLER_PENDING_STATE_PATH=/data/pending-<instance-id>.json`. Railway mounts volumes as root; with this image's non-root default, Railway currently requires `RAILWAY_RUN_UID=0` for that mount to be writable. Treat that runtime privilege expansion as a hosting tradeoff and keep the service gas-only. Do not use Railway horizontal replicas for the second settler because replicas would share one service configuration and key.

Run the second required settler on an independent Linux host/provider with a different gas-only key and RPC vendor set, using the supplied systemd unit. Hosting redundancy is not signer redundancy unless the failure domains, credentials, and RPC origins are independent.

Logs are structured and field-allowlisted. Do not add configuration objects, RPC URLs, webhook URLs, raw errors, or private material to log fields.

Each sweep code-pins manager, NARA, USDC, Hook, Vault, Compounder, Safe, PoolManager, PositionManager, Permit2, and the Base Multicall3 reader on all three providers. For Circle USDC it additionally reads the exact Zeppelinos implementation/admin storage slots, implementation runtime hash, admin, owner, pauser, blacklister, paused state, and blacklist state for the Safe, PoolManager, PositionManager, Permit2, Vault, Compounder, and Range Manager. All three observations must agree and exactly match activation evidence before a settlement can reach nonce selection or signing. It also re-hashes the exact active/pending Hook curves and NARA/USDC depths. A governance proposal or execution therefore raises `HOOK_CONFIGURATION_CHANGED` even when bytecode is unchanged.

Any USDC proxy, implementation, reader, admin/role, pause, or monitored-account blacklist drift is fail-closed for new settlement writes and exact rebroadcast. Stop both instances, preserve pending state, and investigate against immutable activation evidence. Never update an expected value merely to silence the alert. Monitoring cannot make an already incompatible USDC implementation transferable; active positions may remain dependent on Circle restoring compatible behavior. The separate Safe cancellation builder has an explicit `emergency_exit_bypass` for dependency drift so an exit can still be attempted, but its review labels the attached USDC evidence as the old strategy snapshot rather than a JIT health assertion. That bypass is cancellation-only and cannot make a paused or incompatible USDC transfer succeed.

A silent critical RPC or whole-sweep hang is fatal. The service emits a source-labelled fault, destroys provider connections, stops timers/watchers, and exits nonzero so the supervisor can start a fresh process. Three-of-three agreement is never weakened to majority acceptance.

Alert webhook delivery is deliberately non-blocking so an alert-endpoint outage cannot suppress valid settlement. Delivery failure emits `alert_delivery_failed`; infrastructure monitoring must independently page on that log and missing heartbeats.

Direct allowance-layer checks gate settlement. Forceable manager NARA/USDC balances raise `MANAGER_POOL_TOKEN_DUST` but do not block a valid settlement; arbitrary token donations must not become a global denial of service.

## Unregistered NFT alert

An attacker can force PositionManager ownership with ERC-721 `transferFrom` without invoking `onERC721Received`. A manager-NFT/accounted-active-order mismatch raises `UNREGISTERED_POSITION_OWNERSHIP`, but the service intentionally continues settling valid registered orders. Only the production Safe may review and invoke `quarantineUnregisteredPosition(tokenId)` through a separate, human-reviewed transaction.
