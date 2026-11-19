# NARA Protocol V5 Roadmap & Milestones

This page tracks what is **already deployed, bound, and verified on Base Mainnet (`8453`)** versus what is in active rollout or future stages.

---

## Completed V5 Mainnet Milestones (Blocks `54,778,829–59,502,291`)

- **Canonical Token & Flash Reserve Binding (`NARATokenV5`):**
  Deployed and verified `NARATokenV5` (`0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f`) with a fixed `1,000,000 NARA` supply, zero owner (`0x0`), and its ERC-3156 flash-loan fee sink permanently bound to `NARAEmissionReserveV5`.
- **36-Contract V5 Production Suite Deployed & Source-Verified:**
  Deployed and source-verified all `35` core/periphery NARA V5 contracts (`Solidity 0.8.37`) plus ownerless `NARAGenesisShieldVaultV5` (`0xe42aD8951f486f19E396Eb23bDE352BA92Dd2e56`) on Base Mainnet (`8453`), alongside `6` verified CryptoSLIP `v33`/`v32` contracts (`42/42` verified).
- **`94.9987%` Emission Reserve Sealed (`NARAEmissionReserveV5`):**
  Funded `NARAEmissionReserveV5` (`0xf932178F24b0813C82093985F0Af6Db27Ae25930`) at genesis (`54,778,829`) with **`949,987 NARA`**, permanently bound (`coreBound = true`, `owner = 0x0`) to `NARAEpochEngineV5`, and streaming 15-minute epochs (`949,834.951565 NARA` / `94.9835%` remaining at block `59,502,291`).
- **15-Minute Epoch Engine Activated (`NARAEpochEngineV5`):**
  Activated `NARAEpochEngineV5` (`0xd93FbEbFb33FAc9288125074625D4750573B1a53`) with 15-minute (`900s`) epochs (`wallEpoch 1643`), segregated principal custody in `NARAPrincipalLedgerV5` (`0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2`, `46,004.061274 NARA` active across `48` positions), and multi-asset (`NARA`, `ETH`, `USDC`) rewards in `NARARewardLedgerV5` (`0xC72671D9438388638547444524F6542b650C9264`).
- **Liquid Position NFTs (`NARAP`), Wave 1 Vault Receipts & Built-In `ETH` Market Live:**
  Deployed, bound, and live-minted `NARAPositionNFTV5` (`0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA`, `48` positions minted on-chain including `29` Wave 1 Vault Receipts `#16..#44` at `https://naraprotocol.io/vault`), 100% on-chain SVG `NARAPositionRendererV5` (`0x5Fd79Fc807B0e3d1e04A818f304526F8954dbd24`) and `NARAPositionCardV5` (`0x12B9F23C24a4A0F29cA66F79183ed4C3f07588F5`), and the native-`ETH` secondary marketplace `NARAPositionSaleV5` (`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`, `5%` `ETH` fee to rewards).
- **Canonical Uniswap v4 Pool, Dynamic Hook & Zero-Delay Fee Periphery Initialized:**
  Initialized Pool ID `0x4a475299ef674bcc3d2c87c3917cfbecd38cf7237646a3553e37daba67da6e5f` with `NARALiquidityHookV5` (`0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC`, `4.63%–20%` dynamic fee), `NARAFeeVaultV5` (`0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf`), `NARATreasuryFeeControllerV5` (`0xB6A436b48222C94fe427ecAfB263DF9cf42646b9`, `0-second delay` fee withdrawal controller with zero permanent tie-up), and `NARAFeeIngressBindingV5` (`0x17cc74317AD75a170887F9E76e5fF09f2058d4BF` → `NARARewardIngressV5`).
- **Legacy Range Migration Completed, Ownerless `45,000 NARA` Genesis Shield Sealed & Active Range Manager Funded:**
  Completed the queued `49,997 NARA` withdrawal from legacy `NARATreasuryRangeManagerV5` (`0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288`, now `0.000000 NARA`) on `2026-11-14` (Block `57,380,992`), permanently sealed **`45,000.00 NARA`** inside ownerless `NARAGenesisShieldVaultV5` (`0xe42aD8951f486f19E396Eb23bDE352BA92Dd2e56`, `owner = 0x0`, `seedingClosed = true`, `100%` reward recycle + `100%` principal retirement to `NARAEmissionReserveV5`), funded active-pool `NARATreasuryRangeManagerV5` (`0x221c625d2BC416460C397035C1286C1f4A4D3A7C`) to **`4,055.246222 NARA`** (`4,050.412222 NARA` in vault + `4.834000 NARA` across `12` live upside sell rungs), and brought `Treasury Safe` liquid `NARA` to **`0.000000 NARA`** (`Safe Nonce 29`).
- **Initial Uniswap v4 Pool Seed & Trading Activation:**
  Seeded the canonical Uniswap v4 `NARA / USDC` pool (`0x4a475299ef674bcc3d2c87c3917cfbecd38cf7237646a3553e37daba67da6e5f`) via `Treasury Safe` LP (`0xe320C281c86079eA85f2Bc67864E873A61D551E3`), opened trading (`tradingPaused = false`) on `NARALiquidityHookV5`, deployed `12` active upside sell rungs in `NARATreasuryRangeManagerV5` (`0x221c625d2BC416460C397035C1286C1f4A4D3A7C`), and enabled 100% V4-Hook swap execution on `https://naraprotocol.io` and `https://slip.naraprotocol.io`.
- **CryptoSLIP Integration, ENS IPFS Sync, ERC-8021 Attribution & Global Compliance Hardening:**
  Integrated `NARA` payment links (`>= 0.000001 NARA` on active `v33` `0x3f80aa68Fb4834d6E119EE1cf932C14419Cf63EB` alongside preserved `v32` `0x38BF0321FA7489576978353a6a8da4A3e85C2F18`), `$0.10 USDC` / `100 sats cbBTC` / `0.000001 ETH` micro-minimum Slips at `https://slip.naraprotocol.io` and ENS `https://cryptoslip.eth.limo` (`QmR2iL26vJgrHUzUz3osFXAnYEu9Gj3j8s1EAcLnzT9dNQ`, build `cs-1794973520999`), wired ERC-8021 Base Builder Codes (`bc_g71jff6u` / `bc_ea68lz8s`), and deployed zero-cookie `no-transform` security headers, `HTTP 451` sanctions filtering, RFC 9116 `/.well-known/security.txt`, and public `/privacy`, `/terms`, and `/accessibility` notices.

---

## Upcoming Ecosystem Expansions

- **Dynamic Hook Holder Fee Split Activation (`NARAFeeIngressBindingV5`):**
  Alongside zero-delay fee routing via `NARATreasuryFeeControllerV5` (`0xB6A436b48222C94fe427ecAfB263DF9cf42646b9`), enable configurable on-chain `holderFeeBps` splits on `NARAFeeVaultV5` (`0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf`) to stream a direct percentage of `USDC` and `NARA` swap fees automatically into `NARARewardIngressV5`.
- **Category Baskets V1 (`CORE`, `AI`, `FINANCE`, `CULTURE`):**
  Complete mainnet adapter deployment and exit-path verification to move the Category Baskets interface from preview to live execution.
