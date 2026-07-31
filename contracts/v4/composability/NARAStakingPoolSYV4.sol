// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface INARAStakingPoolV4 {
    function deposit(uint256 naraAmount, uint256 minShares) external returns (uint256 shares);
    function exchangeRateWad() external view returns (uint256);
    function previewDeposit(uint256 naraAmount) external view returns (uint256 shares);
    function claimUsdc(address to) external returns (uint256);
    function claimEth(address payable to) external returns (uint256);
}

/// @title NARAStakingPoolSYV4
/// @notice Pendle Standardized Yield (SY) adapter for stNARA.
///         Wraps NARAStakingPoolV4 shares 1:1 as SY tokens.
///         Pendle creates PT and YT markets on top of this SY contract.
/// @dev
/// Supported deposit tokens: NARA (routed through pool) and stNARA (direct 1:1 wrap).
/// Supported redeem token: stNARA only. NARA redemption requires the pool's redemption
/// queue and is not exposed here.
/// USDC and ETH rewards are tracked per SY holder via RAY-scaled indexes. Any caller can only
/// claim their own pro-rata entitlement — aggregate drain is not possible.
contract NARAStakingPoolSYV4 is ERC20, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    uint256 public constant RAY             = 1e27;
    uint256 public constant RAY_TO_WAD      = 1e9;
    uint256 public constant PENDLE_INITIAL_REWARD_INDEX = 1;
    uint8   public constant ASSET_TYPE_TOKEN = 0;

    IERC20               public immutable NARA;
    IERC20               public immutable USDC;
    IERC20               public immutable STNARA;
    INARAStakingPoolV4   public immutable POOL;

    uint256 public usdcIndexRay;
    mapping(address => uint256) internal _usdcDebtRay;
    mapping(address => uint256) internal _usdcAccrued;
    uint256 public totalUsdcDistributed;
    uint256 public totalUsdcClaimed;
    uint256 public ethIndexRay;
    mapping(address => uint256) internal _ethDebtRay;
    mapping(address => uint256) internal _ethAccrued;
    uint256 public totalEthDistributed;
    uint256 public totalEthClaimed;

    event Deposited(address indexed caller, address indexed receiver, address indexed tokenIn, uint256 amountIn, uint256 sharesOut);
    event Redeemed(address indexed caller, address indexed receiver, uint256 sharesIn, uint256 amountOut);
    event RewardsClaimed(address indexed user, uint256 usdcAmount);
    event EthRewardsClaimed(address indexed user, address indexed to, uint256 ethAmount);
    event ClaimRewards(address indexed user, address[] rewardTokens, uint256[] rewardAmounts);
    event UsdcIndexAdvanced(uint256 newIndexRay, uint256 distributed);
    event EthIndexAdvanced(uint256 newIndexRay, uint256 distributed);

    error ZeroAddress();
    error ZeroAmount();
    error NotAContract();
    error UnsupportedToken();
    error SlippageExceeded();
    error InternalBalanceRedeemDisabled();
    error EthTransferFailed();

    constructor(address nara_, address usdc_, address stNara_, address pool_)
        ERC20("SY NARA Staking Pool", "SY-stNARA")
    {
        if (nara_ == address(0) || usdc_ == address(0) ||
            stNara_ == address(0) || pool_ == address(0)) revert ZeroAddress();
        if (pool_.code.length == 0) revert NotAContract();
        NARA   = IERC20(nara_);
        USDC   = IERC20(usdc_);
        STNARA = IERC20(stNara_);
        POOL   = INARAStakingPoolV4(pool_);
    }

    // ── Pendle SY interface ────────────────────────────────────

    function assetInfo()
        external view
        returns (uint8 assetType, address assetAddress, uint8 assetDecimals)
    {
        return (ASSET_TYPE_TOKEN, address(NARA), 18);
    }

    function yieldToken() external view returns (address) {
        return address(STNARA);
    }

    /// @notice Wrap NARA or stNARA into SY tokens. Called by Pendle on deposit.
    function deposit(
        address receiver,
        address tokenIn,
        uint256 amountIn,
        uint256 minSharesOut
    ) external nonReentrant returns (uint256 sharesOut) {
        if (receiver == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        _pullAndDistributeRewards();

        if (tokenIn == address(STNARA)) {
            STNARA.safeTransferFrom(msg.sender, address(this), amountIn);
            sharesOut = amountIn;
        } else if (tokenIn == address(NARA)) {
            NARA.safeTransferFrom(msg.sender, address(this), amountIn);
            NARA.forceApprove(address(POOL), amountIn);
            sharesOut = POOL.deposit(amountIn, 0);
            NARA.forceApprove(address(POOL), 0);
        } else {
            revert UnsupportedToken();
        }

        // Moving stNARA can harvest pool rewards and accrue them to this contract at its
        // pre-transfer stNARA balance. Pull those rewards against the unchanged pre-mint SY
        // supply so the entrant cannot participate in rewards earned before this deposit.
        _pullAndDistributeRewards();

        if (sharesOut < minSharesOut) revert SlippageExceeded();
        _mint(receiver, sharesOut);
        emit Deposited(msg.sender, receiver, tokenIn, amountIn, sharesOut);
    }

    /// @notice Unwrap SY tokens back to stNARA. Called by Pendle on redeem.
    function redeem(
        address receiver,
        uint256 amountIn,
        address tokenOut,
        uint256 minTokenOut,
        bool burnFromInternalBalance
    ) external nonReentrant returns (uint256 amountOut) {
        if (receiver == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();
        if (tokenOut != address(STNARA)) revert UnsupportedToken();
        if (burnFromInternalBalance) revert InternalBalanceRedeemDisabled();

        _pullAndDistributeRewards();

        amountOut = amountIn;
        if (amountOut < minTokenOut) revert SlippageExceeded();
        STNARA.safeTransfer(receiver, amountOut);
        // The outbound stNARA transfer can crystallize rewards at this contract's pre-transfer
        // balance. Pull and index them before reducing SY supply so the redeemer retains its
        // pro-rata entitlement.
        _pullAndDistributeRewards();
        _burn(msg.sender, amountIn);
        emit Redeemed(msg.sender, receiver, amountIn, amountOut);
    }

    /// @notice WAD-scaled stNARA-per-NARA exchange rate. Used by Pendle to price PT/YT.
    function exchangeRate() external view returns (uint256) {
        return POOL.exchangeRateWad();
    }

    function getRewardTokens() external view returns (address[] memory tokens) {
        return _rewardTokens();
    }

    /// @notice Claim USDC rewards for `user`. Pulls from pool, distributes via index,
    ///         pays only the caller's pro-rata share. Pendle calls this per-user.
    function claimRewards(address user)
        external nonReentrant
        returns (uint256[] memory rewardAmounts)
    {
        rewardAmounts = new uint256[](1);

        _pullAndDistributeRewards();
        _accrueUser(user);

        uint256 owed = _usdcAccrued[user];
        if (owed > 0) {
            _usdcAccrued[user] = 0;
            totalUsdcClaimed  += owed;
            USDC.safeTransfer(user, owed);
            rewardAmounts[0] = owed;
            emit RewardsClaimed(user, owed);
        }
        emit ClaimRewards(user, _rewardTokens(), rewardAmounts);
    }

    /// @notice Native ETH rewards are intentionally outside Pendle claimRewards().
    ///         Direct SY holders can claim ETH without forcing native transfers
    ///         into receiver contracts that expect ERC-20 reward pulls only.
    function claimNativeEth(address payable to) external nonReentrant returns (uint256 amount) {
        if (to == address(0) || to == address(this)) revert ZeroAddress();
        _pullAndDistributeRewards();
        _accrueUser(msg.sender);

        amount = _ethAccrued[msg.sender];
        if (amount == 0) return 0;

        _ethAccrued[msg.sender] = 0;
        totalEthClaimed += amount;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
        emit EthRewardsClaimed(msg.sender, to, amount);
    }

    function accruedRewards(address user) external view returns (uint256[] memory rewardAmounts) {
        rewardAmounts = new uint256[](1);
        rewardAmounts[0] = _usdcAccrued[user] + _pendingUsdc(user);
    }

    function rewardIndexesCurrent() external nonReentrant returns (uint256[] memory indexes) {
        // Pulls rewards before reporting the Pendle index; nonReentrant protects the external pool call.
        _pullAndDistributeRewards();
        indexes = new uint256[](1);
        indexes[0] = _pendleUsdcIndex();
    }

    function rewardIndexesStored() external view returns (uint256[] memory indexes) {
        indexes = new uint256[](1);
        indexes[0] = _pendleUsdcIndex();
    }

    function _pullAndDistributeRewards() internal {
        uint256 supply = totalSupply();
        if (supply == 0) return;

        uint256 pulled = POOL.claimUsdc(address(this));
        if (pulled > 0) {
            usdcIndexRay         += (pulled * RAY) / supply;
            totalUsdcDistributed += pulled;
            emit UsdcIndexAdvanced(usdcIndexRay, pulled);
        }
        uint256 ethPulled = POOL.claimEth(payable(address(this)));
        if (ethPulled > 0) {
            ethIndexRay         += (ethPulled * RAY) / supply;
            totalEthDistributed += ethPulled;
            emit EthIndexAdvanced(ethIndexRay, ethPulled);
        }
    }

    function getTokensIn() external view returns (address[] memory t) {
        t = new address[](2);
        t[0] = address(NARA);
        t[1] = address(STNARA);
    }

    function getTokensOut() external view returns (address[] memory t) {
        t = new address[](1);
        t[0] = address(STNARA);
    }

    function isValidTokenIn(address token) external view returns (bool) {
        return token == address(NARA) || token == address(STNARA);
    }

    function isValidTokenOut(address token) external view returns (bool) {
        return token == address(STNARA);
    }

    function previewDeposit(address tokenIn, uint256 amountIn) external view returns (uint256) {
        if (tokenIn == address(STNARA)) return amountIn;
        if (tokenIn == address(NARA)) {
            return POOL.previewDeposit(amountIn);
        }
        revert UnsupportedToken();
    }

    function previewRedeem(address tokenOut, uint256 amountIn) external view returns (uint256) {
        if (tokenOut != address(STNARA)) revert UnsupportedToken();
        return amountIn;
    }

    function claimableUsdc(address user) external view returns (uint256) {
        return _usdcAccrued[user] + _pendingUsdc(user);
    }

    function claimableEth(address user) external view returns (uint256) {
        return _ethAccrued[user] + _pendingEth(user);
    }

    // ── Reward indexes — debt reset AFTER balance change ───────────

    function _update(address from, address to, uint256 value) internal override {
        // Fix reward entitlement at pre-transfer balances.
        if (from != address(0) && to != address(0) && from != to) {
            _pullAndDistributeRewards();
        }

        if (from != address(0)) {
            uint256 p = _pendingUsdc(from);
            if (p > 0) _usdcAccrued[from] += p;
            uint256 e = _pendingEth(from);
            if (e > 0) _ethAccrued[from] += e;
        }
        if (to != address(0) && to != from) {
            uint256 p = _pendingUsdc(to);
            if (p > 0) _usdcAccrued[to] += p;
            uint256 e = _pendingEth(to);
            if (e > 0) _ethAccrued[to] += e;
        }

        super._update(from, to, value);

        if (from != address(0)) _usdcDebtRay[from] = balanceOf(from) * usdcIndexRay;
        if (from != address(0)) _ethDebtRay[from] = balanceOf(from) * ethIndexRay;
        if (to != address(0) && to != from) _usdcDebtRay[to] = balanceOf(to) * usdcIndexRay;
        if (to != address(0) && to != from) _ethDebtRay[to] = balanceOf(to) * ethIndexRay;
    }

    function _accrueUser(address user) internal {
        uint256 p = _pendingUsdc(user);
        if (p > 0) _usdcAccrued[user] += p;
        uint256 e = _pendingEth(user);
        if (e > 0) _ethAccrued[user] += e;
        _usdcDebtRay[user] = balanceOf(user) * usdcIndexRay;
        _ethDebtRay[user] = balanceOf(user) * ethIndexRay;
    }

    function _pendingUsdc(address user) internal view returns (uint256) {
        uint256 cur  = balanceOf(user) * usdcIndexRay;
        uint256 debt = _usdcDebtRay[user];
        return cur > debt ? (cur - debt) / RAY : 0;
    }

    function _pendingEth(address user) internal view returns (uint256) {
        uint256 cur  = balanceOf(user) * ethIndexRay;
        uint256 debt = _ethDebtRay[user];
        return cur > debt ? (cur - debt) / RAY : 0;
    }

    function _pendleUsdcIndex() internal view returns (uint256) {
        return PENDLE_INITIAL_REWARD_INDEX + (usdcIndexRay / RAY_TO_WAD);
    }

    function _rewardTokens() internal view returns (address[] memory tokens) {
        tokens = new address[](1);
        tokens[0] = address(USDC);
    }

    receive() external payable {}
}
