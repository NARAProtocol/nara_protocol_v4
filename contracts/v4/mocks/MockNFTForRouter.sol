// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Position} from "../NARAEngineTypes.sol";

interface IEngineForNFTMock {
    function lockFor(address owner, uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external payable returns (uint256 positionId);
}

/// @dev Minimal mock covering all functions NARARouter and NARADashboardLens call
/// against NARAPositionNFTV4.
contract MockNFTForRouter {
    using SafeERC20 for IERC20;

    IERC20  public naraToken;
    address public engine;

    uint256 public nextTokenId = 1;
    bool    public revertGenesis;

    error MockNFTForRouter__NonexistentToken();

    mapping(uint256 => uint256)  public _positionIdOf;
    mapping(uint256 => Position) private _positionInfo;
    mapping(uint256 => address)  private _ownerOf;
    mapping(uint256 => uint256)  public _genesisEth;
    mapping(uint256 => uint256)  public _genesisToken;

    // --- test control setters ---
    function setNara(address t)   external { naraToken = IERC20(t); }
    function setEngine(address e) external { engine = e; }
    function setRevertGenesis(bool v) external { revertGenesis = v; }

    function injectTokenPosition(uint256 tokenId, uint256 positionId, address tokenOwner, Position calldata p) external {
        _positionIdOf[tokenId]  = positionId;
        _positionInfo[tokenId]  = p;
        _ownerOf[tokenId]       = tokenOwner;
    }

    function setGenesisClaimable(uint256 tokenId, uint256 eth_, uint256 token_) external {
        _genesisEth[tokenId]   = eth_;
        _genesisToken[tokenId] = token_;
    }

    // --- NARARouter interface ---

    /// @dev Mirrors the real NARAPositionNFTV4.mintAndLockFor:
    /// pulls NARA from msg.sender (router), approves engine, calls engine.lockFor.
    function mintAndLockFor(
        address recipient,
        uint256 amount,
        uint64  durationEpochs,
        uint256 minWeight
    ) external payable returns (uint256 tokenId, uint256 positionId) {
        naraToken.safeTransferFrom(msg.sender, address(this), amount);
        naraToken.forceApprove(engine, amount);
        positionId = IEngineForNFTMock(engine).lockFor{value: msg.value}(
            recipient, amount, durationEpochs, minWeight
        );
        naraToken.forceApprove(engine, 0);
        tokenId = nextTokenId++;
        // Record mapping so lens queries work on the same mock instance.
        _positionIdOf[tokenId] = positionId;
        _ownerOf[tokenId] = recipient;
    }

    // --- NARADashboardLens interface ---

    function positionIdOf(uint256 tokenId) external view returns (uint256) {
        return _positionIdOf[tokenId];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _ownerOf[tokenId];
    }

    function positionInfo(uint256 tokenId) external view returns (Position memory) {
        if (_ownerOf[tokenId] == address(0)) revert MockNFTForRouter__NonexistentToken();
        return _positionInfo[tokenId];
    }

    function claimableGenesisEth(uint256 tokenId) external view returns (uint256) {
        if (revertGenesis) revert("not genesis");
        return _genesisEth[tokenId];
    }

    function claimableGenesisToken(uint256 tokenId) external view returns (uint256) {
        if (revertGenesis) revert("not genesis");
        return _genesisToken[tokenId];
    }
}
