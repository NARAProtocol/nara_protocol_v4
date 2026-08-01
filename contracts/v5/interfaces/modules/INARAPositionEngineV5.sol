// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Narrow adapter boundary between the V5 position layer and the V5 Engine.
/// @dev The final Engine may implement this directly or through a sealed adapter. It
///      deliberately omits the defective V4 generic reward-notifier surface.
interface INARAPositionEngineV5 {
    struct PositionState {
        address owner;
        uint256 principal;
        uint256 weight;
        uint64 openedAt;
        uint64 unlockAt;
        bool active;
    }

    function token() external view returns (address);

    function openPosition(address positionOwner, uint256 amount, uint64 lockDurationSeconds)
        external
        returns (uint256 positionId);

    function extendPosition(uint256 positionId, uint64 extensionSeconds)
        external
        returns (uint64 newUnlockAt, uint256 newWeight);

    function claimPosition(uint256 positionId, address recipient, address[] calldata rewardTokens)
        external
        returns (uint256 nativeAmount, uint256[] memory tokenAmounts);

    function unlockPosition(uint256 positionId, address recipient)
        external
        returns (uint256 principalReturned);

    function closePosition(uint256 positionId) external;

    function positionState(uint256 positionId) external view returns (PositionState memory state);
    function claimableNative(uint256 positionId) external view returns (uint256);
    function claimableToken(uint256 positionId, address rewardToken) external view returns (uint256);

    function positionCount() external view returns (uint256);
    function totalLocked() external view returns (uint256);
    function totalActiveWeight() external view returns (uint256);
    function currentEpoch() external view returns (uint64);
    function targetEpoch() external view returns (uint64);

    function advanceEpochs(uint32 maxEpochs)
        external
        returns (uint64 fromEpoch, uint64 toEpoch, uint64 target, bool complete);
}
