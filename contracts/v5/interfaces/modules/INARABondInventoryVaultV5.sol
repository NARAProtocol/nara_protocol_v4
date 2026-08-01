// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INARABondInventoryVaultV5 {
    function token() external view returns (address);
    function fundingAuthority() external view returns (address);
    function depository() external view returns (address);
    function allocation() external view returns (uint256);
    function recoveryRecipient() external view returns (address);
    function recoveryDelay() external view returns (uint64);
    function distributed() external view returns (uint256);
    function funded() external view returns (bool);
    function recoveryStarted() external view returns (bool);
    function recoveryAvailableAt() external view returns (uint64);
    function recoverableBalance() external view returns (uint256);
    function fund() external;
    function pull(address recipient, uint256 amount) external;
    function recover() external returns (uint256 amount);
}
