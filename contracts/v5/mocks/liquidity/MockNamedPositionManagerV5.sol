// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PositionInfo, PositionInfoLibrary} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

contract MockNamedPositionManagerV5 is ERC721 {
    uint256 public nextTokenId = 1;
    mapping(uint256 tokenId => PoolKey key) private _poolKey;
    mapping(uint256 tokenId => PositionInfo info) private _positionInfo;
    mapping(uint256 tokenId => uint128 liquidity) private _liquidity;

    constructor() ERC721("Mock V5 LP", "MV5LP") {}

    function mintNamedPosition(
        address owner,
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _poolKey[tokenId] = key;
        PoolKey memory keyMemory = key;
        _positionInfo[tokenId] = PositionInfoLibrary.initialize(keyMemory, tickLower, tickUpper);
        _liquidity[tokenId] = liquidity;
        _safeMint(owner, tokenId);
    }

    function increaseLiquidity(uint256 tokenId, uint128 amount) external {
        _requireOwned(tokenId);
        _liquidity[tokenId] += amount;
    }

    function setLiquidityForTest(uint256 tokenId, uint128 amount) external {
        _requireOwned(tokenId);
        _liquidity[tokenId] = amount;
    }

    function getPositionLiquidity(uint256 tokenId) external view returns (uint128) {
        _requireOwned(tokenId);
        return _liquidity[tokenId];
    }

    function getPoolAndPositionInfo(uint256 tokenId)
        external
        view
        returns (PoolKey memory, PositionInfo)
    {
        _requireOwned(tokenId);
        return (_poolKey[tokenId], _positionInfo[tokenId]);
    }

    function positionInfo(uint256 tokenId) external view returns (PositionInfo) {
        _requireOwned(tokenId);
        return _positionInfo[tokenId];
    }
}
