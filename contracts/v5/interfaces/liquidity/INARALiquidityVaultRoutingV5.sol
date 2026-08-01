// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

interface INARALiquidityVaultRoutingV5 {
    enum RoutingState {
        Unbound,
        BootstrapLiquidity,
        Shared,
        Retired
    }

    function token() external view returns (address);
    function base() external view returns (address);
    function poolManager() external view returns (address);
    function hook() external view returns (address);
    function controller() external view returns (address);
    function compounder() external view returns (address);
    function engine() external view returns (address);
    function poolId() external view returns (PoolId);
    function configurationSealed() external view returns (bool);
    function configurationHash() external view returns (bytes32);
    function routingState() external view returns (RoutingState);
    function enterShared() external;
    function retire() external;
    function releaseLiquidityClaims(bytes32 receiptId, uint256 naraAmount, uint256 baseAmount) external;
    function releaseAllEngineClaimsToEngine()
        external
        returns (uint256 naraAmount, uint256 baseAmount);
    function settleRetirementClaims(bytes32 receiptId) external;
    function allClassifiedClaimsProcessed() external view returns (bool);
}
