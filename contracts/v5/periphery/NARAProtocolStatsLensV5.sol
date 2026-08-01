// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INARAPositionEngineV5} from "../interfaces/modules/INARAPositionEngineV5.sol";
import {INARAPositionControllerV5} from "../interfaces/modules/INARAPositionControllerV5.sol";
import {INARAGenesisDistributorV5} from "../interfaces/modules/INARAGenesisDistributorV5.sol";
import {INARABondInventoryVaultV5} from "../interfaces/modules/INARABondInventoryVaultV5.sol";
import {INARABondDepositoryV5} from "../interfaces/modules/INARABondDepositoryV5.sol";
import {INARAOpsVestingVaultV5} from "../interfaces/modules/INARAOpsVestingVaultV5.sol";

/// @notice Single-call protocol accounting view over explicit V5 module addresses.
contract NARAProtocolStatsLensV5 {
    struct ProtocolStats {
        uint256 fixedSupply;
        uint256 totalLocked;
        uint256 activeWeight;
        uint256 enginePositionCount;
        uint256 positionNftSupply;
        uint64 currentEpoch;
        uint64 targetEpoch;
        uint256 genesisAllocation;
        uint256 genesisClaimed;
        bool genesisFunded;
        bool genesisClosed;
        uint256 bondAllocation;
        uint256 bondDistributed;
        bool bondInventoryFunded;
        bool bondMarketActive;
        bool bondMarketPermanentlyClosed;
        uint256 bondRemainingCapacity;
        uint256 bondTotalPayout;
        uint256 opsAllocation;
        uint256 opsReleased;
        uint256 opsReleasable;
        bool opsFunded;
    }

    error InvalidAddress();

    address public immutable token;
    address public immutable engine;
    address public immutable controller;
    address public immutable genesisDistributor;
    address public immutable bondInventoryVault;
    address public immutable bondDepository;
    address public immutable opsVestingVault;

    constructor(
        address token_,
        address engine_,
        address controller_,
        address genesisDistributor_,
        address bondInventoryVault_,
        address bondDepository_,
        address opsVestingVault_
    ) {
        address[7] memory addresses = [
            token_,
            engine_,
            controller_,
            genesisDistributor_,
            bondInventoryVault_,
            bondDepository_,
            opsVestingVault_
        ];
        for (uint256 i; i < addresses.length; ++i) {
            if (addresses[i] == address(0) || addresses[i].code.length == 0) revert InvalidAddress();
        }
        if (
            INARAPositionEngineV5(engine_).token() != token_
                || INARAPositionControllerV5(controller_).engine() != engine_
                || INARAPositionControllerV5(controller_).token() != token_
                || INARABondInventoryVaultV5(bondInventoryVault_).token() != token_
                || INARABondInventoryVaultV5(bondInventoryVault_).depository() != bondDepository_
        ) revert InvalidAddress();

        token = token_;
        engine = engine_;
        controller = controller_;
        genesisDistributor = genesisDistributor_;
        bondInventoryVault = bondInventoryVault_;
        bondDepository = bondDepository_;
        opsVestingVault = opsVestingVault_;
    }

    function getProtocolStats() external view returns (ProtocolStats memory stats) {
        INARAPositionEngineV5 targetEngine = INARAPositionEngineV5(engine);
        INARAGenesisDistributorV5 genesis = INARAGenesisDistributorV5(genesisDistributor);
        INARABondInventoryVaultV5 inventory = INARABondInventoryVaultV5(bondInventoryVault);
        INARABondDepositoryV5 bonds = INARABondDepositoryV5(bondDepository);
        INARAOpsVestingVaultV5 ops = INARAOpsVestingVaultV5(opsVestingVault);

        stats.fixedSupply = IERC20(token).totalSupply();
        stats.totalLocked = targetEngine.totalLocked();
        stats.activeWeight = targetEngine.totalActiveWeight();
        stats.enginePositionCount = targetEngine.positionCount();
        stats.positionNftSupply = INARAPositionControllerV5(controller).totalSupply();
        stats.currentEpoch = targetEngine.currentEpoch();
        stats.targetEpoch = targetEngine.targetEpoch();
        stats.genesisAllocation = genesis.allocation();
        stats.genesisClaimed = genesis.totalClaimed();
        stats.genesisFunded = genesis.funded();
        stats.genesisClosed = genesis.closed();
        stats.bondAllocation = inventory.allocation();
        stats.bondDistributed = inventory.distributed();
        stats.bondInventoryFunded = inventory.funded();
        stats.bondMarketActive = bonds.active();
        stats.bondMarketPermanentlyClosed = bonds.permanentlyClosed();
        stats.bondRemainingCapacity = bonds.remainingCapacity();
        stats.bondTotalPayout = bonds.totalPayout();
        stats.opsAllocation = ops.allocation();
        stats.opsReleased = ops.released();
        stats.opsReleasable = ops.releasable();
        stats.opsFunded = ops.funded();
    }
}
