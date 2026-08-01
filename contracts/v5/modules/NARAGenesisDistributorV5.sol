// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Domain-separated, fixed-allocation Merkle distributor for an explicitly approved V5 Genesis set.
/// @dev The explicit distribution domain avoids making the Merkle root depend on this contract's address.
contract NARAGenesisDistributorV5 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error InvalidConfiguration();
    error Unauthorized();
    error AlreadyFunded();
    error NotFunded();
    error DistributionClosed();
    error ClaimWindowOpen();
    error AlreadyClaimed();
    error InvalidProof();
    error AllocationExceeded();
    error UnsupportedTokenBehavior();
    error EtherNotAccepted();

    address public immutable token;
    address public immutable fundingAuthority;
    address public immutable unclaimedRecipient;
    uint256 public immutable allocation;
    bytes32 public immutable distributionDomain;
    bytes32 public immutable merkleRoot;
    uint64 public immutable claimDeadline;

    uint256 public totalClaimed;
    bool public funded;
    bool public closed;
    mapping(uint256 word => uint256 bitmap) private _claimedBitMap;

    event Funded(address indexed funder, uint256 amount);
    event Claimed(uint256 indexed index, address indexed account, uint256 amount);
    event Closed(address indexed unclaimedRecipient, uint256 unclaimedAmount);

    constructor(
        address token_,
        address fundingAuthority_,
        address unclaimedRecipient_,
        uint256 allocation_,
        bytes32 distributionDomain_,
        bytes32 merkleRoot_,
        uint64 claimDeadline_
    ) {
        if (token_ == address(0) || fundingAuthority_ == address(0) || unclaimedRecipient_ == address(0)) {
            revert InvalidAddress();
        }
        if (token_.code.length == 0) revert InvalidAddress();
        if (
            allocation_ == 0 || distributionDomain_ == bytes32(0) || merkleRoot_ == bytes32(0)
                || claimDeadline_ <= block.timestamp
        ) revert InvalidConfiguration();

        token = token_;
        fundingAuthority = fundingAuthority_;
        unclaimedRecipient = unclaimedRecipient_;
        allocation = allocation_;
        distributionDomain = distributionDomain_;
        merkleRoot = merkleRoot_;
        claimDeadline = claimDeadline_;
    }

    /// @dev Worst case is limited to supplying the exact immutable Genesis allocation.
    function fund() external nonReentrant {
        if (msg.sender != fundingAuthority) revert Unauthorized();
        if (closed) revert DistributionClosed();
        if (funded) revert AlreadyFunded();
        funded = true;

        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), allocation);
        if (asset.balanceOf(address(this)) - beforeBalance != allocation) revert UnsupportedTokenBehavior();
        emit Funded(msg.sender, allocation);
    }

    function leaf(uint256 index, address account, uint256 amount) public view returns (bytes32) {
        return keccak256(
            abi.encode(block.chainid, token, distributionDomain, index, account, amount)
        );
    }

    function isClaimed(uint256 index) public view returns (bool) {
        uint256 wordIndex = index >> 8;
        uint256 bitIndex = index & 255;
        return (_claimedBitMap[wordIndex] & (uint256(1) << bitIndex)) != 0;
    }

    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata proof)
        external
        nonReentrant
    {
        if (!funded) revert NotFunded();
        if (closed || block.timestamp > claimDeadline) revert DistributionClosed();
        if (account == address(0)) revert InvalidAddress();
        if (isClaimed(index)) revert AlreadyClaimed();
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf(index, account, amount))) revert InvalidProof();

        uint256 nextClaimed = totalClaimed + amount;
        if (amount == 0 || nextClaimed > allocation) revert AllocationExceeded();
        _setClaimed(index);
        totalClaimed = nextClaimed;
        IERC20(token).safeTransfer(account, amount);
        emit Claimed(index, account, amount);
    }

    function close() external nonReentrant returns (uint256 unclaimed) {
        if (closed) revert DistributionClosed();
        if (block.timestamp <= claimDeadline) revert ClaimWindowOpen();
        closed = true;
        unclaimed = allocation - totalClaimed;
        if (funded && unclaimed != 0) IERC20(token).safeTransfer(unclaimedRecipient, unclaimed);
        emit Closed(unclaimedRecipient, funded ? unclaimed : 0);
    }

    function _setClaimed(uint256 index) private {
        uint256 wordIndex = index >> 8;
        uint256 bitIndex = index & 255;
        _claimedBitMap[wordIndex] |= uint256(1) << bitIndex;
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
