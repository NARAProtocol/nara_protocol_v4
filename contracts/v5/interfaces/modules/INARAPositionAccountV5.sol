// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INARAPositionAccountV5 {
    function initialize(address engine, address controller) external;
    function engine() external view returns (address);
    function controller() external view returns (address);
    function token() external view returns (address);
    function positionId() external view returns (uint256);
    function closed() external view returns (bool);

    function open(uint256 amount, uint64 lockDurationSeconds) external returns (uint256);
    function extend(uint64 extensionSeconds) external returns (uint64 newUnlockAt, uint256 newWeight);
    function claim(address recipient, address[] calldata rewardTokens)
        external
        returns (uint256 nativeAmount, uint256[] memory tokenAmounts);
    function unlock(address recipient) external returns (uint256 principalReturned);
    function closePosition() external;
}
