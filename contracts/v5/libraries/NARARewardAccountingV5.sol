// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @title NARA V5 exact scaled reward accounting
/// @notice O(1) reward-index accounting that preserves every fractional unit
///         across position weight changes.
/// @dev Values ending in `Scaled` are denominated in token base units times RAY.
///      Keeping account accrual in scaled units is intentional: rounding is never
///      silently discarded when a position changes weight. A closed position's
///      final sub-unit remainder can be recycled into `unallocatedScaled`.
library NARARewardAccountingV5 {
    uint256 internal constant RAY = 1e27;
    uint256 internal constant MAX_CUMULATIVE_REWARD = type(uint128).max;

    struct RewardState {
        uint256 indexRay;
        uint256 unallocatedScaled;
        uint256 indexedOutstandingScaled;
        uint256 settledOutstandingScaled;
        uint256 totalReceived;
        uint256 totalClaimed;
    }

    struct PositionReward {
        uint256 indexRay;
        uint256 accruedScaled;
    }

    error RewardAmountZero();
    error RewardLimitExceeded();
    error RewardIndexRegression();
    error RewardAccountingInvariant();

    /// @notice Adds newly received value and indexes as much as exact division permits.
    /// @return indexedScaled Value assigned to the live weight set, in scaled units.
    /// @return queuedScaled Value still waiting for a future index increment.
    function record(
        RewardState storage state,
        uint256 amount,
        uint256 totalWeight
    ) internal returns (uint256 indexedScaled, uint256 queuedScaled) {
        if (amount == 0) revert RewardAmountZero();
        if (state.totalReceived > MAX_CUMULATIVE_REWARD - amount) {
            revert RewardLimitExceeded();
        }

        state.totalReceived += amount;
        state.unallocatedScaled += amount * RAY;
        indexedScaled = _flush(state, totalWeight);
        queuedScaled = state.unallocatedScaled;
        _assertConserved(state);
    }

    /// @notice Makes queued value available when a zero-weight period ends.
    function flush(RewardState storage state, uint256 totalWeight)
        internal
        returns (uint256 indexedScaled, uint256 queuedScaled)
    {
        indexedScaled = _flush(state, totalWeight);
        queuedScaled = state.unallocatedScaled;
        _assertConserved(state);
    }

    /// @notice Settles a position through `effectiveIndexRay` before any weight mutation.
    /// @dev The caller selects a capped index for an expired position. Multiplication is
    ///      safe under the library's cumulative-reward bound because the position weight
    ///      was part of the aggregate denominator throughout this index interval.
    function settle(
        RewardState storage state,
        PositionReward storage position,
        uint256 weight,
        uint256 effectiveIndexRay
    ) internal returns (uint256 accruedScaled) {
        uint256 previous = position.indexRay;
        if (effectiveIndexRay < previous) revert RewardIndexRegression();

        uint256 deltaIndex = effectiveIndexRay - previous;
        if (deltaIndex != 0 && weight != 0) {
            accruedScaled = weight * deltaIndex;
            if (accruedScaled > state.indexedOutstandingScaled) {
                revert RewardAccountingInvariant();
            }
            state.indexedOutstandingScaled -= accruedScaled;
            state.settledOutstandingScaled += accruedScaled;
            position.accruedScaled += accruedScaled;
        }
        position.indexRay = effectiveIndexRay;
        _assertConserved(state);
    }

    /// @notice Returns transferable whole token units owed through an effective index.
    function claimable(
        PositionReward storage position,
        uint256 weight,
        uint256 effectiveIndexRay
    ) internal view returns (uint256) {
        uint256 previous = position.indexRay;
        if (effectiveIndexRay < previous) revert RewardIndexRegression();
        uint256 scaled = position.accruedScaled;
        uint256 deltaIndex = effectiveIndexRay - previous;
        if (deltaIndex != 0 && weight != 0) scaled += weight * deltaIndex;
        return scaled / RAY;
    }

    /// @notice Debits the position's transferable whole units after settlement.
    function debitClaim(
        RewardState storage state,
        PositionReward storage position
    ) internal returns (uint256 amount) {
        amount = position.accruedScaled / RAY;
        if (amount == 0) return 0;

        uint256 scaled = amount * RAY;
        position.accruedScaled -= scaled;
        state.settledOutstandingScaled -= scaled;
        state.totalClaimed += amount;
        _assertConserved(state);
    }

    /// @notice Returns a closing position's non-transferable fractional remainder
    ///         to the globally visible queue instead of abandoning it.
    function recycleFraction(
        RewardState storage state,
        PositionReward storage position
    ) internal returns (uint256 recycledScaled) {
        recycledScaled = position.accruedScaled;
        if (recycledScaled != 0) {
            position.accruedScaled = 0;
            state.settledOutstandingScaled -= recycledScaled;
            state.unallocatedScaled += recycledScaled;
        }
        _assertConserved(state);
    }

    function conserved(RewardState storage state) internal view returns (bool) {
        return state.totalReceived * RAY ==
            state.totalClaimed * RAY +
            state.unallocatedScaled +
            state.indexedOutstandingScaled +
            state.settledOutstandingScaled;
    }

    function _flush(RewardState storage state, uint256 totalWeight)
        private
        returns (uint256 indexedScaled)
    {
        uint256 available = state.unallocatedScaled;
        if (available == 0 || totalWeight == 0) return 0;

        uint256 deltaIndex = available / totalWeight;
        if (deltaIndex == 0) return 0;

        indexedScaled = deltaIndex * totalWeight;
        state.unallocatedScaled = available - indexedScaled;
        state.indexRay += deltaIndex;
        state.indexedOutstandingScaled += indexedScaled;
    }

    function _assertConserved(RewardState storage state) private view {
        if (!conserved(state)) revert RewardAccountingInvariant();
    }
}
