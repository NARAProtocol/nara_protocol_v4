// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20FlashMint} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20FlashMint.sol";
import {ERC1363} from "@openzeppelin/contracts/token/ERC20/extensions/ERC1363.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {IERC3156FlashLender} from "@openzeppelin/contracts/interfaces/IERC3156FlashLender.sol";

/// @title NARA Token (v4)
/// @notice Fixed-outstanding-supply NARA token for Base. Zero admin, zero mint, zero pause.
/// @dev Feature matrix:
///  - ERC20Permit (EIP-2612 gasless approvals, domain validated via EIP-712)
///  - ERC20FlashMint (ERC-3156 flash loans; fee = 10 bps, routed to FLASH_FEE_SINK, hard-capped)
///  - ERC1363 (transferAndCall / approveAndCall for single-tx dApp flows)
///  - Multicall (batch calls; protocol permit wrappers are preferred for permit + lock flows)
///
/// Immutability guarantees:
///  - MAX_SUPPLY is minted once in constructor; flash mints are bounded and repaid in the same transaction.
///  - FLASH_FEE_SINK is immutable; set once at deploy (typically the engine).
///  - No owner, no pause, no blacklist, no upgrade path, no admin setter.
contract NARAToken is ERC20, ERC20Permit, ERC20FlashMint, ERC1363, Multicall {
    /// @notice Total token supply. 1,000,000 NARA. Minted once to `treasury_`.
    uint256 public constant MAX_SUPPLY = 1_000_000 ether;

    /// @notice Maximum same-transaction flash-minted supply. 10% of MAX_SUPPLY.
    uint256 public constant MAX_FLASH_LOAN = 100_000 ether;

    /// @notice Flash loan fee in basis points (0.10%).
    /// @dev Hardcoded. Cannot be changed. Rationale: predictable economics, no admin key.
    uint16 public constant FLASH_FEE_BPS = 10;

    /// @notice Receiver of flash loan fees. Typically the NARA engine.
    /// @dev Immutable. Set once at deploy. When this is the engine, NARA flash
    /// fees arrive as a token-balance surplus and are absorbed into the emission
    /// reserve by syncEmissionReserve or epoch advancement.
    address public immutable FLASH_FEE_SINK;

    error ZeroAddress();
    error EmptyMetadata();

    constructor(
        address treasury_,
        address flashFeeSink_,
        string memory name_,
        string memory symbol_
    )
        ERC20(name_, symbol_)
        ERC20Permit(name_)
    {
        if (treasury_ == address(0) || flashFeeSink_ == address(0)) revert ZeroAddress();
        if (bytes(name_).length == 0 || bytes(symbol_).length == 0) revert EmptyMetadata();
        FLASH_FEE_SINK = flashFeeSink_;
        _mint(treasury_, MAX_SUPPLY);
    }

    // ============================================================
    // Flash mint fee logic
    // ============================================================

    /// @dev Fee = amount * 10 / 10_000 (0.10%). Zero-loan still costs zero.
    function _flashFee(address /*token*/, uint256 value) internal pure override returns (uint256) {
        return (value * FLASH_FEE_BPS) / 10_000;
    }

    /// @notice Returns the fee for a supported flash loan amount.
    function flashFee(address token, uint256 value) public view override returns (uint256) {
        if (token != address(this)) revert ERC3156UnsupportedToken(token);
        if (value > MAX_FLASH_LOAN) revert ERC3156ExceededMaxLoan(MAX_FLASH_LOAN);
        return _flashFee(token, value);
    }

    /// @dev Fee is routed to the immutable engine-bound sink.
    function _flashFeeReceiver() internal view override returns (address) {
        return FLASH_FEE_SINK;
    }

    /// @notice Bound flash-minted supply to the protocol cap.
    function maxFlashLoan(address token) public view override returns (uint256) {
        if (token != address(this)) return 0;
        return MAX_FLASH_LOAN;
    }

    /// @dev Add IERC3156FlashLender to the list of supported interfaces.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1363)
        returns (bool)
    {
        return
            interfaceId == type(IERC3156FlashLender).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
