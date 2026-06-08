// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC3156FlashBorrower} from "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import {IERC3156FlashLender} from "@openzeppelin/contracts/interfaces/IERC3156FlashLender.sol";

/// @dev Test helper. DO NOT DEPLOY TO MAINNET.
contract MockFlashBorrower is IERC3156FlashBorrower {
    bytes32 private constant RETURN_VALUE = keccak256("ERC3156FlashBorrower.onFlashLoan");

    IERC3156FlashLender public immutable LENDER;

    enum Action { NORMAL, REENTER, BAD_RETURN }

    event Borrowed(address initiator, address token, uint256 value, uint256 fee);

    constructor(IERC3156FlashLender lender_) {
        LENDER = lender_;
    }

    function flashBorrow(address token, uint256 amount, bytes calldata data) external {
        LENDER.flashLoan(this, token, amount, data);
    }

    function onFlashLoan(
        address initiator,
        address token,
        uint256 value,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        emit Borrowed(initiator, token, value, fee);

        Action action = data.length == 0 ? Action.NORMAL : Action(uint8(data[0]));
        if (action == Action.BAD_RETURN) {
            return bytes32(0);
        }

        // Approve lender to pull (value + fee)
        IERC20(token).approve(address(LENDER), value + fee);
        return RETURN_VALUE;
    }

    /// @notice Allow the borrower to be funded with fee tokens before the loan.
    function pullAndApprove(IERC20 token, uint256 value) external {
        token.approve(address(LENDER), value);
    }

    receive() external payable {}
}
