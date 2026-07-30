// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

// NARA v4 engine types — self-contained under contracts/v4/.
// Intentionally duplicates the shape of v2 types so the v4 tree compiles
// without depending on any file under contracts/ root.

error ZeroAddress();
error ZeroValue();
error ZeroWeight();
error InvalidConfig();
error EpochNotReady();
error EpochStale();
error AdvanceStepsInsufficient(uint64 required, uint256 provided);
error PositionNotFound();
error PositionMatured();
error PositionNotMatured();
error LockTooShort();
error LockTooLong();
error InvalidExtension();
error SlippageExceeded();
error Uint128Overflow();
error BatchTooLarge();
error TooManyPositions();
error NothingToClaim();
error EthTransferFailed();
error InvalidReceiver();
error NotPositionOwner();
error DirectEthTransferForbidden();
error RewardTokenNotAllowed();
error NoActiveWeight();
error LauncherMismatch();
error TokenNotLaunched();
error NotAContract();
error InvalidSignature();
error SignatureExpired();
error InvalidCaller();
error InvalidToken();
error InsufficientFee();
error AlreadySet();
error ConfigExists();
error ConfigTimelockNotElapsed();
error NoPendingConfig();
error NativeTokenSweepForbidden();
error TimestampRegression();

/// @notice Emission + duration curve configuration. Semantics identical to v2
/// so NARAEngineModelLib curves port 1:1. `activationDelayEpochs` defaults to 3
/// at deploy per the locked spec.
struct EngineConfig {
    uint256 eMax;
    uint256 beta0Wad;
    uint256 mWad;
    uint256 aWad;
    uint256 bWad;
    uint256 cWad;
    uint256 dWad;
    uint256 dripSplitWad;
    uint256 durationLinearWad;
    uint256 durationQuadraticWad;
    uint256 growthFactorWad;
    uint256 minBaseEmission;
    uint256 maxBaseEmission;
    uint256 warmupRateWad;
    uint256 bootstrapInitialWeight;
    uint256 bootstrapDecayWad;
    uint64 activationDelayEpochs;
    uint64 maxLockEpochs;
}

struct EpochSnapshot {
    uint64 epoch;
    uint64 timestamp;
    uint256 circulatingSupply;
    uint256 totalLocked;
    uint256 activeTotalWeight;
    uint256 weightedLockShareWad;
    uint256 stressWad;
    uint256 betaWad;
    uint256 horizon;
    uint256 retentionWad;
    uint256 baseEmission;
    uint256 emission;
    uint256 admittedSupply;
    uint256 distributedNara;
    uint256 distributedEth;
    uint256 treasuryAmount;
    uint256 warmupFactorWad;
    uint256 bootstrapWeight;
    uint256 heartbeat;
}

/// @notice Position stored under a global `uint256 positionId` with an explicit
/// `owner` field. NFT wrappers register as owners at lock time and cannot be
/// transferred by the engine — transfer semantics live in the wrapper.
///
/// Layout (5 storage slots):
///  slot 0: owner (20) + createdEpoch (8) + flags (4) = 32
///  slot 1: amount (16) + weight (16)                  = 32
///  slot 2: activationEpoch (8) + unlockEpoch (8) + tokenWeight (16) = 32
///  slot 3: naraDebtRay (32)
///  slot 4: ethDebtRay  (32)
struct Position {
    address owner;
    uint64 createdEpoch;
    uint32 flags;
    uint128 amount;
    uint128 weight;
    uint64 activationEpoch;
    uint64 unlockEpoch;
    // Weight basis for instant-distribution token (bribe / pool-fee) rewards. Set to `weight`
    // at lock time. extend() only raises it while no token reward has ever been notified; once
    // token rewards are live it is frozen. This prevents retroactive over-crediting, but a later
    // distribution can under-allocate when activeTotalWeight has increased. Production therefore
    // keeps engine token notification disabled. (Was `_reserved0`.)
    uint128 tokenWeight;
    uint256 naraDebtRay;
    uint256 ethDebtRay;
}
