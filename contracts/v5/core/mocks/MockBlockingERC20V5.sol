// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only token used to model a fee-base issuer pausing or blacklisting
///      transfers from the Engine after rewards have accrued.
contract MockBlockingERC20V5 is ERC20 {
    address public immutable administrator;
    uint8 private immutable _tokenDecimals;
    mapping(address account => bool blocked) public blockedSender;

    error Unauthorized();
    error BlockedSender(address sender);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 supply_,
        address recipient_,
        address administrator_
    ) ERC20(name_, symbol_) {
        administrator = administrator_;
        _tokenDecimals = decimals_;
        _mint(recipient_, supply_);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function setBlockedSender(address account, bool blocked) external {
        if (msg.sender != administrator) revert Unauthorized();
        blockedSender[account] = blocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && blockedSender[from]) revert BlockedSender(from);
        super._update(from, to, value);
    }
}
