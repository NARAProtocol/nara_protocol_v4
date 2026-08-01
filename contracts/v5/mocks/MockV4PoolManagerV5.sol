// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

contract MockV4PoolManagerV5 {
    bytes32 internal constant POOLS_SLOT = bytes32(uint256(6));
    uint256 internal constant LIQUIDITY_OFFSET = 3;

    mapping(bytes32 slot => bytes32 value) internal poolWords;
    mapping(address owner => mapping(uint256 currencyId => uint256 amount)) private _claimBalance;
    bytes4 public lastBeforeSwapSelector;
    BeforeSwapDelta public lastBeforeSwapDelta;
    bytes4 public lastAfterSwapSelector;
    int128 public lastAfterSwapDelta;
    uint256 public mintCount;
    uint256 public revertOnMintNumber;

    error ForcedMintRevert();
    error ExpectedLifecycleRevert();

    event ClaimMinted(address indexed to, uint256 indexed currencyId, uint256 amount, uint256 sequence);

    function callBeforeInitialize(IHooks hook, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        returns (bytes4)
    {
        return hook.beforeInitialize(msg.sender, key, sqrtPriceX96);
    }

    function callSwapLifecycle(
        IHooks hook,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta rawAmmDelta,
        bytes calldata hookData
    ) external returns (BeforeSwapDelta beforeDelta, int128 afterDelta) {
        (lastBeforeSwapSelector, beforeDelta,) = hook.beforeSwap(msg.sender, key, params, hookData);
        lastBeforeSwapDelta = beforeDelta;
        (lastAfterSwapSelector, afterDelta) = hook.afterSwap(msg.sender, key, params, rawAmmDelta, hookData);
        lastAfterSwapDelta = afterDelta;
    }

    function callAfterSwap(
        IHooks hook,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta rawAmmDelta,
        bytes calldata hookData
    ) external returns (bytes4, int128) {
        return hook.afterSwap(msg.sender, key, params, rawAmmDelta, hookData);
    }

    function catchFailedLifecycleThenRetry(
        IHooks hook,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta failedDelta,
        BalanceDelta retryDelta,
        bytes calldata hookData
    ) external returns (BeforeSwapDelta beforeDelta, int128 afterDelta) {
        try this.callSwapLifecycle(hook, key, params, failedDelta, hookData) {
            revert ExpectedLifecycleRevert();
        } catch {}
        return this.callSwapLifecycle(hook, key, params, retryDelta, hookData);
    }

    function setPoolState(PoolId poolId, uint160 sqrtPriceX96, uint128 liquidity) external {
        int24 tick = TickMath.getTickAtSqrtPrice(sqrtPriceX96);
        _setPoolState(poolId, sqrtPriceX96, tick, 0, 3_000, liquidity);
    }

    function setRawPoolState(
        PoolId poolId,
        uint160 sqrtPriceX96,
        int24 tick,
        uint24 protocolFee,
        uint24 lpFee,
        uint128 liquidity
    ) external {
        _setPoolState(poolId, sqrtPriceX96, tick, protocolFee, lpFee, liquidity);
    }

    function _setPoolState(
        PoolId poolId,
        uint160 sqrtPriceX96,
        int24 tick,
        uint24 protocolFee,
        uint24 lpFee,
        uint128 liquidity
    ) internal {
        bytes32 stateSlot = keccak256(abi.encodePacked(PoolId.unwrap(poolId), POOLS_SLOT));
        poolWords[stateSlot] = bytes32(
            uint256(sqrtPriceX96) | (uint256(uint24(tick)) << 160) | (uint256(protocolFee) << 184)
                | (uint256(lpFee) << 208)
        );
        poolWords[bytes32(uint256(stateSlot) + LIQUIDITY_OFFSET)] = bytes32(uint256(liquidity));
    }

    function setRevertOnMintNumber(uint256 sequence) external {
        revertOnMintNumber = sequence;
    }

    function extsload(bytes32 slot) external view returns (bytes32) {
        return poolWords[slot];
    }

    function balanceOf(address owner, uint256 currencyId) external view returns (uint256) {
        return _claimBalance[owner][currencyId];
    }

    function mint(address to, uint256 currencyId, uint256 amount) external {
        unchecked {
            ++mintCount;
        }
        if (mintCount == revertOnMintNumber) revert ForcedMintRevert();
        _claimBalance[to][currencyId] += amount;
        emit ClaimMinted(to, currencyId, amount, mintCount);
    }

    function burnClaimForTest(address owner, uint256 currencyId, uint256 amount) external {
        _claimBalance[owner][currencyId] -= amount;
    }
}
