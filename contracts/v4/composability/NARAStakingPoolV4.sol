// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface INARAEngineV4Pool {
    function currentEpoch() external view returns (uint64);
    function lockFeeWei() external view returns (uint96);
    function lockFeeBps() external view returns (uint16);
    function unlockFeeWei() external view returns (uint96);
    struct Position {
        address owner; uint64 createdEpoch; uint128 flags;
        uint128 amount; uint128 weight;
        uint64 activationEpoch; uint64 unlockEpoch;
        uint128 _reserved0; uint256 naraDebtRay; uint256 ethDebtRay;
    }
    function positionOf(uint256 positionId) external view returns (Position memory);
}

interface INARAPositionNFTV4Pool {
    function mintAndLock(uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external payable returns (uint256 tokenId, uint256 positionId);
    function claimRewards(uint256 tokenId, address to)
        external returns (uint256 naraAmount, uint256 ethAmount);
    function claimTokenRewards(uint256 tokenId, address token, address to)
        external returns (uint256 amount);
    function unlockTo(uint256 tokenId, address to) external payable;
    function positionIdOf(uint256 tokenId) external view returns (uint256);
}

/// @title NARAStakingPoolV4
/// @notice ERC-20 liquid wrapper (stNARA) over a pool of NARAPositionNFTV4 locked positions.
///         Depositors receive stNARA shares pro-rata. NARA rewards auto-compound into
///         share price. USDC rewards distribute via a RAY-scaled per-share index.
///         Redemptions queue until a position matures and the NARA becomes liquid.
/// @dev
/// Key invariants:
///   I1. totalNaraValue() = max(0, lockedPrincipal + liquidNara - reservedForRedemptions)
///   I2. USDC debt reset happens AFTER super._update() so receivers cannot claim phantom yield
///   I3. undistributedUsdc buffers USDC when supply == 0 and releases it on next harvest
contract NARAStakingPoolV4 is ERC20, ReentrancyGuardTransient, AccessControl, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 public constant WAD                 = 1e18;
    uint256 public constant RAY                 = 1e27;
    uint256 public constant BPS                 = 10_000;
    uint16  public constant MAX_KEEPER_BOUNTY_BPS = 50;
    uint256 public constant MIN_INITIAL_DEPOSIT = 100e18;
    uint256 public constant DEAD_SHARES         = 1e18;
    uint64  public constant TARGET_LOCK_EPOCHS  = 35_040;
    uint256 public constant MAX_POSITIONS       = 50;
    uint256 public constant MAX_AUTO_HARVEST_POSITIONS = 8;

    bytes32 public constant CONFIG_ROLE    = keccak256("CONFIG_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant LOCKER_ROLE    = keccak256("LOCKER_ROLE");

    IERC20                 public immutable NARA;
    IERC20                 public immutable USDC;
    INARAEngineV4Pool      public immutable ENGINE;
    INARAPositionNFTV4Pool public immutable POSITION_NFT;

    uint256[] public underlyingTokenIds;
    mapping(uint256 => uint256) public tokenIndex;

    uint256 public lockedPrincipal;
    uint256 public liquidNara;
    uint256 public reservedForRedemptions;

    uint256 public usdcRewardIndexRay;
    mapping(address => uint256) internal _usdcDebtRay;
    mapping(address => uint256) internal _usdcAccrued;
    uint256 public undistributedUsdc;
    uint256 public totalUsdcDistributed;
    uint256 public totalUsdcClaimed;
    uint256 public ethRewardIndexRay;
    mapping(address => uint256) internal _ethDebtRay;
    mapping(address => uint256) internal _ethAccrued;
    uint256 public undistributedEth;
    uint256 public totalEthDistributed;
    uint256 public totalEthClaimed;

    struct Redemption {
        address user;
        uint128 shares;
        uint128 naraOwed;
        uint64  readyEpoch;
        bool    claimed;
    }
    Redemption[] public redemptions;
    mapping(address => uint256[]) internal _userRedemptions;

    uint16 public keeperBountyBps = 25;
    bool   public depositsPaused;
    bool   public emergencyShutdown;
    bool private _receivingPositionNft;

    event Deposited(address indexed user, uint256 naraIn, uint256 sharesOut);
    event RedemptionQueued(address indexed user, uint256 indexed id, uint256 shares, uint256 naraOwed, uint64 readyEpoch);
    event RedemptionClaimed(address indexed user, uint256 indexed id, uint256 naraOut);
    event Harvested(address indexed keeper, uint256 naraCompounded, uint256 usdcDistributed, uint256 keeperBounty);
    event PositionOpened(uint256 indexed tokenId, uint256 netAmount);
    event PositionClosed(uint256 indexed tokenId, uint256 naraReturned);
    event UsdcIndexAdvanced(uint256 newIndexRay, uint256 distributed);
    event EthIndexAdvanced(uint256 newIndexRay, uint256 distributed);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error NotAContract();
    error DepositsPausedErr();
    error EmergencyActive();
    error TransfersDisabledDuringEmergency();
    error NotEmergency();
    error BelowMinInitialDeposit(uint256 got, uint256 min);
    error SlippageExceeded(uint256 got, uint256 min);
    error InsufficientShares();
    error RedemptionNotReady(uint64 readyEpoch, uint64 current);
    error RedemptionAlreadyClaimed();
    error NotRedemptionOwner();
    error NoUnlockableNara();
    error InvalidBps();
    error InvalidNftReceived();
    error TooManyPositions();
    error InsufficientEthFee(uint256 required, uint256 provided);
    error EthRefundFailed();
    error NotMatured(uint64 unlockEpoch, uint64 current);
    error EmergencyWithdrawDisabled();

    constructor(
        address nara_, address usdc_, address engine_,
        address positionNft_, address admin_
    ) ERC20("Liquid Staked NARA", "stNARA") {
        if (nara_ == address(0) || usdc_ == address(0) || engine_ == address(0) ||
            positionNft_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        if (nara_.code.length == 0 || usdc_.code.length == 0 ||
            engine_.code.length == 0 || positionNft_.code.length == 0) revert NotAContract();
        NARA         = IERC20(nara_);
        USDC         = IERC20(usdc_);
        ENGINE       = INARAEngineV4Pool(engine_);
        POSITION_NFT = INARAPositionNFTV4Pool(positionNft_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(CONFIG_ROLE, admin_);
        _grantRole(EMERGENCY_ROLE, admin_);
        _grantRole(LOCKER_ROLE, admin_);
    }

    // ── Views ──────────────────────────────────────────────────

    function totalNaraValue() public view returns (uint256) {
        uint256 res = reservedForRedemptions;
        uint256 gross = lockedPrincipal + liquidNara;
        return gross > res ? gross - res : 0;
    }

    function exchangeRateWad() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return WAD;
        return (totalNaraValue() * WAD) / supply;
    }

    function previewDeposit(uint256 naraAmount) external view returns (uint256) {
        return _previewDepositShares(naraAmount);
    }

    function claimableUsdc(address user) external view returns (uint256) {
        return _usdcAccrued[user] + _pendingUsdc(user);
    }

    function claimableEth(address user) external view returns (uint256) {
        return _ethAccrued[user] + _pendingEth(user);
    }

    function userRedemptions(address user) external view returns (uint256[] memory) {
        return _userRedemptions[user];
    }

    function underlyingTokenCount() external view returns (uint256) {
        return underlyingTokenIds.length;
    }

    // ── Deposit ────────────────────────────────────────────────

    function deposit(uint256 naraAmount, uint256 minShares)
        external nonReentrant returns (uint256 shares)
    {
        if (depositsPaused)    revert DepositsPausedErr();
        if (emergencyShutdown) revert EmergencyActive();
        if (naraAmount == 0)   revert ZeroAmount();

        _autoHarvestForUserPath();

        bool first = totalSupply() == 0;
        if (first && naraAmount < MIN_INITIAL_DEPOSIT)
            revert BelowMinInitialDeposit(naraAmount, MIN_INITIAL_DEPOSIT);

        shares = _calcShares(naraAmount);
        uint256 userShares = first ? shares - DEAD_SHARES : shares;
        if (userShares < minShares) revert SlippageExceeded(userShares, minShares);

        NARA.safeTransferFrom(msg.sender, address(this), naraAmount);
        liquidNara += naraAmount;

        if (first) {
            _mint(address(0xdead), DEAD_SHARES);
            shares = userShares;
        }

        _mint(msg.sender, shares);
        emit Deposited(msg.sender, naraAmount, shares);
    }

    // ── Redemption queue ───────────────────────────────────────

    function queueRedeem(uint256 shares) external nonReentrant returns (uint256 id) {
        return _queueRedeem(shares, type(uint64).max);
    }

    function queueRedeemWithMaxReadyEpoch(uint256 shares, uint64 maxReadyEpoch)
        external
        nonReentrant
        returns (uint256 id)
    {
        return _queueRedeem(shares, maxReadyEpoch);
    }

    function _queueRedeem(uint256 shares, uint64 maxReadyEpoch) internal returns (uint256 id) {
        if (shares == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < shares) revert InsufficientShares();

        _autoHarvestForUserPath();

        uint256 naraOwed = (shares * totalNaraValue()) / totalSupply();
        if (naraOwed == 0) revert ZeroAmount();

        uint256 reservedAfter = reservedForRedemptions + naraOwed;
        uint64 ready = _readyEpochForReserved(reservedAfter);
        if (ready > maxReadyEpoch) revert RedemptionNotReady(maxReadyEpoch, ready);

        _burn(msg.sender, shares);
        reservedForRedemptions = reservedAfter;
        id = redemptions.length;
        redemptions.push(Redemption({
            user:       msg.sender,
            shares:     uint128(shares),
            naraOwed:   uint128(naraOwed),
            readyEpoch: ready,
            claimed:    false
        }));
        _userRedemptions[msg.sender].push(id);
        emit RedemptionQueued(msg.sender, id, shares, naraOwed, ready);
    }

    function claimRedemption(uint256 id) external nonReentrant {
        Redemption storage r = redemptions[id];
        if (r.user != msg.sender)    revert NotRedemptionOwner();
        if (r.claimed)               revert RedemptionAlreadyClaimed();
        uint64 ep = ENGINE.currentEpoch();
        if (ep < r.readyEpoch)       revert RedemptionNotReady(r.readyEpoch, ep);
        if (liquidNara < r.naraOwed) revert NoUnlockableNara();

        r.claimed              = true;
        liquidNara             -= r.naraOwed;
        reservedForRedemptions -= r.naraOwed;

        NARA.safeTransfer(r.user, r.naraOwed);
        emit RedemptionClaimed(r.user, id, r.naraOwed);
    }

    // ── Position management ────────────────────────────────────

    /// @notice Lock idle NARA into a new max-duration position.
    function lockLiquid(uint256 grossAmount, uint256 minWeight)
        external payable nonReentrant onlyRole(LOCKER_ROLE) returns (uint256 tokenId)
    {
        if (grossAmount == 0) revert ZeroAmount();
        if (underlyingTokenIds.length >= MAX_POSITIONS) revert TooManyPositions();

        uint96 fee = ENGINE.lockFeeWei();
        if (msg.value < fee) revert InsufficientEthFee(fee, msg.value);

        uint256 netAmount = grossAmount - (grossAmount * ENGINE.lockFeeBps() / BPS);
        if (netAmount == 0) revert ZeroAmount();

        uint256 available = liquidNara >= reservedForRedemptions
            ? liquidNara - reservedForRedemptions : 0;
        if (grossAmount > available) revert ZeroAmount();

        liquidNara      -= grossAmount;
        lockedPrincipal += netAmount;

        NARA.forceApprove(address(POSITION_NFT), grossAmount);
        _receivingPositionNft = true;
        (tokenId, ) = POSITION_NFT.mintAndLock{value: fee}(grossAmount, TARGET_LOCK_EPOCHS, minWeight);
        _receivingPositionNft = false;
        NARA.forceApprove(address(POSITION_NFT), 0);

        underlyingTokenIds.push(tokenId);
        tokenIndex[tokenId] = underlyingTokenIds.length;

        if (msg.value > fee) _refundEth(msg.sender, msg.value - fee);
        emit PositionOpened(tokenId, netAmount);
    }

    /// @notice Unlock a matured position, releasing NARA to liquid.
    function unlockMatured(uint256 tokenId) external payable nonReentrant {
        uint256 idx = tokenIndex[tokenId];
        if (idx == 0) revert ZeroAmount();

        uint96 fee = ENGINE.unlockFeeWei();
        if (msg.value < fee) revert InsufficientEthFee(fee, msg.value);

        INARAEngineV4Pool.Position memory position = ENGINE.positionOf(POSITION_NFT.positionIdOf(tokenId));
        uint64 unlockEpoch = position.unlockEpoch;
        uint256 principal = uint256(position.amount);
        uint64 current     = ENGINE.currentEpoch();
        if (current < unlockEpoch) revert NotMatured(unlockEpoch, current);

        uint256 naraBefore = NARA.balanceOf(address(this));
        uint256 usdcBefore = USDC.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;
        _claimPositionRewards(tokenId);
        _accountHarvestGains(naraBefore, usdcBefore, ethBefore, msg.sender);

        uint256 beforeUnlock = NARA.balanceOf(address(this));
        uint256 ethBeforeUnlock = address(this).balance;
        POSITION_NFT.unlockTo{value: fee}(tokenId, address(this));
        uint256 returned = NARA.balanceOf(address(this)) - beforeUnlock;
        _accountEthGains(ethBeforeUnlock - fee);

        lockedPrincipal  = principal <= lockedPrincipal ? lockedPrincipal - principal : 0;
        liquidNara      += returned;

        uint256 last = underlyingTokenIds.length;
        if (idx != last) {
            uint256 lastToken = underlyingTokenIds[last - 1];
            underlyingTokenIds[idx - 1] = lastToken;
            tokenIndex[lastToken] = idx;
        }
        underlyingTokenIds.pop();
        delete tokenIndex[tokenId];

        if (msg.value > fee) _refundEth(msg.sender, msg.value - fee);
        emit PositionClosed(tokenId, returned);
    }

    // ── Harvest ────────────────────────────────────────────────

    /// @notice Claim NARA and USDC rewards from all positions. Permissionless.
    function harvest() external nonReentrant {
        _harvestRange(0, underlyingTokenIds.length, msg.sender);
    }

    /// @notice Paginated harvest for large position counts.
    function batchHarvest(uint256 start, uint256 end) external nonReentrant {
        _harvestRange(start, end, msg.sender);
    }

    function _autoHarvestForUserPath() internal {
        // M-08 fix: during emergencyShutdown the keeper harvest loop is frozen (_harvestRange
        // reverts EmergencyActive). Skip the opportunistic auto-harvest here instead of letting
        // it revert, so the exit path (queueRedeem -> unlockMatured -> claimRedemption) keeps
        // working and holders are never trapped. Redemptions price off already-tracked value;
        // un-harvested rewards simply remain for the remaining holders.
        if (emergencyShutdown) return;
        uint256 len = underlyingTokenIds.length;
        if (len == 0) return;
        // Every supply-changing path must checkpoint the complete position set. Harvesting only
        // a prefix lets an entrant mint against a value that omits rewards already earned by a
        // later position, then participate when that position is harvested. MAX_POSITIONS keeps
        // this loop bounded.
        _harvestRange(0, len, address(0));
    }

    function _harvestRange(uint256 start, uint256 end, address bountyRecipient) internal {
        if (emergencyShutdown) revert EmergencyActive();
        uint256 len = underlyingTokenIds.length;
        if (end > len) end = len;
        if (start >= end) return;

        uint256 naraBefore = NARA.balanceOf(address(this));
        uint256 usdcBefore = USDC.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;

        for (uint256 i = start; i < end; ++i) {
            _claimPositionRewards(underlyingTokenIds[i]);
        }

        (uint256 naraGained, uint256 usdcGained, uint256 bounty) =
            _accountHarvestGains(naraBefore, usdcBefore, ethBefore, bountyRecipient);

        emit Harvested(
            bountyRecipient,
            naraGained,
            usdcGained > bounty ? usdcGained - bounty : 0,
            bounty
        );
    }

    function _claimPositionRewards(uint256 tokenId) internal {
        try POSITION_NFT.claimRewards(tokenId, address(this)) returns (uint256, uint256) {} catch {}
        try POSITION_NFT.claimTokenRewards(tokenId, address(USDC), address(this)) returns (uint256) {} catch {}
    }

    function _accountHarvestGains(
        uint256 naraBefore,
        uint256 usdcBefore,
        uint256 ethBefore,
        address bountyRecipient
    ) internal returns (uint256 naraGained, uint256 usdcGained, uint256 bounty) {
        naraGained = NARA.balanceOf(address(this)) - naraBefore;
        usdcGained = USDC.balanceOf(address(this)) - usdcBefore;
        if (naraGained > 0) liquidNara += naraGained;

        if (usdcGained > 0) {
            bounty = bountyRecipient == address(0) ? 0 : (usdcGained * keeperBountyBps) / BPS;
            uint256 toDistribute = usdcGained - bounty;
            uint256 supply = totalSupply();
            if (supply == 0) {
                undistributedUsdc += toDistribute;
            } else {
                uint256 total = toDistribute + undistributedUsdc;
                undistributedUsdc = 0;
                if (total > 0) {
                    usdcRewardIndexRay   += (total * RAY) / supply;
                    totalUsdcDistributed += total;
                    emit UsdcIndexAdvanced(usdcRewardIndexRay, total);
                }
            }
            if (bounty > 0) USDC.safeTransfer(bountyRecipient, bounty);
        }

        _accountEthGains(ethBefore);
    }

    function _accountEthGains(uint256 ethBefore) internal returns (uint256 ethGained) {
        uint256 ethBalance = address(this).balance;
        ethGained = ethBalance > ethBefore ? ethBalance - ethBefore : 0;
        if (ethGained > 0) {
            uint256 supply = totalSupply();
            if (supply == 0) {
                undistributedEth += ethGained;
            } else {
                uint256 total = ethGained + undistributedEth;
                undistributedEth = 0;
                ethRewardIndexRay += (total * RAY) / supply;
                totalEthDistributed += total;
                emit EthIndexAdvanced(ethRewardIndexRay, total);
            }
        }
    }

    function claimUsdc(address to) external nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        _accrueRewards(msg.sender);
        amount = _usdcAccrued[msg.sender];
        if (amount == 0) return 0;
        _usdcAccrued[msg.sender] = 0;
        totalUsdcClaimed += amount;
        USDC.safeTransfer(to, amount);
    }

    function claimEth(address payable to) external nonReentrant returns (uint256 amount) {
        if (to == address(0) || to == address(this)) revert ZeroAddress();
        _accrueRewards(msg.sender);
        amount = _ethAccrued[msg.sender];
        if (amount == 0) return 0;
        _ethAccrued[msg.sender] = 0;
        totalEthClaimed += amount;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthRefundFailed();
    }

    // ── USDC index — debt reset AFTER balance change ───────────

    function _update(address from, address to, uint256 value) internal override {
        // Crystallize underlying rewards before peer-to-peer ownership moves.
        if (from != address(0) && to != address(0) && from != to) {
            if (emergencyShutdown) revert TransfersDisabledDuringEmergency();
            _harvestRange(0, underlyingTokenIds.length, address(0));
        }

        if (from != address(0)) {
            _accrueRewards(from);
        }
        if (to != address(0) && to != from) {
            _accrueRewards(to);
        }

        super._update(from, to, value);

        if (from != address(0)) _resetRewardDebt(from);
        if (to != address(0) && to != from) _resetRewardDebt(to);
    }

    function _accrueRewards(address user) internal {
        uint256 usdcPending = _pendingUsdc(user);
        uint256 ethPending = _pendingEth(user);
        if (usdcPending > 0) _usdcAccrued[user] += usdcPending;
        if (ethPending > 0) _ethAccrued[user] += ethPending;
        _resetRewardDebt(user);
    }

    function _resetRewardDebt(address user) internal {
        uint256 bal = balanceOf(user);
        _usdcDebtRay[user] = bal * usdcRewardIndexRay;
        _ethDebtRay[user] = bal * ethRewardIndexRay;
    }

    function _pendingUsdc(address user) internal view returns (uint256) {
        uint256 cur  = balanceOf(user) * usdcRewardIndexRay;
        uint256 debt = _usdcDebtRay[user];
        return cur > debt ? (cur - debt) / RAY : 0;
    }

    function _pendingEth(address user) internal view returns (uint256) {
        uint256 cur  = balanceOf(user) * ethRewardIndexRay;
        uint256 debt = _ethDebtRay[user];
        return cur > debt ? (cur - debt) / RAY : 0;
    }

    function _calcShares(uint256 naraAmount) internal view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 value  = totalNaraValue();
        if (supply == 0 || value == 0) return naraAmount;
        return (naraAmount * supply) / value;
    }

    function _previewDepositShares(uint256 naraAmount) internal view returns (uint256 shares) {
        shares = _calcShares(naraAmount);
        if (totalSupply() == 0 && shares > DEAD_SHARES) shares -= DEAD_SHARES;
    }

    function _earliestUnlockEpoch() internal view returns (uint64 earliest) {
        uint256 len = underlyingTokenIds.length;
        if (len == 0) return ENGINE.currentEpoch() + 1;
        earliest = type(uint64).max;
        for (uint256 i = 0; i < len; ++i) {
            uint64 ue = ENGINE.positionOf(
                POSITION_NFT.positionIdOf(underlyingTokenIds[i])
            ).unlockEpoch;
            if (ue < earliest) earliest = ue;
        }
    }

    function _readyEpochForReserved(uint256 targetReserved) internal view returns (uint64 readyEpoch) {
        uint64 current = ENGINE.currentEpoch();
        if (liquidNara >= targetReserved) return current;

        uint256 available = liquidNara;
        uint256 len = underlyingTokenIds.length;
        if (len == 0) return current + 1;

        uint64[] memory epochs = new uint64[](len);
        uint256[] memory amounts = new uint256[](len);
        for (uint256 i; i < len; ++i) {
            INARAEngineV4Pool.Position memory position = ENGINE.positionOf(
                POSITION_NFT.positionIdOf(underlyingTokenIds[i])
            );
            uint64 epoch = position.unlockEpoch;
            uint256 amount = uint256(position.amount);
            uint256 j = i;
            while (j != 0 && epochs[j - 1] > epoch) {
                epochs[j] = epochs[j - 1];
                amounts[j] = amounts[j - 1];
                unchecked { --j; }
            }
            epochs[j] = epoch;
            amounts[j] = amount;
        }

        for (uint256 i; i < len; ++i) {
            available += amounts[i];
            if (available >= targetReserved) {
                return epochs[i] < current ? current : epochs[i];
            }
        }

        return current + 1;
    }

    function _refundEth(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthRefundFailed();
    }

    // ── Admin ──────────────────────────────────────────────────

    function setKeeperBounty(uint16 bps) external onlyRole(CONFIG_ROLE) {
        if (bps > MAX_KEEPER_BOUNTY_BPS) revert InvalidBps();
        keeperBountyBps = bps;
    }

    function setDepositsPaused(bool paused) external onlyRole(EMERGENCY_ROLE) {
        depositsPaused = paused;
    }

    function setEmergencyShutdown(bool shutdown) external onlyRole(EMERGENCY_ROLE) {
        emergencyShutdown = shutdown;
    }

    function emergencyWithdrawNara(address, uint256) external nonReentrant onlyRole(EMERGENCY_ROLE) {
        if (!emergencyShutdown) revert NotEmergency();
        revert EmergencyWithdrawDisabled();
    }

    function emergencyWithdrawUsdc(address, uint256) external nonReentrant onlyRole(EMERGENCY_ROLE) {
        if (!emergencyShutdown) revert NotEmergency();
        revert EmergencyWithdrawDisabled();
    }

    function emergencyWithdrawEth(address payable, uint256) external nonReentrant onlyRole(EMERGENCY_ROLE) {
        if (!emergencyShutdown) revert NotEmergency();
        revert EmergencyWithdrawDisabled();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(POSITION_NFT)) revert InvalidNftReceived();
        if (!_receivingPositionNft) revert InvalidNftReceived();
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}
