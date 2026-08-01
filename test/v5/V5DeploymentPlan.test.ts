import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

import {
  CANONICAL_BASE_DEPENDENCIES,
  CANONICAL_NFT_BOND_MODULE_ID,
  REQUIRED_V5_DECISIONS,
  V5_CHANGE_ID,
  type SafeConfiguration,
  type V5DeploymentConfiguration,
} from "../../scripts/v5/lib/v5ReleaseGate.js";
import {
  V5_CREATE2_FACTORY_CONFIGURATION_HASH,
  V5_COMPONENT_DEFINITIONS,
  V5_COMPONENT_ORDER,
  V5_EXTERNAL_DEPENDENCY_ORDER,
  V5_POST_DEPLOY_ACTION_ORDER,
  buildV5CompleteStackDeploymentPlan,
  v5ComponentSalt,
  v5ConstructorInputHash,
  type V5CompleteStackDeploymentPlan,
  type V5CompleteStackDeploymentPlanInput,
  type V5ComponentId,
  type V5ComponentInput,
  type V5ComponentInputs,
  type V5ConstructorArgumentMap,
  type V5EngineParameters,
  type V5ExternalDependencyPreconditionInputs,
  type V5PoolKey,
} from "../../scripts/v5/lib/v5DeploymentPlan.js";

const abi = ethers.AbiCoder.defaultAbiCoder();
const HOOK_PERMISSION_MASK = (1n << 14n) - 1n;
const HOOK_PERMISSION_BITS = 0x20ccn;

function hash(label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

function address(value: number | bigint): string {
  return ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(value), 20));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

type ConstructorAbiEntry = {
  type: string;
  inputs?: Array<{ type: string }>;
};

async function artifactConstructorTypes(name: string): Promise<string[]> {
  const artifact = await hre.artifacts.readArtifact(name);
  const constructor = (artifact.abi as ConstructorAbiEntry[]).find(
    (entry) => entry.type === "constructor"
  );
  if (constructor?.inputs === undefined) {
    throw new Error(`${name} constructor ABI is missing`);
  }
  return constructor.inputs.map((input) => input.type);
}

function makeSafe(safeAddress: string, ownerOffset: number): SafeConfiguration {
  return {
    address: safeAddress,
    owners: Array.from({ length: 5 }, (_, index) =>
      address(ownerOffset + index)
    ),
    threshold: 3,
    timelockSeconds: 3_600n,
    modules: [],
    guard: null,
    fallbackHandler: null,
  };
}

type RehearsalRecord = {
  plan: V5CompleteStackDeploymentPlan;
  allAddresses: string[];
};

function createPlanInput(
  environment: "rehearsal" | "production",
  rehearsal: RehearsalRecord | null = null
): V5CompleteStackDeploymentPlanInput {
  const admin = address(environment === "rehearsal" ? 10 : 110);
  const treasury = address(environment === "rehearsal" ? 11 : 111);
  const recovery = address(environment === "rehearsal" ? 12 : 112);
  const opsBeneficiary = address(environment === "rehearsal" ? 13 : 113);
  const operationsAuthority = address(environment === "rehearsal" ? 14 : 114);
  const unclaimedRecipient = address(environment === "rehearsal" ? 16 : 116);
  const create2Factory = address(environment === "rehearsal" ? 9_000 : 19_000);
  const sourceCommit = "a".repeat(40);
  const recoveryDelay = environment === "rehearsal" ? 3_600n : 604_800n;
  const deploymentDomain = environment === "rehearsal" ? 0 : 1;
  const totalSupply = 1_000_003n;
  const reserveAmount = 400_001n;
  const opsAmount = 100_000n;
  const genesisAmount = 100_001n;
  const bondAmount = 50_000n;
  const seedNara = 200_001n;
  const compounderNara = 50_000n;
  const treasuryResidual = 100_000n;
  const genesisRoot = hash(`${environment}:genesis-root`);
  const genesisDeadline = 1_900_000_000n;
  const executionWindow = {
    notBefore: 1_785_000_000n,
    deadline: 1_785_086_400n,
  };
  const engineParameters: V5EngineParameters = {
    epochOrigin: executionWindow.deadline + 3_600n,
    epochLength: 60n,
    minLockDuration: 600n,
    maxLockDuration: 3_600n,
    maxAdvancePerCall: 64,
    minWeightMultiplierWad: 1_000_000_000_000_000_000n,
    maxWeightMultiplierWad: 4_000_000_000_000_000_000n,
    emissionPerEpoch: 1_000n,
    emissionBootstrapWeight: 1_000n,
    minimumRewardWeight: 1_000n,
  };
  const liquidityBootstrap = {
    seedConfiguredMinimumNaraUsed: 170_000n,
    seedConfiguredMinimumUsdcUsed: 170_000_000n,
    seedInitialMinimumNaraUsed: 180_000n,
    seedInitialMinimumUsdcUsed: 180_000_000n,
    seedMinimumLiquidity: 1_000n,
    seedDeadline: executionWindow.deadline + 7_200n,
    compounderMaximumNara: compounderNara,
    compounderMaximumUsdc: 50_000_000n,
    compounderConfiguredMinimumNaraUsed: 40_000n,
    compounderConfiguredMinimumUsdcUsed: 40_000_000n,
    compounderInitialMinimumNaraUsed: 45_000n,
    compounderInitialMinimumUsdcUsed: 45_000_000n,
    compounderMinimumLiquidity: 1_000n,
    compounderDeadline: executionWindow.deadline + 7_200n,
    compounderReceiptId: hash(`${environment}:compounder-bootstrap-receipt`),
  };
  const componentInputs: Partial<V5ComponentInputs> = {};
  const predictedContracts: Record<string, string> = {};
  const saltContext = {
    changeId: V5_CHANGE_ID,
    environment,
    chainId: 8453n,
    sourceCommit,
    create2Factory,
  };

  function addComponent<K extends V5ComponentId>(
    id: K,
    constructorArguments: V5ConstructorArgumentMap[K],
    mineHook = false
  ): string {
    const constructorInputHash = v5ConstructorInputHash(
      id,
      constructorArguments
    );
    const initCodeHash = hash(`${environment}:${id}:init-code`);
    const runtimeCodeHash = hash(`${environment}:${id}:runtime-code`);
    const artifactEvidenceHash = hash(`${environment}:${id}:artifact-evidence`);
    const constructorApprovalHash = hash(
      `${environment}:${id}:constructor-approval`
    );
    let saltNonce = mineHook
      ? environment === "rehearsal"
        ? 54_835n
        : 7_390n
      : BigInt(V5_COMPONENT_ORDER.indexOf(id) + 1);
    let salt = v5ComponentSalt(
      saltContext,
      id,
      constructorInputHash,
      runtimeCodeHash,
      artifactEvidenceHash,
      constructorApprovalHash,
      saltNonce
    );
    let predictedAddress = ethers.getCreate2Address(
      create2Factory,
      salt,
      initCodeHash
    );
    if (mineHook) {
      if (
        (BigInt(predictedAddress) & HOOK_PERMISSION_MASK) !==
        HOOK_PERMISSION_BITS
      ) {
        throw new Error(
          "test fixture Hook nonce no longer mines the required permission bits"
        );
      }
    }
    const component: V5ComponentInput<K> = {
      predictedAddress,
      saltNonce,
      initCodeHash,
      runtimeCodeHash,
      artifactEvidenceHash,
      constructorApprovalHash,
      constructorArguments,
    };
    Object.assign(componentInputs, { [id]: component });
    predictedContracts[id] = predictedAddress;
    return predictedAddress;
  }

  const token = addComponent("token", [
    "NARA",
    "NARA",
    18,
    totalSupply,
    treasury,
  ]);
  const reserve = addComponent("rewardReserve", [
    admin,
    recovery,
    token,
    reserveAmount,
  ]);
  const engine = addComponent("engine", [
    admin,
    token,
    CANONICAL_BASE_DEPENDENCIES.usdc,
    reserve,
    treasury,
    engineParameters,
  ]);
  const renderer = addComponent("positionRenderer", [
    "NARA Position",
    "Canonical NARA V5 position",
    "ipfs://nara-v5-position",
  ]);
  const positionController = addComponent("positionController", [
    engine,
    renderer,
    "NARA Position V5",
    "NARAP-V5",
  ]);
  const opsVault = addComponent("opsVestingVault", [
    token,
    treasury,
    opsBeneficiary,
    opsAmount,
    1_800_000_000n,
    1_800_000_100n,
    1_800_001_000n,
  ]);
  const genesis = addComponent("genesisDistributor", [
    token,
    treasury,
    unclaimedRecipient,
    genesisAmount,
    hash(`${environment}:genesis-domain`),
    genesisRoot,
    genesisDeadline,
  ]);
  const bondDepository = addComponent("bondDepository", [
    token,
    CANONICAL_BASE_DEPENDENCIES.usdc,
    positionController,
    admin,
    treasury,
    3_600n,
    bondAmount,
    10_000n,
    1_000_000n,
    1n,
    1n,
    2_000_000_000_000n,
    600n,
    3_600n,
    86_400n,
    recovery,
    recoveryDelay,
  ]);
  const bondInventory = addComponent("bondInventoryVault", [
    token,
    treasury,
    bondDepository,
    bondAmount,
    recovery,
    recoveryDelay,
  ]);
  const liquidityVault = addComponent("liquidityVault", [
    admin,
    recovery,
    token,
    CANONICAL_BASE_DEPENDENCIES.usdc,
    CANONICAL_BASE_DEPENDENCIES.poolManager,
    2_500,
  ]);
  const liquidityHook = addComponent(
    "liquidityHook",
    [
      CANONICAL_BASE_DEPENDENCIES.poolManager,
      admin,
      token,
      CANONICAL_BASE_DEPENDENCIES.usdc,
      liquidityVault,
      1n << 96n,
      1_000n,
      10_000n,
      10_000n,
      [1_250, 1_000, 750, 500],
      [2_000n, 3_000n, 4_000n, 5_000n],
    ],
    true
  );
  const currencies = [token, CANONICAL_BASE_DEPENDENCIES.usdc].sort(
    (left, right) => (BigInt(left) < BigInt(right) ? -1 : 1)
  );
  const poolKey: V5PoolKey = {
    currency0: currencies[0],
    currency1: currencies[1],
    fee: 3_000,
    tickSpacing: 60,
    hooks: liquidityHook,
  };
  const poolId = ethers.keccak256(
    abi.encode(
      [
        "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
      ],
      [poolKey]
    )
  );
  const seedCustody = addComponent("seedPolCustody", [
    admin,
    recovery,
    CANONICAL_BASE_DEPENDENCIES.positionManager,
    poolId,
    -120,
    120,
    deploymentDomain,
    recoveryDelay,
  ]);
  const compounder = addComponent("liquidityCompounder", [
    admin,
    operationsAuthority,
    recovery,
    token,
    CANONICAL_BASE_DEPENDENCIES.usdc,
    CANONICAL_BASE_DEPENDENCIES.poolManager,
    CANONICAL_BASE_DEPENDENCIES.positionManager,
    liquidityVault,
    poolId,
    -120,
    120,
    liquidityBootstrap.compounderConfiguredMinimumNaraUsed,
    liquidityBootstrap.compounderConfiguredMinimumUsdcUsed,
    deploymentDomain,
    recoveryDelay,
  ]);
  const scheduleHash = ethers.keccak256(
    abi.encode(
      ["uint16[]", "uint128[]"],
      [
        [1_500, 1_250, 1_000, 750, 500],
        [1_000n, 2_000n, 3_000n, 4_000n, 5_000n],
      ]
    )
  );
  const phaseController = addComponent("liquidityPhaseController", [
    admin,
    recovery,
    CANONICAL_BASE_DEPENDENCIES.poolManager,
    CANONICAL_BASE_DEPENDENCIES.positionManager,
    liquidityVault,
    seedCustody,
    compounder,
    poolId,
    scheduleHash,
    [60n, 60n, 60n, 60n],
    [2, 2, 2, 2],
    deploymentDomain,
    recoveryDelay,
  ]);
  const seedInitializer = addComponent("seedPositionInitializer", [
    treasury,
    token,
    CANONICAL_BASE_DEPENDENCIES.usdc,
    CANONICAL_BASE_DEPENDENCIES.poolManager,
    CANONICAL_BASE_DEPENDENCIES.positionManager,
    CANONICAL_BASE_DEPENDENCIES.permit2,
    seedCustody,
    liquidityBootstrap.seedConfiguredMinimumNaraUsed,
    liquidityBootstrap.seedConfiguredMinimumUsdcUsed,
    poolKey,
    -120,
    120,
  ]);
  const adapter = addComponent("liquidityPositionAdapter", [
    token,
    CANONICAL_BASE_DEPENDENCIES.usdc,
    CANONICAL_BASE_DEPENDENCIES.poolManager,
    CANONICAL_BASE_DEPENDENCIES.positionManager,
    CANONICAL_BASE_DEPENDENCIES.permit2,
    compounder,
    poolKey,
    -120,
    120,
  ]);
  const userRouter = addComponent("userRouter", [token, positionController]);
  const positionDataLens = addComponent("positionDataLens", [
    positionController,
  ]);
  const dashboardLens = addComponent("dashboardLens", [
    token,
    positionController,
    positionDataLens,
  ]);
  const engineOperationsRouter = addComponent("engineOperationsRouter", [
    engine,
    64,
  ]);
  const protocolStatsLens = addComponent("protocolStatsLens", [
    token,
    engine,
    positionController,
    genesis,
    bondInventory,
    bondDepository,
    opsVault,
  ]);
  const circulatingSupply = addComponent("circulatingSupply", [
    token,
    [reserve, opsVault, genesis, bondInventory, seedCustody, compounder],
  ]);
  void seedInitializer;
  void adapter;
  void userRouter;
  void dashboardLens;
  void engineOperationsRouter;
  void protocolStatsLens;
  void circulatingSupply;

  const components = componentInputs as V5ComponentInputs;
  expect(Object.keys(components).sort()).to.deep.equal(
    [...V5_COMPONENT_ORDER].sort()
  );
  const positionAccountImplementation = {
    expectedAddress: ethers.getCreateAddress({
      from: positionController,
      nonce: 1,
    }),
    runtimeCodeHash: hash(`${environment}:position-account:runtime-code`),
    artifactEvidenceHash: hash(
      `${environment}:position-account:artifact-evidence`
    ),
  };
  const deploymentRoot = {
    expectedAddress: create2Factory,
    runtimeCodeHash: hash(`${environment}:create2-factory:runtime-code`),
    observedRuntimeCodeHash: hash(
      `${environment}:create2-factory:runtime-code`
    ),
    runtimeCodeObservationEvidenceHash: hash(
      `${environment}:create2-factory:runtime-observation`
    ),
    artifactEvidenceHash: hash(
      `${environment}:create2-factory:artifact-evidence`
    ),
    expectedConfigurationHash: V5_CREATE2_FACTORY_CONFIGURATION_HASH,
  };
  const externalDependencies = Object.fromEntries(
    V5_EXTERNAL_DEPENDENCY_ORDER.map((id) => {
      const runtimeCodeHash = hash(
        `${environment}:external:${id}:runtime-code`
      );
      return [
        id,
        {
          expectedAddress: CANONICAL_BASE_DEPENDENCIES[id],
          runtimeCodeHash,
          observedRuntimeCodeHash: runtimeCodeHash,
          runtimeCodeObservationEvidenceHash: hash(
            `${environment}:external:${id}:runtime-observation`
          ),
          artifactEvidenceHash: hash(
            `${environment}:external:${id}:artifact-evidence`
          ),
        },
      ];
    })
  ) as V5ExternalDependencyPreconditionInputs;
  const retirementEvidenceHash = hash("rehearsal-retirement-evidence");
  const release: V5DeploymentConfiguration = {
    changeId: V5_CHANGE_ID,
    environment,
    chainId: 8453n,
    sourceCommit,
    configurationDomain: `nara-v5:${environment}`,
    publicActivationAllowed: environment === "production",
    external: CANONICAL_BASE_DEPENDENCIES,
    predictedContracts,
    custody: {
      admin: makeSafe(admin, environment === "rehearsal" ? 1_000 : 2_000),
      treasury: makeSafe(treasury, environment === "rehearsal" ? 1_100 : 2_100),
      recovery,
    },
    token: {
      name: "NARA",
      symbol: "NARA",
      decimals: 18,
      fixedSupply: totalSupply,
      permit: true,
      erc1363: false,
      multicall: false,
      flashMint: { enabled: false },
    },
    allocations: [
      { id: "reserve", recipient: reserve, amount: reserveAmount },
      { id: "ops", recipient: opsVault, amount: opsAmount },
      { id: "genesis", recipient: genesis, amount: genesisAmount },
      { id: "bonds", recipient: treasury, amount: bondAmount },
      { id: "seed-pol", recipient: seedCustody, amount: seedNara },
      { id: "compounder-pol", recipient: compounder, amount: compounderNara },
      { id: "treasury", recipient: treasury, amount: treasuryResidual },
    ],
    holderTreatment: {
      mode: "snapshot-claim",
      evidenceHash: hash(`${environment}:holder-treatment`),
      snapshotBlock: 36_000_000n,
      snapshotBlockHash: hash(`${environment}:snapshot-block`),
      merkleRoot: genesisRoot,
      claimRatioNumerator: 1n,
      claimRatioDenominator: 1n,
      claimDeadline: genesisDeadline,
      unclaimedRecipient,
    },
    engine: {
      epochLengthSeconds: 60n,
      configurationDelaySeconds: 3_600n,
      reserveAmount,
      modelConfigurationHash: hash(`${environment}:engine-model`),
      feeConfigurationHash: hash(`${environment}:engine-fees`),
      rewardConfigurationHash: hash(`${environment}:engine-rewards`),
    },
    modules: {
      launch: ["opsVestingVault", "genesisDistributor"],
      deployedClosed: [CANONICAL_NFT_BOND_MODULE_ID],
      deferred: [],
    },
    liquidity: {
      expectedSqrtPriceX96: 1n << 96n,
      seedTokenAmount: seedNara,
      seedUsdcAmount: 200_000_000n,
      minimumTokenTrade: 10_000n,
      minimumUsdcTrade: 10_000n,
      feePhasesBps: [1_500, 1_250, 1_000, 750, 500],
      phaseMinimumActiveLiquidity: [1_000n, 2_000n, 3_000n, 4_000n, 5_000n],
      phaseObservationSeconds: [0n, 60n, 60n, 60n, 60n],
      engineShareBps: 2_500,
      compoundMinimumLiquidity: 500n,
      rangeTickLower: -120,
      rangeTickUpper: 120,
    },
    recovery: {
      delaySeconds: recoveryDelay,
      authority: recovery,
      recipient: recovery,
      irreversiblySealed: true,
    },
    approvals: REQUIRED_V5_DECISIONS.map((decision) => ({
      decision,
      evidenceHash: hash(`${environment}:approval:${decision}`),
      approvedAt: "2026-08-01T12:00:00.000Z",
      approvedBy: "NARA V5 Safe",
    })),
    rehearsalRetirementProofHash:
      environment === "production" ? retirementEvidenceHash : null,
    deniedRehearsalAddresses:
      environment === "production" ? [...(rehearsal?.allAddresses ?? [])] : [],
  };
  const input: V5CompleteStackDeploymentPlanInput = {
    release,
    create2Factory,
    deploymentRoot,
    externalDependencies,
    evidence: {
      sourceArtifactsHash: hash(`${environment}:source-artifacts`),
      externalDependenciesHash: hash(`${environment}:external-dependencies`),
      custodyRoleMatrixHash: hash(`${environment}:custody-role-matrix`),
      economicSimulationHash: hash(`${environment}:economic-simulation`),
      deploymentRunbookHash: hash(`${environment}:deployment-runbook`),
      postDeploymentActionsApprovalHash: hash(
        `${environment}:post-deploy-actions`
      ),
      activationApprovalHash: hash(`${environment}:activation-approval`),
      productionDeploymentApprovalHash:
        environment === "production"
          ? hash("production-deployment-approval")
          : null,
    },
    retiredRehearsal:
      environment === "production"
        ? {
            manifestDigest: rehearsal?.plan.manifestDigest ?? ethers.ZeroHash,
            retirementEvidenceHash,
            componentAddresses: [...(rehearsal?.allAddresses ?? [])],
          }
        : null,
    allocationBindings: {
      opsVestingVault: "ops",
      genesisDistributor: "genesis",
      bondInventoryVault: "bonds",
      seedPolCustody: "seed-pol",
      liquidityCompounder: "compounder-pol",
    },
    executionWindow,
    liquidityBootstrap,
    positionAccountImplementation,
    components,
  };
  return input;
}

function replaceEngineParameters(
  input: V5CompleteStackDeploymentPlanInput,
  update: Partial<V5EngineParameters>
): void {
  const args = input.components.engine.constructorArguments;
  input.components.engine.constructorArguments = [
    args[0],
    args[1],
    args[2],
    args[3],
    args[4],
    { ...args[5], ...update },
  ];
}

function replaceBondDepositoryArgument(
  input: V5CompleteStackDeploymentPlanInput,
  index: number,
  value: string | bigint
): void {
  const args = [...input.components.bondDepository.constructorArguments];
  args[index] = value;
  input.components.bondDepository.constructorArguments =
    args as unknown as V5ConstructorArgumentMap["bondDepository"];
}

function replaceBondInventoryArgument(
  input: V5CompleteStackDeploymentPlanInput,
  index: number,
  value: string | bigint
): void {
  const args = [...input.components.bondInventoryVault.constructorArguments];
  args[index] = value;
  input.components.bondInventoryVault.constructorArguments =
    args as unknown as V5ConstructorArgumentMap["bondInventoryVault"];
}

describe("V5 complete-stack deployment plan", function () {
  this.timeout(120_000);

  let rehearsalInput: V5CompleteStackDeploymentPlanInput;
  let rehearsalPlan: V5CompleteStackDeploymentPlan;
  let productionInput: V5CompleteStackDeploymentPlanInput;

  before(() => {
    rehearsalInput = createPlanInput("rehearsal");
    rehearsalPlan = buildV5CompleteStackDeploymentPlan(rehearsalInput);
    const allAddresses = [
      ...V5_COMPONENT_ORDER.map(
        (id) => rehearsalInput.components[id].predictedAddress
      ),
      rehearsalInput.positionAccountImplementation.expectedAddress,
    ];
    productionInput = createPlanInput("production", {
      plan: rehearsalPlan,
      allAddresses,
    });
  });

  it("builds the deterministic rehearsal plan with current constructors and the complete action DAG", async () => {
    const reordered = clone(rehearsalInput);
    reordered.components = Object.fromEntries(
      Object.entries(reordered.components).reverse()
    ) as V5ComponentInputs;
    reordered.release.predictedContracts = Object.fromEntries(
      Object.entries(reordered.release.predictedContracts).reverse()
    );
    const rebuilt = buildV5CompleteStackDeploymentPlan(reordered);

    expect(rebuilt).to.deep.equal(rehearsalPlan);
    expect(
      rehearsalPlan.components.map((component) => component.id)
    ).to.deep.equal(V5_COMPONENT_ORDER);
    expect(
      rehearsalPlan.postDeploymentActions.map((action) => action.id)
    ).to.deep.equal(V5_POST_DEPLOY_ACTION_ORDER);
    expect(rehearsalPlan.nestedContracts).to.have.length(1);
    expect(rehearsalPlan.deploymentRoot.expectedAddress).to.equal(
      rehearsalInput.create2Factory
    );
    expect(rehearsalPlan.deploymentRoot.expectedConfigurationHash).to.equal(
      V5_CREATE2_FACTORY_CONFIGURATION_HASH
    );
    expect(
      rehearsalPlan.externalDependencies.map((dependency) => dependency.id)
    ).to.deep.equal(V5_EXTERNAL_DEPENDENCY_ORDER);
    expect(
      rehearsalPlan.components.some(
        (component) =>
          component.predictedAddress === rehearsalPlan.create2Factory
      )
    ).to.equal(false);
    expect(rehearsalPlan.nestedContracts[0].expectedAddress).to.equal(
      ethers.getCreateAddress({
        from: rehearsalInput.components.positionController.predictedAddress,
        nonce: 1,
      })
    );
    expect(V5_COMPONENT_DEFINITIONS.engine.constructorTypes[5]).to.include(
      "emissionBootstrapWeight"
    );
    expect(V5_COMPONENT_DEFINITIONS.engine.constructorTypes[5]).to.include(
      "minimumRewardWeight"
    );
    expect(
      V5_COMPONENT_DEFINITIONS.genesisDistributor.constructorTypes
    ).to.have.length(7);
    expect(
      V5_COMPONENT_DEFINITIONS.bondDepository.constructorTypes
    ).to.have.length(17);
    expect(
      V5_COMPONENT_DEFINITIONS.bondInventoryVault.constructorTypes
    ).to.have.length(6);
    expect(
      await artifactConstructorTypes(
        "contracts/v5/modules/NARANFTBondDepositoryV5.sol:NARANFTBondDepositoryV5"
      )
    ).to.deep.equal(V5_COMPONENT_DEFINITIONS.bondDepository.constructorTypes);
    expect(
      await artifactConstructorTypes(
        "contracts/v5/modules/NARABondInventoryVaultV5.sol:NARABondInventoryVaultV5"
      )
    ).to.deep.equal(
      V5_COMPONENT_DEFINITIONS.bondInventoryVault.constructorTypes
    );
    expect(
      V5_COMPONENT_DEFINITIONS.liquidityHook.constructorTypes
    ).to.have.length(11);
    expect(
      V5_COMPONENT_DEFINITIONS.liquidityCompounder.constructorTypes
    ).to.have.length(15);
    expect(
      V5_COMPONENT_DEFINITIONS.seedPositionInitializer.constructorTypes
    ).to.have.length(12);
    expect(
      rehearsalPlan.postDeploymentActions.find(
        (action) => action.id === "initializeSeedPosition"
      )?.functionSignature
    ).to.equal("initialize(uint256,uint256,uint256,uint256,uint128,uint64)");
    expect(
      rehearsalPlan.postDeploymentActions.find(
        (action) => action.id === "initializeCompounderPosition"
      )?.functionSignature
    ).to.equal(
      "compoundBanked(bytes32,uint256,uint256,uint256,uint256,uint128,uint64)"
    );
    expect(
      rehearsalPlan.postDeploymentActions.find(
        (action) => action.id === "registerSeedPosition"
      )?.callDataHash
    ).to.equal(null);
    expect(
      rehearsalPlan.postDeploymentActions.some((action) =>
        action.id.includes("BondInventoryFunding")
      )
    ).to.equal(false);
    const activation = rehearsalPlan.postDeploymentActions.filter(
      (action) => action.phase === "activation"
    );
    expect(activation.map((action) => action.id)).to.deep.equal([
      "sealEngine",
      "sealLiquidityVault",
      "sealLiquidityPhaseController",
      "activateLiquidityHook",
    ]);
    expect(
      new Set(activation.map((action) => action.atomicGroup))
    ).to.deep.equal(new Set(["v5-final-activation"]));
    for (const component of rehearsalPlan.components) {
      expect(component.initCodeHash).to.match(/^0x[0-9a-f]{64}$/);
      expect(component.runtimeCodeHash).to.match(/^0x[0-9a-f]{64}$/);
      expect(component.constructorInputHash).to.match(/^0x[0-9a-f]{64}$/);
      expect(component.salt).to.match(/^0x[0-9a-f]{64}$/);
    }
    expect(rehearsalPlan.manifestDigest).to.match(/^0x[0-9a-f]{64}$/);
  });

  it("builds production only with a retired complete rehearsal and disjoint addresses", () => {
    const plan = buildV5CompleteStackDeploymentPlan(clone(productionInput));
    expect(plan.environment).to.equal("production");
    const rehearsalAddresses = new Set([
      ...rehearsalPlan.components.map(
        (component) => component.predictedAddress
      ),
      ...rehearsalPlan.nestedContracts.map(
        (component) => component.expectedAddress
      ),
    ]);
    expect(
      plan.components.every(
        (component) => !rehearsalAddresses.has(component.predictedAddress)
      )
    ).to.equal(true);
    expect(
      plan.nestedContracts.every(
        (component) => !rehearsalAddresses.has(component.expectedAddress)
      )
    ).to.equal(true);
  });

  it("rejects non-Base plans and invalid rehearsal or production recovery delays", () => {
    const wrongChain = clone(rehearsalInput);
    wrongChain.release.chainId = 31_337n;
    expect(() => buildV5CompleteStackDeploymentPlan(wrongChain)).to.throw(
      /Base chain ID 8453/
    );

    const wrongRehearsalDelay = clone(rehearsalInput);
    wrongRehearsalDelay.release.recovery.delaySeconds = 7_200n;
    expect(() =>
      buildV5CompleteStackDeploymentPlan(wrongRehearsalDelay)
    ).to.throw(/rehearsal recovery/);

    const shortProductionDelay = clone(productionInput);
    shortProductionDelay.release.recovery.delaySeconds = 604_799n;
    expect(() =>
      buildV5CompleteStackDeploymentPlan(shortProductionDelay)
    ).to.throw(/production recovery/);
  });

  it("rejects production address reuse, incomplete retirement, blanks, and missing production approval", () => {
    const reused = clone(productionInput);
    const rehearsalToken = rehearsalInput.components.token.predictedAddress;
    reused.components.token.predictedAddress = rehearsalToken;
    reused.release.predictedContracts.token = rehearsalToken;
    expect(() => buildV5CompleteStackDeploymentPlan(reused)).to.throw(
      /reuses a rehearsal address/
    );

    const incompleteRetirement = clone(productionInput);
    incompleteRetirement.retiredRehearsal?.componentAddresses.pop();
    expect(() =>
      buildV5CompleteStackDeploymentPlan(incompleteRetirement)
    ).to.throw(/complete rehearsal stack/);

    const blankRenderer = clone(productionInput);
    const rendererArgs =
      blankRenderer.components.positionRenderer.constructorArguments;
    blankRenderer.components.positionRenderer.constructorArguments = [
      rendererArgs[0],
      "",
      rendererArgs[2],
    ];
    expect(() => buildV5CompleteStackDeploymentPlan(blankRenderer)).to.throw(
      /cannot be blank/
    );

    const noApproval = clone(productionInput);
    noApproval.evidence.productionDeploymentApprovalHash = null;
    expect(() => buildV5CompleteStackDeploymentPlan(noApproval)).to.throw(
      /productionDeploymentApprovalHash/
    );
  });

  it("rejects allocation drift, funded bond routing, and holder-treatment divergence", () => {
    const drift = clone(rehearsalInput);
    const opsArgs = drift.components.opsVestingVault.constructorArguments;
    drift.components.opsVestingVault.constructorArguments = [
      opsArgs[0],
      opsArgs[1],
      opsArgs[2],
      opsArgs[3] + 1n,
      opsArgs[4],
      opsArgs[5],
      opsArgs[6],
    ];
    expect(() => buildV5CompleteStackDeploymentPlan(drift)).to.throw(
      /opsVestingVault allocation/
    );

    const fundedBondDestination = clone(rehearsalInput);
    const bondAllocation = fundedBondDestination.release.allocations.find(
      (entry) => entry.id === "bonds"
    );
    if (bondAllocation === undefined)
      throw new Error("missing fixture bond allocation");
    bondAllocation.recipient =
      fundedBondDestination.components.bondInventoryVault.predictedAddress;
    expect(() =>
      buildV5CompleteStackDeploymentPlan(fundedBondDestination)
    ).to.throw(/bond inventory allocation recipient/);

    const wrongRoot = clone(rehearsalInput);
    const genesisArgs =
      wrongRoot.components.genesisDistributor.constructorArguments;
    wrongRoot.components.genesisDistributor.constructorArguments = [
      genesisArgs[0],
      genesisArgs[1],
      genesisArgs[2],
      genesisArgs[3],
      genesisArgs[4],
      hash("wrong-root"),
      genesisArgs[6],
    ];
    expect(() => buildV5CompleteStackDeploymentPlan(wrongRoot)).to.throw(
      /root differs from holder-treatment/
    );
  });

  it("binds the closed bond ceiling, recovery, term lifetime, and Engine lock envelope", () => {
    const bondArgs =
      rehearsalInput.components.bondDepository.constructorArguments;
    const inventoryArgs =
      rehearsalInput.components.bondInventoryVault.constructorArguments;
    expect(bondArgs[6]).to.equal(inventoryArgs[3]);
    expect(bondArgs[15]).to.equal(rehearsalInput.release.recovery.recipient);
    expect(bondArgs[16]).to.equal(rehearsalInput.release.recovery.delaySeconds);
    expect(inventoryArgs[4]).to.equal(bondArgs[15]);
    expect(inventoryArgs[5]).to.equal(bondArgs[16]);
    expect(inventoryArgs[4]).to.equal(
      rehearsalInput.release.recovery.recipient
    );
    expect(inventoryArgs[5]).to.equal(
      rehearsalInput.release.recovery.delaySeconds
    );
    expect(
      rehearsalPlan.postDeploymentActions.some((action) =>
        action.id.includes("BondInventoryFunding")
      )
    ).to.equal(false);

    const capacityDrift = clone(rehearsalInput);
    replaceBondDepositoryArgument(capacityDrift, 6, bondArgs[6] + 1n);
    expect(() => buildV5CompleteStackDeploymentPlan(capacityDrift)).to.throw(
      /bondDepository maximum capacity/
    );

    const payoutAboveCapacity = clone(rehearsalInput);
    replaceBondDepositoryArgument(payoutAboveCapacity, 9, bondArgs[6] + 1n);
    expect(() =>
      buildV5CompleteStackDeploymentPlan(payoutAboveCapacity)
    ).to.throw(/bond minimum payout exceeds the immutable maximum capacity/);

    const shortActivation = clone(rehearsalInput);
    replaceBondDepositoryArgument(shortActivation, 5, 3_599n);
    expect(() => buildV5CompleteStackDeploymentPlan(shortActivation)).to.throw(
      /activation delay must be between one hour/
    );

    const zeroTermLifetime = clone(rehearsalInput);
    replaceBondDepositoryArgument(zeroTermLifetime, 14, 0n);
    expect(() => buildV5CompleteStackDeploymentPlan(zeroTermLifetime)).to.throw(
      /constructor argument 14 must be positive/
    );

    const longTermLifetime = clone(rehearsalInput);
    replaceBondDepositoryArgument(
      longTermLifetime,
      14,
      30n * 24n * 60n * 60n + 1n
    );
    expect(() => buildV5CompleteStackDeploymentPlan(longTermLifetime)).to.throw(
      /maximum term duration exceeds 30 days/
    );

    const shortBondLock = clone(rehearsalInput);
    replaceBondDepositoryArgument(shortBondLock, 12, 599n);
    expect(() => buildV5CompleteStackDeploymentPlan(shortBondLock)).to.throw(
      /bond minimum lock is below the Engine minimum lock/
    );

    const longBondLock = clone(rehearsalInput);
    replaceBondDepositoryArgument(longBondLock, 13, 3_601n);
    expect(() => buildV5CompleteStackDeploymentPlan(longBondLock)).to.throw(
      /bond maximum lock exceeds the Engine maximum lock/
    );

    const wrongDepositoryRecoveryRecipient = clone(rehearsalInput);
    replaceBondDepositoryArgument(
      wrongDepositoryRecoveryRecipient,
      15,
      address(999_000)
    );
    expect(() =>
      buildV5CompleteStackDeploymentPlan(wrongDepositoryRecoveryRecipient)
    ).to.throw(/bondDepository inventory recovery recipient/);

    const wrongDepositoryRecoveryDelay = clone(rehearsalInput);
    replaceBondDepositoryArgument(
      wrongDepositoryRecoveryDelay,
      16,
      rehearsalInput.release.recovery.delaySeconds + 1n
    );
    expect(() =>
      buildV5CompleteStackDeploymentPlan(wrongDepositoryRecoveryDelay)
    ).to.throw(/bondDepository inventory recovery delay/);

    const wrongRecoveryRecipient = clone(rehearsalInput);
    replaceBondInventoryArgument(wrongRecoveryRecipient, 4, address(999_001));
    expect(() =>
      buildV5CompleteStackDeploymentPlan(wrongRecoveryRecipient)
    ).to.throw(/bondInventoryVault recovery recipient/);

    const wrongRecoveryDelay = clone(rehearsalInput);
    replaceBondInventoryArgument(
      wrongRecoveryDelay,
      5,
      rehearsalInput.release.recovery.delaySeconds + 1n
    );
    expect(() =>
      buildV5CompleteStackDeploymentPlan(wrongRecoveryDelay)
    ).to.throw(/bondInventoryVault recovery delay/);

    const excessiveRecoveryDelay = clone(productionInput);
    const aboveVaultMaximum = 365n * 24n * 60n * 60n + 1n;
    excessiveRecoveryDelay.release.recovery.delaySeconds = aboveVaultMaximum;
    replaceBondDepositoryArgument(
      excessiveRecoveryDelay,
      16,
      aboveVaultMaximum
    );
    replaceBondInventoryArgument(excessiveRecoveryDelay, 5, aboveVaultMaximum);
    expect(() =>
      buildV5CompleteStackDeploymentPlan(excessiveRecoveryDelay)
    ).to.throw(/recovery delay is outside constructor bounds/);
  });

  it("rejects release or constructor Hook-curve drift and invalid permission mining", () => {
    const releaseCurve = clone(rehearsalInput);
    releaseCurve.release.liquidity.feePhasesBps = [
      1_500, 1_250, 1_000, 750, 499,
    ];
    expect(() => buildV5CompleteStackDeploymentPlan(releaseCurve)).to.throw(
      /Hook fee curve differs/
    );

    const constructorCurve = clone(rehearsalInput);
    const hookArgs =
      constructorCurve.components.liquidityHook.constructorArguments;
    constructorCurve.components.liquidityHook.constructorArguments = [
      hookArgs[0],
      hookArgs[1],
      hookArgs[2],
      hookArgs[3],
      hookArgs[4],
      hookArgs[5],
      hookArgs[6],
      hookArgs[7],
      hookArgs[8],
      [1_250, 1_000, 750, 499],
      hookArgs[10],
    ];
    expect(() => buildV5CompleteStackDeploymentPlan(constructorCurve)).to.throw(
      /later-phase fee curve/
    );

    const zeroNonce = clone(rehearsalInput);
    zeroNonce.components.liquidityHook.saltNonce = 0n;
    expect(() => buildV5CompleteStackDeploymentPlan(zeroNonce)).to.throw(
      /nonzero approved mining nonce/
    );

    const changedNonce = clone(rehearsalInput);
    changedNonce.components.liquidityHook.saltNonce += 1n;
    expect(() => buildV5CompleteStackDeploymentPlan(changedNonce)).to.throw(
      /CREATE2 salt and init-code hash/
    );
  });

  it("rejects blank external addresses, custody collisions, and missing code or review evidence", () => {
    const blankExternal = clone(rehearsalInput);
    (blankExternal.release.external as unknown as Record<string, string>).usdc =
      "";
    expect(() => buildV5CompleteStackDeploymentPlan(blankExternal)).to.throw(
      /release.external.usdc cannot be blank/
    );

    const custodyCollision = clone(rehearsalInput);
    custodyCollision.release.custody.recovery =
      custodyCollision.release.custody.admin.address;
    custodyCollision.release.recovery.authority =
      custodyCollision.release.custody.admin.address;
    expect(() => buildV5CompleteStackDeploymentPlan(custodyCollision)).to.throw(
      /custody cannot collide/
    );

    const missingEvidence = clone(rehearsalInput);
    missingEvidence.evidence.economicSimulationHash = ethers.ZeroHash;
    expect(() => buildV5CompleteStackDeploymentPlan(missingEvidence)).to.throw(
      /economicSimulationHash cannot be zero/
    );

    const missingRuntime = clone(rehearsalInput);
    missingRuntime.components.engine.runtimeCodeHash = ethers.ZeroHash;
    expect(() => buildV5CompleteStackDeploymentPlan(missingRuntime)).to.throw(
      /runtimeCodeHash cannot be zero/
    );
  });

  it("pins the deployment root and every external dependency to independently observed code", () => {
    const missingFactoryCode = clone(rehearsalInput);
    missingFactoryCode.deploymentRoot.runtimeCodeHash = ethers.ZeroHash;
    expect(() =>
      buildV5CompleteStackDeploymentPlan(missingFactoryCode)
    ).to.throw(/deploymentRoot.runtimeCodeHash cannot be zero/);

    const wrongFactoryAddress = clone(rehearsalInput);
    wrongFactoryAddress.deploymentRoot.expectedAddress = address(99_999);
    expect(() =>
      buildV5CompleteStackDeploymentPlan(wrongFactoryAddress)
    ).to.throw(/deploymentRoot.expectedAddress does not match/);

    const wrongFactoryConfiguration = clone(rehearsalInput);
    wrongFactoryConfiguration.deploymentRoot.expectedConfigurationHash =
      hash("not-the-v5-factory");
    expect(() =>
      buildV5CompleteStackDeploymentPlan(wrongFactoryConfiguration)
    ).to.throw(/expected configuration differs/);

    const wrongCodeAtCanonicalUsdc = clone(rehearsalInput);
    wrongCodeAtCanonicalUsdc.externalDependencies.usdc.observedRuntimeCodeHash =
      hash("wrong-usdc-code");
    expect(() =>
      buildV5CompleteStackDeploymentPlan(wrongCodeAtCanonicalUsdc)
    ).to.throw(/usdc observed runtime code differs/);

    const missingPermit2 = clone(rehearsalInput);
    delete (
      missingPermit2.externalDependencies as Partial<V5ExternalDependencyPreconditionInputs>
    ).permit2;
    expect(() => buildV5CompleteStackDeploymentPlan(missingPermit2)).to.throw(
      /exact reviewed Base dependency set/
    );

    const changedFactoryCode = clone(rehearsalInput);
    const replacementRuntime = hash("approved-replacement-factory-runtime");
    changedFactoryCode.deploymentRoot.runtimeCodeHash = replacementRuntime;
    changedFactoryCode.deploymentRoot.observedRuntimeCodeHash =
      replacementRuntime;
    const changedPlan = buildV5CompleteStackDeploymentPlan(changedFactoryCode);
    expect(changedPlan.components).to.deep.equal(rehearsalPlan.components);
    expect(changedPlan.manifestDigest).not.to.equal(
      rehearsalPlan.manifestDigest
    );
  });

  it("rejects stale execution windows and undeployable Engine/bootstrap economics", () => {
    const staleEpoch = clone(rehearsalInput);
    staleEpoch.executionWindow.deadline =
      staleEpoch.components.engine.constructorArguments[5].epochOrigin + 1n;
    expect(() => buildV5CompleteStackDeploymentPlan(staleEpoch)).to.throw(
      /engine epoch origin can be stale/
    );

    const zeroBootstrapWeight = clone(rehearsalInput);
    replaceEngineParameters(zeroBootstrapWeight, {
      emissionBootstrapWeight: 0n,
    });
    expect(() =>
      buildV5CompleteStackDeploymentPlan(zeroBootstrapWeight)
    ).to.throw(/emissionBootstrapWeight/);

    const zeroDilutedEmission = clone(rehearsalInput);
    replaceEngineParameters(zeroDilutedEmission, {
      emissionPerEpoch: 1n,
      emissionBootstrapWeight: 1_000_000n,
      minimumRewardWeight: 1n,
    });
    expect(() =>
      buildV5CompleteStackDeploymentPlan(zeroDilutedEmission)
    ).to.throw(/rounds eligible emissions to zero/);

    const seedFloor = clone(rehearsalInput);
    seedFloor.liquidityBootstrap.seedInitialMinimumNaraUsed =
      seedFloor.release.liquidity.seedTokenAmount + 1n;
    expect(() => buildV5CompleteStackDeploymentPlan(seedFloor)).to.throw(
      /seed configured or initial minimum-usage floors/
    );

    const excessiveEngineShare = clone(rehearsalInput);
    excessiveEngineShare.release.liquidity.engineShareBps = 5_001;
    const vaultArgs =
      excessiveEngineShare.components.liquidityVault.constructorArguments;
    excessiveEngineShare.components.liquidityVault.constructorArguments = [
      vaultArgs[0],
      vaultArgs[1],
      vaultArgs[2],
      vaultArgs[3],
      vaultArgs[4],
      5_001,
    ];
    expect(() =>
      buildV5CompleteStackDeploymentPlan(excessiveEngineShare)
    ).to.throw(/Engine share is invalid/);
  });

  it("rejects token-feature decisions that the immutable token bytecode does not implement", () => {
    const erc1363 = clone(rehearsalInput);
    erc1363.release.token.erc1363 = true;
    expect(() => buildV5CompleteStackDeploymentPlan(erc1363)).to.throw(
      /does not implement ERC-1363/
    );

    const noPermit = clone(rehearsalInput);
    noPermit.release.token.permit = false;
    expect(() => buildV5CompleteStackDeploymentPlan(noPermit)).to.throw(
      /requires the approved Permit/
    );
  });

  it("binds bootstrap/action changes into the action and final manifest digests", () => {
    const changed = clone(rehearsalInput);
    changed.liquidityBootstrap.compounderReceiptId = hash(
      "different-compounder-receipt"
    );
    const plan = buildV5CompleteStackDeploymentPlan(changed);
    expect(plan.components).to.deep.equal(rehearsalPlan.components);
    expect(plan.setupActionsDigest).not.to.equal(
      rehearsalPlan.setupActionsDigest
    );
    expect(plan.manifestDigest).not.to.equal(rehearsalPlan.manifestDigest);
  });
});
