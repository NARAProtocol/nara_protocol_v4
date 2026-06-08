// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Immutable presentation interface for NARA v4 position NFTs.
interface INARAPositionRendererV4 {
    function tokenURI(address positionNft, uint256 tokenId) external view returns (string memory);
    function tokenJSON(address positionNft, uint256 tokenId) external view returns (string memory);
    function tokenSVG(address positionNft, uint256 tokenId) external view returns (string memory);
    function collectionURI(address positionNft) external view returns (string memory);
    function artworkIndex(uint256 tokenId) external pure returns (uint8);
    function artworkName(uint8 index) external pure returns (string memory);
}
