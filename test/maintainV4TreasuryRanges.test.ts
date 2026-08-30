import { expect } from "chai";
import { ethers } from "ethers";
import { treasuryRangeHookConfigurationHash } from "../scripts/lib/v4TreasuryRangeManifest.js";
import {
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
