# NARA v4 Liquidity Maintainer Activation

Change ID: `NARA-20260815-v4-liquidity-maintainer-activation`

Date: 2026-08-15

Network: Base (`8453`)

## Outcome

The dedicated v4 liquidity maintainer is active on the guarded GitHub Actions
schedule at minutes `17,47` UTC. Both repository gates
`V4_OPERATIONS_KEEPER_ENABLED` and `V4_LIQUIDITY_MAINTAINER_ENABLED` are
`true`. The separate epoch-maintainer workflow remains independently active
under its own enable variable, keeper, schedule, and heartbeat; this liquidity
activation did not change that authority.

The liquidity keeper is the gas-only EOA
`0x0f8ADa55B394E58e9BC667c23a1EEcED12216272`. It is authorized only through
the current production Vault's `compoundKeeper` mapping and is not the Safe,
the epoch keeper, or a protocol administrator.

This is a bounded operational activation record. It is not an independent
audit or a whole-stack production-readiness claim.

## Keeper authorization correction

A stale local Safe batch with the same generated filename as the current batch
was imported first. Safe transaction
`0x28e7d6bf0a4774a4dc6f92608dd2488cede28c53dc5220ee5da1bf6001e14614`
authorized the retired keeper on the retired 2026-07-30 Vault. It did not grant
authority over the current production Vault.

The next atomic Safe transaction,
`0xcb829ed9109a7addcc36a7dc29c48266d6cb09fe8172b09f1392d558c7cce666`,
revoked that retired authorization and authorized the new keeper on the current
Vault `0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D`. Receipt readback confirmed:

```text
retired Vault / retired keeper: false
current Vault / new keeper:     true
```

The stale local batch was renamed with a `QUARANTINED-RETIRED` prefix. The
hosted workflow does not consume local generated Safe batches: it hydrates the
hash-pinned production manifest and verifies deployed runtime code before every
cycle. PR #27 also removed empty GitHub-variable deployment overrides that
could otherwise shadow the hydrated manifest.

## Active policy

| Control | Value |
|---|---:|
| Minimum simulated USDC-side depth | `5 USDC` |
| Maximum NARA used per call | `500 NARA` |
| Maximum USDC used per call | `6 USDC` |
| Fixed reference `sqrtPriceX96` | `690742494417252470482524971956672619` |
| Sqrt-price guard | `100 BPS` |
| Reference-value imbalance cap | `200 BPS` |
| Schedule | `17,47 * * * *` UTC |
| Heartbeat | required in execute mode |

The fixed reference came from the receipt-pinned endpoints of transaction
`0x1bca081564e6874f84b082eecfcaf3cbef15fb7bfad05fc394124ef64988c30b`,
as documented in the preparation release. The workflow does not replace this
reference with the current pool price. A future price-band failure requires an
explicit reviewed policy update; it must not be bypassed automatically.

## Hosted preflight and controlled execution

Protected PRs #26 and #27 merged the inventory, heartbeat, schedule, runtime
guard, and manifest-hydration changes. Hosted read-only run
[`31886696484`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/31886696484)
verified the pinned runtime at Base block `50005232`, then reported at block
`50005234`:

```text
keeperAllowed:                  true
vault balances:                 0 NARA / 6.75 USDC
compounder banked balances:     1718.586695052747189931 NARA / 24.518753 USDC
simulated liquidity:            51954836275387
simulated USDC-side depth:      6 USDC
threshold decision:             ready
```

No transaction step was reachable in that run.

Controlled execute run
[`31886879730`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/31886879730)
submitted exactly one transaction:

`0x0d5c4deb1448855391be29b488c5435cba2f23b1afaf924782c480e8bfe579de`

Independent RPC receipt verification found status `1` at Base block `50005313`,
from the configured keeper to the current production Vault, keeper nonce `0`,
with `277222` gas used.

| Accounting field | Before | After | Change |
|---|---:|---:|---:|
| Position liquidity | `9455824137787` | `61410660413174` | `+51954836275387` |
| Total NARA added | `99.999999999997037752` | `549.884168733497874147` | `+449.884168733500836395` |
| Total USDC added | `0.894127` | `6.893532` | `+5.999405` |
| Banked NARA | `1718.586695052747189931` | `1268.702526319246353536` | `-449.884168733500836395` |
| Banked USDC | `24.518753` | `25.269348` | `+0.750595` |
| Vault NARA / USDC | `0 / 6.75` | `0 / 0` | Vault inventory transferred |

LP NFT `2898486` remained owned by the Compounder, and its live position
liquidity matched `61410660413174`. The amount-use caps were respected. The
Compounder performed no swap; unmatched inventory remained banked.

## Empty-Vault idle regression and rollback

The first post-transaction read exposed a liveness bug: the maintainer counted
banked two-sided Compounder inventory but attempted `compoundAll()` even though
the Vault had no fresh token balance. The Vault correctly reverted with
`ZeroValue()`. The workflow was disabled and both enable variables were set
back to `false` before the next scheduled minute.

PR #28 added the missing fresh-Vault trigger gate and regression coverage.
Local live read-only verification at block `50005450` then returned:

```text
blockedReason: Vault has no newly collected fees to trigger compounding
ready:         false
vault:         0 NARA / 0 USDC
```

After protected CI and merge, hosted execute-mode run
[`31887339426`](https://github.com/NARAProtocol/nara_protocol_v4/actions/runs/31887339426)
reported the same idle state, printed `No compound transaction required`, and
completed the required heartbeat POST. A non-2xx heartbeat response would have
failed the run. Independent RPC readback confirmed the keeper nonce remained
`1`, proving the idle cycle submitted no second transaction.

The workflow was then left `active` with both enable variables `true`.

## Verification

```text
npm run test:ops      PASS - 39 passing
npm run build         PASS
PR #28 required CI    PASS - build/test/size, CodeQL, Slither, Aderyn, Echidna
git diff --check      PASS
```

Current operational authority is this record together with
`deployments/v4-production-activation-2026-08-09.json`,
`deployments/v4-compounder-activation-2026-08-09.json`, and
`docs/NARA_V4_LIQUIDITY_MAINTENANCE_RUNBOOK.md`.
