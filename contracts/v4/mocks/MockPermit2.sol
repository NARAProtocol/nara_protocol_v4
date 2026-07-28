// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal Permit2 (AllowanceTransfer) test double. `approve` is a no-op (the real Permit2
///      records an allowance the PositionManager later consumes); `transferFrom` moves tokens using
///      the plain ERC-20 allowance the owner granted this contract — exactly mirroring how the real
///      Permit2 pulls funds during a v4 `modifyLiquidities` settle.
contract MockPermit2 {
    function approve(address, address, uint160, uint48) external {}

    function transferFrom(address from, address to, uint160 amount, address token) external {
        IERC20(token).transferFrom(from, to, amount);
    }
}
