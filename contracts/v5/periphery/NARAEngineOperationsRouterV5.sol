// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";

/// @notice Permissionless, bounded epoch advancement with an explicit manual fallback loop.
contract NARAEngineOperationsRouterV5 {
    uint32 public constant HARD_MAX_STEPS_PER_CALL = 4096;
    uint32 public constant HARD_MAX_CALLS = 64;

    error InvalidEngine();
    error InvalidBound();
    error NoProgress();

    address public immutable engine;
    uint32 public immutable maxStepsPerCall;

    event EpochsAdvanced(uint64 indexed fromEpoch, uint64 indexed toEpoch, uint64 targetEpoch, bool complete);
    event CatchUpExecuted(uint32 callsUsed, uint64 fromEpoch, uint64 toEpoch, uint64 targetEpoch, bool complete);

    constructor(address engine_, uint32 maxStepsPerCall_) {
        if (engine_ == address(0) || engine_.code.length == 0) revert InvalidEngine();
        if (maxStepsPerCall_ == 0 || maxStepsPerCall_ > HARD_MAX_STEPS_PER_CALL) revert InvalidBound();
        engine = engine_;
        maxStepsPerCall = maxStepsPerCall_;
    }

    function advance(uint32 requestedSteps)
        external
        returns (uint64 fromEpoch, uint64 toEpoch, uint64 target, bool complete)
    {
        if (requestedSteps == 0 || requestedSteps > maxStepsPerCall) revert InvalidBound();
        (fromEpoch, toEpoch, target, complete) =
            INARAPositionEngineV5(engine).advanceEpochs(requestedSteps);
        if (toEpoch < fromEpoch || (toEpoch == fromEpoch && !complete)) revert NoProgress();
        emit EpochsAdvanced(fromEpoch, toEpoch, target, complete);
    }

    function catchUp(uint32 maxCalls)
        external
        returns (uint32 callsUsed, uint64 fromEpoch, uint64 toEpoch, uint64 target, bool complete)
    {
        if (maxCalls == 0 || maxCalls > HARD_MAX_CALLS) revert InvalidBound();
        INARAPositionEngineV5 targetEngine = INARAPositionEngineV5(engine);
        fromEpoch = targetEngine.currentEpoch();
        toEpoch = fromEpoch;
        target = targetEngine.targetEpoch();

        while (toEpoch < target && callsUsed < maxCalls) {
            (uint64 callFrom, uint64 callTo, uint64 callTarget, bool callComplete) =
                targetEngine.advanceEpochs(maxStepsPerCall);
            if (callTo <= callFrom) revert NoProgress();
            toEpoch = callTo;
            target = callTarget;
            unchecked {
                ++callsUsed;
            }
            if (callComplete) break;
        }
        complete = toEpoch >= target;
        emit CatchUpExecuted(callsUsed, fromEpoch, toEpoch, target, complete);
    }
}
