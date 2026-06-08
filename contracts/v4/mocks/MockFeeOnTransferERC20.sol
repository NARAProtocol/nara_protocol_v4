// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public constant FEE_BPS = 100;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || value == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = value * FEE_BPS / BPS_DENOMINATOR;
        uint256 netAmount = value - fee;

        if (fee > 0) {
            super._update(from, address(0), fee);
        }
        super._update(from, to, netAmount);
    }
}
