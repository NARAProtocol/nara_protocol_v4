# NARA v4 Production Activation Evidence

Change ID: `NARA-20260809-v4-production-activation`

Date: 2026-08-09

Network: Base (`8453`)

Contract source commit:
`027af3f06bbe6dea2c187dfd8062e50c228f1c35`

Merged core-evidence commit:
`2e1ae7049228af1ae32dfd5e61c83506be502abf`

Canonical machine-readable evidence:
`deployments/v4-production-activation-2026-08-09.json`

This file records a historical activation checkpoint; the pinned manifest and
commit preserve its point-in-time evidence. For current Compounder, LP, and
freeze state, use
`deployments/v4-compounder-activation-2026-08-09.json` and
`docs/releases/NARA-20260809-v4-compounder-activation.md`.

## Outcome

The fresh v4 NARA/USDC pool is registered, initialized, seeded, and trading.
Hook/Vault ownership is accepted by the production Safe. The source-verified
Compounder is deployed and wired. LP NFT `2898124` is Safe-owned with initial
and observed active liquidity `4242640687119285`.

This record does not declare the whole protocol production-ready. The
Compounder validation and irreversible freeze are incomplete, its
`positionTokenId()` and lifetime added-liquidity totals remain zero, all pool
fees are banked, and the Engine is beyond its eight-epoch JIT buffer. Baskets
remain preview-only and downstream repositories must not update until this
origin evidence has an immutable reviewed commit.

## Canonical addresses

| Component | Address |
|---|---|
| Production Safe | `0xd65c0e390Dc187A22c52c03816591CC736C0D755` |
| Treasury | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` |
| NARALauncher | `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2` |
| NARAToken | `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1` |
| NARAEngine | `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC` |
| NARARewardReserve | `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f` |
| NARALiquidityGrowthVault | `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D` |
| Create2HookDeployer | `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646` |
| NARALiquidityGrowthHook | `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088` |
| NARALiquidityCompounderV4 | `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` |
| Base USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Uniswap v4 PoolManager | `0x498581fF718922c3f8e6A244956aF099B2652b2b` |
| Uniswap v4 PositionManager | `0x7C5f5A4bBd8fD63184577525326123B519429bDc` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Universal Router | `0x6ff5693b99212da76ad316178a184ab56d299b43` |
| V4Quoter | `0x0d5e0F971ED27FBfF6c2837bf31316121532048D` |

Canonical pool ID:
`0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`.

PoolKey: Base USDC currency0, NARA currency1, fee `3000`, tick spacing `60`,
fresh Hook above.

## Executed activation sequence

| Action | Safe nonce | Base transaction | Block | Result |
|---|---:|---|---:|---|
| Seed funding | n/a | `0xc44e7f4daabc3f1a0baef5f2c2fc3dc7b6d235f533c403649e1ff71ea9b91059` | `49720389` | status 1 |
| Hook/Vault ownership acceptance | `28` | `0x35320c5a5dfa31898d8a66e088038b67d1113bf6b95b82a230eaaf64be6f595d` | `49720700` | status 1 |
| Compounder deployment | n/a | `0x8180bc9b7ec6f1e89719cb04cc358ad6e512c664e53aae810cb91abc3c00d461` | `49720856` | status 1; source verified |
| Compounder wiring | `29` | `0x29727cf5578989932175bd4e672d193e38b580f50645dd3bfcc173b44b2e70da` | `49721044` | status 1 |
| Atomic pool registration, initialization, and seed | `30` | `0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799` | `49721188` | status 1 |

The atomic seed was `60,000 NARA + 300 USDC` at bound opening
`sqrtPriceX96 = 1120455419495722798374638764549163435`. It minted full-range
LP NFT `2898124` to the production Safe. The approval revocations were included
inside the atomic batch.

## Live tax evidence

The first observed buy and sell were:

- buy `0x60b4a0a0e6dbb388bda3e9a8e5b81ac1983c0eeaa2f530189dd0898263ef019e`,
  block `49721189`, `94.814404 USDC` input, `9.512880 USDC` Hook fee, terminal
  tier `2000 BPS`;
- sell `0x0167bc7f58aa15aec7bc84b593a376102f5d3ea1d3516a74976c67daf287b84e`,
  block `49721262`, `13,252.292425121709957977 NARA` input,
  `995.229242512170995797 NARA` Hook fee, terminal tier `1000 BPS`.

The later test matrix executed:

- twenty separate buys from `1` through `20 USDC`: `210 USDC` total,
  `23,232.666582171991724157 NARA` received, `10.95 USDC` Hook fees;
- ten separate sells of `1,000 NARA`: `10,000 NARA` total,
  `105.533254 USDC` received, `500 NARA` Hook fees.

All thirty matrix receipts succeeded in distinct blocks. Every stored receipt
block/hash, Hook event, Vault event, token transfer, and reconstructed fee
matched. ERC-20 and Permit2 allowances ended at zero. The buys exercised the
5% and 8% terminal tiers; the separate-block sells exercised 5%. This evidence
does not claim that every higher same-block tier was live-tested.

At block `49734252`, Vault balances exactly equaled lifetime recorded fees:

- `1,495.229242512170995797 NARA`;
- `20.462880 USDC`.

All routed, compounded, and Compounder lifetime-added counters were zero.

## Remaining release gates

The numbered list below records what remained at this activation checkpoint.
Items 2 and 3 were later cleared by the receipt-pinned Compounder validation
and freeze documented in `NARA-20260809-v4-compounder-activation.md`; do not use
this historical list as current state.

The Engine backlog gate was cleared after activation. Safe transaction
`0xcd6e52b319f21b5a6772a36cc076a5c6f8390dcd7326ab1adf822a16f6638493`
advanced epochs `5..35`; at receipt block `49735161`, both current and stored
epoch were `35`. See
`deployments/v4-engine-epoch-recovery-2026-08-09.json`.

1. Explicitly authorize and configure recurring Engine maintenance; it remains
   disabled even though the activation backlog is recovered.
2. Execute the reviewed Compounder validation flow and reconcile exact-spend,
   Vault, remainder, LP-position, and liquidity accounting from its receipt.
3. Only after validation passes, execute and verify the separate irreversible
   `vault.freezeCompounder()` transaction.
4. Merge this evidence through the protected origin pull-request workflow.
5. Update baskets and monitor from the immutable origin commit, keeping the
   basket app preview-only until its own deploy/verification gates pass.
6. Publish public documentation last. Complete allocations, periphery,
   monitoring deployment/indexing, and product availability as separate gates.

## Local setup synchronization

`npm run v4:env:sync` now selects the newest
`v4-production-activation-YYYY-MM-DD.json` before the preserved core checkpoint.
For this release it exports the fresh Token, Engine, Hook, Vault, Compounder,
PoolId, and LP NFT `2898124`; it never exports a private key. Retired July
addresses are named and handled only as retired incident values. The env-sync
and live-config guard suite passes `19/19` focused tests.
At this activation checkpoint, the full Hardhat suite passed `556` tests with
`5` opt-in Base-fork cases pending in the local environment. The later
same-block fork additions raised the current pending count to `7` when those
fork environments are not enabled.

## Cross-repository handoff

Origin repository: `NARAProtocol/nara_protocol_v4`

Origin evidence commit:
`c0a7ca7d770016263211822dc1939d2717ee94bb`

Activation-manifest Git blob:
`3a355a1e8fd8a6d87bc77f21a012e0badf223d05`

Engine-recovery evidence commit:
`6ed852d4dc7689f90eb6163adcc3ba1ab2d6961e`

Engine-recovery manifest Git blob:
`b2f4c4c68e9fb802ffb21c45f731bfbeddfad188`

Merge state: committed on `release/v4-liquidity-activation-20260809`, not yet
merged through the protected origin pull-request workflow. Until the complete
origin evidence chain is reviewed, green, and merged, every downstream address
update is blocked.

Planned downstream order:

1. `NARAProtocol/nara-category-baskets-v1`
2. `NARAProtocol/nara-swarm-monitor`
3. `NARAProtocol/nara_protocol_public`

Merge-gated consumer work identified by the audit:

- baskets: replace retired Token/Engine inputs in
  `config/launch-baskets.json`, update deployment/integration validation docs,
  and expand all retired-address guards; do not set any basket or app status
  live without verified basket deployment manifests;
- monitor: update non-secret environment documentation and contract profiles
  for the fresh Token, Engine, Hook, Vault, Compounder, start block, and PoolId;
  expand retired-address guards and do not claim indexed state before the
  deployed monitor has caught up;
- public documentation: regenerate the complete verification package from the
  immutable origin evidence and replace all July-era address/current-state
  claims. Generated sources, ABIs, and artifacts must be regenerated rather
  than hand-edited.

Consumer state requirements:

- use only the fresh addresses in this record and the machine-readable
  manifest;
- reject all Stage A, July-30, and earlier incident addresses;
- do not translate “pool active” into “whole protocol production-ready”;
- do not mark baskets live before verified basket deployment manifests exist;
- do not claim Compounder POL activity while `positionTokenId == 0` and its
  lifetime totals are zero; and
- do not describe Engine write paths as available while the epoch backlog is
  beyond the JIT buffer.
