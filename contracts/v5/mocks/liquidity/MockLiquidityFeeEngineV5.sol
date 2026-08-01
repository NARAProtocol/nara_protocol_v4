// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {INARALiquidityFeeEngineV5} from "../../interfaces/INARALiquidityFeeEngineV5.sol";
import {INARALiquidityVaultRoutingV5} from "../../interfaces/liquidity/INARALiquidityVaultRoutingV5.sol";

contract MockLiquidityFeeEngineV5 is INARALiquidityFeeEngineV5 {
    address public immutable override NARA;
    address public immutable override feeBase;
    address public immutable override liquidityFeeVault;
    bool public override liquidityFeeRoutingReady = true;
    uint256 public override totalLiquidityNaraFeesReceived;
    uint256 public override totalLiquidityBaseFeesReceived;
    uint256 public override pendingActiveNaraFeeFunding;
    uint256 public override pendingActiveBaseFeeFunding;
    uint256 public override pendingInactiveNaraFeeFunding;
    uint256 public override pendingInactiveBaseFeeFunding;

    error Unauthorized();
    error FundingMismatch();

    constructor(address nara_, address feeBase_, address vault_) {
        NARA = nara_;
        feeBase = feeBase_;
        liquidityFeeVault = vault_;
    }

    function setRoutingReady(bool ready) external {
        liquidityFeeRoutingReady = ready;
    }

    function accrueLiquidityFees(uint256 naraAmount, uint256 baseAmount)
        external
        override
        returns (bool rewardsActive)
    {
        if (msg.sender != liquidityFeeVault) revert Unauthorized();
        pendingActiveNaraFeeFunding += naraAmount;
        pendingActiveBaseFeeFunding += baseAmount;
        return true;
    }

    function syncLiquidityFeeBacking()
        external
        override
        returns (uint256 naraFunded, uint256 baseFunded)
    {
        naraFunded = pendingActiveNaraFeeFunding;
        baseFunded = pendingActiveBaseFeeFunding;
        if (naraFunded == 0 && baseFunded == 0) return (0, 0);
        uint256 naraBefore = IERC20(NARA).balanceOf(address(this));
        uint256 baseBefore = IERC20(feeBase).balanceOf(address(this));
        (uint256 naraReleased, uint256 baseReleased) =
            INARALiquidityVaultRoutingV5(liquidityFeeVault).releaseAllEngineClaimsToEngine();
        if (
            naraReleased != naraFunded || baseReleased != baseFunded
                || IERC20(NARA).balanceOf(address(this)) - naraBefore != naraFunded
                || IERC20(feeBase).balanceOf(address(this)) - baseBefore != baseFunded
        ) revert FundingMismatch();
        pendingActiveNaraFeeFunding = 0;
        pendingActiveBaseFeeFunding = 0;
        totalLiquidityNaraFeesReceived += naraFunded;
        totalLiquidityBaseFeesReceived += baseFunded;
    }
}
