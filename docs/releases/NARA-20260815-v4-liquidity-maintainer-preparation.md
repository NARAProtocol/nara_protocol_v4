# NARA v4 Liquidity Maintainer Preparation

Change ID: `NARA-20260815-v4-liquidity-maintainer-preparation`

Date: 2026-08-15

Network: Base (`8453`)

## Outcome

Recurring liquidity maintenance remains disabled. This change prepares the
existing maintainer for a separately authorized activation; it does not
authorize a keeper, set a secret, enable a repository variable, enable the
GitHub workflow, or submit an onchain transaction.

The deployment-specific review found two blockers that made the dormant
workflow unsuitable for activation:

1. the offchain readiness gate required both NARA and USDC to be held by the
   Vault, even though the deployed Compounder intentionally combines new Vault
   fees with its previously banked balances; and
2. scheduled idle cycles did not ping the heartbeat, so a healthy no-op cycle
   would appear indistinguishable from a dead scheduler.

The maintainer now checks the combined Vault plus Compounder inventory and
heartbeats both successful compounding and healthy idle cycles. The workflow
hydrates the hash-pinned production manifest, verifies deployed runtime hashes,
requires explicit independent-price and per-token caps, and exposes a guarded
twice-hourly schedule at minutes `17,47`. Scheduled or manual execution remains
blocked unless both repository enable variables are `true`.

## Read-only live preflight

The prior 2026-08-09 reference was rejected as stale before simulation. At Base
block `50003403`, current `sqrtPriceX96` was outside its fixed `+/-1%` band.
The maintainer did not substitute current pool spot for that reference.

A fresh bounded test policy was then selected from the receipt-pinned endpoints
of the user's last confirmed `7 USDC` buy:

| Evidence | Value |
|---|---:|
| Transaction | `0x1bca081564e6874f84b082eecfcaf3cbef15fb7bfad05fc394124ef64988c30b` |
| Pre-transaction block | `50002812` |
| Pre-transaction `sqrtPriceX96` | `695437286863433285232730304350815742` |
| Receipt block | `50002813` |
| Post-transaction `sqrtPriceX96` | `686047701971071655732319639562529497` |
| Fixed midpoint reference | `690742494417252470482524971956672619` |
| Sqrt-price guard | `100 BPS` |
| Reference-value imbalance cap | `200 BPS` |
| Maximum NARA used | `500 NARA` |
| Maximum USDC used | `6 USDC` |
| Minimum simulated USDC-side depth | `5 USDC` |

At block `50003678`, the corrected read-only maintainer reported:

```text
compounderFrozen:                 true
vault balances:                  0 NARA / 6.75 USDC
compounder banked balances:      1718.586695052747189931 NARA / 24.518753 USDC
simulated liquidity:             51954836275387
simulated USDC-side depth:       6 USDC
threshold decision:              ready
```

The simulation used the Safe as its read-only caller because no dedicated
compound keeper is authorized. It signed and submitted nothing.

## Credential and authorization boundary

The epoch keeper cannot be reused. It is already an active, previously used
account and is not authorized by `vault.compoundKeeper`. The liquidity runbook
requires a separate unused gas-only EOA with no Safe ownership or Engine roles.
Local candidate keys were checked only by deriving their public addresses in
memory. No private key value was printed, copied, written to disk, or sent to an
external service during this preparation.

Activation still requires, in order:

1. create a separate unused gas-only EOA and retain its key outside the repo;
2. build, sign, execute, and receipt-verify the Safe keeper-authorization call;
3. fund only enough Base ETH for bounded maintenance;
4. configure a dedicated heartbeat and the GitHub secret/variables;
5. merge this change through protected CI;
6. enable the workflow and both execution variables;
7. run one manual read-only cycle, then one manual execution cycle; and
8. reconcile the receipt, Compounder-owned LP liquidity, token-use caps, Vault
   balances, banked balances, and heartbeat before leaving the schedule active.

## Verification

```text
npm run test:ops      PASS - 39 passing
npm run build         PASS
npm run test:nonfork  PASS - 565 passing
git diff --check      PASS
```

This is operational preparation and test evidence, not an independent security
audit or a claim of whole-stack production readiness.
