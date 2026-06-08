// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface INARAGenesisPositionNFTV4 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function genesisMetadataOf(uint256 tokenId)
        external
        view
        returns (
            bool isGenesis,
            bool isEternal,
            uint16 roundId,
            uint16 tierId,
            uint32 rewardMultiplierBps,
            uint64 mintedAt,
            uint256 rewardWeight
        );
}

/// @title NARA Genesis Allocation Distributor V4
/// @notice ETH and token distribution accounting for Genesis Position NFTs.
/// @dev The Position NFT contract is the weight authority. It calls this
///      distributor before Genesis Reward Weight changes so boosts cannot
///      retroactively claim allocations distributed before the boost.
contract NARAGenesisRewardDistributorV4 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant RAY = 1e27;

    address public immutable positionNft;
    IERC20 public immutable rewardToken;

    uint256 public accEthPerRewardWeightRay;
    uint256 public accTokenPerRewardWeightRay;
    uint256 public trackedGenesisRewardWeight;
    uint256 public pendingUndistributedEth;
    uint256 public pendingUndistributedToken;
    uint256 public totalEthReceived;
    uint256 public totalEthAllocated;
    uint256 public totalEthClaimed;
    uint256 public totalTokenReceived;
    uint256 public totalTokenAllocated;
    uint256 public totalTokenClaimed;

    mapping(uint256 => uint256) public trackedRewardWeightOf;
    mapping(uint256 => uint256) public rewardDebtRayOf;
    mapping(uint256 => uint256) public rewardTokenDebtRayOf;
    mapping(uint256 => uint256) public accruedEthOf;
    mapping(uint256 => uint256) public accruedTokenOf;
    mapping(uint256 => address) public closedOwnerOf;

    event EthRewardsNotified(
        address indexed sender,
        uint256 ethReceived,
        uint256 ethAllocated,
        uint256 totalRewardWeight,
        uint256 accEthPerRewardWeightRay
    );
    event UndistributedEthQueued(address indexed sender, uint256 ethReceived, uint256 pendingUndistributedEth);
    event TokenRewardsNotified(
        address indexed sender,
        address indexed token,
        uint256 amountReceived,
        uint256 amountAllocated,
        uint256 totalRewardWeight,
        uint256 accTokenPerRewardWeightRay
    );
    event UndistributedTokenQueued(address indexed sender, address indexed token, uint256 amountReceived, uint256 pendingUndistributedToken);
    event GenesisRewardWeightSynced(
        uint256 indexed tokenId,
        uint256 oldRewardWeight,
        uint256 newRewardWeight,
        uint256 accruedEth
    );
    event GenesisEthClaimed(uint256 indexed tokenId, address indexed owner, address indexed to, uint256 amount);
    event GenesisTokenClaimed(uint256 indexed tokenId, address indexed owner, address indexed to, uint256 amount);
    event GenesisPositionClosed(uint256 indexed tokenId, address indexed owner);

    error ZeroAddress();
    error InvalidReceiver();
    error NotAContract();
    error OnlyPositionNft();
    error NotTokenOwner();
    error EthTransferFailed();
    error DirectEthTransferDisabled();

    constructor(address positionNft_, address rewardToken_) {
        if (positionNft_ == address(0) || rewardToken_ == address(0)) revert ZeroAddress();
        if (positionNft_.code.length == 0 || rewardToken_.code.length == 0) revert NotAContract();
        positionNft = positionNft_;
        rewardToken = IERC20(rewardToken_);
    }

    receive() external payable {
        revert DirectEthTransferDisabled();
    }

    function notifyEthRewards() external payable nonReentrant returns (uint256 ethAllocated) {
        ethAllocated = _notify(msg.value);
    }

    function notifyTokenRewards(uint256 amount) external nonReentrant returns (uint256 tokenAllocated) {
        if (amount == 0) {
            return _notifyToken(0);
        }
        uint256 balanceBefore = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = rewardToken.balanceOf(address(this)) - balanceBefore;
        tokenAllocated = _notifyToken(received);
    }

    function allocateQueuedEth() external nonReentrant returns (uint256 ethAllocated) {
        ethAllocated = _notify(0);
    }

    function allocateQueuedToken() external nonReentrant returns (uint256 tokenAllocated) {
        tokenAllocated = _notifyToken(0);
    }

    function syncGenesisRewardWeight(uint256 tokenId) external nonReentrant {
        _syncToWeight(tokenId, _currentNftRewardWeight(tokenId));
    }

    function onGenesisRewardWeightChange(uint256 tokenId, uint256, uint256 newRewardWeight) external nonReentrant {
        if (msg.sender != positionNft) revert OnlyPositionNft();
        _syncToWeight(tokenId, newRewardWeight);
    }

    function claim(uint256 tokenId, address to) external nonReentrant returns (uint256 amount) {
        address owner = _rewardOwner(tokenId);
        if (msg.sender != owner) revert NotTokenOwner();
        amount = _claim(tokenId, owner, to);
    }

    function claimFromNft(uint256 tokenId, address to) external nonReentrant returns (uint256 amount) {
        if (msg.sender != positionNft) revert OnlyPositionNft();
        address owner = INARAGenesisPositionNFTV4(positionNft).ownerOf(tokenId);
        amount = _claim(tokenId, owner, to);
    }

    function claimToken(uint256 tokenId, address to) external nonReentrant returns (uint256 amount) {
        address owner = _rewardOwner(tokenId);
        if (msg.sender != owner) revert NotTokenOwner();
        amount = _claimToken(tokenId, owner, to);
    }

    function claimTokenFromNft(uint256 tokenId, address to) external nonReentrant returns (uint256 amount) {
        if (msg.sender != positionNft) revert OnlyPositionNft();
        address owner = INARAGenesisPositionNFTV4(positionNft).ownerOf(tokenId);
        amount = _claimToken(tokenId, owner, to);
    }

    function claimableEth(uint256 tokenId) external view returns (uint256) {
        return _claimableEth(tokenId);
    }

    function claimableToken(uint256 tokenId) external view returns (uint256) {
        return _claimableToken(tokenId);
    }

    function onGenesisPositionClosed(uint256 tokenId, address owner) external nonReentrant {
        if (msg.sender != positionNft) revert OnlyPositionNft();
        if (owner == address(0)) revert InvalidReceiver();
        _syncToWeight(tokenId, 0);
        closedOwnerOf[tokenId] = owner;
        emit GenesisPositionClosed(tokenId, owner);
    }

    function _notify(uint256 received) internal returns (uint256 ethAllocated) {
        if (received != 0) {
            totalEthReceived += received;
        }

        uint256 distributable = received + pendingUndistributedEth;
        if (distributable == 0) {
            return 0;
        }

        uint256 totalWeight = trackedGenesisRewardWeight;
        if (totalWeight == 0) {
            pendingUndistributedEth = distributable;
            emit UndistributedEthQueued(msg.sender, received, distributable);
            return 0;
        }

        uint256 indexDelta = (distributable * RAY) / totalWeight;
        uint256 allocated = (indexDelta * totalWeight) / RAY;
        pendingUndistributedEth = distributable - allocated;
        accEthPerRewardWeightRay += indexDelta;
        totalEthAllocated += allocated;

        emit EthRewardsNotified(msg.sender, received, allocated, totalWeight, accEthPerRewardWeightRay);
        return allocated;
    }

    function _notifyToken(uint256 received) internal returns (uint256 tokenAllocated) {
        if (received != 0) {
            totalTokenReceived += received;
        }

        uint256 distributable = received + pendingUndistributedToken;
        if (distributable == 0) {
            return 0;
        }

        uint256 totalWeight = trackedGenesisRewardWeight;
        if (totalWeight == 0) {
            pendingUndistributedToken = distributable;
            emit UndistributedTokenQueued(msg.sender, address(rewardToken), received, distributable);
            return 0;
        }

        uint256 indexDelta = (distributable * RAY) / totalWeight;
        uint256 allocated = (indexDelta * totalWeight) / RAY;
        pendingUndistributedToken = distributable - allocated;
        accTokenPerRewardWeightRay += indexDelta;
        totalTokenAllocated += allocated;

        emit TokenRewardsNotified(msg.sender, address(rewardToken), received, allocated, totalWeight, accTokenPerRewardWeightRay);
        return allocated;
    }

    function _claim(uint256 tokenId, address owner, address to) internal returns (uint256 amount) {
        if (to == address(0)) revert InvalidReceiver();

        _syncToWeight(tokenId, _currentNftRewardWeight(tokenId));

        amount = accruedEthOf[tokenId];
        if (amount == 0) {
            return 0;
        }

        accruedEthOf[tokenId] = 0;
        totalEthClaimed += amount;

        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert EthTransferFailed();

        emit GenesisEthClaimed(tokenId, owner, to, amount);
    }

    function _claimToken(uint256 tokenId, address owner, address to) internal returns (uint256 amount) {
        if (to == address(0)) revert InvalidReceiver();

        _syncToWeight(tokenId, _currentNftRewardWeight(tokenId));

        amount = accruedTokenOf[tokenId];
        if (amount == 0) {
            return 0;
        }

        accruedTokenOf[tokenId] = 0;
        totalTokenClaimed += amount;
        rewardToken.safeTransfer(to, amount);

        emit GenesisTokenClaimed(tokenId, owner, to, amount);
    }

    function _syncToWeight(uint256 tokenId, uint256 newRewardWeight) internal {
        uint256 oldRewardWeight = trackedRewardWeightOf[tokenId];
        uint256 accrued = _claimableEth(tokenId);
        uint256 accruedToken = _claimableToken(tokenId);

        accruedEthOf[tokenId] = accrued;
        accruedTokenOf[tokenId] = accruedToken;
        rewardDebtRayOf[tokenId] = accEthPerRewardWeightRay;
        rewardTokenDebtRayOf[tokenId] = accTokenPerRewardWeightRay;

        if (oldRewardWeight != newRewardWeight) {
            trackedRewardWeightOf[tokenId] = newRewardWeight;
            trackedGenesisRewardWeight = trackedGenesisRewardWeight - oldRewardWeight + newRewardWeight;
        }

        emit GenesisRewardWeightSynced(tokenId, oldRewardWeight, newRewardWeight, accrued);
    }

    function _claimableEth(uint256 tokenId) internal view returns (uint256) {
        uint256 accrued = accruedEthOf[tokenId];
        uint256 weight = trackedRewardWeightOf[tokenId];
        if (weight == 0) {
            return accrued;
        }

        return accrued + ((weight * (accEthPerRewardWeightRay - rewardDebtRayOf[tokenId])) / RAY);
    }

    function _claimableToken(uint256 tokenId) internal view returns (uint256) {
        uint256 accrued = accruedTokenOf[tokenId];
        uint256 weight = trackedRewardWeightOf[tokenId];
        if (weight == 0) {
            return accrued;
        }

        return accrued + ((weight * (accTokenPerRewardWeightRay - rewardTokenDebtRayOf[tokenId])) / RAY);
    }

    function _currentNftRewardWeight(uint256 tokenId) internal view returns (uint256 rewardWeight) {
        (bool isGenesis,,,,,, uint256 weight) = INARAGenesisPositionNFTV4(positionNft).genesisMetadataOf(tokenId);
        if (isGenesis) {
            rewardWeight = weight;
        }
    }

    function _rewardOwner(uint256 tokenId) internal view returns (address owner) {
        owner = closedOwnerOf[tokenId];
        if (owner == address(0)) {
            owner = INARAGenesisPositionNFTV4(positionNft).ownerOf(tokenId);
        }
    }
}
