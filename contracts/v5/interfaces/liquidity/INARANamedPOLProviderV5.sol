// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

interface INARANamedPOLProviderV5 {
    function positionManager() external view returns (address);
    function hook() external view returns (address);
    function controller() external view returns (address);
    function poolId() external view returns (PoolId);
    function tickLower() external view returns (int24);
    function tickUpper() external view returns (int24);
    function positionTokenId() external view returns (uint256);
    function recoveryDelay() external view returns (uint64);
    function deploymentDomain() external view returns (uint8);
    function recoveryPending() external view returns (bool);
    function recoveryEta() external view returns (uint64);
    function retired() external view returns (bool);
    function configurationSealed() external view returns (bool);
    function configurationHash() external view returns (bytes32);
    function queueRecovery() external returns (uint64 eta);
    function cancelRecovery() external;
    function executeRecovery() external;
}
