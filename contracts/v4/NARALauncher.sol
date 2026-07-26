// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {NARAToken} from "./NARAToken.sol";

/// @title NARA Launcher
/// @notice Atomic one-shot deployer for the NARA token + engine pair.
/// @dev Resolves the circular immutable-constructor dependency:
///      - Token constructor needs the engine address (FLASH_FEE_SINK)
///      - Engine constructor needs the token address
///
/// Flow (single transaction):
///   1. Caller passes the engine's full creation code (bytecode + constructor args
///      that do NOT include the token address) plus a CREATE2 salt.
///   2. Launcher precomputes `predictedEngine` from (salt, keccak256(engineCode), launcher).
///   3. Launcher deploys `NARAToken(treasury, predictedEngine, name, symbol)` via plain CREATE.
///   4. Launcher publishes `pendingToken()` so the engine constructor can read it.
///   5. Launcher deploys the engine via CREATE2(salt, engineCreationCode).
///      The engine constructor reads `ILauncher(msg.sender).pendingToken()` to get
///      the token address. Since `msg.sender` at that point is this launcher,
///      the read resolves to the freshly-deployed token.
///   6. Launcher asserts `engine == predictedEngine`. If not, entire tx reverts.
///   7. Launcher clears `_pendingToken` and records the deployment as finalized.
///
/// Single-shot by design:
///   - After one successful launch, `launch()` reverts. No owner, no reset path.
///   - The launcher itself becomes a verifiable historical record on-chain.
contract NARALauncher {
    /// @notice Only this address can execute the one-shot launch.
    /// @dev This prevents a public mempool front-run between launcher deploy
    ///      and launch execution. The address is explicit so factory deployments
    ///      cannot accidentally assign launch authority to the factory itself.
    ///      The launched token and engine remain adminless except for the
    ///      engine's explicit roles.
    address public immutable launcherAdmin;

    /// @notice Exposed while `launch()` is executing so the engine constructor
    /// can read the freshly-deployed token address. Zero outside of that window.
    address public pendingToken;

    /// @notice Token address after a successful launch. Zero before.
    address public deployedToken;

    /// @notice Engine address after a successful launch. Zero before.
    address public deployedEngine;

    /// @notice Salt used for the engine's CREATE2 deploy.
    bytes32 public launchSalt;

    /// @notice True after `launch()` has succeeded exactly once.
    bool public launched;

    event Launched(
        address indexed token,
        address indexed engine,
        address indexed treasury,
        bytes32 salt,
        string tokenName,
        string tokenSymbol
    );

    error AlreadyLaunched();
    error ZeroAddress();
    error EmptyCode();
    error EmptyMetadata();
    error UnauthorizedLauncher();
    error AddressMismatch(address expected, address actual);

    constructor(address admin_) {
        if (admin_ == address(0)) revert ZeroAddress();
        launcherAdmin = admin_;
    }

    /// @notice Deploy the NARA token and engine atomically.
    /// @param treasury Recipient of the initial 1,000,000 NARA supply.
    /// @param engineCreationCode Full creation bytecode of the engine (with its
    ///   constructor args already ABI-encoded). MUST NOT embed the token address;
    ///   the engine must read it from `ILauncher(msg.sender).pendingToken()`.
    /// @param salt CREATE2 salt for the engine deploy. Enables vanity addresses.
    /// @return token Address of the deployed NARAToken.
    /// @return engine Address of the deployed engine.
    function launch(
        address treasury,
        bytes calldata engineCreationCode,
        bytes32 salt,
        string calldata tokenName,
        string calldata tokenSymbol
    ) external returns (address token, address engine) {
        if (msg.sender != launcherAdmin) revert UnauthorizedLauncher();
        if (launched) revert AlreadyLaunched();
        if (treasury == address(0)) revert ZeroAddress();
        if (engineCreationCode.length == 0) revert EmptyCode();
        if (bytes(tokenName).length == 0 || bytes(tokenSymbol).length == 0) revert EmptyMetadata();

        bytes32 codeHash = keccak256(engineCreationCode);
        address predicted = Create2.computeAddress(salt, codeHash, address(this));

        // Step 1: deploy token with predicted engine baked in as FLASH_FEE_SINK.
        NARAToken t = new NARAToken(treasury, predicted, tokenName, tokenSymbol);
        token = address(t);

        // Step 2: publish token so the engine's constructor can read it.
        pendingToken = token;

        // Step 3: deploy engine via CREATE2. Its constructor will read
        // `pendingToken()` from us (msg.sender) and lock it as its NARA reference.
        engine = Create2.deploy(0, salt, engineCreationCode);
        if (engine != predicted) revert AddressMismatch(predicted, engine);

        // Step 4: clear the transient pointer and finalize.
        pendingToken = address(0);
        deployedToken = token;
        deployedEngine = engine;
        launchSalt = salt;
        launched = true;

        emit Launched(token, engine, treasury, salt, tokenName, tokenSymbol);
    }

    /// @notice Preview the engine CREATE2 address for a given creation code + salt.
    /// @dev Useful off-chain: compute the engine's future address, plug it into
    /// scripts, verify against on-chain deploy.
    function previewEngineAddress(
        bytes calldata engineCreationCode,
        bytes32 salt
    ) external view returns (address) {
        return Create2.computeAddress(salt, keccak256(engineCreationCode), address(this));
    }
}
