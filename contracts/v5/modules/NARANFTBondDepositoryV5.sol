// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {INARAPositionControllerV5} from "../interfaces/modules/INARAPositionControllerV5.sol";
import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";
import {INARABondInventoryVaultV5} from "../interfaces/modules/INARABondInventoryVaultV5.sol";

/// @dev Local read-only boundary used to prove that every permitted bond lock
///      is also accepted by the immutable V5 Engine and to quote epoch alignment.
interface INARABondEngineBoundsV5 {
    function token() external view returns (address);
    function epochOrigin() external view returns (uint64);
    function epochLength() external view returns (uint64);
    function minLockDuration() external view returns (uint64);
    function maxLockDuration() external view returns (uint64);
}

/// @notice Canonical NFT-only V5 bond depository.
/// @dev It deploys closed with zero live capacity. One exact-lifetime-capacity
///      term may be queued, funded, activated, and terminally finalized. Immutable
///      trade and price floors plus an exact payment lattice bound the term authority.
contract NARANFTBondDepositoryV5 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant MIN_ACTIVATION_DELAY = 1 hours;
    uint64 public constant MAX_ACTIVATION_DELAY = 365 days;
    uint64 public constant MAX_LOCK_DURATION = 20 * 365 days;
    uint64 public constant MAX_TERM_DURATION_HARD_CAP = 30 days;
    uint64 public constant MIN_INVENTORY_RECOVERY_DELAY = 1 hours;
    uint64 public constant MAX_INVENTORY_RECOVERY_DELAY = 365 days;

    enum Lifecycle {
        Unconfigured,
        Queued,
        Active,
        Finalized
    }

    enum FinalizationReason {
        None,
        SoldOut,
        AdminCancelled,
        Expired,
        AdminClosed
    }

    struct Terms {
        uint128 capacity;
        uint128 minPayment;
        uint128 maxPayment;
        uint128 payoutNumerator;
        uint128 payoutDenominator;
        uint64 lockDurationSeconds;
        uint64 startsAt;
        uint64 endsAt;
    }

    struct BuyProtection {
        uint256 minimumPayout;
        uint64 deadline;
        uint64 maximumUnlockAt;
        bytes32 expectedTermsHash;
    }

    error InvalidAddress();
    error InvalidBounds();
    error Unauthorized();
    error AlreadyBound();
    error InventoryNotBound();
    error InvalidInventory();
    error TermsAlreadyQueued();
    error InvalidTerms();
    error ActivationPending();
    error InventoryNotFunded();
    error MarketNotOpen();
    error MarketExpired();
    error PermanentlyClosed();
    error InvalidLifecycle();
    error DeadlineExpired();
    error TermsHashMismatch();
    error UnlockTimeExceeded();
    error SlippageExceeded();
    error UnexpectedPosition();
    error UnsupportedTokenBehavior();
    error EtherNotAccepted();

    address public immutable token;
    address public immutable paymentToken;
    address public immutable positionController;
    address public immutable engine;
    address public immutable configurationAuthority;
    address public immutable treasury;
    uint64 public immutable activationDelay;
    uint64 public immutable maximumTermDuration;
    address public immutable inventoryRecoveryRecipient;
    uint64 public immutable inventoryRecoveryDelay;
    uint128 public immutable maximumCapacity;
    uint128 public immutable minimumPayment;
    uint128 public immutable maximumPayment;
    uint128 public immutable minimumPayout;
    uint128 public immutable minimumPaymentPerPayoutNumerator;
    uint128 public immutable minimumPaymentPerPayoutDenominator;
    uint64 public immutable minimumLockDuration;
    uint64 public immutable maximumLockDuration;
    uint64 public immutable engineEpochOrigin;
    uint64 public immutable engineEpochLength;

    address public inventoryVault;
    Terms public terms;
    bytes32 public termsHash;
    uint64 public activationEta;
    uint64 public finalizedAt;
    uint256 public totalPayout;
    bool public termsQueued;
    bool public permanentlyClosed;
    Lifecycle public lifecycle;
    FinalizationReason public finalizationReason;

    event InventoryBound(address indexed inventoryVault);
    event TermsQueued(bytes32 indexed termsHash, uint64 activationEta);
    event Activated(uint128 capacity, uint64 startsAt, uint64 endsAt);
    event BondPurchased(
        address indexed buyer,
        address indexed recipient,
        uint256 paymentAmount,
        uint256 payout,
        uint256 indexed positionId,
        uint64 unlockAt,
        bytes32 termsHash
    );
    event Finalized(FinalizationReason indexed reason, address indexed caller, uint64 finalizedAt, uint256 unsold);

    constructor(
        address token_,
        address paymentToken_,
        address positionController_,
        address configurationAuthority_,
        address treasury_,
        uint64 activationDelay_,
        uint128 maximumCapacity_,
        uint128 minimumPayment_,
        uint128 maximumPayment_,
        uint128 minimumPayout_,
        uint128 minimumPaymentPerPayoutNumerator_,
        uint128 minimumPaymentPerPayoutDenominator_,
        uint64 minimumLockDuration_,
        uint64 maximumLockDuration_,
        uint64 maximumTermDuration_,
        address inventoryRecoveryRecipient_,
        uint64 inventoryRecoveryDelay_
    ) {
        if (
            token_ == address(0) || paymentToken_ == address(0) || positionController_ == address(0)
                || configurationAuthority_ == address(0) || treasury_ == address(0)
                || inventoryRecoveryRecipient_ == address(0)
                || inventoryRecoveryRecipient_ == address(this)
        ) revert InvalidAddress();
        if (token_.code.length == 0 || paymentToken_.code.length == 0 || positionController_.code.length == 0) {
            revert InvalidAddress();
        }
        if (INARAPositionControllerV5(positionController_).token() != token_) revert InvalidAddress();
        if (
            activationDelay_ < MIN_ACTIVATION_DELAY || activationDelay_ > MAX_ACTIVATION_DELAY
                || maximumTermDuration_ == 0 || maximumTermDuration_ > MAX_TERM_DURATION_HARD_CAP
                || inventoryRecoveryDelay_ < MIN_INVENTORY_RECOVERY_DELAY
                || inventoryRecoveryDelay_ > MAX_INVENTORY_RECOVERY_DELAY
                || maximumCapacity_ == 0
                || minimumPayment_ == 0 || minimumPayment_ > maximumPayment_ || minimumPayout_ == 0
                || minimumPayout_ > maximumCapacity_ || minimumPaymentPerPayoutNumerator_ == 0
                || minimumPaymentPerPayoutDenominator_ == 0 || minimumLockDuration_ == 0
                || minimumLockDuration_ > maximumLockDuration_ || maximumLockDuration_ > MAX_LOCK_DURATION
        ) revert InvalidBounds();

        INARAPositionControllerV5 controller = INARAPositionControllerV5(positionController_);
        address engine_ = controller.engine();
        if (engine_ == address(0) || engine_.code.length == 0) revert InvalidAddress();
        INARABondEngineBoundsV5 engineBounds = INARABondEngineBoundsV5(engine_);
        if (engineBounds.token() != token_) revert InvalidAddress();
        uint64 engineMinLock = engineBounds.minLockDuration();
        uint64 engineMaxLock = engineBounds.maxLockDuration();
        uint64 engineEpochLength_ = engineBounds.epochLength();
        if (
            minimumLockDuration_ < engineMinLock || maximumLockDuration_ > engineMaxLock
                || engineEpochLength_ == 0
        ) revert InvalidBounds();

        token = token_;
        paymentToken = paymentToken_;
        positionController = positionController_;
        engine = engine_;
        configurationAuthority = configurationAuthority_;
        treasury = treasury_;
        activationDelay = activationDelay_;
        maximumTermDuration = maximumTermDuration_;
        inventoryRecoveryRecipient = inventoryRecoveryRecipient_;
        inventoryRecoveryDelay = inventoryRecoveryDelay_;
        maximumCapacity = maximumCapacity_;
        minimumPayment = minimumPayment_;
        maximumPayment = maximumPayment_;
        minimumPayout = minimumPayout_;
        minimumPaymentPerPayoutNumerator = minimumPaymentPerPayoutNumerator_;
        minimumPaymentPerPayoutDenominator = minimumPaymentPerPayoutDenominator_;
        minimumLockDuration = minimumLockDuration_;
        maximumLockDuration = maximumLockDuration_;
        engineEpochOrigin = engineBounds.epochOrigin();
        engineEpochLength = engineEpochLength_;
    }

    /// @dev Worst case is bounded to binding one vault that is reciprocally sealed to this depository.
    function bindInventoryVault(address inventoryVault_) external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (lifecycle == Lifecycle.Finalized) revert PermanentlyClosed();
        if (lifecycle != Lifecycle.Unconfigured) revert InvalidLifecycle();
        if (inventoryVault != address(0)) revert AlreadyBound();
        if (inventoryVault_ == address(0) || inventoryVault_.code.length == 0) revert InvalidInventory();
        INARABondInventoryVaultV5 vault = INARABondInventoryVaultV5(inventoryVault_);
        if (
            vault.token() != token || vault.depository() != address(this) || vault.allocation() != maximumCapacity
                || vault.fundingAuthority() != treasury
                || vault.recoveryRecipient() != inventoryRecoveryRecipient
                || vault.recoveryDelay() != inventoryRecoveryDelay
        ) {
            revert InvalidInventory();
        }
        inventoryVault = inventoryVault_;
        emit InventoryBound(inventoryVault_);
    }

    /// @dev Worst case is bounded by immutable capacity, trade, price, and duration bounds.
    function queueTerms(Terms calldata terms_) external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (lifecycle == Lifecycle.Finalized) revert PermanentlyClosed();
        if (lifecycle != Lifecycle.Unconfigured) revert TermsAlreadyQueued();
        if (inventoryVault == address(0)) revert InventoryNotBound();
        if (termsQueued) revert TermsAlreadyQueued();

        uint64 eta = uint64(block.timestamp + activationDelay);
        if (
            terms_.capacity != maximumCapacity || terms_.minPayment == 0
                || terms_.minPayment < minimumPayment || terms_.minPayment > terms_.maxPayment
                || terms_.maxPayment > maximumPayment || terms_.maxPayment % terms_.minPayment != 0
                || terms_.payoutNumerator == 0 || terms_.payoutDenominator == 0
                || terms_.lockDurationSeconds < minimumLockDuration
                || terms_.lockDurationSeconds > maximumLockDuration
                || terms_.startsAt < eta || terms_.startsAt < engineEpochOrigin
                || uint256(terms_.startsAt) > uint256(eta) + maximumTermDuration
                || terms_.endsAt <= terms_.startsAt
                || uint256(terms_.endsAt) - terms_.startsAt > maximumTermDuration
        ) revert InvalidTerms();

        // Actual payment/payout is payoutDenominator/payoutNumerator. Keep it
        // at or above the immutable, human-approved economic price floor.
        if (
            uint256(terms_.payoutDenominator) * minimumPaymentPerPayoutDenominator
                < uint256(terms_.payoutNumerator) * minimumPaymentPerPayoutNumerator
        ) revert InvalidTerms();

        // The market accepts exact multiples of minPayment. Requiring that the
        // minimum trade converts without rounding and that capacity is a
        // multiple of that payout makes every positive residual capacity
        // independently fillable without capping output or overcharging.
        if (mulmod(terms_.minPayment, terms_.payoutNumerator, terms_.payoutDenominator) != 0) {
            revert InvalidTerms();
        }
        uint256 minimumTradePayout =
            Math.mulDiv(terms_.minPayment, terms_.payoutNumerator, terms_.payoutDenominator);
        uint256 maximumTradePayout =
            Math.mulDiv(terms_.maxPayment, terms_.payoutNumerator, terms_.payoutDenominator);
        if (
            minimumTradePayout < minimumPayout || minimumTradePayout > terms_.capacity
                || maximumTradePayout > terms_.capacity
                || uint256(terms_.capacity) % minimumTradePayout != 0
        ) revert InvalidTerms();

        terms = terms_;
        activationEta = eta;
        termsQueued = true;
        lifecycle = Lifecycle.Queued;
        termsHash = keccak256(
            abi.encode(keccak256("NARA_BOND_TERMS_V5"), block.chainid, address(this), terms_)
        );
        emit TermsQueued(termsHash, eta);
    }

    function activateTerms() external {
        if (lifecycle == Lifecycle.Finalized) revert PermanentlyClosed();
        if (lifecycle != Lifecycle.Queued) revert MarketNotOpen();
        if (block.timestamp < activationEta || block.timestamp < terms.startsAt) revert ActivationPending();
        if (block.timestamp > terms.endsAt) revert MarketExpired();
        INARABondInventoryVaultV5 vault = INARABondInventoryVaultV5(inventoryVault);
        if (!vault.funded() || IERC20(token).balanceOf(inventoryVault) < maximumCapacity) {
            revert InventoryNotFunded();
        }
        lifecycle = Lifecycle.Active;
        emit Activated(terms.capacity, terms.startsAt, terms.endsAt);
    }

    function buy(uint256 paymentAmount, address recipient, BuyProtection calldata protection)
        external
        nonReentrant
        returns (uint256 payout, uint256 positionId, uint64 unlockAt)
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (block.timestamp > protection.deadline) revert DeadlineExpired();
        if (protection.expectedTermsHash != termsHash) revert TermsHashMismatch();

        uint256 remainingAfter;
        (payout, remainingAfter, unlockAt,) = _previewBuy(paymentAmount);
        if (payout < protection.minimumPayout) revert SlippageExceeded();
        if (unlockAt > protection.maximumUnlockAt) revert UnlockTimeExceeded();
        uint256 nextPayout = totalPayout + payout;
        totalPayout = nextPayout;

        IERC20 payment = IERC20(paymentToken);
        uint256 treasuryBefore = payment.balanceOf(treasury);
        payment.safeTransferFrom(msg.sender, treasury, paymentAmount);
        if (payment.balanceOf(treasury) - treasuryBefore != paymentAmount) revert UnsupportedTokenBehavior();

        INARABondInventoryVaultV5(inventoryVault).pull(address(this), payout);
        IERC20(token).forceApprove(positionController, payout);
        INARAPositionControllerV5 controller = INARAPositionControllerV5(positionController);
        address account;
        (positionId, account) = controller.mintPosition(recipient, payout, terms.lockDurationSeconds);
        IERC20(token).forceApprove(positionController, 0);

        (address observedAccount, INARAPositionEngineV5.PositionState memory state) =
            controller.positionData(positionId);
        if (
            account == address(0) || observedAccount != account || controller.accountFor(positionId) != account
                || controller.ownerOf(positionId) != recipient || state.owner != account || state.principal != payout
                || state.openedAt != uint64(block.timestamp) || state.unlockAt != unlockAt || !state.active
        ) revert UnexpectedPosition();

        if (remainingAfter == 0) _finalize(FinalizationReason.SoldOut);
        emit BondPurchased(msg.sender, recipient, paymentAmount, payout, positionId, unlockAt, termsHash);
    }

    /// @notice Cancels the one queued campaign before activation.
    /// @dev Worst case is permanent cancellation; inventory remains protected by
    ///      the Vault's immutable delayed recovery policy.
    function cancelQueuedTerms() external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (lifecycle == Lifecycle.Finalized) revert PermanentlyClosed();
        if (lifecycle != Lifecycle.Queued) revert InvalidLifecycle();
        if (block.timestamp > terms.endsAt) revert MarketExpired();
        _finalize(FinalizationReason.AdminCancelled);
    }

    /// @notice Permissionlessly finalizes a queued or active expired campaign.
    function finalizeExpired() external {
        if (lifecycle == Lifecycle.Finalized) revert PermanentlyClosed();
        if (lifecycle != Lifecycle.Queued && lifecycle != Lifecycle.Active) revert InvalidLifecycle();
        if (block.timestamp <= terms.endsAt) revert MarketNotOpen();
        _finalize(FinalizationReason.Expired);
    }

    /// @dev Worst case is permanent closure of an active campaign or an
    ///      unconfigured module; it cannot move inventory or reopen/change terms.
    function closePermanently() external {
        if (msg.sender != configurationAuthority) revert Unauthorized();
        if (lifecycle == Lifecycle.Finalized) revert PermanentlyClosed();
        if (lifecycle == Lifecycle.Queued) revert InvalidLifecycle();
        if (lifecycle == Lifecycle.Active && block.timestamp > terms.endsAt) revert MarketExpired();
        _finalize(FinalizationReason.AdminClosed);
    }

    function active() public view returns (bool) {
        return lifecycle == Lifecycle.Active && block.timestamp >= terms.startsAt && block.timestamp <= terms.endsAt;
    }

    function remainingCapacity() external view returns (uint256) {
        if (!active()) return 0;
        return uint256(terms.capacity) - totalPayout;
    }

    function inventoryFundingAllowed() external view returns (bool) {
        return lifecycle == Lifecycle.Queued && block.timestamp <= terms.endsAt;
    }

    function previewBuy(uint256 paymentAmount)
        external
        view
        returns (uint256 payout, uint256 remainingCapacityAfter, uint64 unlockAt, bytes32 currentTermsHash)
    {
        return _previewBuy(paymentAmount);
    }

    function _previewBuy(uint256 paymentAmount)
        internal
        view
        returns (uint256 payout, uint256 remainingCapacityAfter, uint64 unlockAt, bytes32 currentTermsHash)
    {
        if (!active()) revert MarketNotOpen();
        if (
            paymentAmount < terms.minPayment || paymentAmount > terms.maxPayment
                || paymentAmount % terms.minPayment != 0
        ) revert InvalidTerms();

        payout = Math.mulDiv(paymentAmount, terms.payoutNumerator, terms.payoutDenominator);
        uint256 remainingBefore = uint256(terms.capacity) - totalPayout;
        if (payout == 0 || payout > remainingBefore) revert SlippageExceeded();
        remainingCapacityAfter = remainingBefore - payout;
        unlockAt = _alignedUnlockAt(uint64(block.timestamp), terms.lockDurationSeconds);
        currentTermsHash = termsHash;
    }

    function _alignedUnlockAt(uint64 openedAt, uint64 duration) internal view returns (uint64 unlockAt) {
        uint256 candidate = uint256(openedAt) + duration;
        if (candidate <= engineEpochOrigin) revert InvalidTerms();
        uint256 elapsed = candidate - engineEpochOrigin;
        uint256 epoch = (elapsed + engineEpochLength - 1) / engineEpochLength;
        uint256 timestamp = uint256(engineEpochOrigin) + epoch * engineEpochLength;
        if (timestamp > type(uint64).max) revert InvalidTerms();
        unlockAt = uint64(timestamp);
    }

    function _finalize(FinalizationReason reason) internal {
        lifecycle = Lifecycle.Finalized;
        finalizationReason = reason;
        finalizedAt = uint64(block.timestamp);
        permanentlyClosed = true;
        emit Finalized(reason, msg.sender, finalizedAt, uint256(maximumCapacity) - totalPayout);
    }

    receive() external payable {
        revert EtherNotAccepted();
    }
}
