// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @dev ERC-20 with EIP-2612 permit for router tests that need real permit signing.
contract MockERC20Permit is ERC20Permit {
    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
