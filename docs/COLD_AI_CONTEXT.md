# Cold AI Context

This is a context-loss-safe summary for agents entering the NARA workspace.

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
- The basket frontend remains preview-only until a verified fresh-v4 handoff.
- The historical 2026-07-30 NARA/USDC liquidity stack was fully withdrawn and
  retired by human Safe signers on 2026-08-08. Its Vault and Compounder are
  empty, both LP NFTs are burned, and old pool active liquidity is zero. Never
  replay its Safe batch or re-propose its completed `WindDown`.

`NARAPositionRendererV5` is the historical name of the modular renderer revision
inside the v4 contract family. It is not a protocol V5 stack.

## Read order

1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`
3. `docs/NARA_V4_LIQUIDITY_WITHDRAWAL_RUNBOOK.md`
4. `docs/UNISWAP_V4_HOOK.md`
5. `docs/V4_LAUNCH_CHECKLIST.md`
6. `docs/NARA_V4_PRESEED_FINDINGS_REGISTER_2026-07-28.md`

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
- Buy-only USDC or sell-only NARA remains banked until matching inventory exists.
- A no-swap Compounder cannot produce active POL from one currency alone.
- Configured protocol depth is the deterministic fee basis; live depth probing
  is telemetry.
- Quote callers must distinguish marginal tier BPS from effective integrated
  BPS and exact fee amount.
- The Engine ERC-20 notifier path is prohibited because active extensions can
  strand reward remainder.

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
