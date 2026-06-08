// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockNARAEngineRouting {
    using SafeERC20 for IERC20;

    mapping(address token => uint256 amount) public notifiedTokenRewards;
    uint256 public syncEmissionReserveCalls;
    address public immutable NARA;

    event TokenRewardsNotified(address indexed token, address indexed from, uint256 amount);
    event EmissionReserveSynced(address indexed caller);

    constructor(address nara_) {
        NARA = nara_;
    }

    function notifyTokenRewards(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        notifiedTokenRewards[token] += amount;
        emit TokenRewardsNotified(token, msg.sender, amount);
    }

    function syncEmissionReserve() external {
        syncEmissionReserveCalls += 1;
        emit EmissionReserveSynced(msg.sender);
    }
}
