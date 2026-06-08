// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal interface for the engine bribe call.
interface IBribeEngine {
    function NARA() external view returns (address);
    function notifyTokenRewards(address token, uint256 amount) external;
}

/// @title BribeRouterV4
/// @notice Permissionless delivery for one explicitly approved ERC-20 reward token.
///
/// @dev Problem: engine.notifyTokenRewards() is gated behind REWARD_NOTIFIER_ROLE.
///      This contract holds that role and exposes a permissionless `notify(token, amount)`.
///      A router is deployed for one reviewed reward token and minimum amount so a dust
///      bribe or arbitrary ERC-20 cannot globally change active-position extension UX.
///
///      Flow per call:
///        1. Caller approves BribeRouter for `amount` of `token`.
///        2. BribeRouter pulls `token` from caller.
///        3. BribeRouter approves engine for `amount`.
///        4. BribeRouter calls engine.notifyTokenRewards(token, amount).
///        5. Engine pulls from BribeRouter; reward index updated for all active lockers.
///        6. BribeRouter clears approval to engine.
///
///      No mutable state. No admin. No fees. No upgrade. Holds zero balance across calls.
///
///      REWARD_NOTIFIER_ROLE must be granted to this contract by the engine admin
///      after deployment. The engine validates:
///        - token matches this router's immutable reward token
///        - amount > 0
///        - activeTotalWeight > 0 (at least one active locker exists)
contract BribeRouterV4 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IBribeEngine public immutable ENGINE;
    address      public immutable NARA;
    address      public immutable REWARD_TOKEN;
    uint256      public immutable MIN_AMOUNT;

    event BribeNotified(address indexed caller, address indexed token, uint256 amount);

    error BribeRouterZeroAddress();
    error BribeRouterNotAContract();
    error BribeRouterNaraNotAllowed();
    error BribeRouterZeroAmount();
    error BribeRouterTokenNotAllowed();
    error BribeRouterAmountTooSmall(uint256 minimum, uint256 provided);

    constructor(address engine_, address rewardToken_, uint256 minAmount_) {
        if (engine_ == address(0) || rewardToken_ == address(0)) revert BribeRouterZeroAddress();
        if (engine_.code.length == 0 || rewardToken_.code.length == 0) revert BribeRouterNotAContract();
        ENGINE = IBribeEngine(engine_);
        NARA   = IBribeEngine(engine_).NARA();
        if (rewardToken_ == NARA) revert BribeRouterNaraNotAllowed();
        if (minAmount_ == 0) revert BribeRouterZeroAmount();
        REWARD_TOKEN = rewardToken_;
        MIN_AMOUNT = minAmount_;
    }

    /// @notice Route `amount` of `token` as a bribe to all active NARA weight holders.
    /// @dev    Caller must approve this contract for `amount` of `token` first.
    ///         The engine enforces its own guards (non-NARA token, active weight, non-zero).
    ///         This contract adds early guards to surface clear errors before the engine call.
    /// @param token  ERC-20 token to distribute. Must not be the NARA token.
    /// @param amount Amount to distribute. Must be > 0.
    function notify(address token, uint256 amount) external nonReentrant {
        if (token == NARA || token == address(0)) revert BribeRouterNaraNotAllowed();
        if (token != REWARD_TOKEN) revert BribeRouterTokenNotAllowed();
        if (amount == 0) revert BribeRouterZeroAmount();
        if (amount < MIN_AMOUNT) revert BribeRouterAmountTooSmall(MIN_AMOUNT, amount);

        // Pull from caller.
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Approve engine for exactly the received amount, call, then clear.
        IERC20(token).forceApprove(address(ENGINE), amount);
        ENGINE.notifyTokenRewards(token, amount);
        IERC20(token).forceApprove(address(ENGINE), 0);

        emit BribeNotified(msg.sender, token, amount);
    }
}
