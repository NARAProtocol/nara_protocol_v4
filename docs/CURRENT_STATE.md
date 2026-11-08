# Current On-Chain State (NARA V5)

**Verification Checkpoint:** Base Mainnet (Chain ID `8453`) — Block **`54,778,829`** (`2026-11-08`)  
**Compiler & Architecture:** `Solidity 0.8.37` (Cancun EVM, `viaIR`, 35 Verified V5 Contracts)

---

## Status Summary

| Component | On-Chain Status | Details |
|---|---|---|
| **`NARATokenV5` (`NARA`)** | **Live & Immutable** | `0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f` — Fixed `1,000,000 NARA` supply, `owner = 0x0`, `feeSink` permanently bound to `NARAEmissionReserveV5`. |
| **`NARAEmissionReserveV5`** | **Sealed (`949,987 NARA`)** | `0xf932178F24b0813C82093985F0Af6Db27Ae25930` — Holds **94.9987%** of total supply; `coreBound = true` to `NARAEpochEngineV5`. |
| **`NARAEpochEngineV5`** | **Activated (`900s` Epochs)** | `0xd93FbEbFb33FAc9288125074625D4750573B1a53` — `activated = true`; 15-minute epochs (`96/day`); `1–365 day` commitments (`1.00x–4.00x` weight). |
| **`NARAPrincipalLedgerV5`** | **Live & Bound** | `0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2` — 1-for-1 segregated user principal custody (`1.0 NARA` committed in live `Position #1`). |
| **`NARAPositionNFTV5` (`NARAP`)** | **Live & Minted** | `0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA` — On-chain SVG Position NFTs rendered via `NARAPositionRendererV5` and `NARAPositionCardV5` (`Position #1` minted & verified). |
| **`NARAPositionSaleV5`** | **Live (`ETH` Market)** | `0x04Ac83045d26259D46400Ce6beb9bBd0641df225` — Built-in native-`ETH` Position NFT escrow market (`95%` seller / `5%` rewards). |
| **Canonical `NARA / USDC` Pool** | **Initialized & Bound** | Pool ID `0x4a475299ef674bcc3d2c87c3917cfbecd38cf7237646a3553e37daba67da6e5f` on Uniswap v4 `PoolManager`. |
| **`NARALiquidityHookV5`** | **Live (Zero-Delay Fee Routing)** | `0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC` — `4.63%` base fee (`463 bps`) scaling to `20.00%` (`2,000 bps`); swap fees route via `NARAFeeVaultV5` to zero-delay `NARATreasuryFeeControllerV5` (`0s` delay) and configurable `NARAFeeIngressBindingV5` (`NARARewardIngressV5`). |
| **`NARATreasuryRangeManagerV5`** | **Active (`51.0149 NARA`) + Funded (`49,997 NARA`)** | Active Pool Range Manager `0x221c625d2BC416460C397035C1286C1f4A4D3A7C` (pre-funded with `51.0149 NARA`) + Legacy Range Manager `0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288` holding **4.9997%** (`49,997 NARA`, 7-day withdrawal queued at `Safe Nonce 9`, maturing `2026-11-14T14:27:48Z` to migrate into `0x221c62...`) for two-way range liquidity. |
| **Treasury Safe (`2-of-3`)** | **Seed Ready (`3 NARA + 300 USDC`)** | `0xe320C281c86079eA85f2Bc67864E873A61D551E3` — Holds `3.0 NARA + 300.0 USDC` for the initial `NARA / USDC` LP seed. |

---

## Verified V5 Contract Directory (Base Mainnet `8453` — All 35 Contracts)

### 1. Token & Emission Reserve (2 Contracts)

| Contract | Address | Role |
|---|---|---|
| **`NARATokenV5`** | [`0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f`](https://basescan.org/address/0x91FB78A9F46B67f54BbD4489941d19666b2fAe0f) | Canonical ERC-20 + ERC-20Permit + ERC-3156 token (`1,000,000` fixed supply) |
| **`NARAEmissionReserveV5`** | [`0xf932178F24b0813C82093985F0Af6Db27Ae25930`](https://basescan.org/address/0xf932178F24b0813C82093985F0Af6Db27Ae25930) | Immutable emission reserve holding `949,987 NARA` (`94.9987%` of supply) |

### 2. Core Financial Graph, Forge & Lenses (14 Contracts)

| Contract | Address | Role |
|---|---|---|
| **`NARAEpochEngineV5`** | [`0xd93FbEbFb33FAc9288125074625D4750573B1a53`](https://basescan.org/address/0xd93FbEbFb33FAc9288125074625D4750573B1a53) | 15-minute (`900s`) epoch state machine, commitment lifecycle, and reward distributor |
| **`NARAEmissionModelV5`** | [`0xd26b3c23d677b2DE82722DB5e687744600d4A231`](https://basescan.org/address/0xd26b3c23d677b2DE82722DB5e687744600d4A231) | Pure mathematical model computing epoch emission releases and `V4Quadratic` duration weights |
| **`NARAPrincipalLedgerV5`** | [`0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2`](https://basescan.org/address/0x7F866a9fbe41D54F0d9C35b6892fcf27Ea766DB2) | Segregated 1-for-1 custody of user-committed `NARA` principal (`create`, `rechargeCommon`, `rechargeAwarded`, `withdrawPrincipal`) |
| **`NARAPrincipalAdmissionV5`** | [`0x319f02F0a1cb2b18DA0C268231ECa3C9dA252ca0`](https://basescan.org/address/0x319f02F0a1cb2b18DA0C268231ECa3C9dA252ca0) | Constructor child of `NARAPrincipalLedgerV5` enforcing principal admission and duration bounds |
| **`NARALifecycleLedgerV5`** | [`0x3F2987fE6A5418F4DB415Fd08E0f7567F010f043`](https://basescan.org/address/0x3F2987fE6A5418F4DB415Fd08E0f7567F010f043) | Constructor child of `NARAPrincipalLedgerV5` tracking position activation, recharge, and maturity state |
| **`NARARewardLedgerV5`** | [`0xC72671D9438388638547444524F6542b650C9264`](https://basescan.org/address/0xC72671D9438388638547444524F6542b650C9264) | Multi-asset (`NARA`, `ETH`, `USDC`) epoch reward accounting and claims (`80%` base / `20%` rarity split) |
| **`NARARewardCreditLedgerV5`** | [`0x0B98eb99b8E78c216632fADa9ad6ECB4fCFbDf4B`](https://basescan.org/address/0x0B98eb99b8E78c216632fADa9ad6ECB4fCFbDf4B) | Constructor child of `NARARewardLedgerV5` storing per-position reward credits |
| **`NARARewardIngressV5`** | [`0x44130CC47b886D8488041F5eaE271477D1aFA909`](https://basescan.org/address/0x44130CC47b886D8488041F5eaE271477D1aFA909) | Permissionless revenue router staging `NARA`, `ETH`, and `USDC` for admission into `NARARewardLedgerV5` |
| **`NARAForgeV5`** | [`0x84225aBaBbE7433c736925f9c0ba6f6CcB51551a`](https://basescan.org/address/0x84225aBaBbE7433c736925f9c0ba6f6CcB51551a) | Lifecycle module (`commitsPaused = true` — equal-footing `1X` duration-only mode) |
| **`NARAForgeQuoteV5`** | [`0x3fA5c60A9d7A2A1B09Ec40a20593D5Ad26022Bbb`](https://basescan.org/address/0x3fA5c60A9d7A2A1B09Ec40a20593D5Ad26022Bbb) | Constructor child of `NARAForgeV5` quote helper |
| **`NARAEntropyAdapterV5`** | [`0x9fAf0606c62cA28d34d76e1710BF6E4f523fda5F`](https://basescan.org/address/0x9fAf0606c62cA28d34d76e1710BF6E4f523fda5F) | Chainlink VRF v2.5 adapter (dormant while `NARAForgeV5` is paused) |
| **`NARANullEntropyAdapterV5`** | [`0x13b06070790C0A4Ed7f90B635b18E3FEF8ADa8ef`](https://basescan.org/address/0x13b06070790C0A4Ed7f90B635b18E3FEF8ADa8ef) | Deterministic null entropy adapter bound to `NARAForgeV5` |
| **`NARARewardLensV5`** | [`0x4a5e7ec22d34885334deA050679f01a030a635Bf`](https://basescan.org/address/0x4a5e7ec22d34885334deA050679f01a030a635Bf) | Read-only lens computing claimable `NARA`, `ETH`, and `USDC` rewards |
| **`NARAPrincipalLensV5`** | [`0xDCf87e4ba3706E3ac94b10A7BD157Baf64fFE6d0`](https://basescan.org/address/0xDCf87e4ba3706E3ac94b10A7BD157Baf64fFE6d0) | Read-only financial lens exposing epoch, reserve, and position principal summaries |

### 3. Position NFT (`NARAP`), On-Chain SVG Renderer & Secondary Market (8 Contracts)

| Contract | Address | Role |
|---|---|---|
| **`NARAPositionNFTV5`** | [`0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA`](https://basescan.org/address/0x8C5F088D9d09dBB90aB6F3aaA049a8FD5D5FfFDA) | ERC-721 Position NFT (`NARAP`) representing each active position |
| **`NARAPositionCardV5`** | [`0x12B9F23C24a4A0F29cA66F79183ed4C3f07588F5`](https://basescan.org/address/0x12B9F23C24a4A0F29cA66F79183ed4C3f07588F5) | 100% on-chain brown mineral `1000×1000` SVG card generator |
| **`NARAPositionRendererV5`** | [`0x5Fd79Fc807B0e3d1e04A818f304526F8954dbd24`](https://basescan.org/address/0x5Fd79Fc807B0e3d1e04A818f304526F8954dbd24) | Constructor child of `NARAPositionNFTV5` assembling `tokenURI` JSON and SVG metadata |
| **`NARAFrameArtV5`** | [`0x2fe91CF40a1392b4149fc8ffffE22393d1fdFF23`](https://basescan.org/address/0x2fe91CF40a1392b4149fc8ffffE22393d1fdFF23) | Constructor child of `NARAPositionRendererV5` rendering card frame geometry |
| **`NARAPositionStatsReaderV5`** | [`0x7aD6Eab12F6DBa36810c6c94C259d07fA3E043c2`](https://basescan.org/address/0x7aD6Eab12F6DBa36810c6c94C259d07fA3E043c2) | Constructor child of `NARAPositionRendererV5` formatting live position stats for SVG display |
| **`NARAPositionLensV5`** | [`0x4887303fba121a7B99A964B4e57903e688aD1e45`](https://basescan.org/address/0x4887303fba121a7B99A964B4e57903e688aD1e45) | Read-only position state and reward inspection lens |
| **`NARAPositionSaleV5`** | [`0x04Ac83045d26259D46400Ce6beb9bBd0641df225`](https://basescan.org/address/0x04Ac83045d26259D46400Ce6beb9bBd0641df225) | Built-in native-`ETH` secondary marketplace (`95%` seller / `5%` rewards) |
| **`NARASaleCreditLensV5`** | [`0x26b481f1545D9912D39693D7F8E589F82835e03d`](https://basescan.org/address/0x26b481f1545D9912D39693D7F8E589F82835e03d) | Constructor child of `NARAPositionSaleV5` computing claimable reward credits on listed NFTs |

### 4. Uniswap v4 Liquidity, Hook, Zero-Delay Fee Periphery & Range Manager (11 Contracts + Pool ID)

| Contract | Address | Role |
|---|---|---|
| **`NARALiquidityHookV5`** | [`0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC`](https://basescan.org/address/0x07d8F2Dfd121B10dE3176DeAb6A8C0eaa2646aCC) | Uniswap v4 Hook (`4.63%` base fee -> `20%` same-block burst curve) |
| **`NARAHookFeeCalculatorV5`** | [`0xeCc6bB347c615BD51E13dcAB670D0c34Df3375F8`](https://basescan.org/address/0xeCc6bB347c615BD51E13dcAB670D0c34Df3375F8) | Constructor child of `NARALiquidityHookV5` computing dynamic buy/sell fee tiers |
| **`NARAFeeVaultV5`** | [`0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf`](https://basescan.org/address/0xF1f361F803895BF5cf67eC6C506dbFEf2f6E88Cf) | Hook fee vault sealed to zero-delay `NARATreasuryFeeControllerV5` and `NARAFeeIngressBindingV5` (`holderFeeBps = 0` at launch, configurable up to `100%` to Engine rewards) |
| **`NARAFeeIngressBindingV5`** | [`0x17cc74317AD75a170887F9E76e5fF09f2058d4BF`](https://basescan.org/address/0x17cc74317AD75a170887F9E76e5fF09f2058d4BF) | Constructor child of `NARAFeeVaultV5` forwarding holder fee share into `NARARewardIngressV5` |
| **`NARATreasuryFeeControllerV5`** | [`0xB6A436b48222C94fe427ecAfB263DF9cf42646b9`](https://basescan.org/address/0xB6A436b48222C94fe427ecAfB263DF9cf42646b9) | Zero-delay (`0s`) fee withdrawal controller for `USDC` and `NARA` swap fees |
| **`NARAPoolOracleV5`** | [`0xBCF29E9E37E62FBB996D5FF890FEd5280fC02e1A`](https://basescan.org/address/0xBCF29E9E37E62FBB996D5FF890FEd5280fC02e1A) | Ring-buffer TWAP tick oracle for the canonical `USDC / NARA` Uniswap v4 pool |
| **`NARAPOLPositionV5`** | [`0x01EF9de9f4e9197F2A3944b5B34A90eA2f558b64`](https://basescan.org/address/0x01EF9de9f4e9197F2A3944b5B34A90eA2f558b64) | Deployed POL position contract (unbound / superseded by zero-delay `NARATreasuryFeeControllerV5`) |
| **`NARALiquiditySizerV5`** | [`0x46B486a300190df823C5f1E4D04c100813fB0843`](https://basescan.org/address/0x46B486a300190df823C5f1E4D04c100813fB0843) | Deployed POL sizing helper (unbound / superseded by zero-delay fee periphery) |
| **`NARACapitalBudgetV5`** | [`0x6f5f586Bd4F14e47F432264D88Fe9A6A6A80552B`](https://basescan.org/address/0x6f5f586Bd4F14e47F432264D88Fe9A6A6A80552B) | Deployed POL budget contract (`paused = true`; superseded by zero-delay fee periphery) |
| **`NARACapitalPolicyV5`** | [`0xC6b5471ADadcf66c2375EC8600bb7a3D85C73e45`](https://basescan.org/address/0xC6b5471ADadcf66c2375EC8600bb7a3D85C73e45) | Deployed POL compounding policy (unbound / superseded by zero-delay fee periphery) |
| **`NARATreasuryRangeManagerV5` (Active)** | [`0x221c625d2BC416460C397035C1286C1f4A4D3A7C`](https://basescan.org/address/0x221c625d2BC416460C397035C1286C1f4A4D3A7C) | Active-pool two-way range manager bound to `0x4a4752...` (pre-funded with `51.0149 NARA`) |
| **`NARATreasuryRangeManagerV5` (Legacy)** | [`0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288`](https://basescan.org/address/0xa72557fcBE56B3eC739dF3aF7b6b893B6Db4D288) | Legacy custody range manager holding `49,997 NARA` (`4.9997%`, 7-day withdrawal queued at `Safe Nonce 9`, `readyAt = 2026-11-14T14:27:48Z`) |
| **Canonical Pool ID** | `0x4a475299ef674bcc3d2c87c3917cfbecd38cf7237646a3553e37daba67da6e5f` | Uniswap v4 `NARA / USDC` pool (`tickSpacing = 60`, dynamic fee flag `0x800000`) |

### 5. Governance Multisigs (`2-of-3` Gnosis Safes)

| Safe | Address | Scope |
|---|---|---|
| **`Treasury Safe`** | [`0xe320C281c86079eA85f2Bc67864E873A61D551E3`](https://basescan.org/address/0xe320C281c86079eA85f2Bc67864E873A61D551E3) | Holds `3.0 NARA + 300.0 USDC` seed capital; bounded parameter governance on Hook, FeeVault, FeeController, and RangeManager |
| **`OA-3` VRF Governance Safe** | [`0x9d415e070AF8e93890dcCaE27755C66E3A313f0F`](https://basescan.org/address/0x9d415e070AF8e93890dcCaE27755C66E3A313f0F) | Bounded randomness adapter governance on `NARAForgeV5` (`governor`) |
| **`C1` Presentation Governor Safe** | [`0x0939BE9a5359764C2334a70A13eC567C7e38E017`](https://basescan.org/address/0x0939BE9a5359764C2334a70A13eC567C7e38E017) | Non-custodial visual metadata governance on `NARAPositionNFTV5` (`presentationGovernor`) |

---

## Retired Legacy V4 Contracts (Do Not Use)

All August 2026 V4 periphery contracts (`NARAEngine` `0x98ab6406D6B548F37dEF7110961bb45A399e5aFC`, `NARARewardReserve` `0x0443997E397c4397027622C9597126A5B5F58E3C`, `NARALiquidityGrowthHook` `0x59AEf97409B93B3D320569C4327e224B96F9eAC8`, `NARAPositionNFTV4` `0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC`, and old V4 pool `0x83edced1...`) are **permanently retired** and carry `0 NARA`. Only the V5 contracts listed above are active.
