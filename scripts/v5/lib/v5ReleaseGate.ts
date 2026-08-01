import { ethers } from "ethers";

export const V5_CHANGE_ID = "NARA-20260801-v5-complete-stack-reset";
export const BASE_CHAIN_ID = 8453n;
export const REHEARSAL_RECOVERY_DELAY_SECONDS = 60n * 60n;
export const MINIMUM_PRODUCTION_RECOVERY_DELAY_SECONDS = 7n * 24n * 60n * 60n;
export const BPS = 10_000;
export const APPROVED_HOOK_FEE_PHASES_BPS = Object.freeze([
  1_500, 1_250, 1_000, 750, 500,
]);
export const CANONICAL_NFT_BOND_MODULE_ID = "bondDepository" as const;

export const CANONICAL_BASE_DEPENDENCIES = Object.freeze({
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  positionManager: "0x7C5f5A4bBd8fD63184577525326123B519429bDc",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
});

/**
 * These addresses are recovery/history inputs only. A fresh V5 contract is
 * never allowed to resolve to one of them, even if a manifest is mislabeled.
 */
export const FORBIDDEN_V4_DEPLOYMENT_ADDRESSES = Object.freeze(
  [
    "0x65E247AA3aa9C0131b2984b894c3D24c41341D7A", // token
    "0xbC2492BA73dE35d1114b5c18d7db633aca8963c9", // engine
    "0x5F3FF409b74395b031e0C5D6abdD7D8895d2c7AD", // reserve
    "0x2dfE578C4342750Cd8fE618605eeB0E9C00Ba94d", // liquidity vault
    "0xA1c6a86d6F7B83deE32D7bc4aA6D35C14A8e6088", // hook
    "0xE28C05cC6ad9f2C48DBB7eCCD44b323370586C98", // compounder
  ].map((address) => ethers.getAddress(address))
);

export const REQUIRED_V5_DECISIONS = Object.freeze([
  "token-identity",
  "token-features",
  "supply-allocation",
  "v4-holder-treatment",
  "v4-asset-disposition",
  "engine-model",
  "reserve-policy",
  "module-scope",
  "custody-role-matrix",
  "pool-opening-and-seed",
  "pol-phase-policy",
  "fee-routing-share",
  "compounding-policy",
  "recovery-policy",
  "activation-gates",
] as const);

export type V5DecisionKey = (typeof REQUIRED_V5_DECISIONS)[number];
export type V5Environment = "rehearsal" | "production";

export type DecisionApproval = {
  decision: V5DecisionKey;
  /** A hash of the exact reviewed decision record, not a chat summary. */
  evidenceHash: string;
  approvedAt: string;
  approvedBy: string;
};

export type SafeConfiguration = {
  address: string;
  owners: string[];
  threshold: number;
  timelockSeconds: bigint;
  modules: string[];
  guard: string | null;
  fallbackHandler: string | null;
};

export type AllocationEntry = {
  id: string;
  recipient: string;
  amount: bigint;
};

export type V4HolderTreatment =
  | { mode: "none"; evidenceHash: string }
  | {
      mode: "snapshot-claim";
      evidenceHash: string;
      snapshotBlock: bigint;
      snapshotBlockHash: string;
      merkleRoot: string;
      claimRatioNumerator: bigint;
      claimRatioDenominator: bigint;
      claimDeadline: bigint;
      unclaimedRecipient: string;
    };

export type V5DeploymentConfiguration = {
  changeId: string;
  environment: V5Environment;
  chainId: bigint;
  sourceCommit: string;
  configurationDomain: string;
  publicActivationAllowed: boolean;
  external: typeof CANONICAL_BASE_DEPENDENCIES;
  predictedContracts: Record<string, string>;
  custody: {
    admin: SafeConfiguration;
    treasury: SafeConfiguration;
    recovery: string;
  };
  token: {
    name: string;
    symbol: string;
    decimals: number;
    fixedSupply: bigint;
    permit: boolean;
    erc1363: boolean;
    multicall: boolean;
    flashMint:
      | { enabled: false }
      | {
          enabled: true;
          maximumAmount: bigint;
          feeBps: number;
          feeSink: string;
        };
  };
  allocations: AllocationEntry[];
  holderTreatment: V4HolderTreatment;
  engine: {
    epochLengthSeconds: bigint;
    configurationDelaySeconds: bigint;
    reserveAmount: bigint;
    modelConfigurationHash: string;
    feeConfigurationHash: string;
    rewardConfigurationHash: string;
  };
  modules: {
    launch: string[];
    deployedClosed: string[];
    deferred: string[];
  };
  liquidity: {
    expectedSqrtPriceX96: bigint;
    seedTokenAmount: bigint;
    seedUsdcAmount: bigint;
    minimumTokenTrade: bigint;
    minimumUsdcTrade: bigint;
    feePhasesBps: readonly number[];
    phaseMinimumActiveLiquidity: readonly bigint[];
    phaseObservationSeconds: readonly bigint[];
    engineShareBps: number;
    compoundMinimumLiquidity: bigint;
    rangeTickLower: number;
    rangeTickUpper: number;
  };
  recovery: {
    delaySeconds: bigint;
    authority: string;
    recipient: string;
    irreversiblySealed: boolean;
  };
  approvals: DecisionApproval[];
  /** Required only in production and must cover a fully retired rehearsal. */
  rehearsalRetirementProofHash: string | null;
  /** Every rehearsal address is carried into production and rejected. */
  deniedRehearsalAddresses: string[];
};

function requireCondition(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

function requirePositive(value: bigint, label: string): void {
  requireCondition(value > 0n, `${label} must be positive`);
}

function requireNonZeroBytes32(value: string, label: string): void {
  requireCondition(
    /^0x[0-9a-fA-F]{64}$/.test(value),
    `${label} must be bytes32`
  );
  requireCondition(!/^0x0{64}$/i.test(value), `${label} cannot be zero`);
}

function normalizedAddress(value: string, label: string): string {
  requireCondition(ethers.isAddress(value), `${label} must be an address`);
  const normalized = ethers.getAddress(value);
  requireCondition(
    normalized !== ethers.ZeroAddress,
    `${label} cannot be zero`
  );
  return normalized;
}

function sameAddress(a: string, b: string): boolean {
  return ethers.getAddress(a) === ethers.getAddress(b);
}

function uniqueAddresses(values: string[], label: string): string[] {
  const normalized = values.map((value, index) =>
    normalizedAddress(value, `${label}[${index}]`)
  );
  requireCondition(
    new Set(normalized).size === normalized.length,
    `${label} contains duplicates`
  );
  return normalized;
}

function validateSafe(
  config: SafeConfiguration,
  label: string,
  production: boolean
): void {
  normalizedAddress(config.address, `${label}.address`);
  const owners = uniqueAddresses(config.owners, `${label}.owners`);
  requireCondition(config.threshold > 0, `${label}.threshold must be positive`);
  requireCondition(
    config.threshold <= owners.length,
    `${label}.threshold exceeds owner count`
  );
  if (production) {
    requireCondition(
      owners.length >= 5,
      `${label} requires at least five production owners`
    );
    requireCondition(
      config.threshold >= 3,
      `${label} requires at least a three-signature threshold`
    );
  }
  uniqueAddresses(config.modules, `${label}.modules`);
  if (config.guard !== null) normalizedAddress(config.guard, `${label}.guard`);
  if (config.fallbackHandler !== null)
    normalizedAddress(config.fallbackHandler, `${label}.fallbackHandler`);
  requireCondition(
    config.timelockSeconds >= 0n,
    `${label}.timelockSeconds cannot be negative`
  );
}

function validateApprovals(approvals: DecisionApproval[]): void {
  const found = new Set<V5DecisionKey>();
  for (const approval of approvals) {
    requireCondition(
      REQUIRED_V5_DECISIONS.includes(approval.decision),
      `unknown decision ${approval.decision}`
    );
    requireCondition(
      !found.has(approval.decision),
      `duplicate approval for ${approval.decision}`
    );
    found.add(approval.decision);
    requireNonZeroBytes32(
      approval.evidenceHash,
      `${approval.decision}.evidenceHash`
    );
    requireCondition(
      approval.approvedBy.trim().length > 0,
      `${approval.decision}.approvedBy is empty`
    );
    requireCondition(
      !Number.isNaN(Date.parse(approval.approvedAt)),
      `${approval.decision}.approvedAt is invalid`
    );
  }
  const missing = REQUIRED_V5_DECISIONS.filter(
    (decision) => !found.has(decision)
  );
  requireCondition(
    missing.length === 0,
    `missing approvals: ${missing.join(", ")}`
  );
}

function validateHolderTreatment(treatment: V4HolderTreatment): void {
  requireNonZeroBytes32(treatment.evidenceHash, "holderTreatment.evidenceHash");
  if (treatment.mode === "none") return;
  requireCondition(
    treatment.mode === "snapshot-claim",
    "unknown holder-treatment mode"
  );
  requirePositive(treatment.snapshotBlock, "holderTreatment.snapshotBlock");
  requireNonZeroBytes32(
    treatment.snapshotBlockHash,
    "holderTreatment.snapshotBlockHash"
  );
  requireNonZeroBytes32(treatment.merkleRoot, "holderTreatment.merkleRoot");
  requirePositive(
    treatment.claimRatioNumerator,
    "holderTreatment.claimRatioNumerator"
  );
  requirePositive(
    treatment.claimRatioDenominator,
    "holderTreatment.claimRatioDenominator"
  );
  requirePositive(treatment.claimDeadline, "holderTreatment.claimDeadline");
  normalizedAddress(
    treatment.unclaimedRecipient,
    "holderTreatment.unclaimedRecipient"
  );
}

function validateExternalDependencies(
  config: V5DeploymentConfiguration["external"]
): void {
  for (const [name, expected] of Object.entries(CANONICAL_BASE_DEPENDENCIES)) {
    requireCondition(
      sameAddress(config[name as keyof typeof config], expected),
      `external ${name} does not match the reviewed Base dependency`
    );
  }
}

function validatePredictedContracts(config: V5DeploymentConfiguration): void {
  const entries = Object.entries(config.predictedContracts);
  requireCondition(entries.length > 0, "predictedContracts cannot be empty");
  const forbidden = new Set(FORBIDDEN_V4_DEPLOYMENT_ADDRESSES);
  const deniedRehearsal = new Set(
    config.deniedRehearsalAddresses.map((address, index) =>
      normalizedAddress(address, `deniedRehearsalAddresses[${index}]`)
    )
  );
  const seen = new Set<string>();
  for (const [name, address] of entries) {
    requireCondition(
      name.trim().length > 0,
      "predicted contract name cannot be empty"
    );
    const normalized = normalizedAddress(address, `predictedContracts.${name}`);
    requireCondition(
      !forbidden.has(normalized),
      `${name} reuses a forbidden V4 address`
    );
    requireCondition(
      !deniedRehearsal.has(normalized),
      `${name} reuses a rehearsal address`
    );
    requireCondition(
      !seen.has(normalized),
      `predicted contract address reused by ${name}`
    );
    seen.add(normalized);
  }
}

function validateTokenAndAllocation(config: V5DeploymentConfiguration): void {
  requireCondition(config.token.name.trim().length > 0, "token.name is empty");
  requireCondition(
    config.token.symbol.trim().length > 0,
    "token.symbol is empty"
  );
  requireCondition(
    config.token.decimals >= 0 && config.token.decimals <= 18,
    "token.decimals is out of bounds"
  );
  requirePositive(config.token.fixedSupply, "token.fixedSupply");
  if (config.token.flashMint.enabled) {
    requirePositive(
      config.token.flashMint.maximumAmount,
      "token.flashMint.maximumAmount"
    );
    requireCondition(
      config.token.flashMint.maximumAmount <= config.token.fixedSupply,
      "flash maximum exceeds supply"
    );
    requireCondition(
      config.token.flashMint.feeBps > 0 && config.token.flashMint.feeBps < BPS,
      "flash fee is out of bounds"
    );
    normalizedAddress(
      config.token.flashMint.feeSink,
      "token.flashMint.feeSink"
    );
  }

  requireCondition(
    config.allocations.length > 0,
    "allocations cannot be empty"
  );
  const ids = new Set<string>();
  const recipients = new Set<string>();
  let allocated = 0n;
  for (const [index, allocation] of config.allocations.entries()) {
    requireCondition(
      allocation.id.trim().length > 0,
      `allocations[${index}].id is empty`
    );
    requireCondition(
      !ids.has(allocation.id),
      `duplicate allocation id ${allocation.id}`
    );
    ids.add(allocation.id);
    const recipient = normalizedAddress(
      allocation.recipient,
      `allocations[${index}].recipient`
    );
    requireCondition(
      !recipients.has(`${allocation.id}:${recipient}`),
      `duplicate allocation ${allocation.id}`
    );
    recipients.add(`${allocation.id}:${recipient}`);
    requireCondition(
      allocation.amount >= 0n,
      `${allocation.id} allocation cannot be negative`
    );
    allocated += allocation.amount;
  }
  requireCondition(
    allocated === config.token.fixedSupply,
    "allocations do not equal fixed supply"
  );
  requireCondition(
    config.engine.reserveAmount <= config.token.fixedSupply,
    "reserve exceeds fixed supply"
  );
  requireCondition(
    config.allocations.some(
      (allocation) =>
        allocation.id === "reserve" &&
        allocation.amount === config.engine.reserveAmount
    ),
    "reserve allocation does not match Engine reserve amount"
  );
  const bondAllocations = config.allocations.filter(
    (allocation) => allocation.id === "bonds"
  );
  requireCondition(
    bondAllocations.length === 1,
    "exactly one bonds allocation is required"
  );
  requirePositive(bondAllocations[0].amount, "bonds allocation");
  requireCondition(
    sameAddress(bondAllocations[0].recipient, config.custody.treasury.address),
    "bond inventory allocation recipient must be the Treasury while the bond depository is deployed closed"
  );
}

function validateModules(config: V5DeploymentConfiguration["modules"]): void {
  for (const [bucket, modules] of Object.entries(config)) {
    requireCondition(
      modules.length === new Set(modules).size,
      `${bucket} module list contains duplicates`
    );
    requireCondition(
      modules.every((module) => module.trim().length > 0),
      `${bucket} module list contains an empty name`
    );
  }
  const all = [...config.launch, ...config.deployedClosed, ...config.deferred];
  requireCondition(
    all.length === new Set(all).size,
    "a module appears in more than one scope bucket"
  );
  requireCondition(
    !all.includes("nft-bonds"),
    `nft-bonds is not a canonical V5 module id; use ${CANONICAL_NFT_BOND_MODULE_ID}`
  );
  requireCondition(
    !config.launch.includes(CANONICAL_NFT_BOND_MODULE_ID),
    `${CANONICAL_NFT_BOND_MODULE_ID} cannot be a launch module`
  );
  requireCondition(
    !config.deferred.includes(CANONICAL_NFT_BOND_MODULE_ID),
    `${CANONICAL_NFT_BOND_MODULE_ID} cannot be deferred`
  );
  requireCondition(
    config.deployedClosed.filter(
      (module) => module === CANONICAL_NFT_BOND_MODULE_ID
    ).length === 1,
    `${CANONICAL_NFT_BOND_MODULE_ID} must appear exactly once in modules.deployedClosed`
  );
  const forbidden = [
    "lotto",
    "arena",
    "mining",
    "jackpot",
    "mistermint",
    "sponsor",
  ];
  for (const module of all) {
    const normalized = module.toLowerCase();
    requireCondition(
      !forbidden.some((word) => normalized.includes(word)),
      `forbidden legacy module in V5 scope: ${module}`
    );
  }
}

function validateLiquidity(config: V5DeploymentConfiguration): void {
  const liquidity = config.liquidity;
  requirePositive(
    liquidity.expectedSqrtPriceX96,
    "liquidity.expectedSqrtPriceX96"
  );
  requirePositive(liquidity.seedTokenAmount, "liquidity.seedTokenAmount");
  requirePositive(liquidity.seedUsdcAmount, "liquidity.seedUsdcAmount");
  requireCondition(
    liquidity.minimumTokenTrade >= 10_000n,
    "minimum token trade is below the raw rounding bound"
  );
  requireCondition(
    liquidity.minimumUsdcTrade >= 10_000n,
    "minimum USDC trade is below the raw rounding bound"
  );
  requireCondition(
    liquidity.feePhasesBps.length === APPROVED_HOOK_FEE_PHASES_BPS.length &&
      liquidity.feePhasesBps.every(
        (fee, index) => fee === APPROVED_HOOK_FEE_PHASES_BPS[index]
      ),
    "Hook fee curve differs from the human-approved 15/12.5/10/7.5/5 per-leg curve"
  );
  requireCondition(
    liquidity.phaseMinimumActiveLiquidity.length === 5,
    "exactly five POL thresholds are required"
  );
  requireCondition(
    liquidity.phaseObservationSeconds.length === 5,
    "exactly five POL observations are required"
  );
  for (let index = 0; index < 5; index += 1) {
    requirePositive(
      liquidity.phaseMinimumActiveLiquidity[index],
      `POL threshold ${index}`
    );
    requireCondition(
      liquidity.phaseObservationSeconds[index] >= 0n,
      `POL observation ${index} cannot be negative`
    );
    if (index > 0) {
      requireCondition(
        liquidity.phaseMinimumActiveLiquidity[index] >
          liquidity.phaseMinimumActiveLiquidity[index - 1],
        "POL thresholds must be strictly increasing"
      );
    }
  }
  requireCondition(
    liquidity.engineShareBps >= 0 && liquidity.engineShareBps < BPS,
    "Engine share must be below 100%"
  );
  requirePositive(
    liquidity.compoundMinimumLiquidity,
    "liquidity.compoundMinimumLiquidity"
  );
  requireCondition(
    liquidity.rangeTickLower < liquidity.rangeTickUpper,
    "liquidity range is empty or reversed"
  );
  requireCondition(
    liquidity.rangeTickLower % 60 === 0,
    "lower tick is not aligned to spacing 60"
  );
  requireCondition(
    liquidity.rangeTickUpper % 60 === 0,
    "upper tick is not aligned to spacing 60"
  );
}

function validateRecovery(config: V5DeploymentConfiguration): void {
  const authority = normalizedAddress(
    config.recovery.authority,
    "recovery.authority"
  );
  normalizedAddress(config.recovery.recipient, "recovery.recipient");
  requireCondition(
    sameAddress(authority, config.custody.recovery),
    "recovery authority differs from the custody role matrix"
  );
  requireCondition(
    config.recovery.irreversiblySealed,
    "recovery policy is not irreversibly sealed"
  );
  if (config.environment === "rehearsal") {
    requireCondition(
      config.recovery.delaySeconds === REHEARSAL_RECOVERY_DELAY_SECONDS,
      "rehearsal recovery must be exactly one hour"
    );
    requireCondition(
      !config.publicActivationAllowed,
      "rehearsal cannot allow public activation"
    );
    requireCondition(
      config.rehearsalRetirementProofHash === null,
      "rehearsal cannot consume a rehearsal proof"
    );
  } else {
    requireCondition(
      config.recovery.delaySeconds >= MINIMUM_PRODUCTION_RECOVERY_DELAY_SECONDS,
      "production recovery must be at least seven days"
    );
    requireNonZeroBytes32(
      config.rehearsalRetirementProofHash ?? "",
      "rehearsalRetirementProofHash"
    );
    requireCondition(
      config.deniedRehearsalAddresses.length > 0,
      "production must denylist rehearsal addresses"
    );
  }
}

export function validateV5DeploymentConfiguration(
  config: V5DeploymentConfiguration
): void {
  requireCondition(config.changeId === V5_CHANGE_ID, "unexpected V5 change ID");
  requireCondition(
    config.environment === "rehearsal" || config.environment === "production",
    "invalid environment"
  );
  requireCondition(
    /^[0-9a-f]{40}$/.test(config.sourceCommit),
    "sourceCommit must be a full 40-character lowercase commit hash"
  );
  requireCondition(
    config.configurationDomain === `nara-v5:${config.environment}`,
    "configuration domain mismatch"
  );
  requireCondition(config.chainId > 0n, "chainId must be positive");
  if (config.environment === "production") {
    requireCondition(
      config.chainId === BASE_CHAIN_ID,
      "production V5 requires Base chain ID 8453"
    );
  }

  validateExternalDependencies(config.external);
  validateSafe(
    config.custody.admin,
    "custody.admin",
    config.environment === "production"
  );
  validateSafe(
    config.custody.treasury,
    "custody.treasury",
    config.environment === "production"
  );
  requireCondition(
    !sameAddress(config.custody.admin.address, config.custody.treasury.address),
    "admin and treasury Safes must be separate"
  );
  normalizedAddress(config.custody.recovery, "custody.recovery");
  validatePredictedContracts(config);
  validateTokenAndAllocation(config);
  validateHolderTreatment(config.holderTreatment);
  requirePositive(
    config.engine.epochLengthSeconds,
    "engine.epochLengthSeconds"
  );
  requireCondition(
    config.engine.configurationDelaySeconds >= 0n,
    "Engine configuration delay cannot be negative"
  );
  requirePositive(config.engine.reserveAmount, "engine.reserveAmount");
  requireNonZeroBytes32(
    config.engine.modelConfigurationHash,
    "engine.modelConfigurationHash"
  );
  requireNonZeroBytes32(
    config.engine.feeConfigurationHash,
    "engine.feeConfigurationHash"
  );
  requireNonZeroBytes32(
    config.engine.rewardConfigurationHash,
    "engine.rewardConfigurationHash"
  );
  validateModules(config.modules);
  validateLiquidity(config);
  validateRecovery(config);
  validateApprovals(config.approvals);
}

function canonicalize(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonicalize(source[key])])
    );
  }
  return value;
}

/** Hashes the exact validated deployment decision object for manifests/Safe review. */
export function v5DeploymentConfigurationHash(
  config: V5DeploymentConfiguration
): string {
  validateV5DeploymentConfiguration(config);
  return ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(canonicalize(config)))
  );
}
