// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IVaultOps {
    function pullToMarket(uint256 amount) external;
    function returnUnsold(uint256 amount) external;
}

/// @dev Minimal bond market stub for BondVault tests.
///      An EOA owner drives vault interactions through this contract,
///      allowing the vault's contract-address guard to pass.
contract MockBondMarket {
    using SafeERC20 for IERC20;

    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    /// @notice Pull NARA from vault into this contract.
    function pull(address vault_, uint256 amount) external onlyOwner {
        IVaultOps(vault_).pullToMarket(amount);
    }

    /// @notice Approve vault and return NARA from this contract back to it.
    function returnToVault(address vault_, address token_, uint256 amount) external onlyOwner {
        IERC20(token_).approve(vault_, amount);
        IVaultOps(vault_).returnUnsold(amount);
    }

    /// @notice Balance of a token held by this market.
    function tokenBalance(address token_) external view returns (uint256) {
        return IERC20(token_).balanceOf(address(this));
    }
}
