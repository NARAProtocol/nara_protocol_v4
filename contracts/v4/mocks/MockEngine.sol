// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

interface ILauncherView {
    function pendingToken() external view returns (address);
}

/// @dev Minimal stand-in for the real NARA engine. Demonstrates the CREATE2
/// circular-dep resolution pattern used by NARALauncher.
///
/// The constructor reads `pendingToken()` off msg.sender (the launcher) and
/// stores it as immutable. On mainnet the real engine will do the same read,
/// then proceed with its own epoch / reward-reserve wiring.
///
/// DO NOT USE OUTSIDE TESTS.
contract MockEngine {
    /// @notice NARA token this engine is bound to. Read from launcher in constructor.
    address public immutable NARA;

    /// @notice Extra constructor args forwarded as a sanity check.
    uint256 public immutable CONFIG_VALUE;

    /// @notice Launcher that deployed us. Recorded for verification in tests.
    address public immutable LAUNCHER;

    error TokenNotPublished();

    constructor(uint256 configValue_) {
        address published = ILauncherView(msg.sender).pendingToken();
        if (published == address(0)) revert TokenNotPublished();
        NARA = published;
        LAUNCHER = msg.sender;
        CONFIG_VALUE = configValue_;
    }
}
