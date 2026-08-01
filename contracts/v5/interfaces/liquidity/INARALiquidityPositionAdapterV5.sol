// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice Narrow no-swap boundary between the receipt-accounting compounder
///         and reviewed Uniswap PositionManager action encoding.
/// @dev A production adapter remains a separate reviewed release artifact. The
///      compounder independently verifies ownership, range, pool and liquidity.
interface INARALiquidityPositionAdapterV5 {
    function token() external view returns (address);
    function base() external view returns (address);
    function poolManager() external view returns (address);
    function positionManager() external view returns (address);
    function compounder() external view returns (address);
    function poolId() external view returns (PoolId);
    function tickLower() external view returns (int24);
    function tickUpper() external view returns (int24);
    function configuredMinimumNaraUsed() external view returns (uint256);
    function configuredMinimumBaseUsed() external view returns (uint256);
    function configurationHash() external view returns (bytes32);

    function addLiquidity(
        uint256 currentPositionTokenId,
        uint256 maximumNara,
        uint256 maximumBase,
        uint256 minimumNaraUsed,
        uint256 minimumBaseUsed,
        uint128 minimumLiquidity,
        uint64 deadline
    ) external returns (
        uint256 positionTokenId,
        uint128 liquidityAdded,
        uint256 naraUsed,
        uint256 baseUsed,
        uint256 naraLpFeesHarvested,
        uint256 baseLpFeesHarvested
    );
}
