import { ethers } from "ethers";

export const TREASURY_RANGE_MATRIX_ROW_SCHEMA = "nara.v4.treasury-range-matrix-row.v4" as const;
export const TREASURY_RANGE_MATRIX_ROUTE_KIND = "universal-router-prefunded-settle-v1" as const;
export const TREASURY_RANGE_MATRIX_QUOTE_POLICY = "per-swap-explicit-quote-status-v1" as const;
export const TREASURY_RANGE_UNQUOTED_ADVERSARIAL_REASONS = [
  "same_block_transactions", "same_transaction_actions", "atomic_buy_reverse",
] as const;
export type TreasuryRangeUnquotedAdversarialReason = typeof TREASURY_RANGE_UNQUOTED_ADVERSARIAL_REASONS[number];
export const REQUIRED_TREASURY_RANGE_SCENARIOS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const REQUIRED_TREASURY_BUY_SIZES_USDC = [
  10n, 25n, 50n, 100n, 250n, 500n, 1_000n, 2_500n, 5_000n, 7_500n, 10_000n, 20_000n,
] as const;
export const REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA = [1_000n, 5_000n, 10_000n, 25_000n, 50_000n] as const;
export const REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS = [2_500n, 5_000n, 10_000n] as const;

const USDC_UNIT = 10n ** 6n;
const NARA_UNIT = 10n ** 18n;
const RESERVED_BINDING_KEYS = new Set([
  "schemaVersion", "routeKind", "quotePolicy", "candidateId", "repositoryHead", "chainId", "blockNumber", "blockHash",
  "currentSqrtPriceX96", "currentTick", "hookConfigurationHash",
  "humanUsdcPerNaraNumerator", "humanUsdcPerNaraDenominator", "matrixHash",
]);
const COMMON_ROW_KEYS = [...RESERVED_BINDING_KEYS];

export type TreasuryRangeEvidenceBinding = Readonly<{
  candidateId: string;
  repositoryHead: string;
  chainId: bigint;
  blockNumber: bigint;
  blockHash: string;
  currentSqrtPriceX96: bigint;
  currentTick: bigint;
  hookConfigurationHash: string;
  humanUsdcPerNara: Readonly<{ numerator: bigint; denominator: bigint }>;
}>;

export type TreasuryRangeQuoteEvidence =
  | Readonly<{
    status: "available";
    quotedOutputRaw: string;
  }>
  | Readonly<{
    status: "pool_manager_prefund_required";
    quotedOutputRaw: "0";
    errorFingerprint: string;
    poolManagerBalanceRaw: string;
    requiredHookFeeRaw: string;
  }>
  | Readonly<{
    status: "unquoted_adversarial_execution";
    quotedOutputRaw: "0";
    reason: TreasuryRangeUnquotedAdversarialReason;
  }>;

export type TreasuryRangeEvidenceClaims = Readonly<{
  candidateId: string;
  exactForkValidated: boolean;
  exactInputOnly: boolean;
  scenarioCoverage: readonly string[];
  buySizeCoverageUsdc: readonly string[];
  independentSellSizeCoverageNara: readonly string[];
  acquiredSellFractionCoverageBps: readonly string[];
  matrixHash: string;
  matrix: readonly Readonly<Record<string, unknown>>[];
  normalBuyExecution: Readonly<Record<string, boolean>>;
  crystallizedUsdc: bigint;
  treasuryNaraAccumulated: bigint;
  nearMarketNaraSold: bigint;
  nextTransactionRoundTripLossUsdc: bigint;
  maximumObservedSlippageBps: bigint;
  quoteFailures: bigint;
}>;

export type VerifiedTreasuryRangeMatrix = Readonly<{
  matrixHash: string;
  routeKind: typeof TREASURY_RANGE_MATRIX_ROUTE_KIND;
  quotePolicy: typeof TREASURY_RANGE_MATRIX_QUOTE_POLICY;
  candidateId: string;
  repositoryHead: string;
  chainId: bigint;
  blockNumber: bigint;
  blockHash: string;
  currentSqrtPriceX96: bigint;
  currentTick: bigint;
  hookConfigurationHash: string;
  humanUsdcPerNara: Readonly<{ numerator: bigint; denominator: bigint }>;
  crystallizedUsdc: bigint;
  treasuryNaraAccumulated: bigint;
  nearMarketNaraSold: bigint;
  nextTransactionRoundTripLossUsdc: bigint;
  maximumObservedSlippageBps: bigint;
  quoteFailures: 0n;
}>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Evidence JSON numbers must be safe integers");
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error(`Unsupported evidence JSON value: ${typeof value}`);
}

function normalizedBinding(binding: TreasuryRangeEvidenceBinding): Readonly<Record<string, string>> {
  if (!/^(?:CONSERVATIVE|AGGRESSIVE|ADVERSARIAL)-\d+-NARA$/.test(binding.candidateId)) {
    throw new Error("Evidence candidateId is invalid");
  }
  const repositoryHead = binding.repositoryHead.toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(repositoryHead)) throw new Error("Evidence repositoryHead must be a full commit SHA");
  if (binding.chainId <= 0n || binding.blockNumber <= 0n) throw new Error("Evidence chain/block must be positive");
  const blockHash = binding.blockHash.toLowerCase();
  if (!ethers.isHexString(blockHash, 32)) throw new Error("Evidence blockHash must be bytes32");
  if (binding.currentSqrtPriceX96 <= 0n) throw new Error("Evidence currentSqrtPriceX96 must be positive");
  if (binding.currentTick < -887_272n || binding.currentTick > 887_272n) throw new Error("Evidence currentTick is outside TickMath bounds");
  const hookConfigurationHash = binding.hookConfigurationHash.toLowerCase();
  if (!ethers.isHexString(hookConfigurationHash, 32)) throw new Error("Evidence hookConfigurationHash must be bytes32");
  if (binding.humanUsdcPerNara.numerator <= 0n || binding.humanUsdcPerNara.denominator <= 0n) {
    throw new Error("Evidence human price rational must be positive");
  }
  return {
    schemaVersion: TREASURY_RANGE_MATRIX_ROW_SCHEMA,
    routeKind: TREASURY_RANGE_MATRIX_ROUTE_KIND,
    quotePolicy: TREASURY_RANGE_MATRIX_QUOTE_POLICY,
    candidateId: binding.candidateId,
    repositoryHead,
    chainId: binding.chainId.toString(),
    blockNumber: binding.blockNumber.toString(),
    blockHash,
    currentSqrtPriceX96: binding.currentSqrtPriceX96.toString(),
    currentTick: binding.currentTick.toString(),
    hookConfigurationHash,
    humanUsdcPerNaraNumerator: binding.humanUsdcPerNara.numerator.toString(),
    humanUsdcPerNaraDenominator: binding.humanUsdcPerNara.denominator.toString(),
  };
}

export function bindTreasuryRangeMatrixRows(
  binding: TreasuryRangeEvidenceBinding,
  rawRows: readonly Readonly<Record<string, unknown>>[],
): Readonly<{ matrixHash: string; rows: readonly Readonly<Record<string, unknown>>[] }> {
  const common = normalizedBinding(binding);
  const rowsWithoutHash = rawRows.map((row, index) => {
    for (const key of RESERVED_BINDING_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) throw new Error(`Raw evidence row ${index} contains reserved ${key}`);
    }
    return { ...common, ...row };
  });
  const matrixHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(rowsWithoutHash))).toLowerCase();
  return {
    matrixHash,
    rows: rowsWithoutHash.map((row) => ({ ...row, matrixHash })),
  };
}

function object(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function text(row: Readonly<Record<string, unknown>>, key: string): string {
  if (typeof row[key] !== "string" || (row[key] as string).length === 0) throw new Error(`Evidence ${key} must be a non-empty string`);
  return row[key] as string;
}

function decimal(row: Readonly<Record<string, unknown>>, key: string): bigint {
  const value = text(row, key);
  if (!/^\d+$/.test(value)) throw new Error(`Evidence ${key} must be an unsigned integer string`);
  return BigInt(value);
}

function positive(row: Readonly<Record<string, unknown>>, key: string): bigint {
  const value = decimal(row, key);
  if (value === 0n) throw new Error(`Evidence ${key} must be positive`);
  return value;
}

function signed(row: Readonly<Record<string, unknown>>, key: string): bigint {
  const value = text(row, key);
  if (!/^-?\d+$/.test(value)) throw new Error(`Evidence ${key} must be an integer string`);
  return BigInt(value);
}

function hash(row: Readonly<Record<string, unknown>>, key: string): string {
  const value = text(row, key).toLowerCase();
  if (!ethers.isHexString(value, 32)) throw new Error(`Evidence ${key} must be bytes32`);
  return value;
}

export function assertTreasuryRangeQuoteEvidence(
  value: unknown,
  label = "Treasury range quote evidence",
): TreasuryRangeQuoteEvidence {
  const evidence = object(value, label);
  const status = text(evidence, "status");
  if (status === "available") {
    const keys = Object.keys(evidence).sort();
    if (keys.length !== 2 || keys[0] !== "quotedOutputRaw" || keys[1] !== "status") {
      throw new Error(`${label} available keys are not exact`);
    }
    const quotedOutputRaw = positive(evidence, "quotedOutputRaw").toString();
    return { status, quotedOutputRaw };
  }
  if (status === "pool_manager_prefund_required") {
    const expected = [
      "errorFingerprint", "poolManagerBalanceRaw", "quotedOutputRaw", "requiredHookFeeRaw", "status",
    ];
    const keys = Object.keys(evidence).sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      throw new Error(`${label} prefund-proof keys are not exact`);
    }
    if (evidence.quotedOutputRaw !== "0") throw new Error(`${label} prefund-proof quotedOutputRaw must be exactly 0`);
    const errorFingerprint = hash(evidence, "errorFingerprint");
    const poolManagerBalance = decimal(evidence, "poolManagerBalanceRaw");
    const requiredHookFee = positive(evidence, "requiredHookFeeRaw");
    if (poolManagerBalance >= requiredHookFee) {
      throw new Error(`${label} must prove PoolManager balance below the required Hook fee`);
    }
    return {
      status,
      quotedOutputRaw: "0",
      errorFingerprint,
      poolManagerBalanceRaw: poolManagerBalance.toString(),
      requiredHookFeeRaw: requiredHookFee.toString(),
    };
  }
  if (status === "unquoted_adversarial_execution") {
    const keys = Object.keys(evidence).sort();
    if (keys.length !== 3 || keys[0] !== "quotedOutputRaw" || keys[1] !== "reason" || keys[2] !== "status") {
      throw new Error(`${label} unquoted-adversarial keys are not exact`);
    }
    if (evidence.quotedOutputRaw !== "0") {
      throw new Error(`${label} unquoted-adversarial quotedOutputRaw must be exactly 0`);
    }
    const reason = text(evidence, "reason");
    if (!(TREASURY_RANGE_UNQUOTED_ADVERSARIAL_REASONS as readonly string[]).includes(reason)) {
      throw new Error(`${label} unquoted-adversarial reason is unsupported`);
    }
    return {
      status,
      quotedOutputRaw: "0",
      reason: reason as TreasuryRangeUnquotedAdversarialReason,
    };
  }
  throw new Error(`${label} status is unsupported`);
}

function requireQuotedOrPrefundEvidence(
  row: Readonly<Record<string, unknown>>,
  key: string,
): Exclude<TreasuryRangeQuoteEvidence, { status: "unquoted_adversarial_execution" }> {
  const evidence = assertTreasuryRangeQuoteEvidence(row[key], `Evidence ${key}`);
  if (evidence.status === "unquoted_adversarial_execution") {
    throw new Error(`Evidence ${key} must be quoted or carry exact PoolManager-prefund proof`);
  }
  return evidence;
}

function requireQuotedOrPrefundEvidenceArray(
  row: Readonly<Record<string, unknown>>,
  key: string,
  count: number,
): readonly TreasuryRangeQuoteEvidence[] {
  const value = row[key];
  if (!Array.isArray(value) || value.length !== count) {
    throw new Error(`Evidence ${key} must contain exactly ${count} quote-evidence entries`);
  }
  return value.map((entry, index) => {
    const evidence = assertTreasuryRangeQuoteEvidence(entry, `Evidence ${key}[${index}]`);
    if (evidence.status === "unquoted_adversarial_execution") {
      throw new Error(`Evidence ${key}[${index}] must be quoted or carry exact PoolManager-prefund proof`);
    }
    return evidence;
  });
}

function requireUnquotedAdversarialEvidenceArray(
  row: Readonly<Record<string, unknown>>,
  key: string,
  count: number,
  expectedReason: TreasuryRangeUnquotedAdversarialReason,
): void {
  const value = row[key];
  if (!Array.isArray(value) || value.length !== count) {
    throw new Error(`Evidence ${key} must contain exactly ${count} unquoted-adversarial entries`);
  }
  value.forEach((entry, index) => {
    const evidence = assertTreasuryRangeQuoteEvidence(entry, `Evidence ${key}[${index}]`);
    if (evidence.status !== "unquoted_adversarial_execution" || evidence.reason !== expectedReason) {
      throw new Error(`Evidence ${key}[${index}] must use unquoted reason ${expectedReason}`);
    }
  });
}

function strings(row: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const value = row[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Evidence ${key} must be a string array`);
  }
  return value;
}

function exactKeys(
  row: Readonly<Record<string, unknown>>,
  scenarioKeys: readonly string[],
  label: string,
): void {
  const expected = new Set([...COMMON_ROW_KEYS, ...scenarioKeys]);
  const actual = Object.keys(row);
  const unexpected = actual.filter((key) => !expected.has(key));
  const missing = [...expected].filter((key) => !Object.prototype.hasOwnProperty.call(row, key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(`${label} evidence keys are not exact`);
  }
}

function executed(row: Readonly<Record<string, unknown>>, key = "status"): void {
  if (row[key] !== "executed") throw new Error(`Evidence ${key} must be executed`);
}

function exactExecutionStatuses(
  row: Readonly<Record<string, unknown>>,
  key: string,
  count: number,
): void {
  const statuses = strings(row, key);
  if (statuses.length !== count || statuses.some((status) => status !== "executed")) {
    throw new Error(`Evidence ${key} must contain exactly ${count} executed statuses`);
  }
}

function requireExecutedSwap(row: Readonly<Record<string, unknown>>, expectedInput: bigint): void {
  executed(row);
  if (positive(row, "grossInputRaw") !== expectedInput || positive(row, "outputRaw") <= 0n) {
    throw new Error("Required matrix swap input/output is inconsistent");
  }
  hash(row, "transactionHash");
  positive(row, "transactionBlockNumber");
  decimal(row, "hookVaultFeeRaw");
  decimal(row, "lpFeeRaw");
  positive(row, "gasUsed");
  signed(row, "startTick");
  signed(row, "endTick");
}

function rowKey(row: Readonly<Record<string, unknown>>): string {
  const scenario = text(row, "scenario");
  const kind = text(row, "kind");
  if (scenario === "SENSITIVITY" && kind === "one_sided_price_band") return `${scenario}:${kind}:${text(row, "movementBps")}`;
  if (scenario === "A" && kind === "single_buy") return `${scenario}:${kind}:${text(row, "sizeUsdc")}`;
  if (scenario === "A" && kind === "independent_sell") return `${scenario}:${kind}:${text(row, "sizeNara")}`;
  if (scenario === "G" && kind === "acquired_inventory_sell_fraction") return `${scenario}:${kind}:${text(row, "fractionBps")}`;
  return `${scenario}:${kind}`;
}

function requiredRowKeys(): ReadonlySet<string> {
  return new Set([
    "SENSITIVITY:one_sided_price_band:-2000",
    "SENSITIVITY:one_sided_price_band:+2000",
    ...REQUIRED_TREASURY_BUY_SIZES_USDC.map((size) => `A:single_buy:${size}`),
    ...REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA.map((size) => `A:independent_sell:${size}`),
    "B:same_block_transactions",
    "C:same_transaction_actions",
    "D:cross_block_pressure_reset",
    "E:buy_settle_sell",
    "F:atomic_buy_reverse_no_settlement_window",
    "G:buy_reverse_without_settlement",
    "H:buy_settle_reverse",
    ...REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS.map((fraction) => `G:acquired_inventory_sell_fraction:${fraction}`),
    "H:bid_settlement_after_independent_sell",
  ]);
}

function validateScenarioRow(row: Readonly<Record<string, unknown>>, key: string): void {
  if (key.startsWith("SENSITIVITY:")) {
    exactKeys(row, ["scenario", "kind", "movementBps", "spotNumerator", "spotDenominator", "orders"], key);
    positive(row, "spotNumerator");
    positive(row, "spotDenominator");
    const orders = row.orders;
    if (!Array.isArray(orders) || orders.length === 0 || !orders.every((entry) => object(entry, "sensitivity order").oneSidedAcrossFullBand === true)) {
      throw new Error("Sensitivity evidence must keep every order one-sided");
    }
    return;
  }
  if (key.startsWith("A:single_buy:")) {
    exactKeys(row, [
      "scenario", "kind", "sizeUsdc", "status", "transactionHash", "transactionBlockNumber",
      "grossInputRaw", "outputRaw", "hookVaultFeeRaw", "lpFeeRaw", "gasUsed", "startTick", "endTick",
      "quoteEvidence",
    ], key);
    requireExecutedSwap(row, BigInt(text(row, "sizeUsdc")) * USDC_UNIT);
    requireQuotedOrPrefundEvidence(row, "quoteEvidence");
    return;
  }
  if (key.startsWith("A:independent_sell:")) {
    exactKeys(row, [
      "scenario", "kind", "sizeNara", "status", "transactionHash", "transactionBlockNumber",
      "grossInputRaw", "outputRaw", "hookVaultFeeRaw", "lpFeeRaw", "gasUsed", "startTick", "endTick",
      "quoteEvidence",
    ], key);
    requireExecutedSwap(row, BigInt(text(row, "sizeNara")) * NARA_UNIT);
    requireQuotedOrPrefundEvidence(row, "quoteEvidence");
    return;
  }
  if (key === "B:same_block_transactions") {
    exactKeys(row, [
      "scenario", "kind", "sizeEachUsdc", "transactionStatuses", "transactionHashes",
      "transactionBlockNumbers", "hookFeesRaw", "gasUsed", "executionQuoteEvidence",
    ], key);
    const hashes = strings(row, "transactionHashes");
    const blocks = strings(row, "transactionBlockNumbers");
    const fees = strings(row, "hookFeesRaw");
    const gas = strings(row, "gasUsed");
    exactExecutionStatuses(row, "transactionStatuses", 2);
    if (hashes.length !== 2 || blocks.length !== 2 || fees.length !== 2 || gas.length !== 2
        || !hashes.every((value) => ethers.isHexString(value, 32))
        || blocks[0] !== blocks[1] || blocks.some((value) => !/^\d+$/.test(value) || BigInt(value) === 0n)
        || fees.some((value) => !/^\d+$/.test(value)) || gas.some((value) => !/^\d+$/.test(value) || BigInt(value) === 0n)) {
      throw new Error("Same-block evidence is malformed");
    }
    requireUnquotedAdversarialEvidenceArray(
      row, "executionQuoteEvidence", 2, "same_block_transactions",
    );
    return;
  }
  if (key === "C:same_transaction_actions") {
    exactKeys(row, [
      "scenario", "kind", "sizeEachUsdc", "status", "transactionHash", "transactionBlockNumber",
      "hookFeesRaw", "gasUsed", "executionQuoteEvidence",
    ], key);
    executed(row);
    hash(row, "transactionHash");
    positive(row, "transactionBlockNumber");
    if (strings(row, "hookFeesRaw").length !== 2 || positive(row, "gasUsed") === 0n) throw new Error("Same-transaction evidence is malformed");
    requireUnquotedAdversarialEvidenceArray(
      row, "executionQuoteEvidence", 2, "same_transaction_actions",
    );
    return;
  }
  if (key === "D:cross_block_pressure_reset") {
    exactKeys(row, [
      "scenario", "kind", "transactionStatuses", "transactionHashes", "transactionBlockNumbers",
      "hookFeesRaw", "blocks", "quoteEvidence",
    ], key);
    const hashes = strings(row, "transactionHashes");
    const blocks = strings(row, "transactionBlockNumbers").map(BigInt);
    const duplicatedBlocks = strings(row, "blocks").map(BigInt);
    exactExecutionStatuses(row, "transactionStatuses", 2);
    if (hashes.length !== 2 || !hashes.every((value) => ethers.isHexString(value, 32)) || blocks.length !== 2 || blocks[1] <= blocks[0]
        || duplicatedBlocks.length !== 2 || duplicatedBlocks.some((value, index) => value !== blocks[index])
        || strings(row, "hookFeesRaw").length !== 2) throw new Error("Cross-block reset evidence is malformed");
    requireQuotedOrPrefundEvidenceArray(row, "quoteEvidence", 2);
    return;
  }
  if (key === "E:buy_settle_sell") {
    exactKeys(row, [
      "scenario", "kind", "settledOrderIds", "buyStatus", "settlementStatus", "sellStatus",
      "buyTransactionHash", "buyBlockNumber", "settlementTransactionHash", "settlementBlockNumber",
      "sellTransactionHash", "sellBlockNumber", "rangePrincipalUsdcRaw", "rangeLpFeesUsdcRaw",
      "nearMarketNaraSoldRaw", "permanentPolUnchanged", "safeUsdcDeltaRaw", "hookVaultUsdcFeeRaw",
      "buyHookFeeRaw", "buyLpFeeRaw", "sellHookFeeRaw", "sellLpFeeRaw", "safeNaraDeltaRaw",
      "fullSafeUsdcDeltaRaw", "vaultNaraDeltaRaw", "vaultUsdcDeltaRaw", "unsettledInventory",
      "buyGasUsed", "settleGasUsed", "sellGasUsed", "buyQuoteEvidence", "sellQuoteEvidence",
    ], key);
    executed(row, "buyStatus");
    executed(row, "settlementStatus");
    executed(row, "sellStatus");
    for (const field of ["buyTransactionHash", "settlementTransactionHash", "sellTransactionHash"]) hash(row, field);
    for (const field of ["buyBlockNumber", "settlementBlockNumber", "sellBlockNumber"]) positive(row, field);
    if (strings(row, "settledOrderIds").length === 0 || row.permanentPolUnchanged !== true) throw new Error("Settlement evidence is incomplete");
    const safeDelta = decimal(row, "safeUsdcDeltaRaw");
    const principal = decimal(row, "rangePrincipalUsdcRaw");
    const fees = decimal(row, "rangeLpFeesUsdcRaw");
    decimal(row, "nearMarketNaraSoldRaw");
    if (safeDelta !== principal + fees) throw new Error("Settlement USDC delta does not reconcile to principal plus fees");
    requireQuotedOrPrefundEvidence(row, "buyQuoteEvidence");
    requireQuotedOrPrefundEvidence(row, "sellQuoteEvidence");
    return;
  }
  if (key === "F:atomic_buy_reverse_no_settlement_window") {
    exactKeys(row, [
      "scenario", "kind", "status", "transactionHash", "transactionBlockNumber", "swapCount",
      "gasUsed", "limitationObserved", "sizingQuoteEvidence", "executionQuoteEvidence",
    ], key);
    executed(row);
    hash(row, "transactionHash");
    positive(row, "transactionBlockNumber");
    if (row.swapCount !== 2 || row.limitationObserved !== true || positive(row, "gasUsed") === 0n) throw new Error("Atomic reversal evidence is malformed");
    requireQuotedOrPrefundEvidence(row, "sizingQuoteEvidence");
    requireUnquotedAdversarialEvidenceArray(row, "executionQuoteEvidence", 2, "atomic_buy_reverse");
    return;
  }
  if (key === "G:buy_reverse_without_settlement") {
    exactKeys(row, [
      "scenario", "kind", "buyStatus", "sellStatus", "buyTransactionHash", "buyBlockNumber",
      "sellTransactionHash", "sellBlockNumber", "roundTripLossUsdcRaw", "unsettledOrderCount",
      "buyHookFeeRaw", "buyLpFeeRaw", "sellHookFeeRaw", "sellLpFeeRaw", "safeNaraDeltaRaw",
      "safeUsdcDeltaRaw", "vaultNaraDeltaRaw", "vaultUsdcDeltaRaw", "unsettledInventory",
      "buyQuoteEvidence", "sellQuoteEvidence",
    ], key);
    executed(row, "buyStatus");
    executed(row, "sellStatus");
    for (const field of ["buyTransactionHash", "sellTransactionHash"]) hash(row, field);
    for (const field of ["buyBlockNumber", "sellBlockNumber"]) positive(row, field);
    positive(row, "roundTripLossUsdcRaw");
    requireQuotedOrPrefundEvidence(row, "buyQuoteEvidence");
    requireQuotedOrPrefundEvidence(row, "sellQuoteEvidence");
    return;
  }
  if (key === "H:buy_settle_reverse") {
    exactKeys(row, [
      "scenario", "kind", "settledOrderIds", "buyStatus", "settlementStatus", "sellStatus",
      "buyTransactionHash", "buyBlockNumber", "settlementTransactionHash", "settlementBlockNumber",
      "sellTransactionHash", "sellBlockNumber", "roundTripLossUsdcRaw", "permanentPolUnchanged",
      "buyHookFeeRaw", "buyLpFeeRaw", "sellHookFeeRaw", "sellLpFeeRaw", "safeNaraDeltaRaw",
      "safeUsdcDeltaRaw", "vaultNaraDeltaRaw", "vaultUsdcDeltaRaw", "unsettledInventory",
      "buyQuoteEvidence", "sellQuoteEvidence",
    ], key);
    executed(row, "buyStatus");
    executed(row, "settlementStatus");
    executed(row, "sellStatus");
    for (const field of ["buyTransactionHash", "settlementTransactionHash", "sellTransactionHash"]) hash(row, field);
    for (const field of ["buyBlockNumber", "settlementBlockNumber", "sellBlockNumber"]) positive(row, field);
    if (strings(row, "settledOrderIds").length === 0 || row.permanentPolUnchanged !== true) throw new Error("Settled reversal evidence is incomplete");
    positive(row, "roundTripLossUsdcRaw");
    requireQuotedOrPrefundEvidence(row, "buyQuoteEvidence");
    requireQuotedOrPrefundEvidence(row, "sellQuoteEvidence");
    return;
  }
  if (key.startsWith("G:acquired_inventory_sell_fraction:")) {
    exactKeys(row, [
      "scenario", "kind", "fractionBps", "buyStatus", "sellStatus", "buyTransactionHash",
      "buyBlockNumber", "sellTransactionHash", "sellBlockNumber", "acquiredNaraRaw", "soldNaraRaw",
      "usdcOutputRaw", "buyQuoteEvidence", "sellQuoteEvidence",
    ], key);
    executed(row, "buyStatus");
    executed(row, "sellStatus");
    for (const field of ["buyTransactionHash", "sellTransactionHash"]) hash(row, field);
    for (const field of ["buyBlockNumber", "sellBlockNumber"]) positive(row, field);
    const acquired = positive(row, "acquiredNaraRaw");
    const sold = positive(row, "soldNaraRaw");
    const fraction = BigInt(text(row, "fractionBps"));
    if (sold !== acquired * fraction / 10_000n || positive(row, "usdcOutputRaw") === 0n) throw new Error("Acquired-inventory sell evidence is inconsistent");
    requireQuotedOrPrefundEvidence(row, "buyQuoteEvidence");
    requireQuotedOrPrefundEvidence(row, "sellQuoteEvidence");
    return;
  }
  if (key === "H:bid_settlement_after_independent_sell") {
    exactKeys(row, [
      "scenario", "kind", "sellStatus", "settlementStatus", "sellTransactionHash", "sellBlockNumber",
      "settlementTransactionHash", "settlementBlockNumber",
      "settledOrderIds", "treasuryNaraAccumulatedRaw", "sellQuoteEvidence",
    ], key);
    executed(row, "sellStatus");
    executed(row, "settlementStatus");
    hash(row, "sellTransactionHash");
    hash(row, "settlementTransactionHash");
    positive(row, "sellBlockNumber");
    positive(row, "settlementBlockNumber");
    const settled = strings(row, "settledOrderIds");
    if (settled.length === 0 || positive(row, "treasuryNaraAccumulatedRaw") === 0n) {
      throw new Error("Bid settlement evidence must prove settled orders and positive NARA accumulation");
    }
    requireQuotedOrPrefundEvidence(row, "sellQuoteEvidence");
    return;
  }
  throw new Error(`Unsupported treasury range evidence row ${key}`);
}

function exactStrings(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} does not exactly match matrix-derived coverage`);
  }
}

export function assertTreasuryRangeMatrix(
  rows: readonly Readonly<Record<string, unknown>>[],
  expected?: Partial<TreasuryRangeEvidenceBinding>,
): VerifiedTreasuryRangeMatrix {
  const required = requiredRowKeys();
  if (rows.length !== required.size) throw new Error(`Treasury range matrix must contain exactly ${required.size} rows`);
  const first = object(rows[0], "matrix row 0");
  const common = {
    schemaVersion: text(first, "schemaVersion"),
    routeKind: text(first, "routeKind"),
    quotePolicy: text(first, "quotePolicy"),
    candidateId: text(first, "candidateId"),
    repositoryHead: text(first, "repositoryHead").toLowerCase(),
    chainId: decimal(first, "chainId"),
    blockNumber: decimal(first, "blockNumber"),
    blockHash: hash(first, "blockHash"),
    currentSqrtPriceX96: positive(first, "currentSqrtPriceX96"),
    currentTick: signed(first, "currentTick"),
    hookConfigurationHash: hash(first, "hookConfigurationHash"),
    humanUsdcPerNara: {
      numerator: positive(first, "humanUsdcPerNaraNumerator"),
      denominator: positive(first, "humanUsdcPerNaraDenominator"),
    },
    matrixHash: hash(first, "matrixHash"),
  };
  if (common.schemaVersion !== TREASURY_RANGE_MATRIX_ROW_SCHEMA
      || common.routeKind !== TREASURY_RANGE_MATRIX_ROUTE_KIND
      || common.quotePolicy !== TREASURY_RANGE_MATRIX_QUOTE_POLICY
      || !/^(?:CONSERVATIVE|AGGRESSIVE|ADVERSARIAL)-\d+-NARA$/.test(common.candidateId)
      || !/^[0-9a-f]{40}$/.test(common.repositoryHead)
      || common.chainId === 0n || common.blockNumber === 0n) throw new Error("Treasury range matrix binding is invalid");
  if (expected?.candidateId !== undefined && common.candidateId !== expected.candidateId) throw new Error("Matrix candidate binding mismatch");
  if (expected?.repositoryHead !== undefined && common.repositoryHead !== expected.repositoryHead.toLowerCase()) throw new Error("Matrix repository binding mismatch");
  if (expected?.chainId !== undefined && common.chainId !== expected.chainId) throw new Error("Matrix chain binding mismatch");
  if (expected?.blockNumber !== undefined && common.blockNumber !== expected.blockNumber) throw new Error("Matrix block binding mismatch");
  if (expected?.blockHash !== undefined && common.blockHash !== expected.blockHash.toLowerCase()) throw new Error("Matrix block-hash binding mismatch");
  if (expected?.currentSqrtPriceX96 !== undefined && common.currentSqrtPriceX96 !== expected.currentSqrtPriceX96) throw new Error("Matrix sqrt-price binding mismatch");
  if (expected?.currentTick !== undefined && common.currentTick !== expected.currentTick) throw new Error("Matrix tick binding mismatch");
  if (expected?.hookConfigurationHash !== undefined && common.hookConfigurationHash !== expected.hookConfigurationHash.toLowerCase()) {
    throw new Error("Matrix Hook-configuration binding mismatch");
  }
  if (expected?.humanUsdcPerNara !== undefined
      && (common.humanUsdcPerNara.numerator !== expected.humanUsdcPerNara.numerator
        || common.humanUsdcPerNara.denominator !== expected.humanUsdcPerNara.denominator)) {
    throw new Error("Matrix human-price binding mismatch");
  }
  const unhashedRows = rows.map((raw, index) => {
    const row = object(raw, `matrix row ${index}`);
    if (text(row, "schemaVersion") !== common.schemaVersion
        || text(row, "routeKind") !== common.routeKind || text(row, "quotePolicy") !== common.quotePolicy
        || text(row, "candidateId") !== common.candidateId
        || text(row, "repositoryHead").toLowerCase() !== common.repositoryHead || decimal(row, "chainId") !== common.chainId
        || decimal(row, "blockNumber") !== common.blockNumber || hash(row, "blockHash") !== common.blockHash
        || decimal(row, "currentSqrtPriceX96") !== common.currentSqrtPriceX96
        || signed(row, "currentTick") !== common.currentTick
        || hash(row, "hookConfigurationHash") !== common.hookConfigurationHash
        || decimal(row, "humanUsdcPerNaraNumerator") !== common.humanUsdcPerNara.numerator
        || decimal(row, "humanUsdcPerNaraDenominator") !== common.humanUsdcPerNara.denominator
        || hash(row, "matrixHash") !== common.matrixHash) throw new Error(`Matrix row ${index} binding mismatch`);
    const { matrixHash: _matrixHash, ...withoutHash } = row;
    return withoutHash;
  });
  const recomputedHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(unhashedRows))).toLowerCase();
  if (recomputedHash !== common.matrixHash) throw new Error("Treasury range matrix hash mismatch");
  const keyed = new Map<string, Readonly<Record<string, unknown>>>();
  for (const row of rows) {
    const key = rowKey(row);
    if (!required.has(key)) throw new Error(`Unexpected treasury range evidence row ${key}`);
    if (keyed.has(key)) throw new Error(`Duplicate treasury range evidence row ${key}`);
    validateScenarioRow(row, key);
    keyed.set(key, row);
  }
  for (const key of required) if (!keyed.has(key)) throw new Error(`Missing treasury range evidence row ${key}`);
  const unsettledLoss = positive(keyed.get("G:buy_reverse_without_settlement")!, "roundTripLossUsdcRaw");
  const settledLoss = positive(keyed.get("H:buy_settle_reverse")!, "roundTripLossUsdcRaw");
  if (settledLoss <= unsettledLoss) throw new Error("Settled round-trip loss must exceed the no-settlement control");

  let maximumObservedSlippageBps = 0n;
  for (const size of REQUIRED_TREASURY_BUY_SIZES_USDC) {
    const row = keyed.get(`A:single_buy:${size}`)!;
    const inputUsdcRaw = positive(row, "grossInputRaw");
    const actualNaraRaw = positive(row, "outputRaw");
    const idealNaraRaw = inputUsdcRaw * 10n ** 12n
      * common.humanUsdcPerNara.denominator / common.humanUsdcPerNara.numerator;
    const slippage = actualNaraRaw >= idealNaraRaw ? 0n : (idealNaraRaw - actualNaraRaw) * 10_000n / idealNaraRaw;
    if (slippage > maximumObservedSlippageBps) maximumObservedSlippageBps = slippage;
  }
  return {
    ...common,
    routeKind: TREASURY_RANGE_MATRIX_ROUTE_KIND,
    quotePolicy: TREASURY_RANGE_MATRIX_QUOTE_POLICY,
    crystallizedUsdc: decimal(keyed.get("E:buy_settle_sell")!, "safeUsdcDeltaRaw"),
    treasuryNaraAccumulated: decimal(keyed.get("H:bid_settlement_after_independent_sell")!, "treasuryNaraAccumulatedRaw"),
    nearMarketNaraSold: decimal(keyed.get("E:buy_settle_sell")!, "nearMarketNaraSoldRaw"),
    nextTransactionRoundTripLossUsdc: settledLoss,
    maximumObservedSlippageBps,
    quoteFailures: 0n,
  };
}

export function assertTreasuryRangeCandidateEvidence(
  claims: TreasuryRangeEvidenceClaims,
  expected: TreasuryRangeEvidenceBinding,
): VerifiedTreasuryRangeMatrix {
  if (claims.candidateId !== expected.candidateId || claims.exactForkValidated !== true || claims.exactInputOnly !== true) {
    throw new Error("Candidate evidence is not exact-fork/exact-input validated");
  }
  const verified = assertTreasuryRangeMatrix(claims.matrix, expected);
  if (claims.matrixHash.toLowerCase() !== verified.matrixHash) throw new Error("Candidate matrixHash mismatch");
  exactStrings(claims.scenarioCoverage, [...REQUIRED_TREASURY_RANGE_SCENARIOS], "scenarioCoverage");
  exactStrings(claims.buySizeCoverageUsdc, REQUIRED_TREASURY_BUY_SIZES_USDC.map(String), "buySizeCoverageUsdc");
  exactStrings(claims.independentSellSizeCoverageNara, REQUIRED_TREASURY_INDEPENDENT_SELL_SIZES_NARA.map(String), "independentSellSizeCoverageNara");
  exactStrings(claims.acquiredSellFractionCoverageBps, REQUIRED_TREASURY_ACQUIRED_SELL_FRACTIONS_BPS.map(String), "acquiredSellFractionCoverageBps");
  const normalEntries = Object.entries(claims.normalBuyExecution).sort(([left], [right]) => BigInt(left) < BigInt(right) ? -1 : 1);
  const expectedNormal = REQUIRED_TREASURY_BUY_SIZES_USDC.map((size) => [size.toString(), true] as const);
  if (normalEntries.length !== expectedNormal.length
      || normalEntries.some(([size, success], index) => size !== expectedNormal[index][0] || success !== true)) {
    throw new Error("normalBuyExecution does not exactly match successful matrix rows");
  }
  for (const field of [
    "crystallizedUsdc", "treasuryNaraAccumulated", "nearMarketNaraSold",
    "nextTransactionRoundTripLossUsdc", "maximumObservedSlippageBps", "quoteFailures",
  ] as const) {
    if (claims[field] !== verified[field]) throw new Error(`Candidate ${field} does not match matrix-derived value`);
  }
  return verified;
}
