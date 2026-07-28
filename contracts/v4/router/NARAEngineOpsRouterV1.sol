// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {EngineConfig} from "../NARAEngineTypes.sol";

/// @notice Minimal interface for the monitored engine operations this router wraps.
interface INARAEngineOpsRouterV1Engine {
    function NARA() external view returns (address);
    function pendingConfigTimestamp() external view returns (uint64);
    function stagedConfigEpoch() external view returns (uint64);
    function accumulatedTreasuryEthFees() external view returns (uint256);
    function trackedEmissionReserve() external view returns (uint256);

    function proposeConfig(EngineConfig calldata cfg_) external;
    function executeConfig() external;
    function cancelConfig() external;
    function withdrawTreasuryEthFees(address to) external;
    function depositRewards(uint256 amount) external;
    function syncEmissionReserve() external;
}

/// @title NARAEngineOpsRouterV1
/// @notice Monitored operations router for NARAEngine admin and treasury actions.
/// @dev
/// The engine itself remains unchanged. In production, grant the engine's PARAM_ROLE
/// and TREASURY_ROLE to this router, then have the operations Safe call this router
/// for routine actions. Any direct PARAM_ROLE/TREASURY_ROLE engine call should be
/// treated as break-glass and monitored separately.
///
/// The router holds no long-lived balances. It rejects ETH transfers, forbids
/// withdrawing treasury ETH to itself, and clears NARA allowance after deposits.
contract NARAEngineOpsRouterV1 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    INARAEngineOpsRouterV1Engine public immutable ENGINE;
    IERC20 public immutable NARA_TOKEN;
    address public immutable PARAM_OPERATOR;
    address public immutable TREASURY_OPERATOR;

    event EngineConfigProposedObserved(
        address indexed caller,
        bytes32 indexed configHash,
        uint64 executableAt
    );
    event EngineConfigStagedObserved(address indexed caller, uint64 indexed stagedEpoch);
    event EngineConfigCancelledObserved(address indexed caller);
    event TreasuryEthFeesWithdrawnObserved(
        address indexed caller,
        address indexed to,
        uint256 amount
    );
    event EmissionReserveDepositedObserved(
        address indexed caller,
        uint256 amount,
        uint256 trackedEmissionReserveAfter
    );
    event EmissionReserveSyncedObserved(
        address indexed caller,
        uint256 amount,
        uint256 trackedEmissionReserveAfter
    );

    error OpsRouterZeroAddress();
    error OpsRouterNotAContract();
    error OpsRouterUnauthorized(address caller);
    error OpsRouterInvalidReceiver();
    error OpsRouterEthRejected();

    constructor(address engine_, address paramOperator_, address treasuryOperator_) {
        if (engine_ == address(0) || paramOperator_ == address(0) || treasuryOperator_ == address(0)) {
            revert OpsRouterZeroAddress();
        }
        if (engine_.code.length == 0) revert OpsRouterNotAContract();

        ENGINE = INARAEngineOpsRouterV1Engine(engine_);
        address nara = INARAEngineOpsRouterV1Engine(engine_).NARA();
        if (nara == address(0)) revert OpsRouterZeroAddress();
        if (nara.code.length == 0) revert OpsRouterNotAContract();

        NARA_TOKEN = IERC20(nara);
        PARAM_OPERATOR = paramOperator_;
        TREASURY_OPERATOR = treasuryOperator_;
    }

    receive() external payable {
        revert OpsRouterEthRejected();
    }

    function proposeConfig(EngineConfig calldata cfg_) external nonReentrant onlyParamOperator {
        bytes32 configHash = keccak256(abi.encode(cfg_));
        ENGINE.proposeConfig(cfg_);
        emit EngineConfigProposedObserved(msg.sender, configHash, ENGINE.pendingConfigTimestamp());
    }

    function executeConfig() external nonReentrant onlyParamOperator {
        ENGINE.executeConfig();
        emit EngineConfigStagedObserved(msg.sender, ENGINE.stagedConfigEpoch());
    }

    function cancelConfig() external nonReentrant onlyParamOperator {
        ENGINE.cancelConfig();
        emit EngineConfigCancelledObserved(msg.sender);
    }

    function withdrawTreasuryEthFees(address to) external nonReentrant onlyTreasuryOperator {
        if (to == address(this)) revert OpsRouterInvalidReceiver();
        uint256 amount = ENGINE.accumulatedTreasuryEthFees();
        ENGINE.withdrawTreasuryEthFees(to);
        emit TreasuryEthFeesWithdrawnObserved(msg.sender, to, amount);
    }

    function depositRewards(uint256 amount) external nonReentrant onlyTreasuryOperator {
        NARA_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        NARA_TOKEN.forceApprove(address(ENGINE), amount);
        ENGINE.depositRewards(amount);
        NARA_TOKEN.forceApprove(address(ENGINE), 0);
        emit EmissionReserveDepositedObserved(msg.sender, amount, ENGINE.trackedEmissionReserve());
    }

    function syncEmissionReserve() external nonReentrant onlyTreasuryOperator {
        uint256 beforeTracked = ENGINE.trackedEmissionReserve();
        ENGINE.syncEmissionReserve();
        uint256 afterTracked = ENGINE.trackedEmissionReserve();
        emit EmissionReserveSyncedObserved(msg.sender, afterTracked - beforeTracked, afterTracked);
    }

    modifier onlyParamOperator() {
        if (msg.sender != PARAM_OPERATOR) revert OpsRouterUnauthorized(msg.sender);
        _;
    }

    modifier onlyTreasuryOperator() {
        if (msg.sender != TREASURY_OPERATOR) revert OpsRouterUnauthorized(msg.sender);
        _;
    }
}
