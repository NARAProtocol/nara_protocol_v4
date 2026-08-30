# Cold AI Context

This is a context-loss-safe summary for agents entering the NARA workspace.

> The canonical v4 contracts and NARA/USDC pool are in technical live testing
> with real assets on Base mainnet. This is not public product availability,
> legal approval, a safety claim, or a recommendation. This repository contains
> no evidence of completed jurisdiction-specific
> qualified legal review; baskets remain preview-only.

## Non-negotiable state

- NARA is v4-only. `contracts/v4/` is the sole active Solidity source.
- The experimental V5 stack, tests, scripts, and release plans are deleted.
- v3 is retired and frozen under `archive/legacy-v3/`.
- Do not edit `NARAEngine.sol` or `NARAPositionNFTV4.sol` without an explicit
  user instruction naming that core contract.
- Do not deploy, send transactions, perform production writes, or request
  private keys.
- Use generated v4 artifacts from an immutable reviewed commit and a verified
  manifest for integrations.
- The basket frontend remains preview-only until its own verified deployment
  manifests and the explicit cross-repository handoff exist.
- The fresh v4 Hook and Vault are owned by the production Safe. Ownership was
  accepted in transaction
  `0x35320c5a5dfa31898d8a66e088038b67d1113bf6b95b82a230eaaf64be6f595d`
  at block `49720700`.
- The fresh Compounder at
  `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF` passed its bounded validation
  in transaction
  `0xf1ea7e7dfdf8e1021ceebf26a943cba604e0a8c894eec5f527bc01656b5890be`.
  It owns LP NFT `2898486`; the latest receipt-pinned full-inventory compound
  increased that position to liquidity `4386316228001171` at Base block
  `50499085`. The Vault binding
  was permanently frozen in transaction
  `0xccd73cf07602f18412bea291812f0d171fa5cabd41fcff6b6894029978084ef3`.
- The fresh NARA/USDC pool is registered, initialized, and seeded. Its PoolId is
  `0x83edced1f39e6adf7469cd718eeb409824d948959263408d4cfb6e745c8db464`;
  the initial LP NFT is `2898124` with liquidity `4242640687119285`.
- Receipt-pinned live buy/sell matrices and the same-block round trip passed.
  The separately authorized liquidity maintainer is active on the `17,47`
  schedule after a receipt-reconciled compound and hosted idle/heartbeat test.
  The epoch workflow is separately active on its `3,18,33,48` schedule, with a
  Railway fallback at `12,27,42,57`, a different keeper, and heartbeat. The
  Engine lifecycle smoke is pending.
  This evidence is not an overall production-readiness claim.
- The Engine activation backlog was recovered through the Safe in transaction
  `0xcd6e52b319f21b5a6772a36cc076a5c6f8390dcd7326ab1adf822a16f6638493`.
  At receipt block `49735161`, `currentEpoch()` and `epochState.epoch` were both
  `35`; 31 `EpochAdvanced` events covered epochs `5..35`. The later pinned
  block `49735219` was `36 / 35`, a one-epoch JIT-recoverable gap, not a
  write-blocking backlog. That historical recovery is recorded in
  `deployments/v4-engine-epoch-recovery-2026-08-09.json`; recurring epoch
  maintenance was activated separately on 2026-08-14.
- The historical 2026-07-30 NARA/USDC liquidity stack was fully withdrawn and
  retired by human Safe signers on 2026-08-08. Its Vault and Compounder are
  empty, both LP NFTs are burned, and old pool active liquidity is zero. Never
  replay its Safe batch or re-propose its completed `WindDown`.
- The GitHub epoch and liquidity maintainers are active with different enable
  variables, schedules, heartbeat checks, and gas-only keepers. The liquidity
  keeper is `0x0f8ADa55B394E58e9BC667c23a1EEcED12216272`; the epoch keeper is
  `0xE3DDa33EdB0f8b6aa39e4ce853Ba7C4A29e520DD`. Do not change either workflow's
  authority or policy without a new explicit user order and current
  deployment-specific review. Read both 2026-08-15 maintainer activation
  records first.
- The seven-contract Position NFT Phase-2 baseline is deployed,
  source-verified, and Safe-finalized. Its canonical manifest remains
  `integrationReady: false`; do not enable consumers before the separately
  approved value-bearing smoke, monitored hold, and immutable handoff exist.

`NARAPositionRendererV5` is the historical name of the modular renderer revision
inside the v4 contract family. It is not a protocol V5 stack.

## Read order

1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`
3. `docs/releases/NARA-20260827-v4-full-inventory-compound.md`
4. `docs/releases/NARA-20260828-v4-epoch-maintainer-resilience.md`
5. `deployments/v4-position-nft-phase2-finalized-2026-08-21.json`
6. `docs/releases/NARA-20260821-v4-position-nft-phase2.md`
7. `deployments/v4-compounder-activation-2026-08-09.json`
8. `deployments/v4-production-activation-2026-08-09.json`
9. `docs/UNISWAP_V4_HOOK.md`
10. `docs/V4_LAUNCH_CHECKLIST.md`
11. `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`

## Protocol shape

- `NARAToken`: fixed-supply v4 token.
- `NARAEngine`: frozen lock/reward/emission core.
- `NARAPositionNFTV4` and `NARAPositionAccountV4`: transferable position layer.
- `NARABondVaultV4` and `NARABondDepositoryV4NFT`: v4 bond inventory and NFT
  delivery path.
- `NARALiquidityGrowthHook`, `NARALiquidityGrowthVault`, and
  `NARALiquidityCompounderV4`: Uniswap v4 fee/POL stack.
- `router/` and lenses: periphery and read surfaces.
- `composability/`: optional tested v4 extensions, not automatically deployed.

## Liquidity facts that must not be misstated

- The pressure accumulator is per input currency and per block.
- Same-block splits share one cumulative integral; a later block resets it.
- This is Block-0/per-block pressure policy, not persistent anti-splitting.
- Fees are taken in the input currency.
- Buy-only USDC or sell-only NARA remains banked in the Vault or Compounder
  until matching inventory exists.
- A no-swap Compounder cannot produce active POL from one currency alone.
- Configured protocol depth is the deterministic fee basis; live depth probing
  is telemetry.
- Quote callers must distinguish marginal tier BPS from effective integrated
  BPS and exact fee amount.
- The Engine ERC-20 notifier path is prohibited because active extensions can
  strand reward remainder.

## Exact activation receipt facts

- Core addresses:
  - Launcher: `0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2`
  - Token: `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1`
  - Engine: `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC`
  - Reward reserve: `0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f`
  - Vault: `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`
  - CREATE2 Hook deployer: `0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646`
  - Hook: `0x59AEf9799DEA01A7FB7dA73BEA10dfB08858A088`
- Compounder deployment transaction:
  `0x8180bc9b7ec6f1e89719cb04cc358ad6e512c664e53aae810cb91abc3c00d461`,
  block `49720856`.
- Vault wiring transaction:
  `0x29727cf5578989932175bd4e672d193e38b580f50645dd3bfcc173b44b2e70da`,
  block `49721044`.
- Atomic pool seed transaction:
  `0xaeb7c3365354de633dde977d9b2c951b240f6b8ff8be090cdd989edc4c924799`,
  block `49721188`.
- Do not confuse the Safe-owned seed LP NFT `2898124` with the
  Compounder-owned POL LP NFT `2898486`. At the freeze block, their combined
  active liquidity was `4252096511257072`. The Compounder separately banked
  `1718.586695052747189931 NARA` and `24.518753 USDC`; those balances are not
  active LP.

## Atomic release requirements

Before producing an atomic launch batch, prove:

- exact Hook/Vault reciprocal binding;
- exact Engine/NARA binding;
- exact PoolKey and opening price;
- Hook, Vault, and Engine bytecode exists;
- the custody Safe and Vault lack `REWARD_NOTIFIER_ROLE`;
- registration is immediately followed by initialize-and-mint; and
- ERC-20 and Permit2 approvals return to zero in the same batch.

Fresh deployment requires an immutable reviewed commit, current tests and audit
evidence, frozen human-approved inputs, read-only preflight, exact batch
simulation, explicit human approval, receipt-pinned verification, and a
deployment manifest. Downstream repositories update only after that manifest.

## Monitoring and AI boundaries

The monitor is read-only. Deterministic alerts and Commander reports may be
summarized, but AI must not invent evidence, lower severity, resolve alerts,
execute recommendations, or publish without authorization.

When code and prose disagree, trust current v4 source and verified chain
evidence, then correct the documentation.
