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
- **15-Minute Epoch Engine Activated (`NARAEpochEngineV5`) & 2-Hour Automated Pulse Keepers:**
  Activated `NARAEpochEngineV5` (`0xd93FbEbFb33FAc9288125074625D4750573B1a53`) with 15-minute (`900s`) epochs, segregated principal custody in `NARAPrincipalLedgerV5` (`0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2`), multi-asset (`NARA`, `ETH`, `USDC`) rewards in `NARARewardLedgerV5` (`0xC72671D9438388638547444524F6542b650C9264`), and redundant Cloudflare Pulse Keeper Workers (`MIN_BACKLOG = 8` / 2-hour batching).
- **Liquid Position NFTs (`NARAP`) & Built-In `ETH` Market Live:**
  Deployed, bound, and live-minted `NARAPositionNFTV5` (`0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA`, `Position #1` live on-chain), 100% on-chain SVG `NARAPositionRendererV5` (`0x5Fd79Fc807B0e3d1e04A818f304526F8954dbd24`) and `NARAPositionCardV5` (`0x12B9F23C24a4A0F29cA66F79183ed4C3f07588F5`), and the native-`ETH` secondary marketplace `NARAPositionSaleV5` (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`, `5%` `ETH` fee to rewards).
- **Canonical Uniswap v4 Pool, Dynamic Hook, Zero-Delay Fee Controller & `100% POL` Vaults Initialized:**
  Initialized Pool ID `0x4a475299ef674bcc3d2c87c3917cfbecd38cf7237646a3553e37daba67da6e5f` with `NARALiquidityHookV5` (`0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC`, `hookFeeCalculator` `0xeCc6bB347c615BD51E13dcAB670D0c34Df3375F8`, `4.63%–20%` dynamic fee), `NARAFeeVaultV5` (`0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf`, `feeIngressBinding` `0x17cc74317AD75a170887F9E76e5fF09f2058d4BF`, `100% POL` launch split), `NARATreasuryFeeControllerV5` (`0xB6A436b48222C94fe427ecAfB263DF9cf42646b9`), `NARAPoolOracleV5` (`0xBCF29E9E37E62FBB996D5FF890FEd5280fC02e1A`), and `NARAPOLPositionV5` (`0x01EF9de9f4e9197F2A3944b5B34A90eA2f558b64`).
- **Two-Way Range Manager Deployed & Funded (`51.0149 NARA` Active + `49,997 NARA` Queued Migration):**
  Deployed Active-Pool `NARATreasuryRangeManagerV5` (`0x221c625d2BC416460C397035C1286C1f4A4D3A7C`, bound to Pool `0x4a4752...` and pre-funded with `51.0149 NARA` at block `54,778,829`) and queued the 7-day `49,997 NARA` (`4.9997%` of supply) migration from Legacy `NARATreasuryRangeManagerV5` (`0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288`) at `Safe Nonce 9` (`readyAt = 1794666468` / `2026-11-14T14:27:48Z`).
- **CryptoSLIP Ecosystem Integration:**
  Integrated `NARA` payment links, the 10-slot `0.1 NARA` `NARA Grid`, direct V5 commitments (`1.0 NARA` minimum), `NARAP` Position NFT gallery & marketplace, and 15-minute reward harvesting directly into shareable Slips.

---

## Active Launch Stage — Initial Pool Seed & Range Band Activation

- **Execute Initial `NARA / USDC` Pool Seed & Upside Range Bands:**
  The `2-of-3` Treasury Safe (`0xe320C281c86079eA85f2Bc67864E873A61D551E3`) holds `3.0 NARA + 300.0 USDC` ready to seed the initial Uniswap v4 liquidity position at `$100.00 / NARA` alongside the initial bands in `NARATreasuryRangeManagerV5`.

---

## Upcoming Ecosystem Expansions

- **VRF Rarity Surge & 5-Input Fusion Activation:**
  Transition `NARAForgeV5` (`0x84225aBaBbE7433c736925f9c0ba6f6CcB51551a`) and `NARAEntropyAdapterV5` (`0x9fAf0606c62cA28d34d76e1710BF6E4f523fda5F`) from paused launch mode (`commitsPaused = true`) to live Chainlink VRF v2.5 randomness (`up to 100x` bonus weight tiers and 5-NFT fusion upgrades).
- **Post-Maturity Hook Fee Split Activation:**
  Once permanent POL depth reaches target maturity, transition `NARAFeeVaultV5` from `100% POL` launch mode to redirect swap fees between permanent POL growth and direct `USDC`/`NARA` epoch rewards via `NARARewardIngressV5`.
- **Category Baskets V1 (`CORE`, `AI`, `FINANCE`, `CULTURE`):**
  Complete mainnet adapter deployment and exit-path verification to move the Category Baskets interface from preview to live execution.
