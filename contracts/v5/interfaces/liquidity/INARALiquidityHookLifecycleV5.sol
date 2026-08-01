// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice The immutable lifecycle surface used by the V5 liquidity companions.
interface INARALiquidityHookLifecycleV5 {
    function token() external view returns (address);
    function base() external view returns (address);
    function poolManager() external view returns (address);
    function vault() external view returns (address);
    function phaseController() external view returns (address);
    function poolId() external view returns (PoolId);
    function phaseScheduleHash() external view returns (bytes32);
    function phaseCount() external view returns (uint256);
    function currentPhase() external view returns (uint8);
    function phaseMinimumActiveLiquidity(uint256 phase) external view returns (uint128);
    function poolActive() external view returns (bool);
    function poolRetired() external view returns (bool);
    function advancePhase(uint8 expectedCurrentPhase) external;
    function retirePool() external;
}
