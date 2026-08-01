// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INARAGenesisDistributorV5 {
    function distributionDomain() external view returns (bytes32);
    function allocation() external view returns (uint256);
    function totalClaimed() external view returns (uint256);
    function funded() external view returns (bool);
    function closed() external view returns (bool);
    function claimDeadline() external view returns (uint64);
}
