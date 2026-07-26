# NARA Token Identity

Status: frozen for the fresh v4 launch.

## Canonical identity

| Field | Value |
|---|---|
| Protocol brand | NARA Protocol |
| ERC-20 name | `NARA Token` |
| ERC-20 symbol | `NARA` |
| Public ticker notation | `$NARA` |
| Decimals | `18` |
| Fixed supply | `1,000,000 NARA` |
| Network | Base |

The dollar sign is presentation syntax and is not part of the ERC-20 symbol.
Contracts, trading pairs, balances, environment variables, and technical
documentation use `NARA`. Public market-oriented copy may use `$NARA`.

## Canonical-address rule

Name and symbol are not unique identifiers. The fresh v4 contract address is
the canonical token identity. Both earlier Base deployments remain retired and
must never be used as fallbacks:

- v3 token: `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C`
- retired incident-stack v4 token:
  `0x58c209B95350aFBEFa17137CEd209f8c4b7D896D`

The fresh address must be recorded in `docs/CURRENT_STATE.md`, deployment
manifests, the monitor, baskets, and every application before public use.

## Deployment enforcement

The production deployment script accepts only:

```text
V4_TOKEN_NAME=NARA Token
V4_TOKEN_SYMBOL=NARA
```

Any alternative metadata fails before a transaction is sent. The generic
Solidity constructor remains parameterized so its previously reviewed token
logic and launcher interface do not change.
