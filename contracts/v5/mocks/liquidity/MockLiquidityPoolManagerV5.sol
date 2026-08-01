// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IMintableLiquidityAssetV5 {
    function mint(address to, uint256 amount) external;
}

contract MockLiquidityPoolManagerV5 {
    using SafeERC20 for IERC20;

    bytes32 internal constant POOLS_SLOT = bytes32(uint256(6));

    address public immutable token;
    address public immutable base;
    mapping(bytes32 slot => bytes32 value) internal poolWords;
    mapping(address owner => mapping(uint256 id => uint256 amount)) private _claims;
    mapping(address currency => int256 delta) private _delta;
    bool private _unlocked;

    error Locked();
    error AlreadyUnlocked();
    error InvalidCurrency();
    error UnsettledDelta();

    constructor(address token_, address base_) {
        token = token_;
        base = base_;
    }

    function setPoolState(PoolId poolId, uint160 sqrtPriceX96, int24 tick, uint128 liquidity) external {
        bytes32 stateSlot = keccak256(abi.encodePacked(PoolId.unwrap(poolId), POOLS_SLOT));
        poolWords[stateSlot] = bytes32(
            uint256(sqrtPriceX96) | (uint256(uint24(tick)) << 160) | (uint256(3_000) << 208)
        );
        poolWords[bytes32(uint256(stateSlot) + 3)] = bytes32(uint256(liquidity));
    }

    function extsload(bytes32 slot) external view returns (bytes32) {
        return poolWords[slot];
    }

    function mintClaimsForTest(address owner, address currency, uint256 amount) external {
        if (currency != token && currency != base) revert InvalidCurrency();
        _claims[owner][uint256(uint160(currency))] += amount;
        IMintableLiquidityAssetV5(currency).mint(address(this), amount);
    }

    /// @dev Fixed-supply integration helper: backs every synthetic claim with
    ///      tokens transferred in by the caller instead of using a mint hook.
    function fundClaimsForTest(address owner, address currency, uint256 amount) external {
        if (currency != token && currency != base) revert InvalidCurrency();
        uint256 beforeBalance = IERC20(currency).balanceOf(address(this));
        IERC20(currency).safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(currency).balanceOf(address(this)) - beforeBalance != amount) {
            revert UnsettledDelta();
        }
        _claims[owner][uint256(uint160(currency))] += amount;
    }

    function balanceOf(address owner, uint256 id) external view returns (uint256) {
        return _claims[owner][id];
    }

    function unlock(bytes calldata data) external returns (bytes memory result) {
        if (_unlocked) revert AlreadyUnlocked();
        _unlocked = true;
        result = IUnlockCallback(msg.sender).unlockCallback(data);
        if (_delta[token] != 0 || _delta[base] != 0) revert UnsettledDelta();
        _unlocked = false;
    }

    function burn(address from, uint256 id, uint256 amount) external {
        if (!_unlocked) revert Locked();
        address currency = address(uint160(id));
        if (currency != token && currency != base) revert InvalidCurrency();
        _claims[from][id] -= amount;
        _delta[currency] += int256(amount);
    }

    function take(address currency, address to, uint256 amount) external {
        if (!_unlocked) revert Locked();
        if (_delta[currency] < int256(amount)) revert UnsettledDelta();
        _delta[currency] -= int256(amount);
        IERC20(currency).safeTransfer(to, amount);
    }
}
