// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IMockTreasuryRangeAtomicPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;

    function allowance(address owner, address token, address spender)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce);

    function transferFrom(address from, address to, uint160 amount, address token) external;
}

interface IMockTreasuryRangeAtomicUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

/// @notice Test-only holder that runs multiple prebuilt Universal Router calls in one transaction.
/// @dev This mock is simulator infrastructure. It must not be deployed or represented as production
///      treasury infrastructure. Universal Router payloads used by the simulator encode this contract
///      as their recipient; the harness deliberately exposes no configurable recipient.
contract MockTreasuryRangeAtomicTrader {
    using SafeERC20 for IERC20;

    struct RouterCall {
        bytes commands;
        bytes[] inputs;
        uint256 deadline;
    }

    uint256 public constant MAX_ROUTER_CALLS = 16;

    address public immutable CONTROLLER;
    IMockTreasuryRangeAtomicUniversalRouter public immutable UNIVERSAL_ROUTER;
    IMockTreasuryRangeAtomicPermit2 public immutable PERMIT2;
    IERC20 public immutable NARA;
    IERC20 public immutable USDC;

    error AtomicTraderZeroAddress();
    error AtomicTraderNotContract(address account);
    error AtomicTraderIdenticalTokens();
    error AtomicTraderUnauthorized(address caller);
    error AtomicTraderInvalidCallCount(uint256 count);
    error AtomicTraderExpiredPermit2Allowance(uint48 expiration);
    error AtomicTraderExpiredCall(uint256 index, uint256 deadline);
    error AtomicTraderFundingMismatch(address token, uint256 expected, uint256 received);
    error AtomicTraderDirtyERC20Allowance(address token, uint256 amount);
    error AtomicTraderDirtyPermit2Allowance(address token, uint160 amount, uint48 expiration);

    event AtomicTraderFunded(uint256 naraAmount, uint256 usdcAmount);
    event AtomicRouterSequenceExecuted(uint256 callCount, uint160 naraAllowance, uint160 usdcAllowance);
    event AtomicTraderBalancesReturned(uint256 naraAmount, uint256 usdcAmount);

    modifier onlyController() {
        if (msg.sender != CONTROLLER) revert AtomicTraderUnauthorized(msg.sender);
        _;
    }

    constructor(address universalRouter_, address permit2_, address nara_, address usdc_) {
        if (universalRouter_ == address(0) || permit2_ == address(0) || nara_ == address(0) || usdc_ == address(0)) {
            revert AtomicTraderZeroAddress();
        }
        if (nara_ == usdc_) revert AtomicTraderIdenticalTokens();
        _requireContract(universalRouter_);
        _requireContract(permit2_);
        _requireContract(nara_);
        _requireContract(usdc_);

        CONTROLLER = msg.sender;
        UNIVERSAL_ROUTER = IMockTreasuryRangeAtomicUniversalRouter(universalRouter_);
        PERMIT2 = IMockTreasuryRangeAtomicPermit2(permit2_);
        NARA = IERC20(nara_);
        USDC = IERC20(usdc_);
    }

    /// @notice Pulls only the two bound test assets from the immutable controller.
    function fund(uint256 naraAmount, uint256 usdcAmount) external onlyController {
        _pullExact(NARA, naraAmount);
        _pullExact(USDC, usdcAmount);
        emit AtomicTraderFunded(naraAmount, usdcAmount);
    }

    /// @notice Executes a bounded sequence of Universal Router calls atomically.
    /// @dev Both approval layers are cleared before returning. Any failed inner call reverts the complete
    ///      outer transaction, including its temporary approvals.
    function executeAtomic(
        RouterCall[] calldata calls,
        uint160 naraAllowance,
        uint160 usdcAllowance,
        uint48 permitExpiration
    )
        external
        onlyController
    {
        uint256 count = calls.length;
        if (count < 2 || count > MAX_ROUTER_CALLS) revert AtomicTraderInvalidCallCount(count);
        if (permitExpiration < block.timestamp) revert AtomicTraderExpiredPermit2Allowance(permitExpiration);
        assertAllowanceClean();

        _approveExact(NARA, naraAllowance, permitExpiration);
        _approveExact(USDC, usdcAllowance, permitExpiration);

        for (uint256 i; i < count; ++i) {
            RouterCall calldata routerCall = calls[i];
            if (routerCall.deadline < block.timestamp) {
                revert AtomicTraderExpiredCall(i, routerCall.deadline);
            }
            UNIVERSAL_ROUTER.execute(routerCall.commands, routerCall.inputs, routerCall.deadline);
        }

        _clearApproval(NARA);
        _clearApproval(USDC);
        assertAllowanceClean();
        emit AtomicRouterSequenceExecuted(count, naraAllowance, usdcAllowance);
    }

    /// @notice Returns only the bound assets and only to the immutable controller.
    function returnBalances() external onlyController {
        uint256 naraAmount = NARA.balanceOf(address(this));
        uint256 usdcAmount = USDC.balanceOf(address(this));
        if (naraAmount != 0) NARA.safeTransfer(CONTROLLER, naraAmount);
        if (usdcAmount != 0) USDC.safeTransfer(CONTROLLER, usdcAmount);
        emit AtomicTraderBalancesReturned(naraAmount, usdcAmount);
    }

    /// @notice Reverting assertion that both ERC20 and Permit2 allowance layers are non-spendable.
    /// @dev Permit2 normalizes a zero expiration to the current timestamp. A retained expiration is
    ///      telemetry only when the corresponding amount is zero.
    function assertAllowanceClean() public view returns (bool) {
        address permit2 = address(PERMIT2);
        address router = address(UNIVERSAL_ROUTER);
        _assertTokenAllowanceClean(NARA, permit2, router);
        _assertTokenAllowanceClean(USDC, permit2, router);
        return true;
    }

    function _approveExact(IERC20 token, uint160 amount, uint48 expiration) private {
        if (amount == 0) return;
        token.forceApprove(address(PERMIT2), amount);
        PERMIT2.approve(address(token), address(UNIVERSAL_ROUTER), amount, expiration);
    }

    function _clearApproval(IERC20 token) private {
        PERMIT2.approve(address(token), address(UNIVERSAL_ROUTER), 0, 0);
        token.forceApprove(address(PERMIT2), 0);
    }

    function _pullExact(IERC20 token, uint256 amount) private {
        if (amount == 0) return;
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(CONTROLLER, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBalance;
        if (received != amount) revert AtomicTraderFundingMismatch(address(token), amount, received);
    }

    function _assertTokenAllowanceClean(IERC20 token, address permit2, address router) private view {
        uint256 erc20Allowance = token.allowance(address(this), permit2);
        if (erc20Allowance != 0) revert AtomicTraderDirtyERC20Allowance(address(token), erc20Allowance);
        (uint160 amount, uint48 expiration,) = PERMIT2.allowance(address(this), address(token), router);
        if (amount != 0) {
            revert AtomicTraderDirtyPermit2Allowance(address(token), amount, expiration);
        }
    }

    function _requireContract(address account) private view {
        if (account.code.length == 0) revert AtomicTraderNotContract(account);
    }
}

/// @dev Minimal test double used only to prove chained input/output funding and outer rollback.
///      Each input is abi.encode(tokenIn, amountIn, tokenOut, amountOut). Commands 0xff force failure.
contract MockTreasuryRangeAtomicUniversalRouter {
    using SafeERC20 for IERC20;

    IMockTreasuryRangeAtomicPermit2 public immutable PERMIT2;
    uint256 public executeCount;

    error AtomicRouterExpired(uint256 deadline);
    error AtomicRouterForcedFailure();

    event MockAtomicRouterExecuted(bytes commands, uint256 inputCount, uint256 deadline);

    constructor(address permit2_) {
        PERMIT2 = IMockTreasuryRangeAtomicPermit2(permit2_);
    }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable {
        if (deadline < block.timestamp) revert AtomicRouterExpired(deadline);
        if (commands.length == 1 && commands[0] == bytes1(0xff)) revert AtomicRouterForcedFailure();

        ++executeCount;
        for (uint256 i; i < inputs.length; ++i) {
            (address tokenIn, uint160 amountIn, address tokenOut, uint160 amountOut) =
                abi.decode(inputs[i], (address, uint160, address, uint160));
            if (amountIn != 0) PERMIT2.transferFrom(msg.sender, address(this), amountIn, tokenIn);
            if (amountOut != 0) IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
        }
        emit MockAtomicRouterExecuted(commands, inputs.length, deadline);
    }
}
