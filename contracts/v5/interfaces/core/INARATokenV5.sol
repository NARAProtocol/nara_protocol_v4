// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

interface INARATokenV5 is IERC20, IERC20Permit {
    function fixedSupply() external view returns (uint256);
    function decimals() external view returns (uint8);
}
