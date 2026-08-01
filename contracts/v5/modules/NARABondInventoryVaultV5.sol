// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INARABondDepositoryV5} from "../interfaces/modules/INARABondDepositoryV5.sol";

/// @notice Sealed one-campaign V5 bond allocation with terminal delayed recovery.
/// @dev Only the immutable NFT depository can draw live inventory. After that
///      depository finalizes, anyone may execute the delayed recovery, but the
///      immutable recipient is the only account that can receive recovered NARA.
contract NARABondInventoryVaultV5 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant MIN_RECOVERY_DELAY = 1 hours;
    uint64 public constant MAX_RECOVERY_DELAY = 365 days;

    error InvalidAddress();
    error InvalidAllocation();
    error InvalidRecoveryDelay();
    error Unauthorized();
    error AlreadyFunded();
    error NotFunded();
    error FundingNotAllowed();
    error CapacityExceeded();
    error PullsBlocked();
    error RecoveryNotReady();
    error UnsupportedTokenBehavior();
    error EtherNotAccepted();

    address public immutable token;
    address public immutable fundingAuthority;
    address public immutable depository;
    uint256 public immutable allocation;
    address public immutable recoveryRecipient;
    uint64 public immutable recoveryDelay;

    uint256 public distributed;
    bool public funded;
    bool public recoveryStarted;

    event Funded(address indexed funder, uint256 amount);
    event InventoryPulled(address indexed recipient, uint256 amount, uint256 cumulativeDistributed);
    event Recovered(address indexed caller, address indexed recipient, uint256 amount, bool firstRecovery);

    constructor(
        address token_,
        address fundingAuthority_,
        address depository_,
        uint256 allocation_,
        address recoveryRecipient_,
        uint64 recoveryDelay_
    ) {
        if (
            token_ == address(0) || fundingAuthority_ == address(0) || depository_ == address(0)
                || recoveryRecipient_ == address(0) || recoveryRecipient_ == address(this)
                || recoveryRecipient_ == depository_
        ) {
            revert InvalidAddress();
        }
        if (token_.code.length == 0 || depository_.code.length == 0) revert InvalidAddress();
        INARABondDepositoryV5 bond = INARABondDepositoryV5(depository_);
        if (bond.token() != token_ || allocation_ == 0 || allocation_ != bond.maximumCapacity()) {
            revert InvalidAllocation();
        }
        if (recoveryDelay_ < MIN_RECOVERY_DELAY || recoveryDelay_ > MAX_RECOVERY_DELAY) {
            revert InvalidRecoveryDelay();
        }
        token = token_;
        fundingAuthority = fundingAuthority_;
        depository = depository_;
        allocation = allocation_;
        recoveryRecipient = recoveryRecipient_;
        recoveryDelay = recoveryDelay_;
    }

    /// @dev Worst case is limited to supplying the exact immutable lifetime
    ///      capacity, and only after the one valid term is queued.
    function fund() external nonReentrant {
        if (msg.sender != fundingAuthority) revert Unauthorized();
        if (funded) revert AlreadyFunded();
        INARABondDepositoryV5 bond = INARABondDepositoryV5(depository);
        if (
            recoveryStarted || bond.inventoryVault() != address(this)
                || !bond.inventoryFundingAllowed()
        ) revert FundingNotAllowed();
        funded = true;

        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), allocation);
        if (asset.balanceOf(address(this)) - beforeBalance != allocation) revert UnsupportedTokenBehavior();
        emit Funded(msg.sender, allocation);
    }

    function pull(address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != depository) revert Unauthorized();
        if (!funded) revert NotFunded();
        if (recoveryStarted || INARABondDepositoryV5(depository).finalizedAt() != 0) {
            revert PullsBlocked();
        }
        if (recipient == address(0)) revert InvalidAddress();
        uint256 nextDistributed = distributed + amount;
        if (amount == 0 || nextDistributed > allocation) revert CapacityExceeded();
        distributed = nextDistributed;
        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(recipient);
        asset.safeTransfer(recipient, amount);
        if (asset.balanceOf(recipient) - beforeBalance != amount) revert UnsupportedTokenBehavior();
        emit InventoryPulled(recipient, amount, nextDistributed);
    }

    /// @notice Permissionlessly transfers all current NARA to the immutable
    ///         recovery recipient after terminal finalization and the sealed delay.
    /// @dev The first successful call permanently blocks later inventory pulls.
    ///      Calls remain repeatable so unsolicited NARA sent later is recoverable.
    function recover() external nonReentrant returns (uint256 amount) {
        uint64 availableAt = recoveryAvailableAt();
        if (availableAt == 0 || block.timestamp < availableAt) revert RecoveryNotReady();

        bool firstRecovery = !recoveryStarted;
        recoveryStarted = true;

        IERC20 asset = IERC20(token);
        amount = asset.balanceOf(address(this));
        if (amount != 0) {
            uint256 beforeBalance = asset.balanceOf(recoveryRecipient);
            asset.safeTransfer(recoveryRecipient, amount);
            if (
                asset.balanceOf(address(this)) != 0
                    || asset.balanceOf(recoveryRecipient) - beforeBalance != amount
            ) revert UnsupportedTokenBehavior();
        }
        emit Recovered(msg.sender, recoveryRecipient, amount, firstRecovery);
    }

    /// @notice Deterministic timestamp at which permissionless recovery opens.
    /// @return availableAt Zero before the Depository reaches a terminal state.
    function recoveryAvailableAt() public view returns (uint64 availableAt) {
        uint64 finalizedAt_ = INARABondDepositoryV5(depository).finalizedAt();
        if (finalizedAt_ == 0) return 0;
        uint256 computed = uint256(finalizedAt_) + uint256(recoveryDelay);
        if (computed > type(uint64).max) revert RecoveryNotReady();
        availableAt = uint64(computed);
    }

    /// @notice Current NARA amount a permissionless recovery would transfer.
    /// @dev `funded` remains a historical one-shot funding marker after recovery.
    function recoverableBalance() external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
