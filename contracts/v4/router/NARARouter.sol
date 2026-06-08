// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ---------------------------------------------------------------
// Interfaces (minimal — only the calls the router makes)
// ---------------------------------------------------------------

/// @dev EpochSnapshot must match NARAEngine's layout exactly (19 fields).
struct RouterEpochSnapshot {
    uint64  epoch;
    uint64  timestamp;
    uint256 circulatingSupply;
    uint256 totalLocked;
    uint256 activeTotalWeight;
    uint256 weightedLockShareWad;
    uint256 stressWad;
    uint256 betaWad;
    uint256 horizon;
    uint256 retentionWad;
    uint256 baseEmission;
    uint256 emission;
    uint256 admittedSupply;
    uint256 distributedNara;
    uint256 distributedEth;
    uint256 treasuryAmount;
    uint256 warmupFactorWad;
    uint256 bootstrapWeight;
    uint256 heartbeat;
}

interface IRouterEngine {
    function NARA() external view returns (address);
    function currentEpoch() external view returns (uint64);
    function epochStateView() external view returns (RouterEpochSnapshot memory);
    function advanceEpochs(uint256 maxSteps)
        external returns (uint256 stepsAdvanced, RouterEpochSnapshot memory);
    function lockFor(address owner, uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external payable returns (uint256 positionId);
}

interface IRouterNFT {
    function engine() external view returns (address);
    function mintAndLockFor(address recipient, uint256 amount, uint64 durationEpochs, uint256 minWeight)
        external payable returns (uint256 tokenId, uint256 positionId);
}

/// @title NARA Router
/// @notice Thin, stateless convenience wrapper around NARAEngine and NARAPositionNFTV4.
/// @dev
/// Bundles permit + sync + lock so a user executes one transaction instead of three.
/// For Base Smart Wallet users, batching is done at the wallet layer (EIP-5792);
/// this router primarily serves regular-EOA users.
///
/// The router never holds NARA across transactions. NARA is pulled from the user
/// and forwarded within the same call.
///
/// syncEpochs() (both arities) is the keeper-elimination mechanism. It calls
/// engine.advanceEpochs(backlog) with no artificial cap. Any permissionless caller
/// (including Base Smart Wallet page-load auto-fire) can clear arbitrary backlog.
///
/// No admin role. No pause. No upgrade. No held balances.
contract NARARouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Immutables
    // ---------------------------------------------------------------

    IRouterEngine public immutable ENGINE;
    IRouterNFT    public immutable NFT;
    IERC20        public immutable NARA_TOKEN;

    error RouterZeroAddress();
    error RouterNotAContract();
    error RouterPairingMismatch();

    constructor(address engine_, address nft_) {
        if (engine_ == address(0) || nft_ == address(0)) revert RouterZeroAddress();
        if (engine_.code.length == 0 || nft_.code.length == 0) revert RouterNotAContract();
        if (IRouterNFT(nft_).engine() != engine_) revert RouterPairingMismatch();
        ENGINE     = IRouterEngine(engine_);
        NFT        = IRouterNFT(nft_);
        NARA_TOKEN = IERC20(IRouterEngine(engine_).NARA());
    }

    // ---------------------------------------------------------------
    // Keeper-elimination: permissionless epoch sync
    // ---------------------------------------------------------------

    /// @notice Advance all pending epochs. Permissionless. No-op when already current.
    /// @dev Reads live vs. settled epoch, then calls engine.advanceEpochs(backlog).
    /// Because engine.advanceEpochs has no per-call cap (only block gas constrains it),
    /// a single call can clear arbitrary backlog. This is the replacement for the
    /// off-chain Railway cron keeper.
    function syncEpochs() external nonReentrant returns (uint256 stepsAdvanced) {
        uint64 live    = ENGINE.currentEpoch();
        uint64 settled = ENGINE.epochStateView().epoch;
        if (live <= settled) return 0;
        (stepsAdvanced,) = ENGINE.advanceEpochs(uint256(live - settled));
    }

    /// @notice Advance at most `maxSteps` pending epochs. Useful for very large backlogs
    /// that would exceed block gas in a single call. Chain multiple calls until
    /// syncEpochs() returns 0.
    function syncEpochs(uint256 maxSteps) external nonReentrant returns (uint256 stepsAdvanced) {
        if (maxSteps == 0) return 0;
        uint64 live    = ENGINE.currentEpoch();
        uint64 settled = ENGINE.epochStateView().epoch;
        if (live <= settled) return 0;
        uint256 backlog = uint256(live - settled);
        uint256 steps   = maxSteps < backlog ? maxSteps : backlog;
        (stepsAdvanced,) = ENGINE.advanceEpochs(steps);
    }

    // ---------------------------------------------------------------
    // Direct engine lock: permit + sync + lock in one tx
    // ---------------------------------------------------------------

    /// @notice Sign a NARA ERC-2612 permit with spender=router, call this once,
    /// and the engine position is created for msg.sender in one transaction.
    /// @dev Permit is best-effort (swallowed if already approved).
    ///      lockFeeWei must equal msg.value exactly — same as calling engine.lockFor directly.
    /// @param amount     Gross NARA amount (before engine lockFeeBps).
    /// @param minWeight  Slippage guard; 0 = no guard.
    function syncAndLockWithPermit(
        uint256 amount,
        uint64  durationEpochs,
        uint256 minWeight,
        uint256 deadline,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant returns (uint256 positionId) {
        // 1. Sync epochs (no-op if current).
        _syncAll();

        // 2. Permit: owner=user, spender=router (best-effort).
        try IERC20Permit(address(NARA_TOKEN)).permit(msg.sender, address(this), amount, deadline, v, r, s) {}
        catch {}

        // 3. Pull NARA from user → router.
        NARA_TOKEN.safeTransferFrom(msg.sender, address(this), amount);

        // 4. Approve engine for exactly amount, then forward to lockFor.
        //    lockFor pulls from msg.sender (= router) and creates position owned by owner.
        NARA_TOKEN.forceApprove(address(ENGINE), amount);
        positionId = ENGINE.lockFor{value: msg.value}(msg.sender, amount, durationEpochs, minWeight);
        NARA_TOKEN.forceApprove(address(ENGINE), 0);
    }

    // ---------------------------------------------------------------
    // NFT-wrapped lock: permit + sync + mintAndLockFor in one tx
    // ---------------------------------------------------------------

    /// @notice Same flow as syncAndLockWithPermit but delivers an NFT-wrapped position.
    ///         The caller receives a NARAPositionNFTV4 token instead of a raw positionId.
    /// @dev    NFT.mintAndLockFor pulls from msg.sender (= router), so router approves NFT.
    function syncAndMintAndLockWithPermit(
        uint256 amount,
        uint64  durationEpochs,
        uint256 minWeight,
        uint256 deadline,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external payable nonReentrant returns (uint256 tokenId, uint256 positionId) {
        // 1. Sync epochs.
        _syncAll();

        // 2. Permit (best-effort).
        try IERC20Permit(address(NARA_TOKEN)).permit(msg.sender, address(this), amount, deadline, v, r, s) {}
        catch {}

        // 3. Pull NARA from user → router.
        NARA_TOKEN.safeTransferFrom(msg.sender, address(this), amount);

        // 4. Approve NFT factory, mint+lock for caller, then clear approval.
        NARA_TOKEN.forceApprove(address(NFT), amount);
        (tokenId, positionId) = NFT.mintAndLockFor{value: msg.value}(msg.sender, amount, durationEpochs, minWeight);
        NARA_TOKEN.forceApprove(address(NFT), 0);
    }

    // ---------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------

    /// @dev Syncs all pending epochs. Called at the top of every mutator so the
    /// engine is always current before any state-modifying downstream call.
    function _syncAll() internal {
        uint64 live    = ENGINE.currentEpoch();
        uint64 settled = ENGINE.epochStateView().epoch;
        if (live > settled) {
            ENGINE.advanceEpochs(uint256(live - settled));
        }
    }
}
