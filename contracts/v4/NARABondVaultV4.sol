// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

// NARA Protocol v4 Bond Vault
// https://farcaster.xyz/naraprotocol

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title NARABondVaultV4
/// @notice Holds bond inventory for NARA v4. Hard ceiling: 290,000 NARA.
///         The depository is the sole authorised market that can pull and return NARA.
///         Release cap changes require a timelock delay enforced by this contract.
contract NARABondVaultV4 is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Errors ────────────────────────────────────────────────────────────────
    error ZeroAddress();
    error ZeroValue();
    error AlreadyInitialized();
    error NoPendingAction();
    error ActionNotReady();
    error SameValue();
    error InvalidToken();
    error InvalidMarket();
    error NoMarketSet();
    error NaraSweepForbidden();
    error CapTooLow();
    error CapTooHigh();
    error NothingAvailable();
    error AmountExceedsAvailable();
    error PendingActionExists();
    error NotAContract();
    error PreviousMarketStillPendingReturns();
    error NothingToClear();

    // ─── Roles ─────────────────────────────────────────────────────────────────
    bytes32 public constant ADMIN_ROLE       = keccak256("ADMIN_ROLE");
    bytes32 public constant MARKET_ADMIN_ROLE = keccak256("MARKET_ADMIN_ROLE");
    bytes32 public constant CAP_ADMIN_ROLE   = keccak256("CAP_ADMIN_ROLE");

    // ─── Hard cap ──────────────────────────────────────────────────────────────
    /// @notice Immutable lifetime bond budget for v4. 290,000 NARA.
    ///         activeReleaseCap can never exceed this, regardless of extra NARA sent later.
    uint256 public constant MAX_BOND_ALLOCATION = 290_000e18;

    // ─── Timelock change structs ────────────────────────────────────────────────
    struct PendingAddressChange {
        address value;
        uint64  eta;
    }

    struct PendingUintChange {
        uint256 value;
        uint64  eta;
    }

    // ─── State ─────────────────────────────────────────────────────────────────
    IERC20  public nara;
    address public market;
    address public previousMarket;

    uint64  public immutable actionDelay;

    /// @notice Lifetime bond budget recorded at deploy. Must be <= MAX_BOND_ALLOCATION.
    uint256 public immutable initialBondAllocation;

    uint256 public activeReleaseCap;
    uint256 public totalReleased;
    uint256 public totalReturned;

    PendingAddressChange public pendingMarketChange;
    PendingUintChange    public pendingReleaseCapChange;

    // ─── Events ────────────────────────────────────────────────────────────────
    event NaraSet(address indexed nara);
    event MarketChangeProposed(address indexed newMarket, uint64 eta);
    event MarketChanged(address indexed oldMarket, address indexed newMarket);
    event PreviousMarketCleared(address indexed oldPreviousMarket);
    event MarketChangeCancelled();
    event ReleaseCapChangeProposed(uint256 newCap, uint64 eta);
    event ReleaseCapChanged(uint256 oldCap, uint256 newCap);
    event ReleaseCapChangeCancelled();
    event PulledToMarket(address indexed market, uint256 amount);
    event ReturnedFromMarket(address indexed market, uint256 amount);
    event ForeignTokenSwept(address indexed token, address indexed to, uint256 amount);

    // ─── Constructor ───────────────────────────────────────────────────────────
    constructor(address admin_, uint64 actionDelaySeconds_, uint256 initialBondAllocation_) {
        if (admin_ == address(0)) revert ZeroAddress();
        if (actionDelaySeconds_ == 0) revert ZeroValue();
        if (initialBondAllocation_ == 0) revert ZeroValue();
        // Hard-enforce the v4 ceiling at deploy time.
        if (initialBondAllocation_ > MAX_BOND_ALLOCATION) revert CapTooHigh();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE, admin_);
        _grantRole(MARKET_ADMIN_ROLE, admin_);
        _grantRole(CAP_ADMIN_ROLE, admin_);

        actionDelay = actionDelaySeconds_;
        initialBondAllocation = initialBondAllocation_;
    }

    // ─── Admin: set token (one-shot) ───────────────────────────────────────────
    function setNara(address nara_) external onlyRole(ADMIN_ROLE) {
        if (nara_ == address(0)) revert ZeroAddress();
        if (nara_.code.length == 0) revert NotAContract();
        if (address(nara) != address(0)) revert AlreadyInitialized();
        nara = IERC20(nara_);
        emit NaraSet(nara_);
    }

    // ─── Views ─────────────────────────────────────────────────────────────────
    function bondInventory() public view returns (uint256) {
        IERC20 token = nara;
        if (address(token) == address(0)) return 0;
        return token.balanceOf(address(this));
    }

    function netReleased() public view returns (uint256) {
        uint256 released = totalReleased;
        uint256 returned = totalReturned;
        return released > returned ? released - returned : 0;
    }

    function maxCapNow() public view returns (uint256) {
        return netReleased() + bondInventory();
    }

    function availableToPull() public view returns (uint256) {
        uint256 currentNetReleased = netReleased();
        uint256 remainingCap = activeReleaseCap > currentNetReleased
            ? activeReleaseCap - currentNetReleased
            : 0;
        uint256 inventory = bondInventory();
        return inventory < remainingCap ? inventory : remainingCap;
    }

    /// @notice NARA currently parked in authorised markets during release/migration windows.
    /// @dev Used by NARAEngine._circulatingSupply() so unsold bond inventory does
    ///      not distort the emission model while sitting outside this vault.
    function excludedMarketBalance() public view returns (uint256 total) {
        IERC20 token = nara;
        if (address(token) == address(0)) return 0;
        address current = market;
        address previous = previousMarket;
        if (current != address(0)) total += token.balanceOf(current);
        if (previous != address(0) && previous != current) total += token.balanceOf(previous);
    }

    // ─── Market management ─────────────────────────────────────────────────────
    function proposeMarket(address newMarket) external onlyRole(MARKET_ADMIN_ROLE) {
        if (pendingMarketChange.value != address(0)) revert PendingActionExists();
        if (newMarket == address(0)) revert ZeroAddress();
        if (newMarket.code.length == 0) revert NotAContract();
        if (newMarket == market) revert SameValue();
        pendingMarketChange = PendingAddressChange({
            value: newMarket,
            eta:   uint64(block.timestamp) + actionDelay
        });
        emit MarketChangeProposed(newMarket, pendingMarketChange.eta);
    }

    function executeMarketChange() external onlyRole(MARKET_ADMIN_ROLE) {
        PendingAddressChange memory p = pendingMarketChange;
        if (p.value == address(0)) revert NoPendingAction();
        if (block.timestamp < p.eta) revert ActionNotReady();
        if (previousMarket != address(0)) revert PreviousMarketStillPendingReturns();
        address old = market;
        if (old != address(0)) previousMarket = old;
        market = p.value;
        delete pendingMarketChange;
        emit MarketChanged(old, market);
    }

    function cancelMarketChange() external onlyRole(MARKET_ADMIN_ROLE) {
        if (pendingMarketChange.value == address(0)) revert NoPendingAction();
        delete pendingMarketChange;
        emit MarketChangeCancelled();
    }

    function clearPreviousMarket() external onlyRole(MARKET_ADMIN_ROLE) {
        address oldPreviousMarket = previousMarket;
        if (oldPreviousMarket == address(0)) revert NothingToClear();
        IERC20 token = nara;
        if (address(token) == address(0)) revert InvalidToken();
        if (token.balanceOf(oldPreviousMarket) != 0) revert PreviousMarketStillPendingReturns();
        previousMarket = address(0);
        emit PreviousMarketCleared(oldPreviousMarket);
    }

    function forceClearPreviousMarket() external onlyRole(ADMIN_ROLE) {
        address oldPreviousMarket = previousMarket;
        if (oldPreviousMarket == address(0)) revert NothingToClear();
        IERC20 token = nara;
        if (address(token) == address(0)) revert InvalidToken();
        if (token.balanceOf(oldPreviousMarket) != 0) revert PreviousMarketStillPendingReturns();
        previousMarket = address(0);
        emit PreviousMarketCleared(oldPreviousMarket);
    }

    // ─── Release cap management ─────────────────────────────────────────────────
    function proposeReleaseCap(uint256 newCap) external onlyRole(CAP_ADMIN_ROLE) {
        if (pendingReleaseCapChange.eta != 0) revert PendingActionExists();
        uint256 currentNetReleased = netReleased();
        if (newCap < currentNetReleased) revert CapTooLow();
        if (newCap > initialBondAllocation) revert CapTooHigh();
        uint256 maxCap = maxCapNow();
        if (newCap > maxCap) revert CapTooHigh();
        if (newCap == activeReleaseCap) revert SameValue();
        pendingReleaseCapChange = PendingUintChange({
            value: newCap,
            eta:   uint64(block.timestamp) + actionDelay
        });
        emit ReleaseCapChangeProposed(newCap, pendingReleaseCapChange.eta);
    }

    function executeReleaseCapChange() external onlyRole(CAP_ADMIN_ROLE) {
        PendingUintChange memory p = pendingReleaseCapChange;
        if (p.eta == 0) revert NoPendingAction();
        if (block.timestamp < p.eta) revert ActionNotReady();
        if (p.value < netReleased()) revert CapTooLow();
        if (p.value > maxCapNow()) revert CapTooHigh();
        uint256 old = activeReleaseCap;
        activeReleaseCap = p.value;
        delete pendingReleaseCapChange;
        emit ReleaseCapChanged(old, activeReleaseCap);
    }

    function cancelReleaseCapChange() external onlyRole(CAP_ADMIN_ROLE) {
        if (pendingReleaseCapChange.eta == 0) revert NoPendingAction();
        delete pendingReleaseCapChange;
        emit ReleaseCapChangeCancelled();
    }

    // ─── Pull / return (called by depository) ──────────────────────────────────
    /// @notice Only the registered market (depository) may pull NARA.
    function pullToMarket(uint256 amount) external nonReentrant {
        address activeMarket = market;
        if (activeMarket == address(0)) revert NoMarketSet();
        if (msg.sender != activeMarket) revert InvalidMarket();
        IERC20 token = nara;
        if (address(token) == address(0)) revert InvalidToken();
        if (amount == 0) revert ZeroValue();

        uint256 available = availableToPull();
        if (available == 0) revert NothingAvailable();
        if (amount > available) revert AmountExceedsAvailable();

        uint256 beforeVault = token.balanceOf(address(this));
        uint256 beforeMarket = token.balanceOf(activeMarket);
        token.safeTransfer(activeMarket, amount);
        uint256 spent = beforeVault - token.balanceOf(address(this));
        uint256 received = token.balanceOf(activeMarket) - beforeMarket;
        if (spent != amount || received != amount) revert InvalidToken();
        totalReleased += amount;
        emit PulledToMarket(activeMarket, amount);
    }

    /// @notice Depository returns unsold NARA after a bond round closes or is cancelled.
    function returnUnsold(uint256 amount) external nonReentrant {
        address activeMarket = market;
        address legacyMarket = previousMarket;
        if (activeMarket == address(0) && legacyMarket == address(0)) revert NoMarketSet();
        if (msg.sender != activeMarket && msg.sender != legacyMarket) revert InvalidMarket();
        IERC20 token = nara;
        if (address(token) == address(0)) revert InvalidToken();
        if (amount == 0) revert ZeroValue();
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - beforeBal;
        if (received != amount) revert InvalidToken();
        totalReturned += received;
        emit ReturnedFromMarket(msg.sender, received);
    }

    // ─── Emergency ─────────────────────────────────────────────────────────────
    function sweepForeignToken(address token, address to, uint256 amount)
        external
        onlyRole(ADMIN_ROLE)
        nonReentrant
    {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (address(nara) == address(0)) revert InvalidToken();
        if (address(nara) != address(0) && token == address(nara)) revert NaraSweepForbidden();
        IERC20(token).safeTransfer(to, amount);
        emit ForeignTokenSwept(token, to, amount);
    }
}
