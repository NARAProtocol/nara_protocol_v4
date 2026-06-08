// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IGenesisMetadataViewV4 {
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

contract MockGenesisMetadataReceiverV4 is IERC721Receiver {
    bool public observedGenesis;
    bool public observedEternal;
    uint32 public observedMultiplierBps;

    function onERC721Received(address, address, uint256 tokenId, bytes calldata)
        external
        returns (bytes4)
    {
        (
            observedGenesis,
            observedEternal,
            ,
            ,
            observedMultiplierBps,
            ,

        ) = IGenesisMetadataViewV4(msg.sender).genesisMetadataOf(tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }
}
