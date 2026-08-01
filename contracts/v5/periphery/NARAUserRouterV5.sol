// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INARAPositionControllerV5} from "../interfaces/modules/INARAPositionControllerV5.sol";

/// @notice Stateless convenience router for funding canonical V5 positions.
/// @dev It never receives NFT control and leaves no token allowance or balance after a successful call.
contract NARAUserRouterV5 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error InvalidAmount();
    error UnsupportedTokenBehavior();
    error EtherNotAccepted();

    address public immutable token;
    address public immutable positionController;

    event PositionOpened(address indexed user, address indexed recipient, uint256 indexed tokenId, uint256 amount);

    constructor(address token_, address positionController_) {
        if (token_ == address(0) || positionController_ == address(0)) revert InvalidAddress();
        if (token_.code.length == 0 || positionController_.code.length == 0) revert InvalidAddress();
        if (INARAPositionControllerV5(positionController_).token() != token_) revert InvalidAddress();
        token = token_;
        positionController = positionController_;
    }

    function openPosition(uint256 amount, uint64 lockDurationSeconds, address recipient)
        external
        nonReentrant
        returns (uint256 tokenId, address account)
    {
        return _open(msg.sender, amount, lockDurationSeconds, recipient);
    }

    function openPositionWithPermit(
        uint256 amount,
        uint64 lockDurationSeconds,
        address recipient,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 tokenId, address account) {
        IERC20Permit(token).permit(msg.sender, address(this), amount, permitDeadline, v, r, s);
        return _open(msg.sender, amount, lockDurationSeconds, recipient);
    }

    function _open(address payer, uint256 amount, uint64 lockDurationSeconds, address recipient)
        internal
        returns (uint256 tokenId, address account)
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        uint256 startingBalance = _pullExact(payer, amount);
        IERC20(token).forceApprove(positionController, amount);
        (tokenId, account) =
            INARAPositionControllerV5(positionController).mintPosition(
                recipient, amount, lockDurationSeconds
            );
        IERC20(token).forceApprove(positionController, 0);
        if (IERC20(token).balanceOf(address(this)) != startingBalance) revert UnsupportedTokenBehavior();
        emit PositionOpened(payer, recipient, tokenId, amount);
    }

    function _pullExact(address payer, uint256 amount) internal returns (uint256 beforeBalance) {
        IERC20 asset = IERC20(token);
        beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(payer, address(this), amount);
        if (asset.balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedTokenBehavior();
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
