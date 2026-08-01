// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INARAPositionEngineV5} from "./INARAPositionEngineV5.sol";

interface INARAPositionRendererV5 {
    function render(
        uint256 tokenId,
        address account,
        INARAPositionEngineV5.PositionState calldata state
    ) external view returns (string memory);
}
