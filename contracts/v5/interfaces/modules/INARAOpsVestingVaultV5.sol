// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INARAOpsVestingVaultV5 {
    function allocation() external view returns (uint256);
    function released() external view returns (uint256);
    function funded() external view returns (bool);
    function beneficiary() external view returns (address);
    function releasable() external view returns (uint256);
}
