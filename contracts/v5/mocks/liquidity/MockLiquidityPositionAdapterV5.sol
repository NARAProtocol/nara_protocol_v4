// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";

import {INARALiquidityPositionAdapterV5} from "../../interfaces/liquidity/INARALiquidityPositionAdapterV5.sol";
import {MockNamedPositionManagerV5} from "./MockNamedPositionManagerV5.sol";

interface IMockCompounderUsagePolicyV5 {
    function configuredMinimumNaraUsed() external view returns (uint256);
    function configuredMinimumBaseUsed() external view returns (uint256);
}

contract MockLiquidityPositionAdapterV5 is INARALiquidityPositionAdapterV5 {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    uint16 public constant BPS = 10_000;

    address public immutable override token;
    address public immutable override base;
    address public immutable override poolManager;
    address public immutable override positionManager;
    address public immutable override compounder;
    PoolId public immutable override poolId;
    int24 public immutable override tickLower;
    int24 public immutable override tickUpper;
    uint256 public immutable override configuredMinimumNaraUsed;
    uint256 public immutable override configuredMinimumBaseUsed;
    bytes32 public immutable override configurationHash;
    uint16 public immutable naraUseBps;
    uint16 public immutable baseUseBps;
    PoolKey private _poolKey;

    error Unauthorized();
    error InvalidConfig();
    error Expired();
    error Slippage();

    constructor(
        address token_,
        address base_,
        address poolManager_,
        address positionManager_,
        address compounder_,
        PoolKey memory poolKey_,
        int24 tickLower_,
        int24 tickUpper_,
        uint16 naraUseBps_,
        uint16 baseUseBps_
    ) {
        if (
            naraUseBps_ == 0 || naraUseBps_ > BPS || baseUseBps_ == 0 || baseUseBps_ > BPS
                || tickLower_ >= tickUpper_
        ) revert InvalidConfig();
        token = token_;
        base = base_;
        poolManager = poolManager_;
        positionManager = positionManager_;
        compounder = compounder_;
        _poolKey = poolKey_;
        poolId = poolKey_.toId();
        tickLower = tickLower_;
        tickUpper = tickUpper_;
        naraUseBps = naraUseBps_;
        baseUseBps = baseUseBps_;
        configuredMinimumNaraUsed =
            IMockCompounderUsagePolicyV5(compounder_).configuredMinimumNaraUsed();
        configuredMinimumBaseUsed =
            IMockCompounderUsagePolicyV5(compounder_).configuredMinimumBaseUsed();
        configurationHash = keccak256(
            abi.encode(
                token_,
                base_,
                poolManager_,
                positionManager_,
                compounder_,
                PoolId.unwrap(poolId),
                tickLower_,
                tickUpper_,
                configuredMinimumNaraUsed,
                configuredMinimumBaseUsed,
                naraUseBps_,
                baseUseBps_
            )
        );
    }

    function addLiquidity(
        uint256 currentPositionTokenId,
        uint256 maximumNara,
        uint256 maximumBase,
        uint256 minimumNaraUsed,
        uint256 minimumBaseUsed,
        uint128 minimumLiquidity,
        uint64 deadline
    ) external override returns (
        uint256 positionTokenId,
        uint128 liquidityAdded,
        uint256 naraUsed,
        uint256 baseUsed,
        uint256 naraLpFeesHarvested,
        uint256 baseLpFeesHarvested
    ) {
        if (msg.sender != compounder) revert Unauthorized();
        if (block.timestamp > deadline) revert Expired();
        naraUsed = Math.mulDiv(maximumNara, naraUseBps, BPS);
        baseUsed = Math.mulDiv(maximumBase, baseUseBps, BPS);
        uint256 rawLiquidity = Math.min(naraUsed, baseUsed);
        if (rawLiquidity > type(uint128).max) rawLiquidity = type(uint128).max;
        liquidityAdded = uint128(rawLiquidity);
        if (
            liquidityAdded < minimumLiquidity || naraUsed < minimumNaraUsed
                || baseUsed < minimumBaseUsed
                || minimumNaraUsed < configuredMinimumNaraUsed
                || minimumBaseUsed < configuredMinimumBaseUsed
        ) revert Slippage();
        IERC20(token).safeTransferFrom(msg.sender, address(this), naraUsed);
        IERC20(base).safeTransferFrom(msg.sender, address(this), baseUsed);
        if (currentPositionTokenId == 0) {
            positionTokenId = MockNamedPositionManagerV5(positionManager).mintNamedPosition(
                compounder, _poolKey, tickLower, tickUpper, liquidityAdded
            );
        } else {
            positionTokenId = currentPositionTokenId;
            MockNamedPositionManagerV5(positionManager).increaseLiquidity(positionTokenId, liquidityAdded);
        }
        naraLpFeesHarvested = 0;
        baseLpFeesHarvested = 0;
    }
}
