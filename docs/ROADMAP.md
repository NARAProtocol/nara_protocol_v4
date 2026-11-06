# NARA Protocol V5 Roadmap & Milestones

This page tracks what is **already deployed, bound, and verified on Base Mainnet (`8453`)** versus what is in active rollout or future stages.

---

## Completed V5 Mainnet Milestones (Block `53,422,831`)

- **Canonical Token & Flash Reserve Binding (`NARATokenV5`):**
  Deployed and verified `NARATokenV5` (`0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f`) with a fixed `1,000,000 NARA` supply, zero owner (`0x0`), and its ERC-3156 flash-loan fee sink permanently bound to `NARAEmissionReserveV5`.
- **34-Contract V5 Production Suite Deployed & Source-Verified:**
  Deployed and verified all 34 NARA V5 contracts (`Solidity 0.8.37`) on Base Mainnet (`8453`).
- **`94.9987%` Emission Reserve Sealed (`NARAEmissionReserveV5`):**
  Funded `NARAEmissionReserveV5` (`0xf932178F24b0813C82093985F0Af6Db27Ae25930`) with **`949,987 NARA`** and permanently bound it (`coreBound = true`) to `NARAEpochEngineV5`.
- **15-Minute Epoch Engine Activated (`NARAEpochEngineV5`):**
  Activated `NARAEpochEngineV5` (`0xd93FbEbFb33FAc9288125074625D4750573B1a53`) with 15-minute (`900s`) epochs, segregated principal custody in `NARAPrincipalLedgerV5` (`0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2`), and multi-asset (`NARA`, `ETH`, `USDC`) rewards in `NARARewardLedgerV5` (`0xC72671D9438388638547444524F6542b650C9264`).
- **Liquid Position NFTs (`NARAP`) & Built-In `ETH` Market Live:**
  Deployed, bound, and live-minted `NARAPositionNFTV5` (`0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA`, `Position #1` live on-chain), 100% on-chain SVG `NARAPositionRendererV5` (`0x5Fd79Fc807B0e3d1e04A818f304526F8954dbd24`) and `NARAPositionCardV5` (`0x12B9F23C24a4A0F29cA66F79183ed4C3f07588F5`), and the native-`ETH` secondary marketplace `NARAPositionSaleV5` (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`, `5%` `ETH` fee to rewards).
- **Canonical Uniswap v4 Pool, Dynamic Hook & `100% POL` Vaults Initialized:**
  Initialized Pool ID `0x3bd8b60dc9eb37f00afa57585232e4018ae661b2dbd5318562183a67a07ac758` with `NARALiquidityHookV5` (`0x201fBD2839bEc513040024b37dAe97B401E96acC`, `4.63%–20%` dynamic fee), `NARAFeeVaultV5` (`0xe63b4BaAF873FC57859bfe13e0e8cFccAaB6AddE`, `100% POL` launch split), and `NARAPOLPositionV5` (`0x01EF9de9f4e9197F2A3944b5B34A90eA2f558b64`).
- **Two-Way Range Manager Funded (`49,997 NARA`):**
  Funded `NARATreasuryRangeManagerV5` (`0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288`) with **`49,997 NARA`** (`4.9997%` of supply) under `2-of-3` Treasury Safe control (`0xe320C281c86079eA85f2Bc67864E873A61D551E3`) to sell `NARA` for `USDC` on upside rungs and use `USDC` to buy `NARA` back on dips (with a 7-day `NARA` withdrawal delay at launch, extendable to 1 year).
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
