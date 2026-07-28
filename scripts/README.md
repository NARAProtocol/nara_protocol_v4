# Scripts

Scripts are grouped by effect, not by how easy they are to run. Read the source
and simulate the exact target before using any state-changing command.

## Local and read-only

| Script or npm command | Purpose |
|---|---|
| `npm run build` | Compile v4 contracts |
| `npm test` | Run Hardhat tests |
| `npm run size` | Check bytecode limits |
| `npm run verify:public` | Check required public files, local links, JSON, and common secret patterns |
| `npm run verify:v4:preseed` | Read the dormant pre-liquidity state |
| `npm run verify:v4:preflight` | Verify configured launch assumptions |
| `npm run verify:v4:launch-gates` | Read configured launch-gate state |
| `syncV4FreshEnv.ts` without `--write-dotenv` | Preview generated v4 environment values |
| `checkBytecodeSizes.ts` | Compile and measure deployable artifacts |

Read-only verification still requires a trusted RPC when it queries Base. Never
print or commit that endpoint.

## Artifact and review helpers

- `packageGatesTarball.mjs`
- `generate-mock-nfts.ts`
- `generateNftPreview.ts`
- `previewPositionArt.ts`
- `generateRoleRenounceBatch.ts`
- `generateRoleTransferBatch.ts`
- `runSlitherV4.ps1`
- `runAderynV4.ps1`
- `runEchidnaV4.ps1`
- `run-gates-linux.sh`

Generated role batches and previews must be inspected before use. A generated
transaction is not an approval to broadcast.

## State-changing and deployment scripts

The following categories can deploy contracts, transfer tokens, change roles,
initialize or seed liquidity, remove liquidity, execute swaps, or modify
production configuration:

- files beginning with `deploy`;
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
