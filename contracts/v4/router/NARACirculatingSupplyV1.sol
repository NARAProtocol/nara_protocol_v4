// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Optional hook a listed protocol contract can implement to self-report NARA it
///         controls outside its own balance (e.g. bond inventory parked in an external
///         market during a release/migration window). Probed via try/catch — a listed
///         account that does not implement it is simply treated as `balanceOf` only.
/// @dev    Mirrors `NARABondVaultV4.excludedMarketBalance()` so the public market number
///         stays consistent with the protocol's own bond accounting, and generalises to
///         any future escrow/market contract that adopts the same interface.
interface INARAExcludedMarketSource {
    function excludedMarketBalance() external view returns (uint256);
}

/// @notice Single-call snapshot of the supply breakdown for dashboards and APIs.
struct CirculatingSupplyReport {
    uint256 totalSupply;     // capped total supply (see MAX_SUPPLY_CAP)
    uint256 circulating;     // market circulating supply
    uint256 locked;          // excluded (non-market) supply = total - circulating
    uint256 percentCircBps;  // circulating as basis points of total (10_000 = 100%)
    uint256 excludedCount;   // number of excluded accounts
}

interface INARACirculatingSupplyV1 {
    function nara() external view returns (address);
    function MAX_SUPPLY_CAP() external view returns (uint256);
    function circulatingSupply() external view returns (uint256);
    function lockedSupply() external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function rawTotalSupply() external view returns (uint256);
    function percentCirculatingBps() external view returns (uint256);
    function decimals() external view returns (uint8);
    function excludedAccounts() external view returns (address[] memory);
    function excludedAccountsLength() external view returns (uint256);
    function excludedAccountAt(uint256 index) external view returns (address);
    function excludedBalanceOf(address account) external view returns (uint256);
    function excludedBreakdown()
        external
        view
        returns (address[] memory accounts, uint256[] memory balances);
    function supplyReport() external view returns (CirculatingSupplyReport memory);
}

/// @title  NARACirculatingSupplyV1
/// @author NARA Protocol
/// @notice Trustless, read-only **market circulating supply** oracle for NARA.
///
///         circulating = cappedTotalSupply − Σ( balanceOf(excluded) + excludedMarketBalance(excluded) )
///
///         The excluded set is the protocol-controlled / non-market wallets: the reward
///         reserve, the bond vault, the team vesting wallet, and the burn sink (`0x…dead`).
///         Everything else counts as circulating — including NARA that users have **locked**
///         in the engine, the LP seed, and the treasury (earmarked for ecosystem / game
///         sponsorship, so it is productive public capital, not a held-back reserve).
///
/// @dev ────────────────────────────────────────────────────────────────────────────────
///      DEFINITION — why user-locked NARA counts as circulating
///      ────────────────────────────────────────────────────────────────────────────────
///      This is the **market** definition that CoinGecko / CoinMarketCap / DexScreener
///      mean by "circulating supply": coins in the public's hands. A holder who buys NARA
///      and locks it still *owns* it — it is voluntarily illiquid, not protocol-controlled
///      — so it remains circulating (the same way staked ETH or locked CRV/CVX count).
///
///      This is **intentionally different** from the engine's internal
///      `NARAEngine._circulatingSupply()`, which is an *emission-model free-float*: it also
///      subtracts the engine's own balance (locked principal + in-flight emission reserve)
///      because that figure scales emissions, not market cap. Two numbers, two purposes —
///      do not "reconcile" them by adding the engine to the excluded set here. Doing so
///      would wrongly erase user-locked supply from the public number and make market cap
///      shrink as the protocol succeeds.
///
///      At genesis: 1,000,000 − reserve(650k) − bonds(200k) − vesting(40k) = 110k
///      (the LP seed plus the treasury earmarked for game sponsorship). Over time the number
///      **rises by itself** as the reward reserve drips and the team vesting wallet releases
///      — no transaction to this contract is ever required.
///
///      ────────────────────────────────────────────────────────────────────────────────
///      TRUST MODEL — immutable, ownerless, versioned
///      ────────────────────────────────────────────────────────────────────────────────
///      There is no owner and no setter. The excluded set is fixed at deploy. A mutable
///      circulating-supply contract is a manipulation vector and is routinely rejected by
///      listing reviewers, so adaptability is provided by **redeployment**, not admin keys:
///      if the non-market wallet set ever changes (e.g. a second reserve is introduced),
///      deploy `NARACirculatingSupplyV2` with the new set and repoint the website + the
///      CoinGecko/CMC submission. The logic is stateless beyond the constructor, so a new
///      version is a one-line config change.
///
///      ────────────────────────────────────────────────────────────────────────────────
///      LISTING INTEGRATION
///      ────────────────────────────────────────────────────────────────────────────────
///      CoinGecko / CMC compute circulating supply from a submitted **excluded-address
///      list** (they run the subtraction themselves on-chain). This contract is the
///      trustless mirror of that math: it lets your own site/API read one authoritative
///      number, and `excludedAccounts()` publishes the exact set so a reviewer can verify
///      your submission. DexScreener does not take address lists; it inherits circulating
///      supply from CoinGecko once listed.
///
///      ────────────────────────────────────────────────────────────────────────────────
///      SAFETY
///      ────────────────────────────────────────────────────────────────────────────────
///      • Pure view; holds no funds; cannot move tokens; nothing to reenter.
///      • Never reverts: results are clamped (circulating ≥ 0, locked ≤ total) so external
///        pollers and listing ingestion can rely on it.
///      • Total is capped at MAX_SUPPLY_CAP (defence in depth; NARA is fixed-supply).
///      • Excluded set is de-duplicated and zero-address-free at construction.
///      • Only trusted protocol contracts/wallets should ever be listed: a listed contract
///        that self-reports a bogus `excludedMarketBalance()` could understate circulating,
///        so the set is operator-curated once, immutably, and published for verification.
contract NARACirculatingSupplyV1 is INARACirculatingSupplyV1 {
    /// @notice The NARA token this oracle reports on.
    IERC20 public immutable naraToken;

    /// @notice Safety ceiling applied to `totalSupply()` (NARA is fixed at 1,000,000e18).
    uint256 public immutable MAX_SUPPLY_CAP;

    /// @dev Non-market wallets netted out of circulating supply. Fixed at deploy.
    address[] private _excluded;

    error ZeroAddress();
    error ZeroValue();
    error NotAContract();
    error DuplicateAccount(address account);
    error IndexOutOfBounds();

    event TrackerDeployed(address indexed nara, uint256 maxSupplyCap, address[] excluded);

    /// @param nara_         NARA token address (must be a deployed contract).
    /// @param maxSupplyCap_ Hard ceiling for reported total supply (NARA: 1_000_000e18).
    /// @param excluded_     Non-market wallets to net out (reserve, bond vault, vesting,
    ///                      treasury, burn sink). Must be non-zero and unique.
    constructor(address nara_, uint256 maxSupplyCap_, address[] memory excluded_) {
        if (nara_ == address(0)) revert ZeroAddress();
        if (nara_.code.length == 0) revert NotAContract();
        if (maxSupplyCap_ == 0) revert ZeroValue();

        naraToken = IERC20(nara_);
        MAX_SUPPLY_CAP = maxSupplyCap_;

        uint256 n = excluded_.length;
        for (uint256 i; i < n; ) {
            address account = excluded_[i];
            if (account == address(0)) revert ZeroAddress();
            for (uint256 j; j < i; ) {
                if (excluded_[j] == account) revert DuplicateAccount(account);
                unchecked { ++j; }
            }
            _excluded.push(account);
            unchecked { ++i; }
        }

        emit TrackerDeployed(nara_, maxSupplyCap_, excluded_);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Interface compatibility alias
    // ─────────────────────────────────────────────────────────────────────────────

    /// @inheritdoc INARACirculatingSupplyV1
    function nara() external view returns (address) {
        return address(naraToken);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Headline numbers
    // ─────────────────────────────────────────────────────────────────────────────

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice Market circulating supply (18 decimals), clamped to ≥ 0.
    function circulatingSupply() public view returns (uint256) {
        uint256 total = _cappedTotal();
        uint256 excluded = _excludedTotal();
        return excluded >= total ? 0 : total - excluded;
    }

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice Non-market (excluded) supply = total − circulating, clamped to ≤ total.
    function lockedSupply() public view returns (uint256) {
        uint256 total = _cappedTotal();
        uint256 excluded = _excludedTotal();
        return excluded >= total ? total : excluded;
    }

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice Total supply, capped at MAX_SUPPLY_CAP.
    function totalSupply() external view returns (uint256) {
        return _cappedTotal();
    }

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice Uncapped on-chain total supply, for transparency / reconciliation.
    function rawTotalSupply() external view returns (uint256) {
        return naraToken.totalSupply();
    }

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice Circulating supply as basis points of total (10_000 = 100%).
    function percentCirculatingBps() external view returns (uint256) {
        uint256 total = _cappedTotal();
        if (total == 0) return 0;
        uint256 excluded = _excludedTotal();
        uint256 circ = excluded >= total ? 0 : total - excluded;
        return (circ * 10_000) / total;
    }

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice NARA token decimals (falls back to 18 if the token omits the getter).
    function decimals() external view returns (uint8) {
        try IERC20Metadata(address(naraToken)).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Transparency — the exact excluded set and per-wallet balances
    // ─────────────────────────────────────────────────────────────────────────────

    /// @inheritdoc INARACirculatingSupplyV1
    function excludedAccounts() external view returns (address[] memory) {
        return _excluded;
    }

    /// @inheritdoc INARACirculatingSupplyV1
    function excludedAccountsLength() external view returns (uint256) {
        return _excluded.length;
    }

    /// @inheritdoc INARACirculatingSupplyV1
    function excludedAccountAt(uint256 index) external view returns (address) {
        if (index >= _excluded.length) revert IndexOutOfBounds();
        return _excluded[index];
    }

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice Excluded NARA attributed to `account` = balanceOf + excludedMarketBalance().
    function excludedBalanceOf(address account) external view returns (uint256) {
        return _excludedBalanceOf(account);
    }

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice Full per-wallet breakdown of the excluded set (for dashboards/audits).
    function excludedBreakdown()
        external
        view
        returns (address[] memory accounts, uint256[] memory balances)
    {
        accounts = _excluded;
        uint256 n = accounts.length;
        balances = new uint256[](n);
        for (uint256 i; i < n; ) {
            balances[i] = _excludedBalanceOf(accounts[i]);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc INARACirculatingSupplyV1
    /// @notice One-call snapshot of the full supply breakdown.
    function supplyReport() external view returns (CirculatingSupplyReport memory report) {
        uint256 total = _cappedTotal();
        uint256 excluded = _excludedTotal();
        uint256 circ = excluded >= total ? 0 : total - excluded;
        report = CirculatingSupplyReport({
            totalSupply: total,
            circulating: circ,
            locked: total - circ,
            percentCircBps: total == 0 ? 0 : (circ * 10_000) / total,
            excludedCount: _excluded.length
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────────

    /// @dev Total supply clamped to the immutable safety ceiling.
    function _cappedTotal() internal view returns (uint256 total) {
        total = naraToken.totalSupply();
        uint256 cap = MAX_SUPPLY_CAP;
        if (total > cap) total = cap;
    }

    /// @dev Excluded NARA for one account: its balance plus any self-reported
    ///      off-balance market inventory (probed safely; absent ⇒ 0).
    function _excludedBalanceOf(address account) internal view returns (uint256 bal) {
        bal = naraToken.balanceOf(account);
        if (account.code.length != 0) {
            try INARAExcludedMarketSource(account).excludedMarketBalance() returns (uint256 extra) {
                bal += extra;
            } catch {}
        }
    }

    /// @dev Sum of excluded NARA across the whole set.
    function _excludedTotal() internal view returns (uint256 sum) {
        address[] storage excluded = _excluded;
        uint256 n = excluded.length;
        for (uint256 i; i < n; ) {
            sum += _excludedBalanceOf(excluded[i]);
            unchecked { ++i; }
        }
    }
}
