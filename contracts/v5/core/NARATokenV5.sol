// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title NARA fixed-supply token V5
/// @notice Constructor-parameterized, non-upgradeable ERC-20 with EIP-2612 permit.
/// @dev The complete supply is minted once. There is no owner, ordinary mint,
///      flash mint, pause, blacklist, fee, or post-deployment parameter surface.
///      Omitting flash mint also removes the V4 token/Engine circular dependency.
contract NARATokenV5 is ERC20, ERC20Permit {
    uint8 public constant MAX_DECIMALS = 18;
    uint256 public constant MAX_FIXED_SUPPLY = type(uint128).max;
    uint256 public constant MAX_NAME_BYTES = 64;
    uint256 public constant MAX_SYMBOL_BYTES = 16;

    uint256 public immutable fixedSupply;
    uint8 private immutable _fixedDecimals;

    error InvalidAddress();
    error InvalidMetadata();
    error InvalidDecimals();
    error InvalidSupply();

    event FixedSupplyCreated(
        address indexed allocationRecipient,
        uint256 fixedSupply,
        uint8 decimals,
        string name,
        string symbol
    );

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 fixedSupply_,
        address allocationRecipient_
    ) ERC20(name_, symbol_) ERC20Permit(name_) {
        uint256 nameLength = bytes(name_).length;
        uint256 symbolLength = bytes(symbol_).length;
        if (allocationRecipient_ == address(0)) revert InvalidAddress();
        if (
            nameLength == 0 || nameLength > MAX_NAME_BYTES ||
            symbolLength == 0 || symbolLength > MAX_SYMBOL_BYTES
        ) revert InvalidMetadata();
        if (decimals_ > MAX_DECIMALS) revert InvalidDecimals();
        if (fixedSupply_ == 0 || fixedSupply_ > MAX_FIXED_SUPPLY) revert InvalidSupply();

        _fixedDecimals = decimals_;
        fixedSupply = fixedSupply_;
        _mint(allocationRecipient_, fixedSupply_);

        emit FixedSupplyCreated(
            allocationRecipient_, fixedSupply_, decimals_, name_, symbol_
        );
    }

    function decimals() public view override returns (uint8) {
        return _fixedDecimals;
    }
}
