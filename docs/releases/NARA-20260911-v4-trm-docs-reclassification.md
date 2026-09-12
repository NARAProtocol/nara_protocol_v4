# NARA-20260911-v4-trm-docs-reclassification

Docs-only CURRENT_STATE / PKB lag repair for Treasury Range Manager. **Not** a deploy. **Not** availability. Humans merge.

```text
Change-ID: NARA-20260911-v4-trm-docs-reclassification
Date: 2026-09-11
Owner (engineering): NARA Protocol Architect (exact prose)
Release desk: NARA Release & Infrastructure
Origin remote: https://github.com/NARAProtocol/nara_protocol_v4.git
Origin branch: docs/NARA-20260911-v4-trm-docs-reclassification (isolated from origin/main 005a685a7953d0eba17c2e50d4cf8866a4477a83)
Origin commit (full 40-char, protected default branch only for `merged`): pending human merge
Evidence state: implemented (docs); tested: n/a code; merged: no; deployed: n/a this change; available: NO
Work state: partial (branch prepared; PR blocked if Cloud Agents / remote auth fail)
User availability: unavailable

Objective: Reclassify TRM from CURRENT_STATE 2026-08-31 "merged, not deployed" to CONFIRMED LIVE technical testing using Architect-locked prose. Repair PKB §5.1 the same way. Do not invent a TRM deployment manifest. Do not re-pin ROADMAPCHECK (separate later PR).
Architect spec / Founder-accepted equivalent: /workspace/week2-docs-spec/CURRENT_STATE-TRM-section.md and PKB-5.1.md (Orchestrator Week 2; Founder merge gate).
Address generation used: v4 canonical
Addresses used (from verified manifest or named-block query only):
- TRM 0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C (tx 0xa657e0be76f040195fddb791e030b2fa0275f6ed989e2c17e2d1256bb95cb869, Base block 50736510)
- Protocol Safe 0xd65c0e390Dc187A22c52c03816591CC736C0D755
- CREATE2 deployer 0xDE9E3Cac08b7a31Db18c7432d4C45DF4584Fd646
- Dedicated TR Safe 0x5050BC6dc3E07313D52D05cecD53f727D6CDa245 (R2 OPEN HIGH)
- Position NFT Phase2 authority 0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC
- 0x01D3AC0acda01FE5D6788fA0B4062de94C8DE52b labelled CONFLICTING / non-Phase2; not promoted

Tests run: none (docs-only; no contract/test change)
Security status: pending (asset-adjacent docs)
QA status: pending (must keep available = NO)
UX / Legal-Comms: n/a for this pack (no public GA language)

Changed contracts/interfaces: none
Generated artifact or ABI source (origin commit): unchanged
Deployment manifest: none invented; cite tx/block/runtime keccak256 0xbd53ab49bd70983a352c5fc3c638f8df2d527e42011671218461aa5fb5b83a09
Chain / chainId / verification block / tx: Base 8453 / 50736510 / 0xa657e0be76f040195fddb791e030b2fa0275f6ed989e2c17e2d1256bb95cb869
Runtime code hash / roles / bindings read-back: keccak256 0xbd53ab49…3a09 (QA eth_getCode); 23620 bytes

Depends-on: Architect Week 2 spec; QA independent TRM verify
Unblocks: CURRENT_STATE/PKB lag vs chain; CANONICAL_PRODUCT_STATE company-memory patch (separate tree)
Downstream repositories reviewed: protocol origin only this PR; public docs / ROADMAPCHECK re-pin NOT in this change
Roadmap items reviewed: TRM deploy state only
Roadmap-to-evidence result: not re-run / not re-pinned (separate later PR; known linear tip drift a776d978 → 005a685a)

Commands and results: isolated worktree from origin/main 005a685a; dirty feat/landing-branding-assets not used
Skipped gates: ROADMAPCHECK re-pin (explicit later PR)
Unresolved risks: R2 1-of-1 TR Safe OPEN HIGH; canary funding CONFLICTING (~12183 NARA / ~1335 USDC vs 100000 NARA + 500 USDC); no sanitized TRM manifest
Onchain or production writes: none
Secret scan: docs/markdown only; no env/keys

Founder approval: pending (merge gate)
Post-deploy verification: n/a (docs)

Rollback / containment:
- Trigger: Founder/Security/QA reject classification or tx/block facts fail independent re-read
- Immediate containment: revert this docs branch; do not publish GA; leave chain untouched
- Rollback path: git revert of this docs commit on protected main after merge, or drop the unmerged branch
- What is NOT rolled back: on-chain TRM, dedicated Safe, POL (Hook/Vault/Compounder)
- Who can execute rollback: human merge / human revert only
```

## Files

| Path | Action |
|---|---|
| `docs/CURRENT_STATE.md` | Date 2026-09-11; TRM header → DEPLOYED (technical testing); historical lineage retained; strike present-tense undeployed; Phase-2 CcBD authority + 01D3 CONFLICTING note |
| `docs/PROJECT_KNOWLEDGE_BASE.md` | §5.1 Architect prose; historical candidate notes retained; strike "remains unfunded and undeployed" |
| `docs/releases/NARA-20260911-v4-trm-docs-reclassification.md` | This pack |

Not in this protocol PR: `CANONICAL_PRODUCT_STATE.md` (company-memory branch `nara/company-memory-week1` until a remote exists). Grid rebind 01D3→CcBD smoke PLAN is **not executed** here.

## Locked classifications (do not upgrade)

- TRM: CONFIRMED LIVE technical testing; **available = NO**
- Canary funding: **CONFLICTING**
- Position NFT authority: CcBD; 01D3 not promoted
- R2: OPEN HIGH
