// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @dev Test-only renderer used to prove the NFT's guaranteed metadata fallback.
contract MockPositionRendererV4 {
    bool public shouldRevert;
    bool public returnEmpty;

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function setReturnEmpty(bool value) external {
        returnEmpty = value;
    }

    function tokenURI(address, uint256) external view returns (string memory) {
        if (shouldRevert) revert("RENDER_FAILED");
        return returnEmpty ? "" : "data:application/json;base64,eyJuYW1lIjoiTW9jayJ9";
    }

    function collectionURI(address) external view returns (string memory) {
        if (shouldRevert) revert("RENDER_FAILED");
        return returnEmpty ? "" : "data:application/json;base64,eyJuYW1lIjoiTW9jayBDb2xsZWN0aW9uIn0=";
    }
}
