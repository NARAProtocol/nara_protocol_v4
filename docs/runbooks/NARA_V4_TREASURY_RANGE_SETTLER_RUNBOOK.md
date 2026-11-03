# NARA v4 Treasury Range Settler Runbook

Status: candidate operations procedure. No manager deployment, Safe signature, order creation, keeper activation, or production transaction is authorized by this document.

## Safety model

The manager separates tactical one-sided ranges from permanent full-range POL. Two Safes have deliberately different roles: the protocol 2-of-3 Safe executes the CREATE2 deployment only, while the dedicated Treasury Range Safe is the immutable order authority, holds tactical inventory, creates/cancels orders, and receives every terminal output. Any address may settle a terminal order. Settlers use gas-only wallets and have no manager role or token custody.

The currently pinned Treasury Range Safe is 1-of-1. That is a material custody
and availability risk: loss or compromise of its sole signer can freeze or lose
the canary inventory and order-administration path. Deployment and order-packet
builders require an exact explicit acknowledgement of this topology. On
2026-08-31, the human operator accepted the bounded canary risk only to correct
launch evidence and prepare a fresh unsigned deployment packet. Funding remains
separately unauthorized, and the exact per-packet builder acknowledgement is
still required. Cancellation deliberately remains
buildable without this environment acknowledgement so the emergency exit path
is not disabled during an incident; Safe review/signing is still mandatory.

Two instances are required for production resilience. They must use independently contracted and operated RPC vendors, hosts, accounts/control planes, instance IDs, and gas-only keys. Distinct URL hostnames are a necessary configuration check, not proof of provider-vendor independence. Record the human-verified infrastructure separation. Never duplicate one private key across instances. Never reuse the epoch or liquidity maintainer keys.

The service is event-driven from both PoolManager WebSocket streams and also runs bounded polling/full sweeps. Before submitting, it reconciles the newest block all three providers agree on, verifies runtime/bindings including Circle USDC implementation and control state, paginates active orders with hard limits, checks ownership/liquidity, performs the call on all three providers, and enforces EIP-1559/gas caps. Every critical request has a source-labelled deadline and the whole sweep has a watchdog; a timeout is fatal and exits for supervised restart without weakening three-provider unanimity. After mining, it waits the configured confirmations and verifies the receipt block/hash across all three providers, exact `OrderSettled` events, Safe-directed token transfers, terminal status, zero PositionManager liquidity, and burned ownership on all three providers.

For example, a fully traversed SELL_NARA range from $0.14-$0.21 is eligible to be burned into Safe-held USDC. A Swap event triggers evaluation at the newest block all three providers agree on, but the service still requires a separate transaction and receipt. Until that receipt, a retrace can make the position convert back. An off-chain watcher cannot intervene inside one atomic transaction, although a caller-controlled sequence could itself invoke permissionless settlement between separate swap/unlock actions. A partial/mixed position is not terminal and must never be logged or reported as settled.

## Pre-deployment gate

Stop if any item is absent or inconsistent:

1. The implementation commit is merged into the authoritative protected branch. Configure the exact release commit. The builder pins the credential-free canonical GitHub remote `https://github.com/NARAProtocol/nara_protocol_v4.git` and protected ref `refs/remotes/origin/main`; it requires local ancestry plus live `git ls-remote` equality with `origin/main`. Every tracked file must be clean; the only permitted untracked file is the exact resolved, self-hashed generated strategy manifest, with no other untracked source or artifact.
2. Unit, fork, invariant, size, and applicable security gates have current recorded results.
3. The exact simulator-generated strategy-v3 manifest has a valid hash, binds the tracked dedicated-custody policy and both distinct Safe roles/runtime hashes, and has a recent Base block/hash/timestamp, exact PoolKey/slot0, current and pending Hook curve/depth reads, reconciled positions, exact amounts/minimums, and `candidate_no_broadcast` status. Its matrix rows use schema `nara.v4.treasury-range-matrix-row.v4`, route kind `universal-router-prefunded-settle-v1`, and quote policy `per-swap-explicit-quote-status-v1`, with a positive official v4 Quoter result or exact decoded PoolManager-prefund proof for every quotable swap. Explicit supported unquoted reasons are limited to B `same_block_transactions`, C `same_transaction_actions`, and F `atomic_buy_reverse`; every other path rejects an unquoted label. Strategy and deployment evidence remain schema v3. The manifest must bind Circle's Zeppelinos proxy mechanism, exact implementation/admin slots, proxy and implementation address/runtime hashes, Base Multicall3 address/runtime hash, admin/owner/pauser/blacklister, `paused=false`, and `isBlacklisted=false` for the Treasury Range Safe, PoolManager, PositionManager, Permit2, Vault, Compounder, and manager actor set when known. The deployment executor is not a USDC actor. The order builder imports the simulator's shared exact integer planner and independently recomputes price-to-tick alignment, one-sidedness at the JIT square-root price, liquidity, input used/dust, output, tolerance, and minimum for every enabled order. Any mismatch is blocking.
4. Before reading the deployment artifact, the deployment builder forces Hardhat `clean` and `build` with `force: true` and `noTests: true`, then independently validates every runtime/binding and completes `Safe.simulateAndRevert` for the whole CREATE2 call.
5. Human reviewers reproduce the predicted address, initcode/runtime hashes, constructor binding to the dedicated Treasury Range Safe, strategy hash, protocol deployment Safe nonce, and short deadline.
6. Both Safe topologies are freshly verified: canonical 2-of-3 executor and exact hash-pinned dedicated custody policy, including runtime, singleton, version, threshold, owner-set hash/count, fallback handler, zero guard, and zero modules. Raw dedicated-owner addresses are not persisted in public evidence.
7. The internal senior analysis, independent adversarial review, strongest-model architecture review, automated gates, and explicit human approval are recorded. No independent external audit is claimed; passing automated tests alone is not a security clearance.

Generate immediately before review (never from a secondary checkout):

```powershell
$env:V4_TREASURY_RANGE_STRATEGY_MANIFEST = "deployments/v4-treasury-range-strategy-candidate.json"
$env:V4_TREASURY_RANGE_RELEASE_COMMIT = "<exact-40-hex-merged-HEAD>"
$env:V4_TREASURY_RANGE_ACCEPT_SINGLE_SIGNER_SAFE = "<exact-dedicated-Treasury-Safe-from-policy>"
npx tsx scripts/deployV4TreasuryRangeManagerProposal.ts
```

The builder itself pins the canonical GitHub remote and `origin/main`; those
values are not operator-configurable environment inputs.

The builder produces uniquely named `UNEXECUTED-...-<block>-nonce-<nonce>.json/.md` files, refuses stale or crash-leftover packets, and never signs or broadcasts. Rebuild after any nonce, deadline, block/state, Hook configuration, strategy, code, or runtime change. Quarantine expired artifacts so they cannot look importable.

## Receipt-pinned deployment verification

After a separately approved human Safe execution, preserve the Safe transaction hash and receipt block/hash. At that exact block verify:

- exact successful outer protocol 2-of-3 Safe `execTransaction`, nonce/Safe transaction hash, zero-reimbursement `ExecutionSuccess`, canonical MultiSendCallOnly payload, and exact inner CREATE2 call;
- exact Create2HookDeployer `Deployed(deployed,salt,initCodeHash)` event/log index, predicted/deployed address, receipt status/block/hash, and runtime evidence;
- manager runtime hash and every immutable getter: dedicated Treasury Range Safe, NARA, USDC, Vault, PoolManager, PositionManager, Permit2, Hook, fee, tick spacing, PoolId, deployment deadline, and batch cap 16;
- PositionManager reciprocal `poolManager()`/`permit2()` bindings and Hook reciprocal token/base/Vault/PoolManager/PoolId bindings;
- the protocol deployment Safe remains the canonical 1.4.1 2-of-3 owner of the CREATE2 deployer;
- the dedicated Treasury Range Safe remains the exact tracked 1.4.1 custody topology, recorded only as owner count/hash plus its pinned singleton/fallback/guard/module evidence;
- all Treasury-Range-Safe-to-manager, manager-to-Permit2, and Permit2-to-PositionManager allowance amounts are zero;
- manager NARA/USDC balances are recorded as alert-only evidence because direct donations are permissionless;
- no position or existing permanent POL changed.
- the exact USDC proxy slots, proxy/implementation/reader runtime hashes, admin and token control roles, pause state, and blacklist state for every monitored actor are receipt-block pinned and match the strategy evidence.

Do not start settlers from only an address pasted into an environment file. Produce the deployment evidence through the deterministic finalizer from the exact unsigned packet and canonical execution receipt. Pin `RANGE_MANAGER_ADDRESS`, `RANGE_MANAGER_RUNTIME_CODE_HASH`, `RANGE_MANAGER_DEPLOYMENT_BLOCK`, `HOOK_CONFIGURATION_HASH`, USDC proxy and reader runtime hashes, USDC implementation address/runtime hash, proxy admin, owner, pauser, blacklister, and the PoolManager/PositionManager/Permit2 runtime hashes from final receipt/strategy evidence. The exact environment names are in the service README. The service obtains the protocol Safe/core hashes from the production manifest and the dedicated Treasury Range Safe policy from the hash-pinned custody manifest, then checks both roles on all three providers.

Before building orders/cancellations, the strategy must hash-pin a `nara.v4.treasury-range-manager-deployment.v3` manifest with `deployed_verified` status, protected origin commit ancestry, exact protocol-Safe execution/nonce/inner call and `ExecutionSuccess` log, exact CREATE2 `Deployed` event, dedicated-custody policy, receipt block/hash, predicted/deployed address, runtime hash, and every constructor binding/deadline. The builder verifies the file hash, canonical receipt/block, both Safe roles, runtime at receipt and current blocks, and all bindings. Legacy v2 evidence and an address plus matching bytecode are insufficient authority.

## Safe funding and order creation

The Treasury delegated account, protocol deployment Safe, and dedicated Treasury Range Safe are three separate addresses. A preflight observation found canary-capable inventory at the Treasury while both Safes held no NARA/USDC. That observation is not execution authority and must be re-pinned to a current block/hash before use.

Order creation pulls only the dedicated Treasury Range Safe's balances and allowance. It must never treat Treasury or protocol deployment Safe inventory as custody balance/allowance. If strategy capital is still at Treasury, a separate explicitly approved Treasury-to-Treasury-Range-Safe funding action, limited to exactly 100,000 NARA plus 500 USDC for this canary, with its own simulation and receipt evidence, must complete first. The supplied order builder does not include or imply that transfer. After funding, regenerate/re-hash the strategy, re-pin live state and dedicated Safe balances, and rebuild the JIT order packet. Never transfer inventory to the deployment Safe or a settler.

```powershell
$env:RANGE_MANAGER_ADDRESS = "<receipt-verified-manager>"
$env:V4_TREASURY_RANGE_STRATEGY_MANIFEST = "deployments/v4-treasury-range-strategy-candidate.json"
$env:V4_TREASURY_RANGE_ACCEPT_SINGLE_SIGNER_SAFE = "<exact-dedicated-Treasury-Safe-from-policy>"
npx tsx scripts/buildV4TreasuryRangeOrders.ts
```

Review every range orientation: currency0=USDC, currency1=NARA; higher human NARA/USD price means a lower tick. The whole Safe simulation must show exact total approvals, every strategy-hash/deadline-bound create, approval resets, and final `assertOperationalClean()`. Stop if a range is active/two-sided/already crossed, any minimum is zero, any pending Hook change is ignored, or protected USDC would be breached.

## Starting two settlers

Create `/etc/nara/v4-range-settler-a.env` and `...-b.env` with mode `0600`, owned by the service administrator. Do not paste their contents into tickets, shell history, logs, or evidence. Required keys are listed in the service README. Each file needs a different `SETTLER_PRIVATE_KEY`, `SETTLER_EXPECTED_ADDRESS`, `SETTLER_INSTANCE_ID`, and independent provider set.

### Provision each instance's state volume

Every instance needs a pending-state directory and a reconciliation directory on persistent storage. Each must contain an empty, operator-created sentinel file named `.nara-settler-state-volume`. The service never creates these directories or the sentinel. At startup, before opening any RPC connection, it exits with a `settler_fatal` reason code if either is missing, lacks the sentinel, or is not writable: `PENDING_STATE_DIRECTORY_MISSING`, `PENDING_STATE_VOLUME_SENTINEL_MISSING`, `PENDING_STATE_DIRECTORY_NOT_WRITABLE`, or the matching `RECONCILIATION_STATE_` code. It re-checks the sentinel on every durable write. Because the sentinel lives on the volume, an unmounted, mis-pathed, or ephemeral directory cannot pass for the journal. The service README section "Durable state volume" explains the design and gives the Railway steps.

On a systemd host with the default paths, provision once per instance, as root. For instance `a`:

```bash
sudo install -d -m 0700 -o nara-settler -g nara-settler /var/lib/nara-v4-range-settler
sudo install -d -m 0700 -o nara-settler -g nara-settler /var/lib/nara-v4-range-settler/reconciled-a
sudo install -m 0600 -o nara-settler -g nara-settler /dev/null /var/lib/nara-v4-range-settler/.nara-settler-state-volume
sudo install -m 0600 -o nara-settler -g nara-settler /dev/null /var/lib/nara-v4-range-settler/reconciled-a/.nara-settler-state-volume
sudo ls -la /var/lib/nara-v4-range-settler /var/lib/nara-v4-range-settler/reconciled-a
```

For an instance `b` on the same host, repeat the two `reconciled-a` commands with `reconciled-b`; the shared pending-state directory needs only one sentinel. The pending journal (`pending-a.json`), the nonce high-water file (`nonce-high-water-` plus the lowercase wallet address plus `.json`), and the `reconciled-a` records then all live under `/var/lib/nara-v4-range-settler`, which must be on persistent disk. The unit uses `ProtectSystem=strict`. If you point `SETTLER_PENDING_STATE_PATH` or `SETTLER_RECONCILIATION_DIRECTORY` at another mount, grant that path with a `ReadWritePaths=` drop-in and provision it the same way.

Never provision fresh state for a key that has already signed. If a state volume is lost or replaced, retire that gas key and start the instance with a new dedicated gas-only key on a newly provisioned volume, because a lost journal may have held a signed transaction that is still valid.

Before activation:

1. Confirm each key controls an address with gas only and zero NARA/USDC.
2. Set conservative gas caps and fund only a bounded amount of ETH.
3. Run `npm run typecheck:treasury-range-settler:v4` and
   `npm run test:treasury-range-settler:v4`, then a read-only startup rehearsal.
   In that rehearsal, confirm each instance logs `settler_starting` only with both sentinels present on its persistent volume, and that a supervised restart keeps the same pending journal, high-water file, and reconciliation records.
4. Confirm the RPC request timeout is below the whole-sweep timeout and the supervisor restarts a deliberately terminated rehearsal instance with fresh provider connections.
5. Confirm heartbeat/alert receivers show only allowlisted fields.
6. Confirm the other v4 maintainer services, schedules, roles, keys, and bindings are unchanged.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nara-v4-range-settler@a.service
sudo systemctl enable --now nara-v4-range-settler@b.service
sudo systemctl status nara-v4-range-settler@a.service nara-v4-range-settler@b.service
```

Healthy evidence includes recent `sweep_complete`, successful heartbeats for both distinct instance IDs, independent block agreement, gas above minimum, and no runtime/binding/ownership alerts. A quiet pool is not an error because polling and full sweeps continue.

Each instance signs the exact EIP-1559 settlement transaction, computes its hash, and durably persists the raw transaction, hash, nonce, and order intent with mode `0600` before broadcast. It holds at most one pending transaction in its provisioned pending-state directory (default `/var/lib/nara-v4-range-settler`) and submits with an explicit nonce only when all three providers agree latest and pending nonce are equal and that nonce is strictly above the durable nonce high-water mark. If a crash occurs after persistence but before broadcast, the instance may rebroadcast only that identical signed raw transaction and hash after all-three absence/nonce checks, a fresh three-provider binding/USDC dependency preflight, and all-three simulation of the exact persisted calldata; it never blindly replaces or submits a nonce chain. Sweeps, heartbeats, and alerts remain live while pending. It pages after `SETTLER_PENDING_ALERT_AFTER_MS` and reports a drop only after `SETTLER_PENDING_DROP_AFTER_MS`, but a drop or terminal order race does not delete the signed nonce lineage. Only a canonical confirmed receipt for that exact hash clears it. A successful receipt's complete reconciled order/accounting evidence is durably appended before pending state is cleared. The high-water mark is raised to each signed transaction after its journal is written and before its broadcast, and from any existing journal before it is reconciled, cleared, or rebroadcast. No new settlement can therefore be signed at or below a nonce this wallet already signed, and only the exact persisted raw transaction the mark names may be broadcast again. Preserve the pending journal, the high-water file, both sentinels, and the reconciliation records through every restart and redeploy.

Alert webhook delivery is non-blocking: an unavailable webhook must not prevent terminal settlement. Independently monitor `alert_delivery_failed` logs and missing heartbeat deliveries so notification failure itself pages through a separate channel.

## Alert response

Configure the alert receiver to page on the first occurrence of every reason code listed under "Blocked nonce lineage recovery" and "State volume and high-water refusals" below. The service suppresses repeats of one reason code from one trigger source for five minutes and never waits for delivery, so paging on the first alert is the receiver's job. Heartbeats stay `healthy` while an instance is blocked or has a dropped transaction, so missing-heartbeat monitoring alone will not catch those states.

### Low gas

Leave the second instance running. Confirm the alert address against the deployment inventory, confirm it still holds no NARA/USDC, then fund only bounded gas. Do not fund by exposing/reusing another keeper key. Escalate if both instances are low.

### Stale RPC or disagreement

Do not reduce confirmations or force a write. A silent critical request or whole-sweep timeout must emit its source/operation, destroy connections, stop watchers, and exit nonzero for supervisor restart. Compare the three heads/hashes through independently administered dashboards, identify the failing vendor, rotate only that instance's endpoint through the secret manager, restart it, and require clean full sweeps before declaring recovery. Different hostnames alone do not prove vendor independence. If canonicality is uncertain, stop both services; permissionless manual settlement remains possible after state is established.

### Settlement simulation/revert

`Settled` after another instance wins is a successful race loss. `Cancelled` is also terminal but must be reported distinctly; a mixed batch is `mixed_terminal`. For any other failure preserve the redacted reason code, order IDs, block/hash, and any transaction hash. Check current order status, terminal sqrt boundary, manager/runtime bindings, gas caps, and Hook state on all providers. Never retry by bypassing simulation, raising caps without review, or calling cancellation from the hot wallet.

### Reorg/replacement or reconciliation mismatch

Stop the affected instance. Preserve original/replacement hashes and receipt/block evidence. Re-establish canonical receipt inclusion across all providers, then independently reconcile events, Safe-directed token transfer logs, terminal order state, PositionManager zero liquidity, and burned ownership. Do not accept latest-state-only evidence.

### Unexpected ownership / unregistered NFT

If `PositionManager.balanceOf(manager)` exceeds registered active-order ownership, alert `UNREGISTERED_POSITION_OWNERSHIP`. ERC-721 `transferFrom` can force ownership without calling the receiver hook, so “manager never owns an unregistered NFT” cannot be enforced solely by the receiver.

This condition must not automatically block settlement of valid registered orders. The settler never calls `quarantineUnregisteredPosition`. Identify token IDs from bounded PositionManager event/indexer evidence, prove `tokenIdToOrderId(tokenId)==0`, and prepare a separate Safe-only, human-reviewed quarantine transaction if appropriate. Never guess a token ID or recipient.

### Manager pool-token dust

Anyone can donate NARA/USDC directly to the manager, so a nonzero manager balance must not gate settlement or cancellation. `MANAGER_POOL_TOKEN_DUST` is alert-only. Reconcile Safe-to-manager, manager-to-Permit2, and Permit2-to-PositionManager allowances directly; any residual allowance remains blocking. Do not disable settlement or prepare an unapproved generic recovery transaction merely to clear donated dust.

### Hook/runtime/USDC dependency change

Stop both settlers. `HOOK_CONFIGURATION_CHANGED` covers active curves/depths and every pending fee/depth governance record even when Hook bytecode is unchanged. Runtime checks cover manager, NARA, USDC, Hook, Vault, Compounder, Safe, PoolManager, PositionManager, Permit2, and the code-hash-bound dependency reader on all three providers. USDC checks also cover proxy implementation/admin slots, implementation hash, admin/owner/pauser/blacklister, pause state, and blacklist state for every monitored actor. Compare the current typed read set to immutable receipt/strategy evidence and the hash-pinned production core manifest. Treat any mismatch as a production incident; never update an expected value merely to silence an alert. Monitoring cannot repair incompatible token behavior, so size tactical exposure for this external liveness risk.

### Blocked nonce lineage recovery

This procedure covers three reason codes:

- `SETTLEMENT_NONCE_LINEAGE_BLOCKED`: no provider has a receipt for the retained transaction, and a racing settle or cancel has already made all of its orders terminal.
- `SETTLEMENT_TRANSACTION_DROPPED`: the retained transaction is unknown to all three providers, its nonce is unconsumed, its orders are still active, and it is older than `SETTLER_PENDING_DROP_AFTER_MS`.
- `PENDING_NONCE_CONSUMED_UNKNOWN_TRANSACTION`: the orders are still active and all three providers report the wallet nonce above the retained nonce, but none of them knows the retained transaction or has a receipt for it. If the orders are already terminal, the same situation is reported as `SETTLEMENT_NONCE_LINEAGE_BLOCKED`, which step 5 catches.

In each case the instance keeps exactly one signed settlement in its pending journal. It will not sign anything else until a canonical receipt for that exact hash has `CONFIRMATIONS` confirmations on all three providers. It keeps sweeping and re-alerting, but its automated settlement is halted and nothing clears on its own.

Page and keep redundancy:

1. Page the on-call operator on the first occurrence.
2. Keep the second, independent instance running throughout. It has its own key, state volume, and nonce lineage, and it can settle every order because settlement is permissionless. Before touching the blocked instance, confirm the other instance's recent heartbeats and `sweep_complete` logs. If both instances are blocked, or the second instance does not exist, automated settlement is down: escalate, and use the manual path under "Disaster recovery and decommissioning" for any order that must be crystallized.
3. Do not redeploy onto fresh storage, wipe the volume, or edit, move, or delete the pending journal or the high-water file. Never sign a replacement, cancellation, or nonce-burn transaction with the settler key; a new signature at the retained nonce recreates the replay risk this state exists to prevent.

Identify the retained transaction:

4. Take `transactionHash`, `nonce`, `orderIds`, and `terminalStatus` from the latest `settlement_nonce_lineage_retained` log (blocked) or `settlement_dropped_nonce_retained` log (dropped). For a consumed nonce, read the same fields from the pending journal on the volume. Never copy the journal's `rawTransaction` field into tickets, chat, or evidence stores.
5. On an independently administered explorer or RPC, confirm that no transaction with that hash is mined and that the wallet's mined-transaction count equals the retained nonce. For a blocked lineage, also confirm every listed order is terminal (status 2 settled or 3 cancelled). If the wallet's count is already above the retained nonce, go to "Consumed nonce" below.

What the exact rebroadcast does: it re-submits the journal's signed bytes unchanged. For a blocked lineage the orders are already terminal, so the transaction is mined and reverts. That consumes the nonce at a gas cost bounded by the signed gas limit and maximum fee, which `SETTLER_MAX_GAS_LIMIT` and `SETTLER_MAX_FEE_PER_GAS_WEI` capped at signing. For a dropped transaction whose orders are still active, it settles them, or reverts the same way if they are no longer settleable. Either receipt unblocks the lineage.

Rebroadcast the exact persisted raw bytes:

6. Run the helper with the affected instance's own environment, on its own provisioned volume, passing the hash from step 4. On Railway, open a shell in the running service with `railway ssh` and run these two commands (`/app` is the image's working directory):

   ```bash
   cd /app
   node_modules/.bin/tsx services/v4-treasury-range-settler/src/rebroadcastPendingCli.ts --transaction-hash=0xHASH_FROM_STEP_4
   ```

   On a systemd host, for instance `a`:

   ```bash
   sudo systemd-run --uid=nara-settler --gid=nara-settler --property=EnvironmentFile=/etc/nara/v4-range-settler-a.env --working-directory=/opt/nara/nara-protocol-hardhat --wait --pipe --quiet /opt/nara/nara-protocol-hardhat/node_modules/.bin/tsx services/v4-treasury-range-settler/src/rebroadcastPendingCli.ts --transaction-hash=0xHASH_FROM_STEP_4
   ```

   The helper never signs and never edits, raises, or clears local state. On success it logs `operator_exact_rebroadcast_submitted`. Otherwise it exits with status 1 and logs `operator_exact_rebroadcast_refused` with one of these reason codes:
   - `PENDING_RECEIPT_ALREADY_PRESENT`: a receipt already exists. Go to step 8.
   - `PENDING_TRANSACTION_STILL_PENDING`: a provider still holds the transaction, or the nonce is still pending. Wait, then retry the same command.
   - `PENDING_NONCE_CONSUMED_UNKNOWN_TRANSACTION`: go to "Consumed nonce" below.
   - `PENDING_STATE_ABSENT`, `PENDING_STATE_HASH_MISMATCH`, `PENDING_STATE_BINDING_MISMATCH`, `PENDING_STATE_MALFORMED`, or any `NONCE_HIGH_WATER_MARK_` or state-volume code: the journal is not the one that was reviewed. Stop and escalate.
   - A runtime, binding, Hook, or USDC dependency code: follow "Hook/runtime/USDC dependency change". Never bypass it.
   - A provider error, for example a signed maximum fee below the current Base base fee: record the code, wait, and retry the same command. Never re-price by re-signing.
7. Manual equivalent, only if the helper cannot run: submit the journal's `rawTransaction` value unchanged through `eth_sendRawTransaction` on one independent Base RPC, and confirm the returned hash equals the journal's `transactionHash`. Never decode, edit, re-sign, or re-price it.

Verify, reconcile, and clear:

8. Leave the affected instance running; it re-checks on every sweep. Until the receipt is mined, a blocked lineage keeps reporting `SETTLEMENT_NONCE_LINEAGE_BLOCKED` and a rebroadcast dropped transaction reports `SETTLEMENT_TRANSACTION_PENDING`. Once the receipt has `CONFIRMATIONS` confirmations on all three providers, the instance verifies the exact transaction and then does one of three things:
   - For a successful receipt, it logs `settlement_reconciled` and writes a durable record to the reconciliation directory.
   - For a revert against terminal orders, it logs `settlement_terminal_race`.
   - For a revert while the orders are still active, it raises `SETTLEMENT_TRANSACTION_REVERTED`. The lineage is still cleared; investigate the revert under "Settlement simulation/revert".

   The pending journal is deleted only after that verification. The high-water file keeps the retained nonce and hash.
9. Independently confirm on an explorer the receipt for the exact hash, its block and status, and that the wallet's mined-transaction count is now one above the retained nonce.
10. Confirm recovery: the pending journal is gone, the high-water file still names the retained nonce, `sweep_complete` continues, and any next settlement is signed at a strictly higher nonce. Record the hash, receipt, and gas spent in the incident record.

Consumed nonce (`PENDING_NONCE_CONSUMED_UNKNOWN_TRANSACTION`): some other transaction consumed the retained nonce, so the retained bytes can never be mined. The instance stays blocked and the helper refuses.

1. Page, keep the second instance running, and stop the affected instance before changing anything on its volume. For systemd, run `sudo systemctl stop nara-v4-range-settler@a.service`; on Railway, stop the service's active deployment.
2. Treat the event as a possible key compromise or shared key until proven otherwise. On an explorer, find the mined transaction from the settler wallet at the retained nonce, and establish who sent it and why. Possible causes are another instance configured with the same key, manual key use, or an unknown party.
3. If the explorer shows the retained hash itself mined, the providers are failing to serve its receipt. Treat that as an RPC fault under "Stale RPC or disagreement", restart the instance on its unchanged volume, and let it reconcile once all three providers serve the receipt. Do not archive anything.
4. Unless the consuming transaction is positively identified as an authorized action, rotate the key. Create a new dedicated gas-only key and `SETTLER_EXPECTED_ADDRESS`, fund only bounded gas, and retire the old wallet; sweep its residual ETH only through an approved process.
5. Only after the consuming transaction has `CONFIRMATIONS` confirmations and is recorded as evidence, archive the retained journal by moving it off the active path. Never delete it. For systemd instance `a`, replace `NONCE` with the retained nonce:

   ```bash
   sudo mv /var/lib/nara-v4-range-settler/pending-a.json /var/lib/nara-v4-range-settler/archived-consumed-pending-a-nonce-NONCE.json
   ```

   On Railway, do the same move on the volume from a shell opened with the temporary start-command method in the service README. Leave the high-water file in place: it keeps the wallet from ever signing at or below that nonce again. After a key rotation, the new wallet gets its own high-water file, and the old one stays as evidence.
6. Restart the instance and confirm `settler_starting`, clean sweeps, and that any next settlement is signed at a nonce above the retained one.

### State volume and high-water refusals

- `PENDING_STATE_DIRECTORY_MISSING`, `PENDING_STATE_VOLUME_SENTINEL_MISSING`, `PENDING_STATE_DIRECTORY_NOT_WRITABLE`, or the matching `RECONCILIATION_STATE_` code, logged at startup as `settler_fatal` or at runtime as `sweep_failed`. The related runtime events are `pending_state_persist_failed` (alert `PENDING_STATE_PERSIST_FAILED`) and `nonce_high_water_persist_failed`. The durable volume is not mounted where configured, or it changed underneath the service. Never create directories or sentinels to get the service running. Verify the mount and the configured paths, and verify that the existing pending journal, high-water file, and reconciliation records are present. If the original volume is intact, fix the mount and restart. If the volume is lost, or its continuity cannot be proven, retire the gas key as described under "Provision each instance's state volume".
- `NONCE_AT_OR_BELOW_HIGH_WATER_MARK`, with a `settlement_nonce_high_water_refusal` log. All three providers offered a nonce at or below one this wallet already signed. Possible causes are a reorg deeper than `CONFIRMATIONS`, a provider regression, or a pending journal removed by hand. Never lower, edit, or delete the high-water file. Look up the transaction the log names (`transactionHash`, `highWaterNonce`). If it is pending or being re-included, wait for it to be mined. If a journal was removed by hand, restore it unchanged from its archive so the normal lineage path resumes. If the named transaction cannot be accounted for, retire the gas key.
- `NONCE_HIGH_WATER_MARK_CONFLICT`, `NONCE_HIGH_WATER_MARK_MALFORMED`, `NONCE_HIGH_WATER_MARK_BINDING_MISMATCH`, `PENDING_STATE_MALFORMED`, or `PENDING_STATE_BINDING_MISMATCH`. The durable state contradicts itself or belongs to another wallet or manager. Stop the instance, preserve every file as evidence, and escalate. Never hand-edit these files.

## Cancellation and creation pause

Cancellation is Safe-only and is not an incident shortcut. Specify raw minimums for both assets and a concrete review reason:

```powershell
npx tsx scripts/buildV4TreasuryRangeCancellation.ts --order=7:1000000000000000000:1000000:0x<64-hex-strategy-hash> --reason="example reviewed incident response"
```

The builder verifies active status, the explicit persistent per-order strategy hash, non-USDC bindings, and every allowance layer, then encodes `cancel(orderId,minNaraOut,minUsdcOut,deadline)` and simulates the complete Safe batch. It deliberately does not pre- or post-gate on `assertOperationalClean()`, because forceable donated manager balances cannot be cleared by cancellation. It also uses the cancellation-only `emergency_exit_bypass` for USDC dependency drift: the human Markdown must state that attached USDC evidence is the older strategy snapshot, not a JIT exact/healthy assertion. This keeps exit construction available after implementation/control drift, but cannot make a paused, blacklisted, or incompatible transfer succeed. Residual balances are reported for human review but do not block a Safe cancellation. Human review must replace example IDs/minimums/hash with exact receipt-pinned values; a newly pinned cancellation manifest is not expected to reproduce an older order's stored strategy hash.

Pausing only blocks new order creation; settlement remains available. Any pause/unpause packet is a separate Safe-governed action requiring exact calldata, JIT state/nonce evidence, complete Safe simulation, and human approval. The three supplied builders do not silently add pause calls.

## Position reconciliation

At a chosen canonical block/hash reconcile:

- bounded `activeOrderCount` and every page from `getActiveOrderIds(offset,limit)`;
- each active order's persistent strategy hash, token ID, side, ticks, stored minted liquidity, status, and PositionManager owner/liquidity;
- manager PositionManager balance versus registered active ownership;
- manager NARA/USDC balances as alert-only evidence, plus direct zero checks for every Safe-to-manager, manager-to-Permit2, and Permit2-to-PositionManager allowance layer;
- settlement/cancellation events from deployment block in bounded ranges;
- Safe-directed token transfers in each terminal receipt;
- burned PositionManager ownership and zero live liquidity, while recognizing the manager order record retains historical minted liquidity;
- seed/full-range and compounder POL remain unchanged.

Never use the PoolManager's global ERC-20 balances as this pool's reserves.

## Disaster recovery and decommissioning

If an instance's state volume is lost or replaced, do not restart its gas key on fresh state; see "State volume and high-water refusals". If both settlers fail, keep the manager unchanged. Anyone can manually call `settle`/`settleMany` after independent simulation because settlement authority is permissionless and the recipient is immutable. A manual sender needs gas only. Do not share service private keys or grant admin roles.

For decommissioning: pause creation by an approved Safe action, cancel or settle every active order with reviewed minimums, require `activeOrderCount()==0`, reconcile all registered/unregistered NFT ownership, directly require every allowance amount to be zero, record any forceable manager NARA/USDC dust without treating it as a decommissioning blocker, stop/disable both units, revoke the secret-manager entries, sweep only residual ETH from gas wallets using an approved operational process, and archive final evidence. There is no manager upgrade or arbitrary asset-recovery path.

## Evidence preservation

Retain immutable copies of the origin commit and live upstream attestation, strategy manifest/hash, exact USDC proxy/implementation/reader and control-state evidence, Safe JSON/review, pre-signing block/hash/timestamp/slot0/Hook reads, Safe nonce/hash, human approvals, pre-broadcast signed-transaction intent record, transaction/receipt hashes, durable reconciled accounting, deployed runtime/bindings, service version/config key names (never values), heartbeat/alert history, and every settlement reconciliation. Treat pending raw-transaction files as sensitive operational material even though they cannot spend outside their exact signed call. Never delete a retained signed nonce lineage merely because configured providers report it dropped or its orders became terminal; a journal may only be archived by moving it, and only through the consumed-nonce procedure. Never edit, lower, or delete a nonce high-water file, and never create a state-volume sentinel except when provisioning the intended persistent volume. Mark unsigned, expired, superseded, failed, or crash-leftover artifacts explicitly `DO-NOT-IMPORT`.
