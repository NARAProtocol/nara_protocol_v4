// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {INARAEngineCoreV5} from "../interfaces/core/INARAEngineCoreV5.sol";
import {INARARewardReserveV5} from "../interfaces/core/INARARewardReserveV5.sol";

/// @title NARA V5 sealed reward reserve
/// @notice Holds one exact token allocation for one reciprocally verified Engine.
contract NARARewardReserveV5 is INARARewardReserveV5, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable override token;
    address public immutable configurationAuthority;
    address public immutable recoveryAuthority;
    uint256 public immutable override rewardAllocation;

    address public override engine;
    uint256 public override totalReleased;
    bool public override configurationSealed;
    bytes32 public configurationHash;

    error InvalidAddress();
    error InvalidAmount();
    error InvalidToken();
    error InvalidEngine();
    error Unauthorized();
    error AlreadyBound();
    error AlreadySealed();
    error NotSealed();
    error FundingMismatch(uint256 required, uint256 actual);
    error InsufficientRewards(uint256 available, uint256 requested);
    error ProtectedToken();
    error InsufficientExcess(uint256 available, uint256 requested);
    error UnsupportedTokenBehavior();
    error NativeTransferFailed();
    error EtherNotAccepted();

    event ReserveFunded(address indexed funder, uint256 amount, uint256 balance);
    event EngineBound(address indexed engine);
    event ReserveSealed(bytes32 indexed configurationHash, uint256 fundedAmount);
    event RewardsReleased(address indexed engine, uint256 amount, uint256 totalReleased);
    event ForeignTokenRecovered(address indexed token, address indexed recipient, uint256 amount);
    event ExcessTokenRecovered(address indexed recipient, uint256 amount);
    event NativeRecovered(address indexed recipient, uint256 amount);

    modifier onlyConfigurationAuthority() {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        _;
    }

    modifier onlyRecoveryAuthority() {
        if (msg.sender != recoveryAuthority) revert Unauthorized();
        _;
    }

    constructor(
        address configurationAuthority_,
        address recoveryAuthority_,
        address token_,
        uint256 rewardAllocation_
    ) {
        if (
            configurationAuthority_ == address(0) ||
            recoveryAuthority_ == address(0) ||
            token_ == address(0)
        ) revert InvalidAddress();
        if (token_.code.length == 0) revert InvalidToken();
        uint256 supply = IERC20(token_).totalSupply();
        if (rewardAllocation_ == 0 || rewardAllocation_ > supply) revert InvalidAmount();

        configurationAuthority = configurationAuthority_;
        recoveryAuthority = recoveryAuthority_;
        token = token_;
        rewardAllocation = rewardAllocation_;
    }

    /// @notice Funds the reserve before sealing and rejects fee-on-transfer behavior.
    function fund(uint256 amount) external nonReentrant {
        if (configurationSealed) revert AlreadySealed();
        if (amount == 0) revert InvalidAmount();

        IERC20 asset = IERC20(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = asset.balanceOf(address(this));
        if (afterBalance - beforeBalance != amount) revert UnsupportedTokenBehavior();
        emit ReserveFunded(msg.sender, amount, afterBalance);
    }

    /// @notice One-shot reciprocal Engine binding.
    /// @dev Worst case for a compromised configuration authority before sealing:
    ///      it can select a wrong candidate, but the reciprocal token/reserve checks
    ///      fail closed and the binding cannot be replaced after success.
    function bindEngine(address engine_) external onlyConfigurationAuthority {
        if (configurationSealed) revert AlreadySealed();
        if (engine != address(0)) revert AlreadyBound();
        if (engine_ == address(0) || engine_.code.length == 0) revert InvalidEngine();

        bool valid;
        try INARAEngineCoreV5(engine_).NARA() returns (address engineToken) {
            if (engineToken == token) {
                try INARAEngineCoreV5(engine_).rewardReserve() returns (address reserve) {
                    valid = reserve == address(this);
                } catch {}
            }
        } catch {}
        if (!valid) revert InvalidEngine();

        engine = engine_;
        emit EngineBound(engine_);
    }

    /// @notice Irreversibly seals the exact funded allocation and Engine binding.
    /// @dev Worst case for a compromised configuration authority is an early seal;
    ///      exact funding and reciprocal binding are mandatory, so no asset can be
    ///      redirected to a different Engine through this function.
    function seal() external onlyConfigurationAuthority {
        if (configurationSealed) revert AlreadySealed();
        if (engine == address(0)) revert InvalidEngine();
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance < rewardAllocation) {
            revert FundingMismatch(rewardAllocation, balance);
        }

        configurationHash = keccak256(
            abi.encode(
                keccak256("NARA_REWARD_RESERVE_V5"),
                block.chainid,
                address(this),
                token,
                engine,
                rewardAllocation,
                recoveryAuthority
            )
        );
        configurationSealed = true;
        emit ReserveSealed(configurationHash, balance);
    }

    function availableRewards() public view override returns (uint256) {
        uint256 remaining = rewardAllocation - totalReleased;
        uint256 balance = IERC20(token).balanceOf(address(this));
        return balance < remaining ? balance : remaining;
    }

    function isValidFor(address token_, address engine_)
        external
        view
        override
        returns (bool)
    {
        return configurationSealed && token_ == token && engine_ == engine;
    }

    function releaseToEngine(uint256 amount)
        external
        override
        nonReentrant
        returns (uint256 released)
    {
        if (!configurationSealed) revert NotSealed();
        if (msg.sender != engine) revert InvalidEngine();
        if (amount == 0) revert InvalidAmount();
        uint256 available = availableRewards();
        if (amount > available) revert InsufficientRewards(available, amount);

        totalReleased += amount;
        IERC20(token).safeTransfer(engine, amount);
        emit RewardsReleased(engine, amount, totalReleased);
        return amount;
    }

    /// @notice Recovers only unrelated ERC-20s accidentally sent to the reserve.
    /// @dev Worst case for a compromised recovery authority is loss of unrelated
    ///      tokens. The protected V5 token can never be selected.
    function recoverForeignToken(address foreignToken, address recipient, uint256 amount)
        external
        onlyRecoveryAuthority
        nonReentrant
    {
        if (foreignToken == address(0) || recipient == address(0)) revert InvalidAddress();
        if (foreignToken == token) revert ProtectedToken();
        if (amount == 0) revert InvalidAmount();
        IERC20(foreignToken).safeTransfer(recipient, amount);
        emit ForeignTokenRecovered(foreignToken, recipient, amount);
    }

    /// @notice Recovers only NARA above the still-unreleased immutable allocation.
    /// @dev Direct unsolicited transfers can therefore never brick sealing or
    ///      dilute the reserve obligation, while committed rewards stay protected.
    function recoverExcessToken(address recipient, uint256 amount)
        external
        onlyRecoveryAuthority
        nonReentrant
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        uint256 remaining = rewardAllocation - totalReleased;
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 excess = balance > remaining ? balance - remaining : 0;
        if (amount > excess) revert InsufficientExcess(excess, amount);
        IERC20(token).safeTransfer(recipient, amount);
        emit ExcessTokenRecovered(recipient, amount);
    }

    /// @notice Recovers forced native currency; ordinary transfers are rejected.
    /// @dev Worst case for a compromised recovery authority is loss of native
    ///      currency that is never part of the token reward allocation.
    function recoverNative(address payable recipient, uint256 amount)
        external
        onlyRecoveryAuthority
        nonReentrant
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0 || amount > address(this).balance) revert InvalidAmount();
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit NativeRecovered(recipient, amount);
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
