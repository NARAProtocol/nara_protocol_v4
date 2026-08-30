# Scripts

Scripts are grouped by effect, not by how easy they are to run. Read the source
and simulate the exact target before using any state-changing command.

## Local and read-only

| Script or npm command | Purpose |
|---|---|
| `npm run build` | Compile v4 contracts |
| `npm test` | Run Hardhat tests |
| `npm run size` | Check bytecode limits |
| `npm run preview:v4:position-nft-art` | Generate the canonical local Position NFT gallery and art-QA pages on Hardhat only |
| `node scripts/checkPublicRepo.mjs` | Check required public files, local links, JSON, and common secret patterns (there is currently no npm alias) |
| `npm run verify:v4:preseed` | Read the dormant pre-liquidity state |
| `npm run verify:v4:preflight` | Verify configured launch assumptions |
| `npm run verify:v4:launch-gates` | Read configured launch-gate state |
| `npx tsx scripts/prepareV4EngineLifecycleSmoke.ts --wallet <address>` | Verify production state and simulate exactly one next lifecycle-smoke wallet action; never signs or broadcasts |
| `syncV4FreshEnv.ts` without `--write-dotenv` | Preview generated v4 environment values |
| `checkBytecodeSizes.ts` | Compile and measure deployable artifacts |

Read-only verification still requires a trusted RPC when it queries Base. Never
print or commit that endpoint.

## Treasury range candidate builders

These three scripts read Base and write local, unsigned Safe Transaction Builder evidence only. They contain no signer and cannot broadcast:

| Command | Local effect and required authority |
|---|---|
| `npx tsx scripts/deployV4TreasuryRangeManagerProposal.ts` | Deploy-coverage entry point that forces Hardhat clean/build before reading the artifact, then builds a unique unsigned CREATE2 Safe proposal from protected-origin evidence and the exact generated strategy manifest. It has no signer or broadcast path. `buildV4TreasuryRangeManagerDeployment.ts` is the compatibility entry point for the same builder. |
| `npx tsx scripts/buildV4TreasuryRangeOrders.ts` | Uses the simulator's shared exact integer planner to recompute every enabled order's ticks, one-sidedness, liquidity, input/dust, output, tolerance, and minimum, then builds exact approvals, strategy/deadline-bound creates, approval resets, and final cleanliness assertion. Requires exact v2 receipt/Safe/CREATE2 deployed-manager evidence. |
| `npx tsx scripts/buildV4TreasuryRangeCancellation.ts --order=<id>:<minNara>:<minUsdc>:<strategyHash> --reason=<reviewed-reason>` | Builds explicit Safe-only cancellations after direct allowance checks. Donated manager token balances are reported but do not block, and no broad final cleanliness assertion is appended. Requires exact v2 deployed-manager evidence and labels its cancellation-only `emergency_exit_bypass`; it intentionally bypasses matrix and just-in-time USDC exactness so an exit can still be proposed after drift, but cannot make an incompatible token transfer succeed. |

All three require the exact committed HEAD to have protected origin ancestry and live equality with the configured credential-free upstream branch, every tracked file clean, and no untracked file except the exact resolved generated strategy manifest. They also fail on stale/crash-leftover packets, manager/runtime binding drift, nonce change, or failed whole-Safe `simulateAndRevert`. Deployment and order creation additionally require the exact successful 30-row matrix, current strategy-v2 USDC dependency evidence, and complete active/pending Hook checks. Cancellation preserves the explicitly documented emergency-exit exception above. Output names include Base block and Safe nonce. Packets expire after their short encoded deadline and always require separate human review and approval.

## Position NFT Phase-2 Commands by Effect

| Effect class | Exact command | Effect and boundary |
|---|---|---|
| Local scratch | `npm run preview:v4:position-nft-art` | Uses local Hardhat only and writes a new ignored `.nara-art-qa/` child; no Base write or release approval. |
| Ephemeral fork write | `npm run rehearse:v4:position-nft` | Deploys and verifies the exact seven contracts inside one fresh `baseFork` process; writes only `REHEARSAL-DO-NOT-IMPORT` scratch evidence. |
| Ephemeral fork write | `npm run verify:v4:position-nft:rehearsal` | Repeats the entire fresh deploy-and-verify rehearsal; it is not a verifier for a prior fork process. |
| Base read-only | `npm run plan:v4:position-nft` | Checks Base/core/Safe/signer nonce, predicts the exact seven addresses, and writes no file or transaction. |
| Base read + local evidence | `npm run build:v4:position-nft-plan-evidence` | Rechecks the clean protected source commit and writes no-overwrite deployment-plan and artifact-build evidence; sends no transaction. |
| **Production onchain write** | `npm run deploy:v4:position-nft` | One authorized attempt sends exactly seven consecutive deployment transactions and writes receipt journal plus pending manifest. The Safe batch remains embedded-only; no standalone import is written. |
| Base read-only | `npm run verify:v4:position-nft:pending` | Strictly verifies pending receipts, runtimes, policy, Safe/mint state, and embedded batch; rejects a pre-source standalone import. |
| Explorer submission + evidence | `npm run verify:v4:position-nft:sources` | Reruns pending verification, submits/checks all seven BaseScan source proofs, and writes source-verification evidence; sends no onchain transaction. |
| Base read/simulation + signing artifacts | `npm run build:v4:position-nft-finalization` | After all-seven source proof, emits the only importable nonce/hash-bound `UNEXECUTED` Safe batch plus its packet; never signs, sends, or executes. |
| Base read + evidence + quarantine | `npm run finalize:v4:position-nft-evidence` | After the separately executed Safe transaction, finalizes/verifies evidence and hash-preservingly renames both JIT artifacts to `EXECUTED-DO-NOT-IMPORT`; sends no transaction. |
| Base read-only | `npm run verify:v4:position-nft` | Verifies the finalized manifest and live state; sends no transaction. |
| Filesystem recovery | `npm run quarantine:v4:position-nft-safe-artifacts` | Resumes the exact post-verification hash-checked rename if quarantine was interrupted; never deletes or changes bytes. |
| Filesystem recovery | `npm run quarantine:v4:position-nft-incomplete-artifacts` | With the exact confirmation flag, recoverably renames partial `UNEXECUTED-*` and `PENDING-PACKET-LINK-DO-NOT-IMPORT-*` JIT artifacts to `INCOMPLETE-DO-NOT-IMPORT-*`; never deletes or changes bytes. |
| Refusal only | `npm run deploy:v4:allocations` | Intentionally throws. The broad allocation deployer is retired; do not bypass it or invoke `deployV4Allocations.ts` directly. Bonds, Genesis, allocations, and router/lens remain Phase 3. |
| Refusal until Phase 3 | `npm run deploy:v4:router:lens` | Intentionally throws before network access until a finalized Position NFT manifest exists and a separate Phase-3 release is reviewed. |

Production deploy and JIT-builder preflight refuse any stale
`deployments/UNEXECUTED-v4-position-nft-phase2-*` file or partial
`deployments/PENDING-PACKET-LINK-DO-NOT-IMPORT-v4-position-nft-phase2-*` staging file. The latter is
the never-importable temporary Safe-batch name used between durable write/hash verification and the
atomic rename to the final `UNEXECUTED` batch. Reconcile stale evidence; never delete or hand-rename
it merely to make preflight pass. No command in this table signs or executes the five-call Safe
transaction; that requires separate explicit human Safe review and execution.

## Artifact and review helpers

- `packageGatesTarball.mjs`
- `generate-mock-nfts.ts` and `print-svg-3.ts` — local Hardhat/chain-31337 mock helpers only; both fail before signer access on any configured non-local network
- `previewPositionArt.ts` — canonical Position NFT art-QA generator; invoke only through
  `npm run preview:v4:position-nft-art`
- `generateNftPreview.ts` — **quarantined and non-executable** historical helper for retired art;
  use only `npm run preview:v4:position-nft-art` for current Phase-2 QA
- `generateRoleRenounceBatch.ts`
- `generateRoleTransferBatch.ts`
- `runSlitherV4.ps1`
- `runAderynV4.ps1`
- `runEchidnaV4.ps1`
- `run-gates-linux.sh`

The canonical preview writes to the ignored repo-local directory
`.nara-art-qa/v4-position-nft-phase2/`. `V4_POSITION_NFT_ART_QA_OUT` may override the location only
with a new, unused child directory inside this repository's `.nara-art-qa/` root; the root itself,
paths outside it, and non-empty prior output fail closed. Preview output is regenerated scratch
material, not an address, deployment artifact, or approval. After human browser/marketplace-decoder
review, copy the approved QA record into the Phase-2 `release-evidence/` directory and bind its hash
in the external attestation; do not commit `.nara-art-qa/` itself.

Generated role batches and previews must be inspected before use. A generated transaction is not an
approval to broadcast.

`deployComposabilityV4.ts` is likewise quarantined before network access. Router/lens and
composability are Phase-3 work and cannot be activated by an environment-variable override in this
Phase-2 release.

## State-changing and deployment scripts

The following categories can deploy contracts, transfer tokens, change roles,
initialize or seed liquidity, remove liquidity, execute swaps, or modify
production configuration:

- files beginning with `deploy`, except the explicitly unsigned/no-broadcast `deployV4TreasuryRangeManagerProposal.ts` proposal builder documented above;
- `executeV4NaraDepth.ts`;
- `fundEmissionReserveV4.ts`;
- `seedV4Liquidity.ts`;
- `removeV4Liquidity.ts`;
- `swapUsdcForNara.ts`;
- `smokeTestV4Deployment.ts` when configured for live writes;
- `syncV4FreshEnv.ts --write-dotenv`;
- handoff and recovery scripts.

Do not run them merely because they are included in the public repository.
They require:

1. explicit human authorization for the exact operation;
2. verified chain ID, addresses, bytecode, constructor inputs, and roles;
3. an isolated signing environment;
4. fork rehearsal and transaction simulation;
5. decoded calldata and balance-delta review;
6. a recovery and monitoring plan.

Never paste a private key into a command line, issue, pull request, log, or
documentation file.
