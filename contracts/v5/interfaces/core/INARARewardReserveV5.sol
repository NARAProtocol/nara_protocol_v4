// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

interface INARARewardReserveV5 {
    function token() external view returns (address);
    function engine() external view returns (address);
    function rewardAllocation() external view returns (uint256);
    function totalReleased() external view returns (uint256);
    function configurationSealed() external view returns (bool);
    function availableRewards() external view returns (uint256);
    function isValidFor(address token_, address engine_) external view returns (bool);
    function releaseToEngine(uint256 amount) external returns (uint256 released);
}
