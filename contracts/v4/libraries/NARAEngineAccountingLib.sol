// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "../NARAEngineTypes.sol";

/// @dev v4 accounting lib adapted for the global `uint256 positionId` model.
/// Debt rays for NARA and ETH now live inside the Position struct itself.
/// Multi-asset distribution debts live under a parallel mapping the caller passes in.
library NARAEngineAccountingLib {
    uint256 internal constant RAY = 1e27;
    uint256 internal constant DEBT_UNINITIALISED = type(uint256).max;

    /// @notice Accrue closed-epoch NARA + ETH rewards for a single position.
    /// @dev Mirrors v2 accrual semantics. Reads closed-epoch index checkpoints
    /// (`naraIndexAtEpoch`, `ethIndexAtEpoch`) and returns new NARA/ETH owed
    /// while advancing the position's debt rays in place.
    function positionAccrual(
        mapping(uint64 => uint256) storage naraIndexAtEpoch,
        mapping(uint64 => uint256) storage ethIndexAtEpoch,
        uint64 currentEpochValue,
        Position storage p
    ) internal returns (uint256 addNara, uint256 addEth) {
        uint64 ep = currentEpochValue;
        if (ep == 0 || ep < p.activationEpoch) return (0, 0);

        uint64 lastClosedEpoch = ep - 1;
        if (lastClosedEpoch < p.activationEpoch) return (0, 0);

        uint64 endEp = lastClosedEpoch;
        if (p.unlockEpoch != 0 && endEp >= p.unlockEpoch) endEp = p.unlockEpoch - 1;
        if (endEp < p.activationEpoch) return (0, 0);

        uint256 w = uint256(p.weight);

        if (p.naraDebtRay == DEBT_UNINITIALISED) {
            p.naraDebtRay = Math.mulDiv(w, naraIndexAtEpoch[p.activationEpoch - 1], RAY);
        }
        uint256 ng = Math.mulDiv(w, naraIndexAtEpoch[endEp], RAY);
        if (ng > p.naraDebtRay) {
            addNara = ng - p.naraDebtRay;
            p.naraDebtRay = ng;
        }

        if (p.ethDebtRay == DEBT_UNINITIALISED) {
            p.ethDebtRay = Math.mulDiv(w, ethIndexAtEpoch[p.activationEpoch - 1], RAY);
        }
        uint256 eg = Math.mulDiv(w, ethIndexAtEpoch[endEp], RAY);
        if (eg > p.ethDebtRay) {
            addEth = eg - p.ethDebtRay;
            p.ethDebtRay = eg;
        }
    }

    /// @notice Preview closed-epoch accrual without mutating state.
    function previewPositionAccrual(
        mapping(uint64 => uint256) storage naraIndexAtEpoch,
        mapping(uint64 => uint256) storage ethIndexAtEpoch,
        uint64 currentEpochValue,
        Position storage p
    ) internal view returns (uint256 addNara, uint256 addEth) {
        uint64 ep = currentEpochValue;
        if (ep == 0 || ep < p.activationEpoch) return (0, 0);

        uint64 lastClosedEpoch = ep - 1;
        if (lastClosedEpoch < p.activationEpoch) return (0, 0);

        uint64 endEp = lastClosedEpoch;
        if (p.unlockEpoch != 0 && endEp >= p.unlockEpoch) endEp = p.unlockEpoch - 1;
        if (endEp < p.activationEpoch) return (0, 0);

        uint256 w = uint256(p.weight);

        uint256 nd = p.naraDebtRay;
        if (nd == DEBT_UNINITIALISED) nd = Math.mulDiv(w, naraIndexAtEpoch[p.activationEpoch - 1], RAY);
        uint256 ng = Math.mulDiv(w, naraIndexAtEpoch[endEp], RAY);
        if (ng > nd) addNara = ng - nd;

        uint256 ed = p.ethDebtRay;
        if (ed == DEBT_UNINITIALISED) ed = Math.mulDiv(w, ethIndexAtEpoch[p.activationEpoch - 1], RAY);
        uint256 eg = Math.mulDiv(w, ethIndexAtEpoch[endEp], RAY);
        if (eg > ed) addEth = eg - ed;
    }

    /// @notice Used by extend() to settle accruals then re-base the debt at
    /// current (open) epoch for the new weight.
    function settleAndRebase(
        mapping(uint64 => uint256) storage naraIndexAtEpoch,
        mapping(uint64 => uint256) storage ethIndexAtEpoch,
        uint256 naraIndexRayLive,
        uint256 ethIndexRayLive,
        uint64 currentEpochValue,
        Position storage p,
        uint256 settleWeight,
        uint256 newDebtWeight
    ) internal returns (uint256 addNara, uint256 addEth) {
        (addNara, addEth) = positionAccrual(naraIndexAtEpoch, ethIndexAtEpoch, currentEpochValue, p);

        uint64 ep = currentEpochValue;
        if (ep == 0 || ep < p.activationEpoch || ep >= p.unlockEpoch) return (addNara, addEth);

        if (p.naraDebtRay == DEBT_UNINITIALISED) {
            p.naraDebtRay = Math.mulDiv(settleWeight, naraIndexAtEpoch[p.activationEpoch - 1], RAY);
        }
        if (p.ethDebtRay == DEBT_UNINITIALISED) {
            p.ethDebtRay = Math.mulDiv(settleWeight, ethIndexAtEpoch[p.activationEpoch - 1], RAY);
        }

        // Settle through current-epoch live indices (mid-epoch accrual since last checkpoint).
        uint256 currentNaraGross = Math.mulDiv(settleWeight, naraIndexRayLive, RAY);
        if (currentNaraGross > p.naraDebtRay) addNara += currentNaraGross - p.naraDebtRay;
        uint256 currentEthGross = Math.mulDiv(settleWeight, ethIndexRayLive, RAY);
        if (currentEthGross > p.ethDebtRay) addEth += currentEthGross - p.ethDebtRay;

        // Rebase at current live index so the new weight starts clean.
        p.naraDebtRay = Math.mulDiv(newDebtWeight, naraIndexRayLive, RAY);
        p.ethDebtRay = Math.mulDiv(newDebtWeight, ethIndexRayLive, RAY);
    }

    /// @notice Accrue a multi-asset distribution token for a single position using the live
    /// `tokenIndexRay` (instant-distribution model; the index is updated
    /// at notify-time, not at epoch boundaries).
    function tokenAccrual(
        mapping(uint256 => uint256) storage positionTokenDebtRay,
        uint256 positionId,
        uint256 weight,
        uint256 tokenIndexRay,
        uint256 startIndexRay
    ) internal returns (uint256 owed) {
        uint256 debt = positionTokenDebtRay[positionId];
        if (debt == 0 && startIndexRay != 0) {
            debt = Math.mulDiv(weight, startIndexRay, RAY);
        }
        uint256 gross = Math.mulDiv(weight, tokenIndexRay, RAY);
        if (gross > debt) {
            owed = gross - debt;
            positionTokenDebtRay[positionId] = gross;
        }
    }

    function previewTokenAccrual(
        mapping(uint256 => uint256) storage positionTokenDebtRay,
        uint256 positionId,
        uint256 weight,
        uint256 tokenIndexRay,
        uint256 startIndexRay
    ) internal view returns (uint256 owed) {
        uint256 gross = Math.mulDiv(weight, tokenIndexRay, RAY);
        uint256 debt = positionTokenDebtRay[positionId];
        if (debt == 0 && startIndexRay != 0) {
            debt = Math.mulDiv(weight, startIndexRay, RAY);
        }
        if (gross > debt) owed = gross - debt;
    }
}
