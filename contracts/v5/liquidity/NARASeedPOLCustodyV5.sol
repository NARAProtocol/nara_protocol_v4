// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PositionInfo, PositionInfoLibrary} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

import {INARALiquidityHookLifecycleV5} from "../interfaces/liquidity/INARALiquidityHookLifecycleV5.sol";
import {INARAPositionManagerStateV5} from "../interfaces/liquidity/INARAPositionManagerStateV5.sol";
import {NARARecoveryDelayPolicyV5} from "./NARARecoveryDelayPolicyV5.sol";

/// @title NARA Seed POL Custody V5
/// @notice Holds exactly one named seed position. It exposes no approval or
///         arbitrary-transfer surface; recovery is controller-queued, delayed,
///         and executable only after irreversible Hook retirement.
contract NARASeedPOLCustodyV5 is NARARecoveryDelayPolicyV5, IERC721Receiver, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using PositionInfoLibrary for PositionInfo;

    address public immutable configurationAuthority;
    address public immutable recoveryRecipient;
    address public immutable positionManager;
    PoolId public immutable poolId;
    int24 public immutable tickLower;
    int24 public immutable tickUpper;

    address public hook;
    address public controller;
    uint256 public positionTokenId;
    bool public configurationSealed;
    bytes32 public configurationHash;
    uint64 public recoveryEta;
    bool public retired;

    event SeedPositionRegistered(uint256 indexed positionTokenId, uint128 liquidity);
    event ConfigurationSealed(address indexed hook, address indexed controller, bytes32 configurationHash);
    event RecoveryQueued(uint64 eta, address indexed recipient);
    event RecoveryCancelled();
    event SeedPositionRecovered(uint256 indexed positionTokenId, address indexed recipient);

    error ZeroAddress();
    error NotAContract();
    error Unauthorized();
    error InvalidConfiguration();
    error AlreadyRegistered();
    error AlreadySealed();
    error ConfigurationNotSealed();
    error InvalidPosition();
    error RecoveryAlreadyPending();
    error NoPendingRecovery();
    error RecoveryNotReady();
    error HookNotRetired();
    error PermanentlyRetired();

    constructor(
        address configurationAuthority_,
        address recoveryRecipient_,
        address positionManager_,
        PoolId poolId_,
        int24 tickLower_,
        int24 tickUpper_,
        DeploymentDomain deploymentDomain_,
        uint64 recoveryDelay_
    ) NARARecoveryDelayPolicyV5(deploymentDomain_, recoveryDelay_) {
        if (
            configurationAuthority_ == address(0) || recoveryRecipient_ == address(0)
                || positionManager_ == address(0)
        ) revert ZeroAddress();
        if (positionManager_.code.length == 0) revert NotAContract();
        if (PoolId.unwrap(poolId_) == bytes32(0) || tickLower_ >= tickUpper_) revert InvalidConfiguration();
        configurationAuthority = configurationAuthority_;
        recoveryRecipient = recoveryRecipient_;
        positionManager = positionManager_;
        poolId = poolId_;
        tickLower = tickLower_;
        tickUpper = tickUpper_;
    }

    /// @notice Registers the already-custodied seed NFT exactly once.
    /// @dev Worst case for a compromised configuration authority is selecting a
    ///      wrong NFT before sealing; exact owner/pool/range/liquidity checks cap it.
    function registerPosition(uint256 positionTokenId_) external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (configurationSealed) revert AlreadySealed();
        if (positionTokenId != 0) revert AlreadyRegistered();
        uint128 liquidity = _validatePosition(positionTokenId_);
        if (liquidity == 0) revert InvalidPosition();
        positionTokenId = positionTokenId_;
        emit SeedPositionRegistered(positionTokenId_, liquidity);
    }

    /// @notice Irreversibly binds the expected Hook and phase controller.
    /// @dev Worst case for a compromised configuration authority is a bad
    ///      pre-activation binding; there is no post-seal mutation path.
    function sealConfiguration(address hook_, address controller_) external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (configurationSealed) revert AlreadySealed();
        if (hook_ == address(0) || controller_ == address(0)) revert ZeroAddress();
        if (hook_.code.length == 0 || controller_.code.length == 0) revert NotAContract();
        if (positionTokenId == 0 || _validatePosition(positionTokenId) == 0) revert InvalidPosition();
        INARALiquidityHookLifecycleV5 hookBinding = INARALiquidityHookLifecycleV5(hook_);
        if (PoolId.unwrap(hookBinding.poolId()) != PoolId.unwrap(poolId)) revert InvalidConfiguration();

        hook = hook_;
        controller = controller_;
        configurationHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                positionManager,
                PoolId.unwrap(poolId),
                tickLower,
                tickUpper,
                positionTokenId,
                hook_,
                controller_,
                uint8(deploymentDomain),
                recoveryDelay,
                recoveryRecipient,
                hook_.codehash,
                controller_.codehash
            )
        );
        configurationSealed = true;
        emit ConfigurationSealed(hook_, controller_, configurationHash);
    }

    function recoveryPending() external view returns (bool) {
        return recoveryEta != 0;
    }

    /// @notice Queues the only position-removal path.
    /// @dev Only the sealed controller can queue it; the immutable delay cannot
    ///      be shortened by any authority.
    function queueRecovery() external returns (uint64 eta) {
        if (msg.sender != controller) revert Unauthorized();
        if (!configurationSealed) revert ConfigurationNotSealed();
        if (retired) revert PermanentlyRetired();
        if (recoveryEta != 0) revert RecoveryAlreadyPending();
        eta = _recoveryEta();
        recoveryEta = eta;
        emit RecoveryQueued(eta, recoveryRecipient);
    }

    function cancelRecovery() external {
        if (msg.sender != controller) revert Unauthorized();
        if (recoveryEta == 0) revert NoPendingRecovery();
        recoveryEta = 0;
        emit RecoveryCancelled();
    }

    /// @notice Transfers the whole named NFT to the immutable Safe recipient.
    /// @dev This moves custody, not underlying liquidity. A reviewed
    ///      PositionManager removal payload is still required after transfer.
    function executeRecovery() external nonReentrant {
        if (msg.sender != controller) revert Unauthorized();
        uint64 eta = recoveryEta;
        if (eta == 0) revert NoPendingRecovery();
        if (block.timestamp < eta) revert RecoveryNotReady();
        if (!INARALiquidityHookLifecycleV5(hook).poolRetired()) revert HookNotRetired();
        uint256 tokenId = positionTokenId;
        if (tokenId == 0 || _validatePosition(tokenId) == 0) revert InvalidPosition();

        recoveryEta = 0;
        positionTokenId = 0;
        retired = true;
        INARAPositionManagerStateV5(positionManager).safeTransferFrom(address(this), recoveryRecipient, tokenId);
        emit SeedPositionRecovered(tokenId, recoveryRecipient);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view override returns (bytes4) {
        if (msg.sender != positionManager) revert Unauthorized();
        return IERC721Receiver.onERC721Received.selector;
    }

    function _validatePosition(uint256 positionTokenId_) private view returns (uint128 liquidity) {
        if (positionTokenId_ == 0) revert InvalidPosition();
        INARAPositionManagerStateV5 manager = INARAPositionManagerStateV5(positionManager);
        if (manager.ownerOf(positionTokenId_) != address(this)) revert InvalidPosition();
        (PoolKey memory key, PositionInfo info) = manager.getPoolAndPositionInfo(positionTokenId_);
        if (
            PoolId.unwrap(key.toId()) != PoolId.unwrap(poolId) || info.tickLower() != tickLower
                || info.tickUpper() != tickUpper
        ) revert InvalidPosition();
        liquidity = manager.getPositionLiquidity(positionTokenId_);
    }
}
