// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";
import {INARAPositionControllerV5} from "../interfaces/modules/INARAPositionControllerV5.sol";
import {INARAPositionDataLensV5} from "../interfaces/periphery/INARAPositionDataLensV5.sol";

/// @notice Bounded canonical position reads with explicit reward-token selection.
contract NARAPositionDataLensV5 is INARAPositionDataLensV5 {
    uint256 public constant MAX_POSITIONS_PER_CALL = 64;
    uint256 public constant MAX_REWARD_TOKENS_PER_CALL = 8;

    error InvalidAddress();
    error PageTooLarge();

    address public immutable override controller;
    address public immutable override engine;

    constructor(address controller_) {
        if (controller_ == address(0) || controller_.code.length == 0) revert InvalidAddress();
        address engine_ = INARAPositionControllerV5(controller_).engine();
        if (engine_ == address(0) || engine_.code.length == 0) revert InvalidAddress();
        controller = controller_;
        engine = engine_;
    }

    function getPosition(uint256 tokenId, address[] calldata rewardTokens)
        external
        view
        returns (PositionView memory result)
    {
        if (rewardTokens.length > MAX_REWARD_TOKENS_PER_CALL) revert PageTooLarge();
        return _getPosition(tokenId, rewardTokens);
    }

    function getPositions(uint256[] calldata tokenIds, address[] calldata rewardTokens)
        external
        view
        returns (PositionView[] memory results)
    {
        if (
            tokenIds.length > MAX_POSITIONS_PER_CALL
                || rewardTokens.length > MAX_REWARD_TOKENS_PER_CALL
        ) revert PageTooLarge();
        results = new PositionView[](tokenIds.length);
        for (uint256 i; i < tokenIds.length; ++i) results[i] = _getPosition(tokenIds[i], rewardTokens);
    }

    function _getPosition(uint256 tokenId, address[] calldata rewardTokens)
        internal
        view
        returns (PositionView memory result)
    {
        INARAPositionControllerV5 targetController = INARAPositionControllerV5(controller);
        result.tokenId = tokenId;
        result.owner = targetController.ownerOf(tokenId);
        (result.account, result.state) = targetController.positionData(tokenId);
        result.claimableNative = INARAPositionEngineV5(engine).claimableNative(tokenId);
        result.claimableTokens = new uint256[](rewardTokens.length);
        for (uint256 i; i < rewardTokens.length; ++i) {
            result.claimableTokens[i] =
                INARAPositionEngineV5(engine).claimableToken(tokenId, rewardTokens[i]);
        }
    }
}
