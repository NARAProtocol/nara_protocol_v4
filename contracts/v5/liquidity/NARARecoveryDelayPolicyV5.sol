// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

/// @notice Shared immutable commissioning rule for disposable rehearsals and
///         production V5 POL custody.
abstract contract NARARecoveryDelayPolicyV5 {
    enum DeploymentDomain {
        Rehearsal,
        Production
    }

    uint64 public constant REHEARSAL_RECOVERY_DELAY = 1 hours;
    uint64 public constant MINIMUM_PRODUCTION_RECOVERY_DELAY = 7 days;

    DeploymentDomain public immutable deploymentDomain;
    uint64 public immutable recoveryDelay;

    error InvalidRecoveryDelay();

    constructor(DeploymentDomain deploymentDomain_, uint64 recoveryDelay_) {
        if (
            (deploymentDomain_ == DeploymentDomain.Rehearsal
                && recoveryDelay_ != REHEARSAL_RECOVERY_DELAY)
                || (deploymentDomain_ == DeploymentDomain.Production
                    && recoveryDelay_ < MINIMUM_PRODUCTION_RECOVERY_DELAY)
        ) revert InvalidRecoveryDelay();
        deploymentDomain = deploymentDomain_;
        recoveryDelay = recoveryDelay_;
    }

    function _recoveryEta() internal view returns (uint64 eta) {
        uint256 computed = block.timestamp + uint256(recoveryDelay);
        if (computed > type(uint64).max) revert InvalidRecoveryDelay();
        eta = uint64(computed);
    }
}
