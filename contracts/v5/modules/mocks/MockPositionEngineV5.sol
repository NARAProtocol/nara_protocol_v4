// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {INARAPositionEngineV5} from "../../interfaces/modules/INARAPositionEngineV5.sol";

contract MockPositionEngineV5 is INARAPositionEngineV5 {
    using SafeERC20 for IERC20;

    error InvalidInput();
    error Unauthorized();
    error NotActive();
    error PositionNotWithdrawn();
    error PositionClosed();
    error StillLocked();
    error NativeTransferFailed();

    address public immutable override token;
    uint64 public immutable epochOrigin;
    uint64 public immutable epochLength;
    uint64 public immutable minLockDuration;
    uint64 public immutable maxLockDuration;
    uint256 public override positionCount;
    uint256 public override totalLocked;
    uint256 public override totalActiveWeight;
    uint64 public override currentEpoch;
    uint64 public override targetEpoch;

    mapping(uint256 positionId => PositionState state) private _positions;
    mapping(uint256 positionId => uint256 amount) private _claimableNative;
    mapping(uint256 positionId => mapping(address rewardToken => uint256 amount)) private _claimableToken;
    mapping(uint256 positionId => bool closed) private _closed;
    mapping(uint256 positionId => address[] rewardTokens) private _rewardTokens;
    mapping(uint256 positionId => mapping(address rewardToken => bool seen)) private _rewardTokenSeen;

    uint256 public recycledNative;
    mapping(address rewardToken => uint256 amount) public recycledToken;

    constructor(address token_) {
        if (token_ == address(0) || token_.code.length == 0) revert InvalidInput();
        token = token_;
        epochOrigin = uint64(block.timestamp);
        epochLength = 60;
        minLockDuration = 1 hours;
        maxLockDuration = 20 * 365 days;
    }

    function openPosition(address positionOwner, uint256 amount, uint64 lockDurationSeconds)
        external
        returns (uint256 positionId)
    {
        if (
            positionOwner != msg.sender || amount == 0 || lockDurationSeconds < minLockDuration
                || lockDurationSeconds > maxLockDuration
        ) revert InvalidInput();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        positionId = ++positionCount;
        uint64 openedAt = uint64(block.timestamp);
        uint64 unlockAt = _alignedUnlock(openedAt, lockDurationSeconds);
        uint256 weight = amount * uint256(unlockAt - openedAt);
        _positions[positionId] = PositionState({
            owner: positionOwner,
            principal: amount,
            weight: weight,
            openedAt: openedAt,
            unlockAt: unlockAt,
            active: true
        });
        totalLocked += amount;
        totalActiveWeight += weight;
    }

    function extendPosition(uint256 positionId, uint64 extensionSeconds)
        external
        returns (uint64 newUnlockAt, uint256 newWeight)
    {
        PositionState storage state = _authorizedActive(positionId);
        if (extensionSeconds == 0) revert InvalidInput();
        uint256 oldWeight = state.weight;
        if (uint256(state.unlockAt) + extensionSeconds - state.openedAt > maxLockDuration) {
            revert InvalidInput();
        }
        newUnlockAt = _alignedUnlock(state.unlockAt, extensionSeconds);
        if (uint256(newUnlockAt) - state.openedAt > uint256(maxLockDuration) + epochLength - 1) {
            revert InvalidInput();
        }
        newWeight = state.principal * uint256(newUnlockAt - state.openedAt);
        state.unlockAt = newUnlockAt;
        state.weight = newWeight;
        totalActiveWeight = totalActiveWeight - oldWeight + newWeight;
    }

    function claimPosition(uint256 positionId, address recipient, address[] calldata rewardTokens)
        external
        returns (uint256 nativeAmount, uint256[] memory tokenAmounts)
    {
        _authorizedOpen(positionId);
        if (recipient == address(0)) revert InvalidInput();
        nativeAmount = _claimableNative[positionId];
        _claimableNative[positionId] = 0;
        if (nativeAmount != 0) {
            (bool success,) = recipient.call{value: nativeAmount}("");
            if (!success) revert NativeTransferFailed();
        }

        tokenAmounts = new uint256[](rewardTokens.length);
        for (uint256 i; i < rewardTokens.length; ++i) {
            address rewardToken = rewardTokens[i];
            uint256 amount = _claimableToken[positionId][rewardToken];
            _claimableToken[positionId][rewardToken] = 0;
            tokenAmounts[i] = amount;
            if (amount != 0) IERC20(rewardToken).safeTransfer(recipient, amount);
        }
    }

    function unlockPosition(uint256 positionId, address recipient)
        external
        returns (uint256 principalReturned)
    {
        PositionState storage state = _authorizedActive(positionId);
        if (block.timestamp < state.unlockAt) revert StillLocked();
        if (recipient == address(0)) revert InvalidInput();
        state.active = false;
        principalReturned = state.principal;
        uint256 activeWeight = state.weight;
        state.principal = 0;
        state.weight = 0;
        totalLocked -= principalReturned;
        totalActiveWeight -= activeWeight;
        IERC20(token).safeTransfer(recipient, principalReturned);
    }

    function closePosition(uint256 positionId) external {
        PositionState storage state = _authorizedOpen(positionId);
        if (state.active) revert PositionNotWithdrawn();
        _closed[positionId] = true;

        uint256 nativeAmount = _claimableNative[positionId];
        if (nativeAmount != 0) {
            _claimableNative[positionId] = 0;
            recycledNative += nativeAmount;
        }

        address[] storage rewardTokens = _rewardTokens[positionId];
        for (uint256 i; i < rewardTokens.length; ++i) {
            address rewardToken = rewardTokens[i];
            uint256 amount = _claimableToken[positionId][rewardToken];
            if (amount != 0) {
                _claimableToken[positionId][rewardToken] = 0;
                recycledToken[rewardToken] += amount;
            }
        }
    }

    function positionState(uint256 positionId) external view returns (PositionState memory state) {
        return _positions[positionId];
    }

    function claimableNative(uint256 positionId) external view returns (uint256) {
        return _claimableNative[positionId];
    }

    function claimableToken(uint256 positionId, address rewardToken) external view returns (uint256) {
        return _claimableToken[positionId][rewardToken];
    }

    function advanceEpochs(uint32 maxEpochs)
        external
        returns (uint64 fromEpoch, uint64 toEpoch, uint64 target, bool complete)
    {
        if (maxEpochs == 0) revert InvalidInput();
        fromEpoch = currentEpoch;
        target = targetEpoch;
        uint64 remaining = target > fromEpoch ? target - fromEpoch : 0;
        uint64 step = remaining < maxEpochs ? remaining : uint64(maxEpochs);
        toEpoch = fromEpoch + step;
        currentEpoch = toEpoch;
        complete = toEpoch >= target;
    }

    function setTargetEpoch(uint64 target) external {
        if (target < currentEpoch) revert InvalidInput();
        targetEpoch = target;
    }

    function fundNativeReward(uint256 positionId) external payable {
        if (!_positions[positionId].active || msg.value == 0) revert InvalidInput();
        _claimableNative[positionId] += msg.value;
    }

    function fundTokenReward(uint256 positionId, address rewardToken, uint256 amount) external {
        if (!_positions[positionId].active || rewardToken == address(0) || amount == 0) revert InvalidInput();
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), amount);
        if (!_rewardTokenSeen[positionId][rewardToken]) {
            _rewardTokenSeen[positionId][rewardToken] = true;
            _rewardTokens[positionId].push(rewardToken);
        }
        _claimableToken[positionId][rewardToken] += amount;
    }

    function _authorizedOpen(uint256 positionId) private view returns (PositionState storage state) {
        state = _positions[positionId];
        if (state.owner != msg.sender) revert Unauthorized();
        if (_closed[positionId]) revert PositionClosed();
    }

    function _authorizedActive(uint256 positionId) private view returns (PositionState storage state) {
        state = _authorizedOpen(positionId);
        if (!state.active) revert NotActive();
    }

    function _alignedUnlock(uint64 start, uint64 duration) private view returns (uint64 unlockAt) {
        uint256 candidate = uint256(start) + duration;
        if (candidate <= epochOrigin) revert InvalidInput();
        uint256 elapsed = candidate - epochOrigin;
        uint256 epoch = (elapsed + epochLength - 1) / epochLength;
        uint256 timestamp = uint256(epochOrigin) + epoch * epochLength;
        if (timestamp > type(uint64).max) revert InvalidInput();
        unlockAt = uint64(timestamp);
    }

    receive() external payable { }
}
