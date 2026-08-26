# NARA-20260827 v4 Full-Inventory Compound

Status: `ACTIVATED_AND_RECONCILED`

This release records one controlled Base mainnet compound of the current NARA
v4 Liquidity Growth Vault inventory into the existing no-swap, full-range POL
position. It does not change contract code, addresses, keeper authority, the
epoch maintainer, or the liquidity-maintainer schedule.

## Immutable origin and bindings

- Repository: `NARAProtocol/nara_protocol_v4`
- Hosted workflow commit: `7b28d3a23123b5ee58f93e9c8cb34150adeb9d05`
- Chain ID: `8453`
- NARA: `0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1`
- Vault: `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`
- Compounder: `0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF`
- Compounder POL NFT: `2898486`
- Dedicated liquidity keeper: `0x0f8ADa55B394E58e9BC667c23a1EEcED12216272`

The hosted workflow hydrated the hash-pinned production manifest and verified
the deployed runtime before both simulation and execution.

## Funding evidence

The production treasury transferred `6,200 NARA` to the canonical Vault:

- Transaction: `0x6702a3618b0ec3e6ffea32e2881cd68b248c94c297e45b612d51ca2a6b7aa819`
- Block: `50,498,933`
- Block hash: `0x0984822e4a6d0a520acb0585a2cda59da2436ae8eb63fe87b88d3cd2acfc4810`
- Receipt status: `1`
- Sender: `0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e`
- Recipient: canonical Vault

Receipt-pinned post-transfer combined inventory was
`8,919.810447501972006667 NARA / 1,719.359614 USDC`.

## Controlled policy and dry run

The liquidity-maintainer gate was disabled before changing policy. The
temporary one-call caps were:

- `V4_COMPOUND_MAX_NARA_USED_RAW=8902298338519168324906`
- `V4_COMPOUND_MAX_USDC_USED_RAW=1719359614`
- `V4_COMPOUND_REFERENCE_SQRT_PRICE_X96=180279894519349802269293644387103182`

The reference is the receipt-pinned post-state of the final confirmed Matrix
buy at Base block `50,498,688`; it was not copied automatically from the
execution-time pool state. The existing `100 BPS` sqrt-price guard, `200 BPS`
reference-value imbalance cap, and `5 USDC` minimum were retained.

Hosted read-only run
[`33023940926`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/33023940926)
passed on commit `7b28d3a23123b5ee58f93e9c8cb34150adeb9d05` and reported:

- runtime and manifest verification: pass;
- current and independent reference sqrt price: exact match;
- simulated liquidity: `3912320569052471`;
- simulated USDC-side depth: `1719.359614 USDC`;
- blocked reason: none; and
- ready: true.

## Compound execution

The gate was opened only to start one manual execute run, then closed again
while that run was in flight. Hosted execute run
[`33024031184`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/33024031184)
completed successfully.

- Transaction: `0x855691363aaf930f418cf065a491653513a69f4bece0ec210d53bd92a4864583`
- Block: `50,499,085`
- Block hash: `0xafdfd1bc497f6f32224023b8e86a0de6dbb060534509ecdf5460ec3dc51b0c10`
- Receipt status: `1`
- Keeper nonce: `1`
- Gas used: `292425`
- Target: canonical Vault
- Liquidity added: `3912320569052471`

The Compounder event recorded:

- NARA used: `8891.386678206871411484`;
- USDC used: `1717.033154`;
- NARA banked afterward: `28.423769295100595183`; and
- USDC banked afterward: `2.326460`.

The Compounder POL position liquidity increased from `473995658948700` to
`4386316228001171`. Lifetime realized totals after execution were
`11764.639965826519127719 NARA`, `1797.139917 USDC`, and
`4386316228001171` liquidity. Vault balances were zero after execution.

The residual is not a cap or slippage failure. Increasing the existing v4
position realized accrued LP fee credit, and `SETTLE_PAIR` netted that credit
against tokens pulled from the Compounder. The call therefore used
`99.877428727982711174%` of the modeled NARA and
`99.864690319520323455%` of the combined USDC. The two-sided residual remains
banked for a future fee-triggered cycle.

## Post-state and restored routine policy

The temporary broad caps were removed while the liquidity-maintainer gate was
still disabled. Routine policy is now:

- maximum NARA per call: `500 NARA`;
- maximum USDC per call: `6 USDC`;
- independently pinned reference sqrt price:
  `180279894519349802269293644387103182`;
- sqrt-price guard: `100 BPS`;
- reference-value imbalance cap: `200 BPS`; and
- minimum simulated USDC-side depth: `5 USDC`.

Hosted post-state read-only run
[`33024200191`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/33024200191)
passed and reported zero Vault balances, the exact banked residual,
`ready=false`, and `Vault has no newly collected fees to trigger compounding`.
No post-state transaction was constructed. The normal liquidity-maintainer
gate was then restored to `true`; the epoch-maintainer configuration was never
changed.

The residual is below the active `5 USDC` threshold and should roll forward.
It requires both fresh Vault fees and a policy-compliant simulated depth before
the next compound transaction.
