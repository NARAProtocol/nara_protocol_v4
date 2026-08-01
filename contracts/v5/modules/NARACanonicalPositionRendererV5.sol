// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";
import {INARAPositionRendererV5} from "../interfaces/modules/INARAPositionRendererV5.sol";

/// @notice Sealed, parameterized metadata renderer for canonical V5 positions.
contract NARACanonicalPositionRendererV5 is INARAPositionRendererV5 {
    using Strings for uint256;
    using Strings for address;

    string public collectionLabel;
    string public description;
    string public imageURI;

    constructor(string memory collectionLabel_, string memory description_, string memory imageURI_) {
        collectionLabel = collectionLabel_;
        description = description_;
        imageURI = imageURI_;
    }

    function render(
        uint256 tokenId,
        address account,
        INARAPositionEngineV5.PositionState calldata state
    ) external view returns (string memory) {
        bytes memory json = abi.encodePacked(
            '{"name":"',
            collectionLabel,
            " #",
            tokenId.toString(),
            '","description":"',
            description,
            '","image":"',
            imageURI,
            '","attributes":[',
            '{"trait_type":"Principal","value":"',
            state.principal.toString(),
            '"},{"trait_type":"Weight","value":"',
            state.weight.toString(),
            '"},{"trait_type":"Unlock timestamp","value":"',
            uint256(state.unlockAt).toString(),
            '"},{"trait_type":"Position account","value":"',
            account.toHexString(),
            '"},{"trait_type":"Active","value":"',
            state.active ? "true" : "false",
            '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }
}
