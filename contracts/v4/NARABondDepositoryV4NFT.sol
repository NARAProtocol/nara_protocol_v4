// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {EngineConfig} from "./NARAEngineTypes.sol";

interface INARAEngineV4BondNFT {
    function lockFeeWei() external view returns (uint96);
    function lockFeeBps() external view returns (uint16);
    function notifyEthRewards() external payable;
    function config() external view returns (EngineConfig memory);
}

interface INARABondVaultV4NFT {
    function availableToPull() external view returns (uint256);
    function pullToMarket(uint256 amount) external;
    function returnUnsold(uint256 amount) external;
}

interface INARAPositionNFTV4Bond {
    function mintGenesisAndLockFor(
        address recipient,
        uint256 amount,
        uint64 durationEpochs,
        uint256 minWeight,
        uint16 roundId,
        uint16 tierId,
        uint32 rewardMultiplierBps,
        bool eternal
    )
        external
        payable
        returns (uint256 tokenId, uint256 positionId);
}

/// @title NARABondDepositoryV4NFT
/// @notice NARA v4 bond market that delivers tradable position NFTs instead of raw engine positions.
contract NARABondDepositoryV4NFT is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint16 public constant MAX_DISCOUNT_BPS = 3_000;
    uint32 public constant MAX_GENESIS_REWARD_MULTIPLIER_BPS = 50_000;
    uint256 public constant MAX_REWARD_SPLIT_WAD = 1e18;
    uint64 public constant MIN_PRICE_DELAY = 1 days;
    uint64 public constant MAX_TERMS_AGE = 2 days;

    bytes32 public constant TERMS_ROLE = keccak256("TERMS_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant PRICE_SIGNER_ROLE = keccak256("PRICE_SIGNER_ROLE");
    bytes32 public constant BOND_QUOTE_TYPEHASH = keccak256(
        "BondQuote(address buyer,address recipient,uint256 ethIn,uint256 minPayout,uint256 maxPayout,uint64 deadline,uint256 nonce,uint64 termsActivatedAt)"
    );

    error ZeroAddress();
    error ZeroValue();
    error NotAContract();
    error InvalidTerms();
    error BondInactive();
    error DepositTooSmall();
    error SlippageExceeded();
    error InsufficientInventory();
    error CapacityExceeded();
    error PayoutTooLarge();
    error EthTransferFailed();
    error NaraSweepForbidden();
    error InvalidTreasury();
    error InvalidRecipient();
    error TimelockNotElapsed();
    error NoPendingChange();
    error PendingProposalExists();
    error PauseRequired();
    error PriceZero();
    error PriceDelayTooShort();
    error PriceDelayTooLong();
    error PriceStale();
    error SignedQuoteRequired();
    error QuoteExpired();
    error InvalidQuote();
    error QuotePayoutExceeded(uint256 payout, uint256 maxPayout);

    struct BondTerms {
        uint256 naraPerEthWad;
        uint16 discountBps;
        uint256 rewardSplitWad;
        uint256 minDepositWei;
        uint256 maxPayoutNara;
        uint256 remainingCapacityNara;
        uint64 lockDurationEpochs;
        uint16 genesisRoundId;
        uint16 genesisTierId;
        uint32 genesisRewardMultiplierBps;
        bool genesisEternal;
        bool active;
    }

    struct PendingTermsChange {
        BondTerms terms;
        uint64 eta;
    }

    IERC20 public immutable nara;
    INARAEngineV4BondNFT public immutable engine;
    INARABondVaultV4NFT public immutable vault;
    INARAPositionNFTV4Bond public immutable positionNft;
    uint64 public immutable adminDelay;

    address public treasury;

    BondTerms public terms;
    PendingTermsChange internal _pendingTerms;
    uint64 public termsActivatedAt;
    address internal _pendingTreasury;
    uint64 public pendingTreasuryTimestamp;

    uint256 public totalBondedEth;
    uint256 public totalNaraSold;
    uint256 public totalBondsMinted;
    uint256 public pendingRewardEth;
    uint256 public pendingTreasuryEth;
    mapping(address => uint256) public quoteNonces;

    event TreasurySet(address indexed treasury);
    event TreasuryProposed(address indexed treasury, uint64 executeAfter);
    event TreasuryCancelled();
    event TermsSet(BondTerms terms);
    event TermsProposed(BondTerms terms, uint64 executeAfter);
    event TermsCancelled();
    event CapacityAdded(uint256 amount, uint256 newRemainingCapacity);
    event BondCreated(
        address indexed buyer,
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 positionId,
        uint256 ethIn,
        uint256 bondEthIn,
        uint256 payout,
        uint256 grossNara,
        uint256 rewardEth,
        uint256 treasuryEth,
        uint256 lockFeeEth,
        uint256 naraPerEthWad,
        uint256 discountBps,
        uint64 lockDurationEpochs,
        uint16 genesisRoundId,
        uint16 genesisTierId,
        uint32 genesisRewardMultiplierBps,
        bool genesisEternal
    );
    event ExcessReturnedToVault(uint256 amount);
    event ForeignTokenSwept(address indexed token, address indexed to, uint256 amount);
    event RewardEthQueued(uint256 amount);
    event RewardEthFlushed(uint256 amount);
    event TreasuryEthQueued(uint256 amount);
    event TreasuryEthFlushed(uint256 amount);

    constructor(
        address nara_,
        address engine_,
        address vault_,
        address positionNft_,
        address admin_,
        address treasury_,
        uint64 adminDelaySeconds_,
        BondTerms memory initialTerms_
    ) EIP712("NARABondDepositoryV4NFT", "1") {
        if (
            nara_ == address(0) ||
            engine_ == address(0) ||
            vault_ == address(0) ||
            positionNft_ == address(0) ||
            admin_ == address(0) ||
            treasury_ == address(0)
        ) revert ZeroAddress();
        if (treasury_ == address(this)) revert InvalidTreasury();
        if (adminDelaySeconds_ == 0) revert InvalidTerms();
        if (adminDelaySeconds_ < MIN_PRICE_DELAY) revert PriceDelayTooShort();
        if (adminDelaySeconds_ > MAX_TERMS_AGE - MIN_PRICE_DELAY) revert PriceDelayTooLong();
        if (nara_.code.length == 0 || engine_.code.length == 0 || vault_.code.length == 0 || positionNft_.code.length == 0) {
            revert NotAContract();
        }

        nara = IERC20(nara_);
        engine = INARAEngineV4BondNFT(engine_);
        vault = INARABondVaultV4NFT(vault_);
        positionNft = INARAPositionNFTV4Bond(positionNft_);
        treasury = treasury_;
        adminDelay = adminDelaySeconds_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(TERMS_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);
        _grantRole(TREASURY_ROLE, admin_);
        _grantRole(PRICE_SIGNER_ROLE, admin_);

        if (initialTerms_.remainingCapacityNara != 0) revert InvalidTerms();
        _validateTerms(initialTerms_);
        terms = initialTerms_;
        termsActivatedAt = uint64(block.timestamp);

        emit TermsSet(initialTerms_);
        emit TreasurySet(treasury_);
    }

    receive() external payable {
        revert("direct ETH disabled");
    }

    function availableFromVault() external view returns (uint256) {
        return vault.availableToPull();
    }

    function excessNara() public view returns (uint256) {
        return nara.balanceOf(address(this));
    }

    function quoteBond(uint256 ethIn) external view returns (uint256 payout) {
        BondTerms memory t = terms;
        if (!t.active || t.remainingCapacityNara == 0) return 0;
        if (!_termsFresh()) return 0;

        uint256 lockFeeEth = engine.lockFeeWei();
        if (ethIn <= lockFeeEth) return 0;
        uint256 bondEthIn = ethIn - lockFeeEth;
        if (bondEthIn < t.minDepositWei) return 0;

        uint256 rawPayout = _computePayout(bondEthIn, t);
        if (rawPayout == 0 || rawPayout > t.maxPayoutNara) return 0;

        uint256 gross = _grossUpForLockFee(rawPayout);
        if (gross > t.remainingCapacityNara) return 0;
        if (gross > vault.availableToPull()) return 0;

        payout = rawPayout;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function proposeTreasury(address newTreasury) external onlyRole(TREASURY_ROLE) {
        if (pendingTreasuryTimestamp != 0) revert PendingProposalExists();
        if (newTreasury == address(0)) revert ZeroAddress();
        if (newTreasury == address(this)) revert InvalidTreasury();

        _pendingTreasury = newTreasury;
        pendingTreasuryTimestamp = uint64(block.timestamp) + adminDelay;
        emit TreasuryProposed(newTreasury, pendingTreasuryTimestamp);
    }

    function executeTreasury() external onlyRole(TREASURY_ROLE) {
        if (pendingTreasuryTimestamp == 0) revert NoPendingChange();
        if (block.timestamp < pendingTreasuryTimestamp) revert TimelockNotElapsed();

        treasury = _pendingTreasury;
        pendingTreasuryTimestamp = 0;
        delete _pendingTreasury;
        emit TreasurySet(treasury);
    }

    function cancelTreasury() external onlyRole(TREASURY_ROLE) {
        if (pendingTreasuryTimestamp == 0) revert NoPendingChange();
        pendingTreasuryTimestamp = 0;
        delete _pendingTreasury;
        emit TreasuryCancelled();
    }

    function proposeTerms(BondTerms calldata newTerms) external onlyRole(TERMS_ROLE) {
        if (_pendingTerms.eta != 0) revert PendingProposalExists();
        _validateTerms(newTerms);

        _pendingTerms = PendingTermsChange({
            terms: newTerms,
            eta: uint64(block.timestamp) + adminDelay
        });
        emit TermsProposed(newTerms, _pendingTerms.eta);
    }

    function executeTerms() external onlyRole(TERMS_ROLE) {
        if (_pendingTerms.eta == 0) revert NoPendingChange();
        if (block.timestamp < _pendingTerms.eta) revert TimelockNotElapsed();
        if (!paused()) revert PauseRequired();
        _validateTerms(_pendingTerms.terms);
        if (_pendingTerms.terms.remainingCapacityNara > vault.availableToPull()) revert InsufficientInventory();

        terms = _pendingTerms.terms;
        termsActivatedAt = uint64(block.timestamp);
        delete _pendingTerms;
        emit TermsSet(terms);
    }

    function cancelTerms() external onlyRole(TERMS_ROLE) {
        if (_pendingTerms.eta == 0) revert NoPendingChange();
        delete _pendingTerms;
        emit TermsCancelled();
    }

    function addCapacity(uint256 amount) external onlyRole(TERMS_ROLE) {
        if (!paused()) revert PauseRequired();
        if (amount == 0) revert ZeroValue();

        BondTerms storage t = terms;
        if (!_termsFresh()) revert PriceStale();
        uint256 available = vault.availableToPull();
        if (amount > available || t.remainingCapacityNara + amount > available) revert InsufficientInventory();

        t.remainingCapacityNara += amount;
        emit CapacityAdded(amount, t.remainingCapacityNara);
    }

    function buyBond(uint256 minNaraOut)
        external
        payable
        returns (uint256, uint256, uint256)
    {
        minNaraOut;
        revert SignedQuoteRequired();
    }

    function buyBondFor(address recipient, uint256 minNaraOut)
        external
        payable
        returns (uint256, uint256, uint256)
    {
        recipient;
        minNaraOut;
        revert SignedQuoteRequired();
    }

    function buyBondWithQuote(
        uint256 minNaraOut,
        uint256 maxNaraOut,
        uint64 deadline,
        bytes calldata signature
    )
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId, uint256 positionId, uint256 payout)
    {
        _consumeQuote(msg.sender, msg.sender, minNaraOut, maxNaraOut, deadline, signature);
        return _createBond(msg.sender, minNaraOut, maxNaraOut);
    }

    function buyBondForWithQuote(
        address recipient,
        uint256 minNaraOut,
        uint256 maxNaraOut,
        uint64 deadline,
        bytes calldata signature
    )
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId, uint256 positionId, uint256 payout)
    {
        _consumeQuote(msg.sender, recipient, minNaraOut, maxNaraOut, deadline, signature);
        return _createBond(recipient, minNaraOut, maxNaraOut);
    }

    function flushRewardEth() external onlyRole(TREASURY_ROLE) nonReentrant {
        uint256 amount = pendingRewardEth;
        if (amount == 0) revert ZeroValue();
        pendingRewardEth = 0;
        try engine.notifyEthRewards{value: amount}() {
            emit RewardEthFlushed(amount);
        } catch {
            _queueRewardEth(amount);
        }
    }

    function flushTreasuryEth() external onlyRole(TREASURY_ROLE) nonReentrant {
        uint256 amount = pendingTreasuryEth;
        if (amount == 0) revert ZeroValue();
        pendingTreasuryEth = 0;
        if (!_sendEth(treasury, amount)) {
            _queueTreasuryEth(amount);
            return;
        }
        emit TreasuryEthFlushed(amount);
    }

    function rescueRewardEth(address to) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (to != treasury) revert InvalidRecipient();
        uint256 amount = pendingRewardEth;
        if (amount == 0) revert ZeroValue();
        pendingRewardEth = 0;
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
        emit RewardEthFlushed(amount);
    }

    function returnExcessToVault() external onlyRole(TREASURY_ROLE) nonReentrant {
        uint256 excess = excessNara();
        if (excess == 0) revert ZeroValue();
        nara.forceApprove(address(vault), 0);
        nara.forceApprove(address(vault), excess);
        vault.returnUnsold(excess);
        nara.forceApprove(address(vault), 0);
        emit ExcessReturnedToVault(excess);
    }

    function sweepForeignToken(address token, address to, uint256 amount)
        external
        onlyRole(TREASURY_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(nara)) revert NaraSweepForbidden();
        IERC20(token).safeTransfer(to, amount);
        emit ForeignTokenSwept(token, to, amount);
    }

    function _createBond(address recipient, uint256 minPayout, uint256 maxPayout)
        internal
        returns (uint256 tokenId, uint256 positionId, uint256 payout)
    {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (msg.value == 0) revert ZeroValue();

        BondTerms storage t = terms;
        if (!t.active) revert BondInactive();
        if (!_termsFresh()) revert PriceStale();
        if (t.remainingCapacityNara == 0) revert CapacityExceeded();

        uint256 lockFeeEth = engine.lockFeeWei();
        if (msg.value <= lockFeeEth) revert DepositTooSmall();

        uint256 bondEthIn = msg.value - lockFeeEth;
        if (bondEthIn < t.minDepositWei) revert DepositTooSmall();

        payout = _computePayout(bondEthIn, t);
        if (payout == 0) revert DepositTooSmall();
        if (payout < minPayout) revert SlippageExceeded();
        if (payout > maxPayout) revert QuotePayoutExceeded(payout, maxPayout);
        if (payout > t.maxPayoutNara) revert PayoutTooLarge();

        uint256 gross = _grossUpForLockFee(payout);
        if (gross > t.remainingCapacityNara) revert CapacityExceeded();
        if (gross > vault.availableToPull()) revert InsufficientInventory();

        uint256 rewardEth = Math.mulDiv(bondEthIn, t.rewardSplitWad, WAD);
        uint256 treasuryEth = bondEthIn - rewardEth;

        t.remainingCapacityNara -= gross;

        vault.pullToMarket(gross);
        nara.forceApprove(address(positionNft), 0);
        nara.forceApprove(address(positionNft), gross);
        (tokenId, positionId) = positionNft.mintGenesisAndLockFor{value: lockFeeEth}(
            recipient,
            gross,
            t.lockDurationEpochs,
            0,
            t.genesisRoundId,
            t.genesisTierId,
            t.genesisRewardMultiplierBps,
            t.genesisEternal
        );
        nara.forceApprove(address(positionNft), 0);

        totalBondedEth += bondEthIn;
        totalNaraSold += payout;
        totalBondsMinted += 1;

        if (rewardEth != 0) {
            try engine.notifyEthRewards{value: rewardEth}() {} catch {
                _queueRewardEth(rewardEth);
            }
        }
        if (treasuryEth != 0) {
            if (!_sendEth(treasury, treasuryEth)) {
                _queueTreasuryEth(treasuryEth);
            }
        }

        emit BondCreated(
            msg.sender,
            recipient,
            tokenId,
            positionId,
            msg.value,
            bondEthIn,
            payout,
            gross,
            rewardEth,
            treasuryEth,
            lockFeeEth,
            t.naraPerEthWad,
            t.discountBps,
            t.lockDurationEpochs,
            t.genesisRoundId,
            t.genesisTierId,
            t.genesisRewardMultiplierBps,
            t.genesisEternal
        );
    }

    function _consumeQuote(
        address buyer,
        address recipient,
        uint256 minPayout,
        uint256 maxPayout,
        uint64 deadline,
        bytes calldata signature
    ) internal {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (minPayout == 0 || maxPayout == 0 || minPayout > maxPayout) revert InvalidQuote();
        if (block.timestamp > deadline) revert QuoteExpired();

        uint256 nonce = quoteNonces[buyer]++;
        bytes32 structHash = keccak256(
            abi.encode(
                BOND_QUOTE_TYPEHASH,
                buyer,
                recipient,
                msg.value,
                minPayout,
                maxPayout,
                deadline,
                nonce,
                termsActivatedAt
            )
        );
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (!hasRole(PRICE_SIGNER_ROLE, signer)) revert InvalidQuote();
    }

    function _computePayout(uint256 bondEthIn, BondTerms memory t) internal pure returns (uint256) {
        if (t.naraPerEthWad == 0) return 0;
        uint256 effectiveWad = Math.mulDiv(t.naraPerEthWad, BPS + t.discountBps, BPS);
        return Math.mulDiv(bondEthIn, effectiveWad, WAD);
    }

    function _grossUpForLockFee(uint256 netAmount) internal view returns (uint256) {
        uint16 feeBps = engine.lockFeeBps();
        if (feeBps == 0) return netAmount;
        if (feeBps >= BPS) revert InvalidTerms();
        uint256 denominator = BPS - feeBps;
        return (netAmount * BPS + denominator - 1) / denominator;
    }

    function _validateTerms(BondTerms memory t) internal view {
        if (t.naraPerEthWad == 0) revert PriceZero();
        if (t.discountBps > MAX_DISCOUNT_BPS) revert InvalidTerms();
        if (t.rewardSplitWad > MAX_REWARD_SPLIT_WAD) revert InvalidTerms();
        if (t.minDepositWei == 0) revert InvalidTerms();
        if (t.maxPayoutNara == 0) revert InvalidTerms();
        if (t.lockDurationEpochs == 0) revert InvalidTerms();
        if (t.genesisRoundId == 0 || t.genesisTierId == 0) revert InvalidTerms();
        if (
            t.genesisRewardMultiplierBps == 0 ||
            t.genesisRewardMultiplierBps > MAX_GENESIS_REWARD_MULTIPLIER_BPS
        ) {
            revert InvalidTerms();
        }

        EngineConfig memory cfg = engine.config();
        if (t.lockDurationEpochs <= cfg.activationDelayEpochs) revert InvalidTerms();
        if (t.lockDurationEpochs > cfg.maxLockEpochs) revert InvalidTerms();
    }

    function termsValidUntil() public view returns (uint64) {
        uint64 activatedAt = termsActivatedAt;
        if (activatedAt == 0) return 0;
        return activatedAt + MAX_TERMS_AGE;
    }

    function _termsFresh() internal view returns (bool) {
        return block.timestamp <= termsValidUntil();
    }

    function _sendEth(address to, uint256 amount) internal returns (bool ok) {
        (ok,) = payable(to).call{value: amount}("");
    }

    function _queueRewardEth(uint256 amount) internal {
        pendingRewardEth += amount;
        emit RewardEthQueued(amount);
    }

    function _queueTreasuryEth(uint256 amount) internal {
        pendingTreasuryEth += amount;
        emit TreasuryEthQueued(amount);
    }
}
