// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IHooks} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-periphery/lib/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta} from "@uniswap/v4-periphery/lib/v4-core/src/types/BeforeSwapDelta.sol";

interface IMockPoolFeeQuote {
    function quotePoolFeeDetailed(bool isBuy, uint256 amountIn)
        external
        view
        returns (uint16 marginalFeeBps, uint16 effectiveFeeBps, uint256 feeAmount);
}

contract MockV4PoolManager {
    bytes32 internal constant POOLS_SLOT = bytes32(uint256(6));
    uint256 internal constant LIQUIDITY_OFFSET = 3;

    mapping(address currency => mapping(address to => uint256 amount)) public taken;
    mapping(bytes32 slot => bytes32 value) internal poolWords;
    bytes4 public lastBeforeSwapSelector;
    BeforeSwapDelta public lastBeforeSwapDelta;
    uint24 public lastBeforeSwapFeeOverride;

    event TakeCalled(address indexed currency, address indexed to, uint256 amount);
    event FeeQuoteObserved(uint16 marginalFeeBps, uint16 effectiveFeeBps, uint256 feeAmount);

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

    /// @dev Executes every callback in one transaction so tests exercise one
    /// actual block-flow accumulator instead of separate automined blocks.
    function callBeforeSwaps(
        IHooks hook,
        PoolKey calldata key,
        SwapParams[] calldata params,
        bytes calldata data
    ) external {
        uint256 length = params.length;
        for (uint256 i; i < length; ) {
            (bytes4 selector, BeforeSwapDelta delta, uint24 feeOverride) =
                hook.beforeSwap(msg.sender, key, params[i], data);
            lastBeforeSwapSelector = selector;
            lastBeforeSwapDelta = delta;
            lastBeforeSwapFeeOverride = feeOverride;
            unchecked {
                ++i;
            }
        }
    }

    function callBeforeSwapQuoteThenSwap(
        IHooks hook,
        PoolKey calldata key,
        SwapParams calldata first,
        SwapParams calldata second,
        bool isBuy,
        bytes calldata data
    ) external {
        hook.beforeSwap(msg.sender, key, first, data);
        (uint16 marginalFeeBps, uint16 effectiveFeeBps, uint256 feeAmount) =
            IMockPoolFeeQuote(address(hook)).quotePoolFeeDetailed(isBuy, uint256(-second.amountSpecified));
        emit FeeQuoteObserved(marginalFeeBps, effectiveFeeBps, feeAmount);
        hook.beforeSwap(msg.sender, key, second, data);
    }

    /// @dev Programs the two Pool.State words read by StateLibrary.
    function setPoolState(PoolId poolId, uint160 sqrtPriceX96, uint128 liquidity) external {
        bytes32 stateSlot = keccak256(abi.encodePacked(PoolId.unwrap(poolId), POOLS_SLOT));
        poolWords[stateSlot] = bytes32(uint256(sqrtPriceX96));
        poolWords[bytes32(uint256(stateSlot) + LIQUIDITY_OFFSET)] = bytes32(uint256(liquidity));
    }

    function extsload(bytes32 slot) external view returns (bytes32) {
        return poolWords[slot];
    }

    function take(Currency currency, address to, uint256 amount) external {
        address currencyAddress = Currency.unwrap(currency);
        taken[currencyAddress][to] += amount;
        emit TakeCalled(currencyAddress, to, amount);
    }
}
