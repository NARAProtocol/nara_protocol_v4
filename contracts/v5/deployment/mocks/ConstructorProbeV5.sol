// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

contract ConstructorProbeV5 {
    address public immutable authority;
    bytes32 public immutable configurationHash;

    constructor(address authority_, bytes32 configurationHash_) {
        authority = authority_;
        configurationHash = configurationHash_;
    }
}

