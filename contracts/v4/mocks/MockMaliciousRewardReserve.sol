// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

interface IMockReserveToken {
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Test-only reward reserve that passes `setRewardReserve` validation (isValidFor + has
/// code) but can be flipped to revert or under-deliver. Used to prove the engine fails open
/// instead of freezing when a reserve misbehaves (M-04) and measures successful pulls (M-01).
contract MockMaliciousRewardReserve {
    address public naraRef;
    address public engineRef;
    bool public boom;
    uint256 public available;
    uint256 public releaseAmount;

    function configure(address nara_, address engine_) external {
        naraRef = nara_;
        engineRef = engine_;
    }

    function setBoom(bool v) external {
        boom = v;
    }

    function setAvailable(uint256 v) external {
        available = v;
    }

    function setReleaseAmount(uint256 v) external {
        releaseAmount = v;
    }

    function isValidFor(address nara_, address engine_) external view returns (bool) {
        return nara_ == naraRef && engine_ == engineRef;
    }

    function availableRewards() external view returns (uint256) {
        require(!boom, "boom");
        return available;
    }

    function releaseToEngine(uint256) external {
        require(!boom, "boom");
        if (releaseAmount != 0) {
            IMockReserveToken(naraRef).transfer(engineRef, releaseAmount);
        }
    }
}
