// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IHooks} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-periphery/lib/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta} from "@uniswap/v4-periphery/lib/v4-core/src/types/BeforeSwapDelta.sol";

contract MockV4PoolManager {
    mapping(address currency => mapping(address to => uint256 amount)) public taken;
    bytes4 public lastBeforeSwapSelector;
    BeforeSwapDelta public lastBeforeSwapDelta;
    uint24 public lastBeforeSwapFeeOverride;

    event TakeCalled(address indexed currency, address indexed to, uint256 amount);

    function callBeforeInitialize(
        IHooks hook,
        PoolKey calldata key,
        uint160 sqrtPriceX96
    ) external returns (bytes4) {
        return hook.beforeInitialize(msg.sender, key, sqrtPriceX96);
    }

    function callBeforeSwap(
        IHooks hook,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata data
    ) external returns (bytes4, BeforeSwapDelta, uint24) {
        (bytes4 selector, BeforeSwapDelta delta, uint24 feeOverride) = hook.beforeSwap(msg.sender, key, params, data);
        lastBeforeSwapSelector = selector;
        lastBeforeSwapDelta = delta;
        lastBeforeSwapFeeOverride = feeOverride;
        return (selector, delta, feeOverride);
    }

    function take(Currency currency, address to, uint256 amount) external {
        address currencyAddress = Currency.unwrap(currency);
        taken[currencyAddress][to] += amount;
        emit TakeCalled(currencyAddress, to, amount);
    }
}
