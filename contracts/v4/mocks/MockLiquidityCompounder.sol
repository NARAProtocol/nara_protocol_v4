// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ILiquidityCompounder} from "../NARALiquidityGrowthVault.sol";

contract MockLiquidityCompounder is ILiquidityCompounder {
    using SafeERC20 for IERC20;

    address public immutable nara;
    address public immutable usdc;
    address public immutable vault;
    address public lastCaller;
    address public lastToken;
    address public lastBase;
    uint256 public lastTokenAmount;
    uint256 public lastBaseAmount;
    bytes public lastData;
    uint256 public totalLiquidityAdded;
    bool public skipPulls;

    event MockCompounded(
        address indexed caller,
        address indexed token,
        address indexed base,
        uint256 tokenAmount,
        uint256 baseAmount,
        uint256 liquidityAdded
    );

    constructor(address nara_, address usdc_, address vault_) {
        nara = nara_;
        usdc = usdc_;
        vault = vault_;
    }

    function setSkipPulls(bool skipPulls_) external {
        skipPulls = skipPulls_;
    }

    function compound(
        address token,
        address base,
        uint256 tokenAmount,
        uint256 baseAmount,
        bytes calldata data
    ) external returns (uint256 liquidityAdded) {
        lastCaller = msg.sender;
        lastToken = token;
        lastBase = base;
        lastTokenAmount = tokenAmount;
        lastBaseAmount = baseAmount;
        lastData = data;

        if (!skipPulls) {
            if (tokenAmount != 0) IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
            if (baseAmount != 0) IERC20(base).safeTransferFrom(msg.sender, address(this), baseAmount);
        }

        liquidityAdded = tokenAmount + baseAmount;
        totalLiquidityAdded += liquidityAdded;
        emit MockCompounded(msg.sender, token, base, tokenAmount, baseAmount, liquidityAdded);
    }
}
