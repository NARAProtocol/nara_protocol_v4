// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @notice Reciprocal binding and atomic fee-claim accounting surface required by Hook V5.
interface INARALiquidityGrowthVaultV5 {
    struct SwapFeeRecord {
        PoolId poolId;
        address swapCaller;
        address inputCurrency;
        address outputCurrency;
        uint256 grossInput;
        uint256 inputFee;
        uint256 grossOutput;
        uint256 outputFee;
        uint16 feeBps;
        uint8 phase;
        bool isBuy;
    }

    function token() external view returns (address);
    function base() external view returns (address);
    function poolManager() external view returns (address);
    function hook() external view returns (address);
    function poolId() external view returns (PoolId);
    function configurationSealed() external view returns (bool);
    function configurationHash() external view returns (bytes32);

    /// @dev Fees arrive as PoolManager ERC-6909 currency claims. The production
    ///      implementation must be direct/non-proxy, only-hook, bounded,
    ///      non-pausable while the pool is active, and synchronously pin any
    ///      Engine share to the accrual-time reward weight. Token backing moves
    ///      later. Any revert rolls back both claims, the AMM swap, and every
    ///      accounting write.
    function recordSwapFees(SwapFeeRecord calldata record) external;
}
