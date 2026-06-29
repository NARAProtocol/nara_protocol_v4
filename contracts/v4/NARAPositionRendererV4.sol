// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Position} from "./NARAEngineTypes.sol";
import {INARAPositionRendererV4} from "./interfaces/INARAPositionRendererV4.sol";
import {NARAPositionArtV1} from "./libraries/NARAPositionArtV1.sol";

interface INARAPositionNFTV4Render {
    function positionIdOf(uint256 tokenId) external view returns (uint256);
    function positionInfo(uint256 tokenId) external view returns (Position memory);
    function lifetimeEthClaimed(uint256 tokenId) external view returns (uint256);
    function genesisMetadataOf(uint256 tokenId)
        external
        view
        returns (
            bool isGenesis,
            bool isEternal,
            uint16 roundId,
            uint16 tierId,
            uint32 rewardMultiplierBps,
            uint64 mintedAt,
            uint256 rewardWeight
        );
}

/// @title NARAPositionRendererV4
/// @notice Thin, fully on-chain renderer for NARA position NFTs. Reads chain state and delegates
///         all SVG/metadata building to the linked NARAPositionArtV1 library, keeping this contract
///         small while the art lives in its own deployed bytecode.
/// @dev Art drivers are realized facts (earnings tier) or mint-fixed (Genesis/Eternal/identity
///      seed) — never live values — so cached marketplace images stay valid and encode facts +
///      provenance, not expected return. Live position data lives in NARAPositionDataLensV1.
contract NARAPositionRendererV4 is INARAPositionRendererV4 {
    uint256 public constant RENDERER_VERSION = 4;

    function tokenURI(address positionNft, uint256 tokenId) external view returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(_tokenJSON(positionNft, tokenId))));
    }

    function tokenJSON(address positionNft, uint256 tokenId) external view returns (string memory) {
        return _tokenJSON(positionNft, tokenId);
    }

    function tokenSVG(address positionNft, uint256 tokenId) external view returns (string memory) {
        return _tokenSVG(positionNft, tokenId);
    }

    function collectionURI(address) external pure returns (string memory) {
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(NARAPositionArtV1.collectionSVG())));
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(string.concat(
                '{"name":"NARA Positions","symbol":"NARAPOS",',
                '"description":"Fully on-chain NARA proof-of-position instruments. Structure reflects realized rewards and provenance. No off-chain image. Encodes facts, not expected return.",',
                '"image":"', image, '","banner_image":"', image, '","featured_image":"', image,
                '","external_link":"https://www.naraprotocol.io/"}'
            )))
        );
    }

    /// @notice Deterministic, equal-status module index/name (cosmetic variety, not rarity).
    function artworkIndex(uint256 tokenId) public pure returns (uint8) {
        return uint8(_moduleSeed(tokenId) % 6);
    }

    function artworkName(uint8 index) public pure returns (string memory) {
        return NARAPositionArtV1.moduleName(index);
    }

    // ----------------------------------------------------------------------
    // Internal: read chain state, compute deterministic inputs, call the library
    // ----------------------------------------------------------------------
    function _tierIndex(uint256 lifetimeEthWei) internal pure returns (uint8) {
        if (lifetimeEthWei >= 10 ether) return 4;
        if (lifetimeEthWei >= 1 ether) return 3;
        if (lifetimeEthWei >= 0.1 ether) return 2;
        if (lifetimeEthWei > 0) return 1;
        return 0;
    }

    function _moduleSeed(uint256 tokenId) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked("NARA-CORE", tokenId)));
    }

    function _inputs(address positionNft, uint256 tokenId)
        internal
        view
        returns (uint8 tier, uint256 seed, uint8 moduleIdx, uint256 positionId, Position memory p,
            bool isGenesis, bool isEternal, uint16 roundId, uint16 tierId, uint32 mult, uint64 mintedAt)
    {
        positionId = INARAPositionNFTV4Render(positionNft).positionIdOf(tokenId);
        p = INARAPositionNFTV4Render(positionNft).positionInfo(tokenId);
        (isGenesis, isEternal, roundId, tierId, mult, mintedAt,) =
            INARAPositionNFTV4Render(positionNft).genesisMetadataOf(tokenId);
        tier = _tierIndex(INARAPositionNFTV4Render(positionNft).lifetimeEthClaimed(tokenId));
        // identity seed from mint-fixed data only (cache-safe)
        seed = uint256(keccak256(abi.encodePacked(tokenId, positionId, uint256(p.createdEpoch))));
        moduleIdx = uint8(_moduleSeed(tokenId) % 6);
    }

    function _tokenSVG(address positionNft, uint256 tokenId) internal view returns (string memory) {
        (uint8 tier, uint256 seed, uint8 moduleIdx, uint256 positionId,, bool isGenesis, bool isEternal,,,,) =
            _inputs(positionNft, tokenId);
        return NARAPositionArtV1.svg(tier, seed, moduleIdx, isGenesis, isEternal, tokenId, positionId);
    }

    function _tokenJSON(address positionNft, uint256 tokenId) internal view returns (string memory) {
        (
            uint8 tier, uint256 seed, uint8 moduleIdx, uint256 positionId, Position memory p,
            bool isGenesis, bool isEternal, uint16 roundId, uint16 tierId, uint32 mult, uint64 mintedAt
        ) = _inputs(positionNft, tokenId);

        string memory image = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(NARAPositionArtV1.svg(tier, seed, moduleIdx, isGenesis, isEternal, tokenId, positionId)))
        );

        return string.concat(
            '{"name":"', NARAPositionArtV1.name(tier, isGenesis, isEternal, tokenId),
            '","description":"Fully on-chain NARA proof-of-position instrument. The NARA Core escalates with realized rewards delivered; provenance is fixed at mint. Live data via NARAPositionDataLensV1.",',
            '"image":"', image, '","external_url":"https://www.naraprotocol.io/",',
            '"background_color":"070A12","attributes":[',
            NARAPositionArtV1.attributes(tier, moduleIdx, isGenesis, isEternal, positionId, p.createdEpoch, roundId, tierId, mult, mintedAt),
            "}"
        );
    }
}
