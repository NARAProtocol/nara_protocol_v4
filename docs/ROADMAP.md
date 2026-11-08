# NARA Protocol V5 Roadmap & Milestones

This page tracks what is **already deployed, bound, and verified on Base Mainnet (`8453`)** versus what is in active rollout or future stages.

---

## Completed V5 Mainnet Milestones (Block `54,778,829`)

- **Canonical Token & Flash Reserve Binding (`NARATokenV5`):**
  Deployed and verified `NARATokenV5` (`0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f`) with a fixed `1,000,000 NARA` supply, zero owner (`0x0`), and its ERC-3156 flash-loan fee sink permanently bound to `NARAEmissionReserveV5`.
- **35-Contract V5 Production Suite Deployed & Source-Verified:**
  Deployed and verified all 35 NARA V5 contracts (`Solidity 0.8.37`) on Base Mainnet (`8453`).
- **`94.9987%` Emission Reserve Sealed (`NARAEmissionReserveV5`):**
  Funded `NARAEmissionReserveV5` (`0xf932178F24b0813C82093985F0Af6Db27Ae25930`) with **`949,987 NARA`** and permanently bound it (`coreBound = true`) to `NARAEpochEngineV5`.
- **15-Minute Epoch Engine Activated (`NARAEpochEngineV5`):**
  Activated `NARAEpochEngineV5` (`0xd93FbEbFb33FAc9288125074625D4750573B1a53`) with 15-minute (`900s`) epochs, segregated principal custody in `NARAPrincipalLedgerV5` (`0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2`), and multi-asset (`NARA`, `ETH`, `USDC`) rewards in `NARARewardLedgerV5` (`0xC72671D9438388638547444524F6542b650C9264`).
- **Liquid Position NFTs (`NARAP`) & Built-In `ETH` Market Live:**
  Deployed, bound, and live-minted `NARAPositionNFTV5` (`0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA`, `Position #1` live on-chain), 100% on-chain SVG `NARAPositionRendererV5` (`0x5Fd79Fc807B0e3d1e04A818f304526F8954dbd24`) and `NARAPositionCardV5` (`0x12B9F23C24a4A0F29cA66F79183ed4C3f07588F5`), and the native-`ETH` secondary marketplace `NARAPositionSaleV5` (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`, `5%` `ETH` fee to rewards).
- **Canonical Uniswap v4 Pool, Dynamic Hook & Zero-Delay Fee Periphery Initialized:**
  Initialized Pool ID `0x4a475299ef674bcc3d2c87c3917cfbecd38cf7237646a3553e37daba67da6e5f` with `NARALiquidityHookV5` (`0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC`, `4.63%–20%` dynamic fee), `NARAFeeVaultV5` (`0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf`), `NARATreasuryFeeControllerV5` (`0xB6A436b48222C94fe427ecAfB263DF9cf42646b9`, `0-second delay` fee withdrawal controller with zero permanent tie-up), and `NARAFeeIngressBindingV5` (`0x17cc74317AD75a170887F9E76e5fF09f2058d4BF` → `NARARewardIngressV5`).
- **Two-Way Range Manager Funded (`49,997 NARA` + `51.0149 NARA` Active Pre-Fund):**
  Pre-funded active-pool `NARATreasuryRangeManagerV5` (`0x221c625d2BC416460C397035C1286C1f4A4D3A7C`) with `51.0149 NARA` and queued the 7-day withdrawal of **`49,997 NARA`** (`4.9997%` of supply, `Safe Nonce 9`, maturing `2026-11-14T14:27:48Z`) from legacy `NARATreasuryRangeManagerV5` (`0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288`) under `2-of-3` Treasury Safe control (`0xe320C281c86079eA85f2Bc67864E873A61D551E3`) to sell `NARA` for `USDC` on upside rungs and use `USDC` to buy `NARA` back on dips (with a 7-day `NARA` withdrawal delay at launch, extendable to 1 year).
- **CryptoSLIP Ecosystem Integration:**
  Integrated `NARA` payment links (`>= 0.001 NARA`), direct V5 commitments (`1.0 NARA` minimum per Position NFT), `NARAP` Position NFT gallery & marketplace, and 15-minute reward harvesting directly into shareable Slips.

---

## Active Launch Stage — Initial Pool Seed & Range Band Activation

- **Execute Initial `NARA / USDC` Pool Seed & Upside Range Bands:**
  The `2-of-3` Treasury Safe (`0xe320C281c86079eA85f2Bc67864E873A61D551E3`) holds `3.0 NARA + 300.0 USDC` ready to seed the initial Uniswap v4 liquidity position at `$100.00 / NARA` alongside the initial bands in `NARATreasuryRangeManagerV5`.

---

## Upcoming Ecosystem Expansions

- **Dynamic Hook Holder Fee Split Activation (`NARAFeeIngressBindingV5`):**
  Alongside zero-delay fee routing via `NARATreasuryFeeControllerV5` (`0xB6A436b48222C94fe427ecAfB263DF9cf42646b9`), enable configurable on-chain `holderFeeBps` splits on `NARAFeeVaultV5` (`0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf`) to stream a direct percentage of `USDC` and `NARA` swap fees automatically into `NARARewardIngressV5`.
- **Category Baskets V1 (`CORE`, `AI`, `FINANCE`, `CULTURE`):**
  Complete mainnet adapter deployment and exit-path verification to move the Category Baskets interface from preview to live execution.
