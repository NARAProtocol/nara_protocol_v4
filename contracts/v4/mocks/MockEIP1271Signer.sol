// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MockEIP1271Signer is IERC1271 {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4)
    {
        (address recovered, ECDSA.RecoverError error,) =
            ECDSA.tryRecover(hash, signature);
        return
            error == ECDSA.RecoverError.NoError && recovered == owner
                ? IERC1271.isValidSignature.selector
                : bytes4(0xffffffff);
    }
}
