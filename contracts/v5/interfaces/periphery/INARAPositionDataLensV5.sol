// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INARAPositionEngineV5} from "../modules/INARAPositionEngineV5.sol";

interface INARAPositionDataLensV5 {
    struct PositionView {
        uint256 tokenId;
        address owner;
        address account;
        INARAPositionEngineV5.PositionState state;
        uint256 claimableNative;
        uint256[] claimableTokens;
    }

    function controller() external view returns (address);
    function engine() external view returns (address);
    function getPosition(uint256 tokenId, address[] calldata rewardTokens)
        external
        view
        returns (PositionView memory result);
    function getPositions(uint256[] calldata tokenIds, address[] calldata rewardTokens)
        external
        view
        returns (PositionView[] memory results);
}
