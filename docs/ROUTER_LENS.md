# NARA v4 Router + Lens

Last updated: 2026-07-26.

## What this is

Deferred router/read-layer contracts for a future v4 position frontend. They are
not part of the current baskets-only launch and are not deployed.

- **`NARARouter`** — permit + permissionless sync + lock in one transaction.
  It can reduce short-gap friction when deployed, but it does not replace the
  active recurring v4 operations workflow during periods without users.
- **`NARADashboardLens`** — single `getUserState(user, positionIds[], nftTokenIds[])` call returns wallet, epoch, fees, totals, positions, NFT positions. Replaces ~17 fan-out reads.

## Files

| Path | Purpose |
|---|---|
| [contracts/v4/router/NARARouter.sol](../contracts/v4/router/NARARouter.sol) | Router (stateless, no admin, no upgrade) |
| [contracts/v4/router/NARADashboardLens.sol](../contracts/v4/router/NARADashboardLens.sol) | Lens (pure view) |
| [contracts/v4/router/BribeRouterV4.sol](../contracts/v4/router/BribeRouterV4.sol) | Source-only notification wrapper; undeployed and inactive under the current no-notifier policy |
| [contracts/v4/mocks/MockEngineForRouter.sol](../contracts/v4/mocks/MockEngineForRouter.sol) | Test mock |
| [contracts/v4/mocks/MockNFTForRouter.sol](../contracts/v4/mocks/MockNFTForRouter.sol) | Test mock |
| [contracts/v4/mocks/MockERC20Permit.sol](../contracts/v4/mocks/MockERC20Permit.sol) | Test mock |
| [contracts/v4/mocks/MockEngineForBribe.sol](../contracts/v4/mocks/MockEngineForBribe.sol) | Test mock |
| [test/NARARouter.test.ts](../test/NARARouter.test.ts) | 28 tests, all passing |
| [test/NARADashboardLens.test.ts](../test/NARADashboardLens.test.ts) | 28 tests, all passing |
| [test/NARABribeRouterV4.test.ts](../test/NARABribeRouterV4.test.ts) | 14 tests, all passing |
| [scripts/deployRouterLens.ts](../scripts/deployRouterLens.ts) | Deploy + verify all three |

## Router surface

```solidity
function syncEpochs() returns (uint256);                 // clear full backlog
function syncEpochs(uint256 maxSteps) returns (uint256); // bounded catchup for huge backlogs
function syncAndLockWithPermit(amount, durationEpochs, minWeight, deadline, v, r, s) payable returns (uint256 positionId);
function syncAndMintAndLockWithPermit(amount, durationEpochs, minWeight, deadline, v, r, s) payable returns (uint256 tokenId, uint256 positionId);
```

Permit spender = router. Router pulls NARA, forceApprove engine/NFT, lock, clear approval. Holds zero NARA across txs (invariant tested).

## Lens surface

```solidity
function getUserState(address user, uint256[] positionIds, uint256[] nftTokenIds) view returns (UserDashboardState);
function getEpochState() view returns (EpochState);
function previewLock(uint256 amount, uint64 durationEpochs) view returns (uint256 netAmount, uint256 weight, uint256 lockFeeEth);
```

Lens accepts explicit ID arrays because v4 engine has no public ownerPositions accessor and the NFT doesn't implement ERC-721Enumerable. Frontend supplies IDs from `Locked` event logs. Both arrays capped at 100 per call.

`NARADashboardLens.NftPositionState.owner` is the actual ERC-721 owner. It must not be interpreted
as the clone account that owns the underlying engine position.

## Position data lens surface

`NARAPositionDataLensV1` is the typed live-data surface for position NFTs and future integrations.

```solidity
function getPositionData(uint256 tokenId) view returns (PositionData);
function getPositionDataBatch(uint256[] tokenIds) view returns (PositionData[]);
function claimableTokenReward(uint256 tokenId, address token) view returns (uint256);
```

The lens is stateless and admin-free. It reports the actual NFT owner, clone account, engine
custodian, live and settled epochs, lifecycle state, claimables, and Genesis data. Lifecycle
booleans use the settled epoch so apps do not present accounting state before the engine catches up.
Use this lens for current financial data; NFT marketplace JSON is intentionally stable.

## Epoch synchronization and recurring maintenance

If this router is deployed in a future release, an app may prepend
`router.syncEpochs()` in an explicitly reviewed transaction batch. The engine's
permissionless `advanceEpochs(maxSteps)` can clear a large backlog in operator
batches, while user-facing engine calls perform at most eight epochs of
just-in-time advancement. Therefore user activity handles short gaps but is not
an indefinite maintenance guarantee.

The historical Railway cron is retired. The later guarded
`.github/workflows/v4-epoch-maintainer.yml` is active with a dedicated gas-only
keeper, bounded routine, runtime verification, and required heartbeat, as
recorded in `CURRENT_STATE.md`. Permissionless/JIT advancement remains only a
safety buffer, not an indefinite operations guarantee.

## Deploy

Deployment is currently blocked because `NARAPositionNFTV4` is deferred and no
production position-NFT address exists. Do not invent an address or run
`npm run deploy:v4:router:lens` for the baskets-only launch.

Writes addresses to `deployments/router-lens-<chainId>.json`. Set `VITE_NARA_ROUTER_ADDRESS` / `VITE_NARA_LENS_ADDRESS` in any consuming app's env, or hardcode in `nara.ts`.

## BribeRouterV4 surface

```solidity
function notify(address token, uint256 amount) external;
// Caller approves BribeRouter for `amount` of `token`, then calls notify().
// BribeRouter pulls tokens, approves engine, calls engine.notifyTokenRewards(), clears approval.
// Emits: BribeNotified(caller, token, amount)
```

**Current policy:** do not grant `REWARD_NOTIFIER_ROLE`. The deployed engine
intentionally has no holder because ERC-20 reward notification is disabled for
the active release. `BribeRouterV4` is source-only and `notify()` is expected to
remain unavailable unless a future explicitly authorized security review,
deployment, role assignment, and state record change this policy.

## What is still NOT built (and why it's OK for mainnet)

| Item | Status | Why deferred |
|---|---|---|
| NARA/stNARA AMM | Not a Solidity contract | Ops task: deploy a Uniswap v3 pool post-launch |
| stNARA Chainlink oracle | Not a Solidity contract | Needed for AAVE lending integration (post-launch) |
| fracNARA marketplace | Not a Solidity contract | UI/product work, all primitives exist on-chain |

The FOX report conclusion: "Solidity architecture is largely ready. Operational clarity is now the bottleneck." All missing items are off-chain, ops, or UI — not Solidity gaps.

## Status (2026-05-28)

- Code complete, 70/70 new tests passing (28 router + 28 lens + 14 bribe router).
- **Not deployed to mainnet.** The fresh engine exists, but the position NFT and
  this router/lens layer are deferred from the baskets-only launch.
- Do not run the historical deploy/grant sequence against the live engine.
  Any future router/lens release requires fresh verified manifests and an
  explicit decision on the intentionally disabled notifier role.
- Frontend wiring deferred per user decision. Each app imports ABIs/addresses from `nara.ts`.
