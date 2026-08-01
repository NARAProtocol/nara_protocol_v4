// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";

/// @notice Minimal clone account that is permanently controlled by the canonical V5 position NFT.
/// @dev The implementation instance locks itself in its constructor. A clone is initialized atomically
///      by the controller in the same transaction in which it is created.
contract NARAPositionAccountV5 {
    using SafeERC20 for IERC20;

    error AlreadyInitialized();
    error InvalidAddress();
    error Unauthorized();
    error PositionAlreadyOpened();
    error PositionNotOpened();
    error PositionClosed();
    error UnexpectedPositionOwner();
    error EtherNotAccepted();

    address public engine;
    address public controller;
    address public token;
    uint256 public positionId;
    bool public initialized;
    bool public principalWithdrawn;
    bool public closed;

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    constructor() {
        initialized = true;
    }

    function initialize(address engine_, address controller_) external {
        if (initialized) revert AlreadyInitialized();
        if (engine_ == address(0) || controller_ == address(0)) revert InvalidAddress();
        if (engine_.code.length == 0 || controller_.code.length == 0) revert InvalidAddress();

        address token_ = INARAPositionEngineV5(engine_).token();
        if (token_ == address(0) || token_.code.length == 0) revert InvalidAddress();

        initialized = true;
        engine = engine_;
        controller = controller_;
        token = token_;
    }

    function open(uint256 amount, uint64 lockDurationSeconds) external onlyController returns (uint256 id) {
        if (closed) revert PositionClosed();
        if (positionId != 0) revert PositionAlreadyOpened();

        IERC20 asset = IERC20(token);
        asset.forceApprove(engine, amount);
        id = INARAPositionEngineV5(engine).openPosition(address(this), amount, lockDurationSeconds);
        asset.forceApprove(engine, 0);

        INARAPositionEngineV5.PositionState memory state = INARAPositionEngineV5(engine).positionState(id);
        if (id == 0 || state.owner != address(this) || !state.active) revert UnexpectedPositionOwner();
        positionId = id;
    }

    function extend(uint64 extensionSeconds)
        external
        onlyController
        returns (uint64 newUnlockAt, uint256 newWeight)
    {
        (newUnlockAt, newWeight) =
            INARAPositionEngineV5(engine).extendPosition(_activePosition(), extensionSeconds);
    }

    function claim(address recipient, address[] calldata rewardTokens)
        external
        onlyController
        returns (uint256 nativeAmount, uint256[] memory tokenAmounts)
    {
        if (recipient == address(0)) revert InvalidAddress();
        return INARAPositionEngineV5(engine).claimPosition(_activePosition(), recipient, rewardTokens);
    }

    function unlock(address recipient) external onlyController returns (uint256 principalReturned) {
        if (recipient == address(0)) revert InvalidAddress();
        if (principalWithdrawn) revert PositionClosed();
        uint256 id = _activePosition();
        principalReturned = INARAPositionEngineV5(engine).unlockPosition(id, recipient);
        principalWithdrawn = true;
    }

    function closePosition() external onlyController {
        if (!principalWithdrawn) revert PositionNotOpened();
        uint256 id = _activePosition();
        INARAPositionEngineV5(engine).closePosition(id);
        closed = true;
    }

    function _activePosition() internal view returns (uint256 id) {
        id = positionId;
        if (id == 0) revert PositionNotOpened();
        if (closed) revert PositionClosed();
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
