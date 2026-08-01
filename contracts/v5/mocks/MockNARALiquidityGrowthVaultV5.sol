// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

import {INARALiquidityGrowthVaultV5} from "../interfaces/INARALiquidityGrowthVaultV5.sol";

interface IMockClaimMutatorV5 {
    function burnClaimForTest(address owner, uint256 currencyId, uint256 amount) external;
}

contract MockNARALiquidityGrowthVaultV5 is INARALiquidityGrowthVaultV5 {
    address public immutable override token;
    address public immutable override base;
    address public immutable override poolManager;
    address public override hook;
    PoolId public override poolId;
    bool public override configurationSealed;
    bytes32 public override configurationHash;

    bool public recordReverts;
    uint8 public claimMutation;
    bool public driftConfigurationDuringRecord;
    address public phaseReentryController;
    bool public attemptPhaseReentry;
    bool public lastPhaseReentrySucceeded;
    bytes4 public lastPhaseReentryErrorSelector;
    uint256 public totalTokenFees;
    uint256 public totalBaseFees;
    uint256 public unprocessedTokenFees;
    uint256 public unprocessedBaseFees;
    uint256 public buyInputBaseFees;
    uint256 public buyOutputTokenFees;
    uint256 public sellInputTokenFees;
    uint256 public sellOutputBaseFees;

    error NotHook();
    error AlreadyBound();
    error InvalidRecord();
    error ForcedRevert();
    error InsufficientFeeBalance();

    event SwapFeesRecorded(SwapFeeRecord record);

    constructor(address token_, address base_, address poolManager_) {
        token = token_;
        base = base_;
        poolManager = poolManager_;
    }

    function bind(address hook_, PoolId poolId_) external {
        if (hook != address(0)) revert AlreadyBound();
        hook = hook_;
        poolId = poolId_;
        configurationHash = keccak256(abi.encode(token, base, poolManager, hook_, PoolId.unwrap(poolId_)));
        configurationSealed = true;
    }

    function setRecordReverts(bool value) external {
        recordReverts = value;
    }

    function setClaimMutation(uint8 value) external {
        claimMutation = value;
    }

    function setDriftConfigurationDuringRecord(bool value) external {
        driftConfigurationDuringRecord = value;
    }

    function setConfigurationSealed(bool value) external {
        configurationSealed = value;
    }

    function setConfigurationHash(bytes32 value) external {
        configurationHash = value;
    }

    function setPhaseReentry(address controller, bool enabled) external {
        phaseReentryController = controller;
        attemptPhaseReentry = enabled;
    }

    function recordSwapFees(SwapFeeRecord calldata record) external override {
        if (msg.sender != hook) revert NotHook();
        if (recordReverts) revert ForcedRevert();
        if (PoolId.unwrap(record.poolId) != PoolId.unwrap(poolId) || record.inputCurrency == record.outputCurrency) {
            revert InvalidRecord();
        }
        bool buy = record.inputCurrency == base && record.outputCurrency == token && record.isBuy;
        bool sell = record.inputCurrency == token && record.outputCurrency == base && !record.isBuy;
        if (!buy && !sell) revert InvalidRecord();

        if (attemptPhaseReentry) {
            bytes memory returnData;
            (lastPhaseReentrySucceeded, returnData) =
                phaseReentryController.call(abi.encodeWithSignature("advance(uint8)", uint8(0)));
            if (!lastPhaseReentrySucceeded && returnData.length >= 4) {
                bytes4 errorSelector;
                assembly ("memory-safe") {
                    errorSelector := mload(add(returnData, 0x20))
                }
                lastPhaseReentryErrorSelector = errorSelector;
            }
        }

        if (driftConfigurationDuringRecord) {
            configurationHash = keccak256(abi.encode(configurationHash, record.grossInput, record.grossOutput));
        }

        if (record.inputCurrency == token) {
            totalTokenFees += record.inputFee;
            unprocessedTokenFees += record.inputFee;
            sellInputTokenFees += record.inputFee;
        } else {
            totalBaseFees += record.inputFee;
            unprocessedBaseFees += record.inputFee;
            buyInputBaseFees += record.inputFee;
        }
        if (record.outputCurrency == token) {
            totalTokenFees += record.outputFee;
            unprocessedTokenFees += record.outputFee;
            buyOutputTokenFees += record.outputFee;
        } else {
            totalBaseFees += record.outputFee;
            unprocessedBaseFees += record.outputFee;
            sellOutputBaseFees += record.outputFee;
        }

        if (IPoolManager(poolManager).balanceOf(address(this), uint256(uint160(token))) < unprocessedTokenFees) {
            revert InsufficientFeeBalance();
        }
        if (IPoolManager(poolManager).balanceOf(address(this), uint256(uint160(base))) < unprocessedBaseFees) {
            revert InsufficientFeeBalance();
        }
        if (claimMutation == 1) {
            IMockClaimMutatorV5(poolManager).burnClaimForTest(
                address(this), uint256(uint160(record.inputCurrency)), record.inputFee
            );
        } else if (claimMutation == 2) {
            IMockClaimMutatorV5(poolManager).burnClaimForTest(
                address(this), uint256(uint160(record.outputCurrency)), record.outputFee
            );
        }
        emit SwapFeesRecorded(record);
    }
}
