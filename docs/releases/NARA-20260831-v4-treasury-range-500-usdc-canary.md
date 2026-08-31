# NARA v4 Treasury Range 500-USDC Canary

Evidence state: **SOURCE POLICY CANDIDATE / NOT FUNDED / NOT DEPLOYED / NOT SIGNED / NOT BROADCAST / NOT ACTIVATED**

Change ID: `NARA-20260831-v4-treasury-range-500-usdc-canary`

Origin remote: `https://github.com/NARAProtocol/nara_protocol_v4`

Protected source commit: pending protected merge and post-merge verification.

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

## Evidence status

| Gate | Current result |
|---|---|
| Exact dependency install | `npm ci` passed; lockfile unchanged |
| Focused planner/optimizer/simulator regressions | 18 passing locally |
| Complete Treasury Range Manager Hardhat suite | 72 passing locally |
| Treasury Range settler Node suite | 32 passing locally |
| Strict TypeScript | Changed-source/test target set and settler project passed; repository-wide target remains unsuitable because of pre-existing unrelated errors |
| Repository non-fork suite | 770 passing locally |
| Historical pinned fork | pending immutable source commit |
| Fresh pinned fork and 21-candidate matrix | pending immutable source commit |
| Build and bytecode | passed; manager runtime 23,620 bytes and initcode 28,095 bytes, within EVM limits |
| Slither | completed on all v4 targets; manager retained 17 previously triaged raw signals, exit zero |
| Aderyn / Echidna local | unavailable: Aderyn binary absent; configured WSL Echidna distro could not start; protected CI remains required |
| Dependency audit | production graph 0 vulnerabilities; development graph 8 low-severity `elliptic` advisories with no available fix |
| Independent review | adversarial PASS and architecture PASS after matrix-context hardening |
| Secret scan | focused changed-content patterns found 0; Gitleaks unavailable and not claimed |
| Protected PR and post-merge CI | pending |
| Production writes | none |

Counts above must be refreshed from final command output before this record is
used as release evidence.

The JSON matrix is commit- and state-bound release evidence, not a cryptographic
attestation by an external auditor. Protected immutable generation, CI, and
human review remain mandatory.

## Required sequence

1. Merge the source policy through the protected branch with green canonical
   CI and record the immutable verified commit.
2. From that exact clean commit, regenerate historical and fresh block-pinned
   A-H evidence for all 21 candidates. Record block/hash, matrix hash, strategy
   hash, selected ID, and funding status.
3. Stop if the exact evidence cannot validate the approved candidate or any
   bid-side settlement becomes a no-op.
4. Only after evidence is merged may a fresh unsigned deployment proposal be
   built. Treasury-to-Safe funding, Safe signing, deployment, order creation,
   settler activation, or broadcast each remain separate human approvals.
5. Keep the canary under monitored observation for at least 48 hours before
   considering any expansion.

No source merge, CI result, simulation, or unsigned packet moves funds.
