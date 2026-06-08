// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IEternalPositionBurnV4 {
    function burnEternalGenesis(uint256 tokenId) external payable;
    function burnEternalGenesisTo(uint256 tokenId, address to) external payable;
}

contract MockEthRejectingNftOwnerV4 is IERC721Receiver {
    receive() external payable {
        revert("NO_ETH");
    }

    function burn(address nft, uint256 tokenId) external payable {
        IEternalPositionBurnV4(nft).burnEternalGenesis{value: msg.value}(tokenId);
    }

    function burnTo(address nft, uint256 tokenId, address to) external payable {
        IEternalPositionBurnV4(nft).burnEternalGenesisTo{value: msg.value}(tokenId, to);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
