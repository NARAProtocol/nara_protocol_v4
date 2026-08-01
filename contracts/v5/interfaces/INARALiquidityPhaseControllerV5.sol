// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice Immutable Hook V5 phase-controller binding.
/// @dev The production implementation must be direct/non-proxy and derive this
///      value on-chain from named, protocol-owned, recovery-locked positions in
///      the exact canonical pool and approved range. Claims, loose tokens,
///      donations, banked compounder assets, and third-party/JIT liquidity are
///      not active POL. It must also enforce the approved observation/milestone
///      policy and prevent position removal until Hook retirement.
interface INARALiquidityPhaseControllerV5 {
    function hook() external view returns (address);
    function poolId() external view returns (PoolId);
    function phaseScheduleHash() external view returns (bytes32);
    function configurationSealed() external view returns (bool);
    function configurationHash() external view returns (bytes32);
    function activeProtocolLiquidity() external view returns (uint256);
    function activationAllowed() external view returns (bool);
}
