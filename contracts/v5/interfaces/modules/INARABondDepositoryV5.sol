// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INARABondDepositoryV5 {
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

    function token() external view returns (address);
    function maximumCapacity() external view returns (uint128);
    function inventoryRecoveryRecipient() external view returns (address);
    function inventoryRecoveryDelay() external view returns (uint64);
    function inventoryVault() external view returns (address);
    function inventoryFundingAllowed() external view returns (bool);
    function termsQueued() external view returns (bool);
    function termsHash() external view returns (bytes32);
    function lifecycle() external view returns (Lifecycle);
    function finalizationReason() external view returns (FinalizationReason);
    function finalizedAt() external view returns (uint64);
    function active() external view returns (bool);
    function permanentlyClosed() external view returns (bool);
    function remainingCapacity() external view returns (uint256);
    function totalPayout() external view returns (uint256);

    function bindInventoryVault(address inventoryVault_) external;
    function queueTerms(Terms calldata terms_) external;
    function activateTerms() external;
    function cancelQueuedTerms() external;
    function finalizeExpired() external;
    function closePermanently() external;
    function previewBuy(uint256 paymentAmount)
        external
        view
        returns (uint256 payout, uint256 remainingCapacityAfter, uint64 unlockAt, bytes32 currentTermsHash);
    function buy(uint256 paymentAmount, address recipient, BuyProtection calldata protection)
        external
        returns (uint256 payout, uint256 positionId, uint64 unlockAt);
}
