// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PositionInfo} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

interface INARAPositionManagerStateV5 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function approve(address spender, uint256 tokenId) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function nextTokenId() external view returns (uint256);
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128 liquidity);
    function getPoolAndPositionInfo(uint256 tokenId) external view returns (PoolKey memory, PositionInfo);
}
