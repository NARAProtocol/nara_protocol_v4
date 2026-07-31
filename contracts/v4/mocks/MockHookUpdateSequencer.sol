// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IHooks} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolOperation.sol";

interface IMockV4PoolManagerSequencer {
    function callBeforeSwap(
        IHooks hook,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata data
    ) external;
}

interface INARAHookUpdates {
    function executeFeeCurve(bool isBuyCurve) external;
    function executeProtocolDepth(address currency) external;
}

/// @dev Test-only owner that interleaves a ready hook update between two same-block flows.
contract MockHookUpdateSequencer {
    function swapExecuteAndSwap(
        IMockV4PoolManagerSequencer manager,
        IHooks hook,
        PoolKey calldata key,
        SwapParams calldata first,
        SwapParams calldata second,
        address currency
    ) external {
        manager.callBeforeSwap(hook, key, first, "");
        INARAHookUpdates(address(hook)).executeFeeCurve(true);
        INARAHookUpdates(address(hook)).executeProtocolDepth(currency);
        manager.callBeforeSwap(hook, key, second, "");
    }
}
