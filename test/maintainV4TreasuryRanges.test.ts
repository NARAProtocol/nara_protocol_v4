import { expect } from "chai";
import { ethers } from "ethers";
import { treasuryRangeHookConfigurationHash } from "../scripts/lib/v4TreasuryRangeManifest.js";
import {
  assertTreasuryRangeCanonicalCanaryOrders,
  assertTreasuryRangeCanaryFundingBalances,
  assertTreasuryRangeManifestMatrixContext,
  type TreasuryRangeStrategyOrder,
} from "../scripts/lib/v4TreasuryRangeManifest.js";
import {
  buildDeterministicStrategyProfiles,
  rescaleStrategyProfile,
  TREASURY_RANGE_CANARY_NARA_BUDGET,
} from "../scripts/lib/v4TreasuryRangePlanner.js";
import {
  formatRational,
  humanUsdcPerNaraToSqrtPriceX96,
  parseDecimalRational,
  sqrtPriceX96ToHumanUsdcPerNara,
} from "../scripts/lib/v4TreasuryRangeMath.js";
import {
  assertTreasuryRangePinnedBlockFreshness,
  createTreasuryRangeProvider,
  isTreasuryRangeOneSided,
  sqrtPriceX96AtTick,
} from "../scripts/lib/v4TreasuryRangeSafeBuilder.js";
import { readSettlerConfig } from "../services/v4-treasury-range-settler/src/config.js";
import { safeErrorCode } from "../services/v4-treasury-range-settler/src/logging.js";

const HASH = `0x${"22".repeat(32)}`;
const TEST_KEY = `0x${"11".repeat(32)}`;

function settlerEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    PRIMARY_BASE_WS_RPC: "wss://primary.example/ws",
    SECONDARY_BASE_WS_RPC: "wss://secondary.example/ws",
    FALLBACK_BASE_HTTP_RPC: "https://fallback.example/rpc",
    RANGE_MANAGER_ADDRESS: "0x1111111111111111111111111111111111111111",
    RANGE_MANAGER_RUNTIME_CODE_HASH: HASH,
    RANGE_MANAGER_DEPLOYMENT_BLOCK: "1",
    HOOK_CONFIGURATION_HASH: HASH,
    USDC_RUNTIME_CODE_HASH: HASH,
    USDC_READER_RUNTIME_CODE_HASH: HASH,
    USDC_IMPLEMENTATION_ADDRESS: "0x2222222222222222222222222222222222222222",
    USDC_IMPLEMENTATION_RUNTIME_CODE_HASH: HASH,
    USDC_PROXY_ADMIN: "0x3333333333333333333333333333333333333333",
    USDC_OWNER: "0x4444444444444444444444444444444444444444",
    USDC_PAUSER: "0x5555555555555555555555555555555555555555",
    USDC_BLACKLISTER: "0x6666666666666666666666666666666666666666",
    POOL_MANAGER_RUNTIME_CODE_HASH: HASH,
    POSITION_MANAGER_RUNTIME_CODE_HASH: HASH,
    PERMIT2_RUNTIME_CODE_HASH: HASH,
    SETTLER_PRIVATE_KEY: TEST_KEY,
    SETTLER_EXPECTED_ADDRESS: new ethers.Wallet(TEST_KEY).address,
    SETTLER_INSTANCE_ID: "range-settler-test",
    HEARTBEAT_URL: "https://heartbeat.example/status",
    ALERT_WEBHOOK_URL: "https://alerts.example/status",
    MIN_GAS_BALANCE_WEI: "1",
    CONFIRMATIONS: "3",
    ...overrides,
  };
}

describe("v4 treasury range operations", function () {
  const hookConfigurationHash = `0x${"44".repeat(32)}`;
  const currentSqrtPriceX96 = humanUsdcPerNaraToSqrtPriceX96(parseDecimalRational("0.0847"));
  const canonicalProfile = rescaleStrategyProfile(buildDeterministicStrategyProfiles({
    currentSqrtPriceX96,
    creationDeadline: 1n,
    hookConfigurationHash,
    tickSpacing: 60n,
  }).find((profile) => profile.name === "CONSERVATIVE")!, TREASURY_RANGE_CANARY_NARA_BUDGET, 60n);
  const canonicalOrders: TreasuryRangeStrategyOrder[] = canonicalProfile.orders.map((order) => ({
    side: order.side,
    humanPriceLower: formatRational(order.requestedLowerUsdcPerNara, 18),
    humanPriceUpper: formatRational(order.requestedUpperUsdcPerNara, 18),
    tickLower: Number(order.tickLower),
    tickUpper: Number(order.tickUpper),
    inputAmountRaw: order.inputAmount.toString(),
    expectedOutputAmountRaw: order.expectedPrincipalOutput.toString(),
    minimumOutputAmountRaw: order.minimumOutputAmount.toString(),
    expectedLiquidity: order.expectedLiquidity.toString(),
    expectedDustNaraRaw: (order.side === "SELL_NARA" ? order.expectedRoundingDust : 0n).toString(),
    expectedDustUsdcRaw: (order.side === "BUY_NARA" ? order.expectedRoundingDust : 0n).toString(),
    toleranceBps: Number(order.toleranceBps),
    enabled: true,
  }));
  const canonicalOrderContext = (proposedOrders: readonly TreasuryRangeStrategyOrder[]) => ({
    proposedOrders,
    currentSlot0: { sqrtPriceX96: currentSqrtPriceX96.toString(), tick: 0 },
    hookConfigurationHash,
    poolKey: { tickSpacing: 60 },
  });

  it("disables JSON-RPC batching for packet construction", function () {
    const provider = createTreasuryRangeProvider("https://rpc.example");
    try {
      expect(provider._getOption("batchMaxCount")).to.equal(1);
    } finally {
      provider.destroy();
    }
  });

  it("rejects a stale pinned block even when a manifest forges a fresh timestamp", function () {
    const pinnedTimestamp = 1_000_000;
    const latestTimestamp = pinnedTimestamp + 15 * 60 + 1;
    expect(() => assertTreasuryRangePinnedBlockFreshness({
      chainId: "8453",
      blockNumber: 123,
      blockHash: HASH,
      timestamp: latestTimestamp,
    }, {
      number: 456,
      hash: `0x${"33".repeat(32)}`,
      timestamp: latestTimestamp,
    }, {
      number: 123,
      hash: HASH,
      timestamp: pinnedTimestamp,
    })).to.throw(/timestamp does not match/);
    expect(() => assertTreasuryRangePinnedBlockFreshness({
      chainId: "8453",
      blockNumber: 123,
      blockHash: HASH,
      timestamp: pinnedTimestamp,
    }, {
      number: 456,
      hash: `0x${"33".repeat(32)}`,
      timestamp: latestTimestamp,
    }, {
      number: 123,
      hash: HASH,
      timestamp: pinnedTimestamp,
    })).to.throw(/snapshot is stale/);
    expect(() => assertTreasuryRangePinnedBlockFreshness({
      chainId: "8453",
      blockNumber: 123,
      blockHash: `0x${"99".repeat(32)}`,
      timestamp: latestTimestamp,
    }, {
      number: 456,
      hash: `0x${"33".repeat(32)}`,
      timestamp: latestTimestamp,
    }, {
      number: 123,
      hash: HASH,
      timestamp: latestTimestamp,
    })).to.throw(/no longer canonical/);
  });

  it("requires the full 500 USDC and 100,000 NARA Safe funding boundary", function () {
    const allocation = {
      requiredNara: TREASURY_RANGE_CANARY_NARA_BUDGET,
      requiredUsdc: 500_000_000n,
      exposedUsdc: 200_000_000n,
      protectedUsdc: 300_000_000n,
    };
    expect(() => assertTreasuryRangeCanaryFundingBalances(allocation, {
      nara: TREASURY_RANGE_CANARY_NARA_BUDGET,
      usdc: 499_999_999n,
    })).to.throw(/Safe USDC balance is below/);
    expect(() => assertTreasuryRangeCanaryFundingBalances(allocation, {
      nara: TREASURY_RANGE_CANARY_NARA_BUDGET,
      usdc: 500_000_000n,
    })).not.to.throw();
    expect(() => assertTreasuryRangeCanaryFundingBalances(allocation, {
      nara: TREASURY_RANGE_CANARY_NARA_BUDGET - 1n,
      usdc: 500_000_000n,
    })).to.throw(/Safe NARA balance is below/);
  });

  it("rejects noncanonical launch-order lineage before fork or packet construction", function () {
    expect(() => assertTreasuryRangeCanonicalCanaryOrders(canonicalOrderContext(canonicalOrders))).not.to.throw();
    expect(() => assertTreasuryRangeCanonicalCanaryOrders(canonicalOrderContext([
      ...canonicalOrders,
      { ...canonicalOrders[0], enabled: false },
    ]))).to.throw(/order set is not canonical/);
    expect(() => assertTreasuryRangeCanonicalCanaryOrders(canonicalOrderContext(canonicalOrders.map((order, index) => index === 0
      ? { ...order, orderId: "1" }
      : order)))).to.throw(/order set is not canonical/);
    expect(() => assertTreasuryRangeCanonicalCanaryOrders(canonicalOrderContext(canonicalOrders.map((order, index) => index === 0
      ? { ...order, humanPriceLower: "0.000000000000000001" }
      : order)))).to.throw(/not the canonical canary order/);
    expect(() => assertTreasuryRangeCanonicalCanaryOrders(canonicalOrderContext([
      canonicalOrders[1], canonicalOrders[0], ...canonicalOrders.slice(2),
    ]))).to.throw(/not the canonical canary order/);
  });

  it("binds matrix price, tick, and Hook context to the manifest slot", function () {
    const manifestContext = {
      currentSlot0: { sqrtPriceX96: currentSqrtPriceX96.toString(), tick: 301_000 },
      hookConfigurationHash,
    };
    const verifiedContext = {
      currentSqrtPriceX96,
      currentTick: 301_000n,
      hookConfigurationHash,
      humanUsdcPerNara: sqrtPriceX96ToHumanUsdcPerNara(currentSqrtPriceX96),
    };
    expect(() => assertTreasuryRangeManifestMatrixContext(manifestContext, verifiedContext)).not.to.throw();
    expect(() => assertTreasuryRangeManifestMatrixContext(manifestContext, {
      ...verifiedContext,
      currentSqrtPriceX96: currentSqrtPriceX96 + 1n,
    })).to.throw(/slot context/);
    expect(() => assertTreasuryRangeManifestMatrixContext(manifestContext, {
      ...verifiedContext,
      currentTick: 301_001n,
    })).to.throw(/slot context/);
    expect(() => assertTreasuryRangeManifestMatrixContext(manifestContext, {
      ...verifiedContext,
      hookConfigurationHash: `0x${"55".repeat(32)}`,
    })).to.throw(/Hook context/);
    expect(() => assertTreasuryRangeManifestMatrixContext(manifestContext, {
      ...verifiedContext,
      humanUsdcPerNara: { numerator: 1n, denominator: 1n },
    })).to.throw(/human price/);
  });

  it("uses the inverse NARA-price/tick orientation at exact boundaries", function () {
    const lower = 291_960;
    const upper = 295_980;

    expect(isTreasuryRangeOneSided("SELL_NARA", sqrtPriceX96AtTick(upper), lower, upper)).to.equal(true);
    expect(isTreasuryRangeOneSided("SELL_NARA", sqrtPriceX96AtTick(upper) - 1n, lower, upper)).to.equal(false);
    expect(isTreasuryRangeOneSided("BUY_NARA", sqrtPriceX96AtTick(lower), lower, upper)).to.equal(true);
    expect(isTreasuryRangeOneSided("BUY_NARA", sqrtPriceX96AtTick(lower) + 1n, lower, upper)).to.equal(false);
  });

  it("never configures a settler batch above the contract cap", function () {
    expect(() => readSettlerConfig(settlerEnvironment({ SETTLER_MAX_SETTLEMENT_BATCH: "17" })))
      .to.throw("SETTLER_MAX_SETTLEMENT_BATCH");
    expect(readSettlerConfig(settlerEnvironment({ SETTLER_MAX_SETTLEMENT_BATCH: "16" })).maxSettlementBatch)
      .to.equal(16);
  });

  it("keeps operational error messages actionable without exposing arbitrary text", function () {
    expect(safeErrorCode(new Error("HOOK_CONFIGURATION_CHANGED"))).to.equal("HOOK_CONFIGURATION_CHANGED");
    expect(safeErrorCode(new Error("RPC URL https://secret.example/key"))).to.equal("Error");
  });

  it("binds Hook evidence independently of input ordering", function () {
    const left = [
      { label: "hook.sellCurve", expected: ["500", "1500", "3000"] },
      { label: "hook.buyCurve", expected: ["500", "1500", "3000"] },
    ];
    const right = [...left].reverse();

    expect(treasuryRangeHookConfigurationHash(left)).to.equal(treasuryRangeHookConfigurationHash(right));
  });
});
