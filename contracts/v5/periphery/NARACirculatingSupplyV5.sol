// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Immutable circulating-supply policy over an explicitly supplied exclusion set.
contract NARACirculatingSupplyV5 {
    uint256 public constant MAX_EXCLUDED_ACCOUNTS = 32;

    error InvalidToken();
    error InvalidExclusionSet();

    address public immutable token;
    address[] private _excludedAccounts;

    constructor(address token_, address[] memory excludedAccounts_) {
        if (token_ == address(0) || token_.code.length == 0) revert InvalidToken();
        if (excludedAccounts_.length > MAX_EXCLUDED_ACCOUNTS) revert InvalidExclusionSet();
        token = token_;

        for (uint256 i; i < excludedAccounts_.length; ++i) {
            address account = excludedAccounts_[i];
            if (account == address(0)) revert InvalidExclusionSet();
            for (uint256 j; j < i; ++j) {
                if (excludedAccounts_[j] == account) revert InvalidExclusionSet();
            }
            _excludedAccounts.push(account);
        }
    }

    function excludedAccounts() external view returns (address[] memory) {
        return _excludedAccounts;
    }

    function excludedSupply() public view returns (uint256 amount) {
        IERC20 asset = IERC20(token);
        uint256 length = _excludedAccounts.length;
        for (uint256 i; i < length; ++i) amount += asset.balanceOf(_excludedAccounts[i]);
    }

    function circulatingSupply() external view returns (uint256) {
        return IERC20(token).totalSupply() - excludedSupply();
    }
}
