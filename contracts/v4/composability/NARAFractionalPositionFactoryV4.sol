// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {NARAFractionalPositionV4} from "./NARAFractionalPositionV4.sol";

interface IFractionalPositionBindingV4 {
    function bound() external view returns (bool);
}

/// @title NARAFractionalPositionFactoryV4
/// @notice Deploys one NARAFractionalPositionV4 per NARAPositionNFTV4 tokenId on demand.
///         Maintains a registry of all fractional contracts deployed.
contract NARAFractionalPositionFactoryV4 {
    address public immutable NARA;
    address public immutable USDC;
    address public immutable ENGINE;
    address public immutable POSITION_NFT;

    mapping(uint256 => address) public fractionalOf;
    address[] public allFractionals;

    event FractionalCreated(uint256 indexed tokenId, address indexed fractional, address indexed creator);

    error AlreadyExists();
    error NotTokenOwnerOrApproved();
    error ZeroAddress();

    constructor(address nara_, address usdc_, address engine_, address positionNft_) {
        if (nara_ == address(0) || usdc_ == address(0) ||
            engine_ == address(0) || positionNft_ == address(0)) revert ZeroAddress();
        NARA         = nara_;
        USDC         = usdc_;
        ENGINE       = engine_;
        POSITION_NFT = positionNft_;
    }

    /// @notice Deploy a NARAFractionalPositionV4 for `tokenId`. Permissionless.
    function create(uint256 tokenId) external returns (address fractional) {
        address existing = fractionalOf[tokenId];
        if (existing != address(0)) {
            try IFractionalPositionBindingV4(existing).bound() returns (bool existingBound) {
                if (existingBound) revert AlreadyExists();
            } catch {
                revert AlreadyExists();
            }
        }

        IERC721 positionNft = IERC721(POSITION_NFT);
        address owner = positionNft.ownerOf(tokenId);
        bool isApproved = positionNft.getApproved(tokenId) == msg.sender ||
            positionNft.isApprovedForAll(owner, msg.sender);
        if (msg.sender != owner && !isApproved) revert NotTokenOwnerOrApproved();

        NARAFractionalPositionV4 f = new NARAFractionalPositionV4(
            NARA, USDC, ENGINE, POSITION_NFT
        );
        f.setExpectedBinding(tokenId, msg.sender);
        fractional = address(f);
        fractionalOf[tokenId] = fractional;
        allFractionals.push(fractional);
        emit FractionalCreated(tokenId, fractional, msg.sender);
    }

    function allFractionalsLength() external view returns (uint256) {
        return allFractionals.length;
    }
}
