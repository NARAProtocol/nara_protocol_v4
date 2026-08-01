// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INARAPositionEngineV5} from "./INARAPositionEngineV5.sol";

interface INARAPositionControllerV5 {
    function token() external view returns (address);
    function engine() external view returns (address);
    function accountImplementation() external view returns (address);
    function renderer() external view returns (address);
    function accountFor(uint256 tokenId) external view returns (address);
    function isCanonicalAccount(address account) external view returns (bool);

    function mintPosition(address recipient, uint256 amount, uint64 lockDurationSeconds)
        external
        returns (uint256 tokenId, address account);
    function extendPosition(uint256 tokenId, uint64 extensionSeconds)
        external
        returns (uint64 newUnlockAt, uint256 newWeight);
    function claimPosition(uint256 tokenId, address recipient, address[] calldata rewardTokens)
        external
        returns (uint256 nativeAmount, uint256[] memory tokenAmounts);
    function unlockPosition(uint256 tokenId, address recipient)
        external
        returns (uint256 principalReturned);
    function closePosition(uint256 tokenId) external;

    function positionData(uint256 tokenId)
        external
        view
        returns (address account, INARAPositionEngineV5.PositionState memory state);

    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
}
