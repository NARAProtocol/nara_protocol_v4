// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {IPoolManager} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/Hooks.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolKey.sol";

/// @dev Contract-shaped Safe test double. Access control is intentionally omitted: tests care that
///      the Range Manager sees this contract, rather than an EOA, as msg.sender.
contract MockTreasuryRangeSafe {
    function execute(address target, bytes calldata data) external returns (bytes memory result) {
        (bool success, bytes memory returned) = target.call(data);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(returned, 0x20), mload(returned))
            }
        }
        return returned;
    }
}

contract MockTreasuryRangeVaultBinding {
    address public immutable token;
    address public immutable base;
    address public hook;

    constructor(address token_, address base_) {
        token = token_;
        base = base_;
    }

    function setHook(address hook_) external {
        hook = hook_;
    }
}

contract MockTreasuryRangePoolManager {
    uint256 internal constant POOLS_SLOT = 6;

    PoolId public poolId;
    uint160 public sqrtPriceX96;
    int24 public tick;
    uint128 public activeLiquidity;

    function setPool(PoolId poolId_, uint160 sqrtPriceX96_, int24 tick_, uint128 activeLiquidity_) external {
        poolId = poolId_;
        sqrtPriceX96 = sqrtPriceX96_;
        tick = tick_;
        activeLiquidity = activeLiquidity_;
    }

    function setPrice(uint160 sqrtPriceX96_, int24 tick_) external {
        sqrtPriceX96 = sqrtPriceX96_;
        tick = tick_;
    }

    function extsload(bytes32 slot) external view returns (bytes32 value) {
        bytes32 stateSlot = keccak256(abi.encode(PoolId.unwrap(poolId), POOLS_SLOT));
        if (slot == stateSlot) {
            uint256 packed = uint256(sqrtPriceX96) | (uint256(uint24(tick)) << 160);
            return bytes32(packed);
        }
        if (uint256(slot) == uint256(stateSlot) + 3) return bytes32(uint256(activeLiquidity));
        return bytes32(0);
    }
}

contract MockTreasuryRangePermit2 {
    using SafeERC20 for IERC20;

    struct PackedAllowance {
        uint160 amount;
        uint48 expiration;
        uint48 nonce;
    }

    mapping(address owner => mapping(address token => mapping(address spender => PackedAllowance approval)))
        private _allowances;

    function approve(address token, address spender, uint160 amount, uint48 expiration) external {
        PackedAllowance storage approval = _allowances[msg.sender][token][spender];
        approval.amount = amount;
        // Match Permit2: zero means an approval lasting only for the current block, not a stored zero.
        approval.expiration = expiration == 0 ? uint48(block.timestamp) : expiration;
        unchecked {
            ++approval.nonce;
        }
    }

    function allowance(address owner, address token, address spender)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce)
    {
        PackedAllowance storage approval = _allowances[owner][token][spender];
        return (approval.amount, approval.expiration, approval.nonce);
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        PackedAllowance storage approval = _allowances[from][token][msg.sender];
        require(approval.expiration >= block.timestamp, "permit expired");
        require(approval.amount >= amount, "permit amount");
        approval.amount -= amount;
        IERC20(token).safeTransferFrom(from, to, amount);
    }
}

contract MockTreasuryRangeHookBinding {
    using PoolIdLibrary for PoolKey;

    address public immutable token;
    address public immutable base;
    address public immutable vault;
    IPoolManager public immutable poolManager;
    uint24 public immutable CANONICAL_POOL_FEE;
    int24 public immutable CANONICAL_TICK_SPACING;
    bool public poolRegistered = true;
    PoolId public registeredPoolId;
    bool public tokenIsCurrency0;
    bool public invalidLiquidityPermissions;

    constructor(
        address token_,
        address base_,
        address vault_,
        IPoolManager poolManager_,
        uint24 fee_,
        int24 tickSpacing_
    ) {
        token = token_;
        base = base_;
        vault = vault_;
        poolManager = poolManager_;
        CANONICAL_POOL_FEE = fee_;
        CANONICAL_TICK_SPACING = tickSpacing_;
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(base_),
            currency1: Currency.wrap(token_),
            fee: fee_,
            tickSpacing: tickSpacing_,
            hooks: IHooks(address(this))
        });
        registeredPoolId = key.toId();
    }

    function setRegisteredPoolId(PoolId poolId_) external {
        registeredPoolId = poolId_;
    }

    function setPoolRegistered(bool registered) external {
        poolRegistered = registered;
    }

    function setInvalidLiquidityPermissions(bool invalid) external {
        invalidLiquidityPermissions = invalid;
    }

    function getHookPermissions() external view returns (Hooks.Permissions memory permissions) {
        permissions.beforeInitialize = true;
        permissions.beforeSwap = true;
        permissions.beforeSwapReturnDelta = true;
        permissions.beforeAddLiquidity = invalidLiquidityPermissions;
    }
}

contract MockTreasuryRangePositionManager is ERC721 {
    using CurrencyLibrary for Currency;
    using SafeERC20 for IERC20;

    struct PositionState {
        uint128 liquidity;
        int24 tickLower;
        int24 tickUpper;
        uint128 deposited0;
        uint128 deposited1;
        uint128 principal0;
        uint128 principal1;
        uint128 fees0;
        uint128 fees1;
        bool customSettlement;
    }

    IPoolManager public immutable poolManager;
    address public immutable permit2;
    Currency public immutable currency0;
    Currency public immutable currency1;

    uint256 public nextTokenId = 1;
    uint128 public mintDust0;
    uint128 public mintDust1;
    mapping(uint256 tokenId => PositionState position) public positions;

    address public reentryTarget;
    bytes public reentryData;
    bool public reenterOnBurn;

    constructor(address poolManager_, address permit2_, address currency0_, address currency1_)
        ERC721("Mock Treasury Range", "MTR")
    {
        poolManager = IPoolManager(poolManager_);
        permit2 = permit2_;
        currency0 = Currency.wrap(currency0_);
        currency1 = Currency.wrap(currency1_);
    }

    function setMintDust(uint128 amount0, uint128 amount1) external {
        mintDust0 = amount0;
        mintDust1 = amount1;
    }

    function setSettlement(
        uint256 tokenId,
        uint128 principal0,
        uint128 principal1,
        uint128 fees0,
        uint128 fees1
    ) external {
        PositionState storage position = positions[tokenId];
        position.principal0 = principal0;
        position.principal1 = principal1;
        position.fees0 = fees0;
        position.fees1 = fees1;
        position.customSettlement = true;
    }

    function setReentry(address target, bytes calldata data, bool enabled) external {
        reentryTarget = target;
        reentryData = data;
        reenterOnBurn = enabled;
    }

    function getPositionLiquidity(uint256 tokenId) external view returns (uint128 liquidity) {
        return positions[tokenId].liquidity;
    }

    /// @dev Mirrors canonical PositionManager's receiver-bypassing `_mint` behavior.
    function mintUnregisteredDirect(address to) external returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        _mint(to, tokenId);
        positions[tokenId].liquidity = 1;
    }

    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable {
        require(block.timestamp <= deadline, "deadline");
        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        require(actions.length == params.length, "length");

        uint256 pending0;
        uint256 pending1;
        for (uint256 i; i < actions.length; ++i) {
            uint8 action = uint8(actions[i]);
            if (action == 0x02) {
                (
                    PoolKey memory key,
                    int24 tickLower,
                    int24 tickUpper,
                    uint256 liquidity,
                    uint128 amount0Max,
                    uint128 amount1Max,
                    address owner,

                ) = abi.decode(params[i], (PoolKey, int24, int24, uint256, uint128, uint128, address, bytes));
                require(Currency.unwrap(key.currency0) == Currency.unwrap(currency0), "currency0");
                require(Currency.unwrap(key.currency1) == Currency.unwrap(currency1), "currency1");
                uint128 amount0 = amount0Max > mintDust0 ? amount0Max - mintDust0 : amount0Max;
                uint128 amount1 = amount1Max > mintDust1 ? amount1Max - mintDust1 : amount1Max;
                if (amount0 != 0) {
                    MockTreasuryRangePermit2(permit2).transferFrom(
                        msg.sender, address(this), amount0, Currency.unwrap(currency0)
                    );
                }
                if (amount1 != 0) {
                    MockTreasuryRangePermit2(permit2).transferFrom(
                        msg.sender, address(this), amount1, Currency.unwrap(currency1)
                    );
                }
                uint256 tokenId = nextTokenId++;
                _mint(owner, tokenId);
                positions[tokenId] = PositionState({
                    liquidity: uint128(liquidity),
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    deposited0: amount0,
                    deposited1: amount1,
                    principal0: 0,
                    principal1: 0,
                    fees0: 0,
                    fees1: 0,
                    customSettlement: false
                });
            } else if (action == 0x0d) {
                // SETTLE_PAIR is exercised by Permit2 pulls during MINT_POSITION above.
            } else if (action == 0x03) {
                (uint256 tokenId, uint128 amount0Min, uint128 amount1Min,) =
                    abi.decode(params[i], (uint256, uint128, uint128, bytes));
                require(ownerOf(tokenId) == msg.sender, "not owner");
                if (reenterOnBurn) {
                    reenterOnBurn = false;
                    (bool success, bytes memory returned) = reentryTarget.call(reentryData);
                    if (!success) {
                        assembly ("memory-safe") {
                            revert(add(returned, 0x20), mload(returned))
                        }
                    }
                }
                PositionState storage position = positions[tokenId];
                uint128 principal0 = position.customSettlement ? position.principal0 : position.deposited0;
                uint128 principal1 = position.customSettlement ? position.principal1 : position.deposited1;
                require(principal0 >= amount0Min, "amount0 min");
                require(principal1 >= amount1Min, "amount1 min");
                pending0 = uint256(principal0) + position.fees0;
                pending1 = uint256(principal1) + position.fees1;
                position.liquidity = 0;
                _burn(tokenId);
            } else if (action == 0x11) {
                (Currency take0, Currency take1, address recipient) =
                    abi.decode(params[i], (Currency, Currency, address));
                require(Currency.unwrap(take0) == Currency.unwrap(currency0), "take0");
                require(Currency.unwrap(take1) == Currency.unwrap(currency1), "take1");
                if (pending0 != 0) IERC20(Currency.unwrap(currency0)).safeTransfer(recipient, pending0);
                if (pending1 != 0) IERC20(Currency.unwrap(currency1)).safeTransfer(recipient, pending1);
                pending0 = 0;
                pending1 = 0;
            } else {
                revert("unsupported action");
            }
        }
    }
}
