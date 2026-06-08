// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Mock engine for BribeRouterV4 tests.
/// Mirrors engine.notifyTokenRewards: pulls from msg.sender via safeTransferFrom.
contract MockEngineForBribe {
    using SafeERC20 for IERC20;

    address public immutable naraToken;

    bool   public revertOnNotify;
    address public lastToken;
    uint256 public lastAmount;
    mapping(address => uint256) public totalReceived;

    error NotifyFailed();

    constructor(address nara_) {
        naraToken = nara_;
    }

    function NARA() external view returns (address) { return naraToken; }

    function setRevertOnNotify(bool v) external { revertOnNotify = v; }

    /// @dev Mirrors engine: pulls from msg.sender (= BribeRouter).
    function notifyTokenRewards(address token, uint256 amount) external {
        if (revertOnNotify) revert NotifyFailed();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        lastToken  = token;
        lastAmount = amount;
        totalReceived[token] += amount;
    }

    /// @dev Returns (lastToken, lastAmount) for test assertions.
    function lastNotified() external view returns (address, uint256) {
        return (lastToken, lastAmount);
    }
}
