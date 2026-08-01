// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice One-allocation, immutable-schedule operations vesting vault.
contract NARAOpsVestingVaultV5 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error InvalidAllocation();
    error InvalidSchedule();
    error Unauthorized();
    error AlreadyFunded();
    error UnsupportedTokenBehavior();
    error NothingReleasable();
    error EtherNotAccepted();

    address public immutable token;
    address public immutable fundingAuthority;
    address public immutable beneficiary;
    uint256 public immutable allocation;
    uint64 public immutable start;
    uint64 public immutable cliff;
    uint64 public immutable end;

    uint256 public released;
    bool public funded;

    event Funded(address indexed funder, uint256 amount);
    event Released(address indexed beneficiary, uint256 amount, uint256 cumulativeReleased);

    constructor(
        address token_,
        address fundingAuthority_,
        address beneficiary_,
        uint256 allocation_,
        uint64 start_,
        uint64 cliff_,
        uint64 end_
    ) {
        if (token_ == address(0) || fundingAuthority_ == address(0) || beneficiary_ == address(0)) {
            revert InvalidAddress();
        }
        if (token_.code.length == 0) revert InvalidAddress();
        if (allocation_ == 0) revert InvalidAllocation();
        if (start_ >= end_ || cliff_ < start_ || cliff_ > end_) revert InvalidSchedule();

        token = token_;
        fundingAuthority = fundingAuthority_;
        beneficiary = beneficiary_;
        allocation = allocation_;
        start = start_;
        cliff = cliff_;
        end = end_;
    }

    /// @dev Worst case is limited to supplying the exact immutable allocation; it cannot change vesting terms.
    function fund() external nonReentrant {
        if (msg.sender != fundingAuthority) revert Unauthorized();
        if (funded) revert AlreadyFunded();
        funded = true;

        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), allocation);
        if (asset.balanceOf(address(this)) - beforeBalance != allocation) revert UnsupportedTokenBehavior();
        emit Funded(msg.sender, allocation);
    }

    function vestedAt(uint64 timestamp) public view returns (uint256) {
        if (timestamp < cliff) return 0;
        if (timestamp >= end) return allocation;
        return Math.mulDiv(allocation, uint256(timestamp - start), uint256(end - start));
    }

    function releasable() public view returns (uint256) {
        if (!funded) return 0;
        return vestedAt(uint64(block.timestamp)) - released;
    }

    /// @notice Permissionless execution always pays the immutable beneficiary.
    function release() external nonReentrant returns (uint256 amount) {
        amount = releasable();
        if (amount == 0) revert NothingReleasable();
        released += amount;
        IERC20(token).safeTransfer(beneficiary, amount);
        emit Released(beneficiary, amount, released);
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
