# Security Policy

## Status

**Pre-launch — no v4 contracts are deployed to mainnet.** The retired v3 stack and the retired
2026-04-23 v4 incident stack are historical only; never integrate against them. Canonical live state:
[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md).

## Security model

- **Sealed reserves.** The reward reserve and bond inventory are sealed — the admin cannot sweep them;
  only the engine can pull from the reserve.
- **Fixed supply.** `NARAToken` mints exactly 1,000,000 once and never again.
- **Bounded admin.** Every `onlyOwner` setter has a hard-coded min/max cap, so even a compromised owner
  key cannot move parameters outside safe bounds.
- **Liveness with explicit failure.** JIT epoch advance is capped (`MAX_JIT_ADVANCE = 8`); beyond that,
  user writes revert `EpochStale` rather than silently mis-settling.
- **Role-gated reward rails.** Only `REWARD_NOTIFIER_ROLE` can route ERC-20 rewards; direct ETH
  transfers to the engine are rejected (`DirectEthTransferForbidden`).
- **Custody isolation.** Each position NFT is backed by its own minimal-clone account; the fee/vault
  paths can route value but cannot touch user principal.

## Verification performed (last verified 2026-06-08)

| Gate | Result |
|------|--------|
| Hardhat test suite | **360 passing**, 0 failing, 0 skipped |
| Echidna invariants | **13/13 passing**, 10,004 calls |
| Slither | clean of new issues |
| Aderyn | 4 High / 18 Low (heuristic; Highs in bond/router/fractional, none in core) |
| Bytecode size | all deployable artifacts within EVM limits |

Run them yourself — see the README "Build & test" and "Security" sections. Test counts drift; the live
number is `npx hardhat test`.

A multi-lens internal audit (architecture / economics / UX) rated the system **~8.4–8.5/10** with **no
catastrophic design flaw**; the dominant risk is operational ("correct code, misoperated system"), not
contract logic. **Automated analysis is necessary but not sufficient** — an independent human /
competitive review is planned before mainnet value, and a bug-bounty program will be announced ahead of
launch.

## Reporting a vulnerability

Report security issues **privately** — do not open a public issue for an exploitable bug.

- Email: **security@naraprotocol.pro**
- Include: affected contract + line, description, and a reproducing transaction sequence if possible.

We aim to acknowledge within 72 hours.

## Links

- Website: **https://naraprotocol.pro**
- Farcaster: **@naraprotocol**
- X / Twitter: **[@NARA_protocol](https://x.com/NARA_protocol)**
- Security contact: **security@naraprotocol.pro**

## Scope

In scope: all contracts under [`contracts/v4/`](contracts/v4/). Out of scope: anything under
`archive/` (retired v3 — not deployed) and the frontends (separate repos).
