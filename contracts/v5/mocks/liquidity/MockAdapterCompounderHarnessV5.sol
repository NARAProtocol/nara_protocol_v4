// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {INARALiquidityPositionAdapterV5} from "../../interfaces/liquidity/INARALiquidityPositionAdapterV5.sol";

contract MockAdapterCompounderHarnessV5 is IERC721Receiver {
    using SafeERC20 for IERC20;

    address public immutable token;
    address public immutable base;
    address public immutable positionManager;
    uint256 public constant configuredMinimumNaraUsed = 1;
    uint256 public constant configuredMinimumBaseUsed = 1;

    uint256 public lastPositionTokenId;
    uint128 public lastLiquidityAdded;
    uint256 public lastNaraUsed;
    uint256 public lastBaseUsed;
    uint256 public lastNaraLpFeesHarvested;
    uint256 public lastBaseLpFeesHarvested;

    constructor(address token_, address base_, address positionManager_) {
        token = token_;
        base = base_;
        positionManager = positionManager_;
    }

    function add(
        address adapter,
        uint256 currentPositionTokenId,
        uint256 maximumNara,
        uint256 maximumBase,
        uint128 minimumLiquidity,
        uint64 deadline
    ) external {
        IERC20(token).forceApprove(adapter, maximumNara);
        IERC20(base).forceApprove(adapter, maximumBase);
        (
            uint256 positionTokenId,
            uint128 liquidityAdded,
            uint256 naraUsed,
            uint256 baseUsed,
            uint256 naraLpFeesHarvested,
            uint256 baseLpFeesHarvested
        ) = INARALiquidityPositionAdapterV5(adapter).addLiquidity(
            currentPositionTokenId,
            maximumNara,
            maximumBase,
            configuredMinimumNaraUsed,
            configuredMinimumBaseUsed,
            minimumLiquidity,
            deadline
        );
        IERC20(token).forceApprove(adapter, 0);
        IERC20(base).forceApprove(adapter, 0);
        if (currentPositionTokenId == 0) IERC721(positionManager).approve(adapter, positionTokenId);
        lastPositionTokenId = positionTokenId;
        lastLiquidityAdded = liquidityAdded;
        lastNaraUsed = naraUsed;
        lastBaseUsed = baseUsed;
        lastNaraLpFeesHarvested = naraLpFeesHarvested;
        lastBaseLpFeesHarvested = baseLpFeesHarvested;
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }
}
