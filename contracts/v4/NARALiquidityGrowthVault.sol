// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

interface ILiquidityCompounder {
    function compound(
        address token,
        address base,
        uint256 tokenAmount,
        uint256 baseAmount,
        bytes calldata data
    ) external returns (uint256 liquidityAdded);
}

interface INARAEngineRouting {
    function NARA() external view returns (address);
    function notifyTokenRewards(address token, uint256 amount) external;
    function syncEmissionReserve() external;
}

interface INARAGenesisRewardDistributorRouting {
    function rewardToken() external view returns (IERC20);
    function trackedGenesisRewardWeight() external view returns (uint256);
    function notifyTokenRewards(uint256 amount) external returns (uint256 tokenAllocated);
}

/// @title NARA Liquidity Growth Vault
/// @notice Receives Uniswap v4 pool-level fees and routes them either into protocol
///         liquidity or, after the switch is flipped, into the NARA engine.
/// @dev ERC20-only by design. On Base the base asset is native USDC.
contract NARALiquidityGrowthVault is Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_KEEPER_BOUNTY_BPS = 1_000;

    enum RouteMode {
        Liquidity,
        Engine,
        Split,
        Genesis,
        GenesisSplit
    }

    IERC20 public immutable token;
    IERC20 public immutable base;

    address public hook;
    address public compounder;
    bool public compounderFrozen;
    address public engine;
    address public genesisRewardDistributor;
    mapping(address => bool) public compoundKeeper;
    RouteMode public routeMode;
    uint16 public keeperBountyBps;
    uint16 public splitEngineShareBps;
    uint16 public splitGenesisShareBps;
    uint256 public minCompoundBase;

    uint256 public totalTokenFeeRecorded;
    uint256 public totalBaseFeeRecorded;
    uint256 public totalTokenCompounded;
    uint256 public totalBaseCompounded;
    uint256 public totalBaseBountyPaid;
    uint256 public totalTokenRoutedToEngine;
    uint256 public totalBaseRoutedToEngine;
    uint256 public totalBaseRoutedToGenesis;

    event HookSet(address indexed hook);
    event CompounderSet(address indexed compounder);
    event CompounderFrozen(address indexed compounder);
    event CompoundKeeperSet(address indexed keeper, bool allowed);
    event EngineSet(address indexed engine);
    event GenesisRewardDistributorSet(address indexed distributor);
    event RouteModeSet(RouteMode indexed mode);
    event KeeperBountySet(uint16 bountyBps, uint256 minCompoundBase);
    event SplitEngineShareSet(uint16 engineShareBps);
    event SplitGenesisShareSet(uint16 genesisShareBps);
    event PoolFeeRecorded(
        address indexed currency,
        address indexed sender,
        uint256 amount,
        uint16 feeBps,
        bool isBuy
    );
    event Compounded(
        address indexed caller,
        address indexed compounder,
        uint256 tokenAmount,
        uint256 baseAmount,
        uint256 baseBounty,
        uint256 liquidityAdded
    );
    event RoutedToEngine(address indexed caller, uint256 tokenAmount, uint256 baseAmount);
    event RoutedToGenesis(address indexed caller, uint256 baseAmount);
    event SplitProcessed(
        address indexed caller,
        uint256 tokenToEngine,
        uint256 baseToEngine,
        uint256 tokenToCompound,
        uint256 baseToCompound,
        uint256 liquidityAdded
    );
    event GenesisSplitProcessed(
        address indexed caller,
        uint256 baseToGenesis,
        uint256 tokenToCompound,
        uint256 baseToCompound,
        uint256 liquidityAdded
    );

    error ZeroAddress();
    error ZeroValue();
    error InvalidToken();
    error InvalidConfig();
    error UnauthorizedHook();
    error WrongRouteMode();
    error InsufficientBalance();
    error AlreadySet();
    error CompounderDidNotSpend();
    error DeadlineExpired();
    error SlippageExceeded();
    error NotAContract();
    error UnauthorizedKeeper();
    error CompounderFrozenErr();

    modifier onlyHook() {
        if (msg.sender != hook) revert UnauthorizedHook();
        _;
    }

    modifier onlyCompoundKeeper() {
        if (msg.sender != owner() && !compoundKeeper[msg.sender]) revert UnauthorizedKeeper();
        _;
    }

    constructor(address owner_, address token_, address base_) Ownable(owner_) {
        if (token_ == address(0) || base_ == address(0) || token_ == base_) revert InvalidToken();
        token = IERC20(token_);
        base = IERC20(base_);
        routeMode = RouteMode.Liquidity;
    }

    function setHook(address hook_) external onlyOwner {
        if (hook != address(0)) revert AlreadySet();
        if (hook_ == address(0)) revert ZeroAddress();
        if (hook_.code.length == 0) revert NotAContract();
        hook = hook_;
        emit HookSet(hook_);
    }

    function setCompounder(address compounder_) external onlyOwner {
        if (compounderFrozen) revert CompounderFrozenErr();
        if (compounder_ == address(0)) revert ZeroAddress();
        if (compounder_.code.length == 0) revert NotAContract();
        compounder = compounder_;
        emit CompounderSet(compounder_);
    }

    function freezeCompounder() external onlyOwner {
        if (compounder == address(0)) revert ZeroAddress();
        compounderFrozen = true;
        emit CompounderFrozen(compounder);
    }

    function setCompoundKeeper(address keeper, bool allowed) external onlyOwner {
        if (keeper == address(0)) revert ZeroAddress();
        compoundKeeper[keeper] = allowed;
        emit CompoundKeeperSet(keeper, allowed);
    }

    function setEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert ZeroAddress();
        if (engine_.code.length == 0) revert NotAContract();
        if (INARAEngineRouting(engine_).NARA() != address(token)) revert InvalidConfig();
        engine = engine_;
        emit EngineSet(engine_);
    }

    function setGenesisRewardDistributor(address distributor_) external onlyOwner {
        if (distributor_ == address(0)) revert ZeroAddress();
        if (distributor_.code.length == 0) revert NotAContract();
        if (address(INARAGenesisRewardDistributorRouting(distributor_).rewardToken()) != address(base)) {
            revert InvalidConfig();
        }
        genesisRewardDistributor = distributor_;
        emit GenesisRewardDistributorSet(distributor_);
    }

    function setRouteMode(RouteMode mode_) external onlyOwner {
        if (mode_ == RouteMode.Split && (splitEngineShareBps == 0 || splitEngineShareBps >= BPS)) {
            revert InvalidConfig();
        }
        if (mode_ == RouteMode.Genesis && genesisRewardDistributor == address(0)) {
            revert InvalidConfig();
        }
        if (
            mode_ == RouteMode.GenesisSplit &&
            (genesisRewardDistributor == address(0) || splitGenesisShareBps == 0 || splitGenesisShareBps >= BPS)
        ) {
            revert InvalidConfig();
        }
        routeMode = mode_;
        emit RouteModeSet(mode_);
    }

    function setKeeperBounty(uint16 bountyBps_, uint256 minCompoundBase_) external onlyOwner {
        if (bountyBps_ > MAX_KEEPER_BOUNTY_BPS) revert InvalidConfig();
        keeperBountyBps = bountyBps_;
        minCompoundBase = minCompoundBase_;
        emit KeeperBountySet(bountyBps_, minCompoundBase_);
    }

    function setSplitEngineShare(uint16 engineShareBps_) external onlyOwner {
        if (engineShareBps_ == 0 || engineShareBps_ >= BPS) revert InvalidConfig();
        splitEngineShareBps = engineShareBps_;
        emit SplitEngineShareSet(engineShareBps_);
    }

    function setSplitGenesisShare(uint16 genesisShareBps_) external onlyOwner {
        if (genesisShareBps_ == 0 || genesisShareBps_ >= BPS) revert InvalidConfig();
        splitGenesisShareBps = genesisShareBps_;
        emit SplitGenesisShareSet(genesisShareBps_);
    }

    function recordPoolFee(
        address currency,
        uint256 amount,
        uint16 feeBps,
        address sender,
        bool isBuy
    ) external onlyHook {
        if (amount == 0) revert ZeroValue();
        if (currency == address(token)) {
            totalTokenFeeRecorded += amount;
        } else if (currency == address(base)) {
            totalBaseFeeRecorded += amount;
        } else {
            revert InvalidToken();
        }

        emit PoolFeeRecorded(currency, sender, amount, feeBps, isBuy);
    }

    function compoundAll(
        uint256 minLiquidityAdded,
        uint64 deadline,
        bytes calldata data
    ) external onlyCompoundKeeper returns (uint256 liquidityAdded) {
        return _compound(token.balanceOf(address(this)), base.balanceOf(address(this)), minLiquidityAdded, deadline, data);
    }

    function compound(
        uint256 tokenAmount,
        uint256 baseAmount,
        uint256 minLiquidityAdded,
        uint64 deadline,
        bytes calldata data
    ) external onlyCompoundKeeper returns (uint256 liquidityAdded) {
        return _compound(tokenAmount, baseAmount, minLiquidityAdded, deadline, data);
    }

    function routeAllToEngine() external onlyCompoundKeeper returns (uint256 tokenAmount, uint256 baseAmount) {
        tokenAmount = token.balanceOf(address(this));
        baseAmount = base.balanceOf(address(this));
        _routeToEngine(tokenAmount, baseAmount);
    }

    function routeToEngine(uint256 tokenAmount, uint256 baseAmount) external onlyCompoundKeeper {
        _routeToEngine(tokenAmount, baseAmount);
    }

    function routeAllBaseToGenesis() external onlyCompoundKeeper returns (uint256 baseAmount) {
        baseAmount = base.balanceOf(address(this));
        _routeBaseToGenesis(baseAmount);
    }

    function routeBaseToGenesis(uint256 baseAmount) external onlyCompoundKeeper {
        _routeBaseToGenesis(baseAmount);
    }

    function processSplitAll(
        uint256 minLiquidityAdded,
        uint64 deadline,
        bytes calldata data
    )
        external
        nonReentrant
        returns (
            uint256 tokenToEngine,
            uint256 baseToEngine,
            uint256 tokenToCompound,
            uint256 baseToCompound,
            uint256 liquidityAdded
        )
    {
        if (msg.sender != owner() && !compoundKeeper[msg.sender]) revert UnauthorizedKeeper();
        if (routeMode != RouteMode.Split) revert WrongRouteMode();

        uint256 tokenBalance = token.balanceOf(address(this));
        uint256 baseBalance = base.balanceOf(address(this));
        if (tokenBalance == 0 && baseBalance == 0) revert ZeroValue();

        uint256 engineShare = splitEngineShareBps;
        if (engineShare == 0 || engineShare >= BPS) revert InvalidConfig();

        tokenToEngine = (tokenBalance * engineShare) / BPS;
        baseToEngine = (baseBalance * engineShare) / BPS;
        tokenToCompound = tokenBalance - tokenToEngine;
        baseToCompound = baseBalance - baseToEngine;

        if (tokenToEngine != 0 || baseToEngine != 0) {
            _routeToEngineUnchecked(tokenToEngine, baseToEngine);
        }
        if (tokenToCompound != 0 || baseToCompound != 0) {
            liquidityAdded = _compoundUnchecked(tokenToCompound, baseToCompound, minLiquidityAdded, deadline, data);
        }

        emit SplitProcessed(msg.sender, tokenToEngine, baseToEngine, tokenToCompound, baseToCompound, liquidityAdded);
    }

    function processGenesisSplitAll(
        uint256 minLiquidityAdded,
        uint64 deadline,
        bytes calldata data
    )
        external
        nonReentrant
        returns (
            uint256 baseToGenesis,
            uint256 tokenToCompound,
            uint256 baseToCompound,
            uint256 liquidityAdded
        )
    {
        if (msg.sender != owner() && !compoundKeeper[msg.sender]) revert UnauthorizedKeeper();
        if (routeMode != RouteMode.GenesisSplit) revert WrongRouteMode();

        uint256 tokenBalance = token.balanceOf(address(this));
        uint256 baseBalance = base.balanceOf(address(this));
        if (tokenBalance == 0 && baseBalance == 0) revert ZeroValue();

        uint256 genesisShare = splitGenesisShareBps;
        if (genesisShare == 0 || genesisShare >= BPS) revert InvalidConfig();

        baseToGenesis = (baseBalance * genesisShare) / BPS;
        tokenToCompound = tokenBalance;
        baseToCompound = baseBalance - baseToGenesis;

        if (baseToGenesis != 0) {
            _routeBaseToGenesisUnchecked(baseToGenesis);
        }
        if (tokenToCompound != 0 || baseToCompound != 0) {
            liquidityAdded = _compoundUnchecked(tokenToCompound, baseToCompound, minLiquidityAdded, deadline, data);
        }

        emit GenesisSplitProcessed(msg.sender, baseToGenesis, tokenToCompound, baseToCompound, liquidityAdded);
    }

    function balances() external view returns (uint256 tokenBalance, uint256 baseBalance) {
        tokenBalance = token.balanceOf(address(this));
        baseBalance = base.balanceOf(address(this));
    }

    function _compound(
        uint256 tokenAmount,
        uint256 baseAmount,
        uint256 minLiquidityAdded,
        uint64 deadline,
        bytes calldata data
    ) internal nonReentrant returns (uint256 liquidityAdded) {
        if (routeMode != RouteMode.Liquidity) revert WrongRouteMode();
        liquidityAdded = _compoundUnchecked(tokenAmount, baseAmount, minLiquidityAdded, deadline, data);
    }

    function _compoundUnchecked(
        uint256 tokenAmount,
        uint256 baseAmount,
        uint256 minLiquidityAdded,
        uint64 deadline,
        bytes calldata data
    ) internal returns (uint256 liquidityAdded) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (tokenAmount == 0 && baseAmount == 0) revert ZeroValue();
        if (data.length != 0 || minLiquidityAdded == 0) revert InvalidConfig();

        address target = compounder;
        if (target == address(0)) revert ZeroAddress();
        uint256 tokenBalanceBefore = token.balanceOf(address(this));
        uint256 baseBalanceBefore = base.balanceOf(address(this));
        if (tokenAmount > tokenBalanceBefore || baseAmount > baseBalanceBefore) {
            revert InsufficientBalance();
        }

        uint256 bounty = (baseAmount * keeperBountyBps) / BPS;
        uint256 baseForCompound = baseAmount - bounty;
        if (baseAmount != 0 && baseForCompound < minCompoundBase) revert InvalidConfig();

        if (bounty != 0) {
            base.safeTransfer(msg.sender, bounty);
            totalBaseBountyPaid += bounty;
        }

        if (tokenAmount != 0) token.forceApprove(target, tokenAmount);
        if (baseForCompound != 0) base.forceApprove(target, baseForCompound);

        liquidityAdded = ILiquidityCompounder(target).compound(
            address(token),
            address(base),
            tokenAmount,
            baseForCompound,
            data
        );

        if (tokenAmount != 0) token.forceApprove(target, 0);
        if (baseForCompound != 0) base.forceApprove(target, 0);

        uint256 tokenSpent = tokenBalanceBefore - token.balanceOf(address(this));
        uint256 baseSpent = baseBalanceBefore - base.balanceOf(address(this));
        if (tokenSpent != tokenAmount || baseSpent != baseAmount) revert CompounderDidNotSpend();
        if (liquidityAdded < minLiquidityAdded) revert SlippageExceeded();

        totalTokenCompounded += tokenAmount;
        totalBaseCompounded += baseForCompound;

        emit Compounded(msg.sender, target, tokenAmount, baseForCompound, bounty, liquidityAdded);
    }

    function _routeToEngine(uint256 tokenAmount, uint256 baseAmount) internal nonReentrant {
        if (routeMode != RouteMode.Engine) revert WrongRouteMode();
        _routeToEngineUnchecked(tokenAmount, baseAmount);
    }

    function _routeBaseToGenesis(uint256 baseAmount) internal nonReentrant {
        if (routeMode != RouteMode.Genesis) revert WrongRouteMode();
        _routeBaseToGenesisUnchecked(baseAmount);
    }

    function _routeToEngineUnchecked(uint256 tokenAmount, uint256 baseAmount) internal {
        if (tokenAmount == 0 && baseAmount == 0) revert ZeroValue();

        address target = engine;
        if (target == address(0)) revert ZeroAddress();
        if (tokenAmount > token.balanceOf(address(this)) || baseAmount > base.balanceOf(address(this))) {
            revert InsufficientBalance();
        }

        if (tokenAmount != 0) {
            token.safeTransfer(target, tokenAmount);
            INARAEngineRouting(target).syncEmissionReserve();
            totalTokenRoutedToEngine += tokenAmount;
        }

        if (baseAmount != 0) {
            base.forceApprove(target, baseAmount);
            INARAEngineRouting(target).notifyTokenRewards(address(base), baseAmount);
            base.forceApprove(target, 0);
            totalBaseRoutedToEngine += baseAmount;
        }

        emit RoutedToEngine(msg.sender, tokenAmount, baseAmount);
    }

    function _routeBaseToGenesisUnchecked(uint256 baseAmount) internal {
        if (baseAmount == 0) revert ZeroValue();

        address target = genesisRewardDistributor;
        if (target == address(0)) revert ZeroAddress();
        if (INARAGenesisRewardDistributorRouting(target).trackedGenesisRewardWeight() == 0) revert InvalidConfig();
        if (baseAmount > base.balanceOf(address(this))) {
            revert InsufficientBalance();
        }

        base.forceApprove(target, baseAmount);
        INARAGenesisRewardDistributorRouting(target).notifyTokenRewards(baseAmount);
        base.forceApprove(target, 0);
        totalBaseRoutedToGenesis += baseAmount;

        emit RoutedToGenesis(msg.sender, baseAmount);
    }
}
