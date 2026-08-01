// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";
import {INARAPositionControllerV5} from "../interfaces/modules/INARAPositionControllerV5.sol";
import {INARAPositionDataLensV5} from "../interfaces/periphery/INARAPositionDataLensV5.sol";

/// @notice Paginated user dashboard reads; callers select the reward-token lanes to display.
contract NARADashboardLensV5 {
    uint256 public constant MAX_PAGE_SIZE = 64;

    struct UserState {
        address user;
        uint256 tokenBalance;
        uint256 controllerAllowance;
        uint256 positionCount;
        uint64 currentEpoch;
        uint64 targetEpoch;
        INARAPositionDataLensV5.PositionView[] positions;
    }

    error InvalidAddress();
    error InvalidPage();

    address public immutable token;
    address public immutable controller;
    address public immutable engine;
    address public immutable positionLens;

    constructor(address token_, address controller_, address positionLens_) {
        if (token_ == address(0) || controller_ == address(0) || positionLens_ == address(0)) {
            revert InvalidAddress();
        }
        if (token_.code.length == 0 || controller_.code.length == 0 || positionLens_.code.length == 0) {
            revert InvalidAddress();
        }
        if (
            INARAPositionControllerV5(controller_).token() != token_
                || INARAPositionDataLensV5(positionLens_).controller() != controller_
        ) revert InvalidAddress();

        token = token_;
        controller = controller_;
        engine = INARAPositionControllerV5(controller_).engine();
        positionLens = positionLens_;
    }

    function getUserState(
        address user,
        uint256 cursor,
        uint256 pageSize,
        address[] calldata rewardTokens
    ) external view returns (UserState memory state) {
        if (user == address(0) || pageSize == 0 || pageSize > MAX_PAGE_SIZE) revert InvalidPage();
        INARAPositionControllerV5 targetController = INARAPositionControllerV5(controller);
        uint256 count = targetController.balanceOf(user);
        if (cursor > count) revert InvalidPage();

        uint256 remaining = count - cursor;
        uint256 length = remaining < pageSize ? remaining : pageSize;
        uint256[] memory tokenIds = new uint256[](length);
        for (uint256 i; i < length; ++i) {
            tokenIds[i] = targetController.tokenOfOwnerByIndex(user, cursor + i);
        }

        state.user = user;
        state.tokenBalance = IERC20(token).balanceOf(user);
        state.controllerAllowance = IERC20(token).allowance(user, controller);
        state.positionCount = count;
        state.currentEpoch = INARAPositionEngineV5(engine).currentEpoch();
        state.targetEpoch = INARAPositionEngineV5(engine).targetEpoch();
        state.positions = INARAPositionDataLensV5(positionLens).getPositions(tokenIds, rewardTokens);
    }
}
