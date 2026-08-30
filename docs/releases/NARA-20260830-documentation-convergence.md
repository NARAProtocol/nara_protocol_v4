# NARA-20260830 Documentation Convergence

Status: `DOCUMENTATION_ONLY_CANDIDATE`

Change ID: `NARA-20260830-documentation-convergence`

This release record aligns the authoritative protocol documentation with the
verified fresh-v4 manifests and dated operational evidence. It changes no
contract source, ABI, deployment address, keeper authority, configuration,
liquidity, or onchain state.

## Immutable evidence boundary

- Producer repository: `NARAProtocol/nara_protocol_v4`
- Documentation branch base: `35091010de09802f39ccda7e726ff8c4b240e165`
- Deployed-contract origin:
  `027af3f06bbe6dea2c187dfd8062e50c228f1c35`
- Core activation manifest:
  `deployments/v4-production-activation-2026-08-09.json`
- Position NFT final manifest:
  `deployments/v4-position-nft-phase2-finalized-2026-08-21.json`
- Latest reconciled POL record:
  `docs/releases/NARA-20260827-v4-full-inventory-compound.md`

The canonical Base NARA token is
`0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1`. The earlier `0x65E...`
controlled Stage A token remains historical incident/recovery evidence only
and must not be used by consumers.

## State language fixed

- The canonical contracts and NARA/USDC pool are described as technical live
  testing with real assets, not as universal product availability.
- The seven-contract Position NFT Phase-2 baseline is described as deployed,
  tested under its recorded release gates, source-verified, and Safe-finalized.
- Position NFT consumer integration remains disabled while the canonical
  manifest says `integrationReady: false`; Safe finalization alone is not
  consumer activation.
- Epoch and liquidity maintainers are described using their current separate
  schedules, credentials, and bounded policies.
- The current Compounder POL position and latest banked inventory are sourced
  from the 2026-08-27 receipt-pinned compound record.
- Undeployed router/lens, bond, Genesis, baskets, and composability surfaces are
  not presented as currently available.
- The Treasury Range Manager is an implemented/tested and internally reviewed
  candidate only; it is not funded, deployed, activated, independently
  externally audited, or part of permanent POL.

## Communication and legal boundary

Public-facing language must remain factual, balanced, and non-promotional. This
repository contains no evidence of completed jurisdiction-specific qualified
legal review. No document in this change is legal advice, an approval, an
invitation, an inducement, a suitability assessment, or a recommendation to
acquire, hold, sell, lock, stake, or provide liquidity for NARA.

Any public consumer activation or marketing requires written review by
qualified counsel for the relevant entity, jurisdictions, audience,
distribution route, disclosures, and complete user journey. Technical
deployment, testing, source verification, or internal review does not satisfy
that legal gate.

## Verification performed

- `npm run test:ops`: 55 passing.
- `npm run test:nonfork`: 759 passing.
- `npm run build`: passed.
- `npm run size`: passed; all deployable artifacts within EVM size limits.
- `node scripts/checkPublicRepo.mjs`: passed; local Markdown links, JSON, and
  repository secret patterns checked across the final repository tree.
- `npm audit --audit-level=high`: no high-severity findings; eight low-severity
  transitive `ethers` v5/`elliptic` findings remain with no available upstream
  fix.
- `git diff --check`: passed before final commit.

These gates support documentation correctness and regression confidence. They
do not constitute an overall independent protocol audit or a legal opinion.

## Downstream handoff

After this candidate is merged through protected CI, downstream repositories
must pin the full merge commit and update in this order:

1. `NARAProtocol/nara_protocol_v4_baskets`;
2. `NARAProtocol/nara-swarm-monitor`;
3. `NARAProtocol/nara_protocol` public documentation last.

Each consumer must preserve the active `0xB633...` token and canonical pool,
the technical-live-testing warning, the Position NFT `integrationReady: false`
gate, and the legal-review limitation. No downstream update may infer public
availability from deployment or testing alone.

Final acceptance remains with a human maintainer.
