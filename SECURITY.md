# Security Policy

## Status

**Pre-launch — controlled Stage A core contracts are deployed on Base, but no
public market or app is live.** The Stage A liquidity hook, vault, and
compounder are quarantined and must not be used for launch; a corrected
replacement trio is still pending. The retired v3 stack and retired 2026-04-23
v4 incident stack are historical only. Canonical live state:
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

## Verification performed

| Gate | Result |
|------|--------|
| Hardhat test suite | **468 passing, 0 failing** on 2026-07-29 |
| Real Uniswap v4 regression | Actual `PoolManager` same-block split tests passed |
| Slither | Current v4 target list completed with exit 0 on 2026-07-29; raw heuristic alerts are classified in `docs/CURRENT_STATE.md` |
| Bytecode size | All deployable artifacts within EVM limits on 2026-07-29 |
| Echidna | **13/13 passing**, 10,004 calls on 2026-06-08; historical, not a current-patch run |
| Aderyn | Last completed 2026-06-08; current-patch rerun did not execute because the binary is unavailable |

Run them yourself — see the README "Build & test" and "Security" sections. Test counts drift; the live
number is `npx hardhat test`.

No independent audit is claimed. Automated and internal review cannot prove
the absence of defects or replace the remaining deployment, fork-rehearsal,
live-read, and smoke-test gates.

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
