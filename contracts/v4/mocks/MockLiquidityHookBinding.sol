// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

contract MockLiquidityHookBinding {
    address public immutable token;
    address public immutable base;
    address public immutable vault;

    constructor(address token_, address base_, address vault_) {
        token = token_;
        base = base_;
        vault = vault_;
    }
}
