// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Position} from "./NARAEngineTypes.sol";
import {INARAPositionRendererV4} from "./interfaces/INARAPositionRendererV4.sol";

interface INARAPositionNFTV7Render {
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

interface INARAArtMetadataV3 {
    function tierIndex(uint256 lifetimeEthWei) external pure returns (uint8);
    function name(uint8 tier, bool isGenesis, bool isEternal, uint256 tokenId) external pure returns (string memory);
    function attributes(
        uint256 lifetimeEthWei,
        uint256 seed,
        uint8 moduleIdx,
        uint256 tokenId,
        uint256 positionId,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        bool isEternal,
        uint32 claimCount,
        uint32 extendCount
    ) external view returns (string memory);
    function collectionJSON(string calldata image) external pure returns (string memory);
}

interface INARAArtCorePlateV3 {
    function svg(
        uint256 lifetimeEthWei,
        uint256 seed,
        uint8 moduleIdx,
        uint256 tokenId,
        uint256 positionId,
        uint128 amount,
        uint64 createdEpoch,
        uint64 unlockEpoch,
        bool isEternal,
        uint32 claimCount,
        uint32 extendCount
    ) external pure returns (string memory);
}

interface INARAArtGenesisPlateV2 {
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

interface INARAArtSecurityPrintV2 {
    function collectionSVG() external pure returns (string memory);
}

/// @title NARAPositionRendererV7
/// @notice Top 1% luxury modular renderer assembling generative chassis materials, 10-Rank Multi-Vector Evolution, and High-Stakes Grail Gating.
contract NARAPositionRendererV7 is INARAPositionRendererV4 {
    uint256 public constant RENDERER_VERSION = 7;

    struct RenderInputs {
        uint256 lifetimeEth;
        uint8 tier;
        uint256 seed;
        uint8 moduleIdx;
        uint256 positionId;
        Position p;
        bool isGenesis;
        bool isEternal;
        uint16 roundId;
        uint16 tierId;
        uint32 mult;
        uint64 mintedAt;
        uint32 claimCount;
        uint32 extendCount;
    }

    INARAArtMetadataV3 public immutable METADATA;
    INARAArtCorePlateV3 public immutable CORE_PLATE;
    INARAArtGenesisPlateV2 public immutable GENESIS_PLATE;
    INARAArtSecurityPrintV2 public immutable COLLECTION_ART;

    constructor(
        address metadata_,
        address corePlate_,
        address genesisPlate_,
        address collectionArt_
    ) {
        METADATA = INARAArtMetadataV3(metadata_);
        CORE_PLATE = INARAArtCorePlateV3(corePlate_);
        GENESIS_PLATE = INARAArtGenesisPlateV2(genesisPlate_);
        COLLECTION_ART = INARAArtSecurityPrintV2(collectionArt_);
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

    function artworkIndex(uint256 tokenId) external pure returns (uint8) {
        return uint8(tokenId % 6);
    }

    function artworkName(uint8 index) external pure returns (string memory) {
        if (index == 0) return "Archive Arc";
        if (index == 1) return "Pressure Scar";
        if (index == 2) return "Orbit Field";
        if (index == 3) return "Ledger Fragment";
        if (index == 4) return "Crown Trace";
        return "Signal Trace";
    }

    function collectionURI(address) external view returns (string memory) {
        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(COLLECTION_ART.collectionSVG())));
        return string.concat("data:application/json;base64,", Base64.encode(bytes(METADATA.collectionJSON(image))));
    }

    function _inputs(address positionNft, uint256 tokenId)
        internal
        view
        returns (RenderInputs memory inp)
    {
        INARAPositionNFTV7Render nft = INARAPositionNFTV7Render(positionNft);
        inp.positionId = nft.positionIdOf(tokenId);
        inp.p = nft.positionInfo(tokenId);
        inp.lifetimeEth = nft.lifetimeEthClaimed(tokenId);
        uint256 rewardWeight;
        (inp.isGenesis, inp.isEternal, inp.roundId, inp.tierId, inp.mult, inp.mintedAt, rewardWeight) = nft.genesisMetadataOf(tokenId);
        rewardWeight;
        inp.tier = METADATA.tierIndex(inp.lifetimeEth);
        inp.seed = uint256(keccak256(abi.encodePacked(tokenId, inp.positionId, uint256(inp.p.createdEpoch), "NARA_ELITE_V7")));
        inp.moduleIdx = uint8(inp.seed % 6);
        inp.claimCount = nft.lifetimeClaimCount(tokenId);
        inp.extendCount = nft.lifetimeExtendCount(tokenId);
    }

    function _tokenSVG(address positionNft, uint256 tokenId) internal view returns (string memory) {
        RenderInputs memory inp = _inputs(positionNft, tokenId);

        if (inp.isGenesis) {
            return GENESIS_PLATE.svg(
                inp.tier,
                inp.seed,
                inp.isEternal,
                tokenId,
                inp.positionId,
                inp.roundId,
                inp.tierId,
                inp.mintedAt,
                inp.claimCount,
                inp.extendCount
            );
        }

        return CORE_PLATE.svg(
            inp.lifetimeEth,
            inp.seed,
            inp.moduleIdx,
            tokenId,
            inp.positionId,
            inp.p.amount,
            inp.p.createdEpoch,
            inp.p.unlockEpoch,
            inp.isEternal,
            inp.claimCount,
            inp.extendCount
        );
    }

    function _tokenJSON(address positionNft, uint256 tokenId) internal view returns (string memory) {
        RenderInputs memory inp = _inputs(positionNft, tokenId);

        string memory image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(_tokenSVG(positionNft, tokenId))));
        string memory tokenName = inp.isEternal
            ? string.concat("NARA Eternal Position #", _pad6(tokenId))
            : string.concat("NARA Position #", _pad6(tokenId));

        string memory attrs = METADATA.attributes(
            inp.lifetimeEth,
            inp.seed,
            inp.moduleIdx,
            tokenId,
            inp.positionId,
            inp.p.amount,
            inp.p.createdEpoch,
            inp.p.unlockEpoch,
            inp.isEternal,
            inp.claimCount,
            inp.extendCount
        );

        return string.concat(
            '{"name":"', tokenName,
            '","description":"Top-tier sovereign on-chain financial hardware terminal securing locked NARA principal and streaming protocol dividends on Base. Features procedural aerospace alloys, 10-Rank Multi-Vector Evolution, and ERC-6551 token-bound account governance.",',
            '"image":"', image, '",',
            '"attributes":', attrs, "}"
        );
    }

    function _pad6(uint256 v) internal pure returns (string memory) {
        bytes memory b = bytes(Strings.toString(v));
        if (b.length >= 6) return string(b);
        bytes memory out = new bytes(6);
        uint256 pad = 6 - b.length;
        for (uint256 i = 0; i < pad; i++) {
            out[i] = "0";
        }
        for (uint256 i = 0; i < b.length; i++) {
            out[pad + i] = b[i];
        }
        return string(out);
    }
}
