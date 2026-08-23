// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {NothingToClaim, Position} from "./NARAEngineTypes.sol";
import {NARAPositionAccountV4} from "./NARAPositionAccountV4.sol";
import {INARAPositionRendererV4} from "./interfaces/INARAPositionRendererV4.sol";

interface INARAEnginePositionNFTV4 {
    function lockFeeWei() external view returns (uint96);
    function unlockFeeWei() external view returns (uint96);
    function currentEpoch() external view returns (uint64);
    function positionOf(uint256 positionId) external view returns (Position memory);
}

interface INARAGenesisRewardDistributorV4NFT {
    function positionNft() external view returns (address);
    function rewardToken() external view returns (IERC20);
    function onGenesisRewardWeightChange(uint256 tokenId, uint256 oldRewardWeight, uint256 newRewardWeight) external;
    function onGenesisPositionClosed(uint256 tokenId, address owner) external;
    function claimFromNft(uint256 tokenId, address to) external returns (uint256 amount);
    function claimTokenFromNft(uint256 tokenId, address to) external returns (uint256 amount);
    function claimableEth(uint256 tokenId) external view returns (uint256 amount);
    function claimableToken(uint256 tokenId) external view returns (uint256 amount);
}

error NARAPositionNFTV4__ZeroAddress();
error NARAPositionNFTV4__NotAContract();
error NARAPositionNFTV4__ZeroAmount();
error NARAPositionNFTV4__IncorrectNativeFee(uint256 expected, uint256 actual);
error NARAPositionNFTV4__NotTokenOwner();
error NARAPositionNFTV4__InvalidReceiver();
error NARAPositionNFTV4__RoyaltyTooHigh(uint96 max, uint96 provided);
error NARAPositionNFTV4__NotGenesisMinter();
error NARAPositionNFTV4__InvalidGenesisConfig();
error NARAPositionNFTV4__NotGenesisPosition();
error NARAPositionNFTV4__EternalPosition();
error NARAPositionNFTV4__GenesisRewardDistributorAlreadySet();
error NARAPositionNFTV4__GenesisRewardDistributorNotSet();
error NARAPositionNFTV4__UnlockInProgress();
error NARAPositionNFTV4__PositionNotMatured();
error NARAPositionNFTV4__NativeTransferFailed();
error NARAPositionNFTV4__RoyaltiesFrozen();
error NARAPositionNFTV4__GenesisMintersFrozen();
error NARAPositionNFTV4__RendererFrozen();
error NARAPositionNFTV4__ClaimFeeTooHigh(uint16 max, uint16 provided);
error NARAPositionNFTV4__ClaimFeesFrozen();


/// @title NARAPositionNFTV4
/// @notice ERC-721 wrapper for tradable NARA v4 engine positions.
/// @dev Engine ownership stays with one clone account per NFT; NFT ownership controls that account.
contract NARAPositionNFTV4 is ERC721, ERC2981, IERC4906, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    uint256 public constant BPS = 10_000;
    uint96 public constant MAX_ROYALTY_BPS = 1_000;
    uint32 public constant MAX_GENESIS_REWARD_MULTIPLIER_BPS = 50_000;
    /// @notice Hard cap (10%) on the wrapper-level claim fees. Bytecode-enforced ceiling.
    uint16 public constant MAX_CLAIM_FEE_BPS = 1_000;

    struct GenesisMetadata {
        bool isGenesis;
        bool isEternal;
        uint16 roundId;
        uint16 tierId;
        uint32 rewardMultiplierBps;
        uint64 mintedAt;
        uint256 rewardWeight;
    }

    address public immutable engine;
    address public immutable nara;
    address public immutable accountImplementation;
    address public renderer;
    address public genesisRewardDistributor;
    bool public royaltyFrozen;
    bool public genesisMintersFrozen;
    bool public rendererFrozen;

    // Wrapper-level claim fees. The engine is immutable and at its size limit, so
    // these live here instead. They tax reward claims that flow through the NFT
    // wrapper only — positions held directly as EOAs via engine.lock() bypass them.
    // Both default to 0 (full pass-through) and are inert while claimFeeRecipient
    // is unset. naraClaimFeeBps taxes NARA emission claims; tokenClaimFeeBps taxes
    // bribed/external ERC20 reward claims. ETH claims are already taxed by the engine.
    uint16 public naraClaimFeeBps;
    uint16 public tokenClaimFeeBps;
    address public claimFeeRecipient;
    bool public claimFeesFrozen;

    // Per-position lifetime rewards delivered to holders through the wrapper. These
    // are realized, historical facts (not projections) and only change on a token-
    // specific claim tx, which makes them safe to surface in cached NFT metadata.
    // ETH reflects amounts net of the engine claim fee; NARA reflects amounts net
    // of any wrapper NARA claim fee — i.e. exactly what the holder received.
    mapping(uint256 => uint256) public lifetimeNaraClaimed;
    mapping(uint256 => uint256) public lifetimeEthClaimed;
    mapping(uint256 => uint32) public lifetimeClaimCount;
    mapping(uint256 => uint32) public lifetimeExtendCount;

    uint256 private _nextTokenId = 1;

    mapping(uint256 => address) public accountOf;
    mapping(address => uint256) public tokenOfAccount;
    mapping(uint256 => uint256) public positionIdOf;
    mapping(uint256 => uint256) public tokenOfPosition;
    mapping(uint256 => address) public closedRewardOwnerOfPosition;
    mapping(uint256 => address) public closedAccountOfPosition;
    mapping(uint256 => GenesisMetadata) public genesisMetadataOf;
    mapping(address => bool) public genesisMinter;
    mapping(uint256 => bool) public unlocking;

    uint256 public totalGenesisRewardWeight;

    event PositionMinted(
        address indexed minter,
        address indexed owner,
        uint256 indexed tokenId,
        address account,
        uint256 positionId,
        uint256 amount,
        uint64 durationEpochs
    );
    event PositionExtended(uint256 indexed tokenId, uint256 indexed positionId, uint64 additionalEpochs);
    event ClaimFeesSet(uint16 naraClaimFeeBps, uint16 tokenClaimFeeBps);
    event ClaimFeeRecipientSet(address indexed recipient);
    event ClaimFeesFrozen();
    event RendererSet(address indexed renderer);
    event RendererFrozen();
    event PositionRewardsClaimed(uint256 indexed tokenId, uint256 indexed positionId, address indexed to, uint256 naraAmount, uint256 ethAmount);
    event PositionTokenRewardsClaimed(uint256 indexed tokenId, uint256 indexed positionId, address indexed token, address to, uint256 amount);
    event ClosedPositionTokenRewardsClaimed(uint256 indexed positionId, address indexed token, address indexed to, uint256 amount);
    event PositionUnlocked(uint256 indexed tokenId, uint256 indexed positionId, address indexed to);
    event GenesisMinterSet(address indexed minter, bool allowed);
    event GenesisPositionMinted(
        uint256 indexed tokenId,
        uint256 indexed positionId,
        uint16 indexed roundId,
        uint16 tierId,
        uint32 rewardMultiplierBps,
        uint256 rewardWeight,
        bool eternal
    );
    event EternalGenesisBurned(uint256 indexed tokenId, uint256 indexed positionId, address indexed account, uint256 rewardWeightRemoved);
    event GenesisRewardDistributorSet(address indexed distributor);
    event GenesisEthClaimed(uint256 indexed tokenId, address indexed to, uint256 amount);
    event GenesisTokenClaimed(uint256 indexed tokenId, address indexed to, uint256 amount);
    event GenesisCloseNotifyFailed(uint256 indexed tokenId);
    event NativeSwept(address indexed to, uint256 amount);
    event RoyaltiesFrozen();
    event GenesisMintersFrozen();


    constructor(
        address engine_,
        address nara_,
        address accountImplementation_,
        address renderer_,
        address initialOwner_,
        address royaltyReceiver_,
        uint96 royaltyBps_
    )
        ERC721("NARA Position", "NARAPOS")
        Ownable(initialOwner_)
    {
        if (
            engine_ == address(0) ||
            nara_ == address(0) ||
            accountImplementation_ == address(0) ||
            renderer_ == address(0) ||
            initialOwner_ == address(0)
        ) revert NARAPositionNFTV4__ZeroAddress();
        if (
            engine_.code.length == 0 ||
            nara_.code.length == 0 ||
            accountImplementation_.code.length == 0 ||
            renderer_.code.length == 0
        ) {
            revert NARAPositionNFTV4__NotAContract();
        }
        if (royaltyBps_ > MAX_ROYALTY_BPS) {
            revert NARAPositionNFTV4__RoyaltyTooHigh(MAX_ROYALTY_BPS, royaltyBps_);
        }

        engine = engine_;
        nara = nara_;
        accountImplementation = accountImplementation_;
        renderer = renderer_;

        if (royaltyReceiver_ != address(0) && royaltyBps_ != 0) {
            _setDefaultRoyalty(royaltyReceiver_, royaltyBps_);
        }
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        if (royaltyFrozen) revert NARAPositionNFTV4__RoyaltiesFrozen();
        if (receiver == address(0)) revert NARAPositionNFTV4__ZeroAddress();
        if (feeNumerator > MAX_ROYALTY_BPS) {
            revert NARAPositionNFTV4__RoyaltyTooHigh(MAX_ROYALTY_BPS, feeNumerator);
        }
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function deleteDefaultRoyalty() external onlyOwner {
        if (royaltyFrozen) revert NARAPositionNFTV4__RoyaltiesFrozen();
        _deleteDefaultRoyalty();
    }

    /// @notice Permanently freezes the current ERC-2981 royalty configuration.
    /// @dev Worst-case impact: a mistaken royalty configuration can no longer be corrected.
    function freezeRoyalties() external onlyOwner {
        if (royaltyFrozen) revert NARAPositionNFTV4__RoyaltiesFrozen();
        royaltyFrozen = true;
        emit RoyaltiesFrozen();
    }

    /// @notice Set the wrapper-level NARA and bribe-token claim fees (bps, ≤10%).
    /// @dev Inert until claimFeeRecipient is set. Disabled once claim fees are frozen.
    function setClaimFees(uint16 naraClaimFeeBps_, uint16 tokenClaimFeeBps_) external onlyOwner {
        if (claimFeesFrozen) revert NARAPositionNFTV4__ClaimFeesFrozen();
        if (naraClaimFeeBps_ > MAX_CLAIM_FEE_BPS) {
            revert NARAPositionNFTV4__ClaimFeeTooHigh(MAX_CLAIM_FEE_BPS, naraClaimFeeBps_);
        }
        if (tokenClaimFeeBps_ > MAX_CLAIM_FEE_BPS) {
            revert NARAPositionNFTV4__ClaimFeeTooHigh(MAX_CLAIM_FEE_BPS, tokenClaimFeeBps_);
        }
        naraClaimFeeBps = naraClaimFeeBps_;
        tokenClaimFeeBps = tokenClaimFeeBps_;
        emit ClaimFeesSet(naraClaimFeeBps_, tokenClaimFeeBps_);
    }

    /// @notice Set the destination for collected claim fees. Zero address disables fees.
    function setClaimFeeRecipient(address recipient) external onlyOwner {
        if (claimFeesFrozen) revert NARAPositionNFTV4__ClaimFeesFrozen();
        if (recipient == address(this)) revert NARAPositionNFTV4__InvalidReceiver();
        claimFeeRecipient = recipient;
        emit ClaimFeeRecipientSet(recipient);
    }

    /// @notice Permanently lock claim-fee parameters (rates + recipient). One-way.
    function freezeClaimFees() external onlyOwner {
        if (claimFeeRecipient == address(0) && (naraClaimFeeBps != 0 || tokenClaimFeeBps != 0)) {
            revert NARAPositionNFTV4__InvalidReceiver();
        }
        claimFeesFrozen = true;
        emit ClaimFeesFrozen();
    }

    /// @dev Accepts ETH so reward claims can be routed through the wrapper for fee
    ///      skimming before forwarding to the claimer. Stray ETH is recoverable via
    ///      sweepNative (owner-only).
    receive() external payable {}

    function sweepNative(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert NARAPositionNFTV4__ZeroAddress();
        if (amount == 0) revert NARAPositionNFTV4__ZeroAmount();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NARAPositionNFTV4__NativeTransferFailed();
        emit NativeSwept(to, amount);
    }

    function setGenesisMinter(address minter, bool allowed) external onlyOwner {
        if (genesisMintersFrozen) revert NARAPositionNFTV4__GenesisMintersFrozen();
        if (minter == address(0)) revert NARAPositionNFTV4__ZeroAddress();
        genesisMinter[minter] = allowed;
        emit GenesisMinterSet(minter, allowed);
    }

    function freezeGenesisMinters() external onlyOwner {
        if (genesisMintersFrozen) revert NARAPositionNFTV4__GenesisMintersFrozen();
        genesisMintersFrozen = true;
        emit GenesisMintersFrozen();
    }

    function setRenderer(address newRenderer) external onlyOwner {
        if (rendererFrozen) revert NARAPositionNFTV4__RendererFrozen();
        if (newRenderer == address(0)) revert NARAPositionNFTV4__ZeroAddress();
        if (newRenderer.code.length == 0) revert NARAPositionNFTV4__NotAContract();
        renderer = newRenderer;
        emit RendererSet(newRenderer);
    }

    function freezeRenderer() external onlyOwner {
        if (rendererFrozen) revert NARAPositionNFTV4__RendererFrozen();
        rendererFrozen = true;
        emit RendererFrozen();
    }


    function setGenesisRewardDistributor(address distributor) external onlyOwner {
        if (genesisRewardDistributor != address(0)) revert NARAPositionNFTV4__GenesisRewardDistributorAlreadySet();
        if (distributor == address(0)) revert NARAPositionNFTV4__ZeroAddress();
        if (distributor.code.length == 0) revert NARAPositionNFTV4__NotAContract();
        if (INARAGenesisRewardDistributorV4NFT(distributor).positionNft() != address(this)) {
            revert NARAPositionNFTV4__InvalidGenesisConfig();
        }
        if (address(INARAGenesisRewardDistributorV4NFT(distributor).rewardToken()) == address(0)) {
            revert NARAPositionNFTV4__InvalidGenesisConfig();
        }
        genesisRewardDistributor = distributor;
        emit GenesisRewardDistributorSet(distributor);
    }

    function mintAndLock(uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external
        payable
        nonReentrant
        returns (uint256 tokenId, uint256 positionId)
    {
        return _mintAndLockFor(msg.sender, amount, durationEpochs, minWeight);
    }

    function mintAndLockFor(address recipient, uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external
        payable
        nonReentrant
        returns (uint256 tokenId, uint256 positionId)
    {
        return _mintAndLockFor(recipient, amount, durationEpochs, minWeight);
    }

    function mintGenesisAndLockFor(
        address recipient,
        uint256 amount,
        uint64 durationEpochs,
        uint256 minWeight,
        uint16 roundId,
        uint16 tierId,
        uint32 rewardMultiplierBps,
        bool eternal
    )
        external
        payable
        nonReentrant
        returns (uint256 tokenId, uint256 positionId)
    {
        if (!genesisMinter[msg.sender]) revert NARAPositionNFTV4__NotGenesisMinter();
        if (genesisRewardDistributor == address(0)) {
            revert NARAPositionNFTV4__GenesisRewardDistributorNotSet();
        }
        _validateReceiver(recipient);
        (tokenId, positionId) = _createPosition(amount, durationEpochs, minWeight);
        _recordGenesisMetadata(tokenId, positionId, roundId, tierId, rewardMultiplierBps, eternal);
        _safeMint(recipient, tokenId);
        emit PositionMinted(msg.sender, recipient, tokenId, accountOf[tokenId], positionId, amount, durationEpochs);
    }

    function mintAndLockWithPermit(
        uint256 amount,
        uint64 durationEpochs,
        uint256 minWeight,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external
        payable
        nonReentrant
        returns (uint256 tokenId, uint256 positionId)
    {
        try IERC20Permit(nara).permit(msg.sender, address(this), amount, deadline, v, r, s) {}
        catch {}
        return _mintAndLockFor(msg.sender, amount, durationEpochs, minWeight);
    }

    function claimRewards(uint256 tokenId, address to)
        external
        nonReentrant
        returns (uint256 naraAmount, uint256 ethAmount)
    {
        _requireTokenOwner(tokenId);
        _validateReceiver(to);
        uint256 positionId = positionIdOf[tokenId];
        address account = accountOf[tokenId];

        uint16 feeBps = naraClaimFeeBps;
        address recipient = claimFeeRecipient;
        if (feeBps == 0 || recipient == address(0)) {
            // Default path: account delivers NARA + ETH straight to the claimer.
            (naraAmount, ethAmount) = NARAPositionAccountV4(payable(account)).claimRewards(to);
        } else {
            // Fee path: route the claim through the wrapper, skim NARA, forward the
            // rest. ETH is forwarded untouched (the engine already took its ETH fee).
            (naraAmount, ethAmount) = NARAPositionAccountV4(payable(account)).claimRewards(address(this));
            uint256 fee = (naraAmount * feeBps) / BPS;
            if (fee != 0) {
                naraAmount -= fee;
                IERC20(nara).safeTransfer(recipient, fee);
            }
            if (naraAmount != 0) IERC20(nara).safeTransfer(to, naraAmount);
            if (ethAmount != 0) {
                (bool ok, ) = payable(to).call{value: ethAmount}("");
                if (!ok) revert NARAPositionNFTV4__NativeTransferFailed();
            }
        }
        if (naraAmount != 0) lifetimeNaraClaimed[tokenId] += naraAmount;
        if (ethAmount != 0) lifetimeEthClaimed[tokenId] += ethAmount;
        if (naraAmount != 0 || ethAmount != 0) {
            unchecked { lifetimeClaimCount[tokenId] += 1; }
        }
        emit PositionRewardsClaimed(tokenId, positionId, to, naraAmount, ethAmount);
        emit MetadataUpdate(tokenId);
    }

    function claimTokenRewards(uint256 tokenId, address token, address to)
        external
        nonReentrant
        returns (uint256 amount)
    {
        _requireTokenOwner(tokenId);
        if (token == address(0)) revert NARAPositionNFTV4__ZeroAddress();
        _validateReceiver(to);
        address account = accountOf[tokenId];
        if (to == account) revert NARAPositionNFTV4__InvalidReceiver();
        uint256 positionId = positionIdOf[tokenId];
        amount = _claimTokenWithFee(account, token, to);
        emit PositionTokenRewardsClaimed(tokenId, positionId, token, to, amount);
    }

    function claimClosedTokenRewards(uint256 positionId, address token, address to)
        external
        nonReentrant
        returns (uint256 amount)
    {
        if (token == address(0)) revert NARAPositionNFTV4__ZeroAddress();
        _validateReceiver(to);
        address rewardOwner = closedRewardOwnerOfPosition[positionId];
        if (rewardOwner == address(0) || rewardOwner != msg.sender) {
            revert NARAPositionNFTV4__NotTokenOwner();
        }
        address account = closedAccountOfPosition[positionId];
        if (to == account) revert NARAPositionNFTV4__InvalidReceiver();

        amount = _claimTokenWithFee(account, token, to);
        emit ClosedPositionTokenRewardsClaimed(positionId, token, to, amount);
    }

    /// @dev Claims token rewards from `account`. When a token claim fee is active,
    ///      routes through the wrapper, skims the fee to claimFeeRecipient, and
    ///      forwards the remainder to `to`. Otherwise the account delivers directly.
    function _claimTokenWithFee(address account, address token, address to)
        internal
        returns (uint256 amount)
    {
        uint16 feeBps = tokenClaimFeeBps;
        address recipient = claimFeeRecipient;
        if (feeBps == 0 || recipient == address(0)) {
            amount = NARAPositionAccountV4(payable(account)).claimTokenRewards(token, to);
        } else {
            amount = NARAPositionAccountV4(payable(account)).claimTokenRewards(token, address(this));
            uint256 fee = (amount * feeBps) / BPS;
            if (fee != 0) {
                amount -= fee;
                IERC20(token).safeTransfer(recipient, fee);
            }
            if (amount != 0) IERC20(token).safeTransfer(to, amount);
        }
    }

    function _extendAccountWithRewardRouting(uint256 tokenId, uint64 additionalEpochs, address owner)
        internal
        returns (uint256 naraAmount, uint256 ethAmount)
    {
        uint16 feeBps = naraClaimFeeBps;
        address recipient = claimFeeRecipient;
        bool feeActive = feeBps != 0 && recipient != address(0);
        address rewardRecipient = feeActive ? address(this) : owner;

        (naraAmount, ethAmount) =
            NARAPositionAccountV4(payable(accountOf[tokenId])).extend(additionalEpochs, rewardRecipient);

        if (!feeActive) return (naraAmount, ethAmount);

        uint256 fee = (naraAmount * feeBps) / BPS;
        if (fee != 0) {
            naraAmount -= fee;
            IERC20(nara).safeTransfer(recipient, fee);
        }
        if (naraAmount != 0) IERC20(nara).safeTransfer(owner, naraAmount);
        if (ethAmount != 0) {
            (bool ok, ) = payable(owner).call{value: ethAmount}("");
            if (!ok) revert NARAPositionNFTV4__NativeTransferFailed();
        }
    }

    function claimGenesisEth(uint256 tokenId, address to)
        external
        nonReentrant
        returns (uint256 amount)
    {
        _requireTokenOwner(tokenId);
        _validateReceiver(to);
        GenesisMetadata memory meta = genesisMetadataOf[tokenId];
        if (!meta.isGenesis) revert NARAPositionNFTV4__NotGenesisPosition();
        if (genesisRewardDistributor == address(0)) {
            revert NARAPositionNFTV4__GenesisRewardDistributorNotSet();
        }

        amount = _claimGenesisRewardTo(tokenId, to);
        emit GenesisEthClaimed(tokenId, to, amount);
    }

    function claimGenesisToken(uint256 tokenId, address to)
        external
        nonReentrant
        returns (uint256 amount)
    {
        _requireTokenOwner(tokenId);
        _validateReceiver(to);
        GenesisMetadata memory meta = genesisMetadataOf[tokenId];
        if (!meta.isGenesis) revert NARAPositionNFTV4__NotGenesisPosition();
        if (genesisRewardDistributor == address(0)) {
            revert NARAPositionNFTV4__GenesisRewardDistributorNotSet();
        }

        amount = _claimGenesisTokenTo(tokenId, to);
        emit GenesisTokenClaimed(tokenId, to, amount);
    }

    function extendLock(uint256 tokenId, uint64 additionalEpochs) external nonReentrant {
        address owner = _requireTokenOwner(tokenId);
        uint256 positionId = positionIdOf[tokenId];
        (uint256 naraAmount, uint256 ethAmount) = _extendAccountWithRewardRouting(tokenId, additionalEpochs, owner);
        if (naraAmount != 0) lifetimeNaraClaimed[tokenId] += naraAmount;
        if (ethAmount != 0) lifetimeEthClaimed[tokenId] += ethAmount;
        unchecked { lifetimeExtendCount[tokenId] += 1; }
        emit PositionExtended(tokenId, positionId, additionalEpochs);
        emit MetadataUpdate(tokenId);
    }

    function unlock(uint256 tokenId) external payable nonReentrant {
        address owner = _requireTokenOwner(tokenId);
        _unlockTo(tokenId, owner, owner);
    }

    function unlockTo(uint256 tokenId, address to) external payable nonReentrant {
        address owner = _requireTokenOwner(tokenId);
        _validateReceiver(to);
        _unlockTo(tokenId, to, owner);
    }

    function burnEternalGenesis(uint256 tokenId) external payable nonReentrant {
        address owner = _requireTokenOwner(tokenId);
        _burnEternalGenesisTo(tokenId, owner, owner);
    }

    function burnEternalGenesisTo(uint256 tokenId, address to) external payable nonReentrant {
        address owner = _requireTokenOwner(tokenId);
        _validateReceiver(to);
        _burnEternalGenesisTo(tokenId, to, owner);
    }

    function _burnEternalGenesisTo(uint256 tokenId, address to, address owner) internal {
        GenesisMetadata memory meta = genesisMetadataOf[tokenId];
        if (!meta.isGenesis) revert NARAPositionNFTV4__NotGenesisPosition();
        if (!meta.isEternal) revert NARAPositionNFTV4__EternalPosition();

        address account = accountOf[tokenId];
        uint256 positionId = positionIdOf[tokenId];
        uint256 rewardWeight = meta.rewardWeight;
        uint256 unlockFee = INARAEnginePositionNFTV4(engine).unlockFeeWei();
        if (msg.value != unlockFee) revert NARAPositionNFTV4__IncorrectNativeFee(unlockFee, msg.value);
        Position memory position = INARAEnginePositionNFTV4(engine).positionOf(positionId);
        if (INARAEnginePositionNFTV4(engine).currentEpoch() < position.unlockEpoch) {
            revert NARAPositionNFTV4__PositionNotMatured();
        }

        unlocking[tokenId] = true;
        try NARAPositionAccountV4(payable(account)).claimRewards(to) returns (uint256, uint256) {} catch (bytes memory reason) {
            if (reason.length < 4 || bytes4(reason) != NothingToClaim.selector) {
                assembly {
                    revert(add(reason, 32), mload(reason))
                }
            }
        }
        _clearGenesisMetadata(tokenId, owner);
        _tryClaimGenesisRewardTo(tokenId, to);
        _tryClaimGenesisTokenTo(tokenId, to);
        NARAPositionAccountV4(payable(account)).unlock{value: unlockFee}(to);

        closedRewardOwnerOfPosition[positionId] = owner;
        closedAccountOfPosition[positionId] = account;

        _burn(tokenId);
        delete tokenOfPosition[positionId];
        delete positionIdOf[tokenId];
        delete tokenOfAccount[account];
        delete accountOf[tokenId];
        delete unlocking[tokenId];

        emit PositionUnlocked(tokenId, positionId, owner);
        emit EternalGenesisBurned(tokenId, positionId, account, rewardWeight);
    }

    function positionInfo(uint256 tokenId) external view returns (Position memory) {
        _requireOwned(tokenId);
        return INARAEnginePositionNFTV4(engine).positionOf(positionIdOf[tokenId]);
    }

    function genesisRewardShareWad(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        uint256 total = totalGenesisRewardWeight;
        if (total == 0) return 0;
        return (genesisMetadataOf[tokenId].rewardWeight * 1e18) / total;
    }

    function claimableGenesisEth(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        address distributor = genesisRewardDistributor;
        if (distributor == address(0)) return 0;
        return INARAGenesisRewardDistributorV4NFT(distributor).claimableEth(tokenId);
    }

    function claimableGenesisToken(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        address distributor = genesisRewardDistributor;
        if (distributor == address(0)) return 0;
        return INARAGenesisRewardDistributorV4NFT(distributor).claimableToken(tokenId);
    }

    function sweepAccountNara(uint256 tokenId, address to) external nonReentrant {
        _requireTokenOwner(tokenId);
        _validateReceiver(to);
        NARAPositionAccountV4(payable(accountOf[tokenId])).sweepNara(to);
    }

    function sweepAccountEth(uint256 tokenId, address to) external nonReentrant {
        _requireTokenOwner(tokenId);
        _validateReceiver(to);
        NARAPositionAccountV4(payable(accountOf[tokenId])).sweepEth(to);
    }

    function sweepAccountToken(uint256 tokenId, address token, address to) external nonReentrant {
        _requireTokenOwner(tokenId);
        if (token == address(0)) revert NARAPositionNFTV4__ZeroAddress();
        _validateReceiver(to);
        address account = accountOf[tokenId];
        if (to == account) revert NARAPositionNFTV4__InvalidReceiver();
        NARAPositionAccountV4(payable(account)).sweepToken(token, to);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        try INARAPositionRendererV4(renderer).tokenURI(address(this), tokenId) returns (string memory uri) {
            if (bytes(uri).length != 0) return uri;
        } catch {}
        return _fallbackTokenURI(tokenId);
    }

    function contractURI() external view returns (string memory) {
        try INARAPositionRendererV4(renderer).collectionURI(address(this)) returns (string memory uri) {
            if (bytes(uri).length != 0) return uri;
        } catch {}
        string memory json =
            '{"name":"NARA Positions","symbol":"NARAPOS","description":"Bearer NFTs for NARA Protocol v4 lock positions.","external_link":"https://www.naraprotocol.io/"}';
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981, IERC165)
        returns (bool)
    {
        return interfaceId == 0x49064906 || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        if (unlocking[tokenId] && to != address(0)) {
            revert NARAPositionNFTV4__UnlockInProgress();
        }
        if (to != address(0) && (to == address(this) || to == accountOf[tokenId] || tokenOfAccount[to] != 0)) {
            revert NARAPositionNFTV4__InvalidReceiver();
        }
        return super._update(to, tokenId, auth);
    }

    function _mintAndLockFor(address recipient, uint256 amount, uint64 durationEpochs, uint256 minWeight)
        internal
        returns (uint256 tokenId, uint256 positionId)
    {
        _validateReceiver(recipient);
        (tokenId, positionId) = _createPosition(amount, durationEpochs, minWeight);
        _safeMint(recipient, tokenId);
        emit PositionMinted(msg.sender, recipient, tokenId, accountOf[tokenId], positionId, amount, durationEpochs);
    }

    function _createPosition(uint256 amount, uint64 durationEpochs, uint256 minWeight)
        internal
        returns (uint256 tokenId, uint256 positionId)
    {
        if (amount == 0) revert NARAPositionNFTV4__ZeroAmount();

        uint256 lockFee = INARAEnginePositionNFTV4(engine).lockFeeWei();
        if (msg.value != lockFee) revert NARAPositionNFTV4__IncorrectNativeFee(lockFee, msg.value);

        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId = tokenId + 1;
        }

        address account = Clones.clone(accountImplementation);
        NARAPositionAccountV4(payable(account)).initialize(engine, nara, address(this));

        IERC20(nara).safeTransferFrom(msg.sender, account, amount);
        positionId = NARAPositionAccountV4(payable(account)).lock{value: lockFee}(amount, durationEpochs, minWeight);

        accountOf[tokenId] = account;
        tokenOfAccount[account] = tokenId;
        positionIdOf[tokenId] = positionId;
        tokenOfPosition[positionId] = tokenId;

    }

    function _unlockTo(uint256 tokenId, address to, address rewardOwner) internal {
        if (genesisMetadataOf[tokenId].isEternal) revert NARAPositionNFTV4__EternalPosition();

        uint256 unlockFee = INARAEnginePositionNFTV4(engine).unlockFeeWei();
        if (msg.value != unlockFee) revert NARAPositionNFTV4__IncorrectNativeFee(unlockFee, msg.value);

        address account = accountOf[tokenId];
        uint256 positionId = positionIdOf[tokenId];
        if (to == account) revert NARAPositionNFTV4__InvalidReceiver();

        unlocking[tokenId] = true;
        _clearGenesisMetadata(tokenId, rewardOwner);
        _tryClaimGenesisRewardTo(tokenId, to);
        _tryClaimGenesisTokenTo(tokenId, to);
        NARAPositionAccountV4(payable(account)).unlock{value: unlockFee}(to);

        closedRewardOwnerOfPosition[positionId] = rewardOwner;
        closedAccountOfPosition[positionId] = account;
        _burn(tokenId);
        delete tokenOfPosition[positionId];
        delete positionIdOf[tokenId];
        delete tokenOfAccount[account];
        delete accountOf[tokenId];
        delete unlocking[tokenId];

        emit PositionUnlocked(tokenId, positionId, to);
    }

    function _recordGenesisMetadata(
        uint256 tokenId,
        uint256 positionId,
        uint16 roundId,
        uint16 tierId,
        uint32 rewardMultiplierBps,
        bool eternal
    ) internal {
        if (roundId == 0 || tierId == 0) revert NARAPositionNFTV4__InvalidGenesisConfig();
        if (rewardMultiplierBps == 0 || rewardMultiplierBps > MAX_GENESIS_REWARD_MULTIPLIER_BPS) {
            revert NARAPositionNFTV4__InvalidGenesisConfig();
        }

        Position memory p = INARAEnginePositionNFTV4(engine).positionOf(positionId);
        uint256 rewardWeight = (uint256(p.amount) * rewardMultiplierBps) / BPS;
        genesisMetadataOf[tokenId] = GenesisMetadata({
            isGenesis: true,
            isEternal: eternal,
            roundId: roundId,
            tierId: tierId,
            rewardMultiplierBps: rewardMultiplierBps,
            mintedAt: uint64(block.timestamp),
            rewardWeight: rewardWeight
        });
        totalGenesisRewardWeight += rewardWeight;
        _notifyGenesisRewardWeightChange(tokenId, 0, rewardWeight);
        emit GenesisPositionMinted(tokenId, positionId, roundId, tierId, rewardMultiplierBps, rewardWeight, eternal);
    }

    function _clearGenesisMetadata(uint256 tokenId, address rewardOwner) internal {
        GenesisMetadata memory meta = genesisMetadataOf[tokenId];
        if (!meta.isGenesis) return;
        totalGenesisRewardWeight -= meta.rewardWeight;
        try INARAGenesisRewardDistributorV4NFT(genesisRewardDistributor).onGenesisPositionClosed(tokenId, rewardOwner) {}
        catch {
            emit GenesisCloseNotifyFailed(tokenId);
        }
        delete genesisMetadataOf[tokenId];
    }

    function _tryClaimGenesisRewardTo(uint256 tokenId, address to) internal {
        address distributor = genesisRewardDistributor;
        if (distributor == address(0)) return;
        try INARAGenesisRewardDistributorV4NFT(distributor).claimFromNft(tokenId, to) returns (uint256) {}
        catch {}
    }

    function _tryClaimGenesisTokenTo(uint256 tokenId, address to) internal {
        address distributor = genesisRewardDistributor;
        if (distributor == address(0)) return;
        try INARAGenesisRewardDistributorV4NFT(distributor).claimTokenFromNft(tokenId, to) returns (uint256) {}
        catch {}
    }

    function _claimGenesisRewardTo(uint256 tokenId, address to) internal returns (uint256 amount) {
        GenesisMetadata memory meta = genesisMetadataOf[tokenId];
        if (!meta.isGenesis) return 0;
        address distributor = genesisRewardDistributor;
        if (distributor == address(0)) return 0;
        amount = INARAGenesisRewardDistributorV4NFT(distributor).claimFromNft(tokenId, to);
    }

    function _claimGenesisTokenTo(uint256 tokenId, address to) internal returns (uint256 amount) {
        GenesisMetadata memory meta = genesisMetadataOf[tokenId];
        if (!meta.isGenesis) return 0;
        address distributor = genesisRewardDistributor;
        if (distributor == address(0)) return 0;
        amount = INARAGenesisRewardDistributorV4NFT(distributor).claimTokenFromNft(tokenId, to);
    }

    function _notifyGenesisRewardWeightChange(uint256 tokenId, uint256 oldRewardWeight, uint256 newRewardWeight) internal {
        address distributor = genesisRewardDistributor;
        if (distributor == address(0)) return;
        INARAGenesisRewardDistributorV4NFT(distributor).onGenesisRewardWeightChange(tokenId, oldRewardWeight, newRewardWeight);
    }

    function _requireTokenOwner(uint256 tokenId) internal view returns (address owner) {
        owner = ownerOf(tokenId);
        if (msg.sender != owner) revert NARAPositionNFTV4__NotTokenOwner();
    }

    function _validateReceiver(address to) internal view {
        if (to == address(0) || to == address(this)) revert NARAPositionNFTV4__InvalidReceiver();
    }

    function _fallbackTokenURI(uint256 tokenId) internal view returns (string memory) {
        uint256 positionId = positionIdOf[tokenId];
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">',
            '<rect width="1200" height="1200" fill="#080b12"/>',
            '<rect x="64" y="64" width="1072" height="1072" fill="none" stroke="#0000ff" stroke-width="8"/>',
            '<text x="100" y="560" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="150" font-weight="700">NARA</text>',
            '<text x="1080" y="650" fill="#ffffff" font-family="monospace" font-size="46" text-anchor="end">POSITION ',
            positionId.toString(),
            '</text><text x="100" y="1080" fill="#8cc8ff" font-family="monospace" font-size="28">RENDERER FALLBACK / TOKEN ',
            tokenId.toString(),
            "</text></svg>"
        );
        string memory json = string.concat(
            '{"name":"NARA Position #',
            tokenId.toString(),
            '","description":"Bearer NFT for a NARA Protocol v4 lock position. Minimal onchain fallback metadata is active.",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"display_type":"number","trait_type":"Position ID","value":',
            positionId.toString(),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
