// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {INARALiquidityPhaseControllerV5} from "../interfaces/INARALiquidityPhaseControllerV5.sol";

interface IPhaseAdvanceHookV5 {
    function advancePhase(uint8 expectedCurrentPhase) external;
    function retirePool() external;
}

contract MockNARALiquidityPhaseControllerV5 is INARALiquidityPhaseControllerV5 {
    address public override hook;
    PoolId public override poolId;
    bytes32 public override phaseScheduleHash;
    bool public override configurationSealed;
    bytes32 public override configurationHash;
    bool public staticConfigured;
    uint256 public override activeProtocolLiquidity;
    bool public override activationAllowed = true;

    error AlreadyBound();
    error InvalidStaticBinding();

    function configureStatic(PoolId poolId_, bytes32 phaseScheduleHash_) external {
        if (staticConfigured) revert AlreadyBound();
        if (PoolId.unwrap(poolId_) == bytes32(0) || phaseScheduleHash_ == bytes32(0)) {
            revert InvalidStaticBinding();
        }
        poolId = poolId_;
        phaseScheduleHash = phaseScheduleHash_;
        staticConfigured = true;
    }

    function bind(address hook_, PoolId poolId_, bytes32 phaseScheduleHash_) external {
        if (hook != address(0)) revert AlreadyBound();
        if (
            !staticConfigured || PoolId.unwrap(poolId_) != PoolId.unwrap(poolId)
                || phaseScheduleHash_ != phaseScheduleHash
        ) revert InvalidStaticBinding();
        hook = hook_;
        configurationHash = keccak256(abi.encode(hook_, PoolId.unwrap(poolId_), phaseScheduleHash_));
        configurationSealed = true;
    }

    function setActiveProtocolLiquidity(uint256 activeProtocolLiquidity_) external {
        activeProtocolLiquidity = activeProtocolLiquidity_;
    }

    function setActivationAllowed(bool activationAllowed_) external {
        activationAllowed = activationAllowed_;
    }

    function setConfigurationSealed(bool value) external {
        configurationSealed = value;
    }

    function setConfigurationHash(bytes32 value) external {
        configurationHash = value;
    }

    function advance(uint8 expectedCurrentPhase) external {
        IPhaseAdvanceHookV5(hook).advancePhase(expectedCurrentPhase);
    }

    function retire() external {
        IPhaseAdvanceHookV5(hook).retirePool();
    }
}
