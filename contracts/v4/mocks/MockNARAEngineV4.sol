// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {EngineConfig, EpochSnapshot, Position} from "../NARAEngineTypes.sol";

/// @dev Mock v4 engine for bond and position NFT tests. This is not emission-accurate.
contract MockNARAEngineV4 {
    using SafeERC20 for IERC20;

    uint96 public lockFeeWeiValue = 0.0001 ether;
    uint96 public unlockFeeWeiValue;
    uint16 public lockFeeBpsValue = 200;
    uint64 public activationDelay = 3;
    uint64 public maxLock = 35040;
    uint64 public currentEpoch;
    uint64 public settledEpoch;
    uint256 public activeTotalWeight;
    uint64 public epochLengthValue = 900;
    bool public revertOnNotify;
    bool public revertOnLock;

    uint256 public nextPositionId = 1;
    uint256 public totalEthNotified;
    uint256 public claimRewardsCalls;
    IERC20 public naraToken;

    mapping(uint256 => Position) public positions;
    mapping(uint256 => address) public closedTokenRewardOwner;
    mapping(uint256 => uint256) public claimableNara;
    mapping(uint256 => uint256) public claimableEth;
    mapping(uint256 => mapping(address => uint256)) public claimableToken;

    error NotifyFailed();
    error LockFailed();
    error NotPositionOwner();
    error PositionNotFound();
    error PositionNotMatured();
    error NothingToClaim();

    function setNara(address t) external {
        naraToken = IERC20(t);
    }

    function setLockFeeWei(uint96 v) external {
        lockFeeWeiValue = v;
    }

    function setUnlockFeeWei(uint96 v) external {
        unlockFeeWeiValue = v;
    }

    function setLockFeeBps(uint16 v) external {
        lockFeeBpsValue = v;
    }

    function setActivationDelay(uint64 v) external {
        activationDelay = v;
    }

    function setMaxLock(uint64 v) external {
        maxLock = v;
    }

    function setCurrentEpoch(uint64 v) external {
        currentEpoch = v;
        settledEpoch = v;
    }

    function setActiveTotalWeight(uint256 v) external {
        activeTotalWeight = v;
    }

    function EPOCH_LENGTH() external view returns (uint64) {
        return epochLengthValue;
    }

    function setSettledEpoch(uint64 v) external {
        settledEpoch = v;
    }

    function setRevertOnNotify(bool v) external {
        revertOnNotify = v;
    }

    function setRevertOnLock(bool v) external {
        revertOnLock = v;
    }

    function setClaimable(uint256 id, uint256 naraAmount, uint256 ethAmount) external {
        claimableNara[id] = naraAmount;
        claimableEth[id] = ethAmount;
    }

    function setTokenClaimable(uint256 id, address token, uint256 amount) external {
        claimableToken[id][token] = amount;
    }

    function resetClaimRewardsCalls() external {
        claimRewardsCalls = 0;
    }

    function lockFeeWei() external view returns (uint96) {
        return lockFeeWeiValue;
    }

    function unlockFeeWei() external view returns (uint96) {
        return unlockFeeWeiValue;
    }

    function lockFeeBps() external view returns (uint16) {
        return lockFeeBpsValue;
    }

    function previewWeight(uint256 amount, uint64 dur) external pure returns (uint256) {
        return amount * dur;
    }

    function lockFor(address owner, uint256 amount, uint64 durationEpochs, uint256)
        external
        payable
        returns (uint256 id)
    {
        if (revertOnLock) revert LockFailed();
        naraToken.safeTransferFrom(msg.sender, address(this), amount);
        id = _storePosition(owner, amount, durationEpochs);
    }

    function lock(uint256 amount, uint64 durationEpochs, uint256)
        external
        payable
        returns (uint256 id)
    {
        if (revertOnLock) revert LockFailed();
        naraToken.safeTransferFrom(msg.sender, address(this), amount);
        id = _storePosition(msg.sender, amount, durationEpochs);
    }

    function positionOf(uint256 id) external view returns (Position memory) {
        return positions[id];
    }

    function epochStateView() external view returns (EpochSnapshot memory snap) {
        snap.epoch = settledEpoch;
    }

    function claimableRewards(uint256 id) external view returns (uint256 naraAmount, uint256 ethAmount) {
        return (claimableNara[id], claimableEth[id]);
    }

    function claimableTokenRewards(uint256 id, address token) external view returns (uint256 amount) {
        return claimableToken[id][token];
    }

    function claimRewards(uint256 id, address to)
        external
        returns (uint256 naraAmount, uint256 ethAmount)
    {
        claimRewardsCalls += 1;
        Position storage p = positions[id];
        if (p.amount == 0) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        naraAmount = claimableNara[id];
        ethAmount = claimableEth[id];
        if (naraAmount == 0 && ethAmount == 0) revert NothingToClaim();

        claimableNara[id] = 0;
        claimableEth[id] = 0;
        _deliver(to, naraAmount, ethAmount);
    }

    function claimTokenRewards(uint256 id, address token, address to)
        external
        returns (uint256 amount)
    {
        Position storage p = positions[id];
        if (p.amount == 0) {
            address closedOwner = closedTokenRewardOwner[id];
            if (closedOwner == address(0)) revert PositionNotFound();
            if (closedOwner != msg.sender) revert NotPositionOwner();
        } else if (p.owner != msg.sender) {
            revert NotPositionOwner();
        }

        amount = claimableToken[id][token];
        if (amount == 0) revert NothingToClaim();
        claimableToken[id][token] = 0;
        IERC20(token).safeTransfer(to, amount);
    }

    function extend(uint256 id, uint64 additionalEpochs) external {
        Position storage p = positions[id];
        if (p.amount == 0) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        _deliver(p.owner, claimableNara[id], claimableEth[id]);
        claimableNara[id] = 0;
        claimableEth[id] = 0;
        p.unlockEpoch += additionalEpochs;
        p.weight += uint128(uint256(p.amount) * additionalEpochs);
    }

    function unlock(uint256 id) external payable {
        Position memory p = positions[id];
        if (p.amount == 0) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (currentEpoch < p.unlockEpoch) revert PositionNotMatured();

        delete positions[id];
        closedTokenRewardOwner[id] = p.owner;
        _deliver(p.owner, claimableNara[id], claimableEth[id]);
        claimableNara[id] = 0;
        claimableEth[id] = 0;
        naraToken.safeTransfer(p.owner, uint256(p.amount));
    }

    function notifyEthRewards() external payable {
        if (revertOnNotify) revert NotifyFailed();
        totalEthNotified += msg.value;
    }

    function config() external view returns (EngineConfig memory cfg) {
        cfg.activationDelayEpochs = activationDelay;
        cfg.maxLockEpochs = maxLock;
    }

    function _storePosition(address owner, uint256 amount, uint64 durationEpochs)
        internal
        returns (uint256 id)
    {
        id = nextPositionId++;
        uint64 activation = currentEpoch + activationDelay + 1;
        uint64 unlockEpoch = currentEpoch + durationEpochs + 1;
        positions[id] = Position({
            owner: owner,
            createdEpoch: currentEpoch,
            flags: 0,
            amount: uint128(amount),
            weight: uint128(amount * durationEpochs),
            activationEpoch: activation,
            unlockEpoch: unlockEpoch,
            tokenWeight: 0,
            naraDebtRay: 0,
            ethDebtRay: 0
        });
    }

    function _deliver(address to, uint256 naraAmount, uint256 ethAmount) internal {
        if (naraAmount != 0) {
            naraToken.safeTransfer(to, naraAmount);
        }
        if (ethAmount != 0) {
            (bool ok,) = payable(to).call{value: ethAmount}("");
            require(ok, "ETH_SEND_FAILED");
        }
    }

    receive() external payable {}
}
