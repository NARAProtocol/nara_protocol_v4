# NARA v4 NFT Production Plan

Last updated: 2026-06-07.

This is the production checklist for NARA v4 position NFTs. It covers art, metadata, utility data,
deployment, verification, and launch operations without changing core engine custody or accounting.

## Product architecture

- `NARAPositionNFTV4`: bearer ERC-721 and owner-driven position operations.
- `NARAPositionAccountV4`: restricted EIP-1167 clone that owns the engine position.
- `NARAPositionRendererV4`: immutable fully on-chain art and stable marketplace metadata.
- `NARAPositionDataLensV1`: typed live financial and lifecycle data for apps and future projects.
- `NARAGenesisRewardDistributorV4`: separate Genesis ETH/token reward accounting.

Art assignment is deterministic and equal-status. It does not encode rarity, reward level, lock
amount, expected return, or preferred asset choice. Financial state remains available through the
typed lens instead of stale marketplace caches.

## Completed implementation gates

- Eight fully on-chain 1200x1200 SVG compositions plus on-chain collection image/banner.
- Stable JSON metadata with numeric attributes and fixed Genesis provenance.
- Minimal on-chain token and collection fallback if the renderer fails.
- ERC-721, ERC-2981, ERC-4906, and `contractURI()` interoperability.
- One-way royalty freeze, with zero and frozen as the production default.
- Genesis Eternal status and reward multiplier are immutable after mint; holders cannot front-run
  reward notifications with a post-mint weight boost.
- Live data lens separates NFT owner, clone account, and engine-position custodian.
- Pending/active/matured state uses settled epoch.
- Deployment scripts deploy renderer before NFT and data lens after the allocation layer.
- Live verification checks renderer code/version/art count, collection URI, pairing, and royalty freeze.
- Focused tests cover art, metadata validity/stability, fallback, royalties, ownership, lifecycle,
  claimables, Genesis data, and bounded batches.

## Mandatory pre-deployment gates

1. Run `npm run test:nft:v4`, full `npm test`, `npm run size`, and v4 static-analysis gates.
2. Rerun the independent Solidity audit against the final commit and resolve every confirmed issue.
3. Review all eight SVGs and collection art in at least one browser and one marketplace-compatible
   metadata decoder.
4. Confirm production environment values, especially NFT owner Safe, royalty receiver/BPS, royalty
   freeze, engine, token, treasury, and Genesis reward token.
5. Deploy the allocation layer with bonds inactive and capacity zero.
6. Verify source code and run `verify:v4:allocations`.
7. Deploy router/lens layer and verify `NARAPositionDataLensV1` pairing.
8. Mint one manual and one Genesis test position, then validate transfer, claim, extend, mature,
   unlock/burn, artwork, fallback assumptions, and live lens reads.
9. Complete the 48-hour monitored observation period before public promotion or bond opening.

## Validation performed on 2026-06-07

- Focused NFT/data-lens/dashboard suite: 72 passing.
- Full Hardhat regression suite: 360 passing, 0 failing.
- Clean bytecode-size gate: all deployable artifacts within EVM limits.
  - `NARAPositionNFTV4`: 19,010 deployed bytes.
  - `NARAPositionRendererV4`: 11,906 deployed bytes.
  - `NARAPositionDataLensV1`: 5,980 deployed bytes.
- Slither v4 gate completed successfully (exit 0, `--fail-none`, informational/low excluded). The data
  lens has zero findings. The renderer and the NFT's two best-effort Genesis claim helpers report only
  expected unused-return notices, because those claims are wrapped in `try/catch` and their amounts are
  intentionally ignored so a claim failure can never block an unlock; the remaining reentrancy notices
  are benign (all external entry points are `nonReentrant`, the cross-function reader is a `view`, and
  the Genesis reward distributor is an owner-set trusted protocol contract).
- Aderyn rerun was attempted but could not start because the configured WSL Aderyn binary is absent.
- Repository-wide `tsc --noEmit` was attempted. It remains blocked by existing Hardhat 3 typing debt
  in older tests; the runtime Hardhat suite is green.

### Continuation fix (final regression closure)

- Resolved the one remaining failing test, `NARAStakingPoolV4 > unlocks through unlockTo and subtracts
  principal`. Root cause: `_tryClaimGenesisRewardTo` / `_tryClaimGenesisTokenTo` called the Genesis
  reward distributor unconditionally. When a consumer (e.g. the staking pool) deploys without a
  distributor (`genesisRewardDistributor == address(0)`), the call to a code-less address expecting a
  `uint256` return reverted on return-data decoding and the decode revert escaped the `try/catch`,
  surfacing as an empty "reverted without a reason string." Every NFT-own test sets a distributor in
  its fixture, so only the distributor-less unlock path through the pool exposed it.
- Fix: both helpers now early-return when `genesisRewardDistributor == address(0)`, mirroring the
  existing guard in `_claimGenesisRewardTo` / `_claimGenesisTokenTo`. This touches no custody,
  accounting, or Genesis-with-distributor path; the metadata-cleared Genesis claim flow is unchanged
  because real Genesis positions always have a distributor (enforced at mint).

These results are strong implementation evidence, not a replacement for the final independent audit
or live deployment verification.

## Post-deployment integration gates

- Publish fresh v4 addresses and ABIs; never reuse retired v3 addresses.
- Index mint, transfer, burn, and position events for token discovery because the NFT is not enumerable.
- Use `tokenURI()`/`contractURI()` for marketplace presentation and `NARAPositionDataLensV1` for live data.
- Show review and confirmation steps for every value-bearing action.
- Monitor renderer/lens read failures, epoch backlog, claim failures, and role/ownership changes.

## Deliberately deferred

- ERC-6551 replacement: not adopted because the restricted clone is the current audited custody
  boundary; arbitrary token-bound execution would expand risk.
- Dynamic marketplace traits: not adopted because financial values can change without a token-specific
  metadata event and become stale.
- Off-chain/IPFS artwork: not required for the primary collection because the complete art is on-chain.
- Rarity or reward-linked artwork: not adopted because it creates preference signaling and gaming incentives.
