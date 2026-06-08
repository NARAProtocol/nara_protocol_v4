// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

interface IEngineUnlockMock {
    function unlock(uint256 positionId) external payable;
    function unlockTo(uint256 positionId, address to) external payable;
}

contract MockEthRejectingPositionOwner {
    receive() external payable {
        revert();
    }

    function unlock(address engine, uint256 positionId) external payable {
        IEngineUnlockMock(engine).unlock{value: msg.value}(positionId);
    }

    function unlockTo(address engine, uint256 positionId, address to) external payable {
        IEngineUnlockMock(engine).unlockTo{value: msg.value}(positionId, to);
    }
}
