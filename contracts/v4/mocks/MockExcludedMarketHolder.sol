// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Minimal stand-in for a protocol contract (e.g. the bond vault) that holds NARA
///         and also self-reports off-balance market inventory via excludedMarketBalance().
///         Used to test NARACirculatingSupplyV1's try/catch probe path.
contract MockExcludedMarketHolder {
    uint256 public extra;

    function setExtra(uint256 value) external {
        extra = value;
    }

    function excludedMarketBalance() external view returns (uint256) {
        return extra;
    }
}
