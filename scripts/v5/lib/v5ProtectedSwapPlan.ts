import { ethers } from "ethers";

export const V5_SWAP_PROTECTION_VERSION = 1 as const;
export const V5_SWAP_PROTECTION_ENCODED_LENGTH = 224;
export const V5_HOOK_BPS = 10_000;
export const V5_CANONICAL_POOL_FEE = 3_000;
export const V5_CANONICAL_TICK_SPACING = 60;
export const V5_FIXED_PHASE_FEES_BPS = Object.freeze([
  1_500, 1_250, 1_000, 750, 500,
] as const);
export const V5_MAX_COMBINED_EFFECTIVE_FEE_BPS = 2_775;

const MAX_UINT64 = (1n << 64n) - 1n;
const MAX_INT128 = (1n << 127n) - 1n;
const MAX_UINT256 = (1n << 256n) - 1n;
const SWAP_PROTECTION_V1_ABI =
  "tuple(uint8 version,uint8 minimumAcceptedPhase,uint16 maximumPerLegFeeBps,uint16 maximumNominalCombinedHookFeeBps,uint64 deadline,bytes32 expectedPhaseScheduleHash,uint256 minimumNetOutput)";
const POOL_KEY_ABI =
  "tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

export type V5PoolKey = {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
};

/**
 * Economic route fields shared by V4Quoter.quoteExactInputSingle and a later
 * approved exact-input-single execution integration. Hook data is bound
 * separately because minimumNetOutput is derived from the returned quote.
 */
export type V5ExactInputSingleRoute = {
  poolKey: V5PoolKey;
  zeroForOne: boolean;
  exactAmount: bigint;
};

export type V5SwapProtectionBinding = {
  minimumAcceptedPhase: number;
  maximumPerLegFeeBps: number;
  maximumNominalCombinedHookFeeBps: number;
  deadline: bigint;
  expectedPhaseScheduleHash: string;
};

export type V5SwapProtectionV1 = V5SwapProtectionBinding & {
  version: typeof V5_SWAP_PROTECTION_VERSION;
  minimumNetOutput: bigint;
};

/**
 * Offline evidence supplied after quoteExactInputSingle returns. `netOutput`
 * is the V4Quoter amountOut after this Hook's afterSwap output fee; it is not
 * gross AMM output and must never be charged an output fee a second time.
 */
export type V5QuoterExactInputNetQuote = {
  route: V5ExactInputSingleRoute;
  /** Exact V1 hookData passed to quoteExactInputSingle. */
  hookData: string;
  netOutput: bigint;
  quotedAtTimestamp: bigint;
};

export type V5ProtectedSwapIntent = {
  route: V5ExactInputSingleRoute;
  protection: V5SwapProtectionBinding;
  selectedSlippageBps: number;
  policyMaximumSlippageBps: number;
  currentTimestamp: bigint;
};

export type UnsignedV5ProtectedSwapPlan = {
  kind: "NARA_V5_PROTECTED_EXACT_INPUT_SINGLE_V1";
  status: "UNSIGNED";
  quoterMethod: "quoteExactInputSingle";
  quoteOutputSemantics: "NET_AFTER_HOOK_OUTPUT_FEE";
  route: V5ExactInputSingleRoute;
  routeHash: string;
  quotedNetOutput: bigint;
  quotedAtTimestamp: bigint;
  quotedHookDataHash: string;
  selectedSlippageBps: number;
  policyMaximumSlippageBps: number;
  protection: V5SwapProtectionV1;
  hookData: string;
  hookDataHash: string;
  planHash: string;
};

function requireCondition(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string
): void {
  requireCondition(
    Number.isSafeInteger(value),
    `${label} must be a safe integer`
  );
  requireCondition(
    value >= minimum && value <= maximum,
    `${label} is out of bounds`
  );
}

function requireBytes32(value: string, label: string): string {
  requireCondition(ethers.isHexString(value, 32), `${label} must be bytes32`);
  requireCondition(
    value.toLowerCase() !== ethers.ZeroHash,
    `${label} cannot be zero`
  );
  return value.toLowerCase();
}

function normalizeNonZeroAddress(value: string, label: string): string {
  requireCondition(ethers.isAddress(value), `${label} must be an address`);
  const normalized = ethers.getAddress(value);
  requireCondition(
    normalized !== ethers.ZeroAddress,
    `${label} cannot be zero`
  );
  return normalized;
}

function normalizeRoute(
  route: V5ExactInputSingleRoute,
  label: string
): V5ExactInputSingleRoute {
  const currency0 = normalizeNonZeroAddress(
    route.poolKey.currency0,
    `${label}.poolKey.currency0`
  );
  const currency1 = normalizeNonZeroAddress(
    route.poolKey.currency1,
    `${label}.poolKey.currency1`
  );
  const hooks = normalizeNonZeroAddress(
    route.poolKey.hooks,
    `${label}.poolKey.hooks`
  );
  requireCondition(
    BigInt(currency0.toLowerCase()) < BigInt(currency1.toLowerCase()),
    `${label}.poolKey currencies must be distinct and sorted`
  );
  requireCondition(
    route.poolKey.fee === V5_CANONICAL_POOL_FEE,
    `${label}.poolKey.fee must equal the canonical 3000 pips`
  );
  requireCondition(
    route.poolKey.tickSpacing === V5_CANONICAL_TICK_SPACING,
    `${label}.poolKey.tickSpacing must equal the canonical 60`
  );
  requireCondition(
    typeof route.zeroForOne === "boolean",
    `${label}.zeroForOne must be boolean`
  );
  requireCondition(
    route.exactAmount > 0n,
    `${label}.exactAmount must be positive`
  );
  requireCondition(
    route.exactAmount <= MAX_INT128,
    `${label}.exactAmount exceeds Hook V5's int128 bound`
  );

  return {
    poolKey: {
      currency0,
      currency1,
      fee: route.poolKey.fee,
      tickSpacing: route.poolKey.tickSpacing,
      hooks,
    },
    zeroForOne: route.zeroForOne,
    exactAmount: route.exactAmount,
  };
}

export function combinedEffectiveFeeBpsForV5Phase(
  perLegFeeBps: number
): number {
  requireIntegerInRange(perLegFeeBps, 0, V5_HOOK_BPS, "perLegFeeBps");
  const retainedBps = Math.floor(
    ((V5_HOOK_BPS - perLegFeeBps) * (V5_HOOK_BPS - perLegFeeBps)) / V5_HOOK_BPS
  );
  return V5_HOOK_BPS - retainedBps;
}

function normalizeProtectionBinding(
  protection: V5SwapProtectionBinding,
  label: string
): V5SwapProtectionBinding {
  requireIntegerInRange(
    protection.minimumAcceptedPhase,
    0,
    V5_FIXED_PHASE_FEES_BPS.length - 1,
    `${label}.minimumAcceptedPhase`
  );
  requireIntegerInRange(
    protection.maximumPerLegFeeBps,
    V5_FIXED_PHASE_FEES_BPS[V5_FIXED_PHASE_FEES_BPS.length - 1],
    V5_FIXED_PHASE_FEES_BPS[0],
    `${label}.maximumPerLegFeeBps`
  );
  requireIntegerInRange(
    protection.maximumNominalCombinedHookFeeBps,
    combinedEffectiveFeeBpsForV5Phase(
      V5_FIXED_PHASE_FEES_BPS[V5_FIXED_PHASE_FEES_BPS.length - 1]
    ),
    V5_MAX_COMBINED_EFFECTIVE_FEE_BPS,
    `${label}.maximumNominalCombinedHookFeeBps`
  );
  requireCondition(
    protection.deadline > 0n,
    `${label}.deadline must be positive`
  );
  requireCondition(
    protection.deadline <= MAX_UINT64,
    `${label}.deadline exceeds uint64`
  );
  const expectedPhaseScheduleHash = requireBytes32(
    protection.expectedPhaseScheduleHash,
    `${label}.expectedPhaseScheduleHash`
  );

  const highestAcceptedFee =
    V5_FIXED_PHASE_FEES_BPS[protection.minimumAcceptedPhase];
  requireCondition(
    protection.maximumPerLegFeeBps >= highestAcceptedFee,
    `${label}.maximumPerLegFeeBps rejects its minimum accepted phase`
  );
  requireCondition(
    protection.maximumNominalCombinedHookFeeBps >=
      combinedEffectiveFeeBpsForV5Phase(highestAcceptedFee),
    `${label}.maximumNominalCombinedHookFeeBps rejects its minimum accepted phase`
  );

  return { ...protection, expectedPhaseScheduleHash };
}

function assertMatchingProtection(
  quote: V5SwapProtectionBinding,
  intent: V5SwapProtectionBinding
): void {
  requireCondition(
    quote.minimumAcceptedPhase === intent.minimumAcceptedPhase,
    "quote and intent minimumAcceptedPhase differ"
  );
  requireCondition(
    quote.maximumPerLegFeeBps === intent.maximumPerLegFeeBps,
    "quote and intent maximumPerLegFeeBps differ"
  );
  requireCondition(
    quote.maximumNominalCombinedHookFeeBps ===
      intent.maximumNominalCombinedHookFeeBps,
    "quote and intent maximumNominalCombinedHookFeeBps differ"
  );
  requireCondition(
    quote.deadline === intent.deadline,
    "quote and intent deadline differ"
  );
  requireCondition(
    quote.expectedPhaseScheduleHash === intent.expectedPhaseScheduleHash,
    "quote and intent expectedPhaseScheduleHash differ"
  );
}

export function v5ExactInputSingleRouteHash(
  route: V5ExactInputSingleRoute
): string {
  const normalized = normalizeRoute(route, "route");
  return ethers.keccak256(
    ABI_CODER.encode(
      [POOL_KEY_ABI, "bool", "uint128"],
      [normalized.poolKey, normalized.zeroForOne, normalized.exactAmount]
    )
  );
}

export function deriveMinimumNetOutput(args: {
  quotedNetOutput: bigint;
  selectedSlippageBps: number;
  policyMaximumSlippageBps: number;
}): bigint {
  requireCondition(
    args.quotedNetOutput > 0n,
    "quotedNetOutput must be positive"
  );
  requireCondition(
    args.quotedNetOutput <= MAX_INT128,
    "quotedNetOutput exceeds Hook V5's int128 bound"
  );
  requireIntegerInRange(
    args.policyMaximumSlippageBps,
    0,
    V5_HOOK_BPS - 1,
    "policyMaximumSlippageBps"
  );
  requireIntegerInRange(
    args.selectedSlippageBps,
    0,
    V5_HOOK_BPS - 1,
    "selectedSlippageBps"
  );
  requireCondition(
    args.selectedSlippageBps <= args.policyMaximumSlippageBps,
    "selectedSlippageBps exceeds policyMaximumSlippageBps"
  );

  // V4Quoter amountOut already includes Hook V5's output-leg fee. Applying only
  // the selected slippage haircut here prevents the historical double-discount.
  const minimumNetOutput =
    (args.quotedNetOutput * BigInt(V5_HOOK_BPS - args.selectedSlippageBps)) /
    BigInt(V5_HOOK_BPS);
  requireCondition(
    minimumNetOutput > 0n,
    "slippage would reduce minimumNetOutput to zero"
  );
  return minimumNetOutput;
}

export function encodeV5SwapProtectionV1(
  protection: V5SwapProtectionV1
): string {
  requireCondition(
    protection.version === V5_SWAP_PROTECTION_VERSION,
    `SwapProtection version must equal ${V5_SWAP_PROTECTION_VERSION}`
  );
  requireIntegerInRange(
    protection.minimumAcceptedPhase,
    0,
    255,
    "protection.minimumAcceptedPhase"
  );
  requireIntegerInRange(
    protection.maximumPerLegFeeBps,
    0,
    65_535,
    "protection.maximumPerLegFeeBps"
  );
  requireIntegerInRange(
    protection.maximumNominalCombinedHookFeeBps,
    0,
    65_535,
    "protection.maximumNominalCombinedHookFeeBps"
  );
  requireCondition(
    protection.deadline >= 0n,
    "protection.deadline cannot be negative"
  );
  requireCondition(
    protection.deadline <= MAX_UINT64,
    "protection.deadline exceeds uint64"
  );
  requireCondition(
    ethers.isHexString(protection.expectedPhaseScheduleHash, 32),
    "protection.expectedPhaseScheduleHash must be bytes32"
  );
  requireCondition(
    protection.minimumNetOutput >= 0n,
    "protection.minimumNetOutput cannot be negative"
  );
  requireCondition(
    protection.minimumNetOutput <= MAX_UINT256,
    "protection.minimumNetOutput exceeds uint256"
  );
  const encoded = ABI_CODER.encode(
    [SWAP_PROTECTION_V1_ABI],
    [
      {
        ...protection,
        expectedPhaseScheduleHash:
          protection.expectedPhaseScheduleHash.toLowerCase(),
      },
    ]
  );
  requireCondition(
    ethers.dataLength(encoded) === V5_SWAP_PROTECTION_ENCODED_LENGTH,
    "SwapProtection V1 encoding length mismatch"
  );
  return encoded;
}

export function decodeV5SwapProtectionV1(hookData: string): V5SwapProtectionV1 {
  requireCondition(ethers.isHexString(hookData), "hookData must be hex data");
  requireCondition(
    ethers.dataLength(hookData) === V5_SWAP_PROTECTION_ENCODED_LENGTH,
    "hookData is not the 224-byte SwapProtection V1 encoding"
  );
  let decoded: ethers.Result;
  try {
    [decoded] = ABI_CODER.decode([SWAP_PROTECTION_V1_ABI], hookData);
  } catch {
    throw new Error("hookData is not valid SwapProtection V1 ABI data");
  }
  const protection: V5SwapProtectionV1 = {
    version: Number(decoded.version) as typeof V5_SWAP_PROTECTION_VERSION,
    minimumAcceptedPhase: Number(decoded.minimumAcceptedPhase),
    maximumPerLegFeeBps: Number(decoded.maximumPerLegFeeBps),
    maximumNominalCombinedHookFeeBps: Number(
      decoded.maximumNominalCombinedHookFeeBps
    ),
    deadline: BigInt(decoded.deadline),
    expectedPhaseScheduleHash: String(decoded.expectedPhaseScheduleHash),
    minimumNetOutput: BigInt(decoded.minimumNetOutput),
  };
  // Re-encoding validates the exact V1 ABI widths and rejects non-canonical data.
  const canonical = encodeV5SwapProtectionV1(protection);
  requireCondition(
    canonical.toLowerCase() === hookData.toLowerCase(),
    "hookData is not canonical SwapProtection V1 data"
  );
  return protection;
}

export function buildUnsignedV5ProtectedSwapPlan(args: {
  quote: V5QuoterExactInputNetQuote;
  intent: V5ProtectedSwapIntent;
}): UnsignedV5ProtectedSwapPlan {
  const quoteRoute = normalizeRoute(args.quote.route, "quote.route");
  const intentRoute = normalizeRoute(args.intent.route, "intent.route");
  const quoteRouteHash = v5ExactInputSingleRouteHash(quoteRoute);
  const intentRouteHash = v5ExactInputSingleRouteHash(intentRoute);
  requireCondition(
    quoteRouteHash === intentRouteHash,
    "quote and execution route inputs differ"
  );

  const decodedQuoteProtection = decodeV5SwapProtectionV1(args.quote.hookData);
  const quoteProtection = normalizeProtectionBinding(
    decodedQuoteProtection,
    "quote.protection"
  );
  const intentProtection = normalizeProtectionBinding(
    args.intent.protection,
    "intent.protection"
  );
  assertMatchingProtection(quoteProtection, intentProtection);
  requireCondition(
    decodedQuoteProtection.minimumNetOutput <= args.quote.netOutput,
    "quote hookData minimumNetOutput exceeds quoted net output"
  );

  requireCondition(
    args.intent.currentTimestamp >= 0n,
    "currentTimestamp cannot be negative"
  );
  requireCondition(
    args.intent.currentTimestamp <= MAX_UINT64,
    "currentTimestamp exceeds uint64"
  );
  requireCondition(
    args.quote.quotedAtTimestamp >= 0n,
    "quotedAtTimestamp cannot be negative"
  );
  requireCondition(
    args.quote.quotedAtTimestamp <= args.intent.currentTimestamp,
    "quotedAtTimestamp cannot be in the future"
  );
  requireCondition(
    args.quote.quotedAtTimestamp < intentProtection.deadline,
    "quote was observed at or after the protection deadline"
  );
  // Hook V5 allows equality, but an unsigned plan built at the deadline cannot
  // safely be included before expiry, so the offline builder is stricter.
  requireCondition(
    args.intent.currentTimestamp < intentProtection.deadline,
    "SwapProtection is expired or has no executable time remaining"
  );

  const minimumNetOutput = deriveMinimumNetOutput({
    quotedNetOutput: args.quote.netOutput,
    selectedSlippageBps: args.intent.selectedSlippageBps,
    policyMaximumSlippageBps: args.intent.policyMaximumSlippageBps,
  });
  const protection: V5SwapProtectionV1 = {
    version: V5_SWAP_PROTECTION_VERSION,
    ...intentProtection,
    minimumNetOutput,
  };
  requireCondition(
    protection.minimumNetOutput <= MAX_INT128,
    "protection.minimumNetOutput exceeds Hook V5's int128 bound"
  );
  const hookData = encodeV5SwapProtectionV1(protection);
  const hookDataHash = ethers.keccak256(hookData);
  const quotedHookDataHash = ethers.keccak256(args.quote.hookData);
  const planHash = ethers.keccak256(
    ABI_CODER.encode(
      [
        "bytes32",
        "bytes32",
        "bytes32",
        "uint256",
        "uint64",
        "uint16",
        "uint16",
      ],
      [
        intentRouteHash,
        quotedHookDataHash,
        hookDataHash,
        args.quote.netOutput,
        args.quote.quotedAtTimestamp,
        args.intent.selectedSlippageBps,
        args.intent.policyMaximumSlippageBps,
      ]
    )
  );

  return {
    kind: "NARA_V5_PROTECTED_EXACT_INPUT_SINGLE_V1",
    status: "UNSIGNED",
    quoterMethod: "quoteExactInputSingle",
    quoteOutputSemantics: "NET_AFTER_HOOK_OUTPUT_FEE",
    route: intentRoute,
    routeHash: intentRouteHash,
    quotedNetOutput: args.quote.netOutput,
    quotedAtTimestamp: args.quote.quotedAtTimestamp,
    quotedHookDataHash,
    selectedSlippageBps: args.intent.selectedSlippageBps,
    policyMaximumSlippageBps: args.intent.policyMaximumSlippageBps,
    protection,
    hookData,
    hookDataHash,
    planHash,
  };
}
