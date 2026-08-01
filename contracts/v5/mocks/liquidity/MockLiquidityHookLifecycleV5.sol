// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {INARALiquidityGrowthVaultV5} from "../../interfaces/INARALiquidityGrowthVaultV5.sol";

contract MockLiquidityHookLifecycleV5 {
    address public immutable token;
    address public immutable base;
    address public immutable poolManager;
    address public immutable vault;
    address public phaseController;
    PoolId public poolId;
    bytes32 public phaseScheduleHash;
    uint128[5] private _thresholds;
    uint8 public currentPhase;
    bool public poolActive;
    bool public poolRetired;
    bool public bound;

    error Unauthorized();
    error AlreadyBound();
    error InvalidPhase();

    constructor(address token_, address base_, address poolManager_, address vault_) {
        token = token_;
        base = base_;
        poolManager = poolManager_;
        vault = vault_;
    }

    function bind(
        address controller_,
        PoolId poolId_,
        bytes32 phaseScheduleHash_,
        uint128[5] calldata thresholds_
    ) external {
        if (bound) revert AlreadyBound();
        phaseController = controller_;
        poolId = poolId_;
        phaseScheduleHash = phaseScheduleHash_;
        _thresholds = thresholds_;
        poolActive = true;
        bound = true;
    }

    function phaseCount() external pure returns (uint256) {
        return 5;
    }

    function phaseMinimumActiveLiquidity(uint256 phase) external view returns (uint128) {
        return _thresholds[phase];
    }

    function setPoolActiveForTest(bool active_) external {
        if (poolRetired && active_) revert InvalidPhase();
        poolActive = active_;
    }

    function advancePhase(uint8 expectedCurrentPhase) external {
        if (msg.sender != phaseController) revert Unauthorized();
        if (expectedCurrentPhase != currentPhase || currentPhase >= 4 || poolRetired) revert InvalidPhase();
        unchecked {
            ++currentPhase;
        }
    }

    function retirePool() external {
        if (msg.sender != phaseController) revert Unauthorized();
        if (!poolActive || poolRetired) revert InvalidPhase();
        poolActive = false;
        poolRetired = true;
    }

    function recordFees(INARALiquidityGrowthVaultV5.SwapFeeRecord calldata record) external {
        INARALiquidityGrowthVaultV5(vault).recordSwapFees(record);
    }
}
