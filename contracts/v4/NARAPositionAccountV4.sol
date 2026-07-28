// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface INARAEngineAccountV4 {
    function lock(uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external
        payable
        returns (uint256 positionId);
    function extend(uint256 positionId, uint64 additionalEpochs) external;
    function unlock(uint256 positionId) external payable;
    function claimRewards(uint256 positionId, address to)
        external
        returns (uint256 naraAmount, uint256 ethAmount);
    function claimTokenRewards(uint256 positionId, address token, address to)
        external
        returns (uint256 amount);
}

error NARAPositionAccountV4__AlreadyInitialized();
error NARAPositionAccountV4__NotFactory();
error NARAPositionAccountV4__AlreadyLocked();
error NARAPositionAccountV4__NotLocked();
error NARAPositionAccountV4__SweepFailed();
error NARAPositionAccountV4__ZeroAddress();

/// @title NARAPositionAccountV4
/// @notice One-position clone account controlled by the NARA v4 position NFT.
/// @dev The account owns the engine position; NFT ownership controls this account through the factory.
contract NARAPositionAccountV4 {
    using SafeERC20 for IERC20;

    address public engine;
    address public nara;
    address public factory;

    bool public initialized;
    bool public locked;
    bool public unlocked;
    uint256 public positionId;

    modifier onlyFactory() {
        if (msg.sender != factory) revert NARAPositionAccountV4__NotFactory();
        _;
    }

    constructor() {
        initialized = true;
    }

    function initialize(address engine_, address nara_, address factory_) external {
        if (initialized) revert NARAPositionAccountV4__AlreadyInitialized();
        if (engine_ == address(0) || nara_ == address(0) || factory_ == address(0)) {
            revert NARAPositionAccountV4__ZeroAddress();
        }

        initialized = true;
        engine = engine_;
        nara = nara_;
        factory = factory_;
    }

    function lock(uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external
        payable
        onlyFactory
        returns (uint256 id)
    {
        if (locked) revert NARAPositionAccountV4__AlreadyLocked();
        locked = true;

        IERC20(nara).forceApprove(engine, amount);
        id = INARAEngineAccountV4(engine).lock{value: msg.value}(amount, durationEpochs, minWeight);
        IERC20(nara).forceApprove(engine, 0);

        positionId = id;
    }

    function extend(uint64 additionalEpochs, address rewardRecipient)
        external
        onlyFactory
        returns (uint256 naraAmount, uint256 ethAmount)
    {
        uint256 id = positionId;
        if (id == 0 || unlocked) revert NARAPositionAccountV4__NotLocked();

        uint256 naraBefore = IERC20(nara).balanceOf(address(this));
        uint256 ethBefore = address(this).balance;
        INARAEngineAccountV4(engine).extend(id, additionalEpochs);
        uint256 naraAfter = IERC20(nara).balanceOf(address(this));
        uint256 ethAfter = address(this).balance;

        naraAmount = naraAfter > naraBefore ? naraAfter - naraBefore : 0;
        ethAmount = ethAfter > ethBefore ? ethAfter - ethBefore : 0;

        if (naraAmount != 0) IERC20(nara).safeTransfer(rewardRecipient, naraAmount);
        if (ethAmount != 0) _sendEth(rewardRecipient, ethAmount);
    }

    function claimRewards(address to)
        external
        onlyFactory
        returns (uint256 naraAmount, uint256 ethAmount)
    {
        uint256 id = positionId;
        if (id == 0 || unlocked) revert NARAPositionAccountV4__NotLocked();
        return INARAEngineAccountV4(engine).claimRewards(id, to);
    }

    function claimTokenRewards(address token, address to)
        external
        onlyFactory
        returns (uint256 amount)
    {
        uint256 id = positionId;
        if (id == 0) revert NARAPositionAccountV4__NotLocked();
        return INARAEngineAccountV4(engine).claimTokenRewards(id, token, to);
    }

    function unlock(address to) external payable onlyFactory {
        uint256 id = positionId;
        if (id == 0 || unlocked) revert NARAPositionAccountV4__NotLocked();
        unlocked = true;

        INARAEngineAccountV4(engine).unlock{value: msg.value}(id);
        _sweepNara(to);
        _sweepEth(to);
    }

    function sweepNara(address to) external onlyFactory {
        _sweepNara(to);
    }

    function sweepEth(address to) external onlyFactory {
        _sweepEth(to);
    }

    function sweepToken(address token, address to) external onlyFactory {
        _sweepToken(token, to);
    }

    function _sweepNara(address to) internal {
        if (to == address(0)) revert NARAPositionAccountV4__ZeroAddress();
        uint256 balance = IERC20(nara).balanceOf(address(this));
        if (balance != 0) {
            IERC20(nara).safeTransfer(to, balance);
        }
    }

    function _sweepEth(address to) internal {
        if (to == address(0)) revert NARAPositionAccountV4__ZeroAddress();
        uint256 balance = address(this).balance;
        if (balance != 0) {
            _sendEth(to, balance);
        }
    }

    function _sweepToken(address token, address to) internal {
        if (token == address(0) || to == address(0)) revert NARAPositionAccountV4__ZeroAddress();
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance != 0) {
            IERC20(token).safeTransfer(to, balance);
        }
    }

    function _sendEth(address to, uint256 amount) internal {
        if (to == address(0)) revert NARAPositionAccountV4__ZeroAddress();
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert NARAPositionAccountV4__SweepFailed();
    }

    receive() external payable {}
}
