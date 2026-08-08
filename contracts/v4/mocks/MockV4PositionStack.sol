// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

interface IMockPermit2Pull {
    function transferFrom(address from, address to, uint160 amount, address token) external;
}

/// @dev Faithful-enough test double that plays BOTH the Uniswap v4 PoolManager (for
///      `StateLibrary.getSlot0` via `extsload`) and the PositionManager (`modifyLiquidities` +
///      `nextTokenId` + the ERC-721 position) for unit-testing `NARALiquidityCompounderV4`.
///
///      It does not reimplement v4 liquidity math (that fidelity is covered by mirroring the proven
///      `scripts/seedV4Liquidity.ts` encoding + a Base fork test). Instead the test sets exactly how
///      much each side should be pulled (`setPull`), so the compounder's accounting — exact-spend
///      from the vault, remainder banking, mint-vs-increase, custody — can be asserted deterministically.
contract MockV4PositionStack is ERC721 {
    address public immutable permit2;
    address public immutable token;
    address public immutable base;
    address public immutable vault;
    address public immutable token0;
    address public immutable token1;

    uint160 public sqrtPriceX96;
    uint256 public pull0;
    uint256 public pull1;
    uint256 public lastFirstAction;
    uint256 private _nextId = 1;

    constructor(address permit2_, address token_, address base_, address vault_) ERC721("Mock LP", "MLP") {
        permit2 = permit2_;
        token = token_;
        base = base_;
        vault = vault_;
        (token0, token1) = uint160(token_) < uint160(base_) ? (token_, base_) : (base_, token_);
    }

    function poolManager() external view returns (address) {
        return address(this);
    }

    function CANONICAL_POOL_FEE() external pure returns (uint24) {
        return 3_000;
    }

    function CANONICAL_TICK_SPACING() external pure returns (int24) {
        return 60;
    }

    function setSqrtPrice(uint160 p) external {
        sqrtPriceX96 = p;
    }

    /// @notice Set how much of each currency the next `modifyLiquidities` will pull from the caller.
    function setPull(uint256 p0, uint256 p1) external {
        pull0 = p0;
        pull1 = p1;
    }

    // ── PoolManager surface (StateLibrary.getSlot0) ──
    function extsload(bytes32) external view returns (bytes32) {
        // slot0 packs sqrtPriceX96 in the bottom 160 bits; the rest (tick/fees) can be zero here.
        return bytes32(uint256(sqrtPriceX96));
    }

    // ── PositionManager surface ──
    function nextTokenId() external view returns (uint256) {
        return _nextId;
    }

    function modifyLiquidities(bytes calldata unlockData, uint256) external payable {
        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        require(params.length == 2, "params");
        require(actions.length == 2, "actions");
        uint8 first = uint8(actions[0]);
        lastFirstAction = first;

        if (pull0 != 0) IMockPermit2Pull(permit2).transferFrom(msg.sender, address(this), uint160(pull0), token0);
        if (pull1 != 0) IMockPermit2Pull(permit2).transferFrom(msg.sender, address(this), uint160(pull1), token1);

        if (first == 0x02) {
            // MINT_POSITION
            _safeMint(msg.sender, _nextId);
            _nextId += 1;
        }
        // 0x00 INCREASE_LIQUIDITY: no new mint
    }
}
