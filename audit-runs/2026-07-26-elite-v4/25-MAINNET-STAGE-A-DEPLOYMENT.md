# NARA v4 Base Mainnet — Controlled Stage A Deployment

Date: 2026-07-26

Chain: Base mainnet (`8453`)

Release: `3215b69a1154b9c30957cd8d875b636dedc9d0ca` / `nara-v4-launch-rc3-2026-07-26`

## Result

The fresh NARA v4 core was deployed and its administrative control was handed
off from the deployer. The NARA/USDC pool configuration is registered in the
hook, but the Uniswap v4 pool is deliberately uninitialized and has no
liquidity. This is a production deployment, not a public market activation.

## Canonical addresses

| Component | Address |
|---|---|
| NARAToken | `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A` |
| NARAEngine | `0xbC2492BA73dE35d1114b5c18d7db633aca8963c9` |
| NARARewardReserve | `0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD` |
| Liquidity Growth Vault | `0xc0cf9bCf8879182368b1CdBDC81B6a143fFA2988` |
| Liquidity Growth Hook | `0x9a01c2DcF713cDB12B8ef4Eb264D5c3203b06088` |
| CREATE2 Hook Deployer | `0xC045644303E43cbb1E3c3E3fC851246F5c590834` |
| Launcher | `0x90505C8c382519B168C6ab773Ed15D5ac99c9956` |
| Final admin | `0xC019Dc79412c4b20103ac4ce97B2615FF45D490d` |
| Treasury | `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e` |

Pool ID: `0xbb3287f32b95e96301c9582e8bf7e81fa362e4b9eea00cf016c537cf5970dff3`

## Verified on-chain invariants

- Token metadata is `NARA Token` / `NARA`.
- Total supply is exactly `1,000,000 NARA`.
- Treasury holds `350,000 NARA`.
- Sealed reward reserve holds `650,000 NARA`.
- Token flash-fee sink is the new engine.
- Engine token, treasury, and reward-reserve bindings match the addresses above.
- Hook token/base/vault bindings and vault hook/engine bindings match.
- Pool registration is true with configured depths of `30 NARA` and `300 USDC`.
- PoolManager slot-zero price is zero; the pool is not initialized.
- No LP position or public liquidity exists.
- Engine administrator, parameter, treasury, and notifier roles are held by the
  final admin and no longer held by the deployer.
- Reward-reserve administrator roles are held by the final admin and no longer
  held by the deployer.
- Hook, vault, and CREATE2 deployer ownership belongs to the final admin.

## Explorer status

- Launcher and token source verified on BaseScan, Blockscout, and Sourcify.
- Engine, reward reserve, liquidity vault, CREATE2 deployer, and hook source
  verified on BaseScan.

## Activation status

**Stage A complete. Public activation is not approved yet.**

Before initializing or funding the pool, create the canonical integration
configuration, run the fresh-address preflight, confirm admin-wallet recovery,
and execute the liquidity-seeding review.
