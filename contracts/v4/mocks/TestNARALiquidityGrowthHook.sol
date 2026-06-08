// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IPoolManager.sol";
import {NARALiquidityGrowthHook, INARALiquidityGrowthVault} from "../NARALiquidityGrowthHook.sol";

/// @dev Test-only hook that skips Uniswap v4 hook-address bit validation.
contract TestNARALiquidityGrowthHook is NARALiquidityGrowthHook {
    constructor(
        IPoolManager manager_,
        address owner_,
        address token_,
        address base_,
        INARALiquidityGrowthVault vault_
    ) NARALiquidityGrowthHook(manager_, owner_, token_, base_, vault_) {}

    function validateHookAddress(BaseHook) internal pure override {}
}
