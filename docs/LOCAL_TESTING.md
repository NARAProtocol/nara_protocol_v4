# Local Testing

Last updated: 2026-08-22.

This document covers the active local workflow for the NARA contracts workspace. Code and `package.json` scripts are the source of truth.

## Install, Build, Test

```bash
npm install
npm run build
npm test
```

Targeted suites:

```bash
npm run test:v4                  # token + engine + liquidity
npm run test:token:v4
npm run test:engine:v4
npm run test:liquidity:v4
npm run test:bond:v4
npm run test:nft:v4
npm run test:bond-nft:v4
npm run test:invariants:v4
npm run test:composability:v4
```

## Active Test Inventory

| File | Purpose |
| --- | --- |
| `test/NARAToken.v4.test.ts` | v4 token, permit, flash-loan fee sink, launcher flow |
| `test/NARAEngine.v4.test.ts` | v4 locking, rewards, token rewards, fees, and admin controls |
| `test/NARALiquidityGrowth.v4.test.ts` | v4 growth hook, growth vault, route modes, and pool-fee behavior |
| `test/NARABondV4.test.ts` | v4 ops vault, bond vault, and direct bond depository behavior |
| `test/NARAPositionNFTV4.test.ts` | v4 ERC-721 position wrapper and Genesis reward behavior |
| `test/NARABondV4NFT.test.ts` | v4 NFT bond depository behavior |
| `test/NARAInvariantRegression.v4.test.ts` | v4 invariant regression suite |
| `test/composability/NARAStakingPool.test.ts` | v4 stNARA and SY reward-index behavior |
| `test/composability/NARAFractionalPosition.test.ts` | v4 fractional position behavior |

All v3 and archived tests (NARATokenV3, NARAEngineV2, NARABondVault, BurnRunArena, NaraLottoPool, NARASponsorHub, MisterMint) are in `archive/legacy-v3/` and are not run by `npm test`.

Bond, Genesis, router/lens, allocation, and composability tests exercise local
Phase-3 components only. Their presence does not put those contracts inside the
Position NFT Phase-2 deployment or authorize a production release.

## Start A Local Node

```bash
npx hardhat node
```

Hardhat will expose funded local accounts with ETH for ad hoc component testing.
This persistent `localhost` process is not the canonical Position NFT Phase-2
rehearsal.

## Position NFT Phase-2 Rehearsal

Run the exact seven-contract Position NFT deployment and verification together
inside one fresh ephemeral Base fork:

```bash
npm run rehearse:v4:position-nft
```

The rehearsal covers, in nonce order, `NARAArtMetadataV1`,
`NARAArtSecurityPrintV1`, `NARAArtCorePlateV1`, `NARAArtGenesisPlateV1`,
`NARAPositionRendererV5`, `NARAPositionAccountV4`, and `NARAPositionNFTV4`.
Deployment and verification must remain in the same `baseFork` process because a
later Hardhat process starts a different ephemeral fork. The
`npm run verify:v4:position-nft:rehearsal` alias therefore repeats the entire
fresh deploy-and-verify rehearsal; it is not a post-rehearsal verifier.

Each rehearsal also writes a new, no-overwrite scratch Safe Transaction Builder
file:

```text
deployments/REHEARSAL-DO-NOT-IMPORT-v4-position-nft-phase2-finalization-<block>-<run-id>.json
```

Its embedded name says `REHEARSAL - DO NOT IMPORT`, and its description says the
fork-only batch must never be imported or signed. It targets ephemeral rehearsal
contracts and is local verification evidence only: never import, sign, send,
execute, rename, or promote it as production evidence. Production deployment
writes no standalone Safe import at this stage: the canonical five-call batch
remains embedded in the pending manifest until all seven contracts have source
verification. Only the later just-in-time builder may emit the nonce- and
transaction-hash-bound production `UNEXECUTED` signing packet and Safe batch.

**RETIRED / DO NOT RUN:** the May 2026 aggregate local flow that ran
`deployV4BaseUsdc.ts` followed by `deployV4Allocations.ts` is preserved only as
historical context. `npm run deploy:v4:allocations` is now a refusal guard. Do
not bypass it or invoke the retired TypeScript deployer directly. Allocations,
`NARAOpsVaultV4`, bonds, Genesis distributor/binding, router/lens, circulating
supply, and composability remain Phase 3 and require new separately reviewed
release paths.

The fork rehearsal is a local gate, not production evidence or deployment
authorization. Follow `docs/NARA_V4_NFT_PRODUCTION_PLAN.md` and
`docs/releases/NARA-20260821-v4-position-nft-phase2.md` for the production
source/evidence, deployment, Safe finalization, verification, smoke, and hold
sequence.

v3 deploy scripts are archived in `archive/legacy-v3/scripts/` and are not run
locally.

## Recommended Local Env Overrides

For faster local iteration, use short timings in `.env`:

```bash
LOCALHOST_RPC_URL=http://127.0.0.1:8545
EPOCH_LENGTH_SECONDS=300
CONFIG_CHANGE_DELAY_SECONDS=60
V4_BOND_ACTION_DELAY_SECONDS=60
V4_BOND_ADMIN_DELAY_SECONDS=60
V4_ALLOW_SHORT_BOND_DELAY=1
```

## Mechanics To Exercise Locally

### Locking

1. Approve `NARAEngine` (v4) to spend NARA.
2. Call `lock(amount, durationEpochs, minWeight)`. Epochs auto-advance JIT (up to `MAX_JIT_ADVANCE = 8`).
3. Claim rewards with `claim(positionId)`.
4. Unlock after maturity with `unlock(positionId)`.

### Bonds (Phase-3 Component Testing Only)

These steps describe local fixtures. They do not deploy or bind bond, Ops Vault,
or Genesis contracts during Position NFT Phase 2.

1. Wire the vault market to `NARABondDepositoryV4NFT` via `proposeMarket` + time delay.
2. Pause the depository (`PAUSER_ROLE`).
3. Execute terms and add capacity (`TERMS_ROLE`).
4. Unpause and purchase a bond via `buyBondWithQuote` (EIP-712 signed quote required).
5. Confirm the buyer receives a `NARAPositionNFTV4` NFT and owns a real engine lock position.
6. Advance epochs and exercise claim/unlock from the NFT-backed position.

### Arena

The active arena tests use dedicated mocks and do not depend on archived FIELD-era contracts.

## Live-State Verification

`npm run check:nara:live` was a v3 script and does not exist in v4. After fresh v4 deploy, read live state from the v4 contract addresses recorded in `CURRENT_STATE.md`.

## Rules

- v3 is retired as of 2026-05-27. All active development uses `contracts/v4/`.
- The 2026-04-23 v4 incident stack is retired. Do not use those addresses.
- Archived material in `archive/legacy-v3/` is read-only historical reference.
