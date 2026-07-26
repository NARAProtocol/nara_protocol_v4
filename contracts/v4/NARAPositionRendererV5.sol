// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Position} from "./NARAEngineTypes.sol";
import {INARAPositionRendererV4} from "./interfaces/INARAPositionRendererV4.sol";

interface INARAPositionNFTV5Render {
    function positionIdOf(uint256 tokenId) external view returns (uint256);
    function positionInfo(uint256 tokenId) external view returns (Position memory);
    function lifetimeEthClaimed(uint256 tokenId) external view returns (uint256);
    function lifetimeClaimCount(uint256 tokenId) external view returns (uint32);
    function lifetimeExtendCount(uint256 tokenId) external view returns (uint32);
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

interface INARAArtMetadataV1 {
    function tierIndex(uint256 lifetimeEthWei) external pure returns (uint8);
    function moduleName(uint8 index) external pure returns (string memory);
    function name(uint8 tier, bool isGenesis, bool isEternal, uint256 tokenId) external pure returns (string memory);
    function attributes(
        uint256 seed,
        uint8 tier,
        uint8 moduleIdx,
        bool isGenesis,
        bool isEternal,
        uint256 positionId,
        uint64 createdEpoch,
        uint16 roundId,
        uint16 tierId,
        uint32 mult,
        uint64 mintedAt,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory);
    function collectionJSON(string calldata image) external pure returns (string memory);
}

interface INARAArtCorePlateV1 {
    function svg(
        uint8 tier,
        uint256 seed,
        uint8 moduleIdx,
        uint256 tokenId,
        uint256 positionId,
        uint64 createdEpoch,
        uint32 claimCount,
        uint32 extendCount
    ) external view returns (string memory);
}

interface INARAArtGenesisPlateV1 {
    function svg(
        uint8 tier,
        uint256 seed,
        bool isEternal,
        uint256 tokenId,
        uint256 positionId,
        uint16 roundId,
        uint16 tierId,
        uint64 mintedAt,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory);
}

interface INARAArtCollectionV1 {
    function collectionSVG() external pure returns (string memory);
}

/// @title NARAPositionRendererV5
/// @notice Thin modular renderer that composes metadata, core art, genesis art, and security print modules.
contract NARAPositionRendererV5 is INARAPositionRendererV4 {
    uint256 public constant RENDERER_VERSION = 5;

    INARAArtMetadataV1 public immutable METADATA;
    INARAArtCorePlateV1 public immutable CORE_PLATE;
    INARAArtGenesisPlateV1 public immutable GENESIS_PLATE;
    INARAArtCollectionV1 public immutable COLLECTION_ART;

    error RendererZeroAddress();
    error RendererNotAContract();

    constructor(address metadata_, address corePlate_, address genesisPlate_, address collectionArt_) {
        if (
            metadata_ == address(0) ||
            corePlate_ == address(0) ||
            genesisPlate_ == address(0) ||
            collectionArt_ == address(0)
        ) revert RendererZeroAddress();
        if (
            metadata_.code.length == 0 ||
            corePlate_.code.length == 0 ||
            genesisPlate_.code.length == 0 ||
            collectionArt_.code.length == 0
        ) revert RendererNotAContract();

        METADATA = INARAArtMetadataV1(metadata_);
        CORE_PLATE = INARAArtCorePlateV1(corePlate_);
        GENESIS_PLATE = INARAArtGenesisPlateV1(genesisPlate_);
        COLLECTION_ART = INARAArtCollectionV1(collectionArt_);
    }

    function tokenURI(address positionNft, uint256 tokenId) external view returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(_tokenJSON(positionNft, tokenId))));
    }

    function tokenJSON(address positionNft, uint256 tokenId) external view returns (string memory) {
        return _tokenJSON(positionNft, tokenId);
    }

    function tokenSVG(address positionNft, uint256 tokenId) external view returns (string memory) {
        return _tokenSVG(positionNft, tokenId);
    }

    function collectionURI(address) external view returns (string memory) {
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(COLLECTION_ART.collectionSVG())));
        return string.concat("data:application/json;base64,", Base64.encode(bytes(METADATA.collectionJSON(image))));
    }

    function artworkIndex(uint256 tokenId) public pure returns (uint8) {
        return uint8(_moduleSeed(tokenId) % 6);
    }

    function artworkName(uint8 index) public pure returns (string memory) {
        if (index == 0) return "Archive Arc";
        if (index == 1) return "Pressure Scar";
        if (index == 2) return "Orbit Field";
        if (index == 3) return "Ledger Fragment";
        if (index == 4) return "Crown Trace";
        return "Signal Trace";
    }

    function _inputs(address positionNft, uint256 tokenId)
        internal
        view
        returns (
            uint8 tier,
            uint256 seed,
            uint8 moduleIdx,
            uint256 positionId,
            Position memory p,
            bool isGenesis,
            bool isEternal,
            uint16 roundId,
            uint16 tierId,
            uint32 mult,
            uint64 mintedAt,
            uint32 claimCount,
            uint32 extendCount
        )
    {
        INARAPositionNFTV5Render nft = INARAPositionNFTV5Render(positionNft);
        positionId = nft.positionIdOf(tokenId);
        p = nft.positionInfo(tokenId);
        uint256 rewardWeight;
        (isGenesis, isEternal, roundId, tierId, mult, mintedAt, rewardWeight) = nft.genesisMetadataOf(tokenId);
        rewardWeight;
        tier = METADATA.tierIndex(nft.lifetimeEthClaimed(tokenId));
        seed = uint256(keccak256(abi.encodePacked(tokenId, positionId, uint256(p.createdEpoch))));
        moduleIdx = artworkIndex(tokenId);
        claimCount = nft.lifetimeClaimCount(tokenId);
        extendCount = nft.lifetimeExtendCount(tokenId);
    }

    function _tokenSVG(address positionNft, uint256 tokenId) internal view returns (string memory) {
        (
            uint8 tier,
            uint256 seed,
            uint8 moduleIdx,
            uint256 positionId,
            Position memory p,
            bool isGenesis,
            bool isEternal,
            uint16 roundId,
            uint16 tierId,
            ,
            uint64 mintedAt,
            uint32 claimCount,
            uint32 extendCount
        ) = _inputs(positionNft, tokenId);

        if (isGenesis) {
            return GENESIS_PLATE.svg(
                tier,
                seed,
                isEternal,
                tokenId,
                positionId,
                roundId,
                tierId,
                mintedAt,
                claimCount,
                extendCount
            );
        }
        return CORE_PLATE.svg(tier, seed, moduleIdx, tokenId, positionId, p.createdEpoch, claimCount, extendCount);
    }

    function _tokenJSON(address positionNft, uint256 tokenId) internal view returns (string memory) {
        (
            uint8 tier,
            uint256 seed,
            uint8 moduleIdx,
            uint256 positionId,
            Position memory p,
            bool isGenesis,
            bool isEternal,
            uint16 roundId,
            uint16 tierId,
            uint32 mult,
            uint64 mintedAt,
            uint32 claimCount,
            uint32 extendCount
        ) = _inputs(positionNft, tokenId);

        string memory svgImage = isGenesis
            ? GENESIS_PLATE.svg(
                tier,
                seed,
                isEternal,
                tokenId,
                positionId,
                roundId,
                tierId,
                mintedAt,
                claimCount,
                extendCount
            )
            : CORE_PLATE.svg(tier, seed, moduleIdx, tokenId, positionId, p.createdEpoch, claimCount, extendCount);

        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svgImage)));

        return string.concat(
            '{"name":"', METADATA.name(tier, isGenesis, isEternal, tokenId),
            '","description":"Fully on-chain NARA proof-of-position instrument. Visual state reflects realized rewards already delivered and mint provenance. Live data via NARAPositionDataLensV1.",',
            '"image":"', image, '","external_url":"https://www.naraprotocol.io/",',
            '"background_color":"070A12","attributes":',
            METADATA.attributes(seed, tier, moduleIdx, isGenesis, isEternal, positionId, p.createdEpoch, roundId, tierId, mult, mintedAt, claimCount, extendCount),
            "}"
        );
    }

    function _moduleSeed(uint256 tokenId) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked("NARA-CORE", tokenId)));
    }
}
