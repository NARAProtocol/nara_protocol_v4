// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PositionInfo, PositionInfoLibrary} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

import {INARALiquidityHookLifecycleV5} from "../interfaces/liquidity/INARALiquidityHookLifecycleV5.sol";
import {INARALiquidityPositionAdapterV5} from "../interfaces/liquidity/INARALiquidityPositionAdapterV5.sol";
import {INARALiquidityVaultRoutingV5} from "../interfaces/liquidity/INARALiquidityVaultRoutingV5.sol";
import {INARAPositionManagerStateV5} from "../interfaces/liquidity/INARAPositionManagerStateV5.sol";
import {NARARecoveryDelayPolicyV5} from "./NARARecoveryDelayPolicyV5.sol";

/// @title NARA Liquidity Compounder V5
/// @notice Receipt-keyed, no-swap bank which adds only balanced assets through
///         a sealed PositionManager adapter and independently verifies the
///         resulting named POL position.
contract NARALiquidityCompounderV5 is
    NARARecoveryDelayPolicyV5,
    IERC721Receiver,
    ReentrancyGuardTransient
{
    using PoolIdLibrary for PoolKey;
    using PositionInfoLibrary for PositionInfo;
    using SafeERC20 for IERC20;

    address public immutable configurationAuthority;
    address public immutable operationsAuthority;
    address public immutable recoveryRecipient;
    address public immutable token;
    address public immutable base;
    address public immutable poolManager;
    address public immutable positionManager;
    address public immutable vault;
    PoolId public immutable poolId;
    int24 public immutable tickLower;
    int24 public immutable tickUpper;
    uint256 public immutable configuredMinimumNaraUsed;
    uint256 public immutable configuredMinimumBaseUsed;

    address public hook;
    address public controller;
    address public positionAdapter;
    bytes32 public positionAdapterCodeHash;
    bytes32 public positionAdapterConfigurationHash;
    bool public configurationSealed;
    bytes32 public configurationHash;

    uint256 public positionTokenId;
    uint64 public recoveryEta;
    bool public retired;

    uint256 public totalNaraClaimsReceived;
    uint256 public totalBaseClaimsReceived;
    uint256 public totalNaraAdded;
    uint256 public totalBaseAdded;
    uint256 public totalNaraLpFeesHarvested;
    uint256 public totalBaseLpFeesHarvested;
    uint256 public totalLiquidityAdded;
    mapping(bytes32 receiptId => uint8 route) public processedReceiptRoute;

    event ConfigurationSealed(
        address indexed hook,
        address indexed controller,
        address indexed positionAdapter,
        bytes32 configurationHash
    );
    event LiquidityClaimsPulled(
        bytes32 indexed receiptId, uint256 naraAmount, uint256 baseAmount, uint256 naraBanked, uint256 baseBanked
    );
    event LiquidityCompounded(
        bytes32 indexed receiptId,
        uint256 indexed positionTokenId,
        uint128 liquidityAdded,
        uint256 naraUsed,
        uint256 baseUsed,
        uint256 naraLpFeesHarvested,
        uint256 baseLpFeesHarvested,
        uint256 naraBanked,
        uint256 baseBanked
    );
    event RecoveryQueued(uint64 eta, address indexed recipient);
    event RecoveryCancelled();
    event Recovered(
        address indexed recipient, uint256 indexed positionTokenId, uint256 naraBanked, uint256 baseBanked
    );

    error ZeroAddress();
    error NotAContract();
    error Unauthorized();
    error InvalidConfiguration();
    error AlreadySealed();
    error ConfigurationNotSealed();
    error InvalidState();
    error InvalidAmount();
    error MinimumUsageBelowConfiguration();
    error InsufficientNaraUsed(uint256 minimum, uint256 actual);
    error InsufficientBaseUsed(uint256 minimum, uint256 actual);
    error InvalidReceipt();
    error ReceiptAlreadyProcessed();
    error DeadlineExpired();
    error AdapterAccountingMismatch();
    error InvalidPosition();
    error RecoveryAlreadyPending();
    error NoPendingRecovery();
    error RecoveryNotReady();
    error HookNotRetired();

    constructor(
        address configurationAuthority_,
        address operationsAuthority_,
        address recoveryRecipient_,
        address token_,
        address base_,
        address poolManager_,
        address positionManager_,
        address vault_,
        PoolId poolId_,
        int24 tickLower_,
        int24 tickUpper_,
        uint256 configuredMinimumNaraUsed_,
        uint256 configuredMinimumBaseUsed_,
        DeploymentDomain deploymentDomain_,
        uint64 recoveryDelay_
    ) NARARecoveryDelayPolicyV5(deploymentDomain_, recoveryDelay_) {
        if (
            configurationAuthority_ == address(0) || operationsAuthority_ == address(0)
                || recoveryRecipient_ == address(0) || token_ == address(0) || base_ == address(0)
                || poolManager_ == address(0) || positionManager_ == address(0) || vault_ == address(0)
        ) revert ZeroAddress();
        if (
            token_ == base_ || PoolId.unwrap(poolId_) == bytes32(0) || tickLower_ >= tickUpper_
        ) revert InvalidConfiguration();
        if (
            configuredMinimumNaraUsed_ == 0 || configuredMinimumBaseUsed_ == 0
                || configuredMinimumNaraUsed_ > type(uint128).max
                || configuredMinimumBaseUsed_ > type(uint128).max
        ) revert InvalidConfiguration();
        if (
            token_.code.length == 0 || base_.code.length == 0 || poolManager_.code.length == 0
                || positionManager_.code.length == 0 || vault_.code.length == 0
        ) revert NotAContract();
        configurationAuthority = configurationAuthority_;
        operationsAuthority = operationsAuthority_;
        recoveryRecipient = recoveryRecipient_;
        token = token_;
        base = base_;
        poolManager = poolManager_;
        positionManager = positionManager_;
        vault = vault_;
        poolId = poolId_;
        tickLower = tickLower_;
        tickUpper = tickUpper_;
        configuredMinimumNaraUsed = configuredMinimumNaraUsed_;
        configuredMinimumBaseUsed = configuredMinimumBaseUsed_;
    }

    /// @notice Irreversibly binds Hook, controller and the reviewed no-swap adapter.
    /// @dev Worst case for a compromised configuration authority is binding a
    ///      malicious adapter before activation. Exact allowances are revoked in
    ///      the same call and post-operation PM verification makes theft revert.
    function sealConfiguration(address hook_, address controller_, address positionAdapter_) external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (configurationSealed) revert AlreadySealed();
        if (hook_ == address(0) || controller_ == address(0) || positionAdapter_ == address(0)) {
            revert ZeroAddress();
        }
        if (hook_.code.length == 0 || controller_.code.length == 0 || positionAdapter_.code.length == 0) {
            revert NotAContract();
        }
        INARALiquidityHookLifecycleV5 hookBinding = INARALiquidityHookLifecycleV5(hook_);
        if (
            hookBinding.token() != token || hookBinding.base() != base
                || hookBinding.poolManager() != poolManager || hookBinding.vault() != vault
                || PoolId.unwrap(hookBinding.poolId()) != PoolId.unwrap(poolId)
        ) revert InvalidConfiguration();

        INARALiquidityPositionAdapterV5 adapter = INARALiquidityPositionAdapterV5(positionAdapter_);
        if (
            adapter.token() != token || adapter.base() != base || adapter.poolManager() != poolManager
                || adapter.positionManager() != positionManager || adapter.compounder() != address(this)
                || PoolId.unwrap(adapter.poolId()) != PoolId.unwrap(poolId)
                || adapter.tickLower() != tickLower || adapter.tickUpper() != tickUpper
                || adapter.configurationHash() == bytes32(0)
                || adapter.configuredMinimumNaraUsed() != configuredMinimumNaraUsed
                || adapter.configuredMinimumBaseUsed() != configuredMinimumBaseUsed
        ) revert InvalidConfiguration();

        hook = hook_;
        controller = controller_;
        positionAdapter = positionAdapter_;
        positionAdapterCodeHash = positionAdapter_.codehash;
        positionAdapterConfigurationHash = adapter.configurationHash();
        configurationHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                token,
                base,
                poolManager,
                positionManager,
                vault,
                PoolId.unwrap(poolId),
                tickLower,
                tickUpper,
                configuredMinimumNaraUsed,
                configuredMinimumBaseUsed,
                hook_,
                controller_,
                positionAdapter_,
                positionAdapterCodeHash,
                positionAdapterConfigurationHash,
                operationsAuthority,
                recoveryRecipient,
                uint8(deploymentDomain),
                recoveryDelay
            )
        );
        configurationSealed = true;
        emit ConfigurationSealed(hook_, controller_, positionAdapter_, configurationHash);
    }

    /// @notice Redeems only the Vault's already-classified liquidity claims.
    ///         One-sided receipts are banked until a later balanced compound.
    function pullLiquidityClaims(bytes32 receiptId, uint256 naraAmount, uint256 baseAmount) external nonReentrant {
        _requireOperator();
        _requireOperational();
        _consumeReceipt(receiptId, 1);
        if (naraAmount == 0 && baseAmount == 0) revert InvalidAmount();
        uint256 tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 baseBefore = IERC20(base).balanceOf(address(this));
        INARALiquidityVaultRoutingV5(vault).releaseLiquidityClaims(receiptId, naraAmount, baseAmount);
        if (
            IERC20(token).balanceOf(address(this)) - tokenBefore != naraAmount
                || IERC20(base).balanceOf(address(this)) - baseBefore != baseAmount
        ) revert AdapterAccountingMismatch();
        totalNaraClaimsReceived += naraAmount;
        totalBaseClaimsReceived += baseAmount;
        emit LiquidityClaimsPulled(
            receiptId,
            naraAmount,
            baseAmount,
            IERC20(token).balanceOf(address(this)),
            IERC20(base).balanceOf(address(this))
        );
    }

    /// @notice Adds a caller-capped balanced portion of the bank without a swap.
    /// @dev `operationsAuthority` is the automation lane; the immutable recovery
    ///      recipient authority is the manual fallback lane.
    function compoundBanked(
        bytes32 receiptId,
        uint256 maximumNara,
        uint256 maximumBase,
        uint256 minimumNaraUsed,
        uint256 minimumBaseUsed,
        uint128 minimumLiquidity,
        uint64 deadline
    ) external nonReentrant returns (uint128 liquidityAdded) {
        _requireOperator();
        _requireOperational();
        _consumeReceipt(receiptId, 2);
        if (
            block.timestamp > deadline || maximumNara == 0 || maximumBase == 0 || minimumLiquidity == 0
        ) {
            if (block.timestamp > deadline) revert DeadlineExpired();
            revert InvalidAmount();
        }
        if (
            minimumNaraUsed < configuredMinimumNaraUsed
                || minimumBaseUsed < configuredMinimumBaseUsed
        ) revert MinimumUsageBelowConfiguration();
        if (minimumNaraUsed > maximumNara || minimumBaseUsed > maximumBase) revert InvalidAmount();
        uint256 tokenBefore = IERC20(token).balanceOf(address(this));
        uint256 baseBefore = IERC20(base).balanceOf(address(this));
        if (maximumNara > tokenBefore || maximumBase > baseBefore) revert InvalidAmount();

        address adapterAddress = positionAdapter;
        if (
            adapterAddress.codehash != positionAdapterCodeHash
                || INARALiquidityPositionAdapterV5(adapterAddress).configurationHash()
                    != positionAdapterConfigurationHash
        ) revert InvalidConfiguration();

        uint256 currentId = positionTokenId;
        uint128 liquidityBefore = currentId == 0
            ? 0
            : INARAPositionManagerStateV5(positionManager).getPositionLiquidity(currentId);
        IERC20(token).forceApprove(adapterAddress, maximumNara);
        IERC20(base).forceApprove(adapterAddress, maximumBase);
        (
            uint256 returnedId,
            uint128 returnedLiquidity,
            uint256 naraUsed,
            uint256 baseUsed,
            uint256 naraLpFeesHarvested,
            uint256 baseLpFeesHarvested
        ) =
            INARALiquidityPositionAdapterV5(adapterAddress).addLiquidity(
                currentId,
                maximumNara,
                maximumBase,
                minimumNaraUsed,
                minimumBaseUsed,
                minimumLiquidity,
                deadline
            );
        IERC20(token).forceApprove(adapterAddress, 0);
        IERC20(base).forceApprove(adapterAddress, 0);

        if (
            returnedId == 0 || (currentId != 0 && returnedId != currentId) || returnedLiquidity < minimumLiquidity
                || naraUsed == 0 || baseUsed == 0 || naraUsed > maximumNara || baseUsed > maximumBase
                || !_balanceDeltaReconciles(
                    tokenBefore,
                    IERC20(token).balanceOf(address(this)),
                    naraUsed,
                    naraLpFeesHarvested
                )
                || !_balanceDeltaReconciles(
                    baseBefore,
                    IERC20(base).balanceOf(address(this)),
                    baseUsed,
                    baseLpFeesHarvested
                )
        ) revert AdapterAccountingMismatch();
        if (naraUsed < minimumNaraUsed) revert InsufficientNaraUsed(minimumNaraUsed, naraUsed);
        if (baseUsed < minimumBaseUsed) revert InsufficientBaseUsed(minimumBaseUsed, baseUsed);

        uint128 liquidityAfter = _validatePosition(returnedId);
        if (liquidityAfter < liquidityBefore || liquidityAfter - liquidityBefore != returnedLiquidity) {
            revert AdapterAccountingMismatch();
        }
        if (currentId == 0) {
            positionTokenId = returnedId;
            // The reviewed adapter is the PositionManager caller on later
            // increases, so the newly minted NFT grants it one token-specific
            // approval. ERC-721 clears this approval automatically on recovery
            // transfer; the adapter has no decrease, transfer, or arbitrary-call
            // surface and its code/configuration hashes are sealed above.
            INARAPositionManagerStateV5(positionManager).approve(adapterAddress, returnedId);
        }
        liquidityAdded = returnedLiquidity;
        totalNaraAdded += naraUsed;
        totalBaseAdded += baseUsed;
        totalNaraLpFeesHarvested += naraLpFeesHarvested;
        totalBaseLpFeesHarvested += baseLpFeesHarvested;
        totalLiquidityAdded += returnedLiquidity;
        emit LiquidityCompounded(
            receiptId,
            returnedId,
            returnedLiquidity,
            naraUsed,
            baseUsed,
            naraLpFeesHarvested,
            baseLpFeesHarvested,
            IERC20(token).balanceOf(address(this)),
            IERC20(base).balanceOf(address(this))
        );
    }

    function bankedBalances() external view returns (uint256 naraBanked, uint256 baseBanked) {
        naraBanked = IERC20(token).balanceOf(address(this));
        baseBanked = IERC20(base).balanceOf(address(this));
    }

    function recoveryPending() external view returns (bool) {
        return recoveryEta != 0;
    }

    function queueRecovery() external returns (uint64 eta) {
        if (msg.sender != controller) revert Unauthorized();
        if (!configurationSealed || retired) revert InvalidState();
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

    /// @notice Transfers the named NFT and all banked assets to the immutable
    ///         recovery recipient after Hook retirement and the sealed delay.
    function executeRecovery() external nonReentrant {
        if (msg.sender != controller) revert Unauthorized();
        uint64 eta = recoveryEta;
        if (eta == 0) revert NoPendingRecovery();
        if (block.timestamp < eta) revert RecoveryNotReady();
        if (!INARALiquidityHookLifecycleV5(hook).poolRetired()) revert HookNotRetired();

        recoveryEta = 0;
        retired = true;
        uint256 tokenId = positionTokenId;
        positionTokenId = 0;
        if (tokenId != 0) {
            if (_validatePosition(tokenId) == 0) revert InvalidPosition();
            INARAPositionManagerStateV5(positionManager).safeTransferFrom(
                address(this), recoveryRecipient, tokenId
            );
        }
        IERC20(token).forceApprove(positionAdapter, 0);
        IERC20(base).forceApprove(positionAdapter, 0);
        uint256 naraBanked = IERC20(token).balanceOf(address(this));
        uint256 baseBanked = IERC20(base).balanceOf(address(this));
        if (naraBanked != 0) IERC20(token).safeTransfer(recoveryRecipient, naraBanked);
        if (baseBanked != 0) IERC20(base).safeTransfer(recoveryRecipient, baseBanked);
        emit Recovered(recoveryRecipient, tokenId, naraBanked, baseBanked);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view override returns (bytes4) {
        if (msg.sender != positionManager) revert Unauthorized();
        return IERC721Receiver.onERC721Received.selector;
    }

    function _validatePosition(uint256 tokenId) private view returns (uint128 liquidity) {
        INARAPositionManagerStateV5 manager = INARAPositionManagerStateV5(positionManager);
        if (manager.ownerOf(tokenId) != address(this)) revert InvalidPosition();
        (PoolKey memory key, PositionInfo info) = manager.getPoolAndPositionInfo(tokenId);
        if (
            PoolId.unwrap(key.toId()) != PoolId.unwrap(poolId) || info.tickLower() != tickLower
                || info.tickUpper() != tickUpper
        ) revert InvalidPosition();
        liquidity = manager.getPositionLiquidity(tokenId);
    }

    function _requireOperator() private view {
        if (msg.sender != operationsAuthority && msg.sender != recoveryRecipient) revert Unauthorized();
    }

    function _balanceDeltaReconciles(
        uint256 balanceBefore,
        uint256 balanceAfter,
        uint256 principalUsed,
        uint256 lpFeesHarvested
    ) private pure returns (bool) {
        if (lpFeesHarvested >= principalUsed) {
            return balanceAfter >= balanceBefore
                && balanceAfter - balanceBefore == lpFeesHarvested - principalUsed;
        }
        return balanceBefore >= balanceAfter
            && balanceBefore - balanceAfter == principalUsed - lpFeesHarvested;
    }

    function _requireOperational() private view {
        if (!configurationSealed) revert ConfigurationNotSealed();
        if (retired || recoveryEta != 0) revert InvalidState();
    }

    function _consumeReceipt(bytes32 receiptId, uint8 route) private {
        if (receiptId == bytes32(0)) revert InvalidReceipt();
        if (processedReceiptRoute[receiptId] != 0) revert ReceiptAlreadyProcessed();
        processedReceiptRoute[receiptId] = route;
    }
}
