// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Minimal deterministic deployment root for reviewed V5 init code.
/// @dev This contract is deliberately stateless and permissionless. The exact
///      production factory address, salt, init-code hash and constructor values
///      still require explicit manifest approval. Deploying through this helper
///      conveys no protocol role or upgrade authority.
contract NARACreate2FactoryV5 {
    error EmptyInitCode();
    error InitCodeHashMismatch(bytes32 expected, bytes32 actual);
    error PredictedAddressMismatch(address expected, address actual);
    error AddressAlreadyHasCode(address predicted);
    error Create2DeploymentFailed();

    event DeterministicContractDeployed(
        address indexed deployed,
        bytes32 indexed salt,
        bytes32 indexed initCodeHash,
        address caller
    );

    function deploy(
        bytes32 salt,
        bytes calldata initCode,
        bytes32 expectedInitCodeHash,
        address expectedAddress
    ) external returns (address deployed) {
        if (initCode.length == 0) revert EmptyInitCode();
        bytes32 actualInitCodeHash = keccak256(initCode);
        if (actualInitCodeHash != expectedInitCodeHash) {
            revert InitCodeHashMismatch(expectedInitCodeHash, actualInitCodeHash);
        }
        address predicted = computeAddress(salt, actualInitCodeHash);
        if (predicted != expectedAddress) revert PredictedAddressMismatch(expectedAddress, predicted);
        if (predicted.code.length != 0) revert AddressAlreadyHasCode(predicted);

        bytes memory code = initCode;
        assembly ("memory-safe") {
            deployed := create2(0, add(code, 0x20), mload(code), salt)
        }
        if (deployed == address(0) || deployed != predicted || deployed.code.length == 0) {
            revert Create2DeploymentFailed();
        }
        emit DeterministicContractDeployed(deployed, salt, actualInitCodeHash, msg.sender);
    }

    function computeAddress(bytes32 salt, bytes32 initCodeHash) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)))));
    }

    function permissionBitsMatch(address candidate, uint160 requiredBits, uint160 permissionMask)
        external
        pure
        returns (bool)
    {
        return (uint160(candidate) & permissionMask) == (requiredBits & permissionMask);
    }
}
