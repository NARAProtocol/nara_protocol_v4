// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {INARALiquidityFeeEngineV5} from "../../interfaces/INARALiquidityFeeEngineV5.sol";

/// @dev Unit-test reciprocal controller/registry. Not a production component.
contract NARAPositionControllerBindingHarnessV5 {
    address public immutable engine;
    address public immutable token;
    mapping(address account => bool canonical) public isCanonicalAccount;

    constructor(address engine_, address token_) {
        engine = engine_;
        token = token_;
    }

    function setCanonicalAccount(address account, bool canonical) external {
        isCanonicalAccount[account] = canonical;
    }
}

/// @dev Unit-test fee-vault binding and exact pull caller. Not production code.
contract NARALiquidityFeeVaultBindingHarnessV5 {
    using SafeERC20 for IERC20;

    address public immutable token;
    address public immutable base;
    address public immutable engine;
    uint256 public pendingNaraClaims;
    uint256 public pendingBaseClaims;

    error Unauthorized();
    error FundingMismatch();

    constructor(address token_, address base_, address engine_) {
        token = token_;
        base = base_;
        engine = engine_;
    }

    function deposit(uint256 naraAmount, uint256 baseAmount)
        external
        returns (uint256 naraCredited, uint256 baseCredited)
    {
        _accrue(naraAmount, baseAmount);
        return INARALiquidityFeeEngineV5(engine).syncLiquidityFeeBacking();
    }

    function account(uint256 naraAmount, uint256 baseAmount) external returns (bool rewardsActive) {
        return _accrue(naraAmount, baseAmount);
    }

    function fund(uint256 naraAmount, uint256 baseAmount)
        external
        returns (uint256 naraCredited, uint256 baseCredited)
    {
        if (naraAmount != pendingNaraClaims || baseAmount != pendingBaseClaims) {
            revert FundingMismatch();
        }
        return INARALiquidityFeeEngineV5(engine).syncLiquidityFeeBacking();
    }

    function releaseAllEngineClaimsToEngine()
        external
        returns (uint256 naraAmount, uint256 baseAmount)
    {
        if (msg.sender != engine) revert Unauthorized();
        naraAmount = pendingNaraClaims;
        baseAmount = pendingBaseClaims;
        pendingNaraClaims = 0;
        pendingBaseClaims = 0;
        if (naraAmount != 0) IERC20(token).safeTransfer(engine, naraAmount);
        if (baseAmount != 0) IERC20(base).safeTransfer(engine, baseAmount);
    }

    function _accrue(uint256 naraAmount, uint256 baseAmount) private returns (bool rewardsActive) {
        pendingNaraClaims += naraAmount;
        pendingBaseClaims += baseAmount;
        return INARALiquidityFeeEngineV5(engine).accrueLiquidityFees(naraAmount, baseAmount);
    }
}

/// @dev Used to prove native claims fail atomically when the recipient rejects ETH.
contract NARARejectNativeHarnessV5 {
    receive() external payable {
        revert("REJECT_NATIVE");
    }
}
