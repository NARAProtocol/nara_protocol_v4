# NARA-20260731-epoch-recovery

Change-ID: `NARA-20260731-epoch-recovery`

Origin remote: `NARAProtocol/nara_protocol_v4`

Origin commit: `3215b69a1154b9c30957cd8d875b636dedc9d0ca` for the deployed
engine ABI and Base runtime. The new maintainer, launch gate, fee builder,
compounder builder, and documentation remain working-tree changes and require a
focused protected-branch pull request before any downstream merge.

Evidence state: deployed and configured core; tested working-tree recovery and
operations changes; product availability blocked.

Changed contracts/interfaces: none. Active v4 core bytecode and ABI are
unchanged.

Generated artifact or ABI source:
`artifacts/contracts/v4/NARAEngine.sol/NARAEngine.json` at the origin release
commit for contract behavior. The maintainer uses a minimal read/write ABI from
that interface; the monitor uses its already synchronized generated ABI as the
authority and a two-view read fragment at runtime.

Deployment manifest: `deployments/v4-pool-launch-2026-07-30.json`, preserving
the historical Stage A and replacement-trio manifests rather than overwriting
them.

Chain and verification block: Base, chain ID `8453`. Pool launch transaction
`0x91638d26adbc301e715f76ea2c3e8e6bf6727590f4bcd46416dfbeb456740c8c`
at block `49328483`; post-launch preflight passed over blocks `49358638` to
`49358654`; epoch health was RED at block `49358447` with current epoch `466`
and settled epoch `0`.

Depends-on: protected review and merge of the protocol working-tree changes;
explicit approval and a dedicated gas-funded permissionless keeper for any
production recovery; Safe review for fee and compounder batches.

Unblocks: one-time epoch recovery, recurring 15-minute maintenance, direct
epoch-staleness monitoring, balanced fee proposal, validation compound, and
later basket integration after all release gates converge.

Downstream repositories reviewed:

- `NARAProtocol/nara-swarm-monitor`: focused local branch
  `fix/epoch-health-monitor-20260731` adds the direct read-only epoch poll. It
  consumes no uncommitted protocol ABI or address.
- `NARAProtocol/nara_protocol_v4_baskets`: reviewed only. No consumer edit was
  made because manager/adapters have no verified Base manifests and the new
  protocol operations work has no immutable merge commit yet.
- Public documentation: not updated; publication remains last in release order.

Commands and results:

- repository routing check: passed after repository safe-directory validation;
- focused Hardhat tests: 22 passing;
- Base fork deployed-engine recovery proof: 1 passing; it cleared the live
  backlog locally, locked 1 NARA, accrued emissions, and claimed them;
- `npm run maintain:v4:epochs`: read-only plan passed;
- `npm run verify:v4:preflight`: passed over blocks `49358638..49358654`;
- `npm run verify:v4:launch-gates:baskets`: 14 pass, 2 fail, 9 not applicable;
  the failures are epoch backlog and compounder freeze;
- fee proposal and compounder-validation Safe calls: simulated successfully;
- one-import Safe epoch-recovery batch: generated and simulated at backlog
  `469` as five zero-value `advanceEpochs(100)` engine calls; the engine stops
  early when current, leaving capacity through backlog `500` for Safe signing;
- monitor direct Base poll: RED severity 5 at backlog `466`;
- monitor tests, lint, and typecheck: passed.

Skipped gates:

- no immutable commit or protected CI result exists for these working-tree
  changes yet;
- pinned cross-repository ecosystem drift is deferred until that commit exists;
- production epoch recovery, production lock/claim smoke, Safe fee proposal,
  Safe validation compound/freeze, and 48-hour soak were not executed;
- basket deployment, app parity, and production route smoke remain blocked by
  missing verified basket manifests.

Unresolved risks:

- the production engine remains stale until an approved permissionless recovery
  executes;
- the recurring maintainer is implemented but not active until merged and
  deliberately configured; an optional dead-man heartbeat now detects missed
  scheduler windows after deployment;
- the compounder remains unfrozen;
- the 5% to 20% active fee curve remains unchanged until both Safe/timelock
  stages execute;
- configured protocol depth still needs the documented weekly evidence process;
- custody remains one 2-of-3 Safe rather than the documented two-Safe 3-of-5
  target, and the treasury lock commitment remains unexecuted;
- basket contracts and the publishable app remain preview-only.

Onchain or production writes: none by this change.

Secret scan: RPC and key values were not printed or copied. The maintainer
accepts only the dedicated `V4_EPOCH_KEEPER_PRIVATE_KEY`; it rejects reliance on
admin, treasury, deployer, or Safe-owner key names.
