// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockRevertingGenesisRewardDistributorV4 {
    address public immutable positionNft;
    IERC20 public immutable rewardToken;

    error CloseReverted();

    constructor(address positionNft_, IERC20 rewardToken_) {
        positionNft = positionNft_;
        rewardToken = rewardToken_;
    }

    function onGenesisRewardWeightChange(uint256, uint256, uint256) external {}

    function onGenesisPositionClosed(uint256, address) external pure {
        revert CloseReverted();
    }

    function claimFromNft(uint256, address) external pure returns (uint256) {
        return 0;
    }

    function claimTokenFromNft(uint256, address) external pure returns (uint256) {
        return 0;
    }

    function claimableEth(uint256) external pure returns (uint256) {
        return 0;
    }

    function claimableToken(uint256) external pure returns (uint256) {
        return 0;
    }
}
