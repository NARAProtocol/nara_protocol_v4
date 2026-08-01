import { ethers } from "ethers";
import {
  APPROVED_HOOK_FEE_PHASES_BPS,
  BASE_CHAIN_ID,
  CANONICAL_BASE_DEPENDENCIES,
  CANONICAL_NFT_BOND_MODULE_ID,
  MINIMUM_PRODUCTION_RECOVERY_DELAY_SECONDS,
  REHEARSAL_RECOVERY_DELAY_SECONDS,
  v5DeploymentConfigurationHash,
  validateV5DeploymentConfiguration,
  type V5DeploymentConfiguration,
} from "./v5ReleaseGate.js";

export const V5_EXTERNAL_DEPENDENCY_ORDER = Object.freeze([
  "usdc",
  "poolManager",
  "positionManager",
  "permit2",
  "universalRouter",
] as const);

export type V5ExternalDependencyId =
  (typeof V5_EXTERNAL_DEPENDENCY_ORDER)[number];

export const V5_COMPONENT_ORDER = Object.freeze([
  "token",
  "rewardReserve",
  "engine",
  "positionRenderer",
  "positionController",
  "opsVestingVault",
  "genesisDistributor",
  "bondDepository",
  "bondInventoryVault",
  "liquidityVault",
  "liquidityHook",
  "seedPolCustody",
  "liquidityCompounder",
  "liquidityPhaseController",
  "seedPositionInitializer",
  "liquidityPositionAdapter",
  "userRouter",
  "positionDataLens",
  "dashboardLens",
  "engineOperationsRouter",
  "protocolStatsLens",
  "circulatingSupply",
] as const);

export type V5ComponentId = (typeof V5_COMPONENT_ORDER)[number];

export const V5_POST_DEPLOY_ACTION_ORDER = Object.freeze([
  "confirmFinalRoleAssignments",
  "confirmPositionAccountImplementation",
  "approveRewardReserveFunding",
  "fundRewardReserve",
  "bindRewardReserveEngine",
  "bindEnginePositionController",
  "bindEngineLiquidityVault",
  "sealRewardReserve",
  "approveOpsVestingFunding",
  "fundOpsVestingVault",
  "approveGenesisFunding",
  "fundGenesisDistributor",
  "bindBondInventoryVault",
  "bindHookPhaseController",
  "initializeCanonicalPool",
  "approveSeedNaraFunding",
  "approveSeedUsdcFunding",
  "initializeSeedPosition",
  "registerSeedPosition",
  "sealSeedPolCustody",
  "sealLiquidityCompounder",
  "fundCompounderNara",
  "fundCompounderUsdc",
  "initializeCompounderPosition",
  "confirmAllocationReconciliation",
  "sealEngine",
  "sealLiquidityVault",
  "sealLiquidityPhaseController",
  "activateLiquidityHook",
] as const);

export type V5PostDeployActionId = (typeof V5_POST_DEPLOY_ACTION_ORDER)[number];

export type V5EngineParameters = {
  epochOrigin: bigint;
  epochLength: bigint;
  minLockDuration: bigint;
  maxLockDuration: bigint;
  maxAdvancePerCall: number;
  minWeightMultiplierWad: bigint;
  maxWeightMultiplierWad: bigint;
  emissionPerEpoch: bigint;
  emissionBootstrapWeight: bigint;
  minimumRewardWeight: bigint;
};

export type V5PoolKey = {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
};

export type V5ConstructorArgumentMap = {
  token: readonly [string, string, number, bigint, string];
  rewardReserve: readonly [string, string, string, bigint];
  engine: readonly [string, string, string, string, string, V5EngineParameters];
  positionRenderer: readonly [string, string, string];
  positionController: readonly [string, string, string, string];
  opsVestingVault: readonly [
    string,
    string,
    string,
    bigint,
    bigint,
    bigint,
    bigint
  ];
  genesisDistributor: readonly [
    string,
    string,
    string,
    bigint,
    string,
    string,
    bigint
  ];
  bondDepository: readonly [
    string,
    string,
    string,
    string,
    string,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    string,
    bigint
  ];
  bondInventoryVault: readonly [string, string, string, bigint, string, bigint];
  liquidityVault: readonly [string, string, string, string, string, number];
  seedPolCustody: readonly [
    string,
    string,
    string,
    string,
    number,
    number,
    number,
    bigint
  ];
  liquidityCompounder: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    number,
    number,
    bigint,
    bigint,
    number,
    bigint
  ];
  liquidityPhaseController: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    readonly [bigint, bigint, bigint, bigint],
    readonly [number, number, number, number],
    number,
    bigint
  ];
  liquidityHook: readonly [
    string,
    string,
    string,
    string,
    string,
    bigint,
    bigint,
    bigint,
    bigint,
    readonly number[],
    readonly bigint[]
  ];
  liquidityPositionAdapter: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    V5PoolKey,
    number,
    number
  ];
  seedPositionInitializer: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    bigint,
    bigint,
    V5PoolKey,
    number,
    number
  ];
  userRouter: readonly [string, string];
  positionDataLens: readonly [string];
  dashboardLens: readonly [string, string, string];
  engineOperationsRouter: readonly [string, number];
  protocolStatsLens: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string
  ];
  circulatingSupply: readonly [string, readonly string[]];
};

export type V5ComponentInput<K extends V5ComponentId = V5ComponentId> = {
  predictedAddress: string;
  saltNonce: bigint;
  initCodeHash: string;
  runtimeCodeHash: string;
  artifactEvidenceHash: string;
  constructorApprovalHash: string;
  constructorArguments: V5ConstructorArgumentMap[K];
};

export type V5ComponentInputs = {
  [K in V5ComponentId]: V5ComponentInput<K>;
};

export type V5PlanEvidence = {
  sourceArtifactsHash: string;
  externalDependenciesHash: string;
  custodyRoleMatrixHash: string;
  economicSimulationHash: string;
  deploymentRunbookHash: string;
  postDeploymentActionsApprovalHash: string;
  activationApprovalHash: string;
  productionDeploymentApprovalHash: string | null;
};

export type V5LiquidityBootstrapPlan = {
  seedConfiguredMinimumNaraUsed: bigint;
  seedConfiguredMinimumUsdcUsed: bigint;
  seedInitialMinimumNaraUsed: bigint;
  seedInitialMinimumUsdcUsed: bigint;
  seedMinimumLiquidity: bigint;
  seedDeadline: bigint;
  compounderMaximumNara: bigint;
  compounderMaximumUsdc: bigint;
  compounderConfiguredMinimumNaraUsed: bigint;
  compounderConfiguredMinimumUsdcUsed: bigint;
  compounderInitialMinimumNaraUsed: bigint;
  compounderInitialMinimumUsdcUsed: bigint;
  compounderMinimumLiquidity: bigint;
  compounderDeadline: bigint;
  compounderReceiptId: string;
};

export type V5PositionAccountImplementationInput = {
  expectedAddress: string;
  runtimeCodeHash: string;
  artifactEvidenceHash: string;
};

export type V5RuntimeCodePreconditionInput = {
  expectedAddress: string;
  /** Runtime hash approved from the reviewed artifact or authoritative upstream release. */
  runtimeCodeHash: string;
  /** Runtime hash independently observed at expectedAddress for this plan. */
  observedRuntimeCodeHash: string;
  runtimeCodeObservationEvidenceHash: string;
  artifactEvidenceHash: string;
};

export type V5DeploymentRootPreconditionInput =
  V5RuntimeCodePreconditionInput & {
    expectedConfigurationHash: string;
  };

/**
 * Per-address runtime observations for every dependency admitted by the release
 * object. Production evidence for a proxy must additionally pin its observed
 * implementation/admin/beacon slots (as applicable), and token evidence must
 * pin decimals, supply, and transfer-behaviour invariants. An extcodehash of a
 * proxy shell alone is not sufficient evidence of the implementation in use.
 */
export type V5ExternalDependencyPreconditionInputs = {
  [K in V5ExternalDependencyId]: V5RuntimeCodePreconditionInput;
};

export type V5RetiredRehearsal = {
  manifestDigest: string;
  retirementEvidenceHash: string;
  componentAddresses: string[];
};

export type V5CompleteStackDeploymentPlanInput = {
  release: V5DeploymentConfiguration;
  create2Factory: string;
  deploymentRoot: V5DeploymentRootPreconditionInput;
  externalDependencies: V5ExternalDependencyPreconditionInputs;
  evidence: V5PlanEvidence;
  retiredRehearsal: V5RetiredRehearsal | null;
  allocationBindings: {
    opsVestingVault: string;
    genesisDistributor: string;
    bondInventoryVault: string;
    seedPolCustody: string;
    liquidityCompounder: string;
  };
  executionWindow: {
    notBefore: bigint;
    deadline: bigint;
  };
  liquidityBootstrap: V5LiquidityBootstrapPlan;
  positionAccountImplementation: V5PositionAccountImplementationInput;
  components: V5ComponentInputs;
};

export type V5ComponentPlanSpec = {
  order: number;
  id: V5ComponentId;
  contractName: string;
  predictedAddress: string;
  salt: string;
  saltNonce: bigint;
  initCodeHash: string;
  runtimeCodeHash: string;
  constructorTypes: readonly string[];
  constructorInputHash: string;
  artifactEvidenceHash: string;
  constructorApprovalHash: string;
};

export type V5PostDeploymentActionSpec = {
  order: number;
  id: string;
  phase: "setup" | "activation";
  atomicGroup: string | null;
  kind: "call" | "runtime-derived-call" | "assertion";
  actor: string | null;
  target: string | null;
  functionSignature: string;
  argumentTypes: readonly string[];
  argumentSources: readonly string[];
  argumentsHash: string;
  callDataHash: string | null;
  approvalEvidenceHash: string;
  actionHash: string;
};

export type V5NestedContractSpec = {
  id: "positionAccountImplementation";
  contractName: "NARAPositionAccountV5";
  deployer: string;
  createNonce: bigint;
  expectedAddress: string;
  runtimeCodeHash: string;
  artifactEvidenceHash: string;
  specHash: string;
};

export type V5DeploymentRootPreconditionSpec = {
  id: "create2Factory";
  contractName: "NARACreate2FactoryV5";
  expectedAddress: string;
  runtimeCodeHash: string;
  observedRuntimeCodeHash: string;
  runtimeCodeObservationEvidenceHash: string;
  artifactEvidenceHash: string;
  expectedConfigurationHash: string;
  specHash: string;
};

export type V5ExternalDependencyPreconditionSpec = {
  order: number;
  id: V5ExternalDependencyId;
  expectedAddress: string;
  runtimeCodeHash: string;
  observedRuntimeCodeHash: string;
  runtimeCodeObservationEvidenceHash: string;
  artifactEvidenceHash: string;
  specHash: string;
};

export type V5CompleteStackDeploymentPlan = {
  changeId: string;
  environment: "rehearsal" | "production";
  chainId: bigint;
  sourceCommit: string;
  create2Factory: string;
  deploymentRoot: V5DeploymentRootPreconditionSpec;
  externalDependencies: readonly V5ExternalDependencyPreconditionSpec[];
  releaseConfigurationHash: string;
  evidenceDigest: string;
  components: readonly V5ComponentPlanSpec[];
  nestedContracts: readonly [V5NestedContractSpec];
  postDeploymentActions: readonly V5PostDeploymentActionSpec[];
  setupActionsDigest: string;
  activationActionDigest: string;
  manifestDigest: string;
};

type ComponentDefinition = {
  contractName: string;
  constructorTypes: readonly string[];
};

const ENGINE_CONFIG_TYPE =
  "tuple(uint64 epochOrigin,uint64 epochLength,uint64 minLockDuration,uint64 maxLockDuration,uint32 maxAdvancePerCall,uint256 minWeightMultiplierWad,uint256 maxWeightMultiplierWad,uint256 emissionPerEpoch,uint256 emissionBootstrapWeight,uint256 minimumRewardWeight)";
const POOL_KEY_TYPE =
  "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";

export const V5_COMPONENT_DEFINITIONS: Readonly<
  Record<V5ComponentId, ComponentDefinition>
> = Object.freeze({
  token: {
    contractName: "NARATokenV5",
    constructorTypes: ["string", "string", "uint8", "uint256", "address"],
  },
  rewardReserve: {
    contractName: "NARARewardReserveV5",
    constructorTypes: ["address", "address", "address", "uint256"],
  },
  engine: {
    contractName: "NARAEngineV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      ENGINE_CONFIG_TYPE,
    ],
  },
  positionRenderer: {
    contractName: "NARACanonicalPositionRendererV5",
    constructorTypes: ["string", "string", "string"],
  },
  positionController: {
    contractName: "NARAPositionNFTV5",
    constructorTypes: ["address", "address", "string", "string"],
  },
  opsVestingVault: {
    contractName: "NARAOpsVestingVaultV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "uint256",
      "uint64",
      "uint64",
      "uint64",
    ],
  },
  genesisDistributor: {
    contractName: "NARAGenesisDistributorV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "uint256",
      "bytes32",
      "bytes32",
      "uint64",
    ],
  },
  bondDepository: {
    contractName: "NARANFTBondDepositoryV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      "uint64",
      "uint128",
      "uint128",
      "uint128",
      "uint128",
      "uint128",
      "uint128",
      "uint64",
      "uint64",
      "uint64",
      "address",
      "uint64",
    ],
  },
  bondInventoryVault: {
    contractName: "NARABondInventoryVaultV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "uint256",
      "address",
      "uint64",
    ],
  },
  liquidityVault: {
    contractName: "NARALiquidityGrowthVaultV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      "uint16",
    ],
  },
  seedPolCustody: {
    contractName: "NARASeedPOLCustodyV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "bytes32",
      "int24",
      "int24",
      "uint8",
      "uint64",
    ],
  },
  liquidityCompounder: {
    contractName: "NARALiquidityCompounderV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      "bytes32",
      "int24",
      "int24",
      "uint256",
      "uint256",
      "uint8",
      "uint64",
    ],
  },
  liquidityPhaseController: {
    contractName: "NARALiquidityPhaseControllerV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      "bytes32",
      "bytes32",
      "uint64[4]",
      "uint8[4]",
      "uint8",
      "uint64",
    ],
  },
  liquidityHook: {
    contractName: "NARALiquidityGrowthHookV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      "uint160",
      "uint256",
      "uint256",
      "uint256",
      "uint16[]",
      "uint128[]",
    ],
  },
  liquidityPositionAdapter: {
    contractName: "NARAUniswapV4PositionAdapterV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      POOL_KEY_TYPE,
      "int24",
      "int24",
    ],
  },
  seedPositionInitializer: {
    contractName: "NARASeedPositionInitializerV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      "uint256",
      "uint256",
      POOL_KEY_TYPE,
      "int24",
      "int24",
    ],
  },
  userRouter: {
    contractName: "NARAUserRouterV5",
    constructorTypes: ["address", "address"],
  },
  positionDataLens: {
    contractName: "NARAPositionDataLensV5",
    constructorTypes: ["address"],
  },
  dashboardLens: {
    contractName: "NARADashboardLensV5",
    constructorTypes: ["address", "address", "address"],
  },
  engineOperationsRouter: {
    contractName: "NARAEngineOperationsRouterV5",
    constructorTypes: ["address", "uint32"],
  },
  protocolStatsLens: {
    contractName: "NARAProtocolStatsLensV5",
    constructorTypes: [
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
      "address",
    ],
  },
  circulatingSupply: {
    contractName: "NARACirculatingSupplyV5",
    constructorTypes: ["address", "address[]"],
  },
});

const abi = ethers.AbiCoder.defaultAbiCoder();
export const V5_CREATE2_FACTORY_FUNCTION_SIGNATURES = Object.freeze([
  "deploy(bytes32,bytes,bytes32,address)",
  "computeAddress(bytes32,bytes32)",
  "permissionBitsMatch(address,uint160,uint160)",
] as const);
export const V5_CREATE2_FACTORY_CONFIGURATION_HASH = ethers.keccak256(
  abi.encode(
    ["string", "string[]"],
    [
      "nara.v5.create2-factory.configuration.v1",
      [
        "contract:NARACreate2FactoryV5",
        "constructor:none",
        "state:stateless",
        "authority:permissionless",
        "create2-value:zero",
        ...V5_CREATE2_FACTORY_FUNCTION_SIGNATURES,
      ],
    ]
  )
);
const HOOK_PERMISSION_MASK = (1n << 14n) - 1n;
const REQUIRED_HOOK_PERMISSION_BITS =
  (1n << 13n) | (1n << 7n) | (1n << 6n) | (1n << 3n) | (1n << 2n);
const CANONICAL_POOL_FEE = 3_000;
const CANONICAL_TICK_SPACING = 60;

function requireCondition(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

function requireNonZeroHash(value: string, label: string): string {
  requireCondition(
    /^0x[0-9a-fA-F]{64}$/.test(value),
    `${label} must be bytes32`
  );
  requireCondition(
    value.toLowerCase() !== ethers.ZeroHash,
    `${label} cannot be zero`
  );
  return value.toLowerCase();
}

function normalizeAddress(value: string, label: string): string {
  requireCondition(value.trim().length > 0, `${label} cannot be blank`);
  requireCondition(ethers.isAddress(value), `${label} must be an address`);
  const normalized = ethers.getAddress(value);
  requireCondition(
    normalized !== ethers.ZeroAddress,
    `${label} cannot be zero`
  );
  return normalized;
}

function sameAddress(left: string, right: string): boolean {
  return ethers.getAddress(left) === ethers.getAddress(right);
}

function requireAddress(value: string, expected: string, label: string): void {
  normalizeAddress(value, label);
  requireCondition(
    sameAddress(value, expected),
    `${label} does not match the approved binding`
  );
}

function requireBigInt(value: bigint, expected: bigint, label: string): void {
  requireCondition(
    value === expected,
    `${label} does not match the approved value`
  );
}

function assertNoBlankStrings(value: unknown, label: string): void {
  if (typeof value === "string") {
    requireCondition(value.trim().length > 0, `${label} cannot be blank`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoBlankStrings(entry, `${label}[${index}]`)
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>
    )) {
      assertNoBlankStrings(entry, `${label}.${key}`);
    }
  }
}

function allocationAmount(
  config: V5DeploymentConfiguration,
  id: string,
  label: string
): bigint {
  requireCondition(
    id.trim().length > 0,
    `${label} allocation binding cannot be blank`
  );
  const matches = config.allocations.filter((entry) => entry.id === id);
  requireCondition(
    matches.length === 1,
    `${label} must bind exactly one allocation id`
  );
  requireCondition(
    matches[0].amount > 0n,
    `${label} allocation must be positive`
  );
  return matches[0].amount;
}

function allocationRecipient(
  config: V5DeploymentConfiguration,
  id: string,
  label: string
): string {
  const matches = config.allocations.filter((entry) => entry.id === id);
  requireCondition(
    matches.length === 1,
    `${label} must bind exactly one allocation id`
  );
  return matches[0].recipient;
}

function componentAddress(
  input: V5CompleteStackDeploymentPlanInput,
  id: V5ComponentId
): string {
  return input.components[id].predictedAddress;
}

function validatedRuntimeCodePrecondition(
  input: V5RuntimeCodePreconditionInput,
  label: string
): {
  expectedAddress: string;
  runtimeCodeHash: string;
  observedRuntimeCodeHash: string;
  runtimeCodeObservationEvidenceHash: string;
  artifactEvidenceHash: string;
} {
  const expectedAddress = normalizeAddress(
    input.expectedAddress,
    `${label}.expectedAddress`
  );
  const runtimeCodeHash = requireNonZeroHash(
    input.runtimeCodeHash,
    `${label}.runtimeCodeHash`
  );
  const observedRuntimeCodeHash = requireNonZeroHash(
    input.observedRuntimeCodeHash,
    `${label}.observedRuntimeCodeHash`
  );
  requireCondition(
    observedRuntimeCodeHash === runtimeCodeHash,
    `${label} observed runtime code differs from the approved runtime code`
  );
  return {
    expectedAddress,
    runtimeCodeHash,
    observedRuntimeCodeHash,
    runtimeCodeObservationEvidenceHash: requireNonZeroHash(
      input.runtimeCodeObservationEvidenceHash,
      `${label}.runtimeCodeObservationEvidenceHash`
    ),
    artifactEvidenceHash: requireNonZeroHash(
      input.artifactEvidenceHash,
      `${label}.artifactEvidenceHash`
    ),
  };
}

function buildDeploymentRootPrecondition(
  input: V5CompleteStackDeploymentPlanInput
): V5DeploymentRootPreconditionSpec {
  const validated = validatedRuntimeCodePrecondition(
    input.deploymentRoot,
    "deploymentRoot"
  );
  requireAddress(
    validated.expectedAddress,
    input.create2Factory,
    "deploymentRoot.expectedAddress"
  );
  const expectedConfigurationHash = requireNonZeroHash(
    input.deploymentRoot.expectedConfigurationHash,
    "deploymentRoot.expectedConfigurationHash"
  );
  requireCondition(
    expectedConfigurationHash === V5_CREATE2_FACTORY_CONFIGURATION_HASH,
    "deploymentRoot expected configuration differs from NARACreate2FactoryV5"
  );
  const specHash = ethers.keccak256(
    abi.encode(
      [
        "string",
        "string",
        "address",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
      ],
      [
        "create2Factory",
        "NARACreate2FactoryV5",
        validated.expectedAddress,
        validated.runtimeCodeHash,
        validated.observedRuntimeCodeHash,
        validated.runtimeCodeObservationEvidenceHash,
        validated.artifactEvidenceHash,
        expectedConfigurationHash,
      ]
    )
  );
  return {
    id: "create2Factory",
    contractName: "NARACreate2FactoryV5",
    ...validated,
    expectedConfigurationHash,
    specHash,
  };
}

function buildExternalDependencyPreconditions(
  input: V5CompleteStackDeploymentPlanInput
): V5ExternalDependencyPreconditionSpec[] {
  const suppliedKeys = Object.keys(input.externalDependencies).sort();
  const expectedKeys = [...V5_EXTERNAL_DEPENDENCY_ORDER].sort();
  requireCondition(
    JSON.stringify(suppliedKeys) === JSON.stringify(expectedKeys),
    "externalDependencies must contain the exact reviewed Base dependency set"
  );
  const factory = normalizeAddress(input.create2Factory, "create2Factory");
  const seen = new Set<string>();
  return V5_EXTERNAL_DEPENDENCY_ORDER.map((id, order) => {
    const validated = validatedRuntimeCodePrecondition(
      input.externalDependencies[id],
      `externalDependencies.${id}`
    );
    requireAddress(
      validated.expectedAddress,
      input.release.external[id],
      `externalDependencies.${id}.expectedAddress`
    );
    requireAddress(
      validated.expectedAddress,
      CANONICAL_BASE_DEPENDENCIES[id],
      `externalDependencies.${id}.canonicalAddress`
    );
    requireCondition(
      validated.expectedAddress !== factory,
      `${id} collides with the deployment factory`
    );
    requireCondition(
      !seen.has(validated.expectedAddress),
      `${id} reuses an external dependency address`
    );
    seen.add(validated.expectedAddress);
    const specHash = ethers.keccak256(
      abi.encode(
        [
          "uint8",
          "string",
          "address",
          "bytes32",
          "bytes32",
          "bytes32",
          "bytes32",
        ],
        [
          order,
          id,
          validated.expectedAddress,
          validated.runtimeCodeHash,
          validated.observedRuntimeCodeHash,
          validated.runtimeCodeObservationEvidenceHash,
          validated.artifactEvidenceHash,
        ]
      )
    );
    return { order, id, ...validated, specHash };
  });
}

function buildPositionAccountImplementationSpec(
  input: V5CompleteStackDeploymentPlanInput
): V5NestedContractSpec {
  const deployer = normalizeAddress(
    componentAddress(input, "positionController"),
    "positionAccountImplementation.deployer"
  );
  const expectedFromCreate = ethers.getCreateAddress({
    from: deployer,
    nonce: 1,
  });
  const suppliedAddress = normalizeAddress(
    input.positionAccountImplementation.expectedAddress,
    "positionAccountImplementation.expectedAddress"
  );
  requireCondition(
    sameAddress(suppliedAddress, expectedFromCreate),
    "position-account implementation address differs from controller CREATE nonce 1"
  );
  const runtimeCodeHash = requireNonZeroHash(
    input.positionAccountImplementation.runtimeCodeHash,
    "positionAccountImplementation.runtimeCodeHash"
  );
  const artifactEvidenceHash = requireNonZeroHash(
    input.positionAccountImplementation.artifactEvidenceHash,
    "positionAccountImplementation.artifactEvidenceHash"
  );
  const occupied = new Set([
    normalizeAddress(input.create2Factory, "create2Factory"),
    normalizeAddress(
      input.release.custody.admin.address,
      "custody.admin.address"
    ),
    normalizeAddress(
      input.release.custody.treasury.address,
      "custody.treasury.address"
    ),
    normalizeAddress(input.release.custody.recovery, "custody.recovery"),
    ...V5_EXTERNAL_DEPENDENCY_ORDER.map((id) =>
      normalizeAddress(input.release.external[id], `release.external.${id}`)
    ),
    ...V5_COMPONENT_ORDER.map((id) =>
      normalizeAddress(
        componentAddress(input, id),
        `components.${id}.predictedAddress`
      )
    ),
  ]);
  requireCondition(
    !occupied.has(suppliedAddress),
    "position-account implementation address collides with V5 custody, deployment, or external dependency"
  );
  if (input.release.environment === "production") {
    const denied = new Set(
      input.release.deniedRehearsalAddresses.map((address) =>
        ethers.getAddress(address)
      )
    );
    requireCondition(
      !denied.has(suppliedAddress),
      "position-account implementation reuses a rehearsal address"
    );
  }
  const specHash = ethers.keccak256(
    abi.encode(
      [
        "string",
        "string",
        "address",
        "uint64",
        "address",
        "bytes32",
        "bytes32",
      ],
      [
        "positionAccountImplementation",
        "NARAPositionAccountV5",
        deployer,
        1n,
        suppliedAddress,
        runtimeCodeHash,
        artifactEvidenceHash,
      ]
    )
  );
  return {
    id: "positionAccountImplementation",
    contractName: "NARAPositionAccountV5",
    deployer,
    createNonce: 1n,
    expectedAddress: suppliedAddress,
    runtimeCodeHash,
    artifactEvidenceHash,
    specHash,
  };
}

function validateEvidence(input: V5CompleteStackDeploymentPlanInput): string {
  const evidence = input.evidence;
  const hashes = [
    requireNonZeroHash(
      evidence.sourceArtifactsHash,
      "evidence.sourceArtifactsHash"
    ),
    requireNonZeroHash(
      evidence.externalDependenciesHash,
      "evidence.externalDependenciesHash"
    ),
    requireNonZeroHash(
      evidence.custodyRoleMatrixHash,
      "evidence.custodyRoleMatrixHash"
    ),
    requireNonZeroHash(
      evidence.economicSimulationHash,
      "evidence.economicSimulationHash"
    ),
    requireNonZeroHash(
      evidence.deploymentRunbookHash,
      "evidence.deploymentRunbookHash"
    ),
    requireNonZeroHash(
      evidence.postDeploymentActionsApprovalHash,
      "evidence.postDeploymentActionsApprovalHash"
    ),
    requireNonZeroHash(
      evidence.activationApprovalHash,
      "evidence.activationApprovalHash"
    ),
  ];
  if (input.release.environment === "production") {
    hashes.push(
      requireNonZeroHash(
        evidence.productionDeploymentApprovalHash ?? "",
        "evidence.productionDeploymentApprovalHash"
      )
    );
  } else {
    requireCondition(
      evidence.productionDeploymentApprovalHash === null,
      "rehearsal cannot consume a production deployment approval"
    );
  }
  return ethers.keccak256(abi.encode(["bytes32[]"], [hashes]));
}

function validateRetiredRehearsal(
  input: V5CompleteStackDeploymentPlanInput
): void {
  if (input.release.environment === "rehearsal") {
    requireCondition(
      input.retiredRehearsal === null,
      "rehearsal cannot consume a retired rehearsal manifest"
    );
    return;
  }

  const retired = input.retiredRehearsal;
  requireCondition(
    retired !== null,
    "production requires the retired rehearsal manifest"
  );
  requireNonZeroHash(retired.manifestDigest, "retiredRehearsal.manifestDigest");
  const retirementHash = requireNonZeroHash(
    retired.retirementEvidenceHash,
    "retiredRehearsal.retirementEvidenceHash"
  );
  requireCondition(
    retirementHash ===
      input.release.rehearsalRetirementProofHash?.toLowerCase(),
    "retired rehearsal evidence differs from the release approval"
  );
  requireCondition(
    retired.componentAddresses.length === V5_COMPONENT_ORDER.length + 1,
    "retired rehearsal address set must cover the complete rehearsal stack"
  );

  const denied = new Set(
    input.release.deniedRehearsalAddresses.map((address, index) =>
      normalizeAddress(address, `release.deniedRehearsalAddresses[${index}]`)
    )
  );
  const retiredAddresses = retired.componentAddresses.map((address, index) =>
    normalizeAddress(address, `retiredRehearsal.componentAddresses[${index}]`)
  );
  requireCondition(
    new Set(retiredAddresses).size === retiredAddresses.length,
    "retired rehearsal address set contains duplicates"
  );
  for (const address of retiredAddresses) {
    requireCondition(
      denied.has(address),
      "a retired rehearsal address is missing from the production denylist"
    );
  }

  const currentAddresses = new Set([
    ...V5_COMPONENT_ORDER.map((id) =>
      normalizeAddress(
        componentAddress(input, id),
        `components.${id}.predictedAddress`
      )
    ),
    normalizeAddress(
      input.positionAccountImplementation.expectedAddress,
      "positionAccountImplementation.expectedAddress"
    ),
  ]);
  for (const address of retiredAddresses) {
    requireCondition(
      !currentAddresses.has(address),
      "production reuses a retired rehearsal component address"
    );
  }
}

function validateReleaseAndAddresses(
  input: V5CompleteStackDeploymentPlanInput
): string {
  const config = input.release;
  for (const [name, address] of Object.entries(config.external)) {
    normalizeAddress(address, `release.external.${name}`);
  }
  validateV5DeploymentConfiguration(config);
  requireCondition(
    config.chainId === BASE_CHAIN_ID,
    "V5 deployment plans require Base chain ID 8453"
  );
  if (config.environment === "rehearsal") {
    requireCondition(
      config.recovery.delaySeconds === REHEARSAL_RECOVERY_DELAY_SECONDS,
      "rehearsal recovery must be exactly 3600 seconds"
    );
  } else {
    requireCondition(
      config.recovery.delaySeconds >= MINIMUM_PRODUCTION_RECOVERY_DELAY_SECONDS,
      "production recovery must be at least 604800 seconds"
    );
  }

  const factory = normalizeAddress(input.create2Factory, "create2Factory");
  const componentKeys = Object.keys(input.components).sort();
  const expectedKeys = [...V5_COMPONENT_ORDER].sort();
  requireCondition(
    JSON.stringify(componentKeys) === JSON.stringify(expectedKeys),
    "components must contain the exact complete-stack component set"
  );
  const predictedKeys = Object.keys(config.predictedContracts).sort();
  requireCondition(
    JSON.stringify(predictedKeys) === JSON.stringify(expectedKeys),
    "release.predictedContracts must contain the exact complete-stack component set"
  );

  const custodyAddresses = new Set([
    normalizeAddress(config.custody.admin.address, "custody.admin.address"),
    normalizeAddress(
      config.custody.treasury.address,
      "custody.treasury.address"
    ),
    normalizeAddress(config.custody.recovery, "custody.recovery"),
  ]);
  requireCondition(
    custodyAddresses.size === 3,
    "admin, treasury, and recovery custody cannot collide"
  );
  requireCondition(
    !custodyAddresses.has(factory),
    "deployment factory collides with custody"
  );
  const externalAddresses = new Set(
    V5_EXTERNAL_DEPENDENCY_ORDER.map((id) =>
      normalizeAddress(config.external[id], `release.external.${id}`)
    )
  );
  requireCondition(
    externalAddresses.size === V5_EXTERNAL_DEPENDENCY_ORDER.length,
    "reviewed Base dependency addresses cannot collide"
  );
  requireCondition(
    !externalAddresses.has(factory),
    "deployment factory collides with an external dependency"
  );
  for (const custody of custodyAddresses) {
    requireCondition(
      !externalAddresses.has(custody),
      "custody collides with an external dependency"
    );
  }

  const seen = new Set<string>();
  for (const id of V5_COMPONENT_ORDER) {
    const component = input.components[id];
    const predicted = normalizeAddress(
      component.predictedAddress,
      `components.${id}.predictedAddress`
    );
    requireAddress(
      predicted,
      config.predictedContracts[id],
      `components.${id}.predictedAddress`
    );
    requireCondition(!seen.has(predicted), `component address reused by ${id}`);
    requireCondition(
      !custodyAddresses.has(predicted),
      `${id} collides with custody`
    );
    requireCondition(
      !externalAddresses.has(predicted),
      `${id} collides with an external dependency`
    );
    requireCondition(
      predicted !== factory,
      `${id} collides with the deployment factory`
    );
    seen.add(predicted);
    requireCondition(
      component.saltNonce >= 0n,
      `components.${id}.saltNonce cannot be negative`
    );
    if (id === "liquidityHook") {
      requireCondition(
        component.saltNonce > 0n,
        "liquidityHook requires a nonzero approved mining nonce"
      );
    }
    requireNonZeroHash(component.initCodeHash, `components.${id}.initCodeHash`);
    requireNonZeroHash(
      component.runtimeCodeHash,
      `components.${id}.runtimeCodeHash`
    );
    requireNonZeroHash(
      component.artifactEvidenceHash,
      `components.${id}.artifactEvidenceHash`
    );
    requireNonZeroHash(
      component.constructorApprovalHash,
      `components.${id}.constructorApprovalHash`
    );
    if (config.environment === "production") {
      assertNoBlankStrings(
        component.constructorArguments,
        `components.${id}.constructorArguments`
      );
    }
  }
  return v5DeploymentConfigurationHash(config);
}

function validateAllocationBindings(
  input: V5CompleteStackDeploymentPlanInput
): void {
  const bindings = input.allocationBindings;
  const ids = [
    bindings.opsVestingVault,
    bindings.genesisDistributor,
    bindings.bondInventoryVault,
    bindings.seedPolCustody,
    bindings.liquidityCompounder,
  ];
  requireCondition(
    new Set(ids).size === ids.length,
    "module allocation bindings must be distinct"
  );
  requireBigInt(
    input.components.opsVestingVault.constructorArguments[3],
    allocationAmount(
      input.release,
      bindings.opsVestingVault,
      "opsVestingVault"
    ),
    "opsVestingVault allocation"
  );
  requireBigInt(
    input.components.genesisDistributor.constructorArguments[3],
    allocationAmount(
      input.release,
      bindings.genesisDistributor,
      "genesisDistributor"
    ),
    "genesisDistributor allocation"
  );
  requireBigInt(
    input.components.bondInventoryVault.constructorArguments[3],
    allocationAmount(
      input.release,
      bindings.bondInventoryVault,
      "bondInventoryVault"
    ),
    "bondInventoryVault allocation"
  );
  requireBigInt(
    input.release.liquidity.seedTokenAmount,
    allocationAmount(input.release, bindings.seedPolCustody, "seedPolCustody"),
    "seed POL allocation"
  );
  requireBigInt(
    input.liquidityBootstrap.compounderMaximumNara,
    allocationAmount(
      input.release,
      bindings.liquidityCompounder,
      "liquidityCompounder"
    ),
    "Compounder POL allocation"
  );

  const recipientBindings: Array<[string, string, string]> = [
    ["reserve", componentAddress(input, "rewardReserve"), "reward reserve"],
    [
      bindings.opsVestingVault,
      componentAddress(input, "opsVestingVault"),
      "ops vesting",
    ],
    [
      bindings.genesisDistributor,
      input.release.holderTreatment.mode === "snapshot-claim"
        ? componentAddress(input, "genesisDistributor")
        : input.release.custody.treasury.address,
      "Genesis",
    ],
    [
      bindings.bondInventoryVault,
      input.release.custody.treasury.address,
      "bond inventory",
    ],
    [
      bindings.seedPolCustody,
      componentAddress(input, "seedPolCustody"),
      "seed POL",
    ],
    [
      bindings.liquidityCompounder,
      componentAddress(input, "liquidityCompounder"),
      "Compounder POL",
    ],
  ];
  for (const [allocationId, recipient, label] of recipientBindings) {
    requireAddress(
      allocationRecipient(input.release, allocationId, label),
      recipient,
      `${label} allocation recipient`
    );
  }

  const explicitlyBoundIds = new Set(recipientBindings.map(([id]) => id));
  for (const allocation of input.release.allocations) {
    if (!explicitlyBoundIds.has(allocation.id)) {
      requireAddress(
        allocation.recipient,
        input.release.custody.treasury.address,
        `${allocation.id} direct residual recipient`
      );
    }
  }
  const movedFromTreasury = recipientBindings.reduce(
    (total, [id, recipient]) =>
      sameAddress(recipient, input.release.custody.treasury.address)
        ? total
        : total + allocationAmount(input.release, id, id),
    0n
  );
  const directTreasuryResidual = input.release.allocations.reduce(
    (total, allocation) =>
      sameAddress(allocation.recipient, input.release.custody.treasury.address)
        ? total + allocation.amount
        : total,
    0n
  );
  requireCondition(
    movedFromTreasury + directTreasuryResidual ===
      input.release.token.fixedSupply,
    "post-deployment allocation reconciliation differs from fixed supply"
  );
}

function validateExecutionWindow(
  input: V5CompleteStackDeploymentPlanInput
): void {
  const { notBefore, deadline } = input.executionWindow;
  const maximumUint64 = (1n << 64n) - 1n;
  requireCondition(
    notBefore > 0n && deadline > notBefore,
    "execution window is empty or reversed"
  );
  requireCondition(
    deadline <= maximumUint64,
    "execution window exceeds uint64"
  );

  const engineConfig = input.components.engine.constructorArguments[5];
  requireCondition(
    engineConfig.epochOrigin >= deadline,
    "engine epoch origin can be stale before the approved execution window closes"
  );
  requireCondition(
    engineConfig.epochOrigin <= notBefore + 30n * 24n * 60n * 60n,
    "engine epoch origin exceeds the constructor's 30-day deployment bound"
  );
  requireCondition(
    input.components.genesisDistributor.constructorArguments[6] > deadline,
    "Genesis claim deadline expires within the approved execution window"
  );
  requireCondition(
    input.liquidityBootstrap.seedDeadline >= deadline,
    "seed initializer deadline expires within the approved execution window"
  );
  requireCondition(
    input.liquidityBootstrap.compounderDeadline >= deadline,
    "Compounder deadline expires within the approved execution window"
  );
}

function allocationReconciliation(input: V5CompleteStackDeploymentPlanInput): {
  movedFromTreasury: bigint;
  directTreasuryResidual: bigint;
} {
  const directTreasuryResidual = input.release.allocations.reduce(
    (total, allocation) =>
      sameAddress(allocation.recipient, input.release.custody.treasury.address)
        ? total + allocation.amount
        : total,
    0n
  );
  return {
    movedFromTreasury: input.release.token.fixedSupply - directTreasuryResidual,
    directTreasuryResidual,
  };
}

function validateCoreAndModuleBindings(
  input: V5CompleteStackDeploymentPlanInput
): void {
  const config = input.release;
  const admin = config.custody.admin.address;
  const treasury = config.custody.treasury.address;
  const recovery = config.custody.recovery;
  const usdc = config.external.usdc;
  const token = componentAddress(input, "token");
  const reserve = componentAddress(input, "rewardReserve");
  const engine = componentAddress(input, "engine");
  const renderer = componentAddress(input, "positionRenderer");
  const controller = componentAddress(input, "positionController");

  const tokenArgs = input.components.token.constructorArguments;
  requireCondition(
    tokenArgs[0] === config.token.name,
    "token name differs from the release configuration"
  );
  requireCondition(
    tokenArgs[1] === config.token.symbol,
    "token symbol differs from the release configuration"
  );
  requireCondition(
    tokenArgs[2] === config.token.decimals,
    "token decimals differ from the release configuration"
  );
  requireBigInt(tokenArgs[3], config.token.fixedSupply, "token fixed supply");
  requireAddress(tokenArgs[4], treasury, "token allocation recipient");
  requireCondition(
    config.token.permit,
    "NARATokenV5 requires the approved Permit feature"
  );
  requireCondition(
    !config.token.erc1363,
    "NARATokenV5 does not implement ERC-1363"
  );
  requireCondition(
    !config.token.multicall,
    "NARATokenV5 does not implement token multicall"
  );
  requireCondition(
    !config.token.flashMint.enabled,
    "NARATokenV5 does not implement flash minting"
  );

  const reserveArgs = input.components.rewardReserve.constructorArguments;
  requireAddress(
    reserveArgs[0],
    admin,
    "rewardReserve configuration authority"
  );
  requireAddress(reserveArgs[1], recovery, "rewardReserve recovery authority");
  requireAddress(reserveArgs[2], token, "rewardReserve token");
  requireBigInt(
    reserveArgs[3],
    config.engine.reserveAmount,
    "rewardReserve allocation"
  );

  const engineArgs = input.components.engine.constructorArguments;
  requireAddress(engineArgs[0], admin, "engine configuration authority");
  requireAddress(engineArgs[1], token, "engine token");
  requireAddress(engineArgs[2], usdc, "engine fee base");
  requireAddress(engineArgs[3], reserve, "engine reward reserve");
  requireAddress(engineArgs[4], treasury, "engine inactive reward recipient");
  const engineConfig = engineArgs[5];
  requireBigInt(
    engineConfig.epochLength,
    config.engine.epochLengthSeconds,
    "engine epoch length"
  );
  requireCondition(
    engineConfig.epochOrigin > 0n,
    "engine epoch origin must be positive"
  );
  requireCondition(
    engineConfig.epochLength >= 60n &&
      engineConfig.epochLength <= 30n * 24n * 60n * 60n,
    "engine epoch length is outside constructor bounds"
  );
  requireCondition(
    engineConfig.minLockDuration >= engineConfig.epochLength,
    "engine minimum lock is below one epoch"
  );
  requireCondition(
    engineConfig.maxLockDuration >= engineConfig.minLockDuration,
    "engine lock bounds are reversed"
  );
  requireCondition(
    engineConfig.maxLockDuration <= 20n * 365n * 24n * 60n * 60n,
    "engine maximum lock exceeds constructor bounds"
  );
  requireCondition(
    engineConfig.maxAdvancePerCall > 0 && engineConfig.maxAdvancePerCall <= 512,
    "engine maxAdvancePerCall is outside constructor bounds"
  );
  requireCondition(
    engineConfig.minWeightMultiplierWad >= 1_000_000_000_000_000_000n,
    "engine minimum multiplier is below 1 WAD"
  );
  requireCondition(
    engineConfig.maxWeightMultiplierWad >= engineConfig.minWeightMultiplierWad,
    "engine multiplier bounds are reversed"
  );
  requireCondition(
    engineConfig.maxWeightMultiplierWad <= 100_000_000_000_000_000_000n,
    "engine maximum multiplier exceeds constructor bounds"
  );
  requireCondition(
    engineConfig.emissionPerEpoch > 0n &&
      engineConfig.emissionPerEpoch <= config.engine.reserveAmount,
    "engine emissionPerEpoch is outside reserve bounds"
  );
  requireCondition(
    engineConfig.emissionBootstrapWeight > 0n,
    "engine emissionBootstrapWeight must be positive"
  );
  requireCondition(
    engineConfig.minimumRewardWeight > 0n,
    "engine minimumRewardWeight must be positive"
  );
  const maximumTotalWeight = (1n << 192n) - 1n;
  requireCondition(
    engineConfig.emissionBootstrapWeight <= maximumTotalWeight &&
      engineConfig.minimumRewardWeight <= maximumTotalWeight,
    "engine reward weights exceed constructor bounds"
  );
  const maximumAchievableWeight =
    (config.token.fixedSupply * engineConfig.maxWeightMultiplierWad) /
    1_000_000_000_000_000_000n;
  requireCondition(
    engineConfig.minimumRewardWeight <= maximumAchievableWeight,
    "engine minimumRewardWeight is unreachable"
  );
  requireCondition(
    (engineConfig.emissionPerEpoch * engineConfig.minimumRewardWeight) /
      (engineConfig.minimumRewardWeight +
        engineConfig.emissionBootstrapWeight) >
      0n,
    "engine bootstrap dilution rounds eligible emissions to zero"
  );

  const positionArgs = input.components.positionController.constructorArguments;
  requireAddress(positionArgs[0], engine, "positionController engine");
  requireAddress(positionArgs[1], renderer, "positionController renderer");

  const opsArgs = input.components.opsVestingVault.constructorArguments;
  requireAddress(opsArgs[0], token, "opsVestingVault token");
  requireAddress(opsArgs[1], treasury, "opsVestingVault funding authority");
  normalizeAddress(opsArgs[2], "opsVestingVault beneficiary");
  requireCondition(
    opsArgs[4] < opsArgs[6],
    "ops vesting start must precede end"
  );
  requireCondition(
    opsArgs[5] >= opsArgs[4] && opsArgs[5] <= opsArgs[6],
    "ops vesting cliff is invalid"
  );

  const genesisArgs = input.components.genesisDistributor.constructorArguments;
  requireAddress(genesisArgs[0], token, "genesisDistributor token");
  requireAddress(
    genesisArgs[1],
    treasury,
    "genesisDistributor funding authority"
  );
  requireNonZeroHash(genesisArgs[4], "genesisDistributor distributionDomain");
  requireNonZeroHash(genesisArgs[5], "genesisDistributor merkleRoot");
  requireCondition(
    genesisArgs[6] > 0n,
    "genesisDistributor claim deadline must be positive"
  );
  if (config.holderTreatment.mode === "snapshot-claim") {
    requireCondition(
      genesisArgs[5].toLowerCase() ===
        config.holderTreatment.merkleRoot.toLowerCase(),
      "genesisDistributor root differs from holder-treatment approval"
    );
    requireBigInt(
      genesisArgs[6],
      config.holderTreatment.claimDeadline,
      "Genesis claim deadline"
    );
    requireAddress(
      genesisArgs[2],
      config.holderTreatment.unclaimedRecipient,
      "Genesis unclaimed recipient"
    );
  } else {
    requireAddress(
      genesisArgs[2],
      treasury,
      "deployed-closed Genesis unclaimed recipient"
    );
    requireCondition(
      config.modules.deployedClosed.includes("genesisDistributor"),
      "Genesis without snapshot holder treatment must remain deployed closed"
    );
  }

  const bondArgs = input.components.bondDepository.constructorArguments;
  requireAddress(bondArgs[0], token, "bondDepository token");
  requireAddress(bondArgs[1], usdc, "bondDepository payment token");
  requireAddress(bondArgs[2], controller, "bondDepository position controller");
  requireAddress(bondArgs[3], admin, "bondDepository configuration authority");
  requireAddress(bondArgs[4], treasury, "bondDepository treasury");
  requireCondition(
    config.modules.deployedClosed.includes(CANONICAL_NFT_BOND_MODULE_ID) &&
      !config.modules.launch.includes(CANONICAL_NFT_BOND_MODULE_ID) &&
      !config.modules.deferred.includes(CANONICAL_NFT_BOND_MODULE_ID),
    "bondDepository must deploy closed; terms require a separate approved plan"
  );
  const positiveBondArgumentIndexes = [
    5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16,
  ] as const;
  positiveBondArgumentIndexes.forEach((index) => {
    requireCondition(
      bondArgs[index] > 0n,
      `bondDepository constructor argument ${index} must be positive`
    );
  });
  requireCondition(
    bondArgs[7] <= bondArgs[8],
    "bond payment bounds are reversed"
  );
  requireCondition(
    bondArgs[9] <= bondArgs[6],
    "bond minimum payout exceeds the immutable maximum capacity"
  );
  requireCondition(
    bondArgs[12] <= bondArgs[13],
    "bond lock bounds are reversed"
  );
  requireCondition(
    bondArgs[5] >= 60n * 60n && bondArgs[5] <= 365n * 24n * 60n * 60n,
    "bond activation delay must be between one hour and 365 days"
  );
  requireCondition(
    bondArgs[13] <= 20n * 365n * 24n * 60n * 60n,
    "bond lock exceeds constructor bounds"
  );
  requireCondition(
    bondArgs[14] <= 30n * 24n * 60n * 60n,
    "bond maximum term duration exceeds 30 days"
  );
  requireCondition(
    bondArgs[12] >= engineConfig.minLockDuration,
    "bond minimum lock is below the Engine minimum lock"
  );
  requireCondition(
    bondArgs[13] <= engineConfig.maxLockDuration,
    "bond maximum lock exceeds the Engine maximum lock"
  );
  requireAddress(
    bondArgs[15],
    config.recovery.recipient,
    "bondDepository inventory recovery recipient"
  );
  requireBigInt(
    bondArgs[16],
    config.recovery.delaySeconds,
    "bondDepository inventory recovery delay"
  );
  requireCondition(
    bondArgs[16] >= 60n * 60n && bondArgs[16] <= 365n * 24n * 60n * 60n,
    "bondDepository inventory recovery delay is outside constructor bounds"
  );

  const bondAllocation = allocationAmount(
    config,
    input.allocationBindings.bondInventoryVault,
    "bondInventoryVault"
  );
  requireBigInt(bondArgs[6], bondAllocation, "bondDepository maximum capacity");

  const inventoryArgs =
    input.components.bondInventoryVault.constructorArguments;
  requireAddress(inventoryArgs[0], token, "bondInventoryVault token");
  requireAddress(
    inventoryArgs[1],
    treasury,
    "bondInventoryVault funding authority"
  );
  requireAddress(
    inventoryArgs[2],
    componentAddress(input, "bondDepository"),
    "bondInventoryVault depository"
  );
  requireCondition(
    inventoryArgs[3] === bondArgs[6],
    "bond inventory allocation must equal the immutable maximum capacity"
  );
  requireAddress(
    inventoryArgs[4],
    bondArgs[15],
    "bondInventoryVault recovery recipient"
  );
  requireBigInt(
    inventoryArgs[5],
    bondArgs[16],
    "bondInventoryVault recovery delay"
  );
  requireCondition(
    inventoryArgs[5] >= 60n * 60n && inventoryArgs[5] <= 365n * 24n * 60n * 60n,
    "bondInventoryVault recovery delay is outside constructor bounds"
  );
}

function validateLiquidityBindings(
  input: V5CompleteStackDeploymentPlanInput
): void {
  const config = input.release;
  const admin = config.custody.admin.address;
  const recovery = config.custody.recovery;
  const token = componentAddress(input, "token");
  const vault = componentAddress(input, "liquidityVault");
  const seed = componentAddress(input, "seedPolCustody");
  const compounder = componentAddress(input, "liquidityCompounder");
  const controller = componentAddress(input, "liquidityPhaseController");
  const hook = componentAddress(input, "liquidityHook");
  const seedInitializer = componentAddress(input, "seedPositionInitializer");
  const domain = config.environment === "rehearsal" ? 0 : 1;
  const recoveryDelay = config.recovery.delaySeconds;
  const bootstrap = input.liquidityBootstrap;
  const maximumUint128 = (1n << 128n) - 1n;
  const maximumUint48 = (1n << 48n) - 1n;
  requireCondition(
    config.liquidity.seedTokenAmount <= maximumUint128 &&
      config.liquidity.seedUsdcAmount <= maximumUint128,
    "seed initializer amounts exceed uint128"
  );
  requireCondition(
    bootstrap.seedConfiguredMinimumNaraUsed > 0n &&
      bootstrap.seedConfiguredMinimumNaraUsed <=
        bootstrap.seedInitialMinimumNaraUsed &&
      bootstrap.seedInitialMinimumNaraUsed <=
        config.liquidity.seedTokenAmount &&
      bootstrap.seedConfiguredMinimumUsdcUsed > 0n &&
      bootstrap.seedConfiguredMinimumUsdcUsed <=
        bootstrap.seedInitialMinimumUsdcUsed &&
      bootstrap.seedInitialMinimumUsdcUsed <= config.liquidity.seedUsdcAmount,
    "seed configured or initial minimum-usage floors are invalid"
  );
  requireCondition(
    bootstrap.seedMinimumLiquidity >=
      config.liquidity.phaseMinimumActiveLiquidity[0] &&
      bootstrap.seedMinimumLiquidity <= maximumUint128,
    "seed minimum liquidity is below the approved Bootstrap threshold"
  );
  requireCondition(
    bootstrap.seedDeadline > 0n && bootstrap.seedDeadline <= maximumUint48,
    "seed initializer deadline is invalid"
  );
  requireCondition(
    bootstrap.compounderMaximumNara > 0n &&
      bootstrap.compounderMaximumNara <= maximumUint128 &&
      bootstrap.compounderMaximumUsdc > 0n &&
      bootstrap.compounderMaximumUsdc <= maximumUint128,
    "Compounder bootstrap amounts are invalid"
  );
  requireCondition(
    bootstrap.compounderConfiguredMinimumNaraUsed > 0n &&
      bootstrap.compounderConfiguredMinimumNaraUsed <=
        bootstrap.compounderInitialMinimumNaraUsed &&
      bootstrap.compounderInitialMinimumNaraUsed <=
        bootstrap.compounderMaximumNara &&
      bootstrap.compounderConfiguredMinimumUsdcUsed > 0n &&
      bootstrap.compounderConfiguredMinimumUsdcUsed <=
        bootstrap.compounderInitialMinimumUsdcUsed &&
      bootstrap.compounderInitialMinimumUsdcUsed <=
        bootstrap.compounderMaximumUsdc,
    "Compounder configured or initial minimum-usage floors are invalid"
  );
  requireCondition(
    bootstrap.compounderMinimumLiquidity >=
      config.liquidity.compoundMinimumLiquidity &&
      bootstrap.compounderMinimumLiquidity <= maximumUint128,
    "Compounder minimum liquidity is below the approved minimum"
  );
  requireCondition(
    bootstrap.compounderDeadline > 0n &&
      bootstrap.compounderDeadline <= maximumUint48,
    "Compounder bootstrap deadline is invalid"
  );
  requireNonZeroHash(
    bootstrap.compounderReceiptId,
    "liquidityBootstrap.compounderReceiptId"
  );

  const vaultArgs = input.components.liquidityVault.constructorArguments;
  requireAddress(vaultArgs[0], admin, "liquidityVault configuration authority");
  requireAddress(vaultArgs[1], recovery, "liquidityVault recovery recipient");
  requireAddress(vaultArgs[2], token, "liquidityVault token");
  requireAddress(vaultArgs[3], config.external.usdc, "liquidityVault base");
  requireAddress(
    vaultArgs[4],
    config.external.poolManager,
    "liquidityVault pool manager"
  );
  requireCondition(
    vaultArgs[5] === config.liquidity.engineShareBps,
    "liquidityVault Engine share differs"
  );
  requireCondition(
    vaultArgs[5] > 0 && vaultArgs[5] <= 5_000,
    "liquidityVault Engine share is invalid"
  );

  const seedArgs = input.components.seedPolCustody.constructorArguments;
  requireAddress(seedArgs[0], admin, "seedPolCustody configuration authority");
  requireAddress(seedArgs[1], recovery, "seedPolCustody recovery recipient");
  requireAddress(
    seedArgs[2],
    config.external.positionManager,
    "seedPolCustody position manager"
  );
  requireCondition(
    seedArgs[4] === config.liquidity.rangeTickLower,
    "seedPolCustody lower tick differs"
  );
  requireCondition(
    seedArgs[5] === config.liquidity.rangeTickUpper,
    "seedPolCustody upper tick differs"
  );
  requireCondition(
    seedArgs[6] === domain,
    "seedPolCustody deployment domain differs"
  );
  requireBigInt(seedArgs[7], recoveryDelay, "seedPolCustody recovery delay");

  const compounderArgs =
    input.components.liquidityCompounder.constructorArguments;
  requireAddress(
    compounderArgs[0],
    admin,
    "liquidityCompounder configuration authority"
  );
  normalizeAddress(
    compounderArgs[1],
    "liquidityCompounder operations authority"
  );
  requireAddress(
    compounderArgs[2],
    recovery,
    "liquidityCompounder recovery recipient"
  );
  requireAddress(compounderArgs[3], token, "liquidityCompounder token");
  requireAddress(
    compounderArgs[4],
    config.external.usdc,
    "liquidityCompounder base"
  );
  requireAddress(
    compounderArgs[5],
    config.external.poolManager,
    "liquidityCompounder pool manager"
  );
  requireAddress(
    compounderArgs[6],
    config.external.positionManager,
    "liquidityCompounder position manager"
  );
  requireAddress(compounderArgs[7], vault, "liquidityCompounder vault");
  requireCondition(
    compounderArgs[9] === config.liquidity.rangeTickLower,
    "liquidityCompounder lower tick differs"
  );
  requireCondition(
    compounderArgs[10] === config.liquidity.rangeTickUpper,
    "liquidityCompounder upper tick differs"
  );
  requireBigInt(
    compounderArgs[11],
    bootstrap.compounderConfiguredMinimumNaraUsed,
    "liquidityCompounder minimum NARA usage"
  );
  requireBigInt(
    compounderArgs[12],
    bootstrap.compounderConfiguredMinimumUsdcUsed,
    "liquidityCompounder minimum USDC usage"
  );
  requireCondition(
    compounderArgs[13] === domain,
    "liquidityCompounder deployment domain differs"
  );
  requireBigInt(
    compounderArgs[14],
    recoveryDelay,
    "liquidityCompounder recovery delay"
  );

  const controllerArgs =
    input.components.liquidityPhaseController.constructorArguments;
  requireAddress(
    controllerArgs[0],
    admin,
    "liquidityPhaseController configuration authority"
  );
  requireAddress(
    controllerArgs[1],
    recovery,
    "liquidityPhaseController recovery authority"
  );
  requireAddress(
    controllerArgs[2],
    config.external.poolManager,
    "liquidityPhaseController pool manager"
  );
  requireAddress(
    controllerArgs[3],
    config.external.positionManager,
    "liquidityPhaseController position manager"
  );
  requireAddress(controllerArgs[4], vault, "liquidityPhaseController vault");
  requireAddress(
    controllerArgs[5],
    seed,
    "liquidityPhaseController seed custody"
  );
  requireAddress(
    controllerArgs[6],
    compounder,
    "liquidityPhaseController compounder"
  );
  requireCondition(
    controllerArgs[11] === domain,
    "liquidityPhaseController deployment domain differs"
  );
  requireBigInt(
    controllerArgs[12],
    recoveryDelay,
    "liquidityPhaseController recovery delay"
  );

  const approvedObservations =
    config.liquidity.phaseObservationSeconds.slice(1);
  requireCondition(
    approvedObservations.length === 4,
    "four post-Bootstrap observation periods are required"
  );
  controllerArgs[9].forEach((period, index) => {
    requireBigInt(
      period,
      approvedObservations[index],
      `liquidityPhaseController observation period ${index}`
    );
    requireCondition(
      period >= 60n && period <= 30n * 24n * 60n * 60n,
      `observation period ${index} is out of bounds`
    );
  });
  controllerArgs[10].forEach((count, index) => {
    requireCondition(
      count >= 2 && count <= 32,
      `minimum observation count ${index} is out of bounds`
    );
  });

  const hookArgs = input.components.liquidityHook.constructorArguments;
  requireAddress(
    hookArgs[0],
    config.external.poolManager,
    "liquidityHook pool manager"
  );
  requireAddress(hookArgs[1], admin, "liquidityHook owner");
  requireAddress(hookArgs[2], token, "liquidityHook token");
  requireAddress(hookArgs[3], config.external.usdc, "liquidityHook base");
  requireAddress(hookArgs[4], vault, "liquidityHook vault");
  requireBigInt(
    hookArgs[5],
    config.liquidity.expectedSqrtPriceX96,
    "liquidityHook opening price"
  );
  requireBigInt(
    hookArgs[6],
    config.liquidity.phaseMinimumActiveLiquidity[0],
    "liquidityHook Bootstrap liquidity"
  );
  requireBigInt(
    hookArgs[7],
    config.liquidity.minimumTokenTrade,
    "liquidityHook minimum token trade"
  );
  requireBigInt(
    hookArgs[8],
    config.liquidity.minimumUsdcTrade,
    "liquidityHook minimum base trade"
  );
  requireCondition(
    hookArgs[9].length === 4 &&
      hookArgs[9].every(
        (fee, index) => fee === APPROVED_HOOK_FEE_PHASES_BPS[index + 1]
      ),
    "liquidityHook later-phase fee curve differs from the approved curve"
  );
  requireCondition(
    hookArgs[10].length === 4 &&
      hookArgs[10].every(
        (threshold, index) =>
          threshold === config.liquidity.phaseMinimumActiveLiquidity[index + 1]
      ),
    "liquidityHook later-phase thresholds differ from the release configuration"
  );

  const hookBits = BigInt(hook) & HOOK_PERMISSION_MASK;
  requireCondition(
    hookBits === REQUIRED_HOOK_PERMISSION_BITS,
    "liquidityHook address permission bits are invalid"
  );

  const adapterArgs =
    input.components.liquidityPositionAdapter.constructorArguments;
  requireAddress(adapterArgs[0], token, "liquidityPositionAdapter token");
  requireAddress(
    adapterArgs[1],
    config.external.usdc,
    "liquidityPositionAdapter base"
  );
  requireAddress(
    adapterArgs[2],
    config.external.poolManager,
    "liquidityPositionAdapter pool manager"
  );
  requireAddress(
    adapterArgs[3],
    config.external.positionManager,
    "liquidityPositionAdapter position manager"
  );
  requireAddress(
    adapterArgs[4],
    config.external.permit2,
    "liquidityPositionAdapter Permit2"
  );
  requireAddress(
    adapterArgs[5],
    compounder,
    "liquidityPositionAdapter compounder"
  );
  const poolKey = adapterArgs[6];
  const expectedCurrencies = [
    ethers.getAddress(token),
    ethers.getAddress(config.external.usdc),
  ].sort((left, right) => (BigInt(left) < BigInt(right) ? -1 : 1));
  requireAddress(poolKey.currency0, expectedCurrencies[0], "poolKey currency0");
  requireAddress(poolKey.currency1, expectedCurrencies[1], "poolKey currency1");
  requireCondition(
    poolKey.fee === CANONICAL_POOL_FEE,
    "poolKey fee is not the canonical 3000"
  );
  requireCondition(
    poolKey.tickSpacing === CANONICAL_TICK_SPACING,
    "poolKey tick spacing is not 60"
  );
  requireAddress(poolKey.hooks, hook, "poolKey hook");
  requireCondition(
    adapterArgs[7] === config.liquidity.rangeTickLower,
    "liquidityPositionAdapter lower tick differs"
  );
  requireCondition(
    adapterArgs[8] === config.liquidity.rangeTickUpper,
    "liquidityPositionAdapter upper tick differs"
  );

  const initializerArgs =
    input.components.seedPositionInitializer.constructorArguments;
  requireAddress(
    initializerArgs[0],
    config.custody.treasury.address,
    "seedPositionInitializer authority"
  );
  requireAddress(initializerArgs[1], token, "seedPositionInitializer token");
  requireAddress(
    initializerArgs[2],
    config.external.usdc,
    "seedPositionInitializer base"
  );
  requireAddress(
    initializerArgs[3],
    config.external.poolManager,
    "seedPositionInitializer pool manager"
  );
  requireAddress(
    initializerArgs[4],
    config.external.positionManager,
    "seedPositionInitializer position manager"
  );
  requireAddress(
    initializerArgs[5],
    config.external.permit2,
    "seedPositionInitializer Permit2"
  );
  requireAddress(initializerArgs[6], seed, "seedPositionInitializer custody");
  requireBigInt(
    initializerArgs[7],
    bootstrap.seedConfiguredMinimumNaraUsed,
    "seedPositionInitializer minimum NARA usage"
  );
  requireBigInt(
    initializerArgs[8],
    bootstrap.seedConfiguredMinimumUsdcUsed,
    "seedPositionInitializer minimum USDC usage"
  );
  requireCondition(
    initializerArgs[10] === config.liquidity.rangeTickLower,
    "seedPositionInitializer lower tick differs"
  );
  requireCondition(
    initializerArgs[11] === config.liquidity.rangeTickUpper,
    "seedPositionInitializer upper tick differs"
  );

  const computedPoolId = ethers.keccak256(
    abi.encode([POOL_KEY_TYPE], [poolKey])
  );
  requireCondition(
    ethers.keccak256(abi.encode([POOL_KEY_TYPE], [initializerArgs[9]])) ===
      computedPoolId,
    "seedPositionInitializer PoolKey differs from the canonical PoolKey"
  );
  requireCondition(
    seedArgs[3].toLowerCase() === computedPoolId,
    "seedPolCustody pool id differs from PoolKey"
  );
  requireCondition(
    compounderArgs[8].toLowerCase() === computedPoolId,
    "liquidityCompounder pool id differs from PoolKey"
  );
  requireCondition(
    controllerArgs[7].toLowerCase() === computedPoolId,
    "liquidityPhaseController pool id differs from PoolKey"
  );

  const scheduleHash = ethers.keccak256(
    abi.encode(
      ["uint16[]", "uint128[]"],
      [
        config.liquidity.feePhasesBps,
        config.liquidity.phaseMinimumActiveLiquidity,
      ]
    )
  );
  requireCondition(
    controllerArgs[8].toLowerCase() === scheduleHash,
    "liquidityPhaseController schedule hash differs from the approved Hook schedule"
  );
}

function validatePeripheryBindings(
  input: V5CompleteStackDeploymentPlanInput
): void {
  const token = componentAddress(input, "token");
  const engine = componentAddress(input, "engine");
  const controller = componentAddress(input, "positionController");
  const positionLens = componentAddress(input, "positionDataLens");

  const userRouter = input.components.userRouter.constructorArguments;
  requireAddress(userRouter[0], token, "userRouter token");
  requireAddress(userRouter[1], controller, "userRouter position controller");

  requireAddress(
    input.components.positionDataLens.constructorArguments[0],
    controller,
    "positionDataLens controller"
  );

  const dashboard = input.components.dashboardLens.constructorArguments;
  requireAddress(dashboard[0], token, "dashboardLens token");
  requireAddress(dashboard[1], controller, "dashboardLens controller");
  requireAddress(dashboard[2], positionLens, "dashboardLens position lens");

  const operations =
    input.components.engineOperationsRouter.constructorArguments;
  requireAddress(operations[0], engine, "engineOperationsRouter engine");
  requireCondition(
    operations[1] > 0 && operations[1] <= 4_096,
    "engineOperationsRouter bound is invalid"
  );

  const stats = input.components.protocolStatsLens.constructorArguments;
  const expectedStats = [
    token,
    engine,
    controller,
    componentAddress(input, "genesisDistributor"),
    componentAddress(input, "bondInventoryVault"),
    componentAddress(input, "bondDepository"),
    componentAddress(input, "opsVestingVault"),
  ];
  stats.forEach((address, index) =>
    requireAddress(
      address,
      expectedStats[index],
      `protocolStatsLens argument ${index}`
    )
  );

  const circulating = input.components.circulatingSupply.constructorArguments;
  requireAddress(circulating[0], token, "circulatingSupply token");
  requireCondition(
    circulating[1].length > 0 && circulating[1].length <= 32,
    "circulatingSupply exclusion set is invalid"
  );
  const excluded = circulating[1].map((address, index) =>
    normalizeAddress(address, `circulatingSupply excluded account ${index}`)
  );
  requireCondition(
    new Set(excluded).size === excluded.length,
    "circulatingSupply exclusions contain duplicates"
  );
}

function encodeConstructorArguments<K extends V5ComponentId>(
  id: K,
  input: V5ComponentInput<K>
): string {
  return encodeConstructorValues(id, input.constructorArguments);
}

function encodeConstructorValues<K extends V5ComponentId>(
  id: K,
  constructorArguments: V5ConstructorArgumentMap[K]
): string {
  const definition = V5_COMPONENT_DEFINITIONS[id];
  requireCondition(
    constructorArguments.length === definition.constructorTypes.length,
    `${id} constructor argument count differs from the current contract`
  );
  try {
    return abi.encode(
      definition.constructorTypes,
      constructorArguments as readonly any[]
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${id} constructor arguments do not match the current ABI: ${detail}`
    );
  }
}

export function v5ConstructorInputHash<K extends V5ComponentId>(
  id: K,
  constructorArguments: V5ConstructorArgumentMap[K]
): string {
  return ethers.keccak256(encodeConstructorValues(id, constructorArguments));
}

export type V5ComponentSaltContext = {
  changeId: string;
  environment: "rehearsal" | "production";
  chainId: bigint;
  sourceCommit: string;
  create2Factory: string;
};

export function v5ComponentSalt(
  context: V5ComponentSaltContext,
  id: V5ComponentId,
  constructorInputHash: string,
  runtimeCodeHash: string,
  artifactEvidenceHash: string,
  constructorApprovalHash: string,
  saltNonce: bigint
): string {
  const order = V5_COMPONENT_ORDER.indexOf(id);
  requireCondition(order >= 0, `unknown V5 component ${id}`);
  return ethers.keccak256(
    abi.encode(
      [
        "string",
        "string",
        "uint256",
        "bytes20",
        "address",
        "uint16",
        "string",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "uint256",
      ],
      [
        context.changeId,
        context.environment,
        context.chainId,
        `0x${context.sourceCommit}`,
        context.create2Factory,
        order,
        id,
        constructorInputHash,
        runtimeCodeHash,
        artifactEvidenceHash,
        constructorApprovalHash,
        saltNonce,
      ]
    )
  );
}

function buildComponentSpecs(
  input: V5CompleteStackDeploymentPlanInput
): V5ComponentPlanSpec[] {
  return V5_COMPONENT_ORDER.map((id, order) => {
    const component = input.components[id] as V5ComponentInput<typeof id>;
    const encoded = encodeConstructorArguments(id, component);
    const constructorInputHash = ethers.keccak256(encoded);
    const salt = v5ComponentSalt(
      {
        changeId: input.release.changeId,
        environment: input.release.environment,
        chainId: input.release.chainId,
        sourceCommit: input.release.sourceCommit,
        create2Factory: input.create2Factory,
      },
      id,
      constructorInputHash,
      component.runtimeCodeHash,
      component.artifactEvidenceHash,
      component.constructorApprovalHash,
      component.saltNonce
    );
    const predictedAddress = ethers.getCreate2Address(
      input.create2Factory,
      salt,
      component.initCodeHash
    );
    requireCondition(
      sameAddress(predictedAddress, component.predictedAddress),
      `${id} predicted address does not match CREATE2 salt and init-code hash`
    );
    return {
      order,
      id,
      contractName: V5_COMPONENT_DEFINITIONS[id].contractName,
      predictedAddress: ethers.getAddress(component.predictedAddress),
      salt,
      saltNonce: component.saltNonce,
      initCodeHash: component.initCodeHash.toLowerCase(),
      runtimeCodeHash: component.runtimeCodeHash.toLowerCase(),
      constructorTypes: [...V5_COMPONENT_DEFINITIONS[id].constructorTypes],
      constructorInputHash,
      artifactEvidenceHash: component.artifactEvidenceHash.toLowerCase(),
      constructorApprovalHash: component.constructorApprovalHash.toLowerCase(),
    };
  });
}

type ActionDraft = {
  id: V5PostDeployActionId;
  phase: "setup" | "activation";
  atomicGroup?: string;
  kind: "call" | "runtime-derived-call" | "assertion";
  actor: string | null;
  target: string | null;
  functionSignature: string;
  argumentTypes: readonly string[];
  argumentSources: readonly string[];
  arguments?: readonly unknown[];
};

function encodeCallData(
  functionSignature: string,
  encodedArguments: string
): string {
  const selector = ethers.id(functionSignature).slice(0, 10);
  return ethers.hexlify(ethers.concat([selector, encodedArguments]));
}

function buildActionSpec(
  draft: ActionDraft,
  order: number,
  input: V5CompleteStackDeploymentPlanInput
): V5PostDeploymentActionSpec {
  requireCondition(
    draft.argumentTypes.length === draft.argumentSources.length,
    `${draft.id} argument source count differs from its ABI`
  );
  const actor =
    draft.actor === null
      ? null
      : normalizeAddress(draft.actor, `${draft.id}.actor`);
  const target =
    draft.target === null
      ? null
      : normalizeAddress(draft.target, `${draft.id}.target`);
  const approvalEvidenceHash = (
    draft.phase === "activation"
      ? input.evidence.activationApprovalHash
      : input.evidence.postDeploymentActionsApprovalHash
  ).toLowerCase();

  let argumentsHash: string;
  let callDataHash: string | null = null;
  if (draft.kind === "runtime-derived-call") {
    requireCondition(
      draft.arguments === undefined,
      `${draft.id} runtime arguments must come from the sealed source`
    );
    argumentsHash = ethers.keccak256(
      abi.encode(["string[]"], [draft.argumentSources])
    );
  } else {
    requireCondition(
      draft.arguments !== undefined,
      `${draft.id} arguments are missing`
    );
    requireCondition(
      draft.arguments.length === draft.argumentTypes.length,
      `${draft.id} argument count differs from its ABI`
    );
    const encoded = abi.encode(draft.argumentTypes, draft.arguments);
    argumentsHash = ethers.keccak256(encoded);
    if (draft.kind === "call") {
      callDataHash = ethers.keccak256(
        encodeCallData(draft.functionSignature, encoded)
      );
    }
  }

  const argumentTypesHash = ethers.keccak256(
    abi.encode(["string[]"], [draft.argumentTypes])
  );
  const argumentSourcesHash = ethers.keccak256(
    abi.encode(["string[]"], [draft.argumentSources])
  );
  const atomicGroup = draft.atomicGroup ?? null;
  const actionHash = ethers.keccak256(
    abi.encode(
      [
        "uint16",
        "string",
        "string",
        "string",
        "string",
        "address",
        "address",
        "string",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
      ],
      [
        order,
        draft.id,
        draft.phase,
        draft.kind,
        atomicGroup ?? "",
        actor ?? ethers.ZeroAddress,
        target ?? ethers.ZeroAddress,
        draft.functionSignature,
        argumentTypesHash,
        argumentSourcesHash,
        argumentsHash,
        callDataHash ?? ethers.ZeroHash,
        approvalEvidenceHash,
      ]
    )
  );
  return {
    order,
    id: draft.id,
    phase: draft.phase,
    atomicGroup,
    kind: draft.kind,
    actor,
    target,
    functionSignature: draft.functionSignature,
    argumentTypes: [...draft.argumentTypes],
    argumentSources: [...draft.argumentSources],
    argumentsHash,
    callDataHash,
    approvalEvidenceHash,
    actionHash,
  };
}

function buildPostDeploymentActions(
  input: V5CompleteStackDeploymentPlanInput,
  positionAccountImplementation: V5NestedContractSpec
): V5PostDeploymentActionSpec[] {
  const config = input.release;
  const admin = config.custody.admin.address;
  const treasury = config.custody.treasury.address;
  const recovery = config.custody.recovery;
  const token = componentAddress(input, "token");
  const reserve = componentAddress(input, "rewardReserve");
  const engine = componentAddress(input, "engine");
  const positionController = componentAddress(input, "positionController");
  const opsVault = componentAddress(input, "opsVestingVault");
  const genesis = componentAddress(input, "genesisDistributor");
  const bondDepository = componentAddress(input, "bondDepository");
  const bondInventory = componentAddress(input, "bondInventoryVault");
  const vault = componentAddress(input, "liquidityVault");
  const hook = componentAddress(input, "liquidityHook");
  const seed = componentAddress(input, "seedPolCustody");
  const compounder = componentAddress(input, "liquidityCompounder");
  const controller = componentAddress(input, "liquidityPhaseController");
  const seedInitializer = componentAddress(input, "seedPositionInitializer");
  const adapter = componentAddress(input, "liquidityPositionAdapter");
  const operationsAuthority =
    input.components.liquidityCompounder.constructorArguments[1];
  const poolKey =
    input.components.liquidityPositionAdapter.constructorArguments[6];
  const bootstrap = input.liquidityBootstrap;
  const opsAmount = input.components.opsVestingVault.constructorArguments[3];
  const genesisAmount =
    input.components.genesisDistributor.constructorArguments[3];
  const reconciliation = allocationReconciliation(input);
  const activationGroup = "v5-final-activation";

  const drafts: ActionDraft[] = [
    {
      id: "confirmFinalRoleAssignments",
      phase: "setup",
      kind: "assertion",
      actor: null,
      target: null,
      functionSignature: "assert-final-v5-role-assignments",
      argumentTypes: ["address[]"],
      argumentSources: [
        "[release.custody.admin,release.custody.treasury,release.custody.recovery,liquidityHook.owner,seedPositionInitializer.initializerAuthority,liquidityCompounder.operationsAuthority]",
      ],
      arguments: [
        [admin, treasury, recovery, admin, treasury, operationsAuthority],
      ],
    },
    {
      id: "confirmPositionAccountImplementation",
      phase: "setup",
      kind: "assertion",
      actor: null,
      target: null,
      functionSignature: "assert-position-account-implementation",
      argumentTypes: ["address", "uint64", "address", "bytes32", "bytes32"],
      argumentSources: [
        "components.positionController.predictedAddress",
        "NARAPositionNFTV5 constructor CREATE nonce",
        "positionController.accountImplementation()",
        "positionAccountImplementation.runtimeCodeHash",
        "positionAccountImplementation.artifactEvidenceHash",
      ],
      arguments: [
        positionAccountImplementation.deployer,
        positionAccountImplementation.createNonce,
        positionAccountImplementation.expectedAddress,
        positionAccountImplementation.runtimeCodeHash,
        positionAccountImplementation.artifactEvidenceHash,
      ],
    },
    {
      id: "approveRewardReserveFunding",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: token,
      functionSignature: "approve(address,uint256)",
      argumentTypes: ["address", "uint256"],
      argumentSources: [
        "components.rewardReserve.predictedAddress",
        "release.engine.reserveAmount",
      ],
      arguments: [reserve, config.engine.reserveAmount],
    },
    {
      id: "fundRewardReserve",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: reserve,
      functionSignature: "fund(uint256)",
      argumentTypes: ["uint256"],
      argumentSources: ["release.engine.reserveAmount"],
      arguments: [config.engine.reserveAmount],
    },
    {
      id: "bindRewardReserveEngine",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: reserve,
      functionSignature: "bindEngine(address)",
      argumentTypes: ["address"],
      argumentSources: ["components.engine.predictedAddress"],
      arguments: [engine],
    },
    {
      id: "bindEnginePositionController",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: engine,
      functionSignature: "bindPositionController(address)",
      argumentTypes: ["address"],
      argumentSources: ["components.positionController.predictedAddress"],
      arguments: [positionController],
    },
    {
      id: "bindEngineLiquidityVault",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: engine,
      functionSignature: "bindLiquidityFeeVault(address)",
      argumentTypes: ["address"],
      argumentSources: ["components.liquidityVault.predictedAddress"],
      arguments: [vault],
    },
    {
      id: "sealRewardReserve",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: reserve,
      functionSignature: "seal()",
      argumentTypes: [],
      argumentSources: [],
      arguments: [],
    },
    {
      id: "approveOpsVestingFunding",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: token,
      functionSignature: "approve(address,uint256)",
      argumentTypes: ["address", "uint256"],
      argumentSources: [
        "components.opsVestingVault.predictedAddress",
        "ops allocation binding",
      ],
      arguments: [opsVault, opsAmount],
    },
    {
      id: "fundOpsVestingVault",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: opsVault,
      functionSignature: "fund()",
      argumentTypes: [],
      argumentSources: [],
      arguments: [],
    },
    {
      id: "approveGenesisFunding",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: token,
      functionSignature: "approve(address,uint256)",
      argumentTypes: ["address", "uint256"],
      argumentSources: [
        "components.genesisDistributor.predictedAddress",
        "Genesis allocation binding",
      ],
      arguments: [genesis, genesisAmount],
    },
    {
      id: "fundGenesisDistributor",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: genesis,
      functionSignature: "fund()",
      argumentTypes: [],
      argumentSources: [],
      arguments: [],
    },
    {
      id: "bindBondInventoryVault",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: bondDepository,
      functionSignature: "bindInventoryVault(address)",
      argumentTypes: ["address"],
      argumentSources: ["components.bondInventoryVault.predictedAddress"],
      arguments: [bondInventory],
    },
    {
      id: "bindHookPhaseController",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: hook,
      functionSignature: "bindPhaseController(address)",
      argumentTypes: ["address"],
      argumentSources: ["components.liquidityPhaseController.predictedAddress"],
      arguments: [controller],
    },
    {
      id: "initializeCanonicalPool",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: config.external.poolManager,
      functionSignature:
        "initialize((address,address,uint24,int24,address),uint160)",
      argumentTypes: [POOL_KEY_TYPE, "uint160"],
      argumentSources: [
        "liquidityHook.canonicalPoolKey()",
        "release.liquidity.expectedSqrtPriceX96",
      ],
      arguments: [poolKey, config.liquidity.expectedSqrtPriceX96],
    },
    {
      id: "approveSeedNaraFunding",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: token,
      functionSignature: "approve(address,uint256)",
      argumentTypes: ["address", "uint256"],
      argumentSources: [
        "components.seedPositionInitializer.predictedAddress",
        "release.liquidity.seedTokenAmount",
      ],
      arguments: [seedInitializer, config.liquidity.seedTokenAmount],
    },
    {
      id: "approveSeedUsdcFunding",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: config.external.usdc,
      functionSignature: "approve(address,uint256)",
      argumentTypes: ["address", "uint256"],
      argumentSources: [
        "components.seedPositionInitializer.predictedAddress",
        "release.liquidity.seedUsdcAmount",
      ],
      arguments: [seedInitializer, config.liquidity.seedUsdcAmount],
    },
    {
      id: "initializeSeedPosition",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: seedInitializer,
      functionSignature:
        "initialize(uint256,uint256,uint256,uint256,uint128,uint64)",
      argumentTypes: [
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint128",
        "uint64",
      ],
      argumentSources: [
        "release.liquidity.seedTokenAmount",
        "release.liquidity.seedUsdcAmount",
        "liquidityBootstrap.seedInitialMinimumNaraUsed",
        "liquidityBootstrap.seedInitialMinimumUsdcUsed",
        "liquidityBootstrap.seedMinimumLiquidity",
        "liquidityBootstrap.seedDeadline",
      ],
      arguments: [
        config.liquidity.seedTokenAmount,
        config.liquidity.seedUsdcAmount,
        bootstrap.seedInitialMinimumNaraUsed,
        bootstrap.seedInitialMinimumUsdcUsed,
        bootstrap.seedMinimumLiquidity,
        bootstrap.seedDeadline,
      ],
    },
    {
      id: "registerSeedPosition",
      phase: "setup",
      kind: "runtime-derived-call",
      actor: admin,
      target: seed,
      functionSignature: "registerPosition(uint256)",
      argumentTypes: ["uint256"],
      argumentSources: ["seedPositionInitializer.positionTokenId()"],
    },
    {
      id: "sealSeedPolCustody",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: seed,
      functionSignature: "sealConfiguration(address,address)",
      argumentTypes: ["address", "address"],
      argumentSources: [
        "components.liquidityHook.predictedAddress",
        "components.liquidityPhaseController.predictedAddress",
      ],
      arguments: [hook, controller],
    },
    {
      id: "sealLiquidityCompounder",
      phase: "setup",
      kind: "call",
      actor: admin,
      target: compounder,
      functionSignature: "sealConfiguration(address,address,address)",
      argumentTypes: ["address", "address", "address"],
      argumentSources: [
        "components.liquidityHook.predictedAddress",
        "components.liquidityPhaseController.predictedAddress",
        "components.liquidityPositionAdapter.predictedAddress",
      ],
      arguments: [hook, controller, adapter],
    },
    {
      id: "fundCompounderNara",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: token,
      functionSignature: "transfer(address,uint256)",
      argumentTypes: ["address", "uint256"],
      argumentSources: [
        "components.liquidityCompounder.predictedAddress",
        "liquidityBootstrap.compounderMaximumNara",
      ],
      arguments: [compounder, bootstrap.compounderMaximumNara],
    },
    {
      id: "fundCompounderUsdc",
      phase: "setup",
      kind: "call",
      actor: treasury,
      target: config.external.usdc,
      functionSignature: "transfer(address,uint256)",
      argumentTypes: ["address", "uint256"],
      argumentSources: [
        "components.liquidityCompounder.predictedAddress",
        "liquidityBootstrap.compounderMaximumUsdc",
      ],
      arguments: [compounder, bootstrap.compounderMaximumUsdc],
    },
    {
      id: "initializeCompounderPosition",
      phase: "setup",
      kind: "call",
      actor: operationsAuthority,
      target: compounder,
      functionSignature:
        "compoundBanked(bytes32,uint256,uint256,uint256,uint256,uint128,uint64)",
      argumentTypes: [
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint128",
        "uint64",
      ],
      argumentSources: [
        "liquidityBootstrap.compounderReceiptId",
        "liquidityBootstrap.compounderMaximumNara",
        "liquidityBootstrap.compounderMaximumUsdc",
        "liquidityBootstrap.compounderInitialMinimumNaraUsed",
        "liquidityBootstrap.compounderInitialMinimumUsdcUsed",
        "liquidityBootstrap.compounderMinimumLiquidity",
        "liquidityBootstrap.compounderDeadline",
      ],
      arguments: [
        bootstrap.compounderReceiptId,
        bootstrap.compounderMaximumNara,
        bootstrap.compounderMaximumUsdc,
        bootstrap.compounderInitialMinimumNaraUsed,
        bootstrap.compounderInitialMinimumUsdcUsed,
        bootstrap.compounderMinimumLiquidity,
        bootstrap.compounderDeadline,
      ],
    },
    {
      id: "confirmAllocationReconciliation",
      phase: "setup",
      kind: "assertion",
      actor: null,
      target: null,
      functionSignature: "assert-v5-fixed-supply-reconciliation",
      argumentTypes: ["uint256", "uint256", "uint256"],
      argumentSources: [
        "release.token.fixedSupply",
        "exact post-deployment funding/transfers",
        "direct treasury residual allocations",
      ],
      arguments: [
        config.token.fixedSupply,
        reconciliation.movedFromTreasury,
        reconciliation.directTreasuryResidual,
      ],
    },
    {
      id: "sealEngine",
      phase: "activation",
      atomicGroup: activationGroup,
      kind: "call",
      actor: admin,
      target: engine,
      functionSignature: "sealConfiguration()",
      argumentTypes: [],
      argumentSources: [],
      arguments: [],
    },
    {
      id: "sealLiquidityVault",
      phase: "activation",
      atomicGroup: activationGroup,
      kind: "call",
      actor: admin,
      target: vault,
      functionSignature: "sealConfiguration(address,address,address,address)",
      argumentTypes: ["address", "address", "address", "address"],
      argumentSources: [
        "components.liquidityHook.predictedAddress",
        "components.liquidityPhaseController.predictedAddress",
        "components.liquidityCompounder.predictedAddress",
        "components.engine.predictedAddress",
      ],
      arguments: [hook, controller, compounder, engine],
    },
    {
      id: "sealLiquidityPhaseController",
      phase: "activation",
      atomicGroup: activationGroup,
      kind: "call",
      actor: admin,
      target: controller,
      functionSignature: "sealConfiguration(address)",
      argumentTypes: ["address"],
      argumentSources: ["components.liquidityHook.predictedAddress"],
      arguments: [hook],
    },
    {
      id: "activateLiquidityHook",
      phase: "activation",
      atomicGroup: activationGroup,
      kind: "call",
      actor: admin,
      target: hook,
      functionSignature: "activatePool()",
      argumentTypes: [],
      argumentSources: [],
      arguments: [],
    },
  ];

  const excludedActions =
    config.holderTreatment.mode === "none"
      ? new Set<V5PostDeployActionId>([
          "approveGenesisFunding",
          "fundGenesisDistributor",
        ])
      : new Set<V5PostDeployActionId>();
  const applicableDrafts = drafts.filter(
    (draft) => !excludedActions.has(draft.id)
  );
  const expectedOrder = V5_POST_DEPLOY_ACTION_ORDER.filter(
    (id) => !excludedActions.has(id)
  );
  requireCondition(
    applicableDrafts.length === expectedOrder.length &&
      applicableDrafts.every(
        (draft, index) => draft.id === expectedOrder[index]
      ),
    "post-deployment action sequence is incomplete or out of order"
  );
  return applicableDrafts.map((draft, order) =>
    buildActionSpec(draft, order, input)
  );
}

function actionsDigest(
  actions: readonly V5PostDeploymentActionSpec[],
  phase: "setup" | "activation"
): string {
  const hashes = actions
    .filter((action) => action.phase === phase)
    .map((action) => action.actionHash);
  requireCondition(hashes.length > 0, `${phase} action set cannot be empty`);
  return ethers.keccak256(abi.encode(["bytes32[]"], [hashes]));
}

function manifestDigest(
  input: V5CompleteStackDeploymentPlanInput,
  releaseConfigurationHash: string,
  evidenceDigest: string,
  deploymentRoot: V5DeploymentRootPreconditionSpec,
  externalDependencies: readonly V5ExternalDependencyPreconditionSpec[],
  specs: readonly V5ComponentPlanSpec[],
  positionAccountImplementation: V5NestedContractSpec,
  actions: readonly V5PostDeploymentActionSpec[],
  setupActionsDigest: string,
  activationActionDigest: string
): string {
  const leaves = specs.map((spec) =>
    ethers.keccak256(
      abi.encode(
        [
          "uint16",
          "string",
          "string",
          "address",
          "bytes32",
          "uint256",
          "bytes32",
          "bytes32",
          "bytes32",
          "bytes32",
          "bytes32",
        ],
        [
          spec.order,
          spec.id,
          spec.contractName,
          spec.predictedAddress,
          spec.salt,
          spec.saltNonce,
          spec.initCodeHash,
          spec.runtimeCodeHash,
          spec.constructorInputHash,
          spec.artifactEvidenceHash,
          spec.constructorApprovalHash,
        ]
      )
    )
  );
  const actionHashes = actions.map((action) => action.actionHash);
  return ethers.keccak256(
    abi.encode(
      [
        "string",
        "string",
        "uint256",
        "bytes20",
        "address",
        "bytes32",
        "bytes32[]",
        "uint64",
        "uint64",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32[]",
        "bytes32[]",
      ],
      [
        input.release.changeId,
        input.release.environment,
        input.release.chainId,
        `0x${input.release.sourceCommit}`,
        input.create2Factory,
        deploymentRoot.specHash,
        externalDependencies.map((dependency) => dependency.specHash),
        input.executionWindow.notBefore,
        input.executionWindow.deadline,
        releaseConfigurationHash,
        evidenceDigest,
        positionAccountImplementation.specHash,
        setupActionsDigest,
        activationActionDigest,
        leaves,
        actionHashes,
      ]
    )
  );
}

/**
 * Builds a deterministic, offline-only deployment plan. It performs no RPC,
 * key, signer, transaction, bytecode, or filesystem operation.
 */
export function buildV5CompleteStackDeploymentPlan(
  input: V5CompleteStackDeploymentPlanInput
): V5CompleteStackDeploymentPlan {
  const releaseConfigurationHash = validateReleaseAndAddresses(input);
  const deploymentRoot = buildDeploymentRootPrecondition(input);
  const externalDependencies = buildExternalDependencyPreconditions(input);
  const evidenceDigest = validateEvidence(input);
  validateExecutionWindow(input);
  const positionAccountImplementation =
    buildPositionAccountImplementationSpec(input);
  validateRetiredRehearsal(input);
  validateAllocationBindings(input);
  validateCoreAndModuleBindings(input);
  validateLiquidityBindings(input);
  validatePeripheryBindings(input);

  const components = buildComponentSpecs(input);
  const postDeploymentActions = buildPostDeploymentActions(
    input,
    positionAccountImplementation
  );
  const setupActionsDigest = actionsDigest(postDeploymentActions, "setup");
  const activationActionDigest = actionsDigest(
    postDeploymentActions,
    "activation"
  );
  const digest = manifestDigest(
    input,
    releaseConfigurationHash,
    evidenceDigest,
    deploymentRoot,
    externalDependencies,
    components,
    positionAccountImplementation,
    postDeploymentActions,
    setupActionsDigest,
    activationActionDigest
  );
  return {
    changeId: input.release.changeId,
    environment: input.release.environment,
    chainId: input.release.chainId,
    sourceCommit: input.release.sourceCommit,
    create2Factory: ethers.getAddress(input.create2Factory),
    deploymentRoot,
    externalDependencies,
    releaseConfigurationHash,
    evidenceDigest,
    components,
    nestedContracts: [positionAccountImplementation],
    postDeploymentActions,
    setupActionsDigest,
    activationActionDigest,
    manifestDigest: digest,
  };
}
