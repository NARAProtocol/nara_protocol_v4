// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "../NARAEngineTypes.sol";

/// @dev v4 copy of NARAEngineModelLib. Curves are bit-identical to v2 so the
/// emission profile on redeploy matches the historical model. Any semantic
/// change must bump the lib name, not mutate this one.
library NARAEngineModelLib {
    uint256 internal constant WAD = 1e18;
    /// @dev 5 years at 15-minute epochs (5 * 365.25 * 24 * 4 = 175,320). Rounded to 175_200.
    uint64 internal constant MAX_MAX_LOCK_EPOCHS = 175_200;
    uint256 internal constant MAX_PARAM_WAD = 10e18;
    uint256 internal constant MAX_MULTIPLIER_WAD = 10e18;
    uint256 internal constant MAX_GROWTH_FACTOR_WAD = 2e18;

    function validateConfig(EngineConfig memory c) internal pure {
        if (c.eMax == 0 || c.beta0Wad == 0) revert InvalidConfig();
        if (c.mWad > MAX_PARAM_WAD) revert InvalidConfig();
        if (c.aWad > MAX_PARAM_WAD) revert InvalidConfig();
        if (c.bWad > MAX_PARAM_WAD) revert InvalidConfig();
        if (c.cWad > MAX_PARAM_WAD) revert InvalidConfig();
        if (c.dWad > MAX_PARAM_WAD) revert InvalidConfig();
        if (c.dripSplitWad > WAD) revert InvalidConfig();
        if (c.durationLinearWad > MAX_PARAM_WAD) revert InvalidConfig();
        if (c.durationQuadraticWad > MAX_PARAM_WAD) revert InvalidConfig();
        if (c.growthFactorWad < WAD || c.growthFactorWad > MAX_GROWTH_FACTOR_WAD) revert InvalidConfig();
        if (c.maxBaseEmission < c.minBaseEmission) revert InvalidConfig();
        if (c.warmupRateWad > WAD) revert InvalidConfig();
        if (c.bootstrapDecayWad > WAD) revert InvalidConfig();
        if (c.maxLockEpochs == 0 || c.maxLockEpochs > MAX_MAX_LOCK_EPOCHS) revert InvalidConfig();
        if (c.activationDelayEpochs == 0 || c.activationDelayEpochs >= c.maxLockEpochs) revert InvalidConfig();
        if (WAD + c.durationLinearWad + c.durationQuadraticWad > MAX_MULTIPLIER_WAD) revert InvalidConfig();
    }

    function computeWeight(EngineConfig memory config, uint256 amount, uint64 dur) internal pure returns (uint256) {
        uint256 r = Math.mulDiv(uint256(dur), WAD, uint256(config.maxLockEpochs));
        uint256 r2 = Math.mulDiv(r, r, WAD);
        uint256 m = WAD
            + Math.mulDiv(config.durationLinearWad, r, WAD)
            + Math.mulDiv(config.durationQuadraticWad, r2, WAD);
        return Math.mulDiv(amount, m, WAD);
    }

    function computeHorizon(uint256 eMax_, uint256 beta_) internal pure returns (uint256) {
        return Math.mulDiv(eMax_, WAD, beta_);
    }

    function weightedLockShareWad(uint256 circ, uint256 w, uint256 boot) internal pure returns (uint256) {
        uint256 d = circ + w + boot;
        return d == 0 ? 0 : Math.mulDiv(w, WAD, d);
    }

    function computeNextEpochSnapshot(
        EpochSnapshot memory prev,
        EngineConfig memory c,
        uint256 circ,
        uint256 totalLocked,
        uint256 effectiveActiveWeight,
        uint256 pendingEthForNextEpoch,
        uint64 nextEpochTimestamp
    ) internal pure returns (EpochSnapshot memory s) {
        uint256 warmup = prev.warmupFactorWad + Math.mulDiv(c.warmupRateWad, WAD - prev.warmupFactorWad, WAD);
        uint256 bootstrap = Math.mulDiv(prev.bootstrapWeight, c.bootstrapDecayWad, WAD);
        uint256 wls = weightedLockShareWad(circ, effectiveActiveWeight, bootstrap);

        uint256 baseEm = prev.baseEmission == 0 ? c.minBaseEmission : Math.mulDiv(prev.baseEmission, c.growthFactorWad, WAD);
        baseEm = _bound(baseEm, c.minBaseEmission, c.maxBaseEmission);

        uint256 incentive = WAD + Math.mulDiv(c.aWad, wls, WAD);
        uint256 penalty = Math.mulDiv(c.bWad, prev.stressWad, WAD);
        uint256 emissionFactor = incentive > penalty ? incentive - penalty : 0;
        uint256 emission = _bound(Math.mulDiv(baseEm, emissionFactor, WAD), 0, c.maxBaseEmission);

        uint256 beta = c.beta0Wad + Math.mulDiv(c.mWad, prev.stressWad, WAD);
        uint256 hz = computeHorizon(c.eMax, beta);

        uint256 ret = 0;
        if (hz > 0 && circ < hz) ret = WAD - Math.mulDiv(circ, WAD, hz);

        uint256 admitted = Math.mulDiv(emission, ret, WAD);
        uint256 targetNara = Math.mulDiv(Math.mulDiv(admitted, c.dripSplitWad, WAD), warmup, WAD);

        uint256 distNara = 0;
        uint256 distEth = 0;
        if (effectiveActiveWeight > 0) {
            distNara = Math.mulDiv(targetNara, effectiveActiveWeight, effectiveActiveWeight + bootstrap);
            distEth = pendingEthForNextEpoch;
        }

        uint256 treasuryAmt = admitted - distNara;
        uint256 e2h = hz == 0 ? 0 : Math.mulDiv(emission, WAD, hz);

        uint256 stress = Math.mulDiv(c.cWad, WAD - wls, WAD) + Math.mulDiv(c.dWad, e2h, WAD);
        if (stress > WAD) stress = WAD;

        s = EpochSnapshot({
            epoch: prev.epoch + 1,
            timestamp: nextEpochTimestamp,
            circulatingSupply: circ,
            totalLocked: totalLocked,
            activeTotalWeight: effectiveActiveWeight,
            weightedLockShareWad: wls,
            stressWad: stress,
            betaWad: beta,
            horizon: hz,
            retentionWad: ret,
            baseEmission: baseEm,
            emission: emission,
            admittedSupply: admitted,
            distributedNara: distNara,
            distributedEth: distEth,
            treasuryAmount: treasuryAmt,
            warmupFactorWad: warmup,
            bootstrapWeight: bootstrap,
            heartbeat: emission == 0 ? type(uint256).max : hz / emission
        });
    }

    function _bound(uint256 x, uint256 lo, uint256 hi) private pure returns (uint256) {
        return x < lo ? lo : (x > hi ? hi : x);
    }
}
