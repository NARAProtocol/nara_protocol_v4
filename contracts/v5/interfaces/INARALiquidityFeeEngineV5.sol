// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Dedicated reciprocal receiver for the post-Bootstrap share of V5
///         liquidity-hook fees.
/// @dev The fresh V5 engine must classify rewards against the weight that exists
///      at fee accrual, before delayed PoolManager-claim redemption can occur.
///      Do not reuse V4's generic notifier/sync pattern.
interface INARALiquidityFeeEngineV5 {
    function NARA() external view returns (address);
    function feeBase() external view returns (address);
    function liquidityFeeVault() external view returns (address);
    function liquidityFeeRoutingReady() external view returns (bool);

    /// @notice Irrevocably classifies newly accrued Hook fees against the current
    ///         eligible reward weight, without moving the backing tokens yet.
    function accrueLiquidityFees(uint256 naraAmount, uint256 baseAmount)
        external
        returns (bool rewardsActive);

    /// @notice Pulls and reconciles all currently pending backing directly from
    ///         the bound Vault. Permissionless and safe to call before claims.
    function syncLiquidityFeeBacking()
        external
        returns (uint256 naraFunded, uint256 baseFunded);

    function totalLiquidityNaraFeesReceived() external view returns (uint256);
    function totalLiquidityBaseFeesReceived() external view returns (uint256);
    function pendingActiveNaraFeeFunding() external view returns (uint256);
    function pendingActiveBaseFeeFunding() external view returns (uint256);
    function pendingInactiveNaraFeeFunding() external view returns (uint256);
    function pendingInactiveBaseFeeFunding() external view returns (uint256);
}
