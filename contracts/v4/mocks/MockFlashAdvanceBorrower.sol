// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC3156FlashBorrower} from "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import {IERC3156FlashLender} from "@openzeppelin/contracts/interfaces/IERC3156FlashLender.sol";

contract MockFlashAdvanceBorrower is IERC3156FlashBorrower {
    bytes32 private constant RETURN_VALUE = keccak256("ERC3156FlashBorrower.onFlashLoan");

    IERC3156FlashLender public immutable lender;
    address public immutable engine;

    constructor(IERC3156FlashLender lender_, address engine_) {
        lender = lender_;
        engine = engine_;
    }

    function flashBorrowAndAdvance(address token, uint256 amount, uint256 steps) external {
        lender.flashLoan(this, token, amount, abi.encode(steps));
    }

    function onFlashLoan(
        address,
        address token,
        uint256 value,
        uint256 fee,
        bytes calldata data
    ) external override returns (bytes32) {
        uint256 steps = abi.decode(data, (uint256));
        (bool ok,) = engine.call(abi.encodeWithSignature("advanceEpochs(uint256)", steps));
        require(ok, "ADVANCE_FAILED");
        IERC20(token).approve(msg.sender, value + fee);
        return RETURN_VALUE;
    }
}
