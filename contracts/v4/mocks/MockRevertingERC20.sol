// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockRevertingERC20 is ERC20 {
    bool public transfersRevert;

    constructor() ERC20("Reverting Reward", "RWRD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setTransfersRevert(bool value) external {
        transfersRevert = value;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (transfersRevert) revert("TRANSFER_DISABLED");
        return super.transfer(to, value);
    }
}
