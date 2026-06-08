// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

/// @title CREATE2 Hook Deployer
/// @notice Small owner-gated helper used to deploy the production Uniswap v4
///         hook at an address with the required permission bits.
contract Create2HookDeployer is Ownable {
    event Deployed(address indexed deployed, bytes32 indexed salt, bytes32 indexed initCodeHash);
    event NativeSwept(address indexed to, uint256 amount);

    error EmptyInitCode();
    error ZeroAddress();
    error ZeroValue();
    error NativeTransferFailed();

    constructor(address owner_) Ownable(owner_) {
        if (owner_ == address(0)) revert OwnableInvalidOwner(address(0));
    }

    function deploy(bytes32 salt, bytes calldata initCode) external payable onlyOwner returns (address deployed) {
        if (initCode.length == 0) revert EmptyInitCode();
        bytes32 initCodeHash = keccak256(initCode);
        deployed = Create2.deploy(msg.value, salt, initCode);
        emit Deployed(deployed, salt, initCodeHash);
    }

    function sweepNative(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroValue();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit NativeSwept(to, amount);
    }

    function computeAddress(bytes32 salt, bytes32 initCodeHash) external view returns (address) {
        return Create2.computeAddress(salt, initCodeHash, address(this));
    }
}
