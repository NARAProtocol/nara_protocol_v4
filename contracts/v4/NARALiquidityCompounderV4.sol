// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import {IPoolManager} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-periphery/lib/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-periphery/lib/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-periphery/lib/v4-core/src/types/PoolId.sol";
import {IHooks} from "@uniswap/v4-periphery/lib/v4-core/src/interfaces/IHooks.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

/// @dev The vault's compounder hook. The vault forceApproves this contract for exactly
///      `tokenAmount`/`baseAmount` then calls `compound`, and afterwards asserts this
///      contract spent *exactly* those amounts out of the vault (`CompounderDidNotSpend`)
///      and that `liquidityAdded >= minLiquidityAdded` (`SlippageExceeded`).
interface ILiquidityCompounder {
    function compound(
        address token,
        address base,
        uint256 tokenAmount,
        uint256 baseAmount,
        bytes calldata data
    ) external returns (uint256 liquidityAdded);
}

/// @dev Minimal Uniswap v4 PositionManager surface (periphery). Same calls the project's
///      `scripts/seedV4Liquidity.ts` uses.
interface IPositionManagerMinimal {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function nextTokenId() external view returns (uint256);
}

/// @dev Minimal Permit2 (AllowanceTransfer) surface used by the v4 PositionManager.
interface IPermit2Minimal {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

/// @title NARALiquidityCompounderV4
/// @notice Production `ILiquidityCompounder` adapter for the NARA liquidity flywheel. Pulls the
///         NARA+USDC skim the `NARALiquidityGrowthVault` has accumulated and adds it as a single,
///         permanent, **full-range** protocol-owned liquidity (POL) position in the NARA/USDC
///         Uniswap v4 pool via the canonical PositionManager + Permit2 path.
/// @dev Design (locked with the operator):
///      - **Full range** (`MIN_TICK..MAX_TICK` aligned to tickSpacing) → never goes out of range,
///        no rebalancing/management, and far smaller price-manipulation surface than a concentrated
///        range (a manipulated spot only skews the deposit ratio; full-range POL holds both sides
///        across all prices and is permanent).
///      - **No swapping.** Whatever the skim ratio is, only the balanced portion at the *live* pool
///        price is added; the unbalanced remainder is **banked** in this contract and rolls into the
///        next `compound`. No swap = no MEV surface, nothing to manage.
///      - **Exact-spend invariant.** `compound` pulls exactly `tokenAmount`/`baseAmount` from the
///        vault (satisfying the vault's `CompounderDidNotSpend` check); the leftover stays here, not
///        in the vault.
///      - **Live price only.** Liquidity is computed from the pool's live `sqrtPriceX96`
///        (`StateLibrary.getSlot0`), never from the deposited amounts. The keeper's
///        `minLiquidityAdded` (enforced by the vault) is the slippage guard against a manipulated tick.
///      - **POL custody.** The LP position NFT is minted to and held by this contract. The owner (the
///        protocol multisig) can migrate it to a validated treasury; it can never go to an EOA via a
///        single setter without that being the owner's explicit choice.
contract NARALiquidityCompounderV4 is ILiquidityCompounder, Ownable2Step, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    // v4-periphery action codes (Actions.sol).
    uint8 internal constant INCREASE_LIQUIDITY = 0x00;
    uint8 internal constant MINT_POSITION = 0x02;
    uint8 internal constant SETTLE_PAIR = 0x0d;

    uint48 internal constant PERMIT2_MAX_EXPIRATION = type(uint48).max;
    uint160 internal constant PERMIT2_MAX_AMOUNT = type(uint160).max;

    /// @notice Cooldown before any owner POL-removal action can execute. Gives holders a guaranteed
    ///         ≥7-day exit window after a recovery is announced on-chain.
    uint64 public constant RECOVERY_DELAY = 7 days;

    /// @dev The POL-removal actions, all gated behind the RECOVERY_DELAY timelock.
    enum RecoveryKind { None, MigratePosition, RecoverPoolTokens, WindDown }

    error ZeroAddress();
    error NotAContract();
    error NotVault();
    error WrongTokens();
    error InvalidTickSpacing();
    error InvalidRecoveryKind();
    error NoPendingRecovery();
    error RecoveryNotReady();

    IERC20 public immutable nara;
    IERC20 public immutable usdc;
    IPoolManager public immutable poolManager;
    IPositionManagerMinimal public immutable positionManager;
    IPermit2Minimal public immutable permit2;
    address public immutable vault;

    // Pool key (immutable single NARA/USDC pool).
    Currency internal immutable currency0;
    Currency internal immutable currency1;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;
    IHooks internal immutable hooks;
    PoolId internal immutable poolId;
    bool public immutable naraIsCurrency0;

    // Full-range ticks, aligned to tickSpacing.
    int24 public immutable tickLower;
    int24 public immutable tickUpper;

    /// @notice The protocol-owned LP position NFT id. 0 until the first compound mints it.
    uint256 public positionTokenId;

    // Lifetime accounting (realized facts).
    uint256 public totalNaraAdded;
    uint256 public totalUsdcAdded;
    uint256 public totalLiquidityAdded;

    event Compounded(
        uint256 indexed positionTokenId,
        uint256 naraUsed,
        uint256 usdcUsed,
        uint256 liquidityAdded,
        uint256 naraBanked,
        uint256 usdcBanked
    );
    event PositionMinted(uint256 indexed positionTokenId);
    event PositionMigrated(address indexed to, uint256 indexed positionTokenId);
    event Permit2Refreshed();
    event ForeignTokenRecovered(address indexed token, address indexed to, uint256 amount);
    event PoolTokensRecovered(address indexed to, uint256 naraAmount, uint256 usdcAmount);
    event WoundDown(address indexed to, uint256 positionTokenId, uint256 naraAmount, uint256 usdcAmount);
    event RecoveryProposed(RecoveryKind indexed kind, address indexed to, uint64 eta);
    event RecoveryCancelled();

    /// @param owner_ protocol multisig (controls migration / recovery).
    /// @param vault_ the `NARALiquidityGrowthVault` that calls `compound`.
    constructor(
        address owner_,
        address vault_,
        address poolManager_,
        address positionManager_,
        address permit2_,
        address nara_,
        address usdc_,
        uint24 poolFee_,
        int24 tickSpacing_,
        address hooks_
    ) Ownable(owner_) {
        // hooks_ may legitimately be address(0) — a v4 pool can have no hook. In NARA production it
        // is the 0x2088 liquidity hook; a wrong non-zero hook is no safer than zero (both just point
        // at the wrong poolId and fail at first compound), so it is not gated here.
        if (
            vault_ == address(0) ||
            poolManager_ == address(0) ||
            positionManager_ == address(0) ||
            permit2_ == address(0) ||
            nara_ == address(0) ||
            usdc_ == address(0)
        ) revert ZeroAddress();
        if (
            vault_.code.length == 0 ||
            poolManager_.code.length == 0 ||
            positionManager_.code.length == 0 ||
            permit2_.code.length == 0 ||
            nara_.code.length == 0 ||
            usdc_.code.length == 0
        ) revert NotAContract();
        if (tickSpacing_ <= 0) revert InvalidTickSpacing();

        vault = vault_;
        poolManager = IPoolManager(poolManager_);
        positionManager = IPositionManagerMinimal(positionManager_);
        permit2 = IPermit2Minimal(permit2_);
        nara = IERC20(nara_);
        usdc = IERC20(usdc_);
        poolFee = poolFee_;
        tickSpacing = tickSpacing_;
        hooks = IHooks(hooks_);

        bool naraIs0 = uint160(nara_) < uint160(usdc_);
        naraIsCurrency0 = naraIs0;
        (address c0, address c1) = naraIs0 ? (nara_, usdc_) : (usdc_, nara_);
        currency0 = Currency.wrap(c0);
        currency1 = Currency.wrap(c1);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: poolFee_,
            tickSpacing: tickSpacing_,
            hooks: IHooks(hooks_)
        });
        poolId = key.toId();

        // Full range, aligned to tickSpacing.
        tickLower = (TickMath.MIN_TICK / tickSpacing_) * tickSpacing_;
        tickUpper = (TickMath.MAX_TICK / tickSpacing_) * tickSpacing_;

        _refreshPermit2Allowances();
    }

    // ─── ILiquidityCompounder ────────────────────────────────────────────────

    /// @inheritdoc ILiquidityCompounder
    /// @dev `data` is always empty (the vault enforces `data.length == 0`). All parameters are
    ///      computed internally from the live pool price; the vault's `minLiquidityAdded` is the
    ///      slippage guard. Pulls exactly `tokenAmount` NARA + `baseAmount` USDC from the vault.
    function compound(
        address token,
        address base,
        uint256 tokenAmount,
        uint256 baseAmount,
        bytes calldata /* data */
    ) external override nonReentrant returns (uint256 liquidityAdded) {
        if (msg.sender != vault) revert NotVault();
        if (token != address(nara) || base != address(usdc)) revert WrongTokens();

        // 1) Pull exactly the approved amounts from the vault (satisfies CompounderDidNotSpend).
        if (tokenAmount != 0) nara.safeTransferFrom(vault, address(this), tokenAmount);
        if (baseAmount != 0) usdc.safeTransferFrom(vault, address(this), baseAmount);

        // 2) Add the balanced portion of the TOTAL on-hand balance (new + previously banked).
        uint256 naraBal = nara.balanceOf(address(this));
        uint256 usdcBal = usdc.balanceOf(address(this));
        if (naraBal == 0 || usdcBal == 0) {
            // Nothing addable yet — keep banked. Vault's minLiquidityAdded(>0) will revert if the
            // keeper expected an add; that is the correct signal not to call with one side empty.
            emit Compounded(positionTokenId, 0, 0, 0, naraBal, usdcBal);
            return 0;
        }

        (uint256 amount0, uint256 amount1) = naraIsCurrency0 ? (naraBal, usdcBal) : (usdcBal, naraBal);

        // 3) Liquidity from the LIVE pool price (never from deposited amounts).
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );
        if (liquidity == 0) {
            emit Compounded(positionTokenId, 0, 0, 0, naraBal, usdcBal);
            return 0;
        }

        uint256 naraBefore = naraBal;
        uint256 usdcBefore = usdcBal;

        // 4) Add liquidity via PositionManager (Permit2 pulls only what `liquidity` needs at the
        //    live price; the unbalanced remainder stays here and rolls into the next call).
        _addLiquidity(liquidity, _u128(amount0), _u128(amount1));

        uint256 naraUsed = naraBefore - nara.balanceOf(address(this));
        uint256 usdcUsed = usdcBefore - usdc.balanceOf(address(this));

        totalNaraAdded += naraUsed;
        totalUsdcAdded += usdcUsed;
        totalLiquidityAdded += liquidity;
        liquidityAdded = liquidity;

        emit Compounded(
            positionTokenId,
            naraUsed,
            usdcUsed,
            liquidity,
            nara.balanceOf(address(this)),
            usdc.balanceOf(address(this))
        );
    }

    // ─── Internal: PositionManager add ───────────────────────────────────────

    function _addLiquidity(uint128 liquidity, uint128 amount0Max, uint128 amount1Max) internal {
        bytes memory actions;
        bytes[] memory params = new bytes[](2);

        if (positionTokenId == 0) {
            uint256 expectedId = positionManager.nextTokenId();
            actions = abi.encodePacked(MINT_POSITION, SETTLE_PAIR);
            params[0] = abi.encode(
                _poolKey(),
                tickLower,
                tickUpper,
                uint256(liquidity),
                amount0Max,
                amount1Max,
                address(this), // POL position owned by this contract
                bytes("")
            );
            params[1] = abi.encode(currency0, currency1);
            positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
            positionTokenId = expectedId;
            emit PositionMinted(expectedId);
        } else {
            actions = abi.encodePacked(INCREASE_LIQUIDITY, SETTLE_PAIR);
            params[0] = abi.encode(positionTokenId, uint256(liquidity), amount0Max, amount1Max, bytes(""));
            params[1] = abi.encode(currency0, currency1);
            positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
        }
    }

    function _poolKey() internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: poolFee,
            tickSpacing: tickSpacing,
            hooks: hooks
        });
    }

    // ─── Owner: POL custody / recovery (recovery-now, permanence-later) ───────────
    //
    // While the code is young, the owner (Safe) keeps two deliberate, disclosed recovery levers:
    //   1. migratePosition  — move the whole POL position NFT (e.g. to a fixed v2 compounder) if a
    //                         bug is found post-mainnet.
    //   2. recoverPoolTokens / windDown — remove whatever is left (idle banked tokens, and the
    //                         position) if the deployment is retired.
    // These make the POL *owner-recoverable*, not trustlessly permanent — that is the chosen posture
    // for a fresh deploy. To graduate to permanent POL once battle-tested, transfer ownership to a
    // timelock or call `renounceOwnership()`; after that these levers are dead and the liquidity is
    // immutable. Owner is the protocol multisig; none of these can mint or touch user funds.

    /// @notice Re-set Permit2 allowances (PositionManager) in case they ever lapse. No funds move,
    ///         no timelock needed.
    function refreshPermit2Allowances() external onlyOwner {
        _refreshPermit2Allowances();
    }

    /// @notice Recover a non-pool ERC-20 accidentally sent here. Pool tokens (NARA/USDC) are excluded
    ///         — those are POL and only leave via the timelocked recovery flow below. No timelock:
    ///         stray foreign tokens are not POL and don't affect anyone's exit.
    function recoverForeignToken(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(nara) || token == address(usdc)) revert WrongTokens();
        IERC20(token).safeTransfer(to, amount);
        emit ForeignTokenRecovered(token, to, amount);
    }

    // ── POL recovery timelock (7-day cooldown) ──
    // Every action that removes POL — migrating the position, sweeping banked tokens, or a full
    // wind-down — is 2-step: propose → wait RECOVERY_DELAY (7 days) → execute. The on-chain
    // RecoveryProposed event + the public `pendingRecovery` guarantee every holder a ≥7-day window
    // to exit before any liquidity actually moves.

    struct PendingRecovery {
        RecoveryKind kind;
        address to;
        uint64 eta;
    }

    PendingRecovery public pendingRecovery;

    /// @notice Queue a POL-removal action. Executable only after RECOVERY_DELAY. Re-proposing
    ///         overwrites any prior pending action and restarts the 7-day clock.
    function proposeRecovery(RecoveryKind kind, address to) external onlyOwner {
        if (kind == RecoveryKind.None) revert InvalidRecoveryKind();
        if (to == address(0) || to == address(this)) revert ZeroAddress();
        uint64 eta = uint64(block.timestamp) + RECOVERY_DELAY;
        pendingRecovery = PendingRecovery({kind: kind, to: to, eta: eta});
        emit RecoveryProposed(kind, to, eta);
    }

    /// @notice Cancel a pending recovery (e.g. a bug was fixed in place; no migration needed).
    function cancelRecovery() external onlyOwner {
        if (pendingRecovery.kind == RecoveryKind.None) revert NoPendingRecovery();
        delete pendingRecovery;
        emit RecoveryCancelled();
    }

    /// @notice Execute the queued recovery once the 7-day cooldown has elapsed.
    function executeRecovery() external onlyOwner nonReentrant {
        PendingRecovery memory p = pendingRecovery;
        if (p.kind == RecoveryKind.None) revert NoPendingRecovery();
        if (block.timestamp < p.eta) revert RecoveryNotReady();
        delete pendingRecovery;

        if (p.kind == RecoveryKind.MigratePosition) {
            _migratePosition(p.to);
        } else if (p.kind == RecoveryKind.RecoverPoolTokens) {
            _recoverPoolTokens(p.to);
        } else {
            _windDown(p.to);
        }
    }

    /// @dev Migrate the whole POL position NFT to `to` (bug-recovery / upgrade to a fixed v2).
    function _migratePosition(address to) internal {
        uint256 id = positionTokenId;
        if (id == 0) revert ZeroAddress();
        positionTokenId = 0;
        IERC721(address(positionManager)).safeTransferFrom(address(this), to, id);
        emit PositionMigrated(to, id);
    }

    /// @dev Sweep idle banked NARA + USDC (skim not yet pooled) to `to`. Pooled liquidity is untouched.
    function _recoverPoolTokens(address to) internal {
        uint256 naraAmount = nara.balanceOf(address(this));
        uint256 usdcAmount = usdc.balanceOf(address(this));
        if (naraAmount != 0) nara.safeTransfer(to, naraAmount);
        if (usdcAmount != 0) usdc.safeTransfer(to, usdcAmount);
        emit PoolTokensRecovered(to, naraAmount, usdcAmount);
    }

    /// @dev Full wind-down: position NFT (if any) + banked NARA/USDC to `to`. "Remove whatever is left".
    function _windDown(address to) internal {
        uint256 id = positionTokenId;
        if (id != 0) {
            positionTokenId = 0;
            IERC721(address(positionManager)).safeTransferFrom(address(this), to, id);
        }
        uint256 naraAmount = nara.balanceOf(address(this));
        uint256 usdcAmount = usdc.balanceOf(address(this));
        if (naraAmount != 0) nara.safeTransfer(to, naraAmount);
        if (usdcAmount != 0) usdc.safeTransfer(to, usdcAmount);
        emit WoundDown(to, id, naraAmount, usdcAmount);
    }

    function _refreshPermit2Allowances() internal {
        nara.forceApprove(address(permit2), type(uint256).max);
        usdc.forceApprove(address(permit2), type(uint256).max);
        permit2.approve(address(nara), address(positionManager), PERMIT2_MAX_AMOUNT, PERMIT2_MAX_EXPIRATION);
        permit2.approve(address(usdc), address(positionManager), PERMIT2_MAX_AMOUNT, PERMIT2_MAX_EXPIRATION);
        emit Permit2Refreshed();
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function bankedBalances() external view returns (uint256 naraBanked, uint256 usdcBanked) {
        naraBanked = nara.balanceOf(address(this));
        usdcBanked = usdc.balanceOf(address(this));
    }

    function poolKey() external view returns (PoolKey memory) {
        return _poolKey();
    }

    // ─── ERC-721 receiver (custody of the POL position NFT) ────────────────────

    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _u128(uint256 x) internal pure returns (uint128) {
        return x > type(uint128).max ? type(uint128).max : uint128(x);
    }
}
