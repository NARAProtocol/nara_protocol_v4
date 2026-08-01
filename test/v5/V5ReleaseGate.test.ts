import { expect } from "chai";
import { ethers } from "ethers";
import {
  APPROVED_HOOK_FEE_PHASES_BPS,
  CANONICAL_BASE_DEPENDENCIES,
  CANONICAL_NFT_BOND_MODULE_ID,
  MINIMUM_PRODUCTION_RECOVERY_DELAY_SECONDS,
  REQUIRED_V5_DECISIONS,
  V5_CHANGE_ID,
  v5DeploymentConfigurationHash,
  validateV5DeploymentConfiguration,
  type V5DeploymentConfiguration,
} from "../../scripts/v5/lib/v5ReleaseGate.js";

const hash = (seed: string) => ethers.keccak256(ethers.toUtf8Bytes(seed));
const address = (value: number) =>
  ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);

function fixture(
  environment: "rehearsal" | "production" = "rehearsal"
): V5DeploymentConfiguration {
  const production = environment === "production";
  const adminOwners = [
    address(101),
    address(102),
    address(103),
    address(104),
    address(105),
  ];
  const treasuryOwners = [
    address(111),
    address(112),
    address(113),
    address(114),
    address(115),
  ];
  return {
    changeId: V5_CHANGE_ID,
    environment,
    chainId: production ? 8453n : 31_337n,
    sourceCommit: "ab".repeat(20),
    configurationDomain: `nara-v5:${environment}`,
    publicActivationAllowed: production,
    external: { ...CANONICAL_BASE_DEPENDENCIES },
    predictedContracts: {
      token: address(201),
      engine: address(202),
      reserve: address(203),
      vault: address(204),
      controller: address(205),
      custody: address(206),
      compounder: address(207),
      hook: address(208),
    },
    custody: {
      admin: {
        address: address(10),
        owners: adminOwners,
        threshold: 3,
        timelockSeconds: production ? 172_800n : 0n,
        modules: [],
        guard: null,
        fallbackHandler: null,
      },
      treasury: {
        address: address(11),
        owners: treasuryOwners,
        threshold: 3,
        timelockSeconds: 0n,
        modules: [],
        guard: null,
        fallbackHandler: null,
      },
      recovery: address(10),
    },
    token: {
      name: production
        ? "Explicit production identity"
        : "NARA V5 REHEARSAL - NOT PRODUCTION",
      symbol: production ? "EXPLICIT" : "rNARA5",
      decimals: 18,
      fixedSupply: 1_000_003n,
      permit: true,
      erc1363: false,
      multicall: false,
      flashMint: { enabled: false },
    },
    allocations: [
      { id: "reserve", recipient: address(203), amount: 400_001n },
      { id: "pol", recipient: address(206), amount: 250_001n },
      { id: "claims", recipient: address(210), amount: 100_001n },
      { id: "ops", recipient: address(211), amount: 100_000n },
      { id: "treasury", recipient: address(11), amount: 100_000n },
      { id: "bonds", recipient: address(11), amount: 50_000n },
    ],
    holderTreatment: {
      mode: "none",
      evidenceHash: hash("explicit-no-migration"),
    },
    engine: {
      epochLengthSeconds: 60n,
      configurationDelaySeconds: production ? 172_800n : 0n,
      reserveAmount: 400_001n,
      modelConfigurationHash: hash("model"),
      feeConfigurationHash: hash("fees"),
      rewardConfigurationHash: hash("rewards"),
    },
    modules: {
      launch: ["token", "engine", "reserve", "positions", "liquidity"],
      deployedClosed: [CANONICAL_NFT_BOND_MODULE_ID],
      deferred: ["raw-bonds", "staking", "pendle", "fractionalization"],
    },
    liquidity: {
      expectedSqrtPriceX96: 1n << 96n,
      seedTokenAmount: 100_003n,
      seedUsdcAmount: 1_001n,
      minimumTokenTrade: 10_000n,
      minimumUsdcTrade: 10_000n,
      feePhasesBps: [...APPROVED_HOOK_FEE_PHASES_BPS],
      phaseMinimumActiveLiquidity: [100n, 150n, 200n, 300n, 500n],
      phaseObservationSeconds: [0n, 600n, 600n, 600n, 600n],
      engineShareBps: 2_500,
      compoundMinimumLiquidity: 1n,
      rangeTickLower: -887_220,
      rangeTickUpper: 887_220,
    },
    recovery: {
      delaySeconds: production
        ? MINIMUM_PRODUCTION_RECOVERY_DELAY_SECONDS
        : 3_600n,
      authority: address(10),
      recipient: address(10),
      irreversiblySealed: true,
    },
    approvals: REQUIRED_V5_DECISIONS.map((decision) => ({
      decision,
      evidenceHash: hash(`approval:${decision}:${environment}`),
      approvedAt: "2026-08-01T00:00:00.000Z",
      approvedBy: "human-decision-record",
    })),
    rehearsalRetirementProofHash: production ? hash("retired-rehearsal") : null,
    deniedRehearsalAddresses: production ? [address(301), address(302)] : [],
  };
}

describe("V5 release configuration gate", function () {
  it("accepts an explicit disposable rehearsal configuration and hashes it deterministically", function () {
    const config = fixture();
    expect(() => validateV5DeploymentConfiguration(config)).not.to.throw();
    expect(v5DeploymentConfigurationHash(config)).to.match(/^0x[0-9a-f]{64}$/);
    const reordered = {
      ...config,
      predictedContracts: { ...config.predictedContracts },
    };
    expect(v5DeploymentConfigurationHash(reordered)).to.equal(
      v5DeploymentConfigurationHash(config)
    );
  });

  it("accepts a separately configured production candidate only with seven-day recovery and rehearsal proof", function () {
    expect(() =>
      validateV5DeploymentConfiguration(fixture("production"))
    ).not.to.throw();
  });

  it("rejects one-hour production and any publicly activatable rehearsal", function () {
    const production = fixture("production");
    production.recovery.delaySeconds = 3_600n;
    expect(() => validateV5DeploymentConfiguration(production)).to.throw(
      "at least seven days"
    );

    const rehearsal = fixture();
    rehearsal.publicActivationAllowed = true;
    expect(() => validateV5DeploymentConfiguration(rehearsal)).to.throw(
      "cannot allow public activation"
    );
  });

  it("rejects Hook fee drift, a 100% Engine route, and non-increasing POL thresholds", function () {
    const feeDrift = fixture();
    feeDrift.liquidity.feePhasesBps = [1_500, 1_250, 1_000, 750, 400];
    expect(() => validateV5DeploymentConfiguration(feeDrift)).to.throw(
      "Hook fee curve differs"
    );

    const engineEscape = fixture();
    engineEscape.liquidity.engineShareBps = 10_000;
    expect(() => validateV5DeploymentConfiguration(engineEscape)).to.throw(
      "below 100%"
    );

    const thresholdDrift = fixture();
    thresholdDrift.liquidity.phaseMinimumActiveLiquidity = [
      100n,
      150n,
      150n,
      300n,
      500n,
    ];
    expect(() => validateV5DeploymentConfiguration(thresholdDrift)).to.throw(
      "strictly increasing"
    );
  });

  it("rejects missing approvals and allocation drift", function () {
    const missingApproval = fixture();
    missingApproval.approvals.pop();
    expect(() => validateV5DeploymentConfiguration(missingApproval)).to.throw(
      "missing approvals"
    );

    const allocationDrift = fixture();
    allocationDrift.allocations[1].amount -= 1n;
    expect(() => validateV5DeploymentConfiguration(allocationDrift)).to.throw(
      "do not equal fixed supply"
    );
  });

  it("requires one positive Treasury-held latent bond allocation", function () {
    const zeroBonds = fixture();
    const zeroBondAllocation = zeroBonds.allocations.find(
      (allocation) => allocation.id === "bonds"
    );
    const zeroBondTreasury = zeroBonds.allocations.find(
      (allocation) => allocation.id === "treasury"
    );
    if (zeroBondAllocation === undefined || zeroBondTreasury === undefined)
      throw new Error("missing bond fixture");
    zeroBondTreasury.amount += zeroBondAllocation.amount;
    zeroBondAllocation.amount = 0n;
    expect(() => validateV5DeploymentConfiguration(zeroBonds)).to.throw(
      "bonds allocation must be positive"
    );

    const wrongRecipient = fixture();
    const wrongBondAllocation = wrongRecipient.allocations.find(
      (allocation) => allocation.id === "bonds"
    );
    if (wrongBondAllocation === undefined)
      throw new Error("missing bond fixture");
    wrongBondAllocation.recipient = address(212);
    expect(() => validateV5DeploymentConfiguration(wrongRecipient)).to.throw(
      "bond inventory allocation recipient"
    );
  });

  it("rejects the old NFT-bond alias and any non-closed canonical bucket", function () {
    const oldAlias = fixture();
    oldAlias.modules.deployedClosed = ["nft-bonds"];
    expect(() => validateV5DeploymentConfiguration(oldAlias)).to.throw(
      "nft-bonds is not a canonical V5 module id"
    );

    const launched = fixture();
    launched.modules.deployedClosed = [];
    launched.modules.launch.push(CANONICAL_NFT_BOND_MODULE_ID);
    expect(() => validateV5DeploymentConfiguration(launched)).to.throw(
      "cannot be a launch module"
    );

    const deferred = fixture();
    deferred.modules.deployedClosed = [];
    deferred.modules.deferred.push(CANONICAL_NFT_BOND_MODULE_ID);
    expect(() => validateV5DeploymentConfiguration(deferred)).to.throw(
      "cannot be deferred"
    );
  });

  it("rejects V4 and retired rehearsal address reuse", function () {
    const v4Reuse = fixture();
    v4Reuse.predictedContracts.token =
      "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A";
    expect(() => validateV5DeploymentConfiguration(v4Reuse)).to.throw(
      "forbidden V4 address"
    );

    const rehearsalReuse = fixture("production");
    rehearsalReuse.predictedContracts.hook =
      rehearsalReuse.deniedRehearsalAddresses[0];
    expect(() => validateV5DeploymentConfiguration(rehearsalReuse)).to.throw(
      "reuses a rehearsal address"
    );
  });

  it("rejects incomplete custody and production evidence", function () {
    const sharedSafe = fixture();
    sharedSafe.custody.treasury.address = sharedSafe.custody.admin.address;
    expect(() => validateV5DeploymentConfiguration(sharedSafe)).to.throw(
      "Safes must be separate"
    );

    const missingProof = fixture("production");
    missingProof.rehearsalRetirementProofHash = null;
    expect(() => validateV5DeploymentConfiguration(missingProof)).to.throw(
      "rehearsalRetirementProofHash"
    );

    const weakSafe = fixture("production");
    weakSafe.custody.admin.owners = weakSafe.custody.admin.owners.slice(0, 3);
    expect(() => validateV5DeploymentConfiguration(weakSafe)).to.throw(
      "at least five production owners"
    );
  });

  it("rejects forbidden legacy modules and malformed holder-snapshot evidence", function () {
    const legacy = fixture();
    legacy.modules.deferred.push("jackpot-v5");
    expect(() => validateV5DeploymentConfiguration(legacy)).to.throw(
      "forbidden legacy module"
    );

    const migration = fixture();
    migration.holderTreatment = {
      mode: "snapshot-claim",
      evidenceHash: hash("migration"),
      snapshotBlock: 1n,
      snapshotBlockHash: ethers.ZeroHash,
      merkleRoot: hash("root"),
      claimRatioNumerator: 1n,
      claimRatioDenominator: 1n,
      claimDeadline: 1n,
      unclaimedRecipient: address(11),
    };
    expect(() => validateV5DeploymentConfiguration(migration)).to.throw(
      "snapshotBlockHash cannot be zero"
    );
  });
});
