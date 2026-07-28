// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../NARAEngineTypes.sol";
import {NARAEngineModelLib} from "../libraries/NARAEngineModelLib.sol";

// ---------------------------------------------------------------
// Interfaces — must match the actual deployed contracts' ABI.
// EpochSnapshot layout must match NARAEngine exactly (19 fields).
// ---------------------------------------------------------------

struct LensEpochSnapshot {
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

interface ILensEngine {
    function NARA() external view returns (address);
    function currentEpoch() external view returns (uint64);
    function epochState() external view returns (LensEpochSnapshot memory);
    function config() external view returns (EngineConfig memory);
    function nextPositionId() external view returns (uint256);
    function positionOf(uint256 positionId) external view returns (Position memory);
    function activeTotalWeight() external view returns (uint256);
    function totalLocked() external view returns (uint256);
    function lockFeeBps() external view returns (uint16);
    function claimFeeBps() external view returns (uint16);
    function lockFeeWei() external view returns (uint96);
    function unlockFeeWei() external view returns (uint96);
    function claimableRewards(uint256 positionId) external view returns (uint256 naraAmount, uint256 ethAmount);
    function emissionReserve() external view returns (uint256);
    function rewardReserveAvailable() external view returns (uint256);
}

interface ILensNFT {
    function engine() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function positionIdOf(uint256 tokenId) external view returns (uint256);
    function positionInfo(uint256 tokenId) external view returns (Position memory);
    function claimableGenesisEth(uint256 tokenId) external view returns (uint256);
    function claimableGenesisToken(uint256 tokenId) external view returns (uint256);
    function naraClaimFeeBps() external view returns (uint16);
    function tokenClaimFeeBps() external view returns (uint16);
    function claimFeeRecipient() external view returns (address);
}

interface ILensRouter {
    function ENGINE() external view returns (address);
    function NFT() external view returns (address);
}

/// @title NARA Dashboard Lens
/// @notice Read-only aggregator. Collapses the 17+ fan-out contract reads the
/// lockboard performs on page-load into a single eth_call. No state. No admin.
/// @dev Accepts explicit positionIds so the contract avoids iterating unknown ranges.
/// The frontend supplies positionIds from event logs or a prior scan.
contract NARADashboardLens {

    // ---------------------------------------------------------------
    // Output structs
    // ---------------------------------------------------------------

    struct EpochState {
        uint64  currentEpoch;
        uint64  settledEpoch;
        uint256 backlog;
        bool    syncRequired;
    }

    struct FeeConfig {
        uint16  lockFeeBps;
        uint16  claimFeeBps;
        uint96  lockFeeWei;
        uint96  unlockFeeWei;
        uint64  maxLockEpochs;
        uint64  activationDelayEpochs;
        // Wrapper-level claim fees (NARAPositionNFTV4). Apply only to claims routed
        // through the NFT wrapper; engine.lock() EOA positions are not affected.
        uint16  naraClaimFeeBps;
        uint16  tokenClaimFeeBps;
        address claimFeeRecipient;
    }

    struct PositionState {
        uint256 positionId;
        address owner;
        uint64  activationEpoch;
        uint64  unlockEpoch;
        uint128 amount;
        uint128 weight;
        uint256 claimableNara;
        uint256 claimableEth;
        bool    active;
        bool    matured;
    }

    struct NftPositionState {
        uint256 tokenId;
        uint256 positionId;
        address owner;
        uint64  activationEpoch;
        uint64  unlockEpoch;
        uint128 amount;
        uint128 weight;
        uint256 claimableNara;
        uint256 claimableEth;
        uint256 claimableGenesisEth;
        uint256 claimableGenesisToken;
        bool    active;
        bool    matured;
        bool    exists;
    }

    struct UserDashboardState {
        // Wallet
        uint256 ethBalance;
        uint256 naraBalance;
        uint256 naraAllowanceEngine;
        uint256 naraAllowanceRouter;

        // Epoch
        EpochState epoch;

        // Engine config
        FeeConfig fees;

        // Protocol totals
        uint256 activeTotalWeight;
        uint256 totalLocked;
        uint256 emissionReserveAvailable;
        uint256 rewardReserveAvailable;

        // Direct engine positions (owner = user)
        PositionState[] positions;

        // NFT-wrapped positions
        NftPositionState[] nftPositions;
    }

    // ---------------------------------------------------------------
    // Immutables
    // ---------------------------------------------------------------

    ILensEngine public immutable ENGINE;
    ILensNFT    public immutable NFT;
    address     public immutable ROUTER;

    error LensZeroAddress();
    error LensNotAContract();
    error LensPairingMismatch();

    constructor(address engine_, address nft_, address router_) {
        if (engine_ == address(0) || nft_ == address(0) || router_ == address(0)) revert LensZeroAddress();
        if (engine_.code.length == 0 || nft_.code.length == 0 || router_.code.length == 0) revert LensNotAContract();
        if (
            ILensNFT(nft_).engine() != engine_ ||
            ILensRouter(router_).ENGINE() != engine_ ||
            ILensRouter(router_).NFT() != nft_
        ) revert LensPairingMismatch();
        ENGINE = ILensEngine(engine_);
        NFT    = ILensNFT(nft_);
        ROUTER = router_;
    }

    // ---------------------------------------------------------------
    // Primary read: one call per page load
    // ---------------------------------------------------------------

    /// @notice Returns all state needed to render the dashboard in a single eth_call.
    /// @param user          Wallet address.
    /// @param positionIds   Direct engine positionIds owned by `user`. Supplied by the
    ///                      frontend from Locked event logs. Max 100.
    /// @param nftTokenIds   NARAPositionNFTV4 tokenIds owned by `user`. Max 100.
    function getUserState(
        address user,
        uint256[] calldata positionIds,
        uint256[] calldata nftTokenIds
    ) external view returns (UserDashboardState memory s) {
        address nara = ENGINE.NARA();
        LensEpochSnapshot memory snap = ENGINE.epochState();
        uint64 live = ENGINE.currentEpoch();

        // Wallet
        s.ethBalance          = user.balance;
        s.naraBalance         = IERC20(nara).balanceOf(user);
        s.naraAllowanceEngine = IERC20(nara).allowance(user, address(ENGINE));
        s.naraAllowanceRouter = IERC20(nara).allowance(user, ROUTER);

        // Epoch
        s.epoch = EpochState({
            currentEpoch:  live,
            settledEpoch:  snap.epoch,
            backlog:       live > snap.epoch ? uint256(live - snap.epoch) : 0,
            syncRequired:  live > snap.epoch
        });

        // Fees + config
        EngineConfig memory cfg = ENGINE.config();
        s.fees = FeeConfig({
            lockFeeBps:             ENGINE.lockFeeBps(),
            claimFeeBps:            ENGINE.claimFeeBps(),
            lockFeeWei:             ENGINE.lockFeeWei(),
            unlockFeeWei:           ENGINE.unlockFeeWei(),
            maxLockEpochs:          cfg.maxLockEpochs,
            activationDelayEpochs:  cfg.activationDelayEpochs,
            naraClaimFeeBps:        NFT.naraClaimFeeBps(),
            tokenClaimFeeBps:       NFT.tokenClaimFeeBps(),
            claimFeeRecipient:      NFT.claimFeeRecipient()
        });

        // Protocol totals
        s.activeTotalWeight        = ENGINE.activeTotalWeight();
        s.totalLocked              = ENGINE.totalLocked();
        s.emissionReserveAvailable = ENGINE.emissionReserve();
        s.rewardReserveAvailable   = ENGINE.rewardReserveAvailable();

        // Direct positions (cap at 100 for gas safety)
        uint256 posLen = positionIds.length > 100 ? 100 : positionIds.length;
        s.positions = new PositionState[](posLen);
        for (uint256 i; i < posLen; ) {
            s.positions[i] = _positionState(positionIds[i], snap.epoch);
            unchecked { ++i; }
        }

        // NFT positions (cap at 100)
        uint256 nftLen = nftTokenIds.length > 100 ? 100 : nftTokenIds.length;
        s.nftPositions = new NftPositionState[](nftLen);
        for (uint256 i; i < nftLen; ) {
            s.nftPositions[i] = _nftPositionState(nftTokenIds[i], snap.epoch);
            unchecked { ++i; }
        }
    }

    // ---------------------------------------------------------------
    // Standalone helpers
    // ---------------------------------------------------------------

    /// @notice Epoch state only — cheap call for the auto-sync effect.
    function getEpochState() external view returns (EpochState memory) {
        uint64 live    = ENGINE.currentEpoch();
        uint64 settled = ENGINE.epochState().epoch;
        return EpochState({
            currentEpoch:  live,
            settledEpoch:  settled,
            backlog:       live > settled ? uint256(live - settled) : 0,
            syncRequired:  live > settled
        });
    }

    /// @notice Preview weight and net NARA after fees for a prospective lock.
    function previewLock(uint256 amount, uint64 durationEpochs)
        external view returns (uint256 netAmount, uint256 weight, uint256 lockFeeEth)
    {
        uint16 feeBps = ENGINE.lockFeeBps();
        uint256 feeAmount = (amount * feeBps) / 10_000;
        netAmount  = amount - feeAmount;
        weight     = NARAEngineModelLib.computeWeight(ENGINE.config(), netAmount, durationEpochs);
        lockFeeEth = ENGINE.lockFeeWei();
    }

    // ---------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------

    function _positionState(uint256 positionId, uint64 settledEpoch)
        internal view returns (PositionState memory ps)
    {
        Position memory p = ENGINE.positionOf(positionId);
        ps.positionId      = positionId;
        ps.owner           = p.owner;
        ps.activationEpoch = p.activationEpoch;
        ps.unlockEpoch     = p.unlockEpoch;
        ps.amount          = p.amount;
        ps.weight          = p.weight;
        ps.active          = settledEpoch >= p.activationEpoch && settledEpoch < p.unlockEpoch;
        ps.matured         = p.unlockEpoch != 0 && settledEpoch >= p.unlockEpoch;
        if (p.amount != 0) {
            (ps.claimableNara, ps.claimableEth) = ENGINE.claimableRewards(positionId);
        }
    }

    function _nftPositionState(uint256 tokenId, uint64 settledEpoch)
        internal view returns (NftPositionState memory ns)
    {
        ns.tokenId         = tokenId;
        Position memory p;
        try NFT.positionInfo(tokenId) returns (Position memory position) {
            p = position;
            ns.exists = true;
        } catch {
            return ns;
        }
        uint256 positionId = NFT.positionIdOf(tokenId);
        ns.positionId      = positionId;
        ns.owner           = NFT.ownerOf(tokenId);
        ns.activationEpoch = p.activationEpoch;
        ns.unlockEpoch     = p.unlockEpoch;
        ns.amount          = p.amount;
        ns.weight          = p.weight;
        ns.active          = settledEpoch >= p.activationEpoch && settledEpoch < p.unlockEpoch;
        ns.matured         = p.unlockEpoch != 0 && settledEpoch >= p.unlockEpoch;
        if (positionId != 0) {
            (ns.claimableNara, ns.claimableEth) = ENGINE.claimableRewards(positionId);
        }
        // Best-effort genesis reads (returns 0 for non-genesis tokens)
        try NFT.claimableGenesisEth(tokenId) returns (uint256 v) { ns.claimableGenesisEth = v; } catch {}
        try NFT.claimableGenesisToken(tokenId) returns (uint256 v) { ns.claimableGenesisToken = v; } catch {}
    }
}
