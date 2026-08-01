// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";
import {INARAPositionAccountV5} from "../interfaces/modules/INARAPositionAccountV5.sol";
import {INARAPositionRendererV5} from "../interfaces/modules/INARAPositionRendererV5.sol";
import {NARAPositionAccountV5} from "./NARAPositionAccountV5.sol";

/// @notice Canonical V5 ERC-721 controller for Engine positions.
/// @dev Each NFT id is exactly its Engine position id. Its clone account remains the Engine owner;
///      ERC-721 ownership controls every mutating account action.
contract NARAPositionNFTV5 is ERC721Enumerable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error InvalidAmount();
    error Unauthorized();
    error DuplicatePositionId();
    error UnsupportedTokenBehavior();
    error EtherNotAccepted();

    address public immutable engine;
    address public immutable token;
    address public immutable accountImplementation;
    address public immutable renderer;

    uint256 public cloneNonce;
    mapping(uint256 tokenId => address account) public accountFor;
    mapping(address account => bool canonical) public isCanonicalAccount;

    event PositionMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        address indexed account,
        address payer,
        uint256 amount,
        uint64 lockDurationSeconds
    );
    event PositionExtended(
        uint256 indexed tokenId,
        uint64 extensionSeconds,
        uint64 newUnlockAt,
        uint256 newWeight
    );
    event PositionClaimed(uint256 indexed tokenId, address indexed recipient);
    event PositionUnlocked(uint256 indexed tokenId, address indexed recipient, uint256 principalReturned);
    event PositionClosed(uint256 indexed tokenId);

    constructor(
        address engine_,
        address renderer_,
        string memory name_,
        string memory symbol_
    ) ERC721(name_, symbol_) {
        if (engine_ == address(0) || renderer_ == address(0)) revert InvalidAddress();
        if (engine_.code.length == 0 || renderer_.code.length == 0) revert InvalidAddress();
        address token_ = INARAPositionEngineV5(engine_).token();
        if (token_ == address(0) || token_.code.length == 0) revert InvalidAddress();

        engine = engine_;
        token = token_;
        renderer = renderer_;
        accountImplementation = address(new NARAPositionAccountV5());
    }

    /// @notice Opens a position funded only by the caller and mints control to `recipient`.
    function mintPosition(address recipient, uint256 amount, uint64 lockDurationSeconds)
        external
        nonReentrant
        returns (uint256 tokenId, address account)
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 nonce = ++cloneNonce;
        bytes32 salt = keccak256(abi.encode(block.chainid, address(this), nonce));
        account = Clones.cloneDeterministic(accountImplementation, salt);
        INARAPositionAccountV5(account).initialize(engine, address(this));
        isCanonicalAccount[account] = true;

        _pullExactToAccount(msg.sender, account, amount);
        tokenId = INARAPositionAccountV5(account).open(amount, lockDurationSeconds);
        if (accountFor[tokenId] != address(0)) revert DuplicatePositionId();

        accountFor[tokenId] = account;
        _safeMint(recipient, tokenId);
        emit PositionMinted(tokenId, recipient, account, msg.sender, amount, lockDurationSeconds);
    }

    function extendPosition(uint256 tokenId, uint64 extensionSeconds)
        external
        nonReentrant
        returns (uint64 newUnlockAt, uint256 newWeight)
    {
        _requireAuthorized(tokenId);
        (newUnlockAt, newWeight) =
            INARAPositionAccountV5(accountFor[tokenId]).extend(extensionSeconds);
        emit PositionExtended(tokenId, extensionSeconds, newUnlockAt, newWeight);
    }

    function claimPosition(uint256 tokenId, address recipient, address[] calldata rewardTokens)
        external
        nonReentrant
        returns (uint256 nativeAmount, uint256[] memory tokenAmounts)
    {
        if (recipient == address(0)) revert InvalidAddress();
        _requireAuthorized(tokenId);
        (nativeAmount, tokenAmounts) =
            INARAPositionAccountV5(accountFor[tokenId]).claim(recipient, rewardTokens);
        emit PositionClaimed(tokenId, recipient);
    }

    function unlockPosition(uint256 tokenId, address recipient)
        external
        nonReentrant
        returns (uint256 principalReturned)
    {
        if (recipient == address(0)) revert InvalidAddress();
        _requireAuthorized(tokenId);
        principalReturned = INARAPositionAccountV5(accountFor[tokenId]).unlock(recipient);
        emit PositionUnlocked(tokenId, recipient, principalReturned);
    }

    /// @notice Burns a principal-withdrawn NFT after its owner has claimed or
    ///         explicitly forfeited any remaining reward entitlement.
    function closePosition(uint256 tokenId) external nonReentrant {
        _requireAuthorized(tokenId);
        INARAPositionAccountV5(accountFor[tokenId]).closePosition();
        _burn(tokenId);
        emit PositionClosed(tokenId);
    }

    function positionData(uint256 tokenId)
        external
        view
        returns (address account, INARAPositionEngineV5.PositionState memory state)
    {
        account = accountFor[tokenId];
        if (account == address(0)) revert ERC721NonexistentToken(tokenId);
        state = INARAPositionEngineV5(engine).positionState(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        address account = accountFor[tokenId];
        INARAPositionEngineV5.PositionState memory state =
            INARAPositionEngineV5(engine).positionState(tokenId);
        return INARAPositionRendererV5(renderer).render(tokenId, account, state);
    }

    function predictNextAccount() external view returns (address) {
        uint256 nonce = cloneNonce + 1;
        bytes32 salt = keccak256(abi.encode(block.chainid, address(this), nonce));
        return Clones.predictDeterministicAddress(accountImplementation, salt, address(this));
    }

    function _pullExactToAccount(address payer, address account, uint256 amount) internal {
        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(account);
        asset.safeTransferFrom(payer, account, amount);
        if (asset.balanceOf(account) - beforeBalance != amount) revert UnsupportedTokenBehavior();
    }

    function _requireAuthorized(uint256 tokenId) internal view {
        address owner = _requireOwned(tokenId);
        if (!_isAuthorized(owner, msg.sender, tokenId)) revert Unauthorized();
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
