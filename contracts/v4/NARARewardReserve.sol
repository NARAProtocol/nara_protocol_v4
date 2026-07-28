// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface INARARewardReserveEngineView {
    function NARA() external view returns (address);
    function currentEpoch() external view returns (uint64);
}

error AlreadySet();
error ZeroAddress();
error ZeroValue();
error InvalidEngine();
error InvalidToken();
error InsufficientRewards();
error NaraSweepForbidden();
error NotAContract();

/// @title NARARewardReserve (v4)
/// @notice Sealed custodian for the v4 NARA reward allocation (e.g. 700,000 NARA).
///         Only the v4 NARAEngine can withdraw NARA via releaseToEngine().
///         Admin cannot sweep NARA — only foreign tokens accidentally sent here.
///
/// @dev Interface (`availableRewards`, `releaseToEngine`, `isValidFor`) matches the
///      `INaraRewardReserve` interface NARAEngine expects in setRewardReserve.
///      `nara` and `engine` addresses are each set exactly once at deploy.
///
///      This v4 reserve only accepts an engine exposing the v4 `NARA()` and
///      `currentEpoch()` surface, which avoids accidentally sealing emissions
///      to other contracts that happen to expose a lowercase `nara()` getter.
contract NARARewardReserve is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ENGINE_SETTER_ROLE = keccak256("ENGINE_SETTER_ROLE");

    IERC20 public nara;
    address public engine;

    /// @notice Immutable lifetime cap on total NARA that can ever be released.
    uint256 public immutable rewardAllocation;

    /// @notice Cumulative NARA released to the engine via releaseToEngine().
    uint256 public totalReleased;

    event NaraSet(address indexed nara);
    event EngineSet(address indexed engine);
    event RewardsReleased(address indexed engine, uint256 amount);
    event ForeignTokenSwept(address indexed token, address indexed to, uint256 amount);

    constructor(address admin_, uint256 rewardAllocation_) {
        if (admin_ == address(0)) revert ZeroAddress();
        if (rewardAllocation_ == 0) revert ZeroValue();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ADMIN_ROLE, admin_);
        _grantRole(ENGINE_SETTER_ROLE, admin_);

        rewardAllocation = rewardAllocation_;
    }

    function setNara(address nara_) external onlyRole(ADMIN_ROLE) {
        if (nara_ == address(0)) revert ZeroAddress();
        if (nara_.code.length == 0) revert NotAContract();
        if (address(nara) != address(0)) revert AlreadySet();
        nara = IERC20(nara_);
        emit NaraSet(nara_);
    }

    function setEngine(address engine_) external onlyRole(ENGINE_SETTER_ROLE) {
        if (engine_ == address(0)) revert ZeroAddress();
        if (engine_.code.length == 0) revert NotAContract();
        if (address(nara) == address(0)) revert InvalidToken();
        bool valid;
        try INARARewardReserveEngineView(engine_).NARA() returns (address token) {
            if (token == address(nara)) {
                try INARARewardReserveEngineView(engine_).currentEpoch() returns (uint64) {
                    valid = true;
                } catch {}
            }
        } catch {}
        if (!valid) revert InvalidEngine();
        if (engine != address(0)) revert AlreadySet();
        engine = engine_;
        emit EngineSet(engine_);
    }

    /// @notice Returns the NARA the engine is currently permitted to pull.
    /// @dev    = min(balance, rewardAllocation - totalReleased). Zero if nara unset.
    function availableRewards() public view returns (uint256) {
        if (address(nara) == address(0)) return 0;

        uint256 remainingAllocation = rewardAllocation > totalReleased
            ? rewardAllocation - totalReleased
            : 0;

        uint256 bal = nara.balanceOf(address(this));
        return bal < remainingAllocation ? bal : remainingAllocation;
    }

    function isValidFor(address nara_, address engine_) external view returns (bool) {
        return address(nara) == nara_ && engine == engine_;
    }

    /// @notice Engine pulls NARA from the reserve when local emission reserve is short.
    function releaseToEngine(uint256 amount) external nonReentrant {
        if (msg.sender != engine) revert InvalidEngine();
        if (address(nara) == address(0)) revert InvalidToken();
        if (amount == 0) revert ZeroValue();

        uint256 available = availableRewards();
        if (amount > available) revert InsufficientRewards();

        totalReleased += amount;
        nara.safeTransfer(engine, amount);

        emit RewardsReleased(engine, amount);
    }

    /// @notice Recover non-NARA tokens accidentally sent here. NARA is unsweepable.
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
