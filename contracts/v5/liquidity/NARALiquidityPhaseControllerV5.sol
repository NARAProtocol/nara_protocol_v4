// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PositionInfo, PositionInfoLibrary} from "@uniswap/v4-periphery/src/libraries/PositionInfoLibrary.sol";

import {INARALiquidityPhaseControllerV5 as IHookPhaseControllerV5} from "../interfaces/INARALiquidityPhaseControllerV5.sol";
import {INARALiquidityFeeEngineV5} from "../interfaces/INARALiquidityFeeEngineV5.sol";
import {INARALiquidityHookLifecycleV5} from "../interfaces/liquidity/INARALiquidityHookLifecycleV5.sol";
import {INARALiquidityVaultRoutingV5} from "../interfaces/liquidity/INARALiquidityVaultRoutingV5.sol";
import {INARANamedPOLProviderV5} from "../interfaces/liquidity/INARANamedPOLProviderV5.sol";
import {INARAPositionManagerStateV5} from "../interfaces/liquidity/INARAPositionManagerStateV5.sol";
import {NARARecoveryDelayPolicyV5} from "./NARARecoveryDelayPolicyV5.sol";

/// @title NARA Liquidity Phase Controller V5
/// @notice Derives active POL only from two named, recovery-locked PM NFTs and
///         advances the fixed Hook curve after spaced threshold observations.
contract NARALiquidityPhaseControllerV5 is IHookPhaseControllerV5, NARARecoveryDelayPolicyV5 {
    using PoolIdLibrary for PoolKey;
    using PositionInfoLibrary for PositionInfo;
    using StateLibrary for IPoolManager;

    uint8 public constant PHASE_COUNT = 5;
    uint64 public constant MIN_OBSERVATION_PERIOD = 1 minutes;
    uint64 public constant MAX_OBSERVATION_PERIOD = 30 days;
    uint8 public constant MIN_OBSERVATIONS = 2;
    uint8 public constant MAX_OBSERVATIONS = 32;

    struct PhaseObservation {
        uint64 startedAt;
        uint64 lastObservedAt;
        uint8 count;
    }

    address public immutable configurationAuthority;
    address public immutable recoveryAuthority;
    address public immutable poolManager;
    address public immutable positionManager;
    address public immutable vault;
    address public immutable seedCustody;
    address public immutable compounder;
    PoolId public immutable override poolId;
    bytes32 public immutable override phaseScheduleHash;

    address public override hook;
    bool public override configurationSealed;
    bytes32 public override configurationHash;
    bytes32 public hookCodeHash;
    bytes32 public vaultConfigurationHash;
    bytes32 public seedConfigurationHash;
    bytes32 public compounderConfigurationHash;

    uint64[4] private _observationPeriods;
    uint8[4] private _minimumObservations;
    mapping(uint8 phase => PhaseObservation observation) public phaseObservation;

    uint64 public retirementEta;
    bool public retired;

    event ConfigurationSealed(address indexed hook, bytes32 indexed configurationHash);
    event PhaseObservationRecorded(
        uint8 indexed targetPhase,
        uint8 count,
        uint64 startedAt,
        uint64 observedAt,
        uint256 activeLiquidity,
        uint256 requiredLiquidity
    );
    event PhaseObservationReset(uint8 indexed targetPhase, uint256 activeLiquidity, uint256 requiredLiquidity);
    event PhaseObservationCleared(uint8 indexed targetPhase);
    event QualifiedPhaseAdvanced(uint8 indexed previousPhase, uint8 indexed nextPhase, uint256 activeLiquidity);
    event RetirementQueued(uint64 eta);
    event RetirementCancelled();
    event StackRetired(uint64 indexed queuedEta, bytes32 indexed settlementReceipt);

    error ZeroAddress();
    error NotAContract();
    error Unauthorized();
    error InvalidConfiguration();
    error AlreadySealed();
    error ConfigurationNotSealed();
    error InvalidObservationPolicy();
    error ObservationTooSoon();
    error ObservationIncomplete();
    error NoFurtherPhase();
    error InsufficientActivePOL();
    error RetirementAlreadyPending();
    error NoPendingRetirement();
    error RetirementNotReady();
    error PermanentlyRetired();
    error RecoveryEtaMismatch();
    error RetirementSettlementIncomplete();
    error PoolNotActive();

    constructor(
        address configurationAuthority_,
        address recoveryAuthority_,
        address poolManager_,
        address positionManager_,
        address vault_,
        address seedCustody_,
        address compounder_,
        PoolId poolId_,
        bytes32 phaseScheduleHash_,
        uint64[4] memory observationPeriods_,
        uint8[4] memory minimumObservations_,
        DeploymentDomain deploymentDomain_,
        uint64 recoveryDelay_
    ) NARARecoveryDelayPolicyV5(deploymentDomain_, recoveryDelay_) {
        if (
            configurationAuthority_ == address(0) || recoveryAuthority_ == address(0)
                || poolManager_ == address(0) || positionManager_ == address(0) || vault_ == address(0)
                || seedCustody_ == address(0) || compounder_ == address(0)
        ) revert ZeroAddress();
        if (PoolId.unwrap(poolId_) == bytes32(0) || phaseScheduleHash_ == bytes32(0)) {
            revert InvalidConfiguration();
        }
        if (
            poolManager_.code.length == 0 || positionManager_.code.length == 0 || vault_.code.length == 0
                || seedCustody_.code.length == 0 || compounder_.code.length == 0
        ) revert NotAContract();
        for (uint256 i; i < 4; ) {
            if (
                observationPeriods_[i] < MIN_OBSERVATION_PERIOD
                    || observationPeriods_[i] > MAX_OBSERVATION_PERIOD
                    || minimumObservations_[i] < MIN_OBSERVATIONS
                    || minimumObservations_[i] > MAX_OBSERVATIONS
            ) revert InvalidObservationPolicy();
            _observationPeriods[i] = observationPeriods_[i];
            _minimumObservations[i] = minimumObservations_[i];
            unchecked {
                ++i;
            }
        }

        configurationAuthority = configurationAuthority_;
        recoveryAuthority = recoveryAuthority_;
        poolManager = poolManager_;
        positionManager = positionManager_;
        vault = vault_;
        seedCustody = seedCustody_;
        compounder = compounder_;
        poolId = poolId_;
        phaseScheduleHash = phaseScheduleHash_;
    }

    /// @notice Irreversibly binds the already-deployed Hook after all reciprocal
    ///         providers and the Vault have sealed their configurations.
    /// @dev Worst case for a compromised configuration authority is sealing the
    ///      wrong pre-activation Hook. Every reciprocal field, code hash and
    ///      configuration hash is pinned, with no post-seal setter.
    function sealConfiguration(address hook_) external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (configurationSealed) revert AlreadySealed();
        if (hook_ == address(0)) revert ZeroAddress();
        if (hook_.code.length == 0) revert NotAContract();
        INARALiquidityHookLifecycleV5 hookBinding = INARALiquidityHookLifecycleV5(hook_);
        if (
            hookBinding.phaseController() != address(this) || hookBinding.vault() != vault
                || hookBinding.poolManager() != poolManager
                || PoolId.unwrap(hookBinding.poolId()) != PoolId.unwrap(poolId)
                || hookBinding.phaseScheduleHash() != phaseScheduleHash || hookBinding.phaseCount() != PHASE_COUNT
        ) revert InvalidConfiguration();

        INARALiquidityVaultRoutingV5 vaultBinding = INARALiquidityVaultRoutingV5(vault);
        if (
            !vaultBinding.configurationSealed() || vaultBinding.hook() != hook_
                || vaultBinding.controller() != address(this) || vaultBinding.compounder() != compounder
                || PoolId.unwrap(vaultBinding.poolId()) != PoolId.unwrap(poolId)
                || vaultBinding.routingState() != INARALiquidityVaultRoutingV5.RoutingState.BootstrapLiquidity
        ) revert InvalidConfiguration();

        _validateProviderStatic(seedCustody, hook_);
        _validateProviderStatic(compounder, hook_);
        if (INARANamedPOLProviderV5(seedCustody).positionTokenId() == 0) revert InvalidConfiguration();

        hook = hook_;
        hookCodeHash = hook_.codehash;
        vaultConfigurationHash = vaultBinding.configurationHash();
        seedConfigurationHash = INARANamedPOLProviderV5(seedCustody).configurationHash();
        compounderConfigurationHash = INARANamedPOLProviderV5(compounder).configurationHash();
        configurationHash = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                hook_,
                hookCodeHash,
                poolManager,
                positionManager,
                vault,
                vaultConfigurationHash,
                seedCustody,
                seedConfigurationHash,
                compounder,
                compounderConfigurationHash,
                PoolId.unwrap(poolId),
                phaseScheduleHash,
                _observationPeriods,
                _minimumObservations,
                recoveryAuthority,
                uint8(deploymentDomain),
                recoveryDelay
            )
        );
        configurationSealed = true;
        if (_verifiedPositionLiquidity(seedCustody, _currentTick()) == 0) revert InvalidConfiguration();
        emit ConfigurationSealed(hook_, configurationHash);
    }

    function observationPolicy(uint8 targetPhase)
        external
        view
        returns (uint64 period, uint8 requiredObservations, uint64 minimumSpacing)
    {
        if (targetPhase == 0 || targetPhase >= PHASE_COUNT) revert InvalidObservationPolicy();
        period = _observationPeriods[targetPhase - 1];
        requiredObservations = _minimumObservations[targetPhase - 1];
        minimumSpacing = _minimumSpacing(targetPhase);
    }

    /// @inheritdoc IHookPhaseControllerV5
    function activeProtocolLiquidity() public view override returns (uint256 activeLiquidity) {
        if (!configurationSealed || retired) return 0;
        int24 tick = _currentTick();
        activeLiquidity = uint256(_verifiedPositionLiquidity(seedCustody, tick))
            + uint256(_verifiedPositionLiquidity(compounder, tick));
    }

    /// @inheritdoc IHookPhaseControllerV5
    function activationAllowed() external view override returns (bool) {
        if (!configurationSealed || retired || retirementEta != 0) return false;
        if (
            INARANamedPOLProviderV5(seedCustody).recoveryPending()
                || INARANamedPOLProviderV5(compounder).recoveryPending()
        ) return false;
        return _verifiedPositionLiquidity(seedCustody, _currentTick()) != 0;
    }

    /// @notice Records a permissionless, spaced observation of the next fixed
    ///         active-POL threshold. Third-party/JIT liquidity and loose assets
    ///         are absent from the derived scalar.
    function observeNextPhase() external returns (bool qualifying) {
        _requirePhaseOperational();
        uint8 current = INARALiquidityHookLifecycleV5(hook).currentPhase();
        if (current + 1 >= PHASE_COUNT) revert NoFurtherPhase();
        uint8 target = current + 1;
        uint256 active = activeProtocolLiquidity();
        uint256 required = INARALiquidityHookLifecycleV5(hook).phaseMinimumActiveLiquidity(target);
        if (active < required) {
            if (phaseObservation[target].count != 0) delete phaseObservation[target];
            emit PhaseObservationReset(target, active, required);
            return false;
        }

        PhaseObservation storage observation = phaseObservation[target];
        uint64 nowTimestamp = uint64(block.timestamp);
        if (observation.count == 0) {
            observation.startedAt = nowTimestamp;
            observation.lastObservedAt = nowTimestamp;
            observation.count = 1;
        } else {
            if (nowTimestamp < observation.lastObservedAt + _minimumSpacing(target)) revert ObservationTooSoon();
            if (observation.count < _minimumObservations[target - 1]) {
                unchecked {
                    ++observation.count;
                }
            }
            observation.lastObservedAt = nowTimestamp;
        }
        emit PhaseObservationRecorded(
            target,
            observation.count,
            observation.startedAt,
            nowTimestamp,
            active,
            required
        );
        return true;
    }

    /// @notice Permissionlessly advances a fully-observed fixed phase. The first
    ///         advancement atomically opens the Vault's immutable Shared route.
    function advanceQualifiedPhase() external {
        _requirePhaseOperational();
        uint8 current = INARALiquidityHookLifecycleV5(hook).currentPhase();
        if (current + 1 >= PHASE_COUNT) revert NoFurtherPhase();
        uint8 target = current + 1;
        PhaseObservation memory observation = phaseObservation[target];
        if (
            observation.count < _minimumObservations[target - 1]
                || block.timestamp < uint256(observation.startedAt) + _observationPeriods[target - 1]
        ) revert ObservationIncomplete();
        uint256 active = activeProtocolLiquidity();
        if (active < INARALiquidityHookLifecycleV5(hook).phaseMinimumActiveLiquidity(target)) {
            revert InsufficientActivePOL();
        }

        INARALiquidityHookLifecycleV5(hook).advancePhase(current);
        if (current == 0) INARALiquidityVaultRoutingV5(vault).enterShared();
        delete phaseObservation[target];
        emit QualifiedPhaseAdvanced(current, target, active);
    }

    /// @notice Queues the whole companion-stack wind-down under the same sealed delay.
    /// @dev Worst case for the immutable recovery Safe is announcing a wind-down;
    ///      no asset or NFT can move before the ETA and Hook retirement.
    function proposeRetirement() external {
        if (msg.sender != recoveryAuthority) revert Unauthorized();
        _requireOperational();
        if (retirementEta != 0) revert RetirementAlreadyPending();
        _clearPhaseObservations();
        uint64 eta = _recoveryEta();
        retirementEta = eta;
        uint64 seedEta = INARANamedPOLProviderV5(seedCustody).queueRecovery();
        uint64 compounderEta = INARANamedPOLProviderV5(compounder).queueRecovery();
        if (seedEta != eta || compounderEta != eta) revert RecoveryEtaMismatch();
        emit RetirementQueued(eta);
    }

    function cancelRetirement() external {
        if (msg.sender != recoveryAuthority) revert Unauthorized();
        if (retirementEta == 0) revert NoPendingRetirement();
        retirementEta = 0;
        INARANamedPOLProviderV5(seedCustody).cancelRecovery();
        INARANamedPOLProviderV5(compounder).cancelRecovery();
        emit RetirementCancelled();
    }

    /// @notice Permissionlessly executes the announced atomic retirement at ETA:
    ///         stop Hook swaps, seal the Vault, settle every classified claim,
    ///         then move both named NFTs and banked assets to recovery custody.
    function executeRetirement() external {
        uint64 eta = retirementEta;
        if (eta == 0) revert NoPendingRetirement();
        if (block.timestamp < eta) revert RetirementNotReady();
        if (retired) revert PermanentlyRetired();

        INARALiquidityHookLifecycleV5(hook).retirePool();
        INARALiquidityVaultRoutingV5 vaultBinding = INARALiquidityVaultRoutingV5(vault);
        INARALiquidityFeeEngineV5(vaultBinding.engine()).syncLiquidityFeeBacking();
        vaultBinding.retire();
        bytes32 settlementReceipt = keccak256(
            abi.encode("NARA_V5_RETIREMENT", block.chainid, address(this), eta)
        );
        vaultBinding.settleRetirementClaims(settlementReceipt);
        if (!vaultBinding.allClassifiedClaimsProcessed()) {
            revert RetirementSettlementIncomplete();
        }
        INARANamedPOLProviderV5(seedCustody).executeRecovery();
        INARANamedPOLProviderV5(compounder).executeRecovery();
        retirementEta = 0;
        retired = true;
        emit StackRetired(eta, settlementReceipt);
    }

    function _validateProviderStatic(address provider, address hook_) private view {
        INARANamedPOLProviderV5 named = INARANamedPOLProviderV5(provider);
        if (
            !named.configurationSealed() || named.configurationHash() == bytes32(0)
                || named.positionManager() != positionManager || named.hook() != hook_
                || named.controller() != address(this)
                || PoolId.unwrap(named.poolId()) != PoolId.unwrap(poolId)
                || named.recoveryDelay() != recoveryDelay || named.deploymentDomain() != uint8(deploymentDomain)
                || named.retired()
        ) revert InvalidConfiguration();
    }

    function _verifiedPositionLiquidity(address provider, int24 currentTick)
        private
        view
        returns (uint128 liquidity)
    {
        INARANamedPOLProviderV5 named = INARANamedPOLProviderV5(provider);
        if (
            !named.configurationSealed() || named.retired() || named.positionManager() != positionManager
                || named.controller() != address(this) || named.hook() != hook
                || PoolId.unwrap(named.poolId()) != PoolId.unwrap(poolId)
        ) return 0;
        uint256 tokenId = named.positionTokenId();
        if (tokenId == 0) return 0;
        int24 lower = named.tickLower();
        int24 upper = named.tickUpper();
        if (currentTick < lower || currentTick >= upper) return 0;

        INARAPositionManagerStateV5 manager = INARAPositionManagerStateV5(positionManager);
        try manager.ownerOf(tokenId) returns (address owner) {
            if (owner != provider) return 0;
        } catch {
            return 0;
        }
        try manager.getPoolAndPositionInfo(tokenId) returns (PoolKey memory key, PositionInfo info) {
            if (
                PoolId.unwrap(key.toId()) != PoolId.unwrap(poolId) || info.tickLower() != lower
                    || info.tickUpper() != upper
            ) return 0;
        } catch {
            return 0;
        }
        try manager.getPositionLiquidity(tokenId) returns (uint128 verifiedLiquidity) {
            liquidity = verifiedLiquidity;
        } catch {
            return 0;
        }
    }

    function _currentTick() private view returns (int24 tick) {
        (uint160 sqrtPriceX96, int24 liveTick,,) = IPoolManager(poolManager).getSlot0(poolId);
        if (sqrtPriceX96 == 0) revert InvalidConfiguration();
        tick = liveTick;
    }

    function _minimumSpacing(uint8 targetPhase) private view returns (uint64) {
        uint64 period = _observationPeriods[targetPhase - 1];
        uint8 intervals = _minimumObservations[targetPhase - 1] - 1;
        return uint64((uint256(period) + intervals - 1) / intervals);
    }

    function _clearPhaseObservations() private {
        for (uint8 target = 1; target < PHASE_COUNT; ) {
            if (phaseObservation[target].count != 0) {
                delete phaseObservation[target];
                emit PhaseObservationCleared(target);
            }
            unchecked {
                ++target;
            }
        }
    }

    function _requirePhaseOperational() private view {
        _requireOperational();
        INARALiquidityHookLifecycleV5 lifecycle = INARALiquidityHookLifecycleV5(hook);
        if (!lifecycle.poolActive() || lifecycle.poolRetired()) revert PoolNotActive();
    }

    function _requireOperational() private view {
        if (!configurationSealed) revert ConfigurationNotSealed();
        if (retired) revert PermanentlyRetired();
        if (retirementEta != 0) revert RetirementAlreadyPending();
        if (hook.codehash != hookCodeHash) revert InvalidConfiguration();
    }
}
