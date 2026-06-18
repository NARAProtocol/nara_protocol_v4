// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface INARAEngineV4Frac {
    function currentEpoch() external view returns (uint64);
    function unlockFeeWei() external view returns (uint96);
    struct Position {
        address owner; uint64 createdEpoch; uint128 flags;
        uint128 amount; uint128 weight;
        uint64 activationEpoch; uint64 unlockEpoch;
        uint128 _reserved0; uint256 naraDebtRay; uint256 ethDebtRay;
    }
    function positionOf(uint256 positionId) external view returns (Position memory);
}

interface INARAPositionNFTV4Frac {
    function claimRewards(uint256 tokenId, address to) external returns (uint256 naraAmount, uint256 ethAmount);
    function claimTokenRewards(uint256 tokenId, address token, address to) external returns (uint256 amount);
    function unlockTo(uint256 tokenId, address to) external payable;
    function positionIdOf(uint256 tokenId) external view returns (uint256);
    function genesisMetadataOf(uint256 tokenId) external view returns (
        bool isGenesis,
        bool isEternal,
        uint16 roundId,
        uint16 tierId,
        uint32 rewardMultiplierBps,
        uint64 mintedAt,
        uint256 rewardWeight
    );
}

/// @title NARAFractionalPositionV4
/// @notice Fractionalize a single NARAPositionNFTV4 into ERC-20 fraction units.
///         Each fraction earns a pro-rata share of NARA emission, USDC, and ETH rewards.
///         On maturity, fractions are redeemed for pro-rata principal.
/// @dev
/// Lifecycle: deploy via factory → bind(tokenId, fractions) → harvest() periodically
///            → unlockPosition() after maturity → claimPrincipal() per holder.
///
/// Last claimer receives remainder principal to prevent dust accumulation.
/// fractionCount is bounded [1, 1e12] to maintain RAY index precision.
/// unlockPosition() auto-harvests final rewards before destroying the position.
contract NARAFractionalPositionV4 is ReentrancyGuardTransient, IERC721Receiver {
    using SafeERC20 for IERC20;

    uint256 public constant RAY           = 1e27;
    uint256 public constant MAX_FRACTIONS = 1e12;

    IERC20                 public immutable NARA;
    IERC20                 public immutable USDC;
    INARAEngineV4Frac      public immutable ENGINE;
    INARAPositionNFTV4Frac public immutable POSITION_NFT;

    address public immutable factory;
    bool    public expectedBindingSet;
    uint256 public expectedTokenId;
    address public expectedBinder;

    uint256 public boundTokenId;
    bool    public bound;
    uint256 public fractionCount;
    uint64  public unlockEpoch;

    string public name;
    string public symbol;
    uint8  public constant decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 public naraEmissionIndexRay;
    mapping(address => uint256) public naraDebtRay;
    mapping(address => uint256) public naraAccrued;

    uint256 public usdcIndexRay;
    mapping(address => uint256) public usdcDebtRay;
    mapping(address => uint256) public usdcAccrued;

    uint256 public ethIndexRay;
    mapping(address => uint256) public ethDebtRay;
    mapping(address => uint256) public ethAccrued;

    bool    public unlocked;
    uint256 public principalReturned;
    uint256 public principalPaid;
    uint256 public principalFractionsClaimed;
    mapping(address => bool) public principalClaimed;
    bool internal _accountingEth;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event Bound(uint256 indexed tokenId, uint256 fractionCount, address indexed owner);
    event RewardHarvested(uint256 naraEmission, uint256 usdc);
    event EthRewardHarvested(uint256 ethAmount);
    event PositionUnlocked(uint256 principalReturned);
    event PrincipalClaimed(address indexed user, uint256 naraAmount);
    event RewardClaimed(address indexed user, uint256 naraEmission, uint256 usdc);
    event EthRewardClaimed(address indexed user, uint256 ethAmount);
    event ExpectedBindingSet(uint256 indexed tokenId, address indexed binder);

    error AlreadyBound();
    error NotBound();
    error InvalidNftReceived();
    error InvalidFractionCount();
    error PositionNotMatured();
    error AlreadyUnlocked();
    error AlreadyClaimed();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance();
    error InsufficientAllowance();
    error IncorrectEthFee(uint256 required, uint256 provided);
    error EthRefundFailed();
    error NotFactory();
    error ExpectedBindingAlreadySet();
    error UnexpectedBinding();
    error UnsupportedEternalGenesis();

    constructor(address nara_, address usdc_, address engine_, address positionNft_) {
        if (nara_ == address(0) || usdc_ == address(0) ||
            engine_ == address(0) || positionNft_ == address(0)) revert ZeroAddress();
        NARA         = IERC20(nara_);
        USDC         = IERC20(usdc_);
        ENGINE       = INARAEngineV4Frac(engine_);
        POSITION_NFT = INARAPositionNFTV4Frac(positionNft_);
        factory      = msg.sender;
        name   = "NARA Fractional Position";
        symbol = "fracNARA";
    }

    // ── Bind ───────────────────────────────────────────────────

    function setExpectedBinding(uint256 tokenId, address binder) external {
        if (msg.sender != factory) revert NotFactory();
        if (bound) revert AlreadyBound();
        if (expectedBindingSet) revert ExpectedBindingAlreadySet();
        if (binder == address(0)) revert ZeroAddress();
        expectedBindingSet = true;
        expectedTokenId = tokenId;
        expectedBinder = binder;
        emit ExpectedBindingSet(tokenId, binder);
    }

    /// @notice Deposit a NARAPositionNFTV4 and mint `fractions` ERC-20 units.
    function bind(uint256 tokenId, uint256 fractions) external nonReentrant {
        if (bound) revert AlreadyBound();
        if (fractions == 0 || fractions > MAX_FRACTIONS) revert InvalidFractionCount();
        if (expectedBindingSet && (tokenId != expectedTokenId || msg.sender != expectedBinder)) {
            revert UnexpectedBinding();
        }
        (bool isGenesis, bool isEternal,,,,,) = POSITION_NFT.genesisMetadataOf(tokenId);
        if (isGenesis && isEternal) revert UnsupportedEternalGenesis();

        IERC721(address(POSITION_NFT)).transferFrom(msg.sender, address(this), tokenId);

        INARAEngineV4Frac.Position memory p = ENGINE.positionOf(
            POSITION_NFT.positionIdOf(tokenId)
        );

        boundTokenId  = tokenId;
        fractionCount = fractions;
        unlockEpoch   = p.unlockEpoch;
        bound         = true;

        string memory tid = _uintToStr(tokenId);
        name   = string.concat("NARA Fraction #", tid);
        symbol = string.concat("fracNARA-", tid);

        _mint(msg.sender, fractions);
        emit Bound(tokenId, fractions, msg.sender);
    }

    // ── ERC-20 fractions ───────────────────────────────────────

    function totalSupply() external view returns (uint256) { return fractionCount; }

    function transfer(address to, uint256 amount) external nonReentrant returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        if (to == msg.sender) {
            emit Transfer(msg.sender, to, amount);
            return true;
        }
        _accrueAll(msg.sender);
        _accrueAll(to);
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        _updateDebt(msg.sender);
        _updateDebt(to);
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external nonReentrant returns (bool) {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        if (allowance[from][msg.sender] < amount) revert InsufficientAllowance();
        allowance[from][msg.sender] -= amount;
        if (from == to) {
            emit Transfer(from, to, amount);
            return true;
        }
        _accrueAll(from);
        _accrueAll(to);
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        _updateDebt(from);
        _updateDebt(to);
        emit Transfer(from, to, amount);
        return true;
    }

    // ── Rewards ────────────────────────────────────────────────

    /// @notice Claim NARA emission and USDC from the underlying position. Permissionless.
    function harvest() external nonReentrant {
        if (!bound)   revert NotBound();
        if (unlocked) revert AlreadyUnlocked();
        _harvestInternal();
    }

    function claimRewards(address to) external nonReentrant returns (uint256 naraOut, uint256 usdcOut) {
        if (!bound) revert NotBound();
        if (to == address(0)) revert ZeroAddress();
        _accrueAll(msg.sender);
        naraOut = naraAccrued[msg.sender];
        usdcOut = usdcAccrued[msg.sender];
        if (naraOut > 0) { naraAccrued[msg.sender] = 0; NARA.safeTransfer(to, naraOut); }
        if (usdcOut > 0) { usdcAccrued[msg.sender] = 0; USDC.safeTransfer(to, usdcOut); }
        emit RewardClaimed(msg.sender, naraOut, usdcOut);
    }

    function claimEth(address payable to) external nonReentrant returns (uint256 ethOut) {
        if (!bound) revert NotBound();
        if (to == address(0)) revert ZeroAddress();
        _accrueAll(msg.sender);
        ethOut = ethAccrued[msg.sender];
        if (ethOut == 0) return 0;
        ethAccrued[msg.sender] = 0;
        (bool ok,) = to.call{value: ethOut}("");
        if (!ok) revert EthRefundFailed();
        emit EthRewardClaimed(msg.sender, ethOut);
    }

    function pendingRewards(address user) external view returns (uint256 naraEmission, uint256 usdcAmount) {
        naraEmission = naraAccrued[user] + _pendingNara(user);
        usdcAmount   = usdcAccrued[user] + _pendingUsdc(user);
    }

    function pendingEth(address user) external view returns (uint256 ethAmount) {
        return ethAccrued[user] + _pendingEth(user);
    }

    // ── Unlock ─────────────────────────────────────────────────

    /// @notice Unlock the underlying position after maturity. Permissionless.
    ///         Harvests final rewards automatically before destroying the position.
    function unlockPosition() external payable nonReentrant {
        if (!bound)   revert NotBound();
        if (unlocked) revert AlreadyUnlocked();
        if (ENGINE.currentEpoch() < unlockEpoch) revert PositionNotMatured();

        uint96 fee = ENGINE.unlockFeeWei();
        if (msg.value != fee) revert IncorrectEthFee(fee, msg.value);

        _harvestInternal();

        uint256 before = NARA.balanceOf(address(this));
        uint256 usdcBefore = USDC.balanceOf(address(this));
        uint256 ethBefore = address(this).balance - fee;
        _accountingEth = true;
        POSITION_NFT.unlockTo{value: fee}(boundTokenId, address(this));
        _accountingEth = false;
        principalReturned = NARA.balanceOf(address(this)) - before;
        _accountUsdcGains(usdcBefore);
        _accountEthGains(ethBefore);
        unlocked = true;
        emit PositionUnlocked(principalReturned);
    }

    /// @notice Redeem NARA principal pro-rata to fraction balance.
    /// @dev Each claimer takes its pro-rata share of the REMAINING principal against the REMAINING
    ///      (still-unclaimed) fractions, so the final actual claimer always sweeps the exact
    ///      rounding remainder. (M-07 fix: the previous `principalFractionsClaimed + bal >=
    ///      fractionCount` check was dead whenever any fraction never claimed — e.g. lost/burned
    ///      bearer fractions — stranding the remainder. The share of fractions that are never
    ///      claimed remains unrecoverable by design, as with any bearer instrument.)
    function claimPrincipal(address to) external nonReentrant returns (uint256 naraOut) {
        if (!unlocked) revert PositionNotMatured();
        if (principalClaimed[msg.sender]) revert AlreadyClaimed();
        if (to == address(0)) revert ZeroAddress();

        _accrueAll(msg.sender);
        uint256 bal = balanceOf[msg.sender];
        if (bal == 0) revert ZeroAmount();

        uint256 remainingFractions = fractionCount - principalFractionsClaimed;
        uint256 remainingPrincipal = principalReturned - principalPaid;
        // bal >= remainingFractions only when this holder owns every still-unclaimed fraction,
        // so it cleanly drains the exact remainder; otherwise strict pro-rata of what remains.
        naraOut = bal >= remainingFractions
            ? remainingPrincipal
            : (remainingPrincipal * bal) / remainingFractions;

        principalClaimed[msg.sender]  = true;
        principalFractionsClaimed    += bal;
        principalPaid                += naraOut;
        balanceOf[msg.sender]         = 0;
        _updateDebt(msg.sender);

        if (naraOut > 0) NARA.safeTransfer(to, naraOut);
        emit PrincipalClaimed(msg.sender, naraOut);
    }

    // ── Index accounting ───────────────────────────────────────

    function _harvestInternal() internal {
        uint256 naraBefore = NARA.balanceOf(address(this));
        uint256 usdcBefore = USDC.balanceOf(address(this));
        uint256 ethBefore = address(this).balance;

        _accountingEth = true;
        try POSITION_NFT.claimRewards(boundTokenId, address(this)) returns (uint256, uint256) {} catch {}
        try POSITION_NFT.claimTokenRewards(boundTokenId, address(USDC), address(this)) returns (uint256) {} catch {}
        _accountingEth = false;

        uint256 naraGained = NARA.balanceOf(address(this)) - naraBefore;
        uint256 usdcGained = USDC.balanceOf(address(this)) - usdcBefore;
        uint256 ethGained = address(this).balance - ethBefore;

        if (naraGained > 0) naraEmissionIndexRay += (naraGained * RAY) / fractionCount;
        if (usdcGained  > 0) usdcIndexRay        += (usdcGained  * RAY) / fractionCount;
        if (ethGained   > 0) {
            ethIndexRay += (ethGained * RAY) / fractionCount;
            emit EthRewardHarvested(ethGained);
        }

        emit RewardHarvested(naraGained, usdcGained);
    }

    function _accountEthGains(uint256 ethBefore) internal {
        uint256 ethBalance = address(this).balance;
        uint256 ethGained = ethBalance > ethBefore ? ethBalance - ethBefore : 0;
        if (ethGained > 0) {
            ethIndexRay += (ethGained * RAY) / fractionCount;
            emit EthRewardHarvested(ethGained);
        }
    }

    function _accountUsdcGains(uint256 usdcBefore) internal {
        uint256 usdcGained = USDC.balanceOf(address(this)) - usdcBefore;
        if (usdcGained > 0) {
            usdcIndexRay += (usdcGained * RAY) / fractionCount;
            emit RewardHarvested(0, usdcGained);
        }
    }

    function _accrueAll(address user) internal {
        uint256 pn = _pendingNara(user);
        uint256 pu = _pendingUsdc(user);
        uint256 pe = _pendingEth(user);
        if (pn > 0) naraAccrued[user] += pn;
        if (pu > 0) usdcAccrued[user] += pu;
        if (pe > 0) ethAccrued[user] += pe;
        _updateDebt(user);
    }

    function _updateDebt(address user) internal {
        uint256 bal = balanceOf[user];
        naraDebtRay[user] = bal * naraEmissionIndexRay;
        usdcDebtRay[user] = bal * usdcIndexRay;
        ethDebtRay[user] = bal * ethIndexRay;
    }

    function _pendingNara(address user) internal view returns (uint256) {
        uint256 cur = balanceOf[user] * naraEmissionIndexRay;
        return cur > naraDebtRay[user] ? (cur - naraDebtRay[user]) / RAY : 0;
    }

    function _pendingUsdc(address user) internal view returns (uint256) {
        uint256 cur = balanceOf[user] * usdcIndexRay;
        return cur > usdcDebtRay[user] ? (cur - usdcDebtRay[user]) / RAY : 0;
    }

    function _pendingEth(address user) internal view returns (uint256) {
        uint256 cur = balanceOf[user] * ethIndexRay;
        return cur > ethDebtRay[user] ? (cur - ethDebtRay[user]) / RAY : 0;
    }

    function _mint(address to, uint256 amount) internal {
        balanceOf[to] += amount;
        _updateDebt(to);
        emit Transfer(address(0), to, amount);
    }

    function _uintToStr(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory b = new bytes(d);
        while (v != 0) { d--; b[d] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(POSITION_NFT)) revert InvalidNftReceived();
        revert InvalidNftReceived();
    }

    receive() external payable {
        if (_accountingEth) return;
        if (!bound) revert NotBound();
        ethIndexRay += (msg.value * RAY) / fractionCount;
        emit EthRewardHarvested(msg.value);
    }
}
