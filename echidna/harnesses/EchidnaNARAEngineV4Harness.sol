// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "../../contracts/v4/NARAToken.sol";
import "../../contracts/v4/NARAEngine.sol";
import "../../contracts/v4/NARAEngineTypes.sol";

/// @notice Focused Echidna harness for core NARA v4 engine accounting.
/// @dev Echidna calls this harness, and the harness owns every fuzz-created
/// engine position. That keeps ownership deterministic while still exploring
/// stateful lock, advance, claim, unlock, deposit, ETH-notify and sweep sequences.
/// Invariants cover: supply, principal conservation, NARA solvency, ETH solvency,
/// drip accounting, active-weight bounds, per-position sanity, epoch + index
/// monotonicity. Monotonic checks snapshot state at the start of each action.
contract EchidnaNARAEngineV4Harness {
    uint256 internal constant MAX_SUPPLY = 1_000_000 ether;
    uint64 internal constant EPOCH_SECONDS = 1;
    uint64 internal constant CONFIG_DELAY = 3600;
    uint256 internal constant INITIAL_BASE = 0.5 ether;
    uint256 internal constant MAX_TRACKED_POSITIONS = 64;
    address internal constant TREASURY = address(0xBEEF);

    NARAToken public token;
    NARAEngine public engine;
    address public pendingToken;

    uint256[] internal trackedPositions;

    // before-snapshots for monotonicity invariants (set at the start of each action)
    uint256 private _naraIdxBefore;
    uint256 private _ethIdxBefore;
    uint256 private _nextIdBefore;
    uint64 private _settledEpochBefore;

    constructor() payable {}

    // ── Fuzz actions ───────────────────────────────────────────

    function lockSmall(uint256 amountSeed, uint64 durationSeed) external {
        _ensureEngine();
        _snap();
        if (trackedPositions.length >= MAX_TRACKED_POSITIONS) return;

        uint256 available = token.balanceOf(address(this));
        if (available <= 1 ether) return;

        uint256 amount = 1 ether + (amountSeed % 100 ether);
        if (amount > available) amount = available;

        uint64 duration = 4 + (durationSeed % 128);
        try engine.lock(amount, duration, 0) returns (uint256 positionId) {
            trackedPositions.push(positionId);
        } catch {}
    }

    function advance(uint8 stepsSeed) external {
        _ensureEngine();
        _snap();
        uint256 steps = 1 + (uint256(stepsSeed) % 16);
        try engine.advanceEpochs(steps) returns (uint256, EpochSnapshot memory) {} catch {}
    }

    function claim(uint8 indexSeed) external {
        _ensureEngine();
        _snap();
        uint256 len = trackedPositions.length;
        if (len == 0) return;

        uint256 positionId = trackedPositions[uint256(indexSeed) % len];
        try engine.claimRewards(positionId, address(this)) returns (uint256, uint256) {} catch {}
    }

    function unlock(uint8 indexSeed) external {
        _ensureEngine();
        _snap();
        uint256 len = trackedPositions.length;
        if (len == 0) return;

        uint256 index = uint256(indexSeed) % len;
        uint256 positionId = trackedPositions[index];
        try engine.unlock(positionId) {
            trackedPositions[index] = trackedPositions[len - 1];
            trackedPositions.pop();
        } catch {}
    }

    /// @notice Forward an ETH reward chunk so the ETH accrual/claim paths get exercised.
    function notifyEth(uint256 amountSeed) external {
        _ensureEngine();
        _snap();
        uint256 bal = address(this).balance;
        if (bal == 0) return;
        uint256 amount = 0.001 ether + (amountSeed % 1 ether);
        if (amount > bal) amount = bal;
        try engine.notifyEthRewards{value: amount}() {} catch {}
    }

    /// @notice Deposit more NARA into the emission reserve.
    function depositMore(uint256 amountSeed) external {
        _ensureEngine();
        _snap();
        uint256 available = token.balanceOf(address(this));
        if (available <= 1 ether) return;
        uint256 amount = 1 ether + (amountSeed % 1000 ether);
        if (amount > available) amount = available;
        try engine.depositRewards(amount) {} catch {}
    }

    /// @notice Sweep accumulated treasury ETH fees (exercises the sweep counter path).
    function sweepEthFees() external {
        _ensureEngine();
        _snap();
        try engine.withdrawTreasuryEthFees(TREASURY) {} catch {}
    }

    function trackedPositionCount() external view returns (uint256) {
        return trackedPositions.length;
    }

    // ── Setup / helpers ────────────────────────────────────────

    function _snap() internal {
        _naraIdxBefore = engine.naraIndexRay();
        _ethIdxBefore = engine.ethIndexRay();
        _nextIdBefore = engine.nextPositionId();
        _settledEpochBefore = _settledEpoch();
    }

    function _ensureEngine() internal {
        if (address(engine) != address(0)) return;

        NARAToken deployedToken = new NARAToken(address(this), address(this), "NARA", "NARA");
        token = deployedToken;
        pendingToken = address(deployedToken);

        NARAEngine deployedEngine =
            new NARAEngine(address(this), EPOCH_SECONDS, CONFIG_DELAY, INITIAL_BASE, _defaultConfig());
        engine = deployedEngine;
        deployedEngine.setTreasury(TREASURY);

        deployedToken.approve(address(deployedEngine), type(uint256).max);
        deployedEngine.depositRewards(100_000 ether);
    }

    function _defaultConfig() internal pure returns (EngineConfig memory) {
        return EngineConfig({
            eMax: 1_000_000 ether,
            beta0Wad: 0.008 ether,
            mWad: 0.25 ether,
            aWad: 1.25 ether,
            bWad: 0.90 ether,
            cWad: 0.50 ether,
            dWad: 0.50 ether,
            dripSplitWad: 0.85 ether,
            durationLinearWad: 0.8 ether,
            durationQuadraticWad: 0.9 ether,
            growthFactorWad: 1.000104 ether,
            minBaseEmission: 0.2 ether,
            maxBaseEmission: 5 ether,
            warmupRateWad: 0.00133 ether,
            bootstrapInitialWeight: 10_000_000 ether,
            bootstrapDecayWad: 0.9991 ether,
            activationDelayEpochs: 3,
            maxLockEpochs: 35040
        });
    }

    function _sumLivePositionAmounts() internal view returns (uint256 total) {
        for (uint256 i; i < trackedPositions.length; ++i) {
            Position memory p = engine.positionOf(trackedPositions[i]);
            total += uint256(p.amount);
        }
    }

    function _sumLivePositionWeights() internal view returns (uint256 total) {
        for (uint256 i; i < trackedPositions.length; ++i) {
            Position memory p = engine.positionOf(trackedPositions[i]);
            total += uint256(p.weight);
        }
    }

    // ── Invariants ─────────────────────────────────────────────

    // 1. Fixed supply: token is mint-once, 1,000,000.
    function echidna_total_supply_fixed() external view returns (bool) {
        if (address(token) == address(0)) return true;
        return token.totalSupply() == MAX_SUPPLY;
    }

    // 2. Principal conservation: engine.totalLocked equals the sum of live position amounts.
    function echidna_total_locked_matches_positions() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return engine.totalLocked() == _sumLivePositionAmounts();
    }

    // 3. NARA solvency: engine holds enough NARA for principal + pending rewards.
    function echidna_engine_balance_covers_obligations() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        uint256 obligations = engine.totalLocked() + engine.totalPendingNaraRewards();
        return token.balanceOf(address(engine)) >= obligations;
    }

    // 4. Locked principal can never exceed total supply.
    function echidna_locked_not_exceed_supply() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return engine.totalLocked() <= MAX_SUPPLY;
    }

    // 5. Settled epoch never runs ahead of the wall-clock epoch.
    function echidna_settled_epoch_not_ahead() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return _settledEpoch() <= engine.currentEpoch();
    }

    // 6. Drip accounting: claimed NARA drip can never exceed paid NARA drip.
    function echidna_drip_claimed_le_paid() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return engine.totalNaraDripClaimed() <= engine.totalNaraDripPaid();
    }

    // 7. ETH reward accounting: claimed ETH rewards never exceed received ETH rewards.
    function echidna_eth_claimed_le_received() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return engine.totalEthRewardsClaimed() <= engine.totalEthRewardsReceived();
    }

    // 8. ETH solvency: engine ETH balance covers (received + held fees - claimed).
    //    Derived exactly from inflow/outflow counters; assert >= so donations stay safe.
    function echidna_eth_solvency() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        uint256 inflow = engine.totalEthRewardsReceived() + engine.accumulatedTreasuryEthFees();
        uint256 claimed = engine.totalEthRewardsClaimed();
        if (claimed > inflow) return false; // claimed must never exceed inflow
        return address(engine).balance >= inflow - claimed;
    }

    // 9. Active weight is bounded by the total weight of all live positions.
    function echidna_active_weight_bounded() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return engine.activeTotalWeight() <= _sumLivePositionWeights();
    }

    // 10. Every tracked (live) position has non-zero principal and weight.
    function echidna_live_positions_sane() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        for (uint256 i; i < trackedPositions.length; ++i) {
            Position memory p = engine.positionOf(trackedPositions[i]);
            if (p.amount == 0 || p.weight == 0) return false;
        }
        return true;
    }

    // 11. NARA reward index is monotonic non-decreasing within an action.
    function echidna_nara_index_monotonic() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return engine.naraIndexRay() >= _naraIdxBefore;
    }

    // 12. ETH reward index is monotonic non-decreasing within an action.
    function echidna_eth_index_monotonic() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return engine.ethIndexRay() >= _ethIdxBefore;
    }

    // 13. Position id only ever increases (never reused), and settled epoch never rewinds.
    function echidna_position_id_monotonic() external view returns (bool) {
        if (address(engine) == address(0)) return true;
        return engine.nextPositionId() >= _nextIdBefore
            && _settledEpoch() >= _settledEpochBefore;
    }

    function _settledEpoch() internal view returns (uint64 settled) {
        (bool ok, bytes memory data) =
            address(engine).staticcall(abi.encodeWithSelector(bytes4(keccak256("epochState()"))));
        if (!ok || data.length < 32) return 0;
        uint256 raw;
        assembly {
            raw := mload(add(data, 32))
        }
        settled = uint64(raw);
    }

    receive() external payable {}
}
