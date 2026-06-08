// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC1363Receiver} from "@openzeppelin/contracts/interfaces/IERC1363Receiver.sol";
import {IERC1363Spender} from "@openzeppelin/contracts/interfaces/IERC1363Spender.sol";

/// @dev Test helper. DO NOT DEPLOY TO MAINNET.
contract MockERC1363Receiver is IERC1363Receiver, IERC1363Spender {
    event Received(address operator, address from, uint256 value, bytes data);
    event Approved(address owner, uint256 value, bytes data);

    address public lastOperator;
    address public lastFrom;
    address public lastOwner;
    uint256 public lastValue;
    bytes public lastData;

    bool public rejectTransfer;
    bool public rejectApproval;

    function setReject(bool rejectTransfer_, bool rejectApproval_) external {
        rejectTransfer = rejectTransfer_;
        rejectApproval = rejectApproval_;
    }

    function onTransferReceived(
        address operator,
        address from,
        uint256 value,
        bytes calldata data
    ) external override returns (bytes4) {
        emit Received(operator, from, value, data);
        lastOperator = operator;
        lastFrom = from;
        lastValue = value;
        lastData = data;
        if (rejectTransfer) return bytes4(0);
        return IERC1363Receiver.onTransferReceived.selector;
    }

    function onApprovalReceived(
        address owner,
        uint256 value,
        bytes calldata data
    ) external override returns (bytes4) {
        emit Approved(owner, value, data);
        lastOwner = owner;
        lastValue = value;
        lastData = data;
        if (rejectApproval) return bytes4(0);
        return IERC1363Spender.onApprovalReceived.selector;
    }
}
