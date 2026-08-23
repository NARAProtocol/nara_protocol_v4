// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Position, EpochSnapshot} from "./NARAEngineTypes.sol";
import {INARAPositionRendererV4} from "./interfaces/INARAPositionRendererV4.sol";
import {NARAArtCorePlateV4} from "./NARAArtCorePlateV4.sol";
import {NARAArtMetadataV4} from "./NARAArtMetadataV4.sol";
import {NARAArtCollectionBannerV4} from "./NARAArtCollectionBannerV4.sol";

interface INARAEngineV8Render {
    function epochState() external view returns (EpochSnapshot memory);
    function positionOf(uint256 positionId) external view returns (Position memory);
}

interface INARAPositionNFTV8Render {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
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

/// @title NARAPositionRendererV8
/// @notice Master on-chain renderer assembling 3-Vector Staking Progression, Multi-Year Ascensions, and 64-Slot Fleet Grid.
contract NARAPositionRendererV8 is INARAPositionRendererV4 {
    using Strings for uint256;

    uint256 public constant RENDERER_VERSION = 8;

    address public immutable ENGINE;
    NARAArtCorePlateV4 public immutable CORE_PLATE;
    NARAArtMetadataV4 public immutable METADATA;
    NARAArtCollectionBannerV4 public immutable BANNER;

    constructor(
        address engine_,
        address corePlate_,
        address metadata_,
        address banner_
    ) {
        require(engine_ != address(0), "Engine zero");
        require(corePlate_ != address(0), "CorePlate zero");
        require(metadata_ != address(0), "Metadata zero");
        require(banner_ != address(0), "Banner zero");
        ENGINE = engine_;
        CORE_PLATE = NARAArtCorePlateV4(corePlate_);
        METADATA = NARAArtMetadataV4(metadata_);
        BANNER = NARAArtCollectionBannerV4(banner_);
    }

    struct RenderState {
        uint64 currentEpoch;
        uint256 positionId;
        Position pos;
        address owner;
        uint256 walletSlots;
        uint256 seed;
        uint256 lifetimeEth;
        uint32 claimCount;
        uint32 extendCount;
        bool isGenesis;
        bool isEternal;
    }

    function _gatherState(address nftAddress, uint256 tokenId) internal view returns (RenderState memory s) {
        INARAPositionNFTV8Render nft = INARAPositionNFTV8Render(nftAddress);
        INARAEngineV8Render engine = INARAEngineV8Render(ENGINE);

        EpochSnapshot memory ep = engine.epochState();
        s.currentEpoch = ep.epoch;

        s.positionId = nft.positionIdOf(tokenId);
        s.pos = nft.positionInfo(tokenId);
        
        try nft.ownerOf(tokenId) returns (address o) {
            s.owner = o;
            s.walletSlots = nft.balanceOf(o);
        } catch {
            s.owner = address(0);
            s.walletSlots = 1;
        }

        s.lifetimeEth = nft.lifetimeEthClaimed(tokenId);
        s.claimCount = nft.lifetimeClaimCount(tokenId);
        s.extendCount = nft.lifetimeExtendCount(tokenId);

        try nft.genesisMetadataOf(tokenId) returns (
            bool g,
            bool et,
            uint16,
            uint16,
            uint32,
            uint64,
            uint256
        ) {
            s.isGenesis = g;
            s.isEternal = et;
        } catch {
            s.isGenesis = false;
            s.isEternal = false;
        }

        s.seed = uint256(keccak256(abi.encodePacked(tokenId, s.positionId, s.pos.createdEpoch, "NARA_V8_ASCENSION")));
    }

    function tokenSVG(address positionNft, uint256 tokenId) public view returns (string memory) {
        RenderState memory s = _gatherState(positionNft, tokenId);

        return CORE_PLATE.svg(
            s.currentEpoch,
            s.seed,
            tokenId,
            s.positionId,
            s.pos.amount,
            s.pos.createdEpoch,
            s.pos.unlockEpoch,
            s.isEternal,
            s.claimCount,
            s.extendCount,
            s.walletSlots
        );
    }

    function tokenJSON(address positionNft, uint256 tokenId) public view returns (string memory) {
        RenderState memory s = _gatherState(positionNft, tokenId);

        string memory imageSvg = tokenSVG(positionNft, tokenId);
        string memory imageUri = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(imageSvg)));

        string memory attrs = METADATA.attributes(
            s.currentEpoch,
            s.seed,
            tokenId,
            s.positionId,
            s.pos.amount,
            s.pos.createdEpoch,
            s.pos.unlockEpoch,
            s.isEternal,
            s.claimCount,
            s.extendCount,
            s.walletSlots,
            s.lifetimeEth
        );

        return string.concat(
            '{"name":"NARA Position #', tokenId.toString(),
            '","description":"NARA Protocol Immortal Staking Position with 3-Vector Dynamic Evolution, Multi-Year Ascensions, and 64-Slot Fleet Grid.",',
            '"image":"', imageUri, '",',
            '"attributes":', attrs, '}'
        );
    }

    function tokenURI(address positionNft, uint256 tokenId) external view returns (string memory) {
        return string.concat("data:application/json;base64,", Base64.encode(bytes(tokenJSON(positionNft, tokenId))));
    }

    function collectionURI(address) external view returns (string memory) {
        string memory bannerSvg = BANNER.bannerSVG();
        string memory bannerImage = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(bannerSvg)));
        return string.concat(
            'data:application/json;base64,',
            Base64.encode(
                bytes(
                    string.concat(
                        '{"name":"NARA Position Artifacts","symbol":"NARAPOS",',
                        '"description":"Living On-Chain Financial Organisms bonded to ERC-6551 Token-Bound Vaults on Base Mainnet. Each artifact commands real yield-bearing NARA capital in NARAEngine.sol. Featuring 3-Vector dynamic staking progression, multi-year ascensions, 64-slot wallet fleet grid synergy, and 100% pure on-chain Swiss chronometer SVG horology across 5 aerospace physical alloys.",',
                        '"image":"', bannerImage, '",',
                        '"banner_image":"', bannerImage, '",',
                        '"featured_image":"', bannerImage, '",',
                        '"external_link":"https://nara.finance",',
                        '"fee_recipient":"0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e",',
                        '"seller_fee_basis_points":1000}'
                    )
                )
            )
        );
    }

    function artworkIndex(uint256 tokenId) external pure returns (uint8) {
        return uint8(tokenId % 5);
    }

    function artworkName(uint8 index) external pure returns (string memory) {
        if (index == 0) return "Prismatic Holo Foil";
        if (index == 1) return "24K Gilded Gold";
        if (index == 2) return "Obsidian Stealth";
        if (index == 3) return "Cybernetic Emerald";
        return "Titanium Slate";
    }
}
