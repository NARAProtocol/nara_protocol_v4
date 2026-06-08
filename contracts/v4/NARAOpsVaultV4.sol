// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

// NARA Protocol v4 Ops Vault
// https://farcaster.xyz/naraprotocol
//
// Holds 10,000 NARA for protocol operations with linear vesting.
// The owner can only withdraw vested tokens — no cliff, pure linear.
// Designed to be funded once at deploy and never topped up.

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title NARAOpsVaultV4
/// @notice Linear vesting vault for 10,000 NARA ops allocation.
///         Tokens vest continuously from deploy time over `vestingDuration`.
///         Owner may withdraw up to the vested amount at any point.
///         Hard cap: 10,000 NARA (MAX_OPS_ALLOCATION). Contract reverts if
///         more than this is deposited.
contract NARAOpsVaultV4 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ─────────────────────────────────────────────────────────────
    /// @notice Hard ceiling for this vault. 10,000 NARA.
    uint256 public constant MAX_OPS_ALLOCATION = 10_000e18;

    /// @notice Minimum vesting duration to prevent instant withdrawal on deploy.
    uint64 public constant MIN_VESTING_DURATION = 30 days;

    // ─── Errors ────────────────────────────────────────────────────────────────
    error ZeroAddress();
    error ZeroValue();
    error NotOwner();
    error AlreadyFunded();
    error AllocationTooLarge();
    error InvalidAllocation();
    error VestingDurationTooShort();
    error NothingVested();
    error NaraSweepForbidden();
    error OwnershipTransferPending();
    error NoPendingOwner();

    // ─── State ─────────────────────────────────────────────────────────────────
    IERC20 public immutable nara;

    /// @notice Total NARA deposited into this vault (set on first fund, immutable after).
    uint256 public totalAllocation;

    /// @notice Vesting start time (set when funded).
    uint64 public vestingStart;

    /// @notice Total vesting period in seconds.
    uint64 public immutable vestingDuration;

    /// @notice How much has been withdrawn so far.
    uint256 public withdrawn;

    /// @notice Current owner (beneficiary of vested NARA).
    address public owner;

    /// @notice Two-step ownership: pending new owner.
    address public pendingOwner;

    bool public funded;

    // ─── Events ────────────────────────────────────────────────────────────────
    event Funded(uint256 amount, uint64 vestingStart, uint64 vestingEnd);
    event Withdrawn(address indexed to, uint256 amount, uint256 totalWithdrawn);
    event OwnershipTransferProposed(address indexed newOwner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ForeignTokenSwept(address indexed token, address indexed to, uint256 amount);

    // ─── Constructor ───────────────────────────────────────────────────────────
    /// @param nara_            v4 NARA token address.
    /// @param owner_           Initial beneficiary.
    /// @param vestingDuration_ Seconds over which tokens vest (>= 30 days).
    constructor(address nara_, address owner_, uint64 vestingDuration_) {
        if (nara_ == address(0) || owner_ == address(0)) revert ZeroAddress();
        if (vestingDuration_ < MIN_VESTING_DURATION) revert VestingDurationTooShort();
        nara = IERC20(nara_);
        owner = owner_;
        vestingDuration = vestingDuration_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── Fund (one-shot) ───────────────────────────────────────────────────────
    /// @notice Fund the vault with NARA. Must be called exactly once.
    ///         Caller must have approved this contract for `amount`.
    ///         `amount` must equal MAX_OPS_ALLOCATION.
    function fund(uint256 amount) external onlyOwner nonReentrant {
        if (funded) revert AlreadyFunded();
        if (amount == 0) revert ZeroValue();
        if (amount != MAX_OPS_ALLOCATION) revert InvalidAllocation();

        funded = true;
        totalAllocation = amount;
        vestingStart = uint64(block.timestamp);

        nara.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(amount, vestingStart, vestingStart + vestingDuration);
    }

    // ─── Views ─────────────────────────────────────────────────────────────────
    /// @notice NARA vested so far (linear, capped at totalAllocation).
    function vestedAmount() public view returns (uint256) {
        uint256 allocation = totalAllocation;
        if (allocation == 0 || vestingStart == 0) return 0;
        uint256 elapsed = block.timestamp - uint256(vestingStart);
        uint256 duration = uint256(vestingDuration);
        if (elapsed >= duration) return allocation;
        return (allocation * elapsed) / duration;
    }

    /// @notice NARA available to withdraw right now.
    function withdrawable() public view returns (uint256) {
        uint256 vested = vestedAmount();
        uint256 alreadyWithdrawn = withdrawn;
        return vested > alreadyWithdrawn ? vested - alreadyWithdrawn : 0;
    }

    // ─── Withdraw ──────────────────────────────────────────────────────────────
    /// @notice Withdraw all currently vested NARA to `to`.
    function withdraw(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = withdrawable();
        if (amount == 0) revert NothingVested();
        withdrawn += amount;
        nara.safeTransfer(to, amount);
        emit Withdrawn(to, amount, withdrawn);
    }

    /// @notice Withdraw a specific amount (must be <= withdrawable).
    function withdrawAmount(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroValue();
        uint256 available = withdrawable();
        if (amount > available) revert NothingVested();
        withdrawn += amount;
        nara.safeTransfer(to, amount);
        emit Withdrawn(to, amount, withdrawn);
    }

    // ─── Ownership (two-step) ──────────────────────────────────────────────────
    function proposeOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferProposed(newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NoPendingOwner();
        address old = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(old, owner);
    }

    // ─── Emergency sweep (foreign tokens only) ─────────────────────────────────
    function sweepForeignToken(address token, address to, uint256 amount)
        external onlyOwner nonReentrant
    {
        if (token == address(nara)) revert NaraSweepForbidden();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit ForeignTokenSwept(token, to, amount);
    }
}
