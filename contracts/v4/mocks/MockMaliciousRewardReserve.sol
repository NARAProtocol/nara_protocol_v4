// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Test-only reward reserve that passes `setRewardReserve` validation (isValidFor + has
/// code) but can be flipped to revert on availableRewards()/releaseToEngine(). Used to prove the
/// engine fails open instead of freezing when a reserve misbehaves (M-04).
contract MockMaliciousRewardReserve {
    address public naraRef;
    address public engineRef;
    bool public boom;

    function configure(address nara_, address engine_) external {
        naraRef = nara_;
        engineRef = engine_;
    }

    function setBoom(bool v) external {
        boom = v;
    }

    function isValidFor(address nara_, address engine_) external view returns (bool) {
        return nara_ == naraRef && engine_ == engineRef;
    }

    function availableRewards() external view returns (uint256) {
        require(!boom, "boom");
        return 0;
    }

    function releaseToEngine(uint256) external view {
        require(!boom, "boom");
    }
}
