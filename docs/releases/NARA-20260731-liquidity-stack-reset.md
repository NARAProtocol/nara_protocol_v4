# NARA-20260731-liquidity-stack-reset

Change-ID: `NARA-20260731-liquidity-stack-reset`

Origin remote: `NARAProtocol/nara_protocol_v4`

Origin commit: not yet created. The current v4 core was deployed from
`3215b69a1154b9c30957cd8d875b636dedc9d0ca`, but that commit is not evidence
for either the v4 withdrawal tooling or the separate complete V5 release. Downstream consumers
must wait for a new full 40-character protected-branch origin commit.

Evidence state: recovery preparation tested and Stage 0 executed externally by
the human custody Safe; atomic v4 withdrawal still pending and complete V5
tracked separately as planned. This working
tree contains the reset plan, a fail-closed recovery proposal builder, the
historical executed Safe payload, separate execution evidence, focused tests,
and a pinned Base-fork withdrawal proof. It contains no replacement Solidity,
merge, deployment, production configuration, indexing, activation, or
availability claim under this Change-ID.

Changed contracts/interfaces: none. Operational changes add
`scripts/buildV4LiquidityStackRecoveryProposal.ts`, its focused test, the
generated two-call Safe Transaction Builder artifact, and a durable pinned
Base-fork retirement test with its isolated Hardhat network. The superseded
fee-curve builder now fails closed. This Change-ID governs old-v4 liquidity
recovery and retirement. The user expanded V5 into a separate new token,
engine, reserve, full protocol-module, liquidity, custody, tooling, monitor, and
integration release under `NARA-20260801-v5-complete-stack-reset`. Exact V5
interfaces remain unimplemented and must come from reviewed source.

Generated recovery artifact:
`deployments/v4-liquidity-stack-recovery-proposal-batch.json`, produced by
`npm run build:v4:liquidity-recovery-proposal`. It uses the generated deployed
vault, hook, and compounder Hardhat ABIs, pins their hashes and the reviewed
source enum order (`WindDown = 3`), and now preserves the exact payload executed
in Stage 0. It is historical evidence: do not regenerate, re-import, or
re-propose it while the pending recovery exists. Execution receipt, events,
readbacks, and authoritative ETA are recorded separately in
`deployments/v4-liquidity-stack-recovery-stage0-execution-2026-07-31.json`.
Neither file is a V5 deployment manifest or integration ABI. Future V5 ABIs
must come from generated V5 artifacts at the immutable V5 origin commit.

Deployment manifest: none for V5. The current active pool
evidence remains in `deployments/v4-pool-launch-2026-07-30.json`; do not
overwrite it. The recovery proposal artifact is tracked separately and moves no
assets. V5 receives a new sanitized manifest only after verified deployment.

Chain and verification block: planned for Base, chain ID `8453`. V5
transaction, address, start block, runtime hash, and verification block are
blank until observed on-chain. The current active pool ID is
`0x221d377779f958eadf35122810743a6ba11e9079b0b6bd05234ea9500b227318`;
that fact identifies the migration source, not the replacement.

Depends-on:

- protected review and merge of
  `docs/NARA_V4_LIQUIDITY_STACK_RESET_PLAN.md`;
- fail-closed atomic old-v4 withdrawal tooling and generated ABI evidence;
- complete local, static/fuzz, and exact Base-fork withdrawal gates;
- a disposable one-hour recovery rehearsal stack and pool, followed by a fresh
  production deployment whose recovery delay is already immutable/sealed at
  seven days or longer;
- explicit human approval for each production deployment and Safe action;
- the executed cancellable seven-day old-compounder `WindDown` proposal to the
  custody Safe, now pending with ETA `2026-08-07T22:00:35Z` and no asset
  movement;
- atomic recovery of old seed NFT `2884402` and old compounder NFT `2885838`
  into the Safe, without a V5 mint, conversion, or seed; and
- the separate complete V5 plan at
  `docs/NARA_V5_COMPLETE_STACK_REDEPLOY_PLAN.md`.

Unblocks:

- immutable replacement protocol artifacts and deployment tooling;
- a reviewable old-compounder recovery proposal;
- replacement-pool basket integration after verified upstream evidence;
- dual-fee and migration monitoring; and
- public activation review only after every downstream gate converges.

Downstream repositories reviewed:

- `NARAProtocol/nara_protocol_v4_baskets`: affected by the new pool key, hook
  ABI/events, quote behavior, fee display, addresses, deployment manifests,
  fork fixtures, and start block. No production edit is authorized from this
  working tree; the publishable app remains preview-only.
- `NARAProtocol/nara-swarm-monitor`: affected by replacement addresses,
  dual-leg fee events, fee phases, recovery/cutover state, compounding alerts,
  and old/new pool boundaries. No ABI or address update is authorized before
  immutable origin and deployment evidence.
- `NARAProtocol/nara_protocol`: public documentation reviewed as a later
  publication consumer. No update is permitted before protocol, basket, and
  monitor evidence converges.
- `nara_protocol_v4_publication`: secondary checkout of the origin remote; not
  a source and not updated from this working tree.

Commands and results:

- workspace repository-routing check: passed on 2026-07-31;
- origin identity check: remote
  `https://github.com/NARAProtocol/nara_protocol_v4.git`, branch
  `feat/v4-liquidity-stack-reset-20260731`, starting HEAD
  `451eaa6310512158e03eb57955dd6e0ee06d2629`;
- canonical state, active liquidity contracts, recovery code, current
  liquidity/compounder runbooks, fee policy, pre-seed findings, custody
  handoff, and cross-repository release protocol reviewed;
- recovery proposal generator passed against Base block `49372240`: exact
  final-sell inventory `321,662.875771577338403662 NARA` plus `363.781444 USDC`,
  with NARA marked at `97.797110 USDC` and a total `461.578554 USDC`
  spot-equivalent.
  The equivalent is time-sensitive and non-guaranteed; no swap was simulated or
  included;
- generated Safe artifact contains only keeper revocation and
  `proposeRecovery(WindDown, custodySafe)`. Its exact canonical
  `MultiSendCallOnly` delegatecall, both individual calls, and both diagnostic
  full decreases succeeded read-only. Human Safe signers then executed that
  exact no-movement Stage-0 payload in transaction
  `0xf8079c502c32e037bbb947b0cccd3ef362a4f9b02325cff1f06db0963875435b`
  at block `49372944` (`2026-07-31T22:00:35Z`), status `1`, gas `108282`;
- the receipt emitted `CompoundKeeperSet(keeper, false)` and
  `RecoveryProposed(kind=3, to=Safe, eta=1786140035)`. Readback through block
  `49373282` confirmed keeper `false`, exact pending `WindDown`, unchanged LP
  owners/liquidities and named balances, and the unchanged `650,000 NARA`
  reserve. Authoritative maturity is `2026-08-07T22:00:35Z` /
  `2026-08-08 01:00:35 Kyiv`; nothing moves automatically at that time;
- focused recovery/fee tests plus the durable retirement fork proof passed
  12/12. Targeted strict TypeScript compilation for every touched TS file
  passed;
- repository-wide `tsc --noEmit` still exits `2` with 185 diagnostics in
  untouched legacy scripts/tests; the filtered rerun found zero diagnostics in
  the files changed under this Change-ID;
- deterministic protocol suite passed 515/515; Hardhat compile passed and all
  deployable bytecode/initcode remained within EVM limits;
- the aggregate `npm test` run reached 519 passing and one external-state fork
  failure: `NARAEngineLiveLock.fork.test.ts` still expects the historical
  treasury holder `0xfe3A...E8e` to own at least 1 NARA, but that address now
  owns zero. The failure is unrelated to this recovery path and remains a stale
  fixture to correct separately;
- durable Base-fork proof at final-state block `49372240` passed: Stage 0 changed
  only keeper authorization and pending recovery; every balance, NFT, pool
  value, and the `650,000 NARA` reserve otherwise remained unchanged. After the
  seven-day warp, vault drain, `WindDown`, and both full decreases completed;
  `363.781444 USDC` reconciled exactly, the sole NARA difference was one
  explicitly asserted raw-unit (`1e-18`) PositionManager round-trip dust, both
  NFT liquidities and pool active liquidity reached zero, and production was
  re-read unchanged at block `49372469`;
- live sell tx `0x3fc3...e4ff` at block `49371719` succeeded with
  `100,000 NARA` in, `13,770 NARA` hook fee, `314.389472 USDC` out, and an
  `87.98%` terminal spot move. The projection differed by only
  `0.000002 USDC`;
- keeper compound tx `0x758e...1e5` at block `49371781` moved the sell fee plus
  the ladder's `15 USDC` into the compounder and added `490228370306205`
  liquidity. The two named NFTs still equal all active pool liquidity,
  `5174385808867015`;
- a second distinct `100,000 NARA` sell, tx `0xb78e...77c`, succeeded at block
  `49371916` and returned `68.465886 USDC`, leaving spot at
  `0.000500394328467635 USDC/NARA`;
- the final wallet sell, tx `0x508f...ae87`, succeeded at block `49372197` with
  `75,772.141376089499042429 NARA` in, `10,135.821206413424856364 NARA`
  hook fee, and `25.524550 USDC` out. The liquidity EOA ended with zero NARA and
  spot reached `0.000304036052119707 USDC/NARA`;
- at the post-sell snapshot, the custody Safe held `154.169235 USDC` and the
  separate liquidity EOA held `436.563886 USDC`. A scoped recovery would pull
  `363.781444 USDC`, leave `517.950679 USDC` in the Safe, and leave the EOA
  balance separate;
- basket repository checks passed: Foundry format/build, 148 deterministic
  tests with one expected skip, four CI invariants, 31 Base adapter fork tests,
  and app install/check/build. Candidate-deployment `ForkBuyProof` remains
  skipped because no replacement basket deployment exists;
- documentation whitespace check, 16-field handoff-schema check, and local
  Markdown-link check: passed in this working tree.

Skipped gates:

- no atomic v4 withdrawal builder exists yet; complete V5 Solidity, tests,
  deployment builders, and monitor schema belong to the separate V5 Change-ID;
- no protected CI or immutable origin commit exists;
- no dormant deployment or verified replacement manifest exists;
- the recovery-builder inventory and local decrease reconciliation exist, but
  they are pinned snapshots and must be replaced by a fresh one-block inventory
  immediately before the later withdrawal;
- Stage 0 is executed and its clock is proven started, but no final recovery or
  atomic liquidity withdrawal has been built, reviewed, signed, or executed;
- no liquidity removal or V5 deployment has occurred;
- no basket or monitor consumer branch has consumed an upstream commit;
- no V5 production smoke, compound/freeze, keeper, soak, or basket activation
  gate has run.

Unresolved risks:

- the current market remains active on the old pool while implementation and
  recovery preparation proceed;
- the current per-block progressive curve can be reduced by cross-block order
  splitting;
- directional input-only fees can leave one-sided balances banked instead of
  increasing active liquidity;
- `swapNaraForUsdc.ts` performs an unpinned latest-balance read after a
  successful receipt and can report a false failure on a lagging RPC. The
  replacement tool must use receipt-block reads and receipt logs, classify
  stale verification as executed/pending, and block duplicate retries until
  the prior hash and nonce are checked;
- the pending low-fee curve remains executable by the Safe and must not be
  finalized;
- V5 dual-delta hook behavior, aggregate fee cap, rounding, event schema, and
  fee milestone enforcement remain to be specified, implemented, and proven;
- the requested one-hour recovery path is approved only for a disposable,
  non-public complete-stack V5 rehearsal. V5 production must be a fresh deployment
  with a recovery delay already immutable/sealed at seven days or longer; no
  production one-hour escape path may remain;
- the sample `7.5% + 7.5%`, `5% + 5%`, and `2.5% + 2.5%` legs and the sample
  `2 x L0`/`4 x L0` milestones are simulation candidates, not approved
  production parameters; economic evidence and explicit human governance
  approval remain required;
- the current liquidity scheduler requires an external reliable trigger/manual
  fallback rather than sole reliance on a best-effort GitHub schedule;
- custody remains the documented interim single `2-of-3` Safe posture; and
- basket contracts/manifests and the publishable app are not production
  available.

Onchain or production writes by this tooling/AI: none. During the evidence
window, three operator sells, one authorized keeper compound, and the human
Safe's Stage-0 transaction executed externally and are recorded above. The
generator only prepared and simulated the payload; it did not sign, submit, or
broadcast it. The external Safe transaction revoked the keeper and queued the
pending `WindDown`. No asset moved. A different final cutover still requires a
fresh payload, exact-fork simulation, human review, and `2-of-3` Safe signatures.
Maturity alone does not execute it.

Secret scan: passed. No literal RPC URL, private key, mnemonic, Safe signer
material, API token, or deployment credential was written to the changed files
or generated review artifact. Only public chain data and public contract/role
addresses are included.

## Release-order reminder

1. ~~Queue the cancellable, no-movement seven-day `WindDown` and revoke the old
   liquidity keeper.~~ Completed externally by the human Safe in block
   `49372944`; do not re-propose it.
2. During the cooldown, finish and exact-fork test the atomic old-v4 withdrawal.
3. At or after the ETA, human Safe signers may execute that reviewed withdrawal;
   otherwise leave the old LP active. V5 need not be deployed first.
4. Verify exact v4 NARA/USDC custody, zero old LP liquidity/vault/bank, zero
   temporary allowances, and unchanged old sealed reserve.
5. Keep recovered v4 assets in custody. Do not infer conversion or V5 seed use.
6. Build the separate complete V5 release under
   `NARA-20260801-v5-complete-stack-reset`, including the disposable one-hour
   rehearsal and fresh production delay sealed at seven days or longer.
7. Update baskets and monitor only from immutable verified V5 evidence.
8. Update public documentation last and use `available` only after every V5
   deployment, configuration, indexing, smoke, exit, keeper, and soak gate.
