// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC3156FlashBorrower} from "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import {IERC3156FlashLender} from "@openzeppelin/contracts/interfaces/IERC3156FlashLender.sol";

contract MockRecursiveFlashBorrower is IERC3156FlashBorrower {
    bytes32 private constant RETURN_VALUE =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    IERC3156FlashLender public immutable lender;
    uint256 public peakSupply;
    uint256 public minimumRemainingCapacity = type(uint256).max;

    constructor(IERC3156FlashLender lender_) {
        lender = lender_;
    }

    function borrow(address token, uint256 amount, uint256 nestedAmount) external {
        lender.flashLoan(this, token, amount, abi.encode(nestedAmount));
    }

    function onFlashLoan(
        address,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external returns (bytes32) {
        require(msg.sender == address(lender), "not lender");

        uint256 supply = IERC20(token).totalSupply();
        if (supply > peakSupply) peakSupply = supply;
        uint256 remaining = lender.maxFlashLoan(token);
        if (remaining < minimumRemainingCapacity) minimumRemainingCapacity = remaining;

        uint256 nestedAmount = abi.decode(data, (uint256));
        if (nestedAmount > 0) {
            lender.flashLoan(this, token, nestedAmount, abi.encode(uint256(0)));
        }

        IERC20(token).approve(address(lender), amount + fee);
        return RETURN_VALUE;
    }
}
