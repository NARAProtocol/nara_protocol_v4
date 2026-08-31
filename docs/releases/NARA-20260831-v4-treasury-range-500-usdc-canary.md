# NARA v4 Treasury Range 500-USDC Canary

Evidence state: **PROTECTED SOURCE + HISTORICAL/FRESH EXACT FORK PASS / NOT FUNDED / NOT DEPLOYED / NOT SIGNED / NOT BROADCAST / NOT ACTIVATED**

Change ID: `NARA-20260831-v4-treasury-range-500-usdc-canary`

Origin remote: `https://github.com/NARAProtocol/nara_protocol_v4`

Protected PR #59 merged the source policy as GitHub-verified commit
`5a6b449df7d50b25d71715b3bbedc720ef6960ee`. All PR and post-merge NARA CI and
CodeQL gates passed. This is immutable source/evidence authority, not deployment
or transaction authority.

This release changes only planner, optimizer, evidence, manifest-ingestion,
packet-builder gates, regressions, and documentation for a smaller first
Treasury Range Manager canary. It does not modify the manager contract,
permanent POL, Hook, Vault, Compounder, existing keepers, production roles, or
deployment manifests.

## Exact capital policy

| Item | Exact limit |
|---|---:|
| Approved candidate | `CONSERVATIVE-100000-NARA` |
| NARA allocated to eight sell ranges | 100,000 NARA |
| Total Safe USDC required | 500 USDC |
| USDC exposed across four buy ranges | 200 USDC (`40 / 50 / 50 / 60`) |
| USDC protected in the Safe | 300 USDC |

This is not a $500-total position. The market value of the 100,000 NARA is
additional and changes with spot. The strategy is a bounded canary, not a
profit guarantee, managed-investment promise, or claim of maximum return.

## Fail-closed launch gates

- All 21 profile/budget candidates and every exact 30-row adversarial matrix
  remain required. External attack sizes are intentionally not reduced with
  the Treasury USDC budget.
- Only `CONSERVATIVE-100000-NARA` may pass optimizer selection or launch packet
  ingestion. Other candidates remain comparative evidence only.
- `nara.v4.treasury-range-matrix-row.v3` binds every row to the exact
  repository commit, block/hash, pinned `sqrtPriceX96`, tick, Hook-configuration
  hash, and exact human-price rational. Packet construction verifies the pinned
  block's RPC timestamp and rejects stale or forged snapshot metadata.
- Manifest ingestion reconstructs the canonical profile from pinned slot0 and
  requires exactly 12 raw orders, in canonical order, all enabled, with no
  predeployment order ID.
  It compares each human range, side, ticks, raw input, expected output,
  minimum, liquidity, dust, and tolerance.
- Retired 5,000-USDC change IDs, a non-500 total, a non-200/300 split, a
  different NARA budget, or a changed per-order allocation fail closed.
- Order construction requires the production Safe itself to hold at least
  100,000 NARA and the full 500 USDC. Funding only the exposed 200 USDC is not
  sufficient because the 300-USDC protected reserve must remain in Safe
  custody.
- Bid-side fork evidence must prove at least one crossed bid, an executed
  settlement, and positive NARA returned to the Safe for every candidate. A
  no-op `not_applicable` row is invalid.
- The predeployment builder rejects strategy manifests that claim an existing
  manager address, runtime hash, or deployment receipt. Because the deployment
  deadline is a JIT immutable, the exact runtime hash is derived from freshly
  rebuilt initcode and constructor simulation and recorded in the unsigned
  proposal; receipt-pinned postdeployment checks remain mandatory.

## Evidence status

| Gate | Current result |
|---|---|
| Exact dependency install | `npm ci` passed; lockfile unchanged |
| Focused planner/optimizer/simulator regressions | 18 passing locally |
| Complete Treasury Range Manager Hardhat suite | 72 passing locally |
| Treasury Range settler Node suite | 32 passing locally |
| Strict TypeScript | Changed-source/test target set and settler project passed; repository-wide target remains unsuitable because of pre-existing unrelated errors |
| Repository non-fork suite | 770 passing locally |
| Historical pinned fork | 4/4 passed at Base block `50537172`; all 21 candidates and exact 30-row matrices completed |
| Fresh pinned fork and 21-candidate matrix | 4/4 passed at Base block `50684125`; all 21 candidates and exact 30-row matrices completed |
| Build and bytecode | passed; manager runtime 23,620 bytes and initcode 28,095 bytes, within EVM limits |
| Slither | completed on all v4 targets; manager retained 17 previously triaged raw signals, exit zero |
| Aderyn / Echidna | unavailable locally; both passed on PR and post-merge protected CI |
| Dependency audit | production graph 0 vulnerabilities; development graph 8 low-severity `elliptic` advisories with no available fix |
| Independent review | adversarial PASS and architecture PASS after matrix-context hardening |
| Secret scan | focused changed-content patterns found 0; Gitleaks unavailable and not claimed |
| Protected PR and post-merge CI | PR #59 merged; build/test/size, Slither, Aderyn, Echidna, and CodeQL passed before and after merge |
| Production writes | none |

Counts above must be refreshed from final command output before this record is
used as release evidence.

The JSON matrix is commit- and state-bound release evidence, not a cryptographic
attestation by an external auditor. Protected immutable generation, CI, and
human review remain mandatory.

## Immutable fork evidence

Both fork runs bind repository head
`5a6b449df7d50b25d71715b3bbedc720ef6960ee`, contain 21 candidate metrics and
30 rows in the selected manifest, select only `CONSERVATIVE-100000-NARA`, and
report `SELECTED_EXECUTION_BLOCKED` with `noBroadcast=true`.

| Evidence | Historical | Fresh |
|---|---|---|
| Base block | `50537172` | `50684125` |
| Block hash | `0x6e896c222c2b8313fc232d174136d58212835c39a06378f2dbf2b73c0101b7d9` | `0x28f44a3133b35ecca81ca21ed3fdd98af739a5a904e407a775fa1d8602d1354b` |
| Matrix artifact SHA-256 | `3871738b18513a362c9528cc4542a30c555fae0952a8b36ff035e7ff4f63252b` | `8b79d8019883d219968871fc32a61946725e5a6fcde839cae6742d0cf94e21d3` |
| Strategy artifact SHA-256 | `8c1e8476c0251e44a6bcbfa6507927e3792e39e2ff84ac168108f6c259b1629d` | `feaa6bded5ecbc5cba8e072d95381523fc3b7cc019c20953317daf48ef69d4af` |
| Strategy hash | `0x6d0030906ec762965fd8fda5a8e3add9f723b1ae83cec8a0ec931ea0e108950d` | `0x721ae0b76a8653667b9dfa868de44bcc12527889e819aa3e921d7b8dc8d2e7f5` |

The ignored local JSON artifacts are reproducible from the exact protected
commit, pinned block, and test command. They contain no signing material and are
not Safe-import files.

## Required sequence

1. Completed: source policy merged through protected PR #59 with green
   canonical CI at the verified commit above.
2. Completed: historical and fresh block-pinned A-H evidence for all 21
   candidates was regenerated from that exact clean commit and recorded above.
3. Confirmed: exact evidence validates only the approved candidate and every
   candidate includes successful bid-side settlement evidence.
4. Only after this evidence record is merged may a fresh unsigned deployment proposal be
   built. Treasury-to-Safe funding, Safe signing, deployment, order creation,
   settler activation, or broadcast each remain separate human approvals.
5. Keep the canary under monitored observation for at least 48 hours before
   considering any expansion.

No source merge, CI result, simulation, or unsigned packet moves funds.
