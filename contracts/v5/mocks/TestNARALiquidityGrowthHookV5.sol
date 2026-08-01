// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {NARALiquidityGrowthHookV5} from "../NARALiquidityGrowthHookV5.sol";
import {INARALiquidityGrowthVaultV5} from "../interfaces/INARALiquidityGrowthVaultV5.sol";

/// @dev Test-only variant that bypasses hook-address flag validation.
contract TestNARALiquidityGrowthHookV5 is NARALiquidityGrowthHookV5 {
    constructor(
        IPoolManager manager_,
        address owner_,
        address token_,
        address base_,
        INARALiquidityGrowthVaultV5 vault_,
        uint160 expectedSqrtPriceX96_,
        uint256 minimumBootstrapLiquidity_,
        uint256 minimumTokenAmount_,
        uint256 minimumBaseAmount_,
        uint16[] memory laterPhaseFeeBps_,
        uint128[] memory laterPhaseMinimumActiveLiquidity_
    )
        NARALiquidityGrowthHookV5(
            manager_,
            owner_,
            token_,
            base_,
            vault_,
            expectedSqrtPriceX96_,
            minimumBootstrapLiquidity_,
            minimumTokenAmount_,
            minimumBaseAmount_,
            laterPhaseFeeBps_,
            laterPhaseMinimumActiveLiquidity_
        )
    {}

    function validateHookAddress(BaseHook) internal pure override {}
}
