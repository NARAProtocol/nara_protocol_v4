# NARA Identity

Status: frozen for the fresh v4 launch.

## Canonical identity

| Field | Value |
|---|---|
| Public brand | `NARA` |
| ERC-20 name | `NARA` |
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
the canonical token identity:

- fresh v4 token: `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1`;
- immutable origin commit:
  `027af3f06bbe6dea2c187dfd8062e50c228f1c35`; and
- manifest: `deployments/v4-base-usdc-latest.json`.

Earlier Base deployments remain retired and
must never be used as fallbacks:

- v3 token: `0xE444de61752bD13D1D37Ee59c31ef4e489bd727C`
- retired incident-stack v4 token:
  `0x58c209B95350aFBEFa17137CEd209f8c4b7D896D`
- retired controlled Stage A token:
  `0x65E247AA3aa9C0131b2984b894c3D24c41341D7A`

The fresh address is recorded in `docs/CURRENT_STATE.md` and the protocol
deployment manifests. Each downstream consumer must trace its configuration to
an immutable handoff and exact protocol origin; no planned, local, or
conversation-derived address may replace it.

## Deployment enforcement

The production deployment script accepts only:

```text
V4_TOKEN_NAME=NARA
V4_TOKEN_SYMBOL=NARA
```

`$NARA` is presentation notation only. Contracts, ABIs, typed-data clients,
environment-variable names, and token-list data use the raw `NARA` symbol.

Any alternative metadata fails before a transaction is sent. The generic
Solidity constructor remains parameterized so its previously reviewed token
logic and launcher interface do not change.
